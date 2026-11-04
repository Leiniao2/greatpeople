// Sundials: the sun-position and dial geometry rules; every config ×
// difficulty × seed is solver-verified (the solution wins, the start and the
// naive settings do not, few settings win); the component wins/loses once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import SundialGame, {
  CONFIGS, CONFIG_IDS, levelFor, testDial, solveDial, bestLines, comboCount, declination, equationOfTime,
  altitude, plateShadow, equatorialShadow, horizontalReading, hourLineAngle, noonShadow, readShadow,
  solveSolstice, roundTo, declareWins, definerWindow, foldGaps,
  type DialLevel, type GnomonLevel,
} from '@/components/minigames/SundialGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006]
const dialIds = CONFIG_IDS.filter(id => CONFIGS[id].kind !== 'solstice')

describe('sun and dial geometry', () => {
  it('noon altitude is 90° − φ + δ; the equinox Sun rises due east at 6h', () => {
    expect(altitude(41.9, 23.44, 0)).toBeCloseTo(90 - 41.9 + 23.44, 6)
    expect(altitude(30, 0, -90)).toBeCloseTo(0, 6)
    expect(declination(172)).toBeCloseTo(23.44, 2)
    expect(Math.abs(declination(81))).toBeLessThan(1e-9)
  })

  it('equation of time: about −14 min in mid-February, +16 min in early November', () => {
    expect(equationOfTime(42)).toBeLessThan(-13)
    expect(equationOfTime(307)).toBeGreaterThan(15)
  })

  it('a horizontal dial with a polar style reads true time on every date', () => {
    for (const d of [23.44, 0, -23.44]) for (const H of [-60, -30, -7.5, 15, 45]) {
      const psi = plateShadow(41.9, d, H, 41.9)!
      expect(horizontalReading(psi, 41.9)).toBeCloseTo(H, 6)
      expect(psi).toBeCloseTo(hourLineAngle(H, 41.9), 6)
    }
  })

  it('an aligned equatorial dial reads ψ = H; a Catania dial at Rome errs by minutes', () => {
    for (const H of [-60, -20, 0, 40]) expect(equatorialShadow(26.9, -15, H, 26.9)!).toBeCloseTo(H, 6)
    const psi = plateShadow(41.9, -23.44, -45, 37.5)!
    expect(Math.abs(horizontalReading(psi, 37.5) + 45) * 4).toBeGreaterThan(5)
    // tilting the plate by the latitude difference fixes it
    const psi2 = plateShadow(41.9, -23.44, -45, 37.5, 4.4)!
    expect(Math.abs(horizontalReading(psi2, 37.5) + 45) * 4).toBeLessThan(0.05)
  })

  it('the noon shadow is longest at the solstice and symmetric about it', () => {
    const L = { lat: 34.4, G: 400, obliquity: 23.53, t0: 2.4 }
    expect(noonShadow(L, 2.4)).toBeGreaterThan(noonShadow(L, 1.4))
    expect(noonShadow(L, 2.4 - 15)).toBeCloseTo(noonShadow(L, 2.4 + 15), 9)
    expect(Math.abs(noonShadow(L, 22.4) - noonShadow(L, 23.4))).toBeGreaterThan(2.5)
  })
})

