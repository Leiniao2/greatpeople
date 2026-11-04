import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
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

async function currentBranch(): Promise<string> {
  const r = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
  return r.ok ? r.stdout.trim() : '?'
}

/** Where scripts/sync-assets.sh copies a data/ file. */
const SYNC_TARGETS = ['web/src/data', 'ios/GreatPeople/Resources', 'android/app/src/main/assets']

async function exists(p: string): Promise<boolean> {
  try { await fs.access(path.join(ROOT, p)); return true } catch { return false }
}

export interface CommitResult { ok: boolean; sha?: string; branch?: string; nothing?: boolean; error?: string; paths: string[] }

/**
 * Commit exactly `paths` (nothing else in the index or working tree). The repo
 * hook is bypassed: it only re-runs the asset sync (already done on save) and
 * would also stage unrelated story files another session may be editing.
 */
async function commitPaths(paths: string[], message: string): Promise<CommitResult> {
  const uniq = [...new Set(paths)].sort()
  if (!uniq.length) return { ok: true, nothing: true, paths: [] }
  const add = await run('git', ['add', '--', ...uniq])
  if (!add.ok) return { ok: false, error: add.stderr.trim(), paths: uniq }
  const c = await run('git', ['-c', 'core.hooksPath=/dev/null', 'commit', '--only', '-m', message, '--', ...uniq])
  if (!c.ok) {
    const out = `${c.stdout}${c.stderr}`
    if (/nothing to commit|no changes added/.test(out)) return { ok: true, nothing: true, paths: uniq }
    return { ok: false, error: out.trim().slice(0, 2000), paths: uniq }
  }
  const sha = (await run('git', ['rev-parse', '--short', 'HEAD'])).stdout.trim()
  return { ok: true, sha, branch: await currentBranch(), paths: uniq }
}

/** Repo paths a save of these file keys produces: the files plus their synced platform copies. */
async function pathsForKeys(keys: string[]): Promise<string[]> {
  const out: string[] = []
  for (const k of keys) {
    const spec = FILES[k]
    if (!spec) continue
    out.push(spec.path)
    if (spec.path.startsWith('data/')) {
      for (const dir of SYNC_TARGETS) {
        const copy = `${dir}/${path.basename(spec.path)}`
        if (await exists(copy)) out.push(copy)
      }
    }
  }
  return out
}

const AGENT_TRAILER = '\n\nCo-Authored-By: Claude Code (Fight Studio engine sync) <noreply@anthropic.com>'

// ─── Engine jobs: hand a change report to Claude Code (headless) ─────────────

export interface JobLogEntry { t: number; kind: 'text' | 'tool' | 'result' | 'error' | 'info'; text: string }
export interface JobTouched { path: string; status: string; dirtyBefore: boolean; existedBefore: boolean }
export interface Job {
  id: string
  startedAt: number
  finishedAt?: number
  /** apply: the agent edits the repo directly. preview: it edits an isolated snapshot and waits for approval. */
  mode: 'apply' | 'preview'
  /** running → review (preview only) → applied; or failed / discarded / reverted. */
  status: 'running' | 'review' | 'applied' | 'failed' | 'discarded' | 'reverted'
  autoCommit: boolean
  commit?: CommitResult
  note?: string
  report: string
  instruction: string
  log: JobLogEntry[]
  result?: string
  costUsd?: number
  touched: JobTouched[]
  diff: string
  typecheck?: { web?: string; studio?: string }
  dirtyBefore: Map<string, string>
  /** Repo-relative paths the agent wrote through Edit/Write tools (apply mode). */
  written: Set<string>
  /** Directory the agent works in: the repo root (apply) or a snapshot (preview). */
  cwd: string
  /** Preview only: the binary patch from the snapshot's baseline to the agent's result. */
  patch?: string
}

const jobs = new Map<string, Job>()
let jobCounter = 0

