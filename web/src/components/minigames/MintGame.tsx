import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Coin Mint: a 2048-style sliding merge.  Every swipe slides all the coins on
// the tray as far as they go; two equal coins that meet are struck into one
// coin of the next denomination.  The ladder climbs through the history of a
// currency, and the challenge is won by minting the target coin.  It is lost
// when the tray is jammed and no swipe does anything.
//
// Every config is a rule twist (MintTwist):
//   wild     (Lydia)    Lydian touchstones spawn: one merges with any coin and
//                       lifts it a tier (two touchstones never merge)
//   lead     (China)    iron counterfeits spawn: they never merge with coins,
//                       but two counterfeits that meet melt away
//   blocked  (Britain)  broken dies block squares of the tray for good
//   tilt     (Rome)     the tray is tilted: you can never swipe up
//
// New coins appear on a seeded schedule (spawn n of seed s is always the same
// for the same tray), so a board is reproducible and the tests can prove
// every level winnable by playing it; the component only deals seeds the
// strong player wins (playableSeed).
//
// Time budget: always a 4×4 tray, and the target is the 128 coin (D1–D2) or
// the 256 coin (D3–D4) — about 75 and 140 swipes (never more than MAX_SWIPES), one to three minutes.
// Difficulty also takes undos away, spawns more high coins and turns the
// twist up (more counterfeits, more broken dies, fewer touchstones).

export type MintTwist = 'wild' | 'lead' | 'blocked' | 'tilt'

export interface MintConfig {
  title: string
  intro: string
  fact: string
  /** Denomination names, tier 1 (the "2") upwards. */
  coins: string[]
  /** Metal hues per tier band, light → dark. */
  palette?: 'mediterranean' | 'china' | 'britain'
  /** The rule twist this config plays. */
  twist: MintTwist
  /** One line explaining the twist. */
  twistText: string
  /** Name of the twist's special piece. */
  special?: string
}

export const CONFIGS: Record<string, MintConfig> = {
  lydia: {
    title: 'From Lydia to Byzantium',
    intro: 'Strike electrum nuggets into staters, drachmae and denarii.',
    fact: 'The kingdom of Lydia struck the first known coins, of electrum, in the late 7th century BCE. The “Lydian stone”, a black touchstone, let merchants test gold by the streak it left.',
    coins: ['Electrum', 'Hekte', 'Stater', 'Croesid', 'Daric', 'Obol', 'Drachma', 'Tetradrachm', 'Denarius', 'Solidus', 'Hyperpyron', 'Florin'],
    palette: 'mediterranean',
    twist: 'wild',
    twistText: 'Touchstones: a black Lydian touchstone merges with any coin and lifts it one tier — but two touchstones will not merge. Save them for the coin that needs them.',
    special: 'Touchstone',
  },
  china: {
    title: 'The Silk Road Mint',
    intro: 'Merge cowrie shells into spade and knife money, then cash coins and paper jiaozi.',
    fact: 'Shells served as money in Shang China; the round Ban Liang of Qin Shi Huang set the square-holed shape for two thousand years. Forgers were such a problem that Han law punished private minting with death.',
    coins: ['Cowrie', 'Bronze cowrie', 'Spade money', 'Knife money', 'Ban liang', 'Wu zhu', 'Kaiyuan', 'Jiaozi', 'Silver tael', 'Gold ingot', 'Sycee', 'Dragon dollar'],
    palette: 'china',
    twist: 'lead',
    twistText: 'Counterfeits: iron forgeries turn up in the tray. They never merge with real coins — slide two forgeries together and they melt away.',
    special: 'Forgery',
  },
  britain: {
    title: 'The Royal Mint',
    intro: 'Strike farthings and pennies into shillings, crowns and pounds.',
    fact: 'The first gold sovereign was struck for Henry VII in 1489; the modern sovereign of 1817, with Pistrucci’s St George, is still minted today.',
    coins: ['Farthing', 'Halfpenny', 'Penny', 'Groat', 'Shilling', 'Florin', 'Half crown', 'Crown', 'Pound', 'Sovereign', 'Five pounds', 'Britannia'],
    palette: 'britain',
    twist: 'blocked',
    twistText: 'Broken dies: cracked dies block squares of the tray for good. Coins stop against them, and you must build your chain around them.',
    special: 'Broken die',
  },
  rome: {
    title: 'The Temple of Juno Moneta',
    intro: 'Strike bronze quadrantes and asses into silver denarii and the gold aureus.',
    fact: 'Rome’s mint stood beside the temple of Juno Moneta on the Capitoline Hill — the origin of the words “money” and “mint”.',
    coins: ['Quadrans', 'Semis', 'As', 'Dupondius', 'Sestertius', 'Quinarius', 'Denarius', 'Antoninianus', 'Aureus', 'Solidus', 'Medallion', 'Talent'],
    palette: 'mediterranean',
    twist: 'tilt',
    twistText: 'Tilted tray: the tray leans toward you, so coins can be swiped left, right and down — never up. Keep your big coins on the bottom row.',
  },
}

