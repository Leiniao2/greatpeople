#!/usr/bin/env node
// Convert quiz-style challenges in data/stories/** into minigames.
//
// The growth-arc redesign allows at most 3 quiz-style challenges (quiz,
// truefalse, sort) per era.  Everything over that quota becomes a real game
// on one of the procedural engines, parameterised from the quiz's own
// content: the question becomes the instruction, the answer or statement
// becomes the text the player decodes or sets in type, and the fact is
// kept.  Converted challenges carry `"autogen": true` so hand-authored
// replacements can find them later.
//
//   node scripts/convert-quizzes.mjs            # convert all eras
//   node scripts/convert-quizzes.mjs Ancient    # one era

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'data', 'stories')
const QUOTA_PER_ERA = 2
const only = process.argv[2]

// Which engines each era leans on, in rotation, and the base configs that
// give the procedural engines an era-appropriate theme.
const ROTATION = {
  Ancient:     ['cipher', 'maze', 'typeset', 'sudoku', 'matchthree', 'rhythm'],
  Classical:   ['cipher', 'typeset', 'matchthree', 'maze', 'sudoku', 'rhythm'],
  Medieval:    ['typeset', 'cipher', 'maze', 'matchthree', 'rhythm', 'sudoku'],
  Renaissance: ['typeset', 'cipher', 'matchthree', 'rhythm', 'sudoku', 'maze'],
  Steam:       ['cipher', 'logicgate', 'matchthree', 'typeset', 'sudoku', 'maze'],
  Electricity: ['cipher', 'logicgate', 'rhythm', 'matchthree', 'typeset', 'sudoku'],
  Information: ['logicgate', 'cipher', 'matchthree', 'sudoku', 'typeset', 'rhythm'],
}
const BASE = {
  maze:       { Ancient: 'pyramid-deep', Classical: 'pleistoanax-mountain', Medieval: 'cedar-forest', Renaissance: 'pacific-strait', Steam: 'long-march', Electricity: 'atlantic-sky', Information: 'everest-peak' },
  matchthree: { Ancient: 'babylon-tablets', Classical: 'venice-glass', Medieval: 'changan-silks', Renaissance: 'lisbon-spices', Steam: 'hanseatic-runes', Electricity: 'cairo-alchemy', Information: 'mughal-gems' },
  sudoku:     { Ancient: 'euclid-grid', Classical: 'anaxagoras-grid', Medieval: 'al-khwarizmi-grid', Renaissance: 'euclid-grid', Steam: 'mendel-grid', Electricity: 'lorentz-grid', Information: 'eisenstein-grid' },
  rhythm:     { Ancient: 'court-drums', Classical: 'hildegard-chant', Medieval: 'hildegard-chant', Renaissance: 'bach-fugue', Steam: 'beethoven-motif', Electricity: 'beethoven-motif', Information: 'bach-fugue' },
  logicgate:  { Steam: 'lovelace-engine', Electricity: 'shannon-relays', Information: 'turing-tape' },
  cipher:     { Ancient: 'caesar-gaul', Classical: 'caesar-gaul', Medieval: 'al-kindi-frequency', Renaissance: 'vigenere-cabinet', Steam: 'morse-telegraph', Electricity: 'morse-telegraph', Information: 'al-kindi-frequency' },
  typeset:    { Ancient: 'bi-sheng-clay', Classical: 'bi-sheng-clay', Medieval: 'bi-sheng-clay', Renaissance: 'gutenberg-bible', Steam: 'franklin-gazette', Electricity: 'franklin-gazette', Information: 'franklin-gazette' },
}

const QUIZ = new Set(['quiz', 'truefalse', 'sort'])

// Text the player will decode/set: letters and spaces only, trimmed to fit.
function phrase(text, max) {
  const clean = text.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const words = clean.split(' ')
  let out = ''
  for (const w of words) { if ((out + ' ' + w).trim().length > max) break; out = (out + ' ' + w).trim() }
  return out || clean.slice(0, max).trim()
}

function sourceText(ch) {
  if (ch.type === 'quiz') return ch.options[ch.answer]
  if (ch.type === 'truefalse') return ch.correct ? ch.statement : firstSentence(ch.fact)
  return ch.items[0]
}
const firstSentence = s => s.split(/(?<=[.!?])\s/)[0]

