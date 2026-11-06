// Detective: every config × difficulty × seed makes a fair case (the full clue
// set settles it, no single lead does, a set within the hours does, and the
// start leaves many suspects); every clue is true of the hidden answer; the
// Arcade ladder is all different cases; the component wins and loses once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import DetectiveGame, { CONFIG_IDS } from '@/components/minigames/DetectiveGame'
import {
  generate, rulesOut, openPairs, isSettled, cluesOf, minimalLeads, isCorrect, TIERS, HOURS, type Case, type Clue,
} from '@/components/minigames/detective/model'
import { METHOD_TRACES } from '@/components/minigames/detective/cases'
import { difficultyForLevel, levelFor, LEVELS_PER_TRACK } from '@/games/arcade'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006, 99991]

const allClues = (c: Case) => cluesOf(c.leads, c.leads.map((_, i) => i))

describe('detective rules', () => {
  const shape = {
    suspects: [
      { name: 'A', role: '', profile: '', means: [0, 1], traits: { hand: 'left-handed', height: 'tall' } },
      { name: 'B', role: '', profile: '', means: [1], traits: { hand: 'right-handed', height: 'tall' } },
    ],
    methods: [{ id: 'poison' as const, label: 'Poison' }, { id: 'blade' as const, label: 'Knife' }],
    victims: [{ name: 'V', role: '', foundAt: '' }],
  }

  it('traces rule out methods, windows hours, alibis a suspect at those hours, marks by trait', () => {
    expect(rulesOut(shape, { k: 'trace', v: 0, f: 'blood', present: true }, 0, 0, 0, 2)).toBe(true)   // poison: no blood
    expect(rulesOut(shape, { k: 'trace', v: 0, f: 'blood', present: true }, 0, 0, 1, 2)).toBe(false)
    expect(rulesOut(shape, { k: 'window', v: 0, from: 2, to: 3 }, 0, 0, 0, 4)).toBe(true)
    expect(rulesOut(shape, { k: 'alibi', s: 1, from: 1, to: 3 }, 0, 1, 1, 2)).toBe(true)
    expect(rulesOut(shape, { k: 'alibi', s: 1, from: 1, to: 3 }, 0, 1, 1, 4)).toBe(false)
    expect(rulesOut(shape, { k: 'mark', v: 0, dim: 'hand', value: 'left-handed' }, 0, 1, 1, 0)).toBe(true)
    expect(rulesOut(shape, { k: 'herring' }, 0, 0, 0, 0)).toBe(false)
  })

  it('means limit the pairs; clues combine to a single answer', () => {
    expect(openPairs(shape, [])[0].sort()).toEqual(['0:0', '0:1', '1:1'])
    const clues: Clue[] = [
      { k: 'window', v: 0, from: 2, to: 2 },
      { k: 'alibi', s: 1, from: 1, to: 3 },
      { k: 'trace', v: 0, f: 'vomit', present: false },
    ]
    expect(isSettled(shape, clues.slice(0, 2))).toBe(false)
    expect(openPairs(shape, clues)[0]).toEqual(['0:1'])
  })

  it('every method leaves a different set of traces', () => {
    const sets = Object.values(METHOD_TRACES).map(f => [...f].sort().join(','))
    expect(new Set(sets).size).toBe(sets.length)
  })
})

