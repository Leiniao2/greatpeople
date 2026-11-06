// The 64 Great People added on 2026-11-05 so that every career overlaps at
// least three others.  Checks the roster rule itself, then that every new
// trait and every new achievement can actually fire.
import { describe, it, expect } from 'vitest'
import type { Card, FollowerCard, GameState, LocationState, OnboardCard, StatKey, TurnActions } from '@/types'
import { ACHIEVEMENTS, type AchievementEvent, type Lookups } from '@/battle/achievements'
import { ALL_GP_CARDS, careerStartYear, deathYear, followerFromId, freshTurnActions, traitBonusForGP } from '@/battle/engine'

const NEW = [
  'djoser', 'sneferu', 'puabi', 'meskalamdug', 'ku_baba', 'eannatum', 'ur_nanshe', 'emperor_yao', 'harkhuf',
  'enheduanna', 'mursili_i', 'yi_yin', 'nedjeh', 'queen_tiye', 'tushratta', 'suppiluliuma_i', 'gyges', 'guan_zhong',
  'cyrus_the_great', 'confucius', 'tomyris', 'chandragupta_maurya', 'epicurus', 'julius_caesar', 'cleopatra_vii',
  'vercingetorix', 'shapur_i', 'zenobia', 'plotinus', 'theodoric_the_great', 'zu_chongzhi', 'saint_genevieve',
  'empress_theodora', 'queen_seondeok', 'xuanzang', 'brahmagupta', 'charlemagne', 'jabir_ibn_hayyan',
  'murasaki_shikibu', 'avicenna', 'leif_erikson', 'hildegard_of_bingen', 'jayavarman_vii', 'averroes', 'fibonacci',
  'sundiata_keita', 'tomoe_gozen', 'ibn_khaldun', 'timur', 'hafez', 'cosimo_de_medici', 'zara_yaqob',
  'peter_the_great', 'osei_tutu', 'harriet_tubman', 'nikola_tesla', 'jose_rizal', 'marie_curie',
  'alberto_santos_dumont', 'frida_kahlo', 'hedy_lamarr', 'nelson_mandela', 'yuri_gagarin', 'wangari_maathai',
]

const GP: Record<string, Card> = Object.fromEntries(ALL_GP_CARDS.map(c => [c.id, c]))

describe('contemporaries', () => {
  it('adds all 64 new Great People', () => {
    for (const id of NEW) expect(GP[id], id).toBeDefined()
    expect(ALL_GP_CARDS.length).toBe(144)
  })

  it('every Great Person shares their career with at least three others', () => {
    const career = (c: Card) => [careerStartYear(c), deathYear(c)] as const
    const lonely: string[] = []
    for (const c of ALL_GP_CARDS) {
      const [a, b] = career(c)
      const n = ALL_GP_CARDS.filter(o => o !== c && career(o)[0] <= b && a <= career(o)[1]).length
      if (n < 3) lonely.push(`${c.figureName} (${n})`)
    }
    expect(lonely).toEqual([])
  })

  it('every new Great Person has died, and a career before their death', () => {
    for (const id of NEW) {
      expect(GP[id].died, id).toBeTypeOf('number')
      expect(careerStartYear(GP[id]), id).toBeLessThanOrEqual(GP[id].died!)
    }
  })
})

// ── A tiny board: tokens are card ids (Great People) or follower names ──────

let serial = 0
function onboard(token: string, playerId: string, extra: Partial<OnboardCard> = {}): OnboardCard {
  const gp = !!GP[token]
  const cardId = gp ? token : `follower-${token}-${serial}`
  return { instanceId: `${token}-${serial++}`, cardId, type: gp ? 'gp' : 'follower', playerId, isPublic: true, justDeployed: false, achievementTicks: 0, ...extra }
}
function city(i: number, mine: string[], theirs: string[] = []): LocationState {
  return { id: `loc${i}`, name: `City ${i}`, era: 'Ancient', cards: [...mine.map(t => onboard(t, 'p0')), ...theirs.map(t => onboard(t, 'p1'))], activeEvent: null, eventRoundsLeft: 0 }
}
function followerMap(locs: LocationState[]): Record<string, FollowerCard> {
  const m: Record<string, FollowerCard> = {}
  for (const x of locs.flatMap(l => l.cards)) if (x.type === 'follower') m[x.cardId] = followerFromId(x.cardId)!
  return m
}

