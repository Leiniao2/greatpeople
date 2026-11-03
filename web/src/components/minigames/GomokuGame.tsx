import { useEffect, useMemo, useRef, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Five in a Row (gomoku) against a computer opponent.  You play black and
// move first; the computer plays white.  Five stones in an unbroken line
// (across, down or diagonally) wins.  A full board counts as a loss.
//
// Rule variants by config:
//   freestyle — five or more in a row wins.
//   exact     — exactly five wins; an overline (six or more) does not.
//   renju     — the classic renju restrictions are laid on the computer:
//               it may not play double-threes, double-fours or overlines,
//               and only an exact five wins for it.  You play freely.
//
// Difficulty: the board grows from 9×9 to 15×15, and the opponent goes from
// a careless novice (misses blocks, random moves) to a master that searches
// for forced wins by continuous fours (VCF) and refuses moves that hand you
// one.  You still move first, which in gomoku is a real advantage.

// ── Engine ───────────────────────────────────────────────────────────────────

export type Player = 1 | 2 // 1 = black (human, moves first), 2 = white (computer)
export type Rule = 'freestyle' | 'exact' | 'renju'
export type Board = number[]

export const HUMAN: Player = 1
export const AI: Player = 2
const DIRS: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]]

export const boardSize = (d: Difficulty) => scale(d, [9, 11, 13, 15] as const)
export const newBoard = (n: number): Board => Array(n * n).fill(0)
export const isFull = (b: Board) => b.every(v => v !== 0)
export const exactFor = (rule: Rule, p: Player) => rule === 'exact' || (rule === 'renju' && p === AI)
export const restrictedFor = (rule: Rule, p: Player) => rule === 'renju' && p === AI

export function place(b: Board, idx: number, p: Player): Board {
  if (b[idx] !== 0) throw new Error(`square ${idx} is taken`)
  const nb = b.slice()
  nb[idx] = p
  return nb
}

/** Length of p's run through idx in direction (dr, dc), counting idx as p's. */
function runThrough(b: Board, n: number, idx: number, dr: number, dc: number, p: number): number {
  const r0 = Math.floor(idx / n), c0 = idx % n
  let len = 1
  for (const s of [1, -1]) {
    let r = r0 + dr * s, c = c0 + dc * s
    while (r >= 0 && r < n && c >= 0 && c < n && b[r * n + c] === p) { len++; r += dr * s; c += dc * s }
  }
  return len
}

/** Would a stone of p on idx (already there or not) make a winning line? */
export function makesFive(b: Board, n: number, idx: number, p: Player, rule: Rule): boolean {
  const exact = exactFor(rule, p)
  for (const [dr, dc] of DIRS) {
    const len = runThrough(b, n, idx, dr, dc, p)
    if (exact ? len === 5 : len >= 5) return true
  }
  return false
}

/** The winning line through idx, for highlighting; null if none. */
export function winningLine(b: Board, n: number, idx: number, rule: Rule): number[] | null {
  const p = b[idx] as Player
  if (!p) return null
  const exact = exactFor(rule, p)
  const r0 = Math.floor(idx / n), c0 = idx % n
  for (const [dr, dc] of DIRS) {
    const cells = [idx]
    for (const s of [1, -1]) {
      let r = r0 + dr * s, c = c0 + dc * s
      while (r >= 0 && r < n && c >= 0 && c < n && b[r * n + c] === p) { cells.push(r * n + c); r += dr * s; c += dc * s }
    }
    if (exact ? cells.length === 5 : cells.length >= 5) return cells.sort((a, b2) => a - b2)
  }
  return null
}

export const checkFive = (b: Board, n: number, idx: number, rule: Rule) => winningLine(b, n, idx, rule) !== null

// ── Shapes ───────────────────────────────────────────────────────────────────
// Each line through a cell is read as a 9-character window centred on it:
// 'x' own stone (the centre is always 'x'), '.' empty, 'o' opponent or edge.
// Shapes are classified recursively and memoised, so evaluation is cheap.

