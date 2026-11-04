import { useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, resolveConfig, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Firebreak — a city fire spreads turn by turn on a grid of houses, and you
// spend a few actions to save the marked buildings (or, in Moscow, to burn the
// stores before the enemy arrives).
//
// Fire physics, one synchronous step per turn:
//   • A burning house always lights the house DOWNWIND of it (the next cell
//     along the wind).  Crosswind neighbours catch only once the fire there
//     has burned for a full turn; upwind neighbours never catch, except in a
//     light wind (Rome), where a fire that has burned a turn creeps back too.
//   • A strong wind throws sparks: with strength s, a fire that has burned a
//     turn also lights fuel up to s cells straight downwind, so a gap of open
//     ground, street or river fewer than s cells wide does not stop it.
//   • Timber catches at the first spark.  Stone must be scorched on two turns
//     (in Chicago, one: the "fireproof" buildings burned too).  Open ground,
//     rubble, water and ash do not burn.  A fire burns 2 turns (stone: 3)
//     and leaves ash.
//
// Each turn you take ONE action, then the fire moves:
//   🪝 Pull down a timber house (fire hooks): it becomes rubble.  Too hot to
//      work next to a burning house.
//   💥 Gunpowder: blows a + of five cells to rubble (timber or stone), even
//      beside the fire.  Never on a marked building.
//   🪣 Bucket chain: within 2 cells of water, soak a house (it cannot catch
//      for 3 turns) or put out a burning one.
//   🔥 Torch (Moscow): set a house alight.
//   🚶 Move the brigade (Edo): the brigade works only within 2 cells of where
//      it stands, and stands where it last worked.
//
// The configs change the rule:
//   london-1666  east wind of strength 2: sparks leap a one-cell gap; hooks
//                and gunpowder (the Duke of York's blown firebreaks)
//   rome-64      light wind that veers on a forecast schedule; the fire
//                creeps upwind; vigiles' bucket chains from the fountains
//   edo-1657     north-west gale: the fire runs south AND east at once; a
//                single hikeshi brigade with hooks and a 2-cell reach
//   chicago-1871 south-west gale of strength 3: sparks leap the river and
//                stone burns like timber; gunpowder and hooks
//   moscow-1812  reversed: torch the stores before the Grande Armée arrives,
//                and keep the fire off the Kremlin
//
// Every level is generated from the seed and kept only when an iterative-
// deepening search finds a plan within the tool budget, doing nothing loses,
// and (D3, D4) two naive plans — fight at the fire front, or ring the target
// with cleared cells — both fail.  The tool budget is the solver's plan plus
// one spare at D1 and D2.
//
//   D1 6×6  1 target   ≥1 action  (≈1 min)    D2 7×7 1 target  ≥2 actions
//   D3 8×8  2 targets  ≥2 actions             D4 9×9 2 targets ≥3 actions (≈3 min)
//   (Edo D4: ≥2 hook actions, as the brigade also has to walk between them)

export type Kind = 'open' | 'timber' | 'stone' | 'water' | 'rubble'
export type Tool = 'hook' | 'powder' | 'bucket' | 'torch' | 'move'
export type Action = { t: 'wait' } | { t: Tool; i: number }
export interface Wind { dr: number; dc: number }

export interface Rules {
  /** Moscow: burn the stores instead of saving buildings. */
  offense: boolean
  /** Wind strength: sparks reach up to this many cells downwind (1 = no sparks). */
  spot: number
  /** Turns a fire must burn before it spreads crosswind. */
  crossDelay: number
  /** Light wind: a fire that has burned 2 turns spreads upwind too. */
  upwind: boolean
  /** Scorched turns stone needs before it catches. */
  stoneResist: number
  /** Turns timber burns before it is ash. */
  timberBurn: number
  /** The wind veers on a schedule. */
  shifting: boolean
  /** Brigade reach (Chebyshev); 0 = work anywhere. */
  brigadeReach: number
  /** Tool caps the solver may use while generating; the level then gets what the plan needs. */
  tools: Partial<Record<Tool, number>>
  wind: Wind
  water: 'south' | 'river' | 'fountains'
  /** Edo: a hirokoji avenue of open ground with gaps. */
  avenue: boolean
}

interface FirebreakConfig {
  title: string
  rule: string
  intro: string
  fact: string
  /** Name of the marked buildings. */
  target: string
  /** Offense configs: who is coming for the stores. */
  enemy?: string
  rules: Rules
}

/** The names a level's messages use; story params can rename both. */
export interface Names { target: string; enemy: string }

const BASE: Rules = {
  offense: false, spot: 1, crossDelay: 1, upwind: false, stoneResist: 2, timberBurn: 2, shifting: false,
  brigadeReach: 0, tools: { hook: 6 }, wind: { dr: 0, dc: -1 }, water: 'south', avenue: false,
}

export const CONFIGS: Record<string, FirebreakConfig> = {
  'london-1666': {
    title: 'The Great Fire of London',
    rule: 'Sparks leap a gap; gunpowder blasts',
    intro: 'A strong east wind drives the fire west and throws sparks over a one-cell gap. Pull down houses ahead of it (not beside the flames) or blow a cross of houses with gunpowder. Save the starred buildings.',
    fact: 'The fire began in Thomas Farriner’s bakery on Pudding Lane on 2 September 1666 and a strong east wind carried it west for four days. Samuel Pepys urged the King to pull down houses, and the fire was stopped only when the Duke of York’s men blew up houses with gunpowder to make firebreaks.',
    target: 'Guildhall',
    rules: { ...BASE, spot: 2, tools: { hook: 6, powder: 2 }, wind: { dr: 0, dc: -1 }, water: 'south' },
  },
  'rome-64': {
    title: 'The Great Fire of Rome',
    rule: 'The wind veers on a schedule',
    intro: 'A light, shifting wind: watch the forecast strip, once a house has burned a turn the fire also creeps upwind. Vigiles can pull down houses or run bucket chains from the fountains (blue). Save the starred temples.',
    fact: 'In July 64 CE fire broke out in shops by the Circus Maximus and burned for six days; Tacitus says only four of Rome’s fourteen districts escaped untouched. Nero rebuilt with wider streets, porticoes and less timber.',
    target: 'temple',
    rules: { ...BASE, spot: 1, upwind: true, shifting: true, tools: { hook: 6, bucket: 3 }, wind: { dr: 0, dc: 1 }, water: 'fountains' },
  },
  'edo-1657': {
    title: 'The Meireki Fire of Edo',
    rule: 'One brigade with a short reach',
    intro: 'A north-west gale drives the fire south-east through paper-and-cedar houses on two fronts at once. Your hikeshi brigade can only pull down houses within 2 cells of where it stands; moving it costs a turn. The open avenue is a firebreak with gaps.',
    fact: 'The Meireki fire of 1657 burned for three days and destroyed most of Edo, including Edo Castle’s keep; perhaps 100,000 people died. The shogunate then cut wide hirokoji avenues as firebreaks and in 1658 founded standing fire brigades (jōbikeshi), who fought fires by pulling houses down.',
    target: 'storehouse',
    rules: { ...BASE, spot: 1, brigadeReach: 2, avenue: true, tools: { hook: 6, move: 99 }, wind: { dr: 1, dc: 1 }, water: 'south' },
  },
  'chicago-1871': {
    title: 'The Great Chicago Fire',
    rule: 'Strength-3 gale: sparks leap the river',
    intro: 'A dry south-west gale throws sparks up to three cells north-east, across streets and the river, and even stone buildings catch at once. Clear wide gaps with gunpowder and hooks. Save the starred buildings.',
    fact: 'The fire began on 8 October 1871 near the O’Leary barn on DeKoven Street. Driven by a strong south-west wind after a dry summer, it jumped the South Branch and then the main stem of the Chicago River, killed about 300 people and left some 100,000 homeless.',
    target: 'Water Tower',
    rules: { ...BASE, spot: 3, stoneResist: 1, tools: { hook: 6, powder: 2 }, wind: { dr: -1, dc: 1 }, water: 'river' },
  },
  'moscow-1812': {
    title: 'Moscow Burns',
    rule: 'Reversed: burn the stores, spare the Kremlin',
    intro: 'Napoleon’s army is coming. Torch houses so the wind carries the fire through every store (🌾) before the deadline, and pull down houses so it never reaches the Kremlin (🏰). You have fewer torches than stores.',
    fact: 'Napoleon entered Moscow on 14 September 1812 and found it nearly empty. Fires, widely believed to have been set on Governor Rostopchin’s orders, burned for days and destroyed about three-quarters of the city and the supplies the French had counted on; the stone Kremlin largely survived.',
    target: 'Kremlin',
    enemy: 'The Grande Armée',
    rules: { ...BASE, offense: true, spot: 2, tools: { torch: 3, hook: 3 }, wind: { dr: 0, dc: 1 }, water: 'south' },
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Model ──────────────────────────────────────────────────────────────────

export interface Level {
  rows: number
  cols: number
  kind: Kind[]
  /** Buildings that must not burn (Moscow: the Kremlin). */
  targets: number[]
  /** Moscow: stores that must all catch by the deadline. */
  depots: number[]
  fires: number[]
  /** Wind for each turn (the last entry repeats). */
  winds: Wind[]
  tools: Partial<Record<Tool, number>>
  brigade: number
  /** Moscow: turn by which every store must have caught. */
  deadline: number
  minActs: number
  rules: Rules
}

export interface State {
  turn: number
  kind: Kind[]
  /** 0 unburnt, k > 0 burning for k - 1 turns, -1 burnt out (ash). */
  fire: number[]
  /** Scorched turns so far (stone). */
  expo: number[]
  /** Turns a soaked cell stays wet. */
  wet: number[]
  tools: Partial<Record<Tool, number>>
  brigade: number
}

export const TIERS = [
  { rows: 6, cols: 6, targets: 1, depots: 2, minActs: 1, maxActs: 2, slack: 1, fires: 1 },
  { rows: 7, cols: 7, targets: 1, depots: 3, minActs: 2, maxActs: 3, slack: 1, fires: 1 },
  { rows: 8, cols: 8, targets: 2, depots: 3, minActs: 2, maxActs: 3, slack: 0, fires: 1 },
  { rows: 9, cols: 9, targets: 2, depots: 4, minActs: 3, maxActs: 4, slack: 0, fires: 2 },
] as const

/** Fewest tool actions a level must need.  Edo's brigade also spends turns walking, so its D4 asks one fewer. */
export function minActsFor(rules: Rules, d: Difficulty): number {
  return TIERS[d - 1].minActs - (rules.brigadeReach > 0 && d === 4 ? 1 : 0)
}

const DIRS: Wind[] = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }]
const COMPASS: Wind[] = [
  { dr: -1, dc: 0 }, { dr: -1, dc: 1 }, { dr: 0, dc: 1 }, { dr: 1, dc: 1 },
  { dr: 1, dc: 0 }, { dr: 1, dc: -1 }, { dr: 0, dc: -1 }, { dr: -1, dc: -1 },
]
const BUCKET_REACH = 2
const WET_TURNS = 3
const TURN_CAP = 80

export const isFuel = (k: Kind) => k === 'timber' || k === 'stone'
export const windAt = (level: Level, turn: number): Wind => level.winds[Math.min(turn, level.winds.length - 1)]

export function initialState(level: Level): State {
  const n = level.rows * level.cols
  const fire = new Array<number>(n).fill(0)
  for (const f of level.fires) fire[f] = 1
  return {
    turn: 0, kind: [...level.kind], fire, expo: new Array<number>(n).fill(0), wet: new Array<number>(n).fill(0),
    tools: { ...level.tools }, brigade: level.brigade,
  }
}

const cheb = (level: Level, a: number, b: number) =>
  Math.max(Math.abs(Math.floor(a / level.cols) - Math.floor(b / level.cols)), Math.abs((a % level.cols) - (b % level.cols)))

function plus(level: Level, i: number): number[] {
  const r = Math.floor(i / level.cols), c = i % level.cols
  const out = [i]
  for (const d of DIRS) {
    const rr = r + d.dr, cc = c + d.dc
    if (rr >= 0 && cc >= 0 && rr < level.rows && cc < level.cols) out.push(rr * level.cols + cc)
  }
  return out
}

const nearWater = (level: Level, s: State, i: number) => {
  const r = Math.floor(i / level.cols), c = i % level.cols
  for (let j = 0; j < s.kind.length; j++) {
    if (s.kind[j] !== 'water') continue
    if (Math.abs(Math.floor(j / level.cols) - r) + Math.abs((j % level.cols) - c) <= BUCKET_REACH) return true
  }
  return false
}

/** Why an action is not allowed, or null when it is. */
export function illegal(level: Level, s: State, a: Action, names: Names = namesFor(level.rules)): string | null {
  if (a.t === 'wait') return null
  const i = a.i
  if (i < 0 || i >= s.kind.length) return 'Off the map'
  if (a.t !== 'move' && (s.tools[a.t] ?? 0) <= 0) return 'None left'
  if (level.rules.brigadeReach > 0 && cheb(level, s.brigade, i) > level.rules.brigadeReach) return 'Too far from the brigade'
  const protectedCell = level.targets.includes(i) || level.depots.includes(i)
  switch (a.t) {
    case 'move': return null
    case 'hook':
      if (s.kind[i] !== 'timber') return 'Hooks only pull down timber houses'
      if (s.fire[i] !== 0) return 'Already burning'
      if (protectedCell) return 'That is the building you came for'
      if (plus(level, i).some(j => s.fire[j] > 0)) return 'Too hot: it is next to the fire'
      return null
    case 'powder':
      if (s.kind[i] === 'water') return 'Not in the river'
      if (plus(level, i).some(j => level.targets.includes(j) || level.depots.includes(j))) return 'The blast would hit a marked building'
      return null
    case 'bucket':
      if (!isFuel(s.kind[i]) || s.fire[i] < 0) return 'Nothing to soak'
      if (!nearWater(level, s, i)) return 'Too far from water'
      return null
    case 'torch':
      if (!isFuel(s.kind[i]) || s.fire[i] !== 0) return 'Nothing to light'
      if (level.targets.includes(i)) return `Not the ${names.target}!`
      return null
  }
}

/** The fire moves one turn (mutates s). `src`, when given, records which fire lit each cell. */
function spread(level: Level, s: State, src?: number[]) {
  const { rows, cols, rules } = level
  const w = windAt(level, s.turn)
  const n = rows * cols
  const hit = new Int32Array(n).fill(-1)
  for (let i = 0; i < n; i++) {
    if (s.fire[i] <= 0) continue
    const age = s.fire[i] - 1
    const r = Math.floor(i / cols), c = i % cols
    const light = (j: number) => {
      if (isFuel(s.kind[j]) && s.fire[j] === 0 && s.wet[j] === 0 && hit[j] < 0) hit[j] = i
    }
    for (const d of DIRS) {
      const rr = r + d.dr, cc = c + d.dc
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue
      const dot = d.dr * w.dr + d.dc * w.dc
      if (dot > 0 || (dot === 0 && age >= rules.crossDelay) || (dot < 0 && rules.upwind && age >= 1)) light(rr * cols + cc)
    }
    if (age >= 1) {
      for (let k = 2; k <= rules.spot; k++) {
        const rr = r + k * w.dr, cc = c + k * w.dc
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) break
        light(rr * cols + cc)
      }
    }
  }
  for (let i = 0; i < n; i++) {
    if (s.fire[i] <= 0) continue
    s.fire[i]++
    const life = s.kind[i] === 'stone' ? 3 : rules.timberBurn
    if (s.fire[i] - 1 >= life) s.fire[i] = -1
  }
  for (let j = 0; j < n; j++) {
    if (hit[j] < 0) continue
    s.expo[j]++
    const need = s.kind[j] === 'stone' ? rules.stoneResist : 1
    if (s.expo[j] >= need) { s.fire[j] = 1; if (src) src[j] = hit[j] }
  }
  for (let j = 0; j < n; j++) if (s.wet[j] > 0) s.wet[j]--
  s.turn++
}

