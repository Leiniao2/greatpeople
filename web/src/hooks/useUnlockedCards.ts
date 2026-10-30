import { useStoryProgress } from './useStoryProgress'

/** Cards the player has unlocked; backed by the shared story-progress store. */
export function useUnlockedCards() {
  const unlocked = useStoryProgress(s => s.doc.unlockedCards)
  const unlock = useStoryProgress(s => s.unlock)
  const isUnlocked = (portraitKey: string) => unlocked.includes(portraitKey)
  return { unlocked, unlock, isUnlocked }
}
