// Eureka: the displacement, draft, Boyle and metacentre rules; every config ×
// difficulty × seed is solver-verified (halving dunks, subset enumeration, a PD
// controller, ballast bisection), naive strategies fail, and the component
// wins and loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import EurekaGame, {
  CONFIGS, CONFIG_IDS, RHO, generate, alloyVolume, crownReading, goldReading, solveCrown,
  draftOf, seaDraft, plimWins, plimSinks, solvePlimsoll,
  diverStart, diverStep, diverController, runDiver, neutralSqueeze, diverAccel, DIVER_TICK,
  evalVasa, solveVasa, bisectVasa, vasaUppers,
  type CrownLevel, type PlimLevel, type DiverLevel, type VasaLevel,
} from '@/components/minigames/EurekaGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 7, 42, 1006]
const gen = <T,>(id: string, d: Difficulty, seed: number) => generate(CONFIGS[id].kind, d, seed) as T

describe('eureka physics', () => {
  it('a silver alloy is bulkier than gold of the same mass', () => {
    expect(alloyVolume(1000, 0)).toBeCloseTo(51.76, 2)
    expect(alloyVolume(1000, 1)).toBeCloseTo(95.33, 2)
    expect(alloyVolume(1000, 0.3) - alloyVolume(1000, 0)).toBeCloseTo(13.06, 1)
  })

  it('a box hull sinks by mass ÷ (ρ × area), deeper in fresh water', () => {
    const L = { light: 1000, length: 50, beam: 10 } as PlimLevel
    expect(draftOf(L, 0, RHO.fresh)).toBeCloseTo(2, 6)
    expect(draftOf(L, 500, RHO.fresh)).toBeCloseTo(3, 6)
    expect(draftOf(L, 0, RHO.fresh) / draftOf(L, 0, RHO.sea)).toBeCloseTo(1.025, 6)
  })

  it('the diver is neutral at its neutral squeeze, and that balance is unstable', () => {
    const L = gen<DiverLevel>('cartesian-diver', 1, 3)
    expect(diverAccel(L, 0, L.neutral0)).toBeCloseTo(0, 6)
    const h = 0.15, p = neutralSqueeze(L, h)
    expect(diverAccel(L, h, p)).toBeCloseTo(0, 6)
    expect(diverAccel(L, h + 0.01, p)).toBeGreaterThan(0) // deeper → sinks further
    expect(diverAccel(L, h - 0.01, p)).toBeLessThan(0) // shallower → rises
  })

  it('GM = KB + BM − KG: more ballast stiffens the ship but sinks the ports', () => {
    const L = gen<VasaLevel>('vasa-stability', 2, 5)
    const u = vasaUppers(L)[0]
    const a = evalVasa(L, 5, u), b = evalVasa(L, 15, u)
    expect(b.gm).toBeGreaterThan(a.gm)
    expect(b.freeboard).toBeLessThan(a.freeboard)
    expect(b.heel).toBeLessThan(a.heel)
    // Moving guns up raises KG.
    expect(evalVasa(L, 15, u + 2).gm).toBeLessThan(b.gm)
  })
})

