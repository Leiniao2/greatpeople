// Tulip Mania: the market rules of each variant, every config × difficulty ×
// seed is planner-verified (the planner wins, doing nothing and naive
// strategies lose), and the component reports a win or a loss exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import TulipsGame, {
  CONFIG_IDS, CONFIGS, CRASH_AT, apply, buyAndHold, isWon, makeLevel, makeMarket, maxBuy, maxConvert, maxSell, play, runPolicy,
  sellOnFirstDrop, settleValue, solve, startState, subOffer, type Action, type Level, type Policy, type TState,
} from '@/components/minigames/TulipsGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 7, 42]

function must(L: Level, s: TState, a: Action): TState {
  const r = apply(L, s, a)
  expect(r.ok, JSON.stringify(a)).toBe(true)
  return (r as { state: TState }).state
}

/** A level with the goal set out of reach, so rules can be probed without the game ending. */
const probe = (id: string, d: Difficulty = 2, seed = 1): Level => ({ ...makeMarket(id, d, seed), goal: Infinity })

// ── Policies ────────────────────────────────────────────────────────────────

const nothing: Policy = () => null

/**
 * A signal-reading player: buy while buyers keep coming (keeping cash for
 * the next call, staying at 50% margin), and once fewer buyers turn up
 * than the week before, sell into them and realise.
 */
const reader: Policy = (L, s) => {
  const B = L.buyers
  const fading = B.slice(1, s.t + 1).some((b, i) => b < B[i])
  if (!fading) {
    const o = subOffer(L, s)
    if (o && o.left > 0) return { t: 'subscribe', n: o.left }
    let n = maxBuy(L, s)
    const P = L.price[s.t]
    const call = L.calls.find(c => c.turn > s.t)
    if (call) while (n > 0 && s.cash - n * P < (s.pos + n) * call.amount) n--
    if (L.mode === 'margin') while (n > 0 && s.cash + s.pos * P < 0.5 * (s.pos + n) * P) n--
    return n > 0 ? { t: 'buy', n } : null
  }
  const k = maxSell(L, s)
  if (k > 0) return { t: 'sell', n: k }
  const c = maxConvert(L, s)
  return c > 0 ? { t: 'convert', notes: c } : null
}

// ── Rules ────────────────────────────────────────────────────────────────────

