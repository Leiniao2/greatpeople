import { useEffect, useMemo, useRef, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, shuffle, useGameOutcome, useGameTimer, OutcomeBanner, TimerBar } from './_shared'

// Archive Pairs: a memory game in the reading room of a great library.  Every
// pair is a great person and the work, invention or place they are known
// for; the tiles are catalogue slips face down on the desk.  Turn two at a
// time: a person and their work stay up, anything else is a mistake.
//
// Difficulty: a bigger desk (3×4 → 6×6), a tighter mistake budget, a clock
// from D2 and fewer peeks.  A player with a perfect memory never makes more
// mistakes than pairs − 1, and every budget is at least that, so every deck
// is winnable; matching streaks of three earn a mistake back.

export interface PairsConfig {
  title: string
  intro: string
  fact: string
  /** [great person, their work] — person ↔ work tiles. */
  pairs: [string, string][]
}

export const CONFIGS: Record<string, PairsConfig> = {
  ancient: {
    title: 'Library of Alexandria',
    intro: 'The scrolls of the ancient world have been mixed up. Match each author or ruler to their great work.',
    fact: 'The Library of Alexandria was founded under Ptolemy I and II around 285 BCE and, by legend, copied every book carried by ships into the harbour.',
    pairs: [
      ['Hammurabi', 'Law code'], ['Imhotep', 'Step pyramid'], ['Homer', 'The Iliad'], ['Confucius', 'The Analects'],
      ['Sun Tzu', 'The Art of War'], ['Herodotus', 'The Histories'], ['Euclid', 'Elements'], ['Archimedes', 'Screw pump'],
      ['Sappho', 'Lyric odes'], ['Cyrus the Great', 'Cyrus Cylinder'], ['Ashoka', 'Rock edicts'], ['Qin Shi Huang', 'Terracotta army'],
      ['Ptolemy', 'Almagest'], ['Hippocrates', 'Medical oath'], ['Cai Lun', 'Paper'], ['Virgil', 'The Aeneid'],
      ['Julius Caesar', 'Julian calendar'], ['Eratosthenes', "Earth's girth"], ['Enheduanna', 'Temple hymns'], ['Nebuchadnezzar II', 'Ishtar Gate'],
    ],
  },
  renaissance: {
    title: 'The Medici Archive',
    intro: 'Florence’s archivist needs every master paired with the masterpiece that made their name.',
    fact: 'Cosimo de’ Medici opened the library of San Marco in Florence in 1444 — one of the first public libraries of Renaissance Europe.',
    pairs: [
      ['Gutenberg', 'Printing press'], ['Leonardo', 'Mona Lisa'], ['Michelangelo', 'Sistine ceiling'], ['Copernicus', 'Sun-centred cosmos'],
      ['Galileo', "Jupiter's moons"], ['Machiavelli', 'The Prince'], ['Shakespeare', 'Hamlet'], ['Brunelleschi', 'Florence dome'],
      ['Dürer', 'Rhinoceros print'], ['Vesalius', 'Fabrica anatomy'], ['Columbus', '1492 voyage'], ['Magellan', 'Round-world voyage'],
      ['Erasmus', 'Praise of Folly'], ['Thomas More', 'Utopia'], ['Botticelli', 'Birth of Venus'], ['Raphael', 'School of Athens'],
      ['Martin Luther', '95 Theses'], ['Cervantes', 'Don Quixote'], ['Kepler', 'Planetary laws'], ['Mercator', 'Map projection'],
    ],
  },
  modern: {
    title: 'The British Library',
    intro: 'The modern collection is out of order. Match each thinker, artist or leader with the work they left us.',
    fact: 'The British Library holds around 170 million items, including Magna Carta and Beatles lyrics in their authors’ hands.',
    pairs: [
      ['Newton', 'Principia'], ['Darwin', 'Origin of Species'], ['Marie Curie', 'Radium'], ['Einstein', 'Relativity'],
      ['Freud', 'Dream analysis'], ['Tolstoy', 'War and Peace'], ['Beethoven', 'Ninth Symphony'], ['Van Gogh', 'Starry Night'],
      ['Picasso', 'Guernica'], ['Gandhi', 'Salt March'], ['Mandela', 'Long Walk to Freedom'], ['Martin Luther King', 'I Have a Dream'],
      ['Nightingale', 'Nursing school'], ['Mendeleev', 'Periodic table'], ['Pasteur', 'Pasteurisation'], ['Frida Kahlo', 'Self-portraits'],
      ['Jane Austen', 'Pride and Prejudice'], ['Rosalind Franklin', 'Photo 51'], ['Alan Turing', 'Turing machine'], ['Neil Armstrong', 'Moon walk'],
    ],
  },
  inventors: {
    title: 'The Patent Office',
    intro: 'The patent clerks have dropped the files. Match every inventor to the invention on their papers.',
    fact: 'The world’s first patent law, the Venetian Statute of 1474, gave inventors ten years’ protection for “new and ingenious devices”.',
    pairs: [
      ['James Watt', 'Steam engine'], ['Edison', 'Phonograph'], ['Bell', 'Telephone'], ['Tesla', 'AC motor'],
      ['Wright brothers', 'Powered flight'], ['Marconi', 'Radio'], ['Samuel Morse', 'Morse code'], ['Daguerre', 'Daguerreotype'],
      ['Karl Benz', 'Motor car'], ['Alfred Nobel', 'Dynamite'], ['Edward Jenner', 'Smallpox vaccine'], ['Fleming', 'Penicillin'],
      ['Lumière brothers', 'Cinematograph'], ['John Logie Baird', 'Television'], ['Babbage', 'Difference engine'], ['Ada Lovelace', 'First program'],
      ['Volta', 'Battery'], ['Ben Franklin', 'Lightning rod'], ['Hedy Lamarr', 'Frequency hopping'], ['Berners-Lee', 'World Wide Web'],
      ['Zhang Heng', 'Seismoscope'], ['Faraday', 'Dynamo'],
    ],
  },
}

