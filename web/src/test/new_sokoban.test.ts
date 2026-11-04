// Stone Haulers (Sokoban): every site plays a different rule; every yard in
// every rule's pool is solvable in exactly its pinned par (and under every
// rotation), the rule really changes the yard, pars fit the time budget, and
// the component wins/loses once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import SokobanGame, {
  CONFIGS, CONFIG_IDS, POOLS, PAR_BUDGET, LEVER_PULLS, parseLevel, solve, move, applyMove, isSolved, transformMap,
  planLevel, capFor, levelsForTier,
  type Move, type Level, type SokoState, type Variant, type Dir,
} from '@/components/minigames/SokobanGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006, 99991]
type Rule = Exclude<Variant, 'classic'>
const RULES = Object.keys(POOLS) as Rule[]

const startOf = (lv: Level, v: Variant): SokoState => ({ player: lv.player, boxes: lv.boxes, pulls: v === 'lever' ? LEVER_PULLS : 0 })

function replay(level: Level, v: Variant, path: Move[], start = startOf(level, v)): SokoState {
  let s = start
  for (const m of path) {
    const r = applyMove(level, s, m, v)
    expect(r).not.toBeNull()
    s = r!.state
  }
  return s
}

/** Strip a numbered yard back to plain blocks and marks. */
const plain = (map: string[]) => map.map(r => r.replace(/[a-d]/g, '$').replace(/[A-D]/g, '.'))

describe('sokoban rules', () => {
  it('classic: pushes only, one block at a time', () => {
    const lv = parseLevel(['######', '#@$$.#', '######'])
    expect(move(lv, { player: lv.player, boxes: lv.boxes }, 'R')).toBeNull()
    const lv2 = parseLevel(['#####', '#@$.#', '#####'])
    const m = move(lv2, { player: lv2.player, boxes: lv2.boxes }, 'R')!
    expect(m.pushed).toBe(true)
    expect(isSolved(lv2, m.state)).toBe(true)
    expect(move(lv2, m.state, 'L')!.state.boxes).toEqual(m.state.boxes)
    expect(solve(parseLevel(['#####', '#.$@#', '#####']))).toEqual(['L'])
    expect(solve(parseLevel(['######', '#$  .#', '#@   #', '######']))).toBeNull()
  })

  it('slide: a pushed block runs on until a wall or block, or stops on a station', () => {
    const lv = parseLevel(['#######', '#@$   #', '#######'])
    const m = move(lv, { player: lv.player, boxes: lv.boxes }, 'R', 'slide')!
    expect(m.state.boxes).toEqual([lv.w + 5]) // slid to the far wall
    expect(m.state.player).toBe(lv.w + 2) // the worker takes one step
    const g = parseLevel(['#######', '#@$ . #', '#######'])
    expect(move(g, { player: g.player, boxes: g.boxes }, 'R', 'slide')!.state.boxes).toEqual([g.w + 4]) // braked on the station
    expect(move(g, { player: g.player, boxes: g.boxes }, 'R', 'classic')!.state.boxes).toEqual([g.w + 3])
    // One push carries the block all the way to the station's brake.
    expect(solve(parseLevel(['########', '#@$  . #', '########']), 'slide')).toEqual(['R'])
    expect(solve(parseLevel(['########', '#@$  . #', '########']), 'classic')!.length).toBe(3)
  })

  it('matched: each numbered block counts only on its own plinth', () => {
    const lv = parseLevel(['#######', '#@ab BA#', '#######'])
    expect(lv.boxes.length).toBe(2)
    expect(isSolved(lv, { player: 0, boxes: [lv.goals[1], lv.goals[0]] }, 'matched')).toBe(false)
    expect(isSolved(lv, { player: 0, boxes: [lv.goals[1], lv.goals[0]] }, 'classic')).toBe(true)
    // Blocks in open ground go to their own plinths; numbering only bites
    // when the order matters.
    expect(solve(lv, 'matched')).toBeNull()
    const open = parseLevel(['#######', '#@a  A#', '# b  B#', '#     #', '#######'])
    expect(solve(open, 'matched')!.length).toBe(10)
    const crossed = parseLevel(['#######', '#@a  B#', '# b  A#', '#     #', '#######'])
    // Swap the plinths and the drum on the top wall can never reach row two.
    expect(solve(crossed, 'matched')).toBeNull()
    expect(solve(crossed, 'classic')!.length).toBe(10)
  })

  it('locked: a stone on a socket cannot be pushed again', () => {
    const lv = parseLevel(['#######', '#@$.. #', '#######'])
    const s1 = move(lv, { player: lv.player, boxes: lv.boxes }, 'R', 'locked')!.state
    expect(move(lv, s1, 'R', 'locked')).toBeNull()
    expect(move(lv, s1, 'R', 'classic')).not.toBeNull()
    // Two sockets at the end of a dead-end lane: the near socket would trap
    // the first stone, so the lane can never be filled.
    const lane = parseLevel(['#########', '#@ $ ..##', '#  $  ###', '#     ###', '#########'])
    expect(solve(lane, 'classic')!.length).toBe(13)
    expect(solve(lane, 'locked')).toBeNull()
  })

  it('lever: one pull drags the block behind the worker, then it is spent', () => {
    const lv = parseLevel(['#######', '#  $@ #', '#######'])
    const s0: SokoState = { player: lv.player, boxes: lv.boxes, pulls: 1 }
    const m = move(lv, s0, 'R', 'lever', true)!
    expect(m.pulled).toBe(true)
    expect(m.state.boxes).toEqual([lv.player])
    expect(m.state.pulls).toBe(0)
    const again = move(lv, { ...m.state, player: m.state.player }, 'L', 'lever', true)!
    expect(again.pushed).toBe(true) // no pull left: only pushing remains
    // Without a block behind, arming the lever is just a step and keeps the pull.
    const walk = move(lv, { ...s0, player: lv.player + 1 }, 'L', 'lever', true)!
    expect(walk.pulled).toBe(false)
    // A block in a corner needs the lever.
    const corner = parseLevel(['######', '#$  .#', '#   @#', '######'])
    expect(solve(corner, 'classic')).toBeNull()
    const sol = solve(corner, 'lever', startOf(corner, 'lever'))!
    expect(sol.some(x => x === x.toLowerCase())).toBe(true)
  })
})