describe('tulip market rules', () => {
  it('the momentum model: buyers fade and credit climbs before the crash, and prices never rise after it', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const seed of SEEDS) {
      const L = makeMarket(id, d, seed)
      expect(Math.abs(L.crash - CRASH_AT[d]), `${id} d${d} s${seed}`).toBeLessThanOrEqual(1)
      const peakBuyers = Math.max(...L.buyers.slice(0, L.crash))
      expect(L.buyers[L.crash - 1]).toBeLessThan(peakBuyers)
      expect(L.credit[L.crash - 1]).toBeGreaterThan(L.credit[0])
      for (let t = L.crash; t < L.price.length - 1; t++) expect(L.price[t + 1]).toBeLessThanOrEqual(L.price[t])
      expect(L.price[L.crash]).toBeLessThan(L.price[L.crash - 1] + (L.mode === 'paper' ? 1 : 0))
      // After the crash buyers stop coming: one lot a week.
      if (L.mode !== 'paper') expect(L.sellCap[L.crash + 1]).toBe(L.buyCap / 3)
    }
  })

  it('selling is capped by the buyers who turn up; buying by cash', () => {
    const L = probe('south-sea-1720')
    let s = startState(L)
    expect(maxBuy(L, s)).toBe(3)
    s = must(L, s, { t: 'buy', n: 3 })
    expect(s.cash).toBe(1000 - 3 * L.price[0])
    expect(apply(L, s, { t: 'buy', n: 1 }).ok).toBe(false)
    expect(maxSell(L, s)).toBe(Math.min(3, L.sellCap[0]))
    while (s.t < L.crash + 1) s = must(L, s, { t: 'next' })
    expect(maxSell(L, s)).toBe(1)
    expect(apply(L, s, { t: 'sell', n: 2 }).ok).toBe(false)
  })

  it('haarlem: deals settle later, and a buyer walks away for 3.5% when the price has fallen under ¾', () => {
    const L = probe('haarlem-1637', 3, 2)
    let s = must(L, startState(L), { t: 'buy', n: 2 })
    expect(s.cash).toBe(1000)
    expect(s.pending).toHaveLength(1)
    for (let i = 0; i < L.lag; i++) s = must(L, s, { t: 'next' })
    expect(s.pending).toHaveLength(0)
    expect(s.cash).toBe(1000 - 2 * L.price[0])
    const late = { due: L.crash + 3, deal: L.price[L.crash - 1], n: 1, buy: false }
    expect(L.price[late.due]).toBeLessThan(0.75 * late.deal)
    expect(settleValue(L, late)).toBeCloseTo(late.deal * 0.035)
    // Not won while a sale is still to settle.
    const W = { ...L, goal: 1001 }
    let w = must(W, startState(W), { t: 'buy', n: 1 })
    for (let i = 0; i < 3; i++) w = must(W, w, { t: 'next' })
    w = must(W, w, { t: 'sell', n: 1 })
    expect(w.pos).toBe(0)
    expect(isWon(W, w)).toBe(false)
  })

  it('south sea: subscriptions are cheap but locked until issued', () => {
    const L = probe('south-sea-1720', 3, 1)
    const sub = L.subs[0]
    expect(sub.price).toBeLessThan(L.price[sub.turn])
    let s = startState(L)
    while (s.t < sub.turn) s = must(L, s, { t: 'next' })
    s = must(L, s, { t: 'subscribe', n: 2 })
    expect(s.locked[0]).toBe(2)
    expect(s.pos).toBe(0)
    expect(apply(L, s, { t: 'sell', n: 1 }).ok).toBe(false)
    while (s.t < sub.unlock) s = must(L, s, { t: 'next' })
    expect(s.pos).toBe(2)
    expect(s.locked[0]).toBe(0)
    // The last subscription of a D3+ level is issued only after the crash.
    expect(L.subs[L.subs.length - 1].unlock).toBeGreaterThan(L.crash)
  })

  it('mississippi: notes inflate, only silver counts, the bank pays out a capped amount a week, and the peg buys everything', () => {
    const L = probe('mississippi-1720', 2, 1)
    let s = startState(L)
    expect(maxConvert(L, s)).toBeCloseTo(L.silverCap * L.cpi[0])
    s = must(L, s, { t: 'convert', notes: maxConvert(L, s) })
    expect(s.silver).toBeCloseTo(L.silverCap)
    expect(apply(L, s, { t: 'convert', notes: 10 }).ok).toBe(false)
    expect(L.cpi[L.T]).toBeGreaterThan(2 * L.cpi[L.crash])
    expect(L.sellCap[L.crash]).toBeGreaterThan(50)
    expect(L.price[L.crash]).toBe(L.price[L.crash - 1])
  })

  it('railway: a call must be paid on every share held, or the shares are forfeited', () => {
    const L = probe('railway-1840s', 2, 1)
    const call = L.calls[0]
    let s = startState(L)
    while (s.t < call.turn - 1) {
      const b = maxBuy(L, s)
      if (b > 0) s = must(L, s, { t: 'buy', n: b })
      s = must(L, s, { t: 'next' })
    }
    const b = maxBuy(L, s)
    if (b > 0) s = must(L, s, { t: 'buy', n: b })
    const held = s.pos
    const cash = s.cash
    expect(cash).toBeLessThan(held * call.amount)
    s = must(L, s, { t: 'next' })
    const paid = Math.min(held, Math.floor(cash / call.amount))
    expect(s.pos).toBe(paid)
    expect(s.cash).toBeCloseTo(cash - paid * call.amount)
    expect(paid).toBeLessThan(held)
  })

  it('margin: buy on 25% margin, pay interest, and a margin call sells you out at a discount', () => {
    const L = probe('margin-1929', 3, 1)
    let s = startState(L)
    expect(maxBuy(L, s)).toBe(6)
    s = must(L, s, { t: 'buy', n: 6 })
    expect(s.cash).toBe(1000 - 6 * L.price[0])
    // Fully loaded on margin into the crash: the broker sells you out.
    s = startState(L)
    let forced = false
    while (!s.over && s.t <= L.T) {
      const b = maxBuy(L, s)
      if (b > 0) s = must(L, s, { t: 'buy', n: b })
      const before = s.pos
      s = must(L, s, { t: 'next' })
      if (s.pos < before) forced = true
    }
    expect(forced).toBe(true)
    expect(s.over).toBe('lost')
    expect(L.initMargin[L.marginHike]).toBeGreaterThan(L.initMargin[0])
  })
})

