import { create } from 'zustand'
import { progressApi, type ProgressDoc, type StoryProgress } from '@/api/progress'

// Story completion, stage checkpoints and unlocked cards.
//
// Kept in localStorage so guests and offline play work, and mirrored to
// GET/PUT /profile/progress for signed-in users so web and the native apps
// share one record.  Merging is additive: a story is complete if either
// side says so, the stage is the higher one, unlocked cards are the union.

const KEY = 'gp_story_progress'
const LEGACY_CARDS_KEY = 'gp_unlocked_cards'
const PUSH_DELAY_MS = 1500

export const emptyProgress = (): ProgressDoc => ({ version: 1, updatedAt: null, stories: {}, unlockedCards: [] })

export function mergeProgress(a: ProgressDoc, b: ProgressDoc): ProgressDoc {
  const stories: Record<string, StoryProgress> = { ...a.stories }
  for (const [slug, p] of Object.entries(b.stories)) {
    const cur = stories[slug]
    stories[slug] = cur
      ? { completed: cur.completed || p.completed, stage: Math.max(cur.stage, p.stage), completedAt: cur.completedAt ?? p.completedAt }
      : p
  }
  const times = [a.updatedAt, b.updatedAt].filter((t): t is string => !!t).sort()
  return {
    version: 1,
    updatedAt: times[times.length - 1] ?? null,
    stories,
    unlockedCards: [...new Set([...a.unlockedCards, ...b.unlockedCards])],
  }
}

function readStored(): ProgressDoc {
  let doc = emptyProgress()
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) doc = mergeProgress(doc, JSON.parse(raw))
    // Cards unlocked before progress had its own record.
    const legacy = localStorage.getItem(LEGACY_CARDS_KEY)
    if (legacy) doc = mergeProgress(doc, { ...emptyProgress(), unlockedCards: JSON.parse(legacy) })
  } catch { /* corrupt or unavailable storage: start clean */ }
  return doc
}

function writeStored(doc: ProgressDoc) {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc))
    localStorage.setItem(LEGACY_CARDS_KEY, JSON.stringify(doc.unlockedCards))
  } catch { /* ignore */ }
}

const signedIn = () => { try { return !!localStorage.getItem('access_token') } catch { return false } }

interface ProgressState {
  doc: ProgressDoc
  isComplete: (slug: string) => boolean
  stageOf: (slug: string) => number
  isUnlocked: (portraitKey: string) => boolean
  markStage: (slug: string, stage: number) => void
  markComplete: (slug: string) => void
  unlock: (portraitKey: string) => void
  /** Fetch the server copy, merge it in, and push the result. Safe to call when signed out. */
  pullAndMerge: () => Promise<void>
}

let pushTimer: ReturnType<typeof setTimeout> | null = null
function schedulePush(get: () => ProgressState) {
  if (!signedIn()) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    progressApi.put(get().doc).catch(() => { /* retried on the next change */ })
  }, PUSH_DELAY_MS)
}

export const useStoryProgress = create<ProgressState>((set, get) => {
  const update = (fn: (doc: ProgressDoc) => ProgressDoc) => {
    const next = { ...fn(get().doc), updatedAt: new Date().toISOString() }
    writeStored(next)
    set({ doc: next })
    schedulePush(get)
  }
  return {
    doc: readStored(),
    isComplete: slug => !!get().doc.stories[slug]?.completed,
    stageOf: slug => get().doc.stories[slug]?.stage ?? 0,
    isUnlocked: key => get().doc.unlockedCards.includes(key),

    markStage: (slug, stage) => {
      const cur = get().doc.stories[slug]
      if (cur && cur.stage >= stage) return
      update(doc => ({ ...doc, stories: { ...doc.stories, [slug]: { completed: cur?.completed ?? false, stage, completedAt: cur?.completedAt } } }))
    },
    markComplete: slug => {
      if (get().doc.stories[slug]?.completed) return
      update(doc => ({ ...doc, stories: { ...doc.stories, [slug]: { completed: true, stage: 3, completedAt: new Date().toISOString() } } }))
    },
    unlock: key => {
      if (get().doc.unlockedCards.includes(key)) return
      update(doc => ({ ...doc, unlockedCards: [...doc.unlockedCards, key] }))
    },

    pullAndMerge: async () => {
      if (!signedIn()) return
      try {
        const remote = await progressApi.get()
        const merged = mergeProgress(get().doc, { ...emptyProgress(), ...remote })
        writeStored(merged)
        set({ doc: merged })
        await progressApi.put(merged)
      } catch { /* offline or server error: local copy stands */ }
    },
  }
})
