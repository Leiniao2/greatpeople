// Merchant Board: rules (tolls, sets, bankruptcy, rounds), each config's rule
// twist, determinism, the time budget, a strong scripted merchant that wins
// every config × difficulty × seed once playableSeed has chosen the seed, and
// a component that wins/loses once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import TradeBoardGame, {
  CONFIG_IDS, CONFIGS, buildBoard, rulesFor, roundsFor, initialState, roll, steer, decideBuy, endTurn, build, buildable, tollAt, wealth,
  simulate, strongTurn, strongBuy, strongSteer, playableSeed, newTrade, makeGame, rollFor, roll3For, priceOf, costOf, charterPoints,
  bestRival, upgradeCost, TOLL_MULT, BUYOUT_MULT, INFLATION, SET_BONUS, type TradeGame, type TradeState,
} from '@/components/minigames/TradeBoardGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006]

const gameOf = (id: string, d: Difficulty, seed: number): TradeGame => makeGame(id, d, seed)

/** Never buys or builds: just rolls (sailing by the first two dice) and ends the turn. */
const passive = (g: TradeGame, s: TradeState): TradeState => {
  let t = roll(g, s)
  if (t.phase === 'steer') t = steer(g, t, 2)
  if (t.phase === 'buy') t = decideBuy(g, t, false)
  return endTurn(g, t)
}

