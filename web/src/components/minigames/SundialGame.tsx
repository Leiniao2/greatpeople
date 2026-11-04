import { useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, randInt, resolveConfig, scale, shuffle, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Sundials: set up an instrument so the Sun's shadow tells the truth.  The
// Sun's direction comes from real spherical astronomy: declination
// δ = 23.44° · sin(360°/365 · (N − 81)) for day N, hour angle H = 15° per hour
// from solar noon, and in local East–North–Up axes at latitude φ
//   s = (−cos δ sin H,  cos φ sin δ − sin φ cos δ cos H,  sin φ sin δ + cos φ cos δ cos H).
// A dial is a plate (normal n, noon line u) with a style g through its centre;
// the style's shadow on the plate points along g − s (g·n)/(s·n).  A horizontal
// dial carved for latitude φd reads H = atan2(sin ψ, sin φd cos ψ) from a
// shadow angle ψ; an equatorial dial reads H = ψ directly.
//
// Four scenarios, each with its own rule:
//   retilt    the Catania dial at Rome: its lines are carved for 37.5° N and
//             cannot change — tilt the plate by the latitude difference and
//             turn it to true north (north arrow hidden at D3+).
//   layout    Ibn al-Shatir's polar style: tilt the style to the latitude so the
//             shadows stop depending on the date, then lay out the hour lines
//             yourself (tan θ = sin φ tan H — not equal spacing).
//   meantime  the Samrat Yantra: align an equatorial gnomon (elevation =
//             latitude, azimuth = north) and shift the uniform hour scale by the
//             equation of time so it reads clock (mean) time on the test date.
//   solstice  Guo Shoujing's gnomon: noon shadows L = G / tan(altitude), read
//             sharp with the shadow definer; find the winter solstice to a
//             fraction of a day by folding equal shadows either side of it.
//
//   Tests (dials): D1 5, D2 5, D3 4, D4 4; tolerances tighten per tier and more
//   check hours are tested.  Gnomon: observations 7/6/5/4, declarations 2/2/1/1.
//   Every level is generated from the seed and checked by the solvers below:
//   the solver's setting wins, the start and the naive settings do not.

export type Kind = 'retilt' | 'layout' | 'meantime' | 'solstice'

interface SundialConfig {
  title: string
  rule: string
  intro: string
  fact: string
  kind: Kind
  /** Latitude of the site, degrees north. */
  lat: number
  /** Latitude the hour lines were carved for (retilt). */
  designLat?: number
}

export const CONFIGS: Record<string, SundialConfig> = {
  'catania-rome': {
    title: 'The Sundial from Catania, 263 BC',
    rule: 'Re-tilt a dial carved for another latitude',
    intro: 'The dial was carved for Catania (37.5° N) and set up in the Forum at Rome (41.9° N). Its lines cannot be recut. Raise its north edge until the plate lies like a Catania horizon, and turn it to true north, so its shadows tell Roman time.',
    fact: 'Pliny the Elder records that Manius Valerius Messalla brought a sundial home from Catania in 263 BC and set it up in the Forum; its lines did not agree with the hours at Rome, yet the Romans followed it for 99 years until Quintus Marcius Philippus set up one designed for Rome.',
    kind: 'retilt', lat: 41.9, designLat: 37.5,
  },
  'damascus-polar': {
    title: 'Ibn al-Shatir’s Dial, Damascus 1371',
    rule: 'Polar style, then lay out the hour lines',
    intro: 'Tilt the style until it points at the celestial pole: then the shadow at each hour falls in the same place on every day of the year. Then carve each hour line where its shadow falls. Lines near noon are close together; they are not 15° apart.',
    fact: 'Ibn al-Shatir, timekeeper of the Umayyad Mosque in Damascus, made a great horizontal sundial for its minaret in 1371/72 whose style was parallel to the Earth’s axis: the oldest polar-axis sundial known, so its hours were equal hours all year.',
    kind: 'layout', lat: 33.5,
  },
  'samrat-yantra': {
    title: 'The Samrat Yantra, Jaipur 1734',
    rule: 'Equatorial dial read in clock time',
    intro: 'The great gnomon’s edge must point at the pole (elevation = latitude 26.9°, aimed due north) and its scale is uniform, 15° an hour. But the court keeps mean (clock) time: shift the scale by the equation of time for the test date, so the dial agrees with the clock.',
    fact: 'Maharaja Jai Singh II completed the Jantar Mantar at Jaipur in 1734. The gnomon of its Samrat Yantra stands about 27 m tall with its edge at the latitude, 27° N; its shadow moves about 6 cm a minute and reads local solar time to about two seconds.',
    kind: 'meantime', lat: 26.9,
  },
  'guo-shoujing': {
    title: 'Guo Shoujing’s Gnomon, 1279',
    rule: 'Find the solstice by equal shadows',
    intro: 'Observe the noon shadow of the 40-chi gnomon on chosen days and slide the shadow definer until the crossbar’s image is sharp, then record it. Near the solstice the shadow hardly changes; twenty days away it changes about 3 cun a day. Fold the record: the solstice lies midway between days of equal shadow.',
    fact: 'At Gaocheng (Dengfeng) around 1276–79 Guo Shoujing raised a 40-chi gnomon, five times the old 8-chi one, and read its shadow with a pinhole “shadow definer” (jingfu). Timing the solstices from shadows taken days either side, his Shoushi calendar of 1281 used a year of 365.2425 days.',
    kind: 'solstice', lat: 34.4,
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Sun ───────────────────────────────────────────────────────────────────────

const DEG = Math.PI / 180
type V3 = [number, number, number]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** Solar declination (degrees) on day of year N. */
export function declination(day: number): number {
  return 23.44 * Math.sin((2 * Math.PI / 365) * (day - 81))
}

/** Equation of time in minutes (apparent solar − mean time) on day N. */
export function equationOfTime(day: number): number {
  const B = (2 * Math.PI / 364) * (day - 81)
  return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B)
}

/** Unit vector to the Sun in East–North–Up axes. Angles in degrees. */
export function sunVector(lat: number, decl: number, H: number): V3 {
  const p = lat * DEG, d = decl * DEG, h = H * DEG
  return [
    -Math.cos(d) * Math.sin(h),
    Math.cos(p) * Math.sin(d) - Math.sin(p) * Math.cos(d) * Math.cos(h),
    Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(h),
  ]
}

/** Sun altitude in degrees. */
export const altitude = (lat: number, decl: number, H: number) => Math.asin(sunVector(lat, decl, H)[2]) / DEG

/** Tilt about the east–west axis (north edge up), then turn by `az` (clockwise from above). */
function mount(v: V3, tilt: number, az: number): V3 {
  const t = tilt * DEG, a = az * DEG
  const y1 = v[1] * Math.cos(t) - v[2] * Math.sin(t), z1 = v[1] * Math.sin(t) + v[2] * Math.cos(t)
  return [v[0] * Math.cos(a) + y1 * Math.sin(a), -v[0] * Math.sin(a) + y1 * Math.cos(a), z1]
}

/**
 * Shadow angle ψ (degrees, from the plate's noon line, positive toward the
 * plate's east) of a style raised `styleElev` above a plate that is tilted
 * and turned; null when the Sun is down or behind the plate.
 */
export function plateShadow(lat: number, decl: number, H: number, styleElev: number, tilt = 0, az = 0): number | null {
  const n = mount([0, 0, 1], tilt, az), u = mount([0, 1, 0], tilt, az), w = cross(u, n)
  const g = mount([0, Math.cos(styleElev * DEG), Math.sin(styleElev * DEG)], tilt, az)
  const s = sunVector(lat, decl, H)
  const sn = dot(s, n)
  if (s[2] <= 0 || sn <= 1e-9) return null
  const k = dot(g, n) / sn
  const sh: V3 = [g[0] - k * s[0], g[1] - k * s[1], g[2] - k * s[2]]
  return Math.atan2(dot(sh, w), dot(sh, u)) / DEG
}

/** Shadow angle on an equatorial face (both faces read), style at `elev`, aimed `az`. */
export function equatorialShadow(lat: number, decl: number, H: number, elev: number, az = 0): number | null {
  const s = sunVector(lat, decl, H)
  if (s[2] <= 0) return null
  const e = elev * DEG
  const g = mount([0, Math.cos(e), Math.sin(e)], 0, az)
  const u = mount([0, Math.sin(e), -Math.cos(e)], 0, az)
  const w = cross(u, g)
  const k = dot(s, g)
  const sp: V3 = [-(s[0] - k * g[0]), -(s[1] - k * g[1]), -(s[2] - k * g[2])]
  return Math.atan2(dot(sp, w), dot(sp, u)) / DEG
}

/** Hour angle a horizontal dial carved for latitude `designLat` shows for shadow angle ψ. */
export function horizontalReading(psi: number, designLat: number): number {
  return Math.atan2(Math.sin(psi * DEG), Math.sin(designLat * DEG) * Math.cos(psi * DEG)) / DEG
}

/** Where a horizontal dial's hour line for hour angle H lies: tan θ = sin φ tan H. */
export function hourLineAngle(H: number, lat: number): number {
  return Math.atan2(Math.sin(lat * DEG) * Math.sin(H * DEG), Math.cos(H * DEG)) / DEG
}

// ── Dial levels ───────────────────────────────────────────────────────────────

export interface Control { key: string; label: string; min: number; max: number; step: number; unit: string; decimals: number }
export interface DateCheck { label: string; day: number; decl: number; eot: number; color: string }
export interface Check { date: number; hour: number; psi: number | null; err: number | null; ok: boolean }
export interface TestResult { checks: Check[]; win: boolean; worst: number }

export interface DialLevel {
  kind: 'retilt' | 'layout' | 'meantime'
  difficulty: Difficulty
  lat: number
  designLat: number
  /** How far the plinth is turned from true north (retilt, meantime). */
  plinth: number
  showNorth: boolean
  controls: Control[]
  start: number[]
  solution: number[]
  dates: DateCheck[]
  hours: number[]
  tol: number
  unit: 'min' | 'deg'
  tests: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
export function dateLabel(day: number): string {
  let d = day
  for (let m = 0; m < 12; m++) { if (d <= MDAYS[m]) return `${d} ${MONTHS[m]}`; d -= MDAYS[m] }
  return `${day}`
}
const DATE_COLORS = ['#f59e0b', '#22c55e', '#60a5fa']
const mkDate = (label: string, day: number, color: string): DateCheck =>
  ({ label, day, decl: declination(day), eot: equationOfTime(day), color })
const SEASONS = (): DateCheck[] => [
  mkDate('Summer solstice', 172, DATE_COLORS[0]),
  mkDate('Equinox', 81, DATE_COLORS[1]),
  mkDate('Winter solstice', 355, DATE_COLORS[2]),
]

const ctl = (key: string, label: string, min: number, max: number, step: number, unit: string, decimals = 1): Control =>
  ({ key, label, min, max, step, unit, decimals })
export const snap = (c: Control, v: number) => {
  const k = Math.round((v - c.min) / c.step)
  return +(c.min + Math.max(0, Math.min(Math.round((c.max - c.min) / c.step), k)) * c.step).toFixed(6)
}
export const stepsOf = (c: Control) => Math.round((c.max - c.min) / c.step)
export const formatValue = (c: Control, v: number) => `${v > 0 && c.min < 0 ? '+' : ''}${v.toFixed(c.decimals)}${c.unit}`

/** Run the Sun over every check hour on every test date. */
export function testDial(L: DialLevel, v: number[]): TestResult {
  const checks: Check[] = []
  L.dates.forEach((dt, di) => {
    L.hours.forEach((h, hi) => {
      let psi: number | null = null, err: number | null = null
      if (L.kind === 'retilt') {
        const H = 15 * (h - 12)
        psi = plateShadow(L.lat, dt.decl, H, L.designLat, v[0], L.plinth + v[1])
        if (psi !== null) err = (horizontalReading(psi, L.designLat) - H) * 4
      } else if (L.kind === 'layout') {
        psi = plateShadow(L.lat, dt.decl, 15 * (h - 12), v[0], 0, 0)
        if (psi !== null) err = psi - v[1 + hi]
      } else {
        const H = 15 * (h - 12) + dt.eot / 4
        psi = equatorialShadow(L.lat, dt.decl, H, v[0], L.plinth + v[1])
        if (psi !== null) err = psi * 4 + v[2] - (h - 12) * 60
      }
      checks.push({ date: di, hour: h, psi, err, ok: err !== null && Math.abs(err) <= L.tol })
    })
  })
  const worst = Math.max(...checks.map(c => (c.err === null ? Infinity : Math.abs(c.err))))
  return { checks, win: checks.every(c => c.ok), worst }
}

const valuesOf = (c: Control) => Array.from({ length: stepsOf(c) + 1 }, (_, k) => +(c.min + k * c.step).toFixed(6))

/** Every winning setting (retilt, meantime) or one per winning style (layout). */
export function solveDial(L: DialLevel): number[][] {
  const out: number[][] = []
  if (L.kind === 'retilt') {
    for (const t of valuesOf(L.controls[0])) for (const r of valuesOf(L.controls[1])) {
      if (testDial(L, [t, r]).win) out.push([t, r])
    }
  } else if (L.kind === 'layout') {
    for (const e of valuesOf(L.controls[0])) {
      const v = bestLines(L, e)
      if (v && testDial(L, v).win) out.push(v)
    }
  } else {
    const offC = L.controls[2]
    for (const e of valuesOf(L.controls[0])) for (const r of valuesOf(L.controls[1])) {
      const raw = testDial(L, [e, r, 0]).checks.map(c => c.err)
      if (raw.some(x => x === null)) continue
      const errs = raw as number[]
      const lo = Math.max(...errs) - L.tol, hi = Math.min(...errs) + L.tol
      // offset o works when every |err + o| ≤ tol, i.e. −hi ≤ o ≤ −lo
      for (const o of valuesOf(offC)) if (o >= -hi - 1e-9 && o <= -lo + 1e-9) out.push([e, r, o])
    }
  }
  return out
}

/** The best hour lines for a given style: the middle of each hour's shadows, snapped. */
export function bestLines(L: DialLevel, style: number): number[] | null {
  const lines: number[] = []
  for (const h of L.hours) {
    const ps = L.dates.map(dt => plateShadow(L.lat, dt.decl, 15 * (h - 12), style, 0, 0))
    if (ps.some(p => p === null)) return null
    const xs = ps as number[]
    lines.push(snap(L.controls[1], (Math.max(...xs) + Math.min(...xs)) / 2))
  }
  return [style, ...lines]
}

/** Combos in a dial level's search space (layout counts styles only). */
export const comboCount = (L: DialLevel) =>
  L.kind === 'layout' ? stepsOf(L.controls[0]) + 1 : L.controls.reduce((n, c) => n * (stepsOf(c) + 1), 1)

const FAR_HOURS = [8, 9, 15, 16]
function pickHours(rng: Rng, pool: number[], n: number): number[] {
  for (;;) {
    const hs = shuffle(pool, rng).slice(0, n).sort((a, b) => a - b)
    if (hs.some(h => FAR_HOURS.includes(h)) && hs.some(h => h < 12) && hs.some(h => h > 12)) return hs
  }
}
const plinthOffset = (rng: Rng) => (rng() < 0.5 ? -1 : 1) * randInt(rng, 4, 20) * 0.5

function genRetilt(cfg: SundialConfig, d: Difficulty, rng: Rng): DialLevel {
  const designLat = cfg.designLat ?? 37.5
  const controls = [ctl('tilt', 'Plate tilt (north edge up)', 0, 10, 0.5, '°'), ctl('rot', 'Turn the plate', -15, 15, 0.5, '°')]
  const plinth = plinthOffset(rng)
  const L: DialLevel = {
    kind: 'retilt', difficulty: d, lat: cfg.lat, designLat, plinth, showNorth: d <= 2, controls,
    start: [0, 0], solution: [snap(controls[0], cfg.lat - designLat), snap(controls[1], -plinth)],
    dates: SEASONS(), hours: pickHours(rng, [8, 9, 10, 11, 13, 14, 15, 16], scale(d, [2, 3, 4, 5])),
    tol: scale(d, [3, 2.5, 2, 1.5]), unit: 'min', tests: scale(d, [5, 5, 4, 4]),
  }
  return L
}

function genLayout(cfg: SundialConfig, d: Difficulty, rng: Rng): DialLevel {
  const controls = [ctl('style', 'Style elevation', 10, 60, 0.5, '°'), ctl('line', 'Hour line', -90, 90, 0.5, '°')]
  const hours = pickHours(rng, [8, 9, 10, 11, 13, 14, 15, 16], scale(d, [3, 4, 5, 6]))
  const style0 = rng() < 0.5 ? 18 + randInt(rng, 0, 16) * 0.5 : 41 + randInt(rng, 0, 14) * 0.5
  const L: DialLevel = {
    kind: 'layout', difficulty: d, lat: cfg.lat, designLat: cfg.lat, plinth: 0, showNorth: true, controls,
    start: [style0, ...hours.map(h => 15 * (h - 12))], solution: [],
    dates: SEASONS(), hours,
    tol: scale(d, [1, 0.75, 0.5, 0.4]), unit: 'deg', tests: scale(d, [5, 5, 4, 4]),
  }
  L.solution = bestLines(L, snap(controls[0], cfg.lat))!
  return L
}

function genMeantime(cfg: SundialConfig, d: Difficulty, rng: Rng): DialLevel {
  const controls = [
    ctl('elev', 'Gnomon elevation', 15, 40, 0.5, '°'),
    ctl('rot', 'Turn the gnomon', -15, 15, 0.5, '°'),
    ctl('off', 'Scale shift', -20, 20, 1, ' min', 0),
  ]
  let day = 1
  do { day = randInt(rng, 1, 365) } while (Math.abs(equationOfTime(day)) < 7.5)
  const plinth = plinthOffset(rng)
  const elev0 = rng() < 0.5 ? 15 + randInt(rng, 0, 14) * 0.5 : 33 + randInt(rng, 0, 14) * 0.5
  const date = mkDate(dateLabel(day), day, DATE_COLORS[0])
  const L: DialLevel = {
    kind: 'meantime', difficulty: d, lat: cfg.lat, designLat: cfg.lat, plinth, showNorth: d <= 2, controls,
    start: [elev0, 0, 0],
    solution: [snap(controls[0], cfg.lat), snap(controls[1], -plinth), snap(controls[2], -date.eot)],
    dates: [date], hours: pickHours(rng, [8, 9, 10, 11, 12, 13, 14, 15, 16], scale(d, [3, 4, 5, 5])),
    tol: scale(d, [4, 3, 2, 1.5]), unit: 'min', tests: scale(d, [5, 5, 4, 4]),
  }
  return L
}

// ── Gnomon (solstice) levels ──────────────────────────────────────────────────

export interface GnomonLevel {
  kind: 'solstice'
  difficulty: Difficulty
  seed: number
  lat: number
  /** Gnomon height in cun (40 chi). */
  G: number
  obliquity: number
  /** Hidden moment of the winter solstice, days after the almanac's date (noon = integer). */
  t0: number
  dayRange: [number, number]
  obs: number
  declares: number
  tol: number
  declStep: number
  /** Half-width (cun) of the definer's travel around the shadow tip. */
  span: number
}

const TROPICAL_YEAR = 365.2422

/** Noon shadow length (cun) on day t (days after the almanac solstice; t0 fractional). */
export function noonShadow(L: Pick<GnomonLevel, 'lat' | 'G' | 'obliquity' | 't0'>, t: number): number {
  const lambda = (270 + 360 * (t - L.t0) / TROPICAL_YEAR) * DEG
  const decl = Math.asin(Math.sin(L.obliquity * DEG) * Math.sin(lambda)) / DEG
  const alt = 90 - L.lat + decl
  return L.G / Math.tan(alt * DEG)
}

/** What a perfectly sharpened definer records: the shadow to the nearest fen (0.1 cun). */
export const readShadow = (L: GnomonLevel, day: number) => Math.round(noonShadow(L, day) * 10) / 10

/** The definer's travel for an observation: 0.1-cun steps over a window round the tip. */
export function definerWindow(L: GnomonLevel, day: number): { lo: number; n: number } {
  const r = mulberry32(L.seed ^ hashString(`jingfu:${day}`))
  const c = (r() * 2 - 1) * L.span * 0.5
  const lo = Math.round((noonShadow(L, day) - L.span + c) * 10) / 10
  return { lo, n: Math.round(2 * L.span * 10) }
}

/**
 * Equal-shadow solver using only what the definer can record: one day twenty
 * before, two twenty after for the slope, one near the mirror day; a quadratic
 * through the after-side readings finds the mirror moment.
 */
export function solveSolstice(L: GnomonLevel): { days: number[]; estimate: number } {
  const a = -20, b = 20, c = 21
  const La = readShadow(L, a), Lb = readShadow(L, b), Lc = readShadow(L, c)
  const m1 = b + (Lb - La) / (Lb - Lc)
  let d = Math.round(m1)
  if (d === b || d === c) d = d === b ? b - 2 : c + 2
  const Ld = readShadow(L, d)
  const xs = [b, c, d], ys = [Lb, Lc, Ld]
  const q = (t: number) => xs.reduce((sum, xi, i) => {
    let term = ys[i]
    xs.forEach((xj, j) => { if (j !== i) term *= (t - xj) / (xi - xj) })
    return sum + term
  }, 0)
  let m = m1
  for (let k = 0; k < 20; k++) {
    const f = q(m) - La, df = (q(m + 1e-3) - q(m - 1e-3)) / 2e-3
    if (!df) break
    m -= f / df
  }
  return { days: [a, b, c, d], estimate: (a + m) / 2 }
}

export const roundTo = (x: number, step: number) => +(Math.round(x / step) * step).toFixed(6)
export const declareWins = (L: GnomonLevel, estimate: number) => Math.abs(estimate - L.t0) <= L.tol + 1e-9

function genSolstice(cfg: SundialConfig, d: Difficulty, rng: Rng, seed: number): GnomonLevel {
  const sign = rng() < 0.5 ? -1 : 1
  const t0 = sign * (randInt(rng, 2, 3) + 0.35 + rng() * 0.3)
  return {
    kind: 'solstice', difficulty: d, seed, lat: cfg.lat, G: 400, obliquity: 23.53, t0,
    dayRange: [-40, 40], obs: scale(d, [7, 6, 5, 4]), declares: scale(d, [2, 2, 1, 1]),
    tol: scale(d, [0.3, 0.25, 0.2, 0.15]), declStep: scale(d, [0.05, 0.05, 0.01, 0.01]),
    span: scale(d, [5, 6, 8, 10]),
  }
}

// ── Generation ────────────────────────────────────────────────────────────────

export type Level = DialLevel | GnomonLevel

export function generate(cfg: SundialConfig, difficulty: Difficulty, seed: number): Level {
  const rng = mulberry32(seed ^ hashString('sundial:' + cfg.kind))
  if (cfg.kind === 'solstice') return genSolstice(cfg, difficulty, rng, seed)
  // Reroll until the built-in solution wins and the starting setting does not.
  for (let tries = 0; ; tries++) {
    const L = cfg.kind === 'retilt' ? genRetilt(cfg, difficulty, rng)
      : cfg.kind === 'layout' ? genLayout(cfg, difficulty, rng) : genMeantime(cfg, difficulty, rng)
    if ((testDial(L, L.solution).win && !testDial(L, L.start).win) || tries > 40) return L
  }
}

export const levelFor = (configId: string, difficulty: Difficulty, seed: number) =>
  generate(CONFIGS[configId], difficulty, seed)

// ── Component ─────────────────────────────────────────────────────────────────

export default function SundialGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'catania-rome')
  const L = useMemo(() => generate(config, difficulty, seed), // eslint-disable-line react-hooks/exhaustive-deps
    [config.kind, config.lat, config.designLat, difficulty, seed])
  const outcome = useGameOutcome({ onWin, onLose })
  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div>
        <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
        <p className="text-ink-2 text-[11px] font-bold">{config.rule}</p>
        <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
      </div>
      {L.kind === 'solstice'
        ? <GnomonPanel L={L} out={outcome} />
        : <DialPanel L={L} out={outcome} />}
      <OutcomeBanner outcome={outcome.outcome} detail={config.fact} winTitle="The shadow tells true time!"
        loseTitle={outcome.reason ?? 'The shadow lies'} />
    </div>
  )
}