/** Files the agent may touch; everything else in the prompt is read-only guidance. */
const ENGINE_GUIDE = `
You are updating the Great People battle engine so that it matches a change the designer just made in Fight Studio (an internal rules/stats editor).

Repository map (paths relative to the repo root, which is your working directory):
- web/src/battle/engine.ts — the ONLY battle engine (decks, reducer, traitBonusForGP, computeLocationTotal, computeEventSide, survival/hazard/global resolution, ACHIEVEMENT_SPECS, initScriptedGame for the Epic fight lessons). web/src/battle/BattleGame.tsx — the board UI and CPU AI; web/src/battle/lessons.ts — the fight-lesson curriculum and coach; web/src/pages/BattlePage.tsx — only the Battle tab lobby.
- web/src/types/index.ts — battle state types.
- data/cards.json, data/followers.json, data/location_cards.json — card data. Do NOT edit these; the designer edits them in Fight Studio.
- docs/fight.md — the rulebook (prose). docs/fight_rules.json — the rules registry: one row per rule with docText (what the design says), codeBehaviour (what the engine does), codeSource (function names), status (implemented | partial | conflict | missing | unspecified), notes.
- tools/fight-studio/src/lib/engineTraits.ts — hand-maintained mirror of engine facts (ENGINE_CONSTANTS, IMPLEMENTED_TRAITS, ACHIEVEMENT_SPECS). tools/fight-studio/src/lib/engine.ts — mirror of the scoring formulas.

Your task:
1. Read the change report below. For each change decide whether the engine must change. Documentation-only edits (notes, wording, status bookkeeping) need no code change: say so.
2. Implement the behavioural changes in web/src/battle/engine.ts (and web/src/types/index.ts if types must change). Keep the existing code style. Prefer small, local edits over rewrites. engine.ts also contains player-facing rules text (event card descriptions in makeEventDeck/makeHazardDeck) and BattleGame.tsx an in-game rules panel; the lesson texts in web/src/battle/lessons.ts and scripts/add-fight-lessons.mjs describe the same rules; keep that text consistent with the new behaviour. add-fight-lessons.mjs skips stories that already have a lesson, so lesson text it generated earlier is baked into data/stories/**/*.json: when a rule the lessons describe changes, update that baked text with an exact string replacement (you may edit those story files), then run \`node scripts/build-stories.mjs\` and \`bash scripts/sync-assets.sh\` to rebuild and sync the story bundles.
3. Keep the mirrors in step: update ENGINE_CONSTANTS / IMPLEMENTED_TRAITS / ACHIEVEMENT_SPECS in tools/fight-studio/src/lib/engineTraits.ts and the formulas in tools/fight-studio/src/lib/engine.ts so Fight Studio's analysis matches the engine.
4. In docs/fight_rules.json, update the affected rows' codeBehaviour, codeSource and status to describe the new engine behaviour (set status to "implemented" when doc and code now agree). Do not reformat the file; keep 2-space JSON.
5. Run \`npx tsc --noEmit\` inside web/ and inside tools/fight-studio/, and fix any errors you introduced. Run \`npx vitest run\` inside web/ if you changed anything the tests cover.
6. Do NOT commit, stage, stash, or run git commands that change state (Fight Studio commits your work itself after review). Do NOT edit files outside the ones listed above unless a change genuinely requires it, and then say why.
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
          const rel = path.relative(job.cwd, path.resolve(job.cwd, input.file_path))
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

async function typecheckIn(cwd: string, paths: string[]): Promise<Job['typecheck']> {
  const typecheck: Job['typecheck'] = {}
  if (paths.some(p => p.startsWith('web/'))) {
    const r = await run('npx', ['tsc', '--noEmit'], path.join(cwd, 'web'))
    typecheck.web = r.ok ? 'ok' : (r.stdout + r.stderr).trim().slice(0, 4000)
  }
  if (paths.some(p => p.startsWith('tools/fight-studio/'))) {
    const r = await run('npx', ['tsc', '--noEmit'], path.join(cwd, 'tools/fight-studio'))
    typecheck.studio = r.ok ? 'ok' : (r.stdout + r.stderr).trim().slice(0, 4000)
  }
  return typecheck
}

function typecheckOk(job: Job): boolean {
  return !job.typecheck || Object.values(job.typecheck).every(v => !v || v === 'ok')
}

function commitMessage(job: Job, verb: string): string {
  const first = (job.result ?? '').split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#')) ?? ''
  const subject = `Engine sync: ${verb}${first ? ` — ${first.replace(/[*`]/g, '')}` : ''}`.slice(0, 100)
  const body = [
    job.instruction ? `Instruction: ${job.instruction}` : '',
    job.report ? `Change report:\n${job.report.split('\n').slice(0, 60).join('\n')}` : '',
    job.result ? `Agent summary:\n${job.result.slice(0, 3000)}` : '',
  ].filter(Boolean).join('\n\n')
  return `${subject}\n\n${body}${AGENT_TRAILER}`
}

