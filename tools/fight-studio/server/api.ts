import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile, spawn } from 'node:child_process'

/** Repo root: tools/fight-studio -> repo. */
const ROOT = path.resolve(__dirname, '../../..')

/** Only these repo files can be read or written through the API. */
const FILES: Record<string, { path: string; kind: 'json' | 'md' }> = {
  cards:         { path: 'data/cards.json',                  kind: 'json' },
  followers:     { path: 'data/followers.json',              kind: 'json' },
  locationCards: { path: 'data/location_cards.json',         kind: 'json' },
  locations:     { path: 'data/locations.json',              kind: 'json' },
  rules:         { path: 'docs/fight_rules.json',            kind: 'json' },
  fightMd:       { path: 'docs/fight.md',                    kind: 'md' },
  traitIdeaMd:   { path: 'docs/great-people-trait-idea.md',  kind: 'md' },
  cardMd:        { path: 'docs/great-people-card.md',        kind: 'md' },
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

function isLoopback(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? ''
  return LOOPBACK.has(addr)
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

async function readFile(key: string): Promise<{ key: string; path: string; kind: string; content: unknown }> {
  const spec = FILES[key]
  const raw = await fs.readFile(path.join(ROOT, spec.path), 'utf8')
  return { key, path: spec.path, kind: spec.kind, content: spec.kind === 'json' ? JSON.parse(raw) : raw }
}

/** Serialise JSON exactly the way the repo stores it (2-space indent, trailing newline). */
function serialise(kind: 'json' | 'md', content: unknown, existing: string): string {
  // Preserve the file's own trailing-newline convention so a save never
  // produces a spurious "no newline at end of file" diff.
  const nl = existing.endsWith('\n') || existing === '' ? '\n' : ''
  if (kind === 'json') return JSON.stringify(content, null, 2) + nl
  const text = String(content).replace(/\n+$/, '')
  return text + nl
}

function run(cmd: string, args: string[], cwd = ROOT): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout, stderr })
    })
  })
}

async function gitStatus(paths: string[] = ['data', 'docs']): Promise<string> {
  const r = await run('git', ['status', '--porcelain', '--', ...paths])
  return r.ok ? r.stdout : ''
}

async function runSync(): Promise<{ ok: boolean; output: string }> {
  const r = await run('bash', ['scripts/sync-assets.sh'])
  return { ok: r.ok, output: `${r.stdout}${r.stderr}` }
}

// ─── Engine jobs: hand a change report to Claude Code (headless) ─────────────

export interface JobLogEntry { t: number; kind: 'text' | 'tool' | 'result' | 'error' | 'info'; text: string }
export interface JobTouched { path: string; status: string; dirtyBefore: boolean; existedBefore: boolean }
export interface Job {
  id: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'done' | 'failed' | 'reverted'
  report: string
  instruction: string
  log: JobLogEntry[]
  result?: string
  costUsd?: number
  touched: JobTouched[]
  diff: string
  typecheck?: { web?: string; studio?: string }
  dirtyBefore: Map<string, string>
  /** Repo-relative paths the agent wrote through Edit/Write tools. */
  written: Set<string>
}

const jobs = new Map<string, Job>()
let jobCounter = 0

