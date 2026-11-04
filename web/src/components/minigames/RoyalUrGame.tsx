import { useEffect, useMemo, useRef, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { STAGES } from '@/games/types'
import { hashString, mulberry32, pick, resolveConfig, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Royal Game of Ur, on Irving Finkel's reconstruction (from the tablet the
// Babylonian scribe Itti-Marduk-balāṭu copied in 177 BC).
//
// Each player's route is 14 squares: four private squares (1–4), the eight
// shared squares of the middle row (5–12), then two private squares (13–14),
// and a piece bears off on an exact throw (square 15).  Four tetrahedral dice
// each show a marked tip or not, so a throw is 0–4 (1/16, 4/16, 6/16, 4/16,
// 1/16).  Landing on a rosette (4, 8, 14) earns another throw; the central
// rosette (8) is a safe haven in Finkel's rules; landing on an enemy on any
// other shared square sends it back to the start.  Pieces never share a
// square with a friend.  A throw of 0, or a throw with no legal move, passes.
//
// Each config is a different rule set, not just a different piece count:
//   finkel — seven pieces from the start, Finkel's safe rosette, and the
//            race is "first to bear off N" (N by difficulty), so it is an
//            opening battle over the shared row.
//   blitz  — no safe rosette and a capture earns another throw; first to
//            bear off N of five.
//   quick  — the Guards' endgame: a seeded mid-game position with pieces
//            already on the board, bear them all off.
//   raid   — a capture race: the first to send K enemy pieces back wins
//            (or bears every piece off, which rarely comes first).
//
// Time budget: a full seven-piece race is ~60 throws a side (8–10 minutes),
// far past the 1–3 minute challenge.  The goals above keep a median game
// near 10–14 of the player's throws at D1 and at most ~26 at D4 (each throw
// plus the computer's reply takes ~5 s); the tests measure this.
//
// Difficulty: the AI's search grows from a careless greedy player that
// ignores danger (D1, also playing at random 40% of the time) to a 2-ply
// expectimax over the dice (D3–D4).  The goal grows with difficulty, at D1 one
// of your pieces starts on your first rosette, and at D4 the AI throws first.
//
// Test hooks (documented, only used by tests): params.startPos sets the
// starting positions `[human, ai]`, params.rolls scripts the dice throws.

// ── Engine ───────────────────────────────────────────────────────────────────

export type Player = 0 | 1
export interface UrRules {
  pieces: number
  /** The central rosette (square 8) protects the piece on it. */
  safeCentral: boolean
  /** A capture earns another throw (Blitz). */
  captureBonus: boolean
  /** Pieces a side must bear off to win (default: all of them). */
  goal?: number
  /** Captures that win the game outright (0/absent: off). */
  raid?: number
}
export interface UrState {
  /** Piece positions per player: 0 waiting, 1–14 on the route, 15 home. */
  pos: [number[], number[]]
  turn: Player
  /** Captures made by each side (only matters in a raid). */
  caps?: [number, number]
}
export interface UrMove { from: number; to: number; capture: boolean }
export interface Throw { total: number; tips: boolean[] }

export const HOME = 15
export const CENTRAL = 8
export const ROSETTES: ReadonlySet<number> = new Set([4, 8, 14])
export const ROLL_PROBS = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16] as const
export const isShared = (s: number) => s >= 5 && s <= 12

const other = (p: Player): Player => (p === 0 ? 1 : 0)
export const goalOf = (rules: UrRules) => Math.min(rules.pieces, rules.goal ?? rules.pieces)

/** D1's head start in a mid-game: one human piece this many squares on. */
export const MIDGAME_HEAD_START = 5
/** D1's head start: pieces placed on the player's first rosette (square 4). */
export const HEAD_START_SQUARE = 4

export function initialState(rules: UrRules, opts: { headStart?: number; first?: Player } = {}): UrState {
  const human = Array.from({ length: rules.pieces }, (_, i) => (i < (opts.headStart ?? 0) ? HEAD_START_SQUARE : 0))
  return { pos: [human, Array(rules.pieces).fill(0)], turn: opts.first ?? 0, caps: [0, 0] }
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

/**
 * A seeded mid-game position (the Guards' endgame): every piece is already
 * on the route, the two sides have equal total progress, and no two pieces
 * share a square.  The D1 head start moves one human piece MIDGAME_HEAD_START squares on.
 */
export function midgameState(rules: UrRules, seed: number, opts: { headStart?: number; first?: Player } = {}): UrState {
  const rng = mulberry32(seed ^ hashString('ur-midgame'))
  const n = rules.pieces
  for (let tries = 0; tries < 5000; tries++) {
    const pickSide = () => {
      const out: number[] = []
      while (out.length < n) {
        const sq = 1 + Math.floor(rng() * 12) // 1..12: on the route, none home yet
        if (!out.includes(sq)) out.push(sq)
      }
      return out.sort((a, b) => a - b)
    }
    const h = pickSide(), a = pickSide()
    if (sum(h) !== sum(a) || sum(h) < n * 5 || sum(h) > n * 8) continue
    if (h.some(x => isShared(x) && a.includes(x))) continue
    if (opts.headStart) {
      const top = h[h.length - 1]
      let to = top + MIDGAME_HEAD_START
      while (to < HOME && (h.includes(to) || (isShared(to) && a.includes(to)))) to++
      if (to >= HOME) continue
      h[h.length - 1] = to
    }
    return { pos: [h, a], turn: opts.first ?? 0, caps: [0, 0] }
  }
  return initialState(rules, opts)
}

/** Throw four tetrahedral dice: each has two marked tips of four. */
export function rollDice(rng: Rng): Throw {
  const tips = [0, 1, 2, 3].map(() => rng() < 0.5)
  return { total: tips.filter(Boolean).length, tips }
}

const isSafe = (s: number, rules: UrRules) => s === CENTRAL && rules.safeCentral

export function legalMoves(state: UrState, roll: number, rules: UrRules): UrMove[] {
  if (roll <= 0) return []
  const me = state.turn, mine = state.pos[me], theirs = state.pos[other(me)]
  const out: UrMove[] = []
  const seen = new Set<number>()
  for (const from of mine) {
    if (from === HOME || seen.has(from)) continue
    seen.add(from)
    const to = from + roll
    if (to > HOME) continue
    if (to < HOME && mine.includes(to)) continue
    let capture = false
    if (isShared(to) && theirs.includes(to)) {
      if (isSafe(to, rules)) continue
      capture = true
    }
    out.push({ from, to, capture })
  }
  return out
}

export function applyMove(state: UrState, move: UrMove, rules: UrRules): { state: UrState; extra: boolean } {
  const me = state.turn, opp = other(me)
  const mine = state.pos[me].slice()
  mine[mine.indexOf(move.from)] = move.to
  let theirs = state.pos[opp]
  const caps: [number, number] = state.caps ? [state.caps[0], state.caps[1]] : [0, 0]
  if (move.capture) { theirs = theirs.slice(); theirs[theirs.indexOf(move.to)] = 0; caps[me]++ }
  const extra = ROSETTES.has(move.to) || (move.capture && rules.captureBonus)
  const pos: [number[], number[]] = me === 0 ? [mine, theirs] : [theirs, mine]
  return { state: { pos, turn: extra ? me : opp, caps }, extra }
}

export const passTurn = (state: UrState): UrState => ({ ...state, turn: other(state.turn) })

export const homeCount = (state: UrState, p: Player) => state.pos[p].filter(x => x === HOME).length

/** The winner, if any: first to bear off the goal, or (in a raid) to make enough captures. */
export function winner(state: UrState, rules?: UrRules): Player | null {
  const goal = rules ? goalOf(rules) : state.pos[0].length
  const raid = rules?.raid ?? 0
  for (const p of [0, 1] as Player[]) {
    if (homeCount(state, p) >= goal) return p
    if (raid && (state.caps?.[p] ?? 0) >= raid) return p
  }
  return null
}

// ── AI ───────────────────────────────────────────────────────────────────────

/** Progress plus safety for one side; `careful` subtracts the chance of being hit. */
function sideScore(state: UrState, p: Player, rules: UrRules, careful: boolean): number {
  const opp = state.pos[other(p)]
  const raid = rules.raid ?? 0
  // In a raid a lost piece is a step toward defeat, so risk weighs more.
  const riskWeight = raid ? 3 : 1
  let s = raid ? (state.caps?.[p] ?? 0) * 40 : 0
  for (const pos of state.pos[p]) {
    if (pos === HOME) { s += 20; continue }
    if (pos === 0) continue
    s += pos + 2
    if (isSafe(pos, rules)) s += 3
    if (careful && isShared(pos) && !isSafe(pos, rules)) {
      let risk = 0
      for (let d = 1; d <= 4; d++) if (opp.includes(pos - d)) risk += ROLL_PROBS[d]
      s -= risk * (pos + 2) * riskWeight
    }
  }
  return s
}

export function evaluate(state: UrState, me: Player, rules: UrRules, careless = false): number {
  const w = winner(state, rules)
  if (w !== null) return w === me ? 1000 : -1000
  return sideScore(state, me, rules, !careless) - sideScore(state, other(me), rules, true)
}

/** Expected value of `state` (before its mover throws) for `me`, `depth` plies deep. */
function chanceValue(state: UrState, me: Player, depth: number, rules: UrRules): number {
  if (depth <= 0 || winner(state, rules) !== null) return evaluate(state, me, rules)
  let v = ROLL_PROBS[0] * chanceValue(passTurn(state), me, depth - 1, rules)
  for (let r = 1; r <= 4; r++) {
    const moves = legalMoves(state, r, rules)
    let best: number
    if (!moves.length) best = chanceValue(passTurn(state), me, depth - 1, rules)
    else {
      best = state.turn === me ? -Infinity : Infinity
      for (const m of moves) {
        const x = chanceValue(applyMove(state, m, rules).state, me, depth - 1, rules)
        best = state.turn === me ? Math.max(best, x) : Math.min(best, x)
      }
    }
    v += ROLL_PROBS[r] * best
  }
  return v
}

/** Best move for the side to move by `depth`-ply expectimax (depth 1 = greedy). */
export function searchMove(state: UrState, roll: number, rules: UrRules, depth: number, careless = false): UrMove | null {
  const moves = legalMoves(state, roll, rules)
  if (!moves.length) return null
  const me = state.turn
  let best = moves[0], bestV = -Infinity
  for (const m of moves) {
    const next = applyMove(state, m, rules).state
    const v = depth <= 1 ? evaluate(next, me, rules, careless) : chanceValue(next, me, depth - 1, rules)
    if (v > bestV + 1e-9) { bestV = v; best = m }
  }
  return best
}

/**
 * Search depth per difficulty.  D4 differs from D3 by throwing first; a
 * 3-ply search on top of that held a sensible (2-ply) player to ~39–44% in
 * finkel, quick and the garrison, so D4 searches 2 plies too (~46–50%, 400 games).
 */
export const AI_DEPTH: Record<Difficulty, number> = { 1: 1, 2: 1, 3: 2, 4: 2 }

/**
 * The computer's move.  D1 plays at random 40% of the time and otherwise
 * greedily without looking at danger to its own pieces; D2 is greedy with a
 * full evaluation; D3 and D4 search 2 plies of expectimax (D4 also throws first).
 */
export function aiMove(state: UrState, roll: number, difficulty: Difficulty, rng: Rng, rules: UrRules): UrMove | null {
  const moves = legalMoves(state, roll, rules)
  if (!moves.length) return null
  if (difficulty === 1) {
    if (rng() < 0.4) return pick(moves, rng)
    return searchMove(state, roll, rules, 1, true)
  }
  return searchMove(state, roll, rules, AI_DEPTH[difficulty])
}

/** How the difficulty sets up the race. */
export function setupFor(difficulty: Difficulty): { headStart: number; first: Player } {
  return { headStart: difficulty === 1 ? 1 : 0, first: difficulty === 4 ? 1 : 0 }
}

// ── Configs ──────────────────────────────────────────────────────────────────

type PerDiff = readonly [number, number, number, number]
interface UrConfig {
  title: string
  intro: string
  fact: string
  /** Base rules; `goal`/`raid` come from the per-difficulty tables below. */
  rules: Omit<UrRules, 'goal' | 'raid'>
  /** Pieces to bear off per difficulty (absent: all). */
  goal?: PerDiff
  /** Captures that win per difficulty (absent: no raid). */
  raid?: PerDiff
  /** Pieces per side per difficulty, overriding rules.pieces. */
  pieces?: PerDiff
  /** Start from a seeded mid-game position instead of an empty board. */
  midgame?: boolean
  rivals: string[]
}

export const CONFIGS: Record<string, UrConfig> = {
  finkel: {
    title: 'The Royal Tombs of Ur',
    intro: "Seven pieces each on Irving Finkel's rules — the central rosette is a safe haven. The first to bring the target number home wins.",
    rules: { pieces: 7, safeCentral: true, captureBonus: false },
    goal: [1, 2, 2, 2],
    rivals: ['Queen Puabi', 'Meskalamdug', 'A temple scribe'],
    fact: 'Irving Finkel reconstructed these rules from a cuneiform tablet copied by the Babylonian scribe Itti-Marduk-balāṭu in 177 BC, nearly 2,500 years after the boards were buried at Ur.',
  },
  blitz: {
    title: 'Blitz in Babylon',
    intro: 'Five pieces, no safe rosette, and every capture earns another throw. First to bring the target number home wins.',
    rules: { pieces: 5, safeCentral: false, captureBonus: true },
    goal: [1, 2, 2, 2],
    rivals: ['A Babylonian merchant', 'A palace guard', 'A diviner'],
    fact: 'The game outlived Mesopotamia: the Jewish community of Kochi in India still played a version of it on a 20-square board into the 20th century.',
  },
  quick: {
    title: "The Guards' Game",
    intro: "A game already under way: every piece is on the board, both sides equally far along. Bring all of yours home first.",
    rules: { pieces: 3, safeCentral: true, captureBonus: false },
    pieces: [2, 3, 3, 3],
    midgame: true,
    rivals: ['A gate guard', 'A bored sentry', 'A soldier off duty'],
    fact: "Bored guards scratched a 20-square Ur board into the base of a stone lamassu at the Assyrian palace of Khorsabad; it can still be seen in the British Museum.",
  },
  raid: {
    title: 'Raid on the Middle Row',
    intro: 'A capture race: no rosette is safe, and the first to send the target number of enemy pieces back to the start wins.',
    rules: { pieces: 5, safeCentral: false, captureBonus: false },
    raid: [2, 2, 3, 3],
    rivals: ['An Elamite raider', 'A Sumerian charioteer', 'A temple champion'],
    fact: 'Leonard Woolley excavated the Royal Cemetery of Ur in the 1920s; one of its game boards lay beside the famous "Standard of Ur", whose panels show war and peace.',
  },
  uruk: {
    title: 'Twenty Squares at Uruk',
    intro: 'Five pieces each. The central rosette is a safe haven, and every capture earns another throw. The first to bring the target number home wins.',
    rules: { pieces: 5, safeCentral: true, captureBonus: true },
    goal: [1, 2, 2, 2],
    rivals: ['Shamhat', 'A shepherd of the steppe', 'A brewer of Uruk'],
    fact: 'Boards for the game of twenty squares were buried in the Royal Cemetery of Ur around 2600 BCE — about the age in which a historical Gilgamesh is thought to have ruled Uruk — and the game went on being played across the Near East for more than two thousand years.',
  },
  'theban-garrison': {
    title: 'The Garrison’s Board',
    intro: 'A game already under way, every piece on the board. No rosette is safe, and every capture earns another throw. Bring all of yours home first.',
    rules: { pieces: 3, safeCentral: false, captureBonus: true },
    pieces: [2, 3, 3, 3],
    midgame: true,
    rivals: ['An Assyrian soldier', 'A garrison scribe', 'A Kushite archer'],
    fact: 'The Mesopotamian game of twenty squares had reached Egypt by the New Kingdom. Many Egyptian senet boxes carry its board on the underside, so one box served for both games.',
  },
}

/** The concrete rules of a config at a difficulty. */
export function rulesFor(configId: string, difficulty: Difficulty): UrRules {
  const c = CONFIGS[configId] ?? CONFIGS.finkel
  const i = difficulty - 1
  const pieces = c.pieces ? c.pieces[i] : c.rules.pieces
  return { ...c.rules, pieces, goal: c.goal ? c.goal[i] : pieces, raid: c.raid ? c.raid[i] : 0 }
}

/** The opening position of a config at a difficulty and seed. */
export function startFor(configId: string, difficulty: Difficulty, seed: number): UrState {
  const c = CONFIGS[configId] ?? CONFIGS.finkel
  const rules = rulesFor(configId, difficulty)
  const setup = setupFor(difficulty)
  return c.midgame ? midgameState(rules, seed, setup) : initialState(rules, setup)
}

// ── UI ───────────────────────────────────────────────────────────────────────

type Phase = 'roll' | 'rolling' | 'move' | 'ai' | 'done'
interface LastMove extends UrMove { player: Player }

/** Board cell (3 rows × 8 cols) → route square for that row; null for the two gaps. */
function squareAt(row: number, col: number): number | null {
  if (row === 1) return col + 5
  if (col <= 3) return 4 - col
  if (col >= 6) return 20 - col
  return null
}
const ownerRow = (p: Player) => (p === 0 ? 2 : 0)

function Die({ up, spin }: { up: boolean; spin: boolean }) {
  return (
    <svg viewBox="0 0 40 36" className={`w-9 h-8 ${spin ? 'animate-bounce' : ''}`} aria-hidden>
      <polygon points="20,2 38,34 2,34" fill="#f4e7c8" stroke="#6b4a24" strokeWidth="2" />
      <line x1="20" y1="2" x2="20" y2="34" stroke="#6b4a24" strokeWidth="1" opacity="0.4" />
      {up && <circle cx="20" cy="8" r="4" fill="#1e3a8a" />}
    </svg>
  )
}

function Piece({ player, glow }: { player: Player; glow?: boolean }) {
  return (
    <span className={`block w-[70%] aspect-square rounded-full border-2 shadow
      ${player === 0 ? 'bg-[#fbf3e0] border-[#7a5a2e]' : 'bg-[#1c1917] border-[#a8a29e]'}
      ${glow ? 'ring-2 ring-amber-400' : ''}`}>
      <span className={`block w-full h-full rounded-full ${player === 0 ? 'bg-[radial-gradient(circle,#7a5a2e_0_18%,transparent_20%)]' : 'bg-[radial-gradient(circle,#e7e5e4_0_18%,transparent_20%)]'}`} />
    </span>
  )
}

export default function RoyalUrGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'finkel')
  const cfgId = configId && CONFIGS[configId] ? configId : 'finkel'
  const rules = useMemo(() => rulesFor(cfgId, difficulty), [cfgId, difficulty])
  const goal = goalOf(rules)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })
  const rival = useMemo(() => pick(config.rivals, mulberry32(seed ^ hashString(configId || 'ur'))), [config, seed, configId])

  const start = useMemo<UrState>(() => {
    const setup = setupFor(difficulty)
    const custom = params?.startPos as [number[], number[]] | undefined
    if (custom) return { pos: [custom[0].slice(), custom[1].slice()], turn: (params?.first as Player) ?? setup.first, caps: [0, 0] }
    return startFor(cfgId, difficulty, seed)
  }, [difficulty, params, cfgId, seed])

  const diceRng = useRef<Rng>(mulberry32(seed ^ hashString('ur-dice')))
  const aiRng = useRef<Rng>(mulberry32(seed ^ hashString('ur-ai')))
  const scripted = useRef<number[]>(Array.isArray(params?.rolls) ? (params!.rolls as number[]).slice() : [])
  const nextThrow = (): Throw => {
    if (scripted.current.length) {
      const total = scripted.current.shift()!
      return { total, tips: [0, 1, 2, 3].map(i => i < total) }
    }
    return rollDice(diceRng.current)
  }

  const [game, setGame] = useState<UrState>(start)
  const [phase, setPhase] = useState<Phase>(start.turn === 0 ? 'roll' : 'ai')
  const [dice, setDice] = useState<Throw | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [spinTips, setSpinTips] = useState<boolean[]>([true, false, true, false])
  const [moves, setMoves] = useState<UrMove[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [last, setLast] = useState<LastMove | null>(null)
  const [note, setNote] = useState(start.turn === 0 ? 'Your throw. Tap Roll.' : `${rival} throws first.`)

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)) }

  useEffect(() => {
    if (!spinning) return
    const iv = setInterval(() => setSpinTips([0, 1, 2, 3].map(() => Math.random() < 0.5)), 90)
    return () => clearInterval(iv)
  }, [spinning])

  // Hand over to whoever moves next, or settle the game.
  const advance = (s: UrState, extra: boolean) => {
    const w = winner(s, rules)
    if (w !== null) {
      setPhase('done')
      const byRaid = !!rules.raid && (s.caps?.[w] ?? 0) >= rules.raid
      if (w === 0) { setNote(byRaid ? `Your ${rules.raid}th capture — the raid is won!` : goal < rules.pieces ? `${goal} pieces home — you win the race!` : 'All your pieces are home — you win the race!'); win() }
      else { setNote(byRaid ? `${rival} made ${rules.raid} captures first.` : goal < rules.pieces ? `${rival} brings ${goal} pieces home first.` : `${rival} brings every piece home first.`); lose(`${rival} won the race`) }
      return
    }
    if (s.turn === 0) {
      setPhase('roll')
      setNote(extra ? 'Rosette! Throw again.' : 'Your throw. Tap Roll.')
    } else aiTurn(s, extra)
  }

  const aiTurn = (s: UrState, extra = false) => {
    setPhase('ai')
    setMoves([]); setSelected(null)
    setNote(extra ? `${rival} throws again…` : `${rival} is throwing…`)
    later(() => {
      setSpinning(true)
      later(() => {
        setSpinning(false)
        const t = nextThrow()
        setDice(t)
        later(() => {
          const m = aiMove(s, t.total, difficulty, aiRng.current, rules)
          if (!m) {
            setNote(`${rival} threw ${t.total} — no move.`)
            const n = passTurn(s)
            setGame(n)
            later(() => advance(n, false), 700)
            return
          }
          const r = applyMove(s, m, rules)
          setGame(r.state)
          setLast({ ...m, player: 1 })
          setNote(`${rival} threw ${t.total}${m.capture ? ' and captured your piece!' : '.'}`)
          later(() => advance(r.state, r.extra), 700)
        }, 450)
      }, 500)
    }, 400)
  }

  // An AI opening (D4) starts once on mount.
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    if (start.turn === 1) aiTurn(start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const roll = () => {
    if (settled || phase !== 'roll') return
    setPhase('rolling'); setSpinning(true); setLast(null)
    later(() => {
      setSpinning(false)
      const t = nextThrow()
      setDice(t)
      const ms = legalMoves(game, t.total, rules)
      if (!ms.length) {
        setNote(t.total === 0 ? 'You threw 0 — your turn passes.' : `You threw ${t.total} — no legal move. Turn passes.`)
        const n = passTurn(game)
        later(() => { setGame(n); advance(n, false) }, 900)
        return
      }
      setMoves(ms)
      setSelected(ms.length === 1 ? ms[0].from : null)
      setPhase('move')
      setNote(`You threw ${t.total}. Tap a glowing piece, then its target.`)
    }, 550)
  }

  const play = (m: UrMove) => {
    const r = applyMove(game, m, rules)
    setGame(r.state); setLast({ ...m, player: 0 }); setMoves([]); setSelected(null)
    if (m.capture) setNote(`Captured! ${rival}'s piece goes back to the start.`)
    advance(r.state, r.extra)
  }

  const selMove = selected === null ? null : moves.find(m => m.from === selected) ?? null
  const tapSquare = (sq: number, mineHere: boolean) => {
    if (settled || phase !== 'move') return
    if (selMove && selMove.to === sq) { play(selMove); return }
    if (mineHere && moves.some(m => m.from === sq)) { setSelected(sq); return }
    const direct = moves.filter(m => m.to === sq)
    if (direct.length === 1) { play(direct[0]); return }
    setNote(mineHere ? 'That piece cannot move this throw.' : 'Pick one of your glowing pieces first.')
  }

  const waiting = (p: Player) => game.pos[p].filter(x => x === 0).length
  const home = (p: Player) => game.pos[p].filter(x => x === HOME).length
  const tierLabel = STAGES[difficulty - 1]?.label ?? ''

  const pool = (p: Player, kind: 'start' | 'home') => {
    const n = kind === 'start' ? waiting(p) : home(p)
    const sq = kind === 'start' ? 0 : HOME
    const isMine = p === 0
    const canFrom = isMine && kind === 'start' && moves.some(m => m.from === 0)
    const isTarget = isMine && kind === 'home' && selMove?.to === HOME
    const isLast = last && last.player === p && (kind === 'home' ? last.to === HOME : last.from === 0)
    return (
      <button
        aria-label={`${isMine ? 'your' : 'rival'} ${kind === 'start' ? 'waiting' : 'home'} pieces: ${n}`}
        disabled={!isMine}
        onClick={() => tapSquare(sq, kind === 'start' && n > 0)}
        className={`flex-1 min-h-[2.5rem] rounded-lg border px-2 py-1 flex items-center gap-1 flex-wrap
          ${isTarget ? 'border-accent bg-accent/20' : canFrom ? 'border-amber-400 bg-amber-100/40' : 'border-line bg-panel'}
          ${isLast ? 'ring-1 ring-amber-400' : ''}`}
      >
        <span className="text-[10px] uppercase tracking-wide text-muted w-full text-left">{kind === 'start' ? 'Waiting' : 'Home'} · {n}</span>
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className="w-4 h-4 flex items-center justify-center"><Piece player={p} glow={canFrom && i === 0 && selected === 0} /></span>
        ))}
        {isTarget && <span className="text-[10px] font-bold text-accent">bear off here</span>}
      </button>
    )
  }

  const shownTips = spinning ? spinTips : dice?.tips ?? [false, false, false, false]

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent truncate">{config.title}</p>
          <span className="text-[10px] text-muted shrink-0">{tierLabel} · vs {rival}</span>
        </div>
        <p className="text-ink-2 text-xs leading-snug mt-0.5">{config.intro}{difficulty === 1 ? ' One of your pieces starts ahead.' : difficulty === 4 ? ` ${rival} throws first.` : ''}</p>
        <p className="text-[11px] text-ink mt-1 font-semibold">
          {rules.raid ? `Goal: ${rules.raid} captures — you ${game.caps?.[0] ?? 0} · ${rival} ${game.caps?.[1] ?? 0}` : `Goal: ${goal} of ${rules.pieces} home — you ${home(0)} · ${rival} ${home(1)}`}
        </p>
      </div>

      <div className="flex gap-2">{pool(1, 'start')}{pool(1, 'home')}</div>

      {/* The board: 3 rows × 8 columns with the two gaps of the original. */}
      <div className="flex justify-center">
        <div className="w-full max-w-[400px] grid gap-[3px] p-[5px] rounded-lg bg-[#4a2f17] shadow-md" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
          {[0, 1, 2].flatMap(row => Array.from({ length: 8 }, (_, col) => {
            const sq = squareAt(row, col)
            if (sq === null) return <div key={`${row}-${col}`} className="aspect-square" />
            const human = row === 1 ? game.pos[0].includes(sq) : row === ownerRow(0) && game.pos[0].includes(sq)
            const ai = row === 1 ? game.pos[1].includes(sq) : row === ownerRow(1) && game.pos[1].includes(sq)
            const rowOwner: Player | null = row === 1 ? null : row === 2 ? 0 : 1
            const canMove = human && moves.some(m => m.from === sq)
            const isTarget = selMove && selMove.to === sq && (row === 1 || rowOwner === 0)
            const isLast = last && (last.to === sq || last.from === sq) && (row === 1 || rowOwner === last.player)
            const rosette = ROSETTES.has(sq)
            const label = `square ${sq}${row === 1 ? ' shared' : rowOwner === 0 ? ' yours' : ' rival'}${rosette ? ' rosette' : ''}${human ? ' your piece' : ai ? ' rival piece' : ''}`
            return (
              <button
                key={`${row}-${col}`}
                aria-label={label}
                onClick={() => rowOwner !== 1 && tapSquare(sq, human)}
                className={`relative aspect-square rounded-[4px] flex items-center justify-center
                  ${rosette ? 'bg-[#1e3a8a]' : (row + col) % 2 ? 'bg-[#2c4a9a]' : 'bg-[#e9dcc0]'}
                  ${isLast ? 'outline outline-2 outline-amber-400' : ''}`}
              >
                {rosette && <span className="absolute text-[#f4e7c8] text-lg leading-none opacity-80">✿</span>}
                {!rosette && (row + col) % 2 === 0 && <span className="absolute inset-[22%] rounded-full border border-[#b08a52]/60" />}
                {!rosette && (row + col) % 2 === 1 && <span className="absolute inset-[30%] rotate-45 border border-[#f4e7c8]/40" />}
                {(human || ai) && <span className="relative z-10 w-full h-full flex items-center justify-center"><Piece player={human ? 0 : 1} glow={canMove} /></span>}
                {isTarget && <span className={`absolute z-20 rounded-full ${selMove?.capture ? 'inset-[8%] border-[3px] border-red-500' : 'w-[34%] h-[34%] bg-accent/80'}`} />}
                {canMove && selected === sq && <span className="absolute z-20 inset-0 rounded-[4px] ring-2 ring-accent" />}
              </button>
            )
          }))}
        </div>
      </div>

      <div className="flex gap-2">{pool(0, 'start')}{pool(0, 'home')}</div>

      <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2">
        <div className="flex gap-1" aria-label={dice && !spinning ? `dice show ${dice.total}` : 'dice'}>
          {shownTips.map((up, i) => <Die key={i} up={up} spin={spinning} />)}
        </div>
        <span className="text-xl font-bold tabular-nums text-ink w-6 text-center">{spinning ? '…' : dice ? dice.total : '–'}</span>
        <button
          onClick={roll}
          disabled={settled || phase !== 'roll'}
          className="ml-auto px-4 py-2 rounded-lg bg-accent text-accent-fg text-sm font-bold disabled:opacity-40"
        >Roll</button>
      </div>

      <p className="text-xs leading-snug text-ink-2 min-h-[2rem]" role="status">{note}</p>

      <details className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-ink-2">
        <summary className="cursor-pointer font-semibold text-ink">Rules</summary>
        <ul className="mt-1 list-disc pl-4 space-y-0.5">
          <li>Throw four pyramid dice: each marked tip counts 1, so 0–4 (2 is most likely).</li>
          <li>Your route: 4 squares on your row, the 8 shared middle squares, then 2 back on your row, and off with an exact throw.</li>
          <li>Land on a rosette ✿ to throw again.{rules.safeCentral ? ' A piece on the central rosette cannot be captured.' : ' No rosette is safe in this game.'}</li>
          <li>Land on a rival piece in the middle row to send it back to the start.{rules.captureBonus ? ' A capture earns another throw.' : ''}</li>
          <li>You may not land on your own piece. A 0 or no legal move passes. {rules.raid ? `First to make ${rules.raid} captures wins (or to bring all ${rules.pieces} home).` : goal < rules.pieces ? `First to bring ${goal} of ${rules.pieces} pieces home wins.` : `First to bring all ${rules.pieces} home wins.`}</li>
        </ul>
      </details>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="Victory at Ur!" loseTitle={`${rival} won the race`} />
    </div>
  )
}

export const CONFIG_IDS = Object.keys(CONFIGS)
