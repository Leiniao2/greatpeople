import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Difficulty } from '@/games/types'
import PairsGame, {
  CONFIGS, CONFIG_IDS, makeDeck, perfectMemoryMistakes, mistakeBudget, pairsFor, layoutFor,
} from '@/components/minigames/PairsGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 17, 99, 12345]

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Archive Pairs — logic', () => {
  it('has at least 3 configs, each with a fact and enough pairs for a 6×6 desk', () => {
    expect(CONFIG_IDS.length).toBeGreaterThanOrEqual(3)
    for (const id of CONFIG_IDS) {
      const c = CONFIGS[id]
      expect(c.fact.length, id).toBeGreaterThan(20)
      expect(c.pairs.length, id).toBeGreaterThanOrEqual(pairsFor(4))
      expect(new Set(c.pairs.flat()).size, `${id} tiles distinct`).toBe(c.pairs.length * 2)
    }
  })

  it('desks grow from 3×4 to 6×6', () => {
    expect(layoutFor(1)).toEqual([3, 4])
    expect(layoutFor(4)).toEqual([6, 6])
  })

  it('every config × difficulty × seed is winnable by a perfect memory inside the budget', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const s of SEEDS) {
      const deck = makeDeck(id, CONFIGS[id], d, s)
      expect(deck.length).toBe(pairsFor(d) * 2)
      const { mistakes } = perfectMemoryMistakes(deck)
      expect(mistakes, `${id}@${d}#${s}`).toBeLessThanOrEqual(mistakeBudget(d))
      expect(mistakes).toBeLessThanOrEqual(pairsFor(d) - 1)
    }
  })

  it('decks are deterministic and vary with the seed', () => {
    const a = makeDeck('modern', CONFIGS.modern, 3, 5)
    expect(makeDeck('modern', CONFIGS.modern, 3, 5)).toEqual(a)
    expect(makeDeck('modern', CONFIGS.modern, 3, 6)).not.toEqual(a)
  })
})

describe('Archive Pairs — component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container } = render(createElement(PairsGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelectorAll('[data-tile]').length).toBe(pairsFor(d) * 2)
      cleanup()
    }
  })

  it('a scripted perfect run wins exactly once', () => {
    vi.useFakeTimers()
    for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container } = render(createElement(PairsGame, { configId: 'inventors', difficulty: d, seed: 7, onWin, onLose }))
      const tiles = [...container.querySelectorAll<HTMLButtonElement>('[data-tile]')]
      const byPair = new Map<string, HTMLButtonElement[]>()
      tiles.forEach(t => byPair.set(t.dataset.pair!, [...(byPair.get(t.dataset.pair!) ?? []), t]))
      for (const [a, b] of byPair.values()) { fireEvent.click(a); fireEvent.click(b) }
      fireEvent.click(tiles[0])
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin, `D${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('a scripted run of mismatches loses exactly once', () => {
    vi.useFakeTimers()
    const d: Difficulty = 4
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(PairsGame, { configId: 'ancient', difficulty: d, seed: 7, onWin, onLose }))
    const tiles = () => [...container.querySelectorAll<HTMLButtonElement>('[data-tile]')]
    for (let k = 0; k < mistakeBudget(d) + 4; k++) {
      const ts = tiles()
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
})
