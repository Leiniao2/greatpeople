import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Difficulty } from '@/games/types'
import RailwayGame, {
  CONFIGS, CONFIG_IDS, makeLayout, makeYard, replay, curves, trackCost, fewestCurves, solveYard, applyMove, yardStuck, yardMoves, yardSpec,
  secondsFor, type Layout, type YardMove, type YardState, type Yard,
} from '@/components/minigames/RailwayGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 4, 5, 6]
const GRID_IDS = CONFIG_IDS.filter(id => CONFIGS[id].mode !== 'yard')

afterEach(() => { cleanup(); vi.useRealTimers() })

const layout = (id: string, d: Difficulty, s: number) => makeLayout(id, CONFIGS[id].mode as Layout['mode'], d, s)

describe('Railway — logic', () => {
  it('counts curve pieces', () => {
    // 3 columns: 0 → 1 → 4 → 5 is right, down, right: two curves.
    expect(curves(3, [0, 1, 4, 5])).toBe(2)
    expect(curves(3, [0, 1, 2])).toBe(0)
  })
  it('the switching yard: a stack sorts 2,1 but one short siding cannot sort 3,2,1', () => {
    expect(solveYard({ cars: [2, 1], cap: 1, sidings: 1 })).not.toBeNull()
    expect(solveYard({ cars: [3, 2, 1], cap: 1, sidings: 1 })).toBeNull()
    expect(solveYard({ cars: [3, 2, 1], cap: 2, sidings: 1 })).not.toBeNull()
  })
})

describe('Railway — every level is winnable and sized', () => {
  it('every grid config × difficulty × seed replays its verified solution', () => {
    for (const id of GRID_IDS) for (const d of DIFFS) for (const s of SEEDS) {
      const L = layout(id, d, s)
      const tag = `${id}@${d}#${s}`
      expect(L.rows * L.cols, tag).toBeLessThanOrEqual(48)
      expect(replay(L, L.solution), tag).toBe(true)
      if (L.mode === 'stephenson') {
        expect(trackCost(L, L.solution[0])).toBe(L.optimum)
        expect(L.optimum).toBeLessThanOrEqual(L.limit)
      }
      if (L.mode === 'transsib') {
        expect(curves(L.cols, L.solution[0])).toBe(L.optimum)
        expect(fewestCurves(L, L.lines[0].from, L.lines[0].to).turns).toBe(L.optimum)
        expect(L.towns.length).toBe([2, 2, 3, 4][d - 1])
      }
      if (L.mode === 'underground') {
        expect(L.lines.length).toBe([3, 3, 4, 4][d - 1])
        for (const x of L.interchanges) expect(L.solution.filter(p => p.includes(x)).length).toBeGreaterThanOrEqual(2)
      }
    }
  }, 60_000)
  it('every yard is solvable and needs all its sidings', () => {
    for (const d of DIFFS) for (const s of SEEDS) {
      const Y = makeYard('yard', d, s)
      const spec = yardSpec(d)
      expect(Y.cars.length).toBe(spec.cars)
      let st: YardState = { next: 0, sent: 0, stacks: Array.from({ length: Y.sidings }, () => []) }
      for (const m of Y.solution) st = applyMove(Y, st, m)!
      expect(st.sent).toBe(Y.cars.length)
      expect(Y.solution.length).toBeLessThanOrEqual(2 * Y.cars.length)
    }
  })
  it('timers stay within three minutes and levels vary with the seed', () => {
    for (const d of DIFFS) expect(secondsFor(d)).toBeLessThanOrEqual(180)
    for (const id of GRID_IDS) {
      const seen = new Set(SEEDS.map(s => JSON.stringify(layout(id, 2, s).solution)))
      expect(seen.size, id).toBeGreaterThanOrEqual(SEEDS.length - 1)
    }
    expect(new Set(SEEDS.map(s => makeYard('yard', 3, s).cars.join())).size).toBeGreaterThanOrEqual(SEEDS.length - 1)
  })
})

const yardSel = (m: YardMove) => (m.t === 'direct' ? '[data-testid="direct"]' : `[data-testid="${m.t === 'in' ? 'push' : 'pop'}-${m.s}"]`)

/** A sequence of legal moves that ends with the yard jammed. */
function jam(Y: Yard): YardMove[] | null {
  const dfs = (st: YardState, depth: number): YardMove[] | null => {
    if (st.sent === Y.cars.length || depth > 20) return null
    for (const m of yardMoves(Y.sidings)) {
      const n = applyMove(Y, st, m)
      if (!n) continue
      if (n.sent < Y.cars.length && yardStuck(Y, n)) return [m]
      const r = dfs(n, depth + 1)
      if (r) return [m, ...r]
    }
    return null
  }
  return dfs({ next: 0, sent: 0, stacks: Array.from({ length: Y.sidings }, () => []) }, 0)
}

describe('Railway — component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container } = render(createElement(RailwayGame, { configId: id, difficulty: d, seed: 2, onWin: () => {}, onLose: () => {} }))
      if (CONFIGS[id].mode === 'yard') expect(container.querySelectorAll('[data-testid^="push-"]').length).toBe(yardSpec(d).sidings)
      else { const L = layout(id, d, 2); expect(container.querySelectorAll('[data-cell]').length).toBe(L.rows * L.cols) }
      cleanup()
    }
  })

  it('laying the solution and running the trains wins exactly once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of [1, 4] as Difficulty[]) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, getByTestId } = render(createElement(RailwayGame, { configId: id, difficulty: d, seed: 5, onWin, onLose }))
      if (CONFIGS[id].mode === 'yard') {
        for (const m of makeYard(id, d, 5).solution) fireEvent.click(container.querySelector(yardSel(m))!)
      } else {
        const L = layout(id, d, 5)
        L.solution.forEach((p, k) => {
          const btn = container.querySelector(`[data-line="${k}"]`)
          if (btn) fireEvent.click(btn)
          for (const i of p.slice(1)) fireEvent.click(container.querySelector(`[data-cell="${i}"]`)!)
        })
        fireEvent.click(getByTestId('run'))
      }
      for (let k = 0; k < 40; k++) act(() => { vi.advanceTimersByTime(200) })
      expect(onWin, `${id}@${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('jamming the yard with no undos left loses exactly once', () => {
    vi.useFakeTimers()
    const d: Difficulty = 4
    const Y = makeYard('yard', d, 3)
    const seq = jam(Y)!
    expect(seq).not.toBeNull()
    const onWin = vi.fn(), onLose = vi.fn()
    const { container, getByTestId } = render(createElement(RailwayGame, { configId: 'yard', difficulty: d, seed: 3, onWin, onLose }))
    const click = (m: YardMove) => fireEvent.click(container.querySelector(yardSel(m))!)
    seq.forEach(click)
    // D4 allows two undos: jam, take back, jam again — twice — and the yard is lost.
    for (let k = 0; k < 2; k++) {
      expect(onLose).not.toHaveBeenCalled()
      fireEvent.click(getByTestId('undo'))
      click(seq[seq.length - 1])
    }
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('running out of time loses exactly once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(RailwayGame, { configId: 'underground', difficulty: 3, seed: 1, onWin, onLose }))
    act(() => { vi.advanceTimersByTime((secondsFor(3) + 1) * 1000) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
