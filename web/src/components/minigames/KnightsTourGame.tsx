import { useMemo, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, shuffle, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Knight's Tour: ride a leaper over every open square of the board exactly
// once.  Tap one of the highlighted squares to jump; visited squares keep
// their move number.  A dead end can be undone a limited number of times;
// stuck with no undos left, the tour is lost.
//
// Each config is its own rule twist:
//
//   euler      closed tour — the last jump must land a knight's move from the start
//   al-adli    waypoints — numbered squares must be visited in order 1, 2, 3…
//   turk       ruined squares — holes in the board the knight may not land on
//   tamerlane  the camel, a (3,1) leaper from Timur's great chess: it never
//              leaves its colour, so it tours only the squares of one colour
//
// Every instance is checked by the exported solver before it is used:
// backtracking with Warnsdorff's rule (fewest onward moves first), then the
// same search with shuffled tie-breaks as a fallback.  Waypoints are taken
// from a solved tour, so the solver's own tour already visits them in order.
//
// Time budget: about two seconds a jump.  D1 boards have 18–26 squares to
// visit (about a minute, with Warnsdorff's onward-move counts shown) and no
// level has more than 40 (≈ 1½–2½ minutes) — a full 8×8 knight's tour (64
// jumps) is too long.  Undos shrink with difficulty; D1 has free hints, D2 one.

export interface TierSpec {
  rows: number
  cols: number
  start: 'corner' | 'any'
  /** Ruined squares (for a closed tour, half on each colour). */
  blocked: number
  /** Numbered squares to visit in order. */
  waypoints?: number
}

export type TourRule = 'closed' | 'waypoints' | 'ruins' | 'camel'

export interface TourConfig {
  title: string
  /** The rule twist in a few words, shown on the board header. */
  twist: string
  intro: string
  fact: string
  rule: TourRule
  tiers: [TierSpec, TierSpec, TierSpec, TierSpec]
}

export const CONFIGS: Record<string, TourConfig> = {
  euler: {
    title: 'Euler’s Memoir, 1759',
    twist: 'closed tour',
    rule: 'closed',
    intro: 'Euler prized the re-entrant tour. Visit every square once — and finish a knight’s move from where you began (the ringed square).',
    fact: 'Euler’s 1759 memoir to the Berlin Academy gave the first mathematical study of knight’s tours, including closed tours that end a knight’s move from the start.',
    tiers: [
      { rows: 5, cols: 6, start: 'any', blocked: 4 },
      { rows: 5, cols: 6, start: 'any', blocked: 0 },
      { rows: 6, cols: 6, start: 'any', blocked: 2 },
      { rows: 6, cols: 6, start: 'any', blocked: 0 },
    ],
  },
  'al-adli': {
    title: 'The Shatranj Manuscripts',
    twist: 'waypoints in order',
    rule: 'waypoints',
    intro: 'The masters of Baghdad set their tours a path to follow. Visit every square once, landing on the numbered squares in order — 1, then 2, then 3. A numbered square cannot be entered early.',
    fact: 'The oldest known knight’s tours appear in Arabic shatranj manuscripts of the 9th century, attributed to masters such as al-Adli and as-Suli.',
    tiers: [
      { rows: 5, cols: 5, start: 'corner', blocked: 0, waypoints: 2 },
      { rows: 5, cols: 6, start: 'any', blocked: 0, waypoints: 3 },
      { rows: 6, cols: 6, start: 'any', blocked: 0, waypoints: 3 },
      { rows: 6, cols: 6, start: 'any', blocked: 0, waypoints: 4 },
    ],
  },
  'lucena-1497': {
    title: 'Lucena’s Book, Salamanca 1497',
    twist: 'waypoints in order',
    rule: 'waypoints',
    intro: 'A chess book printed for the heir of Castile and Aragon sets the knight a path to follow. Visit every square once, landing on the numbered squares in order — 1, then 2, then 3. A numbered square cannot be entered early.',
    fact: 'Luis Ramírez de Lucena’s Repetición de amores y arte de ajedrez (Salamanca, c. 1497), dedicated to Prince Juan, son of Isabel and Ferdinand, is the oldest surviving printed chess book — and one of the first to teach the new game in which the queen sweeps the whole board.',
    tiers: [
      { rows: 5, cols: 5, start: 'corner', blocked: 0, waypoints: 2 },
      { rows: 5, cols: 6, start: 'any', blocked: 0, waypoints: 3 },
      { rows: 6, cols: 6, start: 'any', blocked: 0, waypoints: 3 },
      { rows: 6, cols: 6, start: 'any', blocked: 0, waypoints: 4 },
    ],
  },
  'janggi-horse': {
    title: 'The Janggi Horse',
    twist: 'closed tour',
    rule: 'closed',
    intro: 'In janggi the horse moves one point straight and one aslant — the knight’s move. Visit every point once, and finish a horse’s move from where you began (the ringed square), like a patrol that comes home.',
    fact: 'Janggi, Korean chess, grew from Chinese xiangqi and was played in Joseon Korea by scholars and soldiers alike. Its horse moves one point orthogonally and then one diagonally, though unlike the European knight it can be blocked by a piece in the way.',
    tiers: [
      { rows: 5, cols: 6, start: 'any', blocked: 4 },
      { rows: 5, cols: 6, start: 'any', blocked: 0 },
      { rows: 6, cols: 6, start: 'any', blocked: 2 },
      { rows: 6, cols: 6, start: 'any', blocked: 0 },
    ],
  },
  turk: {
    title: 'The Mechanical Turk',
    twist: 'ruined squares',
    rule: 'ruins',
    intro: 'Kempelen’s automaton toured Europe on a battered board. Visit every sound square once — the ruined squares (✕) cannot be landed on, though the knight may leap over them.',
    fact: 'Wolfgang von Kempelen’s Turk (1770) amazed audiences by completing knight’s tours; it was really a hidden chess master working the arm.',
    tiers: [
      { rows: 5, cols: 5, start: 'any', blocked: 3 },
      { rows: 5, cols: 6, start: 'any', blocked: 3 },
      { rows: 6, cols: 6, start: 'any', blocked: 4 },
      { rows: 6, cols: 7, start: 'any', blocked: 4 },
    ],
  },
  tamerlane: {
    title: 'Timur’s Camel',
    twist: 'camel (3,1) leaper',
    rule: 'camel',
    intro: 'In Tamerlane’s great chess the camel leaps three squares and one to the side. It never changes colour — so tour every square of its own colour, once each.',
    fact: 'Tamerlane chess, played at the court of Timur in the 14th century on a 10×11 board, added the camel, giraffe, war engines and more to the shatranj army. The camel’s (3,1) leap keeps it forever on one colour, like a bishop.',
    tiers: [
      { rows: 6, cols: 6, start: 'any', blocked: 0 },
      { rows: 7, cols: 7, start: 'any', blocked: 0 },
      { rows: 8, cols: 8, start: 'any', blocked: 0 },
      { rows: 8, cols: 10, start: 'any', blocked: 0 },
    ],
  },
}

export const undosFor = (d: Difficulty) => scale(d, [6, 4, 3, 2])
export const hintsFor = (d: Difficulty) => scale(d, [99, 1, 0, 0])
export const showDegrees = (d: Difficulty) => d === 1

export interface Tour {
  rows: number
  cols: number
  blocked: number[]
  start: number
  closed: boolean
  /** The leap, default the knight's (1,2). */
  leap?: [number, number]
  /** Squares to visit in this order. */
  waypoints?: number[]
}

export const KNIGHT: [number, number] = [1, 2]
export const CAMEL: [number, number] = [1, 3]

function jumpsOf([a, b]: [number, number]): [number, number][] {
  const out: [number, number][] = []
  for (const [x, y] of [[a, b], [b, a]]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) out.push([sx * x, sy * y])
  return out
}

export function leaperMoves(rows: number, cols: number, i: number, leap: [number, number] = KNIGHT): number[] {
  const r = Math.floor(i / cols), c = i % cols
  const out: number[] = []
  for (const [dr, dc] of jumpsOf(leap)) {
    const rr = r + dr, cc = c + dc
    if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc)
  }
  return out
}

