// Grand Bazaar: the haggling rules of each market, every config × difficulty
// × seed is won by the feedback-only solver and lost by doing nothing (and,
// at D3–D4, by paying the ask or lowballing), and the component settles once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import BazaarGame, {
  CONFIG_IDS, apply, makeLevel, run, solve, startState, status, safeLine, lowestNow, listNow, crowdOf,
  payAskPolicy, lowballPolicy, idlePolicy,
  type Action, type BazaarState, type Level, type Merchant, type Market,
} from '@/components/minigames/BazaarGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 7, 42, 1006]

function mini(market: Market, merchants: Partial<Merchant>[], extra: Partial<Level> = {}): Level {
  return {
    configId: 'x', difficulty: 1, market, insult: 0.75, safeShare: 0.56,
    goods: [{ name: 'Silk', icon: '' }, { name: 'Tea', icon: '' }],
    guide: [{ lo: 50, mid: 60, hi: 90 }, { lo: 50, mid: 60, hi: 90 }],
    merchants: merchants.map(m => ({ name: 'M', good: 0, ask0: 100, r0: 60, patience: 2, soldAt: null, ...m })),
    purse: 1000, rounds: 20, dayLength: 0, decay: 0.05, fine: 10, par: 0, ...extra,
  }
}
function step(lv: Level, st: BazaarState, a: Action) {
  const r = apply(lv, st, a)
  expect(r.ok).toBe(true)
  return r as Extract<typeof r, { ok: true }>
}

describe('bazaar rules', () => {
  it('counters half-way, turns firm at the lowest price, accepts at or above it', () => {
    const lv = mini('night', [{}], { decay: 0, insult: 0.6 })
    const a = step(lv, startState(lv), { t: 'offer', m: 0, x: 40 })
    expect(a.react).toBe('counter')
    expect(a.state.ms[0].ask).toBe(70)
    expect(a.state.round).toBe(1)
    const b = step(lv, a.state, { t: 'offer', m: 0, x: 46 })
    expect(b.react).toBe('firm')
    expect(b.state.ms[0].ask).toBe(60)
    const c = step(lv, b.state, { t: 'accept', m: 0 })
    expect(c.state.purse).toBe(940)
    expect(c.state.have[0]).toBe(true)
    const d = step(lv, startState(lv), { t: 'offer', m: 0, x: 60 })
    expect(d.react).toBe('accept')
  })

  it('patience runs out: one more low offer and he walks; an insult walks at once', () => {
    const lv = mini('night', [{}], { decay: 0 })
    let st = startState(lv)
    st = step(lv, st, { t: 'offer', m: 0, x: 46 }).state
    st = step(lv, st, { t: 'offer', m: 0, x: 46 }).state
    const w = step(lv, st, { t: 'offer', m: 0, x: 46 })
    expect(w.react).toBe('walk')
    expect(status(lv, w.state)).toEqual({ state: 'lost', reason: 'No one will sell you silk' })
    expect(step(lv, startState(lv), { t: 'offer', m: 0, x: 44 }).react).toBe('walk') // < 0.75 × 60
    expect(apply(lv, startState(lv), { t: 'offer', m: 0, x: 2000 }).ok).toBe(false) // beyond the purse
  })

  it('guild: an offer below the floor closes the whole row; above it never insults', () => {
    const lv = mini('guild', [{}, {}, { good: 1 }])
    const low = step(lv, startState(lv), { t: 'offer', m: 0, x: 49 })
    expect(low.react).toBe('banned')
    expect(low.state.ms.map(s => s.status)).toEqual(['walked', 'walked', 'open'])
    expect(step(lv, startState(lv), { t: 'offer', m: 0, x: 50 }).react).toBe('counter')
  })

  it('judges: the fair price is always taken; an insult costs a fine but the seller stays', () => {
    const lv = mini('judges', [{ r0: 80, ask0: 90 }], { insult: 0.8 })
    expect(step(lv, startState(lv), { t: 'offer', m: 0, x: 90 }).react).toBe('accept')
    const f = step(lv, startState(lv), { t: 'offer', m: 0, x: 60 })
    expect(f.react).toBe('fined')
    expect(f.state.purse).toBe(990)
    expect(f.state.ms[0].status).toBe('open')
  })

  it('board: the gong resets every unfinished haggle', () => {
    const lv = mini('board', [{}], { dayLength: 3, rounds: 6 })
    let st = step(lv, startState(lv), { t: 'offer', m: 0, x: 50 }).state
    expect(st.ms[0].ask).toBe(75)
    st = step(lv, st, { t: 'wait' }).state
    st = step(lv, st, { t: 'wait' }).state
    expect(st.round).toBe(3)
    expect(st.ms[0].ask).toBe(100)
    expect(st.ms[0].left).toBe(2)
  })

  it('silent: no counter, a pile is taken whole or left; a pile below 72% of the price insults', () => {
    const lv = mini('silent', [{ r0: 70 }], { insult: 0.72 })
    const r = step(lv, startState(lv), { t: 'offer', m: 0, x: 60 })
    expect(r.react).toBe('refuse')
    expect(r.state.ms[0].ask).toBe(100)
    expect(step(lv, startState(lv), { t: 'offer', m: 0, x: 66 }).react).toBe('close')
    expect(step(lv, startState(lv), { t: 'offer', m: 0, x: 80 }).state.purse).toBe(920)
    expect(step(lv, startState(lv), { t: 'offer', m: 0, x: 50 }).react).toBe('walk')
    expect(apply(lv, startState(lv), { t: 'accept', m: 0 }).ok).toBe(false)
  })

  it('night: prices fall each watch and a crowd warns two turns before a stall sells out', () => {
    const lv = mini('night', [{ soldAt: 3 }, { good: 1 }])
    let st = startState(lv)
    expect(crowdOf(lv, st, 0)).toBe(0)
    st = step(lv, st, { t: 'wait' }).state
    expect(crowdOf(lv, st, 0)).toBe(2)
    expect(st.ms[0].ask).toBe(95)
    expect(lowestNow(lv, 0, 1)).toBe(57)
    st = step(lv, st, { t: 'wait' }).state
    expect(crowdOf(lv, st, 0)).toBe(1)
    st = step(lv, st, { t: 'wait' }).state
    expect(st.ms[0].status).toBe('sold')
    expect(listNow(lv, 1, 100)).toBe(60) // floor at 60% of the list
  })
})