describe('eureka levels', () => {
  for (const d of DIFFS) {
    it(`hiero-crown d${d}: halving finds every fake; one-at-a-time and all-at-once do not`, () => {
      for (const seed of SEEDS) {
        const L0 = gen<CrownLevel>('hiero-crown', d, seed)
        expect(alloyVolume(L0.mass, L0.f) - alloyVolume(L0.mass, 0)).toBeGreaterThanOrEqual(2 * L0.res)
        const all = Array.from({ length: L0.n }, (_, i) => i)
        const allReadings = new Set<number>()
        let singleFails = false
        for (let fake = 0; fake < L0.n; fake++) {
          const L = { ...L0, fake }
          const s = solveCrown(L)
          expect(s.accuse, `d${d} s${seed} fake ${fake}`).toBe(fake)
          expect(s.used).toBeLessThanOrEqual(L.dunks)
          allReadings.add(crownReading(L, all))
          // Sequential singles: dunk crowns 1..k one by one, else guess crown k+1.
          let found = -1
          for (let i = 0; i < L.dunks; i++) if (crownReading(L, [i]) > goldReading(L, 1)) { found = i; break }
          if (found < 0) found = L.dunks
          if (found !== fake) singleFails = true
        }
        expect(allReadings.size).toBe(1)
        expect(singleFails).toBe(true)
      }
    })

    it(`plimsoll-line d${d}: subsets win, empty and full do not`, () => {
      for (const seed of SEEDS) {
        const L = gen<PlimLevel>('plimsoll-line', d, seed)
        const wins = solvePlimsoll(L)
        expect(wins.length, `d${d} s${seed}`).toBeGreaterThanOrEqual(1)
        expect(wins.length).toBeLessThanOrEqual([4, 3, 2, 2][d - 1])
        expect(Math.min(...wins.map(w => w.filter(Boolean).length))).toBeLessThanOrEqual(L.cap)
        const none = L.crates.map(() => false), all = L.crates.map(() => true)
        expect(plimWins(L, none)).toBe(false)
        expect(plimWins(L, all)).toBe(false)
        expect(plimSinks(L, all)).toBe(true)
        expect(seaDraft(L, wins[0])).toBeLessThanOrEqual(L.line + 1e-9)
        expect(L.showMass).toBe(d <= 2)
        expect(L.dockRho).toBe(d >= 3 ? RHO.fresh : RHO.sea)
      }
    })

    it(`cartesian-diver d${d}: the controller wins; idle, crushed and neutral squeezes lose`, () => {
      for (const seed of SEEDS) {
        const L = gen<DiverLevel>('cartesian-diver', d, seed)
        const win = runDiver(L, s => diverController(L, s))
        expect(win.done, `d${d} s${seed}`).toBe('win')
        expect(win.t).toBeLessThan(L.limit * 0.8)
        expect(runDiver(L, () => 0).done).toBe('lose')
        expect(runDiver(L, () => L.maxSqueeze).done).toBe('lose')
        expect(runDiver(L, () => L.neutral0).done).toBe('lose')
        const b = L.bands[0]
        expect(runDiver(L, () => neutralSqueeze(L, (b.lo + b.hi) / 2)).done).toBe('lose')
      }
    })

    it(`vasa-stability d${d}: bisection wins; no ballast, max ballast and the start lose`, () => {
      for (const seed of SEEDS) {
        const L = gen<VasaLevel>('vasa-stability', d, seed)
        const u = vasaUppers(L)[0]
        const wins = solveVasa(L)
        expect(wins.length, `d${d} s${seed}`).toBeGreaterThanOrEqual(1)
        expect(wins.filter(([, x]) => x === u).length).toBeLessThanOrEqual([8, 5, 3, 2][d - 1])
        const bis = bisectVasa(L)
        expect(bis.win).toBe(true)
        expect(bis.tests).toBeLessThanOrEqual(L.tests)
        expect(evalVasa(L, 0, u).ok).toBe(false)
        expect(evalVasa(L, L.steps, u).ok).toBe(false)
        expect(evalVasa(L, L.steps, u).why).toBe('awash')
        if (d >= 3) expect(u).toBeGreaterThan(L.guns - L.capLower)
      }
    })
  }

  it('seeds vary the levels', () => {
    for (const id of CONFIG_IDS) {
      const seen = new Set(SEEDS.map(s => JSON.stringify(generate(CONFIGS[id].kind, 3, s))))
      expect(seen.size, id).toBeGreaterThanOrEqual(SEEDS.length - 1)
    }
  })
})

