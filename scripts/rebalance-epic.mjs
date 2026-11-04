#!/usr/bin/env node
// Spread Epic's challenges across game types: no type is used more than
// CAP times (the closing fight lessons are not counted).
//
// For every type over the cap the script keeps CAP of its challenges —
// hand-authored before autogen ones, spread over different eras — and
// gives the rest to an under-used type that suits the story's era, is not
// already in that story, and still has room. The new challenge keeps the
// original's fact, takes the next unused config of its game, and gets an
// instruction naming the story's figure. Rebuilt challenges carry
// `"rebalanced": true` so hand-written replacements can find them.
//
// Needs data/game_configs.json (every game's CONFIG_IDS, dumped from the
// components). Re-running is safe: it only moves what is over the cap.
//
//   node scripts/rebalance-epic.mjs [--cap 4] [--dry]

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'data', 'stories')
const capArg = process.argv.indexOf('--cap')
const CAP = capArg > 0 ? Number(process.argv[capArg + 1]) : 4
const DRY = process.argv.includes('--dry')
const EXEMPT = new Set(['fight'])

const ERAS = ['Ancient', 'Classical', 'Medieval', 'Renaissance', 'Steam', 'Electricity', 'Information']
const A = 'Ancient', C = 'Classical', M = 'Medieval', R = 'Renaissance', S = 'Steam', E = 'Electricity', I = 'Information'
const ANY = ERAS

