import { useMemo, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, shuffle, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Knight's Tour: ride a knight over every open square of the board exactly
// once.  Tap one of the highlighted squares to jump; visited squares keep
// their move number.  A dead end can be undone a limited number of times;
// stuck with no undos left, the tour is lost.
//
// Every instance (board, start square, ruined squares, closed or open) is
// checked by the exported solver before it is used: backtracking with
// Warnsdorff's rule (fewest onward moves first), then the same search with
// shuffled tie-breaks as a fallback.  An instance the solver cannot finish is
// discarded and the next candidate tried.
//
// Difficulty: bigger boards (to 8×8), closed tours or ruined squares at D4;
// D1 shows each target's onward-move count (Warnsdorff's numbers) and has
// free hints, D2 one hint, and the undo budget shrinks.

export interface TierSpec { rows: number; cols: number; start: 'corner' | 'any'; blocked: number; closed: boolean }

export interface TourConfig {
  title: string
  intro: string
  fact: string
  tiers: [TierSpec, TierSpec, TierSpec, TierSpec]
}

export const CONFIGS: Record<string, TourConfig> = {
  euler: {
    title: 'Euler’s Memoir, 1759',
    intro: 'Leonhard Euler studied the knight’s tour for the Berlin Academy. Visit every square once.',
    fact: 'Euler’s 1759 memoir to the Berlin Academy gave the first mathematical study of knight’s tours, including closed tours that end a knight’s move from the start.',
    tiers: [
      { rows: 5, cols: 5, start: 'corner', blocked: 0, closed: false },
      { rows: 6, cols: 6, start: 'any', blocked: 0, closed: false },
      { rows: 8, cols: 8, start: 'any', blocked: 0, closed: false },
      { rows: 8, cols: 8, start: 'any', blocked: 0, closed: true },
    ],
  },
  'al-adli': {
    title: 'The Shatranj Manuscripts',
    intro: 'Baghdad’s chess masters set knight’s-tour problems on boards of every shape. Ride the faras over the whole board.',
    fact: 'The oldest known knight’s tours appear in Arabic shatranj manuscripts of the 9th century, attributed to masters such as al-Adli and as-Suli.',
    tiers: [
      { rows: 4, cols: 5, start: 'any', blocked: 0, closed: false },
      { rows: 5, cols: 6, start: 'any', blocked: 0, closed: false },
      { rows: 7, cols: 7, start: 'any', blocked: 0, closed: false },
      { rows: 8, cols: 8, start: 'any', blocked: 4, closed: false },
    ],
  },
  turk: {
    title: 'The Mechanical Turk',
    intro: 'Kempelen’s chess automaton toured Europe dazzling crowds with the knight’s tour. Match its feat on a battered board.',
    fact: 'Wolfgang von Kempelen’s Turk (1770) amazed audiences by completing knight’s tours; it was really a hidden chess master working the arm.',
    tiers: [
      { rows: 5, cols: 5, start: 'any', blocked: 0, closed: false },
      { rows: 6, cols: 6, start: 'any', blocked: 2, closed: false },
      { rows: 8, cols: 8, start: 'any', blocked: 2, closed: false },
      { rows: 8, cols: 8, start: 'any', blocked: 6, closed: false },
    ],
  },
}

export const undosFor = (d: Difficulty) => scale(d, [6, 4, 3, 2])
export const hintsFor = (d: Difficulty) => scale(d, [99, 1, 0, 0])
export const showDegrees = (d: Difficulty) => d === 1

export interface Tour { rows: number; cols: number; blocked: number[]; start: number; closed: boolean }

const JUMPS: [number, number][] = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]

export function knightMoves(rows: number, cols: number, i: number): number[] {
  const r = Math.floor(i / cols), c = i % cols
  const out: number[] = []
  for (const [dr, dc] of JUMPS) {
    const rr = r + dr, cc = c + dc
    if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc)
  }
  return out
}

