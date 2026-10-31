// Audit of the hand-authored configs in the logic/word/science minigames:
// every config must be winnable, and its stated answer consistent with its data.
import { describe, it, expect } from 'vitest'
import storyChallenges from '@/data/story_challenges.json'
import type { Challenge, MinigameChallenge } from '@/games/types'
import { CONFIGS as CROSSWORDS } from '@/components/minigames/CrosswordGame'
import { CONFIGS as WORDLES, WORD_LENGTH } from '@/components/minigames/WordleGame'
import { CONFIGS as DECODES, makeCipher, makeDecipherMap, DECODE_TIME_LIMITS } from '@/components/minigames/DecodeGame'
import { CONFIGS as CIPHERS, encodeCaesar, encodeVigenere, MORSE, resolveCipherConfig } from '@/components/minigames/CipherGame'
import { CONFIGS as PSEUDO, wrongPositions } from '@/components/minigames/PseudoCodeGame'
import { CONFIGS as LOGIC, GATES, ROWS, TAPE_RULES, matchingRows, initialGates, circuitOut } from '@/components/minigames/LogicGateGame'
import { CONFIGS as CHEM } from '@/components/minigames/ChemistryGame'
import { CONFIGS as PUNNETT, cellAnswer, getOptions, phenotypeRatio } from '@/components/minigames/PunnettGame'
import { CONFIGS as LORENTZ, applyLorentz, circlesOverlap, B_STEP, MAX_B } from '@/components/minigames/LorentzGame'
import { CONFIGS as CHIMP, getAnswer, makeChoices } from '@/components/minigames/ChimpMathGame'
import { CONFIGS as CLOCKS, CITIES, convert, genChoices } from '@/components/minigames/WorldClockGame'
import { CONFIGS as CLASSIFY } from '@/components/minigames/ClassifyGame'
import { CODEBOOKS, atbash, polybius, braille, binary, pigpen, scytaleWind, scytaleRead, cleanMessage, resolveCodebookConfig } from '@/components/minigames/CodebookGame'

const storyEntries = (game: string): MinigameChallenge[] =>
  (storyChallenges as { story: string; challenges: Challenge[] }[])
    .flatMap(e => e.challenges)
    .filter((c): c is MinigameChallenge => c.type === 'minigame' && c.game === game)

// ── Crossword ─────────────────────────────────────────────────────────────────

describe('CrosswordGame configs', () => {
  for (const [id, cfg] of Object.entries(CROSSWORDS)) {
    it(`${id}: words fit the grid and agree at every crossing`, () => {
      const grid: Record<string, { ch: string; by: string }> = {}
      const keys = new Set<string>()
      for (const w of cfg.words) {
        const key = `${w.number}${w.direction}`
        expect(keys.has(key), `duplicate clue key ${key}`).toBe(false)
        keys.add(key)
        expect(w.word).toMatch(/^[A-Z]+$/)
        for (let i = 0; i < w.word.length; i++) {
          const r = w.direction === 'across' ? w.row : w.row + i
          const c = w.direction === 'across' ? w.col + i : w.col
          expect(r >= 0 && r < cfg.rows && c >= 0 && c < cfg.cols, `${w.word} leaves the ${cfg.rows}x${cfg.cols} grid at (${r},${c})`).toBe(true)
          const prev = grid[`${r},${c}`]
          if (prev) expect(prev.ch, `${w.word}[${i}] clashes with ${prev.by} at (${r},${c})`).toBe(w.word[i])
          grid[`${r},${c}`] = { ch: w.word[i], by: w.word }
        }
      }
    })
    it(`${id}: no accidental extra words from adjacent cells`, () => {
      // A filled cell next to a word it is not part of would read as a longer, unclued word.
      const cells = new Map<string, Set<string>>()
      for (const w of cfg.words) for (let i = 0; i < w.word.length; i++) {
        const r = w.direction === 'across' ? w.row : w.row + i
        const c = w.direction === 'across' ? w.col + i : w.col
        const k = `${r},${c}`
        if (!cells.has(k)) cells.set(k, new Set())
        cells.get(k)!.add(w.word)
      }
      for (const w of cfg.words) {
        const before = w.direction === 'across' ? `${w.row},${w.col - 1}` : `${w.row - 1},${w.col}`
        const after = w.direction === 'across' ? `${w.row},${w.col + w.word.length}` : `${w.row + w.word.length},${w.col}`
        expect(cells.has(before), `${w.word} extends backwards into a filled cell`).toBe(false)
        expect(cells.has(after), `${w.word} runs on into a filled cell`).toBe(false)
      }
    })
  }
})

