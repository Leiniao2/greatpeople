import { useState, useMemo } from 'react'
import type { MinigameProps } from '@/games/types'
import { scale } from './_shared'

interface CodeLine {
  id: string
  text: string
  /** Position in the solution; lines that share an order are interchangeable (e.g. two independent updates). */
  order: number
}

interface CodeChallenge {
  title: string
  description: string
  lines: CodeLine[]
}

interface Config {
  name: string
  challenges: CodeChallenge[]
}

export const CONFIGS: Record<string, Config> = {
  'turing-machine': {
    name: 'Turing Machine',
    challenges: [
      {
        title: 'Palindrome Recogniser',
        description: 'Arrange the steps so the machine correctly accepts palindromes and rejects non-palindromes.',
        lines: [
          { id: 'p1', text: 'left ← 0,  right ← length − 1', order: 0 },
          { id: 'p2', text: 'while left < right:', order: 1 },
          { id: 'p3', text: '  if tape[left] ≠ tape[right]:  REJECT', order: 2 },
          { id: 'p4', text: '  left ← left + 1', order: 3 },
          { id: 'p5', text: '  right ← right − 1', order: 3 },
          { id: 'p6', text: 'ACCEPT', order: 4 },
        ],
      },
      {
        title: 'Bracket Balancer',
        description: 'Order the steps to count nested brackets and decide if the string is balanced.',
        lines: [
          { id: 'b1', text: 'counter ← 0', order: 0 },
          { id: 'b2', text: 'for each char in input:', order: 1 },
          { id: 'b3', text: "  if char = '(':  counter ← counter + 1", order: 2 },
          { id: 'b4', text: "  if char = ')':  counter ← counter − 1", order: 2 },
          { id: 'b5', text: '  if counter < 0:  REJECT', order: 3 },
          { id: 'b6', text: 'if counter = 0:  ACCEPT', order: 4 },
          { id: 'b7', text: 'else:  REJECT', order: 5 },
        ],
      },
    ],
  },
  'jobs-code': {
    name: 'Programming Puzzles',
    challenges: [
      {
        title: 'FizzBuzz',
        description: 'The classic interview question: print Fizz, Buzz, or FizzBuzz at the right divisors.',
        lines: [
          { id: 'f1', text: 'for i from 1 to 100:', order: 0 },
          { id: 'f2', text: '  if i mod 15 = 0:  print "FizzBuzz"', order: 1 },
          { id: 'f3', text: '  else if i mod 3 = 0:  print "Fizz"', order: 2 },
          { id: 'f4', text: '  else if i mod 5 = 0:  print "Buzz"', order: 3 },
          { id: 'f5', text: '  else:  print i', order: 4 },
        ],
      },
      {
        title: 'App Launch Sequence',
        description: 'Put these startup steps in the right order for a smooth user experience.',
        lines: [
          { id: 'a1', text: 'User launches the app', order: 0 },
          { id: 'a2', text: 'Load saved user settings', order: 1 },
          { id: 'a3', text: 'if first_launch:  show onboarding screen', order: 2 },
          { id: 'a4', text: 'else:  restore previous session', order: 3 },
          { id: 'a5', text: 'Connect to server', order: 4 },
          { id: 'a6', text: 'if connected:  sync user data', order: 5 },
          { id: 'a7', text: 'Display home screen', order: 6 },
        ],
      },
    ],
  },
}