describe('EurekaGame component', () => {
  const mount = (id: string, d: Difficulty, seed: number, onWin = vi.fn(), onLose = vi.fn()) =>
    ({ ...render(createElement(EurekaGame, { configId: id, difficulty: d, seed, onWin, onLose })), onWin, onLose })
  const q = (c: HTMLElement, id: string) => c.querySelector(`[data-testid="${id}"]`) as HTMLElement
  const click = (c: HTMLElement, id: string) => act(() => { fireEvent.click(q(c, id)) })

  it('renders every config at every difficulty, with title overrides', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = mount(id, d, 3)
      expect(q(container, 'eu-goal')).not.toBeNull()
      expect(container.textContent).toContain(CONFIGS[id].title)
      unmount()
    }
    const { container } = render(createElement(EurekaGame, { configId: 'vasa-stability', difficulty: 1, seed: 1, params: { title: 'Custom Title' }, onWin: () => {}, onLose: () => {} }))
    expect(container.textContent).toContain('Custom Title')
  })

  it('crown: halving dunks then accusing wins once; a wrong accusation loses once', () => {
    vi.useFakeTimers()
    for (const d of DIFFS) {
      const L = gen<CrownLevel>('hiero-crown', d, 11)
      const { container, onWin, onLose, unmount } = mount('hiero-crown', d, 11)
      const sol = solveCrown(L)
      for (const g of sol.groups) {
        for (const i of g) click(container, `crown-${i}`)
        click(container, 'eu-dunk')
        for (const i of g) click(container, `crown-${i}`)
      }
      click(container, `crown-${sol.accuse}`)
      click(container, 'eu-accuse')
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin, `d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
    const L = gen<CrownLevel>('hiero-crown', 2, 4)
    const { container, onWin, onLose } = mount('hiero-crown', 2, 4)
    click(container, `crown-${(L.fake + 1) % L.n}`)
    click(container, 'eu-accuse')
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('plimsoll: loading a winning set and casting off wins once; loading everything sinks once', () => {
    vi.useFakeTimers()
    for (const d of DIFFS) {
      const L = gen<PlimLevel>('plimsoll-line', d, 11)
      const win = solvePlimsoll(L)[0]
      const { container, onWin, onLose, unmount } = mount('plimsoll-line', d, 11)
      win.forEach((x, i) => { if (x) click(container, `crate-${i}`) })
      click(container, 'eu-sail')
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin, `d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
    const L = gen<PlimLevel>('plimsoll-line', 3, 4)
    const { container, onWin, onLose } = mount('plimsoll-line', 3, 4)
    L.crates.forEach((_, i) => { if (q(container, `crate-${i}`) && !(q(container, `crate-${i}`) as HTMLButtonElement).disabled) click(container, `crate-${i}`) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('diver: steering the slider with the controller wins once; idling loses once', () => {
    vi.useFakeTimers()
    const L = gen<DiverLevel>('cartesian-diver', 1, 11)
    const { container, onWin, onLose, unmount } = mount('cartesian-diver', 1, 11)
    click(container, 'eu-start')
    for (let k = 0; k < L.limit / DIVER_TICK + 10 && !onWin.mock.calls.length; k++) {
      const svg = q(container, 'eu-bottle')
      if (svg) {
        const s = { ...diverStart(), h: Number(svg.dataset.depth), v: Number(svg.dataset.vel), band: Number(svg.dataset.band) }
        fireEvent.change(q(container, 'eu-squeeze'), { target: { value: String(diverController(L, s)) } })
      }
      act(() => { vi.advanceTimersByTime(DIVER_TICK * 1000) })
    }
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onWin).toHaveBeenCalledTimes(1)
    expect(onLose).not.toHaveBeenCalled()
    unmount()

    const idle = mount('cartesian-diver', 1, 11)
    click(idle.container, 'eu-start')
    act(() => { vi.advanceTimersByTime((L.limit + 3) * 1000) })
    expect(idle.onLose).toHaveBeenCalledTimes(1)
    expect(idle.onWin).not.toHaveBeenCalled()
  })

  it('diverStep is pure and stops once settled', () => {
    const L = gen<DiverLevel>('cartesian-diver', 2, 1)
    const s0 = diverStart()
    const s1 = diverStep(L, s0, L.maxSqueeze)
    expect(s0.h).toBe(0)
    expect(s1.t).toBeCloseTo(DIVER_TICK, 9)
    const done = { ...s1, done: 'win' as const }
    expect(diverStep(L, done, 0)).toBe(done)
  })

  it('vasa: the bisected ballast wins once; failing every trial loses once', () => {
    vi.useFakeTimers()
    for (const d of DIFFS) {
      const L = gen<VasaLevel>('vasa-stability', d, 11)
      const bis = bisectVasa(L)
      const { container, onWin, onLose, unmount } = mount('vasa-stability', d, 11)
      fireEvent.change(q(container, 'eu-ballast'), { target: { value: String(bis.ballast) } })
      click(container, 'eu-test')
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin, `d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
    const L = gen<VasaLevel>('vasa-stability', 4, 4)
    const { container, onWin, onLose } = mount('vasa-stability', 4, 4)
    for (let k = 0; k < L.tests + 2; k++) { if (q(container, 'eu-test')) click(container, 'eu-test') }
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
