import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Coin Mint: a 2048-style sliding merge.  Every swipe slides all the coins on
// the tray as far as they go; two equal coins that meet are struck into one
// coin of the next denomination.  The ladder climbs through the history of a
// currency, and the challenge is won by minting the target coin.  It is lost
// when the tray is full and no two neighbours match.
//
// New coins appear on a seeded schedule (spawn n of seed s is always the same
// for the same tray), so a board is reproducible and the tests can prove
// every level winnable by playing it.
//
// Difficulty: a roomier 5×5 tray at D1, then 4×4; the target climbs from the
// 128 coin to the 1024 coin; fewer undos; more high-value coins spawn.

export interface MintConfig {
  title: string
  intro: string
  fact: string
  /** Denomination names, tier 1 (the "2") upwards. */
  coins: string[]
  /** Metal hues per tier band, light → dark. */
  palette?: 'mediterranean' | 'china' | 'britain'
}

export const CONFIGS: Record<string, MintConfig> = {
  lydia: {
    title: 'From Lydia to Byzantium',
    intro: 'Strike electrum nuggets into staters, drachmae and denarii — all the way to the gold solidus.',
    fact: 'The kingdom of Lydia struck the first known coins, of electrum, in the late 7th century BCE; Constantine’s gold solidus of 309 CE held its weight for 700 years.',
    coins: ['Electrum', 'Hekte', 'Stater', 'Croesid', 'Daric', 'Obol', 'Drachma', 'Tetradrachm', 'Denarius', 'Solidus', 'Hyperpyron', 'Florin'],
    palette: 'mediterranean',
  },
  china: {
    title: 'The Silk Road Mint',
    intro: 'Merge cowrie shells into spade and knife money, then cash coins, paper jiaozi and silver taels — up to the gold ingot.',
    fact: 'Shells served as money in Shang China; the round Ban Liang of Qin Shi Huang set the square-holed shape for two thousand years, and Song Sichuan printed jiaozi, the first paper money, around 1024.',
    coins: ['Cowrie', 'Bronze cowrie', 'Spade money', 'Knife money', 'Ban liang', 'Wu zhu', 'Kaiyuan', 'Jiaozi', 'Silver tael', 'Gold ingot', 'Sycee', 'Dragon dollar'],
    palette: 'china',
  },
  britain: {
    title: 'The Royal Mint',
    intro: 'Strike farthings and pennies into shillings, crowns and pounds — and finally the gold sovereign.',
    fact: 'The first gold sovereign was struck for Henry VII in 1489; the modern sovereign of 1817, with Pistrucci’s St George, is still minted today.',
    coins: ['Farthing', 'Halfpenny', 'Penny', 'Groat', 'Shilling', 'Florin', 'Half crown', 'Crown', 'Pound', 'Sovereign', 'Five pounds', 'Britannia'],
    palette: 'britain',
  },
}

export type Dir = 'left' | 'right' | 'up' | 'down'
export const DIRS: Dir[] = ['left', 'right', 'up', 'down']

export const sizeFor = (d: Difficulty) => scale(d, [5, 4, 4, 4])
/** Tier to mint: 7 → the "128" coin, 10 → the "1024" coin. */
export const targetFor = (d: Difficulty) => scale(d, [7, 8, 9, 10])
export const undosFor = (d: Difficulty) => scale(d, [3, 2, 1, 0])
export const highSpawnFor = (d: Difficulty) => scale(d, [0.05, 0.1, 0.1, 0.15])

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

