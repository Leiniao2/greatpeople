// Gear Train: the train arithmetic is right, every config × difficulty × seed
// has a hidden solution that the box can build and that passes the check,
// puzzles stay within the size budget, and the component wins/loses once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import GearsGame, {
  CONFIGS, CONFIG_IDS, generate, checkTrain, trainRatio, trainReach, outputDir, axleSpeeds, usedGears, boxAllows,
  solveSlots, motionSolutions, type Puzzle,
} from '@/components/minigames/GearsGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 99, 1006, 31337]

describe('gear arithmetic', () => {
  it('computes ratio, direction, reach and speeds', () => {
    expect(trainRatio([[20], [10]])).toEqual([2, 1])
    expect(trainRatio([[10], [40, 10], [30]])).toEqual([1, 12])
    expect(outputDir([[20], [10]])).toBe(-1)
    expect(outputDir([[20], [16], [10]])).toBe(1)
    expect(trainReach([[20], [16], [10]])).toBe(31)
    expect(axleSpeeds([[20], [10]])).toEqual([1, -2])
    expect(trainRatio([[20], [null]])).toBeNull()
  })

  it('motion-work solutions are coaxial and reduce correctly', () => {
    for (const [A, B, C] of motionSolutions(8, 12)) {
      expect(8 + A).toBe(B + C)
      expect(trainRatio([[8], [A, B], [C]])).toEqual([1, 12])
    }
    expect(motionSolutions(8, 12).length).toBeGreaterThan(0)
  })
})

const budget: Record<string, (p: Puzzle, d: Difficulty) => void> = {
  'water-mill': (p, d) => { expect(p.solution.length - 1).toBe([2, 3, 4, 5][d - 1]); expect(p.reach).toBeGreaterThan(0) },
  'clock-train': (p, d) => {
    expect(p.solution.length - 1).toBeLessThanOrEqual([2, 3, 4, 5][d - 1])
    expect(p.box.reduce((a, b) => a + (b.count ?? 0), 0)).toBeLessThanOrEqual(16)
    expect(Math.max(...p.ratio)).toBeLessThanOrEqual(64)
    if (d >= 2) expect(p.dir).not.toBeNull()
  },
  'motion-work': (p, d) => { expect(p.ratio[0]).toBe(1); expect(p.ratio[1]).toBeGreaterThanOrEqual([3, 4, 6, 12][d - 1]) },
  antikythera: (p, d) => {
    const gaps = p.start.flat().filter(g => g == null).length
    expect(gaps).toBe([1, 1, 2, 3][d - 1])
    expect(p.box.length).toBeLessThanOrEqual(10)
  },
}

describe('gear puzzles', () => {
  for (const id of CONFIG_IDS) for (const d of DIFFS) {
    it(`${id} d${d}: hidden solution passes, fits the box and the budget`, () => {
      const seen = new Set<string>()
      for (const seed of SEEDS) {
        const p = generate(CONFIGS[id], d, seed)
        expect(p.kind).toBe(CONFIGS[id].kind)
        expect(checkTrain(p, p.solution), `${id} d${d} s${seed}`).toEqual([])
        expect(boxAllows(p.box, usedGears(p.start, p.solution, p.mode))).toBe(true)
        expect(p.solution.length).toBeLessThanOrEqual(p.maxAxles)
        expect(p.mistakes).toBe([3, 3, 2, 2][d - 1])
        // Not already solved at the start.
        expect(checkTrain(p, p.start).length).toBeGreaterThan(0)
        budget[CONFIGS[id].kind](p, d)
        if (p.mode === 'slots') {
          const sols = solveSlots(p)
          expect(sols.length).toBeGreaterThan(0)
          expect(sols.length, 'few fillings fit — it is a deduction').toBeLessThanOrEqual(3)
        }
        seen.add(JSON.stringify([p.start, p.ratio, p.box]))
      }
      expect(seen.size, 'seeds vary').toBeGreaterThanOrEqual(SEEDS.length - 2)
    })
  }

  it('rejects wrong trains for the right reasons', () => {
    const p = generate(CONFIGS['water-mill'], 2, 5)
    const wrongDir = [...p.solution.slice(0, -1), [p.solution[1][0]!], p.solution[p.solution.length - 1]]
    expect(checkTrain(p, wrongDir).length).toBeGreaterThan(0)
    const m = generate(CONFIGS['motion-work'], 3, 5)
    const [, [A, B], [C]] = m.solution
    expect(checkTrain(m, [[m.input], [A, B], [C! + 1]]).length).toBeGreaterThan(0)
  })
})

describe('gears component', () => {
  const q = (c: HTMLElement, sel: string) => c.querySelector<HTMLButtonElement>(sel)!

  function play(c: HTMLElement, p: Puzzle) {
    if (p.mode === 'build') {
      for (const axle of p.solution.slice(1)) {
        fireEvent.click(q(c, `[data-box="${axle[0]}"]`))
        if (axle.length > 1) {
          fireEvent.click(q(c, '[data-testid="gears-stack"]'))
          fireEvent.click(q(c, `[data-box="${axle[1]}"]`))
        }
      }
    } else {
      p.start.forEach((a, k) => a.forEach((g, j) => {
        if (g != null) return
        fireEvent.click(q(c, `[data-gear="${k}-${j}"]`))
        fireEvent.click(q(c, `[data-box="${p.solution[k][j]}"]`))
      }))
    }
  }

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(GearsGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      const p = generate(CONFIGS[id], d, 3)
      expect(container.querySelectorAll('[data-gear]').length).toBe(p.start.flat().length)
      expect(container.querySelectorAll('[data-box]').length).toBe(p.box.length)
      unmount()
    }
  })

  it('uses params overrides for title and intro', () => {
    const { container } = render(createElement(GearsGame, { configId: 'antikythera', difficulty: 1, seed: 1, params: { title: 'Hipparchus’ Workshop', intro: 'Mend it.' }, onWin: () => {}, onLose: () => {} }))
    expect(container.textContent).toContain('Hipparchus’ Workshop')
    expect(container.textContent).toContain('Mend it.')
  })

  it('building the solution and engaging wins once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const seed of [11, 12]) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(GearsGame, { configId: id, difficulty: d, seed, onWin, onLose }))
      const p = generate(CONFIGS[id], d, seed)
      play(container, p)
      expect(container.querySelectorAll('[data-gear]').length).toBe(p.solution.flat().length)
      fireEvent.click(q(container, '[data-testid="gears-engage"]'))
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d} s${seed}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('engaging a wrong train loses once at the mistake cap', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(GearsGame, { configId: id, difficulty: d, seed: 4, onWin, onLose }))
      const p = generate(CONFIGS[id], d, 4)
      for (let k = 0; k < p.mistakes + 2; k++) {
        const btn = container.querySelector<HTMLButtonElement>('[data-testid="gears-engage"]')
        if (btn) fireEvent.click(btn)
      }
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })
})