/** Files the agent may touch; everything else in the prompt is read-only guidance. */
const ENGINE_GUIDE = `
You are updating the Great People battle engine so that it matches a change the designer just made in Fight Studio (an internal rules/stats editor).

Repository map (paths relative to the repo root, which is your working directory):
- web/src/pages/BattlePage.tsx — the ONLY battle engine (decks, reducer, traitBonusForGP, computeLocationTotal, computeEventSide, survival/hazard/global resolution, ACHIEVEMENT_SPECS, CPU AI, UI).
- web/src/types/index.ts — battle state types.
- data/cards.json, data/followers.json, data/location_cards.json — card data. Do NOT edit these; the designer edits them in Fight Studio.
- docs/fight.md — the rulebook (prose). docs/fight_rules.json — the rules registry: one row per rule with docText (what the design says), codeBehaviour (what the engine does), codeSource (function names), status (implemented | partial | conflict | missing | unspecified), notes.
- tools/fight-studio/src/lib/engineTraits.ts — hand-maintained mirror of engine facts (ENGINE_CONSTANTS, IMPLEMENTED_TRAITS, ACHIEVEMENT_SPECS). tools/fight-studio/src/lib/engine.ts — mirror of the scoring formulas.

Your task:
1. Read the change report below. For each change decide whether the engine must change. Documentation-only edits (notes, wording, status bookkeeping) need no code change: say so.
2. Implement the behavioural changes in web/src/pages/BattlePage.tsx (and web/src/types/index.ts if types must change). Keep the existing code style. Prefer small, local edits over rewrites. BattlePage.tsx also contains player-facing rules text (event card descriptions in makeEventDeck/makeHazardDeck and an in-game rules panel); keep that text consistent with the new behaviour.
3. Keep the mirrors in step: update ENGINE_CONSTANTS / IMPLEMENTED_TRAITS / ACHIEVEMENT_SPECS in tools/fight-studio/src/lib/engineTraits.ts and the formulas in tools/fight-studio/src/lib/engine.ts so Fight Studio's analysis matches the engine.
4. In docs/fight_rules.json, update the affected rows' codeBehaviour, codeSource and status to describe the new engine behaviour (set status to "implemented" when doc and code now agree). Do not reformat the file; keep 2-space JSON.
5. Run \`npx tsc --noEmit\` inside web/ and inside tools/fight-studio/, and fix any errors you introduced. Run \`npx vitest run\` inside web/ if you changed anything the tests cover.
6. Do NOT commit, stage, stash, or run git commands that change state. Do NOT edit files outside the ones listed above unless a change genuinely requires it, and then say why.
7. Finish with a short summary: files changed, what each rule now does in the engine, and anything you could not implement (with the reason).
`

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

function appendLog(job: Job, entry: Omit<JobLogEntry, 't'>) {
  job.log.push({ t: Date.now(), ...entry })
}

async function snapshotDirty(): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const r = await run('git', ['status', '--porcelain', '--untracked-files=all'])
  for (const line of r.stdout.split('\n')) {
    if (!line.trim()) continue
    out.set(line.slice(3).trim(), line.slice(0, 2))
  }
  return out
}

function summariseEvent(job: Job, ev: Record<string, unknown>) {
  const type = ev.type as string
  if (type === 'assistant') {
    const msg = ev.message as { content?: { type: string; text?: string; name?: string; input?: Record<string, unknown> }[] }
    for (const block of msg?.content ?? []) {
      if (block.type === 'text' && block.text?.trim()) appendLog(job, { kind: 'text', text: block.text.trim() })
      if (block.type === 'tool_use') {
        const input = block.input ?? {}
        const target = (input.file_path ?? input.command ?? input.pattern ?? input.path ?? '') as string
        appendLog(job, { kind: 'tool', text: `${block.name} ${String(target).slice(0, 160)}` })
        if (WRITE_TOOLS.has(block.name ?? '') && typeof input.file_path === 'string') {
          const rel = path.relative(ROOT, path.resolve(ROOT, input.file_path))
          if (!rel.startsWith('..')) job.written.add(rel)
        }
      }
    }
  } else if (type === 'result') {
    job.result = (ev.result as string) ?? ''
    job.costUsd = ev.total_cost_usd as number | undefined
    if (ev.is_error) appendLog(job, { kind: 'error', text: job.result || 'Claude reported an error.' })
  } else if (type === 'system' && ev.subtype === 'init') {
    appendLog(job, { kind: 'info', text: `Claude session ${ev.session_id ?? ''} (model ${ev.model ?? '?'})` })
  }
}