function clone(s: State): State {
  return { turn: s.turn, kind: [...s.kind], fire: [...s.fire], expo: [...s.expo], wet: [...s.wet], tools: { ...s.tools }, brigade: s.brigade }
}

/** Apply one action and one turn of fire. Returns null when the action is not allowed. */
export function step(level: Level, s0: State, a: Action, src?: number[]): State | null {
  if (illegal(level, s0, a)) return null
  const s = clone(s0)
  if (a.t !== 'wait') {
    const i = a.i
    if (a.t !== 'move') s.tools[a.t] = (s.tools[a.t] ?? 0) - 1
    if (level.rules.brigadeReach > 0) s.brigade = i
    if (a.t === 'hook') s.kind[i] = 'rubble'
    else if (a.t === 'powder') {
      for (const j of plus(level, i)) if (isFuel(s.kind[j]) && s.fire[j] === 0) s.kind[j] = 'rubble'
    } else if (a.t === 'bucket') {
      if (s.fire[i] > 0) s.fire[i] = -1
      else s.wet[i] = WET_TURNS
    } else if (a.t === 'torch') s.fire[i] = 1
  }
  spread(level, s, src)
  return s
}

export const burning = (s: State) => s.fire.some(f => f > 0)

export interface Status { won: boolean; lost: string | null }