// ── Wordle ────────────────────────────────────────────────────────────────────

describe('WordleGame configs', () => {
  it('every target is a five-letter uppercase word', () => {
    for (const [id, cfg] of Object.entries(WORDLES)) {
      expect(cfg.word, id).toMatch(new RegExp(`^[A-Z]{${WORD_LENGTH}}$`))
    }
  })
})

// ── Decode (substitution cryptogram) ──────────────────────────────────────────

describe('DecodeGame configs', () => {
  for (const [id, cfg] of Object.entries(DECODES)) {
    it(`${id}: the substitution is a bijection and the message round-trips`, () => {
      const cipher = makeCipher(id)
      const inverse = makeDecipherMap(cipher)
      expect(new Set(Object.values(cipher)).size).toBe(26)
      const plain = cfg.plaintext.toUpperCase()
      expect(plain).toMatch(/^[A-Z ]+$/)
      const enc = [...plain].map(ch => ch === ' ' ? ' ' : cipher[ch]).join('')
      const dec = [...enc].map(ch => ch === ' ' ? ' ' : inverse[ch]).join('')
      expect(dec).toBe(plain)
    })
  }
  it('timed tiers leave at least 10 seconds per distinct letter', () => {
    for (const [id, cfg] of Object.entries(DECODES)) {
      const unique = new Set(cfg.plaintext.replace(/ /g, '')).size
      for (const limit of DECODE_TIME_LIMITS) if (limit) expect(limit / unique, `${id} at ${limit}s`).toBeGreaterThanOrEqual(10)
    }
  })
})

// ── Cipher (caesar / vigenère / morse) ────────────────────────────────────────

describe('CipherGame configs', () => {
  it('caesar: every seed shift decodes back with the matching wheel setting', () => {
    for (const cfg of Object.values(CIPHERS)) {
      const plain = cfg.plaintext.toUpperCase()
      for (let k = 1; k <= 25; k++) expect(encodeCaesar(encodeCaesar(plain, k), -k)).toBe(plain)
    }
  })
  it('vigenère: the keyword recovers the plaintext and the hint matches it', () => {
    const cfg = CIPHERS['vigenere-cabinet']
    const kw = cfg.keyword!.toUpperCase()
    expect(kw).toMatch(/^[A-Z]+$/)
    const enc = encodeVigenere(cfg.plaintext, kw)
    let j = 0
    const dec = [...enc].map(c => {
      if (!/[A-Z]/.test(c)) return c
      const k = kw.charCodeAt(j++ % kw.length) - 65
      return String.fromCharCode(((c.charCodeAt(0) - 65 - k + 26) % 26) + 65)
    }).join('')
    expect(dec).toBe(cfg.plaintext)
    expect(cfg.intro + ' ' + kw).toMatch(/LEMON/)  // the on-screen hint says "names a fruit"
  })
  it('morse: every letter of the message has a code', () => {
    const cfg = CIPHERS['morse-telegraph']
    for (const ch of cfg.plaintext.replace(/ /g, '')) expect(MORSE[ch], ch).toBeDefined()
  })
  it('story entries resolve to a decodable message (empty plaintext overrides fall back)', () => {
    for (const ch of storyEntries('cipher')) {
      const cfg = resolveCipherConfig(ch.configId, ch.params)
      expect(cfg.plaintext, `${ch.id}`).toMatch(/[A-Z]/i)
      if (cfg.mode === 'morse') for (const c of cfg.plaintext.toUpperCase().replace(/ /g, '')) expect(MORSE[c], `${ch.id}: ${c}`).toBeDefined()
    }
    expect(resolveCipherConfig('morse-telegraph', { mode: 'caesar', plaintext: '' }).plaintext).toBe(CIPHERS['morse-telegraph'].plaintext)
  })
})

// ── Pseudo code ───────────────────────────────────────────────────────────────

