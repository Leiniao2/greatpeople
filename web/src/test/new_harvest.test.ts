// Harvest: the season rules of each config, every config × difficulty × seed
// is won by the max–min solver in EVERY forecast scenario, doing nothing and
// (at D3–D4) the naive greedy sower lose, and the component settles once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import HarvestGame, {
  CONFIGS, CONFIG_IDS, generate, initialState, step, advance, isWon, makeSolver, playPolicy, greedyYield, consistentMask,
  type Action, type Level, type Scenario, type State,
} from '@/components/minigames/HarvestGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 7, 42]

const S0: Scenario = { shift: 0, cold: 99, rain: [0, 99], blight: 99, blightCrop: -1, storms: [] }
function mini(id: string, over: Partial<Level>, scen: Partial<Scenario> = {}): Level {
  const cfg = CONFIGS[id]
  return {
    kind: cfg.kind, crops: cfg.crops, fields: [{ elev: 0, soil: 1, paddy: false }, { elev: 0, soil: 1, paddy: false }, { elev: 0, soil: 1, paddy: false }],
    weeks: 8, drain: [0, 0, 0], dry: [99, 99, 99], temp: new Array(8).fill(3), term0: 0,
    scenarios: [{ ...S0, ...scen }], actual: 0, quota: 99, best: 0, greedy: 0, ...over,
  }
}
const run = (lv: Level, st: State, as: Action[]) => as.reduce((s, a) => { const n = step(lv, s, a); expect(n).not.toBeNull(); return n! }, st)
const wait: Action = { t: 'wait' }

describe('harvest rules', () => {
  it('a crop sown in week w ripens at the end of week w+g−1', () => {
    const lv = mini('nile', {})
    const st = run(lv, initialState(lv), [{ t: 'plant', f: 0, c: 1 }, wait]) // barley, 3 weeks
    expect(st.yield).toBe(0)
    expect(run(lv, st, [wait]).yield).toBe(2)
  })

  it('Nile: a flooded basin cannot be sown, and a crop withers when its basin dries', () => {
    const lv = mini('nile', { drain: [2, 0, 0], dry: [9, 3, 9] })
    expect(step(lv, initialState(lv), { t: 'plant', f: 0, c: 0 })).toBeNull()
    const st = run(lv, initialState(lv), [{ t: 'plant', f: 1, c: 2 }, wait, wait, wait]) // emmer needs 4, basin dries in week 3
    expect(st.yield).toBe(0)
    expect(st.plots[1].crop).toBe(-1)
  })

  it('Solar terms: a crop dies outside its warmth band; rice needs a paddy', () => {
    const lv = mini('solar-terms', { temp: [2, 2, 3, 5, 5, 5, 5, 5], fields: [{ elev: 0, soil: 1, paddy: true }, { elev: 0, soil: 1, paddy: false }, { elev: 0, soil: 1, paddy: false }] })
    expect(step(lv, initialState(lv), { t: 'plant', f: 1, c: 1 })).toBeNull()
    const wheat = run(lv, initialState(lv), [{ t: 'plant', f: 0, c: 0 }, wait, wait])
    expect(wheat.yield).toBe(2) // weeks 0–2 at warmth 2,2,3
    const late = run(lv, initialState(lv), [wait, { t: 'plant', f: 0, c: 0 }, wait, wait])
    expect(late.yield).toBe(0) // week 3 is 5: scorched
    const rice = run(lv, wheat, [{ t: 'plant', f: 0, c: 1 }, wait, wait])
    expect(rice.yield).toBe(5) // double cropped
    const cold = { ...lv, scenarios: [{ ...S0, cold: 4 }] }
    expect(run(cold, wheat, [{ t: 'plant', f: 0, c: 1 }, wait, wait]).yield).toBe(2) // early cold kills the rice
  })

  it('Milpa: seed before the rains dies; sisters side by side earn a bonus', () => {
    const lv = mini('maya-milpa', {}, { rain: [1, 8] })
    expect(run(lv, initialState(lv), [{ t: 'plant', f: 0, c: 1 }, wait, wait, wait]).yield).toBe(0)
    const st = run(lv, initialState(lv), [wait, { t: 'plant', f: 1, c: 0 }, { t: 'plant', f: 0, c: 1 }, { t: 'plant', f: 2, c: 2 }, wait])
    // Week 4: maize (2) beside beans and squash +2, beans (1) beside maize +1.
    expect(st.yield).toBe(4 + 2)
    const done = run(lv, st, [wait])
    expect(done.yield).toBe(6 + 1) // squash ripens alone: the maize is gone
    const dryEnd = { ...lv, scenarios: [{ ...S0, rain: [1, 3] as [number, number] }] }
    expect(run(dryEnd, initialState(dryEnd), [wait, { t: 'plant', f: 1, c: 0 }, wait, wait, wait]).yield).toBe(0)
  })

  it('Blight: the struck variety rots in the ground and cannot be grown after', () => {
    const lv = mini('potato-blight', {}, { blight: 2, blightCrop: 0 })
    const st = run(lv, initialState(lv), [{ t: 'plant', f: 0, c: 0 }, { t: 'plant', f: 1, c: 0 }, { t: 'plant', f: 2, c: 1 }, wait, wait])
    expect(st.yield).toBe(3 + 2) // field 0 lumper ripened in week 1, field 1 rotted in week 2, cup survives
    const r = advance(lv, lv.scenarios[0], 5, st.plots, { t: 'plant', f: 0, c: 0 })
    expect(r.plots[0].crop).toBe(-1)
  })

  it('Dust Bowl: a storm strips bare or young fields, not contoured or established ones', () => {
    const lv = mini('dust-bowl', { fields: [{ elev: 0, soil: 2, paddy: false }, { elev: 0, soil: 1, paddy: false }, { elev: 0, soil: 1, paddy: false }] }, { storms: [2] })
    const st = run(lv, initialState(lv), [{ t: 'plant', f: 0, c: 0 }, { t: 'contour', f: 1 }, { t: 'plant', f: 1, c: 1 }])
    expect(st.plots.map(p => p.soil)).toEqual([2, 1, 0]) // wheat age 3 holds, contour holds, bare field 2 blown to dust
    expect(st.plots[1].crop).toBe(1)
    expect(step(lv, st, { t: 'plant', f: 2, c: 1 })).toBeNull()
  })
})

