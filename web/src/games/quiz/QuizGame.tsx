import { useMemo, useState } from 'react'
import type { QuizChallenge } from '@/games/types'
import { mulberry32, shuffle, useGameTimer, TimerBar } from '@/components/minigames/_shared'

interface Props {
  challenge: QuizChallenge
  seed: number
  onResult: (correct: boolean) => void
}

export default function QuizGame({ challenge, seed, onResult }: Props) {
  // Options are shown in a seeded order so a retry doesn't reveal the answer by position.
  const order = useMemo(() => shuffle(challenge.options.map((_, i) => i), mulberry32(seed)), [challenge.options, seed])
  const [selected, setSelected] = useState<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const answered = selected !== null || timedOut

  const { remaining, total } = useGameTimer({
    seconds: challenge.countdown,
    running: !answered,
    onExpire: () => { setTimedOut(true); onResult(false) },
  })

  return (
    <div className="flex flex-col gap-3">
      {total > 0 && !answered && <TimerBar remaining={remaining} total={total} />}
      {timedOut && <p className="text-red-600 text-xs font-bold">⏱ Time's up!</p>}
      <p className="text-ink text-sm font-medium leading-snug">{challenge.question}</p>
      <div className="flex flex-col gap-2">
        {order.map(i => {
          const isCorrect = i === challenge.answer
          const isSelected = i === selected
          let bg = 'bg-panel border-line text-ink-2 hover:border-accent/40 hover:text-accent'
          if (answered) {
            if (isCorrect) bg = 'bg-emerald-500/20 border-emerald-500/50 text-emerald-800'
            else if (isSelected) bg = 'bg-red-500/20 border-red-500/40 text-red-800'
            else bg = 'bg-panel border-line text-muted'
          }
          return (
            <button key={i} disabled={answered}
              onClick={() => { setSelected(i); onResult(isCorrect) }}
              className={`text-left px-4 py-2.5 rounded-xl border text-sm transition-all duration-200 ${bg}`}>
              {challenge.options[i]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
