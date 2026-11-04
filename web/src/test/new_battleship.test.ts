// Naval Battle: the rules of fire, sinking, scouting, sonar and the moving
// fleet; every config × difficulty × seed is sunk within its salvo limit by a
// solver that reads only the player's view; the solver wins most fresh
// fleets while a gunner who ignores the config's clue (or sweeps row by row)
// loses most top-level battles; the component wins/loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import BattleshipGame, {
  CONFIGS, CONFIG_IDS, generate, tierFor, newGame, fire, scout, shipCells, xAt, burningNow, canFire, viewOf, chooseMove,
  solverShots, playOut, randomFleet, lineLayouts, lineCount, isWon, outcomeOf,
  type Level, type Ship, type Game, type Move,
} from '@/components/minigames/BattleshipGame'
import { mulberry32 } from '@/components/minigames/_shared'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006]

const ship = (id: number, len: number, r: number, c: number, horiz = true, dir: 1 | -1 = 1): Ship => ({ id, len, r, c, horiz, dir })
const lvl = (info: Level['info'], w: number, h: number, ships: Ship[], salvos = 30, scouts = 0): Level => ({ info, w, h, ships, salvos, scouts })

describe('naval battle rules', () => {
  it('hits, misses and sinkings', () => {
    const L = lvl('line', 5, 5, [ship(0, 2, 1, 1), ship(1, 3, 1, 3, false)])
    expect(shipCells(L, L.ships[1], 0)).toEqual([8, 13, 18])
    let g = newGame(L)
    g = fire(L, g, 6)
    expect(g.shots[0]).toMatchObject({ hit: true, sunk: null })
    expect(canFire(L, g, 6)).toBe(false)
    expect(fire(L, g, 6)).toBe(g)
    g = fire(L, g, 0)
    expect(g.shots[1].hit).toBe(false)
    g = fire(L, g, 7)
    expect(g.shots[2].sunk).toBe(0)
    expect(g.wreck[0]).toEqual([6, 7])
    for (const c of [8, 13, 18]) g = fire(L, g, c)
    expect(isWon(g)).toBe(true)
    expect(outcomeOf(L, g)).toBe('won')
  })

  it('running out of salvos loses, and nothing fires after the end', () => {
    const L = lvl('line', 4, 4, [ship(0, 2, 0, 0)], 2)
    let g = fire(L, newGame(L), 15)
    g = fire(L, g, 14)
    expect(outcomeOf(L, g)).toBe('lost')
    expect(canFire(L, g, 0)).toBe(false)
  })

  it('sonar: a miss pings the king-step range to the nearest ship afloat', () => {
    const L = lvl('sonar', 6, 6, [ship(0, 2, 0, 0), ship(1, 1, 5, 5)])
    let g = fire(L, newGame(L), 3 * 6 + 3)           // (3,3): (0,1) is 3 away, (5,5) is 2 away
    expect(g.shots[0].ping).toBe(2)
    g = fire(L, g, 35)                                // sink the 1-boat
    g = fire(L, g, 3 * 6 + 3 - 1)                     // (3,2): now only (0,1) counts → 3
    expect(g.shots[2].ping).toBe(3)
    expect(g.shots[1].ping).toBeNull()
  })

  it('scouts count ship squares in a row or column, and are limited', () => {
    const L = lvl('scout', 5, 5, [ship(0, 3, 0, 0), ship(1, 2, 2, 4, false)], 20, 2)
    expect(lineCount(L, 'r0')).toBe(3)
    expect(lineCount(L, 'c4')).toBe(2)
    expect(lineCount(L, 'c0')).toBe(1)
    let g = scout(L, newGame(L), 'r0')
    expect(g.scouted).toEqual([{ line: 'r0', count: 3 }])
    expect(scout(L, g, 'r0')).toBe(g)
    g = scout(L, g, 'c3')
    expect(scout(L, g, 'c1')).toBe(g)
    expect(g.shots.length).toBe(0)                    // scouting costs no salvo
  })

  it('moving fleet: one square a turn, turning about at the shore; hit squares burn and move', () => {
    const s = ship(0, 2, 0, 3, true, 1)
    expect([0, 1, 2, 3, 4, 5].map(t => xAt(s, 6, t))).toEqual([3, 4, 3, 2, 1, 0])
    expect([0, 1, 2].map(t => xAt(ship(0, 6, 0, 0), 6, t))).toEqual([0, 0, 0])
    const L = lvl('moving', 6, 3, [ship(0, 2, 1, 1, true, 1), ship(1, 2, 2, 0, true, -1)])
    let g = fire(L, newGame(L), 6 + 1)                // hit the stern of ship 0 at turn 0
    expect(g.shots[0].hit).toBe(true)
    expect(burningNow(L, g)).toEqual([6 + 2])         // it moved one square east
    expect(canFire(L, g, 8)).toBe(false)
    g = fire(L, g, 6 + 4)                             // turn 1: ship 0 is at 2–3, so 4 misses
    expect(g.shots[1].hit).toBe(false)
    expect(g.seen).toEqual([[], [8]])
    g = fire(L, g, 6 + 4)                             // turn 2: ship 0 at 3–4: its bow is hit → sunk
    expect(g.shots[2].sunk).toBe(0)
    expect(g.wreck[0]).toEqual([9, 10])
  })

  it('line of battle: every layout lies in one row or column', () => {
    const all = lineLayouts(5, 5, [3, 2])
    for (const L of all) {
      const cells = L.flat()
      const rows = new Set(cells.map(c => Math.floor(c / 5))), cols = new Set(cells.map(c => c % 5))
      expect(rows.size === 1 || cols.size === 1).toBe(true)
      expect(new Set(cells).size).toBe(5)
    }
    // 10 lines × 2 orders; the fleet fills the line, so no slack.
    expect(all.length).toBe(10 * 2)
    // On 6 squares there is one square of slack: 3 gap patterns per order.
    expect(lineLayouts(6, 6, [3, 2]).length).toBe(12 * 2 * 3)
  })

  it('the solver reads only the player view', () => {
    const L = generate('midway', 2, 1)
    const v = viewOf(L, newGame(L))
    expect(Object.keys(v).sort()).toEqual(['burning', 'fleet', 'h', 'info', 'salvos', 'scouted', 'scouts', 'seen', 'shots', 'sunk', 'turn', 'w'].sort())
    expect(JSON.stringify(v)).not.toContain('"horiz"')
    // Two different fleets with the same lengths give the same opening move.
    const other = { ...L, ships: randomFleet('scout', tierFor('scout', 2), mulberry32(99))! }
    expect(chooseMove(viewOf(other, newGame(other)))).toEqual(chooseMove(v))
  })
})

