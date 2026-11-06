// Gold Dig levels are generated per seed.  Every config × tier must produce a
// level the cautious greedy prospector wins against the real vein and against
// other veins the field could hide, the rules (readings, tool counts, granite,
// shatter) must hold, the 24 Arcade levels must differ, and the component must
// report a win or a loss exactly once.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { buildTrack } from '@/games/arcade'
import type { Difficulty } from '@/games/types'
import GoldDigGame, { CONFIG_IDS } from '@/components/minigames/GoldDigGame'
import {
  TIERS, FAIR_SAMPLE, digStatus, distance, fingerprint, greedy, makeLevel, placements, reading, startDig, strike, zone,
  type Action, type Level,
} from '@/components/minigames/golddig/model'

afterEach(() => { cleanup(); vi.useRealTimers() })
const D: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 7, 42, 1006, 99991]

const field = (gold: number[], extra: Partial<Level> = {}): Level => ({
  theme: 'klondike', difficulty: 1, size: 6, shape: [[0, 0]], turns: false, shatter: false,
  granite: [], gold, kit: { hammer: 2, pick: 1, dynamite: 1 }, seconds: 0, plan: [], ...extra,
})
const run = (lv: Level, actions: Action[]) => actions.reduce((d, a) => strike(lv, d, a) ?? d, startDig(lv))

describe('gold dig rules', () => {
  it('readings count diagonal steps as one', () => {
    expect(distance(6, 0, [14])).toBe(2)          // (0,0) → (2,2)
    expect(distance(6, 5, [14, 3])).toBe(2)       // nearest is (0,3)
    expect(reading(field([14]), 14)).toBe(0)
  })

  it('zones: hammer 1, pick 3 either way, dynamite 3×3, clipped at the edge', () => {
    expect(zone(6, { tool: 'hammer', cell: 7 })).toEqual([7])
    expect(zone(6, { tool: 'pick', cell: 7, dir: 'h' })).toEqual([6, 7, 8])
    expect(zone(6, { tool: 'pick', cell: 7, dir: 'v' })).toEqual([1, 7, 13])
    expect(zone(6, { tool: 'dynamite', cell: 0 })).toEqual([0, 1, 6, 7])
  })

  it('tools run out, and a used tool cannot strike again', () => {
    const lv = field([35], { kit: { hammer: 1, pick: 0, dynamite: 0 } })
    const d = strike(lv, startDig(lv), { tool: 'hammer', cell: 0 })!
    expect(d.kit.hammer).toBe(0)
    expect(strike(lv, d, { tool: 'hammer', cell: 1 })).toBeNull()
    expect(digStatus(lv, d)).toMatchObject({ outcome: 'lost', reason: /no tools/ })
  })

  it('striking cracked stone again is refused', () => {
    const lv = field([35])
    const d = strike(lv, startDig(lv), { tool: 'hammer', cell: 0 })!
    expect(strike(lv, d, { tool: 'hammer', cell: 0 })).toBeNull()
  })

  it('granite resists hammer and pick, dynamite cracks it', () => {
    const lv = field([35], { granite: [7, 8] })
    expect(strike(lv, startDig(lv), { tool: 'hammer', cell: 7 })).toBeNull()
    const p = strike(lv, startDig(lv), { tool: 'pick', cell: 7, dir: 'h' })!
    expect([p.cracked[6], p.cracked[7], p.cracked[8]]).toEqual([1, 0, 0])
    const b = strike(lv, startDig(lv), { tool: 'dynamite', cell: 7 })!
    expect(b.cracked[7] && b.cracked[8]).toBeTruthy()
  })

  it('dynamite digs gold at D1 but shatters it from D2', () => {
    const safe = field([7, 8])
    expect(digStatus(safe, run(safe, [{ tool: 'dynamite', cell: 7 }])).outcome).toBe('won')
    const risky = field([7, 8], { shatter: true })
    expect(digStatus(risky, run(risky, [{ tool: 'dynamite', cell: 7 }]))).toMatchObject({ outcome: 'lost', reason: /shattered/ })
  })

  it('with only dynamite left under the shatter rule, the dig is lost', () => {
    const lv = field([35], { shatter: true, kit: { hammer: 1, pick: 0, dynamite: 1 } })
    expect(digStatus(lv, run(lv, [{ tool: 'hammer', cell: 0 }])).outcome).toBe('lost')
  })

  it('placements respect granite and turns', () => {
    const L: [number, number][] = [[0, 0], [1, 0], [1, 1]]
    expect(placements(4, L, false, []).length).toBe(9)
    expect(placements(4, L, true, []).length).toBe(36)
    expect(placements(4, L, false, [0]).length).toBe(8)
  })
})

