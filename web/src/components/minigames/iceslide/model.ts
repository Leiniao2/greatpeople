// Ice slide yards: the player slides in a straight line until a wall or a
// stone stops them, and only a slide that ends exactly on the exit wins.
//
// Yards are generated from the seed, not authored, so no two Arcade levels
// share a board.  The tier sets the size, the fewest slides the exit needs,
// and (from D3) patches of thin ice that break under a passing slider.
// Every yard is checked before it is played: the exit is reachable, the
// optimal route is inside the tier's band, every reachable stop can still
// reach the exit without crossing thin ice (no slide strands the player),
// and there are enough stops to make the route a search rather than a line.

import type { Difficulty } from '@/games/types'
import { mulberry32, hashString, randInt, shuffle, type Rng } from '../_shared/rng'

// Legend: '#' wall  '.' ice  'B' stone  'O' thin ice  'S' start  'E' exit
export type Cell = '#' | '.' | 'B' | 'O' | 'S' | 'E'
export type Dir = 'up' | 'down' | 'left' | 'right'
export const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right']

export interface Tier {
  rows: number
  cols: number
  /** Fewest slides from start to exit, inclusive band. */
  slides: [number, number]
  /** Stones as a share of the interior. */
  stones: number
  /** Straight wall segments laid inside the border. */
  segments: number
  /** Thin-ice cells (crossing one ends the run). */
  holes: number
  /** Reachable stops, at least this many times the optimal slide count. */
  minBranching: number
  seconds: number
}

export const TIERS: Record<Difficulty, Tier> = {
  1: { rows: 12, cols: 12, slides: [7, 9],   stones: 0.09, segments: 4, holes: 0, minBranching: 3, seconds: 0 },
  2: { rows: 14, cols: 14, slides: [10, 12], stones: 0.10, segments: 6, holes: 0, minBranching: 3, seconds: 0 },
  3: { rows: 15, cols: 15, slides: [13, 16], stones: 0.11, segments: 7, holes: 4, minBranching: 3, seconds: 180 },
  4: { rows: 17, cols: 19, slides: [16, 22], stones: 0.11, segments: 9, holes: 8, minBranching: 2.5, seconds: 240 },
}

export const timeLimitFor = (d: Difficulty) => TIERS[d].seconds

export type Grid = Cell[][]

export function parseGrid(lines: readonly string[]): { grid: Grid; sr: number; sc: number } {
  const grid = lines.map(l => l.split('') as Cell[])
  let sr = 0, sc = 0
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[r].length; c++)
      if (grid[r][c] === 'S') { sr = r; sc = c }
  return { grid, sr, sc }
}

export interface Slide {
  r: number
  c: number
  /** The slide crossed thin ice: the run is over. */
  fell: boolean
  /** Every cell passed over, the stop last (empty when the slider cannot move). */
  path: [number, number][]
}

/** Where a slide from (r, c) ends.  The slider stops at the cell before a wall or stone. */
export function slide(grid: Grid, r: number, c: number, dir: Dir): Slide {
  const dr = dir === 'up' ? -1 : dir === 'down' ? 1 : 0
  const dc = dir === 'left' ? -1 : dir === 'right' ? 1 : 0
  const path: [number, number][] = []
  let nr = r + dr, nc = c + dc
  while (
    nr >= 0 && nr < grid.length &&
    nc >= 0 && nc < grid[0].length &&
    grid[nr][nc] !== '#' && grid[nr][nc] !== 'B'
  ) {
    r = nr; c = nc
    path.push([r, c])
    if (grid[r][c] === 'O') return { r, c, fell: true, path }
    nr = r + dr; nc = c + dc
  }
  return { r, c, fell: false, path }
}

/** Backwards-compatible stop lookup (thin ice counts as a fall, reported as the hole cell). */
export function slidePos(grid: Grid, r: number, c: number, dir: Dir): [number, number] {
  const s = slide(grid, r, c, dir)
  return [s.r, s.c]
}

const key = (r: number, c: number) => r * 64 + c

