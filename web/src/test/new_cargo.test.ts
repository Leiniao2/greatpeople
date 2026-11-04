// Cargo Hold: every config × difficulty × seed generates a hold whose known
// stowage satisfies that config's rule within the size budget; the rules
// reject wrong stowages; and the component wins/loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import CargoGame, {
  CONFIG_IDS, CONFIGS, planLevel, evaluate, transform, normalize, shapeKey, orientationFor, fitAt, makeHold, partition,
  type Puzzle, type Placement,
} from '@/components/minigames/CargoGame'
import { mulberry32 } from '@/components/minigames/_shared'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006, 99991, 123456]
// [min hold cells, max hold cells, min crates, max crates] per difficulty
const BUDGET: Record<Difficulty, [number, number, number, number]> = {
  1: [12, 13, 3, 4], 2: [19, 22, 3, 6], 3: [23, 26, 4, 7], 4: [26, 29, 4, 8],
}

function checkSolution(pz: Puzzle) {
  const seen = new Set<number>()
  for (const s of pz.solution) {
    for (const i of s.cells) {
      expect(pz.hold.inHull[i]).toBe(true)
      expect(seen.has(i)).toBe(false)
      seen.add(i)
    }
    // The placed shape is an orientation of the tray crate.
    expect(orientationFor(pz.hold, pz.pieces[s.pieceId], s.cells)).not.toBeNull()
    expect(pz.pieces[s.pieceId].decoy).toBe(false)
  }
}

describe('cargo shapes and holds', () => {
  it('rotations and flips give the right orientations', () => {
    const L = normalize([[0, 0], [1, 0], [2, 0], [2, 1]])
    const keys = new Set<string>()
    for (const f of [false, true]) for (let r = 0; r < 4; r++) keys.add(shapeKey(transform(L, r, f)))
    expect(keys.size).toBe(8)
    expect(shapeKey(transform(L, 4, false))).toBe(shapeKey(L))
    const sq = normalize([[0, 0], [0, 1], [1, 0], [1, 1]])
    expect(shapeKey(transform(sq, 1, true))).toBe(shapeKey(sq))
  })

  it('partition covers the hull exactly', () => {
    for (const d of DIFFS) for (const seed of SEEDS) {
      const rng = mulberry32(seed)
      const hold = makeHold(d, rng)
      const regions = partition(hold, rng, 3, 5)
      const cells = regions.flat().sort((a, b) => a - b)
      expect(cells.length).toBe(hold.count)
      expect(new Set(cells).size).toBe(hold.count)
    }
  })
})