/** Commit what an apply-mode job (or an approved preview) wrote, skipping files that carried other edits. */
async function commitJob(job: Job, verb: string) {
  const mine = job.touched.filter(t => !t.dirtyBefore).map(t => t.path)
  const skipped = job.touched.filter(t => t.dirtyBefore).map(t => t.path)
  job.commit = await commitPaths(mine, commitMessage(job, verb))
  if (skipped.length) job.note = `Left uncommitted because they already had other edits: ${skipped.join(', ')}.`
  appendLog(job, job.commit.ok
    ? { kind: 'info', text: job.commit.sha ? `Committed ${mine.length} file(s) as ${job.commit.sha} on ${job.commit.branch}.` : 'Nothing to commit.' }
    : { kind: 'error', text: `Commit failed: ${job.commit.error}` })
}

async function finishApplyJob(job: Job, code: number | null) {
  // Only files the agent itself wrote count as touched. Another session may
  // create or edit files while a job runs; those must never be reverted here.
  const touched: JobTouched[] = []
  for (const p of job.written) {
    const st = (await run('git', ['status', '--porcelain', '--untracked-files=all', '--', p])).stdout.slice(0, 2)
    const before = job.dirtyBefore.get(p)
    const tracked = st !== '' && !st.startsWith('??')
    touched.push({ path: p, status: st || '  ', dirtyBefore: before !== undefined, existedBefore: tracked || before !== undefined })
  }
  job.touched = touched.filter(t => t.status.trim() !== '')
  const tracked = job.touched.filter(t => !t.status.startsWith('??')).map(t => t.path)
  const diff = tracked.length ? await run('git', ['diff', '--', ...tracked]) : { stdout: '' }
  let untrackedDiff = ''
  for (const t of job.touched.filter(t => t.status.startsWith('??'))) {
    try {
      const content = await fs.readFile(path.join(ROOT, t.path), 'utf8')
      untrackedDiff += `\n+++ new file: ${t.path}\n${content.split('\n').map(l => '+' + l).join('\n')}\n`
    } catch { /* directory or unreadable */ }
  }
  job.diff = diff.stdout + untrackedDiff
  job.typecheck = await typecheckIn(ROOT, job.touched.map(t => t.path))
  job.status = code === 0 ? 'applied' : 'failed'
  job.finishedAt = Date.now()
  appendLog(job, { kind: 'info', text: `Finished (exit ${code}); ${job.touched.length} file(s) changed.` })
  if (job.status === 'applied' && job.autoCommit && job.touched.length) {
    if (typecheckOk(job)) await commitJob(job, 'apply')
    else job.note = 'Not committed: typecheck failed. Fix or revert, then commit from the Engine sync tab.'
  }
}

// ─── Preview snapshots ───────────────────────────────────────────────────────