export const SHAPE = { NONE: 0, TWO: 1, OPEN2: 2, THREE: 3, OPEN3: 4, FOUR: 5, OPEN4: 6, FIVE: 7 } as const

const shapeMemo = new Map<string, number>()

function centreRun(s: string): number {
  let len = 1
  for (let i = 5; i < 9 && s[i] === 'x'; i++) len++
  for (let i = 3; i >= 0 && s[i] === 'x'; i--) len++
  return len
}

/** Classify a 9-char window (centre index 4 is own). */
export function classifyWindow(s: string, exact: boolean): number {
  const key = exact ? `e${s}` : s
  const hit = shapeMemo.get(key)
  if (hit !== undefined) return hit
  const run = centreRun(s)
  let out: number
  if (exact ? run === 5 : run >= 5) out = SHAPE.FIVE
  else {
    let wins = 0
    let best = 0
    for (let e = 0; e < 9; e++) {
      if (s[e] !== '.') continue
      const t = s.slice(0, e) + 'x' + s.slice(e + 1)
      const r = centreRun(t)
      if (exact ? r === 5 : r >= 5) { wins++; continue }
      best = Math.max(best, classifyWindow(t, exact))
    }
    if (wins >= 2) out = SHAPE.OPEN4
    else if (wins === 1) out = SHAPE.FOUR
    else out = Math.max(0, best - 2)
  }
  shapeMemo.set(key, out)
  return out
}

function windowAt(b: Board, n: number, idx: number, dr: number, dc: number, p: number): string {
  const r0 = Math.floor(idx / n), c0 = idx % n
  let s = ''
  for (let k = -4; k <= 4; k++) {
    if (k === 0) { s += 'x'; continue }
    const r = r0 + dr * k, c = c0 + dc * k
    if (r < 0 || r >= n || c < 0 || c >= n) { s += 'o'; continue }
    const v = b[r * n + c]
    s += v === p ? 'x' : v === 0 ? '.' : 'o'
  }
  return s
}

/** Shapes p would have in each of the four directions with a stone on idx. */
export function shapesAt(b: Board, n: number, idx: number, p: Player, rule: Rule): number[] {
  const exact = exactFor(rule, p)
  return DIRS.map(([dr, dc]) => classifyWindow(windowAt(b, n, idx, dr, dc, p), exact))
}

/** Renju restriction: double-three, double-four or overline (an exact five is always allowed). */
export function isForbidden(b: Board, n: number, idx: number, p: Player, rule: Rule): boolean {
  if (!restrictedFor(rule, p) || b[idx] !== 0) return false
  let over = false
  for (const [dr, dc] of DIRS) {
    const len = runThrough(b, n, idx, dr, dc, p)
    if (len === 5) return false
    if (len > 5) over = true
  }
  if (over) return true
  const sh = shapesAt(b, n, idx, p, rule)
  const fours = sh.filter(s => s === SHAPE.FOUR || s === SHAPE.OPEN4).length
  const threes = sh.filter(s => s === SHAPE.OPEN3).length
  return fours >= 2 || threes >= 2
}

export function legalMoves(b: Board, n: number, p: Player, rule: Rule): number[] {
  const out: number[] = []
  for (let i = 0; i < b.length; i++) if (b[i] === 0 && !isForbidden(b, n, i, p, rule)) out.push(i)
  return out
}

/** Heuristic value of p playing idx: threat shapes plus combinations. */
export function cellScore(b: Board, n: number, idx: number, p: Player, rule: Rule): number {
  const sh = shapesAt(b, n, idx, p, rule)
  let fours = 0, open4 = 0, open3 = 0, sum = 0
  for (const s of sh) {
    if (s === SHAPE.FIVE) return 1e7
    if (s === SHAPE.OPEN4) { open4++; fours++ }
    else if (s === SHAPE.FOUR) { fours++; sum += 2500 }
    else if (s === SHAPE.OPEN3) { open3++; sum += 2000 }
    else if (s === SHAPE.THREE) sum += 300
    else if (s === SHAPE.OPEN2) sum += 250
    else if (s === SHAPE.TWO) sum += 40
  }
  if (open4 || fours >= 2) return 1e6
  if (fours && open3) return 1e5
  if (open3 >= 2) return 5e4
  return sum
}

