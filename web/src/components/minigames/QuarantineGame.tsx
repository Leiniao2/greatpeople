import { useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, randInt, resolveConfig, scale, shuffle, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Quarantine — stop an outbreak on a map of towns (or houses) joined by roads.
//
// The disease follows a deterministic SIR rule, one turn at a time:
//   • A road carries infection from a sick place (red) to a healthy one after
//     its contact time: a busy road (solid) passes it on the next turn, a
//     quiet road (dashed) only after two turns of contact.
//   • A sick place stays infectious for 3 turns, then recovers (grey) and
//     cannot catch it again.  Every person who falls ill counts as a case.
//   • A protected place (★) must never fall ill, and the cases (or, for the
//     flu, the number sick at once) must stay within the limit.
// The player makes one move per turn, then the disease moves.  You win when
// no one is sick any more.
//
// The configs change the rule of the move, not just the map:
//   venice        lazaretto: ships arrive on a schedule at the quays (⚓). Send
//                 a ship or a sick district to the lazaretto: it is held 4
//                 turns (40 days) on a limited number of beds, then released.
//   broad-street  the cholera comes from one hidden pump. Every day each house
//                 whose nearest open pump BY WALKING along the streets is the
//                 poisoned one has a death. Read the death map, take a handle.
//                 A wrong pump sends its houses to their next nearest pump.
//   eyam          several villages are struck at once; one seals itself in: a sealed village no
//                 longer passes the plague on, but it burns inside for twice
//                 as long and its people are counted twice.
//   jenner        vaccinate before the outbreak: choose who gets cowpox, then
//                 watch. Vaccinated places are immune, so the right ones cut
//                 every chain of infection (herd immunity).
//   flu-1918      timing: a distancing order freezes contact on every road
//                 for 2 turns (the sick still recover, after 4 turns for flu);
//                 a new order needs 2 open turns after the last. The epidemic
//                 is already running when you arrive. Keep the number sick at
//                 once under the hospital limit; when you order it is the game.
//
// Every level is generated from the seed and solved by an exhaustive search
// (memoised over the full state; for jenner every set of vaccinations). The
// limit is the optimum plus the tier's slack, doing nothing must lose, and at
// D3/D4 a naive greedy player must lose too.
//
//   D1  3×3 map  ≈1 min      D2  4×3 map  ≈1.5 min
//   D3  4×4 map  ≈2 min      D4  5×4 map, tighter limits  ≈3 min

export type Mechanic = 'lazaretto' | 'pump' | 'seal' | 'vaccinate' | 'distance'

interface QuarantineConfig {
  title: string
  /** Short label of the rule. */
  rule: string
  intro: string
  fact: string
  mechanic: Mechanic
  /** What one turn stands for. */
  unit: string
}

export const CONFIGS: Record<string, QuarantineConfig> = {
  venice: {
    title: 'The Lazaretto of Venice',
    rule: 'Hold ships 40 days',
    intro: 'Plague ships are sailing for the quays (⚓). Tap a ship in sight, or a sick district, to send it to the lazaretto: it is held 40 days (4 turns) and takes a bed. Keep the plague from the starred places.',
    fact: 'In 1423 Venice opened the Lazzaretto Vecchio, a plague hospital on an island in the lagoon. Ships from infected ports were held for forty days, the quaranta giorni that gave us the word quarantine.',
    mechanic: 'lazaretto', unit: '10 days',
  },
  'broad-street': {
    title: 'The Broad Street Pump',
    rule: 'Find the pump by walking distance',
    intro: 'Black bars are cholera deaths. Every day a house dies again if its nearest open pump, walking along the streets, is the poisoned one. Tap a pump to take off its handle. Pick the wrong one and its houses walk to their next pump.',
    fact: 'In September 1854 John Snow mapped the cholera deaths in Soho and showed that they clustered round the Broad Street pump, counting distance by walking through the streets. The parish took the pump handle off on 8 September.',
    mechanic: 'pump', unit: 'day',
  },
  eyam: {
    title: 'The Village of Eyam',
    rule: 'Seal the stricken village',
    intro: 'Tap a sick village to seal it in. It stops passing the plague on, but it suffers twice as long, so its people count twice. Keep the plague from the starred towns and the cases within the limit.',
    fact: 'In 1666 the Derbyshire village of Eyam, led by its rector William Mompesson and Thomas Stanley, sealed itself off so the plague would not spread. Food was left at boundary stones, and about 260 villagers died.',
    mechanic: 'seal', unit: 'week',
  },
  jenner: {
    title: 'Jenner’s Cowpox',
    rule: 'Vaccinate before the outbreak',
    intro: 'Smallpox has appeared in the red places. Before it spreads, tap places to vaccinate them (green, immune). Then start, and watch whether the chains of infection break before they reach a star.',
    fact: 'In 1796 Edward Jenner inoculated James Phipps with cowpox from the milkmaid Sarah Nelmes, then showed that the boy was immune to smallpox. Once enough people are immune, chains of infection break: herd immunity.',
    mechanic: 'vaccinate', unit: 'week',
  },
  'flu-1918': {
    title: 'Influenza, 1918',
    rule: 'Time the distancing order',
    intro: 'An order to close schools, churches and theatres freezes contact on every road for 2 days, while the sick go on recovering; the next order must wait 2 days after it ends. You have few orders. Keep the number sick at once within the hospital beds.',
    fact: 'In 1918 Philadelphia held a Liberty Loan parade on 28 September and closed public places only on 3 October. St Louis closed them on 7 October, within days of its first cases, and its peak death rate was far lower.',
    mechanic: 'distance', unit: 'day',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Pure model ────────────────────────────────────────────────────────────────

export const S = 0, I = 1, R = 2, V = 3, H = 4
const STATE_NAMES = ['healthy', 'sick', 'recovered', 'vaccinated', 'held']

export interface QNode { x: number; y: number; pop: number; kind: 'town' | 'pump'; dock: boolean }
/** w = contact time in turns (1 busy road, 2 quiet road); len = street length (pump). */
export interface QEdge { a: number; b: number; w: number; len: number }
export interface Ship { t: number; dock: number }

export interface Level {
  mechanic: Mechanic
  cols: number
  rows: number
  nodes: QNode[]
  edges: QEdge[]
  index: number[]
  protected: number[]
  /** Turns a place stays infectious. */
  dur: number
  /** Moves of the special kind (holds, seals, vaccines, orders, handles). */
  budget: number
  /** Cases (or sick at once for distance, deaths for pump) allowed. */
  limit: number
  /** The solver's optimum. */
  best: number
  slack: number
  maxTurns: number
  ships: Ship[]
  beds: number
  hold: number
  pause: number
  /** Turns after an order ends before the next one may start. */
  cooldown: number
  /** Turns already run before the player acts (distance). */
  warm: number
  /** Poisoned pump (pump only). */
  source: number
  /** Days of deaths already on the map (pump only). */
  pre: number
  /** Walking distance between nodes (pump only). */
  walk: number[][]
}

export interface State {
  turn: number
  st: number[]
  age: number[]
  sealed: boolean[]
  /** Turns of contact so far on each road. */
  exp: number[]
  /** Turn a held district leaves the lazaretto. */
  until: number[]
  /** Per ship: -1 not held, else the turn it leaves the lazaretto. */
  ship: number[]
  used: number
  cas: number
  peak: number
  pauseUntil: number
  open: boolean[]
  deaths: number[]
  started: boolean
  lost: string | null
}

export type Action =
  | { t: 'wait' }
  | { t: 'node'; n: number }
  | { t: 'ship'; s: number }
  | { t: 'order' }
  | { t: 'start' }

export interface Tier {
  cols: number; rows: number; budget: number; slack: number; index: number; protect: number
  ships: number; beds: number; pumps: number; extra: number
  /** Turns the epidemic has already run before you can act (distance). */
  warm: number
}

/** Ships are visible (and can be held) this many turns before they dock. */
export const SIGHT = 3
const W = 300
const SY = 62

export function tierFor(m: Mechanic, d: Difficulty): Tier {
  const base = { cols: scale(d, [3, 4, 4, 5]), rows: scale(d, [3, 3, 4, 4]), ships: 0, beds: 0, pumps: 0, extra: 0.3, warm: 0 }
  switch (m) {
    case 'seal': return { ...base, budget: scale(d, [1, 1, 2, 2]), slack: scale(d, [2, 1, 1, 0]), index: scale(d, [2, 2, 3, 3]), protect: scale(d, [1, 1, 2, 2]) }
    case 'lazaretto': return { ...base, budget: scale(d, [2, 3, 4, 5]), slack: scale(d, [2, 1, 1, 0]), index: scale(d, [0, 0, 1, 1]), protect: scale(d, [1, 1, 2, 2]), ships: scale(d, [3, 3, 4, 4]), beds: scale(d, [1, 1, 1, 2]) }
    case 'vaccinate': return { ...base, budget: scale(d, [2, 2, 3, 4]), slack: scale(d, [1, 1, 0, 0]), index: scale(d, [1, 1, 2, 2]), protect: scale(d, [1, 1, 2, 2]) }
    case 'distance': return { ...base, budget: scale(d, [1, 1, 2, 2]), slack: scale(d, [1, 1, 0, 0]), index: scale(d, [1, 1, 2, 2]), protect: 0, warm: scale(d, [1, 1, 2, 2]) }
    case 'pump': return { ...base, extra: 0.55, budget: scale(d, [2, 2, 1, 1]), slack: scale(d, [2, 1, 1, 1]), index: 0, protect: 0, pumps: scale(d, [3, 4, 4, 5]) }
  }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

export function neighbours(L: Pick<Level, 'edges'>, i: number): number[] {
  const out: number[] = []
  for (const e of L.edges) { if (e.a === i) out.push(e.b); else if (e.b === i) out.push(e.a) }
  return out
}

function hops(L: Pick<Level, 'edges' | 'nodes'>, from: number[]): number[] {
  const d = L.nodes.map(() => Infinity)
  const q = [...from]
  for (const f of from) d[f] = 0
  while (q.length) {
    const u = q.shift()!
    for (const v of neighbours(L, u)) if (d[v] === Infinity) { d[v] = d[u] + 1; q.push(v) }
  }
  return d
}

export function sickPop(L: Level, s: State): number {
  let p = 0
  for (let i = 0; i < s.st.length; i++) if (s.st[i] === I) p += L.nodes[i].pop
  return p
}

export function bedsUsed(_L: Level, s: State): number {
  let b = 0
  for (let i = 0; i < s.st.length; i++) if (s.st[i] === H) b++
  for (const u of s.ship) if (u > s.turn) b++
  return b
}

/** Nearest open pump to house h by walking distance (ties → lower index). */
export function nearestPump(L: Level, open: boolean[], h: number): number {
  let best = -1, bd = Infinity
  for (let p = 0; p < L.nodes.length; p++) {
    if (L.nodes[p].kind !== 'pump' || !open[p]) continue
    if (L.walk[h][p] < bd - 1e-9) { bd = L.walk[h][p]; best = p }
  }
  return best
}

/** Houses that the source pump kills today with these pumps open. */
export function served(L: Level, open: boolean[]): number[] {
  if (!open[L.source]) return []
  return range(L.nodes.length).filter(h => L.nodes[h].kind === 'town' && nearestPump(L, open, h) === L.source)
}

function pumpDay(L: Level, s: State) {
  for (const h of served(L, s.open)) { s.deaths[h]++; s.cas++ }
}

export function initialState(L: Level): State {
  const n = L.nodes.length
  const s: State = {
    turn: 0, st: new Array(n).fill(S), age: new Array(n).fill(0), sealed: new Array(n).fill(false),
    exp: L.edges.map(() => 0), until: new Array(n).fill(-1), ship: L.ships.map(() => -1),
    used: 0, cas: 0, peak: 0, pauseUntil: 0, open: L.nodes.map(nd => nd.kind === 'pump'),
    deaths: new Array(n).fill(0), started: L.mechanic !== 'vaccinate', lost: null,
  }
  for (const i of L.index) { s.st[i] = I; s.cas += L.nodes[i].pop }
  s.peak = sickPop(L, s)
  if (L.mechanic === 'pump') for (let d = 0; d < L.pre; d++) pumpDay(L, s)
  for (let k = 0; k < L.warm && !s.lost && !isWon(L, s); k++) advance(L, s)
  return s
}

function clone(s: State): State {
  return {
    ...s, st: s.st.slice(), age: s.age.slice(), sealed: s.sealed.slice(), exp: s.exp.slice(),
    until: s.until.slice(), ship: s.ship.slice(), open: s.open.slice(), deaths: s.deaths.slice(),
  }
}

export function isWon(L: Level, s: State): boolean {
  if (s.lost) return false
  if (L.mechanic === 'pump') return !s.open[L.source]
  if (!s.started) return false
  if (s.st.includes(I)) return false
  return L.ships.every((sh, k) => sh.t < s.turn || s.ship[k] >= 0)
}

/** True if a ship can be held now. */
export function shipInSight(L: Level, s: State, k: number): boolean {
  const sh = L.ships[k]
  return s.ship[k] < 0 && sh.t >= s.turn && sh.t - s.turn <= SIGHT
}

/** The disease moves one turn. */
function advance(L: Level, n: State) {
  const st0 = n.st.slice()
  const newly = new Set<number>()
  L.ships.forEach((sh, k) => { if (sh.t === n.turn && n.ship[k] < 0 && st0[sh.dock] === S) newly.add(sh.dock) })
  const paused = n.turn < n.pauseUntil
  L.edges.forEach((e, k) => {
    let src = -1, dst = -1
    if (st0[e.a] === I && st0[e.b] === S) { src = e.a; dst = e.b }
    else if (st0[e.b] === I && st0[e.a] === S) { src = e.b; dst = e.a }
    if (src < 0 || n.sealed[src]) { n.exp[k] = 0; return }
    if (!paused) n.exp[k]++
    if (n.exp[k] >= e.w) newly.add(dst)
  })
  for (let i = 0; i < st0.length; i++) if (st0[i] === I) {
    n.age[i]++
    if (n.age[i] >= (n.sealed[i] ? 2 * L.dur : L.dur)) n.st[i] = R
  }
  for (const i of newly) if (n.st[i] === S) { n.st[i] = I; n.age[i] = 0; n.cas += L.nodes[i].pop }
  n.turn++
  for (let i = 0; i < n.st.length; i++) if (n.st[i] === H && n.until[i] <= n.turn) n.st[i] = R
  n.peak = Math.max(n.peak, sickPop(L, n))
  if (L.protected.some(p => n.st[p] === I)) n.lost = 'The disease reached a protected place'
  else if (L.mechanic === 'distance' ? n.peak > L.limit : n.cas > L.limit) n.lost = L.mechanic === 'distance' ? 'The hospitals overflowed' : 'Too many people fell ill'
  else if (!isWon(L, n) && n.turn >= L.maxTurns) n.lost = 'The outbreak would not die out'
}

/** Apply one move (and, unless it is a setup move, one turn of disease). Null if illegal. */
export function step(L: Level, s: State, a: Action): State | null {
  if (s.lost || isWon(L, s)) return null
  const n = clone(s)
  if (L.mechanic === 'pump') {
    if (a.t === 'node') {
      if (L.nodes[a.n]?.kind !== 'pump' || !n.open[a.n] || n.used >= L.budget) return null
      n.open[a.n] = false; n.used++
    } else if (a.t !== 'wait') return null
    if (!n.open[L.source]) { n.turn++; return n }
    pumpDay(L, n)
    n.turn++
    if (n.cas > L.limit) n.lost = 'Too many deaths: the poisoned pump ran on'
    else if (n.used >= L.budget) n.lost = 'No handles left, and the poisoned pump still runs'
    else if (n.turn >= L.maxTurns) n.lost = 'The cholera ran on'
    return n
  }
  if (L.mechanic === 'vaccinate' && !n.started) {
    if (a.t === 'start') { n.started = true; return n }
    if (a.t !== 'node') return null
    const i = a.n
    if (L.protected.includes(i) || L.index.includes(i)) return null
    if (n.st[i] === V) { n.st[i] = S; n.used-- }
    else if (n.st[i] === S && n.used < L.budget) { n.st[i] = V; n.used++ }
    else return null
    return n
  }
  if (a.t === 'node') {
    const i = a.n
    if (n.used >= L.budget || n.st[i] !== I) return null
    if (L.mechanic === 'lazaretto') {
      if (bedsUsed(L, n) >= L.beds) return null
      n.st[i] = H; n.until[i] = n.turn + L.hold
    } else if (L.mechanic === 'seal') {
      if (n.sealed[i]) return null
      n.sealed[i] = true; n.cas += L.nodes[i].pop
    } else return null
    n.used++
  } else if (a.t === 'ship') {
    if (L.mechanic !== 'lazaretto' || n.used >= L.budget || !shipInSight(L, n, a.s) || bedsUsed(L, n) >= L.beds) return null
    n.ship[a.s] = n.turn + L.hold; n.used++
  } else if (a.t === 'order') {
    if (L.mechanic !== 'distance' || !canOrder(L, n)) return null
    n.pauseUntil = n.turn + L.pause; n.used++
  } else if (a.t !== 'wait') return null
  advance(L, n)
  return n
}

/** An order is possible with one left, none running, and the cooldown since the last one over. */
export function canOrder(L: Level, s: State): boolean {
  return s.used < L.budget && (s.used === 0 || s.turn >= s.pauseUntil + L.cooldown)
}

function threatens(L: Level, s: State, i: number): boolean {
  return neighbours(L, i).some(j => s.st[j] === S)
}

/** Legal moves; `prune` drops moves that cannot help (holding or sealing a place with no healthy neighbour). */
export function legalActions(L: Level, s: State, prune = false): Action[] {
  const out: Action[] = [{ t: 'wait' }]
  if (L.mechanic === 'pump') {
    for (let p = 0; p < L.nodes.length; p++) if (L.nodes[p].kind === 'pump' && s.open[p] && s.used < L.budget) out.push({ t: 'node', n: p })
    return out
  }
  if (s.used >= L.budget) return out
  if (L.mechanic === 'lazaretto' || L.mechanic === 'seal') {
    for (let i = 0; i < s.st.length; i++) {
      if (s.st[i] !== I || s.sealed[i]) continue
      if (prune && !threatens(L, s, i)) continue
      if (L.mechanic === 'lazaretto' && bedsUsed(L, s) >= L.beds) continue
      out.push({ t: 'node', n: i })
    }
    if (L.mechanic === 'lazaretto' && bedsUsed(L, s) < L.beds) L.ships.forEach((_, k) => { if (shipInSight(L, s, k)) out.push({ t: 'ship', s: k }) })
  }
  if (L.mechanic === 'distance' && canOrder(L, s)) out.push({ t: 'order' })
  return out
}

export interface Solution { value: number; plan: Action[] }

function keyOf(s: State): string {
  const age = s.st.map((x, i) => (x === I ? s.age[i] : x === H ? s.until[i] - s.turn : 0)).join(',')
  return `${s.turn}|${s.st.join('')}|${age}|${s.sealed.map(Number).join('')}|${s.exp.join('')}|${s.ship.join(',')}|${s.used}|${Math.max(-3, s.pauseUntil - s.turn)}|${s.open.map(Number).join('')}`
}

const ABORT = new Error('quarantine search too large')

/**
 * Exhaustive memoised search for the best outcome from `from`: the fewest
 * final cases (deaths for pump) or, for distance, the lowest peak sick at
 * once. Value Infinity / null when no plan keeps the protected places safe.
 */
export function solve(L: Level, from?: State, cap = 300000): Solution | null {
  const start = from ?? initialState(L)
  if (L.mechanic === 'vaccinate') return solveVaccine(L, start)
  const Lx: Level = { ...L, limit: Infinity }
  const peakMode = L.mechanic === 'distance'
  const memo = new Map<string, number>()
  const choice = new Map<string, Action>()
  let count = 0
  const g = (s: State): number => {
    if (s.lost) return Infinity
    if (isWon(Lx, s)) return 0
    const k = keyOf(s)
    const m = memo.get(k)
    if (m !== undefined) return m
    if (++count > cap) throw ABORT
    let best = Infinity
    let ba: Action | null = null
    for (const a of legalActions(Lx, s, true)) {
      const nx = step(Lx, s, a)
      if (!nx) continue
      const sub = g(nx)
      if (sub === Infinity) continue
      const v = peakMode ? Math.max(sickPop(Lx, nx), sub) : nx.cas - s.cas + sub
      if (v < best) { best = v; ba = a }
    }
    memo.set(k, best)
    if (ba) choice.set(k, ba)
    return best
  }
  let v: number
  try { v = g({ ...start, lost: null }) } catch (e) { if (e === ABORT) return null; throw e }
  if (v === Infinity) return null
  const plan: Action[] = []
  let s = start
  while (!s.lost && !isWon(Lx, s)) {
    const a = choice.get(keyOf(s))
    if (!a) break
    plan.push(a)
    s = step(Lx, s, a)!
  }
  return { value: peakMode ? Math.max(start.peak, v) : start.cas + v, plan }
}

function combos(items: number[], k: number): number[][] {
  const out: number[][] = []
  const rec = (i: number, acc: number[]) => {
    if (acc.length === k) { out.push(acc.slice()); return }
    if (items.length - i < k - acc.length) return
    for (let j = i; j < items.length; j++) { acc.push(items[j]); rec(j + 1, acc); acc.pop() }
  }
  rec(0, [])
  return out
}

/** Play waits to the end. */
export function runOut(L: Level, s: State): State {
  let cur = s
  while (!cur.lost && !isWon(L, cur)) {
    const nx = step(L, cur, cur.started ? { t: 'wait' } : { t: 'start' })
    if (!nx) break
    cur = nx
  }
  return cur
}

/** Every set of `budget` vaccinations is tried (vaccinating more never hurts). */
function solveVaccine(L: Level, start: State): Solution | null {
  const Lx: Level = { ...L, limit: Infinity }
  const free = range(L.nodes.length).filter(i => start.st[i] === S && !L.protected.includes(i) && !L.index.includes(i))
  const k = Math.min(L.budget - start.used, free.length)
  let best: Solution | null = null
  for (const set of combos(free, k)) {
    let s = start
    const plan: Action[] = []
    for (const i of set) { s = step(Lx, s, { t: 'node', n: i })!; plan.push({ t: 'node', n: i }) }
    const end = runOut(Lx, s)
    if (end.lost) continue
    if (!best || end.cas < best.value) {
      plan.push({ t: 'start' })
      for (let t = 0; t < end.turn; t++) plan.push({ t: 'wait' })
      best = { value: end.cas, plan }
    }
  }
  return best
}

export type Policy = (L: Level, s: State) => Action

export const idle: Policy = (_L, s) => (s.started ? { t: 'wait' } : { t: 'start' })

/** A naive player: act at the first chance, on the first thing it sees. */
export const greedy: Policy = (L, s) => {
  if (L.mechanic === 'vaccinate') {
    if (s.started) return { t: 'wait' }
    if (s.used >= L.budget) return { t: 'start' }
    const deg = (i: number) => neighbours(L, i).length
    const cand = range(L.nodes.length).filter(i => s.st[i] === S && !L.protected.includes(i) && !L.index.includes(i))
      .sort((a, b) => deg(b) - deg(a) || a - b)
    return cand.length ? { t: 'node', n: cand[0] } : { t: 'start' }
  }
  if (L.mechanic === 'pump') {
    // Straight-line vote: each stricken house points at the pump nearest as the crow flies.
    const votes = new Map<number, number>()
    for (let h = 0; h < L.nodes.length; h++) {
      if (L.nodes[h].kind !== 'town' || !s.deaths[h]) continue
      let bp = -1, bd = Infinity
      for (let p = 0; p < L.nodes.length; p++) {
        if (L.nodes[p].kind !== 'pump' || !s.open[p]) continue
        const d = Math.hypot(L.nodes[h].x - L.nodes[p].x, L.nodes[h].y - L.nodes[p].y)
        if (d < bd) { bd = d; bp = p }
      }
      if (bp >= 0) votes.set(bp, (votes.get(bp) ?? 0) + s.deaths[h])
    }
    let bp = -1, bv = -1
    for (const [p, v] of votes) if (v > bv || (v === bv && p < bp)) { bv = v; bp = p }
    return bp >= 0 ? { t: 'node', n: bp } : { t: 'wait' }
  }
  const acts = legalActions(L, s)
  if (L.mechanic === 'lazaretto') return acts.find(a => a.t === 'ship') ?? acts.find(a => a.t === 'node') ?? { t: 'wait' }
  return acts.find(a => a.t !== 'wait') ?? { t: 'wait' }
}

export function playOut(L: Level, policy: Policy, from?: State): State {
  let s = from ?? initialState(L)
  for (let k = 0; k < 200 && !s.lost && !isWon(L, s); k++) {
    const nx = step(L, s, policy(L, s)) ?? step(L, s, s.started ? { t: 'wait' } : { t: 'start' })
    if (!nx) break
    s = nx
  }
  return s
}

function buildGrid(rng: Rng, cols: number, rows: number, extra: number) {
  const sx = W / cols
  const nodes: QNode[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    nodes.push({
      x: Math.round((c + 0.5) * sx + (rng() - 0.5) * sx * 0.4),
      y: Math.round((r + 0.5) * SY + (rng() - 0.5) * SY * 0.4),
      pop: 1, kind: 'town', dock: false,
    })
  }
  const cand: [number, number][] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c
    if (c + 1 < cols) cand.push([i, i + 1])
    if (r + 1 < rows) cand.push([i, i + cols])
  }
  const parent = nodes.map((_, i) => i)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  const chosen: [number, number][] = []
  for (const [a, b] of shuffle(cand, rng)) {
    if (find(a) !== find(b)) { parent[find(a)] = find(b); chosen.push([a, b]) }
    else if (rng() < extra) chosen.push([a, b])
  }
  chosen.sort((p, q) => p[0] - q[0] || p[1] - q[1])
  const edges: QEdge[] = chosen.map(([a, b]) => ({
    a, b, w: rng() < 0.55 ? 1 : 2, len: Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y),
  }))
  return { nodes, edges }
}

function walkMatrix(nodes: QNode[], edges: QEdge[]): number[][] {
  const n = nodes.length
  const d = range(n).map(i => range(n).map(j => (i === j ? 0 : Infinity)))
  for (const e of edges) { d[e.a][e.b] = Math.min(d[e.a][e.b], e.len); d[e.b][e.a] = d[e.a][e.b] }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j]
  return d
}

function build(m: Mechanic, t: Tier, rng: Rng): Level | null {
  const { nodes, edges } = buildGrid(rng, t.cols, t.rows, t.extra)
  const n = nodes.length
  const L: Level = {
    mechanic: m, cols: t.cols, rows: t.rows, nodes, edges, index: [], protected: [], dur: 3,
    budget: t.budget, limit: Infinity, best: 0, slack: t.slack, maxTurns: 30, ships: [], beds: t.beds,
    hold: 4, pause: 2, cooldown: 2, warm: t.warm, source: -1, pre: 2, walk: [],
  }
  if (m === 'distance') L.dur = 4
  if (m === 'pump') {
    const pumps = shuffle(range(n), rng).slice(0, t.pumps)
    for (const p of pumps) nodes[p].kind = 'pump'
    L.source = pumps[0]
    L.walk = walkMatrix(nodes, edges)
    const sv = served(L, nodes.map(nd => nd.kind === 'pump'))
    if (sv.length < 2) return null
    return L
  }
  for (const nd of nodes) nd.pop = randInt(rng, 1, 3)
  if (m === 'lazaretto') for (let c = 0; c < t.cols; c++) nodes[(t.rows - 1) * t.cols + c].dock = true
  const docks = range(n).filter(i => nodes[i].dock)
  L.index = shuffle(range(n).filter(i => !nodes[i].dock), rng).slice(0, t.index)
  const d = hops(L, [...L.index, ...docks])
  const far = shuffle(range(n).filter(i => d[i] >= 2), rng)
  if (far.length < t.protect) return null
  L.protected = far.slice(0, t.protect).sort((a, b) => a - b)
  if (m === 'lazaretto') {
    const times = shuffle(range(2 + 2 * t.ships).map(x => x + 1), rng).slice(0, t.ships).sort((a, b) => a - b)
    const openDocks = docks.filter(i => !L.protected.includes(i))
    L.ships = times.map(tt => ({ t: tt, dock: openDocks[Math.floor(rng() * openDocks.length)] }))
  }
  return L
}

/** Pump limit: deaths already on the map plus `slack` more days at the starting rate. */
function pumpLimit(L: Level): number {
  const s = initialState({ ...L, limit: Infinity })
  return s.cas + served(L, s.open).length * L.slack
}

export function generate(m: Mechanic, d: Difficulty, seed: number): Level {
  const tier = tierFor(m, d)
  let fallback: Level | null = null
  for (let attempt = 0; attempt < 150; attempt++) {
    const rng = mulberry32(hashString(`quarantine:${m}:${d}:${seed}:${attempt}`))
    const L = build(m, tier, rng)
    if (!L) continue
    const sol = solve(L)
    if (!sol) continue
    L.best = sol.value
    L.limit = m === 'pump' ? pumpLimit(L) : sol.value + tier.slack
    if (isWon(L, initialState(L))) continue
    if (isWon(L, playOut(L, idle))) continue
    if (isWon(L, playOut(L, greedy))) {
      if (d < 3) return L
      fallback ??= L
      continue
    }
    return L
  }
  if (fallback) return fallback
  throw new Error(`quarantine: no level for ${m} d${d} seed ${seed}`)
}

// ── Component ────────────────────────────────────────────────────────────────

const FILL = ['#eadfc6', '#dc2626', '#a8a29e', '#22c55e', '#7c3aed']

export default function QuarantineGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'venice')
  const level = useMemo(() => generate(cfg.mechanic, difficulty, seed), [cfg.mechanic, difficulty, seed])
  const [state, setState] = useState<State>(() => initialState(level))
  const [msg, setMsg] = useState('')
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const live = useRef({ state, done: false })
  live.current.state = state
  useEffect(() => { const s = initialState(level); live.current = { state: s, done: false }; setState(s); setMsg('') }, [level])

  const finish = (s: State) => {
    if (s.lost) { live.current.done = true; lose(s.lost) }
    else if (isWon(level, s)) { live.current.done = true; win() }
  }

  const act = (a: Action) => {
    if (settled || live.current.done) return
    const nx = step(level, live.current.state, a)
    if (!nx) { setMsg(illegalMsg(level, live.current.state, a)); return }
    live.current.state = nx
    setState(nx); setMsg('')
    finish(nx)
  }

  const fastForward = () => {
    if (settled || live.current.done) return
    const end = runOut(level, live.current.state)
    live.current.state = end
    setState(end)
    finish(end)
  }

  const m = level.mechanic
  const H_SEA = m === 'lazaretto' ? 46 : 0
  const HT = level.rows * SY + H_SEA
  const left = level.budget - state.used
  const nowSick = sickPop(level, state)
  const setup = m === 'vaccinate' && !state.started
  const pausedLeft = Math.max(0, state.pauseUntil - state.turn)

  const budgetLabel =
    m === 'lazaretto' ? `Holds left ${left} · beds ${bedsUsed(level, state)}/${level.beds}` :
    m === 'seal' ? `Seals left ${left}` :
    m === 'vaccinate' ? `Vaccines ${state.used}/${level.budget}` :
    m === 'distance' ? `Orders left ${left}` : `Handles ${left}`

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p data-testid="q-cas" className="font-bold text-ink-2">
            {m === 'distance' ? `Sick now ${nowSick} · peak ${state.peak}/${level.limit}` : m === 'pump' ? `Deaths ${state.cas}/${level.limit}` : `Cases ${state.cas}/${level.limit}`}
          </p>
          <p data-testid="q-used">{budgetLabel}</p>
          <p data-testid="q-turn">Turn {state.turn} ({cfg.unit})</p>
          {m === 'distance' && <p className={pausedLeft ? 'text-emerald-700 font-bold' : ''}>{pausedLeft ? `Distancing: ${pausedLeft} left` : 'Roads open'}</p>}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${HT}`} className="w-full max-w-[420px] mx-auto rounded-lg border border-line bg-paper select-none"
        style={{ touchAction: 'manipulation' }} role="img" aria-label="outbreak map">
        {m === 'lazaretto' && <rect x={0} y={level.rows * SY} width={W} height={H_SEA} fill="#7fb3d5" opacity={0.6} />}
        {level.edges.map((e, k) => {
          const A = level.nodes[e.a], B = level.nodes[e.b]
          if (m === 'pump') return <line key={k} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#a8a29e" strokeWidth={7} strokeLinecap="round" />
          const hot = state.exp[k] > 0
          const cut = state.sealed[e.a] || state.sealed[e.b]
          return (
            <line key={k} data-testid={`q-edge-${k}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y}
              stroke={cut ? '#d6d3d1' : hot ? '#ef4444' : '#78716c'} strokeWidth={e.w === 1 ? 3.5 : 2}
              strokeDasharray={e.w === 2 ? '5 4' : undefined} opacity={pausedLeft && !cut ? 0.35 : 0.9} />
          )
        })}
        {level.nodes.map((nd, i) => {
          if (m === 'pump') {
            if (nd.kind === 'pump') {
              const open = state.open[i]
              return (
                <g key={i} data-testid={`q-node-${i}`} data-open={open ? 'true' : 'false'} onClick={() => act({ t: 'node', n: i })} style={{ cursor: 'pointer' }}>
                  <circle cx={nd.x} cy={nd.y} r={18} fill="transparent" />
                  <circle cx={nd.x} cy={nd.y} r={11} fill={open ? '#2563eb' : '#a8a29e'} stroke="#1e3a8a" strokeWidth={1.5} />
                  <text x={nd.x} y={nd.y + 4} textAnchor="middle" fontSize={11} fontWeight="bold" fill="#fff">{open ? 'P' : '✕'}</text>
                </g>
              )
            }
            const dd = state.deaths[i]
            return (
              <g key={i} data-testid={`q-node-${i}`} data-deaths={dd}>
                <rect x={nd.x - 8} y={nd.y - 8} width={16} height={16} rx={2} fill="#eadfc6" stroke="#78716c" />
                {Array.from({ length: Math.min(dd, 8) }, (_, k) => (
                  <rect key={k} x={nd.x - 7} y={nd.y - 10 - k * 3} width={14} height={2} fill="#111" />
                ))}
                {dd > 8 && <text x={nd.x} y={nd.y + 4} textAnchor="middle" fontSize={8} fill="#111">{dd}</text>}
              </g>
            )
          }
          const st = state.st[i]
          const prot = level.protected.includes(i)
          const r = 7 + nd.pop * 2.5
          return (
            <g key={i} data-testid={`q-node-${i}`} data-state={STATE_NAMES[st]} onClick={() => act({ t: 'node', n: i })} style={{ cursor: 'pointer' }}>
              <circle cx={nd.x} cy={nd.y} r={19} fill="transparent" />
              <circle cx={nd.x} cy={nd.y} r={r} fill={FILL[st]} stroke={prot ? '#ca8a04' : state.sealed[i] ? '#111' : '#57534e'}
                strokeWidth={prot ? 3.5 : state.sealed[i] ? 3 : 1} />
              <text x={nd.x} y={nd.y + 4} textAnchor="middle" fontSize={10} fontWeight="bold" fill={st === I || st === H ? '#fff' : '#3f3f46'}>
                {st === I ? (state.sealed[i] ? '🔒' : level.dur - state.age[i]) : st === H ? 'L' : st === V ? '✚' : prot ? '★' : ''}
              </text>
              {nd.dock && <text x={nd.x + r + 1} y={nd.y + r + 2} fontSize={9}>⚓</text>}
            </g>
          )
        })}
        {m === 'lazaretto' && level.ships.map((sh, k) => {
          const held = state.ship[k] >= 0
          const sight = shipInSight(level, state, k)
          if (!sight && !(held && state.ship[k] > state.turn)) return null
          const dock = level.nodes[sh.dock]
          const y = level.rows * SY + 24
          return (
            <g key={`s${k}`} data-testid={`q-ship-${k}`} onClick={() => act({ t: 'ship', s: k })} style={{ cursor: 'pointer' }}>
              <rect x={dock.x - 20} y={y - 18} width={40} height={36} fill="transparent" />
              <line x1={dock.x} y1={level.rows * SY} x2={dock.x} y2={y - 10} stroke="#1e3a8a" strokeDasharray="2 2" opacity={0.6} />
              <text x={dock.x} y={y + 3} textAnchor="middle" fontSize={16}>{held ? '🏥' : '⛵'}</text>
              <text x={dock.x} y={y + 16} textAnchor="middle" fontSize={8} fontWeight="bold" fill="#1e3a8a">
                {held ? `held ${state.ship[k] - state.turn}` : sh.t === state.turn ? 'docks now' : `in ${sh.t - state.turn}`}
              </text>
            </g>
          )
        })}
      </svg>

      <p className="text-[11px] text-center min-h-[16px] text-red-600 font-bold" data-testid="q-msg">{msg}</p>

      {!settled && (
        <div className="flex gap-2 w-full max-w-[420px] mx-auto">
          {setup ? (
            <button type="button" data-testid="q-start" onClick={() => act({ t: 'start' })}
              className="flex-1 h-11 rounded-lg border text-xs font-bold bg-accent text-accent-fg border-accent">▶ Start the outbreak</button>
          ) : (
            <button type="button" data-testid="q-wait" onClick={() => act({ t: 'wait' })}
              className="flex-1 h-11 rounded-lg border text-xs font-bold bg-panel border-line text-ink-2 hover:border-accent/50">⏳ Next {cfg.unit}</button>
          )}
          {m === 'distance' && (
            <button type="button" data-testid="q-order" onClick={() => act({ t: 'order' })} disabled={!canOrder(level, state)}
              className="flex-1 h-11 rounded-lg border text-xs font-bold bg-panel border-line text-ink disabled:opacity-40">🚫 Order distancing ({left})</button>
          )}
          {!setup && (
            <button type="button" data-testid="q-run" onClick={fastForward}
              className="h-11 px-3 rounded-lg border text-xs font-bold bg-panel border-line text-ink-2">⏩ To the end</button>
          )}
        </div>
      )}
      <p className="text-muted/80 text-[10px] text-center">
        {settled ? '' : m === 'pump'
          ? 'Streets are the only way to walk. Taking a handle off uses a day.'
          : 'Solid roads pass the disease on next turn, dashed roads after two. Numbers on red places are turns left sick.'}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="The outbreak died out!" loseTitle={reason ?? 'The outbreak spread'} />
    </div>
  )
}

function illegalMsg(L: Level, s: State, a: Action): string {
  if (a.t === 'wait' || a.t === 'start') return ''
  if (L.mechanic === 'pump') return s.used >= L.budget ? 'No handles left' : 'Tap an open pump'
  if (L.mechanic === 'vaccinate') return s.started ? 'Too late: vaccinate before you start' : s.used >= L.budget ? 'No vaccine left (tap a green place to take it back)' : 'That place cannot be vaccinated'
  if (L.mechanic === 'distance') return a.t === 'order' ? 'No order available now' : 'Use the distancing order'
  if (s.used >= L.budget) return 'No moves of that kind left'
  if (L.mechanic === 'lazaretto' && bedsUsed(L, s) >= L.beds) return 'No free bed in the lazaretto'
  return L.mechanic === 'seal' ? 'Only a sick village can seal itself in' : 'Only sick districts or ships in sight go to the lazaretto'
}
