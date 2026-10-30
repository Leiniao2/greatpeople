import { useState } from 'react'
import { useStore } from './lib/store'
import type { FileKey } from './types'
import Overview from './pages/Overview'
import Rules from './pages/Rules'
import Docs from './pages/Docs'
import GreatPeople from './pages/GreatPeople'
import Followers from './pages/Followers'
import Locations from './pages/Locations'
import Balance from './pages/Balance'
import Simulator from './pages/Simulator'

type Tab = 'overview' | 'rules' | 'docs' | 'gp' | 'followers' | 'locations' | 'balance' | 'sim'

const TABS: { id: Tab; label: string; files: FileKey[] }[] = [
  { id: 'overview', label: 'Overview', files: [] },
  { id: 'rules', label: 'Rules registry', files: ['rules'] },
  { id: 'docs', label: 'Docs', files: ['fightMd', 'traitIdeaMd', 'cardMd'] },
  { id: 'gp', label: 'Great People', files: ['cards'] },
  { id: 'followers', label: 'Followers', files: ['followers'] },
  { id: 'locations', label: 'Locations', files: ['locationCards'] },
  { id: 'balance', label: 'Balance', files: [] },
  { id: 'sim', label: 'Simulator', files: [] },
]

export default function App() {
  const [tab, setTab] = useState<Tab>((location.hash.slice(1) as Tab) || 'overview')
  const { dirty, busy, saveAll } = useStore()
  const anyDirty = Object.values(dirty).some(Boolean)

  const go = (t: Tab) => { setTab(t); location.hash = t }

  return (
    <>
      <div className="topbar">
        <h1>Fight Studio</h1>
        <span className="internal">internal · localhost only</span>
        <nav className="tabs">
          {TABS.map(t => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => go(t.id)}>
              {t.label}{t.files.some(f => dirty[f]) && <span className="dot" title="unsaved changes" />}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        {busy && <span className="busy">{busy}</span>}
        <button className="btn primary" disabled={!anyDirty || !!busy} onClick={() => void saveAll()}>Save all changes</button>
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'rules' && <Rules />}
      {tab === 'docs' && <Docs />}
      {tab === 'gp' && <GreatPeople />}
      {tab === 'followers' && <Followers />}
      {tab === 'locations' && <Locations />}
      {tab === 'balance' && <Balance />}
      {tab === 'sim' && <Simulator />}
    </>
  )
}
