import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, resolveConfig, storyText, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Caravan Trail — grid Snake.  Lead a camel train round the trade route,
// picking up goods; every bale adds a camel to the line.  Run into the edge
// of the map, an obstacle or your own caravan and the journey ends.  Each
// route adds its own rule:
//
//   silk-road      orders  two bales lie on the map; only the one the market
//                          ordered counts — the wrong one adds 2 extra camels
//   sahara         dunes   new dunes rise as the wind blows, one every few
//                          deliveries, never next to the caravan
//   incense-route  spoil   each load spoils if it is not reached within a
//                          step allowance — then the journey fails
//
//   D1  11×11, deliver 10, start 300 ms/step, few obstacles
//   D2  13×13, deliver 14, start 250 ms
//   D3  14×14, deliver 18, start 210 ms, more obstacles
//   D4  15×15, deliver 24, start 180 ms, densest obstacles
//
// (Pace floors: 200 / 160 / 135 / 120 ms a step.)
//
// The pace quickens with every delivery down to a floor per tier.  A perfect
// run (the autopilot) takes ~20 s of game clock at D1 and ~30 s at D4, so an
// engaged player needs roughly 40 s to 1½ min — never more than a few.
//
// Obstacles are generated so the open ground stays connected with no
// dead-end pockets, and food is drawn from a seeded stream, so a run is
// reproducible move for move.  Every route is proven winnable when it is
// built: the exported autopilot must deliver every load on it, otherwise the
// map is re-rolled (see newGame).

interface SnakeConfig {
  title: string
  intro: string
  fact: string
  goods: string[]
  obstacle: string
  obstacleClass: string
  ground: string
  /** Obstacle layout style. */
  layout: 'peaks' | 'dunes' | 'ridges'
  /** The route's rule twist (see the header). */
  variant: SnakeVariant
  /** The twist in a few words. */
  rule: string
}

export type SnakeVariant = 'orders' | 'dunes' | 'spoil'

