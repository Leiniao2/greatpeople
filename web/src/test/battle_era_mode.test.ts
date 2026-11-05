// Every Battle-tab game opens on a real year.  A single-era game only puts
// that era's Great People into play; an all-era game opens on one era and
// moves forward through history from there.
import { describe, it, expect } from 'vitest'
import type { GameSetup } from '@/types'
import {
  ALL_GP_CARDS, ERAS, STARTING_LINEAGES, eraStartYear, getGPCard, gpPool, initGame, openingDeal,
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
        const dealt = deal.hands.flat()
        for (const id of dealt) expect(getGPCard(id)?.era).toBe(era)
        expect(deal.startYear).toBe(Math.min(...dealt.map(id => getGPCard(id)!.born)))
        expect(deal.startYear).toBe(eraStartYear(era, gpPool('single', era)))
      }
    })

    it(`${era}: hands are equal, non-empty and at most ${STARTING_LINEAGES}`, () => {
      const deal = openingDeal(setup(5, 'single', era), 5)
      const sizes = new Set(deal.hands.map(h => h.length))
      expect(sizes.size).toBe(1)
      const [size] = sizes
      expect(size).toBeGreaterThan(0)
      expect(size).toBeLessThanOrEqual(STARTING_LINEAGES)
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
      const dealt = new Set(deal.hands.flat())
      const latestDealt = Math.max(...[...dealt].map(id => getGPCard(id)!.born))
      for (const c of gpPool('single', era)) if (!dealt.has(c.id)) expect(c.born).toBeGreaterThanOrEqual(latestDealt)
    }
  })
})

describe('all-era fights', () => {
  it('open on the chosen era and deal full hands of contemporaries', () => {
    for (const era of ERAS) {
      const deal = openingDeal(setup(4, 'all', undefined, era), 4)
      expect(deal.startEra).toBe(era)
      const opening = eraStartYear(era)
      for (const h of deal.hands) expect(h).toHaveLength(STARTING_LINEAGES)
      for (const id of deal.hands.flat()) expect(getGPCard(id)!.born).toBeGreaterThanOrEqual(opening)
    }
  })

  it('pick a random start era when none is given', () => {
    const eras = new Set(Array.from({ length: 60 }, () => openingDeal(setup(2, 'all'), 2).startEra))
    for (const e of eras) expect(ERAS).toContain(e)
    expect(eras.size).toBeGreaterThan(1)
  })

  it('never deal one Great Person twice', () => {
    const deal = openingDeal(setup(5, 'all', undefined, 'Ancient'), 5)
    const dealt = deal.hands.flat()
    expect(new Set(dealt).size).toBe(dealt.length)
    expect(dealt.length).toBeLessThanOrEqual(ALL_GP_CARDS.length)
  })
})
