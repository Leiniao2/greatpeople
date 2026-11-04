import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { artCover, type GameArtKey } from '@/games/art'
import { mulberry32, randInt, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Rhythm: a falling-note performance.  Each config carries a short,
// recognisable melody (Bach's Little Fugue subject, Beethoven's Fifth,
// a Tang court drum pattern, a Hildegard antiphon).  The song plays it as
// several phrases with the tempo rising; notes fall down 3–5 lanes toward
// the hit line and every note you catch sounds its pitch.  Timing is judged
// Perfect / Good / Miss; reach the accuracy target by the last note without
// running out of misses.
//
// Chart building and judgement are pure functions below so tests can play
// a whole song without a browser.

type Voice = 'organ' | 'strings' | 'drums' | 'voice'

interface RhythmConfig {
  title: string
  intro: string
  /** [frequency Hz (0 = rest), length in beats]. */
  melody: [number, number][]
  /** Tempo of the first phrase, quarter notes per minute. */
  bpm: number
  /** Lane captions, low to high. */
  laneNames: string[]
  voice: Voice
  art: GameArtKey
  fact: string
}

export const CONFIGS: Record<string, RhythmConfig> = {
  'bach-fugue': {
    title: 'The Little Fugue',
    intro: "Bach's organ states the subject of the Little Fugue in G minor; every voice must answer it exactly. Catch each note as it reaches the line.",
    melody: [
      [392.0, 1], [587.3, 1], [466.2, 1.5], [440.0, 0.5], [392.0, 0.5], [466.2, 0.5], [440.0, 0.5], [392.0, 0.5], [370.0, 0.5], [440.0, 0.5], [293.7, 1],
      [392.0, 0.5], [293.7, 0.5], [440.0, 0.5], [293.7, 0.5], [466.2, 0.5], [440.0, 0.5], [392.0, 0.5], [440.0, 0.5], [293.7, 1.5],
    ],
    bpm: 84,
    laneNames: ['Pedal', 'Great', 'Swell', 'Choir', 'Echo'],
    voice: 'organ',
    art: 'rhythm_bach',
    fact: "Bach's Well-Tempered Clavier (1722 and 1742) gave a prelude and fugue in every one of the 24 keys, a feat only possible with the new well-tempered tuning. Beethoven learned it as a boy and called it his musical bible.",
  },
  'beethoven-motif': {
    title: 'Fate Knocks',
    intro: 'Four notes open the Fifth Symphony and never leave it. Strike every knock — Beethoven keeps pressing the tempo.',
    melody: [
      [0, 0.5], [392.0, 0.5], [392.0, 0.5], [392.0, 0.5], [311.1, 2],
      [0, 0.5], [349.2, 0.5], [349.2, 0.5], [349.2, 0.5], [293.7, 2],
      [0, 0.5], [392.0, 0.5], [392.0, 0.5], [392.0, 0.5], [311.1, 0.5], [415.3, 0.5], [415.3, 0.5], [415.3, 0.5], [392.0, 0.5],
      [622.3, 0.5], [622.3, 0.5], [622.3, 0.5], [523.3, 2],
    ],
    bpm: 108,
    laneNames: ['Basses', 'Cellos', 'Violas', 'Violins', 'Winds'],
    voice: 'strings',
    art: 'rhythm_beethoven',
    fact: 'Beethoven was almost completely deaf when he conducted the premiere of the Fifth Symphony in December 1808, in a freezing Vienna theatre, in a concert that ran over four hours.',
  },
  'court-drums': {
    title: 'The Court Orchestra',
    intro: 'A Tang court ensemble follows the great drum. Keep the drums, bells and clappers on the beat so the dancers never falter.',
    melody: [
      [110, 1], [165, 0.5], [165, 0.5], [523.3, 1], [110, 1],
      [880, 0.5], [880, 0.5], [165, 0.5], [165, 0.5], [659.3, 1],
      [110, 1], [110, 0.5], [165, 0.5], [523.3, 1], [880, 0.5], [659.3, 0.5], [110, 2],
    ],
    bpm: 96,
    laneNames: ['Dà gǔ', 'Xiǎo gǔ', 'Zhōng', 'Bó', 'Mù yú'],
    voice: 'drums',
    art: 'rhythm_court',
    fact: "The Tang court's Ten Divisions of Music drew ensembles from across Asia — Kucha, Samarkand, India, Korea — and the 8th-century repertoire survives in Japan's gagaku, the oldest continuously performed orchestral music in the world.",
  },
  'motown-steps': {
    title: 'Feet Like James Brown',
    intro: 'Michael learned to dance by copying James Brown’s feet, step for step, then adding his own. Hit every step on the beat as the band pushes the tempo.',
    melody: [
      [110, 0.5], [110, 0.5], [0, 0.5], [165, 0.5], [523.3, 1], [110, 0.5], [165, 0.5],
      [880, 0.5], [0, 0.5], [110, 0.5], [165, 0.5], [659.3, 1], [523.3, 0.5], [880, 0.5],
      [110, 0.5], [110, 0.5], [165, 0.5], [523.3, 0.5], [659.3, 0.5], [880, 0.5], [110, 2],
    ],
    bpm: 104,
    laneNames: ['Heel', 'Toe', 'Slide', 'Spin', 'Freeze'],
    voice: 'drums',
    art: 'rhythm_beethoven',
    fact: 'Michael Jackson was singing lead with the Jackson 5 by the age of eleven, and the group’s first four Motown singles all went to number one in 1970. He said he learned to dance by studying James Brown on television, mimicking every move.',
  },
  'flower-war-drums': {
    title: 'The Drums of the Flower War',
    intro: 'Before a xochiyaoyotl the warriors march out to the great drums. Keep the huehuetl, the teponaztli, the conch and the rattles on the beat as the march quickens.',
    melody: [
      [110, 1], [165, 0.5], [165, 0.5], [523.3, 1], [110, 1],
      [880, 0.5], [880, 0.5], [165, 0.5], [165, 0.5], [659.3, 1],
      [110, 1], [110, 0.5], [165, 0.5], [523.3, 1], [880, 0.5], [659.3, 0.5], [110, 2],
    ],
    bpm: 96,
    laneNames: ['Huēhuētl', 'Teponāztli', 'Conch', 'Flute', 'Rattles'],
    voice: 'drums',
    art: 'rhythm_court',
    fact: 'The Mexica marched to war and to the great festivals to the huehuetl, an upright skin drum, and the teponaztli, a two-toned wooden slit drum, with conch trumpets, clay flutes and rattles. No Aztec music was written down, so the pattern played here is a modern one.',
  },
  'li-qingzhao-ci': {
    title: 'Slow, Slow Tune',
    intro: 'A ci is written to an existing tune, its lines cut to the tune’s pattern. Sing Li Qingzhao’s words to the melody, note for note, as the singer presses on.',
    melody: [
      [392.0, 1], [440.0, 0.5], [493.9, 0.5], [587.3, 1.5], [493.9, 0.5], [440.0, 1],
      [392.0, 1], [659.3, 1], [587.3, 0.5], [493.9, 0.5], [440.0, 1], [392.0, 0.5], [440.0, 0.5], [493.9, 1], [392.0, 2],
    ],
    bpm: 72,
    laneNames: ['Gōng', 'Shāng', 'Jué', 'Zhǐ', 'Yǔ'],
    voice: 'voice',
    art: 'rhythm_court',
    fact: 'Ci were lyrics written to named tunes such as Shēng Shēng Màn ("Slow, Slow Tune"), each fixing the length of every line and the tones of its syllables. Most of the Song melodies are lost, so the tune played here is a modern pentatonic phrase; Li Qingzhao’s words survive.',
  },
  'hildegard-chant': {
    title: 'Symphonia',
    intro: "Hildegard of Bingen's chants leap further than any of her century. Follow the antiphon as the choir carries it higher and faster.",
    melody: [
      [293.7, 1], [440.0, 1], [440.0, 0.5], [523.3, 0.5], [587.3, 1.5], [523.3, 0.5], [440.0, 1],
      [392.0, 0.5], [440.0, 0.5], [349.2, 1], [392.0, 0.5], [440.0, 0.5], [392.0, 0.5], [349.2, 0.5], [329.6, 1], [293.7, 2],
    ],
    bpm: 72,
    laneNames: ['Finalis', 'Low', 'Middle', 'High', 'Tenor'],
    voice: 'voice',
    art: 'rhythm_hildegard',
    fact: 'Hildegard of Bingen (1098–1179) composed some 77 chants and the earliest surviving morality play, wrote on medicine and natural history, invented a private language, and was made a Doctor of the Church in 2012.',
  },
  'brahms-wiegenlied': {
    title: 'Wiegenlied',
    intro: 'Brahms’s cradle song rocks gently in three-time. Catch each note as it reaches the line — the strings keep pressing the tempo.',
    melody: [
      [329.6, 0.5], [329.6, 0.5], [392.0, 2], [329.6, 0.5], [329.6, 0.5], [392.0, 2],
      [329.6, 0.5], [392.0, 0.5], [523.3, 1], [493.9, 1], [440.0, 1], [440.0, 1], [392.0, 1],
      [293.7, 0.5], [329.6, 0.5], [349.2, 1], [293.7, 1], [293.7, 0.5], [329.6, 0.5], [349.2, 2],
      [293.7, 0.5], [349.2, 0.5], [493.9, 0.5], [440.0, 0.5], [392.0, 1], [493.9, 1], [523.3, 2],
    ],
    bpm: 80,
    laneNames: ['Basses', 'Cellos', 'Violas', 'Violins', 'Winds'],
    voice: 'strings',
    art: 'rhythm_beethoven',
    fact: 'Brahms wrote his Wiegenlied, Op. 49 No. 4, in 1868 for his friend Bertha Faber on the birth of her second son, working into its accompaniment an Austrian waltz-song she used to sing to him in Hamburg.',
  },
}

// ── Pure rules (exported for tests) ─────────────────────────────────────────

export const LANE_KEYS = ['d', 'f', 'j', 'k', 'l'] as const
/** Silence between pressing Start and song time 0. */
export const LEAD_IN_MS = 600

export function rhythmRules(d: Difficulty) {
  return {
    lanes: scale(d, [3, 4, 4, 5]),
    phrases: scale(d, [3, 4, 5, 6]),
    /** Tempo gain per phrase. */
    rise: scale(d, [0.05, 0.06, 0.07, 0.07]),
    travelMs: scale(d, [2200, 1900, 1650, 1450]),
    perfectMs: scale(d, [80, 70, 60, 50]),
    goodMs: scale(d, [160, 140, 120, 105]),
    /** Closest two notes may ever be, in any lanes. */
    minGapMs: scale(d, [300, 240, 190, 170]),
    maxMisses: scale(d, [10, 8, 6, 4]),
    /** (perfect + 0.6 × good) / notes needed at the end. */
    target: scale(d, [0.55, 0.65, 0.72, 0.8]),
    ornaments: d >= 3,
  }
}

export interface ChartNote { t: number; lane: number; freq: number; phrase: number }
export interface Chart {
  notes: ChartNote[]
  lanes: number
  travelMs: number
  /** Song time (ms) at which each phrase starts, and its tempo. */
  phrases: { start: number; bpm: number }[]
  endMs: number
}

/** Build the falling-note chart for a config.  Deterministic in (config, difficulty, seed). */
export function buildChart(cfg: Pick<RhythmConfig, 'melody' | 'bpm'>, difficulty: Difficulty, seed: number): Chart {
  const r = rhythmRules(difficulty)
  const rng = mulberry32(seed ^ 0x5eed)
  const L = r.lanes
  const melody = cfg.melody?.length ? cfg.melody : CONFIGS['bach-fugue'].melody
  const pitches = [...new Set(melody.filter(([f]) => f > 0).map(([f]) => f))].sort((a, b) => a - b)
  const laneOf = (f: number) => Math.min(L - 1, Math.floor((pitches.indexOf(f) * L) / Math.max(1, pitches.length)))

  const notes: ChartNote[] = []
  const phrases: Chart['phrases'] = []
  let t = r.travelMs        // first note enters from the top of the lane
  for (let p = 0; p < r.phrases; p++) {
    const bpm = Math.round((cfg.bpm || 90) * (1 + r.rise * p))
    const beat = 60000 / bpm
    phrases.push({ start: t, bpm })
    // Phrase variation: the opening statement is plain; later ones may be mirrored or shifted.
    const variant = p === 0 || difficulty === 1 ? 0 : randInt(rng, 0, 2)
    const shift = randInt(rng, 1, L - 1)
    const place = (lane: number) => variant === 1 ? L - 1 - lane : variant === 2 ? (lane + shift) % L : lane
    for (const [f, beats] of melody) {
      const len = beats * beat
      if (f > 0) {
        notes.push({ t: Math.round(t), lane: place(laneOf(f)), freq: f, phrase: p })
        if (r.ornaments && beats >= 1 && rng() < 0.5) {
          const up = pitches[Math.min(pitches.length - 1, pitches.indexOf(f) + 1)]
          notes.push({ t: Math.round(t + len / 2), lane: (place(laneOf(f)) + 1) % L, freq: up, phrase: p })
        }
      }
      t += len
    }
    t += beat     // breath between phrases
  }
  // Nothing closer than the minimum gap: drop the later of any crowded pair.
  const spaced: ChartNote[] = []
  for (const n of notes) if (!spaced.length || n.t - spaced[spaced.length - 1].t >= r.minGapMs) spaced.push(n)
  return { notes: spaced, lanes: L, travelMs: r.travelMs, phrases, endMs: Math.round(t) }
}

export type Judgement = 'perfect' | 'good' | 'miss'

export interface RunState {
  /** Per note: its judgement once settled. */
  judged: (Judgement | null)[]
  perfect: number
  good: number
  miss: number
  stray: number
  combo: number
  maxCombo: number
  score: number
}

export const newRun = (chart: Chart): RunState =>
  ({ judged: chart.notes.map(() => null), perfect: 0, good: 0, miss: 0, stray: 0, combo: 0, maxCombo: 0, score: 0 })

/** Timing judgement for a tap `deltaMs` away from its note, or null when outside the window. */
export function judgeOffset(deltaMs: number, difficulty: Difficulty): Exclude<Judgement, 'miss'> | null {
  const r = rhythmRules(difficulty)
  const d = Math.abs(deltaMs)
  return d <= r.perfectMs ? 'perfect' : d <= r.goodMs ? 'good' : null
}

const multiplier = (combo: number) => Math.min(2, 1 + Math.floor(combo / 10) * 0.25)

/** A tap on `lane` at song time `time`: hits the earliest open note in reach, else is a stray. */
export function hitLane(state: RunState, chart: Chart, lane: number, time: number, difficulty: Difficulty):
  { state: RunState; judgement: Judgement | null; note: number } {
  const r = rhythmRules(difficulty)
  let idx = -1
  for (let i = 0; i < chart.notes.length; i++) {
    const n = chart.notes[i]
    if (n.t - time > r.goodMs) break
    if (state.judged[i] || n.lane !== lane) continue
    if (Math.abs(n.t - time) <= r.goodMs) { idx = i; break }
  }
  if (idx < 0) {
    return { state: { ...state, stray: state.stray + 1, combo: 0, score: Math.max(0, state.score - 50) }, judgement: null, note: -1 }
  }
  const j = judgeOffset(chart.notes[idx].t - time, difficulty)!
  const judged = [...state.judged]; judged[idx] = j
  const combo = state.combo + 1
  const gain = Math.round((j === 'perfect' ? 300 : 100) * multiplier(combo))
  return {
    state: {
      ...state, judged, combo, maxCombo: Math.max(state.maxCombo, combo), score: state.score + gain,
      perfect: state.perfect + (j === 'perfect' ? 1 : 0), good: state.good + (j === 'good' ? 1 : 0),
    },
    judgement: j, note: idx,
  }
}

/** Mark every note that has passed out of reach as missed. */
export function sweepMisses(state: RunState, chart: Chart, time: number, difficulty: Difficulty): RunState {
  const r = rhythmRules(difficulty)
  let judged: RunState['judged'] | null = null
  let missed = 0
  for (let i = 0; i < chart.notes.length; i++) {
    const n = chart.notes[i]
    if (n.t + r.goodMs >= time) break
    if ((judged ?? state.judged)[i]) continue
    judged ??= [...state.judged]
    judged[i] = 'miss'; missed++
  }
  return judged ? { ...state, judged, miss: state.miss + missed, combo: 0 } : state
}

export const accuracy = (s: RunState, chart: Chart) =>
  chart.notes.length ? (s.perfect + 0.6 * s.good) / chart.notes.length : 1

/** 'lost' as soon as the misses run out; at the end, 'won' or 'lost' on the accuracy target. */
export function verdict(s: RunState, chart: Chart, difficulty: Difficulty): 'won' | 'lost' | null {
  const r = rhythmRules(difficulty)
  if (s.miss >= r.maxMisses) return 'lost'
  if (s.judged.every(Boolean)) return accuracy(s, chart) >= r.target ? 'won' : 'lost'
  return null
}

// ── Audio ──────────────────────────────────────────────────────────────────

type AudioCtor = typeof AudioContext
function makeAudio(): AudioContext | null {
  try {
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }
    const C = w.AudioContext ?? w.webkitAudioContext
    return C ? new C() : null
  } catch { return null }
}

