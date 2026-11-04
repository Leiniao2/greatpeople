import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, hashString, resolveConfig, scale, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar } from './_shared'

// Tangram: the seven boards of the qiqiao ban — two large, one medium and two
// small triangles, a square and a parallelogram — fitted to a silhouette.
//
// Geometry: the small triangle's legs are one grid unit. In the orientations
// used here (multiples of 90° from each piece's base, plus the mirrored
// parallelogram) every vertex lands on the integer grid and every edge is a
// grid line or a cell diagonal, so each piece is exactly a set of cell
// quarters (the four triangles a cell's two diagonals cut it into). A puzzle
// is solved when the pieces cover the silhouette's quarters exactly once.
//
// Every silhouette is authored as a solution (seven placements), so its
// outline is derived from a known tiling and is always solvable. A seed picks
// one of the config's silhouettes and may mirror it.
//
//   D1  faint outline of every piece in the silhouette   2:00
//   D2  outlines of the two large and the medium triangle 2:30
//   D3  silhouette only, pieces start turned              3:00
//   D4  silhouette only, pieces start turned, twist at its tightest  3:00
//
// Time budget: seven pieces take an engaged player about a minute with the
// D1 outlines, two to three without; the clock never allows more than 3:00.
//
// Each config adds its own rule twist (see TWISTS):
//   song-scholar  memory   — the silhouette is shown, then hidden; a few short peeks
//   junk-ship     lacquer  — a board left wholly inside the outline sets fast
//                            when you pick up another; prying one loose is rationed
//   pagoda        turns    — every quarter-turn or flip spends from a small budget
//   menagerie     decoy    — an eighth board is in the tray; one board is left over
//
// Drag a piece to move it (it snaps to the grid); tap it to turn it 90°. The
// control bar turns, flips (parallelogram) and nudges the selected piece.

interface TangramConfig {
  title: string
  intro: string
  fact: string
  /** Silhouette keys from SILHOUETTES. */
  shapes: string[]
  /** The rule twist. */
  twist?: Twist
}

export type Twist = 'memory' | 'lacquer' | 'turns' | 'decoy'

/** Per-difficulty knobs for each twist. */
export const TWISTS = {
  /** Seconds the silhouette is shown at the start, peeks allowed, seconds per peek. */
  memory: (d: Difficulty) => ({ showSeconds: scale(d, [20, 15, 10, 8]), peeks: scale(d, [3, 2, 1, 1]), peekSeconds: 3 }),
  /** Boards that may be pried loose again. */
  lacquer: (d: Difficulty) => ({ pries: scale(d, [3, 2, 1, 1]) }),
  /** Spare turns above the fewest the puzzle needs. */
  turns: (d: Difficulty) => ({ spare: scale(d, [6, 4, 2, 1]) }),
}

export const CONFIGS: Record<string, TangramConfig> = {
  'song-scholar': {
    title: 'The Scholar’s Seven Boards',
    intro: 'A test of the scholar’s memory: study the silhouette while it is shown — it then fades, and you must fill it from memory with all seven boards. A few short peeks are allowed.',
    twist: 'memory',
    fact: 'In the Song dynasty Huang Bosi designed sets of banquet tables (yanji tu) that could be rearranged into many shapes — often named as an ancestor of the tangram, whose seven-piece form first appears in Chinese books around 1800.',
    shapes: ['person', 'sage', 'kneeling', 'chair', 'table', 'teapot', 'inkstone', 'kite', 'square'],
  },
  'junk-ship': {
    title: 'Canton Harbour',
    intro: 'Freshly lacquered boards: a board left wholly inside the outline sets fast as soon as you pick up another. Place each one with care — only a few can be pried loose again.',
    twist: 'lacquer',
    fact: 'Tangrams reached Europe and America on trading ships from Canton around 1815–1817 and set off a craze; puzzle books of “the Chinese puzzle” sold in London, Paris and Philadelphia.',
    shapes: ['junk', 'sampan', 'two-master', 'moon-bridge', 'carp'],
  },
  'pagoda': {
    title: 'Temples and Towers',
    intro: 'The mason’s boards are heavy: every quarter-turn or flip spends one turn from a small budget. Plan each board’s turns before you build the temple.',
    twist: 'turns',
    fact: 'The Iron Pagoda of Kaifeng, built in 1049 under the Song, is clad in glazed brick the colour of iron and has survived nearly a thousand years of floods and earthquakes.',
    shapes: ['house', 'stupa', 'pagoda', 'tiered-pagoda', 'pailou', 'pine', 'twin-peaks', 'stele', 'altar'],
  },
  'menagerie': {
    title: 'The Seven-Board Menagerie',
    intro: 'A stray eighth board has crept into the tray. Fill the creature’s silhouette exactly — one board will be left over in the tray.',
    twist: 'decoy',
    fact: 'The name qiqiao ban means “seven boards of skill.” Qing-era books such as the Qiqiao tu he bi (1813) printed hundreds of figures — people, animals, boats and buildings — with the solutions in a separate volume.',
    shapes: ['crane', 'cat', 'rabbit', 'horse', 'carp'],
  },
}