async function finishJob(job: Job, code: number | null) {
  // Only files the agent itself wrote count as touched. Another session may
  // create or edit files while a job runs; those must never be reverted here.
  const touched: JobTouched[] = []
  for (const p of job.written) {
    const st = (await run('git', ['status', '--porcelain', '--untracked-files=all', '--', p])).stdout.slice(0, 2)
    const before = job.dirtyBefore.get(p)
    const tracked = st !== '' && !st.startsWith('??')
    touched.push({ path: p, status: st || '  ', dirtyBefore: before !== undefined, existedBefore: tracked || before !== undefined })
  }
  job.touched = touched
  const tracked = touched.filter(t => !t.status.startsWith('??')).map(t => t.path)
  const diff = tracked.length ? await run('git', ['diff', '--', ...tracked]) : { stdout: '' }
  let untrackedDiff = ''
  for (const t of touched.filter(t => t.status.startsWith('??'))) {
    try {
      const content = await fs.readFile(path.join(ROOT, t.path), 'utf8')
      untrackedDiff += `\n+++ new file: ${t.path}\n${content.split('\n').map(l => '+' + l).join('\n')}\n`
    } catch { /* directory or unreadable */ }
  }
  job.diff = diff.stdout + untrackedDiff
  const typecheck: Job['typecheck'] = {}
  if (touched.some(t => t.path.startsWith('web/'))) {
    const r = await run('npx', ['tsc', '--noEmit'], path.join(ROOT, 'web'))
    typecheck.web = r.ok ? 'ok' : (r.stdout + r.stderr).trim().slice(0, 4000)
  }
  if (touched.some(t => t.path.startsWith('tools/fight-studio/'))) {
    const r = await run('npx', ['tsc', '--noEmit'], path.join(ROOT, 'tools/fight-studio'))
    typecheck.studio = r.ok ? 'ok' : (r.stdout + r.stderr).trim().slice(0, 4000)
  }
  job.typecheck = typecheck
  job.status = code === 0 ? 'done' : 'failed'
  job.finishedAt = Date.now()
  appendLog(job, { kind: 'info', text: `Finished (exit ${code}); ${touched.length} file(s) touched.` })
}

async function startJob(report: string, instruction: string): Promise<Job> {
  const id = `job-${Date.now().toString(36)}-${++jobCounter}`
  const job: Job = {
    id, startedAt: Date.now(), status: 'running', report, instruction, log: [], touched: [], diff: '',
    dirtyBefore: await snapshotDirty(),
    written: new Set(),
  }
  jobs.set(id, job)

  const prompt = `${ENGINE_GUIDE}\n\n## Change report from Fight Studio\n\n${report || '(no structured changes)'}\n\n## Designer instruction\n\n${instruction || '(none)'}\n`
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_') || k === 'CLAUDE_PID') delete env[k]

  const allowed = [
    'Read', 'Edit', 'Write', 'MultiEdit', 'Grep', 'Glob', 'LS',
    'Bash(npx tsc:*)', 'Bash(npx vitest:*)', 'Bash(npm run typecheck:*)', 'Bash(npm test:*)', 'Bash(git diff:*)', 'Bash(git status:*)',
  ]
  const child = spawn('claude', [
    '-p', prompt,
    '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', allowed.join(','),
    '--no-session-persistence',
  ], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] })

  appendLog(job, { kind: 'info', text: 'Started Claude Code (headless) in the repo root.' })
  let buf = ''
  child.stdout.on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8')
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      try { summariseEvent(job, JSON.parse(line) as Record<string, unknown>) } catch { appendLog(job, { kind: 'info', text: line.slice(0, 300) }) }
    }
  })
  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8').trim()
    if (text) appendLog(job, { kind: 'error', text: text.slice(0, 1000) })
  })
  child.on('error', (err) => { appendLog(job, { kind: 'error', text: `Could not start claude: ${err.message}` }); void finishJob(job, 1) })
  child.on('close', (code) => { void finishJob(job, code) })
  return job
}

