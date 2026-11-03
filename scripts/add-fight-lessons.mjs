#!/usr/bin/env node
// Give every Epic story a closing fight lesson.
//
// The last challenge of each story is a small scripted battle on the real
// board (web/src/components/minigames/FightGame.tsx).  Stories are played in
// era order, so each era teaches the next piece of the card game:
//
//   Ancient      duel         1 location, 2 Great People, 1 follower, attack
//   Classical    reinforce    stacking a side, two attacks
//   Medieval     event        starting an event from your hand
//   Renaissance  survival     local survival, round endings
//   Steam        hidden       face-down cards, revealing by attack
//   Electricity  competition  global competition, public cards
//   Information  conquest     kill mode, elimination, achievements
//
// For each story this script chooses the cast from data/cards.json so the
// coached line of play wins with a small margin (opponents a little weaker
// in the hero's best stat, followers of that stat, allies from the same era)
// and appends a hero dialog plus the challenge to the Legacy stage.  Stories
// that already end with a fight lesson are left alone, so it is safe to run
// again after adding a story.  The cast is stored in the story file as plain
// `params`, so it can be edited by hand afterwards.
//
//   node scripts/add-fight-lessons.mjs            # write
//   node scripts/add-fight-lessons.mjs --check    # report only

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadStories } from './build-stories.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async p => JSON.parse(await fs.readFile(path.join(ROOT, p), 'utf8'))

const STATS = ['politics', 'strength', 'culture', 'wealth', 'intelligence', 'technique', 'belief', 'reputation']
const STAT_LABELS = {
  politics: 'Politics', strength: 'Strength', culture: 'Culture', wealth: 'Wealth',
  intelligence: 'Intelligence', technique: 'Technique', belief: 'Belief', reputation: 'Reputation',
}
const EVENT_NAMES = {
  politics:     ['Coup',         'Terrorist Attack', 'International Conference'],
  strength:     ['Battlefield',  'Riot',             'Olympics'],
  culture:      ['Art Critique', 'Censorship',       'Roadshow'],
  wealth:       ['Business War', 'Depression',       'Auction'],
  technique:    ['Tech Race',    'Sanctions',        'World Fair'],
  intelligence: ['Argument',     'Puzzle',           'Expedition'],
  belief:       ['Miracle',      'Inquisition',      'Pilgrimage'],
  reputation:   ['Lawsuit',      'Scandal',          'Celebration'],
}
const TIER_BY_ERA = {
  Ancient: 'duel', Classical: 'reinforce', Medieval: 'event', Renaissance: 'survival',
  Steam: 'hidden', Electricity: 'competition', Information: 'conquest',
}
const ERA_ORDER = Object.keys(TIER_BY_ERA)

// Figures whose trait changes totals in the engine (traitBonusForGP) or whose
// CPU behaviour is special; kept out of the rival's side so the arithmetic
// the coach shows is the arithmetic the engine does.
const TRAIT_FIGURES = new Set([
  'Belisarius', 'Imhotep', 'Lu Yu', 'Andrew Mellon', 'Pericles', 'Aspasia', 'Enkidu', 'Lancelot',
  'Marie Antoinette', 'Mani', 'Johannes Brahms', 'Sergei Eisenstein', 'Gregory Peck',
  'Miyamoto Musashi', 'Mao Zedong', 'Al-Khwarizmi', 'Edmund Hillary', 'Sargon I', 'Audrey Hepburn',
])
// Allies whose trait can lower a total.
const WEAK_ALLY_FIGURES = new Set(['Lancelot', 'Marie Antoinette', 'Johannes Brahms'])

