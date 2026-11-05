// The real-history rules of the fight game: one round per year, careers,
// deaths and successors, retirement, time skips, legacies and city states.
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { GameState, OnboardCard, StatKey } from '@/types'
import {
  ALL_GP_CARDS, CITY_STATE_CHANCE, CITY_STATE_YEARS, LEGACY_SLOTS, STATS, SUCCESSOR_CHOICES, TIMELINE_END_YEAR,
  careerStartYear, deathYear, describeLegacyEffect, freshTurnActions, gameReducer, getGPCard, hasHazardShield,
  initGame, initScriptedGame, legacyContest, lifeStatus, makeEventCard, rollCityStates, settle, successorOptions,
  type GameAction,
} from '@/battle/engine'

afterEach(() => { vi.restoreAllMocks() })

const card = (id: string) => getGPCard(id)!

/** A quiet two-player timeline game (you vs one CPU) at `year`, with no city states and an empty board. */
function game(year: number, human: string[], cpu: string[] = []): GameState {
  const gs = initGame({
    mode: 'scenario', matchType: 'pvc', playerMode: 'pvc', eraMode: 'all', startEra: 'Renaissance',
    playerNames: ['You'], numComputers: 1, noHazards: true,
  })
  return {
    ...gs,
    year, startYear: year, round: 1, phase: 'playing', winner: null, pendingSummary: null,
    currentPlayerIdx: 0, turnActions: freshTurnActions(),
    locations: gs.locations.map(l => ({ ...l, cards: [], activeEvent: null, eventRoundsLeft: 0 })),
    players: gs.players.map((p, i) => ({
      ...p, gpHand: i === 0 ? human : cpu, archive: [], retired: [], pendingSuccessors: [],
      legacies: [], activeLegacies: [], winningPoints: 0,
    })),
  }
}

function place(gs: GameState, loc: number, playerIdx: number, cardId: string, extra: Partial<OnboardCard> = {}): GameState {
  const playerId = gs.players[playerIdx].id
  const oc: OnboardCard = { instanceId: `${cardId}-${playerIdx}`, cardId, type: 'gp', playerId, isPublic: true, justDeployed: false, achievementTicks: 0, ...extra }
  return {
    ...gs,
    players: gs.players.map((p, i) => (i === playerIdx ? { ...p, gpHand: p.gpHand.filter(id => id !== cardId) } : p)),
    locations: gs.locations.map((l, i) => (i === loc ? { ...l, cards: [...l.cards, oc] } : l)),
  }
}

const run = (gs: GameState, ...actions: GameAction[]) => actions.reduce(gameReducer, gs)
/** Both players end their turn: one round, one year. */
const endRound = (gs: GameState) => run(gs, { type: 'END_TURN' }, { type: 'END_TURN' })

describe('careers and life stages', () => {
  it('a Great Person is unborn, then young, then in their career from age 18', () => {
    const titian = card('titian')
    const gs = game(titian.born - 1, ['titian'])
    expect(lifeStatus(gs, 'player-0', 'titian')).toBe('unborn')
    expect(lifeStatus({ ...gs, year: titian.born + 17 }, 'player-0', 'titian')).toBe('youth')
    expect(lifeStatus({ ...gs, year: titian.born + 18 }, 'player-0', 'titian')).toBe('active')
    expect(careerStartYear(titian)).toBe(titian.born + 18)
  })

  it('prodigies start early: Michael Jackson at 6, Clara Schumann at 9', () => {
    expect(careerStartYear(card('michael_jackson'))).toBe(1964)
    expect(careerStartYear(card('clara_schumann'))).toBe(1828)
  })

  it('only a Great Person in their career can be deployed', () => {
    const musashi = card('miyamoto_musashi')
    let gs = game(musashi.born + 5, ['miyamoto_musashi'], ['titian'])
    const loc = gs.locations[0].id
    gs = { ...gs, players: gs.players.map(p => p) }
    const young = gameReducer(gs, { type: 'DEPLOY_GP', cardId: 'miyamoto_musashi', locationId: loc, isPublic: true })
    expect(young).toBe(gs)
    const grown = { ...gs, year: careerStartYear(musashi) }
    const deployed = gameReducer(grown, { type: 'DEPLOY_GP', cardId: 'miyamoto_musashi', locationId: loc, isPublic: true })
    expect(deployed.locations[0].cards.some(c => c.cardId === 'miyamoto_musashi')).toBe(true)
  })
})