describe('dial levels', () => {
  for (const id of dialIds) {
    it(`${id}: solution wins, start and naive settings lose, few settings win, seeds vary`, () => {
      for (const d of DIFFS) {
        const seen = new Set<string>()
        for (const seed of SEEDS) {
          const L = levelFor(id, d, seed) as DialLevel
          const tag = `${id} d${d} s${seed}`
          expect(testDial(L, L.solution).win, tag).toBe(true)
          expect(testDial(L, L.start).win, `${tag} start`).toBe(false)
          expect(L.tests).toBe([5, 5, 4, 4][d - 1])
          seen.add(JSON.stringify([L.plinth, L.hours, L.start, L.dates[0].day]))
          const maxed = L.controls.map(c => c.max), mined = L.controls.map(c => c.min)
          if (L.kind === 'retilt') {
            // as installed: the right way round, but flat — the real 99-year error
            expect(testDial(L, [0, -L.plinth]).win, `${tag} flat`).toBe(false)
            expect(testDial(L, maxed).win).toBe(false)
            expect(testDial(L, mined).win).toBe(false)
          } else if (L.kind === 'layout') {
            // equal 15° spacing with the right style fails; extreme styles fail with their best lines
            expect(testDial(L, [L.solution[0], ...L.hours.map(h => 15 * (h - 12))]).win, `${tag} equal`).toBe(false)
            expect(testDial(L, bestLines(L, 10)!).win).toBe(false)
            expect(testDial(L, bestLines(L, 60)!).win).toBe(false)
            const sb = bestLines(L, L.start[0])
            expect(sb === null || !testDial(L, sb).win, `${tag} start style`).toBe(true)
          } else {
            // aligned gnomon but read in solar time: off by the equation of time
            expect(testDial(L, [L.solution[0], L.solution[1], 0]).win, `${tag} solar`).toBe(false)
            expect(testDial(L, maxed).win).toBe(false)
            expect(testDial(L, mined).win).toBe(false)
          }
          const wins = solveDial(L)
          expect(wins.length, tag).toBeGreaterThanOrEqual(1)
          expect(wins.length / comboCount(L), `${tag} share`).toBeLessThanOrEqual(L.kind === 'layout' ? 0.2 : 0.1)
        }
        expect(seen.size, `${id} d${d} variety`).toBeGreaterThanOrEqual(SEEDS.length - 1)
      }
    })
  }
})

describe('solstice levels', () => {
  it('equal-shadow solver wins within the budget; almanac and whole days lose', () => {
    for (const d of DIFFS) for (const seed of [...SEEDS, 11, 12, 13, 14]) {
      const L = levelFor('guo-shoujing', d, seed) as GnomonLevel
      const tag = `d${d} s${seed}`
      const { days, estimate } = solveSolstice(L)
      expect(new Set(days).size).toBeLessThanOrEqual(L.obs)
      expect(declareWins(L, roundTo(estimate, L.declStep)), `${tag} est ${estimate} t0 ${L.t0}`).toBe(true)
      expect(declareWins(L, 0), tag).toBe(false)
      // the day of the longest shadow is a whole day, never close enough
      for (let k = -6; k <= 6; k++) expect(declareWins(L, k)).toBe(false)
      expect(Math.abs(L.t0)).toBeGreaterThan(2)
      expect(Math.abs(L.t0)).toBeLessThan(4)
      // near the solstice the definer can barely tell days apart
      expect(Math.abs(readShadow(L, Math.round(L.t0)) - readShadow(L, Math.round(L.t0) + 1))).toBeLessThan(0.3)
      // the definer's window holds the true reading
      const w = definerWindow(L, 20)
      const k = Math.round((readShadow(L, 20) - w.lo) * 10)
      expect(k).toBeGreaterThanOrEqual(0)
      expect(k).toBeLessThanOrEqual(w.n)
    }
  })

  it('folding shows zero gap at the true solstice', () => {
    const L = levelFor('guo-shoujing', 2, 5) as GnomonLevel
    const a = -20, m = 2 * L.t0 - a
    const recs = [a, Math.floor(m), Math.floor(m) + 1].map(day => ({ day, value: noonShadow(L, day) }))
    const g = foldGaps(recs, L.t0)
    expect(g.length).toBeGreaterThanOrEqual(1)
    expect(Math.abs(g[0].gap)).toBeLessThan(0.05)
  })
})

