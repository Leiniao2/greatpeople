// Five in a Row: engine rules, threat shapes, AI tactics and speed, measured
// strength across difficulties, and the component's win/lose wiring.
import { describe, it, expect, vi } from 'vitest'
import {
  CONFIGS, CONFIG_IDS, AI_LEVELS, newBoard, place, makesFive, checkFive, winningLine, isFull, shapesAt, SHAPE,
  isForbidden, aiMove, findVCF, winPoints, boardSize, startBoard, HUMAN, AI, type Board, type Player, type Rule,
  applyMove, capturesAt, captureWinPoints, moveCap, CAPTURE_WIN, type Caps,
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
      for (const rule of ['freestyle', 'exact', 'renju', 'captures'] as Rule[]) {
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

/**
 * A full game as the component plays it: captures, the swap opening (`me` is
 * the colour the scripted player takes) and the stone cap.  The scripted player
 * moves with `level` (strong by default) at `d`'s board size against the AI at
 * `d`.  Returns the winner (0 = board full) and how it ended.
 */
function match(configId: string, d: Difficulty, seed: number, opts: { me?: Player; weak?: boolean } = {}) {
  const cfg = CONFIGS[configId], rule = cfg.rule
  const n = boardSize(d), cap = moveCap(d)
  const me = opts.me ?? HUMAN, them = (3 - me) as Player
  let b = startBoard(cfg, n, seed)
  const caps: Caps = [0, 0, 0]
  const human = mulberry32(seed * 7 + 1)
  const ai = mulberry32(seed * 13 + 5)
  let p: Player = cfg.swap ? AI : HUMAN
  let stones = 0, slowest = 0
  while (!isFull(b)) {
    const t = performance.now()
    const mv = p === me
      ? (opts.weak ? aiMove(b, n, 1, human, rule, me, AI_LEVELS[1], caps) : aiMove(b, n, 4, human, rule, me, STRONG, caps))
      : aiMove(b, n, d, ai, rule, them, AI_LEVELS[d], caps)
    if (p === them) slowest = Math.max(slowest, performance.now() - t)
    if (mv < 0) return { winner: me, how: 'stuck', stones, slowest }
    const r = applyMove(b, n, mv, p, rule)
    b = r.board
    caps[p] += r.captured.length / 2
    if (p === me) stones++
    if (checkFive(b, n, mv, rule)) return { winner: p, how: 'five', stones, slowest }
    if (caps[p] >= CAPTURE_WIN) return { winner: p, how: 'captures', stones, slowest }
    if (p === me && stones >= cap) return { winner: them, how: 'cap', stones, slowest }
    p = (3 - p) as Player
  }
  return { winner: 0 as const, how: 'full', stones, slowest }
}

describe('time budget', () => {
  it('boards are at most 13×13 and the stone cap keeps games to ~1 min at D1, ≤ 3 min at D4', () => {
    const SECONDS_PER_MOVE = 5, AI_DELAY = 0.35
    for (const d of DIFFS) {
      expect(boardSize(d)).toBeLessThanOrEqual(13)
      expect(moveCap(d) * (SECONDS_PER_MOVE + AI_DELAY), `D${d} worst-case seconds`).toBeLessThanOrEqual(180)
    }
    expect(boardSize(1)).toBe(9)
    expect(moveCap(1)).toBeLessThanOrEqual(18)
    expect(moveCap(4)).toBeLessThanOrEqual(24)
    for (const d of [1, 2, 3] as Difficulty[]) expect(moveCap((d + 1) as Difficulty)).toBeGreaterThan(moveCap(d))
  })
})

describe('strength and winnability', () => {
  it('every config × difficulty is winnable by a strong player inside the stone cap', () => {
    let slowest = 0
    const report: string[] = []
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      let won = -1
      for (let s = 1; s <= 12 && won < 0; s++) {
        const r = match(id, d, s)
        slowest = Math.max(slowest, r.slowest)
        if (r.winner === HUMAN) { won = s; expect(r.stones).toBeLessThanOrEqual(moveCap(d)) }
      }
      report.push(`${id}@${d}:${won}`)
      expect(won, `${id} D${d} winnable`).toBeGreaterThan(0)
    }
    console.log(`gomoku: first winning seed ${report.join(' ')}; slowest AI move ${slowest.toFixed(1)} ms`)
    expect(slowest).toBeLessThan(300)
  }, 300_000)

  it('the strong player beats D1 most of the time, and D4 less often; D1 wins are quick', () => {
    const rates: Record<number, number> = {}
    const quick: number[] = []
    for (const d of [1, 4] as Difficulty[]) {
      let wins = 0, games = 0
      for (const id of CONFIG_IDS) for (let s = 1; s <= 4; s++) {
        const r = match(id, d, s)
        games++
        if (r.winner === HUMAN) { wins++; if (d === 1) quick.push(r.stones) }
      }
      rates[d] = wins / games
    }
    const avg = quick.reduce((a, b) => a + b, 0) / quick.length
    console.log(`gomoku: strong player win rate vs D1 ${rates[1]}, D4 ${rates[4]}; average D1 win in ${avg.toFixed(1)} stones`)
    expect(rates[1]).toBeGreaterThanOrEqual(0.6)
    expect(rates[4]).toBeGreaterThan(0)
    expect(rates[4]).toBeLessThan(rates[1])
    expect(avg, 'an engaged player wins D1 in about a minute').toBeLessThanOrEqual(14)
  }, 300_000)

  it('losable: a careless player loses to the D4 AI in every config', () => {
    for (const id of CONFIG_IDS) {
      let losses = 0
      for (let s = 1; s <= 8; s++) if (match(id, 4, s, { weak: true }).winner !== HUMAN) losses++
      expect(losses, id).toBeGreaterThanOrEqual(6)
    }
  }, 300_000)
})

describe('captures (ninuki)', () => {
  const n = 9
  it('flanking exactly two stones captures them; one or three do not', () => {
    const b = boardWith(n, [[4, 1, HUMAN], [4, 2, AI], [4, 3, AI]])
    expect(capturesAt(b, n, at(n, 4, 4), HUMAN).sort((x, y) => x - y)).toEqual([at(n, 4, 2), at(n, 4, 3)])
    const { board, captured } = applyMove(b, n, at(n, 4, 4), HUMAN, 'captures')
    expect(captured.length).toBe(2)
    expect(board[at(n, 4, 2)]).toBe(0)
    expect(board[at(n, 4, 3)]).toBe(0)
    // Same move under freestyle captures nothing.
    expect(applyMove(b, n, at(n, 4, 4), HUMAN, 'freestyle').captured).toEqual([])
    // Three in between, or one, is safe; so is a diagonal pair with no flank.
    expect(capturesAt(boardWith(n, [[4, 0, HUMAN], [4, 1, AI], [4, 2, AI], [4, 3, AI]]), n, at(n, 4, 4), HUMAN)).toEqual([])
    expect(capturesAt(boardWith(n, [[4, 2, HUMAN], [4, 3, AI]]), n, at(n, 4, 4), HUMAN)).toEqual([])
    // Diagonal capture.
    expect(capturesAt(boardWith(n, [[1, 1, AI], [2, 2, HUMAN], [3, 3, HUMAN]]), n, at(n, 4, 4), AI).length).toBe(2)
    // Playing into a flanked gap is safe: only the mover captures.
    const gap = boardWith(n, [[4, 1, HUMAN], [4, 2, AI], [4, 4, HUMAN]])
    expect(applyMove(gap, n, at(n, 4, 3), AI, 'captures').captured).toEqual([])
  })
  it('the AI takes a capture that wins, and blocks one that would lose', () => {
    const b = boardWith(n, [[4, 1, AI], [4, 2, HUMAN], [4, 3, HUMAN], [0, 0, HUMAN], [8, 8, AI]])
    const caps: Caps = [0, 1, CAPTURE_WIN - 1]
    expect(captureWinPoints(b, n, AI, 'captures', caps)).toEqual([at(n, 4, 4)])
    for (const d of DIFFS) expect(aiMove(b, n, d, mulberry32(d), 'captures', AI, AI_LEVELS[d], caps)).toBe(at(n, 4, 4))
    const danger = boardWith(n, [[4, 1, HUMAN], [4, 2, AI], [4, 3, AI], [8, 8, AI], [0, 0, HUMAN]])
    const caps2: Caps = [0, CAPTURE_WIN - 1, 0]
    for (const d of [2, 3, 4] as Difficulty[]) expect(aiMove(danger, n, d, mulberry32(d), 'captures', AI, AI_LEVELS[d], caps2)).toBe(at(n, 4, 4))
  })
  it('the AI values captures more than plain development', () => {
    const b = boardWith(n, [[4, 1, AI], [4, 2, HUMAN], [4, 3, HUMAN], [6, 6, HUMAN]])
    expect(aiMove(b, n, 4, mulberry32(3), 'captures', AI, AI_LEVELS[4], [0, 0, 0])).toBe(at(n, 4, 4))
  })
})

describe('swap opening', () => {
  it('lays black, white, black near the centre, seeded', () => {
    for (const d of DIFFS) for (let s = 1; s <= 6; s++) {
      const n = boardSize(d)
      const b = startBoard(CONFIGS.swap, n, s)
      expect(b.filter(v => v === HUMAN).length).toBe(2)
      expect(b.filter(v => v === AI).length).toBe(1)
      const m = Math.floor(n / 2)
      b.forEach((v, i) => { if (v) expect(Math.max(Math.abs(Math.floor(i / n) - m), Math.abs((i % n) - m))).toBeLessThanOrEqual(2) })
      expect(startBoard(CONFIGS.swap, n, s)).toEqual(b)
    }
    const variety = new Set([1, 2, 3, 4, 5, 6].map(s => startBoard(CONFIGS.swap, 11, s).join()))
    expect(variety.size).toBeGreaterThanOrEqual(4)
  })
  it('both colours are playable: a strong player wins as black and as white at some seed', () => {
    for (const me of [HUMAN, AI] as Player[]) {
      let won = false
      for (let s = 1; s <= 10 && !won; s++) won = match('swap', 1, s, { me }).winner === me
      expect(won, `as ${me === HUMAN ? 'black' : 'white'}`).toBe(true)
    }
  }, 120_000)
})

describe('configs', () => {
  it('every config is a distinct rule twist with title, intro and fact', () => {
    expect(CONFIG_IDS.length).toBeGreaterThanOrEqual(5)
    const twist = (id: string) => `${CONFIGS[id].rule}|${!!CONFIGS[id].swap}|${CONFIGS[id].opening ?? 0}`
    expect(new Set(CONFIG_IDS.map(twist)).size).toBe(CONFIG_IDS.length)
    expect(CONFIGS.gobang.intro).toMatch(/captur/i)
    expect(CONFIGS.standard.intro).toMatch(/exactly five/)
    expect(CONFIGS.renju.intro).toMatch(/double-threes/)
    expect(CONFIGS.swap.intro).toMatch(/choose/)
    for (const id of CONFIG_IDS) {
      const c = CONFIGS[id]
      expect(c.title && c.intro && c.fact).toBeTruthy()
    }
  })
  it('seeded scattered openings (params) are deterministic and vary by seed', () => {
    const cfg = { ...CONFIGS['edo-gomoku'], opening: 2 }
    const a = startBoard(cfg, 13, 1), b = startBoard(cfg, 13, 1), c = startBoard(cfg, 13, 2)
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

  it('running out of stones loses once', async () => {
    const { render, screen, fireEvent, act, cleanup } = await import('@testing-library/react')
    const { createElement } = await import('react')
    const { default: GomokuGame } = await import('@/components/minigames/GomokuGame')
    vi.useFakeTimers()
    // Every 5-window holds a black and a white stone, so no five is possible.
    const n = boardSize(1)
    const stones: { r: number; c: number; p: Player }[] = []
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const k = (c + 2 * r) % 5
      if (k < 2) stones.push({ r, c, p: (k + 1) as Player })
    }
    let won = 0, lost = 0
    render(createElement(GomokuGame, { configId: 'edo-gomoku', difficulty: 1, seed: 2, params: { stones }, onWin: () => { won++ }, onLose: () => { lost++ } }))
    for (let k = 0; k < moveCap(1) + 3; k++) {
      const empty = screen.getAllByRole('button').find(b => /^row \d+ col \d+$/.test(b.getAttribute('aria-label') ?? ''))
      if (!empty) break
      fireEvent.click(empty)
      act(() => { vi.advanceTimersByTime(500) })
    }
    expect(lost).toBe(1)
    expect(won).toBe(0)
    expect(screen.getByRole('status').textContent).toMatch(/last stone/)
    expect(screen.getByTestId('stones-left').textContent).toMatch(/Stones left: 0/)
    cleanup()
    vi.useRealTimers()
  })

  it('captures lift stones off the board and are counted', async () => {
    const { render, screen, fireEvent, act, cleanup } = await import('@testing-library/react')
    const { createElement } = await import('react')
    const { default: GomokuGame } = await import('@/components/minigames/GomokuGame')
    vi.useFakeTimers()
    const stones = [{ r: 4, c: 1, p: 1 }, { r: 4, c: 2, p: 2 }, { r: 4, c: 3, p: 2 }]
    render(createElement(GomokuGame, { configId: 'gobang', difficulty: 1, seed: 1, params: { stones }, onWin: () => {}, onLose: () => {} }))
    fireEvent.click(screen.getByLabelText('row 5 col 5'))
    expect(screen.getByLabelText('row 5 col 3').getAttribute('aria-label')).toBe('row 5 col 3')
    expect(screen.getByLabelText('row 5 col 4').getAttribute('aria-label')).toBe('row 5 col 4')
    expect(screen.getByTestId('captures').textContent).toMatch(/you 1/)
    act(() => { vi.advanceTimersByTime(500) })
    cleanup()
    vi.useRealTimers()
  })

  it('swap: nothing can be played until a colour is chosen; white moves at once, black lets white reply', async () => {
    const { render, screen, fireEvent, act, cleanup } = await import('@testing-library/react')
    const { createElement } = await import('react')
    const { default: GomokuGame } = await import('@/components/minigames/GomokuGame')
    vi.useFakeTimers()
    const whites = () => screen.getAllByRole('button').filter(b => / white$/.test(b.getAttribute('aria-label') ?? '')).length
    const blacks = () => screen.getAllByRole('button').filter(b => / black$/.test(b.getAttribute('aria-label') ?? '')).length
    const { container } = render(createElement(GomokuGame, { configId: 'swap', difficulty: 1, seed: 4, onWin: () => {}, onLose: () => {} }))
    expect(blacks()).toBe(2); expect(whites()).toBe(1)
    fireEvent.click(screen.getByLabelText('row 1 col 1'))
    expect(blacks()).toBe(2); expect(whites()).toBe(1)
    fireEvent.click(container.querySelector('[data-choose="white"]')!)
    fireEvent.click(screen.getByLabelText('row 1 col 1'))
    expect(screen.getByLabelText('row 1 col 1 white')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(500) })
    expect(blacks()).toBe(3)
    cleanup()
    const r2 = render(createElement(GomokuGame, { configId: 'swap', difficulty: 1, seed: 4, onWin: () => {}, onLose: () => {} }))
    fireEvent.click(r2.container.querySelector('[data-choose="black"]')!)
    act(() => { vi.advanceTimersByTime(500) })
    expect(whites()).toBe(2)
    fireEvent.click(screen.getByLabelText('row 1 col 1'))
    expect(screen.getByLabelText('row 1 col 1 black')).toBeTruthy()
    cleanup()
    vi.useRealTimers()
  })

  it('on big boards the first tap previews and the second places', async () => {
    const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
    const { createElement } = await import('react')
    const { default: GomokuGame } = await import('@/components/minigames/GomokuGame')
    render(createElement(GomokuGame, { configId: 'edo-gomoku', difficulty: 4, seed: 1, onWin: () => {}, onLose: () => {} }))
    fireEvent.click(screen.getByLabelText('row 7 col 7'))
    expect(screen.queryByLabelText('row 7 col 7 black')).toBeNull()
    fireEvent.click(screen.getByLabelText('row 7 col 7'))
    expect(screen.getByLabelText('row 7 col 7 black')).toBeTruthy()
    cleanup()
  })
})