describe('one round is one year', () => {
  it('advances the year after every player has had a turn', () => {
    // Titian (born 1488) is in his career, so no time skip.
    const gs = game(1510, ['titian'], ['magellan'])
    const next = endRound(gs)
    expect(next.year).toBe(1511)
    expect(next.round).toBe(2)
  })
})

describe('death and succession', () => {
  it('a Great Person dies after their death year and the player chooses a successor born later', () => {
    // Magellan died in 1521; Titian keeps the human player in play.
    let gs = game(1521, ['titian', 'magellan'], ['isabel_i'])
    gs = place(gs, 0, 0, 'titian')
    gs = endRound(gs)
    expect(gs.year).toBe(1522)
    const me = gs.players[0]
    expect(me.archive).toContain('magellan')
    expect(me.gpHand).not.toContain('magellan')
    expect(me.pendingSuccessors).toHaveLength(1)

    const options = successorOptions(gs, 'player-0')
    expect(options).toHaveLength(SUCCESSOR_CHOICES)
    for (const id of options) expect(card(id).born).toBeGreaterThan(gs.year)
    const borns = options.map(id => card(id).born)
    expect([...borns].sort((a, b) => a - b)).toEqual(borns)

    // Someone already born is never a valid successor.
    const already = ALL_GP_CARDS.find(c => c.born <= gs.year && !options.includes(c.id))!
    expect(gameReducer(gs, { type: 'CHOOSE_SUCCESSOR', playerId: 'player-0', cardId: already.id })).toBe(gs)

    const chosen = gameReducer(gs, { type: 'CHOOSE_SUCCESSOR', playerId: 'player-0', cardId: options[0] })
    expect(chosen.players[0].gpHand).toContain(options[0])
    expect(chosen.players[0].pendingSuccessors).toHaveLength(0)
  })

  it('the computer chooses its successor at once', () => {
    let gs = game(1521, ['titian'], ['magellan'])
    gs = place(gs, 0, 0, 'titian')
    gs = endRound(gs)
    const cpu = gs.players[1]
    expect(cpu.archive).toContain('magellan')
    expect(cpu.pendingSuccessors).toHaveLength(0)
    const successor = cpu.gpHand.find(id => id !== 'magellan')!
    expect(card(successor).born).toBeGreaterThan(1521)
  })

  it('a Great Person killed in a fight dies and is succeeded', () => {
    const strongest = (ids: string[], stat: StatKey) => ids.reduce((a, b) => (card(a)[stat] >= card(b)[stat] ? a : b))
    const weakest = (ids: string[], stat: StatKey) => ids.reduce((a, b) => (card(a)[stat] <= card(b)[stat] ? a : b))
    const pool = ['titian', 'magellan', 'isabel_i', 'manuel_i', 'gutenberg', 'montezuma_ii', 'tlacaelel']
    const attacker = strongest(pool, 'strength')
    const victim = weakest(pool.filter(id => id !== attacker), 'strength')
    let gs = game(1500, [], ['bayinnaung'])
    gs = place(gs, 0, 0, attacker)
    gs = place(gs, 0, 1, victim)
    gs = { ...gs, locations: gs.locations.map((l, i) => (i === 0 ? { ...l, activeEvent: makeEventCard('strength', 'local_event', 'ev'), eventRoundsLeft: 99 } : l)) }
    gs = gameReducer(gs, { type: 'ATTACK', myInstanceId: `${attacker}-0`, theirInstanceId: `${victim}-1`, kill: true })
    expect(gs.players[1].archive).toContain(victim)
    // The computer's successor is already chosen.
    expect(gs.players[1].gpHand.length).toBeGreaterThan(1)
  })
})

