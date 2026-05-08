import { io, Socket } from 'socket.io-client'
import { apiClient } from './client'
import type { Match, BattleMessage } from '@/types'

export const battleApi = {
  findMatch: () => apiClient.post<Match>('/battle/match').then((r) => r.data),
  getMatch: (id: string) => apiClient.get<Match>(`/battle/match/${id}`).then((r) => r.data),
  playCard: (matchId: string, cardId: string) =>
    apiClient.post<Match>(`/battle/match/${matchId}/move`, { cardId }).then((r) => r.data),
  forfeit: (matchId: string) => apiClient.post<Match>(`/battle/match/${matchId}/forfeit`).then((r) => r.data),
  leaderboard: () => apiClient.get('/battle/leaderboard').then((r) => r.data),
}

export function createBattleSocket(matchId: string, onMessage: (msg: BattleMessage) => void): Socket {
  const socket = io({ path: '/socket.io' })
  socket.on('connect', () => socket.emit('join_match', { matchId }))
  socket.on('round_result', onMessage)
  socket.on('match_result', onMessage)
  return socket
}
