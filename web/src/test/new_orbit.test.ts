// Orbits: every config × difficulty × seed builds a level whose built-in
// solution wins under the game's own integrator; the full solver finds few
// enough winning settings for the tier; and the component wins/loses once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import OrbitGame, {
  CONFIGS, CONFIG_IDS, generate, evaluate, solve, comboCount, makeState, leapfrog, forEachCombo, type Level,
} from '@/components/minigames/OrbitGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006, 99991, 123456]
const kindOf = (id: string) => CONFIGS[id].kind

describe('orbit physics', () => {
  it('leapfrog keeps a circular orbit circular and conserves energy', () => {
    const s = makeState(1, 0, 0, 1, null)
    const e0 = 0.5 - 1
    let rmin = 1, rmax = 1
    for (let i = 0; i < 2000; i++) { leapfrog(s, 0.01, null); const r = Math.hypot(s.x, s.y); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r) }
    expect(rmax - rmin).toBeLessThan(1e-3)
    expect(Math.abs((s.vx ** 2 + s.vy ** 2) / 2 - 1 / Math.hypot(s.x, s.y) - e0)).toBeLessThan(1e-4)
  })

  it('is deterministic', () => {
    const a = generate('slingshot', 3, 5), b = generate('slingshot', 3, 5)
    expect(evaluate(a, a.start).path).toEqual(evaluate(b, b.start).path)
  })
})

describe('orbit levels', () => {
  for (const id of CONFIG_IDS) {
    it(`${id}: the built-in solution wins, the start does not, seeds vary`, () => {
      for (const d of DIFFS) {
        const seen = new Set<string>()
        for (const seed of SEEDS) {
          const L = generate(kindOf(id), d, seed)
          expect(evaluate(L, L.solution, false).win, `${id} d${d} s${seed}`).toBe(true)
          expect(evaluate(L, L.start, false).win, `${id} d${d} s${seed} start`).toBe(false)
          expect(L.shots).toBe([5, 5, 4, 4][d - 1])
          expect(L.preview > 0).toBe(d <= 2)
          seen.add(JSON.stringify([L.r0, L.theta0, L.markers, L.r2, L.rFar, L.target, L.band, L.planet?.phase, L.sector]))
        }
        expect(seen.size, `${id} d${d} variety`).toBeGreaterThanOrEqual(SEEDS.length - 1)
      }
    })
  }

  // The share of all settings that win shrinks with difficulty (one in a few
  // at D1 with a preview, a few percent at D4 without one).
  const SHARE = [0.35, 0.25, 0.16, 0.1]
  for (const id of CONFIG_IDS) for (const d of DIFFS) {
    it(`${id} d${d}: solver finds winners, but not too many`, () => {
      const seeds = kindOf(id) === 'slingshot' ? [1, 7] : [1, 7, 42]
      for (const seed of seeds) {
        const L = generate(kindOf(id), d, seed)
        const wins = solve(L)
        expect(wins.length, `${id} d${d} s${seed}`).toBeGreaterThanOrEqual(1)
        expect(wins.length / comboCount(L), `${id} d${d} s${seed} share`).toBeLessThanOrEqual(SHARE[d - 1])
        // The solver agrees with direct evaluation.
        expect(evaluate(L, wins[0], false).win).toBe(true)
      }
    })
  }
})

describe('orbit component', () => {
  const setControls = (c: HTMLElement, L: Level, idx: number[]) => {
    L.controls.forEach((ctl, k) => {
      fireEvent.change(c.querySelector(`[data-testid="orb-ctl-${ctl.key}"]`)!, { target: { value: String(idx[k]) } })
    })
  }
  const launch = (c: HTMLElement) => {
    fireEvent.click(c.querySelector('[data-testid="orb-launch"]')!)
    act(() => { vi.advanceTimersByTime(2500) })
  }

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(OrbitGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      const L = generate(kindOf(id), d, 3)
      expect(container.querySelectorAll('input[type="range"]').length).toBe(L.controls.length)
      expect(container.querySelector('[data-testid="orb-launch"]')).not.toBeNull()
      expect(container.querySelector('[data-testid="orb-preview"]') !== null).toBe(d <= 2)
      unmount()
    }
  })

  it('accepts title and intro overrides', () => {
    const { container } = render(createElement(OrbitGame, { configId: 'halley-return', difficulty: 1, seed: 1, params: { title: 'Custom Title' }, onWin: () => {}, onLose: () => {} }))
    expect(container.textContent).toContain('Custom Title')
  })

  it('a missed shot, then the solution, wins once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(OrbitGame, { configId: id, difficulty: d, seed: 11, onWin, onLose }))
      const L = generate(kindOf(id), d, 11)
      launch(container) // the start setting never wins
      expect(container.querySelector('[data-testid="orb-note"]')).not.toBeNull()
      setControls(container, L, L.solution)
      launch(container)
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('using every launch on misses loses once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(OrbitGame, { configId: id, difficulty: d, seed: 4, onWin, onLose }))
      const L = generate(kindOf(id), d, 4)
      let miss: number[] | null = null
      forEachCombo(L, idx => { if (!miss && !evaluate(L, idx, false).win) miss = idx })
      setControls(container, L, miss!)
      for (let k = 0; k < L.shots; k++) launch(container)
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      expect(container.querySelector('[data-testid="orb-launch"]')).toBeNull()
      unmount()
    }
  })
})
