import { useCallback, useEffect, useRef, useState } from 'react'

interface Options {
  onWin: () => void
  onLose: (reason?: string) => void
  /** Delay before the parent is told, so the game can show its own banner first. */
  delayMs?: number
}

/**
 * Tracks whether a game has been won or lost and reports it once.
 * Games call `win()` or `lose(reason)`; repeated calls after the first are ignored.
 */
export function useGameOutcome({ onWin, onLose, delayMs = 900 }: Options) {
  const [outcome, setOutcome] = useState<'won' | 'lost' | null>(null)
  const [reason, setReason] = useState<string | undefined>()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Keep the latest callbacks without re-arming the timer when they change.
  const latest = useRef({ onWin, onLose })
  latest.current = { onWin, onLose }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const win = useCallback(() => {
    setOutcome(prev => {
      if (prev) return prev
      timer.current = setTimeout(() => latest.current.onWin(), delayMs)
      return 'won'
    })
  }, [delayMs])

  const lose = useCallback((why?: string) => {
    setOutcome(prev => {
      if (prev) return prev
      setReason(why)
      timer.current = setTimeout(() => latest.current.onLose(why), delayMs)
      return 'lost'
    })
  }, [delayMs])

  return { outcome, reason, won: outcome === 'won', lost: outcome === 'lost', settled: outcome !== null, win, lose }
}
