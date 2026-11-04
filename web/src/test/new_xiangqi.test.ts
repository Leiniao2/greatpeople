// Xiangqi Mates: every piece's moves under xiangqi and janggi rules (river,
// palace, horse leg, elephant eye, cannon screens, flying general, palace
// diagonals); every puzzle in the set is a forced mate in exactly N with at
// most two working first moves and a failing check; the minimax defender
// holds out against wrong moves; and the component wins/loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import XiangqiGame, {
  CONFIGS, CONFIG_IDS, PUZZLES, K, H, C, parse, format, sq, fx, fy, pieceMoves, legalMoves, inCheck, checkers,
  generalsFace, applyMove, mateIn, mateDistance, winningMoves, givesCheck, isMate, defend, puzzleFor, depthFor, playTurn, redMoves,
  type Move, type Variant, type Puzzle, type MateRules,
} from '@/components/minigames/XiangqiGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]

const name = (i: number) => `${String.fromCharCode(97 + fx(i))}${fy(i)}`
const at = (s: string) => sq(s.charCodeAt(0) - 97, Number(s[1]))
const dests = (pos: string, from: string, v: Variant = 'xiangqi') => pieceMoves(parse(pos), at(from), v).map(m => name(m.to)).sort()
const XQ: MateRules = { variant: 'xiangqi', mateBy: null }
const JG: MateRules = { variant: 'janggi', mateBy: null }

