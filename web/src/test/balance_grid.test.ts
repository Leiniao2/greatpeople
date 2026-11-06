// Difficulty balance for the grid puzzles: every tier is winnable, fits the
// time budget and is harder than the one below.  Pins the numbers chosen in
// the rebalance (see each component's header comment for the reasoning).
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Difficulty } from '@/games/types'
import { generate as genSudoku, unitsOf, tierFor as sudokuTier, type Board } from '@/components/minigames/SudokuGame'
import { CONFIG_IDS as SL_IDS, CONFIGS as SL, scrambleFor, optimalMoves, TIERS as SL_TIERS } from '@/components/minigames/SlidingPuzzle'
import { CONFIG_IDS as KL_IDS, CONFIGS as KL, startFor, solvePath, DEPTHS, timeLimitFor as klotskiTime } from '@/components/minigames/KlotskiGame'
import { CONFIG_IDS as ICE_IDS, yardFor, analyse, TIERS as ICE_TIERS } from '@/components/minigames/IceSlideGame'
import JigsawGame, { tierFor as jigsawTier } from '@/components/minigames/JigsawGame'
import WordleGame, { CONFIGS as WORDS, tierFor as wordleTier } from '@/components/minigames/WordleGame'
import KnightsTourGame, { CONFIGS as KT, CONFIG_IDS as KT_IDS, makeTour, nextMoves, findTour, rescueLength, undosFor, hintsFor } from '@/components/minigames/KnightsTourGame'
import { capFor as hanoiCap } from '@/components/minigames/HanoiGame'
import { capFor as sokobanCap } from '@/components/minigames/SokobanGame'
import { tierFor as sapperTier } from '@/components/minigames/SapperGame'
import { tierFor as lampTier } from '@/components/minigames/LamplighterGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
afterEach(() => { cleanup(); vi.useRealTimers() })

/** Naked and hidden singles only: what a casual sudoku player does. */
function solvesBySingles(b: Board, puzzle: number[][]): boolean {
  const g = puzzle.map(r => [...r]), n = b.n, units = unitsOf(b)
  const unitsAt = (r: number, c: number) => units.filter(u => u.some(([a, d]) => a === r && d === c))
  for (let changed = true; changed;) {
    changed = false
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!g[r][c]) {
      const used = new Set<number>()
      for (const u of unitsAt(r, c)) for (const [a, d] of u) if (g[a][d]) used.add(g[a][d])
      if (used.size === n - 1) { for (let v = 1; v <= n; v++) if (!used.has(v)) g[r][c] = v; changed = true }
    }
    for (const u of units) for (let v = 1; v <= n; v++) {
      if (u.some(([a, d]) => g[a][d] === v)) continue
      const spots = u.filter(([a, d]) => !g[a][d] && unitsAt(a, d).every(w => !w.some(([x, y]) => g[x][y] === v)))
      if (spots.length === 1) { g[spots[0][0]][spots[0][1]] = v; changed = true }
    }
  }
  return g.every(r => r.every(Boolean))
}

describe('sudoku balance', () => {
  it('every tier is solvable by singles alone, with 3 mistakes and ~15–43 cells to fill', () => {
    const maxBlanks = [16, 22, 34, 43]
    let prev = 0
    for (const d of DIFFS) {
      expect(sudokuTier(d).maxMistakes).toBe(3)
      let total = 0
      for (let seed = 1; seed <= 12; seed++) {
        const { board, puzzle } = genSudoku(d, seed)
        const blanks = puzzle.flat().filter(v => !v).length
        expect(blanks, `d${d} s${seed}`).toBeLessThanOrEqual(maxBlanks[d - 1])
        expect(solvesBySingles(board, puzzle), `d${d} s${seed}`).toBe(true)
        total += blanks
      }
      expect(total, `d${d} has more to fill than d${d - 1}`).toBeGreaterThan(prev)
      prev = total
    }
  })
})

