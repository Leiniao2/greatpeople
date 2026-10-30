// Every registered game must load, expose its config ids, and render each
// config without throwing.  Every configId used by story data must exist.
import { createElement } from 'react'
import { render, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { GAMES, GAME_KEYS, type GameKey } from '@/games/registry'
import storyChallenges from '@/data/story_challenges.json'
import type { Challenge, MinigameComponent } from '@/games/types'

afterEach(cleanup)

// jsdom has no canvas implementation; give drawing games an inert 2D context
// so mounting them exercises their React code without a native dependency.
const inertContext = new Proxy({}, { get: () => () => undefined })
HTMLCanvasElement.prototype.getContext = (() => inertContext) as unknown as HTMLCanvasElement['getContext']

const loaded = new Map<GameKey, { default: MinigameComponent; CONFIG_IDS?: string[] }>()
async function load(key: GameKey) {
  if (!loaded.has(key)) loaded.set(key, await GAMES[key].load())
  return loaded.get(key)!
}

describe('game registry', () => {
  it('every game loads and exports CONFIG_IDS', async () => {
    for (const key of GAME_KEYS) {
      const mod = await load(key)
      expect(typeof mod.default, key).toBe('function')
      expect(Array.isArray(mod.CONFIG_IDS) && mod.CONFIG_IDS.length > 0, `${key} CONFIG_IDS`).toBe(true)
    }
  })

  it('every config of every game renders without throwing', async () => {
    const failures: string[] = []
    const noop = () => {}
    for (const key of GAME_KEYS) {
      const mod = await load(key)
      for (const configId of mod.CONFIG_IDS ?? []) {
        // jsdom has no canvas; games that draw on one log a console error but must not throw.
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        try {
          render(createElement(mod.default, { configId, difficulty: 1, seed: 1, onWin: noop, onLose: noop }))
        } catch (err) {
          failures.push(`${key}/${configId}: ${(err as Error).message.split('\n')[0]}`)
        } finally {
          spy.mockRestore()
          cleanup()
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('every configId referenced by story data exists in its game', async () => {
    const missing: string[] = []
    for (const entry of storyChallenges as { story: string; challenges: Challenge[] }[]) {
      for (const ch of entry.challenges) {
        if (ch.type !== 'minigame' || !ch.configId) continue
        const mod = await load(ch.game as GameKey)
        if (!mod.CONFIG_IDS?.includes(ch.configId)) missing.push(`${entry.story}: ${ch.game}/${ch.configId}`)
      }
    }
    expect(missing).toEqual([])
  })
})