describe('harvest levels', () => {
  it('every config × difficulty × seed is winnable in every scenario, idle and (D3+) greedy lose', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const looks = new Set<string>()
      for (const seed of SEEDS) {
        const lv = generate(CONFIGS[id], d, seed)
        const tag = `${id} d${d} s${seed}`
        expect(lv.quota, tag).toBeGreaterThanOrEqual(2)
        expect(lv.quota, tag).toBeLessThanOrEqual(lv.best)
        expect(isWon(lv, initialState(lv)), tag).toBe(false)
        const solver = makeSolver(lv)
        for (let si = 0; si < lv.scenarios.length; si++) {
          const { state } = playPolicy(lv, si, solver)
          expect(state.yield, `${tag} scenario ${si}`).toBeGreaterThanOrEqual(lv.quota)
        }
        let idle = initialState(lv)
        while (idle.week < lv.weeks) idle = step(lv, idle, wait)!
        expect(isWon(lv, idle), tag).toBe(false)
        expect(greedyYield(lv, lv.actual)).toBe(lv.greedy)
        if (d >= 3) expect(lv.greedy, tag).toBeLessThan(lv.quota)
        if (d >= 3) expect(lv.scenarios.length, tag).toBeGreaterThan(1)
        looks.add(JSON.stringify([lv.fields, lv.drain, lv.dry, lv.temp, lv.scenarios[lv.actual], lv.weeks]))
      }
      expect(looks.size, `${id} d${d} varies by seed`).toBeGreaterThan(1)
    }
  })

  it('the forecast narrows as the weather is seen', () => {
    const lv = generate(CONFIGS['maya-milpa'], 4, 3)
    const all = (1 << lv.scenarios.length) - 1
    expect(consistentMask(lv, lv.actual, 0)).not.toBe(0)
    expect(consistentMask(lv, lv.actual, lv.weeks - 1)).not.toBe(all)
  })
})

function clickAction(a: Action) {
  if (a.t === 'wait') { act(() => { fireEvent.click(screen.getByTestId('harvest-wait')) }); return }
  act(() => { fireEvent.click(screen.getByTestId(`field-${a.f}`)) })
  act(() => { fireEvent.click(screen.getByTestId(a.t === 'plant' ? `crop-${a.c}` : 'contour')) })
}

describe('HarvestGame component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(HarvestGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByTestId('harvest-yield').textContent).toContain('0 /')
      cleanup()
    }
  })

  for (const id of CONFIG_IDS) {
    it(`a solver-driven win calls onWin once (${id})`, () => {
      vi.useFakeTimers()
      const onWin = vi.fn(), onLose = vi.fn()
      const lv = generate(CONFIGS[id], 3, 11)
      render(createElement(HarvestGame, { configId: id, difficulty: 3, seed: 11, onWin, onLose }))
      for (const a of playPolicy(lv, lv.actual).actions) clickAction(a)
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
    })
  }

  it('letting every week pass calls onLose once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const lv = generate(CONFIGS['dust-bowl'], 2, 5)
    render(createElement(HarvestGame, { configId: 'dust-bowl', difficulty: 2, seed: 5, onWin, onLose }))
    for (let i = 0; i < lv.weeks + 3; i++) act(() => { fireEvent.click(screen.queryByTestId('harvest-wait') ?? document.body) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
