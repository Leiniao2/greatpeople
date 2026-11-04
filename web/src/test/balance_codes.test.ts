// Difficulty balance for the "codes" group: codebook readers, cipher,
// decode, pseudo code, logic gates, pipeline, mirror, Lorentz and Punnett.
// Each tier must be winnable inside its clock / caps, and get harder D1 → D4.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Difficulty } from '@/games/types'
import { CODEBOOKS, codebookSeconds, cleanMessage } from '@/components/minigames/CodebookGame'
import CipherGame, { CONFIGS as CIPHERS, cipherTier } from '@/components/minigames/CipherGame'
import { mulberry32 } from '@/components/minigames/_shared'
import { CONFIGS as DECODES, DECODE_REVEALS, DECODE_TIME_LIMITS, makeCipher, revealedLetters } from '@/components/minigames/DecodeGame'
import { PSEUDO_ATTEMPTS } from '@/components/minigames/PseudoCodeGame'
import { OPEN_SLOTS, MAX_CHECKS, TIME_LIMIT } from '@/components/minigames/LogicGateGame'
import { PIPELINE_TIME_LIMITS } from '@/components/minigames/PipelineGame'
import { CONFIGS as MIRRORS, MIRROR_TIME_LIMITS } from '@/components/minigames/MirrorGame'
import { LORENTZ_CRASHES } from '@/components/minigames/LorentzGame'
import PunnettGame, { CONFIGS as PUNNETTS, PUNNETT_MISTAKES, PUNNETT_TIME_LIMITS, cellAnswer, getOptions } from '@/components/minigames/PunnettGame'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const READ_SECONDS = 15

/** Timed tiers only, as a list that must not increase. */
const nonIncreasing = (xs: readonly number[]) => xs.every((x, i) => i === 0 || x <= xs[i - 1])
const timed = (xs: readonly number[]) => xs.filter(Boolean)

describe('codebook readers', () => {
  for (const [key, mod] of Object.entries(CODEBOOKS)) {
    if (!mod.pace) continue  // scytale: one dial, not a letter-by-letter read
    const pace = mod.pace
    for (const [id, cfg] of Object.entries(mod.CONFIGS)) {
      it(`${key}/${id}: clock leaves 1.5× a competent read, tightens with the tier, and play stays under 3 min`, () => {
        const n = cleanMessage(cfg.plaintext).replace(/ /g, '').length
        const limits = DIFFS.map(d => codebookSeconds(pace, d, n))
        expect(limits[0]).toBe(0)
        expect(nonIncreasing(timed(limits)), `${limits}`).toBe(true)
        for (const d of [2, 3, 4] as Difficulty[]) {
          const solve = READ_SECONDS + n * pace[d >= 3 ? 1 : 0]
          expect(codebookSeconds(pace, d, n), `D${d}`).toBeGreaterThanOrEqual(1.5 * solve)
          expect(solve, `D${d} expected play`).toBeLessThanOrEqual(180)
        }
      })
    }
  }
})

describe('cipher tiers', () => {
  for (const [id, cfg] of Object.entries(CIPHERS)) {
    it(`${id}: caps and clock tighten monotonically, and morse keeps its card`, () => {
      const tiers = DIFFS.map(d => cipherTier(cfg.mode, d, cfg.plaintext))
      expect(nonIncreasing(tiers.map(t => t.maxAttempts))).toBe(true)
      expect(tiers[3].maxAttempts).toBeGreaterThanOrEqual(2)
      expect(nonIncreasing(timed(tiers.map(t => t.timeLimit)))).toBe(true)
      if (cfg.mode === 'morse') {
        expect(tiers.every(t => t.showHints)).toBe(true)
        const letters = cfg.plaintext.replace(/[^A-Za-z]/g, '').length
        // About 5 s a letter to look up, key and send.
        for (const t of tiers) if (t.timeLimit) expect(t.timeLimit).toBeGreaterThanOrEqual(1.5 * (READ_SECONDS + letters * 5))
      }
    })
  }
})

describe('decode tiers', () => {
  it('reveals shrink and clocks tighten with the tier', () => {
    expect(nonIncreasing(DECODE_REVEALS)).toBe(true)
    expect(DECODE_REVEALS[3]).toBe(0)
    expect(DECODE_TIME_LIMITS[0]).toBe(0)
    expect(nonIncreasing(timed(DECODE_TIME_LIMITS))).toBe(true)
  })
  for (const [id, cfg] of Object.entries(DECODES)) {
    it(`${id}: the given letters are real cipher letters and never the whole message`, () => {
      const cipher = makeCipher(id)
      const ct = cfg.plaintext.toUpperCase().split('').map(c => c === ' ' ? ' ' : cipher[c]).join('')
      const unique = new Set(ct.replace(/ /g, '')).size
      for (const d of DIFFS) {
        const shown = revealedLetters(ct, DECODE_REVEALS[d - 1])
        expect(shown).toHaveLength(DECODE_REVEALS[d - 1])
        for (const c of shown) expect(ct).toContain(c)
        expect(unique - shown.length, `${id} D${d} leaves something to decode`).toBeGreaterThanOrEqual(5)
      }
    })
  }
})

