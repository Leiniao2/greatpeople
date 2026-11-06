// Mirror puzzles: a beam enters the board from one edge and you place
// mirrors and prisms in its way.  The board holds
//   · stone blocks, which stop the beam dead;
//   · fixed mirrors and prisms, which you cannot move;
//   · targets (★), which must all be lit, and the beam passes through them;
//   · sensors (◉), which must stay dark, and the beam passes through those too;
//   · fog (from D2), patches whose cells stay unknown until the beam lights
//     them: there may be stone, a fixed piece, a star or a sensor inside.
// A mirror turns the beam a quarter turn; a prism splits it into two beams,
// one to each side, and neither carries on straight.
//
// Puzzles are generated from a seed and checked by an exhaustive search over
// every placement of the pieces in hand, so each one is solvable, needs every
// piece and has at most a tier's number of solutions.

import type { Difficulty } from '@/games/types'
import { mulberry32, randInt, shuffle, type Rng } from '../_shared/rng'

export type Dir = 0 | 1 | 2 | 3 // up, right, down, left
export type Piece = '/' | '\\' | 'P' | '#'
export type Hand = 'mirror' | 'prism'

const DR = [-1, 0, 1, 0]
const DC = [0, 1, 0, -1]
const SLASH: Dir[] = [1, 0, 3, 2]     // '/': up→right, right→up, down→left, left→down
const BACKSLASH: Dir[] = [3, 2, 1, 0] // '\': up→left, right→down, down→right, left→up
const CODE: Record<Piece, number> = { '/': 1, '\\': 2, P: 3, '#': 4 }

/** Cells are numbered row by row: r * n + c. */
export type Cell = number

export interface Source { row: number; col: number; dir: Dir }

export interface Trace {
  lit: Uint8Array
  /** Beam segments between cell centres, edge cells (−1, n) included. */
  segs: [number, number, number, number][]
}

/** Follow the beam over a board of piece codes (0 empty, 1 '/', 2 '\\', 3 prism, 4 block). */
function run(n: number, source: Source, board: Uint8Array, segs: Trace['segs'] | null): Uint8Array {
  const lit = new Uint8Array(n * n)
  const seen = new Uint8Array(n * n * 4)
  const beams: number[] = [source.row, source.col, source.dir]
  while (beams.length) {
    const d = beams.pop()! as Dir, c = beams.pop()!, r = beams.pop()!
    const nr = r + DR[d], nc = c + DC[d]
    segs?.push([r, c, nr, nc])
    if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue
    const cell = nr * n + nc
    if (seen[cell * 4 + d]) continue
    seen[cell * 4 + d] = 1
    lit[cell] = 1
    const p = board[cell]
    if (p === 4) continue
    if (p === 1) beams.push(nr, nc, SLASH[d])
    else if (p === 2) beams.push(nr, nc, BACKSLASH[d])
    else if (p === 3) beams.push(nr, nc, (d + 1) % 4, nr, nc, (d + 3) % 4)
    else beams.push(nr, nc, d)
  }
  return lit
}

function boardOf(n: number, ...layers: Record<Cell, Piece>[]): Uint8Array {
  const b = new Uint8Array(n * n)
  for (const layer of layers) for (const k in layer) b[+k] = CODE[layer[k]]
  return b
}

export function trace(n: number, source: Source, pieces: Record<Cell, Piece>): Trace {
  const segs: Trace['segs'] = []
  return { lit: run(n, source, boardOf(n, pieces), segs), segs }
}

// ── Themes (config ids) ─────────────────────────────────────────────────────

export interface Theme { title: string; blurb: string }

