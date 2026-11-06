// Detective: the model.  A case is built from a seed in three layers:
//
//   the trick    which of the case's authored tricks was used, and by whom
//                (a suspect with the means for it); its traces replace the
//                plain look of the scene objects it touched, and from D3 one
//                stray trace of another trick is planted as a decoy
//   the alibis   where everyone says they were in the hour of the crime;
//                honest suspects sometimes vouch for each other, and from D2
//                the killer claims the company of someone who was elsewhere
//   the lies     the killer's cover story (authored with the trick) clashes
//                with one scene clue; the false alibi clashes with another
//                suspect's statement
//
// The player examines the scene, puts the questions, presses the statements
// that cannot be squared with the evidence, and finally names the killer,
// the method and (from D3) the trick.  Every case is fair: the killer alone
// lies, each lie is contradicted by something the player can find, and the
// body always shows the method.

import type { Difficulty } from '@/games/types'
import { hashString, mulberry32, randInt, shuffle, pick, type Rng } from '../_shared'
import { CASES, type CaseDef, type Glyph, type MethodId } from './cases'

export { CASES }
export const HOURS = 6

export interface Tier {
  suspects: number
  /** The killer also claims a false alibi. */
  falseAlibi: boolean
  /** Stray traces of other tricks planted in the scene. */
  decoys: number
  /** Wrong presses allowed before the suspects stop talking. */
  patience: number
  /** Tell the player how many clues the scene holds. */
  countClues: boolean
  /** The accusation must also name the trick. */
  nameTrick: boolean
  seconds: number
}

export const TIERS: Record<Difficulty, Tier> = {
  1: { suspects: 3, falseAlibi: false, decoys: 0, patience: 3, countClues: true,  nameTrick: false, seconds: 0 },
  2: { suspects: 4, falseAlibi: true,  decoys: 0, patience: 3, countClues: true,  nameTrick: false, seconds: 0 },
  3: { suspects: 5, falseAlibi: true,  decoys: 1, patience: 2, countClues: false, nameTrick: true,  seconds: 360 },
  4: { suspects: 6, falseAlibi: true,  decoys: 2, patience: 2, countClues: false, nameTrick: true,  seconds: 300 },
}

export interface SceneObject {
  id: string
  glyph: Glyph
  x: number
  y: number
  size: number
  name: string
  /** What a close look shows. */
  look: string
  /** The look is a trace of the trick (or a planted decoy), not the plain object. */
  clue: boolean
}

export type Evidence = { kind: 'object'; id: string } | { kind: 'statement'; s: number; q: number }

export interface Statement {
  text: string
  /** Set on the killer's lies: what contradicts it, and why. */
  lie?: { clash: Evidence; why: string }
}

export interface Suspect {
  name: string
  role: string
  profile: string
  /** Indices into Case.methods. */
  means: number[]
}

export interface Case {
  configId: string
  title: string
  setting: string
  intro: string
  fact: string
  victim: { name: string; role: string; foundAt: string }
  palette: CaseDef['palette']
  scene: SceneObject[]
  /** Ids of the scene objects whose look is a clue. */
  clueIds: string[]
  suspects: Suspect[]
  methods: { id: MethodId; label: string }[]
  /** The alibi question first, then the case questions. */
  questions: string[]
  /** statements[s][q] */
  statements: Statement[][]
  tricks: { id: string; label: string; how: string }[]
  truth: { s: number; m: number; trick: number; hour: number }
  tier: Tier
}

/** True when the evidence contradicts the statement. */
export function contradicts(c: Case, s: number, q: number, ev: Evidence): boolean {
  const lie = c.statements[s]?.[q]?.lie
  if (!lie) return false
  const a = lie.clash
  return a.kind === ev.kind && (a.kind === 'object' ? a.id === (ev as { id: string }).id
    : a.s === (ev as { s: number }).s && a.q === (ev as { q: number }).q)
}

export interface Accusation { s: number; m: number; trick?: number }

export function isCorrect(c: Case, a: Accusation): boolean {
  if (a.s !== c.truth.s || a.m !== c.truth.m) return false
  return !c.tier.nameTrick || a.trick === c.truth.trick
}

export function solution(c: Case): string {
  const t = c.tricks[c.truth.trick]
  return `${c.suspects[c.truth.s].name} killed ${c.victim.name} with the ${c.methods[c.truth.m].label.toLowerCase()}. ${t.how}`
}

// ── Generation ───────────────────────────────────────────────────────────────