export type Dir = 'left' | 'right' | 'up' | 'down'
export const DIRS: Dir[] = ['left', 'right', 'up', 'down']

/** Special cells: a wall, a counterfeit, a wild touchstone. */
export const BLOCK = -1
export const LEAD = -2
export const WILD = -3

export const sizeFor = (_d: Difficulty) => 4
/** Tier to mint: 7 → the "128" coin, 8 → the "256" coin. */
export const targetFor = (d: Difficulty) => scale(d, [7, 7, 8, 8])
export const undosFor = (d: Difficulty) => scale(d, [3, 2, 1, 0])
export const highSpawnFor = (d: Difficulty) => scale(d, [0.05, 0.1, 0.1, 0.15])
/** Twist strength per difficulty. */
export const wildFor = (d: Difficulty) => scale(d, [0.035, 0.03, 0.025, 0.02])
export const leadFor = (d: Difficulty) => scale(d, [0.06, 0.08, 0.08, 0.1])
export const blocksFor = (d: Difficulty) => scale(d, [1, 1, 2, 2])
/** Swipes a strong player needs at most — the time budget the tests hold the game to. */
export const MAX_SWIPES: Record<Difficulty, number> = { 1: 100, 2: 100, 3: 180, 4: 180 }

export interface MintRules {
  n: number
  target: number
  high: number
  wild: number
  lead: number
  /** Blocked cells (never empty, never move). */
  blocks: number[]
  dirs: Dir[]
}

/** Seeded broken dies: never in a corner and never side by side. */
export function blockCells(n: number, count: number, seed: number): number[] {
  const rng = mulberry32(hashString(`mint-blocks:${seed}`))
  const corners = new Set([0, n - 1, n * (n - 1), n * n - 1])
  const out: number[] = []
  for (let guard = 0; out.length < count && guard < 200; guard++) {
    const c = Math.floor(rng() * n * n)
    if (corners.has(c) || out.includes(c)) continue
    if (out.some(b => (Math.abs(b - c) === 1 && Math.floor(b / n) === Math.floor(c / n)) || Math.abs(b - c) === n)) continue
    out.push(c)
  }
  return out.sort((a, b) => a - b)
}

export function rulesFor(twist: MintTwist, d: Difficulty, seed: number): MintRules {
  const n = sizeFor(d)
  return {
    n,
    target: targetFor(d),
    high: highSpawnFor(d),
    wild: twist === 'wild' ? wildFor(d) : 0,
    lead: twist === 'lead' ? leadFor(d) : 0,
    blocks: twist === 'blocked' ? blockCells(n, blocksFor(d), seed) : [],
    dirs: twist === 'tilt' ? ['left', 'right', 'down'] : DIRS,
  }
}

// ── Grid engine ─────────────────────────────────────────────────────────────

/** Cell indices of each line, ordered from the edge coins slide toward. */
export function lines(n: number, dir: Dir): number[][] {
  const out: number[][] = []
  for (let a = 0; a < n; a++) {
    const line: number[] = []
    for (let b = 0; b < n; b++) {
      const k = dir === 'left' || dir === 'up' ? b : n - 1 - b
      line.push(dir === 'left' || dir === 'right' ? a * n + k : k * n + a)
    }
    out.push(line)
  }
  return out
}

