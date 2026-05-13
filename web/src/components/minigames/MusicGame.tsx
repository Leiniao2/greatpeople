import { useState, useMemo, useRef, useCallback } from 'react'

interface MusicConfig {
  title: string
  question: string
  notes: string[]       // correct sequence
  noteLabels?: string[] // display labels (default: same as notes)
  fact: string
}

const NOTE_COLORS: Record<string, string> = {
  C: 'from-red-500 to-red-600',
  D: 'from-orange-500 to-orange-600',
  E: 'from-yellow-500 to-yellow-600',
  F: 'from-green-500 to-green-600',
  G: 'from-cyan-500 to-cyan-600',
  A: 'from-blue-500 to-blue-600',
  B: 'from-violet-500 to-violet-600',
}

const NOTE_HEIGHTS: Record<string, number> = {
  C: 64, D: 58, E: 52, F: 46, G: 40, A: 34, B: 28,
}

// Base frequencies (octave 4)
const NOTE_FREQ: Record<string, number> = {
  C: 261.63, D: 293.66, E: 329.63, Eb: 311.13,
  F: 349.23, G: 392.00, A: 440.00, B: 493.88,
}

function getNoteColor(note: string) {
  const base = note.replace(/[^A-G]/g, '')
  return NOTE_COLORS[base] ?? 'from-slate-500 to-slate-600'
}
function getNoteHeight(note: string) {
  const base = note.replace(/[^A-G]/g, '')
  return NOTE_HEIGHTS[base] ?? 48
}

// Parse note name to frequency; label with trailing ' means one octave up
function getFreq(note: string, label: string): number {
  // note may be 'C', 'Eb', 'G', etc. — look up directly, fall back to stripping accidentals
  let freq = NOTE_FREQ[note] ?? NOTE_FREQ[note.replace(/[^A-G]/g, '')] ?? 261.63
  if (label.endsWith("'")) freq *= 2
  return freq
}

