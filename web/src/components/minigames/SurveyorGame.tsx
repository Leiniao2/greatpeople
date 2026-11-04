import { useMemo, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, hashString, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Triangulation: measure what you cannot reach, by angles alone.
//
// Five surveys, each with its own rule:
//
//   ship      Thales' ships — pick two shore posts to sight a ship. Every post's
//             instrument has its own precision; the fix error is
//             √((σA·dA)² + (σB·dB)²) / sin γ (γ = angle at the ship), so a good
//             surveyor balances baseline width, distance and instrument quality.
//             Headlands block some lines of sight.
//   arc       The Great Arc — chain triangles from a measured baseline up to a
//             peak. Each new station is fixed from two known ones and inherits
//             their error: u = max(uA, uB) + σ·√(dA² + dB²) / sin γ.
//   noon      Eratosthenes — the circumference follows from the shadow angle at
//             Alexandria at true noon, but the water clock is off. Readings are
//             limited: find the shortest shadow (a unimodal search).
//   ratio     Thales' pyramid by similar triangles — pick the hour when the
//             shadow runs square off a face and clears the base; height =
//             (half base + rope) × staff / staff-shadow. A slanted shadow
//             under-measures by cos(slant).
//   moment    Thales' moment — no division allowed: height = half base + rope,
//             true only when the sun stands at 45° AND the shadow is square to
//             a face. Choose the day and the hour.
//
//                      D1          D2          D3          D4
//   ship   posts       5           6           7           8
//          ships       1           1           2           3
//          tolerance   best×1.8    best×1.5    best×1.3    best×1.15
//          sightings   ships+2     ships+1     ships+1     ships+1
//   arc    hills       4           5           7           8
//          tolerance   best×1.6    best×1.4    best×1.25   best×1.12
//          plan        2–3 fixes   3–4         3–4         4–5
//          fixes       plan+2      plan+2      plan+1      plan+1
//   noon   window      3 h         4 h         5 h         6 h      (5-min clock)
//          tolerance   5 %         3 %         2 %         1.2 %
//          readings    solver+3    solver+2    solver+1    solver+1
//   ratio  tolerance   4 %         3 %         2 %         1.5 %    (3/3/2/2 tries)
//   moment tolerance   6 %         5 %         4 %         3 %      (3/3/2/2 tries)
//   preview of the error (ship, arc) and of the sun angles (ratio, moment) at D1–D2 only.
//
// Expected play: D1 ≈ 1 min, D2 ≈ 1.5 min, D3 ≈ 2 min, D4 ≈ 2.5–3 min.
// Every board is checked at generation by an exact solver (pair search,
// Dijkstra over fixes, golden-section search, grid search over the sun), and
// the budgets are derived from that solver's answer.

export type Mode = 'ship' | 'arc' | 'noon' | 'ratio' | 'moment'

interface SurveyConfig {
  title: string
  intro: string
  fact: string
  mode: Mode
}

export const CONFIGS: Record<string, SurveyConfig> = {
  'thales-ships': {
    title: 'Ships off Miletus',
    intro: 'Pick two shore posts and sight the ship from both. Wide baselines help, but each post’s instrument has its own precision (◆◆◆ best) and headlands block some views. Fix every ship to the harbour master’s tolerance.',
    fact: 'Eudemus of Rhodes, quoted by Proclus, credits Thales of Miletus with finding the distance of ships at sea — a method that rests on a triangle being fixed by one side and the two angles on it.',
    mode: 'ship',
  },
  'pyramid-shadow': {
    title: 'The Staff and the Pyramid',
    intro: 'Set a staff in the sand and wait for the right hour. When the pyramid’s shadow runs square off a face and clears the base, height = (half base + rope) × staff ÷ staff’s shadow. A slanted shadow gives a short answer.',
    fact: 'Plutarch’s Banquet of the Seven Sages has Thales measure a pyramid by planting a stick at the end of its shadow: the sun’s rays make two similar triangles, so pyramid is to stick as shadow is to shadow.',
    mode: 'ratio',
  },
  'thales-moment': {
    title: 'Thales’ Moment',
    intro: 'No arithmetic this time: at the moment a staff’s shadow equals the staff, the pyramid’s height is half its base plus the rope. Choose the day and the hour when the sun stands at 45° and the shadow runs square off a face.',
    fact: 'Hieronymus, as quoted by Diogenes Laertius, says Thales measured the pyramids by their shadows, watching for the hour when our own shadow is as long as we are tall.',
    mode: 'moment',
  },
  eratosthenes: {
    title: 'Eratosthenes’ Noon',
    intro: 'At Syene the midsummer noon sun shines straight down a well. Measure the gnomon’s shadow angle at Alexandria at true noon — the shortest shadow of the day — and the Earth’s girth follows from the 5,000 stadia between them. Your water clock is not set to the sun, and readings are few.',
    fact: 'Around 240 BC Eratosthenes found the noon sun at Alexandria a fiftieth of a circle (7.2°) from overhead on the day it lit the bottom of a well at Syene; with 5,000 stadia between the cities he put the Earth’s circumference at 250,000 stadia.',
    mode: 'noon',
  },
  'great-arc': {
    title: 'The Great Arc',
    intro: 'From the measured baseline, fix each hill station by sighting it from two stations you already know, and chain the triangles up to the peak. Errors add up along the chain, and thin triangles multiply them.',
    fact: 'The Great Trigonometrical Survey of India, begun by William Lambton in 1802 and carried on by George Everest, chained triangles from a measured baseline across the subcontinent; in 1856 its computations showed Peak XV to be the highest mountain in the world.',
    mode: 'arc',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Geometry ──────────────────────────────────────────────────────────────────

export interface Pt { x: number; y: number }
const DEG = Math.PI / 180
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** Angle at `p` between the rays to `a` and `b`, radians. */
export function angleAt(p: Pt, a: Pt, b: Pt): number {
  const ax = a.x - p.x, ay = a.y - p.y, bx = b.x - p.x, by = b.y - p.y
  const c = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by))
  return Math.acos(Math.max(-1, Math.min(1, c)))
}

/**
 * Position error of a point fixed by sighting it from `a` and `b`
 * (instrument errors `sa`, `sb` in radians, inherited errors `ua`, `ub`).
 */
export function fixError(p: Pt, a: Pt, b: Pt, sa: number, sb: number, ua = 0, ub = 0): number {
  const s = Math.sin(angleAt(p, a, b))
  if (s < 1e-3) return Infinity
  return Math.max(ua, ub) + Math.hypot(sa * dist(p, a), sb * dist(p, b)) / s
}

function orient(a: Pt, b: Pt, c: Pt) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) }
function segCross(p1: Pt, p2: Pt, q1: Pt, q2: Pt): boolean {
  const d1 = orient(q1, q2, p1), d2 = orient(q1, q2, p2), d3 = orient(p1, p2, q1), d4 = orient(p1, p2, q2)
  return d1 * d2 < 0 && d3 * d4 < 0
}