function playTone(ctx: AudioContext | null, freq: number, voice: Voice, soft = false) {
  if (!ctx || !freq) return
  try {
    const now = ctx.currentTime
    const gain = ctx.createGain()
    const peak = soft ? 0.05 : 0.16
    const len = voice === 'drums' ? 0.22 : voice === 'voice' ? 0.6 : 0.4
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + len)
    gain.connect(ctx.destination)
    const partials = voice === 'organ' ? [1, 2, 3] : voice === 'strings' ? [1, 2] : [1]
    for (const [i, mult] of partials.entries()) {
      const osc = ctx.createOscillator()
      osc.type = voice === 'strings' ? 'sawtooth' : voice === 'drums' ? 'triangle' : 'sine'
      osc.frequency.setValueAtTime(freq * mult, now)
      if (voice === 'drums') osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.5), now + len)
      if (voice === 'voice') { osc.frequency.linearRampToValueAtTime(freq * 1.006, now + 0.3); osc.frequency.linearRampToValueAtTime(freq, now + 0.6) }
      const g = ctx.createGain(); g.gain.value = 1 / (i + 1) / (voice === 'strings' ? 3 : 1)
      osc.connect(g).connect(gain)
      osc.start(now); osc.stop(now + len + 0.05)
    }
  } catch { /* audio unavailable */ }
}

