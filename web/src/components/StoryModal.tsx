import { useState, useMemo } from 'react'
import challengesData from '@/data/story_challenges.json'
import MazeGame from '@/components/minigames/MazeGame'
import MirrorGame from '@/components/minigames/MirrorGame'
import CircuitGame from '@/components/minigames/CircuitGame'
import SlidingPuzzle from '@/components/minigames/SlidingPuzzle'

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuizChallenge {
  type: 'quiz'
  question: string
  options: string[]
  answer: number
  fact: string
}

interface TrueFalseChallenge {
  type: 'truefalse'
  statement: string
  correct: boolean
  fact: string
}

interface SortChallenge {
  type: 'sort'
  question: string
  items: string[]
  fact: string
}

interface MinigameChallenge {
  type: 'minigame'
  game: 'maze' | 'mirror' | 'circuit' | 'sliding'
  configId: string
  instruction: string
  fact: string
}

type Challenge = QuizChallenge | TrueFalseChallenge | SortChallenge | MinigameChallenge

interface StoryChallengeData {
  era: string
  story: string
  challenges: Challenge[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getChallenges(eraName: string, storyTitle: string): Challenge[] {
  const entry = (challengesData as StoryChallengeData[]).find(
    d => d.era === eraName && d.story === storyTitle
  )
  return entry?.challenges ?? []
}

// ── Sub-components ────────────────────────────────────────────────────────────

function QuizView({
  challenge,
  onResult,
}: {
  challenge: QuizChallenge
  onResult: (correct: boolean) => void
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const answered = selected !== null

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink text-sm font-medium leading-snug">{challenge.question}</p>
      <div className="flex flex-col gap-2">
        {challenge.options.map((opt, i) => {
          const isCorrect = i === challenge.answer
          const isSelected = i === selected
          let bg = 'bg-panel border-line text-ink-2'
          if (answered) {
            if (isCorrect) bg = 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
            else if (isSelected) bg = 'bg-red-500/20 border-red-500/40 text-red-300'
            else bg = 'bg-panel border-line text-muted'
          }
          return (
            <button
              key={i}
              disabled={answered}
              onClick={() => {
                setSelected(i)
                onResult(i === challenge.answer)
              }}
              className={`text-left px-4 py-2.5 rounded-xl border text-sm transition-all duration-200
                          ${!answered ? 'hover:border-accent/40 hover:text-accent' : ''}
                          ${bg}`}>
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TrueFalseView({
  challenge,
  onResult,
}: {
  challenge: TrueFalseChallenge
  onResult: (correct: boolean) => void
}) {
  const [answered, setAnswered] = useState<boolean | null>(null)

  const handle = (choice: boolean) => {
    if (answered !== null) return
    setAnswered(choice)
    onResult(choice === challenge.correct)
  }

  const btnClass = (choice: boolean) => {
    if (answered === null)
      return 'bg-panel border-line text-ink-2 hover:border-accent/40 hover:text-accent'
    if (choice === challenge.correct)
      return 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
    if (choice === answered)
      return 'bg-red-500/20 border-red-500/40 text-red-300'
    return 'bg-panel border-line text-muted'
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink text-sm font-medium leading-snug">{challenge.statement}</p>
      <div className="flex gap-3">
        {([true, false] as const).map(choice => (
          <button
            key={String(choice)}
            disabled={answered !== null}
            onClick={() => handle(choice)}
            className={`flex-1 py-3 rounded-xl border text-sm font-bold tracking-wide transition-all duration-200
                        ${btnClass(choice)}`}>
            {choice ? 'True' : 'False'}
          </button>
        ))}
      </div>
    </div>
  )
}

function SortView({
  challenge,
  onResult,
}: {
  challenge: SortChallenge
  onResult: (correct: boolean) => void
}) {
  const shuffled = useMemo(() => shuffle(challenge.items), [challenge.items])
  const [selected, setSelected] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)

  const remaining = shuffled.filter(item => !selected.includes(item))
  const allPicked = selected.length === challenge.items.length

  const toggle = (item: string) => {
    if (submitted) return
    if (selected.includes(item)) {
      setSelected(prev => prev.filter(x => x !== item))
    } else {
      setSelected(prev => [...prev, item])
    }
  }

  const submit = () => {
    const correct = selected.every((item, i) => item === challenge.items[i])
    setSubmitted(true)
    onResult(correct)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink text-sm font-medium leading-snug">{challenge.question}</p>

      {/* Answer slots */}
      <div className="min-h-[44px] flex flex-wrap gap-2 p-3 rounded-xl bg-panel border border-line">
        {selected.length === 0 && (
          <p className="text-muted/80 text-xs self-center">Tap items below in the correct order…</p>
        )}
        {selected.map((item, i) => {
          const isCorrect = submitted && item === challenge.items[i]
          const isWrong = submitted && item !== challenge.items[i]
          return (
            <button
              key={item}
              onClick={() => toggle(item)}
              disabled={submitted}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
                ${isCorrect ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : isWrong ? 'bg-red-500/20 border-red-500/40 text-red-300'
                  : 'bg-accent/15 border-accent/30 text-accent'}`}>
              {i + 1}. {item}
            </button>
          )
        })}
      </div>

      {/* Available items */}
      <div className="flex flex-wrap gap-2">
        {remaining.map(item => (
          <button
            key={item}
            onClick={() => toggle(item)}
            disabled={submitted}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border
                       bg-panel border-line text-ink-2
                       hover:border-accent/40 hover:text-accent transition-all">
            {item}
          </button>
        ))}
      </div>

      {allPicked && !submitted && (
        <button
          onClick={submit}
          className="mt-1 py-2.5 rounded-xl bg-accent text-accent-fg font-bold text-sm
                     hover:bg-accent-hover transition-all">
          Check Order
        </button>
      )}
    </div>
  )
}

function MinigameView({
  challenge,
  onResult,
}: {
  challenge: MinigameChallenge
  onResult: (correct: boolean) => void
}) {
  const [won, setWon] = useState(false)

  const handleWin = () => {
    if (!won) {
      setWon(true)
      onResult(true)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Instruction */}
      <p className="text-ink-2 text-xs leading-relaxed italic border-l-2 border-accent/40 pl-3">
        {challenge.instruction}
      </p>

      {/* Game component */}
      <div className="rounded-xl overflow-hidden">
        {challenge.game === 'maze' && (
          <MazeGame configId={challenge.configId} onWin={handleWin} />
        )}
        {challenge.game === 'mirror' && (
          <MirrorGame configId={challenge.configId} onWin={handleWin} />
        )}
        {challenge.game === 'circuit' && (
          <CircuitGame configId={challenge.configId} onWin={handleWin} />
        )}
        {challenge.game === 'sliding' && (
          <SlidingPuzzle configId={challenge.configId} onWin={handleWin} />
        )}
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface StoryModalProps {
  eraName: string
  storyTitle: string
  onComplete: () => void
  onClose: () => void
}

export default function StoryModal({ eraName, storyTitle, onComplete, onClose }: StoryModalProps) {
  const challenges = useMemo(() => getChallenges(eraName, storyTitle), [eraName, storyTitle])
  const [idx, setIdx] = useState(0)
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null)
  const [showFact, setShowFact] = useState(false)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)

  const challenge = challenges[idx]
  const total = challenges.length

  const handleResult = (correct: boolean) => {
    setLastCorrect(correct)
    setShowFact(true)
    if (correct) setScore(s => s + 1)
  }

  const advance = () => {
    if (idx + 1 >= total) {
      setDone(true)
    } else {
      setIdx(i => i + 1)
      setLastCorrect(null)
      setShowFact(false)
    }
  }

  if (challenges.length === 0) {
    return (
      <Overlay onClose={onClose}>
        <div className="text-center py-8">
          <p className="text-muted text-sm">No challenges found for this story.</p>
          <button onClick={onClose} className="mt-4 px-6 py-2 rounded-xl bg-accent text-accent-fg font-bold text-sm">
            Close
          </button>
        </div>
      </Overlay>
    )
  }

  if (done) {
    const perfect = score === total
    return (
      <Overlay onClose={onClose}>
        <div className="flex flex-col items-center gap-4 py-4">
          <span className="text-5xl">{perfect ? '🏆' : score >= total / 2 ? '⭐' : '📖'}</span>
          <h3 className="text-ink font-bold text-lg text-center">{storyTitle}</h3>
          <p className="text-accent font-semibold text-base">
            {score} / {total} correct
          </p>
          <p className="text-muted text-sm text-center">
            {perfect ? 'Perfect score! Story complete.' : 'Story complete! Keep exploring.'}
          </p>
          <button
            onClick={() => { onComplete(); onClose() }}
            className="mt-2 w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-accent-fg font-bold text-sm tracking-wide transition-all">
            Complete Story →
          </button>
        </div>
      </Overlay>
    )
  }

  return (
    <Overlay onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-accent/70 text-[10px] uppercase tracking-widest font-semibold">{eraName}</p>
          <h3 className="text-ink font-bold text-sm leading-tight">{storyTitle}</h3>
        </div>
        <div className="text-right">
          <p className="text-muted text-xs">Challenge</p>
          <p className="text-ink-2 text-sm font-bold">{idx + 1} / {total}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-panel mb-5 overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${((idx) / total) * 100}%` }} />
      </div>

      {/* Challenge */}
      {challenge.type === 'quiz' && (
        <QuizView challenge={challenge} onResult={handleResult} />
      )}
      {challenge.type === 'truefalse' && (
        <TrueFalseView challenge={challenge} onResult={handleResult} />
      )}
      {challenge.type === 'sort' && (
        <SortView challenge={challenge} onResult={handleResult} />
      )}
      {challenge.type === 'minigame' && (
        <MinigameView challenge={challenge} onResult={handleResult} />
      )}

      {/* Skip button for minigames (only shown before answering) */}
      {challenge.type === 'minigame' && !showFact && (
        <button
          onClick={() => handleResult(false)}
          className="mt-2 w-full py-1.5 rounded-xl text-muted text-xs border border-line
                     hover:border-line hover:text-muted transition-all duration-200">
          Skip this puzzle
        </button>
      )}

      {/* Fact + next */}
      {showFact && (
        <div className={`mt-4 p-3 rounded-xl border text-xs leading-relaxed
          ${lastCorrect
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-line border-line text-ink-2'
          }`}>
          <span className="font-bold mr-1">{lastCorrect ? '✓ Correct!' : '✗ Not quite.'}</span>
          {challenge.fact}
        </div>
      )}

      {showFact && (
        <button
          onClick={advance}
          className="mt-3 w-full py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-accent-fg font-bold text-sm transition-all">
          {idx + 1 < total ? 'Next Challenge →' : 'See Results →'}
        </button>
      )}
    </Overlay>
  )
}

// ── Overlay wrapper ───────────────────────────────────────────────────────────

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-ink/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md bg-panel border border-line rounded-2xl p-5 shadow-2xl
                      max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
