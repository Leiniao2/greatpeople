// The battle ("fight") engine: card data, decks, scoring, game setup and the
// reducer.  Pure TypeScript with no React, so the Battle tab, the fight
// lessons at the end of every Epic story and the tests all drive the same
// rules.  The board UI lives in ./BattleGame.tsx.
//
// Battle-tab games run on a real timeline (setup.timeline): one round is one
// year, Great People are born, start their careers, retire and die in their
// historical years, and every death is followed by a successor born later.
// Achievements unlock legacies that the player keeps for the rest of the game
// and switches into a limited number of legacy slots.  The scripted Epic
// lessons (initScriptedGame) keep the timeless rules.

import type {
  Card, FollowerCard, EventCard, OnboardCard, LocationState,
  PlayerState, GameState, GameSetup,
  StatKey, EventType, EraMode,
  CardContrib, CombatSide, CombatSummary, EventPlayerResult, GameSummary,
  LegacyContext, LegacyEffect, LifeStatus, TurnActions, PendingSuccessor, PendingReward,
} from '@/types'
import cardsJson from '@/data/cards.json'
import locationsJson from '@/data/locations.json'
import locationCardsJson from '@/data/location_cards.json'
import followersJson from '@/data/followers.json'
import { portraitUrl } from '@/data/images'
import { runAchievements, type AchievementEvent } from './achievements'

// ─── Static Card Data ─────────────────────────────────────────────────────────

export const ALL_GP_CARDS: Card[] = (cardsJson as unknown as Omit<Card, 'portraitUrl'>[]).map(c => ({
  ...c,
  portraitUrl: portraitUrl(c.portraitKey ?? c.id),
}))

export const FOLLOWER_TEMPLATES: Omit<FollowerCard, 'id'>[] = followersJson as Omit<FollowerCard, 'id'>[]

// IDs are "follower-<Name>-<n>" — look up template by name for deployed followers
export const FOLLOWER_TMPL_BY_NAME: Record<string, Omit<FollowerCard, 'id'>> = {}
for (const t of FOLLOWER_TEMPLATES) FOLLOWER_TMPL_BY_NAME[t.name] = t
export function followerFromId(id: string): FollowerCard | null {
  // strip "follower-" prefix and trailing "-<number>"
  const inner = id.replace(/^follower-/, '').replace(/-\d+$/, '')
  const tmpl = FOLLOWER_TMPL_BY_NAME[inner]
  return tmpl ? { ...tmpl, id } : null
}

export function makeFollowerDeck(): FollowerCard[] {
  const deck: FollowerCard[] = []
  let counter = 0
  for (let copy = 0; copy < 3; copy++) {
    for (const t of FOLLOWER_TEMPLATES) {
      deck.push({ ...t, id: `follower-${t.name}-${counter++}` })
    }
  }
  return shuffle(deck)
}

export const STATS: StatKey[] = ['politics', 'strength', 'culture', 'wealth', 'intelligence', 'technique', 'belief', 'reputation']
export const STAT_LABELS: Record<StatKey, string> = {
  politics: 'Politics', strength: 'Strength', culture: 'Culture', wealth: 'Wealth',
  intelligence: 'Intelligence', technique: 'Technique', belief: 'Belief', reputation: 'Reputation',
}

export const EVENT_NAMES: Record<StatKey, [string, string, string]> = {
  politics:     ['Coup',         'Terrorist Attack',      'International Conference'],
  strength:     ['Battlefield',  'Riot',                  'Olympics'],
  culture:      ['Art Critique', 'Censorship',            'Roadshow'],
  wealth:       ['Business War', 'Depression',            'Auction'],
  technique:    ['Tech Race',    'Sanctions',             'World Fair'],
  intelligence: ['Argument',     'Puzzle',                'Expedition'],
  belief:       ['Miracle',      'Inquisition',           'Pilgrimage'],
  reputation:   ['Lawsuit',      'Scandal',               'Celebration'],
}

export const EVENT_TYPES: EventType[] = ['local_event', 'local_survival', 'global_competition']

export const HAZARD_TYPES = ['Flood', 'Blizzard', 'Storm', 'Earthquake', 'Fire', 'Tsunami', 'Pandemic', 'Drought']

export function makeEventDeck(): EventCard[] {
  const deck: EventCard[] = []
  let counter = 0

  for (const stat of STATS) {
    const names = EVENT_NAMES[stat]
    for (let i = 0; i < 3; i++) {
      const type = EVENT_TYPES[i]
      deck.push({
        id: `event-${stat}-${i}-${counter++}`,
        name: names[i],
        type,
        stat,
        description: type === 'local_event'
          ? `Local event: compare ${STAT_LABELS[stat]} totals. Winner may attack loser.`
          : type === 'local_survival'
          ? `Local survival: cards with ${STAT_LABELS[stat]} < 5 are discarded.`
          : `Global competition: player with highest total ${STAT_LABELS[stat]} (public cards) wins a prize bundle.`,
      })
    }
  }

  return shuffle(deck)
}

export function makeHazardDeck(): EventCard[] {
  return HAZARD_TYPES.map((hz, i) => ({
    id: `event-hazard-${hz.toLowerCase()}-${i}`,
    name: `Natural Hazard: ${hz}`,
    type: 'natural_hazard' as const,
    hazardType: hz,
    description: `Natural hazard (${hz}): if a player's combined minimum stat at this location is below 5, all their cards here are discarded.`,
  }))
}

// ─── City states ──────────────────────────────────────────────────────────────
//
// Each new year, every location with no state of its own falls into a random
// one (a local event, a local survival or a natural hazard) with this chance.
// These city states last a few years; states started by players last until
// someone ends them.

export const CITY_STATE_CHANCE = 0.3
export const CITY_STATE_YEARS: Record<Exclude<EventType, 'global_competition'>, number> = {
  local_event: 3,
  local_survival: 2,
  natural_hazard: 1,
}
/** Chance each new year that a global competition breaks out on its own. */
export const GLOBAL_COMPETITION_CHANCE = 0.05
/** A contest prize: this many Followers, or this many Event cards, times the reward's size. */
export const REWARD_FOLLOWERS = 2
export const REWARD_EVENTS = 1

/** Record what happened for the achievements; gameReducer checks them after the action. */
export function emit(state: GameState, ...events: AchievementEvent[]): GameState {
  return events.length ? { ...state, achievementEvents: [...(state.achievementEvents ?? []), ...events] } : state
}

/** Queue a prize for a contest's winner; the player picks Followers or Events. */
export function grantReward(state: GameState, playerId: string, size: 1 | 2, reason: string): GameState {
  return { ...state, pendingRewards: [...(state.pendingRewards ?? []), { playerId, size, reason }] }
}

/** Take the oldest prize owed to a player: REWARD_FOLLOWERS or REWARD_EVENTS (times its size) from the decks. */
export function takeReward(state: GameState, playerId: string, pick: 'followers' | 'events'): GameState {
  const rewards = state.pendingRewards ?? []
  const i = rewards.findIndex(r => r.playerId === playerId)
  if (i < 0) return state
  const r = rewards[i]
  const n = (pick === 'followers' ? REWARD_FOLLOWERS : REWARD_EVENTS) * r.size
  const deck = pick === 'followers' ? state.followerDeck : state.eventDeck
  const got = deck.slice(0, n)
  const player = state.players.find(p => p.id === playerId)
  return {
    ...state,
    pendingRewards: rewards.filter((_, j) => j !== i),
    followerDeck: pick === 'followers' ? state.followerDeck.slice(got.length) : state.followerDeck,
    eventDeck: pick === 'events' ? state.eventDeck.slice(got.length) : state.eventDeck,
    players: state.players.map(p => p.id !== playerId ? p
      : pick === 'followers'
        ? { ...p, followerHand: [...p.followerHand, ...(got as FollowerCard[])] }
        : { ...p, eventHand: [...p.eventHand, ...(got as EventCard[])] }),
    log: [`${player?.name ?? 'A player'} took ${got.length} ${pick === 'followers' ? 'Follower' : 'Event card'}${got.length === 1 ? '' : 's'} (${r.reason}).`, ...state.log].slice(0, 20),
  }
}

/** What the computer takes: an Event card while it holds fewer than two, otherwise Followers. */
function cpuRewardPick(p: PlayerState): 'followers' | 'events' {
  return p.eventHand.length < 2 ? 'events' : 'followers'
}

/** Rounds a player-started local event or survival lasts (until someone ends it). */
export const PLAYER_EVENT_ROUNDS = 99

export function randomCityState(rand: () => number = Math.random): EventCard {
  const pick = Math.floor(rand() * (STATS.length * 2 + HAZARD_TYPES.length))
  if (pick < STATS.length * 2) {
    const stat = STATS[pick % STATS.length]
    const kind = pick < STATS.length ? 'local_event' : 'local_survival'
    return { ...makeEventCard(stat, kind, `city-${stat}-${kind}-${uid()}`), origin: 'city' }
  }
  const hazard = makeHazardDeck()[pick - STATS.length * 2]
  return { ...hazard, id: `city-${hazard.id}-${uid()}`, origin: 'city' }
}

/** Give each location without a state a CITY_STATE_CHANCE of entering a random one. */
export function rollCityStates(locations: LocationState[], rand: () => number = Math.random): { locations: LocationState[]; lines: string[] } {
  const lines: string[] = []
  const next = locations.map(loc => {
    if (loc.activeEvent || rand() >= CITY_STATE_CHANCE) return loc
    const ev = randomCityState(rand)
    lines.push(`${loc.name} falls into ${ev.name.replace(/^Natural Hazard: /, '')}.`)
    return { ...loc, activeEvent: ev, eventRoundsLeft: CITY_STATE_YEARS[ev.type as keyof typeof CITY_STATE_YEARS] }
  })
  return { locations: next, lines }
}

// ─── Location Data ────────────────────────────────────────────────────────────

export interface LocationCardData {
  id: string; name: string; era: string
  bonuses: Partial<Record<StatKey, number>>
  trait?: string
}

export const LOCATION_CARD_MAP: Record<string, LocationCardData> = {}
for (const lc of locationCardsJson as LocationCardData[]) {
  LOCATION_CARD_MAP[`${lc.era}-${lc.name}`] = lc
}

export function locationFightBonus(locationName: string, locationEra: string, stat: StatKey): number {
  const card = LOCATION_CARD_MAP[`${locationEra}-${locationName}`]
  return (card?.bonuses as Record<string, number> | undefined)?.[stat] ?? 0
}

export function locationAbilityText(locationName: string, locationEra: string, stat: StatKey): string | undefined {
  const card = LOCATION_CARD_MAP[`${locationEra}-${locationName}`]
  const amount = (card?.bonuses as Record<string, number> | undefined)?.[stat] ?? 0
  if (!amount || !card?.trait) return undefined
  const match = card.trait.match(/\*\*(.*?)\*\*/)
  const abilityName = match?.[1] ?? locationName
  return `${abilityName}: +${amount} ${stat} per GP`
}

export interface LocationTemplate { name: string; era: string; imageKey?: string; countries?: string[] }

export const LOCATION_POOL: LocationTemplate[] = locationsJson.locations
export const ERAS: string[] = locationsJson.eras

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9)
}

/** Cities on the board when a game opens; city legacies add more. */
export const BASE_LOCATIONS = 4
/** A follower whose identity matches an allied GP at its location adds this instead of its own bonus. */
export const FOLLOWER_IDENTITY_MATCH_BONUS = 4

/** `count` different cities of one era, at random. */
export function pickLocations(era: string, count: number = BASE_LOCATIONS, exclude: string[] = []): LocationTemplate[] {
  return shuffle(LOCATION_POOL.filter(l => l.era === era && !exclude.includes(l.name))).slice(0, count)
}

/**
 * The age a year belongs to: an era opens with the birth of its earliest
 * Great Person (the year a game set in that era opens on) and lasts until
 * the next one opens.
 */
export function eraForYear(year: number): string {
  let era = ERAS[0]
  for (const e of ERAS) if (eraStartYear(e) <= year) era = e
  return era
}

/** The age the board's cities belong to now. */
export function boardEra(state: GameState): string {
  return state.setup.eraMode === 'single' && state.setup.singleEra ? state.setup.singleEra : eraForYear(state.year)
}

/** Cities the board holds now: BASE_LOCATIONS plus every city legacy in effect, whoever holds it. */
export function locationTarget(state: GameState): number {
  let n = BASE_LOCATIONS
  for (const p of state.players) for (const e of legacyEffects(p)) if (e.kind === 'locations') n += e.count
  return n
}

function cityFrom(t: LocationTemplate, id: string): LocationState {
  return { id, name: t.name, era: t.era, imageKey: t.imageKey, countries: t.countries, cards: [], activeEvent: null, eventRoundsLeft: 0 }
}

/**
 * Keep the board in step with history: when the age changes every city
 * becomes one of the new age (cards and running states stay where they
 * are), and the number of cities follows the city legacies in effect.  A
 * city only leaves the board once nothing stands on it.
 */