const LINE_CACHE = new Map<string, number[][]>()
const linesCached = (n: number, dir: Dir) => {
  const key = `${n}${dir}`
  let l = LINE_CACHE.get(key)
  if (!l) { l = lines(n, dir); LINE_CACHE.set(key, l) }
  return l
}

/**
 * What `a` (already resting) and `b` (sliding into it) strike: a new tier,
 * 0 when two counterfeits melt away, or null when they do not merge.
 */
export function mergeOf(a: number, b: number): number | null {
  if (a > 0 && a === b) return a + 1
  if (a === WILD && b > 0) return b + 1
  if (b === WILD && a > 0) return a + 1
  if (a === LEAD && b === LEAD) return 0
  return null
}

/** Slide a grid of cells (0 = empty; see BLOCK, LEAD, WILD). */
export function slideGrid(grid: readonly number[], n: number, dir: Dir): { grid: number[]; moved: boolean; gained: number; best: number } {
  const out = new Array<number>(grid.length).fill(0)
  let moved = false, gained = 0, best = 0
  for (const line of linesCached(n, dir)) {
    let w = 0, last = 0, lastMerged = true
    for (let j = 0; j < line.length; j++) {
      const idx = line[j]
      const v = grid[idx]
      if (!v) continue
      if (v === BLOCK) { out[idx] = BLOCK; w = j + 1; lastMerged = true; continue }
      const m = lastMerged ? null : mergeOf(last, v)
      if (m !== null) {
        out[line[w - 1]] = m
        if (m === 0) w--
        else { gained += 1 << m; if (m > best) best = m }
        lastMerged = true
        moved = true
        continue
      }
      out[line[w]] = v
      if (line[w] !== idx) moved = true
      last = v; lastMerged = false; w++
    }
  }
  return { grid: out, moved, gained, best }
}

/** Can any allowed swipe change the tray? */
export function canMove(grid: readonly number[], n: number, dirs: readonly Dir[] = DIRS): boolean {
  return dirs.some(d => slideGrid(grid, n, d).moved)
}

/** Spawn number `count` of a game: where the next piece lands and what it is. */
export function spawnAt(grid: readonly number[], seed: number, count: number, rules: Pick<MintRules, 'high' | 'wild' | 'lead'>): { idx: number; v: number } | null {
  const empties: number[] = []
  for (let i = 0; i < grid.length; i++) if (!grid[i]) empties.push(i)
  if (!empties.length) return null
  const rng = mulberry32(hashString(`mint:${seed}:${count}`))
  const idx = empties[Math.floor(rng() * empties.length)]
  const r = rng()
  const v = r < rules.lead ? LEAD : r < rules.lead + rules.wild ? WILD : rng() < rules.high ? 2 : 1
  return { idx, v }
}

export interface GridState { grid: number[]; spawns: number }

export function initialGrid(rules: MintRules, seed: number): GridState {
  let grid = new Array<number>(rules.n * rules.n).fill(0)
  for (const b of rules.blocks) grid[b] = BLOCK
  let spawns = 0
  for (let k = 0; k < 2; k++) {
    // The opening coins are always real coins.
    const s = spawnAt(grid, seed, spawns++, { ...rules, lead: 0, wild: 0 })!
    grid = grid.slice(); grid[s.idx] = s.v
  }
  return { grid, spawns }
}

/** One full turn: slide, then the seeded spawn.  Null if the slide does nothing or the swipe is not allowed. */
export function turn(st: GridState, rules: MintRules, dir: Dir, seed: number): (GridState & { best: number; gained: number }) | null {
  if (!rules.dirs.includes(dir)) return null
  const r = slideGrid(st.grid, rules.n, dir)
  if (!r.moved) return null
  const s = spawnAt(r.grid, seed, st.spawns, rules)
  if (s) r.grid[s.idx] = s.v
  return { grid: r.grid, spawns: st.spawns + 1, best: r.best, gained: r.gained }
}

