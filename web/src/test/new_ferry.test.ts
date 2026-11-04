// River Crossing: every generated puzzle is solvable by BFS with a tier-
// appropriate number of crossings, the rules block what they should, and the
// component wins and loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import FerryGame, {
  CONFIG_IDS, CONFIGS, generatePuzzle, solve, cross, isDone, rulesFor, groupProblem, CROSSING_RANGE,
  type FerryState, type Puzzle,
} from '@/components/minigames/FerryGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006]

function replay(p: Puzzle, sol: number[][]): FerryState {
  let s: FerryState = { far: 0, boat: 0 }
  for (const load of sol) {
    const r = cross(p, s, load)
    if ('error' in r) throw new Error(r.error)
    s = r.state
  }
  return s
}

describe('ferry rules', () => {
  it('the classic wolf, goat and cabbage takes seven crossings', () => {
    const p = generatePuzzle('wolf-goat', 1, 1)
    expect(p.people.length).toBe(4)
    expect(p.optimal).toBe(7)
    // Taking the cabbage first leaves the wolf with the goat.
    const cab = p.people.findIndex(x => ['cabbage', 'grain', 'cheese', 'hay'].includes(x.role))
    const r = cross(p, { far: 0, boat: 0 }, [0, cab])
    expect('error' in r && r.error).toMatch(/would eat/)
    // Nobody but the farmer rows.
    expect('error' in cross(p, { far: 0, boat: 0 }, [cab])).toBe(true)
    // From D2 a boy rows too but does not keep order.
    const p2 = generatePuzzle('wolf-goat', 2, 1)
    const boy = p2.people.findIndex(x => x.role === 'boy')
    expect(boy).toBeGreaterThan(0)
    expect(groupProblem(p2, p2.people.map((_, i) => i).filter(i => i !== 0))).toMatch(/would eat/)
  })

  it('jealous-brothers and bandit rules', () => {
    const j = generatePuzzle('brothers-sisters', 2, 1)
    const man = j.people.findIndex(x => x.role === 'man' && x.pair === 0)
    const otherSister = j.people.findIndex(x => x.role === 'woman' && x.pair === 1)
    expect(groupProblem(j, [man, otherSister])).toMatch(/without her brother/)
    const e = generatePuzzle('pilgrims-bandits', 1, 1)
    const pil = e.people.findIndex(x => x.role === 'pilgrim'), bans = e.people.map((x, i) => (x.role === 'bandit' ? i : -1)).filter(i => i >= 0)
    expect(groupProblem(e, [pil, ...bans.slice(0, 2)])).toMatch(/outnumber/)
    expect(groupProblem(e, bans)).toBeNull()
  })

  it("Alcuin's cart-load family crosses in nine", () => {
    let found = false
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const p = generatePuzzle('heavy-family', 1, seed)
      if (p.people.length === 4 && p.maxWeight === 2 && p.people.every(x => x.weight <= 2)) { expect(p.optimal).toBe(9); found = true }
    }
    expect(found).toBe(true)
  })

  for (const id of CONFIG_IDS) for (const d of DIFFS) {
    it(`${id} d${d}: solvable, tier-sized and replayable for every seed`, () => {
      const shapes = new Set<string>()
      for (const seed of SEEDS) {
        const p = generatePuzzle(id, d, seed)
        expect(p.kind).toBe(CONFIGS[id].kind)
        const sol = solve(p)!
        expect(sol, `${id} d${d} ${seed}`).not.toBeNull()
        expect(sol.length).toBe(p.optimal)
        expect(isDone(p, replay(p, sol))).toBe(true)
        expect(p.optimal).toBeLessThanOrEqual(CROSSING_RANGE[d][1])
        expect(p.optimal).toBeGreaterThanOrEqual(CROSSING_RANGE[d][0] - (p.kind === 'escort' ? 2 : 0))
        const rules = rulesFor(d, p.optimal)
        expect(rules.cap).toBeGreaterThan(p.optimal)
        shapes.add(p.people.map(x => x.label + x.weight + x.rower).join() + p.seats + p.maxWeight)
      }
      if (d >= 2) expect(shapes.size, `${id} d${d} variety`).toBeGreaterThanOrEqual(2)
    })
  }

  it('every config is a different rule', () => {
    // The base configs are each a different rule; story-themed configs reuse one of them.
    const BASE = ['wolf-goat', 'brothers-sisters', 'heavy-family', 'pilgrims-bandits']
    expect(new Set(BASE.map(id => CONFIGS[id].kind)).size).toBe(BASE.length)
    for (const id of CONFIG_IDS) expect(BASE.map(b => CONFIGS[b].kind), id).toContain(CONFIGS[id].kind)
  })

  it('time budget: few crossings and a small cast at every tier', () => {
    expect(CROSSING_RANGE[1][1]).toBeLessThanOrEqual(9)
    expect(CROSSING_RANGE[4][1]).toBeLessThanOrEqual(15)
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const seed of SEEDS) {
      const p = generatePuzzle(id, d, seed)
      expect(p.optimal).toBeLessThanOrEqual(d === 1 ? 9 : 15)
      expect(p.people.length).toBeLessThanOrEqual(11)
      expect(rulesFor(d, p.optimal).cap).toBeLessThanOrEqual([27, 33, 26, 19][d - 1])
    }
  })

  it('gets bigger with difficulty', () => {
    for (const id of CONFIG_IDS) {
      const size = (d: Difficulty) => SEEDS.reduce((a, s) => a + generatePuzzle(id, d, s).optimal, 0)
      expect(size(4)).toBeGreaterThan(size(1))
    }
  })
})

