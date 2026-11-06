// Gold Dig: a field of stone hides a few gold nuggets, some large enough to
// span many cells.  Every strike cracks stone and shows only what is under it,
// gold or empty rock:
//   · a hammer cracks one cell, a pick three in a line, dynamite a 3×3 patch;
//   · from D2, dynamite shatters any gold it reaches and that gold is lost;
//   · from D3, granite outcrops (never holding gold) resist hammer and pick:
//     only dynamite cracks them.
// You win once you have dug out the assayer's target weight of gold.  The kit
// is small, so the game is in hunting widely, then following a find along
// the nugget with the cheap tools.  Each level is generated from its seed and
// kept only if a hunt-and-follow prospector wins it.

import type { Difficulty } from '@/games/types'
import { mulberry32, randInt, type Rng } from '../_shared/rng'

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
    blurb: 'Flakes glint in the mill race at Coloma. Find the nuggets in the gravel before word gets out.',
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
  /** Cell counts of the nuggets, each an inclusive range. */
  nuggets: [number, number][]
  /** Share of all the gold you must dig out. */
  target: number
  /** Dynamite shatters gold it reaches. */
  shatter: boolean
  /** Granite outcrops: only dynamite cracks them, and they never hold gold. */
  granite: number
  kit: Kit
  /** Seconds on the clock (0: none). */
  seconds: number
}

export const TIERS: Record<Difficulty, Tier> = {
  1: { size: 10, nuggets: [[8, 10], [4, 5]],                 target: 0.5,  shatter: false, granite: 0,  kit: { hammer: 5, pick: 5, dynamite: 3 }, seconds: 0 },
  2: { size: 10, nuggets: [[7, 9], [4, 5], [3, 3]],          target: 0.5,  shatter: true,  granite: 0,  kit: { hammer: 7, pick: 7, dynamite: 3 }, seconds: 0 },
  3: { size: 11, nuggets: [[7, 9], [4, 5], [3, 4]],          target: 0.45, shatter: true,  granite: 10, kit: { hammer: 7, pick: 7, dynamite: 4 }, seconds: 240 },
  4: { size: 12, nuggets: [[6, 8], [5, 6], [3, 4], [3, 3]],  target: 0.4,  shatter: true,  granite: 16, kit: { hammer: 8, pick: 8, dynamite: 4 }, seconds: 210 },
}

// ── Level ───────────────────────────────────────────────────────────────────

export interface Level {
  theme: ThemeKey
  difficulty: Difficulty
  size: number
  shatter: boolean
  granite: Cell[]
  /** Every gold cell, sorted. */
  gold: Cell[]
  /** The nuggets, each a sorted list of its cells. */
  nuggets: Cell[][]
  /** Gold cells to dig out to win. */
  target: number
  kit: Kit
  seconds: number
  /** The prospector's winning strikes on this field. */
  plan: Action[]
}

