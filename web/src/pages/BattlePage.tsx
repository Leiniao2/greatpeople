import { useEffect, useCallback, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import type {
  Card, FollowerCard, EventCard, OnboardCard, LocationState,
  PlayerState, GameState, GameSetup,
  StatKey, EventType, EraMode, PlayerMode, MatchType,
  CardContrib, CombatSide, CombatSummary, EventPlayerResult, GameSummary,
} from '@/types'
import cardsJson from '@/data/cards.json'
import locationsJson from '@/data/locations.json'
import locationCardsJson from '@/data/location_cards.json'
import followersJson from '@/data/followers.json'

// ─── Static Card Data ─────────────────────────────────────────────────────────

const ALL_GP_CARDS: Card[] = (cardsJson as Card[]).map(c => ({
  ...c,
  portraitUrl: `/portraits/portrait_${c.portraitKey}.jpeg`,
}))

const FOLLOWER_TEMPLATES: Omit<FollowerCard, 'id'>[] = followersJson as Omit<FollowerCard, 'id'>[]

// IDs are "follower-<Name>-<n>" — look up template by name for deployed followers
const FOLLOWER_TMPL_BY_NAME: Record<string, Omit<FollowerCard, 'id'>> = {}
for (const t of FOLLOWER_TEMPLATES) FOLLOWER_TMPL_BY_NAME[t.name] = t
function followerFromId(id: string): FollowerCard | null {
  // strip "follower-" prefix and trailing "-<number>"
  const inner = id.replace(/^follower-/, '').replace(/-\d+$/, '')
  const tmpl = FOLLOWER_TMPL_BY_NAME[inner]
  return tmpl ? { ...tmpl, id } : null
}

function makeFollowerDeck(): FollowerCard[] {
  const deck: FollowerCard[] = []
  let counter = 0
  for (let copy = 0; copy < 3; copy++) {
    for (const t of FOLLOWER_TEMPLATES) {
      deck.push({ ...t, id: `follower-${t.name}-${counter++}` })
    }
  }
  return shuffle(deck)
}

const STATS: StatKey[] = ['politics', 'strength', 'culture', 'wealth', 'intelligence', 'technique', 'belief', 'reputation']
const STAT_LABELS: Record<StatKey, string> = {
  politics: 'Politics', strength: 'Strength', culture: 'Culture', wealth: 'Wealth',
  intelligence: 'Intelligence', technique: 'Technique', belief: 'Belief', reputation: 'Reputation',
}

const EVENT_NAMES: Record<StatKey, [string, string, string]> = {
  politics:     ['Coup',         'Terrorist Attack',      'International Conference'],
  strength:     ['Battlefield',  'Riot',                  'Olympics'],
  culture:      ['Art Critique', 'Censorship',            'Roadshow'],
  wealth:       ['Business War', 'Depression',            'Auction'],
  technique:    ['Tech Race',    'Sanctions',             'World Fair'],
  intelligence: ['Argument',     'Puzzle',                'Expedition'],
  belief:       ['Miracle',      'Inquisition',           'Pilgrimage'],
  reputation:   ['Lawsuit',      'Scandal',               'Celebration'],
}

const EVENT_TYPES: EventType[] = ['local_event', 'local_survival', 'global_competition']

const HAZARD_TYPES = ['Flood', 'Blizzard', 'Storm', 'Earthquake', 'Fire', 'Tsunami', 'Pandemic', 'Drought']

function makeEventDeck(): EventCard[] {
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

function makeHazardDeck(): EventCard[] {
  return HAZARD_TYPES.map((hz, i) => ({
    id: `event-hazard-${hz.toLowerCase()}-${i}`,
    name: `Natural Hazard: ${hz}`,
    type: 'natural_hazard' as const,
    hazardType: hz,
    description: `Natural hazard (${hz}): if a player's combined minimum stat at this location is below 5, all their cards here are discarded.`,
  }))
}

// ─── Location Data ────────────────────────────────────────────────────────────

interface LocationCardData {
  id: string; name: string; era: string
  bonuses: Partial<Record<StatKey, number>>
  trait?: string
}

const LOCATION_CARD_MAP: Record<string, LocationCardData> = {}
for (const lc of locationCardsJson as LocationCardData[]) {
  LOCATION_CARD_MAP[`${lc.era}-${lc.name}`] = lc
}

function locationFightBonus(locationName: string, locationEra: string, stat: StatKey): number {
  const card = LOCATION_CARD_MAP[`${locationEra}-${locationName}`]
  return (card?.bonuses as Record<string, number> | undefined)?.[stat] ?? 0
}

function locationAbilityText(locationName: string, locationEra: string, stat: StatKey): string | undefined {
  const card = LOCATION_CARD_MAP[`${locationEra}-${locationName}`]
  const amount = (card?.bonuses as Record<string, number> | undefined)?.[stat] ?? 0
  if (!amount || !card?.trait) return undefined
  const match = card.trait.match(/\*\*(.*?)\*\*/)
  const abilityName = match?.[1] ?? locationName
  return `${abilityName}: +${amount} ${stat} per GP`
}

interface LocationTemplate { name: string; era: string; imageKey?: string; countries?: string[] }

const LOCATION_POOL: LocationTemplate[] = locationsJson.locations
const ERAS: string[] = locationsJson.eras

const ERA_COLORS: Record<string, string> = {
  Ancient:     'bg-yellow-900/60 border-yellow-700/40',
  Medieval:    'bg-orange-900/60 border-orange-700/40',
  Renaissance: 'bg-purple-900/60 border-purple-700/40',
  Steam:       'bg-slate-800/60 border-slate-600/40',
  Electricity: 'bg-blue-900/60 border-blue-700/40',
  Information: 'bg-cyan-900/60 border-cyan-700/40',
  Classical:   'bg-amber-900/60 border-amber-700/40',
}

const ERA_TEXT: Record<string, string> = {
  Ancient:     'text-yellow-400',
  Medieval:    'text-orange-400',
  Renaissance: 'text-purple-400',
  Steam:       'text-slate-300',
  Electricity: 'text-blue-400',
  Information: 'text-cyan-400',
  Classical:   'text-amber-400',
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9)
}

const NUM_LOCATIONS = 7

function pickLocations(eraMode: EraMode, singleEra?: string): LocationTemplate[] {
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

function getGPCard(id: string): Card | undefined {
  return ALL_GP_CARDS.find(c => c.id === id)
}

// ─── Achievement specs: which stat + how many wins to earn a point ────────────

interface AchievementSpec { stat: StatKey; threshold: number }

const ACHIEVEMENT_SPECS: Record<string, AchievementSpec> = {
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

function getAchievementThreshold(figureName: string): number {
  return ACHIEVEMENT_SPECS[figureName]?.threshold ?? 3
}

// ─── Trait bonuses: per-GP stat modifier based on board state ─────────────────

function traitBonusForGP(
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

function computeLocationTotal(
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
        total += hasIdentityMatch ? 3 : f.bonus
      }
    }
  }
  return total
}

function computeSide(
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
      const followerBonus = f.stat === stat ? (hasIdentityMatch ? 3 : f.bonus) : 0
      cards.push({ type: 'follower', name: f.name, imageKey: f.imageKey, baseStat: 0, traitBonus: 0, followerBonus, locationBonus: 0 })
      total += followerBonus
    }
  }
  return { playerName, cards, total }
}

function computeEventSide(
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
        ? (f.stat === stat ? (hasIdentityMatch ? 3 : f.bonus) : 0)
        : (hasIdentityMatch ? 3 : f.bonus)
      cards.push({ type: 'follower', name: f.name, imageKey: f.imageKey, baseStat: 0, traitBonus: 0, followerBonus, locationBonus: 0 })
      total += followerBonus
    }
  }
  return { playerName, total, threshold, survived: total >= threshold, cards }
}

// ─── Game Initialization ──────────────────────────────────────────────────────

