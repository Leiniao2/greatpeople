import { useEffect, useMemo, useRef, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { artCover, type GameArtKey } from '@/games/art'
import { hashString, mulberry32, pick, resolveConfig, scale, shuffle, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Tactics: a short checkmate campaign.  Each challenge opens with its
// hand-authored historical position (mate in one) and continues with
// positions drawn from a bank of mate patterns, placed and turned by seed on
// a board that grows to a full 8×8.  Later positions need two or three
// moves; Black answers every move with its most stubborn reply.
//
// The rules are real chess for K, Q, R, B, N and P (no castling or en
// passant; pawns promote to queens and only double-step on an 8-row board),
// and moves are judged by search: any move that still forces mate in the
// moves left is accepted, not just one scripted answer.
//
// Difficulty: more positions, bigger boards, deeper mates, extra pawns on
// the board, and fewer wrong-but-legal moves allowed.

// ── Chess engine ─────────────────────────────────────────────────────────────

export type Color = 'W' | 'B'
export type Kind = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P'
export type Piece = `${Color}${Kind}` | null

export interface Board { rows: number; cols: number; sq: Piece[] }
export interface Move { from: number; to: number; promo?: Kind }

const KNIGHT: [number, number][] = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]
const KING: [number, number][] = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
const ORTHO: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const DIAG: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]]

const colorOf = (p: Piece): Color | null => (p ? (p[0] as Color) : null)
const kindOf = (p: Piece): Kind | null => (p ? (p[1] as Kind) : null)
const other = (c: Color): Color => (c === 'W' ? 'B' : 'W')
/** Pawns move toward row 0 for White and toward the last row for Black. */
const pawnDir = (c: Color) => (c === 'W' ? -1 : 1)

export function boardFrom(rows: number, cols: number, pieces: { piece: Piece; row: number; col: number }[]): Board {
  const sq: Piece[] = Array(rows * cols).fill(null)
  for (const { piece, row, col } of pieces) sq[row * cols + col] = piece
  return { rows, cols, sq }
}

/** Is square `i` attacked by any piece of colour `by`? */
export function isAttacked(b: Board, i: number, by: Color): boolean {
  const { rows, cols, sq } = b
  const r = Math.floor(i / cols), c = i % cols
  const at = (rr: number, cc: number) => (rr >= 0 && rr < rows && cc >= 0 && cc < cols ? sq[rr * cols + cc] : undefined)
  for (const [dr, dc] of KNIGHT) if (at(r + dr, c + dc) === `${by}N`) return true
  for (const [dr, dc] of KING) if (at(r + dr, c + dc) === `${by}K`) return true
  // A pawn of colour `by` attacks diagonally forward, so it sits one row behind.
  const pr = r - pawnDir(by)
  if (at(pr, c - 1) === `${by}P` || at(pr, c + 1) === `${by}P`) return true
  for (const [dirs, kinds] of [[ORTHO, 'RQ'], [DIAG, 'BQ']] as const) {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc
      for (;;) {
        const p = at(rr, cc)
        if (p === undefined) break
        if (p) { if (p[0] === by && kinds.includes(p[1])) return true; break }
        rr += dr; cc += dc
      }
    }
  }
  return false
}

const kingSquare = (b: Board, c: Color) => b.sq.indexOf(`${c}K`)

export function inCheck(b: Board, c: Color): boolean {
  const k = kingSquare(b, c)
  return k >= 0 && isAttacked(b, k, other(c))
}

/** Moves that obey how each piece moves, ignoring whether they leave the king in check. */
function pseudoMoves(b: Board, side: Color, onlyFrom?: number): Move[] {
  const { rows, cols, sq } = b
  const out: Move[] = []
  const lastRow = side === 'W' ? 0 : rows - 1
  for (let i = onlyFrom ?? 0; i < (onlyFrom === undefined ? sq.length : onlyFrom + 1); i++) {
    const p = sq[i]
    if (!p || p[0] !== side) continue
    const r = Math.floor(i / cols), c = i % cols
    const add = (rr: number, cc: number) => {
      const to = rr * cols + cc
      out.push(kindOf(p) === 'P' && rr === lastRow ? { from: i, to, promo: 'Q' } : { from: i, to })
    }
    const free = (rr: number, cc: number) => rr >= 0 && rr < rows && cc >= 0 && cc < cols && !sq[rr * cols + cc]
    const enemy = (rr: number, cc: number) => rr >= 0 && rr < rows && cc >= 0 && cc < cols && colorOf(sq[rr * cols + cc]) === other(side)
    const step = (dirs: [number, number][]) => {
      for (const [dr, dc] of dirs) if (free(r + dr, c + dc) || enemy(r + dr, c + dc)) add(r + dr, c + dc)
    }
    const slide = (dirs: [number, number][]) => {
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc
        while (free(rr, cc)) { add(rr, cc); rr += dr; cc += dc }
        if (enemy(rr, cc)) add(rr, cc)
      }
    }
    switch (p[1] as Kind) {
      case 'K': step(KING); break
      case 'N': step(KNIGHT); break
      case 'R': slide(ORTHO); break
      case 'B': slide(DIAG); break
      case 'Q': slide(ORTHO); slide(DIAG); break
      case 'P': {
        const d = pawnDir(side)
        if (free(r + d, c)) {
          add(r + d, c)
          // Double step only on a full-height board, from the pawn's home row.
          const home = side === 'W' ? rows - 2 : 1
          if (rows >= 8 && r === home && free(r + 2 * d, c)) add(r + 2 * d, c)
        }
        for (const dc of [-1, 1]) if (enemy(r + d, c + dc)) add(r + d, c + dc)
        break
      }
    }
  }
  return out
}

