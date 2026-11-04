import type { Difficulty } from '@/games/types'

/** Pick a value per difficulty tier: `scale(d, [easy, medium, hard, expert])`. */
export function scale<T>(difficulty: Difficulty, tiers: readonly [T, T, T, T]): T {
  return tiers[difficulty - 1]
}

/**
 * Resolve a game's config: the named one (or the game's default) with any
 * inline params from the challenge layered on top.
 */
export function resolveConfig<C extends object>(
  configs: Record<string, C>,
  configId: string | undefined,
  params: Record<string, unknown> | undefined,
  fallback: keyof typeof configs & string = 'default',
): C {
  const base = (configId && configs[configId]) || configs[fallback] || Object.values(configs)[0]
  return params ? { ...base, ...(params as Partial<C>) } : base
}

/**
 * Only the story-facing text from a challenge's params: a `title`, `intro`
 * or `fact` the story wrote for this moment.  For games whose rules must not be
 * overridden by params (old story data still carries leftover quiz fields).
 */
export function storyText(params: Record<string, unknown> | undefined): { title?: string; intro?: string; fact?: string } {
  const out: { title?: string; intro?: string; fact?: string } = {}
  for (const k of ['title', 'intro', 'fact'] as const) if (typeof params?.[k] === 'string') out[k] = params[k] as string
  return out
}
