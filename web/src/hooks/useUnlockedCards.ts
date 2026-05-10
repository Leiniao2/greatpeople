import { useState } from 'react'

const KEY = 'gp_unlocked_cards'

function readStored(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function useUnlockedCards() {
  const [unlocked, setUnlocked] = useState<string[]>(readStored)

  const unlock = (portraitKey: string) => {
    setUnlocked(prev => {
      if (prev.includes(portraitKey)) return prev
      const next = [...prev, portraitKey]
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }

  const isUnlocked = (portraitKey: string) => unlocked.includes(portraitKey)

  return { unlocked, unlock, isUnlocked }
}
