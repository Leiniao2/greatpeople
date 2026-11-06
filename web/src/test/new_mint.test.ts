import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Difficulty } from '@/games/types'
import { mulberry32 } from '@/components/minigames/_shared'
import MintGame, {
  CONFIGS, CONFIG_IDS, DIRS, BLOCK, LEAD, WILD, MAX_SWIPES, playOut, sizeFor, targetFor, rulesFor, slideGrid, slideTiles, tilesToGrid,
  canMove, bestDir, initialGrid, spawnAt, turn, traySeed, playableSeed, blockCells, mergeOf, blocksFor, type Tile, type Dir,
} from '@/components/minigames/MintGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 42, 777, 2024]

afterEach(() => { cleanup(); vi.useRealTimers() })

const levelOf = (id: string, d: Difficulty, seed: number) => {
  const ts = traySeed(id, playableSeed(id, d, seed).seed)
  return { ts, rules: rulesFor(CONFIGS[id].twist, d, ts) }
}

describe('2048 — engine', () => {
  it('configs have facts, enough denominations, and each is a distinct twist', () => {
    expect(CONFIG_IDS.length).toBeGreaterThanOrEqual(4)
    // The base configs are each their own twist; story-themed configs reuse one of them.
    const BASE = ['lydia', 'china', 'britain', 'rome']
    expect(new Set(BASE.map(id => CONFIGS[id].twist)).size).toBe(BASE.length)
    for (const id of CONFIG_IDS) expect(BASE.map(b => CONFIGS[b].twist), id).toContain(CONFIGS[id].twist)
    for (const id of ['lydia', 'china', 'britain']) expect(CONFIGS[id]).toBeDefined()
    for (const id of CONFIG_IDS) {
      expect(CONFIGS[id].coins.length, id).toBeGreaterThanOrEqual(targetFor(4))
      expect(CONFIGS[id].fact.length).toBeGreaterThan(20)
      expect(CONFIGS[id].twistText.length).toBeGreaterThan(40)
    }
  })

  it('time budget: a 4×4 tray, target ≤ the 256 coin, and a bounded swipe count', () => {
    for (const d of DIFFS) {
      expect(sizeFor(d)).toBe(4)
      expect(targetFor(d)).toBeLessThanOrEqual(8)
      expect(MAX_SWIPES[d]).toBeLessThanOrEqual(d <= 2 ? 100 : 180)
    }
    expect(targetFor(1)).toBe(7) // still the 128 coin: real decisions on a 4×4 tray
  })

  it('slides and merges like 2048: each coin merges once per move', () => {
    const r = slideGrid([1, 1, 1, 1, 2, 0, 2, 0, 1, 2, 3, 4, 0, 0, 0, 1], 4, 'left')
    expect(r.grid).toEqual([2, 2, 0, 0, 3, 0, 0, 0, 1, 2, 3, 4, 1, 0, 0, 0])
    expect(r.gained).toBe(4 + 4 + 8)
    expect(slideGrid([1, 2, 3, 4, 2, 3, 4, 1, 1, 2, 3, 4, 2, 3, 4, 1], 4, 'left').moved).toBe(false)
    expect(canMove([1, 2, 3, 4, 2, 3, 4, 1, 1, 2, 3, 4, 2, 3, 4, 1], 4)).toBe(false)
    expect(slideGrid([1, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0], 4, 'down').grid).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0])
  })

  it('the animated tile slide agrees with the grid slide, specials and walls included', () => {
    const rng = mulberry32(9)
    for (let k = 0; k < 600; k++) {
      const n = 4
      const walls = k % 3 ? [] : blockCells(n, 2, k)
      const tiles: Tile[] = []
      for (let i = 0; i < n * n; i++) {
        if (walls.includes(i) || rng() > 0.65) continue
        const r = rng()
        tiles.push({ id: i + 1, v: r < 0.12 ? LEAD : r < 0.22 ? WILD : 1 + Math.floor(rng() * 4), pos: i })
      }
      const dir = DIRS[k % 4]
      const grid = tilesToGrid(tiles, n, walls)
      expect(tilesToGrid(slideTiles(tiles, n, dir, 1000, walls).tiles, n, walls)).toEqual(slideGrid(grid, n, dir).grid)
    }
  })

  it('spawns are deterministic per seed', () => {
    const r = rulesFor('lead', 3, 5)
    expect(initialGrid(r, 5)).toEqual(initialGrid(r, 5))
    expect(initialGrid(r, 5).grid).not.toEqual(initialGrid(r, 6).grid)
    expect(blockCells(4, 2, 9)).toEqual(blockCells(4, 2, 9))
  })

  it('every config × difficulty × seed is won by a strong player inside the swipe budget', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const s of SEEDS) {
      const { tries } = playableSeed(id, d, s)
      expect(tries, `${id}@${d}#${s}`).toBeGreaterThan(0)
      const { ts, rules } = levelOf(id, d, s)
      const r = playOut(rules, ts, MAX_SWIPES[d])
      expect(r.won, `${id}@${d}#${s} reached tier ${r.best}`).toBe(true)
      expect(r.turns).toBeLessThanOrEqual(MAX_SWIPES[d])
    }
  }, 120_000)
})