function randIn(rng: Rng, lo: number, hi: number) { return lo + rng() * (hi - lo) }

// ── Ships ─────────────────────────────────────────────────────────────────────

export const SHORE_Y = 236
/** Map units → metres. */
const SHIP_M = 10
const SIGMAS = [0.2, 0.5, 1.0]

export interface Post extends Pt { sigma: number }
export interface Ship extends Pt { tol: number; best: [number, number] }
export interface ShipPuzzle {
  kind: 'ship'
  posts: Post[]
  ships: Ship[]
  headlands: [Pt, Pt][]
  budget: number
  preview: boolean
}

export function shipTier(d: Difficulty) {
  return {
    posts: scale(d, [5, 6, 7, 8]),
    ships: scale(d, [1, 1, 2, 3]),
    factor: scale(d, [1.8, 1.5, 1.3, 1.15]),
    slack: scale(d, [2, 1, 1, 1]),
    headlands: scale(d, [0, 1, 2, 2]),
    preview: d === 1,
  }
}

export function sees(p: Pick<ShipPuzzle, 'headlands'>, post: Pt, ship: Pt): boolean {
  return !p.headlands.some(([a, b]) => segCross(post, ship, a, b))
}

/** Error of fixing ship `s` from posts `a`, `b` (Infinity when not allowed). */
export function shipError(p: Pick<ShipPuzzle, 'posts' | 'ships' | 'headlands'>, a: number, b: number, s: number): number {
  if (a === b || a < 0 || b < 0) return Infinity
  const A = p.posts[a], B = p.posts[b], S = p.ships[s]
  if (!sees(p, A, S) || !sees(p, B, S)) return Infinity
  return fixError(S, A, B, A.sigma * DEG, B.sigma * DEG)
}

function pairs(n: number): [number, number][] {
  const out: [number, number][] = []
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) out.push([a, b])
  return out
}

export function generateShip(d: Difficulty, seed: number): ShipPuzzle {
  const t = shipTier(d)
  const rng = mulberry32(seed ^ 0x5a1f)
  let fallback: ShipPuzzle | null = null
  for (let attempt = 0; attempt < 80; attempt++) {
    const posts: Post[] = Array.from({ length: t.posts }, (_, i) => ({
      x: 22 + i * (316 / (t.posts - 1)) + (rng() - 0.5) * 14,
      y: SHORE_Y,
      sigma: SIGMAS[Math.floor(rng() * 3)],
    }))
    if (!posts.some(q => q.sigma === 1.0)) posts[Math.floor(rng() * posts.length)].sigma = 1.0
    const headlands: [Pt, Pt][] = []
    for (let h = 0; h < t.headlands; h++) {
      let x0 = 0
      for (let g = 0; g < 20; g++) { x0 = randIn(rng, 50, 310); if (posts.every(q => Math.abs(q.x - x0) > 14)) break }
      headlands.push([{ x: x0, y: SHORE_Y }, { x: x0 + (rng() - 0.5) * 50, y: SHORE_Y - randIn(rng, 45, 95) }])
    }
    const spots: Pt[] = []
    for (let g = 0; spots.length < t.ships && g < 200; g++) {
      const s = { x: randIn(rng, 40, 320), y: randIn(rng, 32, 140) }
      if (spots.every(o => dist(o, s) > 70) && headlands.every(([, b]) => dist(b, s) > 30)) spots.push(s)
    }
    if (spots.length < t.ships) continue
    const base = { posts, headlands, ships: spots.map(s => ({ ...s, tol: 0, best: [0, 0] as [number, number] })) }
    let ok = true, picky = true
    const ships: Ship[] = base.ships.map((s, k) => {
      let best = Infinity, bp: [number, number] = [0, 1]
      const errs: number[] = []
      for (const [a, b] of pairs(posts.length)) {
        const u = shipError(base, a, b, k)
        if (!isFinite(u)) continue
        errs.push(u)
        if (u < best) { best = u; bp = [a, b] }
      }
      if (errs.length < 3) ok = false
      const tol = best * t.factor
      const good = errs.filter(u => u <= tol).length
      if (good > Math.max(2, errs.length * 0.35)) picky = false
      return { ...s, tol, best: bp }
    })
    if (!ok) continue
    const puzzle: ShipPuzzle = { kind: 'ship', posts, ships, headlands, budget: t.ships + t.slack, preview: t.preview }
    if (picky || d <= 2) return puzzle
    fallback = fallback ?? puzzle
  }
  if (fallback) return fallback
  // Plain beach, no headlands, one ship straight out: always solvable.
  const posts: Post[] = Array.from({ length: t.posts }, (_, i) => ({ x: 22 + i * (316 / (t.posts - 1)), y: SHORE_Y, sigma: 0.5 }))
  const ships = Array.from({ length: t.ships }, (_, k) => ({ x: 80 + k * 100, y: 100, tol: 0, best: [0, t.posts - 1] as [number, number] }))
  const p: ShipPuzzle = { kind: 'ship', posts, ships, headlands: [], budget: t.ships + t.slack, preview: t.preview }
  p.ships.forEach((s, k) => { s.tol = shipError(p, 0, t.posts - 1, k) * t.factor })
  return p
}

// ── Great Arc ─────────────────────────────────────────────────────────────────

