import { useEffect, useRef, useState } from 'react'

interface Options {
  /** Seconds. Omit or pass 0 for no timer. */
  seconds?: number
  /** Pause when the game is already settled. */
  running: boolean
  onExpire: () => void
}

/** Counts down once per second and fires `onExpire` at zero. */
export function useGameTimer({ seconds = 0, running, onExpire }: Options) {
  const [remaining, setRemaining] = useState(seconds)
  const left = useRef(seconds)
  const expire = useRef(onExpire)
  expire.current = onExpire

  useEffect(() => { left.current = seconds; setRemaining(seconds) }, [seconds])

  // The countdown lives in a ref and onExpire fires from the tick itself:
  // state updaters may run more than once (StrictMode, batched ticks after a
  // throttled background tab), which used to call onExpire repeatedly.
  useEffect(() => {
    if (!seconds || !running) return
    const iv = setInterval(() => {
      left.current = Math.max(0, left.current - 1)
      setRemaining(left.current)
      if (left.current === 0) { clearInterval(iv); expire.current() }
    }, 1000)
    return () => clearInterval(iv)
  }, [seconds, running])

  return { remaining, total: seconds, active: seconds > 0 }
}

export function TimerBar({ remaining, total }: { remaining: number; total: number }) {
  if (!total) return null
  const low = remaining <= Math.max(3, total * 0.2)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-panel rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${low ? 'bg-red-500' : 'bg-accent'}`}
          style={{ width: `${(remaining / total) * 100}%` }}
        />
      </div>
      <span className={`text-xs font-bold tabular-nums w-8 text-right ${low ? 'text-red-600' : 'text-accent'}`}>
        {remaining}s
      </span>
    </div>
  )
}