// ── Levels ───────────────────────────────────────────────────────────────────

describe('tulip levels', () => {
  it('every config × difficulty × seed: the planner wins, idling and naive strategies lose, nothing is won at the start', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const looks = new Set<string>()
      for (const seed of SEEDS) {
        const tag = `${id} d${d} s${seed}`
        const L = makeLevel(id, d, seed)
        looks.add(L.price.join(','))
        expect(L.goal, tag).toBeGreaterThan(L.startCash)
        expect(isWon(L, startState(L)), tag).toBe(false)
        const sol = solve(L)
        expect(play(L, sol.path).over, `${tag} planner`).toBe('won')
        expect(runPolicy(L, nothing).over, `${tag} idle`).toBe('lost')
        if (d >= 3) {
          expect(runPolicy(L, buyAndHold).over, `${tag} buy & hold`).toBe('lost')
          expect(runPolicy(L, sellOnFirstDrop).over, `${tag} sell on the first drop`).toBe('lost')
        }
      }
      expect(looks.size, `${id} d${d} varies by seed`).toBeGreaterThan(1)
    }
  })

  it('reading the signals is rewarded: a simple signal-reader wins most D1 levels and some D4 ones', () => {
    for (const id of CONFIG_IDS) {
      const wins = (d: Difficulty) => SEEDS.concat([3, 5, 8, 13]).filter(seed => runPolicy(makeLevel(id, d, seed), reader).over === 'won').length
      expect(wins(1), `${id} d1`).toBeGreaterThanOrEqual(5)
      expect(wins(4), `${id} d4`).toBeLessThan(8)
    }
  })

  it('levels are deterministic in the seed', () => {
    const a = makeLevel('margin-1929', 4, 9), b = makeLevel('margin-1929', 4, 9)
    expect(a.price).toEqual(b.price)
    expect(a.goal).toBe(b.goal)
  })
})

// ── Component ────────────────────────────────────────────────────────────────

function click(id: string) { act(() => { fireEvent.click(screen.getByTestId(id)) }) }
function setQty(n: number) { act(() => { fireEvent.change(screen.getByTestId('tulip-qty'), { target: { value: String(n) } }) }) }

function clickAction(a: Action) {
  if (a.t === 'next') return click('tulip-next')
  if (a.t === 'convert') return click('tulip-convert-max')
  setQty(a.n)
  click(a.t === 'buy' ? 'tulip-buy' : a.t === 'sell' ? 'tulip-sell' : 'tulip-subscribe')
}

describe('TulipsGame component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(TulipsGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByTestId('tulip-week').textContent).toContain('Week 1')
      expect(screen.getByText(`Rule: ${CONFIGS[id].rule}`)).toBeTruthy()
      cleanup()
    }
  })

  for (const id of CONFIG_IDS) {
    it(`a planner-driven win calls onWin once (${id})`, () => {
      vi.useFakeTimers()
      const onWin = vi.fn(), onLose = vi.fn()
      const L = makeLevel(id, 2, 11)
      render(createElement(TulipsGame, { configId: id, difficulty: 2, seed: 11, onWin, onLose }))
      for (const a of solve(L).path) clickAction(a)
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
    })
  }

  it('buying and holding through the crash calls onLose once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const L = makeLevel('haarlem-1637', 3, 5)
    render(createElement(TulipsGame, { configId: 'haarlem-1637', difficulty: 3, seed: 5, onWin, onLose }))
    setQty(3)
    for (let i = 0; i < L.T + 4; i++) {
      if (!screen.queryByTestId('tulip-next')) break
      click('tulip-buy')
      click('tulip-next')
    }
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('idling until the market closes calls onLose once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const L = makeLevel('mississippi-1720', 1, 2)
    render(createElement(TulipsGame, { configId: 'mississippi-1720', difficulty: 1, seed: 2, onWin, onLose }))
    for (let i = 0; i <= L.T + 2; i++) if (screen.queryByTestId('tulip-next')) click('tulip-next')
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
