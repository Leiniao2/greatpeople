import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { artTexture, type GameArtKey } from '@/games/art'
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
//   labyrinth a big corridor maze (21×21 up to 41×41) seen through a scrolling
//             viewport: coloured keys open matching doors, optional relics,
//             wandering (D1–2) or chasing (D3–4) monsters, fog at D3–4 and a
//             step budget at D4.  The big configs end on one as their finale.
//
// Levels are generated from the seed and verified solvable by a BFS over the
// mode's own state space (position + key + velocity, with time for spread),
// so every retry reshuffles and every board has a solution in a sane range.

// ── Types ──────────────────────────────────────────────────────────────────────

export type PhysicsMode = 'slide' | 'gravity' | 'current' | 'inertia' | 'spread' | 'elements'
export type Mode = PhysicsMode | 'labyrinth'
export const PHYSICS_MODES: readonly PhysicsMode[] = ['slide', 'gravity', 'current', 'inertia', 'spread', 'elements']
export const MODES: readonly Mode[] = [...PHYSICS_MODES, 'labyrinth']
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
  /** One physics mode, or one per difficulty tier. */
  mode: PhysicsMode | readonly [PhysicsMode, PhysicsMode, PhysicsMode, PhysicsMode]
  /** Physics levels (capped per difficulty). */
  levels: number
  /** End on a big labyrinth after the physics levels. */
  finale?: boolean
  /** Only the labyrinth (params.mode = 'labyrinth'). */
  labyrinthOnly?: boolean
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
    theme: 'sandstone', actor: '🔺', mode: 'gravity', levels: 3, hasKey: true, fog: true, portals: true, finale: true, seedBase: 17,
  },
  'pleistoanax-mountain': {
    title: 'Mount Lycaeum', subtitle: 'A rockfall descent from exile through the sacred mountain',
    theme: 'mountain', actor: '🪨', mode: 'gravity', levels: 2, hasKey: false, fog: true, seedBase: 99,
  },
  'everest-summit': {
    title: 'Ascent to the Summit', subtitle: 'Slide across the ice walls of Everest to reach the top',
    theme: 'ice', actor: '🧗', mode: 'slide', levels: 3, hasKey: true, fog: true, finale: true, seedBase: 137,
  },
  'everest-peak': {
    title: 'The Final Approach', subtitle: 'Through ice and wind, reach the roof of the world',
    theme: 'ice', actor: '🧗', mode: 'slide', levels: 2, hasKey: true, fog: true, finale: true, seedBase: 201,
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
    theme: 'cedar', actor: '🏃', mode: 'spread', levels: 2, hasKey: false, fog: false, finale: true, seedBase: 55,
  },
  'long-march': {
    title: 'Mountain Pass', subtitle: 'Ford the rivers of the pass, then outrun the rising flood',
    theme: 'mountain', actor: '🚩', mode: ['current', 'current', 'spread', 'spread'], levels: 3, hasKey: false, fog: false, finale: true, seedBase: 73,
  },
  'pacific-strait': {
    title: 'The Strait of Magellan', subtitle: 'Work the currents of the treacherous passage between the oceans',
    theme: 'sea', actor: '⛵', mode: 'current', levels: 2, hasKey: true, fog: false, finale: true, seedBase: 186,
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

const isPhysicsMode = (v: unknown): v is PhysicsMode => typeof v === 'string' && (PHYSICS_MODES as readonly string[]).includes(v)

/**
 * Resolve the config for a challenge.  Only `mode`, `size` and `levels` are
 * honoured from params: story data carries leftover quiz text in
 * params.title/subtitle that must not replace the config's flavour.
 */
export function resolveMazeConfig(configId: string | undefined, params?: Record<string, unknown>): MazeConfig {
  const base = (configId && CONFIGS[configId]) || CONFIGS['pyramid-deep']
  if (!params) return base
  const out: MazeConfig = { ...base }
  if (isPhysicsMode(params.mode)) out.mode = params.mode
  else if (params.mode === 'labyrinth') out.labyrinthOnly = true
  if (typeof params.levels === 'number' && params.levels >= 1 && params.levels <= 3) out.levels = Math.floor(params.levels)
  if (typeof params.size === 'number' && params.size >= 6 && params.size <= 13) out.size = Math.floor(params.size)
  return out
}

// ── Difficulty ─────────────────────────────────────────────────────────────────

/** Inclusive range of inputs an optimal solution may take. */
export function solutionRange(mode: PhysicsMode, difficulty: Difficulty): [number, number] {
  const tiers: Record<'step' | 'glide' | 'inertia', [number, number][]> = {
    step:    [[4, 7], [6, 10], [8, 14], [10, 18]],
    glide:   [[3, 5], [4, 7], [5, 9], [6, 12]],
    inertia: [[3, 6], [4, 8], [5, 10], [6, 12]],
  }
  const kind = mode === 'current' || mode === 'spread' ? 'step' : mode === 'inertia' ? 'inertia' : 'glide'
  const [lo, hi] = tiers[kind][difficulty - 1]
  return [lo, hi]
}

export function resolveMode(config: MazeConfig, difficulty: Difficulty): PhysicsMode {
  return typeof config.mode === 'string' ? config.mode : config.mode[difficulty - 1]
}

export function settings(config: MazeConfig, difficulty: Difficulty) {
  const mode = resolveMode(config, difficulty)
  return {
    mode,
    /** Physics levels; a labyrinth finale, when the config has one, comes after them. */
    levels: config.labyrinthOnly ? 0 : Math.min(config.levels, scale(difficulty, config.finale ? [1, 1, 2, 2] : [1, 2, 2, 3])),
    size: config.size ?? scale(difficulty, [8, 9, 11, 13]),
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

/** The mode of every level in play order: physics levels, then the labyrinth finale. */
export function levelPlan(config: MazeConfig, difficulty: Difficulty): Mode[] {
  const s = settings(config, difficulty)
  const plan: Mode[] = Array.from({ length: s.levels }, () => s.mode)
  if (config.finale || config.labyrinthOnly) plan.push('labyrinth')
  return plan
}

// ── Level & engine ─────────────────────────────────────────────────────────────
//
// Terrain tiles (start/exit/key/portals are positions, not tiles):
//   '#' wall   'B' stone   'o' peg   '-' bar (cross sideways only)   '|' bar (fall through only)
//   '.' floor  '*' ice     ',' medium (cedar / lowland)   '~' rough ground (stops a charge)
//   'u' 'r' 'd' 'l' currents   'U' 'R' 'D' 'L' strong currents   'P' 'Q' portal pair   'F' hazard source

export interface Level {
  mode: PhysicsMode
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

function fillTile(mode: PhysicsMode, rng: Rng, strongWinds: boolean): string {
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
    case 'labyrinth': return 'Find the way out. Coloured keys open matching doors; relics are a bonus. Keep away from the prowlers. Swipe to run down a corridor.'
  }
}

const MODE_LABEL: Record<Mode, string> = {
  slide: 'Ice', gravity: 'Gravity', current: 'Currents', inertia: 'Momentum', spread: 'Spreading hazard', elements: 'Elements', labyrinth: 'Labyrinth',
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

// ── Labyrinth ──────────────────────────────────────────────────────────────────
//
// A big corridor maze: a recursive-backtracker tree on an odd grid, cut into
// regions by coloured doors on the start→exit path, then "braided" (a few
// walls knocked through *inside* each region) so prowlers can be dodged
// without letting anyone bypass a door.  Key i lies in the region just before
// door i, off the main path; relics sit in dead ends.  Solvability is checked
// by a BFS over (position, keys held).

export interface Monster { r: number; c: number; dir: Dir; home: Pos }

export interface Labyrinth {
  n: number
  /** true = wall, indexed r * n + c */
  walls: boolean[]
  start: Pos
  exit: Pos
  doors: Pos[]
  /** keys[i] opens doors[i] */
  keys: Pos[]
  relics: Pos[]
  monsters: Pos[]
  chase: boolean
  /** Chase: how far (in steps) a prowler can sense you. */
  sight: number
  /** Chebyshev view radius; 0 = no fog. */
  fog: number
  lives: number
  /** Step budget; 0 = none. */
  budget: number
  /** Milliseconds between prowler moves. */
  tick: number
  solution: Dir[]
}

export interface LabState {
  r: number; c: number
  /** Bit i: key i held. */
  keys: number
  /** Bit i: door i opened. */
  opened: number
  /** Bit i: relic i collected. */
  relics: number
  steps: number
  lives: number
  checkpoint: Pos
  status: 'playing' | 'won' | 'lost'
  lostHow: string
}

export function labSettings(config: MazeConfig, difficulty: Difficulty, monsterCount?: number) {
  return {
    size: scale(difficulty, [21, 27, 33, 41]),
    doors: scale(difficulty, [0, 1, 2, 3]),
    relics: scale(difficulty, [2, 3, 3, 4]),
    monsters: monsterCount !== undefined ? Math.max(0, Math.min(8, Math.floor(monsterCount))) : scale(difficulty, [2, 3, 4, 5]),
    chase: difficulty >= 3,
    sight: scale(difficulty, [0, 0, 8, 10]),
    fog: scale(difficulty, [0, config.fog ? 7 : 0, 5, 4]),
    lives: scale(difficulty, [3, 3, 2, 2]),
    budgetFactor: difficulty >= 4 ? 2.5 : 0,
    tick: scale(difficulty, [760, 660, 540, 470]),
  }
}

const idxOf = (n: number, r: number, c: number) => r * n + c
const samePos = (a: Pos, b: Pos) => a[0] === b[0] && a[1] === b[1]
const indexAt = (list: Pos[], r: number, c: number) => list.findIndex(p => p[0] === r && p[1] === c)

function openNeighbours(n: number, walls: boolean[], r: number, c: number): number {
  let k = 0
  for (const d of DIRS) { const nr = r + DR[d], nc = c + DC[d]; if (nr >= 0 && nc >= 0 && nr < n && nc < n && !walls[idxOf(n, nr, nc)]) k++ }
  return k
}

/** BFS distances over open cells; `blocked` cells are treated as walls. */
function bfs(n: number, walls: boolean[], from: Pos, blocked?: (i: number) => boolean): Int32Array {
  const dist = new Int32Array(n * n).fill(-1)
  const q = new Int32Array(n * n)
  let head = 0, tail = 0
  const s = idxOf(n, from[0], from[1])
  dist[s] = 0; q[tail++] = s
  while (head < tail) {
    const i = q[head++], r = Math.floor(i / n), c = i % n
    for (const d of DIRS) {
      const nr = r + DR[d], nc = c + DC[d]
      if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue
      const j = idxOf(n, nr, nc)
      if (walls[j] || dist[j] >= 0 || (blocked && blocked(j))) continue
      dist[j] = dist[i] + 1; q[tail++] = j
    }
  }
  return dist
}

function carve(n: number, rng: Rng): boolean[] {
  const walls = Array.from({ length: n * n }, () => true)
  const stack: Pos[] = [[1, 1]]
  walls[idxOf(n, 1, 1)] = false
  while (stack.length) {
    const [r, c] = stack[stack.length - 1]
    const opts = DIRS.filter(d => {
      const nr = r + 2 * DR[d], nc = c + 2 * DC[d]
      return nr > 0 && nc > 0 && nr < n - 1 && nc < n - 1 && walls[idxOf(n, nr, nc)]
    })
    if (!opts.length) { stack.pop(); continue }
    const d = opts[Math.floor(rng() * opts.length)]
    walls[idxOf(n, r + DR[d], c + DC[d])] = false
    walls[idxOf(n, r + 2 * DR[d], c + 2 * DC[d])] = false
    stack.push([r + 2 * DR[d], c + 2 * DC[d]])
  }
  return walls
}

/** Shortest input sequence to the exit, over (position, keys held); null if impossible. */
export function labSolve(lab: Labyrinth): Dir[] | null {
  const { n, walls } = lab
  const K = 1 << lab.keys.length
  const keyAt = new Int8Array(n * n).fill(-1), doorAt = new Int8Array(n * n).fill(-1)
  lab.keys.forEach((p, i) => { keyAt[idxOf(n, p[0], p[1])] = i })
  lab.doors.forEach((p, i) => { doorAt[idxOf(n, p[0], p[1])] = i })
  const S = n * n * K
  const prev = new Int32Array(S).fill(-2)
  const prevDir = new Int8Array(S)
  const q = new Int32Array(S)
  let head = 0, tail = 0
  const s0 = idxOf(n, lab.start[0], lab.start[1]) * K
  prev[s0] = -1; q[tail++] = s0
  const exitCell = idxOf(n, lab.exit[0], lab.exit[1])
  while (head < tail) {
    const s = q[head++], cell = Math.floor(s / K), mask = s % K
    if (cell === exitCell) {
      const out: Dir[] = []
      for (let cur = s; prev[cur] !== -1; cur = prev[cur]) out.push(prevDir[cur] as Dir)
      return out.reverse()
    }
    const r = Math.floor(cell / n), c = cell % n
    for (const d of DIRS) {
      const nr = r + DR[d], nc = c + DC[d]
      if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue
      const j = idxOf(n, nr, nc)
      if (walls[j]) continue
      if (doorAt[j] >= 0 && !(mask & (1 << doorAt[j]))) continue
      const nm = keyAt[j] >= 0 ? mask | (1 << keyAt[j]) : mask
      const ns = j * K + nm
      if (prev[ns] !== -2) continue
      prev[ns] = s; prevDir[ns] = d; q[tail++] = ns
    }
  }
  return null
}

function tryLabyrinth(config: MazeConfig, difficulty: Difficulty, rng: Rng, monsterCount?: number): Labyrinth | null {
  const ls = labSettings(config, difficulty, monsterCount)
  const n = ls.size
  const walls = carve(n, rng)
  const corners: Pos[] = [[1, 1], [1, n - 2], [n - 2, 1], [n - 2, n - 2]]
  const start = corners[Math.floor(rng() * 4)]
  const d0 = bfs(n, walls, start)
  // Exit: one of the farthest cells (top 5%), so the journey spans the maze.
  let maxD = 0
  for (let i = 0; i < n * n; i++) if (d0[i] > maxD) maxD = d0[i]
  const far: number[] = []
  for (let i = 0; i < n * n; i++) if (d0[i] >= maxD * 0.95) far.push(i)
  const ei = far[Math.floor(rng() * far.length)]
  const exit: Pos = [Math.floor(ei / n), ei % n]

  // Main path (tree): walk back from the exit along decreasing distance.
  const path: number[] = [ei]
  for (let cur = ei; d0[cur] > 0;) {
    const r = Math.floor(cur / n), c = cur % n
    for (const d of DIRS) {
      const j = idxOf(n, r + DR[d], c + DC[d])
      if (!walls[j] && d0[j] === d0[cur] - 1) { cur = j; break }
    }
    path.push(cur)
  }
  path.reverse()

  // Doors on corridor cells (exactly two open neighbours) spread along the path.
  const doors: Pos[] = []
  for (let i = 0; i < ls.doors; i++) {
    const target = Math.floor(path.length * (i + 1) / (ls.doors + 1))
    let placed = false
    for (let off = 0; off < 12 && !placed; off++) {
      for (const k of [target + off, target - off]) {
        if (k <= 3 || k >= path.length - 3) continue
        const cell = path[k], r = Math.floor(cell / n), c = cell % n
        if (openNeighbours(n, walls, r, c) !== 2 || doors.some(p => manhattan(p, [r, c]) < 6)) continue
        doors.push([r, c]); placed = true; break
      }
    }
    if (!placed) return null
  }
  const doorSet = new Set(doors.map(p => idxOf(n, p[0], p[1])))

  // Regions: components with every door shut. Region i lies before door i.
  const region = new Int8Array(n * n).fill(-1)
  const seeds: Pos[] = [start, ...doors.map((_, i) => {
    const k = path.indexOf(idxOf(n, doors[i][0], doors[i][1]))
    const cell = path[k + 1]
    return [Math.floor(cell / n), cell % n] as Pos
  })]
  seeds.forEach((p, ri) => {
    const dist = bfs(n, walls, p, j => doorSet.has(j))
    for (let i = 0; i < n * n; i++) if (dist[i] >= 0 && region[i] < 0) region[i] = ri
  })

  // Braid: knock through walls that join two cells of the same region.
  const braid = scale(difficulty, [0.1, 0.1, 0.12, 0.12])
  for (let r = 1; r < n - 1; r++) for (let c = 1; c < n - 1; c++) {
    const i = idxOf(n, r, c)
    if (!walls[i] || (r % 2 === 1) === (c % 2 === 1)) continue
    const [a, b] = r % 2 === 0 ? [idxOf(n, r - 1, c), idxOf(n, r + 1, c)] : [idxOf(n, r, c - 1), idxOf(n, r, c + 1)]
    if (walls[a] || walls[b] || region[a] < 0 || region[a] !== region[b] || doorSet.has(a) || doorSet.has(b)) continue
    // Small loops only: joining cells far apart along the tree would be a shortcut.
    if (Math.abs(d0[a] - d0[b]) > 10) continue
    if (rng() < braid) { walls[i] = false; region[i] = region[a] }
  }

  const taken = new Set<number>([idxOf(n, start[0], start[1]), ei, ...doorSet])
  // Distance of every cell from the main path, inside its region.
  const fromPath = new Int32Array(n * n).fill(-1)
  {
    const q: number[] = []
    for (const p of path) if (!doorSet.has(p)) { fromPath[p] = 0; q.push(p) }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], r = Math.floor(i / n), c = i % n
      for (const d of DIRS) {
        const j = idxOf(n, r + DR[d], c + DC[d])
        if (walls[j] || doorSet.has(j) || fromPath[j] >= 0) continue
        fromPath[j] = fromPath[i] + 1; q.push(j)
      }
    }
  }
  const pickFrom = (cands: number[]): number | null => cands.length ? cands[Math.floor(rng() * cands.length)] : null

  const keys: Pos[] = []
  for (let i = 0; i < doors.length; i++) {
    const inRegion: number[] = []
    for (let j = 0; j < n * n; j++) if (!walls[j] && region[j] === i && !taken.has(j)) inRegion.push(j)
    if (!inRegion.length) return null
    const best = Math.max(...inRegion.map(j => fromPath[j]))
    const k = pickFrom(inRegion.filter(j => fromPath[j] >= Math.max(1, Math.floor(best * 0.6))))
    if (k === null) return null
    keys.push([Math.floor(k / n), k % n]); taken.add(k)
  }

  const deadEnds: number[] = []
  for (let j = 0; j < n * n; j++) {
    const r = Math.floor(j / n), c = j % n
    if (!walls[j] && !taken.has(j) && openNeighbours(n, walls, r, c) === 1) deadEnds.push(j)
  }
  const relics: Pos[] = []
  for (const j of shuffleWith(deadEnds, rng)) {
    if (relics.length >= ls.relics) break
    const p: Pos = [Math.floor(j / n), j % n]
    if (relics.some(q => manhattan(q, p) < n / 3) || keys.some(q => manhattan(q, p) < 4)) continue
    relics.push(p); taken.add(j)
  }

  const monsters: Pos[] = []
  const regionsCount = doors.length + 1
  for (let m = 0; m < ls.monsters; m++) {
    const want = m % regionsCount
    const ok = (j: number) => !walls[j] && !taken.has(j) && d0[j] >= 0 && region[j] >= 0
      && (region[j] === want || regionsCount === 1) && manhattan([Math.floor(j / n), j % n], start) >= 10
      && !doors.some(p => manhattan(p, [Math.floor(j / n), j % n]) < 4)
      && !monsters.some(p => manhattan(p, [Math.floor(j / n), j % n]) < 5)
    const cands: number[] = []
    for (let j = 0; j < n * n; j++) if (ok(j)) cands.push(j)
    const k = pickFrom(cands)
    if (k === null) continue
    monsters.push([Math.floor(k / n), k % n]); taken.add(k)
  }

  const lab: Labyrinth = {
    n, walls, start, exit, doors, keys, relics, monsters,
    chase: ls.chase, sight: ls.sight, fog: ls.fog, lives: ls.lives, budget: 0, tick: ls.tick, solution: [],
  }
  const sol = labSolve(lab)
  if (!sol || sol.length < path.length * 0.7) return null
  lab.solution = sol
  if (ls.budgetFactor) lab.budget = Math.ceil(sol.length * ls.budgetFactor) + 20
  return lab
}

function shuffleWith<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

/** Build a verified labyrinth; deterministic from config, difficulty, seed and level index. */
export function generateLabyrinth(config: MazeConfig, difficulty: Difficulty, seed: number, levelIdx = 0, monsterCount?: number): Labyrinth {
  const rng = mulberry32((config.seedBase * 977 + seed * 131 + levelIdx * 7919 + 0x51ed) >>> 0)
  for (let attempt = 0; attempt < 40; attempt++) {
    const lab = tryLabyrinth(config, difficulty, rng, monsterCount)
    if (lab) return lab
  }
  // Unreachable in practice: a door-free maze is always solvable.
  const easier = tryLabyrinth(config, 1, rng, 0)!
  return easier
}

export function labInitial(lab: Labyrinth): LabState {
  return { r: lab.start[0], c: lab.start[1], keys: 0, opened: 0, relics: 0, steps: 0, lives: lab.lives, checkpoint: lab.start, status: 'playing', lostHow: '' }
}

/** Is (r, c) open to the player holding `keys` (doors already opened stay open)? */
function labOpen(lab: Labyrinth, st: Pick<LabState, 'keys' | 'opened'>, r: number, c: number): boolean {
  const { n } = lab
  if (r < 0 || c < 0 || r >= n || c >= n || lab.walls[idxOf(n, r, c)]) return false
  const di = indexAt(lab.doors, r, c)
  return di < 0 || !!(st.opened & (1 << di)) || !!(st.keys & (1 << di))
}

/** One step. Returns the same object when the way is blocked. */
export function labMove(lab: Labyrinth, st: LabState, d: Dir): LabState {
  if (st.status !== 'playing') return st
  const r = st.r + DR[d], c = st.c + DC[d]
  if (!labOpen(lab, st, r, c)) return st
  const next: LabState = { ...st, r, c, steps: st.steps + 1 }
  const di = indexAt(lab.doors, r, c)
  if (di >= 0 && !(st.opened & (1 << di))) { next.opened = st.opened | (1 << di); next.checkpoint = [r, c] }
  const ki = indexAt(lab.keys, r, c)
  if (ki >= 0) next.keys = st.keys | (1 << ki)
  const ri = indexAt(lab.relics, r, c)
  if (ri >= 0) next.relics = st.relics | (1 << ri)
  if (samePos(lab.exit, [r, c])) next.status = 'won'
  else if (lab.budget && next.steps >= lab.budget) { next.status = 'lost'; next.lostHow = 'out of steps' }
  return next
}

/** A prowler caught the player: lose a life and go back to the last door (or the start). */
export function labHit(st: LabState): LabState {
  if (st.status !== 'playing') return st
  const lives = st.lives - 1
  if (lives <= 0) return { ...st, lives: 0, status: 'lost', lostHow: 'caught' }
  return { ...st, lives, r: st.checkpoint[0], c: st.checkpoint[1] }
}

export const monsterAt = (mons: readonly Monster[], r: number, c: number) => mons.findIndex(m => m.r === r && m.c === c)

export function initialMonsters(lab: Labyrinth): Monster[] {
  return lab.monsters.map(p => ({ r: p[0], c: p[1], dir: 0 as Dir, home: p }))
}

/**
 * Move every prowler one cell.  They never pass walls, shut doors or the exit.
 * Wanderers keep going and pick a random new way at junctions; chasers close
 * in along the shortest route once the player is within `sight` steps.
 */
export function stepMonsters(lab: Labyrinth, st: LabState, mons: readonly Monster[], rng: Rng): Monster[] {
  const { n } = lab
  const canGo = (r: number, c: number) => {
    if (r < 0 || c < 0 || r >= n || c >= n || lab.walls[idxOf(n, r, c)] || samePos(lab.exit, [r, c])) return false
    const di = indexAt(lab.doors, r, c)
    return di < 0 || !!(st.opened & (1 << di))
  }
  const toPlayer = lab.chase
    ? bfs(n, lab.walls, [st.r, st.c], j => { const di = indexAt(lab.doors, Math.floor(j / n), j % n); return di >= 0 && !(st.opened & (1 << di)) })
    : null
  const out: Monster[] = []
  for (const m of mons) {
    const opts = DIRS.filter(d => canGo(m.r + DR[d], m.c + DC[d]) && !out.some(o => o.r === m.r + DR[d] && o.c === m.c + DC[d]))
    if (!opts.length) { out.push(m); continue }
    let d: Dir | null = null
    if (toPlayer) {
      const here = toPlayer[idxOf(n, m.r, m.c)]
      if (here > 0 && here <= lab.sight) d = opts.find(o => toPlayer[idxOf(n, m.r + DR[o], m.c + DC[o])] === here - 1) ?? null
    }
    if (d === null) {
      const fwd = opts.filter(o => o !== opposite(m.dir))
      const pool = fwd.length ? fwd : opts
      d = pool.includes(m.dir) && rng() < 0.6 ? m.dir : pool[Math.floor(rng() * pool.length)]
    }
    out.push({ ...m, r: m.r + DR[d], c: m.c + DC[d], dir: d })
  }
  return out
}

// ── Presentation helpers ───────────────────────────────────────────────────────

const THEME_ART: Record<Theme, GameArtKey> = {
  sandstone: 'maze_sandstone', ice: 'maze_ice', cedar: 'maze_cedar', mountain: 'maze_mountain',
  steppe: 'maze_steppe', sea: 'maze_sea', sky: 'maze_sky', bamboo: 'maze_bamboo',
}
const PROWLER: Record<Theme, { glyph: string; name: string }> = {
  sandstone: { glyph: '🦂', name: 'scorpions' }, cedar: { glyph: '👹', name: "Humbaba's watchers" },
  ice: { glyph: '🌪️', name: 'spindrift' }, mountain: { glyph: '🐺', name: 'wolves' },
  steppe: { glyph: '🐺', name: 'wolves' }, sea: { glyph: '🦈', name: 'sharks' },
  sky: { glyph: '⛈️', name: 'storm cells' }, bamboo: { glyph: '🐯', name: 'tigers' },
}
const RELIC: Record<Theme, { glyph: string; name: string }> = {
  sandstone: { glyph: '🏺', name: 'canopic jars' }, cedar: { glyph: '📜', name: 'tablets' },
  ice: { glyph: '🚩', name: 'old flags' }, mountain: { glyph: '📜', name: 'dispatches' },
  steppe: { glyph: '🏺', name: 'jars' }, sea: { glyph: '🧭', name: 'compasses' },
  sky: { glyph: '🧭', name: 'compasses' }, bamboo: { glyph: '📜', name: 'scrolls' },
}
const KEY_COLOURS = [
  { name: 'red', hex: '#dc2626' },
  { name: 'blue', hex: '#2563eb' },
  { name: 'green', hex: '#16a34a' },
]

function useSwipe(onSwipe: (d: Dir) => void) {
  const origin = useRef<[number, number] | null>(null)
  return {
    onPointerDown: (e: React.PointerEvent) => { origin.current = [e.clientX, e.clientY] },
    onPointerUp: (e: React.PointerEvent) => {
      const o = origin.current; origin.current = null
      if (!o) return
      const dx = e.clientX - o[0], dy = e.clientY - o[1]
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return
      onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0))
    },
    onPointerCancel: () => { origin.current = null },
  }
}

