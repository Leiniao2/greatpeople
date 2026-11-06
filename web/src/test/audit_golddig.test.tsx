// Gold Dig levels are generated per seed.  Every config × tier must produce a
// field the hunt-and-follow prospector wins; the rules (gold or empty, tool
// counts, granite, shatter, target) must hold; the tier's kit must be fair to
// a sensible player but not to blind swinging; the 24 Arcade levels must
// differ; and the component must report a win or a loss exactly once.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { buildTrack } from '@/games/arcade'
import type { Difficulty } from '@/games/types'
import GoldDigGame, { CONFIG_IDS } from '@/components/minigames/GoldDigGame'
import {
  TIERS, blindPlay, digStatus, fingerprint, makeLevel, prospect, randomField, startDig, strike, zone,
  type Action, type Level,
} from '@/components/minigames/golddig/model'
import { mulberry32 } from '@/components/minigames/_shared'

afterEach(() => { cleanup(); vi.useRealTimers() })
const D: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 7, 42, 1006, 99991]

const field = (gold: number[], extra: Partial<Level> = {}): Level => ({
  theme: 'klondike', difficulty: 1, size: 6, shatter: false, granite: [], gold, nuggets: [gold], target: gold.length,
  kit: { hammer: 2, pick: 1, dynamite: 1 }, seconds: 0, plan: [], ...extra,
})
const run = (lv: Level, actions: Action[]) => actions.reduce((d, a) => strike(lv, d, a) ?? d, startDig(lv))
const neighbours = (n: number, k: number) => [k - n, k + n, k % n ? k - 1 : -1, k % n < n - 1 ? k + 1 : -1].filter(j => j >= 0 && j < n * n)

describe('gold dig rules', () => {
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

  it('the target, not every cell, wins', () => {
    const lv = field([7, 8, 9, 30], { target: 3 })
    const d = run(lv, [{ tool: 'pick', cell: 8, dir: 'h' }])
    expect(digStatus(lv, d)).toMatchObject({ found: 3, outcome: 'won' })
  })

  it('dynamite digs gold at D1 but shatters it from D2; too much lost gold loses', () => {
    const safe = field([7, 8])
    expect(digStatus(safe, run(safe, [{ tool: 'dynamite', cell: 7 }])).outcome).toBe('won')
    const some = field([7, 8, 30, 31, 32], { shatter: true, target: 3 })
    const d = run(some, [{ tool: 'dynamite', cell: 7 }])
    expect(digStatus(some, d)).toMatchObject({ found: 0, lost: 2, outcome: null })
    const risky = field([7, 8, 30], { shatter: true, target: 2 })
    expect(digStatus(risky, run(risky, [{ tool: 'dynamite', cell: 7 }]))).toMatchObject({ outcome: 'lost', reason: /shattered/ })
  })

  it('with only dynamite left under the shatter rule, the dig is lost', () => {
    const lv = field([35], { shatter: true, kit: { hammer: 1, pick: 0, dynamite: 1 } })
    expect(digStatus(lv, run(lv, [{ tool: 'hammer', cell: 0 }])).outcome).toBe('lost')
  })
})

