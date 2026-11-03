import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Difficulty } from '@/games/types'
import KnightsTourGame, {
  CONFIGS, CONFIG_IDS, makeTour, solveTour, findTour, isComplete, knightMoves, nextMoves, hintMove, undosFor, openSquares, type Tour,
} from '@/components/minigames/KnightsTourGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 4, 5, 6]

afterEach(() => { cleanup(); vi.useRealTimers() })

describe("Knight's Tour — solver", () => {
  it('knight moves from a corner and the centre', () => {
    expect(knightMoves(8, 8, 0).sort((a, b) => a - b)).toEqual([10, 17])
    expect(knightMoves(8, 8, 27).length).toBe(8)
  })
  it('finds open tours where they exist and none where they do not', () => {
    const t5: Tour = { rows: 5, cols: 5, blocked: [], start: 0, closed: false }
    expect(isComplete(t5, solveTour(t5)!)).toBe(true)
    // 5×5 tours only start on the majority colour.
    expect(findTour({ ...t5, start: 1 }, [1], 200_000)).toBeNull()
    expect(findTour({ rows: 4, cols: 4, blocked: [], start: 0, closed: false }, [0], 200_000)).toBeNull()
  })
  it('finds closed 8×8 tours, and none on odd boards', () => {
    const t: Tour = { rows: 8, cols: 8, blocked: [], start: 27, closed: true }
    const p = findTour(t)!
    expect(isComplete(t, p)).toBe(true)
    expect(knightMoves(8, 8, p[63])).toContain(27)
    expect(findTour({ rows: 5, cols: 5, blocked: [], start: 0, closed: true }, [0], 100_000)).toBeNull()
  })
  it('isComplete rejects paths that skip, repeat or break the knight move', () => {
    const t: Tour = { rows: 5, cols: 5, blocked: [], start: 0, closed: false }
    const p = solveTour(t)!
    expect(isComplete(t, p.slice(0, -1))).toBe(false)
    const bad = p.slice(); [bad[3], bad[4]] = [bad[4], bad[3]]
    expect(isComplete(t, bad)).toBe(false)
  })
})

describe("Knight's Tour — every level is winnable", () => {
  it('every config × difficulty × seed has a verified tour', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const s of SEEDS) {
      const spec = CONFIGS[id].tiers[d - 1]
      const { tour, solution } = makeTour(id, CONFIGS[id], d, s)
      expect([tour.rows, tour.cols], `${id}@${d}`).toEqual([spec.rows, spec.cols])
      expect(tour.blocked.length).toBe(spec.blocked)
      expect(tour.closed).toBe(spec.closed)
      expect(solution[0]).toBe(tour.start)
      expect(isComplete(tour, solution), `${id}@${d}#${s}`).toBe(true)
    }
  }, 60_000)
  it('instances vary with the seed', () => {
    const starts = new Set(SEEDS.map(s => makeTour('euler', CONFIGS.euler, 3, s).tour.start))
    expect(starts.size).toBeGreaterThan(2)
  })
  it('following hints from the start completes a 6×6 tour', () => {
    const { tour } = makeTour('euler', CONFIGS.euler, 2, 3)
    const path = [tour.start]
    while (path.length < openSquares(tour)) {
      const h = hintMove(tour, path)
      expect(h).not.toBeNull()
      path.push(h!)
    }
    expect(isComplete(tour, path)).toBe(true)
  })
})

describe("Knight's Tour — component", () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container } = render(createElement(KnightsTourGame, { configId: id, difficulty: d, seed: 2, onWin: () => {}, onLose: () => {} }))
      const spec = CONFIGS[id].tiers[d - 1]
      expect(container.querySelectorAll('[data-sq]').length).toBe(spec.rows * spec.cols)
      expect(container.querySelectorAll('[data-target]').length).toBeGreaterThan(0)
      cleanup()
    }
  })

  it('playing the solver’s tour wins exactly once', () => {
    vi.useFakeTimers()
    for (const [id, d] of [['euler', 4], ['turk', 4], ['al-adli', 1]] as const) {
      const { solution } = makeTour(id, CONFIGS[id], d, 9)
      const onWin = vi.fn(), onLose = vi.fn()
      const { container } = render(createElement(KnightsTourGame, { configId: id, difficulty: d, seed: 9, onWin, onLose }))
      const sq = (i: number) => container.querySelector<HTMLButtonElement>(`[data-sq="${i}"]`)!
      for (const i of solution.slice(1)) fireEvent.click(sq(i))
      fireEvent.click(sq(solution[0]))
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin, `${id}@${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('running into a dead end with no undos left loses exactly once', () => {
    vi.useFakeTimers()
    const id = 'euler', d: Difficulty = 4, seed = 5
    const { tour } = makeTour(id, CONFIGS[id], d, seed)
    const onWin = vi.fn(), onLose = vi.fn()
    const { container, getByTestId } = render(createElement(KnightsTourGame, { configId: id, difficulty: d, seed, onWin, onLose }))
    const targets = () => [...container.querySelectorAll<HTMLButtonElement>('[data-target]')]
    for (let k = 0; k < undosFor(d); k++) { fireEvent.click(targets()[0]); fireEvent.click(getByTestId('undo')) }
    // Anti-Warnsdorff: always jump to the most open square — a dead end comes fast.
    const path = [tour.start]
    for (let guard = 0; guard < 80 && targets().length; guard++) {
      const moves = nextMoves(tour, path)
      const j = moves.sort((a, b) => nextMoves(tour, [...path, b]).length - nextMoves(tour, [...path, a]).length)[0]
      path.push(j)
      fireEvent.click(container.querySelector<HTMLButtonElement>(`[data-sq="${j}"]`)!)
    }
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