describe('cargo puzzles', () => {
  it('every config × difficulty × seed is winnable by its known stowage, within budget', () => {
    const variety = new Set<string>()
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const seed of SEEDS) {
      const pz = planLevel(id, d, seed)
      const [cMin, cMax, pMin, pMax] = BUDGET[d]
      expect(pz.mode).toBe(CONFIGS[id].mode)
      expect(pz.hold.count).toBeGreaterThanOrEqual(cMin)
      expect(pz.hold.count).toBeLessThanOrEqual(cMax)
      expect(pz.solution.length).toBeGreaterThanOrEqual(pMin)
      expect(pz.solution.length).toBeLessThanOrEqual(pMax)
      expect(pz.cap).toBeGreaterThan(pz.solution.length)
      checkSolution(pz)
      const st = evaluate(pz, pz.solution)
      expect(st.won).toBe(true)
      expect(evaluate(pz, []).won).toBe(false)
      variety.add(pz.pieces.map(p => shapeKey(p.shape)).join('|'))
    }
    expect(variety.size).toBeGreaterThan(CONFIG_IDS.length * DIFFS.length * SEEDS.length * 0.9)
  })

  it('value: decoys are worse per square, so at D4 only the full spice set reaches the target', () => {
    for (const seed of SEEDS) {
      const pz = planLevel('voc-spice', 4, seed)
      const real = pz.pieces.filter(p => !p.decoy)
      const minReal = Math.min(...real.map(p => p.value / p.size))
      expect(pz.pieces.some(p => p.decoy)).toBe(true)
      for (const p of pz.pieces.filter(x => x.decoy)) expect(p.value / p.size).toBeLessThan(minReal)
      // Dropping any one crate falls short.
      for (let k = 0; k < pz.solution.length; k++) expect(evaluate(pz, pz.solution.filter((_, i) => i !== k)).won).toBe(false)
    }
  })

  it('balance: the known stowage is within trim; a lopsided partial load is not a win', () => {
    for (const d of DIFFS) for (const seed of SEEDS) {
      const pz = planLevel('hanse-cog', d, seed)
      expect(Math.abs(evaluate(pz, pz.solution).trim)).toBeLessThanOrEqual(pz.tol)
      expect(evaluate(pz, pz.solution.slice(1)).won).toBe(false)
    }
    // Tolerance tightens with difficulty on average.
    const avg = (d: Difficulty) => SEEDS.reduce((a, s) => { const p = planLevel('hanse-cog', d, s); return a + p.tol / p.pieces.reduce((x, c) => x + c.weight, 0) / p.hold.w }, 0)
    expect(avg(1)).toBeGreaterThan(avg(4))
  })

  it('fragile: porcelain and ballast exist; porcelain under a crate or ballast off the keel is flagged', () => {
    for (const d of DIFFS) for (const seed of SEEDS) {
      const pz = planLevel('zheng-he', d, seed)
      expect(pz.pieces.filter(p => p.kind === 'fragile').length).toBe(d <= 2 ? 1 : 2)
      expect(pz.pieces.filter(p => p.kind === 'ballast').length).toBe([0, 1, 1, 2][d - 1])
    }
    // Hand-built: 1-wide column of 2, porcelain at bottom, silk on top → flagged.
    const pz = planLevel('zheng-he', 2, 1)
    const frag = pz.pieces.find(p => p.kind === 'fragile')!
    const other = pz.pieces.find(p => p.kind === 'normal')!
    const w = pz.hold.w
    const fakeFrag: Placement = { pieceId: frag.id, cells: [w + 2] }
    const fakeTop: Placement = { pieceId: other.id, cells: [2] }
    expect(evaluate(pz, [fakeFrag, fakeTop]).badFragile).toEqual([frag.id])
    const ball = pz.pieces.find(p => p.kind === 'ballast')!
    expect(evaluate(pz, [{ pieceId: ball.id, cells: [1] }]).badBallast).toEqual([ball.id])
  })

  it('speed: filling with too many crates is not a win', () => {
    for (const d of DIFFS) for (const seed of SEEDS) {
      const pz = planLevel('tea-clipper', d, seed)
      expect(pz.maxPieces).toBe(pz.solution.length + (d <= 2 ? 1 : 0))
      expect(pz.pieces.filter(p => p.decoy).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('fitAt lays a crate covering the tapped cell or refuses', () => {
    const pz = planLevel('hanse-cog', 3, 9)
    const s = pz.solution[0]
    const o = orientationFor(pz.hold, pz.pieces[s.pieceId], s.cells)!
    const shape = transform(pz.pieces[s.pieceId].shape, o.rot, o.flip)
    expect(fitAt(pz.hold, [], shape, s.cells[0])).toEqual(s.cells)
    expect(fitAt(pz.hold, [s], shape, s.cells[0])).toBeNull()
  })
})

function load(pz: Puzzle, s: Placement) {
  const o = orientationFor(pz.hold, pz.pieces[s.pieceId], s.cells)!
  act(() => { fireEvent.click(screen.getByTestId(`cargo-piece-${s.pieceId}`)) })
  if (o.flip) act(() => { fireEvent.click(screen.getByTestId('cargo-flip')) })
  for (let k = 0; k < o.rot; k++) act(() => { fireEvent.click(screen.getByTestId('cargo-rotate')) })
  act(() => { fireEvent.click(screen.getByTestId(`cargo-cell-${s.cells[0]}`)) })
}

describe('CargoGame component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(CargoGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByTestId('cargo-goal')).toBeTruthy()
      cleanup()
    }
  })

  it('a scripted stowage wins once, for every config', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const pz = planLevel(id, 4, 11)
      render(createElement(CargoGame, { configId: id, difficulty: 4, seed: 11, onWin, onLose }))
      for (const s of pz.solution) {
        if (screen.queryByTestId(`cargo-piece-${s.pieceId}`)) load(pz, s)
      }
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('loading and unloading until the lifts run out loses once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const pz = planLevel('hanse-cog', 2, 5)
    render(createElement(CargoGame, { configId: 'hanse-cog', difficulty: 2, seed: 5, onWin, onLose }))
    const s = pz.solution[0]
    load(pz, s)
    // Tapping the same square unloads (free, crate stays selected), then reloads (one lift).
    for (let k = 0; k < pz.cap * 2 + 4; k++) act(() => { fireEvent.click(screen.getByTestId(`cargo-cell-${s.cells[0]}`)) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
