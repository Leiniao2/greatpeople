// Five in a Row: engine rules, threat shapes, AI tactics and speed, measured
// strength across difficulties, and the component's win/lose wiring.
import { describe, it, expect, vi } from 'vitest'
import {
  CONFIGS, CONFIG_IDS, AI_LEVELS, newBoard, place, makesFive, checkFive, winningLine, isFull, shapesAt, SHAPE,
  isForbidden, aiMove, findVCF, winPoints, boardSize, startBoard, HUMAN, AI, type Board, type Player, type Rule,
} from '@/components/minigames/GomokuGame'
import { mulberry32 } from '@/components/minigames/_shared'
import type { Difficulty } from '@/games/types'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const at = (n: number, r: number, c: number) => r * n + c
function boardWith(n: number, stones: [number, number, Player][]): Board {
  const b = newBoard(n)
  for (const [r, c, p] of stones) b[at(n, r, c)] = p
  return b
}

describe('engine', () => {
  it('detects five in all four directions', () => {
    const n = 9
    const lines: [number, number][][] = [
      [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4]],
      [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]],
      [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]],
      [[0, 8], [1, 7], [2, 6], [3, 5], [4, 4]],
    ]
    for (const ln of lines) {
      const b = boardWith(n, ln.map(([r, c]) => [r, c, HUMAN]))
      expect(checkFive(b, n, at(n, ...ln[2]), 'freestyle')).toBe(true)
      expect(winningLine(b, n, at(n, ...ln[0]), 'freestyle')).toHaveLength(5)
      // Four is not five.
      const b4 = boardWith(n, ln.slice(0, 4).map(([r, c]) => [r, c, HUMAN]))
      expect(checkFive(b4, n, at(n, ...ln[0]), 'freestyle')).toBe(false)
    }
  })
  it('overlines win in freestyle, not in exact; renju restricts only the computer', () => {
    const n = 9
    const six = (p: Player) => boardWith(n, [0, 1, 2, 3, 4, 5].map(c => [3, c, p] as [number, number, Player]))
    expect(checkFive(six(HUMAN), n, at(n, 3, 0), 'freestyle')).toBe(true)
    expect(checkFive(six(HUMAN), n, at(n, 3, 0), 'exact')).toBe(false)
    expect(checkFive(six(AI), n, at(n, 3, 0), 'exact')).toBe(false)
    expect(checkFive(six(HUMAN), n, at(n, 3, 0), 'renju')).toBe(true)
    expect(checkFive(six(AI), n, at(n, 3, 0), 'renju')).toBe(false)
    // The computer may not play an overline-making move under renju.
    const b = boardWith(n, [[3, 0, AI], [3, 1, AI], [3, 2, AI], [3, 4, AI], [3, 5, AI]])
    expect(isForbidden(b, n, at(n, 3, 3), AI, 'renju')).toBe(true)
    expect(isForbidden(b, n, at(n, 3, 3), HUMAN, 'renju')).toBe(false)
    expect(makesFive(b, n, at(n, 3, 3), AI, 'freestyle')).toBe(true)
  })
  it('renju forbids double-three and double-four for the computer, but allows an exact five', () => {
    const n = 11
    // Two open twos crossing at (5,5): playing there makes a double open three.
    const b = boardWith(n, [[5, 3, AI], [5, 4, AI], [3, 5, AI], [4, 5, AI]])
    expect(isForbidden(b, n, at(n, 5, 5), AI, 'renju')).toBe(true)
    expect(isForbidden(b, n, at(n, 5, 5), AI, 'freestyle')).toBe(false)
    const b2 = boardWith(n, [[5, 1, AI], [5, 2, AI], [5, 3, AI], [2, 5, AI], [3, 5, AI], [4, 5, AI]])
    expect(isForbidden(b2, n, at(n, 5, 5), AI, 'renju')).toBe(true)
    const b3 = boardWith(n, [[5, 1, AI], [5, 2, AI], [5, 3, AI], [5, 4, AI], [3, 5, AI], [4, 5, AI]])
    expect(isForbidden(b3, n, at(n, 5, 5), AI, 'renju')).toBe(false)
  })
  it('place refuses occupied squares; isFull detects a full board', () => {
    const b = place(newBoard(9), 0, HUMAN)
    expect(() => place(b, 0, AI)).toThrow()
    expect(isFull(b)).toBe(false)
    expect(isFull(Array(81).fill(1))).toBe(true)
  })
})

