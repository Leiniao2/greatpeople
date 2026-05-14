import { useState, useEffect, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

type Dir = 'right' | 'left' | 'up' | 'down'
type MirrorChar = '/' | '\\'

interface Source {
  row: number
  col: number // -1 = enters from left, gridSize = enters from right, etc.
  dir: Dir
}

interface Target {
  row: number  // -1 = exits top, gridSize = exits bottom
  col: number  // -1 = exits left, gridSize = exits right
}

interface FixedMirror {
  row: number
  col: number
  mirror: MirrorChar
}

type MirrorKey = 'mendel' | 'euclid' | 'digital' | 'plato' | 'anaxagoras' | 'al-khwarizmi' | 'lorentz'
  | 'newton-prism' | 'huygens' | 'foucault' | 'archimedes-mirror' | 'snell'

interface MirrorConfig {
  title: string
  instruction: string
  gridSize: number
  source: Source
  target: Target
  fixed: FixedMirror[]
  maxMirrors: number
}

const CONFIGS: Record<MirrorKey, MirrorConfig> = {
  mendel: {
    title: "Mendel's Pea Garden",
    instruction: "Redirect the light beam to separate Mendel's genetic traits!",
    gridSize: 5,
    source: { row: 2, col: -1, dir: 'right' },
    target: { row: 0, col: 5 },
    fixed: [{ row: 2, col: 2, mirror: '/' }],
    maxMirrors: 2,
  },
  euclid: {
    title: "Euclid's Reflection Law",
    instruction: "Prove Euclid's law of reflection — light always bounces at equal angles!",
    gridSize: 5,
    source: { row: 0, col: -1, dir: 'right' },
    target: { row: 4, col: 5 },
    fixed: [{ row: 0, col: 2, mirror: '\\' }],
    maxMirrors: 2,
  },
  digital: {
    title: 'Fiber Optic Network',
    instruction: 'Route the data signal through fiber optic cables to reach the server!',
    gridSize: 5,
    source: { row: 5, col: 0, dir: 'up' },
    target: { row: -1, col: 4 },
    fixed: [{ row: 3, col: 0, mirror: '/' }],
    maxMirrors: 2,
  },
  plato: {
    title: "Plato's Cave",
    instruction: "In Plato's Cave, shadows are cast by a hidden light. Redirect the beam to reach the cave wall.",
    gridSize: 5,
    source: { row: 4, col: -1, dir: 'right' },
    target: { row: 0, col: 5 },
    fixed: [{ row: 4, col: 1, mirror: '/' }],
    maxMirrors: 2,
  },
  anaxagoras: {
    title: 'The Fiery Rock',
    instruction: "Anaxagoras claimed the sun is a fiery rock — not a god. Direct its light to prove your theory.",
    gridSize: 5,
    source: { row: -1, col: 2, dir: 'down' },
    target: { row: 5, col: 4 },
    fixed: [{ row: 1, col: 2, mirror: '\\' }],
    maxMirrors: 2,
  },
  'al-khwarizmi': {
    title: 'House of Wisdom',
    instruction: "Baghdad's House of Wisdom studied optics. Route the light beam through the library to the lens.",
    gridSize: 5,
    source: { row: 0, col: -1, dir: 'right' },
    target: { row: 4, col: 5 },
    fixed: [{ row: 0, col: 3, mirror: '\\' }, { row: 2, col: 3, mirror: '/' }],
    maxMirrors: 1,
  },
  lorentz: {
    title: 'Speed of Light',
    instruction: "Lorentz showed light's path changes with velocity. Guide the beam to demonstrate time dilation.",
    gridSize: 6,
    source: { row: -1, col: 0, dir: 'down' },
    target: { row: 6, col: 5 },
    fixed: [{ row: 1, col: 0, mirror: '\\' }, { row: 1, col: 4, mirror: '/' }],
    maxMirrors: 2,
  },
  'newton-prism': {
    title: "Newton's Prism",
    instruction: "White light splits into a spectrum when it bends. Route the beam through two deflections to reach the far corner.",
    gridSize: 7,
    source: { row: -1, col: 0, dir: 'down' },
    target: { row: 7, col: 6 },
    fixed: [{ row: 2, col: 0, mirror: '\\' }, { row: 2, col: 4, mirror: '/' }],
    maxMirrors: 2,
  },
  huygens: {
    title: "Huygens' Wave Front",
    instruction: "Each point on a wave front is itself a source. Use one mirror to guide the beam across three reflections to the exit.",
    gridSize: 7,
    source: { row: 6, col: -1, dir: 'right' },
    target: { row: 0, col: 7 },
    fixed: [
      { row: 6, col: 2, mirror: '/' },
      { row: 2, col: 2, mirror: '/' },
      { row: 2, col: 5, mirror: '/' },
    ],
    maxMirrors: 1,
  },
  foucault: {
    title: "Foucault's Rotating Mirror",
    instruction: "Foucault measured the speed of light using a spinning mirror. With only one mirror to place, route the beam through four reflections to exit right.",
    gridSize: 7,
    source: { row: -1, col: 0, dir: 'down' },
    target: { row: 3, col: 7 },
    fixed: [
      { row: 5, col: 0, mirror: '\\' },
      { row: 5, col: 4, mirror: '/' },
      { row: 0, col: 4, mirror: '\\' },
      { row: 0, col: 1, mirror: '/' },
    ],
    maxMirrors: 1,
  },
  'archimedes-mirror': {
    title: "Archimedes' Burning Mirrors",
    instruction: "Archimedes focused sunlight to set ships ablaze. Thread the beam through the mirror array — two placements, five bounces.",
    gridSize: 8,
    source: { row: -1, col: 2, dir: 'down' },
    target: { row: 5, col: 8 },
    fixed: [
      { row: 3, col: 2, mirror: '\\' },
      { row: 3, col: 5, mirror: '/' },
      { row: 0, col: 5, mirror: '\\' },
    ],
    maxMirrors: 2,
  },
  snell: {
    title: "Snell's Law",
    instruction: "Light bends precisely when crossing between media. One mirror is all you have — trace the full four-bounce path to the target.",
    gridSize: 8,
    source: { row: -1, col: 3, dir: 'down' },
    target: { row: 8, col: 7 },
    fixed: [
      { row: 2, col: 3, mirror: '/' },
      { row: 2, col: 0, mirror: '\\' },
      { row: 0, col: 0, mirror: '/' },
    ],
    maxMirrors: 1,
  },
}

// ── Light tracing ──────────────────────────────────────────────────────────────

function reflect(dir: Dir, mirror: MirrorChar): Dir {
  if (mirror === '/') {
    const map: Record<Dir, Dir> = { right: 'up', up: 'right', left: 'down', down: 'left' }
    return map[dir]
  } else {
    const map: Record<Dir, Dir> = { right: 'down', down: 'right', left: 'up', up: 'left' }
    return map[dir]
  }
}

function dirDelta(dir: Dir): [number, number] {
  switch (dir) {
    case 'right': return [0, 1]
    case 'left':  return [0, -1]
    case 'up':    return [-1, 0]
    case 'down':  return [1, 0]
  }
}

interface TraceResult {
  lit: Set<string>
  exitRow: number
  exitCol: number
  hits: boolean
}

function traceLight(
  gridSize: number,
  source: Source,
  mirrors: Record<string, MirrorChar>,
  target: Target,
): TraceResult {
  const lit = new Set<string>()
  let r = source.row
  let c = source.col
  let dir = source.dir
  const seen = new Set<string>()

  // Step into the grid first
  const [dr, dc] = dirDelta(dir)
  r += dr
  c += dc

  let exitRow = -999
  let exitCol = -999
  const MAX_STEPS = 200

  for (let step = 0; step < MAX_STEPS; step++) {
    // Out of bounds => this is the exit
    if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) {
      exitRow = r
      exitCol = c
      break
    }

    const key = `${r},${c}`
    // Cycle detection
    const stateKey = `${r},${c},${dir}`
    if (seen.has(stateKey)) break
    seen.add(stateKey)

    lit.add(key)

    // Check for mirror at this cell
    const m = mirrors[key]
    if (m) {
      dir = reflect(dir, m)
    }

    const [ndr, ndc] = dirDelta(dir)
    r += ndr
    c += ndc
  }

  const hits = exitRow === target.row && exitCol === target.col
  return { lit, exitRow, exitCol, hits }
}