export function makeMove(b: Board, m: Move): Board {
  const sq = b.sq.slice()
  const p = sq[m.from]
  sq[m.to] = m.promo && p ? (`${p[0]}${m.promo}` as Piece) : p
  sq[m.from] = null
  return { rows: b.rows, cols: b.cols, sq }
}

/** Fully legal moves: kings may not be left (or walk) into check. Captures of the king never arise. */
export function legalMoves(b: Board, side: Color, onlyFrom?: number): Move[] {
  return pseudoMoves(b, side, onlyFrom).filter(m => {
    if (kindOf(b.sq[m.to]) === 'K') return false
    return !inCheck(makeMove(b, m), side)
  })
}

export const isCheckmate = (b: Board, side: Color) => inCheck(b, side) && legalMoves(b, side).length === 0
export const isStalemate = (b: Board, side: Color) => !inCheck(b, side) && legalMoves(b, side).length === 0

// ── Mate search ──────────────────────────────────────────────────────────────

const PIECE_CH: Record<string, string> = { WK: 'K', WQ: 'Q', WR: 'R', WB: 'B', WN: 'N', WP: 'P', BK: 'k', BQ: 'q', BR: 'r', BB: 'b', BN: 'n', BP: 'p' }
const keyOf = (b: Board) => b.sq.map(p => (p ? PIECE_CH[p] : '.')).join('')
const memo = new Map<string, boolean>()

/** Forcing moves first: checks, then captures — mates are found far sooner. */
function ordered(b: Board, moves: Move[]): { m: Move; nb: Board; check: boolean }[] {
  const out = moves.map(m => { const nb = makeMove(b, m); return { m, nb, check: inCheck(nb, 'B'), cap: !!b.sq[m.to] } })
  out.sort((x, y) => Number(y.check) * 2 + Number(y.cap) - (Number(x.check) * 2 + Number(x.cap)))
  return out
}

/** Can White, to move, force checkmate within `n` of its own moves? */
export function hasMateIn(b: Board, n: number): boolean {
  if (n <= 0) return false
  const key = `${b.rows}x${b.cols}:${n}:${keyOf(b)}`
  const hit = memo.get(key)
  if (hit !== undefined) return hit
  const res = mateMove(b, n) !== null
  if (memo.size > 400_000) memo.clear()
  memo.set(key, res)
  return res
}

/** A first move that forces mate within `n` White moves, or null. */
export function mateMove(b: Board, n: number): Move | null {
  if (n <= 0) return null
  for (const { m, nb, check } of ordered(b, legalMoves(b, 'W'))) {
    if (n === 1 && !check) continue
    if (keepsMate(nb, n - 1, check)) return m
  }
  return null
}

/** After White's move (Black to move): is Black mated now or in at most `left` more White moves? */
function keepsMate(nb: Board, left: number, check = inCheck(nb, 'B')): boolean {
  const replies = legalMoves(nb, 'B')
  if (replies.length === 0) return check
  if (left <= 0) return false
  return replies.every(r => hasMateIn(makeMove(nb, r), left))
}

/** Fewest White moves to force mate, searching up to `max`; Infinity if none. */
export function mateDepth(b: Board, max: number): number {
  for (let n = 1; n <= max; n++) if (hasMateIn(b, n)) return n
  return Infinity
}

/** Judge White's move with `left` moves (including this one) to finish. */
export function judgeMove(b: Board, m: Move, left: number): 'mate' | 'good' | 'stalemate' | 'bad' {
  const nb = makeMove(b, m)
  const replies = legalMoves(nb, 'B')
  if (replies.length === 0) return inCheck(nb, 'B') ? 'mate' : 'stalemate'
  return keepsMate(nb, left - 1) ? 'good' : 'bad'
}

/** Black's most stubborn reply: the one that delays mate longest (ties: the first found). */
export function bestReply(nb: Board, left: number): Move | null {
  const replies = legalMoves(nb, 'B')
  let best: Move | null = null, bestD = -1
  for (const r of replies) {
    const d = mateDepth(makeMove(nb, r), left)
    if (d > bestD) { best = r; bestD = d }
  }
  return best
}

// ── Mate pattern bank ────────────────────────────────────────────────────────
// 6×6 diagrams, rank 8 first: upper case White, lower case Black.  Each is
// placed in the top-left corner of the board and then turned by seed — all
// eight symmetries when there are no pawns, a mirror only when there are.
// The audit checks every pattern at every symmetry and board size used.

export interface MatePattern { name: string; depth: 1 | 2 | 3; diagram: string }

