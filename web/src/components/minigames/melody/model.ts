// Next Phrase: the tunes and the pure rules behind MelodyGame.
//
// Each tune is written out as a list of short units (a bar or two each), with
// a note on how every unit grows out of what came before it: a repeat, a
// sequence one step lower, an answer that returns home to the tonic.  A puzzle
// picks a unit boundary, shows the music before it as the opening, and asks
// for the notes after it.  The target is cut from whole units when a tier's
// length allows, so it usually ends where a phrase ends.
//
// Pitches are scientific names (C4 = middle C) spelled with sharps; a
// duration is in quarter-note beats.  "E4:1 E4 F4" means three quarter
// notes: a token without a duration keeps the one before it.  "R" is a rest.

import type { Difficulty } from '@/games/types'
import { mulberry32, shuffle, type Rng } from '../_shared/rng'

export interface Note { p: string | null; d: number }
export interface Unit { notes: Note[]; device: string }

export interface Tune {
  title: string
  tune: string
  composer: string
  year: string
  /** Great People card id, when the composer has one. */
  card?: string
  bpm: number
  intro: string
  fact: string
  units: Unit[]
}

export function seq(s: string): Note[] {
  let d = 1
  return s.trim().split(/\s+/).map(tok => {
    const [p, dur] = tok.split(':')
    if (dur) d = Number(dur)
    return { p: p === 'R' ? null : p, d }
  })
}

const U = (notes: string, device = ''): Unit => ({ notes: seq(notes), device })

