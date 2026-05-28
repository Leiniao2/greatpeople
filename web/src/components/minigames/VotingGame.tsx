import { useState, useEffect, useCallback, useMemo } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

type Pref = 'economic' | 'military' | 'cultural' | 'religious' | 'political' | 'scientific'
type Allegiance = 'player' | 'ai' | 'neutral'
type Phase = 'select' | 'thinking' | 'reveal' | 'resolving' | 'stageclear' | 'won' | 'lost'

interface Voter { id: number; x: number; y: number; pref: Pref; allegiance: Allegiance }
interface Policy { id: string; name: string; desc: string; pref: Pref; strength: number }

// ── Constants ──────────────────────────────────────────────────────────────────

const TOTAL = 80
const STAGE_TARGETS = [28, 40, 52] // 35%, 50%, 65% of 80
const STAGE_LABELS = ['Primary', 'Regional Vote', 'National Election']
const PREFS: Pref[] = ['economic', 'military', 'cultural', 'religious', 'political', 'scientific']

const PREF_COLOR: Record<Pref, string> = {
  economic:  '#4ade80',
  military:  '#f87171',
  cultural:  '#c084fc',
  religious: '#fb923c',
  political: '#60a5fa',
  scientific:'#22d3ee',
}
const PREF_LABEL: Record<Pref, string> = {
  economic: 'Economic', military: 'Military', cultural: 'Cultural',
  religious: 'Religious', political: 'Political', scientific: 'Scientific',
}
const PREF_ICON: Record<Pref, string> = {
  economic: '₿', military: '⚔', cultural: '♪',
  religious: '✦', political: '⚖', scientific: '⚗',
}

// ── Era policy pools ───────────────────────────────────────────────────────────

