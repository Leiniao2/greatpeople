// Gold Dig: a field of stone hides one gold vein whose outline the assayer
// has sketched for you.  Every strike cracks stone:
//   · a hammer cracks one cell, a pick three in a line, dynamite a 3×3 patch;
//   · cracked stone shows a trace reading, the distance in cells (counting
//     diagonals as one) to the nearest gold, so a 1 sits right beside gold;
//   · from D2, dynamite shatters any gold it reaches and the find is lost;
//   · from D3 the vein may lie turned, and granite outcrops (never holding
//     gold) resist hammer and pick: only dynamite cracks them.
// You win once every gold cell is cracked.  Each level is generated from its
// seed and kept only if a cautious greedy prospector, who never risks the
// gold, wins against the real vein and against a sample of others the field
// could have hidden, so a win never needs a lucky first swing.

import type { Difficulty } from '@/games/types'
import { mulberry32, randInt, shuffle, type Rng } from '../_shared/rng'

/** Cells are numbered row by row: r * n + c. */
export type Cell = number
export type Tool = 'hammer' | 'pick' | 'dynamite'
export type Dir = 'h' | 'v'
export type Kit = Record<Tool, number>
export interface Action { tool: Tool; cell: Cell; dir?: Dir }

export const TOOLS: Tool[] = ['hammer', 'pick', 'dynamite']

// ── Themes (config ids) ─────────────────────────────────────────────────────

export interface Theme { title: string; blurb: string; fact: string }

export const THEMES = {
  'sutters-mill': {
    title: "Sutter's Mill, 1848",
    blurb: 'Flakes glint in the mill race at Coloma. Follow the traces to the vein before word gets out.',
    fact: "On 24 January 1848 James Marshall spotted flakes of gold in the tailrace of the sawmill he was building for John Sutter at Coloma. Within two years about 300,000 people had come to California.",
  },
  klondike: {
    title: 'Bonanza Creek, 1896',
    blurb: 'Frozen gravel on a Klondike claim. Every stick of powder and every swing counts this far north.',
    fact: 'In August 1896 George Carmack, Skookum Jim and Dawson Charlie found gold on Rabbit Creek, soon renamed Bonanza Creek. About 100,000 people set out for the Klondike; only some 30,000 to 40,000 reached Dawson City.',
  },
  'welcome-stranger': {
    title: 'Moliagul, Victoria, 1869',
    blurb: 'Two Cornish miners work the roots of a tree at Moliagul. Something very large lies close to the surface.',
    fact: 'On 5 February 1869 John Deason and Richard Oates dug up the Welcome Stranger at Moliagul, Victoria, only a few centimetres down at the roots of a tree. At about 72 kg gross it is still the largest alluvial gold nugget ever found.',
  },
  witwatersrand: {
    title: 'The Witwatersrand, 1886',
    blurb: 'A reef of gold-bearing conglomerate on the farm Langlaagte. Granite outcrops break the ridge.',
    fact: 'In 1886 George Harrison found the Main Reef on the farm Langlaagte. Johannesburg was founded that same year, and the Witwatersrand basin has yielded more gold than any other place on Earth.',
  },
  'wadi-hammamat': {
    title: "The Pharaoh's Gold Map",
    blurb: "Pharaoh's quarrymen search the desert hills of Wadi Hammamat for the gold the old map promises.",
    fact: 'The Turin Papyrus Map, drawn around 1160 BC for an expedition under Ramesses IV, shows the gold mines and quarries of Wadi Hammamat. It is one of the oldest known geological maps.',
  },
} satisfies Record<string, Theme>

export type ThemeKey = keyof typeof THEMES
export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[]

// ── Tiers ───────────────────────────────────────────────────────────────────

export interface Tier {
  size: number
  /** Cells in the vein, inclusive range. */
  vein: [number, number]
  /** The vein may lie in any of its four turns. */
  turns: boolean
  /** Dynamite shatters gold it reaches. */
  shatter: boolean
  /** Granite outcrops: only dynamite cracks them, and they never hold gold. */
  granite: number
  kit: Kit
  /** Seconds on the clock (0: none). */
  seconds: number
}

