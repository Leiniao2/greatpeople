// Quarantine: the SIR spread rules and each config's move, every config ×
// difficulty × seed is solver-verified (winnable within its limit, idle play
// loses, greedy loses at D3/D4), and the component wins and loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import QuarantineGame, {
  CONFIG_IDS, CONFIGS, generate, initialState, step, solve, isWon, playOut, idle, greedy, served, sickPop,
  S, I, R, V, H, type Action, type Level, type State, type Mechanic,
} from '@/components/minigames/QuarantineGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 7, 42, 1006]

/** A line of towns 0–1–2–… with the given contact times. */
function line(mechanic: Mechanic, ws: number[], extra: Partial<Level> = {}): Level {
  const n = ws.length + 1
  return {
    mechanic, cols: n, rows: 1,
    nodes: Array.from({ length: n }, (_, i) => ({ x: 20 + i * 40, y: 30, pop: 1, kind: 'town' as const, dock: false })),
    edges: ws.map((w, i) => ({ a: i, b: i + 1, w, len: 40 })),
    index: [0], protected: [], dur: 3, budget: 2, limit: Infinity, best: 0, slack: 0, maxTurns: 30,
    ships: [], beds: 1, hold: 4, pause: 2, cooldown: 2, warm: 0, source: -1, pre: 2, walk: [], ...extra,
  }
}

function replay(L: Level, plan: Action[], from?: State): State {
  let s = from ?? initialState(L)
  for (const a of plan) {
    const nx = step(L, s, a)
    expect(nx, JSON.stringify(a)).not.toBeNull()
    s = nx!
  }
  return s
}

const wait: Action = { t: 'wait' }

describe('quarantine spread rules', () => {
  it('a busy road passes it next turn, a quiet road after two; the sick recover after 3 turns', () => {
    const L = line('seal', [1, 2])
    let s = initialState(L)
    s = step(L, s, wait)!
    expect(s.st).toEqual([I, I, S])
    s = step(L, s, wait)!
    expect(s.st[2]).toBe(S) // quiet road: one turn of contact so far
    s = step(L, s, wait)!
    expect(s.st).toEqual([R, I, I])
    expect(s.cas).toBe(3)
    expect(isWon(L, runAll(L, s))).toBe(true)
  })

  it('a protected place falling ill loses', () => {
    const L = line('seal', [1], { protected: [1] })
    expect(step(L, initialState(L), wait)!.lost).toMatch(/protected/)
  })

  it('eyam: a sealed village stops spreading, but counts twice and burns twice as long', () => {
    const L = line('seal', [1, 1])
    const s = step(L, initialState(L), { t: 'node', n: 0 })!
    expect(s.sealed[0]).toBe(true)
    expect(s.cas).toBe(2)
    expect(s.st).toEqual([I, S, S])
    expect(step(L, initialState(L), { t: 'node', n: 1 })).toBeNull() // only sick villages seal
    const end = runAll(L, s)
    expect(end.turn).toBe(6)
    expect(end.st).toEqual([R, S, S])
  })

  it('venice: an unheld ship infects its quay; a held one waits 4 turns on a bed', () => {
    const L = line('lazaretto', [1], { index: [], ships: [{ t: 1, dock: 1 }, { t: 2, dock: 0 }] })
    let s = initialState(L)
    expect(isWon(L, s)).toBe(false)
    s = step(L, s, { t: 'ship', s: 0 })!
    expect(s.ship[0]).toBe(4)
    expect(step(L, s, { t: 'ship', s: 1 })).toBeNull() // one bed only
    s = step(L, s, wait)! // turn 1→2: ship 0 held, nothing docks
    expect(s.st).toEqual([S, S])
    s = step(L, s, wait)! // ship 1 docks at quay 0
    expect(s.st[0]).toBe(I)
    const L2 = { ...L, beds: 2 }
    let s2 = step(L2, step(L2, initialState(L2), wait)!, wait)!
    expect(s2.st[1]).toBe(I)
    s2 = step(L2, s2, { t: 'node', n: 1 })!
    expect(s2.st[1]).toBe(H)
    for (let k = 0; k < 4; k++) s2 = step(L2, s2, wait) ?? s2
    expect(s2.st[1]).toBe(R)
  })

  it('jenner: vaccines go in before the start and break the chain', () => {
    const L = line('vaccinate', [1, 1, 1], { budget: 1, protected: [3] })
    let s = initialState(L)
    expect(step(L, s, wait)).toBeNull()
    s = step(L, s, { t: 'node', n: 2 })!
    expect(s.st[2]).toBe(V)
    s = step(L, s, { t: 'start' })!
    expect(step(L, s, { t: 'node', n: 1 })).toBeNull()
    const end = runAll(L, s)
    expect(isWon(L, end)).toBe(true)
    expect(end.cas).toBe(2)
  })

  it('flu: a distancing order freezes contact on every road, the sick still recover', () => {
    const L = line('distance', [1, 1])
    let s = step(L, initialState(L), { t: 'order' })!
    expect(s.st).toEqual([I, S, S])
    s = step(L, s, wait)!
    expect(s.st).toEqual([I, S, S])
    expect(step(L, s, wait)!.st).toEqual([R, I, S])
    const free = step(L, initialState(L), wait)!
    expect(sickPop(L, free)).toBe(2)
  })

  it('broad street: houses die by their walking-nearest pump; a wrong handle moves them on', () => {
    // 0 house — 1 pump(A) — 2 house — 3 pump(B, source) ; house 2 is nearer A.
    const nodes = [0, 1, 2, 3].map(i => ({ x: i * 40, y: 0, pop: 1, kind: (i % 2 ? 'pump' : 'town') as 'pump' | 'town', dock: false }))
    const edges = [{ a: 0, b: 1, w: 1, len: 10 }, { a: 1, b: 2, w: 1, len: 10 }, { a: 2, b: 3, w: 1, len: 15 }]
    const walk = [[0, 10, 20, 35], [10, 0, 10, 25], [20, 10, 0, 15], [35, 25, 15, 0]]
    const L: Level = { ...line('pump', [1]), nodes, edges, walk, index: [], source: 3, pre: 0, budget: 2, limit: 10 }
    expect(served(L, [false, true, false, true])).toEqual([])
    expect(served(L, [false, false, false, true])).toEqual([0, 2])
    const s = step(L, initialState(L), { t: 'node', n: 1 })!
    expect(s.deaths).toEqual([1, 0, 1, 0])
    expect(isWon(L, step(L, s, { t: 'node', n: 3 })!)).toBe(true)
  })
})

