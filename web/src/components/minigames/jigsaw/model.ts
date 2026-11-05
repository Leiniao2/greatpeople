// Jigsaw: a real painting cut into interlocking pieces.  The seed decides the
// shape of every seam (which side the tab sits on), where each piece lies on
// the table and, at the top tier, how it is turned.  Everything here is pure
// so tests can solve every config at every tier.

import type { Difficulty } from '@/games/types'
import { mulberry32, type Rng } from '../_shared/rng'

export interface Tier {
  cols: number
  rows: number
  /** Opacity of the picture printed on the empty board (0: none). */
  ghost: number
  /** Faint cell lines on the board. */
  grid: boolean
  /** Pieces lie on the table turned by quarter turns; tap to turn. */
  rotate: boolean
  /** Looks at the finished picture (Infinity: always allowed). */
  peeks: number
  seconds: number
}

//   D1  12 pieces, picture printed on the board, cell lines
//   D2  24 pieces, faint picture
//   D3  35 pieces, no picture, two peeks
//   D4  40 pieces turned on the table, one peek, a clock
export const TIERS: Record<Difficulty, Tier> = {
  1: { cols: 4, rows: 3, ghost: 0.4, grid: true, rotate: false, peeks: Infinity, seconds: 0 },
  2: { cols: 6, rows: 4, ghost: 0.18, grid: false, rotate: false, peeks: Infinity, seconds: 0 },
  3: { cols: 7, rows: 5, ghost: 0, grid: false, rotate: false, peeks: 2, seconds: 0 },
  4: { cols: 8, rows: 5, ghost: 0, grid: false, rotate: true, peeks: 1, seconds: 420 },
}

/** Board size in SVG units; the pictures are 16:9. */
export const BOARD_W = 1600
export const BOARD_H = 900
/** The table the pieces start on, under the board. */
export const TABLE_H = 760
export const GAP = 40
/** Loose pieces on the table are drawn this much smaller, so they fit beside each other. */
export const TABLE_SCALE = 0.6
/** How close to its home a piece snaps in, as a share of a cell. */
export const SNAP = 0.3

/** +1: the tab sticks out of the first piece into the second; -1: the other way. */
export type Seam = 1 | -1

export interface PieceState {
  id: number
  row: number
  col: number
  /** Top-left of the cell box, in SVG units. */
  x: number
  y: number
  /** Quarter turns clockwise (0–3). */
  rot: number
  placed: boolean
}

export interface Puzzle {
  tier: Tier
  cols: number
  rows: number
  cellW: number
  cellH: number
  /** hSeams[r][c]: between (r, c) and (r + 1, c). */
  hSeams: Seam[][]
  /** vSeams[r][c]: between (r, c) and (r, c + 1). */
  vSeams: Seam[][]
  pieces: PieceState[]
}

const seam = (rng: Rng): Seam => (rng() < 0.5 ? 1 : -1)

export function makePuzzle(difficulty: Difficulty, seed: number): Puzzle {
  const tier = TIERS[difficulty]
  const { cols, rows } = tier
  const rng = mulberry32(seed ^ 0x2c1b3c6d)
  const cellW = BOARD_W / cols, cellH = BOARD_H / rows
  const hSeams = Array.from({ length: rows - 1 }, () => Array.from({ length: cols }, () => seam(rng)))
  const vSeams = Array.from({ length: rows }, () => Array.from({ length: cols - 1 }, () => seam(rng)))
  // Lay the pieces out on the table, shrunk, in a loose shuffled grid.
  const n = cols * rows
  const order = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
  const slotW = cellW * TABLE_SCALE * 1.3
  const perRow = Math.max(1, Math.floor(BOARD_W / slotW))
  const tableRows = Math.ceil(n / perRow)
  const slotH = TABLE_H / tableRows
  const padX = (BOARD_W - perRow * slotW) / 2
  const pieces: PieceState[] = order.map((id, k) => {
    const sr = Math.floor(k / perRow), sc = k % perRow
    const roomX = Math.max(0, slotW - cellW * TABLE_SCALE), roomY = Math.max(0, slotH - cellH * TABLE_SCALE)
    // The centre of the piece lies in its slot; x, y is the full-size cell box around it.
    const cx = padX + (sc + 0.5) * slotW + (rng() - 0.5) * roomX * 0.6
    const cy = BOARD_H + GAP + (sr + 0.5) * slotH + (rng() - 0.5) * roomY * 0.6
    return {
      id, row: Math.floor(id / cols), col: id % cols,
      x: cx - cellW / 2,
      y: cy - cellH / 2,
      rot: tier.rotate ? 1 + Math.floor(rng() * 3) : 0,
      placed: false,
    }
  }).sort((a, b) => a.id - b.id)
  return { tier, cols, rows, cellW, cellH, hSeams, vSeams, pieces }
}