describe('gold dig levels', () => {
  for (const d of D) {
    it(`D${d}: every config generates a fair, winnable level`, () => {
      const tier = TIERS[d]
      for (const id of CONFIG_IDS) for (const seed of SEEDS) {
        const lv = makeLevel(id, d, seed)
        const where = `${id}/D${d}/${seed}`
        expect(lv.size, where).toBe(tier.size)
        expect(lv.gold.length, where).toBeGreaterThanOrEqual(tier.vein[0])
        expect(lv.gold.length, where).toBeLessThanOrEqual(tier.vein[1])
        expect(lv.granite.length, where).toBe(tier.granite)
        expect(lv.gold.some(k => lv.granite.includes(k)), where).toBe(false)
        // The vein is one of the placements the sketch allows.
        expect(placements(lv.size, lv.shape, lv.turns, lv.granite).map(h => h.join()), where).toContain(lv.gold.join())
        // The stored plan really wins with the kit in hand.
        const end = run(lv, lv.plan)
        expect(digStatus(lv, end).outcome, where).toBe('won')
        expect(lv.plan.length, where).toBeGreaterThanOrEqual(3)
        expect(greedy(lv), where).not.toBeNull()
        // The kit is the tier's, perhaps plus spare hammers in a rare fallback.
        expect(lv.kit.pick, where).toBe(tier.kit.pick)
        expect(lv.kit.dynamite, where).toBe(tier.kit.dynamite)
      }
    })
  }

  it('the greedy prospector wins most veins a field could hide, not just the real one', () => {
    for (const d of D) {
      const lv = makeLevel(CONFIG_IDS[d % CONFIG_IDS.length], d, 314)
      const hyps = placements(lv.size, lv.shape, lv.turns, lv.granite)
      const sample = hyps.filter((_, i) => i % 5 === 0)
      const wins = sample.filter(h => greedy(lv, h)).length
      expect(wins / sample.length, `D${d}`).toBeGreaterThan(0.7)
      expect(FAIR_SAMPLE).toBeGreaterThanOrEqual(8)
    }
  })

  it('a blind strike is a guess: no cell holds gold in more than a quarter of the placements', () => {
    for (const d of D) for (const seed of SEEDS) {
      const lv = makeLevel('klondike', d, seed)
      const hyps = placements(lv.size, lv.shape, lv.turns, lv.granite)
      expect(hyps.length).toBeGreaterThanOrEqual(40)
      const occ = new Array(lv.size * lv.size).fill(0)
      for (const h of hyps) for (const k of h) occ[k]++
      expect(Math.max(...occ)).toBeLessThanOrEqual(hyps.length / 4)
    }
  })

  it('the 24 Arcade levels are all different', () => {
    const track = buildTrack('golddig', CONFIG_IDS)
    const prints = track.map(l => fingerprint(makeLevel(l.configId, l.difficulty, l.seed)))
    expect(new Set(prints).size).toBe(track.length)
  })

  it('generation stays fast', () => {
    for (const d of D) {
      const t0 = performance.now()
      for (let i = 0; i < 5; i++) makeLevel(CONFIG_IDS[i], d, 777 + i)
      expect((performance.now() - t0) / 5, `D${d}`).toBeLessThan(400)
    }
  })
})

describe('gold dig component', () => {
  const cellLabel = (lv: Level, k: number) => new RegExp(`^(Stone|Granite|Trace \\d+ at|Gold) ${Math.floor(k / lv.size) + 1},${k % lv.size + 1}$`)
  const play = (lv: Level, a: Action) => {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${a.tool[0].toUpperCase()}${a.tool.slice(1)}:`) }))
    if (a.tool === 'pick' && a.dir === 'v') fireEvent.click(screen.getByRole('button', { name: /Swing: across/ }))
    const cell = () => screen.getAllByRole('gridcell').find(g => cellLabel(lv, a.cell).test(g.getAttribute('aria-label') ?? ''))!
    fireEvent.click(cell())
    fireEvent.click(cell())
    if (a.tool === 'pick' && a.dir === 'v') fireEvent.click(screen.getByRole('button', { name: /Swing: down/ }))
  }

  it('playing the plan wins exactly once', () => {
    vi.useFakeTimers()
    for (const d of [1, 4] as Difficulty[]) {
      const lv = makeLevel('sutters-mill', d, 5)
      const onWin = vi.fn(), onLose = vi.fn()
      render(<GoldDigGame configId="sutters-mill" difficulty={d} seed={5} onWin={onWin} onLose={onLose} />)
      for (const a of lv.plan) play(lv, a)
      expect(screen.getByText(/whole vein is out/)).toBeTruthy()
      act(() => { vi.advanceTimersByTime(3000) })
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('blasting the gold at D2 loses exactly once', () => {
    vi.useFakeTimers()
    const lv = makeLevel('klondike', 2, 9)
    const onWin = vi.fn(), onLose = vi.fn()
    render(<GoldDigGame configId="klondike" difficulty={2} seed={9} onWin={onWin} onLose={onLose} />)
    play(lv, { tool: 'dynamite', cell: lv.gold[0] })
    expect(screen.getByText(/shattered the gold/)).toBeTruthy()
    act(() => { vi.advanceTimersByTime(3000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
