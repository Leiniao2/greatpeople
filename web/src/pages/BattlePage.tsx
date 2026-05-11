import { useEffect, useCallback, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  Card, FollowerCard, EventCard, OnboardCard, LocationState,
  PlayerState, GameState, GameSetup,
  StatKey, EventType, EraMode, PlayerMode, MatchType,
} from '@/types'
import demoCardsJson from '@/data/demo_cards.json'

// ─── Static Card Data ─────────────────────────────────────────────────────────

const ALL_GP_CARDS: Card[] = (demoCardsJson as Card[]).map(c => ({
  ...c,
  portraitUrl: `/portraits/portrait_${c.portraitKey}.jpeg`,
}))

const FOLLOWER_TEMPLATES: Omit<FollowerCard, 'id'>[] = [
  { name: 'Scholar',    stat: 'intelligence', bonus: 6 },
  { name: 'Soldier',    stat: 'strength',     bonus: 6 },
  { name: 'Merchant',   stat: 'wealth',       bonus: 6 },
  { name: 'Artist',     stat: 'culture',      bonus: 6 },
  { name: 'Engineer',   stat: 'technique',    bonus: 6 },
  { name: 'Priest',     stat: 'belief',       bonus: 6 },
  { name: 'Politician', stat: 'politics',     bonus: 6 },
  { name: 'Herald',     stat: 'reputation',   bonus: 6 },
]

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
          ? `Local survival: cards with ${STAT_LABELS[stat]} < 10 are discarded.`
          : `Global competition: player with highest total ${STAT_LABELS[stat]} (public cards) wins a prize bundle.`,
      })
    }
  }

  for (const hz of HAZARD_TYPES) {
    deck.push({
      id: `event-hazard-${hz.toLowerCase()}-${counter++}`,
      name: `Natural Hazard: ${hz}`,
      type: 'natural_hazard',
      hazardType: hz,
      description: `Natural hazard (${hz}): any card at this location with total stats < 100 is discarded.`,
    })
  }

  return shuffle(deck)
}

// ─── Location Data ────────────────────────────────────────────────────────────

interface LocationTemplate { name: string; era: string }

const LOCATION_POOL: LocationTemplate[] = [
  // Ancient
  { name: 'Babylon',        era: 'Ancient' },
  { name: 'Alexandria',     era: 'Ancient' },
  { name: 'Athens',         era: 'Ancient' },
  { name: 'Rome',           era: 'Ancient' },
  { name: 'Memphis',        era: 'Ancient' },
  { name: 'Ur',             era: 'Ancient' },
  // Medieval
  { name: 'Constantinople', era: 'Medieval' },
  { name: 'Baghdad',        era: 'Medieval' },
  { name: "Chang'an",       era: 'Medieval' },
  { name: 'Samarkand',      era: 'Medieval' },
  { name: 'Kyoto',          era: 'Medieval' },
  { name: 'Timbuktu',       era: 'Medieval' },
  // Renaissance
  { name: 'Florence',       era: 'Renaissance' },
  { name: 'Venice',         era: 'Renaissance' },
  { name: 'Lisbon',         era: 'Renaissance' },
  { name: 'Wittenberg',     era: 'Renaissance' },
  { name: 'Bruges',         era: 'Renaissance' },
  { name: 'Tenochtitlan',   era: 'Renaissance' },
  // Steam
  { name: 'London',         era: 'Steam' },
  { name: 'Paris',          era: 'Steam' },
  { name: 'New York',       era: 'Steam' },
  { name: 'Delhi',          era: 'Steam' },
  { name: 'Edo',            era: 'Steam' },
  { name: 'Vienna',         era: 'Steam' },
  // Electricity
  { name: 'Berlin',         era: 'Electricity' },
  { name: 'Tokyo',          era: 'Electricity' },
  { name: 'New York City',  era: 'Electricity' },
  { name: 'Chicago',        era: 'Electricity' },
  { name: 'Moscow',         era: 'Electricity' },
  { name: 'Cairo',          era: 'Electricity' },
  // Information
  { name: 'Silicon Valley', era: 'Information' },
  { name: 'Geneva',         era: 'Information' },
  { name: 'Beijing',        era: 'Information' },
  { name: 'São Paulo',      era: 'Information' },
  { name: 'Dubai',          era: 'Information' },
  { name: 'Lagos',          era: 'Information' },
]

