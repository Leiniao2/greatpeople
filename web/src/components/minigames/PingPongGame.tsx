import { useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps } from '@/games/types'
import { OutcomeBanner, storyText, useGameOutcome } from './_shared'
import {
  THEMES, THEME_IDS, W, L, NET, BALL_R, ZONE, POWER_FULL, SMASH, makeMatch, initialState, step, height, fault,
  type Input, type Pt, type Shot, type State,
} from './pingpong/model'

// Ping-Pong: return the ball past the computer.  Move your bat anywhere in
// your half — over the table or off it — and hit the ball after it bounces.
// Where it meets the bat sets the line, how fast you swing forward sets the
// power (a block lands short, a smash deep, too much flies long), and the
// direction of the swing sets the spin: forward for topspin, back for
// backspin, sideways for a curve.  Bounces are marked on the table, and the
// ball's ring shows its spin.  See ./pingpong/model.

export const CONFIG_IDS = THEME_IDS

const X0 = -36, Y0 = -38
const VB_W = W - 2 * X0
const VB_H = L - 2 * Y0
/** A finger hides what is under it, so on touch the bat sits a little above it. */
const TOUCH_LIFT = 14

/** Pointer position on the svg, in table units. */
function tablePoint(svg: SVGSVGElement, clientX: number, clientY: number): Pt | null {
  const r = svg.getBoundingClientRect()
  if (!r.width || !r.height) return null
  return { x: ((clientX - r.left) / r.width) * VB_W + X0, y: ((clientY - r.top) / r.height) * VB_H + Y0 }
}

const KIND: Record<Shot['kind'], string> = { serve: 'Serve', block: 'Block', drive: 'Drive', smash: 'Smash', chop: 'Chop' }

/** "Drive · 64% · topspin · curves →" */
export function describeShot(s: Shot): string {
  const parts = [KIND[s.kind]]
  if (s.kind === 'drive' || s.kind === 'smash') parts.push(`${Math.round(s.power * 100)}%`)
  if (s.top > 0.2) parts.push(s.top > 0.6 ? 'heavy topspin' : 'topspin')
  else if (s.top < -0.2) parts.push(s.top < -0.6 ? 'heavy backspin' : 'backspin')
  if (Math.abs(s.side) > 0.2) parts.push(`curves ${s.side > 0 ? '→' : '←'}`)
  return parts.join(' · ')
}

const WHY: Record<string, string> = { miss: 'not returned', long: 'long, off the end', wide: 'wide, off the side', net: 'into the net' }
const TOP_RING = '#ef4444', BACK_RING = '#60a5fa'

