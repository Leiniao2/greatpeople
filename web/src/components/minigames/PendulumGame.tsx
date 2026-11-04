import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, hashString, pick, shuffle, randInt, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Pendulum Clock — real pendulum physics, played quickly.  A simple pendulum
// of length L swings with period T = 2π√(L/g) (g = 9.81 m/s²): the period
// depends on the length only, not on the weight of the bob or (for small
// swings) the amplitude.  Four configs, four different rules:
//
//   huygens-clock  regulate a clock: set the bob length, run it for an hour and
//                  read how many seconds it gained or lost; get within tolerance
//                  before the trials run out (L_new = L·(1 + gain/3600)²)
//   match-clocks   tune follower clocks to beat at given ratios to a master
//                  (p beats per q of the master → L = L_master·(q/p)²)
//   galileo        watch live pendulums with different weights, amplitudes and
//                  lengths; pick the ones that keep time with the reference
//   foucault       the swing plane turns 15°·sin(latitude) an hour (clockwise in
//                  the north, anticlockwise in the south): set the dial, or name
//                  the city from the turn
//
//   tier  huygens (tol / trials / step)   match (clocks, tol)   galileo (rounds × cand, Δlength)   foucault (rounds, tol, help)        ≈ time
//   D1    ±20 s/h, 5 trials, 1 mm, period shown   1 clock, 3 %, period shown   2 × 4, 35–60 %     2, ±8°, rate per hour shown        ~1 min
//   D2    ±10 s/h, 4 trials, 1 mm                 2 clocks, 2 %               3 × 5, 20–35 %     3, ±5°, sin φ shown                ~1.5 min
//   D3    ±5 s/h, 3 trials, 0.1 mm                3 clocks, 1 %               3 × 6, 12–20 %     3, ±3°, south + 1 reverse round    ~2–2.5 min
//   D4    ±3 s/h, 3 trials, 0.1 mm                3 clocks, 0.5 %, harder     4 × 6, 7–12 %      4, ±2°, south + 2 reverse rounds   ~3 min
//
// Mistakes allowed (match, galileo, foucault): 3 / 3 / 2 / 2.

export const G = 9.81

type Kind = 'huygens-clock' | 'match-clocks' | 'galileo' | 'foucault'

interface PendulumConfig { title: string; intro: string; fact: string; kind: Kind }

