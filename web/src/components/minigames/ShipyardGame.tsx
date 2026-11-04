import { useMemo, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, shuffle, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Shipyard — saw a ship's parts out of a limited stock of timber.  Every log
// you put on the saw pit takes a day, and the yard has only so many days
// before the order is due.  Saw cuts are for good: you cannot glue a log
// back together, so a careless cut can leave a part with nowhere to come from.
//
// Each config changes the cutting RULE, not just the size:
//   arsenal   LINE      parts come down the production line in a fixed order and
//                       there are only two saw benches; loading a third log means
//                       scrapping what is left on a bench
//   viking    STRAKES   strakes are cut in order, keel upwards, and each log gives
//                       a run of consecutive strakes: once you leave a log it is done
//   zheng-he  BULKHEAD  parts carry their compartment number; one log may never feed
//                       two neighbouring compartments
//   victory   COMPASS   knees must come from curved compass timber; straight parts
//                       may use it too, but compass timber is scarce
//   liberty   WELD      a section too long for the plate left can be welded from two
//                       pieces, but the yard has only a few welds to spare
//
//   D1  2 days, 1 spare log, 2 units of slack, parts 2–4    ≈ 1 min
//   D2  3 days, 1 spare,     1 unit of slack,  parts 2–5
//   D3  4 days, 2 spares,    1 unit of slack,  parts 2–5
//   D4  5 days, 2 spares,    no slack,         parts 2–6    ≈ 3 min
//
// Every level is made by sawing the day's logs into parts, so the saw plan
// that produced it is a known winning line; the tests replay it through the
// rules.  From D2 a level is kept only when the naive "first log that fits"
// sawyer runs out of timber or days on it.

export type Mode = 'line' | 'strakes' | 'bulkhead' | 'compass' | 'weld'

interface ShipyardConfig {
  title: string
  intro: string
  /** The yard's rule, in a few words. */
  rule: string
  fact: string
  mode: Mode
  /** Names for ordinary parts, used in turn. */
  names: string[]
  knee?: string
  timber: string
  ship: string
}

export const CONFIGS: Record<string, ShipyardConfig> = {
  arsenal: {
    title: 'The Arsenal of Venice, 1574',
    intro: 'Parts come down the production line in a fixed order and must be sawn as they arrive. You have two saw benches: loading a fresh log onto a full pair means scrapping one bench’s offcut.',
    rule: 'Production line, two benches',
    fact: 'When Henri III of France visited Venice in 1574, the workers of the Arsenal are said to have assembled a complete galley while he dined. At its height the Arsenal employed some 16,000 people and could fit out galleys from stored, standard parts.',
    mode: 'line',
    names: ['Keel', 'Frame', 'Oar', 'Plank', 'Yard', 'Bench', 'Rib', 'Stem'],
    timber: 'oak log', ship: 'galley',
  },
  viking: {
    title: 'A Clinker Longship',
    intro: 'Strakes go on keel upwards, each overlapping the one below, so they are cut strictly in order. A log gives a run of consecutive strakes; once you start a new log the old one is finished.',
    rule: 'Strakes in order, one log at a time',
    fact: 'Viking shipwrights split oak trunks radially into planks rather than sawing them, and riveted each strake over the one below. The longship Skuldelev 2, scuttled in Roskilde Fjord, was built of oak felled near Dublin in about 1042.',
    mode: 'strakes',
    names: ['Strake'],
    timber: 'oak trunk', ship: 'longship',
  },
  'zheng-he': {
    title: 'Zheng He’s Treasure Ship',
    intro: 'The hull is split by watertight bulkheads. Each part is marked with its compartment; one log may feed the same or distant compartments, but never two neighbouring ones.',
    rule: 'No log feeds neighbouring compartments',
    fact: 'Chinese shipwrights divided hulls with watertight bulkheads, so one holed compartment would not sink the ship — a design Europe adopted centuries later. The Ming history gives Zheng He’s largest treasure ships a length of 44 zhang, a size many modern scholars doubt.',
    mode: 'bulkhead',
    names: ['Plank', 'Bulkhead', 'Beam', 'Rib'],
    timber: 'fir log', ship: 'treasure ship',
  },
  victory: {
    title: 'HMS Victory, Chatham 1759',
    intro: 'Knees (⤵) bend round the corner of hull and deck, so they must be cut from curved compass timber, where the grain follows the bend. Straight parts may use compass timber too — but there is very little of it.',
    rule: 'Knees only from compass timber',
    fact: 'HMS Victory, laid down at Chatham in 1759, took some 6,000 trees, most of them oak. Shipwrights hunted for naturally curved “compass timber” for knees and frames: a knee sawn across the grain of a straight log would split.',
    mode: 'compass',
    names: ['Plank', 'Frame', 'Beam', 'Wale', 'Deck plank'],
    knee: 'Knee',
    timber: 'oak log', ship: 'ship of the line',
  },
  liberty: {
    title: 'A Liberty Ship, Richmond 1942',
    intro: 'Sections are cut from steel plate. A section longer than the plate left can be welded from two pieces — the rest is cut from another plate — but every weld uses up one of the welding crew’s shifts.',
    rule: 'Weld a section from two plates',
    fact: 'In November 1942 the Kaiser yard at Richmond, California, assembled the Liberty ship SS Robert E. Peary from prefabricated, welded sections in 4 days and 15 hours. American yards built 2,710 Liberty ships during the war.',
    mode: 'weld',
    names: ['Hull section', 'Deckhouse', 'Bulkhead', 'Double bottom', 'Bow section', 'Stern section'],
    timber: 'steel plate', ship: 'Liberty ship',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Model ─────────────────────────────────────────────────────────────────────

export interface Part { id: number; name: string; len: number; knee: boolean; comp: number }
export interface Log { id: number; len: number; compass: boolean }
export type Action = { t: 'cut'; part: number; log: number } | { t: 'scrap'; log: number }
export interface Level {
  mode: Mode
  logs: Log[]
  /** In 'line' and 'strakes' modes, this is the order parts must be cut. */
  parts: Part[]
  days: number
  welds: number
  /** The saw plan the level was made from: a known winning line. */
  plan: Action[]
}

export interface Piece { part: number; log: number; len: number }
export interface State {
  used: number[]
  started: boolean[]
  closed: boolean[]
  pieces: Piece[]
  /** Length of each part still to cut. */
  left: number[]
  daysUsed: number
  weldsUsed: number
  /** strakes: the log the last strake came from. */
  current: number | null
}

export interface Tier { logs: number; spares: number; slack: number; maxLen: number; partMax: number }
export function tierFor(d: Difficulty): Tier {
  return {
    logs: scale(d, [2, 3, 4, 5]),
    spares: scale(d, [1, 1, 2, 2]),
    slack: scale(d, [2, 1, 1, 0]),
    maxLen: scale(d, [9, 10, 11, 12]),
    partMax: scale(d, [4, 5, 5, 6]),
  }
}

export const queued = (mode: Mode) => mode === 'line' || mode === 'strakes'

export function initialState(level: Level): State {
  const n = level.logs.length
  return {
    used: Array(n).fill(0), started: Array(n).fill(false), closed: Array(n).fill(false),
    pieces: [], left: level.parts.map(p => p.len), daysUsed: 0, weldsUsed: 0, current: null,
  }
}

/** The next part on the line (queued modes), or null when all are cut. */
export function headPart(_level: Level, s: State): number | null {
  const i = s.left.findIndex(l => l > 0)
  return i < 0 ? null : i
}

const openCount = (s: State) => s.started.reduce((k, st, i) => k + (st && !s.closed[i] ? 1 : 0), 0)

/** Why a cut is not allowed, or null when it is. */
export function cutProblem(level: Level, s: State, part: number, log: number): string | null {
  const p = level.parts[part], L = level.logs[log]
  if (!p || !L || s.left[part] <= 0) return 'That part is already cut.'
  if (queued(level.mode) && headPart(level, s) !== part) return 'Parts must be cut in order — take the next one on the line.'
  if (s.closed[log]) return level.mode === 'strakes' ? 'That log is finished — strakes run on from the current log or a fresh one.' : 'That log has gone to the scrap pile.'
  if (level.mode === 'strakes' && s.started[log] && s.current !== log) return 'That log is finished.'
  if (!s.started[log]) {
    if (s.daysUsed >= level.days) return 'No days left to put another log on the saw pit.'
    if (level.mode === 'line' && openCount(s) >= 2) return 'Both benches are busy — scrap one bench’s offcut first.'
  }
  if (p.knee && !L.compass) return 'A knee must come from curved compass timber.'
  if (level.mode === 'bulkhead') {
    for (const pc of s.pieces) if (pc.log === log && Math.abs(level.parts[pc.part].comp - p.comp) === 1) return 'This log already feeds a neighbouring compartment.'
  }
  const space = L.len - s.used[log]
  if (s.left[part] > space) {
    if (level.mode === 'weld' && space > 0 && s.weldsUsed < level.welds) return null
    return 'Not enough length left in that log.'
  }
  return null
}

/** Apply an action; returns null if it is illegal. */
export function apply(level: Level, s: State, a: Action): State | null {
  if (a.t === 'scrap') {
    if (level.mode !== 'line' || !s.started[a.log] || s.closed[a.log]) return null
    const closed = [...s.closed]; closed[a.log] = true
    return { ...s, closed }
  }
  if (cutProblem(level, s, a.part, a.log)) return null
  const L = level.logs[a.log]
  const space = L.len - s.used[a.log]
  const len = Math.min(space, s.left[a.part])
  const welded = len < s.left[a.part]
  const used = [...s.used]; used[a.log] += len
  const left = [...s.left]; left[a.part] -= len
  const started = [...s.started], closed = [...s.closed]
  let daysUsed = s.daysUsed
  if (!started[a.log]) {
    started[a.log] = true; daysUsed++
    if (level.mode === 'strakes' && s.current !== null) closed[s.current] = true
  }
  return {
    used, started, closed, left, daysUsed,
    pieces: [...s.pieces, { part: a.part, log: a.log, len }],
    weldsUsed: s.weldsUsed + (welded ? 1 : 0),
    current: a.log,
  }
}

export function legalCuts(level: Level, s: State): Action[] {
  const out: Action[] = []
  const parts = queued(level.mode) ? [headPart(level, s)].filter((x): x is number => x !== null) : level.parts.map(p => p.id)
  for (const part of parts) for (const L of level.logs) if (!cutProblem(level, s, part, L.id)) out.push({ t: 'cut', part, log: L.id })
  return out
}

export const isWon = (s: State) => s.left.every(l => l === 0)

/** True when some cut is still possible (in 'line' mode, possibly after scrapping a bench). */
export function canProgress(level: Level, s: State): boolean {
  if (legalCuts(level, s).length) return true
  if (level.mode === 'line') {
    for (let i = 0; i < level.logs.length; i++) {
      const t = apply(level, s, { t: 'scrap', log: i })
      if (t && legalCuts(level, t).length) return true
    }
  }
  return false
}

export function status(level: Level, s: State): 'won' | 'lost' | null {
  if (isWon(s)) return 'won'
  return canProgress(level, s) ? null : 'lost'
}

/** Play a list of actions; returns the final state and whether every step was legal. */
export function replay(level: Level, actions: Action[]): { state: State; ok: boolean } {
  let s = initialState(level)
  for (const a of actions) {
    const t = apply(level, s, a)
    if (!t) return { state: s, ok: false }
    s = t
  }
  return { state: s, ok: true }
}

/**
 * The naive sawyer: takes parts in the listed order and puts each into the
 * first log that will take it — logs already started first, then fresh ones
 * by number — in 'line' mode scrapping the
 * first bench when neither fits.  Returns the final status.
 */
export function naivePlay(level: Level): 'won' | 'lost' {
  let s = initialState(level)
  for (let guard = 0; guard < 500; guard++) {
    if (isWon(s)) return 'won'
    const cuts = legalCuts(level, s) as { t: 'cut'; part: number; log: number }[]
    // Prefer whole cuts over welds, parts in list order, logs in number order.
    // Logs already on the saw pit come before fresh ones.
    const rank = (c: { part: number; log: number }) => (s.started[c.log] ? 0 : 1)
    const ordered = cuts.map((c, k) => ({ c, k })).sort((a, b) => rank(a.c) - rank(b.c) || a.k - b.k).map(x => x.c)
    const whole = ordered.filter(c => s.left[c.part] <= level.logs[c.log].len - s.used[c.log])
    const pick = whole[0] ?? ordered[0]
    if (pick) { s = apply(level, s, pick)!; continue }
    if (level.mode === 'line') {
      const bench = s.started.findIndex((st, i) => st && !s.closed[i])
      const t = bench >= 0 ? apply(level, s, { t: 'scrap', log: bench }) : null
      if (t && legalCuts(level, t).length) { s = t; continue }
    }
    return 'lost'
  }
  return 'lost'
}

/**
 * Exhaustive search over legal actions (with a memo of seen positions), for
 * checking a level without its saw plan.  In the free-order modes it always
 * cuts the first part still in the order, but may put it in any log, which
 * loses no solutions there.  Returns a winning action list, or null when none
 * exists (or the node budget runs out: `exhausted` tells which).
 */
export function solve(level: Level, budget = 200_000): { plan: Action[] | null; exhausted: boolean } {
  const seen = new Set<string>()
  let nodes = 0
  const path: Action[] = []
  const key = (s: State) => `${s.left.join(',')}|${s.used.join(',')}|${s.closed.map(Number).join('')}|${s.current}|${s.weldsUsed}|` +
    (level.mode === 'bulkhead' ? s.pieces.map(p => `${p.log}:${level.parts[p.part].comp}`).sort().join(',') : '')
  const dfs = (s: State): boolean => {
    if (isWon(s)) return true
    if (++nodes > budget) return false
    const k = key(s)
    if (seen.has(k)) return false
    seen.add(k)
    let acts: Action[] = legalCuts(level, s)
    if (!queued(level.mode) && level.mode !== 'weld') {
      const first = s.left.findIndex(l => l > 0)
      acts = acts.filter(a => a.t === 'cut' && a.part === first)
    }
    if (level.mode === 'line') s.started.forEach((st, i) => { if (st && !s.closed[i]) acts.push({ t: 'scrap', log: i }) })
    for (const a of acts) {
      const t = apply(level, s, a)
      if (!t) continue
      path.push(a)
      if (dfs(t)) return true
      path.pop()
    }
    return false
  }
  const ok = dfs(initialState(level))
  return { plan: ok ? [...path] : null, exhausted: nodes > budget }
}

/** Random lengths in [lo, hi] that add up to `total`. */
export function compose(total: number, lo: number, hi: number, rng: Rng): number[] {
  for (let attempt = 0; attempt < 50; attempt++) {
    const out: number[] = []
    let rem = total
    while (rem > 0) {
      const opts: number[] = []
      for (let v = lo; v <= Math.min(hi, rem); v++) if (rem - v === 0 || rem - v >= lo) opts.push(v)
      if (!opts.length) break
      const v = opts[Math.floor(rng() * opts.length)]
      out.push(v); rem -= v
    }
    if (rem === 0) return out
  }
  return [total]
}

const rand = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))

function nameParts(cfg: Pick<ShipyardConfig, 'names' | 'knee' | 'mode'>, parts: Omit<Part, 'name' | 'id'>[]): Part[] {
  let k = 0
  return parts.map((p, id) => ({
    ...p, id,
    name: p.knee ? cfg.knee ?? 'Knee'
      : cfg.mode === 'strakes' ? `Strake ${id + 1}`
      : cfg.names[k++ % cfg.names.length],
  }))
}

function buildOnce(mode: Mode, d: Difficulty, rng: Rng, cfg: Pick<ShipyardConfig, 'names' | 'knee' | 'mode'>): Level {
  const t = tierFor(d)
  const usedLens = Array.from({ length: t.logs }, () => rand(rng, 8, t.maxLen))
  // Which used logs keep slack at their end.
  const slackAt = Array(t.logs).fill(0)
  for (let k = 0; k < t.slack; k++) slackAt[Math.floor(rng() * t.logs)]++
  const compassCount = mode === 'compass' ? scale(d, [1, 1, 2, 2]) : 0
  type Raw = { len: number; knee: boolean; comp: number }
  const contents: Raw[][] = []
  const logKinds: boolean[] = []
  const comps = scale(d, [3, 4, 5, 6])
  for (let i = 0; i < t.logs; i++) {
    const compass = i < compassCount
    if (compass) usedLens[i] = rand(rng, 5, 7)
    logKinds.push(compass)
    const fill = Math.max(2, usedLens[i] - slackAt[i])
    let lens: number[]
    if (compass) {
      // Mostly knees; the last piece may be a short plain part.
      lens = compose(fill, 1, 3, rng)
    } else lens = compose(fill, 2, t.partMax, rng)
    // Bulkhead: the compartments one log feeds, never two neighbours.
    let pool = [1]
    if (mode === 'bulkhead') {
      const a = rand(rng, 1, comps)
      const far = Array.from({ length: comps }, (_, k) => k + 1).filter(c => Math.abs(c - a) >= 2)
      pool = far.length && rng() < 0.6 ? [a, far[Math.floor(rng() * far.length)]] : [a]
    }
    contents.push(lens.map((len, k) => ({
      len,
      knee: compass && (k < lens.length - 1 || lens.length === 1 || rng() < 0.5),
      comp: pool[Math.floor(rng() * pool.length)],
    })))
  }
  // Spare logs: plausible but not needed.
  const spareLens = Array.from({ length: t.spares }, () => rand(rng, 6, t.maxLen))
  const allLogs = [
    ...usedLens.map((len, i) => ({ len, compass: logKinds[i], used: i })),
    ...spareLens.map(len => ({ len, compass: false, used: -1 })),
  ]
  const order = shuffle(allLogs.map((_, i) => i), rng)
  const logs: Log[] = order.map((src, id) => ({ id, len: allLogs[src].len, compass: allLogs[src].compass }))
  const logOf = (usedIdx: number) => order.indexOf(usedIdx)

  const raws: Raw[] = []
  const plan: Action[] = []
  let welds = 0
  if (mode === 'strakes') {
    // Strakes run log by log, in a random log order.
    const seq = shuffle(contents.map((_, i) => i), rng)
    for (const li of seq) for (const r of contents[li]) { plan.push({ t: 'cut', part: raws.length, log: logOf(li) }); raws.push(r) }
  } else if (mode === 'line') {
    // Two benches; the line interleaves parts from whatever is on them.
    const seq = shuffle(contents.map((_, i) => i), rng)
    const queues = seq.map(li => [...contents[li]])
    const bench: (number | null)[] = [0, seq.length > 1 ? 1 : null]
    let next = seq.length > 1 ? 2 : 1
    while (bench.some(b => b !== null)) {
      const live = bench.map((b, k) => (b !== null ? k : -1)).filter(k => k >= 0)
      const k = live[Math.floor(rng() * live.length)]
      const q = bench[k]!
      plan.push({ t: 'cut', part: raws.length, log: logOf(seq[q]) })
      raws.push(queues[q].shift()!)
      if (!queues[q].length) {
        if (next < seq.length) { plan.push({ t: 'scrap', log: logOf(seq[q]) }); bench[k] = next++ }
        else bench[k] = null
      }
    }
  } else if (mode === 'weld') {
    // Plates laid end to end; sections run across the joins.
    // Only a few joins are crossed by a section, so filling plates in any
    // order would need more welds than the crew has.
    const seq = shuffle(contents.map((_, i) => i), rng)
    const caps = seq.map(li => usedLens[li])
    // Plates are cut full; any slack is left at the end of the last one.
    const runs = caps.map((cap, j) => compose(j === caps.length - 1 ? Math.max(2, cap - t.slack) : cap, 2, t.partMax, rng))
    const joins = shuffle(Array.from({ length: seq.length - 1 }, (_, j) => j), rng).slice(0, scale(d, [1, 1, 1, 2]))
    const lens: number[] = []
    let carry = 0
    runs.forEach((run, j) => {
      run.forEach((len, k) => {
        const merged = k === 0 ? len + carry : len
        if (k === 0) carry = 0
        if (k === run.length - 1 && joins.includes(j)) carry = merged
        else lens.push(merged)
      })
    })
    if (carry) lens.push(carry)
    let li = 0, used = 0
    for (let k = 0; k < lens.length; k++) {
      let rem = lens[k]
      while (rem > 0) {
        const space = caps[li] - used
        const take = Math.min(space, rem)
        plan.push({ t: 'cut', part: k, log: logOf(seq[li]) })
        if (take < rem) welds++
        rem -= take; used += take
        if (used === caps[li]) { li++; used = 0 }
      }
      raws.push({ len: lens[k], knee: false, comp: 1 })
    }
    // Free order: list the sections shuffled; renumber the plan to match.
    const perm = shuffle(raws.map((_, i) => i), rng)
    const listed = perm.map(i => raws[i])
    const newId = new Map(perm.map((old, nw) => [old, nw]))
    const plan2 = plan.map(a => (a.t === 'cut' ? { ...a, part: newId.get(a.part)! } : a))
    return { mode, logs, parts: nameParts(cfg, listed.map(r => ({ len: r.len, knee: r.knee, comp: r.comp }))), days: t.logs, welds, plan: plan2 }
  } else {
    contents.forEach((rs, li) => rs.forEach(r => { plan.push({ t: 'cut', part: raws.length, log: logOf(li) }); raws.push(r) }))
    const perm = shuffle(raws.map((_, i) => i), rng)
    const listed = perm.map(i => raws[i])
    const newId = new Map(perm.map((old, nw) => [old, nw]))
    const plan2 = plan.map(a => (a.t === 'cut' ? { ...a, part: newId.get(a.part)! } : a))
    return { mode, logs, parts: nameParts(cfg, listed), days: t.logs, welds: 0, plan: plan2 }
  }
  return { mode, logs, parts: nameParts(cfg, raws), days: t.logs, welds, plan }
}

/** A level whose saw plan wins; from D2 the naive sawyer must fail on it. */
export function generate(configId: string, d: Difficulty, seed: number): Level {
  const cfg = CONFIGS[configId] ?? CONFIGS.arsenal
  const rng = mulberry32(seed ^ hashString(`shipyard:${cfg.mode}:${d}`))
  let fallback: Level | null = null
  for (let attempt = 0; attempt < 400; attempt++) {
    const lv = buildOnce(cfg.mode, d, rng, cfg)
    if (cfg.mode === 'weld' && lv.welds === 0) continue
    const r = replay(lv, lv.plan)
    if (!r.ok || !isWon(r.state)) continue
    if (d === 1) return lv
    fallback ??= lv
    if (naivePlay(lv) === 'lost') return lv
  }
  return fallback!
}

// ── Component ─────────────────────────────────────────────────────────────────

const COMP_COLOURS = ['#c08a3e', '#4a6fb5', '#9c5a8a', '#6f8f4e', '#b5333b', '#3f8f8f']
const PART_COLOURS = ['#b07a45', '#8f6a3e', '#a8693a', '#c29358', '#946338', '#b88a52']

function partColour(level: Level, p: Part) {
  if (level.mode === 'bulkhead') return COMP_COLOURS[(p.comp - 1) % COMP_COLOURS.length]
  if (p.knee) return '#6b4a8a'
  if (level.mode === 'weld') return ['#7d8a96', '#5f6d7a', '#8c99a5', '#6c7884'][p.id % 4]
  return PART_COLOURS[p.id % PART_COLOURS.length]
}

export default function ShipyardGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'arsenal')
  const id = CONFIGS[configId] ? configId : 'arsenal'
  const level = useMemo(() => generate(id, difficulty, seed), [id, difficulty, seed])
  const [state, setState] = useState<State>(() => initialState(level))
  const [selected, setSelected] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const q = queued(level.mode)
  const head = headPart(level, state)
  const active = q ? head : selected
  const maxLen = Math.max(...level.logs.map(l => l.len))

  const commit = (next: State) => {
    setState(next)
    const st = status(level, next)
    if (st === 'won') win()
    else if (st === 'lost') lose(next.daysUsed >= level.days ? 'Out of days for the saw pit' : 'No timber left that fits')
  }

  const tapLog = (log: number) => {
    if (settled) return
    if (active === null) { setMsg('Pick a part from the order first.'); return }
    const why = cutProblem(level, state, active, log)
    if (why) { setMsg(why); return }
    const next = apply(level, state, { t: 'cut', part: active, log })!
    setMsg(next.weldsUsed > state.weldsUsed ? 'Welded — cut the rest of that section from another plate.' : '')
    if (!q && next.left[active] === 0) setSelected(null)
    commit(next)
  }

  const scrap = (log: number) => {
    if (settled) return
    const next = apply(level, state, { t: 'scrap', log })
    if (!next) return
    setMsg('')
    commit(next)
  }

  const daysLeft = level.days - state.daysUsed
  const cut = state.left.filter(l => l === 0).length

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-ink-2 text-[11px] font-bold">{cfg.rule}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p className={`font-bold ${daysLeft <= 1 ? 'text-red-600' : 'text-ink-2'}`} data-testid="yard-days">☀ {daysLeft} day{daysLeft === 1 ? '' : 's'} left</p>
          {level.mode === 'weld' && <p data-testid="yard-welds">🔥 {level.welds - state.weldsUsed} weld{level.welds - state.weldsUsed === 1 ? '' : 's'}</p>}
          <p>{cut} / {level.parts.length} parts</p>
        </div>
      </div>

      {/* The order: parts still to cut */}
      <div className="flex flex-wrap gap-1.5 justify-center w-full max-w-[430px] mx-auto" data-testid="yard-order">
        {level.parts.map(p => {
          const rem = state.left[p.id]
          if (rem === 0) return null
          const isActive = active === p.id
          const locked = q && head !== p.id
          return (
            <button key={p.id} type="button" data-part={p.id} data-active={isActive ? 'true' : undefined} disabled={settled || locked}
              onClick={() => { if (!q) { setSelected(selected === p.id ? null : p.id); setMsg('') } }}
              className={`flex flex-col items-start gap-0.5 px-1.5 py-1 rounded-lg border text-left
                ${isActive ? 'bg-accent/20 border-accent' : 'bg-panel border-line'} ${locked ? 'opacity-55' : ''}`}>
              <span className="flex gap-px" aria-hidden>
                {Array.from({ length: rem }, (_, k) => (
                  <span key={k} className="w-[9px] h-[9px] rounded-[2px]" style={{ background: partColour(level, p) }} />
                ))}
              </span>
              <span className="text-[9px] text-ink-2 leading-none whitespace-nowrap">
                {p.knee ? '⤵ ' : ''}{p.name}{level.mode === 'bulkhead' ? ` · C${p.comp}` : ''} · {rem}{rem < p.len ? ` of ${p.len}` : ''}
              </span>
            </button>
          )
        })}
      </div>

      {/* The timber stock */}
      <div className="flex flex-col gap-1.5 w-full max-w-[430px] mx-auto">
        {level.logs.map(L => {
          const st = state.started[L.id], closed = state.closed[L.id] || (level.mode === 'strakes' && st && state.current !== L.id)
          const ok = active !== null && !settled && !cutProblem(level, state, active, L.id)
          const pieces = state.pieces.filter(pc => pc.log === L.id)
          return (
            <div key={L.id} className="flex items-center gap-1.5">
              <span className="w-12 shrink-0 text-[9px] text-muted leading-tight">
                {L.compass ? <span className="text-[#6b4a8a] font-bold">compass</span> : level.mode === 'weld' ? 'plate' : 'log'}<br />{L.len} ft
              </span>
              <button type="button" data-log={L.id} onClick={() => tapLog(L.id)} disabled={settled}
                aria-label={`${L.compass ? 'compass timber' : cfg.timber} ${L.id + 1}, ${L.len - state.used[L.id]} of ${L.len} left`}
                className={`relative h-9 flex rounded-md overflow-hidden border-2 transition-colors
                  ${ok ? 'border-emerald-600' : 'border-[#6b4a2b]/50'} ${closed ? 'opacity-40' : ''}`}
                style={{ width: `${(L.len / maxLen) * 100}%`, borderRadius: L.compass ? '6px 18px 6px 18px' : undefined, touchAction: 'manipulation' }}>
                {pieces.map((pc, k) => {
                  const p = level.parts[pc.part]
                  return (
                    <span key={k} className="h-full border-r border-black/30 flex items-center justify-center text-[8px] text-white/90 font-bold overflow-hidden"
                      style={{ width: `${(pc.len / L.len) * 100}%`, background: partColour(level, p) }}>
                      {p.knee ? '⤵' : level.mode === 'bulkhead' ? `C${p.comp}` : pc.len}
                    </span>
                  )
                })}
                <span className="h-full flex-1"
                  style={{ background: L.compass ? 'repeating-linear-gradient(100deg,#d9b98a 0 6px,#cfa974 6px 8px)' : level.mode === 'weld' ? 'repeating-linear-gradient(90deg,#b8c0c8 0 10px,#aab3bb 10px 11px)' : 'repeating-linear-gradient(90deg,#e2c48f 0 10px,#d4b07a 10px 11px)' }} />
              </button>
              {level.mode === 'line' && st && !closed && (
                <button type="button" data-scrap={L.id} onClick={() => scrap(L.id)} disabled={settled}
                  className="shrink-0 h-7 px-1.5 rounded border border-line bg-panel text-[9px] text-ink-2 font-bold">scrap</button>
              )}
              {closed && <span className="shrink-0 text-[9px] text-muted">{level.mode === 'line' ? 'scrapped' : 'done'}</span>}
            </div>
          )
        })}
      </div>

      <p className={`text-[11px] text-center min-h-[1.25rem] ${msg ? 'text-red-600 font-bold' : 'text-muted'}`} role="status">
        {settled ? '' : msg || (q ? `Next on the line: ${head !== null ? level.parts[head].name : '—'}. Tap a log to saw it.` : active === null ? 'Pick a part, then tap the log to saw it from.' : 'Tap a log to saw this part from it.')}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle={`The ${cfg.ship} is ready on time!`} loseTitle="The order is not finished" />
    </div>
  )
}
