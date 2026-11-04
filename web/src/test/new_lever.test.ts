// Balance and Lever: the torque rules of each lever, every config × difficulty
// × seed is solver-verified (some setting wins, few enough do, extremes and
// the start lose), the steelyard has a balancing notch for every good, and
// the component wins and loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import LeverGame, {
  CONFIGS, CONFIG_IDS, generate, generateStatera, evaluate, solve, solveStatera, comboCount, extremes, forEachCombo,
  leverPhysics, shadufForces, tripWeight, stateraTorque, torque, isLevel, type Level,
} from '@/components/minigames/LeverGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006, 99991]
const SHARE = [0.35, 0.25, 0.16, 0.1]
const STATIC = CONFIG_IDS.filter(id => CONFIGS[id].kind !== 'statera')
const kindOf = (id: string) => CONFIGS[id].kind as Level['kind']

describe('lever physics', () => {
  it('torque sums weight × arm', () => {
    expect(torque([{ w: 10, x: 2 }, { w: 5, x: -4 }])).toBe(0)
  })

  it('Archimedes beam: effort × b = load × a; reach and lift follow the block', () => {
    const p = leverPhysics(6, 1, 0.5, 500, 0)
    expect(p.b).toBe(5)
    expect(p.effort).toBeCloseTo(100)
    expect(p.reachH).toBeCloseTo(3)
    expect(p.lift).toBeCloseTo(0.6)
    // A beam whose middle lies on the men's side helps them.
    expect(leverPhysics(6, 1, 0.5, 500, 100).effort).toBeCloseTo((500 - 200) / 5)
  })

  it('shaduf: the counterweight eases the lift and burdens the lowering', () => {
    const f = shadufForces(4, 1, 30, 2, 17, 0)
    expect(f.xb).toBe(3)
    expect(f.up).toBeCloseTo((17 * 3 - 30) / 3)
    expect(f.down).toBeCloseTo((30 - 6) / 3)
    // The two pulls always add up to the water's weight.
    expect(f.up + f.down).toBeCloseTo(15)
  })

  it('heavenly balance: lever B adds C·x·b/c through the link', () => {
    expect(tripWeight(3, 6, 2, 0, 0, 0, 0)).toBeCloseTo(4)
    expect(tripWeight(3, 6, 2, 4, 3, 1.5, 3)).toBeCloseTo((12 + 6) / 3)
  })

  it('steelyard: m·a = P·x balances, zero shift adds T0', () => {
    expect(stateraTorque(2, 10, 0, 1, 20)).toBe(0)
    expect(stateraTorque(2, 10, 6, 1, 26)).toBe(0)
  })
})

describe('lever levels', () => {
  for (const id of STATIC) for (const d of DIFFS) {
    it(`${id} d${d}: solver wins, not too many settings do, extremes and start lose`, () => {
      const seen = new Set<string>()
      for (const seed of SEEDS) {
        const L = generate(kindOf(id), d, seed)
        const tag = `${id} d${d} s${seed}`
        const wins = solve(L)
        expect(wins.length, tag).toBeGreaterThanOrEqual(1)
        expect(wins.length / comboCount(L), tag).toBeLessThanOrEqual(SHARE[d - 1])
        expect(evaluate(L, L.solution).win, tag).toBe(true)
        expect(evaluate(L, L.start).win, `${tag} start`).toBe(false)
        for (const e of extremes(L)) expect(evaluate(L, e).win, `${tag} extreme`).toBe(false)
        expect(L.shots).toBe([4, 4, 4, 3][d - 1])
        expect(L.controls.length).toBe(d === 1 ? 1 : 2)
        if (L.kind === 'lever' && d >= 2) {
          // The tallest block never works: the bar end rises out of reach or the stone is too heavy.
          forEachCombo(L, idx => { if (idx[1] === L.controls[1].values.length - 1) expect(evaluate(L, idx).win, tag).toBe(false) })
        }
        if (L.kind === 'shaduf') {
          // No counterweight, or all of it, fails at every pivot.
          forEachCombo(L, idx => { if (idx[0] === 0 || idx[0] === L.controls[0].values.length - 1) expect(evaluate(L, idx).win, tag).toBe(false) })
        }
        if (L.kind === 'susong') expect(L.scoops.length).toBe(d >= 3 ? 2 : 1)
        seen.add(JSON.stringify(L))
      }
      expect(seen.size, `${id} d${d} variety`).toBeGreaterThanOrEqual(SEEDS.length - 1)
    })
  }

  for (const d of DIFFS) {
    it(`roman-statera d${d}: every good balances at one notch, the beam end and the start never do`, () => {
      for (const seed of SEEDS) {
        const S = generateStatera(d, seed)
        const sol = solveStatera(S)
        expect(S.goods.length).toBe([3, 4, 5, 6][d - 1])
        expect(S.hooks.length).toBe(d >= 3 ? 2 : 1)
        expect(S.zero > 0).toBe(d === 4)
        sol.forEach((s, g) => {
          expect(s, `d${d} s${seed} g${g}`).not.toBeNull()
          expect(isLevel(S, g, s!.hook, s!.notch)).toBe(true)
          for (let h = 0; h < S.hooks.length; h++) expect(isLevel(S, g, h, S.K)).toBe(false)
          if (g > 0) expect(isLevel(S, g, sol[g - 1]!.hook, sol[g - 1]!.notch)).toBe(false)
        })
        expect(isLevel(S, 0, 0, 0)).toBe(false)
        // D3+: at least one good is too heavy for the light hook.
        if (d >= 3) expect(S.goods.some((_, g) => !Array.from({ length: S.K + 1 }, (_, k) => k).some(k => isLevel(S, g, 0, k)))).toBe(true)
      }
    })
  }
})

