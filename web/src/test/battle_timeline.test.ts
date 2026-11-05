// The real-history rules of the fight game: one round per year, careers,
// deaths and successors, retirement, time skips, legacies and city states.
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { GameState, OnboardCard, StatKey } from '@/types'
import {
  ALL_GP_CARDS, CITY_STATE_CHANCE, CITY_STATE_YEARS, LEGACY_SLOTS, STATS, SUCCESSOR_CHOICES, TIMELINE_END_YEAR,
  careerStartYear, deathYear, describeLegacyEffect, freshTurnActions, gameReducer, getGPCard, hasHazardShield,
  initGame, initScriptedGame, legacyContest, lifeStatus, makeEventCard, rollCityStates, settle, successorOptions,
  BASE_GP_SLOTS, gpSlots, lineageCount, GLOBAL_COMPETITION_CHANCE,
  BASE_LOCATIONS, ERAS, alignLocations, eraForYear, eraStartYear, locationTarget,
  type GameAction,
} from '@/battle/engine'

afterEach(() => { vi.restoreAllMocks() })

const card = (id: string) => getGPCard(id)!

/**
 * A quiet two-player timeline game (you vs one CPU) at `year`, with no city
 * states and an empty board.  Each player has a Great Person slot for every
 * card they are handed, so successions are owed as in a full table.
 */
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
      extraSlots: Math.max(0, (i === 0 ? human : cpu).length - 1),
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
    let gs = game(1500, [], ['bayinnaung', victim])
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
    gs = { ...gs, players: gs.players.map((p, i) => (i === 0 ? { ...p, extraSlots: 1, pendingSuccessors: [{ predecessor: 'magellan', year: 1600 }] } : p)) }
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
    const kinds = new Set(['contest', 'follower', 'hazard_shield', 'longevity', 'prodigy', 'successors', 'slots', 'locations', 'income'])
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
          // The opening pick is among contemporaries; every later pick is born after now.
          if (me.pendingSuccessors[0].reason !== 'start') for (const id of options) expect(card(id).born).toBeGreaterThan(gs.year)
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

describe('Great Person slots', () => {
  it('everyone holds one Great Person when history opens', () => {
    expect(BASE_GP_SLOTS).toBe(1)
    const gs = initGame({ mode: 'scenario', matchType: 'pvc', playerMode: 'pvc', eraMode: 'all', startEra: 'Steam', playerNames: ['You'], numComputers: 2 })
    for (const p of gs.players) expect(lineageCount(gs, p), p.name).toBe(1)
  })

  it('a slot legacy put into effect opens a pick for a new lineage, chosen from people born later', () => {
    let gs = game(1600, ['bernini'])
    gs = place(gs, 0, 0, 'bernini')
    gs = { ...gs, players: gs.players.map((p, i) => (i === 0 ? { ...p, legacies: ['yekaterina'] } : p)) }
    expect(gpSlots(gs.players[0])).toBe(1)
    gs = gameReducer(gs, { type: 'SET_LEGACY', cardId: 'yekaterina', active: true })
    expect(gpSlots(gs.players[0])).toBe(2)
    const me = gs.players[0]
    expect(me.pendingSuccessors).toEqual([expect.objectContaining({ predecessor: null, reason: 'slot' })])
    const options = successorOptions(gs, me.id)
    expect(options.length).toBeGreaterThan(0)
    for (const id of options) expect(card(id).born).toBeGreaterThan(gs.year)
    gs = gameReducer(gs, { type: 'CHOOSE_SUCCESSOR', playerId: me.id, cardId: options[0] })
    expect(gs.players[0].gpHand).toContain(options[0])
    expect(lineageCount(gs, gs.players[0])).toBe(2)
  })

  it('without the slot, a second lineage is not succeeded when its Great Person dies', () => {
    // Two Great People but one slot: Magellan dies in 1521 and nobody replaces him.
    let gs = game(1521, ['titian', 'magellan'])
    gs = { ...gs, players: gs.players.map((p, i) => (i === 0 ? { ...p, extraSlots: 0 } : p)) }
    gs = place(gs, 0, 0, 'titian')
    gs = endRound(gs)
    expect(gs.players[0].archive).toContain('magellan')
    expect(gs.players[0].pendingSuccessors).toHaveLength(0)
    expect(lineageCount(gs, gs.players[0])).toBe(1)
  })

  it('the global competition never opens a Great Person slot', () => {
    let gs = game(1600, ['bernini'])
    gs = gameReducer(gs, { type: 'GLOBAL_COMP_REWARD', playerId: 'player-0', rewardType: 'gp' })
    expect(gpSlots(gs.players[0])).toBe(1)
    expect(gs.players[0].pendingSuccessors).toHaveLength(0)
  })

  it('four legacies open a slot, and the rules text says so', () => {
    const slotCards = ALL_GP_CARDS.filter(c => c.legacy.effect.kind === 'slots').map(c => c.figureName).sort()
    expect(slotCards).toEqual(['Catherine the Great', 'Chanakya', 'Isabel I of Castile', 'Sargon I'])
    expect(describeLegacyEffect({ kind: 'slots', count: 1 })).toMatch(/slot/)
  })
})

