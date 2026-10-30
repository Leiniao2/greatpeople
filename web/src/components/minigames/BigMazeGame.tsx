import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, resolveConfig, scale, useGameOutcome } from './_shared'

// The maze engine: procedurally generated levels seen through a scrolling
// viewport, with fog of war, an optional key, and wandering monsters that
// hunt the player at higher difficulties.
//
// Difficulty (1–4) scales what a config asks for:
//   levels     1 / 2 / 2 / all      monsters   1 / 2 / 3 / 4 (chase from 2)
//   fog radius – / 6 / 5 / 4        key        from 3        step budget at 4

// ── Types ──────────────────────────────────────────────────────────────────────

type Theme = 'dungeon' | 'arctic' | 'underground' | 'forest' | 'sky'

interface BigMazeConfig {
  title: string
  subtitle: string
  theme: Theme
  levels: number
  size: number          // odd number, e.g. 21, 23, 25
  shape: 'square' | 'cross' | 'diamond' | 'irregular'
  fogRadius: number     // 0 = never fogged
  hasKey: boolean
  seedBase: number
  monsterCount?: number // overrides the difficulty default
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
  'atlantic-sky': {
    title: 'Atlantic Crossing', subtitle: "Chart Earhart's course through storm corridors over the Atlantic",
    theme: 'sky', levels: 2, size: 23, shape: 'irregular',
    fogRadius: 5, hasKey: false, seedBase: 311,
  },
  mulan: {
    title: 'The Northern Passes', subtitle: "Slip Mulan's company through the mountain passes to the front",
    theme: 'forest', levels: 2, size: 23, shape: 'cross',
    fogRadius: 4, hasKey: false, seedBase: 419,
  },
  musashi: {
    title: 'Road to Ganryū Island', subtitle: 'Reach the duelling ground before the tide turns',
    theme: 'forest', levels: 2, size: 21, shape: 'diamond',
    fogRadius: 4, hasKey: false, seedBase: 523,
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
  monsters: string[]
}

const THEME: Record<Theme, ThemeDef> = {
  dungeon: {
    bg: '#0a0a14', wallCls: 'bg-panel-2', floorCls: 'bg-paper-2',
    playerCls: 'bg-accent shadow-[0_0_8px_rgba(155,44,35,0.7)]',
    voidCls: 'bg-paper-2', exitCls: 'bg-emerald-900/60', keyCls: 'bg-yellow-900/60',
    textAccent: 'text-accent', monsters: ['💀', '🦇', '🐍'],
  },
  arctic: {
    bg: '#0d1a2e', wallCls: 'bg-slate-300', floorCls: 'bg-line',
    playerCls: 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.7)]',
    voidCls: 'bg-paper-2', exitCls: 'bg-cyan-800/40', keyCls: 'bg-yellow-700/50',
    textAccent: 'text-cyan-600', monsters: ['🐻‍❄️', '🌨️', '🐺'],
  },
  underground: {
    bg: '#0d0800', wallCls: 'bg-amber-950', floorCls: 'bg-yellow-950/60',
    playerCls: 'bg-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.7)]',
    voidCls: 'bg-stone-950', exitCls: 'bg-orange-900/50', keyCls: 'bg-yellow-800/60',
    textAccent: 'text-yellow-600', monsters: ['🦑', '🌊', '🦈'],
  },
  forest: {
    bg: '#0a1505', wallCls: 'bg-green-900', floorCls: 'bg-green-950/50',
    playerCls: 'bg-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.7)]',
    voidCls: 'bg-paper-2', exitCls: 'bg-teal-900/50', keyCls: 'bg-yellow-900/60',
    textAccent: 'text-lime-600', monsters: ['🐺', '🐗', '🦊'],
  },
  sky: {
    bg: '#9ccbe8', wallCls: 'bg-panel', floorCls: 'bg-sky-300/30',
    playerCls: 'bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.7)]',
    voidCls: 'bg-sky-200', exitCls: 'bg-yellow-300/50', keyCls: 'bg-yellow-300/60',
    textAccent: 'text-blue-700', monsters: ['🦅', '⚡', '🌪️'],
  },
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

const DIRS4: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

type Pos = [number, number]

interface Level {
  grid: string[][]
  start: Pos
  exit: Pos
  monsters: Pos[]
  /** Shortest walk from start to exit (via the key when there is one). */
  shortest: number
}

