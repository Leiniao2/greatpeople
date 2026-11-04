// Picture Logic (nonogram): every picture is uniquely line-solvable, every
// config × difficulty × seed yields one (with its twisted clues), the time
// budget holds, each twist rule really changes the clues, and the component
// wins and loses once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import NonogramGame, {
  CONFIGS, CONFIG_IDS, PICTURES, generate, toBitmap, cluesOf, cluesFor, solveLine, solveClue, shownClue, lineSolve,
  isUniquelyLineSolvable, tierFor, type Twist,
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

  it('time budget: ~1 min at D1 up to ~3 min at D4 (cells to decide, mistakes allowed)', () => {
    // An engaged solver settles roughly one cell every 1–2 s.
    // 10×10 ran past three minutes for a first-time solver: D4 is an 8×8
    // with twice the twisted lines of D3.
    const maxCells = [25, 49, 64, 64]
    for (const d of DIFFS) {
      const t = tierFor(d)
      expect(t.size ** 2, `d${d} cells`).toBeLessThanOrEqual(maxCells[d - 1])
      expect(t.maxMistakes).toBeGreaterThanOrEqual(d === 4 ? 2 : 3)
      expect(t.twists).toBeLessThanOrEqual(t.size)
      if (d > 1) {
        const prev = tierFor((d - 1) as Difficulty)
        expect(t.size).toBeGreaterThanOrEqual(prev.size)
        expect(t.size > prev.size || (t.minTwists > prev.minTwists && t.maxMistakes < prev.maxMistakes), `d${d} harder than d${d - 1}`).toBe(true)
      }
    }
    // D1 is still a real puzzle: a 5×5 that one sweep of the line solver does not finish.
    for (let seed = 1; seed <= 12; seed++) {
      const p = generate('ashmolean', 1, seed)
      const g = p.bitmap.map(row => row.map(() => -1 as const))
      const oneRowPass = p.rowClues.map((c, r) => solveClue(c, g[r])!)
      expect(oneRowPass.flat().some(v => v === -1), `seed ${seed}`).toBe(true)
    }
  })

  it('every config × difficulty × seed gives a valid, uniquely solvable puzzle quickly', () => {
    let worst = 0
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const seen = new Set<string>()
      const tier = tierFor(d)
      for (let seed = 1; seed <= 12; seed++) {
        const t0 = performance.now()
        const p = generate(id, d, seed)
        expect(p.bitmap.length).toBe(tier.size)
        // The solver uses only the clues as shown (twists included) and fills everything.
        const g = lineSolve(p.rowClues, p.colClues)!
        worst = Math.max(worst, performance.now() - t0)
        expect(g.map(r => r.map(v => v === 1)), `${id} d${d} s${seed}`).toEqual(p.bitmap)
        // Underlying runs are the picture's true runs.
        const base = cluesFor(p.bitmap)
        expect(p.rowClues.map(c => c.runs)).toEqual(base.rowClues)
        expect(p.colClues.map(c => c.runs)).toEqual(base.colClues)
        const twisted = [...p.rowClues, ...p.colClues].filter(c => c.kind !== 'runs').length
        expect(twisted).toBe(p.twisted)
        if (CONFIGS[id].twist === 'classic') expect(twisted).toBe(0)
        else {
          expect(twisted, `${id} d${d} s${seed} twisted lines`).toBeGreaterThanOrEqual(tier.minTwists)
          expect(twisted).toBeLessThanOrEqual(tier.twists)
        }
        expect(generate(id, d, seed)).toEqual(p)
        seen.add(JSON.stringify(p.bitmap))
      }
      expect(seen.size, `${id} d${d} variety`).toBeGreaterThanOrEqual(4)
    }
    expect(worst).toBeLessThan(300)
  })

  it('every config is a distinct twist, and each twist uses only its own clue kind', () => {
    // The base configs are each a distinct twist; story-themed configs reuse one of them.
    const BASE = ['ashmolean', 'british-museum', 'louvre', 'wunderkammer']
    expect(new Set(BASE.map(id => CONFIGS[id].twist)).size).toBe(BASE.length)
    for (const id of CONFIG_IDS) expect(BASE.map(b => CONFIGS[b].twist), id).toContain(CONFIGS[id].twist)
    const kindOf: Record<Twist, string> = { classic: 'runs', faded: 'hidden', jumbled: 'jumbled', tally: 'total' }
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const p = generate(id, d, 5)
      const kinds = new Set([...p.rowClues, ...p.colClues].map(c => c.kind))
      for (const k of kinds) expect(['runs', kindOf[p.twist]]).toContain(k)
    }
  })

  it('twisted clues lose information that plain runs would have given', () => {
    for (const id of CONFIG_IDS) {
      if (CONFIGS[id].twist === 'classic') continue
      const p = generate(id, 4, 3)
      for (const c of [...p.rowClues, ...p.colClues]) {
        if (c.kind === 'runs') continue
        const blank = Array(p.bitmap.length).fill(-1)
        const plain = solveClue({ kind: 'runs', runs: c.runs }, blank)!
        const twisted = solveClue(c, blank)!
        // Never knows more than the plain clue would.
        twisted.forEach((v, i) => { if (v !== -1) expect(plain[i]).toBe(v) })
      }
    }
  })

  it('variant rules: faded, jumbled and tally lines deduce what they should', () => {
    // Faded: nothing new.
    expect(solveClue({ kind: 'hidden', runs: [3] }, [-1, 1, -1, -1])).toEqual([-1, 1, -1, -1])
    expect(shownClue({ kind: 'hidden', runs: [3] })).toEqual([])
    // Tally: only the count matters, not contiguity.
    expect(shownClue({ kind: 'total', runs: [2, 1] })).toEqual([3])
    expect(solveClue({ kind: 'total', runs: [2, 1] }, [1, 1, -1, 1, -1])).toEqual([1, 1, 0, 1, 0])
    expect(solveClue({ kind: 'total', runs: [3] }, [-1, 0, -1, 0, -1])).toEqual([1, 0, 1, 0, 1])
    expect(solveClue({ kind: 'total', runs: [3] }, [0, 0, 0, -1, -1])).toBeNull()
    // Jumbled: shown smallest first; either order is allowed.
    expect(shownClue({ kind: 'jumbled', runs: [3, 1] })).toEqual([1, 3])
    // [3,1] in 5 is forced as ###.#, but jumbled also allows #.###.
    expect(solveLine([3, 1], [-1, -1, -1, -1, -1])).toEqual([1, 1, 1, 0, 1])
    expect(solveClue({ kind: 'jumbled', runs: [3, 1] }, [-1, -1, -1, -1, -1])).toEqual([1, -1, 1, -1, 1])
    expect(solveClue({ kind: 'jumbled', runs: [3, 1] }, [-1, 0, -1, -1, -1])).toEqual([1, 0, 1, 1, 1])
    expect(solveClue({ kind: 'jumbled', runs: [3, 1] }, [-1, -1, 0, -1, -1])).toBeNull()
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
      // Twisted clues are marked for the player.
      const p = generate(id, d, 1)
      const kinds = [...container.querySelectorAll('[data-kind]')].map(e => e.getAttribute('data-kind'))
      expect(kinds.filter(k => k !== 'runs').length).toBe(p.twisted)
      if (p.twist === 'faded') expect(container.textContent).toContain('?')
      if (p.twist === 'tally') expect(container.textContent).toContain('Σ')
      if (p.twist === 'jumbled') expect(container.textContent).toContain('⇄')
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
