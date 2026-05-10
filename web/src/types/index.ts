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
  characteristics: string
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