function useArrowKeys(onDir: (d: Dir) => void) {
  const cb = useRef(onDir)
  cb.current = onDir
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const d: Dir | undefined = ({ ArrowUp: 0, w: 0, W: 0, ArrowRight: 1, d: 1, D: 1, ArrowDown: 2, s: 2, S: 2, ArrowLeft: 3, a: 3, A: 3 } as Record<string, Dir>)[e.key]
      if (d === undefined) return
      e.preventDefault(); cb.current(d)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}

function DPad({ onDir, repeat, centre }: { onDir: (d: Dir) => void; repeat?: boolean; centre?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <DPadBtn label="↑" onPress={() => onDir(0)} repeat={repeat} />
      <div className="flex items-center gap-1">
        <DPadBtn label="←" onPress={() => onDir(3)} repeat={repeat} />
        <div className="flex items-center justify-center rounded-lg bg-panel-2 border border-line text-ink-2 text-xs font-bold" style={{ width: 48, height: 48 }}>
          {centre ?? <div className="w-2 h-2 rounded-full bg-line-2" />}
        </div>
        <DPadBtn label="→" onPress={() => onDir(1)} repeat={repeat} />
      </div>
      <DPadBtn label="↓" onPress={() => onDir(2)} repeat={repeat} />
    </div>
  )
}

