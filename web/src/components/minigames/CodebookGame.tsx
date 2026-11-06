import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Difficulty, MinigameComponent, MinigameProps } from '@/games/types'
import { mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar } from './_shared'

// Codebook: historical ways of writing a message other than a shifted
// alphabet.  These are systems of the Codebreaker game (CipherGame picks
// one by config id); each keeps its own look, but most share one loop: the
// message appears as symbols, the player reads the current symbol off the
// key and taps the letter.
//   atbash    – the alphabet folded in half, A↔Z
//   polybius  – each letter as a row/column pair; tap the square itself
//   pigpen    – letters as the shape of their cell in a grid
//   braille   – six-dot cells; from tier 3 only a–j are shown, plus the rule
//   telegraph – Morse code read off a signal lamp
//   binary    – five lamps per letter, A = 1 … Z = 26
//   scytale   – a strip wound round a rod; pick the rod that lines it up
// Difficulty sets the mistake cap and the clock.

interface CodebookConfig {
  title: string
  intro: string
  plaintext: string
  fact: string
}

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** International Morse; the telegraph reader and Codebreaker's Morse key share it. */
export const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
  K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
}

/** Upper-case, letters and single spaces only. */
export function cleanMessage(text: string): string {
  return text.toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim()
}

// ── Encoders (exported for the tests) ─────────────────────────────────────────

export const atbash = (ch: string) => A[25 - A.indexOf(ch)]

/** Polybius square without J: J shares I's square. */
const POLY = 'ABCDEFGHIKLMNOPQRSTUVWXYZ'
export const polybius = (ch: string) => {
  const i = POLY.indexOf(ch === 'J' ? 'I' : ch)
  return `${Math.floor(i / 5) + 1}${(i % 5) + 1}`
}

/** Dots 1–3 run down the left column, 4–6 down the right. */
const BRAILLE_AJ = ['1', '12', '14', '145', '15', '124', '1245', '125', '24', '245']
export function braille(ch: string): string {
  const i = A.indexOf(ch)
  if (ch === 'W') return '2456'
  if (i < 10) return BRAILLE_AJ[i]
  if (i < 20) return BRAILLE_AJ[i - 10] + '3'
  const base = 'UVXYZ'.indexOf(ch)        // u v x y z are a–e plus dots 3 and 6
  return BRAILLE_AJ[base] + '36'
}

export const binary = (ch: string) => (A.indexOf(ch) + 1).toString(2).padStart(5, '0')

/** Pigpen: A–I and J–R (dotted) sit in a #-grid, S–V and W–Z (dotted) in an X. */
export function pigpen(ch: string): { grid: boolean; cell: number; dot: boolean } {
  const i = A.indexOf(ch)
  if (i < 18) return { grid: true, cell: i % 9, dot: i >= 9 }
  return { grid: false, cell: (i - 18) % 4, dot: i >= 22 }
}

/**
 * Scytale: written along the rod in `rows` rows, then unwound column by
 * column.  Short last rows are padded with dots.
 */
export function scytaleWind(letters: string, rows: number): string {
  const cols = Math.ceil(letters.length / rows)
  const padded = letters.padEnd(rows * cols, '·')
  let strip = ''
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) strip += padded[r * cols + c]
  return strip
}
/** Wind the strip round a rod with `rows` faces and read each face. */
export function scytaleRead(strip: string, rows: number): string[] {
  return Array.from({ length: rows }, (_, r) => [...strip].filter((_, i) => i % rows === r).join(''))
}

// ── Systems ───────────────────────────────────────────────────────────────────

interface System {
  label: string
  /** The symbol for one letter. */
  glyph: (ch: string, small?: boolean) => ReactNode
  /** The reference card, given the tier. */
  Key: (p: { difficulty: Difficulty }) => ReactNode
  /** Polybius takes its answer on the square; the rest use the keypad. */
  squareInput?: boolean
  /** Normalise a plaintext letter to what the player can enter. */
  answer?: (ch: string) => string
  /** A competent reader's seconds per letter at tiers 1–2 and at 3–4 (where the key gets harder). */
  pace: [number, number]
  configs: Record<string, CodebookConfig>
}

const Mono = ({ children, className = '' }: { children: ReactNode; className?: string }) =>
  <span className={`font-mono font-bold ${className}`}>{children}</span>