// ── Component ──────────────────────────────────────────────────────────────────

interface MirrorGameProps {
  configId: string
  onWin: () => void
}

export default function MirrorGame({ configId, onWin }: MirrorGameProps) {
  const config = CONFIGS[configId as MirrorKey] ?? CONFIGS['mendel']
  const { gridSize, source, target, fixed, maxMirrors } = config

  // Build fixed mirror lookup
  const fixedMap: Record<string, MirrorChar> = {}
  fixed.forEach(f => { fixedMap[`${f.row},${f.col}`] = f.mirror })

  const [playerMirrors, setPlayerMirrors] = useState<Record<string, MirrorChar>>({})
  const [won, setWon] = useState(false)

  const allMirrors = { ...fixedMap, ...playerMirrors }

  const { lit, hits } = traceLight(gridSize, source, allMirrors, target)

  // Win detection
  useEffect(() => {
    if (hits && !won) {
      setWon(true)
      setTimeout(() => onWin(), 1000)
    }
  }, [hits, won, onWin])

  const handleCellClick = useCallback((r: number, c: number) => {
    if (won) return
    const key = `${r},${c}`
    if (fixedMap[key]) return // Can't modify fixed mirrors

    setPlayerMirrors(prev => {
      const current = prev[key]
      const next = { ...prev }
      if (!current) {
        if (Object.keys(prev).length >= maxMirrors) return prev // max reached
        next[key] = '/'
      } else if (current === '/') {
        next[key] = '\\'
      } else {
        delete next[key]
      }
      return next
    })
  }, [won, fixedMap, maxMirrors])

  const playerMirrorCount = Object.keys(playerMirrors).length
  const CELL = 56

  // Direction arrow for source indicator
  const sourceArrow = { right: '→', left: '←', up: '↑', down: '↓' }[source.dir]

  // Determine source/target edge positions for edge indicators
  // Source enters from: col=-1 → left edge of row, col=gridSize → right edge, row=-1 → top, row=gridSize → bottom
  const getEdgeIndicator = (row: number, col: number) => {
    // Edge cell outside grid
    if (col === -1) return { gridRow: row, gridCol: -1, side: 'left' }
    if (col === gridSize) return { gridRow: row, gridCol: gridSize, side: 'right' }
    if (row === -1) return { gridRow: -1, gridCol: col, side: 'top' }
    if (row === gridSize) return { gridRow: gridSize, gridCol: col, side: 'bottom' }
    return null
  }

  const sourceEdge = getEdgeIndicator(source.row, source.col)
  const targetEdge = getEdgeIndicator(target.row, target.col)

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Header */}
      <div className="text-center px-2">
        <p className="text-amber-400 font-bold text-sm">{config.title}</p>
        <p className="text-slate-400 text-xs leading-relaxed">{config.instruction}</p>
      </div>

      {/* Mirror counter */}
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span>Mirrors placed: <span className="text-amber-300 font-bold">{playerMirrorCount} / {maxMirrors}</span></span>
        <span className="text-slate-600">|</span>
        <span className="text-slate-500">Click cell to cycle / → \ → empty</span>
      </div>

      {/* Grid with edge indicators */}
      <div
        className="relative"
        style={{
          width: (gridSize + 2) * CELL,
          height: (gridSize + 2) * CELL,
        }}>
        {/* Grid area offset by 1 cell for edge indicators */}
        <div
          className="absolute rounded-xl overflow-hidden border border-slate-700/60"
          style={{
            left: CELL,
            top: CELL,
            width: gridSize * CELL,
            height: gridSize * CELL,
            display: 'grid',
            gridTemplateColumns: `repeat(${gridSize}, ${CELL}px)`,
            gridTemplateRows: `repeat(${gridSize}, ${CELL}px)`,
            background: '#0f0f1e',
          }}>
          {Array.from({ length: gridSize }, (_, r) =>
            Array.from({ length: gridSize }, (_, c) => {
              const key = `${r},${c}`
              const isFixed = !!fixedMap[key]
              const mirror = allMirrors[key]
              const isLit = lit.has(key)
              const isPlayer = !!playerMirrors[key]

              return (
                <div
                  key={key}
                  onClick={() => handleCellClick(r, c)}
                  style={{ width: CELL, height: CELL }}
                  className={`relative flex items-center justify-center border border-slate-800/60
                    transition-all duration-200 cursor-pointer
                    ${isFixed
                      ? 'bg-amber-900/30 cursor-default'
                      : isPlayer
                      ? 'bg-slate-800/60 hover:bg-slate-700/60'
                      : 'bg-slate-900/50 hover:bg-slate-800/40'
                    }
                    ${isLit && !won ? 'bg-amber-500/20 border-amber-500/30' : ''}
                    ${isLit && won ? 'bg-emerald-400/30 border-emerald-400/40' : ''}
                  `}>
                  {/* Light beam overlay */}
                  {isLit && (
                    <div className={`absolute inset-0 transition-all duration-300
                      ${won
                        ? 'bg-emerald-400/20 animate-pulse'
                        : 'bg-amber-400/15'
                      }`} />
                  )}

                  {/* Mirror glyph */}
                  {mirror && (
                    <span className={`relative z-10 text-xl font-bold select-none
                      ${isFixed ? 'text-amber-400' : 'text-slate-200'}
                      ${isLit ? (won ? 'text-emerald-300' : 'text-amber-200') : ''}
                    `}>
                      {mirror}
                    </span>
                  )}

                  {/* Fixed indicator dot */}
                  {isFixed && !mirror && (
                    <div className="w-2 h-2 rounded-full bg-amber-500/40" />
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Source indicator */}
        {sourceEdge && (
          <div
            className="absolute flex items-center justify-center"
            style={{
              left: (sourceEdge.gridCol + 1) * CELL,
              top: (sourceEdge.gridRow + 1) * CELL,
              width: CELL,
              height: CELL,
            }}>
            <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/50
                            flex items-center justify-center text-amber-400 text-lg font-bold">
              {sourceArrow}
            </div>
          </div>
        )}

        {/* Target indicator */}
        {targetEdge && (
          <div
            className="absolute flex items-center justify-center"
            style={{
              left: (targetEdge.gridCol + 1) * CELL,
              top: (targetEdge.gridRow + 1) * CELL,
              width: CELL,
              height: CELL,
            }}>
            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-base
                            transition-all duration-300
              ${hits
                ? 'bg-emerald-400/30 border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)] animate-pulse'
                : 'bg-slate-800/60 border-slate-500/50 text-slate-400'
              }`}>
              ★
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="text-amber-400 font-bold text-xs">/\</span> your mirrors
        </span>
        <span className="flex items-center gap-1">
          <span className="text-amber-500 font-bold text-xs">/</span>
          <span className="text-amber-900 text-xs">▪</span> fixed
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-amber-400/30 w-3 h-3 rounded-sm inline-block" /> lit beam
        </span>
      </div>

      {won && (
        <div className="text-emerald-400 font-bold text-sm animate-pulse text-center">
          Light reaches the target!
        </div>
      )}
    </div>
  )
}
