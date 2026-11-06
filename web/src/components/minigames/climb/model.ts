// Summit Climb: a tall rock face generated from a seed.  The climber moves
// hold to hold within reach; every move costs stamina (more for long or
// upward moves, more again under an overhang or onto ice), ledges restore
// it, loose holds crumble once you leave them, and a fall drops you to your
// last anchor (the start, a ledge or a piton) until the rope has held as
// many falls as it can.  Generated levels are proved climbable by `solve()`,
// and from D2 the naive "always grab the highest hold" climber must fail.

import { hashString, mulberry32, type Rng } from '../_shared'
import type { Difficulty } from '@/games/types'

export type HoldKind = 'start' | 'hold' | 'loose' | 'ice' | 'ledge' | 'summit'

export interface Hold { id: number; x: number; y: number; kind: HoldKind }
export interface Band { y0: number; y1: number }

export interface Mountain {
  title: string
  blurb: string
  fact: string
  /** Altitude at the foot of the face and at the summit, metres. */
  fromM: number
  toM: number
  /** Overhang bands per tier step, and how icy the upper tiers are. */
  overhangs: number
  ice: number
  rock: string
  rockDark: string
  sky: [string, string]
}

export const MOUNTAINS: Record<string, Mountain> = {
  'mont-blanc': {
    title: 'Mont Blanc, 1786',
    blurb: 'Chamonix to the roof of the Alps. Find a line across the rock and snow to the summit.',
    fact: 'On 8 August 1786 Jacques Balmat and Michel-Gabriel Paccard reached the top of Mont Blanc (4,808 m), answering a prize Horace-Bénédict de Saussure had offered in 1760. The climb is often called the birth of mountaineering.',
    fromM: 1035, toM: 4808, overhangs: 1, ice: 0.1,
    rock: '#8b7d6b', rockDark: '#5c5246', sky: ['#7dd3fc', '#e0f2fe'],
  },
  matterhorn: {
    title: 'Matterhorn, 1865',
    blurb: "Whymper's party on the Hörnli ridge. Steep rock, loose stone, and a long way down.",
    fact: "Edward Whymper's party of seven reached the Matterhorn's 4,478 m summit on 14 July 1865. On the descent Michel Croz, Douglas Hadow, Charles Hudson and Lord Francis Douglas fell to their deaths when the rope broke.",
    fromM: 1608, toM: 4478, overhangs: 1, ice: 0.12,
    rock: '#7c6f64', rockDark: '#4a403a', sky: ['#60a5fa', '#dbeafe'],
  },
  eiger: {
    title: 'Eiger North Face, 1938',
    blurb: 'The Mordwand: overhangs, ice fields and falling stone on the most feared wall in the Alps.',
    fact: 'The Eiger North Face, about 1,800 m of rock and ice, was first climbed on 21–24 July 1938 by Anderl Heckmair, Ludwig Vörg, Heinrich Harrer and Fritz Kasparek.',
    fromM: 2167, toM: 3967, overhangs: 2, ice: 0.18,
    rock: '#57534e', rockDark: '#292524', sky: ['#64748b', '#cbd5e1'],
  },
  everest: {
    title: 'Everest, 1953',
    blurb: 'From the South Col to the top of the world. Thin air, ice, and every move counts.',
    fact: 'On 29 May 1953 Edmund Hillary and Tenzing Norgay, of the British expedition led by John Hunt, became the first people confirmed to stand on the summit of Everest, now measured at 8,849 m.',
    fromM: 7906, toM: 8849, overhangs: 1, ice: 0.3,
    rock: '#6b6b74', rockDark: '#3f3f46', sky: ['#1e3a8a', '#93c5fd'],
  },
  annapurna: {
    title: 'Annapurna, 1950',
    blurb: 'The first eight-thousander. Push through the ice to 8,091 m before the monsoon closes in.',
    fact: 'On 3 June 1950 Maurice Herzog and Louis Lachenal reached the summit of Annapurna (8,091 m), the first 8,000 m peak ever climbed. Both suffered severe frostbite on the descent.',
    fromM: 5100, toM: 8091, overhangs: 1, ice: 0.25,
    rock: '#78716c', rockDark: '#44403c', sky: ['#38bdf8', '#f0f9ff'],
  },
}

export const WIDTH = 9
export const REACH = 2.6

export interface Tier {
  height: number
  stamina: number
  pitons: number
  falls: number
  traps: number
  loose: number
  scatter: number
  seconds: number
}

