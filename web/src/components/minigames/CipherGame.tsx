import { useMemo, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar } from './_shared'
import { CODEBOOKS, MORSE, type CodebookKey } from './CodebookGame'
import DecodeGame, { CONFIGS as SUBSTITUTIONS } from './DecodeGame'

export { MORSE }

// Codebreaker: recover a hidden message.  Every way of hiding one is a
// system of this single game, and the config id picks the system, each
// with its own look and mechanic:
//   caesar       – every letter shifted by the same amount; turn the wheel
//   vigenere     – shifted by a repeating keyword; set each key letter
//   morse        – tap the dots and dashes for each letter
//   substitution – a scrambled alphabet; assign each cipher letter (DecodeGame)
//   atbash, polybius, pigpen, braille, telegraph, binary, scytale – the
//                  historical codebooks (CodebookGame)
// The three shift modes live here.  Difficulty sets the attempt cap and
// timer, and from tier 3 removes the frequency hint (caesar/vigenère) or
// the Morse reference card.

type Mode = 'caesar' | 'vigenere' | 'morse'

interface CipherConfig {
  title: string
  intro: string
  mode: Mode
  plaintext: string
  /** caesar: ignored (shift comes from the seed); vigenere: the keyword. */
  keyword?: string
  fact: string
}

export const CONFIGS: Record<string, CipherConfig> = {
  'caesar-gaul': {
    title: "Caesar's Dispatch",
    intro: 'A courier from Gaul carries a message shifted down the alphabet. Turn the wheel until it reads as Latin-tinged sense.',
    mode: 'caesar',
    plaintext: 'VENI VIDI VICI',
    fact: 'Suetonius records that Julius Caesar wrote to Cicero and his generals in a cipher that shifted each letter three places — the earliest documented military use of substitution.',
  },
  'philippics-warning': {
    title: 'A Warning in Cipher',
    intro: 'A friend writes to Cicero in the shifted alphabet Caesar once used in his letters to him. Turn the wheel until it names the man who wants Cicero dead.',
    mode: 'caesar',
    plaintext: 'MARC ANTONY',
    fact: 'Suetonius records that Caesar wrote to Cicero and others in a cipher that shifted each letter three places. In 43 BCE, after the fourteen Philippics, Antony put Cicero on the proscription list; he was caught near his villa at Formiae and killed.',
  },
  'al-kindi-frequency': {
    title: 'The Frequency of Letters',
    intro: "Al-Kindi's method: the commonest symbol in a long ciphertext is almost certainly the commonest letter of the language. Use the counts to set the shift.",
    mode: 'caesar',
    plaintext: 'KNOWLEDGE IS THE TREASURE OF THE WISE',
    fact: "In the ninth century Abū Yūsuf al-Kindī wrote 'A Manuscript on Deciphering Cryptographic Messages', describing frequency analysis — the technique that broke every simple substitution cipher for the next thousand years.",
  },
  'hand-of-god-quote': {
    title: 'After the Match, Mexico City 1986',
    intro: "A reporter has jotted down Diego's answer in his own shorthand, every letter shifted down the alphabet. Turn the wheel until it reads.",
    mode: 'caesar',
    plaintext: 'A LITTLE WITH THE HEAD OF MARADONA AND A LITTLE WITH THE HAND OF GOD',
    fact: "Asked about his first goal against England, Maradona said it was scored 'a little with the head of Maradona and a little with the hand of God'. The Tunisian referee, Ali Bin Nasser, had not seen the handball, and with no video review the goal stood.",
  },
  'vigenere-cabinet': {
    title: 'Le Chiffre Indéchiffrable',
    intro: 'A Vigenère cipher shifts each letter by a different amount, following a keyword. Set the keyword letters until the message appears.',
    mode: 'vigenere',
    plaintext: 'ATTACK AT DAWN',
    keyword: 'LEMON',
    fact: "Blaise de Vigenère's polyalphabetic cipher (1586) resisted attack for three centuries until Charles Babbage and Friedrich Kasiski independently broke it in the 1850s by finding the keyword's length from repeated fragments.",
  },
  'bletchley-crib': {
    title: 'The Morning Crib',
    intro: 'A practice intercept on the Bletchley Park training course, shifted down the alphabet. Turn the wheel until the German word every codebreaker hoped to see appears.',
    mode: 'caesar',
    plaintext: 'WETTERBERICHT',
    fact: 'German weather stations and ships sent a "Wetterbericht" (weather report) in the same format at the same hour every day. Guessed plaintext like this — a crib — was what Turing\'s Bombe needed to test Enigma settings at speed.',
  },
  'fae-motto': {
    title: 'Frei aber einsam',
    intro: 'Joachim\'s motto is hidden in shifted letters, as the Schumann circle loved to hide words in music. Turn the wheel until it reads.',
    mode: 'caesar',
    plaintext: 'FREI ABER EINSAM',
    fact: 'In October 1853 Robert Schumann, the 20-year-old Brahms and Albert Dietrich wrote a violin sonata together for Joseph Joachim on the notes F–A–E, from his motto "Frei aber einsam" — free but lonely. Brahms wrote the scherzo.',
  },
  'morse-telegraph': {
    title: 'What Hath God Wrought',
    intro: 'Tap out the message in dots and dashes, one letter at a time, as the first telegraph operators did.',
    mode: 'morse',
    plaintext: 'SOS WE ARE SINKING',
    fact: "Samuel Morse's first public telegraph message, sent from Washington to Baltimore on 24 May 1844, read 'What hath God wrought'. The 1912 Titanic sent both the older CQD and the new SOS distress calls.",
  },
}

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