export const PATTERNS: MatePattern[] = [
  // Mate in one
  { name: 'Back-rank mate',      depth: 1, diagram: '.k..../ppp.../....../....../...R../.....K' },
  { name: 'Smothered mate',      depth: 1, diagram: 'kr..../pp..../....../...N../....../.....K' },
  { name: 'Arabian mate',        depth: 1, diagram: 'k...../.....R/..N.../....../....../.....K' },
  { name: "The queen's kiss",    depth: 1, diagram: 'k...../.....Q/.K..../....../....../......' },
  { name: 'Corridor mate',       depth: 1, diagram: '.k..../....../.K..../....../....../.....R' },
  // Mate in two
  { name: 'The quiet queen',     depth: 2, diagram: '.k..../....../....../.K..../....../....Q.' },
  { name: 'Queen and king box',  depth: 2, diagram: '.k..../...K.Q/....../....../....../......' },
  { name: 'Rook ladder',         depth: 2, diagram: '....../.k..../....../K...../..R..R/......' },
  { name: 'Rooks on parade',     depth: 2, diagram: 'k...../....../....../..R.../.K..../...R..' },
  { name: 'Knight and rook net', depth: 2, diagram: 'k...../....../..K..R/...N../....../......' },
  { name: 'The knight closes',   depth: 2, diagram: '.k..../..R.../..K..N/....../....../......' },
  { name: 'Bishop and rook net', depth: 2, diagram: '.k..../....../...K../....../....B./..R...' },
  { name: 'Long diagonal',       depth: 2, diagram: 'k..B../....../...K../..R.../....../......' },
  { name: 'Pawn shelter',        depth: 2, diagram: '.k..../...p../...p.Q/.K..../....../......' },
  { name: 'Broken shelter',      depth: 2, diagram: 'k...../.p..../p...../K...../....Q./......' },
  { name: 'Queen and knight',    depth: 2, diagram: 'k...../...K../..pQN./....../....../......' },
  { name: 'Seventh-rank rook',   depth: 2, diagram: 'k...../p.ppR./....../.K..../....../......' },
  { name: 'Minor-piece mate',    depth: 2, diagram: '.N..../k.K.../ppB.../....../....../......' },
  { name: 'Bishop and knight',   depth: 2, diagram: 'k.B.../..KN../p..p../....../....../......' },
  { name: 'Through the guard',   depth: 2, diagram: 'k...../pR.Q../...pK./....../..r.../......' },
  { name: 'Rook lift',           depth: 2, diagram: '.k..../.p.p../p....R/..K.../....../......' },
  // Mate in three
  { name: 'Queen herds the king',  depth: 3, diagram: 'k...../....../....../K...../.....Q/......' },
  { name: 'The closing box',       depth: 3, diagram: '..k.../....../...Q../.K..../....../......' },
  { name: 'Lone rook',             depth: 3, diagram: 'k...../....../....../..K.../.R..../......' },
  { name: 'Rook and king march',   depth: 3, diagram: '.k..../....../...K../....../....R./......' },
  { name: 'Two-rook roller',       depth: 3, diagram: '.R..../..k.../....../....../..K.../R.....' },
  { name: 'Rooks from afar',       depth: 3, diagram: '....../k...K./....../.....R/....R./......' },
  { name: 'Knight escort',         depth: 3, diagram: '.k..../....../...K../....../....N./..R...' },
  { name: 'Bishop escort',         depth: 3, diagram: '.k..../....../....../K.B.R./....../......' },
  { name: 'Through the pawns',     depth: 3, diagram: 'k...../..p.../...p../....../..K.../.Q....' },
  { name: 'Queen on the flank',    depth: 3, diagram: '.k..../...p../..p.../K...../Q...../......' },
  { name: 'Queen and knight hunt', depth: 3, diagram: '.k...N/p..Q../....K./....../....../......' },
]

const CH_PIECE: Record<string, Piece> = Object.fromEntries(Object.entries(PIECE_CH).map(([p, ch]) => [ch, p as Piece]))

export function parseDiagram(diagram: string): { piece: Piece; row: number; col: number }[] {
  const out: { piece: Piece; row: number; col: number }[] = []
  diagram.split('/').forEach((line, row) => [...line].forEach((ch, col) => { if (ch !== '.') out.push({ piece: CH_PIECE[ch], row, col }) }))
  return out
}

/** The eight symmetries of a square board. */
export const SYMMETRIES: ((r: number, c: number, n: number) => [number, number])[] = [
  (r, c) => [r, c],
  (r, c, n) => [r, n - 1 - c],
  (r, c, n) => [c, n - 1 - r],
  (r, c, n) => [n - 1 - r, n - 1 - c],
  (r, c, n) => [n - 1 - c, r],
  (r, c, n) => [n - 1 - r, c],
  (r, c) => [c, r],
  (r, c, n) => [n - 1 - c, n - 1 - r],
]
export const hasPawns = (p: MatePattern) => /p/i.test(p.diagram)
export const symmetriesFor = (p: MatePattern) => (hasPawns(p) ? [0, 1] : [0, 1, 2, 3, 4, 5, 6, 7])

export function placePattern(p: MatePattern, size: number, sym: number): Board {
  const t = SYMMETRIES[sym]
  return boardFrom(size, size, parseDiagram(p.diagram).map(({ piece, row, col }) => {
    const [r, c] = t(row, col, size)
    return { piece, row: r, col: c }
  }))
}

/** A fair puzzle: nobody is in check yet and the fastest mate takes exactly `depth` moves. */
export const exactMate = (b: Board, depth: number) =>
  !inCheck(b, 'W') && !inCheck(b, 'B') && mateDepth(b, depth) === depth

