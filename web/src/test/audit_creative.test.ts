// Audit of the Creative minigames: every hand-authored config must be
// winnable with the tools it offers, at every difficulty story data uses,
// and the win / lose handlers must fire exactly once.
import { createElement } from 'react'
import { render, screen, act, fireEvent, cleanup, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import storyChallenges from '@/data/story_challenges.json'
import type { Challenge, Difficulty, MinigameChallenge, MinigameComponent } from '@/games/types'
import { mulberry32, resolveConfig } from '@/components/minigames/_shared'

import ColorMixGame, { CONFIGS as COLORMIX, mixRGB, colourDist } from '@/components/minigames/ColorMixGame'
import PaintingGame, { CONFIGS as PAINTING } from '@/components/minigames/PaintingGame'
import PorcelainGame, { CONFIGS as PORCELAIN, ELEMENT_COLORS, FIRED_HINT } from '@/components/minigames/PorcelainGame'
import CookingGame, { CONFIGS as COOKING } from '@/components/minigames/CookingGame'
import MusicGame, { CONFIGS as MUSIC } from '@/components/minigames/MusicGame'
import ComposeMusicGame, { CONFIGS as COMPOSE } from '@/components/minigames/ComposeMusicGame'
import RhythmGame, { CONFIGS as RHYTHM } from '@/components/minigames/RhythmGame'
import TypesetGame, { CONFIGS as TYPESET, MIRROR, pickLine, settableLine } from '@/components/minigames/TypesetGame'
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

describe('Painting: every region can be painted its target colour', () => {
  const FULL_RECT = /<rect x="0" y="0" width="280" height="200"/
  for (const [id, cfg] of Object.entries(PAINTING)) {
    it(`${id}: palette covers every target and no region is hidden under a later full-canvas region`, () => {
      const palette = new Set(cfg.palette.map(p => p.color))
      for (const r of cfg.regions) expect(palette.has(r.targetColor), `${id}/${r.id}`).toBe(true)
      expect(new Set(cfg.regions.map(r => r.id)).size).toBe(cfg.regions.length)
      // A full-canvas rect drawn after another region makes that region unclickable on the canvas.
      cfg.regions.forEach((r, i) => {
        if (FULL_RECT.test(r.svgShape)) expect(i, `${id}/${r.id} covers earlier regions`).toBe(0)
      })
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

describe('Rhythm: pads and tones line up', () => {
  for (const [id, cfg] of Object.entries(RHYTHM)) {
    it(id, () => {
      expect(cfg.pads.length).toBeGreaterThanOrEqual(4)
      if (cfg.tones) expect(cfg.tones.length).toBe(cfg.pads.length)
    })
  }
  it('story params only override title/intro, never pads', () => {
    for (const ch of storyUses('rhythm')) {
      expect(RHYTHM[ch.configId!], ch.id).toBeDefined()
      const keys = Object.keys(ch.params ?? {})
      expect(keys.every(k => k === 'title' || k === 'intro'), `${ch.id} params ${keys}`).toBe(true)
    }
  })
})

describe('Typeset: every line the player is asked to set can be set', () => {
  const base = TYPESET['gutenberg-bible']
  for (const [id, cfg] of Object.entries(TYPESET)) {
    it(`${id} built-in lines`, () => {
      expect(cfg.lines.length).toBe(4)
      for (const d of DIFFS) {
        const line = pickLine(cfg, d, base)
        expect(line.length).toBeGreaterThan(0)
        for (const ch of line) if (ch !== ' ') expect(MIRROR[ch], `${id} '${ch}'`).toBeDefined()
      }
    })
  }

  it('every story challenge yields a non-empty settable line of ≤ 24 letters', () => {
    for (const ch of storyUses('typeset')) {
      const cfg = resolveConfig(TYPESET, ch.configId, ch.params, 'gutenberg-bible')
      const line = pickLine(cfg, ch.difficulty ?? 1, TYPESET[ch.configId!] ?? base)
      expect(line, ch.id).toMatch(/^[A-Z][A-Z ]*$/)
      const letters = line.replace(/ /g, '').length
      expect(letters, `${ch.id} letters`).toBeGreaterThan(0)
      expect(letters, `${ch.id} too long for the ink/time budget`).toBeLessThanOrEqual(24)
    }
  })

  it('empty or punctuated story lines fall back to something settable', () => {
    expect(pickLine({ ...base, lines: ['', '', '', ''] }, 1, base)).toBe('IN PRINCIPIO')
    expect(pickLine({ ...base, lines: ['', 'ONLY THIS', '', ''] }, 4, base)).toBe('ONLY THIS')
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
    it(`${id}@4 wins via the region buttons, once`, () => {
      const cfg = PAINTING[id]
      const h = mount(PaintingGame, id, 4)
      for (const r of cfg.regions) {
        fireEvent.click(screen.getByTitle(cfg.palette.find(p => p.color === r.targetColor)!.name))
        fireEvent.click(screen.getAllByText(r.label).map(el => el.closest('button')!).find(b => b?.className.includes('px-2.5'))!)
      }
      tick(2000)
      expect(h.onWin).toHaveBeenCalledTimes(1)
      tick(120_000)   // the clock must not fire lose after the win
      expect(h.onLose).not.toHaveBeenCalled()
      expect(h.onWin).toHaveBeenCalledTimes(1)
    })
  }
  it('loses when the clock runs out at difficulty 4', () => {
    const h = mount(PaintingGame, 'titian-canvas', 4)
    tick(91_000)
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
  it('loses on the clock at difficulty 4', () => {
    const h = mount(ColorMixGame, 'titian-red', 4)
    tick(91_000)
    expect(h.onLose).toHaveBeenCalledTimes(1)
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
  it('loses at difficulty 4 on a single wrong oxide', () => {
    const cfg = PORCELAIN['cobalt-bowl']
    const h = mount(PorcelainGame, 'cobalt-bowl', 4)
    fire('cobalt-bowl', t => cfg.palette.find(p => p !== t)!)
    tick(1500)
    expect(h.onLose).toHaveBeenCalledTimes(1)
    expect(h.onWin).not.toHaveBeenCalled()
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
  it('loses at difficulty 4 after one wrong order', () => {
    const steps = [...COOKING['lu-yu-tea'].steps].reverse()
    const h = mount(CookingGame, 'lu-yu-tea', 4)
    for (const step of steps) fireEvent.click(screen.getByText(step))
    fireEvent.click(screen.getByText(/Follow Recipe/))
    tick(1000)
    expect(h.onLose).toHaveBeenCalledTimes(1)
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
          const cur = titlesInOrder().findIndex(t => t.includes(cfg.passages[target].title))
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
  it('loses on the first wrong check at difficulty 4', () => {
    const cfg = COMPOSE['brahms-lullaby-compose']
    const h = mount(ComposeMusicGame, 'brahms-lullaby-compose', 4)
    const first = titlesInOrder()[0]
    // Make sure the order is wrong: put the last movement on top.
    if (first.includes(cfg.passages[0].title)) {
      const last = cfg.passages.length - 1
      for (let i = 0; i < last; i++) fireEvent.click(screen.getAllByText('▲')[last - i])
    }
    fireEvent.click(screen.getByText('Check Order'))
    tick(2000)
    expect(h.onLose).toHaveBeenCalledTimes(1)
    expect(h.onWin).not.toHaveBeenCalled()
  })
})

describe('Rhythm', () => {
  const playThrough = (id: string, d: Difficulty, seed: number, wrongAt?: number) => {
    const cfg = RHYTHM[id]
    const rounds = [4, 6, 7, 8][d - 1]
    const padCount = Math.min(cfg.pads.length, [4, 5, 6, 6][d - 1])
    const rng = mulberry32(seed)
    const sequence = Array.from({ length: rounds + 2 }, () => Math.floor(rng() * padCount))
    const h = mount(RhythmGame, id, d, seed)
    const pads = () => screen.getAllByRole('button').slice(0, padCount)
    for (let round = 1; round <= rounds; round++) {
      tick(400 + round * 600 + 300)       // listen phase at the slowest tempo
      expect(screen.getByText(/Your turn/)).toBeInTheDocument()
      for (let i = 0; i < round; i++) {
        const want = round === wrongAt && i === 0 ? (sequence[i] + 1) % padCount : sequence[i]
        fireEvent.pointerDown(pads()[want])
        if (round === wrongAt && i === 0) return h
      }
      tick(800)
    }
    return h
  }
  for (const id of Object.keys(RHYTHM)) {
    it(`${id}@4 is won by echoing the phrase, once`, () => {
      const h = playThrough(id, 4, 11)
      tick(1500)
      expect(h.onWin).toHaveBeenCalledTimes(1)
      expect(h.onLose).not.toHaveBeenCalled()
    })
  }
  it('bach-fugue@1 is won at the easiest tier too', () => {
    const h = playThrough('bach-fugue', 1, 3)
    tick(1500)
    expect(h.onWin).toHaveBeenCalledTimes(1)
  })
  it('loses at difficulty 4 on the first miss', () => {
    const h = playThrough('court-drums', 4, 5, 2)
    tick(1500)
    expect(h.onLose).toHaveBeenCalledTimes(1)
    expect(h.onWin).not.toHaveBeenCalled()
  })
})

describe('Typeset', () => {
  const setLine = (line: string) => {
    for (const ch of line) {
      if (ch === ' ') continue
      const glyph = MIRROR[ch]
      const btn = screen.getAllByRole('button').find(b => b.textContent === glyph && !b.hasAttribute('disabled'))!
      expect(btn, `no free sort for '${ch}'`).toBeDefined()
      fireEvent.click(btn)
    }
  }
  for (const id of Object.keys(TYPESET)) {
    it(`${id}@4 is set from the case, once`, () => {
      const line = pickLine(TYPESET[id], 4, TYPESET['gutenberg-bible'])
      const h = mount(TypesetGame, id, 4)
      setLine(line)
      tick(1500)
      expect(h.onWin).toHaveBeenCalledTimes(1)
      expect(h.onLose).not.toHaveBeenCalled()
    })
  }
  it('story challenge with empty lines (tea-ceremony) still has a line to set', () => {
    const ch = storyUses('typeset').find(c => c.id === 'tea-ceremony:0')!
    const h = mount(TypesetGame, ch.configId!, ch.difficulty!, 1, ch.params)
    const line = pickLine(resolveConfig(TYPESET, ch.configId, ch.params, 'gutenberg-bible'), ch.difficulty!, TYPESET[ch.configId!])
    expect(line).toBe('MOVABLE TYPE')
    setLine(line)
    tick(1500)
    expect(h.onWin).toHaveBeenCalledTimes(1)
  })
  it('loses when the ink runs out at difficulty 4', () => {
    const line = pickLine(TYPESET['franklin-gazette'], 4, TYPESET['gutenberg-bible'])
    const h = mount(TypesetGame, 'franklin-gazette', 4)
    const first = line[0]
    for (let i = 0; i < 2; i++) {
      const wrong = screen.getAllByRole('button').find(b => b.textContent && b.textContent !== MIRROR[first] && b.textContent.length === 1 && !b.hasAttribute('disabled'))!
      fireEvent.click(wrong)
      tick(500)
    }
    tick(1500)
    expect(h.onLose).toHaveBeenCalledTimes(1)
    expect(h.onWin).not.toHaveBeenCalled()
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
