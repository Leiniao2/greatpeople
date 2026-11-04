import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, randInt, shuffle, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Cargo Hold — pack polyomino crates into the cross-section of a ship's hold
// (port on the left, starboard on the right, keel at the bottom).  Crates can
// be rotated and flipped; tap a crate in the hold to unload it again.
//
// Each config is a different rule, not just a different board:
//   voc-spice    VALUE    — some crates are low-value filler; reach the guilder target
//   hanse-cog    BALANCE  — stow everything and keep the port/starboard trim inside the mark
//   zheng-he     LAYERING — fill the hold; nothing on top of porcelain, iron ballast on the keel
//   tea-clipper  SPEED    — fill the hold with no more than N crates (small crates are a trap)
//
//   D1  5×3 hold (~13 cells, 3–4 crates)   loads: crates × 3 + 4   ≈ 1 min
//   D2  6×4 hold (~21 cells, 5–6 crates)   loads: crates × 3       ≈ 1.5 min
//   D3  7×4 hold (~25 cells, 5–7 crates)   loads: crates × 2 + 4   ≈ 2 min
//   D4  7×5 hold (~28 cells, 6–8 crates)   loads: crates × 2 + 2   ≈ 3 min
//
// Every instance is made by cutting the hold itself into seeded crates, so
// the cut is a known solution; targets (value, trim, crate count, which
// crates are fragile or ballast) are read off that solution.  Unloading is
// free; every load spends one of the day's crane lifts.

export type Mode = 'value' | 'balance' | 'fragile' | 'speed'

export interface Good { name: string; icon: string; color: string; density: number }

interface CargoConfig {
  title: string
  intro: string
  fact: string
  mode: Mode
  goods: Good[]
  decoys: Good[]
  /** Fragile mode only. */
  fragile?: Good
  ballast?: Good
}

