import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { EngineJob, FileContents, FileKey, FileMeta } from '../types'
import { buildChangeReport } from './changes'

interface ServerFile { key: FileKey; path: string; kind: 'json' | 'md'; content: unknown }

interface StoreValue {
  loaded: boolean
  error: string | null
  root: string
  data: FileContents
  saved: FileContents
  meta: Record<FileKey, FileMeta>
  gitStatus: string
  dirty: Record<FileKey, boolean>
  update: <K extends FileKey>(key: K, next: FileContents[K]) => void
  revert: (key: FileKey) => void
  save: (key: FileKey) => Promise<void>
  /** Save every dirty file, then (if enabled) hand the behavioural diff to the engine agent. */
  saveAll: () => Promise<void>
  reload: () => Promise<void>
  sync: () => Promise<string>
  busy: string | null
  notice: string | null
  applyToEngine: boolean
  setApplyToEngine: (v: boolean) => void
  /** Preview of the report that saveAll would send right now. */
  pendingReport: { report: string; behavioural: boolean }
  jobs: EngineJob[]
  runJob: (report: string, instruction: string) => Promise<EngineJob>
  revertJob: (id: string) => Promise<void>
}

const Ctx = createContext<StoreValue | null>(null)

const KEYS: FileKey[] = ['cards', 'followers', 'locationCards', 'locations', 'rules', 'fightMd', 'traitIdeaMd', 'cardMd']

