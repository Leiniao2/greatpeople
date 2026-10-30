#!/usr/bin/env node
// Build the platform image assets from the originals in data/images/.
//
// data/images/{portraits,locations,followers,card-backs}/*.jpeg are the
// canonical 1376×768 originals (same bytes as resources/, renamed by key).
// Shipping them as-is costs ~1 MB per image, which is why every page that
// shows artwork loads slowly.  This script resizes and re-encodes them as
// WebP and writes the results where each platform expects them:
//
//   web/public/<folder>/<name>.webp
//   ios/GreatPeople/Assets.xcassets/portrait_<key>.imageset/   (portraits only)
//   android/app/src/main/assets/portraits/                     (portraits only)
//
// iOS and Android render only portraits today; their copies of locations and
// followers are dead weight and are removed by --clean.
//
// Usage (from web/, where sharp is installed):
//   npm run images            # convert what is missing or stale
//   npm run images -- --force # re-encode everything
//   npm run images -- --clean # also delete JPEGs from the output folders
//                             # and the unused mobile locations/ followers/

import { createRequire } from 'node:module'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'web', 'package.json'))
const sharp = require('sharp')

const SRC = path.join(ROOT, 'data', 'images')
const WEB = path.join(ROOT, 'web', 'public')
const IOS_XCASSETS = path.join(ROOT, 'ios', 'GreatPeople', 'Assets.xcassets')
const ANDROID_ASSETS = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets')

// Output width per folder.  Portraits fill a phone-width 16:9 hero at 2× DPR
// (~800 px); locations are full-screen backdrops; followers and card backs
// only ever render as small cards.
const FOLDERS = {
  portraits:    { width: 800, mobile: true },
  locations:    { width: 960, mobile: false },
  followers:    { width: 600, mobile: false },
  'card-backs': { width: 600, mobile: false },
}
const QUALITY = 80

const force = process.argv.includes('--force')
const clean = process.argv.includes('--clean')

async function isStale(src, out) {
  if (force) return true
  try {
    const [s, o] = await Promise.all([fs.stat(src), fs.stat(out)])
    return s.mtimeMs > o.mtimeMs
  } catch {
    return true
  }
}

async function encode(src, width) {
  return sharp(src).resize({ width, withoutEnlargement: true }).webp({ quality: QUALITY, effort: 6 }).toBuffer()
}

async function writeIfStale(src, out, width, buf) {
  if (!(await isStale(src, out))) return false
  await fs.mkdir(path.dirname(out), { recursive: true })
  await fs.writeFile(out, buf ?? await encode(src, width))
  return true
}

async function removeJpegs(dir) {
  let n = 0
  try {
    for (const f of await fs.readdir(dir)) {
      if (/\.jpe?g$/i.test(f)) { await fs.rm(path.join(dir, f)); n++ }
    }
  } catch { /* folder may not exist */ }
  return n
}

async function main() {
  let converted = 0, skipped = 0, bytesIn = 0, bytesOut = 0

  for (const [folder, { width, mobile }] of Object.entries(FOLDERS)) {
    const srcDir = path.join(SRC, folder)
    const files = (await fs.readdir(srcDir)).filter(f => /\.jpe?g$/i.test(f)).sort()

    for (const file of files) {
      const src = path.join(srcDir, file)
      const name = file.replace(/\.jpe?g$/i, '')
      const webOut = path.join(WEB, folder, `${name}.webp`)

      const targets = [webOut]
      if (mobile) {
        targets.push(path.join(IOS_XCASSETS, `${name}.imageset`, `${name}.webp`))
        targets.push(path.join(ANDROID_ASSETS, folder, `${name}.webp`))
      }

      const stale = []
      for (const t of targets) if (await isStale(src, t)) stale.push(t)
      if (stale.length === 0) { skipped++; continue }

      const buf = await encode(src, width)
      for (const t of stale) await writeIfStale(src, t, width, buf)

      if (mobile) {
        // Xcode asset catalog entry; identical to the existing hand-made ones
        // apart from the filename.
        const contents = {
          images: [{ filename: `${name}.webp`, idiom: 'universal' }],
          info: { author: 'xcode', version: 1 },
          properties: { 'template-rendering-intent': 'original' },
        }
        await fs.writeFile(
          path.join(IOS_XCASSETS, `${name}.imageset`, 'Contents.json'),
          JSON.stringify(contents, null, 2) + '\n',
        )
      }

      converted++
      bytesIn += (await fs.stat(src)).size
      bytesOut += buf.length
    }
  }

  console.log(`converted ${converted}, up to date ${skipped}` +
    (converted ? ` — ${(bytesIn / 1e6).toFixed(1)} MB → ${(bytesOut / 1e6).toFixed(1)} MB per platform` : ''))

  if (clean) {
    let removed = 0
    for (const folder of Object.keys(FOLDERS)) removed += await removeJpegs(path.join(WEB, folder))
    removed += await removeJpegs(path.join(ANDROID_ASSETS, 'portraits'))
    for (const set of await fs.readdir(IOS_XCASSETS)) {
      if (set.startsWith('portrait_')) removed += await removeJpegs(path.join(IOS_XCASSETS, set))
    }
    // Nothing native reads these; they only bloat the app bundles.
    for (const dead of [
      path.join(ROOT, 'ios', 'GreatPeople', 'Resources', 'locations'),
      path.join(ROOT, 'ios', 'GreatPeople', 'Resources', 'followers'),
      path.join(ANDROID_ASSETS, 'locations'),
      path.join(ANDROID_ASSETS, 'followers'),
    ]) {
      removed += await removeJpegs(dead)
      await fs.rm(dead, { recursive: true, force: true })
    }
    console.log(`removed ${removed} JPEGs`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
