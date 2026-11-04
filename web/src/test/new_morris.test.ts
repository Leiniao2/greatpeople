// Morris: the rules engine for three/six/nine/twelve men's morris and the
// mill race, the time budget, the alpha-beta opponent (beaten by a search
// player at every config × difficulty), and the component's win/lose wiring.
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import MorrisGame, {
  CONFIGS, CONFIG_IDS, makeLayout, makeRules, initialState, legalMoves, applyMove, winner, removable, aiMove, searchBest,
  total, LIMITS, RACE_TO, type MState, type Variant, type Cell, type Rules,
} from '@/components/minigames/MorrisGame'
import { mulberry32 } from '@/components/minigames/_shared'
import type { Difficulty } from '@/games/types'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const VARIANTS: Variant[] = ['three', 'six', 'nine', 'twelve']

/** A board with your pieces at `mine` and the computer's at `theirs`. */
function pos(rules: Rules, mine: number[], theirs: number[], extra: Partial<MState> = {}): MState {
  const board: Cell[] = Array(rules.layout.pts.length).fill(0)
  mine.forEach(i => { board[i] = 1 })
  theirs.forEach(i => { board[i] = 2 })
  return { board, hand: [0, 0], turn: 1, moving: 0, ...extra }
}

describe('boards', () => {
  it('have the right points, mills and connections', () => {
    const three = makeLayout('three'), six = makeLayout('six'), nine = makeLayout('nine'), twelve = makeLayout('twelve')
    expect([three.pts.length, three.mills.length, three.adj[4].length]).toEqual([9, 8, 8])
    expect([six.pts.length, six.mills.length]).toEqual([16, 8])
    expect([nine.pts.length, nine.mills.length]).toEqual([24, 16])
    expect([twelve.pts.length, twelve.mills.length]).toEqual([24, 20])
    // Every nine men's point sits on exactly two mills; corners have two neighbours.
    for (let i = 0; i < 24; i++) expect(nine.mills.filter(m => m.includes(i)).length).toBe(2)
    expect(nine.adj[0].sort()).toEqual([1, 7])
    expect(nine.adj[9].sort((a, b) => a - b)).toEqual([1, 8, 10, 17])
    // Twelve men's adds the corner diagonals.
    expect(twelve.adj[8].sort((a, b) => a - b)).toEqual([0, 9, 15, 16])
    expect(six.flying).toBe(false)
    expect(nine.flying && twelve.flying).toBe(true)
  })
})