function DPadBtn({ label, onPress, repeat }: { label: string; onPress: () => void; repeat?: boolean }) {
  const timers = useRef<{ t?: ReturnType<typeof setTimeout>; iv?: ReturnType<typeof setInterval> }>({})
  const press = useRef(onPress)
  press.current = onPress
  const stop = () => { clearTimeout(timers.current.t); clearInterval(timers.current.iv); timers.current = {} }
  useEffect(() => stop, [])
  return (
    <button
      aria-label={label}
      onPointerDown={e => {
        e.preventDefault(); stop(); press.current()
        if (repeat) timers.current.t = setTimeout(() => { timers.current.iv = setInterval(() => press.current(), 115) }, 280)
      }}
      onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      className="flex items-center justify-center rounded-lg border text-lg font-bold
        bg-panel border-line text-ink-2
        hover:bg-panel-2 active:bg-accent/30 active:border-accent/50
        transition-all duration-100 select-none touch-none"
      style={{ width: 48, height: 48 }}
    >
      {label}
    </button>
  )
}

interface LevelStats { moves: number; relics?: number; relicTotal?: number; livesLeft?: number }

interface BoardProps {
  config: MazeConfig
  difficulty: Difficulty
  seed: number
  /** Index among levels of this kind (physics boards are numbered from 0). */
  kindIdx: number
  levelNo: number
  levelCount: number
  settled: boolean
  lost: boolean
  lostLabel: string
  onCleared: (stats: LevelStats) => void
  onFail: (how: string) => void
}