export function alignLocations(state: GameState): GameState {
  if (!state.setup.timeline) return state
  const era = boardEra(state)
  let locations = state.locations
  const lines: string[] = []
  if (locations.some(l => l.era !== era)) {
    const keep = locations.filter(l => l.era === era).map(l => l.name)
    const fresh = pickLocations(era, locations.length, keep)
    let k = 0
    const renamed: string[] = []
    locations = locations.map(l => {
      if (l.era === era) return l
      const t = fresh[k++]
      if (!t) return l
      renamed.push(`${l.name} → ${t.name}`)
      return { ...l, name: t.name, era: t.era, imageKey: t.imageKey, countries: t.countries }
    })
    if (renamed.length) lines.push(`The ${era} age begins: ${renamed.join(', ')}.`)
  }
  const target = locationTarget(state)
  if (locations.length < target) {
    const add = pickLocations(era, target - locations.length, locations.map(l => l.name))
    const next = Math.max(-1, ...locations.map(l => Number(l.id.replace(/\D/g, '')) || 0)) + 1
    locations = [...locations, ...add.map((t, i) => cityFrom(t, `loc-${next + i}`))]
    if (add.length) lines.push(`${add.map(t => t.name).join(', ')} ${add.length === 1 ? 'joins' : 'join'} the board.`)
  }
  while (locations.length > target) {
    // Drop the newest city with nothing on it; otherwise wait until one empties.
    const i = locations.map(l => !l.cards.length && !l.activeEvent).lastIndexOf(true)
    if (i < 0) break
    lines.push(`${locations[i].name} leaves the board.`)
    locations = locations.filter((_, j) => j !== i)
  }
  if (locations === state.locations) return state
  return { ...state, locations, log: [...lines.reverse(), ...state.log].slice(0, 20) }
}

export function getGPCard(id: string): Card | undefined {
  return ALL_GP_CARDS.find(c => c.id === id)
}

// ─── Legacy unlocks: which stat + how many wins to earn a legacy ───────────────
//
// Every card's legacy.unlock (data/cards.json) says which stat its fights must
// be won in and how many wins it takes; ACHIEVEMENT_SPECS is that table keyed
// by figure name for the board UI and the lessons.

export interface AchievementSpec { stat: StatKey; threshold: number }

export const ACHIEVEMENT_SPECS: Record<string, AchievementSpec> = Object.fromEntries(
  ALL_GP_CARDS.map(c => [c.figureName, { stat: c.legacy.unlock.stat, threshold: c.legacy.unlock.wins }]),
)

export function getAchievementThreshold(figureName: string): number {
  return ACHIEVEMENT_SPECS[figureName]?.threshold ?? 1
}

// ─── Timeline: years, careers, deaths, successors ────────────────────────────

/** A round is one year in every era. */
export const YEARS_PER_ROUND = 1
export const DEFAULT_CAREER_AGE = 18
/** Prodigy legacies cannot start a career before this age. */
export const MIN_CAREER_AGE = 4
/** Great People a player holds at once when the game opens; slot legacies add more. */
export const BASE_GP_SLOTS = 1
/** Each player opens with one Event card and one Follower; contest prizes bring more. */
export const STARTING_EVENTS = 1
export const STARTING_FOLLOWERS = 1
/** Candidates offered for the opening pick, whatever era history opens in. */
export const OPENING_CHOICES = 3
/** Candidates offered when a Great Person dies (before successor legacies). */
export const SUCCESSOR_CHOICES = 3
export const LEGACY_SLOTS = 2
/** The timeline ends here; living people never die naturally before it. */
export const TIMELINE_END_YEAR = 2030

export function formatYear(year: number): string {
  if (year < 0) return `${-year} BC`
  return year < 1000 ? `${year} AD` : `${year}`
}

export function legacyEffects(player: PlayerState | undefined): LegacyEffect[] {
  if (!player) return []
  return player.activeLegacies.map(id => getGPCard(id)?.legacy.effect).filter((e): e is LegacyEffect => !!e)
}

function sumEffect(player: PlayerState | undefined, kind: 'longevity' | 'prodigy' | 'successors' | 'slots'): number {
  let n = 0
  for (const e of legacyEffects(player)) {
    if (e.kind === 'longevity' && kind === 'longevity') n += e.years
    if (e.kind === 'prodigy' && kind === 'prodigy') n += e.years
    if (e.kind === 'successors' && kind === 'successors') n += e.count
    if (e.kind === 'slots' && kind === 'slots') n += e.count
  }
  return n
}

/** First year a card can be played, for this owner (prodigy legacies start careers earlier). */
export function careerStartYear(card: Card, owner?: PlayerState): number {
  const age = Math.max(MIN_CAREER_AGE, (card.careerAge ?? DEFAULT_CAREER_AGE) - sumEffect(owner, 'prodigy'))
  return card.born + age
}

/** How many Great People (lineages) this player may hold at once. */
export function gpSlots(player: PlayerState | undefined): number {
  return BASE_GP_SLOTS + (player?.extraSlots ?? 0) + sumEffect(player, 'slots')
}

/** Lineages a player holds now: Great People in hand, retired or on the board, and choices still owed. */
export function lineageCount(state: GameState, p: PlayerState): number {
  const onBoard = state.locations.reduce((n, loc) => n + loc.cards.filter(c => c.type === 'gp' && c.playerId === p.id).length, 0)
  return p.gpHand.length + p.retired.length + onBoard + p.pendingSuccessors.length
}

/** Last year a card is alive, for this owner (longevity legacies extend it). */
export function deathYear(card: Card, owner?: PlayerState): number {
  return (card.died ?? TIMELINE_END_YEAR) + sumEffect(owner, 'longevity')
}

export function lifeStatus(state: GameState, playerId: string, cardId: string): LifeStatus {
  if (!state.setup.timeline) return 'active'
  const p = state.players.find(x => x.id === playerId)
  if (p?.archive.includes(cardId)) return 'dead'
  if (p?.retired.includes(cardId)) return 'retired'
  const card = getGPCard(cardId)
  if (!card) return 'dead'
  if (state.year < card.born) return 'unborn'
  if (state.year < careerStartYear(card, p)) return 'youth'
  return 'active'
}

/** Every Great Person some player holds, held, retired or lost: none of them can be a successor. */
export function claimedGP(state: GameState): Set<string> {
  const ids = new Set<string>()
  for (const p of state.players) for (const id of [...p.gpHand, ...p.archive, ...p.retired]) ids.add(id)
  for (const loc of state.locations) for (const c of loc.cards) if (c.type === 'gp') ids.add(c.cardId)
  return ids
}

/** The successors a player may choose now: unclaimed Great People born after the current year, nearest first. */
export function successorOptions(state: GameState, playerId: string): string[] {
  const p = state.players.find(x => x.id === playerId)
  const taken = claimedGP(state)
  const fixed = p?.pendingSuccessors[0]?.options
  if (fixed) return fixed.filter(id => !taken.has(id))
  const n = SUCCESSOR_CHOICES + sumEffect(p, 'successors')
  return gpPool(state.setup.eraMode, state.setup.singleEra)
    .filter(c => !taken.has(c.id) && c.born > state.year)
    .sort((a, b) => a.born - b.born || a.figureName.localeCompare(b.figureName))
    .slice(0, n)
    .map(c => c.id)
}

/** Whether this player still has a Great Person now or to come. */
export function hasFuture(state: GameState, p: PlayerState): boolean {
  if (p.gpHand.length > 0 || p.retired.length > 0 || p.pendingSuccessors.length > 0) return true
  return state.locations.some(loc => loc.cards.some(c => c.type === 'gp' && c.playerId === p.id))
}

/** Whether this player has a Great Person in their career, on the board or in hand. */
export function hasActiveGP(state: GameState, p: PlayerState): boolean {
  if (state.locations.some(loc => loc.cards.some(c => c.type === 'gp' && c.playerId === p.id))) return true
  return p.gpHand.some(id => lifeStatus(state, p.id, id) === 'active')
}

// ─── Legacy effects in contests ──────────────────────────────────────────────

/**
 * Bonus a player's active legacies add to one side of a contest. `stat` is the
 * contest's stat (null for natural hazards, which test every stat); followers
 * count only when the contest happens at a location (`locationCards`).
 */
export function legacyContest(
  state: GameState,
  playerId: string,
  stat: StatKey | null,
  context: Exclude<LegacyContext, 'any'>,
  locationCards?: OnboardCard[],
  followerMap?: Record<string, FollowerCard>,
): { total: number; rows: CardContrib[] } {
  const p = state.players.find(x => x.id === playerId)
  const rows: CardContrib[] = []
  let total = 0
  for (const id of p?.activeLegacies ?? []) {
    const legacy = getGPCard(id)?.legacy
    if (!legacy) continue
    const e = legacy.effect
    let bonus = 0
    if (e.kind === 'contest' && (e.stat === 'any' || e.stat === stat) && (e.context === 'any' || e.context === context)) {
      bonus = e.amount
    } else if (e.kind === 'follower' && locationCards && followerMap) {
      const n = locationCards.filter(c => {
        if (c.playerId !== playerId || c.type !== 'follower') return false
        const f = followerMap[c.cardId]
        return !!f && (stat === null || f.stat === stat) && (e.stat === 'any' || e.stat === f.stat)
      }).length
      bonus = n * e.amount
    }
    if (bonus) {
      total += bonus
      rows.push({ type: 'legacy', name: `${legacy.name} (legacy)`, baseStat: 0, traitBonus: bonus, followerBonus: 0, locationBonus: 0 })
    }
  }
  return { total, rows }
}

export function hasHazardShield(state: GameState, playerId: string): string | null {
  const p = state.players.find(x => x.id === playerId)
  for (const id of p?.activeLegacies ?? []) {
    const legacy = getGPCard(id)?.legacy
    if (legacy?.effect.kind === 'hazard_shield') return legacy.name
  }
  return null
}

const CONTEXT_WORDS: Record<LegacyContext, string> = {
  attack: 'when you attack', defend: 'when you defend', survival: 'in survival checks (survivals and hazards)',
  competition: 'in global competitions', any: 'in every contest',
}

/** Plain-language rule text for a legacy effect (cards, rules panel, docs). */
export function describeLegacyEffect(e: LegacyEffect): string {
  switch (e.kind) {
    case 'contest': return `+${e.amount} ${e.stat === 'any' ? 'to your total' : STAT_LABELS[e.stat]} ${CONTEXT_WORDS[e.context]}.`
    case 'follower': return `Each of your ${e.stat === 'any' ? '' : STAT_LABELS[e.stat] + ' '}Followers that counts in a contest adds +${e.amount} more.`
    case 'hazard_shield': return 'Your cards ignore natural hazards.'
    case 'longevity': return `Your Great People live ${e.years} years longer.`
    case 'prodigy': return `Your Great People start their careers ${e.years} years earlier.`
    case 'successors': return `+${e.count} choice whenever you pick a successor.`
    case 'slots': return `+${e.count} Great Person slot: hold ${e.count === 1 ? 'one more Great Person' : `${e.count} more Great People`} at once.`
    case 'locations': return `+${e.count} ${e.count === 1 ? 'city' : 'cities'} on the board for every player while this legacy is in effect.`
    case 'income': return `Every ${e.every} years you gain ${e.card === 'event' ? 'an Event card' : 'a Follower'}.`
  }
}

// ─── Trait bonuses: per-GP stat modifier based on board state ─────────────────

