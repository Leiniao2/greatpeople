import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Difficulty } from '@/games/types'
import PairsGame, {
  CONFIGS, CONFIG_IDS, makeDeck, perfectMemory, perfectBound, mistakeBudget, pairsFor, layoutFor, timerFor, peeksFor, flashMsFor,
  FRAGILE_FLIPS, MISS_MS,
} from '@/components/minigames/PairsGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 17, 99, 12345]

afterEach(() => { cleanup(); vi.useRealTimers() })

const tilesOf = (c: HTMLElement) => [...c.querySelectorAll<HTMLButtonElement>('[data-tile]')]
const byPair = (c: HTMLElement) => {
  const m = new Map<number, HTMLButtonElement[]>()
  tilesOf(c).forEach(t => m.set(Number(t.dataset.pair), [...(m.get(Number(t.dataset.pair)) ?? []), t]))
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1])
}

describe('Archive Pairs — logic', () => {
  it('has at least 4 configs, each a distinct twist with a fact and enough pairs', () => {
    expect(CONFIG_IDS.length).toBeGreaterThanOrEqual(4)
    // The base configs are each their own twist; story-themed configs reuse one of them.
    const BASE = ['ancient', 'renaissance', 'modern', 'inventors']
    expect(new Set(BASE.map(id => CONFIGS[id].variant)).size).toBe(BASE.length)
    for (const id of CONFIG_IDS) expect(BASE.map(b => CONFIGS[b].variant), id).toContain(CONFIGS[id].variant)
    for (const id of CONFIG_IDS) {
      const c = CONFIGS[id]
      expect(c.fact.length, id).toBeGreaterThan(20)
      expect(c.twist.length, id).toBeGreaterThan(40)
      expect(c.pairs.length, id).toBeGreaterThanOrEqual(pairsFor(4))
      expect(new Set(c.pairs.flat()).size, `${id} tiles distinct`).toBe(c.pairs.length * 2)
    }
  })

  it('time budget: desks grow from 3×4 to 6×4 (≤ 12 pairs) and the clock is at most 3 minutes', () => {
    expect(layoutFor(1)).toEqual([3, 4])
    expect(layoutFor(4)).toEqual([6, 4])
    for (const d of DIFFS) {
      expect(pairsFor(d)).toBeLessThanOrEqual(12)
      for (const id of CONFIG_IDS) expect(timerFor(d, CONFIGS[id].variant)).toBeLessThanOrEqual(180)
    }
    expect(timerFor(1)).toBe(0) // D1 untimed, 6 pairs: about a minute
  })

  it('every config × difficulty × seed is winnable by a perfect memory inside the budget', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const s of SEEDS) {
      const v = CONFIGS[id].variant
      const deck = makeDeck(id, CONFIGS[id], d, s)
      expect(deck.length).toBe(pairsFor(d) * 2)
      const r = perfectMemory(deck, v)
      expect(r.mistakes, `${id}@${d}#${s}`).toBeLessThanOrEqual(perfectBound(d, v))
      expect(perfectBound(d, v)).toBeLessThanOrEqual(mistakeBudget(d, v))
      expect(r.maxFlips).toBeLessThanOrEqual(FRAGILE_FLIPS)
      // A memory game, not a gimme: a perfect memory still needs real turns.
      expect(r.turns.length).toBeGreaterThanOrEqual(pairsFor(d))
    }
  })

  it('the perfect-memory bounds hold across many more decks', () => {
    for (const v of ['swap', 'ordered', 'fragile'] as const) for (const d of DIFFS) for (let s = 0; s < 150; s++) {
      const r = perfectMemory(makeDeck('modern', CONFIGS.modern, d, s), v)
      expect(r.mistakes).toBeLessThanOrEqual(perfectBound(d, v))
      expect(r.maxFlips).toBeLessThanOrEqual(FRAGILE_FLIPS)
    }
  })

  it('decks are deterministic and vary with the seed', () => {
    const a = makeDeck('modern', CONFIGS.modern, 3, 5)
    expect(makeDeck('modern', CONFIGS.modern, 3, 5)).toEqual(a)
    expect(makeDeck('modern', CONFIGS.modern, 3, 6)).not.toEqual(a)
  })

  it('flash allows far fewer mistakes and no peeks; ordered gets one more mistake and more time', () => {
    for (const d of DIFFS) {
      expect(mistakeBudget(d, 'flash')).toBeLessThan(mistakeBudget(d, 'swap'))
      expect(peeksFor(d, 'flash')).toBe(0)
      expect(perfectBound(d, 'ordered')).toBe(pairsFor(d))
      expect(timerFor(d, 'ordered')).toBeGreaterThanOrEqual(timerFor(d, 'swap'))
    }
  })
})

