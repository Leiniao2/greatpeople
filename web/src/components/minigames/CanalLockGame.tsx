import { useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, pick, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Canal Locks — work boats up and down a flight of locks.  The canal is a
// chain of sites from the low reach (left) to the high reach (right):
// fixed-level reaches and pounds, lock chambers that are either low or high,
// and (Dutch variant) inclined planes with two counterweighted cradles.
//
//   • A paddle in a gate lets water through: a chamber next to a pound or
//     reach takes that level; between two staircase chambers the upper one
//     can only empty into the lower one if the lower one is empty.
//   • A boat may pass a gate only when the water on both sides is level —
//     trying otherwise floods the gate and counts as a mistake.
//   • Each chamber (or cradle) holds a limited load; boats are size 1 or 2.
//   • Every fill from a pound or reach costs a lockful of water.
//
// Variants (each a different rule twist, not just a bigger flight):
//   grand-canal   pound locks with pounds between; the summit holds only a
//                 few lockfuls — pair up- and down-boats to reuse water.
//   canal-du-midi staircase: chambers share gates, water cascades chamber to
//                 chamber, boats cannot pass inside the stair.
//   panama        3-step staircase, chambers hold 2 — a big ship fills a
//                 chamber, two small ones can share a lift.
//   dutch-overtoom inclined planes: two cradles balance each other; a haul is
//                 free when the descending cradle is at least as heavy,
//                 otherwise the horse winch costs 3 moves.
//
//   D1  ~10–16 moves (≈1 min)    D2 ~14–24 (≈1.5 min)
//   D3  ~20–32 (≈2–2.5 min)      D4 ~26–40 (≈3 min); move cap tightens per tier.
//
// Every instance is generated from the seed and checked by the Dijkstra/BFS
// solver below; `par` is the optimal move count and the cap is derived from it.

interface CanalConfig {
  title: string
  intro: string
  fact: string
  water: string
  stone: string
}

export const CONFIGS: Record<string, CanalConfig> = {
  'grand-canal': {
    title: 'Qiao Weiyue’s Pound Locks',
    intro: 'Pass the grain barges through the pound locks of the Grand Canal. Water from the summit is scarce: every fill costs a lockful, so let a down-barge ride a chamber an up-barge has just filled.',
    fact: 'In 984 the official Qiao Weiyue built the first recorded pound lock on the Grand Canal near Huai’an: two gates about 50 paces apart, closing a chamber that was filled and emptied through sluices — replacing the double slipways where heavy grain barges had often been wrecked.',
    water: '#6aa5c8', stone: '#b9a27a',
  },
  'albarradon-1449': {
    title: 'The Great Dike of Tenochtitlan',
    intro: 'The new dike holds the salt lake back from the fresh lagoon round the city, and canoes pass its gates between waters of different level. Bring the tribute canoes through both ways. Fresh water is precious: every fill costs a gateful, so let a canoe going down ride a chamber one coming up has just filled.',
    fact: 'After the floods of 1449, Motecuhzoma I had Nezahualcoyotl of Texcoco build a dike of stakes, stone and earth some 16 km long across the lake. Its sluice gates held back the brackish water of Lake Texcoco and kept the lagoon around Tenochtitlan fresh enough for its chinampa gardens.',
    water: '#5f9fae', stone: '#a89a7a',
  },
  'trent-and-mersey': {
    title: 'The Grand Trunk',
    intro: 'Work the narrowboats of crated ware and Cornish clay through the narrow locks below the Harecastle summit. Summit water is scarce: every fill costs a lockful, so let a boat going down ride a chamber one coming up has just filled.',
    fact: 'Wedgwood cut the first sod of the Trent and Mersey Canal in 1766 and built his Etruria works on its bank. Engineered by James Brindley, it opened in 1777 with the 2.6 km Harecastle tunnel through the summit, and carried clay in and fragile ware out at a fraction of the cost of packhorses.',
    water: '#6b9bb0', stone: '#b3916b',
  },
  'canal-du-midi': {
    title: 'The Fonserannes Staircase',
    intro: 'The chambers of a staircase share their gates — there are no pounds to pass in. A chamber can only empty into the one below once that one is empty. Schedule boats both ways up the stair.',
    fact: 'Pierre-Paul Riquet’s Canal du Midi (completed 1681) climbs the Fonserannes staircase near Béziers: eight chambers and nine gates lifting boats about 21.5 m in some 300 m.',
    water: '#5f9fae', stone: '#c9b08a',
  },
  panama: {
    title: 'The Gatun Locks',
    intro: 'Lift ships through Panama’s stepped locks. Each chamber holds two units: a big ship fills a chamber alone, two small ones can share a lift. Pair them well.',
    fact: 'The Gatun Locks of the Panama Canal (opened 1914) raise ships about 26 m to Gatun Lake in three steps. Every ship that passes uses roughly 200 million litres of fresh water, which flows out to the sea.',
    water: '#4f93c4', stone: '#a7a9a4',
  },
  'dutch-overtoom': {
    title: 'Overtoom and Inclined Plane',
    intro: 'Boats ride cradles up and down the inclined planes. The two cradles balance each other: a haul is free when the descending cradle is at least as heavy, otherwise the horse winch costs 3 moves.',
    fact: 'Medieval Dutch towns used an overtoom: a greased slope over a dam where boats were winched between waters of different level — Amsterdam’s Overtoom street is named after one. The idea grew into railed inclined planes like those of the Elbląg Canal (1860), where boats still cross dry hills on cradles.',
    water: '#6b9fbd', stone: '#9fae84',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Model ─────────────────────────────────────────────────────────────────────

export type Kind = 'reach' | 'pound' | 'chamber' | 'plane'
export interface Site { kind: Kind; cap: number; lo: number; hi: number }
export interface Boat { up: boolean; size: number; label: string }

export interface CanalState {
  /** Per site: chamber 1 = high; plane 1 = cradle 0 is at the top; else 0. */
  lv: number[]
  /** Per boat: site * 2 + cradle. */
  pos: number[]
  /** Lockfuls drawn from pounds and reaches so far. */
  water: number
}

export interface Instance {
  configId: string
  difficulty: Difficulty
  sites: Site[]
  boats: Boat[]
  start: CanalState
  /** Lockfuls available (Grand Canal only). */
  waterBudget: number | null
  winchCost: number
  par: number
  cap: number
  maxMistakes: number
}

export type Action =
  | { t: 'paddle'; g: number }
  | { t: 'boat'; b: number; d: 1 | -1 }
  | { t: 'haul'; s: number }

export type ApplyResult =
  | { ok: true; state: CanalState; cost: number }
  | { ok: false; mistake: boolean; reason: string }

export const isFixed = (s: Site) => s.kind === 'reach' || s.kind === 'pound'

export function levelOf(inst: { sites: Site[] }, st: CanalState, site: number, cradle = 0): number {
  const s = inst.sites[site]
  if (s.kind === 'chamber') return st.lv[site] ? s.hi : s.lo
  if (s.kind === 'plane') return (st.lv[site] ^ cradle) ? s.hi : s.lo
  return s.lo
}

export function goalOf(inst: { sites: Site[]; boats: Boat[] }, b: number): number {
  return inst.boats[b].up ? inst.sites.length - 1 : 0
}

export const atGoal = (inst: { sites: Site[]; boats: Boat[] }, st: CanalState, b: number) => (st.pos[b] >> 1) === goalOf(inst, b)

export function isSolved(inst: { sites: Site[]; boats: Boat[] }, st: CanalState): boolean {
  return st.pos.every((_, b) => atGoal(inst, st, b))
}

function loadAt(inst: { boats: Boat[] }, st: CanalState, code: number): number {
  let n = 0
  for (let b = 0; b < st.pos.length; b++) if (st.pos[b] === code) n += inst.boats[b].size
  return n
}

/** Apply one action. Illegal actions report whether they count as a mistake. */
export function apply(inst: Pick<Instance, 'sites' | 'boats' | 'winchCost'>, st: CanalState, a: Action): ApplyResult {
  const { sites } = inst
  if (a.t === 'boat') {
    if (atGoal(inst, st, a.b)) return { ok: false, mistake: false, reason: 'That boat has arrived.' }
    const code = st.pos[a.b], i = code >> 1, cs = code & 1
    const j = i + a.d
    if (j < 0 || j >= sites.length) return { ok: false, mistake: false, reason: 'The canal ends here.' }
    const src = levelOf(inst, st, i, cs)
    let tc = 0
    if (sites[j].kind === 'plane') {
      const c = [0, 1].find(c => levelOf(inst, st, j, c) === src)
      if (c === undefined) return { ok: false, mistake: true, reason: 'No cradle waits at this level.' }
      tc = c
    } else if (levelOf(inst, st, j) !== src) {
      return { ok: false, mistake: true, reason: 'The water is not level — forcing the gate floods it!' }
    }
    if (sites[j].kind !== 'reach' && loadAt(inst, st, j * 2 + tc) + inst.boats[a.b].size > sites[j].cap) {
      return { ok: false, mistake: false, reason: 'No room there.' }
    }
    const pos = [...st.pos]; pos[a.b] = j * 2 + tc
    return { ok: true, state: { lv: st.lv, pos, water: st.water }, cost: 1 }
  }
  if (a.t === 'haul') {
    const s = sites[a.s]
    if (!s || s.kind !== 'plane') return { ok: false, mistake: false, reason: 'No plane here.' }
    const cHi = st.lv[a.s] ? 0 : 1
    const desc = loadAt(inst, st, a.s * 2 + cHi), asc = loadAt(inst, st, a.s * 2 + (1 - cHi))
    const lv = [...st.lv]; lv[a.s] = 1 - lv[a.s]
    return { ok: true, state: { lv, pos: st.pos, water: st.water }, cost: desc >= asc ? 1 : inst.winchCost }
  }
  // paddle in gate g, between site g (lower) and g + 1 (upper)
  const L = sites[a.g], U = sites[a.g + 1]
  if (!L || !U || L.kind === 'plane' || U.kind === 'plane' || (isFixed(L) && isFixed(U))) {
    return { ok: false, mistake: false, reason: 'No paddle here.' }
  }
  const lv = [...st.lv]
  if (isFixed(L)) { // drain the chamber above into the pound
    if (!st.lv[a.g + 1]) return { ok: false, mistake: false, reason: 'Already level.' }
    lv[a.g + 1] = 0
    return { ok: true, state: { lv, pos: st.pos, water: st.water }, cost: 1 }
  }
  if (isFixed(U)) { // fill the chamber below from the pound
    if (st.lv[a.g]) return { ok: false, mistake: false, reason: 'Already level.' }
    lv[a.g] = 1
    return { ok: true, state: { lv, pos: st.pos, water: st.water + 1 }, cost: 1 }
  }
  // staircase: upper chamber empties into lower chamber
  const uHi = st.lv[a.g + 1], lHi = st.lv[a.g]
  if (!uHi && lHi) return { ok: false, mistake: false, reason: 'Already level.' }
  if (uHi && lHi) return { ok: false, mistake: true, reason: 'The chamber below is full — it overflows!' }
  if (!uHi && !lHi) return { ok: false, mistake: true, reason: 'The chamber above is empty — nothing to let down.' }
  lv[a.g + 1] = 0; lv[a.g] = 1
  return { ok: true, state: { lv, pos: st.pos, water: st.water }, cost: 1 }
}

export function allActions(inst: Pick<Instance, 'sites' | 'boats'>): Action[] {
  const out: Action[] = []
  for (let g = 0; g + 1 < inst.sites.length; g++) {
    const L = inst.sites[g], U = inst.sites[g + 1]
    if (L.kind !== 'plane' && U.kind !== 'plane' && !(isFixed(L) && isFixed(U))) out.push({ t: 'paddle', g })
  }
  inst.sites.forEach((s, i) => { if (s.kind === 'plane') out.push({ t: 'haul', s: i }) })
  inst.boats.forEach((_, b) => { out.push({ t: 'boat', b, d: 1 }); out.push({ t: 'boat', b, d: -1 }) })
  return out
}

function stateKey(inst: Pick<Instance, 'boats'>, st: CanalState, withWater: boolean): string {
  // Boats of the same direction and size are interchangeable for the solver.
  const groups = new Map<string, number[]>()
  inst.boats.forEach((b, i) => {
    const k = `${b.up ? 'u' : 'd'}${b.size}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(st.pos[i])
  })
  const parts = [...groups.keys()].sort().map(k => k + groups.get(k)!.sort((a, b) => a - b).join('.'))
  return st.lv.join('') + '|' + parts.join('|') + (withWater ? '|' + st.water : '')
}

/**
 * Least-moves solution (Dijkstra over small integer costs).  With a water
 * budget, fills beyond it are pruned.  Returns null if no solution exists
 * within `limit` explored states.
 */
export function solve(inst: Pick<Instance, 'sites' | 'boats' | 'winchCost' | 'start'> & { waterBudget: number | null },
  start: CanalState = inst.start, limit = 400_000): { path: Action[]; cost: number } | null {
  const budget = inst.waterBudget
  const withWater = budget !== null
  const acts = allActions(inst)
  const dist = new Map<string, number>()
  const prev = new Map<string, [string, Action] | null>()
  const states = new Map<string, CanalState>()
  const k0 = stateKey(inst, start, withWater)
  dist.set(k0, 0); prev.set(k0, null); states.set(k0, start)
  const buckets: string[][] = [[k0]]
  for (let c = 0; c < buckets.length; c++) {
    const bucket = buckets[c]
    if (!bucket) continue
    for (let bi = 0; bi < bucket.length; bi++) {
      const k = bucket[bi]
      if (dist.get(k) !== c) continue
      const st = states.get(k)!
      if (isSolved(inst, st)) {
        const path: Action[] = []
        let cur = k
        for (let link = prev.get(cur); link; link = prev.get(cur)) { path.push(link[1]); cur = link[0] }
        return { path: path.reverse(), cost: c }
      }
      if (states.size > limit) return null
      for (const a of acts) {
        const r = apply(inst, st, a)
        if (!r.ok) continue
        if (budget !== null && r.state.water > budget) continue
        const nk = stateKey(inst, r.state, withWater)
        const nc = c + r.cost
        const old = dist.get(nk)
        if (old !== undefined && old <= nc) continue
        dist.set(nk, nc); prev.set(nk, [k, a]); states.set(nk, r.state)
        ;(buckets[nc] ??= []).push(nk)
      }
    }
  }
  return null
}

/** Fewest lockfuls of water any solution can use (0-1 BFS). */
export function minWater(inst: Pick<Instance, 'sites' | 'boats' | 'winchCost' | 'start'>, limit = 400_000): number | null {
  const acts = allActions(inst)
  const dist = new Map<string, number>()
  const states = new Map<string, CanalState>()
  const k0 = stateKey(inst, inst.start, false)
  dist.set(k0, 0); states.set(k0, inst.start)
  const buckets: string[][] = [[k0]]
  for (let c = 0; c < buckets.length; c++) {
    const bucket = buckets[c]
    if (!bucket) continue
    for (let bi = 0; bi < bucket.length; bi++) {
      const k = bucket[bi]
      if (dist.get(k) !== c) continue
      const st = states.get(k)!
      if (isSolved(inst, st)) return c
      if (states.size > limit) return null
      for (const a of acts) {
        const r = apply(inst, st, a)
        if (!r.ok) continue
        const w = r.state.water - st.water
        const s2 = { ...r.state, water: 0 }
        const nk = stateKey(inst, s2, false)
        const nc = c + w
        const old = dist.get(nk)
        if (old !== undefined && old <= nc) continue
        dist.set(nk, nc); states.set(nk, s2)
        ;(buckets[nc] ??= []).push(nk)
      }
    }
  }
  return null
}

// ── Generation ────────────────────────────────────────────────────────────────

export const PAR_BANDS: Record<Difficulty, [number, number]> = {
  1: [8, 16], 2: [14, 24], 3: [20, 32], 4: [26, 40],
}

export function capFor(d: Difficulty, par: number): number {
  return scale(d, [par * 2 + 6, Math.ceil(par * 1.6) + 4, Math.ceil(par * 1.35) + 3, par + Math.max(4, Math.ceil(par * 0.15))])
}

interface Layout { kinds: Kind[]; caps: number[]; boats: { up: boolean; size: number }[]; waterSlack: number | null }

type BoatSpec = { up: boolean; size: number }
const B = (up: boolean, size = 1): BoatSpec => ({ up, size })

function flip(boats: { up: boolean; size: number }[], rng: Rng) {
  return rng() < 0.5 ? boats : boats.map(b => ({ ...b, up: !b.up }))
}

function layoutFor(configId: string, d: Difficulty, rng: Rng): Layout {
  if (configId === 'canal-du-midi') {
    const [n, boats0] = pick(scale<[number, BoatSpec[]][]>(d, [
      [[2, [B(true), B(false)]], [2, [B(true), B(true)]]],
      [[3, [B(true), B(false)]], [2, [B(true), B(true), B(false)]]],
      [[3, [B(true), B(true), B(false)]], [4, [B(true), B(false)]]],
      [[4, [B(true), B(true), B(false)]], [3, [B(true), B(true), B(false), B(false)]]],
    ]), rng)
    const boats = flip(boats0, rng)
    return { kinds: ['reach', ...Array(n).fill('chamber'), 'reach'], caps: [0, ...Array(n).fill(1), 0], boats, waterSlack: null }
  }
  if (configId === 'panama') {
    const n = scale(d, [2, 3, 3, 3])
    const sets = scale(d, [
      [[B(true, 2), B(false), B(false)], [B(true), B(true), B(false, 2)]],
      [[B(true, 2), B(true), B(false)], [B(true), B(true), B(false, 2)]],
      [[B(true, 2), B(true), B(false), B(false)], [B(true), B(true), B(false, 2), B(false)]],
      [[B(true, 2), B(true), B(true), B(false, 2), B(false)], [B(true, 2), B(true), B(false), B(false), B(false)]],
    ])
    const boats = flip(pick(sets, rng), rng)
    return { kinds: ['reach', ...Array(n).fill('chamber'), 'reach'], caps: [0, ...Array(n).fill(2), 0], boats, waterSlack: null }
  }
  if (configId === 'dutch-overtoom') {
    const kindSets: Kind[][] = scale(d, [
      [['reach', 'plane', 'reach']],
      [['reach', 'chamber', 'pound', 'plane', 'reach'], ['reach', 'plane', 'pound', 'chamber', 'reach']],
      [['reach', 'plane', 'pound', 'plane', 'reach'], ['reach', 'chamber', 'pound', 'plane', 'pound', 'chamber', 'reach']],
      [['reach', 'plane', 'pound', 'plane', 'pound', 'chamber', 'reach'], ['reach', 'chamber', 'pound', 'plane', 'pound', 'plane', 'reach']],
    ])
    const kinds = pick(kindSets, rng)
    const boats = flip(scale(d, [
      pick([[B(true), B(true), B(false), B(false)], [B(true), B(true), B(true), B(false)]], rng),
      [B(true), B(true), B(false)],
      [B(true), B(true), B(false), B(false)],
      [B(true), B(true), B(false), B(false)],
    ]), rng)
    const caps = kinds.map(k => (k === 'pound' ? 2 : k === 'reach' ? 0 : 1))
    return { kinds, caps, boats, waterSlack: null }
  }
  // grand-canal
  const n = scale(d, [2, 2, 3, 3])
  const kinds: Kind[] = ['reach']
  for (let i = 0; i < n; i++) { kinds.push('chamber'); if (i < n - 1) kinds.push('pound') }
  kinds.push('reach')
  const poundCap = scale(d, [2, 2, pick([1, 2], rng), 1])
  const boats = flip(scale(d, [
    [B(true), B(false)],
    [B(true), B(true), B(false)],
    pick([[B(true), B(true), B(false)], [B(true), B(false), B(false)], [B(true), B(true), B(false), B(false)]], rng),
    [B(true), B(true), B(false), B(false)],
  ]), rng)
  const caps = kinds.map(k => (k === 'pound' ? poundCap : k === 'reach' ? 0 : 1))
  return { kinds, caps, boats, waterSlack: scale(d, [2, 1, 1, 0]) }
}

function buildSites(kinds: Kind[], caps: number[]): Site[] {
  let level = 0
  return kinds.map((kind, i) => {
    const lo = level
    const hi = kind === 'chamber' ? lo + 1 : kind === 'plane' ? lo + 2 : lo
    level = hi
    return { kind, cap: caps[i], lo, hi }
  })
}

export function makeInstance(configId: string, difficulty: Difficulty, seed: number): Instance {
  const id = CONFIGS[configId] ? configId : 'grand-canal'
  const rng = mulberry32(hashString(`canallock:${id}:${difficulty}:${seed}`))
  const [lo, hi] = PAR_BANDS[difficulty]
  let best: Instance | null = null
  let bestGap = Infinity
  for (let attempt = 0; attempt < 30; attempt++) {
    const lay = layoutFor(id, difficulty, rng)
    const sites = buildSites(lay.kinds, lay.caps)
    const boats: Boat[] = lay.boats.map(b => ({ ...b, label: '' }))
    let u = 0, dn = 0
    boats.forEach(b => { b.label = b.up ? String.fromCharCode(65 + u++) : String.fromCharCode(80 + dn++) })
    const lv = sites.map(s => (s.kind === 'chamber' || s.kind === 'plane' ? (rng() < 0.5 ? 1 : 0) : 0))
    const pos = boats.map(b => (b.up ? 0 : (sites.length - 1) * 2))
    const start: CanalState = { lv, pos, water: 0 }
    const base = { configId: id, difficulty, sites, boats, start, winchCost: 3 }
    let waterBudget: number | null = null
    if (lay.waterSlack !== null) {
      const mw = minWater(base)
      if (mw === null) continue
      waterBudget = mw + lay.waterSlack
    }
    const sol = solve({ ...base, waterBudget })
    if (!sol) continue
    const par = sol.cost
    const inst: Instance = { ...base, waterBudget, par, cap: capFor(difficulty, par), maxMistakes: scale(difficulty, [4, 3, 3, 2]) }
    const gap = par < lo ? lo - par : par > hi ? par - hi : 0
    if (gap === 0) return inst
    if (gap < bestGap) { best = inst; bestGap = gap }
  }
  return best!
}

// ── Component ─────────────────────────────────────────────────────────────────

const U = 20
const widthOf = (k: Kind) => (k === 'reach' ? 76 : k === 'plane' ? 84 : 54)

export default function CanalLockGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'grand-canal')
  const inst = useMemo(() => makeInstance(configId, difficulty, seed), [configId, difficulty, seed])
  const [state, setState] = useState<CanalState>(inst.start)
  const [moves, setMoves] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [sel, setSel] = useState<number | null>(null)
  const [msg, setMsg] = useState<string>('')
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const live = useRef({ state, moves, mistakes, settled })
  live.current = { state, moves, mistakes, settled }
  useEffect(() => {
    setState(inst.start); setMoves(0); setMistakes(0); setSel(null); setMsg('')
  }, [inst])

  const act = (a: Action) => {
    const cur = live.current
    if (cur.settled) return
    const r = apply(inst, cur.state, a)
    if (!r.ok) {
      setMsg(r.reason)
      if (r.mistake) {
        const m = cur.mistakes + 1
        live.current = { ...cur, mistakes: m }
        setMistakes(m)
        if (m >= inst.maxMistakes) { live.current.settled = true; lose('Too many flooded gates') }
      }
      return
    }
    const moves = cur.moves + r.cost
    live.current = { ...cur, state: r.state, moves }
    setState(r.state); setMoves(moves); setMsg('')
    if (sel !== null && atGoal(inst, r.state, sel)) setSel(null)
    if (isSolved(inst, r.state)) { live.current.settled = true; win(); return }
    if (inst.waterBudget !== null && r.state.water > inst.waterBudget) { live.current.settled = true; lose('The summit pound ran dry'); return }
    if (moves >= inst.cap) { live.current.settled = true; lose('Night fell with boats still waiting') }
  }

  // Layout.
  const xs: number[] = []
  let x = 4
  for (const s of inst.sites) { xs.push(x); x += widthOf(s.kind) }
  const W = x + 4
  const top = inst.sites[inst.sites.length - 1].hi
  const H = (top + 3) * U + 16
  const yOf = (lv: number) => H - 14 - (lv + 1) * U
  const floorOf = (s: Site) => yOf(s.lo) + U * 0.9

  const boatsAt = (code: number) => state.pos.map((p, b) => (p === code ? b : -1)).filter(b => b >= 0)
  const done = state.pos.filter((_, b) => atGoal(inst, state, b)).length

  const renderBoats = (code: number, x0: number, w: number, y: number) => {
    const list = boatsAt(code)
    let bx = x0 + 4, row = 0
    return list.map(b => {
      const bw = inst.boats[b].size * 15 + (inst.boats[b].size - 1) * 2
      if (bx + bw > x0 + w - 2) { bx = x0 + 4; row++ }
      const gx = bx, gy = y - 9 - row * 11
      bx += bw + 2
      const boat = inst.boats[b]
      const arrived = atGoal(inst, state, b)
      return (
        <g key={b} data-testid={`boat-${b}`} onClick={() => { if (!arrived && !settled) setSel(b) }}
          style={{ cursor: arrived ? 'default' : 'pointer' }} opacity={arrived ? 0.55 : 1}>
          <rect x={gx - 3} y={gy - 6} width={bw + 6} height={20} fill="transparent" />
          <path d={`M${gx} ${gy} h${bw} l-3 9 h${-(bw - 6)} z`} fill={boat.up ? '#c0703a' : '#5b6f3a'}
            stroke={sel === b ? '#f5c518' : '#3b2a1a'} strokeWidth={sel === b ? 2 : 0.8} />
          <text x={gx + bw / 2} y={gy + 7} fontSize={7} textAnchor="middle" fill="#fff" fontWeight="bold">
            {boat.label}{arrived ? '✓' : boat.up ? '›' : '‹'}
          </text>
        </g>
      )
    })
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p className="font-bold text-ink-2" data-testid="canal-done">{done} / {inst.boats.length} through</p>
          <p className={inst.cap - moves <= 4 ? 'text-red-600 font-bold' : ''} data-testid="canal-moves">Moves {moves} / {inst.cap}</p>
          <p>Par {inst.par}</p>
          <p data-testid="canal-water" className={inst.waterBudget !== null && state.water >= inst.waterBudget ? 'text-red-600 font-bold' : ''}>
            Water {state.water}{inst.waterBudget !== null ? ` / ${inst.waterBudget}` : ''}
          </p>
          <p data-testid="canal-mistakes">Floods {mistakes} / {inst.maxMistakes}</p>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[430px] mx-auto select-none rounded-lg border-2 border-ink-2 bg-paper"
        style={{ touchAction: 'manipulation' }}>
        <text x={6} y={12} fontSize={8} fill="currentColor" opacity={0.6}>◀ low</text>
        <text x={W - 6} y={12} fontSize={8} textAnchor="end" fill="currentColor" opacity={0.6}>high ▶</text>
        {inst.sites.map((s, i) => {
          const x0 = xs[i], w = widthOf(s.kind)
          const fl = floorOf(s)
          if (s.kind === 'plane') {
            const y0 = yOf(s.lo), y1 = yOf(s.hi)
            const cy = (c: number) => (levelOf(inst, state, i, c) === s.hi ? y1 : y0)
            const cx = (c: number) => (levelOf(inst, state, i, c) === s.hi ? x0 + w - 30 : x0 + 4)
            return (
              <g key={i}>
                <path d={`M${x0} ${y0 + 3} L${x0 + w} ${y1 + 3} L${x0 + w} ${H} L${x0} ${H} z`} fill={cfg.stone} />
                <line x1={x0} y1={y0 + 2} x2={x0 + w} y2={y1 + 2} stroke="#5a4630" strokeWidth={1.5} strokeDasharray="3 2" />
                {[0, 1].map(c => (
                  <g key={c}>
                    <rect x={cx(c)} y={cy(c) - 1} width={26} height={4} fill={c ? '#7d5a3a' : '#9a6d42'} />
                    {renderBoats(i * 2 + c, cx(c) - 2, 32, cy(c))}
                  </g>
                ))}
                <g data-testid={`haul-${i}`} onClick={() => act({ t: 'haul', s: i })} style={{ cursor: 'pointer' }}>
                  <rect x={x0 + w / 2 - 20} y={H - 22} width={40} height={16} rx={4} fill="#3b2a1a" />
                  <text x={x0 + w / 2} y={H - 11} fontSize={8} textAnchor="middle" fill="#fff" fontWeight="bold">⇅ Haul</text>
                </g>
              </g>
            )
          }
          const lvl = levelOf(inst, state, i)
          const wy = yOf(lvl)
          return (
            <g key={i}>
              <rect x={x0} y={fl} width={w} height={H - fl} fill={cfg.stone} />
              <rect x={x0} y={wy} width={w} height={fl - wy} fill={cfg.water} opacity={0.85} />
              {s.kind === 'chamber' && <text x={x0 + w / 2} y={H - 4} fontSize={7} textAnchor="middle" fill="#3b2a1a">lock{s.cap > 1 ? ` (${s.cap})` : ''}</text>}
              {s.kind === 'pound' && <text x={x0 + w / 2} y={H - 4} fontSize={7} textAnchor="middle" fill="#3b2a1a">pound ({s.cap})</text>}
              {renderBoats(i * 2, x0, w, wy)}
            </g>
          )
        })}
        {inst.sites.slice(0, -1).map((L, g) => {
          const R = inst.sites[g + 1]
          const gx = xs[g + 1]
          const yTop = Math.min(yOf(L.kind === 'plane' ? L.hi : levelOf(inst, state, g, 0)), yOf(R.kind === 'plane' ? R.lo : levelOf(inst, state, g + 1, 0))) - 6
          if (L.kind === 'plane' || R.kind === 'plane') return null
          const paddle = !(isFixed(L) && isFixed(R))
          const lvL = levelOf(inst, state, g), lvR = levelOf(inst, state, g + 1)
          const bottom = Math.max(floorOf(L), floorOf(R))
          return (
            <g key={`g${g}`}>
              <rect x={gx - 2} y={yTop} width={4} height={bottom - yTop} fill={lvL === lvR ? '#7a8f5a' : '#5a3b22'} />
              {paddle && (
                <g data-testid={`paddle-${g}`} onClick={() => act({ t: 'paddle', g })} style={{ cursor: 'pointer' }}>
                  <circle cx={gx} cy={yTop - 9} r={13} fill="transparent" />
                  <circle cx={gx} cy={yTop - 9} r={7} fill="#f0e2c0" stroke="#3b2a1a" strokeWidth={1.2} />
                  <text x={gx} y={yTop - 6.5} fontSize={8} textAnchor="middle" fill="#3b2a1a">≈</text>
                </g>
              )}
            </g>
          )
        })}
      </svg>

      <p className="text-[11px] text-center min-h-[16px] text-red-600 font-bold" data-testid="canal-msg">{msg}</p>

      {!settled && (
        <div className="flex items-center gap-2 w-full max-w-[430px] mx-auto">
          <button type="button" data-testid="boat-down" disabled={sel === null} onClick={() => sel !== null && act({ t: 'boat', b: sel, d: -1 })}
            className="flex-1 h-11 rounded-lg border bg-panel border-line text-ink font-bold text-xs disabled:opacity-40">◀ Downstream</button>
          <span className="text-xs text-ink-2 w-16 text-center font-bold">{sel === null ? 'tap a boat' : `Boat ${inst.boats[sel].label}`}</span>
          <button type="button" data-testid="boat-up" disabled={sel === null} onClick={() => sel !== null && act({ t: 'boat', b: sel, d: 1 })}
            className="flex-1 h-11 rounded-lg border bg-panel border-line text-ink font-bold text-xs disabled:opacity-40">Upstream ▶</button>
        </div>
      )}
      <p className="text-muted/80 text-[10px] text-center">
        {settled ? '' : 'Tap ≈ on a gate to open its paddle and level the water. A gate only opens when both sides are level. Boats marked › go up, ‹ go down.'}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Every boat through!" loseTitle="The flight is jammed" />
    </div>
  )
}
