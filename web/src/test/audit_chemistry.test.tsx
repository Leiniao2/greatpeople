// Chemistry lab: every reaction in the bank is a real, uniquely balanced
// equation; every config × difficulty × seed deals a winnable level; the
// titration curves come out where chemistry says; and the component wins and
// loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import ChemistryGame from '@/components/minigames/ChemistryGame'
import {
  CONFIGS, CONFIG_IDS, REACTIONS, INDICATORS, parseFormula, balance, band, isBalanced, isLowest, tally,
  pickReactions, pickMolarity, targetMl, equivalenceMl, colourChangeMl, pHAt, balanceTier, titrationTier,
  type BalanceConfig, type TitrationConfig,
} from '@/components/minigames/chemistry/model'
import { buildTrack } from '@/games/arcade'
import type { Difficulty } from '@/games/types'
import challenges from '../../../data/story_challenges.json'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = Array.from({ length: 12 }, (_, i) => i * 7919 + 3)
const balanceIds = CONFIG_IDS.filter(id => CONFIGS[id].mode === 'balance')
const titrationIds = CONFIG_IDS.filter(id => CONFIGS[id].mode === 'titration')

describe('formulas and equations', () => {
  it('counts atoms through brackets', () => {
    expect(parseFormula('Al2Si2O5(OH)4')).toEqual({ Al: 2, Si: 2, O: 9, H: 4 })
    expect(parseFormula('Ca3(PO4)2')).toEqual({ Ca: 3, P: 2, O: 8 })
    expect(parseFormula('CH3COOH')).toEqual({ C: 2, H: 4, O: 2 })
    expect(parseFormula('Cu2(OH)2CO3')).toEqual({ Cu: 2, O: 5, H: 2, C: 1 })
  })

  it('balances the textbook cases', () => {
    const by = (id: string) => balance(REACTIONS.find(r => r.id === id)!)
    expect(by('water')).toEqual([2, 1, 2])
    expect(by('propane')).toEqual([1, 5, 3, 4])
    expect(by('permanganate')).toEqual([2, 16, 2, 2, 5, 8])
    expect(by('copper-dilute-nitric')).toEqual([3, 8, 3, 2, 4])
    expect(by('octane')).toEqual([2, 25, 16, 18])
  })

  it('every reaction in the bank balances one way only, and is not already balanced at all ones', () => {
    const ids = new Set<string>()
    for (const r of REACTIONS) {
      expect(ids.has(r.id), r.id).toBe(false)
      ids.add(r.id)
      const c = balance(r)
      expect(c, r.id).not.toBeNull()
      expect(isBalanced(r, c!), r.id).toBe(true)
      expect(isLowest(c!), r.id).toBe(true)
      expect(c!.some(x => x > 1), `${r.id} is trivial`).toBe(true)
      expect(Math.max(...c!), r.id).toBeLessThanOrEqual(99)
      // Mass is conserved when atoms are.
      const { left, right } = tally(r, c!)
      expect(left).toEqual(right)
    }
  })

  it('every band has plenty of reactions', () => {
    for (const d of DIFFS) expect(REACTIONS.filter(r => band(r) === d).length, `band ${d}`).toBeGreaterThanOrEqual(6)
  })

  it('every config pool names real reactions', () => {
    for (const id of balanceIds) for (const rid of (CONFIGS[id] as BalanceConfig).pool) {
      expect(REACTIONS.some(r => r.id === rid), `${id}: ${rid}`).toBe(true)
    }
  })
})

