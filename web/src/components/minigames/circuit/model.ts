// Circuit puzzles: a battery drives a series–parallel network of switch
// contacts and lamps.  The physics is the textbook ideal:
//   · a closed contact is a bare wire, a lamp is a load;
//   · current takes the bare wire whenever it can, so a closed path with no
//     lamp in parallel with a lamp leaves that lamp dark;
//   · a bare path straight across the battery is a short and blows the fuse.
// One switch can drive several contacts (ganged), and a barred contact is
// normally closed: it conducts while its switch is OFF.  Each puzzle asks for
// an exact lamp pattern (some glow, some stay dark) with no short.
//
// Puzzles are generated from a seed and checked by brute force over every
// switch setting, so each one is solvable, not pre-solved, and tight.

import type { Difficulty } from '@/games/types'
import { mulberry32, randInt, shuffle, type Rng } from '../_shared/rng'

export type Node =
  | { k: 'contact'; id: number; sw: number; nc: boolean }
  | { k: 'lamp'; id: number; lamp: number }
  | { k: 'series'; id: number; ch: Node[] }
  | { k: 'par'; id: number; ch: Node[] }

export type Cond = 'open' | 'load' | 'short'

/** Switch states as a bit mask: bit i set means switch i is ON. */
export type Mask = number

export const isOn = (m: Mask, sw: number) => ((m >> sw) & 1) === 1

export function cond(n: Node, m: Mask): Cond {
  switch (n.k) {
    case 'contact': return isOn(m, n.sw) !== n.nc ? 'short' : 'open'
    case 'lamp': return 'load'
    case 'series': {
      let all = true
      for (const c of n.ch) { const s = cond(c, m); if (s === 'open') return 'open'; if (s !== 'short') all = false }
      return all ? 'short' : 'load'
    }
    case 'par': {
      let any = false
      for (const c of n.ch) { const s = cond(c, m); if (s === 'short') return 'short'; if (s === 'load') any = true }
      return any ? 'load' : 'open'
    }
  }
}

export interface Evaluation {
  short: boolean
  /** Lamps carrying current. */
  lit: boolean[]
  /** Node ids carrying current (for drawing live wires; red when short). */
  flowing: Set<number>
}

export function evaluate(root: Node, m: Mask, lamps: number): Evaluation {
  const lit = Array<boolean>(lamps).fill(false)
  const flowing = new Set<number>()
  const top = cond(root, m)
  const walk = (n: Node, on: boolean) => {
    if (!on) return
    flowing.add(n.id)
    if (n.k === 'lamp') { lit[n.lamp] = true; return }
    if (n.k === 'series') { for (const c of n.ch) walk(c, true); return }
    if (n.k === 'par') {
      const st = cond(n, m)
      // Current divides among the branches of least resistance.
      for (const c of n.ch) walk(c, cond(c, m) === st)
    }
  }
  if (top !== 'open') walk(root, true)
  if (top === 'short') lit.fill(false)
  return { short: top === 'short', lit, flowing }
}

// ── Themes (config ids) ─────────────────────────────────────────────────────

export interface Theme {
  title: string
  blurb: string
  /** Contacts per switch. */
  gang: [number, number]
  /** Chance a contact is normally closed. */
  nc: number
  /** Bare contact branches per lamp (each one a possible bypass or short). */
  bare: number
  /** Chance two pieces join in series rather than in parallel. */
  series: number
  /** Extra lamps over the difficulty's count. */
  extraLamps: number
  /** Every switch drives one NO and one NC contact, like a two-way switch. */
  twoWay?: boolean
}

export const THEMES = {
  enigma: {
    title: 'Bombe drum contacts',
    blurb: 'Each drum setting closes several contacts at once. Find the one setting that lights the test lamps.',
    gang: [1, 3], nc: 0.35, bare: 0.35, series: 0.5, extraLamps: 0,
  },
  'digital-logic': {
    title: 'Relay logic',
    blurb: 'Relays wired in series act as AND, in parallel as OR. Barred contacts invert.',
    gang: [1, 2], nc: 0.5, bare: 0.3, series: 0.55, extraLamps: 0,
  },
  'edison-lamps': {
    title: "Edison's lamp bank",
    blurb: 'Lamps in parallel share the supply, but a closed bare branch beside a lamp steals all its current.',
    gang: [1, 2], nc: 0.2, bare: 0.6, series: 0.35, extraLamps: 1,
  },
  staircase: {
    title: 'Two-way staircase',
    blurb: 'Every lever is a two-way switch: throwing it opens one contact and closes its barred twin.',
    gang: [2, 2], nc: 0.5, bare: 0.3, series: 0.5, extraLamps: 0, twoWay: true,
  },
  telegraph: {
    title: 'Telegraph line',
    blurb: 'Long series lines: every key on the way must close, and a single open one silences the whole line.',
    gang: [1, 2], nc: 0.3, bare: 0.25, series: 0.72, extraLamps: 0,
  },
} satisfies Record<string, Theme>

