import { useEffect, useMemo, useState } from 'react'
import type { MinigameProps } from '@/games/types'
import { OutcomeBanner, TimerBar, hashString, useGameOutcome, useGameTimer } from './_shared'
import {
  THEMES, TIERS, TOOLS, crackable, digStatus, makeLevel, startDig, strike, zone,
  type Action, type Cell, type Dir, type Tool,
} from './golddig/model'

// Gold Dig: crack the stone with a few tools; each cracked cell shows gold or
// empty rock.  Nuggets span several cells, so a find is worth following.
// Each level is generated from its seed; see ./golddig/model.

export const CONFIG_IDS = Object.keys(THEMES)

/** Seconds per tier (0: no clock). */
export const GOLDDIG_TIME_LIMITS = ([1, 2, 3, 4] as const).map(d => TIERS[d].seconds)

const U = 34
const TOOL_LABEL: Record<Tool, string> = { hammer: 'Hammer', pick: 'Pick', dynamite: 'Dynamite' }
const TOOL_NOTE: Record<Tool, string> = { hammer: '1 cell', pick: '3 in a line', dynamite: '3 × 3' }


function ToolIcon({ tool }: { tool: Tool }) {
  if (tool === 'hammer') return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      <rect x="10.5" y="9" width="3" height="13" rx="1" fill="#a16207" />
      <rect x="5" y="3" width="14" height="6" rx="1.5" fill="#94a3b8" stroke="#475569" />
    </svg>
  )
  if (tool === 'pick') return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      <rect x="10.8" y="7" width="2.4" height="15" rx="1" fill="#a16207" />
      <path d="M2 9 Q12 1 22 9 L20 10 Q12 4.5 4 10 Z" fill="#94a3b8" stroke="#475569" strokeWidth="0.8" />
    </svg>
  )
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      <rect x="6" y="8" width="12" height="13" rx="2" fill="#dc2626" stroke="#7f1d1d" />
      <rect x="6" y="12" width="12" height="2" fill="#7f1d1d" opacity="0.5" />
      <path d="M12 8 Q13 4 16 3" stroke="#78716c" strokeWidth="1.2" fill="none" />
      <circle cx="16.5" cy="2.8" r="1.6" fill="#fbbf24" />
    </svg>
  )
}

/** A few seeded crack lines so each stone looks its own. */
function stoneLines(cell: Cell, x: number, y: number) {
  const h = hashString(`stone${cell}`)
  const a = (h % 7) + 6, b = ((h >> 3) % 9) + 8, c = ((h >> 7) % 8) + 14
  return `M${x + a} ${y + 5} L${x + b} ${y + 13} L${x + c} ${y + 16} M${x + U - 6} ${y + a + 10} L${x + U - 13} ${y + b + 12}`
}

/**
 * One cell of a nugget.  Sides that touch more gold of the same nugget are
 * drawn flush to the cell edge, so a dug-out nugget reads as one lump.
 */
function Nugget({ x, y, lost, join }: { x: number; y: number; lost: boolean; join: { u: boolean; d: boolean; l: boolean; r: boolean } }) {
  const cx = x + U / 2, cy = y + U / 2
  if (lost) return (
    <g>
      <path d={`M${cx - 9} ${cy + 2} l4 -5 l3 4 Z M${cx + 2} ${cy - 6} l6 2 l-3 5 Z M${cx - 2} ${cy + 5} l7 1 l-4 4 Z`} fill="#a8a29e" />
      <path d={`M${x + 6} ${y + 6} L${x + U - 6} ${y + U - 6} M${x + U - 6} ${y + 6} L${x + 6} ${y + U - 6}`} stroke="#ef4444" strokeWidth="2" />
    </g>
  )
  const m = 5
  const x0 = join.l ? x : x + m, x1 = join.r ? x + U : x + U - m
  const y0 = join.u ? y : y + m, y1 = join.d ? y + U : y + U - m
  return (
    <g>
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={join.u || join.d || join.l || join.r ? 3 : 8}
        fill="#facc15" stroke="#a16207" strokeWidth={1} />
      <path d={`M${cx - 6} ${cy - 3} L${cx} ${cy - 6}`} stroke="#fef9c3" strokeWidth="2" strokeLinecap="round" />
      <circle cx={cx + 5} cy={cy + 4} r={1.6} fill="#ca8a04" opacity={0.7} />
    </g>
  )
}