/** Scatter a few pawns far from the action; keep them only if the puzzle stays exact. */
function addDistractors(b: Board, depth: number, count: number, rng: Rng): Board {
  let cur = b
  const bk = cur.sq.indexOf('BK'), wk = cur.sq.indexOf('WK')
  const far = (i: number) => [bk, wk].every(k => Math.max(Math.abs(Math.floor(i / b.cols) - Math.floor(k / b.cols)), Math.abs((i % b.cols) - (k % b.cols))) >= 3)
  for (let n = 0; n < count; n++) {
    const piece: Piece = n % 2 === 0 ? 'WP' : 'BP'
    const spots = shuffle(cur.sq.map((_, i) => i).filter(i => {
      const r = Math.floor(i / b.cols)
      return !cur.sq[i] && far(i) && r >= 1 && r <= b.rows - 2 && (piece === 'WP' ? r >= b.rows - 3 : r <= b.rows - 4)
    }), rng)
    for (const i of spots.slice(0, 6)) {
      const sq = cur.sq.slice(); sq[i] = piece
      const nb = { ...cur, sq }
      if (exactMate(nb, depth)) { cur = nb; break }
    }
  }
  return cur
}

export interface TacticsStage {
  board: Board
  depth: number
  name: string
  /** Shown above the board. */
  text: string
}

export const BOARD_SIZE = (d: Difficulty) => scale(d, [6, 7, 8, 8])
/** Mate depths of the generated positions that follow the authored opener. */
// One mate in three at most, and only from D4: D3 had a mate in three and D4 two mates in
// two plus a mate in three, which ran past three minutes for a casual player.
export const STAGE_DEPTHS = (d: Difficulty): number[] => scale(d, [[2], [1, 2], [2, 2], [2, 3]])
export const DISTRACTORS = (d: Difficulty) => scale(d, [0, 0, 2, 3])
/** Wrong-but-legal moves allowed over the whole campaign. */
export const MAX_MISSES = (d: Difficulty) => scale(d, [4, 3, 3, 2])

const ACTS = ['I', 'II', 'III', 'IV', 'V']

/** The full campaign for a challenge: the authored opener, then generated positions. */
export function makeCampaign(configId: string, cfg: TacticsConfig, difficulty: Difficulty, seed: number): TacticsStage[] {
  const rng = mulberry32((seed ^ hashString(configId)) >>> 0)
  const size = BOARD_SIZE(difficulty)
  const stages: TacticsStage[] = [{
    board: boardFrom(cfg.rows, cfg.cols, cfg.board), depth: 1, name: cfg.title, text: cfg.question,
  }]
  const used = new Set<string>()
  for (const depth of STAGE_DEPTHS(difficulty)) {
    const pool = PATTERNS.filter(p => p.depth === depth && !used.has(p.name))
    const pattern = pick(pool, rng)
    used.add(pattern.name)
    const syms = shuffle(symmetriesFor(pattern), rng)
    let board = placePattern(pattern, size, 0)
    for (const s of syms) {
      const b = placePattern(pattern, size, s)
      if (exactMate(b, depth)) { board = b; break }
    }
    board = addDistractors(board, depth, DISTRACTORS(difficulty), rng)
    const act = ACTS[stages.length]
    const lead = cfg.commander ? `${cfg.commander} presses on` : 'The campaign goes on'
    stages.push({
      board, depth, name: pattern.name,
      text: `Act ${act} — ${pattern.name}. ${lead}: White mates in ${depth}.${depth > 1 ? ' Black will answer every move.' : ''}`,
    })
  }
  return stages
}

// ── Notation ─────────────────────────────────────────────────────────────────

export const squareName = (b: Board, i: number) => `${'abcdefgh'[i % b.cols]}${b.rows - Math.floor(i / b.cols)}`

export function moveName(b: Board, m: Move): string {
  const p = b.sq[m.from]
  const kind = kindOf(p)
  const cap = !!b.sq[m.to]
  const nb = makeMove(b, m)
  const them = other(colorOf(p) ?? 'W')
  const mark = inCheck(nb, them) ? (legalMoves(nb, them).length ? '+' : '#') : ''
  const head = kind === 'P' ? (cap ? 'abcdefgh'[m.from % b.cols] : '') : kind
  return `${head}${cap ? '×' : ''}${squareName(b, m.to)}${m.promo ? '=Q' : ''}${mark}`
}

// ── Historical openers ───────────────────────────────────────────────────────

export interface TacticsConfig {
  title: string
  question: string
  /** Painted backdrop for the banner. */
  theater?: GameArtKey
  /** Who presses the attack in the later acts. */
  commander?: string
  rows: number
  cols: number
  board: { piece: Piece; row: number; col: number }[]
  /** The book move of the opener (any mate is accepted). */
  winFrom: [number, number]
  winTo: [number, number]
  fact: string
}

