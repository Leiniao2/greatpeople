import { useEffect, useMemo, useRef, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, shuffle, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Tafl: the Viking "king's table", played on short boards so one game is a
// couple of minutes: 7×7 Brandubh at D1–2, 9×9 Tablut at D3–4, with a cap on
// your moves.
//
// Rules: every piece moves like a chess rook.  Only the king may stop on the
// throne (centre) or a corner; others may pass over the empty throne.  A
// piece is captured when the enemy sandwiches it in a line between two of
// theirs — or between one of theirs and a corner or the empty throne.  The
// king is captured when attackers (or the throne) close all four sides; from
// D3 the board edge counts as a side too.
//
// Each config is a different rule twist:
//   birka       — classic: you defend, the king escapes to a corner, armed king.
//   ballinderry — unarmed king: the king never helps capture, as hammer or anvil.
//   linnaeus    — Linnaeus's tablut: the king escapes to ANY edge square, but
//                 away from the throne he is a weak king, taken by two attackers
//                 like any other man.
//   tawlbwrdd   — you are the attackers: hold the ring for the move cap (or
//                 capture the king) while the computer tries to run him out.
//
// The computer is a shallow iterative-deepening alpha-beta search over a
// cheap evaluation that knows about open escape lanes and whether they can be
// blocked.  Search is capped by node count, so it stays fast and is
// deterministic for a seed.

export type Style = 'balanced' | 'wall' | 'hunter'
export type Mode = 'defend' | 'raid'
export type Escape = 'corner' | 'edge'

export interface TaflConfig {
  title: string; intro: string; fact: string
  /** How the computer plays, by difficulty (one style for all, or one per level). */
  style: Style | readonly [Style, Style, Style, Style]
  /** defend = you move the king's side; raid = you move the attackers. */
  mode: Mode
  escape: Escape
  kingArmed: boolean
  /** Away from the throne the king is taken by two, like any man. */
  weakKing: boolean
}

export const CONFIGS: Record<string, TaflConfig> = {
  birka: {
    title: 'The Birka Graves',
    intro: 'Classic rules. The jarl’s hall at Birka is surrounded: lead the defenders and slip the king out to a corner. The king fights beside his men.',
    fact: 'Glass and bone hnefatafl pieces, including a king, were buried with Viking warriors at Birka in Sweden in the 9th and 10th centuries.',
    style: 'balanced', mode: 'defend', escape: 'corner', kingArmed: true, weakKing: false,
  },
  ballinderry: {
    title: 'The Ballinderry Board',
    intro: 'Unarmed king: he cannot help take a raider, not even as the far side of a sandwich. Your four men must do all the fighting while he runs for a corner.',
    fact: 'A 10th-century wooden board for brandubh, with 7×7 peg holes and a decorated centre, was found in a crannog at Ballinderry, Ireland, in 1932.',
    style: ['wall', 'wall', 'wall', 'balanced'], mode: 'defend', escape: 'corner', kingArmed: false, weakKing: false,
  },
  linnaeus: {
    title: 'Linnaeus in Lapland',
    intro: 'Tablut as Linnaeus wrote it: the king wins by reaching ANY edge square — but off the throne he is weak, taken by just two attackers like any man.',
    fact: 'Carl Linnaeus wrote down the rules of tablut while travelling among the Sámi in 1732 — the only first-hand record of how tafl games were played.',
    style: 'hunter', mode: 'defend', escape: 'edge', kingArmed: true, weakKing: true,
  },
  tawlbwrdd: {
    title: 'The Raiders’ Ring',
    intro: 'Switch sides: you command the black attackers. Keep the king from every corner until the moves run out — or surround him for an early win. The edge counts against him.',
    fact: 'A Welsh manuscript of 1587 by Robert ap Ifan describes tawlbwrdd, the Welsh tafl, played with a king and his men against twice as many attackers.',
    style: 'balanced', mode: 'raid', escape: 'corner', kingArmed: true, weakKing: false,
  },
}

export const EMPTY = 0, ATK = 1, DEF = 2, KING = 3
export type Side = 'A' | 'D'
export interface Rules { n: number; edgeHostileToKing: boolean; kingArmed: boolean; edgeEscape?: boolean; weakKing?: boolean }
export interface Move { from: number; to: number }

const cfgOf = (id?: string) => (id && CONFIGS[id]) || CONFIGS.birka
export const styleFor = (d: Difficulty, id?: string): Style => { const st = cfgOf(id).style; return typeof st === 'string' ? st : scale(d, st) }
export const sizeFor = (d: Difficulty) => scale(d, [7, 7, 9, 9])
/** Your moves before the game is called: a loss when defending, a win when raiding. */
export const moveLimitFor = (d: Difficulty, id?: string) =>
  cfgOf(id).mode === 'raid' ? scale(d, [10, 14, 20, 24]) : scale(d, [16, 20, 26, 30])
// D3 searches as deep as D4 but blunders more; on the 9×9 board a flawless
// depth-2/3 attacker held the king in about two games of three, so both top
// levels keep a little noise (a careful player wins ~60% at D3, ~50–60% at D4).
export const depthFor = (d: Difficulty) => scale(d, [1, 2, 3, 3])
/** How often the computer plays one of its next-best moves instead of the best. */
export const noiseFor = (d: Difficulty, id?: string) => {
  const c = cfgOf(id)
  if (c.mode === 'raid') return scale(d, [0.4, 0.2, 0.05, 0])
  // Linnaeus's weak king: D3 starts two raiders short with a sharp AI, D4 one short with a sloppier one.
  return c.weakKing ? scale(d, [0.25, 0.15, 0.1, 0.3]) : scale(d, [0.25, 0.15, 0.2, 0.1])
}
/** Men the computer's side starts without, chosen by seed. */
export const attackersShort = (d: Difficulty, id?: string) => {
  const c = cfgOf(id)
  if (c.mode === 'raid') return scale(d, [1, 0, 0, 0])
  if (c.escape === 'edge') return scale(d, [0, 1, 2, 1]) // Linnaeus: the weak king is easily caught, so his foes start short from D2
  return c.kingArmed ? scale(d, [1, 0, 0, 0]) : scale(d, [1, 0, 1, 0]) // the unarmed king gets a hand on the first 9×9 board
}
export const rulesFor = (d: Difficulty, id?: string): Rules => {
  const c = cfgOf(id)
  return {
    // The unarmed king's consolation: the board edge never counts against him.
    n: sizeFor(d), edgeHostileToKing: c.mode === 'raid' || (d >= 3 && c.kingArmed), kingArmed: c.kingArmed,
    // Raiding on the 9×9 board, the king escapes to any edge (Linnaeus's tablut), or holding him would be too easy.
    edgeEscape: c.escape === 'edge' || (c.mode === 'raid' && d >= 3), weakKing: c.weakKing,
  }
}
export const sideOf = (id?: string): Side => (cfgOf(id).mode === 'raid' ? 'A' : 'D')

// ── Board ───────────────────────────────────────────────────────────────────

export function initialBoard(n: number): number[] {
  const b = new Array<number>(n * n).fill(EMPTY)
  const m = (n - 1) / 2
  const set = (r: number, c: number, v: number) => { b[r * n + c] = v }
  // Place a pattern in each of the four rotations about the centre.
  const rot = (r: number, c: number, v: number) => {
    set(r, c, v); set(c, n - 1 - r, v); set(n - 1 - r, n - 1 - c, v); set(n - 1 - c, r, v)
  }
  set(m, m, KING)
  if (n === 7) {
    rot(0, 3, ATK); rot(1, 3, ATK); rot(2, 3, DEF)
  } else if (n === 9) {
    rot(0, 3, ATK); rot(0, 4, ATK); rot(0, 5, ATK); rot(1, 4, ATK)
    rot(2, 4, DEF); rot(3, 4, DEF)
  } else {
    for (const c of [3, 4, 5, 6, 7]) rot(0, c, ATK)
    rot(1, 5, ATK)
    rot(3, 5, DEF); rot(4, 5, DEF); rot(4, 4, DEF)
  }
  return b
}

export const isCorner = (n: number, i: number) => i === 0 || i === n - 1 || i === n * (n - 1) || i === n * n - 1
export const throneOf = (n: number) => ((n * n) - 1) / 2
const restricted = (n: number, i: number) => isCorner(n, i) || i === throneOf(n)

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const

export function movesFor(b: readonly number[], n: number, side: Side): Move[] {
  const out: Move[] = []
  const throne = throneOf(n)
  for (let i = 0; i < b.length; i++) {
    const p = b[i]
    if (side === 'A' ? p !== ATK : p !== DEF && p !== KING) continue
    const r = Math.floor(i / n), c = i % n
    for (const [dr, dc] of DIRS) {
      let rr = r + dr, cc = c + dc
      while (rr >= 0 && rr < n && cc >= 0 && cc < n) {
        const j = rr * n + cc
        if (b[j] !== EMPTY) break
        if (p === KING || !restricted(n, j)) out.push({ from: i, to: j })
        else if (j !== throne) break // corners stop everyone but the king; the empty throne may be crossed
        rr += dr; cc += dc
      }
    }
  }
  return out
}

/** Make a move and resolve captures of ordinary pieces. */
export function applyMove(b: readonly number[], rules: Rules, m: Move): { board: number[]; captured: number[] } {
  const { n } = rules
  const nb = b.slice()
  const p = nb[m.from]
  nb[m.to] = p
  nb[m.from] = EMPTY
  const mine = p === ATK ? 'A' : 'D'
  const friendly = (v: number) => (mine === 'A' ? v === ATK : v === DEF || (v === KING && rules.kingArmed))
  const throne = throneOf(n)
  const enemyAt = (x: number) => {
    const v = nb[x]
    if (mine === 'D') return v === ATK
    return v === DEF || (v === KING && !!rules.weakKing && !nearThrone(n, x))
  }
  const captured: number[] = []
  // An unarmed king takes no part in captures, as hammer or anvil.
  if (p === KING && !rules.kingArmed) return { board: nb, captured }
  const r = Math.floor(m.to / n), c = m.to % n
  for (const [dr, dc] of DIRS) {
    const r1 = r + dr, c1 = c + dc, r2 = r + 2 * dr, c2 = c + 2 * dc
    if (r2 < 0 || r2 >= n || c2 < 0 || c2 >= n) continue
    const x = r1 * n + c1, y = r2 * n + c2
    if (!enemyAt(x)) continue
    const anvil = friendly(nb[y]) || isCorner(n, y) || (y === throne && nb[y] === EMPTY)
    if (anvil) { nb[x] = EMPTY; captured.push(x) }
  }
  return { board: nb, captured }
}

export const kingAt = (b: readonly number[]) => b.indexOf(KING)

/** On the throne or orthogonally beside it: even a weak king needs four sides closed here. */
export function nearThrone(n: number, i: number): boolean {
  const t = throneOf(n)
  return i === t || i === t - 1 || i === t + 1 || i === t - n || i === t + n
}
const onEdge = (n: number, i: number) => { const r = Math.floor(i / n), c = i % n; return r === 0 || c === 0 || r === n - 1 || c === n - 1 }

/** Is the king surrounded on every side by attackers, the empty throne or (if hostile) the edge? */
export function kingCaptured(b: readonly number[], rules: Rules): boolean {
  const { n } = rules
  const k = kingAt(b)
  if (k < 0) return true
  const r = Math.floor(k / n), c = k % n
  const throne = throneOf(n)
  for (const [dr, dc] of DIRS) {
    const rr = r + dr, cc = c + dc
    if (rr < 0 || rr >= n || cc < 0 || cc >= n) { if (!rules.edgeHostileToKing) return false; continue }
    const j = rr * n + cc
    if (b[j] === ATK) continue
    if (j === throne && b[j] === EMPTY) continue
    return false
  }
  return true
}

export function kingEscaped(b: readonly number[], rules: Rules): boolean {
  const k = kingAt(b)
  if (k < 0) return false
  return rules.edgeEscape ? onEdge(rules.n, k) : isCorner(rules.n, k)
}

/** The open lanes from the king to an escape square: the squares the king would cross. */
export function kingLanes(b: readonly number[], rules: Rules): number[][] {
  const { n } = rules
  const k = kingAt(b)
  if (k < 0) return []
  const r = Math.floor(k / n), c = k % n
  const lanes: number[][] = []
  if (rules.edgeEscape) {
    for (const [dr, dc] of DIRS) {
      const cells: number[] = []
      let rr = r + dr, cc = c + dc, open = true
      while (rr >= 0 && rr < n && cc >= 0 && cc < n) {
        const j = rr * n + cc
        if (b[j] !== EMPTY || j === throneOf(n)) { open = false; break }
        cells.push(j); rr += dr; cc += dc
      }
      if (open && cells.length) lanes.push(cells)
    }
    return lanes
  }
  const tryLane = (cells: number[]) => { if (cells.every(j => b[j] === EMPTY)) lanes.push(cells) }
  const span = (a: number, z: number) => { const o: number[] = []; for (let x = a; x <= z; x++) o.push(x); return o }
  if (r === 0 || r === n - 1) {
    if (c > 0) tryLane(span(0, c - 1).map(x => r * n + x))
    if (c < n - 1) tryLane(span(c + 1, n - 1).map(x => r * n + x))
  }
  if (c === 0 || c === n - 1) {
    if (r > 0) tryLane(span(0, r - 1).map(x => x * n + c))
    if (r < n - 1) tryLane(span(r + 1, n - 1).map(x => x * n + c))
  }
  return lanes
}

/** Escapes the king could make with his next move. */
export const kingRoutes = (b: readonly number[], rules: Rules) => kingLanes(b, rules).length

/** Can some attacker step onto a non-corner square of `lane` in one move? */
export function laneBlockable(b: readonly number[], n: number, lane: number[]): boolean {
  for (const j of lane) {
    if (isCorner(n, j)) continue
    const r = Math.floor(j / n), c = j % n
    for (const [dr, dc] of DIRS) {
      let rr = r + dr, cc = c + dc
      while (rr >= 0 && rr < n && cc >= 0 && cc < n) {
        const v = b[rr * n + cc]
        if (v === ATK) return true
        if (v !== EMPTY) break
        rr += dr; cc += dc
      }
    }
  }
  return false
}

// ── Evaluation and search ───────────────────────────────────────────────────

const WEIGHTS: Record<Style, { adj: number; mob: number; ray: number; guard: number; dist: number }> = {
  balanced: { adj: 9, mob: 2, ray: 10, guard: 10, dist: 4 },
  wall: { adj: 6, mob: 2, ray: 12, guard: 18, dist: 4 },
  hunter: { adj: 16, mob: 3, ray: 9, guard: 6, dist: 3 },
}
const WIN = 100_000

/** Attacker-side score of a position with `toMove` to play. */
export function evaluate(b: readonly number[], rules: Rules, toMove: Side, style: Style = 'balanced'): number {
  const { n } = rules
  if (kingCaptured(b, rules)) return WIN
  if (kingEscaped(b, rules)) return -WIN
  const w = WEIGHTS[style]
  const lanes = kingLanes(b, rules)
  let s = 0
  if (lanes.length) {
    if (toMove === 'D') s -= WIN / 2
    else if (lanes.length >= 2 || !laneBlockable(b, n, lanes[0])) s -= WIN / 3
    else s -= 300
  }
  let atk = 0, def = 0, guard = 0
  for (let i = 0; i < b.length; i++) {
    const v = b[i]
    if (v === ATK) {
      atk++
      const r = Math.floor(i / n), c = i % n
      const nr = Math.min(r, n - 1 - r), nc = Math.min(c, n - 1 - c)
      if (!rules.edgeEscape && ((nr === 0 && nc === 1) || (nr === 1 && nc === 0) || (nr === 1 && nc === 1))) guard++
    } else if (v === DEF) def++
  }
  s += atk * 14 - def * 22 + guard * w.guard
  const k = kingAt(b)
  const kr = Math.floor(k / n), kc = k % n
  let mob = 0, rays = 0
  for (const [dr, dc] of DIRS) {
    const ar = kr + dr, ac = kc + dc
    if (ar >= 0 && ar < n && ac >= 0 && ac < n && b[ar * n + ac] === ATK) s += w.adj
    let rr = ar, cc = ac, open = true
    while (rr >= 0 && rr < n && cc >= 0 && cc < n) {
      if (b[rr * n + cc] !== EMPTY) { open = false; break }
      mob++; rr += dr; cc += dc
    }
    if (open && (rr !== kr + dr || cc !== kc + dc)) rays++
  }
  s -= mob * w.mob + rays * w.ray
  const dist = rules.edgeEscape ? Math.min(kr, n - 1 - kr, kc, n - 1 - kc) * 3 : Math.min(kr, n - 1 - kr) + Math.min(kc, n - 1 - kc)
  s += dist * w.dist
  return s
}

/** Captures and king-adjacent moves first, so alpha-beta cuts sooner. */
function ordered(b: readonly number[], rules: Rules, moves: Move[]): Move[] {
  const { n } = rules
  const k = kingAt(b)
  const kr = Math.floor(k / n), kc = k % n
  const key = (m: Move) => {
    const r = Math.floor(m.to / n), c = m.to % n
    return Math.abs(r - kr) + Math.abs(c - kc)
  }
  return moves.slice().sort((x, y) => key(x) - key(y))
}

export interface AiOptions { depth: number; style: Style; rng?: Rng; noise?: number; nodeBudget?: number }

/**
 * Choose a move for `side` by iterative-deepening alpha-beta to `depth` plies,
 * scoring with `evaluate` (attackers maximise, defenders minimise).  A depth
 * that runs past the node budget is thrown away and the last finished depth
 * is used, so the answer is deterministic and the search stays fast.
 */
export function searchMove(b: readonly number[], rules: Rules, side: Side, opts: AiOptions): Move | null {
  const { n } = rules
  let rootMoves = ordered(b, rules, movesFor(b, n, side))
  if (!rootMoves.length) return null
  const budget = opts.nodeBudget ?? 40_000
  let nodes = 0
  let aborted = false
  const sgn = (x: Side) => (x === 'A' ? 1 : -1)
  const flip = (x: Side): Side => (x === 'A' ? 'D' : 'A')
  const terminal = (nb: number[], mover: Side): number | null => {
    if (mover === 'A' && kingCaptured(nb, rules)) return WIN
    if (mover === 'D' && kingEscaped(nb, rules)) return -WIN
    return null
  }
  /** Value of `pos` for `who`, who is to move, searching `depth` plies. */
  const negamax = (pos: number[], who: Side, depth: number, alpha: number, beta: number): number => {
    const moves = movesFor(pos, n, who)
    if (!moves.length) return -WIN // stuck: whoever cannot move has lost
    let best = -Infinity
    for (const m of ordered(pos, rules, moves)) {
      if (++nodes > budget) { aborted = true; return best === -Infinity ? 0 : best }
      const nb = applyMove(pos, rules, m).board
      const t = terminal(nb, who)
      const v = t !== null ? sgn(who) * t
        : depth <= 1 ? sgn(who) * evaluate(nb, rules, flip(who), opts.style)
        : -negamax(nb, flip(who), depth - 1, -beta, -alpha)
      if (v > best) best = v
      if (v > alpha) alpha = v
      if (alpha >= beta) break
    }
    return best
  }

  let scored: { m: Move; v: number }[] = rootMoves.map(m => ({ m, v: 0 }))
  for (let depth = 1; depth <= Math.max(1, opts.depth); depth++) {
    aborted = false
    const cur: { m: Move; v: number }[] = []
    let best = -Infinity
    for (const m of rootMoves) {
      nodes++
      const nb = applyMove(b, rules, m).board
      const t = terminal(nb, side)
      // Search just below the best so far: equal values are exact, worse ones are bounds.
      const v = t !== null ? sgn(side) * t
        : depth <= 1 ? sgn(side) * evaluate(nb, rules, flip(side), opts.style)
        : -negamax(nb, flip(side), depth - 1, -Infinity, -(best - 1))
      if (aborted) break
      cur.push({ m, v })
      if (v > best) best = v
      if (v >= WIN) break
    }
    if (aborted) break
    cur.sort((x, y) => y.v - x.v)
    scored = cur
    // Best moves first for the next, deeper pass.
    rootMoves = [...cur.map(c => c.m), ...rootMoves.filter(m => !cur.some(c => c.m === m))]
    if (scored[0].v >= WIN || scored[0].v <= -WIN) break
  }
  const rng = opts.rng
  if (rng && opts.noise && rng() < opts.noise) {
    // A blunder: any of the next few moves that does not lose on the spot.
    const pool = scored.slice(0, 6).filter(s => s.v > -WIN / 4)
    if (pool.length) return pool[Math.floor(rng() * pool.length)].m
  }
  // Ties broken by the seed, so levels with the same board play differently.
  const top = scored.filter(s => s.v === scored[0].v)
  return (rng ? top[Math.floor(rng() * top.length)] : top[0]).m
}

/** The computer's move for a difficulty and config: move `ply` of a game with this seed. */
export function aiMove(b: readonly number[], d: Difficulty, id: string, seed: number, ply: number): Move | null {
  const c = cfgOf(id)
  const rng = mulberry32(hashString(`tafl:${seed}:${ply}`))
  const raid = c.mode === 'raid'
  return searchMove(b, rulesFor(d, id), raid ? 'D' : 'A', {
    depth: raid ? scale(d, [1, 2, 2, 2]) : depthFor(d), style: styleFor(d, id), rng,
    noise: noiseFor(d, id),
    nodeBudget: scale(d, [5000, 10_000, 40_000, 45_000]),
  })
}

/** Back-compat: the attackers' move in a defending config. */
export const attackerMove = (b: readonly number[], d: Difficulty, _style: Style, seed: number, ply: number, id = 'birka') => aiMove(b, d, id, seed, ply)

/** Starting position: the computer's side may start a man or two short (see attackersShort), chosen by seed. */
export function startBoard(d: Difficulty, seed: number, configId: string): number[] {
  const n = sizeFor(d)
  const b = initialBoard(n)
  const short = attackersShort(d, configId)
  if (short) {
    const raid = cfgOf(configId).mode === 'raid'
    const rng = mulberry32(seed ^ hashString(`tafl:start:${configId}`))
    const kind = raid ? DEF : ATK
    const men = b.map((v, i) => (v === kind ? i : -1)).filter(i => i >= 0)
    for (const i of shuffle(men, rng).slice(0, short)) b[i] = EMPTY
  }
  return b
}

export type Result = 'win' | 'lose' | null
export type Why = 'escaped' | 'captured' | 'stuck' | 'ai-stuck' | 'limit' | null

/** Play your move and the computer's answer (ply = your moves so far); for tests and the component. */
export function playTurn(b: readonly number[], d: Difficulty, id: string, seed: number, ply: number, m: Move):
  { afterMine: number[]; capturedMine: number[]; afterAi: number[] | null; ai: Move | null; capturedAi: number[]; result: Result; why: Why } {
  const rules = rulesFor(d, id)
  const raid = cfgOf(id).mode === 'raid'
  const me = sideOf(id)
  const mine = applyMove(b, rules, m)
  const base = { afterMine: mine.board, capturedMine: mine.captured, afterAi: null, ai: null, capturedAi: [] as number[] }
  if (!raid && kingEscaped(mine.board, rules)) return { ...base, result: 'win', why: 'escaped' }
  if (raid && kingCaptured(mine.board, rules)) return { ...base, result: 'win', why: 'captured' }
  const ai = aiMove(mine.board, d, id, seed, ply)
  if (!ai) return { ...base, result: 'win', why: 'ai-stuck' }
  const theirs = applyMove(mine.board, rules, ai)
  let result: Result = null, why: Why = null
  if (!raid && kingCaptured(theirs.board, rules)) { result = 'lose'; why = 'captured' }
  else if (raid && kingEscaped(theirs.board, rules)) { result = 'lose'; why = 'escaped' }
  else if (!movesFor(theirs.board, rules.n, me).length) { result = 'lose'; why = 'stuck' }
  else if (ply + 1 >= moveLimitFor(d, id)) { result = raid ? 'win' : 'lose'; why = 'limit' }
  return { afterMine: mine.board, capturedMine: mine.captured, afterAi: theirs.board, ai, capturedAi: theirs.captured, result, why }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function TaflGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'birka')
  const id = CONFIGS[configId] ? configId : 'birka'
  const rules = rulesFor(difficulty, id)
  const { n } = rules
  const raid = config.mode === 'raid'
  const me = sideOf(id)
  const limit = moveLimitFor(difficulty, id)
  const start = useMemo(() => startBoard(difficulty, seed, id), [difficulty, seed, id])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const [board, setBoard] = useState<number[]>(start)
  const [selected, setSelected] = useState<number | null>(null)
  const [ply, setPly] = useState(0)
  const [thinking, setThinking] = useState(false)
  const [last, setLast] = useState<Move | null>(null)
  const [gone, setGone] = useState<number[]>([])
  const [note, setNote] = useState(raid ? 'Your move — pick one of your black attackers.' : 'Your move — pick a white defender or the king.')
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const targets = useMemo(() => (selected === null ? [] : movesFor(board, n, me).filter(m => m.from === selected)), [board, n, me, selected])
  const throne = throneOf(n)
  const atkCount = board.filter(v => v === ATK).length
  const defCount = board.filter(v => v === DEF).length
  const goal = raid ? 'hold the ring' : config.escape === 'edge' ? 'reach any edge' : 'reach a corner'

  const move = (m: Move) => {
    setSelected(null)
    const res = playTurn(board, difficulty, id, seed, ply, m)
    setBoard(res.afterMine)
    setLast(m)
    setGone(res.capturedMine)
    if (res.result === 'win' && !res.afterAi) {
      setNote(res.why === 'ai-stuck' ? 'The enemy is hemmed in and yields!'
        : res.why === 'captured' ? 'The king is surrounded and taken!'
        : config.escape === 'edge' ? 'The king reaches the edge — he escapes!' : 'The king reaches the corner — he escapes!')
      win()
      return
    }
    setThinking(true)
    setNote(res.capturedMine.length ? `Captured ${res.capturedMine.length}! The enemy regroups…` : raid ? 'The defenders move…' : 'The attackers move…')
    timers.current.push(setTimeout(() => {
      setThinking(false)
      setBoard(res.afterAi!)
      setLast(res.ai)
      setGone(res.capturedAi)
      setPly(ply + 1)
      if (res.result === 'lose') {
        const why = res.why === 'captured' ? 'the king was captured' : res.why === 'escaped' ? 'the king escaped' : res.why === 'limit' ? 'out of moves' : 'no move left'
        setNote(res.why === 'captured' ? 'The king is surrounded and taken.'
          : res.why === 'escaped' ? 'The king slips through your ring and escapes.'
          : res.why === 'limit' ? 'The night is over — the king did not get away.'
          : 'Your pieces are pinned — no move left.')
        lose(why)
        return
      }
      if (res.result === 'win') { setNote('Dawn breaks and the ring held — the king is trapped!'); win(); return }
      const routes = kingRoutes(res.afterAi!, rules)
      const took = res.capturedAi.length
      setNote(took ? `The enemy took ${took} of your men.`
        : routes ? (raid ? 'The king has an open run — block it!' : 'An escape lane is open — the king can run!')
        : 'Your move.')
    }, 380))
  }

  const tap = (i: number) => {
    if (settled || thinking) return
    const v = board[i]
    const own = raid ? v === ATK : v === DEF || v === KING
    if (own) { setSelected(selected === i ? null : i); return }
    const m = targets.find(t => t.to === i)
    if (m) move(m)
    else setSelected(null)
  }

  const cellPx = `calc(100cqw / ${n})`

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      <div className="rounded-xl border border-line bg-panel px-3 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent truncate">{config.title}</p>
          <p className="text-ink text-sm font-semibold leading-tight">
            {n === 7 ? 'Brandubh' : n === 9 ? 'Tablut' : 'Hnefatafl'} {n}×{n} · {raid ? 'you are black' : 'you are white'} · {goal}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-xs font-bold tabular-nums ${limit - ply <= 5 ? 'text-red-600' : 'text-ink-2'}`} data-testid="moves-left">{limit - ply} moves left</p>
          <p className="text-[10px] text-muted">⚪ {defCount + 1} vs ⚫ {atkCount}</p>
        </div>
      </div>

      <div className="flex justify-center">
        <div
          className="grid w-full max-w-[400px] aspect-square rounded-lg overflow-hidden border-2 border-[#4a2f18] shadow-md bg-[#c9a676]"
          style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, containerType: 'inline-size' }}
          data-testid="tafl-board"
        >
          {board.map((v, i) => {
            const special = isCorner(n, i) || i === throne
            const isSel = selected === i
            const target = targets.some(t => t.to === i)
            const isLast = last && (last.from === i || last.to === i)
            const wasTaken = gone.includes(i)
            return (
              <button
                key={i}
                data-sq={i}
                data-piece={v || undefined}
                data-target={target ? '1' : undefined}
                aria-label={`square ${i}${v === KING ? ' king' : v === DEF ? ' defender' : v === ATK ? ' attacker' : ''}`}
                onClick={() => tap(i)}
                className={`relative aspect-square border-[0.5px] border-[#7a5532]/40
                  ${special ? 'bg-[#8b5a2b]/70' : (Math.floor(i / n) + i) % 2 ? 'bg-[#d8b98a]' : 'bg-[#cfae7d]'}
                  ${isLast ? 'bg-amber-300/70' : ''} ${isSel ? 'bg-accent/50' : ''} ${wasTaken ? 'bg-red-400/50' : ''}`}
              >
                {special && v === EMPTY && <span className="absolute inset-[22%] border-2 border-[#4a2f18]/60 rotate-45" />}
                {v !== EMPTY && (
                  <span
                    className={`absolute inset-[12%] rounded-full flex items-center justify-center leading-none shadow
                      ${v === ATK ? 'bg-[#2b1d14] border-2 border-[#120b07]' : 'bg-[#fbf3e2] border-2 border-[#8a6b45]'}`}
                    style={{ fontSize: `calc(${cellPx} * 0.5)` }}
                  >
                    {v === KING && <span className="text-[#8a5a00]">♚{'︎'}</span>}
                  </span>
                )}
                {target && <span className="absolute left-1/2 top-1/2 w-[30%] h-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/70" />}
              </button>
            )
          })}
        </div>
      </div>

      <p className={`text-xs leading-snug min-h-[2.5rem] ${thinking ? 'text-muted' : 'text-ink-2'}`} role="status">{note}</p>

      <p className="text-[11px] leading-snug text-muted">{config.intro}</p>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle={raid ? 'The ring holds!' : 'The king escapes!'} loseTitle={raid ? 'The king got away' : 'The king is lost'} />
    </div>
  )
}

export const CONFIG_IDS = Object.keys(CONFIGS)
