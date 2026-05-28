import { describe, it, expect } from 'vitest'
import type {
  Card, AuthResponse, Match, BattleMessage,
  StatKey, FollowerCard, EventType, EventCard,
  OnboardCard, LocationState, PlayerState, TurnActions,
  GameMode, PlayerMode, EraMode, MatchType, GameSetup,
  CardContrib, CombatSide, CombatSummary, EventPlayerResult,
  EventSummary, GameSummary, GameState,
} from '@/types'

// Runtime helpers — build valid objects that satisfy the TypeScript interfaces

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'test-id',
    figureName: 'Test Figure',
    era: 'Steam',
    gender: 'male',
    identities: [],
    countries: [],
    lore: 'Some lore',
    portraitUrl: '',
    years: '2000–2024',
    trait: '',
    achievement: '',
    politics: 50,
    strength: 50,
    culture: 50,
    wealth: 50,
    intelligence: 50,
    technique: 50,
    belief: 50,
    reputation: 50,
    ...overrides,
  }
}

describe('Card type shape', () => {
  it('accepts male and female gender', () => {
    const genders = ['male', 'female']
    genders.forEach((gender) => {
      const c = makeCard({ gender })
      expect(c.gender).toBe(gender)
    })
  })

  it('stores 8 numeric stats correctly', () => {
    const c = makeCard({ politics: 92, strength: 35, culture: 78, wealth: 25, intelligence: 82, technique: 40, belief: 90, reputation: 95 })
    expect(c.politics + c.strength + c.culture + c.wealth + c.intelligence + c.technique + c.belief + c.reputation).toBe(537)
  })

  it('stores identities as an array', () => {
    const c = makeCard({ identities: ['Statesman', 'Educator'] })
    expect(c.identities).toHaveLength(2)
    expect(c.identities[0]).toBe('Statesman')
  })

  it('portraitUrl defaults to empty string', () => {
    const c = makeCard()
    expect(c.portraitUrl).toBe('')
  })

  it('countries defaults to empty array', () => {
    const c = makeCard()
    expect(c.countries).toEqual([])
  })

  it('countries can hold multiple values', () => {
    const c = makeCard({ countries: ['Egypt', 'Persia'] })
    expect(c.countries).toHaveLength(2)
    expect(c.countries![0]).toBe('Egypt')
  })

  it('countries is optional (undefined when omitted)', () => {
    // countries?: string[] — can be absent from the object
    const c: Card = { ...makeCard(), countries: undefined }
    expect(c.countries).toBeUndefined()
  })

  it('all 7 era values are valid', () => {
    const eras = ['Ancient', 'Classical', 'Medieval', 'Renaissance', 'Steam', 'Electricity', 'Information']
    eras.forEach((era) => {
      const c = makeCard({ era })
      expect(c.era).toBe(era)
    })
  })
})

describe('AuthResponse type shape', () => {
  it('holds access and refresh tokens', () => {
    const r: AuthResponse = { accessToken: 'at', refreshToken: 'rt' }
    expect(r.accessToken).toBe('at')
    expect(r.refreshToken).toBe('rt')
  })
})

describe('Match type shape', () => {
  it('accepts all valid status values', () => {
    const statuses: Match['status'][] = ['waiting', 'active', 'finished', 'forfeited']
    statuses.forEach((status) => {
      const m: Match = {
        id: 'match-1', playerAId: 'u1', playerBId: null,
        status, scoreA: 0, scoreB: 0, currentRound: 1,
      }
      expect(m.status).toBe(status)
    })
  })

  it('playerBId can be null while waiting', () => {
    const m: Match = {
      id: 'm1', playerAId: 'u1', playerBId: null,
      status: 'waiting', scoreA: 0, scoreB: 0, currentRound: 1,
    }
    expect(m.playerBId).toBeNull()
  })
})

describe('BattleMessage type shape', () => {
  it('holds event string and string-keyed payload', () => {
    const msg: BattleMessage = { event: 'round_start', payload: { round: '3', player: 'alice' } }
    expect(msg.event).toBe('round_start')
    expect(msg.payload['round']).toBe('3')
  })

  it('payload can be empty', () => {
    const msg: BattleMessage = { event: 'ping', payload: {} }
    expect(Object.keys(msg.payload)).toHaveLength(0)
  })
})

describe('StatKey type', () => {
  it('covers all 8 stat keys', () => {
    const stats: StatKey[] = ['politics', 'strength', 'culture', 'wealth', 'intelligence', 'technique', 'belief', 'reputation']
    expect(stats).toHaveLength(8)
    stats.forEach(s => expect(typeof s).toBe('string'))
  })
})