describe('reports for every contest', () => {
  it('each survival check at the end of a round gets its own report, one after another', () => {
    let gs = game(1600, ['bernini', 'titian'], ['borromini', 'magellan'])
    gs = { ...gs, year: 1640 }
    gs = place(gs, 0, 0, 'bernini')
    gs = place(gs, 1, 1, 'borromini')
    gs = {
      ...gs,
      locations: gs.locations.map((l, i) => (i < 2 ? { ...l, activeEvent: makeEventCard('culture', 'local_survival', `ev${i}`), eventRoundsLeft: 3 } : l)),
    }
    gs = endRound(gs)
    expect(gs.pendingSummary?.kind).toBe('event')
    const first = gs.pendingSummary
    expect(gs.summaryQueue).toHaveLength(1)
    gs = gameReducer(gs, { type: 'DISMISS_SUMMARY' })
    expect(gs.pendingSummary?.kind).toBe('event')
    expect(gs.pendingSummary).not.toBe(first)
    gs = gameReducer(gs, { type: 'DISMISS_SUMMARY' })
    expect(gs.pendingSummary).toBeNull()
  })
})

describe('prizes for winning contests', () => {
  /** You and the computer face each other at the first city in a running local event. */
  function standoff(stat: StatKey, mine: string, theirs: string) {
    let gs = game(1640, [mine], [theirs])
    gs = place(gs, 0, 0, mine)
    gs = place(gs, 0, 1, theirs)
    return { ...gs, locations: gs.locations.map((l, i) => (i === 0 ? { ...l, activeEvent: makeEventCard(stat, 'local_event', 'ev'), eventRoundsLeft: 99 } : l)) }
  }
  const stronger = (a: string, b: string, stat: StatKey) => card(a)[stat] > card(b)[stat]

  it('winning an attack earns a prize of 2 Followers or 1 Event card, and nothing toward a legacy', () => {
    const [a, b] = stronger('bernini', 'borromini', 'culture') ? ['bernini', 'borromini'] : ['borromini', 'bernini']
    let gs = standoff('culture', a, b)
    const followers = gs.players[0].followerHand.length, events = gs.players[0].eventHand.length
    gs = gameReducer(gs, { type: 'ATTACK', myInstanceId: `${a}-0`, theirInstanceId: `${b}-1`, kill: false })
    expect(gs.pendingSummary?.kind === 'combat' && gs.pendingSummary.result).toBe('attacker')
    expect(gs.pendingRewards).toEqual([expect.objectContaining({ playerId: 'player-0', size: 1 })])
    const took = gameReducer(gs, { type: 'CHOOSE_REWARD', playerId: 'player-0', pick: 'followers' })
    expect(took.players[0].followerHand.length).toBe(followers + 2)
    expect(took.pendingRewards).toHaveLength(0)
    const tookEvent = gameReducer(gs, { type: 'CHOOSE_REWARD', playerId: 'player-0', pick: 'events' })
    expect(tookEvent.players[0].eventHand.length).toBe(events + 1)
  })

  it('a computer that holds off an attack takes its prize at once', () => {
    const [weak, strong] = stronger('bernini', 'borromini', 'culture') ? ['borromini', 'bernini'] : ['bernini', 'borromini']
    let gs = standoff('culture', weak, strong)
    const before = gs.players[1].eventHand.length + gs.players[1].followerHand.length
    gs = gameReducer(gs, { type: 'ATTACK', myInstanceId: `${weak}-0`, theirInstanceId: `${strong}-1`, kill: false })
    expect(gs.pendingSummary?.kind === 'combat' && gs.pendingSummary.result).toBe('defender')
    expect(gs.pendingRewards ?? []).toHaveLength(0)
    expect(gs.players[1].eventHand.length + gs.players[1].followerHand.length).toBeGreaterThan(before)
  })

  it('surviving while a rival is swept away wins the survival', () => {
    // A survival in your strongest stat at a city you hold with a follower; the rival's weak card fails.
    let gs = game(1640, ['bernini'], ['borromini'])
    const stat = (['culture', 'technique', 'reputation', 'wealth'] as StatKey[]).find(k => card('bernini')[k] >= 5 && card('borromini')[k] < 5)
    if (!stat) return
    gs = place(gs, 0, 0, 'bernini')
    gs = place(gs, 0, 1, 'borromini')
    gs = { ...gs, locations: gs.locations.map((l, i) => (i === 0 ? { ...l, activeEvent: makeEventCard(stat, 'local_survival', 'sv'), eventRoundsLeft: 3 } : l)) }
    gs = endRound(gs)
    expect(gs.pendingRewards).toEqual([expect.objectContaining({ playerId: 'player-0', size: 1 })])
  })

  it('the global competition winner takes a double prize: 4 Followers or 2 Event cards', () => {
    let gs = game(1640, ['bernini'], ['borromini'])
    gs = place(gs, 0, 0, 'bernini')
    gs = place(gs, 1, 1, 'borromini')
    const stat = (['culture', 'technique', 'reputation'] as StatKey[]).find(k => card('bernini')[k] !== card('borromini')[k])!
    const winner = card('bernini')[stat] > card('borromini')[stat] ? 0 : 1
    gs = { ...gs, globalCompetitionActive: makeEventCard(stat, 'global_competition', 'gc') }
    gs = endRound(gs)
    if (winner === 0) {
      expect(gs.pendingRewards).toEqual([expect.objectContaining({ playerId: 'player-0', size: 2 })])
      const n = gs.players[0].followerHand.length
      gs = gameReducer(gs, { type: 'CHOOSE_REWARD', playerId: 'player-0', pick: 'followers' })
      expect(gs.players[0].followerHand.length).toBe(n + 4)
    } else {
      expect(gs.pendingRewards ?? []).toHaveLength(0)
    }
  })

  it('a global competition breaks out by itself in 5% of years', () => {
    expect(GLOBAL_COMPETITION_CHANCE).toBe(0.05)
    let gs = game(1640, ['bernini'], ['borromini'])
    gs = { ...gs, setup: { ...gs.setup, noHazards: false } }
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    const hit = endRound(gs)
    expect(hit.globalCompetitionActive?.type).toBe('global_competition')
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    expect(endRound(gs).globalCompetitionActive).toBeNull()
  })
})