// ── Pieces ─────────────────────────────────────────────────────────────────────

export type Kind = 'L' | 'M' | 'S' | 'Q' | 'P'
type Pt = [number, number]

/** Base polygons, y down. L/M/S triangles, Q square, P parallelogram. */
const BASE: Record<Kind, Pt[]> = {
  L: [[0, 0], [2, 0], [0, 2]],
  M: [[0, 0], [2, 0], [1, 1]],
  S: [[0, 0], [1, 0], [0, 1]],
  Q: [[0, 0], [1, 0], [1, 1], [0, 1]],
  P: [[0, 0], [1, 0], [2, 1], [1, 1]],
}

/** The seven pieces, in a fixed order. */
export const SET: Kind[] = ['L', 'L', 'M', 'S', 'S', 'Q', 'P']

export interface Placement { kind: Kind; rot: number; flip: boolean; x: number; y: number }

/** Polygon of a piece turned `rot` quarter-turns clockwise (after an optional mirror), with its box at 0,0. */
export function orient(kind: Kind, rot: number, flip: boolean): Pt[] {
  let pts = BASE[kind].map(([x, y]) => [flip ? -x : x, y] as Pt)
  for (let k = 0; k < ((rot % 4) + 4) % 4; k++) pts = pts.map(([x, y]) => [-y, x] as Pt)
  const mx = Math.min(...pts.map(p => p[0])), my = Math.min(...pts.map(p => p[1]))
  return pts.map(([x, y]) => [x - mx, y - my] as Pt)
}

export function polygonOf(p: Placement): Pt[] {
  return orient(p.kind, p.rot, p.flip).map(([x, y]) => [x + p.x, y + p.y] as Pt)
}

export function boxOf(p: Pick<Placement, 'kind' | 'rot' | 'flip'>): { w: number; h: number } {
  const pts = orient(p.kind, p.rot, p.flip)
  return { w: Math.max(...pts.map(q => q[0])), h: Math.max(...pts.map(q => q[1])) }
}

function inside(poly: Pt[], px: number, py: number): boolean {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[j]
    if ((y1 > py) !== (y2 > py) && px < x1 + ((py - y1) * (x2 - x1)) / (y2 - y1)) c = !c
  }
  return c
}

// Quarter centroids: top, right, bottom, left.
const CENTROIDS: Pt[] = [[0.5, 1 / 6], [5 / 6, 0.5], [0.5, 5 / 6], [1 / 6, 0.5]]

/** Quarter keys `x,y,q` covered by a lattice polygon. */
export function quartersOf(poly: Pt[]): string[] {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1])
  const out: string[] = []
  for (let y = Math.floor(Math.min(...ys)); y < Math.max(...ys); y++) {
    for (let x = Math.floor(Math.min(...xs)); x < Math.max(...xs); x++) {
      CENTROIDS.forEach(([cx, cy], q) => { if (inside(poly, x + cx, y + cy)) out.push(`${x},${y},${q}`) })
    }
  }
  return out
}

// ── Silhouettes ────────────────────────────────────────────────────────────────