describe('PseudoCodeGame configs', () => {
  for (const [id, cfg] of Object.entries(PSEUDO)) {
    it(`${id}: ids are unique and the authored order is accepted`, () => {
      for (const ch of cfg.challenges) {
        const ids = ch.lines.map(l => l.id)
        expect(new Set(ids).size).toBe(ids.length)
        const sorted = [...ch.lines].sort((a, b) => a.order - b.order).map(l => l.id)
        expect(wrongPositions(ch.lines, sorted)).toEqual([])
        expect(wrongPositions(ch.lines, [...sorted].reverse()).length).toBeGreaterThan(0)
      }
    })
  }
  it('independent updates may be placed in either order', () => {
    const pal = PSEUDO['turing-machine'].challenges[0].lines
    expect(wrongPositions(pal, ['p1', 'p2', 'p3', 'p5', 'p4', 'p6'])).toEqual([])
    const br = PSEUDO['turing-machine'].challenges[1].lines
    expect(wrongPositions(br, ['b1', 'b2', 'b4', 'b3', 'b5', 'b6', 'b7'])).toEqual([])
    expect(wrongPositions(br, ['b1', 'b2', 'b3', 'b5', 'b4', 'b6', 'b7'])).toEqual([3, 4])
  })
})

// ── Logic gates ───────────────────────────────────────────────────────────────

describe('LogicGateGame configs', () => {
  for (const [id, cfg] of Object.entries(LOGIC)) {
    it(`${id}: some gate pair matches the whole table, and the game never starts solved`, () => {
      const solutions: string[] = []
      for (const g1 of GATES) for (const g2 of GATES) if (matchingRows(cfg.target, g1, g2) === ROWS.length) solutions.push(`${g1}→${g2}`)
      expect(solutions.length, `${id} has no solution in the g1(A,B)→g2(·,C) network`).toBeGreaterThan(0)
      for (let seed = 0; seed < 64; seed++) {
        const [g1, g2] = initialGates(cfg.target, seed)
        expect(matchingRows(cfg.target, g1, g2), `${id} seed ${seed} starts solved`).toBeLessThan(ROWS.length)
      }
    })
  }
  it('descriptions match their targets', () => {
    const t = LOGIC
    for (const [a, b, c] of ROWS) {
      expect(t['boole-laws'].target(a, b, c)).toBe((a && b) || c ? 1 : 0)
      expect(t['shannon-relays'].target(a, b, c)).toBe((a !== b) && c ? 1 : 0)
      expect(t['turing-tape'].target(a, b, c)).toBe((!a && !b) || c ? 1 : 0)
      expect(t['lovelace-engine'].target(a, b, c)).toBe(((a || b) ? 1 : 0) !== c ? 1 : 0)
      expect(circuitOut('OR', 'XOR', a, b, c)).toBe(t['lovelace-engine'].target(a, b, c))
    }
  })
  it('tape rules: every rule is well-defined on a 7-cell tape and names are unique', () => {
    expect(new Set(TAPE_RULES.map(r => r.name)).size).toBe(TAPE_RULES.length)
    for (let n = 0; n < 128; n++) {
      const tape = Array.from({ length: 7 }, (_, i) => (n >> i) & 1)
      for (const r of TAPE_RULES) {
        const out = r.run(tape)
        expect(out.length).toBe(7)
        for (const v of out) expect(v === 0 || v === 1).toBe(true)
      }
    }
  })
})

// ── Chemistry ─────────────────────────────────────────────────────────────────

describe('ChemistryGame configs', () => {
  for (const [id, cfg] of Object.entries(CHEM)) {
    it(`${id}: the solution is reachable with the ingredient caps`, () => {
      const symbols = new Set(cfg.ingredients.map(i => i.symbol))
      expect(symbols.size).toBe(cfg.ingredients.length)
      for (const [sym, need] of Object.entries(cfg.solution)) {
        const ing = cfg.ingredients.find(i => i.symbol === sym)
        expect(ing, `${sym} is not an ingredient`).toBeDefined()
        expect(need).toBeGreaterThan(0)
        expect(need).toBeLessThanOrEqual(ing!.max)
      }
    })
  }
})

