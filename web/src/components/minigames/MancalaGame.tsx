import { useEffect, useMemo, useRef, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Mancala: sow seeds round a two-row board against a computer opponent.
//
// Four rule sets share one engine, and each config is a different twist:
//  - oware (abapa, the tournament rules of Ghana's Oware): 12 pits × 4 seeds,
//    sow counter-clockwise skipping the starting pit on a lap, capture pits of
//    2 or 3 on the opponent's side chaining backwards, a capture that would
//    take every opposing seed (grand slam) captures nothing, and you must feed
//    an opponent whose row is empty; if you cannot, the game ends.  Played as
//    a race: the first to capture `target` seeds wins.
//  - kalah (Champion's 1940s rules): 6 pits plus a store each; the last seed
//    in your store earns another turn, the last seed in an empty pit of yours
//    takes it and the seeds opposite; when a row empties, each side keeps what
//    is left on its own row.  Three seeds a pit at D1–2, four from D3.
//  - bao (a two-row "Bao lite" after the East African relay games): 8 pits a
//    side, 48 seeds; when the last seed lands in an occupied pit you lift that
//    pit and keep sowing (relay); ending in an empty pit of your own captures
//    the pit opposite.  You must start from a pit of 2+ seeds if you have one.
//    The starting layout is seeded but point-symmetric, so it is always fair.
//  - fours (anan-anan / "fours", a Ghanaian children's game): 12 pits × 4.
//    Every pit that reaches exactly four seeds while you sow is taken at once
//    by the owner of the row it is on — except the pit your last seed lands
//    in, which you take wherever it is.  Long sowings can feed your rival.
//
// Pit indices: the human (player 0) owns 0..n-1 along the bottom row, left to
// right; the computer (player 1) owns n..2n-1 along the top, right to left.
// Sowing runs up the index (counter-clockwise).  Captured seeds go to
// `store[player]`.  The game ends when someone reaches the target (a majority
// of the seeds unless the config sets a race target), when the side to move
// has no legal move (remaining seeds go to the owner of the row they sit
// on), or at a ply cap (likewise) — the cap keeps one game to ~15–35 of your
// moves.
//
// Outcome: you win with more seeds than the computer.  A tie counts as a win
// at difficulty 1–2 and a loss at 3–4.
//
// AI: negamax with alpha-beta and iterative deepening under a node budget
// (deterministic, well under 300 ms).  D1 plays a 1-ply greedy move and
// throws in a random move 45% of the time; D2 searches 3 plies with 20%
// random moves; D3 searches 3 plies with 15%; D4 searches 4 with 10%.  Ties between
// equal moves are broken by the seeded rng, so every seed is a new game.

export type Variant = 'oware' | 'kalah' | 'bao' | 'fours'
type Tiers = readonly [number, number, number, number]
export type Player = 0 | 1

export interface MancalaConfig {
  variant: Variant
  title: string
  intro: string
  fact: string
  /** Pits per player. */
  pits: number
  /** Seeds per pit at the start, by difficulty (bao reshuffles them symmetrically by seed). */
  seeds: Tiers
  /** Seeds that win on the spot, by difficulty; omitted = a majority of all seeds. */
  target?: Tiers
  /** Plies (both sides' moves, extra turns included) before the game is called, by difficulty. */
  plyCap: Tiers
  opponent: string
  /** Authoring/test hook: a fixed starting position instead of the standard one. */
  start?: { pits: number[]; store: [number, number]; turn?: Player }
}

export const CONFIGS: Record<string, MancalaConfig> = {
  oware: {
    variant: 'oware',
    title: 'Oware Abapa',
    intro: 'A capture race: sow round the board and take any pit on your rival\'s row that your last seed makes 2 or 3 — chaining back along the row. First to the target wins.',
    fact: 'Oware is the national mancala of the Akan peoples of Ghana; the abapa rules played here — no grand slam, always feed your opponent — are the ones used in international tournaments today.',
    pits: 6, seeds: [4, 4, 4, 4], target: [10, 12, 14, 16], plyCap: [36, 44, 52, 60], opponent: 'the Kumasi elder',
  },
  'nakht-harvest': {
    variant: 'oware',
    title: 'Seed Time and Harvest',
    intro: 'Sow the seed field by field round the board, and gather any pit on your rival\'s row that your last seed makes 2 or 3 — chaining back along the row. First to bring in the target wins.',
    fact: 'The tomb of Nakht at Thebes (TT52) paints the farming year: ploughing and sowing as the flood retreats, then reaping and winnowing the grain — the work the scribe’s calendar timed and his records counted.',
    pits: 6, seeds: [4, 4, 4, 4], target: [10, 12, 14, 16], plyCap: [36, 44, 52, 60], opponent: 'the overseer of the fields',
  },
  kalah: {
    variant: 'kalah',
    title: 'Kalah',
    intro: 'Stores and free turns: a last seed in your store sows again, and a last seed in an empty pit of yours steals the pit across. Most seeds wins.',
    fact: 'Kalah was marketed in the United States by William Julius Champion Jr. from the 1940s, adapted from African mancala games; in 2000 researchers solved it by computer, showing the first player can force a win with six pits and four seeds.',
    pits: 6, seeds: [3, 3, 4, 4], plyCap: [44, 50, 60, 66], opponent: 'the parlour champion',
  },
  'bao-lite': {
    variant: 'bao',
    title: 'Bao Relay',
    intro: 'Relay sowing: when your last seed lands in a full pit, lift it and sow on. End in an empty pit of yours to capture across. First to the target wins.',
    fact: 'Bao — Swahili for "board" — is played along the East African coast on a board of four rows of eight pits, and is counted among the most complex mancala games; its relay sowing can carry a single move several times round the board.',
    pits: 8, seeds: [3, 3, 3, 3], target: [16, 18, 20, 22], plyCap: [36, 44, 52, 60], opponent: 'the Zanzibar master',
  },
  'kilwa-bao': {
    variant: 'bao',
    title: 'Bao at Kilwa, 1505',
    intro: 'The new Portuguese fort stands over the harbour, but the merchants of Kilwa still play their board in the shade. Relay sowing: when your last seed lands in a full pit, lift it and sow on. End in an empty pit of yours to capture across. First to the target wins.',
    fact: 'In 1505 Francisco de Almeida, sailing as Manuel I’s first viceroy of India, took Kilwa and sacked Mombasa on the Swahili coast and built a fort at Kilwa. The coast’s mancala, bao — Swahili for “board” — is still played there on boards of four rows of eight pits.',
    pits: 8, seeds: [3, 3, 3, 3], target: [16, 18, 20, 22], plyCap: [36, 44, 52, 60], opponent: 'the Kilwa merchant',
  },
  fours: {
    variant: 'fours',
    title: 'Anan-Anan: Fours',
    intro: 'Watch every pit, not just the last: any pit that reaches four while you sow goes to whoever owns that row — but the pit your last seed makes four is yours. First to the target wins.',
    fact: 'Anan-anan ("four-four") is a children\'s mancala of Ghana in which every pit of four is captured as the seeds go round; it is a quick game often learned before full Oware.',
    pits: 6, seeds: [4, 4, 4, 4], target: [16, 20, 20, 24], plyCap: [36, 44, 52, 60], opponent: 'the village children',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

export interface MState {
  variant: Variant
  n: number
  pits: number[]
  store: [number, number]
  turn: Player
  ply: number
  plyLimit: number
  total: number
  /** Seeds that end the game at once. */
  target: number
  over: boolean
}

export interface MoveInfo {
  player: Player
  pit: number
  /** Indices that received seeds, in order (2n / 2n+1 mean player 0 / 1's store in kalah). */
  sown: number[]
  captured: number[]
  take: number
  extraTurn: boolean
  grandSlam: boolean
  relays: number
  /** Fours: seeds that went to the other player during your sowing. */
  given: number
}

export const ownerOf = (s: { n: number }, i: number): Player => (i < s.n ? 0 : 1)
export const opposite = (s: { n: number }, i: number) => 2 * s.n - 1 - i
export const sideSum = (s: { n: number; pits: number[] }, p: Player) => {
  let t = 0
  for (let i = p * s.n; i < p * s.n + s.n; i++) t += s.pits[i]
  return t
}

/** Standard start (or `config.start`); bao spreads its seeds by rng, point-symmetrically. */
export function initialState(config: MancalaConfig, rng: Rng = Math.random, difficulty: Difficulty = 4): MState {
  const n = config.pits
  const seeds = scale(difficulty, config.seeds)
  let pits = Array(2 * n).fill(seeds) as number[]
  let store: [number, number] = [0, 0]
  let turn: Player = 0
  if (config.start) {
    pits = config.start.pits.slice()
    store = [...config.start.store] as [number, number]
    turn = config.start.turn ?? 0
  } else if (config.variant === 'bao') {
    const half = Array(n).fill(seeds) as number[]
    for (let k = 0; k < 10; k++) {
      const a = Math.floor(rng() * n), b = Math.floor(rng() * n)
      if (a !== b && half[a] > 1) { half[a]--; half[b]++ }
    }
    pits = [...half, ...half]
  }
  const total = pits.reduce((a, b) => a + b, 0) + store[0] + store[1]
  const target = config.target ? scale(difficulty, config.target) : Math.floor(total / 2) + 1
  const s: MState = { variant: config.variant, n, pits, store, turn, ply: 0, plyLimit: scale(difficulty, config.plyCap), total, target, over: false }
  return checkEnd(s)
}

function rawMoves(s: MState): number[] {
  const { n, pits } = s
  const lo = s.turn * n, hi = lo + n
  let ms: number[] = []
  for (let i = lo; i < hi; i++) if (pits[i] > 0) ms.push(i)
  if (s.variant === 'bao') {
    const big = ms.filter(i => pits[i] >= 2)
    if (big.length) ms = big
  }
  if (s.variant === 'oware' && sideSum(s, (1 - s.turn) as Player) === 0) {
    // Must feed: only sowings long enough to cross into the empty row.
    ms = ms.filter(i => pits[i] > hi - 1 - i)
  }
  return ms
}

export function legalMoves(s: MState): number[] {
  return s.over ? [] : rawMoves(s)
}

function sweep(s: MState) {
  for (let i = 0; i < 2 * s.n; i++) {
    if (s.pits[i]) { s.store[ownerOf(s, i)] += s.pits[i]; s.pits[i] = 0 }
  }
  s.over = true
}

/** Mark the state over (and sweep leftover seeds) if the game has ended. Mutates and returns `s`. */
export function checkEnd(s: MState): MState {
  if (s.over) return s
  if (s.store[0] >= s.target || s.store[1] >= s.target) { s.over = true; return s }
  if (s.variant === 'kalah') {
    if (sideSum(s, 0) === 0 || sideSum(s, 1) === 0) sweep(s)
  } else if (rawMoves(s).length === 0) {
    sweep(s)
  }
  if (!s.over && s.ply >= s.plyLimit) sweep(s)
  return s
}

export function applyMove(s: MState, pit: number): { state: MState; info: MoveInfo } {
  const n = s.n, N = 2 * n
  const p = s.turn, opp = (1 - p) as Player
  const pits = s.pits.slice()
  const store: [number, number] = [s.store[0], s.store[1]]
  let k = pits[pit]
  pits[pit] = 0
  const info: MoveInfo = { player: p, pit, sown: [], captured: [], take: 0, extraTurn: false, grandSlam: false, relays: 0, given: 0 }
  const own = (i: number) => (i < n ? 0 : 1) === p

  if (s.variant === 'oware') {
    let pos = pit
    while (k > 0) {
      pos = (pos + 1) % N
      if (pos === pit) continue
      pits[pos]++; info.sown.push(pos); k--
    }
    if (!own(pos)) {
      const list: number[] = []
      let q = pos, gain = 0
      while (!own(q) && (pits[q] === 2 || pits[q] === 3)) { list.push(q); gain += pits[q]; q = (q - 1 + N) % N }
      let oppSeeds = 0
      for (let i = opp * n; i < opp * n + n; i++) oppSeeds += pits[i]
      if (gain > 0 && gain === oppSeeds) info.grandSlam = true
      else if (gain > 0) {
        for (const q2 of list) pits[q2] = 0
        store[p] += gain; info.captured = list; info.take = gain
      }
    }
  } else if (s.variant === 'kalah') {
    // Ring: 0..n-1 pits of 0, n = store 0, n+1..2n = pits n..2n-1, 2n+1 = store 1.
    const R = N + 2
    const ownStore = p === 0 ? n : N + 1
    const oppStore = p === 0 ? N + 1 : n
    let r = pit < n ? pit : pit + 1
    while (k > 0) {
      r = (r + 1) % R
      if (r === oppStore) continue
      if (r === ownStore) { store[p]++; info.sown.push(N + p) } else { const i = r < n ? r : r - 1; pits[i]++; info.sown.push(i) }
      k--
    }
    if (r === ownStore) info.extraTurn = true
    else {
      const i = r < n ? r : r - 1
      const o = N - 1 - i
      if (own(i) && pits[i] === 1 && pits[o] > 0) {
        info.take = pits[o] + 1; info.captured = [o, i]
        store[p] += info.take; pits[o] = 0; pits[i] = 0
      }
    }
  } else if (s.variant === 'fours') {
    // Every pit that reaches four goes to its row's owner; the last one to the sower.
    const lap = k >= N
    let pos = pit
    while (k > 0) {
      pos = (pos + 1) % N
      if (lap && pos === pit) continue
      pits[pos]++; info.sown.push(pos); k--
      if (pits[pos] === 4) {
        const taker: Player = k === 0 ? p : ownerOf(s, pos)
        store[taker] += 4; pits[pos] = 0; info.captured.push(pos)
        if (taker === p) info.take += 4
        else info.given += 4
      }
    }
  } else {
    let pos = pit, steps = 0
    for (;;) {
      while (k > 0) { pos = (pos + 1) % N; pits[pos]++; info.sown.push(pos); k--; steps++ }
      if (pits[pos] > 1 && steps < 400) { k = pits[pos]; pits[pos] = 0; info.relays++; continue }
      break
    }
    if (pits[pos] === 1 && own(pos)) {
      const o = N - 1 - pos
      if (pits[o] > 0) { info.take = pits[o]; info.captured = [o]; store[p] += pits[o]; pits[o] = 0 }
    }
  }

  const state: MState = { ...s, pits, store, turn: info.extraTurn ? p : opp, ply: s.ply + 1 }
  return { state: checkEnd(state), info }
}

export function winner(s: MState): Player | null {
  return s.store[0] > s.store[1] ? 0 : s.store[1] > s.store[0] ? 1 : null
}

/** Did the human (player 0) win a finished game?  Ties go to the human at D1–2. */
export function humanWins(s: MState, difficulty: Difficulty): boolean {
  const w = winner(s)
  return w === 0 || (w === null && difficulty <= 2)
}

// ── Search ───────────────────────────────────────────────────────────────────

const WIN = 10_000

function evaluate(s: MState, p: Player): number {
  const d = s.store[p] - s.store[1 - p]
  if (s.over) return d > 0 ? WIN + d : d < 0 ? -WIN + d : 0
  // Captured seeds dominate; a little weight on seeds kept at home breaks ties.
  return d * 4 + (sideSum(s, p) - sideSum(s, (1 - p) as Player)) * (s.variant === 'kalah' ? 1 : 0)
}

interface Ctx { nodes: number; budget: number }

function negamax(s: MState, depth: number, alpha: number, beta: number, ctx: Ctx): number {
  ctx.nodes++
  if (s.over || depth === 0 || ctx.nodes > ctx.budget) return evaluate(s, s.turn)
  let best = -Infinity
  for (const m of rawMoves(s)) {
    const c = applyMove(s, m).state
    const v = c.turn === s.turn ? negamax(c, depth - 1, alpha, beta, ctx) : -negamax(c, depth - 1, -beta, -alpha, ctx)
    if (v > best) best = v
    if (v > alpha) alpha = v
    if (alpha >= beta) break
  }
  return best
}

/** Root scores for every legal move after iterative deepening up to `maxDepth` within a node budget. */
export function scoreMoves(s: MState, maxDepth: number, budget = 80_000): { move: number; score: number }[] {
  const moves = legalMoves(s)
  const children = moves.map(m => applyMove(s, m).state)
  let result = moves.map((move, i) => ({ move, score: evaluate(children[i], s.turn) * (children[i].turn === s.turn ? 1 : -1) }))
  const ctx: Ctx = { nodes: 0, budget }
  for (let d = 1; d <= maxDepth; d++) {
    const scores = moves.map((move, i) => {
      const c = children[i]
      const v = c.turn === s.turn ? negamax(c, d - 1, -Infinity, Infinity, ctx) : -negamax(c, d - 1, -Infinity, Infinity, ctx)
      return { move, score: v }
    })
    if (ctx.nodes > budget && d > 1) break
    result = scores
    if (ctx.nodes > budget) break
  }
  return result
}

export function bestMove(s: MState, depth: number, rng: Rng, budget?: number): number {
  const scored = scoreMoves(s, depth, budget)
  const top = Math.max(...scored.map(x => x.score))
  const best = scored.filter(x => x.score === top)
  return best[Math.floor(rng() * best.length)].move
}

// A flawless 5–8 ply search beat a careful (2–3 ply) player in ~95% of games at
// D3–D4; these levels leave a careful player ~60–70% at D3 and ~50–60% at D4.
export const AI_DEPTH = (d: Difficulty, _v: Variant) => scale(d, [1, 3, 3, 4])
export const AI_RANDOM = (d: Difficulty) => scale(d, [0.45, 0.2, 0.15, 0.1])
const AI_BUDGET = (d: Difficulty) => scale(d, [5_000, 20_000, 60_000, 150_000])

/** The computer's move at a difficulty. */
export function aiMove(s: MState, difficulty: Difficulty, rng: Rng): number {
  const ms = legalMoves(s)
  if (ms.length <= 1) return ms[0]
  if (rng() < AI_RANDOM(difficulty)) return ms[Math.floor(rng() * ms.length)]
  return bestMove(s, AI_DEPTH(difficulty, s.variant), rng, AI_BUDGET(difficulty))
}

// ── Component ────────────────────────────────────────────────────────────────

const LEVEL = ['Novice', 'Player', 'Expert', 'Master'] as const

const RULES: Record<Variant, string[]> = {
  oware: [
    'Tap one of your pits (bottom row). Its seeds are sown one by one, counter-clockwise; a pit of 12+ skips its own pit on the lap.',
    'If your last seed makes a pit on the top row hold 2 or 3, you capture it — and the pit before it, and so on, while they hold 2 or 3.',
    'Grand slam: a capture that would take every seed on the top row captures nothing.',
    'If the opponent\'s row is empty you must sow into it; if you can\'t, the game ends and each side keeps its own seeds.',
    'First to the target wins.',
  ],
  kalah: [
    'Tap one of your pits. Seeds are sown counter-clockwise into your pits, your store (right) and the opponent\'s pits — never into their store.',
    'Last seed in your store: take another turn.',
    'Last seed in an empty pit of yours: capture it plus every seed in the pit opposite.',
    'When either row is empty the game ends; each side keeps the seeds on its own row. Most seeds wins.',
  ],
  fours: [
    'Tap one of your pits (bottom row). Its seeds are sown one by one, counter-clockwise; a pit of 12+ skips its own pit on the lap.',
    'Any pit that reaches exactly four as the seeds go round is taken at once by the owner of that row — even if that is your rival.',
    'The pit your last seed makes four is always yours, on either row.',
    'First to the target wins; if you cannot move, the game ends and each side keeps its own row.',
  ],
  bao: [
    'Tap a pit with 2+ seeds (singles only when nothing else is left). Seeds are sown counter-clockwise.',
    'Relay: if the last seed lands in an occupied pit, lift all its seeds and keep sowing.',
    'When the last seed lands in an empty pit on your row, capture the seeds in the pit opposite.',
    'If you have no seeds to sow the game ends. First to the target wins.',
  ],
}

function Seeds({ count, light }: { count: number; light?: boolean }) {
  const dots = Math.min(count, 12)
  return (
    <span className="absolute inset-[16%] flex flex-wrap items-center justify-center content-center gap-[2px] pointer-events-none">
      {Array.from({ length: dots }, (_, i) => (
        <span key={i} className="w-[7px] h-[7px] rounded-full shadow-sm"
          style={{ background: light ? '#f7ecc9' : i % 3 === 0 ? '#e3cf9a' : i % 3 === 1 ? '#d8bd7a' : '#efe0b4' }} />
      ))}
    </span>
  )
}

export default function MancalaGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'oware')
  const rng = useMemo(() => mulberry32((seed ^ hashString(`mancala:${configId}`)) >>> 0), [seed, configId])
  const initial = useMemo(() => initialState(config, rng, difficulty), [config.variant, config.pits, config.seeds, config.start, rng, difficulty]) // eslint-disable-line react-hooks/exhaustive-deps
  const [state, setState] = useState<MState>(initial)
  const [last, setLast] = useState<MoveInfo | null>(null)
  const [note, setNote] = useState('Your turn — tap a glowing pit on your row.')
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const describe = (info: MoveInfo, who: string) => {
    const bits: string[] = []
    if (info.relays) bits.push(`${info.relays} relay${info.relays > 1 ? 's' : ''}`)
    if (info.take) bits.push(`captured ${info.take}`)
    if (info.grandSlam) bits.push('grand slam — no capture')
    if (info.given) bits.push(`${info.given} went to the other side`)
    if (info.extraTurn) bits.push('extra turn')
    return `${who} sowed${bits.length ? ` · ${bits.join(' · ')}` : ''}.`
  }

  // Settle, or let the computer move.
  useEffect(() => {
    if (settled) return
    if (state.over) {
      const [a, b] = state.store
      if (humanWins(state, difficulty)) { setNote(`Game over: ${a}–${b}.`); win() }
      else { setNote(`Game over: ${a}–${b}.`); lose(a === b ? 'a tie is not enough at this level' : `${config.opponent} gathered more seeds`) }
      return
    }
    if (state.turn !== 1) return
    timer.current = setTimeout(() => {
      const m = aiMove(state, difficulty, rng)
      const { state: next, info } = applyMove(state, m)
      setLast(info)
      setState(next)
      setNote(describe(info, 'Opponent') + (next.turn === 1 && !next.over ? ' Thinking again…' : next.over ? '' : ' Your turn.'))
    }, 450)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [state, settled]) // eslint-disable-line react-hooks/exhaustive-deps

  const legal = state.turn === 0 && !settled ? legalMoves(state) : []

  const tap = (i: number) => {
    if (settled || state.turn !== 0 || state.over) return
    if (!legal.includes(i)) {
      if (ownerOf(state, i) === 1) setNote('That pit belongs to your opponent — sow from your bottom row.')
      else if (state.pits[i] === 0) setNote('That pit is empty.')
      else if (state.variant === 'oware') setNote('Your opponent\'s row is empty — you must sow seeds into it.')
      else setNote('Start from a pit with at least two seeds.')
      return
    }
    const { state: next, info } = applyMove(state, i)
    setLast(info)
    setState(next)
    setNote(describe(info, 'You') + (next.over ? '' : next.turn === 0 ? ' Go again!' : ' Opponent is thinking…'))
  }

  const { n } = state
  const sown = new Set(last?.sown ?? [])
  const captured = new Set(last?.captured ?? [])
  const top = Array.from({ length: n }, (_, c) => 2 * n - 1 - c)
  const bottom = Array.from({ length: n }, (_, c) => c)
  const storeLabel = state.variant === 'kalah' ? 'store' : 'won'

  const pitButton = (i: number) => {
    const count = state.pits[i]
    const isLegal = legal.includes(i)
    const isOrigin = last?.pit === i
    const isCap = captured.has(i)
    const mine = ownerOf(state, i) === 0
    return (
      <button
        key={i}
        onClick={() => tap(i)}
        aria-label={`${mine ? 'your' : 'opponent'} pit ${mine ? i + 1 : i - n + 1}, ${count} seeds${isLegal ? ', playable' : ''}`}
        className={`relative aspect-square rounded-full transition-shadow
          ${isLegal ? 'ring-2 ring-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.7)]' : ''}
          ${isCap ? 'ring-2 ring-red-500' : isOrigin ? 'ring-2 ring-sky-300' : ''}`}
        style={{ background: 'radial-gradient(circle at 50% 40%, #3b2410 0%, #5a3818 70%, #6e4520 100%)', boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)' }}
      >
        <Seeds count={count} />
        {sown.has(i) && !isCap && <span className="absolute inset-0 rounded-full bg-amber-200/15 pointer-events-none" />}
        <span className={`absolute -bottom-0.5 right-0 min-w-[16px] px-0.5 rounded text-[10px] font-bold leading-4 tabular-nums
          ${count > 12 ? 'bg-amber-200 text-[#3b2410]' : 'bg-black/45 text-amber-100'}`}>{count}</span>
      </button>
    )
  }

  const storeBox = (p: Player) => (
    <div className={`row-span-2 flex flex-col items-center justify-center rounded-full px-1 py-2 text-center
      ${last?.sown.includes(2 * n + p) ? 'ring-2 ring-amber-200/60' : ''}`}
      style={{ background: 'radial-gradient(ellipse at 50% 40%, #3b2410 0%, #5a3818 80%)', boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.6)' }}
      aria-label={`${p === 0 ? 'your' : 'opponent'} seeds won: ${state.store[p]}`}
    >
      <span className="text-[9px] uppercase tracking-wide text-amber-200/80">{p === 0 ? 'You' : 'AI'}</span>
      <span className="text-lg font-bold text-amber-100 tabular-nums">{state.store[p]}</span>
      <span className="text-[8px] text-amber-200/70">{storeLabel}</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-ink text-sm font-bold truncate">{config.title}</p>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-accent">Level: D{difficulty} {LEVEL[difficulty - 1]}</span>
        </div>
        <p className="text-ink-2 text-xs leading-snug mt-0.5">{config.intro}</p>
        <p className="text-muted text-[10px] mt-1">
          Opponent: {config.opponent} · First to {state.target} of {state.total} seeds{difficulty <= 2 ? ' (a tie also counts)' : ''}
        </p>
        <p className="text-muted text-[10px]" data-testid="moves-left">
          {Math.max(0, state.plyLimit - state.ply)} turns left (both sides) — then each side keeps its row and most seeds wins
        </p>
      </div>

      <div className="rounded-2xl p-2 border-2 border-[#4a2c12] shadow-md"
        style={{ background: 'linear-gradient(180deg, #a86f3a 0%, #8b5a2b 50%, #a86f3a 100%)' }}>
        <div className="grid gap-1.5 items-center" style={{ gridTemplateColumns: `minmax(34px, 0.9fr) repeat(${n}, minmax(0, 1fr)) minmax(34px, 0.9fr)` }}>
          {storeBox(1)}
          {top.map(pitButton)}
          {storeBox(0)}
          {bottom.map(pitButton)}
        </div>
        <div className="flex justify-between text-[9px] text-amber-100/80 mt-1 px-1">
          <span>← opponent sows this way</span>
          <span>you sow this way →</span>
        </div>
      </div>

      <p className={`text-xs leading-snug min-h-[2rem] ${state.turn === 0 && !state.over ? 'text-ink' : 'text-ink-2'}`} role="status">
        {note}
      </p>

      <details className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink-2">
        <summary className="cursor-pointer font-semibold text-ink">Rules</summary>
        <ul className="list-disc pl-4 mt-1 space-y-0.5">
          {RULES[state.variant].map((r, i) => <li key={i}>{r}</li>)}
          <li>{difficulty <= 2 ? 'A tie counts as your win at this level.' : 'A tie counts as a loss at this level.'}</li>
        </ul>
      </details>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="You gathered the harvest!" loseTitle="Your rival gathered more seeds" />
    </div>
  )
}
