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
// Configs are documented rule sets: Finkel (7 pieces), Blitz (5 pieces, no
// safe rosette, a capture earns another throw) and a 3-piece Quick game.
//
// Difficulty: the AI's search grows from a careless greedy player that
// ignores danger (D1, also playing at random 40% of the time) to a 3-ply
// expectimax over the dice (D4).  The win condition shifts too: at D1 you
// start with one piece already borne off, and at D4 the AI throws first.
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
}
export interface UrState {
  /** Piece positions per player: 0 waiting, 1–14 on the route, 15 home. */
  pos: [number[], number[]]
  turn: Player
}
export interface UrMove { from: number; to: number; capture: boolean }
export interface Throw { total: number; tips: boolean[] }

export const HOME = 15
export const CENTRAL = 8
export const ROSETTES: ReadonlySet<number> = new Set([4, 8, 14])
export const ROLL_PROBS = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16] as const
export const isShared = (s: number) => s >= 5 && s <= 12

const other = (p: Player): Player => (p === 0 ? 1 : 0)

export function initialState(rules: UrRules, opts: { headStart?: number; first?: Player } = {}): UrState {
  const human = Array.from({ length: rules.pieces }, (_, i) => (i < (opts.headStart ?? 0) ? HOME : 0))
  return { pos: [human, Array(rules.pieces).fill(0)], turn: opts.first ?? 0 }
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
  if (move.capture) { theirs = theirs.slice(); theirs[theirs.indexOf(move.to)] = 0 }
  const extra = ROSETTES.has(move.to) || (move.capture && rules.captureBonus)
  const pos: [number[], number[]] = me === 0 ? [mine, theirs] : [theirs, mine]
  return { state: { pos, turn: extra ? me : opp }, extra }
}

export const passTurn = (state: UrState): UrState => ({ pos: state.pos, turn: other(state.turn) })

export function winner(state: UrState): Player | null {
  if (state.pos[0].every(p => p === HOME)) return 0
  if (state.pos[1].every(p => p === HOME)) return 1
  return null
}

// ── AI ───────────────────────────────────────────────────────────────────────

/** Progress plus safety for one side; `careful` subtracts the chance of being hit. */
function sideScore(state: UrState, p: Player, rules: UrRules, careful: boolean): number {
  const opp = state.pos[other(p)]
  let s = 0
  for (const pos of state.pos[p]) {
    if (pos === HOME) { s += 20; continue }
    if (pos === 0) continue
    s += pos + 2
    if (isSafe(pos, rules)) s += 3
    if (careful && isShared(pos) && !isSafe(pos, rules)) {
      let risk = 0
      for (let d = 1; d <= 4; d++) if (opp.includes(pos - d)) risk += ROLL_PROBS[d]
      s -= risk * (pos + 2)
    }
  }
  return s
}

export function evaluate(state: UrState, me: Player, rules: UrRules, careless = false): number {
  const w = winner(state)
  if (w !== null) return w === me ? 1000 : -1000
  return sideScore(state, me, rules, !careless) - sideScore(state, other(me), rules, true)
}

/** Expected value of `state` (before its mover throws) for `me`, `depth` plies deep. */
function chanceValue(state: UrState, me: Player, depth: number, rules: UrRules): number {
  if (depth <= 0 || winner(state) !== null) return evaluate(state, me, rules)
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

/** Search depth per difficulty. */
export const AI_DEPTH: Record<Difficulty, number> = { 1: 1, 2: 1, 3: 2, 4: 3 }

/**
 * The computer's move.  D1 plays at random 40% of the time and otherwise
 * greedily without looking at danger to its own pieces; D2 is greedy with a
 * full evaluation; D3 and D4 search 2 and 3 plies of expectimax.
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

interface UrConfig {
  title: string
  intro: string
  fact: string
  rules: UrRules
  rivals: string[]
}

export const CONFIGS: Record<string, UrConfig> = {
  finkel: {
    title: 'The Royal Tombs of Ur',
    intro: "Seven pieces each, Irving Finkel's rules: the central rosette is a safe haven.",
    rules: { pieces: 7, safeCentral: true, captureBonus: false },
    rivals: ['Queen Puabi', 'Meskalamdug', 'A temple scribe'],
    fact: 'Irving Finkel reconstructed these rules from a cuneiform tablet copied by the Babylonian scribe Itti-Marduk-balāṭu in 177 BC, nearly 2,500 years after the boards were buried at Ur.',
  },
  blitz: {
    title: 'Blitz in Babylon',
    intro: 'Five pieces, no safe rosette, and every capture earns another throw.',
    rules: { pieces: 5, safeCentral: false, captureBonus: true },
    rivals: ['A Babylonian merchant', 'A palace guard', 'A diviner'],
    fact: 'The game outlived Mesopotamia: the Jewish community of Kochi in India still played a version of it on a 20-square board into the 20th century.',
  },
  quick: {
    title: "The Guards' Game",
    intro: 'A short race with three pieces each, on Finkel\'s rules.',
    rules: { pieces: 3, safeCentral: true, captureBonus: false },
    rivals: ['A gate guard', 'A bored sentry', 'A soldier off duty'],
    fact: "Bored guards scratched a 20-square Ur board into the base of a stone lamassu at the Assyrian palace of Khorsabad; it can still be seen in the British Museum.",
  },
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
  const rules = config.rules
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })
  const rival = useMemo(() => pick(config.rivals, mulberry32(seed ^ hashString(configId || 'ur'))), [config, seed, configId])

  const start = useMemo<UrState>(() => {
    const setup = setupFor(difficulty)
    const custom = params?.startPos as [number[], number[]] | undefined
    if (custom) return { pos: [custom[0].slice(), custom[1].slice()], turn: (params?.first as Player) ?? setup.first }
    return initialState(rules, setup)
  }, [difficulty, params, rules])

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
    const w = winner(s)
    if (w !== null) {
      setPhase('done')
      if (w === 0) { setNote('All your pieces are home — you win the race!'); win() }
      else { setNote(`${rival} brings every piece home first.`); lose(`${rival} won the race`) }
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
        <p className="text-ink-2 text-xs leading-snug mt-0.5">{config.intro}{difficulty === 1 ? ' You start with one piece already home.' : difficulty === 4 ? ` ${rival} throws first.` : ''}</p>
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
          <li>You may not land on your own piece. A 0 or no legal move passes. First to bring all {rules.pieces} home wins.</li>
        </ul>
      </details>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="All pieces home — victory!" loseTitle={`${rival} won the race`} />
    </div>
  )
}

export const CONFIG_IDS = Object.keys(CONFIGS)
