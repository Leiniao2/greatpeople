// Quipu: the knot code round-trips, every config × difficulty × seed builds a
// valid puzzle inside its size budget (mis-tied quipus have exactly one
// suspect), and the component wins and loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import QuipuGame, {
  CONFIGS, CONFIG_IDS, generate, answers, encode, decode, digitsOf, suspects, gridIds, tierFor, mistie,
  type Puzzle,
} from '@/components/minigames/QuipuGame'
import { mulberry32 } from '@/components/minigames/_shared'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 99, 1006, 31337]
/** Most cords a player must read per difficulty. */
const BUDGET: Record<string, number[]> = {
  read: [3, 4, 5, 6], tie: [3, 3, 4, 5], top: [4, 8, 10, 12], mis: [8, 11, 22, 30], census: [4, 6, 8, 9],
}

/** Cords a player must read for one puzzle — the size budget behind the 1–3 minute target. */
function cordsToRead(p: Puzzle): number {
  switch (p.kind) {
    case 'read': return p.cords.length
    case 'tie': return p.targets.length
    case 'top': return p.groups.reduce((a, g) => a + g.length + 1, 0)
    case 'mis': return p.rounds.reduce((a, g) => a + gridIds(g).length, 0)
    case 'census': return p.cords.length
  }
}

describe('quipu knots', () => {
  it('encode/decode round-trips every value and uses the Inca unit knots', () => {
    for (let v = 0; v <= 9999; v++) expect(decode(encode(v))).toBe(v)
    expect(encode(1).map(k => k.kind)).toEqual(['none', 'none', 'none', 'eight'])
    expect(encode(3407).map(k => [k.kind, k.count])).toEqual([['single', 3], ['single', 4], ['none', 0], ['long', 7]])
    expect(encode(110)[3].kind).toBe('none')
    expect(digitsOf(52)).toEqual([0, 0, 5, 2])
  })

  it('mistie always changes the value and keeps it positive and 4-digit', () => {
    const rng = mulberry32(5)
    for (let v = 1; v < 3000; v += 7) {
      const w = mistie(v, rng)
      expect(w).not.toBe(v)
      expect(w).toBeGreaterThanOrEqual(1)
      expect(w).toBeLessThanOrEqual(9999)
    }
  })
})

describe('quipu puzzles', () => {
  for (const id of CONFIG_IDS) for (const d of DIFFS) {
    it(`${id} d${d}: valid, within budget, varied`, () => {
      const kind = CONFIGS[id].kind
      const t = tierFor(kind, d)
      const seen = new Set<string>()
      for (const seed of SEEDS) {
        const p = generate(kind, d, seed)
        expect(generate(kind, d, seed)).toEqual(p)
        seen.add(JSON.stringify(p))
        const sol = answers(p)
        for (const v of sol) { expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(9999) }
        const n = cordsToRead(p)
        // Cords to read (and tie or add): ~6–20 s each by digit count, so
        // D1 ≈ 1 min and D4 ≤ 3 min.
        expect(n, 'enough to need thought').toBeGreaterThanOrEqual(3)
        expect(n, 'short enough').toBeLessThanOrEqual(BUDGET[kind][d - 1])
        if (p.kind === 'read') { expect(p.cords.length).toBe(t.cords); p.cords.forEach(c => expect(c.value).toBeGreaterThanOrEqual(t.minV)) }
        if (p.kind === 'tie') expect(p.targets.length).toBe(t.cords)
        if (p.kind === 'top') { expect(p.groups.length).toBe(t.groups); p.groups.forEach(g => expect(g.length).toBe(t.pendants)) }
        if (p.kind === 'census') {
          expect(p.questions.length).toBe(t.questions)
          for (const q of p.questions) expect(p.cords.filter(c => c.color === q.color).length).toBeGreaterThanOrEqual(2)
          expect(new Set(p.questions.map(q => q.color)).size).toBe(p.questions.length)
        }
        if (p.kind === 'mis') {
          expect(p.rounds.length).toBe(t.rounds)
          for (const g of p.rounds) {
            expect(g.pendants.length).toBe(t.groups)
            expect(suspects(g)).toEqual([g.wrong])
            expect(gridIds(g)).toContain(g.wrong)
          }
        }
      }
      expect(seen.size, 'seeds give different quipus').toBeGreaterThanOrEqual(SEEDS.length - 1)
    })
  }

  it('the wrong cord lands on pendants, tops and totals across seeds', () => {
    const kinds = new Set<string>()
    for (let s = 1; s <= 60; s++) for (const g of (generate('mis', 3, s) as Extract<Puzzle, { kind: 'mis' }>).rounds) {
      kinds.add(g.wrong.startsWith('t') ? 'total' : g.wrong.endsWith('top') ? 'top' : 'pendant')
    }
    expect(kinds).toEqual(new Set(['total', 'top', 'pendant']))
  })
})