export const THEMES = {
  mendel: { title: "Mendel's Pea Garden", blurb: 'Light the marked pea beds so the traits can be told apart, and keep the beam off the seedlings.' },
  euclid: { title: "Euclid's Reflection Law", blurb: 'Light leaves a mirror at the angle it arrived. Bounce it onto every star.' },
  digital: { title: 'Fiber Optic Network', blurb: 'Route the signal to every server and away from the open ports.' },
  plato: { title: "Plato's Cave", blurb: 'Cast light on every marked part of the cave wall while the prisoners stay in shadow.' },
  anaxagoras: { title: 'The Fiery Rock', blurb: "Anaxagoras said the sun is a burning stone. Carry its light to every mark without touching the temple's eyes." },
  'al-khwarizmi': { title: 'House of Wisdom', blurb: "Thread the beam through Baghdad's library to every lens. Stone shelves stop light dead." },
  lorentz: { title: 'Speed of Light', blurb: 'Split the beam and send both halves where they are needed, like an interferometer.' },
  'newton-prism': { title: "Newton's Prism", blurb: 'A prism splits one beam into two. Use it to light targets on both sides.' },
  huygens: { title: "Huygens' Wave Front", blurb: 'Every point on a wave front is a new source. Spread the light onto every star.' },
  foucault: { title: "Foucault's Rotating Mirror", blurb: 'Foucault timed light with mirrors. Bounce the beam onto every star and keep it off the sensors.' },
  'archimedes-mirror': { title: "Archimedes' Burning Mirrors", blurb: 'Focus sunlight on every ship and keep it off your own walls.' },
  snell: { title: "Snell's Law", blurb: 'Light obeys exact rules at every surface. Trace them to light every star.' },
  'maya-light': { title: 'Maya Solstice Observatory', blurb: 'On the solstice the sun must touch every altar, and none of the priests.' },
  'ptolemy-lens': { title: "Ptolemy's Optics", blurb: 'Ptolemy measured angles of light. Use yours to reach every target.' },
  'al-biruni-ray': { title: "Al-Bīrūnī's Camera Obscura", blurb: 'Guide the light through the chamber to every mark, and keep the screens dark.' },
  'viking-aurora': { title: 'Viking Sólarsteinn', blurb: 'A sunstone finds the sun through cloud. Carry its light to every rune.' },
  'mongol-signal': { title: 'Mongol Fire Relay', blurb: 'Every beacon must catch the signal, and no enemy watchtower.' },
  'legnica-mohi': { title: 'Two Armies, One Plan — 1241', blurb: "Batu's wings in Poland and Hungary must both get the signal, and the enemy scouts must not." },
  'aztec-sun': { title: 'Aztec Sun Temple', blurb: 'Bring the sun to every altar of the temple and keep it from the sealed shrines.' },
  'cornaro-chapel': { title: 'The Hidden Window', blurb: 'Daylight from a hidden window must land on St Teresa and the angel, not on the congregation.' },
} satisfies Record<string, Theme>

export type ThemeKey = keyof typeof THEMES

// ── Difficulty ──────────────────────────────────────────────────────────────

export interface Tier {
  size: number
  mirrors: [number, number]
  prisms: [number, number]
  targets: [number, number]
  sensors: [number, number]
  blocks: [number, number]
  fixedMirrors: [number, number]
  fixedPrisms: [number, number]
  /** Fog patches, and the side of each (square) patch. */
  fog: [number, number]
  fogSide: [number, number]
  /** At most this many placements may solve the puzzle. */
  maxSolutions: number
  seconds: number
}

