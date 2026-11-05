/**
 * Port of the scoring formulas in web/src/battle/engine.ts
 * (traitBonusForGP, computeLocationTotal, survival/hazard checks), plus the
 * balance analytics built on them. Pure functions over the editable data.
 */
import { STATS, STAT_LABEL, type Card, type FollowerTemplate, type LegacyContext, type LegacyEffect, type LocationCard, type StatKey } from '../types'
import { ENGINE_CONSTANTS } from './engineTraits'

// ─── Board context for trait evaluation ──────────────────────────────────────

export interface SideSpec {
  gps: Card[]
  followers: FollowerTemplate[]
}

export interface BoardContext {
  /** Allied GPs at the location (including the GP being scored). */
  alliedGPs: Card[]
  alliedFollowers: FollowerTemplate[]
  /** Opponent cards (GP + followers) at the location. */
  opponentGPs: Card[]
  opponentFollowers: FollowerTemplate[]
  /** Any GP (any owner) anywhere on the field, for Aspasia / Mani. */
  fieldGPs: Card[]
  /** Any event active at the location (Gregory Peck). */
  eventActive: boolean
}

/** Mirror of traitBonusForGP(). */
export function traitBonus(gp: Card, stat: StatKey, ctx: BoardContext): number {
  const alliedCount = ctx.alliedGPs.length + ctx.alliedFollowers.length
  const opponentCount = ctx.opponentGPs.length + ctx.opponentFollowers.length
  let bonus = 0
  switch (gp.figureName) {
    case 'Belisarius':
      if (opponentCount > alliedCount && (stat === 'strength' || stat === 'politics')) bonus += 3
      break
    case 'Imhotep':
      if (ctx.alliedFollowers.length >= 2 && (stat === 'technique' || stat === 'intelligence')) bonus += 4
      break
    case 'Lu Yu':
      if (ctx.alliedGPs.length === 1) bonus += 3
      break
    case 'Andrew Mellon':
      if (stat === 'wealth') bonus += ctx.alliedFollowers.filter(f => f.name === 'Merchant').length * 2
      break
    case 'Pericles':
      bonus += ctx.alliedFollowers.length
      break
    case 'Aspasia':
      if (ctx.fieldGPs.some(g => g.figureName === 'Pericles') && (stat === 'politics' || stat === 'intelligence')) bonus += 4
      break
    case 'Enkidu': {
      const femaleHere = [...ctx.alliedGPs, ...ctx.opponentGPs].some(g => g.gender === 'female')
      if (femaleHere) {
        if (stat === 'strength') bonus += 5
        if (stat === 'culture') bonus += 3
      }
      break
    }
    case 'Lancelot':
      if (stat === 'politics') bonus -= 5
      break
    case 'Marie Antoinette':
      if (stat === 'wealth') bonus += 8
      if (stat === 'politics') bonus -= 5
      break
    case 'Mani': {
      const eras = new Set(ctx.fieldGPs.map(g => g.era)).size
      if (stat === 'belief' || stat === 'intelligence') bonus += eras
      break
    }
    case 'Johannes Brahms': {
      const sum = ctx.alliedGPs.reduce((s, g) => s + g[stat], 0)
      bonus += sum >= 13 ? 2 : -2
      break
    }
    case 'Sergei Eisenstein':
      if (stat === 'culture') bonus += Math.max(0, gp.intelligence - gp.culture)
      break
    case 'Gregory Peck':
      if (ctx.eventActive && stat === 'reputation') bonus += 3
      break
  }
  return bonus
}

export interface Contribution {
  type: 'gp' | 'follower'
  name: string
  base: number
  trait: number
  follower: number
  location: number
  total: number
}

export interface SideTotal { total: number; cards: Contribution[] }