describe('xiangqi rules', () => {
  it('general and advisors stay in the palace', () => {
    expect(dests('Ke1 kd9', 'e1')).toEqual(['d1', 'e0', 'e2', 'f1'])
    expect(dests('Kd0 kd9', 'd0')).toEqual(['d1', 'e0'])
    expect(dests('Ae1 Ke0 kd9', 'e1')).toEqual(['d0', 'd2', 'f0', 'f2'])
    expect(dests('Ad0 Ke0 kd9', 'd0')).toEqual(['e1'])
  })

  it('the flying general: the generals may not face each other on an open file', () => {
    const b = parse('Kd0 ke9')
    expect(generalsFace(b)).toBe(false)
    // Black's general may not step onto red's open file…
    expect(legalMoves(parse('Kd0 ke9'), -1, 'xiangqi').map(m => name(m.to))).not.toContain('d9')
    // …and a piece screening the file is pinned to it.
    const pinned = parse('Ke0 Re4 ke9')
    expect(legalMoves(pinned, 1, 'xiangqi').some(m => m.from === at('e4') && fx(m.to) !== 4)).toBe(false)
    expect(inCheck(parse('Ke0 ke9'), -1, 'xiangqi')).toBe(true)
    expect(checkers(parse('Ke0 ke9'), -1, 'xiangqi')).toEqual([at('e0')])
  })

  it('elephants: two points diagonally, blocked at the eye, never across the river', () => {
    expect(dests('Ec0 Ke0 kd9', 'c0')).toEqual(['a2', 'e2'])
    expect(dests('Ec0 Pd1 Ke0 kd9', 'c0')).toEqual(['a2'])
    expect(dests('Eg4 Ke0 kd9', 'g4')).toEqual(['e2', 'i2'])
    expect(dests('ec5 Ke0 kd9', 'c5')).toEqual(['a7', 'e7'])
  })

  it('horses: one point straight then one diagonally, hobbled by a piece on the leg', () => {
    expect(dests('He4 Ke0 kd9', 'e4')).toEqual(['c3', 'c5', 'd2', 'd6', 'f2', 'f6', 'g3', 'g5'])
    expect(dests('He4 Pe5 Ke0 kd9', 'e4')).toEqual(['c3', 'c5', 'd2', 'f2', 'g3', 'g5'])
    expect(dests('He4 pf4 Ke0 kd9', 'e4')).toEqual(['c3', 'c5', 'd2', 'd6', 'f2', 'f6'])
  })

  it('chariots slide; cannons slide but capture only over exactly one screen', () => {
    expect(dests('Rb2 pb5 Pd2 Ke0 kd9', 'b2')).toEqual(['a2', 'b0', 'b1', 'b3', 'b4', 'b5', 'c2'])
    expect(dests('Cb2 pb5 rb8 Ke0 kd9', 'b2')).toEqual(['a2', 'b0', 'b1', 'b3', 'b4', 'b8', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2', 'i2'])
    // No capture without a screen, none over two.
    expect(dests('Cb2 rb5 Ke0 kd9', 'b2')).not.toContain('b5')
    expect(dests('Cb2 pb4 pb5 rb8 Ke0 kd9', 'b2')).toContain('b5')
    expect(dests('Cb2 pb4 pb5 rb8 Ke0 kd9', 'b2')).not.toContain('b8')
  })

  it('soldiers go forward, and sideways only across the river; black ones go down', () => {
    expect(dests('Pe4 Ke0 kd9', 'e4')).toEqual(['e5'])
    expect(dests('Pe5 Ke0 kd9', 'e5')).toEqual(['d5', 'e6', 'f5'])
    expect(dests('Pe9 Ke0 kd8', 'e9')).toEqual(['d9', 'f9'])
    expect(dests('pe5 Ke0 kd9', 'e5')).toEqual(['e4'])
    expect(dests('pe4 Ke0 kd9', 'e4')).toEqual(['d4', 'e3', 'f4'])
  })

  it('check, legal evasion, and mate', () => {
    const b = parse('Kd0 Re5 ke9')
    expect(inCheck(b, -1, 'xiangqi')).toBe(true)
    expect(legalMoves(b, -1, 'xiangqi').map(m => name(m.to)).sort()).toEqual(['f9'])
    // Two chariots: the classic double-chariot mate on the back rank.
    const mate = parse('Kd0 Ra9 Rb8 ke9')
    expect(isMate(mate, 1, XQ)).toBe(true)
    expect(mateIn(parse('Kd0 Ra7 Rb8 ke9'), 1, 1, XQ)).toBe(true)
    expect(winningMoves(parse('Kd0 Ra7 Rb8 ke9'), 1, 1, XQ).map(x => name(x.to))).toEqual(['a9'])
  })

  it('a stalemated side loses in xiangqi', () => {
    // Black general boxed in, not in check, no other piece: no legal move.
    const b = parse('Kd0 Ra8 Rd5 Rf5 ke9')
    expect(inCheck(b, -1, 'xiangqi')).toBe(false)
    expect(legalMoves(b, -1, 'xiangqi')).toEqual([])
    expect(isMate(b, 1, XQ)).toBe(true)
    // …but under a "mate with a cannon" rule it is no mate.
    expect(isMate(b, 1, { variant: 'xiangqi', mateBy: C })).toBe(false)
  })

  it('parse and format round-trip, and mirror files', () => {
    const s = 'Ke0 Rb2 He6 kd7'
    expect(format(parse(s)).split(' ').sort()).toEqual(s.split(' ').sort())
    expect(format(parse(s, true)).split(' ').sort()).toEqual(['Ke0', 'Rh2', 'He6', 'kf7'].sort())
  })
})

describe('janggi rules', () => {
  it('elephants step one straight and two diagonally, blocked on the way', () => {
    expect(dests('Ed3 Kd0 ke8', 'd3', 'janggi')).toEqual(['a1', 'a5', 'b0', 'b6', 'f0', 'f6', 'g1', 'g5'])
    expect(dests('Ed3 Pd4 Kd0 ke8', 'd3', 'janggi')).toEqual(['a1', 'a5', 'b0', 'f0', 'g1', 'g5'])
    expect(dests('Ed3 Pc5 Kd0 ke8', 'd3', 'janggi')).not.toContain('b6')
  })

  it('palace diagonals for the general, chariot and soldier', () => {
    expect(dests('Ke1 ke8', 'e8', 'janggi')).toEqual(['d7', 'd8', 'd9', 'e7', 'e9', 'f7', 'f8', 'f9'])
    expect(dests('Kd0 ke9', 'e9', 'janggi')).toEqual(['d9', 'e8', 'f9'])
    expect(dests('Kd0 Rd7 ke9', 'd7', 'janggi')).toContain('e8')
    expect(dests('Kd0 Rd7 ke9', 'd7', 'janggi')).toContain('f9')
    expect(dests('Kd0 Pd7 ke9', 'd7', 'janggi')).toEqual(['c7', 'd8', 'e7', 'e8'])
    expect(dests('Kd0 Pe6 ke9', 'e6', 'janggi')).toEqual(['d6', 'e7', 'f6'])
  })

  it('cannons must jump a screen even to move, never over or onto a cannon', () => {
    expect(dests('Kd0 Cd7 he8 ke9', 'd7', 'janggi')).toEqual(['f9'])
    expect(dests('Kd0 Cb2 ke9', 'b2', 'janggi')).toEqual([])
    expect(dests('Kd0 Cb2 pb4 ke9', 'b2', 'janggi')).toEqual(['b5', 'b6', 'b7', 'b8', 'b9'])
    expect(dests('Kd0 Cb2 cb4 ke9', 'b2', 'janggi')).toEqual([])
    expect(dests('Kd0 Cb2 pb4 cb6 ke9', 'b2', 'janggi')).toEqual(['b5'])
  })

  it('no flying general, and a side with no move outside check passes', () => {
    expect(inCheck(parse('Ke1 ke8'), -1, 'janggi')).toBe(false)
    expect(legalMoves(parse('Ke1 ke8'), -1, 'janggi').length).toBe(8)
    const boxed = parse('Kd0 Ra8 Rd5 Rf5 ke9')
    expect(inCheck(boxed, -1, 'janggi')).toBe(false)
    expect(legalMoves(boxed, -1, 'janggi')).toEqual([])
    expect(isMate(boxed, 1, JG)).toBe(false)
    // The game lets black pass and red moves again.
    const p: Puzzle = { board: parse('Kd0 Ra8 Rd5 Rf4 ke9'), moves: 2, rules: JG, allChecks: false, source: '', mirrored: false }
    const res = playTurn(p, p.board, { from: at('f4'), to: at('f5') }, 2, 1)
    expect(res.why).toBe('pass')
    expect(res.result).toBeNull()
  })
})

function verify(id: string, depth: number, s: string) {
  const cfg = CONFIGS[id]
  const r: MateRules = { variant: cfg.variant, mateBy: cfg.mateBy }
  const b = parse(s)
  const tag = `${id} M${depth} ${s}`
  expect(b.filter(x => x === K).length, tag).toBe(1)
  expect(b.filter(x => x === -K).length, tag).toBe(1)
  expect(inCheck(b, 1, cfg.variant), tag).toBe(false)
  expect(inCheck(b, -1, cfg.variant), tag).toBe(false)
  const checks = legalMoves(b, 1, cfg.variant).filter(m => givesCheck(b, m, 1, cfg.variant))
  const wins = winningMoves(b, 1, depth, r)
  expect(wins.length, tag).toBeGreaterThanOrEqual(1)
  expect(wins.length, tag).toBeLessThanOrEqual(depth === 1 ? 1 : 2)
  expect(checks.length, tag).toBeGreaterThanOrEqual(3)
  expect(checks.length - wins.length, `${tag} failing checks`).toBeGreaterThanOrEqual(1)
  if (depth > 1) expect(mateIn(b, 1, depth - 1, r), `${tag} not shorter`).toBe(false)
  if (cfg.allChecks) expect(mateDistance(b, -1, 1, r), `${tag} black threat`).toBe(1)
  return { b, r, checks, wins }
}

describe('xiangqi puzzle set', () => {
  for (const id of CONFIG_IDS) it(`${id}: every puzzle is a forced mate in exactly N, with a single key and failing checks`, () => {
    for (const depth of [1, 2, 3]) {
      const set = PUZZLES[id][depth]
      expect(set.length).toBeGreaterThanOrEqual(12)
      expect(new Set(set).size).toBe(set.length)
      for (const s of set) verify(id, depth, s)
    }
  })

  it('the seed picks puzzles and mirrors; difficulty sets the mate length', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const seen = new Set<string>()
      for (let seed = 0; seed < 40; seed++) {
        const p = puzzleFor(id, d, seed)
        expect(p.moves).toBe(depthFor(d))
        seen.add(format(p.board))
      }
      expect(seen.size, `${id} d${d}`).toBeGreaterThanOrEqual(12)
    }
    // Mirrored puzzles are still mates.
    const p = puzzleFor('horse', 2, 16 + 1)
    expect(p.mirrored).toBe(true)
    expect(mateDistance(p.board, 1, 2, p.rules)).toBe(2)
    // D3 and D4 draw different mate-in-3 puzzles.
    const d3 = new Set(Array.from({ length: 20 }, (_, s) => puzzleFor('cannon', 3, s).source))
    const d4 = new Set(Array.from({ length: 20 }, (_, s) => puzzleFor('cannon', 4, s).source))
    expect([...d3].some(x => d4.has(x))).toBe(false)
  })
})