// ── Traits ─────────────────────────────────────────────────────────────────

/** Bonus for `id` in city 0 with these allies and rivals; `cities` more cities hold one of your cards. */
function traitBonus(id: string, stat: StatKey, mine: string[] = [], theirs: string[] = [], cities = 0): number {
  const locs = [city(0, [id, ...mine], theirs), ...Array.from({ length: cities }, (_, i) => city(i + 1, ['Spy']))]
  return traitBonusForGP(GP[id], stat, locs[0].cards, 'p0', locs, GP, followerMap(locs))
}

const TRAITS: [string, StatKey, number, string[]?, string[]?, number?][] = [
  ['djoser', 'reputation', 3, ['Architect']],
  ['sneferu', 'technique', 2, ['Merchant', 'Merchant']],
  ['puabi', 'wealth', 3, ['meskalamdug']],
  ['meskalamdug', 'strength', 3, ['Sovereign']],
  ['ku_baba', 'politics', 3, ['Merchant', 'Doctor', 'Spy']],
  ['eannatum', 'strength', 3, ['Soldier', 'Warrior']],
  ['ur_nanshe', 'technique', 2],
  ['emperor_yao', 'reputation', 3, ['Astronomer']],
  ['harkhuf', 'wealth', 3, ['Merchant']],
  ['enheduanna', 'belief', 2, ['Writer']],
  ['mursili_i', 'strength', 2, [], ['tushratta']],
  ['yi_yin', 'politics', 3, ['Sovereign']],
  ['nedjeh', 'strength', 3, [], ['djoser']],
  ['queen_tiye', 'politics', 3, ['Sovereign']],
  ['tushratta', 'reputation', 2, [], ['djoser']],
  ['suppiluliuma_i', 'strength', 4, [], ['djoser', 'tushratta']],
  ['gyges', 'wealth', 3],
  ['guan_zhong', 'wealth', 3, ['Banker']],
  ['cyrus_the_great', 'reputation', 3, ['confucius'], ['tomyris']],
  ['confucius', 'belief', 2, ['Writer', 'Educator']],
  ['tomyris', 'strength', 3, [], ['cyrus_the_great']],
  ['chandragupta_maurya', 'politics', 3, ['chanakya']],
  ['epicurus', 'belief', 3],
  ['julius_caesar', 'reputation', 2, ['Soldier', 'General']],
  ['cleopatra_vii', 'politics', 3, [], ['julius_caesar']],
  ['vercingetorix', 'strength', 3, [], ['julius_caesar']],
  ['shapur_i', 'reputation', 2, [], ['cyrus_the_great']],
  ['zenobia', 'politics', 2],
  ['plotinus', 'belief', 3],
  ['theodoric_the_great', 'politics', 2, ['Monastic', 'Monastic'], ['Spy']],
  ['zu_chongzhi', 'technique', 3, ['Astronomer']],
  ['saint_genevieve', 'belief', 3, ['Monastic', 'Doctor']],
  ['empress_theodora', 'politics', 3, [], ['Soldier', 'Soldier']],
  ['queen_seondeok', 'intelligence', 3, ['Astronomer']],
  ['xuanzang', 'belief', 2, [], [], 2],
  ['brahmagupta', 'intelligence', 3],
  ['charlemagne', 'strength', 2, ['Soldier', 'Warrior']],
  ['jabir_ibn_hayyan', 'technique', 4, ['Scientist', 'Doctor']],
  ['murasaki_shikibu', 'culture', 3, ['Noble']],
  ['avicenna', 'intelligence', 2, ['Doctor', 'Doctor']],
  ['leif_erikson', 'technique', 3],
  ['hildegard_of_bingen', 'culture', 1, ['Musician']],
  ['jayavarman_vii', 'technique', 3, ['Doctor', 'Doctor']],
  ['averroes', 'intelligence', 3, [], ['Priest']],
  ['fibonacci', 'wealth', 3, ['Merchant']],
  ['sundiata_keita', 'reputation', 3, ['Musician']],
  ['tomoe_gozen', 'technique', 3, [], ['Soldier', 'Soldier']],
  ['ibn_khaldun', 'politics', 2, ['Writer', 'Writer']],
  ['timur', 'strength', 3, [], ['Soldier', 'Soldier']],
  ['hafez', 'culture', 3, ['Gourmet']],
  ['cosimo_de_medici', 'wealth', 2, [], [], 1],
  ['zara_yaqob', 'belief', 3, ['Priest']],
  ['peter_the_great', 'technique', 3, ['Engineer']],
  ['osei_tutu', 'reputation', 3, ['General', 'General']],
  ['harriet_tubman', 'belief', 3, [], ['Soldier', 'Soldier']],
  ['nikola_tesla', 'technique', 3],
  ['jose_rizal', 'politics', 3, [], ['djoser']],
  ['marie_curie', 'intelligence', 2, ['Scientist']],
  ['alberto_santos_dumont', 'technique', 3],
  ['frida_kahlo', 'culture', 3],
  ['hedy_lamarr', 'culture', 2, ['Musician']],
  ['nelson_mandela', 'reputation', 3, [], ['Soldier', 'Soldier']],
  ['yuri_gagarin', 'reputation', 3],
  ['wangari_maathai', 'belief', 3, ['Writer', 'Writer', 'Writer']],
]

