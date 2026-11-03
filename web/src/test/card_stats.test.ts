import { describe, it, expect } from 'vitest'
import cardsJson from '@/data/cards.json'

// Guards the Great People stat distribution set by the owner on 2026-11-03:
//   - card totals average 40 with some spread; 45+ is a rare high and only a
//     handful reach 48–50
//   - all eight stats share the same mean and spread, so no stat dominates
//   - Mao Zedong and Gandhi are the strongest cards (50), Imhotep 48
// Rebalance in Fight Studio (tools/fight-studio, Great People tab) and keep
// these numbers in step if the design changes.

const STATS = ['politics', 'strength', 'culture', 'wealth', 'intelligence', 'technique', 'belief', 'reputation'] as const
type Stat = typeof STATS[number]
type Card = { id: string; figureName: string } & Record<Stat, number>

const cards = cardsJson as unknown as Card[]
const total = (c: Card) => STATS.reduce((sum, s) => sum + c[s], 0)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))) }
const byId = (id: string) => {
  const c = cards.find(x => x.id === id)
  if (!c) throw new Error(`card ${id} is missing`)
  return c
}

describe('Great People stats — values', () => {
  it('every stat is a whole number from 1 to 12', () => {
    for (const c of cards) for (const s of STATS) {
      expect(Number.isInteger(c[s]), `${c.figureName} ${s}`).toBe(true)
      expect(c[s], `${c.figureName} ${s}`).toBeGreaterThanOrEqual(1)
      expect(c[s], `${c.figureName} ${s}`).toBeLessThanOrEqual(12)
    }
  })
})

describe('Great People stats — card totals', () => {
  const totals = cards.map(total)

  it('average close to 40', () => {
    expect(mean(totals)).toBeGreaterThanOrEqual(39.5)
    expect(mean(totals)).toBeLessThanOrEqual(40.5)
  })

  it('have some spread, but not a flat or polarised deck', () => {
    expect(sd(totals)).toBeGreaterThanOrEqual(2.5)
    expect(sd(totals)).toBeLessThanOrEqual(5)
  })

  it('stay between 30 and 50', () => {
    expect(Math.min(...totals)).toBeGreaterThanOrEqual(30)
    expect(Math.max(...totals)).toBeLessThanOrEqual(50)
  })

  it('make 45+ a rare high: at most one card in seven', () => {
    expect(totals.filter(t => t >= 45).length).toBeLessThanOrEqual(Math.floor(cards.length / 7))
  })

  it('let only a handful of cards reach 48 or more', () => {
    expect(totals.filter(t => t >= 48).length).toBeLessThanOrEqual(5)
  })

  it('keep most cards in the 35–44 band', () => {
    expect(totals.filter(t => t >= 35 && t <= 44).length / cards.length).toBeGreaterThanOrEqual(0.7)
  })
})

describe('Great People stats — balance between the eight stats', () => {
  const means = STATS.map(s => mean(cards.map(c => c[s])))
  const sds = STATS.map(s => sd(cards.map(c => c[s])))

  it('every stat has nearly the same average', () => {
    const spread = Math.max(...means) - Math.min(...means)
    expect(spread, STATS.map((s, i) => `${s} ${means[i].toFixed(2)}`).join(', ')).toBeLessThanOrEqual(0.25)
  })

  it('every stat has nearly the same spread', () => {
    const spread = Math.max(...sds) - Math.min(...sds)
    expect(spread, STATS.map((s, i) => `${s} ${sds[i].toFixed(2)}`).join(', ')).toBeLessThanOrEqual(0.3)
  })

  it('no stat is the top stat of more than a quarter of the cards', () => {
    for (const s of STATS) {
      const tops = cards.filter(c => STATS.every(o => c[s] >= c[o])).length
      expect(tops, s).toBeLessThanOrEqual(Math.ceil(cards.length / 4))
    }
  })
})

describe('Great People stats — the owner\'s anchors', () => {
  it('Mao Zedong and Gandhi are the strongest cards at 50', () => {
    const top = Math.max(...cards.map(total))
    expect(total(byId('mao_zedong'))).toBe(50)
    expect(total(byId('gandhi'))).toBe(50)
    expect(top).toBe(50)
  })

  it('Imhotep is in the top tier at 48', () => {
    expect(total(byId('imhotep'))).toBe(48)
  })

  it('the Gilded Age financier (standing in for Rockefeller) is a rare high at 45', () => {
    expect(total(byId('andrew_mellon'))).toBe(45)
  })
})