//   D1  7×7, three pieces (sometimes a prism), two stars, sensors, plenty of stone
//   D2  7×7, three or four pieces with a prism, a fog patch, one answer, a clock
//   D3  8×8, four pieces with a prism, three stars, two fog patches, one answer
//   D4  8×8, four or five pieces, three or four stars, four or five sensors, three fog patches
export const TIERS: Record<Difficulty, Tier> = {
  1: { size: 7, mirrors: [2, 3], prisms: [0, 1], targets: [2, 2], sensors: [1, 2], blocks: [5, 7], fixedMirrors: [1, 3], fixedPrisms: [0, 1], fog: [0, 0], fogSide: [2, 2], maxSolutions: 2, seconds: 0 },
  2: { size: 7, mirrors: [2, 3], prisms: [1, 1], targets: [2, 3], sensors: [2, 3], blocks: [6, 9], fixedMirrors: [2, 3], fixedPrisms: [0, 1], fog: [1, 1], fogSide: [2, 3], maxSolutions: 1, seconds: 360 },
  3: { size: 8, mirrors: [3, 3], prisms: [1, 1], targets: [3, 3], sensors: [3, 4], blocks: [8, 11], fixedMirrors: [2, 4], fixedPrisms: [1, 1], fog: [2, 2], fogSide: [2, 3], maxSolutions: 1, seconds: 330 },
  4: { size: 8, mirrors: [3, 4], prisms: [1, 1], targets: [3, 4], sensors: [4, 5], blocks: [10, 13], fixedMirrors: [3, 4], fixedPrisms: [1, 1], fog: [3, 3], fogSide: [2, 3], maxSolutions: 1, seconds: 300 },
}

// ── Puzzle ──────────────────────────────────────────────────────────────────

export interface Puzzle {
  theme: ThemeKey
  /** The tier actually generated (a fallback would be lower than asked). */
  difficulty: Difficulty
  size: number
  source: Source
  /** Blocks and fixed pieces. */
  fixed: Record<Cell, Piece>
  targets: Cell[]
  sensors: Cell[]
  /** Fogged cells: unknown until the beam first lights them. */
  fog: Cell[]
  hand: Record<Hand, number>
  /** Every placement that solves it (player pieces only, as `key=piece` lists). */
  solutions: Record<Cell, Piece>[]
  seconds: number
}

export interface Status { trace: Trace; lit: number; burnt: number; solved: boolean }

type Board = Pick<Puzzle, 'size' | 'source' | 'fixed' | 'targets' | 'sensors'>

export function status(p: Board, placed: Record<Cell, Piece>): Status {
  const t = trace(p.size, p.source, { ...p.fixed, ...placed })
  const lit = p.targets.filter(k => t.lit[k]).length
  const burnt = p.sensors.filter(k => t.lit[k]).length
  return { trace: t, lit, burnt, solved: lit === p.targets.length && burnt === 0 }
}

const PIECES: Piece[] = ['/', '\\', 'P']

/**
 * Every placement of at most the pieces in hand that solves the board; a
 * solved placement is not extended further.  Pieces only matter where the
 * beam reaches, so each new piece goes on a lit cell.  Stops early once more
 * than `limit` are found.
 */
export function solve(p: Board & Pick<Puzzle, 'hand'>, limit = Infinity): Record<Cell, Piece>[] {
  const n = p.size
  const board = boardOf(n, p.fixed)
  const open = new Uint8Array(n * n).fill(1)
  for (const k of [...Object.keys(p.fixed).map(Number), ...p.targets, ...p.sensors]) open[k] = 0
  // The same pieces laid in another order are the same placement: an
  // order-free (Zobrist) hash of 52 bits identifies each one.
  const seen = new Set<number>()
  const zob = mulberry32(0x9e3779b9)
  const zHi = Array.from({ length: n * n * 4 }, () => Math.floor(zob() * 2 ** 26))
  const zLo = Array.from({ length: n * n * 4 }, () => Math.floor(zob() * 2 ** 26))
  let hi = 0, lo = 0
  const found: Record<Cell, Piece>[] = []
  const placed: number[] = [] // cell * 4 + code
  const dfs = (mirrors: number, prisms: number) => {
    if (found.length > limit) return
    const id = hi * 2 ** 26 + lo
    if (seen.has(id)) return
    seen.add(id)
    const lit = run(n, p.source, board, null)
    if (p.targets.every(k => lit[k]) && p.sensors.every(k => !lit[k])) {
      found.push(Object.fromEntries(placed.map(x => [x >> 2, PIECES[(x & 3) - 1]])))
      return
    }
    if (!mirrors && !prisms) return
    for (let cell = 0; cell < n * n; cell++) {
      if (!lit[cell] || !open[cell] || board[cell]) continue
      for (let code = 1; code <= 3; code++) {
        if (code < 3 ? !mirrors : !prisms) continue
        const x = cell * 4 + code
        board[cell] = code
        placed.push(x)
        hi ^= zHi[x]; lo ^= zLo[x]
        if (code < 3) dfs(mirrors - 1, prisms)
        else dfs(mirrors, prisms - 1)
        hi ^= zHi[x]; lo ^= zLo[x]
        placed.pop()
        board[cell] = 0
      }
    }
  }
  dfs(p.hand.mirror, p.hand.prism)
  return found
}