export function traitBonusForGP(
  gp: Card,
  stat: StatKey,
  locationCards: OnboardCard[],
  playerId: string,
  allLocations: LocationState[],
  gpMap: Record<string, Card>,
  followerMap: Record<string, FollowerCard>,
): number {
  let bonus = 0
  const alliedCards = locationCards.filter(c => c.playerId === playerId)
  const opponentCards = locationCards.filter(c => c.playerId !== playerId)
  const alliedFollowers = alliedCards
    .filter(c => c.type === 'follower')
    .map(c => followerMap[c.cardId])
    .filter((f): f is FollowerCard => !!f)
  const alliedGPCards = alliedCards
    .filter(c => c.type === 'gp')
    .map(c => gpMap[c.cardId])
    .filter((g): g is Card => !!g)

  // Allied cards here (Great People or Followers) with any of these identities, this card excluded.
  const alliedWith = (...names: string[]) =>
    alliedFollowers.filter(f => names.includes(f.name)).length
    + alliedGPCards.filter(g => g.id !== gp.id && g.identities.some(i => names.includes(i))).length
  const rivalGPs = opponentCards
    .filter(c => c.type === 'gp')
    .map(c => gpMap[c.cardId])
    .filter((g): g is Card => !!g)
  const outnumbered = opponentCards.length > alliedCards.length
  const myCityCount = allLocations.filter(loc => loc.cards.some(c => c.playerId === playerId)).length

  switch (gp.figureName) {
    case 'Belisarius':
      if (opponentCards.length > alliedCards.length && (stat === 'strength' || stat === 'politics'))
        bonus += 3
      break

    case 'Imhotep':
      if (alliedFollowers.length >= 2 && (stat === 'technique' || stat === 'intelligence'))
        bonus += 4
      break

    case 'Lu Yu':
      if (alliedGPCards.length === 1)
        bonus += 3
      break

    case 'Andrew Mellon':
      if (stat === 'wealth')
        bonus += alliedFollowers.filter(f => f.name === 'Merchant').length * 2
      break

    case 'Pericles':
      bonus += alliedFollowers.length
      break

    case 'Aspasia': {
      const pericelesOnField = allLocations.some(loc =>
        loc.cards.some(c => c.type === 'gp' && gpMap[c.cardId]?.figureName === 'Pericles')
      )
      if (pericelesOnField && (stat === 'politics' || stat === 'intelligence'))
        bonus += 4
      break
    }

    case 'Enkidu': {
      const femaleGPAtLoc = locationCards
        .filter(c => c.type === 'gp')
        .some(c => gpMap[c.cardId]?.gender === 'female')
      if (femaleGPAtLoc) {
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
      const erasOnField = new Set(
        allLocations.flatMap(loc =>
          loc.cards
            .filter(c => c.type === 'gp')
            .map(c => gpMap[c.cardId]?.era)
            .filter(Boolean)
        )
      ).size
      if (stat === 'belief' || stat === 'intelligence')
        bonus += erasOnField
      break
    }

    case 'Johannes Brahms': {
      let alliedStatSum = 0
      for (const oc of alliedCards) {
        if (oc.type === 'gp') {
          const g = gpMap[oc.cardId]
          if (g) alliedStatSum += g[stat]
        }
      }
      bonus += alliedStatSum >= 13 ? 2 : -2
      break
    }

    case 'Sergei Eisenstein':
      if (stat === 'culture') bonus += Math.max(0, gp.intelligence - gp.culture)
      break

    case 'Gregory Peck': {
      const hasOpponentEvent = allLocations
        .find(loc => loc.cards.some(c => c.instanceId === locationCards[0]?.instanceId))
        ?.activeEvent != null
      if (hasOpponentEvent && stat === 'reputation') bonus += 3
      break
    }

    case 'Djoser':
      if (stat === 'reputation' && alliedWith('Architect') >= 1) bonus += 3
      break

    case 'Sneferu':
      if (stat === 'technique') bonus += Math.min(4, alliedFollowers.length)
      break

    case 'Puabi':
      if (stat === 'wealth' && alliedGPCards.some(g => g.id !== gp.id)) bonus += 3
      break

    case 'Meskalamdug':
      if (stat === 'strength' && alliedWith('Sovereign') >= 1) bonus += 3
      break

    case 'Ku-Baba':
      if (stat === 'politics') bonus += Math.min(4, alliedFollowers.length)
      break

    case 'Eannatum':
      if (stat === 'strength' && alliedWith('Soldier', 'Warrior', 'General') >= 2) bonus += 3
      break

    case 'Ur-Nanshe':
      if ((stat === 'technique' || stat === 'belief') && alliedGPCards.every(g => g.id === gp.id)) bonus += 2
      break

    case 'Emperor Yao':
      if (stat === 'reputation' && alliedWith('Astronomer', 'Educator') >= 1) bonus += 3
      break

    case 'Harkhuf':
      if (stat === 'wealth' && alliedWith('Merchant', 'Explorer') >= 1) bonus += 3
      break

    case 'Enheduanna':
      if ((stat === 'culture' || stat === 'belief') && alliedWith('Writer', 'Priest') >= 1) bonus += 2
      break

    case 'Mursili I':
      if (stat === 'strength' && rivalGPs.length > 0) bonus += 2
      break

    case 'Yi Yin':
      if (stat === 'politics' && alliedWith('Sovereign') >= 1) bonus += 3
      break

    case 'Nedjeh':
      if (stat === 'strength' && rivalGPs.some(g => g.countries?.includes('Egypt'))) bonus += 3
      break

    case 'Queen Tiye':
      if (stat === 'politics' && alliedWith('Sovereign') >= 1) bonus += 3
      break

    case 'Tushratta':
      if ((stat === 'politics' || stat === 'reputation') && rivalGPs.some(g => g.identities.includes('Sovereign'))) bonus += 2
      break

    case 'Suppiluliuma I':
      if (stat === 'strength') bonus += Math.min(4, 2 * rivalGPs.length)
      break

    case 'Gyges':
      if (alliedCards.length === 1) { if (stat === 'wealth') bonus += 3; if (stat === 'intelligence') bonus += 2 }
      break

    case 'Guan Zhong':
      if (stat === 'wealth' && alliedWith('Merchant', 'Banker') >= 1) bonus += 3
      break

    case 'Cyrus the Great':
      if (stat === 'reputation') bonus += new Set(locationCards.filter(c => c.type === 'gp').flatMap(c => gpMap[c.cardId]?.countries ?? [])).size
      break

    case 'Confucius':
      if (stat === 'intelligence' || stat === 'belief') bonus += Math.min(3, alliedWith('Educator', 'Philosopher', 'Writer'))
      break

    case 'Tomyris':
      if (stat === 'strength' && rivalGPs.some(g => g.identities.includes('Sovereign'))) bonus += 3
      break

    case 'Chandragupta Maurya':
      if (stat === 'politics' && (alliedWith('Philosopher') >= 1 || locationCards.some(c => c.cardId === 'chanakya'))) bonus += 3
      break

    case 'Epicurus':
      if (stat === 'belief' && opponentCards.length === 0) bonus += 3
      break

    case 'Julius Caesar':
      if ((stat === 'strength' || stat === 'reputation') && alliedWith('Soldier', 'General') >= 2) bonus += 2
      break

    case 'Cleopatra VII':
      if (stat === 'politics' && rivalGPs.some(g => g.identities.includes('General'))) bonus += 3
      break

    case 'Vercingetorix':
      if (stat === 'strength' && rivalGPs.some(g => g.countries?.includes('Rome'))) bonus += 3
      break

    case 'Shapur I':
      if ((stat === 'strength' || stat === 'reputation') && rivalGPs.some(g => g.identities.includes('Sovereign'))) bonus += 2
      break

    case 'Zenobia':
      if ((stat === 'politics' || stat === 'strength') && alliedGPCards.every(g => g.id === gp.id)) bonus += 2
      break

    case 'Plotinus':
      if (stat === 'belief' && locationCards.every(c => c.type !== 'gp' || c.cardId === gp.id)) bonus += 3
      break

    case 'Theodoric the Great':
      if (stat === 'politics' && opponentCards.length > 0) bonus += Math.min(3, alliedFollowers.length)
      break

    case 'Zu Chongzhi':
      if (stat === 'technique' && alliedWith('Astronomer', 'Mathematician') >= 1) bonus += 3
      break

    case 'Saint Genevieve':
      if (stat === 'belief' && alliedFollowers.length >= 2) bonus += 3
      break

    case 'Empress Theodora':
      if (stat === 'politics' && outnumbered) bonus += 3
      break

    case 'Queen Seondeok':
      if (stat === 'intelligence' && alliedWith('Astronomer', 'Scientist') >= 1) bonus += 3
      break

    case 'Xuanzang':
      if (stat === 'belief') bonus += Math.min(3, myCityCount - 1)
      break

    case 'Brahmagupta':
      if (stat === 'intelligence' && alliedFollowers.length === 0) bonus += 3
      break

    case 'Charlemagne':
      if (stat === 'strength' || stat === 'reputation') bonus += Math.min(3, alliedWith('Warrior', 'Soldier', 'General'))
      break

    case 'Jabir ibn Hayyan':
      if (stat === 'technique') bonus += Math.min(4, 2 * alliedWith('Scientist', 'Doctor'))
      break

    case 'Murasaki Shikibu':
      if (stat === 'culture' && alliedWith('Noble', 'Writer') >= 1) bonus += 3
      break

    case 'Avicenna':
      if (stat === 'intelligence') bonus += Math.min(3, alliedFollowers.length)
      break

    case 'Leif Erikson':
      if (stat === 'technique' && opponentCards.length === 0) bonus += 3
      break

    case 'Hildegard of Bingen':
      if (stat === 'belief' || stat === 'culture') bonus += Math.min(3, alliedWith('Monastic', 'Musician'))
      break

    case 'Jayavarman VII':
      if (stat === 'technique' && alliedFollowers.length >= 2) bonus += 3
      break

    case 'Averroes':
      if (stat === 'intelligence' && opponentCards.some(c => c.type === 'gp' ? gpMap[c.cardId]?.identities.some(i => i === 'Philosopher' || i === 'Priest') : ['Philosopher', 'Priest'].includes(followerMap[c.cardId]?.name ?? ''))) bonus += 3
      break

    case 'Fibonacci':
      if (stat === 'wealth' && alliedWith('Mathematician', 'Merchant') >= 1) bonus += 3
      break

    case 'Sundiata Keita':
      if (stat === 'reputation' && alliedWith('Writer', 'Musician') >= 1) bonus += 3
      break

    case 'Tomoe Gozen':
      if (stat === 'technique' && outnumbered) bonus += 3
      break

    case 'Ibn Khaldun':
      if (stat === 'politics') bonus += Math.min(4, alliedCards.length - 1)
      break

    case 'Timur':
      if (stat === 'strength' && opponentCards.length >= 2) bonus += 3
      break

    case 'Hafez':
      if (stat === 'culture' && alliedWith('Musician', 'Gourmet') >= 1) bonus += 3
      break

    case 'Cosimo de\' Medici':
      if (stat === 'wealth') bonus += Math.min(4, 2 * (myCityCount - 1))
      break

    case 'Zara Yaqob':
      if (stat === 'belief' && alliedWith('Priest', 'Monastic') >= 1) bonus += 3
      break

    case 'Peter the Great':
      if (stat === 'technique' && alliedWith('Engineer', 'Explorer') >= 1) bonus += 3
      break

    case 'Osei Tutu':
      if (stat === 'reputation' && alliedFollowers.length >= 2) bonus += 3
      break

    case 'Harriet Tubman':
      if (stat === 'belief' && outnumbered) bonus += 3
      break

    case 'Nikola Tesla':
      if (stat === 'technique' && alliedWith('Merchant', 'Banker') === 0) bonus += 3
      break

    case 'José Rizal':
      if (stat === 'politics' && rivalGPs.some(g => g.identities.includes('Sovereign'))) bonus += 3
      break

    case 'Marie Curie':
      if ((stat === 'intelligence' || stat === 'technique') && alliedWith('Scientist') >= 1) bonus += 2
      break

    case 'Alberto Santos-Dumont':
      if (stat === 'technique' && locationCards.length === 1) bonus += 3
      break

    case 'Frida Kahlo':
      if (stat === 'culture' && alliedCards.length === 1) bonus += 3
      break

    case 'Hedy Lamarr':
      if ((stat === 'technique' || stat === 'culture') && alliedWith('Musician') >= 1) bonus += 2
      break

    case 'Nelson Mandela':
      if (stat === 'reputation' && outnumbered) bonus += 3
      break

    case 'Yuri Gagarin':
      if (stat === 'reputation' && alliedGPCards.every(g => g.id === gp.id)) bonus += 3
      break

    case 'Wangari Maathai':
      if (stat === 'belief') bonus += Math.min(4, alliedFollowers.length)
      break
  }

  return bonus
}

export function computeLocationTotal(
  locationCards: OnboardCard[],
  playerId: string,
  stat: StatKey,
  gpCards: Record<string, Card>,
  followerCards: Record<string, FollowerCard>,
  allLocations?: LocationState[],
  locationName?: string,
  locationEra?: string,
): number {
  const locs = allLocations ?? []
  const locBonus = (locationName && locationEra) ? locationFightBonus(locationName, locationEra, stat) : 0
  let total = 0
  for (const oc of locationCards) {
    if (oc.playerId !== playerId) continue
    if (oc.type === 'gp') {
      const gp = gpCards[oc.cardId]
      if (gp) {
        total += gp[stat]
        total += traitBonusForGP(gp, stat, locationCards, playerId, locs, gpCards, followerCards)
        total += locBonus
      }
    } else {
      const f = followerCards[oc.cardId]
      if (f && f.stat === stat) {
        const hasIdentityMatch = locationCards.some(
          lc => lc.playerId === playerId && lc.type === 'gp' && gpCards[lc.cardId]?.identities?.includes(f.name)
        )
        total += hasIdentityMatch ? FOLLOWER_IDENTITY_MATCH_BONUS : f.bonus
      }
    }
  }
  return total
}

export function computeSide(
  locationCards: OnboardCard[],
  playerId: string,
  playerName: string,
  stat: StatKey,
  gpMap: Record<string, Card>,
  followerMap: Record<string, FollowerCard>,
  allLocations: LocationState[],
  locationName?: string,
  locationEra?: string,
): CombatSide {
  const locBonus = (locationName && locationEra) ? locationFightBonus(locationName, locationEra, stat) : 0
  const cards: CardContrib[] = []
  let total = 0
  for (const oc of locationCards) {
    if (oc.playerId !== playerId) continue
    if (oc.type === 'gp') {
      const gp = gpMap[oc.cardId]
      if (!gp) continue
      const baseStat = gp[stat]
      const traitBonus = traitBonusForGP(gp, stat, locationCards, playerId, allLocations, gpMap, followerMap)
      cards.push({ type: 'gp', name: gp.figureName, portraitUrl: gp.portraitUrl, baseStat, traitBonus, followerBonus: 0, locationBonus: locBonus })
      total += baseStat + traitBonus + locBonus
    } else {
      const f = followerMap[oc.cardId]
      if (!f) continue
      const hasIdentityMatch = f.stat === stat && locationCards.some(
        lc => lc.playerId === playerId && lc.type === 'gp' && gpMap[lc.cardId]?.identities?.includes(f.name)
      )
      const followerBonus = f.stat === stat ? (hasIdentityMatch ? FOLLOWER_IDENTITY_MATCH_BONUS : f.bonus) : 0
      cards.push({ type: 'follower', name: f.name, imageKey: f.imageKey, baseStat: 0, traitBonus: 0, followerBonus, locationBonus: 0 })
      total += followerBonus
    }
  }
  return { playerName, cards, total }
}

export function computeEventSide(
  locationCards: OnboardCard[],
  playerId: string,
  playerName: string,
  stat: StatKey | null,
  threshold: number,
  gpMap: Record<string, Card>,
  followerMap: Record<string, FollowerCard>,
  allLocations: LocationState[],
): EventPlayerResult {
  const cards: CardContrib[] = []
  let total = 0
  for (const oc of locationCards) {
    if (oc.playerId !== playerId) continue
    if (oc.type === 'gp') {
      const gp = gpMap[oc.cardId]
      if (!gp) continue
      if (stat) {
        const baseStat = gp[stat]
        const traitBonus = traitBonusForGP(gp, stat, locationCards, playerId, allLocations, gpMap, followerMap)
        cards.push({ type: 'gp', name: gp.figureName, portraitUrl: gp.portraitUrl, baseStat, traitBonus, followerBonus: 0, locationBonus: 0 })
        total += baseStat + traitBonus
      }
    } else {
      const f = followerMap[oc.cardId]
      if (!f) continue
      const hasIdentityMatch = (!stat || f.stat === stat) && locationCards.some(
        lc => lc.playerId === playerId && lc.type === 'gp' && gpMap[lc.cardId]?.identities?.includes(f.name)
      )
      const followerBonus = stat
        ? (f.stat === stat ? (hasIdentityMatch ? FOLLOWER_IDENTITY_MATCH_BONUS : f.bonus) : 0)
        : (hasIdentityMatch ? FOLLOWER_IDENTITY_MATCH_BONUS : f.bonus)
      cards.push({ type: 'follower', name: f.name, imageKey: f.imageKey, baseStat: 0, traitBonus: 0, followerBonus, locationBonus: 0 })
      total += followerBonus
    }
  }
  return { playerName, total, threshold, survived: total >= threshold, cards }
}

// ─── Game Initialization ──────────────────────────────────────────────────────

export const STARTING_GP_HAND = 4

/** GP cards in play: a single-era game only uses Great People from that era. */
export function gpPool(eraMode: EraMode, singleEra?: string): Card[] {
  if (eraMode === 'single' && singleEra) return ALL_GP_CARDS.filter(c => c.era === singleEra)
  return ALL_GP_CARDS
}

function newPlayer(id: string, name: string, isComputer: boolean, hand: Pick<PlayerState, 'gpHand' | 'eventHand' | 'followerHand'>): PlayerState {
  return {
    id, name, isComputer, ...hand,
    archive: [], winningPoints: 0, retired: [], pendingSuccessors: [], legacies: [], activeLegacies: [],
  }
}

export function freshTurnActions(): TurnActions {
  return { deployedGP: false, addedFollower: false, movedCards: [], actedCards: [] }
}

/** The year an era opens on: its earliest-born Great Person in the pool. */
export function eraStartYear(era: string, pool: Card[] = ALL_GP_CARDS): number {
  const born = pool.filter(c => c.era === era).map(c => c.born)
  return born.length ? Math.min(...born) : Math.min(...pool.map(c => c.born))
}

export interface OpeningDeal {
  startEra: string
  startYear: number
  /** The candidates each player picks their first Great Person from, in seat order. */
  offers: string[][]
}

/**
 * The opening of a timeline game: the era it opens on, the year, and the
 * OPENING_CHOICES candidates each player picks one Great Person from.  They
 * are the earliest-born of the pool from that era on, shuffled between the
 * players, so the table starts as contemporaries; nobody is offered a card
 * someone else is offered.
 */
export function openingDeal(setup: GameSetup, playerCount: number): OpeningDeal {
  const pool = gpPool(setup.eraMode, setup.singleEra)
  const startEra = setup.eraMode === 'single' && setup.singleEra
    ? setup.singleEra
    : setup.startEra && ERAS.includes(setup.startEra) ? setup.startEra : ERAS[Math.floor(Math.random() * ERAS.length)]
  const opening = eraStartYear(startEra, pool)
  const upcoming = pool.filter(c => c.born >= opening).sort((a, b) => a.born - b.born || a.figureName.localeCompare(b.figureName))
  // Small eras cannot offer a full table three candidates each: offer fewer, equally.
  const perPlayer = Math.max(1, Math.min(OPENING_CHOICES, Math.floor(upcoming.length / Math.max(1, playerCount))))
  const dealt = shuffle(upcoming.slice(0, perPlayer * playerCount).map(c => c.id))
  const offers = Array.from({ length: playerCount }, (_, i) => dealt.slice(i * perPlayer, (i + 1) * perPlayer))
  const startYear = Math.min(...dealt.map(id => getGPCard(id)!.born), opening)
  return { startEra, startYear, offers }
}

/**
 * Every Battle-tab game starts at a real year (see openingDeal) and runs on
 * the timeline; time skips ahead at once until someone's career begins.
 */
export function initGame(setup: GameSetup): GameState {
  setup = { ...setup, timeline: true }
  const eventDeck = makeEventDeck()
  const followerDeck = makeFollowerDeck()

  const allPlayerNames: string[] = [
    ...setup.playerNames,
    ...(setup.playerMode === 'pvc'
      ? Array.from({ length: setup.numComputers }, (_, i) => `CPU ${i + 1}`)
      : []),
  ]

  const { startEra, startYear, offers } = openingDeal(setup, allPlayerNames.length)
  setup.startEra = startEra
  // Everyone opens with one slot: the first screen is picking its Great Person.
  const players: PlayerState[] = allPlayerNames.map((name, i) => ({
    ...newPlayer(
      `player-${i}`, name, setup.playerMode === 'pvc' && i >= setup.playerNames.length,
      { gpHand: [], eventHand: eventDeck.splice(0, STARTING_EVENTS), followerHand: followerDeck.splice(0, STARTING_FOLLOWERS) },
    ),
    pendingSuccessors: [{ predecessor: null, year: startYear, reason: 'start' as const, options: offers[i] }],
  }))

  // The board opens with cities of the age history opens in.
  const locationTemplates = pickLocations(setup.eraMode === 'single' && setup.singleEra ? setup.singleEra : startEra)
  const emptyLocations: LocationState[] = locationTemplates.map((lt, i) => ({
    id: `loc-${i}`,
    name: lt.name,
    era: lt.era,
    imageKey: lt.imageKey,
    countries: lt.countries,
    cards: [],
    activeEvent: null,
    eventRoundsLeft: 0,
  }))
  // Cities may already be in a state of their own when history opens.
  const { locations } = setup.noHazards ? { locations: emptyLocations } : rollCityStates(emptyLocations)

  const state: GameState = {
    setup,
    phase: 'playing',
    players,
    locations,
    currentPlayerIdx: 0,
    round: 1,
    year: startYear,
    startYear,
    turnActions: freshTurnActions(),
    // The timeline has no draw pile: new Great People only arrive as successors.
    gpDeck: [],
    eventDeck,
    followerDeck,
    winner: null,
    log: [`History opens in ${formatYear(startYear)} (${startEra}). One round is one year.`],
    globalCompetitionActive: null,
    pendingSummary: null,
  }
  return settle(state)
}

// ─── Scripted games ───────────────────────────────────────────────────────────
//
// A FightScript lays out a small, fully specified board: which locations are
// on the table, what each side holds, which cards already stand where and
// which events are already running.  The Epic fight lessons are built from
// these so a story can start with "one location, two Great People and one
// follower" and grow from there.

export interface FightHand {
  /** Card ids from data/cards.json. */
  gp?: string[]
  /** Follower template names from data/followers.json. */
  followers?: string[]
  events?: { stat: StatKey; kind: Exclude<EventType, 'natural_hazard'> }[]
}

export interface FightPlacement {
  side: 'player' | 'cpu'
  /** Index into FightScript.locations. */
  location: number
  gp?: string
  follower?: string
  isPublic?: boolean
}

export interface FightScript {
  playerName?: string
  cpuName?: string
  /** Location image keys (or names) from data/locations.json, in board order. */
  locations: string[]
  player: FightHand
  cpu: FightHand
  /** Cards already on the table when the lesson starts; never count as just deployed. */
  board?: FightPlacement[]
  /** Events already running when the lesson starts. */
  events?: { location: number; stat: StatKey; kind: Exclude<EventType, 'natural_hazard'> }[]
  /** Draw pile for achievement and competition rewards; defaults to every other card. */
  gpDeck?: string[]
  /** Random natural hazards each round; off by default. */
  hazards?: boolean
}

export function makeEventCard(stat: StatKey, kind: Exclude<EventType, 'natural_hazard'>, id: string): EventCard {
  const idx = EVENT_TYPES.indexOf(kind)
  return {
    id,
    name: EVENT_NAMES[stat][idx],
    type: kind,
    stat,
    description: kind === 'local_event'
      ? `Local event: compare ${STAT_LABELS[stat]} totals. Winner may attack loser.`
      : kind === 'local_survival'
      ? `Local survival: cards with ${STAT_LABELS[stat]} < 5 are discarded.`
      : `Global competition: player with highest total ${STAT_LABELS[stat]} (public cards) wins a prize bundle.`,
  }
}

export function findLocation(key: string): LocationTemplate | undefined {
  return LOCATION_POOL.find(l => l.imageKey === key) ?? LOCATION_POOL.find(l => l.name === key)
}

export function initScriptedGame(script: FightScript): GameState {
  let followerCounter = 0
  const follower = (name: string): FollowerCard | null => {
    const tmpl = FOLLOWER_TMPL_BY_NAME[name]
    return tmpl ? { ...tmpl, id: `follower-${tmpl.name}-${followerCounter++}` } : null
  }
  let eventCounter = 0
  const hand = (h: FightHand): Pick<PlayerState, 'gpHand' | 'eventHand' | 'followerHand'> => ({
    gpHand: (h.gp ?? []).filter(id => !!getGPCard(id)),
    eventHand: (h.events ?? []).map(e => makeEventCard(e.stat, e.kind, `event-${e.stat}-${e.kind}-${eventCounter++}`)),
    followerHand: (h.followers ?? []).map(follower).filter((f): f is FollowerCard => !!f),
  })

  const players: PlayerState[] = [
    newPlayer('player-0', script.playerName ?? 'You', false, hand(script.player)),
    newPlayer('player-1', script.cpuName ?? 'Rival', true, hand(script.cpu)),
  ]

  const templates = script.locations.map(key => findLocation(key) ?? LOCATION_POOL[0])
  const locations: LocationState[] = templates.map((lt, i) => ({
    id: `loc-${i}`,
    name: lt.name,
    era: lt.era,
    imageKey: lt.imageKey,
    countries: lt.countries,
    cards: [],
    activeEvent: null,
    eventRoundsLeft: 0,
  }))

  for (const p of script.board ?? []) {
    const loc = locations[p.location]
    if (!loc) continue
    const playerId = p.side === 'player' ? 'player-0' : 'player-1'
    let cardId: string | null = null
    let type: OnboardCard['type'] = 'gp'
    if (p.gp && getGPCard(p.gp)) cardId = p.gp
    else if (p.follower) { const f = follower(p.follower); if (f) { cardId = f.id; type = 'follower' } }
    if (!cardId) continue
    loc.cards.push({
      instanceId: uid(), cardId, type, playerId,
      isPublic: p.isPublic ?? type === 'follower',
      justDeployed: false, achievementTicks: 0,
    })
  }

  for (const e of script.events ?? []) {
    const loc = locations[e.location]
    if (!loc) continue
    loc.activeEvent = makeEventCard(e.stat, e.kind, `event-${e.stat}-${e.kind}-${eventCounter++}`)
    loc.eventRoundsLeft = e.kind === 'global_competition' ? 1 : PLAYER_EVENT_ROUNDS
  }
  const globalCompetitionActive = locations.find(l => l.activeEvent?.type === 'global_competition')?.activeEvent ?? null

  const used = new Set([
    ...players.flatMap(p => p.gpHand),
    ...locations.flatMap(l => l.cards.filter(c => c.type === 'gp').map(c => c.cardId)),
  ])
  const gpDeck = script.gpDeck ?? shuffle(ALL_GP_CARDS.map(c => c.id).filter(id => !used.has(id)))

  const setup: GameSetup = {
    mode: 'scenario', matchType: 'pvc', playerMode: 'pvc', eraMode: 'all',
    playerNames: [players[0].name], numComputers: 1, noHazards: !script.hazards, timeline: false,
  }

  return {
    setup,
    phase: 'playing',
    players,
    locations,
    currentPlayerIdx: 0,
    round: 1,
    year: 0,
    startYear: 0,
    turnActions: freshTurnActions(),
    gpDeck,
    eventDeck: makeEventDeck(),
    followerDeck: makeFollowerDeck(),
    winner: null,
    log: ['The lesson begins. Your move.'],
    globalCompetitionActive,
    pendingSummary: null,
  }
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

export type GameAction =
  | { type: 'DEPLOY_GP'; cardId: string; locationId: string; isPublic: boolean }
  | { type: 'ADD_FOLLOWER'; followerId: string; locationId: string; instanceId: string }
  | { type: 'MOVE_CARD'; instanceId: string; toLocationId: string }
  | { type: 'START_EVENT'; eventCardIdx: number; locationId: string }
  | { type: 'RETRIEVE_CARD'; instanceId: string }
  | { type: 'CLAIM_ACHIEVEMENT'; instanceId: string }
  | { type: 'ATTACK'; myInstanceId: string; theirInstanceId: string; kill: boolean }
  | { type: 'TOGGLE_VISIBILITY'; instanceId: string }
  | { type: 'END_SCENARIO'; locationId: string }
  | { type: 'END_TURN' }
  | { type: 'GLOBAL_COMP_REWARD'; playerId: string; rewardType: 'events' | 'followers' | 'gp' }
  | { type: 'DISMISS_SUMMARY' }
  /** Take one of your Great People out of play for good; the successor still waits for their real death year. */
  | { type: 'RETIRE_GP'; cardId: string }
  /** Resolve the oldest pending succession of a (human) player with one of successorOptions(). */
  | { type: 'CHOOSE_SUCCESSOR'; playerId: string; cardId: string }
  | { type: 'CHOOSE_REWARD'; playerId: string; pick: 'followers' | 'events' }
  /** Put an earned legacy into a slot, or take it out. One change per turn. */
  | { type: 'SET_LEGACY'; cardId: string; active: boolean }

export function buildLookups(state: GameState) {
  const gpMap: Record<string, Card> = {}
  for (const c of ALL_GP_CARDS) gpMap[c.id] = c

  const followerMap: Record<string, FollowerCard> = {}
  for (const p of state.players) {
    for (const f of p.followerHand) followerMap[f.id] = f
  }
  // Deployed followers are no longer in any hand — rebuild from template
  for (const loc of state.locations) {
    for (const oc of loc.cards) {
      if (oc.type === 'follower' && !followerMap[oc.cardId]) {
        const f = followerFromId(oc.cardId)
        if (f) followerMap[oc.cardId] = f
      }
    }
  }
  return { gpMap, followerMap }
}

/** The player with the most legacies (ties go to seat order). */
export function leader(state: GameState): string {
  return [...state.players].sort((a, b) => b.legacies.length - a.legacies.length)[0].id
}

export function checkWinCondition(state: GameState): string | null {
  if (state.setup.timeline) {
    // No points race: the game runs to the end of history (or until no
    // lineage is left anywhere) and the most legacies wins.
    if (state.year >= TIMELINE_END_YEAR) return leader(state)
    if (!state.players.some(p => hasFuture(state, p))) return leader(state)
    return null
  }
  // Timeless games (the Epic lessons): 5 winning points
  for (const p of state.players) {
    if (p.winningPoints >= 5) return p.id
  }
  // Only 1 player has GP cards
  const playersWithGP = state.players.filter(p => {
    if (p.gpHand.length > 0) return true
    return state.locations.some(loc => loc.cards.some(c => c.type === 'gp' && c.playerId === p.id))
  })
  if (playersWithGP.length === 1 && state.players.length > 1) {
    return playersWithGP[0].id
  }
  return null
}

/** Move Great People who died (killed in play or of old age) into their owner's archive and, on the timeline, queue a successor. */
export function recordDeaths(state: GameState, players: PlayerState[], deaths: { playerId: string; cardId: string }[]): PlayerState[] {
  if (!deaths.length) return players
  return players.map(p => {
    const mine = deaths.filter(d => d.playerId === p.id).map(d => d.cardId).filter(id => !p.archive.includes(id))
    if (!mine.length) return p
    return {
      ...p,
      gpHand: p.gpHand.filter(id => !mine.includes(id)),
      retired: p.retired.filter(id => !mine.includes(id)),
      archive: [...p.archive, ...mine],
      pendingSuccessors: state.setup.timeline
        ? [...p.pendingSuccessors, ...mine.map(id => ({ predecessor: id, year: state.year }))]
        : p.pendingSuccessors,
    }
  })
}

/**
 * Followers serve a Great Person: when a player's last Great Person in play
 * (on the board or in hand) dies, all of that player's Followers, in hand and
 * on the board, are discarded. Event cards stay. Call after recordDeaths and
 * before successors are chosen.
 */
export function dropLeaderlessFollowers(
  locations: LocationState[], players: PlayerState[], deaths: { playerId: string }[],
): { locations: LocationState[]; players: PlayerState[] } {
  const leaderless = new Set(deaths.map(d => d.playerId).filter(pid =>
    !players.find(p => p.id === pid)?.gpHand.length
    && !locations.some(l => l.cards.some(c => c.type === 'gp' && c.playerId === pid))))
  if (!leaderless.size) return { locations, players }
  const isTheirs = (c: OnboardCard) => c.type === 'follower' && leaderless.has(c.playerId)
  return {
    locations: locations.map(l => (l.cards.some(isTheirs) ? { ...l, cards: l.cards.filter(c => !isTheirs(c)) } : l)),
    players: players.map(p => (leaderless.has(p.id) ? { ...p, followerHand: [] } : p)),
  }
}

function gpDeaths(removed: OnboardCard[]): { playerId: string; cardId: string }[] {
  return removed.filter(c => c.type === 'gp').map(c => ({ playerId: c.playerId, cardId: c.cardId }))
}

function figure(id: string): string {
  return getGPCard(id)?.figureName ?? id
}

/** Earn a legacy: +1 winning point, the legacy is kept for the rest of the game and fills a free slot. */
function earnLegacy(p: PlayerState, cardId: string): PlayerState {
  const legacies = [...p.legacies, cardId]
  const activeLegacies = p.activeLegacies.length < LEGACY_SLOTS ? [...p.activeLegacies, cardId] : p.activeLegacies
  return { ...p, winningPoints: p.winningPoints + 1, legacies, activeLegacies }
}

// ─── The year tick ───────────────────────────────────────────────────────────

/**
 * Advance the timeline by one year: Great People who outlived their death
 * year die (on the board, in hand or in retirement) and queue a successor,
 * income legacies pay out and, outside a time skip, empty cities may fall
 * into a random state.
 */
export function advanceYear(state: GameState, opts: { fastForward?: boolean } = {}): { state: GameState; lines: string[] } {
  const year = state.year + YEARS_PER_ROUND
  const lines: string[] = []
  const deaths: { playerId: string; cardId: string }[] = []
  for (const p of state.players) {
    const owned = [
      ...p.gpHand, ...p.retired,
      ...state.locations.flatMap(l => l.cards.filter(c => c.type === 'gp' && c.playerId === p.id).map(c => c.cardId)),
    ]
    for (const id of owned) {
      const card = getGPCard(id)
      if (!card) continue
      if (deathYear(card, p) < year) {
        deaths.push({ playerId: p.id, cardId: id })
        lines.push(`${card.figureName} (${p.name}) died in ${formatYear(year - 1)}, aged ${year - 1 - card.born}.`)
      } else if (card.born === year) {
        lines.push(`${card.figureName} (${p.name}) is born.`)
      } else if (careerStartYear(card, p) === year && !p.retired.includes(id)) {
        lines.push(`${card.figureName} (${p.name}) begins their career.`)
      }
    }
  }
  const dead = new Set(deaths.map(d => `${d.playerId}:${d.cardId}`))
  let locations = state.locations.map(loc => ({
    ...loc,
    cards: loc.cards.filter(c => !(c.type === 'gp' && dead.has(`${c.playerId}:${c.cardId}`))),
  }))
  let players = recordDeaths({ ...state, year }, state.players, deaths)
  ;({ locations, players } = dropLeaderlessFollowers(locations, players, deaths))

  // Income legacies pay on every `every`-th year of the game.
  let eventDeck = state.eventDeck
  let followerDeck = state.followerDeck
  players = players.map(p => {
    let next = p
    for (const e of legacyEffects(p)) {
      if (e.kind !== 'income' || (year - state.startYear) % e.every !== 0) continue
      if (e.card === 'event' && eventDeck.length) {
        next = { ...next, eventHand: [...next.eventHand, eventDeck[0]] }
        eventDeck = eventDeck.slice(1)
      } else if (e.card === 'follower' && followerDeck.length) {
        next = { ...next, followerHand: [...next.followerHand, followerDeck[0]] }
        followerDeck = followerDeck.slice(1)
      }
    }
    return next
  })

  if (opts.fastForward) {
    // Nobody is playing these years: running states simply wear off.
    locations = locations.map(loc => {
      if (!loc.activeEvent) return loc
      const left = Math.max(0, loc.eventRoundsLeft - 1)
      return { ...loc, activeEvent: left === 0 ? null : loc.activeEvent, eventRoundsLeft: left }
    })
  } else if (!state.setup.noHazards) {
    const rolled = rollCityStates(locations)
    locations = rolled.locations
    lines.push(...rolled.lines)
  }

  const deathEvents: AchievementEvent[] = deaths.map(d => ({
    kind: 'death', playerId: d.playerId, cardId: d.cardId,
    locId: state.locations.find(l => l.cards.some(c => c.type === 'gp' && c.playerId === d.playerId && c.cardId === d.cardId))?.id ?? null,
  }))
  return { state: emit({ ...state, year, players, locations, eventDeck, followerDeck }, ...deathEvents), lines }
}

// ─── Settling: CPU choices, dead ends and time skips ─────────────────────────

function cpuPickSuccessor(options: string[]): string {
  return options.reduce((best, id) => {
    const a = getGPCard(id), b = getGPCard(best)
    if (!a || !b) return best
    const total = (c: Card) => STATS.reduce((sum, k) => sum + c[k], 0)
    return total(a) > total(b) ? id : best
  }, options[0])
}

function choiceLine(name: string, pick: string, pending: { predecessor: string | null; reason?: 'start' | 'slot' }): string {
  const born = `born ${formatYear(getGPCard(pick)?.born ?? 0)}`
  if (pending.reason === 'start') return `${name} opens history with ${figure(pick)} (${born}).`
  if (pending.reason === 'slot') return `${name} fills a new Great Person slot with ${figure(pick)} (${born}).`
  return `${name} chose ${figure(pick)} (${born})${pending.predecessor ? ` to succeed ${figure(pending.predecessor)}` : ''}.`
}

/**
 * Keep every player's lineages in step with their Great Person slots: a slot
 * that opens (a slot legacy put into effect, the competition prize) owes a
 * new pick; with fewer slots than lineages, successions still owed lapse.
 */
function reconcileSlots(state: GameState): GameState {
  if (!state.setup.timeline) return state
  let changed = false
  const players = state.players.map(p => {
    let next = p
    // The opening pick is never dropped.
    while (lineageCount(state, next) > gpSlots(next) && next.pendingSuccessors.some(x => x.reason !== 'start')) {
      const i = next.pendingSuccessors.map(x => x.reason !== 'start').lastIndexOf(true)
      next = { ...next, pendingSuccessors: next.pendingSuccessors.filter((_, j) => j !== i) }
    }
    while (lineageCount(state, next) < gpSlots(next)) {
      const owed: PendingSuccessor = { predecessor: null, year: state.year, reason: 'slot' }
      const probe = { ...next, pendingSuccessors: [owed] }
      if (!successorOptions({ ...state, players: state.players.map(x => (x.id === p.id ? probe : x)) }, p.id).length) break
      next = { ...next, pendingSuccessors: [...next.pendingSuccessors, owed] }
    }
    if (next !== p) changed = true
    return next
  })
  return changed ? { ...state, players } : state
}

/** CPU players choose successors and fill empty legacy slots at once; successions with no candidate left end their lineage. */
/** Computer players take their prizes at once. */
function resolveCpuRewards(state: GameState): GameState {
  let s = state
  for (const r of state.pendingRewards ?? []) {
    const p = s.players.find(x => x.id === r.playerId)
    if (p?.isComputer) s = takeReward(s, p.id, cpuRewardPick(p))
  }
  return s
}

function resolveChoices(state: GameState): GameState {
  let s = reconcileSlots(state)
  const log: string[] = []
  for (let i = 0; i < s.players.length; i++) {
    let p = s.players[i]
    while (p.pendingSuccessors.length) {
      const options = successorOptions(s, p.id)
      const pending = p.pendingSuccessors[0]
      if (!options.length) {
        log.push(`No one born after ${formatYear(s.year)} remains to succeed ${pending.predecessor ? figure(pending.predecessor) : 'this lineage'}; ${p.name}'s lineage ends.`)
        p = { ...p, pendingSuccessors: p.pendingSuccessors.slice(1) }
      } else if (p.isComputer) {
        const pick = cpuPickSuccessor(options)
        log.push(choiceLine(p.name, pick, pending))
        p = { ...p, gpHand: [...p.gpHand, pick], pendingSuccessors: p.pendingSuccessors.slice(1) }
      } else break
      s = { ...s, players: s.players.map((x, j) => (j === i ? p : x)) }
    }
    if (p.isComputer && p.activeLegacies.length < LEGACY_SLOTS) {
      const free = p.legacies.filter(id => !p.activeLegacies.includes(id))
      if (free.length) {
        p = { ...p, activeLegacies: [...p.activeLegacies, ...free].slice(0, LEGACY_SLOTS) }
        s = { ...s, players: s.players.map((x, j) => (j === i ? p : x)) }
      }
    }
  }
  // A computer choosing after a human may have taken the human's last candidates: end those lineages too.
  s = {
    ...s,
    players: s.players.map(p => {
      let next = p
      while (next.pendingSuccessors.length && !successorOptions({ ...s, players: s.players.map(x => (x.id === p.id ? next : x)) }, p.id).length) {
        const pending = next.pendingSuccessors[0]
        log.push(`No one born after ${formatYear(s.year)} remains to succeed ${pending.predecessor ? figure(pending.predecessor) : 'this lineage'}; ${p.name}'s lineage ends.`)
        next = { ...next, pendingSuccessors: next.pendingSuccessors.slice(1) }
      }
      return next
    }),
  }
  return log.length ? { ...s, log: [...log.reverse(), ...s.log].slice(0, 20) } : s
}

/**
 * Time skips ahead while no human player has a Great Person in their career
 * (and none of them owes a successor choice). Humans whose lineages have all
 * ended watch the computer play history out to its end the same way.
 */
export function shouldFastForward(state: GameState): boolean {
  if (!state.setup.timeline || state.phase !== 'playing') return false
  const humans = state.players.filter(p => !p.isComputer)
  if (!humans.length) return false
  if (humans.some(p => p.pendingSuccessors.length > 0)) return false
  if (humans.some(p => hasActiveGP(state, p))) return false
  return state.players.some(p => hasFuture(state, p)) && state.year < TIMELINE_END_YEAR
}

/**
 * One skipped year of CPU progress.  Legacies come only from each card's own
 * achievement now, so nothing is won off screen; kept as a hook for skipped-year rules.
 */
function cpuSkippedYear(state: GameState, _rand: () => number, _lines: string[]): GameState {
  return state
}


export function fastForward(state: GameState, rand: () => number = Math.random): GameState {
  const fromYear = state.year
  const lines: string[] = []
  let s = state
  while (shouldFastForward(s)) {
    const r = advanceYear(s, { fastForward: true })
    s = r.state
    lines.push(...r.lines)
    s = cpuSkippedYear(s, rand, lines)
    s = resolveChoices(s)
    const winner = checkWinCondition(s)
    if (winner) { s = { ...s, winner, phase: 'ended' }; break }
  }
  if (s.year === fromYear) return s
  const skipped = s.year - fromYear
  const summary: GameSummary = { kind: 'timeskip', fromYear, toYear: s.year, lines: lines.slice(-14) }
  return {
    ...s,
    currentPlayerIdx: 0,
    round: s.round + skipped,
    turnActions: freshTurnActions(),
    pendingSummary: s.pendingSummary ?? summary,
    summaryQueue: s.pendingSummary ? [...(s.summaryQueue ?? []), summary] : s.summaryQueue,
    log: [`Time passes: ${formatYear(fromYear)} → ${formatYear(s.year)} (${skipped} years).`, ...lines.slice(-4).reverse(), ...s.log].slice(0, 20),
  }
}

/** Everything that happens on its own after an action: CPU choices, time skips and the end of the game. */
export function settle(state: GameState): GameState {
  if (state.phase !== 'playing') return state
  let s = resolveCpuRewards(state)
  if (s.setup.timeline) {
    s = resolveChoices(s)
    if (shouldFastForward(s)) s = fastForward(s)
    s = alignLocations(s)
  }
  if (s.phase !== 'playing') return s
  const winner = checkWinCondition(s)
  return winner ? { ...s, winner, phase: 'ended' } : s
}

/** Actions that count as acting this year (Gandhi's achievement). */
const ACTING = new Set<GameAction['type']>(['DEPLOY_GP', 'ADD_FOLLOWER', 'MOVE_CARD', 'ATTACK', 'RETRIEVE_CARD'])

export function gameReducer(state: GameState, action: GameAction): GameState {
  let next = baseReducer(state, action)
  if (next === state || action.type === 'DISMISS_SUMMARY') return next
  const me = state.players[state.currentPlayerIdx]?.id
  if (me && ACTING.has(action.type) && !(next.roundActed ?? []).includes(me)) next = { ...next, roundActed: [...(next.roundActed ?? []), me] }
  if (action.type === 'ADD_FOLLOWER') next = emit(next, { kind: 'follower', locId: action.locationId, playerId: me })
  if (action.type === 'START_EVENT') next = emit(next, { kind: 'event', locId: action.locationId, playerId: me })
  if (action.type === 'END_SCENARIO') {
    const ended = state.locations.find(l => l.id === action.locationId)?.activeEvent
    if (ended) next = emit(next, { kind: 'ended', locId: action.locationId, event: ended, playerId: me })
  }
  if (action.type === 'CLAIM_ACHIEVEMENT') {
    const claimed = state.locations.flatMap(l => l.cards).find(c => c.instanceId === action.instanceId)
    if (claimed) next = emit(next, { kind: 'claim', playerId: me, cardId: claimed.cardId })
  }
  return checkAchievements(settle(checkAchievements(next)))
}

/** Run the recorded events past every Great Person's own achievement, then clear them. */
function checkAchievements(state: GameState): GameState {
  const events = state.achievementEvents ?? []
  if (!events.length) return state
  const { gpMap, followerMap } = buildLookups(state)
  // Followers swept off the board are in no hand any more: rebuild them from their ids.
  for (const ev of events) {
    const cards = ev.kind === 'fight' ? [...ev.before, ev.attacker, ev.defender] : ev.kind === 'survival' ? ev.before : []
    for (const c of cards) if (c.type === 'follower' && !followerMap[c.cardId]) { const f = followerFromId(c.cardId); if (f) followerMap[c.cardId] = f }
  }
  return runAchievements({ ...state, achievementEvents: [] }, events, { gp: gpMap, follower: followerMap },
    id => getAchievementThreshold(getGPCard(id)?.figureName ?? ''))
}

function baseReducer(state: GameState, action: GameAction): GameState {
  const currentPlayer = state.players[state.currentPlayerIdx]

  switch (action.type) {
    case 'DEPLOY_GP': {
      if (state.turnActions.deployedGP) return state
      const playerIdx = state.currentPlayerIdx
      const player = state.players[playerIdx]
      if (!player.gpHand.includes(action.cardId)) return state
      // On the timeline only a Great Person in their career can take the stage.
      if (lifeStatus(state, player.id, action.cardId) !== 'active') return state

      const newCard: OnboardCard = {
        instanceId: uid(),
        cardId: action.cardId,
        type: 'gp',
        playerId: player.id,
        isPublic: action.isPublic,
        justDeployed: true,
        achievementTicks: 0,
      }

      const newPlayers = state.players.map((p, i) =>
        i === playerIdx ? { ...p, gpHand: p.gpHand.filter(id => id !== action.cardId) } : p
      )
      const newLocations = state.locations.map(loc =>
        loc.id === action.locationId ? { ...loc, cards: [...loc.cards, newCard] } : loc
      )
      const gpName = getGPCard(action.cardId)?.figureName ?? action.cardId

      return {
        ...state,
        players: newPlayers,
        locations: newLocations,
        turnActions: { ...state.turnActions, deployedGP: true },
        log: [`${player.name} deployed ${gpName} to ${newLocations.find(l => l.id === action.locationId)?.name}.`, ...state.log.slice(0, 19)],
      }
    }

    case 'ADD_FOLLOWER': {
      if (state.turnActions.addedFollower) return state
      const playerIdx = state.currentPlayerIdx
      const player = state.players[playerIdx]
      const follower = player.followerHand.find(f => f.id === action.instanceId)
      if (!follower) return state

      // Location must have this player's GP
      const loc = state.locations.find(l => l.id === action.locationId)
      if (!loc) return state
      const hasGP = loc.cards.some(c => c.type === 'gp' && c.playerId === player.id)
      if (!hasGP) return state

      const newCard: OnboardCard = {
        instanceId: uid(),
        cardId: action.instanceId,
        type: 'follower',
        playerId: player.id,
        isPublic: true,
        justDeployed: true,
        achievementTicks: 0,
      }

      const newPlayers = state.players.map((p, i) =>
        i === playerIdx ? { ...p, followerHand: p.followerHand.filter(f => f.id !== action.instanceId) } : p
      )
      const newLocations = state.locations.map(l =>
        l.id === action.locationId ? { ...l, cards: [...l.cards, newCard] } : l
      )

      return {
        ...state,
        players: newPlayers,
        locations: newLocations,
        turnActions: { ...state.turnActions, addedFollower: true },
        log: [`${player.name} added ${follower.name} follower.`, ...state.log.slice(0, 19)],
      }
    }

    case 'MOVE_CARD': {
      const playerIdx = state.currentPlayerIdx
      const player = state.players[playerIdx]
      if (state.turnActions.movedCards.includes(action.instanceId)) return state

      let movedCard: OnboardCard | null = null
      let fromLocName = ''
      const newLocations = state.locations.map(loc => {
        const idx = loc.cards.findIndex(c => c.instanceId === action.instanceId && c.playerId === player.id && !c.justDeployed)
        if (idx !== -1) {
          movedCard = loc.cards[idx]
          fromLocName = loc.name
          return { ...loc, cards: loc.cards.filter((_, i) => i !== idx) }
        }
        return loc
      }).map(loc =>
        loc.id === action.toLocationId && movedCard
          ? { ...loc, cards: [...loc.cards, { ...movedCard }] }
          : loc
      )

      if (!movedCard) return state
      const toLocName = state.locations.find(l => l.id === action.toLocationId)?.name ?? ''
      const gpName = (movedCard as OnboardCard).type === 'gp'
        ? getGPCard((movedCard as OnboardCard).cardId)?.figureName ?? 'Card'
        : 'Follower'

      return {
        ...state,
        locations: newLocations,
        turnActions: { ...state.turnActions, movedCards: [...state.turnActions.movedCards, action.instanceId] },
        log: [`${player.name} moved ${gpName} from ${fromLocName} to ${toLocName}.`, ...state.log.slice(0, 19)],
      }
    }

    case 'START_EVENT': {
      const playerIdx = state.currentPlayerIdx
      const player = state.players[playerIdx]
      if (state.turnActions.actedCards.includes(`event-${action.locationId}`)) return state

      const eventCard = player.eventHand[action.eventCardIdx]
      if (!eventCard) return state

      // Player must have a GP at the location that was not deployed this turn
      const targetLoc = state.locations.find(l => l.id === action.locationId)
      if (!targetLoc) return state
      const hasGPHere = targetLoc.cards.some(c => c.type === 'gp' && c.playerId === player.id && !c.justDeployed)
      if (!hasGPHere) return state

      const newPlayers = state.players.map((p, i) =>
        i === playerIdx ? { ...p, eventHand: p.eventHand.filter((_, idx) => idx !== action.eventCardIdx) } : p
      )

      let globalCompetitionActive = state.globalCompetitionActive
      const isGlobal = eventCard.type === 'global_competition'
      const newLocations = state.locations.map(loc =>
        loc.id === action.locationId
          ? { ...loc, activeEvent: { ...eventCard, origin: 'player' as const }, eventRoundsLeft: isGlobal ? 1 : PLAYER_EVENT_ROUNDS }
          : loc
      )
      if (isGlobal) globalCompetitionActive = eventCard

      return {
        ...state,
        players: newPlayers,
        locations: newLocations,
        globalCompetitionActive,
        turnActions: { ...state.turnActions, actedCards: [...state.turnActions.actedCards, `event-${action.locationId}`] },
        log: [`${player.name} started event: ${eventCard.name}.`, ...state.log.slice(0, 19)],
      }
    }

    case 'RETRIEVE_CARD': {
      const playerIdx = state.currentPlayerIdx
      const player = state.players[playerIdx]
      if (state.turnActions.actedCards.includes(action.instanceId)) return state

      let retrieved: OnboardCard | null = null
      const newLocations = state.locations.map(loc => {
        const idx = loc.cards.findIndex(c => c.instanceId === action.instanceId && c.playerId === player.id && !c.justDeployed)
        if (idx !== -1) {
          retrieved = loc.cards[idx]
          return { ...loc, cards: loc.cards.filter((_, i) => i !== idx) }
        }
        return loc
      })

      if (!retrieved) return state

      const card = retrieved as OnboardCard
      let newPlayers = state.players
      if (card.type === 'gp') {
        newPlayers = state.players.map((p, i) =>
          i === playerIdx ? { ...p, gpHand: [...p.gpHand, card.cardId] } : p
        )
      } else {
        // Rebuild follower from deck info
        const followerInDeck = state.followerDeck.find(f => f.id === card.cardId)
          ?? { id: card.cardId, name: 'Follower', stat: 'culture' as StatKey, bonus: 6, imageKey: 'artist' }
        newPlayers = state.players.map((p, i) =>
          i === playerIdx ? { ...p, followerHand: [...p.followerHand, followerInDeck] } : p
        )
      }

      const name = card.type === 'gp' ? (getGPCard(card.cardId)?.figureName ?? 'Card') : 'Follower'
      return {
        ...state,
        players: newPlayers,
        locations: newLocations,
        turnActions: { ...state.turnActions, actedCards: [...state.turnActions.actedCards, action.instanceId] },
        log: [`${player.name} retrieved ${name} to hand.`, ...state.log.slice(0, 19)],
      }
    }

    case 'CLAIM_ACHIEVEMENT': {
      const playerIdx = state.currentPlayerIdx
      const player = state.players[playerIdx]
      if (state.turnActions.actedCards.includes(action.instanceId)) return state

      // A Great Person who met their achievement; claiming reveals them. Each legacy is earned once.
      let claimed: OnboardCard | null = null
      const newLocations = state.locations.map(loc => ({
        ...loc,
        cards: loc.cards.map(c => {
          if (c.instanceId === action.instanceId && c.playerId === player.id && c.type === 'gp'
            && !player.legacies.includes(c.cardId)
            && c.achievementTicks >= getAchievementThreshold(getGPCard(c.cardId)?.figureName ?? '')) {
            claimed = c
            return { ...c, achievementTicks: 0, isPublic: true }
          }
          return c
        }),
      }))
      if (!claimed) return state
      const cardId = (claimed as OnboardCard).cardId
      const card = getGPCard(cardId)

      // The timeless lessons keep the old reward of a fresh Great Person from the deck.
      const newGpDeck = [...state.gpDeck]
      const drawn = state.setup.timeline ? undefined : newGpDeck.shift()
      const newPlayers = state.players.map((p, i) => {
        if (i !== playerIdx) return p
        const earned = earnLegacy(p, cardId)
        return drawn ? { ...earned, gpHand: [...earned.gpHand, drawn] } : earned
      })

      return {
        ...state,
        players: newPlayers,
        locations: newLocations,
        gpDeck: newGpDeck,
        turnActions: { ...state.turnActions, actedCards: [...state.turnActions.actedCards, action.instanceId] },
        log: [`${player.name}'s ${card?.figureName ?? 'Great Person'} earned the legacy ${card?.legacy.name ?? ''}!`, ...state.log.slice(0, 19)],
      }
    }

    case 'ATTACK': {
      const playerIdx = state.currentPlayerIdx
      const player = state.players[playerIdx]

      // Find both cards, ensure they're in the same location
      let myCard: OnboardCard | null = null
      let theirCard: OnboardCard | null = null
      let locationId = ''

      for (const loc of state.locations) {
        const mine = loc.cards.find(c => c.instanceId === action.myInstanceId && c.playerId === player.id)
        const theirs = loc.cards.find(c => c.instanceId === action.theirInstanceId && c.playerId !== player.id)
        if (mine && theirs) {
          myCard = mine
          theirCard = theirs
          locationId = loc.id
          break
        }
      }

      if (!myCard || !theirCard) return state

      const loc = state.locations.find(l => l.id === locationId)
      if (!loc?.activeEvent || loc.activeEvent.type !== 'local_event') return state

      const stat = loc.activeEvent.stat!
      const { gpMap, followerMap } = buildLookups(state)

      const myLegacy = legacyContest(state, player.id, stat, 'attack', loc.cards, followerMap)
      const theirLegacy = legacyContest(state, theirCard.playerId, stat, 'defend', loc.cards, followerMap)
      const myTotal = computeLocationTotal(loc.cards, player.id, stat, gpMap, followerMap, state.locations, loc.name, loc.era) + myLegacy.total
      const theirTotal = computeLocationTotal(loc.cards, theirCard.playerId, stat, gpMap, followerMap, state.locations, loc.name, loc.era) + theirLegacy.total

      const myWon = myTotal > theirTotal
      const theirWon = theirTotal > myTotal

      // After attack, both cards in this location become public
      let newLocations = state.locations.map(l =>
        l.id === locationId
          ? {
              ...l,
              cards: l.cards.map(c =>
                (c.instanceId === action.myInstanceId || c.instanceId === action.theirInstanceId)
                  ? { ...c, isPublic: true }
                  : c
              ),
            }
          : l
      )

      // If kill: remove loser from board; if not: retrieve to hand
      const loserInstanceId = myWon ? action.theirInstanceId : theirWon ? action.myInstanceId : null
      const loserCard = myWon ? theirCard : theirWon ? myCard : null
      let newPlayers = state.players

      if (loserInstanceId && loserCard) {
        if (action.kill) {
          newLocations = newLocations.map(l =>
            l.id === locationId
              ? { ...l, cards: l.cards.filter(c => c.instanceId !== loserInstanceId) }
              : l
          )
          // A Great Person killed in play dies: on the timeline its owner chooses a successor.
          newPlayers = recordDeaths(state, newPlayers, gpDeaths([loserCard]))
          ;({ locations: newLocations, players: newPlayers } = dropLeaderlessFollowers(newLocations, newPlayers, gpDeaths([loserCard])))
          // Winning a fight earns no legacy by itself: each card has its own achievement.
        } else {
          // Retrieve to hand
          newLocations = newLocations.map(l =>
            l.id === locationId
              ? { ...l, cards: l.cards.filter(c => c.instanceId !== loserInstanceId) }
              : l
          )
          if (loserCard.type === 'gp') {
            newPlayers = newPlayers.map(p =>
              p.id === loserCard.playerId ? { ...p, gpHand: [...p.gpHand, loserCard.cardId] } : p
            )
          } else {
            const followerInDeck = state.followerDeck.find(f => f.id === loserCard.cardId)
              ?? { id: loserCard.cardId, name: 'Follower', stat: 'culture' as StatKey, bonus: 6, imageKey: 'artist' }
            newPlayers = newPlayers.map(p =>
              p.id === loserCard.playerId ? { ...p, followerHand: [...p.followerHand, followerInDeck] } : p
            )
          }
        }
      }

      const attackerName = getGPCard(myCard.cardId)?.figureName ?? 'Card'
      const defenderName = theirCard.type === 'gp' ? (getGPCard(theirCard.cardId)?.figureName ?? 'Card') : 'Follower'
      const resultMsg = myWon
        ? `${player.name}'s ${attackerName} won! (${myTotal} vs ${theirTotal})`
        : theirWon
        ? `${player.name}'s ${attackerName} lost! (${myTotal} vs ${theirTotal})`
        : `Draw! (${myTotal} vs ${theirTotal})`

      // Build combat summary
      const defenderPlayer = state.players.find(p => p.id === theirCard.playerId)
      const attackerBase = computeSide(loc.cards, player.id, player.name, stat, gpMap, followerMap, state.locations, loc.name, loc.era)
      const defenderBase = computeSide(loc.cards, theirCard.playerId, defenderPlayer?.name ?? 'Opponent', stat, gpMap, followerMap, state.locations, loc.name, loc.era)
      const attackerSide = { ...attackerBase, cards: [...attackerBase.cards, ...myLegacy.rows], total: attackerBase.total + myLegacy.total }
      const defenderSide = { ...defenderBase, cards: [...defenderBase.cards, ...theirLegacy.rows], total: defenderBase.total + theirLegacy.total }
      const combatSummary: CombatSummary = {
        kind: 'combat',
        locationName: loc.name,
        stat,
        attacker: attackerSide,
        defender: defenderSide,
        result: myWon ? 'attacker' : theirWon ? 'defender' : 'draw',
        kill: action.kill,
        locationAbility: locationAbilityText(loc.name, loc.era, stat),
      }

      const fought: GameState = {
        ...state,
        players: newPlayers,
        locations: newLocations,
        pendingSummary: combatSummary,
        log: [`Attack: ${attackerName} vs ${defenderName}. ${resultMsg}`, ...state.log.slice(0, 19)],
      }
      // Winning the fight, attacking or defending, earns a prize.
      const winnerId = myWon ? player.id : theirWon ? theirCard.playerId : null
      const events: AchievementEvent[] = [{
        kind: 'fight', locId: loc.id, stat, kill: action.kill, attacker: myCard, defender: theirCard,
        result: myWon ? 'attacker' : theirWon ? 'defender' : 'draw', before: loc.cards,
      }]
      if (action.kill && loserCard?.type === 'gp') events.push({ kind: 'death', locId: loc.id, playerId: loserCard.playerId, cardId: loserCard.cardId, killerId: loserCard.playerId === player.id ? theirCard.playerId : player.id })
      const reported = emit(fought, ...events)
      return winnerId ? grantReward(reported, winnerId, 1, `${myWon ? 'won the attack' : 'held off an attack'} at ${loc.name}`) : reported
    }

    case 'TOGGLE_VISIBILITY': {
      const player = currentPlayer
      if (state.turnActions.actedCards.includes(`vis-${action.instanceId}`)) return state

      const newLocations = state.locations.map(loc => ({
        ...loc,
        cards: loc.cards.map(c =>
          c.instanceId === action.instanceId && c.playerId === player.id && !c.justDeployed
            ? { ...c, isPublic: !c.isPublic }
            : c
        ),
      }))

      return {
        ...state,
        locations: newLocations,
        turnActions: { ...state.turnActions, actedCards: [...state.turnActions.actedCards, `vis-${action.instanceId}`] },
        log: [`${player.name} toggled card visibility.`, ...state.log.slice(0, 19)],
      }
    }

    case 'END_TURN': {
      // Clear justDeployed flags
      const clearedLocations = state.locations.map(loc => ({
        ...loc,
        cards: loc.cards.map(c => ({ ...c, justDeployed: false })),
      }))

      const numPlayers = state.players.length
      const nextIdx = (state.currentPlayerIdx + 1) % numPlayers
      const isNewRound = nextIdx === 0

      let newRound = state.round
      let newGlobalComp = state.globalCompetitionActive
      let newLocations = clearedLocations
      let newPlayers = state.players
      let newEventDeck = state.eventDeck
      let newFollowerDeck = state.followerDeck
      let newGpDeck = state.gpDeck
      let newYear = state.year
      const logEntries: string[] = []

      // Every contest resolved at the end of the round gets its own report, in order.
      const roundSummaries: GameSummary[] = []
      const roundRewards: PendingReward[] = []
      const roundEvents: AchievementEvent[] = []
      const idOf = (name: string) => newPlayers.find(p => p.name === name)?.id ?? name

      if (isNewRound) {
        newRound = state.round + 1

        // Resolve global competition
        if (newGlobalComp) {
          const { gpMap } = buildLookups(state)
          const stat = newGlobalComp.stat!
          const compResults: EventPlayerResult[] = []
          let bestTotal = -1
          let bestPlayerId = ''
          for (const p of newPlayers) {
            let total = 0
            const cards: CardContrib[] = []
            for (const loc of newLocations) {
              for (const oc of loc.cards) {
                if (oc.playerId === p.id && oc.type === 'gp' && oc.isPublic) {
                  const gp = gpMap[oc.cardId]
                  if (gp) { total += gp[stat]; cards.push({ type: 'gp', name: gp.figureName, portraitUrl: gp.portraitUrl, baseStat: gp[stat], traitBonus: 0, followerBonus: 0, locationBonus: 0 }) }
                }
              }
            }
            const legacy = legacyContest(state, p.id, stat, 'competition')
            total += legacy.total
            cards.push(...legacy.rows)
            compResults.push({ playerName: p.name, total, threshold: 0, survived: true, cards })
            if (total > bestTotal) { bestTotal = total; bestPlayerId = p.id }
          }
          compResults.sort((a, b) => b.total - a.total)
          const winnerName = newPlayers.find(p => p.id === bestPlayerId)?.name
          if (bestPlayerId) {
            logEntries.push(`Global competition resolved! Winner: ${winnerName} (${STAT_LABELS[stat]}: ${bestTotal})`)
            roundRewards.push({ playerId: bestPlayerId, size: 2, reason: `won the global competition in ${STAT_LABELS[stat]}` })
            roundEvents.push({ kind: 'competition', winnerId: bestPlayerId, stat })
          }
          roundSummaries.push({
            kind: 'event',
            eventName: newGlobalComp.name,
            eventType: 'global_competition',
            stat,
            locationName: 'All Locations',
            threshold: 0,
            results: compResults,
            winnerName,
          })
          newGlobalComp = null
        }

        // Resolve local survival and hazard events
        const eliminated: OnboardCard[] = []
        newLocations = newLocations.map(loc => {
          if (!loc.activeEvent) return loc
          let event = loc.activeEvent
          let updatedCards = [...loc.cards]
          const { gpMap, followerMap } = buildLookups({ ...state, locations: newLocations })
          const playerGroups = Array.from(new Set(updatedCards.map(c => c.playerId)))
          const involvedPlayers = playerGroups.filter(pid =>
            updatedCards.some(c => c.playerId === pid)
          )

          if (event.type === 'local_survival' && involvedPlayers.length > 0) {
            const stat = event.stat ?? null
            const threshold = 5
            const results: EventPlayerResult[] = []

            for (const pid of involvedPlayers) {
              const pName = newPlayers.find(p => p.id === pid)?.name ?? pid
              const base = computeEventSide(updatedCards, pid, pName, stat, threshold, gpMap, followerMap, state.locations)
              const legacy = legacyContest(state, pid, stat, 'survival', updatedCards, followerMap)
              const total = base.total + legacy.total
              const result = { ...base, total, survived: total >= threshold, cards: [...base.cards, ...legacy.rows] }
              results.push(result)
              if (!result.survived) {
                eliminated.push(...updatedCards.filter(c => c.playerId === pid))
                for (const c of updatedCards) if (c.playerId === pid && c.type === 'gp') roundEvents.push({ kind: 'death', locId: loc.id, playerId: pid, cardId: c.cardId })
                updatedCards = updatedCards.filter(c => c.playerId !== pid)
                logEntries.push(`Local survival: ${pName}'s cards in ${loc.name} discarded`)
              }
            }

            if (results.length > 0) {
              roundSummaries.push({
                kind: 'event', eventName: event.name, eventType: event.type,
                stat: stat ?? undefined, locationName: loc.name, threshold, results,
              })
              roundEvents.push({ kind: 'survival', locId: loc.id, eventName: event.name, hazard: false, stat, threshold, before: loc.cards,
                results: results.map(r => ({ playerId: idOf(r.playerName), total: r.total, survived: r.survived })) })
            }
            // Surviving is winning: every player who comes through takes the
            // prize, once per survival however many years it lasts.
            const rewarded = new Set(event.rewarded ?? [])
            for (const pid of involvedPlayers) {
              const name = newPlayers.find(p => p.id === pid)?.name
              if (rewarded.has(pid) || !results.find(r => r.playerName === name)?.survived) continue
              roundRewards.push({ playerId: pid, size: 1, reason: `won the survival at ${loc.name}` })
              rewarded.add(pid)
            }
            event = { ...event, rewarded: [...rewarded] }
          }

          if (event.type === 'natural_hazard' && involvedPlayers.length > 0) {
            const HAZARD_MIN = 5
            const results: EventPlayerResult[] = []

            for (const pid of involvedPlayers) {
              const pName = newPlayers.find(p => p.id === pid)?.name ?? pid
              const cards: CardContrib[] = []

              // Accumulate each stat across all GPs and matching followers
              const statTotals: Record<StatKey, number> = {
                politics: 0, strength: 0, culture: 0, wealth: 0,
                intelligence: 0, technique: 0, belief: 0, reputation: 0,
              }
              for (const oc of updatedCards) {
                if (oc.playerId !== pid) continue
                if (oc.type === 'gp') {
                  const gp = gpMap[oc.cardId]
                  if (!gp) continue
                  for (const s of STATS) statTotals[s] += gp[s]
                  cards.push({ type: 'gp', name: gp.figureName, portraitUrl: gp.portraitUrl, baseStat: 0, traitBonus: 0, followerBonus: 0, locationBonus: 0 })
                } else {
                  const f = followerMap[oc.cardId]
                  if (!f) continue
                  const hasIdentityMatch = updatedCards.some(
                    lc => lc.playerId === pid && lc.type === 'gp' && gpMap[lc.cardId]?.identities?.includes(f.name)
                  )
                  const bonus = hasIdentityMatch ? FOLLOWER_IDENTITY_MATCH_BONUS : f.bonus
                  statTotals[f.stat as StatKey] += bonus
                  cards.push({ type: 'follower', name: f.name, imageKey: f.imageKey, baseStat: 0, traitBonus: 0, followerBonus: bonus, locationBonus: 0 })
                }
              }

              const legacy = legacyContest(state, pid, null, 'survival', updatedCards, followerMap)
              const shield = hasHazardShield(state, pid)
              if (shield) cards.push({ type: 'legacy', name: `${shield} (legacy): immune to hazards`, baseStat: 0, traitBonus: 0, followerBonus: 0, locationBonus: 0 })
              cards.push(...legacy.rows)
              const minStatTotal = Math.min(...STATS.map(s => statTotals[s])) + legacy.total
              const survived = !!shield || minStatTotal >= HAZARD_MIN
              results.push({ playerName: pName, total: minStatTotal, threshold: HAZARD_MIN, survived, cards })

              if (!survived) {
                eliminated.push(...updatedCards.filter(c => c.playerId === pid))
                for (const c of updatedCards) if (c.playerId === pid && c.type === 'gp') roundEvents.push({ kind: 'death', locId: loc.id, playerId: pid, cardId: c.cardId })
                updatedCards = updatedCards.filter(c => c.playerId !== pid)
                logEntries.push(`Natural hazard: ${pName}'s cards in ${loc.name} discarded`)
              }
            }

            if (results.length > 0) {
              roundSummaries.push({
                kind: 'event', eventName: event.name, eventType: event.type,
                locationName: loc.name, threshold: HAZARD_MIN, results,
              })
              roundEvents.push({ kind: 'survival', locId: loc.id, eventName: event.name, hazard: true, stat: null, threshold: HAZARD_MIN, before: loc.cards,
                results: results.map(r => ({ playerId: idOf(r.playerName), total: r.total, survived: r.survived })) })
            }
          }

          const newRoundsLeft = loc.eventRoundsLeft > 0 ? loc.eventRoundsLeft - 1 : 0
          return {
            ...loc,
            cards: updatedCards,
            activeEvent: newRoundsLeft === 0 ? null : event,
            eventRoundsLeft: newRoundsLeft,
          }
        })

        // Great People lost to survivals and hazards die.
        newPlayers = recordDeaths(state, newPlayers, gpDeaths(eliminated))
        ;({ locations: newLocations, players: newPlayers } = dropLeaderlessFollowers(newLocations, newPlayers, gpDeaths(eliminated)))

        // Now and then the whole world competes without anyone calling it.
        if (state.setup.timeline && !state.setup.noHazards && !newGlobalComp && Math.random() < GLOBAL_COMPETITION_CHANCE) {
          const stat = STATS[Math.floor(Math.random() * STATS.length)]
          newGlobalComp = { ...makeEventCard(stat, 'global_competition', `world-${stat}-${uid()}`), origin: 'city' }
          logEntries.push(`A global competition in ${STAT_LABELS[stat]} breaks out: it is decided at the end of this year, on public Great People only.`)
        }

        // A new year: on the timeline people age, die and are born, and empty
        // cities may fall into a random state (also in timeless games unless
        // random states are off, as in the Epic lessons).
        if (state.setup.timeline) {
          const ticked = advanceYear({ ...state, players: newPlayers, locations: newLocations, eventDeck: newEventDeck, followerDeck: newFollowerDeck })
          newPlayers = ticked.state.players
          newLocations = ticked.state.locations
          newEventDeck = ticked.state.eventDeck
          newFollowerDeck = ticked.state.followerDeck
          logEntries.push(...ticked.lines)
          newYear = ticked.state.year
          roundEvents.push(...(ticked.state.achievementEvents ?? []).slice((state.achievementEvents ?? []).length))
        } else if (!state.setup.noHazards) {
          const rolled = rollCityStates(newLocations)
          newLocations = rolled.locations
          logEntries.push(...rolled.lines)
        }
      }

      const winner = checkWinCondition({ ...state, players: newPlayers, locations: newLocations })

      return {
        ...state,
        players: newPlayers,
        locations: newLocations,
        currentPlayerIdx: nextIdx,
        round: newRound,
        year: newYear,
        turnActions: freshTurnActions(),
        globalCompetitionActive: newGlobalComp,
        gpDeck: newGpDeck,
        eventDeck: newEventDeck,
        followerDeck: newFollowerDeck,
        winner,
        phase: winner ? 'ended' : 'playing',
        pendingSummary: roundSummaries[0] ?? null,
        summaryQueue: roundSummaries.slice(1),
        pendingRewards: [...(state.pendingRewards ?? []), ...roundRewards],
        achievementEvents: [
          ...(state.achievementEvents ?? []),
          { kind: 'turn', playerId: state.players[state.currentPlayerIdx].id, actions: state.turnActions },
          ...roundEvents,
          ...(isNewRound ? [{ kind: 'round' } as AchievementEvent] : []),
        ],
        roundActed: isNewRound ? [] : state.roundActed,
        log: [...logEntries, `${state.setup.timeline ? formatYear(newYear) : `Round ${newRound}`}: ${state.players[nextIdx].name}'s turn.`, ...state.log].slice(0, 20),
      }
    }

    case 'DISMISS_SUMMARY': {
      const [next, ...rest] = state.summaryQueue ?? []
      return { ...state, pendingSummary: next ?? null, summaryQueue: rest }
    }

    case 'GLOBAL_COMP_REWARD': {
      const { playerId, rewardType } = action
      const playerIdx = state.players.findIndex(p => p.id === playerId)
      if (playerIdx === -1) return state

      let newGpDeck = [...state.gpDeck]
      let newEventDeck = [...state.eventDeck]
      let newFollowerDeck = [...state.followerDeck]
      let newPlayers = state.players

      if (rewardType === 'gp' && state.setup.timeline) {
        // Great Person slots come only from legacies: no prize on the timeline.
        return state
      } else if (rewardType === 'gp') {
        const card = newGpDeck.shift()
        if (card) {
          newPlayers = newPlayers.map((p, i) =>
            i === playerIdx ? { ...p, gpHand: [...p.gpHand, card] } : p
          )
        }
      } else if (rewardType === 'events') {
        const cards = newEventDeck.splice(0, 2)
        newPlayers = newPlayers.map((p, i) =>
          i === playerIdx ? { ...p, eventHand: [...p.eventHand, ...cards] } : p
        )
      } else if (rewardType === 'followers') {
        const cards = newFollowerDeck.splice(0, 4)
        newPlayers = newPlayers.map((p, i) =>
          i === playerIdx ? { ...p, followerHand: [...p.followerHand, ...cards] } : p
        )
      }

      return {
        ...state,
        players: newPlayers,
        gpDeck: newGpDeck,
        eventDeck: newEventDeck,
        followerDeck: newFollowerDeck,
        log: [`${state.players[playerIdx].name} chose reward: ${rewardType}.`, ...state.log.slice(0, 19)],
      }
    }

    case 'END_SCENARIO': {
      const playerIdx = state.currentPlayerIdx
      const player = state.players[playerIdx]
      const actionKey = `end-scenario-${action.locationId}`
      if (state.turnActions.actedCards.includes(actionKey)) return state

      const loc = state.locations.find(l => l.id === action.locationId)
      if (!loc?.activeEvent) return state
      if (loc.activeEvent.type === 'global_competition') return state // can't manually end global
      if (loc.activeEvent.type === 'natural_hazard') return state // natural hazards resolve automatically

      const hasGPHere = loc.cards.some(c => c.type === 'gp' && c.playerId === player.id && !c.justDeployed)
      if (!hasGPHere) return state

      const eventName = loc.activeEvent.name
      const newLocations = state.locations.map(l =>
        l.id === action.locationId ? { ...l, activeEvent: null, eventRoundsLeft: 0 } : l
      )

      return {
        ...state,
        locations: newLocations,
        turnActions: { ...state.turnActions, actedCards: [...state.turnActions.actedCards, actionKey] },
        log: [`${player.name} ended scenario: ${eventName}.`, ...state.log.slice(0, 19)],
      }
    }

    case 'RETIRE_GP': {
      if (!state.setup.timeline) return state
      const playerIdx = state.currentPlayerIdx
      const player = state.players[playerIdx]
      const status = lifeStatus(state, player.id, action.cardId)
      const onBoard = state.locations.some(l => l.cards.some(c => c.type === 'gp' && c.playerId === player.id && c.cardId === action.cardId))
      const inHand = player.gpHand.includes(action.cardId)
      if (!onBoard && !(inHand && (status === 'active' || status === 'youth'))) return state
      const card = getGPCard(action.cardId)
      return {
        ...state,
        locations: state.locations.map(l => ({ ...l, cards: l.cards.filter(c => !(c.type === 'gp' && c.playerId === player.id && c.cardId === action.cardId)) })),
        players: state.players.map((p, i) =>
          i === playerIdx ? { ...p, gpHand: p.gpHand.filter(id => id !== action.cardId), retired: [...p.retired, action.cardId] } : p
        ),
        log: [`${player.name} retired ${card?.figureName ?? 'a Great Person'}; a successor follows at their death in ${formatYear(card ? deathYear(card, player) : state.year)}.`, ...state.log.slice(0, 19)],
      }
    }

    case 'CHOOSE_REWARD':
      return takeReward(state, action.playerId, action.pick)

    case 'CHOOSE_SUCCESSOR': {
      const playerIdx = state.players.findIndex(p => p.id === action.playerId)
      const player = state.players[playerIdx]
      if (!player || !player.pendingSuccessors.length) return state
      if (!successorOptions(state, player.id).includes(action.cardId)) return state
      const pending = player.pendingSuccessors[0]
      const card = getGPCard(action.cardId)
      return {
        ...state,
        players: state.players.map((p, i) =>
          i === playerIdx ? { ...p, gpHand: [...p.gpHand, action.cardId], pendingSuccessors: p.pendingSuccessors.slice(1) } : p
        ),
        log: [card ? choiceLine(player.name, card.id, pending) : `${player.name} chose a successor.`, ...state.log.slice(0, 19)],
      }
    }

    case 'SET_LEGACY': {
      const playerIdx = state.currentPlayerIdx
      const player = state.players[playerIdx]
      if (state.turnActions.legacyChanged || !player.legacies.includes(action.cardId)) return state
      const isActive = player.activeLegacies.includes(action.cardId)
      if (action.active === isActive) return state
      if (action.active && player.activeLegacies.length >= LEGACY_SLOTS) return state
      const activeLegacies = action.active
        ? [...player.activeLegacies, action.cardId]
        : player.activeLegacies.filter(id => id !== action.cardId)
      const name = getGPCard(action.cardId)?.legacy.name ?? 'legacy'
      return {
        ...state,
        players: state.players.map((p, i) => (i === playerIdx ? { ...p, activeLegacies } : p)),
        turnActions: { ...state.turnActions, legacyChanged: true },
        log: [`${player.name} ${action.active ? 'took up' : 'set aside'} the legacy ${name}.`, ...state.log.slice(0, 19)],
      }
    }

    default:
      return state
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