export const CONFIGS: Record<string, SnakeConfig> = {
  'silk-road': {
    title: 'The Silk Road',
    intro: 'Two bales wait on the road, but the market wants only the one on the order slip. Take the wrong one and you must haul two extra camels for nothing. Every right bale adds a camel — steer clear of the mountains and your own line.',
    fact: 'The name "Silk Road" (Seidenstraße) was coined only in 1877 by the German geographer Ferdinand von Richthofen. Bactrian camels, which can carry around 200 kg and drink over 100 litres at once, were the workhorses of its desert legs.',
    goods: ['🧵', '🍵', '🏺', '💎'],
    obstacle: '⛰️', obstacleClass: 'bg-[#a7a39a]', ground: 'bg-[#efe3c2]', layout: 'peaks', variant: 'orders', rule: 'Fill the order',
  },
  'nineveh-tablets': {
    title: 'Tablets for Nineveh',
    intro: 'The king’s letter names the tablets he wants. Two loads wait on the road, but only the one on the list counts — take the wrong one and you must haul two extra camels for nothing. Every right load adds a camel; steer clear of the hills and your own line.',
    fact: 'A surviving letter of Ashurbanipal orders his officials in Borsippa to search the scholars’ houses and the temple of Ezida for tablets — prayers, rituals, omens and incantations — and to send to Nineveh any of which no copy exists in Assyria.',
    goods: ['📜', '⭐', '🌿', '🏛️'],
    obstacle: '⛰️', obstacleClass: 'bg-[#a7a39a]', ground: 'bg-[#ece0c4]', layout: 'peaks', variant: 'orders', rule: 'Fill the order',
  },
  'quito-gold': {
    title: 'The Gold of Quito',
    intro: 'The Spanish are days away. Lead the llama train to each load of gold and silver before the hour to move it passes, then on into the mountains — ridges of rock split the valleys, so pick your line early.',
    fact: 'Legend says Rumiñahui’s men carried the treasure of Quito into the Llanganates mountains east of the city before he burned it. A written route to the hoard, the “Derrotero de Valverde”, surfaced in colonial times, and treasure hunters have searched the Llanganates ever since without finding it.',
    goods: ['🪙', '🏺', '🦙'],
    obstacle: '', obstacleClass: 'bg-[#7d7468] rounded-sm', ground: 'bg-[#dfe3c8]', layout: 'ridges', variant: 'spoil', rule: 'Before the Spanish come',
  },
  pochteca: {
    title: 'The Pochteca Road',
    intro: 'The merchants of Tlatelolco bring home only what the market has asked for. Two loads wait on the road, but only the one on the order counts — the wrong one adds two porters for nothing. Every right load adds a porter; keep clear of the volcanoes and your own line.',
    fact: 'The pochteca were the long-distance merchants of the Aztec world. With no pack animals or carts, they travelled with lines of porters (tlameme) carrying cacao, feathers, jade and cloth, and they also served the tlatoani as spies in foreign lands.',
    goods: ['🪶', '🫘', '🟢', '🧶'],
    obstacle: '🌋', obstacleClass: 'bg-[#a39a8f]', ground: 'bg-[#e9dfc0]', layout: 'peaks', variant: 'orders', rule: 'Fill the order',
  },
  sahara: {
    title: 'Trans-Saharan Salt Caravan',
    intro: 'Carry salt and gold across the Sahara. The wind is building new dunes as you travel — keep your line moving and away from the sand.',
    fact: 'Ibn Battuta crossed the Sahara to the Mali Empire in 1352 and described Taghaza, a town whose houses and mosque were built of salt blocks. Salt from Taghaza traded south for gold, sometimes reportedly weight for weight.',
    goods: ['🧂', '🪙', '🌴'],
    obstacle: '', obstacleClass: 'bg-[#d9a95b] rounded-[45%]', ground: 'bg-[#f5deb0]', layout: 'dunes', variant: 'dunes', rule: 'Rising dunes',
  },
  'incense-route': {
    title: 'The Incense Route',
    intro: 'Frankincense and myrrh lose their worth on the road: reach each load before its freshness runs out, or the venture fails. Ridges of rock split the wadis, so pick your line early.',
    fact: 'Frankincense from southern Arabia travelled the Incense Route to Gaza and the Mediterranean. Pliny the Elder (1st century CE) wrote that the trade made the South Arabians among the richest people on earth; the Nabataean city of Petra grew rich taxing it.',
    goods: ['🌿', '🏺', '🪔'],
    obstacle: '', obstacleClass: 'bg-[#8a6f5a] rounded-sm', ground: 'bg-[#ead7bb]', layout: 'ridges', variant: 'spoil', rule: 'Goods spoil',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Engine ─────────────────────────────────────────────────────────────────────

export type Dir = 'U' | 'D' | 'L' | 'R'
const OPPOSITE: Record<Dir, Dir> = { U: 'D', D: 'U', L: 'R', R: 'L' }

export interface SnakeTier {
  size: number
  target: number
  startMs: number
  minMs: number
  /** Milliseconds shaved off per delivery. */
  speedUp: number
  /** Obstacle cells laid at the start. */
  obstacles: number
  /** A new dune rises every this many deliveries (0 = never). */
  duneEvery: number
  /** orders: a decoy bale lies on the map; taking it adds this many camels (0 = no decoy). */
  decoyPenalty: number
  /** spoil: steps allowed to reach each load (0 = goods keep). */
  freshSteps: number
}

export function tierFor(cfg: SnakeConfig, difficulty: Difficulty, params?: Record<string, unknown>): SnakeTier {
  const t: SnakeTier = {
    size: scale(difficulty, [11, 13, 14, 15]),
    target: scale(difficulty, [10, 14, 18, 24]),
    startMs: scale(difficulty, [300, 250, 210, 180]),
    // Floors respect a phone: a swipe lands ~250 ms + gesture after the eye
    // sees the turn, so even the top tier never moves faster than ~8 cells/s.
    minMs: scale(difficulty, [200, 160, 135, 120]),
    speedUp: scale(difficulty, [8, 9, 9, 8]),
    obstacles: scale(difficulty, [4, 9, 14, 20]),
    duneEvery: cfg.variant === 'dunes' ? scale(difficulty, [3, 3, 2, 2]) : 0,
    decoyPenalty: cfg.variant === 'orders' ? 2 : 0,
    freshSteps: cfg.variant === 'spoil' ? scale(difficulty, [34, 34, 32, 32]) : 0,
  }
  if (typeof params?.target === 'number') t.target = params.target as number
  return t
}

export interface SnakeGame {
  size: number
  blocked: boolean[]
  tier: SnakeTier
}

export interface SnakeState {
  /** Head first. */
  body: number[]
  dir: Dir
  food: number
  /** orders: the wrong bale (-1 = none). */
  decoy: number
  /** Camels still to join from a wrong bale: the tail stays put while this is > 0. */
  grow: number
  /** spoil: steps left to reach the current load. */
  fresh: number
  eaten: number
  /** Obstacles, including dunes risen during play. */
  blocked: boolean[]
  rng: number
  status: 'playing' | 'won' | 'crashed'
  crash?: string
}

/** One mulberry32 draw on an explicit state, so the stream can live in game state. */
function draw(a: number): [number, number] {
  a = (a + 0x6d2b79f5) >>> 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a]
}

export function neighbor(size: number, i: number, d: Dir): number {
  const r = Math.floor(i / size), c = i % size
  if (d === 'U') return r > 0 ? i - size : -1
  if (d === 'D') return r < size - 1 ? i + size : -1
  if (d === 'L') return c > 0 ? i - 1 : -1
  return c < size - 1 ? i + 1 : -1
}

const DIRS: Dir[] = ['U', 'D', 'L', 'R']

/**
 * Open ground must stay one connected region in which every cell has at
 * least two open neighbours, so there are no dead-end pockets to die in.
 */
export function groundOk(size: number, blocked: boolean[]): boolean {
  const open: number[] = []
  for (let i = 0; i < size * size; i++) if (!blocked[i]) open.push(i)
  if (!open.length) return false
  for (const i of open) {
    let n = 0
    for (const d of DIRS) { const j = neighbor(size, i, d); if (j >= 0 && !blocked[j]) n++ }
    if (n < 2) return false
  }
  const seen = new Uint8Array(size * size)
  const stack = [open[0]]
  seen[open[0]] = 1
  let count = 1
  while (stack.length) {
    const i = stack.pop()!
    for (const d of DIRS) {
      const j = neighbor(size, i, d)
      if (j >= 0 && !blocked[j] && !seen[j]) { seen[j] = 1; count++; stack.push(j) }
    }
  }
  return count === open.length
}

function startBody(size: number): number[] {
  const r = Math.floor(size / 2)
  return [r * size + 3, r * size + 2, r * size + 1]
}

/** Cells kept clear at the start: the caravan's row ahead of it and around it. */
function nearStart(size: number, i: number): boolean {
  const r = Math.floor(i / size), c = i % size, mid = Math.floor(size / 2)
  return Math.abs(r - mid) <= 1 && c <= 7
}

export function buildMap(cfg: SnakeConfig, tier: SnakeTier, seed: number): boolean[] {
  const { size } = tier
  let a = seed >>> 0
  const rand = () => { const [v, n] = draw(a); a = n; return v }
  for (let attempt = 0; attempt < 400; attempt++) {
    const blocked = Array(size * size).fill(false)
    let placed = 0, guard = 0
    while (placed < tier.obstacles && guard++ < 500) {
      const r = Math.floor(rand() * size), c = Math.floor(rand() * size)
      // Shape by layout: lone peaks, two-cell dunes, 3–4 cell ridges.
      const cells: number[] = []
      if (cfg.layout === 'peaks') cells.push(r * size + c)
      else if (cfg.layout === 'dunes') {
        cells.push(r * size + c)
        if (rand() < 0.6 && c + 1 < size) cells.push(r * size + c + 1)
      } else {
        const len = 3 + Math.floor(rand() * 2)
        const vertical = rand() < 0.5
        for (let k = 0; k < len; k++) {
          const rr = vertical ? r + k : r, cc = vertical ? c : c + k
          if (rr < size && cc < size) cells.push(rr * size + cc)
        }
      }
      if (cells.some(i => blocked[i] || nearStart(size, i))) continue
      const trial = [...blocked]
      for (const i of cells) trial[i] = true
      if (!groundOk(size, trial)) continue
      for (const i of cells) blocked[i] = true
      placed += cells.length
    }
    if (placed >= tier.obstacles - 1) return blocked
  }
  return Array(size * size).fill(false)
}

/** Open-ground distance from `from` to every cell, ignoring the caravan. */
function distances(size: number, blocked: boolean[], from: number): Int16Array {
  const dist = new Int16Array(size * size).fill(-1)
  dist[from] = 0
  const q = [from]
  for (let qi = 0; qi < q.length; qi++) for (const d of DIRS) {
    const j = neighbor(size, q[qi], d)
    if (j < 0 || blocked[j] || dist[j] >= 0) continue
    dist[j] = dist[q[qi]] + 1; q.push(j)
  }
  return dist
}

/**
 * Draw a free cell for a bale.  Perishable goods (spoil) are only laid where
 * the open-ground distance from the lead camel is at most half the allowance,
 * so every load is reachable in time with room for a detour.
 */
function placeFood(tier: SnakeTier, blocked: boolean[], body: number[], rng: number, avoid: number[] = []): [number, number] {
  const { size } = tier
  const free: number[] = []
  const occupied = new Set([...body, ...avoid])
  const dist = tier.freshSteps ? distances(size, blocked, body[0]) : null
  const reach = Math.floor(tier.freshSteps / 2)
  for (let i = 0; i < size * size; i++) {
    if (blocked[i] || occupied.has(i)) continue
    if (dist && (dist[i] < 3 || dist[i] > reach)) continue
    free.push(i)
  }
  const [v, next] = draw(rng)
  return [free[Math.floor(v * free.length)] ?? -1, next]
}

function freshGame(tier: SnakeTier, blocked: boolean[], seed: number): { game: SnakeGame; state: SnakeState } {
  const body = startBody(tier.size)
  const [food, rng] = placeFood(tier, blocked, body, hashString(`snake-food:${seed}`))
  const [decoy, rng2] = tier.decoyPenalty ? placeFood(tier, blocked, body, rng, [food]) : [-1, rng]
  return {
    game: { size: tier.size, blocked, tier },
    state: { body, dir: 'R', food, decoy, grow: 0, fresh: tier.freshSteps, eaten: 0, blocked, rng: rng2, status: 'playing' },
  }
}

/** Run the autopilot to the end; returns the final state. */
export function autoplay(game: SnakeGame, state: SnakeState, maxSteps = 6000): SnakeState {
  let s = state, hungry = 0
  for (let n = 0; n < maxSteps && s.status === 'playing'; n++) {
    const before = s.eaten
    s = step(game, s, autopilot(game, s, hungry))
    hungry = s.eaten > before ? 0 : hungry + 1
  }
  return s
}

/**
 * Build the route for a seed.  Food and dunes are a pure function of the
 * moves made, so a route is proven winnable by letting the autopilot play
 * it; a route it cannot finish is re-rolled, then thinned of obstacles.
 */
export function newGame(configId: string, difficulty: Difficulty, seed: number, params?: Record<string, unknown>): { game: SnakeGame; state: SnakeState; attempts: number } {
  const cfg = resolveConfig(CONFIGS, configId, undefined, 'silk-road')
  const tier = tierFor(cfg, difficulty, params)
  for (let attempt = 0; attempt < 12; attempt++) {
    const thin = attempt < 6 ? tier : { ...tier, obstacles: Math.floor(tier.obstacles * (12 - attempt) / 12) }
    const blocked = buildMap(cfg, thin, hashString(`snake-map:${configId}:${seed}:${attempt}`))
    const g = freshGame(tier, blocked, seed + attempt)
    if (autoplay(g.game, g.state).status === 'won') return { ...g, attempts: attempt + 1 }
  }
  return { ...freshGame(tier, Array(tier.size * tier.size).fill(false), seed), attempts: 13 }
}

export function tickMs(game: SnakeGame, s: SnakeState): number {
  return Math.max(game.tier.minMs, game.tier.startMs - s.eaten * game.tier.speedUp)
}

/** Raise a dune somewhere harmless: off the caravan, away from its head, keeping the ground sound. */
function raiseDune(game: SnakeGame, s: SnakeState, rng: number): [boolean[], number] {
  const { size } = game
  const head = s.body[0], hr = Math.floor(head / size), hc = head % size
  // Never right beside a camel, so a dune cannot seal the caravan in.
  const near = new Set<number>()
  for (const b of s.body) {
    const br = Math.floor(b / size), bc = b % size
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) near.add((br + dr) * size + bc + dc)
  }
  let a = rng
  for (let tries = 0; tries < 60; tries++) {
    const [v, n] = draw(a); a = n
    const i = Math.floor(v * size * size)
    const r = Math.floor(i / size), c = i % size
    if (s.blocked[i] || near.has(i) || i === s.food || i === s.decoy) continue
    if (Math.abs(r - hr) + Math.abs(c - hc) < 5) continue
    const trial = [...s.blocked]
    trial[i] = true
    if (!groundOk(size, trial)) continue
    return [trial, a]
  }
  return [s.blocked, a]
}