describe('rules', () => {
  const nine = makeRules('nine', 3)

  it('placement: every empty point, one piece from hand', () => {
    const s = initialState(nine)
    expect(legalMoves(nine, s)).toHaveLength(24)
    const t = applyMove(s, { from: -1, to: 5, remove: -1 })
    expect(t.hand).toEqual([8, 9])
    expect(t.turn).toBe(2)
    expect(legalMoves(nine, t)).toHaveLength(23)
  })

  it('a mill removes a piece, but not one from a mill unless all are', () => {
    // You: 0,1 waiting for 2. Computer: a mill at 8,9,10 plus a loose piece at 20.
    const s = pos(nine, [0, 1], [8, 9, 10, 20], { hand: [3, 3] })
    const ms = legalMoves(nine, s).filter(m => m.to === 2)
    expect(ms.map(m => m.remove)).toEqual([20])
    // With every computer piece in a mill, any of them may go.
    const t = pos(nine, [0, 1], [8, 9, 10], { hand: [3, 3] })
    expect(legalMoves(nine, t).filter(m => m.to === 2).map(m => m.remove).sort((a, b) => a - b)).toEqual([8, 9, 10])
    expect(removable(nine.layout, t.board, 2).sort((a, b) => a - b)).toEqual([8, 9, 10])
    const after = applyMove(s, ms[0])
    expect(after.board[20]).toBe(0)
    expect(total(after, 2)).toBe(6)
  })

  it('moving: slides to empty neighbours only; flying at three pieces', () => {
    const s = pos(nine, [0, 4, 12, 16], [1, 20, 21, 22])
    const from0 = legalMoves(nine, s).filter(m => m.from === 0).map(m => m.to)
    expect(from0).toEqual([7]) // 1 is occupied
    const fly = pos(nine, [0, 4, 12], [1, 20, 21, 22])
    expect(legalMoves(nine, fly).filter(m => m.from === 0)).toHaveLength(24 - 7)
    // Six men's never flies.
    const six = makeRules('six', 3)
    const s6 = pos(six, [0, 4, 12], [1, 9, 10, 11])
    expect(legalMoves(six, s6).filter(m => m.from === 0).map(m => m.to)).toEqual([7])
  })

  it('reduced to two pieces loses; blocked loses', () => {
    expect(winner(nine, pos(nine, [0, 1, 2], [20, 21]))).toBe(1)
    expect(winner(nine, pos(nine, [0, 1], [20, 21, 22]))).toBe(2)
    // You to move, every piece boxed in: 0 and 2 corners, 1 between them, all neighbours computer.
    const boxed = pos(nine, [0, 1, 2, 9], [7, 3, 10, 8, 17], { hand: [0, 0] })
    // 0: adj 1(own),7(c) ; 1: 0,2,9 own ; 2: 1,3(c) ; 9: 1,8(c),10(c),17(c)
    expect(legalMoves(nine, boxed)).toHaveLength(0)
    expect(winner(nine, boxed)).toBe(2)
    expect(winner(nine, { ...boxed, turn: 2 })).toBeNull()
  })

  it('the computer is beaten early at Levels 1–2', () => {
    expect(makeRules('nine', 1).loseAt).toEqual([2, 4])
    expect(makeRules('nine', 2).loseAt).toEqual([2, 3])
    expect(makeRules('six', 1).loseAt).toEqual([2, 3])
    expect(winner(makeRules('nine', 1), pos(nine, [0, 1, 2, 3, 4], [20, 21, 22, 23]))).toBe(1)
  })

  it('move limit: more pieces wins; a tie goes to you at L1–2, the computer at L3–4', () => {
    for (const d of DIFFS) {
      const r = makeRules('nine', d)
      const even = pos(r, [0, 1, 12, 13], [20, 21, 6, 15], { moving: r.limit })
      expect(winner(r, even)).toBe(d <= 2 ? 1 : 2)
      expect(winner(r, pos(r, [0, 1, 12, 13, 14], [20, 21, 6, 15], { moving: r.limit }))).toBe(1)
      expect(winner(r, pos(r, [0, 1, 12, 13], [20, 21, 6, 15, 16], { moving: r.limit }))).toBe(2)
    }
  })

  it("three men's: a line wins at once, diagonals included, and there are no removals", () => {
    const r = makeRules('three', 4)
    expect(winner(r, pos(r, [0, 4, 8], [1, 2, 5]))).toBe(1)
    expect(winner(r, pos(r, [0, 1, 5], [2, 4, 6], { turn: 1 }))).toBe(2)
    const s = pos(r, [0, 1], [3, 4], { hand: [1, 1] })
    expect(legalMoves(r, s).every(m => m.remove === -1)).toBe(true)
  })

  const forcedWin = (r: Rules, depth: number) => {
    const memo = new Map<string, boolean>()
    const forced = (s: MState, d: number): boolean => {
      const w = winner(r, s)
      if (w) return w === 1 && s.moving < r.limit
      if (d === 0) return false
      const k = `${s.board.join('')}${s.hand.join('')}${s.turn}${d}`
      const hit = memo.get(k)
      if (hit !== undefined) return hit
      const ms = legalMoves(r, s)
      const v = s.turn === 1 ? ms.some(m => forced(applyMove(s, m), d - 1)) : ms.every(m => forced(applyMove(s, m), d - 1))
      memo.set(k, v)
      return v
    }
    return forced(initialState(r), depth)
  }

  it("three men's at Levels 1–2 is a forced win for the opener (so it is always winnable)", () => {
    expect(forcedWin(makeRules('three', 1), 9)).toBe(true)
    expect(forcedWin(makeRules('three', 2), 9)).toBe(true)
  })

  it("three men's from Level 3: no centre on the first placement, and the easy forced win is gone", () => {
    const r = makeRules('three', 3)
    expect(r.noCentreOpen).toBe(true)
    expect(makeRules('three', 2).noCentreOpen).toBe(false)
    const first = legalMoves(r, initialState(r)).map(m => m.to)
    expect(first).toHaveLength(8)
    expect(first).not.toContain(4)
    // Only the opening placement is restricted.
    const after = applyMove(initialState(r), { from: -1, to: 0, remove: -1 })
    expect(legalMoves(r, after).map(m => m.to)).toContain(4)
    expect(forcedWin(r, 13)).toBe(false)
  })
})