export const bestTier = (grid: readonly number[]) => grid.reduce((a, b) => Math.max(a, b), 0)

// ── A strong player, for tests and proof of winnability ─────────────────────

function heuristic(grid: readonly number[], n: number, bottom: boolean): number {
  // Snake gradient anchored in a top (or, on a tilted tray, bottom) corner, plus room to breathe.
  let s = 0, empty = 0
  for (let r0 = 0; r0 < n; r0++) for (let c = 0; c < n; c++) {
    const r = bottom ? n - 1 - r0 : r0
    const v = grid[r * n + c]
    if (!v) { empty++; continue }
    if (v === LEAD) { s -= 8; continue }
    if (v === WILD) { s += 3; continue }
    if (v < 0) continue
    const k = r0 * n + (r0 % 2 === 0 ? c : n - 1 - c)
    s += (1 << v) * Math.pow(0.5, k * 0.5)
  }
  return s + empty * 6
}

/** Best direction with exact lookahead (spawns are deterministic). */
export function bestDir(st: GridState, rules: MintRules, seed: number, depth = 3): Dir | null {
  const bottom = !rules.dirs.includes('up')
  const search = (s: GridState, d: number): number => {
    if (d === 0) return heuristic(s.grid, rules.n, bottom)
    let best = -Infinity
    for (const dir of rules.dirs) {
      const t = turn(s, rules, dir, seed)
      if (!t) continue
      if (bestTier(t.grid) >= rules.target) return 1e12
      best = Math.max(best, search(t, d - 1))
    }
    return best === -Infinity ? -1e9 : best
  }
  let pick: Dir | null = null, best = -Infinity
  for (const dir of rules.dirs) {
    const t = turn(st, rules, dir, seed)
    if (!t) continue
    const v = bestTier(t.grid) >= rules.target ? 1e13 : search(t, depth - 1)
    if (v > best) { best = v; pick = dir }
  }
  return pick
}

/** Plays a level with the strong player; reports whether it reached the target. */
export function playOut(rules: MintRules, seed: number, maxTurns = 2000): { won: boolean; turns: number; best: number } {
  let st = initialGrid(rules, seed)
  let best = bestTier(st.grid)
  for (let t = 0; t < maxTurns; t++) {
    if (best >= rules.target) return { won: true, turns: t, best }
    const dir = bestDir(st, rules, seed)
    if (!dir) return { won: false, turns: t, best }
    st = turn(st, rules, dir, seed)!
    best = Math.max(best, bestTier(st.grid))
  }
  return { won: false, turns: maxTurns, best }
}

/** The tray's seed from the challenge seed (each config deals differently). */
export const traySeed = (configId: string, seed: number) => (seed ^ hashString(`mint:${configId}`)) >>> 0

/** The first seed from `seed` on whose tray the strong player wins inside the swipe budget. */
export function playableSeed(configId: string, d: Difficulty, seed: number): { seed: number; tries: number } {
  const cfg = resolveConfig(CONFIGS, configId, undefined, 'lydia')
  for (let k = 0; k < 40; k++) {
    const s = (seed + k * 7919) >>> 0
    const ts = traySeed(configId, s)
    const r = playOut(rulesFor(cfg.twist, d, ts), ts, MAX_SWIPES[d])
    if (r.won) return { seed: s, tries: k + 1 }
  }
  return { seed, tries: 0 }
}

// ── Tiles with identity, for animation ──────────────────────────────────────

export interface Tile { id: number; v: number; pos: number; born?: 'spawn' | 'merge' }