export function status(level: Level, s: State, names: Names = namesFor(level.rules)): Status {
  for (const t of level.targets) if (s.fire[t] !== 0) return { won: false, lost: `The ${names.target} caught fire` }
  const lit = burning(s)
  if (level.rules.offense) {
    const all = level.depots.every(d => s.fire[d] !== 0)
    if (!all && s.turn >= level.deadline) return { won: false, lost: `${names.enemy} reached the stores` }
    if (!all && !lit && (s.tools.torch ?? 0) <= 0) return { won: false, lost: 'The fires died out with stores still standing' }
    return { won: all && !lit, lost: null }
  }
  return { won: !lit, lost: null }
}
const CONFIG_NAMES = new Map<Rules, Names>(Object.values(CONFIGS).map(c => [c.rules, { target: c.target, enemy: c.enemy ?? 'The enemy' }]))
// Hand-built levels fall back to the config with the same kind of goal.
const namesFor = (rules: Rules): Names =>
  CONFIG_NAMES.get(rules) ?? (rules.offense ? { target: 'Kremlin', enemy: 'The Grande Armée' } : { target: 'marked building', enemy: 'The enemy' })

interface Run { end: State; at: number[]; src: number[]; status: Status }

/** Let the fire run with no more actions. `free` ignores win/lose and runs to the cap. */
export function runIdle(level: Level, s0: State, until = TURN_CAP, free = false): Run {
  const n = s0.kind.length
  const at = s0.fire.map(f => (f !== 0 ? s0.turn : -1))
  const src = new Array<number>(n).fill(-1)
  let s = s0
  let st = status(level, s)
  while (s.turn < until && burning(s) && (free || (!st.won && !st.lost))) {
    s = step(level, s, { t: 'wait' }, src)!
    for (let i = 0; i < n; i++) if (at[i] < 0 && s.fire[i] !== 0) at[i] = s.turn
    st = status(level, s)
  }
  // In Moscow the deadline may still be ahead when the fire is out: let the clock run.
  if (!free && level.rules.offense && !st.won && !st.lost && !burning(s)) {
    const t = { ...clone(s), turn: Math.max(s.turn, level.deadline) }
    st = status(level, t)
    s = t
  }
  return { end: s, at, src, status: st }
}

