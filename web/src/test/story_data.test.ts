// Invariants of the built story data (data/story_*.json, synced into
// web/src/data).  Source-level checks live in scripts/validate-stories.mjs;
// these cover what the web app relies on at runtime.
import { describe, it, expect } from 'vitest'
import storyConfigs from '@/data/story_configs.json'
import storyChallenges from '@/data/story_challenges.json'
import storyScripts from '@/data/story_scripts.json'
import { GAMES } from '@/games/registry'
import { QUIZ_TYPES, STAGES, type Challenge } from '@/games/types'

const ERAS = ['Ancient', 'Classical', 'Medieval', 'Renaissance', 'Steam', 'Electricity', 'Information']

interface Config { era: string; title: string; slug: string; portraitKey: string | null; challengeCount: number; stages: { key: string; difficulty: number; challengeCount: number }[] }
interface Entry { era: string; story: string; slug: string; challenges: Challenge[] }
interface Script { era: string; story: string; slug: string; scenes: { type: string; index?: number; key?: string }[] }

const configs = storyConfigs as Config[]
const entries = storyChallenges as Entry[]
const scripts = storyScripts as Script[]
const keyOf = (s: { era: string; title?: string; story?: string }) => `${s.era}/${s.title ?? s.story}`

describe('story data — the three files describe the same stories', () => {
  it('has 76 stories in each file, with identical era/title sets', () => {
    expect(configs).toHaveLength(76)
    expect(entries).toHaveLength(76)
    expect(scripts).toHaveLength(76)
    const c = new Set(configs.map(keyOf)), e = new Set(entries.map(keyOf)), s = new Set(scripts.map(keyOf))
    expect([...c].sort()).toEqual([...e].sort())
    expect([...c].sort()).toEqual([...s].sort())
    expect(c.size).toBe(76)
  })

  it('slugs are unique', () => {
    expect(new Set(configs.map(c => c.slug)).size).toBe(configs.length)
  })

  it('covers all 7 eras with at least 9 stories each', () => {
    const byEra: Record<string, number> = {}
    for (const c of configs) byEra[c.era] = (byEra[c.era] ?? 0) + 1
    for (const era of ERAS) expect(byEra[era] ?? 0, era).toBeGreaterThanOrEqual(9)
  })

  it('challengeCount matches the challenges actually present', () => {
    for (const c of configs) {
      const entry = entries.find(e => keyOf(e) === keyOf(c))!
      expect(entry.challenges.length, c.title).toBe(c.challengeCount)
      expect(c.stages.reduce((n, s) => n + s.challengeCount, 0), c.title).toBe(c.challengeCount)
    }
  })

  it('every script challenge index points at a real challenge, each exactly once', () => {
    for (const s of scripts) {
      const entry = entries.find(e => keyOf(e) === keyOf(s))!
      const indices = s.scenes.filter(sc => sc.type === 'challenge').map(sc => sc.index!)
      expect(indices.sort((a, b) => a - b), s.story).toEqual(entry.challenges.map((_, i) => i))
    }
  })

  it('every story walks the four stages in order', () => {
    for (const s of scripts) {
      const stageKeys = s.scenes.filter(sc => sc.type === 'stage').map(sc => sc.key)
      expect(stageKeys, s.story).toEqual(STAGES.map(st => st.key))
    }
    for (const c of configs) {
      expect(c.stages.map(st => st.difficulty), c.title).toEqual([1, 2, 3, 4])
    }
  })
})

describe('story data — challenges', () => {
  const all = entries.flatMap(e => e.challenges.map(ch => ({ story: e.story, ch })))

  it('every challenge has an id, stage, difficulty and fact', () => {
    for (const { story, ch } of all) {
      expect(ch.id, story).toMatch(/^[a-z0-9-]+:\d+$/)
      expect(STAGES.some(s => s.key === ch.stage), `${story} ${ch.id}`).toBe(true)
      expect([1, 2, 3, 4]).toContain(ch.difficulty)
      expect(typeof ch.fact === 'string' && ch.fact.length > 0, `${story} ${ch.id} fact`).toBe(true)
    }
  })

  it('every minigame names a registered game and a config or params', () => {
    for (const { story, ch } of all) {
      if (ch.type !== 'minigame') continue
      expect(ch.game in GAMES, `${story}: unknown game "${ch.game}"`).toBe(true)
      expect(!!ch.configId || !!ch.params, `${story}: ${ch.game} has neither configId nor params`).toBe(true)
      expect(typeof ch.instruction, `${story}: ${ch.game} instruction`).toBe('string')
    }
  })

  it('quiz-style challenges are well formed', () => {
    for (const { story, ch } of all) {
      if (ch.type === 'quiz') {
        expect(ch.options.length, story).toBeGreaterThanOrEqual(2)
        expect(ch.answer, story).toBeGreaterThanOrEqual(0)
        expect(ch.answer, story).toBeLessThan(ch.options.length)
      } else if (ch.type === 'truefalse') {
        expect(typeof ch.correct, story).toBe('boolean')
      } else if (ch.type === 'sort') {
        expect(ch.items.length, story).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('reports the quiz-style share (target ≤ 5% once all eras are authored)', () => {
    const quiz = all.filter(({ ch }) => QUIZ_TYPES.has(ch.type)).length
    const share = quiz / all.length
    // Tightened era by era by scripts/validate-stories.mjs; here only sanity.
    expect(share).toBeLessThanOrEqual(0.5)
  })
})