/** Mirror of computeSide()/computeLocationTotal(): conflict total for one side. */
export function conflictTotal(
  side: SideSpec, stat: StatKey, ctx: BoardContext, location: LocationCard | null, includeLocation = true,
): SideTotal {
  const locBonus = includeLocation ? (location?.bonuses[stat] ?? 0) : 0
  const cards: Contribution[] = []
  let total = 0
  for (const gp of side.gps) {
    const base = gp[stat]
    const trait = traitBonus(gp, stat, ctx)
    const t = base + trait + locBonus
    cards.push({ type: 'gp', name: gp.figureName, base, trait, follower: 0, location: locBonus, total: t })
    total += t
  }
  for (const f of side.followers) {
    const matches = f.stat === stat
    const identityMatch = matches && side.gps.some(g => g.identities.includes(f.name))
    const fb = matches ? (identityMatch ? ENGINE_CONSTANTS.followerIdentityMatchBonus : f.bonus) : 0
    cards.push({ type: 'follower', name: f.name, base: 0, trait: 0, follower: fb, location: 0, total: fb })
    total += fb
  }
  return { total, cards }
}

/** Mirror of computeEventSide(): local survival total (no location bonus). */
export function survivalTotal(side: SideSpec, stat: StatKey, ctx: BoardContext): SideTotal {
  return conflictTotal(side, stat, ctx, null, false)
}

/** Mirror of the natural_hazard branch: min over the 8 per-stat totals. */
export function hazardMinStat(side: SideSpec): { min: number; byStat: Record<StatKey, number> } {
  const byStat = Object.fromEntries(STATS.map(s => [s, 0])) as Record<StatKey, number>
  for (const gp of side.gps) for (const s of STATS) byStat[s] += gp[s]
  for (const f of side.followers) {
    const identityMatch = side.gps.some(g => g.identities.includes(f.name))
    byStat[f.stat] += identityMatch ? ENGINE_CONSTANTS.followerIdentityMatchBonus : f.bonus
  }
  return { min: Math.min(...STATS.map(s => byStat[s])), byStat }
}

