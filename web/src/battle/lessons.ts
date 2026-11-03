// The fight lessons: the last challenge of every Epic story is a small,
// scripted battle that teaches one more piece of the card game.  Stories are
// played in era order, so the tiers below form a curriculum: a single
// location with two Great People and one follower first, the full board last.
//
// A story names its tier (`configId`) and its cast (`params`); the tier
// decides the board shape, the goal and the coach.  See
// scripts/add-fight-lessons.mjs for how the cast is chosen.

import type { GameState, StatKey } from '@/types'
import {
  STAT_LABELS, EVENT_NAMES, FOLLOWER_TMPL_BY_NAME, ACHIEVEMENT_SPECS,
  getGPCard, findLocation, buildLookups, computeLocationTotal,
  type FightScript,
} from './engine'

export const LESSON_TIERS = ['duel', 'reinforce', 'event', 'survival', 'hidden', 'competition', 'conquest'] as const
export type LessonTier = typeof LESSON_TIERS[number]
export const isLessonTier = (id: string): id is LessonTier => (LESSON_TIERS as readonly string[]).includes(id)

export interface LessonParams {
  /** The story's Great Person; always the first card in the player's hand. */
  hero: string
  /** The stat the lesson's events use, normally the hero's strongest. */
  stat: StatKey
  /** Location image keys, first one is the story's own city. */
  locations: string[]
  /** Other Great People dealt to the player. */
  allies: string[]
  /** The rival's Great People. */
  opponents: string[]
  /** Follower template names for the player, matching `stat`. */
  followers: string[]
  cpuFollowers: string[]
}

export type LessonGoal =
  | { kind: 'win_attacks'; count: number }
  | { kind: 'hold'; location: number; untilRound: number }
  | { kind: 'competition' }
  | { kind: 'eliminate' }

export interface Lesson {
  tier: LessonTier
  /** 1-based position in the curriculum. */
  number: number
  title: string
  /** What this tier adds to the player's understanding; shown after a win. */
  teaches: string
  goal: LessonGoal
  goalText: string
  maxRounds: number
  params: LessonParams
  script: FightScript
}

/** What the player has done so far; FightGame counts these from the actions it dispatches. */
export interface LessonProgress { attacksWon: number; competitionsWon: number }

// Used when a story gives no cast (and by the registry test).
export const DEFAULT_PARAMS: LessonParams = {
  hero: 'imhotep',
  stat: 'intelligence',
  locations: ['ancient_memphis', 'ancient_uruk', 'ancient_stonehenge'],
  allies: ['hesy_ra', 'peseshet'],
  opponents: ['nakht', 'ashurbanipal'],
  followers: ['Scientist', 'Mathematician', 'Naturalist', 'Astronomer'],
  cpuFollowers: ['Astronomer', 'Naturalist'],
}

interface TierDef {
  title: string
  teaches: string
  maxRounds: number
  goal: (p: LessonParams) => LessonGoal
  goalText: (p: LessonParams, names: Names) => string
  script: (p: LessonParams) => FightScript
}

interface Names { hero: string; loc: string[]; opp: string[]; stat: string; event: string }

const localEvent = (stat: StatKey) => ({ stat, kind: 'local_event' as const })
const onBoard = (side: 'player' | 'cpu', gp: string, location: number, isPublic = true) => ({ side, gp, location, isPublic })

