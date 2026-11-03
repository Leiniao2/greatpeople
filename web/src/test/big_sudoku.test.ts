// Sudoku: generator uniqueness and speed at every tier, the diagonal variant,
// and the component's notes, hints, mistakes and win flow.
import { createElement } from 'react'
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import SudokuGame, { generate, countSolutions, tierFor, unitsOf, completedUnits, BOARDS } from '@/components/minigames/SudokuGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]

describe('sudoku generator', () => {
  for (const d of DIFFS) {
    it(`d${d}: 30 seeds are unique, valid, fairly blank and fast`, () => {
      const { board, blankShare } = tierFor(d)
      let worst = 0
      for (let seed = 1; seed <= 30; seed++) {
        const t0 = performance.now()
        const { puzzle, solution } = generate(d, seed)
        worst = Math.max(worst, performance.now() - t0)
        expect(countSolutions(board, puzzle), `d${d} seed ${seed}`).toBe(1)
        for (const unit of unitsOf(board)) expect(new Set(unit.map(([r, c]) => solution[r][c])).size).toBe(board.n)
        puzzle.forEach((row, r) => row.forEach((v, c) => { if (v) expect(v).toBe(solution[r][c]) }))
        const blanks = puzzle.flat().filter(v => !v).length
        expect(blanks, `d${d} seed ${seed} blanks`).toBeGreaterThanOrEqual(Math.floor(board.n * board.n * blankShare) - 4)
      }
      expect(worst, `d${d} slowest generation (ms)`).toBeLessThan(1500)
    })
  }

  it('sizes and variants per tier: 6×6, then 9×9, then diagonal 9×9', () => {
    expect(DIFFS.map(d => tierFor(d).board.n)).toEqual([6, 9, 9, 9])
    expect(DIFFS.map(d => !!tierFor(d).board.diagonal)).toEqual([false, false, false, true])
    expect(DIFFS.map(d => tierFor(d).maxMistakes)).toEqual([3, 3, 3, 2])
  })

  it('the diagonal puzzle really needs its diagonals: as a plain sudoku it is ambiguous for most seeds', () => {
    let ambiguous = 0
    for (let seed = 1; seed <= 10; seed++) {
      const { puzzle } = generate(4, seed)
      if (countSolutions(BOARDS.nine, puzzle) > 1) ambiguous++
    }
    expect(ambiguous).toBeGreaterThan(5)
  })

  it('countSolutions sees an empty board as ambiguous and a broken one as unsolvable', () => {
    const empty = Array.from({ length: 9 }, () => Array(9).fill(0))
    expect(countSolutions(BOARDS.diagonal, empty)).toBe(2)
    const bad = empty.map(r => [...r]); bad[0][0] = 5; bad[1][1] = 5
    expect(countSolutions(BOARDS.nine, bad)).toBe(0)
  })

  it('completedUnits reports the row, column, box (and diagonal) a final correct entry finishes', () => {
    const { solution } = generate(4, 3)
    const grid = solution.map(r => [...r])
    expect(completedUnits(BOARDS.diagonal, grid, solution, 4, 4).length).toBe(9 * 5) // row, col, box, both diagonals
    grid[0][8] = 0
    expect(completedUnits(BOARDS.diagonal, grid, solution, 4, 4).length).toBe(9 * 5 - 9) // anti-diagonal not done
  })

  it('changes the board when the seed changes', () => {
    for (const d of DIFFS) expect(generate(d, 1).puzzle).not.toEqual(generate(d, 2).puzzle)
  })
})

describe('sudoku component', () => {
  const cell = (container: HTMLElement, i: number) => container.querySelector<HTMLButtonElement>(`[data-cell="${i}"]`)!
  const pad = (v: number) => screen.getAllByRole('button').find(b => /^(enter|note) /.test(b.getAttribute('aria-label') ?? '') && b.getAttribute('aria-label')!.endsWith(` ${v}`))!

  it('filling every blank correctly wins exactly once, at every tier', () => {
    vi.useFakeTimers()
    for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container } = render(createElement(SudokuGame, { configId: 'euclid-grid', difficulty: d, seed: 5, onWin, onLose }))
      const { puzzle, solution, board } = generate(d, 5)
      for (let i = 0; i < board.n * board.n; i++) {
        const r = Math.floor(i / board.n), c = i % board.n
        if (puzzle[r][c]) continue
        fireEvent.click(cell(container, i))
        fireEvent.click(pad(solution[r][c]))
      }
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin, `d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('wrong entries count as mistakes and the cap loses exactly once', () => {
    vi.useFakeTimers()
    const d = 4 as Difficulty
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(SudokuGame, { configId: 'mendel-grid', difficulty: d, seed: 9, onWin, onLose }))
    const { puzzle, solution, board } = generate(d, 9)
    const blanks = Array.from({ length: board.n * board.n }, (_, i) => i).filter(i => !puzzle[Math.floor(i / board.n)][i % board.n])
    for (const i of blanks.slice(0, tierFor(d).maxMistakes)) {
      const want = solution[Math.floor(i / board.n)][i % board.n]
      fireEvent.click(cell(container, i))
      fireEvent.click(pad(want === 1 ? 2 : 1))
    }
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('notes mode pencils marks instead of answering; a hint fills a cell and costs a mistake', () => {
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(SudokuGame, { configId: 'lorentz-grid', difficulty: 2, seed: 4, onWin, onLose }))
    const { puzzle, solution, board } = generate(2, 4)
    const i = puzzle.flat().findIndex(v => !v)
    const r = Math.floor(i / board.n), c = i % board.n
    fireEvent.click(cell(container, i))
    fireEvent.click(screen.getByRole('button', { name: /notes/i }))
    const wrongs = [1, 2, 3].filter(v => v !== solution[r][c]).slice(0, 2)
    wrongs.forEach(v => fireEvent.click(pad(v)))
    expect(cell(container, i).textContent).toContain(String(wrongs[0]))
    expect(screen.getByTestId('sdk-mistakes').textContent).toContain('0 /')
    fireEvent.click(screen.getByRole('button', { name: /notes/i }))
    fireEvent.click(screen.getByRole('button', { name: /hint/i }))
    expect(cell(container, i).textContent).toBe(String(solution[r][c]))
    expect(screen.getByTestId('sdk-mistakes').textContent).toContain('1 /')
    fireEvent.click(screen.getByRole('button', { name: /hint/i }))
    expect(screen.getByTestId('sdk-mistakes').textContent).toContain('2 /')
    // One more hint would hit the cap of 3, so it is no longer offered.
    expect(screen.getByRole('button', { name: /hint/i })).toBeDisabled()
    expect(onLose).not.toHaveBeenCalled()
  })
})