/** Slide a grid of tiers (0 = empty). */
export function slideGrid(grid: readonly number[], n: number, dir: Dir): { grid: number[]; moved: boolean; gained: number; best: number } {
  const out = new Array<number>(grid.length).fill(0)
  let moved = false, gained = 0, best = 0
  for (const line of linesCached(n, dir)) {
    let w = 0, last = 0, lastMerged = true
    for (const idx of line) {
      const v = grid[idx]
      if (!v) continue
      if (!lastMerged && v === last) {
        out[line[w - 1]] = v + 1
        gained += 1 << (v + 1)
        if (v + 1 > best) best = v + 1
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

export function canMove(grid: readonly number[], n: number): boolean {
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i]) return true
    const r = Math.floor(i / n), c = i % n
    if (c + 1 < n && grid[i + 1] === grid[i]) return true
    if (r + 1 < n && grid[i + n] === grid[i]) return true
  }
  return false
}

/** Spawn number `count` of a game: where the next coin lands and its tier. */
export function spawnAt(grid: readonly number[], seed: number, count: number, high: number): { idx: number; v: number } | null {
  const empties: number[] = []
  for (let i = 0; i < grid.length; i++) if (!grid[i]) empties.push(i)
  if (!empties.length) return null
  const rng = mulberry32(hashString(`mint:${seed}:${count}`))
  const idx = empties[Math.floor(rng() * empties.length)]
  return { idx, v: rng() < high ? 2 : 1 }
}

export interface GridState { grid: number[]; spawns: number }

export function initialGrid(n: number, seed: number, high: number): GridState {
  let grid = new Array<number>(n * n).fill(0)
  let spawns = 0
  for (let k = 0; k < 2; k++) {
    const s = spawnAt(grid, seed, spawns++, high)!
    grid = grid.slice(); grid[s.idx] = s.v
  }
  return { grid, spawns }
}

/** One full turn: slide, then the seeded spawn.  Null if the slide does nothing. */
export function turn(st: GridState, n: number, dir: Dir, seed: number, high: number): (GridState & { best: number; gained: number }) | null {
  const r = slideGrid(st.grid, n, dir)
  if (!r.moved) return null
  const s = spawnAt(r.grid, seed, st.spawns, high)
  if (s) r.grid[s.idx] = s.v
  return { grid: r.grid, spawns: st.spawns + 1, best: r.best, gained: r.gained }
}

// ── A strong player, for tests and proof of winnability ─────────────────────

function heuristic(grid: readonly number[], n: number): number {
  // Snake gradient anchored in the top-left corner, plus room to breathe.
  let s = 0, empty = 0
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const v = grid[r * n + c]
    if (!v) { empty++; continue }
    const k = r * n + (r % 2 === 0 ? c : n - 1 - c)
    s += (1 << v) * Math.pow(0.5, k * 0.5)
  }
  return s + empty * 6
}

/** Best direction with exact lookahead (spawns are deterministic). */
export function bestDir(st: GridState, n: number, seed: number, high: number, depth = 3): Dir | null {
  const search = (s: GridState, d: number): number => {
    if (d === 0) return heuristic(s.grid, n)
    let best = -Infinity
    for (const dir of DIRS) {
      const t = turn(s, n, dir, seed, high)
      if (!t) continue
      best = Math.max(best, search(t, d - 1))
    }
    return best === -Infinity ? -1e9 : best
  }
  let pick: Dir | null = null, best = -Infinity
  for (const dir of DIRS) {
    const t = turn(st, n, dir, seed, high)
    if (!t) continue
    const v = search(t, depth - 1)
    if (v > best) { best = v; pick = dir }
  }
  return pick
}

/** Plays a level with the strong player; reports whether it reached the target. */
export function playOut(n: number, target: number, seed: number, high: number, maxTurns = 5000): { won: boolean; turns: number; best: number } {
  let st = initialGrid(n, seed, high)
  let best = Math.max(...st.grid)
  for (let t = 0; t < maxTurns; t++) {
    if (best >= target) return { won: true, turns: t, best }
    const dir = bestDir(st, n, seed, high)
    if (!dir) return { won: false, turns: t, best }
    st = turn(st, n, dir, seed, high)!
    best = Math.max(best, ...st.grid)
  }
  return { won: false, turns: maxTurns, best }
}

// ── Tiles with identity, for animation ──────────────────────────────────────

export interface Tile { id: number; v: number; pos: number; born?: 'spawn' | 'merge' }

