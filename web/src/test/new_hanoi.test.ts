// Temple Disks: the solver matches the known optimal counts, every config ×
// difficulty × seed is solvable within its cap, and the component wins/loses once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import HanoiGame, {
  CONFIG_IDS, CONFIGS, generatePuzzle, solve, moveProblem, applyMove, isSolved, capFor, type HanoiPuzzle,
} from '@/components/minigames/HanoiGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006]

const tower = (pegs: number, disks: number, cyclic = false, goal = 1, adjacent = false, from = 0): HanoiPuzzle =>
  ({ pegs, disks, cyclic, adjacent, start: Array(disks).fill(from), goal, optimal: 0 })

describe('hanoi engine', () => {
  it('matches the known optimal move counts', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) expect(solve(tower(3, n)).length).toBe(2 ** n - 1)
    // Frame–Stewart numbers for four pegs.
    expect([4, 5, 6, 8].map(n => solve(tower(4, n)).length)).toEqual([9, 13, 17, 33])
    // One-way ring: one step clockwise / two steps clockwise.
    expect([1, 2, 3, 4].map(n => solve(tower(3, n, true, 1)).length)).toEqual([1, 5, 15, 43])
    expect([1, 2, 3, 4].map(n => solve(tower(3, n, true, 2)).length)).toEqual([2, 7, 21, 59])
    // Neighbours only: end to end is 3ⁿ − 1, end to middle half of that.
    expect([1, 2, 3, 4].map(n => solve(tower(3, n, false, 2, true)).length)).toEqual([2, 8, 26, 80])
    expect([1, 2, 3, 4].map(n => solve(tower(3, n, false, 1, true)).length)).toEqual([1, 4, 13, 40])
    expect(solve(tower(3, 3, false, 0, true, 1)).length).toBe(13)
  })

  it('enforces the rules', () => {
    const p = tower(3, 3)
    expect(moveProblem(p, p.start, 1, 2)).toMatch(/empty/)
    const s1 = applyMove(p.start, 0, 1)
    expect(moveProblem(p, s1, 0, 1)).toMatch(/larger/)
    const ring = tower(3, 2, true)
    expect(moveProblem(ring, ring.start, 0, 2)).toMatch(/clockwise/)
    expect(moveProblem(ring, ring.start, 0, 1)).toBeNull()
    const bridge = tower(3, 2, false, 2, true)
    expect(moveProblem(bridge, bridge.start, 0, 2)).toMatch(/neighbouring/)
    expect(moveProblem(bridge, bridge.start, 0, 1)).toBeNull()
    expect(moveProblem(bridge, applyMove(bridge.start, 0, 1), 1, 2)).toBeNull()
  })

  for (const id of CONFIG_IDS) for (const d of DIFFS) {
    it(`${id} d${d}: solvable within the cap for every seed`, () => {
      const starts = new Set<string>()
      for (const seed of SEEDS) {
        const p = generatePuzzle(id, d, seed)
        expect(p.disks).toBe(CONFIGS[id].disks[d - 1])
        expect(p.start.every(x => x >= 0 && x < p.pegs)).toBe(true)
        const sol = solve(p)
        expect(sol.length).toBe(p.optimal)
        let s = p.start
        for (const [f, t] of sol) { expect(moveProblem(p, s, f, t)).toBeNull(); s = applyMove(s, f, t) }
        expect(isSolved(p, s)).toBe(true)
        expect(p.optimal).toBeGreaterThan(0)
        expect(capFor(d, p.optimal)).toBeGreaterThan(p.optimal)
        starts.add(p.start.join('') + p.goal)
      }
      // The bridge's end-to-end journey has only two layouts (left→right, right→left).
      expect(starts.size, 'seeds give different layouts').toBeGreaterThanOrEqual(id === 'narrow-bridge' && d === 3 ? 2 : 3)
    })
  }

  it('fits the time budget: ~1 min at D1, never more than ~3 min at D4', () => {
    // About two seconds per move: D1 needs 9–22 optimal moves (real decisions,
    // under a minute), no level more than 65 (a 7-disk tower's 127 is too long).
    const maxMoves = [22, 35, 35, 45]
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const seed of SEEDS) {
      const p = generatePuzzle(id, d, seed)
      expect(p.optimal, `${id} d${d}`).toBeLessThanOrEqual(maxMoves[d - 1])
      if (d === 1) expect(p.optimal, `${id} d1`).toBeGreaterThanOrEqual(9)
      expect(p.disks).toBeLessThanOrEqual(p.pegs === 4 ? 8 : 6)
      expect(capFor(d, p.optimal)).toBeLessThanOrEqual(d === 1 ? 50 : 80)
    }
  })

  it('each config is a distinct rule variant', () => {
    const p = (id: string) => generatePuzzle(id, 2, 3)
    expect(p('reve').pegs).toBe(4)
    expect(p('prayer-wheel').cyclic).toBe(true)
    expect(p('narrow-bridge').adjacent).toBe(true)
    expect(p('benares').cyclic || p('benares').adjacent).toBe(false)
    // Scattered starts with disks on every peg; the others start as one tower.
    expect(new Set(p('scattered').start).size).toBe(3)
    for (const id of ['benares', 'reve', 'prayer-wheel', 'narrow-bridge']) expect(new Set(p(id).start).size).toBe(1)
    // The bridge's solution never jumps from end to end.
    for (const d of DIFFS) for (const [f, t] of solve(generatePuzzle('narrow-bridge', d, 5))) expect(Math.abs(f - t)).toBe(1)
    for (const d of DIFFS) for (const [f, t] of solve(generatePuzzle('prayer-wheel', d, 5))) expect(t).toBe((f + 1) % 3)
  })

  it('gets harder with difficulty', () => {
    for (const id of CONFIG_IDS) {
      const avg = (d: Difficulty) => SEEDS.reduce((a, s) => a + generatePuzzle(id, d, s).optimal, 0)
      expect(avg(4), id).toBeGreaterThan(avg(1))
      expect(avg(3), id).toBeGreaterThanOrEqual(avg(2))
    }
  })
})

