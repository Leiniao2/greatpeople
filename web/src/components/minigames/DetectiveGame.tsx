import { useMemo, useState } from 'react'
import type { MinigameProps } from '@/games/types'
import { OutcomeBanner, TimerBar, useGameOutcome, useGameTimer } from './_shared'
import { CASES, generate, isCorrect, type Lead } from './detective/model'

// Detective: work out who killed each victim and how.  Every hour you may
// examine a body, search a place or question a suspect; what you learn goes
// into the notebook.  Cross out suspect × method pairs in the grid, then make
// one accusation per victim.  A wrong accusation loses the case.
// Each case is generated from its seed; see ./detective/model.

export const CONFIG_IDS = Object.keys(CASES)

const LEAD_VERB: Record<Lead['kind'], string> = { body: 'Examine', place: 'Search', question: 'Question' }

function Lamp({ lit }: { lit: boolean }) {
  return (
    <svg viewBox="0 0 16 22" width={14} height={19} aria-hidden>
      <rect x={4} y={1} width={8} height={3} rx={1} fill="#78716c" />
      <path d="M3 5 h10 l-1 12 h-8 z" fill={lit ? '#fbbf24' : '#334155'} stroke="#78716c" strokeWidth={1} opacity={lit ? 0.95 : 0.6} />
      {lit && <ellipse cx={8} cy={11} rx={2} ry={3.2} fill="#fef3c7" />}
      <rect x={3} y={17} width={10} height={3} rx={1} fill="#78716c" />
    </svg>
  )
}

