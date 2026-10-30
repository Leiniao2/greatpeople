interface Props {
  outcome: 'won' | 'lost' | null
  /** Shown under the headline on a win, usually the challenge's fact. */
  detail?: string
  winTitle?: string
  loseTitle?: string
}

/** The result strip games show at the bottom once they are settled. */
export default function OutcomeBanner({ outcome, detail, winTitle = 'Complete!', loseTitle = 'Not this time' }: Props) {
  if (!outcome) return null
  const won = outcome === 'won'
  return (
    <div className={`p-3 rounded-xl border text-xs leading-relaxed
      ${won ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
      <span className={`font-bold ${won ? 'text-emerald-700' : 'text-red-700'}`}>
        {won ? '✓ ' : '✗ '}{won ? winTitle : loseTitle}
      </span>
      {won && detail && <span className="text-muted ml-1">{detail}</span>}
    </div>
  )
}
