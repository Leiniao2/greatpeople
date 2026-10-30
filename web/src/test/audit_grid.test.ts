// Solvability audit for the grid/puzzle minigames.  Every hand-authored config
// (and every generated board, for several seeds) must be winnable: the solver
// here plays each game to completion using the game's own exported logic.
import { describe, it, expect } from 'vitest'
import type { Difficulty } from '@/games/types'
import { CONFIGS as KLOTSKI, buildBoard, canMove, movePiece } from '@/components/minigames/KlotskiGame'
import { CONFIGS as SLIDING } from '@/components/minigames/SlidingPuzzle'
import { CONFIGS as ICE, parseGrid, slidePos } from '@/components/minigames/IceSlideGame'
import { CONFIGS as BRIDGE, checkWin as bridgeWin, isBlocked } from '@/components/minigames/BridgeGame'
import { CONFIGS as PIPELINE, floodFill, getOpenings } from '@/components/minigames/PipelineGame'
import { CONFIGS as CIRCUIT } from '@/components/minigames/CircuitGame'
import { CONFIGS as MIRROR, traceLight } from '@/components/minigames/MirrorGame'
import { CONFIGS as JIGSAW } from '@/components/minigames/JigsawGame'
import { generate as generateSudoku, countSolutions } from '@/components/minigames/SudokuGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]

// ── Klotski ────────────────────────────────────────────────────────────────────

type Cells = [number, number][]
interface KPiece { id: number; cells: Cells; color: string; label: string; isGoal?: boolean }
type KDir = 'up' | 'down' | 'left' | 'right'
const KDIRS: KDir[] = ['up', 'down', 'left', 'right']

function shapeCode(cells: Cells): string {
  const minR = Math.min(...cells.map(([r]) => r)), minC = Math.min(...cells.map(([, c]) => c))
  return cells.map(([r, c]) => `${r - minR}.${c - minC}`).sort().join('|')
}

function topLeft(cells: Cells): [number, number] {
  return cells.reduce((min, [r, c]) => (r < min[0] || (r === min[0] && c < min[1]) ? [r, c] : min), cells[0])
}

/** BFS over single-cell slides (the moves the UI allows). Returns the optimal move count or -1. */
function solveKlotski(cfg: { rows: number; cols: number; pieces: KPiece[]; targetRow: number; targetCol: number }, limit = 400_000): number {
  const { rows, cols } = cfg
  const codes = new Map<string, number>()
  const codeOf = (p: KPiece) => {
    const key = p.isGoal ? 'GOAL' : shapeCode(p.cells)
    if (!codes.has(key)) codes.set(key, codes.size + 1)
    return codes.get(key)!
  }
  const encode = (ps: KPiece[]) => {
    const g = new Array(rows * cols).fill(0)
    for (const p of ps) for (const [r, c] of p.cells) g[r * cols + c] = codeOf(p)
    return g.join(',')
  }
  const isDone = (ps: KPiece[]) => {
    const goal = ps.find(p => p.isGoal)!
    const [r, c] = topLeft(goal.cells)
    return r === cfg.targetRow && c === cfg.targetCol
  }
  const start = cfg.pieces.map(p => ({ ...p, cells: p.cells.map(x => [...x] as [number, number]) }))
  if (isDone(start)) return 0
  const seen = new Set<string>([encode(start)])
  let frontier: KPiece[][] = [start]
  for (let depth = 1; frontier.length; depth++) {
    const next: KPiece[][] = []
    for (const ps of frontier) {
      const board = buildBoard(rows, cols, ps)
      for (const p of ps) {
        for (const dir of KDIRS) {
          if (!canMove(p, dir, board, rows, cols)) continue
          const nps = ps.map(q => (q.id === p.id ? movePiece(q, dir) : q))
          const key = encode(nps)
          if (seen.has(key)) continue
          seen.add(key)
          if (isDone(nps)) return depth
          next.push(nps)
        }
      }
      if (seen.size > limit) throw new Error('state limit exceeded')
    }
    frontier = next
  }
  return -1
}

