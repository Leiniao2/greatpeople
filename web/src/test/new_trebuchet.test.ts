// Trebuchet: the flight integrator obeys the textbook cases, every config ×
// difficulty × seed builds a level whose built-in solution wins under the
// game's own physics, winners are a small share of all settings, extreme and
// starting settings lose, and the component wins/loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import TrebuchetGame, {
  CONFIGS, CONFIG_IDS, G, generate, evaluate, solve, comboCount, fly, yAt, dragK, trebuchetSpeed, bombardSpeed,
  type Level,
} from '@/components/minigames/TrebuchetGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006]
const kindOf = (id: string) => CONFIGS[id].kind
const SHARE = [0.12, 0.08, 0.06, 0.045]

describe('trebuchet physics', () => {
  it('without drag, range from the ground matches v²·sin2θ/g', () => {
    const p = fly(40, 45, 0, { k: 0, wind: 0 }, 1000)
    const last = p.xs[p.n - 1]
    expect(Math.abs(last - 40 * 40 / G)).toBeLessThan(2)
    // 30° and 60° land at the same range.
    const a = fly(40, 30, 0, { k: 0, wind: 0 }, 1000), b = fly(40, 60, 0, { k: 0, wind: 0 }, 1000)
    expect(Math.abs(a.xs[a.n - 1] - b.xs[b.n - 1])).toBeLessThan(2)
  })

  it('drag shortens the flight; a tail wind lengthens it, a head wind shortens it', () => {
    const k = dragK(140)
    expect(k).toBeGreaterThan(1e-4)
    const free = fly(45, 45, 10, { k: 0, wind: 0 }, 1000)
    const drag = fly(45, 45, 10, { k, wind: 0 }, 1000)
    const tail = fly(45, 45, 10, { k, wind: 8 }, 1000)
    const head = fly(45, 45, 10, { k, wind: -8 }, 1000)
    const r = (p: typeof free) => p.xs[p.n - 1]
    expect(r(drag)).toBeLessThan(r(free))
    expect(r(tail)).toBeGreaterThan(r(drag))
    expect(r(head)).toBeLessThan(r(drag))
    expect(yAt(drag, 1e6)).toBeNull()
  })

  it('a heavier counterweight and a longer sling throw faster, with diminishing returns; heavier stones fly slower', () => {
    const e = { l: 1.5, arm: 8, drop: 3, eta: 0.7, y0: 9 }
    const v = (cw: number, s = 4, m = 100) => trebuchetSpeed(e, cw, s, m)
    expect(v(10)).toBeGreaterThan(v(5))
    expect(v(20) - v(15)).toBeLessThan(v(10) - v(5))
    expect(trebuchetSpeed(e, 10, 8, 100)).toBeGreaterThan(trebuchetSpeed(e, 10, 2, 100))
    expect(v(10, 4, 120)).toBeLessThan(v(10, 4, 60))
    expect(bombardSpeed(40, 544)).toBeGreaterThan(bombardSpeed(20, 544))
  })

  it('is deterministic per seed', () => {
    const a = generate('crag', 3, 5), b = generate('crag', 3, 5)
    expect(a.targets).toEqual(b.targets)
    expect(a.phys).toEqual(b.phys)
  })
})

