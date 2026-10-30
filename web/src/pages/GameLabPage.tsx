import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ChallengeRenderer from '@/games/ChallengeRenderer'
import { GAMES, GAME_KEYS, isGameKey, type GameKey } from '@/games/registry'
import type { Difficulty, MinigameChallenge } from '@/games/types'

// Development-only harness: /lab/:game/:configId?difficulty=N plays any
// registered minigame directly, including engines no story references yet.
// Registered only when import.meta.env.DEV (see App.tsx).

export default function GameLabPage() {
  const { game, configId } = useParams<{ game?: string; configId?: string }>()
  const navigate = useNavigate()
  const key: GameKey | null = game && isGameKey(game) ? game : null
  const [configIds, setConfigIds] = useState<string[]>([])
  const [difficulty, setDifficulty] = useState<Difficulty>(1)
  const [attempt, setAttempt] = useState(0)
  const [outcome, setOutcome] = useState<string>('playing')

  useEffect(() => {
    setConfigIds([]); setOutcome('playing'); setAttempt(0)
    if (key) void GAMES[key].load().then(m => setConfigIds(m.CONFIG_IDS ?? []))
  }, [key, configId])

  const challenge = useMemo<MinigameChallenge | null>(() => key ? {
    type: 'minigame', game: key, difficulty, fact: '',
    instruction: `Lab: ${GAMES[key].label} / ${configId ?? 'default'} / difficulty ${difficulty}`,
    configId, id: `lab:${key}:${configId ?? ''}`,
  } : null, [key, configId, difficulty])

  return (
    <div className="min-h-screen bg-paper text-ink p-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-1 text-xs">
        {GAME_KEYS.map(k => (
          <button key={k} onClick={() => navigate(`/lab/${k}`)}
            className={`px-2 py-1 rounded border ${k === key ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line'}`}>
            {GAMES[k].label}
          </button>
        ))}
      </div>
      {key && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">configs:</span>
          {configIds.map(c => (
            <button key={c} onClick={() => navigate(`/lab/${key}/${c}`)}
              className={`px-2 py-1 rounded border ${c === configId ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line'}`}>{c}</button>
          ))}
          <span className="text-muted ml-2">difficulty:</span>
          {([1, 2, 3, 4] as Difficulty[]).map(d => (
            <button key={d} onClick={() => { setDifficulty(d); setAttempt(a => a + 1); setOutcome('playing') }}
              className={`px-2 py-1 rounded border ${d === difficulty ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line'}`}>{d}</button>
          ))}
          <button onClick={() => { setAttempt(a => a + 1); setOutcome('playing') }} className="px-2 py-1 rounded border border-line bg-panel">retry</button>
          <span data-testid="lab-outcome" className="font-semibold">{outcome}</span>
        </div>
      )}
      {challenge && (
        <div className="max-w-md">
          <ChallengeRenderer
            key={`${key}:${configId}:${difficulty}:${attempt}`}
            challenge={challenge}
            seed={attempt}
            onWin={() => setOutcome('WON')}
            onLose={r => setOutcome(`LOST${r ? ': ' + r : ''}`)}
          />
        </div>
      )}
    </div>
  )
}