/** Indices of lines that sit in the wrong place; empty when the sequence is a valid ordering. */
export function wrongPositions(lines: CodeLine[], selectedIds: string[]): number[] {
  const orderById = Object.fromEntries(lines.map(l => [l.id, l.order]))
  const expected = lines.map(l => l.order).sort((a, b) => a - b)
  return selectedIds.reduce<number[]>((acc, id, i) => {
    if (orderById[id] !== expected[i]) acc.push(i)
    return acc
  }, [])
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function PseudoCodeGame({ configId, difficulty, onWin, onLose }: MinigameProps) {
  const maxAttempts = scale(difficulty, [3, 2, 2, 1])
  const [attempts, setAttempts] = useState(0)

  const cfg = CONFIGS[configId] ?? CONFIGS['turing-machine']

  const [challengeIdx, setChallengeIdx] = useState(0)
  const [selected,     setSelected]     = useState<string[]>([])
  const [checked,      setChecked]      = useState(false)
  const [wrongIdx,     setWrongIdx]     = useState<number[]>([])
  const [solved,       setSolved]       = useState<boolean[]>(() => new Array(cfg.challenges.length).fill(false))
  const [flash,        setFlash]        = useState<'correct' | 'wrong' | null>(null)

  const challenge = cfg.challenges[challengeIdx]
  const shuffled  = useMemo(() => shuffle(challenge.lines), [challenge])

  const lineById = Object.fromEntries(challenge.lines.map(l => [l.id, l]))
  const pool     = shuffled.filter(l => !selected.includes(l.id))
  const allPlaced = selected.length === challenge.lines.length

  function addLine(id: string) {
    setSelected(prev => [...prev, id])
    setChecked(false)
    setWrongIdx([])
    setFlash(null)
  }

  function removeLine(i: number) {
    setSelected(prev => { const a = [...prev]; a.splice(i, 1); return a })
    setChecked(false)
    setWrongIdx([])
    setFlash(null)
  }

  function reset() {
    setSelected([])
    setChecked(false)
    setWrongIdx([])
    setFlash(null)
  }

  function checkSolution() {
    setChecked(true)
    const wrong = wrongPositions(challenge.lines, selected)
    setWrongIdx(wrong)

    if (wrong.length === 0) {
      setFlash('correct')
      const newSolved = [...solved]
      newSolved[challengeIdx] = true
      setSolved(newSolved)

      if (challengeIdx + 1 >= cfg.challenges.length) {
        setTimeout(onWin, 1000)
      } else {
        setTimeout(() => {
          setChallengeIdx(c => c + 1)
          setSelected([])
          setChecked(false)
          setWrongIdx([])
          setFlash(null)
        }, 1200)
      }
    } else {
      setFlash('wrong')
      const n = attempts + 1
      setAttempts(n)
      if (n >= maxAttempts) setTimeout(() => onLose('wrong logic'), 800)
    }
  }

  return (
    <div className="flex flex-col h-full bg-panel text-ink select-none">

      {/* Header */}
      <div className="px-4 py-3 border-b border-line">
        <div className="flex items-center justify-between mb-0.5">
          <p className="text-xs text-cyan-400 font-semibold tracking-wide uppercase">{cfg.name}</p>
          <div className="flex gap-1.5">
            {cfg.challenges.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full transition-colors ${
                solved[i]          ? 'bg-emerald-500' :
                i === challengeIdx ? 'bg-cyan-500'    : 'bg-line'
              }`} />
            ))}
          </div>
        </div>
        <h2 className="text-sm font-bold text-ink">{challenge.title}</h2>
        <p className="text-[11px] text-muted mt-0.5 leading-relaxed">{challenge.description}</p>
      </div>

      {/* Sequence area */}
      <div className="px-4 pt-3 pb-2 border-b border-line">
        <p className="text-[10px] text-muted/80 uppercase tracking-widest mb-2">Your sequence</p>
        <div className="space-y-1.5">
          {selected.map((id, i) => (
            <button
              key={id}
              onClick={() => removeLine(i)}
              className={`w-full text-left px-3 py-2 rounded-lg font-mono text-xs transition-all active:scale-[0.98] ${
                checked && wrongIdx.includes(i)
                  ? 'bg-red-500/15 border border-red-500/50 text-red-300'
                  : checked
                  ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
                  : 'bg-panel-2 border border-line text-ink-2 hover:border-line-2'
              }`}
            >
              <span className="text-muted/80 mr-2 select-none">{i + 1}.</span>
              {lineById[id]?.text}
            </button>
          ))}
          {Array.from({ length: challenge.lines.length - selected.length }).map((_, i) => (
            <div
              key={`slot-${i}`}
              className="px-3 py-2 rounded-lg border border-dashed border-line text-muted/60 text-xs font-mono"
            >
              <span className="mr-2">{selected.length + i + 1}.</span>
              tap a line below…
            </div>
          ))}
        </div>
      </div>

      {/* Available pool */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <p className="text-[10px] text-muted/80 uppercase tracking-widest mb-2">Available lines</p>
        <div className="space-y-1.5">
          {pool.map(line => (
            <button
              key={line.id}
              onClick={() => addLine(line.id)}
              className="w-full text-left px-3 py-2 rounded-lg font-mono text-xs bg-paper-2 border border-line text-ink-2 hover:border-cyan-500/40 hover:bg-line active:scale-[0.98] transition-all"
            >
              {line.text}
            </button>
          ))}
          {pool.length === 0 && !allPlaced && (
            <p className="text-muted/60 text-xs text-center py-2">All lines placed.</p>
          )}
        </div>
      </div>

      {/* Flash feedback banner */}
      {flash && (
        <div className={`mx-4 mb-2 px-4 py-2 rounded-lg text-sm font-semibold text-center transition-all ${
          flash === 'correct' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {flash === 'correct' ? 'Correct! Well done.' : 'Some lines are out of order — tap to remove and retry.'}
        </div>
      )}

      {/* Footer */}
      <div className="px-4 pb-5 pt-1 flex gap-3">
        <button
          onClick={reset}
          className="py-3 px-5 rounded-xl border border-line text-muted text-sm font-medium hover:border-line-2 active:scale-95 transition-all"
        >
          Reset
        </button>
        <button
          onClick={checkSolution}
          disabled={!allPlaced || flash === 'correct'}
          className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 ${
            allPlaced && flash !== 'correct'
              ? 'bg-cyan-600 text-white hover:bg-cyan-500'
              : 'bg-panel-2 text-muted/80 cursor-not-allowed'
          }`}
        >
          {flash === 'correct' ? 'Correct!' : 'Check Order'}
        </button>
      </div>
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
