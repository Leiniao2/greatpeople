// Surveyor (triangulation): every generated survey is solvable within its
// budget by the exported solvers, budgets stay small enough for 1–3 minutes,
// and the component wins and loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import SurveyorGame, {
  CONFIGS, CONFIG_IDS, generate, shipError, shipTier, arcApply, arcStart, arcTier, arcOptimal,
  noonSolve, noonReading, noonError, shadowAt, shadowError, fixError,
  type ShipPuzzle, type ArcPuzzle, type NoonPuzzle, type ShadowPuzzle,
} from '@/components/minigames/SurveyorGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = Array.from({ length: 10 }, (_, i) => i * 7919 + 3)
const mode = (id: string) => CONFIGS[id].mode

describe('surveyor logic', () => {
  it('has at least four configs with distinct rules and true facts', () => {
    expect(CONFIG_IDS.length).toBeGreaterThanOrEqual(4)
    // The base configs are each their own twist; story-themed configs reuse one of them.
    const BASE = ['thales-ships', 'pyramid-shadow', 'thales-moment', 'eratosthenes', 'great-arc']
    expect(new Set(BASE.map(mode)).size).toBe(BASE.length)
    for (const id of CONFIG_IDS) expect(BASE.map(mode), id).toContain(mode(id))
    for (const id of CONFIG_IDS) { expect(CONFIGS[id].fact.length).toBeGreaterThan(40); expect(CONFIGS[id].intro.length).toBeGreaterThan(40) }
  })

  it('fix error grows for thin triangles', () => {
    const a = { x: 0, y: 0 }, b = { x: 100, y: 0 }
    const wide = fixError({ x: 50, y: 60 }, a, b, 0.01, 0.01)
    const thin = fixError({ x: 50, y: 900 }, a, b, 0.01, 0.01)
    expect(thin).toBeGreaterThan(wide * 5)
  })

  it('ships: every ship has a pair within tolerance; D3+ boards are picky; budget is small', () => {
    for (const d of DIFFS) {
      let picky = 0
      for (const s of SEEDS) {
        const p = generate('ship', d, s) as ShipPuzzle
        expect(p.posts.length).toBe(shipTier(d).posts)
        expect(p.ships.length).toBe(shipTier(d).ships)
        expect(p.budget).toBeLessThanOrEqual(4)
        let allPicky = true
        p.ships.forEach((ship, k) => {
          expect(shipError(p, ship.best[0], ship.best[1], k)).toBeLessThanOrEqual(ship.tol)
          let good = 0, vis = 0
          for (let a = 0; a < p.posts.length; a++) for (let b = a + 1; b < p.posts.length; b++) {
            const u = shipError(p, a, b, k)
            if (isFinite(u)) { vis++; if (u <= ship.tol) good++ }
          }
          if (good > Math.max(2, vis * 0.35)) allPicky = false
        })
        if (allPicky) picky++
      }
      if (d >= 3) expect(picky, `d${d}`).toBeGreaterThanOrEqual(8)
    }
  })

  it('arc: the optimal plan reaches the peak within tolerance and budget; chains stay short', () => {
    for (const d of DIFFS) {
      const variety = new Set<string>()
      for (const s of SEEDS) {
        const p = generate('arc', d, s) as ArcPuzzle
        expect(p.stations.length).toBe(arcTier(d).hills + 3)
        let u = arcStart(p)
        for (const [t, a, b] of p.plan) u = arcApply(p, u, t, a, b)!
        expect(u[p.peak]).toBeLessThanOrEqual(p.tol)
        expect(p.plan.length).toBeGreaterThanOrEqual(2)
        expect(p.budget).toBeLessThanOrEqual(8)
        expect(arcOptimal(p).u[p.peak]).toBeCloseTo(p.best)
        variety.add(p.stations.map(q => Math.round(q.x)).join(','))
      }
      expect(variety.size).toBeGreaterThanOrEqual(9)
    }
  })

  it('noon: golden-section search wins inside the budget; readings stay few', () => {
    for (const d of DIFFS) for (const s of SEEDS) {
      const p = generate('noon', d, s) as NoonPuzzle
      const order = noonSolve(p)
      expect(order.length).toBeLessThanOrEqual(p.budget)
      expect(p.budget).toBeLessThanOrEqual(13)
      const best = Math.min(...order.map(i => noonReading(p, i)))
      expect(noonError(best), `d${d} s${s}`).toBeLessThanOrEqual(p.tol)
      // Reading only the edges of the window is far from noon.
      expect(noonError(Math.min(noonReading(p, 0), noonReading(p, p.slots - 1)))).toBeGreaterThan(p.tol)
    }
  })

  it('pyramid shadows: the solution moment wins, the opening position does not', () => {
    for (const kind of ['ratio', 'moment'] as const) for (const d of DIFFS) {
      const sols = new Set<string>()
      for (const s of SEEDS) {
        const p = generate(kind, d, s) as ShadowPuzzle
        const r = shadowAt(p, p.solution[0], p.solution[1])
        expect(r.measurable).toBe(true)
        expect(shadowError(p, r), `${kind} d${d} s${s}`).toBeLessThanOrEqual(p.tol)
        expect(shadowError(p, shadowAt(p, 0, 0))).toBeGreaterThan(p.tol)
        // Only a narrow band of moments works.
        let good = 0
        for (let di = 0; di < p.days.length; di++) for (let ti = 0; ti < p.times.length; ti++) if (shadowError(p, shadowAt(p, di, ti)) <= p.tol) good++
        expect(good / (p.days.length * p.times.length)).toBeLessThan(0.2)
        sols.add(`${p.days[p.solution[0]]}:${p.times[p.solution[1]]}`)
      }
      expect(sols.size, `${kind} d${d}`).toBeGreaterThanOrEqual(6)
    }
  })

  it('generation is deterministic and fast', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const t0 = performance.now()
      const a = generate(mode(id), d, 42)
      expect(performance.now() - t0).toBeLessThan(400)
      expect(JSON.stringify(generate(mode(id), d, 42))).toBe(JSON.stringify(a))
    }
  })
})