// ── Solver ─────────────────────────────────────────────────────────────────

/** Cells (not yet burning) on the fire's path to the first target it would burn, nearest the target first. */
function threatChain(level: Level, s: State, run: Run): number[] {
  let best = -1
  for (const t of level.targets) if (run.at[t] >= 0 && (best < 0 || run.at[t] < run.at[best])) best = t
  if (best < 0) return []
  const out: number[] = []
  let c = run.src[best]
  while (c >= 0 && s.fire[c] === 0) { out.push(c); c = run.src[c] }
  return out
}

/** Stores that the fire from state `s` lights by the deadline. */
function storesLit(level: Level, s: State): number {
  const run = runIdle(level, s, level.deadline, true)
  return level.depots.filter(d => run.at[d] >= 0 && run.at[d] <= level.deadline).length
}

function towards(level: Level, s: State, goal: number): Action | null {
  const reach = level.rules.brigadeReach
  let best = -1, bd = Infinity
  for (let j = 0; j < s.kind.length; j++) {
    if (cheb(level, s.brigade, j) > reach || j === s.brigade) continue
    const d = cheb(level, j, goal)
    if (d < bd) { bd = d; best = j }
  }
  return best >= 0 && bd < cheb(level, s.brigade, goal) ? { t: 'move', i: best } : null
}

