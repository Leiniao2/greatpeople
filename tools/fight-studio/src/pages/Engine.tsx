import { useState } from 'react'
import { useStore } from '../lib/store'
import type { EngineJob } from '../types'

function fmtTime(t: number) {
  return new Date(t).toLocaleTimeString()
}

function JobCard({ job, onRevert }: { job: EngineJob; onRevert: () => void }) {
  const [showReport, setShowReport] = useState(false)
  const [showDiff, setShowDiff] = useState(job.status !== 'running')
  const tcBad = job.typecheck && Object.values(job.typecheck).some(v => v && v !== 'ok')
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span className={`status ${job.status === 'done' ? 'implemented' : job.status === 'running' ? 'partial' : job.status === 'failed' ? 'missing' : 'unspecified'}`}>{job.status}</span>
        <b>{job.id}</b>
        <span className="small">started {fmtTime(job.startedAt)}{job.finishedAt ? `, finished ${fmtTime(job.finishedAt)}` : ''}{job.costUsd != null ? ` · $${job.costUsd.toFixed(2)}` : ''}</span>
        <span className="spacer" />
        {job.status !== 'running' && job.status !== 'reverted' && job.touched.length > 0 && (
          <button className="btn danger" onClick={onRevert}>Revert this job's file changes</button>
        )}
      </div>
      {job.instruction && <p className="small"><b>Instruction:</b> {job.instruction}</p>}
      <details open={showReport} onToggle={e => setShowReport((e.target as HTMLDetailsElement).open)}>
        <summary className="small">Change report sent to the agent</summary>
        <pre className="out">{job.report || '(none)'}</pre>
      </details>
      <h4 style={{ marginTop: 10 }}>Agent log</h4>
      <div className="joblog">
        {job.log.map((l, i) => (
          <div key={i} className={`jl ${l.kind}`}><span className="jt">{fmtTime(l.t)}</span>{l.kind === 'tool' ? '⚙ ' : l.kind === 'error' ? '✖ ' : l.kind === 'info' ? 'ℹ ' : ''}{l.text}</div>
        ))}
        {job.status === 'running' && <div className="jl info">… working</div>}
      </div>
      {job.result && (
        <>
          <h4 style={{ marginTop: 10 }}>Agent summary</h4>
          <pre className="out">{job.result}</pre>
        </>
      )}
      {job.status !== 'running' && (
        <>
          <h4 style={{ marginTop: 10 }}>Files touched ({job.touched.length})</h4>
          {job.touched.length === 0 ? <p className="small">No files changed.</p> : (
            <ul className="small" style={{ paddingLeft: 18 }}>
              {job.touched.map(t => <li key={t.path}><span className="mono">{t.path}</span> {t.dirtyBefore && <span className="pill" title="This file already had uncommitted edits before the job; revert will leave it alone.">had other edits</span>}{!t.existedBefore && <span className="pill">new</span>}</li>)}
            </ul>
          )}
          {job.typecheck && Object.keys(job.typecheck).length > 0 && (
            <p className="small">Typecheck: {Object.entries(job.typecheck).map(([k, v]) => <span key={k} className={`status ${v === 'ok' ? 'implemented' : 'missing'}`} style={{ marginRight: 6 }}>{k}: {v === 'ok' ? 'ok' : 'errors'}</span>)}</p>
          )}
          {tcBad && <pre className="out error">{Object.values(job.typecheck!).filter(v => v && v !== 'ok').join('\n')}</pre>}
          {job.diff && (
            <details open={showDiff} onToggle={e => setShowDiff((e.target as HTMLDetailsElement).open)}>
              <summary className="small">Diff</summary>
              <pre className="out diffview">{job.diff.split('\n').map((l, i) => <span key={i} className={l.startsWith('+') && !l.startsWith('+++') ? 'pos' : l.startsWith('-') && !l.startsWith('---') ? 'neg' : ''}>{l}{'\n'}</span>)}</pre>
            </details>
          )}
        </>
      )}
    </div>
  )
}

export default function Engine() {
  const { jobs, runJob, revertJob, pendingReport, applyToEngine, setApplyToEngine, dirty } = useStore()
  const [instruction, setInstruction] = useState('')
  const [starting, setStarting] = useState(false)
  const anyDirty = Object.values(dirty).some(Boolean)

  const start = async (withReport: boolean) => {
    setStarting(true)
    try { await runJob(withReport ? pendingReport.report : '', instruction); setInstruction('') } finally { setStarting(false) }
  }

  return (
    <div className="page">
      <h2>Engine sync</h2>
      <p className="lead">
        Saving rule text, rulebook edits or card trait/achievement text produces a change report. With engine sync on, <b>Save all changes</b> hands that report to
        Claude Code running headless in the repo: it edits <span className="mono">web/src/pages/BattlePage.tsx</span>, keeps this tool's engine mirrors in step, updates the rules registry rows, and typechecks.
        The web dev server (port 3001) hot-reloads the result; production needs a redeploy. Stat and bonus edits go straight into <span className="mono">data/*.json</span> and are synced to the platforms on save, with no agent involved.
      </p>
      <div className="row">
        <div className="card" style={{ flex: '1 1 480px' }}>
          <h4>Run the engine agent now</h4>
          <label className="small"><input type="checkbox" checked={applyToEngine} onChange={e => setApplyToEngine(e.target.checked)} /> send behavioural changes to the engine agent on Save all changes</label>
          <p className="small" style={{ marginTop: 8 }}>Optional instruction for the agent (used alone, or together with the pending change report):</p>
          <textarea className="editor" style={{ minHeight: 90 }} placeholder="e.g. Implement Gandhi's Mahatma trait: while Gandhi is public on the field, local conflict events have no effect." value={instruction} onChange={e => setInstruction(e.target.value)} />
          <div className="toolbar">
            <button className="btn primary" disabled={starting || !instruction.trim()} onClick={() => void start(false)}>Run instruction only</button>
            <button className="btn" disabled={starting || (!pendingReport.report && !instruction.trim())} onClick={() => void start(true)} title={anyDirty ? 'Unsaved edits are included in the report; save first so the files match.' : ''}>Run with pending change report</button>
          </div>
        </div>
        <div className="card" style={{ flex: '1 1 480px' }}>
          <h4>Pending change report {pendingReport.behavioural ? <span className="status conflict">behavioural</span> : <span className="status unspecified">data-only / none</span>}</h4>
          <pre className="out" style={{ maxHeight: 260, overflow: 'auto' }}>{pendingReport.report || 'No unsaved changes.'}</pre>
        </div>
      </div>
      <h3>Jobs</h3>
      {jobs.length === 0 && <p className="small">No engine jobs yet this session.</p>}
      {jobs.map(j => <JobCard key={j.id} job={j} onRevert={() => void revertJob(j.id)} />)}
    </div>
  )
}
