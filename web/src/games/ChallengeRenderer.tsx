import { Suspense, useCallback, useRef } from 'react'
import type { Challenge } from './types'
import { LazyGame, isGameKey } from './registry'
import QuizGame from './quiz/QuizGame'
import TrueFalseGame from './quiz/TrueFalseGame'
import SortGame from './quiz/SortGame'

interface Props {
  challenge: Challenge
  /** Drives any randomness; change it to reshuffle on a retry. */
  seed: number
  onWin: () => void
  onLose: (reason?: string) => void
}

/**
 * Renders any challenge — quiz, true/false, sort or a registered minigame —
 * and reports a single win or loss.  The only place that maps a challenge
 * to a component; StoryViewer, the Arcade and the native play route all use it.
 */
export default function ChallengeRenderer({ challenge, seed, onWin, onLose }: Props) {
  // Guard against a game reporting twice (e.g. a win banner's timer and a
  // "Continue" button both firing).
  const settled = useRef(false)
  const win = useCallback(() => { if (!settled.current) { settled.current = true; onWin() } }, [onWin])
  const lose = useCallback((reason?: string) => { if (!settled.current) { settled.current = true; onLose(reason) } }, [onLose])
  const onResult = useCallback((correct: boolean) => (correct ? win() : lose()), [win, lose])

  switch (challenge.type) {
    case 'quiz':      return <QuizGame challenge={challenge} seed={seed} onResult={onResult} />
    case 'truefalse': return <TrueFalseGame challenge={challenge} onResult={onResult} />
    case 'sort':      return <SortGame challenge={challenge} seed={seed} onResult={onResult} />
    case 'minigame': {
      if (!isGameKey(challenge.game)) {
        return <p className="text-red-700 text-xs">Unknown game "{challenge.game}".</p>
      }
      const Game = LazyGame[challenge.game]
      return (
        <div className="flex flex-col gap-3">
          <p className="text-ink-2 text-xs leading-relaxed italic border-l-2 border-accent/40 pl-3">{challenge.instruction}</p>
          <div className="rounded-xl overflow-hidden">
            <Suspense fallback={<GameLoading />}>
              <Game
                configId={challenge.configId ?? ''}
                params={challenge.params}
                difficulty={challenge.difficulty ?? 1}
                seed={seed}
                onWin={win}
                onLose={lose}
              />
            </Suspense>
          </div>
        </div>
      )
    }
  }
}

function GameLoading() {
  return (
    <div className="flex items-center justify-center py-10 text-muted text-xs tracking-widest uppercase">
      <span className="inline-block w-4 h-4 mr-3 border-2 border-line border-t-accent rounded-full animate-spin" />
      Loading puzzle
    </div>
  )
}
