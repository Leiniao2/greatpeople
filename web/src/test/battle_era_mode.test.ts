// A single-era fight only puts that era's Great People into play: every hand
// and the draw pile used for achievement and competition rewards.
import { describe, it, expect } from 'vitest'
import type { GameSetup } from '@/types'
import { ALL_GP_CARDS, ERAS, STARTING_GP_HAND, getGPCard, gpPool, initGame } from '@/battle/engine'

function setup(players: number, eraMode: GameSetup['eraMode'], singleEra?: string): GameSetup {
  return {
    mode: 'scenario', matchType: 'casual', playerMode: 'pvc', eraMode, singleEra,
    playerNames: ['You'], numComputers: players - 1,
  }
}

const gpInPlay = (gs: ReturnType<typeof initGame>) => [...gs.players.flatMap(p => p.gpHand), ...gs.gpDeck]

describe('single-era fights', () => {
  for (const era of ERAS) {
    it(`${era}: only ${era} Great People are dealt or drawn`, () => {
      for (let players = 2; players <= 5; players++) {
        const gs = initGame(setup(players, 'single', era))
        const ids = gpInPlay(gs)
        expect(ids.length).toBe(gpPool('single', era).length)
        for (const id of ids) expect(getGPCard(id)?.era).toBe(era)
        for (const loc of gs.locations) expect(loc.era).toBe(era)
      }
    })

    it(`${era}: hands stay equal and non-empty at a full table`, () => {
      const gs = initGame(setup(5, 'single', era))
      const sizes = new Set(gs.players.map(p => p.gpHand.length))
      expect(sizes.size).toBe(1)
      const [size] = sizes
      expect(size).toBeGreaterThan(0)
      expect(size).toBeLessThanOrEqual(STARTING_GP_HAND)
    })
  }

  it('a two-player single-era game still deals full hands', () => {
    for (const era of ERAS) {
      const gs = initGame(setup(2, 'single', era))
      for (const p of gs.players) expect(p.gpHand).toHaveLength(STARTING_GP_HAND)
    }
  })
})

describe('all-era fights', () => {
  it('use every Great Person and deal full hands', () => {
    const gs = initGame(setup(5, 'all'))
    expect(gpInPlay(gs).length).toBe(ALL_GP_CARDS.length)
    for (const p of gs.players) expect(p.gpHand).toHaveLength(STARTING_GP_HAND)
  })
})
