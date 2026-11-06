// Next Phrase: every tune × difficulty × seed plants an answer the tray can
// form, decoys are never needed, the Mastermind marks are right, tiers change
// the depth of the puzzle, seeds vary it, and the component wins once on the
// planted answer and loses once on attempts or on the clock.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import MelodyGame, { CONFIG_IDS } from '@/components/minigames/MelodyGame'
import {
  TUNES, TIERS, generate, feedback, validStarts, midiOf, stepOf, seq, type Puzzle,
} from '@/components/minigames/melody/model'
import { GAMES } from '@/games/registry'
import cards from '@/data/cards.json'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 5, 8, 13, 42, 99, 1234, 777777]

function count<T>(xs: readonly T[]): Map<T, number> {
  const m = new Map<T, number>()
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1)
  return m
}

describe('melody content', () => {
  it('has at least 12 tunes, registered as a losable Creative game', () => {
    expect(CONFIG_IDS.length).toBeGreaterThanOrEqual(12)
    expect(GAMES.melody.label).toBe('Next Phrase')
    expect(GAMES.melody.category).toBe('Creative')
    expect(GAMES.melody.canLose).toBe(true)
  })

  it('every tune is well formed: real pitches in range, sane durations, a device for every unit, a true card link', () => {
    const ids = new Set((cards as { id: string }[]).map(c => c.id))
    for (const id of CONFIG_IDS) {
      const t = TUNES[id]
      for (const k of ['title', 'tune', 'composer', 'year', 'intro', 'fact'] as const) expect(t[k].length, `${id} ${k}`).toBeGreaterThan(0)
      if (t.card) expect(ids.has(t.card), `${id} card`).toBe(true)
      expect(t.units.length, id).toBeGreaterThanOrEqual(4)
      t.units.forEach((u, i) => {
        if (i > 0) expect(u.device.length, `${id} unit ${i} device`).toBeGreaterThan(10)
        for (const n of u.notes) {
          expect([0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4], `${id} duration`).toContain(n.d)
          if (n.p) {
            expect(midiOf(n.p), `${id} ${n.p}`).toBeGreaterThanOrEqual(midiOf('G3'))
            expect(midiOf(n.p), `${id} ${n.p}`).toBeLessThanOrEqual(midiOf('C6'))
          }
        }
      })
    }
  })

  it('encodes the famous openings note for note', () => {
    const p = (id: string, u: number) => TUNES[id].units[u].notes.map(n => n.p ?? 'R').join(' ')
    expect(p('ode-to-joy', 0)).toBe('E4 E4 F4 G4 G4 F4 E4 D4')
    expect(p('ode-to-joy', 1)).toBe('C4 C4 D4 E4 E4 D4 D4')
    expect(p('fur-elise', 0)).toBe('E5 D#5 E5 D#5 E5 B4 D5 C5 A4 R')
    expect(p('twinkle', 1)).toBe('F4 F4 E4 E4 D4 D4 C4')
    expect(p('canon-in-d', 0)).toBe('D5 A4 B4 F#4 G4 D4 G4 A4')
    expect(p('mountain-king', 0)).toBe('B3 C#4 D4 E4 F#4 D4 F#4')
    // Rhythm survives too: the dotted answer of Ode to Joy and Greensleeves' long-short lilt.
    expect(TUNES['ode-to-joy'].units[1].notes.map(n => n.d)).toEqual([1, 1, 1, 1, 1.5, 0.5, 2])
    expect(TUNES.greensleeves.units[0].notes.map(n => n.d)).toEqual([0.5, 1, 0.5, 0.75, 0.25, 0.5])
    expect(seq('C4:1 D4 R:0.5 E4')).toEqual([{ p: 'C4', d: 1 }, { p: 'D4', d: 1 }, { p: null, d: 0.5 }, { p: 'E4', d: 0.5 }])
    expect(stepOf('E4')).toBe(30)
    expect(stepOf('F5')).toBe(38)
  })
})

