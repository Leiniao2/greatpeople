// The Collection's Great People tab filters and groups by claimed state, age
// and identity, and shows ages and identities as icons rather than words.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import cardsJson from '@/data/cards.json'
import { ERA_NAMES } from '@/components/EraIcon'
import { IDENTITY_NAMES } from '@/components/IdentityIcon'

const CARDS = cardsJson as { id: string; figureName: string; era: string; identities: string[]; portraitKey?: string }[]
const CLAIMED = CARDS.slice(0, 2)

vi.mock('@/components/PageLoader', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ isGuest: false, isAdmin: false, exitGuestMode: () => {} }),
}))
vi.mock('@/hooks/useUnlockedCards', () => ({
  useUnlockedCards: () => ({ unlocked: CLAIMED.map(c => c.portraitKey ?? '') }),
}))

const { default: CollectionPage } = await import('@/pages/CollectionPage')

afterEach(cleanup)

function renderPage() {
  render(<MemoryRouter><CollectionPage /></MemoryRouter>)
}

/** Text a reader sees, leaving out SVG tooltip titles. */
function visibleText(el: Element) {
  const copy = el.cloneNode(true) as Element
  copy.querySelectorAll('title').forEach(t => t.remove())
  return copy.textContent ?? ''
}

const shownNames = () => screen.queryAllByRole('img')
  .filter(img => img.getAttribute('src')?.startsWith('/portraits/'))
  .map(img => img.getAttribute('alt'))

describe('collection filters', () => {
  it('draws every age and identity filter as an icon with no visible text', () => {
    renderPage()
    for (const name of [...ERA_NAMES, ...IDENTITY_NAMES]) {
      const button = screen.getByRole('button', { name })
      expect(visibleText(button)).toBe('')
      expect(button.querySelector('svg, img')).toBeTruthy()
    }
  })

  it('filters by age', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Ancient' }))
    const expected = CARDS.filter(c => c.era === 'Ancient').map(c => c.figureName)
    expect(shownNames().sort()).toEqual([...expected].sort())
  })

  it('combines claimed and identity filters', () => {
    renderPage()
    const identity = CLAIMED[0].identities[0]
    fireEvent.click(screen.getByRole('button', { name: /^Claimed \(/ }))
    fireEvent.click(screen.getByRole('button', { name: identity }))
    const expected = CLAIMED.filter(c => c.identities.includes(identity)).map(c => c.figureName)
    expect(shownNames().sort()).toEqual([...expected].sort())
  })

  it('groups by age in chronological order', () => {
    renderPage()
    fireEvent.click(within(screen.getByRole('group', { name: 'Group by' })).getByRole('button', { name: 'Age' }))
    const sections = screen.getAllByRole('region')
    const eras = ERA_NAMES.filter(e => CARDS.some(c => c.era === e))
    expect(sections.map(s => s.getAttribute('aria-label'))).toEqual(eras)
    expect(visibleText(sections[0].querySelector('h2')!)).toBe(String(CARDS.filter(c => c.era === eras[0]).length))
  })

  it('lists a card under each of its identities when grouped by identity', () => {
    renderPage()
    const multi = CARDS.find(c => c.identities.length > 1)!
    fireEvent.click(within(screen.getByRole('group', { name: 'Group by' })).getByRole('button', { name: 'Identity' }))
    for (const identity of multi.identities) {
      const section = screen.getByRole('region', { name: identity })
      expect(within(section).getAllByAltText(multi.figureName).length).toBe(1)
    }
  })
})