export const TIERS: Record<Difficulty, Tier> = {
  1: { size: 10, vein: [3, 4], turns: false, shatter: false, granite: 0,  kit: { hammer: 1, pick: 2, dynamite: 1 }, seconds: 0 },
  2: { size: 10, vein: [4, 5], turns: false, shatter: true,  granite: 0,  kit: { hammer: 2, pick: 2, dynamite: 1 }, seconds: 0 },
  3: { size: 11, vein: [5, 5], turns: true,  shatter: true,  granite: 10, kit: { hammer: 2, pick: 2, dynamite: 2 }, seconds: 240 },
  4: { size: 12, vein: [5, 6], turns: true,  shatter: true,  granite: 16, kit: { hammer: 3, pick: 2, dynamite: 2 }, seconds: 210 },
}

// ── Level ───────────────────────────────────────────────────────────────────

export interface Level {
  theme: ThemeKey
  difficulty: Difficulty
  size: number
  /** The assayer's sketch: the vein's outline as [row, col] offsets. */
  shape: [number, number][]
  turns: boolean
  shatter: boolean
  granite: Cell[]
  gold: Cell[]
  kit: Kit
  seconds: number
  /** The greedy prospector's winning strikes against this vein. */
  plan: Action[]
}

type Field = Pick<Level, 'size' | 'granite' | 'gold' | 'shatter'>

/** The cells a strike reaches, clipped to the field. */
export function zone(n: number, a: Action): Cell[] {
  const r = Math.floor(a.cell / n), c = a.cell % n
  const out: Cell[] = []
  const add = (rr: number, cc: number) => { if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc) }
  if (a.tool === 'hammer') add(r, c)
  else if (a.tool === 'pick') for (let k = -1; k <= 1; k++) a.dir === 'v' ? add(r + k, c) : add(r, c + k)
  else for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) add(r + dr, c + dc)
  return out
}

/** Chebyshev distance from a cell to the nearest of `cells` (0 on one of them). */
export function distance(n: number, cell: Cell, cells: readonly Cell[]): number {
  const r = Math.floor(cell / n), c = cell % n
  let best = Infinity
  for (const g of cells) best = Math.min(best, Math.max(Math.abs(Math.floor(g / n) - r), Math.abs(g % n - c)))
  return best
}

export const reading = (f: Field, cell: Cell) => distance(f.size, cell, f.gold)

// ── Playing state ───────────────────────────────────────────────────────────

export interface Dig {
  /** 1 where the stone is cracked. */
  cracked: Uint8Array
  kit: Kit
  /** Gold cells dynamite has destroyed. */
  shattered: Cell[]
}

export const startDig = (lv: Pick<Level, 'size' | 'kit'>): Dig =>
  ({ cracked: new Uint8Array(lv.size * lv.size), kit: { ...lv.kit }, shattered: [] })

/** The cells a strike would newly crack. */
export function crackable(f: Field, cracked: Uint8Array, a: Action, granite = new Set(f.granite)): Cell[] {
  return zone(f.size, a).filter(k => !cracked[k] && (a.tool === 'dynamite' || !granite.has(k)))
}

/** Apply a strike; null when the tool is used up or it would crack nothing. */
export function strike(f: Field, dig: Dig, a: Action): Dig | null {
  if (dig.kit[a.tool] <= 0) return null
  const cells = crackable(f, dig.cracked, a)
  if (!cells.length) return null
  const cracked = dig.cracked.slice()
  for (const k of cells) cracked[k] = 1
  const gold = new Set(f.gold)
  const shattered = a.tool === 'dynamite' && f.shatter ? cells.filter(k => gold.has(k)) : []
  return { cracked, kit: { ...dig.kit, [a.tool]: dig.kit[a.tool] - 1 }, shattered: [...dig.shattered, ...shattered] }
}

export interface Status { found: number; outcome: 'won' | 'lost' | null; reason?: string }