export const TIERS: Record<Difficulty, Tier> = {
  1: { height: 30, stamina: 14, pitons: 3, falls: 3, traps: 0, loose: 0.1, scatter: 0.1, seconds: 0 },
  2: { height: 55, stamina: 12, pitons: 3, falls: 2, traps: 3, loose: 0.2, scatter: 0.1, seconds: 240 },
  3: { height: 80, stamina: 11, pitons: 2, falls: 1, traps: 4, loose: 0.25, scatter: 0.1, seconds: 330 },
  4: { height: 110, stamina: 10, pitons: 2, falls: 1, traps: 6, loose: 0.3, scatter: 0.11, seconds: 420 },
}

export interface Puzzle {
  mountain: string
  difficulty: Difficulty
  holds: Hold[]
  bands: Band[]
  /** Neighbours of each hold within reach. */
  near: number[][]
  start: number
  summit: number
  stamina: number
  pitons: number
  falls: number
  seconds: number
  /** Decorative rock cracks: x1, y1, x2, y2. */
  cracks: [number, number, number, number][]
}

export const dist = (a: Hold, b: Hold) => Math.hypot(a.x - b.x, a.y - b.y)
const inBand = (bands: Band[], y: number) => bands.some(b => y >= b.y0 && y <= b.y1)

/** Stamina a move from a to b costs. */
export function moveCost(p: Pick<Puzzle, 'bands'>, a: Hold, b: Hold): number {
  const up = Math.max(0, b.y - a.y)
  const mult = inBand(p.bands, b.y) ? 1.5 : 1
  return Math.ceil((dist(a, b) + 0.5 * up) * mult - 1e-9) + (b.kind === 'ice' ? 2 : 0)
}

// ── Play ──────────────────────────────────────────────────────────────────────

export interface State {
  at: number
  stamina: number
  anchor: number
  pitons: number
  /** Falls the rope can still hold. */
  falls: number
  crumbled: number[]
  /** Holds with a piton in them. */
  placed: number[]
  moves: number
  outcome: 'won' | 'lost' | null
}

export type Event = 'moved' | 'fell' | 'summit' | 'lost' | null

export function initialState(p: Puzzle): State {
  return { at: p.start, stamina: p.stamina, anchor: p.start, pitons: p.pitons, falls: p.falls, crumbled: [], placed: [], moves: 0, outcome: null }
}

/** Holds the climber can grab from where they are (within reach, still on the wall). */
export function reachable(p: Puzzle, s: State): number[] {
  return p.near[s.at].filter(id => !s.crumbled.includes(id))
}

const leave = (p: Puzzle, s: State): number[] =>
  p.holds[s.at].kind === 'loose' && !s.crumbled.includes(s.at) ? [...s.crumbled, s.at] : s.crumbled

/** Drop onto the rope: back to the last anchor, rested, one fall fewer. */
export function fall(p: Puzzle, s: State): { state: State; event: Event } {
  if (s.outcome) return { state: s, event: null }
  const crumbled = leave(p, s)
  if (s.falls <= 0) return { state: { ...s, crumbled, outcome: 'lost' }, event: 'lost' }
  return { state: { ...s, crumbled, at: s.anchor, stamina: p.stamina, falls: s.falls - 1 }, event: 'fell' }
}

/** Reach for a hold.  Too far is ignored; too tiring is a fall. */
export function move(p: Puzzle, s: State, to: number): { state: State; event: Event } {
  if (s.outcome || !reachable(p, s).includes(to)) return { state: s, event: null }
  const cost = moveCost(p, p.holds[s.at], p.holds[to])
  if (cost > s.stamina) return fall(p, s)
  const kind = p.holds[to].kind
  const next: State = {
    ...s, crumbled: leave(p, s), at: to, moves: s.moves + 1,
    stamina: kind === 'ledge' ? p.stamina : s.stamina - cost,
    anchor: kind === 'ledge' ? to : s.anchor,
  }
  if (kind === 'summit') return { state: { ...next, outcome: 'won' }, event: 'summit' }
  return { state: next, event: 'moved' }
}

export const canPiton = (p: Puzzle, s: State) =>
  !s.outcome && s.pitons > 0 && s.stamina >= 1 && s.anchor !== s.at && p.holds[s.at].kind !== 'loose'

/** Hammer a piton in: this hold becomes the anchor, for one stamina. */
export function piton(p: Puzzle, s: State): State {
  if (!canPiton(p, s)) return s
  return { ...s, pitons: s.pitons - 1, stamina: s.stamina - 1, anchor: s.at, placed: [...s.placed, s.at] }
}

// ── Proofs ────────────────────────────────────────────────────────────────────