describe('caps and clocks rise monotonically', () => {
  it('pseudo code: never one-strike, fewer checks each tier', () => {
    expect(PSEUDO_ATTEMPTS.every((x, i) => i === 0 || x < PSEUDO_ATTEMPTS[i - 1])).toBe(true)
    expect(PSEUDO_ATTEMPTS[3]).toBeGreaterThanOrEqual(2)
  })
  it('logic gates: open slots grow, checks shrink, clock ≤ 5 min', () => {
    expect(DIFFS.map(OPEN_SLOTS).every((x, i, a) => i === 0 || x >= a[i - 1])).toBe(true)
    expect(nonIncreasing(DIFFS.map(MAX_CHECKS))).toBe(true)
    expect(nonIncreasing(timed(DIFFS.map(TIME_LIMIT)))).toBe(true)
    for (const d of DIFFS) expect(TIME_LIMIT(d)).toBeLessThanOrEqual(300)
  })
  it('pipeline and mirror clocks', () => {
    expect(nonIncreasing(timed(PIPELINE_TIME_LIMITS))).toBe(true)
    expect(nonIncreasing(timed(MIRROR_TIME_LIMITS))).toBe(true)
    expect(PIPELINE_TIME_LIMITS[3]).toBeGreaterThanOrEqual(90)
    expect(MIRROR_TIME_LIMITS[3]).toBeGreaterThanOrEqual(60)
  })
  it('mirror boards fit a 390 px phone', () => {
    for (const cfg of Object.values(MIRRORS)) {
      const cell = Math.min(56, Math.floor(340 / (cfg.gridSize + 2)))
      expect((cfg.gridSize + 2) * cell).toBeLessThanOrEqual(340)
      expect(cell).toBeGreaterThanOrEqual(30)
    }
  })
  it('lorentz: unlimited at D1, at least three flights at D4', () => {
    expect(LORENTZ_CRASHES[0]).toBe(0)
    const capped = LORENTZ_CRASHES.slice(1)
    expect(capped.every((x, i) => i === 0 || x < capped[i - 1])).toBe(true)
    expect(LORENTZ_CRASHES[3]).toBeGreaterThanOrEqual(3)
  })
  it('punnett: fewer mistakes each tier, clock covers twelve cells', () => {
    expect(PUNNETT_MISTAKES.every((x, i) => i === 0 || x < PUNNETT_MISTAKES[i - 1])).toBe(true)
    expect(PUNNETT_MISTAKES[3]).toBeGreaterThanOrEqual(2)
    for (const t of timed(PUNNETT_TIME_LIMITS)) expect(t).toBeGreaterThanOrEqual(1.5 * (READ_SECONDS + 12 * 3))
  })
})

