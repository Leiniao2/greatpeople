// Shipyard: every config × difficulty × seed makes a level whose saw plan wins
// within the days (and welds); the rules engine rejects each config's illegal
// cuts; the naive "first log that fits" sawyer fails from D2; an exhaustive
// search finds a win on its own; and the component wins/loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import ShipyardGame, {
  CONFIGS, CONFIG_IDS, generate, replay, initialState, apply, cutProblem, status, naivePlay, solve, compose, tierFor, isWon, legalCuts,
  type Level, type Action,
} from '@/components/minigames/ShipyardGame'
import { mulberry32 } from '@/components/minigames/_shared'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006, 99991, 123456]

const lv = (mode: Level['mode'], logs: [number, boolean][], parts: [number, boolean, number][], days = 9, welds = 0): Level => ({
  mode, days, welds, plan: [],
  logs: logs.map(([len, compass], id) => ({ id, len, compass })),
  parts: parts.map(([len, knee, comp], id) => ({ id, len, knee, comp, name: `P${id}` })),
})
const cut = (part: number, log: number): Action => ({ t: 'cut', part, log })

describe('shipyard rules', () => {
  it('compose splits a length into parts within bounds', () => {
    const rng = mulberry32(5)
    for (let k = 0; k < 200; k++) {
      const total = 6 + (k % 7), parts = compose(total, 2, 5, rng)
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
      for (const p of parts) { expect(p).toBeGreaterThanOrEqual(2); expect(p).toBeLessThanOrEqual(5) }
    }
  })

  it('a part needs the length; days cap new logs; cuts are permanent', () => {
    const L = lv('compass', [[5, false], [4, false]], [[3, false, 1], [3, false, 1], [2, false, 1]], 1)
    let s = initialState(L)
    expect(cutProblem(L, s, 0, 0)).toBeNull()
    s = apply(L, s, cut(0, 0))!
    expect(s.used[0]).toBe(3)
    expect(cutProblem(L, s, 1, 0)).toMatch(/length/)
    expect(cutProblem(L, s, 1, 1)).toMatch(/days/)
    expect(apply(L, s, cut(0, 0))).toBeNull()            // already cut
    expect(status(L, s)).toBeNull()                        // part 2 still fits log 0
    s = apply(L, s, cut(2, 0))!
    expect(status(L, s)).toBe('lost')                      // part 1 has nowhere to go
  })

  it('victory: knees only from compass timber, straight parts from either', () => {
    const L = lv('compass', [[6, false], [4, true]], [[2, true, 1], [3, false, 1]])
    const s = initialState(L)
    expect(cutProblem(L, s, 0, 0)).toMatch(/compass/)
    expect(cutProblem(L, s, 0, 1)).toBeNull()
    expect(cutProblem(L, s, 1, 1)).toBeNull()
  })

  it('zheng-he: one log never feeds neighbouring compartments', () => {
    const L = lv('bulkhead', [[10, false]], [[2, false, 2], [2, false, 3], [2, false, 4], [2, false, 2]])
    const s = apply(L, initialState(L), cut(0, 0))!
    expect(cutProblem(L, s, 1, 0)).toMatch(/neighbouring/)
    expect(cutProblem(L, s, 2, 0)).toBeNull()   // 2 and 4 are not neighbours
    expect(cutProblem(L, s, 3, 0)).toBeNull()   // same compartment is fine
  })

  it('arsenal: parts in line order, two benches, scrap to load a third', () => {
    const L = lv('line', [[4, false], [4, false], [4, false]], [[3, false, 1], [3, false, 1], [3, false, 1]])
    let s = initialState(L)
    expect(cutProblem(L, s, 1, 0)).toMatch(/order/)
    s = apply(L, s, cut(0, 0))!
    s = apply(L, s, cut(1, 1))!
    expect(cutProblem(L, s, 2, 2)).toMatch(/benches/)
    expect(status(L, s)).toBeNull()             // scrapping a bench frees one
    s = apply(L, s, { t: 'scrap', log: 0 })!
    expect(cutProblem(L, s, 2, 0)).toMatch(/scrap/)
    s = apply(L, s, cut(2, 2))!
    expect(status(L, s)).toBe('won')
  })

  it('viking: strakes in order, a run per log, a left log is finished', () => {
    const L = lv('strakes', [[5, false], [5, false]], [[2, false, 1], [2, false, 1], [2, false, 1]])
    let s = apply(L, initialState(L), cut(0, 0))!
    s = apply(L, s, cut(1, 1))!                 // leaving log 0 for log 1
    expect(s.closed[0]).toBe(true)
    expect(cutProblem(L, s, 2, 0)).toMatch(/finished/)
    expect(cutProblem(L, s, 2, 1)).toBeNull()
  })

  it('liberty: a section too long for the plate left is welded, using a weld', () => {
    const L = lv('weld', [[4, false], [4, false]], [[3, false, 1], [5, false, 1]], 9, 1)
    let s = apply(L, initialState(L), cut(0, 0))!
    expect(cutProblem(L, s, 1, 0)).toBeNull()
    s = apply(L, s, cut(1, 0))!
    expect(s.left[1]).toBe(4)
    expect(s.weldsUsed).toBe(1)
    const noWeld = { ...L, welds: 0 }
    expect(cutProblem(noWeld, apply(noWeld, initialState(noWeld), cut(0, 0))!, 1, 0)).toMatch(/length/)
    s = apply(L, s, cut(1, 1))!
    expect(isWon(s)).toBe(true)
  })
})

