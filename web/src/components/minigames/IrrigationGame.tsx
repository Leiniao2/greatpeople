import { useMemo, useState, useCallback } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, hashString, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Nile Basins: turn-based flood irrigation.
//
// The river feeds one or two inlets. Water runs along canals one cell per
// turn (two on a surge turn). Sluice gates block it while closed; close a gate
// and everything downstream of it drains on the next turn. A field is watered
// once water has stood on it for `soak` turns (it stays watered after it
// drains); a village that water reaches is flooded and the game is lost.
//
// Each turn the player works ONE sluice (open ↔ closed) or waits; then the
// water moves. Every field must be watered before the flood ebbs (turn limit).
//
// The configs change the rules, not just the map:
//   egypt        basins chain: water runs field → field; each basin must soak 2 turns
//   mesopotamia  silt jams every sluice after it is worked once
//   inca         terraces: water only runs downhill (or level), terraces spill into lower ones
//   dujiangyan   two inlets split from the river, and on surge turns water runs 2 cells
//
// Levels are generated from the seed and kept only if a breadth-first solver
// finds a win, waiting alone does not win, and the best plan needs at least a
// tier's number of sluice actions. The turn limit is the solver's fastest win
// plus a little slack.
//
//   D1  5×5  2 sluices  2 fields  1 village  ≥2 actions  slack 2  ~1 min
//   D2  6×6  3 sluices  3 fields  1 village  ≥3 actions  slack 2  ~1.5 min
//   D3  7×6  4 sluices  3 fields  1 village  ≥4 actions  slack 2  ~2 min
//   D4  7×7  5 sluices  4 fields  2 villages ≥5 actions  slack 1  ~3 min
//       (egypt D4: 4 sluices, 3 basins, ≥4 actions — each basin soaks twice)

export type Cell = 'land' | 'river' | 'canal' | 'inlet' | 'gate' | 'field' | 'village'

export interface Rules {
  /** Fields pass water on to their neighbours (basins / terraces). */
  conduct: boolean
  /** Turns of standing water a field needs. */
  soak: number
  /** Water may only move to a cell of equal or lower height. */
  elevation: boolean
  /** Times each sluice may be worked (Infinity = unlimited). */
  gateUses: number
  inlets: 1 | 2
  /** Some turns are surges: water runs two cells. */
  surge: boolean
}

interface IrrigationConfig {
  title: string
  intro: string
  fact: string
  rules: Rules
}