function bfs(grid: string[][], from: Pos): number[][] {
  const rows = grid.length, cols = grid[0].length
  const dist = Array.from({ length: rows }, () => Array(cols).fill(-1))
  const queue: Pos[] = [from]
  dist[from[0]][from[1]] = 0
  while (queue.length) {
    const [r, c] = queue.shift()!
    for (const [dr, dc] of DIRS4) {
      const nr = r + dr, nc = c + dc
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && dist[nr][nc] === -1 && grid[nr][nc] !== '#') {
        dist[nr][nc] = dist[r][c] + 1
        queue.push([nr, nc])
      }
    }
  }
  return dist
}

function generateLevel(size: number, shape: string, seed: number, hasKey: boolean, monsterCount: number): Level {
  const rows = size, cols = size
  const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill('#'))
  const rand = mulberry32(seed)
  const isVoid = makeShapeMask(rows, cols, shape)

  function carve(r: number, c: number) {
    grid[r][c] = '.'
    const dirs: [number, number][] = [[0, 2], [0, -2], [2, 0], [-2, 0]]
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

  let startR = 1, startC = 1
  outer: for (let r = 1; r < rows - 1; r += 2) {
    for (let c = 1; c < cols - 1; c += 2) {
      if (!isVoid(r, c)) { startR = r; startC = c; break outer }
    }
  }
  carve(startR, startC)
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (isVoid(r, c)) grid[r][c] = '#'
  grid[startR][startC] = 'S'

  // Exit: the farthest reachable cell from the start.
  const fromStart = bfs(grid, [startR, startC])
  let exit: Pos = [rows - 2, cols - 2], maxDist = -1
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (fromStart[r][c] > maxDist && grid[r][c] === '.') { maxDist = fromStart[r][c]; exit = [r, c] }
  grid[exit[0]][exit[1]] = 'E'

  // Key: an open cell about 55% of the way to the exit.
  let shortest = maxDist
  if (hasKey && maxDist > 4) {
    const target = Math.floor(maxDist * 0.55)
    let best: Pos | null = null, bestDiff = Infinity
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== '.') continue
        const diff = Math.abs(fromStart[r][c] - target)
        if (fromStart[r][c] >= 0 && diff < bestDiff) { bestDiff = diff; best = [r, c] }
      }
    if (best) {
      grid[best[0]][best[1]] = 'K'
      const fromKey = bfs(grid, best)
      shortest = fromStart[best[0]][best[1]] + fromKey[exit[0]][exit[1]]
    }
  }

  // Monsters: open cells well away from the start, spread out from each other.
  const candidates: Pos[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (grid[r][c] === '.' && fromStart[r][c] >= 8) candidates.push([r, c])
  const monsters: Pos[] = []
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }
  for (const cand of candidates) {
    if (monsters.length >= monsterCount) break
    if (monsters.every(m => Math.abs(m[0] - cand[0]) + Math.abs(m[1] - cand[1]) >= 6)) monsters.push(cand)
  }

  return { grid, start: [startR, startC], exit, monsters, shortest }
}

// ── Component ──────────────────────────────────────────────────────────────────

const VIEWPORT = 13   // must be odd
const HALF_VP = Math.floor(VIEWPORT / 2)
const CELL_SIZE = 28

function settings(config: BigMazeConfig, difficulty: Difficulty) {
  return {
    levels: Math.min(config.levels, scale(difficulty, [1, 2, 2, config.levels])),
    fogRadius: config.fogRadius > 0 ? scale(difficulty, [0, 6, 5, 4]) : 0,
    monsters: config.monsterCount ?? scale(difficulty, [1, 2, 3, 4]),
    monstersChase: difficulty >= 2,
    hasKey: config.hasKey && difficulty >= 3,
    stepBudgetFactor: difficulty >= 4 ? 2.5 : 0,
  }
}