const SCENES = {
  duel: {
    dialog: 'The lesson is simple. {opp0} stands at {loc0} and the {event} has begun. Bring me onto the board, put a {follower0} at my side, and let us measure {stat} against {stat}.',
    instruction: 'Fight lesson 1 · First Duel. Deploy {hero} to {loc0}, add the {follower0}, then tap {hero} and tap {opp0} to attack. Win one attack.',
    fact: 'In a Local Event every card at the location counts: {hero} brings {heroStat} {stat}, the {follower0} adds +2 (or +3 beside a Great Person who shares that identity), and the higher total wins the attack. The loser returns to its owner\'s hand unless Kill mode is on.',
  },
  reinforce: {
    dialog: '{opp0} and {opp1} hold {loc0} together, and a follower stands with them. One card alone will not move them. Bring {ally0} with me, add both followers, and strike twice.',
    instruction: 'Fight lesson 2 · Strength in Numbers. Over two turns stack {hero}, {ally0} and both followers at {loc0}, then win two attacks against the rival side.',
    fact: 'An attack compares whole sides at a location, not single cards. Two Great People and two followers in the same stat outweigh a rival who arrived first, and each win sends one rival card back to its owner\'s hand.',
  },
  event: {
    dialog: '{opp0} waits at {loc1}, but nothing is happening there, and without an event there is no fight. I will go first; the turn after I arrive, play the {event} card on {loc1} and we attack.',
    instruction: 'Fight lesson 3 · Starting an Event. Deploy {hero} to {loc1} and End Turn. Next turn play the {event} card there, add your follower and win one attack.',
    fact: 'Event cards start a scenario at a location where you already have a Great Person, and only one who arrived on an earlier turn can start it. A local event keeps running until a player ends it.',
  },
  survival: {
    dialog: '{loc0} is under {survivalEvent}. At the end of every round, any side whose {stat} totals under 5 is swept from the board. {opp0} is already there and far too weak to last. Put me there and hold.',
    instruction: 'Fight lesson 4 · Survival. Deploy {hero} to {loc0}, keep at least 5 {stat} there, and End Turn until two round endings have passed.',
    fact: 'A Local Survival event is a test, not a fight: at the end of each round every side at the location is checked, and a total under 5 loses every card there to the discard pile. Reinforce with followers, or retrieve a weak card before the round ends.',
  },
  hidden: {
    dialog: 'Two face-down cards: one at {loc0}, one at {loc1}. We cannot see who they are until we attack, and an attack reveals every card at the location. The {event} already runs at {loc0}; you hold a card to start one at {loc1}.',
    instruction: 'Fight lesson 5 · Face Down. Win two attacks: fight at {loc0} where the {event} is running, then carry the fight to {loc1} by starting your own event there.',
    fact: 'A card on the board can be public (face up) or private (face down). A private card hides its identity and stats from rivals until an attack reveals every card at that location. Your own cards deploy face down; Toggle Public when being seen helps you.',
  },
  competition: {
    dialog: 'This time the whole board is judged at once. Deploy {ally0}, {ally1} and me, turn us public, then declare the {competitionEvent}: the highest public {stat} on the board when the round ends takes the prize.',
    instruction: 'Fight lesson 6 · Global Competition. Deploy your Great People, Toggle Public on each, then start the {competitionEvent} and End Turn to win the round with the highest public {stat} on the board.',
    fact: 'A Global Competition counts every public Great Person on the whole board; followers and face-down cards add nothing. It lasts one round, and the strongest player draws a reward: event cards, followers or a new Great Person.',
  },
  conquest: {
    dialog: '{opp0} and {opp1} are still in the rival\'s hand; they will come to the board one by one. Follow them, start the {event} where they stand, and fight with Kill mode on. A player with no Great People left is out of the game.',
    instruction: 'Fight lesson 7 · Conquest. Deploy, move to wherever the rival stands, start the {event} there, and attack with Kill mode on until the rival has no Great People left.',
    fact: 'With Kill mode on, a beaten card is discarded instead of returning to hand. A player with no Great People left, in hand or on the board, is out, and the last player standing wins. A kill won in a Great Person\'s own stat also counts towards their achievement.',
  },
}

const sumStat = (cards, stat) => cards.reduce((n, c) => n + c[stat], 0)
const byStatDesc = stat => (a, b) => b[stat] - a[stat] || a.id.localeCompare(b.id)

