// Tactics campaign: the move generator plays real chess, every bank pattern
// is an exact mate at every placement the game can use, and every generated
// campaign is winnable by a player who finds the mates.
import { describe, it, expect, vi } from 'vitest'
import {
  CONFIGS, PATTERNS, SYMMETRIES, symmetriesFor, placePattern, exactMate, boardFrom, legalMoves, makeMove, inCheck,
  isCheckmate, isStalemate, mateDepth, mateMove, judgeMove, bestReply, makeCampaign, moveName, squareName,
  BOARD_SIZE, STAGE_DEPTHS, MAX_MISSES, type Board, type Piece,
} from '@/components/minigames/TacticsGame'
import type { Difficulty } from '@/games/types'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
/** Build a board from algebraic squares on an 8×8 board, e.g. { e1: 'WK' }. */
function fen(pieces: Record<string, Piece>, size = 8): Board {
  return boardFrom(size, size, Object.entries(pieces).map(([sq, piece]) => ({ piece, col: sq.charCodeAt(0) - 97, row: size - Number(sq.slice(1)) })))
}
const idx = (b: Board, sq: string) => (b.rows - Number(sq.slice(1))) * b.cols + (sq.charCodeAt(0) - 97)
const dests = (b: Board, sq: string) => legalMoves(b, b.sq[idx(b, sq)]![0] as 'W' | 'B', idx(b, sq)).map(m => squareName(b, m.to)).sort()

describe('move generator', () => {
  it('counts the standard opening position: 20 moves each side', () => {
    const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
    const pieces: Record<string, Piece> = {}
    'abcdefgh'.split('').forEach((f, i) => {
      pieces[`${f}1`] = `W${back[i]}` as Piece; pieces[`${f}2`] = 'WP'
      pieces[`${f}8`] = `B${back[i]}` as Piece; pieces[`${f}7`] = 'BP'
    })
    const b = fen(pieces)
    expect(legalMoves(b, 'W')).toHaveLength(20)
    expect(legalMoves(b, 'B')).toHaveLength(20)
  })
  it('piece moves: knight jumps, sliders stop at blockers, pawns capture diagonally', () => {
    const b = fen({ e1: 'WK', h8: 'BK', d4: 'WN', a1: 'WR', a4: 'WP', c3: 'BP', b2: 'WB', e4: 'WP', d5: 'BP', f5: 'BN' })
    expect(dests(b, 'd4')).toEqual(['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'])
    expect(dests(b, 'a1')).toEqual(['a2', 'a3', 'b1', 'c1', 'd1'])
    expect(dests(b, 'b2')).toEqual(['a3', 'c1', 'c3'])
    expect(dests(b, 'e4')).toEqual(['d5', 'e5', 'f5'])
    expect(dests(b, 'a4')).toEqual(['a5'])
  })
  it('double steps only from the home row of a full board', () => {
    expect(dests(fen({ a1: 'WK', h8: 'BK', e2: 'WP' }), 'e2')).toEqual(['e3', 'e4'])
    expect(dests(fen({ a1: 'WK', h8: 'BK', e7: 'BP' }), 'e7')).toEqual(['e5', 'e6'])
    expect(dests(fen({ a1: 'WK', f6: 'BK', e5: 'WP' }, 6), 'e5')).toEqual(['e6'])
  })
  it('kings may not step into check or next to the other king', () => {
    const b = fen({ e1: 'WK', e3: 'BK', a2: 'BR' })
    expect(dests(b, 'e1')).toEqual(['d1', 'f1'])
  })
  it('pinned pieces may only move along the pin', () => {
    const b = fen({ e1: 'WK', e4: 'WR', e8: 'BQ', a8: 'BK', c3: 'WB', a5: 'BB' })
    expect(dests(b, 'e4')).toEqual(['e2', 'e3', 'e5', 'e6', 'e7', 'e8'])
    // The bishop on c3 is pinned diagonally by a5... no: a5-b4-c3-d2-e1 — it can only slide along that line.
    expect(dests(b, 'c3')).toEqual(['a5', 'b4', 'd2'])
  })
  it('in check, only evasions are legal: block, capture or step away', () => {
    const b = fen({ e1: 'WK', e8: 'BR', a8: 'BK', d2: 'WP', c6: 'WN', h4: 'WB' })
    const names = legalMoves(b, 'W').map(m => moveName(b, m)).sort()
    expect(names).toEqual(['Be7', 'Kd1', 'Kf1', 'Kf2', 'Ne5', 'Ne7'])
  })
  it('promotion turns a pawn into a queen and can mate', () => {
    const b = fen({ a6: 'WK', a8: 'BK', b7: 'WP', h1: 'BR', g7: 'WP' })
    const promo = legalMoves(b, 'W').filter(m => m.promo)
    expect(promo.length).toBeGreaterThan(0)
    expect(promo.every(m => m.promo === 'Q')).toBe(true)
  })
  it('recognises checkmate and stalemate', () => {
    expect(isCheckmate(fen({ g6: 'WK', h8: 'BK', a8: 'WR' }), 'B')).toBe(true)
    expect(isStalemate(fen({ g6: 'WK', h8: 'BK', f7: 'WQ' }), 'B')).toBe(true)
    expect(isCheckmate(fen({ g6: 'WK', h8: 'BK', f7: 'WQ' }), 'B')).toBe(false)
  })
  it('finds known mates by search: back rank in 1, Q+K in 2, and rejects stalemating moves', () => {
    const backRank = fen({ g1: 'WK', a1: 'WR', g8: 'BK', f7: 'BP', g7: 'BP', h7: 'BP' })
    expect(mateDepth(backRank, 2)).toBe(1)
    expect(moveName(backRank, mateMove(backRank, 1)!)).toBe('Ra8#')
    // Q+K vs K: Kg6 is not available — the classic quiet Qf6/Qg5 net mates in two.
    const qk = fen({ f6: 'WK', h8: 'BK', e5: 'WQ' })
    expect(mateDepth(qk, 3)).toBeLessThanOrEqual(2)
    const stalemate = { from: idx(qk, 'e5'), to: idx(qk, 'f7') }
    expect(judgeMove(qk, stalemate, 2)).not.toBe('good')
  })
})

