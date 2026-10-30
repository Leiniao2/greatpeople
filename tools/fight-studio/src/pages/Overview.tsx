import { useMemo } from 'react'
import { useStore } from '../lib/store'
import { ACHIEVEMENT_SPECS, DOC_CONSTANTS, ENGINE_CONSTANTS, IMPLEMENTED_TRAITS, SOURCE_INVENTORY } from '../lib/engineTraits'
import { powerTable } from '../lib/engine'
import { RULE_STATUSES, STATS, type RuleStatus } from '../types'

export default function Overview() {
  const { data, root, gitStatus } = useStore()
  const rules = data.rules
  const byStatus = useMemo(() => {
    const m = Object.fromEntries(RULE_STATUSES.map(s => [s, 0])) as Record<RuleStatus, number>
    for (const r of rules) m[r.status] += 1
    return m
  }, [rules])
  const power = useMemo(() => powerTable(data.cards), [data.cards])
  const implemented = Object.keys(IMPLEMENTED_TRAITS).length
  const diverging = Object.values(IMPLEMENTED_TRAITS).filter(t => !t.matchesCardText).length
  const mapped = Object.keys(ACHIEVEMENT_SPECS).length
  const survivalRisk = power.filter(p => p.survivalFails.length > 0).length
  const hazardRisk = power.filter(p => p.minStat < ENGINE_CONSTANTS.hazardMinStatThreshold).length
  const docSurvivalRisk = data.cards.filter(c => STATS.some(s => c[s] < DOC_CONSTANTS.localSurvivalThreshold)).length

  return (
    <div className="page">
      <h2>Fight knowledge audit</h2>
      <p className="lead">
        Everything the repo knows about battles, in one place: the rulebook, the per-card traits and achievements,
        follower and location data, and what the web engine actually executes. Edits write straight back to the repo
        files under <span className="mono">{root}</span>.
      </p>

      <div className="kpis">
        <div className="kpi"><div className="v">{rules.length}</div><div className="l">rules in registry</div></div>
        <div className="kpi"><div className="v">{byStatus.implemented}</div><div className="l">implemented as written</div></div>
        <div className="kpi warn"><div className="v">{byStatus.conflict}</div><div className="l">doc ≠ code conflicts</div></div>
        <div className="kpi warn"><div className="v">{byStatus.partial + byStatus.missing}</div><div className="l">partial or missing</div></div>
        <div className="kpi"><div className="v">{data.cards.length}</div><div className="l">Great People</div></div>
        <div className="kpi warn"><div className="v">{implemented} / {data.cards.length}</div><div className="l">traits with engine effect ({diverging} differ from card text)</div></div>
        <div className="kpi warn"><div className="v">0 / {data.cards.length}</div><div className="l">achievement texts evaluated ({mapped} mapped to a kill-stat)</div></div>
        <div className="kpi"><div className="v">{survivalRisk}</div><div className="l">GPs that fail a solo survival at engine threshold {ENGINE_CONSTANTS.localSurvivalThreshold} in some stat</div></div>
        <div className="kpi"><div className="v">{docSurvivalRisk}</div><div className="l">… at the doc threshold {DOC_CONSTANTS.localSurvivalThreshold}</div></div>
        <div className="kpi"><div className="v">{hazardRisk}</div><div className="l">GPs that die alone to any hazard (min stat &lt; {ENGINE_CONSTANTS.hazardMinStatThreshold})</div></div>
      </div>

      <div className="row">
        <div className="card" style={{ flex: '2 1 560px' }}>
          <h4>Where fight knowledge lives</h4>
          <table className="grid" style={{ tableLayout: 'fixed' }}>
            <colgroup><col style={{ width: 72 }} /><col style={{ width: '38%' }} /><col /></colgroup>
            <thead><tr><th>Kind</th><th>File</th><th>Role</th></tr></thead>
            <tbody>
              {SOURCE_INVENTORY.map(s => (
                <tr key={s.path}><td><span className="pill">{s.kind}</span></td><td className="mono">{s.path}</td><td>{s.role}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card" style={{ flex: '1 1 360px', maxWidth: 560 }}>
          <h4>Headline findings</h4>
          <ul className="small" style={{ paddingLeft: 18, lineHeight: 1.5 }}>
            <li><b>Three survival rules exist.</b> fight.md says a stat total below 10 dies; the web engine uses 5; iOS/Android dialogs say 10. For hazards: doc says all-stat total below 100, engine says minimum per-stat total below 5, mobile says 100.</li>
            <li><b>Achievements are not what the cards say.</b> Every achievement is implemented as "kill an enemy GP with ≥5 in your mapped stat during a conflict of that stat" (1 tick for 47 figures, 3 ticks for the rest).</li>
            <li><b>Only 13 of 80 traits do anything</b>, and 12 of those 13 do something other than their card text (e.g. Marie Antoinette gets +8 wealth instead of giving everyone −3).</li>
            <li><b>Archiving does not exist</b>; claiming an achievement draws a new GP immediately and the card stays on the board.</li>
            <li><b>Attack visibility rules are unenforced</b>: private cards can attack and are counted; only the two cards involved get revealed.</li>
            <li><b>Ending a scenario ignores identity</b>; any GP of yours at the location can end any local scenario.</li>
            <li><b>Two battle designs are documented</b>: the board game (fight.md, web client) and an older 10-card, 3-stat round game (great-people-card.md, server).</li>
            <li><b>Stat scale is ambiguous</b>: cards use 1–12, demo cards 1–24, and some trait/achievement texts assume 25.</li>
          </ul>
          <h4 style={{ marginTop: 14 }}>Engine constants (BattlePage.tsx)</h4>
          <table className="grid small">
            <tbody>
              {Object.entries(ENGINE_CONSTANTS).map(([k, v]) => <tr key={k}><td className="mono">{k}</td><td className="num">{String(v)}</td></tr>)}
            </tbody>
          </table>
          <h4 style={{ marginTop: 14 }}>git status (data/, docs/)</h4>
          <pre className="out">{gitStatus.trim() || 'clean'}</pre>
        </div>
      </div>
    </div>
  )
}
