import { useState, useEffect, useCallback, useRef } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

type Theme = 'dungeon' | 'arctic' | 'underground' | 'forest'

interface BigMazeConfig {
  title: string
  subtitle: string
  theme: Theme
  levels: number
  size: number          // odd number, e.g. 21, 23, 25
  shape: 'square' | 'cross' | 'diamond' | 'irregular'
  fogRadius: number     // 0 = no fog
  hasKey: boolean
  seedBase: number
}

const CONFIGS: Record<string, BigMazeConfig> = {
  'enkidu-steppe': {
    title: 'The Wild Steppes', subtitle: 'Escape the wilderness and reach civilization',
    theme: 'forest', levels: 2, size: 23, shape: 'irregular',
    fogRadius: 0, hasKey: false, seedBase: 42,
  },
  'everest-summit': {
    title: 'Ascent to the Summit', subtitle: 'Navigate the ice walls of Everest to reach the top',
    theme: 'arctic', levels: 3, size: 25, shape: 'diamond',
    fogRadius: 5, hasKey: true, seedBase: 137,
  },
  'pleistoanax-mountain': {
    title: 'Mount Lycaeum', subtitle: 'Descend from exile through the sacred mountain',
    theme: 'dungeon', levels: 2, size: 21, shape: 'cross',
    fogRadius: 4, hasKey: false, seedBase: 99,
  },
  'pyramid-deep': {
    title: 'Inner Sanctum', subtitle: 'Navigate the burial chambers of the pharaoh',
    theme: 'dungeon', levels: 3, size: 21, shape: 'square',
    fogRadius: 3, hasKey: true, seedBase: 17,
  },
  'cedar-forest': {
    title: 'Forest of Humbaba', subtitle: 'Find your way through the enchanted cedar forest',
    theme: 'forest', levels: 2, size: 25, shape: 'diamond',
    fogRadius: 4, hasKey: false, seedBase: 55,
  },
  'everest-peak': {
    title: 'The Final Approach', subtitle: 'Through ice and wind, reach the roof of the world',
    theme: 'arctic', levels: 2, size: 27, shape: 'irregular',
    fogRadius: 5, hasKey: true, seedBase: 201,
  },
  'long-march': {
    title: 'Mountain Pass', subtitle: 'Lead the Red Army through treacherous mountain passes',
    theme: 'dungeon', levels: 3, size: 23, shape: 'cross',
    fogRadius: 3, hasKey: false, seedBase: 73,
  },
  'pacific-strait': {
    title: 'The Strait of Magellan', subtitle: 'Navigate the treacherous passage between the oceans',
    theme: 'underground', levels: 2, size: 25, shape: 'cross',
    fogRadius: 4, hasKey: true, seedBase: 186,
  },
  'enkidu-elements': {
    title: 'Wild Lands', subtitle: 'Roam the untamed wilderness before Uruk',
    theme: 'forest', levels: 2, size: 23, shape: 'irregular',
    fogRadius: 0, hasKey: false, seedBase: 63,
  },
}

// ── Theme definitions ──────────────────────────────────────────────────────────

interface ThemeDef {
  bg: string
  wallCls: string
  floorCls: string
  playerCls: string
  voidCls: string
  exitCls: string
  keyCls: string
  textAccent: string
}

const THEME: Record<Theme, ThemeDef> = {
  dungeon: {
    bg: '#0a0a14',
    wallCls: 'bg-slate-800',
    floorCls: 'bg-slate-900/60',
    playerCls: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]',
    voidCls: 'bg-slate-950',
    exitCls: 'bg-emerald-900/60',
    keyCls: 'bg-yellow-900/60',
    textAccent: 'text-amber-400',
  },
  arctic: {
    bg: '#0d1a2e',
    wallCls: 'bg-slate-300',
    floorCls: 'bg-slate-700/40',
    playerCls: 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.7)]',
    voidCls: 'bg-slate-950',
    exitCls: 'bg-cyan-800/40',
    keyCls: 'bg-yellow-700/50',
    textAccent: 'text-cyan-400',
  },
  underground: {
    bg: '#0d0800',
    wallCls: 'bg-amber-950',
    floorCls: 'bg-yellow-950/60',
    playerCls: 'bg-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.7)]',
    voidCls: 'bg-stone-950',
    exitCls: 'bg-orange-900/50',
    keyCls: 'bg-yellow-800/60',
    textAccent: 'text-yellow-400',
  },
  forest: {
    bg: '#0a1505',
    wallCls: 'bg-green-900',
    floorCls: 'bg-green-950/50',
    playerCls: 'bg-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.7)]',
    voidCls: 'bg-slate-950',
    exitCls: 'bg-teal-900/50',
    keyCls: 'bg-yellow-900/60',
    textAccent: 'text-lime-400',
  },
}

