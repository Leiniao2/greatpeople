import { useCallback, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useSort } from '../lib/table'
import { IMPLEMENTED_TRAITS, ENGINE_CONSTANTS } from '../lib/engineTraits'
import { careerStart, careerYears, defaultEffect, describeLegacyEffect, formatYear, powerTable, statTotal, type PowerRow } from '../lib/engine'
import { matchIdeaToFigure, parseTraitIdeas } from '../lib/markdown'
import { ERAS, LEGACY_CONTEXTS, LEGACY_KINDS, STATS, STAT_LABEL, type Card, type Legacy, type LegacyEffect, type StatKey } from '../types'

const SHORT: Record<StatKey, string> = { politics: 'Pol', strength: 'Str', culture: 'Cul', wealth: 'Wea', intelligence: 'Int', technique: 'Tec', belief: 'Bel', reputation: 'Rep' }

export default function GreatPeople() {
  const { data, saved, update, save, revert, dirty, meta } = useStore()
  const cards = data.cards
  const [q, setQ] = useState('')
  const [era, setEra] = useState('all')
  const [gender, setGender] = useState('all')
  const [identity, setIdentity] = useState('all')
  const [onlyImplemented, setOnlyImplemented] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const power = useMemo(() => new Map(powerTable(cards).map(r => [r.id, r])), [cards])
  const savedById = useMemo(() => new Map(saved.cards.map(c => [c.id, c])), [saved.cards])
  const identities = useMemo(() => [...new Set(cards.flatMap(c => c.identities))].sort(), [cards])
  const ideas = useMemo(() => {
    const parsed = parseTraitIdeas(data.traitIdeaMd)
    const names = cards.map(c => c.figureName)
    const m = new Map<string, { name: string; trait: string; achievement: string }>()
    for (const idea of parsed) { const f = matchIdeaToFigure(idea.name, names); if (f) m.set(f, idea) }
    return m
  }, [data.traitIdeaMd, cards])

  const setCard = useCallback((id: string, patch: Partial<Card>) => {
    update('cards', cards.map(c => (c.id === id ? { ...c, ...patch } : c)))
  }, [cards, update])

  const filtered = useMemo(() => cards.filter(c =>
    (era === 'all' || c.era === era) &&
    (gender === 'all' || c.gender === gender) &&
    (identity === 'all' || c.identities.includes(identity)) &&
    (!onlyImplemented || !!IMPLEMENTED_TRAITS[c.figureName]) &&
    (!q || `${c.figureName} ${c.trait} ${c.achievement} ${c.legacy.name} ${c.identities.join(' ')} ${c.countries?.join(' ') ?? ''}`.toLowerCase().includes(q.toLowerCase())),
  ), [cards, era, gender, identity, onlyImplemented, q])

  const get = useCallback((c: Card, k: string): string | number => {
    if (k === 'total') return statTotal(c)
    if (k === 'power') return power.get(c.id)?.power ?? 0
    if (k === 'min') return power.get(c.id)?.minStat ?? 0
    if (k === 'born') return c.born
    if (k === 'career') return careerYears(c)
    if (k === 'legacy') return `${c.legacy.effect.kind} ${c.legacy.name}`
    if (STATS.includes(k as StatKey)) return c[k as StatKey]
    return String((c as unknown as Record<string, unknown>)[k] ?? '')
  }, [power])
  const { sorted, Th } = useSort(filtered, 'figureName', get)

  const sel = selected ? cards.find(c => c.id === selected) ?? null : null

  return (
    <div className="page">
      <h2>Great People <span className="small mono">{meta.cards.path}</span></h2>
      <p className="lead">Stats, identities, life years, trait and legacy for every GP. Numbers are editable in place; the Power column (mean 1v1 win rate over the 8 stats) and the Balance tab recompute live, so you can see the effect before saving. Life years and legacies are data: the engine reads them directly, so saving changes the game without the engine agent. Select a row to edit its legacy.</p>
      <div className="toolbar">
        <input type="text" placeholder="search name / trait / legacy…" value={q} onChange={e => setQ(e.target.value)} style={{ width: 280 }} />
        <select value={era} onChange={e => setEra(e.target.value)}><option value="all">all eras</option>{ERAS.map(e => <option key={e}>{e}</option>)}</select>
        <select value={gender} onChange={e => setGender(e.target.value)}><option value="all">any gender</option><option value="male">male</option><option value="female">female</option></select>
        <select value={identity} onChange={e => setIdentity(e.target.value)}><option value="all">any identity</option>{identities.map(i => <option key={i}>{i}</option>)}</select>
        <label className="small"><input type="checkbox" checked={onlyImplemented} onChange={e => setOnlyImplemented(e.target.checked)} /> trait has engine effect</label>
        <span className="small">{sorted.length} of {cards.length}</span>
        <span className="spacer" />
        <button className="btn" disabled={!dirty.cards} onClick={() => revert('cards')}>Revert</button>
        <button className="btn primary" disabled={!dirty.cards} onClick={() => void save('cards')}>Save cards.json</button>
      </div>

      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <div style={{ flex: '1 1 auto' }}>
          <table className="grid">
            <thead><tr>
              <Th k="figureName">Figure</Th><Th k="era">Era</Th><th>Identities</th>
              {STATS.map(s => <Th key={s} k={s}>{SHORT[s]}</Th>)}
              <Th k="total">Total</Th><Th k="min">Min</Th><Th k="power">Power</Th><Th k="born">Life</Th><th>Trait</th><Th k="legacy">Legacy</Th>
            </tr></thead>
            <tbody>
              {sorted.map(c => {
                const s = savedById.get(c.id)
                const p = power.get(c.id)!
                const impl = IMPLEMENTED_TRAITS[c.figureName]
                return (
                  <tr key={c.id} className={selected === c.id ? 'changed' : ''} onClick={() => setSelected(c.id)}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <img className="portrait" src={`/portraits/portrait_${c.portraitKey}.webp`} alt="" loading="lazy" />
                      {c.figureName}
                      <div className="small">{c.gender} · {c.years}</div>
                    </td>
                    <td>{c.era}</td>
                    <td>{c.identities.map(i => <span key={i} className="pill">{i}</span>)}</td>
                    {STATS.map(st => (
                      <td key={st} className={`num ${s && s[st] !== c[st] ? 'changed' : ''}`} title={`${STAT_LABEL[st]} · 1v1 win rate ${(p.winRate[st] * 100).toFixed(0)}%`}>
                        <input type="number" min={0} max={30} value={c[st]} onClick={e => e.stopPropagation()}
                          onChange={e => setCard(c.id, { [st]: Number(e.target.value) } as Partial<Card>)} />
                      </td>
                    ))}
                    <td className="num">{statTotal(c)}</td>
                    <td className="num" style={{ color: p.minStat < ENGINE_CONSTANTS.hazardMinStatThreshold ? 'var(--serious)' : undefined }}>{p.minStat}</td>
                    <td className="num"><span className="bar"><i style={{ width: `${p.power * 100}%` }} /></span> {(p.power * 100).toFixed(0)}%</td>
                    <td style={{ minWidth: 260 }}>
                      <textarea value={c.trait} onClick={e => e.stopPropagation()} onChange={e => setCard(c.id, { trait: e.target.value })} className={s && s.trait !== c.trait ? 'changed' : ''} />
                      {impl ? <span className={`status ${impl.matchesCardText ? 'implemented' : 'conflict'}`}>{impl.matchesCardText ? 'engine ✓' : 'engine differs'}</span> : <span className="status missing">no engine effect</span>}
                    </td>
                    <td className={`small ${s && (s.born !== c.born || s.died !== c.died || s.careerAge !== c.careerAge) ? 'changed' : ''}`} style={{ whiteSpace: 'nowrap' }}
                      title={`Career ${formatYear(careerStart(c))} – ${c.died == null ? 'living' : formatYear(c.died)}: ${careerYears(c)} playable years`}>
                      {formatYear(c.born)} – {c.died == null ? 'living' : formatYear(c.died)}
                      <div>career {formatYear(careerStart(c))}{c.careerAge != null ? ` (age ${c.careerAge})` : ''} · {careerYears(c)}y</div>
                    </td>
                    <td style={{ minWidth: 240 }} className={s && JSON.stringify(s.legacy) !== JSON.stringify(c.legacy) ? 'changed' : ''}>
                      <b>{c.legacy.name}</b> <span className="pill">{c.legacy.effect.kind}</span>
                      <div className="small">{describeLegacyEffect(c.legacy.effect)}</div>
                      <div className="small">unlock: {c.legacy.unlock.wins} {STAT_LABEL[c.legacy.unlock.stat]} win{c.legacy.unlock.wins > 1 ? 's' : ''}{p.achievementWinRate != null ? ` · ${(p.achievementWinRate * 100).toFixed(0)}% 1v1 vs worthy` : ''}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {sel && <Detail card={sel} power={power.get(sel.id)!} idea={ideas.get(sel.figureName)} setCard={setCard} onClose={() => setSelected(null)} identities={identities} />}
      </div>
    </div>
  )
}

function Detail({ card, power, idea, setCard, onClose, identities }: {
  card: Card; power: PowerRow; idea?: { name: string; trait: string; achievement: string }
  setCard: (id: string, patch: Partial<Card>) => void; onClose: () => void; identities: string[]
}) {
  const impl = IMPLEMENTED_TRAITS[card.figureName]
  const achStat = card.legacy.unlock.stat
  const setLegacy = (patch: Partial<Legacy>) => setCard(card.id, { legacy: { ...card.legacy, ...patch } })
  const setEffect = (patch: Record<string, unknown>) => setLegacy({ effect: { ...card.legacy.effect, ...patch } as LegacyEffect })
  const e = card.legacy.effect as Record<string, unknown> & LegacyEffect
  return (
    <div className="card detail">
      <div style={{ display: 'flex', gap: 12 }}>
        <img className="portrait lg" src={`/portraits/portrait_${card.portraitKey}.webp`} alt="" />
        <div>
          <h3 style={{ margin: 0 }}>{card.figureName}</h3>
          <div className="small">{card.era} · {card.gender} · {card.years} · {card.countries?.join(', ')}</div>
          <div className="small" style={{ marginTop: 6 }}>{card.lore}</div>
          <button className="btn" style={{ marginTop: 8 }} onClick={onClose}>close</button>
        </div>
      </div>
      <dl>
        <dt>Identities</dt>
        <dd>
          {card.identities.map(i => <span key={i} className="pill">{i} <a href="#" onClick={e => { e.preventDefault(); setCard(card.id, { identities: card.identities.filter(x => x !== i) }) }}>×</a></span>)}
          <select value="" onChange={e => { if (e.target.value) setCard(card.id, { identities: [...card.identities, e.target.value] }) }}>
            <option value="">+ add</option>{identities.filter(i => !card.identities.includes(i)).map(i => <option key={i}>{i}</option>)}
          </select>
        </dd>
        <dt>Era</dt><dd><select value={card.era} onChange={e => setCard(card.id, { era: e.target.value })}>{ERAS.map(e => <option key={e}>{e}</option>)}</select></dd>
        <dt>Gender</dt><dd><select value={card.gender} onChange={e => setCard(card.id, { gender: e.target.value })}><option>male</option><option>female</option></select></dd>
        <dt>Life</dt>
        <dd className="small">
          born <input type="number" value={card.born} onChange={ev => setCard(card.id, { born: Number(ev.target.value) })} style={{ width: 80 }} />
          {' '}died <input type="number" value={card.died ?? ''} placeholder="living" onChange={ev => setCard(card.id, { died: ev.target.value === '' ? null : Number(ev.target.value) })} style={{ width: 80 }} />
          {' '}career age <input type="number" min={ENGINE_CONSTANTS.minCareerAge} value={card.careerAge ?? ''} placeholder={String(ENGINE_CONSTANTS.defaultCareerAge)}
            onChange={ev => setCard(card.id, { careerAge: ev.target.value === '' ? undefined : Number(ev.target.value) })} style={{ width: 56 }} />
          <div>Negative years are BC. Plays from {formatYear(careerStart(card))} to {card.died == null ? `the end of the timeline (${ENGINE_CONSTANTS.timelineEndYear})` : formatYear(card.died)}: {careerYears(card)} years.</div>
        </dd>
        <dt>Power</dt><dd>{(power.power * 100).toFixed(1)}% · best {STAT_LABEL[power.bestStat]} · total {power.total}</dd>
        <dt>1v1 win rate</dt>
        <dd>{STATS.map(s => <div key={s} className="small">{STAT_LABEL[s]} <span className="bar"><i style={{ width: `${power.winRate[s] * 100}%` }} /></span> {(power.winRate[s] * 100).toFixed(0)}%</div>)}</dd>
        <dt>Survival</dt>
        <dd className="small">{power.survivalFails.length ? `Alone, dies to survival in: ${power.survivalFails.map(s => STAT_LABEL[s]).join(', ')}` : 'Survives every local survival alone'}; hazard min stat {power.minStat} ({power.minStat < ENGINE_CONSTANTS.hazardMinStatThreshold ? 'dies alone' : 'survives alone'}).</dd>
      </dl>
      <h4>Trait — card text</h4>
      <p className="small">{card.trait}</p>
      <h4>Trait — engine</h4>
      {impl ? (
        <p className="small"><span className={`status ${impl.matchesCardText ? 'implemented' : 'conflict'}`}>{impl.matchesCardText ? 'matches' : 'differs'}</span> {impl.engine}<br /><i>{impl.note}</i></p>
      ) : <p className="small"><span className="status missing">missing</span> traitBonusForGP has no case for this figure.</p>}
      {idea && (
        <>
          <h4>Trait — idea doc</h4>
          <p className="small">{idea.trait || <i>blank</i>}</p>
        </>
      )}
      <h4>Legacy</h4>
      <dl>
        <dt>Name</dt><dd><input type="text" value={card.legacy.name} onChange={ev => setLegacy({ name: ev.target.value })} style={{ width: '100%' }} /></dd>
        <dt>Unlock</dt>
        <dd className="small">
          win <input type="number" min={1} value={card.legacy.unlock.wins} onChange={ev => setLegacy({ unlock: { ...card.legacy.unlock, wins: Math.max(1, Number(ev.target.value)) } })} style={{ width: 48 }} />
          {' '}<select value={achStat} onChange={ev => setLegacy({ unlock: { ...card.legacy.unlock, stat: ev.target.value as StatKey } })}>{STATS.map(st => <option key={st} value={st}>{STAT_LABEL[st]}</option>)}</select>
          {' '}fight(s): kill an enemy GP in a {STAT_LABEL[achStat]} local event whose {STAT_LABEL[achStat]} is ≥ {ENGINE_CONSTANTS.worthyOpponentMinStat}. 1v1 win rate against such rivals: {((power.achievementWinRate ?? 0) * 100).toFixed(0)}%.
        </dd>
        <dt>Effect</dt>
        <dd className="small">
          <select value={e.kind} onChange={ev => setLegacy({ effect: defaultEffect(ev.target.value as LegacyEffect['kind']) })}>{LEGACY_KINDS.map(k => <option key={k}>{k}</option>)}</select>
          {(e.kind === 'contest' || e.kind === 'follower') && (
            <> <select value={String(e.stat)} onChange={ev => setEffect({ stat: ev.target.value })}><option value="any">any stat</option>{STATS.map(st => <option key={st} value={st}>{STAT_LABEL[st]}</option>)}</select>
              {' '}+<input type="number" value={Number(e.amount)} onChange={ev => setEffect({ amount: Number(ev.target.value) })} style={{ width: 48 }} /></>
          )}
          {e.kind === 'contest' && (
            <> <select value={String(e.context)} onChange={ev => setEffect({ context: ev.target.value })}>{LEGACY_CONTEXTS.map(k => <option key={k}>{k}</option>)}</select></>
          )}
          {(e.kind === 'longevity' || e.kind === 'prodigy') && (
            <> <input type="number" value={Number(e.years)} onChange={ev => setEffect({ years: Number(ev.target.value) })} style={{ width: 48 }} /> years</>
          )}
          {e.kind === 'successors' && (
            <> +<input type="number" min={1} value={Number(e.count)} onChange={ev => setEffect({ count: Number(ev.target.value) })} style={{ width: 48 }} /> choices</>
          )}
          {e.kind === 'slots' && (
            <> +<input type="number" min={1} value={Number(e.count)} onChange={ev => setEffect({ count: Math.max(1, Number(ev.target.value)) })} style={{ width: 48 }} /> Great Person slots</>
          )}
          {e.kind === 'income' && (
            <> <select value={String(e.card)} onChange={ev => setEffect({ card: ev.target.value })}><option value="event">event</option><option value="follower">follower</option></select>
              {' '}every <input type="number" min={1} value={Number(e.every)} onChange={ev => setEffect({ every: Math.max(1, Number(ev.target.value)) })} style={{ width: 48 }} /> years</>
          )}
          <div style={{ marginTop: 4 }}>In game: <b>{describeLegacyEffect(card.legacy.effect)}</b></div>
        </dd>
        <dt>Flavour</dt><dd><textarea value={card.legacy.flavour ?? ''} onChange={ev => setLegacy({ flavour: ev.target.value || undefined })} /></dd>
        <dt>How earned (text)</dt>
        <dd>
          <textarea value={card.achievement} onChange={ev => setCard(card.id, { achievement: ev.target.value })} />
          <div className="small">The <span className="mono">achievement</span> field: the card's own wording of how the legacy is earned (the mobile apps still read it). The engine unlocks on the stat and wins above; richer conditions in this text need engine work (engine sync).</div>
        </dd>
      </dl>
      {idea && (
        <>
          <h4>Achievement — idea doc</h4>
          <p className="small">{idea.achievement || <i>blank</i>}</p>
        </>
      )}
    </div>
  )
}