describe('successions with nobody left', () => {
  it('a human succession ends its lineage when no one born later remains, so the game never waits on an empty choice', () => {
    const last = [...ALL_GP_CARDS].sort((a, b) => b.born - a.born)[0]
    let gs = game(last.born, ['titian'], [])
    gs = { ...gs, players: gs.players.map((p, i) => (i === 0 ? { ...p, archive: ['titian'], gpHand: [], pendingSuccessors: [{ predecessor: 'titian', year: last.born }] } : p)) }
    expect(successorOptions(gs, 'player-0')).toHaveLength(0)
    const settled = settle(gs)
    expect(settled.players[0].pendingSuccessors).toHaveLength(0)
    expect(settled.phase).toBe('ended')
  })
})

describe('retirement', () => {
  it('takes a Great Person out of play; the successor only comes at the real death year', () => {
    const magellan = card('magellan')
    let gs = game(1515, ['magellan', 'titian'], ['isabel_i'])
    gs = place(gs, 0, 0, 'titian')
    gs = gameReducer(gs, { type: 'RETIRE_GP', cardId: 'magellan' })
    expect(gs.players[0].retired).toContain('magellan')
    expect(gs.players[0].gpHand).not.toContain('magellan')
    expect(gs.players[0].pendingSuccessors).toHaveLength(0)
    expect(lifeStatus(gs, 'player-0', 'magellan')).toBe('retired')
    // Deploying a retired Great Person is not possible.
    expect(gameReducer(gs, { type: 'DEPLOY_GP', cardId: 'magellan', locationId: gs.locations[1].id, isPublic: true })).toBe(gs)

    while (gs.year <= magellan.died!) gs = endRound(gs)
    expect(gs.players[0].archive).toContain('magellan')
    expect(gs.players[0].retired).not.toContain('magellan')
    expect(gs.players[0].pendingSuccessors).toHaveLength(1)
  })
})

describe('time skips', () => {
  it('jumps ahead while no human Great Person is in their career, then hands the turn back', () => {
    const gutenberg = card('gutenberg')
    let gs = game(gutenberg.born - 30, ['gutenberg'], ['tlacaelel'])
    gs = place(gs, 0, 1, 'tlacaelel')
    gs = settle(gs)
    expect(gs.year).toBe(careerStartYear(gutenberg))
    expect(gs.pendingSummary?.kind).toBe('timeskip')
    expect(gs.currentPlayerIdx).toBe(0)
    expect(lifeStatus(gs, 'player-0', 'gutenberg')).toBe('active')
  })

  it('does not skip while a human still has to choose a successor', () => {
    let gs = game(1600, ['bernini'], ['borromini'])
    gs = { ...gs, players: gs.players.map((p, i) => (i === 0 ? { ...p, pendingSuccessors: [{ predecessor: 'magellan', year: 1600 }] } : p)) }
    const settled = settle(gs)
    expect(settled.year).toBe(1600)
  })

  it('a new game skips to the first human career at once', () => {
    for (let i = 0; i < 5; i++) {
      const gs = initGame({ mode: 'scenario', matchType: 'pvc', playerMode: 'pvc', eraMode: 'all', playerNames: ['You'], numComputers: 2 })
      if (gs.phase === 'ended') continue
      expect(gs.players[0].gpHand.some(id => lifeStatus(gs, 'player-0', id) === 'active')
        || gs.players[0].pendingSuccessors.length > 0).toBe(true)
    }
  })
})