/** Advance one step in `dir` (ignored if it would reverse the caravan). */
export function step(game: SnakeGame, s: SnakeState, dir?: Dir): SnakeState {
  if (s.status !== 'playing') return s
  const d = dir && dir !== OPPOSITE[s.dir] ? dir : s.dir
  const next = neighbor(game.size, s.body[0], d)
  if (next < 0) return { ...s, dir: d, status: 'crashed', crash: 'The caravan wandered off the map' }
  if (s.blocked[next]) return { ...s, dir: d, status: 'crashed', crash: game.tier.duneEvery ? 'The caravan ran into a dune' : 'The caravan ran into the rocks' }
  const { tier } = game
  const eating = next === s.food
  // The tail moves away this step unless the caravan grows (a fresh bale,
  // or extra camels still joining from a wrong one).
  const growing = eating || s.grow > 0
  const rest = growing ? s.body : s.body.slice(0, -1)
  if (rest.includes(next)) return { ...s, dir: d, status: 'crashed', crash: 'The caravan tangled with its own camels' }
  const body = [next, ...rest]
  let grow = !eating && s.grow > 0 ? s.grow - 1 : s.grow
  if (!eating) {
    const fresh = tier.freshSteps ? s.fresh - 1 : s.fresh
    if (next === s.decoy) {
      // The wrong bale: two more camels to feed and walk, and a new decoy.
      grow += tier.decoyPenalty
      const [decoy, rng] = placeFood(tier, s.blocked, body, s.rng, [s.food])
      return { ...s, body, dir: d, grow, decoy, rng, fresh }
    }
    if (tier.freshSteps && fresh <= 0) return { ...s, body, dir: d, grow, fresh: 0, status: 'crashed', crash: 'The incense spoiled before the caravan reached it' }
    return { ...s, body, dir: d, grow, fresh }
  }
  const eaten = s.eaten + 1
  if (eaten >= tier.target) return { ...s, body, dir: d, grow, eaten, food: -1, decoy: -1, status: 'won' }
  let blocked = s.blocked, rng = s.rng
  if (tier.duneEvery && eaten % tier.duneEvery === 0) {
    [blocked, rng] = raiseDune(game, { ...s, body }, rng)
  }
  const [food, rng2] = placeFood(tier, blocked, body, rng)
  const [decoy, rng3] = tier.decoyPenalty ? placeFood(tier, blocked, body, rng2, [food]) : [-1, rng2]
  return { ...s, body, dir: d, grow, eaten, food, decoy, blocked, rng: rng3, fresh: tier.freshSteps }
}