function candidates(level: Level, s: State, run: Run, freeLeft: number): Action[] {
  const out: Action[] = []
  const seen = new Set<string>()
  const add = (a: Action) => {
    const k = a.t === 'wait' ? 'w' : `${a.t}${a.i}`
    if (seen.has(k) || illegal(level, s, a)) return
    seen.add(k); out.push(a)
  }
  const chain = threatChain(level, s, run)
  const tools = (['hook', 'powder', 'bucket'] as Tool[]).filter(t => (s.tools[t] ?? 0) > 0)
  for (const c of chain) for (const t of tools) add({ t, i: c })
  if (level.rules.offense && (s.tools.torch ?? 0) > 0) {
    const base = storesLit(level, s)
    if (base < level.depots.length) {
      const scored: { i: number; v: number }[] = []
      for (let i = 0; i < s.kind.length; i++) {
        if (illegal(level, s, { t: 'torch', i })) continue
        const near = level.depots.some(d => s.fire[d] === 0 && cheb(level, d, i) <= 4)
        if (!near) continue
        const v = storesLit(level, step(level, s, { t: 'torch', i })!)
        if (v > base) scored.push({ i, v })
      }
      scored.sort((a, b) => b.v - a.v || a.i - b.i)
      for (const x of scored.slice(0, 4)) add({ t: 'torch', i: x.i })
    }
  }
  if (freeLeft > 0) {
    if (level.rules.brigadeReach > 0) for (const c of chain.slice(0, 3)) { const m = towards(level, s, c); if (m) add(m) }
    if ((s.tools.bucket ?? 0) > 0) add({ t: 'wait' })
  }
  return out
}

export interface Solution { plan: Action[]; acts: number }

/**
 * Iterative deepening over the number of tool actions.  Moves and waits are
 * free but limited to `free` per plan.  Returns a full plan, waits included,
 * that ends in a win.
 */
export function solve(level: Level, start: State = initialState(level), maxActs = 4, nodeCap = level.rules.brigadeReach > 0 ? 4000 : 2500,
  free = level.rules.brigadeReach > 0 ? 6 : 3): Solution | null {
  const first = runIdle(level, start)
  if (first.status.won) return { plan: new Array<Action>(first.end.turn - start.turn).fill({ t: 'wait' }), acts: 0 }
  for (let k = 1; k <= maxActs; k++) {
    let nodes = 0
    const seen = new Set<string>()
    const plan: Action[] = []
    const dfs = (s: State, left: number, freeLeft: number): boolean => {
      if (++nodes > nodeCap) return false
      const st = status(level, s)
      if (st.lost) return false
      if (st.won) return true
      const run = runIdle(level, s)
      if (run.status.won) { for (let t = s.turn; t < run.end.turn; t++) plan.push({ t: 'wait' }); return true }
      if (left === 0) return false
      const key = `${left}|${freeLeft}|${s.turn}|${s.brigade}|${s.kind.join('')}|${s.fire.join(',')}|${s.wet.join('')}`
      if (seen.has(key)) return false
      seen.add(key)
      for (const a of candidates(level, s, run, freeLeft)) {
        const s2 = step(level, s, a)
        if (!s2) continue
        const isFree = a.t === 'wait' || a.t === 'move'
        plan.push(a)
        if (dfs(s2, isFree ? left : left - 1, isFree ? freeLeft - 1 : freeLeft)) return true
        plan.pop()
      }
      return false
    }
    if (dfs(start, k, free)) return { plan, acts: k }
  }
  return null
}

/** Play a plan from the start; returns the final status (waits out the fire after the plan ends). */
export function replay(level: Level, plan: Action[]): { state: State; status: Status; ok: boolean } {
  let s = initialState(level)
  for (const a of plan) {
    const st = status(level, s)
    if (st.won || st.lost) return { state: s, status: st, ok: true }
    const s2 = step(level, s, a)
    if (!s2) return { state: s, status: { won: false, lost: 'illegal' }, ok: false }
    s = s2
  }
  const run = runIdle(level, s)
  return { state: run.end, status: run.status, ok: true }
}

/** Naive plan 1: fight at the front — each turn act on the threatened cell closest to the fire. */
export function frontGreedy(level: Level): boolean {
  let s = initialState(level)
  for (let guard = 0; guard < TURN_CAP; guard++) {
    const st = status(level, s)
    if (st.won) return true
    if (st.lost || s.turn >= TURN_CAP) return false
    const run = runIdle(level, s)
    let a: Action = { t: 'wait' }
    if (level.rules.offense) {
      const cands = candidates(level, s, run, 0).filter(x => x.t === 'torch')
      if (cands.length) a = cands[0]
    } else {
      const chain = [...threatChain(level, s, run)].reverse()
      outer: for (const c of chain) for (const t of ['hook', 'powder', 'bucket'] as Tool[]) {
        const x: Action = { t, i: c }
        if (!illegal(level, s, x)) { a = x; break outer }
      }
      if (a.t === 'wait' && level.rules.brigadeReach > 0 && chain.length) a = towards(level, s, chain[0]) ?? a
    }
    s = step(level, s, a) ?? step(level, s, { t: 'wait' })!
    if (!burning(s) && !level.rules.offense) return status(level, s).won
  }
  return false
}

/** Naive plan 2: ring the targets — pull down the houses around each marked building. */
export function ringGreedy(level: Level): boolean {
  if (level.rules.offense) return false
  let s = initialState(level)
  const ring = level.targets.flatMap(t => plus(level, t).slice(1))
  for (let guard = 0; guard < TURN_CAP; guard++) {
    const st = status(level, s)
    if (st.won) return true
    if (st.lost) return false
    let a: Action = { t: 'wait' }
    for (const c of ring) {
      for (const t of ['hook', 'powder'] as Tool[]) {
        const x: Action = { t, i: c }
        if (!illegal(level, s, x) && isFuel(s.kind[c])) { a = x; break }
      }
      if (a.t !== 'wait') break
      if (level.rules.brigadeReach > 0 && isFuel(s.kind[c]) && s.fire[c] === 0) { a = towards(level, s, c) ?? a; if (a.t !== 'wait') break }
    }
    s = step(level, s, a) ?? step(level, s, { t: 'wait' })!
  }
  return false
}

