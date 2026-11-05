// Audit of the Creative minigames: every hand-authored config must be
// winnable with the tools it offers, at every difficulty story data uses,
// and the win / lose handlers must fire exactly once.
import { createElement } from 'react'
import { render, screen, act, fireEvent, cleanup, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import storyChallenges from '@/data/story_challenges.json'
import type { Challenge, Difficulty, MinigameChallenge, MinigameComponent } from '@/games/types'
import { resolveConfig } from '@/components/minigames/_shared'

import ColorMixGame, { CONFIGS as COLORMIX, mixRGB, colourDist, toleranceAt } from '@/components/minigames/ColorMixGame'
import PaintingGame, { CONFIGS as PAINTING, optionsFor as paintingOptions, tierFor as paintingTier, itemsFor as paintingItems } from '@/components/minigames/PaintingGame'
import PorcelainGame, { CONFIGS as PORCELAIN, ELEMENT_COLORS, FIRED_HINT } from '@/components/minigames/PorcelainGame'
import CookingGame, { CONFIGS as COOKING } from '@/components/minigames/CookingGame'
import MusicGame, { CONFIGS as MUSIC } from '@/components/minigames/MusicGame'
import ComposeMusicGame, { CONFIGS as COMPOSE, unnumbered } from '@/components/minigames/ComposeMusicGame'
import RhythmGame, { CONFIGS as RHYTHM, buildChart, LANE_KEYS, LEAD_IN_MS } from '@/components/minigames/RhythmGame'
import TypesetGame, { CONFIGS as TYPESET, buildForme, quadSupply, quadUnits, typesetRules, lettersIn, settableLine } from '@/components/minigames/TypesetGame'
import ArchBuildGame, { CONFIGS as ARCH, isBuildable } from '@/components/minigames/ArchBuildGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]

const storyUses = (game: string): MinigameChallenge[] =>
  (storyChallenges as { challenges: Challenge[] }[])
    .flatMap(e => e.challenges)
    .filter((c): c is MinigameChallenge => c.type === 'minigame' && c.game === game)

// ── Pure config checks ────────────────────────────────────────────────────────

describe('ColorMix: every target is reachable within tolerance', () => {
  // The stepper allows 0–6 units of each pigment.
  function bestMix(id: string) {
    const cfg = COLORMIX[id]
    const ids = cfg.pigments.map(p => p.id)
    let best = Infinity, matches = 0
    const rec = (i: number, amounts: Record<string, number>) => {
      if (i === ids.length) {
        if (Object.values(amounts).every(v => v === 0)) return
        const d = colourDist(mixRGB(cfg.pigments, amounts), cfg.target.rgb)
        if (d <= cfg.tolerance) matches++
        best = Math.min(best, d)
        return
      }
      for (let n = 0; n <= 6; n++) rec(i + 1, { ...amounts, [ids[i]]: n })
    }
    rec(0, {})
    return { best, matches }
  }

  for (const id of Object.keys(COLORMIX)) {
    it(`${id} has at least a handful of matching mixes`, () => {
      const { best, matches } = bestMix(id)
      expect(best, `${id} best distance`).toBeLessThanOrEqual(COLORMIX[id].tolerance)
      expect(matches, `${id} matching mixes`).toBeGreaterThanOrEqual(5)
    })
  }

  it('egyptian-blue: the hinted recipe (azurite + bone black) actually matches', () => {
    const cfg = COLORMIX['egyptian-blue']
    const d = colourDist(mixRGB(cfg.pigments, { azure: 4, charcoal: 1 }), cfg.target.rgb)
    expect(d).toBeLessThanOrEqual(cfg.tolerance)
    expect(cfg.target.hint).toMatch(/black/i)
  })

  it('woad-blue: the hinted recipe (woad + iron black) matches', () => {
    const cfg = COLORMIX['woad-blue']
    const d = colourDist(mixRGB(cfg.pigments, { woad: 6, black: 1 }), cfg.target.rgb)
    expect(d).toBeLessThanOrEqual(cfg.tolerance)
  })

  it('story data only uses known configs', () => {
    for (const ch of storyUses('colormix')) expect(COLORMIX[ch.configId!], ch.id).toBeDefined()
  })
})

describe('Painting: every item has a fair set of pigments', () => {
  for (const [id, cfg] of Object.entries(PAINTING)) {
    it(`${id}: the right pigment is offered once, and no wrong one looks too alike`, () => {
      expect(new Set(cfg.items.map(i => i.id)).size).toBe(cfg.items.length)
      for (const item of cfg.items) for (const d of DIFFS) {
        const opts = paintingOptions(item, d, 7)
        expect(opts.length, `${id}/${item.id}@${d}`).toBe(paintingTier(d).options)
        expect(opts.filter(p => p.name === item.pigment.name).length).toBe(1)
        expect(new Set(opts.map(p => p.name)).size).toBe(opts.length)
      }
    })
  }
  it('story data only uses known configs', () => {
    for (const ch of storyUses('painting')) expect(PAINTING[ch.configId!], ch.id).toBeDefined()
  })
})

describe('Porcelain: every section wants an oxide in the palette, and the hint names it uniquely', () => {
  for (const [id, cfg] of Object.entries(PORCELAIN)) {
    it(id, () => {
      for (const s of cfg.sections) {
        expect(cfg.palette, `${id}/${s.id}`).toContain(s.targetElement)
        expect(ELEMENT_COLORS[s.targetElement]).toBeDefined()
        expect(FIRED_HINT[s.targetElement]).toBeTruthy()
      }
      for (const sym of cfg.palette) expect(ELEMENT_COLORS[sym], sym).toBeDefined()
      const hints = cfg.palette.map(sym => FIRED_HINT[sym])
      expect(new Set(hints).size, `${id} hints are ambiguous`).toBe(hints.length)
    })
  }
  it('story data only uses known configs', () => {
    for (const ch of storyUses('porcelain')) expect(PORCELAIN[ch.configId!], ch.id).toBeDefined()
  })
})

describe('Cooking: recipes have distinct steps', () => {
  for (const [id, cfg] of Object.entries(COOKING)) {
    it(id, () => {
      expect(cfg.steps.length).toBeGreaterThanOrEqual(3)
      expect(new Set(cfg.steps).size).toBe(cfg.steps.length)
    })
  }
  it('story data only uses known configs', () => {
    for (const ch of storyUses('cooking')) expect(COOKING[ch.configId!], ch.id).toBeDefined()
  })
})

describe('Music: every sequence is distinguishable by its labels', () => {
  for (const [id, cfg] of Object.entries(MUSIC)) {
    it(id, () => {
      const labels = cfg.noteLabels ?? cfg.notes
      expect(labels.length).toBe(cfg.notes.length)
      // Repeated pitches must carry distinct labels, or the "right" order is unknowable.
      expect(new Set(labels).size, `${id} labels`).toBe(labels.length)
      for (const n of cfg.notes) expect(n.replace(/[^A-G]/g, ''), n).toMatch(/^[A-G]$/)
    })
  }
  it('story data only uses known configs', () => {
    for (const ch of storyUses('music')) expect(MUSIC[ch.configId!], ch.id).toBeDefined()
  })
})

describe('Compose: movements have unique ids', () => {
  for (const [id, cfg] of Object.entries(COMPOSE)) {
    it(id, () => {
      expect(cfg.passages.length).toBeGreaterThanOrEqual(3)
      expect(new Set(cfg.passages.map(p => p.id)).size).toBe(cfg.passages.length)
    })
  }
  it('story data only uses known configs', () => {
    for (const ch of storyUses('compose')) expect(COMPOSE[ch.configId!], ch.id).toBeDefined()
  })
})

describe('Rhythm: every melody charts onto the lanes', () => {
  for (const [id, cfg] of Object.entries(RHYTHM)) {
    it(id, () => {
      expect(cfg.melody.filter(([f]) => f > 0).length, `${id} notes`).toBeGreaterThanOrEqual(8)
      expect(cfg.laneNames.length).toBeGreaterThanOrEqual(5)
      for (const d of DIFFS) {
        const chart = buildChart(cfg, d, 1)
        expect(chart.lanes).toBeGreaterThanOrEqual(3)
        expect(chart.lanes).toBeLessThanOrEqual(5)
        expect(chart.notes.length, `${id}@${d}`).toBeGreaterThanOrEqual(20)
        expect(new Set(chart.notes.map(n => n.lane)).size, `${id}@${d} uses every lane`).toBe(chart.lanes)
      }
    })
  }
  it('story params only override title/intro, never the melody', () => {
    for (const ch of storyUses('rhythm')) {
      expect(RHYTHM[ch.configId!], ch.id).toBeDefined()
      const keys = Object.keys(ch.params ?? {})
      expect(keys.every(k => k === 'title' || k === 'intro'), `${ch.id} params ${keys}`).toBe(true)
    }
  })
})

describe('Typeset: every forme the player is asked to compose can be set and justified', () => {
  const base = TYPESET['gutenberg-bible']
  const checkForme = (label: string, cfg: { lines: string[] }, d: Difficulty, fallback = base) => {
    const { lines, measure } = buildForme(cfg, d, fallback)
    expect(lines.length, label).toBeGreaterThan(0)
    expect(lines.length, label).toBeLessThanOrEqual(typesetRules(d).lines)
    for (const l of lines) {
      expect(l, label).toMatch(/^[A-Z][A-Z ]*$/)
      expect(l.length, `${label} '${l}' overruns the measure`).toBeLessThanOrEqual(measure)
    }
    const letters = lines.reduce((n, l) => n + lettersIn(l), 0)
    expect(letters, `${label} too long for the ink/time budget`).toBeLessThanOrEqual(typesetRules(d).letterCap)
    // The lower case holds enough quads to justify every line the thrifty way.
    const supply = quadSupply(lines, measure, d)
    if (d >= 2) {
      const units = lines.map(l => quadUnits(l, measure))
      expect(supply.em, label).toBeGreaterThanOrEqual(units.reduce((n, u) => n + Math.floor(u / 2), 0))
      expect(supply.en, label).toBeGreaterThanOrEqual(units.filter(u => u % 2).length)
    }
    return lines
  }
  for (const [id, cfg] of Object.entries(TYPESET)) {
    it(`${id} built-in lines`, () => {
      expect(cfg.lines.length).toBe(4)
      for (const d of DIFFS) {
        const lines = checkForme(`${id}@${d}`, cfg, d)
        expect(lines.length, `${id}@${d} line count`).toBeGreaterThanOrEqual(Math.min(d, 3))
      }
    })
  }

  it('every story challenge yields a settable forme at its difficulty and every other', () => {
    for (const ch of storyUses('typeset')) {
      const cfg = resolveConfig(TYPESET, ch.configId, ch.params, 'gutenberg-bible')
      for (const d of DIFFS) checkForme(`${ch.id}@${d}`, cfg, d, TYPESET[ch.configId!] ?? base)
    }
  })

  it('empty or punctuated story lines fall back to something settable', () => {
    expect(buildForme({ lines: ['', '', '', ''] }, 1, base).lines).toEqual(['IN PRINCIPIO'])
    expect(buildForme({ lines: ['', 'ONLY THIS', '', ''] }, 4, base).lines.join(' ')).toBe('ONLY THIS')
    expect(settableLine("Poor Richard's 1733")).toBe('POOR RICHARD S')
  })
})

describe('ArchBuild: every blueprint can be raised under the support rules', () => {
  for (const [id, cfg] of Object.entries(ARCH)) {
    it(id, () => {
      expect(new Set(cfg.plan.map(r => r.length)).size, 'ragged plan').toBe(1)
      expect(isBuildable(cfg.plan), `${id} has blocks that can never be supported`).toBe(true)
    })
  }
  it('detects an unbuildable plan', () => {
    expect(isBuildable(['.#.', '#.#', '###'])).toBe(true)
    expect(isBuildable(['.#...', '#....', '#####'])).toBe(false)
  })
})

// ── Component drives: onWin fires exactly once, onLose on failure, no crash at difficulty 4 ──

type Hooks = { onWin: ReturnType<typeof vi.fn>; onLose: ReturnType<typeof vi.fn> }
function mount(Game: MinigameComponent, configId: string, difficulty: Difficulty, seed = 7, params?: Record<string, unknown>): Hooks {
  const onWin = vi.fn(), onLose = vi.fn()
  render(createElement(Game, { configId, difficulty, seed, params, onWin, onLose }))
  return { onWin, onLose }
}
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('every config renders at every difficulty without throwing', () => {
  const all: [string, MinigameComponent, string[]][] = [
    ['colormix', ColorMixGame, Object.keys(COLORMIX)],
    ['painting', PaintingGame, Object.keys(PAINTING)],
    ['porcelain', PorcelainGame, Object.keys(PORCELAIN)],
    ['cooking', CookingGame, Object.keys(COOKING)],
    ['music', MusicGame, Object.keys(MUSIC)],
    ['compose', ComposeMusicGame, Object.keys(COMPOSE)],
    ['rhythm', RhythmGame, Object.keys(RHYTHM)],
    ['typeset', TypesetGame, Object.keys(TYPESET)],
    ['archbuild', ArchBuildGame, Object.keys(ARCH)],
  ]
  for (const [name, Game, ids] of all) {
    it(name, () => {
      for (const id of ids) for (const d of DIFFS) {
        expect(() => { mount(Game, id, d); cleanup() }, `${name}/${id}@${d}`).not.toThrow()
      }
      // Unknown ids fall back rather than crash (the Lab page mounts with no configId).
      expect(() => { mount(Game, 'no-such-config', 4); cleanup() }).not.toThrow()
    })
  }
})

describe('Painting', () => {
  for (const id of Object.keys(PAINTING)) {
    it(`${id}@4 wins by restoring every item with its pigment, once`, () => {
      const h = mount(PaintingGame, id, 4)
      for (const item of paintingItems(PAINTING[id], 4)) {
        fireEvent.click(screen.getByLabelText(item.pigment.name))
        fireEvent.click(screen.getByText(`Restore with ${item.pigment.name}`))
      }
      tick(2000)
      expect(h.onWin).toHaveBeenCalledTimes(1)
      expect(h.onLose).not.toHaveBeenCalled()
    })
  }
  it('loses once when the misses run out', () => {
    const h = mount(PaintingGame, 'titian-canvas', 4)
    const item = PAINTING['titian-canvas'].items[0]
    const wrong = paintingOptions(item, 4, 7).find(p => p.name !== item.pigment.name)!
    for (let i = 0; i < paintingTier(4).misses; i++) {
      fireEvent.click(screen.getByLabelText(wrong.name))
      fireEvent.click(screen.getByText(`Restore with ${wrong.name}`))
    }
    tick(2000)
    expect(h.onLose).toHaveBeenCalledTimes(1)
    expect(h.onWin).not.toHaveBeenCalled()
  })
})

describe('ColorMix', () => {
  const known: Record<string, Record<string, number>> = {
    'titian-red': { vermilion: 4, lake: 3 },
    'egyptian-blue': { azure: 4, charcoal: 1 },
    'ultramarine-lapis': { lapis: 1, azurite: 1 },
    'woad-blue': { woad: 1 },
  }
  for (const [id, amounts] of Object.entries(known)) {
    it(`${id}@4 wins with a known recipe, once`, () => {
      const cfg = COLORMIX[id]
      const h = mount(ColorMixGame, id, 4)
      const plus = screen.getAllByText('+')
      cfg.pigments.forEach((p, i) => { for (let n = 0; n < (amounts[p.id] ?? 0); n++) fireEvent.click(plus[i]) })
      fireEvent.click(screen.getByText(/Mix Pigments/))
      tick(1000)
      expect(h.onWin).toHaveBeenCalledTimes(1)
      tick(120_000)
      expect(h.onLose).not.toHaveBeenCalled()
    })
  }
  for (const [id, amounts] of Object.entries(known)) {
    it(`${id}: the known recipe matches at every tier's tolerance`, () => {
      const cfg = COLORMIX[id]
      for (const d of DIFFS) expect(colourDist(mixRGB(cfg.pigments, amounts), cfg.target.rgb), `${id}@${d}`).toBeLessThanOrEqual(toleranceAt(cfg, d))
    })
  }
  it('loses on the clock at difficulty 4', () => {
    const h = mount(ColorMixGame, 'titian-red', 4)
    tick(91_000)
    expect(h.onLose).toHaveBeenCalledTimes(1)
  })
  it('loses at difficulty 4 after three failed mixes, once', () => {
    const h = mount(ColorMixGame, 'titian-red', 4)
    const plus = screen.getAllByText('+')
    for (let i = 0; i < 3; i++) {
      fireEvent.click(plus[2])                 // lead white alone is nowhere near Titian red
      fireEvent.click(screen.getByText(/Mix Pigments/))
      tick(1000)
      expect(h.onLose).toHaveBeenCalledTimes(i < 2 ? 0 : 1)
      if (i < 2) fireEvent.click(screen.getByText('Try Again'))
    }
    tick(120_000)
    expect(h.onLose).toHaveBeenCalledTimes(1)
    expect(h.onWin).not.toHaveBeenCalled()
  })
  it('never loses on failed mixes at difficulty 1', () => {
    const h = mount(ColorMixGame, 'titian-red', 1)
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getAllByText('+')[2])
      fireEvent.click(screen.getByText(/Mix Pigments/))
      tick(1000)
      fireEvent.click(screen.getByText('Try Again'))
    }
    expect(h.onLose).not.toHaveBeenCalled()
  })
})