// ── Component ────────────────────────────────────────────────────────────────

const q = (c: HTMLElement, sel: string) => c.querySelector<HTMLElement>(sel)!
const tid = (c: HTMLElement, id: string) => q(c, `[data-testid="${id}"]`)

function playWin(c: HTMLElement, p: ReturnType<typeof generate>) {
  if (p.kind === 'ship') {
    p.ships.forEach((ship, k) => {
      fireEvent.click(q(c, `[data-ship="${k}"]`))
      fireEvent.click(q(c, `[data-post="${ship.best[0]}"]`))
      fireEvent.click(q(c, `[data-post="${ship.best[1]}"]`))
      fireEvent.click(tid(c, 'sv-sight'))
    })
  } else if (p.kind === 'arc') {
    for (const [t, a, b] of p.plan) {
      fireEvent.click(q(c, `[data-station="${a}"]`))
      fireEvent.click(q(c, `[data-station="${b}"]`))
      fireEvent.click(q(c, `[data-station="${t}"]`))
    }
  } else if (p.kind === 'noon') {
    for (const i of noonSolve(p)) {
      fireEvent.change(tid(c, 'sv-time'), { target: { value: String(i) } })
      fireEvent.click(tid(c, 'sv-read'))
    }
    fireEvent.click(tid(c, 'sv-submit'))
  } else {
    const date = c.querySelector('[data-testid="sv-date"]')
    if (date) fireEvent.change(date, { target: { value: String(p.solution[0]) } })
    fireEvent.change(tid(c, 'sv-time'), { target: { value: String(p.solution[1]) } })
    fireEvent.click(tid(c, 'sv-measure'))
  }
}

function playLose(c: HTMLElement, p: ReturnType<typeof generate>) {
  if (p.kind === 'ship') {
    // Sight the worst visible pair for ship 0 until the sightings run out.
    let worst: [number, number] = [0, 1], wu = -1
    for (let a = 0; a < p.posts.length; a++) for (let b = a + 1; b < p.posts.length; b++) {
      const u = shipError(p, a, b, 0)
      if (isFinite(u) && u > wu) { wu = u; worst = [a, b] }
    }
    expect(wu).toBeGreaterThan(p.ships[0].tol)
    for (let k = 0; k < p.budget; k++) {
      fireEvent.click(q(c, `[data-post="${worst[0]}"]`))
      fireEvent.click(q(c, `[data-post="${worst[1]}"]`))
      fireEvent.click(tid(c, 'sv-sight'))
    }
  } else if (p.kind === 'arc') {
    const [t, a, b] = p.plan[0]
    for (let k = 0; k < p.budget; k++) {
      fireEvent.click(q(c, `[data-station="${a}"]`))
      fireEvent.click(q(c, `[data-station="${b}"]`))
      fireEvent.click(q(c, `[data-station="${t}"]`))
    }
  } else if (p.kind === 'noon') {
    for (let k = 0; k < p.budget; k++) {
      const i = k % 2 ? p.slots - 1 - (k >> 1) : k >> 1
      fireEvent.change(tid(c, 'sv-time'), { target: { value: String(i) } })
      fireEvent.click(tid(c, 'sv-read'))
    }
  } else {
    // Any measurable but wrong moment, used for every try.
    let at: [number, number] | null = null
    for (let di = 0; di < p.days.length && !at; di++) for (let ti = 0; ti < p.times.length && !at; ti++) {
      const r = shadowAt(p, di, ti)
      if (r.measurable && shadowError(p, r) > p.tol) at = [di, ti]
    }
    expect(at).not.toBeNull()
    const date = c.querySelector('[data-testid="sv-date"]')
    if (date) fireEvent.change(date, { target: { value: String(at![0]) } })
    fireEvent.change(tid(c, 'sv-time'), { target: { value: String(at![1]) } })
    for (let k = 0; k < p.attempts; k++) fireEvent.click(tid(c, 'sv-measure'))
  }
}

describe('surveyor component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount, getByText } = render(createElement(SurveyorGame, { configId: id, difficulty: d, seed: 5, onWin: () => {}, onLose: () => {} }))
      expect(getByText(CONFIGS[id].title)).toBeTruthy()
      expect(container.querySelector('svg')).toBeTruthy()
      expect(container.querySelector('[data-testid="sv-left"]')).toBeTruthy()
      unmount()
    }
  })

  it('honours title/intro params', () => {
    const { getByText } = render(createElement(SurveyorGame, { configId: 'eratosthenes', difficulty: 1, seed: 1, params: { title: 'Custom Title', intro: 'Custom intro text.' }, onWin: () => {}, onLose: () => {} }))
    expect(getByText('Custom Title')).toBeTruthy()
    expect(getByText('Custom intro text.')).toBeTruthy()
  })

  it('a scripted solver wins once for every config × difficulty', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const seed of [11, 12]) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(SurveyorGame, { configId: id, difficulty: d, seed, onWin, onLose }))
      playWin(container, generate(mode(id), d, seed))
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d} s${seed}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('a careless surveyor loses once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(SurveyorGame, { configId: id, difficulty: d, seed: 4, onWin, onLose }))
      playLose(container, generate(mode(id), d, 4))
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })
})
