// Every Great Person earns their legacy through their own achievement, the
// condition written on the card (cards.json `achievement`).  Winning a fight
// no longer earns a legacy by itself.
//
// The reducer records what happened as AchievementEvents; after every
// action gameReducer runs them past each Great Person on the board whose
// legacy is still to earn.  A Great Person who meets their condition is
// marked ready (achievementTicks reaches the unlock), and the owner claims
// the legacy as before (Claim Legacy, with the card public).

import type {
  Card, EventCard, FollowerCard, GameState, LocationState, OnboardCard, PlayerState, StatKey, TurnActions,
} from '@/types'

export type AchievementEvent =
  /** The player's turn ended; `actions` is what they did in it. */
  | { kind: 'turn'; playerId: string; actions: TurnActions }
  /** A year ended. */
  | { kind: 'round' }
  | {
      kind: 'fight'; locId: string; stat: StatKey; kill: boolean
      attacker: OnboardCard; defender: OnboardCard; result: 'attacker' | 'defender' | 'draw'
      /** The city's cards before the fight. */
      before: OnboardCard[]
    }
  | {
      kind: 'survival'; locId: string; eventName: string; hazard: boolean; stat: StatKey | null; threshold: number
      /** Per player: their total and whether they passed. */
      results: { playerId: string; total: number; survived: boolean }[]
      before: OnboardCard[]
    }
  /** A Great Person died: killed in a fight (killerId), swept away, or of old age. */
  | { kind: 'death'; locId: string | null; playerId: string; cardId: string; killerId?: string }
  | { kind: 'ended'; locId: string; event: EventCard; playerId: string }
  | { kind: 'follower'; locId: string; playerId: string }
  | { kind: 'event'; locId: string; playerId: string }
  | { kind: 'claim'; playerId: string; cardId: string }
  | { kind: 'competition'; winnerId: string; stat: StatKey }

export interface Lookups {
  gp: Record<string, Card>
  follower: Record<string, FollowerCard>
}

interface Ctx {
  state: GameState
  owner: PlayerState
  /** The Great Person whose achievement is checked. */
  me: OnboardCard
  loc: LocationState
  look: Lookups
  /** This card's memory across events (streaks, places visited). */
  memo: Record<string, unknown>
}

type Rule = (ev: AchievementEvent, c: Ctx) => boolean

// ── Helpers ──────────────────────────────────────────────────────────────────

const SCHOLARS = ['Educator', 'Philosopher', 'Scientist', 'Mathematician', 'Astronomer']

function identities(oc: OnboardCard, look: Lookups): string[] {
  if (oc.type === 'gp') return look.gp[oc.cardId]?.identities ?? []
  const f = look.follower[oc.cardId]
  return f ? [f.name] : []
}
const is = (oc: OnboardCard, look: Lookups, ...names: string[]) => identities(oc, look).some(i => names.includes(i))
const female = (oc: OnboardCard, look: Lookups) => oc.type === 'gp' && look.gp[oc.cardId]?.gender === 'female'

/** My other cards in my city. */
const allies = (c: Ctx) => c.loc.cards.filter(x => x.playerId === c.owner.id && x.instanceId !== c.me.instanceId)
const alliesWith = (c: Ctx, ...names: string[]) => allies(c).filter(x => is(x, c.look, ...names)).length
const others = (c: Ctx) => c.loc.cards.filter(x => x.instanceId !== c.me.instanceId)
const anyHere = (c: Ctx, cardId: string) => others(c).some(x => x.type === 'gp' && x.cardId === cardId)
const myCities = (c: Ctx) => c.state.locations.filter(l => l.cards.some(x => x.playerId === c.owner.id))
const atMyCity = (c: Ctx, locId: string | null) => locId === c.loc.id

/** The side my card fought on in a fight at my city: its result for me, or null if I was not in it. */
function mySide(ev: Extract<AchievementEvent, { kind: 'fight' }>, c: Ctx): 'won' | 'lost' | 'draw' | null {
  if (ev.locId !== c.loc.id) return null
  const attacking = ev.attacker.playerId === c.owner.id, defending = ev.defender.playerId === c.owner.id
  if (!attacking && !defending) return null
  if (ev.result === 'draw') return 'draw'
  return (ev.result === 'attacker') === attacking ? 'won' : 'lost'
}
const count = (cards: OnboardCard[], pid: string) => cards.filter(x => x.playerId === pid).length
const rivalOf = (ev: Extract<AchievementEvent, { kind: 'fight' }>, c: Ctx) =>
  ev.attacker.playerId === c.owner.id ? ev.defender.playerId : ev.attacker.playerId

