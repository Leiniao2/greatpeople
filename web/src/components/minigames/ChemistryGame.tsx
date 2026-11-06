import { useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { useGameOutcome, OutcomeBanner, useGameTimer, TimerBar, storyText } from './_shared'
import {
  CONFIGS, INDICATORS, balanceTier, titrationTier, pickReactions, pickMolarity, targetMl,
  tally, sideMass, isBalanced, isLowest, pretty, pHAt, mixColour,
  type BalanceConfig, type TitrationConfig, type Reaction,
} from './chemistry/model'

// The Chemistry lab: real reactions only.  Two benches, chosen by config:
//
//   balance    Set the coefficients so every element counts the same on both
//              sides (conservation of atoms); the answer is the smallest
//              whole numbers, found by exact elimination in the model.
//   titration  Drip titrant from a burette into the sample and call the
//              endpoint where the indicator turns; the colour comes from the
//              solution's real pH (charge balance with textbook pKa values).
//
//   tier  balance                                  titration
//   D1    1 reaction, live atom count and scale    pH meter, indicator given, ±0.5 mL
//   D2    2 reactions, live atom count, 4 misses   pH meter, unknown strength, ±0.3 mL, 4 runs
//   D3    2 reactions, scale only, 3 weighings,    no meter, pick the indicator, ±0.2 mL, 3 runs
//         3 misses, 4 min
//   D4    3 harder reactions, no live readings,    no meter, pick the indicator, ±0.15 mL, 2 runs
//         2 weighings, 2 misses, 5 min

export { CONFIGS, CONFIG_IDS } from './chemistry/model'

export default function ChemistryGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const id = CONFIGS[configId] ? configId : 'clay-type'
  const cfg = { ...CONFIGS[id], ...storyText(params) }
  return cfg.mode === 'balance'
    ? <BalanceLab cfg={cfg} configId={id} difficulty={difficulty} seed={seed} onWin={onWin} onLose={onLose} />
    : <TitrationLab cfg={cfg} configId={id} difficulty={difficulty} seed={seed} onWin={onWin} onLose={onLose} />
}

interface LabProps<C> { cfg: C; configId: string; difficulty: Difficulty; seed: number; onWin: () => void; onLose: (why?: string) => void }

function Header({ title, intro }: { title: string; intro: string }) {
  return (
    <div>
      <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{title}</p>
      <p className="text-muted text-xs leading-relaxed">{intro}</p>
    </div>
  )
}

// ── Balancing ─────────────────────────────────────────────────────────────────

function Scale({ left, right }: { left: number; right: number }) {
  const diff = right - left
  const tilt = Math.max(-14, Math.min(14, (diff / Math.max(left, right, 1)) * 40))
  const level = Math.abs(diff) < 0.01
  return (
    <div className="flex items-center gap-2" data-testid="chem-scale">
      <svg viewBox="0 0 120 52" className="w-28 h-12 shrink-0" aria-label={level ? 'the scale is level' : 'the scale tips'}>
        <path d="M60 22 L52 48 L68 48 Z" fill="currentColor" className="text-line-2" />
        <g transform={`rotate(${tilt} 60 20)`}>
          <line x1="12" y1="20" x2="108" y2="20" stroke="currentColor" strokeWidth="3" className="text-ink-2" />
          <path d="M4 22 h16 l-3 8 h-10 z" fill="currentColor" className={level ? 'text-emerald-600' : 'text-accent'} />
          <path d="M100 22 h16 l-3 8 h-10 z" fill="currentColor" className={level ? 'text-emerald-600' : 'text-accent'} />
        </g>
      </svg>
      <p className="text-[11px] text-ink-2 leading-snug tabular-nums">
        Reactants {left.toFixed(1)} g<br />Products {right.toFixed(1)} g
        <span className="block text-muted">{level ? 'Masses agree.' : 'Masses differ.'}</span>
      </p>
    </div>
  )
}

