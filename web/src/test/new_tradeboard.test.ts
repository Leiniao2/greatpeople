// Merchant Board: rules (tolls, sets, bankruptcy, rounds), determinism, a
// strong scripted merchant that wins every config × difficulty × seed once
// playableSeed has chosen the seed, and a component that wins/loses once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import TradeBoardGame, {
  CONFIG_IDS, CONFIGS, buildBoard, rulesFor, initialState, roll, decideBuy, endTurn, build, buildable, tollAt, wealth,
  simulate, strongTurn, playableSeed, newTrade, rollFor, TOLL_MULT, type TradeGame, type TradeState,
} from '@/components/minigames/TradeBoardGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006]

const gameOf = (id: string, d: Difficulty, seed: number): TradeGame =>
  ({ configId: id, seed, cfg: CONFIGS[id], board: buildBoard(CONFIGS[id]), rules: rulesFor(d) })

/** Never buys or builds: just rolls and ends the turn. */
const passive = (g: TradeGame, s: TradeState): TradeState => {
  let t = roll(g, s)
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

  it('dice are seeded, and your choices never change where anyone moves', () => {
    expect(rollFor(5, 3, 1)).toEqual(rollFor(5, 3, 1))
    const g = gameOf('venice', 2, 11)
    expect(JSON.stringify(simulate(g, strongTurn))).toBe(JSON.stringify(simulate(g, strongTurn)))
    // Play the first rounds two different ways: every position matches.
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
    // You can build only on your own complete sets.
    expect(buildable(g, s, 0)).toEqual([])
    s.owner[set[0]] = 0; s.owner[set[1]] = 0; s.level[set[0]] = 0
    expect(buildable(g, s, 0).sort()).toEqual(set.sort())
    const before = wealth(g, s, 0)
    const after = build(g, { ...s, phase: 'roll' }, set[0])
    expect(after.level[set[0]]).toBe(1)
    expect(wealth(g, after, 0)).toBe(before) // cash turned into a warehouse
  })

  it('a passive merchant runs out of rounds and loses', () => {
    let lost = 0
    for (const seed of SEEDS) {
      const s = simulate(gameOf('silk-road', 4, seed), passive)
      expect(s.result).not.toBeNull()
      if (s.result === 'lost') lost++
    }
    expect(lost).toBeGreaterThanOrEqual(SEEDS.length - 1)
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
      // The target is a real bar: some raw seeds need a re-roll at the top tiers.
      if (d === 1) expect(firstTry).toBeGreaterThanOrEqual(3)
    })
  }
})

describe('TradeBoardGame component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container } = render(createElement(TradeBoardGame, { configId: id, difficulty: d, seed: 4, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelectorAll('[data-square]').length).toBe(20)
      expect(screen.getByTestId('trade-round').textContent).toMatch(/Round 1\//)
      cleanup()
    }
  })

  /** Click through the UI the way strongTurn plays. */
  function playThroughUi(policy: 'strong' | 'passive', id: string, d: Difficulty, seed: number) {
    const g = newTrade(id, d, seed)
    let s = initialState(g)
    for (let k = 0; k < 60 && !s.result; k++) {
      // Build like the strong merchant, through the warehouse buttons.
      const builds = (st: TradeState) => {
        if (policy !== 'strong') return st
        for (let j = 0; j < 6; j++) {
          const opts = buildable(g, st, 0).filter(i => st.players[0].cash - g.board[i].price! / 2 >= 60)
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
      if (s.result) break
      if (s.phase === 'buy') {
        const yes = policy === 'strong' && s.players[0].cash - g.board[s.players[0].pos].price! >= 20
        act(() => { fireEvent.click(yes ? screen.getByText(/^Buy /) : screen.getByText('Pass')) })
        s = decideBuy(g, s, yes)
      }
      s = builds(s)
      if (s.result) break
      act(() => { fireEvent.click(screen.getByText('End turn ▶')) })
      s = endTurn(g, s)
      expect(s.round).toBe(Number(screen.getByTestId('trade-round').textContent!.match(/Round (\d+)/)![1]))
    }
    return s
  }

  it('the strong merchant clicking through the UI calls onWin once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(TradeBoardGame, { configId: 'venice', difficulty: 3, seed: 8, onWin, onLose }))
    const s = playThroughUi('strong', 'venice', 3, 8)
    expect(s.result).toBe('won')
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onWin).toHaveBeenCalledTimes(1)
    expect(onLose).not.toHaveBeenCalled()
  })

  it('a merchant who never buys runs out the season and onLose fires once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    // Find a seed where passive play loses.
    const seed = [1, 2, 3, 4, 5, 6, 7, 8].find(x => simulate(newTrade('hansa', 2, x), passive).result === 'lost')!
    render(createElement(TradeBoardGame, { configId: 'hansa', difficulty: 2, seed, onWin, onLose }))
    const s = playThroughUi('passive', 'hansa', 2, seed)
    expect(s.result).toBe('lost')
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
