// Supply Lines: the march rules (rations, fodder, slow trains, forage, depots,
// winter, snow, fleet, plank roads), every config × difficulty × seed is
// planner-verified winnable while doing nothing and the naive plans lose, and
// the component wins and loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import LogisticsGame, {
  CONFIG_IDS, CONFIGS, STARVE, makeInstance, simulate, solve, naivePlans, emptyPlan, validate, legDays,
  nextOptions, routeComplete, planCost, allRoutes,
  type Instance, type MapNode, type MapEdge, type Plan,
} from '@/components/minigames/LogisticsGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 7, 42]

/** A three-town line: start —e0— mid —e1— goal. */
function line(over: Partial<Instance> = {}, e0: Partial<MapEdge> = {}, e1: Partial<MapEdge> = {}): Instance {
  const node = (layer: number, depot: boolean): MapNode => ({ name: `n${layer}`, layer, row: 0.5, depot, fleetDay: null, dist: layer * 2 })
  return {
    configId: 'test', mode: 'napoleon', difficulty: 1,
    nodes: [node(0, false), node(1, true), node(2, false)],
    edges: [{ a: 0, b: 1, days: 2, forage: 0, kind: 'road', ...e0 }, { a: 1, b: 2, days: 2, forage: 0, kind: 'road', ...e1 }],
    start: 0, goal: 2, roundTrip: false,
    men0: 10, ele0: 0, eleEat: 2,
    cartCap: 20, fodder: 1, laneCap: 10, cartCost: 1, depotCost: 5, depotStock: 100, pack: 3,
    budget: 50, maxCarts: 40, maxDepots: 2,
    winterDay: null, passClose: null, deadline: null, plankWidth: 99, fleetWait: 3,
    target: 1, eleTarget: 0, best: { route: [], carts: 0, depots: [] }, bestMen: 0,
    ...over,
  }
}
const P = (carts: number, depots: number[] = [], route = [0, 1, 2]): Plan => ({ route, carts, depots })