const ERA_POLICIES: Record<string, Policy[]> = {
  ancient: [
    { id:'a1', name:'Build a Temple',     desc:'Consecrate a new temple to unite the people under the gods.',    pref:'religious', strength:7 },
    { id:'a2', name:'Conscript Warriors', desc:'Expand the army with new recruits and better weapons.',           pref:'military',  strength:6 },
    { id:'a3', name:'Lower Grain Taxes',  desc:'Reduce taxes on grain to ease the burden on farmers.',           pref:'economic',  strength:7 },
    { id:'a4', name:'Sponsor the Games',  desc:'Fund public festivals and athletic competitions.',               pref:'cultural',  strength:5 },
    { id:'a5', name:'Codify the Laws',    desc:'Write new laws protecting citizens from arbitrary punishment.',   pref:'political', strength:6 },
    { id:'a6', name:'Fund the Scribes',   desc:'Endow a school of scribes, astronomers, and healers.',           pref:'scientific',strength:5 },
    { id:'a7', name:'Open the Granaries', desc:'Distribute stored grain reserves to the hungry populace.',      pref:'economic',  strength:8 },
    { id:'a8', name:'Raise a Garrison',   desc:'Station soldiers at key city gates and border posts.',           pref:'military',  strength:7 },
  ],
  classical: [
    { id:'c1', name:'Fund the Navy',        desc:'Expand the fleet to protect trade routes and project power.',   pref:'military',  strength:7 },
    { id:'c2', name:'Expand the Agora',     desc:'Build new market stalls, roads, and trading infrastructure.',  pref:'economic',  strength:6 },
    { id:'c3', name:'Commission Theatre',   desc:'Fund new plays and open the theatre to all citizens.',         pref:'cultural',  strength:6 },
    { id:'c4', name:'Extend Democracy',     desc:'Expand citizen voting rights and powers of the Assembly.',     pref:'political', strength:7 },
    { id:'c5', name:'Endow the Academy',    desc:'Fund philosophers, mathematicians, and the arts of reason.',   pref:'scientific',strength:6 },
    { id:'c6', name:'Honor the Gods',       desc:'Dedicate public sacrifices and new offerings to the temples.', pref:'religious', strength:6 },
    { id:'c7', name:'Reduce Tribute',       desc:'Lower tribute demands on allied city-states.',                 pref:'economic',  strength:7 },
    { id:'c8', name:'Reinforce the Walls',  desc:'Fortify the city walls against siege and invasion.',           pref:'military',  strength:6 },
  ],
  medieval: [
    { id:'m1', name:'Raise a Cathedral',   desc:'Commission a great cathedral to inspire and unite the faithful.', pref:'religious', strength:8 },
    { id:'m2', name:'Fortify the City',    desc:'Strengthen walls and garrison the keep against attack.',          pref:'military',  strength:6 },
    { id:'m3', name:'Grant Guild Rights',  desc:'Give merchant guilds legal protections and trading privileges.',  pref:'economic',  strength:7 },
    { id:'m4', name:'Hold a Tournament',   desc:'Sponsor a grand jousting tournament and three-day feast.',       pref:'cultural',  strength:6 },
    { id:'m5', name:'Reform the Courts',   desc:'Replace trial by combat with evidence-based legal judgment.',    pref:'political', strength:6 },
    { id:'m6', name:'Fund the University', desc:'Invite scholars and establish a seat of learning.',              pref:'scientific',strength:5 },
    { id:'m7', name:'Forgive Church Tax',  desc:'Exempt the clergy from royal taxation to win their favour.',    pref:'religious', strength:7 },
    { id:'m8', name:'Raise a Crusade',     desc:'Rally the faithful to a holy campaign for glory and faith.',    pref:'military',  strength:7 },
  ],
  renaissance: [
    { id:'r1', name:'Commission Art',      desc:'Patronize a great artist to adorn the city with beauty.',       pref:'cultural',  strength:7 },
    { id:'r2', name:'Sign a Trade Treaty', desc:'Open new trade routes with neighbouring states.',              pref:'economic',  strength:8 },
    { id:'r3', name:'Fund Explorers',      desc:'Finance an expedition to chart unknown lands and seas.',        pref:'scientific',strength:7 },
    { id:'r4', name:'Uphold the Church',   desc:'Affirm religious orthodoxy and fund monasteries.',             pref:'religious', strength:6 },
    { id:'r5', name:'Raise an Army',       desc:'Recruit mercenaries and fortify the border.',                  pref:'military',  strength:6 },
    { id:'r6', name:'Reform Parliament',   desc:'Expand representation in the governing council.',              pref:'political', strength:7 },
    { id:'r7', name:'Charter a Bank',      desc:'Establish a lending house to fund enterprise.',                pref:'economic',  strength:7 },
    { id:'r8', name:'Open a Library',      desc:'Collect manuscripts and open them to public learning.',        pref:'scientific',strength:6 },
  ],
  steam: [
    { id:'s1', name:'Build Railways',    desc:'Connect the nation with a new steam-powered rail network.',    pref:'economic',  strength:8 },
    { id:'s2', name:'Reform Parliament', desc:'Expand voting rights to new classes and property holders.',    pref:'political', strength:7 },
    { id:'s3', name:'Public Schools',    desc:'Open free schools for the children of working families.',     pref:'scientific',strength:7 },
    { id:'s4', name:'Abolish Slavery',   desc:'Declare a permanent end to the slave trade and bondage.',     pref:'cultural',  strength:8 },
    { id:'s5', name:'Modernise Army',    desc:'Equip the military with rifles, artillery, and steam ships.', pref:'military',  strength:6 },
    { id:'s6', name:'Support the Church',desc:'Fund religious missions and uphold Sunday observance laws.',  pref:'religious', strength:5 },
    { id:'s7', name:'Protect Industry',  desc:'Place tariffs on foreign goods to shield domestic factories.',pref:'economic',  strength:7 },
    { id:'s8', name:'Fund Hospitals',    desc:'Build public hospitals in overcrowded industrial towns.',     pref:'cultural',  strength:7 },
  ],
  electricity: [
    { id:'e1', name:'Universal Healthcare', desc:'Guarantee free medical care for every citizen.',          pref:'cultural',  strength:8 },
    { id:'e2', name:'Military Rearmament',  desc:'Rebuild the armed forces with modern tanks and aircraft.',pref:'military',  strength:7 },
    { id:'e3', name:'Regulate Industry',    desc:'Control monopolies and protect workers\' wages by law.',   pref:'economic',  strength:7 },
    { id:'e4', name:'Fund Science',         desc:'Invest in research institutes and university laboratories.',pref:'scientific',strength:7 },
    { id:'e5', name:"Women's Suffrage",     desc:'Extend the vote to all adult citizens regardless of sex.',pref:'political', strength:8 },
    { id:'e6', name:'National Faith',       desc:'Promote religious identity as part of national pride.',   pref:'religious', strength:5 },
    { id:'e7', name:'Public Works',         desc:'Launch a nationwide construction and employment drive.',  pref:'economic',  strength:8 },
    { id:'e8', name:'End Conscription',     desc:'Replace mandatory military service with professional volunteers.', pref:'political', strength:6 },
  ],
  information: [
    { id:'i1', name:'Tech Investment',   desc:'Fund innovation hubs, broadband, and digital infrastructure.', pref:'scientific',strength:8 },
    { id:'i2', name:'Healthcare Reform', desc:'Expand access to affordable universal medical care.',          pref:'cultural',  strength:8 },
    { id:'i3', name:'Tax Cuts',          desc:'Reduce income and corporate taxes to stimulate growth.',      pref:'economic',  strength:7 },
    { id:'i4', name:'Climate Policy',    desc:'Commit to emissions targets and renewable energy investment.', pref:'scientific',strength:7 },
    { id:'i5', name:'Defense Spending',  desc:'Increase military budget and overseas troop presence.',       pref:'military',  strength:6 },
    { id:'i6', name:'Electoral Reform',  desc:'Overhaul voting systems and campaign finance rules.',         pref:'political', strength:7 },
    { id:'i7', name:'Universal Income',  desc:'Provide a monthly basic income payment to every adult.',     pref:'economic',  strength:8 },
    { id:'i8', name:'Religious Freedom', desc:'Enshrine protections for religious communities in law.',      pref:'religious', strength:5 },
  ],
}