// Eras a game suits, and a short instruction (completed with the figure's name).
const GAME_FIT = {
  maze: [ANY, 'find the way through'], mirror: [[C, M, R, S], 'bend the light onto every target'],
  circuit: [[S, E, I], 'wire the circuit until it lights'], sliding: [ANY, 'slide the tiles back into order'],
  crossword: [ANY, 'fill the crossword from its clues'], geometry: [[A, C, M, R], 'construct the figure exactly'],
  painting: [[M, R, S], 'paint each region in its true colour'], music: [[M, R, S, E], 'play the melody back'],
  tactics: [[C, M, R, S], 'find the mating line'], classify: [ANY, 'sort every item into its group'],
  cooking: [ANY, 'follow the recipe in order'], fiction: [ANY, 'choose how the story really ended'],
  sudoku: [ANY, 'complete the grid'], voting: [[C, R, S, E], 'win the vote'],
  chemistry: [[M, R, S, E], 'mix the right measures'], matchthree: [ANY, 'gather the goods'],
  klotski: [[A, C, M], 'free the general from the blocks'], lorentz: [[E, I], 'steer the particle onto target'],
  porcelain: [[M, R, S], 'glaze each panel correctly'], trade: [[M, R, S], 'trade your way to the target'],
  punnett: [[S, E, I], 'predict the inheritance'], wordle: [ANY, 'guess the word'],
  decode: [ANY, 'decode the message'], wargame: [[C, M, R], 'outmanoeuvre the enemy'],
  auction: [[R, S, E], 'win the lots you need'], pseudocode: [[E, I], 'put the program in order'],
  iceslide: [ANY, 'slide across the ice to the exit'], bridge: [ANY, 'link the islands with bridges'],
  compose: [[R, S, E], 'arrange the movements'], weapondeploy: [[C, M, R], 'deploy the defences'],
  museum: [[S, E, I], 'hang the collection'], jigsaw: [ANY, 'piece the picture together'],
  pipeline: [[A, C, S], 'connect the water to the city'], colormix: [[M, R, S], 'mix the exact pigment'],
  storysort: [ANY, 'put the episodes in order'], battlearena: [[A, C, M], 'win the duel'],
  soccer: [[E, I], 'score from the spot'], reporterflee: [[E, I], 'get the story out alive'],
  chimpmath: [[E, I], 'match the chimps at counting'], worldclock: [[S, E, I], 'convert the times across the globe'],
  atbash: [[A, C], 'read the Atbash cipher'], polybius: [[C, M], 'signal with the Polybius square'],
  scytale: [[C], 'wind the scytale and read it'], pigpen: [[M, R, S], 'crack the pigpen cipher'],
  braille: [[S, E], 'read the raised dots'], telegraph: [[S, E], 'tap out the Morse message'],
  binary: [[E, I], 'decode the bits'], fight: [ANY, 'win the fight'],
  // wave 1
  sokoban: [[A, C, M], 'haul the stones onto their marks'], snake: [[A, C, M, R], 'lead the caravan to every load'],
  tradeboard: [[M, R, S], 'outtrade the rival merchants'], ferry: [[M, R], 'get everyone safely across'],
  hanoi: [[A, C, S], 'move the stack of disks'], tangram: [[A, M, R], 'fit the seven pieces to the shape'],
  nonogram: [ANY, 'reveal the picture from its clues'], sapper: [[R, S, E], 'clear the field without a blast'],
  lamplighter: [[S, E], 'light every lamp'], magicsquare: [[A, C, M, R], 'complete the magic square'],
  pairs: [ANY, 'match each figure to their work'], mint: [[A, C, M, R], 'mint the target coin'],
  knightstour: [[M, R, S], 'tour every square with the knight'], queens: [[R, S], 'place the queens in peace'],
  tafl: [[M], 'bring the king to safety'], morris: [[C, M, R], 'form mills to win'],
  mancala: [[A, M, R], 'capture the most seeds'], gomoku: [[M, R, S], 'make five in a row'],
  senet: [[A], 'bear your pieces off first'], royalur: [[A], 'race your pieces home'],
  // wave 2
  abacus: [[A, M, R], 'reckon it on the abacus'], quipu: [[M, R], 'read and tie the quipu'],
  cryptarithm: [[R, S, E], 'crack the letter sum'], gears: [[C, R, S], 'build the gear train'],
  pendulum: [[R, S], 'set the clock to keep time'], orbit: [[R, S, E, I], 'put the body into orbit'],
  optics: [[M, R, S], 'focus the light'], alchemy: [[M, R, S], 'discover the target substance'],
  surveyor: [[A, C, S], 'measure it by the angles'], irrigation: [[A, C, M], 'water every field before the flood ebbs'],
  rotation: [[M, R, S], 'rotate the crops to a full harvest'], cargo: [[M, R, S], 'stow the cargo'],
  wallbuilder: [[A, C, M], 'raise the wall without gaps'], truss: [[S, E], 'build a truss that holds'],
  canallock: [[M, R, S], 'pass the boats through the locks'], railway: [[S, E], 'lay the track for every train'],
  telegraphnet: [[S, E], 'connect the cities by wire'], postroute: [[C, M, R, S], 'plan the post round'],
  konigsberg: [[R, S], 'walk every bridge once'], assembly: [[S, E, I], 'run the line to target'],
  // era engines
  expedition: [ANY, 'plan the expedition route'], cipher: [ANY, 'break the cipher'],
  debate: [[C, R, S, E], 'win the argument with evidence'], siege: [[A, C, M, R], 'hold the walls against the waves'],
  typeset: [[R, S], 'set the type before the press runs'], caravan: [[A, M, R], 'turn a profit along the route'],
  starchart: [[A, C, M, R], 'read the stars'], logicgate: [[E, I], 'wire the gates to the truth table'],
  archbuild: [[A, C, M, R], 'raise the arch to bear the load'], rhythm: [[M, R, S, E], 'keep the rhythm'],
  roundup: [ANY, 'round them all up'], fieldsurvey: [ANY, 'survey the field'],
  riverrun: [ANY, 'run the river safely'], rollcall: [ANY, 'call the roll correctly'],
  coalition: [[C, R, S, E, I], 'build a winning coalition'], campaign: [[C, M, R, S], 'win the campaign'],
}

// Small stable hash for deterministic choices.
const h = s => { let x = 2166136261; for (const ch of s) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619) } return x >>> 0 }

