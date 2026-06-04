import { useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface MathQ { a: number; op: '+' | '-'; b: number }

interface ChimpConfig {
  title: string
  chimpName: string
  chimpEmoji: string
  questions: MathQ[]
  fact: string
}

// ── Configs ────────────────────────────────────────────────────────────────────

const CONFIGS: Record<string, ChimpConfig> = {
  'nim-learns': {
    title: "Teaching Nim",
    chimpName: 'Nim', chimpEmoji: '🐒',
    questions: [
      { a: 2, op: '+', b: 3 },
      { a: 4, op: '+', b: 1 },
      { a: 6, op: '-', b: 2 },
      { a: 3, op: '+', b: 4 },
      { a: 8, op: '-', b: 3 },
    ],
    fact: "Nim Chimpsky was raised by humans in the 1970s as part of Project Nim. Researchers taught him sign language and found he could grasp basic concepts like 'more' and 'less'. The experiment raised profound questions about the boundaries of human and animal cognition.",
  },
  'kanzi-counts': {
    title: "Kanzi's Math Lesson",
    chimpName: 'Kanzi', chimpEmoji: '🦧',
    questions: [
      { a: 3, op: '+', b: 5 },
      { a: 7, op: '-', b: 4 },
      { a: 2, op: '+', b: 6 },
      { a: 9, op: '-', b: 5 },
      { a: 4, op: '+', b: 4 },
    ],
    fact: "Kanzi the bonobo could understand spoken English and communicate using a lexigram keyboard. Studies found he could add small numbers when motivated by food rewards — demonstrating numerical cognition previously thought unique to humans.",
  },
  'jane-goodall-chimps': {
    title: "Jane's Forest Classroom",
    chimpName: 'David', chimpEmoji: '🐒',
    questions: [
      { a: 1, op: '+', b: 4 },
      { a: 5, op: '+', b: 3 },
      { a: 7, op: '-', b: 3 },
      { a: 2, op: '+', b: 7 },
      { a: 6, op: '-', b: 1 },
    ],
    fact: "Jane Goodall's groundbreaking research at Gombe Stream showed that chimpanzees make and use tools, have complex social bonds, and experience emotions. Her work — begun in 1960 — forever changed our understanding of the boundary between humans and other animals.",
  },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getAnswer(q: MathQ): number {
  return q.op === '+' ? q.a + q.b : q.a - q.b
}

function makeChoices(correct: number): number[] {
  const pool = new Set<number>([correct])
  const diffs = [2, 1, 3, 4]
  for (const d of diffs) {
    const hi = correct + d
    const lo = correct - d
    if (hi <= 12 && !pool.has(hi)) pool.add(hi)
    if (lo > 0  && !pool.has(lo)) pool.add(lo)
    if (pool.size >= 4) break
  }
  let v = 1
  while (pool.size < 4) { if (!pool.has(v)) pool.add(v); v++ }
  const arr = Array.from(pool).slice(0, 4)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ChimpMathGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const cfg = CONFIGS[configId] ?? CONFIGS['jane-goodall-chimps']

  const [qi, setQi] = useState(0)
  const [score, setScore] = useState(0)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [phase, setPhase] = useState<'quiz' | 'done'>('quiz')
  const [choices] = useState(() => cfg.questions.map(q => makeChoices(getAnswer(q))))

  const q = cfg.questions[qi]
  const answer = q ? getAnswer(q) : 0
  const qChoices = choices[qi] ?? []

  function pick(val: number) {
    if (feedback !== null || !q) return
    const correct = val === answer
    setFeedback(correct ? 'correct' : 'wrong')
    if (correct) setScore(s => s + 1)
    setTimeout(() => {
      setFeedback(null)
      const next = qi + 1
      if (next >= cfg.questions.length) setPhase('done')
      else setQi(next)
    }, 900)
  }

  function restart() {
    setQi(0); setScore(0); setFeedback(null); setPhase('quiz')
  }

  if (phase === 'done') {
    const pass = score >= Math.ceil(cfg.questions.length * 0.6)
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center">
        <div className="text-5xl">{pass ? `${cfg.chimpEmoji}🎉` : `${cfg.chimpEmoji}😔`}</div>
        <div className={`text-xl font-bold ${pass ? 'text-amber-400' : 'text-slate-400'}`}>
          {pass ? `${cfg.chimpName} learned it!` : 'Keep practicing!'}
        </div>
        <div className="text-sm text-slate-400">{score}/{cfg.questions.length} correct</div>
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

  return (
    <div className="flex flex-col items-center gap-4 p-4 max-w-xs mx-auto">
      {/* Progress dots */}
      <div className="flex gap-1.5">
        {cfg.questions.map((_, i) => (
          <div key={i} className={`w-6 h-1.5 rounded-full transition-all ${
            i < qi ? 'bg-green-500' : i === qi ? 'bg-amber-400' : 'bg-slate-600'
          }`} />
        ))}
      </div>

      {/* Chimp + speech bubble */}
      <div className="flex items-end gap-3 mt-2">
        <div className="text-7xl select-none">{cfg.chimpEmoji}</div>
        <div className="relative bg-slate-700 border border-slate-500 rounded-2xl rounded-bl-none px-5 py-3 text-center">
          <div className="text-xs text-slate-400 mb-1">Feed {cfg.chimpName} the right number of bananas!</div>
          <div className="text-2xl font-mono font-bold text-white tracking-widest">
            {q.a} {q.op === '+' ? '➕' : '➖'} {q.b} ＝ ?
          </div>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`text-sm font-semibold ${feedback === 'correct' ? 'text-green-400' : 'text-red-400'}`}>
          {feedback === 'correct' ? `🎉 ${cfg.chimpName} got a banana!` : `❌ Answer is ${answer}`}
        </div>
      )}

      {/* Answer choices */}
      <div className="grid grid-cols-2 gap-2 w-full">
        {qChoices.map(c => {
          const isCorrect = c === answer
          const chosen = feedback !== null
          return (
            <button
              key={c}
              onClick={() => pick(c)}
              disabled={chosen}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all active:scale-95 ${
                chosen && isCorrect  ? 'border-green-500 bg-green-900/30' :
                chosen && !isCorrect ? 'border-slate-700 opacity-40' :
                'border-slate-600 bg-slate-700 hover:bg-slate-600 hover:border-amber-400'
              }`}
            >
              <div className="text-2xl font-bold font-mono text-white">{c}</div>
              <div className="text-base leading-none">
                {'🍌'.repeat(Math.min(c, 9))}{c > 9 ? '+' : ''}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
