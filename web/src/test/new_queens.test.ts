import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Difficulty } from '@/games/types'
import QueensGame, {
  CONFIGS, CONFIG_IDS, makePuzzle, solveQueens, allSolutions, clashWith, clashKind, extendable, livesFor, timerFor, shadingFor,
  hasRegions, MAX_SIZE, type Puzzle, type Mode,
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

describe('Eight Queens — variants', () => {
  const empty = (n: number, mode: Mode, regions: number[] | null = null) => ({ n, mode, blocked: [] as number[], regions })
  it('every config is a distinct rule twist, explained in its intro', () => {
    const twist = (id: string) => `${CONFIGS[id].mode}|${(CONFIGS[id].givens ?? []).some(g => g > 0)}|${(CONFIGS[id].blocked ?? []).some(b => b !== 0)}`
    // The base configs are each a distinct twist; story-themed configs reuse one of them.
    const BASE = ['gauss', 'bezzel', 'alhambra', 'versailles', 'polya']
    expect(new Set(BASE.map(twist)).size).toBe(BASE.length)
    for (const id of CONFIG_IDS) expect(BASE.map(twist), id).toContain(twist(id))
    expect(new Set(CONFIG_IDS.map(id => CONFIGS[id].mode))).toEqual(new Set(['classic', 'regions', 'parterre', 'torus']))
    expect(CONFIGS.gauss.intro).toMatch(/already on the board/)
    expect(CONFIGS.bezzel.intro).toMatch(/ruined/)
    expect(CONFIGS.alhambra.intro).toMatch(/touch/)
    expect(CONFIGS.versailles.intro).toMatch(/diagonal/)
    expect(CONFIGS.polya.intro).toMatch(/wrap/)
  })
  it('torus: diagonals wrap round the edge; peaceful boards exist only when n shares no factor with 6', () => {
    expect([4, 5, 6, 7, 8].map(n => solveQueens(empty(n, 'torus'), [], 1000).count)).toEqual([0, 10, 0, 28, 0])
    const n = 5, at = (r: number, c: number) => r * n + c
    // (0,4) and (1,0) touch across the wrapped edge; on a flat board they do not clash.
    expect(clashWith(empty(n, 'torus'), [at(0, 4)], at(1, 0))).toBe(at(0, 4))
    expect(clashWith(empty(n, 'classic'), [at(0, 4)], at(1, 0))).toBeNull()
    expect(clashKind(empty(n, 'torus'), at(0, 4), at(1, 0))).toMatch(/wrapped/)
  })
  it('regions vs parterre: Alhambra queens may share a long diagonal, Versailles queens may not', () => {
    const n = 5, at = (r: number, c: number) => r * n + c
    const regions = Array.from({ length: n * n }, (_, i) => i % n) // each column its own region
    expect(clashWith(empty(n, 'regions', regions), [at(0, 0)], at(2, 2))).toBeNull()
    expect(clashWith(empty(n, 'parterre', regions), [at(0, 0)], at(2, 2))).toBe(at(0, 0))
    // Touching diagonally is barred in both.
    expect(clashWith(empty(n, 'regions', regions), [at(0, 0)], at(1, 1))).toBe(at(0, 0))
    expect(clashWith(empty(n, 'parterre', regions), [at(0, 0)], at(1, 1))).toBe(at(0, 0))
    // Same region clashes in both.
    const one = new Array(n * n).fill(0)
    expect(clashKind(empty(n, 'parterre', one), at(0, 0), at(2, 3))).toMatch(/colour/)
    // A parterre answer is also a classic N-queens answer.
    for (const s of SEEDS) {
      const p = makePuzzle('versailles', CONFIGS.versailles, 4, s)
      expect(valid({ ...p, mode: 'classic', regions: null }, p.solution)).toBe(true)
    }
  })
  it('ruins and given queens are honoured', () => {
    for (const s of SEEDS) {
      const b = makePuzzle('bezzel', CONFIGS.bezzel, 2, s)
      expect(b.blocked.length).toBe(3)
      for (const x of b.blocked) expect(b.solution).not.toContain(x)
      const g = makePuzzle('gauss', CONFIGS.gauss, 1, s)
      expect(g.givens.length).toBe(1)
    }
  })
})

describe('Eight Queens — time budget', () => {
  it('boards stay small and clocks short', () => {
    expect(MAX_SIZE).toEqual([7, 7, 7, 8])
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      expect(CONFIGS[id].sizes[d - 1], `${id}@${d}`).toBeLessThanOrEqual(MAX_SIZE[d - 1])
    }
    for (const d of DIFFS) expect(timerFor(d)).toBeLessThanOrEqual(180)
    expect(timerFor(1)).toBe(0)
    expect(shadingFor(1) && shadingFor(2)).toBe(true)
    expect(livesFor(4)).toBeLessThan(livesFor(1))
  })
  it('D1 still needs decisions: many legal pairs of queens lead nowhere', () => {
    for (const id of CONFIG_IDS) for (const s of SEEDS) {
      const p = makePuzzle(id, CONFIGS[id], 1, s)
      const open = Array.from({ length: p.n * p.n }, (_, c) => c).filter(c => !p.givens.includes(c) && !p.blocked.includes(c) && clashWith(p, p.givens, c) === null)
      let dead = 0
      for (const a of open) for (const b of open) {
        if (b <= a || clashWith(p, [...p.givens, a], b) !== null) continue
        if (!extendable(p, [...p.givens, a, b])) dead++
      }
      expect(dead, `${id}#${s}`).toBeGreaterThanOrEqual(3)
    }
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
      if (hasRegions(CONFIGS[id].mode)) expect(count, `${id}@${d}#${s} unique`).toBe(1)
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
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const seed = 8
      const p = makePuzzle(id, CONFIGS[id], d, seed)
      const onWin = vi.fn(), onLose = vi.fn()
      const { container } = render(createElement(QueensGame, { configId: id, difficulty: d, seed, onWin, onLose }))
      expect(container.querySelectorAll('[data-queen]').length).toBe(p.givens.length)
      for (const c of p.solution) if (!p.givens.includes(c)) fireEvent.click(container.querySelector(`[data-cell="${c}"]`)!)
      fireEvent.click(container.querySelector(`[data-cell="${p.solution[0]}"]`)!)
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin, `${id}@${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it.each(CONFIG_IDS)('%s: marks are free and queens that lead nowhere cost lives until the game is lost once', id => {
    vi.useFakeTimers()
    const d: Difficulty = 3, seed = 4
    const p = makePuzzle(id, CONFIGS[id], d, seed)
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(QueensGame, { configId: id, difficulty: d, seed, onWin, onLose }))
    const bad = Array.from({ length: p.n * p.n }, (_, c) => c).filter(c => !p.givens.includes(c) && !p.blocked.includes(c) && !extendable(p, [...p.givens, c]))
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

  it('the clock runs out after 2½ minutes at D3 and 3 at D4, losing once', () => {
    vi.useFakeTimers()
    for (const d of [3, 4] as Difficulty[]) {
      const onWin = vi.fn(), onLose = vi.fn()
      render(createElement(QueensGame, { configId: 'versailles', difficulty: d, seed: 1, onWin, onLose }))
      act(() => { vi.advanceTimersByTime((timerFor(d) - 5) * 1000) })
      expect(onLose).not.toHaveBeenCalled()
      act(() => { vi.advanceTimersByTime(10_000) })
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onLose).toHaveBeenCalledTimes(1)
      cleanup()
    }
  })
})
