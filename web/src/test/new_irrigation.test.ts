// Nile Basins (irrigation): the water rules behave, every generated level is
// solver-verified winnable within its flood, needs real sluice work, and the
// component wins and loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import IrrigationGame, {
  CONFIGS, CONFIG_IDS, generate, search, initialState, step, flow, isWon, playPlan, tierFor,
  type Level, type Rules, type Cell,
} from '@/components/minigames/IrrigationGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]

const BASE: Rules = { conduct: false, soak: 1, elevation: false, gateUses: Infinity, inlets: 1, surge: false }
const CH: Record<string, Cell> = { '~': 'river', I: 'inlet', c: 'canal', G: 'gate', F: 'field', V: 'village', '.': 'land' }

/** Build a hand level from rows of characters. */
function mk(rowsStr: string[], rules: Partial<Rules>, gateOpen: boolean[], extra: Partial<Level> = {}): Level {
  const cols = rowsStr[0].length
  const cells = rowsStr.join('').split('').map(ch => CH[ch])
  const idx = (t: Cell) => cells.map((c, i) => (c === t ? i : -1)).filter(i => i >= 0)
  return {
    rows: rowsStr.length, cols, cells, height: null, inlets: idx('inlet'), gates: idx('gate'), gateOpen,
    fields: idx('field'), villages: idx('village'), surge: new Array(32).fill(false), turns: 10, minTurns: 0, minActs: 0,
    rules: { ...BASE, ...rules }, ...extra,
  }
}

describe('irrigation rules', () => {
  it('water runs one cell a turn, a shut sluice blocks it and shutting drains what lies beyond', () => {
    const l = mk(['~~~~~', 'IcGcF'], {}, [true])
    let s = initialState(l)
    s = step(l, s, -1)!; expect(s.wet[6]).toBe(true); expect(s.wet[7]).toBe(false)
    s = step(l, s, -1)!; expect(s.wet[7]).toBe(true)
    s = step(l, s, -1)!; expect(s.wet[8]).toBe(true)
    s = step(l, s, 0)!   // shut the sluice
    expect(s.wet[7]).toBe(false); expect(s.wet[8]).toBe(false); expect(s.wet[6]).toBe(true)
    // the open path waters the field
    const t = playPlan(l, [-1, -1, -1, -1])!
    expect(isWon(l, t)).toBe(true)
  })

  it('a shut sluice must be opened, and a village reached by water is flooded', () => {
    const l = mk(['~~~~', 'IGcF', '..V.'], {}, [false])
    // V at index 10 sits under the canal at 6.
    expect(playPlan(l, [-1, -1, -1, -1])!.soak[0]).toBe(0)
    expect(playPlan(l, [0, -1, -1])!.flooded).toBe(true)
  })

  it('surge turns move the water two cells', () => {
    const l = mk(['~~~~~', 'Icccc'], {}, [], { surge: [true, ...new Array(31).fill(false)] })
    const s = step(l, initialState(l), -1)!
    expect(s.wet[7]).toBe(true); expect(s.wet[8]).toBe(false)
  })

  it('elevation stops water climbing', () => {
    const l = mk(['~~~~', 'IccF'], { elevation: true }, [], { height: [9, 9, 9, 9, 8, 7, 8, 1] })
    const w = flow(l, [], [false, false, false, false, true, false, false, false], 5)
    expect(w[5]).toBe(true); expect(w[6]).toBe(false); expect(w[7]).toBe(false)
  })

  it('basins conduct only when the rules say so, and soak needs turns of standing water', () => {
    const rows = ['~~~~', 'IFF.']
    const dry = flow(mk(rows, {}, []), [], [false, false, false, false, true, false, false, false], 4)
    expect(dry[5]).toBe(true); expect(dry[6]).toBe(false)
    const l = mk(rows, { conduct: true, soak: 2 }, [])
    let s = step(l, initialState(l), -1)!
    expect(s.soak).toEqual([1, 0])
    s = step(l, s, -1)!
    expect(s.soak).toEqual([2, 1]); expect(isWon(l, s)).toBe(false)
    s = step(l, s, -1)!
    expect(isWon(l, s)).toBe(true)
  })

  it('silted sluices move only once', () => {
    const l = mk(['~~~', 'IGF'], { gateUses: 1 }, [false])
    const s = step(l, initialState(l), 0)!
    expect(s.open[0]).toBe(true)
    expect(step(l, s, 0)).toBeNull()
  })
})