describe('Archive Pairs — component', () => {
  it('renders every config at every difficulty with its twist', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, getByTestId } = render(createElement(PairsGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(tilesOf(container).length).toBe(pairsFor(d) * 2)
      expect(getByTestId('pairs-twist').textContent).toContain(CONFIGS[id].twist)
      cleanup()
    }
  })

  it('a scripted perfect run (in request order) wins exactly once for every config and difficulty', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container } = render(createElement(PairsGame, { configId: id, difficulty: d, seed: 7, onWin, onLose }))
      act(() => { vi.advanceTimersByTime(flashMsFor(d) + 100) }) // the flash study time
      for (const [a, b] of byPair(container)) { fireEvent.click(a); fireEvent.click(b) }
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin, `${id} D${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('a scripted run of mismatches loses exactly once', () => {
    vi.useFakeTimers()
    const d: Difficulty = 4
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(PairsGame, { configId: 'ancient', difficulty: d, seed: 7, onWin, onLose }))
    for (let k = 0; k < mistakeBudget(d, 'swap') + 4; k++) {
      const ts = tilesOf(container)
      const a = ts[0]
      const b = ts.find(t => t.dataset.pair !== a.dataset.pair)!
      fireEvent.click(a); fireEvent.click(b)
      act(() => { vi.advanceTimersByTime(1000) })
    }
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('the clock running out loses once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(PairsGame, { configId: 'ancient', difficulty: 2, seed: 7, onWin, onLose }))
    act(() => { vi.advanceTimersByTime(200_000) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('swap (Alexandria): two mismatched slips trade places', () => {
    vi.useFakeTimers()
    const { container } = render(createElement(PairsGame, { configId: 'ancient', difficulty: 1, seed: 7, onWin: () => {}, onLose: () => {} }))
    const before = tilesOf(container).map(t => t.dataset.pair)
    const a = 0, b = before.findIndex(p => p !== before[0])
    fireEvent.click(tilesOf(container)[a]); fireEvent.click(tilesOf(container)[b])
    act(() => { vi.advanceTimersByTime(MISS_MS + 50) })
    const after = tilesOf(container).map(t => t.dataset.pair)
    expect(after[a]).toBe(before[b])
    expect(after[b]).toBe(before[a])
    expect(after.filter((_, k) => k !== a && k !== b)).toEqual(before.filter((_, k) => k !== a && k !== b))
  })

  it('flash (Medici): the desk starts face up, and taps wait until it turns down', () => {
    vi.useFakeTimers()
    const onWin = vi.fn()
    const { container } = render(createElement(PairsGame, { configId: 'renaissance', difficulty: 2, seed: 7, onWin, onLose: () => {} }))
    expect(tilesOf(container).every(t => t.getAttribute('aria-label') !== 'face-down slip')).toBe(true)
    const [a, b] = byPair(container)[0]
    fireEvent.click(a); fireEvent.click(b)
    expect(container.textContent).toContain('0 / 8 pairs filed')
    act(() => { vi.advanceTimersByTime(flashMsFor(2) + 50) })
    expect(tilesOf(container).every(t => t.getAttribute('aria-label') === 'face-down slip')).toBe(true)
    fireEvent.click(a); fireEvent.click(b)
    expect(container.textContent).toContain('1 / 8 pairs filed')
  })

  it('ordered (British Library): a right pair out of turn goes back without a mistake', () => {
    vi.useFakeTimers()
    const d: Difficulty = 2
    const { container, getByTestId } = render(createElement(PairsGame, { configId: 'modern', difficulty: d, seed: 7, onWin: () => {}, onLose: () => {} }))
    const pairs = byPair(container)
    const person0 = pairs[0].find(t => t.dataset.kind === 'person')!
    fireEvent.click(pairs[0][0]); fireEvent.click(pairs[0][1])
    expect(getByTestId('pairs-request').textContent).not.toContain(person0.getAttribute('aria-label')!.replace('person: ', ''))
    const left = getByTestId('mistakes-left').textContent
    // Pair 0 was filed; now try pair 2 before pair 1.
    fireEvent.click(pairs[2][0]); fireEvent.click(pairs[2][1])
    act(() => { vi.advanceTimersByTime(MISS_MS + 50) })
    expect(container.textContent).toContain('1 / 8 pairs filed')
    expect(getByTestId('mistakes-left').textContent).toBe(left)
    expect(pairs[2][0].getAttribute('aria-label')).toBe('face-down slip')
  })

  it('fragile (Patents): a slip turned up a third time tears and loses once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(PairsGame, { configId: 'inventors', difficulty: 1, seed: 7, onWin, onLose }))
    const ts = tilesOf(container)
    const a = ts[0], b = ts.filter(t => t.dataset.pair !== a.dataset.pair)
    for (let k = 0; k < FRAGILE_FLIPS; k++) {
      fireEvent.click(a); fireEvent.click(b[k])
      act(() => { vi.advanceTimersByTime(MISS_MS + 50) })
    }
    expect(onLose).not.toHaveBeenCalled()
    expect(a.querySelector('[data-wear]')!.getAttribute('data-wear')).toBe('0')
    fireEvent.click(a)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