describe('melody puzzles', () => {
  it('every tune × difficulty × seed is winnable from its own tray, and decoys are never needed', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      expect(validStarts(id, d).length, `${id} d${d} starts`).toBeGreaterThan(0)
      for (const seed of SEEDS) {
        const pz = generate(id, d, seed)
        const tag = `${id} d${d} s${seed}`
        const [min, max] = TIERS.length[d - 1]
        expect(pz.answer.length, tag).toBeGreaterThanOrEqual(min)
        expect(pz.answer.length, tag).toBeLessThanOrEqual(max)
        expect(pz.tray.length, tag).toBe(pz.answer.length + TIERS.decoys[d - 1])
        // The tray holds exactly the answer's notes plus the decoys.
        const need = count(pz.answer), have = count(pz.tray)
        for (const [p, c] of need) expect(have.get(p), `${tag} ${p}`).toBe(c)
        for (const dp of pz.decoys) {
          expect(pz.answer.includes(dp), `${tag} decoy ${dp}`).toBe(false)
          expect(have.get(dp), `${tag} decoy count`).toBe(1)
        }
        expect(new Set(pz.decoys).size).toBe(pz.decoys.length)
        // The answer is the music that follows the opening in the tune itself.
        const flat = TUNES[id].units.flatMap(u => u.notes)
        const before = TUNES[id].units.slice(0, pz.start).flatMap(u => u.notes)
        expect(flat.slice(before.length, before.length + pz.target.length), tag).toEqual(pz.target)
        expect(before.slice(before.length - pz.opening.length), tag).toEqual(pz.opening)
        expect(pz.opening.filter(n => n.p).length, tag).toBeGreaterThanOrEqual(3)
        expect(feedback(pz.answer, pz.answer).every(m => m === 'right'), tag).toBe(true)
        expect(new Set(pz.answer).size, tag).toBeGreaterThanOrEqual(3)
        // Same seed, same puzzle.
        expect(generate(id, d, seed)).toEqual(pz)
      }
    }
  })

  it('seeds vary the target phrase, tile order and decoys', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const sigs = new Set(SEEDS.map(s => { const pz = generate(id, d, s); return JSON.stringify([pz.start, pz.tray]) }))
      expect(sigs.size, `${id} d${d}`).toBeGreaterThanOrEqual(5)
      if (d >= 2) {
        const decoys = new Set(SEEDS.map(s => generate(id, d, s).decoys.join()))
        expect(decoys.size, `${id} d${d} decoys`).toBeGreaterThanOrEqual(2)
      }
    }
    // Across all tunes, most offer more than one phrase to aim for.
    const multi = CONFIG_IDS.filter(id => new Set(SEEDS.map(s => generate(id, 2, s).start)).size >= 2)
    expect(multi.length).toBeGreaterThanOrEqual(10)
  })

  it('tiers change the depth of the puzzle, not just the clock', () => {
    for (const id of CONFIG_IDS) {
      const p = DIFFS.map(d => generate(id, d, 5))
      for (let i = 1; i < 4; i++) {
        expect(p[i].answer.length, id).toBeGreaterThan(p[i - 1].answer.length)
        expect(p[i].decoys.length).toBeGreaterThan(p[i - 1].decoys.length)
        expect(p[i].attempts).toBeLessThanOrEqual(p[i - 1].attempts)
        expect(p[i].seconds).toBeGreaterThan(p[i - 1].seconds)
      }
      expect(p[0].decoys).toEqual([])
      expect(p[0].hintAfter).toBe(0)
      expect(p[2].hintAfter).toBe(2)
      expect(p[3].hintAfter).toBe(Infinity)
      expect(p[3].replays).toBe(3)
      expect(p[0].replays).toBe(0)
      // Expert decoys sit within a whole tone of a real note.
      for (const dp of p[3].decoys) {
        expect(Math.min(...p[3].answer.map(a => Math.abs(midiOf(a) - midiOf(dp)))), `${id} d4 decoy`).toBeLessThanOrEqual(2)
      }
    }
  })

  it('never hands over the tiles already in order', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const seed of SEEDS) {
      const pz = generate(id, d, seed)
      expect(pz.tray.slice(0, pz.answer.length).join(), `${id} d${d} s${seed}`).not.toBe(pz.answer.join())
    }
  })
})