describe('new traits', () => {
  it('cover every new Great Person', () => {
    expect(TRAITS.map(t => t[0]).sort()).toEqual([...NEW].sort())
  })

  it.each(TRAITS)('%s: +%s %s when the condition holds', (id, stat, amount, mine = [], theirs = [], cities = 0) => {
    expect(traitBonus(id, stat, mine, theirs, cities)).toBe(amount)
  })

  it('stay off when the condition does not hold', () => {
    expect(traitBonus('djoser', 'reputation')).toBe(0)
    expect(traitBonus('ur_nanshe', 'technique', ['puabi'])).toBe(0)
    expect(traitBonus('gyges', 'wealth', ['Spy'])).toBe(0)
    expect(traitBonus('epicurus', 'belief', [], ['Spy'])).toBe(0)
    expect(traitBonus('nikola_tesla', 'technique', ['Merchant'])).toBe(0)
    expect(traitBonus('alberto_santos_dumont', 'technique', [], ['Spy'])).toBe(0)
    expect(traitBonus('tomoe_gozen', 'technique', ['Soldier'], ['Soldier', 'Soldier'])).toBe(0)
  })

  it('cap their counting bonuses', () => {
    expect(traitBonus('sneferu', 'technique', ['Spy', 'Spy', 'Spy', 'Spy', 'Spy', 'Spy'])).toBe(4)
    expect(traitBonus('jabir_ibn_hayyan', 'technique', ['Doctor', 'Doctor', 'Doctor'])).toBe(4)
    expect(traitBonus('cosimo_de_medici', 'wealth', [], [], 3)).toBe(4)
  })
})

// ── Achievements: each rule fed the events the reducer records ─────────────