function peg(container: HTMLElement, i: number) { return container.querySelector(`[data-peg="${i}"]`)! }

describe('HanoiGame component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container } = render(createElement(HanoiGame, { configId: id, difficulty: d, seed: 2, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelectorAll('[data-disk]').length).toBe(CONFIGS[id].disks[d - 1])
      cleanup()
    }
  })

  it('tapping out the optimal solution calls onWin once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const p = generatePuzzle('reve', 4, 9)
    const { container } = render(createElement(HanoiGame, { configId: 'reve', difficulty: 4, seed: 9, onWin, onLose }))
    for (const [f, t] of solve(p)) {
      act(() => { fireEvent.click(peg(container, f)) })
      act(() => { fireEvent.click(peg(container, t)) })
    }
    expect(screen.getByTestId('hanoi-moves').textContent).toMatch(new RegExp(`^${p.optimal} /`))
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onWin).toHaveBeenCalledTimes(1)
    expect(onLose).not.toHaveBeenCalled()
  })

  it('keyboard play works, illegal moves do not count, and dithering past the cap calls onLose once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const p = generatePuzzle('benares', 2, 4)
    const cap = capFor(2, p.optimal)
    render(createElement(HanoiGame, { configId: 'benares', difficulty: 2, seed: 4, onWin, onLose }))
    const a = p.start[0], b = (a + 1) % 3
    // Illegal: from an empty peg.
    act(() => { fireEvent.keyDown(window, { key: String(b + 1) }) })
    act(() => { fireEvent.keyDown(window, { key: String(b + 1) }) })
    expect(screen.getByTestId('hanoi-moves').textContent).toMatch(/^0 \//)
    // Shuttle the smallest disk back and forth.
    for (let k = 0; k < cap + 4; k++) {
      const [f, t] = k % 2 ? [b, a] : [a, b]
      act(() => { fireEvent.keyDown(window, { key: String(f + 1) }) })
      act(() => { fireEvent.keyDown(window, { key: String(t + 1) }) })
    }
    expect(screen.getByTestId('hanoi-moves').textContent).toMatch(new RegExp(`^${cap} /`))
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