export const knightMoves = (rows: number, cols: number, i: number) => leaperMoves(rows, cols, i, KNIGHT)
const movesOf = (t: Tour, i: number) => leaperMoves(t.rows, t.cols, i, t.leap ?? KNIGHT)

/** Legal next squares from the end of `path`: unvisited, not ruined, and no waypoint out of turn. */
export function nextMoves(t: Tour, path: readonly number[]): number[] {
  const seen = new Set(path)
  const block = new Set(t.blocked)
  const wps = t.waypoints ?? []
  const due = wps.length ? wps[path.filter(p => wps.includes(p)).length] : undefined
  return movesOf(t, path[path.length - 1]).filter(j => !seen.has(j) && !block.has(j) && (!wps.includes(j) || j === due))
}

export const openSquares = (t: Tour) => t.rows * t.cols - t.blocked.length

/** Is `path` a finished tour? */
export function isComplete(t: Tour, path: readonly number[]): boolean {
  if (path.length !== openSquares(t) || new Set(path).size !== path.length) return false
  const block = new Set(t.blocked)
  for (let k = 0; k < path.length; k++) {
    if (block.has(path[k])) return false
    if (k && !movesOf(t, path[k - 1]).includes(path[k])) return false
  }
  const wps = t.waypoints ?? []
  if (path.filter(p => wps.includes(p)).join() !== wps.join()) return false
  return !t.closed || movesOf(t, path[path.length - 1]).includes(path[0])
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
  const nbrs = Array.from({ length: N }, (_, i) => movesOf(t, i))
  const wps = t.waypoints ?? []
  const wpIndex = new Int32Array(N).fill(-1)
  wps.forEach((w, k) => { wpIndex[w] = k })
  let due = prefix.filter(p => wpIndex[p] >= 0).length
  if (prefix.filter(p => wpIndex[p] >= 0).some((p, k) => wpIndex[p] !== k)) return null
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
    for (const j of nbrs[cur]) if (!used[j] && (wpIndex[j] < 0 || wpIndex[j] === due)) cand.push({ j, d: degree(j) })
    if (!cand.length) return false
    cand.sort((a, b) => a.d - b.d || tie[a.j] - tie[b.j])
    for (const { j, d } of cand) {
      // A square with no exits can only be the last one.
      if (d === 0 && path.length + 1 !== total) continue
      used[j] = 1; path.push(j)
      const wp = wpIndex[j] >= 0
      if (wp) due++
      // A closed tour must keep a free square next to the start to finish on.
      const ok = !t.closed || path.length === total || startFree()
      if (ok && dfs()) return true
      used[j] = 0; path.pop()
      if (wp) due--
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
  const closed = config.rule === 'closed'
  const camel = config.rule === 'camel'
  const leap = camel ? CAMEL : KNIGHT
  const colour = (i: number) => (Math.floor(i / cols) + (i % cols)) % 2
  const rng = mulberry32(seed ^ hashString(`knightstour:${configId}:${d}`))
  const corners = [0, cols - 1, (rows - 1) * cols, N - 1]
  const build = (start: number, ruins: number[], limit: number, passes: number) => {
    // The camel never leaves its colour: the other colour is off its board.
    const offColour = camel ? Array.from({ length: N }, (_, i) => i).filter(i => colour(i) !== colour(start)) : []
    const blocked = [...ruins, ...offColour].sort((a, b) => a - b)
    const tour: Tour = { rows, cols, blocked, start, closed, ...(camel ? { leap } : {}) }
    const solution = findTour(tour, [start], limit, passes)
    if (!solution) return null
    if (spec.waypoints) {
      // Waypoints from the solved tour, spread along it, so the order is achievable.
      const L = solution.length, k = spec.waypoints
      const idx: number[] = []
      for (let w = 0; w < k; w++) {
        const lo = Math.floor(2 + (w * (L - 3)) / k), hi = Math.floor(2 + ((w + 1) * (L - 3)) / k) - 1
        idx.push(lo + Math.floor(rng() * Math.max(1, hi - lo)))
      }
      tour.waypoints = idx.map(x => solution[x])
    }
    return { tour, solution }
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    const start = spec.start === 'corner' ? corners[Math.floor(rng() * 4)] : Math.floor(rng() * N)
    const pool = shuffle(Array.from({ length: N }, (_, i) => i).filter(i => i !== start), rng)
    let ruins: number[]
    if (closed && spec.blocked) {
      // A closed tour alternates colours, so remove as many of each.
      const half = spec.blocked / 2
      ruins = [...pool.filter(i => colour(i) === 0).slice(0, half), ...pool.filter(i => colour(i) === 1).slice(0, half)]
    } else ruins = pool.slice(0, spec.blocked)
    const made = build(start, ruins, 40_000, 2)
    if (made) return made
  }
  // Fallback: every start square in turn on the unruined board, with a deeper search.
  for (let start = 0; start < N; start++) {
    const made = build(start, [], 500_000, 6)
    if (made) return made
  }
  throw new Error(`no tour for ${configId}@${d}`)
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
  const [note, setNote] = useState(config.intro)
  const camel = config.rule === 'camel'
  const piece = camel ? 'camel' : 'knight'
  const wps = tour.waypoints ?? []

  const { rows, cols } = tour
  const blocked = useMemo(() => new Set(tour.blocked), [tour])
  const offColour = (i: number) => camel && (Math.floor(i / cols) + (i % cols)) % 2 !== (Math.floor(tour.start / cols) + (tour.start % cols)) % 2
  const ruins = tour.blocked.filter(i => !offColour(i)).length
  const due = wps.find(w => !path.includes(w))
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
      const why = next.length === total
        ? (tour.closed ? 'All squares visited, but the knight can’t return to the start.' : 'All squares visited, but the waypoints were taken out of order.')
        : `Dead end — ${total - next.length} square${total - next.length === 1 ? '' : 's'} left unvisited.`
      if (undos <= 0) { setNote(why); lose(`the ${piece} is trapped`); return }
      setNote(`${why} Undo to find another route.`)
      return
    }
    const nextDue = wps.find(w => !next.includes(w))
    setNote(`${next.length} / ${total} squares.${nextDue !== undefined ? ` Next waypoint: ${wps.indexOf(nextDue) + 1}.` : ''}${tour.closed && next.length > total - 4 ? ' Head back towards the ringed start square.' : ''}`)
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
    setNote(`Warnsdorff’s rule: jump where the ${piece} will have the fewest onward moves.`)
  }

  const giveUp = () => { if (!settled) lose(`the ${piece} is trapped`) }
  const square = (i: number) => `${FILES[i % cols]}${rows - Math.floor(i / cols)}`

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      <div className="rounded-xl border border-line bg-panel px-3 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent truncate">{config.title}</p>
          <p className="text-ink text-sm font-semibold leading-tight">
            {rows}×{cols} · {config.twist}{ruins ? ` · ${ruins} ruined` : ''}{due !== undefined ? ` · next ${wps.indexOf(due) + 1}` : ''}
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
            if (isBlocked) bg = offColour(i) ? 'bg-[#6b5847]' : 'bg-[#3b2a1d]'
            const wp = wps.indexOf(i)
            return (
              <button
                key={i}
                data-sq={i}
                data-target={target ? '1' : undefined}
                data-wp={wp >= 0 ? wp + 1 : undefined}
                aria-label={`${square(i)}${isBlocked ? (offColour(i) ? ' out of reach' : ' ruined') : k ? ` visited ${k}` : wp >= 0 ? ` waypoint ${wp + 1}` : ''}`}
                onClick={() => jump(i)}
                className={`relative aspect-square ${bg} ${isHint ? 'ring-4 ring-inset ring-emerald-500' : ''}`}
              >
                {isBlocked && !offColour(i) && <span className="absolute inset-0 flex items-center justify-center text-[#7a5a3c]" style={{ fontSize: fs }}>✕</span>}
                {k && !isCur && <span className="absolute inset-0 flex items-center justify-center font-bold text-[#3b2410]/80 tabular-nums" style={{ fontSize: fs }}>{k}</span>}
                {tour.closed && i === tour.start && !isCur && <span className="absolute inset-[8%] rounded-full border-2 border-accent/80" />}
                {wp >= 0 && !k && (
                  <span className={`absolute inset-[10%] rounded-md border-2 flex items-center justify-center font-black ${i === due ? 'border-emerald-700 text-emerald-800' : 'border-[#3b2410]/50 text-[#3b2410]/60'}`} style={{ fontSize: fs }}>{wp + 1}</span>
                )}
                {isCur && (
                  <span className="absolute inset-0 flex items-center justify-center leading-none" style={{ fontSize: `calc(100cqw / ${cols} * 0.72)`, color: '#1c1612', textShadow: '0 0 2px #fff8' }}>{camel ? '🐫' : `♞${'︎'}`}</span>
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

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="Tour complete!" loseTitle={`The ${piece} is trapped`} />
    </div>
  )
}

export const CONFIG_IDS = Object.keys(CONFIGS)