function AtomTable({ r, coefs, label }: { r: Reaction; coefs: number[]; label?: string }) {
  const { left, right, elements } = tally(r, coefs)
  return (
    <div className="rounded-xl border border-line bg-panel p-2" data-testid="chem-atoms">
      {label && <p className="text-[10px] text-muted mb-1">{label}</p>}
      <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-x-3 gap-y-0.5 text-xs tabular-nums">
        <span className="text-[10px] text-muted">Atom</span><span className="text-[10px] text-muted">Left</span><span className="text-[10px] text-muted">Right</span><span />
        {elements.map(el => {
          const ok = (left[el] ?? 0) === (right[el] ?? 0)
          return [
            <span key={`${el}e`} className="font-bold text-ink">{el}</span>,
            <span key={`${el}l`}>{left[el] ?? 0}</span>,
            <span key={`${el}r`}>{right[el] ?? 0}</span>,
            <span key={`${el}k`} className={ok ? 'text-emerald-700' : 'text-red-700'}>{ok ? '✓' : '✗'}</span>,
          ]
        })}
      </div>
    </div>
  )
}

function BalanceLab({ cfg, configId, difficulty, seed, onWin, onLose }: LabProps<BalanceConfig>) {
  const tier = balanceTier(difficulty)
  const reactions = useMemo(() => pickReactions(cfg, configId, difficulty, seed), [cfg, configId, difficulty, seed])
  const [round, setRound] = useState(0)
  const r = reactions[round]
  const n = r.reactants.length + r.products.length
  const [coefs, setCoefs] = useState<number[]>(() => Array(n).fill(1))
  const [fails, setFails] = useState(0)
  const [weighs, setWeighs] = useState(tier.weighs)
  const [snapshot, setSnapshot] = useState<number[] | null>(null)
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState<string[]>([])
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const timer = useGameTimer({ seconds: tier.seconds, running: !settled, onExpire: () => lose('Out of time') })

  const setCoef = (k: number, v: number) => {
    if (settled) return
    setCoefs(c => c.map((x, i) => (i === k ? Math.max(1, Math.min(99, Math.round(v) || 1)) : x)))
    setMsg('')
  }

  const weigh = () => {
    if (settled || weighs <= 0) return
    setWeighs(w => w - 1)
    setSnapshot([...coefs])
  }

  const react = () => {
    if (settled) return
    if (isBalanced(r, coefs) && isLowest(coefs)) {
      const line = `${r.name}: ${equationText(r, coefs)}`
      setDone(d => [...d, line])
      if (round + 1 >= reactions.length) { setMsg(''); win(); return }
      const next = reactions[round + 1]
      setRound(round + 1)
      setCoefs(Array(next.reactants.length + next.products.length).fill(1))
      setWeighs(tier.weighs)
      setSnapshot(null)
      setMsg('Balanced! Next reaction.')
      return
    }
    const f = fails + 1
    setFails(f)
    if (isBalanced(r, coefs)) {
      const g = coefs.reduce((a, b) => gcd(a, b))
      setMsg(`Balanced, but every number divides by ${g}. Use the smallest whole numbers.`)
    } else if (tier.liveAtoms) {
      setMsg('Not balanced yet: the atom count shows which elements differ.')
    } else {
      setMsg('Not balanced: some element counts differ between the two sides.')
    }
    if (f >= tier.fails) lose('Too many unbalanced reactions')
  }

  const { left, right } = tally(r, coefs)
  const atomsShown = tier.liveAtoms ? coefs : snapshot
  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4 w-full max-w-[460px] mx-auto">
      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}
      <Header title={cfg.title} intro={cfg.intro} />

      <div className="flex items-center justify-between text-[11px] text-muted">
        <span data-testid="chem-round">Reaction {round + 1} of {reactions.length}</span>
        {Number.isFinite(tier.fails) && <span className={tier.fails - fails <= 1 ? 'text-red-600 font-bold' : ''}>Misses left: {tier.fails - fails}</span>}
      </div>
      <p className="text-sm font-bold text-ink -mt-2">{r.name}</p>

      <div className="flex flex-wrap items-end justify-center gap-x-1.5 gap-y-2 rounded-xl border border-line bg-panel p-2" data-testid="chem-equation">
        {[...r.reactants, ...r.products].map((f, k) => (
          <div key={`${round}-${k}`} className="flex items-end gap-1.5">
            {k === r.reactants.length && <span className="text-lg text-ink-2 pb-1">→</span>}
            {k > 0 && k !== r.reactants.length && <span className="text-lg text-ink-2 pb-1">+</span>}
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center rounded-lg border border-line bg-paper">
                <button type="button" aria-label={`fewer ${f}`} onClick={() => setCoef(k, coefs[k] - 1)} disabled={settled}
                  className="w-7 h-8 text-ink-2 text-base active:scale-95">−</button>
                <input aria-label={`coefficient of ${f}`} data-species={f} inputMode="numeric" value={coefs[k]} disabled={settled}
                  onChange={e => setCoef(k, Number(e.target.value.replace(/\D/g, '')))}
                  className="w-8 h-8 text-center font-bold text-accent bg-transparent tabular-nums outline-none" />
                <button type="button" aria-label={`more ${f}`} onClick={() => setCoef(k, coefs[k] + 1)} disabled={settled}
                  className="w-7 h-8 text-ink-2 text-base active:scale-95">+</button>
              </div>
              <span className="text-sm font-bold text-ink">{pretty(f)}</span>
            </div>
          </div>
        ))}
      </div>

      {tier.liveScale && <Scale left={sideMass(left)} right={sideMass(right)} />}
      {atomsShown && <AtomTable r={r} coefs={atomsShown} label={tier.liveAtoms ? undefined : `At your last weighing (${atomsShown.join(', ')})`} />}
      {!tier.liveAtoms && (
        <button type="button" onClick={weigh} disabled={settled || weighs <= 0} data-testid="chem-weigh"
          className={`h-9 rounded-lg border text-xs font-bold ${weighs > 0 ? 'bg-panel border-line text-ink-2' : 'bg-paper border-line text-muted/50'}`}>
          ⚖ Count the atoms ({weighs} left)
        </button>
      )}

      <p data-testid="chem-msg" className="min-h-4 text-xs text-ink-2">{msg}</p>

      {!settled && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setCoefs(Array(n).fill(1))}
            className="flex-1 py-2.5 rounded-xl border border-line text-muted text-sm">Reset</button>
          <button type="button" onClick={react} data-testid="chem-react"
            className="flex-1 py-2.5 rounded-xl bg-accent text-accent-fg font-bold text-sm">React ⚗</button>
        </div>
      )}

      {done.length > 0 && (
        <ul className="text-[11px] text-ink-2 leading-snug flex flex-col gap-0.5">
          {done.map(l => <li key={l}>✓ {l}</li>)}
        </ul>
      )}

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Every atom accounted for!" loseTitle={reason ?? 'The reaction will not balance'} />
    </div>
  )
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)