async function main() {
  const configs = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'game_configs.json'), 'utf8'))
  const stories = []
  for (const era of await fs.readdir(SRC)) {
    const dir = path.join(SRC, era)
    if (!(await fs.stat(dir)).isDirectory()) continue
    for (const f of (await fs.readdir(dir)).filter(f => f.endsWith('.json')).sort())
      stories.push({ file: path.join(dir, f), story: JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')) })
  }
  stories.sort((a, b) => ERAS.indexOf(a.story.era) - ERAS.indexOf(b.story.era) || (a.story.order ?? 0) - (b.story.order ?? 0))

  // Every challenge with where it lives.
  const all = []
  for (const s of stories) for (const st of s.story.stages) st.scenes.forEach((sc, i) => {
    if (sc.type !== 'challenge') return
    const ch = sc.challenge
    all.push({ s, stage: st, i, ch, game: ch.type === 'minigame' ? ch.game : ch.type })
  })
  const counted = all.filter(x => !EXEMPT.has(x.game))
  const count = {}
  for (const x of counted) count[x.game] = (count[x.game] ?? 0) + 1

  // Choose what stays for each over-cap type.
  const toMove = []
  for (const [game, n] of Object.entries(count)) {
    if (n <= CAP) continue
    const items = counted.filter(x => x.game === game)
    const score = x => (x.ch.autogen || x.ch.rebalanced ? 0 : 10) + (GAME_FIT[game]?.[0].includes(x.s.story.era) ? 3 : 0)
    items.sort((a, b) => score(b) - score(a) || h(a.ch.id ?? a.s.story.slug + a.i) - h(b.ch.id ?? b.s.story.slug + b.i))
    const keep = [], usedEras = new Set()
    // First pass: best items in distinct eras; then fill.
    for (const x of items) if (keep.length < CAP && !usedEras.has(x.s.story.era)) { keep.push(x); usedEras.add(x.s.story.era) }
    for (const x of items) if (keep.length < CAP && !keep.includes(x)) keep.push(x)
    for (const x of items) if (!keep.includes(x)) toMove.push(x)
    count[game] = CAP
  }

  // Configs already used per game, so replacements take fresh ones.
  const usedCfg = {}
  for (const x of counted) if (x.ch.configId && !toMove.includes(x)) (usedCfg[x.game] ??= new Set()).add(x.ch.configId)

  const storyGames = new Map()
  for (const x of all) {
    if (toMove.includes(x)) continue
    const k = x.s.story.slug
    if (!storyGames.has(k)) storyGames.set(k, new Set())
    storyGames.get(k).add(x.game)
  }

  const candidates = Object.keys(GAME_FIT).filter(g => !EXEMPT.has(g) && configs[g]?.configs?.length)
  let moved = 0
  const stuck = []
  for (const x of toMove) {
    const era = x.s.story.era
    const inStory = storyGames.get(x.s.story.slug)
    const pick = (needFit) => candidates
      .filter(g => (count[g] ?? 0) < CAP && !inStory.has(g) && (!needFit || GAME_FIT[g][0].includes(era)))
      .sort((a, b) => (count[a] ?? 0) - (count[b] ?? 0) || h(x.s.story.slug + a + x.i) - h(x.s.story.slug + b + x.i))[0]
    const g = pick(true) ?? pick(false)
    if (!g) { stuck.push(`${x.s.story.slug}:${x.game}`); continue }
    const ids = configs[g].configs
    const used = usedCfg[g] ??= new Set()
    const configId = ids.find(id => !used.has(id)) ?? ids[h(x.s.story.slug + g) % ids.length]
    used.add(configId)
    const figure = x.s.story.figure ?? x.s.story.title
    x.stage.scenes[x.i] = {
      type: 'challenge',
      challenge: {
        type: 'minigame',
        game: g,
        configId,
        seed: h(`${x.s.story.slug}:${g}:${x.i}`) % 100000,
        instruction: `${figure}: ${GAME_FIT[g][1]}.`,
        fact: x.ch.fact,
        rebalanced: true,
      },
    }
    count[g] = (count[g] ?? 0) + 1
    inStory.add(g)
    moved++
  }

  const touched = new Set(toMove.map(x => x.file ?? x.s.file))
  if (!DRY) for (const s of stories) if (touched.has(s.file)) await fs.writeFile(s.file, JSON.stringify(s.story, null, 2) + '\n')

  const used = Object.values(count).filter(n => n > 0).length
  const max = Math.max(...Object.values(count))
  console.log(`rebalance-epic: cap ${CAP}, moved ${moved}, stuck ${stuck.length}, types in use ${used}, max per type ${max}${DRY ? ' (dry run)' : ''}`)
  if (stuck.length) console.log('stuck:', stuck.join(', '))
}

main().catch(err => { console.error(err); process.exit(1) })
