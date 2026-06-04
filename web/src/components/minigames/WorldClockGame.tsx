import { useState, useMemo } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CityDef { name: string; emoji: string; offset: number }
interface ClockQSpec { fromKey: string; fromHour: number; toKey: string }

interface ClockConfig {
  title: string
  questions: ClockQSpec[]
  fact: string
}

// ── City data (fixed UTC offsets, no DST) ──────────────────────────────────────

const CITIES: Record<string, CityDef> = {
  'los-angeles': { name: 'Los Angeles', emoji: '🎬', offset: -8 },
  'new-york':    { name: 'New York',    emoji: '🗽', offset: -5 },
  'sao-paulo':   { name: 'São Paulo',   emoji: '🌴', offset: -3 },
  'london':      { name: 'London',      emoji: '🎡', offset:  0 },
  'paris':       { name: 'Paris',       emoji: '🗼', offset:  1 },
  'cairo':       { name: 'Cairo',       emoji: '🏺', offset:  2 },
  'nairobi':     { name: 'Nairobi',     emoji: '🦒', offset:  3 },
  'dubai':       { name: 'Dubai',       emoji: '🏙️', offset:  4 },
  'bangkok':     { name: 'Bangkok',     emoji: '🛕', offset:  7 },
  'beijing':     { name: 'Beijing',     emoji: '🏯', offset:  8 },
  'tokyo':       { name: 'Tokyo',       emoji: '🗾', offset:  9 },
  'sydney':      { name: 'Sydney',      emoji: '🦘', offset: 10 },
}

// ── Configs ────────────────────────────────────────────────────────────────────