export function digStatus(f: Field, dig: Dig): Status {
  const found = f.gold.filter(k => dig.cracked[k] && !dig.shattered.includes(k)).length
  if (dig.shattered.length) return { found, outcome: 'lost', reason: 'the dynamite shattered the gold' }
  if (found === f.gold.length) return { found, outcome: 'won' }
  const canDig = dig.kit.hammer + dig.kit.pick + (f.shatter ? 0 : dig.kit.dynamite)
  if (!canDig) return { found, outcome: 'lost', reason: 'no tools left to dig the gold' }
  return { found, outcome: null }
}

// ── Vein shapes and placements ──────────────────────────────────────────────

type Shape = [number, number][]

function normalise(s: Shape): Shape {
  const r0 = Math.min(...s.map(p => p[0])), c0 = Math.min(...s.map(p => p[1]))
  return s.map(([r, c]) => [r - r0, c - c0] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

/** A random connected shape of `k` cells. */
function grow(rng: Rng, k: number): Shape {
  const cells: Shape = [[0, 0]]
  const has = (r: number, c: number) => cells.some(p => p[0] === r && p[1] === c)
  while (cells.length < k) {
    const [r, c] = cells[Math.floor(rng() * cells.length)]
    const [dr, dc] = [[-1, 0], [1, 0], [0, -1], [0, 1]][Math.floor(rng() * 4)]
    if (!has(r + dr, c + dc)) cells.push([r + dr, c + dc])
  }
  return normalise(cells)
}

export function orientations(shape: Shape, turns: boolean): Shape[] {
  const out: Shape[] = []
  const seen = new Set<string>()
  let s = normalise(shape)
  for (let t = 0; t < (turns ? 4 : 1); t++) {
    const key = JSON.stringify(s)
    if (!seen.has(key)) { seen.add(key); out.push(s) }
    s = normalise(s.map(([r, c]) => [c, -r] as [number, number]))
  }
  return out
}

/** Every way the vein could lie in the field, as sorted cell lists. */
export function placements(n: number, shape: Shape, turns: boolean, granite: readonly Cell[]): Cell[][] {
  const g = new Set(granite)
  const out: Cell[][] = []
  for (const o of orientations(shape, turns)) {
    const h = Math.max(...o.map(p => p[0])) + 1, w = Math.max(...o.map(p => p[1])) + 1
    for (let r = 0; r + h <= n; r++) for (let c = 0; c + w <= n; c++) {
      const cells = o.map(([dr, dc]) => (r + dr) * n + c + dc)
      if (!cells.some(k => g.has(k))) out.push(cells.sort((a, b) => a - b))
    }
  }
  return out
}

// ── The greedy prospector ───────────────────────────────────────────────────

interface Ctx {
  n: number
  granite: Set<Cell>
  shatter: boolean
  hyps: Cell[][]
  /** Per placement: the reading every cell would show (0 on gold). */
  dist: Uint8Array[]
}

function context(n: number, granite: readonly Cell[], shatter: boolean, hyps: Cell[][]): Ctx {
  const dist = hyps.map(cells => {
    const d = new Uint8Array(n * n)
    for (let k = 0; k < n * n; k++) d[k] = distance(n, k, cells)
    return d
  })
  return { n, granite: new Set(granite), shatter, hyps, dist }
}

const ACTIONS = (n: number, kit: Kit): Action[] => {
  const out: Action[] = []
  for (let cell = 0; cell < n * n; cell++) {
    if (kit.dynamite > 0) out.push({ tool: 'dynamite', cell })
    if (kit.pick > 0) out.push({ tool: 'pick', cell, dir: 'h' }, { tool: 'pick', cell, dir: 'v' })
    if (kit.hammer > 0) out.push({ tool: 'hammer', cell })
  }
  return out
}

const newCells = (ctx: Ctx, cracked: Uint8Array, a: Action) =>
  zone(ctx.n, a).filter(k => !cracked[k] && (a.tool === 'dynamite' || !ctx.granite.has(k)))

/** The strike that leaves the fewest placements in the worst case, never risking the gold. */
function bestProbe(ctx: Ctx, cracked: Uint8Array, kit: Kit, H: number[]): Action | null {
  const minLeft = Math.min(...H.map(h => ctx.hyps[h].filter(k => !cracked[k]).length))
  let best: Action | null = null, bw = Infinity, bs = Infinity, bc = Infinity
  const cost: Record<Tool, number> = { dynamite: ctx.shatter ? 0 : 2, pick: 1, hammer: 1.5 }
  for (const a of ACTIONS(ctx.n, kit)) {
    const cells = newCells(ctx, cracked, a)
    if (!cells.length) continue
    if (a.tool === 'dynamite' && ctx.shatter && H.some(h => cells.some(k => ctx.dist[h][k] === 0))) continue
    const after = { ...kit, [a.tool]: kit[a.tool] - 1 }
    if (after.hammer + 3 * after.pick + (ctx.shatter ? 0 : 9 * after.dynamite) < minLeft - (a.tool === 'dynamite' && ctx.shatter ? 0 : cells.length)) continue
    const parts = new Map<number, number>()
    for (const h of H) {
      let key = 0
      for (const k of cells) key = key * 16 + ctx.dist[h][k]
      parts.set(key, (parts.get(key) ?? 0) + 1)
    }
    let w = 0, s = 0
    for (const v of parts.values()) { w = Math.max(w, v); s += v * v }
    if (w < bw || (w === bw && (s < bs || (s === bs && cost[a.tool] < bc)))) { best = a; bw = w; bs = s; bc = cost[a.tool] }
  }
  return best
}

/** Strikes that crack every remaining gold cell of a known vein, or null. */
function finish(ctx: Ctx, cracked: Uint8Array, kit: Kit, gold: Cell[]): Action[] | null {
  const left = gold.filter(k => !cracked[k])
  if (!left.length) return []
  const g = left[0], n = ctx.n, r = Math.floor(g / n), c = g % n
  const tries: Action[] = []
  if (!ctx.shatter && kit.dynamite > 0) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const rr = r + dr, cc = c + dc
    if (rr >= 0 && rr < n && cc >= 0 && cc < n) tries.push({ tool: 'dynamite', cell: rr * n + cc })
  }
  if (kit.pick > 0) for (let k = -1; k <= 1; k++) {
    if (c + k >= 0 && c + k < n) tries.push({ tool: 'pick', cell: r * n + c + k, dir: 'h' })
    if (r + k >= 0 && r + k < n) tries.push({ tool: 'pick', cell: (r + k) * n + c, dir: 'v' })
  }
  if (kit.hammer > 0) tries.push({ tool: 'hammer', cell: g })
  const set = new Set(left)
  const gain = (a: Action) => newCells(ctx, cracked, a).filter(k => set.has(k)).length
  tries.sort((a, b) => gain(b) - gain(a))
  for (const a of tries) {
    const next = cracked.slice()
    for (const k of newCells(ctx, cracked, a)) next[k] = 1
    const rest = finish(ctx, next, { ...kit, [a.tool]: kit[a.tool] - 1 }, gold)
    if (rest) return [a, ...rest]
  }
  return null
}

/**
 * Play the greedy prospector against placement `truth`.  Probes are cached by
 * position so runs against different veins share their opening.
 */
function play(ctx: Ctx, kit0: Kit, truth: number, cache: Map<string, Action | null>): Action[] | null {
  let cracked = new Uint8Array(ctx.n * ctx.n)
  let kit = { ...kit0 }
  let H = ctx.hyps.map((_, i) => i)
  const gold = ctx.hyps[truth]
  const plan: Action[] = []
  for (;;) {
    if (gold.every(k => cracked[k])) return plan
    if (H.length === 1) {
      const rest = finish(ctx, cracked, kit, gold)
      return rest ? [...plan, ...rest] : null
    }
    const key = `${kit.hammer}${kit.pick}${kit.dynamite}:${H.join(',')}`
    let a = cache.get(key)
    if (a === undefined) { a = bestProbe(ctx, cracked, kit, H); cache.set(key, a) }
    if (!a) return null
    const cells = newCells(ctx, cracked, a)
    if (a.tool === 'dynamite' && ctx.shatter && cells.some(k => ctx.dist[truth][k] === 0)) return null
    cracked = cracked.slice()
    for (const k of cells) cracked[k] = 1
    kit = { ...kit, [a.tool]: kit[a.tool] - 1 }
    H = H.filter(h => cells.every(k => ctx.dist[h][k] === ctx.dist[truth][k]))
    plan.push(a)
  }
}

/** Play the greedy prospector on a finished level (for tests and hints). */
export function greedy(lv: Level, gold: Cell[] = lv.gold): Action[] | null {
  const hyps = placements(lv.size, lv.shape, lv.turns, lv.granite)
  const truth = hyps.findIndex(h => h.join() === [...gold].sort((a, b) => a - b).join())
  if (truth < 0) return null
  return play(context(lv.size, lv.granite, lv.shatter, hyps), lv.kit, truth, new Map())
}

/** How many other placements each fairness check plays against. */
export const FAIR_SAMPLE = 8

export function makeLevel(configId: string, difficulty: Difficulty, seed: number): Level {
  const theme = (configId in THEMES ? configId : THEME_KEYS[0]) as ThemeKey
  const tier = TIERS[difficulty]
  const n = tier.size
  for (let attempt = 0; ; attempt++) {
    const rng = mulberry32(seed + attempt * 7919)
    // After many misses, hand over an extra hammer rather than loop forever.
    const kit = { ...tier.kit, hammer: tier.kit.hammer + Math.floor(attempt / 40) }
    const shape = grow(rng, randInt(rng, tier.vein[0], tier.vein[1]))
    if (Math.max(...shape.map(p => p[0])) > 3 || Math.max(...shape.map(p => p[1])) > 3) continue
    const granite = scatterGranite(rng, n, tier.granite)
    const hyps = placements(n, shape, tier.turns, granite)
    if (hyps.length < 40) continue
    // No cell may be gold in too many placements, so a blind strike is a guess.
    const occ = new Uint16Array(n * n)
    for (const h of hyps) for (const k of h) occ[k]++
    if (Math.max(...occ) > hyps.length / 4) continue
    const ctx = context(n, granite, tier.shatter, hyps)
    const cache = new Map<string, Action | null>()
    const truth = Math.floor(rng() * hyps.length)
    const plan = play(ctx, kit, truth, cache)
    if (!plan || plan.length < 3) continue
    const others = shuffle(hyps.map((_, i) => i).filter(i => i !== truth), rng).slice(0, FAIR_SAMPLE)
    if (!others.every(i => play(ctx, kit, i, cache))) continue
    const turned = tier.turns ? orientations(shape, true)[0] : shape
    return {
      theme, difficulty, size: n, shape: turned, turns: tier.turns, shatter: tier.shatter,
      granite, gold: hyps[truth], kit, seconds: tier.seconds, plan,
    }
  }
}

/** Granite in small outcrops, kept off the field's edge rows so it breaks up the middle. */
function scatterGranite(rng: Rng, n: number, count: number): Cell[] {
  const out = new Set<Cell>()
  while (out.size < count) {
    let r = randInt(rng, 1, n - 2), c = randInt(rng, 1, n - 2)
    const len = randInt(rng, 2, 4)
    for (let i = 0; i < len && out.size < count; i++) {
      out.add(r * n + c)
      if (rng() < 0.5) r = Math.min(n - 2, Math.max(1, r + (rng() < 0.5 ? -1 : 1)))
      else c = Math.min(n - 2, Math.max(1, c + (rng() < 0.5 ? -1 : 1)))
    }
  }
  return [...out].sort((a, b) => a - b)
}

export const fingerprint = (lv: Level) => `${lv.size}|${lv.gold.join(',')}|${lv.granite.join(',')}`
