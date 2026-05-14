import { describe, it, expect } from 'vitest'
import type { Card, AuthResponse, Match } from '@/types'

// Runtime helpers — build valid objects that satisfy the TypeScript interfaces

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'test-id',
    figureName: 'Test Figure',
    era: 'Steam',
    gender: 'male',
    identities: [],
    countries: [],
    lore: 'Some lore',
    portraitUrl: '',
    years: '2000–2024',
    trait: '',
    achievement: '',
    politics: 50,
    strength: 50,
    culture: 50,
    wealth: 50,
    intelligence: 50,
    technique: 50,
    belief: 50,
    reputation: 50,
    ...overrides,
  }
}

describe('Card type shape', () => {
  it('accepts male and female gender', () => {
    const genders = ['male', 'female']
    genders.forEach((gender) => {
      const c = makeCard({ gender })
      expect(c.gender).toBe(gender)
    })
  })

  it('stores 8 numeric stats correctly', () => {
    const c = makeCard({ politics: 92, strength: 35, culture: 78, wealth: 25, intelligence: 82, technique: 40, belief: 90, reputation: 95 })
    expect(c.politics + c.strength + c.culture + c.wealth + c.intelligence + c.technique + c.belief + c.reputation).toBe(537)
  })

  it('stores identities as an array', () => {
    const c = makeCard({ identities: ['Statesman', 'Educator'] })
    expect(c.identities).toHaveLength(2)
    expect(c.identities[0]).toBe('Statesman')
  })

  it('portraitUrl defaults to empty string', () => {
    const c = makeCard()
    expect(c.portraitUrl).toBe('')
  })

  it('countries defaults to empty array', () => {
    const c = makeCard()
    expect(c.countries).toEqual([])
  })

  it('countries can hold multiple values', () => {
    const c = makeCard({ countries: ['Egypt', 'Persia'] })
    expect(c.countries).toHaveLength(2)
    expect(c.countries![0]).toBe('Egypt')
  })

  it('countries is optional (undefined when omitted)', () => {
    // countries?: string[] — can be absent from the object
    const c: Card = { ...makeCard(), countries: undefined }
    expect(c.countries).toBeUndefined()
  })

  it('all 7 era values are valid', () => {
    const eras = ['Ancient', 'Classical', 'Medieval', 'Renaissance', 'Steam', 'Electricity', 'Information']
    eras.forEach((era) => {
      const c = makeCard({ era })
      expect(c.era).toBe(era)
    })
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