describe('threat shapes', () => {
  const n = 11
  const shape = (b: Board, r: number, c: number, p: Player = HUMAN, rule: Rule = 'freestyle') => shapesAt(b, n, at(n, r, c), p, rule)[0]
  it('open four, closed four, open three, closed three, open two', () => {
    expect(shape(boardWith(n, [[5, 3, 1], [5, 4, 1], [5, 5, 1]]), 5, 6)).toBe(SHAPE.OPEN4)
    expect(shape(boardWith(n, [[5, 2, 2], [5, 3, 1], [5, 4, 1], [5, 5, 1]]), 5, 6)).toBe(SHAPE.FOUR)
    expect(shape(boardWith(n, [[5, 3, 1], [5, 4, 1], [5, 7, 1]]), 5, 5)).toBe(SHAPE.FOUR) // xxx.x: a split four
    expect(shape(boardWith(n, [[5, 4, 1], [5, 5, 1]]), 5, 6)).toBe(SHAPE.OPEN3)
    expect(shape(boardWith(n, [[5, 4, 1], [5, 6, 1]]), 5, 5)).toBe(SHAPE.OPEN3)
    expect(shape(boardWith(n, [[5, 3, 2], [5, 4, 1], [5, 5, 1]]), 5, 6)).toBe(SHAPE.THREE)
    expect(shape(boardWith(n, [[5, 4, 1]]), 5, 5)).toBe(SHAPE.OPEN2)
    // Against the edge, a three is closed.
    expect(shape(boardWith(n, [[5, 0, 1], [5, 1, 1]]), 5, 2)).toBe(SHAPE.THREE)
  })
  it('finds win points and a simple VCF', () => {
    const n2 = 13
    const b = boardWith(n2, [[6, 3, 1], [6, 4, 1], [6, 5, 1], [6, 6, 1]])
    expect(winPoints(b, n2, HUMAN, 'freestyle').sort((a, c) => a - c)).toEqual([at(n2, 6, 2), at(n2, 6, 7)])
    // Two closed threes crossing: a four then another four wins by VCF.
    const v = boardWith(n2, [[6, 2, 2], [6, 3, 1], [6, 4, 1], [6, 5, 1], [2, 7, 2], [3, 7, 1], [4, 7, 1], [5, 7, 1]])
    const first = findVCF(v.slice(), n2, HUMAN, 'freestyle', 6, { deadline: Date.now() + 500, nodes: 1000 })
    expect(first).toBeGreaterThanOrEqual(0)
  })
})

describe('AI tactics', () => {
  it('every level completes its own four', () => {
    const n = 11
    for (const d of DIFFS) {
      const b = boardWith(n, [[2, 2, AI], [2, 3, AI], [2, 4, AI], [2, 5, AI], [7, 7, HUMAN], [7, 8, HUMAN], [7, 9, HUMAN], [8, 2, HUMAN]])
      const mv = aiMove(b, n, d, mulberry32(d), 'freestyle')
      expect([at(n, 2, 1), at(n, 2, 6)]).toContain(mv)
    }
  })
  it('D2–D4 block your four; D3–D4 block your open three', () => {
    const n = 11
    for (const d of [2, 3, 4] as Difficulty[]) {
      for (let s = 0; s < 5; s++) {
        const b = boardWith(n, [[5, 2, HUMAN], [5, 3, HUMAN], [5, 4, HUMAN], [5, 5, HUMAN], [5, 1, AI], [4, 4, AI]])
        expect(aiMove(b, n, d, mulberry32(s), 'freestyle')).toBe(at(n, 5, 6))
      }
    }
    for (const d of [3, 4] as Difficulty[]) {
      const b = boardWith(n, [[5, 3, HUMAN], [5, 4, HUMAN], [5, 5, HUMAN], [8, 8, AI], [2, 2, AI]])
      expect([at(n, 5, 2), at(n, 5, 6), at(n, 5, 1), at(n, 5, 7)]).toContain(aiMove(b, n, d, mulberry32(1), 'freestyle'))
    }
  })
  it('returns a legal move well under 300 ms on a busy 15×15 board', () => {
    const n = 15
    const rng = mulberry32(42)
    let b = newBoard(n)
    let p: Player = HUMAN
    for (let k = 0; k < 40; k++) {
      const mv = aiMove(b, n, 2, rng, 'freestyle', p)
      b = place(b, mv, p)
      if (checkFive(b, n, mv, 'freestyle')) break
      p = (3 - p) as Player
    }
    let worst = 0
    for (const d of DIFFS) {
      for (const rule of ['freestyle', 'exact', 'renju'] as Rule[]) {
        const t = performance.now()
        const mv = aiMove(b, n, d, mulberry32(d), rule)
        worst = Math.max(worst, performance.now() - t)
        expect(b[mv]).toBe(0)
        expect(isForbidden(b, n, mv, AI, rule)).toBe(false)
      }
    }
    console.log(`gomoku: slowest AI move on a 40-stone 15×15 board ${worst.toFixed(1)} ms`)
    expect(worst).toBeLessThan(300)
  })
})

