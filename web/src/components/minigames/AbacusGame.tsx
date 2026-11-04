import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import {
  mulberry32, hashString, randInt, pick, resolveConfig, scale, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar, type Rng,
} from './_shared'

// Suanpan — work a bead abacus.  Each rod has "heaven" beads worth five above
// the beam and "earth" beads worth one below it; a bead counts when it is
// pushed against the beam.  Tapping a bead moves it (and every bead between it
// and the beam) just as fingers do on a real frame.  Each step names an
// operation; work it on the beads and press Enter — the frame must then show
// the new running total.  A wrong Enter is a mistake.
//
//   config         frame            rule twist
//   ming-shop      suanpan 2/5      a merchant's bill: add each item, carries
//   tax-roll       suanpan 2/5      the frame starts loaded; subtract levies, borrows
//   soroban-flash  soroban 1/4      each amount flashes for a few seconds, then hides
//   roman-board    Roman board 1/4  amounts are written in Roman numerals
//   timed-ledger   suanpan 2/5      mixed + and − against the clock, no reading shown
//
//   tier  rods  steps  amounts          carries/borrows        mistakes  ≈ time
//   D1    3     3      2-digit          at least one           3         ~1 min
//   D2    4     4      2–3 digit        every step             3         ~1.5 min
//   D3    5     5      3-digit          every step             2         ~2–2.5 min
//   D4    6     5      3–4 digit        every step, ≥2 multi   2         ~3 min
//
// The Roman board always has four columns (I X C M); its totals stay under
// 100 / 400 / 2000 / 4000.  The timed ledger allows 70 / 110 / 150 / 180 s;
// flash amounts show for 6 / 5 / 4 / 4 s.  The bead reading is printed under
// the frame only on the easy tiers of the gentler configs.

export type Op = 'set' | 'add' | 'sub'

interface AbacusConfig {
  title: string
  intro: string
  fact: string
  /** Heaven beads (worth 5) and earth beads (worth 1) per rod. */
  upper: number
  lower: number
  ops: 'add' | 'sub' | 'mixed' | 'roman'
  unit: string
  items: string[]
  /** Highest difficulty at which the reading is shown. */
  readingUpTo: number
  flash?: boolean
  timed?: boolean
}