const ERAS = ['Ancient', 'Medieval', 'Renaissance', 'Steam', 'Electricity', 'Information']

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

function pickLocations(eraMode: EraMode, singleEra?: string): LocationTemplate[] {
  if (eraMode === 'single' && singleEra) {
    const pool = LOCATION_POOL.filter(l => l.era === singleEra)
    return shuffle(pool).slice(0, 6)
  }
  // All era: pick 1 from each of the 6 eras
  const result: LocationTemplate[] = []
  for (const era of ERAS) {
    const pool = LOCATION_POOL.filter(l => l.era === era)
    const pick = shuffle(pool).slice(0, 1)
    result.push(...pick)
  }
  return result
}

function getGPCard(id: string): Card | undefined {
  return ALL_GP_CARDS.find(c => c.id === id)
}

function computeLocationTotal(locationCards: OnboardCard[], playerId: string, stat: StatKey, gpCards: Record<string, Card>, followerCards: Record<string, FollowerCard>): number {
  let total = 0
  for (const oc of locationCards) {
    if (oc.playerId !== playerId) continue
    if (oc.type === 'gp') {
      const gp = gpCards[oc.cardId]
      if (gp) total += gp[stat]
    } else {
      const f = followerCards[oc.cardId]
      if (f && f.stat === stat) total += f.bonus
    }
  }
  return total
}

function computeLocationTotalStats(locationCards: OnboardCard[], playerId: string, gpCards: Record<string, Card>, followerCards: Record<string, FollowerCard>): number {
  let total = 0
  for (const oc of locationCards) {
    if (oc.playerId !== playerId) continue
    if (oc.type === 'gp') {
      const gp = gpCards[oc.cardId]
      if (gp) {
        total += gp.politics + gp.strength + gp.culture + gp.wealth +
                 gp.intelligence + gp.technique + gp.belief + gp.reputation
      }
    } else {
      const f = followerCards[oc.cardId]
      if (f) total += f.bonus
    }
  }
  return total
}

function getHighestStat(card: Card): { stat: StatKey; value: number } {
  let best: StatKey = 'politics'
  let bestVal = 0
  for (const s of STATS) {
    if (card[s] > bestVal) { bestVal = card[s]; best = s }
  }
  return { stat: best, value: bestVal }
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
    cards: [],
    activeEvent: null,
    eventRoundsLeft: 0,
  }))

  // Natural hazards: randomly place 1 at game start
  const hazardEventDeck = makeEventDeck().filter(e => e.type === 'natural_hazard')
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