export const CONFIGS: Record<string, TacticsConfig> = {
  'musashi-duel': {
    theater: 'tactics_ganryu', commander: 'Musashi',
    title: 'Ganryū Island',
    question: "Musashi holds the high ground. One move wins the duel — find it.",
    rows: 5, cols: 5,
    board: [
      { piece: 'BK', row: 0, col: 4 },
      { piece: 'BP', row: 0, col: 3 },
      { piece: 'BP', row: 1, col: 4 },
      { piece: 'WQ', row: 4, col: 3 },
      { piece: 'WK', row: 2, col: 2 },
    ],
    winFrom: [4, 3], winTo: [1, 3],
    fact: "Musashi arrived two hours late to his duel with Sasaki Kojirō — deliberately. The waiting shattered Kojirō's composure. When Kojirō threw his scabbard into the sea, Musashi said, 'You have already lost.' He then charged, striking before Kojirō could complete his famous Swallow Cut.",
  },
  senate: {
    theater: 'tactics_senate', commander: 'Pericles',
    title: 'Senate Gambit',
    question: 'Pericles commands the white pieces. Find the move that delivers checkmate in one.',
    rows: 6, cols: 6,
    board: [
      { piece: 'BK', row: 0, col: 0 },
      { piece: 'BP', row: 0, col: 1 },
      { piece: 'BP', row: 1, col: 0 },
      { piece: 'WQ', row: 1, col: 4 },
      { piece: 'WK', row: 2, col: 2 },
    ],
    winFrom: [1, 4], winTo: [1, 1],
    fact: 'Pericles used strategic positioning — controlling Athens through placement of allies — just as a queen controls the board by commanding lines.',
  },
  'crane-wing': {
    theater: 'tactics_board', commander: 'Admiral Yi',
    title: 'The Crane Wing',
    question: 'The enemy flagship has followed you out of the narrows into open water. Swing the rook across to close the wing — checkmate in one.',
    rows: 6, cols: 6,
    board: [
      { piece: 'BK', row: 0, col: 5 },
      { piece: 'WR', row: 1, col: 0 },
      { piece: 'WK', row: 2, col: 4 },
    ],
    winFrom: [1, 0], winTo: [0, 0],
    fact: 'At Hansan Island in August 1592 Yi Sun-sin feigned a retreat to lure Wakisaka Yasuharu’s fleet out of the narrow Gyeonnaeryang strait, then wheeled his ships into a crescent — hagikjin, the crane-wing formation — and destroyed most of the Japanese fleet.',
  },
  general: {
    theater: 'tactics_senate', commander: 'Cicero',
    title: 'The Rook\'s Decree',
    question: 'Cicero\'s forces are in position. Move the rook to deliver checkmate.',
    rows: 6, cols: 6,
    board: [
      { piece: 'BK', row: 0, col: 5 },
      { piece: 'WR', row: 1, col: 0 },
      { piece: 'WK', row: 2, col: 4 },
    ],
    winFrom: [1, 0], winTo: [0, 0],
    fact: 'Cicero\'s speeches cornered his opponents as surely as a rook seals off escape squares — leaving no room for evasion.',
  },
  consul: {
    theater: 'tactics_senate', commander: 'Gandhi',
    title: 'Consular Strike',
    question: 'The black king is exposed. Find the queen move that ends the game.',
    rows: 6, cols: 6,
    board: [
      { piece: 'BK', row: 0, col: 5 },
      { piece: 'BP', row: 0, col: 4 },
      { piece: 'BP', row: 1, col: 5 },
      { piece: 'WQ', row: 3, col: 4 },
      { piece: 'WK', row: 2, col: 3 },
    ],
    winFrom: [3, 4], winTo: [1, 4],  // Q to the diagonal, guarded by the king — no flight square
    fact: 'Gandhi\'s Salt March cornered the British Empire like a queen forking king and pawn — forcing a response on unfavorable terms.',
  },
  reform: {
    theater: 'tactics_senate', commander: 'Itō',
    title: 'The Reform Gambit',
    question: 'Itō Hirobumi studies the Meiji board. Deliver checkmate with the queen.',
    rows: 5, cols: 5,
    board: [
      { piece: 'BK', row: 0, col: 0 },
      { piece: 'WQ', row: 4, col: 1 },
      { piece: 'WK', row: 2, col: 2 },
    ],
    winFrom: [4, 1], winTo: [1, 1],
    fact: 'Itō Hirobumi\'s Meiji reforms systematically cornered the old feudal order — each reform a move that narrowed the shogunate\'s escape squares.',
  },
  temple: {
    theater: 'tactics_senate', commander: 'The Long March',
    title: 'The Bishop\'s Path',
    question: 'Three white pieces surround the black king. Find the rook move for checkmate.',
    rows: 6, cols: 6,
    board: [
      { piece: 'BK', row: 0, col: 5 },
      { piece: 'WB', row: 3, col: 3 },
      { piece: 'WR', row: 5, col: 1 },
      { piece: 'WK', row: 2, col: 4 },
    ],
    winFrom: [5, 1], winTo: [0, 1],
    fact: 'Mao\'s Long March was a strategic retreat that repositioned forces — like a rook sliding to a decisive file — to deliver a winning blow later.',
  },

  // ── Harder: bigger boards, more distractors ────────────────────────────────

  gaugamela: {
    theater: 'tactics_gaugamela', commander: 'Alexander',
    title: 'Battle of Gaugamela',
    question: "Alexander's queen controls the long diagonal. The black king is hemmed in — deliver checkmate with the diagonal strike.",
    rows: 7, cols: 7,
    board: [
      { piece: 'BK', row: 0, col: 0 },
      { piece: 'BP', row: 0, col: 1 },
      { piece: 'BP', row: 1, col: 0 },
      { piece: 'WQ', row: 2, col: 0 },
      { piece: 'WR', row: 6, col: 3 },
      { piece: 'WB', row: 4, col: 3 },
      { piece: 'WK', row: 2, col: 2 },
    ],
    winFrom: [2, 0], winTo: [1, 1],
    fact: "At Gaugamela (331 BCE), Alexander the Great used a diagonal cavalry charge — the oblique advance — that cut through Darius's line at exactly the right angle. It is still studied in military academies as the definitive example of breakthrough tactics.",
  },
  thermopylae: {
    theater: 'tactics_thermopylae', commander: 'Leonidas',
    title: 'Thermopylae Pass',
    question: "The white rook holds the narrow pass. Slide it to seal off the black king's only escape.",
    rows: 7, cols: 7,
    board: [
      { piece: 'BK', row: 0, col: 6 },
      { piece: 'BP', row: 1, col: 5 },
      { piece: 'BP', row: 1, col: 6 },
      { piece: 'WR', row: 6, col: 0 },
      { piece: 'WB', row: 4, col: 4 },
      { piece: 'WK', row: 5, col: 5 },
    ],
    winFrom: [6, 0], winTo: [0, 0],
    fact: "At Thermopylae (480 BCE), 300 Spartans under Leonidas used the narrow pass to neutralise Persia's numerical advantage for three days. The tactical lesson — use terrain to reduce the enemy's effective force — is still taught in military strategy courses.",
  },
  actium: {
    theater: 'tactics_red_cliffs', commander: 'Octavian',
    title: 'Battle of Actium',
    question: "Octavian's forces flank from the sea. Move the queen onto the open file to deliver the decisive blow.",
    rows: 6, cols: 6,
    board: [
      { piece: 'BK', row: 0, col: 2 },
      { piece: 'BP', row: 0, col: 1 },
      { piece: 'BP', row: 0, col: 3 },
      { piece: 'WQ', row: 5, col: 5 },
      { piece: 'WR', row: 5, col: 0 },
      { piece: 'WK', row: 4, col: 5 },
    ],
    winFrom: [5, 5], winTo: [2, 2],
    fact: "At Actium (31 BCE), Octavian's fleet outmanoeuvred Mark Antony and Cleopatra by controlling the central channel. The battle ended the Roman Republic and began the Empire — a single engagement that decided a century of civil war.",
  },
  'cannae-trap': {
    theater: 'tactics_gaugamela', commander: 'Hannibal',
    title: 'Cannae Envelopment',
    question: "Hannibal surrounds the Romans. Move the queen to complete the encirclement — no escape square remains.",
    rows: 7, cols: 7,
    board: [
      { piece: 'BK', row: 0, col: 3 },
      { piece: 'BP', row: 1, col: 2 },
      { piece: 'BP', row: 1, col: 4 },
      { piece: 'BP', row: 1, col: 3 },
      { piece: 'WQ', row: 4, col: 6 },
      { piece: 'WR', row: 6, col: 3 },
      { piece: 'WB', row: 2, col: 6 },
      { piece: 'WK', row: 6, col: 6 },
    ],
    winFrom: [4, 6], winTo: [1, 3],
    fact: "At Cannae (216 BCE), Hannibal destroyed a Roman army twice his size using double envelopment — drawing the centre forward while the wings folded inward. It remains the most studied tactical encirclement in military history.",
  },
  'mohi-feint': {
    theater: 'tactics_gaugamela', commander: 'Batu',
    title: 'The Feigned Retreat',
    question: "The knights have chased the fleeing Mongols too far, and the wings have closed behind them. Move the queen to shut the last gap — no escape square remains.",
    rows: 7, cols: 7,
    board: [
      { piece: 'BK', row: 0, col: 3 },
      { piece: 'BP', row: 1, col: 2 },
      { piece: 'BP', row: 1, col: 4 },
      { piece: 'BP', row: 1, col: 3 },
      { piece: 'WQ', row: 4, col: 6 },
      { piece: 'WR', row: 6, col: 3 },
      { piece: 'WB', row: 2, col: 6 },
      { piece: 'WK', row: 6, col: 6 },
    ],
    winFrom: [4, 6], winTo: [1, 3],
    fact: "Mongol light cavalry would turn and run, sometimes for days, until pursuing knights strung out; then fresh horsemen and archers closed round them. At Legnica in April 1241, the chroniclers say, a feigned flight drew the Polish knights away from their foot soldiers before the Mongols closed in.",
  },
  'nzinga-ambush': {
    theater: 'tactics_board', commander: 'Nzinga',
    title: 'The Forest Ambush',
    question: "Nzinga's warriors have let the Portuguese column march deep into the forest, then closed the path behind it. Move the queen to shut the last gap — no escape square remains.",
    rows: 7, cols: 7,
    board: [
      { piece: 'BK', row: 0, col: 3 },
      { piece: 'BP', row: 1, col: 2 },
      { piece: 'BP', row: 1, col: 4 },
      { piece: 'BP', row: 1, col: 3 },
      { piece: 'WQ', row: 4, col: 6 },
      { piece: 'WR', row: 6, col: 3 },
      { piece: 'WB', row: 2, col: 6 },
      { piece: 'WK', row: 6, col: 6 },
    ],
    winFrom: [4, 6], winTo: [1, 3],
    fact: "Nzinga's armies rarely met Portuguese musketeers and cannon in open battle. They struck columns on the march, at river crossings and at night, then withdrew into country the Portuguese could not hold — a war of movement she kept up for some thirty years.",
  },
  'red-cliffs': {
    theater: 'tactics_red_cliffs', commander: 'Zhuge Liang',
    title: 'Battle of Red Cliffs',
    question: "Zhuge Liang positions the decisive piece. Move the bishop to pin the opposing force and deliver checkmate.",
    rows: 6, cols: 6,
    board: [
      { piece: 'BK', row: 0, col: 0 },
      { piece: 'BP', row: 0, col: 1 },
      { piece: 'BP', row: 1, col: 0 },
      { piece: 'WQ', row: 5, col: 3 },
      { piece: 'WR', row: 5, col: 2 },
      { piece: 'WB', row: 2, col: 0 },
      { piece: 'WK', row: 2, col: 2 },
    ],
    winFrom: [2, 0], winTo: [1, 1],
    fact: "At Red Cliffs (208 CE), Cao Cao's vast northern fleet was destroyed by fire ships launched by Sun Quan and Liu Bei. The battle prevented the unification of China for four centuries, giving rise to the Three Kingdoms period.",
  },
  'siege-of-troy': {
    theater: 'tactics_troy', commander: 'Odysseus',
    title: 'The Trojan Endgame',
    question: "Ten years of siege reach their conclusion. Find the long-range queen move that ends the war.",
    rows: 7, cols: 7,
    board: [
      { piece: 'BK', row: 0, col: 6 },
      { piece: 'BP', row: 1, col: 6 },
      { piece: 'BP', row: 0, col: 5 },
      { piece: 'WQ', row: 1, col: 0 },
      { piece: 'WR', row: 4, col: 5 },
      { piece: 'WB', row: 2, col: 2 },
      { piece: 'WK', row: 6, col: 5 },
    ],
    winFrom: [1, 0], winTo: [1, 5],
    fact: "The Trojan War, as described in Homer's Iliad, lasted ten years — but was decided in a single day's battle with a wooden horse. Odysseus's stratagem required patience, deception, and a single decisive strike: the model for Greek tactical thinking.",
  },
}