/** The same slide as slideGrid, on tiles with ids; `walls` are the blocked cells. */
export function slideTiles(tiles: readonly Tile[], n: number, dir: Dir, nextId: number, walls: readonly number[] = []): { tiles: Tile[]; ghosts: Tile[]; nextId: number } {
  const at = new Map<number, Tile>()
  for (const t of tiles) at.set(t.pos, t)
  const wall = new Set(walls)
  const out: Tile[] = [], ghosts: Tile[] = []
  for (const line of linesCached(n, dir)) {
    let w = 0
    let prev: Tile | null = null, prevMerged = true
    for (let j = 0; j < line.length; j++) {
      const idx = line[j]
      if (wall.has(idx)) { w = j + 1; prevMerged = true; prev = null; continue }
      const t = at.get(idx)
      if (!t) continue
      const m = prev && !prevMerged ? mergeOf(prev.v, t.v) : null
      if (prev && m !== null) {
        const pos = line[w - 1]
        out.splice(out.indexOf(prev), 1)
        ghosts.push({ ...prev, pos, born: undefined }, { ...t, pos, born: undefined })
        if (m === 0) w--
        else out.push({ id: nextId++, v: m, pos, born: 'merge' })
        prevMerged = true
        continue
      }
      const moved: Tile = { ...t, pos: line[w], born: undefined }
      out.push(moved)
      prev = moved; prevMerged = false; w++
    }
  }
  return { tiles: out, ghosts, nextId }
}

export const tilesToGrid = (tiles: readonly Tile[], n: number, walls: readonly number[] = []) => {
  const g = new Array<number>(n * n).fill(0)
  for (const b of walls) g[b] = BLOCK
  for (const t of tiles) g[t.pos] = t.v
  return g
}

// ── Component ───────────────────────────────────────────────────────────────

const BANDS: Record<NonNullable<MintConfig['palette']>, [string, string][]> = {
  mediterranean: [['#f3e3a8', '#b8963a'], ['#e3d38e', '#a5832a'], ['#d9c27a', '#93701f'], ['#cfd6db', '#7d8a93'], ['#bfc7cd', '#6c7880'], ['#e8e8ea', '#8d8f96'], ['#dfe3e6', '#7b848b'], ['#c9ced2', '#646d74'], ['#d5d9dc', '#5c656c'], ['#ffd65a', '#b07d00'], ['#ffcf40', '#9b6a00'], ['#ffe08a', '#a77800']],
  china: [['#f6efe3', '#c2ae8c'], ['#e9c79a', '#9c6b33'], ['#cf9a63', '#7c4a1f'], ['#c38a55', '#6e3f17'], ['#b9844e', '#5f3613'], ['#b07a45', '#55300f'], ['#a8723f', '#4c2a0c'], ['#f1e4c2', '#a68f5c'], ['#e6e7ea', '#878a92'], ['#ffd65a', '#b07d00'], ['#ffcf40', '#9b6a00'], ['#ffe08a', '#a77800']],
  britain: [['#d8a27a', '#8a4f28'], ['#cf9468', '#7d431f'], ['#c7875a', '#713a18'], ['#e6e7ea', '#8b8e95'], ['#dcdee2', '#7d8088'], ['#d2d5d9', '#70747c'], ['#c8cbd0', '#636770'], ['#f1e2b0', '#a68b3c'], ['#f5d872', '#a98000'], ['#ffd65a', '#b07d00'], ['#ffcf40', '#9b6a00'], ['#ffe08a', '#a77800']],
}

const CSS = `
@keyframes mint-spawn { from { transform: scale(0) } to { transform: scale(1) } }
@keyframes mint-pop { 0% { transform: scale(.6) } 60% { transform: scale(1.18) } 100% { transform: scale(1) } }
`

interface Snapshot { tiles: Tile[]; spawns: number; score: number }