const TIERS: Record<LessonTier, TierDef> = {
  duel: {
    title: 'First Duel',
    teaches: 'A Local Event compares one stat. Every card you have at the location adds to your total: a Great Person brings the stat itself, a follower adds +2, or +3 beside a Great Person who shares their identity. The higher total wins the attack.',
    maxRounds: 3,
    goal: () => ({ kind: 'win_attacks', count: 1 }),
    goalText: (_, n) => `Deploy ${n.hero} to ${n.loc[0]}, add your follower, and win one attack against ${n.opp[0]} in the ${n.event}.`,
    script: p => ({
      locations: p.locations.slice(0, 1),
      player: { gp: [p.hero, p.allies[0]], followers: p.followers.slice(0, 1) },
      cpu: {},
      board: [onBoard('cpu', p.opponents[0], 0)],
      events: [{ location: 0, ...localEvent(p.stat) }],
    }),
  },
  reinforce: {
    title: 'Strength in Numbers',
    teaches: 'An attack pits whole sides against each other, not single cards. Stack Great People and followers at one location to outweigh a rival who got there first. A beaten card goes back to its owner\'s hand unless Kill mode is on.',
    maxRounds: 5,
    goal: () => ({ kind: 'win_attacks', count: 2 }),
    goalText: (_, n) => `${n.opp[0]} and ${n.opp[1]} hold ${n.loc[0]} together. Build a stronger side with ${n.hero}, an ally and two followers, then win two attacks.`,
    script: p => ({
      locations: p.locations.slice(0, 1),
      player: { gp: [p.hero, p.allies[0]], followers: p.followers.slice(0, 2) },
      cpu: {},
      board: [
        onBoard('cpu', p.opponents[0], 0), onBoard('cpu', p.opponents[1], 0),
        { side: 'cpu', follower: p.cpuFollowers[0], location: 0 },
      ],
      events: [{ location: 0, ...localEvent(p.stat) }],
    }),
  },
  event: {
    title: 'Starting an Event',
    teaches: 'Nothing happens at a quiet location. You start an event by playing an event card where you already have a Great Person, and only one who arrived on an earlier turn can do it. Once the event runs, attacks are open.',
    maxRounds: 5,
    goal: () => ({ kind: 'win_attacks', count: 1 }),
    goalText: (_, n) => `${n.opp[0]} waits at ${n.loc[1]} with no event running. Deploy ${n.hero} there, start the ${n.event} on your next turn, and win an attack.`,
    script: p => ({
      locations: p.locations.slice(0, 2),
      player: { gp: [p.hero, p.allies[0]], followers: p.followers.slice(0, 1), events: [localEvent(p.stat)] },
      cpu: {},
      board: [onBoard('cpu', p.opponents[0], 1)],
    }),
  },
  survival: {
    title: 'Survival',
    teaches: 'A Local Survival event is a test, not a fight. At the end of every round each player\'s total at that location is checked, and any side under 5 loses every card there to the discard pile. Reinforce or retrieve before the round ends.',
    maxRounds: 5,
    goal: () => ({ kind: 'hold', location: 0, untilRound: 3 }),
    goalText: (p, n) => `${n.loc[0]} is under ${EVENT_NAMES[p.stat][1]}. Keep a Great Person there with at least 5 ${n.stat} through two round endings, and watch what happens to ${n.opp[0]}.`,
    script: p => ({
      locations: p.locations.slice(0, 2),
      player: { gp: [p.hero, p.allies[0]], followers: p.followers.slice(0, 2) },
      cpu: { gp: [p.opponents[1]] },
      board: [onBoard('cpu', p.opponents[0], 0)],
      events: [{ location: 0, stat: p.stat, kind: 'local_survival' }],
    }),
  },
  hidden: {
    title: 'Face Down',
    teaches: 'A card can stand on the board face down. Rivals cannot see who it is until an attack reveals every card at the location. Your own cards start face down too: Toggle Public when being seen helps you.',
    maxRounds: 7,
    goal: () => ({ kind: 'win_attacks', count: 2 }),
    goalText: (_, n) => `The rival has two face-down cards at ${n.loc[0]} and ${n.loc[1]}. Win two attacks; the ${n.event} already runs at ${n.loc[0]}, and you hold a card to start one at ${n.loc[1]}.`,
    script: p => ({
      locations: p.locations.slice(0, 2),
      player: { gp: [p.hero, p.allies[0]], followers: p.followers.slice(0, 2), events: [localEvent(p.stat)] },
      cpu: { followers: p.cpuFollowers.slice(0, 1) },
      board: [onBoard('cpu', p.opponents[0], 0, false), onBoard('cpu', p.opponents[1], 1, false)],
      events: [{ location: 0, ...localEvent(p.stat) }],
    }),
  },
  competition: {
    title: 'Global Competition',
    teaches: 'A Global Competition counts the whole board at once: every public Great Person adds their stat, followers and face-down cards count for nothing. It lasts one round, and the strongest player draws a reward.',
    maxRounds: 7,
    goal: () => ({ kind: 'competition' }),
    goalText: (p, n) => `Deploy your Great People, turn them public, then start the ${EVENT_NAMES[p.stat][2]} and win it with the highest public ${n.stat} on the board.`,
    script: p => ({
      locations: p.locations.slice(0, 3),
      player: { gp: [p.hero, p.allies[0], p.allies[1]], followers: p.followers.slice(0, 2), events: [{ stat: p.stat, kind: 'global_competition' }] },
      cpu: { followers: p.cpuFollowers.slice(0, 2) },
      board: [onBoard('cpu', p.opponents[0], 1), onBoard('cpu', p.opponents[1], 2)],
    }),
  },
  conquest: {
    title: 'Conquest',
    teaches: 'With Kill mode on, a beaten card is discarded instead of returning to its owner\'s hand. A player with no Great People left, in hand or on the board, is out, and the last player standing wins. Winning in a Great Person\'s own stat also counts towards their achievement.',
    maxRounds: 10,
    goal: () => ({ kind: 'eliminate' }),
    goalText: (_, n) => `The rival holds ${n.opp[0]} and ${n.opp[1]} in hand and will deploy them. Hunt them down: move to their location, start the ${n.event}, and attack with Kill mode on until none remain.`,
    script: p => ({
      locations: p.locations.slice(0, 3),
      player: { gp: [p.hero, p.allies[0], p.allies[1]], followers: p.followers.slice(0, 4), events: [localEvent(p.stat), localEvent(p.stat)] },
      cpu: { gp: p.opponents.slice(0, 2), followers: p.cpuFollowers.slice(0, 2) },
    }),
  },
}