// Each silhouette is a solution: `<kind><rot>[f]@x,y` per piece. The comment
// shows the outline, one character per cell: # full, ◤◥◢◣ half cells.
const SOLUTIONS: Record<string, { name: string; sol: string }> = {
  person:        { name: 'a standing scholar',   sol: 'S0@1,0 L2@0,0 P1f@2,1 L0@0,2 M2@1,2 S2@0,3 Q0@2,3' },        // .#. ◢#◣ ### #.#
  sage:          { name: 'a seated sage',        sol: 'Q0@1,0 M1@0,1 L0@1,1 L2@1,1 P1f@3,1 S3@0,2 S3@3,2' },        // .#.. ◢##◣ ####
  kneeling:      { name: 'a kneeling servant',   sol: 'S0@0,0 S2@0,0 L0@0,1 L2@0,1 Q0@2,2 M2@0,3 P0@1,3' },         // #.. ##. ### ◢#◣
  chair:         { name: 'a scholar’s chair',    sol: 'S0@0,0 M1@0,0 L3@0,1 P0@1,2 L1@2,2 Q0@0,3 S3@3,3' },         // #... #... #### #..#
  table:         { name: 'a banquet table',      sol: 'L0@0,0 M2@1,0 L1@2,0 S2@0,1 P1f@3,1 Q0@0,2 S3@3,2' },        // #### #..# #..#
  teapot:        { name: 'a teapot',             sol: 'Q0@2,0 L0@1,1 L2@1,1 S0@3,1 M1@3,1 P1@4,1 S3@3,2' },         // ..#.. .###◢ .###◤
  inkstone:      { name: 'an inkstone',          sol: 'M1@0,0 L0@1,0 L2@1,0 Q0@3,0 S3@4,0 S0@3,1 P0f@3,1' },        // ◢###◣ ◥###◤
  kite:          { name: 'a kite',               sol: 'L2@0,0 L3@2,0 M0@1,2 S0@1,3 P1@1,3 Q0@0,4 S2@1,4' },         // .◢◣. ◢##◣ .◥◤. .#.. ##..
  square:        { name: 'the seven-board square', sol: 'L2@0,0 L3@2,0 S1@0,2 Q0@1,2 S0@2,2 P0f@2,2 M0@1,3' },      // .◢◣. ◢##◣ ◥##◤ .◥◤.
  junk:          { name: 'a junk',               sol: 'L2@1,0 Q0@3,0 S0@3,1 L2@2,1 M0@0,2 P0f@1,2 S0@4,2' },        // ..◢#.. .◢##.. ◥###◤.
  sampan:        { name: 'a sailing sampan',     sol: 'M2@2,0 L0@2,1 L2@2,1 S1@0,2 Q0@1,2 S0@4,2 P0f@4,2' },        // ..◢◣.. ..##.. ◥####◤
  'two-master':  { name: 'a two-masted junk',    sol: 'L2@0,0 L2@2,0 M0@0,2 S2@1,2 Q0@2,2 S0@3,2 P0f@3,2' },        // .◢.◢. ◢#◢#. ◥###◤
  'moon-bridge': { name: 'a moon bridge',        sol: 'S2@0,0 L0@1,0 M2@2,0 L1@3,0 P1f@5,0 Q0@0,1 S3@5,1' },        // ◢####◣ #◤..◥#
  carp:          { name: 'a carp',               sol: 'S2@0,0 L3@1,0 Q0@0,1 M1@3,1 S1@0,2 P1f@0,2 L0@1,2' },        // ◢◣.. ##◣◢ ##◤◥ ◥◤..
  house:         { name: 'a house',              sol: 'L2@0,0 L3@2,0 M0@1,2 S3@1,2 P1@2,2 Q0@1,3 S2@2,3' },         // .◢◣. ◢##◣ .##. .##.
  stupa:         { name: 'a stupa',              sol: 'L2@1,0 L3@3,0 M0@1,2 S3@1,2 P0f@2,2 S2@3,2 Q0@4,2' },        // ..◢◣.. .◢##◣. .####.
  pagoda:        { name: 'a pagoda',             sol: 'M1@2,0 S3@3,0 P0@1,1 L0@3,1 Q0@2,2 L2@2,2 S0@2,3' },         // ..◢◣.. .◥##◤. ..##.. ..##..
  'tiered-pagoda': { name: 'a tiered pagoda',    sol: 'M2@1,0 L1@0,1 L0@2,1 S1@0,3 Q0@1,3 S0@2,3 P0f@2,3' },        // .◢◣. ◥##◤ .◥◤. ◥##◤
  pailou:        { name: 'a pailou gate',        sol: 'L1@0,0 Q0@2,0 L1@3,0 S3@3,0 S0@5,0 P1f@1,1 M3@4,1' },        // ◥####◤ .#..#. .◥..◤.
  pine:          { name: 'a pine tree',          sol: 'L2@0,0 L3@2,0 M2@0,2 S1@1,2 P0@2,2 S3@2,2 Q0@1,3' },         // .◢◣. ◢##◣ ◢##◣ .#..
  'twin-peaks':  { name: 'twin mountain peaks',  sol: 'M2@0,0 L0@0,1 L2@0,1 S2@2,1 P1f@3,1 Q0@2,2 S3@3,2' },        // ◢◣.. ##◢◣ ####
  stele:         { name: 'a stone stele',        sol: 'M2@1,0 L0@1,1 L2@1,1 S2@0,3 Q0@1,3 P0@2,3 S3@2,3' },         // .◢◣. .##. .##. ◢##◣
  altar:         { name: 'an altar',             sol: 'L1@0,0 S3@0,0 S0@2,0 M1@2,0 Q0@3,0 L3@1,1 P1f@2,1' },        // #### .##. .##.
  crane:         { name: 'a crane',              sol: 'L2@1,0 M2@0,2 L1@1,2 S3@3,2 P1f@2,3 S3@2,4 Q0@2,5' },        // ..◢. .◢#. ◢##◣ ..#. ..#. ..#.
  cat:           { name: 'a cat',                sol: 'L3@0,0 S2@2,0 S1@1,1 Q0@2,1 P0@1,2 L3@1,2 M0@2,3' },         // ◣.◢. ###. .#◣. .##◤
  rabbit:        { name: 'a rabbit',             sol: 'S1@0,0 L3@0,0 Q0@2,0 L1@1,1 M2@0,2 P0@1,2 S3@3,2' },         // #.#. ###. ◢##◣
  horse:         { name: 'a horse',              sol: 'Q0@0,0 L0@0,1 M2@1,1 P0@2,1 L1@3,1 S2@0,2 S3@4,2' },         // #.... ##### #...#
}

