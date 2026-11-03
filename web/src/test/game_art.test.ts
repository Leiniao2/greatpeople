// Every key in the minigame art manifest has a built WebP under web/public/games.
import { describe, it, expect } from 'vitest'
import { GAME_ART, gameArtUrl, type GameArtKey } from '@/games/art'

const PUBLIC_FILES = new Set(
  Object.keys(import.meta.glob('../../public/games/*.webp')).map(p => p.replace(/^\.\.\/\.\.\/public/, '')),
)

describe('minigame art', () => {
  it('has a WebP for every key in GAME_ART', () => {
    const missing = (Object.keys(GAME_ART) as GameArtKey[]).filter(k => !PUBLIC_FILES.has(gameArtUrl(k)))
    expect(missing).toEqual([])
  })
})
