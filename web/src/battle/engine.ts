// The battle ("fight") engine: card data, decks, scoring, game setup and the
// reducer.  Pure TypeScript with no React, so the Battle tab, the fight
// lessons at the end of every Epic story and the tests all drive the same
// rules.  The board UI lives in ./BattleGame.tsx.

import type {
  Card, FollowerCard, EventCard, OnboardCard, LocationState,
  PlayerState, GameState, GameSetup,
  StatKey, EventType, EraMode,
  CardContrib, CombatSide, CombatSummary, EventPlayerResult, GameSummary,
} from '@/types'
import cardsJson from '@/data/cards.json'
import locationsJson from '@/data/locations.json'
import locationCardsJson from '@/data/location_cards.json'
import followersJson from '@/data/followers.json'
import { portraitUrl } from '@/data/images'

// ─── Static Card Data ─────────────────────────────────────────────────────────

export const ALL_GP_CARDS: Card[] = cardsJson.map(c => ({
  ...c,
  portraitUrl: portraitUrl(c.portraitKey),
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

export const NUM_LOCATIONS = 7
/** A follower whose identity matches an allied GP at its location adds this instead of its own bonus. */
export const FOLLOWER_IDENTITY_MATCH_BONUS = 4

export function pickLocations(eraMode: EraMode, singleEra?: string): LocationTemplate[] {
  if (eraMode === 'single' && singleEra) {
    const pool = LOCATION_POOL.filter(l => l.era === singleEra)
    return shuffle(pool).slice(0, NUM_LOCATIONS)
  }
  // All-era: guarantee 1 location per era, then fill remaining slots randomly
  const guaranteed: LocationTemplate[] = []
  const extras: LocationTemplate[] = []
  for (const era of ERAS) {
    const pool = shuffle(LOCATION_POOL.filter(l => l.era === era))
    if (pool.length > 0) {
      guaranteed.push(pool[0])
      extras.push(...pool.slice(1))
    }
  }
  const combined = [...guaranteed, ...shuffle(extras)]
  return combined.slice(0, NUM_LOCATIONS)
}

export function getGPCard(id: string): Card | undefined {
  return ALL_GP_CARDS.find(c => c.id === id)
}

// ─── Achievement specs: which stat + how many wins to earn a point ────────────

export interface AchievementSpec { stat: StatKey; threshold: number }

export const ACHIEVEMENT_SPECS: Record<string, AchievementSpec> = {
  'Mohandas Gandhi':      { stat: 'belief',        threshold: 1 },
  'Coco Chanel':          { stat: 'culture',        threshold: 1 },
  'Mao Zedong':           { stat: 'politics',       threshold: 1 },
  'Belisarius':           { stat: 'strength',       threshold: 1 },
  'Imhotep':              { stat: 'technique',      threshold: 1 },
  'Lu Yu':                { stat: 'culture',        threshold: 1 },
  'Alan Turing':          { stat: 'intelligence',   threshold: 1 },
  'Andrew Mellon':        { stat: 'wealth',         threshold: 1 },
  'Audrey Hepburn':       { stat: 'reputation',     threshold: 1 },
  'Clara Schumann':       { stat: 'culture',        threshold: 1 },
  'Euclid':               { stat: 'intelligence',   threshold: 1 },
  'Hua Mulan':            { stat: 'strength',       threshold: 1 },
  'Johannes Brahms':      { stat: 'culture',        threshold: 1 },
  'Lancelot':             { stat: 'strength',       threshold: 1 },
  'Li Qingzhao':          { stat: 'culture',        threshold: 1 },
  'Marie Antoinette':     { stat: 'wealth',         threshold: 1 },
  'Miyamoto Musashi':     { stat: 'strength',       threshold: 1 },
  'Sargon I':             { stat: 'politics',       threshold: 1 },
  'Gilgamesh':            { stat: 'strength',       threshold: 1 },
  'Enkidu':               { stat: 'strength',       threshold: 1 },
  'Pericles':             { stat: 'politics',       threshold: 1 },
  'Aspasia':              { stat: 'intelligence',   threshold: 1 },
  'Pleistoanax':          { stat: 'politics',       threshold: 1 },
  'Cicero':               { stat: 'politics',       threshold: 1 },
  'Anaxagoras':           { stat: 'intelligence',   threshold: 1 },
  'Zeno of Elea':         { stat: 'intelligence',   threshold: 1 },
  'Al-Khwarizmi':         { stat: 'technique',      threshold: 1 },
  'Mani':                 { stat: 'belief',         threshold: 1 },
  'Titian':               { stat: 'culture',        threshold: 1 },
  'Magellan':             { stat: 'technique',      threshold: 1 },
  'Mother Teresa':        { stat: 'belief',         threshold: 1 },
  'Carl Linnaeus':        { stat: 'intelligence',   threshold: 1 },
  'Robert Schumann':      { stat: 'culture',        threshold: 1 },
  'Hendrik Lorentz':      { stat: 'intelligence',   threshold: 1 },
  'Amelia Earhart':       { stat: 'technique',      threshold: 1 },
  'Sergei Eisenstein':    { stat: 'culture',        threshold: 1 },
  'Edmund Hillary':       { stat: 'strength',       threshold: 1 },
  'Tenzing Norgay':       { stat: 'strength',       threshold: 1 },
  'Itō Hirobumi':         { stat: 'politics',       threshold: 1 },
  'Michael Jackson':      { stat: 'culture',        threshold: 1 },
  'George Bernard Shaw':  { stat: 'culture',        threshold: 1 },
  'Gregory Peck':         { stat: 'belief',         threshold: 1 },
  'Isabel I of Castile':  { stat: 'belief',         threshold: 1 },
  'Manuel I of Portugal': { stat: 'wealth',         threshold: 1 },
  'An Jung-geun':         { stat: 'strength',       threshold: 1 },
  'Gregor Mendel':        { stat: 'intelligence',   threshold: 1 },
  'Louis XVI':            { stat: 'politics',       threshold: 1 },
}

export function getAchievementThreshold(figureName: string): number {
  return ACHIEVEMENT_SPECS[figureName]?.threshold ?? 3
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

export function initGame(setup: GameSetup): GameState {
  const gpDeck = shuffle(gpPool(setup.eraMode, setup.singleEra).map(c => c.id))
  const eventDeck = makeEventDeck()
  const followerDeck = makeFollowerDeck()

  const allPlayerNames: string[] = [
    ...setup.playerNames,
    ...(setup.playerMode === 'pvc'
      ? Array.from({ length: setup.numComputers }, (_, i) => `CPU ${i + 1}`)
      : []),
  ]

  // An era has only 10-15 Great People, so a full single-era table deals
  // smaller, equal hands rather than leaving later players short.
  const handSize = Math.min(STARTING_GP_HAND, Math.floor(gpDeck.length / Math.max(1, allPlayerNames.length)))
  let deckCursor = 0
  const players: PlayerState[] = allPlayerNames.map((name, i) => {
    const gpHand = gpDeck.slice(deckCursor, deckCursor + handSize)
    deckCursor += handSize
    const eventHand = eventDeck.splice(0, 2)
    const followerHand = followerDeck.splice(0, 8)
    return {
      id: `player-${i}`,
      name,
      isComputer: setup.playerMode === 'pvc' && i >= setup.playerNames.length,
      gpHand,
      eventHand,
      followerHand,
      archive: [],
      winningPoints: 0,
    }
  })

  const remainingGP = gpDeck.slice(deckCursor)
  const locationTemplates = pickLocations(setup.eraMode, setup.singleEra)

  const locations: LocationState[] = locationTemplates.map((lt, i) => ({
    id: `loc-${i}`,
    name: lt.name,
    era: lt.era,
    imageKey: lt.imageKey,
    countries: lt.countries,
    cards: [],
    activeEvent: null,
    eventRoundsLeft: 0,
  }))

  // Natural hazards: randomly place 1 at game start
  const hazardEventDeck = makeHazardDeck()
  if (hazardEventDeck.length > 0 && locations.length > 0) {
    const hazard = hazardEventDeck[0]
    const targetIdx = Math.floor(Math.random() * locations.length)
    locations[targetIdx].activeEvent = hazard
    locations[targetIdx].eventRoundsLeft = 1
  }

  return {
    setup,
    phase: 'playing',
    players,
    locations,
    currentPlayerIdx: 0,
    round: 1,
    turnActions: { deployedGP: false, addedFollower: false, movedCards: [], actedCards: [] },
    gpDeck: remainingGP,
    eventDeck,
    followerDeck,
    winner: null,
    log: ['Game started! Good luck to all players.'],
    globalCompetitionActive: null,
    pendingSummary: null,
  }
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
    { id: 'player-0', name: script.playerName ?? 'You', isComputer: false, archive: [], winningPoints: 0, ...hand(script.player) },
    { id: 'player-1', name: script.cpuName ?? 'Rival', isComputer: true, archive: [], winningPoints: 0, ...hand(script.cpu) },
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
    loc.eventRoundsLeft = e.kind === 'global_competition' ? 1 : 99
  }
  const globalCompetitionActive = locations.find(l => l.activeEvent?.type === 'global_competition')?.activeEvent ?? null

  const used = new Set([
    ...players.flatMap(p => p.gpHand),
    ...locations.flatMap(l => l.cards.filter(c => c.type === 'gp').map(c => c.cardId)),
  ])
  const gpDeck = script.gpDeck ?? shuffle(ALL_GP_CARDS.map(c => c.id).filter(id => !used.has(id)))

  const setup: GameSetup = {
    mode: 'scenario', matchType: 'pvc', playerMode: 'pvc', eraMode: 'all',
    playerNames: [players[0].name], numComputers: 1, noHazards: !script.hazards,
  }

  return {
    setup,
    phase: 'playing',
    players,
    locations,
    currentPlayerIdx: 0,
    round: 1,
    turnActions: { deployedGP: false, addedFollower: false, movedCards: [], actedCards: [] },
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

export function checkWinCondition(state: GameState): string | null {
  // 5 winning points
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

export function gameReducer(state: GameState, action: GameAction): GameState {
  const currentPlayer = state.players[state.currentPlayerIdx]

  switch (action.type) {
    case 'DEPLOY_GP': {
      if (state.turnActions.deployedGP) return state
      const playerIdx = state.currentPlayerIdx
      const player = state.players[playerIdx]
      if (!player.gpHand.includes(action.cardId)) return state

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
          ? { ...loc, activeEvent: eventCard, eventRoundsLeft: isGlobal ? 1 : 99 }
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

      // Find the card on board
      let found = false
      let gpName = ''
      const newLocations = state.locations.map(loc => ({
        ...loc,
        cards: loc.cards.map(c => {
          if (c.instanceId === action.instanceId && c.playerId === player.id && c.type === 'gp' && c.isPublic) {
            const figure = getGPCard(c.cardId)?.figureName ?? ''
            const threshold = getAchievementThreshold(figure)
            if (c.achievementTicks >= threshold) {
              found = true
              gpName = figure || 'Card'
              return { ...c, achievementTicks: 0 }
            }
          }
          return c
        }),
      }))

      if (!found) return state

      // Give player a new GP card from deck
      const newGpDeck = [...state.gpDeck]
      const newGpCard = newGpDeck.shift()
      const newPlayers = state.players.map((p, i) =>
        i === playerIdx
          ? { ...p, winningPoints: p.winningPoints + 1, gpHand: newGpCard ? [...p.gpHand, newGpCard] : p.gpHand }
          : p
      )

      const winner = checkWinCondition({ ...state, players: newPlayers })
      return {
        ...state,
        players: newPlayers,
        locations: newLocations,
        gpDeck: newGpDeck,
        winner,
        phase: winner ? 'ended' : 'playing',
        turnActions: { ...state.turnActions, actedCards: [...state.turnActions.actedCards, action.instanceId] },
        log: [`${player.name} claimed achievement with ${gpName}! +1 winning point.`, ...state.log.slice(0, 19)],
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

      const myTotal = computeLocationTotal(loc.cards, player.id, stat, gpMap, followerMap, state.locations, loc.name, loc.era)
      const theirTotal = computeLocationTotal(loc.cards, theirCard.playerId, stat, gpMap, followerMap, state.locations, loc.name, loc.era)

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
          // Achievement tick: awarded once when the winning GP defeats a worthy opponent
          // (opponent GP must have the achievement stat >= 5 to count as a meaningful victory)
          if (myWon && myCard.type === 'gp' && loserCard.type === 'gp') {
            const attackerGP = gpMap[myCard.cardId]
            const defenderGP = gpMap[loserCard.cardId]
            const achSpec = attackerGP ? ACHIEVEMENT_SPECS[attackerGP.figureName] : null
            const worthyOpponent = achSpec && defenderGP && defenderGP[achSpec.stat] >= 5
            if (achSpec?.stat === stat && worthyOpponent) {
              newLocations = newLocations.map(l => ({
                ...l,
                cards: l.cards.map(c =>
                  c.instanceId === action.myInstanceId
                    ? { ...c, achievementTicks: c.achievementTicks + 1 }
                    : c
                ),
              }))
            }
          }
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
      const attackerSide = computeSide(loc.cards, player.id, player.name, stat, gpMap, followerMap, state.locations, loc.name, loc.era)
      const defenderSide = computeSide(loc.cards, theirCard.playerId, defenderPlayer?.name ?? 'Opponent', stat, gpMap, followerMap, state.locations, loc.name, loc.era)
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

      return {
        ...state,
        players: newPlayers,
        locations: newLocations,
        pendingSummary: combatSummary,
        log: [`Attack: ${attackerName} vs ${defenderName}. ${resultMsg}`, ...state.log.slice(0, 19)],
      }
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
      const logEntries: string[] = []

      let roundSummary: GameSummary | null = null

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
            compResults.push({ playerName: p.name, total, threshold: 0, survived: true, cards })
            if (total > bestTotal) { bestTotal = total; bestPlayerId = p.id }
          }
          compResults.sort((a, b) => b.total - a.total)
          const winnerName = newPlayers.find(p => p.id === bestPlayerId)?.name
          if (bestPlayerId) logEntries.push(`Global competition resolved! Winner: ${winnerName} (${STAT_LABELS[stat]}: ${bestTotal})`)
          roundSummary = {
            kind: 'event',
            eventName: newGlobalComp.name,
            eventType: 'global_competition',
            stat,
            locationName: 'All Locations',
            threshold: 0,
            results: compResults,
            winnerName,
          }
          newGlobalComp = null
        }

        // Resolve local survival and hazard events
        newLocations = newLocations.map(loc => {
          if (!loc.activeEvent) return loc
          const event = loc.activeEvent
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
              const result = computeEventSide(updatedCards, pid, pName, stat, threshold, gpMap, followerMap, state.locations)
              results.push(result)
              if (!result.survived) {
                updatedCards = updatedCards.filter(c => c.playerId !== pid)
                logEntries.push(`Local survival: ${pName}'s cards in ${loc.name} discarded`)
              }
            }

            if (!roundSummary && results.length > 0) {
              roundSummary = {
                kind: 'event', eventName: event.name, eventType: event.type,
                stat: stat ?? undefined, locationName: loc.name, threshold, results,
              }
            }
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

              const minStatTotal = Math.min(...STATS.map(s => statTotals[s]))
              const survived = minStatTotal >= HAZARD_MIN
              results.push({ playerName: pName, total: minStatTotal, threshold: HAZARD_MIN, survived, cards })

              if (!survived) {
                updatedCards = updatedCards.filter(c => c.playerId !== pid)
                logEntries.push(`Natural hazard: ${pName}'s cards in ${loc.name} discarded`)
              }
            }

            if (!roundSummary && results.length > 0) {
              roundSummary = {
                kind: 'event', eventName: event.name, eventType: event.type,
                locationName: loc.name, threshold: HAZARD_MIN, results,
              }
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

        // Random natural hazard: 20% chance per new round
        if (!state.setup.noHazards && Math.random() < 0.2) {
          const hazardEvents = makeHazardDeck()
          if (hazardEvents.length > 0) {
            const hazard = hazardEvents[Math.floor(Math.random() * hazardEvents.length)]
            const eligibleLocs = newLocations.filter(l => l.cards.length > 0)
            if (eligibleLocs.length > 0) {
              const targetLoc = eligibleLocs.reduce((best, loc) => {
                const bestCount = best.cards.length
                const locCount = loc.cards.length
                return locCount > bestCount ? loc : best
              }, eligibleLocs[0])
              newLocations = newLocations.map(l =>
                l.id === targetLoc.id ? { ...l, activeEvent: hazard, eventRoundsLeft: 1 } : l
              )
              logEntries.push(`Natural hazard event: ${hazard.name} in ${targetLoc.name}!`)
            }
          }
        }
      }

      const winner = checkWinCondition({ ...state, players: newPlayers, locations: newLocations })

      return {
        ...state,
        players: newPlayers,
        locations: newLocations,
        currentPlayerIdx: nextIdx,
        round: newRound,
        turnActions: { deployedGP: false, addedFollower: false, movedCards: [], actedCards: [] },
        globalCompetitionActive: newGlobalComp,
        gpDeck: newGpDeck,
        eventDeck: newEventDeck,
        followerDeck: newFollowerDeck,
        winner,
        phase: winner ? 'ended' : 'playing',
        pendingSummary: roundSummary,
        log: [...logEntries, `Round ${newRound}: ${state.players[nextIdx].name}'s turn.`, ...state.log.slice(0, 19)],
      }
    }

    case 'DISMISS_SUMMARY':
      return { ...state, pendingSummary: null }

    case 'GLOBAL_COMP_REWARD': {
      const { playerId, rewardType } = action
      const playerIdx = state.players.findIndex(p => p.id === playerId)
      if (playerIdx === -1) return state

      let newGpDeck = [...state.gpDeck]
      let newEventDeck = [...state.eventDeck]
      let newFollowerDeck = [...state.followerDeck]
      let newPlayers = state.players

      if (rewardType === 'gp') {
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

    default:
      return state
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
