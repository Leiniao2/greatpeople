// Sapper (no-guess Minesweeper): every field is logic-solvable from the first
// square, the first square is a clear opening, every config counts a
// different reach, the time budget holds, and the component wins and loses
// exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import SapperGame, { CONFIGS, CONFIG_IDS, REACH, generate, solveLogically, makeField, countsFor, tierFor, type Reach } from '@/components/minigames/SapperGame'
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
        const field = makeField(n, CONFIGS[id].shape, CONFIGS[id].reach)
        const starts = field.inside.map((ok, i) => (ok ? i : -1)).filter(i => i >= 0)
        const start = starts[(seed * 53) % starts.length]
        const t0 = performance.now()
        const L = generate(CONFIGS[id], d, seed, start)
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
    const r = { shape: 'square', reach: 'king' } as const
    expect(generate(r, 3, 5, 40).mines).toEqual(generate(r, 3, 5, 40).mines)
    expect(generate(r, 3, 5, 40).mines).not.toEqual(generate(r, 3, 6, 40).mines)
    expect(generate(r, 3, 5, 40).mines).not.toEqual(generate({ ...r, reach: 'knight' }, 3, 5, 40).mines)
  })

  it('time budget: ~1 min at D1 up to ~3 min at D4, and D1 still needs deductions', () => {
    const maxCells = [64, 81, 100, 144], maxMines = [10, 13, 18, 27]
    for (const d of DIFFS) {
      const { n, density } = tierFor(d)
      expect(n * n, `d${d} cells`).toBeLessThanOrEqual(maxCells[d - 1])
      expect(Math.round(n * n * density), `d${d} mines`).toBeLessThanOrEqual(maxMines[d - 1])
      if (d > 1) expect(n * n * density).toBeGreaterThan(tierFor((d - 1) as Difficulty).n ** 2 * tierFor((d - 1) as Difficulty).density)
    }
    // The opening flood never clears a D1 field by itself.
    for (const id of CONFIG_IDS) for (let seed = 1; seed <= 10; seed++) {
      const { n } = tierFor(1)
      const field = makeField(n, CONFIGS[id].shape, CONFIGS[id].reach)
      const inside = field.inside.map((ok, i) => (ok ? i : -1)).filter(i => i >= 0)
      const start = inside[(seed * 17) % inside.length]
      const L = generate(CONFIGS[id], 1, seed, start)
      const seen = new Set<number>(), stack = [start]
      while (stack.length) {
        const j = stack.pop()!
        if (seen.has(j)) continue
        seen.add(j)
        if (L.counts[j] === 0) stack.push(...field.nbrs[j])
      }
      const safe = field.inside.filter(Boolean).length - L.mineCount
      expect(seen.size, `${id} s${seed}`).toBeLessThan(safe)
    }
  })

  it('every config counts a different reach, and the reaches are what the rules say', () => {
    // The base configs each count a different reach; story-themed configs reuse one of them.
    const BASE = ['maastricht-1673', 'lille-citadel', 'namur-1692', 'neuf-brisach']
    expect(new Set(BASE.map(id => CONFIGS[id].reach)).size).toBe(BASE.length)
    for (const id of CONFIG_IDS) expect(BASE.map(b => CONFIGS[b].reach), id).toContain(CONFIGS[id].reach)
    const sizes: Record<Reach, number> = { king: 8, orth: 4, knight: 8, ring: 16 }
    for (const r of Object.keys(REACH) as Reach[]) {
      expect(REACH[r].length, r).toBe(sizes[r])
      // Symmetric: if a counts b then b counts a.
      const f = makeField(7, 'square', r)
      f.nbrs.forEach((ns, i) => ns.forEach(j => expect(f.nbrs[j]).toContain(i)))
      expect(f.nbrs[24].length).toBe(sizes[r]) // centre of a 7×7
    }
    // One mine at (0,0) of a 5×5: who sees it under each rule.
    const mines = Array(25).fill(false); mines[0] = true
    const at = (r: Reach, row: number, col: number) => countsFor(makeField(5, 'square', r), mines)[row * 5 + col]
    expect([at('king', 1, 1), at('orth', 1, 1), at('knight', 1, 1), at('ring', 1, 1)]).toEqual([1, 0, 0, 0])
    expect([at('king', 0, 1), at('orth', 0, 1), at('knight', 0, 1), at('ring', 0, 1)]).toEqual([1, 1, 0, 0])
    expect([at('king', 1, 2), at('orth', 1, 2), at('knight', 1, 2), at('ring', 1, 2)]).toEqual([0, 0, 1, 1])
    expect([at('king', 2, 2), at('orth', 2, 2), at('knight', 2, 2), at('ring', 2, 2)]).toEqual([0, 0, 0, 1])
    // The start's own reach is always clear, whatever the rule.
    for (const id of CONFIG_IDS) {
      const L = generate(CONFIGS[id], 4, 9, 30)
      expect(L.field.nbrs[30].some(k => L.mines[k]), id).toBe(false)
    }
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
      // The reach key shows exactly the squares a number counts.
      expect(container.querySelectorAll('[data-testid="sap-reach"] .bg-sky-500').length).toBe(REACH[CONFIGS[id].reach].length)
      unmount()
    }
  })

  it('opening every safe square wins once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(SapperGame, { configId: id, difficulty: d, seed: 8, onWin, onLose }))
      const field = makeField(tierFor(d).n, CONFIGS[id].shape, CONFIGS[id].reach)
      const start = field.inside.lastIndexOf(true) - 1
      fireEvent.click(sq(container, start))
      const L = generate(CONFIGS[id], d, 8, start)
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

  it('digging mines loses once at the blast cap; flags protect squares', () => {
    vi.useFakeTimers()
    for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, getByRole, unmount } = render(createElement(SapperGame, { configId: 'namur-1692', difficulty: d, seed: 3, onWin, onLose }))
      fireEvent.click(sq(container, 0))
      const L = generate(CONFIGS['namur-1692'], d, 3, 0)
      const mines = L.mines.map((m, i) => (m ? i : -1)).filter(i => i >= 0)
      // Flag the first mine in flag mode: digging it then does nothing.
      fireEvent.click(getByRole('button', { name: /Flag/ }))
      fireEvent.click(sq(container, mines[0]))
      expect(sq(container, mines[0]).getAttribute('data-state')).toBe('2')
      fireEvent.click(getByRole('button', { name: /Dig/ }))
      fireEvent.click(sq(container, mines[0]))
      expect(onLose).not.toHaveBeenCalled()
      // Blasts before the cap mark the mine and play goes on; the last one loses.
      const cap = tierFor(d).maxBlasts
      for (let k = 1; k < cap; k++) {
        fireEvent.click(sq(container, mines[k]))
        expect(sq(container, mines[k]).getAttribute('data-state'), `d${d} blast ${k}`).toBe('3')
        expect(onLose).not.toHaveBeenCalled()
      }
      fireEvent.click(sq(container, mines[cap]))
      fireEvent.click(sq(container, mines[cap + 1]))
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

  it('tapping an open number outlines the squares it counts', () => {
    for (const id of CONFIG_IDS) {
      const { container, unmount } = render(createElement(SapperGame, { configId: id, difficulty: 1, seed: 4, onWin: () => {}, onLose: () => {} }))
      const start = 27
      fireEvent.click(sq(container, start))
      const L = generate(CONFIGS[id], 1, 4, 27)
      const open = [...container.querySelectorAll<HTMLElement>('[data-state="1"]')].map(e => Number(e.getAttribute('data-cell')))
      const num = open.find(i => L.counts[i] > 0)!
      fireEvent.click(sq(container, num))
      const peeked = [...container.querySelectorAll('[data-peek="true"]')].map(e => Number(e.getAttribute('data-cell')))
      expect(peeked.sort((a, b) => a - b), id).toEqual([...L.field.nbrs[num]].sort((a, b) => a - b))
      unmount()
    }
  })
})
