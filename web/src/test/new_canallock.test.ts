// Canal Locks: the gate/paddle/cradle rules, every config × difficulty × seed
// is solver-verified within its par band and cap, and the component wins and
// loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import CanalLockGame, {
  CONFIG_IDS, PAR_BANDS, apply, allActions, solve, isSolved, makeInstance, capFor, levelOf,
  type Action, type CanalState, type Instance, type Site, type Boat,
} from '@/components/minigames/CanalLockGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 7, 42, 1006]

function mini(kinds: Site['kind'][], caps: number[], boats: Boat[], lv: number[]) {
  let level = 0
  const sites: Site[] = kinds.map((kind, i) => {
    const lo = level, hi = kind === 'chamber' ? lo + 1 : kind === 'plane' ? lo + 2 : lo
    level = hi
    return { kind, cap: caps[i], lo, hi }
  })
  const start: CanalState = { lv, pos: boats.map(b => (b.up ? 0 : (sites.length - 1) * 2)), water: 0 }
  return { sites, boats, start, winchCost: 3, waterBudget: null as number | null }
}

function replay(inst: Pick<Instance, 'sites' | 'boats' | 'winchCost'>, start: CanalState, path: Action[]) {
  let s = start, cost = 0
  for (const a of path) {
    const r = apply(inst, s, a)
    expect(r.ok).toBe(true)
    if (r.ok) { s = r.state; cost += r.cost }
  }
  return { s, cost }
}

describe('canal lock rules', () => {
  it('a boat passes a gate only when the water is level; a fill costs a lockful', () => {
    const inst = mini(['reach', 'chamber', 'reach'], [0, 1, 0], [{ up: true, size: 1, label: 'A' }], [0, 1, 0])
    const bad = apply(inst, inst.start, { t: 'boat', b: 0, d: 1 })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.mistake).toBe(true)
    const drained = apply(inst, inst.start, { t: 'paddle', g: 0 })
    expect(drained.ok && drained.state.lv[1]).toBe(0)
    const s1 = (drained as { state: CanalState }).state
    const inLock = apply(inst, s1, { t: 'boat', b: 0, d: 1 }) as { ok: true; state: CanalState }
    expect(inLock.ok).toBe(true)
    const filled = apply(inst, inLock.state, { t: 'paddle', g: 1 }) as { ok: true; state: CanalState }
    expect(filled.state.water).toBe(1)
    expect(levelOf(inst, filled.state, 1)).toBe(1)
    const out = apply(inst, filled.state, { t: 'boat', b: 0, d: 1 }) as { ok: true; state: CanalState }
    expect(isSolved(inst, out.state)).toBe(true)
    expect(solve(inst)!.cost).toBe(4)
  })

  it('staircase chambers empty only into an empty chamber below, without spending water', () => {
    const inst = mini(['reach', 'chamber', 'chamber', 'reach'], [0, 1, 1, 0], [], [0, 1, 1, 0])
    const over = apply(inst, inst.start, { t: 'paddle', g: 1 })
    expect(!over.ok && over.mistake).toBe(true)
    const low = { ...inst.start, lv: [0, 0, 1, 0] }
    const ok = apply(inst, low, { t: 'paddle', g: 1 }) as { ok: true; state: CanalState }
    expect(ok.state.lv).toEqual([0, 1, 0, 0])
    expect(ok.state.water).toBe(0)
    const empty = apply(inst, { ...inst.start, lv: [0, 0, 0, 0] }, { t: 'paddle', g: 1 })
    expect(!empty.ok && empty.mistake).toBe(true)
  })

  it('a chamber holds its capacity: a big ship fills a Panama chamber alone', () => {
    const boats = [{ up: true, size: 2, label: 'A' }, { up: true, size: 1, label: 'B' }]
    const inst = mini(['reach', 'chamber', 'reach'], [0, 2, 0], boats, [0, 0, 0])
    const s = (apply(inst, inst.start, { t: 'boat', b: 0, d: 1 }) as { state: CanalState }).state
    const full = apply(inst, s, { t: 'boat', b: 1, d: 1 })
    expect(!full.ok && !full.mistake).toBe(true)
  })

  it('inclined-plane hauls are free when the descending cradle is heavier, else the winch costs 3', () => {
    const boats = [{ up: true, size: 1, label: 'A' }, { up: false, size: 1, label: 'P' }]
    const inst = mini(['reach', 'plane', 'reach'], [0, 1, 0], boats, [0, 1, 0]) // cradle 0 at the top
    const a = apply(inst, inst.start, { t: 'boat', b: 0, d: 1 }) as { ok: true; state: CanalState }
    expect(a.state.pos[0]).toBe(3) // site 1, cradle 1 (at the bottom)
    const winch = apply(inst, a.state, { t: 'haul', s: 1 }) as { ok: true; cost: number }
    expect(winch.cost).toBe(3)
    const p = apply(inst, a.state, { t: 'boat', b: 1, d: -1 }) as { ok: true; state: CanalState }
    const free = apply(inst, p.state, { t: 'haul', s: 1 }) as { ok: true; cost: number }
    expect(free.cost).toBe(1)
    expect(solve(inst)!.cost).toBe(5)
  })
})

