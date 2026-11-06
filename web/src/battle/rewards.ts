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