function checkFleet(id: string, L: Level) {
  const t = tierFor(CONFIGS[id].info, (L.salvos ? 1 : 1) as Difficulty)
  void t
  const cells = L.ships.flatMap(s => shipCells(L, s, 0))
  expect(new Set(cells).size).toBe(cells.length)
  for (const c of cells) { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThan(L.w * L.h) }
  for (const s of L.ships) for (const c of shipCells(L, s, 0)) {
    if (s.horiz) expect(Math.floor(c / L.w)).toBe(s.r)
  }
  if (L.info === 'line') {
    const rows = new Set(cells.map(c => Math.floor(c / L.w))), cols = new Set(cells.map(c => c % L.w))
    expect(rows.size === 1 || cols.size === 1).toBe(true)
  }
  if (L.info === 'scout') for (const a of L.ships) for (const b of L.ships) if (a.id < b.id) {
    for (const x of shipCells(L, a, 0)) for (const y of shipCells(L, b, 0)) {
      expect(Math.max(Math.abs(Math.floor(x / L.w) - Math.floor(y / L.w)), Math.abs((x % L.w) - (y % L.w)))).toBeGreaterThan(1)
    }
  }
  if (L.info === 'moving') expect(new Set(L.ships.map(s => s.r)).size).toBe(L.ships.length)
}

