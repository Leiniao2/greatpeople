import { useMemo, useState, useEffect } from 'react'
import type { MinigameProps } from '@/games/types'
import { OutcomeBanner, TimerBar, useGameOutcome, useGameTimer } from './_shared'
import { THEMES, TIERS, makePuzzle, status, type Cell, type Hand, type Piece } from './mirror/model'

// Mirror: place mirrors and prisms so the beam lights every star and no
// sensor.  Stone blocks stop the beam, fixed pieces cannot be moved, and a
// prism splits the beam into two, one to each side.
// Each level is generated from its seed; see ./mirror/model.

export const CONFIG_IDS = Object.keys(THEMES)

/** Seconds per tier (0: no clock). */
export const MIRROR_TIME_LIMITS = ([1, 2, 3, 4] as const).map(d => TIERS[d].seconds)

const U = 40
const BEAM = '#fbbf24'
const WON = '#34d399'

function PieceGlyph({ piece, x, y, mine }: { piece: Piece; x: number; y: number; mine: boolean }) {
  const m = U * 0.36
  const stroke = mine ? '#e2e8f0' : '#94a3b8'
  if (piece === '#') {
    return <rect x={x - U / 2 + 3} y={y - U / 2 + 3} width={U - 6} height={U - 6} rx={5} fill="#57534e" stroke="#292524" strokeWidth={2} />
  }
  if (piece === 'P') {
    return (
      <g>
        <polygon points={`${x},${y - m} ${x + m},${y + m * 0.8} ${x - m},${y + m * 0.8}`}
          fill={mine ? 'rgba(125,211,252,0.35)' : 'rgba(148,163,184,0.3)'} stroke={mine ? '#7dd3fc' : stroke} strokeWidth={2} strokeLinejoin="round" />
        {!mine && <circle cx={x} cy={y + m * 0.3} r={2} fill={stroke} />}
      </g>
    )
  }
  const [x1, y1, x2, y2] = piece === '/' ? [x - m, y + m, x + m, y - m] : [x - m, y - m, x + m, y + m]
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={mine ? 5 : 4} strokeLinecap="round" />
      {!mine && <circle cx={x} cy={y} r={2.5} fill="#0f172a" stroke={stroke} strokeWidth={1} />}
    </g>
  )
}