export function soloContext(gp: Card, fieldGPs: Card[] = [gp]): BoardContext {
  return { alliedGPs: [gp], alliedFollowers: [], opponentGPs: [], opponentFollowers: [], fieldGPs, eventActive: false }
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export function statTotal(c: Card): number {
  return STATS.reduce((s, k) => s + c[k], 0)
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

export function stddev(xs: number[]): number {
  const m = mean(xs)
  return xs.length ? Math.sqrt(mean(xs.map(x => (x - m) ** 2))) : 0
}

export interface StatSummary { stat: StatKey; mean: number; sd: number; min: number; max: number; hist: number[] }

export function statSummaries(cards: Card[], maxStat = 12): StatSummary[] {
  return STATS.map(stat => {
    const xs = cards.map(c => c[stat])
    const hist = Array.from({ length: maxStat + 1 }, () => 0)
    for (const x of xs) hist[Math.min(Math.max(0, Math.round(x)), maxStat)] += 1
    return { stat, mean: mean(xs), sd: stddev(xs), min: Math.min(...xs), max: Math.max(...xs), hist }
  })
}

export interface PowerRow {
  id: string
  figure: string
  era: string
  total: number
  /** Win rate per stat in 1v1 base-stat conflicts against every other card (ties = 0.5). */
  winRate: Record<StatKey, number>
  /** Mean of winRate over the 8 stats. */
  power: number
  bestStat: StatKey
  minStat: number
  /** Stats where the card alone fails local survival at the engine threshold. */
  survivalFails: StatKey[]
  achievementStat: StatKey | null
  achievementTicks: number
  /** Win rate in its own achievement stat, with the 'worthy opponent' filter (victim stat >= 5). */
  achievementWinRate: number | null
}

export function powerTable(cards: Card[], survivalThreshold = ENGINE_CONSTANTS.localSurvivalThreshold): PowerRow[] {
  return cards.map(c => {
    const winRate = {} as Record<StatKey, number>
    for (const s of STATS) {
      let score = 0
      for (const o of cards) {
        if (o.id === c.id) continue
        if (c[s] > o[s]) score += 1
        else if (c[s] === o[s]) score += 0.5
      }
      winRate[s] = cards.length > 1 ? score / (cards.length - 1) : 0
    }
    const power = mean(STATS.map(s => winRate[s]))
    const bestStat = STATS.reduce((b, s) => (c[s] > c[b] ? s : b), STATS[0])
    const minStat = Math.min(...STATS.map(s => c[s]))
    const survivalFails = STATS.filter(s => c[s] < survivalThreshold)
    const achievementStat = c.legacy?.unlock.stat ?? null
    let achievementWinRate: number | null = null
    if (achievementStat) {
      const worthy = cards.filter(o => o.id !== c.id && o[achievementStat] >= ENGINE_CONSTANTS.worthyOpponentMinStat)
      let score = 0
      for (const o of worthy) score += c[achievementStat] > o[achievementStat] ? 1 : c[achievementStat] === o[achievementStat] ? 0.5 : 0
      achievementWinRate = worthy.length ? score / worthy.length : 0
    }
    return {
      id: c.id, figure: c.figureName, era: c.era, total: statTotal(c), winRate, power, bestStat, minStat,
      survivalFails, achievementStat,
      achievementTicks: c.legacy?.unlock.wins ?? 1,
      achievementWinRate,
    }
  })
}

/** Mean of a stat per group (era, identity, gender…). */
export function groupMeans(cards: Card[], groupOf: (c: Card) => string[]): { group: string; n: number; means: Record<StatKey, number> }[] {
  const buckets = new Map<string, Card[]>()
  for (const c of cards) for (const g of groupOf(c)) {
    if (!buckets.has(g)) buckets.set(g, [])
    buckets.get(g)!.push(c)
  }
  return [...buckets.entries()].map(([group, cs]) => ({
    group, n: cs.length,
    means: Object.fromEntries(STATS.map(s => [s, mean(cs.map(c => c[s]))])) as Record<StatKey, number>,
  }))
}

export interface LocationStatRow { era: string; n: number; sums: Record<StatKey, number>; meanCapacity: number }

export function locationBonusByEra(locs: LocationCard[]): LocationStatRow[] {
  const byEra = new Map<string, LocationCard[]>()
  for (const l of locs) {
    if (!byEra.has(l.era)) byEra.set(l.era, [])
    byEra.get(l.era)!.push(l)
  }
  return [...byEra.entries()].map(([era, ls]) => ({
    era, n: ls.length,
    sums: Object.fromEntries(STATS.map(s => [s, ls.reduce((a, l) => a + (l.bonuses[s] ?? 0), 0)])) as Record<StatKey, number>,
    meanCapacity: mean(ls.map(l => l.capacity ?? 0)),
  }))
}

/** How many GPs can give each follower identity the +4 identity-match bonus. */
export function identityCoverage(cards: Card[], followers: FollowerTemplate[]): { identity: string; stat: StatKey; gpCount: number; figures: string[] }[] {
  return followers.map(f => {
    const figures = cards.filter(c => c.identities.includes(f.name)).map(c => c.figureName)
    return { identity: f.name, stat: f.stat, gpCount: figures.length, figures }
  })
}

/** Compare two card sets and return power deltas for cards that changed. */
export function powerDeltas(before: Card[], after: Card[]): { id: string; figure: string; before: number; after: number; delta: number; totalBefore: number; totalAfter: number }[] {
  const pb = new Map(powerTable(before).map(r => [r.id, r]))
  const pa = powerTable(after)
  const changedIds = new Set<string>()
  const beforeById = new Map(before.map(c => [c.id, c]))
  for (const c of after) {
    const b = beforeById.get(c.id)
    if (!b || STATS.some(s => b[s] !== c[s])) changedIds.add(c.id)
  }
  return pa
    .map(r => {
      const b = pb.get(r.id)
      return { id: r.id, figure: r.figure, before: b?.power ?? 0, after: r.power, delta: r.power - (b?.power ?? 0), totalBefore: b?.total ?? 0, totalAfter: r.total }
    })
    .filter(r => Math.abs(r.delta) > 1e-9 || changedIds.has(r.id))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
}

// ─── Timeline and legacies (mirrors web/src/battle/engine.ts) ───────────────

export function formatYear(year: number): string {
  if (year < 0) return `${-year} BC`
  return year < 1000 ? `${year} AD` : `${year}`
}

export function careerStart(c: Card): number {
  return c.born + (c.careerAge ?? ENGINE_CONSTANTS.defaultCareerAge)
}

export function lifeEnd(c: Card): number {
  return c.died ?? ENGINE_CONSTANTS.timelineEndYear
}

/** Years a card can be played (career start to death). */
export function careerYears(c: Card): number {
  return Math.max(0, lifeEnd(c) - careerStart(c) + 1)
}

const CONTEXT_WORDS: Record<LegacyContext, string> = {
  attack: 'when you attack', defend: 'when you defend', survival: 'in survival checks (survivals and hazards)',
  competition: 'in global competitions', any: 'in every contest',
}

export function describeLegacyEffect(e: LegacyEffect): string {
  switch (e.kind) {
    case 'contest': return `+${e.amount} ${e.stat === 'any' ? 'to your total' : STAT_LABEL[e.stat]} ${CONTEXT_WORDS[e.context]}.`
    case 'follower': return `Each of your ${e.stat === 'any' ? '' : STAT_LABEL[e.stat] + ' '}Followers that counts in a contest adds +${e.amount} more.`
    case 'hazard_shield': return 'Your cards ignore natural hazards.'
    case 'longevity': return `Your Great People live ${e.years} years longer.`
    case 'prodigy': return `Your Great People start their careers ${e.years} years earlier.`
    case 'successors': return `+${e.count} choice whenever you pick a successor.`
    case 'income': return `Every ${e.every} years you gain ${e.card === 'event' ? 'an Event card' : 'a Follower'}.`
  }
}

/** A default effect of each kind, for switching kinds in the editor. */
export function defaultEffect(kind: LegacyEffect['kind']): LegacyEffect {
  switch (kind) {
    case 'contest': return { kind, stat: 'any', amount: 2, context: 'any' }
    case 'follower': return { kind, stat: 'any', amount: 1 }
    case 'hazard_shield': return { kind }
    case 'longevity': return { kind, years: 10 }
    case 'prodigy': return { kind, years: 4 }
    case 'successors': return { kind, count: 1 }
    case 'income': return { kind, card: 'event', every: 5 }
  }
}

/** How many Great People are in their careers in each `bucket`-year slice of history. */
export function careerCoverage(cards: Card[], bucket = 100): { from: number; active: number; names: string[] }[] {
  if (!cards.length) return []
  const start = Math.floor(Math.min(...cards.map(careerStart)) / bucket) * bucket
  const end = Math.min(ENGINE_CONSTANTS.timelineEndYear, Math.max(...cards.map(lifeEnd)))
  const out: { from: number; active: number; names: string[] }[] = []
  for (let y = start; y <= end; y += bucket) {
    const names = cards.filter(c => careerStart(c) < y + bucket && lifeEnd(c) >= y).map(c => c.figureName)
    out.push({ from: y, active: names.length, names })
  }
  return out
}

/** Gaps between consecutive births: long gaps are long time skips when a lineage needs a successor. */
export function birthGaps(cards: Card[]): { after: string; before: string; from: number; to: number; years: number }[] {
  const sorted = [...cards].sort((a, b) => a.born - b.born)
  const gaps = []
  for (let i = 1; i < sorted.length; i++) {
    gaps.push({ after: sorted[i - 1].figureName, before: sorted[i].figureName, from: sorted[i - 1].born, to: sorted[i].born, years: sorted[i].born - sorted[i - 1].born })
  }
  return gaps.sort((a, b) => b.years - a.years)
}
