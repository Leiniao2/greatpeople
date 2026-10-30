import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { RULE_STATUSES, type Rule, type RuleStatus } from '../types'

export default function Rules() {
  const { data, update, save, revert, dirty, saved, meta } = useStore()
  const rules = data.rules
  const [filter, setFilter] = useState<RuleStatus | 'all'>('all')
  const [q, setQ] = useState('')
  const categories = useMemo(() => [...new Set(rules.map(r => r.category))], [rules])

  const set = (id: string, patch: Partial<Rule>) => update('rules', rules.map(r => (r.id === id ? { ...r, ...patch } : r)))
  const add = (category: string) => {
    const id = `${category.toLowerCase().replace(/[^a-z]+/g, '-')}-${Date.now().toString(36)}`
    update('rules', [...rules, { id, category, title: 'New rule', docText: '', docSource: '', codeBehaviour: '', codeSource: '', status: 'unspecified', notes: '' }])
  }
  const remove = (id: string) => update('rules', rules.filter(r => r.id !== id))
  const savedById = useMemo(() => new Map(saved.rules.map(r => [r.id, r])), [saved.rules])
  const changed = (r: Rule) => JSON.stringify(savedById.get(r.id)) !== JSON.stringify(r)

  const visible = rules.filter(r => (filter === 'all' || r.status === filter) && (!q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())))

  return (
    <div className="page">
      <h2>Rules registry <span className="small mono">{meta.rules.path}</span></h2>
      <p className="lead">Each row pairs what the design docs say with what the web engine does. Edit any cell; set the status when you resolve a conflict. Everything here is a document: changing a row does not change the game.</p>
      <div className="toolbar">
        <input type="text" placeholder="search…" value={q} onChange={e => setQ(e.target.value)} />
        <select value={filter} onChange={e => setFilter(e.target.value as RuleStatus | 'all')}>
          <option value="all">all statuses</option>
          {RULE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="small">{visible.length} of {rules.length}</span>
        <span className="spacer" />
        <button className="btn" disabled={!dirty.rules} onClick={() => revert('rules')}>Revert</button>
        <button className="btn primary" disabled={!dirty.rules} onClick={() => void save('rules')}>Save rules</button>
      </div>
      {categories.map(cat => {
        const rows = visible.filter(r => r.category === cat)
        if (!rows.length) return null
        return (
          <div key={cat}>
            <h3>{cat} <button className="btn" style={{ fontSize: 11, padding: '1px 8px' }} onClick={() => add(cat)}>+ rule</button></h3>
            <table className="grid">
              <thead><tr>
                <th style={{ width: 170 }}>Rule</th><th>Design doc says</th><th>Engine does</th><th style={{ width: 120 }}>Status</th><th style={{ width: 220 }}>Notes</th><th style={{ width: 30 }} />
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className={changed(r) ? 'changed' : ''}>
                    <td>
                      <input value={r.title} onChange={e => set(r.id, { title: e.target.value })} />
                      <div className="small mono">{r.id}</div>
                    </td>
                    <td>
                      <textarea value={r.docText} onChange={e => set(r.id, { docText: e.target.value })} />
                      <input className="small mono" placeholder="source" value={r.docSource} onChange={e => set(r.id, { docSource: e.target.value })} />
                    </td>
                    <td>
                      <textarea value={r.codeBehaviour} onChange={e => set(r.id, { codeBehaviour: e.target.value })} />
                      <input className="small mono" placeholder="source" value={r.codeSource} onChange={e => set(r.id, { codeSource: e.target.value })} />
                    </td>
                    <td>
                      <span className={`status ${r.status}`}>{r.status}</span>
                      <select value={r.status} onChange={e => set(r.id, { status: e.target.value as RuleStatus })}>
                        {RULE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td><textarea value={r.notes} onChange={e => set(r.id, { notes: e.target.value })} /></td>
                    <td><button className="btn danger" title="delete rule" onClick={() => remove(r.id)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