/** Shortest time-aware path for the head to `target`; null if none. */
export function pathTo(size: number, body: number[], blocked: boolean[], target: number, food = -1, grow = 0): Dir[] | null {
  // Time-aware: the segment k places from the head moves off its cell
  // after (length - k + grow) steps, so the path may run into it once it's gone.
  const freeAt = new Map<number, number>()
  body.forEach((c, k) => freeAt.set(c, body.length - k + grow))
  const prev = new Map<number, [number, Dir]>()
  const depth = new Map<number, number>([[body[0], 0]])
  const q = [body[0]]
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi]
    if (i === target && i !== body[0]) {
      const path: Dir[] = []
      for (let c = i; c !== body[0]; c = prev.get(c)![0]) path.push(prev.get(c)![1])
      return path.reverse()
    }
    const t = depth.get(i)! + 1
    for (const d of DIRS) {
      const j = neighbor(size, i, d)
      if (j < 0 || blocked[j] || depth.has(j) || (j === food && j !== target)) continue
      const f = freeAt.get(j)
      if (f !== undefined && t < f && j !== target) continue
      depth.set(j, t); prev.set(j, [i, d]); q.push(j)
    }
  }
  return null
}

/**
 * A careful autopilot: take the shortest path to the goods only if, after
 * eating, the caravan could still reach its own tail; otherwise chase the
 * tail.  `hungry` (steps since the last delivery) breaks endless circling.  Used by the tests to prove routes are winnable.
 */
