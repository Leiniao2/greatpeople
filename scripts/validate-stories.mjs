#!/usr/bin/env node
// Check the story sources under data/stories/ and the JSONs built from them.
//
// Structural problems are always errors.  The content targets of the growth
// arc redesign (every stage played, quiz-style challenges at most 5%) are
// enforced per era as each era's content is finished: list an era in
// data/stories/_targets.json to turn them on for it; other eras only get a
// report.  Exit code 1 on any error.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadStories, buildOutputs } from './build-stories.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async p => JSON.parse(await fs.readFile(path.join(ROOT, p), 'utf8'))
const exists = async p => fs.access(path.join(ROOT, p)).then(() => true, () => false)

const ERAS = ['Ancient', 'Classical', 'Medieval', 'Renaissance', 'Steam', 'Electricity', 'Information']
const STAGE_KEYS = ['origins', 'trial', 'mastery', 'legacy']
const QUIZ_TYPES = new Set(['quiz', 'truefalse', 'sort'])
const QUIZ_SHARE_MAX = 0.05
const QUIZ_PER_ERA_MAX = 3

// Game keys are read from the registry source so this script needs no bundler.
async function registryKeys() {
  const src = await fs.readFile(path.join(ROOT, 'web/src/games/registry.ts'), 'utf8')
  return new Set([...src.matchAll(/^\s{2}([a-z]+):\s+def\(/gm)].map(m => m[1]))
}

async function main() {
  const errors = [], warnings = []
  const err = (file, msg) => errors.push(`${file}: ${msg}`)
  const warn = (file, msg) => warnings.push(`${file}: ${msg}`)

  const stories = await loadStories()
  const games = await registryKeys()
  const cards = await read('data/cards.json')
  const portraitKeys = new Set(cards.map(c => c.portraitKey))
  const followerKeys = new Set((await read('data/followers.json')).map(f => f.imageKey))
  const fallbacks = (await read('data/location_image_fallbacks.json')).fallbacks
  const targets = (await exists('data/stories/_targets.json')) ? await read('data/stories/_targets.json') : { enforced: [] }
  const enforced = new Set(targets.enforced ?? [])

  const seenSlug = new Set(), seenTitle = new Set()
  const perEra = Object.fromEntries(ERAS.map(e => [e, { stories: 0, challenges: 0, quiz: 0, emptyStages: 0 }]))

  for (const s of stories) {
    const f = s._file
    for (const k of ['slug', 'era', 'title', 'tagline', 'stages']) if (s[k] == null) err(f, `missing "${k}"`)
    if (!ERAS.includes(s.era)) err(f, `unknown era "${s.era}"`)
    if (seenSlug.has(s.slug)) err(f, `duplicate slug "${s.slug}"`); seenSlug.add(s.slug)
    const titleKey = `${s.era}/${s.title}`
    if (seenTitle.has(titleKey)) err(f, `duplicate era+title "${titleKey}"`); seenTitle.add(titleKey)
    if (s.portraitKey && !portraitKeys.has(s.portraitKey)) err(f, `portraitKey "${s.portraitKey}" is not a card`)
    if (s.bonusCard?.portraitKey && !portraitKeys.has(s.bonusCard.portraitKey)) err(f, `bonusCard portraitKey "${s.bonusCard.portraitKey}" is not a card`)
    if (s.locationImage) {
      const key = fallbacks[s.locationImage]?.image ?? s.locationImage
      if (!(await exists(`data/images/locations/${key}.jpeg`))) err(f, `locationImage "${s.locationImage}" has no artwork`)
    }

    const stages = Array.isArray(s.stages) ? s.stages : []
    if (stages.map(st => st.key).join() !== STAGE_KEYS.join()) err(f, `stages must be exactly ${STAGE_KEYS.join(' → ')}`)
    stages.forEach((st, i) => {
      if (st.difficulty !== i + 1) err(f, `stage "${st.key}" difficulty must be ${i + 1}`)
      if (!Array.isArray(st.scenes)) { err(f, `stage "${st.key}" has no scenes`); return }
      const n = st.scenes.filter(sc => sc.type === 'challenge').length
      if (n === 0) {
        perEra[s.era].emptyStages++
        ;(enforced.has(s.era) ? err : warn)(f, `stage "${st.key}" has no challenge`)
      }
      for (const sc of st.scenes) {
        if (sc.type === 'dialog' && sc.portraitKey) {
          const ok = sc.portraitKey.startsWith('follower:')
            ? followerKeys.has(sc.portraitKey.slice(9))
            : portraitKeys.has(sc.portraitKey)
          if (!ok) warn(f, `dialog portraitKey "${sc.portraitKey}" has no artwork`)
        }
        if (sc.type !== 'challenge') continue
        const ch = sc.challenge
        if (!ch) { err(f, 'challenge scene without a challenge'); continue }
        perEra[s.era].challenges++
        if (typeof ch.fact !== 'string' || !ch.fact) err(f, `challenge in "${st.key}" has no fact`)
        if (ch.countdown != null && ch.countdown < 5) err(f, `countdown ${ch.countdown}s is too short`)
        if (QUIZ_TYPES.has(ch.type)) perEra[s.era].quiz++
        switch (ch.type) {
          case 'quiz':
            if (!ch.question || !Array.isArray(ch.options) || ch.options.length < 2) err(f, 'quiz needs a question and ≥2 options')
            else if (!(ch.answer >= 0 && ch.answer < ch.options.length)) err(f, 'quiz answer out of range')
            break
          case 'truefalse':
            if (!ch.statement || typeof ch.correct !== 'boolean') err(f, 'truefalse needs statement and boolean correct')
            break
          case 'sort':
            if (!ch.question || !Array.isArray(ch.items) || ch.items.length < 2) err(f, 'sort needs a question and ≥2 items')
            break
          case 'minigame':
            if (!games.has(ch.game)) err(f, `unknown game "${ch.game}"`)
            if (!ch.instruction) err(f, `minigame "${ch.game}" has no instruction`)
            if (!ch.configId && !ch.params) err(f, `minigame "${ch.game}" needs configId or params`)
            break
          default:
            err(f, `unknown challenge type "${ch.type}"`)
        }
      }
    })
    perEra[s.era].stories++
  }

  // Era report and the quiz cap.
  const total = Object.values(perEra).reduce((a, e) => a + e.challenges, 0)
  const quiz = Object.values(perEra).reduce((a, e) => a + e.quiz, 0)
  console.log('era           stories  challenges  quiz-style  empty stages')
  for (const era of ERAS) {
    const e = perEra[era]
    const flag = enforced.has(era) ? '✓' : ' '
    console.log(`${flag} ${era.padEnd(12)} ${String(e.stories).padStart(7)} ${String(e.challenges).padStart(11)} ${String(e.quiz).padStart(11)} ${String(e.emptyStages).padStart(13)}`)
    if (enforced.has(era) && e.quiz > QUIZ_PER_ERA_MAX) err(era, `${e.quiz} quiz-style challenges, max ${QUIZ_PER_ERA_MAX} per era`)
  }
  console.log(`  total        ${String(stories.length).padStart(7)} ${String(total).padStart(11)} ${String(quiz).padStart(11)}  (${(100 * quiz / total).toFixed(1)}% quiz-style, target ≤ ${QUIZ_SHARE_MAX * 100}%)`)
  if (enforced.size === ERAS.length && quiz / total > QUIZ_SHARE_MAX) err('all', `quiz-style share ${(100 * quiz / total).toFixed(1)}% exceeds ${QUIZ_SHARE_MAX * 100}%`)

  // The built outputs must match the sources.
  const built = buildOutputs(stories)
  for (const [name, data] of Object.entries({ story_configs: built.configs, story_challenges: built.challengeEntries, story_scripts: built.scripts })) {
    const onDisk = await read(`data/${name}.json`)
    if (JSON.stringify(onDisk) !== JSON.stringify(data)) err(`data/${name}.json`, 'is stale — run node scripts/build-stories.mjs')
  }

  for (const w of warnings) console.warn(`warning: ${w}`)
  for (const e of errors) console.error(`error: ${e}`)
  console.log(`validate-stories: ${errors.length} error(s), ${warnings.length} warning(s)`)
  if (errors.length) process.exit(1)
}

main().catch(err => { console.error(err); process.exit(1) })
