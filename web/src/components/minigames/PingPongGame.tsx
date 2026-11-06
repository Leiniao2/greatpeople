import { useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps } from '@/games/types'
import { OutcomeBanner, storyText, useGameOutcome } from './_shared'
import { THEMES, THEME_IDS, W, L, ME_Y, CPU_Y, BALL_R, makeMatch, initialState, step, type Input, type State } from './pingpong/model'

// Ping-Pong: return the ball past the computer.  Drag (or use the arrow
// keys) to move your bat along the bottom of the table.  Where the ball meets
// your bat sets where your return lands: the middle of the bat sends it to
// the middle, the rim to a corner.  Moving the bat as you hit puts spin on
// the ball, which bends its flight.  The ball speeds up every hit; a return
// that leaves the side of the table is out.  See ./pingpong/model.

export const CONFIG_IDS = THEME_IDS

const PAD = 8
const VB_W = W + PAD * 2
const VB_H = L + 12

/** Pointer x on the svg, in table units. */
function tableX(svg: SVGSVGElement, clientX: number): number | null {
  const r = svg.getBoundingClientRect()
  if (!r.width) return null
  return ((clientX - r.left) / r.width) * VB_W - PAD
}

export default function PingPongGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const match = useMemo(() => makeMatch(configId, difficulty, seed), [configId, difficulty, seed])
  const theme = THEMES[match.theme]
  const story = storyText(params)
  const { outcome, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 1400 })

  const state = useRef<State>(initialState(match))
  const input = useRef<Input>({ target: null, dir: 0 })
  const [view, setView] = useState<State>(state.current)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => { state.current = initialState(match); setView(state.current) }, [match])

  // The rally clock.  Steps are fixed-size inside the model, so the frame
  // rate changes smoothness, never the result.
  useEffect(() => {
    if (outcome || typeof requestAnimationFrame !== 'function') return
    let id = 0, last: number | null = null
    const loop = (now: number) => {
      const dt = last == null ? 0 : (now - last) / 1000
      last = now
      if (dt > 0) {
        state.current = step(match, state.current, dt, input.current)
        setView(state.current)
      }
      if (state.current.phase !== 'over') id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [match, outcome])

  useEffect(() => {
    if (view.winner === 'me') win()
    else if (view.winner === 'cpu') lose(`${view.score[1]}–${view.score[0]} to the computer`)
  }, [view.winner, view.score, win, lose])

  useEffect(() => {
    const keys = new Set<string>()
    const sync = () => {
      const dir = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0)
      input.current = { target: null, dir: dir as -1 | 0 | 1 }
    }
    const side = (k: string) => (k === 'ArrowLeft' || k === 'a' || k === 'A' ? 'left' : k === 'ArrowRight' || k === 'd' || k === 'D' ? 'right' : null)
    const down = (e: KeyboardEvent) => { const s = side(e.key); if (s) { keys.add(s); sync(); e.preventDefault() } }
    const up = (e: KeyboardEvent) => { const s = side(e.key); if (s) { keys.delete(s); sync() } }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const point = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    const x = tableX(svgRef.current, e.clientX)
    if (x != null) input.current = { target: x, dir: 0 }
  }

  const s = view
  const b = s.ball
  const [me, cpu] = s.score
  const deuce = match.winBy > 1 && me >= match.target - 1 && cpu >= match.target - 1
  const won = outcome === 'won'
  // The ball's shadow trails it while spin bends the flight.
  const spinning = s.phase === 'play' && Math.abs(b.a) > 4
  const callout = s.phase === 'serve' && s.lastPoint
    ? `${s.lastPoint.to === 'me' ? 'Your point' : 'Computer\'s point'}: ${s.lastPoint.why === 'out' ? 'out over the side' : 'missed'}`
    : null

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-center px-2">
        <p className="text-accent font-bold text-sm">{story.title ?? theme.title}</p>
        <p className="text-muted text-xs leading-snug">{story.intro ?? theme.blurb}</p>
      </div>

      <div className="flex items-center justify-center gap-4 text-sm" aria-live="polite">
        <span className="flex items-center gap-1.5">
          {s.server === 'me' && <span className="w-2 h-2 rounded-full bg-accent" aria-label="your serve" />}
          <span className="text-muted text-xs">You</span>
          <b className="text-accent tabular-nums text-lg" data-testid="score-me">{me}</b>
        </span>
        <span className="text-muted">–</span>
        <span className="flex items-center gap-1.5">
          <b className="tabular-nums text-lg" data-testid="score-cpu">{cpu}</b>
          <span className="text-muted text-xs">Computer</span>
          {s.server === 'cpu' && <span className="w-2 h-2 rounded-full bg-accent" aria-label="computer's serve" />}
        </span>
      </div>
      <p className="text-[11px] text-muted -mt-1">
        First to {match.target}{match.winBy > 1 ? ', win by 2' : ''}{deuce ? ' · deuce: serve changes every point' : ''}
      </p>

      <div className="rounded-xl border border-line overflow-hidden w-full" style={{ background: '#1c1917', maxWidth: 360 }}>
        <svg ref={svgRef} viewBox={`${-PAD} -6 ${VB_W} ${VB_H}`} className="w-full h-auto block select-none"
          style={{ touchAction: 'none', cursor: 'none' }}
          role="application" aria-label="Ping-pong table"
          data-phase={s.phase} data-ball={`${b.x},${b.y},${b.vx},${b.vy},${b.a}`} data-me={s.me} data-cpu={s.cpu}
          onPointerDown={point} onPointerMove={point}>
          {/* Table, lines and net */}
          <rect x={0} y={0} width={W} height={L} fill="#14532d" stroke="#f8fafc" strokeWidth={1.2} />
          <line x1={W / 2} y1={0} x2={W / 2} y2={L} stroke="#f8fafc" strokeWidth={0.5} opacity={0.6} />
          <rect x={-4} y={L / 2 - 1} width={W + 8} height={2} fill="#e2e8f0" opacity={0.85} />
          <line x1={-4} y1={L / 2} x2={W + 4} y2={L / 2} stroke="#0f172a" strokeWidth={0.4} strokeDasharray="1 1" />

          {/* Computer's bat */}
          <g transform={`translate(${s.cpu} ${CPU_Y})`}>
            <rect x={-match.cpuBat} y={-2} width={match.cpuBat * 2} height={3} rx={1.5} fill="#b91c1c" stroke="#450a0a" strokeWidth={0.5} />
            <rect x={-1} y={-6} width={2} height={4} fill="#78350f" />
          </g>
          {/* Your bat */}
          <g transform={`translate(${s.me} ${ME_Y})`}>
            <rect x={-match.bat} y={-1} width={match.bat * 2} height={3} rx={1.5} fill="#111827" stroke="#f8fafc" strokeWidth={0.5} />
            <rect x={-1} y={2} width={2} height={4} fill="#78350f" />
          </g>

          {/* Ball and its shadow */}
          {s.phase !== 'over' && (
            <g style={{ pointerEvents: 'none' }}>
              <ellipse cx={b.x + 1.2} cy={b.y + 1.6} rx={BALL_R} ry={BALL_R * 0.7} fill="#000" opacity={0.3} />
              <circle cx={b.x} cy={b.y} r={BALL_R} fill={match.theme === 'parlour-1890s' ? '#d6b98c' : '#fb923c'}
                stroke={spinning ? '#fde68a' : '#fff7ed'} strokeWidth={spinning ? 0.8 : 0.4} />
            </g>
          )}

          {callout && (
            <text x={W / 2} y={L / 2 + (s.server === 'me' ? 18 : -12)} textAnchor="middle" fontSize={6} fill="#f8fafc" opacity={0.9}>{callout}</text>
          )}
          {s.phase === 'over' && (
            <text x={W / 2} y={L / 2 + 16} textAnchor="middle" fontSize={8} fontWeight="bold" fill={won ? '#34d399' : '#fca5a5'}>
              {s.winner === 'me' ? 'Match to you' : 'Match to the computer'}
            </text>
          )}
        </svg>
      </div>

      <p className="text-center text-[11px] text-muted px-3 leading-snug">
        Drag along the table (or use the arrow keys) to move your bat. The middle of the bat sends the ball to the middle;
        hit it on the rim to send it to a corner, away from the computer. Moving as you hit adds spin that bends the ball.
        Every hit is faster, and a ball off the side is out.
      </p>

      <OutcomeBanner outcome={outcome} detail={story.fact ?? theme.fact}
        winTitle={`You win the match ${me}–${cpu}.`} loseTitle={`The computer takes it ${cpu}–${me}.`} />
    </div>
  )
}