/** The scripted strong player: master settings plus a threat-space (VCT) search. */
const STRONG = { ...AI_LEVELS[4], noise: 0.1, vct: 3, vctNodes: 4000, ms: 400 }

/** Strong scripted player (D4 settings, playing black) vs the AI at difficulty d. Returns the winner (0 = full board). */
function match(d: Difficulty, seed: number, rule: Rule, configId = 'edo-gomoku'): { winner: 0 | Player; slowest: number } {
  const n = boardSize(d)
  let b = startBoard(CONFIGS[configId], n, seed)
  const human = mulberry32(seed * 7 + 1)
  const ai = mulberry32(seed * 13 + 5)
  let p: Player = HUMAN
  let slowest = 0
  while (!isFull(b)) {
    const t = performance.now()
    const mv = p === HUMAN ? aiMove(b, n, 4, human, rule, HUMAN, STRONG) : aiMove(b, n, d, ai, rule, AI)
    if (p === AI) slowest = Math.max(slowest, performance.now() - t)
    if (mv < 0) return { winner: HUMAN, slowest }
    b = place(b, mv, p)
    if (checkFive(b, n, mv, rule)) return { winner: p, slowest }
    p = (3 - p) as Player
  }
  return { winner: 0, slowest }
}

describe('strength', () => {
  it('a strong player beats D1 nearly always and D4 at least sometimes, less often than D1', () => {
    const rates: Record<number, number> = {}
    let slowest = 0
    const games = 12
    for (const d of DIFFS) {
      let wins = 0
      for (let s = 1; s <= games; s++) {
        const cfg = CONFIG_IDS[s % CONFIG_IDS.length]
        const r = match(d, s, CONFIGS[cfg].rule, cfg)
        if (r.winner === HUMAN) wins++
        slowest = Math.max(slowest, r.slowest)
      }
      rates[d] = wins / games
    }
    console.log(`gomoku: strong player win rate vs D1 ${rates[1]}, D2 ${rates[2]}, D3 ${rates[3]}, D4 ${rates[4]}; slowest AI move ${slowest.toFixed(1)} ms`)
    expect(rates[1]).toBeGreaterThanOrEqual(0.75)
    expect(rates[4]).toBeGreaterThan(0)
    expect(rates[4]).toBeLessThan(rates[1])
    expect(slowest).toBeLessThan(300)
  }, 120_000)
  it('the D4 AI beats a careless D1-level black player most of the time (losable)', () => {
    let aiWins = 0
    for (let s = 1; s <= 8; s++) {
      const n = 15
      let b = newBoard(n)
      const h = mulberry32(s), a = mulberry32(s + 99)
      let p: Player = HUMAN
      for (;;) {
        if (isFull(b)) break
        const mv = p === HUMAN ? aiMove(b, n, 1, h, 'freestyle', HUMAN) : aiMove(b, n, 4, a, 'freestyle', AI)
        b = place(b, mv, p)
        if (checkFive(b, n, mv, 'freestyle')) { if (p === AI) aiWins++; break }
        p = (3 - p) as Player
      }
    }
    console.log(`gomoku: D4 AI beat a D1-level black player ${aiWins}/8`)
    expect(aiWins).toBeGreaterThanOrEqual(6)
  }, 60_000)
})