describe('sokoban pools', () => {
  it('every site plays a different rule', () => {
    const rules = CONFIG_IDS.map(id => CONFIGS[id].variant)
    expect(new Set(rules).size).toBe(CONFIG_IDS.length)
    for (const id of CONFIG_IDS) expect(RULES).toContain(CONFIGS[id].variant)
  })

  for (const v of RULES) {
    it(`${v}: five yards per tier, within the time budget and growing harder`, () => {
      for (const t of DIFFS) expect(levelsForTier(v, t).length).toBe(5)
      const avg = (t: Difficulty) => levelsForTier(v, t).reduce((a, i) => a + POOLS[v][i].par, 0) / 5
      for (const t of DIFFS.slice(1)) expect(avg(t)).toBeGreaterThan(avg((t - 1) as Difficulty))
      for (const def of POOLS[v]) {
        // Time budget: ~1 min at D1 to ~3 min at D4 for an engaged player.
        expect(def.par).toBeLessThanOrEqual(PAR_BUDGET[def.tier])
        expect(def.par).toBeGreaterThanOrEqual(18)
        const lv = parseLevel(def.map)
        expect(lv.boxes.length).toBeGreaterThanOrEqual(2)
        expect(lv.boxes.length).toBeLessThanOrEqual(def.tier === 4 ? 4 : 3)
        expect(lv.w * lv.h).toBeLessThanOrEqual(81)
        expect(capFor(def.tier, def.par)).toBeLessThanOrEqual(def.tier === 1 ? 110 : 120)
      }
    })

    POOLS[v].forEach((def, i) => {
      it(`${v} yard ${i} (tier ${def.tier}) is solvable in exactly par ${def.par}, and the rule matters`, () => {
        const lv = parseLevel(def.map)
        expect(lv.boxes.length).toBe(lv.goals.length)
        const sol = solve(lv, v, startOf(lv, v))!
        expect(sol).not.toBeNull()
        expect(sol.length).toBe(def.par)
        expect(isSolved(lv, replay(lv, v, sol), v)).toBe(true)
        const t = parseLevel(transformMap(def.map, 5))
        expect(solve(t, v, startOf(t, v))!.length).toBe(def.par)
        const classic = solve(parseLevel(plain(def.map)), 'classic')
        if (v === 'lever') {
          expect(classic).toBeNull() // pushing alone cannot do it
          expect(sol.some(m => m === m.toLowerCase())).toBe(true)
        }
        if (v === 'locked' || v === 'matched') expect(classic!.length).toBeLessThan(def.par)
      })
    })
  }

  it('every config × difficulty × seed plans a winnable level under its cap', () => {
    const used = new Set<string>()
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const seed of SEEDS) {
      const plan = planLevel(id, d, seed)
      expect(plan.variant).toBe(CONFIGS[id].variant)
      expect(POOLS[CONFIGS[id].variant][plan.levelIndex].tier).toBe(d)
      expect(plan.cap).toBe(capFor(d, plan.par))
      expect(plan.cap).toBeGreaterThan(plan.par)
      used.add(`${id}:${plan.levelIndex}:${plan.transform}`)
    }
    expect(used.size).toBeGreaterThan(80)
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const plan = planLevel(id, d, SEEDS[d])
      const sol = solve(plan.level, plan.variant, plan.start)!
      expect(sol.length).toBe(plan.par)
      expect(isSolved(plan.level, replay(plan.level, plan.variant, sol, plan.start), plan.variant)).toBe(true)
    }
  })
})

