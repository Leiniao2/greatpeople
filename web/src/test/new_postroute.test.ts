import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Difficulty } from '@/games/types'
import PostRouteGame, {
  CONFIGS, CONFIG_IDS, makeRoute, bestRound, bestRoadRound, legal, finished, pathLength, budgetFor, stopsFor, secondsFor,
} from '@/components/minigames/PostRouteGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 4, 5, 6]

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Post Route — solvers', () => {
  const sq = [[0, 1, 2, 1], [1, 0, 1, 2], [2, 1, 0, 1], [1, 2, 1, 0]]
  it('finds the square loop', () => {
    const r = bestRound({ mode: 'inca', cost: sq, relays: [true, false, false, false], range: 0, deadline: [Infinity, Infinity, Infinity, Infinity] })
    expect(r.cost).toBe(4)
  })
  it('deadlines fix the direction, or make a round impossible', () => {
    const base = { mode: 'pony' as const, cost: sq, relays: [true, false, false, false], range: 0 }
    expect(bestRound({ ...base, deadline: [Infinity, Infinity, Infinity, 1] }).path).toEqual([0, 3, 2, 1, 0])
    expect(bestRound({ ...base, deadline: [Infinity, Infinity, 1, Infinity] }).cost).toBe(Infinity)
  })
  it('relay range: a leg longer than the horses can ride is refused', () => {
    const r = bestRound({ mode: 'thurn', cost: sq, relays: [true, false, true, false], range: 2, deadline: [0, 0, 0, 0].map(() => Infinity) })
    expect(r.cost).toBe(4)
    expect(bestRound({ mode: 'thurn', cost: sq, relays: [true, false, false, false], range: 3, deadline: [0, 0, 0, 0].map(() => Infinity) }).cost).toBe(Infinity)
  })
  it('one-way roads: Held–Karp with pass-through', () => {
    const I = Infinity
    const c = [[0, 1, I], [I, 0, 1], [1, I, 0]]
    expect(bestRoadRound(c).cost).toBe(3)
    expect(bestRoadRound(c).path).toEqual([0, 1, 2, 0])
  })
})

describe('Post Route — every level is winnable and sized', () => {
  it('every config × difficulty × seed has a legal optimal round', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const s of SEEDS) {
      const r = makeRoute(id, CONFIGS[id], d, s)
      const tag = `${id}@${d}#${s}`
      expect(r.nodes.length, tag).toBe(stopsFor(d))
      expect(r.optimum, tag).toBeLessThan(Infinity)
      expect(pathLength(r.cost, r.solution), tag).toBe(r.optimum)
      expect(legal(r, r.solution), tag).toBe(true)
      expect(finished(r, r.solution, budgetFor(r, d)), tag).toBe(true)
      if (r.mode === 'thurn') expect(r.relays.filter(Boolean).length).toBeGreaterThanOrEqual(3)
      if (r.mode === 'pony') expect(r.deadline.filter(x => x < Infinity).length).toBeGreaterThanOrEqual(2)
    }
  }, 60_000)
  it('timers stay within three minutes and levels vary with the seed', () => {
    for (const d of DIFFS) expect(secondsFor(d)).toBeLessThanOrEqual(180)
    for (const id of CONFIG_IDS) {
      const seen = new Set(SEEDS.map(s => JSON.stringify(makeRoute(id, CONFIGS[id], 2, s).nodes)))
      expect(seen.size, id).toBe(SEEDS.length)
    }
  })
})

describe('Post Route — component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container } = render(createElement(PostRouteGame, { configId: id, difficulty: d, seed: 2, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelectorAll('[data-node]').length).toBe(stopsFor(d))
      expect(container.querySelectorAll('[data-cand]').length).toBeGreaterThan(0)
      cleanup()
    }
  })

  it('riding the optimal round wins exactly once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of [1, 4] as Difficulty[]) {
      const r = makeRoute(id, CONFIGS[id], d, 8)
      const onWin = vi.fn(), onLose = vi.fn()
      const { container } = render(createElement(PostRouteGame, { configId: id, difficulty: d, seed: 8, onWin, onLose }))
      for (const v of r.solution.slice(1)) fireEvent.click(container.querySelector(`[data-node="${v}"]`)!)
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin, `${id}@${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('a too-long round does not win, and the clock then loses exactly once', () => {
    vi.useFakeTimers()
    const d: Difficulty = 4
    const r = makeRoute('inca', CONFIGS.inca, d, 3)
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(PostRouteGame, { configId: 'inca', difficulty: d, seed: 3, onWin, onLose }))
    // The optimal loop run backwards climbs where it should descend.
    const rev = [...r.solution].reverse()
    expect(pathLength(r.cost, rev)).toBeGreaterThan(r.optimum)
    for (const v of rev.slice(1)) fireEvent.click(container.querySelector(`[data-node="${v}"]`)!)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onWin).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(secondsFor(d) * 1000) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