describe('naval battle levels', () => {
  it('every config × difficulty × seed: the view-only solver sinks the fleet within the salvo limit', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const fleets = new Set<string>()
      for (const seed of SEEDS) {
        const L = generate(id, d, seed)
        const t = tierFor(CONFIGS[id].info, d)
        expect(L.salvos).toBe(t.salvos)
        expect(L.ships.map(s => s.len)).toEqual(t.fleet)
        checkFleet(id, L)
        expect(outcomeOf(L, newGame(L))).toBeNull()
        const shots = solverShots(L)
        expect(shots, `${id} d${d} s${seed}`).toBeLessThanOrEqual(L.salvos)
        expect(isWon(playOut(L))).toBe(true)
        fleets.add(JSON.stringify(L.ships))
      }
      expect(fleets.size, `${id} d${d} distinct`).toBeGreaterThanOrEqual(SEEDS.length - 1)
    }
  })

  it('on fresh fleets the solver wins at least 85%; ignoring the clue loses most top battles', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const t = tierFor(CONFIGS[id].info, d)
      const rng = mulberry32(500 + d)
      let won = 0, naive = 0, n = 0
      for (let k = 0; k < 30; k++) {
        const ships = randomFleet(CONFIGS[id].info, t, rng)
        if (!ships) continue
        const L: Level = { info: CONFIGS[id].info, w: t.w, h: t.h, ships, salvos: t.salvos, scouts: t.scouts }
        n++
        if (solverShots(L) <= L.salvos) won++
        if (isWon(playOut(L, false))) naive++
      }
      expect(won / n, `${id} d${d} solver`).toBeGreaterThanOrEqual(0.85)
      if (d >= 3) expect(naive / n, `${id} d${d} naive`).toBeLessThanOrEqual(0.4)
      expect(naive, `${id} d${d}`).toBeLessThan(won)
    }
  })

  it('a row-by-row sweep runs out of salvos on most battles from D2', () => {
    for (const id of CONFIG_IDS) {
      let lost = 0, n = 0
      for (const d of [2, 3, 4] as Difficulty[]) for (const seed of SEEDS) {
        const L = generate(id, d, seed)
        let g = newGame(L)
        for (let c = 0; c < L.w * L.h && outcomeOf(L, g) === null; c++) g = fire(L, g, c)
        n++
        if (outcomeOf(L, g) !== 'won') lost++
      }
      expect(lost / n, id).toBeGreaterThanOrEqual(0.75)
    }
  })

  it('is deterministic in seed', () => {
    expect(generate('salamis', 3, 5)).toEqual(generate('salamis', 3, 5))
    expect(generate('salamis', 3, 5)).not.toEqual(generate('salamis', 3, 6))
  })
})

describe('naval battle component', () => {
  const props = (id: string, d: Difficulty, seed: number, onWin = () => {}, onLose = () => {}) => ({ configId: id, difficulty: d, seed, onWin, onLose })
  const click = (c: HTMLElement, sel: string) => fireEvent.click(c.querySelector(sel)!)

  function solverLine(L: Level, useRule: boolean): Move[] {
    let g: Game = newGame(L)
    const moves: Move[] = []
    for (let k = 0; k < 400 && outcomeOf(L, g) === null; k++) {
      const m = chooseMove(viewOf(L, g), useRule)
      const next = m.t === 'scout' ? scout(L, g, m.line) : fire(L, g, m.cell)
      if (next === g) break
      moves.push(m); g = next
    }
    return moves
  }
  function play(c: HTMLElement, moves: Move[]) {
    for (const m of moves) {
      if (m.t === 'scout') {
        if (!c.querySelector('[data-scout][class*="bg-sky-200"]')) fireEvent.click([...c.querySelectorAll('button')].find(b => b.textContent?.includes('Send a scout'))!)
        click(c, `[data-scout="${m.line}"]`)
      } else click(c, `[data-cell="${m.cell}"]`)
    }
  }

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(BattleshipGame, props(id, d, 1)))
      const t = tierFor(CONFIGS[id].info, d)
      expect(container.querySelectorAll('[data-cell]').length).toBe(t.w * t.h)
      expect(container.querySelector('[data-testid="salvos-left"]')!.textContent).toContain(String(t.salvos))
      if (id === 'midway') expect(container.querySelectorAll('[data-scout]').length).toBe(t.w + t.h)
      unmount()
    }
  })

  it('playing the solver’s shots wins exactly once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of [1, 4] as Difficulty[]) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(BattleshipGame, props(id, d, 9, onWin, onLose)))
      const L = generate(id, d, 9)
      play(container, solverLine(L, true))
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('wasting the salvos loses exactly once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(BattleshipGame, props(id, 4, 2, onWin, onLose)))
      const L = generate(id, 4, 2)
      const moves = solverLine(L, false)
      let g = newGame(L)
      for (const m of moves) g = m.t === 'scout' ? scout(L, g, m.line) : fire(L, g, m.cell)
      if (outcomeOf(L, g) === 'won') continue
      // Spend whatever is left on squares that miss.
      while (outcomeOf(L, g) === null) {
        const busy = new Set(L.ships.flatMap(s => shipCells(L, s, g.turn)))
        const c = [...Array(L.w * L.h).keys()].find(i => canFire(L, g, i) && !busy.has(i))!
        moves.push({ t: 'fire', cell: c }); g = fire(L, g, c)
      }
      expect(outcomeOf(L, g)).toBe('lost')
      play(container, moves)
      for (let k = 0; k < 5; k++) click(container, '[data-cell="0"]')
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose, id).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })
})