function PigpenGlyph({ ch, size = 28 }: { ch: string; size?: number }) {
  const { grid, cell, dot } = pigpen(ch)
  const s = 24, m = 3
  const lines: string[] = []
  if (grid) {
    const r = Math.floor(cell / 3), c = cell % 3
    if (r > 0) lines.push(`M${m} ${m}H${s - m}`)          // top
    if (r < 2) lines.push(`M${m} ${s - m}H${s - m}`)      // bottom
    if (c > 0) lines.push(`M${m} ${m}V${s - m}`)          // left
    if (c < 2) lines.push(`M${s - m} ${m}V${s - m}`)      // right
  } else {
    // 0 top (V), 1 left (>), 2 right (<), 3 bottom (^)
    lines.push([
      `M${m} ${m}L${s / 2} ${s - m}L${s - m} ${m}`,
      `M${m} ${m}L${s - m} ${s / 2}L${m} ${s - m}`,
      `M${s - m} ${m}L${m} ${s / 2}L${s - m} ${s - m}`,
      `M${m} ${s - m}L${s / 2} ${m}L${s - m} ${s - m}`,
    ][cell])
  }
  const dotPos = grid ? [s / 2, s / 2] : [[s / 2, s * 0.38], [s * 0.38, s / 2], [s * 0.62, s / 2], [s / 2, s * 0.62]][cell]
  return (
    <svg viewBox={`0 0 ${s} ${s}`} width={size} height={size} className="text-ink">
      <path d={lines.join(' ')} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {dot && <circle cx={dotPos[0]} cy={dotPos[1]} r="2.4" fill="currentColor" />}
    </svg>
  )
}

function BrailleCell({ ch, size = 28 }: { ch: string; size?: number }) {
  const dots = braille(ch)
  const pos = [[7, 5], [7, 12], [7, 19], [15, 5], [15, 12], [15, 19]]
  return (
    <svg viewBox="0 0 22 24" width={size * 0.9} height={size}>
      {pos.map(([x, y], i) => dots.includes(String(i + 1))
        ? <circle key={i} cx={x} cy={y} r="2.8" className="fill-ink" />
        : <circle key={i} cx={x} cy={y} r="1.2" className="fill-line" />)}
    </svg>
  )
}

function Lamps({ ch, small }: { ch: string; small?: boolean }) {
  return (
    <span className="inline-flex gap-[2px]">
      {[...binary(ch)].map((b, i) => (
        <span key={i} className={`${small ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5'} rounded-full border ${b === '1' ? 'bg-amber-500 border-amber-600 shadow-[0_0_4px_rgba(245,158,11,0.8)]' : 'bg-panel-2 border-line'}`} />
      ))}
    </span>
  )
}

const keyGrid = 'grid grid-cols-7 gap-x-2 gap-y-1 text-[10px] text-muted'

