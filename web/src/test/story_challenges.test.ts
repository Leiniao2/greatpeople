import { describe, it, expect } from 'vitest'
import storyChallenges from '@/data/story_challenges.json'

// All game types that MiniChallengePage knows how to render
const KNOWN_GAME_TYPES = new Set([
  'quiz', 'truefalse', 'sort',
  'maze', 'mirror', 'circuit', 'crossword',
  'geometry', 'painting', 'music', 'tactics', 'classify',
  'cooking', 'fiction', 'sudoku', 'voting', 'chemistry', 'matchthree',
  'klotski', 'lorentz', 'porcelain', 'trade', 'punnett',
  'wordle', 'decode', 'wargame',
  'auction', 'pseudocode',
  'compose', 'weapondeploy', 'museum', 'jigsaw',
  'pipeline', 'colormix', 'hunting', 'storysort',
])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stories: any[] = storyChallenges as any[]

describe('story_challenges.json — structural integrity', () => {
  it('contains at least 60 story groups', () => {
    expect(stories.length).toBeGreaterThanOrEqual(60)
  })

  it('every story group has era, story, and challenges array', () => {
    for (const s of stories) {
      expect(typeof s.era,     `missing era in story "${s.story}"`).toBe('string')
      expect(typeof s.story,   `missing story name`).toBe('string')
      expect(Array.isArray(s.challenges), `"${s.story}" challenges not array`).toBe(true)
    }
  })

  it('all challenge types are recognised (quiz, truefalse, sort, minigame)', () => {
    const validTypes = new Set(['quiz', 'truefalse', 'sort', 'minigame'])
    for (const s of stories) {
      for (const ch of s.challenges) {
        expect(
          validTypes.has(ch.type),
          `"${s.story}" has unknown challenge type "${ch.type}"`
        ).toBe(true)
      }
    }
  })

  it('every minigame challenge has a game field and a configId', () => {
    for (const s of stories) {
      for (const ch of s.challenges) {
        if (ch.type === 'minigame') {
          expect(ch.game,     `"${s.story}" minigame missing game field`).toBeTruthy()
          expect(ch.configId, `"${s.story}" minigame "${ch.game}" missing configId`).toBeTruthy()
        }
      }
    }
  })

  it('all minigame game values are known GameTypes', () => {
    for (const s of stories) {
      for (const ch of s.challenges) {
        if (ch.type === 'minigame') {
          expect(
            KNOWN_GAME_TYPES.has(ch.game),
            `"${s.story}" references unknown game "${ch.game}"`
          ).toBe(true)
        }
      }
    }
  })

  it('no story has more than 1 quiz challenge', () => {
    for (const s of stories) {
      const quizCount = s.challenges.filter((ch: { type: string }) => ch.type === 'quiz').length
      expect(quizCount, `"${s.story}" has ${quizCount} quizzes (max 1)`).toBeLessThanOrEqual(1)
    }
  })

  it('quiz challenges have question and options array', () => {
    for (const s of stories) {
      for (const ch of s.challenges) {
        if (ch.type === 'quiz') {
          expect(typeof ch.question, `"${s.story}" quiz missing question`).toBe('string')
          expect(Array.isArray(ch.options), `"${s.story}" quiz missing options`).toBe(true)
          expect(ch.options.length, `"${s.story}" quiz needs ≥2 options`).toBeGreaterThanOrEqual(2)
        }
      }
    }
  })

  it('truefalse challenges have statement and correct (boolean) fields', () => {
    for (const s of stories) {
      for (const ch of s.challenges) {
        if (ch.type === 'truefalse') {
          expect(typeof ch.statement, `"${s.story}" truefalse missing statement`).toBe('string')
          expect(
            ch.correct === true || ch.correct === false,
            `"${s.story}" truefalse correct must be boolean`
          ).toBe(true)
        }
      }
    }
  })
})

describe('story_challenges.json — new mini-game entries', () => {
  it('has at least one storysort challenge', () => {
    const found = stories.some(s => s.challenges.some((ch: { type: string; game: string }) => ch.type === 'minigame' && ch.game === 'storysort'))
    expect(found).toBe(true)
  })

  it('has at least one hunting challenge', () => {
    const found = stories.some(s => s.challenges.some((ch: { type: string; game: string }) => ch.type === 'minigame' && ch.game === 'hunting'))
    expect(found).toBe(true)
  })

  it('has at least one pipeline challenge', () => {
    const found = stories.some(s => s.challenges.some((ch: { type: string; game: string }) => ch.type === 'minigame' && ch.game === 'pipeline'))
    expect(found).toBe(true)
  })

  it('has at least one colormix challenge', () => {
    const found = stories.some(s => s.challenges.some((ch: { type: string; game: string }) => ch.type === 'minigame' && ch.game === 'colormix'))
    expect(found).toBe(true)
  })
})