describe('sliding tiles balance', () => {
  it('the scramble distance sets the tier, and authored scrambles are kept where they fit', () => {
    for (const id of SL_IDS) for (const d of DIFFS) for (let seed = 1; seed <= 6; seed++) {
      const b = scrambleFor(id, d, seed)
      const opt = optimalMoves(b)
      expect(opt, `${id} d${d} s${seed}`).toBeGreaterThanOrEqual(SL_TIERS[d - 1].lo)
      expect(opt, `${id} d${d} s${seed}`).toBeLessThanOrEqual(SL_TIERS[d - 1].hi)
    }
    expect(scrambleFor('renaissance', 4, 1)).toEqual(SL.renaissance.initial)
    expect(scrambleFor('clay-type-forme', 1, 1)).toEqual(SL['clay-type-forme'].initial)
    expect(scrambleFor('gombe-forest', 2, 1)).not.toEqual(scrambleFor('gombe-forest', 2, 2))
    // About 3× optimal slides at ~1 s each, plus thinking: clocks ≥ 1.5× that.
    expect(SL_TIERS.map(t => t.seconds)).toEqual([0, 0, 150, 180])
  })
})

describe('klotski balance', () => {
  it('easier tiers start part-way along a shortest solution', () => {
    for (const id of KL_IDS) {
      const full = solvePath(KL[id])!.length - 1
      for (const d of DIFFS) {
        const opt = solvePath({ ...KL[id], pieces: startFor(id, d) })!.length - 1
        expect(opt, `${id} d${d}`).toBe(Math.min(full, DEPTHS[d - 1]))
      }
    }
    expect(DIFFS.map(klotskiTime).every(s => s <= 180)).toBe(true)
  })
})

describe('ice slide balance', () => {
  it('every yard is the tier’s size, trap-free, branching, and needs the tier’s number of slides', () => {
    for (const id of ICE_IDS) for (const d of DIFFS) for (let seed = 1; seed <= 3; seed++) {
      const tier = ICE_TIERS[d]
      const yard = yardFor(id, d, seed)
      const tag = `${id} d${d} s${seed}`
      expect(yard.length, tag).toBe(tier.rows)
      expect(yard.every(line => line.length === tier.cols), tag).toBe(true)
      const holes = yard.join('').split('O').length - 1
      expect(holes, tag).toBe(tier.holes)
      const a = analyse(yard)
      expect(a.trapFree, tag).toBe(true)
      expect(a.optimal, tag).toBeGreaterThanOrEqual(tier.slides[0])
      expect(a.optimal, tag).toBeLessThanOrEqual(tier.slides[1])
      expect(a.stops, tag).toBeGreaterThanOrEqual(tier.minBranching * a.optimal)
    }
    // Bigger yards and longer routes as the tiers rise; the clock only from D3.
    expect(DIFFS.map(d => ICE_TIERS[d].rows * ICE_TIERS[d].cols)).toEqual([144, 196, 225, 323])
    expect(DIFFS.map(d => ICE_TIERS[d].slides[0])).toEqual([7, 10, 13, 16])
    expect(DIFFS.map(d => ICE_TIERS[d].seconds > 0)).toEqual([false, false, true, true])
  })
})

describe('jigsaw balance', () => {
  it('the picture on the board fades out as the tiers rise, and the board renders at every tier', () => {
    expect(DIFFS.map(d => jigsawTier(d).ghost > 0)).toEqual([true, true, false, false])
    for (const d of DIFFS) {
      const { getByTestId, unmount } = render(createElement(JigsawGame, { configId: 'venetian-master', difficulty: d, seed: 1, onWin: () => {}, onLose: () => {} }))
      const t = jigsawTier(d)
      expect(getByTestId('jigsaw-count').textContent).toBe(`0/${t.cols * t.rows} placed`)
      unmount()
    }
  })
})

describe('wordle balance', () => {
  it('the clue arrives later and guesses shrink with difficulty', () => {
    const t = DIFFS.map(wordleTier)
    expect(t.map(x => x.hintAfter)).toEqual([0, 1, 3, 4])
    expect(t.map(x => x.maxGuesses)).toEqual([6, 6, 6, 5])
    const cfg = WORDS.climb
    const { getByTestId, unmount } = render(createElement(WordleGame, { configId: 'climb', difficulty: 1, seed: 1, onWin: () => {}, onLose: () => {} }))
    expect(getByTestId('wordle-hint').textContent).toBe(cfg.hint)
    unmount()
    const r = render(createElement(WordleGame, { configId: 'climb', difficulty: 3, seed: 1, onWin: () => {}, onLose: () => {} }))
    expect(r.getByTestId('wordle-hint').textContent).not.toContain(cfg.hint)
    for (const word of ['STARE', 'POUND', 'GLYPH']) {
      for (const ch of word) fireEvent.keyDown(window, { key: ch })
      fireEvent.keyDown(window, { key: 'Enter' })
    }
    expect(r.getByTestId('wordle-hint').textContent).toBe(cfg.hint)
  })

  it('D4 is lost after five wrong guesses', () => {
    vi.useFakeTimers()
    const onLose = vi.fn()
    const { getByText } = render(createElement(WordleGame, { configId: 'climb', difficulty: 4, seed: 1, onWin: () => {}, onLose }))
    for (let k = 0; k < 5; k++) {
      for (const ch of 'STARE') fireEvent.keyDown(window, { key: ch })
      fireEvent.keyDown(window, { key: 'Enter' })
      act(() => { vi.advanceTimersByTime(1500) })
    }
    fireEvent.click(getByText(/Continue/))
    expect(onLose).toHaveBeenCalledTimes(1)
  })
})

