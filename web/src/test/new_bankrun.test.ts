// Bank Run: the queue / panic / fire-sale / config rules, every config ×
// difficulty × seed is won by the planner and lost by doing nothing (and by
// dumping everything or selling just in time at D3+), and the component wins
// and loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import BankRunGame, {
  CONFIG_IDS, CONFIGS, apply, run, startState, equity, withdrawal, salePrice, callValue, pledgeDebt,
  makeLevel, doNothing, dumpAll, justInTime, solve,
  type Action, type Instance, type BankState,
} from '@/components/minigames/BankRunGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42]

function mini(over: Partial<Instance> = {}): Instance {
  return {
    configId: 'panic-1907', mode: 'pool', difficulty: 1, turns: 3, branches: ['NY'], cash0: [20], dep0: [100], panic0: 1,
    assets: [
      { name: 'Bill', kind: 'bill', branch: 0, face: 30, mat: 1 },
      { name: 'Call loan', kind: 'loan', branch: 0, face: 40, mat: 5 },
      { name: 'Bonds', kind: 'bond', branch: 0, face: 20, mat: 9 },
    ],
    offers: [], base: [[8], [8], [8]], events: [], holidayFrom: 0, target: 0, best: 0,
    panicStep: 2, reassureCost: 2, callFee: 6, windowRate: 10, transferFee: 4, poolRate: 6, costPerTurn: 0, holidayLen: 2,
    ...over,
  }
}
const ok = (inst: Instance, s: BankState, a: Action) => { const r = apply(inst, s, a); expect(r.ok).toBe(true); return (r as { state: BankState }).state }

describe('bank run rules', () => {
  it('the queue is deposits × (base + panic × step); unpaid queue fails the bank', () => {
    const inst = mini()
    const s = startState(inst)
    expect(withdrawal(inst, s, 0)).toBe(10) // 100 × (8 + 1×2)%
    const poor = mini({ cash0: [9] })
    const out = ok(poor, startState(poor), { t: 'open' })
    expect(out.status).toBe('lost')
  })

  it('panic: +2 on a thin vault, +1 on a growing queue, −1 on a full vault; reassure −2 for its cost', () => {
    const inst = mini()
    let s = ok(inst, startState(inst), { t: 'open' }) // 20−10 = 10 of 90 → 11% (not thin), first day
    expect(s.panic).toBe(1)
    const thin = mini({ cash0: [15] })
    s = ok(thin, startState(thin), { t: 'open' }) // 5 / 90
    expect(s.panic).toBe(3)
    const rich = mini({ cash0: [40] })
    s = ok(rich, startState(rich), { t: 'open' }) // 30 / 90 ≥ 25%
    expect(s.panic).toBe(0)
    const r = ok(inst, startState(inst), { t: 'reassure' })
    expect(r.cash[0]).toBe(18)
    expect(r.panic).toBe(0)
    expect(apply(inst, r, { t: 'reassure' }).ok).toBe(false)
  })

  it('fire sales cost haircut × days to maturity + 2 × panic; calls pay tomorrow less the fee; capital marks at face', () => {
    const inst = mini()
    const s = startState(inst)
    expect(salePrice(inst, s, 0)).toBe(Math.floor(30 * (100 - 4 - 2) / 100))
    expect(salePrice(inst, s, 1)).toBe(Math.floor(40 * (100 - 30 - 2) / 100))
    const e0 = equity(inst, s)
    expect(e0).toBe(20 + 30 + 40 + 20 - 100)
    const sold = ok(inst, s, { t: 'sell', a: 1 })
    expect(equity(inst, sold)).toBe(e0 - (40 - salePrice(inst, s, 1)))
    const called = ok(inst, s, { t: 'call', a: 1 })
    expect(called.cash[0]).toBe(20)
    const next = ok(inst, called, { t: 'open' })
    expect(next.cash[0]).toBe(20 - 10 + callValue(inst, 1) + 30) // the bill also matured on day 2
    expect(apply(inst, s, { t: 'call', a: 0 }).ok).toBe(false) // bills are not callable
  })

  it('Lombard Street: pledge good security at the penalty rate, never doubtful loans', () => {
    const inst = mini({ mode: 'window', configId: 'bagehot' })
    const s = startState(inst)
    expect(apply(inst, s, { t: 'pledge', a: 1 }).ok).toBe(false)
    const p = ok(inst, s, { t: 'pledge', a: 2 })
    expect(p.cash[0]).toBe(40)
    expect(p.debt).toBe(pledgeDebt(inst, 2))
    expect(equity(inst, p)).toBe(equity(inst, s) - 2)
    expect(apply(inst, p, { t: 'sell', a: 2 }).ok).toBe(false)
  })

  it('Medici: a bill of exchange arrives at the other branch tomorrow, less the exchange', () => {
    const inst = mini({ mode: 'branches', configId: 'medici', branches: ['Florence', 'Bruges'], cash0: [30, 10], dep0: [60, 50], base: [[5, 5], [5, 5], [5, 5]] })
    const s = ok(inst, startState(inst), { t: 'transfer', from: 0, amt: 10 })
    expect(s.cash).toEqual([20, 10])
    const n = ok(inst, s, { t: 'open' })
    expect(n.cash[1]).toBe(10 - withdrawal(inst, s, 1) + 9)
  })

  it('1907: a paid-up pool stops the rival’s failure from adding panic', () => {
    const ev = [{ turn: 1, panic: 5, text: 'TCA', pool: 8 }]
    const inst = mini({ cash0: [40], events: ev })
    const no = ok(inst, startState(inst), { t: 'open' })
    expect(no.panic).toBe(5) // 1 − 1 (full vault) + 5
    const paid = ok(inst, ok(inst, startState(inst), { t: 'pool', amt: 8 }), { t: 'open' })
    expect(paid.panic).toBe(1) // 22/90 is not full: panic stays 1
    expect(equity(inst, paid)).toBe(equity(inst, no) + Math.floor(8 * 1.06) - 8)
  })

  it('Amsterdam: coin short of deposits leaks: panic +2; loans repay with interest', () => {
    const inst = mini({ mode: 'reserve', configId: 'amsterdam-1609', assets: [], cash0: [108], costPerTurn: 1,
      offers: [{ name: 'VOC', turn: 0, amt: 20, mat: 2, ret: 3 }] })
    const lent = ok(inst, startState(inst), { t: 'lend', o: 0 })
    const d1 = ok(inst, lent, { t: 'open' })
    expect(d1.panic).toBe(3)
    const d2 = ok(inst, d1, { t: 'open' })
    expect(d2.cash[0]).toBe(d1.cash[0] - withdrawal(inst, d1, 0) - 1 + 23)
  })

  it('1933: no queue during the holiday; examiners reopen a sound bank with panic gone', () => {
    const inst = mini({ mode: 'holiday', configId: 'holiday-1933', turns: 4, base: [[8], [8], [8], [8]], holidayFrom: 1, holidayLen: 2 })
    expect(apply(inst, startState(inst), { t: 'holiday' }).ok).toBe(false)
    let s = ok(inst, startState(inst), { t: 'open' })
    s = ok(inst, s, { t: 'holiday' })
    expect(withdrawal(inst, s, 0)).toBe(0)
    s = ok(inst, ok(inst, s, { t: 'open' }), { t: 'open' })
    expect(s.panic).toBe(0)
    const bad = mini({ ...inst, assets: [{ name: 'Junk', kind: 'estate', branch: 0, face: 40, mat: 9 }] })
    let b = ok(bad, ok(bad, startState(bad), { t: 'open' }), { t: 'holiday' })
    b = ok(bad, ok(bad, b, { t: 'open' }), { t: 'open' })
    expect(b.status).toBe('lost')
  })
})