const shiftChar = (ch: string, k: number) => {
  const i = A.indexOf(ch)
  return i < 0 ? ch : A[(i + k + 26 * 10) % 26]
}

export function encodeCaesar(text: string, k: number) { return [...text].map(c => shiftChar(c, k)).join('') }
export function encodeVigenere(text: string, keyword: string) {
  let j = 0
  return [...text].map(c => {
    if (A.indexOf(c) < 0) return c
    const k = A.indexOf(keyword[j % keyword.length]); j++
    return shiftChar(c, k)
  }).join('')
}

/**
 * Story params may override the plaintext; an empty override would leave
 * nothing to decode, so fall back to the base config's message.
 */
export function resolveCipherConfig(configId: string | undefined, params?: Record<string, unknown>): CipherConfig {
  const cfg = resolveConfig(CONFIGS, configId, params, 'caesar-gaul')
  if (typeof cfg.plaintext !== 'string' || !/[A-Za-z]/.test(cfg.plaintext)) {
    const base = (configId && CONFIGS[configId]) || CONFIGS['caesar-gaul']
    return { ...cfg, plaintext: base.plaintext }
  }
  return cfg
}

/**
 * Caesar and Vigenère: a few wrong readings, the frequency / keyword hint
 * goes at tier 3, and a clock from tier 3.  Morse: every mistyped symbol
 * counts, so the cap is per letter-ish, and the card always stays (nobody
 * keys Morse from memory); its clock scales with the message.
 */
export function cipherTier(mode: Mode, difficulty: Difficulty, plaintext: string) {
  if (mode === 'morse') {
    const letters = plaintext.replace(/[^A-Za-z]/g, '').length
    return {
      maxAttempts: scale(difficulty, [6, 5, 4, 3]),
      showHints: true,
      timeLimit: scale(difficulty, [0, 30 + letters * 12, 30 + letters * 9, 30 + letters * 7]),
    }
  }
  if (mode === 'caesar') {
    // From tier 3 the wheel no longer reads out live: the player works the
    // shift out (the frequency counts stay to make that fair) and checks it.
    return {
      maxAttempts: scale(difficulty, [4, 3, 2, 2]),
      showHints: true,
      blind: difficulty >= 3,
      timeLimit: scale(difficulty, [0, 0, 120, 90]),
    }
  }
  return {
    maxAttempts: scale(difficulty, [4, 3, 2, 2]),
    showHints: difficulty < 3,
    timeLimit: scale(difficulty, [0, 0, 180, 150]),
  }
}

function ShiftGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveCipherConfig(configId, params)
  const { maxAttempts, showHints, timeLimit, blind = false } = cipherTier(cfg.mode, difficulty, cfg.plaintext)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })
  const timer = useGameTimer({ seconds: timeLimit, running: !settled, onExpire: () => lose('out of time') })
  const [attempts, setAttempts] = useState(0)

  // The caesar shift comes from the seed, so a retry gets a different wheel.
  const shift = useMemo(() => 1 + Math.floor(mulberry32(seed)() * 25), [seed])
  const plain = cfg.plaintext.toUpperCase()
  const keyword = (cfg.keyword ?? 'KEY').toUpperCase()
  const ciphertext = useMemo(() =>
    cfg.mode === 'caesar' ? encodeCaesar(plain, shift)
    : cfg.mode === 'vigenere' ? encodeVigenere(plain, keyword)
    : plain, [cfg.mode, plain, shift, keyword])

  const check = (ok: boolean) => {
    if (settled) return
    if (ok) { win(); return }
    const n = attempts + 1
    setAttempts(n)
    if (n >= maxAttempts) lose('too many wrong readings')
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

      {cfg.mode === 'caesar' && <CaesarWheel ciphertext={ciphertext} shift={shift} showHints={showHints} blind={blind} disabled={settled} onCheck={check} />}
      {cfg.mode === 'vigenere' && <VigenerePanel ciphertext={ciphertext} keyword={keyword} showHints={showHints} disabled={settled} onCheck={check} />}
      {cfg.mode === 'morse' && <MorseKey plain={plain} showHints={showHints} disabled={settled} onCheck={check} onWrong={() => check(false)} />}

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Message read!" loseTitle="The message stays dark" />
    </div>
  )
}

// ── Caesar ─────────────────────────────────────────────────────────────────────

function CaesarWheel({ ciphertext, shift, showHints, blind, disabled, onCheck }: {
  ciphertext: string; shift: number; showHints: boolean; blind: boolean; disabled: boolean; onCheck: (ok: boolean) => void
}) {
  const [guess, setGuess] = useState(0)
  // Blind wheel: the reading appears only for the setting last checked.
  const [checked, setChecked] = useState<number | null>(null)
  const showReading = !blind || checked === guess
  const decoded = encodeCaesar(ciphertext, -guess)
  const freq = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of ciphertext) if (A.includes(c)) counts[c] = (counts[c] ?? 0) + 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3)
  }, [ciphertext])

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-sm tracking-[0.2em] text-ink bg-panel border border-line rounded-xl p-3 break-words">{ciphertext}</p>
      <div className="flex items-center gap-3">
        <button disabled={disabled} onClick={() => setGuess(g => (g + 25) % 26)}
          className="w-10 h-10 rounded-xl bg-panel border border-line text-ink font-bold hover:border-accent/40">−</button>
        <div className="flex-1 text-center">
          <p className="text-[10px] text-muted uppercase tracking-widest">shift</p>
          <p className="text-2xl font-bold text-accent">{guess}</p>
        </div>
        <button disabled={disabled} onClick={() => setGuess(g => (g + 1) % 26)}
          className="w-10 h-10 rounded-xl bg-panel border border-line text-ink font-bold hover:border-accent/40">+</button>
      </div>
      <p data-testid="caesar-reading" className="font-mono text-sm tracking-[0.2em] text-accent bg-panel border border-accent/30 rounded-xl p-3 break-words">
        {showReading ? decoded : <span className="text-muted text-xs tracking-normal">Work out the shift, then check it to read the result.</span>}
      </p>
      {showHints && (
        <p className="text-[10px] text-muted">
          Most frequent symbols: {freq.map(([c, n]) => `${c}×${n}`).join(', ')} — in English, E, T and A lead.
        </p>
      )}
      <button disabled={disabled || (blind && checked === guess)} onClick={() => { setChecked(guess); onCheck(guess === shift) }}
        className="py-2.5 rounded-xl bg-accent text-accent-fg font-bold text-sm hover:bg-accent-hover transition-all disabled:opacity-50">
        {blind ? 'Check this shift' : 'Read the message'}
      </button>
    </div>
  )
}

