// Story flow: lives, retry with a new attempt, and the out-of-lives stage retry.
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import StoryViewer from '@/components/StoryViewer'
import storyChallenges from '@/data/story_challenges.json'
import type { Challenge, QuizChallenge } from '@/games/types'

vi.mock('@/hooks/useAssetPreload', () => ({ useAssetPreload: () => ({ ready: true, progress: 1 }) }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ isAdmin: false }) }))

// Any story whose first challenge is a quiz will do.
const entry = (storyChallenges as { era: string; story: string; challenges: Challenge[] }[])
  .find(e => e.challenges[0]?.type === 'quiz')!
const quiz = entry.challenges[0] as QuizChallenge
const wrongOption = quiz.options.find((_, i) => i !== quiz.answer)!

async function settle() {
  // Typewriter text and result timers are all well under this.
  await act(() => vi.advanceTimersByTimeAsync(20_000))
}

/** Click through stage intros, narration and dialog until the quiz is on screen. */
async function reachQuiz() {
  for (let i = 0; i < 40; i++) {
    await settle()
    if (screen.queryByText(quiz.question)) return
    const next = screen.queryByText('Begin →') ?? screen.queryByText('Continue →')
    if (!next) throw new Error('no way forward')
    fireEvent.click(next)
  }
  throw new Error('quiz never appeared')
}

async function answerWrong() {
  fireEvent.click(screen.getByText(wrongOption))
  await settle()
  // The pop-up appears unless that was the last life.
  if (screen.queryByText('Not this time')) {
    expect(screen.getByText('Leave this Epic')).toBeInTheDocument()
    fireEvent.click(screen.getByText('↻ Try again'))
    await settle()
  }
}

describe('StoryViewer result pop-up', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('a pass shows a pop-up with the fact, the next challenge and a way out', async () => {
    const onClose = vi.fn()
    render(<StoryViewer eraName={entry.era} storyTitle={entry.story} figureName={null} portraitKey={null}
      lives={3} onComplete={() => {}} onClose={onClose} />)
    await reachQuiz()
    fireEvent.click(screen.getByText(quiz.options[quiz.answer]))
    await settle()
    const dialog = screen.getByRole('dialog', { name: 'Challenge passed' })
    expect(dialog).toHaveTextContent(quiz.fact)
    fireEvent.click(screen.getByText('Leave this Epic'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('next challenge closes the pop-up and moves the story on', async () => {
    render(<StoryViewer eraName={entry.era} storyTitle={entry.story} figureName={null} portraitKey={null}
      lives={3} onComplete={() => {}} onClose={() => {}} />)
    await reachQuiz()
    fireEvent.click(screen.getByText(quiz.options[quiz.answer]))
    await settle()
    fireEvent.click(screen.getByText(/Next challenge →|Finish the story →/))
    await settle()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(quiz.question)).not.toBeInTheDocument()
  })

  it('a lost life offers a retry or leaving', async () => {
    const onClose = vi.fn()
    render(<StoryViewer eraName={entry.era} storyTitle={entry.story} figureName={null} portraitKey={null}
      lives={3} onComplete={() => {}} onClose={onClose} />)
    await reachQuiz()
    fireEvent.click(screen.getByText(wrongOption))
    await settle()
    expect(screen.getByRole('dialog', { name: 'Challenge failed' })).toHaveTextContent('2 lives left')
    fireEvent.click(screen.getByText('Leave this Epic'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('StoryViewer lives', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('a wrong answer costs a life and retries the same challenge', async () => {
    render(<StoryViewer eraName={entry.era} storyTitle={entry.story} figureName={null} portraitKey={null}
      lives={3} onComplete={() => {}} onClose={() => {}} />)
    await reachQuiz()
    expect(screen.getByLabelText('3 of 3 lives')).toBeInTheDocument()

    await answerWrong()
    expect(screen.getByLabelText('2 of 3 lives')).toBeInTheDocument()
    // Back on the same question, options enabled again.
    expect(screen.getByText(quiz.question)).toBeInTheDocument()
    expect(screen.getByText(wrongOption)).not.toBeDisabled()
  })

  it('losing every life offers a stage retry that restores them', async () => {
    const onClose = vi.fn()
    render(<StoryViewer eraName={entry.era} storyTitle={entry.story} figureName={null} portraitKey={null}
      lives={2} onComplete={() => {}} onClose={onClose} />)
    await reachQuiz()

    await answerWrong()
    await answerWrong()
    expect(screen.getByText('Out of lives')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Retry stage'))
    await settle()
    expect(screen.queryByText('Out of lives')).not.toBeInTheDocument()
    expect(screen.getByLabelText('2 of 2 lives')).toBeInTheDocument()
    expect(screen.getByText('Begin →')).toBeInTheDocument()   // back at the stage intro
    expect(onClose).not.toHaveBeenCalled()
  })
})