/** Legal next squares from the end of `path`. */
export function nextMoves(t: Tour, path: readonly number[]): number[] {
  const seen = new Set(path)
  const block = new Set(t.blocked)
  return knightMoves(t.rows, t.cols, path[path.length - 1]).filter(j => !seen.has(j) && !block.has(j))
}

export const openSquares = (t: Tour) => t.rows * t.cols - t.blocked.length

/** Is `path` a finished tour? */
export function isComplete(t: Tour, path: readonly number[]): boolean {
  if (path.length !== openSquares(t) || new Set(path).size !== path.length) return false
  const block = new Set(t.blocked)
  for (let k = 0; k < path.length; k++) {
    if (block.has(path[k])) return false
    if (k && !knightMoves(t.rows, t.cols, path[k - 1]).includes(path[k])) return false
  }
  return !t.closed || knightMoves(t.rows, t.cols, path[path.length - 1]).includes(path[0])
}

/**
 * Complete a tour from `prefix` (defaults to the start square): Warnsdorff
 * ordering with backtracking, giving up after `limit` nodes.  `rng` shuffles
 * tie-breaks for the fallback passes.
 */
export function solveTour(t: Tour, prefix: readonly number[] = [t.start], limit = 60_000, rng?: Rng): number[] | null {
  const { rows, cols } = t
  const N = rows * cols
  const total = openSquares(t)
  const used = new Uint8Array(N)
  for (const b of t.blocked) used[b] = 1
  for (const p of prefix) used[p] = 1
  const nbrs = Array.from({ length: N }, (_, i) => knightMoves(rows, cols, i))
  const tie = new Float64Array(N)
  const cr = (rows - 1) / 2, cc = (cols - 1) / 2
  for (let i = 0; i < N; i++) {
    const r = Math.floor(i / cols), c = i % cols
    // Prefer squares far from the centre (edges first), jittered when shuffling.
    tie[i] = -((r - cr) ** 2 + (c - cc) ** 2) + (rng ? rng() * 3 : 0)
  }
  const degree = (i: number) => { let d = 0; for (const j of nbrs[i]) if (!used[j]) d++; return d }
  const path = prefix.slice()
  const start = path[0]
  let nodes = 0
  const startFree = () => nbrs[start].some(j => !used[j])

  const dfs = (): boolean => {
    if (path.length === total) return !t.closed || nbrs[path[path.length - 1]].includes(start)
    if (++nodes > limit) return false
    const cur = path[path.length - 1]
    const cand: { j: number; d: number }[] = []
    for (const j of nbrs[cur]) if (!used[j]) cand.push({ j, d: degree(j) })
    if (!cand.length) return false
    cand.sort((a, b) => a.d - b.d || tie[a.j] - tie[b.j])
    for (const { j, d } of cand) {
      // A square with no exits can only be the last one.
      if (d === 0 && path.length + 1 !== total) continue
      used[j] = 1; path.push(j)
      // A closed tour must keep a free square next to the start to finish on.
      const ok = !t.closed || path.length === total || startFree()
      if (ok && dfs()) return true
      used[j] = 0; path.pop()
      if (nodes > limit) return false
    }
    return false
  }
  return dfs() ? path : null
}

/** The solver plus fallback passes with shuffled tie-breaks. */
export function findTour(t: Tour, prefix: readonly number[] = [t.start], limit = 60_000, passes = 4): number[] | null {
  const first = solveTour(t, prefix, limit)
  if (first) return first
  for (let k = 1; k < passes; k++) {
    const p = solveTour(t, prefix, limit, mulberry32(hashString(`kt:${k}:${prefix.length}:${prefix[prefix.length - 1]}`)))
    if (p) return p
  }
  return null
}

