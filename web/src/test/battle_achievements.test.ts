// Each Great Person earns their legacy through their own achievement (the
// card's `achievement` text); winning a fight earns nothing by itself.
import { describe, it, expect } from 'vitest'
import type { GameState, OnboardCard } from '@/types'
import { ACHIEVEMENTS, achievementProgress } from '@/battle/achievements'
import {
  ALL_GP_CARDS, freshTurnActions, gameReducer, getGPCard, initGame, makeEventCard, type GameAction,
} from '@/battle/engine'

const card = (id: string) => getGPCard(id)!

/** A quiet you-vs-CPU timeline game at `year` with an empty board; one slot per card handed. */
function game(year: number, human: string[], cpu: string[] = []): GameState {
  const gs = initGame({
    mode: 'scenario', matchType: 'pvc', playerMode: 'pvc', eraMode: 'all', startEra: 'Ancient',
    playerNames: ['You'], numComputers: 1, noHazards: true,
  })
  return {
    ...gs,
    year, startYear: year, round: 1, phase: 'playing', winner: null, pendingSummary: null, summaryQueue: [],
    currentPlayerIdx: 0, turnActions: freshTurnActions(), pendingRewards: [], achievementEvents: [], roundActed: [],
    locations: gs.locations.map(l => ({ ...l, cards: [], activeEvent: null, eventRoundsLeft: 0 })),
    players: gs.players.map((p, i) => ({
      ...p, gpHand: i === 0 ? human : cpu, archive: [], retired: [], pendingSuccessors: [],
      legacies: [], activeLegacies: [], winningPoints: 0, achievementMemo: {},
      extraSlots: Math.max(0, (i === 0 ? human : cpu).length - 1),
    })),
  }
}

let serial = 0
function put(gs: GameState, loc: number, playerIdx: number, cardId: string, extra: Partial<OnboardCard> = {}): GameState {
  const playerId = gs.players[playerIdx].id
  const type = cardId.startsWith('follower-') ? 'follower' : 'gp'
  const oc: OnboardCard = { instanceId: `${cardId}-${playerIdx}-${serial++}`, cardId, type, playerId, isPublic: true, justDeployed: false, achievementTicks: 0, ...extra }
  return {
    ...gs,
    players: gs.players.map((p, i) => (i === playerIdx ? { ...p, gpHand: p.gpHand.filter(id => id !== cardId) } : p)),
    locations: gs.locations.map((l, i) => (i === loc ? { ...l, cards: [...l.cards, oc] } : l)),
  }
}
const follower = (name: string) => `follower-${name}-${900 + serial++}`
const run = (gs: GameState, ...actions: GameAction[]) => actions.reduce(gameReducer, gs)
const endRound = (gs: GameState) => run(gs, { type: 'END_TURN' }, { type: 'END_TURN' })
const ticks = (gs: GameState, cardId: string) =>
  gs.locations.flatMap(l => l.cards).find(c => c.cardId === cardId)?.achievementTicks ?? -1
const onBoard = (gs: GameState, cardId: string) => gs.locations.flatMap(l => l.cards).find(c => c.cardId === cardId)!

