import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, resolveConfig, storyText, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Stone Haulers — Sokoban with a different rule at every site.  Walk the
// overseer round the yard and push the blocks onto the marked plinths.
//
//   giza-ramp       slide    wet sand: a pushed block slides until it hits
//                            something or runs onto a station (which stops it)
//   karnak          matched  numbered drums: each block has its own base
//   stonehenge      locked   a stone that reaches a socket is fixed for good
//   baalbek-quarry  lever    push-only cannot solve it; one lever pull can
//
// Each rule has its own pool of yards, sized for a short challenge:
//
//   D1  2 blocks, par ≤ 30 steps       labour cap: par × 3 + 20
//   D2  2–3 blocks, par ≤ 40           labour cap: par × 2.5 + 15
//   D3  2–3 blocks, par ≤ 50           labour cap: par × 2 + 10
//   D4  3–4 blocks, par ≤ 62           labour cap: par × 1.5 + 10
//
// (D4 once allowed only par + a third: with every undone step counted, a
// 3–4 block yard had to be pushed near-perfectly on the first try.)
//
// "Labour" counts every step taken, including steps later undone and steps
// before a restart — the day's daylight is spent either way.  Undo and
// restart are always free to use; only the clock is unforgiving.
//
// Yards were found by a generator (random rooms, or reverse-scrambles from
// the solved position) and kept only when the site's rule really bites: a
// numbered or locking yard is slower than the same yard under plain rules,
// a lever yard cannot be solved by pushing alone.  Every par is the BFS
// optimum under that rule, pinned by the tests.  The seed picks a yard from
// the tier and one of its eight rotations or mirror images.

export type Variant = 'classic' | 'slide' | 'matched' | 'locked' | 'lever'

interface SokobanConfig {
  title: string
  intro: string
  /** The site's rule twist, in a few words. */
  rule: string
  fact: string
  block: string
  blockOnGoal: string
  floor: string
  wall: string
  goal: string
  worker: string
  /** Pool offset so each site starts its tier on a different yard. */
  offset: number
  variant: Exclude<Variant, 'classic'>
}

