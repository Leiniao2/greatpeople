import { useMemo } from 'react'
import { useStore } from '../lib/store'
import { identityCoverage } from '../lib/engine'
import { ENGINE_CONSTANTS } from '../lib/engineTraits'
import { STATS, STAT_LABEL, type FollowerTemplate, type StatKey } from '../types'
import { HBars, Viz } from '../charts'

export default function Followers() {
  const { data, saved, update, save, revert, dirty, meta } = useStore()
  const followers = data.followers
  const coverage = useMemo(() => identityCoverage(data.cards, followers), [data.cards, followers])
  const set = (name: string, patch: Partial<FollowerTemplate>) => update('followers', followers.map(f => (f.name === name ? { ...f, ...patch } : f)))
  const savedByName = new Map(saved.followers.map(f => [f.name, f]))
  return (
    <div className="page">
      <h2>Followers <span className="small mono">{meta.followers.path}</span></h2>
      <p className="lead">
        A follower adds its bonus to the contested stat when the stat matches; the engine raises it to {ENGINE_CONSTANTS.followerIdentityMatchBonus} when an allied GP at the location has the same identity.
        Deck = {ENGINE_CONSTANTS.followerDeckCopies} copies × {followers.length} templates. Coverage shows how many GPs can unlock the identity bonus.
      </p>
      <div className="toolbar">
        <span className="spacer" />
        <button className="btn" disabled={!dirty.followers} onClick={() => revert('followers')}>Revert</button>
        <button className="btn primary" disabled={!dirty.followers} onClick={() => void save('followers')}>Save followers.json</button>
      </div>
      <div className="row">
        <table className="grid" style={{ flex: '1 1 600px' }}>
          <thead><tr><th>Identity</th><th>Stat</th><th>Bonus</th><th>GPs with identity</th><th>Figures</th></tr></thead>
          <tbody>
            {followers.map(f => {
              const cov = coverage.find(c => c.identity === f.name)!
              const s = savedByName.get(f.name)
              return (
                <tr key={f.name}>
                  <td><img className="portrait" src={`/followers/${f.imageKey}.webp`} alt="" loading="lazy" />{f.name}</td>
                  <td><select value={f.stat} onChange={e => set(f.name, { stat: e.target.value as StatKey })}>{STATS.map(st => <option key={st} value={st}>{STAT_LABEL[st]}</option>)}</select></td>
                  <td className={`num ${s && s.bonus !== f.bonus ? 'changed' : ''}`}><input type="number" value={f.bonus} onChange={e => set(f.name, { bonus: Number(e.target.value) })} /></td>
                  <td className="num" style={{ color: cov.gpCount === 0 ? 'var(--serious)' : undefined }}>{cov.gpCount}</td>
                  <td className="small">{cov.figures.join(', ')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <Viz title="GPs per follower identity" sub="How many Great People can grant the identity-match bonus to this follower">
          <HBars rows={[...coverage].sort((a, b) => b.gpCount - a.gpCount).map(c => ({ label: c.identity, value: c.gpCount }))} width={380} />
        </Viz>
      </div>
    </div>
  )
}