// ── Generation ─────────────────────────────────────────────────────────────

function windSchedule(rules: Rules, rng: Rng): Wind[] {
  if (!rules.shifting) return [rules.wind]
  let k = Math.floor(rng() * 8)
  const out: Wind[] = []
  for (let t = 0; t < 40; t++) {
    if (t > 0 && t % 3 === 0) k = (k + (rng() < 0.5 ? 1 : 7) + (rng() < 0.3 ? (rng() < 0.5 ? 1 : 7) : 0)) % 8
    out.push(COMPASS[k])
  }
  return out
}

function buildMap(rules: Rules, d: Difficulty, rng: Rng): Level {
  const tier = TIERS[d - 1]
  const { rows, cols } = tier
  const n = rows * cols
  const kind: Kind[] = new Array<Kind>(n)
  for (let i = 0; i < n; i++) {
    const x = rng()
    kind[i] = x < 0.62 ? 'timber' : x < 0.74 ? 'stone' : 'open'
  }
  if (rules.water === 'south') for (let c = 0; c < cols; c++) kind[(rows - 1) * cols + c] = 'water'
  if (rules.water === 'fountains') {
    for (let k = 0; k < 2 + (d >= 3 ? 1 : 0); k++) kind[Math.floor(rng() * n)] = 'water'
  }
  if (rules.water === 'river') {
    const c0 = 2 + Math.floor(rng() * (cols - 4))
    for (let r = 0; r < rows; r++) kind[r * cols + c0] = 'water'
  }
  if (rules.avenue) {
    const c0 = 2 + Math.floor(rng() * (cols - 4))
    for (let r = 0; r < rows - 1; r++) if (rng() < 0.7) kind[r * cols + c0] = 'open'
  }
  const winds = windSchedule(rules, rng)
  const w = winds[0]
  const proj = (i: number) => Math.floor(i / cols) * w.dr + (i % cols) * w.dc
  const fuel = Array.from({ length: n }, (_, i) => i).filter(i => isFuel(kind[i]))
  const byProj = [...fuel].sort((a, b) => proj(a) - proj(b) || a - b)
  const pickFrom = (list: number[], taken: Set<number>) => {
    const free = list.filter(i => !taken.has(i))
    return free.length ? free[Math.floor(rng() * free.length)] : -1
  }
  const taken = new Set<number>()
  const q = Math.max(3, Math.floor(byProj.length * 0.3))
  const lo = byProj.slice(0, q), hi = byProj.slice(-q)
  const targets: number[] = [], depots: number[] = [], fires: number[] = []
  let brigade = 0
  if (rules.offense) {
    // The Kremlin: a stone fortress downwind, near the river.
    const k = pickFrom(hi, taken)
    if (k >= 0) { kind[k] = 'stone'; targets.push(k); taken.add(k) }
    const mid = byProj.slice(Math.floor(byProj.length * 0.25))
    for (let j = 0; j < tier.depots; j++) {
      const dep = pickFrom(mid.filter(i => targets.every(t => cheb({ cols } as Level, i, t) >= 2) && depots.every(x => cheb({ cols } as Level, i, x) >= 2)), taken)
      if (dep >= 0) { kind[dep] = 'timber'; depots.push(dep); taken.add(dep) }
    }
  } else {
    for (let j = 0; j < tier.fires; j++) { const f = pickFrom(lo, taken); if (f >= 0) { fires.push(f); taken.add(f) } }
    for (let j = 0; j < tier.targets; j++) {
      const t = pickFrom(hi.filter(i => fires.every(f => cheb({ cols } as Level, i, f) >= 3)), taken)
      if (t >= 0) { targets.push(t); taken.add(t) }
    }
    if (rules.brigadeReach > 0) {
      const mid = Array.from({ length: n }, (_, i) => i).filter(i => !taken.has(i) && kind[i] !== 'water')
      brigade = mid[Math.floor(rng() * mid.length)]
    }
  }
  return {
    rows, cols, kind, targets, depots, fires, winds, tools: { ...rules.tools }, brigade,
    deadline: rules.offense ? rows + cols + 4 : TURN_CAP, minActs: 0, rules,
  }
}

function usage(plan: Action[]): Partial<Record<Tool, number>> {
  const u: Partial<Record<Tool, number>> = {}
  for (const a of plan) if (a.t !== 'wait' && a.t !== 'move') u[a.t] = (u[a.t] ?? 0) + 1
  return u
}

const cache = new Map<string, Level>()

