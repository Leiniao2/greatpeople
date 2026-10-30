import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'

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

function gitStatus(): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', ['status', '--porcelain', '--', 'data', 'docs'], { cwd: ROOT }, (err, stdout) => {
      resolve(err ? '' : stdout)
    })
  })
}

function runSync(): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    execFile('bash', ['scripts/sync-assets.sh'], { cwd: ROOT }, (err, stdout, stderr) => {
      resolve({ ok: !err, output: `${stdout}${stderr}` })
    })
  })
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
            return send(res, 200, { ok: true, path: spec.path, bytes: Buffer.byteLength(text) })
          }

          if (req.method === 'POST' && url === '/api/sync') {
            return send(res, 200, await runSync())
          }

          if (req.method === 'GET' && url === '/api/git-status') {
            return send(res, 200, { gitStatus: await gitStatus() })
          }

          return send(res, 404, { error: 'Not found' })
        } catch (err) {
          return send(res, 500, { error: err instanceof Error ? err.message : String(err) })
        }
      })
    },
  }
}