describe('balance levels', () => {
  it('deal distinct reactions at the right difficulty, with variety across seeds', () => {
    for (const id of balanceIds) for (const d of DIFFS) {
      const sets = new Set<string>()
      for (const seed of SEEDS) {
        const rs = pickReactions(CONFIGS[id] as BalanceConfig, id, d, seed)
        expect(rs.length, `${id} d${d}`).toBe(balanceTier(d).rounds)
        expect(new Set(rs).size).toBe(rs.length)
        for (const r of rs) expect(band(r), `${id} d${d} ${r.id}`).toBeLessThanOrEqual(d)
        expect(rs.some(r => band(r) === d), `${id} d${d} has a reaction of its tier`).toBe(true)
        sets.add(rs.map(r => r.id).sort().join(','))
      }
      expect(sets.size, `${id} d${d} variety`).toBeGreaterThanOrEqual(3)
    }
  })

  it('the config’s own reactions come up more than their share', () => {
    for (const id of balanceIds) {
      const cfg = CONFIGS[id] as BalanceConfig
      let own = 0, all = 0
      for (const d of DIFFS) for (const seed of SEEDS) for (const r of pickReactions(cfg, id, d, seed)) { all++; if (cfg.pool.includes(r.id)) own++ }
      expect(own / all, id).toBeGreaterThan(cfg.pool.length / REACTIONS.length)
    }
  })
})

describe('titration chemistry', () => {
  it('pH follows the textbook: strong acid starts low, equivalence near 7; weak acid equivalence is alkaline', () => {
    const hcl = (CONFIGS['spirit-of-salt'] as TitrationConfig).system
    expect(pHAt(hcl, 0.1, 0)).toBeCloseTo(1.7, 1)
    expect(pHAt(hcl, 0.1, equivalenceMl(hcl, 0.1))).toBeCloseTo(7, 1)
    const acetic = (CONFIGS.vinegar as TitrationConfig).system
    const half = equivalenceMl(acetic, 0.8) / 2
    expect(pHAt(acetic, 0.8, half)).toBeCloseTo(4.76, 1) // half-equivalence: pH = pKa
    expect(pHAt(acetic, 0.8, equivalenceMl(acetic, 0.8))).toBeGreaterThan(8)
    const spring = (CONFIGS['spring-water'] as TitrationConfig).system
    expect(pHAt(spring, 0.003, 0)).toBeCloseTo(8.3, 1) // bicarbonate: (pKa1 + pKa2) / 2
  })

  it('the right indicator turns at the equivalence point; a wrong one misses it', () => {
    for (const id of titrationIds) {
      const cfg = CONFIGS[id] as TitrationConfig
      for (const d of DIFFS) for (const seed of SEEDS) {
        const m = pickMolarity(cfg, id, d, seed)
        expect(m).toBeGreaterThanOrEqual(cfg.system.molarity[0])
        expect(m).toBeLessThanOrEqual(cfg.system.molarity[1])
        const target = targetMl(cfg, m), veq = equivalenceMl(cfg.system, m)
        expect(target, `${id} d${d}`).toBeGreaterThan(3)
        expect(target, `${id} d${d}`).toBeLessThan(45)
        expect(Math.abs(target - veq), `${id} d${d} indicator error`).toBeLessThan(0.6)
        // At the tiers where you choose, at least one other indicator fails.
        if (titrationTier(d).chooseIndicator && id !== 'spirit-of-salt') {
          const wrong = Object.values(INDICATORS).filter(i => i.id !== cfg.system.indicator)
            .filter(i => { const v = colourChangeMl(cfg.system, m, i); return v === null || Math.abs(v - target) > titrationTier(d).toleranceMl })
          expect(wrong.length, `${id} d${d}`).toBeGreaterThanOrEqual(2)
        }
      }
    }
  })

  it('unknown strength varies by seed above D1', () => {
    for (const id of titrationIds) {
      const cfg = CONFIGS[id] as TitrationConfig
      expect(new Set(SEEDS.map(s => pickMolarity(cfg, id, 3, s))).size, id).toBeGreaterThanOrEqual(8)
    }
  })
})

// ── Component ─────────────────────────────────────────────────────────────────

function setCoefs(values: number[]) {
  const inputs = screen.getAllByRole('textbox')
  values.forEach((v, k) => fireEvent.change(inputs[k], { target: { value: String(v) } }))
}

