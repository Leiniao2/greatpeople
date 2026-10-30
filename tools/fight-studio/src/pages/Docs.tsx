import { useState } from 'react'
import { useStore } from '../lib/store'
import { renderMarkdown } from '../lib/markdown'
import type { FileKey } from '../types'

const DOCS: { key: FileKey; label: string }[] = [
  { key: 'fightMd', label: 'fight.md (rulebook)' },
  { key: 'traitIdeaMd', label: 'great-people-trait-idea.md' },
  { key: 'cardMd', label: 'great-people-card.md' },
]

export default function Docs() {
  const { data, update, save, revert, dirty, meta } = useStore()
  const [key, setKey] = useState<FileKey>('fightMd')
  const text = data[key] as string
  return (
    <div className="page">
      <h2>Design docs <span className="small mono">{meta[key].path}</span></h2>
      <div className="toolbar">
        {DOCS.map(d => (
          <button key={d.key} className={`btn ${key === d.key ? 'primary' : ''}`} onClick={() => setKey(d.key)}>
            {d.label}{dirty[d.key] ? ' •' : ''}
          </button>
        ))}
        <span className="spacer" />
        <button className="btn" disabled={!dirty[key]} onClick={() => revert(key)}>Revert</button>
        <button className="btn primary" disabled={!dirty[key]} onClick={() => void save(key)}>Save</button>
      </div>
      <div className="split">
        <textarea className="editor" value={text} onChange={e => update(key, e.target.value as never)} spellCheck={false} />
        <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
      </div>
    </div>
  )
}
