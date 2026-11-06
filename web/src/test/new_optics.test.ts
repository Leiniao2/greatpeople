// Lenses (optics bench): every config × difficulty × seed plants a working
// solution within the size budget, the empty bench never wins, no single
// piece shortcuts a multi-piece puzzle, and the component shows the light live,
// wins as soon as it is true and loses only when the clock runs out.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import OpticsGame, {
  CONFIGS, CONFIG_IDS, SECONDS, generate, evaluate, placePiece, allowedSlots, rowsFor, traceAll,
  type Placement, type Puzzle,
} from '@/components/minigames/OpticsGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 5, 8, 13, 42, 99, 1234, 777777]

function singlePieceWins(pz: Puzzle, ids = pz.tray.map(p => p.id)): boolean {
  for (const id of ids) {
    const piece = pz.tray.find(p => p.id === id)!
    for (const slot of allowedSlots(pz, piece)) for (const row of rowsFor(pz, piece)) for (const o of [1, -1] as const) {
      if (evaluate(pz, { [id]: { slot, row, o } }).ok) return true
    }
  }
  return false
}

describe('optics logic', () => {
  it('every config × difficulty × seed is solvable by its planted solution, within budget', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const sigs = new Set<string>()
      for (const seed of SEEDS) {
        const pz = generate(CONFIGS[id].kind, d, seed)
        const tag = `${id} d${d} s${seed}`
        expect(evaluate(pz, pz.planted).ok, tag).toBe(true)
        expect(evaluate(pz, {}).ok, `${tag} empty`).toBe(false)
        // Budget for a 1–3 minute challenge.
        expect(pz.seconds).toBe(SECONDS[d - 1])
        expect(pz.tray.length, tag).toBeLessThanOrEqual([3, 5, 7, 8][d - 1])
        expect(Object.keys(pz.planted).length, tag).toBeLessThanOrEqual(5)
        expect(pz.S, tag).toBeLessThanOrEqual(12)
        // Planted pieces sit on legal cells, and replaying placements reproduces them.
        let pl: Placement = {}
        for (const [pid, pos] of Object.entries(pz.planted)) {
          const piece = pz.tray.find(p => p.id === pid)!
          expect(allowedSlots(pz, piece)).toContain(pos.slot)
          expect(rowsFor(pz, piece)).toContain(pos.row)
          pl = placePiece(pz, pl, pid, pos.slot, pos.row)
          pl[pid] = { ...pl[pid], o: pos.o }
        }
        expect(evaluate(pz, pl).ok, `${tag} replay`).toBe(true)
        // Targets stay on screen.
        for (const m of pz.marks) expect(Math.abs(m.y), tag).toBeLessThanOrEqual(3.6)
        sigs.add(JSON.stringify([pz.tray.map(p => [p.kind, p.f, p.s, p.b]), pz.planted, pz.marks.map(m => m.y.toFixed(2))]))
      }
      expect(sigs.size, `${id} d${d} variety`).toBeGreaterThanOrEqual(6)
    }
  })

  it('no single piece solves a multi-piece puzzle, and decoy holes never work (a second prism may also split a D1 beam)', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const seed of SEEDS.slice(0, 6)) {
      const pz = generate(CONFIGS[id].kind, d, seed)
      const planted = Object.keys(pz.planted)
      if (planted.length >= 2) expect(singlePieceWins(pz), `${id} d${d} s${seed}`).toBe(false)
      else if (CONFIGS[id].kind === 'alhazen') {
        const decoys = pz.tray.map(p => p.id).filter(x => !planted.includes(x))
        expect(singlePieceWins(pz, decoys), `${id} d${d} s${seed} decoys`).toBe(false)
      }
    }
  })

  it('newton recombination cannot be faked with two prisms alone', () => {
    for (const d of [3, 4] as Difficulty[]) for (const seed of SEEDS.slice(0, 5)) {
      const pz = generate('newton', d, seed)
      expect(pz.mode).toBe('recombine')
      const [a, b] = pz.tray.filter(p => p.kind === 'prism')
      for (let s1 = 1; s1 <= pz.S; s1++) for (let s2 = 1; s2 <= pz.S; s2++) if (s1 !== s2) {
        for (const o1 of [1, -1] as const) for (const o2 of [1, -1] as const) {
          expect(evaluate(pz, { [a.id]: { slot: s1, row: 0, o: o1 }, [b.id]: { slot: s2, row: 0, o: o2 } }).ok).toBe(false)
        }
      }
    }
  })

  it('variants change the rules across tiers', () => {
    expect(generate('newton', 1, 1).mode).toBe('split')
    expect(generate('newton', 2, 1).mode).toBe('crucis')
    expect(generate('fresnel', 1, 1).lampX).toBe(0)
    expect(generate('fresnel', 4, 1).lampX).toBeNull()
    expect(generate('alhazen', 2, 1).points!.length).toBe(3)
    expect(generate('alhazen', 4, 1).tray.filter(p => p.kind === 'hole' && p.f).length).toBe(4)
    // A Keplerian pair (two convex lenses) gives a parallel but inverted beam.
    const gal = generate('galileo', 1, 1)
    const fake: Puzzle = { ...gal, tray: [{ id: 'a', kind: 'lens', f: 3 }, { id: 'b', kind: 'lens', f: 2 }] }
    const v = evaluate(fake, { a: { slot: 1, row: 0, o: 1 }, b: { slot: 6, row: 0, o: 1 } })
    expect(v.ok).toBe(false)
    expect(v.why).toMatch(/upside down/)
    expect(traceAll(fake, { a: { slot: 1, row: 0, o: 1 }, b: { slot: 6, row: 0, o: 1 } }).every(r => Math.abs(r.t) < 1e-9)).toBe(true)
  })
})

