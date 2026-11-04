// Trade Winds: the polar-diagram, landfall, current, monsoon and fog rules;
// every config × difficulty × seed is solver-verified within its supplies,
// heaving to loses, greedy steering loses at D3/D4; the component wins and
// loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import TradeWindsGame, {
  CONFIGS, CONFIG_IDS, TIERS, blankLevel, generate, initialState, isWon, step, solve, run,
  speedAt, idleWins, greedyWins, type Action, type Level,
} from '@/components/minigames/TradeWindsGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42]

/** 5×5 open sea, the wind blowing south (from the N) at force `str`. */
function sea(polar: 'lateen' | 'square' = 'lateen', str = 1): Level {
  const L = blankLevel(5, 5, polar)
  L.wind = [Array.from({ length: 25 }, () => ({ dir: 4, str }))]
  return L
}

describe('trade wind rules', () => {
  it('speed follows the polar diagram: slack into the wind, fastest on a reach', () => {
    const L = sea('lateen', 2)
    expect(speedAt(L, 12, 0, 0)).toBe(0) // N: dead into the wind
    expect(speedAt(L, 12, 0, 1)).toBe(1) // NE: close-hauled
    expect(speedAt(L, 12, 0, 2)).toBe(3) // E: beam reach
    expect(speedAt(L, 12, 0, 3)).toBe(3) // SE: broad reach
    expect(speedAt(L, 12, 0, 4)).toBe(2) // S: running
    const Q = sea('square', 2)
    expect(speedAt(Q, 12, 0, 1)).toBe(0) // square sails cannot point close-hauled
    expect(speedAt(Q, 12, 0, 2)).toBe(2)
    expect(speedAt(Q, 12, 0, 4)).toBe(3)
  })

  it('a run stops at land and docks at the next port', () => {
    const L = sea('lateen', 2)
    L.start = 10; L.land[13] = true; L.ports = [14, 12]
    let s = step(L, initialState(L), 2)! // E at 3 cells, but land at 13
    expect(s.pos).toBe(12) // docking only counts for the NEXT port (14), so 12 is passed as sea
    expect(s.target).toBe(0)
    const M = sea('lateen', 2); M.start = 10; M.ports = [12, 14]
    s = step(M, initialState(M), 2)!
    expect(s.pos).toBe(12); expect(s.target).toBe(1) // stopped in port mid-run
  })

  it('a current sets the ship one cell after it sails, and heaving to drifts too', () => {
    const L = sea(); L.start = 12; L.ports = [0]; L.current[12] = 6
    expect(step(L, initialState(L), -1)!.pos).toBe(11)
    L.wind[0][12] = { dir: 4, str: 0 } // calm: sails do nothing
    expect(step(L, initialState(L), 2)!.pos).toBe(11)
  })

  it('the monsoon reverses on the flip day', () => {
    const L = sea(); L.start = 12; L.ports = [0]
    L.wind = [L.wind[0].map(() => ({ dir: 1, str: 1 })), L.wind[0].map(() => ({ dir: 5, str: 1 }))]
    L.flip = 3
    expect(speedAt(L, 12, 2, 5)).toBe(0) // heading SW into the SW monsoon
    expect(speedAt(L, 12, 3, 5)).toBe(1) // running before the NE monsoon
  })

  it('fog bends an unsighted heading; a sunstone holds it true and runs out', () => {
    const L = sea('lateen', 1); L.start = 12; L.ports = [0]; L.fog[12] = true; L.drift[12] = 1; L.sunstones = 1
    expect(step(L, initialState(L), 2)!.pos).toBe(24) // E drifts to SE, a broad reach: 2 cells
    const s = step(L, initialState(L), 2 + 8)!
    expect(s.pos).toBe(14); expect(s.sun).toBe(1)
    expect(step(L, { ...initialState(L), sun: 1 }, 10)).toBeNull()
  })

  it('a headwind port needs tacking: the solver zig-zags', () => {
    const L = sea('lateen', 1); L.start = 22; L.ports = [2]
    const plan = solve(L)!
    expect(plan.length).toBeGreaterThan(2)
    expect(plan).not.toContain(0)
    expect(isWon(L, run(L, plan))).toBe(true)
  })
})