describe('melody feedback', () => {
  it('marks right, elsewhere and absent like Mastermind, counting each answer note once', () => {
    expect(feedback(['C4', 'D4', 'E4'], ['C4', 'D4', 'E4'])).toEqual(['right', 'right', 'right'])
    expect(feedback(['E4', 'C4', 'D4'], ['C4', 'D4', 'E4'])).toEqual(['elsewhere', 'elsewhere', 'elsewhere'])
    expect(feedback(['C4', 'G4', 'E4'], ['C4', 'D4', 'E4'])).toEqual(['right', 'absent', 'right'])
    // Two Es guessed, one E in the answer and already matched: the extra is absent.
    expect(feedback(['E4', 'E4', 'D4'], ['E4', 'C4', 'D4'])).toEqual(['right', 'absent', 'right'])
    // Two Es in the answer, guessed out of place: both elsewhere; a third is absent.
    expect(feedback(['C4', 'E4', 'E4', 'E4'], ['E4', 'C4', 'D4', 'E4'])).toEqual(['elsewhere', 'elsewhere', 'absent', 'right'])
    // An exact match is never spent as "elsewhere" for an earlier slot.
    expect(feedback(['D4', 'D4'], ['C4', 'D4'])).toEqual(['absent', 'right'])
    // Octaves are different notes.
    expect(feedback(['C5'], ['C4'])).toEqual(['absent'])
  })

  it('a wrong decoy tile is always marked absent', () => {
    for (const id of CONFIG_IDS) {
      const pz = generate(id, 4, 3)
      const guess = [...pz.answer]; guess[0] = pz.decoys[0]
      expect(feedback(guess, pz.answer)[0], id).toBe('absent')
    }
  })
})