describe('irrigation levels', () => {
  it('every config × difficulty × seed is winnable in time, needs sluice work, and stays short', () => {
    let worst = 0
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const tier = tierFor(d, CONFIGS[id].rules)
      const shapes = new Set<string>()
      let atTarget = 0
      for (const seed of SEEDS) {
        const t0 = performance.now()
        const l = generate(CONFIGS[id], d, seed)
        worst = Math.max(worst, performance.now() - t0)
        const tag = `${id} d${d} s${seed}`
        const found = search(l, initialState(l), l.turns)
        expect(found, tag).not.toBeNull()
        const end = playPlan(l, found!.plan)!
        expect(isWon(l, end), tag).toBe(true)
        expect(found!.plan.length, tag).toBeLessThanOrEqual(l.turns)
        expect(l.turns, tag).toBe(l.minTurns + tier.slack)
        // 1–3 minute budget: never more than 14 turns.
        expect(l.turns, tag).toBeLessThanOrEqual(14)
        // Waiting alone loses.
        expect(isWon(l, playPlan(l, new Array(l.turns).fill(-1))!), tag).toBe(false)
        expect(l.minActs, tag).toBeGreaterThanOrEqual(Math.max(2, tier.minActs - 1))
        if (l.minActs >= tier.minActs) atTarget++
        expect(l.gates.length).toBe(tier.gates)
        expect(l.rows * l.cols).toBe(tier.rows * tier.cols)
        shapes.add(l.cells.join(','))
      }
      expect(atTarget, `${id} d${d} at target`).toBeGreaterThanOrEqual(2)
      expect(shapes.size, `${id} d${d} variety`).toBeGreaterThanOrEqual(6)
    }
    expect(worst).toBeLessThan(4000)
  }, 120_000)

  it('is deterministic per seed', () => {
    for (const id of CONFIG_IDS) {
      expect(generate(CONFIGS[id], 2, 42).cells).toEqual(generate(CONFIGS[id], 2, 42).cells)
    }
  })
})

describe('irrigation component', () => {
  const gate = (c: HTMLElement, g: number) => c.querySelector(`[data-gate="${g}"]`)!
  const wait = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('[data-testid="irr-wait"]')

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(IrrigationGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      const t = tierFor(d, CONFIGS[id].rules)
      expect(container.querySelectorAll('[data-cell]').length).toBe(t.rows * t.cols)
      expect(container.querySelectorAll('[data-gate]').length).toBe(t.gates)
      unmount()
    }
  }, 60_000)

  it('accepts title and intro overrides', () => {
    const { getByText } = render(createElement(IrrigationGame, { configId: 'egypt', difficulty: 1, seed: 1, params: { title: 'Custom Basin', intro: 'Hello' }, onWin: () => {}, onLose: () => {} }))
    expect(getByText('Custom Basin')).toBeTruthy()
  })

  it('playing the solver plan wins once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(IrrigationGame, { configId: id, difficulty: d, seed: 11, onWin, onLose }))
      const l = generate(CONFIGS[id], d, 11)
      for (const a of search(l, initialState(l), l.turns)!.plan) {
        if (a < 0) fireEvent.click(wait(container)!)
        else fireEvent.click(gate(container, a))
      }
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  }, 60_000)

  it('just waiting loses once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(IrrigationGame, { configId: id, difficulty: d, seed: 5, onWin, onLose }))
      for (let k = 0; k < 20 && wait(container); k++) fireEvent.click(wait(container)!)
      // Clicks after the end are ignored.
      fireEvent.click(gate(container, 0))
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  }, 60_000)
})