describe('supply line rules', () => {
  it('men eat 1 a day per 1,000 and carry their packs; hunger kills', () => {
    const inst = line()
    const r = simulate(inst, P(0))
    // 30 rations in packs feed 10k for 3 days; day 4 is short by 10.
    expect(r.log[3].food).toBeLessThan(0.2)
    expect(r.log[3].men).toBeGreaterThan(9.8)
    expect(r.log[4].men).toBeLessThan(r.log[3].men - 10 * STARVE + 0.01)
    expect(r.day).toBe(4)
  })

  it('carts carry food but eat fodder, and a long train slows every leg', () => {
    const inst = line()
    expect(legDays(inst, inst.edges[0], 0)).toBe(2)
    expect(legDays(inst, inst.edges[0], 5)).toBe(3)
    expect(legDays(inst, inst.edges[0], 10)).toBe(4)
    const r = simulate(inst, P(2))
    expect(r.log[0].food).toBe(2 * 20 + 10 * 3)
    // Day 1: 10 for the men + 2 for the animals.
    expect(r.log[1].food).toBeCloseTo(70 - 12, 6)
    expect(simulate(inst, P(2)).men).toBeGreaterThan(simulate(inst, P(0)).men)
  })

  it('the rocket equation: past cartCap / fodder days even a cart alone runs dry', () => {
    const inst = line({ men0: 0, pack: 0, laneCap: 1e9 }, { days: 12 }, { days: 12 })
    const r = simulate(inst, P(3))
    expect(r.log[20].carts).toBe(3)
    expect(r.log[21].carts).toBeLessThan(3)
  })

  it('forage feeds the march; a burnt road gives nothing; a stripped road gives nothing twice', () => {
    const fed = simulate(line({}, { forage: 10 }, { forage: 10, days: 4 }), P(0)).men
    expect(fed).toBeGreaterThan(9.7)
    expect(simulate(line({}, { forage: 10 }, { forage: 10, days: 4, kind: 'burnt' }), P(0)).men).toBeLessThan(fed - 0.5)
    const rt = line({ roundTrip: true, goal: 1 }, { forage: 10 })
    expect(routeComplete(rt, [0, 1, 0])).toBe(true)
    const r = simulate(rt, { route: [0, 1, 0], carts: 0, depots: [] })
    // Out on 10 a day (plus packs); back on the stripped road, packs only.
    expect(r.log[2].food).toBeCloseTo(30, 0)
    expect(r.log[4].food).toBeCloseTo(10, 0)
  })

  it('a depot refills carts and packs, from its stock, and costs budget', () => {
    const inst = line({ depotStock: 25, laneCap: 1e9 })
    const r = simulate(inst, P(1, [1]))
    expect(r.log[2].food).toBeCloseTo(r.log[2].carts * 20 + r.log[2].men * 3, 6)
    expect(r.log[2].event).toMatch(/Resupplied/)
    expect(planCost(inst, P(3, [1]))).toBe(8)
    expect(validate(line({ budget: 7 }), P(3, [1]))).toMatch(/budget/)
    expect(validate(inst, P(0, [0]))).toMatch(/depot/)
    expect(validate(inst, P(0, [], [0, 1]))).toMatch(/route/)
  })

  it('winter makes everything cost 1.5×; snow on a pass after its day kills men and elephants', () => {
    const warm = simulate(line(), P(4)).log[3].food
    const cold = simulate(line({ winterDay: 2 }), P(4)).log[3].food
    expect(warm - cold).toBeCloseTo(0.5 * 14, 1)
    const alps = line({ ele0: 5, passClose: 2, laneCap: 1e9 }, {}, { kind: 'pass' })
    const late = simulate(alps, P(10))
    const early = simulate({ ...alps, passClose: 9 }, P(10))
    expect(early.ele).toBeCloseTo(5, 6)
    expect(late.ele).toBeLessThan(early.ele * 0.5)
    expect(late.men).toBeLessThan(early.men * 0.75)
  })

  it('the fleet only supplies a bay on its day: the army waits for it, or finds it gone', () => {
    const base = line({ mode: 'alexander', depotCost: 0 })
    base.nodes[1] = { ...base.nodes[1], fleetDay: 5 }
    const r = simulate(base, P(0, [1]))
    expect(r.log.find(l => l.event === 'Waiting for the fleet')).toBeTruthy()
    expect(r.log.find(l => l.event?.startsWith('Resupplied'))!.day).toBe(5)
    base.nodes[1] = { ...base.nodes[1], fleetDay: -5 }
    expect(simulate(base, P(0, [1])).log.some(l => l.event === 'The fleet has sailed')).toBe(true)
  })

  it('a plank road leaves the extra carts (and their loads) behind', () => {
    const inst = line({ plankWidth: 2, fodder: 0 }, {}, { kind: 'plank' })
    const r = simulate(inst, P(5))
    expect(r.log.find(l => l.event?.includes('left at the gorge'))!.carts).toBe(2)
  })

  it('routes advance one layer at a time; Napoleon must come back', () => {
    const inst = makeInstance('napoleon-1812', 1, 1)
    expect(nextOptions(inst, [inst.start]).every(n => inst.nodes[n].layer === 1)).toBe(true)
    for (const r of allRoutes(inst)) {
      expect(r[0]).toBe(inst.start)
      expect(r[r.length - 1]).toBe(inst.start)
      expect(r).toContain(inst.goal)
    }
  })
})

