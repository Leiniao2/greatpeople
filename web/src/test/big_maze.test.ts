// The labyrinth finale: big generated corridor mazes with keys, doors,
// relics and prowlers.  Every labyrinth must be solvable (BFS over position
// and keys held), the stored solution must replay through the engine, the
// doors must genuinely block, and the prowlers must obey walls and doors.
import { createElement } from 'react'
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import BigMazeGame, { generateLevel } from '@/components/minigames/BigMazeGame'
import type { Difficulty } from '@/games/types'
import {
  CONFIGS, CONFIG_IDS, generateLabyrinth, labSolve, labInitial, labMove, labHit, labSettings,
  levelPlan, settings, stepMonsters, initialMonsters, resolveMazeConfig, type Labyrinth, type LabState,
} from '@/components/minigames/BigMazeGame'
import { mulberry32 } from '@/components/minigames/_shared'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 1006, 1018]
const FINALE = CONFIG_IDS.filter(id => CONFIGS[id].finale)

const open = (lab: Labyrinth, r: number, c: number) => r >= 0 && c >= 0 && r < lab.n && c < lab.n && !lab.walls[r * lab.n + c]

describe('labyrinth finale', () => {
  it('the big configs end on a labyrinth after their physics levels', () => {
    for (const id of ['pyramid-deep', 'cedar-forest', 'everest-summit', 'everest-peak', 'long-march', 'pacific-strait'])
      expect(FINALE, id).toContain(id)
    for (const id of FINALE) for (const d of DIFFS) {
      const plan = levelPlan(CONFIGS[id], d)
      expect(plan[plan.length - 1], `${id} d${d}`).toBe('labyrinth')
      expect(plan.length, `${id} d${d}`).toBe(settings(CONFIGS[id], d).levels + 1)
      expect(plan.length, `${id} d${d}`).toBeGreaterThanOrEqual(2)
    }
    expect(levelPlan(resolveMazeConfig('mulan', { mode: 'labyrinth' }), 2)).toEqual(['labyrinth'])
  })

  for (const id of FINALE) {
    for (const d of DIFFS) {
      it(`${id} at difficulty ${d}: solvable, replayable and gated for ${SEEDS.length} seeds`, () => {
        const ls = labSettings(CONFIGS[id], d)
        for (const seed of SEEDS) {
          const lab = generateLabyrinth(CONFIGS[id], d, seed)
          const tag = `${id} d${d} seed ${seed}`
          expect(lab.n % 2, tag).toBe(1)
          expect(lab.n, tag).toBe(ls.size)
          expect(lab.doors.length, tag).toBe(ls.doors)
          expect(lab.keys.length, tag).toBe(ls.doors)
          expect(lab.lives, tag).toBe(ls.lives)
          expect(lab.relics.length, tag).toBeGreaterThanOrEqual(1)
          expect(lab.monsters.length, tag).toBeGreaterThanOrEqual(1)
          for (const m of lab.monsters) {
            expect(open(lab, m[0], m[1]), tag).toBe(true)
            expect(Math.abs(m[0] - lab.start[0]) + Math.abs(m[1] - lab.start[1]), tag).toBeGreaterThanOrEqual(10)
          }

          const sol = labSolve(lab)
          expect(sol, tag).not.toBeNull()
          expect(lab.solution, tag).toEqual(sol)
          // A real journey: the route spans much of the maze.
          expect(sol!.length, tag).toBeGreaterThanOrEqual(lab.n * 1.5)

          // Replay through the engine.
          let st: LabState = labInitial(lab)
          for (const mv of sol!) {
            const next = labMove(lab, st, mv)
            expect(next, `${tag}: blocked step`).not.toBe(st)
            st = next
          }
          expect(st.status, tag).toBe('won')
          expect(st.keys, tag).toBe((1 << lab.keys.length) - 1)

          // Doors matter: with no keys usable, the exit cannot be reached.
          if (lab.doors.length) {
            expect(labSolve({ ...lab, keys: lab.keys.map(() => [-1, -1] as [number, number]) }), tag).toBeNull()
            // ...and each door needs its own key, not just any key.
            for (let i = 0; i < lab.keys.length; i++) {
              const keys = lab.keys.map((k, j) => (j === i ? [-1, -1] as [number, number] : k))
              expect(labSolve({ ...lab, keys }), `${tag} without key ${i}`).toBeNull()
            }
          }

          // Step budget only at D4, with generous slack.
          if (d === 4) expect(lab.budget, tag).toBeGreaterThanOrEqual(sol!.length * 2.5)
          else expect(lab.budget, tag).toBe(0)
          expect(lab.chase, tag).toBe(d >= 3)
          expect(lab.fog > 0, tag).toBe(d >= 3 || (d === 2 && CONFIGS[id].fog))
        }
      })
    }
  }

  it('never falls back to an easier board across a wide seed sweep', () => {
    for (const id of FINALE) for (const d of DIFFS) {
      const ls = labSettings(CONFIGS[id], d)
      for (let seed = 100; seed < 130; seed++) {
        const lab = generateLabyrinth(CONFIGS[id], d, seed)
        expect(lab.n, `${id} d${d} seed ${seed}`).toBe(ls.size)
        expect(lab.doors.length, `${id} d${d} seed ${seed}`).toBe(ls.doors)
        expect(labSolve(lab), `${id} d${d} seed ${seed}`).not.toBeNull()
      }
    }
  })

  it('is deterministic from the seed and reshuffles on retry', () => {
    const a = generateLabyrinth(CONFIGS['pyramid-deep'], 3, 5)
    const b = generateLabyrinth(CONFIGS['pyramid-deep'], 3, 5)
    const c = generateLabyrinth(CONFIGS['pyramid-deep'], 3, 6)
    expect(a).toEqual(b)
    expect(a.walls).not.toEqual(c.walls)
  })

  it('honours params.monsterCount', () => {
    expect(generateLabyrinth(CONFIGS['cedar-forest'], 2, 7, 0, 0).monsters).toEqual([])
    expect(generateLabyrinth(CONFIGS['cedar-forest'], 2, 7, 0, 3).monsters.length).toBe(3)
  })

  it('prowlers never pass walls, shut doors or the exit; chasers close in', () => {
    for (const d of DIFFS) {
      const lab = generateLabyrinth(CONFIGS['long-march'], d, 3)
      const rng = mulberry32(9)
      let mons = initialMonsters(lab)
      const st = labInitial(lab)
      for (let t = 0; t < 300; t++) {
        const next = stepMonsters(lab, st, mons, rng)
        next.forEach((m, i) => {
          expect(open(lab, m.r, m.c)).toBe(true)
          expect(Math.abs(m.r - mons[i].r) + Math.abs(m.c - mons[i].c)).toBeLessThanOrEqual(1)
          expect(lab.doors.some(p => p[0] === m.r && p[1] === m.c)).toBe(false)
          expect(m.r === lab.exit[0] && m.c === lab.exit[1]).toBe(false)
        })
        mons = next
      }
    }
    // A chaser within sight steps toward the player.
    const lab = generateLabyrinth(CONFIGS['pyramid-deep'], 4, 2)
    const st = labInitial(lab)
    let p = labInitial(lab)
    for (const mv of lab.solution.slice(0, 4)) p = labMove(lab, p, mv)
    const mons = [{ r: st.r, c: st.c, dir: 0 as const, home: lab.start }]
    const moved = stepMonsters(lab, p, mons, mulberry32(1))[0]
    const before = Math.abs(st.r - p.r) + Math.abs(st.c - p.c)
    const after = Math.abs(moved.r - p.r) + Math.abs(moved.c - p.c)
    expect(after).toBeLessThan(before)
  })

  it('getting caught costs a life, sends you to the checkpoint, and runs out', () => {
    const lab = generateLabyrinth(CONFIGS['everest-peak'], 4, 1)
    let st = labInitial(lab)
    for (const mv of lab.solution.slice(0, 5)) st = labMove(lab, st, mv)
    const hit = labHit(st)
    expect(hit.lives).toBe(lab.lives - 1)
    expect([hit.r, hit.c]).toEqual(lab.start)
    let dead = st
    for (let i = 0; i < lab.lives; i++) dead = labHit(dead)
    expect(dead.status).toBe('lost')
  })

  it('the step budget can be lost at D4', () => {
    const lab = generateLabyrinth(CONFIGS['pacific-strait'], 4, 1)
    let st = labInitial(lab)
    // Pace back and forth on the first move until the supplies run out.
    const back = ((lab.solution[0] + 2) % 4) as 0 | 1 | 2 | 3
    for (let i = 0; i < lab.budget && st.status === 'playing'; i++) st = labMove(lab, st, i % 2 ? back : lab.solution[0])
    expect(st.status).toBe('lost')
    expect(st.lostHow).toBe('out of steps')
  })

  it('plays end to end: physics level, level card, labyrinth finale, win', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const KEYS = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft']
    const cfg = CONFIGS['pyramid-deep']
    render(createElement(BigMazeGame, { configId: 'pyramid-deep', difficulty: 1, seed: 4, params: { monsterCount: 0 }, onWin, onLose }))
    expect(levelPlan(cfg, 1)).toEqual(['gravity', 'labyrinth'])
    act(() => { vi.advanceTimersByTime(1000) })
    for (const mv of generateLevel(cfg, 1, 4, 0).solution) fireEvent.keyDown(window, { key: KEYS[mv] })
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByText('Level 1 complete')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    act(() => { vi.advanceTimersByTime(1400) })
    const lab = generateLabyrinth(cfg, 1, 4, 0, 0)
    for (const mv of lab.solution) fireEvent.keyDown(window, { key: KEYS[mv] })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).not.toHaveBeenCalled()
    expect(onWin).toHaveBeenCalledTimes(1)
  })
})