// ── Vigenère ───────────────────────────────────────────────────────────────────

function VigenerePanel({ ciphertext, keyword, showHints, disabled, onCheck }: {
  ciphertext: string; keyword: string; showHints: boolean; disabled: boolean; onCheck: (ok: boolean) => void
}) {
  const [keyGuess, setKeyGuess] = useState<number[]>(() => Array(keyword.length).fill(0))
  const decoded = useMemo(() => {
    let j = 0
    return [...ciphertext].map(c => {
      if (A.indexOf(c) < 0) return c
      const k = keyGuess[j % keyGuess.length]; j++
      return shiftChar(c, -k)
    }).join('')
  }, [ciphertext, keyGuess])

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-sm tracking-[0.2em] text-ink bg-panel border border-line rounded-xl p-3 break-words">{ciphertext}</p>
      <div className="flex justify-center gap-2">
        {keyGuess.map((k, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <button disabled={disabled} onClick={() => setKeyGuess(g => g.map((v, j) => j === i ? (v + 1) % 26 : v))}
              className="w-9 h-7 rounded-lg bg-panel border border-line text-xs hover:border-accent/40">▲</button>
            <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-accent/15 border border-accent/30 text-accent font-bold text-lg">{A[k]}</span>
            <button disabled={disabled} onClick={() => setKeyGuess(g => g.map((v, j) => j === i ? (v + 25) % 26 : v))}
              className="w-9 h-7 rounded-lg bg-panel border border-line text-xs hover:border-accent/40">▼</button>
          </div>
        ))}
      </div>
      <p className="font-mono text-sm tracking-[0.2em] text-accent bg-panel border border-accent/30 rounded-xl p-3 break-words">{decoded}</p>
      {showHints && <p className="text-[10px] text-muted">The keyword has {keyword.length} letters and names a fruit.</p>}
      <button disabled={disabled} onClick={() => onCheck(keyGuess.every((k, i) => A[k] === keyword[i]))}
        className="py-2.5 rounded-xl bg-accent text-accent-fg font-bold text-sm hover:bg-accent-hover transition-all disabled:opacity-50">
        Read the message
      </button>
    </div>
  )
}

// ── Morse ──────────────────────────────────────────────────────────────────────

function MorseKey({ plain, showHints, disabled, onCheck, onWrong }: {
  plain: string; showHints: boolean; disabled: boolean; onCheck: (ok: boolean) => void; onWrong: () => void
}) {
  const letters = [...plain]
  const [pos, setPos] = useState(0)
  const [buffer, setBuffer] = useState('')
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null)

  // Skip spaces automatically.
  const target = letters[pos] === ' ' ? letters[pos + 1] : letters[pos]
  const idx = letters[pos] === ' ' ? pos + 1 : pos

  const tap = (symbol: '.' | '-') => {
    if (disabled || flash) return
    const next = buffer + symbol
    const want = MORSE[target]
    if (!want.startsWith(next)) {
      setFlash('bad'); setBuffer('')
      setTimeout(() => setFlash(null), 500)
      onWrong()
      return
    }
    setBuffer(next)
  }
  const sendLetter = () => {
    if (disabled || flash) return
    if (buffer === MORSE[target]) {
      setFlash('ok'); setBuffer('')
      const nextPos = idx + 1
      setTimeout(() => { setFlash(null); setPos(nextPos); if (nextPos >= letters.length) onCheck(true) }, 300)
    } else {
      setFlash('bad'); setBuffer('')
      setTimeout(() => setFlash(null), 500)
      onWrong()
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-base tracking-[0.25em] text-ink bg-panel border border-line rounded-xl p-3 break-words">
        {letters.map((c, i) => (
          <span key={i} className={i < idx ? 'text-emerald-700' : i === idx ? 'text-accent underline' : 'text-muted/60'}>{c}</span>
        ))}
      </p>
      <div className={`h-10 flex items-center justify-center rounded-xl border font-mono text-2xl tracking-[0.3em]
        ${flash === 'ok' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700' : flash === 'bad' ? 'border-red-500 bg-red-500/10 text-red-700' : 'border-line bg-panel text-accent'}`}>
        {buffer || ' '}
      </div>
      <div className="flex gap-2">
        <button disabled={disabled} onClick={() => tap('.')} className="flex-1 py-3 rounded-xl bg-panel border border-line text-2xl font-bold text-ink hover:border-accent/40">·</button>
        <button disabled={disabled} onClick={() => tap('-')} className="flex-1 py-3 rounded-xl bg-panel border border-line text-2xl font-bold text-ink hover:border-accent/40">—</button>
        <button disabled={disabled} onClick={sendLetter} className="flex-1 py-3 rounded-xl bg-accent text-accent-fg font-bold text-sm hover:bg-accent-hover">Send</button>
      </div>
      {showHints && (
        <div className="grid grid-cols-6 gap-x-2 gap-y-0.5 text-[10px] font-mono text-muted">
          {Object.entries(MORSE).map(([l, m]) => <span key={l}><span className="text-ink font-bold">{l}</span> {m}</span>)}
        </div>
      )}
    </div>
  )
}

