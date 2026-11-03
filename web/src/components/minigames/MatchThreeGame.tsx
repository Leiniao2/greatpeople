import { useState, useCallback, useEffect, useRef } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { mulberry32, hashString, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'
import { artCover, type GameArtKey } from '@/games/art'

// Match Three — a market stall of goods to swap and match.
//
//   D1  8×8 · 1 round · score goal
//   D2  8×8 · 1 round · score + collect N of one good
//   D3  9×9 · 2 rounds · score + collect + break every crate
//   D4  9×9 · 2 rounds · tighter goals, tougher crates
//
// Special pieces: a run one longer than the minimum leaves a line clearer
// (clears its row or column), two longer leaves a trade caravan (swap it
// with any good to clear every piece of that good), and an L/T crossing
// leaves a blast (clears the 3×3 around it). Cascades multiply the score.
// The engine below is pure and seeded; the component plays the same steps
// with CSS transitions between them, and tests replay it move for move.

interface TileType { label: string; bg: string; border: string; text?: string }

export interface MatchRules {
  minMatch?: number               // minimum consecutive tiles (default 3)
  axis?: 'both' | 'row' | 'col'  // which directions produce matches (default 'both')
  diagonal?: boolean              // also match diagonally (default false)
}

export interface MatchThreeConfig {
  title: string
  tiles: TileType[]
  /** Painted market backdrop. */
  art: GameArtKey
  /** Points a plain greedy player averages per move on this config; goals scale from it. */
  pace: number
  /** Goods of one chosen kind that greedy play collects per move. */
  haul: number
  fact: string
  rules?: MatchRules
  ruleDesc: string
}

export const CONFIGS: Record<string, MatchThreeConfig> = {
  // ── Existing (easy-medium) ──────────────────────────────────────────────────
  'lisbon-spices': {
    title: "Spice Market, Lisbon 1502",
    tiles: [
      { label: 'C', bg: 'bg-accent',  border: 'border-accent' },
      { label: 'P', bg: 'bg-red-700',    border: 'border-red-500' },
      { label: 'S', bg: 'bg-yellow-500', border: 'border-yellow-300' },
      { label: 'G', bg: 'bg-orange-700', border: 'border-orange-500' },
      { label: 'N', bg: 'bg-emerald-800', border: 'border-emerald-500' },
    ],
    art: 'm3_lisbon_spices', pace: 200, haul: 2.3,
    ruleDesc: "Swap adjacent · match 3+",
    fact: "Manuel I's Portugal controlled the spice trade from 1498 to the 1580s. A cargo of cloves from Maluku could return 100× its cost in Lisbon. The monopoly funded the Manueline architecture still standing in Belém — cathedrals literally built on pepper.",
  },
  'changan-silks': {
    title: "Chang'an Silk Market",
    tiles: [
      { label: '赤', bg: 'bg-red-700',    border: 'border-red-400' },
      { label: '碧', bg: 'bg-teal-600',   border: 'border-teal-400' },
      { label: '金', bg: 'bg-yellow-600', border: 'border-yellow-400' },
      { label: '紫', bg: 'bg-purple-700', border: 'border-purple-400' },
      { label: '青', bg: 'bg-sky-700',    border: 'border-sky-400' },
    ],
    art: 'm3_changan_silks', pace: 220, haul: 2.4,
    ruleDesc: "Swap adjacent · match 3+",
    fact: "Tang Dynasty Chang'an (modern Xi'an) was the eastern terminus of the Silk Road and the world's largest city, with one million inhabitants. The Western Market alone had 3,000 registered shops trading silk, porcelain, and spices from as far as Persia and Byzantium.",
  },

  // ── Hard challenges ─────────────────────────────────────────────────────────

  // Rule: match-4 minimum · 6 tile types
  'cairo-alchemy': {
    title: "House of Wisdom, Baghdad 830 CE",
    tiles: [
      { label: '☿', bg: 'bg-line-2',   border: 'border-line-2',  text: 'text-ink-2' },
      { label: '♀', bg: 'bg-teal-700',    border: 'border-teal-400',   text: 'text-teal-100'  },
      { label: '♂', bg: 'bg-red-800',     border: 'border-red-500',    text: 'text-red-100'   },
      { label: '♃', bg: 'bg-accent',   border: 'border-accent',  text: 'text-ink-2' },
      { label: '♄', bg: 'bg-indigo-800',  border: 'border-indigo-500', text: 'text-indigo-100'},
    ],
    art: 'm3_cairo_alchemy', pace: 64, haul: 1.1,
    rules: { minMatch: 4 },
    ruleDesc: "Match 4 or more only · 5 elements",
    fact: "The House of Wisdom in Abbasid Baghdad synthesised Greek, Indian, and Persian knowledge. Al-Kindi, al-Farabi and al-Razi worked there — translating Aristotle, developing algebra, and mapping the stars with planetary symbols inherited from Hellenistic alchemy.",
  },

  // Rule: diagonal matches also score · 5 tile types
  'venice-glass': {
    title: "Murano Glassworks, Venice 1291",
    tiles: [
      { label: '△', bg: 'bg-cyan-700',   border: 'border-cyan-400',   text: 'text-cyan-100'   },
      { label: '▽', bg: 'bg-blue-700',   border: 'border-blue-400',   text: 'text-blue-100'   },
      { label: '◇', bg: 'bg-violet-700', border: 'border-violet-400', text: 'text-violet-100' },
      { label: '□', bg: 'bg-rose-800',   border: 'border-rose-500',   text: 'text-rose-100'   },
      { label: '○', bg: 'bg-accent',  border: 'border-accent',  text: 'text-accent-fg' },
      { label: '⬠', bg: 'bg-emerald-700', border: 'border-emerald-400', text: 'text-emerald-100' },
    ],
    art: 'm3_venice_glass', pace: 550, haul: 3.7,
    rules: { diagonal: true },
    ruleDesc: "Match 3+ in any direction including diagonals",
    fact: "Venice ordered all glassmakers to the island of Murano in 1291 — ostensibly to prevent fires, really to contain the secrets of cristallo glass. Murano craftsmen held rare freedom: they could marry nobility and carry swords, but leaving the island was punishable by death.",
  },

  // Rule: column matches only · 5 tile types
  'babylon-tablets': {
    title: "Babylonian Grain Market, 600 BCE",
    tiles: [
      { label: '⊕', bg: 'bg-accent',  border: 'border-accent',  text: 'text-ink-2'  },
      { label: '⊗', bg: 'bg-red-800',    border: 'border-red-500',    text: 'text-red-100'    },
      { label: '⊘', bg: 'bg-teal-700',   border: 'border-teal-400',   text: 'text-teal-100'   },
      { label: '⊙', bg: 'bg-purple-800', border: 'border-purple-500', text: 'text-purple-100' },
      { label: '⊚', bg: 'bg-orange-700', border: 'border-orange-400', text: 'text-orange-100' },
    ],
    art: 'm3_babylon_tablets', pace: 59, haul: 0.8,
    rules: { axis: 'col' },
    ruleDesc: "Vertical matches only · 5 symbols",
    fact: "Babylonian clay tablets recorded grain prices, interest rates and commodity contracts with astonishing precision — the world's first commodity futures market. Cuneiform records from 600 BCE show silver-denominated wheat prices responding to floods and harvests across Mesopotamia.",
  },

  // Rule: row matches only · 5 tile types
  'aztec-market': {
    title: "Tlatelolco Market, Aztec Empire 1500",
    tiles: [
      { label: '✦', bg: 'bg-green-700',  border: 'border-green-400',  text: 'text-green-100'  },
      { label: '✧', bg: 'bg-orange-700', border: 'border-orange-400', text: 'text-orange-100' },
      { label: '★', bg: 'bg-yellow-600', border: 'border-yellow-300', text: 'text-yellow-100' },
      { label: '✶', bg: 'bg-red-800',    border: 'border-red-500',    text: 'text-red-100'    },
      { label: '✸', bg: 'bg-indigo-700', border: 'border-indigo-400', text: 'text-indigo-100' },
    ],
    art: 'm3_aztec_market', pace: 65, haul: 0.9,
    rules: { axis: 'row' },
    ruleDesc: "Horizontal matches only · 5 glyphs",
    fact: "Hernán Cortés wrote to Charles V that Tlatelolco was larger than any market in Spain. It drew 60,000 traders daily — cacao, jade, feathers, obsidian blades, and human beings. Dedicated judges walked the aisles enforcing weights and punishing fraud on the spot.",
  },

  // Rule: standard, but 6 tile types makes cascades rare — brutal
  'hanseatic-runes': {
    title: "Hanseatic League, Lübeck 1358",
    tiles: [
      { label: 'ᚠ', bg: 'bg-stone-700',  border: 'border-stone-500',  text: 'text-stone-100'  },
      { label: 'ᚢ', bg: 'bg-zinc-700',   border: 'border-zinc-400',   text: 'text-zinc-100'   },
      { label: 'ᚦ', bg: 'bg-line-2',  border: 'border-line-2',  text: 'text-ink-2'  },
      { label: 'ᚨ', bg: 'bg-neutral-700',border: 'border-neutral-500',text: 'text-neutral-100'},
      { label: 'ᚱ', bg: 'bg-gray-700',   border: 'border-gray-500',   text: 'text-gray-100'   },
      { label: 'ᚲ', bg: 'bg-stone-800',  border: 'border-stone-500',  text: 'text-stone-200'  },
    ],
    art: 'm3_hanseatic_runes', pace: 100, haul: 1.2,
    ruleDesc: "Swap adjacent · match 3+ · 6 runes",
    fact: "The Hanseatic League at its peak united over 200 Northern European cities in a merchant alliance that bypassed feudal lords entirely. Its *Kontors* in London, Bergen, Bruges and Novgorod operated as sovereign trading colonies, complete with their own courts, weights, and private armies.",
  },

  // Rule: match-4+ AND diagonal · hardest
  'mughal-gems': {
    title: "Agra Gem Market, Mughal Empire 1600",
    tiles: [
      { label: '♦', bg: 'bg-rose-700',    border: 'border-rose-400',    text: 'text-rose-100'    },
      { label: '◆', bg: 'bg-violet-700',  border: 'border-violet-400',  text: 'text-violet-100'  },
      { label: '⬧', bg: 'bg-accent',   border: 'border-accent',   text: 'text-ink-2'   },
      { label: '◉', bg: 'bg-cyan-700',    border: 'border-cyan-400',    text: 'text-cyan-100'    },
      { label: '⬡', bg: 'bg-emerald-700', border: 'border-emerald-400', text: 'text-emerald-100' },
    ],
    art: 'm3_mughal_gems', pace: 110, haul: 1.6,
    rules: { minMatch: 4, diagonal: true },
    ruleDesc: "Match 4+ only · diagonals count · 5 gems",
    fact: "Akbar's Mughal Empire controlled the world's richest gem pipeline: rubies from Burma, emeralds from Colombia via Portuguese Goa, sapphires from Ceylon, and diamonds from Golconda — the mine that produced the Koh-i-Noor. European merchants called Agra's Jauhari Bazaar the most magnificent market on Earth.",
  },
}


// ── Engine ────────────────────────────────────────────────────────────────────

export type Special = 'row' | 'col' | 'bomb' | 'caravan'

/** Colour index for goods; crates and caravans carry these instead. */
export const CRATE = -2
export const WILD = -3

export interface Piece { id: number; t: number; sp?: Special; hp?: number }

/** Flat n×n board; `null` only appears between a clear and the refill. */
export interface Board { n: number; cells: (Piece | null)[]; nextId: number }

type Dir = 'h' | 'v' | 'd1' | 'd2'
const STEP: Record<Dir, [number, number]> = { h: [0, 1], v: [1, 0], d1: [1, 1], d2: [1, -1] }

function dirsFor({ axis = 'both', diagonal = false }: MatchRules): Dir[] {
  const out: Dir[] = []
  if (axis !== 'col') out.push('h')
  if (axis !== 'row') out.push('v')
  if (diagonal) out.push('d1', 'd2')
  return out
}

const colourOf = (p: Piece | null | undefined) => (p && p.t >= 0 ? p.t : -1)
export const isCrate = (p: Piece | null | undefined) => !!p && p.t === CRATE

export interface Run { cells: number[]; dir: Dir; t: number }

/** Every maximal run of at least `minMatch` same-coloured goods. */
export function findRuns(b: Board, rules: MatchRules = {}): Run[] {
  const { n, cells } = b, m = rules.minMatch ?? 3
  const runs: Run[] = []
  const at = (r: number, c: number) => (r < 0 || c < 0 || r >= n || c >= n ? -1 : colourOf(cells[r * n + c]))
  for (const dir of dirsFor(rules)) {
    const [dr, dc] = STEP[dir]
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const t = at(r, c)
      if (t < 0 || at(r - dr, c - dc) === t) continue // not the start of a run
      const run: number[] = []
      let rr = r, cc = c
      while (at(rr, cc) === t) { run.push(rr * n + cc); rr += dr; cc += dc }
      if (run.length >= m) runs.push({ cells: run, dir, t })
    }
  }
  return runs
}