export function autopilot(game: SnakeGame, s: SnakeState, hungry = 0): Dir {
  const { size } = game
  // The wrong bale is treated as rock: it is never worth the extra camels.
  const ground = (t: SnakeState) => {
    if (t.decoy < 0) return t.blocked
    const b = [...t.blocked]; b[t.decoy] = true
    return b
  }
  const bfs = (t: SnakeState, target: number, food = -1) => pathTo(size, t.body, ground(t), target, food, t.grow)
  // Open cells reachable from the head, for when no move keeps the tail in reach.
  const room = (t: SnakeState): number => {
    const occ = new Set(t.body)
    const seen = new Set([t.body[0]])
    const q = [t.body[0]]
    for (let qi = 0; qi < q.length; qi++) for (const d of DIRS) {
      const j = neighbor(size, q[qi], d)
      if (j < 0 || t.blocked[j] || occ.has(j) || seen.has(j)) continue
      seen.add(j); q.push(j)
    }
    return q.length
  }
  const simulate = (path: Dir[]): SnakeState => {
    let t = s
    for (const d of path) t = step(game, t, d)
    return t
  }
  const toFood = s.food >= 0 ? bfs(s, s.food) : null
  if (toFood && toFood.length) {
    const after = simulate(toFood)
    if (after.status === 'won') return toFood[0]
    if (after.status === 'playing' && room(after) >= after.body.length * 2 && bfs(after, after.body[after.body.length - 1], after.food)) return toFood[0]
    // Circling too long, or the goods about to spoil: take the risk.
    const urgent = game.tier.freshSteps > 0 && toFood.length >= s.fresh - 4
    if ((urgent || hungry > game.size * game.size * 2) && step(game, s, toFood[0]).status !== 'crashed') return toFood[0]
  }
  // Otherwise: a safe move that keeps the tail reachable, preferring the longest way round.
  let best: Dir | null = null, bestScore = -Infinity
  for (const d of DIRS) {
    if (d === OPPOSITE[s.dir]) continue
    const t = step(game, s, d)
    if (t.status === 'crashed') continue
    if (t.status === 'won') return d
    const tail = bfs(t, t.body[t.body.length - 1], t.food)
    const score = (tail ? 10000 : 0) + room(t) * 10 + (tail ? Math.min(tail.length, 9) : 0) - (t.grow > s.grow ? 20000 : 0)
    if (score > bestScore) { bestScore = score; best = d }
  }
  return best ?? s.dir
}

