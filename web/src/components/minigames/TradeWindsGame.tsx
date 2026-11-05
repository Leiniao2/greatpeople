import { useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, randInt, resolveConfig, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Trade Winds — sail a ship across a grid of sea by the physics of the wind.
//
//   • Every sea cell has a wind (the arrow points where it blows, longer =
//     stronger) and may have a current (blue chevron).
//   • Each turn you pick one of 8 headings, or heave to.  The ship runs that
//     many cells straight ahead, set by its polar diagram: the angle between
//     the heading and where the wind comes FROM.  Head into the wind (0°) and
//     the sails go slack; close-hauled (45°) is slow or, for square sails,
//     impossible; a beam or broad reach (90°–135°) is fastest.  To make ground
//     upwind you must tack, or go the long way round.
//   • A run stops early at land or the edge, and stops when it reaches the
//     next port.  Then the current under the ship sets it one cell.
//   • Every turn eats a day of supplies.  Reach the ports in order before
//     they run out.
//
// Variants (each a different rule, not just a bigger sea):
//   monsoon      Hippalus: the wind blows from the SW, then on a set day the
//                monsoon reverses and blows from the NE.  Out to India on one
//                monsoon, home on the other — wait in port for the change.
//   zheng-he     a treasure fleet: several ports in a fixed order, regional
//                winds, and the great junks never make more than 2 cells.
//   volta-do-mar Columbus: square sails cannot point within 45° of the wind.
//                The NE trades carry you west; to get home you must swing
//                north (the Gulf Stream helps) into the westerlies.
//   doldrums     Magellan: a windless belt across the equator where sails are
//                useless and only the currents move you; pick the current
//                that carries you through.
//   viking-fog   in fog the sun is hidden and an unsighted heading drifts one
//                point off (unseen); a limited sunstone sighting holds it true.
//
//   D1 6×7  4–10 days, slack 3  ≈1 min     D2 7×8  6–12 days, slack 3  ≈1.5 min
//   D3 8×9  8–15 days, slack 2  ≈2 min     D4 9×10 10–17 days, slack 2 ≈3 min
//
// Levels are generated from the seed and kept only if a breadth-first search
// over (cell, next port, sunstones used, season) finds a route; supplies are
// that fastest route plus the tier's slack.  Heaving to all game must lose,
// and at D3/D4 a greedy "always steer the fastest way at the port" sailor
// must lose too.  Monsoon levels must need the reversal (the same voyage on
// one unchanging monsoon runs out of supplies).  In fog the proof only uses sighted headings, so every level
// is winnable without guessing the hidden drift.

export type Mode = 'monsoon' | 'fleet' | 'volta' | 'doldrums' | 'fog'
export type PolarKind = 'lateen' | 'square' | 'junk'

/** speed = base + perForce × force, indexed by the angle off the wind in 45° steps (0 = dead into it). */
export const POLARS: Record<PolarKind, [number, number][]> = {
  lateen: [[0, 0], [1, 0], [1, 1], [1, 1], [0, 1]],
  square: [[0, 0], [0, 0], [0, 1], [1, 1], [1, 1]],
  junk:   [[0, 0], [1, 0], [1, 0], [0, 1], [0, 1]],
}

interface TradeWindsConfig {
  title: string
  rule: string
  intro: string
  fact: string
  mode: Mode
  polar: PolarKind
  /** Story overrides: the ports' names in visiting order, and a plane in place of a ship. */
  portNames?: string[]
  craft?: Craft
}

export type Craft = 'ship' | 'plane'

/** What the board calls things; a plane flies the same winds by the hour. */
export const CRAFT_WORDS: Record<Craft, {
  icon: string; wait: string; stores: string; storesOut: string; stuck: string
  sight: string; sighted: string; fogHint: string; help: string; slack: string; win: string; lose: string
}> = {
  ship: {
    icon: '⛵', wait: '⚓ Heave to', stores: 'Supplies', storesOut: 'Supplies ran out at sea',
    stuck: 'No wind can bring you to port before the supplies run out',
    sight: 'Sunstone', sighted: 'Sighted', fogHint: ' In fog a heading drifts unless you sight the sun first.',
    help: 'Arrows show where the wind blows. Pick a heading: the number is how far the wind takes you this day. Into the wind the sails go slack.',
    slack: 'slack', win: 'Safe in port!', lose: 'Lost at sea',
  },
  plane: {
    icon: '✈️', wait: '↻ Circle', stores: 'Fuel', storesOut: 'The tanks ran dry over the sea',
    stuck: 'No wind can bring you to land before the fuel runs out',
    sight: 'Star fix', sighted: 'Fixed', fogHint: ' In cloud a heading drifts unless you climb out and take a star fix first.',
    help: 'Arrows show where the wind blows. Pick a heading: the number is how far you fly this hour. Straight into the wind you barely move.',
    slack: 'stalled', win: 'Landed!', lose: 'Lost over the ocean',
  },
}

export const CONFIGS: Record<string, TradeWindsConfig> = {
  monsoon: {
    title: 'The Monsoon Road',
    rule: 'Monsoon reversal',
    intro: 'Sail your dhow from Berenike to Muziris on the south-west monsoon, then home on the north-east monsoon. The wind reverses on the marked day: wait in port for it.',
    fact: 'The Periplus of the Erythraean Sea credits a pilot named Hippalus with showing Greek sailors the open-sea crossing to India: out on the south-west monsoon in summer, home on the north-east monsoon in winter. Pliny the Elder names the Malabar port of Muziris at the end of the route.',
    mode: 'monsoon',
    polar: 'lateen',
  },
  'zheng-he': {
    title: 'The Treasure Fleet',
    rule: 'Ports in order, slow junks',
    intro: 'Lead the treasure fleet to every port in the numbered order. The winds differ from sea to sea, and the great junks never sail more than 2 cells a day.',
    fact: 'Between 1405 and 1433 Zheng He led seven Ming treasure voyages across the Indian Ocean, reaching Hormuz and the coast of East Africa. The fleets went out on the winter north-east monsoon and came back on the summer south-west monsoon, waiting at ports such as Malacca for the wind to turn.',
    mode: 'fleet',
    polar: 'junk',
  },
  'volta-do-mar': {
    title: 'The Turn of the Sea',
    rule: 'Square sails cannot beat',
    intro: 'Square sails cannot point within 45° of the wind. Run west on the trade winds to the Indies, then find a way home: swing north on the Gulf Stream into the westerlies.',
    fact: 'In 1492 Columbus sailed west from the Canary Islands on the north-east trade winds, but came home by first heading north to the latitude of the Azores to catch the westerlies: the volta do mar, the "turn of the sea" that Portuguese pilots had learned in the Atlantic.',
    mode: 'volta',
    polar: 'square',
  },
  doldrums: {
    title: 'Into the Doldrums',
    rule: 'Calms: only currents move you',
    intro: 'Run south on the trades, but across the equator lies a belt with no wind at all. Sails are useless there and only the currents carry you. Enter where a current will take you through, then reach the port.',
    fact: 'Where the north-east and south-east trade winds meet near the equator lies the doldrums, a belt of calms and sudden squalls. Antonio Pigafetta, who sailed with Magellan in 1519, wrote of weeks of calms and storms off the coast of Guinea before the fleet reached Brazil.',
    mode: 'doldrums',
    polar: 'square',
  },
  'viking-fog': {
    title: 'The Sunstone',
    rule: 'Fog bends your heading',
    intro: 'Sail west from Norway to Iceland. In the grey fog you cannot see the sun, and a heading set from inside the fog drifts one point off. A sunstone sighting holds your heading true, but you have only a few.',
    fact: 'Norse sagas mention a sólarsteinn, or sunstone. Experiments show that a calcite crystal (Iceland spar) can find the sun through cloud from the polarisation of skylight, and one was found in the wreck of an English ship lost off Alderney in 1592.',
    mode: 'fog',
    polar: 'square',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Pure model ────────────────────────────────────────────────────────────────

export interface Wind { dir: number; str: number }

export interface Level {
  rows: number
  cols: number
  land: boolean[]
  start: number
  /** Ports to reach, in order. */
  ports: number[]
  names: string[]
  startName: string
  /** wind[phase][cell]; phase 1 applies from turn `flip` on. */
  wind: Wind[][]
  flip: number | null
  /** Current direction per cell, -1 = none. */
  current: number[]
  fog: boolean[]
  /** Hidden heading error (±1 point) for an unsighted heading set in fog. */
  drift: number[]
  sunstones: number
  polar: [number, number][]
  cap: number
  /** Supplies: turns allowed. */
  budget: number
  minTurns: number
}

export interface State { pos: number; target: number; turn: number; sun: number }

/** -1 = heave to; 0–7 = heading N, NE, E … NW; 8–15 = the same heading with a sunstone sighting. */
export type Action = number

/** [dRow, dCol] for N, NE, E, SE, S, SW, W, NW. */
export const DIRS: [number, number][] = [[-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1]]
export const DIR_NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export function blankLevel(rows: number, cols: number, polar: PolarKind = 'lateen'): Level {
  const n = rows * cols
  return {
    rows, cols, land: new Array(n).fill(false), start: 0, ports: [], names: [], startName: 'Home',
    wind: [Array.from({ length: n }, () => ({ dir: 0, str: 1 }))], flip: null,
    current: new Array(n).fill(-1), fog: new Array(n).fill(false), drift: new Array(n).fill(0),
    sunstones: 0, polar: POLARS[polar], cap: 9, budget: 99, minTurns: 0,
  }
}

export function moveCell(level: Pick<Level, 'rows' | 'cols'>, i: number, h: number): number {
  const r = Math.floor(i / level.cols) + DIRS[h][0], c = (i % level.cols) + DIRS[h][1]
  if (r < 0 || c < 0 || r >= level.rows || c >= level.cols) return -1
  return r * level.cols + c
}

export function phaseAt(level: Level, turn: number): number {
  return level.flip !== null && turn >= level.flip && level.wind.length > 1 ? 1 : 0
}

/** Angle off the wind in 45° steps: 0 = heading straight into it, 4 = running before it. */
export function angleOff(heading: number, windDir: number): number {
  const from = (windDir + 4) % 8
  const d = Math.abs(heading - from)
  return Math.min(d, 8 - d)
}

/** Cells the ship runs this turn on `heading` from `pos`. */
export function speedAt(level: Level, pos: number, turn: number, heading: number): number {
  const w = level.wind[phaseAt(level, turn)][pos]
  if (!w || w.str <= 0) return 0
  const [b, k] = level.polar[angleOff(heading, w.dir)]
  return Math.min(level.cap, b + k * w.str)
}

export function initialState(level: Level): State {
  return { pos: level.start, target: 0, turn: 0, sun: 0 }
}

export function isWon(level: Level, s: State): boolean {
  return s.target >= level.ports.length
}

/** The heading the ship really takes (fog bends an unsighted heading). */
export function trueHeading(level: Level, s: State, a: Action): number {
  const h = a % 8
  return level.fog[s.pos] && a < 8 ? (h + level.drift[s.pos] + 8) % 8 : h
}

export function step(level: Level, s: State, a: Action): State | null {
  if (isWon(level, s)) return null
  const sight = a >= 8
  if (sight && (!level.fog[s.pos] || s.sun >= level.sunstones)) return null
  let pos = s.pos, target = s.target, docked = false
  const dock = () => { if (pos === level.ports[target]) { target++; docked = true } }
  if (a >= 0) {
    const h = trueHeading(level, s, a)
    const sp = speedAt(level, pos, s.turn, h)
    for (let k = 0; k < sp; k++) {
      const nx = moveCell(level, pos, h)
      if (nx < 0 || level.land[nx]) break
      pos = nx
      dock()
      if (docked) break
    }
  }
  if (!docked && level.current[pos] >= 0) {
    const nx = moveCell(level, pos, level.current[pos])
    if (nx >= 0 && !level.land[nx]) { pos = nx; dock() }
  }
  return { pos, target, turn: s.turn + 1, sun: s.sun + (sight ? 1 : 0) }
}

/** Legal actions; `fair` drops unsighted headings in fog (their drift is hidden from the player). */
export function actionsFor(level: Level, s: State, fair: boolean): Action[] {
  const out: Action[] = [-1]
  const fog = level.fog[s.pos]
  for (let h = 0; h < 8; h++) {
    if (!fog || !fair) out.push(h)
    if (fog && s.sun < level.sunstones) out.push(h + 8)
  }
  return out
}

/** Fastest plan (fewest turns) from `from` within `budget` turns, or null. */
export function solve(level: Level, from: State = initialState(level), budget = level.budget, fair = true): Action[] | null {
  if (isWon(level, from)) return []
  const P = level.ports.length + 1, S = level.sunstones + 1
  const key = (s: State) => ((s.pos * P + s.target) * S + s.sun) * 64 + (level.flip === null ? 0 : Math.min(s.turn, level.flip))
  const nodes: { s: State; parent: number; a: Action }[] = [{ s: from, parent: -1, a: -1 }]
  const seen = new Set<number>([key(from)])
  let layer = [0]
  while (layer.length) {
    const next: number[] = []
    for (const ni of layer) {
      const s = nodes[ni].s
      if (s.turn >= budget) continue
      for (const a of actionsFor(level, s, fair)) {
        const t = step(level, s, a)
        if (!t) continue
        const k = key(t)
        if (seen.has(k)) continue
        seen.add(k)
        nodes.push({ s: t, parent: ni, a })
        const id = nodes.length - 1
        if (isWon(level, t)) {
          const plan: Action[] = []
          for (let j = id; nodes[j].parent >= 0; j = nodes[j].parent) plan.push(nodes[j].a)
          return plan.reverse()
        }
        next.push(id)
      }
    }
    layer = next
  }
  return null
}

export function run(level: Level, plan: Action[]): State {
  let s = initialState(level)
  for (const a of plan) { const t = step(level, s, a); if (!t) break; s = t }
  return s
}

/** Heave to every turn. */
export function idleWins(level: Level): boolean {
  return isWon(level, run(level, new Array(level.budget).fill(-1)))
}

const cheb = (level: Level, a: number, b: number) =>
  Math.max(Math.abs(Math.floor(a / level.cols) - Math.floor(b / level.cols)), Math.abs((a % level.cols) - (b % level.cols)))

/** The naive sailor: each turn, the move that ends closest to the next port (no sunstone). */
export function greedyPlan(level: Level): Action[] {
  let s = initialState(level)
  const plan: Action[] = []
  while (!isWon(level, s) && s.turn < level.budget) {
    let best: { a: Action; t: State; score: number } | null = null
    for (let a = -1; a < 8; a++) {
      const t = step(level, s, a)!
      const score = isWon(level, t) ? -1 : (level.ports.length - t.target) * 1000 + cheb(level, t.pos, level.ports[t.target])
      if (!best || score < best.score) best = { a, t, score }
    }
    plan.push(best!.a)
    s = best!.t
  }
  return plan
}

export function greedyWins(level: Level): boolean {
  return isWon(level, run(level, greedyPlan(level)))
}

// ── Generation ────────────────────────────────────────────────────────────────

interface Tier { rows: number; cols: number; slack: number; minTurns: number; maxTurns: number; islands: number; ports: number; sun: number; calm: number }

export const TIERS: Record<Difficulty, Tier> = {
  1: { rows: 6, cols: 7,  slack: 3, minTurns: 4,  maxTurns: 10, islands: 1, ports: 2, sun: 3, calm: 1 },
  2: { rows: 7, cols: 8,  slack: 3, minTurns: 6,  maxTurns: 12, islands: 2, ports: 2, sun: 3, calm: 2 },
  3: { rows: 8, cols: 9,  slack: 2, minTurns: 8,  maxTurns: 15, islands: 3, ports: 3, sun: 3, calm: 2 },
  4: { rows: 9, cols: 10, slack: 2, minTurns: 10, maxTurns: 17, islands: 4, ports: 3, sun: 3, calm: 3 },
}

function addIslands(level: Level, count: number, rng: Rng, reserved: Set<number>, allowed: (i: number) => boolean = () => true) {
  const n = level.rows * level.cols
  const blocked = new Set<number>()
  for (const p of reserved) {
    blocked.add(p)
    for (let h = 0; h < 8; h++) { const q = moveCell(level, p, h); if (q >= 0) blocked.add(q) }
  }
  for (let k = 0; k < count; k++) {
    let seed = -1
    for (let t = 0; t < 30 && seed < 0; t++) {
      const i = Math.floor(rng() * n)
      if (!level.land[i] && !blocked.has(i) && allowed(i)) seed = i
    }
    if (seed < 0) continue
    level.land[seed] = true
    let at = seed
    const size = randInt(rng, 0, 2)
    for (let g = 0; g < size; g++) {
      const q = moveCell(level, at, [0, 2, 4, 6][Math.floor(rng() * 4)])
      if (q >= 0 && !blocked.has(q) && allowed(q)) { level.land[q] = true; at = q }
    }
  }
}

const strOf = (rng: Rng, p2: number) => (rng() < p2 ? 2 : 1)

function build(cfg: TradeWindsConfig, d: Difficulty, rng: Rng): Level | null {
  const tier = TIERS[d]
  const { rows, cols } = tier
  const L = blankLevel(rows, cols, cfg.polar)
  const n = rows * cols
  const idx = (r: number, c: number) => r * cols + c
  const rowOf = (i: number) => Math.floor(i / cols)
  const coast = (c: number) => { for (let r = 0; r < rows; r++) L.land[idx(r, c)] = true }

  if (cfg.mode === 'monsoon') {
    coast(0); coast(cols - 1)
    const A = idx(randInt(rng, 0, rows - 1), 0), B = idx(randInt(rng, 0, rows - 1), cols - 1)
    L.land[A] = L.land[B] = false
    L.start = A; L.startName = 'Berenike'
    addIslands(L, tier.islands, rng, new Set([A, B]))
    const strs = Array.from({ length: n }, () => strOf(rng, 0.25))
    L.wind = [strs.map(str => ({ dir: 1, str })), strs.map(str => ({ dir: 5, str }))]
    // When does the monsoon turn? A little after the fastest outward run.
    const out = solve({ ...L, ports: [B], wind: [L.wind[0]], flip: null }, initialState(L), 40)
    if (!out) return null
    L.flip = out.length + randInt(rng, 1, 2)
    L.ports = [B, A]; L.names = ['Muziris', 'Berenike']
    return L
  }

  if (cfg.mode === 'volta') {
    const s = Math.max(2, Math.floor(rows * 0.4)) // westerlies above, trades below
    coast(cols - 1)
    const start = idx(randInt(rng, s + 1, rows - 1), cols - 1)
    const home = idx(randInt(rng, 0, s - 1), cols - 1)
    const indies = idx(randInt(rng, s + 1, rows - 1), randInt(rng, 1, 2))
    L.land[start] = L.land[home] = false
    L.start = start; L.startName = 'Canaries'
    L.ports = [indies, home]; L.names = ['San Salvador', 'Lisbon']
    for (let r = s; r < rows; r++) L.current[idx(r, 0)] = 0 // Gulf Stream runs north
    addIslands(L, tier.islands, rng, new Set([start, home, indies]), i => i % cols !== 0)
    L.wind = [Array.from({ length: n }, (_, i) => (rowOf(i) < s ? { dir: 2, str: strOf(rng, 0.4) } : { dir: 5, str: strOf(rng, 0.6) }))]
    return L
  }

  if (cfg.mode === 'doldrums') {
    const top = Math.floor((rows - tier.calm) / 2), bot = top + tier.calm
    const start = idx(0, randInt(rng, 1, cols - 2)), port = idx(rows - 1, randInt(rng, 0, cols - 1))
    L.start = start; L.startName = 'Sanlúcar'
    L.ports = [port]; L.names = ['Rio']
    const opts = [2, 2, 2, 6, 6, 6, 3, 3, 5, 5, 4]
    for (let r = top; r < bot; r++) for (let c = 0; c < cols; c++) L.current[idx(r, c)] = opts[Math.floor(rng() * opts.length)]
    addIslands(L, tier.islands, rng, new Set([start, port]), i => rowOf(i) < top - 1 || rowOf(i) > bot)
    L.wind = [Array.from({ length: n }, (_, i) => {
      const r = rowOf(i)
      return r < top ? { dir: 5, str: strOf(rng, 0.5) } : r < bot ? { dir: 5, str: 0 } : { dir: 7, str: strOf(rng, 0.4) }
    })]
    return L
  }

  if (cfg.mode === 'fleet') {
    L.cap = 2
    L.start = idx(randInt(rng, 0, rows - 1), randInt(rng, 0, cols - 1)); L.startName = 'Nanjing'
    const pts = [L.start]
    for (let k = 0; k < tier.ports; k++) {
      let p = -1
      for (let t = 0; t < 60 && p < 0; t++) {
        const q = Math.floor(rng() * n)
        if (pts.every(x => cheb(L, x, q) >= 2) && cheb(L, pts[pts.length - 1], q) >= 3) p = q
      }
      if (p < 0) return null
      pts.push(p)
    }
    L.ports = pts.slice(1)
    L.names = ['Champa', 'Malacca', 'Calicut', 'Hormuz'].slice(0, tier.ports)
    addIslands(L, tier.islands + 1, rng, new Set(pts))
    const zr = Math.floor(rows / 2), zc = Math.floor(cols / 2)
    const zones = Array.from({ length: 4 }, () => ({ dir: Math.floor(rng() * 8), str: strOf(rng, 0.5) }))
    L.wind = [Array.from({ length: n }, (_, i) => ({ ...zones[(rowOf(i) < zr ? 0 : 2) + (i % cols < zc ? 0 : 1)] }))]
    return L
  }

  // fog
  coast(0); coast(cols - 1)
  const start = idx(randInt(rng, 0, rows - 1), cols - 1), port = idx(randInt(rng, 0, rows - 1), 0)
  L.land[start] = L.land[port] = false
  L.start = start; L.startName = 'Norway'
  L.ports = [port]; L.names = ['Iceland']
  L.sunstones = tier.sun
  const h = rows - randInt(rng, 0, 1), r0 = randInt(rng, 0, rows - h)
  for (let r = r0; r < r0 + h; r++) for (let c = 2; c <= cols - 3; c++) {
    L.fog[idx(r, c)] = true
    L.drift[idx(r, c)] = rng() < 0.5 ? 1 : -1
  }
  addIslands(L, tier.islands, rng, new Set([start, port]))
  const bands = randInt(rng, 2, 3)
  const bandWind = Array.from({ length: bands }, () => ({ dir: [0, 1, 2, 3, 4][Math.floor(rng() * 5)], str: strOf(rng, 0.4) }))
  L.wind = [Array.from({ length: n }, (_, i) => ({ ...bandWind[Math.min(bands - 1, Math.floor(rowOf(i) * bands / rows))] }))]
  return L
}

export function generate(cfg: TradeWindsConfig, d: Difficulty, seed: number): Level {
  const tier = TIERS[d]
  let best: { level: Level; score: number } | null = null
  for (let attempt = 0; attempt < 300; attempt++) {
    const rng = mulberry32(hashString(`tradewinds:${cfg.mode}:${cfg.polar}:${d}:${seed}:${attempt}`))
    const base = build(cfg, d, rng)
    if (!base) continue
    const plan = solve(base, initialState(base), 40)
    if (!plan || plan.length > tier.maxTurns) continue
    const level: Level = { ...base, minTurns: plan.length, budget: plan.length + tier.slack }
    if (idleWins(level)) continue
    if (d >= 3 && greedyWins(level)) continue
    if (level.sunstones > 0 && solve({ ...level, sunstones: 0 })) continue
    // The monsoon must matter: beating home on the old monsoon is too slow.
    if (level.flip !== null && solve({ ...level, wind: [level.wind[0]], flip: null })) continue
    const score = Math.min(plan.length, tier.minTurns) * 10 + (greedyWins(level) ? 0 : 1)
    if (!best || score > best.score) best = { level, score }
    if (score >= tier.minTurns * 10 + 1 || (attempt > 60 && plan.length >= tier.minTurns - 1)) break
  }
  if (best) return best.level
  return fallbackLevel()
}

/** Not expected: an open sea with a headwind leg. */
function fallbackLevel(): Level {
  const L = blankLevel(5, 5)
  L.start = 20; L.ports = [4]; L.names = ['Port']
  L.wind = [Array.from({ length: 25 }, () => ({ dir: 4, str: 1 }))] // blows south: N is dead upwind
  const plan = solve(L, initialState(L), 30)!
  return { ...L, minTurns: plan.length, budget: plan.length + 2 }
}

// ── Component ─────────────────────────────────────────────────────────────────

const CELL = 34
const COMPASS: number[][] = [[7, 0, 1], [6, -1, 2], [5, 4, 3]]
const GLYPH = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']

function Arrow({ x, y, dir, len, color, width = 1.6 }: { x: number; y: number; dir: number; len: number; color: string; width?: number }) {
  const h = len / 2
  return (
    <g transform={`translate(${x} ${y}) rotate(${dir * 45})`}>
      <path d={`M0 ${h} L0 ${-h} M-3 ${-h + 4} L0 ${-h} L3 ${-h + 4}`} stroke={color} strokeWidth={width} fill="none" strokeLinecap="round" />
    </g>
  )
}

export default function TradeWindsGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'monsoon')
  const level = useMemo(() => generate(cfg, difficulty, seed), [cfg.mode, cfg.polar, difficulty, seed]) // eslint-disable-line react-hooks/exhaustive-deps
  const words = CRAFT_WORDS[cfg.craft ?? 'ship']
  const names = level.names.map((n, i) => cfg.portNames?.[i] ?? n)
  const [state, setState] = useState<State>(() => initialState(level))
  const [trail, setTrail] = useState<number[]>([level.start])
  const [sighting, setSighting] = useState(false)
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const live = useRef({ state, settled })
  live.current = { state, settled: live.current.settled || settled }
  useEffect(() => {
    const s = initialState(level)
    live.current = { state: s, settled: false }
    setState(s); setTrail([level.start]); setSighting(false)
  }, [level])

  const act = (a: Action) => {
    const cur = live.current
    if (cur.settled) return
    const next = step(level, cur.state, a)
    if (!next) return
    live.current = { ...cur, state: next }
    setState(next); setTrail(t => [...t, next.pos]); setSighting(false)
    if (isWon(level, next)) { live.current.settled = true; win(); return }
    if (next.turn >= level.budget) { live.current.settled = true; lose(words.storesOut); return }
    if (!solve(level, next, level.budget, false)) { live.current.settled = true; lose(words.stuck) }
  }

  const sail = (h: number) => act(sighting ? h + 8 : h)

  const phase = phaseAt(level, state.turn)
  const here = level.wind[phase][state.pos]
  const inFog = level.fog[state.pos]
  const canSight = inFog && state.sun < level.sunstones && !settled
  const left = level.budget - state.turn
  const W = level.cols * CELL, H = level.rows * CELL
  const center = (i: number) => [(i % level.cols) * CELL + CELL / 2, Math.floor(i / level.cols) * CELL + CELL / 2]
  const target = level.ports[state.target]

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p data-testid="tw-port" className="font-bold text-ink-2">⚓ {Math.min(state.target, level.ports.length)} / {level.ports.length}</p>
          <p data-testid="tw-supplies" className={left <= 2 ? 'text-red-600 font-bold' : ''}>{words.stores} {left}</p>
          {level.sunstones > 0 && <p data-testid="tw-sunstones">{words.sight} {level.sunstones - state.sun}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-0.5 justify-center" aria-label="days of supplies">
        {Array.from({ length: level.budget }, (_, t) => {
          const ph = phaseAt(level, t)
          const past = t < state.turn, now = t === state.turn
          const tone = level.flip !== null ? (ph ? 'bg-orange-200' : 'bg-teal-200') : 'bg-paper'
          return (
            <span key={t} className={`w-4 h-4 rounded-sm text-[8px] leading-4 text-center border
              ${past ? 'bg-panel border-line text-muted/40' : now ? 'bg-accent text-accent-fg border-accent' : `${tone} border-line text-ink-2`}`}>
              {level.flip === t ? '⟲' : t + 1}
            </span>
          )
        })}
      </div>
      {level.flip !== null && (
        <p className="text-[10px] text-center text-muted -mt-2">
          <span className="text-teal-700 font-bold">SW monsoon</span> until day {level.flip}, then <span className="text-orange-700 font-bold">NE monsoon</span>
        </p>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[400px] mx-auto rounded-lg border border-line select-none" style={{ touchAction: 'manipulation' }} role="img" aria-label="sea chart">
        {level.land.map((isLand, i) => {
          const x = (i % level.cols) * CELL, y = Math.floor(i / level.cols) * CELL
          const w = level.wind[phase][i]
          const [cx, cy] = center(i)
          return (
            <g key={i} data-cell={i}>
              <rect x={x} y={y} width={CELL} height={CELL} fill={isLand ? '#d9c08f' : w.str === 0 ? '#bfdbe4' : '#7fb3d5'} stroke="#00000018" strokeWidth={0.5} />
              {!isLand && (w.str > 0
                ? <Arrow x={cx} y={cy} dir={w.dir} len={8 + 6 * w.str} color="#1e3a5f" />
                : <text x={cx} y={cy + 3} textAnchor="middle" fontSize={7} fill="#476072">calm</text>)}
              {!isLand && level.current[i] >= 0 && (
                <g transform={`translate(${x + CELL - 8} ${y + CELL - 8}) rotate(${level.current[i] * 45})`}>
                  <path d="M-3 2 L0 -2 L3 2" stroke="#0369a1" strokeWidth={1.6} fill="none" />
                </g>
              )}
              {level.fog[i] && <rect x={x} y={y} width={CELL} height={CELL} fill="#e5e7eb" opacity={0.55} />}
            </g>
          )
        })}
        <polyline points={trail.map(p => center(p).join(',')).join(' ')} fill="none" stroke="#b45309" strokeWidth={1.5} strokeDasharray="3 2" />
        <g>
          <circle cx={center(level.start)[0]} cy={center(level.start)[1]} r={5} fill="none" stroke="#334155" strokeWidth={1} />
        </g>
        {level.ports.map((p, k) => {
          const [cx, cy] = center(p)
          const done = k < state.target, next = k === state.target && !settled
          return (
            <g key={`p${k}`} data-port={k}>
              <circle cx={cx} cy={cy} r={11} fill={done ? '#65a30d' : '#f5f0e1'} stroke={next ? '#dc2626' : '#334155'} strokeWidth={next ? 2.5 : 1} />
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} fontWeight="bold" fill={done ? '#fff' : '#111'}>{k + 1}</text>
            </g>
          )
        })}
        {(() => {
          const [cx, cy] = center(state.pos)
          return <text data-testid="tw-ship" x={cx} y={cy + 6} textAnchor="middle" fontSize={17}>{words.icon}</text>
        })()}
      </svg>

      <p data-testid="tw-wind" className="text-[11px] text-center text-ink-2 -mt-1">
        {here.str > 0 ? `Wind here from the ${DIR_NAMES[(here.dir + 4) % 8]}, force ${here.str}` : 'Becalmed: only the current moves you'}
        {inFog ? ' · in fog' : ''}
        {target !== undefined && !settled ? ` · next: ${names[state.target]} (${state.target + 1})` : ''}
      </p>

      {!settled && (
        <div className="flex items-center justify-center gap-3">
          <div className="grid grid-cols-3 gap-1 w-[168px]">
            {COMPASS.flat().map(h => {
              if (h < 0) return (
                <button key="wait" type="button" data-testid="tw-wait" onClick={() => act(-1)}
                  className="h-12 rounded-lg border bg-panel border-line text-[10px] font-bold text-ink-2">{words.wait}</button>
              )
              const real = inFog && !sighting ? -1 : h
              const sp = real >= 0 ? speedAt(level, state.pos, state.turn, real) : -1
              return (
                <button key={h} type="button" data-testid={`tw-h-${h}`} onClick={() => sail(h)} aria-label={`sail ${DIR_NAMES[h]}`}
                  className={`h-12 rounded-lg border text-sm font-bold leading-tight
                    ${sp === 0 ? 'bg-paper border-line text-muted/60' : 'bg-panel border-line text-ink hover:border-accent/50'}`}>
                  {GLYPH[h]}<br /><span className="text-[9px] font-normal">{sp < 0 ? '?' : sp === 0 ? words.slack : `${sp} cell${sp > 1 ? 's' : ''}`}</span>
                </button>
              )
            })}
          </div>
          {level.sunstones > 0 && (
            <button type="button" data-testid="tw-sun" disabled={!canSight} onClick={() => setSighting(v => !v)}
              className={`h-12 w-20 rounded-lg border text-[10px] font-bold disabled:opacity-40
                ${sighting ? 'bg-amber-300 border-amber-500 text-ink' : 'bg-panel border-line text-ink-2'}`}>
              ☀ {sighting ? words.sighted : words.sight}
            </button>
          )}
        </div>
      )}
      <p className="text-muted text-[10px] text-center -mt-1">
        {settled ? '' : words.help}
        {!settled && level.sunstones > 0 && words.fogHint}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle={words.win} loseTitle={reason ?? words.lose} />
    </div>
  )
}