export interface Tile { pair: number; kind: 'person' | 'work'; text: string }

/** [rows, cols] of the desk. */
export const layoutFor = (d: Difficulty): [number, number] => scale(d, [[3, 4], [4, 4], [5, 4], [6, 6]] as const) as [number, number]
export const pairsFor = (d: Difficulty) => { const [r, c] = layoutFor(d); return (r * c) / 2 }
/** Mistakes allowed; never fewer than pairs − 1, the most a perfect memory needs. */
export const mistakeBudget = (d: Difficulty) => pairsFor(d) - 1 + scale(d, [6, 3, 1, 0])
export const timerFor = (d: Difficulty) => scale(d, [0, 100, 140, 210])
export const peeksFor = (d: Difficulty) => scale(d, [2, 1, 0, 0])
export const PEEK_MS = 1400
export const MISS_MS = 900
/** A run of this many matches without a mistake earns one mistake back. */
export const COMBO_REFUND = 3

/** Pick the deck's pairs from the config's pool and lay out the tiles. */
export function makeDeck(configId: string, config: PairsConfig, d: Difficulty, seed: number): Tile[] {
  const rng = mulberry32(seed ^ hashString(`pairs:${configId}:${d}`))
  const n = Math.min(pairsFor(d), config.pairs.length)
  const chosen = shuffle(config.pairs.map((_, i) => i), rng).slice(0, n)
  const tiles: Tile[] = []
  chosen.forEach((p, k) => {
    tiles.push({ pair: k, kind: 'person', text: config.pairs[p][0] })
    tiles.push({ pair: k, kind: 'work', text: config.pairs[p][1] })
  })
  return shuffle(tiles, rng)
}