const SYSTEMS = {
  atbash: {
    pace: [3, 3],
    label: 'Atbash',
    glyph: ch => <Mono className="text-lg text-ink">{atbash(ch)}</Mono>,
    Key: () => (
      <div className="font-mono text-[11px] text-ink-2 flex flex-col items-center gap-0.5">
        <span className="tracking-[0.35em]">{A.slice(0, 13)}</span>
        <span className="text-muted text-[9px]">↕ each letter swaps with the one beneath ↕</span>
        <span className="tracking-[0.35em]">{[...A.slice(13)].reverse().join('')}</span>
      </div>
    ),
    configs: {
      'mirror-tablet': {
        title: 'The Mirror Script',
        intro: 'The alphabet is folded in half: A is written as Z, B as Y, and so on. Read each symbol and tap the true letter.',
        plaintext: 'THE FIRST WORD IS WISDOM',
        fact: 'Atbash, found in the Hebrew Book of Jeremiah around 600 BCE, swaps the first letter of the alphabet with the last, the second with the second-last. It is one of the oldest known ciphers and is its own key — encoding twice gives back the message.',
      },
      'saqqara-mirror': {
        title: 'The Mirrored Inscription',
        intro: 'The carver has cut the text as its mirror image, the way it faces on the other side of the door. The alphabet is folded in half: A is written as Z, B as Y, and so on. Read each symbol and tap the true letter.',
        plaintext: 'CHIEF OF THE PHYSICIANS',
        fact: 'Hieroglyphs face the start of their line and may run in either direction, so Egyptian carvers often set the same titles as mirror images on the two jambs of a doorway or a false door, both turned toward the figure of their owner.',
      },
      'jain-teaching': {
        title: 'The Remembered Teaching',
        intro: 'The alphabet is folded in half: A is written as Z, B as Y, and so on. Read each symbol and tap the true letter.',
        plaintext: 'LIVE AND LET LIVE',
        fact: 'Mahavira’s teachings were handed down by memory, monk to monk, for nearly a thousand years. The Shvetambara canon was finally written down at the council of Valabhi in Gujarat in the 5th century CE.',
      },
      'upadha-test': {
        title: 'The Secret Test',
        intro: 'A letter tempting a minister to treason, written in a folded alphabet: A is Z, B is Y, and so on. Read it as the minister will, and see whether he brings it to the king.',
        plaintext: 'JOIN US AND THE THRONE IS YOURS',
        fact: 'The Arthashastra tells the king to test each minister in secret with four kinds of temptation — piety, wealth, desire and fear — using agents who pretend to plot against the throne. Only a minister who reports every approach is trusted with high office.',
      },
    },
  },
  polybius: {
    pace: [2.5, 2.5],
    label: 'Polybius Square',
    glyph: ch => <Mono className="text-base text-ink tracking-wider">{polybius(ch)}</Mono>,
    Key: () => <p className="text-[10px] text-muted text-center">First number = row, second = column. I and J share a square.</p>,
    squareInput: true,
    answer: ch => (ch === 'J' ? 'I' : ch),
    configs: {
      'greek-torches': {
        title: 'The Torch Signal',
        intro: 'Each letter is sent as two numbers — a row and a column of the square. Tap the square each pair points to.',
        plaintext: 'THE ENEMY IS AT THE GATE',
        fact: 'The Greek historian Polybius (c. 150 BCE) described signalling letters over long distances with two sets of five torches: the left set gave the row of the square, the right set the column. The same grid later became the knock code of prisoners and the basis of many field ciphers.',
      },
      'nineveh-sign-list': {
        title: 'The Sign List',
        intro: 'The copyist checks every sign against the scribes’ list by its row and column. Each letter is given as two numbers — tap the square each pair points to.',
        plaintext: 'HE WHO SAW THE DEEP',
        fact: 'Mesopotamian scribes learned cuneiform from sign lists — long tables setting out each sign with its readings — and Ashurbanipal’s library held many copies. Its catalogues named each work by its first line: the Epic of Gilgamesh was “He who saw the Deep”.',
      },
      'arthashastra-spies': {
        title: "The Spy's Report",
        intro: "Chanakya's lessons travel the way his spies' reports do: each letter is a pair of numbers, a row and a column of the square. Tap the square each pair points to.",
        plaintext: 'FILL THE TREASURY FIRST',
        fact: 'The Arthashastra sets out a whole service of spies disguised as students, monks, merchants and householders, who report in secret signs and writing. A report is to be believed only when three spies who do not know one another agree.',
      },
      'bongsu-beacons': {
        title: 'The Beacon Towers',
        intro: 'Fire leaps from hilltop to hilltop as the alarm runs from the coast to Seoul. In this puzzle each letter is sent as two numbers, a row and a column of the square, the way the towers count their fires. Tap the square each pair points to.',
        plaintext: 'THE ENEMY HAS LANDED AT BUSAN',
        fact: 'Joseon Korea’s bongsu beacons relayed alarms from the coast to Mount Namsan in Seoul, by smoke in the day and fire at night; the number of fires, from one to five, told how close the enemy was. In 1592 Toyotomi Hideyoshi’s first army landed at Busan.',
      },
      'mani-last-words': {
        title: 'Word from the Prison',
        intro: "Mani lies in chains. His disciples outside pass his words on letter by letter, each as a row and a column of the square. Tap the square each pair points to.",
        plaintext: 'THE CHURCH WILL ENDURE',
        fact: "The Coptic Manichaean Homilies tell how Mani spent his last days in chains at Belapat (Gundeshapur), still teaching the disciples who came to him, until he died in prison in the 270s. His followers called his death the Crucifixion.",
      },
    },
  },
  pigpen: {
    pace: [3.5, 3.5],
    label: 'Pigpen',
    glyph: ch => <PigpenGlyph ch={ch} />,
    Key: () => (
      <div className={keyGrid}>
        {[...A].map(l => <span key={l} className="flex items-center gap-1"><PigpenGlyph ch={l} size={16} /><b className="text-ink">{l}</b></span>)}
      </div>
    ),
    configs: {
      'masonic-grid': {
        title: 'The Grid Code',
        intro: 'Each letter is drawn as the shape of its cell in a grid; a dot marks the second grid. Match each shape against the key and tap the letter.',
        plaintext: 'KEEP THE SECRET SAFE',
        fact: 'The pigpen cipher was used by Freemasons in the 1700s to keep their records private, and Union soldiers scratched it into prison walls in the American Civil War. It hides nothing from anyone who knows the grid — its strength was that few did.',
      },
      'peterhof-dawn': {
        title: 'Dawn at Peterhof',
        intro: 'A note from the Guards officers is drawn in a grid code. Each letter is the shape of its cell in a grid; a dot marks the second grid. Match each shape against the key and tap the letter.',
        plaintext: 'EVERYTHING IS READY',
        fact: 'Before dawn on 28 June 1762 Alexei Orlov woke Catherine in the Monplaisir pavilion at Peterhof: a fellow conspirator, Captain Passek, had been arrested and the plot could wait no longer. By mid-morning the Guards in St Petersburg had proclaimed her empress.',
      },
      'tadanori-quiver': {
        title: 'The Poem on the Quiver',
        intro: 'The paper tied to the fallen warrior’s quiver is smeared by battle. In this puzzle each letter is drawn as the shape of its cell in a grid; a dot marks the second grid. Match each shape against the key and tap the letter.',
        plaintext: 'A FLOWER IS MY INN',
        fact: 'The Heike Monogatari says Okabe no Tadazumi, who killed Tadanori at Ichi-no-Tani in 1184, found a poem tied to his quiver, titled “Flowers at a Traveller’s Lodging”: overtaken by night, he would shelter under a cherry tree, and the blossoms would be his host. Only then did Tadazumi learn whom he had killed.',
      },
    },
  },
  braille: {
    pace: [3.5, 5],
    label: 'Braille',
    glyph: ch => <BrailleCell ch={ch} />,
    Key: ({ difficulty }) => {
      const shown = difficulty >= 3 ? A.slice(0, 10) : A
      return (
        <div className="flex flex-col gap-1">
          <div className={keyGrid}>
            {[...shown].map(l => <span key={l} className="flex items-center gap-1"><BrailleCell ch={l} size={16} /><b className="text-ink">{l}</b></span>)}
          </div>
          {difficulty >= 3 && (
            <p className="text-[10px] text-muted leading-relaxed">
              K–T are A–J with the bottom-left dot added. U V X Y Z are A–E with both bottom dots added. W is J with the bottom-right dot.
            </p>
          )}
        </div>
      )
    },
    configs: {
      'raised-dots': {
        title: 'Reading by Touch',
        intro: 'Each letter is a cell of up to six raised dots. Find the pattern in the key and tap the letter.',
        plaintext: 'WORDS AT YOUR FINGERTIPS',
        fact: 'Louis Braille, blind from the age of three, published his six-dot code in 1829 when he was twenty. He adapted it from "night writing", a raised-dot system an army captain had designed so soldiers could read orders in the dark.',
      },
      'paris-1839': {
        title: 'Paris, 1839',
        intro: 'At the Royal Institute for Blind Youth, pupils read by touch in Louis Braille’s six-dot cells. Find each pattern in the key and tap the letter.',
        plaintext: 'CLARA PLAYS IN PARIS',
        fact: 'Louis Braille was a pupil, then a teacher, at the Royal Institute for Blind Youth in Paris; he published his six-dot code in 1829 and a fuller edition in 1837, with signs for music as well as letters — he was a fine organist himself.',
      },
      'shaw-epilogue': {
        title: 'What Happened Afterwards',
        intro: 'Shaw’s prose sequel to Pygmalion, set in raised dots. Each letter is a cell of up to six dots: find the pattern in the key and tap the letter.',
        plaintext: 'ELIZA MARRIES FREDDY',
        fact: 'For the 1916 printed edition of Pygmalion Shaw added a prose sequel, “What Happened Afterwards”, in which Eliza marries Freddy Eynsford-Hill and opens a flower shop — written to stop actors and audiences pairing her off with Higgins.',
      },
    },
  },
  telegraph: {
    pace: [4, 4],
    label: 'Telegraph',
    glyph: (ch, small) => <Mono className={`${small ? 'text-sm' : 'text-lg'} text-ink tracking-[0.15em]`}>{MORSE[ch].replace(/\./g, '·').replace(/-/g, '–')}</Mono>,
    Key: () => (
      <div className="grid grid-cols-6 gap-x-2 gap-y-0.5 text-[10px] font-mono text-muted">
        {[...A].map(l => <span key={l}><b className="text-ink">{l}</b> {MORSE[l].replace(/\./g, '·').replace(/-/g, '–')}</span>)}
      </div>
    ),
    configs: {
      'signal-lamp': {
        title: 'The Signal Lamp',
        intro: 'The lamp flashes each letter — short for a dot, long for a dash. Read the code and tap the letter.',
        plaintext: 'WHAT HATH GOD WROUGHT',
        fact: "Samuel Morse's first public telegraph message, sent from Washington to Baltimore on 24 May 1844, read 'What hath God wrought'. Skilled operators came to read Morse by ear at thirty or more words a minute.",
      },
      'endenich-telegram': {
        title: 'Telegram from Endenich, 1856',
        intro: 'A telegram arrives from the asylum near Bonn. Each letter comes as dots and dashes — read the code and tap the letter.',
        plaintext: 'COME AT ONCE',
        fact: 'By the 1850s the electric telegraph linked the cities of Germany. In July 1856 word reached Clara that Robert was failing; she was with him at Endenich two days before he died on 29 July, aged 46.',
      },
      'harbin-wire': {
        title: 'The Wire from Harbin',
        intro: 'October 1909: the news from Harbin station crosses Asia by telegraph. The lamp flashes each letter — short for a dot, long for a dash. Read the code and tap the letter.',
        plaintext: 'HERO IN KOREA CRIMINAL IN JAPAN',
        fact: 'Within hours of the shooting on 26 October 1909, telegraph wires carried the news of Itō Hirobumi’s death across Asia and Europe. Korean nationalists hailed Ahn Jung-geun as a patriot; in Japan he was condemned as an assassin.',
      },
      'dandi-dispatch': {
        title: 'The Wire from Dandi',
        intro: 'April 1930: correspondents on the beach at Dandi race to file their stories. The lamp flashes each letter — short for a dot, long for a dash. Read the code and tap the letter.',
        plaintext: 'GANDHI PICKS UP THE SALT',
        fact: 'On the morning of 6 April 1930 Gandhi picked up a lump of natural salt from the mud at Dandi, breaking the British salt law. Reporters had followed the 24-day march, and their cables carried the moment to newspapers around the world.',
      },
      'leakey-cable': {
        title: "Leakey's Reply, Gombe 1960",
        intro: 'Louis Leakey answers Jane\'s report from Nairobi by cable. Each letter comes as dots and dashes — read the code and tap the letter.',
        plaintext: 'REDEFINE TOOL REDEFINE MAN',
        fact: "When Jane Goodall reported that David Greybeard stripped twigs to fish for termites, Louis Leakey replied: 'Now we must redefine tool, redefine Man, or accept chimpanzees as humans.' Until then, making tools had been treated as the mark of humankind.",
      },
    },
  },
  binary: {
    pace: [4, 6],
    label: 'Binary',
    glyph: ch => <Lamps ch={ch} />,
    Key: ({ difficulty }) => (
      <p className="text-[10px] text-muted text-center leading-relaxed">
        The lamps are worth <b className="text-ink">16 · 8 · 4 · 2 · 1</b>. Add the lit ones: 1 = A, 2 = B … 26 = Z.
        {difficulty < 3 && ' The keypad shows each letter\'s number.'}
      </p>
    ),
    configs: {
      'five-lamps': {
        title: 'Five Lamps',
        intro: 'Each letter is a row of five lamps, each lit or dark. Add up the lit lamps to find the letter\'s number.',
        plaintext: 'ONES AND ZEROS',
        fact: "Émile Baudot's telegraph code of 1870 sent every letter as five on-or-off signals — 32 possible patterns, enough for the alphabet. Computers still store text as patterns of bits; modern codes simply use more of them.",
      },
      'gombe-archive': {
        title: 'The Gombe Archive',
        intro: 'Six decades of handwritten Gombe notes now live in a computer database, every letter stored as bits. Each row of five lamps is a letter: add up the lit ones to read it.',
        plaintext: 'EVERY INDIVIDUAL MATTERS',
        fact: 'The Gombe records, begun by Jane Goodall in 1960, have been entered into a long-term database kept at the Jane Goodall Institute Research Center at Duke University, letting scientists follow chimpanzee families across generations.',
      },
      'mac-bitmap': {
        title: 'Bitmapped, Cupertino',
        intro: 'The Macintosh drew every letter on screen from dots that were simply on or off. Each row of five lamps is a letter: add up the lit ones to read it.',
        plaintext: 'THINK DIFFERENT',
        fact: 'The 1984 Macintosh had a 512 × 342 black-and-white screen: every dot was a single bit, on or off. Because the whole screen was drawn from bits, it could show several typefaces and sizes — something earlier personal computers could not do.',
      },
      'nobel-telex': {
        title: 'News from Oslo, 1979',
        intro: 'The Nobel news comes by telex, which sends each letter as five on-or-off pulses. Each row of five lamps is a letter: add up the lit ones to read it.',
        plaintext: 'IN THE NAME OF THE POOR',
        fact: 'Mother Teresa accepted the 1979 Nobel Peace Prize in the name of the poor. She asked that the customary banquet in Oslo be cancelled and its cost given to the needy, and the prize money went to her homes for the sick and destitute.',
      },
      'ap-telex': {
        title: 'AP Saigon Bureau',
        intro: "The Associated Press teleprinter sends each letter as five on-or-off pulses. Each row of five lamps is a letter: add up the lit ones to read Arnett's dispatch.",
        plaintext: 'DISPATCH FROM SAIGON',
        fact: 'Peter Arnett reported the Vietnam War for the Associated Press from 1962 until the fall of Saigon in 1975, and won the 1966 Pulitzer Prize for International Reporting. Wire services sent copy by teleprinter, whose code carried each letter as five on-or-off signals.',
      },
    },
  },
} satisfies Record<string, System>

