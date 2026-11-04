// Wall Builder: every config × difficulty × seed plans a wall whose builder
// solution replays to a win within the stone budget; each variant's rule
// bites; and the component wins / loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import WallBuilderGame, {
  CONFIG_IDS, CONFIGS, planWall, applyMove, rejectStone, statusOf, legalMoves, land, rotate, columnHeights,
  countGaps, flawsOf, STONE_BUDGET, DIMS, EMPTY, STONE, type Plan, type WallState, type Site,
} from '@/components/minigames/WallBuilderGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006, 99991, 123456]

function replay(plan: Plan): WallState {
  let s = plan.start
  for (const m of plan.solution) {
    const n = applyMove(plan, s, m.rot, m.col)
    expect(n).not.toBeNull()
    s = n!
  }
  return s
}

describe('wall builder rules', () => {
  const site: Site = { W: 4, H: 3, gate: Array(12).fill(false), spread: null, checker: false }
  const grid = () => Array(12).fill(EMPTY)

  it('drops straight down, counts gaps under overhangs, refuses stones above the line', () => {
    const g = grid()
    g[0] = STONE // (0,0)
    const l = land(site, g, rotate([{ r: 0, c: 0, k: 0 }, { r: 0, c: 1, k: 0 }], 0), 0)!
    expect(l.y).toBe(1)
    for (const p of l.cells) g[p.r * 4 + p.c] = STONE
    expect(countGaps(site, g)).toBe(1)
    expect(columnHeights(site, g)).toEqual([2, 2, 0, 0])
    const tall = land(site, g, rotate([{ r: 0, c: 0, k: 0 }, { r: 0, c: 1, k: 0 }], 1), 0)!
    expect(tall.legal).toBe(false)
    expect(tall.reason).toBe('too-high')
    expect(land(site, g, [{ r: 0, c: 0, k: 0 }, { r: 0, c: 1, k: 0 }], 3)).toBeNull()
  })

  it('gates and formwork refuse drops; opus counts mismatched faces', () => {
    const gs: Site = { ...site, gate: site.gate.map((_, i) => i === 1 || i === 5) }
    expect(land(gs, grid(), [{ r: 0, c: 0, k: 0 }], 1)!.reason).toBe('gate')
    // A lintel resting on a two-high pier spans the gate.
    const g = grid(); g[0] = STONE; g[4] = STONE
    const lintel = land(gs, g, [{ r: 0, c: 0, k: 0 }, { r: 0, c: 1, k: 0 }], 0)!
    expect(lintel.legal).toBe(true)
    const fw: Site = { ...site, spread: 1 }
    expect(land(fw, grid(), rotate([{ r: 0, c: 0, k: 0 }, { r: 0, c: 1, k: 0 }], 1), 0)!.reason).toBe('formwork')

    const plan = planWall('opus-reticulatum', 1, 5)
    const s0 = plan.start
    // Find a drop whose faces disagree with the net, and check it costs a flaw.
    let found = false
    for (const m of legalMoves(plan, s0)) {
      const n = applyMove(plan, s0, m.rot, m.col)!
      if (n.mismatches > 0) { expect(flawsOf(n)).toBeGreaterThan(0); found = true; break }
    }
    expect(found).toBe(true)
  })

  it('rejects are limited and running out of stones loses', () => {
    const plan = planWall('hadrian', 4, 9)
    let s = plan.start
    for (let i = 0; i < plan.rejects; i++) s = rejectStone(plan, s)!
    expect(rejectStone(plan, s)).toBeNull()
    expect(statusOf(plan, { ...s, next: plan.sequence.length }).kind).toBe('lost')
  })
})