/** Cells in any run (kept for callers that only need the set). */
export function findMatches(b: Board, rules: MatchRules = {}): Set<number> {
  const out = new Set<number>()
  for (const run of findRuns(b, rules)) run.cells.forEach(i => out.add(i))
  return out
}

/** Length of the longest line of `t` through cell i, as if i held colour t. */
function lineThrough(b: Board, i: number, t: number, rules: MatchRules): number {
  const { n, cells } = b
  const r0 = Math.floor(i / n), c0 = i % n
  let best = 0
  for (const dir of dirsFor(rules)) {
    const [dr, dc] = STEP[dir]
    let len = 1
    for (const s of [1, -1]) {
      let r = r0 + dr * s, c = c0 + dc * s
      while (r >= 0 && c >= 0 && r < n && c < n && colourOf(cells[r * n + c]) === t) { len++; r += dr * s; c += dc * s }
    }
    best = Math.max(best, len)
  }
  return best
}

export const swapped = (b: Board, i: number, j: number): Board => {
  const cells = [...b.cells]
  ;[cells[i], cells[j]] = [cells[j], cells[i]]
  return { ...b, cells }
}

export function isAdjacent(n: number, i: number, j: number) {
  const ri = Math.floor(i / n), ci = i % n, rj = Math.floor(j / n), cj = j % n
  return Math.abs(ri - rj) + Math.abs(ci - cj) === 1
}

