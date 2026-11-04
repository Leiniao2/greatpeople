import { useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, randInt, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Harvest — seasonal timing against water, warmth and soil.  A calendar of
// weeks runs past a row of fields.  Each week the household has labour for
// ONE job: sow a crop in an empty field (or, on the Plains, contour-plough a
// field), or simply let the week pass.  Then the week resolves:
//
//   • every growing crop ages one week; a crop of grow time g sown in week w
//     is lifted automatically at the end of week w+g−1 and adds its yield;
//   • the season's physics may kill it first (see the configs below);
//   • reach the harvest quota before the calendar runs out.
//
// The configs change the physical rule, not just the map:
//   nile           the flood recedes from the high basins first; a basin can be
//                  sown only once it is mud, and its soil holds water for a
//                  time that grows with depth — a crop that is not ripe when
//                  its basin dries out in Shemu withers.
//   solar-terms    every week is one of the 24 jieqi with its own warmth;
//                  each crop survives only inside its warmth band (rice also
//                  needs a paddy), so a field is cropped twice: cool-season
//                  wheat, then summer rice, before Cold Dew.
//   maya-milpa     seed sown before the rains arrive dies, and the dry season
//                  kills what is still growing; maize, beans and squash each
//                  earn +1 for every different sister growing next to them.
//   potato-blight  blight strikes ONE potato variety (you do not know which);
//                  from then on that variety rots in the ground — a
//                  monoculture loses everything, a mixed planting survives.
//   dust-bowl      a dust storm strips one layer of topsoil from every field
//                  that is not contour-ploughed and not held by a crop at least
//                  two weeks old, killing young crops; a field without topsoil
//                  is dust.
//
// Uncertainty: at D1–D2 the calendar shows exactly when things happen.  At
// D3–D4 the forecast is a window (flood late by 0–2 weeks, the rains may come
// a week late, a storm may hit a week later, …).  The level is a finite set of
// scenarios and the real one is picked by the seed; the player sees each
// week's weather before acting.  The solver is an exact max–min search over
// (week, fields, scenarios still possible): the quota is set so the best
// plan reaches it in EVERY scenario (worst case), and at D3–D4 a naive greedy
// sower (first empty field, highest-yield crop that survives this week) fails
// in the real one.  Doing nothing always loses (the quota is at least 2).
//
//   D1  3 fields  ~7–9 weeks   exact forecast   quota = best − 1  ≈1 min
//   D2  3 fields  ~9–10 weeks  exact forecast   quota = best − 1
//   D3  4 fields  ~11 weeks    2–4 scenarios    quota = best − 1, greedy fails
//   D4  5 fields  ~13 weeks    3–9 scenarios    quota = best, greedy fails  ≈3 min

export type Kind = 'nile' | 'terms' | 'milpa' | 'blight' | 'dust'

export interface Crop {
  name: string
  icon: string
  grow: number
  yield: number
  /** Warmth band for the solar terms (0–5). */
  tmin?: number
  tmax?: number
  /** Needs a flooded paddy. */
  paddy?: boolean
}

interface HarvestConfig {
  title: string
  rule: string
  intro: string
  fact: string
  kind: Kind
  crops: Crop[]
}

export const CONFIGS: Record<string, HarvestConfig> = {
  nile: {
    title: 'Akhet, Peret, Shemu',
    rule: 'Sow as the flood recedes',
    intro: 'The inundation drains from the high basins first (▲ height). Sow a basin once it is mud; deep basins stay wet longer, high ones dry out sooner. A crop still green when its basin dries in Shemu withers.',
    fact: 'The Egyptian year had three seasons: Akhet, the inundation; Peret, when the fields came out of the water and were sown; and Shemu, the harvest and low water. Emmer wheat and barley were sown straight into the wet silt as the flood went down.',
    kind: 'nile',
    crops: [
      { name: 'Flax', icon: '🌿', grow: 2, yield: 1 },
      { name: 'Barley', icon: '🌾', grow: 3, yield: 2 },
      { name: 'Emmer', icon: '🌱', grow: 4, yield: 3 },
    ],
  },
  'solar-terms': {
    title: 'The Twenty-Four Solar Terms',
    rule: 'Each crop lives in its warmth band',
    intro: 'Every week is a solar term with its warmth (🌡 0–5). A crop dies in any week outside its band; rice also needs a paddy (💧). Crop a field twice: cool-season wheat, then summer rice — before Cold Dew.',
    fact: 'The 24 solar terms (jieqi) split the sun’s yearly path into 15° steps of about 15 days each, from Start of Spring to Major Cold, and told farmers when to sow and reap. UNESCO listed them as intangible cultural heritage in 2016.',
    kind: 'terms',
    crops: [
      { name: 'Wheat', icon: '🌾', grow: 3, yield: 2, tmin: 1, tmax: 3 },
      { name: 'Rice', icon: '🍚', grow: 3, yield: 3, tmin: 4, tmax: 5, paddy: true },
      { name: 'Millet', icon: '🌿', grow: 4, yield: 2, tmin: 2, tmax: 5 },
      { name: 'Soybean', icon: '🫘', grow: 2, yield: 1, tmin: 3, tmax: 5 },
    ],
  },
  'maya-milpa': {
    title: 'The Milpa',
    rule: 'Sow with the rains, plant the three sisters together',
    intro: 'Seed sown before the rains arrive (🌧) dies, and the dry season kills what is still growing. Maize, beans and squash each earn +1 for every different sister growing in the mound next to them.',
    fact: 'Maya farmers sowed the milpa with the first rains of the wet season, around May: maize, beans and squash in the same plot. The beans fix nitrogen and climb the maize stalks, and the broad squash leaves shade out weeds and keep the soil moist.',
    kind: 'milpa',
    crops: [
      { name: 'Maize', icon: '🌽', grow: 4, yield: 2 },
      { name: 'Beans', icon: '🫘', grow: 3, yield: 1 },
      { name: 'Squash', icon: '🎃', grow: 3, yield: 1 },
    ],
  },
  'potato-blight': {
    title: 'The Blight of 1845',
    rule: 'Blight strikes one variety — diversify',
    intro: 'Blight (🦠) is coming and will strike ONE potato variety — you do not know which. From that week every plant of that variety rots, now and after. Oats are immune but slow. Do not stake everything on the Lumper.',
    fact: 'In 1845 the water mould Phytophthora infestans reached Ireland, where most poor families lived on a single high-yielding variety, the Lumper. Repeated failures from 1845 to 1849 caused about a million deaths, and about a million more people emigrated.',
    kind: 'blight',
    crops: [
      { name: 'Lumper', icon: '🥔', grow: 2, yield: 3 },
      { name: 'Cup', icon: '🟤', grow: 3, yield: 2 },
      { name: 'Oats', icon: '🌾', grow: 4, yield: 2 },
    ],
  },
  'dust-bowl': {
    title: 'Black Sunday',
    rule: 'Contour ploughing holds the soil',
    intro: 'A dust storm (🌪) strips one layer of topsoil from every field that is not contour-ploughed (≋) and not held by a crop at least two weeks old, and kills young crops. Ploughing on the contour takes a week of work. A field with no topsoil is dust.',
    fact: 'In the 1930s drought and wind blew the topsoil off millions of hectares of ploughed Great Plains; on Black Sunday, 14 April 1935, a single storm darkened the sky from Kansas to Texas. The Soil Conservation Service, set up that year under Hugh Hammond Bennett, paid farmers to plough along the contours and plant cover and shelterbelts.',
    kind: 'dust',
    crops: [
      { name: 'Wheat', icon: '🌾', grow: 3, yield: 2 },
      { name: 'Sorghum', icon: '🌿', grow: 2, yield: 1 },
    ],
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Pure model ────────────────────────────────────────────────────────────────

export interface FieldSpec {
  /** Basin height for the Nile (0 low – 3 high). */
  elev: number
  /** Topsoil layers (Dust Bowl); 1 elsewhere. */
  soil: number
  paddy: boolean
}

/** One possible future; the level holds several when the forecast is uncertain. */
export interface Scenario {
  /** Nile: weeks the flood is late. */
  shift: number
  /** Solar terms: first week of the early cold (warmth −2 from then on). */
  cold: number
  /** Milpa: first rainy week, first dry week. */
  rain: [number, number]
  /** Blight: week it strikes, and the variety it strikes. */
  blight: number
  blightCrop: number
  /** Dust Bowl: storm weeks. */
  storms: number[]
}

export interface Level {
  kind: Kind
  crops: Crop[]
  fields: FieldSpec[]
  weeks: number
  /** Nile: base week each basin turns to mud, base week it is dry. */
  drain: number[]
  dry: number[]
  /** Solar terms: base warmth per week, and the index of the first term. */
  temp: number[]
  term0: number
  scenarios: Scenario[]
  /** Index of the scenario that really happens. */
  actual: number
  quota: number
  /** Best worst-case yield (solver). */
  best: number
  /** What the naive greedy sower gets in the real scenario. */
  greedy: number
}

export interface Plot { crop: number; age: number; soil: number; contour: boolean }

export interface State { week: number; yield: number; plots: Plot[]; log: string[] }

export type Action = { t: 'wait' } | { t: 'plant'; f: number; c: number } | { t: 'contour'; f: number }

export const TERMS = [
  'Start of Spring', 'Rain Water', 'Awakening of Insects', 'Spring Equinox', 'Clear and Bright', 'Grain Rain',
  'Start of Summer', 'Grain Buds', 'Grain in Ear', 'Summer Solstice', 'Minor Heat', 'Major Heat',
  'Start of Autumn', 'End of Heat', 'White Dew', 'Autumn Equinox', 'Cold Dew', 'Frost’s Descent',
  'Start of Winter', 'Minor Snow', 'Major Snow', 'Winter Solstice', 'Minor Cold', 'Major Cold',
]
const TEMP24 = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0, 0, 0]

export const drainOf = (lv: Level, s: Scenario, f: number) => lv.drain[f] + s.shift
export const dryOf = (lv: Level, s: Scenario, f: number) => lv.dry[f] + s.shift
export const tempAt = (lv: Level, s: Scenario, t: number) => Math.max(0, lv.temp[t] - (t >= s.cold ? 2 : 0))
export const raining = (s: Scenario, t: number) => t >= s.rain[0] && t < s.rain[1]
export const blighted = (s: Scenario, t: number) => t >= s.blight

/** Nile basin condition in week t: flooded, mud (sowable) or dry. */
export function basin(lv: Level, s: Scenario, f: number, t: number): 'w' | 'm' | 'd' {
  return t < drainOf(lv, s, f) ? 'w' : t < dryOf(lv, s, f) ? 'm' : 'd'
}

/** Everything the player can see about week t before acting; it decides that week's resolve. */
export function weatherKey(lv: Level, s: Scenario, t: number): string {
  switch (lv.kind) {
    case 'nile': return lv.fields.map((_, f) => basin(lv, s, f, t)).join('')
    case 'terms': return String(tempAt(lv, s, t))
    case 'milpa': return raining(s, t) ? 'r' : 'd'
    case 'blight': return blighted(s, t) ? String(s.blightCrop) : '-'
    case 'dust': return s.storms.includes(t) ? 's' : '-'
  }
}

export function initialState(lv: Level): State {
  return { week: 0, yield: 0, plots: lv.fields.map(f => ({ crop: -1, age: 0, soil: f.soil, contour: false })), log: [] }
}

export function canPlant(lv: Level, s: Scenario, t: number, plots: Plot[], f: number, c: number): boolean {
  const p = plots[f]
  if (p.crop >= 0 || p.soil <= 0 || t >= lv.weeks) return false
  if (lv.kind === 'nile' && basin(lv, s, f, t) !== 'm') return false
  if (lv.kind === 'terms' && lv.crops[c].paddy && !lv.fields[f].paddy) return false
  return true
}

export function canContour(lv: Level, plots: Plot[], f: number): boolean {
  return lv.kind === 'dust' && !plots[f].contour && plots[f].soil > 0
}

/** Why a crop of the given age (already counted for week t) dies in week t, or null. */
function killReason(lv: Level, s: Scenario, t: number, f: number, crop: number, age: number, contour: boolean): string | null {
  const c = lv.crops[crop]
  switch (lv.kind) {
    case 'nile': return basin(lv, s, f, t) === 'd' ? 'withered in the dry soil' : null
    case 'terms': {
      const w = tempAt(lv, s, t)
      return w < (c.tmin ?? 0) ? 'killed by the cold' : w > (c.tmax ?? 5) ? 'scorched by the heat' : null
    }
    case 'milpa': return raining(s, t) ? null : 'dried out without rain'
    case 'blight': return blighted(s, t) && crop === s.blightCrop ? 'rotted with blight' : null
    case 'dust': return s.storms.includes(t) && !contour && age < 2 ? 'buried by the dust storm' : null
  }
}

/** Resolve week t after action a. Pure: returns new plots and the yield gained. */
export function advance(lv: Level, s: Scenario, t: number, plots: Plot[], a: Action, log?: string[]): { plots: Plot[]; gain: number } {
  const ps = plots.map(p => ({ ...p }))
  if (a.t === 'plant') ps[a.f] = { ...ps[a.f], crop: a.c, age: 0 }
  else if (a.t === 'contour') ps[a.f].contour = true
  const storm = lv.kind === 'dust' && s.storms.includes(t)
  ps.forEach((p, f) => {
    if (p.crop >= 0) {
      p.age++
      const why = killReason(lv, s, t, f, p.crop, p.age, p.contour)
      if (why) { log?.push(`Field ${f + 1}: ${lv.crops[p.crop].name} ${why}`); p.crop = -1; p.age = 0 }
    }
    if (storm && !p.contour && p.crop < 0 && p.soil > 0) {
      p.soil--
      log?.push(`Field ${f + 1}: topsoil blown away${p.soil === 0 ? ' — dust' : ''}`)
    }
  })
  let gain = 0
  const ripe = ps.map(p => p.crop >= 0 && p.age >= lv.crops[p.crop].grow)
  ps.forEach((p, f) => {
    if (!ripe[f]) return
    let bonus = 0
    if (lv.kind === 'milpa') {
      const sisters = new Set<number>()
      for (const n of [f - 1, f + 1]) if (n >= 0 && n < ps.length && ps[n].crop >= 0 && ps[n].crop !== p.crop) sisters.add(ps[n].crop)
      bonus = sisters.size
    }
    const y = lv.crops[p.crop].yield + bonus
    gain += y
    log?.push(`Field ${f + 1}: ${lv.crops[p.crop].name} harvested +${y}`)
  })
  ps.forEach((p, f) => { if (ripe[f]) { p.crop = -1; p.age = 0 } })
  return { plots: ps, gain }
}

/** Apply the player's action for the current week (real scenario). null if illegal. */
export function step(lv: Level, st: State, a: Action, si = lv.actual): State | null {
  const s = lv.scenarios[si], t = st.week
  if (t >= lv.weeks) return null
  if (a.t === 'plant' && !canPlant(lv, s, t, st.plots, a.f, a.c)) return null
  if (a.t === 'contour' && !canContour(lv, st.plots, a.f)) return null
  const log: string[] = []
  const r = advance(lv, s, t, st.plots, a, log)
  return { week: t + 1, yield: st.yield + r.gain, plots: r.plots, log }
}

export const isWon = (lv: Level, st: State) => st.yield >= lv.quota

/** Scenarios still possible after seeing the weather of weeks 0..t of scenario `si`. */
export function consistentMask(lv: Level, si: number, t: number): number {
  let mask = 0
  lv.scenarios.forEach((s, i) => {
    for (let w = 0; w <= Math.min(t, lv.weeks - 1); w++) if (weatherKey(lv, s, w) !== weatherKey(lv, lv.scenarios[si], w)) return
    mask |= 1 << i
  })
  return mask
}

/** Actions worth searching: no sowing that cannot ripen or that dies this very week. */
function solverActions(lv: Level, s: Scenario, t: number, plots: Plot[], mask: number): Action[] {
  const out: Action[] = [{ t: 'wait' }]
  // Contouring only pays while a storm is still possible.
  const stormAhead = lv.kind === 'dust' && lv.scenarios.some((sc, i) => (mask & (1 << i)) && sc.storms.some(w => w >= t))
  plots.forEach((p, f) => {
    if (stormAhead && canContour(lv, plots, f)) out.push({ t: 'contour', f })
    for (let c = 0; c < lv.crops.length; c++) {
      if (!canPlant(lv, s, t, plots, f, c)) continue
      if (t + lv.crops[c].grow > lv.weeks) continue
      if (killReason(lv, s, t, f, c, 1, p.contour)) continue
      out.push({ t: 'plant', f, c })
    }
  })
  return out
}

const plotsKey = (ps: Plot[]) => ps.map(p => String.fromCharCode(48 + (p.crop + 1) * 8 + p.age) + p.soil + (p.contour ? 'c' : '')).join('')
const firstBit = (m: number) => 31 - Math.clz32(m & -m)

export interface Solver {
  /** Best yield still to come that is guaranteed against every scenario in `mask`. */
  value: (t: number, plots: Plot[], mask: number) => number
  /** The best action now (mask must agree on this week's weather). */
  best: (t: number, plots: Plot[], mask: number) => Action
}

export function makeSolver(lv: Level): Solver {
  const memo = new Map<string, number>()
  const value = (t: number, plots: Plot[], mask: number): number => {
    if (t >= lv.weeks || !mask) return 0
    const key = `${t}|${mask}|${plotsKey(plots)}`
    const hit = memo.get(key)
    if (hit !== undefined) return hit
    const groups = new Map<string, number>()
    for (let i = 0; i < lv.scenarios.length; i++) if (mask & (1 << i)) {
      const k = weatherKey(lv, lv.scenarios[i], t)
      groups.set(k, (groups.get(k) ?? 0) | (1 << i))
    }
    let v: number
    if (groups.size > 1) {
      v = Infinity
      for (const g of groups.values()) v = Math.min(v, value(t, plots, g))
    } else {
      const s = lv.scenarios[firstBit(mask)]
      v = 0
      for (const a of solverActions(lv, s, t, plots, mask)) {
        const r = advance(lv, s, t, plots, a)
        v = Math.max(v, r.gain + value(t + 1, r.plots, mask))
      }
    }
    memo.set(key, v)
    return v
  }
  const best = (t: number, plots: Plot[], mask: number): Action => {
    const s = lv.scenarios[firstBit(mask)]
    let bestA: Action = { t: 'wait' }, bestV = -1
    for (const a of solverActions(lv, s, t, plots, mask)) {
      const r = advance(lv, s, t, plots, a)
      const v = r.gain + value(t + 1, r.plots, mask)
      if (v > bestV) { bestV = v; bestA = a }
    }
    return bestA
  }
  return { value, best }
}

/** Play the max–min policy through scenario `si`; the player only learns the weather week by week. */
export function playPolicy(lv: Level, si: number, solver = makeSolver(lv)): { actions: Action[]; state: State } {
  let st = initialState(lv)
  const actions: Action[] = []
  while (st.week < lv.weeks && !isWon(lv, st)) {
    const mask = consistentMask(lv, si, st.week)
    const a = solver.best(st.week, st.plots, mask)
    actions.push(a)
    st = step(lv, st, a, si)!
  }
  return { actions, state: st }
}

/** The naive sower: first empty field, highest-yield crop that can ripen and survives this week. */
export function greedyYield(lv: Level, si: number): number {
  const s = lv.scenarios[si]
  const order = lv.crops.map((_, c) => c).sort((a, b) => lv.crops[b].yield - lv.crops[a].yield || lv.crops[a].grow - lv.crops[b].grow)
  let st = initialState(lv)
  while (st.week < lv.weeks) {
    const t = st.week
    let a: Action = { t: 'wait' }
    outer: for (let f = 0; f < lv.fields.length; f++) for (const c of order) {
      if (canPlant(lv, s, t, st.plots, f, c) && t + lv.crops[c].grow <= lv.weeks && !killReason(lv, s, t, f, c, 1, st.plots[f].contour)) {
        a = { t: 'plant', f, c }; break outer
      }
    }
    st = step(lv, st, a, si)!
  }
  return st.yield
}

// ── Generation ───────────────────────────────────────────────────────────────

const BASE_SCENARIO: Scenario = { shift: 0, cold: 99, rain: [0, 99], blight: 99, blightCrop: -1, storms: [] }

type Draft = Omit<Level, 'actual' | 'quota' | 'best' | 'greedy'>

function draft(kind: Kind, crops: Crop[], d: Difficulty, rng: Rng): Draft {
  const F = scale(d, [3, 3, 4, 5])
  const base: Draft = { kind, crops, fields: [], weeks: scale(d, [7, 9, 11, 13]), drain: [], dry: [], temp: [], term0: 0, scenarios: [] }
  const plain = () => Array.from({ length: F }, () => ({ elev: 0, soil: 1, paddy: false }))
  switch (kind) {
    case 'nile': {
      const lo = d <= 2 ? 1 : 0
      const fields = Array.from({ length: F }, () => ({ elev: randInt(rng, lo, 3), soil: 1, paddy: false }))
      const drain = fields.map(f => 3 - f.elev + randInt(rng, 0, 1))
      const dry = fields.map((f, i) => drain[i] + 2 + (3 - f.elev) + randInt(rng, 0, 2))
      const shifts = scale(d, [[0], [0], [0, 1], [0, 1, 2]])
      const weeks = Math.max(...dry) + Math.max(...shifts)
      return { ...base, fields, drain, dry, weeks, scenarios: shifts.map(shift => ({ ...BASE_SCENARIO, shift })) }
    }
    case 'terms': {
      const n = scale(d, [2, 3, 3, 4])
      const weeks = scale(d, [8, 10, 12, 13])
      const term0 = randInt(rng, 0, Math.min(8, 24 - weeks))
      const temp = Array.from({ length: weeks }, (_, t) => {
        const j = rng() < 0.25 ? (rng() < 0.5 ? -1 : 1) : 0
        return Math.min(5, Math.max(0, TEMP24[(term0 + t) % 24] + j))
      })
      const fields = Array.from({ length: n }, (_, i) => ({ elev: 0, soil: 1, paddy: i === 0 ? true : i === 1 ? false : rng() < 0.5 }))
      const c0 = weeks - randInt(rng, 2, 4)
      const colds = scale(d, [[c0], [c0], [c0, c0 + 1], [c0 - 1, c0, c0 + 1]])
      return { ...base, fields, weeks, temp, term0, scenarios: colds.map(cold => ({ ...BASE_SCENARIO, cold })) }
    }
    case 'milpa': {
      const r0 = randInt(rng, 1, 2)
      const e0 = r0 + scale(d, [5, 6, 8, 9]) + randInt(rng, 0, 1)
      const rs = scale(d, [[r0], [r0], [r0, r0 + 1], [r0, r0 + 1, r0 + 2]])
      const es = d <= 2 ? [e0] : [e0 - 1, e0]
      const scenarios: Scenario[] = []
      for (const r of rs) for (const e of es) scenarios.push({ ...BASE_SCENARIO, rain: [r, e] })
      return { ...base, fields: plain(), weeks: e0 + 1, scenarios }
    }
    case 'blight': {
      const b0 = randInt(rng, 2, base.weeks - 3)
      const bs = scale(d, [[b0], [b0], [b0, b0 + 1], [b0 - 1, b0, b0 + 1]])
      const scenarios: Scenario[] = []
      for (const blight of bs) for (const blightCrop of [0, 1]) scenarios.push({ ...BASE_SCENARIO, blight, blightCrop })
      return { ...base, fields: plain(), scenarios }
    }
    case 'dust': {
      // Soil and contour multiply the search: the Plains top out at 4 fields.
      const fields = Array.from({ length: Math.min(F, 4) }, () => ({ elev: 0, soil: randInt(rng, 1, 2), paddy: false }))
      const k = scale(d, [1, 2, 2, 3])
      const pool = Array.from({ length: base.weeks - 3 }, (_, i) => i + 1)
      const storms: number[] = []
      while (storms.length < k) {
        const w = pool[Math.floor(rng() * pool.length)]
        if (!storms.some(x => Math.abs(x - w) < 2)) storms.push(w)
      }
      storms.sort((a, b) => a - b)
      let sets: number[][] = [[]]
      for (const w of storms) sets = sets.flatMap(set => (d <= 2 ? [w] : [w, w + 1]).map(x => [...set, x]))
      return { ...base, fields, scenarios: sets.map(st => ({ ...BASE_SCENARIO, storms: st })) }
    }
  }
}

const MIN_QUOTA = [2, 3, 4, 5]

export function generate(cfg: Pick<HarvestConfig, 'kind' | 'crops'>, d: Difficulty, seed: number): Level {
  const rng = mulberry32(hashString(`harvest:${cfg.kind}:${d}`) ^ seed)
  let fallback: Level | null = null
  for (let attempt = 0; attempt < 60; attempt++) {
    const dr = draft(cfg.kind, cfg.crops, d, rng)
    const n = dr.scenarios.length
    const probe = { ...dr, actual: 0, quota: 0, best: 0, greedy: 0 }
    const solver = makeSolver(probe)
    const best = solver.value(0, initialState(probe).plots, (1 << n) - 1)
    if (best < MIN_QUOTA[d - 1]) continue
    const greedy = dr.scenarios.map((_, i) => greedyYield(probe, i))
    let quota = Math.max(MIN_QUOTA[d - 1], best - 1)
    const failing = () => greedy.map((g, i) => (g < quota ? i : -1)).filter(i => i >= 0)
    let candidates = failing()
    if (!candidates.length && d >= 3) { quota = best; candidates = failing() }
    // D1–D2 need not beat the greedy sower, but prefer a season where it fails.
    if (!candidates.length && d <= 2) candidates = greedy.map((_, i) => i)
    if (!candidates.length) {
      if (!fallback) fallback = { ...dr, actual: 0, quota: best, best, greedy: greedy[0] }
      continue
    }
    const actual = candidates[Math.floor(rng() * candidates.length)]
    return { ...dr, actual, quota, best, greedy: greedy[actual] }
  }
  return fallback!
}

// ── Component ────────────────────────────────────────────────────────────────

const SOIL_BG: Record<Kind, string> = { nile: '#8a6a3a', terms: '#9c7b4f', milpa: '#7d6a3e', blight: '#5b4a35', dust: '#8b6b45' }

export default function HarvestGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'nile')
  const level = useMemo(() => generate(cfg, difficulty, seed), [cfg.kind, cfg.crops, difficulty, seed]) // eslint-disable-line react-hooks/exhaustive-deps
  const solver = useMemo(() => makeSolver(level), [level])
  const [state, setState] = useState<State>(() => initialState(level))
  const [sel, setSel] = useState<number | null>(null)
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const live = useRef({ state, settled })
  live.current = { state, settled: live.current.settled || settled }

  const actual = level.scenarios[level.actual]
  const t = Math.min(state.week, level.weeks - 1)
  const mask = consistentMask(level, level.actual, t)
  const possible = level.scenarios.filter((_, i) => mask & (1 << i))

  const act = (a: Action) => {
    const cur = live.current
    if (cur.settled) return
    const next = step(level, cur.state, a)
    if (!next) return
    live.current = { state: next, settled: false }
    setState(next)
    setSel(null)
    if (isWon(level, next)) { live.current.settled = true; win(); return }
    if (next.week >= level.weeks) { live.current.settled = true; lose('The season ended short of the harvest'); return }
    if (next.yield + solver.value(next.week, next.plots, 1 << level.actual) < level.quota) {
      live.current.settled = true
      lose('Not enough season left to reach the harvest')
    }
  }

  // Calendar mark for week w over the scenarios still possible: sure, maybe, or none.
  const mark = (w: number): { label: string; sure: boolean } => {
    const vals = new Set<string>()
    for (const s of possible) {
      switch (level.kind) {
        case 'terms': vals.add(String(tempAt(level, s, w))); break
        case 'milpa': vals.add(raining(s, w) ? '🌧' : ''); break
        case 'blight': vals.add(blighted(s, w) ? '🦠' : ''); break
        case 'dust': vals.add(s.storms.includes(w) ? '🌪' : ''); break
        case 'nile': {
          const phase = level.fields.some((_, f) => basin(level, s, f, w) === 'w') ? '≈' : level.fields.every((_, f) => basin(level, s, f, w) === 'd') ? '☀' : ''
          vals.add(phase); break
        }
      }
    }
    const list = [...vals]
    if (list.length === 1) return { label: list[0], sure: true }
    if (level.kind === 'terms') {
      const nums = list.map(Number)
      return { label: `${Math.min(...nums)}-${Math.max(...nums)}`, sure: false }
    }
    return { label: list.filter(Boolean)[0] ?? '', sure: false }
  }

  const range = (vals: number[]) => {
    const lo = Math.min(...vals) + 1, hi = Math.max(...vals) + 1
    return lo === hi ? `${lo}` : `${lo}–${hi}`
  }

  const seasonLabel =
    level.kind === 'terms' ? TERMS[(level.term0 + t) % 24] :
    level.kind === 'nile' ? (level.fields.some((_, f) => basin(level, actual, f, t) === 'w') ? 'Akhet — inundation' : level.fields.some((_, f) => basin(level, actual, f, t) === 'm') ? 'Peret — sowing' : 'Shemu — dry') :
    level.kind === 'milpa' ? (raining(actual, t) ? 'Rainy season' : t < actual.rain[0] ? 'Dry — waiting for rain' : 'Dry season') :
    level.kind === 'blight' ? (blighted(actual, t) ? `Blight on the ${level.crops[actual.blightCrop].name}!` : 'Blight not yet here') :
    actual.storms.includes(t) ? 'Dust storm this week!' : 'Clear skies'

  const cols = level.fields.length
  const selPlot = sel !== null ? state.plots[sel] : null

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-[10px] font-bold text-ink-2">{cfg.rule}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p data-testid="harvest-yield" className="font-bold text-ink-2">🧺 {state.yield} / {level.quota}</p>
          <p data-testid="harvest-week" className={level.weeks - state.week <= 2 ? 'text-red-600 font-bold' : ''}>
            Week {Math.min(state.week + 1, level.weeks)} / {level.weeks}
          </p>
        </div>
      </div>

      <div className="flex gap-0.5 justify-center flex-wrap" aria-label="calendar">
        {Array.from({ length: level.weeks }, (_, w) => {
          const m = mark(w)
          const past = w < state.week, now = w === state.week
          return (
            <span key={w} data-testid={`week-${w}`}
              className={`w-6 h-9 rounded border flex flex-col items-center justify-center leading-none
                ${past ? 'bg-panel border-line opacity-50' : now ? 'border-accent ring-1 ring-accent bg-paper' : 'bg-paper border-line'}`}>
              <span className="text-[8px] text-muted">{w + 1}</span>
              <span className={`text-[10px] ${m.sure ? '' : 'opacity-50'}`}>
                {level.kind === 'terms' && m.label ? `${m.label}` : m.label}{!m.sure && level.kind !== 'terms' ? '?' : ''}
              </span>
            </span>
          )
        })}
      </div>
      <p className="text-center text-[11px] font-bold text-ink-2 -mt-1" data-testid="harvest-season">
        {seasonLabel}{level.kind === 'terms' ? ` · 🌡 ${tempAt(level, actual, t)}` : ''}
      </p>

      <div className="grid gap-1.5 w-full max-w-[430px] mx-auto" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {state.plots.map((p, f) => {
          const spec = level.fields[f]
          const b = level.kind === 'nile' ? basin(level, actual, f, t) : null
          const bg =
            b === 'w' ? '#3b82f6' : b === 'd' ? '#d6c08f' :
            level.kind === 'terms' && spec.paddy ? '#5d8f7a' :
            level.kind === 'dust' ? (p.soil >= 2 ? '#6b4a2b' : p.soil === 1 ? '#a07a4e' : '#cbbf9f') :
            level.kind === 'milpa' && raining(actual, t) ? '#6b5a34' : SOIL_BG[level.kind]
          const crop = p.crop >= 0 ? level.crops[p.crop] : null
          const note =
            level.kind === 'nile' ? `mud ${range(possible.map(s => drainOf(level, s, f)))} · dry ${range(possible.map(s => dryOf(level, s, f)))}` :
            level.kind === 'terms' ? (spec.paddy ? '💧 paddy' : 'dry field') :
            level.kind === 'dust' ? `soil ${'●'.repeat(p.soil)}${'○'.repeat(Math.max(0, 2 - p.soil))}${p.contour ? ' ≋' : ''}` : `mound ${f + 1}`
          return (
            <button key={f} type="button" data-testid={`field-${f}`} disabled={settled}
              onClick={() => setSel(sel === f ? null : f)}
              className={`relative rounded-lg border-2 flex flex-col items-center justify-between py-1 px-0.5 min-h-[92px] touch-manipulation
                ${sel === f ? 'border-amber-400' : 'border-black/10'}`}
              style={{
                background: bg,
                backgroundImage: p.contour ? 'repeating-linear-gradient(170deg, transparent 0 7px, rgba(255,255,255,.25) 7px 9px)' : undefined,
              }}>
              <span className="text-[9px] font-bold text-white/90 drop-shadow">
                {level.kind === 'nile' ? `▲${spec.elev}` : `F${f + 1}`}
              </span>
              <span className="text-2xl leading-none">
                {crop ? crop.icon : b === 'w' ? '🌊' : p.soil <= 0 ? '💨' : ''}
              </span>
              {crop
                ? <span className="flex gap-0.5">{Array.from({ length: crop.grow }, (_, k) => (
                    <span key={k} className={`w-1.5 h-1.5 rounded-full ${k < p.age ? 'bg-lime-300' : 'bg-white/40'}`} />
                  ))}</span>
                : <span className="text-[9px] text-white/80">{b === 'm' || (b === null && p.soil > 0) ? 'empty' : ''}</span>}
              <span className="text-[8px] leading-tight text-white/90 drop-shadow text-center">{note}</span>
            </button>
          )
        })}
      </div>

      {!settled && (
        <div className="flex flex-col gap-1.5 w-full max-w-[430px] mx-auto">
          {sel !== null && selPlot && (
            <div className="flex flex-wrap gap-1.5 justify-center">
              {level.crops.map((c, ci) => {
                const ok = canPlant(level, actual, state.week, state.plots, sel, ci)
                return (
                  <button key={ci} type="button" data-testid={`crop-${ci}`} disabled={!ok} onClick={() => act({ t: 'plant', f: sel, c: ci })}
                    className="h-11 px-2 rounded-lg border bg-panel border-line text-ink text-[11px] font-bold disabled:opacity-40 leading-tight">
                    {c.icon} {c.name}
                    <span className="block text-[9px] font-normal text-muted">
                      {c.grow} wk → {c.yield}{c.tmin !== undefined ? ` · 🌡${c.tmin}–${c.tmax}` : ''}{c.paddy ? ' · 💧' : ''}
                    </span>
                  </button>
                )
              })}
              {level.kind === 'dust' && (
                <button type="button" data-testid="contour" disabled={!canContour(level, state.plots, sel)} onClick={() => act({ t: 'contour', f: sel })}
                  className="h-11 px-2 rounded-lg border bg-panel border-line text-ink text-[11px] font-bold disabled:opacity-40">
                  ≋ Contour-plough
                </button>
              )}
            </div>
          )}
          <button type="button" data-testid="harvest-wait" onClick={() => act({ t: 'wait' })}
            className="h-10 rounded-lg border text-xs font-bold bg-panel border-line text-ink-2 hover:border-accent/50">
            ⏳ Let the week pass
          </button>
        </div>
      )}

      <p className="text-[10px] text-center min-h-[14px] text-ink-2" data-testid="harvest-log">{state.log.join(' · ')}</p>
      <p className="text-muted/80 text-[10px] text-center -mt-1">
        {settled ? '' : 'One job a week: tap a field, then sow a crop' + (level.kind === 'dust' ? ' or plough it on the contour' : '') + ' — or let the week pass. Ripe crops are lifted by themselves.'}
        {!settled && possible.length > 1 ? ' Faded marks with ? are only possible: the forecast is uncertain.' : ''}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="The granary is full!" loseTitle={reason ?? 'The harvest failed'} />
    </div>
  )
}