function cardName(id: string) { return getGPCard(id)?.figureName ?? id }
function locName(key: string) { return findLocation(key)?.name ?? key }

/** Merge a story's params over the defaults, dropping anything that names a card or place that does not exist. */
export function resolveParams(raw?: Record<string, unknown>): LessonParams {
  const p = { ...DEFAULT_PARAMS, ...(raw as Partial<LessonParams> | undefined) }
  const ids = (xs: unknown, fallback: string[]) => {
    const good = Array.isArray(xs) ? xs.filter((x): x is string => typeof x === 'string' && !!getGPCard(x)) : []
    return good.length ? good : fallback
  }
  const names = (xs: unknown, fallback: string[]) => {
    const good = Array.isArray(xs) ? xs.filter((x): x is string => typeof x === 'string' && x in FOLLOWER_TMPL_BY_NAME) : []
    return good.length ? good : fallback
  }
  const locs = Array.isArray(p.locations) ? p.locations.filter((x): x is string => typeof x === 'string' && !!findLocation(x)) : []
  return {
    hero: getGPCard(p.hero) ? p.hero : DEFAULT_PARAMS.hero,
    stat: p.stat in STAT_LABELS ? p.stat : DEFAULT_PARAMS.stat,
    locations: [...locs, ...DEFAULT_PARAMS.locations.filter(l => !locs.includes(l))].slice(0, 3),
    allies: [...ids(p.allies, DEFAULT_PARAMS.allies), ...DEFAULT_PARAMS.allies].slice(0, 2),
    opponents: [...ids(p.opponents, DEFAULT_PARAMS.opponents), ...DEFAULT_PARAMS.opponents].slice(0, 2),
    followers: [...names(p.followers, DEFAULT_PARAMS.followers), ...DEFAULT_PARAMS.followers].slice(0, 4),
    cpuFollowers: [...names(p.cpuFollowers, DEFAULT_PARAMS.cpuFollowers), ...DEFAULT_PARAMS.cpuFollowers].slice(0, 2),
  }
}

export function buildLesson(configId: string, raw?: Record<string, unknown>): Lesson {
  const tier: LessonTier = isLessonTier(configId) ? configId : 'duel'
  const def = TIERS[tier]
  const params = resolveParams(raw)
  const names: Names = {
    hero: cardName(params.hero),
    loc: params.locations.map(locName),
    opp: params.opponents.map(cardName),
    stat: STAT_LABELS[params.stat],
    event: EVENT_NAMES[params.stat][0],
  }
  const script = def.script(params)
  script.playerName = 'You'
  script.cpuName = 'Rival'
  return {
    tier,
    number: LESSON_TIERS.indexOf(tier) + 1,
    title: def.title,
    teaches: def.teaches,
    goal: def.goal(params),
    goalText: def.goalText(params, names),
    maxRounds: def.maxRounds,
    params,
    script,
  }
}

// ── Progress ─────────────────────────────────────────────────────────────────

export interface LessonStatus {
  done: boolean
  /** Why the lesson is lost, when it is. */
  failed?: string
  /** Short progress line for the header. */
  text: string
}

const ME = 'player-0'
const CPU = 'player-1'

