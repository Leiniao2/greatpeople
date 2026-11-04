import { useMemo, useState, type ReactNode } from 'react'
import type { MinigameProps } from '@/games/types'
import { OutcomeBanner, TimerBar, useGameOutcome, useGameTimer } from './_shared'
import { THEMES, evaluate, isOn, makePuzzle, size, solves, type Mask, type Node } from './circuit/model'

// Circuit: throw switches until exactly the right lamps glow.  Contacts can
// be ganged to one switch or normally closed, a bare branch beside a lamp
// steals its current, and a bare path across the battery blows a fuse.
// Each level is generated from its seed; see ./circuit/model.

export const CONFIG_IDS = Object.keys(THEMES)

const SW_COLORS = ['#f59e0b', '#38bdf8', '#a78bfa', '#34d399', '#f472b6', '#fb923c', '#a3e635']
const LETTERS = 'ABCDEFG'
const UX = 30
const UY = 52
const IDLE = '#475569'
const LIVE = '#fbbf24'
const SHORT = '#ef4444'

interface Drawn { els: ReactNode[] }

function draw(n: Node, x: number, y: number, mask: Mask, flowing: Set<number>, lit: boolean[], target: boolean[], short: boolean, out: Drawn) {
  const ym = y + UY / 2
  const live = flowing.has(n.id)
  const wire = live ? (short ? SHORT : LIVE) : IDLE
  const line = (x1: number, y1: number, x2: number, y2: number, c = wire, key = `${n.id}:${x1}:${y1}:${x2}:${y2}`) =>
    out.els.push(<line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={2.5} strokeLinecap="round" />)

  if (n.k === 'contact') {
    const closed = isOn(mask, n.sw) !== n.nc
    const color = SW_COLORS[n.sw]
    const a = x + UX * 0.55, b = x + UX * 1.45
    line(x, ym, a, ym)
    line(b, ym, x + 2 * UX, ym)
    out.els.push(
      <g key={`c${n.id}`}>
        <circle cx={a} cy={ym} r={3} fill={color} />
        <circle cx={b} cy={ym} r={3} fill={closed ? color : 'none'} stroke={color} strokeWidth={1.5} />
        {closed
          ? <line x1={a} y1={ym} x2={b} y2={ym} stroke={live ? wire : color} strokeWidth={3} strokeLinecap="round" />
          : <line x1={a} y1={ym} x2={b - 3} y2={ym - 13} stroke={color} strokeWidth={3} strokeLinecap="round" />}
        <text x={x + UX} y={ym - 16} textAnchor="middle" fontSize={12} fontWeight="bold" fontFamily="monospace" fill={color}>{LETTERS[n.sw]}</text>
        {n.nc && <line x1={x + UX - 5} y1={ym - 28} x2={x + UX + 5} y2={ym - 28} stroke={color} strokeWidth={1.6} />}
      </g>,
    )
    return
  }
  if (n.k === 'lamp') {
    const on = lit[n.lamp], want = target[n.lamp]
    const cx = x + UX, r = 10
    line(x, ym, cx - r, ym)
    line(cx + r, ym, x + 2 * UX, ym)
    const ok = on === want
    out.els.push(
      <g key={`l${n.id}`}>
        {on && <circle cx={cx} cy={ym} r={19} fill={LIVE} opacity={0.25} />}
        <circle cx={cx} cy={ym} r={r} fill={on ? LIVE : '#0f172a'} stroke={on ? LIVE : '#94a3b8'} strokeWidth={1.6} />
        <path d={`M ${cx - 7} ${ym - 7} L ${cx + 7} ${ym + 7} M ${cx + 7} ${ym - 7} L ${cx - 7} ${ym + 7}`} stroke={on ? '#78350f' : '#64748b'} strokeWidth={1.4} />
        <rect x={cx - 15} y={ym + 13} width={30} height={12} rx={6}
          fill={want ? 'rgba(251,191,36,0.18)' : 'rgba(239,68,68,0.15)'} stroke={ok ? '#34d399' : want ? LIVE : SHORT} strokeWidth={1} />
        <text x={cx} y={ym + 22} textAnchor="middle" fontSize={8} fontWeight="bold" fontFamily="monospace" fill={want ? LIVE : '#fca5a5'}>
          {n.lamp + 1}·{want ? 'ON' : 'OFF'}
        </text>
      </g>,
    )
    return
  }
  if (n.k === 'series') {
    let cx = x
    for (const c of n.ch) { draw(c, cx, y, mask, flowing, lit, target, short, out); cx += size(c).w * UX }
    return
  }
  // Parallel: two buses, branches stacked, each branch on its own row.
  const { w } = size(n)
  const left = x + UX / 2, right = x + w * UX - UX / 2
  line(x, ym, left, ym)
  line(right, ym, x + w * UX, ym)
  let cy = y
  let lastY = ym
  for (const c of n.ch) {
    const s = size(c)
    const by = cy + UY / 2
    const cl = flowing.has(c.id) ? (short ? SHORT : LIVE) : IDLE
    line(left, by, x + UX, by, cl, `${n.id}:in:${c.id}`)
    draw(c, x + UX, cy, mask, flowing, lit, target, short, out)
    line(x + UX + s.w * UX, by, right, by, cl, `${n.id}:out:${c.id}`)
    lastY = by
    cy += s.h * UY
  }
  line(left, ym, left, lastY, wire, `${n.id}:busL`)
  line(right, ym, right, lastY, wire, `${n.id}:busR`)
}