/** Red plays a forced mate; returns the result after at most N moves. */
function playOut(p: Puzzle, first: Move | null, seed: number): { result: 'win' | 'lose'; line: Move[] } {
  let b = p.board, left = p.moves
  const line: Move[] = []
  for (let k = 0; k < 10; k++) {
    const wins = winningMoves(b, 1, left, p.rules)
    const m = k === 0 && first ? first : wins[0] ?? redMoves(p, b).find(x => givesCheck(b, x, 1, p.rules.variant)) ?? redMoves(p, b)[0]
    line.push(m)
    const res = playTurn(p, b, m, left, seed)
    if (res.result) return { result: res.result, line }
    b = res.afterReply!; left--
  }
  return { result: 'lose', line }
}

describe('xiangqi play against the defender', () => {
  it('the forced line wins within the moves for every config × difficulty × seed', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const seed of [0, 1, 5, 17, 33]) {
      const p = puzzleFor(id, d, seed)
      const out = playOut(p, null, seed)
      expect(out.result, `${id} d${d} s${seed} ${p.source}`).toBe('win')
      expect(out.line.length).toBeLessThanOrEqual(p.moves)
    }
  })

  it('a wrong checking first move loses against the best defence', () => {
    for (const id of CONFIG_IDS) for (const d of [2, 3, 4] as Difficulty[]) for (const seed of [0, 3, 8]) {
      const p = puzzleFor(id, d, seed)
      const wins = winningMoves(p.board, 1, p.moves, p.rules).map(m => `${m.from}-${m.to}`)
      const wrong = legalMoves(p.board, 1, p.rules.variant).find(m => givesCheck(p.board, m, 1, p.rules.variant) && !wins.includes(`${m.from}-${m.to}`))!
      expect(wrong, `${id} d${d}`).toBeTruthy()
      expect(playOut(p, wrong, seed).result, `${id} d${d} s${seed}`).toBe('lose')
    }
  })

  it('the defender plays real moves: it picks the reply that holds out longest', () => {
    const p = puzzleFor('ju-zhong-mi', 4, 2)
    const key = winningMoves(p.board, 1, 3, p.rules)[0]
    const after = applyMove(p.board, key)
    const replies = legalMoves(after, -1, 'xiangqi')
    expect(replies.length).toBeGreaterThanOrEqual(2)
    const best = defend(after, 2, p.rules, 2)!
    const dist = (m: Move) => mateDistance(applyMove(after, m), 1, 2, p.rules)
    expect(Math.max(...replies.map(dist))).toBe(dist(best))
  })

  it('checking with the first piece that can loses most multi-move puzzles', () => {
    let lost = 0, n = 0
    for (const id of CONFIG_IDS) for (const d of [2, 3, 4] as Difficulty[]) for (const seed of [0, 1, 2, 3]) {
      const p = puzzleFor(id, d, seed)
      let b = p.board, left = p.moves, result: string | null = null
      for (let k = 0; k < 4 && !result; k++) {
        const m = redMoves(p, b).find(x => givesCheck(b, x, 1, p.rules.variant)) ?? redMoves(p, b)[0]
        if (!m) { result = 'lose'; break }
        const res = playTurn(p, b, m, left, seed)
        result = res.result
        if (!result) { b = res.afterReply!; left-- }
      }
      n++
      if (result !== 'win') lost++
    }
    expect(lost / n).toBeGreaterThanOrEqual(0.6)
  })

  it('seven stars: only checking moves are offered; janggi mates use Korean moves', () => {
    const p = puzzleFor('seven-stars', 2, 4)
    const offered = redMoves(p, p.board)
    expect(offered.length).toBeGreaterThan(0)
    expect(offered.every(m => givesCheck(p.board, m, 1, 'xiangqi'))).toBe(true)
    expect(offered.length).toBeLessThan(legalMoves(p.board, 1, 'xiangqi').length)
    const j = puzzleFor('janggi', 3, 0)
    expect(j.rules.variant).toBe('janggi')
    expect(mateDistance(j.board, 1, 3, j.rules)).toBe(3)
  })

  it('cannon and horse configs only accept a mate from that piece', () => {
    for (const [id, t] of [['cannon', C], ['horse', H]] as const) {
      const p = puzzleFor(id, 1, 0)
      const win = winningMoves(p.board, 1, 1, p.rules)[0]
      const after = applyMove(p.board, win)
      expect(checkers(after, -1, 'xiangqi').some(i => Math.abs(after[i]) === t), id).toBe(true)
    }
    // A mate by another piece does not count under a mateBy rule.
    const b = parse('Kd0 Ra9 Rb8 ke9')
    expect(isMate(b, 1, { variant: 'xiangqi', mateBy: C })).toBe(false)
    expect(isMate(b, 1, XQ)).toBe(true)
  })
})