export const SILHOUETTE_KEYS = Object.keys(SOLUTIONS)

export function parseSolution(sol: string): Placement[] {
  return sol.split(' ').map(tok => {
    const m = /^([LMSQP])(\d)(f?)@(-?\d+),(-?\d+)$/.exec(tok)
    if (!m) throw new Error(`bad tangram token ${tok}`)
    return { kind: m[1] as Kind, rot: Number(m[2]), flip: m[3] === 'f', x: Number(m[4]), y: Number(m[5]) }
  })
}

// ── Board ──────────────────────────────────────────────────────────────────────

/** Canvas in grid units: the silhouette area on top, the tray below. */
export const W = 10
export const H = 12
const BOARD_H = 7

export interface Puzzle {
  key: string
  name: string
  /** Solution piece outlines on the canvas (mirrored if the seed says so). */
  solution: Pt[][]
  /** Kinds of the solution polygons, same order. */
  kinds: Kind[]
  target: Set<string>
  start: Placement[]
  twist?: Twist
  /** The 'turns' twist: quarter-turns and flips allowed. */
  turnBudget?: number
}

/** The tray starts at this row: pieces wholly below it are off the board. */
export const TRAY_Y = BOARD_H + 1

export interface Tier { outlines: 'all' | 'some' | 'none'; turned: boolean; seconds: number }

export function tierFor(difficulty: Difficulty): Tier {
  return {
    outlines: scale(difficulty, ['all', 'some', 'none', 'none'] as const),
    turned: difficulty >= 3,
    seconds: scale(difficulty, [120, 150, 180, 180]),
  }
}

export function makePuzzle(config: Pick<TangramConfig, 'shapes' | 'twist'>, difficulty: Difficulty, seed: number): Puzzle {
  const rng = mulberry32(seed ^ hashString(config.shapes.join()))
  const key = config.shapes[Math.floor(rng() * config.shapes.length)]
  const placed = parseSolution(SOLUTIONS[key].sol)
  let polys = placed.map(polygonOf)
  const sw = Math.max(...polys.flat().map(p => p[0])), sh = Math.max(...polys.flat().map(p => p[1]))
  if (rng() < 0.5) polys = polys.map(poly => poly.map(([x, y]) => [sw - x, y] as Pt))
  const ox = Math.floor((W - sw) / 2), oy = Math.floor((BOARD_H - sh) / 2)
  polys = polys.map(poly => poly.map(([x, y]) => [x + ox, y + oy] as Pt))
  const target = new Set(polys.flatMap(quartersOf))
  // Tray: ten 2×2 slots below the board, seven of them used, in seeded order.
  const slots = Array.from({ length: 10 }, (_, i) => [(i % 5) * 2, BOARD_H + 1 + Math.floor(i / 5) * 2] as Pt)
  for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]] }
  const tier = tierFor(difficulty)
  const twist = config.twist
  // The decoy: an extra medium triangle, square, parallelogram or small triangle.
  const tray: Kind[] = twist === 'decoy' ? [...SET, (['M', 'Q', 'P', 'S'] as const)[Math.floor(rng() * 4)]] : SET
  const turned = tier.turned || twist === 'turns'
  const lay = () => tray.map((kind, i) => {
    const rot = turned ? Math.floor(rng() * 4) : 0
    const flip = kind === 'P' && turned && rng() < 0.5
    const { w, h } = boxOf({ kind, rot, flip })
    return { kind, rot, flip, x: slots[i][0] + Math.floor((2 - w) / 2), y: slots[i][1] + Math.floor((2 - h) / 2) }
  })
  const puzzle: Puzzle = { key, name: SOLUTIONS[key].name, solution: polys, kinds: placed.map(p => p.kind), target, start: lay(), twist }
  if (twist === 'turns') {
    // Make the turns matter: re-deal until at least four are needed.
    for (let k = 0; k < 20 && minTurns(puzzle) < 4; k++) puzzle.start = lay()
    puzzle.turnBudget = minTurns(puzzle) + TWISTS.turns(difficulty).spare
  }
  return puzzle
}