describe('shipyard levels', () => {
  it('every config × difficulty × seed: the saw plan wins within the days; not won at the start', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const seen = new Set<string>()
      for (const seed of SEEDS) {
        const L = generate(id, d, seed)
        const t = tierFor(d)
        expect(L.mode).toBe(CONFIGS[id].mode)
        expect(L.days).toBe(t.logs)
        expect(L.logs.length).toBe(t.logs + t.spares)
        expect(status(L, initialState(L)), `${id} d${d} s${seed} start`).toBeNull()
        const r = replay(L, L.plan)
        expect(r.ok, `${id} d${d} s${seed} plan legal`).toBe(true)
        expect(isWon(r.state), `${id} d${d} s${seed} plan wins`).toBe(true)
        expect(r.state.daysUsed).toBeLessThanOrEqual(L.days)
        expect(r.state.weldsUsed).toBeLessThanOrEqual(L.welds)
        // Timber is tight: total wood within the slack of the order.
        const need = L.parts.reduce((a, p) => a + p.len, 0)
        const usedWood = r.state.started.reduce((a, st, i) => a + (st ? L.logs[i].len : 0), 0)
        expect(usedWood - need).toBeLessThanOrEqual(t.slack)
        if (CONFIGS[id].mode === 'compass') expect(L.parts.some(p => p.knee)).toBe(true)
        if (CONFIGS[id].mode === 'weld') expect(L.welds).toBeGreaterThan(0)
        seen.add(JSON.stringify([L.logs, L.parts]))
      }
      expect(seen.size, `${id} d${d} distinct`).toBe(SEEDS.length)
    }
  })

  it('the naive first-fit sawyer fails every level from D2', () => {
    for (const id of CONFIG_IDS) for (const d of [2, 3, 4] as Difficulty[]) for (const seed of SEEDS) {
      expect(naivePlay(generate(id, d, seed)), `${id} d${d} s${seed}`).toBe('lost')
    }
  })

  it('an exhaustive search finds a win without the plan', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const seed of SEEDS.slice(0, 3)) {
      const L = generate(id, d, seed)
      const res = solve(L)
      if (res.exhausted) continue   // too big to search fully; the plan is the proof
      expect(res.plan, `${id} d${d} s${seed}`).not.toBeNull()
      expect(isWon(replay(L, res.plan!).state)).toBe(true)
    }
  })

  it('random sawing loses most top-level yards', () => {
    for (const id of CONFIG_IDS) {
      let lost = 0
      for (const seed of SEEDS) {
        const L = generate(id, 4, seed)
        const rng = mulberry32(seed)
        let s = initialState(L)
        for (let k = 0; k < 200 && !status(L, s); k++) {
          let acts: Action[] = legalCuts(L, s)
          if (!acts.length && L.mode === 'line') acts = s.started.map((st, i) => (st && !s.closed[i] ? { t: 'scrap', log: i } as Action : null)).filter((a): a is Action => !!a)
          s = apply(L, s, acts[Math.floor(rng() * acts.length)])!
        }
        if (status(L, s) === 'lost') lost++
      }
      expect(lost, id).toBeGreaterThanOrEqual(6)
    }
  })

  it('is deterministic in seed', () => {
    expect(generate('victory', 3, 5)).toEqual(generate('victory', 3, 5))
    expect(generate('victory', 3, 5)).not.toEqual(generate('victory', 3, 6))
  })
})

