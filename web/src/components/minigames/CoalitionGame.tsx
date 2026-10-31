import { useMemo, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { resolveConfig, scale, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar } from './_shared'

// Coalition: the factions of a council each want one of a few concessions,
// and some walk out if a particular concession is granted to anyone.  Grant
// concessions from a limited budget of favour until the factions still with
// you hold enough seats, then call the vote.  Calling it short loses.
//
// Difficulty: less favour to spend and more seats needed; from tier 2 the
// concessions stop previewing who they win and lose, from tier 3 a clock.

export interface Concession { id: string; name: string; cost: number }
export interface Faction {
  id: string
  name: string
  emoji: string
  seats: number
  /** Joins once any one of these is granted… */
  wants: string[]
  /** …unless one of these is granted too. */
  vetoes?: string[]
}

export interface CoalitionConfig {
  title: string
  intro: string
  /** What the favour is called: "ducats", "livres"… */
  currency: string
  factions: Faction[]
  concessions: Concession[]
  /** Favour to spend, per difficulty tier. */
  budget: readonly [number, number, number, number]
  /** Seats needed to carry the vote, per difficulty tier. */
  need: readonly [number, number, number, number]
  fact: string
}

export const CONFIGS: Record<string, CoalitionConfig> = {
  'spanish-court': {
    title: 'The Court at Santa Fe',
    intro: 'Granada is about to fall and Columbus is back with his westward plan. Find terms enough of the court can live with before he rides off to France.',
    currency: 'favour',
    factions: [
      { id: 'columbus', name: 'Columbus',               emoji: '⛵', seats: 4, wants: ['admiral', 'tenth'] },
      { id: 'santangel', name: 'Santángel, the Purse',  emoji: '💰', seats: 4, wants: ['hermandad', 'genoa'] },
      { id: 'talavera', name: "Talavera's Scholars",    emoji: '📜', seats: 3, wants: ['granada', 'mission'], vetoes: ['tenth'] },
      { id: 'grandees', name: 'Castilian Grandees',     emoji: '🏰', seats: 4, wants: ['palos', 'granada'], vetoes: ['admiral'] },
      { id: 'ferdinand', name: 'Ferdinand of Aragon',   emoji: '👑', seats: 5, wants: ['hermandad', 'palos'], vetoes: ['genoa'] },
      { id: 'church', name: 'The Church',               emoji: '⛪', seats: 2, wants: ['mission'] },
    ],
    concessions: [
      { id: 'admiral',   name: 'Make him Admiral of the Ocean Sea', cost: 2 },
      { id: 'tenth',     name: 'Grant him a tenth of all trade',    cost: 3 },
      { id: 'hermandad', name: 'Lend from the Santa Hermandad',     cost: 3 },
      { id: 'genoa',     name: 'Admit Genoese investors',           cost: 2 },
      { id: 'granada',   name: 'Wait until Granada falls',          cost: 1 },
      { id: 'mission',   name: 'Pledge to carry the faith west',    cost: 2 },
      { id: 'palos',     name: 'Make Palos pay its fine in ships',  cost: 2 },
    ],
    budget: [9, 8, 7, 6],
    need:   [13, 15, 17, 18],
    fact: "In January 1492 the court rejected Columbus's terms and he rode away; Luis de Santángel persuaded Isabel to recall him, offering to raise the money himself, partly as a loan from the Santa Hermandad. The Capitulations of Santa Fe made Columbus Admiral of the Ocean Sea with a tenth of the profits, and the town of Palos was ordered to supply two caravels to settle a debt to the crown.",
  },
  'estates-general': {
    title: 'The Estates-General',
    intro: 'Versailles, summer 1789. The Third Estate has sworn not to disperse. Offer terms that keep enough of the hall behind the king.',
    currency: 'credit',
    factions: [
      { id: 'bishops',   name: 'The Bishops',          emoji: '⛪', seats: 3, wants: ['tithe'], vetoes: ['head'] },
      { id: 'cures',     name: 'Parish Curés',         emoji: '✝️', seats: 3, wants: ['head', 'tithe'] },
      { id: 'court',     name: 'Court Nobles',         emoji: '🎩', seats: 4, wants: ['exemptions', 'troops'], vetoes: ['feudal'] },
      { id: 'liberals',  name: 'Liberal Nobles',       emoji: '🗽', seats: 3, wants: ['rights', 'feudal'], vetoes: ['troops'] },
      { id: 'third',     name: 'The Third Estate',     emoji: '📢', seats: 6, wants: ['head'], vetoes: ['troops', 'exemptions'] },
      { id: 'parlement', name: 'The Parlements',       emoji: '⚖️', seats: 2, wants: ['necker', 'exemptions'] },
      { id: 'paris',     name: 'The Paris Crowd',      emoji: '🔥', seats: 4, wants: ['necker', 'bread'], vetoes: ['troops'] },
    ],
    concessions: [
      { id: 'head',       name: 'Vote by head, not by order',  cost: 3 },
      { id: 'tithe',      name: 'Keep the church tithe',       cost: 1 },
      { id: 'exemptions', name: "Keep the nobles' tax exemptions", cost: 2 },
      { id: 'feudal',     name: 'Abolish feudal dues',         cost: 3 },
      { id: 'rights',     name: 'Declare the rights of man',   cost: 2 },
      { id: 'necker',     name: 'Recall Necker',               cost: 2 },
      { id: 'bread',      name: 'Cap the price of bread',      cost: 3 },
      { id: 'troops',     name: 'Bring royal troops to Paris', cost: 1 },
    ],
    budget: [10, 9, 8, 7],
    need:   [14, 16, 18, 19],
    fact: "The Estates-General opened on 5 May 1789 with each order voting as a block, so clergy and nobles could outvote the Third Estate two to one. The Third Estate demanded vote by head, declared itself the National Assembly and took the Tennis Court Oath; many parish priests and liberal nobles joined it. Louis XVI's dismissal of Necker and troops massing around Paris helped spark the storming of the Bastille on 14 July.",
  },
  'guards-coup': {
    title: 'The Guards Regiments',
    intro: 'St Petersburg, June 1762. Peter III has made peace with Prussia and is courting his Holstein soldiers. Win enough of the capital to put Catherine on the throne.',
    currency: 'roubles',
    factions: [
      { id: 'izmailovsky', name: 'Izmailovsky Guards',   emoji: '🗡️', seats: 4, wants: ['arrears', 'ranks'] },
      { id: 'semyonovsky', name: 'Semyonovsky Guards',   emoji: '🛡️', seats: 3, wants: ['arrears', 'prussia'] },
      { id: 'preob',       name: 'Preobrazhensky Guards', emoji: '🎖️', seats: 4, wants: ['holstein', 'prussia'], vetoes: ['regency'] },
      { id: 'horse',       name: 'Horse Guards',         emoji: '🐎', seats: 3, wants: ['holstein', 'ranks'] },
      { id: 'church',      name: 'The Holy Synod',       emoji: '☦️', seats: 3, wants: ['churchlands'] },
      { id: 'panin',       name: 'Panin and the Senate', emoji: '🏛️', seats: 3, wants: ['regency', 'churchlands'], vetoes: ['ranks'] },
      { id: 'orlovs',      name: 'The Orlov Brothers',   emoji: '🦅', seats: 2, wants: ['crown'], vetoes: ['regency'] },
    ],
    concessions: [
      { id: 'arrears',     name: "Pay the guards' arrears",       cost: 3 },
      { id: 'prussia',     name: 'Renounce the Prussian peace',   cost: 2 },
      { id: 'holstein',    name: 'Send the Holstein troops home', cost: 2 },
      { id: 'churchlands', name: 'Halt the seizure of church lands', cost: 2 },
      { id: 'ranks',       name: 'Promote the conspirators',      cost: 2 },
      { id: 'regency',     name: 'Rule only as regent for Paul',  cost: 1 },
      { id: 'crown',       name: 'Proclaim Catherine empress',    cost: 1 },
    ],
    budget: [9, 8, 7, 6],
    need:   [13, 17, 19, 17],
    fact: "On 28 June 1762 Catherine rode to the Izmailovsky barracks, where the Orlov brothers had prepared the ground; the Semyonovsky and Preobrazhensky regiments followed and she was proclaimed empress at the Kazan Cathedral. Nikita Panin had hoped she would rule only as regent for her son Paul. Peter III, who had alienated the army by making peace with Prussia and the Church by seizing its lands, abdicated within days.",
  },
  'ndongo-treaty': {
    title: 'The Treaty of Luanda',
    intro: "Luanda, 1622. Nzinga has come to treat with Governor João Correia de Sousa for her brother, King Ngola Mbandi. Choose terms that enough of the room will sign.",
    currency: 'leverage',
    factions: [
      { id: 'governor',  name: 'Governor Correia de Sousa', emoji: '🏛️', seats: 5, wants: ['captives', 'alliance'] },
      { id: 'jesuits',   name: 'The Jesuits',          emoji: '✝️', seats: 3, wants: ['baptism', 'priests'] },
      { id: 'merchants', name: 'Luanda Merchants',     emoji: '⚓', seats: 4, wants: ['trade', 'captives'], vetoes: ['notribute'] },
      { id: 'camara',    name: 'The Town Council',     emoji: '🏘️', seats: 3, wants: ['alliance'], vetoes: ['ambaca'] },
      { id: 'makota',    name: 'The Ndongo Nobles',    emoji: '👑', seats: 4, wants: ['ambaca', 'notribute'], vetoes: ['trade'] },
      { id: 'captains',  name: 'Portuguese Captains',  emoji: '⚔️', seats: 3, wants: ['alliance', 'trade'], vetoes: ['ambaca'] },
    ],
    concessions: [
      { id: 'baptism',   name: 'Nzinga accepts baptism',            cost: 1 },
      { id: 'priests',   name: 'Admit missionaries to Ndongo',      cost: 2 },
      { id: 'captives',  name: 'Return runaway Portuguese captives', cost: 2 },
      { id: 'alliance',  name: 'Fight the Imbangala together',      cost: 3 },
      { id: 'trade',     name: 'Open Ndongo markets to Luanda',     cost: 3 },
      { id: 'ambaca',    name: 'Portugal abandons the Ambaca fort', cost: 2 },
      { id: 'notribute', name: 'Ndongo an ally, paying no tribute', cost: 2 },
    ],
    budget: [8, 7, 6, 6],
    need:   [12, 17, 17, 18],
    fact: "Received in Luanda without a chair, Nzinga had a servant kneel so she could sit level with the governor. She argued that Ndongo should be an ally rather than a tributary, agreed to return Portuguese captives, and was baptised Ana de Sousa with the governor as godfather. Portugal promised to withdraw from the Ambaca fort, a promise it never kept.",
  },
}

// ── Engine ─────────────────────────────────────────────────────────────────────

/** Factions that back you given the concessions granted. */
export function coalitionOf(cfg: CoalitionConfig, granted: ReadonlySet<string>): Set<string> {
  const out = new Set<string>()
  for (const f of cfg.factions) {
    if (f.wants.some(w => granted.has(w)) && !(f.vetoes ?? []).some(v => granted.has(v))) out.add(f.id)
  }
  return out
}

export function seatsOf(cfg: CoalitionConfig, granted: ReadonlySet<string>): number {
  const members = coalitionOf(cfg, granted)
  return cfg.factions.reduce((a, f) => a + (members.has(f.id) ? f.seats : 0), 0)
}

export const costOf = (cfg: CoalitionConfig, granted: ReadonlySet<string>) =>
  cfg.concessions.reduce((a, c) => a + (granted.has(c.id) ? c.cost : 0), 0)

export function coalitionPlan(cfg: CoalitionConfig, d: Difficulty) {
  return { budget: cfg.budget[d - 1], need: cfg.need[d - 1], seconds: scale(d, [0, 0, 90, 60]), preview: d === 1 }
}

/** Every set of concessions within budget that carries the vote. */
export function solutions(cfg: CoalitionConfig, budget: number, need: number): string[][] {
  const ids = cfg.concessions.map(c => c.id)
  const out: string[][] = []
  for (let mask = 0; mask < 1 << ids.length; mask++) {
    const granted = new Set(ids.filter((_, i) => mask & (1 << i)))
    if (costOf(cfg, granted) <= budget && seatsOf(cfg, granted) >= need) out.push([...granted])
  }
  return out
}

/** A naive negotiator: keep granting the cheapest concession that adds seats. */
export function greedyCheapest(cfg: CoalitionConfig, budget: number): number {
  const granted = new Set<string>()
  const byCost = [...cfg.concessions].sort((a, b) => a.cost - b.cost)
  for (;;) {
    const seats = seatsOf(cfg, granted), spent = costOf(cfg, granted)
    const next = byCost.find(c => !granted.has(c.id) && spent + c.cost <= budget && seatsOf(cfg, new Set([...granted, c.id])) > seats)
    if (!next) return seats
    granted.add(next.id)
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CoalitionGame({ configId, difficulty, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'spanish-court')
  const { budget, need, seconds, preview } = coalitionPlan(cfg, difficulty)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const timer = useGameTimer({ seconds, running: !settled, onExpire: () => lose('the council adjourned') })

  const [granted, setGranted] = useState<Set<string>>(() => new Set())
  const [hover, setHover] = useState<string | null>(null)

  const members = useMemo(() => coalitionOf(cfg, granted), [cfg, granted])
  const seats = useMemo(() => seatsOf(cfg, granted), [cfg, granted])
  const spent = costOf(cfg, granted)
  const total = cfg.factions.reduce((a, f) => a + f.seats, 0)
  const nameOf = (id: string) => cfg.concessions.find(c => c.id === id)?.name ?? id

  // What toggling the hovered concession would change, for the tier-1 preview.
  const delta = useMemo(() => {
    if (!preview || !hover) return null
    const next = new Set(granted)
    if (next.has(hover)) next.delete(hover); else next.add(hover)
    const after = coalitionOf(cfg, next)
    return { join: new Set([...after].filter(id => !members.has(id))), leave: new Set([...members].filter(id => !after.has(id))) }
  }, [preview, hover, granted, cfg, members])

  const toggle = (id: string, cost: number) => {
    if (settled) return
    const next = new Set(granted)
    if (next.has(id)) next.delete(id)
    else if (spent + cost <= budget) next.add(id)
    else return
    setGranted(next)
  }

  const callVote = () => {
    if (settled) return
    if (seats >= need) win(); else lose('the motion fails')
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <p className="shrink-0 text-[10px] text-muted text-right">
          {cfg.currency}<br />
          <b className="text-ink text-sm tabular-nums">{budget - spent}</b> / {budget}
        </p>
      </div>

      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}

      {/* Seat bar: each backing faction is a segment; the tick marks the seats needed. */}
      <div className="flex flex-col gap-1">
        <div className="relative h-3 bg-panel rounded-full overflow-hidden flex">
          {cfg.factions.filter(f => members.has(f.id)).map((f, i) => (
            <div key={f.id} className="h-full transition-all duration-500"
              style={{ width: `${(f.seats / total) * 100}%`, background: i % 2 ? '#d97706' : '#f59e0b' }} />
          ))}
          <div className="absolute top-0 bottom-0 w-0.5 bg-ink/60" style={{ left: `${(need / total) * 100}%` }} />
        </div>
        <p className="text-[10px] text-muted">
          <b className={seats >= need ? 'text-emerald-700' : 'text-ink'}>{seats}</b> of {total} seats with you · {need} needed
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {cfg.factions.map(f => {
          const isIn = members.has(f.id)
          const walked = !isIn && f.wants.some(w => granted.has(w))
          const joins = delta?.join.has(f.id), leaves = delta?.leave.has(f.id)
          return (
            <div key={f.id}
              className={`flex flex-col gap-0.5 p-2 rounded-xl border transition-all
                ${isIn ? 'border-accent/50 bg-accent/10' : walked ? 'border-red-500/30 bg-red-500/5' : 'border-line bg-panel'}
                ${joins ? 'ring-2 ring-emerald-500/60' : leaves ? 'ring-2 ring-red-500/60' : ''}`}>
              <div className="flex items-center gap-1.5">
                <span className="text-lg leading-none">{f.emoji}</span>
                <span className="text-ink text-xs font-semibold leading-tight flex-1">{f.name}</span>
                <span className="text-[10px] font-bold text-muted tabular-nums">{f.seats}</span>
              </div>
              <p className="text-[10px] text-muted leading-snug">
                Wants: {f.wants.map(nameOf).join(' or ')}
              </p>
              {f.vetoes?.length ? (
                <p className="text-[10px] text-red-700/80 leading-snug">Walks out if: {f.vetoes.map(nameOf).join(' or ')}</p>
              ) : null}
              <span className={`text-[9px] font-bold uppercase tracking-wider ${isIn ? 'text-accent' : walked ? 'text-red-600' : 'text-muted/70'}`}>
                {isIn ? 'With you' : walked ? 'Walked out' : 'Unconvinced'}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-muted text-[10px] uppercase tracking-widest">Concessions</p>
        {cfg.concessions.map(c => {
          const on = granted.has(c.id)
          const affordable = on || spent + c.cost <= budget
          return (
            <button key={c.id} onClick={() => toggle(c.id, c.cost)} disabled={settled || !affordable}
              onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-all
                ${on ? 'border-accent bg-accent/15 text-ink' : 'border-line bg-panel text-ink-2'}
                ${affordable && !settled ? 'hover:border-accent/50 cursor-pointer' : 'opacity-40 cursor-default'}`}>
              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] ${on ? 'bg-accent border-accent text-accent-fg' : 'border-line-2'}`}>{on ? '✓' : ''}</span>
              <span className="flex-1">{c.name}</span>
              <span className="text-[10px] text-muted tabular-nums">{c.cost}</span>
            </button>
          )
        })}
      </div>

      <button onClick={callVote} disabled={settled}
        className="px-4 py-2 rounded-xl bg-accent text-accent-fg font-bold text-sm hover:bg-accent-hover transition-all disabled:opacity-50">
        Call the vote ({seats}/{need})
      </button>

      <p className="text-[10px] text-muted/80 text-center">
        A faction backs you once it gets one thing it wants — unless you also grant something it cannot stomach.
        {preview ? ' Hover a concession to see who it wins and loses.' : ''}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="The motion carries!" loseTitle="The motion fails" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