describe('merchant board rules', () => {
  it('has a 20-square board with 12 ports in five sets', () => {
    for (const id of CONFIG_IDS) {
      const b = buildBoard(CONFIGS[id])
      expect(b.length).toBe(20)
      expect(b.filter(x => x.kind === 'port').length).toBe(12)
      expect(new Set(b.filter(x => x.kind === 'port').map(x => x.group)).size).toBe(5)
      expect(b[0].kind).toBe('start')
    }
  })

  it('every config is a different rule twist, with text explaining it', () => {
    expect(CONFIG_IDS.length).toBeGreaterThanOrEqual(4)
    // The base configs are each a different twist; story-themed configs reuse one of them.
    const BASE = ['venice', 'hansa', 'silk-road', 'spice']
    expect(new Set(BASE.map(id => CONFIGS[id].variant)).size).toBe(BASE.length)
    for (const id of CONFIG_IDS) expect(BASE.map(b => CONFIGS[b].variant), id).toContain(CONFIGS[id].variant)
    for (const id of CONFIG_IDS) {
      expect(CONFIGS[id].twist.length, id).toBeGreaterThan(40)
      expect(CONFIGS[id].rivals.length).toBeGreaterThanOrEqual(3)
      expect(CONFIGS[id].ports.length).toBe(12)
    }
    // Existing ids keep working.
    for (const id of ['venice', 'hansa', 'silk-road']) expect(CONFIGS[id]).toBeDefined()
  })

  it('time budget: a season is 8–10 rounds, so a game is about 1 to 2 minutes', () => {
    expect(roundsFor(1)).toBeLessThanOrEqual(8)
    for (const d of DIFFS) {
      expect(roundsFor(d)).toBeLessThanOrEqual(10)
      if (d > 1) expect(roundsFor(d)).toBeGreaterThanOrEqual(roundsFor((d - 1) as Difficulty))
    }
    // The strong merchant never needs more than one season (≤ 10 of your turns).
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const end = simulate(newTrade(id, d, 5))
      expect(end.round, `${id} d${d}`).toBeLessThanOrEqual(10)
    }
  })

  it('dice are seeded, and your choices never change where anyone moves (outside piloting)', () => {
    expect(rollFor(5, 3, 1)).toEqual(rollFor(5, 3, 1))
    expect(roll3For(5, 3, 1).slice(0, 2)).toEqual(rollFor(5, 3, 1))
    const g = gameOf('hansa', 2, 11)
    expect(JSON.stringify(simulate(g, strongTurn))).toBe(JSON.stringify(simulate(g, strongTurn)))
    let a = initialState(g), b = initialState(g)
    for (let k = 0; k < 4; k++) {
      a = strongTurn(g, a); b = passive(g, b)
      if (a.result || b.result) break
      expect(a.players.map(p => p.pos)).toEqual(b.players.map(p => p.pos))
    }
  })

  it('tolls double on a complete set and rise with warehouses', () => {
    const g = gameOf('hansa', 1, 3)
    const s = initialState(g)
    const set = g.board.map((x, i) => (x.kind === 'port' && x.group === 0 ? i : -1)).filter(i => i >= 0)
    s.owner[set[0]] = 1
    const base = tollAt(g, s, set[0])
    expect(base).toBe(g.board[set[0]].price! / 4)
    s.owner[set[1]] = 1
    expect(tollAt(g, s, set[0])).toBe(base * TOLL_MULT[0])
    s.level[set[0]] = 2
    expect(tollAt(g, s, set[0])).toBe(base * TOLL_MULT[2])
    expect(buildable(g, s, 0)).toEqual([])
    s.owner[set[0]] = 0; s.owner[set[1]] = 0; s.level[set[0]] = 0
    expect(buildable(g, s, 0).sort()).toEqual(set.sort())
    const before = wealth(g, s, 0)
    const after = build(g, { ...s, phase: 'roll' }, set[0])
    expect(after.level[set[0]]).toBe(1)
    expect(wealth(g, after, 0)).toBe(before) // cash turned into a warehouse
  })

  it('a passive merchant runs out of rounds and loses', () => {
    for (const id of CONFIG_IDS) {
      let lost = 0
      for (const seed of SEEDS) {
        const s = simulate(gameOf(id, 4, seed), passive)
        expect(s.result).not.toBeNull()
        if (s.result === 'lost') lost++
      }
      expect(lost, id).toBeGreaterThanOrEqual(SEEDS.length - 1)
    }
  })

  it('the goal is a real bar: at D4 some raw seeds defeat even the strong merchant', () => {
    for (const id of CONFIG_IDS) {
      const rejected = [...Array(20)].filter((_, k) => simulate(gameOf(id, 4, k + 1)).result !== 'won').length
      expect(rejected, id).toBeGreaterThan(0)
    }
  })

  for (const id of CONFIG_IDS) for (const d of DIFFS) {
    it(`${id} d${d}: playable seeds are winnable by the strong merchant`, () => {
      let firstTry = 0
      for (const seed of SEEDS) {
        const { seed: s, tries } = playableSeed(id, d, seed)
        expect(tries, `${id} d${d} ${seed}`).toBeGreaterThan(0)
        if (tries === 1) firstTry++
        const g = newTrade(id, d, seed)
        expect(g.seed).toBe(s)
        const end = simulate(g)
        expect(end.result).toBe('won')
        expect(end.round).toBeLessThanOrEqual(g.rules.rounds)
        expect(end.players.length).toBe(1 + rulesFor(d).rivals)
      }
      if (d === 1) expect(firstTry, 'D1 raw seeds often win first time').toBeGreaterThanOrEqual(1)
    })
  }
})

