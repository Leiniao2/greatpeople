import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Difficulty } from '@/games/types'
import QueensGame, {
  CONFIGS, CONFIG_IDS, makePuzzle, solveQueens, allSolutions, clashWith, extendable, livesFor, type Puzzle,
} from '@/components/minigames/QueensGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 4, 5, 6]

afterEach(() => { cleanup(); vi.useRealTimers() })

const valid = (p: Puzzle, cells: number[]) =>
  cells.length === p.n && cells.every((c, i) => clashWith(p, cells.filter((_, j) => j !== i), c) === null && !p.blocked.includes(c))

describe('Eight Queens — solver', () => {
  const classic = (n: number) => ({ n, mode: 'classic' as const, blocked: [], regions: null })
  it('counts the known numbers of N-queens solutions', () => {
    expect([4, 5, 6, 7, 8].map(n => solveQueens(classic(n), [], 1000).count)).toEqual([2, 10, 4, 40, 92])
    expect(solveQueens(classic(10), [], 1000).count).toBe(724)
    expect(allSolutions(classic(8)).length).toBe(92)
  })
  it('respects placed queens and blocked squares', () => {
    // a8-style corner queen on 8×8: 4 solutions start in a corner of row 0.
    expect(solveQueens(classic(8), [0], 100).count).toBe(4)
    expect(solveQueens({ ...classic(8), blocked: [0, 1, 2, 3, 4, 5, 6, 7] }, [], 10).count).toBe(0)
    expect(solveQueens(classic(8), [0, 9], 10).count).toBe(0)
  })
  it('regions rules: one per region and no touching', () => {
    // 4×4 with rows as regions: no-touch permutations of 4 are 2 (1302 and 2031).
    const regions = Array.from({ length: 16 }, (_, i) => Math.floor(i / 4))
    expect(solveQueens({ n: 4, mode: 'regions', blocked: [], regions }, [], 10).count).toBe(2)
  })
})

describe('Eight Queens — every level is winnable', () => {
  it('every config × difficulty × seed has a valid answer that keeps the givens', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const s of SEEDS) {
      const p = makePuzzle(id, CONFIGS[id], d, s)
      expect(p.n, `${id}@${d}`).toBe(CONFIGS[id].sizes[d - 1])
      expect(valid(p, p.solution), `${id}@${d}#${s} solution`).toBe(true)
      for (const g of p.givens) expect(p.solution).toContain(g)
      const { count } = solveQueens(p, p.givens, 100)
      expect(count).toBeGreaterThan(0)
      if (CONFIGS[id].mode === 'regions') expect(count, `${id}@${d}#${s} unique`).toBe(1)
      if (d === 4) expect(count, `${id}@${d}#${s} unique-ish`).toBeLessThanOrEqual(2)
      // Placing the answer one queen at a time never gets turned away.
      const queens = [...p.givens]
      for (const c of p.solution) if (!queens.includes(c)) { queens.push(c); expect(extendable(p, queens)).toBe(true) }
    }
  }, 60_000)
  it('boards vary with the seed', () => {
    const boards = new Set(SEEDS.map(s => { const p = makePuzzle('alhambra', CONFIGS.alhambra, 3, s); return p.regions!.join() }))
    expect(boards.size).toBe(SEEDS.length)
    const bez = new Set(SEEDS.map(s => makePuzzle('bezzel', CONFIGS.bezzel, 1, s).blocked.join()))
    expect(bez.size).toBeGreaterThan(2)
  })
})

describe('Eight Queens — component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container } = render(createElement(QueensGame, { configId: id, difficulty: d, seed: 2, onWin: () => {}, onLose: () => {} }))
      const n = CONFIGS[id].sizes[d - 1]
      expect(container.querySelectorAll('[data-cell]').length).toBe(n * n)
      cleanup()
    }
  })

  it('placing the answer wins exactly once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) {
      const d: Difficulty = 4, seed = 8
      const p = makePuzzle(id, CONFIGS[id], d, seed)
      const onWin = vi.fn(), onLose = vi.fn()
      const { container } = render(createElement(QueensGame, { configId: id, difficulty: d, seed, onWin, onLose }))
      expect(container.querySelectorAll('[data-queen]').length).toBe(p.givens.length)
      for (const c of p.solution) if (!p.givens.includes(c)) fireEvent.click(container.querySelector(`[data-cell="${c}"]`)!)
      fireEvent.click(container.querySelector(`[data-cell="${p.solution[0]}"]`)!)
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin, id).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('marks are free and queens that lead nowhere cost lives until the game is lost once', () => {
    vi.useFakeTimers()
    const id = 'gauss', d: Difficulty = 3, seed = 4
    const p = makePuzzle(id, CONFIGS[id], d, seed)
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(QueensGame, { configId: id, difficulty: d, seed, onWin, onLose }))
    const bad = Array.from({ length: p.n * p.n }, (_, c) => c).filter(c => !p.givens.includes(c) && !extendable(p, [...p.givens, c]))
    expect(bad.length).toBeGreaterThan(livesFor(d))
    fireEvent.click(container.querySelector('[data-tool="mark"]')!)
    for (const c of bad) fireEvent.click(container.querySelector(`[data-cell="${c}"]`)!)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).not.toHaveBeenCalled()
    fireEvent.click(container.querySelector('[data-tool="queen"]')!)
    for (const c of bad.slice(0, livesFor(d) + 2)) fireEvent.click(container.querySelector(`[data-cell="${c}"]`)!)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('the clock running out loses once at D3', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(QueensGame, { configId: 'versailles', difficulty: 3, seed: 1, onWin, onLose }))
    act(() => { vi.advanceTimersByTime(300_000) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
  })
})