/** Empty cells within two of a stone (the centre on an empty board). */
export function candidates(b: Board, n: number, reach = 2): number[] {
  const out: number[] = []
  let any = false
  for (let i = 0; i < b.length; i++) {
    if (b[i] !== 0) { any = true; continue }
    const r = Math.floor(i / n), c = i % n
    let near = false
    for (let dr = -reach; dr <= reach && !near; dr++) {
      for (let dc = -reach; dc <= reach; dc++) {
        const rr = r + dr, cc = c + dc
        if (rr >= 0 && rr < n && cc >= 0 && cc < n && b[rr * n + cc] !== 0) { near = true; break }
      }
    }
    if (near) out.push(i)
  }
  if (!any) return [Math.floor(n / 2) * n + Math.floor(n / 2)]
  return out
}

/** Cells where p would complete a winning line right now. */
export function winPoints(b: Board, n: number, p: Player, rule: Rule): number[] {
  const out: number[] = []
  for (let i = 0; i < b.length; i++) if (b[i] === 0 && makesFive(b, n, i, p, rule) && !isForbidden(b, n, i, p, rule)) out.push(i)
  return out
}

function makesFour(b: Board, n: number, idx: number, p: Player, rule: Rule): boolean {
  return shapesAt(b, n, idx, p, rule).some(s => s === SHAPE.FOUR || s === SHAPE.OPEN4)
}

interface Budget { deadline: number; nodes: number }

/**
 * Victory by continuous fours: a first move for p that wins by playing only
 * fours (each forcing a single reply), or -1.  Mutates and restores `b`.
 */
export function findVCF(b: Board, n: number, p: Player, rule: Rule, depth: number, budget: Budget): number {
  if (depth <= 0 || budget.nodes-- <= 0 || Date.now() > budget.deadline) return -1
  const opp = (3 - p) as Player
  const mine = winPoints(b, n, p, rule)
  if (mine.length) return mine[0]
  const theirs = winPoints(b, n, opp, rule)
  if (theirs.length > 1) return -1
  const cands = theirs.length ? theirs : candidates(b, n, 2)
  for (const c of cands) {
    if (b[c] !== 0 || isForbidden(b, n, c, p, rule) || !makesFour(b, n, c, p, rule)) continue
    b[c] = p
    const wins = winPoints(b, n, p, rule)
    let ok = false
    if (wins.length >= 2) ok = true
    else if (wins.length === 1) {
      const w = wins[0]
      // The defender must block; if the block itself wins for them, the line fails.
      if (!makesFive(b, n, w, opp, rule) || isForbidden(b, n, w, opp, rule)) {
        b[w] = opp
        ok = findVCF(b, n, p, rule, depth - 1, budget) >= 0
        b[w] = 0
      }
    }
    b[c] = 0
    if (ok) return c
  }
  return -1
}

/**
 * Victory by continuous threats: like VCF, but the attacker may also play
 * open threes.  The defender may answer a three on any square that stops it
 * or with a counter-four (which the attacker then blocks).  Returns the
 * attacker's first move or -1.  Mutates and restores `b`.
 */
export function findVCT(b: Board, n: number, p: Player, rule: Rule, depth: number, budget: Budget): number {
  const v = findVCF(b, n, p, rule, 6, budget)
  if (v >= 0) return v
  if (depth <= 0 || budget.nodes <= 0 || Date.now() > budget.deadline) return -1
  const opp = (3 - p) as Player
  if (winPoints(b, n, opp, rule).length) return -1
  for (const c of candidates(b, n, 2)) {
    if (budget.nodes-- <= 0 || Date.now() > budget.deadline) return -1
    if (isForbidden(b, n, c, p, rule)) continue
    if (!shapesAt(b, n, c, p, rule).some(sh => sh === SHAPE.OPEN3)) continue
    b[c] = p
    const ok = defended(b, n, p, rule, depth, budget, 3) === false
    b[c] = 0
    if (ok) return c
  }
  return -1
}

