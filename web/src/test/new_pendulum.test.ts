// Pendulum Clock: the physics helpers are right, every config × difficulty ×
// seed is winnable by a careful player inside its budget, the size of each
// challenge stays inside the 1–3 minute budget, and the component wins and
// loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import PendulumGame, {
  CONFIGS, CONFIG_IDS, generate, period, lengthFor, gainPerHour, precession, huygensOk, huygensNext, huygensSteps,
  matchOk, foucaultOk, stepPlan, MATCH_STEPS, FOUCAULT_STEPS,
  type HuygensPuzzle, type MatchPuzzle, type GalileoPuzzle, type FoucaultPuzzle,
} from '@/components/minigames/PendulumGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 99, 1006, 31337]
const gen = <T,>(id: string, d: Difficulty, s: number) => generate(CONFIGS[id], d, s) as unknown as T

describe('pendulum physics', () => {
  it('matches known values', () => {
    expect(period(0.994)).toBeCloseTo(2, 2) // the seconds pendulum
    expect(lengthFor(2)).toBeCloseTo(0.994, 3)
    expect(period(0.25) / period(1)).toBeCloseTo(0.5, 6) // quarter length, twice the beat
    expect(gainPerHour(lengthFor(2), 2)).toBeCloseTo(0, 6)
    expect(gainPerHour(lengthFor(2) * 0.99, 2)).toBeGreaterThan(0) // shorter runs fast
    expect(precession(48.85, 1)).toBeCloseTo(11.3, 1) // Paris, 1851
    expect(precession(90, 24)).toBeCloseTo(360, 6)
    expect(precession(-33.9, 2)).toBeLessThan(0)
    expect(stepPlan(0, 237, [100, 10, 1]).reduce((a, b) => a + b, 0)).toBe(237)
  })
})

describe('pendulum puzzles', () => {
  for (const d of DIFFS) {
    it(`huygens d${d}: one careful correction wins, within the trial budget`, () => {
      const starts = new Set<number>()
      for (const s of SEEDS) {
        const p = gen<HuygensPuzzle>('huygens-clock', d, s)
        expect(huygensOk(p, p.start), 'not already on time').toBe(false)
        expect(huygensOk(p, p.target)).toBe(true)
        expect(huygensOk(p, huygensNext(p, p.start))).toBe(true)
        expect(p.trials).toBeGreaterThanOrEqual(2)
        expect(p.trials).toBeLessThanOrEqual(5)
        // The steppers reach the computed length in a handful of taps.
        const taps = stepPlan(p.start, huygensNext(p, p.start), huygensSteps(p))
        expect(taps.every(t => huygensSteps(p).includes(Math.abs(t)))).toBe(true)
        expect(taps.length).toBeLessThanOrEqual(40)
        starts.add(p.start * 10 + p.geared)
      }
      expect(starts.size).toBeGreaterThanOrEqual(5)
    })

    it(`match d${d}: targets fit, start off-target, few clocks`, () => {
      const seen = new Set<string>()
      for (const s of SEEDS) {
        const p = gen<MatchPuzzle>('match-clocks', d, s)
        expect(p.clocks.length).toBe([1, 2, 3, 3][d - 1])
        expect(matchOk(p, p.clocks.map(c => c.start))).toBe(false)
        expect(matchOk(p, p.clocks.map(c => c.target))).toBe(true)
        for (const c of p.clocks) {
          expect(c.target).toBeGreaterThanOrEqual(150)
          expect(c.target).toBeLessThanOrEqual(3500)
          expect(c.target / p.master).toBeCloseTo((c.q / c.p) ** 2, 2)
          expect(stepPlan(c.start, c.target, MATCH_STEPS).length).toBeLessThanOrEqual(40)
        }
        seen.add(p.master + ':' + p.clocks.map(c => `${c.p}/${c.q}`).join())
      }
      expect(seen.size).toBeGreaterThanOrEqual(5)
    })

    it(`galileo d${d}: each round has in-time and out-of-time pendulums, only length decides`, () => {
      const seen = new Set<string>()
      for (const s of SEEDS) {
        const p = gen<GalileoPuzzle>('galileo', d, s)
        expect(p.rounds.length).toBe([2, 3, 3, 4][d - 1])
        for (const r of p.rounds) {
          expect(r.cands.length).toBeLessThanOrEqual(6)
          const good = r.cands.filter(c => c.inTime), bad = r.cands.filter(c => !c.inTime)
          expect(good.length).toBeGreaterThanOrEqual(1)
          expect(bad.length).toBeGreaterThanOrEqual(2)
          for (const c of good) expect(c.length).toBe(r.ref.length)
          for (const c of bad) expect(Math.abs(c.length - r.ref.length) / r.ref.length).toBeGreaterThan(0.05)
          // A red herring: some in-time pendulum differs from the reference in weight and swing.
          expect(good.some(c => c.bob !== r.ref.bob && c.amp !== r.ref.amp)).toBe(true)
        }
        seen.add(p.rounds.map(r => r.ref.length).join())
      }
      expect(seen.size).toBeGreaterThanOrEqual(6)
    })

    it(`foucault d${d}: answers are reachable and distinguishable`, () => {
      const seen = new Set<string>()
      for (const s of SEEDS) {
        const p = gen<FoucaultPuzzle>('foucault', d, s)
        expect(p.rounds.length).toBe([2, 3, 3, 4][d - 1])
        expect(p.rounds.filter(r => r.reverse).length).toBe([0, 0, 1, 2][d - 1])
        p.rounds.forEach((r, i) => {
          expect(Math.abs(r.answer)).toBeGreaterThan(p.tol + 5)
          expect(Math.abs(r.answer)).toBeLessThanOrEqual(180)
          expect(r.answer).toBeCloseTo(precession(r.city.lat, r.hours), 1)
          if (d <= 2) expect(r.city.lat).toBeGreaterThan(0)
          // Integer-degree dial reaches the answer within tolerance.
          expect(foucaultOk(p, i, Math.round(r.answer))).toBe(true)
          expect(foucaultOk(p, i, 0)).toBe(false)
          if (r.reverse) {
            expect(r.options.length).toBeGreaterThanOrEqual(3)
            expect(r.options.filter(c => c.name === r.city.name).length).toBe(1)
            for (const c of r.options) if (c.name !== r.city.name) expect(Math.abs(precession(c.lat, r.hours) - r.answer)).toBeGreaterThan(3)
          }
        })
        seen.add(p.rounds.map(r => r.city.name + r.hours).join())
      }
      expect(seen.size).toBeGreaterThanOrEqual(6)
    })
  }
})