describe('cities follow the age', () => {
  it('a new game opens on four cities of the age it starts in', () => {
    expect(BASE_LOCATIONS).toBe(4)
    for (const era of ERAS) {
      const gs = initGame({ mode: 'scenario', matchType: 'pvc', playerMode: 'pvc', eraMode: 'all', startEra: era, playerNames: ['You'], numComputers: 1 })
      expect(gs.locations, era).toHaveLength(4)
      for (const l of gs.locations) expect(l.era, `${era}: ${l.name}`).toBe(era)
      expect(new Set(gs.locations.map(l => l.name)).size).toBe(4)
    }
  })

  it('each age opens with the birth of its first Great Person', () => {
    for (const era of ERAS) {
      expect(eraForYear(eraStartYear(era))).toBe(era)
      if (era !== ERAS[0]) expect(eraForYear(eraStartYear(era) - 1)).not.toBe(era)
    }
  })

  it('when the age changes every city becomes one of the new age, and its cards stay', () => {
    const steam = eraStartYear('Steam')
    let gs = game(steam - 1, ['bernini'], ['borromini'])
    gs = { ...gs, locations: gs.locations.map(l => ({ ...l, era: 'Renaissance' })) }
    gs = place(gs, 0, 0, 'bernini')
    const before = gs.locations[0].cards
    gs = alignLocations({ ...gs, year: steam })
    for (const l of gs.locations) expect(l.era).toBe('Steam')
    expect(gs.locations[0].cards).toEqual(before)
    expect(new Set(gs.locations.map(l => l.name)).size).toBe(gs.locations.length)
  })

  it('a city legacy adds a city for everyone; set aside, the extra city leaves once it is empty', () => {
    let gs = game(1600, ['bernini'], ['borromini'])
    gs = alignLocations(gs)
    expect(gs.locations).toHaveLength(4)
    gs = { ...gs, players: gs.players.map((p, i) => (i === 1 ? { ...p, legacies: ['magellan'], activeLegacies: ['magellan'] } : p)) }
    expect(locationTarget(gs)).toBe(5)
    gs = alignLocations(gs)
    expect(gs.locations).toHaveLength(5)
    expect(gs.locations[4].era).toBe(gs.locations[0].era)
    // Set aside, the board shrinks back by an empty city; the one with a card stays.
    gs = place(gs, 4, 0, 'bernini')
    const occupied = gs.locations[4].name
    gs = { ...gs, players: gs.players.map((p, i) => (i === 1 ? { ...p, activeLegacies: [] } : p)) }
    const shrunk = alignLocations(gs)
    expect(shrunk.locations).toHaveLength(4)
    expect(shrunk.locations.map(l => l.name)).toContain(occupied)
    // With every city occupied, it waits until one empties.
    const full = { ...gs, locations: gs.locations.map(l => ({ ...l, cards: l.cards.length ? l.cards : [{ ...gs.locations[4].cards[0], instanceId: `x-${l.id}` }] })) }
    expect(alignLocations(full).locations).toHaveLength(5)
  })

  it('a whole game always shows cities of the current age', () => {
    for (const era of ['Renaissance', 'Electricity']) {
      let gs = initGame({ mode: 'scenario', matchType: 'pvc', playerMode: 'pvc', eraMode: 'all', startEra: era, playerNames: ['You'], numComputers: 1 })
      for (let steps = 0; gs.phase === 'playing' && steps < 4000; steps++) {
        const me = gs.players[0]
        if (me.pendingSuccessors.length) { gs = gameReducer(gs, { type: 'CHOOSE_SUCCESSOR', playerId: me.id, cardId: successorOptions(gs, me.id)[0] }); continue }
        if (gs.pendingRewards?.length) { gs = gameReducer(gs, { type: 'CHOOSE_REWARD', playerId: gs.pendingRewards[0].playerId, pick: 'followers' }); continue }
        gs = gameReducer(gs, { type: 'END_TURN' })
        for (const l of gs.locations) expect(l.era, `${gs.year}: ${l.name}`).toBe(eraForYear(gs.year))
      }
    }
  })
})