// ── Config → era mapping ───────────────────────────────────────────────────────

const CONFIG_ERA: Record<string, string> = {
  'roman-senate': 'classical', 'athenian-assembly': 'classical',
  'spanish-court': 'renaissance',
  'akkadian-council': 'ancient',
  'versailles-crisis': 'steam',
  'mellon-treasury': 'electricity', 'mockingbird-jury': 'electricity',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function resolveEra(configId: string): string {
  return CONFIG_ERA[configId] ?? (ERA_POLICIES[configId] ? configId : 'classical')
}

function initVoters(politics: number): Voter[] {
  const voters: Voter[] = []
  for (let i = 0; i < TOTAL; i++) {
    voters.push({ id: i, x: 3 + Math.random() * 94, y: 3 + Math.random() * 94, pref: PREFS[i % 6], allegiance: 'neutral' })
  }
  const shuffled = [...voters].sort(() => Math.random() - 0.5)
  const start = 3 + Math.floor(politics * 0.35)
  shuffled.slice(0, start).forEach(v => { v.allegiance = 'player' })
  shuffled.slice(start, start * 2).forEach(v => { v.allegiance = 'ai' })
  return voters
}

function drawPolicies(era: string): Policy[] {
  const pool = ERA_POLICIES[era] ?? ERA_POLICIES['classical']
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 4)
}

function pickAiPolicy(voters: Voter[], policies: Policy[]): Policy {
  const available: Partial<Record<Pref, number>> = {}
  voters.filter(v => v.allegiance !== 'ai').forEach(v => {
    available[v.pref] = (available[v.pref] ?? 0) + 1
  })
  return policies.reduce((best, p) => (available[p.pref] ?? 0) > (available[best.pref] ?? 0) ? p : best)
}

function applyPolicies(voters: Voter[], pp: Policy, ap: Policy, politics: number): Voter[] {
  const next = voters.map(v => ({ ...v }))
  const pEff = pp.strength + Math.floor(politics / 6)
  const aEff = ap.strength

  // Player: convert neutral first, then AI voters
  let n = 0
  for (const v of next.filter(v => v.pref === pp.pref).sort(a => a.allegiance === 'neutral' ? -1 : 1)) {
    if (n >= pEff || v.allegiance === 'player') continue
    v.allegiance = 'player'; n++
  }

  // AI: convert neutral first, then player voters
  n = 0
  for (const v of next.filter(v => v.pref === ap.pref).sort(a => a.allegiance === 'neutral' ? -1 : 1)) {
    if (n >= aEff || v.allegiance === 'ai') continue
    v.allegiance = 'ai'; n++
  }

  return next
}

