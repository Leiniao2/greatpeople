import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, resolveConfig, storyText, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Temple Disks — the Tower of Hanoi and three of its classic variants.
// Move the whole stack to the marked peg, one disk at a time, never placing
// a larger disk on a smaller one.
//
//   config        variant                                   disks D1 → D4   optimal moves
//   benares       Lucas's 1883 puzzle, 3 pegs                 4, 5, 5, 6      15, 31, 31, 63
//   reve          Dudeney's Reve's puzzle (1907), 4 pegs      5, 6, 7, 8      13, 17, 25, 33
//   scattered     start from a scattered legal position       4, 5, 5, 6      ≥ 70% of 2ⁿ − 1
//   prayer-wheel  one-way: disks only move clockwise          3, 3, 3, 4      15, 15/21, 21, 43
//   narrow-bridge only between neighbouring pegs (no 1 ↔ 3)   3, 3, 3, 4      13, 13/26, 26, 40
//
// Time budget: at roughly two seconds a move an engaged player needs about
// 30–45 s at D1 and at most ~2½ minutes at D4 — no level asks for more than
// 65 optimal moves (a 7-disk tower, 127 moves, would be far too long).
//
// The seed chooses the start and goal pegs (and the scattered position),
// and the optimal move count comes from the exported BFS solver.
//
//   move cap  D1 2 × optimal + 6   D2 2 × optimal   D3 1.5 × optimal + 2
//             D4 optimal + max(3, 20%)

interface HanoiConfig {
  title: string
  intro: string
  fact: string
  pegs: number
  disks: readonly [number, number, number, number]
  scattered?: boolean
  cyclic?: boolean
  /** Disks may only move between neighbouring pegs (1 ↔ 2 ↔ 3). */
  adjacent?: boolean
  palette: string[]
}