export type ThemeKey = keyof typeof THEMES

// ── Difficulty ──────────────────────────────────────────────────────────────

export interface Tier {
  switches: [number, number]
  lamps: [number, number]
  /** At most this many switch settings may solve the puzzle. */
  maxSolutions: number
  /** Fewest throws from the starting position to a solution. */
  minPar: number
  /** Shorts survived before the run ends (Infinity: fuses are free). */
  fuses: number
  /** Throws allowed beyond par (null: unlimited). */
  slack: number | null
  /** Share of settings that short the battery, at least. */
  minShorts: number
  seconds: number
}

export const TIERS: Record<Difficulty, Tier> = {
  1: { switches: [3, 4], lamps: [1, 2], maxSolutions: 2, minPar: 2, fuses: Infinity, slack: null, minShorts: 0, seconds: 0 },
  2: { switches: [4, 5], lamps: [2, 3], maxSolutions: 2, minPar: 2, fuses: 3, slack: null, minShorts: 0.1, seconds: 0 },
  3: { switches: [5, 6], lamps: [2, 3], maxSolutions: 1, minPar: 3, fuses: 2, slack: 3, minShorts: 0.15, seconds: 0 },
  4: { switches: [6, 7], lamps: [3, 4], maxSolutions: 1, minPar: 3, fuses: 1, slack: 2, minShorts: 0.2, seconds: 240 },
}

export const MAX_COLS = 14
export const MAX_ROWS = 6

// ── Layout (in grid units; terminals sit on each block's top row) ───────────

export function size(n: Node): { w: number; h: number } {
  switch (n.k) {
    case 'contact': case 'lamp': return { w: 2, h: 1 }
    case 'series': {
      const s = n.ch.map(size)
      return { w: s.reduce((a, b) => a + b.w, 0), h: Math.max(...s.map(b => b.h)) }
    }
    case 'par': {
      const s = n.ch.map(size)
      return { w: Math.max(...s.map(b => b.w)) + 2, h: s.reduce((a, b) => a + b.h, 0) }
    }
  }
}

// ── Puzzle ──────────────────────────────────────────────────────────────────

export interface Puzzle {
  theme: ThemeKey
  /** The tier actually generated (a fallback would be lower than asked). */
  difficulty: Difficulty
  root: Node
  switches: number
  lamps: number
  /** Required state of each lamp. */
  target: boolean[]
  start: Mask
  solutions: Mask[]
  /** Fewest throws from start to a solution. */
  par: number
  /** Throws allowed, or null for unlimited. */
  budget: number | null
  fuses: number
  seconds: number
}

export const popcount = (x: number) => { let c = 0; while (x) { x &= x - 1; c++ } return c }

export function solves(p: Pick<Puzzle, 'root' | 'lamps' | 'target'>, m: Mask): boolean {
  const e = evaluate(p.root, m, p.lamps)
  return !e.short && e.lit.every((l, i) => l === p.target[i])
}

/** Flatten series-in-series and parallel-in-parallel so the drawing stays tidy. */
function normalise(n: Node): Node {
  if (n.k === 'series' || n.k === 'par') {
    const ch = n.ch.map(normalise).flatMap(c => (c.k === n.k ? (c as typeof n).ch : [c]))
    return ch.length === 1 ? ch[0] : { ...n, ch }
  }
  return n
}

function renumber(n: Node, next = { id: 0 }): Node {
  const id = next.id++
  if (n.k === 'series' || n.k === 'par') return { ...n, id, ch: n.ch.map(c => renumber(c, next)) }
  return { ...n, id }
}

function buildNetwork(rng: Rng, theme: Theme, switches: number, lamps: number): Node {
  const contacts: { sw: number; nc: boolean }[] = []
  for (let s = 0; s < switches; s++) {
    if (theme.twoWay) { contacts.push({ sw: s, nc: false }, { sw: s, nc: true }); continue }
    const g = randInt(rng, theme.gang[0], theme.gang[1])
    for (let i = 0; i < g; i++) contacts.push({ sw: s, nc: rng() < theme.nc })
  }
  const pool = shuffle(contacts, rng)
  const leaf = (c: { sw: number; nc: boolean }): Node => ({ k: 'contact', id: 0, sw: c.sw, nc: c.nc })
  const items: Node[] = []
  // Each lamp, usually behind a contact of its own.
  for (let l = 0; l < lamps; l++) {
    const parts: Node[] = [{ k: 'lamp', id: 0, lamp: l }]
    if (pool.length && rng() < 0.7) parts.push(leaf(pool.pop()!))
    items.push(parts.length === 1 ? parts[0] : { k: 'series', id: 0, ch: shuffle(parts, rng) })
  }
  // The remaining contacts become bare pieces: bypasses, gates or shorts.
  while (pool.length) {
    const take = pool.length > 1 && rng() < 0.3 ? 2 : 1
    const cs = pool.splice(0, take).map(leaf)
    items.push(cs.length === 1 ? cs[0] : { k: rng() < 0.5 ? 'series' : 'par', id: 0, ch: cs })
  }
  // Join pieces at random until one network is left.
  let work = shuffle(items, rng)
  while (work.length > 1) {
    const a = work.pop()!, b = work.pop()!
    const lampish = (n: Node): boolean => n.k === 'lamp' || ((n.k === 'series' || n.k === 'par') && n.ch.some(lampish))
    // A bare piece beside a lamp is the interesting case (it can steal current).
    const bareBeside = lampish(a) !== lampish(b) && rng() < theme.bare
    const k = bareBeside ? 'par' : rng() < theme.series ? 'series' : 'par'
    work.push({ k, id: 0, ch: [a, b] })
    work = shuffle(work, rng)
  }
  return renumber(normalise(work[0]))
}

