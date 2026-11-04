// Castrum: the rule checker enforces each camp's rule book; every config ×
// difficulty × seed has a known layout that passes, and the solver proves the
// clues and givens allow that layout alone; the givens alone never pass; a
// naive layout that ignores the numbers fails; the component wins on the
// layout and loses to the clock, exactly once each.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import CastrumGame, {
  CONFIGS, CONFIG_IDS, generate, evaluate, solveCamp, roadsFrom, gatesOk, gateKey, tierFor, seesRock,
  type Camp, type Cell, type CampRules,
} from '@/components/minigames/CastrumGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006]

const rulesOf = (id: string): CampRules => CONFIGS[id]
/** A blank camp for rule tests: clues and stock read off the given board. */
function campFor(id: string, n: number, cells: Cell[], rock: boolean[] = Array(n * n).fill(false)): Camp {
  const rowClue = Array(n).fill(0), colClue = Array(n).fill(0)
  const stock = { T: 0, P: 0, G: 0, H: 0 }
  cells.forEach((v, i) => { if (v) { stock[v]++; rowClue[Math.floor(i / n)]++; colClue[i % n]++ } })
  return { n, rules: rulesOf(id), rock, rowClue, colClue, stock, given: Array(n * n).fill(undefined), givenGates: [], solution: { cells, gates: [] }, unique: false }
}
const board = (rows: string[]): Cell[] => rows.join('').split('').map(ch => (ch === '.' ? null : ch as Cell))
const status = (camp: Camp, cells: Cell[], gates: string[]) => Object.fromEntries(evaluate(camp, cells, gates).rules.map(r => [r.id, r.ok]))