describe('configs', () => {
  it('has at least three configs, each with title, intro and fact', () => {
    expect(CONFIG_IDS.length).toBeGreaterThanOrEqual(3)
    for (const id of CONFIG_IDS) {
      const c = CONFIGS[id]
      expect(c.title && c.intro && c.fact).toBeTruthy()
    }
  })
  it('seeded openings are deterministic and vary by seed', () => {
    const a = startBoard(CONFIGS.gobang, 13, 1), b = startBoard(CONFIGS.gobang, 13, 1), c = startBoard(CONFIGS.gobang, 13, 2)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    expect(a.filter(v => v === HUMAN).length).toBe(a.filter(v => v === AI).length)
  })
})

describe('GomokuGame UI', () => {
  it('renders every config at every difficulty', async () => {
    const { render, cleanup } = await import('@testing-library/react')
    const { createElement } = await import('react')
    const { default: GomokuGame } = await import('@/components/minigames/GomokuGame')
    for (const configId of CONFIG_IDS) {
      for (const difficulty of DIFFS) {
        const { container } = render(createElement(GomokuGame, { configId, difficulty, seed: 3, onWin: () => {}, onLose: () => {} }))
        const n = boardSize(difficulty)
        expect(container.querySelectorAll('button[aria-label^="row "]').length).toBe(n * n)
        cleanup()
      }
    }
  })

  it('a scripted five calls onWin exactly once', async () => {
    const { render, screen, fireEvent, act, cleanup } = await import('@testing-library/react')
    const { createElement } = await import('react')
    const { default: GomokuGame } = await import('@/components/minigames/GomokuGame')
    vi.useFakeTimers()
    let won = 0, lost = 0
    const stones = [[4, 2, 1], [4, 3, 1], [4, 4, 1], [4, 5, 1], [0, 0, 2], [0, 1, 2], [8, 8, 2], [8, 6, 2]].map(([r, c, p]) => ({ r, c, p }))
    render(createElement(GomokuGame, { configId: 'edo-gomoku', difficulty: 1, seed: 1, params: { stones }, onWin: () => { won++ }, onLose: () => { lost++ } }))
    fireEvent.click(screen.getByLabelText('row 5 col 7'))
    act(() => { vi.advanceTimersByTime(2000) })
    fireEvent.click(screen.getByLabelText('row 1 col 9'))
    act(() => { vi.advanceTimersByTime(2000) })
    expect(won).toBe(1)
    expect(lost).toBe(0)
    expect(screen.getByRole('status').textContent).toMatch(/you win/i)
    cleanup()
    vi.useRealTimers()
  })

  it('a scripted loss calls onLose exactly once', async () => {
    const { render, screen, fireEvent, act, cleanup } = await import('@testing-library/react')
    const { createElement } = await import('react')
    const { default: GomokuGame } = await import('@/components/minigames/GomokuGame')
    vi.useFakeTimers()
    let won = 0, lost = 0
    const stones = [[0, 0, 2], [0, 1, 2], [0, 2, 2], [0, 3, 2], [6, 6, 1], [8, 0, 1], [8, 8, 1], [6, 2, 1]].map(([r, c, p]) => ({ r, c, p }))
    render(createElement(GomokuGame, { configId: 'standard', difficulty: 1, seed: 5, params: { stones }, onWin: () => { won++ }, onLose: () => { lost++ } }))
    fireEvent.click(screen.getByLabelText('row 9 col 5'))
    act(() => { vi.advanceTimersByTime(400) })
    // The game is over: further taps do nothing.
    fireEvent.click(screen.getByLabelText('row 9 col 6'))
    act(() => { vi.advanceTimersByTime(2000) })
    expect(lost).toBe(1)
    expect(won).toBe(0)
    expect(screen.getByLabelText(/^row 1 col 5 white/)).toBeTruthy()
    cleanup()
    vi.useRealTimers()
  })

  it('on big boards the first tap previews and the second places', async () => {
    const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
    const { createElement } = await import('react')
    const { default: GomokuGame } = await import('@/components/minigames/GomokuGame')
    render(createElement(GomokuGame, { configId: 'edo-gomoku', difficulty: 4, seed: 1, onWin: () => {}, onLose: () => {} }))
    fireEvent.click(screen.getByLabelText('row 8 col 8'))
    expect(screen.queryByLabelText('row 8 col 8 black')).toBeNull()
    fireEvent.click(screen.getByLabelText('row 8 col 8'))
    expect(screen.getByLabelText('row 8 col 8 black')).toBeTruthy()
    cleanup()
  })
})