/** Pick the cast for one story. Deterministic, so re-runs make no spurious diffs. */
export function chooseCast(story, { cards, followers, locations }) {
  const hero = cards.find(c => c.figureName === story.figure)
  if (!hero) throw new Error(`${story.slug}: figure "${story.figure}" is not a card`)
  const tier = TIER_BY_ERA[story.era]
  const stat = STATS.reduce((best, s) => (hero[s] > hero[best] ? s : best), STATS[0])
  const h = hero[stat]

  // Candidate pools: same era first, then neighbouring eras, never the hero.
  const eraIdx = ERA_ORDER.indexOf(hero.era)
  const others = cards.filter(c => c.id !== hero.id)
    .sort((a, b) => Math.abs(ERA_ORDER.indexOf(a.era) - eraIdx) - Math.abs(ERA_ORDER.indexOf(b.era) - eraIdx) || b[stat] - a[stat] || a.id.localeCompare(b.id))
  const rivals = others.filter(c => !TRAIT_FIGURES.has(c.figureName))
  const allyPool = others.filter(c => !WEAK_ALLY_FIGURES.has(c.figureName))

  // Rivals in a window below the hero's stat, nearest era first (rivals is already in that order).
  const window = (lo, hi, exclude = []) =>
    rivals.filter(c => c[stat] >= lo && c[stat] <= hi && !exclude.includes(c))

  let opponents = [], allies = []
  switch (tier) {
    case 'duel':
    case 'event': {
      opponents = [window(Math.max(3, h - 3), h - 1)[0] ?? window(1, h - 1)[0]]
      allies = [allyPool.filter(c => !opponents.includes(c))[0]]
      break
    }
    case 'reinforce': {
      // player: hero + ally + two followers (+2 or +3 each); rival: two cards + one follower (+2).
      let best = null
      for (const ally of allyPool.slice(0, 12)) {
        const fBonus = followerBonuses(stat, followers, [hero, ally], 2)
        const mine = h + ally[stat] + fBonus
        for (const o0 of rivals.slice(0, 20)) for (const o1 of rivals.slice(0, 20)) {
          if (o0 === o1 || o0 === ally || o1 === ally) continue
          const theirs = o0[stat] + o1[stat] + 2
          const margin = mine - theirs
          if (margin < 2 || margin > 6) continue
          const loneHeroLoses = h + 3 <= theirs ? 0 : 1
          const score = loneHeroLoses * 10 + Math.abs(margin - 3)
          if (!best || score < best.score) best = { score, ally, o0, o1 }
        }
      }
      if (!best) {
        const o = window(2, h - 1)
        best = { ally: allyPool[0], o0: o[0] ?? rivals[rivals.length - 1], o1: o[1] ?? rivals[rivals.length - 2] }
      }
      allies = [best.ally]; opponents = [best.o0, best.o1]
      break
    }
    case 'survival': {
      const weak = rivals.filter(c => c[stat] < 5).sort(byStatDesc(stat))
      opponents = [weak[0] ?? window(1, h - 1)[0], window(Math.max(3, h - 3), h - 1, [weak[0]])[0] ?? rivals[0]]
      allies = [allyPool.filter(c => !opponents.includes(c))[0]]
      break
    }
    case 'hidden': {
      const w = window(Math.max(3, h - 4), h - 2)
      opponents = [w[0] ?? window(1, h - 1)[0], w[1] ?? w[0] ?? window(1, h - 1)[1]]
      allies = [allyPool.filter(c => !opponents.includes(c))[0]]
      break
    }
    case 'competition': {
      // Only public Great People count: hero + two allies vs two rivals, margin 1–5.
      const als = allyPool.slice(0, 10)
      let best = null
      for (let i = 0; i < als.length; i++) for (let j = i + 1; j < als.length; j++) {
        const mine = h + als[i][stat] + als[j][stat]
        for (const o0 of rivals.slice(0, 20)) for (const o1 of rivals.slice(0, 20)) {
          if (o0 === o1 || [als[i], als[j]].includes(o0) || [als[i], als[j]].includes(o1)) continue
          const margin = mine - o0[stat] - o1[stat]
          if (margin < 1 || margin > 5) continue
          const score = Math.abs(margin - 2) + i + j
          if (!best || score < best.score) best = { score, allies: [als[i], als[j]], opponents: [o0, o1] }
        }
      }
      if (!best) best = { allies: als.slice(0, 2), opponents: window(1, h - 1).slice(0, 2) }
      allies = best.allies; opponents = best.opponents
      break
    }
    case 'conquest': {
      const w = window(Math.max(5, h - 4), h - 1).length >= 2 ? window(Math.max(5, h - 4), h - 1) : window(3, h - 1)
      opponents = [w[0], w[1] ?? w[0]]
      allies = allyPool.filter(c => !opponents.includes(c)).slice(0, 2)
      break
    }
  }
  if (opponents.some(o => !o) || allies.some(a => !a)) throw new Error(`${story.slug}: could not cast ${tier}`)

  // Followers of the lesson's stat: the hero's own identities first (they earn +3).
  const ofStat = followers.filter(f => f.stat === stat)
  const heroIds = new Set(hero.identities ?? [])
  const oppIds = new Set(opponents.flatMap(o => o.identities ?? []))
  const playerFollowers = [...ofStat].sort((a, b) => (heroIds.has(b.name) ? 1 : 0) - (heroIds.has(a.name) ? 1 : 0) || a.name.localeCompare(b.name))
  const cpuFollowers = [...ofStat].sort((a, b) => (oppIds.has(a.name) ? 1 : 0) - (oppIds.has(b.name) ? 1 : 0) || a.name.localeCompare(b.name))

  // Locations: the story's own city, then others of the hero's era.
  const keys = []
  const push = k => { if (k && !keys.includes(k)) keys.push(k) }
  if (story.locationImage && locations.some(l => l.imageKey === story.locationImage)) push(story.locationImage)
  for (const l of locations.filter(l => l.era === hero.era)) push(l.imageKey)
  for (const l of locations) push(l.imageKey)

  return {
    tier,
    params: {
      hero: hero.id,
      stat,
      locations: keys.slice(0, 3),
      allies: allies.map(a => a.id),
      opponents: opponents.map(o => o.id),
      followers: playerFollowers.map(f => f.name),
      cpuFollowers: cpuFollowers.slice(0, 2).map(f => f.name),
    },
    names: { hero, allies, opponents, followers: playerFollowers, locations: keys.slice(0, 3).map(k => locations.find(l => l.imageKey === k)) },
  }
}

