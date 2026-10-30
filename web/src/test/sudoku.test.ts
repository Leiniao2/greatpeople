import { describe, it, expect } from 'vitest'
import { generate, countSolutions } from '@/components/minigames/SudokuGame'
import type { Difficulty } from '@/games/types'

describe('sudoku generator', () => {
  it('is deterministic for a seed and unique for every tier', () => {
    for (const d of [1, 2, 3, 4] as Difficulty[]) {
      const t0 = Date.now()
      const a = generate(d, 7)
      const b = generate(d, 7)
      expect(a.puzzle).toEqual(b.puzzle)
      expect(countSolutions(a.board, a.puzzle.map(r => [...r]))).toBe(1)
      // The puzzle must be the solution with blanks, and have a fair number of them.
      a.puzzle.forEach((row, r) => row.forEach((v, c) => { if (v) expect(v).toBe(a.solution[r][c]) }))
      const blanks = a.puzzle.flat().filter(v => v === 0).length
      expect(blanks).toBeGreaterThan(a.board.n * a.board.n * 0.3)
      expect(Date.now() - t0, `difficulty ${d} took too long`).toBeLessThan(3000)
    }
  })

  it('changes the board when the seed changes', () => {
    expect(generate(2, 1).puzzle).not.toEqual(generate(2, 2).puzzle)
  })
})