describe('merchant board variants', () => {
  it('pilot (Venice): three dice, you sail by the two you pick', () => {
    const g = gameOf('venice', 2, 9)
    const s = roll(g, initialState(g))
    expect(s.phase).toBe('steer')
    expect(s.dice!.length).toBe(3)
    const dests = [0, 1, 2].map(k => steer(g, s, k).players[0].pos)
    const sums = [0, 1, 2].map(k => s.dice!.reduce((a, b, j) => (j === k ? a : a + b), 0))
    expect(dests).toEqual(sums.map(x => x % 20))
    // Rolling twice from the same state is the same; you cannot build mid-steer.
    expect(roll(g, initialState(g)).dice).toEqual(s.dice)
    expect(build(g, s, 1)).toBe(s)
    // Steering beats sailing blind for the strong merchant.
    let steered = 0, blind = 0
    for (let seed = 1; seed <= 30; seed++) {
      const gg = gameOf('venice', 3, seed)
      if (simulate(gg).result === 'won') steered++
      if (simulate(gg, strongTurnFixed).result === 'won') blind++
    }
    expect(steered).toBeGreaterThan(blind)
  })

  it('buyout (Hansa): buy a rival out at 1.25× and score charter points, not wealth', () => {
    const g = gameOf('hansa', 2, 4)
    const s = initialState(g)
    const set = g.board.map((x, i) => (x.kind === 'port' && x.group === 1 ? i : -1)).filter(i => i >= 0)
    s.owner[set[0]] = 1
    expect(costOf(g, s, set[0])).toBe(Math.round(g.board[set[0]].price! * BUYOUT_MULT))
    // Put yourself on the rival's port with a buyout pending.
    s.players[0].pos = set[0]; s.phase = 'buy'; s.offer = 'buyout'
    const rivalCash = s.players[1].cash
    const t = decideBuy(g, s, true)
    expect(t.owner[set[0]]).toBe(0)
    expect(t.players[1].cash).toBe(rivalCash + costOf(g, s, set[0]))
    expect(charterPoints(g, t, 0)).toBe(1)
    t.owner[set[1]] = 0; t.owner[set[2]] = 0
    expect(charterPoints(g, t, 0)).toBe(3 + SET_BONUS)
    // A rich merchant with no ports does not win the charter.
    const richGame: TradeGame = { ...g, rules: { ...g.rules, startCash: 5000 } }
    expect(simulate(richGame, passive).result).toBe('lost')
    expect(strongBuy(g, { ...s, players: s.players.map((p, k) => (k ? p : { ...p, cash: 0 })) })).toBe(false)
  })

  it('boom (Silk Road): prices, tolls and wealth inflate each round', () => {
    const g = gameOf('silk-road', 2, 4)
    const s = initialState(g)
    const port = g.board.findIndex(x => x.kind === 'port' && x.group === 4)
    expect(priceOf(g, s, port)).toBe(g.board[port].price)
    const later = { ...s, round: 6 }
    expect(priceOf(g, later, port)).toBe(Math.round((g.board[port].price! * (1 + 5 * INFLATION)) / 5) * 5)
    s.owner[port] = 1
    later.owner = s.owner
    expect(tollAt(g, later, port)).toBeGreaterThan(tollAt(g, s, port))
    expect(wealth(g, later, 1)).toBeGreaterThan(wealth(g, s, 1))
    expect(upgradeCost(priceOf(g, later, port))).toBeGreaterThan(upgradeCost(priceOf(g, s, port)))
    // Other variants never inflate.
    const v = gameOf('venice', 2, 4)
    expect(priceOf(v, { ...initialState(v), round: 8 }, port)).toBe(v.board[port].price)
  })

  it('rivalry (Spice): no fixed target — judged against the richest rival at the season end', () => {
    for (const d of DIFFS) {
      const g = newTrade('spice', d, 3)
      const end = simulate(g)
      expect(end.result).toBe('won')
      // Either every rival went bankrupt, or the season ran out with you clear by the margin.
      if (end.players.slice(1).some(p => p.alive)) {
        expect(end.round).toBe(g.rules.rounds)
        expect(wealth(g, end, 0)).toBeGreaterThanOrEqual(bestRival(g, end) + g.rules.margin)
      }
    }
    // Being rich mid-season does not end the game.
    const g = gameOf('spice', 1, 2)
    let s = initialState(g)
    s.players[0].cash = 99_999
    s = endTurn(g, { ...roll(g, s), phase: 'end' })
    expect(s.result).toBeNull()
  })
})

