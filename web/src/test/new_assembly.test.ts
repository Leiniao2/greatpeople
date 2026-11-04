import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Difficulty } from '@/games/types'
import AssemblyGame, {
  CONFIGS, CONFIG_IDS, makeLevel, bestBalance, fordCheck, stationLoads, shortestLine, isSubseq, arsenalCheck,
  makespan, bestOrder, weave, fewestHoles, holes, jacquardCheck, mistakesFor, secondsFor, type Level,
} from '@/components/minigames/AssemblyGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 4, 5, 6]

afterEach(() => { cleanup(); vi.useRealTimers() })
const level = (id: string, d: Difficulty, s: number) => makeLevel(id, CONFIGS[id].mode, d, s)

describe('Assembly Line — solvers', () => {
  it('line balancing respects precedence', () => {
    // Job 2 needs job 1, job 1 needs job 0: on two stations the 5 can't pair with the 1.
    expect(bestBalance([1, 5, 1], [[], [0], [1]], 2).pace).toBe(6)
    expect(bestBalance([1, 5, 1], [[], [], []], 2).pace).toBe(5)
  })
  it('shortest common supersequence', () => {
    const line = shortestLine([[0, 1, 2], [1, 2, 0]], 3)
    expect(line).toHaveLength(4)
    expect(isSubseq([0, 1, 2], line) && isSubseq([1, 2, 0], line)).toBe(true)
  })
  it('flow shop: Johnson’s classic two-machine example', () => {
    const t = [[3, 2], [1, 4]]
    expect(makespan(t, [0, 1])).toBe(9)
    expect(bestOrder(t)).toEqual({ span: 7, order: [1, 0] })
  })
  it('a thread rises if any of its hooks is punched', () => {
    const ties = [[0], [0, 1], [1]]
    expect(weave(ties, [true, false])).toEqual([true, true, false])
    expect(fewestHoles(ties, 2, [true, true, true])).toEqual([true, true])
    expect(fewestHoles(ties, 2, [true, false, true])).toBeNull()
  })
})

const score = (L: Level) =>
  L.kind === 'ford' ? Math.max(...stationLoads(L, L.solution)) :
  L.kind === 'arsenal' ? L.solution.length :
  L.kind === 'wedgwood' ? makespan(L.times, L.solution) : holes(L.solution)

describe('Assembly Line — every level is winnable and sized', () => {
  it('every config × difficulty × seed: the known solution passes at the optimum', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const s of SEEDS) {
      const L = level(id, d, s)
      const tag = `${id}@${d}#${s}`
      expect(score(L), tag).toBe(L.optimum)
      expect(L.optimum, tag).toBeLessThanOrEqual(L.target)
      if (L.kind === 'ford') { expect(fordCheck(L, L.solution), tag).toBeNull(); expect(L.times.length).toBeLessThanOrEqual(9) }
      if (L.kind === 'arsenal') { expect(arsenalCheck(L, L.solution), tag).toBeNull(); expect(L.target).toBeLessThanOrEqual(14) }
      if (L.kind === 'wedgwood') { expect(bestOrder(L.times).span).toBe(L.optimum); expect(L.times.length).toBeLessThanOrEqual(7) }
      if (L.kind === 'jacquard') { expect(jacquardCheck(L, L.solution), tag).toBeNull(); expect(L.pattern.length * L.hooks).toBeLessThanOrEqual(35) }
    }
  }, 60_000)
  it('D4 targets are the exact optimum, and timers stay within three minutes', () => {
    for (const id of CONFIG_IDS) { const L = level(id, 4, 1); expect(L.target, id).toBe(L.optimum) }
    for (const d of DIFFS) expect(secondsFor(d)).toBeLessThanOrEqual(180)
  })
  it('levels vary with the seed', () => {
    for (const id of CONFIG_IDS) {
      const seen = new Set(SEEDS.map(s => JSON.stringify(level(id, 3, s))))
      expect(seen.size, id).toBe(SEEDS.length)
    }
  })
})

function play(container: HTMLElement, L: Level) {
  const q = (sel: string) => fireEvent.click(container.querySelector(sel)!)
  if (L.kind === 'ford') L.solution.forEach((s, j) => { q(`[data-job="${j}"]`); q(`[data-station="${s}"]`) })
  if (L.kind === 'arsenal') L.solution.forEach(c => q(`[data-store="${c}"]`))
  if (L.kind === 'wedgwood') {
    const order = L.times.map((_, j) => j)
    L.solution.forEach((pot, k) => {
      const p = order.indexOf(pot)
      if (p === k) return
      q(`[data-pos="${k}"]`); q(`[data-pos="${p}"]`);
      [order[k], order[p]] = [order[p], order[k]]
    })
  }
  if (L.kind === 'jacquard') L.solution.forEach((card, r) => card.forEach((on, h) => { if (on) q(`[data-hole="${r}-${h}"]`) }))
  q('[data-testid="run"]')
}

describe('Assembly Line — component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const L = level(id, d, 2)
      const { container } = render(createElement(AssemblyGame, { configId: id, difficulty: d, seed: 2, onWin: () => {}, onLose: () => {} }))
      const sel = { ford: '[data-job]', arsenal: '[data-store]', wedgwood: '[data-pot]', jacquard: '[data-hole]' }[L.kind]
      const want = L.kind === 'ford' ? L.times.length : L.kind === 'arsenal' ? L.stores : L.kind === 'wedgwood' ? L.times.length : L.pattern.length * L.hooks
      expect(container.querySelectorAll(sel).length, `${id}@${d}`).toBe(want)
      cleanup()
    }
  })

  it('setting up the known solution and running wins exactly once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of [1, 4] as Difficulty[]) {
      const L = level(id, d, 6)
      const onWin = vi.fn(), onLose = vi.fn()
      const { container } = render(createElement(AssemblyGame, { configId: id, difficulty: d, seed: 6, onWin, onLose }))
      play(container, L)
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin, `${id}@${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('running a broken line too often loses exactly once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) {
      const d: Difficulty = 3
      const onWin = vi.fn(), onLose = vi.fn()
      const { getByTestId } = render(createElement(AssemblyGame, { configId: id, difficulty: d, seed: 4, onWin, onLose }))
      // Untouched: no stations, an empty canal, the arrival order, blank cards.
      for (let k = 0; k < mistakesFor(d) + 2; k++) fireEvent.click(getByTestId('run'))
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onLose, id).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('running out of time loses exactly once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(AssemblyGame, { configId: 'jacquard', difficulty: 2, seed: 1, onWin, onLose }))
    act(() => { vi.advanceTimersByTime((secondsFor(2) + 1) * 1000) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
