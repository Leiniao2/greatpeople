// The card page shows the card's legacy: its effect and the card's own way to earn it.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CardDetailPage from '@/pages/CardDetailPage'
import { ALL_GP_CARDS } from '@/battle/engine'

afterEach(cleanup)

describe('card page legacy', () => {
  it('shows the legacy effect and how this card earns it', () => {
    const card = ALL_GP_CARDS.find(c => c.id === 'imhotep')!
    render(
      <MemoryRouter initialEntries={[{ pathname: '/card/imhotep', state: { card } }]}>
        <Routes><Route path="/card/:id" element={<CardDetailPage />} /></Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText(`Legacy · ${card.legacy.name}`)).toBeTruthy()
    expect(screen.getByText('How to earn it:')).toBeTruthy()
    expect(screen.getByText(card.achievement.split(' — ')[1])).toBeTruthy()
    expect(screen.queryByText(/Earned by winning/)).toBeNull()
  })
})
