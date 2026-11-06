// Summit Climb: every config × difficulty × seed generates a face the solver
// climbs without a fall; from D2 the naive "highest hold in reach" climber
// fails; the rules (reach, stamina, ledges, crumbling, falls to the anchor,
// pitons) behave; the 24 Arcade levels are all different faces; and the
// component wins and loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import ClimbGame, { CONFIG_IDS } from '@/components/minigames/ClimbGame'
import {
  MOUNTAINS, TIERS, REACH, makePuzzle, solve, greedy, initialState, move, fall, piton, canPiton, reachable, moveCost, dist, altitude,
  type Puzzle, type Hold, type HoldKind,
} from '@/components/minigames/climb/model'
import { levelFor, difficultyForLevel } from '@/games/arcade'
import type { GameKey } from '@/games/registry'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006, 99991, 123456]

/** A hand-built face: holds as [x, y, kind]; the last one is the summit. */
function face(spec: [number, number, HoldKind][], stamina = 6, extra: Partial<Puzzle> = {}): Puzzle {
  const holds: Hold[] = spec.map(([x, y, kind], id) => ({ id, x, y, kind }))
  return {
    mountain: 'mont-blanc', difficulty: 1, holds, bands: [], start: 0, summit: holds.length - 1,
    near: holds.map(a => holds.filter(b => b !== a && dist(a, b) <= REACH).map(b => b.id)),
    stamina, pitons: 1, falls: 1, seconds: 0, cracks: [], ...extra,
  }
}

describe('climb rules', () => {
  it('only holds within reach can be grabbed; moves cost stamina by length and climb', () => {
    const p = face([[0, 0, 'start'], [0, 2, 'hold'], [0, 5, 'hold'], [0, 4, 'summit']])
    const s = initialState(p)
    expect(reachable(p, s)).toEqual([1])
    expect(move(p, s, 2).event).toBeNull()                 // out of reach
    expect(moveCost(p, p.holds[0], p.holds[1])).toBe(3)     // 2 + 0.5 × 2
    expect(moveCost(p, p.holds[1], p.holds[0])).toBe(2)     // down: length only
    const r = move(p, s, 1)
    expect(r.event).toBe('moved')
    expect(r.state.stamina).toBe(3)
  })

  it('overhangs cost half as much again and ice two more', () => {
    const p = face([[0, 0, 'start'], [0, 2, 'ice'], [0, 4, 'summit']], 9, { bands: [{ y0: 3, y1: 5 }] })
    expect(moveCost(p, p.holds[0], p.holds[1])).toBe(5)
    expect(moveCost(p, p.holds[1], p.holds[2])).toBe(5)     // ceil(3 × 1.5)
  })

  it('too tiring a reach is a fall to the anchor; ledges refill and anchor', () => {
    const p = face([[0, 0, 'start'], [0, 2, 'hold'], [0, 4, 'ledge'], [0, 6, 'hold'], [0, 8, 'summit']], 4)
    let s = move(p, initialState(p), 1).state               // 4 - 3 = 1
    const f = move(p, s, 2)                                 // costs 3 > 1
    expect(f.event).toBe('fell')
    expect(f.state).toMatchObject({ at: 0, stamina: 4, falls: 0 })
    s = move(p, f.state, 1).state
    expect(fall(p, s).event).toBe('lost')                   // the rope has no falls left
    const p2 = face(p.holds.map(h => [h.x, h.y, h.kind] as [number, number, HoldKind]), 6)
    s = move(p2, move(p2, initialState(p2), 1).state, 2).state
    expect(s).toMatchObject({ at: 2, stamina: 6, anchor: 2 })
    s = move(p2, s, 3).state
    expect(move(p2, s, 4).event).toBe('summit')
  })

  it('loose holds crumble once left and cannot take a piton', () => {
    const p = face([[0, 0, 'start'], [0, 2, 'loose'], [1, 3, 'hold'], [1, 6, 'summit']], 12)
    let s = move(p, initialState(p), 1).state
    expect(canPiton(p, s)).toBe(false)
    s = move(p, s, 2).state
    expect(s.crumbled).toEqual([1])
    expect(reachable(p, s)).not.toContain(1)
    expect(move(p, s, 1).event).toBeNull()
  })

  it('a piton moves the anchor, for one stamina', () => {
    const p = face([[0, 0, 'start'], [0, 2, 'hold'], [0, 4, 'hold'], [0, 7, 'summit']], 8)
    let s = move(p, initialState(p), 1).state
    expect(canPiton(p, s)).toBe(true)
    s = piton(p, s)
    expect(s).toMatchObject({ anchor: 1, pitons: 0, stamina: 4 })
    expect(canPiton(p, s)).toBe(false)
    s = move(p, s, 2).state
    expect(fall(p, s).state).toMatchObject({ at: 1, stamina: 8 })
  })
})