// ── Systems ────────────────────────────────────────────────────────────────────

export type CipherSystem = Mode | 'substitution' | CodebookKey

/** Which system each config belongs to; config ids are unique across all of them. */
export const SYSTEM_OF: Record<string, CipherSystem> = Object.fromEntries([
  ...Object.entries(CONFIGS).map(([id, c]): [string, CipherSystem] => [id, c.mode]),
  ...Object.keys(SUBSTITUTIONS).map((id): [string, CipherSystem] => [id, 'substitution']),
  ...(Object.keys(CODEBOOKS) as CodebookKey[]).flatMap(sys =>
    Object.keys(CODEBOOKS[sys].CONFIGS).map((id): [string, CipherSystem] => [id, sys])),
])

/** The component that plays a system; unknown ids fall back to the shift game's default. */
function gameFor(configId: string | undefined) {
  const sys = configId ? SYSTEM_OF[configId] : undefined
  if (sys === 'substitution') return DecodeGame
  if (sys && sys in CODEBOOKS) return CODEBOOKS[sys as CodebookKey].Game
  return ShiftGame
}

export default function CipherGame(props: MinigameProps) {
  const Game = gameFor(props.configId)
  return <Game {...props} />
}

// Every hand-authored config id, in Arcade order: the track plays the first
// 24, so no two neighbours share a system, the easy readers (atbash, caesar
// with a live wheel, binary with numbered keys) open the ladder, and the
// systems with depth to them (substitution, vigenère, frequency analysis)
// gather in the last tier.  The rest follow for story use, still alternating.
// The registry test renders each one.
export const CONFIG_IDS = [
  // A: D1
  'jain-teaching', 'caesar-gaul', 'mac-bitmap', 'nineveh-sign-list', 'endenich-telegram', 'masonic-grid',
  // B: D2
  'ephors-recall', 'mirror-tablet', 'paris-1839', 'fae-motto', 'morse-telegraph', 'five-lamps',
  // C: D3
  'mulan-code', 'greek-torches', 'signal-lamp', 'spartan-rod', 'peterhof-dawn', 'bletchley-crib',
  // D: D4
  'raised-dots', 'enigma-msg', 'vigenere-cabinet', 'bongsu-beacons', 'azteca-banner', 'al-kindi-frequency',
  // Story-only beyond the 24 levels
  'cipher-al', 'saqqara-mirror', 'cicero-code', 'harbin-wire', 'belisarius-msg', 'gombe-archive',
  'sargon-code', 'philippics-warning', 'mao-code', 'arthashastra-spies', 'morris-cable', 'printed-plutarch',
  'turing-dispatch', 'tadanori-quiver', 'rihla-title', 'dandi-dispatch', 'upadha-test', 'nobel-telex',
  'hand-of-god-quote', 'shaw-epilogue', 'mani-last-words', 'leakey-cable', 'shunzei-scroll', 'ap-telex',
]