/**
 * Plays the deck with a perfect memory, flipping unknown tiles in reading
 * order, and returns how many mistakes it made.  Never more than pairs − 1.
 */
export function perfectMemoryMistakes(deck: Tile[]): { mistakes: number; turns: [number, number][] } {
  const known = new Map<number, number>() // pair → index of a seen, unmatched tile
  const done = new Set<number>()
  const turns: [number, number][] = []
  let mistakes = 0
  const nextUnknown = (seen: Set<number>) => deck.findIndex((_, i) => !done.has(i) && !seen.has(i))
  const seen = new Set<number>()
  while (done.size < deck.length) {
    // A pair whose both halves are known: take it.
    const both = [...known.entries()].find(([p, i]) => deck.some((t, j) => j !== i && t.pair === p && seen.has(j) && !done.has(j)))
    if (both) {
      const [p, i] = both
      const j = deck.findIndex((t, k) => k !== i && t.pair === p)
      turns.push([i, j]); done.add(i); done.add(j); known.delete(p)
      continue
    }
    const a = nextUnknown(seen)
    seen.add(a)
    const partner = known.get(deck[a].pair)
    if (partner !== undefined) { turns.push([partner, a]); done.add(a); done.add(partner); known.delete(deck[a].pair); continue }
    const b = nextUnknown(seen)
    seen.add(b)
    turns.push([a, b])
    if (deck[a].pair === deck[b].pair) { done.add(a); done.add(b); continue }
    mistakes++
    known.set(deck[a].pair, a)
    if (!known.has(deck[b].pair)) known.set(deck[b].pair, b)
  }
  return { mistakes, turns }
}

