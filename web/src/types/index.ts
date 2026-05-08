export type CardTier = 'common' | 'rare' | 'epic' | 'legendary'
export type Domain = 'science' | 'arts' | 'politics' | 'philosophy' | 'sports' | 'other'

export interface Card {
  id: string
  figureName: string
  era: string
  domain: Domain
  influence: number
  innovation: number
  legacy: number
  tier: CardTier
  lore: string
  portraitUrl: string
  years: string
  identities: string[]
  characteristics: string
  achievement: string
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
