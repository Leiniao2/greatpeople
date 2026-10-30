import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, scale, useGameOutcome, useGameTimer, TimerBar } from './_shared'
import type { Rng } from './_shared'

// Physics mazes: one small board, one movement rule per level.  Instead of
// walking a corridor maze cell by cell, every config picks a "mode" that
// changes how the actor moves, and states the rule in one line:
//
//   slide     ice: a push keeps you sliding until a wall, stone or the exit stops you
//   gravity   tilt the shaft: the stone falls the way you tilt; bars let you
//             slide across but not fall through; portals carry you onward
//   current   rivers / winds: step, then the arrow under you carries you one
//             more cell (chains); bold arrows are too strong to push against
//   inertia   momentum: each tap adds speed, you keep rolling, tapping back
//             brakes one notch at a time; hitting a wall at speed costs a life
//   spread    a hazard (fire, flood) spreads one cell per turn through its
//             medium; reach the exit before it closes the route
//   elements  mixed ground: ice slides, wind pushes, earth stops you
//
// Levels are generated from the seed and verified solvable by a BFS over the
// mode's own state space (position + key + velocity, with time for spread),
// so every retry reshuffles and every board has a solution in a sane range.

// ── Types ──────────────────────────────────────────────────────────────────────

export type Mode = 'slide' | 'gravity' | 'current' | 'inertia' | 'spread' | 'elements'
export const MODES: readonly Mode[] = ['slide', 'gravity', 'current', 'inertia', 'spread', 'elements']
/** 0 up, 1 right, 2 down, 3 left */
export type Dir = 0 | 1 | 2 | 3
export type Pos = [number, number]

const DR = [-1, 0, 1, 0]
const DC = [0, 1, 0, -1]
const DIRS: readonly Dir[] = [0, 1, 2, 3]
const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir

type Theme = 'sandstone' | 'cedar' | 'mountain' | 'ice' | 'sea' | 'sky' | 'steppe' | 'bamboo'

export interface MazeConfig {
  title: string
  subtitle: string
  theme: Theme
  actor: string
  /** One mode, or one per difficulty tier. */
  mode: Mode | readonly [Mode, Mode, Mode, Mode]
  levels: number
  hasKey: boolean
  fog: boolean
  portals?: boolean
  /** Fixed board size; defaults to the difficulty's size. */
  size?: number
  seedBase: number
}

export const CONFIGS: Record<string, MazeConfig> = {
  'pyramid-deep': {
    title: 'Inner Sanctum', subtitle: "Tilt the capstone sledge down the shafts of the pharaoh's tomb",
    theme: 'sandstone', actor: '🔺', mode: 'gravity', levels: 3, hasKey: true, fog: true, portals: true, seedBase: 17,
  },
  'pleistoanax-mountain': {
    title: 'Mount Lycaeum', subtitle: 'A rockfall descent from exile through the sacred mountain',
    theme: 'mountain', actor: '🪨', mode: 'gravity', levels: 2, hasKey: false, fog: true, seedBase: 99,
  },
  'everest-summit': {
    title: 'Ascent to the Summit', subtitle: 'Slide across the ice walls of Everest to reach the top',
    theme: 'ice', actor: '🧗', mode: 'slide', levels: 3, hasKey: true, fog: true, seedBase: 137,
  },
  'everest-peak': {
    title: 'The Final Approach', subtitle: 'Through ice and wind, reach the roof of the world',
    theme: 'ice', actor: '🧗', mode: 'slide', levels: 2, hasKey: true, fog: true, seedBase: 201,
  },
  'enkidu-steppe': {
    title: 'The Wild Steppes', subtitle: 'Cross the frozen steppe toward the walls of Uruk',
    theme: 'steppe', actor: '🐂', mode: 'slide', levels: 2, hasKey: false, fog: false, seedBase: 42,
  },
  'enkidu-elements': {
    title: 'Wild Lands', subtitle: 'Ice, wind and earth: read the untamed ground before Uruk',
    theme: 'steppe', actor: '🏃', mode: 'elements', levels: 2, hasKey: false, fog: false, seedBase: 63,
  },
  'cedar-forest': {
    title: 'Forest of Humbaba', subtitle: "Outrun Humbaba's fire through the enchanted cedar forest",
    theme: 'cedar', actor: '🏃', mode: 'spread', levels: 2, hasKey: false, fog: false, seedBase: 55,
  },
  'long-march': {
    title: 'Mountain Pass', subtitle: 'Ford the rivers of the pass, then outrun the rising flood',
    theme: 'mountain', actor: '🚩', mode: ['current', 'current', 'spread', 'spread'], levels: 3, hasKey: false, fog: false, seedBase: 73,
  },
  'pacific-strait': {
    title: 'The Strait of Magellan', subtitle: 'Work the currents of the treacherous passage between the oceans',
    theme: 'sea', actor: '⛵', mode: 'current', levels: 2, hasKey: true, fog: false, seedBase: 186,
  },
  'atlantic-sky': {
    title: 'Atlantic Crossing', subtitle: "Ride the jet-stream winds on Earhart's course over the Atlantic",
    theme: 'sky', actor: '✈️', mode: 'current', levels: 2, hasKey: false, fog: false, seedBase: 311,
  },
  mulan: {
    title: 'The Northern Passes', subtitle: "Charge Mulan's cavalry through the passes without breaking the horses",
    theme: 'bamboo', actor: '🐎', mode: 'inertia', levels: 2, hasKey: false, fog: false, seedBase: 419,
  },
  musashi: {
    title: 'Road to Ganryū Island', subtitle: 'Dash to the duelling ground before the tide turns',
    theme: 'bamboo', actor: '⚔️', mode: 'inertia', levels: 2, hasKey: false, fog: false, seedBase: 523,
  },
}