async function revertJob(job: Job): Promise<{ reverted: string[]; kept: string[] }> {
  const reverted: string[] = []
  const kept: string[] = []
  for (const t of job.touched) {
    if (t.dirtyBefore) { kept.push(t.path); continue } // someone else's edits were already in this file
    if (t.status.startsWith('??')) {
      // Created by the agent (it was not on disk before the job).
      try { await fs.rm(path.join(ROOT, t.path), { recursive: false }); reverted.push(t.path) } catch { kept.push(t.path) }
    } else {
      const r = await run('git', ['checkout', '--', t.path])
      if (r.ok) reverted.push(t.path); else kept.push(t.path)
    }
  }
  job.status = 'reverted'
  appendLog(job, { kind: 'info', text: `Reverted ${reverted.length} file(s); kept ${kept.length} that carried other edits.` })
  return { reverted, kept }
}

function publicJob(job: Job) {
  const { dirtyBefore: _d, written: _w, ...rest } = job
  return rest
}

export function fightStudioApi(): Plugin {
  return {
    name: 'fight-studio-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/api/')) return next()
        if (!isLoopback(req)) return send(res, 403, { error: 'Fight Studio is internal-only: loopback clients only.' })

        try {
          if (req.method === 'GET' && url === '/api/files') {
            const entries = await Promise.all(Object.keys(FILES).map(readFile))
            const files: Record<string, unknown> = {}
            for (const e of entries) files[e.key] = e
            return send(res, 200, { root: ROOT, files, gitStatus: await gitStatus() })
          }

          if (req.method === 'PUT' && url.startsWith('/api/file/')) {
            const key = decodeURIComponent(url.slice('/api/file/'.length))
            const spec = FILES[key]
            if (!spec) return send(res, 404, { error: `Unknown file key: ${key}` })
            const body = JSON.parse(await readBody(req)) as { content: unknown }
            const target = path.join(ROOT, spec.path)
            const existing = await fs.readFile(target, 'utf8').catch(() => '')
            const text = serialise(spec.kind, body.content, existing)
            const tmp = `${target}.fight-studio.tmp`
            await fs.writeFile(tmp, text, 'utf8')
            await fs.rename(tmp, target)
            // Data files feed the game through platform copies: sync so the web dev server reloads.
            const sync = spec.path.startsWith('data/') ? await runSync() : null
            return send(res, 200, { ok: true, path: spec.path, bytes: Buffer.byteLength(text), sync })
          }

          if (req.method === 'POST' && url === '/api/sync') {
            return send(res, 200, await runSync())
          }

          if (req.method === 'GET' && url === '/api/git-status') {
            return send(res, 200, { gitStatus: await gitStatus() })
          }

          if (req.method === 'POST' && url === '/api/apply') {
            const body = JSON.parse(await readBody(req)) as { report?: string; instruction?: string }
            if (!body.report && !body.instruction) return send(res, 400, { error: 'Nothing to apply.' })
            const job = await startJob(body.report ?? '', body.instruction ?? '')
            return send(res, 200, publicJob(job))
          }

          if (req.method === 'GET' && url === '/api/jobs') {
            return send(res, 200, [...jobs.values()].map(publicJob).sort((a, b) => b.startedAt - a.startedAt))
          }

          const jobMatch = /^\/api\/jobs\/([^/]+)(\/revert)?$/.exec(url)
          if (jobMatch) {
            const job = jobs.get(jobMatch[1])
            if (!job) return send(res, 404, { error: 'Unknown job' })
            if (req.method === 'POST' && jobMatch[2]) {
              if (job.status === 'running') return send(res, 409, { error: 'Job still running' })
              return send(res, 200, await revertJob(job))
            }
            if (req.method === 'GET') return send(res, 200, publicJob(job))
          }

          return send(res, 404, { error: 'Not found' })
        } catch (err) {
          return send(res, 500, { error: err instanceof Error ? err.message : String(err) })
        }
      })
    },
  }
}