describe('quipu component', () => {
  const q = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-testid="${id}"]`)!

  function playPerfect(c: HTMLElement, p: Puzzle) {
    if (p.kind === 'mis') {
      for (const g of p.rounds) {
        fireEvent.click(c.querySelector(`[data-cord="${g.wrong}"]`)!)
        fireEvent.click(q(c, 'qp-accuse'))
      }
      return
    }
    for (const v of answers(p)) {
      if (p.kind === 'read' || p.kind === 'census') {
        for (const ch of String(v)) fireEvent.click(q(c, `qp-key-${ch}`))
        fireEvent.click(q(c, 'qp-enter'))
      } else {
        digitsOf(v).forEach((dg, pos) => { for (let k = 0; k < dg; k++) fireEvent.click(q(c, `qp-inc-${pos}`)) })
        fireEvent.click(q(c, 'qp-check'))
      }
    }
  }

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(QuipuGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelectorAll('[data-cord]').length).toBeGreaterThan(0)
      expect(q(container, 'qp-prompt').textContent).toBeTruthy()
      unmount()
    }
  })

  it('accepts title/intro overrides', () => {
    const { container } = render(createElement(QuipuGame, { configId: 'read', difficulty: 1, seed: 1, params: { title: 'Cuzco Ledger', intro: 'Read it.' }, onWin: () => {}, onLose: () => {} }))
    expect(container.textContent).toContain('Cuzco Ledger')
    expect(container.textContent).toContain('Read it.')
  })

  it('a perfect player wins once on every config and difficulty', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(QuipuGame, { configId: id, difficulty: d, seed: 11, onWin, onLose }))
      playPerfect(container, generate(CONFIGS[id].kind, d, 11))
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('repeated mistakes lose once on every config', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of [1, 4] as Difficulty[]) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(QuipuGame, { configId: id, difficulty: d, seed: 4, onWin, onLose }))
      const p = generate(CONFIGS[id].kind, d, 4)
      for (let k = 0; k < tierFor(p.kind, d).lives + 2; k++) {
        if (p.kind === 'mis') {
          const innocent = gridIds(p.rounds[0]).find(x => x !== p.rounds[0].wrong)!
          const cord = container.querySelector(`[data-cord="${innocent}"]`)
          if (!cord) break
          if (!container.querySelector('[data-testid="qp-accuse"]:not([disabled])')) fireEvent.click(cord)
          const btn = container.querySelector<HTMLElement>('[data-testid="qp-accuse"]')
          if (!btn) break
          fireEvent.click(btn)
        } else if (p.kind === 'read' || p.kind === 'census') {
          const key = container.querySelector<HTMLElement>('[data-testid="qp-key-0"]')
          if (!key) break
          fireEvent.click(key) // "0" is never an answer
          fireEvent.click(q(container, 'qp-enter'))
        } else {
          const btn = container.querySelector<HTMLElement>('[data-testid="qp-check"]')
          if (!btn) break
          fireEvent.click(btn) // an untied cord (0) is never an answer
        }
      }
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })
})