export type CodebookKey = keyof typeof SYSTEMS | 'scytale'

// ── The shared reading loop ──────────────────────────────────────────────────

function Keypad({ onPick, disabled, sub }: { onPick: (l: string) => void; disabled: boolean; sub?: (l: string) => string }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {[...A].map(l => (
        <button key={l} disabled={disabled} onClick={() => onPick(l)}
          className="h-10 rounded-lg bg-panel border border-line text-ink font-bold text-sm hover:border-accent/50 hover:bg-panel-2 active:scale-95 transition-all disabled:opacity-50 flex flex-col items-center justify-center leading-none">
          {l}
          {sub && <span className="text-[8px] text-muted font-normal mt-0.5">{sub(l)}</span>}
        </button>
      ))}
    </div>
  )
}

function PolybiusSquare({ onPick, disabled }: { onPick: (l: string) => void; disabled: boolean }) {
  return (
    <div className="grid grid-cols-[auto_repeat(5,1fr)] gap-1 max-w-xs mx-auto w-full">
      <span />
      {[1, 2, 3, 4, 5].map(c => <span key={c} className="text-center text-[10px] font-bold text-accent">{c}</span>)}
      {[0, 1, 2, 3, 4].map(r => [
        <span key={`r${r}`} className="flex items-center text-[10px] font-bold text-accent pr-1">{r + 1}</span>,
        ...[...POLY.slice(r * 5, r * 5 + 5)].map(l => (
          <button key={l} disabled={disabled} onClick={() => onPick(l)}
            className="h-9 rounded-lg bg-panel border border-line text-ink font-bold text-sm hover:border-accent/50 hover:bg-panel-2 active:scale-95 transition-all disabled:opacity-50">
            {l === 'I' ? 'I/J' : l}
          </button>
        )),
      ])}
    </div>
  )
}

