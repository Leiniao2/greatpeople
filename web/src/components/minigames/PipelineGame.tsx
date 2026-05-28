import { useState, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

// Each cell stores which of its 4 sides (N, E, S, W) has an opening.
// A pipe tile is defined by its canonical opening set and how many 90° rotations
// have been applied to it.
type Dir = 0 | 1 | 2 | 3 // 0=N, 1=E, 2=S, 3=W

interface PipeTile {
  // Which sides are open *after* rotation (derived at render time)
  openings: Dir[]
  // How many 90° clockwise rotations from the base shape
  rotation: number
  // Base openings before rotation
  base: Dir[]
  // Visual shape type
  shape: 'straight' | 'elbow' | 'tee' | 'cross' | 'source' | 'sink' | 'empty'
  fixed: boolean  // source/sink cells cannot be rotated
}

interface PipelineConfig {
  title: string
  subtitle: string
  cols: number
  rows: number
  // Flat array of initial tile descriptors
  // shape, base openings, initial rotation, fixed flag
  tiles: Array<{ shape: PipeTile['shape']; base: Dir[]; rotation: number; fixed?: boolean }>
  sourceIdx: number
  sinkIdx: number
  fact: string
}

// ── Configs ────────────────────────────────────────────────────────────────────

const CONFIGS: Record<string, PipelineConfig> = {
  'roman-aqueduct': {
    title: 'Aqua Claudia — Route the Aqueduct',
    subtitle: 'Rome, 38–52 CE',
    cols: 5,
    rows: 4,
    sourceIdx: 0,
    sinkIdx: 19,
    // 5×4 = 20 cells, row-major.
    // Solution path: 0→1→2→7→12→17→18→19
    tiles: [
      // row 0
      { shape: 'source',   base: [1,2],    rotation: 0, fixed: true  }, // 0  source, opens E+S
      { shape: 'straight', base: [1,3],    rotation: 0              }, // 1  horiz
      { shape: 'elbow',    base: [2,3],    rotation: 0              }, // 2  S+W → turns down
      { shape: 'elbow',    base: [0,1],    rotation: 0              }, // 3  N+E
      { shape: 'elbow',    base: [0,3],    rotation: 0              }, // 4  N+W
      // row 1
      { shape: 'straight', base: [0,2],    rotation: 0              }, // 5  vert
      { shape: 'tee',      base: [0,1,2],  rotation: 0              }, // 6  N+E+S
      { shape: 'straight', base: [0,2],    rotation: 0              }, // 7  vert
      { shape: 'straight', base: [1,3],    rotation: 0              }, // 8  horiz
      { shape: 'elbow',    base: [2,3],    rotation: 0              }, // 9  S+W
      // row 2
      { shape: 'elbow',    base: [1,2],    rotation: 0              }, // 10 E+S
      { shape: 'straight', base: [1,3],    rotation: 0              }, // 11 horiz
      { shape: 'straight', base: [0,2],    rotation: 0              }, // 12 vert
      { shape: 'elbow',    base: [0,1],    rotation: 0              }, // 13 N+E
      { shape: 'straight', base: [0,2],    rotation: 0              }, // 14 vert
      // row 3
      { shape: 'elbow',    base: [0,1],    rotation: 0              }, // 15 N+E
      { shape: 'straight', base: [1,3],    rotation: 0              }, // 16 horiz
      { shape: 'straight', base: [1,3],    rotation: 0              }, // 17 horiz
      { shape: 'straight', base: [1,3],    rotation: 0              }, // 18 horiz
      { shape: 'sink',     base: [3,0],    rotation: 0, fixed: true }, // 19 sink, opens W+N
    ],
    fact: "Rome's Aqua Claudia, begun by Caligula and completed by Claudius in 52 CE, ran 69 km from springs in the Anio valley to the city — much of it on soaring arched arcades. Nine major aqueducts supplied ancient Rome with more water per capita than modern-day New York.",
  },
  'mesopotamia-canal': {
    title: "Sennacherib's Canal — Nineveh, 700 BCE",
    subtitle: 'Nineveh, Assyrian Empire',
    cols: 4,
    rows: 4,
    sourceIdx: 0,
    sinkIdx: 15,
    tiles: [
      // row 0
      { shape: 'source',   base: [1,2],    rotation: 0, fixed: true  }, // 0
      { shape: 'elbow',    base: [2,3],    rotation: 0              }, // 1
      { shape: 'straight', base: [0,2],    rotation: 0              }, // 2
      { shape: 'elbow',    base: [2,3],    rotation: 0              }, // 3
      // row 1
      { shape: 'straight', base: [0,2],    rotation: 0              }, // 4
      { shape: 'straight', base: [0,2],    rotation: 0              }, // 5
      { shape: 'tee',      base: [1,2,3],  rotation: 0              }, // 6
      { shape: 'straight', base: [0,2],    rotation: 0              }, // 7
      // row 2
      { shape: 'elbow',    base: [1,2],    rotation: 0              }, // 8
      { shape: 'straight', base: [1,3],    rotation: 0              }, // 9
      { shape: 'elbow',    base: [0,3],    rotation: 0              }, // 10
      { shape: 'straight', base: [0,2],    rotation: 0              }, // 11
      // row 3
      { shape: 'elbow',    base: [0,1],    rotation: 0              }, // 12
      { shape: 'straight', base: [1,3],    rotation: 0              }, // 13
      { shape: 'straight', base: [1,3],    rotation: 0              }, // 14
      { shape: 'sink',     base: [0,3],    rotation: 0, fixed: true }, // 15
    ],
    fact: "King Sennacherib of Assyria built the world's first long-distance water supply channel around 700 BCE — an 80 km canal system supplying Nineveh, complete with a proto-aqueduct bridge over a valley. It predates the Roman aqueducts by 500 years.",
  },
  'silk-road-caravan': {
    title: "Zhang Qian's Silk Road — Route the Caravan",
    subtitle: 'Han Dynasty, 130 BCE',
    cols: 5,
    rows: 5,
    sourceIdx: 0,
    sinkIdx: 24,
    tiles: [
      // row 0
      { shape: 'source',   base: [1,2],    rotation: 0, fixed: true  }, // 0
      { shape: 'straight', base: [1,3],    rotation: 0              }, // 1
      { shape: 'elbow',    base: [2,3],    rotation: 0              }, // 2
      { shape: 'elbow',    base: [2,3],    rotation: 0              }, // 3
      { shape: 'elbow',    base: [2,3],    rotation: 0              }, // 4
      // row 1
      { shape: 'elbow',    base: [1,2],    rotation: 0              }, // 5
      { shape: 'elbow',    base: [0,1],    rotation: 0              }, // 6
      { shape: 'straight', base: [0,2],    rotation: 0              }, // 7
      { shape: 'straight', base: [0,2],    rotation: 0              }, // 8
      { shape: 'straight', base: [0,2],    rotation: 0              }, // 9
      // row 2
      { shape: 'elbow',    base: [0,1],    rotation: 0              }, // 10
      { shape: 'tee',      base: [1,2,3],  rotation: 0              }, // 11
      { shape: 'straight', base: [1,3],    rotation: 0              }, // 12
      { shape: 'elbow',    base: [2,3],    rotation: 0              }, // 13
      { shape: 'elbow',    base: [0,3],    rotation: 0              }, // 14
      // row 3
      { shape: 'straight', base: [0,2],    rotation: 0              }, // 15
      { shape: 'straight', base: [0,2],    rotation: 0              }, // 16
      { shape: 'elbow',    base: [1,2],    rotation: 0              }, // 17
      { shape: 'straight', base: [1,3],    rotation: 0              }, // 18
      { shape: 'straight', base: [0,2],    rotation: 0              }, // 19
      // row 4
      { shape: 'elbow',    base: [0,1],    rotation: 0              }, // 20
      { shape: 'straight', base: [1,3],    rotation: 0              }, // 21
      { shape: 'elbow',    base: [0,3],    rotation: 0              }, // 22
      { shape: 'elbow',    base: [0,1],    rotation: 0              }, // 23
      { shape: 'sink',     base: [0,3],    rotation: 0, fixed: true }, // 24
    ],
    fact: "Emperor Wu of Han sent Zhang Qian west in 139 BCE to forge alliances. He returned 13 years later (having been captured by the Xiongnu for a decade) with intelligence that opened the Silk Road — the world's first transcontinental trade network, linking China to Rome across 4,000 miles.",
  },
}

// ── Rotation helpers ───────────────────────────────────────────────────────────

function rotateDir(d: Dir, turns: number): Dir {
  return ((d + turns) % 4) as Dir
}

function getOpenings(base: Dir[], rotation: number): Dir[] {
  return base.map(d => rotateDir(d, rotation))
}

function hasOpening(openings: Dir[], d: Dir): boolean {
  return openings.includes(d)
}

// ── BFS flood fill to find connected cells ────────────────────────────────────

function floodFill(
  tiles: PipeTile[],
  cols: number,
  rows: number,
  sourceIdx: number,
): Set<number> {
  const reached = new Set<number>()
  const queue = [sourceIdx]
  reached.add(sourceIdx)

  const neighbour = (idx: number, dir: Dir): number | null => {
    const col = idx % cols
    const row = Math.floor(idx / cols)
    if (dir === 0 && row > 0) return idx - cols
    if (dir === 1 && col < cols - 1) return idx + 1
    if (dir === 2 && row < rows - 1) return idx + cols
    if (dir === 3 && col > 0) return idx - 1
    return null
  }

  const opposite: Dir[] = [2, 3, 0, 1]

  while (queue.length > 0) {
    const cur = queue.shift()!
    const curOpenings = tiles[cur].openings
    for (const dir of curOpenings) {
      const nb = neighbour(cur, dir)
      if (nb === null || reached.has(nb)) continue
      const nbOpenings = tiles[nb].openings
      if (hasOpening(nbOpenings, opposite[dir] as Dir)) {
        reached.add(nb)
        queue.push(nb)
      }
    }
  }

  return reached
}

// ── Shuffle tile rotations for the initial puzzle state ───────────────────────

function buildInitialTiles(config: PipelineConfig): PipeTile[] {
  return config.tiles.map(t => {
    // Randomise rotation for non-fixed tiles
    const rotation = t.fixed
      ? t.rotation
      : (Math.floor(Math.random() * 4)) as number
    return {
      shape: t.shape,
      base: t.base,
      rotation,
      openings: getOpenings(t.base as Dir[], rotation) as Dir[],
      fixed: !!t.fixed,
    }
  })
}

// ── Pipe SVG paths ─────────────────────────────────────────────────────────────

// Each path is drawn within a 40×40 viewBox with openings at midpoints of each side.
// Center = (20, 20), opening endpoints: N=(20,0), E=(40,20), S=(20,40), W=(0,20)

function PipeSVG({ openings, shape, rotation, lit, isSource, isSink }: {
  openings: Dir[]
  shape: PipeTile['shape']
  rotation: number
  lit: boolean
  isSource: boolean
  isSink: boolean
}) {
  void shape; void rotation
  const stroke = lit ? '#f59e0b' : '#334155'
  const glow = lit ? 'drop-shadow(0 0 3px #f59e0b88)' : 'none'
  const center = 20

  // Draw pipe segments from center to each open side
  const ends: Record<Dir, [number, number]> = {
    0: [20, 0],   // N
    1: [40, 20],  // E
    2: [20, 40],  // S
    3: [0, 20],   // W
  }

  const pipes = openings.map(d => (
    <line
      key={d}
      x1={center} y1={center}
      x2={ends[d][0]} y2={ends[d][1]}
      stroke={stroke}
      strokeWidth={6}
      strokeLinecap="round"
      style={{ filter: glow, transition: 'stroke 0.25s, filter 0.25s' }}
    />
  ))

  return (
    <svg viewBox="0 0 40 40" width="100%" height="100%" overflow="visible">
      {/* Center node */}
      <circle
        cx={center} cy={center} r={isSource ? 6 : isSink ? 5 : 4}
        fill={isSource ? '#10b981' : isSink ? '#a78bfa' : lit ? '#fbbf24' : '#1e293b'}
        stroke={isSource ? '#34d399' : isSink ? '#c4b5fd' : lit ? '#fbbf2488' : '#475569'}
        strokeWidth={1.5}
        style={{ filter: lit && !isSource && !isSink ? glow : 'none', transition: 'fill 0.25s' }}
      />
      {pipes}
    </svg>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PipelineGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const cfg = CONFIGS[configId] ?? CONFIGS['roman-aqueduct']
  const [tiles, setTiles] = useState<PipeTile[]>(() => buildInitialTiles(cfg))
  const [won, setWon] = useState(false)

  const lit = floodFill(tiles, cfg.cols, cfg.rows, cfg.sourceIdx)
  const connected = lit.has(cfg.sinkIdx)

  const rotateTile = useCallback((idx: number) => {
    if (won) return
    setTiles(prev => {
      const next = prev.map((t, i) => {
        if (i !== idx || t.fixed) return t
        const newRot = ((t.rotation + 1) % 4) as number
        return {
          ...t,
          rotation: newRot,
          openings: getOpenings(t.base, newRot) as Dir[],
        }
      })
      // Check win after rotation
      const newLit = floodFill(next, cfg.cols, cfg.rows, cfg.sourceIdx)
      if (newLit.has(cfg.sinkIdx)) {
        setWon(true)
        setTimeout(onWin, 900)
      }
      return next
    })
  }, [won, cfg])

  const reset = () => {
    setTiles(buildInitialTiles(cfg))
    setWon(false)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="text-center">
        <p className="text-amber-400 font-bold text-sm">{cfg.title}</p>
        <p className="text-slate-400 text-xs">{cfg.subtitle}</p>
        <p className="text-slate-500 text-xs mt-1">Tap a pipe to rotate it — connect source to reservoir</p>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />
          <span className="text-slate-400">Source</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-violet-400 inline-block" />
          <span className="text-slate-400">Reservoir</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
          <span className="text-slate-400">Flowing</span>
        </span>
      </div>

      {/* Grid */}
      <div
        className="mx-auto rounded-xl overflow-hidden border border-white/[0.06] bg-[#0d0d1e]"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cfg.cols}, 1fr)`,
          gap: '2px',
          padding: '8px',
          maxWidth: 300,
          width: '100%',
        }}
      >
        {tiles.map((tile, idx) => {
          const isLit = lit.has(idx)
          const isSource = idx === cfg.sourceIdx
          const isSink = idx === cfg.sinkIdx
          return (
            <button
              key={idx}
              onClick={() => rotateTile(idx)}
              disabled={tile.fixed}
              className={[
                'aspect-square rounded transition-all duration-150',
                tile.fixed
                  ? 'cursor-default'
                  : 'hover:bg-white/[0.06] active:scale-95 cursor-pointer',
                isLit
                  ? 'bg-amber-500/[0.07]'
                  : 'bg-slate-900/60',
                won && isLit ? 'bg-emerald-500/[0.10]' : '',
              ].join(' ')}
              style={{ padding: 2 }}
            >
              <PipeSVG
                openings={tile.openings}
                shape={tile.shape}
                rotation={tile.rotation}
                lit={isLit}
                isSource={isSource}
                isSink={isSink}
              />
            </button>
          )
        })}
      </div>

      {/* Status */}
      <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
        <div className={`w-2 h-2 rounded-full transition-all ${connected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-slate-700'}`} />
        <span>{connected ? 'Water flows!' : `${lit.size} / ${cfg.cols * cfg.rows} cells reached`}</span>
      </div>

      {/* Controls */}
      {!won && (
        <button
          onClick={reset}
          className="w-full py-2 rounded-xl border border-white/10 text-slate-400 text-xs hover:border-white/20 transition-all"
        >
          Shuffle & Reset
        </button>
      )}

      {/* Win */}
      {won && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
          <p className="text-emerald-400 font-bold text-sm text-center">Aqueduct Complete!</p>
          <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">{cfg.fact}</p>
        </div>
      )}
    </div>
  )
}