describe('FollowerCard type shape', () => {
  it('stores name, stat, bonus, imageKey', () => {
    const fc: FollowerCard = { id: 'f1', name: 'Advisor', stat: 'politics', bonus: 10, imageKey: 'advisor.png' }
    expect(fc.stat).toBe('politics')
    expect(fc.bonus).toBe(10)
  })

  it('accepts every valid StatKey', () => {
    const stats: StatKey[] = ['politics', 'strength', 'culture', 'wealth', 'intelligence', 'technique', 'belief', 'reputation']
    stats.forEach(stat => {
      const fc: FollowerCard = { id: 'x', name: 'X', stat, bonus: 5, imageKey: 'x.png' }
      expect(fc.stat).toBe(stat)
    })
  })
})

describe('EventCard type shape', () => {
  it('holds all 4 EventType values', () => {
    const types: EventType[] = ['local_event', 'local_survival', 'global_competition', 'natural_hazard']
    types.forEach(type => {
      const ec: EventCard = { id: 'e1', name: 'Test', type, description: 'desc' }
      expect(ec.type).toBe(type)
    })
  })

  it('stat is optional', () => {
    const ec: EventCard = { id: 'e2', name: 'Flood', type: 'natural_hazard', hazardType: 'flood', description: 'desc' }
    expect(ec.stat).toBeUndefined()
    expect(ec.hazardType).toBe('flood')
  })

  it('stat present for local_event', () => {
    const ec: EventCard = { id: 'e3', name: 'Election', type: 'local_event', stat: 'politics', description: 'desc' }
    expect(ec.stat).toBe('politics')
  })
})

describe('OnboardCard type shape', () => {
  it('distinguishes gp vs follower types', () => {
    const gp: OnboardCard = { instanceId: 'i1', cardId: 'c1', type: 'gp', playerId: 'p1', isPublic: true, justDeployed: false, achievementTicks: 0 }
    const follower: OnboardCard = { instanceId: 'i2', cardId: 'c2', type: 'follower', playerId: 'p1', isPublic: false, justDeployed: true, achievementTicks: 2 }
    expect(gp.type).toBe('gp')
    expect(follower.type).toBe('follower')
    expect(follower.justDeployed).toBe(true)
  })
})

describe('LocationState type shape', () => {
  it('holds cards array and optional event', () => {
    const loc: LocationState = {
      id: 'l1', name: 'Rome', era: 'Classical',
      cards: [], activeEvent: null, eventRoundsLeft: 0,
    }
    expect(loc.cards).toHaveLength(0)
    expect(loc.activeEvent).toBeNull()
  })

  it('imageKey and countries are optional', () => {
    const loc: LocationState = {
      id: 'l2', name: 'Athens', era: 'Ancient',
      cards: [], activeEvent: null, eventRoundsLeft: 0,
    }
    expect(loc.imageKey).toBeUndefined()
    expect(loc.countries).toBeUndefined()
  })
})

describe('PlayerState type shape', () => {
  it('stores separate hand types', () => {
    const p: PlayerState = {
      id: 'u1', name: 'Alice', isComputer: false,
      gpHand: ['card1'], eventHand: [], followerHand: [],
      archive: [], winningPoints: 3,
    }
    expect(p.gpHand).toContain('card1')
    expect(p.winningPoints).toBe(3)
    expect(p.isComputer).toBe(false)
  })

  it('isComputer true for AI player', () => {
    const p: PlayerState = {
      id: 'ai', name: 'Computer', isComputer: true,
      gpHand: [], eventHand: [], followerHand: [],
      archive: [], winningPoints: 0,
    }
    expect(p.isComputer).toBe(true)
  })
})

describe('TurnActions type shape', () => {
  it('tracks boolean flags and card id arrays', () => {
    const ta: TurnActions = { deployedGP: true, addedFollower: false, movedCards: ['c1', 'c2'], actedCards: ['c3'] }
    expect(ta.deployedGP).toBe(true)
    expect(ta.movedCards).toHaveLength(2)
    expect(ta.actedCards[0]).toBe('c3')
  })
})