// ── Component ──────────────────────────────────────────────────────────────────

const KEYS: Record<string, Dir> = {
  ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R',
  w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R',
}

export default function SnakeGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = { ...resolveConfig(CONFIGS, configId, undefined, 'silk-road'), ...storyText(params) }
  const start = useMemo(() => newGame(configId, difficulty, seed, params), [configId, difficulty, seed, params])
  const { game } = start
  const [state, setState] = useState<SnakeState>(start.state)
  const [running, setRunning] = useState(false)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const stateRef = useRef(state)
  stateRef.current = state
  const queue = useRef<Dir[]>([])

  useEffect(() => { setState(start.state); setRunning(false); queue.current = [] }, [start])

  const steer = useCallback((d: Dir) => {
    if (stateRef.current.status !== 'playing') return
    const q = queue.current
    const last = q.length ? q[q.length - 1] : stateRef.current.dir
    if (d !== last && d !== OPPOSITE[last] && q.length < 2) q.push(d)
    setRunning(true)
  }, [])

  // The game loop: one setTimeout per step at the current pace.  It stops
  // while paused, once settled, and on unmount.
  useEffect(() => {
    if (!running || settled || state.status !== 'playing') return
    const t = setTimeout(() => {
      const d = queue.current.shift()
      const next = step(game, stateRef.current, d)
      stateRef.current = next
      setState(next)
      if (next.status === 'won') win()
      else if (next.status === 'crashed') lose(next.crash)
    }, tickMs(game, state))
    return () => clearTimeout(t)
  }, [running, settled, state, game, win, lose])

  // Pause when the tab is hidden.
  useEffect(() => {
    const onVis = () => { if (document.hidden) setRunning(false) }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const d = KEYS[e.key]
      if (d) { e.preventDefault(); steer(d); return }
      if (e.key === ' ' || e.key === 'p' || e.key === 'P') { e.preventDefault(); setRunning(r => !r) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [steer])

  const touch = useRef<[number, number] | null>(null)
  const onPointerDown = (e: React.PointerEvent) => { touch.current = [e.clientX, e.clientY] }
  const onPointerUp = (e: React.PointerEvent) => {
    if (!touch.current) return
    const dx = e.clientX - touch.current[0], dy = e.clientY - touch.current[1]
    touch.current = null
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U'))
  }

  const { size, tier } = game
  const bodyIndex = new Map(state.body.map((c, k) => [c, k]))
  const good = cfg.goods[state.eaten % cfg.goods.length]
  const wrongGood = cfg.goods[(state.eaten + 1) % cfg.goods.length]
  const pace = Math.round(1000 / tickMs(game, state) * 10) / 10

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title} · <span data-testid="snake-rule">{cfg.rule}</span></p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p className="font-bold text-ink-2 text-sm" data-testid="snake-eaten">{state.eaten} / {tier.target}</p>
          <p>goods delivered</p>
          <p>{pace} steps/s</p>
          {tier.duneEvery > 0 && <p>dune every {tier.duneEvery}</p>}
          {tier.decoyPenalty > 0 && <p data-testid="snake-order">order: <span className="text-sm">{good}</span> not {wrongGood}</p>}
          {state.grow > 0 && <p className="text-red-600 font-bold">+{state.grow} camels joining</p>}
          {tier.freshSteps > 0 && <p className={state.fresh <= 8 ? 'text-red-600 font-bold' : ''} data-testid="snake-fresh">fresh {state.fresh} steps</p>}
        </div>
      </div>

      <div className="w-full h-1.5 bg-panel rounded-full overflow-hidden">
        <div className="h-full bg-accent transition-all" style={{ width: `${(state.eaten / tier.target) * 100}%` }} />
      </div>

      <div className="relative w-full max-w-[420px] mx-auto select-none rounded-lg overflow-hidden border-2 border-ink-2 shadow-md"
        style={{ touchAction: 'none' }} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <div className={`grid ${cfg.ground}`} style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
          {Array.from({ length: size * size }, (_, i) => {
            const k = bodyIndex.get(i)
            const rock = state.blocked[i]
            return (
              <div key={i} className="relative aspect-square">
                {rock && <div className={`absolute inset-[6%] flex items-center justify-center text-[min(4vw,16px)] ${cfg.obstacleClass}`}>{cfg.obstacle}</div>}
                {i === state.food && <div className="absolute inset-0 flex items-center justify-center text-[min(4.4vw,18px)] leading-none"
                  style={tier.freshSteps ? { opacity: 0.35 + 0.65 * (state.fresh / tier.freshSteps) } : undefined}>{good}</div>}
                {i === state.decoy && <div className="absolute inset-[6%] flex items-center justify-center text-[min(3.8vw,15px)] leading-none rounded-full ring-2 ring-red-500/60" data-testid="snake-decoy">{wrongGood}</div>}
                {k === 0 && <div className="absolute inset-0 flex items-center justify-center text-[min(4.6vw,19px)] leading-none"
                  style={{ transform: state.dir === 'L' ? 'none' : state.dir === 'R' ? 'scaleX(-1)' : 'none' }}>🐪</div>}
                {k !== undefined && k > 0 && (
                  <div className="absolute inset-[14%] rounded-full bg-[#a0703c] border border-[#6b4520]"
                    style={{ opacity: 1 - (k / (state.body.length + 4)) * 0.5 }} />
                )}
              </div>
            )
          })}
        </div>
        {!running && !settled && (
          <button type="button" onClick={() => setRunning(true)}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-paper/60 text-ink font-bold text-sm">
            <span>{state.eaten === 0 && state.body.length === 3 ? 'Tap or press a direction to set out' : 'Paused — tap to resume'}</span>
            <span className="text-[10px] text-muted font-normal">Arrows / WASD / swipe · Space pauses</span>
          </button>
        )}
      </div>

      {!settled && (
        <div className="flex items-center justify-center gap-4">
          <div className="grid grid-cols-3 gap-1 w-[150px]">
            <span />
            <Pad label="up" onClick={() => steer('U')}>▲</Pad>
            <span />
            <Pad label="left" onClick={() => steer('L')}>◀</Pad>
            <Pad label={running ? 'pause' : 'resume'} onClick={() => setRunning(r => !r)}>{running ? '❚❚' : '▶'}</Pad>
            <Pad label="right" onClick={() => steer('R')}>▶</Pad>
            <span />
            <Pad label="down" onClick={() => steer('D')}>▼</Pad>
            <span />
          </div>
        </div>
      )}

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="The caravan reached market!" loseTitle={state.crash ?? 'The caravan was lost'} />
    </div>
  )
}

function Pad({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onPointerDown={e => { e.preventDefault(); onClick() }}
      onClick={e => { if (e.detail === 0) onClick() }}
      className="h-11 rounded-lg border bg-panel border-line text-ink font-bold active:bg-accent/20">{children}</button>
  )
}
