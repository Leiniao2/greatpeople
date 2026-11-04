import { useEffect, useMemo, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { hashString, mulberry32, resolveConfig, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Senet: the ancient Egyptian race game, played against a computer opponent
// on Kendall's reconstructed rules (Timothy Kendall, 1978), with these exact
// choices:
//
// - 30 squares in three rows of ten, read as an S (boustrophedon): 1–10 left
//   to right, 11–20 right to left, 21–30 left to right.
// - Each side has N pieces (by config), starting alternately on squares
//   1…2N. The side holding the even squares holds the lead piece. The human
//   always throws first.
// - Four two-sided sticks: the number of light faces up is the throw (1–4);
//   no light face counts 5. Odds 4,6,4,1,1 in 16. Throws of 1, 4 and 5 grant
//   another throw; 2 and 3 pass the turn.
// - A piece moves forward by the throw. It may not land on its own piece.
//   Landing on a lone enemy piece swaps the two. An enemy piece next to
//   another enemy piece (a pair) is protected and can't be landed on. Three or
//   more enemy pieces in a row form a blockade that can't be passed.
// - Square 26 (House of Beauty) must be landed on exactly by every piece: no
//   piece may jump past it. Squares 26, 28, 29 and 30 are safe (no swaps).
// - Landing on 27 (the Waters of Chaos) sends the piece back to 15 (House of
//   Rebirth) — or the nearest free square before it, else after it.
// - Bearing off needs an exact throw to "square 31": 5 from 26, 3 from 28,
//   2 from 29, 1 from 30. Throws past 31 are not allowed.
// - If no forward move exists, a piece must move backward by the throw
//   (not from 26 or beyond; swaps and blockades still apply). If no backward
//   move exists either, the turn is passed (an extra throw is still kept).
// - First to bear off the goal (all pieces, unless the config says fewer)
//   wins. There is no draw.
//
// Each config is a different challenge, not just a piece count:
//   kendall      — "Passing Through": a seeded mid-game position on Kendall's
//                  rules; bear off every piece first.
//   new-kingdom  — the full opening of seven pieces a side, but the first to
//                  bear off N wins: a fight to break out of the start.
//   tutankhamun  — the Steward's rule: a hit piece is not swapped but thrown
//                  back to the House of Rebirth (15, or the nearest free
//                  square before it), from a mid-game position further on.
//
// Time budget: a full Kendall game of five or seven pieces runs 50–80 throws
// a side (8+ minutes).  The setups above keep the median game to ~10–14 of
// the player's throws at D1 and ~25 at D4 (each throw plus replies ≈ 5 s);
// the tests measure it.
//
// Throws are deterministic per seed: throw k of each side comes from its own
// seeded stream, so a replay with the same choices plays out identically.
//
// Difficulty (AI): D1 plays greedy on raw progress and makes a random move
// 60% of the time; D2 greedy on a full positional evaluation with 15% random
// moves; D3 expectimax one throw ahead; D4 expectimax two throws ahead.
// The lead piece is the human's at D1–2; at D3–4 the seed decides.

// ── Engine ──────────────────────────────────────────────────────────────────

export type Player = 1 | 2 // 1 = human (ivory spools), 2 = AI (ebony cones)
export interface State {
  /** Index 1..30 = squares; 0 empty, 1 human, 2 AI. Index 0 and 31 unused. */
  board: number[]
  off: [number, number]
  turn: Player
  pieces: number
  /** Pieces to bear off to win (default: all). */
  goal?: number
  /** What landing on a lone enemy does: swap places (Kendall) or send it to the House of Rebirth. */
  hit?: 'swap' | 'rebirth'
}
export interface Move { from: number; to: number; backward?: boolean }

export const OFF = 31
export const BEAUTY = 26
export const WATER = 27
export const REBIRTH = 15
export const SAFE = new Set([26, 28, 29, 30])
/** Probability of each throw value 1..5 (index = value). */
export const THROW_P = [0, 4 / 16, 6 / 16, 4 / 16, 1 / 16, 1 / 16]
export const extraThrow = (roll: number) => roll === 1 || roll === 4 || roll === 5

const opp = (p: Player): Player => (p === 1 ? 2 : 1)

export function throwSticks(rng: Rng): { sticks: boolean[]; value: number } {
  const sticks = [0, 1, 2, 3].map(() => rng() < 0.5)
  const light = sticks.filter(Boolean).length
  return { sticks, value: light === 0 ? 5 : light }
}
export const throwValue = (rng: Rng) => throwSticks(rng).value
/** Throw number `index` of `player` in the game seeded by `seed`. */
export const throwAt = (seed: number, player: Player, index: number) =>
  throwSticks(mulberry32(hashString(`senet:${seed}:${player}:${index}`)))

export function initialState(pieces: number, humanLead = true, turn: Player = 1): State {
  const board = Array(32).fill(0)
  for (let s = 1; s <= pieces * 2; s++) {
    const even = s % 2 === 0
    board[s] = even === humanLead ? 1 : 2
  }
  return { board, off: [0, 0], turn, pieces }
}

/**
 * A seeded mid-game position: `pieces` per side on squares from–25 (8 by default), no square
 * shared, equal total progress.  `lead` moves the human's front piece on by
 * a few squares (the D1 head start).
 */
export function midgameState(pieces: number, seed: number, lead = 0, turn: Player = 1, from = 8): State {
  const rng = mulberry32(hashString(`senet-mid:${seed}:${pieces}`))
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
  for (let tries = 0; tries < 5000; tries++) {
    const used = new Set<number>()
    const side = () => {
      const out: number[] = []
      while (out.length < pieces) {
        const q = from + Math.floor(rng() * (BEAUTY - from)) // from..25
        if (!used.has(q)) { used.add(q); out.push(q) }
      }
      return out.sort((a, b) => a - b)
    }
    const h = side(), a = side()
    if (sum(h) !== sum(a)) continue
    if (lead) {
      let to = h[h.length - 1] + lead
      while (to < BEAUTY && used.has(to)) to++
      if (to > BEAUTY || used.has(to)) continue
      used.delete(h[h.length - 1]); used.add(to); h[h.length - 1] = to
    }
    const board = Array(32).fill(0)
    h.forEach(q => { board[q] = 1 })
    a.forEach(q => { board[q] = 2 })
    return { board, off: [0, 0], turn, pieces }
  }
  return initialState(pieces, true, turn)
}

/** Is square q part of a run of 3+ pieces of player p? */
function inBlockade(b: number[], q: number, p: number): boolean {
  if (q < 1 || q > 30 || b[q] !== p) return false
  let lo = q, hi = q
  while (lo - 1 >= 1 && b[lo - 1] === p) lo--
  while (hi + 1 <= 30 && b[hi + 1] === p) hi++
  return hi - lo + 1 >= 3
}
const protectedAt = (b: number[], q: number, p: number) => b[q] === p && ((q > 1 && b[q - 1] === p) || (q < 30 && b[q + 1] === p))

function canLand(b: number[], t: number, me: Player): boolean {
  const o = b[t]
  if (o === me) return false
  if (o === opp(me)) return !SAFE.has(t) && !protectedAt(b, t, o)
  return true
}

export function legalMoves(st: State, roll: number): Move[] {
  const { board: b, turn: me } = st
  const them = opp(me)
  const fwd: Move[] = []
  for (let s = 1; s <= 30; s++) {
    if (b[s] !== me) continue
    const t = s + roll
    if (t > OFF) continue
    if (s < BEAUTY && t > BEAUTY) continue
    let blocked = false
    for (let q = s + 1; q < t && q <= 30; q++) if (inBlockade(b, q, them)) { blocked = true; break }
    if (blocked) continue
    if (t === OFF || t === WATER || canLand(b, t, me)) fwd.push({ from: s, to: t })
  }
  if (fwd.length) return fwd
  const back: Move[] = []
  for (let s = 1; s < BEAUTY; s++) {
    if (b[s] !== me) continue
    const t = s - roll
    if (t < 1) continue
    let blocked = false
    for (let q = t + 1; q < s; q++) if (inBlockade(b, q, them)) { blocked = true; break }
    if (blocked) continue
    if (canLand(b, t, me)) back.push({ from: s, to: t, backward: true })
  }
  return back
}

/** Where a piece that falls into the water ends up. */
export function waterDest(b: number[]): number {
  for (let q = REBIRTH; q >= 1; q--) if (b[q] === 0) return q
  for (let q = REBIRTH + 1; q < BEAUTY; q++) if (b[q] === 0) return q
  return REBIRTH
}

export function applyMove(st: State, m: Move, roll: number): State {
  const b = st.board.slice()
  const off: [number, number] = [st.off[0], st.off[1]]
  const me = st.turn
  b[m.from] = 0
  if (m.to === OFF) off[me - 1]++
  else if (m.to === WATER) b[waterDest(b)] = me
  else if (b[m.to] === opp(me)) {
    if (st.hit === 'rebirth') {
      b[m.to] = me
      b[waterDest(b)] = opp(me)
    } else { b[m.from] = opp(me); b[m.to] = me }
  }
  else b[m.to] = me
  return { ...st, board: b, off, turn: extraThrow(roll) ? me : opp(me) }
}

export function passTurn(st: State, roll: number): State {
  return { ...st, turn: extraThrow(roll) ? st.turn : opp(st.turn) }
}

export function winner(st: State): Player | null {
  const goal = Math.min(st.pieces, st.goal ?? st.pieces)
  if (st.off[0] >= goal) return 1
  if (st.off[1] >= goal) return 2
  return null
}

/** Where the moved piece finally rests (water resolves to 15ish). */
export function restingSquare(st: State, m: Move): number {
  if (m.to !== WATER) return m.to
  const b = st.board.slice(); b[m.from] = 0
  return waterDest(b)
}

/** Where the hit enemy piece ends up (its old square on a swap). */
export function hitSquare(st: State, m: Move): number | null {
  if (m.to === OFF || m.to === WATER || st.board[m.to] !== opp(st.turn)) return null
  if (st.hit !== 'rebirth') return m.from
  const b = st.board.slice(); b[m.from] = 0; b[m.to] = st.turn
  return waterDest(b)
}

// ── AI ──────────────────────────────────────────────────────────────────────

function progress(st: State, p: Player): number {
  let s = st.off[p - 1] * 40
  for (let q = 1; q <= 30; q++) if (st.board[q] === p) s += q
  return s
}

function sideScore(st: State, p: Player): number {
  const b = st.board, them = opp(p)
  let s = st.off[p - 1] * 40
  for (let q = 1; q <= 30; q++) {
    if (b[q] !== p) continue
    s += q
    if (q >= BEAUTY) { s += 4; continue }
    if (protectedAt(b, q, p)) {
      s += 1.5
      if (inBlockade(b, q, p)) s += 1.5
    } else {
      // A lone piece with an enemy 1–5 squares behind can be swapped back.
      let risk = 0
      for (let k = 1; k <= 5 && q - k >= 1; k++) if (b[q - k] === them) risk += THROW_P[k]
      s -= Math.min(1, risk) * Math.min(12, q * 0.4)
    }
  }
  return s
}

export function evaluate(st: State, me: Player): number {
  const w = winner(st)
  if (w) return w === me ? 10000 : -10000
  return sideScore(st, me) - sideScore(st, opp(me))
}

export function expectimax(st: State, depth: number, me: Player): number {
  const w = winner(st)
  if (w) return (w === me ? 10000 : -10000) + (w === me ? depth : -depth)
  if (depth === 0) return evaluate(st, me)
  let total = 0
  for (let roll = 1; roll <= 5; roll++) {
    const moves = legalMoves(st, roll)
    let v: number
    if (!moves.length) v = expectimax(passTurn(st, roll), depth - 1, me)
    else {
      const maxing = st.turn === me
      v = maxing ? -Infinity : Infinity
      for (const m of moves) {
        const x = expectimax(applyMove(st, m, roll), depth - 1, me)
        if (maxing ? x > v : x < v) v = x
      }
    }
    total += THROW_P[roll] * v
  }
  return total
}

export const AI_DEPTH = [0, 0, 1, 2] as const
export const AI_RANDOM = [0.6, 0.15, 0, 0] as const

/** Choose a move for the side to move (`st.turn`), or null to pass. */
export function aiMove(st: State, roll: number, difficulty: Difficulty, rng: Rng): Move | null {
  const moves = legalMoves(st, roll)
  if (!moves.length) return null
  if (moves.length === 1) return moves[0]
  const me = st.turn
  if (rng() < AI_RANDOM[difficulty - 1]) return moves[Math.floor(rng() * moves.length)]
  let best = moves[0], bestV = -Infinity
  for (const m of moves) {
    const next = applyMove(st, m, roll)
    let v: number
    if (difficulty === 1) {
      const w = winner(next)
      v = w ? (w === me ? 1e6 : -1e6) : progress(next, me) - progress(next, opp(me))
    } else v = expectimax(next, AI_DEPTH[difficulty - 1], me)
    v += rng() * 1e-6 // seeded tie-break
    if (v > bestV) { bestV = v; best = m }
  }
  return best
}

// ── Configs ─────────────────────────────────────────────────────────────────

type PerDiff = readonly [number, number, number, number]
interface SenetConfig {
  title: string
  intro: string
  opponent: string
  /** Pieces per side, per difficulty. */
  pieces: PerDiff
  /** Pieces to bear off to win, per difficulty (absent: all). */
  goal?: PerDiff
  /** 'opening': the classic start on 1…2N; 'midgame': a seeded position under way. */
  start: 'opening' | 'midgame'
  /** First square of the mid-game spread (default 8). */
  from?: number
  hit: 'swap' | 'rebirth'
  fact: string
  /** Test/authoring hooks: a custom start (31 entries, index = square). */
  startBoard?: number[]
  startOff?: [number, number]
  startTurn?: Player
}

export const CONFIGS: Record<string, SenetConfig> = {
  kendall: {
    title: 'Passing Through',
    intro: 'A game already under way on Kendall\'s rules: land on a lone piece to swap places, pairs guard, rows of three wall off the road. Bear all yours off first.',
    opponent: 'the temple scribe',
    pieces: [2, 3, 3, 3],
    start: 'midgame',
    hit: 'swap',
    fact: 'Senet boards appear in Egyptian tombs from about 3000 BC; the Book of the Dead pictures the deceased playing senet against an unseen opponent for safe passage.',
  },
  'new-kingdom': {
    title: "Nefertari's Board",
    intro: 'The full opening: seven pieces a side packed on the first row. Break out — the first to bear off the target number wins.',
    opponent: 'Queen Nefertari',
    pieces: [7, 7, 7, 7],
    goal: [1, 1, 2, 2],
    start: 'opening',
    hit: 'swap',
    fact: "Nefertari's tomb in the Valley of the Queens shows her seated alone at a senet board — a game against fate for her passage to the afterlife.",
  },
  tutankhamun: {
    title: "The Boy King's Box",
    intro: "The steward's rule: a piece you land on is not swapped but thrown back to the House of Rebirth (15). A game under way — bear all yours off first.",
    opponent: 'the royal steward',
    pieces: [2, 2, 3, 3],
    start: 'midgame',
    from: 12,
    hit: 'rebirth',
    fact: "Tutankhamun's tomb held four senet boxes, one of ebony and ivory with a drawer for the pieces and knucklebones and throw sticks for play.",
  },
}

/** The opening state of a config at a difficulty and seed. */
export function startFor(configId: string, difficulty: Difficulty, seed: number): State {
  const c = CONFIGS[configId] ?? CONFIGS.kendall
  const pieces = c.pieces[difficulty - 1]
  const goal = c.goal ? c.goal[difficulty - 1] : pieces
  const turn = c.startTurn ?? 1
  const base = c.start === 'midgame'
    ? midgameState(pieces, seed, difficulty === 1 ? 4 : 0, turn, c.from)
    : initialState(pieces, difficulty <= 2 ? true : (seed & 1) === 0, turn)
  return { ...base, goal, hit: c.hit }
}
export const CONFIG_IDS = Object.keys(CONFIGS)

// ── UI ──────────────────────────────────────────────────────────────────────

const TIER = ['Apprentice', 'Scribe', 'Priest', 'Vizier']
/** Row r, column c of the 3×10 grid → square number. */
export const squareAt = (r: number, c: number) => (r === 0 ? c + 1 : r === 1 ? 20 - c : 21 + c)
const MARK: Record<number, { glyph: string; name: string; tint: string }> = {
  15: { glyph: '☥', name: 'House of Rebirth', tint: 'bg-[#bfe0d6]' },
  26: { glyph: '𓄤', name: 'House of Beauty', tint: 'bg-[#f2d27a]' },
  27: { glyph: '≈', name: 'Waters of Chaos', tint: 'bg-[#8fb9e0]' },
  28: { glyph: 'III', name: 'House of Three Truths', tint: 'bg-[#e8dcc0]' },
  29: { glyph: 'II', name: 'House of Re-Atum', tint: 'bg-[#e8dcc0]' },
  30: { glyph: '☉', name: 'House of Re-Horakhty', tint: 'bg-[#f0c96a]' },
}

type Stage = 'throw' | 'rolling' | 'move'
interface Game {
  st: State
  stage: Stage
  roll: number | null
  sticks: boolean[] | null
  idx: [number, number]
  last: { from: number; to: number; player: Player } | null
  note: string
}

export default function SenetGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'kendall')
  const cfgId = configId && CONFIGS[configId] ? configId : 'kendall'
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })
  const start = useMemo<State>(() => {
    const base = startFor(cfgId, difficulty, seed)
    if (config.startBoard) {
      const board = Array(32).fill(0)
      config.startBoard.forEach((v, i) => { if (i >= 1 && i <= 30) board[i] = v })
      return { ...base, board, off: config.startOff ?? [0, 0], turn: config.startTurn ?? 1 }
    }
    return { ...base, turn: config.startTurn ?? base.turn }
  }, [config, cfgId, difficulty, seed])
  const goal = Math.min(start.pieces, start.goal ?? start.pieces)

  const [g, setG] = useState<Game>(() => ({
    st: start, stage: 'throw', roll: null, sticks: null, idx: [0, 0], last: null,
    note: start.turn === 1 ? 'Your throw — tap Throw sticks.' : `${config.opponent} throws first.`,
  }))
  const [selected, setSelected] = useState<number | null>(null)
  const [flick, setFlick] = useState(0)

  const human = g.st.turn === 1
  const moves = useMemo(() => (g.stage === 'move' && g.roll ? legalMoves(g.st, g.roll) : []), [g])

  const finish = (next: Game) => {
    setG(next)
    const w = winner(next.st)
    if (w === 1) win()
    else if (w === 2) lose(goal < next.st.pieces ? `${config.opponent} bore off ${goal} first` : `${config.opponent} bore off every piece first`)
  }

  const doMove = (m: Move | null) => {
    if (g.roll === null) return
    const roll = g.roll, who = g.st.turn
    const next = m ? applyMove(g.st, m, roll) : passTurn(g.st, roll)
    const rest = m ? restingSquare(g.st, m) : 0
    const actor = who === 1 ? 'You' : config.opponent[0].toUpperCase() + config.opponent.slice(1)
    let note = !m ? `${actor} had no move with a ${roll}.`
      : m.to === OFF ? `${actor} bore a piece off!`
      : m.to === WATER ? `${actor} fell into the Waters of Chaos — back to ${rest}.`
      : g.st.board[m.to] === opp(who) ? (g.st.hit === 'rebirth' ? `${actor} hit the piece on ${m.to} — back to square ${hitSquare(g.st, m)}.` : `${actor} swapped places with a piece on ${m.to}.`)
      : m.backward ? `${actor} had to move back to ${m.to}.`
      : `${actor} moved ${m.from} → ${m.to}.`
    if (extraThrow(roll)) note += ` A ${roll} — throw again.`
    setSelected(null)
    finish({ ...g, st: next, stage: 'throw', roll: null, last: m ? { from: m.from, to: rest, player: who } : g.last, note })
  }

  const doThrow = () => {
    const who = g.st.turn
    const t = throwAt(seed, who, g.idx[who - 1])
    const idx: [number, number] = [g.idx[0], g.idx[1]]
    idx[who - 1]++
    setG({ ...g, stage: 'rolling', roll: t.value, sticks: t.sticks, idx })
  }

  // Stick flicker while rolling.
  useEffect(() => {
    if (g.stage !== 'rolling') return
    const iv = setInterval(() => setFlick(f => f + 1), 90)
    return () => clearInterval(iv)
  }, [g.stage])

  // Drive the clock: rolling → move, the AI's turns, and forced passes.
  useEffect(() => {
    if (settled) return
    let t: ReturnType<typeof setTimeout> | undefined
    if (g.stage === 'rolling') {
      t = setTimeout(() => {
        const ms = legalMoves(g.st, g.roll!)
        const who = g.st.turn === 1 ? 'You' : 'They'
        setG({ ...g, stage: 'move', note: ms.length ? (g.st.turn === 1 ? `You threw ${g.roll}. Tap a glowing piece.` : `They threw ${g.roll}…`) : `${who} threw ${g.roll} — no move.` })
      }, 650)
    } else if (g.stage === 'throw' && !human) {
      t = setTimeout(doThrow, 450)
    } else if (g.stage === 'move' && !human) {
      t = setTimeout(() => {
        const rng = mulberry32(hashString(`senet-ai:${seed}:${g.idx[1]}`))
        doMove(aiMove(g.st, g.roll!, difficulty, rng))
      }, 500)
    } else if (g.stage === 'move' && human && moves.length === 0) {
      t = setTimeout(() => doMove(null), 1000)
    }
    return () => { if (t) clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, settled])

  const tapSquare = (q: number) => {
    if (settled || !human || g.stage !== 'move') return
    const m = moves.find(mv => mv.from === q)
    if (m) {
      if (selected === q) { doMove(m); return }
      setSelected(q)
      return
    }
    if (selected !== null) {
      const sm = moves.find(mv => mv.from === selected)
      if (sm && sm.to === q) { doMove(sm); return }
    }
    setSelected(null)
  }

  const selMove = selected !== null ? moves.find(m => m.from === selected) : undefined
  const sticks = g.stage === 'rolling'
    ? [0, 1, 2, 3].map(i => ((flick * 7 + i * 3 + i * flick) % 5) < 2)
    : g.sticks

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent truncate">{config.title}</p>
          <p className="text-[10px] text-muted shrink-0">{TIER[difficulty - 1]} · vs {config.opponent}</p>
        </div>
        <p className="text-ink-2 text-xs leading-snug mt-1">{config.intro}</p>
        <div className="flex justify-between text-[11px] mt-1.5 text-ink">
          <span>You (ivory): <b>{g.st.off[0]}</b>/{goal} off</span>
          <span>Them (ebony): <b>{g.st.off[1]}</b>/{goal} off</span>
        </div>
      </div>

      {/* Board */}
      <div className="mx-auto w-full max-w-[420px] rounded-lg p-1.5 shadow-md" style={{ background: 'linear-gradient(135deg,#7a4a22,#5a3418)' }}>
        <div className="grid grid-cols-10 gap-[2px]">
          {[0, 1, 2].flatMap(r => Array.from({ length: 10 }, (_, c) => {
            const q = squareAt(r, c)
            const p = g.st.board[q]
            const mark = MARK[q]
            const movable = human && g.stage === 'move' && moves.some(m => m.from === q)
            const isTarget = selMove && selMove.to === q
            const isLast = g.last && (g.last.from === q || g.last.to === q)
            let tint = mark ? mark.tint : (q % 2 ? 'bg-[#ead6a6]' : 'bg-[#dfc48c]')
            if (isLast) tint = 'bg-[#f7e27a]'
            if (selected === q) tint = 'bg-accent/50'
            return (
              <button
                key={q}
                aria-label={`square ${q}${mark ? ` ${mark.name}` : ''}${p === 1 ? ' your piece' : p === 2 ? ' their piece' : ''}`}
                onClick={() => tapSquare(q)}
                className={`relative aspect-square rounded-[3px] ${tint} flex items-center justify-center ${movable ? 'ring-2 ring-accent ring-inset' : ''}`}
              >
                {mark && <span className={`absolute inset-0 flex items-center justify-center text-[11px] font-bold ${p ? 'opacity-25' : 'opacity-70'} text-[#5a3418]`}>{mark.glyph}</span>}
                <span className="absolute left-0.5 top-0 text-[7px] text-[#7a5a30]">{q}</span>
                {p === 1 && <span className="relative w-[58%] h-[58%] rounded-full bg-[#f8f1dc] border-2 border-[#8a6a3a] shadow" />}
                {p === 2 && <span className="relative w-[50%] h-[68%] rounded-t-full rounded-b-sm bg-[#2a1b12] border border-black shadow" />}
                {isTarget && <span className="absolute inset-[18%] rounded-full border-[3px] border-accent/80" />}
              </button>
            )
          }))}
        </div>
        <div className="flex justify-between text-[8px] text-[#f1dcb0]/80 px-0.5 mt-0.5">
          <span>1 → 10 · ← 11–20 · 21 → 30 → off</span>
          {selMove?.to === OFF && <span className="font-bold text-amber-200">bear off!</span>}
        </div>
      </div>

      {selMove && (
        <button onClick={() => doMove(selMove)} className="self-center px-4 py-1.5 rounded-lg bg-accent text-accent-fg text-sm font-semibold">
          {selMove.to === OFF ? 'Bear off ☥' : selMove.to === WATER ? `Move ${selMove.from} → 27 (water!)` : `Move ${selMove.from} → ${selMove.to}`}
        </button>
      )}

      {/* Sticks */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2">
        <div className="flex gap-1.5" aria-label="throw sticks">
          {[0, 1, 2, 3].map(i => {
            const light = sticks ? sticks[i] : i % 2 === 0
            return (
              <span key={i}
                className={`block w-3 h-12 rounded-full border border-[#4a2e16] transition-transform duration-75 ${light ? 'bg-[#f4e7c6]' : 'bg-[#5a3a1f]'}`}
                style={{ transform: g.stage === 'rolling' ? `rotate(${((flick + i) % 3 - 1) * 14}deg) translateY(${(flick + i) % 2 ? -4 : 0}px)` : 'none' }} />
            )
          })}
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-ink tabular-nums leading-none">{g.stage !== 'rolling' && g.roll ? g.roll : '–'}</p>
          <p className="text-[10px] text-muted">{g.roll && g.stage === 'move' && extraThrow(g.roll) ? 'throw again after' : 'throw'}</p>
        </div>
        <button
          onClick={doThrow}
          disabled={settled || !human || g.stage !== 'throw'}
          className="px-3 py-2 rounded-lg bg-accent text-accent-fg text-sm font-semibold disabled:opacity-40"
        >Throw sticks</button>
      </div>

      <p className="text-xs leading-snug text-ink-2 min-h-[2rem]" role="status">{settled ? (outcome === 'won' ? 'All your pieces have passed through. You win!' : g.note) : g.note}</p>

      <details className="rounded-lg border border-line bg-panel px-3 py-2 text-[11px] text-ink-2 leading-relaxed">
        <summary className="font-semibold text-ink cursor-pointer">Rules (Kendall's reconstruction)</summary>
        <ul className="list-disc pl-4 mt-1 space-y-0.5">
          <li>Sticks: light faces up = 1–4; none light = 5. 1, 4 and 5 throw again.</li>
          <li>Move a piece forward along the S. {start.hit === 'rebirth' ? 'Land on a lone enemy piece to throw it back to the House of Rebirth (15).' : 'Land on a lone enemy piece to swap places.'}</li>
          <li>Two pieces side by side are safe; three in a row can't be passed.</li>
          <li>Every piece must stop exactly on 26 𓄤. From there: 1 falls in the water ≈ (back to 15 ☥), 2/3/4 go to 28/29/30, 5 bears off.</li>
          <li>Bear off with an exact throw: 3 from 28, 2 from 29, 1 from 30. 26–30 are safe.</li>
          <li>No forward move? You must move a piece backward; if you can't, you pass.</li>
          <li>{goal < start.pieces ? `Bear off ${goal} of your ${start.pieces} pieces first to win.` : 'Bear off all your pieces first to win.'}</li>
        </ul>
      </details>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="You passed into the afterlife!" loseTitle="The opponent passed through first" />
    </div>
  )
}