/** A swap is legal if it fires a caravan, pairs two specials, or makes a run. */
export function isValidSwap(b: Board, i: number, j: number, rules: MatchRules = {}): boolean {
  const p = b.cells[i], q = b.cells[j]
  if (!p || !q || isCrate(p) || isCrate(q) || !isAdjacent(b.n, i, j)) return false
  if (p.sp === 'caravan' || q.sp === 'caravan') return true
  if (p.sp && q.sp) return true
  if (p.t === q.t) return false
  const s = swapped(b, i, j), m = rules.minMatch ?? 3
  return lineThrough(s, i, s.cells[i]!.t, rules) >= m || lineThrough(s, j, s.cells[j]!.t, rules) >= m
}

/** Every legal adjacent swap as [i, j] with i < j. */
export function validSwaps(b: Board, rules: MatchRules = {}): [number, number][] {
  const out: [number, number][] = []
  const { n } = b
  for (let i = 0; i < n * n; i++) {
    if (i % n < n - 1 && isValidSwap(b, i, i + 1, rules)) out.push([i, i + 1])
    if (i + n < n * n && isValidSwap(b, i, i + n, rules)) out.push([i, i + n])
  }
  return out
}

export function hasValidMove(b: Board, rules: MatchRules = {}): boolean {
  const { n } = b
  for (let i = 0; i < n * n; i++) {
    if (i % n < n - 1 && isValidSwap(b, i, i + 1, rules)) return true
    if (i + n < n * n && isValidSwap(b, i, i + n, rules)) return true
  }
  return false
}

export interface ClearPlan {
  /** Goods and specials removed this step (crates are separate). */
  clear: Set<number>
  /** Crates hit once each this step. */
  crateHits: Set<number>
  /** Specials left behind by long or crossing runs. */
  create: Map<number, { t: number; sp: Special }>
  /** Specials that went off. */
  fired: number
}

/** Cells a special clears when it goes off. */
function blastOf(b: Board, i: number, p: Piece): number[] {
  const { n } = b, r = Math.floor(i / n), c = i % n
  const out: number[] = []
  if (p.sp === 'row') for (let k = 0; k < n; k++) out.push(r * n + k)
  else if (p.sp === 'col') for (let k = 0; k < n; k++) out.push(k * n + c)
  else if (p.sp === 'bomb') {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc
      if (rr >= 0 && cc >= 0 && rr < n && cc < n) out.push(rr * n + cc)
    }
  } else if (p.sp === 'caravan') {
    // Set off by another blast: takes the most plentiful good.
    const counts = new Map<number, number>()
    b.cells.forEach(q => { const t = colourOf(q); if (t >= 0) counts.set(t, (counts.get(t) ?? 0) + 1) })
    let best = -1, most = 0
    for (const [t, k] of [...counts].sort((x, y) => x[0] - y[0])) if (k > most) { most = k; best = t }
    b.cells.forEach((q, k) => { if (colourOf(q) === best) out.push(k) })
    out.push(i)
  }
  return out
}

/** Grow a seed set of cleared cells through every special it touches, and nick adjacent crates. */
function chain(b: Board, seed: Iterable<number>, alreadyFired: Set<number> = new Set()): Omit<ClearPlan, 'create'> {
  const { n, cells } = b
  const clear = new Set<number>(), crateHits = new Set<number>(), fired = new Set(alreadyFired)
  const queue: number[] = []
  const add = (j: number) => {
    const q = cells[j]
    if (!q) return
    if (isCrate(q)) { crateHits.add(j); return }
    if (!clear.has(j)) { clear.add(j); queue.push(j) }
  }
  for (const i of seed) add(i)
  while (queue.length) {
    const i = queue.shift()!
    const p = cells[i]!
    if (p.sp && !fired.has(i)) { fired.add(i); blastOf(b, i, p).forEach(add) }
  }
  // A cleared good cracks any crate beside it.
  for (const i of clear) {
    const r = Math.floor(i / n), c = i % n
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const rr = r + dr, cc = c + dc
      if (rr >= 0 && cc >= 0 && rr < n && cc < n && isCrate(cells[rr * n + cc])) crateHits.add(rr * n + cc)
    }
  }
  return { clear, crateHits, fired: fired.size }
}