/** Every hand-authored config id; the registry test renders each one. */
export const CONFIG_IDS = Object.keys(CONFIGS)

const isMode = (v: unknown): v is Mode => typeof v === 'string' && (MODES as readonly string[]).includes(v)

/**
 * Resolve the config for a challenge.  Only `mode`, `size` and `levels` are
 * honoured from params: story data carries leftover quiz text in
 * params.title/subtitle that must not replace the config's flavour.
 */
export function resolveMazeConfig(configId: string | undefined, params?: Record<string, unknown>): MazeConfig {
  const base = (configId && CONFIGS[configId]) || CONFIGS['pyramid-deep']
  if (!params) return base
  const out: MazeConfig = { ...base }
  if (isMode(params.mode)) out.mode = params.mode
  if (typeof params.levels === 'number' && params.levels >= 1 && params.levels <= 3) out.levels = Math.floor(params.levels)
  if (typeof params.size === 'number' && params.size >= 6 && params.size <= 11) out.size = Math.floor(params.size)
  return out
}

// ── Difficulty ─────────────────────────────────────────────────────────────────

/** Inclusive range of inputs an optimal solution may take. */
export function solutionRange(mode: Mode, difficulty: Difficulty): [number, number] {
  const tiers: Record<'step' | 'glide' | 'inertia', [number, number][]> = {
    step:    [[4, 7], [6, 10], [8, 14], [10, 18]],
    glide:   [[3, 5], [4, 7], [5, 9], [6, 12]],
    inertia: [[3, 6], [4, 8], [5, 10], [6, 12]],
  }
  const kind = mode === 'current' || mode === 'spread' ? 'step' : mode === 'inertia' ? 'inertia' : 'glide'
  const [lo, hi] = tiers[kind][difficulty - 1]
  return [lo, hi]
}

export function resolveMode(config: MazeConfig, difficulty: Difficulty): Mode {
  return typeof config.mode === 'string' ? config.mode : config.mode[difficulty - 1]
}

export function settings(config: MazeConfig, difficulty: Difficulty) {
  const mode = resolveMode(config, difficulty)
  return {
    mode,
    levels: Math.min(config.levels, scale(difficulty, [1, 2, 2, 3])),
    size: config.size ?? scale(difficulty, [7, 8, 9, 11]),
    fogRadius: config.fog ? scale(difficulty, [0, 0, 5, 4]) : 0,
    hasKey: config.hasKey && difficulty >= 3,
    portals: !!config.portals && difficulty >= 3,
    /** Spread mode: turns between hazard advances. */
    period: scale(difficulty, [2, 2, 1, 1]),
    /** Spread mode: hazard sources. */
    sources: scale(difficulty, [1, 1, 2, 2]),
    maxSpeed: scale(difficulty, [2, 2, 3, 3]),
    lives: mode === 'inertia' ? scale(difficulty, [3, 3, 2, 2]) : 1,
    budgetFactor: difficulty >= 4 ? 2.5 : 0,
    timeLimit: scale(difficulty, [0, 0, 180, 150]),
    range: solutionRange(mode, difficulty),
  }
}
export type Settings = ReturnType<typeof settings>

// ── Level & engine ─────────────────────────────────────────────────────────────
//
// Terrain tiles (start/exit/key/portals are positions, not tiles):
//   '#' wall   'B' stone   'o' peg   '-' bar (cross sideways only)   '|' bar (fall through only)
//   '.' floor  '*' ice     ',' medium (cedar / lowland)   '~' rough ground (stops a charge)
//   'u' 'r' 'd' 'l' currents   'U' 'R' 'D' 'L' strong currents   'P' 'Q' portal pair   'F' hazard source

export interface Level {
  mode: Mode
  size: number
  grid: string[][]
  start: Pos
  exit: Pos
  key: Pos | null
  portals: [Pos, Pos] | null
  /** Spread mode: the turn at which each cell is burning (Infinity = never). */
  burnTime: number[][] | null
  period: number
  maxSpeed: number
  /** Optimal input sequence found at generation time. */
  solution: Dir[]
}

export interface GameState {
  r: number
  c: number
  hasKey: boolean
  dir: Dir
  speed: number
  /** Inputs that did something. */
  turn: number
  lives: number
  /** Cells traversed by the last move. */
  path: Pos[]
  status: 'playing' | 'won' | 'lost'
  lostHow: string
}

export function initialState(level: Level, lives: number): GameState {
  return { r: level.start[0], c: level.start[1], hasKey: false, dir: 2, speed: 0, turn: 0, lives, path: [], status: 'playing', lostHow: '' }
}