function runAll(L: Level, s: State): State {
  while (!s.lost && !isWon(L, s)) s = step(L, s, s.started ? wait : { t: 'start' })!
  return s
}

describe('quarantine levels', () => {
  it('every config × difficulty × seed is winnable, idle loses, greedy loses at D3/D4', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const looks = new Set<string>()
      for (const seed of SEEDS) {
        const tag = `${id} d${d} s${seed}`
        const L = generate(CONFIGS[id].mechanic, d, seed)
        const s0 = initialState(L)
        expect(isWon(L, s0), tag).toBe(false)
        expect(L.limit, tag).toBeLessThan(Infinity)
        const sol = solve(L)!
        expect(sol, tag).not.toBeNull()
        const end = replay(L, sol.plan)
        expect(isWon(L, end), tag).toBe(true)
        expect(end.lost).toBeNull()
        expect(isWon(L, playOut(L, idle)), `${tag} idle`).toBe(false)
        if (d >= 3) expect(isWon(L, playOut(L, greedy)), `${tag} greedy`).toBe(false)
        looks.add(JSON.stringify([L.edges, L.index, L.protected, L.source]))
      }
      expect(looks.size, `${id} d${d} varies by seed`).toBeGreaterThan(1)
    }
  })

  it('generation is deterministic', () => {
    expect(JSON.stringify(generate('seal', 3, 9))).toBe(JSON.stringify(generate('seal', 3, 9)))
  })
})

function click(a: Action) {
  act(() => {
    if (a.t === 'wait') fireEvent.click(screen.getByTestId('q-wait'))
    else if (a.t === 'start') fireEvent.click(screen.getByTestId('q-start'))
    else if (a.t === 'order') fireEvent.click(screen.getByTestId('q-order'))
    else if (a.t === 'ship') fireEvent.click(screen.getByTestId(`q-ship-${a.s}`))
    else fireEvent.click(screen.getByTestId(`q-node-${a.n}`))
  })
}

describe('QuarantineGame component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(QuarantineGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByTestId('q-turn').textContent).toContain(`Turn ${initialState(generate(CONFIGS[id].mechanic, d, 3)).turn} `)
      cleanup()
    }
  })

  for (const id of CONFIG_IDS) {
    it(`a solver-driven win calls onWin once (${id})`, () => {
      vi.useFakeTimers()
      const onWin = vi.fn(), onLose = vi.fn()
      const L = generate(CONFIGS[id].mechanic, 2, 11)
      render(createElement(QuarantineGame, { configId: id, difficulty: 2, seed: 11, onWin, onLose }))
      for (const a of solve(L)!.plan) click(a)
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
    })

    it(`doing nothing calls onLose once (${id})`, () => {
      vi.useFakeTimers()
      const onWin = vi.fn(), onLose = vi.fn()
      render(createElement(QuarantineGame, { configId: id, difficulty: 3, seed: 5, onWin, onLose }))
      if (CONFIGS[id].mechanic === 'vaccinate') click({ t: 'start' })
      click({ t: 'wait' })
      if (screen.queryByTestId('q-run')) act(() => { fireEvent.click(screen.getByTestId('q-run')) })
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onLose).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
    })
  }
})