describe('klotski', () => {
  for (const [id, cfg] of Object.entries(KLOTSKI)) {
    it(`${id}: pieces are well-formed`, () => {
      const occupied = new Map<string, number>()
      for (const p of cfg.pieces) {
        expect(p.cells.length, `${id} piece ${p.id} has cells`).toBeGreaterThan(0)
        for (const [r, c] of p.cells) {
          expect(r >= 0 && r < cfg.rows && c >= 0 && c < cfg.cols, `${id} piece ${p.id} cell (${r},${c}) in bounds`).toBe(true)
          const key = `${r},${c}`
          expect(occupied.has(key), `${id} cell (${r},${c}) used by pieces ${occupied.get(key)} and ${p.id}`).toBe(false)
          occupied.set(key, p.id)
        }
      }
      expect(occupied.size, `${id} has at least one empty cell`).toBeLessThan(cfg.rows * cfg.cols)
      const goals = cfg.pieces.filter(p => p.isGoal)
      expect(goals.length, `${id} has exactly one goal piece`).toBe(1)
      const goalRows = Math.max(...goals[0].cells.map(([r]) => r)) - Math.min(...goals[0].cells.map(([r]) => r)) + 1
      const goalCols = Math.max(...goals[0].cells.map(([, c]) => c)) - Math.min(...goals[0].cells.map(([, c]) => c)) + 1
      expect(cfg.targetRow + goalRows <= cfg.rows && cfg.targetCol + goalCols <= cfg.cols, `${id} target fits the goal piece`).toBe(true)
    })

    it(`${id}: is solvable`, () => {
      const moves = solveKlotski(cfg as never)
      expect(moves, `${id} has a solution`).toBeGreaterThan(0)
      console.log(`klotski ${id}: optimal ${moves} single-step moves`)
    })
  }
})

// ── Sliding puzzle ─────────────────────────────────────────────────────────────

describe('sliding puzzle', () => {
  const SOLVED = '1,2,3,4,5,6,7,8,0'
  for (const [id, cfg] of Object.entries(SLIDING)) {
    it(`${id}: scramble is a permutation and reachable from solved`, () => {
      expect([...cfg.initial].sort().join(',')).toBe('0,1,2,3,4,5,6,7,8')
      // Parity: a 3×3 scramble is solvable iff its inversion count is even.
      const tiles = cfg.initial.filter(v => v !== 0)
      let inv = 0
      for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) if (tiles[i] > tiles[j]) inv++
      expect(inv % 2, `${id} parity`).toBe(0)
      // BFS to be sure, and to know how long the optimal solution is.
      const seen = new Set<string>([cfg.initial.join(',')])
      let frontier = [cfg.initial]
      let depth = 0, found = cfg.initial.join(',') === SOLVED
      while (frontier.length && !found) {
        depth++
        const next: number[][] = []
        for (const b of frontier) {
          const z = b.indexOf(0), zr = Math.floor(z / 3), zc = z % 3
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const r = zr + dr, c = zc + dc
            if (r < 0 || r > 2 || c < 0 || c > 2) continue
            const nb = [...b]; nb[z] = nb[r * 3 + c]; nb[r * 3 + c] = 0
            const key = nb.join(',')
            if (seen.has(key)) continue
            seen.add(key)
            if (key === SOLVED) { found = true; break }
            next.push(nb)
          }
          if (found) break
        }
        frontier = next
      }
      expect(found, `${id} reachable`).toBe(true)
      console.log(`sliding ${id}: optimal ${depth} moves`)
    })
  }
})

// ── Ice slide ──────────────────────────────────────────────────────────────────

