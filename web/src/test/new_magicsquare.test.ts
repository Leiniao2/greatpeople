// Lo Shu (magic square): every config is its own rule set (classic, Dürer,
// pandiagonal, bordered); every generated puzzle completes uniquely under its
// rule, fits the time budget, needs at least one real deduction, and the
// component wins and loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import MagicSquareGame, {
  CONFIGS, CONFIG_IDS, generate, countSolutions, solve, isMagic, magicSum, tierFor, groupsFor, propagationStalls,
  MAX_BLANKS, DURER, CHAUTISA, type Rule,
} from '@/components/minigames/MagicSquareGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]

describe('magic square logic', () => {
  it('every config × difficulty × seed is a unique, valid puzzle under its rule, and fast to build', () => {
    let worst = 0
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const rule = CONFIGS[id].rule
      const boards = new Set<string>()
      for (const seed of SEEDS) {
        const t0 = performance.now()
        const p = generate(rule, d, seed)
        worst = Math.max(worst, performance.now() - t0)
        const tag = `${id} d${d} s${seed}`
        expect(isMagic(p.solution, rule), tag).toBe(true)
        expect(p.n).toBe(tierFor(rule, d).n)
        expect(countSolutions(p.puzzle, 2, rule), `${tag} unique`).toBe(1)
        expect(solve(p.puzzle, rule)).toEqual(p.solution)
        p.puzzle.forEach((row, r) => row.forEach((v, c) => { if (v) expect(v).toBe(p.solution[r][c]) }))
        boards.add(JSON.stringify(p.puzzle))
      }
      expect(boards.size, `${id} d${d} variety`).toBeGreaterThanOrEqual(6)
    }
    expect(worst, 'slowest generation (ms)').toBeLessThan(1000)
  })

  it('time budget: at most 5×5, blanks within MAX_BLANKS, growing with difficulty', () => {
    expect(MAX_BLANKS[0]).toBeLessThanOrEqual(9)
    expect(MAX_BLANKS[3]).toBeLessThanOrEqual(14)
    for (const id of CONFIG_IDS) {
      const rule = CONFIGS[id].rule
      const avg = DIFFS.map(d => {
        let total = 0
        for (const seed of SEEDS) {
          const p = generate(rule, d, seed)
          const blanks = p.puzzle.flat().filter(v => !v).length
          expect(p.n).toBeLessThanOrEqual(5)
          expect(blanks, `${id} d${d} s${seed} blanks`).toBeLessThanOrEqual(MAX_BLANKS[d - 1])
          expect(blanks, `${id} d${d} s${seed} blanks`).toBeGreaterThanOrEqual(6)
          total += blanks
        }
        return total / SEEDS.length
      })
      expect(avg[3], `${id} D4 harder than D1`).toBeGreaterThan(avg[0])
      expect(tierFor(rule, 4).maxMistakes).toBeLessThan(tierFor(rule, 1).maxMistakes)
    }
  })

  it('not pure arithmetic: D1 always needs a real deduction, and nearly every puzzle does', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const rule = CONFIGS[id].rule
      let thinking = 0
      for (const seed of SEEDS) {
        const p = generate(rule, d, seed)
        if (propagationStalls(p.puzzle, p.solution, rule) > 0) thinking++
      }
      if (d === 1) expect(thinking, `${id} d1`).toBe(SEEDS.length)
      else expect(thinking, `${id} d${d}`).toBeGreaterThanOrEqual(SEEDS.length - 2)
    }
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

describe('magic square variants', () => {
  const rules: Rule[] = ['classic', 'durer', 'pandiagonal', 'bordered']
  it('each config plays a different rule, explained in its intro', () => {
    expect(new Set(CONFIG_IDS.map(id => CONFIGS[id].rule))).toEqual(new Set(rules))
    expect(CONFIGS.durer.intro).toMatch(/quarters/)
    expect(CONFIGS['jaina-yantra'].intro).toMatch(/broken/)
    expect(CONFIGS['islamic-wafq'].intro).toMatch(/inner 3×3/)
  })

  it('Dürer: quarters, centre and corners must also make 34', () => {
    expect(groupsFor('durer', 4).length).toBe(10 + 6)
    expect(isMagic(DURER, 'durer')).toBe(true)
    // Plenty of ordinary 4×4 magic squares break the extra groups.
    const plain = SEEDS.map(seed => generate('classic', 2, seed).solution).filter(g => !isMagic(g, 'durer'))
    expect(plain.length).toBeGreaterThan(0)
    for (const g of plain) expect(isMagic(g, 'classic')).toBe(true)
    // Fewer completions than classic with the same givens.
    const sparse = DURER.map((r, i) => r.map(v => (i === 0 ? v : 0)))
    expect(countSolutions(sparse, 5000, 'durer')).toBeLessThan(countSolutions(sparse, 5000, 'classic'))
  })

  it('pandiagonal: the broken diagonals count too', () => {
    expect(groupsFor('pandiagonal', 4).length).toBe(10 + 6)
    expect(groupsFor('pandiagonal', 5).length).toBe(12 + 8)
    expect(isMagic(CHAUTISA, 'pandiagonal')).toBe(true)
    expect(isMagic(DURER, 'classic')).toBe(true)
    expect(isMagic(DURER, 'pandiagonal')).toBe(false) // broken diagonal 3+11+12+4 ≠ 34
    for (const seed of SEEDS) {
      const p = generate('pandiagonal', 3, seed)
      for (let k = 0; k < 5; k++) {
        expect(Array.from({ length: 5 }, (_, i) => p.solution[i][(i + k) % 5]).reduce((a, b) => a + b)).toBe(65)
        expect(Array.from({ length: 5 }, (_, i) => p.solution[i][(9 - i - k) % 5]).reduce((a, b) => a + b)).toBe(65)
      }
    }
  })

  it('bordered: the inner 3×3 is magic with sum 39', () => {
    expect(groupsFor('bordered', 5).filter(g => g.target === 39).length).toBe(8)
    for (const seed of SEEDS) {
      const p = generate('bordered', 2, seed)
      const core = [1, 2, 3].map(r => [1, 2, 3].map(c => p.solution[r][c]))
      for (let i = 0; i < 3; i++) {
        expect(core[i].reduce((a, b) => a + b)).toBe(39)
        expect(core.reduce((a, row) => a + row[i], 0)).toBe(39)
      }
      expect(core[0][0] + core[1][1] + core[2][2]).toBe(39)
    }
    // A plain 5×5 magic square (Siamese) is not bordered.
    const siamese = [[17, 24, 1, 8, 15], [23, 5, 7, 14, 16], [4, 6, 13, 20, 22], [10, 12, 19, 21, 3], [11, 18, 25, 2, 9]]
    expect(isMagic(siamese, 'classic')).toBe(true)
    expect(isMagic(siamese, 'bordered')).toBe(false)
  })
})

describe('magic square component', () => {
  const cell = (c: HTMLElement, i: number) => c.querySelector<HTMLButtonElement>(`[data-cell="${i}"]`)!
  const pad = (v: number) => screen.getByRole('button', { name: `enter ${v}` })

  it('renders every config at every difficulty, with extra-group chips for the twists', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const rule = CONFIGS[id].rule
      const { container, unmount } = render(createElement(MagicSquareGame, { configId: id, difficulty: d, seed: 2, onWin: () => {}, onLose: () => {} }))
      const n = tierFor(rule, d).n
      expect(container.querySelectorAll('[data-cell]').length).toBe(n ** 2)
      expect(container.querySelectorAll('[data-line]').length).toBe(groupsFor(rule, n).length)
      expect(!!container.querySelector('[data-testid="ms-extras"]')).toBe(rule !== 'classic')
      unmount()
    }
  })

  it('filling the solution wins once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(MagicSquareGame, { configId: id, difficulty: d, seed: 9, onWin, onLose }))
      const p = generate(CONFIGS[id].rule, d, 9)
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

  it('completing groups with wrong sums loses once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(MagicSquareGame, { configId: id, difficulty: d, seed: 3, onWin, onLose }))
      const p = generate(CONFIGS[id].rule, d, 3)
      // Fill every blank correctly but two, then keep placing those two swapped
      // (uniqueness guarantees the swap breaks some group) and erasing them.
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
      expect(onLose, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })
})