// ── Game ─────────────────────────────────────────────────────────────────────

const GLYPH: Record<Kind, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' }
const PIECE_NAME: Record<Kind, string> = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' }

type Phase = 'player' | 'reply' | 'wrong' | 'mate' | 'done'

interface Play {
  stage: number
  board: Board
  /** Stable ids per square so pieces glide when they move. */
  ids: number[]
  /** White moves still allowed to finish this position. */
  left: number
  phase: Phase
  last: Move | null
  log: string[]
}

const idsFor = (b: Board, stage: number) => b.sq.map((p, i) => (p ? stage * 1000 + i + 1 : 0))
const moveIds = (ids: number[], m: Move) => { const n = ids.slice(); n[m.to] = n[m.from]; n[m.from] = 0; return n }

export default function TacticsGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'senate')
  const stages = useMemo(() => makeCampaign(configId, config, difficulty, seed), [configId, config, difficulty, seed])
  const maxMisses = MAX_MISSES(difficulty)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })

  const startPlay = (stage: number, log: string[] = []): Play => ({
    stage, board: stages[stage].board, ids: idsFor(stages[stage].board, stage), left: stages[stage].depth,
    phase: 'player', last: null, log,
  })
  const [play, setPlay] = useState<Play>(() => startPlay(0))
  const [selected, setSelected] = useState<number | null>(null)
  const [misses, setMisses] = useState(0)
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'bad' | 'good' }>({ text: 'Tap a white piece, then a highlighted square.', tone: 'info' })
  const [shake, setShake] = useState<number | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)) }

  const stage = stages[play.stage]
  const { board } = play
  const targets = useMemo(() => (selected === null ? [] : legalMoves(board, 'W', selected)), [board, selected])
  const bk = board.sq.indexOf('BK')
  const checked = inCheck(board, 'B')

  const tryMove = (m: Move) => {
    const verdict = judgeMove(board, m, play.left)
    const name = moveName(board, m)
    const nb = makeMove(board, m)
    const moved: Play = { ...play, board: nb, ids: moveIds(play.ids, m), last: m, log: [...play.log, name] }
    setSelected(null)
    if (verdict === 'mate') {
      setPlay({ ...moved, phase: 'mate' })
      const next = play.stage + 1
      if (next >= stages.length) {
        setNote({ text: `${name} — checkmate! The campaign is won.`, tone: 'good' })
        win()
        return
      }
      setNote({ text: `${name} — checkmate! On to Act ${ACTS[next]}…`, tone: 'good' })
      later(() => { setPlay(startPlay(next)); setNote({ text: `Act ${ACTS[next]}: mate in ${stages[next].depth}.`, tone: 'info' }) }, 1300)
      return
    }
    if (verdict === 'good') {
      setPlay({ ...moved, phase: 'reply' })
      setNote({ text: `${name} — good. Black is thinking…`, tone: 'info' })
      later(() => {
        const reply = bestReply(nb, play.left - 1)
        if (!reply) return
        const rname = moveName(nb, reply)
        setPlay({ ...moved, board: makeMove(nb, reply), ids: moveIds(moved.ids, reply), last: reply, left: play.left - 1, phase: 'player', log: [...moved.log, rname] })
        setNote({ text: `Black answers ${rname}. Mate in ${play.left - 1}.`, tone: 'info' })
      }, 650)
      return
    }
    // Legal, but it lets Black off the hook (or stalemates): count it and take it back.
    const n = misses + 1
    setMisses(n)
    setPlay({ ...moved, phase: 'wrong' })
    setNote({ text: verdict === 'stalemate' ? `${name} is stalemate — that throws the win away.` : `${name} is legal, but Black escapes.`, tone: 'bad' })
    if (n >= maxMisses) { lose('the king slipped away'); return }
    later(() => { setPlay(play); setNote({ text: `Taken back. Mate in ${play.left} — try again.`, tone: 'info' }) }, 1100)
  }

  const tap = (i: number) => {
    if (settled || play.phase !== 'player') return
    const p = board.sq[i]
    if (p && p[0] === 'W') { setSelected(selected === i ? null : i); return }
    if (selected === null) return
    const m = targets.find(t => t.to === i)
    if (!m) {
      setShake(i)
      later(() => setShake(null), 400)
      const k = kindOf(board.sq[selected])
      setNote({ text: `The ${k ? PIECE_NAME[k] : 'piece'} can't go there.`, tone: 'info' })
      setSelected(null)
      return
    }
    tryMove(m)
  }

  const { rows, cols } = board
  const theater = config.theater ?? 'tactics_board'
  const noteColor = note.tone === 'bad' ? 'text-red-700' : note.tone === 'good' ? 'text-emerald-700 font-bold' : 'text-ink-2'

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      {/* Theater banner */}
      <div className="relative overflow-hidden rounded-xl border border-line bg-panel" style={artCover(theater)}>
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/55 to-black/25" />
        <div className="relative px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-200/90 truncate">{config.title}</p>
            <p className="text-white text-sm font-semibold leading-tight truncate">
              {play.stage === 0 ? 'Opening strike' : stage.name} · mate in {stage.depth}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex gap-1" aria-label={`position ${play.stage + 1} of ${stages.length}`}>
              {stages.map((_, i) => (
                <span key={i} className={`w-2.5 h-2.5 rounded-full border border-white/70 ${i < play.stage || (i === play.stage && (play.phase === 'mate' || outcome === 'won')) ? 'bg-emerald-400' : i === play.stage ? 'bg-amber-300' : 'bg-white/10'}`} />
              ))}
            </div>
            <p className={`text-[10px] ${misses ? 'text-red-300 font-bold' : 'text-white/70'}`}>✗ {misses} / {maxMisses}</p>
          </div>
        </div>
      </div>

      <p className="text-ink text-sm font-medium leading-snug">{stage.text}</p>

      {/* Board */}
      <div className="flex justify-center">
        <div
          className="relative w-full max-w-[400px] rounded-lg overflow-hidden border-2 border-[#5b3a1e] shadow-md bg-[#c9a676]"
          style={{ ...artCover('tactics_board'), aspectRatio: `${cols} / ${rows}`, containerType: 'inline-size' }}
        >
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
            {board.sq.map((p, i) => {
              const r = Math.floor(i / cols), c = i % cols
              const light = (r + c) % 2 === 0
              const isSel = selected === i
              const target = targets.find(t => t.to === i)
              const isLast = play.last && (play.last.from === i || play.last.to === i)
              const isMatedKing = i === bk && (play.phase === 'mate' || (checked && play.phase !== 'wrong'))
              const wrongTo = play.phase === 'wrong' && play.last?.to === i
              let tint = light ? 'bg-[rgba(255,246,228,0.62)]' : 'bg-[rgba(92,56,24,0.58)]'
              if (isLast) tint = light ? 'bg-[rgba(246,222,120,0.75)]' : 'bg-[rgba(196,160,40,0.75)]'
              if (isSel) tint = 'bg-accent/55'
              if (wrongTo) tint = 'bg-red-500/60'
              if (isMatedKing) tint = play.phase === 'mate' ? 'bg-red-600/70' : 'bg-red-400/55'
              return (
                <button
                  key={i}
                  aria-label={`${squareName(board, i)}${p ? ` ${p[0] === 'W' ? 'white' : 'black'} ${PIECE_NAME[p[1] as Kind]}` : ''}`}
                  onClick={() => tap(i)}
                  className={`relative ${tint} ${shake === i ? 'animate-pulse' : ''}`}
                >
                  {target && (p
                    ? <span className="absolute inset-[6%] rounded-full border-[3px] border-accent/80" />
                    : <span className="absolute left-1/2 top-1/2 w-[30%] h-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/60" />)}
                  {c === 0 && <span className={`absolute left-0.5 top-0 text-[8px] font-bold ${light ? 'text-[#6b4423]' : 'text-[#f5e6c8]'}`}>{rows - r}</span>}
                  {r === rows - 1 && <span className={`absolute right-0.5 bottom-0 text-[8px] font-bold ${light ? 'text-[#6b4423]' : 'text-[#f5e6c8]'}`}>{'abcdefgh'[c]}</span>}
                </button>
              )
            })}
          </div>
          {/* Pieces glide on their own layer. */}
          <div className="absolute inset-0 pointer-events-none">
            {board.sq.map((p, i) => {
              if (!p) return null
              const r = Math.floor(i / cols), c = i % cols
              const white = p[0] === 'W'
              return (
                <span
                  key={play.ids[i]}
                  className="absolute flex items-center justify-center leading-none transition-[left,top] duration-300 ease-out"
                  style={{
                    left: `${(c / cols) * 100}%`, top: `${(r / rows) * 100}%`, width: `${100 / cols}%`, height: `${100 / rows}%`,
                    fontSize: `calc(100cqw / ${cols} * 0.74)`,
                    color: white ? '#fffaf0' : '#1c1612',
                    textShadow: white
                      ? '0 0 1px #000, 0 0 2px #000, 1px 1px 0 #3a2a1a, -1px -1px 0 #3a2a1a'
                      : '0 0 1px #fff8, 0 1px 2px #fff6',
                  }}
                >
                  {GLYPH[p[1] as Kind]}{'︎'}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex items-start justify-between gap-2 min-h-[2.5rem]">
        <p className={`text-xs leading-snug ${noteColor}`} role="status">{note.text}</p>
      </div>
      {play.log.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {play.log.map((mv, i) => (
            <span key={i} className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${i % 2 === 0 ? 'bg-panel border-line text-ink' : 'bg-ink/80 border-ink text-paper'}`}>{mv}</span>
          ))}
        </div>
      )}

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="Checkmate — campaign won!" loseTitle="The position slipped away" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