function attempt(configId: string, def: CaseDef, d: Difficulty, rng: Rng): Case | null {
  const tier = TIERS[d]
  const methodIds = Object.keys(def.methods) as MethodId[]
  const methods = methodIds.map(id => ({ id, label: def.methods[id] }))

  // Cast, trick and killer.
  const castIdx = shuffle(def.suspects.map((_, i) => i), rng).slice(0, tier.suspects)
  const cast = castIdx.map(i => def.suspects[i])
  const trickIdx = randInt(rng, 0, def.tricks.length - 1)
  const trick = def.tricks[trickIdx]
  const able = cast.map((_, i) => i).filter(i => cast[i].means.includes(trick.method))
  if (!able.length) return null
  const killer = pick(able, rng)
  const hour = randInt(rng, 1, HOURS - 2)

  // Scene: the trick's traces, then decoys from other tricks on untouched objects.
  const looks = new Map<string, string>()
  for (const [id, text] of Object.entries(trick.traces)) looks.set(id, text)
  if (!looks.has('body') || !looks.has(trick.lie.clashes)) return null
  const others = shuffle(def.tricks.filter((t, i) => i !== trickIdx && t.method !== trick.method), rng)
  let planted = 0
  for (const t of others) {
    if (planted >= tier.decoys) break
    const spare = shuffle(Object.entries(t.traces).filter(([id]) => id !== 'body' && !looks.has(id)), rng)
    if (!spare.length) continue
    looks.set(spare[0][0], spare[0][1])
    planted++
  }
  if (planted < tier.decoys) return null
  const scene: SceneObject[] = def.scene.map(o => ({
    id: o.id, glyph: o.glyph, x: o.x, y: o.y, size: o.size ?? 1, name: o.name,
    look: looks.get(o.id) ?? o.plain, clue: looks.has(o.id),
  }))
  if ([...looks.keys()].some(id => !def.scene.some(o => o.id === id))) return null

  // Alibis for the hour of the crime.  Honest suspects pair up now and then;
  // the killer, from D2, borrows the company of someone who was elsewhere.
  const honest = cast.map((_, i) => i).filter(i => i !== killer)
  const where = new Map<number, { place: string; with?: number }>()
  const pool = shuffle(honest, rng)
  // Spread the honest suspects over the places before any place repeats.
  let free = shuffle(def.places, rng)
  const nextPlace = () => { if (!free.length) free = shuffle(def.places, rng); return free.pop()! }
  while (pool.length) {
    const a = pool.pop()!
    const place = nextPlace()
    if (pool.length && rng() < 0.5) {
      const b = pool.pop()!
      where.set(a, { place, with: b }); where.set(b, { place, with: a })
    } else where.set(a, { place })
  }
  const alone = honest.filter(i => where.get(i)!.with === undefined)
  let falseWith: number | undefined
  if (tier.falseAlibi) {
    if (!alone.length) return null
    falseWith = pick(alone, rng)
  }
  const killerPlace = falseWith === undefined ? pick(def.places, rng)
    : pick(def.places.filter(p => p !== where.get(falseWith!)!.place), rng)
  where.set(killer, { place: killerPlace, with: falseWith })

  const span = `between ${def.hours[hour]} and ${def.hours[hour + 1]}`
  const questions = [`Where were you ${span}?`, ...def.questions]
  const alibiText = (i: number) => {
    const w = where.get(i)!
    return w.with === undefined ? `At the ${w.place}, on my own.` : `At the ${w.place}, with ${cast[w.with].name}.`
  }
  const statements: Statement[][] = cast.map((sp, i) => {
    const row: Statement[] = [{ text: alibiText(i) }, ...sp.answers.map(text => ({ text }))]
    if (i === killer) {
      if (falseWith !== undefined) row[0].lie = {
        clash: { kind: 'statement', s: falseWith, q: 0 },
        why: `${cast[falseWith].name} says they were at the ${where.get(falseWith)!.place} on their own.`,
      }
      row[trick.lie.q + 1] = { text: trick.lie.text, lie: { clash: { kind: 'object', id: trick.lie.clashes }, why: trick.lie.why } }
    }
    return row
  })

  const suspects: Suspect[] = cast.map(sp => ({
    name: sp.name, role: sp.role, profile: sp.profile,
    means: sp.means.map(id => methodIds.indexOf(id)).filter(i => i >= 0).sort((a, b) => a - b),
  }))

  return {
    configId, title: def.title, setting: def.setting, intro: def.intro, fact: def.fact,
    victim: def.victim, palette: def.palette, scene, clueIds: scene.filter(o => o.clue).map(o => o.id),
    suspects, methods, questions, statements,
    tricks: def.tricks.map(t => ({ id: t.id, label: t.label, how: t.how })),
    truth: { s: killer, m: methodIds.indexOf(trick.method), trick: trickIdx, hour },
    tier,
  }
}

export function generate(configId: string, difficulty: Difficulty, seed: number): Case {
  const id = CASES[configId] ? configId : Object.keys(CASES)[0]
  const def = CASES[id]
  for (let k = 0; k < 400; k++) {
    const c = attempt(id, def, difficulty, mulberry32(hashString(`${id}:${difficulty}:${seed}:${k}`)))
    if (c) return c
  }
  throw new Error(`detective: no fair case for ${id} D${difficulty} seed ${seed}`)
}