describe('pendulum component', () => {
  const q = (c: HTMLElement, sel: string) => c.querySelector<HTMLButtonElement>(sel)!
  const tapSteps = (c: HTMLElement, steps: number[]) => { for (const s of steps) fireEvent.click(q(c, `[data-step="${s}"]`)) }
  const mount = (id: string, d: Difficulty, seed: number) => {
    const onWin = vi.fn(), onLose = vi.fn()
    const r = render(createElement(PendulumGame, { configId: id, difficulty: d, seed, onWin, onLose }))
    return { ...r, onWin, onLose }
  }
  const settle = () => { act(() => { vi.advanceTimersByTime(1000) }); act(() => { vi.advanceTimersByTime(1000) }) }

  it('renders every config at every difficulty, with params overrides', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = mount(id, d, 3)
      expect(container.querySelectorAll('svg').length).toBeGreaterThan(0)
      expect(container.textContent).toContain(CONFIGS[id].title)
      unmount()
    }
    const { container } = render(createElement(PendulumGame, { configId: 'galileo', difficulty: 1, seed: 1, params: { title: 'Pisa, 1583', intro: 'Use your pulse.' }, onWin: () => {}, onLose: () => {} }))
    expect(container.textContent).toContain('Pisa, 1583')
    expect(container.textContent).toContain('Use your pulse.')
  })

  /** Plays a whole challenge correctly through the UI. */
  function playToWin(id: string, d: Difficulty, seed: number, c: HTMLElement) {
    const p = generate(CONFIGS[id], d, seed)
    if (p.kind === 'huygens-clock') {
      tapSteps(c, stepPlan(p.start, huygensNext(p, p.start), huygensSteps(p)))
      fireEvent.click(q(c, '[data-testid="pend-run"]'))
    } else if (p.kind === 'match-clocks') {
      p.clocks.forEach((cl, i) => { fireEvent.click(q(c, `[data-clock="${i}"]`)); tapSteps(c, stepPlan(cl.start, cl.target, MATCH_STEPS)) })
      fireEvent.click(q(c, '[data-testid="pend-check"]'))
    } else if (p.kind === 'galileo') {
      for (const r of p.rounds) {
        r.cands.forEach((cand, i) => { if (cand.inTime) fireEvent.click(q(c, `[data-cand="${i}"]`)) })
        fireEvent.click(q(c, '[data-testid="pend-confirm"]'))
      }
    } else {
      for (const r of p.rounds) {
        if (r.reverse) fireEvent.click(q(c, `[data-option="${r.city.name}"]`))
        else { tapSteps(c, stepPlan(0, Math.round(r.answer), FOUCAULT_STEPS)); fireEvent.click(q(c, '[data-testid="pend-submit"]')) }
      }
    }
  }

  it('a careful player wins once on every config and difficulty', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const seed of [11, 12]) {
      const { container, onWin, onLose, unmount } = mount(id, d, seed)
      playToWin(id, d, seed, container)
      settle()
      expect(onWin, `${id} d${d} s${seed}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('repeated wrong answers lose once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, onWin, onLose, unmount } = mount(id, d, 5)
      const p = generate(CONFIGS[id], d, 5)
      const sel = p.kind === 'huygens-clock' ? '[data-testid="pend-run"]'
        : p.kind === 'match-clocks' ? '[data-testid="pend-check"]'
          : p.kind === 'galileo' ? '[data-testid="pend-confirm"]' : '[data-testid="pend-submit"]'
      for (let k = 0; k < 8; k++) { const b = container.querySelector<HTMLButtonElement>(sel); if (b) fireEvent.click(b) }
      settle()
      expect(onLose, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('a wrong city in a reverse Foucault round counts as a mistake', () => {
    vi.useFakeTimers()
    const p = generate(CONFIGS.foucault, 4, 8) as FoucaultPuzzle
    const { container, onLose, unmount } = mount('foucault', 4, 8)
    for (const r of p.rounds) {
      if (r.reverse) {
        const wrong = r.options.find(o => o.name !== r.city.name)!
        for (let k = 0; k < p.mistakes; k++) { const b = container.querySelector<HTMLButtonElement>(`[data-option="${wrong.name}"]`); if (b) fireEvent.click(b) }
        break
      }
      tapSteps(container, stepPlan(0, Math.round(r.answer), FOUCAULT_STEPS))
      fireEvent.click(q(container, '[data-testid="pend-submit"]'))
    }
    settle()
    expect(onLose).toHaveBeenCalledTimes(1)
    unmount()
  })
})
