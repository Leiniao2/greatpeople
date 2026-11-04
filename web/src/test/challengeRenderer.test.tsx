// ChallengeRenderer hands a minigame the story's text: when the screen around
// the game shows the challenge's own fact, the config's built-in fact is
// blanked so a reused config cannot show a fact about another place.
import { createElement } from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { MinigameChallenge, MinigameProps } from '@/games/types'

const seen: MinigameProps['params'][] = []
vi.mock('@/games/registry', () => ({
  isGameKey: () => true,
  LazyGame: new Proxy({}, {
    get: () => (props: MinigameProps) => { seen.push(props.params); return createElement('p', null, 'game') },
  }),
}))

const { default: ChallengeRenderer } = await import('@/games/ChallengeRenderer')

afterEach(() => { cleanup(); seen.length = 0 })

const challenge = (extra: Partial<MinigameChallenge>): MinigameChallenge =>
  ({ type: 'minigame', game: 'sokoban', configId: 'stonehenge', instruction: 'Raise the stones.', fact: '', ...extra } as MinigameChallenge)

const play = (c: MinigameChallenge) => {
  render(createElement(ChallengeRenderer, { challenge: c, seed: 1, onWin: () => {}, onLose: () => {} }))
  expect(screen.getByText('game')).toBeTruthy()
  return seen[seen.length - 1]
}

describe('ChallengeRenderer story text', () => {
  it('blanks the config fact when the challenge carries its own', () => {
    expect(play(challenge({ fact: 'Pakal was buried in 683.', params: { title: 'The Temple of the Inscriptions' } })))
      .toEqual({ title: 'The Temple of the Inscriptions', fact: '' })
  })

  it('keeps a fact the story wrote into params', () => {
    expect(play(challenge({ fact: 'Story fact.', params: { fact: 'Game fact.' } }))).toEqual({ fact: 'Game fact.' })
  })

  it('leaves params alone when there is no challenge fact (Arcade, lab)', () => {
    expect(play(challenge({ fact: '' }))).toBeUndefined()
  })
})
