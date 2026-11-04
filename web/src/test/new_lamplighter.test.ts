// Lamplighter (Lights Out): generated boards are solvable within budget, the
// GF(2)/GF(3) solver is optimal, each config is a distinct rule, the time
// budget holds, and the component wins and loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import LamplighterGame, {
  CONFIGS, CONFIG_IDS, generate, solveOptimal, press, isSolved, tierFor, affected, litStreet, type Board, type Pattern,
} from '@/components/minigames/LamplighterGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]

/** Brute force over every press count per lamp (small boards only). */
function bruteOptimal(board: Board, pattern: Pattern): number {
  const cells = board.holes.map((h, i) => (h ? -1 : i)).filter(i => i >= 0)
  const P = board.phases
  const eff = cells.map(c => affected(board.n, board.holes, pattern, c))
  let best = Infinity
  const total = P ** cells.length
  const lvl = new Uint8Array(board.lit.length)
  for (let code = 0; code < total; code++) {
    lvl.set(board.lit)
    let rest = code, w = 0
    for (let k = 0; k < cells.length; k++) {
      const t = rest % P; rest = Math.floor(rest / P)
      if (!t) continue
      w += t
      for (const j of eff[k]) lvl[j] = (lvl[j] + t) % P
    }
    if (w < best && cells.every(c => lvl[c] === P - 1)) best = w
  }
  return best
}

describe('lamplighter logic', () => {
  it('every config × difficulty × seed is solvable within budget, and the solver solution really works', () => {
    let worst = 0
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const opts = new Set<string>()
      for (let seed = 1; seed <= 12; seed++) {
        const t0 = performance.now()
        const p = generate(CONFIGS[id], d, seed)
        worst = Math.max(worst, performance.now() - t0)
        expect(isSolved(p.board), `${id} d${d} s${seed} not already solved`).toBe(false)
        const sol = solveOptimal(p.board, p.pattern)!
        expect(sol.length).toBe(p.optimal)
        let b = p.board
        for (const i of sol) b = press(b, p.pattern, i)
        expect(isSolved(b), `${id} d${d} s${seed}`).toBe(true)
        expect(p.budget).toBe(p.optimal + tierFor(d).slack)
        expect(p.board.n).toBe(tierFor(d).n)
        opts.add(p.board.lit.map(Number).join(''))
      }
      expect(opts.size, `${id} d${d} variety`).toBeGreaterThan(8)
    }
    expect(worst).toBeLessThan(500)
  })

  it('hard tiers reach their minimum optimal length for most seeds', () => {
    for (const id of CONFIG_IDS) for (const d of [3, 4] as Difficulty[]) {
      let ok = 0
      for (let seed = 1; seed <= 10; seed++) if (generate(CONFIGS[id], d, seed).optimal >= tierFor(d).minOptimal) ok++
      expect(ok, `${id} d${d}`).toBeGreaterThanOrEqual(8)
    }
  })

  it('the GF(2) optimum matches brute force on 4×4 boards', () => {
    for (const pattern of ['plus', 'cross', 'king'] as Pattern[]) for (let seed = 1; seed <= 4; seed++) {
      for (const d of [1, 2] as Difficulty[]) {
        const p = generate({ pattern, broken: d === 2 ? 0.14 : 0 }, d, seed)
        expect(solveOptimal(p.board, pattern)!.length, `${pattern} d${d} s${seed}`).toBe(bruteOptimal(p.board, pattern))
      }
    }
  })

  it('the GF(3) optimum matches brute force on 3×3 three-notch boards', () => {
    for (const pattern of ['plus', 'cross', 'king'] as Pattern[]) for (let seed = 1; seed <= 5; seed++) {
      let b = litStreet(3, Array(9).fill(false), 3)
      for (let k = 0; k < 4; k++) b = press(b, pattern, (seed * 7 + k * 5) % 9)
      const sol = solveOptimal(b, pattern)!
      expect(sol.length, `${pattern} s${seed}`).toBe(bruteOptimal(b, pattern))
      let x = b
      for (const i of sol) x = press(x, pattern, i)
      expect(isSolved(x)).toBe(true)
    }
  })

  it('reports unsolvable boards', () => {
    // On a 4×4 plus board some single-lamp states are unreachable.
    const holes = Array(16).fill(false)
    const lit = Array(16).fill(1); lit[0] = 0
    expect(solveOptimal({ n: 4, holes, lit, phases: 2 }, 'plus')).toBeNull()
  })

  it('time budget: ~1 min at D1 up to ~3 min at D4, and D1 still needs thought', () => {
    const maxLamps = [16, 16, 25, 25], maxBudget = [8, 10, 12, 13]
    for (const d of DIFFS) {
      const t = tierFor(d)
      expect(t.n ** 2, `d${d} lamps`).toBeLessThanOrEqual(maxLamps[d - 1])
      for (const id of CONFIG_IDS) for (let seed = 1; seed <= 8; seed++) {
        const p = generate(CONFIGS[id], d, seed)
        expect(p.budget, `${id} d${d} s${seed} budget`).toBeLessThanOrEqual(maxBudget[d - 1])
        // Never a one-tap board: D1 needs at least three presses found.
        expect(p.optimal).toBeGreaterThanOrEqual(3)
      }
    }
    expect(tierFor(4).slack).toBeLessThanOrEqual(1)
  })

  it('every config is a distinct rule', () => {
    const key = (id: string) => `${CONFIGS[id].pattern}|${(CONFIGS[id].broken ?? 0) > 0}|${CONFIGS[id].phases ?? 2}`
    expect(new Set(CONFIG_IDS.map(key)).size).toBe(CONFIG_IDS.length)
  })

  it('variant rules: neighbourhoods, broken lamps and three-notch burners', () => {
    const holes = Array(25).fill(false)
    const sorted = (a: number[]) => [...a].sort((x, y) => x - y)
    expect(sorted(affected(5, holes, 'plus', 12))).toEqual([7, 11, 12, 13, 17])
    expect(sorted(affected(5, holes, 'cross', 12))).toEqual([6, 8, 12, 16, 18])
    expect(sorted(affected(5, holes, 'king', 12))).toEqual([6, 7, 8, 11, 12, 13, 16, 17, 18])
    // Broken lamps are never toggled and need no light.
    const h2 = [...holes]; h2[13] = true
    expect(affected(5, h2, 'plus', 12)).not.toContain(13)
    const b2 = press(litStreet(5, h2, 2), 'plus', 13)
    expect(b2.lit).toEqual(litStreet(5, h2, 2).lit)
    expect(isSolved(litStreet(5, h2, 2))).toBe(true)
    for (const id of CONFIG_IDS) {
      const p = generate(CONFIGS[id], 4, 2)
      expect(p.board.holes.some(Boolean), id).toBe((CONFIGS[id].broken ?? 0) > 0)
      expect(p.board.phases).toBe(CONFIGS[id].phases ?? 2)
    }
    // Three notches: one tap from bright goes dark, three taps come back round.
    let b3 = litStreet(4, Array(16).fill(false), 3)
    b3 = press(b3, 'plus', 5)
    expect(b3.lit[5]).toBe(0)
    b3 = press(b3, 'plus', 5)
    expect(b3.lit[5]).toBe(1)
    expect(isSolved(b3)).toBe(false) // dim is not lit
    b3 = press(b3, 'plus', 5)
    expect(isSolved(b3)).toBe(true)
  })
})