describe('shipyard component', () => {
  const q = (c: HTMLElement, sel: string) => c.querySelector<HTMLButtonElement>(sel)

  function play(c: HTMLElement, L: Level, actions: Action[]) {
    for (const a of actions) {
      if (a.t === 'scrap') { fireEvent.click(q(c, `[data-scrap="${a.log}"]`)!); continue }
      if (L.mode !== 'line' && L.mode !== 'strakes') {
        const chip = q(c, `[data-part="${a.part}"]`)!
        if (chip.getAttribute('data-active') !== 'true') fireEvent.click(chip)
      }
      fireEvent.click(q(c, `[data-log="${a.log}"]`)!)
    }
  }

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(ShipyardGame, { configId: id, difficulty: d, seed: 1, onWin: () => {}, onLose: () => {} }))
      const L = generate(id, d, 1)
      expect(container.querySelectorAll('[data-log]').length).toBe(L.logs.length)
      expect(container.querySelectorAll('[data-part]').length).toBe(L.parts.length)
      expect(container.textContent).toContain(`${L.days} day`)
      unmount()
    }
  })

  it('following the saw plan wins exactly once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of [1, 4] as Difficulty[]) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(ShipyardGame, { configId: id, difficulty: d, seed: 11, onWin, onLose }))
      const L = generate(id, d, 11)
      play(container, L, L.plan)
      act(() => { vi.advanceTimersByTime(1500) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('the naive sawyer loses exactly once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(ShipyardGame, { configId: id, difficulty: 3, seed: 2, onWin, onLose }))
      const L = generate(id, 3, 2)
      // Replay the naive line through the UI.
      let s = initialState(L)
      const acts: Action[] = []
      for (let k = 0; k < 200 && !status(L, s); k++) {
        const cuts = legalCuts(L, s) as { t: 'cut'; part: number; log: number }[]
        const ordered = cuts.map((c, i) => ({ c, i })).sort((a, b) => Number(!s.started[a.c.log]) - Number(!s.started[b.c.log]) || a.i - b.i).map(x => x.c)
        const whole = ordered.filter(c => s.left[c.part] <= L.logs[c.log].len - s.used[c.log])
        let a: Action | undefined = whole[0] ?? ordered[0]
        if (!a && L.mode === 'line') a = { t: 'scrap', log: s.started.findIndex((st, i) => st && !s.closed[i]) }
        if (!a) break
        s = apply(L, s, a)!; acts.push(a)
      }
      expect(status(L, s), id).toBe('lost')
      play(container, L, acts)
      // Extra taps after the end change nothing.
      fireEvent.click(q(container, '[data-log="0"]')!)
      act(() => { vi.advanceTimersByTime(1500) })
      expect(onLose, id).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })
})
