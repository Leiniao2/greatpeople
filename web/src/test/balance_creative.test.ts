// Difficulty balance for the creative / knowledge games: every tier stays
// winnable, rises D1 → D4, and a wrong pick at D1–D2 leaves room to learn.
import { createElement } from 'react'
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Difficulty } from '@/games/types'

import { CONFIGS as MUSEUM, bestScore, targetScore } from '@/components/minigames/MuseumGame'
import ChemistryGame, { CONFIGS as CHEM, verdicts, hiddenFormula } from '@/components/minigames/ChemistryGame'
import { CONFIGS as DEBATE, debateTargets } from '@/components/minigames/DebateGame'
import { CONFIGS as COLORMIX, mixRGB, colourDist, toleranceAt } from '@/components/minigames/ColorMixGame'
import PaintingGame, { CONFIGS as PAINTING } from '@/components/minigames/PaintingGame'
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

describe('Chemistry', () => {
  // The player's best line: start each named ingredient mid-range, then halve on ▲/▼.
  function binarySearchMixes(cfg: (typeof CHEM)[string]): number {
    const lo: Record<string, number> = {}, hi: Record<string, number> = {}
    const named = cfg.ingredients.filter(i => i.symbol in cfg.solution)
    for (const i of named) { lo[i.symbol] = 1; hi[i.symbol] = i.max }
    for (let mix = 1; mix <= 10; mix++) {
      const counts = Object.fromEntries(named.map(i => [i.symbol, Math.floor((lo[i.symbol] + hi[i.symbol]) / 2)]))
      const v = verdicts(cfg, counts)
      if (Object.values(v).every(x => x === 'ok')) return mix
      for (const i of named) {
        if (v[i.symbol] === 'more') lo[i.symbol] = counts[i.symbol] + 1
        if (v[i.symbol] === 'less') hi[i.symbol] = counts[i.symbol] - 1
      }
    }
    return Infinity
  }

  it('a careful player always finds the mix within the D4 budget of three', () => {
    for (const [id, cfg] of Object.entries(CHEM)) expect(binarySearchMixes(cfg), id).toBeLessThanOrEqual(3)
  })

  it('the measures are hidden; the needed ingredients are named', () => {
    for (const cfg of Object.values(CHEM)) {
      render(createElement(ChemistryGame, { configId: Object.keys(CHEM).find(k => CHEM[k] === cfg)!, difficulty: 1, seed: 1, onWin: () => {}, onLose: () => {} }))
      expect(screen.queryByText(cfg.targetFormula)).toBeNull()
      expect(screen.getByText(hiddenFormula(cfg))).toBeInTheDocument()
      cleanup()
    }
  })

  const setCounts = (cfg: (typeof CHEM)[string], counts: Record<string, number>) => {
    cfg.ingredients.forEach((ing, idx) => {
      const plus = screen.getAllByText('+')[idx], minus = screen.getAllByText('−')[idx]
      for (let k = 0; k < 8; k++) fireEvent.click(minus)
      for (let k = 0; k < (counts[ing.symbol] ?? 0); k++) fireEvent.click(plus)
    })
    fireEvent.click(screen.getByRole('button', { name: /Combine/ }))
  }

  for (const d of DIFFS) {
    it(`every config wins once at D${d} after a wrong mix`, () => {
      vi.useFakeTimers()
      for (const [id, cfg] of Object.entries(CHEM)) {
        const onWin = vi.fn(), onLose = vi.fn()
        render(createElement(ChemistryGame, { configId: id, difficulty: d, seed: 1, onWin, onLose }))
        setCounts(cfg, {})
        expect(screen.getAllByText(/▲ more/).length).toBe(Object.keys(cfg.solution).length)
        setCounts(cfg, cfg.solution)
        act(() => { vi.advanceTimersByTime(1000) })
        expect(onWin, `${id}@${d}`).toHaveBeenCalledTimes(1)
        expect(onLose).not.toHaveBeenCalled()
        act(() => { vi.advanceTimersByTime(200_000) })
        expect(onLose).not.toHaveBeenCalled()
        cleanup()
      }
    })
  }

  it('D4 loses once after three failed mixes; D1 never does', () => {
    vi.useFakeTimers()
    const cfg = CHEM['tea-blend']
    const h = { onWin: vi.fn(), onLose: vi.fn() }
    render(createElement(ChemistryGame, { configId: 'tea-blend', difficulty: 4, seed: 1, ...h }))
    for (let i = 0; i < 4; i++) { setCounts(cfg, {}); act(() => { vi.advanceTimersByTime(800) }) }
    act(() => { vi.advanceTimersByTime(100_000) })
    expect(h.onLose).toHaveBeenCalledTimes(1)
    cleanup()
    const h1 = { onWin: vi.fn(), onLose: vi.fn() }
    render(createElement(ChemistryGame, { configId: 'tea-blend', difficulty: 1, seed: 1, ...h1 }))
    for (let i = 0; i < 8; i++) { setCounts(cfg, {}); act(() => { vi.advanceTimersByTime(800) }) }
    expect(h1.onLose).not.toHaveBeenCalled()
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
  it('marks a wrong region at D1–D2 but not from D3', () => {
    const cfg = PAINTING['spring-garden']
    const region = cfg.regions[0]
    const wrong = cfg.palette.find(p => p.color !== region.targetColor)!
    for (const d of DIFFS) {
      render(createElement(PaintingGame, { configId: 'spring-garden', difficulty: d, seed: 1, onWin: () => {}, onLose: () => {} }))
      fireEvent.click(screen.getByLabelText(wrong.name))
      const btn = screen.getAllByText(region.label).map(el => el.closest('button')!).find(b => b?.className.includes('px-2.5'))!
      fireEvent.click(btn)
      expect(btn.className.includes('border-red-500'), `D${d}`).toBe(d <= 2)
      cleanup()
    }
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