describe('climb levels', () => {
  it('every config, tier and seed is climbable without a fall, and tall', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const seed of SEEDS) {
      const p = makePuzzle(id, d, seed)
      const path = solve(p)
      expect(path, `${id} D${d} #${seed}`).not.toBeNull()
      expect(p.holds[p.summit].y, `${id} D${d}`).toBeGreaterThanOrEqual(TIERS[d].height)
      expect(path!.length).toBeGreaterThanOrEqual(TIERS[d].height / 2)
    }
  })

  it('holds grow from dozens to 150+, and depth rises with the tier', () => {
    for (const id of CONFIG_IDS) {
      const ps = DIFFS.map(d => makePuzzle(id, d, 5))
      expect(ps[0].holds.length).toBeGreaterThanOrEqual(36)
      expect(ps[3].holds.length).toBeGreaterThanOrEqual(150)
      for (let i = 1; i < 4; i++) expect(ps[i].holds.length).toBeGreaterThan(ps[i - 1].holds.length)
      expect(ps[3].bands.length).toBeGreaterThan(0)
      expect(ps[3].holds.some(h => h.kind === 'ice')).toBe(true)
      expect(ps[0].holds.some(h => h.kind === 'ice')).toBe(false)
    }
  })

  it('from D2 the naive climber who always grabs the highest hold fails', () => {
    for (const id of CONFIG_IDS) for (const d of [2, 3, 4] as Difficulty[]) for (const seed of SEEDS) {
      expect(greedy(makePuzzle(id, d, seed)), `${id} D${d} #${seed}`).toBe(false)
    }
  })

  it('altitude runs from the foot of the face to the real summit height', () => {
    for (const id of CONFIG_IDS) {
      const p = makePuzzle(id, 2, 3)
      expect(altitude(p, 0)).toBe(MOUNTAINS[id].fromM)
      expect(altitude(p, p.holds[p.summit].y)).toBe(MOUNTAINS[id].toM)
    }
  })

  it('the 24 Arcade levels are 24 different faces', () => {
    const faces = new Set<string>()
    for (let i = 0; i < 24; i++) {
      const lv = levelFor('climb' as GameKey, CONFIG_IDS, i)
      expect(lv.difficulty).toBe(difficultyForLevel(i))
      const p = makePuzzle(lv.configId, lv.difficulty, lv.seed)
      expect(solve(p), `level ${i}`).not.toBeNull()
      faces.add(p.holds.map(h => `${h.x.toFixed(2)},${h.y.toFixed(2)}`).join(';'))
    }
    expect(faces.size).toBe(24)
  })
})

describe('climb component', () => {
  it('climbing the solver path wins exactly once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const p = makePuzzle('matterhorn', 2, 11)
    render(createElement(ClimbGame, { configId: 'matterhorn', difficulty: 2, seed: 11, onWin, onLose }))
    for (const id of solve(p)!) fireEvent.click(screen.getByLabelText(`Hold ${id}`))
    expect(screen.getByText(/On the summit/)).toBeTruthy()
    act(() => { vi.advanceTimersByTime(3000) })
    fireEvent.click(screen.getByLabelText(`Hold ${p.start}`))
    act(() => { vi.advanceTimersByTime(3000) })
    expect(onWin).toHaveBeenCalledTimes(1)
    expect(onLose).not.toHaveBeenCalled()
  })

  it('letting go more often than the rope holds loses exactly once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(ClimbGame, { configId: 'eiger', difficulty: 3, seed: 4, onWin, onLose }))
    const letGo = screen.getByText('Let go')
    for (let i = 0; i <= TIERS[3].falls + 2; i++) fireEvent.click(letGo)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('running out of time loses', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(ClimbGame, { configId: 'everest', difficulty: 4, seed: 2, onWin, onLose }))
    act(() => { vi.advanceTimersByTime((TIERS[4].seconds + 1) * 1000) })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(onLose).toHaveBeenCalledTimes(1)
  })
})
