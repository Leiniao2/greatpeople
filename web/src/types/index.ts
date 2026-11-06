import type { AchievementEvent } from '@/battle/achievements'
export interface Card {
  id: string
  figureName: string
  era: string
  gender: string
  identities: string[]
  countries?: string[]
  lore: string
  portraitUrl: string
  portraitKey?: string
  years: string
  /** Birth year; negative years are BC. */
  born: number
  /** Death year, or null for someone still living (they live until the timeline ends). */
  died: number | null
  /** Age at which the career (the years the card can be played) begins; defaults to 18. */
  careerAge?: number
  trait: string
  /** How the legacy is earned, in words. Kept under this name for the iOS and Android card models. */
  achievement: string
  legacy: Legacy
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

/** Shape returned by GET /auth/me. */
export interface UserProfile {
  id: string
  email: string
  displayName: string
  elo: number
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

/** Where a contest legacy applies: attacking or defending in a Local Event, survival checks (survival scenarios and hazards), or global competitions. */
export type LegacyContext = 'attack' | 'defend' | 'survival' | 'competition' | 'any'

/** What an active legacy does for its owner. The battle engine applies every kind generically. */
export type LegacyEffect =
  | { kind: 'contest'; stat: StatKey | 'any'; amount: number; context: LegacyContext }
  | { kind: 'follower'; stat: StatKey | 'any'; amount: number }
  | { kind: 'hazard_shield' }
  | { kind: 'longevity'; years: number }
  | { kind: 'prodigy'; years: number }
  | { kind: 'successors'; count: number }
  /** More Great People held at once: each slot founds a lineage of its own. */
  | { kind: 'slots'; count: number }
  /** More cities on the board, for every player, while the legacy is in effect. */
  | { kind: 'locations'; count: number }
  | { kind: 'income'; card: 'event' | 'follower'; every: number }

/** A Great Person's legacy: earned once by winning `unlock.wins` fights in `unlock.stat`, then kept by the player for the rest of the game. */
export interface Legacy {
  name: string
  unlock: { stat: StatKey; wins: number }
  effect: LegacyEffect
  /** One line of history: why this figure leaves this mark. */
  flavour?: string
}

export interface FollowerCard {
  id: string
  name: string
  stat: StatKey
  bonus: number
  imageKey: string
}

export type EventType = 'local_event' | 'local_survival' | 'global_competition' | 'natural_hazard'

export interface EventCard {
  id: string
  name: string
  type: EventType
  stat?: StatKey          // for local_event, local_survival, global_competition
  hazardType?: string     // for natural_hazard
  description: string
  /** 'city': the location fell into this state by itself (no player started it). */
  origin?: 'player' | 'city'
  /** Local survival: players who have already taken the prize for surviving it. */
  rewarded?: string[]
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
  imageKey?: string
  countries?: string[]
  cards: OnboardCard[]
  activeEvent: EventCard | null
  eventRoundsLeft: number
}

export interface PlayerState {
  id: string
  name: string
  isComputer: boolean
  /** Great People this player holds off the board: not yet born, too young, or in their career. */
  gpHand: string[]
  eventHand: EventCard[]
  followerHand: FollowerCard[]
  /** Great People who have died (naturally or in play). */
  archive: string[]
  winningPoints: number
  /** Great People the player retired: out of play, but their successor still waits for their real death year. */
  retired: string[]
  /** One entry per Great Person who died and still needs a successor chosen. */
  pendingSuccessors: PendingSuccessor[]
  /** Card ids whose legacy this player has earned. */
  legacies: string[]
  /** The earned legacies currently in effect (at most the number of legacy slots). */
  activeLegacies: string[]
  /** Great Person slots won outside legacies (the global competition prize). */
  extraSlots?: number
  /** Achievement progress per card id (streaks, cities visited). */
  achievementMemo?: Record<string, Record<string, unknown>>
}

export interface PendingSuccessor {
  /** The Great Person who died, or null for a new lineage (the opening pick or a new slot). */
  predecessor: string | null
  year: number
  /** Why the choice is owed; a missing reason means a succession. */
  reason?: 'start' | 'slot'
  /** A fixed set of candidates (the opening pick); otherwise those born after the current year. */
  options?: string[]
}

/** Life stage of a Great Person at the current year. */
export type LifeStatus = 'unborn' | 'youth' | 'active' | 'retired' | 'dead'

export interface TurnActions {
  deployedGP: boolean
  addedFollower: boolean
  movedCards: string[]
  actedCards: string[]
  /** A legacy was switched on or off this turn (one change per turn). */
  legacyChanged?: boolean
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
  /** Scripted games (the Epic fight lessons) turn the random city states off. */
  noHazards?: boolean
  /** Real-time history: years pass, Great People are born, age, die and are succeeded. Every Battle-tab game uses it; the scripted Epic lessons do not. */
  timeline?: boolean
  /** All-era games: the era whose start the game opens on (random when omitted). */
  startEra?: string
  /**
   * Free play (the Battle tab's default): no dates, nobody ages or is born;
   * a Great Person leaves play only when killed or retired, the game lasts
   * FREE_PLAY_ROUNDS rounds or until a player has no Great Person left, and
   * the most legacies wins.  Without it the game runs on real history.
   */
  freePlay?: boolean
  /** Card ids the human players own; they may only bring these into play. Omitted: every card. */
  owned?: string[]
  /** How strong and how bold the computer players are. */
  cpuLevel?: CpuLevel
  /** Fixes the free-play shuffles for this game (set by initGame). */
  seed?: number
}

export type CpuLevel = 'easy' | 'normal' | 'hard'

// ── Combat / event summary (shown in modal after resolution) ─────────────────

export interface CardContrib {
  type: 'gp' | 'follower' | 'legacy'
  name: string
  portraitUrl?: string
  imageKey?: string
  baseStat: number
  traitBonus: number
  followerBonus: number
  locationBonus: number
}

export interface CombatSide {
  playerName: string
  cards: CardContrib[]
  total: number
}

export interface CombatSummary {
  kind: 'combat'
  locationName: string
  stat: StatKey
  attacker: CombatSide
  defender: CombatSide
  result: 'attacker' | 'defender' | 'draw'
  kill: boolean
  locationAbility?: string
}

export interface EventPlayerResult {
  playerName: string
  total: number
  threshold: number
  survived: boolean
  cards: CardContrib[]
}

export interface EventSummary {
  kind: 'event'
  eventName: string
  eventType: string
  stat?: StatKey
  locationName: string
  threshold: number
  results: EventPlayerResult[]
  winnerName?: string
}

/** Shown after time jumped ahead because no human player had a Great Person in their career. */
export interface TimeSkipSummary {
  kind: 'timeskip'
  fromYear: number
  toYear: number
  lines: string[]
}

export type GameSummary = CombatSummary | EventSummary | TimeSkipSummary

export interface GameState {
  setup: GameSetup
  phase: 'playing' | 'ended'
  players: PlayerState[]
  locations: LocationState[]
  currentPlayerIdx: number
  round: number
  /** Current year (negative is BC). One round is one year in every era. */
  year: number
  startYear: number
  turnActions: TurnActions
  gpDeck: string[]
  eventDeck: EventCard[]
  followerDeck: FollowerCard[]
  winner: string | null
  log: string[]
  globalCompetitionActive: EventCard | null
  pendingSummary: GameSummary | null
  /** Further contests resolved at the same moment, shown one after another. */
  summaryQueue?: GameSummary[]
  /** Prizes won and not yet taken, oldest first (see PendingReward). */
  pendingRewards?: PendingReward[]
  /** What happened in the last action, for the achievements (consumed by gameReducer). */
  achievementEvents?: AchievementEvent[]
  /** Players who acted (deploy, follower, move, attack, retrieve) this year. */
  roundActed?: string[]
}

/**
 * A prize for winning a contest: the winner takes 2 Followers or 1 Event
 * card, times `size` (2 for the global competition).
 */
export interface PendingReward {
  playerId: string
  size: 1 | 2
  /** What was won, for the reward pop-up ("Won the attack at Rome"). */
  reason: string
}