/** A loose piece whose centre is below the board lies on the table (drawn small). */
export const onTable = (p: Puzzle, piece: Pick<PieceState, 'y' | 'placed'>) => !piece.placed && piece.y + p.cellH / 2 > BOARD_H

export const homeOf = (p: Puzzle, piece: PieceState) => ({ x: piece.col * p.cellW, y: piece.row * p.cellH })

/** Whether a piece dropped at (x, y) with its rotation fits its home. */
export function fits(p: Puzzle, piece: PieceState, x: number, y: number): boolean {
  const home = homeOf(p, piece)
  return piece.rot % 4 === 0
    && Math.abs(x - home.x) <= p.cellW * SNAP
    && Math.abs(y - home.y) <= p.cellH * SNAP
}

/** Tab directions of a piece's four sides (top, right, bottom, left): +1 out, -1 in, 0 flat. */
export function sides(p: Puzzle, row: number, col: number): [number, number, number, number] {
  const top = row === 0 ? 0 : -p.hSeams[row - 1][col]
  const bottom = row === p.rows - 1 ? 0 : p.hSeams[row][col]
  const right = col === p.cols - 1 ? 0 : p.vSeams[row][col]
  const left = col === 0 ? 0 : -p.vSeams[row][col - 1]
  return [top, right, bottom, left]
}

// One side of a classic piece, from (0, 0) to (1, 0): cubic segments
// [control 1, control 2, end] in (u along the side, v out of the piece in
// tab units).  A narrow neck, then a round head.
const TAB: [number, number][][] = [
  [[0.40, 0.00], [0.42, 0.10], [0.38, 0.20]],
  [[0.34, 0.30], [0.40, 0.40], [0.50, 0.40]],
  [[0.60, 0.40], [0.66, 0.30], [0.62, 0.20]],
  [[0.58, 0.10], [0.60, 0.00], [0.66, 0.00]],
]

/**
 * SVG path of a piece's outline, in the piece's own frame: the cell's
 * top-left corner at (0, 0), so tabs reach into negative coordinates.
 */
export function piecePath(p: Puzzle, row: number, col: number): string {
  const w = p.cellW, h = p.cellH
  const t = Math.min(w, h)
  const [top, right, bottom, left] = sides(p, row, col)
  // Corners clockwise and each side's outward normal.
  const edges: { a: [number, number]; b: [number, number]; n: [number, number]; s: number }[] = [
    { a: [0, 0], b: [w, 0], n: [0, -1], s: top },
    { a: [w, 0], b: [w, h], n: [1, 0], s: right },
    { a: [w, h], b: [0, h], n: [0, 1], s: bottom },
    { a: [0, h], b: [0, 0], n: [-1, 0], s: left },
  ]
  const f = (n: number) => Math.round(n * 10) / 10
  let d = 'M 0 0'
  for (const e of edges) {
    if (!e.s) { d += ` L ${f(e.b[0])} ${f(e.b[1])}`; continue }
    const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1]
    const at = ([u, v]: [number, number]): string => {
      const out = v * t * e.s
      return `${f(e.a[0] + dx * u + e.n[0] * out)} ${f(e.a[1] + dy * u + e.n[1] * out)}`
    }
    d += ` L ${at([0.34, 0])}`
    for (const [c1, c2, end] of TAB) d += ` C ${at(c1)} ${at(c2)} ${at(end)}`
    d += ` L ${f(e.b[0])} ${f(e.b[1])}`
  }
  return d + ' Z'
}

/** How far a tab can reach past the cell, for sizing each piece's drawing box. */
export const tabReach = (p: Puzzle) => Math.min(p.cellW, p.cellH) * 0.42