export interface Station extends Pt { base?: boolean; peak?: boolean }
export interface ArcPuzzle {
  kind: 'arc'
  stations: Station[]
  /** adj[i][j]: i and j can see each other. */
  adj: boolean[][]
  sigma: number
  peak: number
  tol: number
  budget: number
  /** Optimal fixes in order: [target, from, from]. */
  plan: [number, number, number][]
  best: number
  preview: boolean
}

/** Map units → feet of uncertainty. */
const ARC_FT = 10

export function arcTier(d: Difficulty) {
  return {
    hills: scale(d, [4, 5, 7, 8]),
    factor: scale(d, [1.6, 1.4, 1.25, 1.12]),
    slack: scale(d, [2, 2, 1, 1]),
    minPlan: scale(d, [2, 3, 3, 4]),
    reach: scale(d, [165, 150, 135, 130]),
    preview: d === 1,
  }
}

/** Error of fixing `target` from known stations `a`, `b` given current errors `u`; null when not allowed. */
export function arcFixError(p: ArcPuzzle, u: number[], target: number, a: number, b: number): number | null {
  if (a === b || target === a || target === b) return null
  if (p.stations[target].base) return null
  if (!isFinite(u[a]) || !isFinite(u[b])) return null
  if (!p.adj[target][a] || !p.adj[target][b]) return null
  const S = p.stations
  const e = fixError(S[target], S[a], S[b], p.sigma, p.sigma, u[a], u[b])
  return isFinite(e) ? e : null
}

/** Apply a fix: the station keeps the better of its old and new error. */
export function arcApply(p: ArcPuzzle, u: number[], target: number, a: number, b: number): number[] | null {
  const e = arcFixError(p, u, target, a, b)
  if (e === null) return null
  const next = [...u]
  next[target] = Math.min(next[target], e)
  return next
}

export function arcStart(p: Pick<ArcPuzzle, 'stations'>): number[] {
  return p.stations.map(s => (s.base ? 0 : Infinity))
}

/** Least achievable error at every station (Dijkstra: errors never shrink along a chain). */
export function arcOptimal(p: Omit<ArcPuzzle, 'plan' | 'best' | 'tol' | 'budget'>): { u: number[]; via: ([number, number] | null)[]; order: number[] } {
  const n = p.stations.length
  const u = arcStart(p)
  const via: ([number, number] | null)[] = Array(n).fill(null)
  const done = p.stations.map(s => !!s.base)
  const order: number[] = []
  const pp = p as ArcPuzzle
  for (;;) {
    let bi = -1, bu = Infinity, bv: [number, number] | null = null
    for (let t = 0; t < n; t++) {
      if (done[t]) continue
      for (let a = 0; a < n; a++) {
        if (!done[a]) continue
        for (let b = a + 1; b < n; b++) {
          if (!done[b]) continue
          const e = arcFixError(pp, u, t, a, b)
          if (e !== null && e < bu) { bu = e; bi = t; bv = [a, b] }
        }
      }
    }
    if (bi < 0) break
    done[bi] = true; u[bi] = bu; via[bi] = bv; order.push(bi)
  }
  return { u, via, order }
}

export function generateArc(d: Difficulty, seed: number): ArcPuzzle {
  const t = arcTier(d)
  const rng = mulberry32(seed ^ 0xa4c)
  let best: ArcPuzzle | null = null
  for (let attempt = 0; attempt < 120; attempt++) {
    const cx = randIn(rng, 130, 230), half = randIn(rng, 28, 42)
    const stations: Station[] = [{ x: cx - half, y: 282, base: true }, { x: cx + half, y: 282, base: true }]
    for (let g = 0; stations.length < 2 + t.hills && g < 400; g++) {
      const s = { x: randIn(rng, 24, 336), y: randIn(rng, 70, 245) }
      if (stations.every(o => dist(o, s) > 46)) stations.push(s)
    }
    if (stations.length < 2 + t.hills) continue
    const peakSpot = { x: randIn(rng, 60, 300), y: randIn(rng, 22, 40), peak: true }
    if (stations.some(o => dist(o, peakSpot) < 46)) continue
    stations.push(peakSpot)
    const n = stations.length
    const adj = stations.map(() => Array(n).fill(false) as boolean[])
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const ok = dist(stations[i], stations[j]) <= t.reach && !(stations[i].base && stations[j].base) && rng() > 0.15
      adj[i][j] = adj[j][i] = ok
    }
    const peak = n - 1
    const pz = { kind: 'arc' as const, stations, adj, sigma: 0.004, peak, preview: t.preview }
    const { u, via, order } = arcOptimal(pz)
    if (!isFinite(u[peak])) continue
    // The plan: only the ancestors of the peak, in Dijkstra order.
    const need = new Set<number>()
    const stack = [peak]
    while (stack.length) {
      const k = stack.pop()!
      if (need.has(k) || stations[k].base) continue
      need.add(k)
      for (const v of via[k]!) stack.push(v)
    }
    const plan = order.filter(k => need.has(k)).map(k => [k, via[k]![0], via[k]![1]] as [number, number, number])
    const puzzle: ArcPuzzle = { ...pz, tol: u[peak] * t.factor, best: u[peak], plan, budget: plan.length + t.slack }
    if (plan.length >= t.minPlan && plan.length <= t.minPlan + 1) return puzzle
    const off = (q: ArcPuzzle) => Math.abs(q.plan.length - t.minPlan - 0.5)
    if (!best || off(puzzle) < off(best)) best = puzzle
  }
  return best!
}

// ── Eratosthenes' noon ────────────────────────────────────────────────────────

/** Alexandria and the sun on the midsummer day: φ − δ = 7.2°. */
const ALEX_LAT = 31.0, SOLSTICE_DEC = 23.8
export const SYENE_STADIA = 5000
export const TRUE_CIRCUMFERENCE = (SYENE_STADIA * 360) / (ALEX_LAT - SOLSTICE_DEC)

export interface NoonPuzzle {
  kind: 'noon'
  slots: number
  /** Clock minutes of slot 0 (5-minute steps). */
  start: number
  /** True local noon, clock minutes. */
  noon: number
  tol: number
  budget: number
}