describe('xiangqi component', () => {
  const props = (id: string, d: Difficulty, seed: number, onWin = () => {}, onLose = () => {}) => ({ configId: id, difficulty: d, seed, onWin, onLose })
  const click = (c: HTMLElement, i: number) => fireEvent.click(c.querySelector(`[data-pt="${i}"]`)!)

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(XiangqiGame, props(id, d, 1)))
      expect(container.querySelectorAll('[data-pt]').length).toBe(90)
      expect(container.querySelector('[data-testid="moves-left"]')!.textContent).toContain(`${depthFor(d)} move`)
      expect(container.querySelectorAll(`[data-piece="${K}"]`).length).toBe(1)
      unmount()
    }
  })

  it('playing the forced mate wins exactly once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of [1, 3] as Difficulty[]) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(XiangqiGame, props(id, d, 6, onWin, onLose)))
      const p = puzzleFor(id, d, 6)
      const { line, result } = playOut(p, null, 6)
      expect(result).toBe('win')
      for (const m of line) {
        click(container, m.from)
        expect(container.querySelector(`[data-pt="${m.to}"]`)!.getAttribute('data-target')).toBe('1')
        click(container, m.to)
        act(() => { vi.advanceTimersByTime(600) })
      }
      act(() => { vi.advanceTimersByTime(1500) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('a wrong line loses exactly once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(XiangqiGame, props(id, 2, 3, onWin, onLose)))
      const p = puzzleFor(id, 2, 3)
      const wins = winningMoves(p.board, 1, 2, p.rules).map(m => `${m.from}-${m.to}`)
      const wrong = legalMoves(p.board, 1, p.rules.variant).find(m => givesCheck(p.board, m, 1, p.rules.variant) && !wins.includes(`${m.from}-${m.to}`))!
      const { line, result } = playOut(p, wrong, 3)
      expect(result).toBe('lose')
      for (const m of line) {
        click(container, m.from); click(container, m.to)
        act(() => { vi.advanceTimersByTime(600) })
      }
      act(() => { vi.advanceTimersByTime(1500) })
      expect(onLose, id).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })
})
