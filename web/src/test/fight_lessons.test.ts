// Every Epic story ends with a fight lesson, and every lesson is winnable by
// the line of play its coach describes.  The lines below drive the real
// engine (initScriptedGame + gameReducer) for each story's cast, standing in
// for the CPU with the same choices BattleGame's AI makes.
import { describe, it, expect } from 'vitest'
import storyChallenges from '@/data/story_challenges.json'
import type { Challenge, MinigameChallenge } from '@/games/types'
import type { GameState, OnboardCard } from '@/types'
import { gameReducer, initScriptedGame, type GameAction } from '@/battle/engine'
import { buildLesson, coachHint, lessonStatus, LESSON_TIERS, type Lesson, type LessonProgress } from '@/battle/lessons'

interface Entry { era: string; story: string; slug: string; challenges: Challenge[] }
const entries = storyChallenges as Entry[]
const lastChallenge = (e: Entry) => e.challenges[e.challenges.length - 1]

const ME = 'player-0'
const CPU = 'player-1'

/** A tiny harness: dispatches like FightGame does and keeps the lesson progress. */
class Table {
  state: GameState
  progress: LessonProgress = { attacksWon: 0, competitionsWon: 0 }
  constructor(public lesson: Lesson) { this.state = initScriptedGame(lesson.script) }

  do(action: GameAction) {
    const prev = this.state
    const next = gameReducer(prev, action)
    expect(next, `${action.type} was rejected by the engine`).not.toBe(prev)
    const s = next.pendingSummary
    if (action.type === 'ATTACK' && prev.currentPlayerIdx === 0 && s?.kind === 'combat' && s.result === 'attacker') this.progress.attacksWon++
    if (action.type === 'END_TURN' && s?.kind === 'event' && s.eventType === 'global_competition' && s.winnerName === next.players[0].name) this.progress.competitionsWon++
    this.state = s ? gameReducer(next, { type: 'DISMISS_SUMMARY' }) : next
    // The coach must always have something to say on the player's turn.
    if (this.state.phase === 'playing') expect(coachHint(this.state, this.lesson)).toBeTruthy()
    return next
  }

  get me() { return this.state.players[0] }
  get rival() { return this.state.players[1] }
  loc(i: number) { return this.state.locations[i] }
  mine(i: number, type: OnboardCard['type'] = 'gp') { return this.loc(i).cards.filter(c => c.playerId === ME && c.type === type) }
  theirs(i: number) { return this.loc(i).cards.filter(c => c.playerId === CPU) }

  deploy(cardId: string, loc: number) { this.do({ type: 'DEPLOY_GP', cardId, locationId: this.loc(loc).id, isPublic: false }) }
  follow(loc: number) { const f = this.me.followerHand[0]; this.do({ type: 'ADD_FOLLOWER', followerId: f.id, locationId: this.loc(loc).id, instanceId: f.id }) }
  event(loc: number, idx = 0) { this.do({ type: 'START_EVENT', eventCardIdx: idx, locationId: this.loc(loc).id }) }
  move(instanceId: string, loc: number) { this.do({ type: 'MOVE_CARD', instanceId, toLocationId: this.loc(loc).id }) }
  reveal(instanceId: string) { this.do({ type: 'TOGGLE_VISIBILITY', instanceId }) }
  attack(loc: number, kill = false) {
    const mine = this.mine(loc)[0], theirs = this.theirs(loc)[0]
    expect(mine && theirs, `both sides at ${this.loc(loc).name}`).toBeTruthy()
    const next = this.do({ type: 'ATTACK', myInstanceId: mine.instanceId, theirInstanceId: theirs.instanceId, kill })
    expect(next.pendingSummary?.kind === 'combat' && next.pendingSummary.result, `attack at ${this.loc(loc).name}`).toBe('attacker')
  }
  /** End the player's turn, then play the CPU's turn the way BattleGame's AI does. */
  endTurn() {
    this.do({ type: 'END_TURN' })
    if (this.state.phase !== 'playing') return
    expect(this.state.currentPlayerIdx).toBe(1)
    const rival = this.rival
    if (rival.gpHand.length > 0) {
      // Strongest card to the location with the fewest own cards, then the most rivals.
      const target = [...this.state.locations].sort((a, b) =>
        a.cards.filter(c => c.playerId === CPU).length - b.cards.filter(c => c.playerId === CPU).length
        || b.cards.filter(c => c.playerId === ME).length - a.cards.filter(c => c.playerId === ME).length)[0]
      this.do({ type: 'DEPLOY_GP', cardId: rival.gpHand[0], locationId: target.id, isPublic: true })
    }
    const withGP = this.state.locations.find(l => l.cards.some(c => c.playerId === CPU && c.type === 'gp'))
    if (withGP && this.rival.followerHand.length > 0) {
      const f = this.rival.followerHand[0]
      this.do({ type: 'ADD_FOLLOWER', followerId: f.id, locationId: withGP.id, instanceId: f.id })
    }
    this.do({ type: 'END_TURN' })
    if (this.state.phase === 'playing') expect(this.state.currentPlayerIdx).toBe(0)
  }
  status() { return lessonStatus(this.state, this.progress, this.lesson) }
  expectWon() {
    const s = this.status()
    expect(s.failed, this.lesson.title).toBeUndefined()
    expect(s.done, `${this.lesson.title}: ${s.text}`).toBe(true)
  }
}