const KEY: Record<Dir, string> = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' }

describe('SokobanGame component', () => {
  it('renders every config at every difficulty, naming its rule', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(SokobanGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByTestId('soko-placed')).toBeTruthy()
      expect(screen.getByTestId('soko-rule').textContent).toBe(CONFIGS[id].rule)
      expect(!!screen.queryByTestId('soko-lever')).toBe(CONFIGS[id].variant === 'lever')
      cleanup()
    }
  })

  for (const id of CONFIG_IDS) {
    it(`${id}: a solver-driven win calls onWin once`, () => {
      vi.useFakeTimers()
      const onWin = vi.fn(), onLose = vi.fn()
      const plan = planLevel(id, 2, 11)
      render(createElement(SokobanGame, { configId: id, difficulty: 2, seed: 11, onWin, onLose }))
      for (const m of solve(plan.level, plan.variant, plan.start)!) act(() => {
        if (m === m.toLowerCase()) fireEvent.keyDown(window, { key: 'e' })
        fireEvent.keyDown(window, { key: KEY[m.toUpperCase() as Dir] })
      })
      act(() => { fireEvent.keyDown(window, { key: 'ArrowUp' }) })
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
    })
  }

  it('pacing back and forth until sunset calls onLose once (undo does not refund daylight)', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const plan = planLevel('stonehenge', 4, 5)
    render(createElement(SokobanGame, { configId: 'stonehenge', difficulty: 4, seed: 5, onWin, onLose }))
    const lv = plan.level
    const d = (['U', 'D', 'L', 'R'] as Dir[]).find(x => { const m = move(lv, plan.start, x, 'locked'); return m && !m.pushed })!
    for (let i = 0; i < plan.cap + 5; i++) act(() => {
      fireEvent.keyDown(window, { key: KEY[d] })
      fireEvent.keyDown(window, { key: 'z' })
    })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
