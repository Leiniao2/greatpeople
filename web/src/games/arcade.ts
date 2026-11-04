// Arcade tracks: every registered game type is a ladder of levels that get
// harder as you climb.  Levels are generated, not authored: level n of a
// track picks one of the game's configs, a difficulty that rises every few
// levels, and a seed of its own, so the Arcade can hold far more levels of
// a type than Epic ever uses.

import type { Difficulty, MinigameChallenge } from './types'
import { GAMES, GAME_KEYS, type GameKey } from './registry'
import { hashString } from '@/components/minigames/_shared'

export const LEVELS_PER_TRACK = 24
/** Levels per difficulty tier: 1–6 → D1, 7–12 → D2, 13–18 → D3, 19–24 → D4. */
const LEVELS_PER_TIER = LEVELS_PER_TRACK / 4

export interface ArcadeLevel {
  /** 0-based position on the track. */
  index: number
  game: GameKey
  configId: string
  difficulty: Difficulty
  seed: number
}

/** All arcade tracks, in registry order. */
export const ARCADE_TRACKS: GameKey[] = GAME_KEYS

export function difficultyForLevel(index: number): Difficulty {
  return (Math.min(3, Math.floor(index / LEVELS_PER_TIER)) + 1) as Difficulty
}

/**
 * Level `index` of a track.  Configs are spread so consecutive levels use
 * different ones, and every config comes back at a higher difficulty later.
 */
export function levelFor(game: GameKey, configIds: readonly string[], index: number): ArcadeLevel {
  const ids = configIds.length ? configIds : ['']
  const n = ids.length
  // Walk the configs in order, starting each pass one further along, so every
  // config appears and the same scene never plays twice in a row.  With two
  // configs a shifted pass would repeat at the seam, so they just alternate.
  const pass = Math.floor(index / n)
  const configId = ids[n === 2 ? index % 2 : (index % n + pass) % n]
  return {
    index,
    game,
    configId,
    difficulty: difficultyForLevel(index),
    seed: hashString(`arcade:${game}:${index}`),
  }
}

export function buildTrack(game: GameKey, configIds: readonly string[]): ArcadeLevel[] {
  return Array.from({ length: LEVELS_PER_TRACK }, (_, i) => levelFor(game, configIds, i))
}

/** "cedar-forest" → "Cedar Forest" */
export function prettyConfig(configId: string): string {
  return configId.split(/[-_]/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

/** The challenge the renderer plays for an arcade level. */
export function levelChallenge(level: ArcadeLevel): MinigameChallenge {
  const label = GAMES[level.game].label
  return {
    type: 'minigame',
    id: `arcade:${level.game}:${level.index}`,
    game: level.game,
    configId: level.configId,
    difficulty: level.difficulty,
    seed: level.seed,
    instruction: `${label} · ${levelCode(level.index)}`,
    fact: '',
  }
}

/** Short label for a level: tier letter + position, e.g. index 7 → "B2". */
export function levelCode(index: number): string {
  return `${'ABCD'[Math.min(3, Math.floor(index / LEVELS_PER_TIER))]}${(index % LEVELS_PER_TIER) + 1}`
}

/** Stars for a cleared level: first try 3, one retry 2, more 1. */
export const starsForAttempts = (failedAttempts: number) => (failedAttempts === 0 ? 3 : failedAttempts === 1 ? 2 : 1)