describe('gold dig levels', () => {
  for (const d of D) {
    it(`D${d}: every config generates a winnable field of separate, multi-cell nuggets`, () => {
      const tier = TIERS[d]
      for (const id of CONFIG_IDS) for (const seed of SEEDS) {
        const lv = makeLevel(id, d, seed)
        const where = `${id}/D${d}/${seed}`
        expect(lv.size, where).toBe(tier.size)
        expect(lv.granite.length, where).toBe(tier.granite)
        expect(lv.nuggets.length, where).toBe(tier.nuggets.length)
        lv.nuggets.forEach((cells, i) => {
          expect(cells.length, where).toBeGreaterThanOrEqual(tier.nuggets[i][0])
          expect(cells.length, where).toBeLessThanOrEqual(tier.nuggets[i][1])
          // Each nugget is one connected piece.
          const set = new Set(cells), seen = new Set([cells[0]]), q = [cells[0]]
          while (q.length) for (const j of neighbours(lv.size, q.pop()!)) if (set.has(j) && !seen.has(j)) { seen.add(j); q.push(j) }
          expect(seen.size, where).toBe(cells.length)
        })
        expect(lv.gold.length, where).toBe(lv.nuggets.flat().length)
        expect(lv.gold.some(k => lv.granite.includes(k)), where).toBe(false)
        expect(lv.target, where).toBe(Math.ceil(lv.gold.length * tier.target))
        // The stored plan really wins with the kit in hand.
        expect(digStatus(lv, run(lv, lv.plan)).outcome, where).toBe('won')
        expect(lv.plan.length, where).toBeGreaterThanOrEqual(4)
        expect(lv.kit.pick, where).toBe(tier.kit.pick)
        expect(lv.kit.dynamite, where).toBe(tier.kit.dynamite)
      }
    })
  }

  it('the kit is fair to the prospector and not to blind swinging, and gets harder by tier', () => {
    const rate = (fn: (s: number) => boolean) => { let w = 0; for (let s = 1; s <= 120; s++) if (fn(s)) w++; return w / 120 }
    const pro = D.map(d => rate(s => !!prospect(randomField(d, s), TIERS[d].kit)))
    const blind = D.map(d => rate(s => blindPlay(randomField(d, s), TIERS[d].kit, mulberry32(s))))
    for (const [i, d] of D.entries()) {
      expect(pro[i], `D${d} prospector`).toBeGreaterThan(0.5)
      expect(blind[i], `D${d} blind`).toBeLessThan(d === 1 ? 0.4 : 0.1)
    }
    expect(pro[0]).toBeGreaterThan(pro[3])
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
      expect((performance.now() - t0) / 5, `D${d}`).toBeLessThan(100)
    }
  })
})

describe('gold dig component', () => {
  const cellLabel = (lv: Level, k: number) => new RegExp(`^(Stone|Granite|Empty|Gold) ${Math.floor(k / lv.size) + 1},${k % lv.size + 1}$`)
  const play = (lv: Level, a: Action) => {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${a.tool[0].toUpperCase()}${a.tool.slice(1)}:`) }))
    if (a.tool === 'pick' && a.dir === 'v') fireEvent.click(screen.getByRole('button', { name: /Swing: across/ }))
    const cell = () => screen.getAllByRole('gridcell').find(g => cellLabel(lv, a.cell).test(g.getAttribute('aria-label') ?? ''))!
    fireEvent.click(cell())
    fireEvent.click(cell())
    if (a.tool === 'pick' && a.dir === 'v') fireEvent.click(screen.getByRole('button', { name: /Swing: down/ }))
  }

  it('cracked cells show gold or empty, never a number', () => {
    const lv = makeLevel('sutters-mill', 1, 5)
    render(<GoldDigGame configId="sutters-mill" difficulty={1} seed={5} onWin={() => {}} onLose={() => {}} />)
    play(lv, lv.plan[0])
    const labels = screen.getAllByRole('gridcell').map(g => g.getAttribute('aria-label') ?? '')
    expect(labels.some(l => /^(Empty|Gold) /.test(l))).toBe(true)
    expect(screen.getByRole('grid').textContent).not.toMatch(/\d/)
  })

  it('playing the plan wins exactly once', () => {
    vi.useFakeTimers()
    for (const d of [1, 4] as Difficulty[]) {
      const lv = makeLevel('sutters-mill', d, 5)
      const onWin = vi.fn(), onLose = vi.fn()
      render(<GoldDigGame configId="sutters-mill" difficulty={d} seed={5} onWin={onWin} onLose={onLose} />)
      for (const a of lv.plan) play(lv, a)
      expect(screen.getByText(/weight is dug out/)).toBeTruthy()
      act(() => { vi.advanceTimersByTime(3000) })
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('wasting every tool on empty rock loses exactly once', () => {
    vi.useFakeTimers()
    const lv = makeLevel('klondike', 2, 9)
    const onWin = vi.fn(), onLose = vi.fn()
    render(<GoldDigGame configId="klondike" difficulty={2} seed={9} onWin={onWin} onLose={onLose} />)
    const gold = new Set(lv.gold)
    const empty = Array.from({ length: lv.size * lv.size }, (_, k) => k).filter(k => !gold.has(k))
    let i = 0
    for (let h = 0; h < lv.kit.hammer + lv.kit.pick; h++) {
      const a: Action = { tool: h < lv.kit.hammer ? 'hammer' : 'pick', cell: empty[i], dir: 'h' }
      if (a.tool === 'pick') while (zone(lv.size, a).some(k => gold.has(k)) || i >= empty.length) a.cell = empty[++i]
      play(lv, a); i++
    }
    expect(screen.getByText(/no tools left/)).toBeTruthy()
    act(() => { vi.advanceTimersByTime(3000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
