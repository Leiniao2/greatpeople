// Shared types for story challenges and the minigames that play them.
//
// Challenge data comes from data/stories/**/*.json via scripts/build-stories.mjs
// and lands in story_challenges.json; the shapes here mirror that output.

export type Difficulty = 1 | 2 | 3 | 4

export type StageKey = 'origins' | 'trial' | 'mastery' | 'legacy'

export const STAGES: { key: StageKey; label: string; difficulty: Difficulty }[] = [
  { key: 'origins', label: 'Origins', difficulty: 1 },
  { key: 'trial',   label: 'Trial',   difficulty: 2 },
  { key: 'mastery', label: 'Mastery', difficulty: 3 },
  { key: 'legacy',  label: 'Legacy',  difficulty: 4 },
]

interface ChallengeBase {
  /** `<story slug>:<n>`, assigned by the build script. */
  id?: string
  stage?: StageKey
  difficulty?: Difficulty
  fact: string
  /** Shown from the second attempt onwards. */
  hint?: string
  /** Seconds allowed before the challenge counts as failed. */
  countdown?: number
}

export interface QuizChallenge extends ChallengeBase {
  type: 'quiz'
  question: string
  options: string[]
  answer: number
}

export interface TrueFalseChallenge extends ChallengeBase {
  type: 'truefalse'
  statement: string
  correct: boolean
}

export interface SortChallenge extends ChallengeBase {
  type: 'sort'
  question: string
  /** Listed in the correct order. */
  items: string[]
}

export interface MinigameChallenge extends ChallengeBase {
  type: 'minigame'
  game: string
  instruction: string
  /** Hand-authored config inside the game component. */
  configId?: string
  /** Inline overrides for procedural games; merged over the config. */
  params?: Record<string, unknown>
  seed?: number
}

export type Challenge = QuizChallenge | TrueFalseChallenge | SortChallenge | MinigameChallenge

export const QUIZ_TYPES: ReadonlySet<string> = new Set(['quiz', 'truefalse', 'sort'])

/** Props every minigame component receives. */
export interface MinigameProps {
  configId: string
  difficulty: Difficulty
  /** Deterministic source for any randomness, so a retry can reshuffle. */
  seed: number
  params?: Record<string, unknown>
  onWin: () => void
  onLose: (reason?: string) => void
}

export type MinigameComponent = React.ComponentType<MinigameProps>
