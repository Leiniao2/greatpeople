// Full-screen loading state shared by route transitions and page preloads.
// Parchment & Ink styling to match the rest of the app.

interface Props {
  /** 0–1. Omit for an indeterminate bar. */
  progress?: number
  label?: string
}

export default function LoadingScreen({ progress, label = 'Loading' }: Props) {
  const determinate = typeof progress === 'number'
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-paper text-ink select-none">
      <span className="text-accent text-4xl leading-none mb-4">♛</span>
      <h1 className="font-display text-2xl font-bold tracking-[0.12em] uppercase mb-6">
        Great People
      </h1>

      <div className="w-48 h-1 rounded-full bg-line/50 overflow-hidden">
        {determinate ? (
          <div
            className="h-full bg-accent transition-[width] duration-200 ease-out"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        ) : (
          <div className="h-full w-1/3 bg-accent animate-loading-slide" />
        )}
      </div>

      <p className="mt-3 text-muted text-[11px] tracking-[0.28em] uppercase">
        {label}
        {determinate && ` · ${Math.round(progress * 100)}%`}
      </p>
    </div>
  )
}