const ARROW: Record<string, Dir> = { u: 0, r: 1, d: 2, l: 3, U: 0, R: 1, D: 2, L: 3 }
const isStrong = (t: string) => t === 'U' || t === 'R' || t === 'D' || t === 'L'
const same = (a: Pos | null, r: number, c: number) => a !== null && a[0] === r && a[1] === c

function passable(level: Level, hasKey: boolean, turn: number, r: number, c: number, dir: Dir): boolean {
  const t = level.grid[r]?.[c]
  if (t === undefined || t === '#' || t === 'B' || t === 'o' || t === 'F') return false
  if (t === '-' && dir % 2 === 0) return false   // a bar across the shaft: cannot fall through it
  if (t === '|' && dir % 2 === 1) return false   // an upright bar: cannot slide across it
  if (level.key && !hasKey && same(level.exit, r, c)) return false   // locked door
  if (level.burnTime && level.burnTime[r][c] <= turn) return false   // already burning / flooded
  return true
}

interface MoveResult {
  r: number; c: number; hasKey: boolean; dir: Dir; speed: number
  path: Pos[]; crashed: boolean; acted: boolean
}

const NOOP = (st: GameState): MoveResult =>
  ({ r: st.r, c: st.c, hasKey: st.hasKey, dir: st.dir, speed: st.speed, path: [], crashed: false, acted: false })

/** Resolve one input under the level's physics. Pure; shared by the UI and the solver. */
export function resolveMove(level: Level, st: GameState, input: Dir): MoveResult {
  if (level.mode === 'inertia') return resolveInertia(level, st, input)
  let { r, c, hasKey } = st
  const turn = st.turn
  const here = level.grid[r][c]
  if (isStrong(here) && ARROW[here] === opposite(input)) return NOOP(st)
  if (!passable(level, hasKey, turn, r + DR[input], c + DC[input], input)) return NOOP(st)
  const path: Pos[] = []
  let moving = input
  r += DR[input]; c += DC[input]; path.push([r, c])
  for (let guard = 0; guard < 80; guard++) {
    if (same(level.key, r, c)) hasKey = true
    if (same(level.exit, r, c)) break
    const t = level.grid[r][c]
    let next: Dir | null = null
    if ((t === 'P' || t === 'Q') && level.portals) {
      const [a, b] = level.portals
      const dest = same(a, r, c) ? b : a
      r = dest[0]; c = dest[1]; path.push([r, c])
      next = moving
    } else if (t in ARROW) {
      moving = ARROW[t]; next = moving
    } else if (t === '*') {
      next = moving
    }
    if (next === null) break
    const nr = r + DR[next], nc = c + DC[next]
    if (!passable(level, hasKey, turn, nr, nc, next)) break
    r = nr; c = nc; path.push([r, c])
  }
  return { r, c, hasKey, dir: input, speed: 0, path, crashed: false, acted: true }
}

function resolveInertia(level: Level, st: GameState, input: Dir): MoveResult {
  let { r, c, hasKey, dir, speed } = st
  const turn = st.turn
  let braked = false
  if (speed === 0) { dir = input; speed = 1 }
  else if (input === dir) speed = Math.min(speed + 1, level.maxSpeed)
  else if (input === opposite(dir)) { speed -= 1; braked = true }
  else dir = input                                   // a turn keeps your pace
  const path: Pos[] = []
  let crashed = false
  for (let i = 0; i < speed; i++) {
    const nr = r + DR[dir], nc = c + DC[dir]
    if (!passable(level, hasKey, turn, nr, nc, dir)) { crashed = speed >= 2; speed = 0; break }
    r = nr; c = nc; path.push([r, c])
    if (same(level.key, r, c)) hasKey = true
    if (same(level.exit, r, c)) break
    if (level.grid[r][c] === '~') { speed = 0; break }   // rough ground: the charge stops dead
  }
  const acted = path.length > 0 || crashed || braked
  return acted ? { r, c, hasKey, dir, speed, path, crashed, acted } : NOOP(st)
}

/** Advance the game by one input. Returns the same object when the input does nothing. */
export function step(level: Level, st: GameState, input: Dir): GameState {
  if (st.status !== 'playing') return st
  const m = resolveMove(level, st, input)
  if (!m.acted) return st
  const turn = st.turn + 1
  let lives = st.lives
  let status: GameState['status'] = 'playing'
  let lostHow = ''
  if (m.crashed) { lives -= 1; if (lives <= 0) { status = 'lost'; lostHow = 'crashed' } }
  if (same(level.exit, m.r, m.c)) status = 'won'
  else if (status === 'playing' && level.burnTime && level.burnTime[m.r][m.c] <= turn) { status = 'lost'; lostHow = 'caught' }
  return { r: m.r, c: m.c, hasKey: m.hasKey, dir: m.dir, speed: m.speed, turn, lives, path: m.path, status, lostHow }
}

// ── Solver ─────────────────────────────────────────────────────────────────────

function stateKey(level: Level, s: GameState): number {
  const n = level.size
  const base = (s.r * n + s.c) * 2 + (s.hasKey ? 1 : 0)
  return level.mode === 'inertia' ? (base * 4 + s.dir) * 4 + s.speed : base
}

