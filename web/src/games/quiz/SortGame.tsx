import { useMemo, useState } from 'react'
import type { SortChallenge } from '@/games/types'
import { mulberry32, shuffle } from '@/components/minigames/_shared'

interface Props {
  challenge: SortChallenge
  seed: number
  onResult: (correct: boolean) => void
}

/** Tap the items in order, then check. */
export default function SortGame({ challenge, seed, onResult }: Props) {
  const shuffled = useMemo(() => shuffle(challenge.items, mulberry32(seed)), [challenge.items, seed])
  const [selected, setSelected] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const remaining = shuffled.filter(i => !selected.includes(i))
  const allPicked = selected.length === challenge.items.length

  const toggle = (item: string) => {
    if (submitted) return
    setSelected(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item])
  }
  const submit = () => {
    setSubmitted(true)
    onResult(selected.every((item, i) => item === challenge.items[i]))
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink text-sm font-medium leading-snug">{challenge.question}</p>
      <div className="min-h-[44px] flex flex-wrap gap-2 p-3 rounded-xl bg-panel border border-line">
        {selected.length === 0 && <p className="text-muted/80 text-xs self-center">Tap items below in order…</p>}
        {selected.map((item, i) => {
          const isCorrect = submitted && item === challenge.items[i]
          const isWrong = submitted && item !== challenge.items[i]
          return (
            <button key={item} onClick={() => toggle(item)} disabled={submitted}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
                ${isCorrect ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-800'
                  : isWrong ? 'bg-red-500/20 border-red-500/40 text-red-800'
                  : 'bg-accent/15 border-accent/30 text-accent'}`}>
              {i + 1}. {item}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {remaining.map(item => (
          <button key={item} onClick={() => toggle(item)} disabled={submitted}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-panel border-line text-ink-2 hover:border-accent/40 hover:text-accent transition-all">
            {item}
          </button>
        ))}
      </div>
      {allPicked && !submitted && (
        <button onClick={submit} className="mt-1 py-2.5 rounded-xl bg-accent text-accent-fg font-bold text-sm hover:bg-accent-hover transition-all">
          Check Order
        </button>
      )}
    </div>
  )
}
