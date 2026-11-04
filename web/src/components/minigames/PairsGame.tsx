import { useEffect, useMemo, useRef, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, shuffle, useGameOutcome, useGameTimer, OutcomeBanner, TimerBar } from './_shared'

// Archive Pairs: a memory game in the reading room of a great library.  Every
// pair is a great person and the work, invention or place they are known
// for; the tiles are catalogue slips face down on the desk.  Turn two at a
// time: a person and their work stay up, anything else is a mistake.
//
// Every config is a rule twist (PairsVariant):
//   swap     (Alexandria)  two mismatched slips trade places as they go down
//   flash    (Medici)      the desk is shown face up at the start; no peeks,
//                          a much tighter mistake budget
//   ordered  (British Lib) pairs must be filed in the readers' request order
//   fragile  (Patents)     a slip may be turned up only three times — a fourth turn
//                          tears it and loses
//
// Time budget: 6 to 12 pairs (3×4 → 6×4; the ordered twist stays on 3×4), untimed at D1 then a 90–150 s
// clock, so a desk takes about one to two and a half minutes.  A player with
// a perfect memory stays inside every budget (perfectMemory proves it for
// each variant), so every deck is winnable; matching streaks of three earn a
// mistake back.

export type PairsVariant = 'swap' | 'flash' | 'ordered' | 'fragile'

export interface PairsConfig {
  title: string
  intro: string
  fact: string
  /** [great person, their work] — person ↔ work tiles. */
  pairs: [string, string][]
  variant: PairsVariant
  /** One line explaining the twist. */
  twist: string
}

