#!/usr/bin/env node
// Build the shared story JSONs from the per-story sources.
//
//   data/stories/<era>/<slug>.json  →  data/story_configs.json
//                                      data/story_challenges.json
//                                      data/story_scripts.json
//
// One file per story holds its config, its scenes and its challenges inline
// (see data/stories/README.md), which keeps the three outputs in step by
// construction.  Run `node scripts/validate-stories.mjs` afterwards; the
// pre-commit hook does both before syncing to the platforms.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'data', 'stories')
const OUT = path.join(ROOT, 'data')

const ERA_ORDER = ['Ancient', 'Classical', 'Medieval', 'Renaissance', 'Steam', 'Electricity', 'Information']

export async function loadStories() {
  const stories = []
  for (const era of await fs.readdir(SRC)) {
    const dir = path.join(SRC, era)
    if (!(await fs.stat(dir)).isDirectory()) continue
    for (const file of (await fs.readdir(dir)).filter(f => f.endsWith('.json')).sort()) {
      const story = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'))
      story._file = path.relative(ROOT, path.join(dir, file))
      stories.push(story)
    }
  }
  // Era order, then each story's `order` within its era (the sequence the
  // Epic page unlocks them in), then file name for anything unnumbered.
  return stories.sort((a, b) =>
    ERA_ORDER.indexOf(a.era) - ERA_ORDER.indexOf(b.era)
    || (a.order ?? 1e9) - (b.order ?? 1e9)
    || a._file.localeCompare(b._file))
}

export function buildOutputs(stories) {
  const configs = [], challengeEntries = [], scripts = []

  for (const s of stories) {
    const challenges = []
    const scenes = []

    for (const stage of s.stages) {
      scenes.push({ type: 'stage', key: stage.key, label: stage.label, difficulty: stage.difficulty, ...(stage.intro ? { intro: stage.intro } : {}) })
      for (const sc of stage.scenes) {
        if (sc.type !== 'challenge') { scenes.push(sc); continue }
        const index = challenges.length
        challenges.push({ ...sc.challenge, id: `${s.slug}:${index}`, stage: stage.key, difficulty: stage.difficulty })
        scenes.push({ type: 'challenge', index })
      }
    }

    configs.push({
      era: s.era,
      title: s.title,
      slug: s.slug,
      figure: s.figure ?? null,
      portraitKey: s.portraitKey ?? null,
      tagline: s.tagline,
      ...(s.locationImage ? { locationImage: s.locationImage } : {}),
      ...(s.bonusCard ? { bonusCard: s.bonusCard } : {}),
      lives: s.lives ?? 3,
      challengeCount: challenges.length,
      stages: s.stages.map(st => ({
        key: st.key, label: st.label, difficulty: st.difficulty,
        challengeCount: st.scenes.filter(sc => sc.type === 'challenge').length,
      })),
    })
    challengeEntries.push({ era: s.era, story: s.title, slug: s.slug, challenges })
    scripts.push({ era: s.era, story: s.title, slug: s.slug, portraitKey: s.portraitKey ?? null, scenes })
  }

  return { configs, challengeEntries, scripts }
}

async function main() {
  const stories = await loadStories()
  const { configs, challengeEntries, scripts } = buildOutputs(stories)
  const write = (name, data) => fs.writeFile(path.join(OUT, name), JSON.stringify(data, null, 2) + '\n')
  await Promise.all([
    write('story_configs.json', configs),
    write('story_challenges.json', challengeEntries),
    write('story_scripts.json', scripts),
  ])
  const total = challengeEntries.reduce((n, e) => n + e.challenges.length, 0)
  console.log(`build-stories: ${stories.length} stories, ${total} challenges`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1) })
}