export function equationText(r: Reaction, coefs: number[]): string {
  const side = (list: string[], off: number) => list.map((f, k) => `${coefs[off + k] === 1 ? '' : coefs[off + k]}${pretty(f)}`).join(' + ')
  return `${side(r.reactants, 0)} → ${side(r.products, r.reactants.length)}`
}

// ── Titration ─────────────────────────────────────────────────────────────────

const BURETTE_ML = 50
const DROP_ML = 0.05
/** Flow with the tap open, in mL per second. */
const FLOW_ML_S = 1

function Burette({ v }: { v: number }) {
  const top = 8, bottom = 148
  const level = top + ((bottom - top) * Math.min(v, BURETTE_ML)) / BURETTE_ML
  return (
    <svg viewBox="0 0 40 180" className="h-44 w-10 shrink-0" aria-label={`burette reading ${v.toFixed(2)} mL`}>
      <rect x="14" y={top} width="12" height={bottom - top} rx="2" fill="none" stroke="currentColor" className="text-line-2" />
      <rect x="15" y={level} width="10" height={Math.max(0, bottom - level)} fill="#9cc7e8" opacity={0.8} />
      {Array.from({ length: 11 }, (_, i) => (
        <g key={i}>
          <line x1="26" x2="30" y1={top + ((bottom - top) * i) / 10} y2={top + ((bottom - top) * i) / 10} stroke="currentColor" className="text-muted" />
          <text x="31" y={top + ((bottom - top) * i) / 10 + 3} fontSize="6" fill="currentColor" className="text-muted">{i * 5}</text>
        </g>
      ))}
      <path d={`M14 ${bottom} L20 ${bottom + 14} L26 ${bottom}`} fill="none" stroke="currentColor" className="text-line-2" />
      <rect x="11" y={bottom + 12} width="18" height="4" rx="1" fill="currentColor" className="text-ink-2" />
      <line x1="20" y1={bottom + 16} x2="20" y2={bottom + 28} stroke="currentColor" className="text-line-2" strokeWidth="2" />
    </svg>
  )
}