interface Scene {
  locs: LocationState[]
  /** The Great Person whose achievement is checked: the first card of city 0. */
  me: OnboardCard
  state: GameState
  look: Lookups
  memo: Record<string, unknown>
}
function scene(id: string, mine: string[] = [], theirs: string[] = [], more: LocationState[] = []): Scene {
  const locs = [city(0, [id, ...mine], theirs), ...more]
  const state = {
    locations: locs, year: 1000, round: 1, currentPlayerIdx: 0, turnActions: freshTurnActions(), roundActed: [],
    players: ['p0', 'p1'].map(pid => ({ id: pid, name: pid, legacies: [], achievementMemo: {} })),
  } as unknown as GameState
  return { locs, me: locs[0].cards[0], state, look: { gp: GP, follower: followerMap(locs) }, memo: {} }
}
function fire(s: Scene, ...evs: AchievementEvent[]): boolean {
  const rule = ACHIEVEMENTS[s.me.cardId]
  const owner = s.state.players[0]
  let done = false
  for (const ev of evs) done = rule(ev, { state: s.state, owner, me: s.me, loc: s.locs[0], look: s.look, memo: s.memo })
  return done
}
const card = (s: Scene, token: string, pid = 'p1') => s.locs.flatMap(l => l.cards).find(x => x.playerId === pid && x.instanceId.startsWith(`${token}-`))!
const turn = (actions: Partial<TurnActions> = {}): AchievementEvent => ({ kind: 'turn', playerId: 'p0', actions: { ...freshTurnActions(), ...actions } })
const round: AchievementEvent = { kind: 'round' }
function fight(s: Scene, opts: { stat: StatKey; mine?: OnboardCard; theirs: OnboardCard; attack?: boolean; won?: boolean; kill?: boolean; locId?: string }): AchievementEvent {
  const mine = opts.mine ?? s.me, attack = opts.attack ?? true, won = opts.won ?? true
  return {
    kind: 'fight', locId: opts.locId ?? 'loc0', stat: opts.stat, kill: opts.kill ?? false,
    attacker: attack ? mine : opts.theirs, defender: attack ? opts.theirs : mine,
    result: won === attack ? 'attacker' : 'defender', before: s.locs[0].cards,
  }
}
function survival(stat: StatKey | null, hazard = false, iSurvive = true): AchievementEvent {
  return { kind: 'survival', locId: 'loc0', eventName: 'Test', hazard, stat, threshold: 10, results: [{ playerId: 'p0', total: 12, survived: iSurvive }, { playerId: 'p1', total: 3, survived: false }], before: [] }
}
const competition = (stat: StatKey, winnerId = 'p0'): AchievementEvent => ({ kind: 'competition', winnerId, stat })
const death = (cardId: string, playerId = 'p1'): AchievementEvent => ({ kind: 'death', locId: 'loc0', playerId, cardId })