export default function PingPongGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const match = useMemo(() => makeMatch(configId, difficulty, seed), [configId, difficulty, seed])
  const theme = THEMES[match.theme]
  const story = storyText(params)
  const { outcome, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 1400 })

  const state = useRef<State>(initialState(match))
  const input = useRef<Input>({ target: null })
  const [view, setView] = useState<State>(state.current)
  const svgRef = useRef<SVGSVGElement>(null)
  /** The ball's recent positions, for the trail that shows its curve. */
  const trail = useRef<{ key: string; pts: [number, number][] }>({ key: '', pts: [] })

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
      input.current = { target: null, dir: {
        x: (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0),
        y: (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0),
      } }
    }
    const side = (k: string) =>
      k === 'ArrowLeft' || k === 'a' || k === 'A' ? 'left' : k === 'ArrowRight' || k === 'd' || k === 'D' ? 'right'
        : k === 'ArrowUp' || k === 'w' || k === 'W' ? 'up' : k === 'ArrowDown' || k === 's' || k === 'S' ? 'down' : null
    const down = (e: KeyboardEvent) => { const s = side(e.key); if (s) { keys.add(s); sync(); e.preventDefault() } }
    const up = (e: KeyboardEvent) => { const s = side(e.key); if (s) { keys.delete(s); sync() } }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const aimAt = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    const p = tablePoint(svgRef.current, e.clientX, e.clientY)
    if (p) input.current = { target: { x: p.x, y: p.y - (e.pointerType === 'touch' ? TOUCH_LIFT : 0) } }
  }

  const s = view
  const b = s.ball
  const [me, cpu] = s.score
  const deuce = match.winBy > 1 && me >= match.target - 1 && cpu >= match.target - 1
  const won = outcome === 'won'
  const flying = s.phase === 'play'
  const z = flying ? height(b) : 3

  // The trail restarts with every shot.
  const key = `${s.stats.rallies}|${s.stats.rally}`
  if (trail.current.key !== key) trail.current = { key, pts: [] }
  if (flying) {
    const pts = trail.current.pts
    const lastPt = pts[pts.length - 1]
    if (!lastPt || Math.hypot(lastPt[0] - b.x, lastPt[1] - (b.y - z)) > 1.5) pts.push([b.x, b.y - z])
    if (pts.length > 24) pts.shift()
  }

  const callout = s.phase === 'serve' && s.lastPoint
    ? `${s.lastPoint.to === 'me' ? 'Your point' : 'Computer\'s point'}: ${WHY[s.lastPoint.why]}`
    : null
  const landOut = flying && !b.bounced && fault(s.lastHit, b.land) !== null
  const bounceAge = s.bounce ? s.clock - s.bounce.at : Infinity
  const ring = b.top > 0.2 ? TOP_RING : b.top < -0.2 ? BACK_RING : null
  const spinTurn = (s.clock * (b.top * 900 + b.side * 600)) % 360

  // The swing meter: forward bat speed as power, or a chop when pulling back.
  const fwd = -s.meV.y / POWER_FULL
  const swing = fwd < -0.25 * 110 / POWER_FULL ? 'Chop' : fwd < 0.15 ? 'Block' : fwd < SMASH ? 'Drive' : fwd < 1.2 ? 'Smash' : 'Too hard'
  const METER_MAX = 1.6
  const meterX = (p: number) => `${(Math.max(-0.6, Math.min(METER_MAX, p)) + 0.6) / (METER_MAX + 0.6) * 100}%`

  const compact = JSON.stringify({ phase: s.phase, clock: s.clock, ball: b, me: s.me, cpu: s.cpu, lastHit: s.lastHit,
    score: s.score, stats: s.stats })

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

      <div className="rounded-xl border border-line overflow-hidden w-full" style={{ background: '#1c1917', maxWidth: 400 }}>
        <svg ref={svgRef} viewBox={`${X0} ${Y0} ${VB_W} ${VB_H}`} className="w-full h-auto block select-none"
          style={{ touchAction: 'none', cursor: 'none' }}
          role="application" aria-label="Ping-pong table"
          data-phase={s.phase} data-me={`${s.me.x},${s.me.y}`} data-cpu={`${s.cpu.x},${s.cpu.y}`} data-state={compact}
          onPointerDown={aimAt} onPointerMove={aimAt}>
          {/* Your half of the floor: the bat can go anywhere in it. */}
          <rect x={ZONE.me.x0} y={ZONE.me.y0} width={ZONE.me.x1 - ZONE.me.x0} height={ZONE.me.y1 - ZONE.me.y0}
            fill="#f8fafc" opacity={0.04} stroke="#f8fafc" strokeOpacity={0.15} strokeWidth={0.5} strokeDasharray="2 2" rx={3} />

          {/* Table, lines and net */}
          <rect x={0} y={0} width={W} height={L} fill="#14532d" stroke="#f8fafc" strokeWidth={1.2} />
          <line x1={W / 2} y1={0} x2={W / 2} y2={L} stroke="#f8fafc" strokeWidth={0.5} opacity={0.6} />
          <rect x={-4} y={NET - 1} width={W + 8} height={2} fill="#e2e8f0" opacity={0.85} />
          <line x1={-4} y1={NET} x2={W + 4} y2={NET} stroke="#0f172a" strokeWidth={0.4} strokeDasharray="1 1" />

          {/* Where the ball in flight will come down: red if it is going out. */}
          {flying && !b.bounced && (
            <g data-testid="landing" opacity={0.85}>
              <circle cx={b.land.x} cy={b.land.y} r={3.2} fill="none" stroke={landOut ? '#f87171' : s.lastHit === 'cpu' ? '#fde047' : '#f8fafc'}
                strokeWidth={0.6} strokeDasharray="1.2 0.8" />
              <circle cx={b.land.x} cy={b.land.y} r={0.7} fill={landOut ? '#f87171' : s.lastHit === 'cpu' ? '#fde047' : '#f8fafc'} />
            </g>
          )}
          {/* The last bounce: a ripple, then a mark until the next shot. */}
          {s.bounce && (
            <g data-testid="bounce" style={{ pointerEvents: 'none' }}>
              {bounceAge < 0.7 && (
                <circle cx={s.bounce.x} cy={s.bounce.y} r={2 + bounceAge * 10} fill="none"
                  stroke={s.bounce.ok ? '#fde047' : '#f87171'} strokeWidth={0.9} opacity={1 - bounceAge / 0.7} />
              )}
              <circle cx={s.bounce.x} cy={s.bounce.y} r={1.4} fill={s.bounce.ok ? '#fde047' : '#f87171'} opacity={0.75} />
            </g>
          )}

          {/* Computer's bat */}
          <g transform={`translate(${s.cpu.x} ${s.cpu.y})`}>
            <rect x={-1} y={-match.cpuBat - 5} width={2} height={5} fill="#78350f" />
            <circle r={match.cpuBat} fill="#b91c1c" stroke="#450a0a" strokeWidth={0.6} opacity={0.92} />
          </g>
          {/* Your bat */}
          <g transform={`translate(${s.me.x} ${s.me.y})`}>
            <rect x={-1} y={match.bat} width={2} height={5} fill="#78350f" />
            <circle r={match.bat} fill="#111827" stroke="#f8fafc" strokeWidth={0.6} opacity={0.9} />
          </g>

          {/* Ball: its shadow on the ground, the ball above it, a trail showing the curve and a ring showing the spin. */}
          {s.phase !== 'over' && (
            <g style={{ pointerEvents: 'none' }}>
              {trail.current.pts.length > 1 && (
                <polyline points={trail.current.pts.map(p => p.join(',')).join(' ')} fill="none"
                  stroke={ring ?? '#fde68a'} strokeWidth={0.7} strokeOpacity={0.35} strokeLinecap="round" />
              )}
              <ellipse cx={b.x} cy={b.y} rx={BALL_R} ry={BALL_R * 0.7} fill="#000" opacity={0.35} />
              <g transform={`translate(${b.x} ${b.y - z})`}>
                <circle r={BALL_R * (1 + z / 40)} fill={match.theme === 'parlour-1890s' ? '#d6b98c' : '#fb923c'}
                  stroke={ring ?? '#fff7ed'} strokeWidth={ring ? 0.8 : 0.4} />
                {flying && Math.abs(b.top) + Math.abs(b.side) > 0.2 && (
                  <line x1={-BALL_R} x2={BALL_R} y1={0} y2={0} stroke="#7c2d12" strokeWidth={0.4} transform={`rotate(${spinTurn})`} />
                )}
              </g>
              {flying && Math.abs(b.side) > 0.2 && (
                <text x={b.x + (b.side > 0 ? 4 : -4)} y={b.y - z + 1} fontSize={4} textAnchor="middle" fill="#fde68a">
                  {b.side > 0 ? '↷' : '↶'}
                </text>
              )}
            </g>
          )}

          {callout && (
            <text x={W / 2} y={NET + (s.server === 'me' ? 18 : -12)} textAnchor="middle" fontSize={6} fill="#f8fafc" opacity={0.9}>{callout}</text>
          )}
          {s.phase === 'over' && (
            <text x={W / 2} y={NET + 16} textAnchor="middle" fontSize={8} fontWeight="bold" fill={won ? '#34d399' : '#fca5a5'}>
              {s.winner === 'me' ? 'Match to you' : 'Match to the computer'}
            </text>
          )}
        </svg>
      </div>

      {/* Swing meter: how hard the bat is moving forward right now. */}
      <div className="w-full px-2" style={{ maxWidth: 400 }} data-testid="swing">
        <div className="flex justify-between text-[10px] text-muted mb-0.5">
          <span>Swing</span>
          <b className={swing === 'Too hard' ? 'text-red-500' : 'text-ink-2'} data-testid="swing-kind">{swing}</b>
        </div>
        <div className="relative h-2.5 rounded-full overflow-hidden flex" aria-hidden>
          <div style={{ width: meterX(-0.18), background: BACK_RING, opacity: 0.6 }} />
          <div style={{ width: `calc(${meterX(0.15)} - ${meterX(-0.18)})`, background: '#a8a29e', opacity: 0.6 }} />
          <div style={{ width: `calc(${meterX(SMASH)} - ${meterX(0.15)})`, background: '#22c55e', opacity: 0.6 }} />
          <div style={{ width: `calc(${meterX(1.2)} - ${meterX(SMASH)})`, background: '#f59e0b', opacity: 0.7 }} />
          <div className="flex-1" style={{ background: '#ef4444', opacity: 0.6 }} />
          <div className="absolute top-0 bottom-0 w-1 -ml-0.5 bg-ink rounded" style={{ left: meterX(fwd) }} />
        </div>
        <div className="flex justify-between text-[9px] text-muted mt-0.5">
          <span>chop</span><span>block</span><span>drive</span><span>smash</span><span>long</span>
        </div>
      </div>

      <div className="text-[11px] text-center leading-snug min-h-[2.2em]" data-testid="shots">
        {s.shots.me && <p><span className="text-muted">You: </span><b>{describeShot(s.shots.me)}</b></p>}
        {s.shots.cpu && <p><span className="text-muted">Computer: </span><b>{describeShot(s.shots.cpu)}</b></p>}
      </div>

      <p className="text-center text-[11px] text-muted px-3 leading-snug">
        Move your bat anywhere in your half — over the table or off it — and meet the ball after it bounces.
        The middle of the bat sends it down the middle, the rim to a corner. Swing forward through the ball for power and
        topspin (too hard and it flies long), hold still to block, pull back to chop with backspin, swing sideways to curve it.
        The ring shows spin: <span style={{ color: TOP_RING }}>red</span> topspin kicks on, <span style={{ color: BACK_RING }}>blue</span> backspin
        dies short and pulls your return into the net unless you swing harder.
      </p>

      <OutcomeBanner outcome={outcome} detail={story.fact ?? theme.fact}
        winTitle={`You win the match ${me}–${cpu}.`} loseTitle={`The computer takes it ${cpu}–${me}.`} />
    </div>
  )
}
