import cardsJson from '@/data/cards.json'
import storyConfigs from '@/data/story_configs.json'
import { portraitUrl } from '@/data/images'
import type { Card, GameState } from '@/types'

// Rewards: every fight a human player wins, and every Arcade track finished
// (all its levels cleared), unlocks one random Great Person the player
// doesn't own yet.  Only Great People without an Epic story are given this
// way; story figures (and story bonus cards) are still earned by finishing
// their story.

const STORY_KEYS = new Set(
  (storyConfigs as { portraitKey?: string | null; bonusCard?: { portraitKey?: string } }[])
    .flatMap(s => [s.portraitKey, s.bonusCard?.portraitKey])
    .filter((k): k is string => !!k),
)

/** Great People that can only be collected by winning fights. */
export const FIGHT_REWARD_POOL: Card[] = (cardsJson as unknown as Omit<Card, 'portraitUrl'>[])
  .filter(c => !STORY_KEYS.has(c.portraitKey ?? c.id))
  .map(c => ({ ...c, portraitUrl: portraitUrl(c.portraitKey ?? c.id) }))

/** A reward card by portrait key (for showing what a finished track gave). */
export const rewardCard = (key: string): Card | undefined => FIGHT_REWARD_POOL.find(c => (c.portraitKey ?? c.id) === key)

/** True when the game is over and a human player won it. */
export function humanWon(state: GameState): boolean {
  if (state.phase !== 'ended' || !state.winner) return false
  const winner = state.players.find(p => p.id === state.winner)
  return !!winner && !winner.isComputer
}

/** A random fight-only card not in `owned` (portrait keys), or null when all are collected. */
export function pickFightReward(owned: readonly string[], rand: () => number = Math.random): Card | null {
  const have = new Set(owned)
  const left = FIGHT_REWARD_POOL.filter(c => !have.has(c.portraitKey ?? c.id))
  if (!left.length) return null
  return left[Math.floor(rand() * left.length)]
}

const ALL_CARDS = cardsJson as unknown as Omit<Card, 'portraitUrl'>[]
const keyOf = (c: { id: string; portraitKey?: string | null }) => c.portraitKey ?? c.id

/** Card ids for a collection of portrait keys. */
export function ownedCardIds(owned: readonly string[]): string[] {
  const have = new Set(owned)
  return ALL_CARDS.filter(c => have.has(keyOf(c))).map(c => c.id)
}

/**
 * Fights bring only cards you own.  A player who owns no Great Person of the
 * game's era (single-era game) or none at all (all-era game) gets one
 * fight-only card of it free; null when they need none (or none is left).
 */
export function welcomeCard(owned: readonly string[], era: string | null, rand: () => number = Math.random): Card | null {
  const have = new Set(owned)
  const inGame = (c: { era: string }) => !era || c.era === era
  if (ALL_CARDS.some(c => inGame(c) && have.has(keyOf(c)))) return null
  const left = FIGHT_REWARD_POOL.filter(c => inGame(c) && !have.has(keyOf(c)))
  return left.length ? left[Math.floor(rand() * left.length)] : null
}