describe("knight's tour balance", () => {
  it('more undos and hints than before, still shrinking with difficulty', () => {
    expect(DIFFS.map(undosFor)).toEqual([6, 5, 4, 3])
    expect(DIFFS.map(hintsFor)).toEqual([99, 2, 1, 1])
  })

  it('an undo from a dead end goes back to a square the tour can still be finished from', () => {
    for (const id of KT_IDS) for (const d of [3, 4] as Difficulty[]) {
      const { tour } = makeTour(id, KT[id], d, 2)
      // Anti-Warnsdorff play runs into a dead end quickly.
      const path = [tour.start]
      while (nextMoves(tour, path).length) {
        const moves = nextMoves(tour, path)
        path.push(moves.sort((a, b) => nextMoves(tour, [...path, b]).length - nextMoves(tour, [...path, a]).length)[0])
      }
      const k = rescueLength(tour, path)
      expect(k, `${id}@${d}`).toBeGreaterThanOrEqual(1)
      expect(k, `${id}@${d}`).toBeLessThan(path.length)
      expect(findTour(tour, path.slice(0, k), 60_000, 4), `${id}@${d}`).not.toBeNull()
    }
  })

  it('the component rewinds a dead end with one undo', () => {
    const id = 'euler', d: Difficulty = 4, seed = 5
    const { tour } = makeTour(id, KT[id], d, seed)
    const { container, getByTestId } = render(createElement(KnightsTourGame, { configId: id, difficulty: d, seed, onWin: () => {}, onLose: () => {} }))
    const path = [tour.start]
    while (nextMoves(tour, path).length) {
      const moves = nextMoves(tour, path)
      const j = moves.sort((a, b) => nextMoves(tour, [...path, b]).length - nextMoves(tour, [...path, a]).length)[0]
      path.push(j)
      fireEvent.click(container.querySelector<HTMLButtonElement>(`[data-sq="${j}"]`)!)
    }
    const keep = rescueLength(tour, path)
    fireEvent.click(getByTestId('undo'))
    expect(getByTestId('progress').textContent).toBe(`${keep} / ${tour.rows * tour.cols - tour.blocked.length}`)
    expect(getByTestId('undo').textContent).toContain(String(undosFor(d) - 1))
  })
})

describe('caps and budgets', () => {
  it('hanoi and sokoban caps loosen at D4 but still tighten with difficulty', () => {
    for (const opt of [15, 25, 31, 43]) {
      const caps = DIFFS.map(d => hanoiCap(d, opt) / opt)
      for (let k = 1; k < 4; k++) expect(caps[k]).toBeLessThan(caps[k - 1])
      expect(hanoiCap(4, opt)).toBeGreaterThanOrEqual(Math.ceil(opt * 1.25))
    }
    for (const par of [30, 40, 50, 60]) {
      const caps = DIFFS.map(d => sokobanCap(d, par) / par)
      for (let k = 1; k < 4; k++) expect(caps[k]).toBeLessThan(caps[k - 1])
      expect(sokobanCap(4, par)).toBeGreaterThanOrEqual(par * 1.5)
    }
  })

  it('sapper and lamplighter never lose on the first slip', () => {
    expect(DIFFS.map(d => sapperTier(d).maxBlasts)).toEqual([3, 3, 2, 2])
    expect(DIFFS.map(d => sapperTier(d).n)).toEqual([8, 9, 10, 11])
    // A wrong lamp costs two presses.
    for (const d of DIFFS) expect(lampTier(d).slack).toBeGreaterThanOrEqual(2)
  })
})
