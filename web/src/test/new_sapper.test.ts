// Sapper (no-guess Minesweeper): every field is logic-solvable from the first
// square, the first square is a clear opening, and the component wins and
// loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import SapperGame, { CONFIGS, CONFIG_IDS, generate, solveLogically, makeField, countsFor, tierFor } from '@/components/minigames/SapperGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]

describe('sapper logic', () => {
  it('every config × difficulty × seed × start is clear around the start and solvable without guessing', () => {
    let worst = 0
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { n, density } = tierFor(d)
      const boards = new Set<string>()
      for (let seed = 1; seed <= 10; seed++) {
        const field = makeField(n, CONFIGS[id].shape)
        const starts = field.inside.map((ok, i) => (ok ? i : -1)).filter(i => i >= 0)
        const start = starts[(seed * 53) % starts.length]
        const t0 = performance.now()
        const L = generate(CONFIGS[id].shape, d, seed, start)
        worst = Math.max(worst, performance.now() - t0)
        expect(L.mines.filter(Boolean).length).toBe(L.mineCount)
        const inside = field.inside.filter(Boolean).length
        expect(L.mineCount, `${id} d${d} density`).toBeGreaterThanOrEqual(Math.round(inside * density) - 2)
        expect(L.mines.some((m, i) => m && !field.inside[i])).toBe(false)
        expect(L.mines[start] || field.nbrs[start].some(k => L.mines[k])).toBe(false)
        expect(L.counts[start]).toBe(0)
        expect(solveLogically(field, L.mines, start), `${id} d${d} s${seed}`).toBe(true)
        boards.add(L.mines.map(Number).join(''))
      }
      expect(boards.size).toBe(10)
    }
    expect(worst, 'slowest generation (ms)').toBeLessThan(1000)
  })

  it('is deterministic in seed and start', () => {
    expect(generate('square', 3, 5, 40).mines).toEqual(generate('square', 3, 5, 40).mines)
    expect(generate('square', 3, 5, 40).mines).not.toEqual(generate('square', 3, 6, 40).mines)
  })

  it('the solver is selective: it refuses guess-only fields and a classic 50/50', () => {
    // 4×4 field: rows 0–1 open, row 2 a solid wall of mines, row 3 hidden
    // behind it. One mine in row 3 could be in any of its squares.
    const field = makeField(4, 'square')
    const m = Array(16).fill(false)
    for (const i of [8, 9, 10, 11]) m[i] = true // a solid wall of mines across row 2
    m[15] = true                                 // and one mine behind it
    // Behind the wall nothing can be seen: the solver must give up.
    expect(solveLogically(field, m, 0)).toBe(false)
    // With the mine count spent (no mine behind the wall) the global rule clears it.
    const m2 = [...m]; m2[15] = false
    expect(solveLogically(field, m2, 0)).toBe(true)
    // Dense random fields: logic alone clears only some of them.
    let ok = 0, tries = 0
    const f8 = makeField(8, 'square')
    for (let s = 1; s <= 60; s++) {
      const mines = Array.from({ length: 64 }, (_, i) => i > 9 && ((s * 7919 + i * 104729) % 97) < 22)
      if (mines[0] || f8.nbrs[0].some(k => mines[k])) continue
      tries++
      if (solveLogically(f8, mines, 0)) ok++
    }
    expect(tries).toBeGreaterThan(20)
    expect(ok).toBeLessThan(tries)
    expect(countsFor(field, m)[5]).toBe(3)
  })
})

describe('sapper component', () => {
  const sq = (c: HTMLElement, i: number) => c.querySelector<HTMLButtonElement>(`[data-cell="${i}"]`)!

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(SapperGame, { configId: id, difficulty: d, seed: 1, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelectorAll('[data-cell]').length).toBe(tierFor(d).n ** 2)
      unmount()
    }
  })

  it('opening every safe square wins once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(SapperGame, { configId: id, difficulty: d, seed: 8, onWin, onLose }))
      const field = makeField(tierFor(d).n, CONFIGS[id].shape)
      const start = field.inside.lastIndexOf(true) - 1
      fireEvent.click(sq(container, start))
      const L = generate(CONFIGS[id].shape, d, 8, start)
      L.mines.forEach((m, i) => {
        if (m || !field.inside[i]) return
        if (sq(container, i).getAttribute('data-state') === '0') fireEvent.click(sq(container, i))
      })
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('digging a mine loses once; flags protect squares', () => {
    vi.useFakeTimers()
    for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, getByRole, unmount } = render(createElement(SapperGame, { configId: 'namur-1692', difficulty: d, seed: 3, onWin, onLose }))
      fireEvent.click(sq(container, 0))
      const L = generate('square', d, 3, 0)
      const mines = L.mines.map((m, i) => (m ? i : -1)).filter(i => i >= 0)
      // Flag the first mine in flag mode: digging it then does nothing.
      fireEvent.click(getByRole('button', { name: /Flag/ }))
      fireEvent.click(sq(container, mines[0]))
      expect(sq(container, mines[0]).getAttribute('data-state')).toBe('2')
      fireEvent.click(getByRole('button', { name: /Dig/ }))
      fireEvent.click(sq(container, mines[0]))
      expect(onLose).not.toHaveBeenCalled()
      fireEvent.click(sq(container, mines[1]))
      fireEvent.click(sq(container, mines[2]))
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('long-press flags instead of digging', () => {
    vi.useFakeTimers()
    const { container } = render(createElement(SapperGame, { configId: 'maastricht-1673', difficulty: 1, seed: 2, onWin: () => {}, onLose: () => {} }))
    fireEvent.pointerDown(sq(container, 10))
    act(() => { vi.advanceTimersByTime(500) })
    fireEvent.click(sq(container, 10))
    expect(sq(container, 10).getAttribute('data-state')).toBe('2')
  })
})