const PREVIEW_DIR = path.join(os.tmpdir(), 'fight-studio-preview')
/** What the agent needs: engine code, the tool, docs, scripts and card data (not the 500 MB of art). */
const SNAPSHOT_PATHS = ['.gitignore', 'web', 'tools/fight-studio', 'docs', 'scripts', ':(glob)data/*.json', 'data/stories', ':(exclude)web/public']
const SNAPSHOT_GIT = ['-c', 'user.name=Fight Studio', '-c', 'user.email=fight-studio@localhost', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false']

/**
 * Build an isolated copy for a preview job: HEAD's files, with the current
 * on-disk Fight Studio files laid over them (they may be saved but not yet
 * committed), node_modules symlinked from the repo, and a private git repo
 * whose first commit is the baseline the agent's patch is measured against.
 */
async function makeSnapshot(id: string): Promise<string> {
  const dir = path.join(PREVIEW_DIR, id)
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
  const tar = await new Promise<boolean>((resolve) => {
    const archive = spawn('git', ['archive', '--format=tar', 'HEAD', '--', ...SNAPSHOT_PATHS], { cwd: ROOT })
    const untar = spawn('tar', ['-x', '-C', dir])
    archive.stdout.pipe(untar.stdin)
    untar.on('close', (code) => resolve(code === 0))
  })
  if (!tar) throw new Error('Could not extract a snapshot of the repo.')
  for (const spec of Object.values(FILES)) {
    await fs.mkdir(path.dirname(path.join(dir, spec.path)), { recursive: true })
    await fs.copyFile(path.join(ROOT, spec.path), path.join(dir, spec.path))
  }
  for (const nm of ['web/node_modules', 'tools/fight-studio/node_modules']) {
    if (await exists(nm)) await fs.symlink(path.join(ROOT, nm), path.join(dir, nm))
  }
  const git = (args: string[]) => run('git', [...SNAPSHOT_GIT, ...args], dir)
  await git(['init', '-q'])
  await fs.appendFile(path.join(dir, '.git/info/exclude'), '\nnode_modules\n')
  await git(['add', '-A'])
  const c = await git(['commit', '-q', '-m', 'baseline'])
  if (!c.ok) throw new Error(`Snapshot baseline commit failed: ${c.stderr}`)
  return dir
}

async function finishPreviewJob(job: Job, code: number | null) {
  const git = (args: string[]) => run('git', [...SNAPSHOT_GIT, ...args], job.cwd)
  await git(['add', '-A'])
  const names = await git(['diff', '--cached', '--name-status', 'HEAD'])
  job.touched = names.stdout.split('\n').filter(Boolean).map(l => {
    const [st, p] = l.split('\t')
    return { path: p, status: st, dirtyBefore: false, existedBefore: st !== 'A' }
  })
  job.patch = (await git(['diff', '--cached', '--binary', 'HEAD'])).stdout
  job.diff = (await git(['diff', '--cached', 'HEAD'])).stdout
  job.typecheck = await typecheckIn(job.cwd, job.touched.map(t => t.path))
  job.finishedAt = Date.now()
  if (code !== 0) job.status = 'failed'
  else if (!job.touched.length) { job.status = 'applied'; job.note = 'The agent changed nothing, so there is nothing to approve.'; await dropSnapshot(job) }
  else job.status = 'review'
  appendLog(job, { kind: 'info', text: `Finished (exit ${code}); ${job.touched.length} file(s) changed in the preview snapshot. ${job.status === 'review' ? 'Waiting for approval.' : ''}` })
}

async function dropSnapshot(job: Job) {
  if (job.mode === 'preview' && job.cwd !== ROOT) await fs.rm(job.cwd, { recursive: true, force: true })
}

/** Apply an approved preview's patch to the real repo, then commit it if asked. */
async function approveJob(job: Job, autoCommit: boolean): Promise<void> {
  if (!job.patch) throw new Error('This job has no patch.')
  const dirty = await snapshotDirty()
  job.touched = job.touched.map(t => ({ ...t, dirtyBefore: dirty.has(t.path) }))
  const patchFile = path.join(PREVIEW_DIR, `${job.id}.patch`)
  await fs.writeFile(patchFile, job.patch, 'utf8')
  let r = await run('git', ['apply', '--whitespace=nowarn', patchFile])
  if (!r.ok) r = await run('git', ['apply', '--3way', '--whitespace=nowarn', patchFile])
  await fs.rm(patchFile, { force: true })
  if (!r.ok) throw new Error(`The patch no longer applies to the repo (the files changed since the preview started):\n${r.stderr.trim()}`)
  job.status = 'applied'
  appendLog(job, { kind: 'info', text: `Approved: applied ${job.touched.length} file(s) to the repo.` })
  if (autoCommit) await commitJob(job, 'approved preview')
  await dropSnapshot(job)
}

async function startJob(report: string, instruction: string, mode: Job['mode'], autoCommit: boolean): Promise<Job> {
  const id = `job-${Date.now().toString(36)}-${++jobCounter}`
  const job: Job = {
    id, mode, autoCommit, startedAt: Date.now(), status: 'running', report, instruction, log: [], touched: [], diff: '',
    dirtyBefore: mode === 'apply' ? await snapshotDirty() : new Map(),
    written: new Set(),
    cwd: ROOT,
  }
  jobs.set(id, job)
  if (mode === 'preview') {
    job.cwd = await makeSnapshot(id)
    appendLog(job, { kind: 'info', text: `Preview: the agent works in an isolated snapshot (${job.cwd}); nothing in the repo changes until you approve.` })
  }

  const prompt = `${ENGINE_GUIDE}\n\n## Change report from Fight Studio\n\n${report || '(no structured changes)'}\n\n## Designer instruction\n\n${instruction || '(none)'}\n`
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_') || k === 'CLAUDE_PID') delete env[k]

  const allowed = [
    'Read', 'Edit', 'Write', 'MultiEdit', 'Grep', 'Glob', 'LS',
    'Bash(npx tsc:*)', 'Bash(npx vitest:*)', 'Bash(node scripts/build-stories.mjs:*)', 'Bash(bash scripts/sync-assets.sh:*)', 'Bash(npm run typecheck:*)', 'Bash(npm test:*)', 'Bash(git diff:*)', 'Bash(git status:*)',
  ]
  const child = spawn('claude', [
    '-p', prompt,
    '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', allowed.join(','),
    '--no-session-persistence',
  ], { cwd: job.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })

  const finish = (code: number | null) => void (mode === 'preview' ? finishPreviewJob(job, code) : finishApplyJob(job, code))
    .catch((err: unknown) => { job.status = 'failed'; job.finishedAt = Date.now(); appendLog(job, { kind: 'error', text: String(err) }) })
  appendLog(job, { kind: 'info', text: `Started Claude Code (headless), ${mode} mode.` })
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
  child.on('error', (err) => { appendLog(job, { kind: 'error', text: `Could not start claude: ${err.message}` }); finish(1) })
  child.on('close', (code) => { finish(code) })
  return job
}

async function revertJob(job: Job): Promise<{ reverted: string[]; kept: string[] }> {
  // A committed job is undone with a revert commit, so history stays honest.
  if (job.commit?.sha) {
    const r = await run('git', ['-c', 'core.hooksPath=/dev/null', 'revert', '--no-edit', job.commit.sha])
    if (!r.ok) {
      await run('git', ['revert', '--abort'])
      throw new Error(`git revert ${job.commit.sha} failed (later commits touch the same lines?):\n${(r.stdout + r.stderr).trim()}`)
    }
    const sha = (await run('git', ['rev-parse', '--short', 'HEAD'])).stdout.trim()
    job.status = 'reverted'
    appendLog(job, { kind: 'info', text: `Reverted commit ${job.commit.sha} with ${sha}.` })
    return { reverted: job.commit.paths, kept: job.touched.filter(t => t.dirtyBefore).map(t => t.path) }
  }
  const reverted: string[] = []
  const kept: string[] = []
  for (const t of job.touched) {
    if (t.dirtyBefore) { kept.push(t.path); continue } // someone else's edits were already in this file
    if (t.status.startsWith('??') || t.status === 'A') {
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
  const { dirtyBefore: _d, written: _w, patch: _p, cwd: _c, ...rest } = job
  return rest
}

export function fightStudioApi(): Plugin {
  return {
    name: 'fight-studio-api',
    configureServer(server: ViteDevServer) {
      // Snapshots of earlier runs cannot be approved any more (jobs live in memory). Only remove old
      // ones: another Fight Studio instance may be running a preview job right now.
      void fs.readdir(PREVIEW_DIR).then(names => Promise.all(names.map(async n => {
        const p = path.join(PREVIEW_DIR, n)
        const st = await fs.stat(p)
        if (Date.now() - st.mtimeMs > 24 * 3600 * 1000) await fs.rm(p, { recursive: true, force: true })
      }))).catch(() => { /* none yet */ })
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/api/')) return next()
        if (!isLoopback(req)) return send(res, 403, { error: 'Fight Studio is internal-only: loopback clients only.' })

        try {
          if (req.method === 'GET' && url === '/api/files') {
            const entries = await Promise.all(Object.keys(FILES).map(readFile))
            const files: Record<string, unknown> = {}
            for (const e of entries) files[e.key] = e
            return send(res, 200, { root: ROOT, files, gitStatus: await gitStatus(), branch: await currentBranch() })
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
            return send(res, 200, { gitStatus: await gitStatus(), branch: await currentBranch() })
          }

          if (req.method === 'POST' && url === '/api/commit') {
            const body = JSON.parse(await readBody(req)) as { keys?: string[]; message?: string }
            const keys = (body.keys ?? []).filter(k => FILES[k])
            if (!keys.length || !body.message?.trim()) return send(res, 400, { error: 'keys and message are required' })
            return send(res, 200, await commitPaths(await pathsForKeys(keys), body.message))
          }

          if (req.method === 'POST' && url === '/api/apply') {
            const body = JSON.parse(await readBody(req)) as { report?: string; instruction?: string; mode?: string; autoCommit?: boolean }
            if (!body.report && !body.instruction) return send(res, 400, { error: 'Nothing to apply.' })
            const mode = body.mode === 'apply' ? 'apply' : 'preview'
            const job = await startJob(body.report ?? '', body.instruction ?? '', mode, body.autoCommit !== false)
            return send(res, 200, publicJob(job))
          }

          if (req.method === 'GET' && url === '/api/jobs') {
            return send(res, 200, [...jobs.values()].map(publicJob).sort((a, b) => b.startedAt - a.startedAt))
          }

          const jobMatch = /^\/api\/jobs\/([^/]+)(?:\/(revert|approve|discard|commit))?$/.exec(url)
          if (jobMatch) {
            const job = jobs.get(jobMatch[1])
            if (!job) return send(res, 404, { error: 'Unknown job' })
            const action = jobMatch[2]
            if (req.method === 'POST' && action) {
              if (job.status === 'running') return send(res, 409, { error: 'Job still running' })
              if (action === 'revert') {
                if (job.status !== 'applied' && job.status !== 'failed') return send(res, 409, { error: `Nothing to revert for a ${job.status} job` })
                if (job.mode === 'preview' && job.status === 'failed') { await dropSnapshot(job); job.status = 'discarded'; return send(res, 200, { reverted: [], kept: [] }) }
                return send(res, 200, await revertJob(job))
              }
              if (action === 'approve') {
                if (job.status !== 'review') return send(res, 409, { error: `Only a job awaiting review can be approved (this one is ${job.status})` })
                const body = JSON.parse((await readBody(req)) || '{}') as { autoCommit?: boolean }
                await approveJob(job, body.autoCommit !== false)
                return send(res, 200, publicJob(job))
              }
              if (action === 'discard') {
                if (job.status !== 'review') return send(res, 409, { error: `Only a job awaiting review can be discarded (this one is ${job.status})` })
                await dropSnapshot(job)
                job.status = 'discarded'
                appendLog(job, { kind: 'info', text: 'Discarded: the repo was never changed.' })
                return send(res, 200, publicJob(job))
              }
              if (action === 'commit') {
                if (job.status !== 'applied' || job.commit?.sha) return send(res, 409, { error: 'Only an applied, uncommitted job can be committed' })
                await commitJob(job, job.mode === 'preview' ? 'approved preview' : 'apply')
                return send(res, 200, publicJob(job))
              }
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