describe('optics component', () => {
  const q = (c: HTMLElement, sel: string) => c.querySelector(sel) as Element

  function playPlanted(container: HTMLElement, pz: Puzzle) {
    for (const [pid, pos] of Object.entries(pz.planted)) {
      fireEvent.click(q(container, `[data-tray="${pid}"]`))
      fireEvent.click(q(container, `[data-cell="${pos.slot}:${pos.row}"]`))
      if (pos.o === -1) fireEvent.click(q(container, '[data-action="flip"]'))
      fireEvent.click(q(container, `[data-tray="${pid}"]`)) // deselect
    }
  }

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(OpticsGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      const pz = generate(CONFIGS[id].kind, d, 3)
      expect(container.querySelectorAll('[data-tray]').length).toBe(pz.tray.length)
      expect(container.querySelector('svg')).not.toBeNull()
      unmount()
    }
  })

  it('draws the light live, before any piece is submitted', () => {
    const pz = generate('galileo', 1, 7)
    const { container } = render(createElement(OpticsGame, { configId: 'galileo-telescope', difficulty: 1, seed: 7, onWin: () => {}, onLose: () => {} }))
    expect(container.querySelectorAll('polyline').length).toBe(pz.beam!.length)
    expect(container.querySelector('[data-action="light"]')).toBeNull()
    const [pid, pos] = Object.entries(pz.planted)[0]
    fireEvent.click(q(container, `[data-tray="${pid}"]`))
    fireEvent.click(q(container, `[data-cell="${pos.slot}:${pos.row}"]`))
    // One lens alone bends the beam, and the live hint says why it is not done yet.
    const bent = [...container.querySelectorAll('polyline')].some(l => (l.getAttribute('points') ?? '').split(' ').length > 2)
    expect(bent).toBe(true)
    expect(q(container, '[data-testid="opt-why"]').textContent).toMatch(/parallel|pupil|upside/)
  })

  it('placing the planted solution wins once, with no button to press', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(OpticsGame, { configId: id, difficulty: d, seed: 11, onWin, onLose }))
      const pz = generate(CONFIGS[id].kind, d, 11)
      playPlanted(container, pz)
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('running out of time on a wrong bench loses once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { unmount } = render(createElement(OpticsGame, { configId: id, difficulty: d, seed: 4, onWin, onLose }))
      act(() => { vi.advanceTimersByTime((SECONDS[d - 1] - 1) * 1000) })
      expect(onLose, `${id} d${d} early`).not.toHaveBeenCalled()
      act(() => { vi.advanceTimersByTime(2000) })
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('accepts title overrides through params', () => {
    const { getByText } = render(createElement(OpticsGame, { configId: 'newton-prism', difficulty: 1, seed: 1, params: { title: 'Custom Bench' }, onWin: () => {}, onLose: () => {} }))
    expect(getByText('Custom Bench')).toBeTruthy()
  })
})
