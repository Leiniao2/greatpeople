// Distinguish: two (or three) look-alikes side by side and one clue.  Read
// the feature, look hard at the pictures, pick the one the clue asks for.
//
// The clue gets less direct as the tiers rise:
//   D1  names the feature of the thing you must find
//   D2  half the time describes the other one instead, so you find yours by
//       elimination
//   D3  three-way sets join in, and the clue only describes the others
//   D4  every clue describes the others; one mistake ends the round of play
//
// Pure logic, so tests can play every level without a browser.

import type { Difficulty } from '@/games/types'
import { mulberry32, shuffle, scale } from '../_shared'
import { PAIRS, type LookAlike, type Pair, type Shelf } from './pairs'

export type ClueMode = 'direct' | 'other'

export interface Round {
  pair: string
  /** Image keys in the order shown. */
  options: string[]
  answer: string
  mode: ClueMode
  /** Feature sentences, each "The <name> <trait>." */
  clue: string[]
  ask: string
}

export interface Plan {
  rounds: Round[]
  /** Mistakes that end the game. */
  lives: number
  seconds: number
}

export const ROUNDS = [5, 6, 7, 8] as const
export const LIVES = [3, 2, 2, 1] as const
export const SECONDS = [90, 110, 130, 150] as const

export const LOOKALIKE: Record<string, LookAlike & { pair: string }> = Object.fromEntries(
  PAIRS.flatMap(p => p.items.map(it => [it.key, { ...it, pair: p.id }])),
)

const sentence = (it: LookAlike) => `The ${it.name} ${it.trait}.`

/** Pairs on the given shelves; triples only from D3, cut to pairs below it. */
function poolFor(shelves: readonly Shelf[]): Pair[] {
  return PAIRS.filter(p => shelves.includes(p.shelf))
}

export function buildRound(pair: Pair, difficulty: Difficulty, rng: () => number, forceMode?: ClueMode): Round {
  let items: LookAlike[] = [...pair.items]
  if (items.length === 3 && difficulty < 3) items = shuffle(items, rng).slice(0, 2)
  const answer = items[Math.floor(rng() * items.length)]
  const others = items.filter(i => i !== answer)
  const mode: ClueMode = forceMode
    ?? (difficulty === 1 ? 'direct' : difficulty === 2 ? (rng() < 0.5 ? 'direct' : 'other') : 'other')
  return {
    pair: pair.id,
    options: shuffle(items, rng).map(i => i.key),
    answer: answer.key,
    mode,
    clue: mode === 'direct' ? [sentence(answer)] : others.map(sentence),
    ask: `Which picture shows the ${answer.name}?`,
  }
}

export function plan(shelves: readonly Shelf[], difficulty: Difficulty, seed: number): Plan {
  const rng = mulberry32(seed)
  const pool = poolFor(shelves)
  const n = Math.min(scale(difficulty, ROUNDS), pool.length)
  // From D3 put the three-way sets first in the draw so they are not left out.
  const drawn = shuffle(pool, rng)
  if (difficulty >= 3) drawn.sort((a, b) => b.items.length - a.items.length)
  const chosen = shuffle(drawn.slice(0, n), rng)
  const rounds = chosen.map(p => buildRound(p, difficulty, rng))
  // D2 promises both kinds of clue.
  if (difficulty === 2 && rounds.length >= 2) {
    if (!rounds.some(r => r.mode === 'other')) rounds[0] = buildRound(chosen[0], 2, rng, 'other')
    if (!rounds.some(r => r.mode === 'direct')) rounds[1] = buildRound(chosen[1], 2, rng, 'direct')
  }
  return { rounds, lives: scale(difficulty, LIVES), seconds: scale(difficulty, SECONDS) }
}