/** Venice played like strongTurn, but always dropping the third die. */
function strongTurnFixed(g: TradeGame, s0: TradeState): TradeState {
  let s = roll(g, s0)
  if (s.phase === 'steer') s = steer(g, s, 2)
  if (s.phase === 'buy') s = decideBuy(g, s, strongBuy(g, s))
  if (s.result) return s
  for (let k = 0; k < 6; k++) {
    const opts = buildable(g, s, 0).filter(i => s.players[0].cash - upgradeCost(priceOf(g, s, i)) >= 60)
    if (!opts.length) break
    s = build(g, s, opts[0])
  }
  return s.result ? s : endTurn(g, s)
}

describe('TradeBoardGame component', () => {
  it('renders every config at every difficulty, with its twist', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container } = render(createElement(TradeBoardGame, { configId: id, difficulty: d, seed: 4, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelectorAll('[data-square]').length).toBe(20)
      expect(screen.getByTestId('trade-round').textContent).toMatch(/Round 1\//)
      expect(screen.getByTestId('trade-twist').textContent).toContain(CONFIGS[id].twist)
      cleanup()
    }
  })

  /** Click through the UI the way strongTurn plays. */
  function playThroughUi(policy: 'strong' | 'passive', id: string, d: Difficulty, seed: number) {
    const g = newTrade(id, d, seed)
    let s = initialState(g)
    for (let k = 0; k < 60 && !s.result; k++) {
      const builds = (st: TradeState) => {
        if (policy !== 'strong') return st
        for (let j = 0; j < 6; j++) {
          const opts = buildable(g, st, 0).filter(i => st.players[0].cash - upgradeCost(priceOf(g, st, i)) >= 60)
          if (!opts.length) break
          const i = opts.sort((a, b) => st.level[a] - st.level[b] || g.board[b].price! - g.board[a].price!)[0]
          act(() => { fireEvent.click(screen.getByText(new RegExp(`Warehouse in ${g.board[i].name} `))) })
          st = build(g, st, i)
        }
        return st
      }
      s = builds(s)
      if (s.result) break
      act(() => { fireEvent.click(screen.getByText('🎲 Roll')) })
      s = roll(g, s)
      if (s.phase === 'steer') {
        const drop = policy === 'strong' ? strongSteer(g, s) : 2
        act(() => { fireEvent.click(document.querySelector(`[data-steer="${drop}"]`)!) })
        s = steer(g, s, drop)
      }
      if (s.result) break
      if (s.phase === 'buy') {
        const yes = policy === 'strong' && strongBuy(g, s)
        act(() => { fireEvent.click(yes ? screen.getByText(/^Buy/) : screen.getByText('Pass')) })
        s = decideBuy(g, s, yes)
      }
      if (s.result) break
      s = builds(s)
      if (s.result) break
      act(() => { fireEvent.click(screen.getByText('End turn ▶')) })
      s = endTurn(g, s)
      if (!s.result) expect(s.round).toBe(Number(screen.getByTestId('trade-round').textContent!.match(/Round (\d+)/)![1]))
    }
    return s
  }

  for (const [id, d] of [['venice', 3], ['hansa', 2], ['silk-road', 1], ['spice', 4]] as [string, Difficulty][]) {
    it(`${id}: the strong merchant clicking through the UI calls onWin once`, () => {
      vi.useFakeTimers()
      const onWin = vi.fn(), onLose = vi.fn()
      render(createElement(TradeBoardGame, { configId: id, difficulty: d, seed: 8, onWin, onLose }))
      const s = playThroughUi('strong', id, d, 8)
      expect(s.result).toBe('won')
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
    })
  }

  it('a merchant who never buys runs out the season and onLose fires once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const seed = [1, 2, 3, 4, 5, 6, 7, 8].find(x => simulate(newTrade('hansa', 2, x), passive).result === 'lost')!
    render(createElement(TradeBoardGame, { configId: 'hansa', difficulty: 2, seed, onWin, onLose }))
    const s = playThroughUi('passive', 'hansa', 2, seed)
    expect(s.result).toBe('lost')
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