describe('bank run levels', () => {
  it('every config × difficulty × seed: planner wins, nothing loses, naive strategies lose at D3+', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const looks = new Set<string>()
      for (const seed of SEEDS) {
        const { inst, solution } = makeLevel(id, d, seed)
        const tag = `${id} d${d} s${seed}`
        expect(inst.turns, tag).toBe([5, 6, 7, 8][d - 1])
        expect(inst.target, tag).toBeGreaterThanOrEqual(1)
        expect(startState(inst).status).toBe('play') // not won at the start
        expect(run(inst, solution.path.slice(0, -1)).status, tag).toBe('play') // only the last day settles it
        const end = run(inst, solution.path)
        expect(end.status, tag).toBe('won')
        expect(end.log.length).toBe(inst.turns)
        expect(doNothing(inst).status, tag).toBe('lost')
        if (d >= 3) {
          expect(dumpAll(inst).status, `${tag} dump`).toBe('lost')
          expect(justInTime(inst).status, `${tag} jit`).toBe('lost')
        }
        looks.add(JSON.stringify([inst.assets, inst.offers, inst.events, inst.base]))
      }
      expect(looks.size, `${id} d${d} varies by seed`).toBeGreaterThan(1)
    }
  })

  it('levels are deterministic and the planner is reproducible', () => {
    const a = makeLevel('bagehot', 4, 99).inst
    expect(solve(a)!.equity).toBe(a.best)
    expect(CONFIGS.medici.fact.length).toBeGreaterThan(40)
    for (const id of CONFIG_IDS) expect(CONFIGS[id].rule.length).toBeGreaterThan(5)
  })
})

function clickAction(a: Action) {
  const click = (id: string) => act(() => { fireEvent.click(screen.getByTestId(id)) })
  switch (a.t) {
    case 'sell': case 'call': case 'pledge': click(`${a.t}-${a.a}`); break
    case 'lend': click(`lend-${a.o}`); break
    case 'reassure': case 'holiday': case 'open': click(a.t); break
    case 'transfer':
      click(`transfer-from-${a.from}`)
      act(() => { fireEvent.change(screen.getByTestId('amount'), { target: { value: String(a.amt) } }) })
      click('transfer'); break
    case 'pool':
      act(() => { fireEvent.change(screen.getByTestId('amount'), { target: { value: String(a.amt) } }) })
      click('pool'); break
  }
}

describe('BankRunGame component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(BankRunGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByTestId('bank-day').textContent).toContain('Day 1')
      cleanup()
    }
  })

  for (const id of CONFIG_IDS) {
    it(`a planner-driven win calls onWin once (${id})`, () => {
      vi.useFakeTimers()
      const onWin = vi.fn(), onLose = vi.fn()
      const { solution } = makeLevel(id, 3, 11)
      render(createElement(BankRunGame, { configId: id, difficulty: 3, seed: 11, onWin, onLose }))
      for (const a of solution.path) clickAction(a)
      expect(screen.queryByTestId('open')).toBeNull() // settled: no more moves
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
    })
  }

  it('opening the doors without raising cash calls onLose once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const inst = makeLevel('panic-1907', 4, 5).inst
    render(createElement(BankRunGame, { configId: 'panic-1907', difficulty: 4, seed: 5, onWin, onLose }))
    for (let i = 0; i < inst.turns + 3; i++) {
      const b = screen.queryByTestId('open')
      if (b) act(() => { fireEvent.click(b) })
    }
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
