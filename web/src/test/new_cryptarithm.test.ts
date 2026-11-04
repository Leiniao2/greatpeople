// Merchant Sums (cryptarithms): every bank entry has exactly one solution,
// puzzles fit the size budget per difficulty, and the component wins/loses once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import CryptarithmGame, {
  CONFIGS, CONFIG_IDS, generate, countSolutions, parseEquation, lettersOf, isSolution, columnStatus, conflicts,
  tierFor, bankFor, type Kind, type Puzzle,
} from '@/components/minigames/CryptarithmGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = Array.from({ length: 16 }, (_, i) => i * 97 + 5)
const KINDS: Kind[] = ['add', 'sub', 'mul', 'add3']

/** Letters the player must find. */
const unknowns = (p: Puzzle) => p.letters.length - p.revealed.length

describe('cryptarithm logic', () => {
  it('solves SEND + MORE = MONEY uniquely', () => {
    const eq = parseEquation('SEND+MORE=MONEY')
    const r = countSolutions(eq)
    expect(r.count).toBe(1)
    expect(r.first).toMatchObject({ S: 9, E: 5, N: 6, D: 7, M: 1, O: 0, R: 8, Y: 2 })
    expect(isSolution(eq, r.first!)).toBe(true)
  })

  it('every bank entry has exactly one solution', () => {
    const seen = new Set<string>()
    for (const k of KINDS) for (const d of DIFFS) for (const s of bankFor(k, d)) {
      if (seen.has(s)) continue
      seen.add(s)
      const eq = parseEquation(s)
      expect(lettersOf(eq).length, s).toBeLessThanOrEqual(10)
      expect(countSolutions(eq, 2).count, s).toBe(1)
    }
    expect(seen.size).toBeGreaterThan(40)
  })

  it('every config × difficulty × seed is a valid puzzle within budget, with variety', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const variety = new Set<string>()
      for (const seed of SEEDS) {
        const p = generate(CONFIGS[id], d, seed)
        expect(isSolution(p.eq, p.solution), `${id} d${d} s${seed}`).toBe(true)
        // Unique even with nothing revealed, so unique with the reveals.
        const given = Object.fromEntries(p.revealed.map(c => [c, p.solution[c]]))
        expect(countSolutions(p.eq, 2, given).count).toBe(1)
        expect(unknowns(p)).toBe(Math.min(tierFor(d).unknowns, p.letters.length))
        expect(unknowns(p)).toBeGreaterThanOrEqual(3)
        expect(p.letters.length).toBeLessThanOrEqual(10)
        expect(Math.max(...p.rows.map(r => r.length))).toBeLessThanOrEqual(d <= 2 ? 5 : 7)
        variety.add(p.rows.join(' ') + '|' + p.revealed.join(''))
      }
      expect(variety.size, `${id} d${d} variety`).toBeGreaterThanOrEqual(8)
      const puzzles = new Set(SEEDS.map(s => generate(CONFIGS[id], d, s).rows.join(' ')))
      expect(puzzles.size, `${id} d${d} distinct sums`).toBeGreaterThanOrEqual(4)
    }
  })

  it('later difficulties use larger sums', () => {
    for (const id of CONFIG_IDS) {
      const avg = (d: Difficulty) => SEEDS.reduce((a, s) => a + generate(CONFIGS[id], d, s).letters.length * 10 + generate(CONFIGS[id], d, s).rows.join('').length, 0)
      expect(avg(4), id).toBeGreaterThan(avg(1))
    }
  })

  it('flags conflicts and bad columns', () => {
    const eq = parseEquation('SEND+MORE=MONEY')
    expect([...conflicts(eq, { S: 3, M: 3 })].sort()).toEqual(['M', 'S'])
    expect([...conflicts(eq, { M: 0 })]).toEqual(['M'])
    expect(columnStatus(eq, { D: 7, E: 5, Y: 2 })[0]).toBe('ok')
    expect(columnStatus(eq, { D: 7, E: 5, Y: 3 })[0]).toBe('bad')
    expect(columnStatus(eq, { D: 7, E: 5 })[0]).toBe('open')
  })
})

describe('cryptarithm component', () => {
  const props = (id: string, d: Difficulty, seed: number, onWin = () => {}, onLose = () => {}) =>
    ({ configId: id, difficulty: d, seed, onWin, onLose })

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(CryptarithmGame, props(id, d, 3)))
      const p = generate(CONFIGS[id], d, 3)
      expect(container.querySelectorAll('[data-letter]').length).toBe(p.letters.length)
      expect(container.querySelectorAll('[data-digit]').length).toBe(11)
      unmount()
    }
  })

  it('accepts title/intro overrides', () => {
    const { getByText } = render(createElement(CryptarithmGame, { ...props('addition', 1, 1), params: { title: 'Custom Title', intro: 'Custom intro' } }))
    expect(getByText('Custom Title')).toBeTruthy()
    expect(getByText('Custom intro')).toBeTruthy()
  })

  it('entering the solution and sealing wins once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(CryptarithmGame, props(id, d, 11, onWin, onLose)))
      const p = generate(CONFIGS[id], d, 11)
      for (const c of p.letters) {
        if (p.revealed.includes(c)) continue
        fireEvent.click(container.querySelector(`[data-letter="${c}"]`)!)
        fireEvent.click(container.querySelector(`[data-digit="${p.solution[c]}"]`)!)
      }
      fireEvent.click(container.querySelector('[data-testid="seal"]')!)
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('sealing a wrong ledger until the cap loses once', () => {
    vi.useFakeTimers()
    for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(CryptarithmGame, props('subtraction', d, 4, onWin, onLose)))
      const p = generate(CONFIGS.subtraction, d, 4)
      // Every open letter gets the same digit: a conflict, so never a solution.
      const free = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].find(x => !p.revealed.some(c => p.solution[c] === x) && x !== 0)!
      for (const c of p.letters) {
        if (p.revealed.includes(c)) continue
        fireEvent.click(container.querySelector(`[data-letter="${c}"]`)!)
        fireEvent.click(container.querySelector(`[data-digit="${free}"]`)!)
      }
      const seal = container.querySelector('[data-testid="seal"]')!
      for (let k = 0; k < tierFor(d).mistakes + 2; k++) fireEvent.click(seal)
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('keyboard digits assign to the selected letter', () => {
    const { container } = render(createElement(CryptarithmGame, props('addition', 2, 9)))
    const p = generate(CONFIGS.addition, 2, 9)
    const c = p.letters.find(x => !p.revealed.includes(x))!
    fireEvent.click(container.querySelector(`[data-letter="${c}"]`)!)
    fireEvent.keyDown(window, { key: '7' })
    expect(container.querySelector(`[data-letter="${c}"]`)!.textContent).toContain('7')
  })
})