describe('castrum rules', () => {
  it('gates make roads: crossing, north–south, south to the commander', () => {
    const n = 5, none: Cell[] = Array(25).fill(null)
    const cross = [gateKey('N', 2), gateKey('S', 2), gateKey('W', 1), gateKey('E', 1)]
    expect(gatesOk(n, rulesOf('polybius'), cross)).toBe(true)
    expect(gatesOk(n, rulesOf('polybius'), [gateKey('N', 2), gateKey('S', 3), gateKey('W', 1), gateKey('E', 1)])).toBe(false)
    const road = roadsFrom(n, rulesOf('polybius'), cross, none)
    expect(road.filter(Boolean).length).toBe(9)
    expect(road[1 * 5 + 4] && road[4 * 5 + 2]).toBe(true)
    expect(gatesOk(n, rulesOf('milecastle'), [gateKey('N', 1), gateKey('S', 1)])).toBe(true)
    expect(gatesOk(n, rulesOf('milecastle'), [gateKey('N', 1), gateKey('S', 1), gateKey('E', 0)])).toBe(false)
    const han = [...none]; han[1 * 5 + 3] = 'P'
    const hr = roadsFrom(n, rulesOf('han'), [gateKey('S', 3)], han)
    expect([0, 1, 2, 3, 4].map(r => hr[r * 5 + 3])).toEqual([false, false, true, true, true])
    expect(gatesOk(n, rulesOf('han'), [gateKey('N', 3)])).toBe(false)
  })

  it('polybius: tents apart, doors north, praetorium at the crossroads, granary beside it, horses by a road, intervallum clear', () => {
    const n = 7
    const gates = [gateKey('N', 3), gateKey('S', 3), gateKey('W', 3), gateKey('E', 3)]
    const good = board([
      '.......',
      '.T.....',
      '.GP....',
      '.......',
      '..H..T.',
      '.......',
      '.......',
    ])
    const camp = campFor('polybius', n, good)
    expect(evaluate(camp, good, gates).solved).toBe(true)
    // A tent whose door (north) is blocked by a building.
    const front = board(['.......', '.......', '.GP....', '.T.....', '..H..T.', '.......', '.......'])
    expect(status(campFor('polybius', n, front), front, gates).front).toBe(false)
    // Tents touching at a corner.
    const touch = board(['.......', '.......', '.GP....', '.T.....', '..T....', '..H....', '.......'])
    expect(status(campFor('polybius', n, touch), touch, gates).tents).toBe(false)
    // Praetorium not at the crossing; granary not beside it.
    const far = board(['.......', '.P.....', '.......', '.......', '..H..T.', '..G....', '.......'])
    const s = status(campFor('polybius', n, far), far, gates)
    expect(s.hq).toBe(false)
    expect(s.granary).toBe(false)
    // In the intervallum (outer ring), and on the road.
    const ring = board(['T......', '.......', '.GP....', '.......', '..H....', '.......', '.......'])
    expect(status(campFor('polybius', n, ring), ring, gates).ground).toBe(false)
    const onRoad = board(['.......', '.......', '.GP....', '...T...', '..H....', '.......', '.......'])
    expect(status(campFor('polybius', n, onRoad), onRoad, gates).ground).toBe(false)
    // Horses away from every road.
    const horse = board(['.......', '.H.....', '.GP....', '.......', '.....T.', '.......', '.......'])
    expect(status(campFor('polybius', n, horse), horse, gates).horses).toBe(false)
    // Wrong clue counts.
    expect(status(camp, good.map((v, i) => (i === 33 ? null : v)), gates).clues).toBe(false)
  })

  it('marching: tents only in side-by-side pairs', () => {
    const n = 5, gates = [gateKey('N', 2), gateKey('S', 2), gateKey('W', 2), gateKey('E', 2)]
    const pairs = board(['TT...', '.....', '.P.H.', '.....', '...TT'])
    expect(status(campFor('marching', n, pairs), pairs, gates).tents).toBe(true)
    const single = board(['T....', '.....', '.P.H.', '.....', '...TT'])
    expect(status(campFor('marching', n, single), single, gates).tents).toBe(false)
    const stacked = board(['TT...', 'TT...', '.P.H.', '.....', '.....'])
    expect(status(campFor('marching', n, stacked), stacked, gates).tents).toBe(false)
  })

  it('milecastle: barracks touch the road, granary by a gate', () => {
    const n = 5, gates = [gateKey('N', 2), gateKey('S', 2)]
    const ok = board(['.G...', '...T.', '.....', '.T...', '.....'])
    expect(evaluate(campFor('milecastle', n, ok), ok, gates).solved).toBe(true)
    const off = board(['.G...', '....T', '.....', '.T...', '.....'])
    expect(status(campFor('milecastle', n, off), off, gates)['road-tents']).toBe(false)
    const g = board(['.....', '.G.T.', '.....', '.T...', '.....'])
    expect(status(campFor('milecastle', n, g), g, gates).granary).toBe(false)
  })

  it('masada: tents see the rock past nothing built; command post on the rock', () => {
    const n = 5, rock = Array(25).fill(false); rock[12] = true
    const ok = board(['..T..', '.....', '.P...', '.G...', '....T'])
    // (4,4) does not see the rock at (2,2).
    expect(seesRock(n, rock, ok, 2)).toBe(true)
    expect(seesRock(n, rock, ok, 24)).toBe(false)
    const blocked = board(['..T..', '..G..', '.....', '.....', '.....'])
    expect(seesRock(n, rock, blocked, 2)).toBe(false)
    const camp = campFor('masada', n, ok, rock)
    const s = status(camp, ok, [])
    expect(s.sight).toBe(false)
    expect(s.hq).toBe(true)
    expect(s.granary).toBe(true)
  })

  it('han: one south gate, road to the commander in the north half, doors south', () => {
    const n = 6, gates = [gateKey('S', 3)]
    const ok = board(['.T....', '...P..', '..H...', '......', 'T.....', '......'])
    expect(evaluate(campFor('han', n, ok), ok, gates).solved).toBe(true)
    const low = board(['.T....', '......', '..H...', '...P..', 'T.....', '......'])
    expect(status(campFor('han', n, low), low, gates).hq).toBe(false)
    const door = board(['.T....', '.H.P..', '..H...', '......', '......', '......'])
    expect(status(campFor('han', n, door), door, gates).front).toBe(false)
  })
})

