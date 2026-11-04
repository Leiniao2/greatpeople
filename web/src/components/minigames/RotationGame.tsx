import { useMemo, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, randInt, shuffle, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Crop Rotation — plan what each field grows, one season at a time, so the
// soil stays fertile and the harvest reaches its target.
//
// Every field has a soil fertility of 0–4.  Hungry crops (grain, maize,
// rice) yield more on rich soil and drain it; legumes, fallow, dredged muck
// and fish put it back.  Each season you plant every field and bring the
// harvest in — no take-backs — and the next season starts from the soil you
// left.  The four farming systems each change the rules:
//
//   three-field  medieval Europe: a share of fields MUST lie fallow each
//                year; grain target + a pulse (beans & peas) target;
//                the same crop twice running is hit by pests.
//   norfolk      Townshend's four-course: no fallow at all; grain target +
//                a fodder target (turnips, clover); grain after grain is
//                choked by weeds.
//   chinampa     Aztec island gardens: one maize target, but the only big
//                soil boost is dredging canal muck — one canoe crew, one
//                field per season.
//   rice-fish    Chinese paddies: only so many fields can be flooded each
//                season; rice target + a fish target, and carp only give a
//                catch in a paddy's second straight season of fish.
//
//   D1  3 fields × 3 seasons, no weather            ~1 min
//   D2  3 fields × 4 seasons, 1 weather season      ~1.5 min
//   D3  4 fields × 4 seasons, 1 weather season      ~2–2.5 min
//   D4  5 fields × 4 seasons, 2 weather seasons     ~3 min
//
// Targets ask for 75 / 82 / 88 / 93 % of the exact optimum by difficulty.
// Weather is announced in advance: a bumper season adds +1 to every
// yielding crop, a lean one takes 1 away.  Targets are set from the exact
// optimum (solveFrontier, an exhaustive per-field DP) — see TARGET_SHARE —
// so every instance is winnable and the tests replay the solver's plan.
// After each season the solver checks whether the target can still be
// reached; if not, the game is lost at once.

export const MAX_SOIL = 4

export interface CropDef {
  id: string
  name: string
  icon: string
  /** Primary yield by soil fertility 0..4. */
  yields: [number, number, number, number, number]
  /** Secondary output (pulses / fodder / fish). */
  sec: number
  /** Secondary only when the field grew this same crop the season before (fish take two seasons to grow). */
  secNeedsRepeat?: boolean
  /** Change to soil after the harvest. */
  dn: number
  family: 'grain' | 'legume' | 'root' | 'rest' | 'muck'
  /** Counted by the season quota (fallow fields, dredged fields, flooded fields). */
  counted?: boolean
}

export interface RotationConfig {
  title: string
  intro: string
  fact: string
  crops: CropDef[]
  primaryLabel: string
  primaryIcon: string
  secondaryLabel: string | null
  secondaryIcon: string
  /** The secondary target is drawn from this share of the most possible. */
  secShare: [number, number]
  repeat: 'same' | 'family' | 'none'
  repeatNote: string
  quota: { kind: 'min' | 'max'; value: (fields: number) => number; label: string } | null
  seasonName: string
  leanLabel: string
  bumperLabel: string
  fieldTint: string
}

const z5 = (): [number, number, number, number, number] => [0, 0, 0, 0, 0]

export const CONFIGS: Record<string, RotationConfig> = {
  'three-field': {
    title: 'The Three-Field System',
    intro: 'Feed the manor: grow enough grain and enough beans & peas. The village herd must graze — leave fields fallow every year. Never sow the same crop twice running.',
    fact: 'From around the 8th–9th century, Carolingian estates and later much of medieval Europe split their land into three fields: winter grain, spring crops such as oats, barley, peas and beans, and fallow. Only a third lay idle each year instead of half under the older two-field system.',
    crops: [
      { id: 'wheat', name: 'Wheat', icon: '🌾', yields: [1, 2, 3, 3, 4], sec: 0, dn: -2, family: 'grain' },
      { id: 'oats', name: 'Oats', icon: '🌱', yields: [1, 1, 2, 3, 3], sec: 0, dn: -1, family: 'grain' },
      { id: 'beans', name: 'Peas & beans', icon: '🫛', yields: z5(), sec: 1, dn: 2, family: 'legume' },
      { id: 'fallow', name: 'Fallow', icon: '🐄', yields: z5(), sec: 0, dn: 1, family: 'rest', counted: true },
    ],
    primaryLabel: 'Grain', primaryIcon: '🌾', secondaryLabel: 'Pulses', secondaryIcon: '🫛', secShare: [0.35, 0.6],
    repeat: 'same', repeatNote: 'Same crop twice running: −1 (pests)',
    quota: { kind: 'min', value: f => Math.max(1, Math.round(f / 3)), label: 'fallow' },
    seasonName: 'Year', leanLabel: 'Wet harvest', bumperLabel: 'Warm summer',
    fieldTint: '#e9dcb4',
  },
  norfolk: {
    title: "Townshend's Norfolk Four-Course",
    intro: 'No field may rest. Grow grain for market and turnips & clover to feed the flock over winter. Grain straight after grain is choked by weeds.',
    fact: "Charles 'Turnip' Townshend promoted the Norfolk four-course rotation — wheat, turnips, barley, clover — on his Raynham estate after retiring from politics in 1730. Clover fixes nitrogen and turnips feed livestock through winter, so no field had to lie fallow.",
    crops: [
      { id: 'wheat', name: 'Wheat', icon: '🌾', yields: [1, 2, 3, 4, 4], sec: 0, dn: -2, family: 'grain' },
      { id: 'barley', name: 'Barley', icon: '🌿', yields: [1, 2, 2, 3, 3], sec: 0, dn: -1, family: 'grain' },
      { id: 'turnips', name: 'Turnips', icon: '🥔', yields: z5(), sec: 2, dn: 1, family: 'root' },
      { id: 'clover', name: 'Clover', icon: '☘️', yields: z5(), sec: 1, dn: 2, family: 'legume' },
    ],
    primaryLabel: 'Grain', primaryIcon: '🌾', secondaryLabel: 'Fodder', secondaryIcon: '🐑', secShare: [0.35, 0.6],
    repeat: 'family', repeatNote: 'Grain after grain: −1 (weeds)',
    quota: null,
    seasonName: 'Year', leanLabel: 'Cold spring', bumperLabel: 'Fine harvest',
    fieldTint: '#d9e4b8',
  },
  chinampa: {
    title: 'Chinampas of Tenochtitlan',
    intro: 'Grow maize on the floating gardens. Maize drains the soil fast; beans and milpa are gentler. The canoe crew can dredge rich canal muck onto only one garden per season.',
    fact: 'The Aztecs farmed chinampas — long raised beds built from lake mud and reeds between canals — around Tenochtitlan. Farmers scooped nutrient-rich muck from the canal bottoms onto the beds, and the gardens could yield several harvests a year; some are still farmed in Xochimilco today.',
    crops: [
      { id: 'maize', name: 'Maize', icon: '🌽', yields: [0, 1, 2, 3, 4], sec: 0, dn: -2, family: 'grain' },
      { id: 'milpa', name: 'Milpa', icon: '🎃', yields: [1, 1, 2, 2, 3], sec: 0, dn: 0, family: 'grain' },
      { id: 'beans', name: 'Beans', icon: '🫘', yields: z5(), sec: 0, dn: 2, family: 'legume' },
      { id: 'muck', name: 'Dredge muck', icon: '🛶', yields: z5(), sec: 0, dn: 3, family: 'muck', counted: true },
    ],
    primaryLabel: 'Maize', primaryIcon: '🌽', secondaryLabel: null, secondaryIcon: '', secShare: [0, 0],
    repeat: 'same', repeatNote: 'Same crop twice running: −1 (pests)',
    quota: { kind: 'max', value: () => 1, label: 'dredged' },
    seasonName: 'Season', leanLabel: 'Frost', bumperLabel: 'Good rains',
    fieldTint: '#cfe0b0',
  },
  'rice-fish': {
    title: 'Rice–Fish Paddies',
    intro: 'Grow rice and raise carp. Fish feed the soil, but fry stocked this season are only big enough to catch if the paddy keeps fish next season too. The channel floods only some paddies each season; dry ones grow wheat or milk vetch.',
    fact: 'Farmers in Qingtian, Zhejiang, have raised carp in their rice paddies for over 1,200 years: the fish eat weeds and pests and their droppings fertilise the rice. In 2005 it became one of the first Globally Important Agricultural Heritage Systems named by the FAO.',
    crops: [
      { id: 'rice', name: 'Rice', icon: '🍚', yields: [1, 2, 3, 3, 4], sec: 0, dn: -1, family: 'grain', counted: true },
      { id: 'ricefish', name: 'Rice + fish', icon: '🐟', yields: [0, 1, 1, 2, 2], sec: 2, secNeedsRepeat: true, dn: 1, family: 'grain', counted: true },
      { id: 'wheat', name: 'Dry wheat', icon: '🌾', yields: [0, 1, 2, 3, 3], sec: 0, dn: -2, family: 'grain' },
      { id: 'vetch', name: 'Milk vetch', icon: '🌸', yields: z5(), sec: 0, dn: 2, family: 'legume' },
    ],
    primaryLabel: 'Grain', primaryIcon: '🍚', secondaryLabel: 'Fish', secondaryIcon: '🐟', secShare: [0.5, 0.8],
    repeat: 'none', repeatNote: 'Paddies can grow rice year after year',
    quota: { kind: 'max', value: f => Math.ceil(f / 2), label: 'flooded' },
    seasonName: 'Season', leanLabel: 'Drought', bumperLabel: 'Monsoon',
    fieldTint: '#cfe3df',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Rules ──────────────────────────────────────────────────────────────────────

export interface FieldState { n: number; prev: number | null }

export interface Instance {
  fields: FieldState[]
  seasons: number
  /** Per season: −1 lean, 0 normal, +1 bumper. */
  weather: number[]
  quota: { kind: 'min' | 'max'; value: number } | null
  /** Primary target. */
  target: number
  /** Secondary target (0 when the config has none). */
  secTarget: number
  /** Exact optimum primary at secTarget (target = optimum − slack). */
  optimum: number
}

export interface Harvest { primary: number; sec: number; next: FieldState }

export function harvest(cfg: RotationConfig, f: FieldState, crop: number, weather: number): Harvest {
  const c = cfg.crops[crop]
  const base = c.yields[Math.max(0, Math.min(MAX_SOIL, f.n))]
  let primary = base
  if (base > 0) {
    if (f.prev !== null) {
      const p = cfg.crops[f.prev]
      if (cfg.repeat === 'same' && f.prev === crop) primary -= 1
      if (cfg.repeat === 'family' && p.family === 'grain' && c.family === 'grain') primary -= 1
    }
    primary += weather
  }
  return {
    primary: Math.max(0, primary),
    sec: c.secNeedsRepeat && f.prev !== crop ? 0 : c.sec,
    next: { n: Math.max(0, Math.min(MAX_SOIL, f.n + c.dn)), prev: crop },
  }
}

/** Is one season's planting legal under the quota? */
export function seasonValid(cfg: RotationConfig, inst: Instance, crops: (number | null)[]): boolean {
  if (crops.some(c => c === null)) return false
  if (!inst.quota) return true
  const k = crops.filter(c => cfg.crops[c as number].counted).length
  return inst.quota.kind === 'min' ? k >= inst.quota.value : k <= inst.quota.value
}

export interface Frontier {
  /** best[s] = max primary reachable with secondary exactly s (−1 = impossible). */
  best: number[]
  /** plan[s][field] = crop per remaining season. */
  plan: (number[][] | null)[]
}

/**
 * Exhaustive optimum from `from` (season index) with the given field states.
 * Fields interact only through the per-season quota and the summed
 * secondary output, so each field's sequences are enumerated alone and then
 * combined with a DP over (quota counts per season, secondary total).
 */
export function solveFrontier(cfg: RotationConfig, inst: Instance, from: number, states: FieldState[]): Frontier {
  const S = inst.seasons - from
  const q = inst.quota
  const base = q ? (q.kind === 'min' ? q.value + 1 : q.value + 1) : 1
  const pow = Array.from({ length: S }, (_, i) => base ** i)
  // Per field: map (mask, sec) → best primary & sequence.
  const perField = states.map(st => {
    const best = new Map<string, { mask: number; sec: number; primary: number; seq: number[] }>()
    const seq: number[] = []
    const rec = (s: number, f: FieldState, mask: number, sec: number, primary: number) => {
      if (s === S) {
        const k = mask + ':' + sec
        const cur = best.get(k)
        if (!cur || cur.primary < primary) best.set(k, { mask, sec, primary, seq: [...seq] })
        return
      }
      for (let c = 0; c < cfg.crops.length; c++) {
        const h = harvest(cfg, f, c, inst.weather[from + s])
        seq.push(c)
        rec(s + 1, h.next, mask | (cfg.crops[c].counted ? 1 << s : 0), sec + h.sec, primary + h.primary)
        seq.pop()
      }
    }
    rec(0, st, 0, 0, 0)
    return [...best.values()]
  })
  // DP over fields.  Key = counts code * 1000 + sec.
  type Cell = { primary: number; plan: number[][] }
  let dp = new Map<number, Cell>([[0, { primary: 0, plan: [] }]])
  for (const opts of perField) {
    const next = new Map<number, Cell>()
    for (const [key, cell] of dp) {
      const code = Math.floor(key / 1000), sec = key % 1000
      for (const o of opts) {
        let nc = 0, ok = true
        for (let s = 0; s < S; s++) {
          let cnt = Math.floor(code / pow[s]) % base
          if (o.mask & (1 << s)) cnt += 1
          if (q && q.kind === 'max' && cnt > q.value) { ok = false; break }
          if (q && q.kind === 'min') cnt = Math.min(cnt, q.value)
          nc += cnt * pow[s]
        }
        if (!ok) continue
        const nk = nc * 1000 + sec + o.sec
        const val = cell.primary + o.primary
        const cur = next.get(nk)
        if (!cur || cur.primary < val) next.set(nk, { primary: val, plan: [...cell.plan, o.seq] })
      }
    }
    dp = next
  }
  const full = q && q.kind === 'min' ? pow.reduce((a, p) => a + q.value * p, 0) : -1
  const best: number[] = []
  const plan: (number[][] | null)[] = []
  for (const [key, cell] of dp) {
    const code = Math.floor(key / 1000), sec = key % 1000
    if (full >= 0 && code !== full) continue
    while (best.length <= sec) { best.push(-1); plan.push(null) }
    if (cell.primary > best[sec]) { best[sec] = cell.primary; plan[sec] = cell.plan }
  }
  return { best, plan }
}

/** Best primary with secondary ≥ need, and the plan that gets it. */
export function bestWith(fr: Frontier, need: number): { primary: number; plan: number[][] | null } {
  let primary = -1, plan: number[][] | null = null
  for (let s = Math.max(0, need); s < fr.best.length; s++) {
    if (fr.best[s] > primary) { primary = fr.best[s]; plan = fr.plan[s] }
  }
  return { primary, plan }
}

/** Plan as seasons × fields (the frontier stores fields × seasons). */
export function planBySeason(plan: number[][]): number[][] {
  const S = plan[0]?.length ?? 0
  return Array.from({ length: S }, (_, s) => plan.map(row => row[s]))
}

export const FIELDS: readonly [number, number, number, number] = [3, 3, 4, 5]
export const SEASONS: readonly [number, number, number, number] = [3, 4, 4, 4]
const WEATHER: readonly [number, number, number, number] = [0, 1, 1, 2]
/** Share of the exact optimum the primary target asks for. */
export const TARGET_SHARE: readonly [number, number, number, number] = [0.75, 0.82, 0.88, 0.93]

export function generate(configId: string, difficulty: Difficulty, seed: number, params?: Record<string, unknown>): Instance {
  const cfg = resolveConfig(CONFIGS, configId, params, 'three-field')
  const rng = mulberry32(hashString(`rotation:${configId}:${difficulty}:${seed}`))
  const F = scale(difficulty, FIELDS), S = scale(difficulty, SEASONS)
  const yielding = cfg.crops.map((c, i) => (c.yields[4] > 0 ? i : -1)).filter(i => i >= 0)
  const fields: FieldState[] = Array.from({ length: F }, () => ({
    n: randInt(rng, 0, 3),
    prev: rng() < 0.7 ? yielding[randInt(rng, 0, yielding.length - 1)] : null,
  }))
  const weather = Array(S).fill(0)
  for (const s of shuffle([...Array(S).keys()].slice(1), rng).slice(0, scale(difficulty, WEATHER))) {
    weather[s] = rng() < 0.5 ? -1 : 1
  }
  const quota = cfg.quota ? { kind: cfg.quota.kind, value: cfg.quota.value(F) } : null
  const draft: Instance = { fields, seasons: S, weather, quota, target: 0, secTarget: 0, optimum: 0 }
  const fr = solveFrontier(cfg, draft, 0, fields)
  let secTarget = 0
  if (cfg.secondaryLabel) {
    // A secondary target that forces a real trade-off: a seeded share of
    // the most secondary output possible.
    const maxSec = fr.best.length - 1
    const [a, b] = cfg.secShare
    const lo = Math.max(1, Math.ceil(maxSec * a)), hi = Math.max(lo, Math.floor(maxSec * b))
    secTarget = randInt(rng, lo, hi)
  }
  const optimum = bestWith(fr, secTarget).primary
  const target = Math.max(1, Math.round(optimum * scale(difficulty, TARGET_SHARE)))
  return { ...draft, target, secTarget, optimum }
}

export interface Progress {
  states: FieldState[]
  primary: number
  sec: number
  /** Per committed season, per field: the harvest. */
  log: { crop: number; primary: number; sec: number }[][]
}

export function replayPlan(cfg: RotationConfig, inst: Instance, seasons: number[][]): Progress {
  let states = inst.fields
  let primary = 0, sec = 0
  const log: Progress['log'] = []
  seasons.forEach((crops, s) => {
    const row = crops.map((c, i) => {
      const h = harvest(cfg, states[i], c, inst.weather[s])
      return { crop: c, primary: h.primary, sec: h.sec, next: h.next }
    })
    states = row.map(r => r.next)
    primary += row.reduce((a, r) => a + r.primary, 0)
    sec += row.reduce((a, r) => a + r.sec, 0)
    log.push(row.map(({ crop, primary, sec }) => ({ crop, primary, sec })))
  })
  return { states, primary, sec, log }
}

/** Can the targets still be met from this point? */
export function stillReachable(cfg: RotationConfig, inst: Instance, done: number, p: Progress): boolean {
  if (done >= inst.seasons) return p.primary >= inst.target && p.sec >= inst.secTarget
  const fr = solveFrontier(cfg, inst, done, p.states)
  return bestWith(fr, inst.secTarget - p.sec).primary + p.primary >= inst.target
}

// ── Component ──────────────────────────────────────────────────────────────────

function Soil({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-[2px]" aria-label={`soil ${n}`}>
      {Array.from({ length: MAX_SOIL }, (_, i) => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${i < n ? 'bg-[#6b4a24]' : 'bg-[#6b4a24]/20'}`} />
      ))}
    </span>
  )
}

export default function RotationGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'three-field')
  const inst = useMemo(() => generate(configId, difficulty, seed, params), [configId, difficulty, seed, params])
  const F = inst.fields.length

  const [committed, setCommitted] = useState<number[][]>([])
  const [draft, setDraft] = useState<(number | null)[]>(() => Array(F).fill(null))
  const [brush, setBrush] = useState(0)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const progress = useMemo(() => replayPlan(cfg, inst, committed), [cfg, inst, committed])
  const season = committed.length
  const preview = draft.map((c, i) => (c === null ? null : harvest(cfg, progress.states[i], c, inst.weather[season] ?? 0)))
  const valid = !settled && season < inst.seasons && seasonValid(cfg, inst, draft)
  const counted = draft.filter(c => c !== null && cfg.crops[c].counted).length

  const plant = (field: number) => {
    if (settled) return
    setDraft(d => d.map((c, i) => (i === field ? (c === brush ? null : brush) : c)))
  }

  const commit = () => {
    if (!valid) return
    const seasons = [...committed, draft as number[]]
    setCommitted(seasons)
    setDraft(Array(F).fill(null))
    const p = replayPlan(cfg, inst, seasons)
    if (seasons.length === inst.seasons) {
      if (p.primary >= inst.target && p.sec >= inst.secTarget) win()
      else lose('The harvest fell short')
    } else if (!stillReachable(cfg, inst, seasons.length, p)) {
      lose('The soil is too worn to reach the target now')
    }
  }

  const draftPrimary = preview.reduce((a, h) => a + (h?.primary ?? 0), 0)
  const draftSec = preview.reduce((a, h) => a + (h?.sec ?? 0), 0)
  const quotaText = inst.quota
    ? `${inst.quota.kind === 'min' ? 'At least' : 'At most'} ${inst.quota.value} ${cfg.quota!.label} per ${cfg.seasonName.toLowerCase()}`
    : 'No field may lie fallow'

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[11px] tabular-nums">
          <p className={`font-bold ${progress.primary >= inst.target ? 'text-emerald-700' : 'text-ink'}`} data-testid="rot-primary">
            {cfg.primaryIcon} {progress.primary} / {inst.target}
          </p>
          {cfg.secondaryLabel && (
            <p className={`font-bold ${progress.sec >= inst.secTarget ? 'text-emerald-700' : 'text-ink'}`} data-testid="rot-secondary">
              {cfg.secondaryIcon} {progress.sec} / {inst.secTarget}
            </p>
          )}
          <p className="text-muted text-[10px]" data-testid="rot-season">
            {cfg.seasonName} {Math.min(season + 1, inst.seasons)} of {inst.seasons}
          </p>
        </div>
      </div>

      <div className="text-[10px] text-muted flex flex-wrap gap-x-3 gap-y-0.5">
        <span>⚖ {quotaText}</span>
        <span>⚠ {cfg.repeatNote}</span>
      </div>

      {/* Plan board: rows = fields, columns = seasons. */}
      <div className="w-full max-w-[430px] mx-auto overflow-x-auto">
        <table className="w-full border-separate" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th className="text-[9px] text-muted font-normal text-left w-12">Field</th>
              {Array.from({ length: inst.seasons }, (_, s) => (
                <th key={s} className={`text-[9px] font-bold ${s === season ? 'text-accent' : 'text-muted'}`}>
                  {cfg.seasonName.slice(0, 1)}{s + 1}
                  {inst.weather[s] !== 0 && (
                    <span className="block font-normal" title={inst.weather[s] > 0 ? cfg.bumperLabel : cfg.leanLabel}>
                      {inst.weather[s] > 0 ? `☀ ${cfg.bumperLabel} +1` : `☂ ${cfg.leanLabel} −1`}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inst.fields.map((_, f) => (
              <tr key={f}>
                <td className="align-middle">
                  <div className="text-[10px] font-bold text-ink-2">#{f + 1}</div>
                  <Soil n={progress.states[f].n} />
                </td>
                {Array.from({ length: inst.seasons }, (_, s) => {
                  if (s < season) {
                    const h = progress.log[s][f]
                    const c = cfg.crops[h.crop]
                    return (
                      <td key={s} className="h-12 rounded-md text-center align-middle opacity-80" style={{ background: cfg.fieldTint }}>
                        <div className="text-base leading-none">{c.icon}</div>
                        <div className="text-[9px] text-ink-2 tabular-nums">
                          {h.primary > 0 ? `+${h.primary}` : ''}{h.sec > 0 ? ` ${cfg.secondaryIcon}${h.sec}` : ''}
                        </div>
                      </td>
                    )
                  }
                  if (s === season && !settled) {
                    const c = draft[f]
                    const h = preview[f]
                    return (
                      <td key={s} className="p-0">
                        <button type="button" data-testid={`rot-cell-${f}`} onClick={() => plant(f)}
                          className={`w-full h-12 rounded-md border-2 ${c === null ? 'border-dashed border-accent/60 bg-panel' : 'border-accent'} text-center`}
                          style={c === null ? undefined : { background: cfg.fieldTint }}>
                          {c === null ? <span className="text-[10px] text-muted">plant</span> : (
                            <>
                              <div className="text-base leading-none">{cfg.crops[c].icon}</div>
                              <div className="text-[9px] text-ink tabular-nums font-bold">
                                {h!.primary > 0 ? `+${h!.primary}` : '0'}{h!.sec > 0 ? ` ${cfg.secondaryIcon}${h!.sec}` : ''}
                                <span className="text-muted font-normal"> → {h!.next.n}</span>
                              </div>
                            </>
                          )}
                        </button>
                      </td>
                    )
                  }
                  return <td key={s} className="h-12 rounded-md bg-panel/50 border border-line/50" />
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!settled && (
        <>
          <div className="grid grid-cols-2 gap-1.5 w-full max-w-[430px] mx-auto">
            {cfg.crops.map((c, i) => (
              <button key={c.id} type="button" data-testid={`rot-crop-${i}`} onClick={() => setBrush(i)}
                className={`rounded-lg border px-2 py-1.5 text-left ${brush === i ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink'}`}>
                <div className="text-xs font-bold">{c.icon} {c.name}</div>
                <div className={`text-[9px] tabular-nums ${brush === i ? 'opacity-90' : 'text-muted'}`}>
                  {c.yields[4] > 0 ? `${cfg.primaryIcon} ${c.yields.join('/')} by soil` : `no ${cfg.primaryLabel.toLowerCase()}`}
                  {c.sec > 0 ? ` · ${cfg.secondaryIcon}+${c.sec}${c.secNeedsRepeat ? ' if fish last time' : ''}` : ''} · soil {c.dn > 0 ? '+' : ''}{c.dn}
                  {c.counted && cfg.quota ? ` · ${cfg.quota.label}` : ''}
                </div>
              </button>
            ))}
          </div>
          <button type="button" data-testid="rot-commit" onClick={commit} disabled={!valid}
            className="h-11 w-full max-w-[430px] mx-auto rounded-lg bg-accent text-accent-fg text-sm font-bold disabled:opacity-40">
            Bring in {cfg.seasonName.toLowerCase()} {season + 1}
            {draft.every(c => c !== null) ? ` (+${draftPrimary}${cfg.secondaryLabel ? ` ${cfg.secondaryIcon}${draftSec}` : ''})` : ''}
          </button>
          {inst.quota && draft.every(c => c !== null) && !valid && (
            <p className="text-red-600 text-[11px] text-center font-bold">
              {inst.quota.kind === 'min' ? `Leave at least ${inst.quota.value} ${cfg.quota!.label}` : `Only ${inst.quota.value} ${cfg.quota!.label} allowed`} ({counted} now).
            </p>
          )}
          <p className="text-muted/80 text-[10px] text-center">Pick a crop, tap fields to plant · soil dots show fertility 0–{MAX_SOIL}</p>
        </>
      )}

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="A full granary!" loseTitle="A lean harvest" />
    </div>
  )
}