/** Can the defender hold against p's standing three?  `fours` caps counter-four chains. */
function defended(b: Board, n: number, p: Player, rule: Rule, depth: number, budget: Budget, fours: number): boolean {
  const opp = (3 - p) as Player
  const threats: number[] = []
  for (const d of candidates(b, n, 2)) if (!isForbidden(b, n, d, p, rule) && cellScore(b, n, d, p, rule) >= 1e6) threats.push(d)
  if (!threats.length) return true
  for (const d of threats) {
    if (isForbidden(b, n, d, opp, rule)) continue
    b[d] = opp
    const holds = findVCT(b, n, p, rule, depth - 1, budget) < 0
    b[d] = 0
    if (holds) return true
  }
  if (fours <= 0) return true
  // Counter-fours: the defender gains a tempo, the attacker must block.
  for (const f of candidates(b, n, 2)) {
    if (budget.nodes-- <= 0 || Date.now() > budget.deadline) return true
    if (b[f] !== 0 || isForbidden(b, n, f, opp, rule)) continue
    if (!shapesAt(b, n, f, opp, rule).some(sh => sh === SHAPE.FOUR || sh === SHAPE.OPEN4)) continue
    b[f] = opp
    const w = winPoints(b, n, opp, rule)
    let holds = true
    if (w.length === 1 && !isForbidden(b, n, w[0], p, rule)) {
      b[w[0]] = p
      holds = makesFive(b, n, w[0], p, rule) ? false : defended(b, n, p, rule, depth, budget, fours - 1)
      b[w[0]] = 0
    }
    b[f] = 0
    if (holds) return true
  }
  return false
}

// ── AI ───────────────────────────────────────────────────────────────────────

export interface AiLevel {
  /** Weight on blocking the opponent's shapes. */
  defense: number
  /** Chance of a random pick among the top few moves. */
  sloppy: number
  /** Sloppy picks only happen while the best score is below this (so urgent blocks still get made). */
  sloppyBelow: number
  /** Chance of blocking an immediate five threat. */
  blockFive: number
  /** Relative noise added to scores (seeded) for variety. */
  noise: number
  /** VCF depth for its own attack (0 = none). */
  vcf: number
  /** VCT depth (threes and fours) for its own attack (0 = none). */
  vct?: number
  /** Node budget for the VCT search. */
  vctNodes?: number
  /** Check whether a candidate lets the opponent win by VCF. */
  guard: boolean
  /** Total time budget in ms. */
  ms: number
}

export const AI_LEVELS: Record<Difficulty, AiLevel> = {
  1: { defense: 0.45, sloppy: 0.45, sloppyBelow: 5e6, blockFive: 0.7, noise: 0.25, vcf: 0, guard: false, ms: 60 },
  2: { defense: 0.75, sloppy: 0.2, sloppyBelow: 5e6, blockFive: 1, noise: 0.12, vcf: 0, guard: false, ms: 80 },
  3: { defense: 0.9, sloppy: 0.08, sloppyBelow: 5e4, blockFive: 1, noise: 0.06, vcf: 5, guard: false, ms: 140 },
  4: { defense: 0.92, sloppy: 0, sloppyBelow: 0, blockFive: 1, noise: 0.03, vcf: 8, vct: 2, vctNodes: 300, guard: true, ms: 200 },
}

export const AI_NAMES: Record<Difficulty, string> = { 1: 'Novice', 2: 'Teahouse regular', 3: 'Club player', 4: 'Master' }