export const CONFIGS: Record<string, PendulumConfig> = {
  'huygens-clock': {
    title: 'Huygens’ Clock',
    intro: 'This clock does not keep time. Move the bob to change the pendulum’s length, run the clock for an hour against the church bell, and read how far it is off. A shorter pendulum swings faster.',
    fact: 'Christiaan Huygens built the first pendulum clock in 1656 and patented it in 1657; it cut the error of the best clocks from about 15 minutes a day to about 15 seconds.',
    kind: 'huygens-clock',
  },
  'qing-clockworks': {
    title: 'The Palace Clock Workshop',
    intro: 'A new pendulum clock for the Forbidden City does not keep time. Move the bob to change the pendulum’s length, run the clock for an hour against the palace timekeeper, and read how far it is off. A shorter pendulum swings faster.',
    fact: 'The Qing palace workshops in Beijing had their own clock-making shop, where Jesuit clockmakers and Chinese craftsmen built and repaired pendulum clocks and automata for the Kangxi, Yongzheng and Qianlong emperors.',
    kind: 'huygens-clock',
  },
  'match-clocks': {
    title: 'Clocks in Sympathy',
    intro: 'Tune each clock to beat at its ratio to the master clock. Period goes with the square root of length: to beat twice as fast, a pendulum must be a quarter as long.',
    fact: 'In 1665, ill in bed, Huygens noticed two of his pendulum clocks hanging from the same beam had fallen into step, swinging in exactly opposite phase — the first recorded observation of coupled oscillators, which he called “odd sympathy”.',
    kind: 'match-clocks',
  },
  galileo: {
    title: 'Galileo’s Chandelier',
    intro: 'Watch the lamps swing. Tap every pendulum that keeps time with the reference — then confirm. Heavy or light, wide swing or narrow: only one thing sets the beat.',
    fact: 'As a student in Pisa around 1583, Galileo is said to have timed a swinging cathedral lamp with his pulse and found that wide and narrow swings took the same time; his 1638 Two New Sciences states that the period depends on the length alone.',
    kind: 'galileo',
  },
  foucault: {
    title: 'Foucault’s Pendulum',
    intro: 'Earth turns under a long free pendulum, so its swing plane seems to rotate: 15° × sin(latitude) every hour — clockwise in the north, anticlockwise in the south. Set where the swing will point.',
    fact: 'In 1851 Léon Foucault hung a 28 kg bob on a 67 m wire from the dome of the Panthéon in Paris; its swing plane turned about 11° an hour, the first simple proof that the Earth rotates.',
    kind: 'foucault',
  },
  'wieck-metronome': {
    title: 'Strict Time in Wieck’s House',
    intro: 'Friedrich Wieck drills his pupils to the beat of a swinging pendulum. Tap every pendulum that keeps time with the reference — then confirm. Heavy or light, wide swing or narrow: only its length sets the tempo.',
    fact: 'Johann Maelzel patented the metronome in 1815 — a pendulum with a sliding weight: move the weight up and the beat slows. Beethoven began printing metronome marks in 1817, and by Clara’s childhood they were standard on new piano music.',
    kind: 'galileo',
  },
  'brahms-metronome': {
    title: 'Brahms and the Metronome',
    intro: 'Brahms trusts the bones of the music, not a ticking machine — but a pendulum keeps strict time. Tap every pendulum that beats with the reference — then confirm. Heavy or light, wide swing or narrow: only its length sets the tempo.',
    fact: 'Asked by George Henschel how strictly to keep the metronome marks in A German Requiem, Brahms answered that the metronome was of no value: “As far at least as my experience goes, everybody has, sooner or later, withdrawn his metronome marks.” Few of his published works carry metronome marks at all; he set the tempo in words — Allegro, Andante — and trusted the player.',
    kind: 'galileo',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Physics ──────────────────────────────────────────────────────────────────

/** Period in seconds of a pendulum `L` metres long. */
export const period = (L: number) => 2 * Math.PI * Math.sqrt(L / G)
/** Length in metres that swings with period `T` seconds. */
export const lengthFor = (T: number) => G * (T / (2 * Math.PI)) ** 2
/** Seconds gained per hour by a clock geared for period `Tgeared` swinging with `L` metres. */
export const gainPerHour = (L: number, Tgeared: number) => 3600 * (Tgeared / period(L) - 1)
/** Degrees the swing plane turns in `hours` at latitude `lat` (positive = clockwise). */
export const precession = (lat: number, hours: number) => 15 * Math.sin((lat * Math.PI) / 180) * hours

// ── Puzzles ──────────────────────────────────────────────────────────────────

export interface HuygensPuzzle {
  kind: 'huygens-clock'
  /** Period the clock's gearing expects, seconds. */
  geared: number
  /** Lengths in tenths of a millimetre. */
  start: number
  target: number
  tol: number
  trials: number
  /** Smallest stepper move, tenths of a mm. */
  res: number
  showPeriod: boolean
}

export interface MatchPuzzle {
  kind: 'match-clocks'
  /** Master length in mm. */
  master: number
  clocks: { p: number; q: number; start: number; target: number }[]
  tol: number
  mistakes: number
  showPeriod: boolean
}

export interface GalileoCandidate { length: number; amp: number; bob: number; weight: string; drop: number; inTime: boolean }
export interface GalileoRound { ref: GalileoCandidate; cands: GalileoCandidate[] }
export interface GalileoPuzzle { kind: 'galileo'; rounds: GalileoRound[]; mistakes: number }

export interface City { name: string; lat: number }
export interface FoucaultRound { city: City; hours: number; answer: number; reverse: boolean; options: City[] }
export interface FoucaultPuzzle { kind: 'foucault'; rounds: FoucaultRound[]; tol: number; mistakes: number; help: 'rate' | 'sin' | 'table' }

export type Puzzle = HuygensPuzzle | MatchPuzzle | GalileoPuzzle | FoucaultPuzzle

export const CITIES_NORTH: City[] = [
  { name: 'Paris', lat: 48.85 }, { name: 'London', lat: 51.5 }, { name: 'Rome', lat: 41.9 }, { name: 'Moscow', lat: 55.75 },
  { name: 'Oslo', lat: 59.9 }, { name: 'Cairo', lat: 30.05 }, { name: 'Mumbai', lat: 19.1 }, { name: 'Tokyo', lat: 35.7 },
  { name: 'New York', lat: 40.7 }, { name: 'Reykjavík', lat: 64.15 }, { name: 'Beijing', lat: 39.9 }, { name: 'Kraków', lat: 50.05 },
]
export const CITIES_SOUTH: City[] = [
  { name: 'Sydney', lat: -33.9 }, { name: 'Buenos Aires', lat: -34.6 }, { name: 'Rio de Janeiro', lat: -22.9 },
  { name: 'Ushuaia', lat: -54.8 }, { name: 'Wellington', lat: -41.3 }, { name: 'Lima', lat: -12.05 },
]
const EQUATOR: City = { name: 'Quito', lat: -0.2 }

const mistakesFor = (d: Difficulty) => scale(d, [3, 3, 2, 2])

function genHuygens(d: Difficulty, rng: Rng): HuygensPuzzle {
  const geared = pick([1, 1.25, 1.5, 2, 2.5], rng)
  const res = d >= 3 ? 1 : 10
  const ideal = lengthFor(geared) * 10000 // tenths of mm
  const target = Math.round(ideal / res) * res
  let start = target
  while (Math.abs(start - target) < res * 10) {
    const off = (rng() * 0.09 + 0.03) * (rng() < 0.5 ? -1 : 1)
    start = Math.round((ideal * (1 + off)) / 10) * 10
  }
  return {
    kind: 'huygens-clock', geared, start, target,
    tol: scale(d, [20, 10, 5, 3]), trials: scale(d, [5, 4, 3, 3]), res, showPeriod: d === 1,
  }
}

const RATIOS: [number, number][][] = [
  [[2, 1], [1, 2]],
  [[2, 1], [1, 2], [3, 1]],
  [[3, 2], [2, 3], [3, 1], [4, 3]],
  [[3, 2], [4, 3], [2, 3], [5, 4], [4, 5]],
]

function genMatch(d: Difficulty, rng: Rng): MatchPuzzle {
  const n = scale(d, [1, 2, 3, 3])
  for (let guard = 0; ; guard++) {
    const master = randInt(rng, 40, 240) * 10
    const ratios = shuffle(RATIOS[d - 1], rng).slice(0, n)
    const clocks = ratios.map(([p, q]) => {
      const target = Math.round(master * (q / p) ** 2)
      let start = randInt(rng, 30, 150) * 10
      while (Math.abs(start - target) / target < 0.1) start = randInt(rng, 30, 150) * 10
      return { p, q, start, target }
    })
    if (guard > 5000 || clocks.every(c => c.target >= 150 && c.target <= 3500)) {
      return { kind: 'match-clocks', master, clocks, tol: scale(d, [0.03, 0.02, 0.01, 0.005]), mistakes: mistakesFor(d), showPeriod: d === 1 }
    }
  }
}

const WEIGHTS = ['cork', 'wood', 'brass', 'iron', 'lead']

function genGalileo(d: Difficulty, rng: Rng): GalileoPuzzle {
  const rounds = scale(d, [2, 3, 3, 4])
  const count = scale(d, [4, 5, 6, 6])
  const [dmin, dmax] = scale<[number, number]>(d, [[0.35, 0.6], [0.2, 0.35], [0.12, 0.2], [0.07, 0.12]])
  const out: GalileoRound[] = []
  const looks = (length: number, inTime: boolean): GalileoCandidate => ({
    length, inTime,
    amp: randInt(rng, 6, 28), bob: randInt(rng, 0, 4), weight: '', drop: d >= 3 ? randInt(rng, 0, 18) : 0,
  })
  for (let r = 0; r < rounds; r++) {
    const refLen = randInt(rng, 50, 140) / 100
    const ref = looks(refLen, true)
    const good = randInt(rng, 1, Math.min(scale(d, [2, 2, 3, 3]), count - 2))
    const cands: GalileoCandidate[] = []
    for (let k = 0; k < count; k++) {
      if (k < good) cands.push(looks(refLen, true))
      else {
        const delta = dmin + rng() * (dmax - dmin)
        const sign = rng() < 0.5 && refLen * (1 + delta) <= 1.8 ? 1 : -1
        cands.push(looks(Math.round(refLen * (1 + sign * delta) * 100) / 100, false))
      }
    }
    // Red herring: an in-time pendulum swings much wider (or narrower) with another bob.
    cands[0].amp = ref.amp > 16 ? randInt(rng, 5, 9) : randInt(rng, 22, 30)
    cands[0].bob = (ref.bob + 2) % 5
    for (const c of [ref, ...cands]) c.weight = WEIGHTS[c.bob]
    out.push({ ref, cands: shuffle(cands, rng) })
  }
  return { kind: 'galileo', rounds: out, mistakes: mistakesFor(d) }
}

function genFoucault(d: Difficulty, rng: Rng): FoucaultPuzzle {
  const rounds = scale(d, [2, 3, 3, 4])
  const tol = scale(d, [8, 5, 3, 2])
  const reverseCount = scale(d, [0, 0, 1, 2])
  const out: FoucaultRound[] = []
  const used = new Set<string>()
  for (let r = 0; r < rounds; r++) {
    const reverse = r >= rounds - reverseCount
    const south = d >= 3 && rng() < 0.4
    const pool = (south ? CITIES_SOUTH : CITIES_NORTH).filter(c => !used.has(c.name))
    let city = pick(pool, rng)
    let hours = randInt(rng, scale(d, [1, 2, 2, 3]), scale(d, [3, 5, 6, 8]))
    let answer = Math.round(precession(city.lat, hours) * 10) / 10
    for (let guard = 0; Math.abs(answer) < tol + 6 && guard < 50; guard++) {
      city = pick(pool, rng); hours++
      answer = Math.round(precession(city.lat, hours) * 10) / 10
    }
    used.add(city.name)
    let options: City[] = []
    if (reverse) {
      // Distractors whose turn in the same time differs clearly from the answer.
      const all = [...CITIES_NORTH, ...(d >= 3 ? CITIES_SOUTH : []), EQUATOR].filter(c => c.name !== city.name)
      const far = shuffle(all, rng).filter(c => Math.abs(precession(c.lat, hours) - answer) > Math.max(4, hours * 1.2))
      const picked: City[] = []
      for (const c of far) {
        if (picked.every(p => Math.abs(precession(p.lat, hours) - precession(c.lat, hours)) > hours)) picked.push(c)
        if (picked.length === 3) break
      }
      options = shuffle([city, ...picked], rng)
    }
    out.push({ city, hours, answer, reverse, options })
  }
  return { kind: 'foucault', rounds: out, tol, mistakes: mistakesFor(d), help: scale(d, ['rate', 'sin', 'table', 'table'] as const) }
}

export function generate(config: Pick<PendulumConfig, 'kind'>, difficulty: Difficulty, seed: number): Puzzle {
  const rng = mulberry32(seed ^ hashString('pendulum:' + config.kind))
  switch (config.kind) {
    case 'huygens-clock': return genHuygens(difficulty, rng)
    case 'match-clocks': return genMatch(difficulty, rng)
    case 'galileo': return genGalileo(difficulty, rng)
    default: return genFoucault(difficulty, rng)
  }
}

/** Huygens: is a length (tenths of mm) within tolerance? */
export const huygensOk = (p: HuygensPuzzle, len: number) => Math.abs(gainPerHour(len / 10000, p.geared)) <= p.tol
/** Huygens: the length a careful player computes from one reading. */
export function huygensNext(p: HuygensPuzzle, len: number): number {
  const gain = gainPerHour(len / 10000, p.geared)
  return Math.round((len * (1 + gain / 3600) ** 2) / p.res) * p.res
}
export const matchOk = (p: MatchPuzzle, lengths: number[]) => p.clocks.every((c, i) => Math.abs(lengths[i] - c.target) / c.target <= p.tol)
export const foucaultOk = (p: FoucaultPuzzle, r: number, angle: number) => Math.abs(angle - p.rounds[r].answer) <= p.tol

// ── Animation ────────────────────────────────────────────────────────────────

function useSeconds(running: boolean): number {
  const [t, setT] = useState(0)
  useEffect(() => {
    if (!running || typeof requestAnimationFrame !== 'function') return
    let id = 0
    const t0 = performance.now()
    const loop = (now: number) => { setT((now - t0) / 1000); id = requestAnimationFrame(loop) }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [running])
  return t
}

function Swing({ lengthPx, angle, bob = 7, top = 0, color = '#b45309', width = 80 }: { lengthPx: number; angle: number; bob?: number; top?: number; color?: string; width?: number }) {
  const a = (angle * Math.PI) / 180
  const cx = width / 2, cy = 4 + top
  const bx = cx + Math.sin(a) * lengthPx, by = cy + Math.cos(a) * lengthPx
  return (
    <svg width={width} height={cy + lengthPx + bob + 4} className="block mx-auto overflow-visible">
      <line x1={cx - 10} y1={cy} x2={cx + 10} y2={cy} stroke="currentColor" strokeWidth={2} className="text-ink-2" />
      <line x1={cx} y1={cy} x2={bx} y2={by} stroke="currentColor" strokeWidth={1} className="text-muted" />
      <circle cx={bx} cy={by} r={bob} fill={color} stroke="rgba(0,0,0,.35)" />
    </svg>
  )
}

const swingAngle = (t: number, L: number, amp: number) => amp * Math.cos((2 * Math.PI * t) / period(L))

function Header({ title, intro, right }: { title: string; intro: string; right: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{title}</p>
        <p className="text-muted text-xs leading-relaxed">{intro}</p>
      </div>
      <div className="shrink-0 text-right text-[10px] text-muted">{right}</div>
    </div>
  )
}

function Stepper({ steps, onStep, disabled, unit, scaleBy = 1 }: { steps: number[]; onStep: (d: number) => void; disabled: boolean; unit: string; scaleBy?: number }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
      {[1, -1].map(sign => steps.map(s => (
        <button key={`${sign}${s}`} type="button" data-step={sign * s} disabled={disabled} onClick={() => onStep(sign * s)}
          className="h-9 rounded-lg border border-line bg-panel text-[11px] font-bold text-ink-2 tabular-nums active:scale-95">
          {sign > 0 ? '+' : '−'}{s / scaleBy}{unit}
        </button>
      )))}
    </div>
  )
}

/** Clicks to move from `cur` to `target` with ± steps (largest first). */
export function stepPlan(cur: number, target: number, steps: number[]): number[] {
  const out: number[] = []
  let diff = target - cur
  for (const s of [...steps].sort((a, b) => b - a)) {
    while (Math.abs(diff) >= s) { const m = Math.sign(diff) * s; out.push(m); diff -= m }
  }
  return out
}

interface SubProps { config: PendulumConfig; difficulty: Difficulty; onWin: () => void; onLose: (r?: string) => void }

// ── Huygens ──────────────────────────────────────────────────────────────────

export const huygensSteps = (p: HuygensPuzzle) => (p.res === 1 ? [1000, 100, 10, 1] : [1000, 100, 10])

function HuygensView({ config, puzzle: p, onWin, onLose }: SubProps & { puzzle: HuygensPuzzle }) {
  const [len, setLen] = useState(p.start)
  const [log, setLog] = useState<{ len: number; gain: number }[]>(() => [{ len: p.start, gain: gainPerHour(p.start / 10000, p.geared) }])
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const t = useSeconds(!settled)
  const trialsLeft = p.trials - (log.length - 1)

  const run = useCallback(() => {
    if (settled || trialsLeft <= 0) return
    const gain = gainPerHour(len / 10000, p.geared)
    setLog(l => [...l, { len, gain }])
    if (Math.abs(gain) <= p.tol) win()
    else if (trialsLeft - 1 <= 0) lose(`The clock is still ${Math.abs(gain).toFixed(1)} s an hour ${gain > 0 ? 'fast' : 'slow'}`)
  }, [settled, trialsLeft, len, p, win, lose])

  const fmtLen = (v: number) => (p.res === 1 ? (v / 10).toFixed(1) : String(v / 10))
  const px = Math.min(150, 40 + (len / 10000) * 60)
  return (
    <>
      <Header title={config.title} intro={config.intro} right={<p data-testid="pend-trials" className="font-bold text-ink-2">Runs left {trialsLeft}</p>} />
      <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs">
        <p className="text-ink font-bold">Keep within ±{p.tol} s an hour.</p>
        <p className="text-muted text-[10px]">
          {p.showPeriod ? <>The clock is geared for one swing every <b className="text-ink-2">{p.geared} s</b>. T = 2π√(L/g), g = 9.81.</> : <>A clock that gains g s an hour needs its length × (1 + g/3600)².</>}
        </p>
      </div>
      <div className="flex gap-3 items-end">
        <div className="flex-1 rounded-xl border border-line bg-paper py-2">
          <Swing lengthPx={px} angle={swingAngle(t, len / 10000, 12)} bob={9} width={140} />
        </div>
        <div className="w-36 text-[11px] space-y-0.5" data-testid="pend-log">
          {log.map((e, i) => (
            <p key={i} className={`tabular-nums ${Math.abs(e.gain) <= p.tol ? 'text-emerald-700 font-bold' : 'text-ink-2'}`}>
              {fmtLen(e.len)} mm → {e.gain >= 0 ? '+' : '−'}{Math.abs(e.gain).toFixed(1)} s/h
            </p>
          ))}
        </div>
      </div>
      <p className="text-center text-sm font-bold text-ink tabular-nums" data-testid="pend-length">Length {fmtLen(len)} mm</p>
      {!settled && (
        <>
          <Stepper steps={huygensSteps(p)} scaleBy={10} unit="" disabled={settled}
            onStep={s => setLen(v => Math.max(500, Math.min(30000, v + s)))} />
          <button type="button" data-testid="pend-run" onClick={run} className="h-10 rounded-lg bg-accent text-accent-fg text-sm font-bold">
            Run an hour ▸
          </button>
        </>
      )}
      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The clock keeps time!" loseTitle={reason ?? 'The clock drifts'} />
    </>
  )
}

// ── Match clocks ─────────────────────────────────────────────────────────────

export const MATCH_STEPS = [500, 100, 10, 1]
const CLOCK_COLORS = ['#b45309', '#2563eb', '#059669', '#9333ea']

function MatchView({ config, puzzle: p, onWin, onLose }: SubProps & { puzzle: MatchPuzzle }) {
  const [lens, setLens] = useState(() => p.clocks.map(c => c.start))
  const [sel, setSel] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [wrong, setWrong] = useState<number[]>([])
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const t = useSeconds(!settled)

  const check = useCallback(() => {
    if (settled) return
    if (matchOk(p, lens)) { win(); return }
    const bad = p.clocks.map((c, i) => (Math.abs(lens[i] - c.target) / c.target <= p.tol ? -1 : i)).filter(i => i >= 0)
    setWrong(bad)
    const m = mistakes + 1
    setMistakes(m)
    if (m >= p.mistakes) lose('The clocks fall out of step')
  }, [settled, p, lens, mistakes, win, lose])

  const all = [p.master, ...lens]
  const maxL = Math.max(...all)
  const px = (L: number) => 30 + (L / maxL) * 90
  return (
    <>
      <Header title={config.title} intro={config.intro} right={<p data-testid="pend-mistakes">✗ {mistakes}/{p.mistakes}</p>} />
      <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs">
        <p className="text-ink font-bold">Master: {p.master} mm{p.showPeriod ? ` · ${period(p.master / 1000).toFixed(2)} s` : ''}</p>
        <p className="text-muted text-[10px]">Within {(p.tol * 100).toFixed(1)}% of the right length. “3 : 2” = 3 beats while the master beats 2.</p>
      </div>
      <div className="flex justify-center gap-1 rounded-xl border border-line bg-paper py-2">
        {all.map((L, i) => (
          <div key={i} className="flex-1 min-w-0 text-center">
            <Swing lengthPx={px(L)} angle={swingAngle(t, L / 1000, 14)} color={i === 0 ? '#57534e' : CLOCK_COLORS[(i - 1) % 4]} width={72} />
            <p className="text-[10px] font-bold text-ink-2">{i === 0 ? 'Master' : `${p.clocks[i - 1].p} : ${p.clocks[i - 1].q}`}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        {p.clocks.map((c, i) => (
          <button key={i} type="button" data-clock={i} onClick={() => setSel(i)}
            className={`flex-1 rounded-lg border px-1 py-1.5 text-[11px] tabular-nums
              ${sel === i ? 'border-accent bg-accent/10' : 'border-line bg-panel'} ${wrong.includes(i) ? 'text-red-600' : 'text-ink-2'}`}>
            <span className="font-bold">{c.p} : {c.q}</span><br />
            <span data-testid={`pend-len-${i}`}>{lens[i]} mm</span>
            {p.showPeriod && <span className="block text-[9px] text-muted">{period(lens[i] / 1000).toFixed(2)} s</span>}
          </button>
        ))}
      </div>
      {!settled && (
        <>
          <Stepper steps={MATCH_STEPS} unit="" disabled={settled}
            onStep={s => { setWrong([]); setLens(ls => ls.map((v, i) => (i === sel ? Math.max(50, Math.min(4000, v + s)) : v))) }} />
          <button type="button" data-testid="pend-check" onClick={check} className="h-10 rounded-lg bg-accent text-accent-fg text-sm font-bold">
            Start the clocks
          </button>
        </>
      )}
      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="All clocks in sympathy!" loseTitle={reason ?? 'Out of step'} />
    </>
  )
}

// ── Galileo ──────────────────────────────────────────────────────────────────

const BOB_COLORS = ['#e7d3a8', '#a16207', '#ca8a04', '#57534e', '#334155']

function GalileoView({ config, puzzle: p, onWin, onLose }: SubProps & { puzzle: GalileoPuzzle }) {
  const [round, setRound] = useState(0)
  const [picked, setPicked] = useState<number[]>([])
  const [mistakes, setMistakes] = useState(0)
  const [roundStart, setRoundStart] = useState(0)
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const now = useSeconds(!settled)
  const t = Math.max(0, now - roundStart)
  const r = p.rounds[Math.min(round, p.rounds.length - 1)]

  const confirm = useCallback(() => {
    if (settled) return
    const ok = r.cands.every((c, i) => c.inTime === picked.includes(i))
    if (ok) {
      if (round + 1 >= p.rounds.length) { win(); return }
      setRound(round + 1); setPicked([]); setRoundStart(now)
      return
    }
    const m = mistakes + 1
    setMistakes(m)
    if (m >= p.mistakes) lose('Those lamps do not keep time together')
  }, [settled, r, picked, round, p, mistakes, win, lose, now])

  const px = (L: number) => 30 + L * 50
  const show = (c: GalileoCandidate, top: number) => (
    <Swing lengthPx={px(c.length)} angle={swingAngle(t, c.length, c.amp)} bob={4 + c.bob * 1.6} color={BOB_COLORS[c.bob]} top={top} width={76} />
  )
  return (
    <>
      <Header title={config.title} intro={config.intro}
        right={<><p className="font-bold text-ink-2" data-testid="pend-round">Round {Math.min(round + 1, p.rounds.length)}/{p.rounds.length}</p><p data-testid="pend-mistakes">✗ {mistakes}/{p.mistakes}</p></>} />
      <div className="rounded-xl border border-line bg-paper p-2">
        <div className="flex items-end gap-2">
          <div className="w-20 shrink-0 text-center border-r border-line pr-1">
            {show(r.ref, r.ref.drop)}
            <p className="text-[10px] font-bold text-accent">Reference</p>
            <p className="text-[9px] text-muted">{r.ref.weight}</p>
          </div>
          <div className="flex-1 grid grid-cols-3 gap-1 items-end">
            {r.cands.map((c, i) => (
              <button key={`${round}-${i}`} type="button" data-cand={i} disabled={settled}
                onClick={() => setPicked(ps => (ps.includes(i) ? ps.filter(x => x !== i) : [...ps, i]))}
                className={`rounded-lg border text-center pb-0.5 ${picked.includes(i) ? 'border-accent bg-accent/10' : 'border-transparent'}`}>
                {show(c, c.drop)}
                <p className="text-[9px] text-muted">{c.weight}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
      {!settled && (
        <button type="button" data-testid="pend-confirm" onClick={confirm} className="h-10 rounded-lg bg-accent text-accent-fg text-sm font-bold">
          These keep time ({picked.length})
        </button>
      )}
      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="Isochronism!" loseTitle={reason ?? 'Out of time'} />
    </>
  )
}

// ── Foucault ─────────────────────────────────────────────────────────────────

export const FOUCAULT_STEPS = [10, 1]
const SIN_TABLE = [0, 15, 30, 45, 60, 75, 90]

function FoucaultView({ config, puzzle: p, onWin, onLose }: SubProps & { puzzle: FoucaultPuzzle }) {
  const [round, setRound] = useState(0)
  const [angle, setAngle] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [miss, setMiss] = useState<string | null>(null)
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const t = useSeconds(!settled)
  const r = p.rounds[Math.min(round, p.rounds.length - 1)]

  const advance = useCallback(() => {
    if (round + 1 >= p.rounds.length) { win(); return }
    setRound(round + 1); setAngle(0); setMiss(null)
  }, [round, p.rounds.length, win])

  const fail = useCallback((msg: string) => {
    const m = mistakes + 1
    setMistakes(m)
    setMiss(msg)
    if (m >= p.mistakes) lose(msg)
  }, [mistakes, p.mistakes, lose])

  const submit = useCallback(() => {
    if (settled || r.reverse) return
    if (foucaultOk(p, round, angle)) advance()
    else fail(`Not quite — the plane points ${angle > r.answer ? 'less' : 'further'} round`)
  }, [settled, r, p, round, angle, advance, fail])

  const choose = useCallback((c: City) => {
    if (settled || !r.reverse) return
    if (c.name === r.city.name) advance()
    else fail(`At ${c.name} it would turn ${precession(c.lat, r.hours).toFixed(1)}°`)
  }, [settled, r, advance, fail])

  // Dial: the swing line (live swing along it) at the set angle; north is up.
  const shown = r.reverse ? r.answer : angle
  const a = (shown * Math.PI) / 180
  const sw = Math.sin((2 * Math.PI * t) / 4) * 46
  const bx = 60 + Math.sin(a) * sw, by = 60 - Math.cos(a) * sw
  const rate = 15 * Math.sin((r.city.lat * Math.PI) / 180)
  return (
    <>
      <Header title={config.title} intro={config.intro}
        right={<><p className="font-bold text-ink-2" data-testid="pend-round">Round {Math.min(round + 1, p.rounds.length)}/{p.rounds.length}</p><p data-testid="pend-mistakes">✗ {mistakes}/{p.mistakes}</p></>} />
      <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs" data-testid="pend-task">
        {r.reverse ? (
          <p className="text-ink font-bold">The swing turned {Math.abs(r.answer).toFixed(1)}° {r.answer >= 0 ? 'clockwise' : 'anticlockwise'} in {r.hours} h. Where is the pendulum?</p>
        ) : (
          <p className="text-ink font-bold">{r.city.name} ({Math.abs(r.city.lat).toFixed(1)}° {r.city.lat >= 0 ? 'N' : 'S'}), after {r.hours} h — within ±{p.tol}°</p>
        )}
        <p className="text-muted text-[10px]">
          {p.help === 'rate' && !r.reverse ? <>Here the plane turns {rate.toFixed(1)}° an hour.</>
            : p.help === 'sin' && !r.reverse ? <>sin {Math.abs(r.city.lat).toFixed(1)}° = {Math.abs(Math.sin((r.city.lat * Math.PI) / 180)).toFixed(3)}</>
              : <>sin: {SIN_TABLE.map(x => `${x}°→${Math.sin((x * Math.PI) / 180).toFixed(2)}`).join(' · ')}</>}
        </p>
      </div>
      <div className="flex justify-center">
        <svg width={140} height={140} viewBox="0 0 120 120" className="text-ink-2">
          <circle cx={60} cy={60} r={56} fill="none" stroke="currentColor" strokeOpacity={0.3} />
          {Array.from({ length: 36 }, (_, i) => {
            const aa = (i * 10 * Math.PI) / 180
            const r0 = i % 9 === 0 ? 48 : 52
            return <line key={i} x1={60 + Math.sin(aa) * r0} y1={60 - Math.cos(aa) * r0} x2={60 + Math.sin(aa) * 56} y2={60 - Math.cos(aa) * 56} stroke="currentColor" strokeOpacity={0.4} />
          })}
          <text x={60} y={12} textAnchor="middle" fontSize={8} fill="currentColor">N</text>
          <line x1={60} y1={60} x2={60} y2={14} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="2 2" />
          <line x1={60 - Math.sin(a) * 50} y1={60 + Math.cos(a) * 50} x2={60 + Math.sin(a) * 50} y2={60 - Math.cos(a) * 50} stroke="#b45309" strokeWidth={1.5} />
          <circle cx={bx} cy={by} r={5} fill="#b45309" />
        </svg>
      </div>
      {!settled && !r.reverse && (
        <>
          <p className="text-center text-sm font-bold text-ink tabular-nums" data-testid="pend-angle">
            {Math.abs(angle)}° {angle > 0 ? 'clockwise' : angle < 0 ? 'anticlockwise' : ''}
          </p>
          <Stepper steps={FOUCAULT_STEPS} unit="°" disabled={settled} onStep={s => { setMiss(null); setAngle(v => Math.max(-180, Math.min(180, v + s))) }} />
          <button type="button" data-testid="pend-submit" onClick={submit} className="h-10 rounded-lg bg-accent text-accent-fg text-sm font-bold">Mark the floor</button>
        </>
      )}
      {!settled && r.reverse && (
        <div className="grid grid-cols-2 gap-2">
          {r.options.map(c => (
            <button key={c.name} type="button" data-option={c.name} onClick={() => choose(c)}
              className="h-10 rounded-lg border border-line bg-panel text-xs font-bold text-ink-2">{c.name}</button>
          ))}
        </div>
      )}
      {miss && !settled && <p className="text-[11px] text-red-600" data-testid="pend-miss">{miss}</p>}
      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The Earth turns!" loseTitle={reason ?? 'The swing went another way'} />
    </>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PendulumGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'huygens-clock')
  const kind = (CONFIGS[configId] ?? CONFIGS['huygens-clock']).kind
  const puzzle = useMemo(() => generate({ kind }, difficulty, seed), [kind, difficulty, seed])
  const sub = { config, difficulty, onWin, onLose }
  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      {puzzle.kind === 'huygens-clock' && <HuygensView {...sub} puzzle={puzzle} />}
      {puzzle.kind === 'match-clocks' && <MatchView {...sub} puzzle={puzzle} />}
      {puzzle.kind === 'galileo' && <GalileoView {...sub} puzzle={puzzle} />}
      {puzzle.kind === 'foucault' && <FoucaultView {...sub} puzzle={puzzle} />}
    </div>
  )
}