describe('mill race (cloister-race)', () => {
  it('the first to take three pieces wins; you need only two at Level 1', () => {
    expect(CONFIGS['cloister-race'].race).toBe(true)
    expect(CONFIGS['cloister-race'].variant).toBe('nine')
    expect(RACE_TO).toEqual([2, 3, 3, 3])
    expect(makeRules('nine', 1, true).loseAt).toEqual([6, 7])
    expect(makeRules('nine', 4, true).loseAt).toEqual([6, 6])
    const r = makeRules('nine', 3, true)
    // Mid-placement, 9 v 9 pieces: taking a third piece wins on the spot.
    const s = pos(r, [0, 1], [8, 20, 21, 22], { hand: [7, 3] })
    const m = legalMoves(r, s).find(x => x.to === 2 && x.remove === 8)!
    expect(winner(r, applyMove(s, m))).toBe(1)
    // …and losing three of yours loses, with plenty still on the board.
    expect(winner(r, pos(r, [0, 1, 2, 3, 4, 5], [8, 9, 10, 11, 12, 13, 14, 15, 16]))).toBe(2)
    // The plain nine men's rules would play on.
    expect(winner(makeRules('nine', 3), pos(r, [0, 1, 2, 3, 4, 5], [8, 9, 10, 11, 12, 13, 14, 15, 16]))).toBeNull()
  })
})

describe('time budget', () => {
  it('moving-phase limits keep a game to at most ~22 of your moves at Level 1 and ~30 at Level 4', () => {
    for (const id of CONFIG_IDS) {
      const v = CONFIGS[id].variant
      const most = DIFFS.map(d => makeLayout(v).pieces + Math.ceil(makeRules(v, d, !!CONFIGS[id].race).limit / 2))
      expect(most[0], `${id} D1`).toBeLessThanOrEqual(22)
      expect(most[3], `${id} D4`).toBeLessThanOrEqual(30)
      expect(most.every((x, i) => i === 0 || x >= most[i - 1]), id).toBe(true)
    }
    expect(Object.keys(LIMITS).sort()).toEqual(['nine', 'six', 'three', 'twelve'])
  })

  it('every config is its own twist (board, flying, win rule or race)', () => {
    // The base configs are each their own twist; story-themed configs reuse one of them.
    const BASE = ['three-mens', 'six-mens', 'nine-mens', 'twelve-mens', 'cloister-race']
    const key = (id: string) => `${CONFIGS[id].variant}:${!!CONFIGS[id].race}`
    expect(new Set(BASE.map(key)).size).toBe(BASE.length)
    for (const id of CONFIG_IDS) expect(BASE.map(key), id).toContain(key(id))
    expect(CONFIG_IDS.length).toBeGreaterThanOrEqual(5)
  })
})

// ── The computer opponent ───────────────────────────────────────────────────