export default function GoldDigGame({ configId, difficulty, seed, onWin, onLose }: MinigameProps) {
  const lv = useMemo(() => makeLevel(configId, difficulty, seed), [configId, difficulty, seed])
  const theme = THEMES[lv.theme]
  const n = lv.size
  const [dig, setDig] = useState(() => startDig(lv))
  const [tool, setTool] = useState<Tool>('dynamite')
  const [dir, setDir] = useState<Dir>('h')
  const [aim, setAim] = useState<Cell | null>(null)
  const [note, setNote] = useState('')
  const { outcome, reason, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 1400 })
  const timer = useGameTimer({ seconds: lv.seconds, running: !outcome, onExpire: () => lose('out of time') })

  const s = digStatus(lv, dig)
  useEffect(() => {
    if (s.outcome === 'won') win()
    else if (s.outcome === 'lost') lose(s.reason)
  }, [s.outcome, s.reason, win, lose])

  const granite = useMemo(() => new Set(lv.granite), [lv])
  const gold = useMemo(() => new Set(lv.gold), [lv])
  const nuggetOf = useMemo(() => { const m = new Map<Cell, number>(); lv.nuggets.forEach((cells, i) => cells.forEach(k => m.set(k, i))); return m }, [lv])
  const sameNugget = (k: Cell, j: Cell) => nuggetOf.has(k) && nuggetOf.get(k) === nuggetOf.get(j) && !!dig.cracked[j]
  const action = (cell: Cell): Action => ({ tool, cell, dir: tool === 'pick' ? dir : undefined })
  const preview = aim !== null && !outcome ? new Set(zone(n, action(aim))) : null
  const willCrack = aim !== null && !outcome ? new Set(crackable(lv, dig.cracked, action(aim), granite)) : null

  const fire = (cell: Cell) => {
    if (outcome) return
    if (dig.kit[tool] <= 0) { setNote(`No ${TOOL_LABEL[tool].toLowerCase()} left.`); return }
    const next = strike(lv, dig, action(cell))
    if (!next) { setNote(tool === 'dynamite' ? 'Nothing left to crack there.' : 'Nothing that tool can crack there: granite needs dynamite.'); return }
    setDig(next); setAim(null); setNote('')
  }
  const tap = (cell: Cell) => {
    if (outcome) return
    if (aim === cell) fire(cell)
    else { setAim(cell); setNote('') }
  }
  const choose = (t: Tool) => { setTool(t); setNote('') }

  const reveal = outcome === 'lost'

  return (
    <div className="flex flex-col items-center gap-2">
      {timer.active && <div className="w-full"><TimerBar remaining={timer.remaining} total={timer.total} /></div>}
      <div className="text-center px-2">
        <p className="text-accent font-bold text-sm">{theme.title}</p>
        <p className="text-muted text-xs leading-snug">{theme.blurb}</p>
      </div>

      <div className="text-center text-[11px] text-muted leading-snug">
        <p>The assayer reckons on {lv.nuggets.length} nuggets, {lv.gold.length} cells of gold in all.</p>
        <p>Gold dug out: <b className="text-accent">{s.found}/{lv.target}</b>
          {s.lost > 0 && <span className="text-red-500"> · {s.lost} shattered</span>}</p>
      </div>

      <div className="rounded-xl border border-line overflow-hidden w-full" style={{ background: '#1c1917', maxWidth: 440 }}>
        <svg viewBox={`0 0 ${n * U} ${n * U}`} className="w-full h-auto block select-none" role="grid" aria-label="Dig site">
          <defs>
            <linearGradient id="gd-stone" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#a8a29e" /><stop offset="1" stopColor="#78716c" />
            </linearGradient>
            <linearGradient id="gd-granite" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#52525b" /><stop offset="1" stopColor="#27272a" />
            </linearGradient>
          </defs>
          {Array.from({ length: n * n }, (_, k) => {
            const r = Math.floor(k / n), c = k % n, x = c * U, y = r * U
            const open = !!dig.cracked[k]
            const isGold = gold.has(k)
            const g = granite.has(k)
            const label = open
              ? (isGold ? `Gold ${r + 1},${c + 1}` : `Empty ${r + 1},${c + 1}`)
              : `${g ? 'Granite' : 'Stone'} ${r + 1},${c + 1}`
            return (
              <g key={k} onClick={() => tap(k)} aria-label={label} role="gridcell" style={{ cursor: outcome ? 'default' : 'pointer' }}>
                {open ? (
                  <>
                    <rect x={x} y={y} width={U} height={U} fill="#292524" stroke="#1c1917" />
                    {isGold
                      ? <Nugget x={x} y={y} lost={dig.shattered.includes(k)} join={{
                          u: r > 0 && sameNugget(k, k - n), d: r < n - 1 && sameNugget(k, k + n),
                          l: c > 0 && sameNugget(k, k - 1), r: c < n - 1 && sameNugget(k, k + 1),
                        }} />
                      : <circle cx={x + U / 2} cy={y + U / 2} r={2} fill="#57534e" />}
                  </>
                ) : (
                  <>
                    <rect x={x + 1} y={y + 1} width={U - 2} height={U - 2} rx={4} fill={g ? 'url(#gd-granite)' : 'url(#gd-stone)'} stroke={g ? '#18181b' : '#57534e'} />
                    {g
                      ? [5, 11, 17, 23].map((o, i) => <circle key={i} cx={x + o + (i % 2) * 4} cy={y + 8 + ((o * 7) % 18)} r={1.3} fill="#d4d4d8" opacity={0.6} />)
                      : <path d={stoneLines(k, x, y)} stroke="#57534e" strokeWidth={1} fill="none" opacity={0.7} />}
                    {reveal && isGold && <rect x={x + 4} y={y + 4} width={U - 8} height={U - 8} rx={4} fill="none" stroke="#facc15" strokeWidth={2} strokeDasharray="3 2" />}
                  </>
                )}
                {preview?.has(k) && (
                  <rect x={x + 2} y={y + 2} width={U - 4} height={U - 4} rx={4} pointerEvents="none"
                    fill={willCrack?.has(k) ? 'rgba(251,191,36,0.25)' : 'rgba(148,163,184,0.15)'}
                    stroke={willCrack?.has(k) ? '#fbbf24' : '#64748b'} strokeWidth={2} strokeDasharray={k === aim ? undefined : '4 3'} />
                )}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {TOOLS.map(t => (
          <button key={t} onClick={() => choose(t)} disabled={!!outcome}
            aria-label={`${TOOL_LABEL[t]}: ${dig.kit[t]} left`}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border-2 text-xs font-bold transition-all
              ${tool === t ? 'border-accent bg-accent/20 text-accent' : 'border-line text-muted'} ${dig.kit[t] ? '' : 'opacity-40'}`}>
            <ToolIcon tool={t} />
            <span>{TOOL_LABEL[t]} × {dig.kit[t]}</span>
            <span className="font-normal opacity-70">{TOOL_NOTE[t]}</span>
          </button>
        ))}
        {tool === 'pick' && (
          <button onClick={() => setDir(d => (d === 'h' ? 'v' : 'h'))} disabled={!!outcome}
            className="px-2.5 py-1.5 rounded-lg border border-line text-xs text-muted">
            Swing: {dir === 'h' ? 'across' : 'down'}
          </button>
        )}
        <button onClick={() => aim !== null && fire(aim)} disabled={!!outcome || aim === null}
          className="px-3 py-1.5 rounded-lg border-2 border-accent text-xs font-bold text-accent disabled:opacity-40">Strike</button>
      </div>

      {note && <p className="text-[11px] text-red-500">{note}</p>}
      <p className="text-center text-[11px] text-muted px-3 leading-snug">
        Tap a cell to aim, tap it again (or Strike) to crack. Cracked rock shows gold or nothing; nuggets run across several cells, so follow a find.
        {lv.shatter ? ' Dynamite shatters any gold it reaches, and shattered gold is lost.' : ''}
        {lv.granite.length ? ' Granite holds no gold, and only dynamite cracks it.' : ''}
      </p>

      <OutcomeBanner outcome={outcome} detail={theme.fact}
        winTitle="Strike! The assayer's weight is dug out." loseTitle={reason ? `Not this time: ${reason}.` : 'Not this time'} />
    </div>
  )
}