describe('canal lock instances', () => {
  it('every config × difficulty × seed is solvable, in its par band, under its cap and water budget', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const looks = new Set<string>()
      for (const seed of SEEDS) {
        const inst = makeInstance(id, d, seed)
        const [lo, hi] = PAR_BANDS[d]
        expect(inst.par, `${id} d${d} s${seed}`).toBeGreaterThanOrEqual(lo)
        expect(inst.par, `${id} d${d} s${seed}`).toBeLessThanOrEqual(hi)
        expect(inst.cap).toBe(capFor(d, inst.par))
        expect(inst.cap).toBeGreaterThan(inst.par)
        expect(isSolved(inst, inst.start)).toBe(false)
        // Story-themed configs without their own layout play the grand-canal rule.
        expect(inst.waterBudget !== null).toBe(!['canal-du-midi', 'panama', 'dutch-overtoom'].includes(id))
        const sol = solve(inst)!
        expect(sol.cost).toBe(inst.par)
        const { s, cost } = replay(inst, inst.start, sol.path)
        expect(cost).toBe(inst.par)
        expect(isSolved(inst, s)).toBe(true)
        if (inst.waterBudget !== null) expect(s.water).toBeLessThanOrEqual(inst.waterBudget)
        looks.add(JSON.stringify([inst.sites.map(x => x.kind + x.cap), inst.boats.map(b => `${b.up}${b.size}`), inst.start.lv]))
      }
      expect(looks.size, `${id} d${d} varies by seed`).toBeGreaterThan(1)
    }
  })

  it('the Grand Canal water budget really binds at D4 (one lockful less is unsolvable)', () => {
    const inst = makeInstance('grand-canal', 4, 3)
    expect(solve({ ...inst, waterBudget: inst.waterBudget! - 1 })).toBeNull()
  })
})

function clickAction(a: Action) {
  if (a.t === 'paddle') fireEvent.click(screen.getByTestId(`paddle-${a.g}`))
  else if (a.t === 'haul') fireEvent.click(screen.getByTestId(`haul-${a.s}`))
  else {
    act(() => { fireEvent.click(screen.getByTestId(`boat-${a.b}`)) })
    act(() => { fireEvent.click(screen.getByTestId(a.d === 1 ? 'boat-up' : 'boat-down')) })
    return
  }
}

describe('CanalLockGame component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(CanalLockGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByTestId('canal-moves').textContent).toContain('Moves 0')
      cleanup()
    }
  })

  for (const id of CONFIG_IDS) {
    it(`a solver-driven win calls onWin once (${id})`, () => {
      vi.useFakeTimers()
      const onWin = vi.fn(), onLose = vi.fn()
      const inst = makeInstance(id, 2, 11)
      render(createElement(CanalLockGame, { configId: id, difficulty: 2, seed: 11, onWin, onLose }))
      for (const a of solve(inst)!.path) clickAction(a)
      expect(screen.getByTestId('canal-done').textContent).toContain(`${inst.boats.length} / ${inst.boats.length}`)
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
    })
  }

  it('flooding gates too often calls onLose once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const inst = makeInstance('canal-du-midi', 3, 5)
    const bad = allActions(inst).find(a => { const r = apply(inst, inst.start, a); return !r.ok && r.mistake })!
    expect(bad).toBeTruthy()
    render(createElement(CanalLockGame, { configId: 'canal-du-midi', difficulty: 3, seed: 5, onWin, onLose }))
    for (let i = 0; i < inst.maxMistakes + 3; i++) clickAction(bad)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('wasting moves past the cap calls onLose once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const inst = makeInstance('dutch-overtoom', 1, 9)
    const plane = inst.sites.findIndex(s => s.kind === 'plane')
    render(createElement(CanalLockGame, { configId: 'dutch-overtoom', difficulty: 1, seed: 9, onWin, onLose }))
    for (let i = 0; i < inst.cap + 5; i++) act(() => { fireEvent.click(screen.getByTestId(`haul-${plane}`)) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('spending more water than the summit holds calls onLose once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const inst = makeInstance('grand-canal', 1, 4)
    render(createElement(CanalLockGame, { configId: 'grand-canal', difficulty: 1, seed: 4, onWin, onLose }))
    // Fill and drain the first chamber until the summit is dry.
    for (let i = 0; i < 2 * (inst.waterBudget! + 2); i++) act(() => { fireEvent.click(screen.getByTestId('paddle-0')); fireEvent.click(screen.getByTestId('paddle-1')) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