/** Candidate moves for p ranked by heuristic (attack + weighted defence). */
export function rankMoves(b: Board, n: number, p: Player, rule: Rule, defense: number, noise = 0, rng?: Rng) {
  const opp = (3 - p) as Player
  const mid = (n - 1) / 2
  const out: { idx: number; score: number }[] = []
  for (const c of candidates(b, n)) {
    if (isForbidden(b, n, c, p, rule)) continue
    const a = cellScore(b, n, c, p, rule)
    const d = isForbidden(b, n, c, opp, rule) ? 0 : cellScore(b, n, c, opp, rule)
    const r = Math.floor(c / n), col = c % n
    let s = a + defense * d + (n - Math.abs(r - mid) - Math.abs(col - mid)) * 0.5
    if (noise && rng) s *= 1 + noise * rng()
    out.push({ idx: c, score: s })
  }
  return out.sort((x, y) => y.score - x.score)
}

/** Pick a move for p.  Pure apart from the seeded rng it consumes. */
export function aiMove(b: Board, n: number, difficulty: Difficulty, rng: Rng, rule: Rule, p: Player = AI, level: AiLevel = AI_LEVELS[difficulty]): number {
  const opp = (3 - p) as Player
  const work = b.slice()
  const start = Date.now()
  // 1. Win now.
  const mine = winPoints(work, n, p, rule)
  if (mine.length) return mine[0]
  // 2. Block a five.
  const theirs = winPoints(work, n, opp, rule).filter(c => !isForbidden(work, n, c, p, rule))
  if (theirs.length && rng() < level.blockFive) return theirs[0]
  // 3. Forced win by continuous fours.
  if (level.vcf) {
    const v = findVCF(work, n, p, rule, level.vcf, { deadline: start + level.ms * 0.4, nodes: 600 })
    if (v >= 0) return v
  }
  if (level.vct) {
    const v = findVCT(work, n, p, rule, level.vct, { deadline: start + level.ms * 0.5, nodes: level.vctNodes ?? 800 })
    if (v >= 0) return v
  }
  const ranked = rankMoves(work, n, p, rule, level.defense, level.noise, rng)
  if (!ranked.length) {
    const any = legalMoves(work, n, p, rule)
    return any.length ? any[Math.floor(rng() * any.length)] : -1
  }
  // A careless pick, unless something urgent is on the board.
  if (level.sloppy && ranked[0].score < level.sloppyBelow && rng() < level.sloppy) {
    const k = Math.min(6, ranked.length)
    return ranked[Math.floor(rng() * k)].idx
  }
  // 4. Don't hand the opponent a forced win.
  if (level.guard && ranked[0].score < 1e6) {
    const deadline = start + level.ms
    for (const { idx } of ranked.slice(0, 8)) {
      if (Date.now() > deadline) break
      work[idx] = p
      const danger = findVCF(work, n, opp, rule, 6, { deadline, nodes: 150 })
      work[idx] = 0
      if (danger < 0) return idx
    }
  }
  return ranked[0].idx
}

// ── Configs ──────────────────────────────────────────────────────────────────

export interface Stone { r: number; c: number; p: Player }

export interface GomokuConfig {
  title: string
  intro: string
  fact: string
  rule: Rule
  /** Seeded scattered stones per side at the start. */
  opening?: number
  /** A fixed starting position (0-based rows/cols); overrides `opening`. */
  stones?: Stone[]
}

export const CONFIGS: Record<string, GomokuConfig> = {
  'edo-gomoku': {
    title: 'Edo Teahouse',
    intro: 'Gomoku narabe, as played with go stones in Edo Japan. Five or more in a row wins.',
    rule: 'freestyle',
    fact: "In Japan the game was long called gomoku narabe, 'lining up five stones', and was played with ordinary go stones on a go board.",
  },
  gobang: {
    title: 'Victorian Go-bang',
    intro: 'A few stones are already scattered on the board. Five or more in a row wins.',
    rule: 'freestyle',
    opening: 2,
    fact: "Victorian Britain knew the game as Go-bang, a name taken from the Japanese goban, the board it was played on.",
  },
  standard: {
    title: 'Standard Gomoku',
    intro: 'Tournament rule: exactly five wins. A line of six or more (an overline) does not count, for either side.',
    rule: 'exact',
    fact: 'In 1994 L. Victor Allis used computer threat-space search to prove that the first player can force a win at freestyle gomoku on a 15×15 board.',
  },
  renju: {
    title: 'Renju Hall',
    intro: 'Renju restrictions bind your opponent: no double-threes, double-fours or overlines, and only an exact five wins for it.',
    rule: 'renju',
    fact: "Journalist Kuroiwa Ruikō renamed the game renju, 'connected pearls', in his newspaper Yorozu Chōhō in 1899; restrictions on the first player were later added to offset the first-move advantage.",
  },
}

