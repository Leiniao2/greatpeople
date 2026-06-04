import { useReducer, useEffect, useCallback } from 'react'

// ── Constants ──────────────────────────────────────────────────────────────────

const COLS = 9
const ROWS = 6
const PX0 = 0
const PY0 = ROWS - 1
const EX  = COLS - 1
const EY  = 0

// ── Types ──────────────────────────────────────────────────────────────────────

type DangerType = 'soldier' | 'mine'
interface Cell { x: number; y: number }
interface Danger extends Cell { id: number; type: DangerType }

interface ReporterConfig {
  title: string
  soldiers: Cell[]
  mines: Cell[]
  lives: number
  fact: string
}

// ── Configs ────────────────────────────────────────────────────────────────────

const CONFIGS: Record<string, ReporterConfig> = {
  'vietnam-press': {
    title: 'Vietnam War Correspondent',
    soldiers: [{ x: 4, y: 3 }, { x: 7, y: 5 }, { x: 2, y: 1 }],
    mines:    [{ x: 3, y: 4 }, { x: 5, y: 2 }, { x: 6, y: 3 }],
    lives: 3,
    fact: "War correspondents in Vietnam risked their lives for images that shaped history. Nick Ut's photo of nine-year-old Kim Phuc fleeing a napalm attack (1972) shocked the world and accelerated opposition to the war. Over 60 journalists were killed covering the conflict.",
  },
  'gulf-war-press': {
    title: 'Gulf War Frontline Reporter',
    soldiers: [{ x: 3, y: 5 }, { x: 6, y: 4 }, { x: 1, y: 2 }, { x: 5, y: 1 }],
    mines:    [{ x: 2, y: 3 }, { x: 4, y: 2 }, { x: 7, y: 3 }],
    lives: 3,
    fact: "During the Gulf War (1990–91), CNN's live coverage from Baghdad transformed journalism forever. Peter Arnett reported live as bombs fell around him — the first time audiences watched a war unfold in real time. It created both the 'CNN Effect' and new ethical questions about embedded reporting.",
  },
  'wwii-correspondent': {
    title: 'WWII Front Lines',
    soldiers: [{ x: 2, y: 4 }, { x: 5, y: 3 }, { x: 7, y: 2 }, { x: 4, y: 1 }],
    mines:    [{ x: 1, y: 3 }, { x: 3, y: 2 }, { x: 6, y: 4 }, { x: 8, y: 1 }],
    lives: 2,
    fact: "WWII correspondents like Ernie Pyle and Martha Gellhorn faced the same dangers as the soldiers they covered. Pyle won the Pulitzer Prize for his dispatches from North Africa, Sicily, and France — then was killed by Japanese machine-gun fire in 1945.",
  },
}

// ── Game state / reducer ───────────────────────────────────────────────────────

interface GameState {
  px: number; py: number
  dangers: Danger[]
  lives: number
  phase: 'playing' | 'hit' | 'won' | 'lost'
  turns: number
}

type Action =
  | { type: 'MOVE'; dx: number; dy: number }
  | { type: 'RESUME' }
  | { type: 'RESET'; cfg: ReporterConfig }

function initState(cfg: ReporterConfig): GameState {
  return {
    px: PX0, py: PY0,
    dangers: [
      ...cfg.soldiers.map((s, i) => ({ ...s, id: i,                      type: 'soldier' as const })),
      ...cfg.mines.map((m, i)    => ({ ...m, id: cfg.soldiers.length + i, type: 'mine'    as const })),
    ],
    lives: cfg.lives,
    phase: 'playing',
    turns: 0,
  }
}

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)) }

function stepToward(from: Cell, to: Cell): Cell {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return from
  if (Math.abs(dx) >= Math.abs(dy)) return { x: from.x + Math.sign(dx), y: from.y }
  return { x: from.x, y: from.y + Math.sign(dy) }
}