describe('trade wind levels', () => {
  it('every config × difficulty × seed is winnable within its supplies, and not trivial', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const looks = new Set<string>()
      for (const seed of SEEDS) {
        const L = generate(CONFIGS[id], d, seed)
        const tag = `${id} d${d} s${seed}`
        expect(L.rows, tag).toBe(TIERS[d].rows)
        expect(isWon(L, initialState(L)), tag).toBe(false)
        const plan = solve(L)!
        expect(plan, tag).toBeTruthy()
        expect(plan.length, tag).toBe(L.minTurns)
        expect(plan.length, tag).toBeLessThanOrEqual(TIERS[d].maxTurns)
        expect(L.budget, tag).toBe(L.minTurns + TIERS[d].slack)
        const end = run(L, plan)
        expect(isWon(L, end), tag).toBe(true)
        expect(end.turn, tag).toBeLessThanOrEqual(L.budget)
        // Heaving to all game loses.
        expect(idleWins(L), tag).toBe(false)
        // Greedy steering loses at D3/D4.
        if (d >= 3) expect(greedyWins(L), tag).toBe(false)
        // The fair proof never guesses a hidden fog drift.
        let s = initialState(L)
        for (const a of plan) { if (L.fog[s.pos] && a >= 0) expect(a, tag).toBeGreaterThanOrEqual(8); s = step(L, s, a)! }
        if (L.sunstones > 0) expect(solve({ ...L, sunstones: 0 }), `${tag} needs the sunstone`).toBeNull()
        looks.add(JSON.stringify([L.start, L.ports, L.land]))
      }
      expect(looks.size, `${id} d${d} varies by seed`).toBeGreaterThan(1)
    }
  })

  it('the monsoon really matters: sailing home before the flip is too slow', () => {
    for (const seed of SEEDS) {
      const L = generate(CONFIGS.monsoon, 3, seed)
      expect(L.flip).not.toBeNull()
      expect(solve({ ...L, wind: [L.wind[0]], flip: null }), `seed ${seed}`).toBeNull()
    }
  })

  it('square sails cannot head home from the Indies: E, NE and N are slack in the trades', () => {
    for (const seed of SEEDS) {
      const L = generate(CONFIGS['volta-do-mar'], 3, seed)
      for (const h of [0, 1, 2]) expect(speedAt(L, L.ports[0], 0, h)).toBe(0)
    }
  })
})

function clickAction(a: Action) {
  if (a < 0) { act(() => { fireEvent.click(screen.getByTestId('tw-wait')) }); return }
  if (a >= 8) act(() => { fireEvent.click(screen.getByTestId('tw-sun')) })
  act(() => { fireEvent.click(screen.getByTestId(`tw-h-${a % 8}`)) })
}

describe('TradeWindsGame component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(TradeWindsGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      const L = generate(CONFIGS[id], d, 3)
      expect(screen.getByTestId('tw-supplies').textContent).toContain(`Supplies ${L.budget}`)
      cleanup()
    }
  })

  for (const id of CONFIG_IDS) {
    it(`a solver-driven win calls onWin once (${id})`, () => {
      vi.useFakeTimers()
      const onWin = vi.fn(), onLose = vi.fn()
      const L = generate(CONFIGS[id], 2, 11)
      render(createElement(TradeWindsGame, { configId: id, difficulty: 2, seed: 11, onWin, onLose }))
      for (const a of solve(L)!) clickAction(a)
      expect(screen.getByTestId('tw-port').textContent).toContain(`${L.ports.length} / ${L.ports.length}`)
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
    })
  }

  it('heaving to until the supplies run out calls onLose once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const L = generate(CONFIGS['volta-do-mar'], 1, 5)
    render(createElement(TradeWindsGame, { configId: 'volta-do-mar', difficulty: 1, seed: 5, onWin, onLose }))
    for (let i = 0; i < L.budget; i++) {
      const btn = screen.queryByTestId('tw-wait')
      if (btn) act(() => { fireEvent.click(btn) })
    }
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