describe('ice slide', () => {
  for (const [id, cfg] of Object.entries(ICE)) {
    it(`${id}: exit is reachable by sliding`, () => {
      const width = cfg.grid[0].length
      for (const line of cfg.grid) expect(line.length, `${id} rectangular`).toBe(width)
      expect(cfg.grid.join('').split('S').length - 1, `${id} one start`).toBe(1)
      expect(cfg.grid.join('').split('E').length - 1, `${id} one exit`).toBe(1)
      const { grid, sr, sc } = parseGrid(cfg.grid)
      const seen = new Set<string>([`${sr},${sc}`])
      let frontier: [number, number][] = [[sr, sc]]
      let depth = 0, found = false
      while (frontier.length && !found) {
        depth++
        const next: [number, number][] = []
        for (const [r, c] of frontier) {
          for (const dir of ['up', 'down', 'left', 'right'] as const) {
            const [nr, nc] = slidePos(grid, r, c, dir)
            const key = `${nr},${nc}`
            if (seen.has(key)) continue
            seen.add(key)
            if (grid[nr][nc] === 'E') { found = true; break }
            next.push([nr, nc])
          }
          if (found) break
        }
        frontier = next
      }
      expect(found, `${id} exit reachable`).toBe(true)
      console.log(`ice ${id}: optimal ${depth} slides`)
    })
  }
})

// ── Bridges (hashi) ────────────────────────────────────────────────────────────

interface Island { id: number; r: number; c: number; n: number }

