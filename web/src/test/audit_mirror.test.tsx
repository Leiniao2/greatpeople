// Mirror puzzles are generated per level.  Every Arcade level and story use
// must be solvable with the pieces in hand, need every one of them, have at
// most the tier's number of answers, and differ from its neighbours.
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { buildTrack } from '@/games/arcade'
import type { Difficulty } from '@/games/types'
import MirrorGame, { CONFIG_IDS } from '@/components/minigames/MirrorGame'
import { TIERS, fingerprint, layingOrder, makePuzzle, solve, status, trace, type Source } from '@/components/minigames/mirror/model'

const D: Difficulty[] = [1, 2, 3, 4]
const seeds = Array.from({ length: 12 }, (_, i) => 4001 + i * 7919)

describe('mirror optics', () => {
  const left: Source = { row: 1, col: -1, dir: 1 } // enters row 1 travelling right
  it('a mirror turns the beam a quarter turn', () => {
    // '/' sends a rightward beam up, out of the top edge at column 2.
    const t = trace(4, left, { [1 * 4 + 2]: '/' })
    expect([...t.lit].flatMap((v, k) => (v ? [k] : []))).toEqual([2, 4, 5, 6])
  })
  it('a prism splits the beam to both sides and stops it going straight', () => {
    const t = trace(4, left, { [1 * 4 + 2]: 'P' })
    expect(t.lit[2]).toBe(1)   // up
    expect(t.lit[10]).toBe(1)  // down
    expect(t.lit[7]).toBe(0)   // not straight on
  })
  it('a block stops the beam', () => {
    const t = trace(4, left, { [1 * 4 + 1]: '#' })
    expect(t.lit[5]).toBe(1)
    expect(t.lit[6]).toBe(0)
  })
})