describe('SundialGame component', () => {
  const setRange = (testId: string, idx: number) => fireEvent.change(screen.getByTestId(testId), { target: { value: String(idx) } })
  const setDial = (L: DialLevel, v: number[], selHour = true) => {
    if (L.kind === 'layout') {
      setRange('sun-ctl-style', Math.round((v[0] - L.controls[0].min) / L.controls[0].step))
      L.hours.forEach((h, k) => {
        if (selHour) fireEvent.click(screen.getByTestId(`sun-hour-${h}`))
        setRange('sun-ctl-line', Math.round((v[1 + k] - L.controls[1].min) / L.controls[1].step))
      })
    } else {
      L.controls.forEach((c, k) => setRange(`sun-ctl-${c.key}`, Math.round((v[k] - c.min) / c.step)))
    }
  }

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { unmount } = render(createElement(SundialGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByTestId('sun-goal')).toBeTruthy()
      const L = levelFor(id, d, 3)
      if (L.kind !== 'solstice') expect(screen.queryByTestId('sun-north') !== null).toBe(L.showNorth)
      unmount()
    }
  })

  it('accepts title overrides', () => {
    render(createElement(SundialGame, { configId: 'samrat-yantra', difficulty: 1, seed: 1, params: { title: 'Custom Title' }, onWin: () => {}, onLose: () => {} }))
    expect(screen.getByText('Custom Title')).toBeTruthy()
  })

  for (const id of dialIds) {
    it(`${id}: a failed test, then the solution, wins once`, () => {
      vi.useFakeTimers()
      for (const d of DIFFS) {
        const onWin = vi.fn(), onLose = vi.fn()
        const { unmount } = render(createElement(SundialGame, { configId: id, difficulty: d, seed: 11, onWin, onLose }))
        const L = levelFor(id, d, 11) as DialLevel
        fireEvent.click(screen.getByTestId('sun-test'))
        expect(screen.getByTestId('sun-report')).toBeTruthy()
        setDial(L, L.solution)
        fireEvent.click(screen.getByTestId('sun-test'))
        act(() => { vi.advanceTimersByTime(1500) })
        expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
        expect(onLose).not.toHaveBeenCalled()
        expect(screen.queryByTestId('sun-test')).toBeNull()
        unmount()
      }
    })

    it(`${id}: spending every test on the start loses once`, () => {
      vi.useFakeTimers()
      const onWin = vi.fn(), onLose = vi.fn()
      render(createElement(SundialGame, { configId: id, difficulty: 4, seed: 4, onWin, onLose }))
      const L = levelFor(id, 4, 4) as DialLevel
      for (let k = 0; k < L.tests; k++) fireEvent.click(screen.getByTestId('sun-test'))
      act(() => { vi.advanceTimersByTime(1500) })
      expect(onLose).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      expect(screen.queryByTestId('sun-test')).toBeNull()
    })
  }

  const observe = (L: GnomonLevel, day: number) => {
    setRange('sun-ctl-day', day - L.dayRange[0])
    fireEvent.click(screen.getByTestId('sun-observe'))
    const w = definerWindow(L, day)
    setRange('sun-definer-pos', Math.round((readShadow(L, day) - w.lo) * 10))
    fireEvent.click(screen.getByTestId('sun-record-btn'))
  }

  it('guo-shoujing: observing by equal shadows and declaring wins once', () => {
    vi.useFakeTimers()
    for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { unmount } = render(createElement(SundialGame, { configId: 'guo-shoujing', difficulty: d, seed: 11, onWin, onLose }))
      const L = levelFor('guo-shoujing', d, 11) as GnomonLevel
      const sol = solveSolstice(L)
      for (const day of sol.days) observe(L, day)
      expect(screen.getByTestId('sun-recs').textContent).toContain(`d${sol.days[0]}`)
      setRange('sun-ctl-est', Math.round((roundTo(sol.estimate, L.declStep) + 10) / L.declStep))
      fireEvent.click(screen.getByTestId('sun-declare'))
      act(() => { vi.advanceTimersByTime(1500) })
      expect(onWin, `d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('guo-shoujing: declaring the almanac date until out of declarations loses once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(SundialGame, { configId: 'guo-shoujing', difficulty: 1, seed: 6, onWin, onLose }))
    const L = levelFor('guo-shoujing', 1, 6) as GnomonLevel
    for (let k = 0; k < L.declares; k++) fireEvent.click(screen.getByTestId('sun-declare'))
    act(() => { vi.advanceTimersByTime(1500) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
    expect(screen.queryByTestId('sun-declare')).toBeNull()
  })
})