// ── Physics board ──────────────────────────────────────────────────────────────

function PhysicsBoard({ config, difficulty, seed, kindIdx, levelNo, levelCount, settled, lost, lostLabel, onCleared, onFail }: BoardProps) {
  const rules = useMemo(() => settings(config, difficulty), [config, difficulty])
  const th = THEME[config.theme]
  const level = useMemo(() => generateLevel(config, difficulty, seed, kindIdx), [config, difficulty, seed, kindIdx])
  const [gs, setGs] = useState<GameState>(() => initialState(level, rules.lives))
  const [intro, setIntro] = useState(true)
  const [crashFlash, setCrashFlash] = useState(false)
  const stepBudget = rules.budgetFactor
    ? Math.max(level.solution.length + 4, Math.ceil(level.solution.length * rules.budgetFactor)) : 0

  useEffect(() => { const t = setTimeout(() => setIntro(false), 900); return () => clearTimeout(t) }, [])

  const live = useRef({ gs, intro, settled })
  live.current = { gs, intro, settled }

  const move = useCallback((d: Dir) => {
    const cur = live.current
    if (cur.settled || cur.intro || cur.gs.status !== 'playing') return
    const next = step(level, cur.gs, d)
    if (next === cur.gs) return
    live.current = { ...cur, gs: next }
    setGs(next)
    if (next.lives < cur.gs.lives) { setCrashFlash(true); setTimeout(() => setCrashFlash(false), 500) }
    if (next.status === 'won') { setTimeout(() => onCleared({ moves: next.turn }), 250); return }
    if (next.status === 'lost') { onFail(next.lostHow); return }
    if (stepBudget && next.turn >= stepBudget) onFail('out of steps')
  }, [level, onCleared, onFail, stepBudget])

  useArrowKeys(move)
  const swipe = useSwipe(move)

  const n = level.size
  const cell = Math.min(32, Math.floor(312 / n))
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

      let bg = 'bg-transparent'
      if (t === '#') bg = th.wall
      else if (t === '*') bg = `${th.ice} bg-opacity-70`
      else if (t === ',' || t === 'F') bg = `${th.medium} bg-opacity-70`
      else if (t === '.' && mode === 'spread') bg = `${th.rock} bg-opacity-70`
      else if (t === '~') bg = 'bg-amber-200'
      else if (isStrong(t)) bg = 'bg-sky-300'
      else if (t in ARROW) bg = 'bg-sky-200'
      else if (isPortal) bg = 'bg-violet-200'
      if (burning) bg = th.hazardBg
      if (isExit) bg = 'bg-emerald-200'
      if (hidden) bg = 'bg-stone-800/85'

      cells.push(
        <div key={r * n + c} className={`relative flex items-center justify-center ${bg} transition-colors duration-300`} style={{ width: cell, height: cell }}>
          {!hidden && t === '#' && <div className="absolute inset-0.5 rounded-sm border border-line-2/40" />}
          {!hidden && t === 'B' && <div className={`rounded ${th.stone}`} style={{ width: cell * 0.62, height: cell * 0.62 }} />}
          {!hidden && t === 'o' && <div className={`rounded-full ${th.stone}`} style={{ width: cell * 0.4, height: cell * 0.4 }} />}
          {!hidden && t === '-' && <div className={`absolute left-0 right-0 ${th.stone}`} style={{ top: cell / 2 - 2, height: 4 }} />}
          {!hidden && t === '|' && <div className={`absolute top-0 bottom-0 ${th.stone}`} style={{ left: cell / 2 - 2, width: 4 }} />}
          {!hidden && !burning && t in ARROW && (
            <span className={`leading-none select-none ${isStrong(t) ? 'text-sky-900 font-black' : 'text-sky-700'}`} style={{ fontSize: cell * 0.6 }}>{ARROW_GLYPH[t]}</span>)}
          {!hidden && !burning && t === ',' && !isExit && th.mediumGlyph && (
            <span className="leading-none select-none opacity-60" style={{ fontSize: cell * 0.45 }}>{th.mediumGlyph}</span>)}
          {!hidden && t === '~' && <span className="text-amber-700 leading-none select-none" style={{ fontSize: cell * 0.5 }}>∴</span>}
          {!hidden && trail.has(r * n + c) && !isPlayer && <div className="absolute w-1.5 h-1.5 rounded-full bg-accent/50" />}
          {!hidden && burning && <span className="leading-none select-none" style={{ fontSize: cell * 0.6 }}>{th.hazard}</span>}
          {!hidden && isPortal && <span className="leading-none select-none" style={{ fontSize: cell * 0.6 }}>🌀</span>}
          {!hidden && isExit && <span className="leading-none select-none" style={{ fontSize: cell * 0.6 }}>{level.key && !gs.hasKey ? '🔒' : '🚪'}</span>}
          {!hidden && isKey && <span className="leading-none select-none" style={{ fontSize: cell * 0.55 }}>🔑</span>}
        </div>
      )
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="flex items-center gap-3 text-xs flex-wrap justify-center">
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

      <div className={`relative rounded-xl overflow-hidden border border-line bg-paper-2 touch-none ${crashFlash ? 'ring-4 ring-red-400' : ''}`}
        style={{ width: cell * n, height: cell * n, ...artTexture(THEME_ART[config.theme], 160) }} {...swipe}>
        <div className="absolute inset-0 bg-paper/35" />
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, ${cell}px)`, gridTemplateRows: `repeat(${n}, ${cell}px)` }}>
          {cells}
        </div>
        <div className="absolute z-10 flex items-center justify-center transition-all duration-150 ease-out pointer-events-none"
          style={{ left: gs.c * cell + 2, top: gs.r * cell + 2, width: cell - 4, height: cell - 4 }}>
          <div className={`w-full h-full rounded-full flex items-center justify-center border-2 shadow ${lost ? 'bg-red-200 border-red-500' : 'bg-panel border-accent'} ${crashFlash ? 'animate-pulse' : ''}`}
            style={{ fontSize: cell * 0.55 }}>
            <span className="leading-none select-none">{config.actor}</span>
          </div>
        </div>

        {intro && (
          <div className="absolute inset-0 bg-paper/70 flex items-center justify-center pointer-events-none z-20 animate-fade-in">
            <div className="bg-panel border border-line rounded-xl px-5 py-3 text-center shadow">
              <p className={`font-bold text-sm ${th.text}`}>Level {levelNo} / {levelCount}</p>
              <p className="text-ink-2 text-[11px] mt-0.5">{MODE_LABEL[mode]}</p>
            </div>
          </div>
        )}
        {gs.status === 'won' && <div className="absolute inset-0 bg-emerald-300/30 pointer-events-none z-20 animate-pulse" />}
        {lost && (
          <div className="absolute inset-0 bg-red-200/50 flex items-center justify-center z-20">
            <p className="bg-panel border border-red-300 rounded-xl px-4 py-2 text-ink font-bold text-sm">{lostLabel || (mode === 'spread' ? 'The hazard caught you' : 'Lost')}</p>
          </div>
        )}
      </div>

      <p className="text-ink-2 text-[10px] text-center max-w-[312px] leading-snug">
        <span className={`font-bold ${th.text}`}>{MODE_LABEL[mode]} · </span>
        {ruleText(mode, level.period)}
        {level.key && !gs.hasKey && ' Find the 🔑 first.'}
      </p>

      <DPad onDir={move} centre={
        mode === 'gravity' ? <span className="text-base">{DIR_GLYPH[gs.dir]}</span>
          : mode === 'inertia' ? <span>{gs.speed > 0 ? `${DIR_GLYPH[gs.dir]}${gs.speed}` : '·'}</span>
          : undefined} />
    </div>
  )
}

// ── Labyrinth board ────────────────────────────────────────────────────────────

const VIEW = 13
const LCELL = 23

function LabyrinthBoard({ config, difficulty, seed, kindIdx, levelNo, levelCount, settled, lost, lostLabel, onCleared, onFail, monsterCount }: BoardProps & { monsterCount?: number }) {
  const th = THEME[config.theme]
  const lab = useMemo(() => generateLabyrinth(config, difficulty, seed, kindIdx, monsterCount), [config, difficulty, seed, kindIdx, monsterCount])
  const n = lab.n
  const [st, setSt] = useState<LabState>(() => labInitial(lab))
  const [mons, setMons] = useState<Monster[]>(() => initialMonsters(lab))
  const [intro, setIntro] = useState(true)
  const [toast, setToast] = useState<{ text: string; colour: string; id: number } | null>(null)
  const [showMap, setShowMap] = useState(false)
  const [hurt, setHurt] = useState(false)
  const seen = useRef<Uint8Array>(new Uint8Array(n * n))
  const rng = useRef<Rng>(mulberry32((seed * 7 + kindIdx + 1) >>> 0))
  const invulnUntil = useRef(0)
  const runTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const live = useRef({ st, mons, intro, settled })
  live.current.intro = intro
  live.current.settled = settled
  const prowler = PROWLER[config.theme], relic = RELIC[config.theme]

  const markSeen = useCallback((s: LabState) => {
    if (!lab.fog) return
    for (let r = Math.max(0, s.r - lab.fog); r <= Math.min(n - 1, s.r + lab.fog); r++)
      for (let c = Math.max(0, s.c - lab.fog); c <= Math.min(n - 1, s.c + lab.fog); c++) seen.current[idxOf(n, r, c)] = 1
  }, [lab, n])
  useEffect(() => { markSeen(live.current.st) }, [markSeen])

  useEffect(() => { const t = setTimeout(() => setIntro(false), 1300); return () => clearTimeout(t) }, [])
  useEffect(() => () => { if (runTimer.current) clearInterval(runTimer.current) }, [])

  const flash = useCallback((text: string, colour: string) => {
    const id = Date.now() + Math.random()
    setToast({ text, colour, id })
    setTimeout(() => setToast(t => (t && t.id === id ? null : t)), 900)
  }, [])

  const commit = useCallback((next: LabState) => {
    live.current.st = next
    markSeen(next)
    setSt(next)
    if (next.status === 'won') {
      if (runTimer.current) clearInterval(runTimer.current)
      const found = lab.relics.filter((_, i) => next.relics & (1 << i)).length
      setTimeout(() => onCleared({ moves: next.steps, relics: found, relicTotal: lab.relics.length, livesLeft: next.lives }), 350)
    } else if (next.status === 'lost') {
      if (runTimer.current) clearInterval(runTimer.current)
      onFail(next.lostHow)
    }
  }, [lab, markSeen, onCleared, onFail])

  /** A prowler shares the player's cell: lose a life unless still recovering. */
  const caught = useCallback((s: LabState, mIdx: number) => {
    if (Date.now() < invulnUntil.current) return s
    const next = labHit(s)
    invulnUntil.current = Date.now() + 1600
    if (runTimer.current) { clearInterval(runTimer.current); runTimer.current = null }
    const ms = live.current.mons.map((m, i) => (i === mIdx ? { ...m, r: m.home[0], c: m.home[1] } : m))
    live.current.mons = ms; setMons(ms)
    setHurt(true); setTimeout(() => setHurt(false), 600)
    if (next.status === 'playing') flash(`Caught by the ${prowler.name}! −1 life`, '#dc2626')
    return next
  }, [flash, prowler.name])

  /** Take one step; returns 'event' when something was picked up or opened. */
  const stepOnce = useCallback((d: Dir): 'moved' | 'event' | 'blocked' => {
    const cur = live.current
    if (cur.settled || cur.intro || cur.st.status !== 'playing') return 'blocked'
    const s = cur.st
    let next = labMove(lab, s, d)
    if (next === s) {
      const di = indexAt(lab.doors, s.r + DR[d], s.c + DC[d])
      if (di >= 0) flash(`Locked — find the ${KEY_COLOURS[di].name} key`, KEY_COLOURS[di].hex)
      return 'blocked'
    }
    let event = false
    for (let i = 0; i < lab.keys.length; i++) if ((next.keys & ~s.keys) & (1 << i)) { flash(`${KEY_COLOURS[i].name} key!`, KEY_COLOURS[i].hex); event = true }
    for (let i = 0; i < lab.doors.length; i++) if ((next.opened & ~s.opened) & (1 << i)) { flash(`${KEY_COLOURS[i].name} door opens`, KEY_COLOURS[i].hex); event = true }
    if (next.relics !== s.relics) { flash(`${relic.glyph} Relic found!`, '#b45309'); event = true }
    const mi = monsterAt(cur.mons, next.r, next.c)
    if (mi >= 0 && next.status === 'playing') { next = caught(next, mi); event = true }
    commit(next)
    return event || next.status !== 'playing' ? 'event' : 'moved'
  }, [lab, flash, caught, commit, relic.glyph])

  const stopRun = () => { if (runTimer.current) { clearInterval(runTimer.current); runTimer.current = null } }
  const move = useCallback((d: Dir) => { stopRun(); stepOnce(d) }, [stepOnce])
  /** Swipe: run along the corridor until a junction, a find or a wall. */
  const run = useCallback((d: Dir) => {
    stopRun()
    if (stepOnce(d) !== 'moved') return
    runTimer.current = setInterval(() => {
      const s = live.current.st
      if (openNeighbours(n, lab.walls, s.r, s.c) > 2 || stepOnce(d) !== 'moved') stopRun()
    }, 70)
  }, [stepOnce, n, lab.walls])

  useArrowKeys(move)
  const swipe = useSwipe(run)

  // Prowlers move on their own clock.
  const playing = !intro && !settled && st.status === 'playing'
  useEffect(() => {
    if (!playing || !lab.monsters.length) return
    const iv = setInterval(() => {
      const cur = live.current
      if (cur.settled || cur.st.status !== 'playing') return
      const ms = stepMonsters(lab, cur.st, cur.mons, rng.current)
      cur.mons = ms; setMons(ms)
      const mi = monsterAt(ms, cur.st.r, cur.st.c)
      if (mi >= 0) commit(caught(cur.st, mi))
    }, lab.tick)
    return () => clearInterval(iv)
  }, [playing, lab, caught, commit])

  // Camera: centre on the player, clamped to the maze.
  const half = Math.floor(VIEW / 2)
  const camR = Math.max(0, Math.min(n - VIEW, st.r - half)), camC = Math.max(0, Math.min(n - VIEW, st.c - half))
  const visible = (r: number, c: number) => !lab.fog || Math.max(Math.abs(r - st.r), Math.abs(c - st.c)) <= lab.fog
  const known = (r: number, c: number) => !lab.fog || visible(r, c) || seen.current[idxOf(n, r, c)] === 1

  const tiles: JSX.Element[] = []
  for (let r = Math.max(0, camR - 2); r <= Math.min(n - 1, camR + VIEW + 1); r++) {
    for (let c = Math.max(0, camC - 2); c <= Math.min(n - 1, camC + VIEW + 1); c++) {
      const i = idxOf(n, r, c)
      const pos = { left: c * LCELL, top: r * LCELL, width: LCELL, height: LCELL }
      const vis = visible(r, c), kn = known(r, c)
      if (!kn) { tiles.push(<div key={i} className="absolute bg-stone-900/90" style={pos} />); continue }
      let inner: React.ReactNode = null
      let cls = ''
      if (lab.walls[i]) cls = `${th.wall} shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)]`
      const di = indexAt(lab.doors, r, c), ki = indexAt(lab.keys, r, c), ri = indexAt(lab.relics, r, c)
      if (di >= 0) {
        const open = !!(st.opened & (1 << di))
        inner = <div className="absolute inset-0.5 rounded-sm flex items-center justify-center text-[11px] transition-opacity duration-300"
          style={{ background: KEY_COLOURS[di].hex, opacity: open ? 0.25 : 0.9 }}>{open ? '' : '🔒'}</div>
      } else if (ki >= 0 && !(st.keys & (1 << ki))) {
        inner = <div className="absolute inset-1 rounded-full flex items-center justify-center text-[12px] shadow animate-pulse"
          style={{ background: `${KEY_COLOURS[ki].hex}33`, border: `2px solid ${KEY_COLOURS[ki].hex}` }}>🗝️</div>
      } else if (ri >= 0 && !(st.relics & (1 << ri))) {
        inner = <span className="text-[15px] leading-none">{relic.glyph}</span>
      } else if (samePos(lab.exit, [r, c])) {
        inner = <div className="absolute inset-0 bg-emerald-300/80 ring-2 ring-emerald-600 rounded-sm flex items-center justify-center text-[14px]">🚪</div>
      } else if (samePos(lab.start, [r, c])) {
        inner = <div className="absolute inset-1.5 rounded-full border border-dashed border-ink/30" />
      }
      tiles.push(
        <div key={i} className={`absolute flex items-center justify-center ${cls}`} style={pos}>
          {inner}
          {!vis && <div className="absolute inset-0 bg-stone-900/45" />}
        </div>,
      )
    }
  }

  const heldKeys = lab.keys.map((_, i) => !!(st.keys & (1 << i)))
  const relicCount = lab.relics.filter((_, i) => st.relics & (1 << i)).length
  const recovering = Date.now() < invulnUntil.current
  const lowSteps = lab.budget && lab.budget - st.steps <= lab.budget * 0.2

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="w-full max-w-[312px] flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-red-600 tracking-tight" aria-label={`${st.lives} lives`}>
          {'♥'.repeat(st.lives)}<span className="text-line-2">{'♥'.repeat(Math.max(0, lab.lives - st.lives))}</span>
        </span>
        <span className="flex items-center gap-1">
          {lab.keys.map((_, i) => (
            <span key={i} className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] transition-all"
              style={{ background: heldKeys[i] ? KEY_COLOURS[i].hex : 'transparent', border: `2px solid ${KEY_COLOURS[i].hex}`, opacity: heldKeys[i] ? 1 : 0.45 }}
              title={`${KEY_COLOURS[i].name} key`}>🗝️</span>
          ))}
        </span>
        <span className="text-muted" title={relic.name}>{relic.glyph} <span className={`font-bold ${th.text}`}>{relicCount}/{lab.relics.length}</span></span>
        <span className={lowSteps ? 'text-red-600 font-bold' : 'text-muted'}>
          👣 <span className={lowSteps ? '' : `font-bold ${th.text}`}>{lab.budget ? `${Math.max(0, lab.budget - st.steps)}` : st.steps}</span>
        </span>
        <button onClick={() => setShowMap(v => !v)}
          className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${showMap ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink-2'}`}>
          Map
        </button>
      </div>

      <div className={`relative rounded-xl overflow-hidden border-2 touch-none transition-shadow duration-200 ${hurt ? 'border-red-500' : 'border-line'}`}
        style={{ width: VIEW * LCELL, height: VIEW * LCELL, background: '#1c1917' }} {...swipe}>
        <div className="absolute left-0 top-0 transition-transform duration-150 ease-out will-change-transform"
          style={{ width: n * LCELL, height: n * LCELL, transform: `translate(${-camC * LCELL}px, ${-camR * LCELL}px)` }}>
          <div className={`absolute inset-0 ${th.floor}`} style={artTexture(THEME_ART[config.theme], 184)} />
          <div className="absolute inset-0 bg-paper/25" />
          {tiles}
          {mons.map((m, i) => visible(m.r, m.c) && (
            <div key={i} className="absolute z-10 flex items-center justify-center ease-linear pointer-events-none"
              style={{ left: m.c * LCELL, top: m.r * LCELL, width: LCELL, height: LCELL, transition: `left ${lab.tick * 0.8}ms, top ${lab.tick * 0.8}ms`, fontSize: LCELL * 0.72 }}>
              <span className="leading-none drop-shadow">{prowler.glyph}</span>
            </div>
          ))}
          <div className="absolute z-20 flex items-center justify-center transition-all duration-100 ease-out pointer-events-none"
            style={{ left: st.c * LCELL + 1, top: st.r * LCELL + 1, width: LCELL - 2, height: LCELL - 2 }}>
            <div className={`w-full h-full rounded-full flex items-center justify-center border-2 shadow-md ${lost ? 'bg-red-200 border-red-500' : 'bg-panel border-accent'} ${recovering ? 'animate-pulse' : ''}`}
              style={{ fontSize: LCELL * 0.55 }}>
              <span className="leading-none select-none">{config.actor}</span>
            </div>
          </div>
        </div>

        {toast && (
          <div key={toast.id} className="absolute top-2 left-1/2 -translate-x-1/2 z-30 px-3 py-1 rounded-full text-[11px] font-bold text-white shadow animate-fade-in whitespace-nowrap"
            style={{ background: toast.colour }}>{toast.text}</div>
        )}
        {toast && <div key={`f${toast.id}`} className="absolute inset-0 z-20 pointer-events-none animate-fade-in" style={{ boxShadow: `inset 0 0 0 4px ${toast.colour}` }} />}

        {showMap && <MiniMap lab={lab} st={st} mons={mons} seen={seen.current} camR={camR} camC={camC} />}

        {intro && (
          <div className="absolute inset-0 bg-paper/75 flex items-center justify-center pointer-events-none z-30 animate-fade-in">
            <div className="bg-panel border border-line rounded-xl px-5 py-3 text-center shadow max-w-[250px]">
              <p className={`font-bold text-sm ${th.text}`}>Level {levelNo} / {levelCount} · Labyrinth</p>
              <p className="text-ink-2 text-[11px] mt-1 leading-snug">
                {n}×{n} passages{lab.doors.length ? `, ${lab.doors.length} locked door${lab.doors.length > 1 ? 's' : ''}` : ''}.
                {' '}{prowler.glyph} {lab.chase ? 'hunt you when near' : 'wander the halls'}.
                {lab.budget ? ` ${lab.budget} steps of supplies.` : ''}
              </p>
            </div>
          </div>
        )}
        {st.status === 'won' && <div className="absolute inset-0 bg-emerald-300/30 pointer-events-none z-30 animate-pulse" />}
        {lost && (
          <div className="absolute inset-0 bg-red-200/50 flex items-center justify-center z-30">
            <p className="bg-panel border border-red-300 rounded-xl px-4 py-2 text-ink font-bold text-sm">{lostLabel || 'Lost'}</p>
          </div>
        )}
      </div>

      <p className="text-ink-2 text-[10px] text-center max-w-[312px] leading-snug">
        <span className={`font-bold ${th.text}`}>Labyrinth · </span>
        {ruleText('labyrinth', 1)}
      </p>

      <DPad onDir={move} repeat centre={<span className="text-base">{config.actor}</span>} />
    </div>
  )
}