/** The starting board for a config, difficulty and seed. */
export function startBoard(config: GomokuConfig, n: number, seed: number): Board {
  const b = newBoard(n)
  if (config.stones) {
    for (const s of config.stones) if (s.r < n && s.c < n) b[s.r * n + s.c] = s.p
    return b
  }
  const k = config.opening ?? 0
  if (!k) return b
  const rng = mulberry32(seed ^ 0x5bd1e995)
  const lo = Math.max(0, Math.floor(n / 2) - 3), hi = Math.min(n - 1, Math.floor(n / 2) + 3)
  const placed: number[] = []
  let tries = 0
  while (placed.length < 2 * k && tries++ < 500) {
    const r = lo + Math.floor(rng() * (hi - lo + 1)), c = lo + Math.floor(rng() * (hi - lo + 1))
    if (placed.some(i => Math.max(Math.abs(Math.floor(i / n) - r), Math.abs((i % n) - c)) < 2)) continue
    const i = r * n + c
    b[i] = placed.length % 2 === 0 ? HUMAN : AI
    placed.push(i)
  }
  return b
}

// ── Component ────────────────────────────────────────────────────────────────

function starPoints(n: number): number[] {
  const m = Math.floor(n / 2)
  if (n < 13) return [m * n + m]
  const q = 3
  return [[q, q], [q, n - 1 - q], [m, m], [n - 1 - q, q], [n - 1 - q, n - 1 - q]].map(([r, c]) => r * n + c)
}

