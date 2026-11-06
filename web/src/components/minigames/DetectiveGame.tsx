import { useMemo, useState } from 'react'
import type { MinigameProps } from '@/games/types'
import { OutcomeBanner, TimerBar, useGameOutcome, useGameTimer } from './_shared'
import { CASES, contradicts, generate, isCorrect, solution, type Evidence } from './detective/model'
import Scene from './detective/Scene'

// Detective: find the trick.  Three stages, free to move between:
//   Scene      tap the things in the room; some bear traces of how it was done
//   Questions  put each question to everyone and read the answers side by
//              side; press a statement with the clue or the other statement
//              that proves it false
//   Accuse     name the killer and the method (and from D3 the trick)
// A wrong press costs patience; when it runs out the suspects stop talking.
// A wrong accusation loses the case.  See ./detective/model.

export const CONFIG_IDS = Object.keys(CASES)

type Tab = 'scene' | 'ask' | 'accuse'

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

const chip = (on: boolean, extra = '') =>
  `px-2 py-0.5 rounded-full border text-[11px] transition-colors ${on ? 'border-accent bg-accent text-accent-fg' : 'border-line'} ${extra}`

export default function DetectiveGame({ configId, difficulty, seed, onWin, onLose }: MinigameProps) {
  const c = useMemo(() => generate(configId, difficulty, seed), [configId, difficulty, seed])
  const [tab, setTab] = useState<Tab>('scene')
  const [examined, setExamined] = useState<Set<string>>(() => new Set())
  const [selected, setSelected] = useState<string | undefined>()
  const [q, setQ] = useState(0)
  const [pressing, setPressing] = useState<number | null>(null)
  const [exposed, setExposed] = useState<Record<string, true>>({})
  const [slips, setSlips] = useState(0)
  const [shake, setShake] = useState<string | null>(null)
  const [accused, setAccused] = useState<{ s?: number; m?: number; trick?: number }>({})
  const { outcome, reason, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 1800 })
  const timer = useGameTimer({ seconds: c.tier.seconds, running: !outcome, onExpire: () => lose(`time ran out. ${solution(c)}`) })

  const patience = c.tier.patience - slips
  const found = c.clueIds.filter(id => examined.has(id))
  const lies = Object.keys(exposed).length
  const done = !!outcome

  const examine = (id: string) => {
    if (done) return
    setSelected(id)
    setExamined(prev => (prev.has(id) ? prev : new Set(prev).add(id)))
  }

  const press = (s: number, ev: Evidence) => {
    if (done) return
    const key = `${s}:${q}`
    if (contradicts(c, s, q, ev)) {
      setExposed(prev => ({ ...prev, [key]: true }))
      setPressing(null)
      return
    }
    setShake(key)
    setTimeout(() => setShake(null), 400)
    const next = slips + 1
    setSlips(next)
    if (next >= c.tier.patience) lose(`the suspects stopped talking. ${solution(c)}`)
  }

  const ready = accused.s !== undefined && accused.m !== undefined && (!c.tier.nameTrick || accused.trick !== undefined)
  const accuse = () => {
    if (done || !ready) return
    if (isCorrect(c, accused as { s: number; m: number; trick?: number })) win()
    else lose(`not so. ${solution(c)}`)
  }

  const obj = selected ? c.scene.find(o => o.id === selected) : undefined
  const tabs: { key: Tab; label: string; badge: string }[] = [
    { key: 'scene', label: '1 · Scene', badge: c.tier.countClues ? `${found.length}/${c.clueIds.length}` : `${found.length}` },
    { key: 'ask', label: '2 · Questions', badge: lies ? `${lies} ${lies === 1 ? 'lie' : 'lies'}` : '' },
    { key: 'accuse', label: '3 · Accuse', badge: '' },
  ]

  return (
    <div className="flex flex-col gap-3">
      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}

      <div className="text-center px-2">
        <p className="text-accent font-bold text-sm">{c.title}</p>
        <p className="text-muted text-[11px] uppercase tracking-wide">{c.setting}</p>
        <p className="text-xs leading-snug mt-1">{c.intro}</p>
      </div>

      <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-xs flex items-center justify-between gap-2">
        <p><b>{c.victim.name}</b>, {c.victim.role}, found dead {c.victim.foundAt}.</p>
        <div className="flex items-center gap-0.5 shrink-0" aria-label={`Patience: ${patience} of ${c.tier.patience}`} title="Wrong presses you can afford">
          {Array.from({ length: c.tier.patience }, (_, i) => <Lamp key={i} lit={i < patience} />)}
        </div>
      </div>

      <div className="flex gap-1" role="tablist">
        {tabs.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`flex-1 px-2 py-1.5 rounded-lg border text-[11px] font-semibold ${tab === t.key ? 'border-accent text-accent bg-accent/10' : 'border-line text-muted'}`}>
            {t.label}{t.badge && <span className="ml-1 font-normal opacity-80">({t.badge})</span>}
          </button>
        ))}
      </div>

      {tab === 'scene' && (
        <section className="flex flex-col gap-2">
          <Scene palette={c.palette} objects={c.scene} examined={examined} selected={selected} onExamine={examine} disabled={done} />
          {obj
            ? (
              <div className={`rounded-lg border px-2 py-1.5 text-xs leading-snug ${obj.clue ? 'border-amber-400/70 bg-amber-400/10' : 'border-line bg-panel'}`}>
                <p className="text-[10px] uppercase tracking-wide text-muted">{obj.clue ? '★ Clue · ' : ''}{obj.name}</p>
                <p>{obj.look}</p>
              </div>
            )
            : <p className="text-[11px] text-muted">Tap anything in the room to look closely. {c.tier.countClues ? `${c.clueIds.length} things here carry a trace of what happened.` : 'Some things here carry a trace of what happened.'}</p>}
          {found.length > 0 && (
            <div className="flex flex-wrap gap-1" aria-label="Clues found">
              {found.map(id => {
                const o = c.scene.find(x => x.id === id)!
                return <button key={id} onClick={() => setSelected(id)} className={chip(selected === id, 'border-amber-400/60')}>★ {o.name}</button>
              })}
            </div>
          )}
        </section>
      )}

      {tab === 'ask' && (
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Questions">
            {c.questions.map((text, i) => (
              <button key={i} role="tab" aria-selected={q === i} onClick={() => { setQ(i); setPressing(null) }} className={chip(q === i)}>{text}</button>
            ))}
          </div>
          <ul className="flex flex-col gap-1.5" aria-label={`Answers to: ${c.questions[q]}`}>
            {c.suspects.map((sp, s) => {
              const key = `${s}:${q}`
              const isLie = !!exposed[key]
              const on = pressing === s
              return (
                <li key={s}>
                  <button onClick={() => !done && !isLie && setPressing(on ? null : s)} disabled={done || isLie}
                    aria-label={`${sp.name}'s answer`} aria-pressed={on}
                    className={`w-full text-left rounded-lg border px-2 py-1.5 text-xs leading-snug transition-transform
                      ${isLie ? 'border-red-500/60 bg-red-500/10' : on ? 'border-accent bg-accent/10' : 'border-line bg-panel'}
                      ${shake === key ? 'ring-2 ring-red-500' : ''}`}>
                    <p className="text-[10px] uppercase tracking-wide text-muted">
                      {sp.name} · {sp.role}{isLie && <span className="ml-1 text-red-600 font-bold">LIE</span>}
                    </p>
                    <p>“{c.statements[s][q].text}”</p>
                    {isLie && <p className="text-[11px] text-red-700 mt-0.5">{c.statements[s][q].lie!.why}</p>}
                  </button>
                  {on && !done && (
                    <div className="mt-1 ml-2 rounded-lg border border-accent/40 p-1.5 text-[11px]">
                      <p className="text-muted mb-1">That cannot be true, because of…</p>
                      <div className="flex flex-wrap gap-1">
                        {found.map(id => (
                          <button key={id} onClick={() => press(s, { kind: 'object', id })} className={chip(false, 'border-amber-400/60')}
                            aria-label={`Press with ${c.scene.find(o => o.id === id)!.name}`}>★ {c.scene.find(o => o.id === id)!.name}</button>
                        ))}
                        {c.suspects.map((o, os) => os !== s && (
                          <button key={os} onClick={() => press(s, { kind: 'statement', s: os, q })} className={chip(false)}
                            aria-label={`Press with ${o.name}'s answer`}>{o.name}'s answer</button>
                        ))}
                      </div>
                      {found.length === 0 && <p className="text-muted mt-1">No clues in hand yet: look round the scene first.</p>}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="text-[10px] text-muted">Only the killer lies. Each wrong press costs a lamp.</p>
        </section>
      )}

      {tab === 'accuse' && (
        <section className="rounded-xl border border-accent/40 p-2 flex flex-col gap-2">
          <p className="text-[11px] font-bold">Who killed {c.victim.name}?</p>
          <div className="flex flex-wrap gap-1">
            {c.suspects.map((sp, s) => (
              <button key={s} onClick={() => !done && setAccused(a => ({ ...a, s }))} disabled={done}
                aria-label={`Culprit: ${sp.name}`} aria-pressed={accused.s === s} className={chip(accused.s === s)}>{sp.name}</button>
            ))}
          </div>
          {accused.s !== undefined && <p className="text-[11px] text-muted">{c.suspects[accused.s].profile}</p>}
          <p className="text-[11px] font-bold">With what?</p>
          <div className="flex flex-wrap gap-1">
            {c.methods.map((m, mi) => (
              <button key={m.id} onClick={() => !done && setAccused(a => ({ ...a, m: mi }))} disabled={done}
                aria-label={`Method: ${m.label}`} aria-pressed={accused.m === mi} className={chip(accused.m === mi)}>{m.label}</button>
            ))}
          </div>
          {c.tier.nameTrick && (
            <>
              <p className="text-[11px] font-bold">And how was it done?</p>
              <div className="flex flex-wrap gap-1">
                {c.tricks.map((t, ti) => (
                  <button key={t.id} onClick={() => !done && setAccused(a => ({ ...a, trick: ti }))} disabled={done}
                    aria-label={`Trick: ${t.label}`} aria-pressed={accused.trick === ti} className={chip(accused.trick === ti)}>{t.label}</button>
                ))}
              </div>
            </>
          )}
          <button onClick={accuse} disabled={done || !ready} aria-label="Make the accusation"
            className="self-center px-4 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-bold disabled:opacity-40">
            Make the accusation
          </button>
          <p className="text-[10px] text-muted text-center">One accusation only. The body tells the method; the lies tell the rest.</p>
        </section>
      )}

      <OutcomeBanner outcome={outcome} detail={`${solution(c)} ${c.fact}`}
        winTitle="Case closed." loseTitle={reason ? `Wrong: ${reason}` : 'The killer walks free.'} />
    </div>
  )
}