describe('Punnett plays through', () => {
  const props = (configId: string, difficulty: Difficulty, onWin: () => void, onLose: () => void) =>
    ({ configId, difficulty, seed: 1, onWin, onLose }) as never

  it('filling every square correctly wins once at every tier', () => {
    vi.useFakeTimers()
    for (const [id, cfg] of Object.entries(PUNNETTS)) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { unmount } = render(createElement(PunnettGame, props(id, d, onWin, onLose)))
      cfg.crosses.forEach((cross, ci) => {
        for (let i = 0; i < 4; i++) {
          fireEvent.click(screen.getAllByRole('button', { name: '?' })[0])
          // The first open cell is the lowest index still unfilled, i.e. cell i.
          // Filled cells are buttons too; the option picker comes last.
          const opts = screen.getAllByRole('button', { name: cellAnswer(cross, Math.floor(i / 2), i % 2) })
          fireEvent.click(opts[opts.length - 1])
        }
        if (ci + 1 < cfg.crosses.length) fireEvent.click(screen.getByText('Next Cross →'))
      })
      act(() => { vi.advanceTimersByTime(1500) })
      expect(onWin, `${id} D${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('wrong picks up to the cap lose once', () => {
    for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const cross = PUNNETTS['mendel-peas'].crosses[0]
      const wrong = getOptions(cross).find(o => o !== cellAnswer(cross, 0, 0))!
      const { unmount } = render(createElement(PunnettGame, props('mendel-peas', d, onWin, onLose)))
      for (let k = 0; k < PUNNETT_MISTAKES[d - 1] + 1; k++) {
        const cells = screen.queryAllByRole('button', { name: /^[?✕]$/ })
        if (!cells.length) break
        fireEvent.click(cells[0])
        const opts = screen.queryAllByRole('button', { name: wrong })
        if (opts.length) fireEvent.click(opts[opts.length - 1])
      }
      expect(onLose, `D${d}`).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })
})

// ── Blind check at D3–D4: scytale rod and Caesar wheel ───────────────────────

describe('blind checks from tier 3', () => {
  const props = (configId: string, difficulty: Difficulty, seed: number, onWin: () => void, onLose: () => void) =>
    ({ configId, difficulty, seed, onWin, onLose }) as never
  const plus = () => screen.getAllByRole('button', { name: '+' })[0]

  const rodFor = (plaintext: string, seed: number) => {
    const n = cleanMessage(plaintext).replace(/ /g, '').length
    const options = [3, 4, 5, 6].filter(r => n / r >= 3)
    return options[Math.floor(mulberry32(seed)() * options.length)] ?? 3
  }

  it('scytale: live at D1–D2, hidden until checked at D3–D4, and the right rod wins', () => {
    vi.useFakeTimers()
    const Scytale = CODEBOOKS.scytale.default
    for (const [id, cfg] of Object.entries(CODEBOOKS.scytale.CONFIGS)) for (const d of DIFFS) {
      const seed = 7
      const onWin = vi.fn(), onLose = vi.fn()
      const { unmount } = render(createElement(Scytale, props(id, d, seed, onWin, onLose)))
      expect(!!screen.queryByTestId('scytale-hidden'), `${id} D${d}`).toBe(d >= 3)
      const rows = rodFor(cfg.plaintext, seed)
      for (let g = 2; g < rows; g++) fireEvent.click(plus())
      fireEvent.click(screen.getByRole('button', { name: d >= 3 ? 'Check this rod' : 'Read the message' }))
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} D${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('scytale D4: a wrong check shows that rod, counts, and the cap loses', () => {
    vi.useFakeTimers()
    const Scytale = CODEBOOKS.scytale.default
    const id = 'spartan-rod', seed = 7
    const rows = rodFor(CODEBOOKS.scytale.CONFIGS[id].plaintext, seed)
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(Scytale, props(id, 4, seed, onWin, onLose)))
    let guess = 2
    for (let k = 0; k < 2; k++) {
      if (guess === rows) { fireEvent.click(plus()); guess++ }
      fireEvent.click(screen.getByRole('button', { name: 'Check this rod' }))
      if (k === 0) {
        expect(screen.queryByTestId('scytale-hidden')).toBeNull()
        expect(screen.getByText('✗ 1 / 2')).toBeTruthy()
      }
      fireEvent.click(plus()); guess++
    }
    act(() => { vi.advanceTimersByTime(1000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('caesar: live at D1–D2, hidden until checked at D3–D4, and the right shift wins', () => {
    vi.useFakeTimers()
    for (const [id, cfg] of Object.entries(CIPHERS)) {
      if (cfg.mode !== 'caesar') continue
      for (const d of DIFFS) {
        const seed = 11
        const shift = 1 + Math.floor(mulberry32(seed)() * 25)
        const onWin = vi.fn(), onLose = vi.fn()
        const { unmount } = render(createElement(CipherGame, props(id, d, seed, onWin, onLose)))
        const reading = () => screen.getByTestId('caesar-reading').textContent ?? ''
        expect(reading().includes('Work out the shift'), `${id} D${d}`).toBe(d >= 3)
        for (let g = 0; g < shift; g++) fireEvent.click(plus())
        fireEvent.click(screen.getByRole('button', { name: d >= 3 ? 'Check this shift' : 'Read the message' }))
        expect(reading()).toBe(cfg.plaintext.toUpperCase())
        act(() => { vi.advanceTimersByTime(1000) })
        expect(onWin, `${id} D${d}`).toHaveBeenCalledTimes(1)
        expect(onLose).not.toHaveBeenCalled()
        unmount()
      }
    }
  })

  it('caesar D3: a wrong check reveals that reading and counts; the frequency counts stay', () => {
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(CipherGame, props('caesar-gaul', 3, 11, onWin, onLose)))
    expect(screen.getByText(/Most frequent symbols/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check this shift' }))
    expect(screen.getByText('✗ 1 / 2')).toBeTruthy()
    expect(screen.getByTestId('caesar-reading').textContent).not.toContain('Work out the shift')
    // The same setting cannot be checked twice; moving the wheel hides the reading again.
    expect((screen.getByRole('button', { name: 'Check this shift' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(plus())
    expect(screen.getByTestId('caesar-reading').textContent).toContain('Work out the shift')
  })
})