type Field = Pick<Level, 'size' | 'granite' | 'gold' | 'shatter' | 'target'>

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
export function crackable(f: Pick<Field, 'size' | 'granite'>, cracked: Uint8Array, a: Action, granite = new Set(f.granite)): Cell[] {
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

export interface Status { found: number; lost: number; outcome: 'won' | 'lost' | null; reason?: string }

export function digStatus(f: Field, dig: Dig): Status {
  const lostSet = new Set(dig.shattered)
  const found = f.gold.filter(k => dig.cracked[k] && !lostSet.has(k)).length
  const lost = lostSet.size
  if (found >= f.target) return { found, lost, outcome: 'won' }
  if (f.gold.length - lost < f.target) return { found, lost, outcome: 'lost', reason: 'the dynamite shattered too much gold' }
  const canDig = dig.kit.hammer + dig.kit.pick + (f.shatter ? 0 : dig.kit.dynamite)
  if (!canDig) return { found, lost, outcome: 'lost', reason: 'no tools left to dig the gold' }
  return { found, lost, outcome: null }
}

// ── The prospector ──────────────────────────────────────────────────────────
// Hunt wide until a strike turns up gold, then follow the find with the
// cheapest tool that reaches the most of the cells beside it.  It never
// blasts beside known gold when dynamite shatters, and keeps a hammer back
// while hunting so a find can be followed.

const NEIGH: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

function candidates(n: number, kit: Kit): Action[] {
  const out: Action[] = []
  for (let cell = 0; cell < n * n; cell++) {
    if (kit.dynamite > 0) out.push({ tool: 'dynamite', cell })
    if (kit.pick > 0) out.push({ tool: 'pick', cell, dir: 'h' }, { tool: 'pick', cell, dir: 'v' })
    if (kit.hammer > 0) out.push({ tool: 'hammer', cell })
  }
  return out
}

function nextStrike(f: Field, dig: Dig): Action | null {
  const n = f.size, gold = new Set(f.gold), granite = new Set(f.granite)
  const seen = (k: Cell) => !!dig.cracked[k]
  const known = (k: Cell) => seen(k) && gold.has(k)
  // Cells beside known gold, weighted by how much known gold touches them.
  const lead = new Float32Array(n * n)
  for (let k = 0; k < n * n; k++) {
    if (seen(k) || granite.has(k)) continue
    const r = Math.floor(k / n), c = k % n
    for (const [dr, dc] of NEIGH) {
      const rr = r + dr, cc = c + dc
      if (rr >= 0 && rr < n && cc >= 0 && cc < n && known(rr * n + cc)) lead[k] += 1
    }
  }
  const following = lead.some(v => v > 0)
  // Hunting value: unknown cells far from empty cracked rock are likelier gold.
  const hunt = new Float32Array(n * n)
  if (!following) for (let k = 0; k < n * n; k++) {
    if (seen(k) || granite.has(k)) continue
    const r = Math.floor(k / n), c = k % n
    let near = 0
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc
      if (rr >= 0 && rr < n && cc >= 0 && cc < n && seen(rr * n + cc) && !gold.has(rr * n + cc)) near++
    }
    hunt[k] = 1 / (1 + near)
  }
  const cost: Record<Tool, number> = { hammer: 1, pick: 1.6, dynamite: f.shatter ? 3 : 2.4 }
  let best: Action | null = null, bestScore = 0
  for (const a of candidates(n, dig.kit)) {
    const cells = crackable(f, dig.cracked, a, granite)
    if (!cells.length) continue
    if (a.tool === 'dynamite' && f.shatter && following) continue
    // While hunting, keep a hammer back to follow up a find.
    if (!following && a.tool === 'hammer' && dig.kit.hammer <= 1 && dig.kit.pick + (f.shatter ? 0 : dig.kit.dynamite) > 0) continue
    let v = 0
    for (const k of cells) v += following ? lead[k] : hunt[k]
    const score = v / cost[a.tool]
    if (score > bestScore + 1e-6) { best = a; bestScore = score }
  }
  return best
}

/** Play the prospector to the end; the strikes if it wins, else null. */
export function prospect(f: Field, kit: Kit): Action[] | null {
  let dig = startDig({ size: f.size, kit })
  const plan: Action[] = []
  for (;;) {
    const st = digStatus(f, dig)
    if (st.outcome === 'won') return plan
    if (st.outcome === 'lost') return null
    const a = nextStrike(f, dig)
    if (!a) return null
    dig = strike(f, dig, a)!
    plan.push(a)
  }
}

/** A player who swings each tool at random cells: should rarely win. */
export function blindPlay(f: Field, kit: Kit, rng: Rng): boolean {
  let dig = startDig({ size: f.size, kit })
  for (let guard = 0; guard < 200; guard++) {
    const st = digStatus(f, dig)
    if (st.outcome) return st.outcome === 'won'
    const tools = TOOLS.filter(t => dig.kit[t] > 0 && !(t === 'dynamite' && f.shatter && dig.kit.hammer + dig.kit.pick > 0))
    if (!tools.length) return false
    const a: Action = { tool: tools[Math.floor(rng() * tools.length)], cell: Math.floor(rng() * f.size * f.size), dir: rng() < 0.5 ? 'h' : 'v' }
    dig = strike(f, dig, a) ?? dig
  }
  return false
}

// ── Fields ──────────────────────────────────────────────────────────────────