export default function CircuitGame({ configId, difficulty, seed, onWin, onLose }: MinigameProps) {
  const puzzle = useMemo(() => makePuzzle(configId, difficulty, seed), [configId, difficulty, seed])
  const theme = THEMES[puzzle.theme]
  const [mask, setMask] = useState<Mask>(puzzle.start)
  const [throws, setThrows] = useState(0)
  const [blown, setBlown] = useState(0)
  const { outcome, reason, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 1200 })
  const timer = useGameTimer({ seconds: puzzle.seconds, running: !outcome, onExpire: () => lose('out of time') })

  const e = evaluate(puzzle.root, mask, puzzle.lamps)
  const { w, h } = size(puzzle.root)
  const x0 = 3 * UX, y0 = 34
  const vbW = x0 + w * UX + UX
  const ym = y0 + UY / 2
  const yB = y0 + h * UY + 10
  const vbH = yB + 14
  const drawn: Drawn = { els: [] }
  draw(puzzle.root, x0, y0, mask, e.flowing, e.lit, puzzle.target, e.short, drawn)
  const mainLive = e.flowing.has(puzzle.root.id)
  const main = mainLive ? (e.short ? SHORT : LIVE) : IDLE

  const spare = puzzle.fuses === Infinity ? null : puzzle.fuses - blown
  const left = puzzle.budget === null ? null : puzzle.budget - throws

  const toggle = (sw: number) => {
    if (outcome) return
    const next = mask ^ (1 << sw)
    const used = throws + 1
    setMask(next)
    setThrows(used)
    if (solves(puzzle, next)) { win(); return }
    if (evaluate(puzzle.root, next, puzzle.lamps).short) {
      const b = blown + 1
      setBlown(b)
      if (b > puzzle.fuses) { lose('the last fuse blew'); return }
    }
    if (puzzle.budget !== null && used >= puzzle.budget) lose('out of switch throws')
  }

  const matched = e.lit.filter((l, i) => !e.short && l === puzzle.target[i]).length

  return (
    <div className="flex flex-col gap-2">
      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}
      <div className="text-center">
        <p className="text-accent font-bold text-sm">{theme.title}</p>
        <p className="text-muted text-xs leading-snug">{theme.blurb}</p>
      </div>

      <div className="rounded-xl border border-line overflow-hidden" style={{ background: '#0b1220' }}>
        <svg viewBox={`0 0 ${vbW} ${vbH}`} className="w-full h-auto block" style={{ maxHeight: 420 }}>
          {/* Battery, fuse and the return rail */}
          <line x1={UX * 0.7} y1={ym} x2={UX * 1.4} y2={ym} stroke={main} strokeWidth={2.5} />
          <rect x={UX * 1.4} y={ym - 6} width={UX * 0.9} height={12} rx={3}
            fill={e.short ? 'rgba(239,68,68,0.35)' : '#1e293b'} stroke={e.short ? SHORT : '#94a3b8'} strokeWidth={1.2} />
          <path d={`M ${UX * 1.45} ${ym} q ${UX * 0.2} -6 ${UX * 0.4} 0 t ${UX * 0.4} 0`} fill="none"
            stroke={e.short ? SHORT : '#cbd5e1'} strokeWidth={1.2} strokeDasharray={e.short ? '3 3' : undefined} />
          <text x={UX * 1.85} y={ym - 10} textAnchor="middle" fontSize={8} fill="#94a3b8" fontFamily="monospace">FUSE</text>
          <line x1={UX * 2.3} y1={ym} x2={x0} y2={ym} stroke={main} strokeWidth={2.5} />
          <line x1={UX * 0.7} y1={ym} x2={UX * 0.7} y2={(ym + yB) / 2 - 9} stroke={main} strokeWidth={2.5} />
          <line x1={UX * 0.7 - 11} y1={(ym + yB) / 2 - 9} x2={UX * 0.7 + 11} y2={(ym + yB) / 2 - 9} stroke="#f87171" strokeWidth={3} />
          <line x1={UX * 0.7 - 6} y1={(ym + yB) / 2 - 2} x2={UX * 0.7 + 6} y2={(ym + yB) / 2 - 2} stroke="#94a3b8" strokeWidth={3} />
          <text x={UX * 0.7 + 14} y={(ym + yB) / 2 - 8} fontSize={9} fill="#f87171" fontFamily="monospace">+</text>
          <line x1={UX * 0.7} y1={(ym + yB) / 2 - 2} x2={UX * 0.7} y2={yB} stroke={main} strokeWidth={2.5} />
          <line x1={UX * 0.7} y1={yB} x2={x0 + w * UX + UX / 2} y2={yB} stroke={main} strokeWidth={2.5} />
          <line x1={x0 + w * UX} y1={ym} x2={x0 + w * UX + UX / 2} y2={ym} stroke={main} strokeWidth={2.5} />
          <line x1={x0 + w * UX + UX / 2} y1={ym} x2={x0 + w * UX + UX / 2} y2={yB} stroke={main} strokeWidth={2.5} />
          {drawn.els}
        </svg>
      </div>

      <div className="flex gap-2 flex-wrap justify-center">
        {Array.from({ length: puzzle.switches }, (_, sw) => {
          const on = isOn(mask, sw)
          const c = SW_COLORS[sw]
          return (
            <button key={sw} onClick={() => toggle(sw)} disabled={!!outcome}
              aria-label={`Switch ${LETTERS[sw]} ${on ? 'on' : 'off'}`}
              className="w-12 h-14 rounded-lg border-2 font-bold text-sm flex flex-col items-center justify-center gap-1 transition-all"
              style={{ borderColor: c, background: on ? `${c}33` : 'transparent', color: c }}>
              <span className="text-base leading-none">{LETTERS[sw]}</span>
              <span className="text-[9px] leading-none px-1.5 py-0.5 rounded-full" style={{ background: on ? c : 'transparent', color: on ? '#0b1220' : c }}>{on ? 'ON' : 'OFF'}</span>
            </button>
          )
        })}
      </div>

      <div className="flex justify-center gap-4 text-[11px] text-muted">
        <span>Lamps right: {matched}/{puzzle.lamps}</span>
        <span>{left === null ? `Throws: ${throws}` : `Throws left: ${left}`}</span>
        <span>{spare === null ? 'Fuses: spare box' : `Spare fuses: ${Math.max(0, spare)}`}</span>
      </div>
      <p className={`text-center text-xs ${e.short ? 'text-red-500 font-bold' : 'text-muted'}`}>
        {e.short
          ? 'Short circuit! A bare path joins the battery terminals and the fuse blew.'
          : 'Barred contacts (A̅) close when their switch is OFF. Same colour, same switch.'}
      </p>

      <OutcomeBanner outcome={outcome} detail="Every lamp matches its tag."
        winTitle={`Circuit set in ${throws} throws (best ${puzzle.par}).`} loseTitle={reason ? `Not this time: ${reason}.` : 'Not this time'} />
    </div>
  )
}