interface Explored {
  /** Fewest inputs to reach each state key (for spread, also the time of arrival). */
  dist: Map<number, number>
  /** Fewest inputs to come to rest on each cell with the key (or no key needed). */
  cellDist: Map<number, number>
  solution: Dir[] | null
}

/**
 * BFS over the mode's state space, counting inputs.  Spread mode is safe to
 * treat as a plain BFS: arriving at a state earlier is never worse, since the
 * hazard only ever tightens the constraints.
 */
function explore(level: Level, stopAtExit: boolean, maxDepth = 60): Explored {
  const start = initialState(level, 99)
  const dist = new Map<number, number>()
  const cellDist = new Map<number, number>()
  const parent = new Map<number, { key: number; dir: Dir }>()
  const n = level.size
  let queue: GameState[] = [start]
  dist.set(stateKey(level, start), 0)
  if (!level.key) cellDist.set(start.r * n + start.c, 0)
  let solution: Dir[] | null = null
  for (let depth = 0; queue.length && depth < maxDepth && !solution; depth++) {
    const nextQueue: GameState[] = []
    for (const st of queue) {
      const fromKey = stateKey(level, st)
      for (const d of DIRS) {
        const nx = step(level, st, d)
        if (nx === st || nx.status === 'lost' || nx.lives < st.lives) continue
        const k = stateKey(level, nx)
        if (dist.has(k)) continue
        dist.set(k, depth + 1)
        parent.set(k, { key: fromKey, dir: d })
        const cell = nx.r * n + nx.c
        if ((nx.hasKey || !level.key) && !cellDist.has(cell)) cellDist.set(cell, depth + 1)
        if (nx.status === 'won') {
          if (stopAtExit) {
            const moves: Dir[] = []
            let cur = k
            while (parent.has(cur)) { const p = parent.get(cur)!; moves.push(p.dir); cur = p.key }
            solution = moves.reverse()
            break
          }
          continue
        }
        nextQueue.push(nx)
      }
      if (solution) break
    }
    queue = nextQueue
  }
  return { dist, cellDist, solution }
}

/** Optimal input sequence from start to exit, or null when the level cannot be won. */
export function solve(level: Level, maxDepth = 60): Dir[] | null {
  return explore(level, true, maxDepth).solution
}

// ── Generation ─────────────────────────────────────────────────────────────────

function fillTile(mode: Mode, rng: Rng, strongWinds: boolean): string {
  const x = rng()
  const arrow = () => 'urdl'[Math.floor(rng() * 4)]
  switch (mode) {
    case 'slide':    return x < 0.05 ? '#' : x < 0.19 ? 'B' : '*'
    case 'gravity':  return x < 0.05 ? '#' : x < 0.15 ? 'o' : x < 0.20 ? '-' : x < 0.23 ? '|' : '*'
    case 'current':  return x < 0.17 ? '#' : x < 0.30 ? arrow() : (strongWinds && x < 0.35) ? arrow().toUpperCase() : '.'
    case 'inertia':  return x < 0.15 ? '#' : x < 0.22 ? '~' : '.'
    case 'spread':   return x < 0.16 ? '#' : x < 0.68 ? ',' : '.'
    case 'elements': return x < 0.12 ? '#' : x < 0.16 ? 'B' : x < 0.48 ? '*' : x < 0.58 ? arrow() : '.'
  }
}

const PLAIN = new Set(['.', '*', ','])
const manhattan = (a: Pos, b: Pos) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])

function randomCell(n: number, rng: Rng, ok: (r: number, c: number) => boolean): Pos | null {
  for (let i = 0; i < 60; i++) {
    const r = 1 + Math.floor(rng() * (n - 2)), c = 1 + Math.floor(rng() * (n - 2))
    if (ok(r, c)) return [r, c]
  }
  return null
}

function burnTimes(grid: string[][], period: number): number[][] {
  const n = grid.length
  const bt = grid.map(row => row.map(() => Infinity))
  const queue: Pos[] = []
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (grid[r][c] === 'F') { bt[r][c] = 0; queue.push([r, c]) }
  while (queue.length) {
    const [r, c] = queue.shift()!
    for (const d of DIRS) {
      const nr = r + DR[d], nc = c + DC[d]
      if (grid[nr]?.[nc] === ',' && bt[nr][nc] === Infinity) { bt[nr][nc] = bt[r][c] + period; queue.push([nr, nc]) }
    }
  }
  return bt
}

