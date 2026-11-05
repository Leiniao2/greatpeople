// Every Battle-tab game opens on a real year.  A single-era game only puts
// that era's Great People into play; an all-era game opens on one era and
// moves forward through history from there.
import { describe, it, expect } from 'vitest'
import type { GameSetup } from '@/types'
import {
  ALL_GP_CARDS, ERAS, OPENING_CHOICES, eraStartYear, getGPCard, gpPool, initGame, openingDeal,
} from '@/battle/engine'

function setup(players: number, eraMode: GameSetup['eraMode'], singleEra?: string, startEra?: string): GameSetup {
  return {
    mode: 'scenario', matchType: 'casual', playerMode: 'pvc', eraMode, singleEra, startEra,
    playerNames: ['You'], numComputers: players - 1,
  }
}

/** Every Great Person a game has touched: hands, board, the dead and the retired. */
const held = (gs: ReturnType<typeof initGame>) => [
  ...gs.players.flatMap(p => [...p.gpHand, ...p.archive, ...p.retired]),
  ...gs.locations.flatMap(l => l.cards.filter(c => c.type === 'gp').map(c => c.cardId)),
]

describe('single-era fights', () => {
  for (const era of ERAS) {
    it(`${era}: only ${era} Great People are dealt, and the game opens on the era's first birth`, () => {
      for (let players = 2; players <= 5; players++) {
        const deal = openingDeal(setup(players, 'single', era), players)
        expect(deal.startEra).toBe(era)
        const dealt = deal.offers.flat()
        for (const id of dealt) expect(getGPCard(id)?.era).toBe(era)
        expect(deal.startYear).toBe(Math.min(...dealt.map(id => getGPCard(id)!.born)))
        expect(deal.startYear).toBe(eraStartYear(era, gpPool('single', era)))
      }
    })

    it(`${era}: every player is offered the same number of candidates, at most ${OPENING_CHOICES}`, () => {
      const deal = openingDeal(setup(5, 'single', era), 5)
      const sizes = new Set(deal.offers.map(h => h.length))
      expect(sizes.size).toBe(1)
      const [size] = sizes
      expect(size).toBeGreaterThan(0)
      expect(size).toBeLessThanOrEqual(OPENING_CHOICES)
    })

    it(`${era}: a whole game stays in the era (successors too) and on its locations`, () => {
      const gs = initGame(setup(3, 'single', era))
      for (const id of held(gs)) expect(getGPCard(id)?.era).toBe(era)
      for (const loc of gs.locations) expect(loc.era).toBe(era)
    })
  }

  it('the dealt Great People are the earliest-born of the era', () => {
    for (const era of ERAS) {
      const deal = openingDeal(setup(2, 'single', era), 2)
      const dealt = new Set(deal.offers.flat())
      const latestDealt = Math.max(...[...dealt].map(id => getGPCard(id)!.born))
      for (const c of gpPool('single', era)) if (!dealt.has(c.id)) expect(c.born).toBeGreaterThanOrEqual(latestDealt)
    }
  })
})

describe('all-era fights', () => {
  it('open on the chosen era and offer each player three contemporaries', () => {
    for (const era of ERAS) {
      const deal = openingDeal(setup(4, 'all', undefined, era), 4)
      expect(deal.startEra).toBe(era)
      const opening = eraStartYear(era)
      for (const h of deal.offers) expect(h).toHaveLength(OPENING_CHOICES)
      for (const id of deal.offers.flat()) expect(getGPCard(id)!.born).toBeGreaterThanOrEqual(opening)
    }
  })

  it('every game opens on the pick of one Great Person from three, whatever the era', () => {
    for (const era of ERAS) {
      const gs = initGame(setup(2, 'all', undefined, era))
      const [me, cpu] = gs.players
      expect(me.gpHand, era).toEqual([])
      expect(me.pendingSuccessors, era).toHaveLength(1)
      expect(me.pendingSuccessors[0].reason).toBe('start')
      expect(me.pendingSuccessors[0].options, era).toHaveLength(OPENING_CHOICES)
      // The computer has already made its pick, and holds one Great Person.
      expect(cpu.pendingSuccessors).toHaveLength(0)
      expect(cpu.gpHand).toHaveLength(1)
      // Nothing happens until the pick is made: history waits on the opening year.
      expect(gs.year).toBe(gs.startYear)
    }
  })

  it('pick a random start era when none is given', () => {
    const eras = new Set(Array.from({ length: 60 }, () => openingDeal(setup(2, 'all'), 2).startEra))
    for (const e of eras) expect(ERAS).toContain(e)
    expect(eras.size).toBeGreaterThan(1)
  })

  it('never deal one Great Person twice', () => {
    const deal = openingDeal(setup(5, 'all', undefined, 'Ancient'), 5)
    const dealt = deal.offers.flat()
    expect(new Set(dealt).size).toBe(dealt.length)
    expect(dealt.length).toBeLessThanOrEqual(ALL_GP_CARDS.length)
  })
})