describe('legacies', () => {
  it('claiming earns a point and the legacy, which fills a slot; each legacy is earned once', () => {
    const wins = card('titian').legacy.unlock.wins
    let gs = game(1520, [], ['magellan'])
    gs = place(gs, 0, 0, 'titian', { achievementTicks: wins })
    gs = gameReducer(gs, { type: 'CLAIM_ACHIEVEMENT', instanceId: 'titian-0' })
    expect(gs.players[0].winningPoints).toBe(1)
    expect(gs.players[0].legacies).toEqual(['titian'])
    expect(gs.players[0].activeLegacies).toEqual(['titian'])
    // No deck draw on the timeline.
    expect(gs.players[0].gpHand).toHaveLength(0)

    const again = { ...gs, turnActions: freshTurnActions(), locations: gs.locations.map(l => ({ ...l, cards: l.cards.map(c => ({ ...c, achievementTicks: wins })) })) }
    expect(gameReducer(again, { type: 'CLAIM_ACHIEVEMENT', instanceId: 'titian-0' }).players[0].winningPoints).toBe(1)
  })

  it(`only ${LEGACY_SLOTS} legacies are in effect; one change per turn`, () => {
    let gs = game(1520, ['titian'], ['magellan'])
    gs = { ...gs, players: gs.players.map((p, i) => (i === 0 ? { ...p, legacies: ['gandhi', 'gilgamesh', 'amelia_earhart'], activeLegacies: ['gandhi', 'gilgamesh'] } : p)) }
    expect(gameReducer(gs, { type: 'SET_LEGACY', cardId: 'amelia_earhart', active: true })).toBe(gs)
    gs = gameReducer(gs, { type: 'SET_LEGACY', cardId: 'gilgamesh', active: false })
    expect(gs.players[0].activeLegacies).toEqual(['gandhi'])
    expect(gameReducer(gs, { type: 'SET_LEGACY', cardId: 'amelia_earhart', active: true })).toBe(gs)
    gs = { ...gs, turnActions: freshTurnActions() }
    gs = gameReducer(gs, { type: 'SET_LEGACY', cardId: 'amelia_earhart', active: true })
    expect(gs.players[0].activeLegacies).toEqual(['gandhi', 'amelia_earhart'])
    // A legacy that was never earned cannot be used.
    expect(gameReducer({ ...gs, turnActions: freshTurnActions() }, { type: 'SET_LEGACY', cardId: 'euclid', active: true }).players[0].activeLegacies)
      .toEqual(['gandhi', 'amelia_earhart'])
  })

  it('contest legacies add to the right side: Satyagraha (+3 when defending) turns a lost defence', () => {
    let gs = game(1500, [], [])
    gs = place(gs, 0, 0, 'titian')
    gs = place(gs, 0, 1, 'titian')
    expect(legacyContest(gs, 'player-1', 'culture', 'defend').total).toBe(0)
    gs = { ...gs, players: gs.players.map((p, i) => (i === 1 ? { ...p, legacies: ['gandhi'], activeLegacies: ['gandhi'] } : p)) }
    expect(legacyContest(gs, 'player-1', 'culture', 'defend').total).toBe(3)
    expect(legacyContest(gs, 'player-1', 'culture', 'attack').total).toBe(0)
    // Equal sides would draw; the legacy makes the defender win.
    gs = { ...gs, locations: gs.locations.map((l, i) => (i === 0 ? { ...l, activeEvent: makeEventCard('culture', 'local_event', 'ev'), eventRoundsLeft: 99 } : l)) }
    const after = gameReducer(gs, { type: 'ATTACK', myInstanceId: 'titian-0', theirInstanceId: 'titian-1', kill: false })
    expect(after.pendingSummary?.kind).toBe('combat')
    if (after.pendingSummary?.kind === 'combat') {
      expect(after.pendingSummary.result).toBe('defender')
      expect(after.pendingSummary.defender.cards.some(c => c.type === 'legacy')).toBe(true)
    }
  })

  it('a hazard shield (Amelia Earhart) lets weak cards survive a natural hazard', () => {
    let gs = game(1500, [], ['titian'])
    gs = place(gs, 0, 0, 'magellan')
    const hazard = { id: 'hz', name: 'Natural Hazard: Flood', type: 'natural_hazard' as const, hazardType: 'Flood', description: '' }
    gs = { ...gs, locations: gs.locations.map((l, i) => (i === 0 ? { ...l, activeEvent: hazard, eventRoundsLeft: 1 } : l)) }
    const withShield = { ...gs, players: gs.players.map((p, i) => (i === 0 ? { ...p, legacies: ['amelia_earhart'], activeLegacies: ['amelia_earhart'] } : p)) }
    expect(hasHazardShield(withShield, 'player-0')).toBe(card('amelia_earhart').legacy.name)
    const shielded = endRound(withShield)
    expect(shielded.players[0].archive).not.toContain('magellan')
  })

  it('longevity and prodigy legacies change life spans and careers for their owner only', () => {
    const magellan = card('magellan')
    let gs = game(1500, ['magellan'], ['titian'])
    gs = { ...gs, players: gs.players.map((p, i) => (i === 0 ? { ...p, legacies: ['gilgamesh', 'michael_jackson'], activeLegacies: ['gilgamesh', 'michael_jackson'] } : p)) }
    const me = gs.players[0]
    expect(deathYear(magellan, me)).toBe(magellan.died! + 20)
    expect(deathYear(magellan, gs.players[1])).toBe(magellan.died)
    expect(careerStartYear(magellan, me)).toBe(magellan.born + 10)
  })

  it('every effect kind has a rule text', () => {
    for (const c of ALL_GP_CARDS) expect(describeLegacyEffect(c.legacy.effect).length).toBeGreaterThan(10)
  })
})