function gpOnBoard(state: GameState, playerId: string, location?: number) {
  const locs = location == null ? state.locations : [state.locations[location]].filter(Boolean)
  return locs.flatMap(l => l.cards).filter(c => c.playerId === playerId && c.type === 'gp')
}

export function lessonStatus(state: GameState, progress: LessonProgress, lesson: Lesson): LessonStatus {
  const g = lesson.goal
  let done = false
  let text = ''
  switch (g.kind) {
    case 'win_attacks':
      done = progress.attacksWon >= g.count
      text = `Attacks won ${Math.min(progress.attacksWon, g.count)} / ${g.count}`
      break
    case 'hold': {
      const held = gpOnBoard(state, ME, g.location).length > 0
      done = state.round >= g.untilRound && held
      text = `Round endings survived ${Math.min(Math.max(state.round - 1, 0), g.untilRound - 1)} / ${g.untilRound - 1}`
      break
    }
    case 'competition':
      done = progress.competitionsWon > 0
      text = done ? 'Competition won' : state.globalCompetitionActive ? 'Competition running' : 'Competition not started'
      break
    case 'eliminate': {
      const left = state.players[1].gpHand.length + gpOnBoard(state, CPU).length
      done = left === 0 || state.winner === ME
      text = `Rival Great People left ${left}`
      break
    }
  }
  if (done) return { done, text }

  const myGP = state.players[0].gpHand.length + gpOnBoard(state, ME).length
  if (state.winner === CPU) return { done, text, failed: 'the rival won the game' }
  if (myGP === 0) return { done, text, failed: 'you have no Great People left' }
  if (g.kind === 'hold' && state.round > 1 && gpOnBoard(state, ME, g.location).length === 0 && state.currentPlayerIdx === 0 && state.players[0].gpHand.length === 0)
    return { done, text, failed: `nobody is holding ${state.locations[g.location]?.name}` }
  if (state.round > lesson.maxRounds) return { done, text, failed: `round ${lesson.maxRounds} ended without reaching the goal` }
  return { done, text }
}

// ── Coach ────────────────────────────────────────────────────────────────────

