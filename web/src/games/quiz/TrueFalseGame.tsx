import { useState } from 'react'
import type { TrueFalseChallenge } from '@/games/types'
import { useGameTimer, TimerBar } from '@/components/minigames/_shared'

interface Props {
  challenge: TrueFalseChallenge
  onResult: (correct: boolean) => void
}

export default function TrueFalseGame({ challenge, onResult }: Props) {
  const [answered, setAnswered] = useState<boolean | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const done = answered !== null || timedOut

  const { remaining, total } = useGameTimer({
    seconds: challenge.countdown,
    running: !done,
    onExpire: () => { setTimedOut(true); onResult(false) },
  })

  const handle = (choice: boolean) => {
    if (done) return
    setAnswered(choice)
    onResult(choice === challenge.correct)
  }
  const btnClass = (choice: boolean) => {
    if (!done) return 'bg-panel border-line text-ink-2 hover:border-accent/40 hover:text-accent'
    if (choice === challenge.correct) return 'bg-emerald-500/20 border-emerald-500/50 text-emerald-800'
    if (choice === answered) return 'bg-red-500/20 border-red-500/40 text-red-800'
    return 'bg-panel border-line text-muted'
  }
  return (
    <div className="flex flex-col gap-4">
      {total > 0 && !done && <TimerBar remaining={remaining} total={total} />}
      {timedOut && <p className="text-red-600 text-xs font-bold">⏱ Time's up!</p>}
      <p className="text-ink text-sm font-medium leading-snug">{challenge.statement}</p>
      <div className="flex gap-3">
        {([true, false] as const).map(choice => (
          <button key={String(choice)} disabled={done} onClick={() => handle(choice)}
            className={`flex-1 py-3 rounded-xl border text-sm font-bold tracking-wide transition-all duration-200 ${btnClass(choice)}`}>
            {choice ? 'True' : 'False'}
          </button>
        ))}
      </div>
    </div>
  )
}