/**
 * A path from the start to the summit without falling, or null.  Breadth
 * first over (hold, stamina) states, keeping a state only when it has more
 * stamina than any earlier visit to that hold (more stamina dominates).  The
 * path is replayed through `move`, which also rules out stepping back onto a
 * hold that crumbled.
 */
export function solve(p: Puzzle): number[] | null {
  const best = new Array<number>(p.holds.length).fill(-1)
  const hold: number[] = [p.start], sta: number[] = [p.stamina], parent: number[] = [-1]
  best[p.start] = p.stamina
  let found = -1
  for (let q = 0; q < hold.length && found < 0; q++) {
    const u = hold[q]
    for (const v of p.near[u]) {
      const c = moveCost(p, p.holds[u], p.holds[v])
      if (c > sta[q]) continue
      const sv = p.holds[v].kind === 'ledge' ? p.stamina : sta[q] - c
      if (sv <= best[v]) continue
      best[v] = sv
      hold.push(v); sta.push(sv); parent.push(q)
      if (v === p.summit) { found = hold.length - 1; break }
    }
  }
  if (found < 0) return null
  const path: number[] = []
  for (let k = found; k > 0; k = parent[k]) path.unshift(hold[k])
  let s = initialState(p)
  for (const id of path) {
    const r = move(p, s, id)
    if (r.event !== 'moved' && r.event !== 'summit') return null
    s = r.state
  }
  return s.outcome === 'won' ? path : null
}

/** The naive climber: always the highest hold in reach it has not been on, never a piton. */
export function greedy(p: Puzzle): boolean {
  let s = initialState(p)
  const seen = new Set([p.start])
  for (let guard = 0; guard < p.holds.length + 5; guard++) {
    const opts = reachable(p, s).filter(id => !seen.has(id))
    if (!opts.length) return false
    const here = p.holds[s.at]
    const to = opts.reduce((a, b) => (p.holds[b].y > p.holds[a].y + 1e-9 ||
      (Math.abs(p.holds[b].y - p.holds[a].y) < 1e-9 && dist(here, p.holds[b]) < dist(here, p.holds[a])) ? b : a))
    const r = move(p, s, to)
    if (r.event === 'summit') return true
    if (r.event !== 'moved') return false
    s = r.state
    seen.add(to)
  }
  return false
}

// ── Generation ────────────────────────────────────────────────────────────────

const clampX = (x: number) => Math.min(WIDTH - 0.5, Math.max(0.5, x))