function clickPerson(container: HTMLElement, i: number) {
  fireEvent.click(container.querySelector(`[data-person="${i}"]`)!)
}

describe('FerryGame component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(FerryGame, { configId: id, difficulty: d, seed: 5, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByTestId('ferry-trips')).toBeTruthy()
      cleanup()
    }
  })

  it('playing the solver’s answer calls onWin once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const p = generatePuzzle('brothers-sisters', 4, 3)
    const { container } = render(createElement(FerryGame, { configId: 'brothers-sisters', difficulty: 4, seed: 3, onWin, onLose }))
    for (const load of solve(p)!) {
      for (const i of load) act(() => clickPerson(container, i))
      act(() => { fireEvent.click(screen.getByText(/^Row /)) })
    }
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onWin).toHaveBeenCalledTimes(1)
    expect(onLose).not.toHaveBeenCalled()
  })

  it('illegal crossings are blocked at D1 but cost lives at D3, ending in onLose once', () => {
    vi.useFakeTimers()
    const p = generatePuzzle('wolf-goat', 3, 2)
    // Find a load that breaks the rules from the start.
    const bad = p.people.map((_, i) => i).filter(i => i > 0).map(i => [0, i]).find(l => 'error' in cross(p, { far: 0, boat: 0 }, l))!
    expect(bad).toBeTruthy()
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(FerryGame, { configId: 'wolf-goat', difficulty: 3, seed: 2, onWin, onLose }))
    for (let k = 0; k < 4; k++) {
      if (!screen.queryByText(/^Row /)) break
      for (const i of bad) act(() => clickPerson(container, i))
      act(() => { fireEvent.click(screen.getByText(/^Row /)) })
      for (const i of bad) { const el = container.querySelector(`[data-person="${i}"]`); if (el?.getAttribute('aria-label')?.includes('in boat')) act(() => clickPerson(container, i)) }
    }
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
    cleanup()

    const lose1 = vi.fn()
    const p1 = generatePuzzle('wolf-goat', 1, 2)
    const bad1 = p1.people.map((_, i) => i).filter(i => i > 0).map(i => [0, i]).find(l => 'error' in cross(p1, { far: 0, boat: 0 }, l))!
    const r1 = render(createElement(FerryGame, { configId: 'wolf-goat', difficulty: 1, seed: 2, onWin: () => {}, onLose: lose1 }))
    for (const i of bad1) act(() => clickPerson(r1.container, i))
    act(() => { fireEvent.click(screen.getByText(/^Row /)) })
    expect(screen.getByRole('status').textContent).toMatch(/would eat/)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(lose1).not.toHaveBeenCalled()
  })

  it('rowing back and forth past the crossing cap calls onLose once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const p = generatePuzzle('pilgrims-bandits', 4, 1)
    const cap = rulesFor(4, p.optimal).cap
    const { container } = render(createElement(FerryGame, { configId: 'pilgrims-bandits', difficulty: 4, seed: 1, onWin, onLose }))
    // One bandit and one pilgrim shuttle back and forth: always legal.
    const pil = p.people.findIndex(x => x.role === 'pilgrim'), ban = p.people.findIndex(x => x.role === 'bandit')
    for (let k = 0; k < cap + 2; k++) {
      if (!screen.queryByText(/^Row /)) break
      act(() => clickPerson(container, pil)); act(() => clickPerson(container, ban))
      act(() => { fireEvent.click(screen.getByText(/^Row /)) })
    }
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
