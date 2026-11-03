// Lo Shu (magic square): every generated puzzle completes uniquely to a magic
// square, generation is fast, and the component wins and loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import MagicSquareGame, { CONFIGS, CONFIG_IDS, generate, countSolutions, solve, isMagic, magicSum, tierFor, DURER } from '@/components/minigames/MagicSquareGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]

describe('magic square logic', () => {
  it('every config × difficulty × seed is a unique, valid puzzle and fast to build', () => {
    let worst = 0
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const boards = new Set<string>()
      for (let seed = 1; seed <= 8; seed++) {
        const t0 = performance.now()
        const p = generate(CONFIGS[id].family, d, seed)
        worst = Math.max(worst, performance.now() - t0)
        expect(isMagic(p.solution), `${id} d${d} s${seed}`).toBe(true)
        expect(p.n).toBe(tierFor(d).n)
        expect(countSolutions(p.puzzle), `${id} d${d} s${seed} unique`).toBe(1)
        expect(solve(p.puzzle)).toEqual(p.solution)
        p.puzzle.forEach((row, r) => row.forEach((v, c) => { if (v) expect(v).toBe(p.solution[r][c]) }))
        const givens = p.puzzle.flat().filter(Boolean).length
        expect(givens, `${id} d${d} s${seed} givens`).toBeLessThanOrEqual(tierFor(d).givens + 2)
        boards.add(JSON.stringify(p.puzzle))
      }
      expect(boards.size, `${id} d${d} variety`).toBeGreaterThanOrEqual(6)
    }
    expect(worst, 'slowest generation (ms)').toBeLessThan(1000)
  })

  it('the solver counts the empty 3×3 as ambiguous, rejects broken squares and knows Dürer', () => {
    expect(countSolutions([[0, 0, 0], [0, 0, 0], [0, 0, 0]], 10)).toBe(8)
    expect(countSolutions([[1, 0, 0], [0, 0, 0], [0, 0, 0]])).toBe(0) // 1 can never sit in a 3×3 corner
    expect(isMagic(DURER)).toBe(true)
    expect(magicSum(4)).toBe(34)
    expect(magicSum(5)).toBe(65)
    const g = DURER.map(r => [...r]); g[0][0] = 0; g[3][3] = 0; g[1][2] = 0
    expect(solve(g)).toEqual(DURER)
  })
})

describe('magic square component', () => {
  const cell = (c: HTMLElement, i: number) => c.querySelector<HTMLButtonElement>(`[data-cell="${i}"]`)!
  const pad = (v: number) => screen.getByRole('button', { name: `enter ${v}` })

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(MagicSquareGame, { configId: id, difficulty: d, seed: 2, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelectorAll('[data-cell]').length).toBe(tierFor(d).n ** 2)
      unmount()
    }
  })

  it('filling the solution wins once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(MagicSquareGame, { configId: id, difficulty: d, seed: 9, onWin, onLose }))
      const p = generate(CONFIGS[id].family, d, 9)
      p.puzzle.forEach((row, r) => row.forEach((v, c) => {
        if (v) return
        fireEvent.click(cell(container, r * p.n + c))
        fireEvent.click(pad(p.solution[r][c]))
      }))
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('completing lines with wrong sums loses once', () => {
    vi.useFakeTimers()
    for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(MagicSquareGame, { configId: 'durer', difficulty: d, seed: 3, onWin, onLose }))
      const p = generate(CONFIGS.durer.family, d, 3)
      // Fill every blank correctly but two, then keep placing those two swapped
      // (uniqueness guarantees the swap breaks some line) and erasing them.
      const blanks: number[] = []
      p.puzzle.forEach((row, r) => row.forEach((v, c) => { if (!v) blanks.push(r * p.n + c) }))
      const sol = p.solution.flat()
      const a = blanks[0], b = blanks[blanks.length - 1]
      blanks.slice(1, -1).forEach(i => { fireEvent.click(cell(container, i)); fireEvent.click(pad(sol[i])) })
      const erase = () => screen.queryByRole('button', { name: /Erase/ })
      for (let k = 0; k < 10 && erase(); k++) {
        fireEvent.click(cell(container, b)); fireEvent.click(pad(sol[a]))
        if (!erase()) break
        fireEvent.click(cell(container, a)); fireEvent.click(pad(sol[b]))
        if (!erase()) break
        fireEvent.click(cell(container, a)); fireEvent.click(erase()!)
        fireEvent.click(cell(container, b)); fireEvent.click(erase()!)
      }
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose, `d${d}`).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })
})