describe('Porcelain', () => {
  const fire = (id: string, pickFor: (target: string) => string) => {
    const cfg = PORCELAIN[id]
    let active: string | null = null
    for (const s of cfg.sections) {
      const sym = pickFor(s.targetElement)
      // Clicking the active element again deselects it, so only switch when needed.
      if (active !== sym) {
        fireEvent.click(screen.getAllByText(sym).map(el => el.closest('button')!).find(b => b?.className.includes('flex-col'))!)
        active = sym
      }
      fireEvent.click(screen.getByText(s.label, { exact: false }))
    }
    fireEvent.click(screen.getByText(/Fire the Kiln/))
  }
  for (const id of Object.keys(PORCELAIN)) {
    it(`${id}@4 wins with the right oxides, once`, () => {
      const h = mount(PorcelainGame, id, 4)
      expect(screen.getAllByText(/· wants /).length).toBe(PORCELAIN[id].sections.length)
      fire(id, t => t)
      tick(1500)
      expect(h.onWin).toHaveBeenCalledTimes(1)
      expect(h.onLose).not.toHaveBeenCalled()
    })
  }
  it('loses at difficulty 4 after two wrong firings, once', () => {
    const cfg = PORCELAIN['cobalt-bowl']
    const h = mount(PorcelainGame, 'cobalt-bowl', 4)
    fire('cobalt-bowl', t => cfg.palette.find(p => p !== t)!)
    tick(1500)
    expect(h.onLose).not.toHaveBeenCalled()
    // D4 says only how many sections are wrong, not which, and no colour key.
    expect(screen.getByText(/sections used the wrong oxide/).textContent).toMatch(/\d+ of \d+ sections/)
    expect(screen.queryByText(/Copper fires green/)).toBeNull()
    fireEvent.click(screen.getByText('Try again'))
    fire('cobalt-bowl', t => cfg.palette.find(p => p !== t)!)
    tick(1500)
    expect(h.onLose).toHaveBeenCalledTimes(1)
    expect(h.onWin).not.toHaveBeenCalled()
  })
  it('a wrong firing teaches the key at difficulty 2, and the next firing can win', () => {
    const cfg = PORCELAIN['cobalt-bowl']
    const h = mount(PorcelainGame, 'cobalt-bowl', 2)
    fire('cobalt-bowl', t => cfg.palette.find(p => p !== t)!)
    tick(1500)
    expect(screen.getByText(/Copper fires green/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Try again'))
    fire('cobalt-bowl', t => t)
    tick(1500)
    expect(h.onWin).toHaveBeenCalledTimes(1)
    expect(h.onLose).not.toHaveBeenCalled()
  })
})

describe('Cooking', () => {
  for (const id of Object.keys(COOKING)) {
    it(`${id}@4 wins in recipe order, once`, () => {
      const h = mount(CookingGame, id, 4)
      for (const step of COOKING[id].steps) fireEvent.click(screen.getByText(step))
      fireEvent.click(screen.getByText(/Follow Recipe/))
      tick(1000)
      expect(h.onWin).toHaveBeenCalledTimes(1)
      expect(h.onLose).not.toHaveBeenCalled()
    })
  }
  it('loses at difficulty 4 after two wrong orders, once', () => {
    const steps = [...COOKING['lu-yu-tea'].steps].reverse()
    const h = mount(CookingGame, 'lu-yu-tea', 4)
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const step of steps) fireEvent.click(screen.getByText(step))
      fireEvent.click(screen.getByText(/Follow Recipe/))
      tick(1000)
      if (attempt === 0) {
        expect(h.onLose).not.toHaveBeenCalled()
        expect(screen.getByText(/steps in place · 1 try left/)).toBeInTheDocument()
        fireEvent.click(screen.getByText('Try again'))
      }
    }
    expect(h.onLose).toHaveBeenCalledTimes(1)
    expect(h.onWin).not.toHaveBeenCalled()
  })
})

