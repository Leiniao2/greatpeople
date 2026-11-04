// Suanpan: every generated bill is workable on its frame within the tier's
// size budget, bead taps behave like a real abacus, and the component wins
// and loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import AbacusGame, {
  CONFIGS, CONFIG_IDS, generate, tierFor, readAbacus, rodsFor, tapCount, beadFor, toRoman, carryCount, borrowCount, type Rod,
} from '@/components/minigames/AbacusGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 99, 1006, 31337]

describe('abacus logic', () => {
  it('reads and writes numbers', () => {
    expect(readAbacus(rodsFor(4093, 5))).toBe(4093)
    expect(readAbacus([{ u: 2, l: 5 }, { u: 0, l: 3 }])).toBe(153) // suanpan rod holding 15
    expect(toRoman(1444)).toBe('MCDXLIV')
    expect(toRoman(3999)).toBe('MMMCMXCIX')
    expect(carryCount(95, 7)).toBe(2)
    expect(borrowCount(100, 1)).toBe(2)
  })

  it('taps move beads like a real frame', () => {
    expect(tapCount(0, 3)).toBe(4) // push the 4th earth bead up brings 4
    expect(tapCount(4, 1)).toBe(1) // pull bead 2 away leaves 1
    for (let cur = 0; cur <= 5; cur++) for (let t = 0; t <= 5; t++) {
      const b = beadFor(cur, t)
      expect(b === null ? cur : tapCount(cur, b)).toBe(t)
    }
  })

  for (const id of CONFIG_IDS) for (const d of DIFFS) {
    it(`${id} d${d}: steps are consistent, fit the frame and the size budget`, () => {
      const shapes = new Set<string>()
      for (const seed of SEEDS) {
        const p = generate(CONFIGS[id], d, seed)
        const tier = tierFor(CONFIGS[id], d)
        expect(p.steps.length).toBe(tier.steps)
        expect(tier.steps).toBeLessThanOrEqual(5)
        let total = p.start
        let worked = 0
        for (const s of p.steps) {
          expect(s.amount).toBeGreaterThanOrEqual(tier.minAmt)
          expect(s.amount).toBeLessThanOrEqual(tier.maxAmt)
          const c = s.op === 'add' ? carryCount(total, s.amount) : s.op === 'sub' ? borrowCount(total, s.amount) : 0
          if (c) worked++
          if (d >= 2 && s.op !== 'set' && total > 0) expect(c, `${id} d${d} s${seed} needs a carry/borrow`).toBeGreaterThan(0)
          total = s.op === 'add' ? total + s.amount : s.op === 'sub' ? total - s.amount : s.amount
          expect(s.total).toBe(total)
          expect(total).toBeGreaterThanOrEqual(0)
          expect(total).toBeLessThan(10 ** tier.rods)
          expect(readAbacus(rodsFor(total, tier.rods))).toBe(total)
        }
        expect(worked).toBeGreaterThan(0)
        if (CONFIGS[id].ops === 'roman') expect(total).toBeLessThan(4000)
        shapes.add(p.steps.map(s => s.amount).join(','))
      }
      expect(shapes.size, 'seeds vary').toBeGreaterThanOrEqual(SEEDS.length - 1)
    })
  }

  it('configs genuinely differ in their rule', () => {
    const rules = CONFIG_IDS.map(id => { const c = CONFIGS[id]; return `${c.upper}/${c.lower}:${c.ops}:${!!c.flash}:${!!c.timed}` })
    expect(new Set(rules).size).toBe(CONFIG_IDS.length)
  })
})

describe('abacus component', () => {
  const beadEl = (c: HTMLElement, r: number, part: 'u' | 'l', i: number) => c.querySelector<HTMLButtonElement>(`[data-bead="${r}-${part}-${i}"]`)!

  /** Read the frame's state from the DOM. */
  function domRods(c: HTMLElement, rods: number): Rod[] {
    return Array.from({ length: rods }, (_, r) => ({
      u: c.querySelectorAll(`[data-bead^="${r}-u-"][data-active="true"]`).length,
      l: c.querySelectorAll(`[data-bead^="${r}-l-"][data-active="true"]`).length,
    }))
  }

  /** Tap beads until the frame shows `value`, as a player would. */
  function setFrame(c: HTMLElement, value: number, rods: number) {
    const target = rodsFor(value, rods)
    for (let r = 0; r < rods; r++) for (const part of ['u', 'l'] as const) {
      const cur = domRods(c, rods)[r][part]
      const b = beadFor(cur, target[r][part])
      if (b !== null) fireEvent.click(beadEl(c, r, part, b))
    }
    expect(readAbacus(domRods(c, rods))).toBe(value)
  }

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(AbacusGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      const tier = tierFor(CONFIGS[id], d)
      expect(container.querySelectorAll('[data-rod]').length).toBe(tier.rods)
      expect(container.querySelectorAll('[data-bead]').length).toBe(tier.rods * (CONFIGS[id].upper + CONFIGS[id].lower))
      const p = generate(CONFIGS[id], d, 3)
      expect(readAbacus(domRods(container, tier.rods))).toBe(p.start)
      unmount()
    }
  })

  it('uses params overrides for title and intro', () => {
    const { container } = render(createElement(AbacusGame, { configId: 'ming-shop', difficulty: 1, seed: 1, params: { title: 'Zheng He’s Purser', intro: 'Tally the fleet.' }, onWin: () => {}, onLose: () => {} }))
    expect(container.textContent).toContain('Zheng He’s Purser')
    expect(container.textContent).toContain('Tally the fleet.')
  })

  it('working every step on the beads wins once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, getByTestId, unmount } = render(createElement(AbacusGame, { configId: id, difficulty: d, seed: 11, onWin, onLose }))
      const p = generate(CONFIGS[id], d, 11)
      for (const s of p.steps) {
        setFrame(container, s.total, p.tier.rods)
        fireEvent.click(getByTestId('abacus-enter'))
      }
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('wrong totals lose once at the mistake cap', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(AbacusGame, { configId: id, difficulty: d, seed: 5, onWin, onLose }))
      const p = generate(CONFIGS[id], d, 5)
      setFrame(container, p.steps[0].total === 1 ? 2 : 1, p.tier.rods)
      for (let k = 0; k < p.tier.mistakes + 2; k++) {
        const btn = container.querySelector<HTMLButtonElement>('[data-testid="abacus-enter"]')
        if (btn) fireEvent.click(btn)
      }
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('the timed ledger loses once when the gong sounds', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(AbacusGame, { configId: 'timed-ledger', difficulty: 1, seed: 2, onWin, onLose }))
    act(() => { vi.advanceTimersByTime((tierFor(CONFIGS['timed-ledger'], 1).seconds + 3) * 1000) })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('flash amounts hide after their time', () => {
    vi.useFakeTimers()
    const { getByTestId } = render(createElement(AbacusGame, { configId: 'soroban-flash', difficulty: 2, seed: 2, onWin: () => {}, onLose: () => {} }))
    const p = generate(CONFIGS['soroban-flash'], 2, 2)
    expect(getByTestId('abacus-task').textContent).toContain(p.steps[0].amount.toLocaleString('en-US'))
    act(() => { vi.advanceTimersByTime(p.tier.flash * 1000 + 50) })
    expect(getByTestId('abacus-task').textContent).toContain('• • •')
  })
})