export function generate(rules: Rules, d: Difficulty, seed: number): Level {
  const key = `${JSON.stringify(rules)}|${d}|${seed}`
  const hit = cache.get(key)
  if (hit) return hit
  const tier = TIERS[d - 1]
  let fallback: { level: Level; score: number } | null = null
  for (let attempt = 0; attempt < 120; attempt++) {
    const rng = mulberry32((seed ^ hashString(`firebreak:${d}:${attempt}`)) >>> 0)
    const base = buildMap(rules, d, rng)
    if (base.targets.length < (rules.offense ? 1 : tier.targets) || (rules.offense ? base.depots.length < tier.depots : base.fires.length < tier.fires)) continue
    const idle = runIdle(base, initialState(base))
    if (idle.status.won) continue
    const sol = solve(base, initialState(base), tier.maxActs)
    if (!sol || sol.acts === 0) continue
    const u = usage(sol.plan)
    const tools: Partial<Record<Tool, number>> = {}
    for (const t of Object.keys(rules.tools) as Tool[]) tools[t] = t === 'move' ? 99 : (u[t] ?? 0)
    if (tier.slack) {
      const spare: Tool = rules.offense ? 'hook' : (rules.tools.hook ? 'hook' : 'powder')
      tools[spare] = (tools[spare] ?? 0) + tier.slack
    }
    if (rules.offense && (tools.torch ?? 0) >= base.depots.length) continue
    const level: Level = { ...base, tools, minActs: sol.acts }
    if (rules.offense) {
      const r = replay(level, sol.plan)
      if (!r.status.won) continue
      // Tighten the deadline to the plan's last store plus a little slack.
      const run = (() => {
        let s = initialState(level); const at = new Array<number>(s.kind.length).fill(-1)
        for (const a of sol.plan) { s = step(level, s, a)!; s.fire.forEach((f, i) => { if (f !== 0 && at[i] < 0) at[i] = s.turn }) }
        const rest = runIdle(level, s, TURN_CAP, true)
        return level.depots.map(dp => (at[dp] >= 0 ? at[dp] : rest.at[dp]))
      })()
      level.deadline = Math.max(...run) + [2, 1, 1, 0][d - 1]
    }
    if (!replay(level, sol.plan).status.won) continue
    // The level's own (tight) budget and deadline must still be solvable from scratch.
    if (!solve(level, initialState(level), tier.maxActs)) continue
    if (runIdle(level, initialState(level)).status.won) continue
    const naive = frontGreedy(level) || ringGreedy(level)
    const need = minActsFor(rules, d)
    const score = Math.min(sol.acts, need) * 10 + (naive ? 0 : 5)
    if (!fallback || score > fallback.score) fallback = { level, score }
    if (sol.acts < need && attempt < 90) continue
    if (d >= 3 && naive && attempt < 110) continue
    cache.set(key, level)
    return level
  }
  if (!fallback) throw new Error('firebreak: no level')
  cache.set(key, fallback.level)
  return fallback.level
}

// ── Component ──────────────────────────────────────────────────────────────

const TOOL_INFO: Record<Tool, { icon: string; label: string }> = {
  hook: { icon: '🪝', label: 'Pull down' },
  powder: { icon: '💥', label: 'Gunpowder' },
  bucket: { icon: '🪣', label: 'Buckets' },
  torch: { icon: '🔥', label: 'Torch' },
  move: { icon: '🚶', label: 'Move brigade' },
}
const ARROW: Record<string, string> = {
  '-1,0': '↑', '-1,1': '↗', '0,1': '→', '1,1': '↘', '1,0': '↓', '1,-1': '↙', '0,-1': '←', '-1,-1': '↖',
}
const FROM: Record<string, string> = {
  '-1,0': 'S', '-1,1': 'SW', '0,1': 'W', '1,1': 'NW', '1,0': 'N', '1,-1': 'NE', '0,-1': 'E', '-1,-1': 'SE',
}
const wkey = (w: Wind) => `${w.dr},${w.dc}`

const CELL = 36