function tryGenerate(s: Settings, difficulty: Difficulty, rng: Rng, attempt: number): Level | null {
  const n = s.size, mode = s.mode
  const [lo, hi] = s.range
  const grid: string[][] = []
  for (let r = 0; r < n; r++) {
    const row: string[] = []
    for (let c = 0; c < n; c++) row.push(r === 0 || c === 0 || r === n - 1 || c === n - 1 ? '#' : fillTile(mode, rng, difficulty >= 2))
    grid.push(row)
  }

  const floorAt = (r: number, c: number) => PLAIN.has(grid[r][c])
  const start = randomCell(n, rng, (r, c) => floorAt(r, c) && (mode !== 'spread' || grid[r][c] === '.' || rng() < 0.5))
  if (!start) return null

  // Spread: the race must be real, so the hazard reaches the exit not long after
  // a perfect run (and never before). Late attempts relax the pressure a little.
  const slack = scale(difficulty, [8, 7, 6, 5]) + Math.floor(attempt / 150)
  if (mode === 'spread') {
    const minGap = Math.ceil(n * 0.55)
    const sources = attempt >= 300 ? 1 : s.sources
    for (let i = 0; i < sources; i++) {
      const src = randomCell(n, rng, (r, c) => grid[r][c] === ',' && manhattan([r, c], start) >= minGap)
      if (!src) return null
      grid[src[0]][src[1]] = 'F'
    }
  }

  let portals: [Pos, Pos] | null = null
  if (s.portals) {
    const a = randomCell(n, rng, (r, c) => grid[r][c] === '*' && manhattan([r, c], start) >= 2)
    const b = a && randomCell(n, rng, (r, c) => grid[r][c] === '*' && manhattan([r, c], a) >= 3 && manhattan([r, c], start) >= 2)
    if (!a || !b) return null
    grid[a[0]][a[1]] = 'P'; grid[b[0]][b[1]] = 'Q'
    portals = [a, b]
  }

  const level: Level = {
    mode, size: n, grid, start, exit: [-1, -1], key: null, portals,
    burnTime: mode === 'spread' ? burnTimes(grid, s.period) : null,
    period: s.period, maxSpeed: s.maxSpeed, solution: [],
  }

  const pickCell = (cands: Pos[]): Pos => cands[Math.floor(rng() * cands.length)]

  if (s.hasKey) {
    const { cellDist } = explore(level, false)
    const cands: Pos[] = []
    for (const [cell, d] of cellDist) {
      const r = Math.floor(cell / n), c = cell % n
      if (d >= 2 && d <= Math.max(2, hi - 2) && floorAt(r, c) && !same(start, r, c)) cands.push([r, c])
    }
    if (!cands.length) return null
    level.key = pickCell(cands)
  }

  const { cellDist } = explore(level, false)
  const cands: Pos[] = []
  for (const [cell, d] of cellDist) {
    if (d < lo || d > hi) continue
    const r = Math.floor(cell / n), c = cell % n
    if (same(start, r, c) || same(level.key, r, c)) continue
    if (mode === 'spread') {
      if (grid[r][c] !== ',') continue
      const reach = level.burnTime![r][c]
      if (reach < d || reach > d + slack) continue
    }
    else if (mode === 'inertia') { if (grid[r][c] !== '.') continue }
    else if (!floorAt(r, c)) continue
    cands.push([r, c])
  }
  if (!cands.length) return null
  // Prefer the deeper half of the candidates so boards feel like journeys.
  const mid = (lo + hi) / 2
  const deep = cands.filter(([r, c]) => (cellDist.get(r * n + c) ?? 0) >= mid)
  level.exit = pickCell(deep.length ? deep : cands)

  const solution = solve(level)
  if (!solution || solution.length < lo || solution.length > hi) return null
  if (mode === 'spread') {
    const reach = level.burnTime![level.exit[0]][level.exit[1]]
    if (reach < solution.length || reach > solution.length + slack) return null
  }
  level.solution = solution
  return level
}

/** A trivially winnable corridor, only used if generation fails for every attempt. */
function fallbackLevel(s: Settings): Level {
  const n = s.size
  const grid = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) =>
    r === 0 || c === 0 || r === n - 1 || c === n - 1 ? '#' : (s.mode === 'inertia' || s.mode === 'current' || s.mode === 'spread' || s.mode === 'elements') ? '.' : '*'))
  const level: Level = {
    mode: s.mode, size: n, grid, start: [1, 1], exit: [n - 2, n - 2], key: null, portals: null,
    burnTime: null, period: s.period, maxSpeed: s.maxSpeed, solution: [],
  }
  level.solution = solve(level) ?? []
  return level
}

/** Build a verified level for a config/difficulty/seed; the seed reshuffles on retry. */
export function generateLevel(config: MazeConfig, difficulty: Difficulty, seed: number, levelIdx = 0): Level {
  const s = settings(config, difficulty)
  const rng = mulberry32((config.seedBase + seed * 31 + levelIdx * 7919) >>> 0)
  for (let attempt = 0; attempt < 600; attempt++) {
    const level = tryGenerate(s, difficulty, rng, attempt)
    if (level) return level
  }
  return fallbackLevel(s)
}

// ── Presentation ───────────────────────────────────────────────────────────────

export function ruleText(mode: Mode, period: number): string {
  switch (mode) {
    case 'slide':    return 'Ice: one push and you slide until a wall, a stone or the exit stops you.'
    case 'gravity':  return 'Tilt the shaft: you fall that way until something stops you. Bars ━ can be crossed but not fallen through; ┃ the reverse. 🌀 portals carry you onward.'
    case 'current':  return 'Step once, then the arrow under you carries you one cell further. Bold arrows are too strong to move against.'
    case 'inertia':  return 'Each tap adds speed and you keep going; tap the opposite way to brake one notch. Hitting a wall at speed 2+ costs a life. Rough ground ∴ stops you.'
    case 'spread':   return period > 1
      ? 'The hazard spreads one cell every 2 turns through its medium; bare rock does not burn. Reach the exit before it closes the route.'
      : 'The hazard spreads one cell every turn through its medium; bare rock does not burn. Reach the exit before it closes the route.'
    case 'elements': return 'Read the ground: ice slides you on, wind pushes you along its arrow, bare earth stops you.'
  }
}