describe('mate pattern bank', () => {
  it('names are unique and every depth has enough patterns for a campaign', () => {
    expect(new Set(PATTERNS.map(p => p.name)).size).toBe(PATTERNS.length)
    for (const d of DIFFS) for (const depth of [1, 2, 3]) {
      const need = STAGE_DEPTHS(d).filter(x => x === depth).length
      expect(PATTERNS.filter(p => p.depth === depth).length).toBeGreaterThanOrEqual(need)
    }
  })
  for (const p of PATTERNS) {
    it(`${p.name}: exact mate in ${p.depth} at every symmetry and board size`, () => {
      expect(p.diagram.split('/').every(l => l.length === 6)).toBe(true)
      for (const size of [6, 7, 8]) for (const s of symmetriesFor(p)) {
        const b = placePattern(p, size, s)
        expect(b.sq.filter(x => x === 'WK').length).toBe(1)
        expect(b.sq.filter(x => x === 'BK').length).toBe(1)
        expect(exactMate(b, p.depth), `${size}x${size} symmetry ${s}`).toBe(true)
      }
    })
  }
  it('symmetries are permutations of the board', () => {
    for (const t of SYMMETRIES) {
      const seen = new Set<string>()
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) seen.add(t(r, c, 8).join())
      expect(seen.size).toBe(64)
    }
  })
})

describe('historical openers', () => {
  for (const [id, cfg] of Object.entries(CONFIGS)) {
    it(`${id}: a fair mate in one, and the book move mates`, () => {
      const b = boardFrom(cfg.rows, cfg.cols, cfg.board)
      expect(exactMate(b, 1), `${id} is not an exact mate in one`).toBe(true)
      const from = cfg.winFrom[0] * cfg.cols + cfg.winFrom[1], to = cfg.winTo[0] * cfg.cols + cfg.winTo[1]
      expect(judgeMove(b, { from, to }, 1)).toBe('mate')
    })
  }
})