describe('Music (no Web Audio in jsdom — the game must still settle)', () => {
  for (const id of Object.keys(MUSIC)) {
    it(`${id}@4 wins when the labels are placed in order, once`, () => {
      const cfg = MUSIC[id]
      const labels = cfg.noteLabels ?? cfg.notes
      const h = mount(MusicGame, id, 4)
      for (const label of labels) {
        // The staff and the tray both show labels; pick the one in the tray (a 12x12 button).
        const btn = screen.getAllByText(label).map(el => el.closest('button')!).find(b => b.className.includes('w-12'))!
        fireEvent.click(btn)
      }
      fireEvent.click(screen.getByText(/Play Melody/))
      tick(10_000)
      expect(h.onWin).toHaveBeenCalledTimes(1)
      expect(h.onLose).not.toHaveBeenCalled()
    })
  }
  it('loses after the attempts run out at difficulty 4', () => {
    const cfg = MUSIC['pentatonic-descend']
    const h = mount(MusicGame, 'pentatonic-descend', 4)
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const label of [...cfg.notes].reverse()) {
        const btn = screen.getAllByText(label).map(el => el.closest('button')!).find(b => b.className.includes('w-12'))!
        fireEvent.click(btn)
      }
      fireEvent.click(screen.getByText(/Play Melody/))
      tick(10_000)
      if (attempt === 0) fireEvent.click(screen.getByText(/Try again/))
    }
    expect(h.onLose).toHaveBeenCalledTimes(1)
    expect(h.onWin).not.toHaveBeenCalled()
  })
})