/** What the runs on the board clear, and the specials they leave. `moved` are the cells just swapped. */
export function planClear(b: Board, rules: MatchRules = {}, moved: number[] = []): ClearPlan | null {
  const runs = findRuns(b, rules)
  if (!runs.length) return null
  const m = rules.minMatch ?? 3
  // Group runs that share a cell: an L or T is one group.
  const parent = runs.map((_, k) => k)
  const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])))
  const owner = new Map<number, number>()
  const crossings = new Set<number>()
  runs.forEach((run, k) => run.cells.forEach(i => {
    if (owner.has(i)) { parent[find(k)] = find(owner.get(i)!); crossings.add(i) } else owner.set(i, k)
  }))
  const groups = new Map<number, number[]>()
  runs.forEach((_, k) => { const g = find(k); groups.set(g, [...(groups.get(g) ?? []), k]) })

  const create = new Map<number, { t: number; sp: Special }>()
  for (const ks of groups.values()) {
    const gRuns = ks.map(k => runs[k])
    const longest = gRuns.reduce((a, r) => (r.cells.length > a.cells.length ? r : a))
    const all = new Set(gRuns.flatMap(r => r.cells))
    const cross = [...all].find(i => crossings.has(i))
    const sp: Special | null =
      longest.cells.length >= m + 2 ? 'caravan'
      : cross !== undefined ? 'bomb'
      : longest.cells.length >= m + 1 ? (longest.dir === 'v' ? 'col' : 'row')
      : null
    if (!sp) continue
    const pos = moved.find(i => all.has(i)) ?? (sp === 'bomb' ? cross! : longest.cells[Math.floor(longest.cells.length / 2)])
    if (!create.has(pos)) create.set(pos, { t: sp === 'caravan' ? WILD : longest.t, sp })
  }
  const seed = new Set<number>()
  runs.forEach(r => r.cells.forEach(i => seed.add(i)))
  return { ...chain(b, seed), create }
}

/** Swaps that set specials off directly: a caravan, or two specials together. */
export function planSwapFire(b: Board, i: number, j: number): ClearPlan | null {
  const p = b.cells[i], q = b.cells[j]
  if (!p || !q) return null
  const create = new Map<number, { t: number; sp: Special }>()
  if (p.sp === 'caravan' || q.sp === 'caravan') {
    const [car, other] = p.sp === 'caravan' ? [i, q] : [j, p]
    const seed: number[] = [i, j]
    if (other.sp === 'caravan') b.cells.forEach((x, k) => { if (colourOf(x) >= 0) seed.push(k) })
    else b.cells.forEach((x, k) => { if (colourOf(x) === other.t) seed.push(k) })
    const fired = new Set([car])
    if (other.sp === 'caravan') fired.add(car === i ? j : i)
    return { ...chain(b, seed, fired), create }
  }
  if (p.sp && q.sp) return { ...chain(b, [i, j]), create }
  return null
}

/** Empty the cleared cells, crack crates and drop the new specials in. */
export function applyPlan(b: Board, plan: ClearPlan): { board: Board; cratesBroken: number } {
  const cells = [...b.cells]
  let nextId = b.nextId, cratesBroken = 0
  plan.clear.forEach(i => { cells[i] = null })
  plan.crateHits.forEach(i => {
    const c = cells[i]!
    const hp = (c.hp ?? 1) - 1
    if (hp <= 0) { cells[i] = null; cratesBroken++ } else cells[i] = { ...c, hp }
  })
  plan.create.forEach(({ t, sp }, i) => { cells[i] = { id: nextId++, t, sp } })
  return { board: { ...b, cells, nextId }, cratesBroken }
}

/** Goods fall past the (fixed) crates; new goods drop in from the top. */
export function gravity(b: Board, types: number, rand: Rng): Board {
  const { n } = b
  const cells = [...b.cells]
  let nextId = b.nextId
  for (let c = 0; c < n; c++) {
    const slots: number[] = []
    for (let r = 0; r < n; r++) if (!isCrate(cells[r * n + c])) slots.push(r * n + c)
    const falling = slots.map(i => cells[i]).filter((p): p is Piece => !!p)
    for (let k = slots.length - 1; k >= 0; k--) {
      cells[slots[k]] = falling.pop() ?? { id: nextId++, t: Math.floor(rand() * types) }
    }
  }
  return { ...b, cells, nextId }
}

export interface Step {
  plan: ClearPlan
  after: Board
  points: number
  /** Goods cleared per colour. */
  collected: number[]
  cratesBroken: number
}

export const POINTS = { tile: 10, crate: 15, special: 20 }
/** Cascade multiplier tops out here so a lucky chain cannot finish a level alone. */
export const MAX_MULT = 5

/** One clear-and-refill step; `swap` only on the first step of a move. */
export function resolveStep(b: Board, rules: MatchRules, types: number, rand: Rng, combo: number, swap: [number, number] | null = null): Step | null {
  const plan = (swap && planSwapFire(b, swap[0], swap[1])) || planClear(b, rules, swap ?? [])
  if (!plan) return null
  const collected = Array(types).fill(0)
  plan.clear.forEach(i => { const t = colourOf(b.cells[i]); if (t >= 0) collected[t]++ })
  const { board, cratesBroken } = applyPlan(b, plan)
  const points = (plan.clear.size * POINTS.tile + plan.crateHits.size * POINTS.crate + plan.create.size * POINTS.special) * Math.min(combo, MAX_MULT)
  return { plan, after: gravity(board, types, rand), points, collected, cratesBroken }
}

function noRunAt(cells: (Piece | null)[], n: number, i: number, t: number, rules: MatchRules): boolean {
  const m = rules.minMatch ?? 3
  const r0 = Math.floor(i / n), c0 = i % n
  for (const dir of dirsFor(rules)) {
    const [dr, dc] = STEP[dir]
    let len = 1
    for (const s of [1, -1]) {
      let r = r0 + dr * s, c = c0 + dc * s
      while (r >= 0 && c >= 0 && r < n && c < n && colourOf(cells[r * n + c]) === t) { len++; r += dr * s; c += dc * s }
    }
    if (len >= m) return false
  }
  return true
}