function edgeSource(rng: Rng, n: number): Source {
  const side = randInt(rng, 0, 3) as Dir // the edge the beam comes in from
  const i = randInt(rng, 1, n - 2)
  // From the top edge the beam travels down, and so on.
  if (side === 0) return { row: -1, col: i, dir: 2 }
  if (side === 1) return { row: i, col: n, dir: 3 }
  if (side === 2) return { row: n, col: i, dir: 0 }
  return { row: i, col: -1, dir: 1 }
}

function tryPuzzle(rng: Rng, themeKey: ThemeKey, d: Difficulty): Puzzle | null {
  const tier = TIERS[d]
  const n = tier.size
  const source = edgeSource(rng, n)
  const first = (source.row + DR[source.dir]) * n + source.col + DC[source.dir]
  const cells = Array.from({ length: n * n }, (_, k) => k)
  const free = shuffle(cells.filter(k => k !== first), rng)

  const fixed: Record<Cell, Piece> = {}
  for (let i = randInt(rng, ...tier.blocks); i > 0; i--) fixed[free.pop()!] = '#'
  for (let i = randInt(rng, ...tier.fixedMirrors); i > 0; i--) fixed[free.pop()!] = rng() < 0.5 ? '/' : '\\'
  for (let i = randInt(rng, ...tier.fixedPrisms); i > 0; i--) fixed[free.pop()!] = 'P'

  const hand: Record<Hand, number> = { mirror: randInt(rng, ...tier.mirrors), prism: randInt(rng, ...tier.prisms) }
  if (hand.mirror + hand.prism < 3) hand.mirror++

  // Lay one answer down along the beam, piece by piece.
  const placed: Record<Cell, Piece> = {}
  const tempting = new Set<Cell>()
  const litCells = (t: Trace) => cells.filter(k => t.lit[k])
  for (const kind of shuffle([...Array(hand.mirror).fill('m'), ...Array(hand.prism).fill('P')] as string[], rng)) {
    const t = trace(n, source, { ...fixed, ...placed })
    litCells(t).forEach(k => tempting.add(k))
    const spots = litCells(t).filter(k => !fixed[k] && !placed[k])
    if (!spots.length) return null
    const at = spots[Math.floor(rng() * spots.length)]
    placed[at] = kind === 'P' ? 'P' : rng() < 0.5 ? '/' : '\\'
  }
  const sol = trace(n, source, { ...fixed, ...placed })
  const base = trace(n, source, fixed)

  // Stars where only the answer reaches; sensors on the paths you are drawn down.
  const emptyLit = litCells(sol).filter(k => !fixed[k] && !placed[k] && !base.lit[k])
  const nTargets = randInt(rng, ...tier.targets)
  if (emptyLit.length < nTargets) return null
  const targets = shuffle(emptyLit, rng).slice(0, nTargets)
  const dark = (k: Cell) => !fixed[k] && !placed[k] && !sol.lit[k]
  const near = cells.filter(k => {
    if (!dark(k)) return false
    const r = Math.floor(k / n), c = k % n
    return [0, 1, 2, 3].some(dd => {
      const rr = r + DR[dd], cc = c + DC[dd]
      return rr >= 0 && rr < n && cc >= 0 && cc < n && sol.lit[rr * n + cc]
    })
  })
  const nSensors = randInt(rng, ...tier.sensors)
  const pool = [...shuffle([...tempting].filter(dark), rng), ...shuffle(near, rng)]
  const sensors = [...new Set(pool)].slice(0, nSensors)
  if (sensors.length < nSensors) return null

  const p = { size: n, source, fixed, targets, sensors, hand }
  // Every piece in hand is needed: one fewer of either kind never does it.
  // (The cheap shallow searches go first; most boards fail here.)
  if (hand.prism && solve({ ...p, hand: { ...hand, prism: hand.prism - 1 } }, 0).length) return null
  if (solve({ ...p, hand: { ...hand, mirror: hand.mirror - 1 } }, 0).length) return null
  const solutions = solve(p, tier.maxSolutions)
  if (!solutions.length || solutions.length > tier.maxSolutions) return null
  const total = hand.mirror + hand.prism
  if (solutions.some(s => Object.keys(s).length < total)) return null
  const fog = fogFor(rng, tier, p, sol, base)
  if (!fog) return null
  return { ...p, fog, theme: themeKey, difficulty: d, solutions, seconds: tier.seconds }
}