export default function FirebreakGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'london-1666')
  const level = useMemo(() => generate(cfg.rules, difficulty, seed), [cfg.rules, difficulty, seed])
  const names: Names = { target: cfg.target, enemy: cfg.enemy ?? 'The enemy' }
  const tools = (Object.keys(level.tools) as Tool[]).filter(t => (level.tools[t] ?? 0) > 0 || t === 'move')
  const [state, setState] = useState<State>(() => initialState(level))
  const [tool, setTool] = useState<Tool>(tools[0] ?? 'hook')
  const [msg, setMsg] = useState('')
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const live = useRef({ state, settled })
  live.current = { state, settled }
  useEffect(() => { setState(initialState(level)); setMsg('') }, [level])

  const advance = (next: State) => {
    live.current = { ...live.current, state: next }
    setState(next)
    const st = status(level, next, names)
    if (st.lost) { live.current.settled = true; lose(st.lost) }
    else if (st.won) { live.current.settled = true; win() }
  }

  const act = (a: Action) => {
    const cur = live.current
    if (cur.settled) return
    const why = illegal(level, cur.state, a, names)
    if (why) { setMsg(why); return }
    setMsg('')
    advance(step(level, cur.state, a)!)
  }

  const burnOut = () => {
    const cur = live.current
    if (cur.settled) return
    const run = runIdle(level, cur.state)
    advance(run.end)
  }

  const preview = useMemo(() => {
    if (difficulty > 2 || settled) return null
    const s = step(level, state, { t: 'wait' })
    return s ? s.fire.map((f, i) => f > 0 && state.fire[i] === 0) : null
  }, [difficulty, settled, level, state])

  const w = windAt(level, state.turn)
  const W = level.cols * CELL, H = level.rows * CELL
  const toolsLeft = (Object.keys(state.tools) as Tool[]).some(t => t !== 'move' && (state.tools[t] ?? 0) > 0)
  const litStores = level.depots.filter(d => state.fire[d] !== 0).length

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p data-testid="fb-turn" className="font-bold text-ink-2">Turn {state.turn}</p>
          <p data-testid="fb-wind">Wind from {FROM[wkey(w)]} <span className="text-ink-2 font-bold">{ARROW[wkey(w)]}</span> ×{level.rules.spot}</p>
          {level.rules.offense && (
            <p data-testid="fb-stores" className={level.deadline - state.turn <= 2 ? 'text-red-600 font-bold' : ''}>
              Stores {litStores}/{level.depots.length} · army in {Math.max(0, level.deadline - state.turn)}
            </p>
          )}
        </div>
      </div>

      {level.rules.shifting && (
        <div className="flex gap-1 justify-center" aria-label="wind forecast">
          {Array.from({ length: 8 }, (_, k) => {
            const t = state.turn + k
            return (
              <span key={k} className={`w-6 h-6 rounded text-xs leading-6 text-center border
                ${k === 0 ? 'bg-accent text-accent-fg border-accent' : 'bg-paper border-line text-ink-2'}`}>
                {ARROW[wkey(windAt(level, t))]}
              </span>
            )
          })}
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[400px] mx-auto rounded-lg border border-line touch-manipulation select-none" role="img" aria-label="city map">
        {state.kind.map((k, i) => {
          const r = Math.floor(i / level.cols), c = i % level.cols
          const x = c * CELL, y = r * CELL
          const f = state.fire[i]
          const target = level.targets.includes(i), depot = level.depots.includes(i)
          const fill =
            f > 0 ? '#f97316' : f < 0 ? '#44403c' :
            k === 'water' ? '#3b82f6' : k === 'open' ? '#e9d8a6' : k === 'rubble' ? '#a8a29e' :
            k === 'stone' ? '#9ca3af' : '#b7814a'
          const inReach = level.rules.brigadeReach > 0 && !settled && cheb(level, state.brigade, i) <= level.rules.brigadeReach
          return (
            <g key={i} data-testid={`fb-cell-${i}`} data-kind={k} data-fire={f} onClick={() => act({ t: tool, i })} style={{ cursor: settled ? 'default' : 'pointer' }}>
              <rect x={x} y={y} width={CELL} height={CELL} fill={fill} stroke="#00000022" strokeWidth={0.5} />
              {inReach && <rect x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} fill="#ffffff22" stroke="#fde68a" strokeWidth={1} />}
              {k === 'timber' && f === 0 && !target && !depot && <path d={`M${x + 10} ${y + 22} l8 -9 l8 9 v8 h-16 z`} fill="#7c4a1e" opacity={0.75} />}
              {k === 'stone' && f === 0 && !target && <rect x={x + 10} y={y + 12} width={16} height={16} fill="#6b7280" />}
              {k === 'rubble' && <text x={x + CELL / 2} y={y + CELL / 2 + 4} textAnchor="middle" fontSize={11} fill="#57534e">▦</text>}
              {k === 'water' && <text x={x + CELL / 2} y={y + CELL / 2 + 5} textAnchor="middle" fontSize={13} fill="#dbeafe">≈</text>}
              {f > 0 && <text x={x + CELL / 2} y={y + CELL / 2 + 6} textAnchor="middle" fontSize={17}>🔥</text>}
              {state.wet[i] > 0 && f === 0 && <rect x={x + 3} y={y + 3} width={CELL - 6} height={CELL - 6} rx={4} fill="none" stroke="#2563eb" strokeWidth={2.5} />}
              {target && f === 0 && <text x={x + CELL / 2} y={y + CELL / 2 + 6} textAnchor="middle" fontSize={17}>{level.rules.offense ? '🏰' : '⭐'}</text>}
              {depot && f === 0 && <text x={x + CELL / 2} y={y + CELL / 2 + 6} textAnchor="middle" fontSize={16}>🌾</text>}
              {preview && preview[i] && <rect x={x + 3} y={y + 3} width={CELL - 6} height={CELL - 6} rx={5} fill="none" stroke="#dc2626" strokeWidth={2} strokeDasharray="4 3" />}
              {level.rules.brigadeReach > 0 && state.brigade === i && <text x={x + CELL - 3} y={y + 11} textAnchor="end" fontSize={11}>🚒</text>}
            </g>
          )
        })}
      </svg>

      <p className="text-[11px] text-center min-h-[16px] text-red-600 font-bold" data-testid="fb-msg">{msg}</p>

      {!settled && (
        <>
          <div className="flex gap-1.5 flex-wrap justify-center">
            {tools.map(t => (
              <button key={t} type="button" data-testid={`fb-tool-${t}`} onClick={() => setTool(t)}
                className={`h-10 px-3 rounded-lg border text-xs font-bold ${tool === t ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink-2'}`}>
                {TOOL_INFO[t].icon} {TOOL_INFO[t].label}{t !== 'move' ? ` ×${state.tools[t] ?? 0}` : ''}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" data-testid="fb-wait" onClick={() => act({ t: 'wait' })}
              className="flex-1 h-10 rounded-lg border text-xs font-bold bg-panel border-line text-ink-2 hover:border-accent/50">
              ⏳ Wait a turn
            </button>
            <button type="button" data-testid="fb-burnout" onClick={burnOut}
              className={`flex-1 h-10 rounded-lg border text-xs font-bold ${toolsLeft ? 'bg-paper border-line text-muted' : 'bg-panel border-accent text-ink-2'}`}>
              ⏩ Let it burn out
            </button>
          </div>
        </>
      )}
      <p className="text-muted text-[10px] -mt-1">
        Pick a tool, then tap a cell: that is your turn, and the fire moves. Fire always spreads downwind, sideways only after a turn
        {level.rules.spot > 1 ? `, and sparks fly up to ${level.rules.spot} cells downwind` : ''}.
        {difficulty <= 2 && ' Dashed red squares catch next turn.'}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact}
        winTitle={level.rules.offense ? `The stores are ash and the ${names.target} stands!` : 'The fire is out and the marked buildings stand!'}
        loseTitle={reason ?? 'The city burns'} />
    </div>
  )
}