describe('own achievements', () => {
  it('every Great Person has an achievement the engine checks, written on the card', () => {
    for (const c of ALL_GP_CARDS) {
      expect(ACHIEVEMENTS[c.id], c.id).toBeTypeOf('function')
      expect(c.achievement, c.id).toMatch(/ — .{10,}/)
    }
  })

  it('a kill in a fight no longer earns a legacy by itself', () => {
    let gs = game(530, ['belisarius'], ['pakal'])
    gs = put(gs, 0, 0, 'belisarius')
    gs = put(gs, 0, 1, 'pakal')
    gs = { ...gs, year: 640, locations: gs.locations.map((l, i) => (i === 0 ? { ...l, activeEvent: makeEventCard('strength', 'local_event', 'e'), eventRoundsLeft: 99 } : l)) }
    const me = onBoard(gs, 'belisarius'), them = onBoard(gs, 'pakal')
    gs = gameReducer(gs, { type: 'ATTACK', myInstanceId: me.instanceId, theirInstanceId: them.instanceId, kill: true })
    expect(gs.pendingSummary?.kind === 'combat' && gs.pendingSummary.result).toBe('attacker')
    expect(ticks(gs, 'belisarius')).toBe(0)
  })

  it('Imhotep: an allied Architect and an Engineer in his city at the end of your turn, then claim', () => {
    let gs = game(-2620, ['imhotep'], [])
    gs = put(gs, 0, 0, 'imhotep')
    gs = put(gs, 0, 0, follower('Architect'))
    gs = put(gs, 1, 0, follower('Engineer'))
    gs = gameReducer(gs, { type: 'END_TURN' })
    expect(ticks(gs, 'imhotep'), 'Engineer in another city does not count').toBe(0)
    gs = { ...gs, currentPlayerIdx: 0, turnActions: freshTurnActions() }
    gs = put(gs, 0, 0, follower('Engineer'))
    gs = gameReducer(gs, { type: 'END_TURN' })
    expect(ticks(gs, 'imhotep')).toBe(1)
    gs = { ...gs, currentPlayerIdx: 0, turnActions: freshTurnActions() }
    gs = gameReducer(gs, { type: 'CLAIM_ACHIEVEMENT', instanceId: onBoard(gs, 'imhotep').instanceId })
    expect(gs.players[0].legacies).toContain('imhotep')
  })

  it('Belisarius: winning an attack while outnumbered', () => {
    let gs = game(530, ['belisarius'], ['pakal'])
    gs = put(gs, 0, 0, 'belisarius')
    gs = put(gs, 0, 1, 'pakal')
    gs = put(gs, 0, 1, follower('Priest'))
    gs = { ...gs, year: 640, locations: gs.locations.map((l, i) => (i === 0 ? { ...l, activeEvent: makeEventCard('strength', 'local_event', 'e'), eventRoundsLeft: 99 } : l)) }
    const before = gs
    gs = gameReducer(gs, { type: 'ATTACK', myInstanceId: onBoard(gs, 'belisarius').instanceId, theirInstanceId: onBoard(gs, 'pakal').instanceId, kill: false })
    const won = gs.pendingSummary?.kind === 'combat' && gs.pendingSummary.result === 'attacker'
    expect(ticks(gs, 'belisarius')).toBe(won ? 1 : 0)
    expect(card('belisarius').strength).toBeGreaterThan(card('pakal').strength)
    void before
  })

  it('James Hutton: three years in a row in the same city', () => {
    let gs = game(1750, ['james_hutton'], [])
    gs = put(gs, 0, 0, 'james_hutton')
    let years = 0
    while (ticks(gs, 'james_hutton') < 1 && years < 6) { gs = endRound(gs); years++ }
    expect(ticks(gs, 'james_hutton')).toBe(1)
    expect(years).toBeLessThanOrEqual(4)
  })

  it('Pericles: an allied Great Person killed by a rival in his city', () => {
    let gs = game(-460, ['pericles', 'anaxagoras'], ['zeno_of_elea'])
    gs = put(gs, 0, 0, 'pericles')
    gs = put(gs, 0, 0, 'anaxagoras')
    gs = put(gs, 0, 1, 'zeno_of_elea')
    // The rival brings four Scientists to an Intelligence fight and attacks Anaxagoras.
    const stat = 'intelligence' as const
    for (let i = 0; i < 4; i++) gs = put(gs, 0, 1, follower('Scientist'))
    gs = { ...gs, currentPlayerIdx: 1, locations: gs.locations.map((l, i) => (i === 0 ? { ...l, activeEvent: makeEventCard(stat, 'local_event', 'e'), eventRoundsLeft: 99 } : l)) }
    gs = gameReducer(gs, { type: 'ATTACK', myInstanceId: onBoard(gs, 'zeno_of_elea').instanceId, theirInstanceId: onBoard(gs, 'anaxagoras').instanceId, kill: true })
    expect(gs.pendingSummary?.kind === 'combat' && gs.pendingSummary.result).toBe('attacker')
    expect(gs.players[0].archive).toContain('anaxagoras')
    expect(ticks(gs, 'pericles')).toBe(1)
  })

  it('Pakal: placing a Follower in his city three times', () => {
    let gs = game(640, ['pakal'], [])
    gs = put(gs, 0, 0, 'pakal')
    for (let i = 0; i < 3; i++) {
      const f = gs.players[0].followerHand[0] ?? { id: follower('Priest'), name: 'Priest', stat: 'belief' as const, bonus: 2, imageKey: 'priest' }
      if (!gs.players[0].followerHand.length) gs = { ...gs, players: gs.players.map((p, j) => (j === 0 ? { ...p, followerHand: [f] } : p)) }
      gs = gameReducer(gs, { type: 'ADD_FOLLOWER', followerId: f.id, locationId: gs.locations[0].id, instanceId: f.id })
      if (i < 2) { expect(ticks(gs, 'pakal')).toBe(0); gs = endRound(gs) }
    }
    expect(ticks(gs, 'pakal')).toBe(1)
  })

  it('Edmund Hillary: in the same city as Tenzing Norgay, whoever holds him', () => {
    let gs = game(1950, ['edmund_hillary'], ['tenzing_norgay'])
    gs = put(gs, 2, 0, 'edmund_hillary')
    gs = put(gs, 2, 1, 'tenzing_norgay')
    gs = gameReducer(gs, { type: 'END_TURN' })
    expect(ticks(gs, 'edmund_hillary')).toBe(1)
  })

  it('progress is shown on the card and the legacy is claimed once', () => {
    let gs = game(1950, ['edmund_hillary'], ['tenzing_norgay'])
    gs = put(gs, 2, 0, 'edmund_hillary', { isPublic: false })
    gs = put(gs, 2, 1, 'tenzing_norgay')
    gs = gameReducer(gs, { type: 'END_TURN' })
    gs = { ...gs, currentPlayerIdx: 0, turnActions: freshTurnActions() }
    const id = onBoard(gs, 'edmund_hillary').instanceId
    // A hidden card claims too, and claiming reveals it.
    gs = gameReducer(gs, { type: 'CLAIM_ACHIEVEMENT', instanceId: id })
    expect(gs.players[0].legacies).toEqual(['edmund_hillary'])
    expect(onBoard(gs, 'edmund_hillary').isPublic).toBe(true)
    expect(ticks(gs, 'edmund_hillary')).toBe(0)
    gs = gameReducer(gs, { type: 'END_TURN' })
    expect(ticks(gs, 'edmund_hillary'), 'an earned legacy is not earned again').toBe(0)
  })

  it('Magellan: every city while public, progress on the card; claiming a hidden card reveals it', () => {
    let gs = game(1505, ['magellan'], [])
    gs = put(gs, 0, 0, 'magellan')
    const n = gs.locations.length
    for (let i = 0; i < n; i++) {
      if (i > 0) gs = gameReducer(gs, { type: 'MOVE_CARD', instanceId: onBoard(gs, 'magellan').instanceId, toLocationId: gs.locations[i].id })
      gs = gameReducer(gs, { type: 'END_TURN' })
      gs = { ...gs, currentPlayerIdx: 0, turnActions: freshTurnActions(), pendingSummary: null, summaryQueue: [] }
      if (i < n - 1) expect(achievementProgress(gs, onBoard(gs, 'magellan'))).toBe(`${i + 1}/${n}`)
    }
    expect(ticks(gs, 'magellan')).toBe(1)
    gs = gameReducer(gs, { type: 'TOGGLE_VISIBILITY', instanceId: onBoard(gs, 'magellan').instanceId })
    expect(onBoard(gs, 'magellan').isPublic).toBe(false)
    gs = gameReducer(gs, { type: 'CLAIM_ACHIEVEMENT', instanceId: onBoard(gs, 'magellan').instanceId })
    expect(gs.players[0].legacies).toContain('magellan')
    expect(onBoard(gs, 'magellan').isPublic).toBe(true)
  })

  it('Magellan: a turn ended hidden starts the voyage over', () => {
    let gs = game(1505, ['magellan'], [])
    gs = put(gs, 0, 0, 'magellan')
    gs = endRound(gs)
    expect(achievementProgress(gs, onBoard(gs, 'magellan'))).toBe(`1/${gs.locations.length}`)
    gs = run(gs, { type: 'TOGGLE_VISIBILITY', instanceId: onBoard(gs, 'magellan').instanceId }, { type: 'END_TURN' }, { type: 'END_TURN' })
    gs = run(gs, { type: 'TOGGLE_VISIBILITY', instanceId: onBoard(gs, 'magellan').instanceId })
    expect(achievementProgress(gs, onBoard(gs, 'magellan'))).toBe(`0/${gs.locations.length}`)
  })
})