export const CONFIGS: Record<string, AbacusConfig> = {
  'ming-shop': {
    title: 'The Merchant’s Bill',
    intro: 'A silk merchant in Nanjing reads out his bill. Add each item on the suanpan and press Enter — the beads must show the running total.',
    fact: 'Cheng Dawei’s Suanfa Tongzong (1592), a Ming handbook of abacus arithmetic, was so popular that it was reprinted for three centuries and spread the suanpan across East Asia.',
    upper: 2, lower: 5, ops: 'add', unit: 'wén', readingUpTo: 2,
    items: ['silk bolt', 'tea brick', 'lacquer box', 'porcelain bowl', 'ink stick', 'jade comb', 'paper ream', 'salt sack', 'fan', 'brush set'],
  },
  'tax-roll': {
    title: 'The Ming Tax Roll',
    intro: 'The county granary’s stock is already on the frame. Subtract each levy as the clerk calls it — borrow from the next rod when a column runs short.',
    fact: 'The Ming “Yellow Registers” (from 1381) recorded every household for taxation; clerks re-compiled them every ten years, and counting-frame arithmetic kept the totals.',
    upper: 2, lower: 5, ops: 'sub', unit: 'dàn', readingUpTo: 2,
    items: ['grain levy', 'corvée rice', 'soldiers’ ration', 'canal tribute', 'relief store', 'salt-tax rice', 'post-station feed', 'temple share'],
  },
  'soroban-flash': {
    title: 'Flash Soroban',
    intro: 'Each amount flashes for a few seconds and then hides. Add it on the soroban (one bead of five, four of one) before you forget it.',
    fact: 'The Japanese soroban took its modern one-and-four bead form in the 1930s; trained users today practise “flash anzan”, adding numbers shown for a fraction of a second on an imagined abacus.',
    upper: 1, lower: 4, ops: 'add', unit: 'mon', readingUpTo: 1, flash: true,
    items: ['rice tally', 'cloth tally', 'sake tally', 'charcoal tally', 'oil tally', 'fish tally'],
  },
  'roman-board': {
    title: 'The Roman Counting Board',
    intro: 'A Roman banker writes in numerals: columns I, X, C and M, with a five-bead (V, L, D) above each. Set the first sum, then add each one after.',
    fact: 'Romans reckoned with pebbles — calculi — on counting boards, and pocket bronze abaci with one bead above and four below each slot survive; “calculate” comes from calculus, a small stone.',
    upper: 1, lower: 4, ops: 'roman', unit: 'denarii', readingUpTo: 1,
    items: ['wine amphorae', 'olive oil', 'a mule', 'lamp oil', 'a toga', 'grain dole', 'bath fees', 'a slave’s wage'],
  },
  'timed-ledger': {
    title: 'The Timed Ledger',
    intro: 'Market day is closing. Work every receipt and payment on the suanpan before the gong — no reading on the frame to help you.',
    fact: 'In 1946 a Japanese clerk, Kiyoshi Matsuzaki, beat a US Army soldier with an electric calculator in a Tokyo contest of addition, subtraction and division, 4 rounds to 1.',
    upper: 2, lower: 5, ops: 'mixed', unit: 'wén', readingUpTo: 1, timed: true,
    items: ['rice sold', 'cloth bought', 'tea sold', 'rent paid', 'pottery sold', 'wages paid', 'silk sold', 'boat hire'],
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Pure logic ─────────────────────────────────────────────────────────────────

/** Per rod: heaven beads at the beam (u) and earth beads at the beam (l). */
export interface Rod { u: number; l: number }

export const rodValue = (r: Rod) => 5 * r.u + r.l

/** The number shown, rods left (most significant) to right. */
export function readAbacus(rods: Rod[]): number {
  return rods.reduce((acc, r) => acc * 10 + rodValue(r), 0)
}

/** Tapping bead `i` (0 = nearest the beam) of a section holding `n` beads at the beam. */
export function tapCount(current: number, i: number): number {
  return i < current ? i : i + 1
}

/** Which bead to tap to bring a section from `current` to `target` beads at the beam. */
export function beadFor(current: number, target: number): number | null {
  if (target === current) return null
  return target > current ? target - 1 : target
}

/** Standard (one heaven bead at most) representation of a number. */
export function rodsFor(value: number, count: number): Rod[] {
  const out: Rod[] = []
  let v = value
  for (let k = 0; k < count; k++) {
    const d = v % 10
    out.unshift({ u: d >= 5 ? 1 : 0, l: d % 5 })
    v = Math.floor(v / 10)
  }
  return out
}

const ROMAN: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
]

export function toRoman(n: number): string {
  let s = ''
  for (const [v, sym] of ROMAN) while (n >= v) { s += sym; n -= v }
  return s || 'nulla'
}

const digits = (n: number) => String(n).split('').reverse().map(Number)

/** Columns where a + b carries. */
export function carryCount(a: number, b: number): number {
  const da = digits(a), db = digits(b)
  let carry = 0, count = 0
  for (let k = 0; k < Math.max(da.length, db.length); k++) {
    const s = (da[k] ?? 0) + (db[k] ?? 0) + carry
    carry = s >= 10 ? 1 : 0
    count += carry
  }
  return count
}

/** Columns where a − b borrows (a ≥ b). */
export function borrowCount(a: number, b: number): number {
  const da = digits(a), db = digits(b)
  let borrow = 0, count = 0
  for (let k = 0; k < da.length; k++) {
    const s = da[k] - (db[k] ?? 0) - borrow
    borrow = s < 0 ? 1 : 0
    count += borrow
  }
  return count
}

export interface Step { op: Op; amount: number; total: number; item: string }

export interface Tier { rods: number; steps: number; minAmt: number; maxAmt: number; mistakes: number; seconds: number; flash: number }

export function tierFor(config: Pick<AbacusConfig, 'ops'>, difficulty: Difficulty): Tier {
  const roman = config.ops === 'roman'
  return {
    rods: roman ? 4 : scale(difficulty, [3, 4, 5, 6]),
    steps: roman ? scale(difficulty, [3, 4, 4, 5]) : scale(difficulty, [3, 4, 5, 5]),
    minAmt: roman ? scale(difficulty, [10, 20, 100, 200]) : scale(difficulty, [10, 40, 100, 300]),
    maxAmt: roman ? scale(difficulty, [45, 140, 600, 900]) : scale(difficulty, [99, 999, 999, 4999]),
    mistakes: scale(difficulty, [3, 3, 2, 2]),
    seconds: scale(difficulty, [70, 110, 150, 180]),
    flash: scale(difficulty, [6, 5, 4, 4]),
  }
}

export interface Puzzle { config: AbacusConfig; tier: Tier; start: number; steps: Step[] }

/** The cap on any running total: the frame's width (or the Roman board's tier limit). */
function capFor(config: AbacusConfig, tier: Tier, difficulty: Difficulty): number {
  if (config.ops === 'roman') return scale(difficulty, [99, 399, 1999, 3999])
  return 10 ** tier.rods - 1
}

function tryGenerate(config: AbacusConfig, difficulty: Difficulty, rng: Rng): Puzzle | null {
  const tier = tierFor(config, difficulty)
  const cap = capFor(config, tier, difficulty)
  const steps: Step[] = []
  const items = [...config.items]
  const nextItem = () => items.length ? items.splice(Math.floor(rng() * items.length), 1)[0] : pick(config.items, rng)
  const amount = () => randInt(rng, tier.minAmt, tier.maxAmt)
  let start = 0
  let total = 0
  if (config.ops === 'sub') {
    // Load the frame with enough stock for every levy.
    start = randInt(rng, Math.floor(cap * 0.55), cap)
    total = start
  }
  let worked = 0, multi = 0
  for (let s = 0; s < tier.steps; s++) {
    let op: Op
    if (config.ops === 'roman') op = s === 0 ? 'set' : 'add'
    else if (config.ops === 'mixed') op = s === 0 ? 'add' : rng() < 0.5 ? 'sub' : 'add'
    else op = config.ops
    let ok = false
    for (let guard = 0; guard < 80 && !ok; guard++) {
      const a = amount()
      const next = op === 'sub' ? total - a : op === 'add' ? total + a : a
      if (next < 0 || next > cap) {
        // A mixed ledger that cannot add any more turns to a payment.
        if (config.ops === 'mixed' && op === 'add' && total > tier.minAmt) op = 'sub'
        continue
      }
      const c = op === 'add' ? carryCount(total, a) : op === 'sub' ? borrowCount(total, a) : 0
      const needWork = op !== 'set' && total > 0 && difficulty >= 2
      if (needWork && c === 0) continue
      if (c > 0) worked++
      if (c > 1) multi++
      steps.push({ op, amount: a, total: next, item: nextItem() })
      total = next
      ok = true
    }
    if (!ok) return null
  }
  if (worked < 1) return null
  if (difficulty === 4 && config.ops !== 'roman' && multi < 2) return null
  return { config, tier, start, steps }
}

export function generate(config: AbacusConfig, difficulty: Difficulty, seed: number): Puzzle {
  const rng = mulberry32(seed ^ hashString(config.ops + config.upper + (config.flash ? 'f' : '') + (config.timed ? 't' : '')))
  for (let attempt = 0; attempt < 200; attempt++) {
    const p = tryGenerate(config, difficulty, rng)
    if (p) return p
  }
  // Unreachable in practice (tests check every tier); a tiny fixed bill keeps the game playable.
  const tier = tierFor(config, difficulty)
  const op: Op = config.ops === 'sub' ? 'sub' : config.ops === 'roman' ? 'set' : 'add'
  return { config, tier, start: config.ops === 'sub' ? 95 : 0, steps: [{ op, amount: 47, total: op === 'sub' ? 48 : 47, item: config.items[0] }] }
}

// ── Component ──────────────────────────────────────────────────────────────────

const PLACE = ['ones', 'tens', 'hundreds', 'thousands', 'ten-thousands', 'hundred-thousands']
const ROMAN_COL = [['I', 'V'], ['X', 'L'], ['C', 'D'], ['M', '']]

export default function AbacusGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'ming-shop')
  const base = CONFIGS[configId] ?? CONFIGS['ming-shop']
  const puzzle = useMemo(() => generate(base, difficulty, seed), [base, difficulty, seed])
  const { tier, steps } = puzzle
  const roman = base.ops === 'roman'
  const [rods, setRods] = useState<Rod[]>(() => rodsFor(puzzle.start, tier.rods))
  const [stepIdx, setStepIdx] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [flashOn, setFlashOn] = useState(true)
  const [flashKey, setFlashKey] = useState(0)
  const [shake, setShake] = useState(false)
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const timer = useGameTimer({ seconds: base.timed ? tier.seconds : 0, running: !settled, onExpire: () => lose('The gong sounded — the market is closed') })

  const step = steps[Math.min(stepIdx, steps.length - 1)]
  const reading = readAbacus(rods)
  const showReading = difficulty <= base.readingUpTo
  const prevTotal = stepIdx === 0 ? puzzle.start : steps[stepIdx - 1].total

  // Flash amounts hide after a few seconds (and re-flash after a mistake).
  useEffect(() => {
    if (!base.flash || settled) return
    setFlashOn(true)
    const t = setTimeout(() => setFlashOn(false), tier.flash * 1000)
    return () => clearTimeout(t)
  }, [base.flash, stepIdx, flashKey, tier.flash, settled])

  const tap = useCallback((r: number, part: 'u' | 'l', i: number) => {
    if (settled) return
    setRods(prev => prev.map((rod, k) => (k === r ? { ...rod, [part]: tapCount(rod[part], i) } : rod)))
  }, [settled])

  const clear = useCallback(() => { if (!settled) setRods(rodsFor(0, tier.rods)) }, [settled, tier.rods])

  const enter = useCallback(() => {
    if (settled) return
    if (readAbacus(rods) === step.total) {
      if (stepIdx + 1 >= steps.length) { win(); return }
      setStepIdx(stepIdx + 1)
      return
    }
    const m = mistakes + 1
    setMistakes(m)
    setShake(true)
    setTimeout(() => setShake(false), 400)
    if (m >= tier.mistakes) lose(`The ledger doesn’t balance — it should read ${roman ? toRoman(step.total) : step.total}`)
    else if (base.flash) setFlashKey(k => k + 1)
  }, [settled, rods, step, stepIdx, steps.length, mistakes, tier.mistakes, win, lose, roman, base.flash])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); enter() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [enter])

  const fmt = (n: number) => (roman ? toRoman(n) : n.toLocaleString('en-US'))
  const opSign = step.op === 'add' ? '+' : step.op === 'sub' ? '−' : 'Set'
  const amountHidden = base.flash && !flashOn && !settled
  const beadW = tier.rods >= 6 ? 'w-9' : 'w-11'
  const slot = 18 // px per bead slot

  const bead = (r: number, part: 'u' | 'l', i: number, active: boolean) => (
    <button key={`${part}${i}`} type="button" data-bead={`${r}-${part}-${i}`} data-active={active ? 'true' : 'false'}
      aria-label={`rod ${r + 1} ${part === 'u' ? 'heaven' : 'earth'} bead ${i + 1}`}
      onClick={() => tap(r, part, i)} disabled={settled}
      className={`${beadW} shrink-0 rounded-[50%] border transition-colors duration-150 active:scale-95
        ${active ? 'bg-amber-700 border-amber-900' : 'bg-amber-900/40 border-amber-900/50'}`}
      style={{ height: slot - 2, margin: '1px 0' }} />
  )

  const section = (r: number, part: 'u' | 'l', n: number, count: number) => {
    const idx = Array.from({ length: n }, (_, i) => i)
    const atBeam = idx.filter(i => i < count)
    const away = idx.filter(i => i >= count)
    const h = (n + 1) * slot
    return part === 'u' ? (
      <div className="flex flex-col items-center" style={{ height: h }}>
        {[...away].reverse().map(i => bead(r, part, i, false))}
        <div className="flex-1" />
        {[...atBeam].reverse().map(i => bead(r, part, i, true))}
      </div>
    ) : (
      <div className="flex flex-col items-center" style={{ height: h }}>
        {atBeam.map(i => bead(r, part, i, true))}
        <div className="flex-1" />
        {away.map(i => bead(r, part, i, false))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
          <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          <p className="font-bold text-ink-2" data-testid="abacus-step">Step {Math.min(stepIdx + 1, steps.length)}/{steps.length}</p>
          <p data-testid="abacus-mistakes">✗ {mistakes}/{tier.mistakes}</p>
        </div>
      </div>

      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}

      <div className={`rounded-xl border border-line bg-panel p-3 flex items-center justify-between gap-2 ${shake ? 'animate-pulse' : ''}`}>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted truncate">{step.item}</p>
          <p className="text-ink font-bold text-xl tabular-nums" data-testid="abacus-task">
            {opSign} {amountHidden ? '• • •' : fmt(step.amount)} <span className="text-xs text-muted font-normal">{base.unit}</span>
          </p>
        </div>
        {stepIdx > 0 || puzzle.start > 0 ? (
          <p className="text-[10px] text-muted text-right">
            {base.flash || base.timed ? 'Keep the total on the beads' : <>Running total<br /><span className="text-ink-2 font-bold text-xs">{fmt(prevTotal)}</span></>}
          </p>
        ) : null}
      </div>

      <div className="mx-auto rounded-xl p-2 border-4 border-amber-950 bg-amber-100/30 shadow-inner">
        <div className="flex gap-1 justify-center">
          {rods.map((rod, r) => (
            <div key={r} className="relative flex flex-col items-center" data-rod={r}>
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-amber-950/60" />
              <div className="relative">{section(r, 'u', base.upper, rod.u)}</div>
              <div className="relative w-full h-2 bg-amber-950 my-0.5" />
              <div className="relative">{section(r, 'l', base.lower, rod.l)}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-1 justify-center mt-1">
          {rods.map((_, r) => {
            const place = tier.rods - 1 - r
            return (
              <span key={r} className={`${beadW} text-center text-[9px] text-muted leading-tight`}>
                {roman ? `${ROMAN_COL[place][0]}${ROMAN_COL[place][1] ? '/' + ROMAN_COL[place][1] : ''}` : PLACE[place].replace('-', ' ')}
              </span>
            )
          })}
        </div>
      </div>

      {showReading && (
        <p className="text-center text-xs text-muted" data-testid="abacus-reading">
          The beads read <span className="font-bold text-ink-2 tabular-nums">{fmt(reading)}</span>
        </p>
      )}

      {!settled && (
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={clear} className="h-10 rounded-lg border border-line bg-panel text-xs font-bold text-ink-2">
            Clear
          </button>
          <button type="button" data-testid="abacus-enter" onClick={enter}
            className="col-span-2 h-10 rounded-lg bg-accent text-accent-fg text-sm font-bold">
            Enter ↵
          </button>
        </div>
      )}

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The accounts balance!" loseTitle={reason ?? 'The accounts do not balance'} />
    </div>
  )
}