function Flask({ colour }: { colour: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0" aria-label="conical flask">
      <path d="M40 6 h20 v26 l28 54 q4 10 -8 10 h-60 q-12 0 -8 -10 l28 -54 z" fill="none" stroke="currentColor" strokeWidth="2" className="text-line-2" />
      <path d="M24 58 h52 l12 28 q4 10 -8 10 h-60 q-12 0 -8 -10 z" fill={colour} data-testid="chem-flask" style={{ transition: 'fill 0.25s' }} />
    </svg>
  )
}

function TitrationLab({ cfg, configId, difficulty, seed, onWin, onLose }: LabProps<TitrationConfig>) {
  const tier = titrationTier(difficulty)
  const sys = cfg.system
  const molarity = useMemo(() => pickMolarity(cfg, configId, difficulty, seed), [cfg, configId, difficulty, seed])
  const target = useMemo(() => targetMl(cfg, molarity), [cfg, molarity])
  const [indicator, setIndicator] = useState<string | null>(tier.chooseIndicator ? null : sys.indicator)
  const [v, setV] = useState(0)
  const [runs, setRuns] = useState(0)
  const [spoiled, setSpoiled] = useState(false)
  const [msg, setMsg] = useState('')
  const [pouring, setPouring] = useState(false)
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const vRef = useRef(0)
  vRef.current = v

  const ind = indicator ? INDICATORS[indicator] : null
  const pH = pHAt(sys, molarity, v)
  const colour = ind ? mixColour(ind, pH) : '#eef2f3'
  const runsLeft = tier.runs - runs
  const live = !settled && !spoiled && !!ind

  const add = (ml: number) => {
    const next = Math.round((vRef.current + ml) * 100) / 100
    if (next > BURETTE_ML) {
      setPouring(false)
      setV(BURETTE_ML)
      spoil('The burette ran dry before you called the endpoint.')
      return
    }
    vRef.current = next
    setV(next)
  }

  useEffect(() => {
    if (!pouring || !live) return
    const iv = setInterval(() => add(FLOW_ML_S / 10), 100)
    return () => clearInterval(iv)
  }, [pouring, live]) // eslint-disable-line react-hooks/exhaustive-deps

  const spoil = (why: string) => {
    const used = runs + 1
    setRuns(used)
    setSpoiled(true)
    if (used >= tier.runs) { lose('No sample left for another run'); return }
    setMsg(`${why} Refill the flask for another run (${tier.runs - used} left).`)
  }

  const callEndpoint = () => {
    if (!live) return
    setPouring(false)
    const off = v - target
    if (Math.abs(off) <= tier.toleranceMl) {
      const found = (v * sys.titrantM) / (sys.eq * sys.sampleMl)
      setMsg(`Endpoint at ${v.toFixed(2)} mL: the sample is ${found.toFixed(3)} mol/L.`)
      win()
      return
    }
    spoil(off < 0
      ? `Too early: at ${v.toFixed(2)} mL the colour has not truly turned.`
      : `Overshot: the colour turned before ${v.toFixed(2)} mL.`)
  }

  const refill = () => {
    if (settled) return
    setV(0)
    setSpoiled(false)
    setPouring(false)
    setMsg('')
    if (tier.chooseIndicator) setIndicator(null)
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4 w-full max-w-[460px] mx-auto select-none">
      <Header title={cfg.title} intro={cfg.intro} />

      <div className="grid grid-cols-2 gap-1 text-[11px] text-ink-2 rounded-xl border border-line bg-panel p-2">
        <span>Flask: {sys.sampleMl} mL {sys.analyte}{sys.waterMl ? ` + ${sys.waterMl} mL water` : ''}</span>
        <span>Burette: {sys.titrantM} M {sys.titrant === 'NaOH' ? 'sodium hydroxide' : 'hydrochloric acid'}</span>
        <span>Strength: {difficulty === 1 ? `${molarity} mol/L` : 'unknown'}</span>
        {Number.isFinite(tier.runs) && <span className={runsLeft <= 1 ? 'text-red-600 font-bold' : ''}>Runs left: {runsLeft}</span>}
      </div>

      {tier.chooseIndicator && !ind && (
        <div className="flex flex-col gap-1.5" data-testid="chem-indicators">
          <p className="text-xs text-ink-2">Choose an indicator. It must turn where this titration’s pH jumps.</p>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.values(INDICATORS).map(i => (
              <button key={i.id} type="button" data-indicator={i.id} onClick={() => setIndicator(i.id)}
                className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2 py-1.5 text-left active:scale-95">
                <span className="flex">
                  <span className="w-3 h-5 rounded-l" style={{ background: i.acid }} />
                  <span className="w-3 h-5 rounded-r" style={{ background: i.base }} />
                </span>
                <span className="text-[11px] leading-tight"><b className="text-ink">{i.name}</b><br /><span className="text-muted">turns at pH {i.range[0]}–{i.range[1]}</span></span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-end justify-center gap-3">
        <Burette v={v} />
        <div className="flex flex-col items-center gap-1">
          <Flask colour={colour} />
          <p className="text-xs font-bold text-ink tabular-nums" data-testid="chem-reading">{v.toFixed(2)} mL added</p>
          {tier.meter && <p className="text-[11px] text-ink-2 tabular-nums" data-testid="chem-ph">pH meter: {pH.toFixed(2)}</p>}
          {ind && <p className="text-[10px] text-muted">{ind.name}</p>}
        </div>
      </div>

      <p data-testid="chem-msg" className="min-h-4 text-xs text-ink-2">{msg}</p>

      {!settled && (spoiled ? (
        <button type="button" onClick={refill} data-testid="chem-refill"
          className="py-2.5 rounded-xl bg-accent text-accent-fg font-bold text-sm">Refill the flask</button>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <button type="button" data-testid="chem-pour" disabled={!live}
            onPointerDown={() => live && setPouring(true)} onPointerUp={() => setPouring(false)} onPointerLeave={() => setPouring(false)}
            className={`py-2.5 rounded-xl border text-xs font-bold touch-none ${pouring ? 'bg-sky-600 text-white border-sky-600' : 'bg-panel border-line text-ink-2'} disabled:opacity-40`}>
            Hold to pour
          </button>
          <button type="button" data-testid="chem-drop" disabled={!live} onClick={() => add(DROP_ML)}
            className="py-2.5 rounded-xl border border-line bg-panel text-xs font-bold text-ink-2 disabled:opacity-40">One drop</button>
          <button type="button" data-testid="chem-endpoint" disabled={!live} onClick={callEndpoint}
            className="py-2.5 rounded-xl bg-accent text-accent-fg text-xs font-bold disabled:opacity-40">Endpoint!</button>
        </div>
      ))}
      {!settled && !spoiled && v > 0 && (
        <button type="button" onClick={() => spoil('You poured the flask away.')} className="text-[11px] text-muted underline self-center">Start this run again</button>
      )}

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Endpoint found!" loseTitle={reason ?? 'The titration failed'} />
    </div>
  )
}