type Outcome = ReturnType<typeof useGameOutcome>

function Stepper({ c, value, onChange, disabled, testId }: { c: Control; value: number; onChange: (v: number) => void; disabled: boolean; testId: string }) {
  const idx = Math.round((value - c.min) / c.step)
  return (
    <div className="bg-panel border border-line rounded-lg px-2.5 py-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-ink-2 font-bold">{c.label}</span>
        <span className="text-accent font-bold tabular-nums" data-testid={`${testId}-val`}>{formatValue(c, value)}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <button type="button" aria-label={`decrease ${c.label}`} disabled={disabled} onClick={() => onChange(snap(c, value - c.step))}
          className="w-8 h-8 rounded-md bg-paper border border-line text-ink font-bold active:scale-95">−</button>
        <input type="range" min={0} max={stepsOf(c)} step={1} value={idx} data-testid={testId} aria-label={c.label}
          disabled={disabled} onChange={e => onChange(snap(c, c.min + Number(e.target.value) * c.step))}
          className="flex-1 h-8 touch-pan-y" />
        <button type="button" aria-label={`increase ${c.label}`} disabled={disabled} onClick={() => onChange(snap(c, value + c.step))}
          className="w-8 h-8 rounded-md bg-paper border border-line text-ink font-bold active:scale-95">+</button>
      </div>
    </div>
  )
}

