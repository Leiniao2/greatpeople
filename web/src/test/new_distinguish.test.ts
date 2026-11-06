// Distinguish: every config × difficulty × seed builds a full set of rounds
// from distinct look-alikes with painted art, clues get less direct as the
// tiers rise, and the component wins on a clean run, forgives misses up to
// its lives and loses on the clock.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import DistinguishGame, { CONFIGS, CONFIG_IDS } from '@/components/minigames/DistinguishGame'
import { plan, LOOKALIKE, ROUNDS, LIVES, SECONDS } from '@/components/minigames/distinguish/model'
import { PAIRS } from '@/components/minigames/distinguish/pairs'
import { buildTrack } from '@/games/arcade'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const ART = new Set(Object.keys(import.meta.glob('../../public/distinguish/*.webp')).map(p => p.split('/').pop()!.replace('.webp', '')))
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 5, 8, 13, 42, 99, 1234, 777777]

describe('distinguish data', () => {
  it('every look-alike has a unique key and painted art', () => {
    const keys = PAIRS.flatMap(p => p.items.map(i => i.key))
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(ART.has(k), k).toBe(true)
  })
})

describe('distinguish rounds', () => {
  it('every config × difficulty × seed builds distinct, answerable rounds', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const sigs = new Set<string>()
      for (const seed of SEEDS) {
        const g = plan(CONFIGS[id].shelves, d, seed)
        const tag = `${id} d${d} s${seed}`
        expect(g.rounds.length, tag).toBe(ROUNDS[d - 1])
        expect(g.lives).toBe(LIVES[d - 1])
        expect(g.seconds).toBe(SECONDS[d - 1])
        expect(new Set(g.rounds.map(r => r.pair)).size, tag).toBe(g.rounds.length)
        for (const r of g.rounds) {
          expect(r.options, tag).toContain(r.answer)
          expect(new Set(r.options.map(k => LOOKALIKE[k].pair)).size).toBe(1)
          if (d < 3) expect(r.options.length, tag).toBe(2)
          if (d === 1) expect(r.mode).toBe('direct')
          if (d >= 3) expect(r.mode).toBe('other')
          // The clue describes the answer (direct) or every other option (other).
          const named = r.mode === 'direct' ? [r.answer] : r.options.filter(k => k !== r.answer)
          expect([...r.clue].sort()).toEqual(named.map(k => `The ${LOOKALIKE[k].name} ${LOOKALIKE[k].trait}.`).sort())
          expect(r.ask).toContain(LOOKALIKE[r.answer].name)
        }
        if (d === 2) expect(new Set(g.rounds.map(r => r.mode)).size, tag).toBe(2)
        sigs.add(JSON.stringify(g.rounds.map(r => [r.answer, r.options])))
      }
      expect(sigs.size, `${id} d${d} variety`).toBeGreaterThanOrEqual(8)
    }
  })

  it('three-way sets appear from D3', () => {
    const triples = CONFIG_IDS.some(id => SEEDS.some(s => plan(CONFIGS[id].shelves, 3, s).rounds.some(r => r.options.length === 3)))
    expect(triples).toBe(true)
  })

  it('the Arcade ladder never repeats a level', () => {
    const track = buildTrack('distinguish', CONFIG_IDS)
    const sigs = new Set(track.map(l => JSON.stringify(plan(CONFIGS[l.configId].shelves, l.difficulty, l.seed).rounds.map(r => r.answer))))
    expect(sigs.size).toBe(track.length)
  })
})

describe('distinguish component', () => {
  function play(container: HTMLElement, rounds: ReturnType<typeof plan>['rounds'], wrongAt: number[] = []) {
    rounds.forEach((r, i) => {
      const k = wrongAt.includes(i) ? r.options.find(o => o !== r.answer)! : r.answer
      fireEvent.click(container.querySelector(`[data-pick="${k}"]`)!)
      const next = container.querySelector('[data-action="next"]')
      if (next) fireEvent.click(next)
    })
  }

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(DistinguishGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      const g = plan(CONFIGS[id].shelves, d, 3)
      expect(container.querySelectorAll('[data-pick]').length).toBe(g.rounds[0].options.length)
      expect(container.querySelector('[data-testid="dist-clue"]')!.textContent).toContain(g.rounds[0].ask)
      unmount()
    }
  })

  it('a clean run wins once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(DistinguishGame, { configId: id, difficulty: d, seed: 11, onWin, onLose }))
      play(container, plan(CONFIGS[id].shelves, d, 11).rounds)
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('misses below the life count still win; reaching it loses once', () => {
    vi.useFakeTimers()
    for (const d of DIFFS) {
      const g = plan(CONFIGS['darwin-notebook'].shelves, d, 7)
      const spare = Array.from({ length: g.lives - 1 }, (_, i) => i)
      let onWin = vi.fn(), onLose = vi.fn()
      let r = render(createElement(DistinguishGame, { configId: 'darwin-notebook', difficulty: d, seed: 7, onWin, onLose }))
      play(r.container, g.rounds, spare)
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `d${d} spare`).toHaveBeenCalledTimes(1)
      r.unmount()
      onWin = vi.fn(); onLose = vi.fn()
      r = render(createElement(DistinguishGame, { configId: 'darwin-notebook', difficulty: d, seed: 7, onWin, onLose }))
      play(r.container, g.rounds.slice(0, g.lives), Array.from({ length: g.lives }, (_, i) => i))
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose, `d${d} out`).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      r.unmount()
    }
  })

  it('running out of time loses once, and the clock waits while a pick is explained', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const g = plan(CONFIGS['grand-tour'].shelves, 1, 4)
    const { container } = render(createElement(DistinguishGame, { configId: 'grand-tour', difficulty: 1, seed: 4, onWin, onLose }))
    fireEvent.click(container.querySelector(`[data-pick="${g.rounds[0].answer}"]`)!)
    act(() => { vi.advanceTimersByTime((SECONDS[0] + 5) * 1000) })
    expect(onLose).not.toHaveBeenCalled()
    fireEvent.click(container.querySelector('[data-action="next"]')!)
    act(() => { vi.advanceTimersByTime((SECONDS[0] + 1) * 1000) })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('story params override the title', () => {
    const { getByText } = render(createElement(DistinguishGame, { configId: 'field-guide', difficulty: 1, seed: 1, params: { title: 'Audubon’s Sketchbook' }, onWin: () => {}, onLose: () => {} }))
    expect(getByText('Audubon’s Sketchbook')).toBeTruthy()
  })
})