describe('castrum puzzles', () => {
  it('every config × difficulty × seed: the layout passes, is unique, and the start does not', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const seen = new Set<string>()
      for (const seed of SEEDS) {
        const camp = generate(id, d, seed)
        const tier = tierFor(camp.rules, d, CONFIGS[id].pace)
        expect(camp.n).toBe(tier.n)
        expect(camp.stock.T).toBe(tier.tents)
        expect(evaluate(camp, camp.solution.cells, camp.solution.gates).solved, `${id} d${d} s${seed}`).toBe(true)
        expect(camp.unique, `${id} d${d} s${seed} unique`).toBe(true)
        const { solutions, exhausted } = solveCamp(camp, 3)
        expect(exhausted).toBe(false)
        expect(solutions.length, `${id} d${d} s${seed} solutions`).toBe(1)
        expect(solutions[0].cells).toEqual(camp.solution.cells)
        // Givens are consistent with the layout and leave real work to do.
        camp.given.forEach((g, i) => { if (g !== undefined) expect(g === 'X' ? null : g).toBe(camp.solution.cells[i]) })
        const start = camp.given.map(g => (g === 'X' || g === undefined ? null : g)) as Cell[]
        expect(evaluate(camp, start, camp.givenGates).solved).toBe(false)
        const placed = start.filter(Boolean).length, total = camp.solution.cells.filter(Boolean).length
        expect(placed, `${id} d${d} s${seed} givens`).toBeLessThan(total)
        seen.add(JSON.stringify(camp.solution))
      }
      expect(seen.size, `${id} d${d}`).toBeGreaterThanOrEqual(SEEDS.length - 1)
    }
  })

  it('the solver is sound: without givens it still finds the true layout among the camps it counts', () => {
    for (const id of CONFIG_IDS) for (const d of [1, 2] as Difficulty[]) for (const seed of SEEDS.slice(0, 3)) {
      const camp = generate(id, d, seed)
      const bare: Camp = { ...camp, given: Array(camp.n * camp.n).fill(undefined), givenGates: [] }
      const { solutions, exhausted } = solveCamp(bare, 5000, 2_000_000)
      if (exhausted) continue
      expect(solutions.some(s => s.cells.join() === camp.solution.cells.join() && s.gates.join() === camp.solution.gates.join()), `${id} d${d} s${seed}`).toBe(true)
      for (const s of solutions) expect(evaluate(bare, s.cells, s.gates).solved).toBe(true)
    }
  })

  it('a naive camp — the right roads, buildings at the first legal plots, ignoring the numbers — fails from D2', () => {
    for (const id of CONFIG_IDS) for (const d of [2, 3, 4] as Difficulty[]) {
      let failed = 0
      for (const seed of SEEDS) {
        const camp = generate(id, d, seed)
        const cells: Cell[] = camp.given.map(g => (g === 'X' || g === undefined ? null : g)) as Cell[]
        const gates = camp.solution.gates
        for (const t of ['P', 'G', 'H', 'T'] as const) {
          for (let i = 0; i < cells.length && cells.filter(v => v === t).length < camp.stock[t]; i++) {
            if (cells[i] || camp.given[i] !== undefined) continue
            cells[i] = t
            const ev = evaluate(camp, cells, gates).rules.filter(r => !['clues', 'stock'].includes(r.id))
            if (ev.some(r => !r.ok && r.bad.includes(i)) || ev.some(r => r.id === 'hq' && !r.ok && t === 'P')) cells[i] = null
          }
        }
        if (!evaluate(camp, cells, gates).solved) failed++
      }
      expect(failed, `${id} d${d}`).toBeGreaterThanOrEqual(SEEDS.length - 1)
    }
  })

  it('is deterministic in seed', () => {
    expect(generate('han', 3, 9)).toEqual(generate('han', 3, 9))
    expect(generate('han', 3, 9).solution).not.toEqual(generate('han', 3, 10).solution)
  })
})

describe('castrum component', () => {
  const props = (id: string, d: Difficulty, seed: number, onWin = () => {}, onLose = () => {}) => ({ configId: id, difficulty: d, seed, onWin, onLose })

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(CastrumGame, props(id, d, 1)))
      const camp = generate(id, d, 1)
      expect(container.querySelectorAll('[data-cell]').length).toBe(camp.n ** 2)
      expect(container.querySelectorAll('[data-rowclue]').length).toBe(camp.n)
      expect(container.querySelectorAll('[data-rule]').length).toBeGreaterThanOrEqual(5)
      unmount()
    }
  })

  it('laying out the camp wins exactly once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of [1, 4] as Difficulty[]) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(CastrumGame, props(id, d, 5, onWin, onLose)))
      const camp = generate(id, d, 5)
      for (const g of camp.solution.gates) if (!camp.givenGates.includes(g)) fireEvent.click(container.querySelector(`[data-gate="${g}"]`)!)
      camp.solution.cells.forEach((v, i) => {
        if (!v || camp.given[i] !== undefined) return
        fireEvent.click(container.querySelector(`[data-tool="${v}"]`)!)
        fireEvent.click(container.querySelector(`[data-cell="${i}"]`)!)
      })
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      // Further taps do nothing; the clock has stopped.
      fireEvent.click(container.querySelector('[data-cell="0"]')!)
      act(() => { vi.advanceTimersByTime(400_000) })
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('the clock running out loses exactly once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(CastrumGame, props('marching', 1, 3, onWin, onLose)))
    act(() => { vi.advanceTimersByTime(tierFor(CONFIGS.marching, 1, CONFIGS.marching.pace).seconds * 1000 + 100) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