describe('GameSetup type shape', () => {
  it('accepts all GameMode values', () => {
    const modes: GameMode[] = ['generic', 'scenario']
    modes.forEach(mode => {
      const gs: GameSetup = { mode, matchType: 'casual', playerMode: 'pvp', eraMode: 'all', playerNames: ['A', 'B'], numComputers: 0 }
      expect(gs.mode).toBe(mode)
    })
  })

  it('accepts all MatchType values', () => {
    const types: MatchType[] = ['casual', 'ranked', 'pvc']
    types.forEach(matchType => {
      const gs: GameSetup = { mode: 'generic', matchType, playerMode: 'pvp', eraMode: 'all', playerNames: ['A'], numComputers: 0 }
      expect(gs.matchType).toBe(matchType)
    })
  })

  it('accepts all PlayerMode and EraMode values', () => {
    const playerModes: PlayerMode[] = ['pvp', 'pvc']
    const eraModes: EraMode[] = ['all', 'single']
    playerModes.forEach(playerMode => {
      eraModes.forEach(eraMode => {
        const gs: GameSetup = { mode: 'generic', matchType: 'casual', playerMode, eraMode, playerNames: ['A'], numComputers: 0 }
        expect(gs.playerMode).toBe(playerMode)
        expect(gs.eraMode).toBe(eraMode)
      })
    })
  })

  it('singleEra is optional', () => {
    const gs: GameSetup = { mode: 'scenario', matchType: 'casual', playerMode: 'pvp', eraMode: 'single', singleEra: 'Medieval', playerNames: ['A'], numComputers: 0 }
    expect(gs.singleEra).toBe('Medieval')
    const gs2: GameSetup = { mode: 'generic', matchType: 'casual', playerMode: 'pvp', eraMode: 'all', playerNames: ['A'], numComputers: 0 }
    expect(gs2.singleEra).toBeUndefined()
  })
})

describe('CombatSummary type shape', () => {
  function makeCardContrib(overrides: Partial<CardContrib> = {}): CardContrib {
    return { type: 'gp', name: 'Caesar', baseStat: 80, traitBonus: 5, followerBonus: 10, locationBonus: 0, ...overrides }
  }

  it('kind discriminator is "combat"', () => {
    const side: CombatSide = { playerName: 'Alice', cards: [makeCardContrib()], total: 95 }
    const cs: CombatSummary = {
      kind: 'combat', locationName: 'Rome', stat: 'strength',
      attacker: side, defender: { playerName: 'Bob', cards: [], total: 60 },
      result: 'attacker', kill: false,
    }
    expect(cs.kind).toBe('combat')
    expect(cs.result).toBe('attacker')
  })

  it('result can be draw', () => {
    const side: CombatSide = { playerName: 'X', cards: [], total: 50 }
    const cs: CombatSummary = {
      kind: 'combat', locationName: 'Athens', stat: 'culture',
      attacker: side, defender: side, result: 'draw', kill: false,
    }
    expect(cs.result).toBe('draw')
  })

  it('CardContrib optional fields can be absent', () => {
    const cc: CardContrib = { type: 'follower', name: 'Advisor', baseStat: 20, traitBonus: 0, followerBonus: 5, locationBonus: 0 }
    expect(cc.portraitUrl).toBeUndefined()
    expect(cc.imageKey).toBeUndefined()
  })
})

describe('EventSummary type shape', () => {
  it('kind discriminator is "event"', () => {
    const result: EventPlayerResult = {
      playerName: 'Alice', total: 70, threshold: 60, survived: true,
      cards: [],
    }
    const es: EventSummary = {
      kind: 'event', eventName: 'Flood', eventType: 'natural_hazard',
      locationName: 'Nile', threshold: 60, results: [result],
    }
    expect(es.kind).toBe('event')
    expect(es.results[0].survived).toBe(true)
  })

  it('winnerName is optional', () => {
    const es: EventSummary = {
      kind: 'event', eventName: 'Election', eventType: 'global_competition',
      stat: 'politics', locationName: 'Rome', threshold: 50, results: [],
    }
    expect(es.winnerName).toBeUndefined()
    expect(es.stat).toBe('politics')
  })
})

describe('GameSummary discriminated union', () => {
  it('narrows correctly to CombatSummary via kind', () => {
    const side: CombatSide = { playerName: 'A', cards: [], total: 40 }
    const summary: GameSummary = {
      kind: 'combat', locationName: 'X', stat: 'strength',
      attacker: side, defender: side, result: 'defender', kill: true,
    }
    if (summary.kind === 'combat') {
      expect(summary.kill).toBe(true)
    } else {
      throw new Error('Expected combat summary')
    }
  })

  it('narrows correctly to EventSummary via kind', () => {
    const summary: GameSummary = {
      kind: 'event', eventName: 'Drought', eventType: 'natural_hazard',
      locationName: 'Y', threshold: 40, results: [],
    }
    if (summary.kind === 'event') {
      expect(summary.eventName).toBe('Drought')
    } else {
      throw new Error('Expected event summary')
    }
  })
})