describe('Compose', () => {
  const titlesInOrder = () => screen.getAllByText('▲').map(b => b.closest('div')!.parentElement!.textContent!)
  for (const id of Object.keys(COMPOSE)) {
    it(`${id}@4 wins once the movements are sorted, once`, () => {
      const cfg = COMPOSE[id]
      const h = mount(ComposeMusicGame, id, 4)
      // Selection sort with the ▲ buttons.
      for (let target = 0; target < cfg.passages.length; target++) {
        for (let guard = 0; guard < 10; guard++) {
          const cur = titlesInOrder().findIndex(t => t.includes(cfg.passages[target].description))
          if (cur === target) break
          fireEvent.click(screen.getAllByText('▲')[cur])
        }
      }
      fireEvent.click(screen.getByText('Check Order'))
      tick(1500)
      expect(h.onWin).toHaveBeenCalledTimes(1)
      expect(h.onLose).not.toHaveBeenCalled()
    })
  }
  it('loses on the second wrong check at difficulty 4, once', () => {
    const cfg = COMPOSE['brahms-lullaby-compose']
    const h = mount(ComposeMusicGame, 'brahms-lullaby-compose', 4)
    const first = titlesInOrder()[0]
    // Make sure the order is wrong: put the last movement on top.
    if (first.includes(cfg.passages[0].description)) {
      const last = cfg.passages.length - 1
      for (let i = 0; i < last; i++) fireEvent.click(screen.getAllByText('▲')[last - i])
    }
    fireEvent.click(screen.getByText('Check Order'))
    tick(2000)
    expect(h.onLose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Check Order'))
    tick(2000)
    expect(h.onLose).toHaveBeenCalledTimes(1)
    expect(h.onWin).not.toHaveBeenCalled()
  })
  it('movement numbers are shown only at difficulty 1', () => {
    expect(unnumbered('III. Allegro (Scherzo)')).toBe('Allegro (Scherzo)')
    expect(unnumbered('Act II — The Furies')).toBe('The Furies')
    expect(unnumbered('Spring — La Primavera')).toBe('Spring — La Primavera')
    mount(ComposeMusicGame, 'beethoven-fifth', 1)
    expect(screen.getByText('I. Allegro con brio')).toBeInTheDocument()
    cleanup()
    mount(ComposeMusicGame, 'beethoven-fifth', 2)
    expect(screen.queryByText('I. Allegro con brio')).toBeNull()
    expect(screen.getByText('Allegro con brio')).toBeInTheDocument()
  })
})

describe('Rhythm', () => {
  // Play the chart by keyboard, each note exactly on its time (or skip some).
  const playThrough = (id: string, d: Difficulty, seed: number, skip: (i: number) => boolean = () => false) => {
    const chart = buildChart(RHYTHM[id], d, seed)
    const h = mount(RhythmGame, id, d, seed)
    fireEvent.click(screen.getByRole('button', { name: /Strike up/ }))
    let elapsed = 0
    chart.notes.forEach((n, i) => {
      const at = LEAD_IN_MS + n.t
      tick(at - elapsed); elapsed = at
      if (!skip(i)) fireEvent.keyDown(window, { key: LANE_KEYS[n.lane] })
    })
    tick(1500)
    return h
  }
  for (const id of Object.keys(RHYTHM)) {
    it(`${id}@4 is won by hitting every note on time, once`, () => {
      const h = playThrough(id, 4, 11)
      expect(h.onWin).toHaveBeenCalledTimes(1)
      expect(h.onLose).not.toHaveBeenCalled()
    })
  }
  it('bach-fugue@1 is won at the easiest tier too', () => {
    const h = playThrough('bach-fugue', 1, 3)
    expect(h.onWin).toHaveBeenCalledTimes(1)
  })
  it('loses at difficulty 4 after four dropped notes', () => {
    const h = playThrough('court-drums', 4, 5, i => i % 3 === 0)
    expect(h.onLose).toHaveBeenCalledTimes(1)
    expect(h.onWin).not.toHaveBeenCalled()
  })
  it('loses when nobody plays', () => {
    const h = mount(RhythmGame, 'hildegard-chant', 1, 2)
    fireEvent.click(screen.getByRole('button', { name: /Strike up/ }))
    tick(120_000); tick(1500)
    expect(h.onLose).toHaveBeenCalledTimes(1)
    expect(h.onWin).not.toHaveBeenCalled()
  })
})

describe('Typeset', () => {
  // Compose every line from the case, quad it out, ink the forme and pull.
  const printForme = (lines: string[], measure: number, d: Difficulty) => {
    for (const line of lines) {
      for (const ch of line) {
        if (ch === ' ') continue
        const btn = screen.getByLabelText(`sort ${ch}`)
        expect(btn, `no free sort for '${ch}'`).not.toBeDisabled()
        fireEvent.click(btn)
      }
      if (d >= 2) {
        let u = quadUnits(line, measure)
        while (u >= 2) { fireEvent.click(screen.getByLabelText('em quad')); u -= 2 }
        if (u) fireEvent.click(screen.getByLabelText('en quad'))
      }
    }
    for (const cell of screen.getAllByTestId('ink-cell')) fireEvent.pointerDown(cell)
    fireEvent.click(screen.getByRole('button', { name: /Pull the bar/ }))
    // Platen down, sheet lifted, outcome reported: each step is armed by the last.
    tick(800); tick(1200); tick(1000)
  }
  for (const id of Object.keys(TYPESET)) {
    for (const d of DIFFS) {
      it(`${id}@${d} is composed, inked and printed, once`, () => {
        const { lines, measure } = buildForme(TYPESET[id], d)
        const h = mount(TypesetGame, id, d)
        printForme(lines, measure, d)
        expect(screen.getByLabelText('printed sheet')).toBeInTheDocument()
        expect(h.onWin).toHaveBeenCalledTimes(1)
        expect(h.onLose).not.toHaveBeenCalled()
        tick(300_000)
        expect(h.onLose).not.toHaveBeenCalled()
      })
    }
  }
  it('a challenge with empty lines still has a forme to set', () => {
    // Was tea-ceremony:0 before the Epic rebalance moved it to another game.
    const ch = { configId: 'bi-sheng-clay', params: { lines: ['', '', '', ''] }, difficulty: 1 as const }
    const { lines, measure } = buildForme(resolveConfig(TYPESET, ch.configId, ch.params, 'gutenberg-bible'), ch.difficulty!, TYPESET[ch.configId!])
    expect(lines).toEqual(['MOVABLE TYPE'])
    const h = mount(TypesetGame, ch.configId!, ch.difficulty!, 1, ch.params)
    printForme(lines, measure, ch.difficulty!)
    expect(h.onWin).toHaveBeenCalledTimes(1)
  })
  it('the press will not pull an under-inked forme', () => {
    const { lines, measure } = buildForme(TYPESET['bi-sheng-clay'], 1)
    const h = mount(TypesetGame, 'bi-sheng-clay', 1)
    for (const ch of lines[0]) if (ch !== ' ') fireEvent.click(screen.getByLabelText(`sort ${ch}`))
    void measure
    fireEvent.pointerDown(screen.getAllByTestId('ink-cell')[0])
    expect(screen.getByRole('button', { name: /to pull/ })).toBeDisabled()
    tick(3000)
    expect(h.onWin).not.toHaveBeenCalled()
  })
  it('loses when the ink runs out at difficulty 4', () => {
    const { lines } = buildForme(TYPESET['franklin-gazette'], 4)
    const h = mount(TypesetGame, 'franklin-gazette', 4)
    const wrong = lines[0][0] === 'Q' ? 'X' : 'Q'
    for (let i = 0; i < 3; i++) { fireEvent.click(screen.getByLabelText(`sort ${wrong}`)); tick(500) }
    tick(1500)
    expect(h.onLose).toHaveBeenCalledTimes(1)
    expect(h.onWin).not.toHaveBeenCalled()
  })
  it('an overflowing quad or a lowercase sort spoils ink', () => {
    const { lines, measure } = buildForme(TYPESET['gutenberg-bible'], 3)
    mount(TypesetGame, 'gutenberg-bible', 3)
    fireEvent.click(screen.getAllByLabelText(/^lowercase sort/)[0])
    expect(screen.getByLabelText('ink left').textContent).toContain('●●●○')
    for (const ch of lines[0]) if (ch !== ' ') fireEvent.click(screen.getByLabelText(`sort ${ch}`))
    let u = quadUnits(lines[0], measure)
    while (u >= 2) { fireEvent.click(screen.getByLabelText('em quad')); u -= 2 }
    if (u === 1) {
      fireEvent.click(screen.getByLabelText('em quad'))      // will not fit in one en
      expect(screen.getByLabelText('ink left').textContent).toContain('●●○○')
    }
  })
})

describe('ArchBuild', () => {
  const cellButtons = () => screen.getAllByRole('button')
  // Grid buttons are laid out top row first; convert bottom-up (r, c) to that index.
  const idx = (rows: number, cols: number, r: number, c: number) => (rows - 1 - r) * cols + c
  for (const id of Object.keys(ARCH)) {
    it(`${id}@4 stands when raised course by course, once`, () => {
      const plan = [...ARCH[id].plan].reverse()
      const rows = plan.length, cols = plan[0].length
      const h = mount(ArchBuildGame, id, 4)
      for (let r = 0; r < rows; r++) {
        // Springers before keystones within a course.
        for (const pass of ['#', 'K']) for (let c = 0; c < cols; c++) {
          if (plan[r][c] === pass) fireEvent.click(cellButtons()[idx(rows, cols, r, c)])
        }
      }
      tick(1500)
      expect(h.onWin).toHaveBeenCalledTimes(1)
      expect(h.onLose).not.toHaveBeenCalled()
    })
  }
  it('loses at difficulty 4 after two unsupported blocks', () => {
    const plan = [...ARCH['imhotep-step'].plan].reverse()
    const rows = plan.length, cols = plan[0].length
    const h = mount(ArchBuildGame, 'imhotep-step', 4)
    const b = cellButtons()
    fireEvent.click(b[idx(rows, cols, 1, 2)])   // nothing beneath yet
    fireEvent.click(b[idx(rows, cols, 1, 3)])
    tick(1500)
    expect(h.onLose).toHaveBeenCalledTimes(1)
    expect(within(document.body).getByText(/cannot be finished/)).toBeInTheDocument()
  })
})