export interface Analysis {
  /** Fewest safe slides from the start to the exit, or -1. */
  optimal: number
  /** Every reachable stop can still reach the exit without falling. */
  trapFree: boolean
  /** Stops reachable from the start by safe slides (the start included). */
  stops: number
}

/** Safe-slide graph from the start: distance per stop and the out-edges of each. */
function explore(lines: readonly string[]) {
  const { grid, sr, sc } = parseGrid(lines)
  const dist = new Map<number, number>([[key(sr, sc), 0]])
  const edges = new Map<number, number[]>()
  const queue: [number, number][] = [[sr, sc]]
  let exitKey = -1
  for (let h = 0; h < queue.length; h++) {
    const [r, c] = queue[h]
    const k = key(r, c), out: number[] = []
    if (grid[r][c] === 'E') { exitKey = k; edges.set(k, out); continue }
    for (const dir of DIRS) {
      const s = slide(grid, r, c, dir)
      if (s.fell) continue
      const nk = key(s.r, s.c)
      if (nk === k) continue
      out.push(nk)
      if (!dist.has(nk)) { dist.set(nk, dist.get(k)! + 1); queue.push([s.r, s.c]) }
    }
    edges.set(k, out)
  }
  return { grid, dist, edges, exitKey }
}

export function analyse(lines: readonly string[]): Analysis {
  const { dist, edges, exitKey } = explore(lines)
  if (exitKey < 0) return { optimal: -1, trapFree: false, stops: dist.size }
  // Every reachable stop must still reach the exit: search backwards from it.
  const back = new Map<number, number[]>()
  for (const [k, out] of edges) for (const nk of out) back.set(nk, [...(back.get(nk) ?? []), k])
  const good = new Set([exitKey]), stack = [exitKey]
  while (stack.length) { const k = stack.pop()!; for (const pk of back.get(k) ?? []) if (!good.has(pk)) { good.add(pk); stack.push(pk) } }
  return { optimal: dist.get(exitKey)!, trapFree: [...edges.keys()].every(k => good.has(k)), stops: dist.size }
}

// ── Generation ───────────────────────────────────────────────────────────────

function emptyYard(rows: number, cols: number): Grid {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (r === 0 || c === 0 || r === rows - 1 || c === cols - 1 ? '#' : '.') as Cell))
}

/** Random walls, stones and thin ice; no start or exit yet. */
function layout(rng: Rng, tier: Tier): Grid {
  const g = emptyYard(tier.rows, tier.cols)
  const inner = (tier.rows - 2) * (tier.cols - 2)
  // Straight wall segments, 2–5 long, kept off the border so no pocket seals.
  for (let i = 0; i < tier.segments; i++) {
    const horizontal = rng() < 0.5
    const len = randInt(rng, 2, 5)
    const r = randInt(rng, 2, tier.rows - 3), c = randInt(rng, 2, tier.cols - 3)
    for (let j = 0; j < len; j++) {
      const rr = horizontal ? r : r + j, cc = horizontal ? c + j : c
      if (rr >= 1 && rr < tier.rows - 1 && cc >= 1 && cc < tier.cols - 1) g[rr][cc] = '#'
    }
  }
  const ice: [number, number][] = []
  for (let r = 1; r < tier.rows - 1; r++) for (let c = 1; c < tier.cols - 1; c++) if (g[r][c] === '.') ice.push([r, c])
  const cells = shuffle(ice, rng)
  const stones = Math.round(inner * tier.stones)
  for (const [r, c] of cells.slice(0, stones)) g[r][c] = 'B'
  for (const [r, c] of cells.slice(stones, stones + tier.holes)) g[r][c] = 'O'
  return g
}

const toLines = (g: Grid) => g.map(row => row.join(''))

/** True when the yard meets every rule of its tier. */
export function fits(lines: readonly string[], tier: Tier): boolean {
  const a = analyse(lines)
  return a.trapFree && a.optimal >= tier.slides[0] && a.optimal <= tier.slides[1] && a.stops >= tier.minBranching * a.optimal
}