export const CONFIGS: Record<string, CargoConfig> = {
  'voc-spice': {
    title: 'VOC Spice Fleet',
    intro: 'Hold space is short on the run home to Amsterdam. Load the crates worth the most guilders per square until the manifest reaches its target — big cheap crates waste room.',
    fact: 'In 1621 the Dutch East India Company (VOC) seized the Banda Islands, then the only source of nutmeg and mace in the world, so it could control the price of both spices in Europe.',
    mode: 'value',
    goods: [
      { name: 'Nutmeg', icon: '🌰', color: '#b5652b', density: 9 },
      { name: 'Mace', icon: '🟠', color: '#d9822b', density: 8 },
      { name: 'Cloves', icon: '🌿', color: '#7a4a2a', density: 7 },
      { name: 'Pepper', icon: '⚫', color: '#4f4a45', density: 6 },
      { name: 'Cinnamon', icon: '🪵', color: '#a0522d', density: 5 },
    ],
    decoys: [
      { name: 'Copper', icon: '🟤', color: '#b87333', density: 4 },
      { name: 'Sappanwood', icon: '🪓', color: '#8b5a3c', density: 3 },
      { name: 'Rice', icon: '🍚', color: '#d8cfb4', density: 2 },
    ],
  },
  'hanse-cog': {
    title: 'The Hanseatic Cog',
    intro: 'Stow every bale and barrel so the cog floats level. Heavy cargo far to one side makes her list — keep the trim inside the mark.',
    fact: 'The Bremen Cog, dug out of the River Weser in 1962, was built around 1380. Cogs like her were the bulk carriers of the Hanseatic League, moving grain, salt, herring, cloth and timber around the Baltic and the North Sea.',
    mode: 'balance',
    goods: [
      { name: 'Cloth', icon: '🧶', color: '#7d8fb3', density: 1 },
      { name: 'Grain', icon: '🌾', color: '#d6b25e', density: 2 },
      { name: 'Herring', icon: '🐟', color: '#7ba3a8', density: 3 },
      { name: 'Salt', icon: '🧂', color: '#c9c3b8', density: 4 },
    ],
    decoys: [],
  },
  'zheng-he': {
    title: "Zheng He's Treasure Ship",
    intro: 'Fill the hold completely. Porcelain must have nothing stacked on top of it, and iron ballast must rest on the bottom of the hull.',
    fact: 'Between 1405 and 1433 Zheng He led seven Ming fleets across the Indian Ocean, as far as Arabia and East Africa, carrying silk and porcelain as gifts and trade goods. Chinese ships of the time already split the hull into watertight compartments with bulkheads.',
    mode: 'fragile',
    goods: [
      { name: 'Silk', icon: '🧵', color: '#c0587a', density: 1 },
      { name: 'Tea', icon: '🍵', color: '#6f8f4e', density: 1 },
      { name: 'Lacquer', icon: '🟥', color: '#9e2b25', density: 1 },
    ],
    decoys: [],
    fragile: { name: 'Porcelain', icon: '🏺', color: '#4a6fb5', density: 1 },
    ballast: { name: 'Iron ballast', icon: '⚓', color: '#555b63', density: 1 },
  },
  'tea-clipper': {
    title: 'The Great Tea Race',
    intro: 'Every crate takes time to swing aboard. Fill the whole hold with no more than the allowed number of crates and be first home to London.',
    fact: 'In the Great Tea Race of 1866 the clippers Taeping and Ariel left Fuzhou on the same tide and reached London 99 days later, docking less than an hour apart.',
    mode: 'speed',
    goods: [
      { name: 'Tea chests', icon: '🍵', color: '#5f7f3e', density: 1 },
      { name: 'Silk', icon: '🧵', color: '#b0527a', density: 1 },
      { name: 'Cassia', icon: '🪵', color: '#9a5b34', density: 1 },
    ],
    decoys: [
      { name: 'Sundries', icon: '📦', color: '#a39276', density: 1 },
    ],
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Shapes ─────────────────────────────────────────────────────────────────────

export type Cell = [number, number]

export function normalize(shape: Cell[]): Cell[] {
  const mr = Math.min(...shape.map(s => s[0])), mc = Math.min(...shape.map(s => s[1]))
  return shape.map(([r, c]) => [r - mr, c - mc] as Cell).sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

/** Flip (mirror left–right) first, then rotate a quarter turn clockwise `rot` times. */
export function transform(shape: Cell[], rot: number, flip: boolean): Cell[] {
  let s = shape.map(([r, c]) => [r, flip ? -c : c] as Cell)
  for (let k = 0; k < ((rot % 4) + 4) % 4; k++) s = s.map(([r, c]) => [c, -r] as Cell)
  return normalize(s)
}

export const shapeKey = (s: Cell[]) => normalize(s).map(([r, c]) => `${r},${c}`).join(';')

// ── Hold ───────────────────────────────────────────────────────────────────────

export interface Hold { w: number; h: number; inHull: boolean[]; count: number }

export function makeHold(difficulty: Difficulty, rng: Rng): Hold {
  const [w, h] = scale<[number, number]>(difficulty, [[5, 3], [6, 4], [7, 4], [7, 5]])
  const inHull = Array(w * h).fill(true)
  const cut = (r: number, c: number) => { if (r >= 0 && r < h && c >= 0 && c < w) inHull[r * w + c] = false }
  // Taper towards the keel: [rows from the bottom] → cells trimmed per side.
  const taper = scale<number[]>(difficulty, [[1], [1], [1], [2, 1]])
  taper.forEach((t, k) => { for (let i = 0; i < t; i++) { cut(h - 1 - k, i); cut(h - 1 - k, w - 1 - i) } })
  // Seeded features: a hatch coaming at a deck corner, a mast step on the keelson.
  if (difficulty >= 2 && rng() < 0.5) cut(0, rng() < 0.5 ? 0 : w - 1)
  if (difficulty >= 2 && rng() < 0.6) {
    const bottomRow = h - 1 - (taper.length > 1 ? 1 : 0)
    cut(bottomRow - (difficulty >= 4 ? 0 : 1), randInt(rng, 2, w - 3))
  }
  if (difficulty === 2 && rng() < 0.5) cut(h - 2, rng() < 0.5 ? 0 : w - 1)
  return { w, h, inHull, count: inHull.filter(Boolean).length }
}

function neighbours(hold: Hold, i: number): number[] {
  const { w, h } = hold, r = Math.floor(i / w), c = i % w
  const out: number[] = []
  if (r > 0) out.push(i - w)
  if (r < h - 1) out.push(i + w)
  if (c > 0) out.push(i - 1)
  if (c < w - 1) out.push(i + 1)
  return out.filter(j => hold.inHull[j])
}

/** Cut the hold into connected regions of roughly [minS, maxS] cells. */
export function partition(hold: Hold, rng: Rng, minS: number, maxS: number): number[][] {
  const owner = Array(hold.w * hold.h).fill(-1)
  const regions: number[][] = []
  for (let i = 0; i < owner.length; i++) {
    if (!hold.inHull[i] || owner[i] >= 0) continue
    const id = regions.length
    const target = randInt(rng, minS, maxS)
    const region = [i]
    owner[i] = id
    while (region.length < target) {
      const frontier = [...new Set(region.flatMap(j => neighbours(hold, j)).filter(j => owner[j] < 0))]
      if (!frontier.length) break
      const j = frontier[Math.floor(rng() * frontier.length)]
      owner[j] = id
      region.push(j)
    }
    regions.push(region)
  }
  // Merge stranded small regions into their smallest neighbour.
  for (let guard = 0; guard < 50; guard++) {
    const small = regions.findIndex(r => r.length > 0 && r.length < minS)
    if (small < 0) break
    const adj = [...new Set(regions[small].flatMap(j => neighbours(hold, j)).map(j => owner[j]).filter(o => o !== small))]
    if (!adj.length) break
    const into = adj.reduce((a, b) => (regions[a].length <= regions[b].length ? a : b))
    for (const j of regions[small]) owner[j] = into
    regions[into].push(...regions[small])
    regions[small] = []
  }
  return regions.filter(r => r.length)
}

function cellsToShape(hold: Hold, cells: number[]): Cell[] {
  return normalize(cells.map(i => [Math.floor(i / hold.w), i % hold.w] as Cell))
}

function randomPolyomino(rng: Rng, size: number): Cell[] {
  const cells: Cell[] = [[0, 0]]
  const has = (r: number, c: number) => cells.some(x => x[0] === r && x[1] === c)
  while (cells.length < size) {
    const [r, c] = cells[Math.floor(rng() * cells.length)]
    const d = [[0, 1], [1, 0], [0, -1], [-1, 0]][Math.floor(rng() * 4)]
    if (!has(r + d[0], c + d[1])) cells.push([r + d[0], c + d[1]])
  }
  return normalize(cells)
}

// ── Puzzle ─────────────────────────────────────────────────────────────────────

export type Kind = 'normal' | 'fragile' | 'ballast'

export interface Piece {
  id: number
  /** Orientation as it first appears in the tray. */
  shape: Cell[]
  good: Good
  size: number
  value: number
  weight: number
  kind: Kind
  decoy: boolean
}

export interface Placement { pieceId: number; cells: number[] }

export interface Puzzle {
  mode: Mode
  hold: Hold
  pieces: Piece[]
  /** A known winning stowage. */
  solution: Placement[]
  /** value: guilders needed.  balance: trim allowed either side.  speed: crates allowed. */
  target: number
  tol: number
  maxPieces: number
  /** Crane lifts (loads) available. */
  cap: number
}

export function capFor(difficulty: Difficulty, crates: number): number {
  return scale(difficulty, [crates * 3 + 4, crates * 3, crates * 2 + 4, crates * 2 + 2])
}

/** Moment about the centreline: + is starboard (right), − is port (left). */
export function trimOf(hold: Hold, pieces: Piece[], placed: Placement[]): number {
  let m = 0
  for (const p of placed) {
    const pc = pieces[p.pieceId]
    const d = pc.weight / pc.size
    for (const i of p.cells) m += d * ((i % hold.w) + 0.5 - hold.w / 2)
  }
  return Math.round(m * 10) / 10
}

function fragileOk(hold: Hold, owner: number[], cells: number[], id: number): boolean {
  return cells.every(i => i < hold.w || !hold.inHull[i - hold.w] || owner[i - hold.w] < 0 || owner[i - hold.w] === id)
}
function ballastOk(hold: Hold, cells: number[]): boolean {
  return cells.some(i => i + hold.w >= hold.w * hold.h || !hold.inHull[i + hold.w])
}
/** Strict version for generation: nothing (even empty hull) may be above, except deck or own crate. */
function fragileCandidate(hold: Hold, owner: number[], cells: number[], id: number): boolean {
  return cells.every(i => i < hold.w || !hold.inHull[i - hold.w] || owner[i - hold.w] === id)
}

function makeGood(cfg: CargoConfig, rng: Rng): Good { return cfg.goods[Math.floor(rng() * cfg.goods.length)] }

export function generate(configId: string, difficulty: Difficulty, seed: number): Puzzle {
  const cfg = CONFIGS[configId] ?? CONFIGS['voc-spice']
  const mode = cfg.mode
  const rng = mulberry32(hashString(`cargo:${configId}:${difficulty}:${seed}`))
  const hold = makeHold(difficulty, rng)
  const [minS, maxS] = mode === 'speed' ? (difficulty === 1 ? [3, 5] : [4, 6]) : [3, 5]
  const nFragile = scale(difficulty, [1, 1, 2, 2]), nBallast = scale(difficulty, [0, 1, 1, 2])

  let regions: number[][] = []
  let kinds: Kind[] = []
  for (let attempt = 0; attempt < 200; attempt++) {
    regions = partition(hold, rng, minS, maxS)
    if (regions.some(r => r.length > maxS + 1) && attempt < 150) continue
    kinds = regions.map(() => 'normal')
    if (mode !== 'fragile') break
    const owner = Array(hold.w * hold.h).fill(-1)
    regions.forEach((r, id) => r.forEach(i => { owner[i] = id }))
    const frag = shuffle(regions.map((_, id) => id).filter(id => fragileCandidate(hold, owner, regions[id], id)), rng)
    const ball = shuffle(regions.map((_, id) => id).filter(id => ballastOk(hold, regions[id]) && !frag.slice(0, nFragile).includes(id)), rng)
    if (frag.length < nFragile || ball.length < nBallast) continue
    frag.slice(0, nFragile).forEach(id => { kinds[id] = 'fragile' })
    ball.slice(0, nBallast).forEach(id => { kinds[id] = 'ballast' })
    break
  }

  // Goods for the real crates.
  let goods = regions.map(() => makeGood(cfg, rng))
  if (mode === 'fragile') goods = kinds.map((k, i) => (k === 'fragile' ? cfg.fragile! : k === 'ballast' ? cfg.ballast! : goods[i]))
  let tol = 0
  if (mode === 'balance') {
    // Pick the loading of the solution that floats most level.
    let best = goods, bestTrim = Infinity
    for (let t = 0; t < 80; t++) {
      const g = regions.map(() => makeGood(cfg, rng))
      const pcs = g.map((good, id) => ({ id, size: regions[id].length, weight: good.density * regions[id].length } as Piece))
      const tr = Math.abs(trimOf(hold, pcs, regions.map((cells, id) => ({ pieceId: id, cells }))))
      if (tr < bestTrim) { bestTrim = tr; best = g }
    }
    goods = best
    const total = goods.reduce((a, g, id) => a + g.density * regions[id].length, 0)
    const base = Math.round(total * hold.w * scale(difficulty, [0.05, 0.03, 0.018, 0.008]) * 2) / 2
    tol = Math.max(bestTrim, base, 1)
  }

  const real: Omit<Piece, 'id' | 'shape'>[] = regions.map((cells, id) => ({
    good: goods[id], size: cells.length, value: goods[id].density * cells.length,
    weight: goods[id].density * cells.length, kind: kinds[id], decoy: false,
  }))
  const realShapes = regions.map(cells => cellsToShape(hold, cells))

  // Decoys.
  const nDecoys = mode === 'value' ? scale(difficulty, [1, 2, 2, 3]) : mode === 'speed' ? scale(difficulty, [2, 2, 3, 3]) : 0
  const decoyShapes: Cell[][] = []
  const decoys: Omit<Piece, 'id' | 'shape'>[] = []
  for (let k = 0; k < nDecoys; k++) {
    const size = mode === 'value' ? randInt(rng, 4, 6) : randInt(rng, 2, 3)
    decoyShapes.push(randomPolyomino(rng, size))
    const good = cfg.decoys[Math.floor(rng() * cfg.decoys.length)]
    decoys.push({ good, size, value: good.density * size, weight: good.density * size, kind: 'normal', decoy: true })
  }

  // Shuffle into the tray, each in a random orientation.
  const all = [...real.map((p, i) => ({ p, s: realShapes[i], src: i })), ...decoys.map((p, i) => ({ p, s: decoyShapes[i], src: -1 }))]
  const order = shuffle(all, rng)
  const pieces: Piece[] = []
  const solution: Placement[] = []
  order.forEach((o, id) => {
    pieces.push({ ...o.p, id, shape: transform(o.s, randInt(rng, 0, 3), rng() < 0.5) })
    if (o.src >= 0) solution.push({ pieceId: id, cells: [...regions[o.src]].sort((a, b) => a - b) })
  })

  const solValue = solution.reduce((a, s) => a + pieces[s.pieceId].value, 0)
  const target = mode === 'value' ? Math.round(solValue * scale(difficulty, [0.8, 0.88, 0.94, 1])) : 0
  const maxPieces = mode === 'speed' ? solution.length + (difficulty <= 2 ? 1 : 0) : 0
  return { mode, hold, pieces, solution, target, tol, maxPieces, cap: capFor(difficulty, solution.length) }
}

export function planLevel(configId: string, difficulty: Difficulty, seed: number): Puzzle {
  return generate(CONFIGS[configId] ? configId : 'voc-spice', difficulty, seed)
}

// ── Rules ──────────────────────────────────────────────────────────────────────

export function ownerMap(hold: Hold, placed: Placement[]): number[] {
  const owner = Array(hold.w * hold.h).fill(-1)
  for (const p of placed) for (const i of p.cells) owner[i] = p.pieceId
  return owner
}

/** Cells covered when `shape` is laid with shape[k] on `cell`, or null when out of hull. */
export function cellsAt(hold: Hold, shape: Cell[], cell: number, k = 0): number[] | null {
  const r0 = Math.floor(cell / hold.w) - shape[k][0], c0 = (cell % hold.w) - shape[k][1]
  const out: number[] = []
  for (const [r, c] of shape) {
    const rr = r + r0, cc = c + c0
    if (rr < 0 || cc < 0 || rr >= hold.h || cc >= hold.w || !hold.inHull[rr * hold.w + cc]) return null
    out.push(rr * hold.w + cc)
  }
  return out
}

/** Lay a crate covering the tapped cell: its top-left square first, then any other square. */
export function fitAt(hold: Hold, placed: Placement[], shape: Cell[], cell: number): number[] | null {
  const owner = ownerMap(hold, placed)
  for (let k = 0; k < shape.length; k++) {
    const cells = cellsAt(hold, shape, cell, k)
    if (cells && cells.every(i => owner[i] < 0)) return cells
  }
  return null
}

export interface Status {
  value: number
  trim: number
  filled: number
  full: boolean
  used: number
  allLoaded: boolean
  badFragile: number[]
  badBallast: number[]
  won: boolean
}

export function evaluate(pz: Puzzle, placed: Placement[]): Status {
  const { hold, pieces } = pz
  const owner = ownerMap(hold, placed)
  const filled = placed.reduce((a, p) => a + p.cells.length, 0)
  const full = filled === hold.count
  const value = placed.reduce((a, p) => a + pieces[p.pieceId].value, 0)
  const trim = trimOf(hold, pieces, placed)
  const allLoaded = pieces.every(p => p.decoy || placed.some(x => x.pieceId === p.id))
  const badFragile = placed.filter(p => pieces[p.pieceId].kind === 'fragile' && !fragileOk(hold, owner, p.cells, p.pieceId)).map(p => p.pieceId)
  const badBallast = placed.filter(p => pieces[p.pieceId].kind === 'ballast' && !ballastOk(hold, p.cells)).map(p => p.pieceId)
  let won = false
  switch (pz.mode) {
    case 'value': won = value >= pz.target; break
    case 'balance': won = full && allLoaded && Math.abs(trim) <= pz.tol + 1e-9; break
    case 'fragile': won = full && allLoaded && !badFragile.length && !badBallast.length; break
    case 'speed': won = full && placed.length <= pz.maxPieces; break
  }
  return { value, trim, filled, full, used: placed.length, allLoaded, badFragile, badBallast, won }
}

/** Which tray orientation (rot, flip) turns a crate into the given placed cells. */
export function orientationFor(hold: Hold, piece: Piece, cells: number[]): { rot: number; flip: boolean } | null {
  const want = shapeKey(cellsToShape(hold, cells))
  for (const flip of [false, true]) for (let rot = 0; rot < 4; rot++) if (shapeKey(transform(piece.shape, rot, flip)) === want) return { rot, flip }
  return null
}

// ── Component ──────────────────────────────────────────────────────────────────

const CELL = 44

export default function CargoGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const base = resolveConfig(CONFIGS, configId, undefined, 'voc-spice')
  const cfg = {
    ...base,
    title: typeof params?.title === 'string' ? params.title : base.title,
    intro: typeof params?.intro === 'string' ? params.intro : base.intro,
  }
  const pz = useMemo(() => planLevel(configId, difficulty, seed), [configId, difficulty, seed])
  const { hold, pieces } = pz

  const [placed, setPlaced] = useState<Placement[]>([])
  const [orient, setOrient] = useState<Record<number, { rot: number; flip: boolean }>>({})
  const [selected, setSelected] = useState<number | null>(null)
  const [loads, setLoads] = useState(0)
  const [hover, setHover] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const live = useRef({ placed, loads, settled, selected, orient })
  live.current = { placed, loads, settled, selected, orient }

  useEffect(() => { setPlaced([]); setOrient({}); setSelected(null); setLoads(0); setMsg('') }, [pz])

  const shapeOf = useCallback((id: number) => {
    const o = live.current.orient[id] ?? { rot: 0, flip: false }
    return transform(pieces[id].shape, o.rot, o.flip)
  }, [pieces])

  const turn = useCallback((kind: 'rot' | 'flip') => {
    const cur = live.current
    if (cur.settled || cur.selected === null) return
    const id = cur.selected
    const o = cur.orient[id] ?? { rot: 0, flip: false }
    const next = { ...cur.orient, [id]: kind === 'rot' ? { ...o, rot: (o.rot + 1) % 4 } : { ...o, flip: !o.flip } }
    live.current = { ...cur, orient: next }
    setOrient(next)
  }, [])

  const select = useCallback((id: number) => {
    if (live.current.settled) return
    const s = live.current.selected === id ? null : id
    live.current = { ...live.current, selected: s }
    setSelected(s); setMsg('')
  }, [])

  const tapCell = useCallback((i: number) => {
    const cur = live.current
    if (cur.settled || !hold.inHull[i]) return
    const hit = cur.placed.find(p => p.cells.includes(i))
    if (hit) {
      const next = cur.placed.filter(p => p !== hit)
      live.current = { ...cur, placed: next, selected: hit.pieceId }
      setPlaced(next); setSelected(hit.pieceId); setMsg('')
      return
    }
    if (cur.selected === null) { setMsg('Pick a crate from the quay first.'); return }
    const cells = fitAt(hold, cur.placed, shapeOf(cur.selected), i)
    if (!cells) { setMsg('That crate does not fit there — rotate, flip or try another spot.'); return }
    const next = [...cur.placed, { pieceId: cur.selected, cells }]
    const loadsNext = cur.loads + 1
    live.current = { ...cur, placed: next, loads: loadsNext, selected: null }
    setPlaced(next); setLoads(loadsNext); setSelected(null); setMsg('')
    if (evaluate(pz, next).won) { live.current.settled = true; win() }
    else if (loadsNext >= pz.cap) { live.current.settled = true; lose('The crane crew knocked off before the hold was stowed') }
  }, [hold, pz, shapeOf, win, lose])

  const unloadAll = () => {
    if (live.current.settled) return
    live.current = { ...live.current, placed: [] }
    setPlaced([]); setMsg('')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') turn('rot')
      if (e.key === 'f' || e.key === 'F') turn('flip')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [turn])

  const st = evaluate(pz, placed)
  const owner = ownerMap(hold, placed)
  const ghost = selected !== null && hover !== null && owner[hover] < 0 ? fitAt(hold, placed, shapeOf(selected), hover) : null
  const left = pz.cap - loads
  const inTray = pieces.filter(p => !placed.some(x => x.pieceId === p.id))
  const bad = new Set([...st.badFragile, ...st.badBallast])

  let goal: React.ReactNode
  if (pz.mode === 'value') goal = <>Cargo {st.value} / {pz.target} ƒ</>
  else if (pz.mode === 'balance') goal = <>Trim {st.trim > 0 ? `${st.trim} stbd` : st.trim < 0 ? `${-st.trim} port` : 'level'} · limit ±{pz.tol}</>
  else if (pz.mode === 'fragile') goal = <>Hold {st.filled} / {hold.count} · all crates</>
  else goal = <>Hold {st.filled} / {hold.count} · crates {st.used} / {pz.maxPieces}</>

  const W = hold.w * CELL, H = hold.h * CELL
  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p className="font-bold text-ink-2" data-testid="cargo-goal">{goal}</p>
          <p className={left <= 3 ? 'text-red-600 font-bold' : ''} data-testid="cargo-loads">Lifts left {Math.max(0, left)}</p>
        </div>
      </div>

      {pz.mode === 'balance' && (
        <div className="w-full max-w-[420px] mx-auto">
          <div className="relative h-2 bg-panel rounded-full border border-line">
            <div className="absolute top-0 bottom-0 bg-emerald-500/25"
              style={{ left: `${50 - (pz.tol / (pz.tol * 3)) * 50}%`, right: `${50 - (pz.tol / (pz.tol * 3)) * 50}%` }} />
            <div className={`absolute -top-1 w-1.5 h-4 rounded ${Math.abs(st.trim) <= pz.tol ? 'bg-emerald-600' : 'bg-red-600'}`}
              style={{ left: `calc(${50 + Math.max(-1, Math.min(1, st.trim / (pz.tol * 3))) * 50}% - 3px)` }} />
          </div>
          <div className="flex justify-between text-[9px] text-muted mt-0.5"><span>port</span><span>starboard</span></div>
        </div>
      )}

      <div className="w-full max-w-[420px] mx-auto select-none">
        <svg viewBox={`-6 -10 ${W + 12} ${H + 22}`} className="w-full" style={{ touchAction: 'manipulation' }}
          onPointerLeave={() => setHover(null)}>
          <rect x={-6} y={-10} width={W + 12} height={H + 22} fill="#9cc3d6" opacity={0.35} rx={6} />
          <line x1={-6} x2={W + 6} y1={-2} y2={-2} stroke="#6b4a2b" strokeWidth={3} />
          {hold.inHull.map((inside, i) => {
            const x = (i % hold.w) * CELL, y = Math.floor(i / hold.w) * CELL
            const o = owner[i]
            const pc = o >= 0 ? pieces[o] : null
            const isGhost = ghost?.includes(i)
            return (
              <g key={i} data-testid={`cargo-cell-${i}`} onClick={() => tapCell(i)} onPointerEnter={() => setHover(i)}
                style={{ cursor: inside ? 'pointer' : 'default' }}>
                <rect x={x} y={y} width={CELL} height={CELL}
                  fill={!inside ? 'transparent' : pc ? pc.good.color : isGhost ? '#e9c46a' : '#e7d3ad'}
                  stroke={inside ? (pc ? '#00000040' : '#a08259') : 'none'} strokeWidth={1}
                  opacity={isGhost && !pc ? 0.8 : 1} />
                {pc && bad.has(pc.id) && <rect x={x + 2} y={y + 2} width={CELL - 4} height={CELL - 4} fill="none" stroke="#dc2626" strokeWidth={3} />}
              </g>
            )
          })}
          {/* Crate outlines and labels */}
          {placed.map(p => {
            const pc = pieces[p.pieceId]
            const set = new Set(p.cells)
            const edges: React.ReactNode[] = []
            for (const i of p.cells) {
              const x = (i % hold.w) * CELL, y = Math.floor(i / hold.w) * CELL
              const r = Math.floor(i / hold.w), c = i % hold.w
              if (r === 0 || !set.has(i - hold.w)) edges.push(<line key={`${i}t`} x1={x} x2={x + CELL} y1={y} y2={y} />)
              if (!set.has(i + hold.w)) edges.push(<line key={`${i}b`} x1={x} x2={x + CELL} y1={y + CELL} y2={y + CELL} />)
              if (c === 0 || !set.has(i - 1)) edges.push(<line key={`${i}l`} x1={x} x2={x} y1={y} y2={y + CELL} />)
              if (c === hold.w - 1 || !set.has(i + 1)) edges.push(<line key={`${i}r`} x1={x + CELL} x2={x + CELL} y1={y} y2={y + CELL} />)
            }
            const a = p.cells[0]
            return (
              <g key={p.pieceId} pointerEvents="none">
                <g stroke="#2b1d10" strokeWidth={2.5}>{edges}</g>
                <text x={(a % hold.w) * CELL + CELL / 2} y={Math.floor(a / hold.w) * CELL + CELL / 2 + 6} textAnchor="middle" fontSize={18}>{pc.good.icon}</text>
              </g>
            )
          })}
          {/* Hull outline */}
          {hold.inHull.map((inside, i) => {
            if (!inside) return null
            const x = (i % hold.w) * CELL, y = Math.floor(i / hold.w) * CELL
            const r = Math.floor(i / hold.w), c = i % hold.w
            const out = (rr: number, cc: number) => rr < 0 || cc < 0 || rr >= hold.h || cc >= hold.w || !hold.inHull[rr * hold.w + cc]
            return (
              <g key={`h${i}`} stroke="#6b4a2b" strokeWidth={4} strokeLinecap="round" pointerEvents="none">
                {out(r + 1, c) && <line x1={x} x2={x + CELL} y1={y + CELL} y2={y + CELL} />}
                {out(r, c - 1) && <line x1={x} x2={x} y1={y} y2={y + CELL} />}
                {out(r, c + 1) && <line x1={x + CELL} x2={x + CELL} y1={y} y2={y + CELL} />}
                {r > 0 && out(r - 1, c) && <line x1={x} x2={x + CELL} y1={y} y2={y} />}
              </g>
            )
          })}
        </svg>
      </div>

      {msg && !settled && <p className="text-red-600 text-[11px] text-center font-bold">{msg}</p>}
      {pz.mode === 'fragile' && bad.size > 0 && !settled && (
        <p className="text-red-600 text-[11px] text-center font-bold">Red crates break the rules: nothing on porcelain, ballast on the bottom.</p>
      )}

      {!settled && (
        <>
          <div className="flex gap-2 w-full max-w-[420px] mx-auto">
            <button type="button" data-testid="cargo-rotate" onClick={() => turn('rot')} disabled={selected === null}
              className="flex-1 h-10 rounded-lg border bg-panel border-line text-ink-2 text-xs font-bold disabled:opacity-40">⟳ Rotate</button>
            <button type="button" data-testid="cargo-flip" onClick={() => turn('flip')} disabled={selected === null}
              className="flex-1 h-10 rounded-lg border bg-panel border-line text-ink-2 text-xs font-bold disabled:opacity-40">⇋ Flip</button>
            <button type="button" onClick={unloadAll} disabled={!placed.length}
              className="flex-1 h-10 rounded-lg border bg-panel border-line text-ink-2 text-xs font-bold disabled:opacity-40">⤒ Unload all</button>
          </div>
          <div className="flex flex-wrap gap-2 justify-center w-full max-w-[420px] mx-auto">
            {inTray.map(p => {
              const s = transform(p.shape, (orient[p.id]?.rot ?? 0), orient[p.id]?.flip ?? false)
              const pw = Math.max(...s.map(x => x[1])) + 1, ph = Math.max(...s.map(x => x[0])) + 1
              const u = 13
              const sel = selected === p.id
              const tag = pz.mode === 'value' ? `${p.value}ƒ` : pz.mode === 'balance' ? `${p.weight}t` : p.kind === 'fragile' ? 'fragile' : p.kind === 'ballast' ? 'keel' : `${p.size}`
              return (
                <button key={p.id} type="button" data-testid={`cargo-piece-${p.id}`} onClick={() => select(p.id)}
                  className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg border ${sel ? 'bg-accent/20 border-accent' : 'bg-panel border-line'}`}>
                  <svg width={pw * u} height={ph * u}>
                    {s.map(([r, c]) => <rect key={`${r},${c}`} x={c * u} y={r * u} width={u - 1} height={u - 1} rx={2} fill={p.good.color} />)}
                  </svg>
                  <span className="text-[9px] text-ink-2 leading-none">{p.good.icon} {tag}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
      <p className="text-muted/80 text-[10px] text-center">
        {settled ? '' : 'Pick a crate, rotate/flip (R/F), tap the hold to load · tap a loaded crate to unload (free)'}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Hold stowed — weigh anchor!" loseTitle="Out of crane lifts" />
    </div>
  )
}