const ACHIEVES: [string, () => boolean][] = [
  ['djoser', () => fire(scene('djoser', ['Architect', 'Priest']), turn())],
  // A streak counts the years a card stayed put, so three in a row take four year-ends.
  ['sneferu', () => { const s = scene('sneferu', ['Spy', 'Spy']); return fire(s, round, round, round, round) }],
  ['puabi', () => fire(scene('puabi', ['meskalamdug']), death('meskalamdug', 'p0'))],
  ['meskalamdug', () => { const s = scene('meskalamdug', [], ['Soldier']); const f = fight(s, { stat: 'strength', theirs: card(s, 'Soldier') }); return fire(s, f, f) }],
  ['ku_baba', () => fire(scene('ku_baba', ['Spy', 'Spy', 'Spy']), turn())],
  ['eannatum', () => { const s = scene('eannatum', ['Soldier'], ['Spy']); return fire(s, fight(s, { stat: 'strength', theirs: card(s, 'Spy') })) }],
  ['ur_nanshe', () => { const s = scene('ur_nanshe', [], ['Spy']); return fire(s, round, round) }],
  ['emperor_yao', () => fire(scene('emperor_yao'), competition('belief'))],
  ['harkhuf', () => fire(scene('harkhuf', ['Sovereign', 'Merchant']), turn())],
  ['enheduanna', () => fire(scene('enheduanna'), survival('belief'))],
  ['mursili_i', () => { const s = scene('mursili_i', [], ['tushratta']); return fire(s, fight(s, { stat: 'strength', theirs: card(s, 'tushratta'), kill: true })) }],
  ['yi_yin', () => fire(scene('yi_yin', ['Sovereign']), round, round, round)],
  ['nedjeh', () => fire(scene('nedjeh', ['Merchant', 'Merchant', 'Merchant']), turn())],
  ['queen_tiye', () => fire(scene('queen_tiye', [], [], [city(1, ['Statesman']), city(2, ['Spy'])]), turn())],
  ['tushratta', () => fire(scene('tushratta'), competition('reputation'))],
  ['suppiluliuma_i', () => {
    const s = scene('suppiluliuma_i', [], ['Spy'])
    // The card moves on between fights: each one is in the city it stands in.
    return ['loc0', 'loc1', 'loc2'].map(locId => { s.locs[0].id = locId; return fire(s, fight(s, { stat: 'strength', theirs: card(s, 'Spy'), locId })) }).pop()!
  }],
  ['gyges', () => { const s = scene('gyges', [], ['Spy']); s.me.isPublic = false; return fire(s, fight(s, { stat: 'wealth', theirs: card(s, 'Spy') })) }],
  ['guan_zhong', () => fire(scene('guan_zhong', ['Sovereign'], ['Spy']), turn())],
  // Tomyris is a General now, so a Sovereign stands in as the rival.
  ['cyrus_the_great', () => { const s = scene('cyrus_the_great', [], ['chandragupta_maurya']); return fire(s, fight(s, { stat: 'reputation', theirs: card(s, 'chandragupta_maurya') })) }],
  ['confucius', () => fire(scene('confucius', ['Educator', 'Philosopher', 'Writer']), turn())],
  ['tomyris', () => { const s = scene('tomyris', [], ['cyrus_the_great']); return fire(s, fight(s, { stat: 'strength', theirs: card(s, 'cyrus_the_great'), attack: false })) }],
  ['chandragupta_maurya', () => fire(scene('chandragupta_maurya', ['Statesman'], [], [city(1, ['Spy']), city(2, ['Spy'])]), turn())],
  ['epicurus', () => fire(scene('epicurus'), round, round, round, round)],
  ['julius_caesar', () => {
    const s = scene('julius_caesar', [], ['vercingetorix'])
    s.state.turnActions = { ...freshTurnActions(), movedCards: [s.me.instanceId] }
    return fire(s, fight(s, { stat: 'strength', theirs: card(s, 'vercingetorix') }))
  }],
  ['cleopatra_vii', () => fire(scene('cleopatra_vii', [], ['julius_caesar']), turn())],
  ['vercingetorix', () => { const s = scene('vercingetorix', [], ['julius_caesar']); return fire(s, fight(s, { stat: 'strength', theirs: card(s, 'julius_caesar'), attack: false })) }],
  ['shapur_i', () => { const s = scene('shapur_i', [], ['zenobia']); return fire(s, fight(s, { stat: 'strength', theirs: card(s, 'zenobia') })) }],
  ['zenobia', () => fire(scene('zenobia', ['Spy'], ['Spy'], [city(1, ['Spy'])]), turn())],
  ['plotinus', () => fire(scene('plotinus'), survival('belief'), survival('culture'))],
  ['theodoric_the_great', () => fire(scene('theodoric_the_great', ['zu_chongzhi']), turn())],
  ['zu_chongzhi', () => fire(scene('zu_chongzhi', ['Astronomer']), round, round)],
  ['saint_genevieve', () => fire(scene('saint_genevieve', ['Monastic']), survival('belief'))],
  ['empress_theodora', () => { const s = scene('empress_theodora', [], ['Soldier', 'Soldier']); return fire(s, fight(s, { stat: 'politics', theirs: card(s, 'Soldier'), attack: false })) }],
  ['queen_seondeok', () => fire(scene('queen_seondeok'), competition('intelligence'))],
  ['xuanzang', () => {
    const s = scene('xuanzang')
    return [0, 1, 2, 3].map(i => { s.locs[0].name = `City ${i}`; return fire(s, turn()) }).pop()!
  }],
  ['brahmagupta', () => fire(scene('brahmagupta', ['Astronomer', 'Mathematician']), turn())],
  ['charlemagne', () => fire(scene('charlemagne', ['Monastic', 'Warrior']), turn())],
  ['jabir_ibn_hayyan', () => fire(scene('jabir_ibn_hayyan'), survival('technique'))],
  ['murasaki_shikibu', () => fire(scene('murasaki_shikibu', ['Noble']), round, round, round)],
  ['avicenna', () => fire(scene('avicenna', ['Sovereign', 'Doctor']), turn())],
  ['leif_erikson', () => { const s = scene('leif_erikson'); return fire(s, turn({ movedCards: [s.me.instanceId] })) }],
  ['hildegard_of_bingen', () => fire(scene('hildegard_of_bingen', ['Musician', 'Naturalist']), turn())],
  ['jayavarman_vii', () => fire(scene('jayavarman_vii', ['Doctor'], [], [city(1, ['Architect']), city(2, ['Engineer'])]), turn())],
  ['averroes', () => { const s = scene('averroes', [], ['Priest']); return fire(s, fight(s, { stat: 'belief', theirs: card(s, 'Priest'), attack: false })) }],
  ['fibonacci', () => {
    const s = scene('fibonacci')
    return [1, 2, 3].map(n => { s.locs[0].cards.push(onboard('Merchant', 'p0')); s.look.follower = followerMap(s.locs); void n; return fire(s, turn()) }).pop()!
  }],
  ['sundiata_keita', () => { const s = scene('sundiata_keita', [], ['Sovereign']); return fire(s, fight(s, { stat: 'strength', theirs: card(s, 'Sovereign') })) }],
  ['tomoe_gozen', () => { const s = scene('tomoe_gozen', [], ['General']); return fire(s, fight(s, { stat: 'technique', theirs: card(s, 'General') })) }],
  ['ibn_khaldun', () => fire(scene('ibn_khaldun'), death('timur'), death('hafez'))],
  ['timur', () => { const s = scene('timur', [], ['Spy']); const f = fight(s, { stat: 'strength', theirs: card(s, 'Spy') }); return fire(s, f, f, f) }],
  ['hafez', () => fire(scene('hafez'), competition('culture'))],
  ['cosimo_de_medici', () => fire(scene('cosimo_de_medici', ['Artist', 'Architect']), turn())],
  ['zara_yaqob', () => fire(scene('zara_yaqob', ['Priest', 'Prophet']), turn())],
  ['peter_the_great', () => fire(scene('peter_the_great', ['Engineer']), round, round)],
  ['osei_tutu', () => fire(scene('osei_tutu', ['Spy'], [], [city(1, ['Spy', 'Spy']), city(2, ['Spy', 'Spy'])]), turn())],
  ['harriet_tubman', () => {
    const s = scene('harriet_tubman', ['Spy'])
    const t = turn({ movedCards: [s.me.instanceId, card(s, 'Spy', 'p0').instanceId] })
    return fire(s, t, t, t)
  }],
  ['nikola_tesla', () => fire(scene('nikola_tesla'), competition('technique'))],
  ['jose_rizal', () => fire(scene('jose_rizal', ['Spy', 'Spy', 'Spy'], ['Spy']), turn())],
  ['marie_curie', () => fire(scene('marie_curie'), competition('intelligence'), competition('technique'))],
  ['alberto_santos_dumont', () => { const s = scene('alberto_santos_dumont'); const t = turn({ movedCards: [s.me.instanceId] }); return fire(s, t, t, t) }],
  ['frida_kahlo', () => fire(scene('frida_kahlo', [], ['marie_curie']), turn())],
  ['hedy_lamarr', () => { const s = scene('hedy_lamarr', [], ['Engineer']); s.me.isPublic = false; return fire(s, fight(s, { stat: 'technique', theirs: card(s, 'Engineer') })) }],
  ['nelson_mandela', () => fire(scene('nelson_mandela', ['wangari_maathai'], ['peter_the_great']), turn())],
  ['yuri_gagarin', () => fire(scene('yuri_gagarin'), survival(null, true))],
  ['wangari_maathai', () => {
    const s = scene('wangari_maathai')
    return [1990, 1991, 1992].map(y => { s.state.year = y; return fire(s, { kind: 'follower', locId: 'loc0', playerId: 'p0' }) }).pop()!
  }],
]

