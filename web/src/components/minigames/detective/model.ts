// Detective: the model.  A case is generated from a seed: who killed each
// victim, how, and at what hour; then a set of true clues that, read
// together, leave exactly one culprit and one method per victim.  Clues sit
// in leads (a body to examine, a place to search, a suspect to question) and
// the player has fewer hours than there are leads.
//
// The truth space per victim is suspect × method × hour, limited by means
// (a suspect can only use a method they have access to).  Every clue rules
// out part of it:
//   trace   a mark on the body (or its absence) rules out methods
//   window  the examiner's time of death rules out hours
//   alibi   a witness places a suspect elsewhere for some hours
//   mark    a witness saw the killer's hand or height; rules out suspects
//   herring true colour that rules out nothing
// `generate` rejects any case that is not fair: the full clue set must give a
// unique answer, no single lead may give it, and some set of leads within the
// hours must.

import type { Difficulty } from '@/games/types'
import { hashString, mulberry32, randInt, shuffle, pick, type Rng } from '../_shared'
import {
  CASES, METHOD_TRACES, TRACE_TEXT, TRAITS, TRAIT_SEEN,
  type CaseDef, type Feature, type MethodId, type TraitDim,
} from './cases'

export { CASES }
export const HOURS = 6

export interface Suspect {
  name: string
  role: string
  profile: string
  /** Indices into Case.methods. */
  means: number[]
  traits: Record<TraitDim, string>
}

export type Clue =
  | { k: 'trace'; v: number; f: Feature; present: boolean }
  | { k: 'window'; v: number; from: number; to: number }
  | { k: 'alibi'; s: number; from: number; to: number }
  | { k: 'mark'; v: number; dim: TraitDim; value: string }
  | { k: 'herring' }

export interface Lead {
  kind: 'body' | 'place' | 'question'
  name: string
  clues: { clue: Clue; text: string }[]
}

export interface Truth { s: number; m: number; h: number }

export interface Case {
  configId: string
  title: string
  setting: string
  intro: string
  fact: string
  hours: string[]
  suspects: Suspect[]
  methods: { id: MethodId; label: string }[]
  victims: { name: string; role: string; foundAt: string }[]
  leads: Lead[]
  truth: Truth[]
  /** Leads the player may open. */
  budget: number
  /** Fewest leads that settle the case. */
  minLeads: number
  seconds: number
}

export const TIERS: Record<Difficulty, { suspects: number; methods: number; victims: number; minLeads: number; slack: number; seconds: number; extras: number }> = {
  1: { suspects: 4, methods: 4, victims: 1, minLeads: 2, slack: 2, seconds: 0, extras: 1 },
  2: { suspects: 5, methods: 5, victims: 1, minLeads: 3, slack: 2, seconds: 0, extras: 1 },
  3: { suspects: 5, methods: 5, victims: 2, minLeads: 3, slack: 2, seconds: 480, extras: 2 },
  4: { suspects: 6, methods: 6, victims: 2, minLeads: 4, slack: 1, seconds: 420, extras: 2 },
}

// ── Solving ──────────────────────────────────────────────────────────────────

type Shape = Pick<Case, 'suspects' | 'methods' | 'victims'>

const cellCount = (c: Shape) => c.suspects.length * c.methods.length * HOURS
const cellIndex = (c: Shape, s: number, m: number, h: number) => (s * c.methods.length + m) * HOURS + h

/** Does this clue rule out "suspect s killed victim v with method m at hour h"? */
export function rulesOut(c: Shape, clue: Clue, v: number, s: number, m: number, h: number): boolean {
  switch (clue.k) {
    case 'trace': return clue.v === v && METHOD_TRACES[c.methods[m].id].includes(clue.f) !== clue.present
    case 'window': return clue.v === v && (h < clue.from || h > clue.to)
    case 'alibi': return clue.s === s && h >= clue.from && h <= clue.to
    case 'mark': return clue.v === v && c.suspects[s].traits[clue.dim] !== clue.value
    case 'herring': return false
  }
}

/** Per victim, a flag per (suspect, method, hour) cell: true = still possible. */
export function possible(c: Shape, clues: Clue[]): boolean[][] {
  return c.victims.map((_, v) => {
    const out = new Array<boolean>(cellCount(c)).fill(false)
    c.suspects.forEach((sp, s) => {
      for (const m of sp.means) for (let h = 0; h < HOURS; h++) {
        out[cellIndex(c, s, m, h)] = !clues.some(cl => rulesOut(c, cl, v, s, m, h))
      }
    })
    return out
  })
}

/** Per victim, the (suspect, method) pairs still open, as "s:m". */
export function openPairs(c: Shape, clues: Clue[]): string[][] {
  return possible(c, clues).map(cells => {
    const pairs = new Set<string>()
    cells.forEach((ok, i) => {
      if (!ok) return
      const sm = Math.floor(i / HOURS)
      pairs.add(`${Math.floor(sm / c.methods.length)}:${sm % c.methods.length}`)
    })
    return [...pairs]
  })
}