export default function MirrorGame({ configId, difficulty, seed, onWin, onLose }: MinigameProps) {
  const puzzle = useMemo(() => makePuzzle(configId, difficulty, seed), [configId, difficulty, seed])
  const theme = THEMES[puzzle.theme]
  const n = puzzle.size
  const [placed, setPlaced] = useState<Record<Cell, Piece>>({})
  const [tool, setTool] = useState<Hand>('mirror')
  const { outcome, reason, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 1200 })
  const timer = useGameTimer({ seconds: puzzle.seconds, running: !outcome, onExpire: () => lose('out of time') })

  const s = status(puzzle, placed)
  const won = outcome === 'won'
  useEffect(() => { if (s.solved && !outcome) win() }, [s.solved, outcome, win])

  const used: Record<Hand, number> = { mirror: 0, prism: 0 }
  for (const k in placed) used[placed[k] === 'P' ? 'prism' : 'mirror']++
  const left = (h: Hand) => puzzle.hand[h] - used[h]
  const targets = new Set(puzzle.targets), sensors = new Set(puzzle.sensors)

  const tap = (cell: Cell) => {
    if (outcome || puzzle.fixed[cell] || targets.has(cell) || sensors.has(cell)) return
    setPlaced(prev => {
      const next = { ...prev }
      const cur = prev[cell]
      if (cur === '/') next[cell] = '\\'
      else if (cur) delete next[cell]
      else if (left(tool) > 0) next[cell] = tool === 'prism' ? 'P' : '/'
      else if (left(tool === 'mirror' ? 'prism' : 'mirror') > 0) next[cell] = tool === 'mirror' ? 'P' : '/'
      return next
    })
  }

  const cx = (c: number) => (c + 1.5) * U
  const cy = (r: number) => (r + 1.5) * U
  const vb = (n + 2) * U
  const src = puzzle.source
  const arrow = ['▲', '▶', '▼', '◀'][src.dir] // the way the beam travels

  return (
    <div className="flex flex-col items-center gap-2">
      {timer.active && <div className="w-full"><TimerBar remaining={timer.remaining} total={timer.total} /></div>}
      <div className="text-center px-2">
        <p className="text-accent font-bold text-sm">{theme.title}</p>
        <p className="text-muted text-xs leading-snug">{theme.blurb}</p>
      </div>

      <div className="rounded-xl border border-line overflow-hidden w-full" style={{ background: '#0b1220', maxWidth: 420 }}>
        <svg viewBox={`0 0 ${vb} ${vb}`} className="w-full h-auto block select-none" role="grid" aria-label="Mirror board">
          {Array.from({ length: n * n }, (_, k) => {
            const r = Math.floor(k / n), c = k % n
            return (
              <rect key={k} x={(c + 1) * U} y={(r + 1) * U} width={U} height={U}
                fill={(r + c) % 2 ? '#111a2e' : '#0f172a'} stroke="#1e293b" strokeWidth={1}
                onClick={() => tap(k)} aria-label={`Cell ${r + 1},${c + 1}`}
                style={{ cursor: 'pointer' }} />
            )
          })}

          {s.trace.segs.map(([r1, c1, r2, c2], i) => (
            <line key={i} x1={cx(c1)} y1={cy(r1)} x2={cx(c2)} y2={cy(r2)}
              stroke={won ? WON : BEAM} strokeWidth={4} strokeLinecap="round" opacity={0.85}
              style={{ filter: `drop-shadow(0 0 3px ${won ? WON : BEAM})`, pointerEvents: 'none' }} />
          ))}

          {puzzle.targets.map(k => {
            const on = !!s.trace.lit[k]
            return (
              <text key={`t${k}`} x={cx(k % n)} y={cy(Math.floor(k / n)) + 8} textAnchor="middle" fontSize={24}
                fill={on ? (won ? WON : '#fde047') : '#475569'} style={{ pointerEvents: 'none' }}>★</text>
            )
          })}
          {puzzle.sensors.map(k => {
            const on = !!s.trace.lit[k]
            const x = cx(k % n), y = cy(Math.floor(k / n))
            return (
              <g key={`s${k}`} style={{ pointerEvents: 'none' }}>
                <circle cx={x} cy={y} r={U * 0.3} fill={on ? 'rgba(239,68,68,0.45)' : 'rgba(30,41,59,0.9)'} stroke={on ? '#ef4444' : '#64748b'} strokeWidth={2} />
                <circle cx={x} cy={y} r={U * 0.11} fill={on ? '#fecaca' : '#64748b'} />
              </g>
            )
          })}

          {Object.entries(puzzle.fixed).map(([k, piece]) => (
            <g key={`f${k}`} style={{ pointerEvents: 'none' }}>
              <PieceGlyph piece={piece} x={cx(+k % n)} y={cy(Math.floor(+k / n))} mine={false} />
            </g>
          ))}
          {Object.entries(placed).map(([k, piece]) => (
            <g key={`p${k}`} style={{ pointerEvents: 'none' }}>
              <PieceGlyph piece={piece} x={cx(+k % n)} y={cy(Math.floor(+k / n))} mine />
            </g>
          ))}

          <g style={{ pointerEvents: 'none' }}>
            <circle cx={cx(src.col)} cy={cy(src.row)} r={U * 0.36} fill="rgba(251,191,36,0.25)" stroke={BEAM} strokeWidth={2} />
            <text x={cx(src.col)} y={cy(src.row) + 6} textAnchor="middle" fontSize={16} fill={BEAM}>{arrow}</text>
          </g>
        </svg>
      </div>

      <div className="flex gap-2 justify-center">
        {(['mirror', 'prism'] as Hand[]).filter(h => puzzle.hand[h] > 0).map(h => (
          <button key={h} onClick={() => setTool(h)} disabled={!!outcome}
            aria-label={`${h === 'mirror' ? 'Mirror' : 'Prism'}: ${left(h)} left`}
            className={`px-3 py-1.5 rounded-lg border-2 text-xs font-bold transition-all
              ${tool === h ? 'border-accent bg-accent/20 text-accent' : 'border-line text-muted'}`}>
            {h === 'mirror' ? '╱ Mirror' : '△ Prism'} × {left(h)}
          </button>
        ))}
        <button onClick={() => setPlaced({})} disabled={!!outcome || !Object.keys(placed).length}
          className="px-3 py-1.5 rounded-lg border border-line text-xs text-muted disabled:opacity-40">Clear</button>
      </div>

      <div className="flex justify-center gap-4 text-[11px] text-muted">
        <span>Stars lit: <b className="text-accent">{s.lit}/{puzzle.targets.length}</b></span>
        {puzzle.sensors.length > 0 && (
          <span>Sensors dark: <b className={s.burnt ? 'text-red-500' : 'text-accent'}>{puzzle.sensors.length - s.burnt}/{puzzle.sensors.length}</b></span>
        )}
      </div>
      <p className="text-center text-[11px] text-muted px-3 leading-snug">
        Tap a cell to place the chosen piece; tap a mirror to turn it, again to lift it.
        {puzzle.hand.prism > 0 || Object.values(puzzle.fixed).includes('P') ? ' A prism splits the beam to both sides.' : ''}
        {' '}Stone stops light; pieces with a dot are fixed.
      </p>

      <OutcomeBanner outcome={outcome} detail="Every star is lit and every sensor dark."
        winTitle="The light lands where it should." loseTitle={reason ? `Not this time: ${reason}.` : 'Not this time'} />
    </div>
  )
}