const CONFIGS: Record<string, ClockConfig> = {
  'magellan-voyage': {
    title: "Magellan's World Tour",
    questions: [
      { fromKey: 'london',    fromHour: 10, toKey: 'tokyo'     },  // 7 PM
      { fromKey: 'new-york',  fromHour:  8, toKey: 'london'    },  // 1 PM
      { fromKey: 'paris',     fromHour: 15, toKey: 'cairo'     },  // 4 PM
      { fromKey: 'sao-paulo', fromHour: 12, toKey: 'nairobi'   },  // 6 PM
      { fromKey: 'bangkok',   fromHour: 11, toKey: 'paris'     },  // 5 AM
    ],
    fact: "Magellan's circumnavigation (1519–1522) proved the Earth was round and far larger than expected. The crew discovered that sailing west around the world gained them an extra day — the very phenomenon that makes time zones necessary.",
  },
  'telegraph-globe': {
    title: 'Telegraph Time Zones',
    questions: [
      { fromKey: 'london',      fromHour: 12, toKey: 'new-york'    },  // 7 AM
      { fromKey: 'paris',       fromHour: 15, toKey: 'cairo'       },  // 4 PM
      { fromKey: 'beijing',     fromHour: 20, toKey: 'london'      },  // 12 PM
      { fromKey: 'los-angeles', fromHour:  9, toKey: 'sao-paulo'   },  // 2 PM
      { fromKey: 'dubai',       fromHour: 18, toKey: 'bangkok'     },  // 9 PM
    ],
    fact: "The telegraph made the lack of standard time zones a practical crisis. Before railways, each town kept its own local time. In 1884, 25 nations agreed to divide the world into 24 hourly zones at the Washington Meridian Conference.",
  },
  'modern-traveler': {
    title: 'Modern World Traveler',
    questions: [
      { fromKey: 'new-york',  fromHour:  8, toKey: 'london'    },  // 1 PM
      { fromKey: 'london',    fromHour: 14, toKey: 'tokyo'     },  // 11 PM
      { fromKey: 'tokyo',     fromHour: 23, toKey: 'new-york'  },  // 9 AM
      { fromKey: 'paris',     fromHour: 10, toKey: 'dubai'     },  // 1 PM
      { fromKey: 'sydney',    fromHour: 20, toKey: 'beijing'   },  // 6 PM
    ],
    fact: "Jet lag occurs because crossing time zones disrupts the body's circadian rhythm. Travelling east is harder than west because it requires advancing your internal clock — the same reason it's easier to stay up late than to fall asleep early.",
  },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function convert(fromHour: number, fromOffset: number, toOffset: number): number {
  return ((fromHour - fromOffset + toOffset) % 24 + 24) % 24
}

function formatHour(h: number): string {
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:00 ${ampm}`
}

function genChoices(correct: number, count = 4): number[] {
  const pool = new Set<number>([correct])
  const diffs = [2, 4, 6, 3, 1, 5, 7, 8]
  for (const d of diffs) {
    if (pool.size >= count) break
    const a = (correct + d) % 24
    const b = ((correct - d) % 24 + 24) % 24
    if (a !== correct) pool.add(a)
    if (pool.size < count && b !== correct) pool.add(b)
  }
  const arr = Array.from(pool).slice(0, count)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function WorldClockGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const cfg = CONFIGS[configId] ?? CONFIGS['magellan-voyage']

  const questions = useMemo(() => cfg.questions.map(spec => {
    const from = CITIES[spec.fromKey]
    const to   = CITIES[spec.toKey]
    const correctHour = convert(spec.fromHour, from.offset, to.offset)
    const choices = genChoices(correctHour)
    return { from, fromHour: spec.fromHour, to, correctHour, choices }
  }), [cfg])

  const [qi, setQi] = useState(0)
  const [score, setScore] = useState(0)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [phase, setPhase] = useState<'quiz' | 'done'>('quiz')

  const q = questions[qi]

  function pick(hour: number) {
    if (feedback !== null || !q) return
    const correct = hour === q.correctHour
    setFeedback(correct ? 'correct' : 'wrong')
    if (correct) setScore(s => s + 1)
    setTimeout(() => {
      setFeedback(null)
      const next = qi + 1
      if (next >= questions.length) setPhase('done')
      else setQi(next)
    }, 1000)
  }

  function restart() { setQi(0); setScore(0); setFeedback(null); setPhase('quiz') }

  if (phase === 'done') {
    const pass = score >= Math.ceil(questions.length * 0.6)
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center">
        <div className="text-5xl">{pass ? '🌍✈️' : '🕐😕'}</div>
        <div className={`text-xl font-bold ${pass ? 'text-amber-400' : 'text-slate-400'}`}>
          {pass ? 'World Traveler!' : 'Keep practicing!'}
        </div>
        <div className="text-sm text-slate-400">{score}/{questions.length} correct</div>
        {pass
          ? <>
              <p className="text-sm text-slate-300 max-w-xs leading-relaxed">{cfg.fact}</p>
              <button onClick={onWin} className="px-6 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-semibold text-slate-900">Complete</button>
            </>
          : <button onClick={restart} className="px-6 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg font-semibold text-white">Try Again</button>
        }
      </div>
    )
  }

  if (!q) return null

  return (
    <div className="flex flex-col items-center gap-4 p-4 max-w-xs mx-auto">
      {/* Progress */}
      <div className="flex gap-1.5">
        {questions.map((_, i) => (
          <div key={i} className={`w-6 h-1.5 rounded-full transition-all ${
            i < qi ? 'bg-green-500' : i === qi ? 'bg-amber-400' : 'bg-slate-600'
          }`} />
        ))}
      </div>

      {/* Source city clock */}
      <div className="w-full bg-slate-800 rounded-2xl p-4 text-center border border-slate-600">
        <div className="text-2xl mb-1">{q.from.emoji}</div>
        <div className="text-xs text-slate-400 uppercase tracking-widest mb-2">{q.from.name}</div>
        <div className="font-mono text-4xl font-bold text-amber-400 tracking-wider">
          {formatHour(q.fromHour)}
        </div>
      </div>

      {/* Question */}
      <div className="flex items-center gap-2 text-sm text-slate-300">
        <span className="text-xl">{q.to.emoji}</span>
        <span>What time is it in <span className="font-semibold text-white">{q.to.name}</span>?</span>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`text-sm font-semibold ${feedback === 'correct' ? 'text-green-400' : 'text-red-400'}`}>
          {feedback === 'correct' ? '✓ Correct!' : `✗ It's ${formatHour(q.correctHour)}`}
        </div>
      )}

      {/* Choices */}
      <div className="grid grid-cols-2 gap-2 w-full">
        {q.choices.map(h => {
          const isCorrect = h === q.correctHour
          const chosen = feedback !== null
          return (
            <button
              key={h}
              onClick={() => pick(h)}
              disabled={chosen}
              className={`py-3 rounded-xl border font-mono text-lg font-semibold transition-all active:scale-95 ${
                chosen && isCorrect  ? 'border-green-500 bg-green-900/30 text-green-300' :
                chosen && !isCorrect ? 'border-slate-700 opacity-40 text-slate-400' :
                'border-slate-600 bg-slate-700 hover:bg-slate-600 hover:border-amber-400 text-white'
              }`}
            >
              {formatHour(h)}
            </button>
          )
        })}
      </div>

      <div className="text-xs text-slate-500">Question {qi + 1} of {questions.length}</div>
    </div>
  )
}