export function slideTiles(tiles: readonly Tile[], n: number, dir: Dir, nextId: number): { tiles: Tile[]; ghosts: Tile[]; nextId: number } {
  const at = new Map<number, Tile>()
  for (const t of tiles) at.set(t.pos, t)
  const out: Tile[] = [], ghosts: Tile[] = []
  for (const line of linesCached(n, dir)) {
    let w = 0
    let prev: Tile | null = null, prevMerged = true
    for (const idx of line) {
      const t = at.get(idx)
      if (!t) continue
      if (prev && !prevMerged && prev.v === t.v) {
        const pos = line[w - 1]
        out.splice(out.indexOf(prev), 1)
        ghosts.push({ ...prev, pos, born: undefined }, { ...t, pos, born: undefined })
        out.push({ id: nextId++, v: t.v + 1, pos, born: 'merge' })
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

export const tilesToGrid = (tiles: readonly Tile[], n: number) => {
  const g = new Array<number>(n * n).fill(0)
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
  const n = sizeFor(difficulty)
  const target = targetFor(difficulty)
  const high = highSpawnFor(difficulty)
  const mintSeed = useMemo(() => seed ^ hashString(`mint:${configId}`), [seed, configId])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const start = useMemo<Snapshot>(() => {
    const g = initialGrid(n, mintSeed, high)
    let id = 1
    const tiles: Tile[] = []
    g.grid.forEach((v, pos) => { if (v) tiles.push({ id: id++, v, pos, born: 'spawn' }) })
    return { tiles, spawns: g.spawns, score: 0 }
  }, [n, mintSeed, high])

  const [snap, setSnap] = useState<Snapshot>(start)
  const [ghosts, setGhosts] = useState<Tile[]>([])
  const [history, setHistory] = useState<Snapshot[]>([])
  const [undos, setUndos] = useState(undosFor(difficulty))
  const nextId = useRef(100)
  const ghostTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (ghostTimer.current) clearTimeout(ghostTimer.current) }, [])

  const best = Math.max(0, ...snap.tiles.map(t => t.v))
  const coinName = (v: number) => config.coins[Math.min(v, config.coins.length) - 1]

  const move = useCallback((dir: Dir) => {
    if (settled) return
    const r = slideTiles(snap.tiles, n, dir, nextId.current)
    const before = tilesToGrid(snap.tiles, n)
    const slid = slideGrid(before, n, dir)
    if (!slid.moved) return
    nextId.current = r.nextId
    const sp = spawnAt(tilesToGrid(r.tiles, n), mintSeed, snap.spawns, high)
    const tiles = sp ? [...r.tiles, { id: nextId.current++, v: sp.v, pos: sp.idx, born: 'spawn' as const }] : r.tiles
    setHistory(h => [...h.slice(-9), snap])
    setSnap({ tiles, spawns: snap.spawns + 1, score: snap.score + slid.gained })
    setGhosts(r.ghosts)
    if (ghostTimer.current) clearTimeout(ghostTimer.current)
    ghostTimer.current = setTimeout(() => setGhosts([]), 140)
    if (slid.best >= target) { win(); return }
    if (!canMove(tilesToGrid(tiles, n), n) && undos <= 0) lose('the tray is jammed — no coins can merge')
  }, [settled, snap, n, mintSeed, high, target, win, lose, undos])

  const jammed = !settled && !canMove(tilesToGrid(snap.tiles, n), n)

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
    const [hi, lo] = bands[Math.min(t.v, bands.length) - 1]
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
          <span className="font-bold leading-none text-[#2a1d0c]" style={{ fontSize: 'clamp(7px, 15cqw, 13px)' }}>{coinName(t.v)}</span>
          <span className="tabular-nums text-[#2a1d0c]/70 leading-none mt-0.5" style={{ fontSize: 'clamp(7px, 13cqw, 11px)' }}>{1 << t.v}</span>
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
            <div key={i} className="absolute p-[3%]" style={{ left: `${((i % n) / n) * 100}%`, top: `${(Math.floor(i / n) / n) * 100}%`, width: `${100 / n}%`, height: `${100 / n}%` }}>
              <div className="w-full h-full rounded-full bg-black/25" />
            </div>
          ))}
          {ghosts.map(t => renderTile(t, true))}
          {snap.tiles.map(t => renderTile(t, false))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 max-w-[240px] mx-auto w-full" aria-label="slide controls">
        {(['left', 'up', 'down', 'right'] as Dir[]).map(d => (
          <button key={d} data-dir={d} onClick={() => move(d)} disabled={settled}
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
