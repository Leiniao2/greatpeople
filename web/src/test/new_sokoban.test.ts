// Stone Haulers (Sokoban): every yard in the pool is solvable in exactly
// its pinned par, under every rotation; every config × difficulty × seed
// plans a solvable level within its cap; and the component wins/loses once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import SokobanGame, {
  CONFIG_IDS, LEVELS, parseLevel, solve, move, isSolved, transformMap, planLevel, capFor, levelsForTier,
  type Dir, type Level, type SokoState,
} from '@/components/minigames/SokobanGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006, 99991]

function replay(level: Level, path: Dir[]): SokoState {
  let s: SokoState = { player: level.player, boxes: level.boxes }
  for (const d of path) {
    const m = move(level, s, d)
    expect(m).not.toBeNull()
    s = m!.state
  }
  return s
}

describe('sokoban rules and pool', () => {
  it('pushes only, one block at a time', () => {
    const lv = parseLevel(['######', '#@$$.#', '######'])
    expect(move(lv, { player: lv.player, boxes: lv.boxes }, 'R')).toBeNull()
    const lv2 = parseLevel(['#####', '#@$.#', '#####'])
    const m = move(lv2, { player: lv2.player, boxes: lv2.boxes }, 'R')!
    expect(m.pushed).toBe(true)
    expect(isSolved(lv2, m.state)).toBe(true)
    // No pulling: stepping away leaves the block behind.
    expect(move(lv2, m.state, 'L')!.state.boxes).toEqual(m.state.boxes)
    expect(solve(parseLevel(['#####', '#.$@#', '#####']))).toEqual(['L'])
    expect(solve(parseLevel(['######', '#$  .#', '#@   #', '######']))).toBeNull()
  })

  it('has six yards in every tier, growing harder', () => {
    for (const t of DIFFS) expect(levelsForTier(t).length).toBe(6)
    const avg = (t: Difficulty) => levelsForTier(t).reduce((a, i) => a + LEVELS[i].par, 0) / 6
    expect(avg(1)).toBeLessThan(avg(2))
    expect(avg(2)).toBeLessThan(avg(3))
    expect(avg(3)).toBeLessThan(avg(4))
  })

  LEVELS.forEach((def, i) => {
    it(`yard ${i} (tier ${def.tier}) is solvable in exactly par ${def.par}`, () => {
      const lv = parseLevel(def.map)
      expect(lv.boxes.length).toBe(lv.goals.length)
      const sol = solve(lv)!
      expect(sol).not.toBeNull()
      expect(sol.length).toBe(def.par)
      expect(isSolved(lv, replay(lv, sol))).toBe(true)
      // A rotated, mirrored copy is just as solvable.
      const t = parseLevel(transformMap(def.map, 5))
      expect(solve(t)!.length).toBe(def.par)
    })
  })

  it('every config × difficulty × seed plans a winnable level under its cap', () => {
    const used = new Set<string>()
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const seed of SEEDS) {
      const plan = planLevel(id, d, seed)
      expect(LEVELS[plan.levelIndex].tier).toBe(d)
      expect(plan.cap).toBe(capFor(d, plan.par))
      expect(plan.cap).toBeGreaterThan(plan.par)
      used.add(`${plan.levelIndex}:${plan.transform}`)
    }
    // Plenty of distinct yards for a 24-level ladder.
    expect(used.size).toBeGreaterThan(60)
    for (const d of DIFFS) for (const seed of SEEDS.slice(0, 2)) {
      const plan = planLevel(CONFIG_IDS[0], d, seed)
      const sol = solve(plan.level)!
      expect(sol.length).toBe(plan.par)
      expect(isSolved(plan.level, replay(plan.level, sol))).toBe(true)
    }
  })
})

const KEY: Record<Dir, string> = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' }

describe('SokobanGame component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(SokobanGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByTestId('soko-placed')).toBeTruthy()
      cleanup()
    }
  })

  it('a solver-driven win calls onWin once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const plan = planLevel('karnak', 2, 11)
    render(createElement(SokobanGame, { configId: 'karnak', difficulty: 2, seed: 11, onWin, onLose }))
    for (const d of solve(plan.level)!) act(() => { fireEvent.keyDown(window, { key: KEY[d] }) })
    act(() => { fireEvent.keyDown(window, { key: 'ArrowUp' }) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onWin).toHaveBeenCalledTimes(1)
    expect(onLose).not.toHaveBeenCalled()
  })

  it('pacing back and forth until sunset calls onLose once (undo does not refund daylight)', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const plan = planLevel('stonehenge', 4, 5)
    render(createElement(SokobanGame, { configId: 'stonehenge', difficulty: 4, seed: 5, onWin, onLose }))
    const lv = plan.level
    // Find a free step that does not push, then step and undo forever.
    const d = (['U', 'D', 'L', 'R'] as Dir[]).find(x => { const m = move(lv, { player: lv.player, boxes: lv.boxes }, x); return m && !m.pushed })!
    for (let i = 0; i < plan.cap + 5; i++) act(() => {
      fireEvent.keyDown(window, { key: KEY[d] })
      fireEvent.keyDown(window, { key: 'z' })
    })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
