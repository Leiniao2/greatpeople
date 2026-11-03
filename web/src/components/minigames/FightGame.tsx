import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameState } from '@/types'
import type { MinigameProps } from '@/games/types'
import { gameReducer, initScriptedGame, type GameAction } from '@/battle/engine'
import { BattleGame } from '@/battle/BattleGame'
import { buildLesson, coachHint, lessonStatus, LESSON_TIERS, type LessonProgress } from '@/battle/lessons'
import { OutcomeBanner, useGameOutcome } from './_shared'

// Fight lesson: the real battle board on a small scripted layout, with a goal
// and a coach.  Closes every Epic story so players learn the card game one
// rule at a time; see @/battle/lessons for the curriculum.

export const CONFIG_IDS: string[] = [...LESSON_TIERS]

export default function FightGame({ configId, params, onWin, onLose }: MinigameProps) {
  const lesson = useMemo(() => buildLesson(configId, params), [configId, params])

  // The board state lives in a ref so progress can be read off each action
  // exactly once (an updater function would run twice under StrictMode).
  const stateRef = useRef<GameState | null>(null)
  if (!stateRef.current) stateRef.current = initScriptedGame(lesson.script)
  const progressRef = useRef<LessonProgress>({ attacksWon: 0, competitionsWon: 0 })
  const [, setTick] = useState(0)

  const dispatch = useCallback((action: GameAction) => {
    const prev = stateRef.current!
    const next = gameReducer(prev, action)
    if (next === prev) return
    const s = next.pendingSummary
    if (action.type === 'ATTACK' && prev.currentPlayerIdx === 0 && s?.kind === 'combat' && s.result === 'attacker')
      progressRef.current.attacksWon++
    if (action.type === 'END_TURN' && s?.kind === 'event' && s.eventType === 'global_competition' && s.winnerName === next.players[0].name)
      progressRef.current.competitionsWon++
    stateRef.current = next
    setTick(t => t + 1)
  }, [])

  const state = stateRef.current
  const status = lessonStatus(state, progressRef.current, lesson)
  const { outcome, reason, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 1400 })

  // Let the battle report be read before the result lands.
  useEffect(() => {
    if (state.pendingSummary) return
    if (status.done) win()
    else if (status.failed) lose(status.failed)
  }, [state, status.done, status.failed, win, lose])

  const hint = outcome ? '' : coachHint(state, lesson)

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-xl bg-panel border border-line px-3 py-2">
        <p className="text-[10px] uppercase tracking-widest text-accent font-bold">
          Fight lesson {lesson.number} · {lesson.title}
        </p>
        <p className="text-xs text-ink-2 leading-relaxed mt-0.5">{lesson.goalText}</p>
        <p className="text-[10px] text-muted mt-1">
          {status.text} · Round {Math.min(state.round, lesson.maxRounds)} of {lesson.maxRounds}
        </p>
      </div>

      {!outcome && (
        <div className="rounded-xl overflow-hidden border border-line">
          <BattleGame
            gameState={state}
            dispatch={dispatch}
            onExit={() => lose('left the board')}
            embedded
            banner={hint ? (
              <div className="relative z-10 px-3 py-1.5 bg-accent/10 border-b border-accent/20">
                <p className="text-accent text-xs leading-snug"><span className="font-bold mr-1">Coach:</span>{hint}</p>
              </div>
            ) : null}
          />
        </div>
      )}

      <OutcomeBanner
        outcome={outcome}
        detail={lesson.teaches}
        winTitle="Lesson complete!"
        loseTitle={reason ? `Not this time: ${reason}.` : 'Not this time'}
      />
    </div>
  )
}