describe('city states', () => {
  it(`each empty city falls into a random state with a ${CITY_STATE_CHANCE * 100}% chance per year`, () => {
    const gs = game(1500, ['titian'])
    const all = rollCityStates(gs.locations, () => CITY_STATE_CHANCE - 0.01)
    for (const loc of all.locations) {
      expect(loc.activeEvent?.origin).toBe('city')
      expect(loc.eventRoundsLeft).toBe(CITY_STATE_YEARS[loc.activeEvent!.type as keyof typeof CITY_STATE_YEARS])
    }
    const none = rollCityStates(gs.locations, () => CITY_STATE_CHANCE + 0.01)
    for (const loc of none.locations) expect(loc.activeEvent).toBeNull()
  })

  it('a city that already has a state keeps it', () => {
    const gs = game(1500, ['titian'])
    const busy = gs.locations.map((l, i) => (i === 0 ? { ...l, activeEvent: makeEventCard('wealth', 'local_event', 'mine'), eventRoundsLeft: 99 } : l))
    const rolled = rollCityStates(busy, () => 0)
    expect(rolled.locations[0].activeEvent?.id).toBe('mine')
  })

  it('random states cover local events, survivals and hazards, never global competitions', () => {
    const seen = new Set<string>()
    const gs = game(1500, ['titian'])
    for (let k = 0; k < 24; k++) {
      let calls = 0
      const rand = () => (calls++ === 0 ? 0 : k / 24 + 0.001)
      const r = rollCityStates([gs.locations[0]], rand)
      seen.add(r.locations[0].activeEvent!.type)
    }
    expect([...seen].sort()).toEqual(['local_event', 'local_survival', 'natural_hazard'])
  })

  it('timeline games roll city states at the turn of the year', () => {
    let gs = game(1500, ['titian'], ['magellan'])
    gs = place(gs, 0, 0, 'titian')
    gs = { ...gs, setup: { ...gs.setup, noHazards: false } }
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const next = endRound(gs)
    expect(next.locations.filter(l => l.activeEvent?.origin === 'city').length).toBeGreaterThan(0)
  })
})