describe('bazaar levels', () => {
  it('every config × difficulty × seed: solver wins, idling loses, naive play loses at D3–D4', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const looks = new Set<string>()
      for (const seed of SEEDS) {
        const lv = makeLevel(id, d, seed)
        const tag = `${id} d${d} s${seed}`
        expect(lv.goods.length, tag).toBe(d + 1)
        expect(status(lv, startState(lv)).state, tag).toBe('play')
        const sol = solve(lv)
        expect(sol.won, tag).toBe(true)
        expect(sol.state.fines, tag).toBe(0)
        expect(sol.spent, tag).toBeLessThanOrEqual(lv.purse)
        expect(run(lv, idlePolicy).won, tag).toBe(false)
        expect(run(lv, lowballPolicy).won, tag).toBe(false)
        if (d >= 3) expect(run(lv, payAskPolicy).won, `${tag} pay ask`).toBe(false)
        // The safe line really is safe: it never insults.
        lv.merchants.forEach((_, i) => {
          if (lv.market === 'guild') return
          expect(safeLine(lv, i, 0), tag).toBeGreaterThanOrEqual(lv.insult * lowestNow(lv, i, 0))
        })
        looks.add(JSON.stringify(lv.merchants.map(m => [m.ask0, m.r0])))
      }
      expect(looks.size, `${id} d${d}`).toBeGreaterThan(1)
    }
  })

  it('is deterministic per seed and story params override the frame', () => {
    expect(makeLevel('tlatelolco', 3, 9)).toEqual(makeLevel('tlatelolco', 3, 9))
    render(createElement(BazaarGame, { configId: 'tlatelolco', difficulty: 1, seed: 1, params: { title: 'Pochteca Feast' }, onWin: () => {}, onLose: () => {} }))
    expect(screen.getByText(/Pochteca Feast/)).toBeTruthy()
  })
})

function click(a: Action) {
  if (a.t === 'wait') { act(() => { fireEvent.click(screen.getByTestId('wait')) }); return }
  act(() => { fireEvent.click(screen.getByTestId(`stall-${a.m}`)) })
  if (a.t === 'accept') { act(() => { fireEvent.click(screen.getByTestId('accept')) }); return }
  act(() => { fireEvent.change(screen.getByTestId('offer-input'), { target: { value: String(a.x) } }) })
  act(() => { fireEvent.click(screen.getByTestId('offer')) })
}

describe('BazaarGame component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(BazaarGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByTestId('bazaar-purse').textContent).toContain(String(makeLevel(id, d, 3).purse))
      cleanup()
    }
  })

  for (const id of CONFIG_IDS) {
    it(`a solver-driven win calls onWin once (${id})`, () => {
      vi.useFakeTimers()
      const onWin = vi.fn(), onLose = vi.fn()
      const lv = makeLevel(id, 2, 11)
      render(createElement(BazaarGame, { configId: id, difficulty: 2, seed: 11, onWin, onLose }))
      for (const a of solve(lv).actions) click(a)
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
    })
  }

  it('waiting out the market calls onLose once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const lv = makeLevel('changan-west', 1, 5)
    render(createElement(BazaarGame, { configId: 'changan-west', difficulty: 1, seed: 5, onWin, onLose }))
    for (let i = 0; i < lv.rounds + 3; i++) {
      const b = screen.queryByTestId('wait')
      if (b) act(() => { fireEvent.click(b) })
    }
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('breaking the guild floor everywhere calls onLose once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(BazaarGame, { configId: 'istanbul-bedesten', difficulty: 3, seed: 2, onWin, onLose }))
    click({ t: 'offer', m: 0, x: 1 })
    expect(screen.queryByTestId('offer')).toBeNull()
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