describe('wall builder plans', () => {
  it('every config × difficulty × seed is winnable within the stone budget', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const seed of SEEDS) {
      const plan = planWall(id, d, seed)
      expect(plan.site.W).toBe(DIMS[d].W)
      expect(plan.solution.length).toBeLessThanOrEqual(STONE_BUDGET[d])
      expect(plan.solution.length).toBeGreaterThanOrEqual(4)
      expect(plan.sequence.length).toBe(plan.solution.length + plan.spares)
      const end = replay(plan)
      expect(flawsOf(end)).toBe(0)
      expect(statusOf(plan, end).kind).toBe('won')
      expect(statusOf(plan, plan.start).kind).toBe('playing')
      if (CONFIGS[id].rule === 'gates') expect(plan.site.gate.some(Boolean)).toBe(true)
      if (CONFIGS[id].rule === 'bedrock') expect(plan.start.grid.some(x => x !== EMPTY)).toBe(true)
    }
  })

  it('is deterministic per seed and varies across an arcade ladder', () => {
    expect(planWall('inca-ashlar', 3, 77)).toEqual(planWall('inca-ashlar', 3, 77))
    const seen = new Set<string>()
    for (let i = 0; i < 24; i++) {
      const id = CONFIG_IDS[(i % 4 + Math.floor(i / 4)) % 4]
      const d = (Math.min(3, Math.floor(i / 6)) + 1) as Difficulty
      const p = planWall(id, d, 1000 + i)
      seen.add(JSON.stringify([p.sequence.map(s => s.shape), p.start.grid, p.site.gate]))
    }
    expect(seen.size).toBe(24)
  })

  it('harder walls use more stones, show fewer ahead, allow fewer flaws', () => {
    const avg = (d: Difficulty) => SEEDS.reduce((a, s) => a + planWall('hadrian', d, s).solution.length, 0) / SEEDS.length
    expect(avg(1)).toBeLessThan(avg(2))
    expect(avg(2)).toBeLessThan(avg(4))
    expect(planWall('great-wall', 1, 1).preview).toBeGreaterThan(planWall('great-wall', 4, 1).preview)
    for (const id of CONFIG_IDS) expect(planWall(id, 1, 1).maxFlaws).toBeGreaterThan(planWall(id, 4, 1).maxFlaws)
  })
})

function aimKeys(plan: Plan, s: WallState, rot: number, col: number) {
  for (let i = 0; i < rot; i++) fireEvent.keyDown(window, { key: 'ArrowUp' })
  for (let i = 0; i < plan.site.W; i++) fireEvent.keyDown(window, { key: 'ArrowLeft' })
  for (let i = 0; i < col; i++) fireEvent.keyDown(window, { key: 'ArrowRight' })
  void s
}

describe('WallBuilderGame component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(WallBuilderGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByTestId('wall-stones')).toBeTruthy()
      expect(screen.getAllByTestId('wall-preview').length).toBe(planWall(id, d, 3).preview)
      cleanup()
    }
  })

  it('the builder solution played through the keys calls onWin once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const plan = planWall(id, 2, 11)
      render(createElement(WallBuilderGame, { configId: id, difficulty: 2, seed: 11, onWin, onLose }))
      let s = plan.start
      for (const m of plan.solution) {
        act(() => { aimKeys(plan, s, m.rot, m.col) })
        act(() => { fireEvent.keyDown(window, { key: ' ' }) })
        s = applyMove(plan, s, m.rot, m.col)!
      }
      act(() => { fireEvent.keyDown(window, { key: ' ' }) })
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('leaving gaps everywhere calls onLose once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const plan = planWall('inca-ashlar', 3, 5)
    render(createElement(WallBuilderGame, { configId: 'inca-ashlar', difficulty: 3, seed: 5, onWin, onLose }))
    let s = plan.start
    for (let turn = 0; turn < 40 && statusOf(plan, s).kind === 'playing'; turn++) {
      const moves = legalMoves(plan, s)
      if (!moves.length) { act(() => { fireEvent.keyDown(window, { key: 'x' }) }); s = rejectStone(plan, s)!; continue }
      // The clumsiest mason: whichever drop leaves the most gaps.
      const worst = moves.map(m => ({ m, n: applyMove(plan, s, m.rot, m.col)! })).sort((a, b) => b.n.gaps - a.n.gaps)[0]
      act(() => { aimKeys(plan, s, worst.m.rot, worst.m.col) })
      act(() => { fireEvent.keyDown(window, { key: ' ' }) })
      s = worst.n
    }
    expect(statusOf(plan, s).kind).toBe('lost')
    act(() => { fireEvent.keyDown(window, { key: ' ' }) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