describe('balance bench', () => {
  for (const d of DIFFS) {
    it(`D${d}: balancing every reaction wins once, after a miss`, () => {
      vi.useFakeTimers()
      for (const id of balanceIds) for (const seed of [1, 99]) {
        const onWin = vi.fn(), onLose = vi.fn()
        render(createElement(ChemistryGame, { configId: id, difficulty: d, seed, onWin, onLose }))
        const rs = pickReactions(CONFIGS[id] as BalanceConfig, id, d, seed)
        fireEvent.click(screen.getByTestId('chem-react')) // all ones: a miss
        expect(screen.getByTestId('chem-msg').textContent).toMatch(/balanced/i)
        for (const r of rs) {
          setCoefs(balance(r)!)
          fireEvent.click(screen.getByTestId('chem-react'))
        }
        act(() => { vi.advanceTimersByTime(2000) })
        expect(onWin, `${id} d${d} s${seed}`).toHaveBeenCalledTimes(1)
        expect(onLose).not.toHaveBeenCalled()
        cleanup()
      }
    })
  }

  it('a balanced but doubled equation is not accepted', () => {
    render(createElement(ChemistryGame, { configId: 'clay-type', difficulty: 1, seed: 1, onWin: vi.fn(), onLose: vi.fn() }))
    const [r] = pickReactions(CONFIGS['clay-type'] as BalanceConfig, 'clay-type', 1, 1)
    setCoefs(balance(r)!.map(c => c * 2))
    fireEvent.click(screen.getByTestId('chem-react'))
    expect(screen.getByTestId('chem-msg').textContent).toMatch(/divides by 2/)
  })

  it('D4 loses once after two misses; D1 never does; D3–4 hide the live atom count', () => {
    vi.useFakeTimers()
    const h = { onWin: vi.fn(), onLose: vi.fn() }
    render(createElement(ChemistryGame, { configId: 'brazier', difficulty: 4, seed: 1, ...h }))
    expect(screen.queryByTestId('chem-atoms')).toBeNull()
    expect(screen.queryByTestId('chem-scale')).toBeNull()
    fireEvent.click(screen.getByTestId('chem-weigh'))
    expect(screen.getByTestId('chem-atoms')).toBeTruthy()
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByTestId('chem-react'))
    act(() => { vi.advanceTimersByTime(2000) })
    expect(h.onLose).toHaveBeenCalledTimes(1)
    cleanup()
    const h1 = { onWin: vi.fn(), onLose: vi.fn() }
    render(createElement(ChemistryGame, { configId: 'brazier', difficulty: 1, seed: 1, ...h1 }))
    expect(screen.getByTestId('chem-atoms')).toBeTruthy()
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByTestId('chem-react'))
    act(() => { vi.advanceTimersByTime(600_000) })
    expect(h1.onLose).not.toHaveBeenCalled()
  })
})