export const CONFIGS: Record<string, IrrigationConfig> = {
  egypt: {
    title: 'Basins of the Nile',
    intro: 'The flood runs from basin to basin through cuts in the dykes. Each basin must hold water for 2 turns. Keep the water out of the village.',
    fact: 'Egyptian farmers walled the Nile floodplain into earthen basins; the late-summer flood was let in through cuts in the dykes and left standing for weeks before it drained back to the river, leaving fresh silt.',
    rules: { conduct: true, soak: 2, elevation: false, gateUses: Infinity, inlets: 1, surge: false },
  },
  'anaxagoras-nile': {
    title: 'The Summer Flood',
    intro: 'Anaxagoras said the Nile rises in summer because snow melts in Ethiopia. Here comes the flood: let it run from basin to basin, hold each basin wet for 2 turns, and keep it out of the village.',
    fact: 'Herodotus scoffed at the idea that the Nile flood came from melting snow far to the south, and Seneca and Diodorus credit it to Anaxagoras. He had the place right if not the cause: the flood comes from the summer monsoon rains on the Ethiopian highlands.',
    rules: { conduct: true, soak: 2, elevation: false, gateUses: Infinity, inlets: 1, surge: false },
  },
  mesopotamia: {
    title: 'Canals of Sumer',
    intro: 'Tigris silt jams a sluice once it has been worked: each gate can be moved only once. Water every field without flooding the village.',
    fact: 'Sumerian canals carried so much silt that they needed constant dredging, and salt left by irrigation slowly poisoned southern Mesopotamian fields — wheat gave way to the more salt-tolerant barley.',
    rules: { conduct: false, soak: 1, elevation: false, gateUses: 1, inlets: 1, surge: false },
  },
  inca: {
    title: 'Terraces of the Andes',
    intro: 'Water runs only downhill or level (the small numbers are heights), and terraces spill into the terraces below. Water every terrace, spare the village.',
    fact: 'Andean farmers, and later the Inca, built stone-walled terraces (andenes) fed by stone channels; at Moray, rings of terraces step down about 30 m into a natural hollow.',
    rules: { conduct: true, soak: 1, elevation: true, gateUses: Infinity, inlets: 1, surge: false },
  },
  lakamha: {
    title: 'The Waters of Lakamha’',
    intro: 'Palenque sits on a stepped shelf of hills cut by streams. Water runs only downhill or level (the small numbers are heights), and each garden terrace spills into the ones below. Water every garden, keep the flood out of the town.',
    fact: 'Palenque’s ancient name, Lakamha’, means “Big Water”. Some 56 springs and nine streams cross the site, and its builders roofed the Otolum stream with a vaulted stone aqueduct that carries it beneath the main plaza beside the Palace.',
    rules: { conduct: true, soak: 1, elevation: true, gateUses: Infinity, inlets: 1, surge: false },
  },
  dujiangyan: {
    title: 'Dujiangyan Weir',
    intro: 'The Fish Mouth splits the Min River into two channels. On surge turns (≋) the water runs two cells. Water every field without flooding a village.',
    fact: 'Around 256 BC Li Bing, the Qin governor of Shu, built Dujiangyan: the Fish Mouth levee splits the Min River into inner and outer channels without a dam, and it still irrigates the Chengdu Plain today.',
    rules: { conduct: false, soak: 1, elevation: false, gateUses: Infinity, inlets: 2, surge: true },
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Pure logic ─────────────────────────────────────────────────────────────────

export interface Level {
  rows: number
  cols: number
  cells: Cell[]
  /** Heights when the rules use elevation, else null. */
  height: number[] | null
  inlets: number[]
  gates: number[]
  gateOpen: boolean[]
  fields: number[]
  villages: number[]
  /** surge[t] true → on turn t (0-based) water runs two cells. */
  surge: boolean[]
  turns: number
  minTurns: number
  minActs: number
  rules: Rules
}

export interface State {
  turn: number
  open: boolean[]
  uses: number[]
  wet: boolean[]
  soak: number[]
  flooded: boolean
}

/** -1 = wait, otherwise the index into level.gates. */
export type Action = number

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

function neighbours(level: Pick<Level, 'rows' | 'cols'>, i: number): number[] {
  const r = Math.floor(i / level.cols), c = i % level.cols
  const out: number[] = []
  for (const [dr, dc] of DIRS) {
    const rr = r + dr, cc = c + dc
    if (rr >= 0 && cc >= 0 && rr < level.rows && cc < level.cols) out.push(rr * level.cols + cc)
  }
  return out
}

// Kinds: 0 blocked, 1 canal/inlet, 2 gate, 3 field, 4 village.
interface Compiled { nb: number[][]; kind: Uint8Array; gateOf: Int16Array; conductField: boolean }
const compiledCache = new WeakMap<Level, Compiled>()

function compile(level: Level): Compiled {
  let c = compiledCache.get(level)
  if (c) return c
  const n = level.cells.length
  const kind = new Uint8Array(n)
  const gateOf = new Int16Array(n).fill(-1)
  level.cells.forEach((t, i) => {
    kind[i] = t === 'canal' || t === 'inlet' ? 1 : t === 'gate' ? 2 : t === 'field' ? 3 : t === 'village' ? 4 : 0
  })
  level.gates.forEach((g, k) => { gateOf[g] = k })
  const nb = level.cells.map((_, i) => neighbours(level, i))
  if (level.height) {
    // Pre-filter by height: water never runs uphill.
    const h = level.height
    for (let i = 0; i < n; i++) nb[i] = nb[i].filter(j => h[j] <= h[i])
  }
  c = { nb, kind, gateOf, conductField: level.rules.conduct }
  compiledCache.set(level, c)
  return c
}

/** One turn of water movement: what stays connected to an inlet, then `speed` cells of advance. */
export function flow(level: Level, open: readonly boolean[], wet: readonly boolean[], speed: number): boolean[] {
  const { nb, kind, gateOf, conductField } = compile(level)
  const n = kind.length
  const pass = (b: number) => { const k = kind[b]; return k === 1 || k === 3 || k === 4 || (k === 2 && open[gateOf[b]]) }
  const cond = (a: number) => { const k = kind[a]; return k === 1 || k === 2 || (k === 3 && conductField) }
  const next = new Array<boolean>(n).fill(false)
  const queue: number[] = []
  for (const i of level.inlets) { next[i] = true; queue.push(i) }
  // Keep the wet cells still linked to an inlet.
  for (let q = 0; q < queue.length; q++) {
    const a = queue[q]
    if (!cond(a)) continue
    for (const b of nb[a]) if (!next[b] && wet[b] && pass(b)) { next[b] = true; queue.push(b) }
  }
  // Then advance the front.
  let front = queue
  for (let s = 0; s < speed; s++) {
    const add: number[] = []
    for (const a of front) {
      if (!cond(a)) continue
      for (const b of nb[a]) if (!next[b] && pass(b)) { next[b] = true; add.push(b) }
    }
    if (!add.length) break
    front = add
  }
  return next
}

export function initialState(level: Level): State {
  const wet = new Array<boolean>(level.cells.length).fill(false)
  for (const i of level.inlets) wet[i] = true
  return { turn: 0, open: [...level.gateOpen], uses: level.gates.map(() => 0), wet, soak: level.fields.map(() => 0), flooded: false }
}

export function canWork(level: Level, state: State, g: number): boolean {
  return g >= 0 && g < level.gates.length && state.uses[g] < level.rules.gateUses
}

/** Apply an action and move the water one turn. Returns null for an illegal action. */
export function step(level: Level, state: State, action: Action): State | null {
  let open = state.open
  let uses = state.uses
  if (action >= 0) {
    if (!canWork(level, state, action)) return null
    open = [...open]; uses = [...uses]
    open[action] = !open[action]
    uses[action]++
  }
  const speed = level.surge[state.turn] ? 2 : 1
  const wet = flow(level, open, state.wet, speed)
  const soak = state.soak.map((s, k) => (wet[level.fields[k]] ? Math.min(level.rules.soak, s + 1) : s))
  const flooded = state.flooded || level.villages.some(v => wet[v])
  return { turn: state.turn + 1, open, uses, wet, soak, flooded }
}

export function isWon(level: Level, state: State): boolean {
  return !state.flooded && state.soak.every(s => s >= level.rules.soak)
}

function keyOf(s: State, finiteUses: boolean): string {
  let k = ''
  for (const o of s.open) k += o ? '1' : '0'
  if (finiteUses) k += s.uses.join('')
  let v = 0, b = 0
  for (const w of s.wet) { v = v * 2 + (w ? 1 : 0); if (++b === 15) { k += String.fromCharCode(65 + v); v = 0; b = 0 } }
  k += String.fromCharCode(65 + v)
  return k + s.soak.join('')
}

export interface SearchResult {
  /** Fewest-turn winning plan. */
  plan: Action[]
  /** Fewest sluice actions over every win up to `extra` turns after the fastest one. */
  minActs: number
}

/**
 * Breadth-first search by turn from `from` until turn `limit`. Each layer is
 * deduplicated by state, keeping the fewest actions taken to reach it. After
 * the first win it keeps going `extra` more turns to find the fewest actions.
 * Gives up (null) if a layer grows past `maxStates`.
 */
export function search(level: Level, from: State, limit: number, extra = 0, maxStates = Infinity): SearchResult | null {
  if (from.flooded) return null
  if (isWon(level, from)) return { plan: [], minActs: 0 }
  interface Node { s: State; acts: number; parent: Node | null; a: Action }
  const planOf = (node: Node, a: Action) => {
    const out: Action[] = [a]
    for (let p: Node | null = node; p && p.parent; p = p.parent) out.push(p.a)
    return out.reverse()
  }
  let layer: Node[] = [{ s: from, acts: 0, parent: null, a: -1 }]
  let first: Action[] | null = null
  let stopAt = limit
  let minActs = Infinity
  const actions: Action[] = [-1, ...level.gates.map((_, g) => g)]
  const finite = Number.isFinite(level.rules.gateUses)
  for (let t = from.turn; t < stopAt && layer.length; t++) {
    const seen = new Map<string, Node>()
    for (const node of layer) {
      for (const a of actions) {
        const s = step(level, node.s, a)
        if (!s || s.flooded) continue
        const acts = node.acts + (a >= 0 ? 1 : 0)
        if (isWon(level, s)) {
          if (!first) { first = planOf(node, a); stopAt = Math.min(limit, t + 1 + extra) }
          minActs = Math.min(minActs, acts)
          continue
        }
        const k = keyOf(s, finite)
        const prev = seen.get(k)
        if (!prev || prev.acts > acts) seen.set(k, { s, acts, parent: node, a })
      }
    }
    layer = [...seen.values()]
    if (layer.length > maxStates) return null
  }
  return first ? { plan: first, minActs } : null
}

/** Play a plan from the start; returns the final state (or null if an action is illegal). */
export function playPlan(level: Level, plan: Action[]): State | null {
  let s: State | null = initialState(level)
  for (const a of plan) { s = step(level, s, a); if (!s) return null }
  return s
}

export interface Tier {
  rows: number; cols: number; canal: number; gates: number; fields: number; villages: number
  slack: number; minActs: number; maxTurns: number; hints: number; preview: boolean
}

export function tierFor(d: Difficulty, rules?: Rules): Tier {
  const t: Tier = {
    rows: scale(d, [5, 6, 7, 7]),
    cols: scale(d, [5, 6, 6, 7]),
    canal: scale(d, [7, 10, 12, 15]),
    gates: scale(d, [2, 3, 4, 5]),
    fields: scale(d, [2, 3, 3, 4]),
    villages: scale(d, [1, 1, 1, 2]),
    slack: scale(d, [2, 2, 2, 1]),
    minActs: scale(d, [2, 3, 4, 5]),
    maxTurns: scale(d, [7, 9, 11, 13]),
    hints: scale(d, [2, 1, 0, 0]),
    preview: d <= 2,
  }
  // Basins that must soak twice take longer: at the top tier one field and one sluice fewer.
  if (rules && rules.soak > 1 && d === 4) return { ...t, fields: t.fields - 1, gates: t.gates - 1, minActs: t.minActs - 1 }
  return t
}

function pickFrom<T>(arr: T[], rng: Rng): T { return arr[Math.floor(rng() * arr.length)] }

/** Static reach with every sluice open (ignores timing). */
function reachAllOpen(level: Level): boolean[] {
  return flow(level, level.gates.map(() => true), new Array(level.cells.length).fill(false), level.cells.length)
}

function layout(rules: Rules, tier: Tier, rng: Rng): Level | null {
  const { rows, cols } = tier
  const n = rows * cols
  const cells: Cell[] = new Array(n).fill('land')
  for (let c = 0; c < cols; c++) cells[c] = 'river'
  const base = { rows, cols }
  const inlets: number[] = []
  if (rules.inlets === 2) {
    const a = 1 + Math.floor(rng() * Math.max(1, Math.floor(cols / 2) - 1))
    const b = Math.min(cols - 1, a + 2 + Math.floor(rng() * Math.max(1, cols - a - 2)))
    inlets.push(cols + a, cols + b)
  } else inlets.push(cols + 1 + Math.floor(rng() * (cols - 2)))
  for (const i of inlets) cells[i] = 'inlet'
  const canal = [...inlets]
  const isFlowCell = (i: number) => cells[i] === 'canal' || cells[i] === 'inlet'
  for (let guard = 0; canal.length < tier.canal + inlets.length && guard < 2000; guard++) {
    const a = pickFrom(canal, rng)
    const b = pickFrom(neighbours(base, a), rng)
    if (b < cols || cells[b] !== 'land') continue
    if (neighbours(base, b).filter(isFlowCell).length !== 1) continue
    cells[b] = 'canal'
    canal.push(b)
  }
  if (canal.length < tier.canal) return null
  const height = rules.elevation
    ? Array.from({ length: n }, (_, i) => 2 * (rows - Math.floor(i / cols)) + Math.floor(rng() * 3) - 1)
    : null
  if (height) for (const i of inlets) height[i] = 2 * rows + 2
  const isWaterSide = (i: number) => cells[i] === 'canal' || (rules.conduct && cells[i] === 'field')
  const placeOn = (kind: Cell, count: number): number[] | null => {
    const out: number[] = []
    for (let guard = 0; out.length < count && guard < 300; guard++) {
      const cand: number[] = []
      for (let i = cols; i < n; i++) {
        if (cells[i] !== 'land') continue
        const nb = neighbours(base, i)
        if (!nb.some(isWaterSide)) continue
        if (nb.some(j => cells[j] === 'inlet' || cells[j] === 'village' || (kind === 'village' && cells[j] === 'field' && !rules.conduct))) continue
        cand.push(i)
      }
      if (!cand.length) return null
      const i = pickFrom(cand, rng)
      cells[i] = kind
      out.push(i)
    }
    return out.length === count ? out : null
  }
  const fields = placeOn('field', tier.fields)
  if (!fields) return null
  const villages = placeOn('village', tier.villages)
  if (!villages) return null
  // Which canal cells lie on the way to each field / village (BFS tree from the inlets).
  const parent = new Int32Array(n).fill(-2)
  const queue = [...inlets]
  for (const i of inlets) parent[i] = -1
  for (let q = 0; q < queue.length; q++) {
    const x = queue[q]
    if (!(cells[x] === 'canal' || cells[x] === 'inlet' || (rules.conduct && cells[x] === 'field'))) continue
    for (const y of neighbours(base, x)) {
      if (parent[y] !== -2 || !(cells[y] === 'canal' || cells[y] === 'field' || cells[y] === 'village')) continue
      if (height && height[y] > height[x]) continue
      parent[y] = x
      queue.push(y)
    }
  }
  const toField = new Uint8Array(n), toVillage = new Uint8Array(n)
  const mark = (t: number, arr: Uint8Array) => {
    if (parent[t] === -2) return false
    for (let x = parent[t]; x >= 0; x = parent[x]) if (cells[x] === 'canal') arr[x] = 1
    return true
  }
  for (const f of fields) if (!mark(f, toField)) return null
  let threatened = false
  for (const v of villages) threatened = mark(v, toVillage) || threatened
  if (!threatened) return null
  // Sluices on canal cells that matter; at least one guards a village.
  const useful = canal.filter(i => cells[i] === 'canal' && (toField[i] || toVillage[i]))
  const guards = useful.filter(i => toVillage[i])
  if (!guards.length || useful.length < tier.gates) return null
  /** Is `a` on the inlet path of `b`? */
  const onPath = (a: number, b: number) => { for (let x = b; x >= 0; x = parent[x]) if (x === a) return true; return false }
  const shared = guards.filter(i => toField[i])
  const gates: number[] = [pickFrom(shared.length && rng() < 0.6 ? shared : guards, rng)]
  for (let guard = 0; gates.length < tier.gates && guard < 200; guard++) {
    const g = pickFrom(useful, rng)
    if (gates.includes(g)) continue
    // Keep sluices on separate branches so each one matters on its own.
    if (guard < 150 && gates.some(h => onPath(g, h) || onPath(h, g))) continue
    gates.push(g)
  }
  if (gates.length < tier.gates) return null
  for (const g of gates) cells[g] = 'gate'
  // Sluices that lead to a village start open (they must be shut in time);
  // the rest start shut (they must be opened). A few are flipped for variety.
  const gateOpen = gates.map(g => (toVillage[g] ? true : rng() < 0.15))
  const offset = Math.floor(rng() * 3)
  const surge = Array.from({ length: 32 }, (_, t) => rules.surge && (t + offset) % 3 === 2)
  return {
    rows, cols, cells, height, inlets, gates,
    gateOpen,
    fields, villages, surge, turns: 0, minTurns: 0, minActs: 0, rules,
  }
}

export function generate(config: Pick<IrrigationConfig, 'rules'>, difficulty: Difficulty, seed: number): Level {
  const rules = config.rules
  const tier = tierFor(difficulty, rules)
  const rng = mulberry32(seed ^ hashString(`irrigation:${rules.conduct}:${rules.soak}:${rules.elevation}:${rules.gateUses}:${rules.inlets}:${rules.surge}`))
  let best: { level: Level; score: number } | null = null
  for (let attempt = 0; attempt < 200; attempt++) {
    const level = layout(rules, tier, rng)
    if (!level) continue
    const reach = reachAllOpen(level)
    // Every field reachable, and some village in danger if everything is opened.
    if (!level.fields.every(f => reach[f]) || !level.villages.some(v => reach[v])) continue
    // Waiting alone must not be enough.
    let idle: State = initialState(level)
    for (let t = 0; t < tier.maxTurns && !idle.flooded && !isWon(level, idle); t++) idle = step(level, idle, -1)!
    if (isWon(level, idle)) continue
    const found = search(level, initialState(level), tier.maxTurns, tier.slack, 600)
    if (!found) continue
    const minTurns = found.plan.length
    const turns = minTurns + tier.slack
    const lvl = { ...level, turns, minTurns, minActs: found.minActs }
    const score = Math.min(found.minActs, tier.minActs + 1) * 100 + minTurns
    if (!best || score > best.score) best = { level: lvl, score }
    // After many tries, settle for one action fewer than the tier asks for.
    const need = attempt < 40 ? tier.minActs : tier.minActs - 1
    if (found.minActs >= need && minTurns >= need + 1) break
  }
  if (best) return best.level
  // Fallback (not expected): a tiny fixed basin.
  return fallbackLevel(rules)
}

function fallbackLevel(rules: Rules): Level {
  // 4×4: river row, inlet at (1,1), canal down to a gate, fields beside it, village behind a second gate.
  const rows = 4, cols = 4
  const cells: Cell[] = [
    'river', 'river', 'river', 'river',
    'land', 'inlet', 'gate', 'village',
    'field', 'gate', 'land', 'land',
    'land', 'field', 'land', 'land',
  ]
  // Flow cells: inlet(5) → gate(9) → field(8)/field(13); inlet(5) → gate(6) → village(7)
  cells[13] = 'field'
  const level: Level = {
    rows, cols, cells, height: null, inlets: [5], gates: [6, 9], gateOpen: [true, false],
    fields: [8, 13], villages: [7], surge: new Array(32).fill(false), turns: 0, minTurns: 0, minActs: 0,
    rules: { ...rules, elevation: false, conduct: false, inlets: 1 },
  }
  const found = search(level, initialState(level), 12, 2)!
  return { ...level, turns: found.plan.length + 2, minTurns: found.plan.length, minActs: found.minActs }
}

// ── Component ──────────────────────────────────────────────────────────────────

const CELL = 40

export default function IrrigationGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'egypt')
  const level = useMemo(() => generate(config, difficulty, seed), [config.rules, difficulty, seed]) // eslint-disable-line react-hooks/exhaustive-deps
  const tier = tierFor(difficulty, config.rules)
  const [state, setState] = useState<State>(() => initialState(level))
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hint, setHint] = useState<Action | null>(null)
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const act = useCallback((a: Action) => {
    if (settled) return
    const next = step(level, state, a)
    if (!next) return
    setState(next)
    setHint(null)
    if (next.flooded) { lose('The village flooded'); return }
    if (isWon(level, next)) { win(); return }
    if (next.turn >= level.turns) { lose('The flood ebbed before every field was watered'); return }
    if (!search(level, next, level.turns)) lose('The water can no longer reach every field in time')
  }, [settled, level, state, win, lose])

  const askHint = useCallback(() => {
    if (settled || hintsUsed >= tier.hints) return
    const found = search(level, state, level.turns)
    if (!found || !found.plan.length) return
    setHint(found.plan[0])
    setHintsUsed(h => h + 1)
  }, [settled, hintsUsed, tier.hints, level, state])

  const preview = useMemo(() => {
    if (!tier.preview || settled) return null
    return flow(level, state.open, state.wet, level.surge[state.turn] ? 2 : 1)
  }, [tier.preview, settled, level, state])

  const turnsLeft = level.turns - state.turn
  const watered = state.soak.filter(s => s >= level.rules.soak).length
  const W = level.cols * CELL, H = level.rows * CELL

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
          <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          <p data-testid="irr-fields" className="font-bold text-ink-2">🌾 {watered}/{level.fields.length}</p>
          <p data-testid="irr-turns" className={turnsLeft <= 2 ? 'text-red-600 font-bold' : ''}>Turns left: {turnsLeft}</p>
        </div>
      </div>

      <div className="flex gap-1 justify-center" aria-label="flood calendar">
        {Array.from({ length: level.turns }, (_, t) => (
          <span key={t} className={`w-5 h-5 rounded text-[10px] leading-5 text-center border
            ${t < state.turn ? 'bg-panel border-line text-muted/50' : t === state.turn ? 'bg-accent text-accent-fg border-accent' : 'bg-paper border-line text-ink-2'}`}>
            {level.surge[t] ? '≋' : t + 1}
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[400px] mx-auto rounded-lg border border-line touch-manipulation select-none" role="img" aria-label="irrigation map">
        {level.cells.map((t, i) => {
          const r = Math.floor(i / level.cols), c = i % level.cols
          const x = c * CELL, y = r * CELL
          const wet = state.wet[i]
          const willWet = preview && preview[i] && !wet
          const g = t === 'gate' ? level.gates.indexOf(i) : -1
          const fieldK = t === 'field' ? level.fields.indexOf(i) : -1
          const fill =
            t === 'river' ? '#3b82f6' :
            t === 'land' ? '#e9d8a6' :
            t === 'village' ? (wet ? '#60a5fa' : '#d6b98c') :
            t === 'field' ? (wet ? '#4f9bd9' : state.soak[fieldK] >= level.rules.soak ? '#65a30d' : '#a3b86c') :
            wet ? '#60a5fa' : '#b08d57'
          return (
            <g key={i} data-cell={i} data-type={t} data-wet={wet ? 'true' : 'false'}>
              <rect x={x} y={y} width={CELL} height={CELL} fill={fill} stroke="#00000022" strokeWidth={0.5} />
              {t === 'river' && <text x={x + CELL / 2} y={y + CELL / 2 + 5} textAnchor="middle" fontSize={14} fill="#dbeafe">≈</text>}
              {(t === 'canal' || t === 'inlet' || t === 'gate') && !wet && <rect x={x + 10} y={y + 10} width={CELL - 20} height={CELL - 20} rx={4} fill="#8a6a3a" opacity={0.5} />}
              {t === 'inlet' && <text x={x + CELL / 2} y={y + CELL / 2 + 4} textAnchor="middle" fontSize={11} fill="#fff">▼</text>}
              {t === 'field' && (
                <>
                  <text x={x + CELL / 2} y={y + CELL / 2 + 5} textAnchor="middle" fontSize={15}>{state.soak[fieldK] >= level.rules.soak ? '🌾' : '🌱'}</text>
                  {level.rules.soak > 1 && Array.from({ length: level.rules.soak }, (_, k) => (
                    <circle key={k} cx={x + 8 + k * 8} cy={y + 7} r={2.5} fill={state.soak[fieldK] > k ? '#1d4ed8' : '#ffffff99'} />
                  ))}
                </>
              )}
              {t === 'village' && <text x={x + CELL / 2} y={y + CELL / 2 + 6} textAnchor="middle" fontSize={18}>{wet ? '🌊' : '🏠'}</text>}
              {willWet && <rect x={x + 3} y={y + 3} width={CELL - 6} height={CELL - 6} rx={5} fill="none" stroke="#2563eb" strokeWidth={2} strokeDasharray="4 3" />}
              {level.height && t !== 'river' && (
                <text x={x + CELL - 3} y={y + CELL - 3} textAnchor="end" fontSize={8} fill="#00000088">{level.height[i]}</text>
              )}
              {g >= 0 && (() => {
                const open = state.open[g]
                const jammed = !canWork(level, state, g)
                return (
                  <g data-gate={g} data-open={open ? 'true' : 'false'} role="button" aria-label={`sluice ${g + 1} ${open ? 'open' : 'closed'}`}
                    onClick={() => act(g)} style={{ cursor: settled || jammed ? 'default' : 'pointer' }}>
                    <rect x={x} y={y} width={CELL} height={CELL} fill="transparent" />
                    {open
                      ? <rect x={x + 4} y={y + 3} width={CELL - 8} height={6} rx={2} fill={jammed ? '#78716c' : '#334155'} />
                      : <rect x={x + 4} y={y + CELL / 2 - 4} width={CELL - 8} height={8} rx={2} fill={jammed ? '#78716c' : '#1e293b'} />}
                    <circle cx={x + CELL / 2} cy={y + CELL / 2} r={13} fill="none"
                      stroke={hint === g ? '#0ea5e9' : jammed ? '#78716c' : '#f59e0b'} strokeWidth={hint === g ? 3 : 1.5} strokeDasharray={jammed ? '2 2' : undefined} />
                    <text x={x + CELL / 2} y={y + CELL - 4} textAnchor="middle" fontSize={7} fill="#111">{jammed ? 'jammed' : open ? 'open' : 'shut'}</text>
                  </g>
                )
              })()}
            </g>
          )
        })}
      </svg>

      {!settled && (
        <div className="flex gap-2">
          <button type="button" data-testid="irr-wait" onClick={() => act(-1)}
            className={`flex-1 h-10 rounded-lg border text-xs font-bold bg-panel border-line text-ink-2 hover:border-accent/50 ${hint === -1 ? 'ring-2 ring-sky-400' : ''}`}>
            ⏳ Let the water run
          </button>
          {tier.hints > 0 && (
            <button type="button" onClick={askHint} disabled={hintsUsed >= tier.hints}
              className={`h-10 px-3 rounded-lg border text-xs font-bold ${hintsUsed < tier.hints ? 'bg-panel border-line text-ink-2' : 'bg-paper border-line text-muted/50'}`}>
              ✦ Hint ({tier.hints - hintsUsed})
            </button>
          )}
        </div>
      )}
      <p className="text-muted text-[10px] -mt-1">
        Tap a sluice to open or shut it (that is your turn), or let the water run.
        {tier.preview && ' Dashed squares show where the water goes next.'}
        {level.rules.gateUses === 1 && ' Each sluice moves only once.'}
      </p>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="Every field is watered!" loseTitle={reason ?? 'The harvest fails'} />
    </div>
  )
}