function MiniMap({ lab, st, mons, seen, camR, camC }: { lab: Labyrinth; st: LabState; mons: Monster[]; seen: Uint8Array; camR: number; camC: number }) {
  const { n } = lab
  const known = (r: number, c: number) => !lab.fog || seen[idxOf(n, r, c)] === 1
  const rects: JSX.Element[] = []
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!known(r, c)) rects.push(<rect key={`u${r}-${c}`} x={c} y={r} width={1} height={1} fill="#1c1917" />)
    else if (lab.walls[idxOf(n, r, c)]) rects.push(<rect key={`w${r}-${c}`} x={c} y={r} width={1} height={1} fill="#78716c" />)
  }
  const dot = (p: Pos, fill: string, key: string, rr = 0.7) => known(p[0], p[1]) && <circle key={key} cx={p[1] + 0.5} cy={p[0] + 0.5} r={rr} fill={fill} />
  return (
    <div className="absolute right-2 bottom-2 z-30 rounded-lg border border-line bg-panel/90 p-1 shadow pointer-events-none">
      <svg viewBox={`0 0 ${n} ${n}`} width={128} height={128} shapeRendering="crispEdges">
        <rect x={0} y={0} width={n} height={n} fill="#f5efe0" />
        {rects}
        {lab.doors.map((p, i) => !(st.opened & (1 << i)) && dot(p, KEY_COLOURS[i].hex, `d${i}`, 0.9))}
        {lab.keys.map((p, i) => !(st.keys & (1 << i)) && dot(p, KEY_COLOURS[i].hex, `k${i}`))}
        {dot(lab.exit, '#059669', 'exit', 1)}
        {lab.fog === 0 && mons.map((m, i) => dot([m.r, m.c], '#7c2d12', `m${i}`, 0.6))}
        <rect x={camC} y={camR} width={VIEW} height={VIEW} fill="none" stroke="#9b2c23" strokeWidth={0.5} />
        <circle cx={st.c + 0.5} cy={st.r + 0.5} r={1} fill="#9b2c23" />
      </svg>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function BigMazeGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const paramMode = params?.mode, paramSize = params?.size, paramLevels = params?.levels
  const monsterCount = typeof params?.monsterCount === 'number' ? params.monsterCount : undefined
  const config = useMemo(
    () => resolveMazeConfig(configId, { mode: paramMode, size: paramSize, levels: paramLevels }),
    [configId, paramMode, paramSize, paramLevels])
  const rules = useMemo(() => settings(config, difficulty), [config, difficulty])
  const plan = useMemo(() => levelPlan(config, difficulty), [config, difficulty])
  const th = THEME[config.theme]
  const { outcome, lost, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })
  const [lostHow, setLostHow] = useState('')
  const fail = useCallback((how: string) => { setLostHow(how); lose(how) }, [lose])
  // The labyrinth has its own pressure (prowlers, step budget), so no clock.
  const timeLimit = plan.includes('labyrinth') ? 0 : rules.timeLimit
  const timer = useGameTimer({ seconds: timeLimit, running: !outcome, onExpire: () => fail('out of time') })

  const [levelIdx, setLevelIdx] = useState(0)
  const [card, setCard] = useState<LevelStats | null>(null)
  const lastIdx = useRef(-1)
  const onCleared = useCallback((stats: LevelStats) => {
    if (lastIdx.current === levelIdx) return
    lastIdx.current = levelIdx
    if (levelIdx + 1 >= plan.length) win()
    else setCard(stats)
  }, [levelIdx, plan.length, win])
  const advance = useCallback(() => { setCard(null); setLevelIdx(i => Math.min(i + 1, plan.length - 1)) }, [plan.length])
  useEffect(() => {
    if (!card) return
    const t = setTimeout(advance, 2200)
    return () => clearTimeout(t)
  }, [card, advance])

  const mode = plan[levelIdx]
  const kindIdx = plan.slice(0, levelIdx).filter(m => (m === 'labyrinth') === (mode === 'labyrinth')).length
  const lostLabel = lostHow === 'out of steps' ? 'Out of steps' : lostHow === 'out of time' ? 'Out of time'
    : lostHow === 'crashed' ? 'Wrecked at speed' : lostHow === 'caught' ? (mode === 'labyrinth' ? `Caught by the ${PROWLER[config.theme].name}` : 'The hazard caught you') : ''
  const boardProps: BoardProps = {
    config, difficulty, seed, kindIdx, levelNo: levelIdx + 1, levelCount: plan.length,
    settled, lost, lostLabel, onCleared, onFail: fail,
  }

  return (
    <div className="flex flex-col items-center gap-3 text-ink select-none">
      <div className="text-center">
        <p className={`font-bold text-sm tracking-wide ${th.text}`}>{config.title}</p>
        <p className="text-muted text-[10px]">{config.subtitle}</p>
      </div>

      <div className="flex items-center gap-1.5" aria-label={`Level ${levelIdx + 1} of ${plan.length}`}>
        {plan.map((m, i) => (
          <span key={i} title={MODE_LABEL[m]}
            className={`rounded-full transition-all duration-300 ${m === 'labyrinth' ? 'w-4 h-4 text-[9px] flex items-center justify-center' : 'w-2.5 h-2.5'}
              ${i < levelIdx || (i === levelIdx && outcome === 'won') ? 'bg-emerald-500' : i === levelIdx ? 'bg-accent ring-2 ring-accent/30' : 'bg-line'}`}>
            {m === 'labyrinth' ? '★' : ''}
          </span>
        ))}
      </div>

      {timer.active && <div className="w-full max-w-[312px]"><TimerBar remaining={timer.remaining} total={timer.total} /></div>}

      <div className="relative w-full flex justify-center">
        {mode === 'labyrinth'
          ? <LabyrinthBoard key={levelIdx} {...boardProps} monsterCount={monsterCount} />
          : <PhysicsBoard key={levelIdx} {...boardProps} />}

        {card && (
          <div className="absolute inset-0 z-40 flex items-start justify-center pt-24 bg-paper/60 animate-fade-in">
            <div className="bg-panel border border-line rounded-2xl px-6 py-4 text-center shadow-lg w-[260px]">
              <p className="text-emerald-700 font-bold text-base">Level {levelIdx + 1} complete</p>
              <p className="text-ink-2 text-xs mt-1">
                {card.moves} moves
                {card.relicTotal ? ` · ${card.relics}/${card.relicTotal} relics` : ''}
              </p>
              <p className="text-muted text-[11px] mt-2">Next: {MODE_LABEL[plan[levelIdx + 1]]}</p>
              <button onClick={advance} className="mt-3 px-5 py-2 rounded-xl bg-accent text-accent-fg font-bold text-sm">Continue →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