export const CONFIGS: Record<string, SokobanConfig> = {
  'giza-ramp': {
    title: 'The Giza Ramp',
    intro: 'Wet sand: a pushed block slides on until it hits a wall or another block — or runs onto a sledge station, whose brake stops it dead. Plan where each slide will end.',
    rule: 'Blocks slide',
    fact: 'The Great Pyramid of Khufu (c. 2560 BCE) holds about 2.3 million stone blocks. A painting in the tomb of Djehutihotep shows a colossus dragged on a sledge while a worker pours water on the sand in front of it — wet sand roughly halves the pulling force.',
    block: 'bg-[#e8d9a8] border-[#a88f52]', blockOnGoal: 'bg-[#f3c96b] border-[#b07d1c]',
    floor: 'bg-[#f2e6c4]', wall: 'bg-[#b08a52]', goal: 'border-[#b07d1c]', worker: '𓀀', offset: 0, variant: 'slide',
  },
  saqqara: {
    title: 'The Sledges of Saqqara',
    intro: 'Limestone for Djoser’s monument comes up from the river on wooden sledges over wetted sand: a pushed block slides on until it hits a wall or another block — or runs onto a sledge station, whose brake stops it dead. Plan where each slide will end.',
    rule: 'Blocks slide',
    fact: 'The Step Pyramid at Saqqara (c. 2650 BCE) was the first monument built entirely of cut stone. Its core used local limestone; the fine white casing came from the Tura quarries across the Nile. Egyptians moved heavy stones on sledges, pouring water on the sand ahead to cut the friction.',
    block: 'bg-[#ece3c8] border-[#a8956a]', blockOnGoal: 'bg-[#f6eed2] border-[#b0915a]',
    floor: 'bg-[#f2e6c4]', wall: 'bg-[#b08a52]', goal: 'border-[#b0915a]', worker: '𓀀', offset: 5, variant: 'slide',
  },
  'parthenon-drums': {
    title: 'The Parthenon Colonnade',
    intro: 'Every marble drum is marked for its own column: drum I belongs on base I, drum II on base II. A drum on the wrong base does not count. Push, never pull.',
    rule: 'Numbered drums',
    fact: 'Each Doric column of the Parthenon was built up from about ten to twelve drums of Pentelic marble, quarried on Mount Pentelikon some 16 km from the Acropolis and fluted only after the column stood.',
    block: 'bg-[#ece6da] border-[#a39a88]', blockOnGoal: 'bg-[#f7f1e3] border-[#7d725e]',
    floor: 'bg-[#efe8d8]', wall: 'bg-[#8a8170]', goal: 'border-[#7d725e]', worker: '🏛', offset: 2, variant: 'matched',
  },
  karnak: {
    title: 'Karnak Hypostyle',
    intro: 'Every drum is numbered for its own column: drum I belongs on base I, drum II on base II. A drum on the wrong base does not count. Push, never pull.',
    rule: 'Numbered drums',
    fact: 'The Great Hypostyle Hall at Karnak, finished under Seti I and Ramesses II (13th century BCE), has 134 sandstone columns; the twelve central ones stand about 21 metres tall and were built up from stacked stone drums.',
    block: 'bg-[#d9b48a] border-[#9a6a3a]', blockOnGoal: 'bg-[#e8a35c] border-[#9a5a1a]',
    floor: 'bg-[#efdcc0]', wall: 'bg-[#8e6a48]', goal: 'border-[#9a5a1a]', worker: '𓀀', offset: 2, variant: 'matched',
  },
  stonehenge: {
    title: 'Raising Stonehenge',
    intro: 'Once a sarsen drops into its socket it is set for good — it can never be pushed out again, or rolled across another socket. Raise the stones in the right order.',
    rule: 'Stones lock in place',
    fact: 'The sarsen stones of Stonehenge were set up around 2500 BCE. A 2020 geochemical study traced most of them to West Woods, about 25 km north; the smaller bluestones came over 200 km from the Preseli Hills in Wales.',
    block: 'bg-[#c9c6bb] border-[#7d796c]', blockOnGoal: 'bg-[#9fb58a] border-[#55703e]',
    floor: 'bg-[#dfe6c8]', wall: 'bg-[#6f7b5a]', goal: 'border-[#55703e]', worker: '🧍', offset: 4, variant: 'locked',
  },
  'baalbek-quarry': {
    title: 'The Baalbek Quarry',
    intro: 'Pushing alone will not clear this quarry. You have one lever pull: arm the lever, then step away from a block to drag it one square after you. Spend it where it counts.',
    rule: 'One lever pull',
    fact: 'The Roman quarry at Baalbek in Lebanon still holds the "Stone of the Pregnant Woman" and two even larger cut blocks; the largest, measured in 2014, weighs an estimated 1,650 tonnes — among the biggest stones ever quarried.',
    block: 'bg-[#e6d3c0] border-[#9b7d64]', blockOnGoal: 'bg-[#d9a98a] border-[#8b4f2a]',
    floor: 'bg-[#f1e4d6]', wall: 'bg-[#9b7d64]', goal: 'border-[#8b4f2a]', worker: '🧍', offset: 6, variant: 'lever',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Yards ──────────────────────────────────────────────────────────────────────
// XSB notation: # wall, space floor, . goal, $ block, @ worker.  Numbered
// (matched) yards write block a for plinth A, b for B, and so on.  `par` is
// the optimal number of steps under the pool's rule (lever: with one pull),
// found by solve() and pinned by the tests.

export interface LevelDef { map: string[]; par: number; tier: 1 | 2 | 3 | 4 }

/** Lever pulls in hand on a lever yard. */
export const LEVER_PULLS = 1

/** The most steps a yard's par may take, per tier — the time budget. */
export const PAR_BUDGET: Record<Difficulty, number> = { 1: 30, 2: 40, 3: 50, 4: 62 }

export const POOLS: Record<Exclude<Variant, 'classic'>, LevelDef[]> = {
  slide: [
    { tier: 1, par: 30, map: [ // 2 blocks; classic rules: 15
      '#######',
      '#  $. #',
      '# #  @#',
      '#   $ #',
      '# .  ##',
      '#######',
    ] },
    { tier: 1, par: 30, map: [ // 2 blocks; classic rules: 31
      '#######',
      '#@   ##',
      '#. #  #',
      '#.    #',
      '#  $$ #',
      '#   # #',
      '#######',
    ] },
    { tier: 1, par: 30, map: [ // 2 blocks; classic rules: 22
      '#######',
      '#    .#',
      '# ##$$#',
      '#    .#',
      '#  @  #',
      '#######',
    ] },
    { tier: 1, par: 30, map: [ // 2 blocks; classic rules: 30
      '#######',
      '#..   #',
      '#     #',
      '#    @#',
      '# $$# #',
      '# #   #',
      '#######',
    ] },
    { tier: 1, par: 29, map: [ // 2 blocks; classic rules: 29
      '#######',
      '#.    #',
      '# $ $ #',
      '# ## .#',
      '##  @ #',
      '#######',
    ] },
    { tier: 2, par: 40, map: [ // 2 blocks; classic rules: 28
      '#######',
      '# #   #',
      '# $ # #',
      '# # $ #',
      '#@.   #',
      '#    .#',
      '#######',
    ] },
    { tier: 2, par: 40, map: [ // 3 blocks; classic rules: 26
      '#######',
      '#@$ . #',
      '#     #',
      '#    .#',
      '#.$#$ #',
      '#    ##',
      '#######',
    ] },
    { tier: 2, par: 39, map: [ // 3 blocks; classic rules: 28
      '########',
      '# #   @#',
      '# $$$  #',
      '# .    #',
      '#..   ##',
      '########',
    ] },
    { tier: 2, par: 39, map: [ // 3 blocks; classic rules: 31
      '#######',
      '##    #',
      '#@$$# #',
      '#     #',
      '#  $#.#',
      '# . . #',
      '#######',
    ] },
    { tier: 2, par: 39, map: [ // 3 blocks; classic rules: 24
      '#######',
      '#   # #',
      '#.$ $ #',
      '#    .#',
      '#.  $ #',
      '##@ # #',
      '#######',
    ] },
    { tier: 3, par: 50, map: [ // 3 blocks; classic rules: 15
      '########',
      '#  .  ##',
      '#.$ .$ #',
      '##  $  #',
      '#   #  #',
      '#     @#',
      '########',
    ] },
    { tier: 3, par: 50, map: [ // 3 blocks; classic rules: 34
      '########',
      '# $ .# #',
      '# #  @ #',
      '# #.   #',
      '#    #.#',
      '# $ $  #',
      '## #   #',
      '########',
    ] },
    { tier: 3, par: 50, map: [ // 3 blocks; classic rules: 36
      '#########',
      '#. #    #',
      '#   $   #',
      '#     .##',
      '#@#  $$ #',
      '#   #.  #',
      '#########',
    ] },
    { tier: 3, par: 48, map: [ // 3 blocks; classic rules: 32
      '########',
      '# .    #',
      '# # # ##',
      '#@  #$.#',
      '##$$   #',
      '# .    #',
      '########',
    ] },
    { tier: 3, par: 47, map: [ // 3 blocks; classic rules: 39
      '#########',
      '# ..   ##',
      '# .   $##',
      '#@#     #',
      '#  $  $ #',
      '#       #',
      '#########',
    ] },
    { tier: 4, par: 61, map: [ // 3 blocks; classic rules: 29
      '#########',
      '#    .  #',
      '#@    # #',
      '#  # $$ #',
      '# .  .$ #',
      '#  ## # #',
      '#########',
    ] },
    { tier: 4, par: 57, map: [ // 3 blocks; classic rules: 24
      '#########',
      '##    # #',
      '# $     #',
      '#  . #  #',
      '#   $@$ #',
      '#.  .  ##',
      '##      #',
      '#########',
    ] },
    { tier: 4, par: 57, map: [ // 3 blocks; classic rules: 36
      '########',
      '#  .   #',
      '#  $   #',
      '#  $$###',
      '##     #',
      '#   ## #',
      '#@  .. #',
      '########',
    ] },
    { tier: 4, par: 57, map: [ // 3 blocks; classic rules: 17
      '#########',
      '#   . # #',
      '#     $ #',
      '# . .$@ #',
      '#  #$   #',
      '# ##  # #',
      '#########',
    ] },
    { tier: 4, par: 56, map: [ // 3 blocks; classic rules: 36
      '#########',
      '## #  # #',
      '#   $  @#',
      '# ## $ ##',
      '#  $    #',
      '# .. .  #',
      '#########',
    ] },
  ],
  matched: [
    { tier: 1, par: 27, map: [ // 2 blocks; classic rules: 11
      '#######',
      '#  B ##',
      '# a   #',
      '#@# bA#',
      '#     #',
      '#######',
    ] },
    { tier: 1, par: 27, map: [ // 2 blocks; classic rules: 21
      '#######',
      '#B    #',
      '# a b##',
      '#     #',
      '# # @ #',
      '#A   ##',
      '#######',
    ] },
    { tier: 1, par: 26, map: [ // 2 blocks; classic rules: 14
      '#######',
      '# @#  #',
      '# B a #',
      '#  #  #',
      '# bA  #',
      '##    #',
      '#######',
    ] },
    { tier: 1, par: 25, map: [ // 2 blocks; classic rules: 17
      '#######',
      '##    #',
      '# a # #',
      '# b  @#',
      '#   B #',
      '##A   #',
      '#######',
    ] },
    { tier: 1, par: 25, map: [ // 2 blocks; classic rules: 16
      '#######',
      '##  BA#',
      '#@a # #',
      '# b   #',
      '#  #  #',
      '#######',
    ] },
    { tier: 2, par: 35, map: [ // 2 blocks; classic rules: 21
      '########',
      '#@#  B #',
      '# a A  #',
      '# ## b #',
      '#    # #',
      '########',
    ] },
    { tier: 2, par: 33, map: [ // 3 blocks; classic rules: 24
      '########',
      '# #  #B#',
      '# a  c #',
      '#      #',
      '#   @b #',
      '# A# C #',
      '########',
    ] },
    { tier: 2, par: 32, map: [ // 3 blocks; classic rules: 22
      '#######',
      '#  # @#',
      '# a  B#',
      '#    C#',
      '# cb  #',
      '#   A##',
      '#######',
    ] },
    { tier: 2, par: 30, map: [ // 3 blocks; classic rules: 16
      '########',
      '# #    #',
      '#@   B##',
      '#AcC   #',
      '# b  a #',
      '##     #',
      '########',
    ] },
    { tier: 2, par: 30, map: [ // 3 blocks; classic rules: 22
      '########',
      '#  bB  #',
      '# a  c #',
      '# ## # #',
      '#C     #',
      '#  @A  #',
      '########',
    ] },
    { tier: 3, par: 38, map: [ // 3 blocks; classic rules: 22
      '########',
      '#@    ##',
      '#B   c #',
      '# # Ab #',
      '#   a# #',
      '#      #',
      '#    C #',
      '########',
    ] },
    { tier: 3, par: 44, map: [ // 3 blocks; classic rules: 36
      '########',
      '#B  #@C#',
      '#   ab #',
      '#   c  #',
      '#   ####',
      '#  A   #',
      '########',
    ] },
    { tier: 3, par: 49, map: [ // 3 blocks; classic rules: 47
      '########',
      '##  ##B#',
      '##aC #A#',
      '# bc   #',
      '#      #',
      '#@     #',
      '########',
    ] },
    { tier: 3, par: 50, map: [ // 3 blocks; classic rules: 46
      '#########',
      '#  C   ##',
      '##a  B  #',
      '#   A   #',
      '#   b c #',
      '##@ ### #',
      '#########',
    ] },
    { tier: 3, par: 42, map: [ // 3 blocks; classic rules: 36
      '########',
      '#C  #@B#',
      '#   ab #',
      '#   c  #',
      '#   ####',
      '#  A   #',
      '########',
    ] },
    { tier: 4, par: 58, map: [ // 3 blocks; classic rules: 51
      '########',
      '#    #@#',
      '#  a b #',
      '# #    #',
      '# #c  ##',
      '#C# A B#',
      '########',
    ] },
    { tier: 4, par: 57, map: [ // 3 blocks; classic rules: 53
      '########',
      '# B#C @#',
      '#  # # #',
      '#     A#',
      '# ab c #',
      '#  # # #',
      '########',
    ] },
    { tier: 4, par: 55, map: [ // 3 blocks; classic rules: 48
      '#########',
      '#  #   ##',
      '#   a C #',
      '# b c   #',
      '#  #   B#',
      '# #@  A #',
      '#########',
    ] },
    { tier: 4, par: 52, map: [ // 3 blocks; classic rules: 46
      '#########',
      '#  B   ##',
      '##a  C  #',
      '#   A   #',
      '#   b c #',
      '##@ ### #',
      '#########',
    ] },
    { tier: 4, par: 51, map: [ // 3 blocks; classic rules: 47
      '########',
      '##  ##A#',
      '##aC #B#',
      '# bc   #',
      '#      #',
      '#@     #',
      '########',
    ] },
  ],
  locked: [
    { tier: 1, par: 29, map: [ // 2 blocks; classic rules: 12
      '######',
      '#..$ #',
      '# $# #',
      '#    #',
      '#  #@#',
      '#    #',
      '######',
    ] },
    { tier: 1, par: 28, map: [ // 2 blocks; classic rules: 10
      '######',
      '#@## #',
      '#$   #',
      '# #  #',
      '#.$  #',
      '#.   #',
      '######',
    ] },
    { tier: 1, par: 28, map: [ // 2 blocks; classic rules: 10
      '#######',
      '#.. $@#',
      '# $# ##',
      '#     #',
      '#     #',
      '#######',
    ] },
    { tier: 1, par: 27, map: [ // 2 blocks; classic rules: 15
      '######',
      '#    #',
      '# #  #',
      '#  $.#',
      '#. #$#',
      '#   @#',
      '######',
    ] },
    { tier: 1, par: 27, map: [ // 2 blocks; classic rules: 15
      '#######',
      '##  @ #',
      '#. .$ #',
      '## #  #',
      '#  $ ##',
      '#     #',
      '#######',
    ] },
    { tier: 2, par: 40, map: [ // 2 blocks; classic rules: 10
      '########',
      '##   #@#',
      '#  ..$ #',
      '#  # $ #',
      '#     ##',
      '#  #   #',
      '########',
    ] },
    { tier: 2, par: 40, map: [ // 2 blocks; classic rules: 11
      '########',
      '#.  #  #',
      '#      #',
      '##.$   #',
      '# $# # #',
      '#@     #',
      '########',
    ] },
    { tier: 2, par: 40, map: [ // 3 blocks; classic rules: 16
      '#######',
      '## $.##',
      '#   $ #',
      '#  .$ #',
      '#  ##@#',
      '#.    #',
      '#######',
    ] },
    { tier: 2, par: 39, map: [ // 3 blocks; classic rules: 9
      '#######',
      '#@    #',
      '#$##. #',
      '#.$ $##',
      '#.    #',
      '#     #',
      '#######',
    ] },
    { tier: 2, par: 39, map: [ // 3 blocks; classic rules: 13
      '########',
      '# $ . .#',
      '#@# $$.#',
      '#  #   #',
      '#      #',
      '########',
    ] },
    { tier: 3, par: 43, map: [ // 3 blocks; classic rules: 17
      '########',
      '#      #',
      '#   .  #',
      '# #    #',
      '# #$   #',
      '# # #$##',
      '#. .$@ #',
      '########',
    ] },
    { tier: 3, par: 42, map: [ // 3 blocks; classic rules: 28
      '#########',
      '#       #',
      '#   #   #',
      '# .  $ ##',
      '#   #$$ #',
      '# . .  @#',
      '#########',
    ] },
    { tier: 3, par: 41, map: [ // 3 blocks; classic rules: 15
      '########',
      '#.  .$@#',
      '#  #$ $#',
      '##   # #',
      '#      #',
      '##  # .#',
      '########',
    ] },
    { tier: 3, par: 41, map: [ // 3 blocks; classic rules: 25
      '########',
      '#   # .#',
      '# $+   #',
      '#  ## .#',
      '#    $$#',
      '#      #',
      '########',
    ] },
    { tier: 3, par: 40, map: [ // 3 blocks; classic rules: 12
      '########',
      '#.     #',
      '#  $.  #',
      '# ##$#.#',
      '#     $#',
      '#  #  @#',
      '########',
    ] },
    { tier: 4, par: 60, map: [ // 3 blocks; classic rules: 31
      '########',
      '#@ .   #',
      '###  # #',
      '#    $ #',
      '#.  .$ #',
      '#  ##$ #',
      '#  #   #',
      '########',
    ] },
    { tier: 4, par: 55, map: [ // 3 blocks; classic rules: 23
      '#########',
      '#       #',
      '#  #    #',
      '##  # # #',
      '## $ $# #',
      '#@$. . .#',
      '#########',
    ] },
    { tier: 4, par: 51, map: [ // 3 blocks; classic rules: 21
      '#########',
      '#       #',
      '#   #@#$#',
      '#  #  $.#',
      '#   #   #',
      '#  $.  .#',
      '#########',
    ] },
    { tier: 4, par: 49, map: [ // 3 blocks; classic rules: 15
      '########',
      '#. #   #',
      '#     ##',
      '# #    #',
      '#.$ #. #',
      '#$#  $ #',
      '#@     #',
      '########',
    ] },
    { tier: 4, par: 47, map: [ // 3 blocks; classic rules: 22
      '########',
      '#@  #.##',
      '# $.   #',
      '# $#   #',
      '#    $ #',
      '#    # #',
      '#     .#',
      '########',
    ] },
  ],
  lever: [
    { tier: 1, par: 30, map: [ // 2 blocks; classic rules: unsolvable
      '#######',
      '#     #',
      '# $ # #',
      '#     #',
      '##$#  #',
      '#.@.  #',
      '#######',
    ] },
    { tier: 1, par: 30, map: [ // 2 blocks; classic rules: unsolvable
      '#######',
      '# #  ##',
      '#@. $##',
      '#.#$  #',
      '#     #',
      '#######',
    ] },
    { tier: 1, par: 30, map: [ // 2 blocks; classic rules: unsolvable
      '#######',
      '# #   #',
      '#  $#@#',
      '#  $# #',
      '# .  .#',
      '#     #',
      '#######',
    ] },
    { tier: 1, par: 30, map: [ // 2 blocks; classic rules: unsolvable
      '#######',
      '##    #',
      '# #$  #',
      '#$    #',
      '#. @.##',
      '#######',
    ] },
    { tier: 1, par: 30, map: [ // 2 blocks; classic rules: unsolvable
      '######',
      '# $.##',
      '##   #',
      '# . @#',
      '#  $ #',
      '#  # #',
      '######',
    ] },
    { tier: 2, par: 40, map: [ // 3 blocks; classic rules: unsolvable
      '########',
      '##@    #',
      '#     $#',
      '#.#   $#',
      '# .  $.#',
      '#     ##',
      '########',
    ] },
    { tier: 2, par: 40, map: [ // 3 blocks; classic rules: unsolvable
      '#######',
      '#   . #',
      '##  ###',
      '# $   #',
      '#  #$$#',
      '#  .@.#',
      '#######',
    ] },
    { tier: 2, par: 40, map: [ // 3 blocks; classic rules: unsolvable
      '########',
      '# $  $.#',
      '##   # #',
      '#      #',
      '# # .@##',
      '#.$    #',
      '########',
    ] },
    { tier: 2, par: 40, map: [ // 3 blocks; classic rules: unsolvable
      '########',
      '#.$ #  #',
      '#     ##',
      '#@ #   #',
      '# $ $#.#',
      '# #   .#',
      '########',
    ] },
    { tier: 2, par: 40, map: [ // 3 blocks; classic rules: unsolvable
      '########',
      '# $.# ##',
      '#    $##',
      '##   $ #',
      '#  ##  #',
      '#@  . .#',
      '########',
    ] },
    { tier: 3, par: 48, map: [ // 3 blocks; classic rules: unsolvable
      '#########',
      '#   @ $.#',
      '#   # # #',
      '#  #  $ #',
      '#   ##$ #',
      '#.  .   #',
      '#########',
    ] },
    { tier: 3, par: 47, map: [ // 3 blocks; classic rules: unsolvable
      '########',
      '#     .#',
      '# @  # #',
      '# . # ##',
      '# #$ $ #',
      '#  $ . #',
      '########',
    ] },
    { tier: 3, par: 45, map: [ // 3 blocks; classic rules: unsolvable
      '#########',
      '#       #',
      '# #  $  #',
      '#.  #   #',
      '#   @# .#',
      '#   .$$ #',
      '#########',
    ] },
    { tier: 3, par: 45, map: [ // 3 blocks; classic rules: unsolvable
      '#########',
      '##      #',
      '###$ # @#',
      '# $$... #',
      '#  ##   #',
      '#       #',
      '#########',
    ] },
    { tier: 3, par: 44, map: [ // 3 blocks; classic rules: unsolvable
      '########',
      '#      #',
      '#      #',
      '# .  $ #',
      '#@  #$ #',
      '#   #$ #',
      '# .#  .#',
      '########',
    ] },
    { tier: 4, par: 60, map: [ // 3 blocks; classic rules: unsolvable
      '#########',
      '#       #',
      '#.    #.#',
      '#   $@# #',
      '# ##$## #',
      '#   $.  #',
      '#########',
    ] },
    { tier: 4, par: 58, map: [ // 3 blocks; classic rules: unsolvable
      '########',
      '#      #',
      '#@$##  #',
      '# $$   #',
      '#   .  #',
      '## ##  #',
      '#  . . #',
      '########',
    ] },
    { tier: 4, par: 54, map: [ // 3 blocks; classic rules: unsolvable
      '#########',
      '# $.    #',
      '#  ##   #',
      '# #.#$  #',
      '#@    $ #',
      '# . ##  #',
      '#########',
    ] },
    { tier: 4, par: 54, map: [ // 3 blocks; classic rules: unsolvable
      '########',
      '#  .   #',
      '#@ # #.#',
      '# #  $ #',
      '#  #$ ##',
      '#  $   #',
      '#     .#',
      '########',
    ] },
    { tier: 4, par: 54, map: [ // 3 blocks; classic rules: unsolvable
      '########',
      '#     .#',
      '#    # #',
      '## .## #',
      '#  # @ #',
      '# $  $ #',
      '# # $. #',
      '########',
    ] },
  ],
}

// ── Rules ──────────────────────────────────────────────────────────────────────

export interface Level {
  w: number
  h: number
  /** true = wall (or outside the yard). */
  walls: boolean[]
  /** matched: goals[k] is the plinth for block k; otherwise any order. */
  goals: number[]
  boxes: number[]
  player: number
}

/** `pulls` = lever pulls still in hand (lever yards only). */
export interface SokoState { player: number; boxes: number[]; pulls?: number }

export type Dir = 'U' | 'D' | 'L' | 'R'
/** A step; lower case = the same step with the lever pulling the block behind. */
export type Move = Dir | 'u' | 'd' | 'l' | 'r'
export const DIRS: Dir[] = ['U', 'D', 'L', 'R']
const OPP: Record<Dir, Dir> = { U: 'D', D: 'U', L: 'R', R: 'L' }

/**
 * Parse XSB: # wall, space floor, . goal, $ block, * block on goal,
 * @ worker, + worker on goal.  Matched yards label their pieces instead:
 * block a/b/c/d belongs on plinth A/B/C/D.
 */
export function parseLevel(map: string[]): Level {
  const h = map.length, w = Math.max(...map.map(r => r.length))
  const walls: boolean[] = [], goals: number[] = [], boxes: number[] = []
  const lb: number[] = [], lg: number[] = []
  let player = -1
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const ch = map[r][c] ?? ' '
    const i = r * w + c
    walls.push(ch === '#')
    if (ch === '.' || ch === '*' || ch === '+') goals.push(i)
    if (ch === '$' || ch === '*') boxes.push(i)
    if (ch === '@' || ch === '+') player = i
    if (ch >= 'a' && ch <= 'd') lb[ch.charCodeAt(0) - 97] = i
    if (ch >= 'A' && ch <= 'D') lg[ch.charCodeAt(0) - 65] = i
  }
  const labelled = lb.length > 0
  // Floor the worker cannot reach is outside the yard: treat it as wall.
  const seen = new Set<number>([player])
  const stack = [player]
  while (stack.length) {
    const p = stack.pop()!
    for (const d of DIRS) {
      const q = stepIndex(w, h, p, d)
      if (q < 0 || walls[q] || seen.has(q)) continue
      seen.add(q); stack.push(q)
    }
  }
  for (let i = 0; i < w * h; i++) if (!seen.has(i)) walls[i] = true
  if (labelled) return { w, h, walls, goals: lg, boxes: lb, player }
  return { w, h, walls, goals, boxes: [...boxes].sort((a, b) => a - b), player }
}

function stepIndex(w: number, h: number, i: number, d: Dir): number {
  const r = Math.floor(i / w), c = i % w
  const [nr, nc] = d === 'U' ? [r - 1, c] : d === 'D' ? [r + 1, c] : d === 'L' ? [r, c - 1] : [r, c + 1]
  if (nr < 0 || nc < 0 || nr >= h || nc >= w) return -1
  return nr * w + nc
}

export interface MoveResult { state: SokoState; pushed: boolean; pulled: boolean }

/**
 * Apply one step under a variant's rules.  Returns null when the step is
 * blocked.  `pull` asks the lever to drag the block behind the worker (lever
 * yards, while pulls remain); with no block behind it is an ordinary step.
 */
export function move(level: Level, s: SokoState, d: Dir, variant: Variant = 'classic', pull = false): MoveResult | null {
  const { w, h, walls, goals } = level
  const free = (i: number, boxes: number[]) => i >= 0 && !walls[i] && !boxes.includes(i)
  const to = stepIndex(w, h, s.player, d)
  if (to < 0 || walls[to]) return null
  const bi = s.boxes.indexOf(to)
  const sorted = variant !== 'matched'
  if (bi < 0) {
    const pulls = s.pulls ?? 0
    if (pull && pulls > 0) {
      const behind = stepIndex(w, h, s.player, OPP[d])
      const bj = behind < 0 ? -1 : s.boxes.indexOf(behind)
      if (bj >= 0) {
        const boxes = [...s.boxes]
        boxes[bj] = s.player
        if (sorted) boxes.sort((a, b) => a - b)
        return { state: { player: to, boxes, pulls: pulls - 1 }, pushed: false, pulled: true }
      }
    }
    return { state: { ...s, player: to }, pushed: false, pulled: false }
  }
  // Locked: a stone set in its socket stays there.
  if (variant === 'locked' && goals.includes(to)) return null
  let dest = stepIndex(w, h, to, d)
  if (!free(dest, s.boxes)) return null
  // Wet sand: the block keeps sliding until something stops it — a wall,
  // another block, or the brake of a sledge station it runs onto.
  if (variant === 'slide') {
    for (;;) {
      if (goals.includes(dest)) break
      const nx = stepIndex(w, h, dest, d)
      if (!free(nx, s.boxes)) break
      dest = nx
    }
  }
  const boxes = [...s.boxes]
  boxes[bi] = dest
  if (sorted) boxes.sort((a, b) => a - b)
  return { state: { ...s, player: to, boxes }, pushed: true, pulled: false }
}

/** Apply a Move (upper case step, lower case lever step). */
export function applyMove(level: Level, s: SokoState, m: Move, variant: Variant): MoveResult | null {
  const pull = m === m.toLowerCase()
  return move(level, s, m.toUpperCase() as Dir, variant, pull)
}

export function isSolved(level: Level, s: SokoState, variant: Variant = 'classic'): boolean {
  if (variant === 'matched') return s.boxes.every((b, k) => b === level.goals[k])
  return s.boxes.every(b => level.goals.includes(b))
}

/** Cells from which a block can still be pushed onto one of `goals`. */
export function liveCells(level: Level, goals: number[] = level.goals): boolean[] {
  const { w, h, walls } = level
  const live = Array(w * h).fill(false)
  const stack = [...goals]
  for (const g of stack) live[g] = true
  // Reverse pulls: a block at q can reach p if it can be pushed q→p,
  // which needs the worker standing on the far side of q.
  while (stack.length) {
    const p = stack.pop()!
    for (const d of DIRS) {
      const q = stepIndex(w, h, p, d)
      if (q < 0 || walls[q] || live[q]) continue
      const back = stepIndex(w, h, q, d)
      if (back < 0 || walls[back]) continue
      live[q] = true
      stack.push(q)
    }
  }
  return live
}

/** Is block k at cell b stranded — unable ever to reach a plinth it may use?  null = no static test (sliding). */
export function deadCheck(level: Level, variant: Variant): ((b: number, k: number) => boolean) | null {
  if (variant === 'slide') return null
  if (variant === 'matched') {
    const lives = level.goals.map(g => liveCells(level, [g]))
    return (b, k) => !lives[k][b]
  }
  const live = liveCells(level)
  return b => !live[b]
}

/**
 * Breadth-first search over (worker, blocks, pulls left): returns a
 * move-optimal list of steps, or null when the yard cannot be solved.
 * Blocks pushed onto dead cells are pruned (while no lever pull could
 * rescue them).  `limit` caps the states explored.
 */
export function solve(level: Level, variant: Variant = 'classic', start?: SokoState, limit = 3_000_000): Move[] | null {
  const dead = deadCheck(level, variant)
  const s0: SokoState = start ?? { player: level.player, boxes: level.boxes, pulls: 0 }
  const key = (s: SokoState) => s.player + ':' + s.boxes.join(',') + ':' + (s.pulls ?? 0)
  const prev = new Map<string, [string, Move] | null>()
  const k0 = key(s0)
  prev.set(k0, null)
  if (isSolved(level, s0, variant)) return []
  let frontier: SokoState[] = [s0]
  while (frontier.length && prev.size < limit) {
    const next: SokoState[] = []
    for (const s of frontier) {
      const ks = key(s)
      const tries: Move[] = (s.pulls ?? 0) > 0 ? ['U', 'D', 'L', 'R', 'u', 'd', 'l', 'r'] : DIRS
      for (const mv of tries) {
        const m = applyMove(level, s, mv, variant)
        if (!m) continue
        if (mv === mv.toLowerCase() && !m.pulled) continue
        if (m.pushed && dead && !(m.state.pulls ?? 0) && m.state.boxes.some(dead)) continue
        const kn = key(m.state)
        if (prev.has(kn)) continue
        prev.set(kn, [ks, mv])
        if (isSolved(level, m.state, variant)) {
          const path: Move[] = []
          let cur: string = kn
          for (let link = prev.get(cur); link; link = prev.get(cur)) { path.push(link[1]); cur = link[0] }
          return path.reverse()
        }
        next.push(m.state)
      }
    }
    frontier = next
  }
  return null
}

/** Rotate/mirror a map: t in 0..7 (bit 0 mirror, bits 1–2 quarter turns). */
export function transformMap(map: string[], t: number): string[] {
  const w = Math.max(...map.map(r => r.length))
  let g = map.map(r => r.padEnd(w, ' ').split(''))
  if (t & 1) g = g.map(r => [...r].reverse())
  for (let k = 0; k < (t >> 1) % 4; k++) {
    const h = g.length, ww = g[0].length
    const n: string[][] = Array.from({ length: ww }, () => Array(h).fill(' '))
    for (let r = 0; r < h; r++) for (let c = 0; c < ww; c++) n[c][h - 1 - r] = g[r][c]
    g = n
  }
  return g.map(r => r.join(''))
}

export interface Plan { levelIndex: number; transform: number; level: Level; par: number; cap: number; variant: Variant; start: SokoState }

export function capFor(difficulty: Difficulty, par: number): number {
  return scale(difficulty, [
    par * 3 + 20,
    Math.ceil(par * 2.5) + 15,
    par * 2 + 10,
    Math.ceil(par * 1.5) + 10,
  ])
}

export function levelsForTier(variant: Exclude<Variant, 'classic'>, tier: Difficulty): number[] {
  return POOLS[variant].map((l, i) => (l.tier === tier ? i : -1)).filter(i => i >= 0)
}

export function planLevel(configId: string, difficulty: Difficulty, seed: number, params?: Record<string, unknown>): Plan {
  const cfg = resolveConfig(CONFIGS, configId, undefined, 'giza-ramp')
  const { variant } = cfg
  const pool = levelsForTier(variant, difficulty)
  const h = hashString(`${configId}:${seed}`)
  const forced = typeof params?.level === 'number' ? (params.level as number) : null
  const levelIndex = forced ?? pool[(h + cfg.offset) % pool.length]
  const transform = forced !== null ? 0 : (h >>> 8) % 8
  const def = POOLS[variant][levelIndex]
  const level = parseLevel(transformMap(def.map, transform))
  const start: SokoState = { player: level.player, boxes: level.boxes, pulls: variant === 'lever' ? LEVER_PULLS : 0 }
  return { levelIndex, transform, level, par: def.par, cap: capFor(difficulty, def.par), variant, start }
}

// ── Component ──────────────────────────────────────────────────────────────────

const KEYS: Record<string, Dir> = {
  ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R',
  w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R',
}

const NUMERALS = ['I', 'II', 'III', 'IV']

export default function SokobanGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = { ...resolveConfig(CONFIGS, configId, undefined, 'giza-ramp'), ...storyText(params) }
  const plan = useMemo(() => planLevel(configId, difficulty, seed, params), [configId, difficulty, seed, params])
  const { level, par, cap, variant, start: initial } = plan

  const [state, setState] = useState<SokoState>(initial)
  const [history, setHistory] = useState<SokoState[]>([])
  const [labour, setLabour] = useState(0)
  const [pushes, setPushes] = useState(0)
  const [armed, setArmed] = useState(false)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })

  // Refs let rapid key presses chain without waiting for a re-render.
  const live = useRef({ state, history, labour, pushes, settled, armed })
  live.current = { state, history, labour, pushes, settled, armed }

  useEffect(() => {
    setState(initial); setHistory([]); setLabour(0); setPushes(0); setArmed(false)
  }, [initial])

  const step = useCallback((d: Dir) => {
    const cur = live.current
    if (cur.settled) return
    const m = move(level, cur.state, d, variant, cur.armed)
    if (!m) return
    const labourNext = cur.labour + 1
    const history = [...cur.history, cur.state]
    const armed = cur.armed && !m.pulled
    live.current = { ...cur, state: m.state, history, labour: labourNext, pushes: cur.pushes + (m.pushed ? 1 : 0), armed }
    setState(m.state)
    setHistory(history)
    setLabour(labourNext)
    setArmed(armed)
    if (m.pushed) setPushes(p => p + 1)
    if (isSolved(level, m.state, variant)) { live.current.settled = true; win() }
    else if (labourNext >= cap) { live.current.settled = true; lose('The sun set before the blocks were in place') }
  }, [level, cap, variant, win, lose])

  const toggleLever = useCallback(() => {
    const cur = live.current
    if (cur.settled || variant !== 'lever') return
    const armed = !cur.armed && (cur.state.pulls ?? 0) > 0
    live.current = { ...cur, armed }
    setArmed(armed)
  }, [variant])

  const undo = useCallback(() => {
    const cur = live.current
    if (cur.settled || !cur.history.length) return
    const prev = cur.history[cur.history.length - 1]
    const history = cur.history.slice(0, -1)
    live.current = { ...cur, state: prev, history, armed: false }
    setState(prev); setHistory(history); setArmed(false)
  }, [])

  const restart = useCallback(() => {
    const cur = live.current
    if (cur.settled) return
    live.current = { ...cur, state: initial, history: [], armed: false }
    setState(initial); setHistory([]); setArmed(false)
  }, [initial])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const d = KEYS[e.key]
      if (d) { e.preventDefault(); step(d); return }
      if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace' || e.key === 'u') { e.preventDefault(); undo() }
      if (e.key === 'r' || e.key === 'R') restart()
      if (e.key === 'e' || e.key === 'E' || e.key === ' ') { e.preventDefault(); toggleLever() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, undo, restart, toggleLever])

  // Swipe on the board.
  const touch = useRef<[number, number] | null>(null)
  const onPointerDown = (e: React.PointerEvent) => { touch.current = [e.clientX, e.clientY] }
  const onPointerUp = (e: React.PointerEvent) => {
    if (!touch.current) return
    const dx = e.clientX - touch.current[0], dy = e.clientY - touch.current[1]
    touch.current = null
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    step(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U'))
  }
  // Tap a neighbouring cell to step there.
  const tapCell = (i: number) => {
    const { w } = level
    const pr = Math.floor(state.player / w), pc = state.player % w
    const r = Math.floor(i / w), c = i % w
    if (pr === r && Math.abs(pc - c) === 1) step(c > pc ? 'R' : 'L')
    else if (pc === c && Math.abs(pr - r) === 1) step(r > pr ? 'D' : 'U')
  }

  const matched = variant === 'matched'
  const onOwnGoal = (b: number, k: number) => (matched ? level.goals[k] === b : level.goals.includes(b))
  const placed = state.boxes.filter(onOwnGoal).length
  const dead = useMemo(() => deadCheck(level, variant), [level, variant])
  const stranded = (b: number, k: number) => !!dead && !(state.pulls ?? 0) && dead(b, k)
  const stuck = state.boxes.some(stranded)
  const left = cap - labour
  const pulls = state.pulls ?? 0

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title} · <span data-testid="soko-rule">{cfg.rule}</span></p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p className="font-bold text-ink-2" data-testid="soko-placed">{placed} / {level.goals.length} set</p>
          <p data-testid="soko-moves">Moves {history.length}</p>
          <p>Pushes {pushes} · Par {par}</p>
          <p className={left <= 10 ? 'text-red-600 font-bold' : ''} data-testid="soko-labour">Daylight {Math.max(0, left)}</p>
        </div>
      </div>

      {!settled && (
        <div className="flex items-center justify-between gap-3 w-full max-w-[420px] mx-auto">
          <button type="button" onClick={undo} disabled={!history.length} data-testid="soko-undo"
            className="h-8 px-3 rounded-lg border bg-panel border-line text-ink-2 text-xs font-bold disabled:opacity-40">↶ Undo</button>
          <button type="button" onClick={restart} data-testid="soko-restart"
            className="h-8 px-3 rounded-lg border bg-panel border-line text-ink-2 text-xs font-bold">⟲ Restart</button>
        </div>
      )}

      <div className="w-full max-w-[420px] mx-auto select-none rounded-lg overflow-hidden border-2 border-ink-2 shadow-md"
        style={{ touchAction: 'none' }} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${level.w}, 1fr)` }}>
          {level.walls.map((wall, i) => {
            const gk = level.goals.indexOf(i)
            const goal = gk >= 0
            const bk = state.boxes.indexOf(i)
            const box = bk >= 0
            const home = box && onOwnGoal(i, bk)
            const me = state.player === i
            return (
              <button key={i} type="button" tabIndex={-1} aria-label={wall ? 'wall' : box ? 'block' : goal ? 'mark' : 'floor'}
                data-cell={i} onClick={() => tapCell(i)}
                className={`relative aspect-square ${wall ? cfg.wall : cfg.floor}`}>
                {!wall && goal && (
                  <span className={`absolute inset-[22%] rounded-full border-2 border-dashed ${cfg.goal} flex items-center justify-center text-[min(2.6vw,10px)] font-bold text-ink-2/70`}>
                    {matched ? NUMERALS[gk] : ''}
                  </span>
                )}
                {box && (
                  <span className={`absolute inset-[8%] rounded-[3px] border-2 shadow-sm flex items-center justify-center text-[min(3vw,12px)] font-bold text-ink
                    ${home ? cfg.blockOnGoal : cfg.block}
                    ${stranded(i, bk) ? 'ring-2 ring-red-500/70' : ''}`}>
                    {matched ? NUMERALS[bk] : variant === 'locked' && home ? '🔒' : ''}
                  </span>
                )}
                {me && <span className="absolute inset-0 flex items-center justify-center text-[min(5.5vw,22px)] leading-none">{cfg.worker}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {stuck && !settled && (
        <p className="text-red-600 text-[11px] text-center font-bold">A block is wedged where it can never reach its mark — undo or restart.</p>
      )}

      {!settled && (
        <div className="flex items-center justify-center gap-4 w-full max-w-[420px] mx-auto">
          <div className="grid grid-cols-3 gap-1 w-[150px]">
            <span />
            <PadButton label="up" onClick={() => step('U')}>▲</PadButton>
            <span />
            <PadButton label="left" onClick={() => step('L')}>◀</PadButton>
            <PadButton label="down" onClick={() => step('D')}>▼</PadButton>
            <PadButton label="right" onClick={() => step('R')}>▶</PadButton>
          </div>
          {variant === 'lever' && (
            <button type="button" onClick={toggleLever} disabled={!pulls} data-testid="soko-lever" aria-pressed={armed}
              className={`h-12 flex-1 max-w-[180px] rounded-lg border text-xs font-bold disabled:opacity-40 ${armed ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink-2'}`}>
              {armed ? 'Lever armed — step away from a block' : `🪵 Lever (${pulls} left)`}
            </button>
          )}
        </div>
      )}
      <p className="text-muted/80 text-[10px] text-center">
        {settled ? '' : `Arrows / WASD, swipe, or tap next to the worker · Z undo · R restart${variant === 'lever' ? ' · E lever' : ''}`}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Every block in place!" loseTitle="The sun has set" />
    </div>
  )
}

function PadButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick}
      className="h-12 rounded-lg border bg-panel border-line text-ink font-bold active:bg-accent/20">{children}</button>
  )
}