/** Quarter-turns (either way) plus flips to bring orientation `a` to `b`. */
export function turnCost(a: Pick<Placement, 'rot' | 'flip'>, b: Pick<Placement, 'rot' | 'flip'>): number {
  const dr = (((b.rot - a.rot) % 4) + 4) % 4
  return (a.flip !== b.flip ? 1 : 0) + Math.min(dr, 4 - dr)
}

const shapeKey = (kind: Kind, rot: number, flip: boolean) => quartersOf(orient(kind, rot, flip)).sort().join(' ')

/**
 * The puzzle's solution as piece placements in SET order (one per piece of
 * the set; a decoy, last in the tray, is left out), recovered from the
 * (possibly mirrored) solution outlines. Of the equivalent orientations, and
 * of the ways to match identical pieces, it picks the one needing the fewest
 * turns from the start.
 */
export function placementsFor(puzzle: Puzzle): Placement[] {
  // Every orientation of a piece that fills solution polygon k.
  const fits = (kind: Kind, k: number): Placement[] => {
    const poly = puzzle.solution[k]
    const x = Math.min(...poly.map(p => p[0])), y = Math.min(...poly.map(p => p[1]))
    const want = quartersOf(poly.map(([px, py]) => [px - x, py - y] as Pt)).sort().join(' ')
    const out: Placement[] = []
    for (const flip of kind === 'P' ? [false, true] : [false]) for (let rot = 0; rot < 4; rot++) {
      if (shapeKey(kind, rot, flip) === want) out.push({ kind, rot, flip, x, y })
    }
    if (!out.length) throw new Error(`no orientation for ${kind} in ${puzzle.key}`)
    return out
  }
  const best = (i: number, k: number) => {
    const from = puzzle.start[i] ?? { rot: 0, flip: false }
    return fits(SET[i], k).reduce((a, b) => (turnCost(from, b) < turnCost(from, a) ? b : a))
  }
  const cost = (i: number, k: number) => turnCost(puzzle.start[i] ?? { rot: 0, flip: false }, best(i, k))
  const out: Placement[] = []
  const used = new Set<number>()
  for (let i = 0; i < SET.length; i++) {
    if (out[i]) continue
    const ks = puzzle.kinds.map((_, idx) => idx).filter(idx => puzzle.kinds[idx] === SET[i] && !used.has(idx))
    const twin = SET.findIndex((kk, j) => j > i && kk === SET[i])
    if (twin >= 0 && ks.length >= 2) {
      // Two identical pieces: match them to the two outlines the cheaper way.
      const [a, b] = ks
      const swap = cost(i, b) + cost(twin, a) < cost(i, a) + cost(twin, b)
      out[i] = best(i, swap ? b : a); out[twin] = best(twin, swap ? a : b)
      used.add(a); used.add(b)
    } else {
      out[i] = best(i, ks[0]); used.add(ks[0])
    }
  }
  return out
}

/** The fewest quarter-turns and flips that solve the puzzle from its start. */
export function minTurns(puzzle: Puzzle): number {
  return placementsFor(puzzle).reduce((a, p, i) => a + turnCost(puzzle.start[i], p), 0)
}

const clampPos = (p: Placement): Placement => {
  const { w, h } = boxOf(p)
  return { ...p, x: Math.max(0, Math.min(W - w, p.x)), y: Math.max(0, Math.min(H - h, p.y)) }
}

/** Turn 90° clockwise about the piece's centre, then snap back onto the grid. */
export function rotatePiece(p: Placement): Placement {
  const a = boxOf(p)
  const rot = (p.rot + 1) % 4
  const b = boxOf({ ...p, rot })
  // Half-unit offsets round one way on odd turns and the other on even ones,
  // so four turns bring a piece back exactly where it started.
  const odd = rot % 2 === 1
  const dx = (a.w - b.w) / 2, dy = (a.h - b.h) / 2
  return clampPos({ ...p, rot, x: p.x + (odd ? Math.floor(dx) : Math.ceil(dx)), y: p.y + (odd ? Math.ceil(dy) : Math.floor(dy)) })
}

/** Turn 90° anticlockwise (three clockwise turns' worth). */
export function rotatePieceBack(p: Placement): Placement {
  return rotatePiece(rotatePiece(rotatePiece(p)))
}

export function flipPiece(p: Placement): Placement {
  return p.kind === 'P' ? clampPos({ ...p, flip: !p.flip }) : p
}

export function movePiece(p: Placement, dx: number, dy: number): Placement {
  return clampPos({ ...p, x: p.x + dx, y: p.y + dy })
}

export const inTray = (p: Placement) => p.y >= TRAY_Y