export const isSettled = (c: Shape, clues: Clue[]) => openPairs(c, clues).every(p => p.length === 1)

export const cluesOf = (leads: Lead[], picked: Iterable<number>) => [...picked].flatMap(i => leads[i].clues.map(x => x.clue))

/** Size of the smallest set of leads that settles the case (Infinity if none). */
export function minimalLeads(c: Shape, leads: Lead[]): { size: number; leads: number[] } {
  const n = leads.length
  const order = Array.from({ length: 1 << n }, (_, mask) => mask)
    .sort((a, b) => popcount(a) - popcount(b))
  for (const mask of order) {
    const picked = Array.from({ length: n }, (_, i) => i).filter(i => mask & (1 << i))
    if (isSettled(c, cluesOf(leads, picked))) return { size: picked.length, leads: picked }
  }
  return { size: Infinity, leads: [] }
}

function popcount(x: number) { let k = 0; while (x) { x &= x - 1; k++ } return k }

// ── Generation ───────────────────────────────────────────────────────────────

const DIMS = Object.keys(TRAITS) as TraitDim[]

function attempt(configId: string, def: CaseDef, d: Difficulty, rng: Rng): Case | null {
  const tier = TIERS[d]
  const methodIds = shuffle(Object.keys(def.methods) as MethodId[], rng).slice(0, tier.methods)
  const methods = methodIds.map(id => ({ id, label: def.methods[id]! }))
  const suspects: Suspect[] = shuffle(def.suspects, rng).slice(0, tier.suspects).map(sd => ({
    name: sd.name, role: sd.role, profile: sd.profile,
    means: sd.means.map(id => methodIds.indexOf(id)).filter(i => i >= 0).sort((a, b) => a - b),
    traits: {
      hand: TRAITS.hand[rng() < 0.4 ? 0 : 1],
      height: TRAITS.height[rng() < 0.5 ? 0 : 1],
    },
  }))
  if (suspects.some(s => !s.means.length)) return null
  const victims = def.victims.slice(0, tier.victims)
  const shape: Shape = { suspects, methods, victims }

  // The truth.  One person cannot be in two places within the same two hours.
  const truth: Truth[] = []
  for (let v = 0; v < victims.length; v++) {
    const s = randInt(rng, 0, suspects.length - 1)
    const h = randInt(rng, 0, HOURS - 1)
    if (truth.some(t => t.s === s && Math.abs(t.h - h) < 2)) return null
    truth.push({ s, m: pick(suspects[s].means, rng), h })
  }
  const crimeHours = (s: number) => truth.filter(t => t.s === s).map(t => t.h)

  const clues: Clue[] = truth.map((t, v) => {
    const from = Math.max(0, t.h - randInt(rng, 0, 1)), to = Math.min(HOURS - 1, t.h + randInt(rng, 0, 1))
    return { k: 'window', v, from, to } as Clue
  })
  const has = (c: Clue) => clues.some(x => JSON.stringify(x) === JSON.stringify(c))

  const alibiFor = (s: number, hs: number[], stretch: boolean): Clue | null => {
    if (!hs.length) return null
    let from = Math.min(...hs), to = Math.max(...hs)
    if (stretch) { from = Math.max(0, from - randInt(rng, 0, 1)); to = Math.min(HOURS - 1, to + randInt(rng, 0, 1)) }
    const clash = (a: number, b: number) => crimeHours(s).some(h => h >= a && h <= b)
    if (clash(from, to)) { from = Math.min(...hs); to = Math.max(...hs) }
    return clash(from, to) ? null : { k: 'alibi', s, from, to }
  }

  // Rule out wrong answers one at a time until each victim has one left.
  for (let guard = 0; guard < 60; guard++) {
    const cells = possible(shape, clues)
    const open = openPairs(shape, clues)
    const v = open.findIndex(p => p.length > 1)
    if (v < 0) break
    const t = truth[v]
    const wrong = open[v].map(p => p.split(':').map(Number)).filter(([s, m]) => s !== t.s || m !== t.m)
    const [s, m] = pick(wrong, rng)
    const options: Clue[] = []
    if (m !== t.m) {
      const a = METHOD_TRACES[methods[m].id], b = METHOD_TRACES[methods[t.m].id]
      for (const f of [...a, ...b]) if (a.includes(f) !== b.includes(f)) options.push({ k: 'trace', v, f, present: b.includes(f) })
    }
    if (s !== t.s) {
      for (const dim of DIMS) {
        const value = suspects[t.s].traits[dim]
        if (suspects[s].traits[dim] !== value) options.push({ k: 'mark', v, dim, value })
      }
      const hs = Array.from({ length: HOURS }, (_, h) => h).filter(h => cells[v][cellIndex(shape, s, m, h)])
      const al = alibiFor(s, hs, true)
      if (al) options.push(al, al) // weighted: alibis make the best reading
    }
    const fresh = options.filter(o => !has(o))
    if (!fresh.length) return null
    clues.push(pick(fresh, rng))
  }
  if (!isSettled(shape, clues)) return null

  // A few true clues that are not needed, so there is more than one road in.
  for (let i = 0; i < tier.extras; i++) {
    const s = randInt(rng, 0, suspects.length - 1)
    const h = randInt(rng, 0, HOURS - 2)
    const al = alibiFor(s, [h, h + 1], false)
    if (al && !has(al)) clues.push(al)
  }

  // Deal the clues into leads.
  const leads: Lead[] = [
    ...victims.map(vd => ({ kind: 'body' as const, name: `the body of ${vd.name}`, clues: [] as Lead['clues'] })),
    ...def.places.map(p => ({ kind: 'place' as const, name: `the ${p.name}`, clues: [] as Lead['clues'] })),
    ...suspects.map(sp => ({ kind: 'question' as const, name: sp.name, clues: [] as Lead['clues'] })),
  ]
  const nV = victims.length, nP = def.places.length
  const place = (i: number) => nV + i
  const question = (s: number) => nV + nP + s
  const say = (lead: number, clue: Clue, text: string) => leads[lead].clues.push({ clue, text })
  const span = (a: number, b: number) => (a === b ? `at ${def.hours[a]}` : `from ${def.hours[a]} to ${def.hours[b]}`)

  for (const clue of clues) {
    if (clue.k === 'trace') say(clue.v, clue, TRACE_TEXT[clue.f][clue.present ? 0 : 1])
    else if (clue.k === 'window') {
      const when = clue.from === clue.to ? `at about ${def.hours[clue.from]}` : `between ${def.hours[clue.from]} and ${def.hours[clue.to]}`
      say(clue.v, clue, `${cap(def.examiner)} judges that ${victims[clue.v].name} died ${when}.`)
    } else if (clue.k === 'mark') {
      const p = randInt(rng, 0, nP - 1)
      say(place(p), clue, `${def.places[p].witness}: "I glimpsed whoever left ${victims[clue.v].name}: ${TRAIT_SEEN[clue.value]}."`)
    } else if (clue.k === 'alibi') {
      const where = def.places[randInt(rng, 0, nP - 1)]
      const others = suspects.map((_, i) => i).filter(i => i !== clue.s)
      // Half from the witness at the place, half from another suspect.
      if (rng() < 0.5) {
        const p = def.places.indexOf(where)
        say(place(p), clue, `${where.witness}: "${suspects[clue.s].name} was here in the ${where.name} ${span(clue.from, clue.to)}."`)
      } else {
        const x = pick(others, rng)
        say(question(x), clue, `${suspects[x].name}: "I saw ${suspects[clue.s].name} in the ${where.name} ${span(clue.from, clue.to)}."`)
      }
    }
  }
  const herrings = shuffle(def.herrings, rng)
  let hi = 0
  leads.forEach((lead, i) => {
    if (lead.clues.length && rng() < 0.7) return
    const text = lead.kind === 'question'
      ? `${lead.name}: "${pick(QUIET, rng)}"`
      : herrings[hi++ % herrings.length]
    if (lead.kind !== 'question' || !lead.clues.length) say(i, { k: 'herring' }, text)
  })
  leads.forEach(l => { l.clues = shuffle(l.clues, rng) })

  // Fairness.
  const pairs = suspects.reduce((n, sp) => n + sp.means.length, 0)
  if (pairs < 6) return null
  if (!isSettled(shape, cluesOf(leads, leads.map((_, i) => i)))) return null
  const min = minimalLeads(shape, leads)
  if (min.size < tier.minLeads) return null
  const budget = Math.min(min.size + tier.slack, leads.length - 2)
  if (budget < min.size) return null

  return {
    configId, title: def.title, setting: def.setting, intro: def.intro, fact: def.fact,
    hours: def.hours, suspects, methods, victims, leads, truth,
    budget, minLeads: min.size, seconds: tier.seconds,
  }
}

const QUIET = [
  'I was asleep and heard nothing.',
  'I keep to myself. Ask the others.',
  'It was a quiet night, as far as I know.',
  'I have nothing to say that would help you.',
]

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

export function generate(configId: string, difficulty: Difficulty, seed: number): Case {
  const id = CASES[configId] ? configId : Object.keys(CASES)[0]
  const def = CASES[id]
  for (let k = 0; k < 4000; k++) {
    const c = attempt(id, def, difficulty, mulberry32(hashString(`${id}:${difficulty}:${seed}:${k}`)))
    if (c) return c
  }
  throw new Error(`detective: no fair case for ${id} D${difficulty} seed ${seed}`)
}

/** Did the accusation name the right culprit and method for every victim? */
export function isCorrect(c: Case, accused: { s: number; m: number }[]): boolean {
  return c.truth.every((t, v) => accused[v]?.s === t.s && accused[v]?.m === t.m)
}
