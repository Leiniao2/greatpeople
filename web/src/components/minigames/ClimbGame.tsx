import { useMemo, useState } from 'react'
import type { MinigameProps } from '@/games/types'
import { OutcomeBanner, TimerBar, useGameOutcome, useGameTimer } from './_shared'
import {
  MOUNTAINS, REACH, WIDTH, altitude, canPiton, fall, makePuzzle, move, moveCost, piton, reachable, initialState,
  type Hold, type State,
} from './climb/model'

// Summit Climb: pick your way up a tall rock face, hold by hold.  The view
// follows the climber; moves cost stamina, ledges restore it, loose holds
// crumble behind you and a fall drops you to your last anchor.
// Each face is generated from its seed; see ./climb/model.

export const CONFIG_IDS = Object.keys(MOUNTAINS)

const U = 36
const VIEW_H = 12

function HoldGlyph({ h, px, py, color }: { h: Hold; px: number; py: number; color: { rock: string; dark: string } }) {
  switch (h.kind) {
    case 'ledge':
      return <g>
        <rect x={px - 22} y={py - 4} width={44} height={9} rx={3} fill="#a8a29e" stroke={color.dark} strokeWidth={1.5} />
        <line x1={px - 18} y1={py - 2} x2={px + 18} y2={py - 2} stroke="#e7e5e4" strokeWidth={1.5} opacity={0.7} />
      </g>
    case 'summit':
      return <g>
        <line x1={px} y1={py + 6} x2={px} y2={py - 22} stroke="#e5e7eb" strokeWidth={2} />
        <polygon points={`${px},${py - 22} ${px + 16},${py - 17} ${px},${py - 12}`} fill="#ef4444" />
        <ellipse cx={px} cy={py + 6} rx={14} ry={4} fill="#f8fafc" />
      </g>
    case 'start':
      return <ellipse cx={px} cy={py} rx={16} ry={6} fill="#57534e" stroke={color.dark} strokeWidth={1.5} />
    case 'ice':
      return <g>
        <ellipse cx={px} cy={py} rx={9} ry={6} fill="#bae6fd" stroke="#38bdf8" strokeWidth={1.5} />
        <line x1={px - 4} y1={py - 2} x2={px + 3} y2={py - 3} stroke="#f0f9ff" strokeWidth={1.5} />
      </g>
    case 'loose':
      return <g>
        <ellipse cx={px} cy={py} rx={9} ry={6} fill="#c2a383" stroke="#7c5c3b" strokeWidth={1.5} strokeDasharray="3 2" />
        <polyline points={`${px - 5},${py - 3} ${px - 1},${py + 1} ${px + 2},${py - 2} ${px + 5},${py + 3}`} fill="none" stroke="#5c3d1e" strokeWidth={1.2} />
      </g>
    default:
      return <g>
        <ellipse cx={px} cy={py} rx={9} ry={6} fill="#b45309" stroke="#78350f" strokeWidth={1.5} />
        <ellipse cx={px - 2} cy={py - 2} rx={4} ry={2} fill="#d97706" opacity={0.7} />
      </g>
  }
}

function Climber({ px, py }: { px: number; py: number }) {
  return (
    <g style={{ transform: `translate(${px}px, ${py}px)`, transition: 'transform 450ms ease-out', pointerEvents: 'none' }}>
      <line x1={0} y1={-6} x2={-9} y2={-16} stroke="#1e293b" strokeWidth={3} strokeLinecap="round" />
      <line x1={0} y1={-6} x2={9} y2={-16} stroke="#1e293b" strokeWidth={3} strokeLinecap="round" />
      <line x1={0} y1={-8} x2={0} y2={8} stroke="#dc2626" strokeWidth={6} strokeLinecap="round" />
      <rect x={-5} y={-6} width={10} height={9} rx={2} fill="#1d4ed8" />
      <line x1={0} y1={8} x2={-7} y2={18} stroke="#1e293b" strokeWidth={3} strokeLinecap="round" />
      <line x1={0} y1={8} x2={7} y2={18} stroke="#1e293b" strokeWidth={3} strokeLinecap="round" />
      <circle cx={0} cy={-14} r={5} fill="#fcd34d" stroke="#92400e" strokeWidth={1} />
      <path d="M -5 -15 A 5 5 0 0 1 5 -15 Z" fill="#f97316" />
    </g>
  )
}