/** Total of one stat in a city: Great People's base stat plus Followers of that stat. */
function statAt(loc: LocationState, stat: StatKey, look: Lookups, pid?: string, gpOnly = false): number {
  let n = 0
  for (const x of loc.cards) {
    if (pid && x.playerId !== pid) continue
    if (x.type === 'gp') n += look.gp[x.cardId]?.[stat] ?? 0
    else if (!gpOnly) { const f = look.follower[x.cardId]; if (f?.stat === stat) n += f.bonus }
  }
  return n
}

/** A contest I won with my card's city involved: a fight, a survival, or the competition. */
function wonContest(ev: AchievementEvent, c: Ctx, opts: { stat?: StatKey; conflict?: boolean } = {}): boolean {
  if (ev.kind === 'fight') {
    if (opts.conflict === false) return false
    return mySide(ev, c) === 'won' && (!opts.stat || ev.stat === opts.stat)
  }
  if (ev.kind === 'survival') {
    if (opts.conflict === true || !atMyCity(c, ev.locId)) return false
    const me = ev.results.find(r => r.playerId === c.owner.id)
    return !!me?.survived && ev.results.some(r => !r.survived) && (!opts.stat || ev.stat === opts.stat)
  }
  if (ev.kind === 'competition') return opts.conflict !== true && ev.winnerId === c.owner.id && (!opts.stat || ev.stat === opts.stat)
  return false
}

/** Count consecutive years a condition holds; true once it reaches `n`. */
function streak(c: Ctx, key: string, holds: boolean, n: number): boolean {
  const v = holds ? ((c.memo[key] as number) ?? 0) + 1 : 0
  c.memo[key] = v
  return v >= n
}
/** Count occurrences over the game; true once it reaches `n`. */
function tally(c: Ctx, key: string, n: number): boolean {
  const v = ((c.memo[key] as number) ?? 0) + 1
  c.memo[key] = v
  return v >= n
}
/** Remember a set of things (cities visited); true once it holds `n`. */
function collect(c: Ctx, key: string, item: string, n: number): boolean {
  const set = new Set((c.memo[key] as string[]) ?? [])
  set.add(item)
  c.memo[key] = [...set]
  return set.size >= n
}
/** The card stayed in the same city since the last year: a move or a retrieval resets it. */
function stayed(c: Ctx): boolean {
  const here = `${c.me.instanceId}@${c.loc.id}`
  const same = c.memo.at === here
  c.memo.at = here
  return same
}

const onTurn = (ev: AchievementEvent, c: Ctx) => ev.kind === 'turn' && ev.playerId === c.owner.id
const onRound = (ev: AchievementEvent) => ev.kind === 'round'
const acted = (ev: AchievementEvent, oc: OnboardCard) =>
  ev.kind === 'turn' && (ev.actions.movedCards.includes(oc.instanceId) || ev.actions.actedCards.includes(oc.instanceId))

// ── The 80 achievements, by card id ──────────────────────────────────────────