export default function PairsGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'ancient')
  const deck = useMemo(() => makeDeck(configId, config, difficulty, seed), [configId, config, difficulty, seed])
  const [rows, cols] = layoutFor(difficulty)
  const budget = mistakeBudget(difficulty)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const [flipped, setFlipped] = useState<number[]>([])
  const [matched, setMatched] = useState<Set<number>>(() => new Set())
  const [mistakes, setMistakes] = useState(0)
  const [streak, setStreak] = useState(0)
  const [peeks, setPeeks] = useState(peeksFor(difficulty))
  const [peeking, setPeeking] = useState(false)
  const [lock, setLock] = useState(false)
  const [note, setNote] = useState(config.intro)
  const [bonus, setBonus] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)) }

  const timer = useGameTimer({ seconds: timerFor(difficulty), running: !settled, onExpire: () => lose('the archive closed for the night') })
  const left = budget - mistakes

  const tap = (i: number) => {
    if (settled || lock || peeking || matched.has(i) || flipped.includes(i)) return
    if (flipped.length === 0) { setFlipped([i]); return }
    const a = flipped[0]
    const pair = [a, i]
    if (deck[a].pair === deck[i].pair) {
      const m = new Set(matched); m.add(a); m.add(i)
      setMatched(m)
      setFlipped([])
      const s = streak + 1
      setStreak(s)
      const person = deck[a].kind === 'person' ? deck[a] : deck[i]
      const work = deck[a].kind === 'person' ? deck[i] : deck[a]
      let text = `${person.text} — ${work.text}. Filed!`
      if (s % COMBO_REFUND === 0 && mistakes > 0) {
        setMistakes(mistakes - 1)
        setBonus(b => b + 1)
        text = `Combo ×${s}! ${person.text} — ${work.text}. One mistake forgiven.`
      } else if (s >= 2) text = `Combo ×${s}! ${person.text} — ${work.text}.`
      setNote(text)
      if (m.size === deck.length) win()
      return
    }
    setFlipped(pair)
    setStreak(0)
    const n = mistakes + 1
    setMistakes(n)
    if (n > budget) { setNote('Too many misfiled slips.'); lose('too many mistakes'); return }
    setNote(deck[a].kind === deck[i].kind
      ? `Two ${deck[a].kind === 'person' ? 'people' : 'works'} — a pair is a person and their work.`
      : `${deck[a].kind === 'person' ? deck[a].text : deck[i].text} did not make that.`)
    setLock(true)
    later(() => { setFlipped([]); setLock(false) }, MISS_MS)
  }

  const peek = () => {
    if (settled || peeks <= 0 || peeking || lock || flipped.length) return
    setPeeks(peeks - 1)
    setPeeking(true)
    setNote('The archivist lifts the lamp…')
    later(() => setPeeking(false), PEEK_MS)
  }

  const textSize = cols >= 6 ? 'text-[9px]' : 'text-[11px]'

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      <div className="rounded-xl border border-line bg-panel px-3 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent truncate">{config.title}</p>
          <p className="text-ink text-sm font-semibold leading-tight">
            {matched.size / 2} / {deck.length / 2} pairs filed
            {streak >= 2 && <span className="ml-2 text-accent">combo ×{streak}</span>}
          </p>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <p className={`text-xs font-bold tabular-nums ${left <= 1 ? 'text-red-600' : 'text-ink-2'}`} data-testid="mistakes-left">
            {Math.max(0, left)} mistakes left
          </p>
          {bonus > 0 && <p className="text-[10px] text-emerald-700">+{bonus} forgiven</p>}
        </div>
      </div>
      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}

      <div
        className="grid gap-1.5 w-full max-w-[420px] mx-auto"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
        data-testid="pairs-board"
      >
        {deck.map((t, i) => {
          const up = peeking || matched.has(i) || flipped.includes(i)
          const done = matched.has(i)
          const wrong = flipped.length === 2 && flipped.includes(i) && !done
          return (
            <button
              key={i}
              data-tile={i}
              data-pair={t.pair}
              data-kind={t.kind}
              aria-label={up ? `${t.kind}: ${t.text}` : 'face-down slip'}
              onClick={() => tap(i)}
              className="relative aspect-[3/4] [perspective:600px]"
            >
              <span
                className="absolute inset-0 transition-transform duration-300 [transform-style:preserve-3d]"
                style={{ transform: up ? 'rotateY(180deg)' : 'none' }}
              >
                {/* Back: a sealed catalogue slip. */}
                <span className="absolute inset-0 rounded-lg border-2 border-line bg-panel flex items-center justify-center [backface-visibility:hidden] shadow-sm">
                  <span className="w-[46%] aspect-square rounded-full bg-accent/80 text-accent-fg flex items-center justify-center text-sm font-bold shadow-inner">❦</span>
                </span>
                {/* Face. */}
                <span
                  className={`absolute inset-0 rounded-lg border-2 flex flex-col items-center justify-center gap-0.5 p-1 text-center [backface-visibility:hidden] [transform:rotateY(180deg)]
                    ${t.kind === 'person' ? 'bg-paper border-accent' : 'bg-paper-2 border-line'}
                    ${done ? 'opacity-70 ring-2 ring-emerald-500/60' : ''} ${wrong ? 'ring-2 ring-red-500/70' : ''}`}
                >
                  <span className="text-[8px] uppercase tracking-wider text-muted">{t.kind === 'person' ? '✒ person' : '❧ work'}</span>
                  <span className={`${textSize} leading-tight font-semibold text-ink break-words hyphens-auto`}>{t.text}</span>
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-2 min-h-[2.5rem]">
        <p className="text-xs leading-snug text-ink-2" role="status">{note}</p>
        {peeksFor(difficulty) > 0 && (
          <button
            onClick={peek}
            disabled={settled || peeks <= 0 || peeking}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-accent text-accent-fg disabled:opacity-40"
          >
            Peek ({peeks})
          </button>
        )}
      </div>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The archive is in order!" loseTitle="The archive stays in chaos" />
    </div>
  )
}

export const CONFIG_IDS = Object.keys(CONFIGS)