// ── Seeded RNG ─────────────────────────────────────────────────────────────────

function seededRand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
}

// ── Shape mask ─────────────────────────────────────────────────────────────────

function makeShapeMask(rows: number, cols: number, shape: string): (r: number, c: number) => boolean {
  const cr = Math.floor(rows / 2), cc = Math.floor(cols / 2)

  if (shape === 'cross') {
    const vband = Math.floor(cols * 0.35), hband = Math.floor(rows * 0.35)
    return (r, c) => !(
      (c >= cc - vband && c <= cc + vband) ||
      (r >= cr - hband && r <= cr + hband)
    )
  }
  if (shape === 'diamond') {
    const radius = Math.floor(Math.min(rows, cols) * 0.42)
    return (r, c) => Math.abs(r - cr) + Math.abs(c - cc) > radius
  }
  if (shape === 'irregular') {
    const cut = Math.floor(Math.min(rows, cols) * 0.25)
    return (r, c) =>
      (r < cut && c < cut) || (r < cut && c >= cols - cut) ||
      (r >= rows - cut && c < cut) || (r >= rows - cut && c >= cols - cut)
  }
  return () => false
}

// ── Maze generation ────────────────────────────────────────────────────────────

function generateMaze(rows: number, cols: number, shape: string, seed: number, hasKey: boolean): string[][] {
  const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill('#'))
  const rand = seededRand(seed)
  const isVoid = makeShapeMask(rows, cols, shape)

  function carve(r: number, c: number) {
    grid[r][c] = '.'
    const dirs: [number, number][] = [[0, 2], [0, -2], [2, 0], [-2, 0]]
    // Shuffle dirs
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]]
    }
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc
      if (nr > 0 && nr < rows - 1 && nc > 0 && nc < cols - 1 && grid[nr][nc] === '#' && !isVoid(nr, nc)) {
        grid[r + dr / 2][c + dc / 2] = '.'
        carve(nr, nc)
      }
    }
  }

  // Find a valid start cell (must be odd coords and not void)
  let startR = 1, startC = 1
  outer: for (let r = 1; r < rows - 1; r += 2) {
    for (let c = 1; c < cols - 1; c += 2) {
      if (!isVoid(r, c)) { startR = r; startC = c; break outer }
    }
  }

  carve(startR, startC)

  // Mark all void cells back as walls (they may have been untouched)
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (isVoid(r, c)) grid[r][c] = '#'

  grid[startR][startC] = 'S'

  // Place exit: find farthest reachable open cell from start
  let farthestR = rows - 2, farthestC = cols - 2
  let maxDist = -1

  // BFS to find farthest
  const visited = Array.from({ length: rows }, () => Array(cols).fill(-1))
  const queue: [number, number, number][] = [[startR, startC, 0]]
  visited[startR][startC] = 0
  const DIRS4: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]
  while (queue.length > 0) {
    const [r, c, d] = queue.shift()!
    if (d > maxDist && grid[r][c] !== '#' && !isVoid(r, c) && (r !== startR || c !== startC)) {
      maxDist = d
      farthestR = r
      farthestC = c
    }
    for (const [dr, dc] of DIRS4) {
      const nr = r + dr, nc = c + dc
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && visited[nr][nc] === -1 && grid[nr][nc] !== '#') {
        visited[nr][nc] = d + 1
        queue.push([nr, nc, d + 1])
      }
    }
  }

  grid[farthestR][farthestC] = 'E'

  // Place key at ~60% distance if needed
  if (hasKey && maxDist > 4) {
    const target = Math.floor(maxDist * 0.55)
    let bestR = startR, bestC = startC, bestDiff = Infinity
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== '.') continue
        const d = visited[r][c]
        if (d < 0) continue
        const diff = Math.abs(d - target)
        if (diff < bestDiff) { bestDiff = diff; bestR = r; bestC = c }
      }
    }
    if (bestR !== startR || bestC !== startC) grid[bestR][bestC] = 'K'
  }

  return grid
}

// ── Component ──────────────────────────────────────────────────────────────────

const VIEWPORT = 13   // must be odd
const HALF_VP = Math.floor(VIEWPORT / 2)  // 6
const CELL_SIZE = 28