describe('titration bench', () => {
  /** Pour to just short of the endpoint, then drip, then call it. */
  function titrate(target: number) {
    fireEvent.pointerDown(screen.getByTestId('chem-pour'))
    act(() => { vi.advanceTimersByTime(Math.floor(target - 1) * 1000) })
    fireEvent.pointerUp(screen.getByTestId('chem-pour'))
    const reading = () => Number(screen.getByTestId('chem-reading').textContent!.split(' ')[0])
    while (reading() < target - 0.02) fireEvent.click(screen.getByTestId('chem-drop'))
    fireEvent.click(screen.getByTestId('chem-endpoint'))
  }

  for (const d of DIFFS) {
    it(`D${d}: stopping at the endpoint wins once`, () => {
      vi.useFakeTimers()
      for (const id of titrationIds) {
        const cfg = CONFIGS[id] as TitrationConfig
        const onWin = vi.fn(), onLose = vi.fn()
        const { container } = render(createElement(ChemistryGame, { configId: id, difficulty: d, seed: 7, onWin, onLose }))
        if (titrationTier(d).chooseIndicator) {
          expect(screen.getByTestId('chem-indicators')).toBeTruthy()
          fireEvent.click(container.querySelector(`button[data-indicator="${cfg.system.indicator}"]`)!)
        }
        expect(!!screen.queryByTestId('chem-ph')).toBe(titrationTier(d).meter)
        titrate(targetMl(cfg, pickMolarity(cfg, id, d, 7)))
        act(() => { vi.advanceTimersByTime(2000) })
        expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
        expect(onLose).not.toHaveBeenCalled()
        cleanup()
      }
    })
  }

  it('the flask colour really turns at the endpoint', () => {
    vi.useFakeTimers()
    render(createElement(ChemistryGame, { configId: 'vinegar', difficulty: 1, seed: 1, onWin: vi.fn(), onLose: vi.fn() }))
    const fill = () => screen.getByTestId('chem-flask').getAttribute('fill')
    const before = fill()
    fireEvent.pointerDown(screen.getByTestId('chem-pour'))
    act(() => { vi.advanceTimersByTime(25_000) })
    fireEvent.pointerUp(screen.getByTestId('chem-pour'))
    expect(fill()).not.toBe(before)
  })

  it('D4 loses once after two runs called too early; D1 lets you refill for ever', () => {
    vi.useFakeTimers()
    const h = { onWin: vi.fn(), onLose: vi.fn() }
    const { container } = render(createElement(ChemistryGame, { configId: 'vinegar', difficulty: 4, seed: 1, ...h }))
    for (let run = 0; run < 2; run++) {
      fireEvent.click(container.querySelector('button[data-indicator="methylOrange"]')!)
      fireEvent.click(screen.getByTestId('chem-drop'))
      fireEvent.click(screen.getByTestId('chem-endpoint'))
      if (run === 0) fireEvent.click(screen.getByTestId('chem-refill'))
    }
    act(() => { vi.advanceTimersByTime(2000) })
    expect(h.onLose).toHaveBeenCalledTimes(1)
    expect(h.onWin).not.toHaveBeenCalled()
    cleanup()
    const h1 = { onWin: vi.fn(), onLose: vi.fn() }
    render(createElement(ChemistryGame, { configId: 'vinegar', difficulty: 1, seed: 1, ...h1 }))
    for (let run = 0; run < 6; run++) {
      fireEvent.click(screen.getByTestId('chem-drop'))
      fireEvent.click(screen.getByTestId('chem-endpoint'))
      fireEvent.click(screen.getByTestId('chem-refill'))
    }
    act(() => { vi.advanceTimersByTime(2000) })
    expect(h1.onLose).not.toHaveBeenCalled()
  })
})

describe('story and arcade', () => {
  type Entry = { game?: string; configId?: string; id?: string; difficulty?: number }
  const entries = (challenges as { challenges: Entry[] }[]).flatMap(s => s.challenges)

  it('every story chemistry challenge names a real config', () => {
    const chem = entries.filter(c => c.game === 'chemistry')
    expect(chem.length).toBeGreaterThanOrEqual(3)
    for (const c of chem) expect(CONFIGS[c.configId ?? ''], `${c.id}: ${c.configId}`).toBeDefined()
  })

  it('the arcade track has 24 different levels', () => {
    const track = buildTrack('chemistry', CONFIG_IDS)
    const keys = track.map(l => {
      const cfg = CONFIGS[l.configId]
      return cfg.mode === 'balance'
        ? `${l.configId}:${pickReactions(cfg, l.configId, l.difficulty, l.seed).map(r => r.id).join(',')}`
        : `${l.configId}:${l.difficulty}:${pickMolarity(cfg, l.configId, l.difficulty, l.seed)}`
    })
    expect(new Set(keys).size).toBe(24)
  })
})
