import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Difficulty } from '@/games/types'
import KnightsTourGame, {
  CONFIGS, CONFIG_IDS, makeTour, solveTour, findTour, isComplete, knightMoves, leaperMoves, nextMoves, hintMove, undosFor, openSquares, CAMEL, type Tour,
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
      const cfg = CONFIGS[id]
      // The camel's other colour is off its board; otherwise only the ruins are blocked.
      const col = (i: number) => (Math.floor(i / spec.cols) + (i % spec.cols)) % 2
      const offColour = Array.from({ length: spec.rows * spec.cols }, (_, i) => i).filter(i => col(i) !== col(tour.start)).length
      expect(tour.blocked.length).toBe(cfg.rule === 'camel' ? offColour : spec.blocked)
      expect(tour.closed).toBe(cfg.rule === 'closed')
      expect(tour.waypoints?.length ?? 0).toBe(spec.waypoints ?? 0)
      expect(solution[0]).toBe(tour.start)
      expect(isComplete(tour, solution), `${id}@${d}#${s}`).toBe(true)
    }
  }, 60_000)
  it('fits the time budget: 18–26 squares at D1 (~1 min), never more than 40 (~2½ min)', () => {
    const maxSquares = [26, 30, 36, 40]
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const s of SEEDS) {
      const { tour } = makeTour(id, CONFIGS[id], d, s)
      expect(openSquares(tour), `${id}@${d}`).toBeLessThanOrEqual(maxSquares[d - 1])
      if (d === 1) expect(openSquares(tour), `${id}@1`).toBeGreaterThanOrEqual(18)
    }
    // Harder levels never get smaller.
    for (const id of CONFIG_IDS) {
      const n = DIFFS.map(d => openSquares(makeTour(id, CONFIGS[id], d, 1).tour))
      for (let k = 1; k < 4; k++) expect(n[k], id).toBeGreaterThanOrEqual(n[k - 1])
    }
    expect(undosFor(4)).toBeLessThan(undosFor(1))
  })

  it('each config is its own rule twist', () => {
    expect(new Set(CONFIG_IDS.map(id => CONFIGS[id].rule)).size).toBe(CONFIG_IDS.length)
    for (const id of CONFIG_IDS) expect(CONFIGS[id].intro.length, id).toBeGreaterThan(40)
  })

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

describe("Knight's Tour — variant rules", () => {
  it('closed: a full open path that cannot return is not complete', () => {
    const { tour, solution } = makeTour('euler', CONFIGS.euler, 2, 3)
    expect(tour.closed).toBe(true)
    expect(knightMoves(tour.rows, tour.cols, solution[solution.length - 1])).toContain(solution[0])
    const open = solveTour({ ...tour, closed: false }, [tour.start])!
    if (!knightMoves(tour.rows, tour.cols, open[open.length - 1]).includes(open[0])) expect(isComplete(tour, open)).toBe(false)
    // Closed tours with ruins keep the colours balanced.
    const r = makeTour('euler', CONFIGS.euler, 1, 4).tour
    const col = (i: number) => (Math.floor(i / r.cols) + (i % r.cols)) % 2
    expect(r.blocked.filter(i => col(i) === 0).length).toBe(r.blocked.filter(i => col(i) === 1).length)
  })

  it('waypoints: a numbered square cannot be entered out of turn, and order is checked', () => {
    for (const d of DIFFS) for (const s of SEEDS) {
      const { tour, solution } = makeTour('al-adli', CONFIGS['al-adli'], d, s)
      const wps = tour.waypoints!
      expect(new Set(wps).size).toBe(wps.length)
      expect(wps).not.toContain(tour.start)
      expect(solution.filter(p => wps.includes(p))).toEqual(wps)
      // Walking the solution, a later waypoint is never offered before its turn.
      for (let k = 1; k < solution.length; k++) {
        const due = wps.find(w => !solution.slice(0, k).includes(w))
        for (const j of nextMoves(tour, solution.slice(0, k))) if (wps.includes(j)) expect(j).toBe(due)
      }
    }
    const t: Tour = { rows: 5, cols: 5, blocked: [], start: 0, closed: false }
    const p = solveTour(t)!
    expect(isComplete({ ...t, waypoints: [p[10], p[5]] }, p)).toBe(false)
    expect(isComplete({ ...t, waypoints: [p[5], p[10]] }, p)).toBe(true)
    expect(nextMoves({ ...t, waypoints: [p[5], p[1]] }, [0])).not.toContain(p[1])
  })

  it('ruins: the knight never lands on a ruined square', () => {
    for (const d of DIFFS) {
      const { tour, solution } = makeTour('turk', CONFIGS.turk, d, 2)
      expect(tour.blocked.length).toBe(CONFIGS.turk.tiers[d - 1].blocked)
      for (const b of tour.blocked) expect(solution).not.toContain(b)
    }
  })

  it('camel: (3,1) leaps that never change colour', () => {
    expect(leaperMoves(8, 8, 0, CAMEL).sort((a, b) => a - b)).toEqual([11, 25])
    for (const d of DIFFS) {
      const { tour, solution } = makeTour('tamerlane', CONFIGS.tamerlane, d, 1)
      expect(tour.leap).toEqual(CAMEL)
      const col = (i: number) => (Math.floor(i / tour.cols) + (i % tour.cols)) % 2
      expect(new Set(solution.map(col)).size).toBe(1)
      expect(openSquares(tour)).toBe(Array.from({ length: tour.rows * tour.cols }, (_, i) => i).filter(i => col(i) === col(tour.start)).length)
      for (let k = 1; k < solution.length; k++) {
        const dr = Math.abs(Math.floor(solution[k] / tour.cols) - Math.floor(solution[k - 1] / tour.cols))
        const dc = Math.abs((solution[k] % tour.cols) - (solution[k - 1] % tour.cols))
        expect([dr, dc].sort()).toEqual([1, 3])
      }
    }
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
    for (const [id, d] of [['euler', 4], ['turk', 4], ['al-adli', 1], ['al-adli', 4], ['tamerlane', 3]] as const) {
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
