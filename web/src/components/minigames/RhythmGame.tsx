import { useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps } from '@/games/types'
import { mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Rhythm: a phrase is played on a row of pads; play it back.  Each round
// adds a note and the tempo rises.  Difficulty sets how many rounds to
// survive, how many pads, how many misses are allowed, and whether the
// pads light up during playback at all (tier 4 is by ear).

interface RhythmConfig {
  title: string
  intro: string
  /** Pad labels (notes or drum voices). */
  pads: string[]
  /** Frequencies in Hz for the pads, if they should sound. */
  tones?: number[]
  fact: string
}

export const CONFIGS: Record<string, RhythmConfig> = {
  'bach-fugue': {
    title: 'The Well-Tempered Subject',
    intro: 'Bach states a fugue subject; the other voices must answer it exactly. Play back each phrase as it grows.',
    pads: ['C', 'D', 'E', 'F', 'G', 'A'],
    tones: [261.6, 293.7, 329.6, 349.2, 392.0, 440.0],
    fact: "Bach's Well-Tempered Clavier (1722 and 1742) gave a prelude and fugue in every one of the 24 keys, a feat only possible with the new well-tempered tuning. Beethoven learned it as a boy and called it his musical bible.",
  },
  'beethoven-motif': {
    title: 'Fate Knocks',
    intro: 'Four notes open the Fifth Symphony and never leave it. Match each phrase, even as Beethoven speeds up.',
    pads: ['G', 'E♭', 'F', 'D', 'C'],
    tones: [392.0, 311.1, 349.2, 293.7, 261.6],
    fact: 'Beethoven was almost completely deaf when he conducted the premiere of the Fifth Symphony in December 1808, in a freezing Vienna theatre, in a concert that ran over four hours.',
  },
  'court-drums': {
    title: 'The Court Orchestra',
    intro: 'A Tang court ensemble answers the lead drum. Copy the pattern on the drums and bells before the dancers lose the beat.',
    pads: ['Dà gǔ', 'Xiǎo gǔ', 'Zhōng', 'Bó', 'Mù yú'],
    tones: [110, 165, 523.3, 659.3, 880],
    fact: "The Tang court's Ten Divisions of Music drew ensembles from across Asia — Kucha, Samarkand, India, Korea — and the 8th-century repertoire survives in Japan's gagaku, the oldest continuously performed orchestral music in the world.",
  },
  'hildegard-chant': {
    title: 'Symphonia',
    intro: "Hildegard of Bingen's chants leap further than any of her century. Sing back each phrase of the antiphon.",
    pads: ['D', 'E', 'F', 'G', 'A', 'C'],
    tones: [293.7, 329.6, 349.2, 392.0, 440.0, 523.3],
    fact: 'Hildegard of Bingen (1098–1179) composed some 77 chants and the earliest surviving morality play, wrote on medicine and natural history, invented a private language, and was made a Doctor of the Church in 2012.',
  },
}

export default function RhythmGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'bach-fugue')
  const rounds = scale(difficulty, [4, 6, 7, 8])
  const padCount = Math.min(cfg.pads.length, scale(difficulty, [4, 5, 6, 6]))
  const maxMisses = scale(difficulty, [3, 2, 2, 1])
  const showLights = difficulty < 4
  const baseMs = scale(difficulty, [600, 520, 440, 380])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })

  const sequence = useMemo(() => {
    const rng = mulberry32(seed)
    return Array.from({ length: rounds + 2 }, () => Math.floor(rng() * padCount))
  }, [seed, rounds, padCount])

  const [round, setRound] = useState(1)       // phrase length this round
  const [phase, setPhase] = useState<'listen' | 'play' | 'between'>('listen')
  const [lit, setLit] = useState<number | null>(null)
  const [pos, setPos] = useState(0)
  const [misses, setMisses] = useState(0)
  const audio = useRef<AudioContext | null>(null)

  const beep = (i: number) => {
    if (!cfg.tones) return
    try {
      audio.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const ctx = audio.current
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.frequency.value = cfg.tones[i]; osc.type = 'sine'
      gain.gain.setValueAtTime(0.12, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
      osc.connect(gain).connect(ctx.destination)
      osc.start(); osc.stop(ctx.currentTime + 0.25)
    } catch { /* no audio in this environment */ }
  }

  // Play back the phrase for the current round.
  useEffect(() => {
    if (phase !== 'listen' || settled) return
    const tempo = Math.max(220, baseMs - (round - 1) * 30)
    const timers: ReturnType<typeof setTimeout>[] = []
    sequence.slice(0, round).forEach((pad, i) => {
      timers.push(setTimeout(() => { if (showLights) setLit(pad); beep(pad) }, 400 + i * tempo))
      timers.push(setTimeout(() => setLit(null), 400 + i * tempo + tempo * 0.6))
    })
    timers.push(setTimeout(() => { setPhase('play'); setPos(0) }, 400 + round * tempo + 200))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round, settled])

  const tap = (i: number) => {
    if (phase !== 'play' || settled) return
    beep(i)
    setLit(i); setTimeout(() => setLit(null), 150)
    if (i === sequence[pos]) {
      const next = pos + 1
      if (next >= round) {
        if (round >= rounds) { win(); return }
        setPhase('between')
        setTimeout(() => { setRound(r => r + 1); setPhase('listen') }, 700)
      } else setPos(next)
    } else {
      const m = misses + 1
      setMisses(m)
      if (m >= maxMisses) { lose('lost the thread'); return }
      setPhase('between')
      setTimeout(() => setPhase('listen'), 700)   // hear the same phrase again
    }
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <p className={`shrink-0 text-[10px] ${misses ? 'text-red-600 font-bold' : 'text-muted'}`}>✗ {misses} / {maxMisses}</p>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>Phrase <b className="text-ink">{round}</b> / {rounds} notes</span>
        <span className={phase === 'listen' ? 'text-accent font-bold animate-pulse' : phase === 'play' ? 'text-emerald-700 font-bold' : ''}>
          {settled ? '' : phase === 'listen' ? '♪ Listen…' : phase === 'play' ? `Your turn · ${pos} / ${round}` : '…'}
        </span>
      </div>

      <div className="flex justify-center gap-2 flex-wrap">
        {cfg.pads.slice(0, padCount).map((label, i) => (
          <button key={i} onPointerDown={() => tap(i)} disabled={settled}
            className={`w-14 h-16 rounded-xl border-2 font-bold text-sm transition-all duration-100
              ${lit === i ? 'bg-accent text-accent-fg border-accent scale-105 shadow-lg' : 'bg-panel border-line text-ink hover:border-accent/40'}
              ${phase !== 'play' ? 'cursor-default' : 'active:scale-95'}`}>
            {label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted/80 text-center">
        {showLights ? 'Watch and listen, then play the phrase back in order.' : 'By ear only at this height — the pads stay dark during playback.'}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Note-perfect!" loseTitle="The phrase was lost" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