describe('LeverGame component', () => {
  const setControls = (c: HTMLElement, L: Level, idx: number[]) => {
    L.controls.forEach((ctl, k) => {
      fireEvent.change(c.querySelector(`[data-testid="lev-ctl-${ctl.key}"]`)!, { target: { value: String(idx[k]) } })
    })
  }
  const test = (c: HTMLElement) => {
    fireEvent.click(c.querySelector('[data-testid="lev-test"]')!)
    act(() => { vi.advanceTimersByTime(2000) })
  }

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(LeverGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelector('[data-testid="lev-scene"]')).not.toBeNull()
      expect(container.textContent).toContain(CONFIGS[id].title)
      if (CONFIGS[id].kind === 'statera') expect(container.querySelector('[data-testid="lev-record"]')).not.toBeNull()
      else expect(container.querySelectorAll('input[type="range"]').length).toBe(generate(kindOf(id), d, 3).controls.length)
      unmount()
    }
  })

  it('accepts title overrides', () => {
    const { container } = render(createElement(LeverGame, { configId: 'shaduf', difficulty: 1, seed: 1, params: { title: 'Custom Title' }, onWin: () => {}, onLose: () => {} }))
    expect(container.textContent).toContain('Custom Title')
  })

  it('a failed test, then the solution, wins once', () => {
    vi.useFakeTimers()
    for (const id of STATIC) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(LeverGame, { configId: id, difficulty: d, seed: 11, onWin, onLose }))
      const L = generate(kindOf(id), d, 11)
      test(container) // the start never wins
      expect(container.querySelector('[data-testid="lev-note"]')).not.toBeNull()
      setControls(container, L, L.solution)
      test(container)
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('using every test on failures loses once', () => {
    vi.useFakeTimers()
    for (const id of STATIC) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(LeverGame, { configId: id, difficulty: d, seed: 4, onWin, onLose }))
      const L = generate(kindOf(id), d, 4)
      setControls(container, L, extremes(L)[1])
      for (let k = 0; k < L.shots + 2; k++) if (container.querySelector('[data-testid="lev-test"]')) test(container)
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      expect(container.querySelector('[data-testid="lev-test"]')).toBeNull()
      unmount()
    }
  })

  it('steelyard: weighing every good at its notch wins once', () => {
    vi.useFakeTimers()
    for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { unmount } = render(createElement(LeverGame, { configId: 'roman-statera', difficulty: d, seed: 11, onWin, onLose }))
      const S = generateStatera(d, 11)
      let hook = 0
      for (const s of solveStatera(S)) {
        while (hook !== s!.hook) { fireEvent.click(screen.getByTestId('lev-hook')); hook = (hook + 1) % S.hooks.length }
        fireEvent.change(screen.getByTestId('lev-notch'), { target: { value: String(s!.notch) } })
        act(() => { vi.advanceTimersByTime(1000) })
        fireEvent.click(screen.getByTestId('lev-record'))
      }
      expect(screen.getByTestId('lev-done').textContent).toContain(`${S.goods.length} / ${S.goods.length}`)
      act(() => { vi.advanceTimersByTime(1500) })
      expect(onWin, `d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('steelyard: false weighings lose once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const S = generateStatera(2, 5)
    render(createElement(LeverGame, { configId: 'roman-statera', difficulty: 2, seed: 5, onWin, onLose }))
    fireEvent.change(screen.getByTestId('lev-notch'), { target: { value: String(S.K) } })
    for (let i = 0; i < S.maxMistakes + 3; i++) if (screen.queryByTestId('lev-record')) fireEvent.click(screen.getByTestId('lev-record'))
    act(() => { vi.advanceTimersByTime(1500) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('steelyard: running out of time loses once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const S = generateStatera(1, 6)
    render(createElement(LeverGame, { configId: 'roman-statera', difficulty: 1, seed: 6, onWin, onLose }))
    act(() => { vi.advanceTimersByTime((S.seconds + 1) * 1000) })
    act(() => { vi.advanceTimersByTime(1500) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
