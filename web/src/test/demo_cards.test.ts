import { describe, it, expect } from 'vitest'
import demoCards from '@/data/demo_cards.json'

// Canonical identity list — never add new values here without updating cards.json too
const VALID_IDENTITIES = new Set([
  'Actor', 'Architect', 'Artist', 'Astronomer', 'Athlete',
  'Banker', 'Doctor', 'Economist', 'Educator', 'Engineer',
  'Explorer', 'General', 'Gourmet', 'Journalist', 'Lawyer',
  'Mathematician', 'Merchant', 'Monastic', 'Musician', 'Naturalist',
  'Noble', 'Official', 'Philosopher', 'Priest', 'Prophet',
  'Scientist', 'Soldier', 'Sovereign', 'Spy', 'Statesman',
  'Warrior', 'Writer',
])

const VALID_ERAS = new Set(['Ancient', 'Classical', 'Medieval', 'Renaissance', 'Steam', 'Electricity', 'Information'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cards: any[] = demoCards as any[]

describe('demo_cards.json — structural integrity', () => {
  it('contains at least 70 cards', () => {
    expect(cards.length).toBeGreaterThanOrEqual(70)
  })

  it('all IDs are unique', () => {
    const ids = cards.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every card has required fields', () => {
    for (const c of cards) {
      expect(typeof c.id,           `${c.figureName} missing id`).toBe('string')
      expect(typeof c.figureName,   `${c.id} missing figureName`).toBe('string')
      expect(typeof c.era,          `${c.id} missing era`).toBe('string')
      expect(typeof c.gender,       `${c.id} missing gender`).toBe('string')
      expect(Array.isArray(c.identities), `${c.id} identities not array`).toBe(true)
      expect(typeof c.portraitKey,  `${c.id} missing portraitKey`).toBe('string')
      expect(typeof c.lore,         `${c.id} missing lore`).toBe('string')
      expect(typeof c.years,        `${c.id} missing years`).toBe('string')
    }
  })

  it('all eras are valid', () => {
    for (const c of cards) {
      expect(VALID_ERAS.has(c.era), `${c.figureName} has invalid era "${c.era}"`).toBe(true)
    }
  })

  it('all identity values are from the established list', () => {
    for (const c of cards) {
      for (const id of c.identities) {
        expect(
          VALID_IDENTITIES.has(id),
          `${c.figureName} has unrecognised identity "${id}"`
        ).toBe(true)
      }
    }
  })

  it('every card has at least one identity', () => {
    for (const c of cards) {
      expect(c.identities.length, `${c.figureName} has no identities`).toBeGreaterThan(0)
    }
  })

  it('every card has all 8 numeric stats', () => {
    const statKeys = ['politics', 'strength', 'culture', 'wealth', 'intelligence', 'technique', 'belief', 'reputation']
    for (const c of cards) {
      for (const stat of statKeys) {
        expect(typeof c[stat], `${c.figureName} missing stat "${stat}"`).toBe('number')
      }
    }
  })

  it('each era has at least 5 cards', () => {
    const byEra: Record<string, number> = {}
    for (const c of cards) byEra[c.era] = (byEra[c.era] ?? 0) + 1
    for (const era of VALID_ERAS) {
      expect(byEra[era] ?? 0, `Era "${era}" has fewer than 5 cards`).toBeGreaterThanOrEqual(5)
    }
  })

  it('gender is "male" or "female"', () => {
    for (const c of cards) {
      expect(['male', 'female'].includes(c.gender), `${c.figureName} has invalid gender "${c.gender}"`).toBe(true)
    }
  })
})

describe('demo_cards.json — specific identity values', () => {
  it('Gandhi is Statesman + Lawyer (not Educator)', () => {
    const card = cards.find(c => c.figureName === 'Gandhi')
    expect(card).toBeDefined()
    expect(card.identities).toContain('Statesman')
    expect(card.identities).toContain('Lawyer')
    expect(card.identities).not.toContain('Educator')
  })

  it('Alan Turing is Mathematician + Engineer (not Scientist)', () => {
    const card = cards.find(c => c.figureName === 'Alan Turing')
    expect(card).toBeDefined()
    expect(card.identities).toContain('Mathematician')
    expect(card.identities).toContain('Engineer')
    expect(card.identities).not.toContain('Scientist')
  })

  it('Lu Yu is Gourmet + Actor (not Educator)', () => {
    const card = cards.find(c => c.figureName === 'Lu Yu')
    expect(card).toBeDefined()
    expect(card.identities).toContain('Gourmet')
    expect(card.identities).toContain('Actor')
    expect(card.identities).not.toContain('Educator')
  })

  it('Belisarius is General only (not Soldier)', () => {
    const card = cards.find(c => c.figureName === 'Belisarius')
    expect(card).toBeDefined()
    expect(card.identities).toContain('General')
    expect(card.identities).not.toContain('Soldier')
  })

  it('Euclid is Mathematician only (not Educator)', () => {
    const card = cards.find(c => c.figureName === 'Euclid')
    expect(card).toBeDefined()
    expect(card.identities).toContain('Mathematician')
    expect(card.identities).not.toContain('Educator')
  })

  it('An Jung-geun is Spy only (not Warrior)', () => {
    const card = cards.find(c => c.figureName === 'An Jung-geun')
    expect(card).toBeDefined()
    expect(card.identities).toContain('Spy')
    expect(card.identities).not.toContain('Warrior')
  })

  it('Audrey Hepburn is Actor only (not Educator)', () => {
    const card = cards.find(c => c.figureName === 'Audrey Hepburn')
    expect(card).toBeDefined()
    expect(card.identities).toContain('Actor')
    expect(card.identities).not.toContain('Educator')
  })
})