/** Build the level's board from the config tier and seed, verified solvable. */
export function makeTour(configId: string, config: TourConfig, d: Difficulty, seed: number): { tour: Tour; solution: number[] } {
  const spec = config.tiers[d - 1]
  const { rows, cols } = spec
  const N = rows * cols
  const rng = mulberry32(seed ^ hashString(`knightstour:${configId}:${d}`))
  const corners = [0, cols - 1, (rows - 1) * cols, N - 1]
  for (let attempt = 0; attempt < 40; attempt++) {
    const start = spec.start === 'corner' ? corners[Math.floor(rng() * 4)] : Math.floor(rng() * N)
    const pool = shuffle(Array.from({ length: N }, (_, i) => i).filter(i => i !== start), rng)
    const blocked = pool.slice(0, spec.blocked).sort((a, b) => a - b)
    const tour: Tour = { rows, cols, blocked, start, closed: spec.closed }
    const solution = findTour(tour, [start], 40_000, 2)
    if (solution) return { tour, solution }
  }
  // Fallback: a plain open tour from the corner always exists on these boards.
  const tour: Tour = { rows, cols, blocked: [], start: 0, closed: spec.closed }
  const solution = findTour(tour, [0], 500_000, 6)!
  return { tour, solution }
}

/** A next square from which the solver can still finish, else Warnsdorff's pick. */
export function hintMove(t: Tour, path: readonly number[]): number | null {
  const moves = nextMoves(t, path)
  if (!moves.length) return null
  const deg = (j: number) => nextMoves(t, [...path, j]).length
  const ordered = [...moves].sort((a, b) => deg(a) - deg(b))
  for (const j of ordered) if (findTour(t, [...path, j], 8000, 2)) return j
  return ordered[0]
}

const FILES = 'abcdefghij'