export const ACHIEVEMENTS: Record<string, Rule> = {
  gandhi: (ev, c) => ev.kind === 'fight' && ev.defender.playerId === c.owner.id && mySide(ev, c) === 'won'
    && !(c.state.roundActed ?? []).includes(c.owner.id),
  coco_chanel: (ev, c) => onTurn(ev, c) && alliesWith(c, 'Naturalist') >= 1 && alliesWith(c, 'Artist', 'Merchant') >= 2,
  mao_zedong: (ev, c) => ev.kind === 'survival' && ev.eventName === 'Censorship'
    && ev.before.some(x => x.playerId !== c.owner.id && is(x, c.look, 'Musician', 'Artist', 'Actor', 'Writer')
      && ev.results.find(r => r.playerId === x.playerId)?.survived === false),
  belisarius: (ev, c) => ev.kind === 'fight' && ev.attacker.instanceId === c.me.instanceId && mySide(ev, c) === 'won'
    && count(ev.before, c.owner.id) < count(ev.before, ev.defender.playerId),
  imhotep: (ev, c) => onTurn(ev, c) && alliesWith(c, 'Architect') >= 1 && alliesWith(c, 'Engineer', 'Scientist') >= 1,
  lu_yu: (ev, c) => onRound(ev) && streak(c, 'alone', !others(c).some(x => x.type === 'gp'), 3),
  alan_turing: (ev, c) => {
    if (ev.kind !== 'survival' || ev.hazard || !atMyCity(c, ev.locId) || !ev.stat) return false
    const me = ev.results.find(r => r.playerId === c.owner.id)
    const mine = c.look.gp[c.me.cardId]?.[ev.stat] ?? 0
    return !!me?.survived && me.total - mine < ev.threshold
  },
  an_jung_geun: (ev, c) => onTurn(ev, c)
    && others(c).filter(x => x.type === 'gp').every(x => (c.look.gp[x.cardId]?.countries ?? []).includes('Korea'))
    && others(c).some(x => x.playerId !== c.owner.id && x.type === 'follower'),
  andrew_mellon: (ev, c) => onTurn(ev, c)
    && c.state.locations.flatMap(l => l.cards).filter(x => x.playerId === c.owner.id && x.instanceId !== c.me.instanceId && is(x, c.look, 'Banker', 'Merchant')).length >= 3,
  audrey_hepburn: (ev, c) => onTurn(ev, c) && alliesWith(c, 'Doctor', 'Monastic') >= 1 && c.loc.activeEvent?.type !== 'local_event',
  clara_schumann: (ev, c) => onRound(ev) && streak(c, 'duo', alliesWith(c, 'Musician') === 1, 2),
  euclid: (ev, c) => {
    if (!onTurn(ev, c)) return false
    const n = c.state.locations.map(l => count(l.cards, c.owner.id))
    return n.every(k => k > 0 && k === n[0])
  },
  gregor_mendel: (ev, c) => onTurn(ev, c) && alliesWith(c, 'Naturalist') >= 2,
  hua_mulan: (ev, c) => ev.kind === 'fight' && ev.stat === 'strength' && ev.defender.playerId === c.owner.id
    && mySide(ev, c) === 'won' && alliesWith(c, 'Soldier', 'Warrior', 'General') >= 1,
  johannes_brahms: (ev, c) => onTurn(ev, c) && alliesWith(c, 'Musician') >= 1 && alliesWith(c, 'Writer') >= 1,
  lancelot: (ev, c) => onTurn(ev, c)
    && allies(c).filter(x => is(x, c.look, 'Soldier', 'Warrior', 'General') && !acted(ev, x)).length >= 2,
  li_qingzhao: (ev, c) => {
    if (!onTurn(ev, c)) return false
    const players = [...new Set(c.loc.cards.map(x => x.playerId))]
    return players.length >= 2 && players.every(p => count(c.loc.cards, p) === 2)
  },
  louis_xvi: (ev, c) => {
    if (ev.kind !== 'death' || !atMyCity(c, ev.locId) || !ev.killerId) return false
    const turn = `${c.state.round}-${c.state.currentPlayerIdx}`
    if (c.memo.turn !== turn) { c.memo.turn = turn; c.memo.kills = 0 }
    c.memo.kills = (c.memo.kills as number) + 1
    return (c.memo.kills as number) >= 2
  },
  marie_antoinette: (ev, c) => ev.kind === 'death' && atMyCity(c, ev.locId) && ev.cardId !== c.me.cardId
    && (c.look.gp[ev.cardId]?.identities ?? []).some(i => i === 'Artist' || i === 'Merchant'),
  miyamoto_musashi: (ev, c) => {
    if (ev.kind !== 'fight' || ev.attacker.instanceId !== c.me.instanceId || mySide(ev, c) !== 'won') return false
    const turn = `${c.state.round}-${c.state.currentPlayerIdx}`
    if (c.memo.turn !== turn) { c.memo.turn = turn; c.memo.wins = 0 }
    c.memo.wins = (c.memo.wins as number) + 1
    return (c.memo.wins as number) >= 2
  },
  sargon_i: (ev, c) => onTurn(ev, c) && myCities(c).length >= 4,
  gilgamesh: (ev, c) => onTurn(ev, c) && anyHere(c, 'enkidu'),
  enkidu: (ev, c) => ev.kind === 'turn' && ev.playerId === c.owner.id && ev.actions.movedCards.includes(c.me.instanceId)
    && allies(c).some(x => ev.actions.movedCards.includes(x.instanceId)),
  pericles: (ev, c) => ev.kind === 'death' && atMyCity(c, ev.locId) && ev.playerId === c.owner.id
    && !!ev.killerId && ev.killerId !== c.owner.id && ev.cardId !== c.me.cardId,
  aspasia: (ev, c) => onTurn(ev, c) && alliesWith(c, 'Philosopher') >= 2,
  pleistoanax: (ev, c) => ev.kind === 'fight' && mySide(ev, c) === 'draw' && tally(c, 'draws', 2),
  cicero: (ev, c) => ev.kind === 'fight' && ev.stat === 'politics' && ev.defender.playerId === c.owner.id
    && mySide(ev, c) === 'won' && alliesWith(c, 'Statesman') >= 1,
  anaxagoras: (ev, c) => onTurn(ev, c) && alliesWith(c, 'Philosopher', 'Scientist') >= 2,
  zeno_of_elea: (ev, c) => onRound(ev) && streak(c, 'still', stayed(c) && !!c.loc.activeEvent, 3),
  al_khwarizmi: (ev, c) => {
    if (!onTurn(ev, c)) return false
    const seen = new Set<number>()
    for (const x of c.state.locations.flatMap(l => l.cards)) {
      if (x.playerId !== c.owner.id) continue
      if (x.type === 'gp') { const g = c.look.gp[x.cardId]; if (g) for (const k of STAT_KEYS) seen.add(g[k]) }
      else { const f = c.look.follower[x.cardId]; if (f) seen.add(f.bonus) }
    }
    return [1, 2, 3, 4, 5].every(n => seen.has(n))
  },
  mani: (ev, c) => onTurn(ev, c) && allies(c).some(x => x.type === 'gp' && c.look.gp[x.cardId]?.era !== c.look.gp[c.me.cardId]?.era),
  titian: (ev, c) => ev.kind === 'death' && ev.playerId === c.owner.id && ev.cardId !== c.me.cardId,
  magellan: (ev, c) => {
    if (!onTurn(ev, c)) return false
    // Every city of the board, visited while public, without being hidden, retrieved or killed.
    if (!c.me.isPublic || c.memo.instance !== c.me.instanceId) { c.memo.instance = c.me.instanceId; c.memo.visited = [] }
    if (!c.me.isPublic) return false
    const visited = new Set([...(c.memo.visited as string[]), c.loc.id])
    c.memo.visited = [...visited]
    return c.state.locations.every(l => visited.has(l.id))
  },
  saint_teresa: (ev, c) => onTurn(ev, c) && alliesWith(c, 'Monastic') >= 2,
  carl_linnaeus: (ev, c) => onTurn(ev, c)
    && new Set(allies(c).filter(x => x.type === 'follower').flatMap(x => identities(x, c.look))).size >= 4,
  robert_schumann: (ev, c) => onTurn(ev, c) && !acted(ev, c.me) && allies(c).length === 1
    && alliesWith(c, 'Musician') === 1 && !acted(ev, allies(c)[0]),
  hendrik_lorentz: (ev, c) => ev.kind === 'fight' && ev.locId === c.loc.id && !ev.kill && ev.result !== 'draw'
    && (ev.result === 'attacker' ? ev.defender : ev.attacker).type === 'gp',
  amelia_earhart: (ev, c) => ev.kind === 'survival' && ev.hazard && atMyCity(c, ev.locId)
    && !!ev.results.find(r => r.playerId === c.owner.id)?.survived && allies(c).length === 0,
  sergei_eisenstein: (ev, c) => ev.kind === 'event' && ev.playerId === c.owner.id && atMyCity(c, ev.locId) && tally(c, 'events', 2),
  edmund_hillary: (ev, c) => onTurn(ev, c) && anyHere(c, 'tenzing_norgay'),
  tenzing_norgay: (ev, c) => onTurn(ev, c) && anyHere(c, 'edmund_hillary'),
  ito_hirobumi: (ev, c) => onTurn(ev, c) && alliesWith(c, 'Statesman') >= 1 && alliesWith(c, 'Engineer', 'Scientist') >= 1,
  michael_jackson: (ev, c) => onTurn(ev, c) && alliesWith(c, 'Astronomer') >= 1 && alliesWith(c, 'Musician') >= 1,
  george_bernard_shaw: (ev, c) => onTurn(ev, c) && alliesWith(c, 'Actor') >= 1 && alliesWith(c, 'Writer') >= 1,
  gregory_peck: (ev, c) => onTurn(ev, c) && alliesWith(c, 'Lawyer') >= 1 && c.loc.activeEvent?.type === 'local_event',
  isabel_i: (ev, c) => onTurn(ev, c) && alliesWith(c, 'Explorer') >= 1,
  manuel_i: (ev, c) => onTurn(ev, c) && myCities(c).length >= 3,
  ashurbanipal: (ev, c) => onTurn(ev, c) && alliesWith(c, ...SCHOLARS) >= 1
    && [...new Set(c.loc.cards.map(x => x.playerId))].every(p => p === c.owner.id || count(c.loc.cards, p) < count(c.loc.cards, c.owner.id)),
  chanakya: (ev, c) => wonContest(ev, c, { stat: 'politics' }) && ev.kind !== 'competition' && alliesWith(c, 'Sovereign') >= 1,
  diego_maradona: (ev, c) => ev.kind === 'fight' && mySide(ev, c) === 'won'
    && ev.before.filter(x => x.playerId === rivalOf(ev, c) && x.type === 'follower').length >= 2,
  lei_zu: (ev, c) => onTurn(ev, c) && alliesWith(c, 'Merchant') >= 1 && alliesWith(c, 'Naturalist') >= 1,
  hesy_ra: (ev, c) => onTurn(ev, c) && allies(c).filter(x => !is(x, c.look, 'Doctor')).length >= 2,
  james_hutton: (ev, c) => onRound(ev) && streak(c, 'still', stayed(c), 3),
  jane_goodall: (ev, c) => ev.kind === 'ended' && ev.playerId === c.owner.id && atMyCity(c, ev.locId) && ev.event.type === 'local_survival',
  josiah_wedgwood: (ev, c) => onTurn(ev, c) && statAt(c.loc, 'technique', c.look, c.owner.id) >= 15,
  joel_robuchon: (ev, c) => onTurn(ev, c)
    && [...new Set(c.loc.cards.map(x => x.playerId))].some(p => c.loc.cards.filter(x => x.playerId === p && x.type === 'follower').length >= 3),
  king_telepinu: (ev, c) => wonContest(ev, c, { stat: 'politics' }) && ev.kind !== 'competition' && alliesWith(c, 'Statesman') >= 1,
  mahavira: (ev, c) => wonContest(ev, c, { conflict: false }) && alliesWith(c, 'Monastic', 'Prophet') >= 2,
  nakht: (ev, c) => onTurn(ev, c) && others(c).filter(x => is(x, c.look, ...SCHOLARS)).length >= 2,
  pediamenopet: (ev, c) => wonContest(ev, c, { stat: 'politics' }) && ev.kind !== 'competition' && alliesWith(c, 'Monastic', 'Priest') >= 2,
  peseshet: (ev, c) => onTurn(ev, c) && allies(c).filter(x => female(x, c.look) || is(x, c.look, 'Doctor')).length >= 2,
  peter_arnett: (ev, c) => ev.kind === 'fight' && ev.locId === c.loc.id && tally(c, 'fights', 3),
  steve_jobs: (ev, c) => {
    if (!onTurn(ev, c)) return false
    const rivals = [...new Set(c.loc.cards.filter(x => x.type === 'gp' && x.playerId !== c.owner.id).map(x => x.playerId))]
    const mine = statAt(c.loc, 'technique', c.look, c.owner.id, true)
    return rivals.length > 0 && rivals.every(p => statAt(c.loc, 'technique', c.look, p, true) < mine)
  },
  valmiki: (ev, c) => onTurn(ev, c) && alliesWith(c, 'Writer', 'Philosopher') >= 2,
  yekaterina: (ev, c) => onTurn(ev, c) && !others(c).some(x => x.type === 'gp')
    && myCities(c).filter(l => l.id !== c.loc.id).length >= 2,
  anna_nzinga: (ev, c) => {
    if (ev.kind === 'fight' && mySide(ev, c) === 'lost') { c.memo.lost = true; return false }
    if (!onRound(ev)) return false
    const held = stayed(c) && !c.memo.lost
    c.memo.lost = false
    return streak(c, 'held', held, 3)
  },
  batu_khan: (ev, c) => ev.kind === 'fight' && ev.attacker.instanceId === c.me.instanceId && mySide(ev, c) === 'won' && collect(c, 'cities', ev.locId, 3),
  bayinnaung: (ev, c) => onRound(ev) && streak(c, 'court', allies(c).length >= 2, 3),
  bi_sheng: (ev, c) => ev.kind === 'claim' && ev.playerId === c.owner.id && ev.cardId !== c.me.cardId
    && (c.look.gp[ev.cardId]?.identities ?? []).some(i => i === 'Writer' || i === 'Educator'),
  borromini: (ev, c) => onTurn(ev, c) && others(c).some(x => is(x, c.look, 'Architect')),
  bernini: (ev, c) => {
    if (!onRound(ev)) return false
    const here = statAt(c.loc, 'culture', c.look)
    const top = c.state.locations.every(l => l.id === c.loc.id || statAt(l, 'culture', c.look) < here)
    return streak(c, 'top', top, 2)
  },
  ibn_battuta: (ev, c) => onTurn(ev, c) && collect(c, 'cities', c.loc.name, 5),
  gutenberg: (ev, c) => onTurn(ev, c) && alliesWith(c, 'Writer', 'Educator') >= 2,
  lee_sun_sin: (ev, c) => ev.kind === 'fight' && mySide(ev, c) === 'won' && count(ev.before, c.owner.id) < count(ev.before, rivalOf(ev, c)),
  montezuma_ii: (ev, c) => onRound(ev) && streak(c, 'followers', others(c).filter(x => x.type === 'follower').length >= 3, 2),
  nian_xiyao: (ev, c) => onTurn(ev, c) && alliesWith(c, 'Artist', 'Merchant') >= 2,
  pakal: (ev, c) => ev.kind === 'follower' && ev.playerId === c.owner.id && atMyCity(c, ev.locId) && tally(c, 'followers', 3),
  ruminahui: (ev, c) => ev.kind === 'fight' && mySide(ev, c) === 'won' && allies(c).every(x => x.type !== 'follower')
    && [ev.attacker, ev.defender].some(x => x.playerId !== c.owner.id && x.type === 'gp' && is(x, c.look, 'Sovereign')),
  taira_no_tadanori: (ev, c) => ev.kind === 'fight' && mySide(ev, c) !== null && mySide(ev, c) !== 'lost'
    && allies(c).every(x => x.type !== 'follower'),
  tlacaelel: (ev, c) => {
    if (ev.kind !== 'fight') return false
    const side = mySide(ev, c)
    if (side === null) return false
    if (side === 'won' && ev.attacker.instanceId !== c.me.instanceId) return tally(c, 'row', 2)
    c.memo.row = 0
    return false
  },
}

