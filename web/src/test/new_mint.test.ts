import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Difficulty } from '@/games/types'
import { hashString, mulberry32 } from '@/components/minigames/_shared'
import MintGame, {
  CONFIGS, CONFIG_IDS, DIRS, playOut, sizeFor, targetFor, highSpawnFor, slideGrid, slideTiles, tilesToGrid, canMove,
  bestDir, initialGrid, type Tile, type Dir,
} from '@/components/minigames/MintGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 42, 777, 2024]
const mintSeed = (id: string, seed: number) => seed ^ hashString(`mint:${id}`)

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Coin Mint — engine', () => {
  it('configs have facts and enough denominations for every target', () => {
    expect(CONFIG_IDS.length).toBeGreaterThanOrEqual(3)
    for (const id of CONFIG_IDS) {
      expect(CONFIGS[id].coins.length, id).toBeGreaterThanOrEqual(targetFor(4))
      expect(CONFIGS[id].fact.length).toBeGreaterThan(20)
    }
  })

  it('slides and merges like 2048: each coin merges once per move', () => {
    const r = slideGrid([1, 1, 1, 1, 2, 0, 2, 0, 1, 2, 3, 4, 0, 0, 0, 1], 4, 'left')
    expect(r.grid).toEqual([2, 2, 0, 0, 3, 0, 0, 0, 1, 2, 3, 4, 1, 0, 0, 0])
    expect(r.gained).toBe(4 + 4 + 8)
    expect(slideGrid([1, 2, 3, 4, 2, 3, 4, 1, 1, 2, 3, 4, 2, 3, 4, 1], 4, 'left').moved).toBe(false)
    expect(canMove([1, 2, 3, 4, 2, 3, 4, 1, 1, 2, 3, 4, 2, 3, 4, 1], 4)).toBe(false)
    expect(slideGrid([1, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0], 4, 'down').grid).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0])
  })

  it('the animated tile slide agrees with the grid slide', () => {
    const rng = mulberry32(9)
    for (let k = 0; k < 300; k++) {
      const n = k % 2 ? 4 : 5
      const tiles: Tile[] = []
      for (let i = 0; i < n * n; i++) if (rng() < 0.6) tiles.push({ id: i + 1, v: 1 + Math.floor(rng() * 4), pos: i })
      const dir = DIRS[k % 4]
      expect(tilesToGrid(slideTiles(tiles, n, dir, 1000).tiles, n)).toEqual(slideGrid(tilesToGrid(tiles, n), n, dir).grid)
    }
  })

  it('spawns are deterministic per seed', () => {
    expect(initialGrid(4, 5, 0.1)).toEqual(initialGrid(4, 5, 0.1))
    expect(initialGrid(4, 5, 0.1).grid).not.toEqual(initialGrid(4, 6, 0.1).grid)
  })

  it('every config × difficulty × seed is won by a strong player', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const s of SEEDS) {
      const r = playOut(sizeFor(d), targetFor(d), mintSeed(id, s), highSpawnFor(d))
      expect(r.won, `${id}@${d}#${s} reached tier ${r.best}`).toBe(true)
    }
  }, 120_000)
})

describe('Coin Mint — component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container } = render(createElement(MintGame, { configId: id, difficulty: d, seed: 4, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelectorAll('[data-coin]:not([data-ghost])').length).toBe(2)
      cleanup()
    }
  })

  const readGrid = (container: HTMLElement, n: number) => {
    const g = new Array<number>(n * n).fill(0)
    container.querySelectorAll<HTMLElement>('[data-coin]:not([data-ghost])').forEach(e => { g[Number(e.dataset.pos)] = Number(e.dataset.coin) })
    return g
  }

  it('playing the strong player through the keyboard wins exactly once', () => {
    vi.useFakeTimers()
    const id = 'china', d: Difficulty = 1, seed = 11, n = sizeFor(d)
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(MintGame, { configId: id, difficulty: d, seed, onWin, onLose }))
    const keys: Record<Dir, string> = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' }
    let spawns = 2
    for (let t = 0; t < 1000 && !onWin.mock.calls.length; t++) {
      const grid = readGrid(container, n)
      const dir = bestDir({ grid, spawns }, n, mintSeed(id, seed), highSpawnFor(d))
      if (!dir) break
      fireEvent.keyDown(window, { key: keys[dir] })
      spawns++
      act(() => { vi.advanceTimersByTime(200) })
      act(() => { vi.advanceTimersByTime(1000) })
    }
    expect(onWin).toHaveBeenCalledTimes(1)
    expect(onLose).not.toHaveBeenCalled()
  })

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