interface Played { winner: 1 | 2; aiMaxMs: number; mine: number }
/** You play `depth`-ply search; the computer plays the real opponent. */
function playOut(variant: Variant, d: Difficulty, seed: number, depth: number, nodes: number, race = false): Played {
  const rules = makeRules(variant, d, race)
  let s = initialState(rules)
  const you = mulberry32(seed), them = mulberry32(seed ^ 0x5bd1e995)
  let aiMaxMs = 0, mine = 0
  for (let ply = 0; ply < 1000; ply++) {
    const w = winner(rules, s)
    if (w) return { winner: w, aiMaxMs, mine }
    const legal = legalMoves(rules, s)
    let m
    if (s.turn === 1) { m = searchBest(rules, s, depth, nodes, you); mine++ }
    else {
      const t = performance.now()
      m = aiMove(rules, s, d, them)
      aiMaxMs = Math.max(aiMaxMs, performance.now() - t)
    }
    expect(legal.some(x => x.from === m.from && x.to === m.to && x.remove === m.remove)).toBe(true)
    s = applyMove(s, m)
  }
  throw new Error('game did not end')
}

describe('computer opponent', () => {
  it('takes a winning mill and blocks yours', () => {
    const r = makeRules('nine', 3)
    // Computer to move: 20,21 + loose piece on 12 adjacent... place to 22 completes 20-21-22.
    const s = pos(r, [0, 1, 3, 5, 13], [20, 21, 14], { hand: [0, 1], turn: 2 })
    const m = aiMove(r, s, 3, mulberry32(1))
    expect(m.to).toBe(22)
    expect(m.remove).toBeGreaterThanOrEqual(0)
    // In placement, the computer blocks your open two.
    const b = pos(r, [0, 1], [12], { hand: [6, 7], turn: 2 })
    expect(aiMove(r, b, 2, mulberry32(2)).to).toBe(2)
  })

  it('every move is legal and fast (< 300 ms) at every difficulty and board', () => {
    let worst = 0
    for (const v of VARIANTS) for (const d of DIFFS) {
      const g = playOut(v, d, 11, 2, 4000)
      worst = Math.max(worst, g.aiMaxMs)
    }
    console.log(`morris: slowest computer move ${worst.toFixed(1)} ms`)
    expect(worst).toBeLessThan(300)
  }, 120_000)

  it('winnable and short at every config × difficulty: a search player wins, within the move budget', () => {
    const N = 5
    // Median of the search player's own moves (placements included) per level.
    const MEDIAN_MAX = [18, 22, 26, 30]
    const rates: string[] = []
    for (const id of CONFIG_IDS) {
      const { variant, race } = CONFIGS[id]
      // On the tiny three men's board a deep search is cheap and finds the forced win.
      const [depth, nodes] = variant === 'three' ? [9, 400_000] : [5, 120_000]
      for (const d of DIFFS) {
        let wins = 0
        const lens: number[] = []
        for (let i = 0; i < N; i++) {
          const g = playOut(variant, d, 1000 + i * 37, depth, nodes, !!race)
          if (g.winner === 1) wins++
          lens.push(g.mine)
        }
        lens.sort((a, b) => a - b)
        rates.push(`${id} L${d} ${wins}/${N} med ${lens[N >> 1]}`)
        expect(wins, `${id} L${d} winnable`).toBeGreaterThan(0)
        if (d === 1) expect(wins, `${id} L1`).toBeGreaterThanOrEqual(N - 1)
        expect(lens[N >> 1], `${id} L${d} median moves`).toBeLessThanOrEqual(MEDIAN_MAX[d - 1])
      }
    }
    console.log(`morris win rates — ${rates.join('; ')}`)
  }, 400_000)

  it("the mill race and three men's at Level 4 beat a shallow player", () => {
    let lost = 0
    for (let i = 0; i < 4; i++) {
      if (playOut('nine', 4, 4000 + i, 2, 4000, true).winner === 2) lost++
      if (playOut('three', 4, 4000 + i, 2, 4000).winner === 2) lost++
    }
    expect(lost).toBeGreaterThanOrEqual(6)
  }, 60_000)

  it('balance: careful 2–3 ply players win a fair share at Levels 3–4, less at 4', () => {
    // Measured over 16 games per board (p2 / p3 average): ~60% at Level 3, ~45% at Level 4.
    const rate = (d: Difficulty) => {
      let w = 0, n = 0
      for (const [v, race] of [['six', false], ['nine', false], ['twelve', false], ['nine', true]] as [Variant, boolean][])
        for (const depth of [2, 3]) for (let i = 0; i < 8; i++) { n++; if (playOut(v, d, 1000 + i * 37, depth, 20_000, race).winner === 1) w++ }
      return w / n
    }
    const r3 = rate(3), r4 = rate(4)
    console.log(`morris careful players: L3 ${r3.toFixed(2)}, L4 ${r4.toFixed(2)}`)
    expect(r3).toBeGreaterThanOrEqual(0.45)
    expect(r3).toBeLessThanOrEqual(0.85)
    expect(r4).toBeGreaterThanOrEqual(0.3)
    expect(r4).toBeLessThan(r3)
  }, 120_000)

  it('the computer at Level 4 beats a careless player', () => {
    let lost = 0
    for (let i = 0; i < 4; i++) if (playOut('nine', 4, 3000 + i, 1, 500).winner === 2) lost++
    expect(lost).toBeGreaterThanOrEqual(3)
  }, 60_000)
})