describe('end of the game', () => {
  it('runs to the end of history and the most legacies wins', () => {
    let gs = game(TIMELINE_END_YEAR - 1, ['peter_arnett'], ['jane_goodall'])
    gs = { ...gs, players: gs.players.map((p, i) => (i === 0 ? { ...p, legacies: ['gandhi'] } : { ...p, legacies: ['euclid', 'titian'] })) }
    gs = place(gs, 0, 0, 'peter_arnett')
    gs = endRound(gs)
    expect(gs.phase).toBe('ended')
    expect(gs.winner).toBe('player-1')
  })

  it('five points no longer end a timeline game', () => {
    let gs = game(1510, ['titian'], ['magellan'])
    gs = place(gs, 0, 0, 'titian')
    gs = { ...gs, players: gs.players.map((p, i) => (i === 0 ? { ...p, winningPoints: 7, legacies: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] } : p)) }
    gs = endRound(gs)
    expect(gs.phase).toBe('playing')
  })

  it('when a human has no lineage left, the computer plays history out and legacies decide', () => {
    let gs = game(1990, [], ['steve_jobs'])
    gs = place(gs, 0, 1, 'steve_jobs')
    gs = { ...gs, players: gs.players.map((p, i) => (i === 0 ? { ...p, legacies: ['gandhi', 'euclid'] } : p)) }
    const done = settle(gs)
    expect(done.phase).toBe('ended')
    // Jobs dies in 2011 and nobody born later is left for the CPU, or history reaches its end.
    expect(done.year).toBeGreaterThan(1990)
    expect(done.winner).toBe(done.players[1].legacies.length > 2 ? 'player-1' : 'player-0')
  })
})

describe('the Epic lessons keep the timeless rules', () => {
  it('scripted games are not on the timeline', () => {
    const gs = initScriptedGame({ locations: ['x'], player: { gp: ['gandhi'] }, cpu: { gp: ['mao_zedong'] } })
    expect(gs.setup.timeline).toBe(false)
    expect(lifeStatus(gs, 'player-0', 'gandhi')).toBe('active')
  })
})

describe('card data for the timeline', () => {
  it('every Great Person has a life, a career start and a legacy the engine understands', () => {
    const kinds = new Set(['contest', 'follower', 'hazard_shield', 'longevity', 'prodigy', 'successors', 'income'])
    for (const c of ALL_GP_CARDS) {
      expect(Number.isInteger(c.born), c.id).toBe(true)
      if (c.died !== null) expect(c.died, c.id).toBeGreaterThan(c.born)
      const career = c.careerAge ?? 18
      expect(career, c.id).toBeGreaterThanOrEqual(4)
      if (c.died !== null) expect(c.born + career, c.id).toBeLessThan(c.died)
      expect(c.legacy.name.length, c.id).toBeGreaterThan(0)
      expect(STATS, c.id).toContain(c.legacy.unlock.stat)
      expect(c.legacy.unlock.wins, c.id).toBeGreaterThanOrEqual(1)
      expect(kinds.has(c.legacy.effect.kind), c.id).toBe(true)
      // The mobile apps still read `achievement`: it describes how the legacy is earned.
      expect(c.achievement.length, c.id).toBeGreaterThan(0)
    }
  })
})

describe('a whole game', () => {
  it('runs from the opening year to its end without stalling, with time only moving forward', () => {
    for (const era of ['Ancient', 'Renaissance', 'Information', 'Information', 'Information', 'Electricity']) {
      let gs = initGame({ mode: 'scenario', matchType: 'pvc', playerMode: 'pvc', eraMode: 'all', startEra: era, playerNames: ['You'], numComputers: 2 })
      let steps = 0
      let lastYear = gs.year
      while (gs.phase === 'playing' && steps < 20000) {
        steps++
        const me = gs.players[0]
        if (me.pendingSuccessors.length) {
          const options = successorOptions(gs, me.id)
          for (const id of options) expect(card(id).born).toBeGreaterThan(gs.year)
          gs = gameReducer(gs, { type: 'CHOOSE_SUCCESSOR', playerId: me.id, cardId: options[0] })
          continue
        }
        const p = gs.players[gs.currentPlayerIdx]
        const ready = p.gpHand.find(id => lifeStatus(gs, p.id, id) === 'active')
        if (ready && !gs.turnActions.deployedGP) {
          gs = gameReducer(gs, { type: 'DEPLOY_GP', cardId: ready, locationId: gs.locations[steps % gs.locations.length].id, isPublic: true })
        }
        gs = gameReducer(gs, { type: 'END_TURN' })
        expect(gs.year).toBeGreaterThanOrEqual(lastYear)
        lastYear = gs.year
      }
      expect(gs.phase, `${era} game did not finish`).toBe('ended')
      expect(gs.winner).not.toBeNull()
    }
  })
})