/** Backtracking hashi solver over nearest-neighbour edges, 0–2 bridges each, no crossings. */
function solveBridges(islands: Island[]): Map<string, number> | null {
  const edges: [Island, Island][] = []
  for (const a of islands) {
    // nearest neighbour to the right and below (no island in between)
    const right = islands.filter(b => b.r === a.r && b.c > a.c).sort((x, y) => x.c - y.c)[0]
    const down = islands.filter(b => b.c === a.c && b.r > a.r).sort((x, y) => x.r - y.r)[0]
    if (right) edges.push([a, right])
    if (down) edges.push([a, down])
  }
  const bridges = new Map<string, number>()
  const key = (a: Island, b: Island) => (a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`)
  const degree = new Map<number, number>(islands.map(i => [i.id, 0]))
  const remainingCap = (i: Island, from: number) => edges.slice(from).filter(([a, b]) => a.id === i.id || b.id === i.id).length * 2

  function rec(e: number): boolean {
    if (e === edges.length) return bridgeWin(islands as never, bridges as never)
    const [a, b] = edges[e]
    for (const n of [2, 1, 0]) {
      if (degree.get(a.id)! + n > a.n || degree.get(b.id)! + n > b.n) continue
      if (n > 0 && isBlocked(islands as never, bridges as never, a as never, b as never)) continue
      bridges.set(key(a, b), n)
      degree.set(a.id, degree.get(a.id)! + n); degree.set(b.id, degree.get(b.id)! + n)
      // prune: can every island touched so far still reach its count?
      const ok = islands.every(i => degree.get(i.id)! + remainingCap(i, e + 1) >= i.n)
      if (ok && rec(e + 1)) return true
      degree.set(a.id, degree.get(a.id)! - n); degree.set(b.id, degree.get(b.id)! - n)
      bridges.delete(key(a, b))
    }
    return false
  }
  return rec(0) ? bridges : null
}

describe('bridges', () => {
  for (const [id, cfg] of Object.entries(BRIDGE)) {
    it(`${id}: has a non-crossing solution the game accepts`, () => {
      cfg.islands.forEach((isl, i) => {
        expect(isl.id, `${id} island ids are positional`).toBe(i)
        expect(isl.r >= 0 && isl.r < cfg.rows && isl.c >= 0 && isl.c < cfg.cols, `${id} island ${i} in bounds`).toBe(true)
      })
      const total = cfg.islands.reduce((s, i) => s + i.n, 0)
      expect(total % 2, `${id} bridge count parity`).toBe(0)
      const sol = solveBridges(cfg.islands)
      expect(sol, `${id} solvable`).not.toBeNull()
    })
  }
})

// ── Pipeline ───────────────────────────────────────────────────────────────────

type PDir = 0 | 1 | 2 | 3

describe('pipeline', () => {
  for (const [id, cfg] of Object.entries(PIPELINE)) {
    it(`${id}: the authored (rotation 0) layout connects source to sink`, () => {
      expect(cfg.tiles.length, `${id} tile count`).toBe(cfg.cols * cfg.rows)
      expect(cfg.tiles[cfg.sourceIdx].shape).toBe('source')
      expect(cfg.tiles[cfg.sinkIdx].shape).toBe('sink')
      const tiles = cfg.tiles.map(t => ({
        shape: t.shape, base: t.base, rotation: t.rotation, fixed: !!t.fixed,
        openings: getOpenings(t.base, t.rotation),
      }))
      const lit = floodFill(tiles as never, cfg.cols, cfg.rows, cfg.sourceIdx)
      expect(lit.has(cfg.sinkIdx), `${id} rotation-0 layout reaches the sink`).toBe(true)
    })

    it(`${id}: a path exists whatever the shuffle (every tile on it can be rotated to fit)`, () => {
      const opp: PDir[] = [2, 3, 0, 1]
      const canFit = (idx: number, inDir: PDir, outDir: PDir) => {
        const t = cfg.tiles[idx]
        const rots = t.fixed ? [t.rotation] : [0, 1, 2, 3]
        return rots.some(r => { const o = getOpenings(t.base, r); return o.includes(inDir) && o.includes(outDir) })
      }
      const nb = (idx: number, d: PDir): number | null => {
        const col = idx % cfg.cols, row = Math.floor(idx / cfg.cols)
        if (d === 0 && row > 0) return idx - cfg.cols
        if (d === 1 && col < cfg.cols - 1) return idx + 1
        if (d === 2 && row < cfg.rows - 1) return idx + cfg.cols
        if (d === 3 && col > 0) return idx - 1
        return null
      }
      // DFS over (cell, direction we entered from) with a simple-path constraint.
      const sourceOpen = getOpenings(cfg.tiles[cfg.sourceIdx].base, cfg.tiles[cfg.sourceIdx].rotation)
      const sinkOpen = getOpenings(cfg.tiles[cfg.sinkIdx].base, cfg.tiles[cfg.sinkIdx].rotation)
      const onPath = new Set<number>([cfg.sourceIdx])
      const dfs = (idx: number, entered: PDir): boolean => {
        for (const out of [0, 1, 2, 3] as PDir[]) {
          if (out === entered) continue
          const n = nb(idx, out)
          if (n === null || onPath.has(n)) continue
          if (!canFit(idx, entered, out)) continue
          const inDir = opp[out]
          if (n === cfg.sinkIdx) { if (sinkOpen.includes(inDir)) return true; continue }
          onPath.add(n)
          if (dfs(n, inDir)) return true
          onPath.delete(n)
        }
        return false
      }
      const ok = (sourceOpen as PDir[]).some(out => {
        const n = nb(cfg.sourceIdx, out)
        if (n === null) return false
        if (n === cfg.sinkIdx) return sinkOpen.includes(opp[out])
        onPath.add(n)
        const r = dfs(n, opp[out])
        onPath.delete(n)
        return r
      })
      expect(ok, `${id} has a rotatable path`).toBe(true)
    })
  }
})

// ── Circuit ────────────────────────────────────────────────────────────────────

describe('circuit', () => {
  for (const [id, cfg] of Object.entries(CIRCUIT)) {
    it(`${id}: closing every switch wins, and the bulb agrees with the win condition`, () => {
      const ids = cfg.switches.map(s => s.id)
      const all: Record<string, boolean> = Object.fromEntries(ids.map(i => [i, true]))
      expect(cfg.winCondition(all)).toBe(true)
      const none: Record<string, boolean> = Object.fromEntries(ids.map(i => [i, false]))
      expect(cfg.winCondition(none), `${id} not won at start`).toBe(false)
      for (let mask = 0; mask < 1 << ids.length; mask++) {
        const sw: Record<string, boolean> = Object.fromEntries(ids.map((i, k) => [i, !!(mask & (1 << k))]))
        expect(cfg.bulbActiveWhen(sw)).toBe(cfg.winCondition(sw))
      }
    })
  }
})

// ── Mirrors ────────────────────────────────────────────────────────────────────

describe('mirrors', () => {
  for (const [id, cfg] of Object.entries(MIRROR)) {
    it(`${id}: solvable with at most maxMirrors, and not already solved`, () => {
      const g = cfg.gridSize
      const onEdge = (row: number, col: number) =>
        ((row === -1 || row === g) && col >= 0 && col < g) || ((col === -1 || col === g) && row >= 0 && row < g)
      expect(onEdge(cfg.source.row, cfg.source.col), `${id} source on an edge`).toBe(true)
      expect(onEdge(cfg.target.row, cfg.target.col), `${id} target on an edge`).toBe(true)
      const fixedMap: Record<string, '/' | '\\'> = {}
      for (const f of cfg.fixed) {
        expect(f.row >= 0 && f.row < g && f.col >= 0 && f.col < g, `${id} fixed mirror in bounds`).toBe(true)
        expect(fixedMap[`${f.row},${f.col}`], `${id} duplicate fixed mirror`).toBeUndefined()
        fixedMap[`${f.row},${f.col}`] = f.mirror
      }
      expect(traceLight(g, cfg.source, fixedMap, cfg.target).hits, `${id} must need at least one placed mirror`).toBe(false)

      const cells: string[] = []
      for (let r = 0; r < g; r++) for (let c = 0; c < g; c++) if (!fixedMap[`${r},${c}`]) cells.push(`${r},${c}`)
      const kinds: ('/' | '\\')[] = ['/', '\\']
      let best = -1
      const search = (start: number, placed: Record<string, '/' | '\\'>, count: number): boolean => {
        if (traceLight(g, cfg.source, { ...fixedMap, ...placed }, cfg.target).hits) { best = count; return true }
        if (count >= cfg.maxMirrors) return false
        for (let i = start; i < cells.length; i++)
          for (const k of kinds)
            if (search(i + 1, { ...placed, [cells[i]]: k }, count + 1)) return true
        return false
      }
      expect(search(0, {}, 0), `${id} solvable with ${cfg.maxMirrors} mirrors`).toBe(true)
      console.log(`mirror ${id}: solvable with ${best}/${cfg.maxMirrors} mirrors`)
    })
  }
})

// ── Jigsaw ─────────────────────────────────────────────────────────────────────

describe('jigsaw', () => {
  for (const [id, cfg] of Object.entries(JIGSAW)) {
    it(`${id}: pieces are unique and fill whole rows`, () => {
      const ids = cfg.pieces.map(p => p.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(cfg.pieces.length).toBeGreaterThan(1)
      expect(cfg.pieces.length % cfg.cols, `${id} fills ${cfg.cols} columns`).toBe(0)
    })
  }
})

// ── Sudoku ─────────────────────────────────────────────────────────────────────

describe('sudoku', () => {
  for (const d of DIFFS) {
    it(`d${d}: boards for several seeds are unique and generate quickly`, () => {
      for (const seed of [1, 2, 3, 11, 99]) {
        const t0 = Date.now()
        const { board, puzzle, solution } = generateSudoku(d, seed)
        expect(countSolutions(board, puzzle.map(r => [...r]))).toBe(1)
        for (let r = 0; r < board.n; r++) {
          expect(new Set(solution[r]).size).toBe(board.n)
          expect(new Set(solution.map(row => row[r])).size).toBe(board.n)
        }
        expect(Date.now() - t0, `d${d} seed ${seed} generation time`).toBeLessThan(2500)
      }
    })
  }
})
