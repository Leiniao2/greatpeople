// Truss Bridge: the stiffness solver matches hand statics, every config ×
// difficulty × seed plans a level whose reference design passes the same
// checker within budget (and is minimal: drop any beam and it fails), and the
// component wins and loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import TrussGame, {
  CONFIG_IDS, CONFIGS, analyze, evaluate, planPuzzle, wrongSign, mkey, findReference, allowedPairs,
  type Frame, type Member,
} from '@/components/minigames/TrussGame'
import { hashString } from '@/components/minigames/_shared'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = Array.from({ length: 10 }, (_, i) => i * 7919 + 3)
/** Beams in the reference design — the size budget for 1–3 minutes. */
const MAX_BEAMS: Record<Difficulty, [number, number]> = { 1: [5, 10], 2: [9, 17], 3: [10, 20], 4: [13, 25] }

const triangle: Frame = {
  joints: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }],
  supports: { 0: 'pin', 1: 'roller' },
}

describe('truss statics', () => {
  it('matches the method of joints on a loaded triangle', () => {
    const r = analyze(triangle, [[0, 2], [1, 2], [0, 1]], [{ j: 2, fx: 0, fy: -2 }])
    expect(r.stable).toBe(true)
    expect(r.forces[0]).toBeCloseTo(-Math.SQRT2, 6) // rafters push
    expect(r.forces[1]).toBeCloseTo(-Math.SQRT2, 6)
    expect(r.forces[2]).toBeCloseTo(1, 6) // tie pulls
  })

  it('detects mechanisms and unconnected loads', () => {
    const square: Frame = {
      joints: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
      supports: { 0: 'pin', 1: 'pin' },
    }
    const sides: Member[] = [[0, 2], [1, 3], [2, 3]]
    expect(analyze(square, sides, [{ j: 3, fx: 1, fy: 0 }]).stable).toBe(false)
    expect(analyze(square, [...sides, [1, 2]], [{ j: 3, fx: 1, fy: 0 }]).stable).toBe(true)
    expect(analyze(triangle, [[0, 1]], [{ j: 2, fx: 0, fy: -1 }]).unconnected).toEqual([2])
  })

  it('sign rules: struts push, chains pull', () => {
    expect(wrongSign('compression', 1)).toBe(1)
    expect(wrongSign('compression', -1)).toBe(0)
    expect(wrongSign('tension', -2)).toBe(2)
    expect(wrongSign('tension', 2)).toBe(0)
    expect(wrongSign('any', 5)).toBe(0)
    // A hanging triangle can't be built from struts.
    const hang: Frame = { joints: [{ x: 0, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 0 }], supports: { 0: 'pin', 1: 'pin' } }
    const allowed = allowedPairs(hang, 2)
    expect(findReference(hang, allowed, [[{ j: 2, fx: 0, fy: -1 }]], 'tension')!.length).toBe(2)
    expect(findReference(hang, allowed, [[{ j: 2, fx: 0, fy: -1 }]], 'compression')).toBeNull()
  })
})

