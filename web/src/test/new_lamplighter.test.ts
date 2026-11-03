// Lamplighter (Lights Out): generated boards are solvable within budget, the
// GF(2) solver is optimal, and the component wins and loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import LamplighterGame, { CONFIGS, CONFIG_IDS, generate, solveOptimal, press, isSolved, tierFor, type Board, type Pattern } from '@/components/minigames/LamplighterGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]

/** Brute force over all press subsets (small boards only). */
function bruteOptimal(board: Board, pattern: Pattern): number {
  const cells = board.holes.map((h, i) => (h ? -1 : i)).filter(i => i >= 0)
  let best = Infinity
  for (let mask = 0; mask < 1 << cells.length; mask++) {
    let b = board, w = 0
    cells.forEach((c, k) => { if (mask & (1 << k)) { b = press(b, pattern, c); w++ } })
    if (isSolved(b)) best = Math.min(best, w)
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

  it('the GF(2) optimum matches brute force on 3×3 and 4×4 boards', () => {
    for (const pattern of ['plus', 'cross', 'king'] as Pattern[]) for (let seed = 1; seed <= 6; seed++) {
      for (const d of [1, 2] as Difficulty[]) {
        const p = generate({ pattern, broken: d === 2 ? 0.14 : 0 }, d, seed)
        expect(solveOptimal(p.board, pattern)!.length, `${pattern} d${d} s${seed}`).toBe(bruteOptimal(p.board, pattern))
      }
    }
  })

  it('reports unsolvable boards', () => {
    // On a 4×4 plus board some single-lamp states are unreachable.
    const holes = Array(16).fill(false)
    const lit = Array(16).fill(true); lit[0] = false
    expect(solveOptimal({ n: 4, holes, lit }, 'plus')).toBeNull()
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
})