export default function DetectiveGame({ configId, difficulty, seed, onWin, onLose }: MinigameProps) {
  const c = useMemo(() => generate(configId, difficulty, seed), [configId, difficulty, seed])
  const [opened, setOpened] = useState<number[]>([])
  const [crossed, setCrossed] = useState<Record<string, boolean>>({})
  const [tab, setTab] = useState(0)
  const [accused, setAccused] = useState<{ s?: number; m?: number }[]>(() => c.victims.map(() => ({})))
  const { outcome, reason, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 1600 })
  const timer = useGameTimer({ seconds: c.seconds, running: !outcome, onExpire: () => lose(`time ran out; ${answer()}`) })

  const hoursLeft = c.budget - opened.length
  const two = c.victims.length > 1
  const answer = () => c.truth.map((t, v) =>
    `${c.suspects[t.s].name} killed ${c.victims[v].name} (${c.methods[t.m].label.toLowerCase()}, ${c.hours[t.h]})`).join('; ')

  const open = (i: number) => {
    if (outcome || hoursLeft <= 0 || opened.includes(i)) return
    setOpened(prev => [...prev, i])
  }
  const toggle = (v: number, s: number, m: number) => {
    if (outcome) return
    const k = `${v}:${s}:${m}`
    setCrossed(prev => ({ ...prev, [k]: !prev[k] }))
  }
  const choose = (v: number, part: 's' | 'm', i: number) => {
    if (outcome) return
    setAccused(prev => prev.map((a, j) => (j === v ? { ...a, [part]: i } : a)))
  }
  const ready = accused.every(a => a.s !== undefined && a.m !== undefined)
  const accuse = () => {
    if (outcome || !ready) return
    if (isCorrect(c, accused as { s: number; m: number }[])) win()
    else lose(`the truth: ${answer()}`)
  }

  return (
    <div className="flex flex-col gap-3">
      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}

      <div className="text-center px-2">
        <p className="text-accent font-bold text-sm">{c.title}</p>
        <p className="text-muted text-[11px] uppercase tracking-wide">{c.setting}</p>
        <p className="text-xs leading-snug mt-1">{c.intro}</p>
      </div>

      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-2 text-xs">
        {c.victims.map((vd, v) => (
          <p key={v}><b>{two ? `Victim ${v + 1}: ` : 'Victim: '}</b>{vd.name}, {vd.role}, found dead {vd.foundAt}.</p>
        ))}
      </div>

      <section>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-bold">Leads</h3>
          <div className="flex items-center gap-1 text-[11px] text-muted" aria-label={`Hours left: ${hoursLeft} of ${c.budget}`}>
            {Array.from({ length: c.budget }, (_, i) => <Lamp key={i} lit={i < hoursLeft} />)}
            <span className="ml-1">{hoursLeft} {hoursLeft === 1 ? 'hour' : 'hours'} left</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {c.leads.map((lead, i) => {
            const done = opened.includes(i)
            const label = `${LEAD_VERB[lead.kind]} ${lead.name}`
            return (
              <button key={i} onClick={() => open(i)} disabled={!!outcome || done || hoursLeft <= 0} aria-label={label}
                className={`text-left px-2 py-1.5 rounded-lg border text-[11px] leading-tight transition-all
                  ${done ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line bg-panel disabled:opacity-40'}`}>
                <span className="block text-[9px] uppercase tracking-wide text-muted">{LEAD_VERB[lead.kind]}</span>
                {lead.name[0].toUpperCase() + lead.name.slice(1)}
              </button>
            )
          })}
        </div>
        {hoursLeft <= 0 && !outcome && <p className="text-[11px] text-muted mt-1">The night is over. Name the killer from what you have.</p>}
      </section>

      <section>
        <h3 className="text-xs font-bold mb-1">Notebook</h3>
        {opened.length === 0
          ? <p className="text-[11px] text-muted">Nothing yet. Each lead takes an hour.</p>
          : (
            <ul className="flex flex-col gap-1.5" aria-label="Notebook">
              {opened.map(i => (
                <li key={i} className="rounded-lg border border-line bg-panel px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted">{c.leads[i].name}</p>
                  {c.leads[i].clues.map((x, j) => <p key={j} className="text-xs leading-snug">{x.text}</p>)}
                </li>
              ))}
            </ul>
          )}
      </section>

      <section>
        <h3 className="text-xs font-bold mb-1">Suspects</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {c.suspects.map((sp, s) => (
            <div key={s} className="rounded-lg border border-line bg-panel px-2 py-1.5 text-[11px] leading-snug">
              <p><b>{sp.name}</b> <span className="text-muted">· {sp.role}</span></p>
              <p className="text-muted">{sp.profile}</p>
              <p><span className="text-muted">Seen as:</span> {sp.traits.hand}, {sp.traits.height}</p>
              <p><span className="text-muted">Could use:</span> {sp.means.map(m => c.methods[m].label).join(', ')}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-xs font-bold">Deductions</h3>
          {two && c.victims.map((vd, v) => (
            <button key={v} onClick={() => setTab(v)} aria-label={`Deductions for ${vd.name}`}
              className={`px-2 py-0.5 rounded border text-[11px] ${tab === v ? 'border-accent text-accent bg-accent/10' : 'border-line text-muted'}`}>{vd.name}</button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="text-[10px] border-collapse w-full" aria-label={`Deduction grid for ${c.victims[tab].name}`}>
            <thead>
              <tr>
                <th />
                {c.methods.map(m => <th key={m.id} className="px-1 py-1 font-semibold text-muted">{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {c.suspects.map((sp, s) => (
                <tr key={s}>
                  <th className="text-left pr-1 font-semibold whitespace-nowrap">{sp.name}</th>
                  {c.methods.map((m, mi) => {
                    if (!sp.means.includes(mi)) return <td key={m.id} className="text-center text-muted/50 border border-line/50">·</td>
                    const x = !!crossed[`${tab}:${s}:${mi}`]
                    return (
                      <td key={m.id} className="border border-line/50 p-0">
                        <button onClick={() => toggle(tab, s, mi)} disabled={!!outcome}
                          aria-label={`Rule out ${sp.name} with ${m.label} for ${c.victims[tab].name}`} aria-pressed={x}
                          className={`w-full h-7 font-bold ${x ? 'text-red-500 bg-red-500/10' : 'text-transparent hover:bg-accent/10'}`}>✕</button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-muted mt-0.5">A dot means that suspect had no access to that method.</p>
      </section>

      <section className="rounded-xl border border-accent/40 p-2 flex flex-col gap-2">
        <h3 className="text-xs font-bold">Accusation</h3>
        {c.victims.map((vd, v) => (
          <div key={v} className="flex flex-col gap-1">
            <p className="text-[11px]">Who killed <b>{vd.name}</b>, and how?</p>
            <div className="flex flex-wrap gap-1">
              {c.suspects.map((sp, s) => (
                <button key={s} onClick={() => choose(v, 's', s)} disabled={!!outcome}
                  aria-label={`Culprit for ${vd.name}: ${sp.name}`} aria-pressed={accused[v].s === s}
                  className={`px-2 py-0.5 rounded-full border text-[11px] ${accused[v].s === s ? 'border-accent bg-accent text-accent-fg' : 'border-line'}`}>{sp.name}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {c.methods.map((m, mi) => (
                <button key={m.id} onClick={() => choose(v, 'm', mi)} disabled={!!outcome}
                  aria-label={`Method for ${vd.name}: ${m.label}`} aria-pressed={accused[v].m === mi}
                  className={`px-2 py-0.5 rounded-full border text-[11px] ${accused[v].m === mi ? 'border-accent bg-accent text-accent-fg' : 'border-line'}`}>{m.label}</button>
              ))}
            </div>
          </div>
        ))}
        <button onClick={accuse} disabled={!!outcome || !ready} aria-label="Make the accusation"
          className="self-center px-4 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-bold disabled:opacity-40">
          Make the accusation
        </button>
        <p className="text-[10px] text-muted text-center">One accusation only. Alibis cover every victim; marks and traces belong to one body.</p>
      </section>

      <OutcomeBanner outcome={outcome} detail={c.fact}
        winTitle="Case closed." loseTitle={reason ? `Wrong: ${reason}.` : 'The killer walks free.'} />
    </div>
  )
}