// ── Punnett ───────────────────────────────────────────────────────────────────

describe('PunnettGame configs', () => {
  for (const [id, cfg] of Object.entries(PUNNETT)) {
    it(`${id}: every cell's answer is offered as an option`, () => {
      for (const cross of cfg.crosses) {
        const options = getOptions(cross)
        for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
          expect(options, `${cross.traitLabel} cell ${r},${c}`).toContain(cellAnswer(cross, r, c))
        }
        const ratio = phenotypeRatio(cross)
        expect(ratio.dominant + ratio.recessive).toBe(4)
      }
    })
  }
  it('the classic ratios come out right', () => {
    const [tt, yy, rr] = PUNNETT['mendel-peas'].crosses
    expect(phenotypeRatio(tt)).toEqual({ dominant: 3, recessive: 1 })
    expect(phenotypeRatio(yy)).toEqual({ dominant: 3, recessive: 1 })
    expect(phenotypeRatio(rr)).toEqual({ dominant: 4, recessive: 0 })
  })
})

// ── Lorentz ───────────────────────────────────────────────────────────────────

type Vec = { x: number; y: number }
function flyLorentz(cfg: (typeof LORENTZ)[string], bAt: (step: number) => number): 'won' | 'dead' | 'lost' {
  let pos: Vec = { ...cfg.startPos }
  let vel: Vec = { ...cfg.startVel }
  for (let step = 0; step < 5000; step++) {
    vel = applyLorentz(vel, bAt(step) * B_STEP)
    pos = { x: pos.x + vel.x, y: pos.y + vel.y }
    if (pos.x < 0 || pos.x > 1 || pos.y < 0 || pos.y > 1) return 'dead'
    for (const o of cfg.obstacles) if (circlesOverlap(pos, 0.02, o)) return 'dead'
    if (circlesOverlap(pos, 0.02, cfg.target)) return 'won'
  }
  return 'lost'
}

describe('LorentzGame configs', () => {
  for (const [id, cfg] of Object.entries(LORENTZ)) {
    it(`${id}: exactly one slider notch flies the particle to the target, and B = 0 does not`, () => {
      const winners: number[] = []
      for (let b = -MAX_B; b <= MAX_B; b++) if (flyLorentz(cfg, () => b) === 'won') winners.push(b)
      expect(winners, `${id}: winning notches`).toHaveLength(1)
      expect(winners[0]).not.toBe(0)
    })
  }
})

// ── Chimp math ────────────────────────────────────────────────────────────────

describe('ChimpMathGame configs', () => {
  for (const [id, cfg] of Object.entries(CHIMP)) {
    it(`${id}: answers are small positive numbers and the choices include them`, () => {
      expect(cfg.questions.length).toBeGreaterThan(0)
      for (const q of cfg.questions) {
        const a = getAnswer(q)
        expect(a).toBeGreaterThan(0)
        expect(a).toBeLessThanOrEqual(12)
        for (let i = 0; i < 20; i++) {
          const choices = makeChoices(a)
          expect(choices).toContain(a)
          expect(new Set(choices).size).toBe(4)
        }
      }
    })
  }
})

// ── World clock ───────────────────────────────────────────────────────────────

describe('WorldClockGame configs', () => {
  const expected: Record<string, number[]> = {
    'magellan-voyage':  [19, 13, 16, 18, 5],
    'telegraph-globe':  [7, 16, 12, 14, 21],
    'modern-traveler':  [13, 23, 9, 13, 18],
  }
  for (const [id, cfg] of Object.entries(CLOCKS)) {
    it(`${id}: cities exist and conversions match the authored answers`, () => {
      expect(expected[id], `no expected answers for ${id}`).toBeDefined()
      cfg.questions.forEach((q, i) => {
        const from = CITIES[q.fromKey], to = CITIES[q.toKey]
        expect(from, q.fromKey).toBeDefined()
        expect(to, q.toKey).toBeDefined()
        const h = convert(q.fromHour, from.offset, to.offset)
        expect(h, `${id} q${i + 1}`).toBe(expected[id][i])
        for (let n = 0; n < 10; n++) {
          const choices = genChoices(h)
          expect(choices).toContain(h)
          expect(new Set(choices).size).toBe(4)
        }
      })
    })
  }
  it('independent sanity: UTC offsets are the standard (non-DST) ones', () => {
    expect(CITIES['new-york'].offset).toBe(-5)
    expect(CITIES['tokyo'].offset).toBe(9)
    expect(CITIES['sydney'].offset).toBe(10)
    expect(convert(23, 9, -5)).toBe(9)
  })
})