export default function MintGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'lydia')
  // Deal only trays the strong player can win inside the swipe budget.
  const mintSeed = useMemo(() => traySeed(configId, playableSeed(configId, difficulty, seed).seed), [configId, difficulty, seed])
  const rules = useMemo(() => rulesFor(config.twist, difficulty, mintSeed), [config.twist, difficulty, mintSeed])
  const { n, target, blocks } = rules
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const start = useMemo<Snapshot>(() => {
    const g = initialGrid(rules, mintSeed)
    let id = 1
    const tiles: Tile[] = []
    g.grid.forEach((v, pos) => { if (v && v !== BLOCK) tiles.push({ id: id++, v, pos, born: 'spawn' }) })
    return { tiles, spawns: g.spawns, score: 0 }
  }, [rules, mintSeed])

  const [snap, setSnap] = useState<Snapshot>(start)
  const [ghosts, setGhosts] = useState<Tile[]>([])
  const [history, setHistory] = useState<Snapshot[]>([])
  const [undos, setUndos] = useState(undosFor(difficulty))
  const nextId = useRef(100)
  const ghostTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (ghostTimer.current) clearTimeout(ghostTimer.current) }, [])

  const best = Math.max(0, ...snap.tiles.map(t => t.v))
  const coinName = (v: number) => (v === LEAD ? 'Forgery' : v === WILD ? 'Touchstone' : config.coins[Math.min(v, config.coins.length) - 1])

  const move = useCallback((dir: Dir) => {
    if (settled || !rules.dirs.includes(dir)) return
    const r = slideTiles(snap.tiles, n, dir, nextId.current, blocks)
    const before = tilesToGrid(snap.tiles, n, blocks)
    const slid = slideGrid(before, n, dir)
    if (!slid.moved) return
    nextId.current = r.nextId
    const sp = spawnAt(tilesToGrid(r.tiles, n, blocks), mintSeed, snap.spawns, rules)
    const tiles = sp ? [...r.tiles, { id: nextId.current++, v: sp.v, pos: sp.idx, born: 'spawn' as const }] : r.tiles
    setHistory(h => [...h.slice(-9), snap])
    setSnap({ tiles, spawns: snap.spawns + 1, score: snap.score + slid.gained })
    setGhosts(r.ghosts)
    if (ghostTimer.current) clearTimeout(ghostTimer.current)
    ghostTimer.current = setTimeout(() => setGhosts([]), 140)
    if (slid.best >= target) { win(); return }
    if (!canMove(tilesToGrid(tiles, n, blocks), n, rules.dirs) && undos <= 0) lose('the tray is jammed — no coins can merge')
  }, [settled, snap, n, blocks, rules, mintSeed, target, win, lose, undos])

  const jammed = !settled && !canMove(tilesToGrid(snap.tiles, n, blocks), n, rules.dirs)

  const undo = () => {
    if (settled || undos <= 0 || !history.length) return
    setSnap(history[history.length - 1])
    setHistory(history.slice(0, -1))
    setUndos(undos - 1)
    setGhosts([])
  }
  const giveUp = () => { if (!settled) lose('the tray is jammed — no coins can merge') }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' }
      const dir = map[e.key]
      if (!dir) return
      e.preventDefault()
      move(dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move])

  const touch = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => { touch.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = (e: React.PointerEvent) => {
    const t = touch.current
    touch.current = null
    if (!t) return
    const dx = e.clientX - t.x, dy = e.clientY - t.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'))
  }

  const bands = BANDS[config.palette ?? 'mediterranean']
  const renderTile = (t: Tile, ghost: boolean) => {
    const r = Math.floor(t.pos / n), c = t.pos % n
    const special = t.v < 0
    const [hi, lo] = t.v === LEAD ? ['#6b6f75', '#2f3236'] : t.v === WILD ? ['#4a4a4a', '#0d0d0d'] : bands[Math.min(t.v, bands.length) - 1]
    const isTarget = t.v >= target
    return (
      <div
        key={t.id}
        data-coin={t.v}
        data-pos={t.pos}
        data-ghost={ghost ? '1' : undefined}
        className="absolute p-[3%] transition-[left,top] duration-[120ms] ease-out"
        style={{ left: `${(c / n) * 100}%`, top: `${(r / n) * 100}%`, width: `${100 / n}%`, height: `${100 / n}%`, zIndex: ghost ? 1 : 2 }}
      >
        <div
          className={`w-full h-full rounded-full flex flex-col items-center justify-center text-center border-2 shadow-md ${isTarget ? 'ring-4 ring-amber-300' : ''}`}
          style={{
            background: `radial-gradient(circle at 35% 30%, ${hi}, ${lo})`,
            borderColor: lo,
            animation: t.born === 'spawn' ? 'mint-spawn 160ms ease-out 100ms both' : t.born === 'merge' ? 'mint-pop 200ms ease-out 90ms both' : undefined,
            containerType: 'inline-size',
          }}
        >
          <span className={`font-bold leading-none ${special ? 'text-white' : 'text-[#2a1d0c]'}`} style={{ fontSize: 'clamp(7px, 15cqw, 13px)' }}>{coinName(t.v)}</span>
          <span className={`tabular-nums leading-none mt-0.5 ${special ? 'text-white/70' : 'text-[#2a1d0c]/70'}`} style={{ fontSize: 'clamp(7px, 13cqw, 11px)' }}>{t.v === WILD ? '+1' : t.v === LEAD ? '✕' : 1 << t.v}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      <style>{CSS}</style>
      <div className="rounded-xl border border-line bg-panel px-3 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent truncate">{config.title}</p>
          <p className="text-ink text-sm font-semibold leading-tight truncate">
            Mint the <span className="text-accent">{coinName(target)}</span> ({1 << target})
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-bold tabular-nums text-ink-2">Treasury {snap.score}</p>
          <p className="text-[10px] text-muted">best: {best ? coinName(best) : '—'}</p>
        </div>
      </div>

      <p className="text-[11px] leading-snug text-ink-2 rounded-lg bg-panel border border-line px-2 py-1" data-testid="mint-twist">
        <span className="font-bold text-accent">Twist · </span>{config.twistText}
      </p>

      {/* Ladder of denominations up to the target. */}
      <div className="flex flex-wrap gap-1">
        {config.coins.slice(0, target).map((name, i) => (
          <span key={name} className={`px-1.5 py-0.5 rounded text-[9px] border ${i + 1 <= best ? 'bg-accent text-accent-fg border-accent' : 'bg-paper border-line text-muted'}`}>{name}</span>
        ))}
      </div>

      <div
        className="relative w-full max-w-[400px] mx-auto aspect-square rounded-xl bg-[#5b3a1e] p-1.5 shadow-inner [touch-action:none]"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        data-testid="mint-board"
      >
        <div className="relative w-full h-full">
          {Array.from({ length: n * n }, (_, i) => (
            <div key={i} className="absolute p-[3%]" data-block={blocks.includes(i) ? '1' : undefined}
              style={{ left: `${((i % n) / n) * 100}%`, top: `${(Math.floor(i / n) / n) * 100}%`, width: `${100 / n}%`, height: `${100 / n}%` }}>
              {blocks.includes(i)
                ? <div className="w-full h-full rounded-md bg-[#2b1a0c] border-2 border-[#1a0f06] flex items-center justify-center text-[#a07850] text-lg" title="Broken die">✖</div>
                : <div className="w-full h-full rounded-full bg-black/25" />}
            </div>
          ))}
          {ghosts.map(t => renderTile(t, true))}
          {snap.tiles.map(t => renderTile(t, false))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 max-w-[240px] mx-auto w-full" aria-label="slide controls">
        {(['left', 'up', 'down', 'right'] as Dir[]).map(d => (
          <button key={d} data-dir={d} onClick={() => move(d)} disabled={settled || !rules.dirs.includes(d)}
            className="py-1.5 rounded-lg bg-panel border border-line text-ink text-sm font-bold disabled:opacity-40">
            {d === 'left' ? '←' : d === 'up' ? '↑' : d === 'down' ? '↓' : '→'}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 min-h-[2rem]">
        <p className={`text-xs leading-snug ${jammed ? 'text-red-700 font-bold' : 'text-ink-2'}`} role="status">
          {jammed ? 'The tray is jammed!' : settled ? '' : `${config.intro} Swipe or use the arrow keys.`}
        </p>
        <div className="flex gap-1.5 shrink-0">
          {undosFor(difficulty) > 0 && (
            <button onClick={undo} disabled={settled || undos <= 0 || !history.length}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-accent text-accent-fg disabled:opacity-40">
              Undo ({undos})
            </button>
          )}
          {jammed && undos > 0 && (
            <button onClick={giveUp} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-panel border border-line text-ink">Melt down</button>
          )}
        </div>
      </div>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle={`The ${coinName(target)} is struck!`} loseTitle="The mint has jammed" />
    </div>
  )
}

export const CONFIG_IDS = Object.keys(CONFIGS)