/** Slide graph over every ice cell as a possible stop: out-edges and in-edges by cell key. */
function graphOf(grid: Grid) {
  const out = new Map<number, number[]>(), back = new Map<number, number[]>()
  for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[0].length; c++) {
    if (grid[r][c] !== '.') continue
    const k = key(r, c), edges: number[] = []
    for (const dir of DIRS) {
      const s = slide(grid, r, c, dir)
      if (s.fell) continue
      const nk = key(s.r, s.c)
      if (nk !== k) { edges.push(nk); back.set(nk, [...(back.get(nk) ?? []), k]) }
    }
    out.set(k, edges)
  }
  return { out, back }
}

function bfs(adj: Map<number, number[]>, roots: number[]): Map<number, number> {
  const dist = new Map<number, number>(roots.map(k => [k, 0]))
  const queue = [...roots]
  for (let h = 0; h < queue.length; h++) {
    const k = queue[h]
    for (const nk of adj.get(k) ?? []) if (!dist.has(nk)) { dist.set(nk, dist.get(k)! + 1); queue.push(nk) }
  }
  return dist
}

/**
 * The yard played for a config at a difficulty.  Layouts are drawn from the
 * seed until one holds a start and exit whose shortest safe route lies in the
 * tier's band; the search is deterministic, so a level always replays the
 * same yard.  When no layout qualifies (practically never), the nearest miss
 * is played rather than nothing.
 */
export function yardFor(configId: string, difficulty: Difficulty, seed: number): string[] {
  return generate(TIERS[difficulty], `ice:${configId}:${difficulty}:${seed}`)
}

export const ATTEMPTS = 200

/** Generate a yard for a tier from a seed string (see yardFor). */
export function generate(tier: Tier, seedKey: string): string[] {
  const rng = mulberry32(hashString(seedKey))
  // Aim at one length inside the band so yards vary; settle for any band
  // length once half the attempts are spent.
  const target = randInt(rng, tier.slides[0], tier.slides[1])
  let best: string[] | null = null, bestGap = Infinity
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const g = layout(rng, tier)
    const { out, back } = graphOf(g)
    const lo = attempt < ATTEMPTS / 2 ? target : tier.slides[0]
    const hi = attempt < ATTEMPTS / 2 ? target : tier.slides[1]
    const exits = shuffle([...out.keys()], rng).slice(0, 60)
    for (const e of exits) {
      // Slides needed to reach this exit from every cell; cells that cannot are
      // traps, and so is any cell from which a trap can be reached.
      const toExit = bfs(back, [e])
      const traps = [...out.keys()].filter(k => !toExit.has(k))
      const unsafe = bfs(back, traps)
      const starts = shuffle([...toExit].filter(([k, d]) => d >= lo - 1 && d <= hi && !unsafe.has(k) && k !== e), rng)
        .sort((a, b) => b[1] - a[1])
      for (const [s] of starts) {
        // Enough stops to search through (the exit ends a run, so count from a real analysis).
        const er = Math.floor(e / 64), ec = e % 64, sr = Math.floor(s / 64), sc = s % 64
        g[er][ec] = 'E'; g[sr][sc] = 'S'
        const lines = toLines(g)
        g[er][ec] = '.'; g[sr][sc] = '.'
        const a = analyse(lines)
        if (!a.trapFree || a.stops < tier.minBranching * a.optimal) continue
        if (a.optimal >= lo && a.optimal <= hi) return lines
        const gap = tier.slides[0] - a.optimal
        if (gap < bestGap) { best = lines; bestGap = gap }
      }
    }
  }
  return best ?? toLines(fallback(tier))
}

/** A plain bordered yard with the start and exit in opposite corners; only ever used if generation fails. */
function fallback(tier: Tier): Grid {
  const g = emptyYard(tier.rows, tier.cols)
  g[1][1] = 'S'
  g[tier.rows - 2][tier.cols - 2] = 'E'
  return g
}