/** A compact connected nugget of `k` cells, as [row, col] offsets. */
function grow(rng: Rng, k: number): [number, number][] {
  const cells: [number, number][] = [[0, 0]]
  const has = (r: number, c: number) => cells.some(p => p[0] === r && p[1] === c)
  while (cells.length < k) {
    // Prefer spots touching more of the nugget, so it comes out chunky.
    const opts: { r: number; c: number; w: number }[] = []
    for (const [r, c] of cells) for (const [dr, dc] of NEIGH) {
      const rr = r + dr, cc = c + dc
      if (has(rr, cc)) continue
      const touch = NEIGH.filter(([a, b]) => has(rr + a, cc + b)).length
      opts.push({ r: rr, c: cc, w: touch * touch })
    }
    let t = rng() * opts.reduce((s, o) => s + o.w, 0)
    const o = opts.find(o => (t -= o.w) <= 0) ?? opts[opts.length - 1]
    cells.push([o.r, o.c])
  }
  const r0 = Math.min(...cells.map(p => p[0])), c0 = Math.min(...cells.map(p => p[1]))
  return cells.map(([r, c]) => [r - r0, c - c0])
}

/** Place the nuggets apart from each other (no shared edge or corner) and off granite. */
function layNuggets(rng: Rng, n: number, sizes: number[], granite: Set<Cell>): Cell[][] | null {
  const taken = new Set<Cell>()
  const out: Cell[][] = []
  for (const k of sizes) {
    let placed: Cell[] | null = null
    for (let tries = 0; tries < 60 && !placed; tries++) {
      const shape = grow(rng, k)
      const h = Math.max(...shape.map(p => p[0])) + 1, w = Math.max(...shape.map(p => p[1])) + 1
      if (h > n || w > n) continue
      const r = randInt(rng, 0, n - h), c = randInt(rng, 0, n - w)
      const cells = shape.map(([dr, dc]) => (r + dr) * n + c + dc)
      const clash = cells.some(cell => {
        if (granite.has(cell)) return true
        const rr = Math.floor(cell / n), cc = cell % n
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          const y = rr + a, x = cc + b
          if (y >= 0 && y < n && x >= 0 && x < n && taken.has(y * n + x)) return true
        }
        return false
      })
      if (!clash) placed = cells.sort((a, b) => a - b)
    }
    if (!placed) return null
    for (const cell of placed) taken.add(cell)
    out.push(placed)
  }
  return out
}

export function makeLevel(configId: string, difficulty: Difficulty, seed: number): Level {
  const theme = (configId in THEMES ? configId : THEME_KEYS[0]) as ThemeKey
  const tier = TIERS[difficulty]
  const n = tier.size
  for (let attempt = 0; ; attempt++) {
    const rng = mulberry32(seed + attempt * 7919)
    // After many misses, hand over an extra hammer rather than loop forever.
    const kit = { ...tier.kit, hammer: tier.kit.hammer + Math.floor(attempt / 60) }
    const granite = scatterGranite(rng, n, tier.granite)
    const sizes = tier.nuggets.map(([a, b]) => randInt(rng, a, b))
    const nuggets = layNuggets(rng, n, sizes, new Set(granite))
    if (!nuggets) continue
    const gold = nuggets.flat().sort((a, b) => a - b)
    const target = Math.ceil(gold.length * tier.target)
    const f: Field = { size: n, granite, gold, shatter: tier.shatter, target }
    const plan = prospect(f, kit)
    if (!plan || plan.length < 4) continue
    return { theme, difficulty, size: n, shatter: tier.shatter, granite, gold, nuggets, target, kit, seconds: tier.seconds, plan }
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

/** A random field of the tier, for measuring how fair a kit is. */
export function randomField(difficulty: Difficulty, seed: number): Field {
  const tier = TIERS[difficulty]
  for (let attempt = 0; ; attempt++) {
    const rng = mulberry32(seed * 31 + attempt)
    const granite = scatterGranite(rng, tier.size, tier.granite)
    const nuggets = layNuggets(rng, tier.size, tier.nuggets.map(([a, b]) => randInt(rng, a, b)), new Set(granite))
    if (!nuggets) continue
    const gold = nuggets.flat().sort((a, b) => a - b)
    return { size: tier.size, granite, gold, shatter: tier.shatter, target: Math.ceil(gold.length * tier.target) }
  }
}

export const fingerprint = (lv: Level) => `${lv.size}|${lv.gold.join(',')}|${lv.granite.join(',')}`