/** Story params may override the message; one with no letters falls back to the base. */
export function resolveCodebookConfig(configs: Record<string, CodebookConfig>, configId: string | undefined, params?: Record<string, unknown>): CodebookConfig {
  const fallback = Object.keys(configs)[0]
  const cfg = resolveConfig(configs, configId, params, fallback)
  const msg = typeof cfg.plaintext === 'string' ? cleanMessage(cfg.plaintext) : ''
  return { ...cfg, plaintext: /[A-Z]/.test(msg) ? msg : cleanMessage(((configId && configs[configId]) || configs[fallback]).plaintext) }
}

/**
 * The clock for a reader: 30 s to take in the key, then the system's
 * per-letter pace times a slack that shrinks with the tier (D1 untimed).
 */
export const CODEBOOK_SLACK = [0, 3, 2, 1.6] as const
export function codebookSeconds(pace: [number, number], difficulty: Difficulty, letters: number): number {
  const slack = scale(difficulty, CODEBOOK_SLACK)
  return slack ? Math.round(30 + letters * pace[difficulty >= 3 ? 1 : 0] * slack) : 0
}

function makeReader(sys: System): MinigameComponent {
  return function CodebookGame({ configId, difficulty, params, onWin, onLose }: MinigameProps) {
    const cfg = resolveCodebookConfig(sys.configs, configId, params)
    const plain = cfg.plaintext
    const letters = useMemo(() => [...plain].map((c, i) => ({ c, i })).filter(x => x.c !== ' '), [plain])
    const maxMistakes = scale(difficulty, [8, 6, 5, 4])
    const timeLimit = codebookSeconds(sys.pace, difficulty, letters.length)
    const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })
    const timer = useGameTimer({ seconds: timeLimit, running: !settled, onExpire: () => lose('out of time') })
    const [pos, setPos] = useState(0)
    const [mistakes, setMistakes] = useState(0)
    const [flash, setFlash] = useState(false)
    const current = letters[pos]
    const norm = sys.answer ?? ((c: string) => c)

    const pick = (l: string) => {
      if (settled || !current) return
      if (l === norm(current.c)) {
        const next = pos + 1
        setPos(next)
        if (next >= letters.length) win()
        return
      }
      const n = mistakes + 1
      setMistakes(n)
      setFlash(true); setTimeout(() => setFlash(false), 350)
      if (n >= maxMistakes) lose('too many misreadings')
    }

    // Lay the message out word by word so lines break between words.
    const words: { c: string; i: number }[][] = [[]]
    for (const [i, c] of [...plain].entries()) {
      if (c === ' ') words.push([])
      else words[words.length - 1].push({ c, i })
    }
    const solvedUpTo = current ? current.i : Infinity

    return (
      <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
            <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
          </div>
          <p className={`shrink-0 text-[10px] ${mistakes ? 'text-red-600 font-bold' : 'text-muted'}`}>✗ {mistakes} / {maxMistakes}</p>
        </div>
        {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}

        {sys === SYSTEMS.telegraph && current && <SignalLamp code={MORSE[current.c]} key={pos} />}

        <div className={`flex flex-wrap gap-x-4 gap-y-2 bg-panel border rounded-xl p-3 transition-colors ${flash ? 'border-red-500 bg-red-500/5' : 'border-line'}`}>
          {words.map((w, wi) => (
            <div key={wi} className="flex gap-1.5">
              {w.map(({ c, i }) => {
                const done = i < solvedUpTo
                const now = i === solvedUpTo
                return (
                  <div key={i} className={`flex flex-col items-center gap-1 px-1 py-1 rounded-lg min-w-[1.75rem] ${now ? 'bg-accent/10 ring-2 ring-accent/60' : ''}`}>
                    <div className={`flex items-center justify-center min-h-[28px] ${done ? 'opacity-40' : ''}`}>{sys.glyph(c, sys === SYSTEMS.telegraph)}</div>
                    <span className={`font-mono font-bold text-sm h-5 ${done ? 'text-emerald-700' : 'text-transparent'}`}>{done ? c : '_'}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div className="bg-panel/60 border border-line rounded-xl p-2.5"><sys.Key difficulty={difficulty} /></div>

        {sys.squareInput
          ? <PolybiusSquare onPick={pick} disabled={settled} />
          : <Keypad onPick={pick} disabled={settled} sub={sys === SYSTEMS.binary && difficulty < 3 ? l => String(A.indexOf(l) + 1) : undefined} />}

        <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Message read!" loseTitle="The message stays hidden" />
      </div>
    )
  }
}

/** Flashes one letter's Morse code on a loop. */
function SignalLamp({ code }: { code: string }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    // dot 1 unit, dash 3, gap 1 between symbols, 5 after the letter
    const steps: [boolean, number][] = []
    for (const s of code) steps.push([true, s === '.' ? 1 : 3], [false, 1])
    steps[steps.length - 1] = [false, 5]
    let i = 0, t: ReturnType<typeof setTimeout>
    const tick = () => { const [v, d] = steps[i]; setOn(v); i = (i + 1) % steps.length; t = setTimeout(tick, d * 160) }
    tick()
    return () => clearTimeout(t)
  }, [code])
  return (
    <div className="flex items-center justify-center gap-3">
      <span className={`w-8 h-8 rounded-full border-2 transition-colors duration-75 ${on ? 'bg-amber-300 border-amber-500 shadow-[0_0_16px_rgba(251,191,36,0.9)]' : 'bg-ink/80 border-ink'}`} />
      <span className="text-[10px] text-muted">the lamp repeats the current letter</span>
    </div>
  )
}

// ── Scytale ───────────────────────────────────────────────────────────────────

const SCYTALE_CONFIGS: Record<string, CodebookConfig> = {
  'spartan-rod': {
    title: 'The Spartan Rod',
    intro: 'A leather strip of jumbled letters was wound round a rod to write it. Choose the rod that makes the letters line up, then read it.',
    plaintext: 'COME BACK WITH YOUR SHIELD',
    fact: 'Plutarch describes the Spartan scytale: a strip of leather wound round a staff and written on lengthwise. Unwound, it was a jumble; only a staff of the same thickness, held by the commander in the field, lined the letters up again.',
  },
  'ephors-recall': {
    title: "The Ephors' Rod",
    intro: 'A strip of leather from Sparta, jumbled until it is wound round a rod of the right thickness. Choose the rod that lines it up, then read what the ephors have decided.',
    plaintext: 'THE KING COMES HOME',
    fact: 'Plutarch says the ephors kept one rod at Sparta and gave its twin to a king or general abroad; when they wanted him home, they sent a scytale. It was the ephors who could call even a king back to answer to the city.',
  },
  'printed-plutarch': {
    title: 'A Secret from a Printed Plutarch',
    intro: 'Printing brought the ancients back to every reader — even their secrets. This strip, copied from Plutarch’s account of the Spartan rod, is jumbled until it is wound on a rod of the right thickness. Choose the rod, then read it.',
    plaintext: 'THE PRESS CANNOT BE UNMADE',
    fact: 'Plutarch’s Lives, which describes the Spartan scytale, was first printed in Latin at Rome around 1470, and the first printed book on cryptography, Trithemius’s Polygraphia, followed in 1518. Within two generations of Gutenberg, the learning of the ancients — and new learning — was sold by the hundred copies.',
  },
  'shunzei-scroll': {
    title: 'The Scroll Left at the Gate',
    intro: 'Tadanori’s scroll of poems has been rolled so tightly that its lines have slipped. In this puzzle the letters only line up when the paper is wound on a roller of the right thickness: choose the roller, then read the verdict.',
    plaintext: 'ONE POEM BY A NAMELESS POET',
    fact: 'When Fujiwara no Shunzei finished the imperial anthology Senzai Wakashū in 1188, he included one poem from Tadanori’s scroll — the wild cherries still blooming over the ruined old capital at Shiga — but marked it “author unknown”, because the Taira were now enemies of the court.',
  },
  'azteca-banner': {
    title: 'The Banner in the Azteca',
    intro: 'An Argentine fan’s banner has been furled round its pole so tightly that the letters have slipped. In this puzzle they only line up when it is wound on a pole of the right thickness: choose the pole, then read what the stands are about to sing.',
    plaintext: 'ARGENTINA CAMPEON DEL MUNDO',
    fact: 'In the final at the Estadio Azteca on 29 June 1986, Argentina led West Germany 2–0 before the Germans drew level. Six minutes from time Maradona slipped a pass through to Jorge Burruchaga, who ran on to score the winner, and Diego lifted the trophy as captain.',
  },
}

function ScytaleGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveCodebookConfig(SCYTALE_CONFIGS, configId, params)
  const letters = cfg.plaintext.replace(/ /g, '')
  // The rod comes from the seed, so a retry gets a different winding.
  const rows = useMemo(() => {
    const options = [3, 4, 5, 6].filter(r => letters.length / r >= 3)
    return options[Math.floor(mulberry32(seed)() * options.length)] ?? 3
  }, [seed, letters.length])
  const strip = useMemo(() => scytaleWind(letters, rows), [letters, rows])
  const maxAttempts = scale(difficulty, [4, 3, 2, 2])
  const timeLimit = scale(difficulty, [0, 0, 120, 90])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })
  const timer = useGameTimer({ seconds: timeLimit, running: !settled, onExpire: () => lose('out of time') })
  const [guess, setGuess] = useState(2)
  const [attempts, setAttempts] = useState(0)
  const faces = scytaleRead(strip, guess)
  // From tier 3 the rod no longer winds live: the reading appears only for
  // the rod last checked, and each wrong check counts.
  const blind = difficulty >= 3
  const [checked, setChecked] = useState<number | null>(null)
  const showFaces = !blind || checked === guess

  const read = () => {
    if (settled || (blind && checked === guess)) return
    setChecked(guess)
    if (guess === rows) { win(); return }
    const n = attempts + 1
    setAttempts(n)
    if (n >= maxAttempts) lose('the strip never lined up')
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <p className={`shrink-0 text-[10px] ${attempts ? 'text-red-600 font-bold' : 'text-muted'}`}>✗ {attempts} / {maxAttempts}</p>
      </div>
      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}

      <div>
        <p className="text-[10px] text-muted uppercase tracking-widest mb-1">the strip, unwound</p>
        <p className="font-mono text-xs tracking-[0.15em] text-ink bg-amber-100/60 border border-amber-700/30 rounded-lg px-2 py-1.5 break-all">{strip}</p>
      </div>

      <div className="flex items-center gap-3">
        <button disabled={settled || guess <= 2} onClick={() => setGuess(g => g - 1)}
          className="w-10 h-10 rounded-xl bg-panel border border-line text-ink font-bold hover:border-accent/40 disabled:opacity-40">−</button>
        <div className="flex-1 text-center">
          <p className="text-[10px] text-muted uppercase tracking-widest">rod with</p>
          <p className="text-2xl font-bold text-accent">{guess} faces</p>
        </div>
        <button disabled={settled || guess >= 8} onClick={() => setGuess(g => g + 1)}
          className="w-10 h-10 rounded-xl bg-panel border border-line text-ink font-bold hover:border-accent/40 disabled:opacity-40">+</button>
      </div>

      <div className="rounded-xl overflow-hidden border border-amber-900/40 bg-gradient-to-b from-amber-800 via-amber-700 to-amber-800 p-2 flex flex-col gap-1">
        {!showFaces && (
          <p data-testid="scytale-hidden" className="text-xs text-amber-50 text-center px-2 py-1 leading-relaxed">
            On a rod with N faces, neighbouring letters of the message sit N places apart along the strip. Find the N that spells words, then check that rod.
          </p>
        )}
        {showFaces && faces.map((f, i) => (
          <p key={i} className="font-mono text-sm tracking-[0.3em] text-ink bg-amber-50/90 rounded px-2 py-0.5 break-all"
            style={{ transform: `skewX(-8deg)` }}>{f}</p>
        ))}
      </div>

      <button disabled={settled || (blind && checked === guess)} onClick={read}
        className="py-2.5 rounded-xl bg-accent text-accent-fg font-bold text-sm hover:bg-accent-hover transition-all disabled:opacity-50">
        {blind ? 'Check this rod' : 'Read the message'}
      </button>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Message read!" loseTitle="The message stays hidden" />
    </div>
  )
}

// ── Systems, for the Codebreaker dispatcher ───────────────────────────────────

export interface Codebook {
  Game: MinigameComponent
  CONFIGS: Record<string, CodebookConfig>
  /** Letter-by-letter readers only; scytale is one dial. */
  pace?: [number, number]
}
const reader = (sys: System): Codebook => ({ Game: makeReader(sys), CONFIGS: sys.configs, pace: sys.pace })

export const CODEBOOKS: Record<CodebookKey, Codebook> = {
  atbash: reader(SYSTEMS.atbash),
  polybius: reader(SYSTEMS.polybius),
  pigpen: reader(SYSTEMS.pigpen),
  braille: reader(SYSTEMS.braille),
  telegraph: reader(SYSTEMS.telegraph),
  binary: reader(SYSTEMS.binary),
  scytale: { Game: ScytaleGame, CONFIGS: SCYTALE_CONFIGS },
}