/** Covered target quarters (counting each once) and whether the cover is exact. Boards left in the tray do not count. */
export function coverage(pieces: Placement[], target: Set<string>): { covered: number; solved: boolean } {
  const seen = new Map<string, number>()
  for (const p of pieces) if (!inTray(p)) for (const k of quartersOf(polygonOf(p))) seen.set(k, (seen.get(k) ?? 0) + 1)
  let covered = 0, exact = seen.size === target.size
  for (const k of target) if (seen.has(k)) covered++
  for (const [k, n] of seen) if (n !== 1 || !target.has(k)) exact = false
  return { covered, solved: exact && covered === target.size }
}

// ── Component ──────────────────────────────────────────────────────────────────

const COLOURS: Record<Kind, string> = { L: '#c2410c', M: '#0f766e', S: '#b45309', Q: '#7c3aed', P: '#be123c' }
const COLOURS2 = ['#c2410c', '#ea580c', '#0f766e', '#b45309', '#ca8a04', '#7c3aed', '#be123c']

const KIND_NAMES: Record<Kind, string> = { L: 'large triangle', M: 'medium triangle', S: 'small triangle', Q: 'square', P: 'parallelogram' }

/** Would board `i` set fast where it lies: wholly inside the outline, overlapping no other board? */
export function fitsInside(pieces: Placement[], i: number, target: Set<string>): boolean {
  const mine = quartersOf(polygonOf(pieces[i]))
  if (inTray(pieces[i]) || !mine.every(k => target.has(k))) return false
  const others = new Set(pieces.flatMap((p, k) => (k === i || inTray(p) ? [] : quartersOf(polygonOf(p)))))
  return mine.every(k => !others.has(k))
}

