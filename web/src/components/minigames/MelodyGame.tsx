import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { MinigameProps } from '@/games/types'
import { storyText, useGameOutcome, useGameTimer, TimerBar, OutcomeBanner } from './_shared'
import {
  TUNES, TUNE_IDS, generate, feedback, freqOf, label, stepOf,
  type Mark, type Note, type Puzzle,
} from './melody/model'

// Next Phrase: hear the opening of a famous tune, then build what comes next.
//
// The opening is played and drawn on a staff.  Below it, empty slots wait for
// the next phrase: each slot is as wide as its note is long, so the rhythm is
// given and only the pitches are missing.  The player drops note tiles into
// the slots, can play the attempt back, and submits.  Every submission marks
// each slot Mastermind-style (right note in the right place / the note belongs
// elsewhere in the phrase / not in the phrase), so a player who does not know
// the tune can still work it out; right notes lock in place.  Run out of
// attempts or time and the phrase is lost.
//
// A short "how the tune moves" hint names the musical device (a repeat, a
// sequence one step higher, an answer that returns home) and fades out with
// the tiers:
//
//   tier  phrase   decoys  attempts  clock  opening plays  hint
//   D1    4–5      0       6         2:30   unlimited      shown
//   D2    6–7      1       6         3:00   unlimited      shown
//   D3    8–9      2       6         4:00   unlimited      after 2 misses
//   D4    10–12    3 near  5         4:30   3              never
//
// The tunes and the rules live in ./melody/model.ts.

export const CONFIGS = TUNES
export const CONFIG_IDS = TUNE_IDS

// ── Audio ──────────────────────────────────────────────────────────────────

type AudioCtor = typeof AudioContext
function makeAudio(): AudioContext | null {
  try {
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }
    const C = w.AudioContext ?? w.webkitAudioContext
    return C ? new C() : null
  } catch { return null }
}

function tone(ctx: AudioContext, freq: number, at: number, len: number) {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.18, at + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.06, at + Math.min(0.15, len * 0.5))
  gain.gain.exponentialRampToValueAtTime(0.0001, at + len)
  gain.connect(ctx.destination)
  for (const [mult, type, amp] of [[1, 'triangle', 1], [2, 'sine', 0.25]] as const) {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq * mult, at)
    const g = ctx.createGain(); g.gain.value = amp
    osc.connect(g).connect(gain)
    osc.start(at); osc.stop(at + len + 0.05)
  }
}

// ── Staff drawing ──────────────────────────────────────────────────────────

const HALF = 4                 // half the gap between staff lines
const TOP = 30                 // y of the top line (F5, step 38)
const H = 104
const yOf = (step: number) => TOP + (38 - step) * HALF
const LINES = [30, 32, 34, 36, 38]

const widthOf = (d: number, slot: boolean) => Math.max(slot ? 26 : 18, 12 + d * 24)

const MARK_FILL: Record<Mark, string> = { right: '#10b981', elsewhere: '#f59e0b', absent: '#94a3b8' }

function NoteGlyph({ x, p, d, color }: { x: number; p: string; d: number; color: string }) {
  const step = stepOf(p)
  const y = yOf(step)
  const hollow = d >= 2
  const up = step < 34
  const stemX = up ? x + 4.3 : x - 4.3
  const stemEnd = up ? y - 24 : y + 24
  const flags = d >= 1 ? 0 : d >= 0.5 ? 1 : 2
  const dotted = [0.75, 1.5, 3].includes(d)
  const ledgers: number[] = []
  for (let s = 28; s >= step; s -= 2) ledgers.push(s)
  for (let s = 40; s <= step; s += 2) ledgers.push(s)
  return (
    <g>
      {ledgers.map(s => <line key={s} x1={x - 7.5} x2={x + 7.5} y1={yOf(s)} y2={yOf(s)} stroke="currentColor" strokeWidth={1} />)}
      {p.includes('#') && <text x={x - 9} y={y + 3.5} fontSize={10} textAnchor="middle" fill={color}>♯</text>}
      <ellipse cx={x} cy={y} rx={4.8} ry={3.4} transform={`rotate(-20 ${x} ${y})`}
        fill={hollow ? 'none' : color} stroke={color} strokeWidth={hollow ? 1.6 : 1} />
      {d < 4 && <line x1={stemX} x2={stemX} y1={y} y2={stemEnd} stroke={color} strokeWidth={1.2} />}
      {Array.from({ length: flags }, (_, k) => {
        const fy = stemEnd + (up ? k * 5 : -k * 5)
        return <path key={k} d={`M${stemX},${fy} q6,${up ? 5 : -5} 5,${up ? 12 : -12}`} fill="none" stroke={color} strokeWidth={1.4} />
      })}
      {dotted && <circle cx={x + 8} cy={step % 2 === 0 ? y - 2 : y} r={1.4} fill={color} />}
    </g>
  )
}