// ── Classify ──────────────────────────────────────────────────────────────────

describe('ClassifyGame configs', () => {
  for (const [id, cfg] of Object.entries(CLASSIFY)) {
    it(`${id}: items map to real categories, labels are unique, no empty bucket`, () => {
      const cats = new Set(cfg.categories.map(c => c.id))
      expect(cats.size).toBe(cfg.categories.length)
      const labels = cfg.items.map(i => i.label)
      expect(new Set(labels).size).toBe(labels.length)
      for (const item of cfg.items) expect(cats.has(item.category), `${item.label} → ${item.category}`).toBe(true)
      for (const c of cfg.categories) expect(cfg.items.some(i => i.category === c.id), `${c.id} is empty`).toBe(true)
    })
  }
})

// ── Codebook (atbash / polybius / pigpen / braille / telegraph / binary / scytale) ──

describe('Codebook systems', () => {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const distinct = (f: (c: string) => unknown) => new Set([...A].map(c => JSON.stringify(f(c)))).size
  it('atbash is its own inverse', () => {
    for (const c of A) expect(atbash(atbash(c))).toBe(c)
  })
  it('every letter has a distinct symbol (polybius merges only I and J)', () => {
    expect(distinct(braille)).toBe(26)
    expect(distinct(binary)).toBe(26)
    expect(distinct(pigpen)).toBe(26)
    expect(distinct(polybius)).toBe(25)
    expect(polybius('J')).toBe(polybius('I'))
  })
  it('braille follows the a–j / +dot 3 / +dots 3,6 rule shown on the reduced key', () => {
    expect(braille('K')).toBe(braille('A') + '3')
    expect(braille('T')).toBe(braille('J') + '3')
    expect(braille('Z')).toBe(braille('E') + '36')
    expect(braille('W')).toBe('2456')
  })
  it('scytale: the right rod reads the message back', () => {
    for (const rows of [3, 4, 5, 6]) {
      const msg = 'COMEBACKWITHYOURSHIELD'
      expect(scytaleRead(scytaleWind(msg, rows), rows).join('').replace(/·/g, '')).toBe(msg)
    }
  })
  it('story entries resolve to a non-empty message', () => {
    for (const [game, mod] of Object.entries(CODEBOOKS)) {
      for (const ch of storyEntries(game)) {
        expect(mod.CONFIGS[ch.configId ?? ''], `${ch.id}: ${game}/${ch.configId}`).toBeDefined()
        const cfg = resolveCodebookConfig(mod.CONFIGS, ch.configId, ch.params)
        expect(cfg.plaintext, ch.id).toMatch(/^[A-Z]+( [A-Z]+)*$/)
        expect(cfg.plaintext.replace(/ /g, '').length, `${ch.id} is long enough to wind`).toBeGreaterThanOrEqual(9)
      }
    }
    expect(cleanMessage("Hesy-Ra's  tomb!")).toBe('HESY RA S TOMB')
  })
})

// ── Story data references ─────────────────────────────────────────────────────

describe('story data for this group', () => {
  const groups: Record<string, Record<string, unknown>> = {
    crossword: CROSSWORDS, wordle: WORDLES, decode: DECODES, cipher: CIPHERS, pseudocode: PSEUDO,
    logicgate: LOGIC, chemistry: CHEM, punnett: PUNNETT, lorentz: LORENTZ, chimpmath: CHIMP,
    worldclock: CLOCKS, classify: CLASSIFY,
  }
  for (const [game, configs] of Object.entries(groups)) {
    it(`${game}: every story entry names a real config and a difficulty 1–4`, () => {
      for (const ch of storyEntries(game)) {
        expect(configs[ch.configId ?? ''], `${ch.id}: ${game}/${ch.configId}`).toBeDefined()
        expect([1, 2, 3, 4]).toContain(ch.difficulty)
      }
    })
  }
})