// ── Component ────────────────────────────────────────────────────────────────

describe('MorrisGame component', () => {
  it('renders every config at every difficulty', () => {
    expect(CONFIG_IDS.length).toBeGreaterThanOrEqual(5)
    for (const id of CONFIG_IDS) {
      expect(CONFIGS[id].fact.length).toBeGreaterThan(20)
      for (const d of DIFFS) {
        render(createElement(MorrisGame, { configId: id, difficulty: d, seed: 7, onWin: () => {}, onLose: () => {} }))
        expect(screen.getByText(CONFIGS[id].title)).toBeTruthy()
        expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(9)
        cleanup()
      }
    }
  })

  it('placing a piece hands the turn to the computer, which answers', () => {
    vi.useFakeTimers()
    render(createElement(MorrisGame, { configId: 'nine-mens', difficulty: 2, seed: 3, onWin: () => {}, onLose: () => {} }))
    fireEvent.click(screen.getByLabelText('point 1 empty'))
    expect(screen.getByLabelText('point 1 your piece')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/thinking/)
    act(() => { vi.advanceTimersByTime(600) })
    expect(screen.getAllByLabelText(/computer piece/)).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toMatch(/Place a piece/)
    cleanup()
    vi.useRealTimers()
  })

  it('a scripted mill that takes the computer down to two calls onWin once', () => {
    vi.useFakeTimers()
    const rules = makeRules('nine', 4)
    const startState = pos(rules, [0, 1, 3], [12, 20, 22])
    let won = 0, lost = 0
    render(createElement(MorrisGame, { configId: 'nine-mens', difficulty: 4, seed: 1, params: { startState }, onWin: () => { won++ }, onLose: () => { lost++ } }))
    fireEvent.click(screen.getByLabelText('point 4 your piece'))
    fireEvent.click(screen.getByLabelText('point 3 empty'))
    expect(screen.getByRole('status').textContent).toMatch(/Mill/)
    fireEvent.click(screen.getByLabelText('point 13 computer piece'))
    act(() => { vi.advanceTimersByTime(3000) })
    expect([won, lost]).toEqual([1, 0])
    cleanup()
    vi.useRealTimers()
  })

  it('a scripted loss (the computer mills you down to two) calls onLose once', () => {
    vi.useFakeTimers()
    const rules = makeRules('nine', 4)
    const startState = pos(rules, [12, 20, 22], [0, 1, 3], { turn: 2 })
    let won = 0, lost = 0
    render(createElement(MorrisGame, { configId: 'nine-mens', difficulty: 4, seed: 1, params: { startState }, onWin: () => { won++ }, onLose: () => { lost++ } }))
    act(() => { vi.advanceTimersByTime(600) })
    act(() => { vi.advanceTimersByTime(3000) })
    expect([won, lost]).toEqual([0, 1])
    cleanup()
    vi.useRealTimers()
  })
})