function reducer(state: GameState, action: Action): GameState {
  if (action.type === 'RESET')  return initState(action.cfg)
  if (action.type === 'RESUME') return { ...state, phase: 'playing', px: PX0, py: PY0 }

  if (action.type === 'MOVE') {
    if (state.phase !== 'playing') return state
    const nx = clamp(state.px + action.dx, 0, COLS - 1)
    const ny = clamp(state.py + action.dy, 0, ROWS - 1)

    if (nx === EX && ny === EY) return { ...state, px: nx, py: ny, phase: 'won' }

    // Check mine at destination
    const mineThere = state.dangers.find(d => d.type === 'mine' && d.x === nx && d.y === ny)

    // Move soldiers toward new player position
    let newDangers: Danger[] = state.dangers.map(d => {
      if (d.type === 'mine') return d
      const moved = stepToward(d, { x: nx, y: ny })
      return { ...d, x: moved.x, y: moved.y }
    })
    if (mineThere) newDangers = newDangers.filter(d => d.id !== mineThere.id)

    const soldierThere = newDangers.find(d => d.type === 'soldier' && d.x === nx && d.y === ny)
    const isHit = !!(mineThere || soldierThere)

    if (isHit) {
      const newLives = state.lives - 1
      if (newLives <= 0) return { ...state, px: nx, py: ny, dangers: newDangers, lives: 0, phase: 'lost' }
      return { ...state, px: nx, py: ny, dangers: newDangers, lives: newLives, phase: 'hit' }
    }

    return { ...state, px: nx, py: ny, dangers: newDangers, phase: 'playing', turns: state.turns + 1 }
  }

  return state
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ReporterFleeGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const cfg = CONFIGS[configId] ?? CONFIGS['vietnam-press']

  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => initState(cfg),
  )

  // Auto-resume after hit
  useEffect(() => {
    if (state.phase !== 'hit') return
    const t = setTimeout(() => dispatch({ type: 'RESUME' }), 800)
    return () => clearTimeout(t)
  }, [state.phase])

  const move = useCallback((dx: number, dy: number) => {
    dispatch({ type: 'MOVE', dx, dy })
  }, [])

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp')    { e.preventDefault(); move(0, -1) }
      if (e.key === 'ArrowDown')  { e.preventDefault(); move(0,  1) }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); move(-1, 0) }
      if (e.key === 'ArrowRight') { e.preventDefault(); move( 1, 0) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [move])

  if (state.phase === 'won') return (
    <div className="flex flex-col items-center gap-4 p-6 text-center">
      <div className="text-5xl">📷✅</div>
      <div className="text-xl font-bold text-amber-400">You made it out!</div>
      <p className="text-sm text-slate-300 max-w-xs leading-relaxed">{cfg.fact}</p>
      <button onClick={onWin} className="px-6 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-semibold text-slate-900">Complete</button>
    </div>
  )

  if (state.phase === 'lost') return (
    <div className="flex flex-col items-center gap-4 p-6 text-center">
      <div className="text-5xl">💀</div>
      <div className="text-xl font-bold text-red-400">Captured!</div>
      <p className="text-sm text-slate-400 max-w-xs">Dodge 🪖 soldiers and 💣 mines. Reach 🚪 in the top-right corner.</p>
      <button onClick={() => dispatch({ type: 'RESET', cfg })} className="px-6 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-semibold text-white">Try Again</button>
    </div>
  )

  const { px, py, dangers, lives, phase, turns } = state

  return (
    <div className="flex flex-col items-center gap-3 p-3 select-none">
      <div className="font-semibold text-amber-400 text-sm">{cfg.title}</div>

      {/* Status bar */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex gap-0.5">
          {Array.from({ length: cfg.lives }).map((_, i) => (
            <span key={i} className={i < lives ? 'text-base' : 'text-base opacity-30'}>❤️</span>
          ))}
        </div>
        <span className="text-slate-500 text-xs">Turn {turns}</span>
        {phase === 'hit' && <span className="text-red-400 text-xs animate-pulse font-semibold">Hit!</span>}
      </div>

      {/* Grid */}
      <div
        className="border border-slate-700 rounded bg-slate-900/60"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: '2px', padding: '4px' }}
      >
        {Array.from({ length: ROWS * COLS }).map((_, i) => {
          const x = i % COLS
          const y = Math.floor(i / COLS)
          const isPlayer  = px === x && py === y
          const isExit    = x === EX && y === EY
          const danger    = dangers.find(d => d.x === x && d.y === y)
          const isSoldier = danger?.type === 'soldier'
          const isMine    = danger?.type === 'mine'

          return (
            <div
              key={i}
              className={`w-8 h-8 flex items-center justify-center rounded text-base border ${
                isExit   ? 'border-amber-500/60 bg-amber-900/20' :
                isPlayer ? 'border-cyan-500/60  bg-cyan-900/20'  :
                           'border-slate-700/40 bg-slate-800/40'
              }`}
            >
              {isPlayer  ? '📷' :
               isExit    ? '🚪' :
               isSoldier ? '🪖' :
               isMine    ? '💣' : null}
            </div>
          )
        })}
      </div>

      {/* D-pad */}
      <div className="grid grid-cols-3 gap-1.5 mt-1">
        <div />
        <button onClick={() => move( 0, -1)} className="w-11 h-11 bg-slate-700 hover:bg-slate-600 rounded-lg text-lg active:scale-90 transition-all flex items-center justify-center">↑</button>
        <div />
        <button onClick={() => move(-1,  0)} className="w-11 h-11 bg-slate-700 hover:bg-slate-600 rounded-lg text-lg active:scale-90 transition-all flex items-center justify-center">←</button>
        <div className="w-11 h-11 flex items-center justify-center text-slate-500 text-base">📷</div>
        <button onClick={() => move( 1,  0)} className="w-11 h-11 bg-slate-700 hover:bg-slate-600 rounded-lg text-lg active:scale-90 transition-all flex items-center justify-center">→</button>
        <div />
        <button onClick={() => move( 0,  1)} className="w-11 h-11 bg-slate-700 hover:bg-slate-600 rounded-lg text-lg active:scale-90 transition-all flex items-center justify-center">↓</button>
        <div />
      </div>

      <div className="text-xs text-slate-500 text-center">Move 📷 to reach 🚪 · Dodge 🪖 soldiers and 💣 mines</div>
    </div>
  )
}