describe('truss levels', () => {
  it('every config × difficulty × seed is winnable within budget and sized for 1–3 minutes', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const caps = new Set<string>()
      for (const seed of SEEDS) {
        const p = planPuzzle(id, d, seed)
        const tag = `${id} d${d} s${seed}`
        const v = evaluate(p, p.ref)
        expect(v.ok, tag).toBe(true)
        expect(v.cost, tag).toBeLessThanOrEqual(p.budget)
        expect(p.budget, tag).toBeGreaterThan(v.cost - 1e-9)
        const [lo, hi] = MAX_BEAMS[d]
        expect(p.ref.length, tag).toBeGreaterThanOrEqual(lo)
        expect(p.ref.length, tag).toBeLessThanOrEqual(hi)
        const allowed = new Set(p.allowed.map(([a, b]) => mkey(a, b)))
        for (const [a, b] of p.ref) expect(allowed.has(mkey(a, b)), tag).toBe(true)
        // Nothing built never holds; the reference is minimal — drop any beam and it fails.
        expect(evaluate(p, []).ok).toBe(false)
        p.ref.forEach((_, i) => expect(evaluate(p, p.ref.filter((__, k) => k !== i)).ok, `${tag} minus ${i}`).toBe(false))
        caps.add(`${p.cap}:${p.budget}:${p.joints.length}`)
      }
      expect(caps.size, `${id} d${d} seeds vary`).toBeGreaterThan(1)
    }
  })

  it('variants change the rules, not just the size', () => {
    const p = (id: string) => planPuzzle(id, 3, 5)
    expect(p('roman-arch').sign).toBe('compression')
    expect(p('brunel').sign).toBe('tension')
    expect(p('brunel').fixed.length).toBeGreaterThan(0)
    expect(p('pratt').loadCases.length).toBeGreaterThan(2) // moving load
    expect(p('eiffel').loadCases.length).toBe(2) // wind both ways
    expect(p('eiffel').loadCases.flat().some(l => l.fx !== 0)).toBe(true)
    expect(p('warren').countBeams).toBe(true)
    for (const [a, b] of p('warren').allowed) {
      const J = p('warren').joints
      expect(Math.hypot(J[a].x - J[b].x, J[a].y - J[b].y)).toBeCloseTo(1, 6)
      expect(J[a].x).not.toBe(J[b].x) // no verticals
    }
    for (const id of CONFIG_IDS) expect(CONFIGS[id].fact.length).toBeGreaterThan(40)
  })

  it('a 24-level Arcade ladder rarely repeats a level', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 24; i++) {
      const id = CONFIG_IDS[(i % CONFIG_IDS.length + Math.floor(i / CONFIG_IDS.length)) % CONFIG_IDS.length]
      const d = (Math.min(3, Math.floor(i / 6)) + 1) as Difficulty
      const p = planPuzzle(id, d, hashString(`arcade:truss:${i}`))
      seen.add(`${id}:${d}:${p.joints.length}:${JSON.stringify(p.loadCases)}`)
    }
    expect(seen.size).toBeGreaterThanOrEqual(22)
  })
})

function clickJoint(j: number) { fireEvent.click(screen.getByTestId(`truss-joint-${j}`)) }
function flush() { for (let k = 0; k < 400; k++) act(() => { vi.advanceTimersByTime(50) }) }

describe('TrussGame component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(TrussGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByTestId('truss-board')).toBeTruthy()
      expect(screen.getByTestId('truss-tests').textContent).toContain(String(planPuzzle(id, d, 3).tests))
      cleanup()
    }
  })

  it('building the reference design and testing it calls onWin once', () => {
    vi.useFakeTimers()
    for (const [id, d] of [['pratt', 2], ['brunel', 4], ['eiffel', 3]] as const) {
      const onWin = vi.fn(), onLose = vi.fn()
      const p = planPuzzle(id, d, 11)
      render(createElement(TrussGame, { configId: id, difficulty: d, seed: 11, onWin, onLose }))
      for (const [a, b] of p.ref) { clickJoint(a); clickJoint(b) }
      for (const [a, b] of p.ref) expect(screen.getByTestId(`truss-member-${mkey(a, b)}`)).toBeTruthy()
      fireEvent.click(screen.getByTestId('truss-test'))
      flush()
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('failing every load test calls onLose once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const p = planPuzzle('roman-arch', 1, 4)
    render(createElement(TrussGame, { configId: 'roman-arch', difficulty: 1, seed: 4, onWin, onLose }))
    const [a, b] = p.ref[0]
    clickJoint(a); clickJoint(b)
    for (let i = 0; i < p.tests + 2; i++) {
      const btn = screen.queryByTestId('truss-test')
      if (btn) fireEvent.click(btn)
      flush()
    }
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
