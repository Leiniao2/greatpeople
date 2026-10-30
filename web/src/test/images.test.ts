// Every image the app can ask for must exist as a WebP under web/public.
// Guards against a card, follower or location key being added without
// running `npm run images`, or an original being dropped from data/images.
import { describe, it, expect } from 'vitest'
import cards from '@/data/cards.json'
import followers from '@/data/followers.json'
import locationCards from '@/data/location_cards.json'
import storyConfigs from '@/data/story_configs.json'
import artworks from '@/data/artworks.json'
import { resolveLocationImageKey } from '@/data/location_images'

// Paths are keyed relative to this file, e.g. "../../public/portraits/x.webp".
const PUBLIC_FILES = new Set(
  Object.keys(import.meta.glob('../../public/**/*.webp')).map(p => p.replace(/^\.\.\/\.\.\/public\//, '')),
)
const exists = (rel: string) => PUBLIC_FILES.has(rel)

describe('image assets', () => {
  it('found the public folder', () => {
    expect(PUBLIC_FILES.size).toBeGreaterThan(100)
  })

  it('has a portrait for every card', () => {
    const missing = cards.map(c => c.portraitKey).filter(k => !exists(`portraits/portrait_${k}.webp`))
    expect(missing).toEqual([])
  })

  it('has an image for every follower', () => {
    const missing = followers.map(f => f.imageKey).filter(k => !exists(`followers/${k}.webp`))
    expect(missing).toEqual([])
  })

  it('has artwork for every location card after fallback', () => {
    const keys = new Set<string>()
    for (const c of locationCards as { imageKey?: string }[]) if (c.imageKey) keys.add(c.imageKey)
    for (const s of storyConfigs as { locationImage?: string }[]) if (s.locationImage) keys.add(s.locationImage)
    const missing = [...keys].filter(k => !exists(`locations/${resolveLocationImageKey(k)}.webp`))
    expect(missing).toEqual([])
  })

  it('has a WebP for every artwork in the manifest', () => {
    const missing = artworks.map(a => `${a.folder}/${a.key}`).filter(p => !exists(`${p}.webp`))
    expect(missing).toEqual([])
  })

  it('has scenario art for every event and hazard name the battle uses', () => {
    const stats = ['politics', 'strength', 'culture', 'wealth', 'technique', 'intelligence', 'belief', 'reputation']
    const scenarioKeys = artworks.filter(a => a.folder === 'scenarios').map(a => a.key)
    for (const stat of stats) expect(scenarioKeys.filter(k => k.startsWith(`${stat}_`))).toHaveLength(3)
    expect(scenarioKeys.filter(k => k.startsWith('hazard_'))).toHaveLength(8)
  })

  it('has all four card backs', () => {
    for (const k of ['gp', 'follower', 'location', 'event']) expect(exists(`card-backs/${k}.webp`)).toBe(true)
  })
})