function buildLookups(state: GameState) {
  const gpMap: Record<string, Card> = {}
  for (const c of ALL_GP_CARDS) gpMap[c.id] = c

  const followerMap: Record<string, FollowerCard> = {}
  for (const p of state.players) {
    for (const f of p.followerHand) followerMap[f.id] = f
  }
  // Also find followers that are on board
  for (const loc of state.locations) {
    for (const oc of loc.cards) {
      if (oc.type === 'follower') {
        // Look up from player hands OR already found
        if (!followerMap[oc.cardId]) {
          // try to find in any player
          for (const p of state.players) {
            const f = p.followerHand.find(x => x.id === oc.cardId)
            if (f) { followerMap[f.id] = f; break }
          }
        }
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
          ?? { id: card.cardId, name: 'Follower', stat: 'culture' as StatKey, bonus: 6 }
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
          if (c.instanceId === action.instanceId && c.playerId === player.id && c.type === 'gp' && c.achievementTicks >= 3 && c.isPublic) {
            found = true
            gpName = getGPCard(c.cardId)?.figureName ?? 'Card'
            return { ...c, achievementTicks: 0 }
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

      const myTotal = computeLocationTotal(loc.cards, player.id, stat, gpMap, followerMap)
      const theirTotal = computeLocationTotal(loc.cards, theirCard.playerId, stat, gpMap, followerMap)

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
          // Achievement tick for winner's GP
          if (myWon && myCard.type === 'gp') {
            newLocations = newLocations.map(l => ({
              ...l,
              cards: l.cards.map(c =>
                c.instanceId === action.myInstanceId ? { ...c, achievementTicks: c.achievementTicks + 1 } : c
              ),
            }))
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
              ?? { id: loserCard.cardId, name: 'Follower', stat: 'culture' as StatKey, bonus: 6 }
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

      return {
        ...state,
        players: newPlayers,
        locations: newLocations,
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

      if (isNewRound) {
        newRound = state.round + 1

        // Resolve global competition
        if (newGlobalComp) {
          const { gpMap } = buildLookups(state)
          const stat = newGlobalComp.stat!
          let bestTotal = -1
          let bestPlayerId = ''
          for (const p of newPlayers) {
            let total = 0
            for (const loc of newLocations) {
              for (const oc of loc.cards) {
                if (oc.playerId === p.id && oc.type === 'gp' && oc.isPublic) {
                  const gp = gpMap[oc.cardId]
                  if (gp) total += gp[stat]
                }
              }
            }
            if (total > bestTotal) { bestTotal = total; bestPlayerId = p.id }
          }
          if (bestPlayerId) {
            logEntries.push(`Global competition resolved! Winner: ${newPlayers.find(p => p.id === bestPlayerId)?.name} (${STAT_LABELS[stat]}: ${bestTotal})`)
          }
          newGlobalComp = null
        }

        // Resolve local survival events
        newLocations = newLocations.map(loc => {
          if (!loc.activeEvent) return loc
          const event = loc.activeEvent
          let updatedCards = [...loc.cards]
          const { gpMap, followerMap } = buildLookups({ ...state, locations: newLocations })

          if (event.type === 'local_survival' && event.stat) {
            const stat = event.stat
            const playerGroups = new Set(updatedCards.map(c => c.playerId))
            for (const pid of playerGroups) {
              const total = computeLocationTotal(updatedCards, pid, stat, gpMap, followerMap)
              if (total < 10) {
                updatedCards = updatedCards.filter(c => c.playerId !== pid)
                logEntries.push(`Local survival: ${newPlayers.find(p => p.id === pid)?.name}'s cards in ${loc.name} discarded (${STAT_LABELS[stat]} < 10)`)
              }
            }
          }

          if (event.type === 'natural_hazard') {
            const playerGroups = new Set(updatedCards.map(c => c.playerId))
            for (const pid of playerGroups) {
              const total = computeLocationTotalStats(updatedCards, pid, gpMap, followerMap)
              if (total < 100) {
                updatedCards = updatedCards.filter(c => c.playerId !== pid)
                logEntries.push(`Natural hazard: ${newPlayers.find(p => p.id === pid)?.name}'s cards in ${loc.name} discarded (total < 100)`)
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
          const hazardEvents = makeEventDeck().filter(e => e.type === 'natural_hazard')
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
        log: [...logEntries, `Round ${newRound}: ${state.players[nextIdx].name}'s turn.`, ...state.log.slice(0, 19)],
      }
    }

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
  activeStat?: StatKey
  onClick: () => void
  gpMap: Record<string, Card>
  followerTemplates: Record<string, FollowerCard>
}

function CompactCard({ card, isCurrentPlayer, isSelected, activeStat, onClick, gpMap, followerTemplates }: CompactCardProps) {
  const gp = card.type === 'gp' ? gpMap[card.cardId] : null
  const follower = card.type === 'follower' ? followerTemplates[card.cardId] : null

  const isPrivate = !card.isPublic && !isCurrentPlayer
  const era = gp?.era ?? 'Electricity'
  const eraColor = ERA_COLORS[era] ?? ERA_COLORS.Electricity

  const displayStat = activeStat ? activeStat : (gp ? getHighestStat(gp).stat : null)
  const displayValue = gp && displayStat ? gp[displayStat] : null

  const borderCls = isSelected
    ? 'border-2 border-amber-400 shadow-lg shadow-amber-400/30'
    : isCurrentPlayer
    ? 'border border-amber-500/40'
    : 'border border-indigo-500/30'

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-between rounded-lg p-1 w-14 h-20 transition-all duration-150
        ${eraColor} ${borderCls} ${isSelected ? 'scale-105' : 'hover:scale-[1.03]'}
        ${isPrivate ? 'opacity-50' : 'opacity-100'}`}
    >
      {card.justDeployed && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border border-black" title="Just deployed" />
      )}
      {card.achievementTicks > 0 && (
        <span className="absolute -top-1 -left-1 text-[8px] text-amber-300 font-bold">{card.achievementTicks}</span>
      )}
      <div className="w-full flex-1 flex items-center justify-center">
        {isPrivate ? (
          <span className="text-slate-400 text-lg font-bold">?</span>
        ) : (
          <div className="text-center">
            <div className="text-[9px] text-white/80 font-medium leading-tight truncate w-12">
              {gp ? gp.figureName : follower?.name ?? 'Follower'}
            </div>
            {displayValue !== null && (
              <div className="text-[10px] text-amber-300 font-bold mt-0.5">{displayValue}</div>
            )}
            {follower && (
              <div className="text-[9px] text-indigo-300">+{follower.bonus} {STAT_LABELS[follower.stat].slice(0, 3)}</div>
            )}
          </div>
        )}
      </div>
      {!isPrivate && !card.isPublic && (
        <span className="text-[8px] text-slate-500">private</span>
      )}
    </button>
  )
}

interface HandCardProps {
  cardId: string
  type: 'gp' | 'event' | 'follower'
  isSelected: boolean
  onClick: () => void
  gpMap: Record<string, Card>
  eventCard?: EventCard
  followerCard?: FollowerCard
}

function HandCard({ cardId, type, isSelected, onClick, gpMap, eventCard, followerCard }: HandCardProps) {
  const gp = type === 'gp' ? gpMap[cardId] : null
  const era = gp?.era ?? 'Steam'
  const eraColor = ERA_COLORS[era] ?? ERA_COLORS.Steam
  const borderCls = isSelected ? 'border-2 border-amber-400 ring-2 ring-amber-400/30' : 'border border-white/10'

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-between rounded-xl p-1.5 w-16 h-24 transition-all duration-150 shrink-0
        ${eraColor} ${borderCls} ${isSelected ? 'scale-105' : 'hover:scale-[1.03]'}`}
    >
      {type === 'gp' && gp && (
        <>
          <span className="text-[9px] text-white font-semibold leading-tight text-center truncate w-full">{gp.figureName}</span>
          <div className="w-8 h-8 rounded-md bg-black/30 flex items-center justify-center">
            <span className="text-lg select-none">
              {gp.era === 'Ancient' ? '🏛' : gp.era === 'Medieval' ? '⚔' : gp.era === 'Renaissance' ? '🎨' : gp.era === 'Steam' ? '⚙' : gp.era === 'Electricity' ? '⚡' : '💻'}
            </span>
          </div>
          <div className="text-[9px] text-amber-300 text-center">
            {STAT_LABELS[getHighestStat(gp).stat].slice(0, 3)}: {getHighestStat(gp).value}
          </div>
        </>
      )}
      {type === 'event' && eventCard && (
        <>
          <span className="text-[8px] text-purple-300 uppercase tracking-wide">Event</span>
          <span className="text-[9px] text-white font-medium leading-tight text-center">{eventCard.name}</span>
          <span className="text-[8px] text-purple-400 text-center">{eventCard.stat ? STAT_LABELS[eventCard.stat].slice(0, 3) : 'Hazard'}</span>
        </>
      )}
      {type === 'follower' && followerCard && (
        <>
          <span className="text-[8px] text-indigo-300 uppercase tracking-wide">Follower</span>
          <span className="text-[9px] text-white font-medium text-center">{followerCard.name}</span>
          <span className="text-[8px] text-indigo-300">+{followerCard.bonus} {STAT_LABELS[followerCard.stat].slice(0, 3)}</span>
        </>
      )}
    </button>
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
  const [numHumans, setNumHumans] = useState(1)
  const [numComputers, setNumComputers] = useState(1)
  const [playerNames, setPlayerNames] = useState<string[]>(['You'])

  const updatePlayerName = (i: number, name: string) => {
    const names = [...playerNames]
    names[i] = name
    setPlayerNames(names)
  }

  const adjustHumans = (n: number) => {
    const max = isPvC ? 4 : 5
    const clamped = Math.max(1, Math.min(max, n))
    setNumHumans(clamped)
    const names = Array.from({ length: clamped }, (_, i) => playerNames[i] ?? `Player ${i + 1}`)
    setPlayerNames(names)
  }

  const totalPlayers = isPvC ? numHumans + numComputers : numHumans

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

        {/* Human count + names */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500 uppercase tracking-widest">
              {isPvC ? 'You' : 'Human Players'}
            </p>
            {!isPvC && (
              <div className="flex items-center gap-2">
                <button onClick={() => adjustHumans(numHumans - 1)}
                  className="w-7 h-7 rounded-lg bg-slate-800 border border-white/10 text-white text-sm hover:bg-slate-700 transition-colors">-</button>
                <span className="text-white text-sm w-4 text-center">{numHumans}</span>
                <button onClick={() => adjustHumans(numHumans + 1)}
                  className="w-7 h-7 rounded-lg bg-slate-800 border border-white/10 text-white text-sm hover:bg-slate-700 transition-colors">+</button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {Array.from({ length: numHumans }, (_, i) => (
              <input key={i} value={playerNames[i] ?? ''} onChange={e => updatePlayerName(i, e.target.value)}
                placeholder={isPvC ? 'Your name' : `Player ${i + 1} name`}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/50" />
            ))}
          </div>
        </div>

        {/* Computer count (PvC only) */}
        {isPvC && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500 uppercase tracking-widest">Computer Opponents</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setNumComputers(Math.max(1, numComputers - 1))}
                  className="w-7 h-7 rounded-lg bg-slate-800 border border-white/10 text-white text-sm hover:bg-slate-700 transition-colors">-</button>
                <span className="text-white text-sm w-4 text-center">{numComputers}</span>
                <button onClick={() => setNumComputers(Math.min(4, numComputers + 1))}
                  className="w-7 h-7 rounded-lg bg-slate-800 border border-white/10 text-white text-sm hover:bg-slate-700 transition-colors">+</button>
              </div>
            </div>
            <p className="text-[11px] text-slate-600">Total players: {totalPlayers}</p>
          </div>
        )}

        {totalPlayers > 5 && (
          <p className="text-red-400 text-xs">Maximum 5 players total.</p>
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
            if (totalPlayers > 5) return
            onStart({
              mode: 'generic',
              matchType,
              playerMode,
              eraMode,
              singleEra: eraMode === 'single' ? singleEra : undefined,
              playerNames: playerNames.slice(0, numHumans),
              numComputers: isPvC ? numComputers : 0,
            })
          }}
          disabled={totalPlayers > 5}
          className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wide text-slate-950
            bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed
            shadow-lg shadow-amber-500/25 transition-all duration-200">
          Start Game
        </button>
      </div>
    </div>
  )
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

interface BattleGameProps {
  gameState: GameState
  dispatch: React.Dispatch<GameAction>
  onExit: () => void
}

function BattleGame({ gameState, dispatch, onExit }: BattleGameProps) {
  const [selection, setSelection] = useState<Selection>({ mode: 'none' })
  const [attackKill, setAttackKill] = useState(false)
  const [showRewardDialog, setShowRewardDialog] = useState(false)
  const [globalCompWinner] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const computerTurnRef = useRef(false)

  const currentPlayer = gameState.players[gameState.currentPlayerIdx]
  const isMyTurn = !currentPlayer.isComputer

  // Build lookup maps
  const gpMap: Record<string, Card> = {}
  for (const c of ALL_GP_CARDS) gpMap[c.id] = c

  const followerMap: Record<string, FollowerCard> = {}
  for (const p of gameState.players) {
    for (const f of p.followerHand) followerMap[f.id] = f
  }

  const canDeployGP = !gameState.turnActions.deployedGP && currentPlayer.gpHand.length > 0
  const canAddFollower = !gameState.turnActions.addedFollower && currentPlayer.followerHand.length > 0
  const canEndTurn = gameState.phase === 'playing'

  const selectedOnboard = selection.onboardInstanceId
    ? gameState.locations.flatMap(l => l.cards).find(c => c.instanceId === selection.onboardInstanceId) ?? null
    : null

  const canClaimAchievement = selectedOnboard?.type === 'gp'
    && selectedOnboard.playerId === currentPlayer.id
    && selectedOnboard.achievementTicks >= 3
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
      // 1. Deploy best GP to location with most opponents
      if (currentPlayer.gpHand.length > 0 && !gameState.turnActions.deployedGP) {
        const bestCard = currentPlayer.gpHand.reduce((best, id) => {
          const gp = gpMap[id]
          if (!gp) return best
          const bestGp = gpMap[best]
          if (!bestGp) return id
          const gpTotal = gp.politics + gp.strength + gp.culture + gp.wealth + gp.intelligence + gp.technique + gp.belief + gp.reputation
          const bestTotal = bestGp.politics + bestGp.strength + bestGp.culture + bestGp.wealth + bestGp.intelligence + bestGp.technique + bestGp.belief + bestGp.reputation
          return gpTotal > bestTotal ? id : best
        }, currentPlayer.gpHand[0])

        // Find location with most opponents' cards
        const targetLoc = gameState.locations.reduce((best, loc) => {
          const oppCount = loc.cards.filter(c => c.playerId !== currentPlayer.id).length
          const bestOppCount = best.cards.filter(c => c.playerId !== currentPlayer.id).length
          return oppCount > bestOppCount ? loc : best
        }, gameState.locations[0])

        dispatch({ type: 'DEPLOY_GP', cardId: bestCard, locationId: targetLoc.id, isPublic: false })
      }

      // 2. Add follower if possible
      if (currentPlayer.followerHand.length > 0 && !gameState.turnActions.addedFollower) {
        const locWithGP = gameState.locations.find(l => l.cards.some(c => c.type === 'gp' && c.playerId === currentPlayer.id))
        if (locWithGP) {
          const follower = currentPlayer.followerHand[0]
          dispatch({ type: 'ADD_FOLLOWER', followerId: follower.id, locationId: locWithGP.id, instanceId: follower.id })
        }
      }

      // 3. Claim achievement if possible
      for (const loc of gameState.locations) {
        for (const oc of loc.cards) {
          if (oc.type === 'gp' && oc.playerId === currentPlayer.id && oc.achievementTicks >= 3 && oc.isPublic) {
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

  const getActiveEventStat = (loc: LocationState): StatKey | undefined => {
    return loc.activeEvent?.stat
  }

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
      <div className="relative z-10 px-4 py-2.5 flex items-center gap-3 border-b border-white/[0.06] bg-black/20 shrink-0">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 uppercase tracking-widest">Round {gameState.round}</span>
            <span className="text-white/20">·</span>
            <span className="text-amber-400 text-xs font-semibold">{currentPlayer.name}'s Turn</span>
            {currentPlayer.isComputer && (
              <span className="text-[10px] bg-slate-800 border border-white/10 rounded px-1.5 py-0.5 text-slate-400">CPU</span>
            )}
          </div>
          <div className="flex gap-2 mt-0.5">
            {gameState.players.map(p => (
              <div key={p.id} className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500">{p.name.split(' ')[0]}</span>
                <span className="text-[10px] font-bold text-amber-400">{p.winningPoints}pt</span>
              </div>
            ))}
          </div>
        </div>
        <button onClick={onExit} className="text-slate-600 hover:text-slate-400 text-xs transition-colors px-2">Exit</button>
      </div>

      {/* Board: Locations */}
      <div className="relative z-10 flex-shrink-0 overflow-x-auto py-2 px-3 border-b border-white/[0.06]">
        <div className="flex gap-2 w-max">
          {gameState.locations.map(loc => {
            const activeStat = getActiveEventStat(loc)
            const isLocationTarget = selection.mode === 'move-target' || selection.mode === 'deploy-gp' || selection.mode === 'add-follower' || selection.mode === 'start-event'

            return (
              <div
                key={loc.id}
                onClick={() => handleLocationTap(loc.id)}
                className={`relative rounded-xl border p-2 w-28 cursor-pointer transition-all duration-150
                  ${ERA_COLORS[loc.era] ?? 'bg-slate-900/60 border-slate-700/40'}
                  ${isLocationTarget ? 'border-amber-400/60 ring-1 ring-amber-400/30' : ''}`}
              >
                {/* Location name */}
                <div className="mb-1">
                  <p className={`text-[10px] font-bold truncate ${ERA_TEXT[loc.era] ?? 'text-slate-300'}`}>{loc.name}</p>
                  <p className="text-[9px] text-slate-600">{loc.era}</p>
                </div>

                {/* Active event badge */}
                {loc.activeEvent && (
                  <div className={`text-[8px] text-white px-1 py-0.5 rounded mb-1 truncate ${getEventBadgeColor(loc.activeEvent.type)}`}>
                    {loc.activeEvent.name}
                  </div>
                )}

                {/* Cards per player */}
                {gameState.players.map(p => {
                  const playerCards = loc.cards.filter(c => c.playerId === p.id)
                  if (playerCards.length === 0) return (
                    <div key={p.id} className="mb-1 h-4 flex items-center">
                      <span className="text-[9px] text-slate-700 italic">{p.name.split(' ')[0]}: –</span>
                    </div>
                  )
                  return (
                    <div key={p.id} className="mb-1">
                      <p className="text-[8px] text-slate-600 mb-0.5">{p.name.split(' ')[0]}</p>
                      <div className="flex flex-wrap gap-0.5">
                        {playerCards.map(oc => (
                          <CompactCard
                            key={oc.instanceId}
                            card={oc}
                            isCurrentPlayer={p.id === currentPlayer.id}
                            isSelected={selection.onboardInstanceId === oc.instanceId}
                            activeStat={activeStat}
                            onClick={() => handleOnboardCardTap(oc, loc.id)}
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
            <p key={i} className={`text-[10px] leading-tight ${i === 0 ? 'text-slate-400' : 'text-slate-600'}`}>
              {entry}
            </p>
          ))}
        </div>
      </div>

      {/* Your Hand */}
      {isMyTurn && (
        <div className="relative z-10 px-3 py-2 border-b border-white/[0.06] shrink-0">
          <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1.5">Your Hand</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {currentPlayer.gpHand.map((id, i) => (
              <HandCard
                key={id}
                cardId={id}
                type="gp"
                isSelected={selection.handCardId === id}
                onClick={() => handleHandCardTap(id, 'gp', i)}
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
      <div className="relative z-10 flex-1 px-3 py-3 flex flex-col gap-2">
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
            if (!loc?.activeEvent || loc.activeEvent.type === 'global_competition') return null
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
            onClick={() => { dispatch({ type: 'END_TURN' }); setSelection({ mode: 'none' }) }}
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
  const [pagePhase, setPagePhase] = useState<PagePhase>('home')
  const [selectedMatchType, setSelectedMatchType] = useState<MatchType>('casual')

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
          <button onClick={() => navigate('/collection')}
            className="text-slate-500 hover:text-slate-300 transition-colors text-sm">
            ← Collection
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
            {MATCH_MODES.map(m => (
              <button
                key={m.type}
                onClick={() => { setSelectedMatchType(m.type); setPagePhase('lobby') }}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border bg-white/[0.03] transition-all duration-200 text-left ${m.border}`}>
                <span className="text-3xl shrink-0">{m.icon}</span>
                <div>
                  <p className={`text-base font-bold tracking-wide ${m.accent}`}>{m.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{m.desc}</p>
                </div>
                <span className="ml-auto text-slate-600 text-sm">›</span>
              </button>
            ))}
          </div>
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