function tally(voters: Voter[]) {
  return {
    player: voters.filter(v => v.allegiance === 'player').length,
    ai:     voters.filter(v => v.allegiance === 'ai').length,
    neutral:voters.filter(v => v.allegiance === 'neutral').length,
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props { configId: string; onWin: () => void; politics?: number }

export default function VotingGame({ configId, onWin, politics = 10 }: Props) {
  const era = useMemo(() => resolveEra(configId), [configId])

  const [voters,      setVoters]      = useState<Voter[]>(() => initVoters(politics))
  const [stage,       setStage]       = useState(0)
  const [phase,       setPhase]       = useState<Phase>('select')
  const [policies,    setPolicies]    = useState<Policy[]>(() => drawPolicies(era))
  const [playerPick,  setPlayerPick]  = useState<Policy | null>(null)
  const [aiPick,      setAiPick]      = useState<Policy | null>(null)
  const [hovered,     setHovered]     = useState<Pref | null>(null)
  const [gainMsg,     setGainMsg]     = useState('')

  const votes  = useMemo(() => tally(voters), [voters])
  const target = STAGE_TARGETS[stage]

  // Player selects a policy
  const selectPolicy = useCallback((p: Policy) => {
    if (phase !== 'select') return
    setPlayerPick(p)
    setHovered(null)
    setPhase('thinking')
  }, [phase])

  // Thinking → reveal (AI picks after delay)
  useEffect(() => {
    if (phase !== 'thinking') return
    const t = setTimeout(() => {
      setAiPick(pickAiPolicy(voters, policies))
      setPhase('reveal')
    }, 1200)
    return () => clearTimeout(t)
  }, [phase, voters, policies])

  // Reveal → apply effects
  useEffect(() => {
    if (phase !== 'reveal' || !playerPick || !aiPick) return
    const before = votes.player
    const t = setTimeout(() => {
      setVoters(prev => {
        const next = applyPolicies(prev, playerPick, aiPick, politics)
        const after = next.filter(v => v.allegiance === 'player').length
        const gain = after - before
        setGainMsg(gain > 0 ? `+${gain} voters joined you` : gain < 0 ? `${gain} voters defected` : 'No votes changed')
        return next
      })
      setPhase('resolving')
    }, 1400)
    return () => clearTimeout(t)
  }, [phase, playerPick, aiPick, votes.player, politics])

  // Resolving → check milestone or next round
  useEffect(() => {
    if (phase !== 'resolving') return
    const t = setTimeout(() => {
      const v = tally(voters)
      if (v.player >= target) {
        setPhase(stage === 2 ? 'won' : 'stageclear')
        if (stage === 2) setTimeout(onWin, 900)
      } else if (v.ai >= target) {
        setPhase('lost')
      } else {
        setPlayerPick(null); setAiPick(null)
        setPolicies(drawPolicies(era))
        setPhase('select')
      }
    }, 1800)
    return () => clearTimeout(t)
  }, [phase, voters, target, stage, era, onWin])

  const advanceStage = () => {
    setStage(s => s + 1)
    setPlayerPick(null); setAiPick(null)
    setPolicies(drawPolicies(era))
    setPhase('select')
  }

  const playerPct = (votes.player / TOTAL) * 100
  const aiPct     = (votes.ai     / TOTAL) * 100
  const targetPct = (target       / TOTAL) * 100

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3 bg-slate-950 rounded-xl p-4">

      {/* Stage header */}
      <div className="flex items-center justify-between">
        <span className="text-amber-400/80 text-[10px] font-bold uppercase tracking-widest">
          Stage {stage + 1} — {STAGE_LABELS[stage]}
        </span>
        <span className="text-slate-500 text-[10px]">First to {target} votes advances</span>
      </div>

      {/* Vote bars */}
      <div className="flex flex-col gap-1.5">
        {([['player', playerPct, '#f59e0b', votes.player] , ['ai', aiPct, '#818cf8', votes.ai]] as const).map(([who, pct, color, count]) => (
          <div key={who} className="flex items-center gap-2">
            <span className="text-[10px] font-bold w-14 text-right" style={{ color }}>
              {count} {who === 'player' ? '▶' : '▶'}
            </span>
            <div className="flex-1 h-2.5 bg-white/[0.06] rounded-full overflow-hidden relative">
              <div
                className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: color }}
              />
              <div className="absolute top-0 bottom-0 w-px bg-white/30" style={{ left: `${targetPct}%` }} />
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="w-14" />
          <div className="flex-1 relative h-3">
            <span
              className="absolute text-[9px] text-white/25"
              style={{ left: `${targetPct}%`, transform: 'translateX(-50%)' }}
            >
              {target}
            </span>
          </div>
        </div>
      </div>

      {/* Voter field */}
      <svg
        viewBox="0 0 380 170"
        className="w-full rounded-xl border border-white/[0.05]"
        style={{ background: '#0f1220', height: 150 }}
      >
        {voters.map(v => {
          const isTarget = hovered === v.pref && v.allegiance === 'neutral'
          const fill =
            v.allegiance === 'player' ? '#f59e0b' :
            v.allegiance === 'ai'     ? '#818cf8' :
            isTarget                  ? PREF_COLOR[v.pref] :
            '#1e293b'
          const stroke =
            v.allegiance === 'player' ? '#fbbf24' :
            v.allegiance === 'ai'     ? '#a5b4fc' :
            isTarget                  ? PREF_COLOR[v.pref] :
            PREF_COLOR[v.pref]
          const strokeOpacity = v.allegiance === 'neutral' && !isTarget ? 0.3 : 0.9
          const fillOpacity   = v.allegiance === 'neutral' && !isTarget ? 0.25 : 1

          return (
            <circle
              key={v.id}
              cx={v.x * 3.8}
              cy={v.y * 1.7}
              r={v.allegiance === 'neutral' ? 4 : 5}
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeWidth={1.5}
              strokeOpacity={strokeOpacity}
              style={{ transition: 'fill 0.6s ease, fill-opacity 0.4s ease, stroke 0.6s ease' }}
            />
          )
        })}
      </svg>

      {/* Preference legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
        {PREFS.map(p => (
          <div key={p} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: PREF_COLOR[p] }} />
            <span className="text-[9px] text-slate-500">{PREF_LABEL[p]}</span>
          </div>
        ))}
      </div>

      {/* Phase: select */}
      {phase === 'select' && (
        <>
          <p className="text-slate-500 text-[10px] uppercase tracking-widest">Choose a policy to propose</p>
          <div className="grid grid-cols-2 gap-2">
            {policies.map(p => (
              <button
                key={p.id}
                onClick={() => selectPolicy(p)}
                onMouseEnter={() => setHovered(p.pref)}
                onMouseLeave={() => setHovered(null)}
                className="flex flex-col gap-1 text-left p-3 rounded-xl border border-white/10 bg-white/[0.03] hover:border-amber-500/40 hover:bg-amber-500/[0.05] transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PREF_COLOR[p.pref] }} />
                  <span className="text-white text-xs font-semibold leading-tight group-hover:text-amber-100">{p.name}</span>
                </div>
                <p className="text-slate-500 text-[10px] leading-snug">{p.desc}</p>
                <span className="text-slate-600 text-[10px]">{PREF_ICON[p.pref]} {PREF_LABEL[p.pref]} voters</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Phase: thinking */}
      {phase === 'thinking' && (
        <div className="flex items-center justify-center gap-2 py-4">
          {[0, 150, 300].map(d => (
            <div
              key={d}
              className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-bounce"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
          <span className="text-slate-500 text-xs ml-1">Opponent is choosing…</span>
        </div>
      )}

      {/* Phase: reveal / resolving */}
      {(phase === 'reveal' || phase === 'resolving') && playerPick && aiPick && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10">
              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Your policy</span>
              <span className="text-white text-sm font-semibold leading-snug">{playerPick.name}</span>
              <span className="text-[10px]" style={{ color: PREF_COLOR[playerPick.pref] }}>
                {PREF_ICON[playerPick.pref]} {PREF_LABEL[playerPick.pref]}
              </span>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10">
              <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Their policy</span>
              <span className="text-white text-sm font-semibold leading-snug">{aiPick.name}</span>
              <span className="text-[10px]" style={{ color: PREF_COLOR[aiPick.pref] }}>
                {PREF_ICON[aiPick.pref]} {PREF_LABEL[aiPick.pref]}
              </span>
            </div>
          </div>
          {phase === 'resolving' && (
            <p className="text-center text-slate-400 text-xs">{gainMsg}</p>
          )}
        </div>
      )}

      {/* Phase: stage clear */}
      {phase === 'stageclear' && (
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl border bg-amber-500/10 border-amber-500/30">
          <span className="text-2xl">🎯</span>
          <p className="font-bold text-amber-300">{STAGE_LABELS[stage]} won!</p>
          <p className="text-slate-400 text-xs">You secured {votes.player} votes — advance to the next stage.</p>
          <button
            onClick={advanceStage}
            className="mt-1 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-all"
          >
            Next Stage →
          </button>
        </div>
      )}

      {/* Phase: won */}
      {phase === 'won' && (
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl border bg-emerald-500/10 border-emerald-500/30">
          <span className="text-2xl">🏆</span>
          <p className="font-bold text-emerald-300">Election won!</p>
          <p className="text-slate-400 text-xs text-center">
            You secured {votes.player} / {TOTAL} votes — the people have chosen you.
          </p>
        </div>
      )}

      {/* Phase: lost */}
      {phase === 'lost' && (
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl border bg-red-500/10 border-red-500/30">
          <span className="text-2xl">🗳️</span>
          <p className="font-bold text-red-300">Election lost</p>
          <p className="text-slate-400 text-xs text-center">
            Your opponent reached {target} votes before you — they won {STAGE_LABELS[stage]}.
          </p>
          <button onClick={onWin} className="mt-1 px-5 py-2 bg-slate-700 text-slate-200 text-xs rounded-lg hover:bg-slate-600 transition-all">
            Continue →
          </button>
        </div>
      )}
    </div>
  )
}