export const CONFIGS: Record<string, HanoiConfig> = {
  benares: {
    title: 'The Tower of Brahma',
    intro: 'Move the golden stack to the marked peg. One disk at a time — never a larger disk on a smaller one.',
    fact: 'Édouard Lucas sold the puzzle in 1883 as "La Tour d\'Hanoï" under the name "Professor N. Claus de Siam" — an anagram of Lucas d\'Amiens. His legend tells of priests in a temple at Benares moving 64 golden disks; at one move a second that takes 2⁶⁴ − 1 seconds, about 585 billion years.',
    pegs: 3, disks: [4, 5, 5, 6], palette: ['#f6d365', '#f1b84b', '#e39b32', '#cf7f22', '#b5651d', '#94501a', '#743d15', '#5a2f10'],
  },
  'zeno-dichotomy': {
    title: 'The Dichotomy',
    intro: 'Before the whole stack can move, the smaller stack above it must move — and before that, a smaller one still. Bring the stack to the marked peg, one disk at a time, never a larger disk on a smaller one.',
    fact: 'Aristotle preserves Zeno\'s Dichotomy: to cross any distance you must first cross half of it, then half of what is left, and so without end. The tower\'s regress, unlike Zeno\'s, bottoms out — n disks always take exactly 2ⁿ − 1 moves.',
    pegs: 3, disks: [4, 5, 5, 6], palette: ['#e8e2d0', '#d6cba9', '#c2b182', '#ab965f', '#927b44', '#786332', '#5f4d26', '#48391c'],
  },
  reve: {
    title: "The Reve's Cheeses",
    intro: 'Four stools this time. Move the cheeses to the marked stool, never a larger cheese on a smaller one — the extra stool makes far shorter solutions possible.',
    fact: "Henry Dudeney's The Canterbury Puzzles (1907) gives \"The Reve's Puzzle\": the Reve of Chaucer's pilgrims moves cheeses across four stools. Its general four-peg solution, the Frame–Stewart algorithm (1941), was only proven optimal for every size in 2014 by Thierry Bousch.",
    pegs: 4, disks: [5, 6, 7, 8], palette: ['#fff1b8', '#ffe28a', '#fcd25c', '#f5c242', '#e9ad2c', '#d9971f', '#c4801a', '#a86915'],
  },
  scattered: {
    title: 'The Scattered Temple',
    intro: 'An earthquake has scattered the temple disks across the pegs. Gather them into one tower on the marked peg — still never a larger disk on a smaller one.',
    fact: 'Lucas also posed the puzzle from any legal arrangement. From any position, gathering the disks onto a chosen peg takes at most 2ⁿ − 1 moves — the positions of the Tower of Hanoi form a graph shaped like the Sierpiński triangle.',
    scattered: true, pegs: 3, disks: [4, 5, 5, 6], palette: ['#b5e3d8', '#8fd3c3', '#64bfae', '#3fa796', '#2a8c7d', '#1f7266', '#175a51', '#10433c'],
  },
  'prayer-wheel': {
    title: 'The Prayer Wheel',
    intro: 'The pegs stand in a ring and disks may only travel clockwise to the next peg. Bring the stack to the marked peg.',
    fact: 'The one-way "cyclic" Tower of Hanoi was analysed by Atkinson in 1981. Restricting moves to one direction makes the shortest solution grow roughly as (1 + √3)ⁿ instead of 2ⁿ — moving 4 disks one step clockwise takes 43 moves instead of 15.',
    cyclic: true, pegs: 3, disks: [3, 3, 3, 4], palette: ['#f5b7b1', '#ec7063', '#cb4335', '#943126', '#78281f', '#641e16', '#4a1610', '#33100b'],
  },
  'rue-cambon': {
    title: 'The Hatboxes of Rue Cambon',
    intro: 'Move the stack of hatboxes to the marked shelf, one box at a time — never a larger box on a smaller one, or the hats inside are crushed.',
    fact: 'Gabrielle "Coco" Chanel began making hats in Étienne Balsan’s Paris flat on the boulevard Malesherbes in 1909. In 1910, with money from Arthur "Boy" Capel, she opened Chanel Modes at 21 rue Cambon, selling straw boaters to actresses.',
    pegs: 3, disks: [4, 5, 5, 6], palette: ['#f5f5f4', '#e7e5e4', '#d6d3d1', '#a8a29e', '#78716c', '#57534e', '#44403c', '#1c1917'],
  },
  'queens-ware': {
    title: 'The Queen’s Service',
    intro: 'Carry the stack of cream-coloured dishes to the marked bench, one dish at a time — never a larger dish on a smaller one, or the stack topples and the order is lost.',
    fact: 'In 1765 Queen Charlotte ordered a tea service of Josiah Wedgwood’s cream-coloured earthenware. He won the title “Potter to Her Majesty” and renamed the ware Queen’s Ware — then sold it to everyone who wanted to eat like a queen.',
    pegs: 3, disks: [4, 5, 5, 6], palette: ['#fbf6e4', '#f5ecc9', '#eee0ad', '#e5d291', '#d9c277', '#c9ae5f', '#b4984b', '#9a7f3a'],
  },
  'narrow-bridge': {
    title: 'The Narrow Bridge',
    intro: 'The pegs stand in a row across a narrow bridge: a disk may only step to the neighbouring peg — never straight from the first peg to the last. Bring the stack to the marked peg.',
    fact: 'This "adjacent" or linear Tower of Hanoi was posed by Scorer, Grundy and Smith in 1944. Carrying n disks from one end to the other takes 3ⁿ − 1 moves, and the solution passes through every one of the 3ⁿ legal positions exactly once.',
    adjacent: true, pegs: 3, disks: [3, 3, 3, 4], palette: ['#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81'],
  },
  'hittite-succession': {
    title: 'The Order of Succession',
    intro: 'The law fixes the order of rank, and no one may break it: move the royal line to the marked peg one disk at a time, and never set a greater disk above a lesser one.',
    fact: 'The Edict of Telepinu sets the order: a king’s son of the first rank becomes king; if there is none, a son of the second rank; and if there is no prince at all, a husband is to be taken for a first-rank daughter, and he becomes king.',
    pegs: 3, disks: [4, 5, 5, 6], palette: ['#f3d9a4', '#e6c07a', '#d4a556', '#bf8a3c', '#a5712c', '#8a5b22', '#6e461a', '#533413'],
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Engine ─────────────────────────────────────────────────────────────────────

export interface HanoiPuzzle {
  pegs: number
  disks: number
  cyclic: boolean
  /** Only moves between neighbouring pegs are allowed. */
  adjacent?: boolean
  /** start[d] = peg of disk d (0 = smallest). */
  start: number[]
  goal: number
  optimal: number
}

export type Move = [number, number]

/** Disks on a peg, bottom first (largest first). */
export function stackOf(state: number[], peg: number): number[] {
  const out: number[] = []
  for (let d = state.length - 1; d >= 0; d--) if (state[d] === peg) out.push(d)
  return out
}

export function topOf(state: number[], peg: number): number {
  for (let d = 0; d < state.length; d++) if (state[d] === peg) return d
  return -1
}

/** Why a move is illegal, or null. */
export function moveProblem(p: HanoiPuzzle, state: number[], from: number, to: number): string | null {
  if (from === to) return 'Pick a different peg'
  const d = topOf(state, from)
  if (d < 0) return 'That peg is empty'
  if (p.cyclic && to !== (from + 1) % p.pegs) return 'Disks may only travel clockwise to the next peg'
  if (p.adjacent && Math.abs(from - to) !== 1) return 'Disks may only step to a neighbouring peg'
  const t = topOf(state, to)
  if (t >= 0 && t < d) return 'A larger disk cannot sit on a smaller one'
  return null
}

export function applyMove(state: number[], from: number, to: number): number[] {
  const d = topOf(state, from)
  const next = [...state]
  next[d] = to
  return next
}

export const isSolved = (p: HanoiPuzzle, state: number[]) => state.every(x => x === p.goal)

const encode = (state: number[], pegs: number) => state.reduce((a, x, i) => a + x * pegs ** i, 0)

/** BFS distances from the goal tower to every position (moves are reversed for the one-way variant). */
function distancesToGoal(pegs: number, disks: number, cyclic: boolean, goal: number, adjacent = false): Int32Array {
  const total = pegs ** disks
  const dist = new Int32Array(total).fill(-1)
  const goalState = Array(disks).fill(goal)
  const g = encode(goalState, pegs)
  dist[g] = 0
  const queue = [goalState]
  for (let qi = 0; qi < queue.length; qi++) {
    const s = queue[qi]
    const ds = dist[encode(s, pegs)]
    for (let from = 0; from < pegs; from++) for (let to = 0; to < pegs; to++) {
      if (from === to) continue
      // Reverse search: a forward move to→from must be legal, i.e. from = to + 1 when cyclic.
      if (cyclic && from !== (to + 1) % pegs) continue
      if (adjacent && Math.abs(from - to) !== 1) continue
      const d = topOf(s, from)
      if (d < 0) continue
      const t = topOf(s, to)
      if (t >= 0 && t < d) continue
      const n = applyMove(s, from, to)
      const k = encode(n, pegs)
      if (dist[k] >= 0) continue
      dist[k] = ds + 1
      queue.push(n)
    }
  }
  return dist
}

/** A shortest sequence of moves from `state` to the goal tower. */
export function solve(p: HanoiPuzzle, state: number[] = p.start): Move[] {
  const dist = distancesToGoal(p.pegs, p.disks, p.cyclic, p.goal, !!p.adjacent)
  const path: Move[] = []
  let s = state
  while (!isSolved(p, s)) {
    const here = dist[encode(s, p.pegs)]
    let moved = false
    for (let from = 0; from < p.pegs && !moved; from++) for (let to = 0; to < p.pegs && !moved; to++) {
      if (moveProblem(p, s, from, to)) continue
      const n = applyMove(s, from, to)
      if (dist[encode(n, p.pegs)] === here - 1) { path.push([from, to]); s = n; moved = true }
    }
    if (!moved) throw new Error('unsolvable position')
  }
  return path
}

export function generatePuzzle(configId: string, difficulty: Difficulty, seed: number, params?: Record<string, unknown>): HanoiPuzzle {
  const cfg = resolveConfig(CONFIGS, configId, undefined, 'benares')
  const disks = typeof params?.disks === 'number' ? (params.disks as number) : scale(difficulty, cfg.disks)
  const rng = mulberry32(hashString(`hanoi:${configId}:${seed}`))
  let startPeg = Math.floor(rng() * cfg.pegs)
  let goal: number
  if (cfg.cyclic) {
    // One step clockwise or two (the longer journey): D1 and D4 one step, D3 the long way, D2 either.
    const step = scale(difficulty, [1, 1 + Math.floor(rng() * 2), 2, 1])
    goal = (startPeg + step) % cfg.pegs
  } else if (cfg.adjacent) {
    // To or from the middle peg (half the journey), or end to end (3ⁿ − 1).
    const endToEnd = scale(difficulty, [false, rng() < 0.5, true, false])
    const end = rng() < 0.5 ? 0 : cfg.pegs - 1
    if (endToEnd) { startPeg = end; goal = cfg.pegs - 1 - end }
    else if (rng() < 0.5) { startPeg = end; goal = 1 }
    else { startPeg = 1; goal = end }
  } else {
    goal = (startPeg + 1 + Math.floor(rng() * (cfg.pegs - 1))) % cfg.pegs
  }
  const cyclic = !!cfg.cyclic
  const adjacent = !!cfg.adjacent
  let start = Array(disks).fill(startPeg)
  if (cfg.scattered) {
    // A random legal position far from the goal: at least 70% of the worst case.
    const dist = distancesToGoal(cfg.pegs, disks, cyclic, goal, adjacent)
    const worst = Math.max(...dist)
    const far: number[] = []
    for (let k = 0; k < dist.length; k++) if (dist[k] >= Math.ceil(worst * 0.7)) far.push(k)
    // Prefer positions with disks on every peg, so it looks scattered.
    const decode = (k: number) => Array.from({ length: disks }, (_, i) => Math.floor(k / cfg.pegs ** i) % cfg.pegs)
    const spread = far.filter(k => new Set(decode(k)).size === cfg.pegs)
    const pool = spread.length ? spread : far
    start = decode(pool[Math.floor(rng() * pool.length)])
  }
  const p: HanoiPuzzle = { pegs: cfg.pegs, disks, cyclic, adjacent, start, goal, optimal: 0 }
  p.optimal = solve(p).length
  return p
}

export function capFor(difficulty: Difficulty, optimal: number): number {
  return scale(difficulty, [
    optimal * 2 + 6,
    optimal * 2,
    Math.ceil(optimal * 1.5) + 2,
    optimal + Math.max(3, Math.ceil(optimal * 0.2)),
  ])
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function HanoiGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = { ...resolveConfig(CONFIGS, configId, undefined, 'benares'), ...storyText(params) }
  const puzzle = useMemo(() => generatePuzzle(configId, difficulty, seed, params), [configId, difficulty, seed, params])
  const cap = capFor(difficulty, puzzle.optimal)

  const [state, setState] = useState<number[]>(puzzle.start)
  const [moves, setMoves] = useState(0)
  const [held, setHeld] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const live = useRef({ state, moves, settled })
  live.current = { state, moves, settled }

  useEffect(() => { setState(puzzle.start); setMoves(0); setHeld(null); setMessage(null) }, [puzzle])

  const tryMove = useCallback((from: number, to: number) => {
    const cur = live.current
    if (cur.settled) return
    const problem = moveProblem(puzzle, cur.state, from, to)
    if (problem) { if (from !== to) setMessage(problem); return }
    const next = applyMove(cur.state, from, to)
    const m = cur.moves + 1
    live.current = { ...cur, state: next, moves: m }
    setState(next); setMoves(m); setMessage(null)
    if (isSolved(puzzle, next)) { live.current.settled = true; win() }
    else if (m >= cap) { live.current.settled = true; lose('Out of moves before the tower was rebuilt') }
  }, [puzzle, cap, win, lose])

  const heldRef = useRef<number | null>(null)
  heldRef.current = held
  const tapPeg = useCallback((peg: number) => {
    if (live.current.settled) return
    const h = heldRef.current
    if (h === null) {
      const next = topOf(live.current.state, peg) >= 0 ? peg : null
      heldRef.current = next
      setHeld(next)
      return
    }
    heldRef.current = null
    setHeld(null)
    if (h !== peg) tryMove(h, peg)
  }, [tryMove])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const n = Number(e.key)
      if (n >= 1 && n <= puzzle.pegs) { e.preventDefault(); tapPeg(n - 1) }
      if (e.key === 'Escape') setHeld(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tapPeg, puzzle.pegs])

  // Drag: press on a peg, release over another.
  const drag = useRef<number | null>(null)
  const pegAt = (x: number, y: number): number | null => {
    const el = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null
    const peg = (el as HTMLElement | null)?.closest?.('[data-peg]')?.getAttribute('data-peg')
    return peg == null ? null : Number(peg)
  }

  const diskH = puzzle.disks >= 7 ? 14 : puzzle.disks >= 5 ? 18 : 22
  const height = (puzzle.disks + 1) * diskH + 18

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p className={`font-bold text-sm ${cap - moves <= 3 ? 'text-red-600' : 'text-ink-2'}`} data-testid="hanoi-moves">{moves} / {cap}</p>
          <p>moves</p>
          <p>best: {puzzle.optimal}</p>
        </div>
      </div>

      <div className="w-full max-w-[430px] mx-auto select-none rounded-lg border-2 border-ink-2 bg-panel shadow-md p-2"
        style={{ touchAction: 'none' }}>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${puzzle.pegs}, 1fr)` }}>
          {Array.from({ length: puzzle.pegs }, (_, peg) => {
            const stack = stackOf(state, peg)
            const isGoal = peg === puzzle.goal
            const lifted = held === peg
            return (
              <button key={peg} type="button" data-peg={peg} aria-label={`peg ${peg + 1}${isGoal ? ' (goal)' : ''}`}
                onPointerDown={e => { drag.current = peg; (e.target as HTMLElement).releasePointerCapture?.(e.pointerId) }}
                onPointerUp={e => {
                  const from = drag.current
                  drag.current = null
                  const to = pegAt(e.clientX, e.clientY)
                  if (from !== null && to !== null && to !== from) { setHeld(null); tryMove(from, to) }
                }}
                onClick={() => tapPeg(peg)}
                className={`relative flex flex-col-reverse items-center rounded-md transition-colors
                  ${lifted ? 'bg-accent/15' : isGoal ? 'bg-accent/[0.06]' : ''}`}
                style={{ height }}>
                {/* Base and pole */}
                <span className={`absolute bottom-0 left-[4%] right-[4%] h-2 rounded ${isGoal ? 'bg-accent' : 'bg-[#7a5a3a]'}`} />
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1.5 rounded-t bg-[#7a5a3a]" style={{ height: height - 14 }} />
                <span className="h-2 shrink-0" />
                {stack.map((d, k) => {
                  const top = k === stack.length - 1
                  const w = 26 + 74 * ((d + 1) / puzzle.disks)
                  return (
                    <span key={d} data-disk={d}
                      className={`relative z-10 shrink-0 rounded-md border border-black/25 shadow-sm transition-transform
                        ${top && lifted ? '-translate-y-3' : ''}`}
                      style={{ width: `${w}%`, height: diskH - 2, marginTop: 2, background: cfg.palette[d % cfg.palette.length] }} />
                  )
                })}
                {isGoal && <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 text-[10px] text-accent font-bold">★</span>}
              </button>
            )
          })}
        </div>
        {puzzle.cyclic && (
          <p className="text-[10px] text-center text-muted mt-1">↻ one way only: {Array.from({ length: puzzle.pegs }, (_, i) => i + 1).join(' → ')} → 1</p>
        )}
        {puzzle.adjacent && (
          <p className="text-[10px] text-center text-muted mt-1">⇄ neighbours only: {Array.from({ length: puzzle.pegs }, (_, i) => i + 1).join(' ↔ ')} — never 1 → {puzzle.pegs} directly</p>
        )}
      </div>

      {message && !settled && <p className="text-red-600 text-[11px] text-center font-bold" role="status">{message}</p>}
      <p className="text-muted/80 text-[10px] text-center">
        {settled ? '' : held !== null ? `Holding a disk from peg ${held + 1} — tap where it goes` : `Tap a peg, then another — or drag. Keys 1–${puzzle.pegs}.`}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle={moves === puzzle.optimal ? 'Perfect — in the fewest moves!' : 'The tower stands!'} loseTitle="Out of moves" />
    </div>
  )
}
