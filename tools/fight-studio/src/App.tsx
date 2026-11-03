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
import Engine from './pages/Engine'

type Tab = 'overview' | 'rules' | 'docs' | 'gp' | 'followers' | 'locations' | 'balance' | 'sim' | 'engine'

const TABS: { id: Tab; label: string; files: FileKey[] }[] = [
  { id: 'overview', label: 'Overview', files: [] },
  { id: 'rules', label: 'Rules registry', files: ['rules'] },
  { id: 'docs', label: 'Docs', files: ['fightMd', 'traitIdeaMd', 'cardMd'] },
  { id: 'gp', label: 'Great People', files: ['cards'] },
  { id: 'followers', label: 'Followers', files: ['followers'] },
  { id: 'locations', label: 'Locations', files: ['locationCards'] },
  { id: 'balance', label: 'Balance', files: [] },
  { id: 'sim', label: 'Simulator', files: [] },
  { id: 'engine', label: 'Engine sync', files: [] },
]

export default function App() {
  const [tab, setTab] = useState<Tab>((location.hash.slice(1) as Tab) || 'overview')
  const { dirty, busy, saveAll, notice, jobs, applyToEngine, setApplyToEngine, pendingReport, autoCommit, setAutoCommit, engineMode } = useStore()
  const anyDirty = Object.values(dirty).some(Boolean)
  const running = jobs.filter(j => j.status === 'running').length
  const reviewing = jobs.filter(j => j.status === 'review').length
  const engine = pendingReport.behavioural && applyToEngine
  const saveLabel = `Save all${autoCommit ? ' & commit' : ''}${engine ? (engineMode === 'preview' ? ' · preview engine change' : ' · update engine') : ''}`

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
        {notice && <span className="busy" title={notice}>{notice.length > 90 ? notice.slice(0, 88) + '…' : notice}</span>}
        {busy && <span className="busy">{busy}</span>}
        {running > 0 && <button className="btn" onClick={() => go('engine')}><span className="dot" /> {running} engine job{running > 1 ? 's' : ''} running</button>}
        {reviewing > 0 && <button className="btn" onClick={() => go('engine')}>{reviewing} engine change{reviewing > 1 ? 's' : ''} to review</button>}
        <label className="small" title="When on, Save all also sends rule/trait text changes to Claude Code to update the engine (mode set on the Engine sync tab)."><input type="checkbox" checked={applyToEngine} onChange={e => setApplyToEngine(e.target.checked)} /> engine sync</label>
        <label className="small" title="When on, every save is committed, and engine changes are committed once applied."><input type="checkbox" checked={autoCommit} onChange={e => setAutoCommit(e.target.checked)} /> commit</label>
        <button className="btn primary" disabled={!anyDirty || !!busy} onClick={() => void saveAll()} title={engine ? (engineMode === 'preview' ? 'Saves, then has the agent prepare an engine diff for your approval' : 'Saves, then has the agent update the engine directly') : 'Saves to the repo files'}>
          {saveLabel}
        </button>
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'rules' && <Rules />}
      {tab === 'docs' && <Docs />}
      {tab === 'gp' && <GreatPeople />}
      {tab === 'followers' && <Followers />}
      {tab === 'locations' && <Locations />}
      {tab === 'balance' && <Balance />}
      {tab === 'sim' && <Simulator />}
      {tab === 'engine' && <Engine />}
    </>
  )
}