describe('mirror puzzles', () => {
  for (const d of D) {
    it(`D${d}: solvable, needs every piece, tight, over ${CONFIG_IDS.length} themes`, () => {
      const tier = TIERS[d]
      for (const [i, id] of CONFIG_IDS.entries()) {
        const seed = seeds[i % seeds.length] + i
        const p = makePuzzle(id, d, seed)
        const tag = `${id} D${d} seed ${seed}`
        expect(p.difficulty, tag).toBe(d)
        expect(p.targets.length, tag).toBeGreaterThanOrEqual(tier.targets[0])
        expect(p.sensors.length, tag).toBeGreaterThanOrEqual(tier.sensors[0])
        expect(p.solutions.length, tag).toBeGreaterThan(0)
        expect(p.solutions.length, tag).toBeLessThanOrEqual(tier.maxSolutions)
        const total = p.hand.mirror + p.hand.prism
        expect(total, tag).toBeGreaterThanOrEqual(d >= 3 ? 4 : 3)
        if (d >= 2) expect(p.hand.prism, `${tag} uses a prism`).toBeGreaterThan(0)
        expect(Object.values(p.fixed).filter(x => x === '#').length, `${tag} stone`).toBeGreaterThanOrEqual(tier.blocks[0])
        // Fog from D2: it covers part of the answer's path, and from D3 a star.
        const fog = new Set(p.fog)
        expect(fog.size, tag).toBeGreaterThanOrEqual(tier.fog[0] * tier.fogSide[0] ** 2)
        if (d >= 2) expect(p.solutions.some(sol => [...fog].some(k => status(p, sol).trace.lit[k])), tag).toBe(true)
        if (d >= 3) expect(p.targets.some(k => fog.has(k)), `${tag} hides a star`).toBe(true)
        for (const sol of p.solutions) {
          expect(status(p, sol).solved, tag).toBe(true)
          expect(Object.keys(sol).length, `${tag} needs every piece`).toBe(total)
          expect(layingOrder(p, sol).length, `${tag} can be laid through the fog`).toBe(total)
        }
        // Not solved before you start, nor with a piece fewer.
        expect(status(p, {}).solved, tag).toBe(false)
        if (p.hand.mirror) expect(solve({ ...p, hand: { ...p.hand, mirror: p.hand.mirror - 1 } }, 0), tag).toEqual([])
        // Targets, sensors and fixed pieces never overlap.
        const cells = [...p.targets, ...p.sensors, ...Object.keys(p.fixed).map(Number)]
        expect(new Set(cells).size, tag).toBe(cells.length)
      }
    }, 120000)
  }

  it('the Arcade ladder never repeats a board and grows harder', () => {
    const track = buildTrack('mirror', CONFIG_IDS)
    const puzzles = track.map(l => makePuzzle(l.configId, l.difficulty, l.seed))
    expect(new Set(puzzles.map(fingerprint)).size).toBe(track.length)
    const pieces = (i: number) => puzzles[i].hand.mirror + puzzles[i].hand.prism
    const avg = (ids: number[], f: (i: number) => number) => ids.reduce((a, i) => a + f(i), 0) / ids.length
    const first = [0, 1, 2, 3, 4, 5], last = [18, 19, 20, 21, 22, 23]
    expect(avg(last, pieces)).toBeGreaterThan(avg(first, pieces) + 1)
    // Stone and fog carry the rest of the climb.
    const stone = (i: number) => Object.values(puzzles[i].fixed).filter(x => x === '#').length
    expect(avg(last, stone)).toBeGreaterThan(avg(first, stone) + 4)
    expect(avg(last, i => puzzles[i].fog.length)).toBeGreaterThan(avg(first, i => puzzles[i].fog.length) + 10)
    expect(avg(last, i => puzzles[i].targets.length + puzzles[i].sensors.length))
      .toBeGreaterThan(avg(first, i => puzzles[i].targets.length + puzzles[i].sensors.length) + 3)
  }, 120000)

  it('plays through: placing the answer wins', () => {
    const p = makePuzzle('newton-prism', 3, 777)
    render(<MirrorGame configId="newton-prism" difficulty={3} seed={777} onWin={() => {}} onLose={() => {}} />)
    const sol = p.solutions[0]
    for (const cell of layingOrder(p, sol)) {
      const piece = sol[cell]
      const label = `Cell ${Math.floor(cell / p.size) + 1},${cell % p.size + 1}`
      fireEvent.click(screen.getByLabelText(piece === 'P' ? /^Prism:/ : /^Mirror:/))
      fireEvent.click(screen.getByLabelText(label))
      if (piece === '\\') fireEvent.click(screen.getByLabelText(label))
    }
    expect(screen.getByText(/The light lands where it should/)).toBeTruthy()
  })

  it('fog hides what is inside until the beam lights it, and stays cleared', () => {
    const p = makePuzzle('newton-prism', 3, 777)
    const { container } = render(<MirrorGame configId="newton-prism" difficulty={3} seed={777} onWin={() => {}} onLose={() => {}} />)
    const bare = status(p, {}).trace.lit
    const fogged = () => [...container.querySelectorAll('[data-fog]')].map(e => +e.getAttribute('data-fog')!)
    expect(fogged().length, 'fog on the board').toBeGreaterThan(0)
    expect(fogged().every(k => !bare[k]), 'lit fog is cleared').toBe(true)
    // A fogged cell cannot take a piece.
    const k = fogged()[0]
    fireEvent.click(screen.getByLabelText(`Cell ${Math.floor(k / p.size) + 1},${k % p.size + 1}`))
    expect(screen.getByLabelText(/^Mirror:/).getAttribute('aria-label')).toBe(`Mirror: ${p.hand.mirror} left`)
    // Placing the answer clears the fog along its beam for good, even after Clear.
    const sol = p.solutions[0]
    expect(layingOrder(p, sol).length, 'the answer can be laid along the beam').toBe(Object.keys(sol).length)
    for (const cell of layingOrder(p, sol)) {
      const piece = sol[cell]
      const label = `Cell ${Math.floor(cell / p.size) + 1},${cell % p.size + 1}`
      fireEvent.click(screen.getByLabelText(piece === 'P' ? /^Prism:/ : /^Mirror:/))
      fireEvent.click(screen.getByLabelText(label))
      if (piece === '\\') fireEvent.click(screen.getByLabelText(label))
    }
    const lit = status(p, sol).trace.lit
    expect(fogged().some(c => lit[c])).toBe(false)
  })
})