/** Every switch must change the outcome of some setting. */
function everySwitchMatters(root: Node, switches: number, lamps: number): boolean {
  const sig = (m: Mask) => { const e = evaluate(root, m, lamps); return e.short ? 'S' : e.lit.map(Number).join('') }
  const all = 1 << switches
  for (let s = 0; s < switches; s++) {
    let matters = false
    for (let m = 0; m < all && !matters; m++) if (!isOn(m, s) && sig(m) !== sig(m | (1 << s))) matters = true
    if (!matters) return false
  }
  return true
}

function tryPuzzle(rng: Rng, themeKey: ThemeKey, d: Difficulty): Puzzle | null {
  const theme: Theme = THEMES[themeKey]
  const tier = TIERS[d]
  const switches = randInt(rng, tier.switches[0], tier.switches[1])
  const lamps = randInt(rng, tier.lamps[0], tier.lamps[1]) + (d > 1 ? theme.extraLamps : 0)
  const root = buildNetwork(rng, theme, switches, lamps)
  const { w, h } = size(root)
  if (w > MAX_COLS || h > MAX_ROWS) return null
  if (!everySwitchMatters(root, switches, lamps)) return null

  const all = 1 << switches
  const evals = Array.from({ length: all }, (_, m) => evaluate(root, m, lamps))
  if (evals.filter(e => e.short).length < tier.minShorts * all) return null
  // Every lamp can be lit and darkened without a short.
  for (let l = 0; l < lamps; l++) {
    const states = new Set(evals.filter(e => !e.short).map(e => e.lit[l]))
    if (states.size < 2) return null
  }

  // Candidate targets: lamp patterns reached by few settings.
  const byPattern = new Map<string, Mask[]>()
  evals.forEach((e, m) => {
    if (e.short || !e.lit.some(Boolean)) return
    if (lamps >= 2 && d >= 2 && e.lit.every(Boolean)) return   // ask for a mix
    const key = e.lit.map(Number).join('')
    byPattern.set(key, [...(byPattern.get(key) ?? []), m])
  })
  const full = all - 1
  const candidates = [...byPattern.entries()].filter(([, ms]) =>
    ms.length <= tier.maxSolutions && !ms.includes(0) && !ms.includes(full))
  if (!candidates.length) return null
  const [key, solutions] = candidates[Math.floor(rng() * candidates.length)]
  const target = [...key].map(c => c === '1')

  const dist = (m: Mask) => Math.min(...solutions.map(s => popcount(m ^ s)))
  const starts = evals.map((_, m) => m).filter(m => !evals[m].short && dist(m) >= tier.minPar && !solutions.includes(m))
  if (!starts.length) return null
  const start = starts[Math.floor(rng() * starts.length)]
  const par = dist(start)
  return {
    theme: themeKey, difficulty: d, root, switches, lamps, target, start, solutions, par,
    budget: tier.slack === null ? null : par + tier.slack,
    fuses: tier.fuses, seconds: tier.seconds,
  }
}

export function makePuzzle(configId: string, difficulty: Difficulty, seed: number): Puzzle {
  const themeKey = (configId in THEMES ? configId : 'enigma') as ThemeKey
  const rng = mulberry32(seed ^ 0x5bd1e995)
  for (let attempt = 0; attempt < 4000; attempt++) {
    const p = tryPuzzle(rng, themeKey, difficulty)
    if (p) return p
  }
  // Practically unreachable; fall back to an easier tier rather than fail.
  if (difficulty > 1) return makePuzzle(configId, (difficulty - 1) as Difficulty, seed)
  throw new Error(`no circuit puzzle for ${configId}`)
}

/** A short structural fingerprint, used by tests to check variety. */
export function fingerprint(n: Node): string {
  switch (n.k) {
    case 'contact': return `${n.nc ? '!' : ''}${n.sw}`
    case 'lamp': return `L${n.lamp}`
    case 'series': return `(${n.ch.map(fingerprint).join(' ')})`
    case 'par': return `[${n.ch.map(fingerprint).join('|')}]`
  }
}