export const TUNES: Record<string, Tune> = {
  'ode-to-joy': {
    title: 'Ode to Joy',
    tune: 'Symphony No. 9, finale (hymn tune)',
    composer: 'Ludwig van Beethoven',
    year: '1824',
    bpm: 112,
    intro: 'The choir’s hymn from Beethoven’s last symphony moves almost entirely by step. Listen to the opening, then build the next phrase.',
    fact: 'Beethoven was almost totally deaf at the 1824 premiere in Vienna; a singer had to turn him round to see the applause. The melody has been the anthem of Europe since 1972.',
    units: [
      U('E4:1 E4 F4 G4 G4 F4 E4 D4'),
      U('C4:1 C4 D4 E4 E4:1.5 D4:0.5 D4:2', 'The answer: the same steady steps, starting low on C, climbing back and stopping on D, one step short of home.'),
      U('E4:1 E4 F4 G4 G4 F4 E4 D4', 'A repeat: the opening line comes back note for note.'),
      U('C4:1 C4 D4 E4 D4:1.5 C4:0.5 C4:2', 'Like the first answer, but this time it comes home and rests on C.'),
      U('D4:1 D4 E4 C4 D4 E4:0.5 F4 E4:1 C4', 'A new middle part: it circles round D, with two quick notes in the middle.'),
      U('D4:1 E4:0.5 F4 E4:1 D4 C4 D4 G3:2', 'The same circling idea, then a drop to low G to get ready to go home.'),
      U('E4:1 E4 F4 G4 G4 F4 E4 D4', 'The return: the opening tune comes back.'),
      U('C4:1 C4 D4 E4 D4:1.5 C4:0.5 C4:2', 'The answer that comes home to C closes the hymn.'),
    ],
  },
  'fur-elise': {
    title: 'Für Elise',
    tune: 'Bagatelle in A minor, WoO 59',
    composer: 'Ludwig van Beethoven',
    year: '1810',
    bpm: 66,
    intro: 'Two notes rock back and forth, then the melody turns down to A. Listen to the opening, then build what the right hand plays next.',
    fact: 'Beethoven never published Für Elise; it was found and printed in 1867, forty years after his death, and nobody is sure who “Elise” was.',
    units: [
      U('E5:0.25 D#5 E5 D#5 E5 B4 D5 C5 A4:0.5 R:0.25'),
      U('C4:0.25 E4 A4 B4:0.5 R:0.25', 'A broken chord climbs from low C and lands on B.'),
      U('E4:0.25 G#4 B4 C5:0.5 R:0.25', 'Sequence: the same climbing shape, starting from E this time and landing on C.'),
      U('E4:0.25 E5 D#5 E5 D#5 E5 B4 D5 C5 A4:0.5 R:0.25', 'A leap up an octave, and the rocking opening comes back exactly.'),
      U('C4:0.25 E4 A4 B4:0.5 R:0.25', 'The climb from low C again, note for note.'),
      U('E4:0.25 C5 B4 A4:1', 'This time it steps down and comes home to A.'),
    ],
  },
  'twinkle': {
    title: 'Twinkle, Twinkle',
    tune: 'Ah ! vous dirai-je, maman',
    composer: 'French folk tune',
    year: '1761',
    bpm: 108,
    intro: 'A French tune that Mozart wrote twelve variations on. Every note is sung twice. Listen, then build the next phrase.',
    fact: 'The tune was printed in Paris in 1761 as “Ah ! vous dirai-je, maman”; Mozart wrote his twelve piano variations on it around 1781, and Jane Taylor’s poem “The Star” (1806) gave it its English words.',
    units: [
      U('C4:1 C4 G4 G4 A4 A4 G4:2'),
      U('F4:1 F4 E4 E4 D4 D4 C4:2', 'The answer walks down step by step, two notes on each step, back home to C.'),
      U('G4:1 G4 F4 F4 E4 E4 D4:2', 'A new line from the top: the answer’s walk down, one step higher, stopping on D.'),
      U('G4:1 G4 F4 F4 E4 E4 D4:2', 'An exact repeat of the line before.'),
      U('C4:1 C4 G4 G4 A4 A4 G4:2', 'The opening comes back.'),
      U('F4:1 F4 E4 E4 D4 D4 C4:2', 'And the answer walks it home to C.'),
    ],
  },
  'frere-jacques': {
    title: 'Frère Jacques',
    tune: 'Frère Jacques (round)',
    composer: 'French folk round',
    year: '18th century',
    bpm: 112,
    intro: 'A round: every line is sung twice, and each voice comes in two bars after the last. Listen, then build the next part.',
    fact: 'Gustav Mahler turned Frère Jacques into a slow funeral march in a minor key for the third movement of his First Symphony (1888).',
    units: [
      U('C4:1 D4 E4 C4'),
      U('C4:1 D4 E4 C4', 'A repeat: every line of this round is sung twice.'),
      U('E4:1 F4 G4:2', 'New line: it climbs on from E and holds the G.'),
      U('E4:1 F4 G4:2', 'Sung twice, like every line.'),
      U('G4:0.5 A4 G4 F4 E4:1 C4', 'Quick notes: a little turn round G that runs down to C.'),
      U('G4:0.5 A4 G4 F4 E4:1 C4', 'Sung twice.'),
      U('C4:1 G3 C4:2', 'The bells: home on C, a drop to low G, and back to C.'),
      U('C4:1 G3 C4:2', 'Sung twice.'),
    ],
  },
  'minuet-in-g': {
    title: 'Minuet in G',
    tune: 'Minuet in G major (Anna Magdalena Notebook)',
    composer: 'Christian Petzold',
    year: '1725',
    bpm: 120,
    intro: 'A dance in three, from the music book Bach kept for his wife Anna Magdalena. Listen, then build the next phrase.',
    fact: 'For two centuries this minuet was credited to J. S. Bach; in the 1970s scholars showed it was by the Dresden organist Christian Petzold.',
    units: [
      U('D5:1 G4:0.5 A4 B4 C5 D5:1 G4 G4'),
      U('E5:1 C5:0.5 D5 E5 F#5 G5:1 G4 G4', 'Sequence: the same shape again, starting higher on E and running up to high G before the two low Gs.'),
      U('C5:1 D5:0.5 C5 B4 A4 B4:1 C5:0.5 B4 A4 G4', 'Stepping down in a sequence: each little run starts one step lower than the last.'),
      U('F#4:1 G4:0.5 A4 B4 G4 A4:3', 'A half close: it settles on A, not yet home.'),
      U('D5:1 G4:0.5 A4 B4 C5 D5:1 G4 G4', 'The opening returns.'),
      U('E5:1 C5:0.5 D5 E5 F#5 G5:1 G4 G4', 'The higher sequence returns.'),
      U('C5:1 D5:0.5 C5 B4 A4 B4:1 C5:0.5 B4 A4 G4', 'The stepping-down sequence returns.'),
      U('A4:1 B4:0.5 A4 G4 F#4 G4:3', 'This time the close comes home to G.'),
    ],
  },
  'greensleeves': {
    title: 'Greensleeves',
    tune: 'Greensleeves',
    composer: 'English ballad',
    year: '1580',
    bpm: 96,
    intro: 'An English ballad with a lilting long-short rhythm. Listen to the opening, then build the next phrase.',
    fact: 'Greensleeves was registered with the Stationers’ Company in London in 1580, and Shakespeare named it twice in The Merry Wives of Windsor. The story that Henry VIII wrote it is a legend.',
    units: [
      U('A4:0.5 C5:1 D5:0.5 E5:0.75 F5:0.25 E5:0.5'),
      U('D5:1 B4:0.5 G4:0.75 A4:0.25 B4:0.5', 'The same lilting rhythm as the bar before, but the line now falls toward G.'),
      U('C5:1 A4:0.5 A4:0.75 G#4:0.25 A4:0.5', 'The lilt again, circling round A.'),
      U('B4:1 G#4:0.5 E4:1 A4:0.5', 'A half close: it drops to low E, and a pickup A starts the tune again.'),
      U('C5:1 D5:0.5 E5:0.75 F5:0.25 E5:0.5', 'The opening line returns.'),
      U('D5:1 B4:0.5 G4:0.75 A4:0.25 B4:0.5', 'The falling bar returns, unchanged.'),
      U('C5:0.75 B4:0.25 A4:0.5 G#4:0.75 F#4:0.25 G#4:0.5 A4:1.5 A4:1.5', 'The close: it steps down through G♯ and F♯ and comes home to A.'),
    ],
  },
  'brahms-lullaby': {
    title: 'Brahms’s Lullaby',
    tune: 'Wiegenlied, Op. 49 No. 4',
    composer: 'Johannes Brahms',
    year: '1868',
    card: 'johannes_brahms',
    bpm: 100,
    intro: 'A cradle song that rocks in three. Listen to the opening, then build the next phrase.',
    fact: 'Brahms wrote the Wiegenlied in 1868 for his friend Bertha Faber when her second son was born, hiding in its accompaniment a Viennese song she used to sing to him.',
    units: [
      U('E4:0.5 E4 G4:1.5 E4:0.5 E4:1 G4:2'),
      U('E4:0.5 G4 C5:1 B4:1.5 A4:0.5 A4:1 G4:1', 'It climbs higher this time, peaks on high C and sinks back to G.'),
      U('D4:0.5 E4 F4:1 D4 D4:0.5 E4 F4:2', 'A new rocking start, low on D, rocking twice.'),
      U('D4:0.5 F4 B4 A4 G4:1 B4 C5:2', 'The rocking climbs and at last lands home on C.'),
    ],
  },
  'canon-in-d': {
    title: 'Canon in D',
    tune: 'Canon and Gigue in D major',
    composer: 'Johann Pachelbel',
    year: 'c. 1690',
    bpm: 72,
    intro: 'Eight bass notes repeat over and over while the violins weave above them. The opening is the bass, played up high. Build what the violins play next.',
    fact: 'The same eight-note bass repeats 28 times under Pachelbel’s canon. The piece was almost forgotten until a 1968 recording by Jean-François Paillard made it famous.',
    units: [
      U('D5:1 A4 B4 F#4 G4 D4 G4 A4'),
      U('F#5:1 E5 D5 C#5 B4 A4 B4 C#5', 'The first violin enters, walking down the scale: one note for each bass note.'),
      U('D5:1 C#5 B4 A4 G4 F#4 G4 E4', 'Another walk down over the same bass, starting lower on D.'),
      U('D4:0.5 F#4 A4 G4 F#4 D4 F#4 E4', 'Twice as fast now: the line leaps up and down in quick notes.'),
      U('D4:0.5 B3 D4 A4 G4 B4 A4 G4', 'The leaping pattern carries on over the rest of the bass.'),
    ],
  },
  'jasmine-flower': {
    title: 'Mò Lì Huā',
    tune: 'Mò Lì Huā (Jasmine Flower)',
    composer: 'Chinese folk song',
    year: '18th century',
    bpm: 66,
    intro: 'A five-note (pentatonic) song from the Yangtze region: “What a beautiful jasmine flower.” Listen, then build the next phrase.',
    fact: 'Mò Lì Huā was one of the first Chinese songs printed in the West, in John Barrow’s Travels in China (1804); Puccini later wove it into his opera Turandot.',
    units: [
      U('B4:0.5 B4:0.25 D5 E5 G5 G5 E5'),
      U('D5:0.5 D5:0.25 E5 D5:1', 'The answer settles on D, with a little turn up to E and back.'),
      U('B4:0.5 B4:0.25 D5 E5 G5 G5 E5', 'A repeat of the opening line.'),
      U('D5:0.5 D5:0.25 E5 D5:1', 'And its answer repeats too.'),
      U('D5:0.5 D5 D5 B4:0.25 D5 E5:0.5 E5 D5:1', 'A new line that stays on D, dips to B and rises to E before settling on D again.'),
    ],
  },
  'mountain-king': {
    title: 'Hall of the Mountain King',
    tune: 'In the Hall of the Mountain King (Peer Gynt)',
    composer: 'Edvard Grieg',
    year: '1875',
    bpm: 104,
    intro: 'Trolls creep up on Peer Gynt: low, quiet steps that keep coming back. Listen to the opening, then build the next phrase.',
    fact: 'Grieg wrote it for Ibsen’s play Peer Gynt (first staged in 1876): the same short tune repeats again and again, faster and louder, as the trolls close in.',
    units: [
      U('B3:0.5 C#4 D4 E4 F#4 D4 F#4:1'),
      U('F4:0.5 C#4 F4:1', 'Sequence: the same bounce at the end of the opening, one half step lower.'),
      U('E4:0.5 C4 E4:1', 'And again, one more half step lower.'),
      U('B3:0.5 C#4 D4 E4 F#4 D4 F#4 B4', 'The opening creep again, but this time it leaps up to high B.'),
      U('A4:0.5 F#4 D4 F#4 A4:2', 'It tumbles down the chord and back up, holding the top note.'),
    ],
  },
  'turkish-march': {
    title: 'Turkish March',
    tune: 'Rondo alla Turca, Piano Sonata K. 331',
    composer: 'Wolfgang Amadeus Mozart',
    year: 'c. 1783',
    bpm: 108,
    intro: 'A quick little turn of four notes, then a jump. Listen to the opening, then build the next phrase.',
    fact: 'Mozart’s rondo copies the sound of Ottoman Janissary bands, whose drums, cymbals and triangles were the height of fashion in 1780s Vienna.',
    units: [
      U('B4:0.25 A4 G#4 A4 C5:0.5 R:0.5'),
      U('D5:0.25 C5 B4 C5 E5:0.5 R:0.5', 'Sequence: the same little turn, one step higher, landing on E.'),
      U('F5:0.25 E5 D#5 E5', 'And once more, one step higher still…'),
      U('B5:0.25 A5 G#5 A5 B5 A5 G#5 A5 C6:1', 'Then the opening turn jumps up an octave, spins twice and lands on high C.'),
    ],
  },
  'jingle-bells': {
    title: 'Jingle Bells',
    tune: 'One Horse Open Sleigh',
    composer: 'James Lord Pierpont',
    year: '1857',
    bpm: 132,
    intro: 'The chorus everyone knows. Listen to the opening, then build the next phrase.',
    fact: 'Jingle Bells was the first song played in space: in December 1965 the Gemini 6 astronauts played it on a smuggled harmonica and sleigh bells.',
    units: [
      U('E4:1 E4 E4:2 E4:1 E4 E4:2'),
      U('E4:1 G4 C4:1.5 D4:0.5 E4:4', 'The answer: a leap up to G, a drop to low C, then steps back up to hold E.'),
      U('F4:1 F4 F4:1.5 F4:0.5 F4:1 E4 E4 E4:0.5 E4', 'A new line of repeated notes, stepping from F down to E.'),
      U('E4:1 D4 D4 E4 D4:2 G4:2', 'It steps down to D and ends on a question: a jump up to G.'),
      U('E4:1 E4 E4:2 E4:1 E4 E4:2', 'The opening returns.'),
      U('E4:1 G4 C4:1.5 D4:0.5 E4:4', 'And so does its answer.'),
      U('F4:1 F4 F4:1.5 F4:0.5 F4:1 E4 E4 E4:0.5 E4', 'The repeated-note line returns.'),
      U('G4:1 G4 F4 D4 C4:4', 'This time it falls from G and comes home to C.'),
    ],
  },
  'mary-lamb': {
    title: 'Mary Had a Little Lamb',
    tune: 'Mary Had a Little Lamb',
    composer: 'American nursery song (words by Sarah Josepha Hale)',
    year: '1830',
    bpm: 116,
    intro: 'Three notes, a step apart. Listen to the opening, then build the next phrase.',
    fact: '“Mary had a little lamb” were the first words Thomas Edison recorded on his tinfoil phonograph in 1877.',
    units: [
      U('E4:1 D4 C4 D4 E4 E4 E4:2'),
      U('D4:1 D4 D4:2 E4:1 G4 G4:2', 'Repeated notes: three on D, then a step up and two on G.'),
      U('E4:1 D4 C4 D4 E4 E4 E4 E4', 'The opening returns, with one extra E.'),
      U('D4:1 D4 E4 D4 C4:4', 'It steps round D and comes home to C.'),
    ],
  },
  'yankee-doodle': {
    title: 'Yankee Doodle',
    tune: 'Yankee Doodle',
    composer: 'Anglo-American folk tune',
    year: 'c. 1770',
    bpm: 120,
    intro: 'A marching song of the American Revolution. Listen to the opening, then build the next phrase.',
    fact: 'British soldiers first sang Yankee Doodle to mock the colonists, who took it over as their own; it has been Connecticut’s state song since 1978.',
    units: [
      U('C4:1 C4 D4 E4 C4 E4 D4 G3'),
      U('C4:1 C4 D4 E4 C4:2 B3:2', 'It starts like the opening but stops short on B, one step below home.'),
      U('C4:1 C4 D4 E4 F4 E4 D4 C4', 'It starts the same again, then climbs one step higher to F and walks back down.'),
      U('B3:1 G3 A3 B3 C4:2 C4:2', 'It dips to low G and climbs back up to land home on C.'),
    ],
  },
}

