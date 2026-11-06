// Codebreaker: every decode-a-message system is one game (`cipher`), and the
// config id picks the system.  Checks the merged config set, the Arcade mix,
// and that every config of every system plays to a win through the one
// component at the easiest and the hardest tier.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Difficulty } from '@/games/types'
import { GAMES } from '@/games/registry'
import { buildTrack } from '@/games/arcade'
import CipherGame, { CONFIGS as SHIFTS, CONFIG_IDS, SYSTEM_OF, MORSE, type CipherSystem } from '@/components/minigames/CipherGame'
import { CONFIGS as SUBSTITUTIONS, makeCipher } from '@/components/minigames/DecodeGame'
import { CODEBOOKS, cleanMessage, type CodebookKey } from '@/components/minigames/CodebookGame'
import { mulberry32 } from '@/components/minigames/_shared'

afterEach(() => { cleanup(); vi.useRealTimers() })

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const sys = (id: string) => SYSTEM_OF[id]

describe('Codebreaker config set', () => {
  it('is the single cipher entry in the registry', () => {
    expect(GAMES.cipher.label).toBe('Codebreaker')
    expect(GAMES.cipher.category).toBe('Puzzle')
    expect(GAMES.cipher.canLose).toBe(true)
    for (const gone of ['decode', 'atbash', 'polybius', 'scytale', 'pigpen', 'braille', 'telegraph', 'binary'])
      expect(gone in GAMES, gone).toBe(false)
  })

  it('config ids are unique across every system, and CONFIG_IDS lists each exactly once', () => {
    const all = [
      ...Object.keys(SHIFTS), ...Object.keys(SUBSTITUTIONS),
      ...Object.values(CODEBOOKS).flatMap(b => Object.keys(b.CONFIGS)),
    ]
    expect(new Set(all).size).toBe(all.length)
    expect(Object.keys(SYSTEM_OF)).toHaveLength(all.length)
    expect([...CONFIG_IDS].sort()).toEqual([...all].sort())
  })

  it('neighbours in CONFIG_IDS never share a system', () => {
    for (let i = 1; i < CONFIG_IDS.length; i++)
      expect(sys(CONFIG_IDS[i]), `${CONFIG_IDS[i - 1]} → ${CONFIG_IDS[i]}`).not.toBe(sys(CONFIG_IDS[i - 1]))
  })

  it('the Arcade track mixes systems, opens on the easy ones and saves the deep ones for late', () => {
    const track = buildTrack('cipher', CONFIG_IDS)
    expect(track).toHaveLength(24)
    expect(new Set(track.map(l => l.configId)).size).toBe(24)
    for (let i = 1; i < track.length; i++) expect(sys(track[i].configId), `@${i}`).not.toBe(sys(track[i - 1].configId))
    // Six different systems in every tier.
    for (let t = 0; t < 4; t++) expect(new Set(track.slice(t * 6, t * 6 + 6).map(l => sys(l.configId))).size, `tier ${t + 1}`).toBe(6)
    const tierOf = (s: CipherSystem) => track.filter(l => sys(l.configId) === s).map(l => l.difficulty)
    expect(tierOf('atbash').every(d => d <= 2)).toBe(true)
    expect(tierOf('binary').every(d => d <= 2)).toBe(true)
    expect(Math.min(...tierOf('caesar'))).toBe(1)
    expect(Math.min(...tierOf('substitution'))).toBeGreaterThanOrEqual(3)
    expect(Math.min(...tierOf('vigenere'))).toBe(4)
    // The 11 systems all show up on the ladder.
    expect(new Set(track.map(l => sys(l.configId))).size).toBe(11)
  })
})

// ── Play every config to a win through the merged component ──────────────────

const buttons = () => screen.getAllByRole('button') as HTMLButtonElement[]
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const plus = () => fireEvent.click(screen.getAllByRole('button', { name: '+' })[0])
/** A keypad / square key, whose first line is the letter (binary keys carry a number under it). */
const key = (l: string) => {
  const label = l === 'I' && buttons().some(b => b.textContent === 'I/J') ? 'I/J' : l
  const b = buttons().find(b => (b.firstChild?.textContent ?? '') === label)
  if (!b) throw new Error(`no key ${label}`)
  fireEvent.click(b)
}
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

function solve(id: string, difficulty: Difficulty, seed: number, container: HTMLElement) {
  const system = sys(id)
  if (system === 'caesar') {
    const shift = 1 + Math.floor(mulberry32(seed)() * 25)
    for (let g = 0; g < shift; g++) plus()
    press(difficulty >= 3 ? 'Check this shift' : 'Read the message')
  } else if (system === 'vigenere') {
    const kw = SHIFTS[id].keyword!.toUpperCase()
    const ups = screen.getAllByRole('button', { name: '▲' })
    ;[...kw].forEach((c, i) => { for (let k = 0; k < A.indexOf(c); k++) fireEvent.click(ups[i]) })
    press('Read the message')
  } else if (system === 'morse') {
    for (const c of SHIFTS[id].plaintext.toUpperCase().replace(/ /g, '')) {
      for (const s of MORSE[c]) press(s === '.' ? '·' : '—')
      press('Send')
      advance(400)
    }
  } else if (system === 'substitution') {
    const cipher = makeCipher(id)
    const tiles = [...container.querySelectorAll('.cursor-pointer')] as HTMLElement[]
    const plain = SUBSTITUTIONS[id].plaintext.toUpperCase().replace(/ /g, '')
    tiles.forEach((tile, i) => {
      expect(tile.textContent?.[0]).toBe(cipher[plain[i]])
      fireEvent.click(tile)
      press(plain[i])
      fireEvent.click(tile)  // deselect
    })
  } else if (system === 'scytale') {
    const n = cleanMessage(CODEBOOKS.scytale.CONFIGS[id].plaintext).replace(/ /g, '').length
    const options = [3, 4, 5, 6].filter(r => n / r >= 3)
    const rows = options[Math.floor(mulberry32(seed)() * options.length)] ?? 3
    for (let g = 2; g < rows; g++) plus()
    press(difficulty >= 3 ? 'Check this rod' : 'Read the message')
  } else {
    for (const c of cleanMessage(CODEBOOKS[system as CodebookKey].CONFIGS[id].plaintext).replace(/ /g, '')) key(c === 'J' && system === 'polybius' ? 'I' : c)
  }
}

describe('every Codebreaker config is winnable through the merged component', () => {
  for (const id of CONFIG_IDS) for (const difficulty of [1, 4] as Difficulty[]) {
    it(`${sys(id)}/${id} D${difficulty}`, () => {
      vi.useFakeTimers()
      const seed = 13
      const onWin = vi.fn(), onLose = vi.fn()
      const { container } = render(createElement(CipherGame, { configId: id, difficulty, seed, onWin, onLose }))
      solve(id, difficulty, seed, container)
      advance(2000)
      expect(onLose).not.toHaveBeenCalled()
      expect(onWin).toHaveBeenCalledTimes(1)
    })
  }

  it('an unknown config id falls back to the Caesar wheel', () => {
    render(createElement(CipherGame, { configId: 'no-such-cipher', difficulty: 1, seed: 1, onWin: () => {}, onLose: () => {} }))
    expect(screen.getByTestId('caesar-reading')).toBeTruthy()
  })
})
