import { useEffect, useMemo, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Roll Call: whip a chamber member by member before the vote.  Each day you
// are dealt three pitch cards; play each on a member to move their lean
// toward Aye (+2 when the pitch matches their interest, +1 otherwise).  The
// rival marks two waverers every morning and works on them overnight unless
// you get to them first.  Win a bloc leader over and their followers lean
// your way too.  After the last day the chamber votes seat by seat.

interface Tag { id: string; label: string; icon: string }
interface MemberDef {
  name: string
  tag: string
  lean: number
  /** Index of the bloc leader this member follows. */
  follows?: number
}

interface RollCallConfig {
  title: string
  intro: string
  /** Who works against you each night. */
  rival: string
  tags: Tag[]
  members: MemberDef[]
  /** Ayes needed on the easiest tier; defaults to a bare majority. */
  need?: number
  fact: string
}

export const CONFIGS: Record<string, RollCallConfig> = {
  'roman-senate': {
    title: 'The Nones of December',
    intro: 'Rome, 5 December 63 BCE. Five of Catiline\'s conspirators are under guard. Cicero needs the Senate to vote for the ultimate penalty — and Caesar is arguing for mercy.',
    rival: 'Caesar',
    tags: [
      { id: 'order',     label: 'Order',     icon: '🛡' },
      { id: 'wealth',    label: 'Wealth',    icon: '💰' },
      { id: 'tradition', label: 'Tradition', icon: '🏛' },
      { id: 'glory',     label: 'Glory',     icon: '🦅' },
    ],
    members: [
      { name: 'Cato the Younger',   tag: 'tradition', lean: 0 },
      { name: 'Catulus',            tag: 'tradition', lean: 1, follows: 0 },
      { name: 'Servilius Isauricus',tag: 'tradition', lean: 0, follows: 0 },
      { name: 'Silanus',            tag: 'order',     lean: 1 },
      { name: 'Murena',             tag: 'order',     lean: 0, follows: 3 },
      { name: 'Tiberius Nero',      tag: 'order',     lean: -1, follows: 3 },
      { name: 'Crassus',            tag: 'wealth',    lean: -1 },
      { name: 'Antonius Hybrida',   tag: 'wealth',    lean: -2, follows: 6 },
      { name: 'Hortensius',         tag: 'wealth',    lean: 0, follows: 6 },
      { name: 'Lucullus',           tag: 'glory',     lean: 1 },
      { name: 'Metellus Celer',     tag: 'glory',     lean: 0, follows: 9 },
      { name: 'Metellus Nepos',     tag: 'glory',     lean: -2 },
      { name: 'Calpurnius Piso',    tag: 'wealth',    lean: -1 },
      { name: 'Gellius Publicola',  tag: 'order',     lean: -1 },
    ],
    fact: 'On 5 December 63 BCE the Senate debated the fate of five arrested conspirators. Silanus first called for the ultimate penalty; Caesar proposed life imprisonment and nearly carried the house, until Cato\'s speech swung it back. The five were strangled in the Tullianum that night, and Cicero announced their deaths with one word: "Vixerunt" — they have lived.',
  },
  'athenian-assembly': {
    title: 'The Parthenon Vote',
    intro: 'Athens, c. 447 BCE. Pericles wants the treasury of the Delian League spent on the Acropolis. Thucydides son of Melesias calls it robbing the allies. Win over the tribes of the Assembly.',
    rival: 'Thucydides, son of Melesias',
    tags: [
      { id: 'work',   label: 'Work',   icon: '🔨' },
      { id: 'glory',  label: 'Glory',  icon: '🏛' },
      { id: 'piety',  label: 'Piety',  icon: '🦉' },
      { id: 'thrift', label: 'Thrift', icon: '💰' },
    ],
    members: [
      { name: 'Phidias and the artisans', tag: 'work',   lean: 1 },
      { name: 'The rowers of the fleet',  tag: 'glory',  lean: 0 },
      { name: 'The knights',              tag: 'thrift', lean: -1 },
      { name: 'Priests of Athena Polias', tag: 'piety',  lean: 0 },
      { name: 'Erechtheis',   tag: 'piety',  lean: 0, follows: 3 },
      { name: 'Aigeis',       tag: 'glory',  lean: 1, follows: 1 },
      { name: 'Pandionis',    tag: 'work',   lean: 0, follows: 0 },
      { name: 'Leontis',      tag: 'thrift', lean: -1, follows: 2 },
      { name: 'Akamantis',    tag: 'work',   lean: 0, follows: 0 },
      { name: 'Oineis',       tag: 'glory',  lean: -1, follows: 1 },
      { name: 'Kekropis',     tag: 'piety',  lean: 1 },
      { name: 'Hippothontis', tag: 'thrift', lean: -2, follows: 2 },
      { name: 'Aiantis',      tag: 'glory',  lean: 0 },
      { name: 'Antiochis',    tag: 'thrift', lean: -2 },
    ],
    fact: 'Plutarch records Thucydides son of Melesias attacking the building programme as decking Athens out like a vain woman with the allies\' money. Pericles offered to pay for the works himself if they bore his name; the Assembly told him to spend from the public funds. Around 443 BCE an ostracism sent Thucydides into exile, and work on the Parthenon went on until 432 BCE.',
  },
  'mellon-senate': {
    title: 'The Mellon Plan',
    intro: 'Washington, 1926. Treasury Secretary Andrew Mellon wants the top income-tax rate cut to 25%. The progressive bloc says the rich should keep paying. Count your senators before the roll is called.',
    rival: 'George Norris',
    tags: [
      { id: 'business', label: 'Business', icon: '🏭' },
      { id: 'farms',    label: 'Farms',    icon: '🌾' },
      { id: 'thrift',   label: 'Thrift',   icon: '💵' },
      { id: 'party',    label: 'Party',    icon: '🐘' },
    ],
    members: [
      { name: 'Reed Smoot (R-UT)',          tag: 'party',    lean: 1 },
      { name: 'Charles Curtis (R-KS)',      tag: 'party',    lean: 1, follows: 0 },
      { name: 'David Reed (R-PA)',          tag: 'business', lean: 1, follows: 0 },
      { name: 'George Moses (R-NH)',        tag: 'party',    lean: 0, follows: 0 },
      { name: 'James Watson (R-IN)',        tag: 'business', lean: 0 },
      { name: 'Furnifold Simmons (D-NC)',   tag: 'thrift',   lean: 0 },
      { name: 'Pat Harrison (D-MS)',        tag: 'thrift',   lean: 0, follows: 5 },
      { name: 'Walter George (D-GA)',       tag: 'thrift',   lean: -1, follows: 5 },
      { name: 'Carter Glass (D-VA)',        tag: 'business', lean: -1, follows: 5 },
      { name: 'William Borah (R-ID)',       tag: 'farms',    lean: -1 },
      { name: 'Hiram Johnson (R-CA)',       tag: 'farms',    lean: -1, follows: 9 },
      { name: 'Burton Wheeler (D-MT)',      tag: 'farms',    lean: -2 },
      { name: 'Smith Brookhart (R-IA)',     tag: 'farms',    lean: -2 },
      { name: 'Robert La Follette Jr. (R-WI)', tag: 'farms', lean: -3 },
    ],
    fact: 'The Revenue Act of 1926 cut the top income-tax rate to 25%, down from 73% at the end of the First World War, and passed the Senate with Democrats as well as Republicans voting for it. Mellon had argued in Taxation: The People\'s Business (1924) that lower rates would bring in more revenue by drawing the rich out of tax-exempt bonds.',
  },
  'hittite-panku': {
    title: 'The Edict of Telepinu',
    intro: 'Hattusa, c. 1500 BCE. Generations of murdered kings have soaked the throne in blood. Telepinu proposes a fixed law of succession — and asks the panku, the assembly of nobles, to enforce it.',
    rival: 'Partisans of Huzziya',
    tags: [
      { id: 'law',  label: 'Law',  icon: '⚖' },
      { id: 'land', label: 'Land', icon: '🌾' },
      { id: 'gods', label: 'Gods', icon: '☀' },
      { id: 'army', label: 'Army', icon: '⚔' },
    ],
    members: [
      { name: 'Chief of the Bodyguard',      tag: 'army', lean: 0 },
      { name: 'Chief of the Chariot-fighters', tag: 'army', lean: -1, follows: 0 },
      { name: 'Chief of the Palace Servants',  tag: 'law',  lean: 1 },
      { name: 'Chief of the Cupbearers',       tag: 'law',  lean: 0, follows: 2 },
      { name: 'Chief of the Wine-stewards',    tag: 'land', lean: 0, follows: 2 },
      { name: 'High Priest of Arinna',         tag: 'gods', lean: 1 },
      { name: 'Priest of Zippalanda',          tag: 'gods', lean: 0, follows: 5 },
      { name: 'Priest of Nerik',               tag: 'gods', lean: -1, follows: 5 },
      { name: 'Lord of Hupisna',               tag: 'land', lean: 0 },
      { name: 'Lord of Tuwanuwa',              tag: 'land', lean: -1, follows: 8 },
      { name: 'Lord of Nenassa',               tag: 'land', lean: -1, follows: 8 },
      { name: 'Governor of Hurma',             tag: 'army', lean: -2 },
      { name: 'Lord of Zalpa',                 tag: 'army', lean: -2 },
      { name: 'Lord of Lawazantiya',           tag: 'law',  lean: -1 },
    ],
    fact: 'The Edict of Telepinu (c. 1500 BCE) fixed the order of succession: a first-rank son of the king, then a second-rank son, and failing sons, the husband of a first-rank daughter. It also made the panku a court that could try any member of the royal family who shed the blood of kin — even the king himself.',
  },
}

// ── Engine ─────────────────────────────────────────────────────────────────────

export const HAND_SIZE = 3
export const MARKS_PER_DAY = 2

export interface Chamber {
  lean: number[]
  /** Leaders whose bloc has already followed them. */
  fired: boolean[]
  /** Members the rival will work on tonight. */
  marks: number[]
}

export interface RollCallBoard { chamber: Chamber; hands: string[][] }

export const daysFor = (d: Difficulty) => scale(d, [4, 4, 4, 3])
export const damageFor = (d: Difficulty) => scale(d, [1, 2, 2, 2])
export const needFor = (cfg: RollCallConfig, d: Difficulty) =>
  (cfg.need ?? Math.floor(cfg.members.length / 2) + 1) + scale(d, [0, 0, 1, 1])

const clampLean = (l: number) => Math.max(-3, Math.min(3, l))

export const followersOf = (cfg: RollCallConfig, i: number) =>
  cfg.members.map((m, j) => (m.follows === i ? j : -1)).filter(j => j >= 0)

/** The two members the rival works on: swing votes (lean 0 or +1), biggest blocs first. */
export function rivalTargets(cfg: RollCallConfig, lean: readonly number[]): number[] {
  // Swing votes first, then soft Ayes, then soft Nays; within a tier, biggest bloc, then leaning Aye.
  const tier = (l: number) => (l === 0 || l === 1 ? 0 : l === 2 ? 1 : 2)
  return lean
    .map((l, i) => ({ i, l, f: followersOf(cfg, i).length }))
    .filter(x => x.l >= -1 && x.l <= 2)
    .sort((a, b) => tier(a.l) - tier(b.l) || b.f - a.f || b.l - a.l || a.i - b.i)
    .slice(0, MARKS_PER_DAY)
    .map(x => x.i)
}

export const pitchGain = (cfg: RollCallConfig, tag: string, member: number) =>
  cfg.members[member].tag === tag ? 2 : 1

/** Play one pitch card on a member: raise their lean, shield them, and cascade a leader's bloc. */
export function applyPitch(cfg: RollCallConfig, c: Chamber, tag: string, member: number): Chamber {
  const lean = [...c.lean], fired = [...c.fired]
  lean[member] = clampLean(lean[member] + pitchGain(cfg, tag, member))
  const marks = c.marks.filter(m => m !== member)
  const followers = followersOf(cfg, member)
  if (followers.length && !fired[member] && lean[member] >= 1) {
    fired[member] = true
    for (const f of followers) lean[f] = clampLean(lean[f] + 1)
  }
  return { lean, fired, marks }
}

/** Night falls: the rival works on every member still marked. */
export function endDay(c: Chamber, damage: number): Chamber {
  const lean = c.lean.map((l, i) => (c.marks.includes(i) ? clampLean(l - damage) : l))
  return { lean, fired: c.fired, marks: [] }
}

export const startDay = (cfg: RollCallConfig, c: Chamber): Chamber => ({ ...c, marks: rivalTargets(cfg, c.lean) })

export type Vote = 'aye' | 'nay' | 'abstain'
export const voteOf = (l: number): Vote => (l > 0 ? 'aye' : l < 0 ? 'nay' : 'abstain')

export function tallyVotes(lean: readonly number[]) {
  const votes = lean.map(voteOf)
  return { aye: votes.filter(v => v === 'aye').length, nay: votes.filter(v => v === 'nay').length }
}

/** Score of a chamber as it would stand after tonight's rival work; used by the greedy whip. */
function projectedScore(c: Chamber, damage: number): number {
  return endDay(c, damage).lean.reduce((s, l) => s + (l > 0 ? 10 : l === 0 ? 3 : 0) + Math.min(l, 2), 0)
}

/** The greedy whip's choice for one card: the (card, member) pair with the best projected chamber. */
export function greedyPitch(cfg: RollCallConfig, c: Chamber, hand: readonly string[], damage: number): { card: number; member: number } {
  let best = { card: 0, member: 0 }, bestScore = -Infinity
  hand.forEach((tag, card) => {
    for (let m = 0; m < cfg.members.length; m++) {
      const s = projectedScore(applyPitch(cfg, c, tag, m), damage)
      if (s > bestScore) { bestScore = s; best = { card, member: m } }
    }
  })
  return best
}

/** Play a whole session out; `whip` false plays no cards at all. Returns the final ayes. */
export function playOut(cfg: RollCallConfig, board: RollCallBoard, difficulty: Difficulty, whip: boolean): number {
  const damage = damageFor(difficulty)
  let c = board.chamber
  for (const dealt of board.hands) {
    c = startDay(cfg, c)
    const hand = [...dealt]
    while (whip && hand.length) {
      const { card, member } = greedyPitch(cfg, c, hand, damage)
      c = applyPitch(cfg, c, hand[card], member)
      hand.splice(card, 1)
    }
    c = endDay(c, damage)
  }
  return tallyVotes(c.lean).aye
}

function rollBoard(cfg: RollCallConfig, seed: number, difficulty: Difficulty): RollCallBoard {
  const rng = mulberry32(seed)
  const lean = cfg.members.map(m => {
    const r = rng()
    return clampLean(m.lean + (r < 0.2 ? -1 : r > 0.8 ? 1 : 0))
  })
  const hands: string[][] = []
  for (let d = 0; d < daysFor(difficulty); d++) {
    hands.push(Array.from({ length: HAND_SIZE }, () => cfg.tags[Math.floor(rng() * cfg.tags.length)].id))
  }
  return { chamber: { lean, fired: cfg.members.map(() => false), marks: [] }, hands }
}

/** A seeded chamber the greedy whip can carry but that is lost if left alone; reseeds until found. */
export function makeBoard(cfg: RollCallConfig, seed: number, difficulty: Difficulty): RollCallBoard {
  const need = needFor(cfg, difficulty)
  let fallback: RollCallBoard | null = null
  for (let attempt = 0; attempt < 200; attempt++) {
    const board = rollBoard(cfg, seed + attempt * 7919, difficulty)
    fallback ??= board
    if (playOut(cfg, board, difficulty, true) >= need && playOut(cfg, board, difficulty, false) < need) return board
  }
  return fallback!
}

// ── Component ──────────────────────────────────────────────────────────────────

const LEAN_COLOR: Record<number, string> = {
  [-3]: '#991b1b', [-2]: '#dc2626', [-1]: '#fca5a5', 0: '#cbd5e1', 1: '#fde68a', 2: '#f59e0b', 3: '#b45309',
}
const VOTE_COLOR: Record<Vote, string> = { aye: '#d97706', nay: '#dc2626', abstain: '#94a3b8' }
const fmtLean = (l: number) => (l > 0 ? `+${l}` : `${l}`)

/** Seats on a two-row hemicycle, inner row first, left to right. */
function seatPositions(n: number): { x: number; y: number }[] {
  const inner = Math.floor(n * 0.4), rows = [{ count: inner, r: 82 }, { count: n - inner, r: 140 }]
  const out: { x: number; y: number }[] = []
  for (const { count, r } of rows) {
    for (let k = 0; k < count; k++) {
      const a = Math.PI * (0.94 - (0.88 * k) / Math.max(1, count - 1))
      out.push({ x: 180 + r * Math.cos(a), y: 172 - r * Math.sin(a) })
    }
  }
  return out
}

type Phase = 'whip' | 'roll' | 'done'

export default function RollCallGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'roman-senate')
  const board = useMemo(() => makeBoard(cfg, seed, difficulty), [cfg, seed, difficulty])
  const days = board.hands.length, damage = damageFor(difficulty), need = needFor(cfg, difficulty)
  const showGains = difficulty <= 2
  const { outcome, win, lose } = useGameOutcome({ onWin, onLose })

  const [chamber, setChamber] = useState<Chamber>(() => startDay(cfg, board.chamber))
  const [day, setDay] = useState(0)
  const [used, setUsed] = useState<boolean[]>(() => board.hands[0].map(() => false))
  const [card, setCard] = useState<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [log, setLog] = useState(`${cfg.rival} is working on the marked members tonight.`)
  const [phase, setPhase] = useState<Phase>('whip')
  const [called, setCalled] = useState(0)

  const seats = useMemo(() => seatPositions(cfg.members.length), [cfg])
  const tagOf = useMemo(() => Object.fromEntries(cfg.tags.map(t => [t.id, t])), [cfg])
  const hand = board.hands[day]
  const selectedTag = card !== null ? hand[card] : null

  const pitch = (member: number) => {
    if (phase !== 'whip' || card === null || !selectedTag) return
    const gain = pitchGain(cfg, selectedTag, member)
    const wasMarked = chamber.marks.includes(member)
    let next = applyPitch(cfg, chamber, selectedTag, member)
    const cascaded = next.fired[member] && !chamber.fired[member]
    const nextUsed = used.map((u, i) => u || i === card)
    setCard(null)
    let msg = `${cfg.members[member].name} +${gain}${wasMarked ? ', shielded' : ''}${cascaded ? ' — their bloc follows' : ''}.`

    if (nextUsed.every(Boolean)) {
      const hit = next.marks.map(m => cfg.members[m].name)
      next = endDay(next, damage)
      if (hit.length) msg += ` Overnight ${cfg.rival} turns ${hit.join(' and ')} (−${damage}).`
      if (day + 1 < days) {
        next = startDay(cfg, next)
        setDay(day + 1)
        setUsed(board.hands[day + 1].map(() => false))
      } else {
        setUsed(nextUsed)
        setPhase('roll')
        msg += ' The roll is called.'
      }
    } else {
      setUsed(nextUsed)
    }
    setChamber(next)
    setLog(msg)
  }

  // Call the roll one seat at a time.
  useEffect(() => {
    if (phase !== 'roll') return
    if (called >= cfg.members.length) {
      setPhase('done')
      const { aye } = tallyVotes(chamber.lean)
      if (aye >= need) win()
      else lose(`only ${aye} of ${need} ayes`)
      return
    }
    const t = setTimeout(() => setCalled(c => c + 1), 250)
    return () => clearTimeout(t)
  }, [phase, called, cfg, chamber, need, win, lose])

  const counted = chamber.lean.slice(0, phase === 'whip' ? 0 : called)
  const live = tallyVotes(counted)
  const projected = tallyVotes(chamber.lean).aye
  const h = hovered !== null ? cfg.members[hovered] : null

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <p className="shrink-0 text-[10px] text-muted text-right">
          {phase === 'whip' ? <>Day <b className="text-ink">{day + 1}</b>/{days}</> : <>Roll call</>}<br />
          Need <b className="text-ink">{need}</b> ayes
        </p>
      </div>

      <svg viewBox="0 0 360 190" className="w-full rounded-xl border border-line bg-panel" style={{ maxHeight: 230 }}>
        {cfg.members.map((m, i) => m.follows === undefined ? null : (
          <line key={`l${i}`} x1={seats[i].x} y1={seats[i].y} x2={seats[m.follows].x} y2={seats[m.follows].y}
            stroke="#94a3b8" strokeOpacity={chamber.fired[m.follows] ? 0.7 : 0.25} strokeDasharray="3 3" />
        ))}
        {cfg.members.map((m, i) => {
          const { x, y } = seats[i]
          const isLeader = followersOf(cfg, i).length > 0
          const voted = phase !== 'whip' && i < called ? voteOf(chamber.lean[i]) : null
          const match = showGains && selectedTag === m.tag
          return (
            <g key={i} onClick={() => pitch(i)} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
              style={{ cursor: phase === 'whip' && card !== null ? 'pointer' : 'default' }}>
              <circle cx={x} cy={y} r={15} fill={LEAN_COLOR[chamber.lean[i]]}
                stroke={voted ? VOTE_COLOR[voted] : match ? '#d97706' : isLeader ? '#475569' : '#e2e8f0'}
                strokeWidth={voted || match ? 3 : isLeader ? 2.5 : 1}
                style={{ transition: 'fill 0.5s ease' }} />
              <text x={x} y={y + 4} textAnchor="middle" fontSize={12}>{tagOf[m.tag]?.icon}</text>
              {isLeader && <text x={x + 12} y={y - 9} fontSize={9}>👑</text>}
              {chamber.marks.includes(i) && phase === 'whip' && <text x={x - 20} y={y - 9} fontSize={11}>⚠</text>}
              {voted && (
                <text x={x} y={y + 27} textAnchor="middle" fontSize={8} fontWeight="bold" fill={VOTE_COLOR[voted]}>
                  {voted.toUpperCase()}
                </text>
              )}
              {showGains && hovered === i && selectedTag && phase === 'whip' && (
                <text x={x} y={y - 19} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#b45309">
                  +{pitchGain(cfg, selectedTag, i)}
                </text>
              )}
            </g>
          )
        })}
        <text x={180} y={160} textAnchor="middle" fontSize={22} fontWeight="bold" fill="#d97706">
          {phase === 'whip' ? projected : live.aye}
          <tspan fill="#94a3b8" fontSize={14}> : </tspan>
          <tspan fill="#dc2626">{phase === 'whip' ? tallyVotes(chamber.lean).nay : live.nay}</tspan>
        </text>
        <text x={180} y={176} textAnchor="middle" fontSize={8} fill="#64748b">
          {phase === 'whip' ? 'AYE : NAY if the vote were now' : 'AYE : NAY'}
        </text>
      </svg>

      <p className="text-[11px] text-ink min-h-[1.25rem] text-center">
        {h
          ? <>{h.name} · lean <b>{fmtLean(chamber.lean[hovered!])}</b> · {tagOf[h.tag]?.icon} {tagOf[h.tag]?.label}
              {followersOf(cfg, hovered!).length > 0 && <> · leads {followersOf(cfg, hovered!).length}</>}
              {chamber.marks.includes(hovered!) && <> · ⚠ targeted by {cfg.rival}</>}</>
          : <span className="text-muted">{log}</span>}
      </p>

      {phase === 'whip' && (
        <div className="flex flex-col gap-1.5">
          <p className="text-muted text-[10px] uppercase tracking-widest">Today's pitches — pick one, then a member</p>
          <div className="grid grid-cols-3 gap-2">
            {hand.map((tag, i) => {
              const t = tagOf[tag]
              return (
                <button key={i} disabled={used[i]} onClick={() => setCard(card === i ? null : i)}
                  className={`flex flex-col items-center gap-0.5 p-2 rounded-xl border text-xs transition-all
                    ${used[i] ? 'opacity-30 border-line bg-panel cursor-default'
                      : card === i ? 'border-accent bg-accent/10 cursor-pointer'
                      : 'border-line bg-panel hover:border-accent/40 cursor-pointer'}`}>
                  <span className="text-lg leading-none">{t?.icon}</span>
                  <span className="font-semibold text-ink">{t?.label}</span>
                  <span className="text-[9px] text-muted">+2 to {t?.label}, +1 others</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted/80 text-center">
        ⚠ members lose {damage} tonight unless you pitch them. Win a 👑 leader to Aye and their bloc gains +1. Abstainers (grey) don't count.
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="The motion carries!" loseTitle="The motion fails" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