const hourName = (h: number) => `${h}h`
const ray = (psi: number, r: number, cx = 0, cy = 0, down = false) => {
  const a = psi * DEG
  return { x1: cx, y1: cy, x2: cx + r * Math.sin(a), y2: cy + (down ? r : -r) * Math.cos(a) }
}

function DialPanel({ L, out }: { L: DialLevel; out: Outcome }) {
  const [v, setV] = useState<number[]>(L.start)
  const [used, setUsed] = useState(0)
  const [last, setLast] = useState<TestResult | null>(null)
  const [sel, setSel] = useState(0)
  const usedRef = useRef(0)
  const { settled, win, lose } = out
  const left = L.tests - used

  const set = (k: number, x: number) => { if (!settled) setV(p => p.map((y, j) => (j === k ? x : y))) }
  const runTest = () => {
    if (settled) return
    const r = testDial(L, v)
    usedRef.current += 1
    setUsed(usedRef.current)
    setLast(r)
    if (r.win) win()
    else if (usedRef.current >= L.tests) lose(`Off by up to ${fmtErr(L, r.worst)} — no tests left`)
  }

  const goal = L.kind === 'layout'
    ? `Every hour’s shadow within ${L.tol}° of its line, on all three dates.`
    : L.kind === 'retilt'
      ? `Read Roman solar time within ${L.tol} min at every check hour, on all three dates.`
      : `Read clock time within ${L.tol} min at every check hour on ${L.dates[0].label}.`

  return <>
    <div className="flex items-center justify-between gap-2">
      <p className="text-ink-2 text-xs font-bold" data-testid="sun-goal">{goal}</p>
      <p data-testid="sun-left" className={`shrink-0 text-[10px] font-bold tabular-nums ${left <= 1 ? 'text-red-600' : 'text-accent'}`}>☀ {left}/{L.tests}</p>
    </div>
    <div className="w-full max-w-[400px] mx-auto rounded-xl border border-line overflow-hidden bg-[#f4ead6]">
      {L.kind === 'meantime' ? <EquatorialSvg L={L} v={v} last={last} /> : <PlateSvg L={L} v={v} last={last} sel={sel} />}
    </div>
    <div className="flex flex-wrap gap-1 text-[10px]">
      {L.dates.map(dt => (
        <span key={dt.label} className="px-1.5 py-0.5 rounded bg-panel border border-line text-ink-2">
          <span style={{ color: dt.color }}>●</span> {dt.label}{L.kind === 'meantime' ? '' : ` (δ ${dt.decl.toFixed(1)}°)`}
        </span>
      ))}
      <span className="px-1.5 py-0.5 rounded bg-panel border border-line text-muted">Latitude {L.lat}° N</span>
    </div>

    <div className="flex flex-col gap-2">
      {L.kind === 'layout' ? <>
        <Stepper c={L.controls[0]} value={v[0]} onChange={x => set(0, x)} disabled={settled} testId="sun-ctl-style" />
        <div className="flex flex-wrap gap-1">
          {L.hours.map((h, k) => (
            <button key={h} type="button" data-testid={`sun-hour-${h}`} onClick={() => setSel(k)}
              className={`h-8 px-2.5 rounded-md border text-xs font-bold ${sel === k ? 'bg-accent text-accent-fg border-accent' : 'bg-paper border-line text-ink'}`}>
              {hourName(h)}
            </button>
          ))}
        </div>
        <Stepper c={{ ...L.controls[1], label: `${hourName(L.hours[sel])} line` }} value={v[1 + sel]} onChange={x => set(1 + sel, x)}
          disabled={settled} testId="sun-ctl-line" />
      </> : L.controls.map((c, k) => (
        <Stepper key={c.key} c={c} value={v[k]} onChange={x => set(k, x)} disabled={settled} testId={`sun-ctl-${c.key}`} />
      ))}
    </div>

    {!settled && (
      <button type="button" data-testid="sun-test" onClick={runTest}
        className="h-11 rounded-xl font-bold text-sm bg-accent text-accent-fg active:scale-[0.98]">
        Let the Sun run ({left} {left === 1 ? 'test' : 'tests'} left)
      </button>
    )}

    {last && (
      <div data-testid="sun-report" className="overflow-x-auto">
        <table className="text-[10px] tabular-nums w-full">
          <thead><tr><th className="text-left text-muted font-normal pr-1">{L.unit === 'deg' ? 'line off' : 'error'}</th>
            {L.hours.map(h => <th key={h} className="text-muted font-normal px-0.5">{hourName(h)}</th>)}</tr></thead>
          <tbody>
            {L.dates.map((dt, di) => (
              <tr key={dt.label}>
                <td className="pr-1" style={{ color: dt.color }}>●</td>
                {L.hours.map(h => {
                  const c = last.checks.find(x => x.date === di && x.hour === h)!
                  return <td key={h} className={`text-center px-0.5 font-bold ${c.ok ? 'text-emerald-700' : 'text-red-600'}`}>
                    {c.err === null ? 'no sun' : fmtSigned(L, c.err)}
                  </td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {L.unit === 'min' && <p className="text-[10px] text-muted mt-0.5">+ means the dial runs fast.</p>}
      </div>
    )}
  </>
}

const fmtErr = (L: DialLevel, e: number) => (Number.isFinite(e) ? (L.unit === 'deg' ? `${e.toFixed(1)}°` : `${e.toFixed(1)} min`) : 'no shadow')
const fmtSigned = (L: DialLevel, e: number) => `${e > 0 ? '+' : ''}${e.toFixed(1)}${L.unit === 'deg' ? '°' : ''}`

function NorthArrow({ x, y }: { x: number; y: number }) {
  return <g data-testid="sun-north">
    <path d={`M${x} ${y - 14}L${x - 5} ${y}L${x + 5} ${y}Z`} fill="#b91c1c" />
    <text x={x} y={y + 10} fontSize={9} textAnchor="middle" fill="#7f1d1d" fontWeight="bold">N</text>
  </g>
}

function PlateSvg({ L, v, last, sel }: { L: DialLevel; v: number[]; last: TestResult | null; sel: number }) {
  const cx = 0, cy = 40, R = 95
  const az = L.kind === 'retilt' ? L.plinth + v[1] : 0
  const carved = L.kind === 'retilt'
    ? [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(h => ({ h, psi: hourLineAngle(15 * (h - 12), L.designLat), mine: false }))
    : L.hours.map((h, k) => ({ h, psi: v[1 + k], mine: k === sel }))
  return (
    <svg viewBox="-110 -70 220 125" className="w-full block" data-testid="sun-dial">
      <g transform={`rotate(${az} ${cx} ${cy})`}>
        <path d={`M${cx - R} ${cy}A${R} ${R} 0 0 1 ${cx + R} ${cy}Z`} fill="#e7d7b5" stroke="#8b7355" strokeWidth={1} />
        {carved.map(l => {
          const p = ray(l.psi, R, cx, cy)
          const t = ray(l.psi, R + 7, cx, cy)
          return <g key={l.h}>
            <line {...p} stroke={l.mine ? '#b45309' : '#6b5536'} strokeWidth={l.mine ? 1.6 : 0.8} />
            {Math.abs(l.psi) < 95 && <text x={t.x2} y={t.y2 + 3} fontSize={7} textAnchor="middle" fill="#5b4630">{l.h}</text>}
          </g>
        })}
        {last?.checks.map((c, k) => c.psi !== null && (
          <line key={k} {...ray(c.psi, R * 0.88, cx, cy)} stroke={L.dates[c.date].color} strokeWidth={1.4} strokeOpacity={0.9} strokeLinecap="round" />
        ))}
        {/* the style, seen from above, lies along the noon line */}
        <line x1={cx} y1={cy} x2={cx} y2={cy - 34} stroke="#1f2937" strokeWidth={2.4} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={2.5} fill="#1f2937" />
      </g>
      {L.showNorth && <NorthArrow x={92} y={-50} />}
      <SideView x={-104} y={-62} label={L.kind === 'retilt' ? `tilt ${v[0].toFixed(1)}°` : `style ${v[0].toFixed(1)}°`}
        plateTilt={L.kind === 'retilt' ? v[0] : 0} style={L.kind === 'retilt' ? L.designLat + v[0] : v[0]} />
    </svg>
  )
}

/** A small profile seen from the east: north to the right. */
function SideView({ x, y, label, plateTilt, style }: { x: number; y: number; label: string; plateTilt: number; style: number }) {
  const len = 34, p = plateTilt * DEG, s = style * DEG
  return <g>
    <line x1={x} y1={y + 22} x2={x + 44} y2={y + 22} stroke="#a8a29e" strokeWidth={0.8} strokeDasharray="2 2" />
    <line x1={x + 4} y1={y + 22} x2={x + 4 + len * Math.cos(p)} y2={y + 22 - len * Math.sin(p)} stroke="#8b7355" strokeWidth={2} />
    <line x1={x + 4} y1={y + 22} x2={x + 4 + 26 * Math.cos(s)} y2={y + 22 - 26 * Math.sin(s)} stroke="#1f2937" strokeWidth={1.6} />
    <text x={x} y={y + 31} fontSize={7} fill="#57534e">{label} · N→</text>
  </g>
}

function EquatorialSvg({ L, v, last }: { L: DialLevel; v: number[]; last: TestResult | null }) {
  const cx = 0, cy = -45, R = 90
  const marks = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(h => ({ h, psi: ((h - 12) * 60 - v[2]) / 4 }))
  const az = L.plinth + v[1]
  return (
    <svg viewBox="-110 -60 220 130" className="w-full block" data-testid="sun-dial">
      <path d={`M${cx - R} ${cy}A${R} ${R} 0 0 0 ${cx + R} ${cy}Z`} fill="#e9d8b8" stroke="#8b7355" strokeWidth={1} />
      {marks.map(m => {
        const p = ray(m.psi, R, cx, cy, true), q = ray(m.psi, R - 8, cx, cy, true), t = ray(m.psi, R - 15, cx, cy, true)
        return <g key={m.h}>
          <line x1={q.x2} y1={q.y2} x2={p.x2} y2={p.y2} stroke="#6b5536" strokeWidth={1} />
          {Math.abs(m.psi) <= 90 && <text x={t.x2} y={t.y2 + 2.5} fontSize={7} textAnchor="middle" fill="#5b4630">{m.h}</text>}
        </g>
      })}
      {last?.checks.map((c, k) => c.psi !== null && (
        <g key={k}>
          <line {...ray(c.psi, R - 2, cx, cy, true)} stroke="#1e293b" strokeWidth={1.2} strokeOpacity={0.75} />
          <text {...(() => { const t = ray(c.psi, R + 6, cx, cy, true); return { x: t.x2, y: t.y2 + 3 } })()} fontSize={6} textAnchor="middle" fill="#b45309">{hourName(c.hour)}</text>
        </g>
      ))}
      <circle cx={cx} cy={cy} r={2.5} fill="#1f2937" />
      {/* plan view: the gnomon's direction on the ground */}
      <g transform="translate(-88 45)">
        <circle r={14} fill="#f8f1e3" stroke="#a8a29e" strokeWidth={0.6} />
        <line x1={0} y1={9} x2={0} y2={-11} stroke="#1f2937" strokeWidth={2} transform={`rotate(${az})`} />
        <text x={0} y={22} fontSize={6} textAnchor="middle" fill="#57534e">gnomon</text>
      </g>
      {L.showNorth && <NorthArrow x={-62} y={46} />}
      <SideView x={58} y={30} label={`edge ${v[0].toFixed(1)}°`} plateTilt={0} style={v[0]} />
    </svg>
  )
}

// ── Gnomon panel ──

interface Rec { day: number; value: number }

/** Gap (cun) between a record and the other side's records at its mirror day across T. */
export function foldGaps(recs: Rec[], T: number): { day: number; mirror: number; gap: number }[] {
  const out: { day: number; mirror: number; gap: number }[] = []
  for (const r of recs) {
    const x = 2 * T - r.day
    const other = recs.filter(o => (o.day - T) * (r.day - T) < 0).sort((a, b) => a.day - b.day)
    for (let i = 0; i + 1 < other.length; i++) {
      const p = other[i], q = other[i + 1]
      if (p.day <= x && x <= q.day && q.day - p.day <= 3) {
        const f = q.day === p.day ? 0 : (x - p.day) / (q.day - p.day)
        out.push({ day: r.day, mirror: x, gap: r.value - (p.value + f * (q.value - p.value)) })
        break
      }
    }
  }
  return out
}

function GnomonPanel({ L, out }: { L: GnomonLevel; out: Outcome }) {
  const [day, setDay] = useState(-20)
  const [pending, setPending] = useState<{ day: number; lo: number; n: number } | null>(null)
  const [pos, setPos] = useState(0)
  const [recs, setRecs] = useState<Rec[]>([])
  const [obsUsed, setObsUsed] = useState(0)
  const [est, setEst] = useState(0)
  const [decUsed, setDecUsed] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const decRef = useRef(0)
  const { settled, win, lose } = out
  const obsLeft = L.obs - obsUsed

  const observe = () => {
    if (settled || pending || obsLeft <= 0) return
    const w = definerWindow(L, day)
    setPending({ day, ...w })
    setPos(0)
    setObsUsed(n => n + 1)
  }
  const record = () => {
    if (!pending) return
    const value = Math.round((pending.lo + pos * 0.1) * 10) / 10
    setRecs(r => [...r.filter(x => x.day !== pending.day), { day: pending.day, value }].sort((a, b) => a.day - b.day))
    setPending(null)
  }
  const declare = () => {
    if (settled) return
    decRef.current += 1
    setDecUsed(decRef.current)
    if (declareWins(L, est)) { win(); return }
    if (decRef.current >= L.declares) lose('The solstice fell at another moment')
    else setNote(L.difficulty <= 2 ? `Not yet: the solstice came ${est < L.t0 ? 'later' : 'earlier'} than that.` : 'Not within the tolerance.')
  }

  const truth = pending ? noonShadow(L, pending.day) : 0
  const blur = pending ? Math.min(8, Math.abs(pending.lo + pos * 0.1 - truth) * 2.2) : 0
  const gaps = foldGaps(recs, est)
  const dayC: Control = ctl('day', 'Observation day', L.dayRange[0], L.dayRange[1], 1, ' d', 0)
  const estC: Control = ctl('est', 'Solstice moment', -10, 10, L.declStep, ' d', 2)

  // Plot of the record: days across, shadow up.
  const vals = recs.map(r => r.value)
  const yMax = Math.max(noonShadow({ ...L, t0: 0 }, 0) + 2, ...vals), yMin = Math.min(yMax - 30, ...vals) - 2
  const px = (d: number) => -100 + (d - L.dayRange[0]) / (L.dayRange[1] - L.dayRange[0]) * 200
  const py = (y: number) => 50 - (y - yMin) / (yMax - yMin) * 90

  return <>
    <div className="flex items-center justify-between gap-2">
      <p className="text-ink-2 text-xs font-bold" data-testid="sun-goal">
        Find the winter solstice within {L.tol} day. Day 0 is the old almanac’s date.
      </p>
      <p data-testid="sun-left" className={`shrink-0 text-[10px] font-bold tabular-nums ${obsLeft <= 1 ? 'text-red-600' : 'text-accent'}`}>
        👁 {obsLeft}/{L.obs}
      </p>
    </div>

    <div className="w-full max-w-[400px] mx-auto rounded-xl border border-line overflow-hidden bg-[#f4ead6]">
      <svg viewBox="-110 -48 220 106" className="w-full block" data-testid="sun-record">
        <line x1={-100} y1={50} x2={100} y2={50} stroke="#a8a29e" strokeWidth={0.6} />
        <line x1={px(0)} y1={-42} x2={px(0)} y2={50} stroke="#a8a29e" strokeWidth={0.6} strokeDasharray="2 2" />
        <text x={px(0)} y={-43} fontSize={6} textAnchor="middle" fill="#78716c">almanac</text>
        <line x1={px(est)} y1={-42} x2={px(est)} y2={50} stroke="#b45309" strokeWidth={1} data-testid="sun-fold" />
        {recs.map(r => <circle key={r.day} cx={px(r.day)} cy={py(r.value)} r={2.2} fill="#1f2937" />)}
        {recs.map(r => {
          const x = 2 * est - r.day
          return x >= L.dayRange[0] && x <= L.dayRange[1] && <circle key={`m${r.day}`} cx={px(x)} cy={py(r.value)} r={2.2} fill="none" stroke="#b45309" strokeWidth={0.8} />
        })}
        {[-40, -20, 0, 20, 40].map(d => <text key={d} x={px(d)} y={57} fontSize={6} textAnchor="middle" fill="#78716c">{d}</text>)}
      </svg>
    </div>

    {pending ? (
      <div className="flex flex-col gap-2 bg-panel border border-line rounded-lg p-2" data-testid="sun-definer">
        <p className="text-[11px] text-ink-2 font-bold">Day {pending.day}: slide the shadow definer until the crossbar’s image is sharp.</p>
        <svg viewBox="0 0 200 40" className="w-full h-16 block rounded bg-[#2a2418]">
          <defs><filter id="jingfu-blur"><feGaussianBlur stdDeviation={blur.toFixed(2)} /></filter></defs>
          <ellipse cx={100} cy={20} rx={40} ry={12} fill="#fde68a" fillOpacity={0.25} filter="url(#jingfu-blur)" />
          <rect x={60} y={18.5} width={80} height={3} fill="#111" filter="url(#jingfu-blur)" />
          <circle cx={100} cy={20} r={5} fill="#fef3c7" filter="url(#jingfu-blur)" />
        </svg>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="definer back" onClick={() => setPos(p => Math.max(0, p - 1))}
            className="w-8 h-8 rounded-md bg-paper border border-line text-ink font-bold active:scale-95">−</button>
          <input type="range" min={0} max={pending.n} step={1} value={pos} data-testid="sun-definer-pos" aria-label="shadow definer"
            onChange={e => setPos(Number(e.target.value))} className="flex-1 h-8 touch-pan-y" />
          <button type="button" aria-label="definer forward" onClick={() => setPos(p => Math.min(pending.n, p + 1))}
            className="w-8 h-8 rounded-md bg-paper border border-line text-ink font-bold active:scale-95">+</button>
          <span className="text-[11px] font-bold tabular-nums text-accent w-16 text-right">{(pending.lo + pos * 0.1).toFixed(1)} cun</span>
        </div>
        <button type="button" data-testid="sun-record-btn" onClick={record}
          className="h-10 rounded-lg font-bold text-sm bg-accent text-accent-fg active:scale-[0.98]">Record</button>
      </div>
    ) : !settled && (
      <div className="flex flex-col gap-2">
        <Stepper c={dayC} value={day} onChange={setDay} disabled={settled} testId="sun-ctl-day" />
        <button type="button" data-testid="sun-observe" onClick={observe} disabled={obsLeft <= 0}
          className="h-10 rounded-lg font-bold text-sm bg-paper border border-line text-ink disabled:opacity-40 active:scale-[0.98]">
          Observe noon shadow ({obsLeft} left)
        </button>
      </div>
    )}

    {recs.length > 0 && (
      <p className="text-[10px] text-ink-2 tabular-nums" data-testid="sun-recs">
        {recs.map(r => `d${r.day}: ${r.value.toFixed(1)}`).join(' · ')}
      </p>
    )}

    {!settled && !pending && <>
      <Stepper c={estC} value={est} onChange={setEst} disabled={settled} testId="sun-ctl-est" />
      {gaps.length > 0 && (
        <p className="text-[10px] text-muted tabular-nums" data-testid="sun-gaps">
          Folded: {gaps.map(g => `d${g.day} ↔ ${g.mirror.toFixed(2)}: ${g.gap > 0 ? '+' : ''}${g.gap.toFixed(1)} cun`).join(' · ')}
        </p>
      )}
      <button type="button" data-testid="sun-declare" onClick={declare}
        className="h-11 rounded-xl font-bold text-sm bg-accent text-accent-fg active:scale-[0.98]">
        Declare the solstice ({L.declares - decUsed} left)
      </button>
    </>}
    {note && !settled && <p className="text-[11px] text-red-600 font-bold" data-testid="sun-note">{note}</p>}
  </>
}