describe('new achievements', () => {
  it('cover every new Great Person, each written on the card', () => {
    expect(ACHIEVES.map(a => a[0]).sort()).toEqual([...NEW].sort())
    for (const id of NEW) expect(GP[id].achievement, id).toMatch(/ — .{10,}/)
  })

  it.each(ACHIEVES)('%s can be achieved', (_id, run) => {
    expect(run()).toBe(true)
  })

  it('are not met by doing nothing', () => {
    for (const id of NEW) {
      const s = scene(id)
      expect(fire(s, turn()), id).toBe(false)
    }
  })

  it('a streak breaks when the card moves (Sneferu)', () => {
    const s = scene('sneferu', ['Spy', 'Spy'])
    fire(s, round, round)
    s.me.instanceId = 'moved'
    expect(fire(s, round)).toBe(false)
  })

  it('a fight in the city spoils Epicurus\'s calm', () => {
    const s = scene('epicurus', [], ['Spy'])
    expect(fire(s, round, round, fight(s, { stat: 'belief', theirs: card(s, 'Spy') }), round)).toBe(false)
  })

  it('Fibonacci needs the count to grow by one each turn', () => {
    const s = scene('fibonacci', ['Merchant', 'Merchant', 'Merchant'])
    expect(fire(s, turn(), turn(), turn())).toBe(false)
  })
})
