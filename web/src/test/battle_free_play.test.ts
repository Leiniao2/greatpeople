// Free play (the Battle tab's default): no dates, Great People from your
// collection, each once a game, 20 rounds or until someone runs out, the most
// legacies wins.  Real history also brings only cards you own.  The computer's
// level decides how strong the Great People it takes are.
import { describe, it, expect } from 'vitest'
import type { CpuLevel, GameSetup, GameState } from '@/types'
import {
  FREE_PLAY_ROUNDS, OPENING_CHOICES, STATS, cpuPick, gameReducer, getGPCard, gpPool, initGame, lifeStatus,
  openingDeal, successorOptions,
} from '@/battle/engine'
import { FIGHT_REWARD_POOL, ownedCardIds, welcomeCard } from '@/battle/rewards'

const ERA = 'Renaissance'
const eraCards = gpPool('single', ERA)
const total = (id: string) => STATS.reduce((s, k) => s + getGPCard(id)![k], 0)

function setup(extra: Partial<GameSetup> = {}): GameSetup {
  return {
    mode: 'generic', matchType: 'pvc', playerMode: 'pvc', eraMode: 'single', singleEra: ERA,
    playerNames: ['You'], numComputers: 1, freePlay: true, seed: 42, ...extra,
  }
}

/** Both players take their first offer (the computer already has). */
function opened(s: GameSetup): GameState {
  let gs = initGame(s)
  const opts = successorOptions(gs, 'player-0')
  gs = gameReducer(gs, { type: 'CHOOSE_SUCCESSOR', playerId: 'player-0', cardId: opts[0] })
  return gs
}

const deploy = (gs: GameState, id: string) =>
  gameReducer(gs, { type: 'DEPLOY_GP', cardId: id, locationId: gs.locations[0].id, isPublic: true })

describe('free play', () => {
  const owned = eraCards.slice(0, 5).map(c => c.id)

  it('opens with up to three of your own cards; the computer leaves yours alone', () => {
    const gs = initGame(setup({ owned }))
    const mine = successorOptions(gs, 'player-0')
    expect(mine.length).toBe(OPENING_CHOICES)
    for (const id of mine) expect(owned).toContain(id)
    const cpu = gs.players[1]
    expect(cpu.gpHand.length).toBe(1)
    expect(owned).not.toContain(cpu.gpHand[0])
    expect(getGPCard(cpu.gpHand[0])!.era).toBe(ERA)
  })

  it('has no dates: every card is in play at once and nobody dies of old age', () => {
    let gs = opened(setup({ owned, noHazards: true }))
    const id = gs.players[0].gpHand[0]
    expect(lifeStatus(gs, 'player-0', id)).toBe('active')
    gs = deploy(gs, id)
    for (let r = 0; r < 12; r++) gs = gameReducer(gameReducer(gs, { type: 'END_TURN' }), { type: 'END_TURN' })
    expect(gs.phase).toBe('playing')
    expect(gs.players[0].archive).toEqual([])
    expect(gs.locations.some(l => l.cards.some(c => c.cardId === id))).toBe(true)
  })

  it(`ends after ${FREE_PLAY_ROUNDS} rounds; the most legacies wins`, () => {
    let gs = opened(setup({ owned }))
    gs = deploy(gs, gs.players[0].gpHand[0])
    gs = { ...gs, players: gs.players.map((p, i) => (i === 1 ? { ...p, legacies: ['x'] } : p)) }
    for (let r = 0; r < FREE_PLAY_ROUNDS - 1; r++) gs = gameReducer(gameReducer(gs, { type: 'END_TURN' }), { type: 'END_TURN' })
    expect(gs.phase).toBe('playing')
    gs = gameReducer(gameReducer(gs, { type: 'END_TURN' }), { type: 'END_TURN' })
    expect(gs.phase).toBe('ended')
    expect(gs.winner).toBe('player-1')
  })

  it('a retired Great Person is followed at once, from your own cards, each once a game', () => {
    let gs = opened(setup({ owned }))
    const first = gs.players[0].gpHand[0]
    gs = gameReducer(gs, { type: 'RETIRE_GP', cardId: first })
    const next = successorOptions(gs, 'player-0')
    expect(next.length).toBeGreaterThan(0)
    expect(next.length).toBeLessThanOrEqual(3)
    expect(next).not.toContain(first)
    for (const id of next) expect(owned).toContain(id)
    // The same choice while it is owed.
    expect(successorOptions(gs, 'player-0')).toEqual(next)
  })

  it('running out of Great People ends the game', () => {
    let gs = opened(setup({ owned: [eraCards[0].id] }))
    expect(gs.players[0].gpHand).toEqual([eraCards[0].id])
    gs = gameReducer(gs, { type: 'RETIRE_GP', cardId: eraCards[0].id })
    expect(gs.phase).toBe('ended')
  })

  it('without a collection (hot seat) every card of the era can be offered', () => {
    const gs = initGame(setup({ playerMode: 'pvp', matchType: 'casual', playerNames: ['A', 'B'], numComputers: 0 }))
    const a = successorOptions(gs, 'player-0'), b = successorOptions(gs, 'player-1')
    expect(a.length).toBe(3)
    expect(b.length).toBe(3)
    expect(new Set([...a, ...b]).size).toBe(6)
  })
})