describe('lamplighter component', () => {
  const lamp = (c: HTMLElement, i: number) => c.querySelector<HTMLButtonElement>(`[data-lamp="${i}"]`)!

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(LamplighterGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelectorAll('[data-lamp]').length).toBe(tierFor(d).n ** 2)
      unmount()
    }
  })

  it('pressing an optimal solution wins once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(LamplighterGame, { configId: id, difficulty: d, seed: 11, onWin, onLose }))
      const p = generate(CONFIGS[id], d, 11)
      for (const i of solveOptimal(p.board, p.pattern)!) fireEvent.click(lamp(container, i))
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('wasting presses loses once', () => {
    vi.useFakeTimers()
    for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(LamplighterGame, { configId: 'pall-mall', difficulty: d, seed: 4, onWin, onLose }))
      const p = generate(CONFIGS['pall-mall'], d, 4)
      const target = p.board.holes.findIndex(h => !h)
      for (let k = 0; k < p.budget + 2; k++) fireEvent.click(lamp(container, target))
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('three-notch lamps show dark, dim and bright', () => {
    const { container } = render(createElement(LamplighterGame, { configId: 'peter-street', difficulty: 1, seed: 5, onWin: () => {}, onLose: () => {} }))
    const p = generate(CONFIGS['peter-street'], 1, 5)
    const levels = [...container.querySelectorAll('[data-lamp]')].map(e => Number(e.getAttribute('data-level')))
    expect(levels).toEqual(p.board.lit)
    const i = p.board.lit.findIndex(v => v === 2)
    fireEvent.click(lamp(container, i >= 0 ? i : 0))
    expect(container.querySelectorAll('[data-level="1"], [data-level="0"]').length).toBeGreaterThan(0)
    expect(container.textContent).toContain('dark → dim → bright')
  })
})
