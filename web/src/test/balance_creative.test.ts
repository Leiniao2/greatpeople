// Difficulty balance for the creative / knowledge games: every tier stays
// winnable, rises D1 → D4, and a wrong pick at D1–D2 leaves room to learn.
import { cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Difficulty } from '@/games/types'

import { CONFIGS as MUSEUM, bestScore, targetScore } from '@/components/minigames/MuseumGame'
import { CONFIGS as DEBATE, debateTargets } from '@/components/minigames/DebateGame'
import { CONFIGS as COLORMIX, mixRGB, colourDist, toleranceAt } from '@/components/minigames/ColorMixGame'
import { CONFIGS as PAINTING, optionsFor as paintingOptions, tierFor as paintingTier } from '@/components/minigames/PaintingGame'
import { CONFIGS as STARCHART, altitudeCount, sightTolerance, latitudeTolerance } from '@/components/minigames/StarChartGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Museum targets', () => {
  it('rise with difficulty and stay reachable', () => {
    for (const [id, cfg] of Object.entries(MUSEUM)) {
      const t = DIFFS.map(d => targetScore(cfg, d))
      for (let i = 1; i < 4; i++) expect(t[i], `${id} D${i + 1}`).toBeGreaterThan(t[i - 1])
      expect(t[3], id).toBeLessThanOrEqual(bestScore(cfg))
    }
  })
})

describe('Debate', () => {
  it('the mark rises with difficulty, and D1–D2 forgive a weak (+1) reply', () => {
    for (const [id, cfg] of Object.entries(DEBATE)) {
      const t = DIFFS.map(d => debateTargets(cfg, d))
      for (let i = 1; i < 4; i++) expect(t[i].winAt, id).toBeGreaterThanOrEqual(t[i - 1].winAt)
      expect(t[3].winAt, id).toBeGreaterThan(t[0].winAt)
      for (const d of [0, 1]) expect(t[d].best - t[d].winAt, `${id}@${d + 1} slack`).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('Color Mix', () => {
  it('tolerance tightens with difficulty yet every target keeps several matching mixes at D4', () => {
    for (const [id, cfg] of Object.entries(COLORMIX)) {
      const tol = DIFFS.map(d => toleranceAt(cfg, d))
      for (let i = 1; i < 4; i++) expect(tol[i]).toBeLessThan(tol[i - 1])
      const ids = cfg.pigments.map(p => p.id)
      let matches = 0
      const rec = (i: number, am: Record<string, number>) => {
        if (i === ids.length) { if (Object.values(am).some(v => v > 0) && colourDist(mixRGB(cfg.pigments, am), cfg.target.rgb) <= tol[3]) matches++; return }
        for (let n = 0; n <= 6; n++) rec(i + 1, { ...am, [ids[i]]: n })
      }
      rec(0, {})
      expect(matches, `${id} matches at D4`).toBeGreaterThanOrEqual(5)
    }
  })
})

describe('Painting', () => {
  it('more items, more pigments and fewer misses as the tiers rise; wrong pigments close in at D3', () => {
    const t = DIFFS.map(d => paintingTier(d))
    for (let i = 1; i < 4; i++) {
      expect(t[i].items).toBeGreaterThanOrEqual(t[i - 1].items)
      expect(t[i].options).toBeGreaterThan(t[i - 1].options)
      expect(t[i].misses).toBeLessThanOrEqual(t[i - 1].misses)
    }
    const mantle = PAINTING['titian-canvas'].items[0]
    const nearest = (d: Difficulty) => Math.min(...paintingOptions(mantle, d, 3)
      .filter(p => p.name !== mantle.pigment.name)
      .map(p => Math.hypot(...[1, 3, 5].map(k => parseInt(p.hex.slice(k, k + 2), 16) - parseInt(mantle.pigment.hex.slice(k, k + 2), 16)))))
    expect(nearest(4)).toBeLessThan(nearest(1))
  })
})

describe('Star Chart', () => {
  it('altitude tiers: sighting by eye gets a wider window than the sum, and the clock fits the sightings', () => {
    for (const d of DIFFS) {
      expect(sightTolerance(d)).toBeGreaterThanOrEqual(2)
      expect(sightTolerance(d)).toBeGreaterThanOrEqual(latitudeTolerance(d))
      if (d > 1) expect(sightTolerance(d)).toBeLessThanOrEqual(sightTolerance((d - 1) as Difficulty))
    }
    for (const cfg of Object.values(STARCHART)) {
      if (cfg.mode !== 'altitude') continue
      expect(altitudeCount(cfg.sightings!.length, 4)).toBeGreaterThan(altitudeCount(cfg.sightings!.length, 1))
    }
  })
})