describe('melody component', () => {
  const q = (c: HTMLElement, sel: string) => c.querySelector(sel) as Element
  const mount = (id: string, d: Difficulty, seed: number, onWin = vi.fn(), onLose = vi.fn()) =>
    ({ ...render(createElement(MelodyGame, { configId: id, difficulty: d, seed, onWin, onLose })), onWin, onLose })

  /** Tap tiles in the order given; slots fill left to right. */
  function fill(container: HTMLElement, pz: Puzzle, pitches: string[]) {
    const taken = new Set<number>()
    for (const p of pitches) {
      const ti = pz.tray.findIndex((t, i) => t === p && !taken.has(i))
      taken.add(ti)
      fireEvent.click(q(container, `[data-tile="${ti}"]`))
    }
  }

  it('renders every config at every difficulty, with a slot per note and a tile per tray note', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = mount(id, d, 3)
      const pz = generate(id, d, 3)
      expect(container.querySelectorAll('[data-tile]').length).toBe(pz.tray.length)
      expect(container.querySelectorAll('[data-slot]').length).toBe(pz.answer.length)
      expect(container.querySelectorAll('svg').length).toBe(2)
      expect(!!container.querySelector('[data-testid="mel-hint"]'), `${id} d${d} hint`).toBe(d <= 2)
      unmount()
    }
  })

  it('submitting the planted answer wins once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount, onWin, onLose } = mount(id, d, 11)
      const pz = generate(id, d, 11)
      fill(container, pz, pz.answer)
      fireEvent.click(q(container, '[data-action="submit"]'))
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('locks right notes after a miss, then can still be won', () => {
    vi.useFakeTimers()
    const pz = generate('twinkle', 1, 2)
    const { container, onWin } = mount('twinkle', 1, 2)
    const wrong = [...pz.answer.slice(1), pz.answer[0]]
    fill(container, pz, wrong)
    fireEvent.click(q(container, '[data-action="submit"]'))
    expect(container.querySelectorAll('[data-attempt]').length).toBe(1)
    const marks = feedback(wrong, pz.answer)
    // Take back every unlocked slot and place the answer's notes there.
    marks.forEach((m, i) => { if (m !== 'right') fireEvent.click(q(container, `[data-slot="${i}"]`)) })
    const left = pz.answer.filter((_, i) => marks[i] !== 'right')
    // Tapping a locked slot does nothing to it.
    const lockedIdx = marks.findIndex(m => m === 'right')
    if (lockedIdx >= 0) fireEvent.click(q(container, `[data-slot="${lockedIdx}"]`))
    expect(left.length).toBeGreaterThan(0)
    marks.forEach((m, i) => {
      if (m === 'right') return
      fireEvent.click(q(container, `[data-slot="${i}"]`)) // empty: move the cursor here
      const free = [...container.querySelectorAll(`[data-pitch="${pz.answer[i]}"]`)].find(b => !(b as HTMLButtonElement).disabled)!
      fireEvent.click(free)
    })
    fireEvent.click(q(container, '[data-action="submit"]'))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(onWin).toHaveBeenCalledTimes(1)
  })

  it('exhausting the attempts loses once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount, onWin, onLose } = mount(id, d, 4)
      const pz = generate(id, d, 4)
      // A wrong arrangement: a decoy in the first slot if there is one, else the answer rotated.
      const wrong = pz.decoys.length ? [pz.decoys[0], ...pz.answer.slice(1)] : [...pz.answer.slice(1), pz.answer[0]]
      fill(container, pz, wrong)
      for (let a = 0; a < pz.attempts; a++) {
        expect(onLose, `${id} d${d} early`).not.toHaveBeenCalled()
        fireEvent.click(q(container, '[data-action="submit"]'))
      }
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('running out of time loses once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { unmount, onWin, onLose } = mount(id, d, 6)
      act(() => { vi.advanceTimersByTime((TIERS.seconds[d - 1] - 1) * 1000) })
      expect(onLose, `${id} d${d} early`).not.toHaveBeenCalled()
      act(() => { vi.advanceTimersByTime(2000) })
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('shows the hint at D3 only after two misses, and limits D4 opening plays', () => {
    const pz = generate('minuet-in-g', 3, 9)
    const { container } = mount('minuet-in-g', 3, 9)
    const wrong = [pz.decoys[0], ...pz.answer.slice(1)]
    fill(container, pz, wrong)
    expect(container.querySelector('[data-testid="mel-hint"]')).toBeNull()
    fireEvent.click(q(container, '[data-action="submit"]'))
    expect(container.querySelector('[data-testid="mel-hint"]')).toBeNull()
    fireEvent.click(q(container, '[data-action="submit"]'))
    expect(container.querySelector('[data-testid="mel-hint"]')).not.toBeNull()
    cleanup()

    const r = mount('greensleeves', 4, 9)
    const btn = q(r.container, '[data-action="play-opening"]') as HTMLButtonElement
    for (let i = 0; i < 3; i++) { expect(btn.disabled).toBe(false); fireEvent.click(btn) }
    expect(btn.disabled).toBe(true)
    expect(r.container.querySelector('[data-testid="mel-hint"]')).toBeNull()
  })

  it('accepts title overrides through params', () => {
    const { getByText } = render(createElement(MelodyGame, { configId: 'ode-to-joy', difficulty: 1, seed: 1, params: { title: 'Custom Tune' }, onWin: () => {}, onLose: () => {} }))
    expect(getByText('Custom Tune')).toBeTruthy()
  })
})