describe('detective cases are fair', () => {
  for (const id of CONFIG_IDS) for (const d of DIFFS) {
    it(`${id} D${d}`, () => {
      for (const seed of SEEDS) {
        const c = generate(id, d, seed)
        const tag = `${id} D${d} s${seed}`
        expect(c.victims.length, tag).toBe(TIERS[d].victims)
        expect(c.suspects.length, tag).toBe(TIERS[d].suspects)
        // The hidden answer survives every clue, and so does its hour.
        for (const clue of allClues(c)) c.truth.forEach((t, v) =>
          expect(rulesOut(c, clue, v, t.s, t.m, t.h), `${tag} ${JSON.stringify(clue)}`).toBe(false))
        c.truth.forEach(t => expect(c.suspects[t.s].means, tag).toContain(t.m))
        // Every clue together settles it, on the right answer.
        const pairs = openPairs(c, allClues(c))
        c.truth.forEach((t, v) => expect(pairs[v], tag).toEqual([`${t.s}:${t.m}`]))
        // Not guessable at the start, no lead alone settles it, the hours suffice.
        expect(openPairs(c, [])[0].length, tag).toBeGreaterThanOrEqual(6)
        c.leads.forEach((_, i) => expect(isSettled(c, cluesOf(c.leads, [i])), `${tag} lead ${i}`).toBe(false))
        const min = minimalLeads(c, c.leads)
        expect(min.size, tag).toBe(c.minLeads)
        expect(min.size, tag).toBeGreaterThanOrEqual(TIERS[d].minLeads)
        expect(c.budget, tag).toBeGreaterThanOrEqual(min.size)
        expect(c.budget, tag).toBeLessThan(c.leads.length)       // you cannot open everything
        expect(c.leads.every(l => l.clues.length > 0), tag).toBe(true)
        // A person is never in two crimes within two hours.
        if (c.truth.length === 2 && c.truth[0].s === c.truth[1].s) expect(Math.abs(c.truth[0].h - c.truth[1].h), tag).toBeGreaterThanOrEqual(2)
        expect(c.truth.every(t => t.h >= 0 && t.h < HOURS), tag).toBe(true)
      }
    })
  }

  it('the same seed gives the same case; seeds vary the answer', () => {
    expect(JSON.stringify(generate('globe-1599', 2, 5))).toBe(JSON.stringify(generate('globe-1599', 2, 5)))
    const answers = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(generate('venice-1750', 2, i).truth)))
    expect(answers.size).toBeGreaterThan(8)
  })

  it('the 24 Arcade levels are all different cases', () => {
    const sigs = new Set<string>()
    for (let i = 0; i < LEVELS_PER_TRACK; i++) {
      const l = levelFor('detective', CONFIG_IDS, i)
      expect(l.difficulty).toBe(difficultyForLevel(i))
      const c = generate(l.configId, l.difficulty, l.seed)
      sigs.add(JSON.stringify([c.configId, c.truth, c.leads.map(x => x.clues.map(y => y.text))]))
    }
    expect(sigs.size).toBe(LEVELS_PER_TRACK)
  })

  it('isCorrect needs every victim right', () => {
    const c = generate('mayfair-1893', 3, 4)
    expect(isCorrect(c, c.truth)).toBe(true)
    expect(isCorrect(c, [c.truth[0], { s: c.truth[1].s, m: (c.truth[1].m + 1) % c.methods.length }])).toBe(false)
  })
})

describe('detective component', () => {
  const play = (configId: string, d: Difficulty, seed: number, right: boolean) => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(DetectiveGame, { configId, difficulty: d, seed, onWin, onLose }))
    const c = generate(configId, d, seed)
    const min = minimalLeads(c, c.leads)
    const VERB = { body: 'Examine', place: 'Search', question: 'Question' } as const
    for (const i of min.leads) fireEvent.click(screen.getByLabelText(`${VERB[c.leads[i].kind]} ${c.leads[i].name}`))
    expect(screen.getByLabelText(`Hours left: ${c.budget - min.size} of ${c.budget}`)).toBeTruthy()
    // Notebook grid crosses toggle.
    const t0 = c.truth[0]
    const other = c.suspects.findIndex((_, s) => s !== t0.s)
    const cell = screen.getByLabelText(`Rule out ${c.suspects[other].name} with ${c.methods[c.suspects[other].means[0]].label} for ${c.victims[0].name}`)
    fireEvent.click(cell)
    expect(cell.getAttribute('aria-pressed')).toBe('true')
    c.truth.forEach((t, v) => {
      const s = right || v > 0 ? t.s : other
      fireEvent.click(screen.getByLabelText(`Culprit for ${c.victims[v].name}: ${c.suspects[s].name}`))
      fireEvent.click(screen.getByLabelText(`Method for ${c.victims[v].name}: ${c.methods[t.m].label}`))
    })
    const accuse = screen.getByLabelText('Make the accusation')
    fireEvent.click(accuse)
    fireEvent.click(accuse)
    act(() => { vi.advanceTimersByTime(5000) })
    return { onWin, onLose }
  }

  it('the right accusation wins once', () => {
    const { onWin, onLose } = play('song-1247', 3, 11, true)
    expect(onWin).toHaveBeenCalledTimes(1)
    expect(onLose).not.toHaveBeenCalled()
  })

  it('a wrong accusation loses once and names the truth', () => {
    const { onWin, onLose } = play('sleeper-1869', 1, 2, false)
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
    expect(String(onLose.mock.calls[0][0])).toMatch(/killed/)
  })

  it('leads stop opening when the hours run out', () => {
    render(createElement(DetectiveGame, { configId: 'globe-1599', difficulty: 1, seed: 3, onWin: () => {}, onLose: () => {} }))
    const c = generate('globe-1599', 1, 3)
    const buttons = screen.getAllByRole('button').filter(b => /^(Examine|Search|Question) /.test(b.getAttribute('aria-label') ?? ''))
    expect(buttons.length).toBe(c.leads.length)
    buttons.forEach(b => fireEvent.click(b))
    expect(screen.getByLabelText(`Hours left: 0 of ${c.budget}`)).toBeTruthy()
    expect(buttons.filter(b => (b as HTMLButtonElement).disabled).length).toBe(c.leads.length)
  })
})