describe('trebuchet levels', () => {
  for (const id of CONFIG_IDS) for (const d of DIFFS) {
    it(`${id} d${d}: solvable, not too easy, extremes and start lose, seeds vary`, () => {
      const seen = new Set<string>()
      for (const seed of SEEDS) {
        const L = generate(kindOf(id), d, seed)
        const N = comboCount(L)
        expect(L.shots).toBe(kindOf(id) === 'walls' ? [8, 7, 6, 5][d - 1] : [6, 5, 5, 4][d - 1])
        L.targets.forEach((_, t) => {
          // The built-in solution wins, and the solver agrees with direct evaluation.
          expect(evaluate(L, L.solution[t], t, 0).win, `${id} d${d} s${seed} t${t}`).toBe(true)
          const wins = solve(L, t, 0)
          expect(wins.length).toBeGreaterThanOrEqual(2)
          expect(wins.length / N, `${id} d${d} s${seed} share`).toBeLessThanOrEqual(SHARE[d - 1])
          // Start, all-minimum and all-maximum never win.
          expect(evaluate(L, L.start, t, 0).win).toBe(false)
          expect(evaluate(L, L.controls.map(() => 0), t, 0).win).toBe(false)
          expect(evaluate(L, L.controls.map(c => c.values.length - 1), t, 0).win).toBe(false)
        })
        // Every stone in a mixed pile can still be made to hit.
        for (let s = 0; s < L.shots; s++) expect(solve(L, 0, s).length, `${id} d${d} stone ${s}`).toBeGreaterThan(0)
        // Two hits must fit in the shots for the bombard.
        expect(L.targets.length).toBeLessThanOrEqual(L.shots)
        seen.add(JSON.stringify([L.targets.map(t => [t.x.toFixed(1), t.lo]), L.phys.wind, L.stones]))
      }
      expect(seen.size, `${id} d${d} variety`).toBeGreaterThanOrEqual(SEEDS.length - 1)
    })
  }

  it('the mixed stone pile at Xiangyang needs retuning: one setting does not hit with every stone', () => {
    let found = false
    for (const seed of SEEDS) {
      const L = generate('tower', 3, seed)
      const w0 = new Set(solve(L, 0, 0).map(x => x.join()))
      for (let s = 1; s < L.shots; s++) if (L.stones[s] !== L.stones[0] && solve(L, 0, s).some(x => !w0.has(x.join()))) found = true
    }
    expect(found).toBe(true)
  })

  it('in wind, the drag-free solution would miss: the air matters', () => {
    let differs = 0
    for (const seed of SEEDS) {
      const L = generate('crag', 4, seed)
      // Re-fly the built-in solution with no air at all.
      const vals = L.controls.map((c, k) => c.values[L.solution[0][k]])
      const v = trebuchetSpeed(L.eng, vals[0], vals[1], L.stones[0])
      const p = fly(v, vals[2], L.y0, { k: 0, wind: 0 }, 1000)
      const y = yAt(p, L.targets[0].x)
      if (y === null || y < L.targets[0].lo || y > L.targets[0].top) differs++
    }
    expect(differs).toBeGreaterThan(0)
  })
})

describe('trebuchet component', () => {
  const setControls = (c: HTMLElement, L: Level, idx: number[]) => {
    L.controls.forEach((ctl, k) => {
      fireEvent.change(c.querySelector(`[data-testid="treb-ctl-${ctl.key}"]`)!, { target: { value: String(idx[k]) } })
    })
  }
  const loose = (c: HTMLElement) => {
    fireEvent.click(c.querySelector('[data-testid="treb-loose"]')!)
    act(() => { vi.advanceTimersByTime(2000) })
  }

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(TrebuchetGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      const L = generate(kindOf(id), d, 3)
      expect(container.querySelectorAll('input[type="range"]').length).toBe(L.controls.length)
      expect(container.querySelector('[data-testid="treb-loose"]')).not.toBeNull()
      expect(container.querySelector('[data-testid="treb-band"]')).not.toBeNull()
      expect(container.querySelector('[data-testid="treb-preview"]') !== null).toBe(d <= 2)
      unmount()
    }
  })

  it('accepts title overrides', () => {
    const { container } = render(createElement(TrebuchetGame, { configId: 'stirling-1304', difficulty: 1, seed: 1, params: { title: 'Custom Siege' }, onWin: () => {}, onLose: () => {} }))
    expect(container.textContent).toContain('Custom Siege')
  })

  it('a miss, then the solver’s settings, wins once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(TrebuchetGame, { configId: id, difficulty: d, seed: 11, onWin, onLose }))
      const L = generate(kindOf(id), d, 11)
      loose(container) // the start setting never wins
      expect(container.querySelector('[data-testid="treb-note"]')).not.toBeNull()
      for (let t = 0; t < L.targets.length; t++) {
        setControls(container, L, solve(L, t, 1 + t)[0])
        loose(container)
      }
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('spending every stone on misses loses once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(TrebuchetGame, { configId: id, difficulty: d, seed: 4, onWin, onLose }))
      const L = generate(kindOf(id), d, 4)
      setControls(container, L, L.controls.map(c => c.values.length - 1))
      for (let k = 0; k < L.shots + 2; k++) {
        const btn = container.querySelector('[data-testid="treb-loose"]')
        if (btn) loose(container)
      }
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      expect(container.querySelector('[data-testid="treb-loose"]')).toBeNull()
      unmount()
    }
  })
})