function RestGlyph({ x, d }: { x: number; d: number }) {
  const y = yOf(34)
  if (d >= 2) return <rect x={x - 5} y={y - 3} width={10} height={3} fill="currentColor" />
  if (d >= 1) return <path d={`M${x - 2},${y - 9} l4,5 l-4,4 l4,5 q-6,-2 -2,5`} fill="none" stroke="currentColor" strokeWidth={1.6} />
  return <g><circle cx={x - 1.5} cy={y - 3} r={1.8} fill="currentColor" /><line x1={x + 2.5} y1={y - 4} x2={x - 1} y2={y + 7} stroke="currentColor" strokeWidth={1.2} /></g>
}

interface StaffItem { note: Note; slot?: number }

function layout(items: StaffItem[]) {
  let x = 14
  const xs = items.map(it => { const w = widthOf(it.note.d, it.slot !== undefined); const c = x + w / 2; x += w; return { c, w } })
  return { xs, width: x + 8 }
}

function Staff({ items, render, ariaLabel }: {
  items: StaffItem[]
  render: (it: StaffItem, c: number, w: number) => ReactElement | null
  ariaLabel: string
}) {
  const { xs, width } = layout(items)
  return (
    <svg viewBox={`0 0 ${width} ${H}`} className="w-full h-auto block select-none text-ink-2" style={{ maxWidth: `${Math.round(width * 1.5)}px` }} role="img" aria-label={ariaLabel}>
      {LINES.map(s => <line key={s} x1={4} x2={width - 4} y1={yOf(s)} y2={yOf(s)} stroke="currentColor" strokeOpacity={0.45} strokeWidth={1} />)}
      <line x1={4} x2={4} y1={yOf(38)} y2={yOf(30)} stroke="currentColor" strokeOpacity={0.6} />
      <line x1={width - 4} x2={width - 4} y1={yOf(38)} y2={yOf(30)} stroke="currentColor" strokeOpacity={0.6} />
      {items.map((it, i) => <g key={i}>{render(it, xs[i].c, xs[i].w)}</g>)}
    </svg>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

interface Attempt { guess: string[]; marks: Mark[] }

const PITCH_TINT = ['bg-rose-500/15', 'bg-orange-500/15', 'bg-amber-500/15', 'bg-lime-500/15', 'bg-emerald-500/15', 'bg-sky-500/15', 'bg-violet-500/15']
const tintOf = (p: string) => PITCH_TINT['CDEFGAB'.indexOf(p[0])]

export default function MelodyGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const id = TUNES[configId] ? configId : 'ode-to-joy'
  const tune = { ...TUNES[id], ...storyText(params) }
  const pz: Puzzle = useMemo(() => generate(id, difficulty, seed), [id, difficulty, seed])
  const n = pz.answer.length

  const [slots, setSlots] = useState<(number | null)[]>(() => Array(n).fill(null))
  const [locked, setLocked] = useState<boolean[]>(() => Array(n).fill(false))
  const [marks, setMarks] = useState<(Mark | null)[]>(() => Array(n).fill(null))
  const [history, setHistory] = useState<Attempt[]>([])
  const [cursor, setCursor] = useState<number | null>(0)
  const [plays, setPlays] = useState(0)
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })

  useEffect(() => {
    setSlots(Array(n).fill(null)); setLocked(Array(n).fill(false)); setMarks(Array(n).fill(null))
    setHistory([]); setCursor(0); setPlays(0)
  }, [pz, n])

  const reveal = `The phrase was ${pz.answer.map(label).join(' ')}`
  const timer = useGameTimer({ seconds: pz.seconds, running: !settled, onExpire: () => lose(`Time’s up. ${reveal}`) })

  // Audio is created on the first tap (browsers block it before a gesture).
  const audio = useRef<AudioContext | null>(null)
  const ctx = () => {
    if (!audio.current) audio.current = makeAudio()
    try { void audio.current?.resume?.() } catch { /* ignore */ }
    return audio.current
  }
  useEffect(() => () => { try { void audio.current?.close?.() } catch { /* ignore */ } }, [])
  const spb = 60 / pz.bpm
  const playNotes = useCallback((notes: Note[]) => {
    const c = ctx()
    if (!c) return
    try {
      let t = c.currentTime + 0.05
      for (const nt of notes) {
        if (nt.p) tone(c, freqOf(nt.p), t, Math.min(1.4, Math.max(0.12, nt.d * spb * 0.92)))
        t += nt.d * spb
      }
    } catch { /* audio unavailable */ }
  }, [spb])
  const playOne = (p: string) => playNotes([{ p, d: 0.75 }])

  const used = new Set(slots.filter((s): s is number => s !== null))
  const misses = history.length
  const showHint = misses >= pz.hintAfter
  const openingLeft = pz.replays ? Math.max(0, pz.replays - plays) : Infinity
  const full = slots.every(s => s !== null)
  const attemptsLeft = pz.attempts - history.length

  const nextOpen = (from: number, ss: (number | null)[]) => {
    for (let k = 1; k <= n; k++) { const j = (from + k) % n; if (ss[j] === null && !locked[j]) return j }
    return null
  }

  const putTile = (ti: number) => {
    if (settled || used.has(ti)) return
    playOne(pz.tray[ti])
    const target = cursor !== null && !locked[cursor] ? cursor : slots.findIndex((s, i) => s === null && !locked[i])
    if (target === null || target < 0) return
    const ss = [...slots]; ss[target] = ti
    setSlots(ss)
    setMarks(m => { const x = [...m]; x[target] = null; return x })
    setCursor(nextOpen(target, ss))
  }

  const tapSlot = (i: number) => {
    if (settled) return
    const ti = slots[i]
    if (locked[i]) { if (ti !== null) playOne(pz.tray[ti]); return }
    if (ti !== null) {
      setSlots(s => { const x = [...s]; x[i] = null; return x })
      setMarks(m => { const x = [...m]; x[i] = null; return x })
    }
    setCursor(i)
  }

  const clear = () => {
    if (settled) return
    setSlots(s => s.map((t, i) => (locked[i] ? t : null)))
    setMarks(m => m.map((x, i) => (locked[i] ? x : null)))
    setCursor(locked.findIndex(l => !l))
  }

  const playOpening = () => {
    if (openingLeft <= 0) return
    if (pz.replays) setPlays(p => p + 1)
    playNotes(pz.opening)
  }

  const playMine = () => {
    let k = 0
    playNotes(pz.target.map(nt => {
      if (!nt.p) return nt
      const ti = slots[k++]
      return { p: ti === null ? null : pz.tray[ti], d: nt.d }
    }))
  }

  const submit = () => {
    if (settled || !full) return
    const guess = slots.map(s => pz.tray[s!])
    const fb = feedback(guess, pz.answer)
    const hist = [...history, { guess, marks: fb }]
    setHistory(hist)
    setMarks(fb)
    if (fb.every(m => m === 'right')) { setLocked(Array(n).fill(true)); win(); return }
    if (hist.length >= pz.attempts) { lose(`Out of attempts. ${reveal}`); return }
    const lk = fb.map(m => m === 'right')
    setLocked(lk)
    setCursor(lk.findIndex(l => !l))
  }

  // Staff items: slots number the target's pitched notes in order.
  const openingItems: StaffItem[] = pz.opening.map(note => ({ note }))
  let k = 0
  const targetItems: StaffItem[] = pz.target.map(note => (note.p ? { note, slot: k++ } : { note }))

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{tune.title}</p>
          <p className="text-muted text-[10px]">{TUNES[id].composer} · {TUNES[id].year}</p>
          <p className="text-muted text-xs leading-relaxed mt-1">{tune.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          <p className="font-bold text-ink-2">D{difficulty}</p>
          <p data-testid="mel-attempts">{attemptsLeft} {attemptsLeft === 1 ? 'try' : 'tries'}</p>
        </div>
      </div>
      {timer.active && !settled && <div className="w-full"><TimerBar remaining={timer.remaining} total={timer.total} /></div>}

      <div className="rounded-xl border border-line bg-paper p-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Opening</span>
          <button type="button" data-action="play-opening" onClick={playOpening} disabled={openingLeft <= 0}
            className="h-7 px-2.5 rounded-lg border border-line bg-panel text-[11px] font-bold text-ink-2 disabled:opacity-40">
            ▶ Play{Number.isFinite(openingLeft) ? ` (${openingLeft} left)` : ''}
          </button>
        </div>
        <Staff items={openingItems} ariaLabel="the opening phrase" render={(it, c) => it.note.p
          ? <g>
              <NoteGlyph x={c} p={it.note.p} d={it.note.d} color="currentColor" />
              {pz.names && <text x={c} y={H - 3} fontSize={7.5} textAnchor="middle" fill="currentColor" opacity={0.7}>{label(it.note.p)}</text>}
            </g>
          : <RestGlyph x={c} d={it.note.d} />} />
      </div>

      {showHint && pz.devices.length > 0 && (
        <p data-testid="mel-hint" className="text-[11px] leading-relaxed text-ink-2 bg-accent/10 border border-accent/20 rounded-lg px-2.5 py-1.5">
          <span className="font-bold">How the tune moves: </span>{pz.devices.join(' Then: ')}
        </p>
      )}

      <div className="rounded-xl border border-line bg-paper p-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Next phrase · {n} notes</span>
          <button type="button" data-action="play-mine" onClick={playMine}
            className="h-7 px-2.5 rounded-lg border border-line bg-panel text-[11px] font-bold text-ink-2">▶ Mine</button>
        </div>
        <Staff items={targetItems} ariaLabel="slots for the next phrase" render={(it, c, w) => {
          if (it.slot === undefined) return <RestGlyph x={c} d={it.note.d} />
          const i = it.slot
          const ti = slots[i]
          const p = ti === null ? null : pz.tray[ti]
          const mk = marks[i]
          const color = mk ? MARK_FILL[mk] : 'currentColor'
          const active = cursor === i && !settled && !locked[i]
          return (
            <g data-slot={i} onClick={() => tapSlot(i)} style={{ cursor: settled ? 'default' : 'pointer' }}>
              <rect x={c - w / 2 + 1.5} y={4} width={w - 3} height={H - 16} rx={4}
                fill={mk ? `${MARK_FILL[mk]}22` : active ? 'rgba(56,189,248,.12)' : 'rgba(148,163,184,.06)'}
                stroke={active ? '#38bdf8' : mk ? MARK_FILL[mk] : 'rgba(148,163,184,.55)'} strokeDasharray={p ? undefined : '3 2'} strokeWidth={active ? 1.5 : 1} />
              {p && <NoteGlyph x={c} p={p} d={it.note.d} color={color} />}
              {p && <text x={c} y={H - 3} fontSize={7.5} textAnchor="middle" fill={color} fontWeight={700}>{label(p)}</text>}
              {locked[i] && <text x={c} y={11} fontSize={7} textAnchor="middle" fill={MARK_FILL.right}>✓</text>}
            </g>
          )
        }} />
      </div>

      <div className="flex flex-wrap gap-1.5 justify-center">
        {pz.tray.map((p, ti) => (
          <button key={ti} type="button" data-tile={ti} data-pitch={p} disabled={settled || used.has(ti)} onClick={() => putTile(ti)}
            className={`h-9 min-w-[2.6rem] px-2 rounded-lg border border-line text-xs font-bold text-ink-2 transition-opacity
              ${used.has(ti) ? 'opacity-25' : `${tintOf(p)} hover:border-accent/60`}`}>
            {label(p)}
          </button>
        ))}
      </div>

      {!settled && (
        <div className="flex gap-1.5">
          <button type="button" data-action="clear" onClick={clear}
            className="h-9 px-3 rounded-lg border border-line bg-panel text-xs font-bold text-ink-2">Clear</button>
          <button type="button" data-action="submit" onClick={submit} disabled={!full}
            className="flex-1 h-9 px-3 rounded-lg bg-accent text-accent-fg text-xs font-bold disabled:opacity-40">
            Check phrase
          </button>
        </div>
      )}
      {!settled && <p className="text-muted text-[10px] -mt-1">Tap a note to drop it in the highlighted slot; tap a filled slot to take it back. Green: right note, right place · Amber: in the phrase, but elsewhere · Grey: not in this phrase.</p>}

      {history.length > 0 && (
        <div data-testid="mel-history" className="flex flex-col gap-1">
          {history.map((h, r) => (
            <div key={r} data-attempt={r} className="flex flex-wrap gap-0.5 items-center">
              <span className="text-[10px] text-muted w-5">{r + 1}.</span>
              {h.guess.map((g, i) => (
                <span key={i} data-mark={h.marks[i]} className="text-[10px] font-bold rounded px-1 py-0.5 text-white" style={{ background: MARK_FILL[h.marks[i]] }}>{label(g)}</span>
              ))}
            </div>
          ))}
        </div>
      )}

      <OutcomeBanner outcome={outcome} detail={tune.fact} winTitle="That’s how it goes!" loseTitle={reason ?? 'Not this time'} />
    </div>
  )
}