export const CONFIGS: Record<string, PairsConfig> = {
  'nineveh-catalogue': {
    title: 'The Shelves of Nineveh',
    intro: 'The tablets have come in from every city of the empire. Shelve each work with the subject it belongs to.',
    variant: 'swap',
    twist: 'Shifting tablets: whenever you turn up two that do not match, they trade places as they go face down. Remember where each one went.',
    fact: 'Ashurbanipal’s scholars knew each text by its opening words, and long works ran in numbered series of tablets: the sky-omen series Enuma Anu Enlil alone filled some seventy. Catalogue tablets list the works held at Nineveh.',
    pairs: [
      ['Epic of Gilgamesh', 'A king seeks life everlasting'], ['Enuma Elish', 'Marduk orders the world'], ['Atrahasis', 'The gods send the flood'],
      ['Enuma Anu Enlil', 'Omens in the sky'], ['Shumma alu', 'Omens of daily life'], ['Shumma izbu', 'Omens from strange births'],
      ['Sakikku', 'Diagnosing the sick'], ['Maqlu', 'Burning the witch'], ['Ludlul bel nemeqi', 'The righteous sufferer'],
      ['Erra and Ishum', 'The plague god rampages'], ['Descent of Ishtar', 'A goddess in the underworld'], ['Anzu', 'The stolen Tablet of Destinies'],
      ['Etana', 'A king flies on an eagle'], ['MUL.APIN', 'Catalogue of the stars'],
    ],
  },
  ancient: {
    title: 'Library of Alexandria',
    intro: 'The scrolls of the ancient world have been mixed up. Match each author or ruler to their great work.',
    variant: 'swap',
    twist: 'Shifting scrolls: whenever you turn up two slips that do not match, they trade places as they go face down. Remember where each one went.',
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
    variant: 'flash',
    twist: 'One look: the whole desk is shown face up for a few seconds before play. There are no peeks and far fewer mistakes allowed — study hard.',
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
    variant: 'ordered',
    twist: 'Reader requests: slips must be filed in the order readers ask for them. A right pair turned up out of turn goes back face down (no mistake, but it costs time).',
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
    variant: 'fragile',
    twist: 'Fragile papers: every slip survives being turned up only three times. Turn one up a fourth time and it tears — and the patent office is lost.',
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

/**
 * [rows, cols] of the desk.  Filing in request order makes nearly every
 * exploring turn a mistake, so that twist keeps the 3×4 desk at every tier
 * and gets harder through peeks and the mistake budget instead.
 */
export const layoutFor = (d: Difficulty, variant: PairsVariant = 'swap'): [number, number] =>
  variant === 'ordered' ? [3, 4] : scale(d, [[3, 4], [4, 4], [5, 4], [6, 4]] as const) as [number, number]
export const pairsFor = (d: Difficulty, variant: PairsVariant = 'swap') => { const [r, c] = layoutFor(d, variant); return (r * c) / 2 }
/** The most mistakes a perfect memory can need: pairs − 1 (pairs when filing in order, 0 after a full look). */
export function perfectBound(d: Difficulty, variant: PairsVariant = 'swap'): number {
  return variant === 'flash' ? 0 : variant === 'ordered' ? pairsFor(d, variant) : pairsFor(d) - 1
}
/** Mistakes allowed; never fewer than perfectBound. */
export function mistakeBudget(d: Difficulty, variant: PairsVariant = 'swap'): number {
  if (variant === 'flash') return Math.ceil(pairsFor(d) / 2) + scale(d, [2, 1, 1, 0])
  // Ordered: a casual memory peaks at ~4–10 mistakes on the 3×4 desk.
  if (variant === 'ordered') return perfectBound(d, variant) + scale(d, [8, 4, 2, 1])
  return perfectBound(d, variant) + scale(d, [4, 1, 0, 0])
}
/** Seconds on the clock (0 = untimed); filing in order takes extra turns. */
export const timerFor = (d: Difficulty, variant: PairsVariant = 'swap') => scale(d, [0, 90, 120, 150]) + (variant === 'ordered' && d > 1 ? 30 : 0)
export const peeksFor = (d: Difficulty, variant: PairsVariant = 'swap') =>
  variant === 'flash' ? 0 : scale(d, variant === 'ordered' ? [2, 1, 1, 0] : [2, 1, 0, 0])
/** Flash variant: how long the desk is shown face up. */
export const flashMsFor = (d: Difficulty) => scale(d, [4000, 5000, 6000, 7000])
/** Fragile variant: turns up a slip survives (a slip is turned once to learn it and once to file it, plus one slip of memory). */
export const FRAGILE_FLIPS = 3
export const PEEK_MS = 1400
export const MISS_MS = 900
/** A run of this many matches without a mistake earns one mistake back. */
export const COMBO_REFUND = 3

/** Pick the deck's pairs from the config's pool and lay out the tiles.  Pair ids 0, 1, … are the request order. */
export function makeDeck(configId: string, config: PairsConfig, d: Difficulty, seed: number): Tile[] {
  const rng = mulberry32(seed ^ hashString(`pairs:${configId}:${d}`))
  const n = Math.min(pairsFor(d, config.variant), config.pairs.length)
  const chosen = shuffle(config.pairs.map((_, i) => i), rng).slice(0, n)
  const tiles: Tile[] = []
  chosen.forEach((p, k) => {
    tiles.push({ pair: k, kind: 'person', text: config.pairs[p][0] })
    tiles.push({ pair: k, kind: 'work', text: config.pairs[p][1] })
  })
  return shuffle(tiles, rng)
}

/**
 * Plays the deck with a perfect memory under the variant's rules and reports
 * its mistakes, its turns (tile indices — identities, which survive swaps)
 * and the most times it turned up any one tile.
 *
 * Policy: take a fully known pair (the requested one, when ordered); else turn
 * a new tile, then its known partner if there is one, else another new tile.
 * Every mistake turns up two new tiles, so mistakes ≤ pairs (≤ pairs − 1 when
 * any pair may be filed), and a tile is turned only to learn it and to file it.
 */
export function perfectMemory(deck: Tile[], variant: PairsVariant = 'swap'): { mistakes: number; turns: [number, number][]; maxFlips: number } {
  const turns: [number, number][] = []
  const flips = deck.map(() => 0)
  if (variant === 'flash') {
    // It saw everything: file each pair in order, without a mistake.
    for (let p = 0; p < deck.length / 2; p++) {
      const [a, b] = deck.map((t, i) => (t.pair === p ? i : -1)).filter(i => i >= 0)
      turns.push([a, b]); flips[a]++; flips[b]++
    }
    return { mistakes: 0, turns, maxFlips: Math.max(...flips) }
  }
  const ordered = variant === 'ordered'
  const done = new Set<number>()
  const seen = new Set<number>()
  let mistakes = 0
  let next = 0
  const partnerOf = (i: number) => deck.findIndex((t, j) => j !== i && t.pair === deck[i].pair)
  const file = (a: number, b: number) => {
    turns.push([a, b]); flips[a]++; flips[b]++
    if (ordered && deck[a].pair !== next) return false
    done.add(a); done.add(b)
    if (ordered) while (next < deck.length / 2 && deck.some((t, i) => t.pair === next && done.has(i))) next++
    return true
  }
  const newTile = (skip = -1) => deck.findIndex((_, i) => !done.has(i) && !seen.has(i) && i !== skip)
  for (let guard = 0; done.size < deck.length && guard < 1000; guard++) {
    // A fully known pair we may file now.
    const known = [...seen].find(i => !done.has(i) && seen.has(partnerOf(i)) && (!ordered || deck[i].pair === next))
    if (known !== undefined) { file(known, partnerOf(known)); continue }
    const a = newTile()
    seen.add(a)
    const pa = partnerOf(a)
    if (seen.has(pa)) {
      // Its partner is known: file it if allowed; ordered and out of turn, it just goes back (no mistake).
      if (!ordered || deck[a].pair === next) { file(a, pa); continue }
      const b = newTile(a)
      if (b < 0) { turns.push([a, pa]); flips[a]++; flips[pa]++; continue }
      seen.add(b)
      flips[a]++; flips[b]++; turns.push([a, b])
      mistakes++
      continue
    }
    const b = newTile(a)
    seen.add(b)
    flips[a]++
    if (deck[b].pair === deck[a].pair) { flips[a]--; file(a, b); continue }
    flips[b]++; turns.push([a, b])
    mistakes++
  }
  return { mistakes, turns, maxFlips: Math.max(...flips) }
}

/** @deprecated the classic name: perfect memory under the default rules. */
export const perfectMemoryMistakes = (deck: Tile[]) => perfectMemory(deck)

export default function PairsGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'ancient')
  const variant = config.variant ?? 'swap'
  const deck = useMemo(() => makeDeck(configId, config, difficulty, seed), [configId, config, difficulty, seed])
  const [rows, cols] = layoutFor(difficulty, variant)
  const budget = mistakeBudget(difficulty, variant)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })

  /** Desk position → deck tile (positions change in the swap variant). */
  const [slots, setSlots] = useState<number[]>(() => deck.map((_, i) => i))
  /** Flipped and matched hold deck tile indices. */
  const [flipped, setFlipped] = useState<number[]>([])
  const [matched, setMatched] = useState<Set<number>>(() => new Set())
  const [flips, setFlips] = useState<number[]>(() => deck.map(() => 0))
  const [mistakes, setMistakes] = useState(0)
  const [streak, setStreak] = useState(0)
  const [peeks, setPeeks] = useState(peeksFor(difficulty, variant))
  const [peeking, setPeeking] = useState(variant === 'flash')
  const [lock, setLock] = useState(false)
  const [swapped, setSwapped] = useState<number[]>([])
  const [note, setNote] = useState(variant === 'flash' ? 'Study the desk — it turns face down in a moment…' : config.intro)
  const [bonus, setBonus] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)) }
  useEffect(() => {
    if (variant !== 'flash') return
    const t = setTimeout(() => { setPeeking(false); setNote('Face down! Now file them from memory.') }, flashMsFor(difficulty))
    return () => clearTimeout(t)
  }, [variant, difficulty])

  const timer = useGameTimer({ seconds: timerFor(difficulty, variant), running: !settled && !(variant === 'flash' && peeking), onExpire: () => lose('the archive closed for the night') })
  const left = budget - mistakes
  /** Ordered: the lowest pair id not yet filed. */
  const nextPair = useMemo(() => {
    for (let p = 0; p < deck.length / 2; p++) if (!deck.some((t, i) => t.pair === p && matched.has(i))) return p
    return -1
  }, [deck, matched])
  const requested = nextPair >= 0 ? deck.find(t => t.pair === nextPair && t.kind === 'person')!.text : ''

  const tap = (pos: number) => {
    const i = slots[pos]
    if (settled || lock || peeking || matched.has(i) || flipped.includes(i)) return
    const f = flips.slice(); f[i]++
    setFlips(f)
    if (variant === 'fragile' && f[i] > FRAGILE_FLIPS) {
      setFlipped([...flipped, i])
      setNote(`“${deck[i].text}” tore — it was turned up once too often.`)
      lose('a fragile paper tore')
      return
    }
    if (flipped.length === 0) { setFlipped([i]); return }
    const a = flipped[0]
    if (deck[a].pair === deck[i].pair) {
      const person = deck[a].kind === 'person' ? deck[a] : deck[i]
      const work = deck[a].kind === 'person' ? deck[i] : deck[a]
      if (variant === 'ordered' && deck[a].pair !== nextPair) {
        // A right pair, out of turn: back it goes, no mistake.
        setFlipped([a, i])
        setStreak(0)
        setNote(`${person.text} — ${work.text} is right, but the reader asked for ${requested} first.`)
        setLock(true)
        later(() => { setFlipped([]); setLock(false) }, MISS_MS)
        return
      }
      const m = new Set(matched); m.add(a); m.add(i)
      setMatched(m)
      setFlipped([])
      const s = streak + 1
      setStreak(s)
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
    setFlipped([a, i])
    setStreak(0)
    const n = mistakes + 1
    setMistakes(n)
    if (n > budget) { setNote('Too many misfiled slips.'); lose('too many mistakes'); return }
    setNote(deck[a].kind === deck[i].kind
      ? `Two ${deck[a].kind === 'person' ? 'people' : 'works'} — a pair is a person and their work.`
      : `${deck[a].kind === 'person' ? deck[a].text : deck[i].text} did not make that.`)
    setLock(true)
    later(() => {
      setFlipped([])
      setLock(false)
      if (variant === 'swap') {
        // The two slips trade places on the desk.
        setSlots(sl => {
          const pa = sl.indexOf(a), pb = sl.indexOf(i)
          const next = sl.slice(); next[pa] = i; next[pb] = a
          setSwapped([pa, pb])
          return next
        })
        setNote('The two slips trade places!')
        later(() => setSwapped([]), 900)
      }
    }, MISS_MS)
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
          {variant === 'ordered' && nextPair >= 0 && (
            <p className="text-xs text-ink-2" data-testid="pairs-request">Next request: <span className="font-bold text-accent">{requested}</span></p>
          )}
        </div>
        <div className="flex flex-col items-end shrink-0">
          <p className={`text-xs font-bold tabular-nums ${left <= 1 ? 'text-red-600' : 'text-ink-2'}`} data-testid="mistakes-left">
            {Math.max(0, left)} mistakes left
          </p>
          {bonus > 0 && <p className="text-[10px] text-emerald-700">+{bonus} forgiven</p>}
        </div>
      </div>
      <p className="text-[11px] leading-snug text-ink-2 rounded-lg bg-panel border border-line px-2 py-1" data-testid="pairs-twist">
        <span className="font-bold text-accent">Twist · </span>{config.twist}
      </p>
      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}

      <div
        className="grid gap-1.5 w-full max-w-[420px] mx-auto"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
        data-testid="pairs-board"
      >
        {slots.map((ti, pos) => {
          const t = deck[ti]
          const up = peeking || matched.has(ti) || flipped.includes(ti)
          const done = matched.has(ti)
          const wrong = flipped.length === 2 && flipped.includes(ti) && !done
          const wear = variant === 'fragile' ? Math.max(0, FRAGILE_FLIPS - flips[ti]) : -1
          return (
            <button
              key={pos}
              data-tile={pos}
              data-pair={t.pair}
              data-kind={t.kind}
              aria-label={up ? `${t.kind}: ${t.text}` : 'face-down slip'}
              onClick={() => tap(pos)}
              className={`relative aspect-[3/4] [perspective:600px] rounded-lg ${swapped.includes(pos) ? 'ring-2 ring-amber-400' : ''}`}
            >
              <span
                className="absolute inset-0 transition-transform duration-300 [transform-style:preserve-3d]"
                style={{ transform: up ? 'rotateY(180deg)' : 'none' }}
              >
                {/* Back: a sealed catalogue slip. */}
                <span className="absolute inset-0 rounded-lg border-2 border-line bg-panel flex items-center justify-center [backface-visibility:hidden] shadow-sm">
                  <span className="w-[46%] aspect-square rounded-full bg-accent/80 text-accent-fg flex items-center justify-center text-sm font-bold shadow-inner">❦</span>
                  {wear >= 0 && !done && (
                    <span className="absolute bottom-1 left-0 right-0 text-center text-[9px] tracking-widest text-muted" data-wear={wear}>
                      {'●'.repeat(wear)}{'○'.repeat(FRAGILE_FLIPS - wear)}
                    </span>
                  )}
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
        {peeksFor(difficulty, variant) > 0 && (
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
