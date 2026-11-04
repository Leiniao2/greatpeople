// The full-forme Typeset game: every config and story challenge composes a
// forme the case can supply, the lower case can justify, and the press can
// print — at every difficulty.
import { createElement } from 'react'
import { render, screen, act, fireEvent, cleanup, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import storyChallenges from '@/data/story_challenges.json'
import type { Challenge, Difficulty, MinigameChallenge } from '@/games/types'
import { resolveConfig } from '@/components/minigames/_shared'
import TypesetGame, {
  CONFIGS, buildForme, buildCase, quadSupply, quadUnits, lineUnits, thriftyQuads, typesetRules, lettersIn, UPPER_CASE_LAYOUT,
} from '@/components/minigames/TypesetGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const uses = (storyChallenges as { challenges: Challenge[] }[]).flatMap(e => e.challenges)
  .filter((c): c is MinigameChallenge => c.type === 'minigame' && c.game === 'typeset')

const sources = [
  ...Object.entries(CONFIGS).map(([id, cfg]) => ({ label: id, configId: id, params: undefined as Record<string, unknown> | undefined, cfg })),
  ...uses.map(ch => ({ label: ch.id!, configId: ch.configId!, params: ch.params, cfg: resolveConfig(CONFIGS, ch.configId, ch.params, 'gutenberg-bible') })),
]

describe('Typeset formes', () => {
  it('Epic uses typeset at most 4 times', () => { expect(uses.length).toBeGreaterThan(0); expect(uses.length).toBeLessThanOrEqual(4) })

  for (const src of sources) {
    it(`${src.label}: completable forme at every difficulty`, () => {
      const fallback = CONFIGS[src.configId] ?? CONFIGS['gutenberg-bible']
      for (const d of DIFFS) {
        const { lines, measure } = buildForme(src.cfg, d, fallback)
        const r = typesetRules(d)
        expect(lines.length).toBeGreaterThanOrEqual(1)
        expect(lines.length).toBeLessThanOrEqual(r.lines)
        expect(lines.reduce((n, l) => n + lettersIn(l), 0)).toBeLessThanOrEqual(r.letterCap)
        for (const l of lines) {
          expect(l).toMatch(/^[A-Z]+( [A-Z]+)*$/)
          expect(lineUnits(l)).toBeLessThanOrEqual(2 * measure)
        }
        for (const seed of [1, 2, 3, 99]) {
          const tcase = buildCase(lines, d, seed)
          for (const [ch, n] of Object.entries(tcase.need)) {
            expect(tcase.upper.find(c => c.ch === ch)!.count, `${src.label}@${d} ${ch}`).toBeGreaterThanOrEqual(n)
          }
          expect(tcase.upper.map(c => c.ch).sort()).toEqual([...UPPER_CASE_LAYOUT].sort())
          for (const lc of tcase.lower) expect(lc).toMatch(/^[a-z]$/)
        }
        const supply = quadSupply(lines, measure, d)
        if (r.justify) {
          const fills = lines.map(l => thriftyQuads(quadUnits(l, measure)))
          expect(supply.em).toBeGreaterThanOrEqual(fills.reduce((n, f) => n + f.em, 0))
          expect(supply.en).toBeGreaterThanOrEqual(fills.reduce((n, f) => n + f.en, 0))
        }
      }
    })
  }

  it('lines grow with difficulty and a single phrase is split across lines', () => {
    expect(buildForme(CONFIGS['gutenberg-bible'], 1).lines).toEqual(['IN PRINCIPIO'])
    expect(buildForme(CONFIGS['gutenberg-bible'], 4).lines).toEqual(['IN PRINCIPIO', 'ERAT VERBUM', 'ET VERBUM ERAT', 'APUD DEUM'])
    expect(buildForme(CONFIGS['franklin-gazette'], 2).lines).toEqual(['JOIN OR DIE', 'TIME IS MONEY'])
    const titian = { lines: ['TITIAN', 'TITIAN CONTINUED', 'TITIAN CONTINUED', 'TITIAN CONTINUED'] }
    expect(buildForme(titian, 2).lines).toEqual(['TITIAN', 'CONTINUED'])
    const enkidu = { lines: ['ENKIDU ROAMS', 'ENKIDU ROAMS THE', 'ENKIDU ROAMS THE', 'ENKIDU ROAMS THE STEPPE'] }
    expect(buildForme(enkidu, 1).lines).toEqual(['ENKIDU ROAMS'])
    expect(buildForme(enkidu, 3).lines.join(' ')).toBe('ENKIDU ROAMS THE STEPPE')
    expect(buildForme({ lines: ['TENOCHTITLAN', 'TENOCHTITLAN', '', ''] }, 4).lines).toEqual(['TENOCHTITLAN'])
    expect(buildForme({ lines: 'nonsense' as unknown as string[] }, 2, CONFIGS['bi-sheng-clay']).lines[0]).toBe('MOVABLE TYPE')
  })

  it('the case is deterministic per seed; the pied case at Legacy reshuffles', () => {
    const { lines } = buildForme(CONFIGS['franklin-gazette'], 4)
    expect(buildCase(lines, 4, 5)).toEqual(buildCase(lines, 4, 5))
    expect(buildCase(lines, 4, 5).upper.map(c => c.ch)).not.toEqual(buildCase(lines, 4, 6).upper.map(c => c.ch))
    expect(buildCase(lines, 2, 5).upper.map(c => c.ch)).toEqual(UPPER_CASE_LAYOUT)
    expect(buildCase(lines, 2, 5).lower).toEqual([])
    expect(buildCase(lines, 3, 5).lower.length).toBeGreaterThan(0)
  })
})

describe('Typeset component', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { cleanup(); vi.useRealTimers() })
  const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

  const play = (configId: string, d: Difficulty, params?: Record<string, unknown>, seed = 3) => {
    const cfg = resolveConfig(CONFIGS, configId, params, 'gutenberg-bible')
    const { lines, measure } = buildForme(cfg, d, CONFIGS[configId] ?? CONFIGS['gutenberg-bible'])
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(TypesetGame, { configId, difficulty: d, seed, params, onWin, onLose }))
    for (const line of lines) {
      for (const ch of line) if (ch !== ' ') fireEvent.click(screen.getByLabelText(`sort ${ch}`))
      if (d >= 2) {
        // Quad out the thrifty way: ems, then an en for an odd remainder.
        let u = quadUnits(line, measure)
        while (u >= 2) { fireEvent.click(screen.getByLabelText('em quad')); u -= 2 }
        if (u) fireEvent.click(screen.getByLabelText('en quad'))
      }
    }
    for (const cell of screen.getAllByTestId('ink-cell')) fireEvent.pointerDown(cell)
    fireEvent.click(screen.getByRole('button', { name: /Pull the bar/ }))
    tick(800); tick(1200); tick(1000)
    return { onWin, onLose, lines }
  }

  for (const ch of uses) {
    for (const d of [ch.difficulty ?? 1, 4] as Difficulty[]) {
      it(`${ch.id}@${d} prints`, () => {
        const h = play(ch.configId!, d, ch.params)
        expect(h.onWin).toHaveBeenCalledTimes(1)
        expect(h.onLose).not.toHaveBeenCalled()
        const sheet = screen.getByLabelText('printed sheet')
        expect(sheet.textContent!.replace(/ /g, ' ')).toContain(h.lines[0])
      })
    }
  }

  it('the stick fills right to left with mirrored sorts', () => {
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(TypesetGame, { configId: 'franklin-gazette', difficulty: 1, seed: 1, onWin, onLose }))
    fireEvent.click(screen.getByLabelText('sort J'))
    const row = screen.getByLabelText('forme line 1')
    expect(row.className).toContain('flex-row-reverse')
    const first = row.children[0] as HTMLElement
    expect(first.textContent).toBe('J')
    expect(within(first).getByText('J').className).toContain('-scale-x-100')
  })

  it('a wrong sort costs ink and does not advance; the last sort can be pulled back', () => {
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(TypesetGame, { configId: 'franklin-gazette', difficulty: 2, seed: 1, onWin, onLose }))
    fireEvent.click(screen.getByLabelText('sort Q'))
    expect(screen.getByLabelText('ink left').textContent).toBe('Ink ●●●●○')
    fireEvent.click(screen.getByLabelText('sort J'))
    fireEvent.click(screen.getByText('Pull last sort'))
    expect((screen.getByLabelText('forme line 1').children[0] as HTMLElement).textContent).toBe('')
  })

  it('the clock runs at Mastery and Legacy only, and expiry loses', () => {
    for (const d of [1, 2] as Difficulty[]) {
      const onWin = vi.fn(), onLose = vi.fn()
      render(createElement(TypesetGame, { configId: 'bi-sheng-clay', difficulty: d, seed: 1, onWin, onLose }))
      tick(400_000); tick(1500)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(TypesetGame, { configId: 'bi-sheng-clay', difficulty: 3, seed: 1, onWin, onLose }))
    tick(typesetRules(3).seconds * 1000 + 100); tick(1500)
    expect(onLose).toHaveBeenCalledTimes(1)
  })
})
