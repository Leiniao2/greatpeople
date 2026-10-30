import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import ResultPanel from '@/games/ResultPanel'

afterEach(cleanup)

const buttons = () => screen.getAllByRole('button').map(b => b.textContent)

describe('ResultPanel', () => {
  it('after a win offers the next challenge first, then back', () => {
    const onNext = vi.fn(), onBack = vi.fn()
    render(<ResultPanel outcome="won" fact="f" onReplay={() => {}} onNext={onNext} onBack={onBack} />)
    expect(buttons()).toEqual(['Next challenge →', 'Back to Arcade', 'Play it again'])
    fireEvent.click(screen.getByText('Next challenge →'))
    expect(onNext).toHaveBeenCalled()
  })

  it('after a loss ranks replay highest, then next, then back', () => {
    const onReplay = vi.fn()
    render(<ResultPanel outcome="lost" onReplay={onReplay} onNext={() => {}} onBack={() => {}} />)
    expect(buttons()).toEqual(['↻ Replay', 'Next challenge →', 'Back to Arcade'])
    fireEvent.click(screen.getByText('↻ Replay'))
    expect(onReplay).toHaveBeenCalled()
  })

  it('hides "next" when there is no next challenge', () => {
    render(<ResultPanel outcome="lost" onReplay={() => {}} onBack={() => {}} backLabel="Back" />)
    expect(buttons()).toEqual(['↻ Replay', 'Back'])
  })
})