export default function GomokuGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'edo-gomoku')
  const n = boardSize(difficulty)
  const rule = config.rule
  const initial = useMemo(() => startBoard(config, n, seed), [config, n, seed])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const [board, setBoard] = useState<Board>(initial)
  const [turn, setTurn] = useState<'human' | 'ai'>('human')
  const [last, setLast] = useState<number | null>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const [line, setLine] = useState<number[] | null>(null)
  const [note, setNote] = useState('Your move — you play black. Tap an intersection.')
  const rng = useRef<Rng>(mulberry32(seed ^ hashString(`gomoku:${configId}`)))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const confirmTap = n >= 13

  const play = (idx: number) => {
    const nb = place(board, idx, HUMAN)
    setBoard(nb); setLast(idx); setPreview(null)
    const wl = winningLine(nb, n, idx, rule)
    if (wl) { setLine(wl); setNote('Five in a row — you win!'); win(); return }
    if (isFull(nb)) { setNote('The board is full — a draw counts as a loss.'); lose('the board filled up'); return }
    setTurn('ai'); setNote(`${AI_NAMES[difficulty]} is thinking…`)
    timer.current = setTimeout(() => {
      const mv = aiMove(nb, n, difficulty, rng.current, rule)
      if (mv < 0) { setNote('Your opponent has no legal move — you win!'); win(); return }
      const ab = place(nb, mv, AI)
      setBoard(ab); setLast(mv)
      const wl2 = winningLine(ab, n, mv, rule)
      if (wl2) { setLine(wl2); setNote('White made five in a row.'); lose('your opponent made five in a row'); return }
      if (isFull(ab)) { setNote('The board is full — a draw counts as a loss.'); lose('the board filled up'); return }
      const threat = winPoints(ab, n, AI, rule).length
      setTurn('human')
      setNote(threat ? 'Careful — white threatens five!' : 'Your move.')
    }, 350)
  }

  const tap = (idx: number) => {
    if (settled || turn !== 'human' || board[idx] !== 0) return
    if (confirmTap && preview !== idx) { setPreview(idx); setNote('Tap again to place your stone.'); return }
    play(idx)
  }

  const stars = new Set(starPoints(n))
  const lineSet = new Set(line ?? [])

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent truncate">{config.title}</p>
          <p className="text-[10px] text-muted shrink-0">{n}×{n} · vs {AI_NAMES[difficulty]}</p>
        </div>
        <p className="text-ink text-sm leading-snug mt-0.5">{config.intro}</p>
      </div>

      <div className="flex justify-center">
        <div
          className="relative w-full max-w-[400px] aspect-square rounded-md border-2 border-[#7a5426] shadow-md"
          style={{ background: 'linear-gradient(135deg, #e3bb6c 0%, #d6a752 50%, #c99843 100%)' }}
        >
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${n} ${n}`} aria-hidden>
            {Array.from({ length: n }, (_, k) => (
              <g key={k} stroke="#3b2510" strokeWidth={0.04} strokeOpacity={0.75}>
                <line x1={0.5} y1={k + 0.5} x2={n - 0.5} y2={k + 0.5} />
                <line x1={k + 0.5} y1={0.5} x2={k + 0.5} y2={n - 0.5} />
              </g>
            ))}
            {[...stars].map(i => <circle key={i} cx={(i % n) + 0.5} cy={Math.floor(i / n) + 0.5} r={0.1} fill="#3b2510" />)}
          </svg>
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, gridTemplateRows: `repeat(${n}, 1fr)` }}>
            {board.map((v, i) => {
              const r = Math.floor(i / n), c = i % n
              const isLast = last === i
              const inLine = lineSet.has(i)
              return (
                <button
                  key={i}
                  aria-label={`row ${r + 1} col ${c + 1}${v === HUMAN ? ' black' : v === AI ? ' white' : ''}`}
                  onClick={() => tap(i)}
                  className="relative"
                >
                  {v !== 0 && (
                    <span
                      className={`absolute inset-[7%] rounded-full ${inLine ? 'ring-2 ring-red-500' : ''}`}
                      style={{
                        background: v === HUMAN
                          ? 'radial-gradient(circle at 35% 30%, #666 0%, #222 45%, #050505 100%)'
                          : 'radial-gradient(circle at 35% 30%, #ffffff 0%, #eeeae0 55%, #bdb6a6 100%)',
                        boxShadow: '1px 1px 2px rgba(0,0,0,0.45)',
                      }}
                    >
                      {isLast && <span className="absolute left-1/2 top-1/2 w-[28%] h-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" />}
                    </span>
                  )}
                  {v === 0 && preview === i && (
                    <span className="absolute inset-[7%] rounded-full bg-black/45 border border-accent animate-pulse" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <p className="text-xs leading-snug text-ink-2 min-h-[1.25rem]" role="status">{note}</p>

      <details className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink-2">
        <summary className="font-semibold text-ink cursor-pointer">Rules</summary>
        <ul className="list-disc pl-4 mt-1 space-y-0.5">
          <li>You are black and move first; take turns placing one stone on an empty intersection.</li>
          <li>Win with {rule === 'exact' ? 'exactly five' : 'five or more'} in a row — across, down or diagonal.</li>
          {rule === 'renju' && <li>White may not make double-threes, double-fours or overlines, and only an exact five wins for white.</li>}
          {rule === 'exact' && <li>An overline of six or more does not win for either side.</li>}
          <li>If white makes five, or the board fills up, you lose.</li>
          <li>An open four (four with both ends free) can't be stopped. Block open threes early!</li>
          {confirmTap && <li>On big boards, tap once to preview and again to place.</li>}
        </ul>
      </details>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="Five in a row!" loseTitle="White took the board" />
    </div>
  )
}

export const CONFIG_IDS = Object.keys(CONFIGS)