export function noonTier(d: Difficulty) {
  return {
    slots: scale(d, [37, 49, 61, 73]),
    tol: scale(d, [0.05, 0.03, 0.02, 0.012]),
    slack: scale(d, [3, 2, 1, 1]),
  }
}

export function slotClock(p: Pick<NoonPuzzle, 'start'>, i: number) { return p.start + i * 5 }
export function clockLabel(min: number) {
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

/** Sun's zenith angle (the gnomon's shadow angle) at Alexandria, degrees to 0.01. */
export function noonReading(p: Pick<NoonPuzzle, 'start' | 'noon'>, i: number): number {
  const H = (slotClock(p, i) - p.noon) * 0.25 * DEG
  const f = ALEX_LAT * DEG, dl = SOLSTICE_DEC * DEG
  const c = Math.sin(f) * Math.sin(dl) + Math.cos(f) * Math.cos(dl) * Math.cos(H)
  return Math.round(Math.acos(c) / DEG * 100) / 100
}

export function noonEstimate(angle: number) { return (SYENE_STADIA * 360) / angle }
export function noonError(angle: number) { return Math.abs(noonEstimate(angle) - TRUE_CIRCUMFERENCE) / TRUE_CIRCUMFERENCE }

/** Golden-section search on the clock grid; returns the slots read in order. */
export function noonSolve(p: Pick<NoonPuzzle, 'start' | 'noon' | 'slots'>): number[] {
  const order: number[] = []
  const cache = new Map<number, number>()
  const f = (i: number) => {
    if (!cache.has(i)) { cache.set(i, noonReading(p, i)); order.push(i) }
    return cache.get(i)!
  }
  let lo = 0, hi = p.slots - 1
  while (hi - lo > 2) {
    const m1 = lo + Math.round((hi - lo) * 0.382)
    const m2 = Math.max(m1 + 1, lo + Math.round((hi - lo) * 0.618))
    if (f(m1) <= f(m2)) hi = m2
    else lo = m1
  }
  for (let i = lo; i <= hi; i++) f(i)
  return order
}

export function generateNoon(d: Difficulty, seed: number): NoonPuzzle {
  const t = noonTier(d)
  const rng = mulberry32(seed ^ 0x7e1)
  const span = (t.slots - 1) * 5
  const start = 720 - span / 2
  const noon = 720 + (rng() - 0.5) * 2 * (span / 2 - 45)
  const base = { kind: 'noon' as const, slots: t.slots, start, noon, tol: t.tol }
  return { ...base, budget: noonSolve(base).length + t.slack }
}

// ── Pyramid shadows ───────────────────────────────────────────────────────────

const GIZA_LAT = 30
const PYRAMIDS = [
  { name: 'Great Pyramid of Khufu', base: 440, height: 280 },
  { name: 'Pyramid of Khafre', base: 411, height: 274 },
  { name: 'Pyramid of Menkaure', base: 200, height: 125 },
]
const FACES = ['east', 'north', 'west', 'south'] as const
const NORMALS: Pt[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
export function dayLabel(day: number) {
  let m = 11
  while (MONTH_START[m] > day) m--
  return `${day - MONTH_START[m] + 1} ${MONTHS[m]}`
}

export interface ShadowPuzzle {
  kind: 'ratio' | 'moment'
  name: string
  base: number
  height: number
  stick: number
  /** Days of the year the player may choose from. */
  days: number[]
  /** Clock minutes the player may choose from. */
  times: number[]
  /** True noon minus clock noon, minutes. */
  noonOffset: number
  tol: number
  attempts: number
  showAngles: boolean
  solution: [number, number]
}

export function shadowTier(kind: 'ratio' | 'moment', d: Difficulty) {
  return kind === 'ratio'
    ? { tol: scale(d, [0.04, 0.03, 0.02, 0.015]), attempts: scale(d, [3, 3, 2, 2]), showAngles: d <= 2 }
    : { tol: scale(d, [0.06, 0.05, 0.04, 0.03]), attempts: scale(d, [3, 3, 2, 2]), showAngles: d <= 2 }
}

export interface ShadowReading {
  elev: number
  /** Unit vector toward the sun (east, north). */
  sun: Pt
  /** Apex shadow tip relative to the centre (east, north), cubits. */
  tip: Pt
  face: number
  slant: number
  /** Rope from face to tip, whole cubits (≤ 0 when the tip is hidden). */
  rope: number
  /** Staff shadow, to 0.05 cubit. */
  staffShadow: number
  measurable: boolean
  estimate: number | null
}

export function declination(day: number) { return -23.44 * Math.cos((2 * Math.PI * (day + 10)) / 365) }

export function shadowAt(p: Omit<ShadowPuzzle, 'solution' | 'tol' | 'attempts' | 'showAngles'>, dayIdx: number, timeIdx: number): ShadowReading {
  const f = GIZA_LAT * DEG, dl = declination(p.days[dayIdx]) * DEG
  const H = (p.times[timeIdx] - 720 - p.noonOffset) * 0.25 * DEG
  const east = -Math.cos(dl) * Math.sin(H)
  const north = Math.cos(f) * Math.sin(dl) - Math.sin(f) * Math.cos(dl) * Math.cos(H)
  const up = Math.sin(f) * Math.sin(dl) + Math.cos(f) * Math.cos(dl) * Math.cos(H)
  const horiz = Math.hypot(east, north)
  const elev = Math.atan2(up, horiz) / DEG
  const sun = { x: east / horiz, y: north / horiz }
  const dir = { x: -sun.x, y: -sun.y }
  const L = up > 0 ? (p.height * horiz) / up : Infinity
  let face = 0, cos = -2
  NORMALS.forEach((nv, k) => { const c = dir.x * nv.x + dir.y * nv.y; if (c > cos) { cos = c; face = k } })
  const slant = Math.acos(Math.min(1, cos)) / DEG
  const rope = up > 0 ? Math.round(L * cos - p.base / 2) : 0
  const staffShadow = up > 0 ? Math.round(((p.stick * horiz) / up) * 20) / 20 : Infinity
  const measurable = elev >= 8 && rope >= 1
  let estimate: number | null = null
  if (measurable) estimate = p.kind === 'ratio' ? ((p.base / 2 + rope) * p.stick) / staffShadow : p.base / 2 + rope
  return { elev, sun, tip: { x: dir.x * L, y: dir.y * L }, face, slant, rope, staffShadow, measurable, estimate }
}

export function shadowError(p: Pick<ShadowPuzzle, 'height'>, r: ShadowReading) {
  return r.estimate === null ? Infinity : Math.abs(r.estimate - p.height) / p.height
}

/** Best (day, time) by exhaustive search. */
export function shadowSolve(p: Omit<ShadowPuzzle, 'solution' | 'tol' | 'attempts' | 'showAngles'>): { at: [number, number]; err: number } {
  let at: [number, number] = [0, 0], err = Infinity
  for (let di = 0; di < p.days.length; di++) for (let ti = 0; ti < p.times.length; ti++) {
    const e = shadowError(p, shadowAt(p, di, ti))
    if (e < err) { err = e; at = [di, ti] }
  }
  return { at, err }
}

export function generateShadow(kind: 'ratio' | 'moment', d: Difficulty, seed: number): ShadowPuzzle {
  const t = shadowTier(kind, d)
  const rng = mulberry32(seed ^ (kind === 'ratio' ? 0x3b9 : 0x4c2))
  const step = kind === 'ratio' ? 10 : 5
  const times = Array.from({ length: 720 / step + 1 }, (_, i) => 360 + i * step)
  let fallback: ShadowPuzzle | null = null
  for (let attempt = 0; attempt < 60; attempt++) {
    const pyr = PYRAMIDS[Math.floor(rng() * PYRAMIDS.length)]
    const stick = 3 + Math.floor(rng() * 3)
    const noonOffset = Math.round((rng() - 0.5) * 50 * 10) / 10
    const start = Math.floor(rng() * 365)
    const days = kind === 'ratio' ? [start] : Array.from({ length: 24 }, (_, k) => (start + k * 5) % 365)
    const base = { kind, name: pyr.name, base: pyr.base, height: pyr.height, stick, days, times, noonOffset }
    const { at, err } = shadowSolve(base)
    const puzzle: ShadowPuzzle = { ...base, ...t, solution: at }
    let good = 0
    for (let di = 0; di < days.length; di++) for (let ti = 0; ti < times.length; ti++) if (shadowError(base, shadowAt(base, di, ti)) <= t.tol) good++
    if (err <= t.tol * 0.6 && good <= days.length * times.length * 0.15) {
      // The sliders open at dawn on the first day, which must not already work.
      if (shadowError(base, shadowAt(base, 0, 0)) > t.tol) return puzzle
    }
    if (err <= t.tol && !fallback) fallback = puzzle
  }
  if (fallback) return fallback
  // Midwinter noon over the Great Pyramid's north face always works.
  const base = { kind, name: PYRAMIDS[0].name, base: 440, height: 280, stick: 4, days: kind === 'ratio' ? [355] : Array.from({ length: 24 }, (_, k) => (300 + k * 5) % 365), times, noonOffset: 7 }
  return { ...base, ...t, solution: shadowSolve(base).at }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export type Puzzle = ShipPuzzle | ArcPuzzle | NoonPuzzle | ShadowPuzzle

export function generate(mode: Mode, d: Difficulty, seed: number): Puzzle {
  const s = (seed ^ hashString(`surveyor:${mode}`)) >>> 0
  switch (mode) {
    case 'ship': return generateShip(d, s)
    case 'arc': return generateArc(d, s)
    case 'noon': return generateNoon(d, s)
    case 'ratio': return generateShadow('ratio', d, s)
    case 'moment': return generateShadow('moment', d, s)
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface BoardProps<P> { p: P; settled: boolean; win: () => void; lose: (why: string) => void }

const btn = 'h-10 rounded-lg text-xs font-bold border transition-colors disabled:opacity-40'
const primary = `${btn} bg-accent text-accent-fg border-transparent`

function Counter({ label, value, low }: { label: string; value: string | number; low?: boolean }) {
  return <span data-testid="sv-left" className={`font-bold tabular-nums ${low ? 'text-red-600' : 'text-accent'}`}>{label}: {value}</span>
}

function ShipBoard({ p, settled, win, lose }: BoardProps<ShipPuzzle>) {
  const [sel, setSel] = useState<number[]>([])
  const [ship, setShip] = useState(0)
  const [fixed, setFixed] = useState<boolean[]>(() => p.ships.map(() => false))
  const [used, setUsed] = useState(0)
  const [log, setLog] = useState<string | null>(null)
  const S = p.ships[ship]
  const err = sel.length === 2 ? shipError(p, sel[0], sel[1], ship) : Infinity
  const left = p.budget - used

  const tapPost = (i: number) => {
    if (settled) return
    setSel(s => (s.includes(i) ? s.filter(x => x !== i) : s.length >= 2 ? [s[1], i] : [...s, i]))
  }
  const sight = () => {
    if (settled || !isFinite(err) || fixed[ship]) return
    const n = used + 1
    const ok = err <= S.tol
    const nf = fixed.map((f, k) => f || (k === ship && ok))
    setUsed(n); setFixed(nf); setSel([])
    setLog(ok ? `Ship fixed to ±${Math.round(err * SHIP_M)} m.` : `Only good to ±${Math.round(err * SHIP_M)} m — the harbour master needs ±${Math.round(S.tol * SHIP_M)} m.`)
    if (nf.every(Boolean)) { win(); return }
    const open = nf.filter(f => !f).length
    if (open > p.budget - n) { lose(p.budget - n === 0 ? 'Out of sightings' : 'Not enough sightings left for every ship'); return }
    if (ok) setShip(nf.findIndex(f => !f))
  }

  return (
    <>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-2 font-bold">Ship {ship + 1}: need ±{Math.round(S.tol * SHIP_M)} m</span>
        <Counter label="Sightings left" value={left} low={left <= 1} />
      </div>
      <svg viewBox="0 0 360 260" className="w-full max-w-[420px] mx-auto rounded-xl border border-line touch-manipulation">
        <rect x={0} y={0} width={360} height={SHORE_Y} fill="#8ec5dd" />
        <rect x={0} y={SHORE_Y} width={360} height={260 - SHORE_Y} fill="#e6d3a3" />
        {p.headlands.map(([a, b], k) => <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#7a5b33" strokeWidth={9} strokeLinecap="round" />)}
        {sel.map(i => {
          const ok = sees(p, p.posts[i], S)
          return <line key={i} x1={p.posts[i].x} y1={SHORE_Y} x2={S.x} y2={S.y} stroke={ok ? '#1e3a5f' : '#dc2626'} strokeWidth={1.5} strokeDasharray={ok ? undefined : '5 4'} />
        })}
        {p.ships.map((s, k) => (
          <g key={k} data-ship={k} onClick={() => !settled && !fixed[k] && setShip(k)} style={{ cursor: 'pointer' }}>
            <circle cx={s.x} cy={s.y} r={16} fill={k === ship ? 'rgba(255,255,255,.45)' : 'transparent'} />
            <path d={`M${s.x - 11} ${s.y + 3} L${s.x + 11} ${s.y + 3} L${s.x + 7} ${s.y + 9} L${s.x - 7} ${s.y + 9} Z`} fill={fixed[k] ? '#15803d' : '#5b3a1a'} />
            <path d={`M${s.x} ${s.y - 12} L${s.x} ${s.y + 2} L${s.x + 9} ${s.y + 1} Z`} fill="#fdf6e3" stroke="#5b3a1a" strokeWidth={0.8} />
            {fixed[k] && <text x={s.x} y={s.y - 15} textAnchor="middle" fontSize={11} fill="#15803d" fontWeight="bold">✓</text>}
          </g>
        ))}
        {p.posts.map((q, i) => (
          <g key={i} data-post={i} onClick={() => tapPost(i)} style={{ cursor: 'pointer' }}>
            <circle cx={q.x} cy={SHORE_Y + 2} r={11} fill={sel.includes(i) ? '#1e3a5f' : '#fdf6e3'} stroke="#1e3a5f" strokeWidth={1.5} />
            <text x={q.x} y={SHORE_Y + 6} textAnchor="middle" fontSize={9} fill={sel.includes(i) ? '#fff' : '#1e3a5f'} fontWeight="bold">{String.fromCharCode(65 + i)}</text>
            <text x={q.x} y={SHORE_Y + 22} textAnchor="middle" fontSize={7} fill="#7a5b33">{'◆'.repeat(q.sigma === 0.2 ? 3 : q.sigma === 0.5 ? 2 : 1)}</text>
          </g>
        ))}
      </svg>
      <p className="text-muted text-[11px] min-h-[1rem]">
        {sel.length < 2 ? 'Tap two shore posts, then sight.' :
          !isFinite(err) ? 'A headland blocks one of those views.' :
          p.preview ? `This pair would fix the ship to ±${Math.round(err * SHIP_M)} m.` : `Posts ${sel.map(i => String.fromCharCode(65 + i)).join(' & ')} ready.`}
      </p>
      <button type="button" data-testid="sv-sight" className={primary} disabled={settled || !isFinite(err)} onClick={sight}>Sight the ship</button>
      {log && <p className="text-ink-2 text-xs">{log}</p>}
    </>
  )
}

function ArcBoard({ p, settled, win, lose }: BoardProps<ArcPuzzle>) {
  const [u, setU] = useState<number[]>(() => arcStart(p))
  const [sel, setSel] = useState<number[]>([])
  const [used, setUsed] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const left = p.budget - used
  const S = p.stations

  const tap = (i: number) => {
    if (settled) return
    if (sel.includes(i)) { setSel(sel.filter(x => x !== i)); return }
    if (sel.length < 2) {
      if (!isFinite(u[i])) { setMsg('First pick two stations you already know.'); return }
      setSel([...sel, i]); setMsg(null); return
    }
    const next = arcApply(p, u, i, sel[0], sel[1])
    if (!next) { setMsg(S[i].base ? 'The baseline ends are already measured.' : 'That station cannot be seen from both of your chosen stations.'); return }
    const n = used + 1
    setU(next); setUsed(n); setSel([])
    setMsg(`${S[i].peak ? 'Peak' : 'Station'} fixed to ±${Math.round(next[i] * ARC_FT)} ft.`)
    if (next[p.peak] <= p.tol) { win(); return }
    if (n >= p.budget) lose('Out of fixes before the peak was known well enough')
  }
  const previewFor = (i: number) => (p.preview && sel.length === 2 ? arcFixError(p, u, i, sel[0], sel[1]) : null)

  return (
    <>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-2 font-bold">Peak needed to ±{Math.round(p.tol * ARC_FT)} ft</span>
        <Counter label="Fixes left" value={left} low={left <= 1} />
      </div>
      <svg viewBox="0 0 360 300" className="w-full max-w-[420px] mx-auto rounded-xl border border-line touch-manipulation" style={{ background: 'linear-gradient(#e9e4d0, #cfd9b0)' }}>
        {S.map((a, i) => S.map((b, j) => (j > i && p.adj[i][j]
          ? <line key={`${i}-${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={sel.includes(i) || sel.includes(j) ? '#1e3a5f' : '#8a8466'} strokeOpacity={sel.includes(i) || sel.includes(j) ? 0.8 : 0.35} strokeWidth={1} strokeDasharray="3 3" />
          : null)))}
        <line x1={S[0].x} y1={S[0].y} x2={S[1].x} y2={S[1].y} stroke="#b45309" strokeWidth={3} />
        {S.map((s, i) => {
          const known = isFinite(u[i])
          const pv = previewFor(i)
          const target = sel.length === 2 && !sel.includes(i) && !s.base && p.adj[i][sel[0]] && p.adj[i][sel[1]]
          return (
            <g key={i} data-station={i} onClick={() => tap(i)} style={{ cursor: 'pointer' }}>
              {known && !s.base && <circle cx={s.x} cy={s.y} r={Math.min(28, 10 + u[i] * 3)} fill="#b45309" fillOpacity={0.15} />}
              {target && <circle cx={s.x} cy={s.y} r={14} fill="none" stroke="#2563eb" strokeWidth={2} />}
              {s.peak
                ? <path d={`M${s.x - 12} ${s.y + 9} L${s.x} ${s.y - 11} L${s.x + 12} ${s.y + 9} Z`} fill={known ? '#b45309' : '#f8fafc'} stroke="#334155" strokeWidth={1.5} />
                : <circle cx={s.x} cy={s.y} r={9} fill={sel.includes(i) ? '#1e3a5f' : known ? '#b45309' : '#f8fafc'} stroke="#334155" strokeWidth={1.5} />}
              {known && !s.base && <text x={s.x} y={s.y + 22} textAnchor="middle" fontSize={8} fill="#334155">±{Math.round(u[i] * ARC_FT)}</text>}
              {pv !== null && <text x={s.x} y={s.y - 15} textAnchor="middle" fontSize={8} fill="#2563eb" fontWeight="bold">→±{Math.round(pv * ARC_FT)}</text>}
            </g>
          )
        })}
      </svg>
      <p className="text-muted text-[11px] min-h-[1rem]">{msg ?? (sel.length < 2 ? 'Tap two known stations (orange) to sight from.' : 'Now tap the station to fix (ringed in blue).')}</p>
    </>
  )
}

function NoonBoard({ p, settled, win, lose }: BoardProps<NoonPuzzle>) {
  const [slot, setSlot] = useState(Math.floor(p.slots / 2))
  const [reads, setReads] = useState<Map<number, number>>(() => new Map())
  const left = p.budget - reads.size
  const minAngle = reads.size ? Math.min(...reads.values()) : null

  const settle = (m: Map<number, number>) => {
    const best = Math.min(...m.values())
    if (noonError(best) <= p.tol) win()
    else lose(`Your estimate of ${Math.round(noonEstimate(best)).toLocaleString('en-US')} stadia is too far off — that was not noon`)
  }
  const read = () => {
    if (settled || reads.has(slot) || left <= 0) return
    const m = new Map(reads); m.set(slot, noonReading(p, slot))
    setReads(m)
    if (m.size >= p.budget) settle(m)
  }
  const submit = () => { if (!settled && reads.size) settle(reads) }

  const vals = [...reads.values()]
  const top = Math.max(noonReading(p, 0), noonReading(p, p.slots - 1)) + 0.3
  const lo = 7.0
  const X = (i: number) => 20 + (i / (p.slots - 1)) * 325
  const Y = (a: number) => 15 + (1 - (a - lo) / (top - lo)) * 140
  const ticks = []
  for (let i = 0; i < p.slots; i++) if ((slotClock(p, i) % 60) === 0) ticks.push(i)

  return (
    <>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-2 font-bold">Need the girth within {Math.round(p.tol * 1000) / 10}%</span>
        <Counter label="Readings left" value={left} low={left <= 1} />
      </div>
      <svg viewBox="0 0 360 185" className="w-full max-w-[420px] mx-auto rounded-xl border border-line bg-paper">
        <line x1={20} y1={155} x2={345} y2={155} stroke="#8a8466" />
        {ticks.map(i => <g key={i}><line x1={X(i)} y1={155} x2={X(i)} y2={160} stroke="#8a8466" /><text x={X(i)} y={172} fontSize={9} textAnchor="middle" fill="#6b6650">{clockLabel(slotClock(p, i))}</text></g>)}
        <line x1={X(slot)} y1={12} x2={X(slot)} y2={155} stroke="#2563eb" strokeOpacity={0.5} strokeDasharray="3 3" />
        {[...reads.entries()].map(([i, a]) => (
          <g key={i}>
            <circle cx={X(i)} cy={Y(a)} r={4} fill={a === minAngle ? '#b45309' : '#334155'} />
            <text x={X(i)} y={Y(a) - 7} fontSize={8} textAnchor="middle" fill="#334155">{a.toFixed(2)}°</text>
          </g>
        ))}
        {vals.length === 0 && <text x={180} y={85} textAnchor="middle" fontSize={11} fill="#8a8466">Shadow angle at each reading appears here</text>}
      </svg>
      <label className="flex flex-col gap-1 text-xs text-ink-2">
        <span>Water clock: <b className="tabular-nums">{clockLabel(slotClock(p, slot))}</b>{reads.has(slot) && <span className="text-muted"> (read: {reads.get(slot)!.toFixed(2)}°)</span>}</span>
        <input type="range" data-testid="sv-time" min={0} max={p.slots - 1} value={slot} disabled={settled} onChange={e => setSlot(Number(e.target.value))} className="w-full accent-current" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" data-testid="sv-read" className={primary} disabled={settled || reads.has(slot) || left <= 0} onClick={read}>Read the gnomon</button>
        <button type="button" data-testid="sv-submit" className={`${btn} bg-panel border-line text-ink-2`} disabled={settled || !reads.size} onClick={submit}>Send to the Library</button>
      </div>
      <p className="text-muted text-[11px]">
        {minAngle === null ? 'The shortest shadow of the day is true noon.' : `Shortest so far ${minAngle.toFixed(2)}° → Earth ≈ ${Math.round(noonEstimate(minAngle)).toLocaleString('en-US')} stadia.`}
      </p>
    </>
  )
}

function hull(pts: Pt[]): Pt[] {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Pt[] = [], upper: Pt[] = []
  for (const p of s) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p) }
  for (const p of [...s].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p) }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function ShadowBoard({ p, settled, win, lose }: BoardProps<ShadowPuzzle>) {
  const [di, setDi] = useState(0)
  const [ti, setTi] = useState(0)
  const [tries, setTries] = useState<string[]>([])
  const r = shadowAt(p, di, ti)
  const left = p.attempts - tries.length

  const measure = () => {
    if (settled || !r.measurable || left <= 0) return
    const e = shadowError(p, r)
    const est = Math.round(r.estimate!)
    const line = `${dayLabel(p.days[di])} ${clockLabel(p.times[ti])}: rope ${r.rope}, staff shadow ${r.staffShadow.toFixed(2)} → ${est} cubits`
    const next = [...tries, `${line}${e <= p.tol ? ' ✓' : r.estimate! < p.height ? ' (too low)' : ' (too high)'}`]
    setTries(next)
    if (e <= p.tol) { win(); return }
    if (next.length >= p.attempts) lose(`The temple records give ${p.height} cubits`)
  }

  // Top view: base square of 110 px centred at (180, 150); north is up.
  const k = 110 / p.base
  const cx = 180, cy = 150
  const scr = (q: Pt) => ({ x: cx + q.x * k, y: cy - q.y * k })
  const hb = p.base / 2
  const corners = [{ x: hb, y: hb }, { x: -hb, y: hb }, { x: -hb, y: -hb }, { x: hb, y: -hb }]
  const L = Math.hypot(r.tip.x, r.tip.y)
  const lim = p.base * 1.6
  const tip = L > lim ? { x: (r.tip.x / L) * lim, y: (r.tip.y / L) * lim } : r.tip
  const hidden = r.elev <= 0 || (Math.abs(tip.x) <= hb && Math.abs(tip.y) <= hb)
  const shadow = hidden ? [] : hull([...corners, tip]).map(scr)
  const nv = NORMALS[r.face]
  const foot = { x: nv.x !== 0 ? nv.x * hb : tip.x, y: nv.y !== 0 ? nv.y * hb : tip.y }
  const sunPos = { x: cx + r.sun.x * 135, y: cy - r.sun.y * 135 }
  const staffPx = 26, shPx = Math.min(130, (r.staffShadow / p.stick) * staffPx)

  return (
    <>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-2 font-bold">{p.name} · staff {p.stick} cubits</span>
        <Counter label="Tries left" value={left} low={left <= 1} />
      </div>
      <svg viewBox="0 0 360 300" className="w-full max-w-[420px] mx-auto rounded-xl border border-line" style={{ background: '#efe0b8' }}>
        <text x={180} y={12} textAnchor="middle" fontSize={9} fill="#7a5b33">N</text>
        {r.elev > 0 && <circle cx={sunPos.x} cy={sunPos.y} r={9} fill="#fbbf24" stroke="#d97706" />}
        {shadow.length > 0 && <polygon points={shadow.map(q => `${q.x},${q.y}`).join(' ')} fill="#5b4a2e" fillOpacity={0.55} />}
        <polygon points={corners.map(scr).map(q => `${q.x},${q.y}`).join(' ')} fill="#e3c27a" stroke="#a07b35" />
        <line x1={scr(corners[0]).x} y1={scr(corners[0]).y} x2={scr(corners[2]).x} y2={scr(corners[2]).y} stroke="#a07b35" strokeWidth={0.6} />
        <line x1={scr(corners[1]).x} y1={scr(corners[1]).y} x2={scr(corners[3]).x} y2={scr(corners[3]).y} stroke="#a07b35" strokeWidth={0.6} />
        {r.measurable && L <= lim && <line x1={scr(foot).x} y1={scr(foot).y} x2={scr(tip).x} y2={scr(tip).y} stroke="#b91c1c" strokeWidth={1.5} strokeDasharray="4 2" />}
        {p.showAngles && r.elev > 0 && (
          <line x1={cx} y1={cy} x2={cx + nv.x * 160} y2={cy - nv.y * 160} stroke="#2563eb" strokeOpacity={0.4} strokeDasharray="2 3" />
        )}
        {/* Staff, side view */}
        <g transform="translate(14,250)">
          <line x1={0} y1={36} x2={150} y2={36} stroke="#a07b35" />
          <line x1={8} y1={36} x2={8} y2={36 - staffPx} stroke="#334155" strokeWidth={2.5} />
          {r.elev > 0 && <line x1={8} y1={36} x2={8 + shPx} y2={36} stroke="#5b4a2e" strokeWidth={4} strokeOpacity={0.6} />}
          {p.kind === 'moment' && <line x1={8 + staffPx} y1={30} x2={8 + staffPx} y2={40} stroke="#2563eb" />}
        </g>
      </svg>
      <div className="text-[11px] text-ink-2 grid grid-cols-2 gap-x-3">
        <span>Rope: {r.measurable ? `${r.rope} cubits` : r.elev < 8 ? 'sun too low' : 'shadow hidden on the face'}</span>
        <span>Staff shadow: {isFinite(r.staffShadow) && r.elev > 0 ? `${r.staffShadow.toFixed(2)} cubits` : '—'}</span>
        {p.showAngles && <span>Sun height {r.elev.toFixed(1)}°</span>}
        {p.showAngles && <span>Shadow {r.slant.toFixed(0)}° off the {FACES[r.face]} face</span>}
      </div>
      {p.days.length > 1 && (
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          <span>Day: <b>{dayLabel(p.days[di])}</b></span>
          <input type="range" data-testid="sv-date" min={0} max={p.days.length - 1} value={di} disabled={settled} onChange={e => setDi(Number(e.target.value))} className="w-full" />
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs text-ink-2">
        <span>Hour: <b className="tabular-nums">{clockLabel(p.times[ti])}</b>{p.days.length === 1 && <span className="text-muted"> · {dayLabel(p.days[0])}</span>}</span>
        <input type="range" data-testid="sv-time" min={0} max={p.times.length - 1} value={ti} disabled={settled} onChange={e => setTi(Number(e.target.value))} className="w-full" />
      </label>
      <button type="button" data-testid="sv-measure" className={primary} disabled={settled || !r.measurable || left <= 0} onClick={measure}>Stretch the rope and measure</button>
      {tries.map((t, i) => <p key={i} className="text-[11px] text-muted">{t}</p>)}
    </>
  )
}

export default function SurveyorGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'thales-ships')
  const puzzle = useMemo(() => generate(config.mode, difficulty, seed), [config.mode, difficulty, seed])
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const board = { settled, win, lose }
  const key = `${config.mode}:${difficulty}:${seed}`

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div>
        <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
        <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
      </div>
      {puzzle.kind === 'ship' && <ShipBoard key={key} p={puzzle} {...board} />}
      {puzzle.kind === 'arc' && <ArcBoard key={key} p={puzzle} {...board} />}
      {puzzle.kind === 'noon' && <NoonBoard key={key} p={puzzle} {...board} />}
      {(puzzle.kind === 'ratio' || puzzle.kind === 'moment') && <ShadowBoard key={key} p={puzzle} {...board} />}
      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="Measured true!" loseTitle={reason ?? 'The survey does not close'} />
    </div>
  )
}
