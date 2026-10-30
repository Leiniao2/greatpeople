import { useCallback, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useSort } from '../lib/table'
import { locationBonusByEra } from '../lib/engine'
import { ERAS, STATS, STAT_LABEL, type LocationCard, type StatKey } from '../types'
import { Heatmap, Viz } from '../charts'

const SHORT: Record<StatKey, string> = { politics: 'Pol', strength: 'Str', culture: 'Cul', wealth: 'Wea', intelligence: 'Int', technique: 'Tec', belief: 'Bel', reputation: 'Rep' }

export default function Locations() {
  const { data, saved, update, save, revert, dirty, meta } = useStore()
  const locs = data.locationCards
  const [era, setEra] = useState('all')
  const [q, setQ] = useState('')
  const savedById = useMemo(() => new Map(saved.locationCards.map(l => [l.id, l])), [saved.locationCards])
  const byEra = useMemo(() => locationBonusByEra(locs), [locs])
  const set = useCallback((id: string, patch: Partial<LocationCard>) => update('locationCards', locs.map(l => (l.id === id ? { ...l, ...patch } : l))), [locs, update])
  const setBonus = (l: LocationCard, s: StatKey, v: number) => {
    const bonuses = { ...l.bonuses }
    if (v) bonuses[s] = v; else delete bonuses[s]
    set(l.id, { bonuses })
  }
  const filtered = useMemo(() => locs.filter(l => (era === 'all' || l.era === era) && (!q || `${l.name} ${l.trait} ${l.buildings.join(' ')} ${l.countries.join(' ')}`.toLowerCase().includes(q.toLowerCase()))), [locs, era, q])
  const get = useCallback((l: LocationCard, k: string): string | number => {
    if (STATS.includes(k as StatKey)) return l.bonuses[k as StatKey] ?? 0
    if (k === 'sum') return STATS.reduce((a, s) => a + (l.bonuses[s] ?? 0), 0)
    if (k === 'capacity') return l.capacity
    return String((l as unknown as Record<string, unknown>)[k] ?? '')
  }, [])
  const { sorted, Th } = useSort(filtered, 'era', get)
  const inPool = useMemo(() => new Set(data.locations.locations.map(l => `${l.era}-${l.name}`)), [data.locations])

  return (
    <div className="page">
      <h2>Locations <span className="small mono">{meta.locationCards.path}</span></h2>
      <p className="lead">
        The engine adds a location's bonus for the contested stat to every GP there during a conflict (not during survival, hazard or global competition).
        Location trait texts and capacity are data only; nothing executes them. Rows not in locations.json cannot appear on the board.
      </p>
      <div className="toolbar">
        <input type="text" placeholder="search…" value={q} onChange={e => setQ(e.target.value)} />
        <select value={era} onChange={e => setEra(e.target.value)}><option value="all">all eras</option>{ERAS.map(e => <option key={e}>{e}</option>)}</select>
        <span className="small">{sorted.length} of {locs.length}</span>
        <span className="spacer" />
        <button className="btn" disabled={!dirty.locationCards} onClick={() => revert('locationCards')}>Revert</button>
        <button className="btn primary" disabled={!dirty.locationCards} onClick={() => void save('locationCards')}>Save location_cards.json</button>
      </div>
      <Viz title="Total location bonus per stat, by era" sub="Sum of bonuses over the era's location cards: a stat with a high sum is easier to defend in that era">
        <Heatmap rows={ERAS} cols={STATS.map(s => SHORT[s])} values={ERAS.map(e => { const r = byEra.find(x => x.era === e); return STATS.map(s => r?.sums[s] ?? 0) })} format={v => String(v)} cellW={56} />
      </Viz>
      <table className="grid" style={{ marginTop: 16 }}>
        <thead><tr>
          <Th k="name">Location</Th><Th k="era">Era</Th><th>Buildings</th><Th k="capacity">Cap</Th>
          {STATS.map(s => <Th key={s} k={s}>{SHORT[s]}</Th>)}<Th k="sum">Σ</Th><th>Trait (text only)</th>
        </tr></thead>
        <tbody>
          {sorted.map(l => {
            const s = savedById.get(l.id)
            return (
              <tr key={l.id}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <img className="portrait" src={`/locations/${l.imageKey}.webp`} alt="" loading="lazy" />{l.name}
                  {!inPool.has(`${l.era}-${l.name}`) && <span className="pill" title="not in locations.json: never drawn">off-board</span>}
                  <div className="small">{l.countries.join(', ')}</div>
                </td>
                <td>{l.era}</td>
                <td>{l.buildings.map(b => <span key={b} className="pill">{b}</span>)}</td>
                <td className="num"><input type="number" min={0} value={l.capacity} onChange={e => set(l.id, { capacity: Number(e.target.value) })} /></td>
                {STATS.map(st => (
                  <td key={st} className={`num ${s && (s.bonuses[st] ?? 0) !== (l.bonuses[st] ?? 0) ? 'changed' : ''}`} title={STAT_LABEL[st]}>
                    <input type="number" min={0} value={l.bonuses[st] ?? 0} onChange={e => setBonus(l, st, Number(e.target.value))} />
                  </td>
                ))}
                <td className="num">{STATS.reduce((a, st) => a + (l.bonuses[st] ?? 0), 0)}</td>
                <td style={{ minWidth: 300 }}><textarea value={l.trait} onChange={e => set(l.id, { trait: e.target.value })} className={s && s.trait !== l.trait ? 'changed' : ''} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