function initGame(setup: GameSetup): GameState {
  const gpDeck = shuffle(ALL_GP_CARDS.map(c => c.id))
  const eventDeck = makeEventDeck()
  const followerDeck = makeFollowerDeck()

  const allPlayerNames: string[] = [
    ...setup.playerNames,
    ...(setup.playerMode === 'pvc'
      ? Array.from({ length: setup.numComputers }, (_, i) => `CPU ${i + 1}`)
      : []),
  ]

  let deckCursor = 0
  const players: PlayerState[] = allPlayerNames.map((name, i) => {
    const gpHand = gpDeck.slice(deckCursor, deckCursor + 4)
    deckCursor += 4
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

// ─── Reducer ──────────────────────────────────────────────────────────────────

type GameAction =
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

function buildLookups(state: GameState) {
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

function checkWinCondition(state: GameState): string | null {
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

function gameReducer(state: GameState, action: GameAction): GameState {
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
                  const bonus = hasIdentityMatch ? 3 : f.bonus
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
        if (Math.random() < 0.2) {
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

interface CompactCardProps {
  card: OnboardCard
  isCurrentPlayer: boolean
  isSelected: boolean
  onClick: () => void
  onInfo?: (card: Card, ticks?: number) => void
  gpMap: Record<string, Card>
  followerTemplates: Record<string, FollowerCard>
}

function CompactCard({ card, isCurrentPlayer, isSelected, onClick, onInfo, gpMap, followerTemplates }: CompactCardProps) {
  const gp = card.type === 'gp' ? gpMap[card.cardId] : null
  const follower = card.type === 'follower' ? followerTemplates[card.cardId] : null

  const isPrivate = !card.isPublic && !isCurrentPlayer
  const era = gp?.era ?? 'Electricity'
  const eraColor = ERA_COLORS[era] ?? ERA_COLORS.Electricity

  const borderCls = isSelected
    ? 'border-2 border-amber-400 shadow-lg shadow-amber-400/30'
    : isCurrentPlayer
    ? 'border border-amber-500/40'
    : 'border border-indigo-500/30'

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col rounded-lg overflow-hidden w-14 h-20 transition-all duration-150
        ${isPrivate ? 'bg-slate-900 border-slate-700/50' : eraColor} ${borderCls}
        ${isSelected ? 'scale-105' : 'hover:scale-[1.03]'}`}
    >
      {card.justDeployed && (
        <span className="absolute top-0.5 right-0.5 z-10 w-2 h-2 rounded-full bg-amber-400 border border-black" />
      )}
      {card.achievementTicks > 0 && (() => {
        const threshold = gp ? getAchievementThreshold(gp.figureName) : 3
        const ready = card.achievementTicks >= threshold
        return (
          <span className={`absolute top-0.5 left-0.5 z-10 text-[7px] font-bold rounded px-0.5 ${ready ? 'bg-amber-400 text-slate-950' : 'bg-black/60 text-amber-300'}`}>
            {card.achievementTicks}/{threshold}
          </span>
        )
      })()}

      {isPrivate ? (
        <div className="flex-1 w-full relative overflow-hidden">
          <img
            src={card.type === 'follower' ? '/card-backs/follower.jpeg' : '/card-backs/gp.jpeg'}
            alt="face down"
            className="w-full h-full object-cover object-center"
          />
        </div>
      ) : gp ? (
        <>
          <div className="flex-1 w-full relative overflow-hidden">
            <img
              src={gp.portraitUrl}
              alt={gp.figureName}
              className="w-full h-full object-cover object-top"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            {onInfo && (
              <div
                role="button"
                onClick={e => { e.stopPropagation(); onInfo(gp, card.achievementTicks) }}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center text-[8px] text-white/80 cursor-pointer z-10 hover:bg-black/90"
              >i</div>
            )}
          </div>
          <div className="w-full bg-black/75 px-0.5 py-0.5 shrink-0">
            <span className="text-[7px] text-white leading-none truncate block">{gp.figureName.split(' ').pop()}</span>
            {gp.countries && gp.countries.length > 0 && (
              <span className="text-[6px] text-cyan-400/70 leading-none truncate block">{gp.countries[0]}</span>
            )}
          </div>
        </>
      ) : follower ? (
        <>
          <div className="flex-1 w-full relative overflow-hidden bg-indigo-950">
            <img
              src={`/followers/${follower.imageKey}.jpeg`}
              alt={follower.name}
              className="w-full h-full object-cover object-center"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
          <div className="w-full bg-black/80 px-0.5 py-0.5 shrink-0">
            <span className="text-[7px] text-indigo-200 leading-none truncate block">{follower.name}</span>
            <span className="text-[6px] text-indigo-400">+3 {STAT_LABELS[follower.stat].slice(0, 3)}</span>
          </div>
        </>
      ) : null}

      {!isPrivate && !card.isPublic && gp && (
        <span className="absolute bottom-4 left-0.5 text-[6px] text-slate-400 bg-black/50 rounded px-0.5">priv</span>
      )}
    </button>
  )
}

interface HandCardProps {
  cardId: string
  type: 'gp' | 'event' | 'follower'
  isSelected: boolean
  onClick: () => void
  onInfo?: (card: Card) => void
  gpMap: Record<string, Card>
  eventCard?: EventCard
  followerCard?: FollowerCard
}

function HandCard({ cardId, type, isSelected, onClick, onInfo, gpMap, eventCard, followerCard }: HandCardProps) {
  const gp = type === 'gp' ? gpMap[cardId] : null
  const era = gp?.era ?? 'Steam'
  const eraColor = ERA_COLORS[era] ?? ERA_COLORS.Steam
  const borderCls = isSelected ? 'border-2 border-amber-400 ring-2 ring-amber-400/30' : 'border border-white/10'

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col rounded-xl overflow-hidden w-18 h-28 transition-all duration-150 shrink-0
        ${eraColor} ${borderCls} ${isSelected ? 'scale-105' : 'hover:scale-[1.03]'}`}
      style={{ width: '4.5rem', height: '6.5rem' }}
    >
      {type === 'gp' && gp && (
        <>
          <div className="flex-1 w-full relative overflow-hidden">
            <img
              src={gp.portraitUrl}
              alt={gp.figureName}
              className="w-full h-full object-cover object-top"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            {onInfo && (
              <div
                role="button"
                onClick={e => { e.stopPropagation(); onInfo(gp) }}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center text-[8px] text-white/80 cursor-pointer z-10 hover:bg-black/90"
              >i</div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
          <div className="w-full bg-black/80 px-1 py-0.5 shrink-0">
            <div className="text-[8px] text-white font-semibold leading-tight truncate">{gp.figureName}</div>
            <div className="text-[8px] text-slate-500 truncate">
              {gp.countries && gp.countries.length > 0 ? gp.countries[0] : gp.era}
            </div>
          </div>
        </>
      )}
      {type === 'event' && eventCard && (
        <div className="flex flex-col items-center justify-between h-full p-1.5">
          <span className="text-[8px] text-purple-300 uppercase tracking-wide">Event</span>
          <span className="text-[9px] text-white font-medium leading-tight text-center">{eventCard.name}</span>
          <span className="text-[8px] text-purple-400 text-center">{eventCard.stat ? STAT_LABELS[eventCard.stat].slice(0, 3) : 'Hazard'}</span>
        </div>
      )}
      {type === 'follower' && followerCard && (
        <>
          <div className="flex-1 w-full relative overflow-hidden bg-indigo-950">
            <img
              src={`/followers/${followerCard.imageKey}.jpeg`}
              alt={followerCard.name}
              className="w-full h-full object-cover object-center"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <div className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
          <div className="w-full bg-black/80 px-1 py-0.5 shrink-0">
            <div className="text-[8px] text-indigo-200 font-semibold leading-tight truncate">{followerCard.name}</div>
            <div className="text-[8px] text-indigo-400">+3 {STAT_LABELS[followerCard.stat].slice(0, 3)}</div>
          </div>
        </>
      )}
    </button>
  )
}

// ─── Card Detail Modal ────────────────────────────────────────────────────────

function CardDetailModal({ card, achievementTicks, onClose }: { card: Card; achievementTicks?: number; onClose: () => void }) {
  const achSpec = ACHIEVEMENT_SPECS[card.figureName]
  const ticks = achievementTicks ?? 0
  const threshold = achSpec?.threshold ?? 3

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-[#0e0e1a] border border-white/10 rounded-2xl overflow-hidden w-full max-w-xs shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Portrait with name overlay */}
        <div className="relative w-full h-48 bg-slate-900">
          <img
            src={card.portraitUrl}
            alt={card.figureName}
            className="w-full h-full object-cover object-top"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white/70 hover:text-white text-sm transition-colors"
          >✕</button>
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
            <h2 className="text-white text-lg font-bold leading-tight">{card.figureName}</h2>
            <p className={`text-sm font-medium ${ERA_TEXT[card.era] ?? 'text-slate-400'}`}>{card.era}</p>
          </div>
        </div>

        <div className="px-4 pt-3 pb-4 space-y-3 max-h-[60vh] overflow-y-auto">

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-1.5">
            {STATS.map(stat => {
              const val = card[stat]
              const highlight = val >= 80 ? 'text-amber-400' : val >= 60 ? 'text-slate-200' : 'text-slate-500'
              return (
                <div key={stat} className="flex items-center justify-between bg-white/[0.04] rounded-lg px-2.5 py-1.5">
                  <span className="text-slate-400 text-[11px]">{STAT_LABELS[stat]}</span>
                  <span className={`text-sm font-bold ${highlight}`}>{val}</span>
                </div>
              )
            })}
          </div>

          {/* Trait */}
          {card.trait && (
            <div className="bg-amber-500/[0.07] border border-amber-500/20 rounded-xl px-3 py-2.5">
              <p className="text-[10px] text-amber-400/70 uppercase tracking-widest font-semibold mb-1">Trait</p>
              <p className="text-amber-200/90 text-xs leading-relaxed">{card.trait}</p>
            </div>
          )}

          {/* Achievement */}
          {card.achievement && (
            <div className="bg-violet-500/[0.07] border border-violet-500/20 rounded-xl px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-violet-400/70 uppercase tracking-widest font-semibold">Achievement</p>
                {achievementTicks !== undefined && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ticks >= threshold ? 'bg-amber-500 text-slate-950' : 'bg-white/10 text-slate-400'}`}>
                    {ticks} / {threshold}
                  </span>
                )}
              </div>
              <p className="text-violet-200/90 text-xs leading-relaxed">{card.achievement}</p>
              {achievementTicks !== undefined && ticks >= threshold && (
                <p className="text-amber-400 text-[10px] font-bold mt-1.5">★ Ready to claim!</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Lobby Component ──────────────────────────────────────────────────────────

interface LobbyProps {
  matchType: MatchType
  onStart: (setup: GameSetup) => void
  onBack: () => void
}

const MATCH_TYPE_LABELS: Record<MatchType, { title: string; sub: string }> = {
  casual:  { title: 'Casual',     sub: 'vs Human · Friendly' },
  ranked:  { title: 'Ranked',     sub: 'vs Human · Competitive' },
  pvc:     { title: 'vs Computer', sub: 'Fight the AI' },
}

function BattleLobby({ matchType, onStart, onBack }: LobbyProps) {
  const isPvC = matchType === 'pvc'
  const playerMode: PlayerMode = isPvC ? 'pvc' : 'pvp'

  const [eraMode, setEraMode] = useState<EraMode>('all')
  const [singleEra, setSingleEra] = useState('Ancient')
  // PvP needs at least 2 humans; PvC is always 1 human vs N CPUs
  const [numHumans, setNumHumans] = useState(isPvC ? 1 : 2)
  const [numComputers, setNumComputers] = useState(1)
  const [playerNames, setPlayerNames] = useState<string[]>(
    isPvC ? ['You'] : ['Player 1', 'Player 2']
  )

  const updatePlayerName = (i: number, name: string) => {
    const names = [...playerNames]
    names[i] = name
    setPlayerNames(names)
  }

  const adjustHumans = (n: number) => {
    const clamped = Math.max(2, Math.min(5, n))
    setNumHumans(clamped)
    setPlayerNames(prev => Array.from({ length: clamped }, (_, i) => prev[i] ?? `Player ${i + 1}`))
  }

  const adjustComputers = (n: number) => {
    setNumComputers(Math.max(1, Math.min(4, n)))
  }

  const totalPlayers = isPvC ? 1 + numComputers : numHumans
  const canStart = totalPlayers >= 2 && totalPlayers <= 5
  const label = MATCH_TYPE_LABELS[matchType]

  return (
    <div className="relative min-h-screen bg-[#080812] overflow-auto flex flex-col">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] rounded-full bg-indigo-700/10 blur-[140px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-amber-600/8 blur-[140px]" />
      </div>

      <div className="relative z-10 px-5 py-5 flex items-center gap-3 border-b border-white/[0.06]">
        <button onClick={onBack} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">← Back</button>
        <div>
          <h1 className="font-display text-xl font-bold tracking-[0.1em] text-white uppercase">{label.title}</h1>
          <p className="text-[11px] text-slate-500">{label.sub}</p>
        </div>
      </div>

      <div className="relative z-10 flex-1 px-5 py-6 space-y-6 max-w-lg mx-auto w-full">

        {isPvC ? (
          /* PvC: fixed 1 human, variable CPUs */
          <>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Your Name</p>
              <input
                value={playerNames[0] ?? ''}
                onChange={e => updatePlayerName(0, e.target.value)}
                placeholder="Your name"
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-slate-500 uppercase tracking-widest">Computer Opponents</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => adjustComputers(numComputers - 1)}
                    className="w-7 h-7 rounded-lg bg-slate-800 border border-white/10 text-white text-sm hover:bg-slate-700 transition-colors">−</button>
                  <span className="text-white text-sm w-5 text-center font-semibold">{numComputers}</span>
                  <button onClick={() => adjustComputers(numComputers + 1)}
                    className="w-7 h-7 rounded-lg bg-slate-800 border border-white/10 text-white text-sm hover:bg-slate-700 transition-colors">+</button>
                </div>
              </div>
              <p className="text-[11px] text-slate-600">
                {numComputers === 1 ? '1 CPU opponent' : `${numComputers} CPU opponents`} · {totalPlayers} players total
              </p>
            </div>
          </>
        ) : (
          /* PvP: 2–5 human players */
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500 uppercase tracking-widest">Players</p>
              <div className="flex items-center gap-2">
                <button onClick={() => adjustHumans(numHumans - 1)}
                  disabled={numHumans <= 2}
                  className="w-7 h-7 rounded-lg bg-slate-800 border border-white/10 text-white text-sm hover:bg-slate-700 transition-colors disabled:opacity-30">−</button>
                <span className="text-white text-sm w-5 text-center font-semibold">{numHumans}</span>
                <button onClick={() => adjustHumans(numHumans + 1)}
                  disabled={numHumans >= 5}
                  className="w-7 h-7 rounded-lg bg-slate-800 border border-white/10 text-white text-sm hover:bg-slate-700 transition-colors disabled:opacity-30">+</button>
              </div>
            </div>
            <div className="space-y-2">
              {Array.from({ length: numHumans }, (_, i) => (
                <input key={i} value={playerNames[i] ?? ''} onChange={e => updatePlayerName(i, e.target.value)}
                  placeholder={`Player ${i + 1}`}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/50" />
              ))}
            </div>
          </div>
        )}

        {/* Era Mode */}
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">Era</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {(['all', 'single'] as const).map(m => (
              <button key={m} onClick={() => setEraMode(m)}
                className={`py-3 rounded-xl text-sm font-semibold transition-all border
                  ${eraMode === m
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-400'
                    : 'border-white/10 text-slate-400 hover:border-white/20'}`}>
                {m === 'all' ? 'All Eras' : 'Single Era'}
              </button>
            ))}
          </div>
          {eraMode === 'single' && (
            <div className="grid grid-cols-3 gap-1.5">
              {ERAS.map(era => (
                <button key={era} onClick={() => setSingleEra(era)}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-all border
                    ${singleEra === era
                      ? 'bg-amber-500/15 border-amber-500/50 text-amber-400'
                      : 'border-white/10 text-slate-500 hover:border-white/20'}`}>
                  {era}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => {
            if (!canStart) return
            onStart({
              mode: 'generic',
              matchType,
              playerMode,
              eraMode,
              singleEra: eraMode === 'single' ? singleEra : undefined,
              playerNames: playerNames.slice(0, isPvC ? 1 : numHumans),
              numComputers: isPvC ? numComputers : 0,
            })
          }}
          disabled={!canStart}
          className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wide text-slate-950
            bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed
            shadow-lg shadow-amber-500/25 transition-all duration-200">
          Start Game
        </button>
      </div>
    </div>
  )
}

// ─── Player Colors ────────────────────────────────────────────────────────────

const PLAYER_COLORS = [
  { text: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/40',   ring: 'border-amber-500/40',   dot: 'bg-amber-400'   },
  { text: 'text-indigo-400',  bg: 'bg-indigo-500/15',  border: 'border-indigo-500/40',  ring: 'border-indigo-500/40',  dot: 'bg-indigo-400'  },
  { text: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', ring: 'border-emerald-500/40', dot: 'bg-emerald-400' },
  { text: 'text-violet-400',  bg: 'bg-violet-500/15',  border: 'border-violet-500/40',  ring: 'border-violet-500/40',  dot: 'bg-violet-400'  },
  { text: 'text-rose-400',    bg: 'bg-rose-500/15',    border: 'border-rose-500/40',    ring: 'border-rose-500/40',    dot: 'bg-rose-400'    },
]

// ─── CPU AI helpers ───────────────────────────────────────────────────────────

// Cards whose trait actively benefits from being revealed (public):
// - Al-Khwarizmi: gains bonuses from other *revealed* GPs on the field
// - Aspasia: her bonus to Pericles is positional, but she wants Pericles visible
// - Edmund Hillary: gains 2 ticks per win — worth getting into events fast
// - Sargon I: extra achievement tick on defeat — needs to be in play publicly
// - Audrey Hepburn: global Reputation boost to all allies (telegraphs value)
// - Mani: Belief/Intelligence scale with distinct eras on field — being revealed helps other Manis
const PUBLIC_TRAIT_FIGURES = new Set([
  'Al-Khwarizmi', 'Edmund Hillary', 'Sargon I', 'Audrey Hepburn', 'Mani',
])

// Cards whose trait benefits most from staying *hidden* (private):
// - Belisarius: trait activates when outnumbered — surprise value is high
// - Miyamoto Musashi: attack-twice trait is more dangerous unseen
// - Mao Zedong: relocate-on-death trait is a surprise escape
const PRIVATE_TRAIT_FIGURES = new Set([
  'Belisarius', 'Miyamoto Musashi', 'Mao Zedong',
])

function cpuShouldDeployPublic(gp: Card, allLocations: LocationState[], gpMap: Record<string, Card>): boolean {
  if (PRIVATE_TRAIT_FIGURES.has(gp.figureName)) return false
  if (PUBLIC_TRAIT_FIGURES.has(gp.figureName)) return true

  // Go public if another revealed allied GP benefits from it (Al-Khwarizmi on the board)
  const alKhwarizmiDeployed = allLocations.some(loc =>
    loc.cards.some(c => c.type === 'gp' && c.isPublic && gpMap[c.cardId]?.figureName === 'Al-Khwarizmi')
  )
  if (alKhwarizmiDeployed) return Math.random() < 0.7

  // High-stat cards have less to hide — they win on raw numbers
  const total = STATS.reduce((sum, s) => sum + gp[s], 0)
  if (total >= 450) return Math.random() < 0.60
  if (total >= 380) return Math.random() < 0.35
  return Math.random() < 0.20
}

// ─── Game Board Component ─────────────────────────────────────────────────────

type SelectionMode = 'none' | 'deploy-gp' | 'add-follower' | 'select-onboard' | 'attack-select-target' | 'move-target' | 'start-event'

interface Selection {
  mode: SelectionMode
  handCardId?: string
  handCardIdx?: number
  handCardType?: 'gp' | 'event' | 'follower'
  handFollowerId?: string
  onboardInstanceId?: string
}

// ─── Summary Modal ─────────────────────────────────────────────────────────────

function ContribRow({ c }: { c: CardContrib }) {
  const hasBonus = c.traitBonus !== 0 || c.followerBonus !== 0 || c.locationBonus !== 0
  const portrait = c.portraitUrl ?? (c.imageKey ? `/followers/${c.imageKey}.jpeg` : null)
  return (
    <div className="flex items-center gap-2 py-1 border-b border-white/5 last:border-0">
      {portrait ? (
        <img src={portrait} alt={c.name} className="w-7 h-7 rounded-full object-cover shrink-0 border border-white/10" />
      ) : (
        <div className="w-7 h-7 rounded-full bg-slate-800 shrink-0 flex items-center justify-center text-xs">
          {c.type === 'follower' ? '👥' : '👤'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-slate-300 font-medium truncate">{c.name}</span>
          {c.type === 'follower' && <span className="text-[9px] text-indigo-400 bg-indigo-900/40 px-1 rounded">follower</span>}
        </div>
        {hasBonus && (
          <div className="flex gap-2 mt-0.5">
            {c.traitBonus !== 0 && (
              <span className="text-[9px] text-amber-400">trait {c.traitBonus > 0 ? '+' : ''}{c.traitBonus}</span>
            )}
            {c.followerBonus !== 0 && (
              <span className="text-[9px] text-indigo-400">follower +{c.followerBonus}</span>
            )}
            {c.locationBonus !== 0 && (
              <span className="text-[9px] text-yellow-300">terrain +{c.locationBonus}</span>
            )}
          </div>
        )}
      </div>
      <span className="text-sm font-bold text-white shrink-0">
        {c.baseStat + c.traitBonus + c.followerBonus + c.locationBonus}
      </span>
    </div>
  )
}

function SummaryModal({ summary, onDismiss }: { summary: GameSummary; onDismiss: () => void }) {
  if (summary.kind === 'combat') {
    const s = summary
    const resultColor = s.result === 'attacker' ? 'text-emerald-400' : s.result === 'defender' ? 'text-red-400' : 'text-slate-400'
    const resultLabel = s.result === 'attacker' ? 'Attacker wins!' : s.result === 'defender' ? 'Defender holds!' : 'Draw'
    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4">
        <div className="bg-[#0e1020] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-red-900/20 border-b border-white/10 px-4 py-3 text-center">
            <div className="text-lg">⚔️</div>
            <h3 className="font-bold text-white text-sm uppercase tracking-wide">Battle Report</h3>
            <p className="text-slate-400 text-xs mt-0.5">{s.locationName} · {STAT_LABELS[s.stat]}</p>
            {s.locationAbility && (
              <p className="text-yellow-300/80 text-[10px] mt-1 italic">{s.locationAbility}</p>
            )}
          </div>

          <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
            {/* Attacker side */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Attacker — {s.attacker.playerName}</span>
                <span className="text-sm font-bold text-emerald-400">{s.attacker.total}</span>
              </div>
              {s.attacker.cards.map((c, i) => <ContribRow key={i} c={c} />)}
            </div>

            <div className="border-t border-white/10" />

            {/* Defender side */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Defender — {s.defender.playerName}</span>
                <span className="text-sm font-bold text-indigo-400">{s.defender.total}</span>
              </div>
              {s.defender.cards.map((c, i) => <ContribRow key={i} c={c} />)}
            </div>
          </div>

          {/* Outcome */}
          <div className="border-t border-white/10 px-4 py-3 text-center space-y-1">
            <p className={`font-bold text-sm ${resultColor}`}>{resultLabel}</p>
            {s.kill && <p className="text-xs text-red-400">Defender's card eliminated!</p>}
          </div>

          <div className="px-4 pb-4">
            <button onClick={onDismiss}
              className="w-full py-2.5 rounded-xl text-sm font-bold bg-slate-800 hover:bg-slate-700 text-white transition-all">
              Continue
            </button>
          </div>
        </div>
      </div>
    )
  }

  // EventSummary
  const s = summary
  const isGlobal = s.eventType === 'global_competition'
  const headerColor = isGlobal ? 'bg-purple-900/20' : s.eventType === 'local_survival' ? 'bg-red-900/20' : 'bg-orange-900/20'
  const icon = isGlobal ? '🌍' : s.eventType === 'local_survival' ? '☠️' : '⚡'

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4">
      <div className="bg-[#0e1020] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className={`${headerColor} border-b border-white/10 px-4 py-3 text-center`}>
          <div className="text-lg">{icon}</div>
          <h3 className="font-bold text-white text-sm uppercase tracking-wide">{s.eventName}</h3>
          <p className="text-slate-400 text-xs mt-0.5">
            {s.locationName}{s.stat ? ` · ${STAT_LABELS[s.stat]}` : ''}
            {s.threshold > 0 ? ` · threshold ${s.threshold}` : ''}
          </p>
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {s.results.map((r, ri) => (
            <div key={ri}>
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-slate-500">{r.playerName}</span>
                  {!isGlobal && (
                    <span className={`text-[9px] font-bold px-1.5 rounded ${r.survived ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'}`}>
                      {r.survived ? 'Survived' : 'Eliminated'}
                    </span>
                  )}
                  {isGlobal && s.winnerName === r.playerName && (
                    <span className="text-[9px] font-bold px-1.5 rounded bg-purple-900/50 text-purple-300">Winner</span>
                  )}
                </div>
                <span className="text-sm font-bold text-white">{r.total}</span>
              </div>
              {r.cards.map((c, i) => <ContribRow key={i} c={c} />)}
              {ri < s.results.length - 1 && <div className="mt-3 border-t border-white/10" />}
            </div>
          ))}
        </div>

        <div className="px-4 pb-4 pt-2">
          <button onClick={onDismiss}
            className="w-full py-2.5 rounded-xl text-sm font-bold bg-slate-800 hover:bg-slate-700 text-white transition-all">
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}

interface BattleGameProps {
  gameState: GameState
  dispatch: React.Dispatch<GameAction>
  onExit: () => void
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-[#0e1020] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <span className="text-sm font-bold text-white tracking-wide">📖 How to Play</span>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-lg leading-none transition-colors">✕</button>
        </div>
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto text-sm">
          <section>
            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-1.5">Objective</p>
            <p className="text-slate-300 leading-relaxed">First player to earn <span className="text-amber-400 font-bold">5 Victory Points</span> wins the game.</p>
          </section>
          <section>
            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-1.5">On Your Turn</p>
            <ul className="space-y-1.5 text-slate-300 leading-relaxed">
              <li><span className="text-white font-semibold">Deploy</span> — Play one Great Person from your hand to any location.</li>
              <li><span className="text-white font-semibold">Add Follower</span> — Place a follower at a location where you have a Great Person.</li>
              <li><span className="text-white font-semibold">Move</span> — Relocate one of your cards to a different location.</li>
              <li><span className="text-white font-semibold">Trigger Event</span> — Activate the event card at a location where you have a Great Person.</li>
              <li><span className="text-white font-semibold">Attack</span> — During a Local Event, challenge a rival's card.</li>
              <li><span className="text-white font-semibold">Retrieve</span> — Return one of your cards from the board to your hand.</li>
            </ul>
          </section>
          <section>
            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-1.5">Events</p>
            <ul className="space-y-1.5 text-slate-300 leading-relaxed">
              <li><span className="text-white font-semibold">⚔ Local Event</span> — Compare your total stat vs. rivals. Winner may attack the loser's card.</li>
              <li><span className="text-white font-semibold">☠ Local Survival</span> — Any card at this location with that stat below 10 is discarded.</li>
              <li><span className="text-white font-semibold">🏆 Global Competition</span> — Player with the highest total stat across all public cards earns a prize bundle.</li>
              <li><span className="text-white font-semibold">🌊 Natural Hazard</span> — Cards with total stats below 100 are discarded.</li>
            </ul>
          </section>
          <section>
            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-1.5">Victory Points</p>
            <p className="text-slate-300 leading-relaxed">Win events and complete card achievements to earn points. Each card's achievement is shown on its detail view.</p>
          </section>
        </div>
        <div className="px-4 pb-4 pt-1">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-bold bg-slate-800 hover:bg-slate-700 text-white transition-all">
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

function BattleGame({ gameState, dispatch, onExit }: BattleGameProps) {
  const [selection, setSelection] = useState<Selection>({ mode: 'none' })
  const [attackKill, setAttackKill] = useState(false)
  const [showRewardDialog, setShowRewardDialog] = useState(false)
  const [globalCompWinner] = useState<string | null>(null)
  const [cardDetail, setCardDetail] = useState<{ card: Card; ticks?: number } | null>(null)
  const [showRules, setShowRules] = useState(false)
  // Hot-seat: shown between human turns so previous player can't see next player's hand
  const [awaitingHandoff, setAwaitingHandoff] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const computerTurnRef = useRef(false)

  // Lock landscape orientation on mobile when game board is active
  useEffect(() => {
    const lock = async () => {
      try { await (screen.orientation as { lock?: (o: string) => Promise<void> }).lock?.('landscape') } catch { /* not supported */ }
    }
    lock()
    return () => { try { screen.orientation.unlock() } catch { /* ignore */ } }
  }, [])

  const currentPlayer = gameState.players[gameState.currentPlayerIdx]
  const isMyTurn = !currentPlayer.isComputer

  // Build lookup maps
  const gpMap: Record<string, Card> = {}
  for (const c of ALL_GP_CARDS) gpMap[c.id] = c

  const followerMap: Record<string, FollowerCard> = {}
  for (const p of gameState.players) {
    for (const f of p.followerHand) followerMap[f.id] = f
  }
  // Deployed followers are removed from followerHand — rebuild from template
  for (const loc of gameState.locations) {
    for (const oc of loc.cards) {
      if (oc.type === 'follower' && !followerMap[oc.cardId]) {
        const f = followerFromId(oc.cardId)
        if (f) followerMap[oc.cardId] = f
      }
    }
  }

  const canDeployGP = !gameState.turnActions.deployedGP && currentPlayer.gpHand.length > 0
  const canAddFollower = !gameState.turnActions.addedFollower && currentPlayer.followerHand.length > 0
  const canEndTurn = gameState.phase === 'playing'

  const selectedOnboard = selection.onboardInstanceId
    ? gameState.locations.flatMap(l => l.cards).find(c => c.instanceId === selection.onboardInstanceId) ?? null
    : null

  const canClaimAchievement = selectedOnboard?.type === 'gp'
    && selectedOnboard.playerId === currentPlayer.id
    && selectedOnboard.achievementTicks >= getAchievementThreshold(gpMap[selectedOnboard.cardId]?.figureName ?? '')
    && selectedOnboard.isPublic
    && !gameState.turnActions.actedCards.includes(selectedOnboard.instanceId)

  const canRetrieve = selectedOnboard
    && selectedOnboard.playerId === currentPlayer.id
    && !selectedOnboard.justDeployed
    && !gameState.turnActions.actedCards.includes(selectedOnboard.instanceId)

  const canToggleVis = selectedOnboard
    && selectedOnboard.playerId === currentPlayer.id
    && !selectedOnboard.justDeployed
    && !gameState.turnActions.actedCards.includes(`vis-${selectedOnboard.instanceId}`)

  // CPU AI
  useEffect(() => {
    if (!currentPlayer.isComputer || gameState.phase !== 'playing') return
    if (computerTurnRef.current) return
    computerTurnRef.current = true

    const timer = setTimeout(() => {
      // 1. Deploy best GP — pick strongest card, choose location smartly, decide public/private per trait
      if (currentPlayer.gpHand.length > 0 && !gameState.turnActions.deployedGP) {
        const bestCard = currentPlayer.gpHand.reduce((best, id) => {
          const gp = gpMap[id]
          if (!gp) return best
          const bestGp = gpMap[best]
          if (!bestGp) return id
          const gpTotal = STATS.reduce((s, k) => s + gp[k], 0)
          const bestTotal = STATS.reduce((s, k) => s + bestGp[k], 0)
          return gpTotal > bestTotal ? id : best
        }, currentPlayer.gpHand[0])

        // Spread out: prefer empty locations, break ties by opponent presence
        const randomStart = gameState.locations[Math.floor(Math.random() * gameState.locations.length)]
        const targetLoc = gameState.locations.reduce((best, loc) => {
          const myCards = loc.cards.filter(c => c.playerId === currentPlayer.id).length
          const bestMyCards = best.cards.filter(c => c.playerId === currentPlayer.id).length
          if (myCards !== bestMyCards) return myCards < bestMyCards ? loc : best
          const oppCount = loc.cards.filter(c => c.playerId !== currentPlayer.id).length
          const bestOppCount = best.cards.filter(c => c.playerId !== currentPlayer.id).length
          if (oppCount !== bestOppCount) return oppCount > bestOppCount ? loc : best
          return Math.random() < 0.5 ? loc : best
        }, randomStart)

        const gp = gpMap[bestCard]
        const isPublic = gp ? cpuShouldDeployPublic(gp, gameState.locations, gpMap) : false
        dispatch({ type: 'DEPLOY_GP', cardId: bestCard, locationId: targetLoc.id, isPublic })
      }

      // 2. Add follower — prefer location matching follower's stat to the strongest allied GP there
      if (currentPlayer.followerHand.length > 0 && !gameState.turnActions.addedFollower) {
        const locsWithGP = gameState.locations.filter(l =>
          l.cards.some(c => c.type === 'gp' && c.playerId === currentPlayer.id)
        )
        if (locsWithGP.length > 0) {
          // Pick the follower whose stat best complements the location with the most opponents
          const follower = (() => {
            const contested = locsWithGP.find(l => l.activeEvent?.stat) ?? locsWithGP[0]
            const eventStat = contested.activeEvent?.stat
            if (eventStat) {
              const match = currentPlayer.followerHand.find(f => f.stat === eventStat)
              if (match) return match
            }
            return currentPlayer.followerHand[0]
          })()

          const locWithGP = locsWithGP.reduce((best, loc) => {
            // Prefer location where follower's stat matches an active event
            const eventMatch = loc.activeEvent?.stat === follower.stat ? 1 : 0
            const bestEventMatch = best.activeEvent?.stat === follower.stat ? 1 : 0
            if (eventMatch !== bestEventMatch) return eventMatch > bestEventMatch ? loc : best
            const myCards = loc.cards.filter(c => c.playerId === currentPlayer.id).length
            const bestMyCards = best.cards.filter(c => c.playerId === currentPlayer.id).length
            return myCards < bestMyCards ? loc : best
          }, locsWithGP[0])

          dispatch({ type: 'ADD_FOLLOWER', followerId: follower.id, locationId: locWithGP.id, instanceId: follower.id })
        }
      }

      // 3. Visibility management — reveal cards that need to be public to claim achievement,
      //    or whose trait prefers being seen; hide cards where surprise still has value
      let toggled = false
      for (const loc of gameState.locations) {
        if (toggled) break
        for (const oc of loc.cards) {
          if (oc.type !== 'gp' || oc.playerId !== currentPlayer.id || oc.justDeployed) continue
          if (gameState.turnActions.actedCards.includes(`vis-${oc.instanceId}`)) continue
          const gp = gpMap[oc.cardId]
          if (!gp) continue
          const threshold = getAchievementThreshold(gp.figureName)

          // Priority 1: must go public to claim achievement at or near threshold
          if (!oc.isPublic && oc.achievementTicks >= threshold - 1) {
            dispatch({ type: 'TOGGLE_VISIBILITY', instanceId: oc.instanceId })
            toggled = true
            break
          }

          // Priority 2: trait-preferred-public card that is still private — reveal with some probability
          if (!oc.isPublic && PUBLIC_TRAIT_FIGURES.has(gp.figureName) && Math.random() < 0.55) {
            dispatch({ type: 'TOGGLE_VISIBILITY', instanceId: oc.instanceId })
            toggled = true
            break
          }

          // Priority 3: strong card (>420 total) in a contested location — go public to use event combat
          if (!oc.isPublic) {
            const total = STATS.reduce((s, k) => s + gp[k], 0)
            const hasEvent = loc.activeEvent?.type === 'local_event'
            const outnumbered = loc.cards.filter(c => c.playerId !== currentPlayer.id).length >
                                loc.cards.filter(c => c.playerId === currentPlayer.id).length
            if (total >= 420 && hasEvent && !outnumbered && Math.random() < 0.65) {
              dispatch({ type: 'TOGGLE_VISIBILITY', instanceId: oc.instanceId })
              toggled = true
              break
            }
          }

          // Priority 4: already public but private-trait card with no pending achievement — hide again
          if (oc.isPublic && PRIVATE_TRAIT_FIGURES.has(gp.figureName) && oc.achievementTicks < threshold - 1 && Math.random() < 0.4) {
            dispatch({ type: 'TOGGLE_VISIBILITY', instanceId: oc.instanceId })
            toggled = true
            break
          }
        }
      }

      // 4. Claim achievement for any ready public GP
      for (const loc of gameState.locations) {
        for (const oc of loc.cards) {
          if (
            oc.type === 'gp' &&
            oc.playerId === currentPlayer.id &&
            oc.isPublic &&
            oc.achievementTicks >= getAchievementThreshold(gpMap[oc.cardId]?.figureName ?? '') &&
            !gameState.turnActions.actedCards.includes(oc.instanceId)
          ) {
            dispatch({ type: 'CLAIM_ACHIEVEMENT', instanceId: oc.instanceId })
          }
        }
      }

      dispatch({ type: 'END_TURN' })
      computerTurnRef.current = false
    }, 1200)

    return () => {
      clearTimeout(timer)
      computerTurnRef.current = false
    }
  }, [currentPlayer.id, currentPlayer.isComputer, gameState.phase, gameState.turnActions])

  const handleLocationTap = useCallback((locId: string) => {
    if (!isMyTurn) return
    if (selection.mode === 'deploy-gp' && selection.handCardId) {
      dispatch({ type: 'DEPLOY_GP', cardId: selection.handCardId, locationId: locId, isPublic: false })
      setSelection({ mode: 'none' })
    } else if (selection.mode === 'add-follower' && selection.handFollowerId) {
      dispatch({ type: 'ADD_FOLLOWER', followerId: selection.handFollowerId, locationId: locId, instanceId: selection.handFollowerId })
      setSelection({ mode: 'none' })
    } else if (selection.mode === 'move-target' && selection.onboardInstanceId) {
      dispatch({ type: 'MOVE_CARD', instanceId: selection.onboardInstanceId, toLocationId: locId })
      setSelection({ mode: 'none' })
    } else if (selection.mode === 'start-event' && selection.handCardIdx !== undefined) {
      dispatch({ type: 'START_EVENT', eventCardIdx: selection.handCardIdx, locationId: locId })
      setSelection({ mode: 'none' })
    }
  }, [selection, dispatch, isMyTurn])

  const handleOnboardCardTap = useCallback((oc: OnboardCard, _locId: string) => {
    if (!isMyTurn) return

    if (selection.mode === 'attack-select-target' && selection.onboardInstanceId) {
      // Attack
      dispatch({ type: 'ATTACK', myInstanceId: selection.onboardInstanceId, theirInstanceId: oc.instanceId, kill: attackKill })
      setSelection({ mode: 'none' })
      return
    }

    if (oc.playerId === currentPlayer.id) {
      if (selection.onboardInstanceId === oc.instanceId) {
        setSelection({ mode: 'none' })
      } else {
        setSelection({ mode: 'select-onboard', onboardInstanceId: oc.instanceId })
      }
    } else {
      // Tapped opponent's card — if we have an onboard card selected, set up attack
      if (selection.onboardInstanceId) {
        dispatch({ type: 'ATTACK', myInstanceId: selection.onboardInstanceId, theirInstanceId: oc.instanceId, kill: attackKill })
        setSelection({ mode: 'none' })
      }
    }
  }, [selection, attackKill, dispatch, currentPlayer.id, isMyTurn])

  const handleHandCardTap = useCallback((cardId: string, cardType: 'gp' | 'event' | 'follower', idx: number, followerId?: string) => {
    if (!isMyTurn) return
    if (cardType === 'gp') {
      if (selection.handCardId === cardId) {
        setSelection({ mode: 'none' })
      } else {
        setSelection({ mode: 'deploy-gp', handCardId: cardId })
      }
    } else if (cardType === 'event') {
      if (selection.handCardIdx === idx) {
        setSelection({ mode: 'none' })
      } else {
        setSelection({ mode: 'start-event', handCardIdx: idx })
      }
    } else if (cardType === 'follower' && followerId) {
      if (selection.handFollowerId === followerId) {
        setSelection({ mode: 'none' })
      } else {
        setSelection({ mode: 'add-follower', handFollowerId: followerId })
      }
    }
  }, [selection, isMyTurn])


  const getEventBadgeColor = (type: EventType) => {
    if (type === 'local_event') return 'bg-orange-500/80'
    if (type === 'local_survival') return 'bg-red-600/80'
    if (type === 'global_competition') return 'bg-purple-600/80'
    return 'bg-yellow-600/80'
  }

  if (gameState.phase === 'ended' && gameState.winner) {
    const winner = gameState.players.find(p => p.id === gameState.winner)
    return (
      <div className="relative min-h-screen bg-[#080812] flex flex-col items-center justify-center p-6">
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute inset-0 bg-amber-600/5 blur-[160px]" />
        </div>
        <div className="relative z-10 text-center max-w-sm">
          <div className="text-6xl mb-4">🏆</div>
          <h2 className="font-display text-3xl font-bold tracking-wide text-white uppercase mb-2">Game Over!</h2>
          <p className="text-amber-400 text-xl font-bold mb-6">{winner?.name} wins!</p>
          <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 mb-6">
            {gameState.players.sort((a, b) => b.winningPoints - a.winningPoints).map(p => (
              <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                <span className="text-slate-300 text-sm">{p.name}</span>
                <span className={`font-bold text-sm ${p.id === gameState.winner ? 'text-amber-400' : 'text-slate-500'}`}>
                  {p.winningPoints} pts
                </span>
              </div>
            ))}
          </div>
          <button onClick={onExit}
            className="w-full py-3.5 rounded-xl font-bold text-sm text-slate-950 bg-amber-500 hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/25">
            Play Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-[#080812] flex flex-col overflow-hidden select-none">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-1/3 left-1/4 w-96 h-96 rounded-full bg-indigo-700/8 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-amber-600/6 blur-[120px]" />
      </div>

      {/* Header */}
      <div className="relative z-10 px-4 py-2 flex items-center gap-3 border-b border-white/[0.06] bg-black/20 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest shrink-0">Round {gameState.round}</span>
            <span className="text-white/20">·</span>
            <span className={`text-xs font-bold truncate ${PLAYER_COLORS[gameState.currentPlayerIdx % 5].text}`}>
              {currentPlayer.name}{currentPlayer.isComputer ? ' (CPU)' : "'s Turn"}
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap justify-center">
            {gameState.players.map((p, idx) => {
              const color = PLAYER_COLORS[idx % 5]
              const isActive = idx === gameState.currentPlayerIdx
              return (
                <div key={p.id}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] transition-all
                    ${isActive ? `${color.bg} ${color.border} border` : 'opacity-50'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color.dot}`} />
                  <span className={`font-medium ${color.text}`}>{p.name.split(' ')[0]}</span>
                  <span className={`font-bold ${color.text}`}>{p.winningPoints}★</span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setShowRules(true)} className="text-slate-500 hover:text-amber-400 text-base transition-colors px-2" title="Rules">📖</button>
          <button onClick={onExit} className="text-slate-600 hover:text-slate-400 text-xs transition-colors px-2">Exit</button>
        </div>
      </div>
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

      {/* Board: Locations */}
      <div className="relative z-10 flex-shrink-0 overflow-x-auto py-2 px-3 border-b border-white/[0.06]">
        <div className="flex gap-2 justify-center min-w-full w-max mx-auto">
          {gameState.locations.map(loc => {
            const isLocationTarget = selection.mode === 'move-target' || selection.mode === 'deploy-gp' || selection.mode === 'add-follower' || selection.mode === 'start-event'

            return (
              <div
                key={loc.id}
                onClick={() => handleLocationTap(loc.id)}
                className={`relative rounded-xl border p-2 w-40 cursor-pointer transition-all duration-150 overflow-hidden
                  ${ERA_COLORS[loc.era] ?? 'bg-slate-900/60 border-slate-700/40'}
                  ${isLocationTarget ? 'border-amber-400/60 ring-1 ring-amber-400/30' : ''}`}
              >
                {/* Location background image */}
                {loc.imageKey && (
                  <div className="absolute inset-0 pointer-events-none">
                    <img
                      src={`/locations/${loc.imageKey}.jpeg`}
                      alt=""
                      className="w-full h-full object-cover opacity-25"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
                  </div>
                )}
                {/* Location name */}
                <div className="relative mb-1">
                  <p className={`text-[10px] font-bold truncate ${ERA_TEXT[loc.era] ?? 'text-slate-300'}`}>{loc.name}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    <p className="text-[9px] text-slate-600">{loc.era}</p>
                    {loc.countries && loc.countries.length > 0 && (
                      <p className="text-[9px] text-slate-500">{loc.countries.join(', ')}</p>
                    )}
                  </div>
                </div>

                {/* Active event badge */}
                {loc.activeEvent && (
                  <div className={`relative text-[8px] text-white px-1 py-0.5 rounded mb-1 truncate ${getEventBadgeColor(loc.activeEvent.type)}`}>
                    {loc.activeEvent.name}
                  </div>
                )}

                {/* Cards per player */}
                {gameState.players.map((p, pidx) => {
                  const playerCards = loc.cards.filter(c => c.playerId === p.id)
                  const pColor = PLAYER_COLORS[pidx % 5]
                  if (playerCards.length === 0) return (
                    <div key={p.id} className="relative mb-1 h-4 flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${pColor.dot} opacity-30`} />
                      <span className="text-[9px] text-slate-700 italic">{p.name.split(' ')[0]}</span>
                    </div>
                  )
                  return (
                    <div key={p.id} className="relative mb-1">
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${pColor.dot}`} />
                        <p className={`text-[8px] font-medium ${pColor.text}`}>{p.name.split(' ')[0]}</p>
                      </div>
                      <div className="flex flex-wrap gap-0.5">
                        {playerCards.map(oc => (
                          <CompactCard
                            key={oc.instanceId}
                            card={oc}
                            isCurrentPlayer={p.id === currentPlayer.id}
                            isSelected={selection.onboardInstanceId === oc.instanceId}
                            onClick={() => handleOnboardCardTap(oc, loc.id)}
                            onInfo={(c, ticks) => setCardDetail({ card: c, ticks })}
                            gpMap={gpMap}
                            followerTemplates={followerMap}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Selection hint */}
      {selection.mode !== 'none' && (
        <div className="relative z-10 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
          <p className="text-amber-400 text-xs text-center">
            {selection.mode === 'deploy-gp' && 'Tap a location to deploy this Great Person'}
            {selection.mode === 'add-follower' && 'Tap a location (where you have a GP) to add follower'}
            {selection.mode === 'start-event' && 'Tap a location to start this event'}
            {selection.mode === 'select-onboard' && 'Card selected — use action buttons below or tap opponent card to attack'}
            {selection.mode === 'move-target' && 'Tap a location to move card there'}
            {selection.mode === 'attack-select-target' && 'Tap an opponent card to attack'}
          </p>
        </div>
      )}

      {/* Event Log */}
      <div ref={logRef} className="relative z-10 px-4 py-1.5 border-b border-white/[0.06] shrink-0 bg-black/10">
        <div className="space-y-0.5 max-h-10 overflow-hidden">
          {gameState.log.slice(0, 2).map((entry, i) => (
            <p key={i} className={`text-[10px] leading-tight text-center ${i === 0 ? 'text-slate-400' : 'text-slate-600'}`}>
              {entry}
            </p>
          ))}
        </div>
      </div>

      {/* Your Hand */}
      {isMyTurn && (
        <div className="relative z-10 px-3 py-2 border-b border-white/[0.06] shrink-0">
          <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1.5 text-center">Your Hand</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 justify-center">
            {currentPlayer.gpHand.map((id, i) => (
              <HandCard
                key={id}
                cardId={id}
                type="gp"
                isSelected={selection.handCardId === id}
                onClick={() => handleHandCardTap(id, 'gp', i)}
                onInfo={(c) => setCardDetail({ card: c })}
                gpMap={gpMap}
              />
            ))}
            {currentPlayer.eventHand.map((ev, i) => (
              <HandCard
                key={ev.id}
                cardId={ev.id}
                type="event"
                isSelected={selection.handCardIdx === i && selection.mode === 'start-event'}
                onClick={() => handleHandCardTap(ev.id, 'event', i)}
                gpMap={gpMap}
                eventCard={ev}
              />
            ))}
            {currentPlayer.followerHand.map((f, i) => (
              <HandCard
                key={f.id}
                cardId={f.id}
                type="follower"
                isSelected={selection.handFollowerId === f.id}
                onClick={() => handleHandCardTap(f.id, 'follower', i, f.id)}
                gpMap={gpMap}
                followerCard={f}
              />
            ))}
            {currentPlayer.gpHand.length === 0 && currentPlayer.eventHand.length === 0 && currentPlayer.followerHand.length === 0 && (
              <p className="text-slate-700 text-xs italic py-6 px-2">No cards in hand</p>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="relative z-10 flex-1 px-3 py-3 flex flex-col gap-2 max-w-lg mx-auto w-full">
        {/* Kill toggle (for attacks) */}
        {selection.mode === 'select-onboard' && selectedOnboard?.playerId === currentPlayer.id && (
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => setAttackKill(k => !k)}
              className={`text-xs px-3 py-1 rounded-lg border transition-all ${attackKill ? 'bg-red-900/30 border-red-700/50 text-red-400' : 'border-white/10 text-slate-500'}`}>
              {attackKill ? 'Kill mode ON' : 'Kill mode OFF'}
            </button>
            <span className="text-[10px] text-slate-600">Toggle to kill vs retrieve on win</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={!isMyTurn || !canDeployGP || (selection.mode !== 'none' && selection.mode !== 'deploy-gp')}
            onClick={() => {
              if (selection.mode === 'deploy-gp') { setSelection({ mode: 'none' }); return }
              if (currentPlayer.gpHand.length === 1) {
                setSelection({ mode: 'deploy-gp', handCardId: currentPlayer.gpHand[0] })
              } else {
                setSelection({ mode: 'deploy-gp' })
              }
            }}
            className="py-2.5 rounded-xl text-xs font-semibold border transition-all
              bg-slate-900 border-amber-500/30 text-amber-400
              disabled:opacity-30 disabled:cursor-not-allowed
              hover:bg-amber-500/10">
            Deploy GP {gameState.turnActions.deployedGP ? '✓' : ''}
          </button>

          <button
            disabled={!isMyTurn || !canAddFollower || (selection.mode !== 'none' && selection.mode !== 'add-follower')}
            onClick={() => {
              if (selection.mode === 'add-follower') { setSelection({ mode: 'none' }); return }
              if (currentPlayer.followerHand.length === 1) {
                setSelection({ mode: 'add-follower', handFollowerId: currentPlayer.followerHand[0].id })
              } else {
                setSelection({ mode: 'add-follower' })
              }
            }}
            className="py-2.5 rounded-xl text-xs font-semibold border transition-all
              bg-slate-900 border-indigo-500/30 text-indigo-400
              disabled:opacity-30 disabled:cursor-not-allowed
              hover:bg-indigo-500/10">
            Add Follower {gameState.turnActions.addedFollower ? '✓' : ''}
          </button>

          <button
            disabled={!isMyTurn || !selectedOnboard || selectedOnboard.playerId !== currentPlayer.id || !!selectedOnboard.justDeployed || gameState.turnActions.movedCards.includes(selectedOnboard?.instanceId ?? '')}
            onClick={() => {
              if (selection.mode === 'move-target') { setSelection({ mode: 'select-onboard', onboardInstanceId: selection.onboardInstanceId }); return }
              setSelection({ mode: 'move-target', onboardInstanceId: selection.onboardInstanceId })
            }}
            className="py-2.5 rounded-xl text-xs font-semibold border transition-all
              bg-slate-900 border-white/10 text-slate-300
              disabled:opacity-30 disabled:cursor-not-allowed
              hover:border-white/20">
            Move Card
          </button>

          <button
            disabled={!isMyTurn || !canRetrieve}
            onClick={() => {
              if (selection.onboardInstanceId) {
                dispatch({ type: 'RETRIEVE_CARD', instanceId: selection.onboardInstanceId })
                setSelection({ mode: 'none' })
              }
            }}
            className="py-2.5 rounded-xl text-xs font-semibold border transition-all
              bg-slate-900 border-white/10 text-slate-300
              disabled:opacity-30 disabled:cursor-not-allowed
              hover:border-white/20">
            Retrieve
          </button>

          <button
            disabled={!isMyTurn || !canClaimAchievement}
            onClick={() => {
              if (selection.onboardInstanceId) {
                dispatch({ type: 'CLAIM_ACHIEVEMENT', instanceId: selection.onboardInstanceId })
                setSelection({ mode: 'none' })
              }
            }}
            className="py-2.5 rounded-xl text-xs font-semibold border transition-all
              bg-slate-900 border-amber-600/40 text-amber-500
              disabled:opacity-30 disabled:cursor-not-allowed
              hover:bg-amber-500/10">
            Claim Achievement
          </button>

          <button
            disabled={!isMyTurn || !canToggleVis}
            onClick={() => {
              if (selection.onboardInstanceId) {
                dispatch({ type: 'TOGGLE_VISIBILITY', instanceId: selection.onboardInstanceId })
              }
            }}
            className="py-2.5 rounded-xl text-xs font-semibold border transition-all
              bg-slate-900 border-white/10 text-slate-300
              disabled:opacity-30 disabled:cursor-not-allowed
              hover:border-white/20">
            Toggle Public
          </button>

          {/* End Scenario: available when selected onboard GP is at a location with a local event */}
          {(() => {
            if (!isMyTurn || !selectedOnboard || selectedOnboard.type !== 'gp' || selectedOnboard.playerId !== currentPlayer.id || selectedOnboard.justDeployed) return null
            const loc = gameState.locations.find(l => l.cards.some(c => c.instanceId === selectedOnboard.instanceId))
            if (!loc?.activeEvent || loc.activeEvent.type === 'global_competition' || loc.activeEvent.type === 'natural_hazard') return null
            const alreadyDone = gameState.turnActions.actedCards.includes(`end-scenario-${loc.id}`)
            return (
              <button
                disabled={alreadyDone}
                onClick={() => dispatch({ type: 'END_SCENARIO', locationId: loc.id })}
                className="col-span-2 py-2.5 rounded-xl text-xs font-semibold border transition-all
                  bg-slate-900 border-red-700/40 text-red-400
                  disabled:opacity-30 disabled:cursor-not-allowed
                  hover:bg-red-900/20">
                End Scenario: {loc.activeEvent.name}
              </button>
            )
          })()}
        </div>

        <div className="mt-auto">
          <button
            disabled={!isMyTurn || !canEndTurn}
            onClick={() => {
              const numPlayers = gameState.players.length
              const nextIdx = (gameState.currentPlayerIdx + 1) % numPlayers
              const nextPlayer = gameState.players[nextIdx]
              dispatch({ type: 'END_TURN' })
              setSelection({ mode: 'none' })
              // Hot-seat: if the next player is human, hide the board until they confirm
              if (!nextPlayer.isComputer) {
                setAwaitingHandoff(true)
              }
            }}
            className="w-full py-3 rounded-xl font-bold text-sm tracking-wide text-slate-950
              bg-amber-500 hover:bg-amber-400 active:bg-amber-600
              disabled:opacity-30 disabled:cursor-not-allowed
              shadow-lg shadow-amber-500/25 transition-all duration-200">
            End Turn →
          </button>
        </div>

        {/* Global competition reward dialog */}
        {showRewardDialog && globalCompWinner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
            <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-xs w-full shadow-2xl">
              <h3 className="font-display text-lg font-bold text-white uppercase mb-2 text-center">Global Competition!</h3>
              <p className="text-slate-400 text-sm text-center mb-4">
                {gameState.players.find(p => p.id === globalCompWinner)?.name} wins! Choose a reward:
              </p>
              <div className="space-y-2">
                <button onClick={() => { dispatch({ type: 'GLOBAL_COMP_REWARD', playerId: globalCompWinner, rewardType: 'events' }); setShowRewardDialog(false) }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold border border-purple-500/40 text-purple-300 hover:bg-purple-500/10 transition-all">
                  2 Event Cards
                </button>
                <button onClick={() => { dispatch({ type: 'GLOBAL_COMP_REWARD', playerId: globalCompWinner, rewardType: 'followers' }); setShowRewardDialog(false) }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10 transition-all">
                  4 Follower Cards
                </button>
                <button onClick={() => { dispatch({ type: 'GLOBAL_COMP_REWARD', playerId: globalCompWinner, rewardType: 'gp' }); setShowRewardDialog(false) }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 transition-all">
                  1 Great Person Card
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Battle / event summary modal */}
      {gameState.pendingSummary && (
        <SummaryModal
          summary={gameState.pendingSummary}
          onDismiss={() => dispatch({ type: 'DISMISS_SUMMARY' })}
        />
      )}

      {/* Card detail modal */}
      {cardDetail && <CardDetailModal card={cardDetail.card} achievementTicks={cardDetail.ticks} onClose={() => setCardDetail(null)} />}

      {/* Hot-seat handoff screen — covers everything until the next player confirms */}
      {awaitingHandoff && (() => {
        const pidx = gameState.currentPlayerIdx
        const color = PLAYER_COLORS[pidx % 5]
        const player = gameState.players[pidx]
        return (
          <div className="fixed inset-0 z-[200] bg-[#080812] flex flex-col items-center justify-center p-8">
            <div className="text-center max-w-xs w-full">
              <div className={`w-20 h-20 rounded-3xl mx-auto mb-6 flex items-center justify-center text-4xl ${color.bg} border ${color.border}`}>
                ⚔
              </div>
              <p className="text-slate-500 text-xs uppercase tracking-widest mb-2">Next up</p>
              <h2 className={`text-3xl font-bold mb-1 ${color.text}`}>{player.name}</h2>
              <div className="flex items-center justify-center gap-1 mb-8">
                <span className={`w-2 h-2 rounded-full ${color.dot}`} />
                <span className="text-slate-500 text-sm">{player.winningPoints} winning point{player.winningPoints !== 1 ? 's' : ''}</span>
              </div>
              <p className="text-slate-600 text-xs mb-6 leading-relaxed">
                Hand the device to this player.<br />Others look away.
              </p>
              <button
                onClick={() => setAwaitingHandoff(false)}
                className={`w-full py-4 rounded-2xl font-bold text-sm tracking-wide border transition-all
                  ${color.bg} ${color.border} ${color.text} hover:opacity-90 active:scale-95`}>
                I'm Ready →
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type PagePhase = 'home' | 'lobby' | 'game'

const MATCH_MODES: { type: MatchType; icon: string; title: string; desc: string; accent: string; border: string }[] = [
  {
    type:   'casual',
    icon:   '🤝',
    title:  'Casual',
    desc:   'Play vs Human — friendly match, no stakes',
    accent: 'text-emerald-400',
    border: 'border-emerald-700/40 hover:border-emerald-500/60',
  },
  {
    type:   'ranked',
    icon:   '🏆',
    title:  'Ranked',
    desc:   'Play vs Human — competitive, climb the ladder',
    accent: 'text-amber-400',
    border: 'border-amber-700/40 hover:border-amber-500/60',
  },
  {
    type:   'pvc',
    icon:   '🤖',
    title:  'vs Computer',
    desc:   'Fight AI opponents — sharpen your strategy',
    accent: 'text-indigo-400',
    border: 'border-indigo-700/40 hover:border-indigo-500/60',
  },
]

export default function BattlePage() {
  const navigate = useNavigate()
  const { isGuest, exitGuestMode } = useAuth()
  const [pagePhase, setPagePhase] = useState<PagePhase>('home')
  const [selectedMatchType, setSelectedMatchType] = useState<MatchType>('casual')
  const [showGuestPrompt, setShowGuestPrompt] = useState(false)

  // Maintain game state in a ref to allow flexible initialization
  const gameStateRef = useRef<GameState | null>(null)
  const [, setTick] = useState(0)
  const forceUpdate = useCallback(() => setTick(t => t + 1), [])

  const dispatchWithInit = useCallback((action: GameAction) => {
    if (!gameStateRef.current) return
    gameStateRef.current = gameReducer(gameStateRef.current, action)
    forceUpdate()
  }, [forceUpdate])

  const handleStartGameFinal = useCallback((setup: GameSetup) => {
    gameStateRef.current = initGame(setup)
    setPagePhase('game')
    forceUpdate()
  }, [forceUpdate])

  if (pagePhase === 'home') {
    return (
      <div className="relative min-h-screen bg-[#080812] overflow-hidden flex flex-col">
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute top-1/3 left-1/3 w-[500px] h-[500px] rounded-full bg-indigo-700/10 blur-[140px]" />
          <div className="absolute bottom-1/3 right-1/3 w-[500px] h-[500px] rounded-full bg-amber-600/8 blur-[140px]" />
        </div>

        <div className="relative z-10 px-6 py-6 flex items-center gap-4 border-b border-white/[0.06]">
          <button onClick={() => navigate('/home')}
            className="text-slate-500 hover:text-slate-300 transition-colors text-sm">
            ← Home
          </button>
          <h1 className="font-display text-xl font-bold tracking-[0.1em] text-white uppercase">Fight Arena</h1>
        </div>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 gap-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
              style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <span className="text-4xl select-none">⚔</span>
            </div>
            <h2 className="font-display text-2xl font-bold tracking-wide text-white uppercase mb-1">Choose your Battle</h2>
            <p className="text-slate-600 text-sm">Deploy Great People across history's greatest cities</p>
          </div>

          <div className="w-full max-w-sm space-y-3">
            {MATCH_MODES.map(m => {
              const locked = isGuest && m.type !== 'pvc'
              return (
                <button
                  key={m.type}
                  onClick={() => {
                    if (locked) { setShowGuestPrompt(true); return }
                    setSelectedMatchType(m.type); setPagePhase('lobby')
                  }}
                  className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border bg-white/[0.03] transition-all duration-200 text-left
                    ${locked ? 'border-white/[0.06] opacity-50' : m.border}`}>
                  <span className="text-3xl shrink-0">{m.icon}</span>
                  <div className="flex-1">
                    <p className={`text-base font-bold tracking-wide ${locked ? 'text-slate-500' : m.accent}`}>{m.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{m.desc}</p>
                  </div>
                  {locked
                    ? <span className="text-slate-600 text-sm">🔒</span>
                    : <span className="ml-auto text-slate-600 text-sm">›</span>
                  }
                </button>
              )
            })}
          </div>

          {isGuest && (
            <p className="text-xs text-slate-600 text-center max-w-xs">
              Sign in to unlock Casual & Ranked matches
            </p>
          )}

          {/* Guest sign-in prompt overlay */}
          {showGuestPrompt && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
              onClick={() => setShowGuestPrompt(false)}
            >
              <div
                className="bg-[#0e0e1a] border border-white/10 rounded-2xl p-6 max-w-xs w-full space-y-4 text-center"
                onClick={e => e.stopPropagation()}
              >
                <div className="text-4xl">🔒</div>
                <h3 className="text-white font-bold text-lg">Sign In Required</h3>
                <p className="text-slate-400 text-sm">Create a free account to play Casual and Ranked matches against other players.</p>
                <button
                  onClick={() => { setShowGuestPrompt(false); exitGuestMode() }}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors"
                >
                  Sign In / Register
                </button>
                <button
                  onClick={() => setShowGuestPrompt(false)}
                  className="w-full py-2 text-slate-500 text-sm hover:text-slate-400 transition-colors"
                >
                  Maybe later
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (pagePhase === 'lobby') {
    return <BattleLobby matchType={selectedMatchType} onStart={handleStartGameFinal} onBack={() => setPagePhase('home')} />
  }

  if (pagePhase === 'game' && gameStateRef.current) {
    return (
      <BattleGame
        gameState={gameStateRef.current}
        dispatch={dispatchWithInit}
        onExit={() => { gameStateRef.current = null; setPagePhase('home') }}
      />
    )
  }

  return null
}
