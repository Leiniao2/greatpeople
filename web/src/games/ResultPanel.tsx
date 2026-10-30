// The panel shown over a stand-alone challenge once it is won or lost
// (Arcade and the native play route).  Button order is deliberate: after a
// win the player most likely wants the next challenge; after a loss, a
// replay comes first, then moving on, then leaving.

interface Props {
  outcome: 'won' | 'lost'
  fact?: string
  onReplay: () => void
  /** Omitted when there is no next challenge. */
  onNext?: () => void
  onBack: () => void
  backLabel?: string
}

export default function ResultPanel({ outcome, fact, onReplay, onNext, onBack, backLabel = 'Back to Arcade' }: Props) {
  const won = outcome === 'won'
  const primary = 'w-full py-3 rounded-xl bg-accent text-accent-fg font-bold text-sm hover:bg-accent-hover transition-all'
  const secondary = 'w-full py-2.5 rounded-xl bg-panel border border-line text-ink-2 font-semibold text-sm hover:border-accent/40 hover:text-accent transition-all'
  const tertiary = 'w-full py-2 rounded-xl text-muted text-sm hover:text-ink transition-all'

  return (
    <div className="absolute inset-0 z-20 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-[2px] animate-fade-in p-4"
      role="dialog" aria-label={won ? 'Challenge complete' : 'Challenge failed'}>
      <div className="w-full max-w-sm bg-paper-2 border border-line rounded-2xl shadow-2xl p-5 flex flex-col gap-3 text-center">
        <span className="text-4xl leading-none">{won ? '🏆' : '💔'}</span>
        <p className={`font-display text-xl font-bold ${won ? 'text-emerald-800' : 'text-red-800'}`}>
          {won ? 'Challenge complete!' : 'Not this time'}
        </p>
        {won && fact && <p className="text-muted text-xs leading-relaxed">{fact}</p>}
        {!won && <p className="text-muted text-xs">Have another go, move on, or head back.</p>}

        <div className="flex flex-col gap-2 mt-1">
          {won ? (
            <>
              {onNext && <button onClick={onNext} className={primary}>Next challenge →</button>}
              <button onClick={onBack} className={onNext ? secondary : primary}>{backLabel}</button>
              <button onClick={onReplay} className={tertiary}>Play it again</button>
            </>
          ) : (
            <>
              <button onClick={onReplay} className={primary}>↻ Replay</button>
              {onNext && <button onClick={onNext} className={secondary}>Next challenge →</button>}
              <button onClick={onBack} className={tertiary}>{backLabel}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