describe('2048 — variants', () => {
  it('wild (Lydia): a touchstone lifts any coin a tier; two touchstones never merge', () => {
    expect(mergeOf(WILD, 5)).toBe(6)
    expect(mergeOf(3, WILD)).toBe(4)
    expect(mergeOf(WILD, WILD)).toBeNull()
    expect(slideGrid([5, WILD, 0, 0, WILD, WILD, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4, 'left').grid.slice(0, 8)).toEqual([6, 0, 0, 0, WILD, WILD, 0, 0])
    expect(rulesFor('wild', 1, 1).wild).toBeGreaterThan(0)
  })

  it('lead (China): forgeries never merge with coins; two forgeries melt away', () => {
    expect(mergeOf(LEAD, 1)).toBeNull()
    expect(mergeOf(2, LEAD)).toBeNull()
    expect(mergeOf(LEAD, LEAD)).toBe(0)
    const r = slideGrid([LEAD, LEAD, 2, 2, 1, LEAD, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4, 'left')
    expect(r.grid.slice(0, 8)).toEqual([3, 0, 0, 0, 1, LEAD, 1, 0])
    // Forgeries do spawn, and only in this variant.
    const rules = rulesFor('lead', 4, 3)
    const empty = new Array(16).fill(0)
    const spawned = [...Array(200)].map((_, k) => spawnAt(empty, 3, k, rules)!.v)
    expect(spawned).toContain(LEAD)
    expect([...Array(200)].map((_, k) => spawnAt(empty, 3, k, rulesFor('tilt', 4, 3))!.v)).not.toContain(LEAD)
  })

  it('blocked (Britain): broken dies stop coins and never move', () => {
    for (const d of DIFFS) {
      const r = rulesFor('blocked', d, 77)
      expect(r.blocks.length).toBe(blocksFor(d))
      expect(r.blocks.length).toBe(d <= 3 ? 1 : 2)
      for (const b of r.blocks) expect([0, 3, 12, 15]).not.toContain(b)
      expect(initialGrid(r, 77).grid.filter(v => v === BLOCK).length).toBe(r.blocks.length)
    }
    // [1, BLOCK, 0, 1] sliding left: the right coin stops at the die and cannot reach the other 1.
    expect(slideGrid([1, BLOCK, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4, 'left').grid.slice(0, 4)).toEqual([1, BLOCK, 1, 0])
    expect(slideGrid([0, BLOCK, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4, 'right').grid.slice(0, 4)).toEqual([0, BLOCK, 0, 2])
  })

  it('tilt (Rome): swiping up is never allowed', () => {
    const r = rulesFor('tilt', 2, 1)
    expect(r.dirs).not.toContain('up')
    const st = initialGrid(r, 1)
    expect(turn(st, r, 'up', 1)).toBeNull()
    // A tray that only "up" could change is jammed.
    expect(canMove([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 2], 4, r.dirs)).toBe(false)
    expect(canMove([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 2], 4)).toBe(true)
  })
})

describe('2048 — component', () => {
  it('renders every config at every difficulty with its twist', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, getByTestId } = render(createElement(MintGame, { configId: id, difficulty: d, seed: 4, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelectorAll('[data-coin]:not([data-ghost])').length).toBe(2)
      expect(getByTestId('mint-twist').textContent).toContain(CONFIGS[id].twistText)
      expect(container.querySelectorAll('[data-block]').length).toBe(CONFIGS[id].twist === 'blocked' ? blocksFor(d) : 0)
      if (CONFIGS[id].twist === 'tilt') expect(container.querySelector<HTMLButtonElement>('[data-dir="up"]')!.disabled).toBe(true)
      cleanup()
    }
  })

  const readGrid = (container: HTMLElement, n: number, walls: number[]) => {
    const g = new Array<number>(n * n).fill(0)
    for (const b of walls) g[b] = BLOCK
    container.querySelectorAll<HTMLElement>('[data-coin]:not([data-ghost])').forEach(e => { g[Number(e.dataset.pos)] = Number(e.dataset.coin) })
    return g
  }

  for (const [id, d] of [['china', 1], ['britain', 3], ['rome', 2], ['lydia', 4]] as [string, Difficulty][]) {
    it(`${id}: playing the strong player through the keyboard wins exactly once`, () => {
      vi.useFakeTimers()
      const seed = 11
      const { ts, rules } = levelOf(id, d, seed)
      const onWin = vi.fn(), onLose = vi.fn()
      const { container } = render(createElement(MintGame, { configId: id, difficulty: d, seed, onWin, onLose }))
      const keys: Record<Dir, string> = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' }
      let spawns = 2
      for (let t = 0; t < 400 && !onWin.mock.calls.length; t++) {
        const grid = readGrid(container, rules.n, rules.blocks)
        const dir = bestDir({ grid, spawns }, rules, ts)
        if (!dir) break
        fireEvent.keyDown(window, { key: keys[dir] })
        spawns++
        act(() => { vi.advanceTimersByTime(200) })
      }
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
    })
  }

  it('mindless sliding jams the tray and loses exactly once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(MintGame, { configId: 'britain', difficulty: 4, seed: 3, onWin, onLose }))
    const btn = (d: Dir) => container.querySelector<HTMLButtonElement>(`[data-dir="${d}"]`)!
    for (let t = 0; t < 3000 && !onLose.mock.calls.length; t++) {
      const order: Dir[] = ['left', 'up', 'right', 'down']
      fireEvent.click(btn(order[t % 2]))
      fireEvent.click(btn(order[2 + (t % 2)]))
      act(() => { vi.advanceTimersByTime(1100) })
    }
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