describe('supply line instances', () => {
  it('every config × difficulty × seed: the planner wins, doing nothing loses, naive plans lose at D3–D4', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const looks = new Set<string>()
      for (const seed of SEEDS) {
        const tag = `${id} d${d} s${seed}`
        const inst = makeInstance(id, d, seed)
        expect(inst.mode).toBe(CONFIGS[id].mode)
        // Not won at the start: the empty plan cannot even march.
        expect(validate(inst, emptyPlan(inst)), tag).not.toBe('')
        expect(simulate(inst, emptyPlan(inst)).won, tag).toBe(false)
        const best = simulate(inst, inst.best)
        expect(best.won, tag).toBe(true)
        expect(planCost(inst, inst.best)).toBeLessThanOrEqual(inst.budget)
        const naive = naivePlans(inst)
        expect(simulate(inst, naive.nothing).won, `${tag} nothing`).toBe(false)
        if (d >= 3) for (const [k, p] of Object.entries(naive)) expect(simulate(inst, p).won, `${tag} ${k}`).toBe(false)
        expect(inst.target).toBeLessThan(inst.men0)
        looks.add(JSON.stringify(inst.edges.map(e => [e.a, e.b, e.days, e.forage, e.kind])))
      }
      expect(looks.size, `${id} d${d} varies by seed`).toBeGreaterThan(1)
    }
  })

  it('generation is deterministic and the planner finds the stored best plan', () => {
    const a = makeInstance('redball-1944', 3, 5), b = makeInstance('redball-1944', 3, 5)
    expect(a).toEqual(b)
    expect(simulate(a, solve(a).plan).men).toBeCloseTo(a.bestMen, 6)
  })

  it('harder levels march farther', () => {
    for (const id of CONFIG_IDS) {
      const legs = (d: Difficulty) => Math.max(...makeInstance(id, d, 1).nodes.map(n => n.layer))
      expect(legs(4)).toBeGreaterThan(legs(1))
    }
  })
})

function playPlan(plan: Plan) {
  for (const n of plan.route.slice(1)) fireEvent.click(screen.getByTestId(`node-${n}`))
  if (plan.depots.length) {
    fireEvent.click(screen.getByTestId('mode-depot'))
    for (const n of plan.depots) fireEvent.click(screen.getByTestId(`node-${n}`))
  }
  fireEvent.change(screen.getByTestId('carts'), { target: { value: String(plan.carts) } })
  fireEvent.click(screen.getByTestId('march'))
}

describe('LogisticsGame component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(LogisticsGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByTestId('lg-map')).toBeTruthy()
      expect(screen.getByTestId('march')).toBeTruthy()
      cleanup()
    }
  })

  for (const id of CONFIG_IDS) {
    it(`the planner's plan, played by taps, calls onWin once (${id})`, () => {
      vi.useFakeTimers()
      const onWin = vi.fn(), onLose = vi.fn()
      const inst = makeInstance(id, 2, 11)
      render(createElement(LogisticsGame, { configId: id, difficulty: 2, seed: 11, onWin, onLose }))
      playPlan(inst.best)
      expect(screen.getByTestId('lg-chart')).toBeTruthy()
      for (let i = 0; i < 80; i++) act(() => { vi.advanceTimersByTime(200) })
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
    })
  }

  it('marching the shortest road with nothing calls onLose once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const inst = makeInstance('zhuge-liang', 3, 4)
    render(createElement(LogisticsGame, { configId: 'zhuge-liang', difficulty: 3, seed: 4, onWin, onLose }))
    playPlan(naivePlans(inst).nothing)
    for (let i = 0; i < 80; i++) act(() => { vi.advanceTimersByTime(200) })
    act(() => { vi.advanceTimersByTime(2000) })
    fireEvent.click(screen.queryByTestId('march') ?? document.body)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('an unfinished route cannot march', () => {
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(LogisticsGame, { configId: 'hannibal-alps', difficulty: 1, seed: 2, onWin, onLose }))
    fireEvent.click(screen.getByTestId('march'))
    expect(screen.getByTestId('lg-msg').textContent).toMatch(/route/)
    expect(screen.queryByTestId('lg-chart')).toBeNull()
    expect(onWin).not.toHaveBeenCalled()
    expect(onLose).not.toHaveBeenCalled()
  })
})