export default function TangramGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'song-scholar')
  const puzzle = useMemo(() => makePuzzle(config, difficulty, seed), [config.shapes.join(), config.twist, difficulty, seed]) // eslint-disable-line react-hooks/exhaustive-deps
  const tier = tierFor(difficulty)
  const twist = puzzle.twist
  const memory = TWISTS.memory(difficulty)
  const n = puzzle.start.length
  const [pieces, setPieces] = useState<Placement[]>(puzzle.start)
  const [selected, setSelected] = useState<number | null>(null)
  const [order, setOrder] = useState<number[]>(() => puzzle.start.map((_, i) => i))
  const [drag, setDrag] = useState<{ i: number; sx: number; sy: number; dx: number; dy: number } | null>(null)
  // Twists: lacquered boards, turn budget, memory.
  const [locked, setLocked] = useState<boolean[]>(() => Array(n).fill(false))
  const [pries, setPries] = useState(TWISTS.lacquer(difficulty).pries)
  const [turnsLeft, setTurnsLeft] = useState(puzzle.turnBudget ?? Infinity)
  const [shown, setShown] = useState(true)
  const [showFor, setShowFor] = useState(memory.showSeconds)
  const [peeks, setPeeks] = useState(memory.peeks)
  const [note, setNote] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const timer = useGameTimer({ seconds: tier.seconds, running: !settled, onExpire: () => lose('Time ran out') })

  useEffect(() => {
    if (twist !== 'memory' || !shown || settled) return
    const id = setTimeout(() => setShown(false), showFor * 1000)
    return () => clearTimeout(id)
  }, [twist, shown, showFor, settled])
  const silhouetteVisible = twist !== 'memory' || shown || settled

  const { covered } = coverage(pieces, puzzle.target)
  const pct = Math.round((covered / puzzle.target.size) * 100)

  const commit = useCallback((i: number, next: Placement) => {
    if (settled || locked[i]) return
    const all = pieces.map((p, k) => (k === i ? next : p))
    setPieces(all)
    setSelected(i)
    setNote(null)
    setOrder(o => [...o.filter(k => k !== i), i])
    if (coverage(all, puzzle.target).solved) win()
  }, [settled, locked, pieces, puzzle.target, win])

  /** Select a board; with lacquer, the board put down sets fast if it lies inside the outline. */
  const select = useCallback((i: number) => {
    if (twist === 'lacquer' && selected !== null && selected !== i && !locked[selected] && fitsInside(pieces, selected, puzzle.target)) {
      setLocked(l => l.map((v, k) => v || k === selected))
      setNote('That board has set fast.')
    }
    setSelected(i)
    setOrder(o => [...o.filter(k => k !== i), i])
  }, [twist, selected, locked, pieces, puzzle.target])

  /** A quarter-turn or flip, charged to the budget under the 'turns' twist. */
  const turn = useCallback((i: number, f: (p: Placement) => Placement) => {
    if (settled || locked[i]) return
    const next = f(pieces[i])
    if (next === pieces[i]) return
    if (twist === 'turns') {
      if (turnsLeft <= 0) { setNote('No turns left — only moves now.'); return }
      setTurnsLeft(t => t - 1)
    }
    commit(i, next)
  }, [settled, locked, pieces, twist, turnsLeft, commit])

  const pry = () => {
    if (selected === null || !locked[selected] || pries <= 0 || settled) return
    setLocked(l => l.map((v, k) => v && k !== selected))
    setPries(p => p - 1)
    setNote(null)
  }

  const peek = () => {
    if (twist !== 'memory' || shown || peeks <= 0 || settled) return
    setPeeks(p => p - 1)
    setShowFor(memory.peekSeconds)
    setShown(true)
  }

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r || !r.width) return { x: 0, y: 0 }
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }

  // The drag lives in a ref (read by the window listeners) and in state (for rendering).
  const dragRef = useRef<typeof drag>(null)
  const setDragBoth = (d: typeof drag) => { dragRef.current = d; setDrag(d) }

  const onDown = (i: number) => (e: React.PointerEvent) => {
    if (settled) return
    e.preventDefault()
    select(i)
    if (locked[i]) return
    const { x, y } = toSvg(e)
    setDragBoth({ i, sx: x, sy: y, dx: 0, dy: 0 })
  }

  const commitRef = useRef(commit)
  commitRef.current = commit
  const turnRef = useRef(turn)
  turnRef.current = turn
  const piecesRef = useRef(pieces)
  piecesRef.current = pieces
  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const { x, y } = toSvg(e)
      setDragBoth({ ...d, dx: x - d.sx, dy: y - d.sy })
    }
    const up = () => {
      const d = dragRef.current
      if (!d) return
      setDragBoth(null)
      const p = piecesRef.current[d.i]
      if (Math.hypot(d.dx, d.dy) < 0.25) turnRef.current(d.i, rotatePiece)
      else commitRef.current(d.i, movePiece(p, Math.round(d.dx), Math.round(d.dy)))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [dragging]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = (f: (p: Placement) => Placement) => () => {
    if (selected === null || settled) return
    commit(selected, f(pieces[selected]))
  }
  const actTurn = (f: (p: Placement) => Placement) => () => { if (selected !== null) turn(selected, f) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selected === null || settled) return
      const mv: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
      if (mv[e.key]) { e.preventDefault(); commit(selected, movePiece(pieces[selected], ...mv[e.key])) }
      else if (e.key === 'r' || e.key === 'R') turn(selected, rotatePiece)
      else if (e.key === 'e' || e.key === 'E') turn(selected, rotatePieceBack)
      else if (e.key === 'f' || e.key === 'F') turn(selected, flipPiece)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, settled, pieces, commit, turn])

  const hinted = (k: number) => tier.outlines === 'all' || (tier.outlines === 'some' && (puzzle.kinds[k] === 'L' || puzzle.kinds[k] === 'M'))
  const pts = (poly: Pt[]) => poly.map(p => p.join(',')).join(' ')
  const sel = selected !== null ? pieces[selected] : null
  const selLocked = selected !== null && locked[selected]
  const noTurns = twist === 'turns' && turnsLeft <= 0
  const btn = 'h-10 rounded-lg border text-sm font-bold bg-panel border-line text-ink-2 disabled:opacity-40'
  const status = twist === 'turns' ? `↻ ${turnsLeft} turn${turnsLeft === 1 ? '' : 's'} left`
    : twist === 'lacquer' ? `${locked.filter(Boolean).length} set · ${pries} pr${pries === 1 ? 'y' : 'ies'}`
    : twist === 'memory' ? `${peeks} peek${peeks === 1 ? '' : 's'}`
    : twist === 'decoy' ? 'one is a decoy' : null
  const help = twist === 'lacquer' ? 'A board inside the outline sets fast when you pick up another.'
    : twist === 'turns' ? 'Each turn (↻ ↺) or flip (⇋) spends one from the budget.'
    : twist === 'memory' ? (shown ? 'Study the silhouette — it will fade.' : 'Build it from memory.')
    : twist === 'decoy' ? 'Leave the odd board in the tray.' : ''

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
          <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          <p className="font-bold text-ink-2">{n} boards</p>
          <p data-testid="tg-cover">◩ {silhouetteVisible ? `${pct}%` : '?'}</p>
          {status && <p data-testid="tg-twist" className={noTurns ? 'text-red-600 font-bold' : ''}>{status}</p>}
        </div>
      </div>
      <TimerBar remaining={timer.remaining} total={timer.total} />

      <div className="w-full max-w-[400px] mx-auto rounded-xl border border-line bg-paper overflow-hidden select-none" style={{ touchAction: 'none' }}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={`Tangram silhouette: ${puzzle.name}`}>
          <defs>
            <pattern id="tg-grid" width="1" height="1" patternUnits="userSpaceOnUse">
              <path d="M1 0H0V1" fill="none" stroke="currentColor" strokeWidth="0.02" className="text-line" />
            </pattern>
          </defs>
          <rect x="0" y="0" width={W} height={BOARD_H + 0.5} fill="url(#tg-grid)" opacity="0.8" />
          <rect x="0" y={BOARD_H + 0.5} width={W} height={H - BOARD_H - 0.5} className="fill-panel" opacity="0.6" />
          <line x1="0" x2={W} y1={BOARD_H + 0.5} y2={BOARD_H + 0.5} stroke="currentColor" strokeWidth="0.04" className="text-line" />
          {/* Silhouette: the solution polygons in one colour, seams hidden by a matching stroke. */}
          {silhouetteVisible && (
            <g data-testid="tg-target">
              {puzzle.solution.map((poly, k) => (
                <polygon key={k} points={pts(poly)} fill="#1f2937" stroke="#1f2937" strokeWidth="0.03" strokeLinejoin="round" opacity={outcome === 'won' ? 0.15 : 0.85} />
              ))}
              {puzzle.solution.map((poly, k) => hinted(k) && (
                <polygon key={`h${k}`} data-hint={k} points={pts(poly)} fill="none" stroke="#f8fafc" strokeOpacity={tier.outlines === 'all' ? 0.35 : 0.5} strokeWidth="0.05" strokeDasharray="0.15 0.1" />
              ))}
            </g>
          )}
          {order.map(i => {
            const p = pieces[i]
            const d = drag?.i === i ? drag : null
            return (
              <g key={i} transform={d ? `translate(${d.dx} ${d.dy})` : undefined}>
                <polygon data-piece={i} data-locked={locked[i] ? '1' : undefined} points={pts(polygonOf(p))} tabIndex={0} role="button"
                  aria-label={`${KIND_NAMES[p.kind]} ${i + 1}${locked[i] ? ' (set fast)' : ''}`}
                  onPointerDown={onDown(i)} onFocus={() => select(i)}
                  fill={COLOURS2[i] ?? COLOURS[p.kind]} fillOpacity={0.92}
                  stroke={selected === i ? '#fde047' : locked[i] ? '#1f2937' : '#fffbeb'} strokeWidth={selected === i ? 0.09 : locked[i] ? 0.07 : 0.04} strokeLinejoin="round"
                  style={{ cursor: settled || locked[i] ? 'default' : 'grab', outline: 'none' }} />
              </g>
            )
          })}
        </svg>
      </div>

      {!settled && (
        <div className="grid grid-cols-7 gap-1.5 w-full max-w-[400px] mx-auto">
          <button type="button" className={btn} disabled={!sel || selLocked || noTurns} onClick={actTurn(rotatePiece)} aria-label="Turn">↻</button>
          <button type="button" className={btn} disabled={!sel || selLocked || noTurns} onClick={actTurn(rotatePieceBack)} aria-label="Turn back">↺</button>
          <button type="button" className={btn} disabled={!sel || selLocked || noTurns || sel.kind !== 'P'} onClick={actTurn(flipPiece)} aria-label="Flip">⇋</button>
          <button type="button" className={btn} disabled={!sel || selLocked} onClick={act(p => movePiece(p, -1, 0))} aria-label="Left">←</button>
          <button type="button" className={btn} disabled={!sel || selLocked} onClick={act(p => movePiece(p, 0, -1))} aria-label="Up">↑</button>
          <button type="button" className={btn} disabled={!sel || selLocked} onClick={act(p => movePiece(p, 0, 1))} aria-label="Down">↓</button>
          <button type="button" className={btn} disabled={!sel || selLocked} onClick={act(p => movePiece(p, 1, 0))} aria-label="Right">→</button>
        </div>
      )}
      {!settled && (twist === 'memory' || (twist === 'lacquer' && selLocked)) && (
        <div className="flex justify-center">
          {twist === 'memory' && (
            <button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold bg-accent text-accent-fg disabled:opacity-40" disabled={shown || peeks <= 0} onClick={peek}>
              Peek ({peeks})
            </button>
          )}
          {twist === 'lacquer' && selLocked && (
            <button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold bg-accent text-accent-fg disabled:opacity-40" disabled={pries <= 0} onClick={pry}>
              Pry loose ({pries})
            </button>
          )}
        </div>
      )}
      <p className="text-muted/80 text-[10px] text-center" role="status">
        {outcome === 'won' ? `It is ${puzzle.name}!` : note ?? `Drag a board to move it; tap it to turn it. ⇋ flips the parallelogram. ${help}`}
      </p>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle={`Solved: ${puzzle.name}`} loseTitle="The boards would not fit in time" />
    </div>
  )
}

export const CONFIG_IDS = Object.keys(CONFIGS)
