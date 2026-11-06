// Every Classify card has painted art: a catalogued subject and a WebP.
import { describe, it, expect } from 'vitest'
import { CONFIGS } from '@/components/minigames/ClassifyGame'
import { CLASSIFY_ART, classifyArtUrl } from '@/games/classifyArt'

const PUBLIC_FILES = new Set(Object.keys(import.meta.glob('../../public/classify/*.webp')).map(p => p.replace('../../public', '')))

describe('classify art', () => {
  const items = Object.values(CONFIGS).flatMap(c => c.items)
  it('every item names catalogued art', () => {
    for (const it of items) expect(CLASSIFY_ART, it.label).toHaveProperty(it.art)
  })
  it('every catalogued card has a WebP', () => {
    const missing = Object.keys(CLASSIFY_ART).filter(k => !PUBLIC_FILES.has(classifyArtUrl(k)))
    expect(missing).toEqual([])
  })
  it('no item still carries an emoji', () => {
    for (const c of Object.values(CONFIGS)) for (const it of c.items) expect(it.label).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