/** Fill every non-crate cell with goods that make no run. */
function fillGoods(b: Board, types: number, rand: Rng, rules: MatchRules): Board {
  const { n } = b
  const cells = b.cells.map(p => (isCrate(p) ? p : null))
  let nextId = b.nextId
  for (let i = 0; i < n * n; i++) {
    if (cells[i]) continue
    const start = Math.floor(rand() * types)
    let t = start
    for (let k = 0; k < types; k++) { t = (start + k) % types; if (noRunAt(cells, n, i, t, rules)) break }
    cells[i] = { id: nextId++, t }
  }
  return { n, cells, nextId }
}

/** Plant one legal swap on a stuck board: m-1 goods in a line and one just off its end. */
function plantMove(b: Board, types: number, rules: MatchRules, rand: Rng): Board {
  const { n } = b, m = rules.minMatch ?? 3
  const dirs = dirsFor(rules).filter(d => d === 'h' || d === 'v')
  for (let attempt = 0; attempt < 400; attempt++) {
    const dir = dirs[Math.floor(rand() * dirs.length)] ?? 'h'
    const r = Math.floor(rand() * n), c = Math.floor(rand() * n)
    const line = Array.from({ length: m }, (_, k) => (dir === 'h' ? [r, c + k] : [r + k, c]))
    if (line.some(([rr, cc]) => rr >= n || cc >= n)) continue
    const [er, ec] = line[m - 1]
    const off = dir === 'h' ? [er + 1, ec] : [er, ec + 1]
    if (off[0] >= n || off[1] >= n) continue
    const idx = [...line.slice(0, m - 1), off].map(([rr, cc]) => rr * n + cc)
    if ([...idx, er * n + ec].some(i => !b.cells[i] || isCrate(b.cells[i]))) continue
    const t = Math.floor(rand() * types)
    if (colourOf(b.cells[er * n + ec]) === t) continue
    const cells = [...b.cells]
    idx.forEach(i => { cells[i] = { ...cells[i]!, t, sp: undefined } })
    const next = { ...b, cells }
    if (!findRuns(next, rules).length && hasValidMove(next, rules)) return next
  }
  return b
}

/** A board with no ready-made runs and at least one legal swap. */
function settleNew(b: Board, types: number, rand: Rng, rules: MatchRules): Board {
  let cur = fillGoods(b, types, rand, rules)
  for (let tries = 0; tries < 40 && !hasValidMove(cur, rules); tries++) cur = fillGoods(b, types, rand, rules)
  if (!hasValidMove(cur, rules)) cur = plantMove(cur, types, rules, rand)
  return cur
}

/** Deal a fresh board, with `crates` fixed crates inside the frame and off the top two rows. */
export function deal(n: number, types: number, rules: MatchRules, rand: Rng, crates = 0, crateHp = 1, nextId = 1): Board {
  const cells: (Piece | null)[] = Array(n * n).fill(null)
  const spots: number[] = []
  for (let r = 2; r < n - 1; r++) for (let c = 1; c < n - 1; c++) spots.push(r * n + c)
  for (let k = spots.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [spots[k], spots[j]] = [spots[j], spots[k]] }
  let id = nextId
  spots.slice(0, crates).forEach((i, k) => { cells[i] = { id: id++, t: CRATE, hp: k % 2 === 1 ? crateHp : 1 } })
  return settleNew({ n, cells, nextId: id }, types, rand, rules)
}

/** No legal swap left: shuffle the goods (crates stay), or restock if shuffling cannot help. */
export function reshuffle(b: Board, types: number, rand: Rng, rules: MatchRules): Board {
  const slots = b.cells.map((p, i) => (isCrate(p) ? -1 : i)).filter(i => i >= 0)
  const pieces = slots.map(i => b.cells[i]!)
  for (let tries = 0; tries < 30; tries++) {
    for (let k = pieces.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [pieces[k], pieces[j]] = [pieces[j], pieces[k]] }
    const cells = [...b.cells]
    slots.forEach((i, k) => { cells[i] = pieces[k] })
    const next = { ...b, cells }
    if (!findRuns(next, rules).length && hasValidMove(next, rules)) return next
  }
  return settleNew(b, types, rand, rules)
}

// ── Levels ────────────────────────────────────────────────────────────────────

export interface Level {
  n: number
  rounds: number
  moves: number
  score: number
  /** Goods of one kind to collect each round (0 = no collection goal). */
  collect: number
  crates: number
  crateHp: number
}

export function levelFor(cfg: MatchThreeConfig, difficulty: Difficulty): Level {
  const n = scale(difficulty, [8, 8, 9, 9])
  const moves = scale(difficulty, [30, 26, 24, 22])
  // 9×9 boards score about a third more per move than 8×8.
  const pace = cfg.pace * (n === 9 ? 1.3 : 1)
  // Share of a greedy player's average haul each goal asks for.
  const score = Math.max(200, Math.round((pace * moves * scale(difficulty, [0.35, 0.45, 0.42, 0.42])) / 50) * 50)
  const haul = cfg.haul * (n === 9 ? 1.3 : 1)
  const collect = difficulty === 1 ? 0 : Math.max(5, Math.round(haul * moves * scale(difficulty, [0, 0.5, 0.45, 0.42])))
  // Slow boards (one axis, match-4) get fewer crates.
  const fast = cfg.pace >= 150
  const oneAxis = (cfg.rules?.axis ?? 'both') !== 'both'
  return {
    n, moves, score, collect,
    rounds: scale(difficulty, [1, 1, 2, 2]),
    crates: difficulty < 3 ? 0 : fast ? scale(difficulty, [0, 0, 5, 6]) : oneAxis ? 2 : 3,
    crateHp: oneAxis ? 1 : scale(difficulty, [1, 1, 1, 2]),
  }
}

/** Seed for a challenge: the config id mixed with the attempt seed. */
export const boardSeed = (configId: string, attemptSeed: number) => (hashString(configId) ^ attemptSeed) >>> 0