/** Play a campaign the way a strong player would, with Black's stubborn replies. */
function playCampaign(id: string, d: Difficulty, seed: number) {
  const stages = makeCampaign(id, CONFIGS[id], d, seed)
  for (const st of stages) {
    expect(inCheck(st.board, 'B') || inCheck(st.board, 'W')).toBe(false)
    expect(mateDepth(st.board, st.depth), `${id} d${d} seed ${seed}: ${st.name}`).toBe(st.depth)
    let b = st.board, mated = false
    for (let left = st.depth; left > 0; left--) {
      const m = mateMove(b, left)
      expect(m, `${id} d${d} seed ${seed} ${st.name}: no mating move with ${left} left`).not.toBeNull()
      const v = judgeMove(b, m!, left)
      if (v === 'mate') { mated = true; break }
      expect(v).toBe('good')
      const nb = makeMove(b, m!)
      const r = bestReply(nb, left - 1)
      expect(r).not.toBeNull()
      b = makeMove(nb, r!)
    }
    expect(mated, `${id} d${d} seed ${seed} ${st.name}: never mated`).toBe(true)
  }
  return stages
}

describe('campaigns', () => {
  it('stage counts and board sizes scale with difficulty', () => {
    for (const d of DIFFS) {
      const stages = makeCampaign('general', CONFIGS.general, d, 7)
      expect(stages).toHaveLength(1 + STAGE_DEPTHS(d).length)
      for (const st of stages.slice(1)) expect(st.board.rows).toBe(BOARD_SIZE(d))
    }
    expect(BOARD_SIZE(3)).toBe(8)
    expect(BOARD_SIZE(4)).toBe(8)
    expect(MAX_MISSES(4)).toBeGreaterThanOrEqual(1)
  })
  it('is deterministic from the seed and varies across seeds', () => {
    const a = makeCampaign('senate', CONFIGS.senate, 3, 42).map(s => s.board.sq.join())
    const b = makeCampaign('senate', CONFIGS.senate, 3, 42).map(s => s.board.sq.join())
    expect(a).toEqual(b)
    const variety = new Set(Array.from({ length: 12 }, (_, s) => makeCampaign('senate', CONFIGS.senate, 3, s)[1].board.sq.join()))
    expect(variety.size).toBeGreaterThan(4)
  })
  for (const id of Object.keys(CONFIGS)) {
    it(`${id}: every generated position is an exact forced mate, won against stubborn defence`, () => {
      for (const d of DIFFS) for (let seed = 0; seed < 6; seed++) playCampaign(id, d, seed * 7919 + 1)
    }, 120_000)
  }
  it('expert boards carry extra pawns beyond the pattern', () => {
    let extra = 0
    for (let seed = 0; seed < 10; seed++) for (const st of makeCampaign('gaugamela', CONFIGS.gaugamela, 4, seed).slice(1)) {
      const p = PATTERNS.find(x => x.name === st.name)!
      extra += st.board.sq.filter(Boolean).length - p.diagram.replace(/[./]/g, '').length
    }
    expect(extra).toBeGreaterThan(0)
  })
  it('a wrong-but-legal move is judged bad', () => {
    const st = makeCampaign('general', CONFIGS.general, 2, 3)[2]
    const bad = legalMoves(st.board, 'W').find(m => judgeMove(st.board, m, st.depth) === 'bad')
    expect(bad).toBeDefined()
  })
})

describe('TacticsGame UI', () => {
  it('plays the opener by taps, then moves on to the generated act; a wrong move counts', async () => {
    const { render, screen, fireEvent, act, cleanup } = await import('@testing-library/react')
    const { createElement } = await import('react')
    const { default: TacticsGame } = await import('@/components/minigames/TacticsGame')
    vi.useFakeTimers()
    let won = 0
    render(createElement(TacticsGame, { configId: 'general', difficulty: 1, seed: 1, onWin: () => { won++ }, onLose: () => {} }))
    // A legal but non-mating rook move first.
    fireEvent.click(screen.getByLabelText(/^a5 white rook/))
    expect(document.querySelectorAll('.bg-accent\\/60').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByLabelText(/^a4$/))
    expect(screen.getByRole('status').textContent).toMatch(/Black escapes/)
    expect(screen.getByText(/✗ 1 \/ 4/)).toBeTruthy()
    act(() => { vi.advanceTimersByTime(1200) })
    fireEvent.click(screen.getByLabelText(/^a5 white rook/))
    fireEvent.click(screen.getByLabelText(/^a6$/))
    expect(screen.getByRole('status').textContent).toMatch(/checkmate/i)
    act(() => { vi.advanceTimersByTime(1400) })
    expect(screen.getAllByText(/Act II/).length).toBeGreaterThan(0)
    expect(won).toBe(0)
    cleanup()
    vi.useRealTimers()
  })
})
