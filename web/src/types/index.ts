export interface Card {
  id: string
  figureName: string
  era: string
  gender: string
  identities: string[]
  lore: string
  portraitUrl: string
  portraitKey?: string
  years: string
  trait: string
  achievement: string
  politics: number
  strength: number
  culture: number
  wealth: number
  intelligence: number
  technique: number
  belief: number
  reputation: number
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
}

export interface Match {
  id: string
  playerAId: string
  playerBId: string | null
  status: 'waiting' | 'active' | 'finished' | 'forfeited'
  scoreA: number
  scoreB: number
  currentRound: number
}

export interface BattleMessage {
  event: string
  payload: Record<string, string>
}

// ─── Battle Game Types ────────────────────────────────────────────────────────

export type StatKey = 'politics' | 'strength' | 'culture' | 'wealth' | 'intelligence' | 'technique' | 'belief' | 'reputation'

export interface FollowerCard {
  id: string
  name: string
  stat: StatKey
  bonus: number
}

export type EventType = 'local_event' | 'local_survival' | 'global_competition' | 'natural_hazard'

export interface EventCard {
  id: string
  name: string
  type: EventType
  stat?: StatKey          // for local_event, local_survival, global_competition
  hazardType?: string     // for natural_hazard
  description: string
}

export interface OnboardCard {
  instanceId: string
  cardId: string
  type: 'gp' | 'follower'
  playerId: string
  isPublic: boolean
  justDeployed: boolean
  achievementTicks: number
}

export interface LocationState {
  id: string
  name: string
  era: string
  cards: OnboardCard[]
  activeEvent: EventCard | null
  eventRoundsLeft: number
}

export interface PlayerState {
  id: string
  name: string
  isComputer: boolean
  gpHand: string[]
  eventHand: EventCard[]
  followerHand: FollowerCard[]
  archive: string[]
  winningPoints: number
}

export interface TurnActions {
  deployedGP: boolean
  addedFollower: boolean
  movedCards: string[]
  actedCards: string[]
}

export type GameMode = 'generic' | 'scenario'
export type PlayerMode = 'pvp' | 'pvc'
export type EraMode = 'all' | 'single'
export type MatchType = 'casual' | 'ranked' | 'pvc'

export interface GameSetup {
  mode: GameMode
  matchType: MatchType
  playerMode: PlayerMode
  eraMode: EraMode
  singleEra?: string
  playerNames: string[]
  numComputers: number
}

export interface GameState {
  setup: GameSetup
  phase: 'playing' | 'ended'
  players: PlayerState[]
  locations: LocationState[]
  currentPlayerIdx: number
  round: number
  turnActions: TurnActions
  gpDeck: string[]
  eventDeck: EventCard[]
  followerDeck: FollowerCard[]
  winner: string | null
  log: string[]
  globalCompetitionActive: EventCard | null
}