export default function KnightsTourGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'euler')
  const { tour } = useMemo(() => makeTour(configId, config, difficulty, seed), [configId, config, difficulty, seed])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const [path, setPath] = useState<number[]>([tour.start])
  const [undos, setUndos] = useState(undosFor(difficulty))
  const [hints, setHints] = useState(hintsFor(difficulty))
  const [hint, setHint] = useState<number | null>(null)
  const [note, setNote] = useState(config.intro + (tour.closed ? ' Finish a knight’s move from where you began.' : ''))

  const { rows, cols } = tour
  const blocked = useMemo(() => new Set(tour.blocked), [tour])
  const moves = useMemo(() => nextMoves(tour, path), [tour, path])
  const total = openSquares(tour)
  const order = useMemo(() => { const m = new Map<number, number>(); path.forEach((p, k) => m.set(p, k + 1)); return m }, [path])
  const cur = path[path.length - 1]
  const full = path.length === total
  const stuck = !settled && (full ? !isComplete(tour, path) : moves.length === 0)

  const jump = (j: number) => {
    if (settled || !moves.includes(j)) return
    const next = [...path, j]
    setPath(next)
    setHint(null)
    if (isComplete(tour, next)) { setNote('Every square visited — the tour is complete!'); win(); return }
    const dead = next.length === total || nextMoves(tour, next).length === 0
    if (dead) {
      const why = next.length === total ? 'All squares visited, but the knight can’t return to the start.' : `Dead end — ${total - next.length} square${total - next.length === 1 ? '' : 's'} left unvisited.`
      if (undos <= 0) { setNote(why); lose('the knight is trapped'); return }
      setNote(`${why} Undo to find another route.`)
      return
    }
    setNote(`${next.length} / ${total} squares.`)
  }

  const undo = () => {
    if (settled || undos <= 0 || path.length <= 1) return
    setPath(path.slice(0, -1))
    setUndos(undos - 1)
    setHint(null)
    setNote(`Took back a move. ${undos - 1} undo${undos - 1 === 1 ? '' : 's'} left.`)
  }

  const askHint = () => {
    if (settled || hints <= 0 || stuck) return
    const h = hintMove(tour, path)
    if (h === null) return
    setHint(h)
    setHints(hints - 1)
    setNote('Warnsdorff’s rule: jump where the knight will have the fewest onward moves.')
  }

  const giveUp = () => { if (!settled) lose('the knight is trapped') }
  const square = (i: number) => `${FILES[i % cols]}${rows - Math.floor(i / cols)}`

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      <div className="rounded-xl border border-line bg-panel px-3 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent truncate">{config.title}</p>
          <p className="text-ink text-sm font-semibold leading-tight">
            {rows}×{cols}{tour.blocked.length ? ` · ${tour.blocked.length} ruined` : ''}{tour.closed ? ' · closed tour' : ''}
          </p>
        </div>
        <p className="text-xs font-bold tabular-nums text-ink-2 shrink-0" data-testid="progress">{path.length} / {total}</p>
      </div>

      <div className="flex justify-center">
        <div
          className="grid w-full max-w-[400px] rounded-lg overflow-hidden border-2 border-[#5b3a1e] shadow-md"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, aspectRatio: `${cols} / ${rows}`, containerType: 'inline-size' }}
          data-testid="tour-board"
        >
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols), c = i % cols
            const light = (r + c) % 2 === 0
            const isBlocked = blocked.has(i)
            const k = order.get(i)
            const isCur = i === cur
            const target = moves.includes(i)
            const isHint = hint === i
            const fs = `calc(100cqw / ${cols} * 0.36)`
            let bg = light ? 'bg-[#f0d9b5]' : 'bg-[#b58863]'
            if (k && !isCur) bg = light ? 'bg-[#e3c48f]' : 'bg-[#9c7048]'
            if (isBlocked) bg = 'bg-[#3b2a1d]'
            return (
              <button
                key={i}
                data-sq={i}
                data-target={target ? '1' : undefined}
                aria-label={`${square(i)}${isBlocked ? ' ruined' : k ? ` visited ${k}` : ''}`}
                onClick={() => jump(i)}
                className={`relative aspect-square ${bg} ${isHint ? 'ring-4 ring-inset ring-emerald-500' : ''}`}
              >
                {isBlocked && <span className="absolute inset-0 flex items-center justify-center text-[#7a5a3c]" style={{ fontSize: fs }}>✕</span>}
                {k && !isCur && <span className="absolute inset-0 flex items-center justify-center font-bold text-[#3b2410]/80 tabular-nums" style={{ fontSize: fs }}>{k}</span>}
                {tour.closed && i === tour.start && !isCur && <span className="absolute inset-[8%] rounded-full border-2 border-accent/80" />}
                {isCur && (
                  <span className="absolute inset-0 flex items-center justify-center leading-none" style={{ fontSize: `calc(100cqw / ${cols} * 0.72)`, color: '#1c1612', textShadow: '0 0 2px #fff8' }}>♞{'︎'}</span>
                )}
                {target && (
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[42%] h-[42%] rounded-full bg-accent/70 text-accent-fg flex items-center justify-center font-bold" style={{ fontSize: `calc(100cqw / ${cols} * 0.26)` }}>
                    {showDegrees(difficulty) ? nextMoves(tour, [...path, i]).length : ''}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 min-h-[2.5rem]">
        <p className={`text-xs leading-snug ${stuck ? 'text-red-700 font-bold' : 'text-ink-2'}`} role="status">{note}</p>
        <div className="flex gap-1.5 shrink-0">
          {hintsFor(difficulty) > 0 && (
            <button onClick={askHint} disabled={settled || hints <= 0 || stuck}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-panel border border-line text-ink disabled:opacity-40">
              Hint{hintsFor(difficulty) < 99 ? ` (${hints})` : ''}
            </button>
          )}
          <button onClick={undo} disabled={settled || undos <= 0 || path.length <= 1} data-testid="undo"
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-accent text-accent-fg disabled:opacity-40">
            Undo ({undos})
          </button>
          {stuck && undos > 0 && (
            <button onClick={giveUp} className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-panel border border-line text-ink">Give up</button>
          )}
        </div>
      </div>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="Tour complete!" loseTitle="The knight is trapped" />
    </div>
  )
}

export const CONFIG_IDS = Object.keys(CONFIGS)