const MODE_LABEL: Record<Mode, string> = {
  slide: 'Ice', gravity: 'Gravity', current: 'Currents', inertia: 'Momentum', spread: 'Spreading hazard', elements: 'Elements',
}

interface ThemeDef {
  wall: string; floor: string; ice: string; medium: string; rock: string; stone: string
  text: string; hazard: string; hazardBg: string; mediumGlyph: string
}

const THEME: Record<Theme, ThemeDef> = {
  sandstone: { wall: 'bg-amber-300', floor: 'bg-amber-50', ice: 'bg-amber-100', medium: 'bg-amber-200', rock: 'bg-stone-300', stone: 'bg-amber-800', text: 'text-amber-800', hazard: '🔥', hazardBg: 'bg-orange-300', mediumGlyph: '' },
  cedar:     { wall: 'bg-green-300', floor: 'bg-stone-200', ice: 'bg-sky-100', medium: 'bg-lime-200', rock: 'bg-stone-200', stone: 'bg-green-800', text: 'text-green-800', hazard: '🔥', hazardBg: 'bg-orange-300', mediumGlyph: '🌲' },
  mountain:  { wall: 'bg-stone-400', floor: 'bg-stone-50', ice: 'bg-stone-100', medium: 'bg-emerald-100', rock: 'bg-stone-300', stone: 'bg-stone-600', text: 'text-stone-700', hazard: '🌊', hazardBg: 'bg-blue-300', mediumGlyph: '🌾' },
  ice:       { wall: 'bg-slate-300', floor: 'bg-sky-50', ice: 'bg-sky-100', medium: 'bg-sky-100', rock: 'bg-stone-300', stone: 'bg-slate-500', text: 'text-sky-800', hazard: '🌨️', hazardBg: 'bg-sky-300', mediumGlyph: '' },
  sea:       { wall: 'bg-stone-300', floor: 'bg-sky-100', ice: 'bg-sky-200', medium: 'bg-sky-100', rock: 'bg-stone-300', stone: 'bg-stone-500', text: 'text-sky-800', hazard: '🌊', hazardBg: 'bg-blue-300', mediumGlyph: '' },
  sky:       { wall: 'bg-slate-200', floor: 'bg-sky-100', ice: 'bg-sky-200', medium: 'bg-sky-100', rock: 'bg-stone-300', stone: 'bg-slate-400', text: 'text-blue-800', hazard: '⚡', hazardBg: 'bg-yellow-200', mediumGlyph: '' },
  steppe:    { wall: 'bg-yellow-300', floor: 'bg-yellow-50', ice: 'bg-sky-100', medium: 'bg-lime-200', rock: 'bg-stone-300', stone: 'bg-yellow-800', text: 'text-yellow-800', hazard: '🔥', hazardBg: 'bg-orange-300', mediumGlyph: '' },
  bamboo:    { wall: 'bg-emerald-300', floor: 'bg-emerald-50', ice: 'bg-sky-100', medium: 'bg-lime-200', rock: 'bg-stone-300', stone: 'bg-emerald-800', text: 'text-emerald-800', hazard: '🔥', hazardBg: 'bg-orange-300', mediumGlyph: '' },
}

const ARROW_GLYPH: Record<string, string> = { u: '↑', r: '→', d: '↓', l: '←', U: '⇈', R: '⇉', D: '⇊', L: '⇇' }
const DIR_GLYPH = ['↑', '→', '↓', '←']

// ── Component ──────────────────────────────────────────────────────────────────