function followerBonuses(stat, followers, gps, n) {
  const ids = new Set(gps.flatMap(g => g.identities ?? []))
  const ofStat = followers.filter(f => f.stat === stat).sort((a, b) => (ids.has(b.name) ? 1 : 0) - (ids.has(a.name) ? 1 : 0))
  return ofStat.slice(0, n).reduce((s, f) => s + (ids.has(f.name) ? 3 : 2), 0)
}

function fill(template, v) {
  return template.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? `{${k}}`)
}

export function lessonScenes(story, cast) {
  const { tier, params, names } = cast
  const v = {
    hero: names.hero.figureName,
    heroStat: names.hero[params.stat],
    stat: STAT_LABELS[params.stat],
    event: EVENT_NAMES[params.stat][0],
    survivalEvent: EVENT_NAMES[params.stat][1],
    competitionEvent: EVENT_NAMES[params.stat][2],
    loc0: names.locations[0]?.name, loc1: names.locations[1]?.name, loc2: names.locations[2]?.name,
    opp0: names.opponents[0]?.figureName, opp1: names.opponents[1]?.figureName,
    ally0: names.allies[0]?.figureName, ally1: names.allies[1]?.figureName,
    follower0: names.followers[0]?.name,
  }
  const t = SCENES[tier]
  return [
    { type: 'dialog', speaker: story.figure, portraitKey: story.portraitKey, text: fill(t.dialog, v) },
    {
      type: 'challenge',
      challenge: {
        type: 'minigame',
        game: 'fight',
        configId: tier,
        params,
        instruction: fill(t.instruction, v),
        fact: fill(t.fact, v),
      },
    },
  ]
}

const hasLesson = story => {
  const legacy = story.stages?.find(s => s.key === 'legacy')
  const last = legacy?.scenes?.filter(s => s.type === 'challenge').at(-1)
  return last?.challenge?.game === 'fight'
}

async function main() {
  const check = process.argv.includes('--check')
  const data = {
    cards: await read('data/cards.json'),
    followers: await read('data/followers.json'),
    locations: (await read('data/locations.json')).locations,
  }
  const stories = await loadStories()
  let added = 0, skipped = 0
  for (const story of stories) {
    if (hasLesson(story)) { skipped++; continue }
    const cast = chooseCast(story, data)
    const legacy = story.stages.find(s => s.key === 'legacy')
    if (!legacy) throw new Error(`${story.slug}: no legacy stage`)
    console.log(`${story.era.padEnd(12)} ${story.slug.padEnd(32)} ${cast.tier.padEnd(12)} ${cast.params.stat.padEnd(12)} vs ${cast.params.opponents.join(', ')}`)
    if (check) continue
    legacy.scenes.push(...lessonScenes(story, cast))
    const file = story._file
    delete story._file
    await fs.writeFile(path.join(ROOT, file), JSON.stringify(story, null, 2) + '\n')
    added++
  }
  console.log(`add-fight-lessons: ${check ? 'would add' : 'added'} ${check ? stories.length - skipped : added}, already had one: ${skipped}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1) })
}
