#!/usr/bin/env node
// One-shot: split the three legacy story JSONs into one source file per story
// under data/stories/<era>/<slug>.json, the format scripts/build-stories.mjs
// consumes.  Kept in the repo for reference; it is not part of the build.
//
// What it fixes on the way:
//   - six stories had a stale duplicate challenge entry under an old era;
//     the entry matching story_configs' era wins
//   - fifteen scripts had no `era` and used `challengeIndex` instead of
//     `index`; both are normalised
//   - challenges a script never referenced are appended to the last stage
//     so no authored content is silently dropped
// Each story is split into the four growth stages by challenge position.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async p => JSON.parse(await fs.readFile(path.join(ROOT, p), 'utf8'))

const STAGES = [
  { key: 'origins', label: 'Origins', difficulty: 1 },
  { key: 'trial',   label: 'Trial',   difficulty: 2 },
  { key: 'mastery', label: 'Mastery', difficulty: 3 },
  { key: 'legacy',  label: 'Legacy',  difficulty: 4 },
]

const slugify = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Spread n challenges over the four stages, weighting the later ones.
function stageCounts(n) {
  const counts = [0, 0, 0, 0]
  for (let i = 0; i < n; i++) counts[3 - (i % 4)]++
  return counts
}

async function main() {
  const configs = await read('data/story_configs.json')
  const challengeEntries = await read('data/story_challenges.json')
  const scripts = await read('web/src/data/story_scripts.json')
  const cards = await read('data/cards.json')
  const portraitFor = name => cards.find(c => c.figureName === name)?.portraitKey ?? null

  const slugs = new Set()
  let written = 0

  for (const cfg of configs) {
    const entry = challengeEntries.find(e => e.era === cfg.era && e.story === cfg.title)
      ?? challengeEntries.find(e => e.story === cfg.title)
    const script = scripts.find(s => s.story === cfg.title)
    if (!entry || !script) { console.warn(`skip ${cfg.title}: missing ${!entry ? 'challenges' : 'script'}`); continue }

    let slug = slugify(cfg.title)
    if (slugs.has(slug)) slug = `${slug}-${slugify(cfg.era)}`
    slugs.add(slug)

    // Normalise scenes and inline the challenge each one points at.
    const referenced = new Set()
    const scenes = []
    for (const sc of script.scenes) {
      if (sc.type !== 'challenge') { scenes.push(sc); continue }
      const idx = sc.index ?? sc.challengeIndex
      const ch = entry.challenges[idx]
      if (!ch || referenced.has(idx)) continue
      referenced.add(idx)
      scenes.push({ type: 'challenge', challenge: ch })
    }
    entry.challenges.forEach((ch, idx) => {
      if (!referenced.has(idx)) scenes.push({ type: 'challenge', challenge: ch })
    })

    // Cut into stages after the k-th challenge scene.
    const total = scenes.filter(s => s.type === 'challenge').length
    const counts = stageCounts(total)
    const stages = STAGES.map(s => ({ ...s, scenes: [] }))
    let stageIdx = 0, seen = 0
    for (const sc of scenes) {
      // Move to the next stage once this one has its share of challenges,
      // unless we are already in the last stage.
      while (stageIdx < 3 && seen >= counts.slice(0, stageIdx + 1).reduce((a, b) => a + b, 0)) stageIdx++
      stages[stageIdx].scenes.push(sc)
      if (sc.type === 'challenge') seen++
    }

    const story = {
      slug,
      era: cfg.era,
      title: cfg.title,
      figure: cfg.figure ?? null,
      portraitKey: script.portraitKey ?? portraitFor(cfg.figure) ?? null,
      tagline: cfg.tagline,
      ...(cfg.locationImage ? { locationImage: cfg.locationImage } : {}),
      ...(cfg.bonusCard ? { bonusCard: { figureName: cfg.bonusCard, portraitKey: portraitFor(cfg.bonusCard) } } : {}),
      lives: 3,
      stages,
    }

    const dir = path.join(ROOT, 'data', 'stories', slugify(cfg.era))
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, `${slug}.json`), JSON.stringify(story, null, 2) + '\n')
    written++
  }
  console.log(`wrote ${written} story files under data/stories/`)
}

main().catch(err => { console.error(err); process.exit(1) })