/** One sentence telling the player what to do next, from the board alone. */
export function coachHint(state: GameState, lesson: Lesson): string {
  if (state.phase === 'ended') return ''
  const me = state.players[0]
  if (state.currentPlayerIdx !== 0) return `${state.players[1].name} is taking their turn…`

  const { gpMap, followerMap } = buildLookups(state)
  const stat = lesson.params.stat
  const statLabel = STAT_LABELS[stat]
  const ta = state.turnActions
  const name = (id: string) => gpMap[id]?.figureName ?? 'your Great Person'
  const mine = (loc: typeof state.locations[number]) => loc.cards.filter(c => c.playerId === ME)
  const theirs = (loc: typeof state.locations[number]) => loc.cards.filter(c => c.playerId === CPU)
  const settled = (loc: typeof state.locations[number]) => mine(loc).some(c => c.type === 'gp' && !c.justDeployed)

  // Where the fight is: a location with rival cards, preferring one with a running local event.
  const contested = [...state.locations].sort((a, b) =>
    (b.activeEvent?.type === 'local_event' ? 1 : 0) - (a.activeEvent?.type === 'local_event' ? 1 : 0)
    || theirs(b).length - theirs(a).length)[0]
  const target = lesson.goal.kind === 'hold' ? state.locations[lesson.goal.location] : contested

  // 1. Deploy (once per turn).
  if (!ta.deployedGP && me.gpHand.length > 0) {
    const where = lesson.tier === 'competition' ? state.locations.find(l => mine(l).length === 0) ?? state.locations[0] : target
    return `Deploy: tap ${name(me.gpHand[0])} in your hand, then tap ${where.name}.`
  }

  // 2. Attack when a local event runs where both sides stand.
  for (const loc of state.locations) {
    if (loc.activeEvent?.type !== 'local_event') continue
    const myGp = mine(loc).find(c => c.type === 'gp')
    const rival = theirs(loc)[0]
    if (!myGp || !rival) continue
    const myTotal = computeLocationTotal(loc.cards, ME, stat, gpMap, followerMap, state.locations, loc.name, loc.era)
    const theirTotal = computeLocationTotal(loc.cards, CPU, stat, gpMap, followerMap, state.locations, loc.name, loc.era)
    // Teach the follower before the attack while one of the lesson's stat is still in hand.
    const spare = !ta.addedFollower ? me.followerHand.find(f => f.stat === stat) : undefined
    if (spare) {
      const matched = mine(loc).some(c => c.type === 'gp' && gpMap[c.cardId]?.identities?.includes(spare.name))
      return `Add ${spare.name} first: tap it in your hand, then tap ${loc.name}. It adds +${matched ? 3 : spare.bonus} ${statLabel} to your ${myTotal} against their ${theirTotal}.`
    }
    if (myTotal > theirTotal) {
      const kill = lesson.goal.kind === 'eliminate' ? ' Turn Kill mode on first so the loser is discarded.' : ''
      return `Attack: tap ${name(myGp.cardId)}, then tap the rival's card. ${statLabel} here: you ${myTotal} vs them ${theirTotal}.${kill}`
    }
    if (!ta.addedFollower && me.followerHand.length > 0)
      return `You trail ${myTotal} to ${theirTotal} in ${statLabel}. Add ${me.followerHand[0].name}: tap it in your hand, then tap ${loc.name}.`
    if (myTotal === theirTotal) return `A draw changes nothing (${myTotal} vs ${theirTotal}). Bring more cards here, or End Turn.`
    return `You trail ${myTotal} to ${theirTotal}. Move or deploy more cards to ${loc.name} before attacking, or End Turn.`
  }

  // 3. Followers strengthen a location where you already stand.
  if (!ta.addedFollower && me.followerHand.length > 0) {
    const loc = state.locations.find(l => mine(l).some(c => c.type === 'gp'))
    if (loc) {
      const f = me.followerHand[0]
      const matched = mine(loc).some(c => c.type === 'gp' && gpMap[c.cardId]?.identities?.includes(f.name))
      return `Add ${f.name}: tap it in your hand, then tap ${loc.name}. ${f.name} adds +${matched ? 3 : f.bonus} ${STAT_LABELS[f.stat]}${matched ? ` beside ${name(mine(loc).find(c => c.type === 'gp' && gpMap[c.cardId]?.identities?.includes(f.name))!.cardId)}` : ''}.`
    }
  }

  // 4. Event cards.
  if (me.eventHand.length > 0) {
    const ev = me.eventHand[0]
    if (ev.type === 'global_competition') {
      const hidden = state.locations.flatMap(mine).filter(c => c.type === 'gp' && !c.isPublic && !c.justDeployed && !ta.actedCards.includes(`vis-${c.instanceId}`))
      if (hidden.length > 0) return `Only public cards count in a competition. Tap ${name(hidden[0].cardId)} on the board and press Toggle Public.`
      const ready = state.locations.find(l => settled(l) && !l.activeEvent)
      if (ready && me.gpHand.length === 0) return `Start the ${ev.name}: tap the event card, then tap ${ready.name}. Then End Turn; the round's totals decide.`
      if (!ready) return 'A Great Person cannot start an event on the turn they arrive. End Turn and come back.'
      return 'Deploy everyone first: more public Great People means a bigger total.'
    }
    const spot = state.locations.find(l => theirs(l).length > 0 && !l.activeEvent)
    if (spot) {
      if (settled(spot)) return `Start the ${ev.name}: tap the event card in your hand, then tap ${spot.name}.`
      if (mine(spot).length === 0) {
        const mover = state.locations.flatMap(mine).find(c => c.type === 'gp' && !c.justDeployed && !ta.movedCards.includes(c.instanceId))
        if (mover) return `Move: tap ${name(mover.cardId)}, press Move Card, then tap ${spot.name} where the rival stands.`
      }
      return 'A Great Person cannot start an event on the turn they arrive. End Turn and start it next turn.'
    }
  }

  if (lesson.goal.kind === 'hold') {
    const loc = state.locations[lesson.goal.location]
    const total = computeLocationTotal(loc.cards, ME, stat, gpMap, followerMap, state.locations, loc.name, loc.era)
    return `Your side at ${loc.name} totals ${total} ${statLabel}; anything under 5 is discarded when the round ends. End Turn to let the round resolve.`
  }
  if (state.globalCompetitionActive) return 'The competition is running. End Turn; the highest public total on the board wins.'
  return 'Nothing more to do this turn. Press End Turn.'
}

/** For the Collection: the achievement a lesson's attacks count towards, if any. */
export function heroAchievementStat(hero: string): StatKey | undefined {
  return ACHIEVEMENT_SPECS[getGPCard(hero)?.figureName ?? '']?.stat
}