export interface RoundStart { board: Board; collectT: number }

/** Deal round `round` from the shared rng: the good to collect is drawn first. */
export function startRound(cfg: MatchThreeConfig, level: Level, rand: Rng, nextId = 1): RoundStart {
  const types = cfg.tiles.length
  const collectT = Math.floor(rand() * types)
  return { collectT, board: deal(level.n, types, cfg.rules ?? {}, rand, level.crates, level.crateHp, nextId) }
}

export interface Progress { score: number; collected: number; crates: number }

export function goalsMet(level: Level, p: Progress): boolean {
  return p.score >= level.score && p.collected >= level.collect && p.crates <= 0
}

export const cratesLeft = (b: Board) => b.cells.filter(isCrate).length

/**
 * How a sensible player rates a swap before seeing the refill: goods
 * cleared, plus extra for the wanted good, crates and specials made.
 */
export function rateSwap(b: Board, i: number, j: number, rules: MatchRules, collectT: number): number {
  const s = swapped(b, i, j)
  const plan = planSwapFire(s, i, j) || planClear(s, rules, [i, j])
  if (!plan) return -1
  let wanted = 0
  plan.clear.forEach(k => { if (colourOf(s.cells[k]) === collectT) wanted++ })
  // With crates left and none hit, edge towards the nearest one.
  let near = 0
  if (!plan.crateHits.size) {
    const { n } = b
    const crates = b.cells.map((p, k) => (isCrate(p) ? k : -1)).filter(k => k >= 0)
    if (crates.length) {
      let d = Infinity
      plan.clear.forEach(k => crates.forEach(x => {
        d = Math.min(d, Math.abs(Math.floor(k / n) - Math.floor(x / n)) + Math.abs((k % n) - (x % n)))
      }))
      near = -Math.min(d, n) * 0.5
    }
  }
  return plan.clear.size + 3 * wanted + 6 * plan.crateHits.size + 5 * plan.create.size + near
}

export function bestSwap(b: Board, rules: MatchRules, collectT: number): [number, number] | null {
  let best: [number, number] | null = null, bestScore = -Infinity
  for (const [i, j] of validSwaps(b, rules)) {
    const v = rateSwap(b, i, j, rules, collectT)
    if (v > bestScore) { bestScore = v; best = [i, j] }
  }
  return best
}

export interface MoveResult { board: Board; points: number; collected: number[]; cratesBroken: number; combo: number; steps: Step[]; reshuffled: boolean }

/** Play one swap to rest, exactly as the component does (minus the waiting). */
export function playMove(b: Board, i: number, j: number, rules: MatchRules, types: number, rand: Rng): MoveResult {
  let cur = swapped(b, i, j)
  const steps: Step[] = []
  let combo = 1, swap: [number, number] | null = [i, j]
  for (let guard = 0; guard < 60; guard++) {
    const st = resolveStep(cur, rules, types, rand, combo, swap)
    if (!st) break
    steps.push(st)
    cur = st.after
    combo++
    swap = null
  }
  const collected = Array(types).fill(0)
  steps.forEach(s => s.collected.forEach((k, t) => { collected[t] += k }))
  let reshuffled = false
  if (!hasValidMove(cur, rules)) { cur = reshuffle(cur, types, rand, rules); reshuffled = true }
  return {
    board: cur, steps, reshuffled, combo: steps.length,
    points: steps.reduce((s, x) => s + x.points, 0),
    collected,
    cratesBroken: steps.reduce((s, x) => s + x.cratesBroken, 0),
  }
}

/** A greedy run of a whole challenge, used by the tests to prove every level is reachable. */
export function simulate(configId: string, difficulty: Difficulty, attemptSeed: number, configs = CONFIGS) {
  const cfg = configs[configId] ?? configs['lisbon-spices']
  const level = levelFor(cfg, difficulty)
  const rules = cfg.rules ?? {}, types = cfg.tiles.length
  const rand = mulberry32(boardSeed(configId, attemptSeed))
  let nextId = 1, totalMoves = 0
  for (let round = 0; round < level.rounds; round++) {
    const start = startRound(cfg, level, rand, nextId)
    let board = start.board
    const prog: Progress = { score: 0, collected: 0, crates: cratesLeft(board) }
    let moves = 0
    while (!goalsMet(level, prog)) {
      if (moves >= level.moves) return { won: false, round, moves: totalMoves, prog, level }
      const pick = bestSwap(board, rules, start.collectT)!
      const res = playMove(board, pick[0], pick[1], rules, types, rand)
      moves++; totalMoves++
      prog.score += res.points
      prog.collected += res.collected[start.collectT]
      prog.crates -= res.cratesBroken
      board = res.board
    }
    nextId = board.nextId
  }
  return { won: true, round: level.rounds, moves: totalMoves, level }
}

// ── Component ─────────────────────────────────────────────────────────────────

const SWAP_MS = 190, CLEAR_MS = 230, FALL_MS = 260, HINT_MS = 6000

const M3_CSS = `
@keyframes m3-drop { from { transform: translateY(-160%); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes m3-pop { 0% { transform: scale(1) } 35% { transform: scale(1.18); filter: brightness(1.6) } 100% { transform: scale(0); opacity: 0 } }
@keyframes m3-hint { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.14); filter: brightness(1.3) } }
@keyframes m3-combo { 0% { transform: translate(-50%, 10px) scale(.6); opacity: 0 } 25% { transform: translate(-50%, 0) scale(1.1); opacity: 1 } 100% { transform: translate(-50%, -14px) scale(1); opacity: 0 } }
.m3-drop { animation: m3-drop 280ms cubic-bezier(.3,1.4,.6,1) both }
.m3-pop { animation: m3-pop ${CLEAR_MS}ms ease-in forwards }
.m3-hint { animation: m3-hint 900ms ease-in-out infinite }
.m3-combo { animation: m3-combo 900ms ease-out forwards }
`

