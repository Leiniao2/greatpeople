import { describe, it, expect } from 'vitest'
import type { Card, CardTier, Domain, AuthResponse, Match } from '@/types'

// Runtime helpers — build valid objects that satisfy the TypeScript interfaces

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'test-id',
    figureName: 'Test Figure',
    era: 'Modern',
    domain: 'science',
    influence: 50,
    innovation: 60,
    legacy: 70,
    tier: 'common',
    lore: 'Some lore',
    portraitUrl: '',
    years: '2000–2024',
    identities: [],
    characteristics: '',
    achievement: '',
    ...overrides,
  }
}

describe('Card type shape', () => {
  it('accepts all valid tier values', () => {
    const tiers: CardTier[] = ['common', 'rare', 'epic', 'legendary']
    tiers.forEach((tier) => {
      const c = makeCard({ tier })
      expect(c.tier).toBe(tier)
    })
  })

  it('accepts all valid domain values', () => {
    const domains: Domain[] = ['science', 'arts', 'politics', 'philosophy', 'sports', 'other']
    domains.forEach((domain) => {
      const c = makeCard({ domain })
      expect(c.domain).toBe(domain)
    })
  })

  it('stores numeric stats correctly', () => {
    const c = makeCard({ influence: 95, innovation: 88, legacy: 72 })
    expect(c.influence + c.innovation + c.legacy).toBe(255)
  })

  it('stores identities as an array', () => {
    const c = makeCard({ identities: ['Leader', 'Activist'] })
    expect(c.identities).toHaveLength(2)
    expect(c.identities[0]).toBe('Leader')
  })

  it('portraitUrl defaults to empty string', () => {
    const c = makeCard()
    expect(c.portraitUrl).toBe('')
  })
})

describe('AuthResponse type shape', () => {
  it('holds access and refresh tokens', () => {
    const r: AuthResponse = { accessToken: 'at', refreshToken: 'rt' }
    expect(r.accessToken).toBe('at')
    expect(r.refreshToken).toBe('rt')
  })
})

describe('Match type shape', () => {
  it('accepts all valid status values', () => {
    const statuses: Match['status'][] = ['waiting', 'active', 'finished', 'forfeited']
    statuses.forEach((status) => {
      const m: Match = {
        id: 'match-1', playerAId: 'u1', playerBId: null,
        status, scoreA: 0, scoreB: 0, currentRound: 1,
      }
      expect(m.status).toBe(status)
    })
  })

  it('playerBId can be null while waiting', () => {
    const m: Match = {
      id: 'm1', playerAId: 'u1', playerBId: null,
      status: 'waiting', scoreA: 0, scoreB: 0, currentRound: 1,
    }
    expect(m.playerBId).toBeNull()
  })
})