const CONFIGS: Record<string, MusicConfig> = {
  'c-major-scale': {
    title: 'C Major Scale',
    question: 'Arrange these notes in ascending pitch to play the C major scale:',
    notes: ['C', 'D', 'E', 'F', 'G'],
    fact: 'The C major scale is the foundation of Western music. Linnaeus described nature with the same systematic clarity that a musical scale organises sound.',
  },
  'beethoven-opening': {
    title: "Beethoven's Fifth",
    question: 'Arrange these notes to recreate the famous opening of Beethoven\'s 5th Symphony:',
    notes: ['G', 'G', 'G', 'Eb'],
    noteLabels: ['G¹', 'G²', 'G³', 'Eb'],
    fact: '"Da-da-da-DUM" — three Gs descending to an Eb. Brahms studied Beethoven obsessively before finding his own voice.',
  },
  'pentatonic': {
    title: 'Pentatonic Scale',
    question: 'Order these notes of the pentatonic scale from lowest to highest pitch:',
    notes: ['C', 'D', 'E', 'G', 'A'],
    fact: 'The pentatonic scale appears in folk music worldwide — from Chinese traditional music to Scottish bagpipes. Mulan\'s era would have known it well.',
  },
  'brahms-lullaby': {
    title: "Brahms' Lullaby",
    question: 'Arrange the first 5 notes of Brahms\' famous Lullaby in order:',
    notes: ['G', 'E', 'G', 'E', 'A'],
    noteLabels: ['G¹', 'E¹', 'G²', 'E²', 'A'],
    fact: '"Lullaby, and Good Night" — Op. 49 No. 4. Brahms composed it for a friend\'s newborn in 1868, and it became one of the most recognised melodies in the world.',
  },
  'clara-schumann': {
    title: 'Romantic Melody',
    question: 'Arrange these notes to form a rising romantic phrase in the style of Clara Schumann:',
    notes: ['C', 'E', 'G', 'B', 'C'],
    noteLabels: ['C', 'E', 'G', 'B', 'C\''],
    fact: 'Clara Schumann\'s compositions often featured rich harmonic progressions. This rising figure (C E G B C) outlines a Cmaj7 chord — a hallmark of Romantic harmony.',
  },
  'moonwalk-rhythm': {
    title: 'Pop Melody',
    question: 'Arrange these notes to recreate the opening phrase of "Billie Jean" (in solfège):',
    notes: ['E', 'F', 'A', 'B'],
    fact: 'Michael Jackson\'s melodies often moved in stepwise motion (E→F) with a skip (A→B). Pop melody writing balances steps and leaps for memorability.',
  },
  'gregorian-chant': {
    title: 'Medieval Chant',
    question: 'Arrange these notes of a Gregorian chant phrase from low to high:',
    notes: ['D', 'E', 'F', 'G', 'A'],
    fact: 'Gregorian chant used the church modes rather than major/minor scales. The Dorian mode (D E F G A B C D) was especially beloved for its solemn beauty.',
  },
  'pentatonic-descend': {
    title: 'Descending Melody',
    question: 'Arrange these notes from highest to lowest pitch to form a descending phrase:',
    notes: ['G', 'E', 'D', 'C'],
    fact: 'Descending melodic lines often convey resolution or calm. The Li Qingzhao poem set to music would frequently fall in pitch at the end of phrases.',
  },
  'moon-river': {
    title: 'Moon River',
    question: "Arrange the opening notes of 'Moon River' — the song Audrey Hepburn sang in Breakfast at Tiffany's:",
    notes: ['C', 'A', 'F', 'A', 'C'],
    noteLabels: ['C', 'A¹', 'F', 'A²', 'C\''],
    fact: "'Moon River' (1961, Henry Mancini / Johnny Mercer) won the Academy Award for Best Original Song. Hepburn reportedly wept when the studio executives wanted to cut it from the film.",
  },
  'jazz-nocturne': {
    title: 'Jazz Nocturne',
    question: "The Jazz Age inspired Chanel's Paris salon. Arrange these notes of a 1920s jazz phrase:",
    notes: ['E', 'G', 'B', 'D'],
    fact: "Coco Chanel's salon on Rue Cambon became the meeting point of Paris jazz culture and fashion. Duke Ellington and Josephine Baker performed in venues steps away from her atelier.",
  },
  'venetian-madrigal': {
    title: 'Venetian Madrigal',
    question: "Titian's Venice was famous for its madrigals. Arrange these notes of a Renaissance vocal phrase:",
    notes: ['D', 'F', 'A', 'C', 'D'],
    noteLabels: ['D', 'F', 'A', 'C', 'D\''],
    fact: "Adrian Willaert founded the Venetian school of polyphony at St Mark's Basilica in 1527 — the same decade Titian was at the height of his fame. Music and painting flourished together.",
  },
  'mani-hymn': {
    title: 'Hymn of Light',
    question: "Mani's followers sang hymns celebrating light conquering darkness. Arrange this ascending phrase:",
    notes: ['C', 'D', 'E', 'G', 'A'],
    fact: "Mani himself composed hymns and painted illustrated scriptures — among the earliest illustrated religious manuscripts. His Manichaean hymns spread from Persia to China along the Silk Road.",
  },
  'film-score': {
    title: 'Film Score Motif',
    question: "Eisenstein synchronised Prokofiev's music to film. Arrange these bold orchestral notes in order:",
    notes: ['E', 'G', 'A', 'B', 'E'],
    noteLabels: ['E', 'G', 'A', 'B', 'E\''],
    fact: "In Alexander Nevsky (1938), Eisenstein and Prokofiev rehearsed together — sometimes Eisenstein edited the film to match the music, sometimes Prokofiev rewrote the music to fit the cut. It was the first true film-music collaboration.",
  },
  'war-march': {
    title: 'March of Industry',
    question: "The Gilded Age moved to the rhythm of industry. Arrange these bold ascending march notes:",
    notes: ['C', 'E', 'G', 'C'],
    noteLabels: ['C', 'E', 'G', 'C\''],
    fact: "The Gilded Age (1870s–1900s) was powered by steel mills, railways, and telegraph wires — each with its own mechanical rhythm. Carnegie's steel works ran 24 hours a day, the sound of hammers never stopping.",
  },
  'thriller-riff': {
    title: 'Pop Bass Riff',
    question: "Michael Jackson's 'Thriller' opens with a memorable bass riff. Arrange these four notes:",
    notes: ['E', 'D', 'C', 'B'],
    fact: "'Thriller' (1982) is the best-selling album in history. Its bass riff, played by Louis Johnson, uses a simple descending pattern — E D C B — that anchors one of the most recognisable songs ever recorded.",
  },
  'digital-pulse': {
    title: 'Digital Sequence',
    question: "Binary code underlies all digital music. Arrange these notes in the pattern of a digital signal:",
    notes: ['C', 'C', 'G', 'E'],
    noteLabels: ['C¹', 'C²', 'G', 'E'],
    fact: "Digital audio samples sound waves at 44,100 times per second (CD quality) — each sample represented as a binary number. Turing's theoretical machine, designed for logic, became the engine of all modern music production.",
  },
  'global-anthem': {
    title: 'World Melody',
    question: "McLuhan's global village is united by shared music. Arrange this universal five-note phrase:",
    notes: ['C', 'D', 'E', 'G', 'C'],
    noteLabels: ['C', 'D', 'E', 'G', 'C\''],
    fact: "The pentatonic scale appears in every musical tradition — African, Asian, European, and Indigenous American. McLuhan argued that electronic media would create a new global oral culture, and music has indeed crossed every border.",
  },
  'eco-hymn': {
    title: 'Earth Song',
    question: "Climate activists sing for the planet. Arrange this solemn descending phrase — a lament for the Earth:",
    notes: ['A', 'G', 'E', 'D', 'C'],
    fact: "Music has always accompanied social movements — from spirituals to protest songs. The climate movement has produced anthems from Michael Jackson's 'Earth Song' to Greta Thunberg's school strike chants, uniting generations around a shared alarm.",
  },
  'space-theme': {
    title: 'Space Odyssey',
    question: "Arrange the ascending fanfare that heralded humanity's arrival on the Moon:",
    notes: ['C', 'G', 'C', 'E', 'G'],
    noteLabels: ['C', 'G', 'C\'', 'E', 'G\''],
    fact: "NASA's Apollo missions inspired a generation of composers. Also Sprach Zarathustra (Strauss, 1896) became the sonic symbol of the space age when Kubrick used it in 2001: A Space Odyssey (1968) — one year before the Moon landing.",
  },
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function MusicGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId] ?? CONFIGS['c-major-scale']
  const labels = config.noteLabels ?? config.notes

  const indexedCorrect = useMemo(() =>
    config.notes.map((n, i) => ({ note: n, label: labels[i], idx: i })),
    [config.notes, labels]
  )

  const shuffled = useMemo(() => shuffle(indexedCorrect), [indexedCorrect])

  const [chosen, setChosen] = useState<typeof indexedCorrect>([])
  const [submitted, setSubmitted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  const audioCtxRef = useRef<AudioContext | null>(null)

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    return audioCtxRef.current
  }, [])

  const playTone = useCallback((freq: number, startTime: number, duration = 0.4) => {
    const ctx = getAudioCtx()

    // Primary sine oscillator
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = freq

    // Harmonic overtone for richer, piano-like tone
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.type = 'sine'
    osc2.frequency.value = freq * 2
    gain2.gain.setValueAtTime(0.15, startTime)
    gain2.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

    // Attack → sustain → release envelope
    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(0.5, startTime + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.25, startTime + 0.08)
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

    osc.start(startTime)
    osc.stop(startTime + duration + 0.05)
    osc2.start(startTime)
    osc2.stop(startTime + duration + 0.05)
  }, [getAudioCtx])

  const playNote = useCallback((note: string, label: string) => {
    const freq = getFreq(note, label)
    const ctx = getAudioCtx()
    playTone(freq, ctx.currentTime)
  }, [playTone, getAudioCtx])

  const playSequence = useCallback((
    items: Array<{ note: string; label: string }>,
    onDone?: () => void
  ) => {
    const ctx = getAudioCtx()
    const spacing = 0.45
    const duration = 0.4
    const start = ctx.currentTime + 0.05

    items.forEach((item, i) => {
      const freq = getFreq(item.note, item.label)
      playTone(freq, start + i * spacing, duration)
    })

    const totalMs = (items.length * spacing + duration) * 1000
    if (onDone) setTimeout(onDone, totalMs)
  }, [playTone, getAudioCtx])

  const remaining = shuffled.filter(n => !chosen.some(c => c.idx === n.idx))

  const select = (item: (typeof indexedCorrect)[number]) => {
    if (submitted || isPlaying) return
    playNote(item.note, item.label)
    setChosen(prev => [...prev, item])
  }

  const remove = (idx: number) => {
    if (submitted || isPlaying) return
    const item = chosen.find(c => c.idx === idx)
    if (item) playNote(item.note, item.label)
    setChosen(prev => prev.filter(c => c.idx !== idx))
  }

  const allPicked = chosen.length === indexedCorrect.length

  const isCorrect = submitted && chosen.every((c, i) => c.idx === indexedCorrect[i].idx)

  const handlePlayAndCheck = () => {
    if (isPlaying) return
    setIsPlaying(true)
    playSequence(chosen, () => {
      const correct = chosen.every((c, i) => c.idx === indexedCorrect[i].idx)
      setSubmitted(true)
      setIsPlaying(false)
      if (correct) setTimeout(onWin, 800)
    })
  }

  const handleHearAnswer = () => {
    if (isPlaying) return
    setIsPlaying(true)
    playSequence(indexedCorrect, () => setIsPlaying(false))
  }

  return (
    <div className="flex flex-col gap-4 bg-slate-950 rounded-xl p-3">
      <p className="text-amber-400/80 text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
      <p className="text-white text-sm font-medium leading-snug">{config.question}</p>

      {/* Mini staff + chosen notes */}
      <div className="rounded-xl bg-slate-900 border border-white/[0.06] p-3">
        <p className="text-slate-500 text-[10px] mb-2">Your melody:</p>

        {/* Staff lines */}
        <div className="relative h-20 mb-3">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="absolute w-full h-px bg-slate-700" style={{ top: `${i * 14 + 8}px` }} />
          ))}
          {/* Chosen notes on staff */}
          <div className="absolute inset-0 flex items-center gap-3 px-2">
            {chosen.map((c, pos) => {
              const noteCorrect = submitted && c.idx === indexedCorrect[pos].idx
              const noteWrong = submitted && c.idx !== indexedCorrect[pos].idx
              const h = getNoteHeight(c.note)
              const color = getNoteColor(c.note)
              return (
                <button
                  key={c.idx}
                  onClick={() => remove(c.idx)}
                  disabled={submitted || isPlaying}
                  className={`relative w-9 rounded-full bg-gradient-to-b ${color} flex items-center justify-center shadow-lg transition-all
                    ${noteCorrect ? 'ring-2 ring-emerald-400' : noteWrong ? 'ring-2 ring-red-400' : 'hover:scale-110'}
                  `}
                  style={{ height: '28px', marginTop: `${h - 14}px`, flexShrink: 0 }}
                >
                  <span className="text-white text-[10px] font-bold">{c.label}</span>
                </button>
              )
            })}
            {chosen.length === 0 && (
              <span className="text-slate-600 text-xs italic">tap notes below to arrange…</span>
            )}
          </div>
        </div>

        {/* Note count */}
        <p className="text-slate-600 text-[10px]">
          {chosen.length} / {indexedCorrect.length} notes placed
        </p>
      </div>

      {/* Available notes */}
      <div className="flex flex-wrap gap-2 justify-center">
        {remaining.map(item => (
          <button
            key={item.idx}
            onClick={() => select(item)}
            disabled={submitted || isPlaying}
            className={`w-12 h-12 rounded-xl bg-gradient-to-b ${getNoteColor(item.note)} text-white font-bold text-sm shadow-md hover:scale-105 active:scale-95 transition-all`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {allPicked && !submitted && (
        <button
          onClick={handlePlayAndCheck}
          disabled={isPlaying}
          className="py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-all disabled:opacity-60"
        >
          {isPlaying ? '♪ Playing…' : 'Play Melody →'}
        </button>
      )}

      {submitted && (
        <div className={`p-3 rounded-xl border text-xs leading-relaxed ${
          isCorrect
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          <span className="font-bold mr-1">
            {isCorrect ? '✓ Perfect melody!' : '✗ Not quite —'}
          </span>
          {config.fact}
        </div>
      )}

      {submitted && !isCorrect && (
        <div className="flex gap-2">
          <button
            onClick={handleHearAnswer}
            disabled={isPlaying}
            className="flex-1 py-2 rounded-xl border border-amber-700/50 text-amber-400 text-xs hover:border-amber-600 transition-all disabled:opacity-50"
          >
            {isPlaying ? '♪ Playing…' : 'Hear Answer ▶'}
          </button>
          <button
            onClick={() => { setChosen([]); setSubmitted(false) }}
            disabled={isPlaying}
            className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-400 text-xs hover:border-slate-600 transition-all disabled:opacity-50"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