export const TUNE_IDS = Object.keys(TUNES)

// ── Pitch helpers ───────────────────────────────────────────────────────────

const LETTER = 'CDEFGAB'
const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function midiOf(p: string): number {
  const m = /^([A-G])(#?)(\d)$/.exec(p)
  if (!m) throw new Error(`bad pitch ${p}`)
  return (Number(m[3]) + 1) * 12 + SEMI[m[1]] + (m[2] ? 1 : 0)
}
export function nameOf(midi: number): string {
  return `${SHARP_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`
}
export function freqOf(p: string): number { return 440 * 2 ** ((midiOf(p) - 69) / 12) }
/** Diatonic staff step: C0 = 0, so E4 (bottom line of the treble staff) = 30. */
export function stepOf(p: string): number { return Number(p[p.length - 1]) * 7 + LETTER.indexOf(p[0]) }
export function label(p: string): string { return p.replace('#', '♯') }

// ── Tiers ───────────────────────────────────────────────────────────────────

export const TIERS = {
  /** Notes to fill, [min, max]. */
  length: [[4, 5], [6, 7], [8, 9], [10, 12]] as [number, number][],
  decoys: [0, 1, 2, 3],
  attempts: [6, 6, 6, 5],
  seconds: [150, 180, 240, 270],
  /** Plays of the opening allowed; 0 = as many as you like. */
  replays: [0, 0, 0, 3],
  /** When the "how the tune moves" hint shows: from the start, after n misses, never. */
  hintAfter: [0, 0, 2, Infinity],
  /** Note names printed under the opening. */
  names: [true, true, false, false],
}

// ── Puzzle ─────────────────────────────────────────────────────────────────

export interface Puzzle {
  tuneId: string
  difficulty: Difficulty
  /** Index of the first target unit. */
  start: number
  opening: Note[]
  /** The phrase to build, rests included (rests are not slots). */
  target: Note[]
  /** Pitches of the target's notes, one per slot. */
  answer: string[]
  /** Tiles, shuffled: the answer's pitches plus decoys. */
  tray: string[]
  decoys: string[]
  devices: string[]
  attempts: number
  seconds: number
  replays: number
  hintAfter: number
  names: boolean
  bpm: number
}

const pitched = (ns: Note[]) => ns.filter(n => n.p !== null).length

/** The target that starts at unit t for a tier's length range, or null. */
export function targetFrom(units: Unit[], t: number, [min, max]: [number, number]): { notes: Note[]; units: number; cut: boolean } | null {
  if (t < 1 || t >= units.length) return null
  let best = -1, count = 0
  for (let k = t; k < units.length; k++) {
    count += pitched(units[k].notes)
    if (count >= min && count <= max) best = k
  }
  let notes: Note[]
  let used = 0
  const cut = best < 0
  if (best >= 0) {
    notes = units.slice(t, best + 1).flatMap(u => u.notes)
    used = best - t + 1
  } else {
    if (count < min) return null
    // No phrase ends inside the range: cut the music at the longest length allowed.
    const take = Math.min(max, count)
    notes = []
    let n = 0
    for (let k = t; k < units.length && n < take; k++) {
      used++
      for (const x of units[k].notes) {
        if (n >= take) break
        notes.push(x)
        if (x.p) n++
      }
    }
  }
  while (notes.length && notes[notes.length - 1].p === null) notes = notes.slice(0, -1)
  const distinct = new Set(notes.filter(n => n.p).map(n => n.p)).size
  return distinct >= 3 ? { notes, units: used, cut } : null
}

export function validStarts(tuneId: string, d: Difficulty): number[] {
  const units = TUNES[tuneId].units
  const out: number[] = []
  for (let t = 1; t < units.length; t++) if (targetFrom(units, t, TIERS.length[d - 1])) out.push(t)
  return out
}

/** The music shown before unit t: the unit before it, and earlier ones until there is enough to hear. */
export function openingBefore(units: Unit[], t: number): Note[] {
  let notes = units[t - 1].notes
  for (let k = t - 2; k >= 0; k--) {
    if (pitched(notes) >= 8) break
    if (pitched(notes) + pitched(units[k].notes) > 16) break
    notes = [...units[k].notes, ...notes]
  }
  return notes
}

function decoysFor(tune: Tune, answer: string[], n: number, d: Difficulty, rng: Rng): string[] {
  if (!n) return []
  const inAnswer = new Set(answer)
  const lo = midiOf('G3'), hi = midiOf('C6')
  const near = new Set<string>()
  for (const p of answer) for (const off of [-2, -1, 1, 2]) {
    const m = midiOf(p) + off
    if (m >= lo && m <= hi) near.add(nameOf(m))
  }
  const others = new Set(tune.units.flatMap(u => u.notes).map(x => x.p).filter((p): p is string => !!p))
  const pool = (s: Set<string>) => shuffle([...s].filter(p => !inAnswer.has(p)).sort(), rng)
  // Expert decoys sit right next to the real notes; easier ones come from elsewhere in the tune.
  const first = d >= 4 ? pool(near) : pool(others)
  const rest = d >= 4 ? pool(others) : pool(near)
  const out: string[] = []
  for (const p of [...first, ...rest]) if (out.length < n && !out.includes(p)) out.push(p)
  return out
}

/** A hint drawn from the notes themselves: where it starts and how it moves. */
export function shapeOf(answer: readonly string[]): string {
  const steps = answer.slice(1).map((p, i) => Math.abs(midiOf(p) - midiOf(answer[i])))
  const leaps = steps.filter(x => x > 2).length
  const moves = leaps === 0 ? 'moves only by step or repeats a note' : leaps === 1 ? 'moves by step except for one leap' : 'mixes steps with leaps'
  return `This is the start of the next phrase: it begins on ${answer[0].replace(/\d/, '')} and ${moves}.`
}

export function generate(tuneId: string, d: Difficulty, seed: number): Puzzle {
  const id = TUNES[tuneId] ? tuneId : TUNE_IDS[0]
  const tune = TUNES[id]
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0)
  const range = TIERS.length[d - 1]
  const starts = validStarts(id, d)
  const start = starts[Math.floor(rng() * starts.length)]
  const tgt = targetFrom(tune.units, start, range)!
  const answer = tgt.notes.filter(n => n.p).map(n => n.p!)
  const decoys = decoysFor(tune, answer, TIERS.decoys[d - 1], d, rng)
  let tray = shuffle([...answer, ...decoys], rng)
  // Never hand over the tiles already in order.
  for (let i = 0; i < 8 && tray.slice(0, answer.length).join() === answer.join(); i++) tray = shuffle(tray, rng)
  return {
    tuneId: id,
    difficulty: d,
    start,
    opening: openingBefore(tune.units, start),
    target: tgt.notes,
    answer,
    tray,
    decoys,
    // A phrase cut short never reaches the ending its hint describes, so it gets one about its own shape.
    devices: tgt.cut ? [shapeOf(answer)] : tune.units.slice(start, start + Math.min(2, tgt.units)).map(u => u.device),
    attempts: TIERS.attempts[d - 1],
    seconds: TIERS.seconds[d - 1],
    replays: TIERS.replays[d - 1],
    hintAfter: TIERS.hintAfter[d - 1],
    names: TIERS.names[d - 1],
    bpm: tune.bpm,
  }
}

// ── Feedback ───────────────────────────────────────────────────────────────

export type Mark = 'right' | 'elsewhere' | 'absent'

/**
 * Mastermind marks for a guess: 'right' where the pitch is in its slot,
 * 'elsewhere' where the pitch is in the phrase at a slot not already matched
 * (each answer note counts once), 'absent' otherwise.
 */
export function feedback(guess: readonly string[], answer: readonly string[]): Mark[] {
  const marks: Mark[] = guess.map((g, i) => (g === answer[i] ? 'right' : 'absent'))
  const left = new Map<string, number>()
  answer.forEach((a, i) => { if (marks[i] !== 'right') left.set(a, (left.get(a) ?? 0) + 1) })
  guess.forEach((g, i) => {
    if (marks[i] === 'right') return
    const n = left.get(g) ?? 0
    if (n > 0) { marks[i] = 'elsewhere'; left.set(g, n - 1) }
  })
  return marks
}
