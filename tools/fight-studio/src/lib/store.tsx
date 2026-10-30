import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { FileContents, FileKey, FileMeta } from '../types'

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
  saveAll: () => Promise<void>
  reload: () => Promise<void>
  sync: () => Promise<string>
  busy: string | null
}

const Ctx = createContext<StoreValue | null>(null)

const KEYS: FileKey[] = ['cards', 'followers', 'locationCards', 'locations', 'rules', 'fightMd', 'traitIdeaMd', 'cardMd']

function stable(v: unknown): string {
  return typeof v === 'string' ? v : JSON.stringify(v)
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<FileContents | null>(null)
  const [saved, setSaved] = useState<FileContents | null>(null)
  const [meta, setMeta] = useState<Record<FileKey, FileMeta> | null>(null)
  const [root, setRoot] = useState('')
  const [gitStatus, setGitStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const dataRef = useRef<FileContents | null>(null)
  dataRef.current = data

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/files')
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
      const json = await res.json() as { root: string; files: Record<FileKey, ServerFile>; gitStatus: string }
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
      const res = await fetch(`/api/file/${key}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: d[key] }),
      })
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
      setSaved(s => (s ? { ...s, [key]: structuredClone(d[key]) } : s))
      const gs = await fetch('/api/git-status').then(r => r.json()) as { gitStatus: string }
      setGitStatus(gs.gitStatus)
    } finally {
      setBusy(null)
    }
  }, [])

  const dirty = useMemo(() => {
    const out = {} as Record<FileKey, boolean>
    for (const k of KEYS) out[k] = !!data && !!saved && stable(data[k]) !== stable(saved[k])
    return out
  }, [data, saved])

  const saveAll = useCallback(async () => {
    for (const k of KEYS) if (dirty[k]) await save(k)
  }, [dirty, save])

  const sync = useCallback(async () => {
    setBusy('Running scripts/sync-assets.sh…')
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const json = await res.json() as { ok: boolean; output: string }
      const gs = await fetch('/api/git-status').then(r => r.json()) as { gitStatus: string }
      setGitStatus(gs.gitStatus)
      return (json.ok ? '' : 'FAILED\n') + json.output
    } finally {
      setBusy(null)
    }
  }, [])

  const value: StoreValue | null = data && saved && meta ? {
    loaded: true, error, root, data, saved, meta, gitStatus, dirty, update, revert, save, saveAll, reload, sync, busy,
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