function stable(v: unknown): string {
  return typeof v === 'string' ? v : JSON.stringify(v)
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<FileContents | null>(null)
  const [saved, setSaved] = useState<FileContents | null>(null)
  const [meta, setMeta] = useState<Record<FileKey, FileMeta> | null>(null)
  const [root, setRoot] = useState('')
  const [gitStatus, setGitStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [applyToEngine, setApplyToEngine] = useState<boolean>(() => {
    try { return localStorage.getItem('fs.applyToEngine') !== 'off' } catch { return true }
  })
  const [jobs, setJobs] = useState<EngineJob[]>([])
  const dataRef = useRef<FileContents | null>(null)
  const savedRef = useRef<FileContents | null>(null)
  dataRef.current = data
  savedRef.current = saved

  const reload = useCallback(async () => {
    try {
      const json = await api<{ root: string; files: Record<FileKey, ServerFile>; gitStatus: string }>('/api/files')
      const contents = {} as FileContents
      const m = {} as Record<FileKey, FileMeta>
      for (const k of KEYS) {
        (contents as unknown as Record<string, unknown>)[k] = json.files[k].content
        m[k] = { key: k, path: json.files[k].path, kind: json.files[k].kind }
      }
      setData(contents)
      setSaved(structuredClone(contents))
      setMeta(m)
      setRoot(json.root)
      setGitStatus(json.gitStatus)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => { void reload() }, [reload])
  useEffect(() => { try { localStorage.setItem('fs.applyToEngine', applyToEngine ? 'on' : 'off') } catch { /* ignore */ } }, [applyToEngine])

  // Poll jobs while any is running (and once on load).
  const refreshJobs = useCallback(async () => {
    try { setJobs(await api<EngineJob[]>('/api/jobs')) } catch { /* server gone */ }
  }, [])
  useEffect(() => { void refreshJobs() }, [refreshJobs])
  const anyRunning = jobs.some(j => j.status === 'running')
  useEffect(() => {
    // Fast while a job streams; slow otherwise so jobs started from the API (or another tab) still appear.
    const t = setInterval(() => void refreshJobs(), anyRunning ? 1500 : 10000)
    return () => clearInterval(t)
  }, [anyRunning, refreshJobs])
  // When a job finishes, the agent may have rewritten fight_rules.json: reload unless the user has unsaved edits.
  const prevRunning = useRef(false)
  useEffect(() => {
    if (prevRunning.current && !anyRunning) {
      const d = dataRef.current, s = savedRef.current
      const clean = !!d && !!s && KEYS.every(k => stable(d[k]) === stable(s[k]))
      if (clean) void reload()
      setNotice('Engine job finished — see the Engine tab.')
    }
    prevRunning.current = anyRunning
  }, [anyRunning, reload])

  const update = useCallback(<K extends FileKey>(key: K, next: FileContents[K]) => {
    setData(d => (d ? { ...d, [key]: next } : d))
  }, [])

  const revert = useCallback((key: FileKey) => {
    setData(d => (d && saved ? { ...d, [key]: structuredClone(saved[key]) } : d))
  }, [saved])

  const save = useCallback(async (key: FileKey) => {
    const d = dataRef.current
    if (!d) return
    setBusy(`Saving ${key}…`)
    try {
      const r = await api<{ ok: boolean; path: string; sync: { ok: boolean; output: string } | null }>(`/api/file/${key}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: d[key] }),
      })
      setSaved(s => (s ? { ...s, [key]: structuredClone(d[key]) } : s))
      const gs = await api<{ gitStatus: string }>('/api/git-status')
      setGitStatus(gs.gitStatus)
      if (r.sync) setNotice(r.sync.ok ? `Saved ${r.path} and synced platform copies (web dev server reloads).` : `Saved ${r.path}; sync failed: ${r.sync.output}`)
      else setNotice(`Saved ${r.path}.`)
    } finally {
      setBusy(null)
    }
  }, [])

  const dirty = useMemo(() => {
    const out = {} as Record<FileKey, boolean>
    for (const k of KEYS) out[k] = !!data && !!saved && stable(data[k]) !== stable(saved[k])
    return out
  }, [data, saved])

  const pendingReport = useMemo(() => (data && saved ? buildChangeReport(saved, data) : { report: '', behavioural: false }), [data, saved])

  const runJob = useCallback(async (report: string, instruction: string) => {
    const job = await api<EngineJob>('/api/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report, instruction }) })
    setJobs(js => [job, ...js])
    setNotice('Engine job started — Claude Code is updating the engine. Follow it on the Engine tab.')
    return job
  }, [])

  const saveAll = useCallback(async () => {
    const d = dataRef.current, s = savedRef.current
    if (!d || !s) return
    const { report, behavioural } = buildChangeReport(s, d)
    for (const k of KEYS) if (stable(d[k]) !== stable(s[k])) await save(k)
    if (applyToEngine && behavioural) await runJob(report, '')
    else if (behavioural) setNotice('Saved. Engine sync is off, so the rule changes were not sent to the engine agent.')
  }, [save, applyToEngine, runJob])

  const revertJob = useCallback(async (id: string) => {
    const r = await api<{ reverted: string[]; kept: string[] }>(`/api/jobs/${id}/revert`, { method: 'POST' })
    setNotice(`Reverted ${r.reverted.length} file(s)${r.kept.length ? `; kept ${r.kept.join(', ')} (had other edits)` : ''}.`)
    await refreshJobs()
    await reload()
  }, [refreshJobs, reload])

  const sync = useCallback(async () => {
    setBusy('Running scripts/sync-assets.sh…')
    try {
      const json = await api<{ ok: boolean; output: string }>('/api/sync', { method: 'POST' })
      const gs = await api<{ gitStatus: string }>('/api/git-status')
      setGitStatus(gs.gitStatus)
      return (json.ok ? '' : 'FAILED\n') + json.output
    } finally {
      setBusy(null)
    }
  }, [])

  const value: StoreValue | null = data && saved && meta ? {
    loaded: true, error, root, data, saved, meta, gitStatus, dirty, update, revert, save, saveAll, reload, sync, busy, notice,
    applyToEngine, setApplyToEngine, pendingReport, jobs, runJob, revertJob,
  } : null

  if (!value) {
    return <div className="boot">{error ? <pre className="error">Could not load repo files: {error}</pre> : 'Loading repo files…'}</div>
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): StoreValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore outside StoreProvider')
  return v
}