function PieceFace({ p, tile }: { p: Piece; tile?: TileType }) {
  if (isCrate(p)) {
    return (
      <div className="w-full h-full rounded-md border-2 border-amber-950/70 bg-amber-800 flex items-center justify-center relative
        shadow-inner [background-image:repeating-linear-gradient(90deg,transparent_0_28%,rgba(0,0,0,.25)_28%_34%)]">
        <span className="text-amber-200 font-bold" style={{ fontSize: '0.8em' }}>▦</span>
        {(p.hp ?? 1) > 1 && <span className="absolute top-0 right-0.5 text-[0.5em] font-bold text-amber-100">×{p.hp}</span>}
      </div>
    )
  }
  if (p.sp === 'caravan') {
    return (
      <div className="w-full h-full rounded-full border-2 border-white/80 flex items-center justify-center shadow-lg
        [background:conic-gradient(#b91c1c,#ca8a04,#15803d,#0e7490,#6d28d9,#b91c1c)]">
        <span className="text-white font-bold drop-shadow" style={{ fontSize: '0.85em' }}>✺</span>
      </div>
    )
  }
  return (
    <div className={`w-full h-full rounded-lg border-2 flex items-center justify-center relative overflow-hidden font-bold shadow
      ${tile?.bg ?? ''} ${tile?.border ?? ''} ${tile?.text ?? 'text-white'}
      ${p.sp === 'bomb' ? 'ring-2 ring-white/90 ring-offset-1 ring-offset-transparent' : ''}`}>
      {p.sp === 'row' && <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[22%] bg-white/55" />}
      {p.sp === 'col' && <span className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[22%] bg-white/55" />}
      {p.sp === 'bomb' && <span className="absolute inset-[18%] rounded-full border-2 border-white/80 bg-white/20" />}
      <span className="relative drop-shadow-[0_1px_1px_rgba(0,0,0,.5)]">{tile?.label}</span>
    </div>
  )
}

export default function MatchThreeGame({ configId, difficulty, seed: attemptSeed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'lisbon-spices')
  const { tiles } = config
  const rules = config.rules ?? {}
  const types = tiles.length
  const level = levelFor(config, difficulty)
  const m = rules.minMatch ?? 3
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 700 })

  // One rng drives the deal, every refill and every reshuffle, as in simulate().
  const [init] = useState(() => {
    const rand = mulberry32(boardSeed(configId, attemptSeed))
    return { rand, start: startRound(config, level, rand) }
  })
  const [board, setBoard] = useState<Board>(init.start.board)
  const [collectT, setCollectT] = useState(init.start.collectT)
  const [round, setRound] = useState(0)
  const [movesUsed, setMovesUsed] = useState(0)
  const [prog, setProg] = useState<Progress>({ score: 0, collected: 0, crates: cratesLeft(init.start.board) })
  const [selected, setSelected] = useState<number | null>(null)
  const [clearing, setClearing] = useState<Set<number>>(new Set())
  const [combo, setCombo] = useState<{ n: number; key: number } | null>(null)
  const [hint, setHint] = useState<[number, number] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const live = useRef({ board: init.start.board, prog: { score: 0, collected: 0, crates: cratesLeft(init.start.board) } as Progress, moves: 0, round: 0, collectT: init.start.collectT, busy: false, done: false })
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const later = useCallback((fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)) }, [])
  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])

  // Pieces that were not on the previous board drop in from above.
  const [fresh, setFresh] = useState<Set<number>>(() => new Set(init.start.board.cells.map(p => p!.id)))
  const show = (b: Board) => {
    const before = new Set(live.current.board.cells.map(p => p?.id))
    setFresh(new Set(b.cells.filter(p => p && !before.has(p.id)).map(p => p!.id)))
    live.current.board = b
    setBoard(b)
  }
  const setBusyBoth = (v: boolean) => { live.current.busy = v; setBusy(v) }

  const finish = (cur: Board) => {
    const L = live.current
    let b = cur
    if (!hasValidMove(b, rules)) {
      b = reshuffle(b, types, init.rand, rules)
      setNotice('No swaps left — the stalls restock')
    }
    show(b)
    if (goalsMet(level, L.prog)) {
      if (L.round + 1 < level.rounds) {
        setNotice(`Round ${L.round + 1} complete — next market day!`)
        later(() => {
          const next = startRound(config, level, init.rand, b.nextId)
          L.round++; L.moves = 0; L.collectT = next.collectT
          L.prog = { score: 0, collected: 0, crates: cratesLeft(next.board) }
          setRound(L.round); setMovesUsed(0); setCollectT(next.collectT); setProg(L.prog)
          show(next.board)
          setNotice(null)
          setBusyBoth(false)
        }, 1100)
        return
      }
      L.done = true
      win()
      setBusyBoth(false)
      return
    }
    if (L.moves >= level.moves) { L.done = true; lose('out of moves') }
    setBusyBoth(false)
  }

  const step = (cur: Board, n: number, swap: [number, number] | null) => {
    const st = resolveStep(cur, rules, types, init.rand, n, swap)
    if (!st) { finish(cur); return }
    const L = live.current
    L.prog = {
      score: L.prog.score + st.points,
      collected: L.prog.collected + st.collected[L.collectT],
      crates: L.prog.crates - st.cratesBroken,
    }
    setProg(L.prog)
    setClearing(new Set([...st.plan.clear, ...[...st.plan.crateHits].filter(i => (cur.cells[i]?.hp ?? 1) <= 1)]))
    if (n >= 2) setCombo({ n, key: Date.now() + n })
    later(() => {
      setClearing(new Set())
      show(st.after)
      later(() => step(st.after, n + 1, null), FALL_MS)
    }, CLEAR_MS)
  }

  const trySwap = (i: number, j: number) => {
    const L = live.current
    if (L.busy || L.done || settled) return
    setSelected(null); setHint(null); setNotice(null)
    const b = L.board
    const s = swapped(b, i, j)
    setBusyBoth(true)
    if (!isValidSwap(b, i, j, rules)) {
      setBoard(s)
      later(() => { setBoard(b); setBusyBoth(false); setNotice('That swap makes no match') }, SWAP_MS + 60)
      return
    }
    L.moves++
    setMovesUsed(L.moves)
    show(s)
    later(() => step(s, 1, [i, j]), SWAP_MS)
  }

  const tap = (i: number) => {
    if (live.current.busy || settled) return
    const p = board.cells[i]
    if (!p || isCrate(p)) return
    if (selected === null) { setSelected(i); return }
    if (selected === i) { setSelected(null); return }
    if (isAdjacent(board.n, selected, i)) trySwap(selected, i)
    else setSelected(i)
  }

  // Swipe support: drag a piece a little way to swap it with its neighbour.
  const drag = useRef<{ i: number; x: number; y: number } | null>(null)
  const swiped = useRef(false)
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return
    drag.current = null
    swiped.current = true
    const n = board.n, r = Math.floor(d.i / n), c = d.i % n
    const [rr, cc] = Math.abs(dx) > Math.abs(dy) ? [r, c + Math.sign(dx)] : [r + Math.sign(dy), c]
    if (rr >= 0 && cc >= 0 && rr < n && cc < n) trySwap(d.i, rr * n + cc)
  }

  // Idle for a while: pulse a good swap.
  useEffect(() => {
    setHint(null)
    if (busy || settled) return
    const t = setTimeout(() => setHint(bestSwap(live.current.board, rules, live.current.collectT)), HINT_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, busy, settled, selected])

  const n = board.n
  const movesLeft = Math.max(0, level.moves - movesUsed)
  const scorePct = Math.min(1, prog.score / level.score)
  const want = tiles[collectT]

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <style>{M3_CSS}</style>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest truncate">{config.title}</p>
          <p className="text-muted text-[10px]">{config.ruleDesc}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-2xl font-bold tabular-nums leading-none ${movesLeft <= 3 ? 'text-red-600' : 'text-ink'}`} data-testid="m3-moves">{movesLeft}</p>
          <p className="text-[10px] text-muted">moves{level.rounds > 1 ? ` · round ${round + 1}/${level.rounds}` : ''}</p>
        </div>
      </div>

      {/* Goals */}
      <div className="flex flex-col gap-1.5 bg-panel border border-line rounded-lg p-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-ink-2 w-10">Score</span>
          <div className="flex-1 h-2 bg-paper rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${scorePct * 100}%` }} />
          </div>
          <span className="text-[10px] tabular-nums text-ink-2 w-20 text-right" data-testid="m3-score">{prog.score} / {level.score}</span>
        </div>
        {(level.collect > 0 || level.crates > 0) && (
          <div className="flex items-center gap-3 text-[11px] text-ink-2">
            {level.collect > 0 && (
              <span className="flex items-center gap-1.5">
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded font-bold text-[11px] border ${want.bg} ${want.border} ${want.text ?? 'text-white'}`}>{want.label}</span>
                <span className={`tabular-nums ${prog.collected >= level.collect ? 'text-emerald-700 font-bold' : ''}`}>
                  {Math.min(prog.collected, level.collect)} / {level.collect}
                </span>
              </span>
            )}
            {level.crates > 0 && (
              <span className={`flex items-center gap-1 ${prog.crates <= 0 ? 'text-emerald-700 font-bold' : ''}`}>
                <span className="inline-block w-4 h-4 rounded-sm bg-amber-800 border border-amber-950/60" />
                {prog.crates <= 0 ? 'crates cleared' : `${prog.crates} crate${prog.crates === 1 ? '' : 's'} left`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Board */}
      <div
        className="relative w-full max-w-[420px] mx-auto aspect-square rounded-xl overflow-hidden border-2 border-line-2 bg-panel touch-none select-none"
        style={{ ...artCover(config.art), containerType: 'inline-size' }}
        data-testid="m3-board"
        data-collect={collectT}
        onPointerMove={onPointerMove}
        onPointerUp={() => { drag.current = null }}
        onPointerLeave={() => { drag.current = null }}
      >
        <div className="absolute inset-0 bg-paper/55" />
        <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
          {board.cells.map((_, i) => (
            <div key={i} className={((Math.floor(i / n) + (i % n)) % 2 ? 'bg-paper/30' : 'bg-panel/20')} />
          ))}
        </div>
        {board.cells.map((p, i) => {
          if (!p) return null
          const r = Math.floor(i / n), c = i % n
          const sel = selected === i
          const hinted = hint && (hint[0] === i || hint[1] === i)
          const popping = clearing.has(i)
          return (
            <div
              key={p.id}
              className="absolute top-0 left-0 p-[3%]"
              style={{
                width: `${100 / n}%`, height: `${100 / n}%`,
                transform: `translate(${c * 100}%, ${r * 100}%)`,
                transition: `transform ${SWAP_MS}ms ease-in`,
                zIndex: sel ? 3 : isCrate(p) ? 2 : 1,
                fontSize: `${46 / n}cqw`,
              }}
            >
              <button
                type="button"
                data-cell={i}
                data-t={p.t}
                data-sp={p.sp ?? ''}
                aria-label={isCrate(p) ? 'crate' : p.sp ? `${p.sp} ${tiles[p.t]?.label ?? ''}` : tiles[p.t]?.label}
                onPointerDown={e => { if (!isCrate(p)) drag.current = { i, x: e.clientX, y: e.clientY } }}
                onClick={() => { if (swiped.current) { swiped.current = false; return } tap(i) }}
                className={`w-full h-full block transition-transform duration-150
                  ${fresh.has(p.id) ? 'm3-drop' : ''} ${popping ? 'm3-pop' : ''} ${hinted && !popping ? 'm3-hint' : ''}
                  ${sel ? 'scale-110 brightness-125 drop-shadow-lg' : ''}`}
              >
                <PieceFace p={p} tile={tiles[p.t]} />
              </button>
            </div>
          )
        })}
        {combo && (
          <div key={combo.key} className="m3-combo absolute left-1/2 top-[38%] z-10 pointer-events-none px-3 py-1 rounded-full bg-accent text-accent-fg font-bold shadow-lg text-lg">
            Combo ×{combo.n}!
          </div>
        )}
      </div>

      <p className="text-muted text-[10px] text-center min-h-[1.25rem]">
        {settled ? '' : notice ?? (selected !== null ? 'Tap or swipe to a neighbour to swap' : `${m + 1} in a line → line clearer · ${m + 2} → trade caravan${(rules.axis ?? 'both') === 'both' || rules.diagonal ? ' · L/T → blast' : ''}`)}
      </p>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="Trade complete!" loseTitle="Out of moves" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
