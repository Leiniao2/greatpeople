// Pack Train: every route × difficulty × seed is built solved, its rule
// holds (wrong loads cost more, wells refill once, loads spoil), the
// supplies are tight at D4, and the component wins or loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import PackTrainGame, {
  CONFIGS, CONFIG_IDS, DECOY_COST, makeTrail, solve, minSupply, startState, move, legalMoves, type Trail,
} from '@/components/minigames/PackTrainGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 7, 42, 1006, 31337]
const VARIANTS = ['orders', 'wells', 'deadline'] as const

const playRoute = (t: Trail, route: number[]) => route.reduce((s, c) => move(t, s, c), startState(t))

describe('pack train engine', () => {
  it('every route is winnable by following the solver, move by move', () => {
    for (const v of VARIANTS) for (const d of DIFFS) for (const seed of SEEDS) {
      const t = makeTrail(v, d, seed)
      const route = solve(t)
      expect(route, `${v}@${d}#${seed}`).not.toBeNull()
      expect(playRoute(t, route!).status, `${v}@${d}#${seed}`).toBe('won')
    }
  })

  it('maps are deterministic from the seed and grow with difficulty', () => {
    expect(makeTrail('orders', 3, 9)).toEqual(makeTrail('orders', 3, 9))
    const sizes = DIFFS.map(d => makeTrail('wells', d, 5).size)
    expect(sizes).toEqual([7, 8, 9, 9])
  })

  it('D4 gives no spare supply: one less and the route cannot be finished', () => {
    for (const v of ['orders', 'wells'] as const) for (const seed of SEEDS) {
      const t = makeTrail(v, 4, seed)
      expect(minSupply(t), `${v}#${seed}`).toBe(t.supply)
      expect(solve(t, t.supply - 1)).toBeNull()
    }
  })

  it('wrong loads cost extra, wells refill once, loads spoil', () => {
    const o = makeTrail('orders', 2, 3)
    expect(o.decoys.length).toBeGreaterThan(0)
    const w = makeTrail('wells', 2, 3)
    expect(w.wells.length).toBeGreaterThan(0)
    // A hand-made strip: start, well, well cell again.
    const strip: Trail = { size: 4, variant: 'wells', blocked: [false, false, false, false, ...Array(12).fill(true)],
      start: 0, goal: 3, loads: [2], decoys: [], wells: [1], supply: 2, deadlines: [Infinity] }
    let s = move(strip, startState(strip), 1)
    expect(s.supply).toBe(2)               // refilled
    s = move(strip, move(strip, s, 0), 1)
    expect(s.supply).toBe(0)               // dry the second time: no legal moves left
    expect(s.status).toBe('lost')
    const dec: Trail = { ...strip, variant: 'orders', wells: [], decoys: [1], supply: 5 }
    expect(move(dec, startState(dec), 1).supply).toBe(5 - DECOY_COST)
    const late: Trail = { ...strip, variant: 'deadline', wells: [], loads: [3], deadlines: [1], supply: 9 }
    expect(move(late, move(late, startState(late), 1), 2).status).toBe('lost')
  })

  it('every config names a known rule and enough goods', () => {
    for (const id of CONFIG_IDS) {
      expect(VARIANTS).toContain(CONFIGS[id].variant)
      expect(CONFIGS[id].goods.length).toBeGreaterThanOrEqual(5)
    }
  })
})

describe('pack train component', () => {
  const tapSquare = (t: Trail, cell: number) =>
    fireEvent.click(screen.getByLabelText(`square ${cell % t.size + 1},${Math.floor(cell / t.size) + 1}`))

  it('following the route wins once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) {
      const d: Difficulty = 3
      const t = makeTrail(CONFIGS[id].variant, d, 11)
      const onWin = vi.fn(), onLose = vi.fn()
      render(createElement(PackTrainGame, { configId: id, difficulty: d, seed: 11, onWin, onLose }))
      for (const c of solve(t)!) tapSquare(t, c)
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin, id).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('pacing back and forth runs out of supplies and loses once', () => {
    vi.useFakeTimers()
    const t = makeTrail('orders', 1, 4)
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(PackTrainGame, { configId: 'silk-road', difficulty: 1, seed: 4, onWin, onLose }))
    let s = startState(t)
    for (let i = 0; i < 200 && s.status === 'playing'; i++) {
      const avoid = new Set([t.goal, ...t.loads])
      const next = legalMoves(t, s).find(c => !avoid.has(c)) ?? legalMoves(t, s)[0]
      s = move(t, s, next)
      tapSquare(t, next)
    }
    expect(s.status).toBe('lost')
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