const STAT_KEYS: StatKey[] = ['politics', 'strength', 'culture', 'wealth', 'intelligence', 'technique', 'belief', 'reputation']

/**
 * Run a batch of events past every Great Person on the board still to earn
 * their legacy.  Returns the new state: memories updated, achievers marked
 * ready (achievementTicks set to `unlock`), and a log line for each.
 */
export function runAchievements(
  state: GameState,
  events: AchievementEvent[],
  look: Lookups,
  unlock: (cardId: string) => number,
): GameState {
  if (!events.length) return state
  const memos: Record<string, Record<string, Record<string, unknown>>> = {}
  const ready = new Set<string>()
  const lines: string[] = []
  for (const ev of events) {
    for (const loc of state.locations) {
      for (const me of loc.cards) {
        if (me.type !== 'gp') continue
        const owner = state.players.find(p => p.id === me.playerId)
        if (!owner || owner.legacies.includes(me.cardId)) continue
        if (me.achievementTicks >= unlock(me.cardId) || ready.has(me.instanceId)) continue
        const rule = ACHIEVEMENTS[me.cardId]
        if (!rule) continue
        const byPlayer = memos[owner.id] ??= { ...(owner.achievementMemo ?? {}) }
        const memo = byPlayer[me.cardId] = { ...(byPlayer[me.cardId] ?? {}) }
        if (rule(ev, { state, owner, me, loc, look, memo })) {
          ready.add(me.instanceId)
          lines.push(`${owner.name}'s ${look.gp[me.cardId]?.figureName ?? 'Great Person'} achieved ${look.gp[me.cardId]?.legacy.name ?? 'their legacy'}: claim it while public.`)
        }
      }
    }
  }
  const players = state.players.map(p => (memos[p.id] ? { ...p, achievementMemo: memos[p.id] } : p))
  const locations = ready.size
    ? state.locations.map(l => ({ ...l, cards: l.cards.map(x => (ready.has(x.instanceId) ? { ...x, achievementTicks: unlock(x.cardId) } : x)) }))
    : state.locations
  return { ...state, players, locations, log: lines.length ? [...lines.reverse(), ...state.log].slice(0, 20) : state.log }
}