/** The coached line for each tier. */
const PLAY: Record<Lesson['tier'], (t: Table) => void> = {
  duel(t) {
    t.deploy(t.lesson.params.hero, 0)
    t.follow(0)
    t.attack(0)
  },
  reinforce(t) {
    const { hero, allies: [ally] } = t.lesson.params
    t.deploy(hero, 0); t.follow(0); t.endTurn()
    t.deploy(ally, 0); t.follow(0)
    t.attack(0)
    t.attack(0)
  },
  event(t) {
    t.deploy(t.lesson.params.hero, 1); t.endTurn()
    t.event(1); t.follow(1)
    t.attack(1)
  },
  survival(t) {
    t.deploy(t.lesson.params.hero, 0); t.follow(0)
    t.endTurn()                       // round 2: the weak rival is discarded, the hero holds
    expect(t.theirs(0).length, 'weak rival swept away').toBe(0)
    expect(t.mine(0).length, 'hero survives').toBe(1)
    t.endTurn()                       // round 3
  },
  hidden(t) {
    const p = t.lesson.params
    t.deploy(p.hero, 0); t.follow(0)
    t.attack(0)                       // reveals and beats the face-down card
    t.endTurn()
    t.deploy(p.allies[0], 1); t.follow(1); t.endTurn()
    t.move(t.mine(0)[0].instanceId, 1)
    t.event(1)
    t.attack(1)
  },
  competition(t) {
    const p = t.lesson.params
    t.deploy(p.hero, 0); t.endTurn()
    t.reveal(t.mine(0)[0].instanceId); t.deploy(p.allies[0], 1); t.endTurn()
    t.reveal(t.mine(1)[0].instanceId); t.deploy(p.allies[1], 2); t.endTurn()
    t.reveal(t.mine(2)[0].instanceId)
    t.event(0)                        // the global competition, resolved at the round's end
    t.endTurn()
  },
  conquest(t) {
    const p = t.lesson.params
    t.deploy(p.hero, 0); t.follow(0); t.endTurn()
    for (let round = 0; round < 4 && t.status().done === false; round++) {
      const where = t.state.locations.findIndex(l => l.cards.some(c => c.playerId === CPU && c.type === 'gp'))
      expect(where, 'rival on the board').toBeGreaterThanOrEqual(0)
      const hero = t.state.locations.flatMap(l => l.cards).find(c => c.cardId === p.hero)!
      const heroLoc = t.state.locations.findIndex(l => l.cards.includes(hero))
      if (heroLoc !== where) t.move(hero.instanceId, where)
      if (t.me.gpHand.length) t.deploy(t.me.gpHand[0], where)
      if (!t.loc(where).activeEvent) t.event(where)
      if (t.me.followerHand.length) t.follow(where)
      t.attack(where, true)
      if (t.status().done) break
      t.endTurn()
    }
  },
}

describe('fight lessons', () => {
  it('every story ends with a fight lesson whose tier follows the era curriculum', () => {
    const tierByEra: Record<string, string> = {
      Ancient: 'duel', Classical: 'reinforce', Medieval: 'event', Renaissance: 'survival',
      Steam: 'hidden', Electricity: 'competition', Information: 'conquest',
    }
    for (const e of entries) {
      const last = lastChallenge(e) as MinigameChallenge
      expect(last.type, e.story).toBe('minigame')
      expect(last.game, e.story).toBe('fight')
      expect(last.stage, e.story).toBe('legacy')
      expect(last.configId, e.story).toBe(tierByEra[e.era])
      expect(LESSON_TIERS as readonly string[]).toContain(last.configId)
    }
  })

  it('every lesson names a hero that is the story\'s own card, with a valid cast', () => {
    for (const e of entries) {
      const last = lastChallenge(e) as MinigameChallenge
      const lesson = buildLesson(last.configId!, last.params)
      const p = last.params as Record<string, unknown>
      expect(lesson.params.hero, e.story).toBe(p.hero)
      // The resolver pads a short cast with defaults; the story's own choices come first.
      const opps = p.opponents as string[], allies = p.allies as string[]
      expect(lesson.params.opponents.slice(0, opps.length), e.story).toEqual(opps)
      expect(lesson.params.allies.slice(0, Math.min(2, allies.length)), e.story).toEqual(allies.slice(0, 2))
      expect(lesson.params.locations[0], e.story).toBe((p.locations as string[])[0])
      expect(lesson.script.player.gp?.[0], e.story).toBe(p.hero)
    }
  })

  it('the coached line of play wins every story\'s lesson', () => {
    const failures: string[] = []
    for (const e of entries) {
      const last = lastChallenge(e) as MinigameChallenge
      const lesson = buildLesson(last.configId!, last.params)
      const t = new Table(lesson)
      try {
        PLAY[lesson.tier](t)
        t.expectWon()
      } catch (err) {
        failures.push(`${e.story} (${lesson.tier}): ${(err as Error).message.split('\n')[0]}`)
      }
    }
    expect(failures).toEqual([])
  })

  it('a lesson is lost when the rounds run out', () => {
    const lesson = buildLesson('duel')
    const t = new Table(lesson)
    for (let i = 0; i <= lesson.maxRounds; i++) t.endTurn()
    expect(t.status().failed).toMatch(/round/)
  })

  it('the default cast builds every tier', () => {
    for (const tier of LESSON_TIERS) {
      const lesson = buildLesson(tier)
      const state = initScriptedGame(lesson.script)
      expect(state.players[0].gpHand.length, tier).toBeGreaterThan(0)
      expect(state.locations.length, tier).toBeGreaterThan(0)
      expect(coachHint(state, lesson), tier).toBeTruthy()
    }
  })
})
