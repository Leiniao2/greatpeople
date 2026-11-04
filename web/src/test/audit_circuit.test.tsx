// Circuit puzzles are generated per level.  Every Arcade level and story use
// must be solvable within its throw budget, not solved by an obvious move
// (all switches on, all off, the start), tight, and different from its
// neighbours on the ladder.
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { buildTrack } from '@/games/arcade'
import type { Difficulty } from '@/games/types'
import CircuitGame, { CONFIG_IDS } from '@/components/minigames/CircuitGame'
import { TIERS, THEMES, cond, evaluate, fingerprint, makePuzzle, popcount, solves, type Node } from '@/components/minigames/circuit/model'

const D: Difficulty[] = [1, 2, 3, 4]
const seeds = Array.from({ length: 40 }, (_, i) => 9001 + i * 7919)

describe('circuit physics', () => {
  const c = (sw: number, nc = false): Node => ({ k: 'contact', id: 0, sw, nc })
  const lamp: Node = { k: 'lamp', id: 1, lamp: 0 }

  it('a closed bare branch beside a lamp steals its current', () => {
    const root: Node = { k: 'par', id: 2, ch: [lamp, c(0)] }
    expect(evaluate(root, 0, 1).lit).toEqual([true])
    const e = evaluate(root, 1, 1)
    expect(e.short).toBe(true)
    expect(e.lit).toEqual([false])
  })

  it('a bypassed lamp inside a series line stays dark while the line still carries a load', () => {
    const bypassed: Node = { k: 'par', id: 3, ch: [lamp, c(0)] }
    const root: Node = { k: 'series', id: 4, ch: [bypassed, { k: 'lamp', id: 5, lamp: 1 }] }
    expect(evaluate(root, 1, 2)).toMatchObject({ short: false, lit: [false, true] })
    expect(evaluate(root, 0, 2)).toMatchObject({ short: false, lit: [true, true] })
  })

  it('a barred contact closes when its switch is off', () => {
    expect(cond(c(0, true), 0)).toBe('short')
    expect(cond(c(0, true), 1)).toBe('open')
  })
})

describe('circuit puzzles', () => {
  for (const id of CONFIG_IDS) for (const d of D) {
    it(`${id} D${d}: solvable, tight and not pre-solved over ${seeds.length} seeds`, () => {
      const tier = TIERS[d]
      for (const seed of seeds) {
        const p = makePuzzle(id, d, seed)
        const tag = `${id} D${d} seed ${seed}`
        expect(p.difficulty, tag).toBe(d)
        expect(p.switches, tag).toBeGreaterThanOrEqual(tier.switches[0])
        // Brute force agrees with the stored solution list.
        const all = 1 << p.switches
        const sols = Array.from({ length: all }, (_, m) => m).filter(m => solves(p, m))
        expect(sols, tag).toEqual(p.solutions)
        expect(sols.length, tag).toBeGreaterThan(0)
        expect(sols.length, tag).toBeLessThanOrEqual(tier.maxSolutions)
        // No free wins.
        expect(solves(p, 0), `${tag} all off`).toBe(false)
        expect(solves(p, all - 1), `${tag} all on`).toBe(false)
        expect(solves(p, p.start), `${tag} start`).toBe(false)
        expect(evaluate(p.root, p.start, p.lamps).short, `${tag} starts shorted`).toBe(false)
        // Par is the true shortest distance and fits the budget.
        expect(p.par, tag).toBe(Math.min(...sols.map(s => popcount(s ^ p.start))))
        expect(p.par, tag).toBeGreaterThanOrEqual(tier.minPar)
        if (p.budget !== null) expect(p.budget, tag).toBeGreaterThanOrEqual(p.par)
        // Shorts are a real hazard at the harder tiers.
        const shorts = Array.from({ length: all }, (_, m) => evaluate(p.root, m, p.lamps).short).filter(Boolean).length
        expect(shorts / all, tag).toBeGreaterThanOrEqual(tier.minShorts)
        if (d >= 2 && p.lamps >= 2) expect(p.target.some(t => !t), `${tag} asks for a dark lamp`).toBe(true)
      }
    })
  }

  it('the Arcade ladder never repeats a circuit and grows harder', () => {
    const track = buildTrack('circuit', CONFIG_IDS)
    const puzzles = track.map(l => makePuzzle(l.configId, l.difficulty, l.seed))
    expect(new Set(puzzles.map(p => fingerprint(p.root))).size).toBe(track.length)
    const avg = (ds: number[], f: (i: number) => number) => ds.reduce((a, i) => a + f(i), 0) / ds.length
    const first = [0, 1, 2, 3, 4, 5], last = [18, 19, 20, 21, 22, 23]
    expect(avg(last, i => puzzles[i].switches)).toBeGreaterThan(avg(first, i => puzzles[i].switches) + 2)
    expect(avg(last, i => puzzles[i].par)).toBeGreaterThan(avg(first, i => puzzles[i].par))
    expect(new Set(track.map(l => l.configId)).size).toBe(Object.keys(THEMES).length)
  })

  it('plays through: throwing the solution switches wins', () => {
    const p = makePuzzle('enigma', 2, 4242)
    let won = 0
    render(<CircuitGame configId="enigma" difficulty={2} seed={4242} onWin={() => won++} onLose={() => {}} />)
    const target = p.solutions[0]
    for (let sw = 0; sw < p.switches; sw++) {
      if (((p.start ^ target) >> sw) & 1) fireEvent.click(screen.getByLabelText(new RegExp(`^Switch ${'ABCDEFG'[sw]} `)))
    }
    expect(screen.getByText(/Circuit set in/)).toBeTruthy()
    void won
  })
})