export default function BigMazeGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'pyramid-deep')
  const th = THEME[config.theme]
  const rules = useMemo(() => settings(config, difficulty), [config, difficulty])
  const { outcome, lost, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })
  const [lostHow, setLostHow] = useState('')

  const makeLevel = useCallback((idx: number) =>
    generateLevel(config.size, config.shape, config.seedBase + seed * 31 + idx * 7919, rules.hasKey, rules.monsters),
    [config, seed, rules])

  const [levelIdx, setLevelIdx] = useState(0)
  const [level, setLevel] = useState<Level>(() => makeLevel(0))
  const [grid, setGrid] = useState<string[][]>(level.grid)
  const [playerPos, setPlayerPos] = useState<Pos>(level.start)
  const [monsters, setMonsters] = useState<Pos[]>(level.monsters)
  const [hasKey, setHasKey] = useState(false)
  const [steps, setSteps] = useState(0)
  const [levelFlash, setLevelFlash] = useState(false)
  const stepBudget = rules.stepBudgetFactor ? Math.ceil(level.shortest * rules.stepBudgetFactor) : 0

  // Monster movement needs the latest state inside the move handler.
  const rng = useRef(mulberry32(seed ^ 0x9e3779b9))
  const state = useRef({ grid, playerPos, monsters, hasKey, steps, outcome })
  useEffect(() => { state.current = { grid, playerPos, monsters, hasKey, steps, outcome } }, [grid, playerPos, monsters, hasKey, steps, outcome])

  const loadLevel = useCallback((idx: number) => {
    const next = makeLevel(idx)
    setLevel(next)
    setGrid(next.grid)
    setPlayerPos(next.start)
    setMonsters(next.monsters)
    setHasKey(false)
    setLevelFlash(true)
    setTimeout(() => setLevelFlash(false), 900)
  }, [makeLevel])

  const caught = useCallback((how: string) => { setLostHow(how); lose(how) }, [lose])

  // Each monster takes one step after the player: toward the player when
  // chasing (most of the time), otherwise to a random open neighbour.
  const stepMonsters = useCallback((g: string[][], player: Pos, current: Pos[]): Pos[] => {
    if (!rules.monstersChase) return current
    return current.map(([r, c]) => {
      const open = DIRS4.map(([dr, dc]) => [r + dr, c + dc] as Pos)
        .filter(([nr, nc]) => g[nr]?.[nc] !== undefined && g[nr][nc] !== '#')
      if (open.length === 0) return [r, c]
      const chase = rng.current() < 0.7
      if (chase) {
        open.sort((a, b) =>
          (Math.abs(a[0] - player[0]) + Math.abs(a[1] - player[1])) -
          (Math.abs(b[0] - player[0]) + Math.abs(b[1] - player[1])))
        return open[0]
      }
      return open[Math.floor(rng.current() * open.length)]
    })
  }, [rules.monstersChase])

  const move = useCallback((dr: number, dc: number) => {
    const s = state.current
    if (s.outcome || levelFlash) return
    const [pr, pc] = s.playerPos
    const nr = pr + dr, nc = pc + dc
    const cell = s.grid[nr]?.[nc]
    if (cell === undefined || cell === '#') return

    const nextSteps = s.steps + 1
    setSteps(nextSteps)
    setPlayerPos([nr, nc])

    if (s.monsters.some(([mr, mc]) => mr === nr && mc === nc)) { caught('caught'); return }

    if (cell === 'K') {
      setHasKey(true)
      setGrid(prev => { const next = prev.map(row => [...row]); next[nr][nc] = '.'; return next })
    } else if (cell === 'E' && (!rules.hasKey || s.hasKey)) {
      const nextIdx = levelIdx + 1
      if (nextIdx >= rules.levels) win()
      else { setLevelIdx(nextIdx); setTimeout(() => loadLevel(nextIdx), 300) }
      return
    }

    const moved = stepMonsters(s.grid, [nr, nc], s.monsters)
    setMonsters(moved)
    if (moved.some(([mr, mc]) => mr === nr && mc === nc)) { caught('caught'); return }
    if (stepBudget && nextSteps >= stepBudget) caught('out of steps')
  }, [levelIdx, rules, loadLevel, stepMonsters, caught, win, stepBudget, levelFlash])

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
  const fogRadius = rules.fogRadius
  const monsterAt = (r: number, c: number) => monsters.findIndex(([mr, mc]) => mr === r && mc === c)

  // Render viewport cells
  const cells: JSX.Element[] = []
  for (let vr = 0; vr < VIEWPORT; vr++) {
    for (let vc = 0; vc < VIEWPORT; vc++) {
      const mr = pr - HALF_VP + vr
      const mc = pc - HALF_VP + vc
      const isPlayerCell = vr === HALF_VP && vc === HALF_VP

      const chebDist = Math.max(Math.abs(vr - HALF_VP), Math.abs(vc - HALF_VP))
      const inFog = fogRadius > 0 && chebDist > fogRadius
      const nearFog = fogRadius > 0 && chebDist === fogRadius + 1

      const outOfBounds = mr < 0 || mr >= grid.length || mc < 0 || mc >= grid[0].length
      const cell = outOfBounds ? '#' : grid[mr][mc]
      const isWall = cell === '#'
      const isExit = cell === 'E'
      const isKey = cell === 'K'
      const monster = outOfBounds ? -1 : monsterAt(mr, mc)

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
          {!inFog && isExit && !isPlayerCell && <span className="text-[14px] leading-none select-none">🚪</span>}
          {!inFog && isKey && !isPlayerCell && <span className="text-[14px] leading-none select-none">🔑</span>}
          {!inFog && monster >= 0 && !isPlayerCell && (
            <span className="text-[16px] leading-none select-none">{th.monsters[monster % th.monsters.length]}</span>
          )}
          {isPlayerCell && (
            <div className={`rounded-full z-10 ${lost ? 'bg-red-500' : th.playerCls}`}
              style={{ width: CELL_SIZE - 8, height: CELL_SIZE - 8 }} />
          )}
        </div>
      )
    }
  }

  const exitNeedsKey = rules.hasKey && !hasKey

  return (
    <div className="flex flex-col items-center gap-3 text-ink select-none">
      <div className="text-center">
        <p className={`font-bold text-sm tracking-wide ${th.textAccent}`}>{config.title}</p>
        <p className="text-muted text-[10px]">{config.subtitle}</p>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted">
          Level <span className={`font-bold ${th.textAccent}`}>{levelIdx + 1}/{rules.levels}</span>
        </span>
        <span className={stepBudget && steps > stepBudget * 0.8 ? 'text-red-600 font-bold' : 'text-muted'}>
          Steps <span className={`font-bold ${th.textAccent}`}>{steps}</span>{stepBudget ? ` / ${stepBudget}` : ''}
        </span>
        {rules.hasKey && (
          <span className={hasKey ? 'text-yellow-600 font-bold' : 'text-muted/80'}>
            {hasKey ? '🔑 Key collected' : '🔑 Find the key'}
          </span>
        )}
      </div>

      <div className="relative rounded-xl overflow-hidden border border-line"
        style={{ width: CELL_SIZE * VIEWPORT, height: CELL_SIZE * VIEWPORT, background: th.bg }}>
        <div className="grid"
          style={{ gridTemplateColumns: `repeat(${VIEWPORT}, ${CELL_SIZE}px)`, gridTemplateRows: `repeat(${VIEWPORT}, ${CELL_SIZE}px)` }}>
          {cells}
        </div>

        {levelFlash && (
          <div className="absolute inset-0 bg-panel flex items-center justify-center pointer-events-none z-20 rounded-xl">
            <div className="bg-paper-2 border border-line rounded-xl px-5 py-3 text-center">
              <p className={`font-bold text-sm ${th.textAccent}`}>Level {levelIdx + 1} / {rules.levels}</p>
              <p className="text-muted text-[10px] mt-0.5">{config.title}</p>
            </div>
          </div>
        )}
        {outcome === 'won' && (
          <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center pointer-events-none z-20 rounded-xl animate-pulse" />
        )}
        {lost && (
          <div className="absolute inset-0 bg-red-900/50 flex items-center justify-center z-20 rounded-xl">
            <p className="text-paper font-bold text-lg drop-shadow">{lostHow === 'out of steps' ? 'Out of steps' : 'Caught!'}</p>
          </div>
        )}
      </div>

      <p className="text-muted/80 text-[10px]">
        {exitNeedsKey ? 'Find the 🔑 key before the 🚪 exit opens' : 'Reach the 🚪 exit'}
        {rules.monsters > 0 && (rules.monstersChase ? ' — the hunters follow your every step' : ' — don\'t touch the lurking beasts')}
      </p>

      <div className="flex flex-col items-center gap-1 mt-1">
        <DPadBtn label="↑" onClick={() => move(-1, 0)} />
        <div className="flex items-center gap-1">
          <DPadBtn label="←" onClick={() => move(0, -1)} />
          <div className="flex items-center justify-center rounded-lg bg-panel-2 border border-line" style={{ width: 44, height: 44 }}>
            <div className="w-2 h-2 rounded-full bg-line-2" />
          </div>
          <DPadBtn label="→" onClick={() => move(0, 1)} />
        </div>
        <DPadBtn label="↓" onClick={() => move(1, 0)} />
      </div>
    </div>
  )
}

function DPadBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onPointerDown={e => { e.preventDefault(); onClick() }}
      className="flex items-center justify-center rounded-lg border text-lg font-bold
        bg-panel border-line text-ink-2
        hover:bg-panel-2 active:bg-accent/30 active:border-accent/50
        transition-all duration-100 select-none touch-none"
      style={{ width: 44, height: 44 }}
    >
      {label}
    </button>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