export default function BigMazeGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId] ?? CONFIGS['pyramid-deep']
  const th = THEME[config.theme]

  const [levelIdx, setLevelIdx] = useState(0)
  const [grid, setGrid] = useState<string[][]>(() =>
    generateMaze(config.size, config.size, config.shape, config.seedBase + 0, config.hasKey)
  )
  const [playerPos, setPlayerPos] = useState<[number, number]>([1, 1])
  const [hasKey, setHasKey] = useState(false)
  const [steps, setSteps] = useState(0)
  const [levelFlash, setLevelFlash] = useState(false)
  const [won, setWon] = useState(false)

  const gridRef = useRef(grid)
  const playerRef = useRef(playerPos)
  const hasKeyRef = useRef(hasKey)
  const wonRef = useRef(won)
  useEffect(() => { gridRef.current = grid }, [grid])
  useEffect(() => { playerRef.current = playerPos }, [playerPos])
  useEffect(() => { hasKeyRef.current = hasKey }, [hasKey])
  useEffect(() => { wonRef.current = won }, [won])

  // Find start position in new grid
  function findStart(g: string[][]): [number, number] {
    for (let r = 0; r < g.length; r++)
      for (let c = 0; c < g[r].length; c++)
        if (g[r][c] === 'S') return [r, c]
    return [1, 1]
  }

  const loadLevel = useCallback((idx: number) => {
    const newGrid = generateMaze(config.size, config.size, config.shape, config.seedBase + idx * 7919, config.hasKey)
    const start = findStart(newGrid)
    setGrid(newGrid)
    setPlayerPos(start)
    setHasKey(false)
    setLevelFlash(true)
    setTimeout(() => setLevelFlash(false), 900)
  }, [config])

  const move = useCallback((dr: number, dc: number) => {
    if (wonRef.current) return
    const [pr, pc] = playerRef.current
    const g = gridRef.current
    const nr = pr + dr, nc = pc + dc
    const rows = g.length, cols = g[0]?.length ?? 0
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return
    const cell = g[nr][nc]
    if (cell === '#') return

    setSteps(s => s + 1)
    setPlayerPos([nr, nc])

    if (cell === 'K') {
      setHasKey(true)
      // Remove key from grid
      setGrid(prev => {
        const next = prev.map(row => [...row])
        next[nr][nc] = '.'
        return next
      })
    } else if (cell === 'E') {
      const canExit = !config.hasKey || hasKeyRef.current
      if (canExit) {
        const nextIdx = levelIdx + 1
        if (nextIdx >= config.levels) {
          setWon(true)
          setTimeout(onWin, 800)
        } else {
          setLevelIdx(nextIdx)
          setTimeout(() => loadLevel(nextIdx), 300)
        }
      }
    }
  }, [levelIdx, config, loadLevel, onWin])

  // Keyboard controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W': e.preventDefault(); move(-1, 0); break
        case 'ArrowDown':  case 's': case 'S': e.preventDefault(); move(1,  0); break
        case 'ArrowLeft':  case 'a': case 'A': e.preventDefault(); move(0, -1); break
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); move(0,  1); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [move])

  const [pr, pc] = playerPos
  const fogRadius = config.fogRadius

  // Render viewport cells
  const cells: JSX.Element[] = []
  for (let vr = 0; vr < VIEWPORT; vr++) {
    for (let vc = 0; vc < VIEWPORT; vc++) {
      const mr = pr - HALF_VP + vr
      const mc = pc - HALF_VP + vc

      const isPlayerCell = vr === HALF_VP && vc === HALF_VP

      // Fog of war
      const chebDist = Math.max(Math.abs(vr - HALF_VP), Math.abs(vc - HALF_VP))
      const inFog = fogRadius > 0 && chebDist > fogRadius
      const nearFog = fogRadius > 0 && chebDist === fogRadius + 1

      // Out of bounds = wall
      const rows = grid.length, cols = grid[0]?.length ?? 0
      const outOfBounds = mr < 0 || mr >= rows || mc < 0 || mc >= cols
      const cell = outOfBounds ? '#' : grid[mr][mc]
      const isWall = cell === '#'
      const isExit = cell === 'E'
      const isKey = cell === 'K'

      let bgCls = th.floorCls
      if (inFog) bgCls = ''
      else if (outOfBounds) bgCls = th.voidCls
      else if (isWall) bgCls = th.wallCls
      else if (isExit) bgCls = th.exitCls
      else if (isKey) bgCls = th.keyCls

      const fogStyle: React.CSSProperties = inFog
        ? { background: '#05050f' }
        : nearFog ? { opacity: 0.35 } : {}

      cells.push(
        <div
          key={`${vr}-${vc}`}
          className={`relative flex items-center justify-center ${bgCls}`}
          style={{ width: CELL_SIZE, height: CELL_SIZE, ...fogStyle }}
        >
          {!inFog && isExit && !isPlayerCell && (
            <span className="text-[14px] leading-none select-none">🚪</span>
          )}
          {!inFog && isKey && !isPlayerCell && (
            <span className="text-[14px] leading-none select-none">🔑</span>
          )}
          {isPlayerCell && (
            <div
              className={`rounded-full z-10 ${th.playerCls}`}
              style={{ width: CELL_SIZE - 8, height: CELL_SIZE - 8 }}
            />
          )}
        </div>
      )
    }
  }

  const exitNeedsKey = config.hasKey && !hasKey
  const [pr2, pc2] = playerPos
  const exitVisible = fogRadius === 0 || (() => {
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < grid[r].length; c++)
        if (grid[r][c] === 'E') {
          const cheb = Math.max(Math.abs(r - pr2), Math.abs(c - pc2))
          return fogRadius === 0 || cheb <= fogRadius
        }
    return false
  })()
  void exitVisible  // may be used for status hint in future

  return (
    <div className="flex flex-col items-center gap-3 text-white select-none">

      {/* Header */}
      <div className="text-center">
        <p className={`font-bold text-sm tracking-wide ${th.textAccent}`}>{config.title}</p>
        <p className="text-slate-400 text-[10px]">{config.subtitle}</p>
      </div>

      {/* Level & steps bar */}
      <div className="flex items-center gap-5 text-xs">
        <span className="text-slate-400">
          Level <span className={`font-bold ${th.textAccent}`}>{levelIdx + 1}/{config.levels}</span>
        </span>
        <span className="text-slate-400">
          Steps <span className={`font-bold ${th.textAccent}`}>{steps}</span>
        </span>
        {config.hasKey && (
          <span className={hasKey ? 'text-yellow-400 font-bold' : 'text-slate-600'}>
            {hasKey ? '🔑 Key collected' : '🔑 Find the key'}
          </span>
        )}
      </div>

      {/* Viewport */}
      <div
        className="relative rounded-xl overflow-hidden border border-slate-600/40"
        style={{ width: CELL_SIZE * VIEWPORT, height: CELL_SIZE * VIEWPORT, background: th.bg }}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${VIEWPORT}, ${CELL_SIZE}px)`,
            gridTemplateRows: `repeat(${VIEWPORT}, ${CELL_SIZE}px)`,
          }}
        >
          {cells}
        </div>

        {/* Level flash overlay */}
        {levelFlash && (
          <div className="absolute inset-0 bg-white/10 flex items-center justify-center pointer-events-none z-20 rounded-xl">
            <div className="bg-slate-950/90 border border-slate-600 rounded-xl px-5 py-3 text-center">
              <p className={`font-bold text-sm ${th.textAccent}`}>Level {levelIdx + 1} / {config.levels}</p>
              <p className="text-slate-400 text-[10px] mt-0.5">{config.title}</p>
            </div>
          </div>
        )}

        {/* Won flash */}
        {won && (
          <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center pointer-events-none z-20 rounded-xl animate-pulse" />
        )}
      </div>

      {/* Hint */}
      <p className="text-slate-600 text-[10px]">
        {exitNeedsKey ? 'Find the 🔑 key before the 🚪 exit opens' : 'Reach the 🚪 exit'}
      </p>

      {/* D-pad */}
      <div className="flex flex-col items-center gap-1 mt-1">
        <DPadBtn label="↑" onClick={() => move(-1, 0)} accent={th.textAccent} />
        <div className="flex items-center gap-1">
          <DPadBtn label="←" onClick={() => move(0, -1)} accent={th.textAccent} />
          <div
            className="flex items-center justify-center rounded-lg bg-slate-800/30 border border-slate-700/30"
            style={{ width: 44, height: 44 }}
          >
            <div className="w-2 h-2 rounded-full bg-slate-600/50" />
          </div>
          <DPadBtn label="→" onClick={() => move(0, 1)} accent={th.textAccent} />
        </div>
        <DPadBtn label="↓" onClick={() => move(1, 0)} accent={th.textAccent} />
      </div>
    </div>
  )
}

function DPadBtn({ label, onClick, accent }: { label: string; onClick: () => void; accent: string }) {
  void accent
  return (
    <button
      onPointerDown={e => { e.preventDefault(); onClick() }}
      className="flex items-center justify-center rounded-lg border text-lg font-bold
        bg-white/10 border-slate-600/50 text-slate-300
        hover:bg-white/20 active:bg-amber-500/30 active:border-amber-500/50
        transition-all duration-100 select-none touch-none"
      style={{ width: 44, height: 44 }}
    >
      {label}
    </button>
  )
}
