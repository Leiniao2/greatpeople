// Picture Logic (nonogram): every picture is uniquely line-solvable, every
// config × difficulty × seed yields one, and the component wins and loses once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import NonogramGame, {
  CONFIG_IDS, PICTURES, generate, toBitmap, cluesOf, cluesFor, solveLine, lineSolve, isUniquelyLineSolvable, tierFor,
} from '@/components/minigames/NonogramGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]

describe('nonogram logic', () => {
  it('has at least 16 square pictures, each uniquely solvable by line logic alone', () => {
    expect(PICTURES.length).toBeGreaterThanOrEqual(16)
    for (const p of PICTURES) {
      expect(p.rows.every(r => r.length === p.rows.length), p.name).toBe(true)
      expect(isUniquelyLineSolvable(toBitmap(p)), p.name).toBe(true)
    }
    for (const d of DIFFS) expect(PICTURES.filter(p => p.rows.length === tierFor(d).size).length, `d${d}`).toBeGreaterThanOrEqual(5)
  })

  it('every config × difficulty × seed gives a valid, uniquely solvable puzzle quickly', () => {
    let worst = 0
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const seen = new Set<string>()
      for (let seed = 1; seed <= 12; seed++) {
        const t0 = performance.now()
        const p = generate(id, d, seed)
        expect(p.bitmap.length).toBe(tierFor(d).size)
        const g = lineSolve(p.rowClues, p.colClues)!
        worst = Math.max(worst, performance.now() - t0)
        expect(g.map(r => r.map(v => v === 1))).toEqual(p.bitmap)
        expect(cluesFor(p.bitmap)).toEqual({ rowClues: p.rowClues, colClues: p.colClues })
        seen.add(JSON.stringify(p.bitmap))
      }
      expect(seen.size, `${id} d${d} variety`).toBeGreaterThanOrEqual(4)
    }
    expect(worst).toBeLessThan(200)
  })

  it('line solver basics: overlap, contradictions and ambiguity', () => {
    expect(cluesOf([1, 1, 0, 1, 0, 0, 1, 1, 1])).toEqual([2, 1, 3])
    expect(cluesOf([0, 0])).toEqual([])
    expect(solveLine([4], [-1, -1, -1, -1, -1])).toEqual([-1, 1, 1, 1, -1])
    expect(solveLine([2, 2], [-1, -1, -1, -1, -1])).toEqual([1, 1, 0, 1, 1])
    expect(solveLine([3], [-1, 0, -1, -1, -1])).toEqual([0, 0, 1, 1, 1])
    expect(solveLine([3], [1, 0, -1, -1, -1])).toBeNull()
    // Two diagonal cells: the clues allow both diagonals.
    expect(isUniquelyLineSolvable([[true, false], [false, true]])).toBe(false)
  })
})

describe('nonogram component', () => {
  const cell = (c: HTMLElement, i: number) => c.querySelector<HTMLElement>(`[data-cell="${i}"]`)!

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(NonogramGame, { configId: id, difficulty: d, seed: 1, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelectorAll('[data-cell]').length).toBe(tierFor(d).size ** 2)
      unmount()
    }
  })

  it('painting the picture wins once (rows dragged in one stroke)', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(NonogramGame, { configId: id, difficulty: d, seed: 7, onWin, onLose }))
      const { bitmap } = generate(id, d, 7)
      const n = bitmap.length
      bitmap.forEach((row, r) => {
        // Drag across each run; single cells are tapped.
        let c = 0
        while (c < n) {
          if (!row[c]) { c++; continue }
          let e = c
          while (e + 1 < n && row[e + 1]) e++
          fireEvent.pointerDown(cell(container, r * n + c))
          for (let k = c + 1; k <= e; k++) fireEvent.pointerMove(cell(container, r * n + k))
          fireEvent.pointerUp(window)
          c = e + 1
        }
      })
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      expect(container.querySelectorAll('[data-mark="1"]').length).toBe(bitmap.flat().filter(Boolean).length)
      unmount()
    }
  })

  it('filling empty squares loses once at the mistake cap', () => {
    vi.useFakeTimers()
    for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(NonogramGame, { configId: 'louvre', difficulty: d, seed: 2, onWin, onLose }))
      const flat = generate('louvre', d, 2).bitmap.flat()
      const empties = flat.map((v, i) => (v ? -1 : i)).filter(i => i >= 0)
      for (const i of empties.slice(0, tierFor(d).maxMistakes + 2)) fireEvent.pointerDown(cell(container, i))
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('cross mode marks without penalty', () => {
    const onLose = vi.fn()
    const { container, getByRole } = render(createElement(NonogramGame, { configId: 'ashmolean', difficulty: 2, seed: 3, onWin: () => {}, onLose }))
    fireEvent.click(getByRole('button', { name: /Cross/ }))
    for (let i = 0; i < 20; i++) fireEvent.pointerDown(cell(container, i))
    expect(container.querySelectorAll('[data-mark="2"]').length).toBe(20)
    expect(container.querySelector('[data-testid="ng-mistakes"]')!.textContent).toContain('0')
  })
})