/**
 * Square fog patches that hide what matters: each covers part of the answer's
 * beam and at most one cell of the beam as it comes in (so you can see where
 * to start), and from two patches on they hide at least one star.
 */
function fogFor(rng: Rng, tier: Tier, p: Board, sol: Trace, base: Trace): Cell[] | null {
  const n = p.size
  const want = randInt(rng, ...tier.fog)
  const fog = new Set<Cell>()
  let patches = 0
  for (let tries = 0; patches < want; tries++) {
    if (tries >= 80) return null
    const side = randInt(rng, ...tier.fogSide)
    const r0 = randInt(rng, 0, n - side), c0 = randInt(rng, 0, n - side)
    const cells: Cell[] = []
    for (let r = r0; r < r0 + side; r++) for (let c = c0; c < c0 + side; c++) cells.push(r * n + c)
    if (cells.some(k => fog.has(k))) continue
    // Some of the answer's path, little of the bare beam.
    if (!cells.some(k => sol.lit[k] && !base.lit[k]) || cells.filter(k => base.lit[k]).length > 1) continue
    cells.forEach(k => fog.add(k))
    patches++
  }
  if (want >= 2 && !p.targets.some(k => fog.has(k))) return null
  return [...fog].sort((x, y) => x - y)
}

export function makePuzzle(configId: string, difficulty: Difficulty, seed: number): Puzzle {
  const themeKey = (configId in THEMES ? configId : 'mendel') as ThemeKey
  const rng = mulberry32(seed ^ 0x3c6ef372)
  for (let attempt = 0; attempt < 3000; attempt++) {
    const p = tryPuzzle(rng, themeKey, difficulty)
    if (p) return p
  }
  // Practically unreachable; fall back to an easier tier rather than fail.
  if (difficulty > 1) return makePuzzle(configId, (difficulty - 1) as Difficulty, seed)
  throw new Error(`no mirror puzzle for ${configId}`)
}

/** An order to lay an answer in so that each piece lands where the beam already reaches. */
export function layingOrder(p: Board, sol: Record<Cell, Piece>): Cell[] {
  const left = Object.keys(sol).map(Number), placed: Record<Cell, Piece> = {}, order: Cell[] = []
  while (left.length) {
    const lit = trace(p.size, p.source, { ...p.fixed, ...placed }).lit
    const i = left.findIndex(k => lit[k])
    if (i < 0) break
    const [k] = left.splice(i, 1)
    placed[k] = sol[k]
    order.push(k)
  }
  return order
}

/** A short fingerprint of the board, used by tests to check variety. */
export const fingerprint = (p: Puzzle) =>
  `${p.size}:${p.source.row},${p.source.col}:${Object.entries(p.fixed).map(e => e.join('')).join(' ')}:${p.targets.join(' ')}`
