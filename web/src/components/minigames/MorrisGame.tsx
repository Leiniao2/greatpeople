import { useEffect, useMemo, useRef, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { mulberry32, resolveConfig, scale, shuffle, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Morris: the mill games of Rome and medieval Europe, played against the
// computer.  One engine covers four boards:
//
//   three  — 3×3 grid with diagonals, 3 pieces each.  Place, then slide to an
//            adjacent point; the first to make a line of three wins outright.
//   six    — two nested squares, 6 pieces each, mills only along the sides,
//            no flying.
//   nine   — three nested squares, 9 pieces each, flying at 3 pieces.
//   twelve — the nine board plus diagonals joining the corners, 12 pieces,
//            diagonal mills too, flying at 3.
//
// Rules (six/nine/twelve): players alternately place pieces from hand, then
// slide them along lines to an empty adjacent point.  Making a mill (three in
// a line) removes one opponent piece, which may not come from a mill unless
// every opponent piece is in one; a move that makes two mills still removes
// one.  A player reduced to two pieces (on board + in hand), or unable to
// move, loses.  You always open.
//
// Move limit (documented fair rule): if the moving phase lasts `limit`
// plies, the game is adjudicated on pieces — more pieces wins.  A tie goes
// to you at Levels 1–2 ("you held the field") and to the computer at
// Levels 3–4, so at the top tiers you must actually win.  A board filled
// completely during placement (possible in twelve men's) is adjudicated the
// same way.
//
// Difficulty: search depth 1/2/3/4 (1/1/2/3 on the tiny three men's board; alpha-beta, iterative deepening under a
// node budget so every move stays well under 300 ms); the computer plays a
// random legal move 35% / 12% / 3% / 0% of the time; and at Levels 1–2 it is
// beaten a step early (reduced to 4 / 3 pieces instead of 2).

// ── Boards ───────────────────────────────────────────────────────────────────

export type Variant = 'three' | 'six' | 'nine' | 'twelve'

export interface Layout {
  variant: Variant
  /** Point positions on a 0–6 grid, for drawing. */
  pts: [number, number][]
  adj: number[][]
  mills: number[][]
  /** Line segments to draw. */
  lines: [number, number][]
  pieces: number
  flying: boolean
  /** Three men's: a line wins; there are no removals. */
  lineWins: boolean
}

const layoutCache = new Map<Variant, Layout>()

export function makeLayout(variant: Variant): Layout {
  const hit = layoutCache.get(variant)
  if (hit) return hit
  let out: Layout
  if (variant === 'three') {
    const pts: [number, number][] = []
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) pts.push([c * 3, r * 3])
    const lines: [number, number][] = []
    const mills: number[][] = []
    for (let r = 0; r < 3; r++) mills.push([r * 3, r * 3 + 1, r * 3 + 2])
    for (let c = 0; c < 3; c++) mills.push([c, c + 3, c + 6])
    mills.push([0, 4, 8], [2, 4, 6])
    for (const m of mills) lines.push([m[0], m[1]], [m[1], m[2]])
    out = { variant, pts, adj: adjFromLines(9, lines), mills, lines, pieces: 3, flying: false, lineWins: true }
  } else {
    const rings = variant === 'six' ? 2 : 3
    const step = rings === 2 ? 1.5 : 1
    const pts: [number, number][] = []
    for (let r = 0; r < rings; r++) {
      const a = r * step, b = 6 - r * step
      pts.push([a, a], [3, a], [b, a], [b, 3], [b, b], [3, b], [a, b], [a, 3])
    }
    const id = (r: number, p: number) => r * 8 + p
    const lines: [number, number][] = []
    const mills: number[][] = []
    for (let r = 0; r < rings; r++) {
      for (let p = 0; p < 8; p++) lines.push([id(r, p), id(r, (p + 1) % 8)])
      for (const p of [0, 2, 4, 6]) mills.push([id(r, p), id(r, p + 1), id(r, (p + 2) % 8)])
    }
    const spokes = variant === 'twelve' ? [0, 1, 2, 3, 4, 5, 6, 7] : [1, 3, 5, 7]
    for (const p of spokes) {
      for (let r = 0; r + 1 < rings; r++) lines.push([id(r, p), id(r + 1, p)])
      if (rings === 3) mills.push([id(0, p), id(1, p), id(2, p)])
    }
    out = {
      variant, pts, adj: adjFromLines(rings * 8, lines), mills, lines,
      pieces: variant === 'six' ? 6 : variant === 'nine' ? 9 : 12,
      flying: variant !== 'six', lineWins: false,
    }
  }
  layoutCache.set(variant, out)
  return out
}

function adjFromLines(n: number, lines: [number, number][]): number[][] {
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (const [a, b] of lines) { adj[a].push(b); adj[b].push(a) }
  return adj
}

// ── State and rules ─────────────────────────────────────────────────────────

/** 1 = you (light, opens), 2 = computer (dark). */
export type Side = 1 | 2
export type Cell = 0 | Side

export interface Rules {
  layout: Layout
  /** A side whose total (board + hand) drops to this or below has lost. Index 0 = you, 1 = computer. */
  loseAt: [number, number]
  /** Moving-phase plies before adjudication. */
  limit: number
  /** Who takes an adjudicated tie. */
  tieGoesTo: Side
}

export interface MState {
  board: Cell[]
  /** Pieces still to place: [you, computer]. */
  hand: [number, number]
  turn: Side
  /** Plies played in the moving phase (both sides out of hand). */
  moving: number
}

/** from = -1 for a placement; remove = -1 when no piece is taken. */
export interface Move { from: number; to: number; remove: number }

export const other = (s: Side): Side => (s === 1 ? 2 : 1)

export function makeRules(variant: Variant, difficulty: Difficulty): Rules {
  const layout = makeLayout(variant)
  const bonus = variant === 'three' ? 0 : variant === 'six' ? scale(difficulty, [1, 0, 0, 0]) : scale(difficulty, [2, 1, 0, 0])
  return {
    layout,
    loseAt: [2, 2 + bonus],
    limit: variant === 'three' ? 40 : variant === 'six' ? 80 : 100,
    tieGoesTo: difficulty <= 2 ? 1 : 2,
  }
}

export function initialState(rules: Rules): MState {
  const n = rules.layout.pieces
  return { board: Array(rules.layout.pts.length).fill(0), hand: [n, n], turn: 1, moving: 0 }
}

export const onBoard = (s: MState, side: Side) => s.board.reduce<number>((n, c) => n + (c === side ? 1 : 0), 0)
export const total = (s: MState, side: Side) => onBoard(s, side) + s.hand[side - 1]
export const isPlacing = (s: MState) => s.hand[0] > 0 || s.hand[1] > 0

export function inMill(layout: Layout, board: Cell[], i: number): boolean {
  const side = board[i]
  if (!side) return false
  return layout.mills.some(m => m.includes(i) && m.every(j => board[j] === side))
}

/** Opponent pieces that a mill may take. */
export function removable(layout: Layout, board: Cell[], victim: Side): number[] {
  const all: number[] = []
  const free: number[] = []
  board.forEach((c, i) => {
    if (c !== victim) return
    all.push(i)
    if (!inMill(layout, board, i)) free.push(i)
  })
  return free.length ? free : all
}

/** Where a piece may go: placements, slides, or flights. Returns [from, to] pairs. */
export function baseMoves(rules: Rules, s: MState): [number, number][] {
  const { layout } = rules
  const side = s.turn
  const out: [number, number][] = []
  if (s.hand[side - 1] > 0) {
    s.board.forEach((c, i) => { if (!c) out.push([-1, i]) })
    return out
  }
  const fly = layout.flying && onBoard(s, side) === 3
  s.board.forEach((c, i) => {
    if (c !== side) return
    if (fly) s.board.forEach((d, j) => { if (!d) out.push([i, j]) })
    else for (const j of layout.adj[i]) if (!s.board[j]) out.push([i, j])
  })
  return out
}

export function legalMoves(rules: Rules, s: MState): Move[] {
  const { layout } = rules
  const out: Move[] = []
  const side = s.turn
  for (const [from, to] of baseMoves(rules, s)) {
    const b = s.board.slice()
    if (from >= 0) b[from] = 0
    b[to] = side
    if (!layout.lineWins && inMill(layout, b, to)) {
      const r = removable(layout, b, other(side))
      if (r.length) { for (const x of r) out.push({ from, to, remove: x }); continue }
    }
    out.push({ from, to, remove: -1 })
  }
  return out
}

export function applyMove(s: MState, m: Move): MState {
  const board = s.board.slice()
  const hand: [number, number] = [s.hand[0], s.hand[1]]
  const side = s.turn
  const placing = isPlacing(s)
  if (m.from >= 0) board[m.from] = 0
  else hand[side - 1]--
  board[m.to] = side
  if (m.remove >= 0) board[m.remove] = 0
  return { board, hand, turn: other(side), moving: s.moving + (placing ? 0 : 1) }
}

export const sameMove = (a: Move, b: Move) => a.from === b.from && a.to === b.to && a.remove === b.remove

/** The winner, or null while the game goes on. Checked for the side about to move. */
export function winner(rules: Rules, s: MState): Side | null {
  const { layout } = rules
  if (layout.lineWins) {
    for (const m of layout.mills) {
      const c = s.board[m[0]]
      if (c && s.board[m[1]] === c && s.board[m[2]] === c) return c
    }
  } else {
    if (total(s, 1) <= rules.loseAt[0]) return 2
    if (total(s, 2) <= rules.loseAt[1]) return 1
  }
  const full = s.board.every(c => c !== 0)
  if (s.moving >= rules.limit || (full && !isPlacing(s))) return adjudicate(rules, s)
  if (baseMoves(rules, s).length === 0) return other(s.turn)
  return null
}

export function adjudicate(rules: Rules, s: MState): Side {
  const a = total(s, 1), b = total(s, 2)
  return a > b ? 1 : b > a ? 2 : rules.tieGoesTo
}

// ── Computer opponent ────────────────────────────────────────────────────────

export const AI_DEPTH = [1, 2, 3, 4] as const
/** Three men's is tiny, so the same depth sees much further; keep it shallower. */
export const AI_DEPTH_THREE = [1, 1, 2, 3] as const
export const AI_RANDOM = [0.35, 0.12, 0.03, 0] as const
export const AI_NODES = [3000, 10000, 30000, 60000] as const

const WIN = 1_000_000

/** Static score for `side`. */
export function evaluate(rules: Rules, s: MState, side: Side): number {
  const { layout } = rules
  const opp = other(side)
  const placing = isPlacing(s)
  const fly = (p: Side) => layout.flying && s.hand[p - 1] === 0 && onBoard(s, p) === 3
  // Can `p` bring a piece onto point `j` next turn without using the line `m`?
  const canReach = (p: Side, j: number, m: number[]) =>
    s.hand[p - 1] > 0 || fly(p) || layout.adj[j].some(k => s.board[k] === p && !m.includes(k))
  let score = 0
  if (!layout.lineWins) score += 1000 * (total(s, side) - total(s, opp))
  let threatsToMove = 0
  for (const m of layout.mills) {
    let mine = 0, theirs = 0, hole = -1
    for (const j of m) { const c = s.board[j]; if (c === side) mine++; else if (c === opp) theirs++; else hole = j }
    if (mine === 3) score += 30
    else if (theirs === 3) score -= 30
    else if (mine === 2 && hole >= 0) {
      const live = canReach(side, hole, m)
      score += live ? 40 : 8
      if (live && s.turn === side) threatsToMove++
    } else if (theirs === 2 && hole >= 0) {
      const live = canReach(opp, hole, m)
      score -= live ? 40 : 8
      if (live && s.turn === opp) threatsToMove++
    }
  }
  // The side to move with a live two will close it now.
  if (threatsToMove) score += (s.turn === side ? 1 : -1) * (layout.lineWins ? 5000 : 600)
  const mob = (p: Side) => {
    if (fly(p)) return 10
    let n = 0
    s.board.forEach((c, i) => { if (c === p) for (const j of layout.adj[i]) if (!s.board[j]) n++ })
    return n
  }
  score += (placing ? 6 : 14) * (mob(side) - mob(opp))
  return score
}

class OutOfNodes extends Error {}

/** Negamax with alpha-beta from the side to move. */
function search(rules: Rules, s: MState, depth: number, alpha: number, beta: number, ply: number, budget: { left: number }): number {
  if (--budget.left < 0) throw new OutOfNodes()
  const w = winner(rules, s)
  if (w) return w === s.turn ? WIN - ply : -(WIN - ply)
  if (depth === 0) return evaluate(rules, s, s.turn)
  const moves = orderMoves(legalMoves(rules, s))
  let best = -Infinity
  for (const m of moves) {
    const v = -search(rules, applyMove(s, m), depth - 1, -beta, -alpha, ply + 1, budget)
    if (v > best) best = v
    if (v > alpha) alpha = v
    if (alpha >= beta) break
  }
  return best
}

/** Mills first, then everything else in the given order. */
function orderMoves(moves: Move[]): Move[] {
  return [...moves.filter(m => m.remove >= 0), ...moves.filter(m => m.remove < 0)]
}

/** Best move by iterative deepening up to `depth`, inside a node budget. */
export function searchBest(rules: Rules, s: MState, depth: number, nodes: number, rng: Rng): Move {
  let moves = orderMoves(shuffle(legalMoves(rules, s), rng))
  if (moves.length === 1) return moves[0]
  let chosen = moves[0]
  const budget = { left: nodes }
  for (let d = 1; d <= depth; d++) {
    let best = -Infinity
    let bestMove = moves[0]
    const scored: { m: Move; v: number }[] = []
    try {
      let alpha = -Infinity
      for (const m of moves) {
        const v = -search(rules, applyMove(s, m), d - 1, -Infinity, -alpha, 1, budget)
        scored.push({ m, v })
        if (v > best) { best = v; bestMove = m }
        if (v > alpha) alpha = v
      }
    } catch (e) {
      if (e instanceof OutOfNodes) break
      throw e
    }
    chosen = bestMove
    if (best >= WIN - 100) break
    // Search the best line first next time round.
    const rest = moves.filter(m => !scored.some(x => x.m === m))
    moves = [...scored.sort((a, b) => b.v - a.v).map(x => x.m), ...rest]
  }
  return chosen
}

export function aiMove(rules: Rules, s: MState, difficulty: Difficulty, rng: Rng): Move {
  const moves = legalMoves(rules, s)
  if (rng() < AI_RANDOM[difficulty - 1]) return moves[Math.floor(rng() * moves.length)]
  const depth = (rules.layout.lineWins ? AI_DEPTH_THREE : AI_DEPTH)[difficulty - 1]
  return searchBest(rules, s, depth, AI_NODES[difficulty - 1], rng)
}

// ── Configs ──────────────────────────────────────────────────────────────────

interface MorrisConfig {
  title: string
  variant: Variant
  intro: string
  fact: string
}

export const CONFIGS: Record<string, MorrisConfig> = {
  'three-mens': {
    title: "Three Men's Morris",
    variant: 'three',
    intro: 'Three pieces each on a small grid. Place them, then slide along the lines — the first straight line of three wins.',
    fact: "Ovid's Ars Amatoria (c. 2 AD) describes a little game won by getting three pieces in a row; it is usually identified as three men's morris.",
  },
  'six-mens': {
    title: "Six Men's Morris",
    variant: 'six',
    intro: 'Two squares, six pieces each. Mills form only along the sides, and there is no flying.',
    fact: "Six men's morris was popular in medieval Italy, France and England, but had all but disappeared by about 1600.",
  },
  'nine-mens': {
    title: "Nine Men's Morris",
    variant: 'nine',
    intro: 'The classic: nine pieces each on three squares. Make mills to take pieces; down to three, you may fly.',
    fact: 'A nine men\'s morris board was cut into a deck plank of the Gokstad Viking ship, buried in Norway around 900 AD.',
  },
  'twelve-mens': {
    title: "Twelve Men's Morris",
    variant: 'twelve',
    intro: 'Twelve pieces each, and the corners are joined by diagonals — more lines, more mills, a crowded board.',
    fact: "Twelve men's morris lives on in southern Africa as Morabaraba, which is played in organised leagues and tournaments in South Africa.",
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Component ────────────────────────────────────────────────────────────────

const AI_DELAY = 450

export default function MorrisGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'nine-mens')
  const rules = useMemo(() => makeRules(config.variant, difficulty), [config.variant, difficulty])
  const { layout } = rules
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const rng = useMemo(() => mulberry32((seed ^ 0x9e3779b9) >>> 0), [seed])

  const [state, setState] = useState<MState>(() => (params?.startState as MState | undefined) ?? initialState(rules))
  const [selected, setSelected] = useState<number | null>(null)
  /** A placement or move that made a mill and now waits for a piece to take. */
  const [pending, setPending] = useState<{ from: number; to: number } | null>(null)
  const [last, setLast] = useState<{ move: Move; by: Side } | null>(null)
  const [note, setNote] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const result = winner(rules, state)
  const legal = useMemo(() => (result ? [] : legalMoves(rules, state)), [rules, state, result])

  // Settle once a result appears.
  useEffect(() => {
    if (!result || settled) return
    if (result === 1) win()
    else lose(endReason(rules, state))
  }, [result, settled, win, lose, rules, state])

  // The computer's turn.
  useEffect(() => {
    if (result || state.turn !== 2 || settled) return
    timer.current = setTimeout(() => {
      const m = aiMove(rules, state, difficulty, rng)
      setLast({ move: m, by: 2 })
      setNote(m.remove >= 0 ? 'The computer made a mill and took one of your pieces.' : '')
      setState(applyMove(state, m))
    }, AI_DELAY)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [state, result, settled, rules, difficulty, rng])

  const yourTurn = !result && !settled && state.turn === 1
  const placing = state.hand[0] > 0
  const flying = !placing && layout.flying && onBoard(state, 1) === 3

  const play = (m: Move) => {
    setSelected(null); setPending(null)
    setLast({ move: m, by: 1 })
    setNote(m.remove >= 0 ? 'Mill! You took a piece.' : '')
    setState(applyMove(state, m))
  }

  const commitBase = (from: number, to: number) => {
    const opts = legal.filter(m => m.from === from && m.to === to)
    if (!opts.length) return false
    if (opts[0].remove < 0) { play(opts[0]); return true }
    setPending({ from, to }); setSelected(null)
    setNote('Mill! Tap a highlighted computer piece to take it.')
    return true
  }

  const tap = (i: number) => {
    if (!yourTurn) return
    if (pending) {
      const m = legal.find(x => x.from === pending.from && x.to === pending.to && x.remove === i)
      if (m) play(m)
      return
    }
    if (placing) { commitBase(-1, i); return }
    if (state.board[i] === 1) { setSelected(selected === i ? null : i); return }
    if (selected !== null && commitBase(selected, i)) return
    setSelected(null)
  }

  // What to highlight.
  const display = pending ? { ...state, board: withBase(state.board, pending.from, pending.to) } : state
  const targets = new Set<number>()
  const movable = new Set<number>()
  if (yourTurn) {
    if (pending) legal.forEach(m => { if (m.from === pending.from && m.to === pending.to && m.remove >= 0) targets.add(m.remove) })
    else if (placing) legal.forEach(m => targets.add(m.to))
    else {
      legal.forEach(m => movable.add(m.from))
      if (selected !== null) legal.forEach(m => { if (m.from === selected) targets.add(m.to) })
    }
  }
  const removalMode = !!pending

  const status = settled || result
    ? result === 1 ? 'You win!' : 'The computer wins.'
    : state.turn === 2 ? 'The computer is thinking…'
    : note || (pending ? '' : placing ? `Place a piece (${state.hand[0]} in hand).`
      : selected !== null ? (flying ? 'Fly to any empty point.' : 'Tap a highlighted point to move.')
      : flying ? 'Three left — you may fly. Pick a piece.' : 'Pick one of your pieces to move.')

  const S = 300 / 6
  const pad = 22
  const R = layout.variant === 'three' ? 17 : layout.variant === 'twelve' ? 12 : 13
  const lastMarks = last && !pending ? last.move : null
  const goal = layout.lineWins ? 'Make a line of three' : `Reduce the computer to ${rules.loseAt[1]}`

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent truncate">{config.title}</p>
          <p className="text-[10px] text-muted shrink-0">Level {difficulty} opponent</p>
        </div>
        <p className="text-ink-2 text-xs leading-snug mt-1">{config.intro}</p>
      </div>

      <div className="flex items-center justify-between text-xs">
        <Pool label="You" color="light" hand={state.hand[0]} board={onBoard(state, 1)} active={state.turn === 1 && !result} />
        <div className="text-center text-[10px] text-muted leading-tight">
          <p className="font-semibold text-ink-2">{goal}</p>
          {!isPlacing(state) && <p>Move {state.moving} / {rules.limit}</p>}
        </div>
        <Pool label="Computer" color="dark" hand={state.hand[1]} board={onBoard(state, 2)} active={state.turn === 2 && !result} />
      </div>

      <div className="flex justify-center">
        <svg viewBox={`${-pad} ${-pad} ${300 + 2 * pad} ${300 + 2 * pad}`} className="w-full max-w-[400px] rounded-lg border-2 border-[#5b3a1e] shadow-md" style={{ background: '#d8b47a' }}>
          {layout.lines.map(([a, b], k) => (
            <line key={k} x1={layout.pts[a][0] * S} y1={layout.pts[a][1] * S} x2={layout.pts[b][0] * S} y2={layout.pts[b][1] * S} stroke="#4a2c12" strokeWidth={3} strokeLinecap="round" />
          ))}
          {layout.pts.map(([x, y], i) => {
            const c = display.board[i]
            const isTarget = targets.has(i)
            const isSel = selected === i || pending?.to === i
            const isLast = lastMarks && (lastMarks.to === i || lastMarks.from === i)
            const wasTaken = lastMarks && lastMarks.remove === i && !c
            const label = `point ${i + 1} ${c === 1 ? 'your piece' : c === 2 ? 'computer piece' : 'empty'}`
            return (
              <g key={i} role="button" aria-label={label} onClick={() => tap(i)} style={{ cursor: yourTurn ? 'pointer' : 'default' }}>
                <circle cx={x * S} cy={y * S} r={R + 8} fill="transparent" />
                {isLast && <circle cx={x * S} cy={y * S} r={R + 5} fill="none" stroke="#f59e0b" strokeWidth={3} strokeDasharray={lastMarks.from === i ? '4 3' : undefined} />}
                {wasTaken && <text x={x * S} y={y * S + 6} textAnchor="middle" fontSize={18} fill="#b91c1c" fontWeight="bold">✕</text>}
                {!c && <circle cx={x * S} cy={y * S} r={isTarget ? 9 : 5} fill={isTarget ? 'rgba(37,99,235,0.75)' : '#4a2c12'} />}
                {c !== 0 && (
                  <circle cx={x * S} cy={y * S} r={R} fill={c === 1 ? '#fbf3e0' : '#2a1d14'} stroke={c === 1 ? '#7a5a36' : '#000'} strokeWidth={2} />
                )}
                {c !== 0 && <circle cx={x * S} cy={y * S} r={R * 0.55} fill="none" stroke={c === 1 ? '#c9ae84' : '#5a4434'} strokeWidth={1.5} />}
                {movable.has(i) && !isSel && <circle cx={x * S} cy={y * S} r={R + 3} fill="none" stroke="rgba(37,99,235,0.6)" strokeWidth={2} />}
                {isSel && <circle cx={x * S} cy={y * S} r={R + 4} fill="none" stroke="#2563eb" strokeWidth={3.5} />}
                {isTarget && c !== 0 && removalMode && <circle cx={x * S} cy={y * S} r={R + 4} fill="none" stroke="#dc2626" strokeWidth={3.5} className="animate-pulse" />}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="flex items-center justify-between gap-2 min-h-[2rem]">
        <p className="text-xs leading-snug text-ink-2" role="status">{status}</p>
        {pending && yourTurn && (
          <button className="text-[11px] px-2 py-1 rounded border border-line text-muted shrink-0" onClick={() => { setPending(null); setNote('') }}>Undo</button>
        )}
      </div>

      <details className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-ink-2">
        <summary className="font-semibold text-ink cursor-pointer">Rules</summary>
        <ul className="list-disc pl-4 mt-1.5 space-y-1 leading-snug">
          {layout.lineWins ? (
            <>
              <li>Take turns placing your 3 pieces; then slide one piece per turn along a line to an empty neighbouring point.</li>
              <li>The first to get three in a straight line (diagonals count) wins.</li>
            </>
          ) : (
            <>
              <li>Take turns placing your {layout.pieces} pieces on empty points. When all are placed, slide one piece per turn along a line to an empty neighbour.</li>
              <li>Three of yours in a line{layout.variant === 'six' ? ' along a side' : ''} is a <b>mill</b>: take one computer piece. Pieces in a mill are safe unless every piece is in one.</li>
              {layout.flying && <li>With only three pieces left, a player may fly to any empty point.</li>}
              <li>Win by reducing the computer to {rules.loseAt[1]} pieces or leaving it no move. You lose at 2 pieces or when blocked.</li>
            </>
          )}
          <li>After {rules.limit} moves the side with more pieces wins; a tie goes to {rules.tieGoesTo === 1 ? 'you' : 'the computer'} at this level.</li>
        </ul>
      </details>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The field is yours!" loseTitle="Outplayed this time" />
    </div>
  )
}

function withBase(board: Cell[], from: number, to: number): Cell[] {
  const b = board.slice()
  if (from >= 0) b[from] = 0
  b[to] = 1
  return b
}

function endReason(rules: Rules, s: MState): string {
  if (rules.layout.lineWins) return s.moving >= rules.limit ? 'out of moves' : 'the computer made a line'
  if (total(s, 1) <= rules.loseAt[0]) return 'down to two pieces'
  if (s.moving >= rules.limit || s.board.every(c => c)) return 'out of moves'
  return 'no moves left'
}

function Pool({ label, color, hand, board, active }: { label: string; color: 'light' | 'dark'; hand: number; board: number; active: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 px-2 py-1 rounded-lg border ${active ? 'border-accent bg-accent/10' : 'border-line bg-panel'}`}>
      <span className="font-semibold text-ink text-[11px] flex items-center gap-1">
        <span className={`inline-block w-2.5 h-2.5 rounded-full border ${color === 'light' ? 'bg-[#fbf3e0] border-[#7a5a36]' : 'bg-[#2a1d14] border-black'}`} />
        {label}
      </span>
      <span className="text-[10px] text-muted tabular-nums">{hand} in hand · {board} on board</span>
    </div>
  )
}
