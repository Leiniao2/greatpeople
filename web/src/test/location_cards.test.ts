import { describe, it, expect } from 'vitest'
import locationCards from '@/data/location_cards.json'

type StatKey = 'politics' | 'strength' | 'culture' | 'wealth' | 'intelligence' | 'technique' | 'belief' | 'reputation'
const ALL_STATS: StatKey[] = ['politics', 'strength', 'culture', 'wealth', 'intelligence', 'technique', 'belief', 'reputation']
const VALID_ERAS = new Set(['Ancient', 'Classical', 'Medieval', 'Renaissance', 'Steam', 'Electricity', 'Information'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cards: any[] = locationCards as any[]

describe('location_cards.json — structural integrity', () => {
  it('contains at least 140 location cards', () => {
    expect(cards.length).toBeGreaterThanOrEqual(140)
  })

  it('all IDs are unique', () => {
    const ids = cards.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all cards have required fields: id, name, era, buildings, capacity, bonuses', () => {
    for (const c of cards) {
      expect(typeof c.id,       `${c.name} missing id`).toBe('string')
      expect(typeof c.name,     `${c.id} missing name`).toBe('string')
      expect(typeof c.era,      `${c.id} missing era`).toBe('string')
      expect(Array.isArray(c.buildings), `${c.id} buildings not array`).toBe(true)
      expect(typeof c.capacity, `${c.id} missing capacity`).toBe('number')
      expect(typeof c.bonuses,  `${c.id} missing bonuses`).toBe('object')
    }
  })

  it('all eras are valid', () => {
    for (const c of cards) {
      expect(VALID_ERAS.has(c.era), `${c.id} has invalid era "${c.era}"`).toBe(true)
    }
  })

  it('every card has at least one bonus stat', () => {
    for (const c of cards) {
      const keys = Object.keys(c.bonuses)
      expect(keys.length, `${c.id} has no bonuses`).toBeGreaterThan(0)
    }
  })

  it('no individual bonus value exceeds +3 or falls below +1', () => {
    for (const c of cards) {
      for (const [stat, val] of Object.entries(c.bonuses)) {
        expect(val as number, `${c.id}.${stat} = ${val}, exceeds +3`).toBeLessThanOrEqual(3)
        expect(val as number, `${c.id}.${stat} = ${val}, must be positive`).toBeGreaterThan(0)
      }
    }
  })

  it('all bonus keys are valid StatKeys', () => {
    const valid = new Set(ALL_STATS)
    for (const c of cards) {
      for (const stat of Object.keys(c.bonuses)) {
        expect(valid.has(stat as StatKey), `${c.id} has unknown stat "${stat}"`).toBe(true)
      }
    }
  })

  it('every stat appears as a bonus on at least 10 cards', () => {
    const counts: Record<string, number> = {}
    for (const stat of ALL_STATS) counts[stat] = 0
    for (const c of cards) {
      for (const stat of Object.keys(c.bonuses)) {
        counts[stat] = (counts[stat] ?? 0) + 1
      }
    }
    for (const stat of ALL_STATS) {
      expect(counts[stat], `stat "${stat}" appears on only ${counts[stat]} cards`).toBeGreaterThanOrEqual(10)
    }
  })
})

describe('location_cards.json — specific cards', () => {
  it('Athens exists in Classical era with politics and intelligence bonuses', () => {
    const athens = cards.find(c => c.id === 'classical-athens')
    expect(athens).toBeDefined()
    expect(athens.era).toBe('Classical')
    expect(athens.bonuses.politics).toBeGreaterThan(0)
    expect(athens.bonuses.intelligence).toBeGreaterThan(0)
  })

  it('Mt. Everest exists in Information era with strength and reputation bonuses', () => {
    const everest = cards.find(c => c.id === 'information-mt-everest')
    expect(everest).toBeDefined()
    expect(everest.era).toBe('Information')
    expect(everest.bonuses.strength).toBeGreaterThan(0)
    expect(everest.bonuses.reputation).toBeGreaterThan(0)
  })

  it('Rome (Classical) has politics, strength, and technique bonuses', () => {
    const rome = cards.find(c => c.id === 'classical-rome')
    expect(rome).toBeDefined()
    expect(rome.bonuses.politics).toBeGreaterThan(0)
    expect(rome.bonuses.strength).toBeGreaterThan(0)
    expect(rome.bonuses.technique).toBeGreaterThan(0)
  })

  it('each era has at least 7 location cards', () => {
    const byCera: Record<string, number> = {}
    for (const c of cards) byCera[c.era] = (byCera[c.era] ?? 0) + 1
    for (const [era, count] of Object.entries(byCera)) {
      expect(count, `Era "${era}" only has ${count} cards`).toBeGreaterThanOrEqual(7)
    }
  })
})