describe('real history with a collection', () => {
  it('offers only your own cards, at the start and as successors', () => {
    const owned = eraCards.filter((_, i) => i % 3 === 0).map(c => c.id)
    const deal = openingDeal(setup({ freePlay: false, owned }), 2, [false, true])
    expect(deal.offers[0].length).toBeGreaterThan(0)
    for (const id of deal.offers[0]) expect(owned).toContain(id)
    for (const id of deal.offers[1]) expect(owned).not.toContain(id)
    let gs = initGame(setup({ freePlay: false, owned }))
    gs = gameReducer(gs, { type: 'CHOOSE_SUCCESSOR', playerId: 'player-0', cardId: successorOptions(gs, 'player-0')[0] })
    const id = gs.players[0].gpHand[0]
    gs = { ...gs, players: gs.players.map((p, i) => (i === 0 ? { ...p, gpHand: [], archive: [id], pendingSuccessors: [{ predecessor: id, year: gs.year }] } : p)) }
    for (const s of successorOptions(gs, 'player-0')) expect(owned).toContain(s)
  })
})

describe('computer levels', () => {
  const offer = eraCards.slice(0, 4).map(c => c.id)
  it('the easy computer takes the weakest candidate, the others the strongest', () => {
    const byTotal = [...offer].sort((a, b) => total(a) - total(b))
    expect(cpuPick('easy', offer)).toBe(byTotal[0])
    expect(cpuPick('normal', offer)).toBe(byTotal[byTotal.length - 1])
    expect(cpuPick('hard', offer)).toBe(byTotal[byTotal.length - 1])
  })

  it('in free play the hard computer opens with stronger Great People than the easy one', () => {
    const avg = (level: CpuLevel) => {
      let sum = 0
      for (let seed = 1; seed <= 30; seed++) sum += total(initGame(setup({ cpuLevel: level, seed })).players[1].gpHand[0])
      return sum / 30
    }
    expect(avg('hard')).toBeGreaterThan(avg('normal'))
    expect(avg('normal')).toBeGreaterThan(avg('easy'))
  })
})

describe('welcome card', () => {
  const key = (id: string) => getGPCard(id)!.portraitKey ?? id
  it('a single-era fight with none of the era gives one fight-only card of that era', () => {
    const owned = gpPool('single', 'Ancient').slice(0, 3).map(c => key(c.id))
    const card = welcomeCard(owned, ERA, () => 0)!
    expect(card.era).toBe(ERA)
    expect(FIGHT_REWARD_POOL.map(c => c.id)).toContain(card.id)
    expect(welcomeCard([...owned, key(eraCards[0].id)], ERA)).toBeNull()
  })
  it('an all-era fight gives one only to a player with no card at all', () => {
    expect(welcomeCard([], null, () => 0.5)).not.toBeNull()
    expect(welcomeCard([key(eraCards[0].id)], null)).toBeNull()
  })
  it('collections map portrait keys to card ids', () => {
    expect(ownedCardIds([key(eraCards[0].id)])).toEqual([eraCards[0].id])
  })
})
