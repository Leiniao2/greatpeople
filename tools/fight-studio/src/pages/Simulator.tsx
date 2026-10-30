import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { conflictTotal, hazardMinStat, survivalTotal, type BoardContext, type SideSpec } from '../lib/engine'
import { ENGINE_CONSTANTS } from '../lib/engineTraits'
import { STATS, STAT_LABEL, type Card, type FollowerTemplate, type LocationCard } from '../types'

interface SideState { gpIds: string[]; followerNames: string[] }

function SidePicker({ label, side, setSide, cards, followers }: { label: string; side: SideState; setSide: (s: SideState) => void; cards: Card[]; followers: FollowerTemplate[] }) {
  return (
    <div className="card" style={{ flex: '1 1 380px' }}>
      <h4>{label}</h4>
      <div className="small">Great People</div>
      {side.gpIds.map((id, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
          <select value={id} onChange={e => setSide({ ...side, gpIds: side.gpIds.map((x, j) => (j === i ? e.target.value : x)) })}>
            {cards.map(c => <option key={c.id} value={c.id}>{c.figureName}</option>)}
          </select>
          <button className="btn" onClick={() => setSide({ ...side, gpIds: side.gpIds.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      <button className="btn" onClick={() => setSide({ ...side, gpIds: [...side.gpIds, cards[0].id] })}>+ GP</button>
      <div className="small" style={{ marginTop: 10 }}>Followers</div>
      {side.followerNames.map((n, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
          <select value={n} onChange={e => setSide({ ...side, followerNames: side.followerNames.map((x, j) => (j === i ? e.target.value : x)) })}>
            {followers.map(f => <option key={f.name} value={f.name}>{f.name} ({STAT_LABEL[f.stat]})</option>)}
          </select>
          <button className="btn" onClick={() => setSide({ ...side, followerNames: side.followerNames.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      <button className="btn" onClick={() => setSide({ ...side, followerNames: [...side.followerNames, followers[0].name] })}>+ follower</button>
    </div>
  )
}

export default function Simulator() {
  const { data } = useStore()
  const cards = data.cards
  const followers = data.followers
  const [a, setA] = useState<SideState>({ gpIds: [cards[0]?.id].filter(Boolean), followerNames: [] })
  const [b, setB] = useState<SideState>({ gpIds: [cards[1]?.id].filter(Boolean), followerNames: [] })
  const [locId, setLocId] = useState<string>('')
  const [eventActive, setEventActive] = useState(true)
  const [extraFieldIds, setExtraFieldIds] = useState<string[]>([])

  const byId = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards])
  const fByName = useMemo(() => new Map(followers.map(f => [f.name, f])), [followers])
  const loc: LocationCard | null = data.locationCards.find(l => l.id === locId) ?? null

  const sideA: SideSpec = { gps: a.gpIds.map(id => byId.get(id)!).filter(Boolean), followers: a.followerNames.map(n => fByName.get(n)!).filter(Boolean) }
  const sideB: SideSpec = { gps: b.gpIds.map(id => byId.get(id)!).filter(Boolean), followers: b.followerNames.map(n => fByName.get(n)!).filter(Boolean) }
  const fieldGPs = [...sideA.gps, ...sideB.gps, ...extraFieldIds.map(id => byId.get(id)!).filter(Boolean)]
  const ctxA: BoardContext = { alliedGPs: sideA.gps, alliedFollowers: sideA.followers, opponentGPs: sideB.gps, opponentFollowers: sideB.followers, fieldGPs, eventActive }
  const ctxB: BoardContext = { alliedGPs: sideB.gps, alliedFollowers: sideB.followers, opponentGPs: sideA.gps, opponentFollowers: sideA.followers, fieldGPs, eventActive }

  const rows = STATS.map(s => {
    const ta = conflictTotal(sideA, s, ctxA, loc), tb = conflictTotal(sideB, s, ctxB, loc)
    const sa = survivalTotal(sideA, s, ctxA), sb = survivalTotal(sideB, s, ctxB)
    return { stat: s, a: ta, b: tb, sa, sb }
  })
  const hzA = hazardMinStat(sideA), hzB = hazardMinStat(sideB)

  const Breakdown = ({ t }: { t: ReturnType<typeof conflictTotal> }) => (
    <span className="small">{t.cards.map(c => `${c.name} ${c.base}${c.trait ? (c.trait > 0 ? `+${c.trait}t` : `${c.trait}t`) : ''}${c.location ? `+${c.location}L` : ''}${c.follower ? `+${c.follower}f` : ''}`).join(' · ')}</span>
  )

  return (
    <div className="page">
      <h2>Conflict simulator</h2>
      <p className="lead">
        Two players share one location. Totals use the engine's formulas: base stat + implemented trait bonus + location bonus per GP, plus follower bonus ({ENGINE_CONSTANTS.followerBonus}, or {ENGINE_CONSTANTS.followerIdentityMatchBonus} when an allied GP shares the identity) for matching followers.
        Survival rows drop the location bonus, as the engine does. Hazard uses the minimum per-stat total.
      </p>
      <div className="row">
        <SidePicker label="Player A" side={a} setSide={setA} cards={cards} followers={followers} />
        <SidePicker label="Player B" side={b} setSide={setB} cards={cards} followers={followers} />
        <div className="card" style={{ flex: '1 1 300px' }}>
          <h4>Board</h4>
          <div className="small">Location</div>
          <select value={locId} onChange={e => setLocId(e.target.value)} style={{ maxWidth: 280 }}>
            <option value="">(no location bonus)</option>
            {data.locationCards.map(l => <option key={l.id} value={l.id}>{l.era} · {l.name} ({STATS.filter(s => l.bonuses[s]).map(s => `${STAT_LABEL[s]} +${l.bonuses[s]}`).join(', ') || 'no bonus'})</option>)}
          </select>
          <div className="small" style={{ marginTop: 8 }}><label><input type="checkbox" checked={eventActive} onChange={e => setEventActive(e.target.checked)} /> an event is active here (Gregory Peck)</label></div>
          <div className="small" style={{ marginTop: 8 }}>Other GPs elsewhere on the field (Aspasia needs Pericles; Mani counts eras)</div>
          {extraFieldIds.map((id, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <select value={id} onChange={e => setExtraFieldIds(extraFieldIds.map((x, j) => (j === i ? e.target.value : x)))}>{cards.map(c => <option key={c.id} value={c.id}>{c.figureName}</option>)}</select>
              <button className="btn" onClick={() => setExtraFieldIds(extraFieldIds.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button className="btn" onClick={() => setExtraFieldIds([...extraFieldIds, cards[0].id])}>+ GP on field</button>
        </div>
      </div>

      <h3>Local conflict totals</h3>
      <table className="grid">
        <thead><tr><th>Scenario stat</th><th>Player A</th><th>Player B</th><th>Result</th><th>Survival A (≥ {ENGINE_CONSTANTS.localSurvivalThreshold})</th><th>Survival B</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.stat}>
              <td>{STAT_LABEL[r.stat]}</td>
              <td className="num"><b>{r.a.total}</b><br /><Breakdown t={r.a} /></td>
              <td className="num"><b>{r.b.total}</b><br /><Breakdown t={r.b} /></td>
              <td className={r.a.total > r.b.total ? 'pos' : r.b.total > r.a.total ? 'neg' : ''}>{r.a.total > r.b.total ? 'A wins' : r.b.total > r.a.total ? 'B wins' : 'draw (nothing happens)'}</td>
              <td className={r.sa.total >= ENGINE_CONSTANTS.localSurvivalThreshold ? 'pos' : 'neg'}>{r.sa.total}</td>
              <td className={r.sb.total >= ENGINE_CONSTANTS.localSurvivalThreshold ? 'pos' : 'neg'}>{r.sb.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Natural hazard</h3>
      <table className="grid">
        <thead><tr><th>Player</th>{STATS.map(s => <th key={s}>{STAT_LABEL[s]}</th>)}<th>Min</th><th>Outcome (min ≥ {ENGINE_CONSTANTS.hazardMinStatThreshold})</th></tr></thead>
        <tbody>
          {[['A', hzA], ['B', hzB]].map(([n, h]) => {
            const hz = h as typeof hzA
            return (
              <tr key={n as string}><td>Player {n as string}</td>{STATS.map(s => <td key={s} className="num" style={{ color: hz.byStat[s] === hz.min ? 'var(--serious)' : undefined }}>{hz.byStat[s]}</td>)}<td className="num"><b>{hz.min}</b></td>
                <td className={hz.min >= ENGINE_CONSTANTS.hazardMinStatThreshold ? 'pos' : 'neg'}>{hz.min >= ENGINE_CONSTANTS.hazardMinStatThreshold ? 'survives' : 'all cards discarded'}</td></tr>
            )
          })}
        </tbody>
      </table>
      <p className="small">t = trait bonus, L = location bonus, f = follower bonus. Followers whose stat does not match contribute 0 to that row.</p>
    </div>
  )
}
