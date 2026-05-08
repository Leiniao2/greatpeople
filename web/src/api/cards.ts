import { apiClient } from './client'
import type { Card } from '@/types'

export const cardsApi = {
  getAll: () => apiClient.get<{ cards: Card[] }>('/profile/cards').then((r) => r.data.cards),

  sync: (cards: Card[]) =>
    apiClient.post<{ cards: Card[] }>('/profile/cards/sync', { cards }).then((r) => r.data.cards),
}