function build(mountainId: string, d: Difficulty, rng: Rng): Puzzle {
  const m = MOUNTAINS[mountainId]
  const t = TIERS[d]
  const H = t.height
  const iceFrac = d >= 3 ? m.ice : 0

  // Overhang bands, clear of the start and the summit.
  const bands: Band[] = []
  const nb = d === 1 ? 0 : Math.min(4, (d - 1) * m.overhangs)
  for (let i = 0; i < nb; i++) {
    const seg = (H - 12) / nb
    const y0 = 5 + seg * i + rng() * Math.max(0, seg - 7)
    bands.push({ y0, y1: y0 + 4 + rng() * 3 })
  }
  const P = { bands }

  const holds: Hold[] = [{ id: 0, x: WIDTH / 2, y: 0, kind: 'start' }]
  const add = (x: number, y: number, kind: HoldKind) => { holds.push({ id: holds.length, x, y, kind }); return holds.length - 1 }

  // The guaranteed route, meandering across the face; ledges go in only when
  // the climber would otherwise run out of stamina.
  const route: number[] = [0]
  let x = WIDTH / 2, y = 0, stamina = t.stamina
  const phase = rng() * Math.PI * 2, wave = 2.2 + rng() * 1.2
  while (y < H) {
    let nx = 0, ny = 0
    for (let k = 0; k < 20; k++) {
      ny = y + 1.0 + rng() * 0.8
      const target = WIDTH / 2 + wave * Math.sin(phase + ny / 6)
      nx = clampX(x + Math.max(-1.6, Math.min(1.6, (target - x) * 0.6 + (rng() - 0.5) * 1.6)))
      if (Math.hypot(nx - x, ny - y) <= REACH * 0.95) break
      nx = x
    }
    const r = rng()
    const kind: HoldKind = r < iceFrac ? 'ice' : r < iceFrac + t.loose ? 'loose' : 'hold'
    const prev = holds[route[route.length - 1]]
    const cand: Hold = { id: -1, x: nx, y: ny, kind }
    const c = moveCost(P, prev, cand)
    if (c > stamina) {
      if (prev.kind !== 'start') prev.kind = 'ledge'
      stamina = t.stamina
    }
    stamina -= c
    route.push(add(nx, ny, kind))
    x = nx; y = ny
  }
  const last = holds[route[route.length - 1]]
  const summitCand: Hold = { id: -1, x: last.x, y: last.y + 1.4, kind: 'summit' }
  if (moveCost(P, last, summitCand) > stamina && last.kind !== 'start') last.kind = 'ledge'
  const summit = add(last.x, last.y + 1.4, 'summit')

  // Traps: tempting ladders of loose holds that climb faster than the route
  // and end below blank rock.
  const trapIds = new Set<number>(), junctions = new Set<number>()
  for (let k = 0; k < t.traps; k++) {
    const lo = Math.floor((route.length - 4) * k / t.traps) + 2
    const hi = Math.floor((route.length - 4) * (k + 1) / t.traps) + 1
    for (let attempt = 0; attempt < 12; attempt++) {
      const ji = lo + Math.floor(rng() * Math.max(1, hi - lo))
      const J = holds[route[ji]]
      if (J.kind === 'ledge' || junctions.has(J.id)) continue
      const side = J.x < WIDTH / 2 ? 1 : -1
      const len = 3 + Math.floor(rng() * 3)
      const pts: [number, number][] = []
      let px = J.x, py = J.y, ok = true
      for (let i = 0; i < len && ok; i++) {
        const ang = (0.25 + rng() * 0.35) * side
        px += Math.sin(ang) * REACH * 0.93; py += Math.cos(ang) * REACH * 0.93
        if (px < 0.4 || px > WIDTH - 0.4 || py > H) { ok = false; break }
        pts.push([px, py])
      }
      if (!ok) continue
      // Each trap hold may touch only the junction (first) and its own neighbours.
      const clash = pts.some(([qx, qy], i) => holds.some(h =>
        !(i === 0 && h.id === J.id) && !trapIds.has(h.id) && Math.hypot(h.x - qx, h.y - qy) <= REACH + 0.1) ||
        [...trapIds].some(id => Math.hypot(holds[id].x - qx, holds[id].y - qy) <= REACH + 0.1))
      if (clash) continue
      for (const [qx, qy] of pts) trapIds.add(add(qx, qy, 'loose'))
      junctions.add(J.id)
      break
    }
  }

  // Scatter: plenty of other rock to read, away from the traps and junctions.
  const want = Math.round(WIDTH * H * t.scatter)
  for (let k = 0, tries = 0; k < want && tries < want * 20; tries++) {
    const sx = 0.4 + rng() * (WIDTH - 0.8), sy = 0.8 + rng() * (H - 0.5)
    if (holds.some(h => Math.hypot(h.x - sx, h.y - sy) < 0.85)) continue
    if ([...trapIds, ...junctions].some(id => Math.hypot(holds[id].x - sx, holds[id].y - sy) <= REACH + 0.1)) continue
    const r = rng()
    add(sx, sy, r < iceFrac ? 'ice' : r < iceFrac + t.loose ? 'loose' : 'hold')
    k++
  }

  const near = holds.map(a => holds.filter(b => b !== a && dist(a, b) <= REACH).map(b => b.id))
  const cracks: Puzzle['cracks'] = []
  for (let i = 0; i < H * 1.2; i++) {
    const cx = rng() * WIDTH, cy = rng() * (H + 2)
    cracks.push([cx, cy, cx + (rng() - 0.5) * 1.6, cy + 0.4 + rng() * 1.4])
  }
  return {
    mountain: mountainId, difficulty: d, holds, bands, near, start: 0, summit,
    stamina: t.stamina, pitons: t.pitons, falls: t.falls, seconds: t.seconds, cracks,
  }
}

export function makePuzzle(configId: string, difficulty: Difficulty, seed: number): Puzzle {
  const id = MOUNTAINS[configId] ? configId : 'mont-blanc'
  const base = hashString(`climb:${id}:${difficulty}:${seed}`)
  let fallback: Puzzle | null = null
  for (let attempt = 0; attempt < 80; attempt++) {
    const p = build(id, difficulty, mulberry32(base + attempt * 7919))
    if (!solve(p)) continue
    if (difficulty === 1 || !greedy(p)) return p
    fallback ??= p
  }
  return fallback ?? build(id, difficulty, mulberry32(base))
}

/** Altitude in metres for a height on the face. */
export function altitude(p: Puzzle, y: number): number {
  const m = MOUNTAINS[p.mountain]
  const top = p.holds[p.summit].y
  return Math.round(m.fromM + (m.toM - m.fromM) * Math.max(0, Math.min(1, y / top)))
}