function convert(ch, era, game, seed) {
  const text = sourceText(ch)
  const base = { type: 'minigame', game, seed, fact: ch.fact, autogen: true }
  switch (game) {
    case 'cipher':
      return { ...base, configId: BASE.cipher[era],
        params: { mode: 'caesar', plaintext: phrase(text, 32) },
        instruction: `${prompt(ch)} The answer travels in cipher — turn the wheel until it reads.` }
    case 'typeset':
      return { ...base, configId: BASE.typeset[era],
        params: { lines: [phrase(text, 12), phrase(text, 16), phrase(text, 20), phrase(text, 24)] },
        instruction: `${prompt(ch)} Set the answer in movable type — mirrored, right to left.` }
    case 'maze':
      return { ...base, configId: BASE.maze[era],
        instruction: `${prompt(ch)} The way to the answer runs through these passages — find the exit.` }
    case 'matchthree':
      return { ...base, configId: BASE.matchthree[era],
        instruction: `${prompt(ch)} Gather what the story needs: match the goods until the tally is met.` }
    case 'sudoku':
      return { ...base, configId: BASE.sudoku[era],
        instruction: `${prompt(ch)} Order the grid as the record was ordered — every row, column and box complete.` }
    case 'rhythm':
      return { ...base, configId: BASE.rhythm[era],
        instruction: `${prompt(ch)} Learn the phrase and play it back, note for note.` }
    case 'logicgate':
      return { ...base, configId: BASE.logicgate[era],
        instruction: `${prompt(ch)} Wire the gates until the circuit agrees with the table on every row.` }
    default:
      throw new Error(`no converter for ${game}`)
  }
}

async function main() {
  const eras = await fs.readdir(SRC)
  let converted = 0, kept = 0
  const perEra = {}
  for (const eraDir of eras) {
    const dir = path.join(SRC, eraDir)
    if (!(await fs.stat(dir)).isDirectory()) continue
    const files = (await fs.readdir(dir)).filter(f => f.endsWith('.json')).sort()
    const stories = []
    for (const f of files) stories.push({ file: path.join(dir, f), story: JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')) })
    stories.sort((a, b) => (a.story.order ?? 0) - (b.story.order ?? 0))
    const era = stories[0]?.story.era
    if (!era || (only && era !== only)) continue
    const rotation = ROTATION[era]

    // Keep the quota: prefer multiple-choice quizzes in the legacy stage, one per story.
    const candidates = []
    for (const { story } of stories)
      for (const stage of story.stages)
        for (const sc of stage.scenes)
          if (sc.type === 'challenge' && QUIZ.has(sc.challenge.type) && !sc.challenge.autogen)
            candidates.push({ story, stage, ch: sc.challenge })
    const score = c => (c.ch.type === 'quiz' ? 2 : 0) + (c.stage.key === 'legacy' ? 1 : 0)
    const keep = new Set()
    const usedStories = new Set()
    for (const c of [...candidates].sort((a, b) => score(b) - score(a))) {
      if (keep.size >= QUOTA_PER_ERA) break
      if (usedStories.has(c.story.slug)) continue
      keep.add(c.ch); usedStories.add(c.story.slug)
    }

    let i = 0
    for (const { file, story } of stories) {
      let touched = false
      for (const stage of story.stages) {
        stage.scenes = stage.scenes.map(sc => {
          if (sc.type !== 'challenge' || !QUIZ.has(sc.challenge.type)) return sc
          if (keep.has(sc.challenge)) { kept++; return sc }
          const game = rotation[i++ % rotation.length]
          converted++; touched = true
          return { type: 'challenge', challenge: convert(sc.challenge, era, game, 1000 + i) }
        })
      }
      if (touched) await fs.writeFile(file, JSON.stringify(story, null, 2) + '\n')
    }
    perEra[era] = { converted: i, kept: keep.size }
  }
  console.log(perEra)
  console.log(`convert-quizzes: converted ${converted}, kept ${kept}`)
}

main().catch(err => { console.error(err); process.exit(1) })
