import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { groupMeans, powerDeltas, powerTable, statSummaries, statTotal } from '../lib/engine'
import { DOC_CONSTANTS, ENGINE_CONSTANTS, IMPLEMENTED_TRAITS } from '../lib/engineTraits'
import { ERAS, STATS, STAT_LABEL, type StatKey } from '../types'
import { Columns, HBars, Heatmap, Strip, Viz } from '../charts'

const SHORT: Record<StatKey, string> = { politics: 'Pol', strength: 'Str', culture: 'Cul', wealth: 'Wea', intelligence: 'Int', technique: 'Tec', belief: 'Bel', reputation: 'Rep' }
const pct = (v: number) => `${(v * 100).toFixed(0)}%`

export default function Balance() {
  const { data, saved, dirty } = useStore()
  const cards = data.cards
  const [survival, setSurvival] = useState(ENGINE_CONSTANTS.localSurvivalThreshold)
  const [hazard, setHazard] = useState(ENGINE_CONSTANTS.hazardMinStatThreshold)
  const [focus, setFocus] = useState<string>('')
  const [stat, setStat] = useState<StatKey>('politics')

  const maxStat = useMemo(() => Math.max(12, ...cards.flatMap(c => STATS.map(s => c[s]))), [cards])
  const summaries = useMemo(() => statSummaries(cards, maxStat), [cards, maxStat])
  const power = useMemo(() => powerTable(cards, survival), [cards, survival])
  const powerSorted = useMemo(() => [...power].sort((a, b) => b.power - a.power), [power])
  const eraMeans = useMemo(() => groupMeans(cards, c => [c.era]), [cards])
  const identityMeans = useMemo(() => groupMeans(cards, c => c.identities).sort((a, b) => b.n - a.n), [cards])
  const genderMeans = useMemo(() => groupMeans(cards, c => [c.gender]), [cards])
  const deltas = useMemo(() => (dirty.cards ? powerDeltas(saved.cards, cards) : []), [saved.cards, cards, dirty.cards])

  const survivalFailCount = STATS.map(s => cards.filter(c => c[s] < survival).length)
  const hazardFails = power.filter(p => p.minStat < hazard)
  const docSurvivalFailCount = STATS.map(s => cards.filter(c => c[s] < DOC_CONSTANTS.localSurvivalThreshold).length)

  // Local conflict dominance: top 8 per stat.
  const topPerStat = STATS.map(s => [...cards].sort((a, b) => b[s] - a[s]).slice(0, 8))
  // How concentrated is each stat? share of total stat points held by the top 10 cards.
  const concentration = STATS.map(s => {
    const xs = cards.map(c => c[s]).sort((a, b) => b - a)
    const total = xs.reduce((a, b) => a + b, 0) || 1
    return xs.slice(0, 10).reduce((a, b) => a + b, 0) / total
  })
  // Follower vs GP leverage: median GP stat compared to a follower's 2 / 3 bonus.
  const medianStat = useMemo(() => {
    const xs = cards.flatMap(c => STATS.map(s => c[s])).sort((a, b) => a - b)
    return xs.length ? xs[Math.floor(xs.length / 2)] : 0
  }, [cards])
  // Achievement reachability: mapped cards' win rate against worthy opponents.
  const achRows = power.filter(p => p.achievementStat).sort((a, b) => (a.achievementWinRate ?? 0) - (b.achievementWinRate ?? 0))
  const unmapped = power.filter(p => !p.achievementStat)
  // Trait impact: implemented numeric magnitudes.
  const traitRows = Object.values(IMPLEMENTED_TRAITS).map(t => ({ label: t.figure, value: Math.abs(t.magnitude), tip: `${t.figure}: ${t.engine}` })).sort((a, b) => b.value - a.value)

  return (
    <div className="page">
      <h2>Balance analysis</h2>
      <p className="lead">
        All figures recompute from the current (possibly unsaved) data. Power = mean over the 8 stats of a card's 1v1 base-stat win rate against every other card (ties count half).
        Thresholds below default to the engine's values; raise them to the doc's values to see the alternative world.
      </p>
      <div className="toolbar">
        <label className="small">local survival threshold <input type="number" value={survival} min={0} onChange={e => setSurvival(Number(e.target.value))} /></label>
        <label className="small">hazard min-stat threshold <input type="number" value={hazard} min={0} onChange={e => setHazard(Number(e.target.value))} /></label>
        <label className="small">focus card
          <select value={focus} onChange={e => setFocus(e.target.value)}><option value="">none</option>{cards.map(c => <option key={c.id} value={c.figureName}>{c.figureName}</option>)}</select>
        </label>
        <label className="small">stat for conflict view
          <select value={stat} onChange={e => setStat(e.target.value as StatKey)}>{STATS.map(s => <option key={s} value={s}>{STAT_LABEL[s]}</option>)}</select>
        </label>
      </div>

      {deltas.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--warn)' }}>
          <h4>Effect of unsaved edits</h4>
          <table className="grid">
            <thead><tr><th>Card</th><th>Total before → after</th><th>Power before</th><th>Power after</th><th>Δ</th></tr></thead>
            <tbody>
              {deltas.slice(0, 25).map(d => (
                <tr key={d.id}><td>{d.figure}</td><td className="num">{d.totalBefore} → {d.totalAfter}</td><td className="num">{pct(d.before)}</td><td className="num">{pct(d.after)}</td>
                  <td className={`num ${d.delta > 0 ? 'pos' : d.delta < 0 ? 'neg' : ''}`}>{d.delta > 0 ? '+' : ''}{(d.delta * 100).toFixed(1)} pts</td></tr>
              ))}
            </tbody>
          </table>
          <p className="small">Cards you did not touch also move: their win rates depend on everyone else's stats.</p>
        </div>
      )}

      <div className="kpis">
        <div className="kpi"><div className="v">{medianStat}</div><div className="l">median GP stat (a follower adds {ENGINE_CONSTANTS.followerBonus}–{ENGINE_CONSTANTS.followerIdentityMatchBonus})</div></div>
        <div className="kpi"><div className="v">{(summaries.reduce((a, s) => a + s.mean, 0) / 8).toFixed(2)}</div><div className="l">mean stat value</div></div>
        <div className="kpi"><div className="v">{Math.min(...cards.map(statTotal))}–{Math.max(...cards.map(statTotal))}</div><div className="l">card total range</div></div>
        <div className="kpi warn"><div className="v">{hazardFails.length}</div><div className="l">cards die alone to a hazard (min &lt; {hazard})</div></div>
        <div className="kpi warn"><div className="v">{unmapped.length}</div><div className="l">cards whose achievement is unreachable (unmapped)</div></div>
      </div>

      <h3>Stat distribution</h3>
      <div className="row">
        {summaries.map(s => (
          <Viz key={s.stat} title={STAT_LABEL[s.stat]} sub={`mean ${s.mean.toFixed(2)} · sd ${s.sd.toFixed(2)} · range ${s.min}–${s.max} · ${survivalFailCount[STATS.indexOf(s.stat)]} below ${survival} (doc ${DOC_CONSTANTS.localSurvivalThreshold}: ${docSurvivalFailCount[STATS.indexOf(s.stat)]})`}>
            <Columns values={s.hist.slice(1)} labels={s.hist.slice(1).map((_, i) => String(i + 1))} width={300} />
          </Viz>
        ))}
      </div>

      <h3>Power ranking</h3>
      <div className="row">
        <Viz title="Strongest 25 by power" sub="Mean 1v1 win rate across the 8 stats">
          <HBars rows={powerSorted.slice(0, 25).map(p => ({ label: p.figure, value: p.power, tip: `${p.figure}\npower ${pct(p.power)} · total ${p.total} · best ${STAT_LABEL[p.bestStat]}` }))} format={pct} max={1} width={430} highlight={focus ? l => l === focus : undefined} />
        </Viz>
        <Viz title="Weakest 25 by power" sub="Candidates for a buff or a stronger trait">
          <HBars rows={[...powerSorted].reverse().slice(0, 25).map(p => ({ label: p.figure, value: p.power, tip: `${p.figure}\npower ${pct(p.power)} · total ${p.total} · best ${STAT_LABEL[p.bestStat]}` }))} format={pct} max={1} width={430} highlight={focus ? l => l === focus : undefined} />
        </Viz>
        <Viz title="Top-10 concentration per stat" sub="Share of all stat points held by the 10 best cards in that stat; higher = a few cards dominate that scenario">
          <HBars rows={STATS.map((s, i) => ({ label: STAT_LABEL[s], value: concentration[i] }))} format={pct} max={0.5} width={360} />
        </Viz>
      </div>

      <h3>Who wins a {STAT_LABEL[stat]} conflict</h3>
      <div className="row">
        <Viz title={`Top 8 in ${STAT_LABEL[stat]}`} sub="Base stat only; traits and followers add on top (see Simulator)">
          <HBars rows={topPerStat[STATS.indexOf(stat)].map(c => ({ label: c.figureName, value: c[stat] }))} max={maxStat} width={400} highlight={focus ? l => l === focus : undefined} />
        </Viz>
        <Viz title="All cards, every stat" sub="One dot per card; the focus card is highlighted">
          <Strip rows={STATS.map(s => ({ label: STAT_LABEL[s], items: cards.map(c => ({ name: c.figureName, value: c[s] })) }))} width={640} domain={[0, maxStat]} highlight={focus || null} />
        </Viz>
      </div>

      <h3>Group averages</h3>
      <div className="row">
        <Viz title="Mean stat by era" sub="Eras with a hot column win that scenario type more often in all-era games">
          <Heatmap rows={ERAS} cols={STATS.map(s => SHORT[s])} values={ERAS.map(e => { const r = eraMeans.find(x => x.group === e); return STATS.map(s => r?.means[s] ?? 0) })} cellW={56} />
        </Viz>
        <Viz title="Mean stat by gender">
          <Heatmap rows={genderMeans.map(g => `${g.group} (${g.n})`)} cols={STATS.map(s => SHORT[s])} values={genderMeans.map(g => STATS.map(s => g.means[s]))} cellW={56} />
        </Viz>
      </div>
      <Viz title="Mean stat by identity" sub="Identity bonus (+3 followers) is only reachable through these GPs; identities with n = 1–2 are fragile">
        <Heatmap rows={identityMeans.map(g => `${g.group} (${g.n})`)} cols={STATS.map(s => SHORT[s])} values={identityMeans.map(g => STATS.map(s => g.means[s]))} cellW={56} cellH={18} labelW={140} />
      </Viz>

      <h3>Survival and hazards</h3>
      <div className="row">
        <Viz title={`Cards that fail a solo survival (< ${survival}) per stat`} sub="A lone GP on a Local Survival of this stat is discarded">
          <HBars rows={STATS.map((s, i) => ({ label: STAT_LABEL[s], value: survivalFailCount[i] }))} max={cards.length} width={360} />
        </Viz>
        <Viz title={`Cards that die alone to any hazard (min stat < ${hazard})`} sub="Hazard checks the minimum over all 8 per-stat totals; a follower of the weak stat fixes it">
          <HBars rows={hazardFails.sort((a, b) => a.minStat - b.minStat).slice(0, 30).map(p => ({ label: p.figure, value: p.minStat, tip: `${p.figure}: min stat ${p.minStat}` }))} max={hazard} width={360} />
        </Viz>
      </div>

      <h3>Achievement reachability (engine rules)</h3>
      <div className="row">
        <Viz title="Hardest achievements" sub="Win rate of the card in its mapped stat against 'worthy' opponents (≥ 5 in that stat); low = the card rarely earns its point">
          <HBars rows={achRows.slice(0, 25).map(p => ({ label: p.figure, value: p.achievementWinRate ?? 0, tip: `${p.figure}: ${STAT_LABEL[p.achievementStat!]} ${pct(p.achievementWinRate ?? 0)}` }))} format={pct} max={1} width={430} />
        </Viz>
        <Viz title="Easiest achievements">
          <HBars rows={[...achRows].reverse().slice(0, 25).map(p => ({ label: p.figure, value: p.achievementWinRate ?? 0, tip: `${p.figure}: ${STAT_LABEL[p.achievementStat!]} ${pct(p.achievementWinRate ?? 0)}` }))} format={pct} max={1} width={430} />
        </Viz>
        <div className="card" style={{ flex: '1 1 300px' }}>
          <h4>Unreachable ({unmapped.length})</h4>
          <p className="small">Not in ACHIEVEMENT_SPECS, so the tick code never fires:</p>
          <p className="small">{unmapped.map(p => p.figure).join(', ')}</p>
        </div>
      </div>

      <h3>Trait impact (engine-implemented only)</h3>
      <Viz title="Maximum stat swing per implemented trait" sub="Compare with a follower's 2–3 and the median stat; Lancelot and Marie Antoinette include negative effects">
        <HBars rows={traitRows} width={520} />
      </Viz>
    </div>
  )
}