// ── Component ──────────────────────────────────────────────────────────────

const LANE_COLORS = ['bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500']
const LANE_GLOW = ['shadow-sky-400/60', 'shadow-emerald-400/60', 'shadow-amber-400/60', 'shadow-rose-400/60', 'shadow-violet-400/60']
const FIELD_H = 340
const HIT_Y = 290
const clock = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

export default function RhythmGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'bach-fugue')
  const base = CONFIGS[configId] ?? CONFIGS['bach-fugue']
  const rules = rhythmRules(difficulty)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chart = useMemo(() => buildChart(cfg, difficulty, seed), [configId, difficulty, seed])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })

  const [status, setStatus] = useState<'ready' | 'playing' | 'done'>('ready')
  const [, setFrame] = useState(0)
  const run = useRef<RunState>(newRun(chart))
  const startAt = useRef(0)
  const audio = useRef<AudioContext | null>(null)
  const [pop, setPop] = useState<{ j: Judgement; key: number } | null>(null)
  const [pressed, setPressed] = useState<number | null>(null)
  const popKey = useRef(0)
  const songTime = () => clock() - startAt.current

  const settle = useCallback((v: 'won' | 'lost') => {
    setStatus('done')
    if (v === 'won') win()
    else lose(run.current.miss >= rules.maxMisses ? 'too many notes dropped' : 'the performance fell short')
  }, [win, lose, rules.maxMisses])

  // Game loop: sweep misses and redraw each frame.
  useEffect(() => {
    if (status !== 'playing') return
    let raf = 0
    let alive = true
    const hasRaf = typeof requestAnimationFrame === 'function'
    const frame = () => {
      if (!alive) return
      const before = run.current.miss
      run.current = sweepMisses(run.current, chart, songTime(), difficulty)
      if (run.current.miss > before) { popKey.current++; setPop({ j: 'miss', key: popKey.current }) }
      const v = verdict(run.current, chart, difficulty)
      setFrame(f => f + 1)
      if (v) { settle(v); return }
      raf = hasRaf ? requestAnimationFrame(frame) : (setTimeout(frame, 16) as unknown as number)
    }
    raf = hasRaf ? requestAnimationFrame(frame) : (setTimeout(frame, 16) as unknown as number)
    return () => { alive = false; if (hasRaf) cancelAnimationFrame(raf); else clearTimeout(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, chart, difficulty, settle])

  const start = () => {
    if (status !== 'ready' || settled) return
    audio.current ??= makeAudio()
    try { void audio.current?.resume?.() } catch { /* ignore */ }
    run.current = newRun(chart)
    startAt.current = clock() + LEAD_IN_MS
    setStatus('playing')
  }

  const tap = useCallback((lane: number) => {
    if (status !== 'playing' || settled || lane >= chart.lanes) return
    setPressed(lane); setTimeout(() => setPressed(p => (p === lane ? null : p)), 110)
    const res = hitLane(run.current, chart, lane, songTime(), difficulty)
    run.current = res.state
    popKey.current++
    if (res.judgement) { setPop({ j: res.judgement, key: popKey.current }); playTone(audio.current, chart.notes[res.note].freq, cfg.voice ?? base.voice) }
    else playTone(audio.current, 0, cfg.voice ?? base.voice, true)
    const v = verdict(run.current, chart, difficulty)
    setFrame(f => f + 1)
    if (v) settle(v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, settled, chart, difficulty, settle])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const lane = (LANE_KEYS as readonly string[]).indexOf(e.key.toLowerCase())
      if (lane >= 0 && lane < chart.lanes) { e.preventDefault(); tap(lane) }
      else if ((e.key === ' ' || e.key === 'Enter') && status === 'ready') { e.preventDefault(); start() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tap, chart.lanes, status])

  const s = run.current
  const now = status === 'ready' ? -LEAD_IN_MS : songTime()
  const acc = accuracy(s, chart)
  const judgedCount = s.judged.filter(Boolean).length
  const playedAcc = judgedCount ? (s.perfect + 0.6 * s.good) / judgedCount : 1
  const phraseIdx = Math.max(0, chart.phrases.reduce((k, p, i) => (p.start - chart.travelMs <= now ? i : k), 0))
  const progress = Math.min(1, Math.max(0, now / chart.endMs))
  const L = chart.lanes
  const names = (cfg.laneNames ?? base.laneNames).slice(0, 5)
  const laneLabel = (i: number) => names[Math.min(names.length - 1, Math.round((i * (names.length - 1)) / Math.max(1, L - 1)))]

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-ink font-bold tabular-nums text-sm" aria-label="score">{s.score.toLocaleString()}</p>
          <p className={`text-[10px] ${s.miss ? 'text-red-600 font-bold' : 'text-muted'}`} aria-label="misses">✗ {s.miss} / {rules.maxMisses}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-muted">
        <span>Phrase <b className="text-ink">{phraseIdx + 1}</b>/{chart.phrases.length}</span>
        <span>♩ = <b className="text-ink">{chart.phrases[phraseIdx]?.bpm}</b></span>
        <div className="flex-1 h-1.5 bg-panel rounded-full overflow-hidden"><div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} /></div>
        <span className={`tabular-nums ${playedAcc >= rules.target ? 'text-emerald-700' : 'text-red-600'} font-bold`} aria-label="accuracy">{Math.round(playedAcc * 100)}%</span>
      </div>

      {/* Playfield over the performance space */}
      <div className="relative overflow-hidden rounded-xl border-2 border-ink-2" style={{ height: FIELD_H }}>
        <div className="absolute inset-0" style={artCover(cfg.art ?? base.art)} aria-hidden />
        <div className="absolute inset-0 bg-ink/70" aria-hidden />
        <div className="absolute inset-0 flex">
          {Array.from({ length: L }, (_, i) => (
            <div key={i} className={`flex-1 border-r border-paper/10 last:border-r-0 transition-colors ${pressed === i ? 'bg-paper/15' : ''}`} />
          ))}
        </div>
        {/* Hit line */}
        <div className="absolute inset-x-0 h-1 bg-accent/90 shadow-[0_0_12px] shadow-accent" style={{ top: HIT_Y - 2 }} aria-hidden />
        {/* Notes */}
        {status !== 'ready' && chart.notes.map((n, i) => {
          const dt = n.t - now
          if (dt > chart.travelMs || dt < -250) return null
          const j = s.judged[i]
          if (j === 'perfect' || j === 'good') return null
          const y = HIT_Y - (dt / chart.travelMs) * HIT_Y
          return (
            <div key={i} data-testid="note"
              className={`absolute h-5 rounded-full border-2 border-paper/80 shadow-lg ${LANE_COLORS[n.lane]} ${LANE_GLOW[n.lane]} ${j === 'miss' ? 'opacity-30' : ''}`}
              style={{ left: `calc(${(n.lane / L) * 100}% + 6px)`, width: `calc(${100 / L}% - 12px)`, top: y - 10 }} />
          )
        })}
        {/* Judgement and combo */}
        {pop && status !== 'ready' && (
          <div key={pop.key} className="absolute inset-x-0 top-[38%] text-center pointer-events-none animate-pulse">
            <p className={`text-2xl font-black tracking-wide drop-shadow ${pop.j === 'perfect' ? 'text-amber-300' : pop.j === 'good' ? 'text-sky-300' : 'text-red-400'}`}>
              {pop.j === 'perfect' ? 'PERFECT' : pop.j === 'good' ? 'GOOD' : 'MISS'}
            </p>
            {s.combo >= 3 && <p className="text-paper text-sm font-bold">{s.combo} combo{multiplier(s.combo) > 1 ? ` · ×${multiplier(s.combo)}` : ''}</p>}
          </div>
        )}
        {status === 'ready' && !settled && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-paper text-sm leading-relaxed">
              {chart.notes.length} notes · {chart.phrases.length} phrases · tempo rising<br />
              Hit <b>{Math.round(rules.target * 100)}%</b> accuracy; no more than {rules.maxMisses - 1} misses.
            </p>
            <button onClick={start} className="px-6 h-12 rounded-full bg-accent text-accent-fg font-bold text-sm shadow-lg active:scale-95">Strike up ♪</button>
          </div>
        )}
      </div>

      {/* Lane pads */}
      <div className="flex gap-1.5">
        {Array.from({ length: L }, (_, i) => (
          <button key={i} aria-label={`lane ${i + 1}`} disabled={settled}
            onPointerDown={e => { e.preventDefault(); tap(i) }}
            className={`flex-1 h-16 rounded-xl border-2 flex flex-col items-center justify-center transition-all duration-75 touch-none
              ${pressed === i ? `${LANE_COLORS[i]} border-paper text-paper scale-95` : 'bg-panel border-line text-ink'}`}>
            <span className="text-xs font-bold leading-tight">{laneLabel(i)}</span>
            <span className="text-[9px] uppercase opacity-60 hidden sm:block">{LANE_KEYS[i]}</span>
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted">
        <span>Perfect <b className="text-ink">{s.perfect}</b> · Good <b className="text-ink">{s.good}</b> · Best combo <b className="text-ink">{s.maxCombo}</b></span>
        <span>Goal {Math.round(rules.target * 100)}% (now {Math.round(acc * 100)}% of song)</span>
      </div>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Bravo — encore!" loseTitle="The performance fell apart" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