export default function BigMazeGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const paramMode = params?.mode, paramSize = params?.size, paramLevels = params?.levels
  const config = useMemo(
    () => resolveMazeConfig(configId, { mode: paramMode, size: paramSize, levels: paramLevels }),
    [configId, paramMode, paramSize, paramLevels])
  const rules = useMemo(() => settings(config, difficulty), [config, difficulty])
  const th = THEME[config.theme]
  const { outcome, lost, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })
  const [lostHow, setLostHow] = useState('')
  const fail = useCallback((how: string) => { setLostHow(how); lose(how) }, [lose])
  const timer = useGameTimer({ seconds: rules.timeLimit, running: !outcome, onExpire: () => fail('out of time') })

  const [levelIdx, setLevelIdx] = useState(0)
  const [level, setLevel] = useState<Level>(() => generateLevel(config, difficulty, seed, 0))
  const [gs, setGs] = useState<GameState>(() => initialState(level, rules.lives))
  const [levelFlash, setLevelFlash] = useState(true)
  const [crashFlash, setCrashFlash] = useState(false)
  const stepBudget = rules.budgetFactor
    ? Math.max(level.solution.length + 4, Math.ceil(level.solution.length * rules.budgetFactor)) : 0

  useEffect(() => { const t = setTimeout(() => setLevelFlash(false), 900); return () => clearTimeout(t) }, [])

  const live = useRef({ gs, level, levelIdx, outcome, levelFlash })
  useEffect(() => { live.current = { gs, level, levelIdx, outcome, levelFlash } }, [gs, level, levelIdx, outcome, levelFlash])

  const loadLevel = useCallback((idx: number) => {
    const next = generateLevel(config, difficulty, seed, idx)
    setLevel(next)
    setGs(initialState(next, rules.lives))
    setLevelFlash(true)
    setTimeout(() => setLevelFlash(false), 900)
  }, [config, difficulty, seed, rules.lives])

  const move = useCallback((d: Dir) => {
    const cur = live.current
    if (cur.outcome || cur.levelFlash) return
    const next = step(cur.level, cur.gs, d)
    if (next === cur.gs) return
    setGs(next)
    live.current = { ...cur, gs: next }
    if (next.lives < cur.gs.lives) { setCrashFlash(true); setTimeout(() => setCrashFlash(false), 500) }
    if (next.status === 'won') {
      const nextIdx = cur.levelIdx + 1
      if (nextIdx >= rules.levels) win()
      else { setLevelIdx(nextIdx); setTimeout(() => loadLevel(nextIdx), 350) }
      return
    }
    if (next.status === 'lost') { fail(next.lostHow); return }
    if (stepBudget && next.turn >= stepBudget) fail('out of steps')
  }, [rules.levels, loadLevel, fail, win, stepBudget])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W': e.preventDefault(); move(0); break
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); move(1); break
        case 'ArrowDown':  case 's': case 'S': e.preventDefault(); move(2); break
        case 'ArrowLeft':  case 'a': case 'A': e.preventDefault(); move(3); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [move])

  const n = level.size
  const cell = Math.min(32, Math.floor(304 / n))
  const fog = rules.fogRadius
  const trail = new Set(gs.path.map(([r, c]) => r * n + c))
  const mode = level.mode

  const cells: JSX.Element[] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const t = level.grid[r][c]
      const isPlayer = r === gs.r && c === gs.c
      const hidden = fog > 0 && Math.max(Math.abs(r - gs.r), Math.abs(c - gs.c)) > fog
      const burning = !!level.burnTime && level.burnTime[r][c] <= gs.turn
      const isExit = same(level.exit, r, c)
      const isKey = !gs.hasKey && same(level.key, r, c)
      const isPortal = t === 'P' || t === 'Q'

      let bg = th.floor
      if (t === '#') bg = th.wall
      else if (t === '*') bg = th.ice
      else if (t === ',' || t === 'F') bg = th.medium
      else if (t === '.' && mode === 'spread') bg = th.rock
      else if (t === '~') bg = 'bg-amber-200'
      else if (isStrong(t)) bg = 'bg-sky-300'
      else if (t in ARROW) bg = 'bg-sky-200'
      else if (isPortal) bg = 'bg-violet-200'
      if (burning) bg = th.hazardBg
      if (isExit) bg = 'bg-emerald-200'
      if (hidden) bg = 'bg-paper-2'

      cells.push(
        <div key={r * n + c} className={`relative flex items-center justify-center ${bg}`} style={{ width: cell, height: cell }}>
          {!hidden && t === '#' && <div className="absolute inset-0.5 rounded-sm border border-line-2/40" />}
          {!hidden && t === 'B' && <div className={`rounded ${th.stone}`} style={{ width: cell * 0.62, height: cell * 0.62 }} />}
          {!hidden && t === 'o' && <div className={`rounded-full ${th.stone}`} style={{ width: cell * 0.4, height: cell * 0.4 }} />}
          {!hidden && t === '-' && <div className={`absolute left-0 right-0 ${th.stone}`} style={{ top: cell / 2 - 2, height: 4 }} />}
          {!hidden && t === '|' && <div className={`absolute top-0 bottom-0 ${th.stone}`} style={{ left: cell / 2 - 2, width: 4 }} />}
          {!hidden && !burning && t in ARROW && !isPlayer && (
            <span className={`leading-none select-none ${isStrong(t) ? 'text-sky-900 font-black' : 'text-sky-700'}`} style={{ fontSize: cell * 0.6 }}>{ARROW_GLYPH[t]}</span>)}
          {!hidden && !burning && t === ',' && !isPlayer && !isExit && th.mediumGlyph && (
            <span className="leading-none select-none opacity-60" style={{ fontSize: cell * 0.45 }}>{th.mediumGlyph}</span>)}
          {!hidden && t === '~' && !isPlayer && <span className="text-amber-700 leading-none select-none" style={{ fontSize: cell * 0.5 }}>∴</span>}
          {!hidden && trail.has(r * n + c) && !isPlayer && <div className="absolute w-1.5 h-1.5 rounded-full bg-accent/40" />}
          {!hidden && burning && !isPlayer && <span className="leading-none select-none" style={{ fontSize: cell * 0.6 }}>{th.hazard}</span>}
          {!hidden && isPortal && !isPlayer && <span className="leading-none select-none" style={{ fontSize: cell * 0.6 }}>🌀</span>}
          {!hidden && isExit && !isPlayer && <span className="leading-none select-none" style={{ fontSize: cell * 0.6 }}>{level.key && !gs.hasKey ? '🔒' : '🚪'}</span>}
          {!hidden && isKey && !isPlayer && <span className="leading-none select-none" style={{ fontSize: cell * 0.55 }}>🔑</span>}
          {isPlayer && (
            <div className={`z-10 rounded-full flex items-center justify-center border-2 ${lost ? 'bg-red-200 border-red-500' : 'bg-panel border-accent'} ${crashFlash ? 'animate-pulse' : ''}`}
              style={{ width: cell - 4, height: cell - 4, fontSize: cell * 0.55 }}>
              <span className="leading-none select-none">{config.actor}</span>
            </div>
          )}
        </div>
      )
    }
  }

  const lostLabel = lostHow === 'out of steps' ? 'Out of steps' : lostHow === 'out of time' ? 'Out of time'
    : lostHow === 'crashed' ? 'Wrecked at speed' : mode === 'spread' ? 'The hazard caught you' : 'Lost'

  return (
    <div className="flex flex-col items-center gap-3 text-ink select-none">
      <div className="text-center">
        <p className={`font-bold text-sm tracking-wide ${th.text}`}>{config.title}</p>
        <p className="text-muted text-[10px]">{config.subtitle}</p>
      </div>

      {timer.active && <div className="w-full max-w-[304px]"><TimerBar remaining={timer.remaining} total={timer.total} /></div>}

      <div className="flex items-center gap-3 text-xs flex-wrap justify-center">
        <span className="text-muted">Level <span className={`font-bold ${th.text}`}>{levelIdx + 1}/{rules.levels}</span></span>
        <span className={stepBudget && gs.turn > stepBudget * 0.8 ? 'text-red-600 font-bold' : 'text-muted'}>
          Moves <span className={`font-bold ${th.text}`}>{gs.turn}</span>{stepBudget ? ` / ${stepBudget}` : ''}
        </span>
        {mode === 'inertia' && (
          <span className="text-muted">
            Speed <span className={`font-bold ${th.text}`}>{gs.speed}</span>
            <span className="ml-2">{'♥'.repeat(Math.max(0, gs.lives))}<span className="text-line-2">{'♥'.repeat(Math.max(0, rules.lives - gs.lives))}</span></span>
          </span>
        )}
        {level.key && (
          <span className={gs.hasKey ? 'text-yellow-700 font-bold' : 'text-muted'}>{gs.hasKey ? '🔑 Key collected' : '🔑 Find the key'}</span>
        )}
      </div>

      <div className="relative rounded-xl overflow-hidden border border-line bg-paper-2" style={{ width: cell * n, height: cell * n }}>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${n}, ${cell}px)`, gridTemplateRows: `repeat(${n}, ${cell}px)` }}>
          {cells}
        </div>

        {levelFlash && (
          <div className="absolute inset-0 bg-paper/70 flex items-center justify-center pointer-events-none z-20">
            <div className="bg-panel border border-line rounded-xl px-5 py-3 text-center">
              <p className={`font-bold text-sm ${th.text}`}>Level {levelIdx + 1} / {rules.levels}</p>
              <p className="text-ink-2 text-[11px] mt-0.5">{MODE_LABEL[mode]}</p>
            </div>
          </div>
        )}
        {outcome === 'won' && <div className="absolute inset-0 bg-emerald-300/30 pointer-events-none z-20 animate-pulse" />}
        {lost && (
          <div className="absolute inset-0 bg-red-200/50 flex items-center justify-center z-20">
            <p className="bg-panel border border-red-300 rounded-xl px-4 py-2 text-ink font-bold text-sm">{lostLabel}</p>
          </div>
        )}
      </div>

      <p className="text-ink-2 text-[10px] text-center max-w-[304px] leading-snug">
        <span className={`font-bold ${th.text}`}>{MODE_LABEL[mode]} · </span>
        {ruleText(mode, level.period)}
        {level.key && !gs.hasKey && ' Find the 🔑 first.'}
      </p>

      <div className="flex flex-col items-center gap-1">
        <DPadBtn label="↑" onClick={() => move(0)} />
        <div className="flex items-center gap-1">
          <DPadBtn label="←" onClick={() => move(3)} />
          <div className="flex items-center justify-center rounded-lg bg-panel-2 border border-line text-ink-2 text-xs font-bold" style={{ width: 44, height: 44 }}>
            {mode === 'gravity' ? <span className="text-base">{DIR_GLYPH[gs.dir]}</span>
              : mode === 'inertia' ? <span>{gs.speed > 0 ? `${DIR_GLYPH[gs.dir]}${gs.speed}` : '·'}</span>
              : <div className="w-2 h-2 rounded-full bg-line-2" />}
          </div>
          <DPadBtn label="→" onClick={() => move(1)} />
        </div>
        <DPadBtn label="↓" onClick={() => move(2)} />
      </div>
    </div>
  )
}

function DPadBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onPointerDown={e => { e.preventDefault(); onClick() }}
      className="flex items-center justify-center rounded-lg border text-lg font-bold
        bg-panel border-line text-ink-2
        hover:bg-panel-2 active:bg-accent/30 active:border-accent/50
        transition-all duration-100 select-none touch-none"
      style={{ width: 44, height: 44 }}
    >
      {label}
    </button>
  )
}