export default function ClimbGame({ configId, difficulty, seed, onWin, onLose }: MinigameProps) {
  const puzzle = useMemo(() => makePuzzle(configId, difficulty, seed), [configId, difficulty, seed])
  const m = MOUNTAINS[puzzle.mountain]
  const [state, setState] = useState<State>(() => initialState(puzzle))
  const [note, setNote] = useState('')
  const { outcome, reason, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 1200 })
  const timer = useGameTimer({ seconds: puzzle.seconds, running: !outcome, onExpire: () => lose('the weather closed in') })

  const settle = (r: { state: State; event: string | null }) => {
    if (!r.event) return
    setState(r.state)
    if (r.event === 'summit') win()
    else if (r.event === 'lost') lose('the rope could not hold another fall')
    else if (r.event === 'fell') setNote('You came off the rock and swung back to your anchor.')
    else setNote('')
  }
  const grab = (id: number) => { if (!outcome) settle(move(puzzle, state, id)) }
  const letGo = () => { if (!outcome) settle(fall(puzzle, state)) }
  const hammer = () => { if (canPiton(puzzle, state)) { setState(piton(puzzle, state)); setNote('Piton in: a fall now stops here.') } }

  const top = puzzle.holds[puzzle.summit].y + 2.5
  const px = (x: number) => x * U
  const py = (y: number) => (top - y) * U
  const here = puzzle.holds[state.at]
  const anchor = puzzle.holds[state.anchor]
  const reach = new Set(reachable(puzzle, state))
  const crumbled = new Set(state.crumbled)
  const camY = VIEW_H * U * 0.58 - py(here.y)
  const vbW = WIDTH * U, vbH = VIEW_H * U
  const faceBottom = py(-3)
  const alt = altitude(puzzle, here.y)
  const progress = Math.max(0, Math.min(1, here.y / puzzle.holds[puzzle.summit].y))
  const color = { rock: m.rock, dark: m.rockDark }
  const gid = `climb-${puzzle.mountain}-${seed}`

  return (
    <div className="flex flex-col items-center gap-2">
      {timer.active && <div className="w-full"><TimerBar remaining={timer.remaining} total={timer.total} /></div>}
      <div className="text-center px-2">
        <p className="text-accent font-bold text-sm">{m.title}</p>
        <p className="text-muted text-xs leading-snug">{m.blurb}</p>
      </div>

      <div className="flex gap-2 w-full" style={{ maxWidth: 440 }}>
        <div className="rounded-xl border border-line overflow-hidden flex-1">
          <svg viewBox={`0 0 ${vbW} ${vbH}`} className="w-full h-auto block select-none" role="group" aria-label="Rock face">
            <defs>
              <linearGradient id={`${gid}-sky`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={m.sky[0]} /><stop offset="1" stopColor={m.sky[1]} />
              </linearGradient>
              <linearGradient id={`${gid}-snow`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#f8fafc" stopOpacity={0.95} /><stop offset="1" stopColor="#f8fafc" stopOpacity={0} />
              </linearGradient>
            </defs>
            <rect x={0} y={0} width={vbW} height={vbH} fill={`url(#${gid}-sky)`} />
            <g style={{ transform: `translate(0px, ${camY}px)`, transition: 'transform 600ms ease-out' }}>
              <polygon fill={m.rock} stroke={m.rockDark} strokeWidth={2}
                points={`0,${faceBottom} 0,${py(top - 2.2)} ${vbW * 0.3},${py(top - 1.2)} ${vbW * 0.5},${py(top - 0.6)} ${vbW * 0.72},${py(top - 1.4)} ${vbW},${py(top - 2.4)} ${vbW},${faceBottom}`} />
              <rect x={0} y={py(top - 1)} width={vbW} height={U * Math.min(18, top * 0.2)} fill={`url(#${gid}-snow)`} />
              {puzzle.cracks.map(([x1, y1, x2, y2], i) => (
                <line key={i} x1={px(x1)} y1={py(y1)} x2={px(x2)} y2={py(y2)} stroke={m.rockDark} strokeWidth={1.2} opacity={0.5} />
              ))}
              {puzzle.bands.map((b, i) => (
                <g key={`b${i}`}>
                  <rect x={0} y={py(b.y1)} width={vbW} height={(b.y1 - b.y0) * U} fill={m.rockDark} opacity={0.45} />
                  <text x={6} y={py(b.y1) + 13} fontSize={10} fill="#f5f5f4" opacity={0.85}>Overhang: moves cost more</text>
                </g>
              ))}
              <rect x={0} y={py(0) + 14} width={vbW} height={faceBottom - py(0)} fill="#57534e" />

              <circle cx={px(here.x)} cy={py(here.y)} r={REACH * U} fill="rgba(255,255,255,0.06)"
                stroke="#fef3c7" strokeWidth={1.5} strokeDasharray="5 5" style={{ pointerEvents: 'none' }} />
              <line x1={px(anchor.x)} y1={py(anchor.y)} x2={px(here.x)} y2={py(here.y)} stroke="#facc15" strokeWidth={2} opacity={0.9} style={{ pointerEvents: 'none' }} />

              {puzzle.holds.map(h => {
                if (crumbled.has(h.id)) return null
                const x = px(h.x), y = py(h.y)
                const r = reach.has(h.id)
                const cost = r ? moveCost(puzzle, here, h) : 0
                const ok = r && cost <= state.stamina
                return (
                  <g key={h.id} role="button" aria-label={`Hold ${h.id}`} onClick={() => grab(h.id)}
                    style={{ cursor: r ? 'pointer' : 'default' }}>
                    <circle cx={x} cy={y} r={15} fill="transparent" />
                    <HoldGlyph h={h} px={x} py={y} color={color} />
                    {r && <circle cx={x} cy={y} r={13} fill="none" stroke={ok ? '#4ade80' : '#f87171'} strokeWidth={2}
                      strokeDasharray={ok ? undefined : '3 3'} />}
                    {r && <text x={x + 12} y={y - 9} fontSize={10} fontWeight={700} fill={ok ? '#dcfce7' : '#fecaca'}
                      stroke="#1c1917" strokeWidth={2.5} paintOrder="stroke">{cost}</text>}
                  </g>
                )
              })}
              {state.placed.map(id => {
                const h = puzzle.holds[id]
                return <polygon key={`p${id}`} points={`${px(h.x) + 8},${py(h.y) - 4} ${px(h.x) + 16},${py(h.y)} ${px(h.x) + 8},${py(h.y) + 4}`}
                  fill="#d4d4d8" stroke="#3f3f46" strokeWidth={1} style={{ pointerEvents: 'none' }} />
              })}
              <Climber px={px(here.x)} py={py(here.y)} />
            </g>
          </svg>
        </div>

        <div className="w-12 flex flex-col items-center text-[10px] text-muted" aria-label="Altitude">
          <span className="font-bold text-accent tabular-nums">{m.toM.toLocaleString('en-US')} m</span>
          <div className="relative flex-1 w-3 my-1 rounded-full bg-panel border border-line overflow-hidden">
            <div className="absolute bottom-0 left-0 right-0 bg-accent transition-all duration-500" style={{ height: `${progress * 100}%` }} />
          </div>
          <span className="tabular-nums">{m.fromM.toLocaleString('en-US')} m</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 text-[11px] text-muted flex-wrap">
        <span>Altitude: <b className="text-accent tabular-nums">{alt.toLocaleString('en-US')} m</b></span>
        <span className="flex items-center gap-1">Stamina:
          <span className="flex gap-0.5" aria-label={`Stamina ${state.stamina} of ${puzzle.stamina}`}>
            {Array.from({ length: puzzle.stamina }, (_, i) => (
              <span key={i} className={`w-1.5 h-3 rounded-sm ${i < state.stamina ? (state.stamina <= 3 ? 'bg-red-500' : 'bg-emerald-500') : 'bg-panel border border-line'}`} />
            ))}
          </span>
        </span>
        <span>Falls left: <b className={state.falls ? 'text-accent' : 'text-red-500'}>{state.falls}</b></span>
      </div>

      <div className="flex gap-2 justify-center">
        <button onClick={hammer} disabled={!canPiton(puzzle, state)}
          className="px-3 py-1.5 rounded-lg border-2 border-line text-xs font-bold text-muted disabled:opacity-40">
          Piton × {state.pitons}
        </button>
        <button onClick={letGo} disabled={!!outcome}
          className="px-3 py-1.5 rounded-lg border border-line text-xs text-muted disabled:opacity-40">Let go</button>
      </div>
      {note && <p className="text-center text-[11px] text-accent px-3">{note}</p>}
      <p className="text-center text-[11px] text-muted px-3 leading-snug">
        Tap a hold inside the dashed circle; the number is the stamina it costs. A red ring is too far for your strength:
        reaching for it means a fall. Ledges restore stamina and become your anchor; a piton makes any firm hold an anchor.
        Cracked holds crumble once you leave them.{difficulty >= 3 ? ' Ice costs two more.' : ''}
      </p>

      <OutcomeBanner outcome={outcome} detail={m.fact}
        winTitle="On the summit." loseTitle={reason ? `Not this time: ${reason}.` : 'Not this time'} />
    </div>
  )
}
