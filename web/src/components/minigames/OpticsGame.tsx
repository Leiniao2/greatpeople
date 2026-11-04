import { useMemo, useState, useCallback, type ReactElement } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, hashString, resolveConfig, scale, useGameOutcome, OutcomeBanner, shuffle, pick, randInt, type Rng } from './_shared'

// Lenses: an optical bench in paraxial optics.
//
// Light runs left to right along a bench of numbered slots. The player takes
// pieces from a small tray (lenses, prisms, holes in a wall, lantern rings,
// the lamp itself), drops them into slots, and "lights the lamp" to trace the
// rays. Only a few lightings are allowed; each one draws where the light went,
// so the player learns from the last attempt. Rays follow thin-lens rules: a
// ray at height y with slope t leaves a lens of focal length f with slope
// t − y/f; a prism adds a colour-dependent bend; a ring adds a fixed bend
// towards the axis inside its band; a wall passes light only through holes.
//
// Every puzzle is built by planting a known solution, so it is always
// solvable; the planted pieces then go into the tray among decoys.
//
// Variants (each changes the goal, not just the size):
//   galileo-telescope  two lenses spaced f₁ − |f₂|: parallel, upright, narrow beam
//   newton-prism       D1 split the spectrum · D2 experimentum crucis · D3–4 recombine
//   alhazen-camera     pinhole images (inverted) · candles at two depths · lens-holes · two images
//   fresnel-lighthouse lens + prism rings collimate a lamp · D3–4 place the lamp too
//
//   tier  lightings  tray     expected
//   D1    4          2–3      ≈ 1 min
//   D2    4          3–5      ≈ 1.5 min
//   D3    3          3–6      ≈ 2 min
//   D4    3          4–8      ≈ 2.5–3 min

export type Kind = 'galileo' | 'newton' | 'alhazen' | 'fresnel'

interface OpticsConfig { title: string; intro: string; fact: string; kind: Kind }

export const CONFIGS: Record<string, OpticsConfig> = {
  'galileo-telescope': {
    title: 'Galileo’s Spyglass, Padua 1609',
    intro: 'Starlight arrives as a wide parallel beam. Put a convex objective and a concave eyepiece in the tube so the light reaches the eye still parallel, upright and narrow enough for the pupil.',
    fact: 'In 1609 Galileo built telescopes with a convex objective and a concave eyepiece; with one of about 20× he discovered four moons of Jupiter in January 1610.',
    kind: 'galileo',
  },
  'newton-prism': {
    title: 'Newton’s Prisms, Cambridge 1666',
    intro: 'A sunbeam enters through a hole in the shutter. Prisms bend violet more than green and green more than red. Use them to split, sort and rejoin the colours of white light.',
    fact: 'Newton showed with prisms that white light is a mixture of colours; in his “experimentum crucis” (1672) a single colour sent through a second prism bent again but did not split further.',
    kind: 'newton',
  },
  'alhazen-camera': {
    title: 'Alhazen’s Dark Room, Cairo',
    intro: 'Light from each point of a candle travels in straight lines. Make a hole in the wall of the dark room so the candle’s image falls on the marks on the back wall — upside down.',
    fact: 'In his Book of Optics (c. 1011–1021) Ibn al-Haytham (Alhazen) explained the camera obscura: light from candles through a small hole forms inverted images, proof that light travels in straight lines.',
    kind: 'alhazen',
  },
  'fresnel-lighthouse': {
    title: 'Fresnel’s Lantern, Cordouan 1823',
    intro: 'Turn the lamp’s spreading light into one parallel beam out to sea. The centre takes a lens; the outer zones take thin prism rings that each bend light back by a fixed amount.',
    fact: 'Augustin Fresnel replaced a heavy solid lens with a central lens ringed by thin prisms; his first lighthouse lens was lit at Cordouan, at the mouth of the Gironde, in 1823.',
    kind: 'fresnel',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Model ──────────────────────────────────────────────────────────────────────

export type PieceKind = 'lens' | 'prism' | 'hole' | 'ring' | 'lamp'

export interface Piece {
  id: string
  kind: PieceKind
  /** Focal length (lens, lens-hole). Negative = concave. */
  f?: number
  /** Prism strength multiplier. */
  s?: number
  /** Hole half-width. */
  r?: number
  /** Ring bend (slope change towards the axis). */
  b?: number
}

export interface Place { slot: number; row: number; o: 1 | -1 }
export type Placement = Record<string, Place>

export interface Mark { key: string; y: number; colour: string; label: string; point?: number }
export interface Point { x: number; y: number; flame: boolean }
export type NewtonMode = 'split' | 'crucis' | 'recombine'

export interface Puzzle {
  kind: Kind
  difficulty: Difficulty
  /** Slots are 1..S (fresnel lamp may use slot 0). */
  S: number
  endX: number
  xmin: number
  tray: Piece[]
  planted: Placement
  blocked: number[]
  marks: Mark[]
  tol: number
  checks: number
  focalHints: boolean
  preview: boolean
  goal: string
  // galileo
  beam?: number[]
  pupil?: number
  // newton
  y0?: number
  mode?: NewtonMode
  slit?: { x: number; y: number; w: number }
  target?: string
  // alhazen
  points?: Point[]
  // fresnel
  frame?: number
  zones?: number
  /** Fixed lamp position, or null when the lamp is a tray piece. */
  lampX?: number | null
  rayHeights?: number[]
}

export const COLOURS = [
  { key: 'red', d: 0.10, hex: '#f87171' },
  { key: 'green', d: 0.15, hex: '#4ade80' },
  { key: 'violet', d: 0.20, hex: '#a78bfa' },
] as const
const WHITE = '#fde68a'

export const holeY = (row: number) => -3 + 0.5 * row
export const HOLE_ROWS = 13

export interface Ray { x: number; y: number; t: number; d: number; colour: string; key: string; yIn: number; hole?: string; point?: number }
export interface Traced { pts: [number, number][]; y: number; t: number; alive: boolean; colour: string; key: string; yIn: number; hole?: string; point?: number }
interface Elem { x: number; fn: (r: Ray) => Ray | null }

export function pieceById(pz: Puzzle, id: string): Piece {
  return pz.tray.find(p => p.id === id)!
}

/** A piece that takes a whole slot (nothing else may share it). */
export function fullColumn(pz: Puzzle, piece: Piece): boolean {
  return piece.kind === 'lamp' || pz.kind === 'galileo' || pz.kind === 'newton'
}

export function allowedSlots(pz: Puzzle, piece: Piece): number[] {
  if (pz.kind === 'fresnel') {
    const F = pz.frame!
    if (piece.kind === 'lamp') return Array.from({ length: F - 1 }, (_, i) => i)
    return [F]
  }
  const out: number[] = []
  for (let s = 1; s <= pz.S; s++) if (!pz.blocked.includes(s)) out.push(s)
  return out
}

export function rowsFor(pz: Puzzle, piece: Piece): number[] {
  if (piece.kind === 'hole') return Array.from({ length: HOLE_ROWS }, (_, i) => i)
  if (piece.kind === 'ring') return Array.from({ length: pz.zones ?? 1 }, (_, i) => i + 1)
  return [0]
}

/** Put a piece at (slot,row); clashing pieces go back to the tray. Holes share one wall. */
export function placePiece(pz: Puzzle, pl: Placement, id: string, slot: number, row: number): Placement {
  const piece = pieceById(pz, id)
  if (!allowedSlots(pz, piece).includes(slot) || !rowsFor(pz, piece).includes(row)) return pl
  const next: Placement = {}
  for (const [qid, q] of Object.entries(pl)) {
    if (qid === id) continue
    const other = pieceById(pz, qid)
    let place = q
    if (piece.kind === 'hole' && other.kind === 'hole') place = { ...q, slot }
    const clash = place.slot === slot && (fullColumn(pz, piece) || fullColumn(pz, other) || place.row === row)
    if (!clash) next[qid] = place
  }
  next[id] = { slot, row, o: pl[id]?.o ?? 1 }
  return next
}

export function emitRays(pz: Puzzle, pl: Placement): Ray[] {
  switch (pz.kind) {
    case 'galileo':
      return pz.beam!.map(h => ({ x: 0, y: h, t: 0, d: 0, colour: WHITE, key: `b${h}`, yIn: h }))
    case 'newton':
      return COLOURS.map(c => ({ x: 0, y: pz.y0!, t: 0, d: c.d, colour: c.hex, key: c.key, yIn: pz.y0! }))
    case 'alhazen': {
      const out: Ray[] = []
      const holes = pz.tray.filter(p => p.kind === 'hole' && pl[p.id])
      pz.points!.forEach((pt, i) => {
        for (const h of holes) {
          const pos = pl[h.id], a = holeY(pos.row)
          for (const k of [-1, 0, 1]) {
            const aim = a + k * h.r! * 0.9
            out.push({ x: pt.x, y: pt.y, t: (aim - pt.y) / (pos.slot - pt.x), d: 0, colour: pt.flame ? '#fbbf24' : '#d6a26b', key: `${i}:${h.id}:${k}`, yIn: pt.y, hole: h.id, point: i })
          }
        }
      })
      return out
    }
    case 'fresnel': {
      const lamp = pz.tray.find(p => p.kind === 'lamp')
      const lx = pz.lampX ?? (lamp && pl[lamp.id] ? pl[lamp.id].slot : null)
      if (lx === null || lx === undefined) return []
      const dist = pz.frame! - lx
      if (dist <= 0) return []
      const out: Ray[] = []
      for (const h of pz.rayHeights!) for (const sg of [1, -1]) {
        out.push({ x: lx, y: 0, t: (sg * h) / dist, d: 0, colour: WHITE, key: `${sg * h}`, yIn: sg * h })
      }
      return out
    }
  }
}

function buildElements(pz: Puzzle, pl: Placement): Elem[] {
  const els: Elem[] = []
  for (const [id, pos] of Object.entries(pl)) {
    const p = pieceById(pz, id)
    const x = pos.slot
    if (p.kind === 'lens' && pz.kind === 'fresnel') {
      els.push({ x, fn: r => (Math.abs(r.y) <= 1 + 1e-9 ? { ...r, t: r.t - r.y / p.f! } : r) })
    } else if (p.kind === 'lens') {
      els.push({ x, fn: r => ({ ...r, t: r.t - r.y / p.f! }) })
    } else if (p.kind === 'prism') {
      els.push({ x, fn: r => ({ ...r, t: r.t + pos.o * p.s! * r.d }) })
    } else if (p.kind === 'ring') {
      const lo = pos.row, hi = pos.row + 1
      els.push({ x, fn: r => {
        const ay = Math.abs(r.y)
        return ay > lo + 1e-9 && ay <= hi + 1e-9 ? { ...r, t: r.t - Math.sign(r.y) * p.b! } : r
      } })
    } else if (p.kind === 'hole') {
      const a = holeY(pos.row)
      els.push({ x, fn: r => {
        if (r.hole !== id) return r
        if (Math.abs(r.y - a) > p.r! + 1e-9) return null
        return p.f ? { ...r, t: r.t - (r.y - a) / p.f } : r
      } })
    }
  }
  if (pz.slit) {
    const { x, y, w } = pz.slit
    els.push({ x, fn: r => (Math.abs(r.y - y) <= w + 1e-9 ? r : null) })
  }
  return els.sort((a, b) => a.x - b.x)
}

export function traceRay(ray: Ray, els: Elem[], endX: number): Traced {
  let r = ray
  const pts: [number, number][] = [[r.x, r.y]]
  for (const e of els) {
    if (e.x < r.x - 1e-9) continue
    const y = r.y + r.t * (e.x - r.x)
    r = { ...r, x: e.x, y }
    pts.push([e.x, y])
    const n = e.fn(r)
    if (!n) return { pts, y, t: r.t, alive: false, colour: r.colour, key: r.key, yIn: r.yIn, hole: r.hole, point: r.point }
    r = n
  }
  const y = r.y + r.t * (endX - r.x)
  pts.push([endX, y])
  return { pts, y, t: r.t, alive: true, colour: r.colour, key: r.key, yIn: r.yIn, hole: r.hole, point: r.point }
}

export function traceAll(pz: Puzzle, pl: Placement): Traced[] {
  const els = buildElements(pz, pl)
  return emitRays(pz, pl).map(r => traceRay(r, els, pz.endX))
}

export interface Verdict { ok: boolean; why: string; rays: Traced[] }

export function evaluate(pz: Puzzle, pl: Placement): Verdict {
  const rays = traceAll(pz, pl)
  const res = (ok: boolean, why: string): Verdict => ({ ok, why, rays })
  switch (pz.kind) {
    case 'galileo': {
      for (const r of rays) if (Math.abs(r.t) > 0.02) return res(false, 'The light leaves the tube spreading or converging — not parallel.')
      for (const r of rays) if (r.y * r.yIn < 0) return res(false, 'The beam is parallel but flipped: the sky would look upside down.')
      for (const r of rays) if (Math.abs(r.y) > pz.pupil! + 1e-9) return res(false, 'The beam is wider than the pupil of the eye.')
      return res(true, '')
    }
    case 'newton': {
      if (pz.mode === 'recombine') {
        const prisms = pz.tray.filter(p => p.kind === 'prism')
        if (prisms.some(p => !pl[p.id])) return res(false, 'Both prisms must be on the bench.')
      }
      const mark = (key: string) => pz.marks.find(m => m.key === key)
      if (pz.mode === 'crucis') {
        const r = rays.find(x => x.key === pz.target)!
        if (!r.alive) return res(false, `The ${pz.target} light did not get through the slit.`)
        if (Math.abs(r.y - pz.marks[0].y) > pz.tol) return res(false, `The ${pz.target} light missed the mark.`)
        return res(true, '')
      }
      for (const r of rays) {
        const m = pz.mode === 'split' ? mark(r.key)! : pz.marks[0]
        if (!r.alive || Math.abs(r.y - m.y) > pz.tol) return res(false, pz.mode === 'split' ? `The ${r.key} light missed its mark.` : 'The colours did not meet as white on the mark.')
      }
      return res(true, '')
    }
    case 'alhazen': {
      const pts = pz.points!
      for (let i = 0; i < pts.length; i++) {
        const mine = rays.filter(r => r.point === i)
        if (!mine.length) return res(false, 'No light enters the dark room.')
        const marks = pz.marks.filter(m => m.point === i)
        for (const r of mine) if (!r.alive || !marks.some(m => Math.abs(m.y - r.y) <= pz.tol)) return res(false, 'Part of the image falls off the marks (or is blurred).')
        const groups = new Map<string, number[]>()
        for (const r of mine) groups.set(r.hole!, [...(groups.get(r.hole!) ?? []), r.y])
        for (const ys of groups.values()) if (Math.max(...ys) - Math.min(...ys) > 2 * pz.tol) return res(false, 'The image is blurred.')
        for (const m of marks) if (!mine.some(r => Math.abs(m.y - r.y) <= pz.tol)) return res(false, 'Some marks stay dark.')
      }
      return res(true, '')
    }
    case 'fresnel': {
      if (!rays.length) return res(false, 'The lamp is not in the lantern.')
      for (const r of rays) if (Math.abs(r.t) > pz.tol) return res(false, 'Some light still spreads instead of running parallel to sea.')
      return res(true, '')
    }
  }
}

// ── Generators ─────────────────────────────────────────────────────────────────

export const CHECKS: readonly [number, number, number, number] = [4, 4, 3, 3]

function finish(pz: Omit<Puzzle, 'tray' | 'planted'>, planted: { piece: Omit<Piece, 'id'>; place: Place }[], decoys: Omit<Piece, 'id'>[], rng: Rng): Puzzle {
  const all = shuffle([...planted.map(p => ({ piece: p.piece, place: p.place as Place | null })), ...decoys.map(d => ({ piece: d, place: null }))], rng)
  const tray: Piece[] = []
  const pl: Placement = {}
  all.forEach((e, i) => {
    const id = `p${i}`
    tray.push({ ...e.piece, id })
    if (e.place) pl[id] = e.place
  })
  return { ...pz, tray, planted: pl }
}


const GAL_PAIRS: [number, number][] = [[4, -2], [6, -2], [6, -3], [8, -2], [8, -4], [5, -2], [9, -3], [3, -1], [4, -1], [5, -1], [6, -1], [7, -2]]

function genGalileo(d: Difficulty, rng: Rng): Puzzle {
  const S = scale(d, [8, 9, 10, 11])
  const H = 2.5
  const beam = d === 1 ? [-H, H] : [-H, -1.25, 1.25, H]
  const pairs = GAL_PAIRS.filter(([f1, f2]) => f1 + f2 <= S - 1 && f1 <= S)
  const [f1, f2] = pick(pairs, rng)
  const g = f1 + f2
  const p1 = randInt(rng, 1, S - g)
  const m = f1 / -f2
  const pupil = d <= 2 ? 1.6 : Math.round((H / m + 0.2) * 100) / 100
  const used = [f1, f2]
  const pool = shuffle([2, 3, 4, 5, 6, 7, 8, 9, -1, -2, -3, -4].filter(f => !used.includes(f)), rng)
  const nDecoy = scale(d, [1, 2, 3, 4])
  const decoys: number[] = []
  if (d >= 3) decoys.push(pool.find(f => f > 0)!)
  for (const f of pool) { if (decoys.length >= nDecoy) break; if (!decoys.includes(f)) decoys.push(f) }
  const blocked: number[] = []
  if (d === 4) {
    const free = shuffle(Array.from({ length: S }, (_, i) => i + 1).filter(s => s !== p1 && s !== p1 + g), rng)
    blocked.push(...free.slice(0, 2).sort((a, b) => a - b))
  }
  return finish({
    kind: 'galileo', difficulty: d, S, endX: S + 1, xmin: -0.6, blocked, marks: [], tol: 0.02,
    checks: CHECKS[d - 1], focalHints: d <= 2, preview: d <= 2, beam, pupil,
    goal: d <= 2
      ? `Two lenses, spaced so the beam leaves parallel, upright and inside the pupil (±${pupil}). Tip: a concave lens f₂ placed f₁ − |f₂| behind a convex f₁ does it.`
      : `Narrow the beam to the pupil (±${pupil}) — that takes enough magnification (f₁ ÷ |f₂|). Parallel and upright too.${blocked.length ? ' Some slots of the tube are blocked.' : ''}`,
  }, [
    { piece: { kind: 'lens', f: f1 }, place: { slot: p1, row: 0, o: 1 } },
    { piece: { kind: 'lens', f: f2 }, place: { slot: p1 + g, row: 0, o: 1 } },
  ], decoys.map(f => ({ kind: 'lens' as const, f })), rng)
}

const colourD = (key: string) => COLOURS.find(c => c.key === key)!.d

function genNewton(d: Difficulty, rng: Rng): Puzzle {
  const base = { kind: 'newton' as const, difficulty: d, xmin: -0.6, checks: CHECKS[d - 1], focalHints: d <= 2, preview: false }
  for (let guard = 0; guard < 400; guard++) {
    if (d === 1) {
      const S = 9, end = 10
      const s = randInt(rng, 1, 2), p = randInt(rng, 1, S), o = (rng() < 0.5 ? 1 : -1) as 1 | -1
      const span = s * (end - p)
      if (span < 6 || span > 26) continue
      const y0 = -o * pick([1, 1.5, 2, 2.5], rng)
      const ys = COLOURS.map(c => y0 + o * s * c.d * (end - p))
      if (ys.some(y => Math.abs(y) > 3.6)) continue
      return finish({
        ...base, S, endX: end, blocked: [], tol: 0.12, y0, mode: 'split',
        marks: COLOURS.map((c, i) => ({ key: c.key, y: ys[i], colour: c.hex, label: c.key })),
        goal: 'Split the sunbeam: red, green and violet must each land on their own mark on the screen. Tap a placed prism to flip it.',
      }, [{ piece: { kind: 'prism', s }, place: { slot: p, row: 0, o } }], [{ kind: 'prism', s: 3 - s }, { kind: 'lens', f: pick([2, 3, -2], rng) }].slice(0, 1) as Omit<Piece, 'id'>[], rng)
    }
    if (d === 2) {
      const S = 10, end = 11
      const q = randInt(rng, 5, 7)
      const s1 = randInt(rng, 1, 2), p1 = randInt(rng, 1, q - 1), o1 = (rng() < 0.5 ? 1 : -1) as 1 | -1
      if (s1 * (q - p1) < 5) continue
      const target = pick(['red', 'green', 'violet'], rng)
      const dc = colourD(target)
      const y0 = -o1 * pick([1, 1.5, 2], rng)
      const a = y0 + o1 * s1 * dc * (q - p1)
      if (Math.abs(a) > 3.2) continue
      const s2 = randInt(rng, 1, 2), p2 = randInt(rng, q + 1, S - 1), o2 = (rng() < 0.5 ? 1 : -1) as 1 | -1
      const tSlope = o1 * s1 * dc + o2 * s2 * dc
      const yEnd = a + o1 * s1 * dc * (p2 - q) + tSlope * (end - p2)
      const noSecond = a + o1 * s1 * dc * (end - q)
      if (Math.abs(yEnd) > 3.6 || Math.abs(yEnd - noSecond) < 0.4) continue
      return finish({
        ...base, S, endX: end, blocked: [q], tol: 0.12, y0, mode: 'crucis', target,
        slit: { x: q, y: a, w: 0.1 },
        marks: [{ key: target, y: yEnd, colour: COLOURS.find(c => c.key === target)!.hex, label: target }],
        goal: `Experimentum crucis: split the beam so only the ${target} light passes the slit in the board, then bend that ${target} light with the second prism onto the mark.`,
      }, [
        { piece: { kind: 'prism', s: s1 }, place: { slot: p1, row: 0, o: o1 } },
        { piece: { kind: 'prism', s: s2 }, place: { slot: p2, row: 0, o: o2 } },
      ], [{ kind: 'lens', f: pick([2, 3, -2], rng) }], rng)
    }
    // recombine: prism (s1) — lens at u — prism (s2) at v more, with s2 = s1·u/v.
    const S = d === 3 ? 10 : 11, end = S + 1
    const combos: [number, number, number, number, number][] = [
      [1, 1, 2, 2, 1], [1, 1, 3, 3, 1.5], [1, 1, 4, 4, 2], [2, 2, 2, 2, 1], [2, 2, 3, 3, 1.5], [1, 2, 6, 3, 2], [2, 1, 3, 6, 2],
    ].filter(c => c[2] + c[3] <= S - 1) as [number, number, number, number, number][]
    const [s1, s2, u, v, f] = pick(combos, rng)
    const p1 = randInt(rng, 1, S - u - v)
    const o = (rng() < 0.5 ? 1 : -1) as 1 | -1
    const y0 = pick([-1, -0.5, 0, 0.5, 1], rng)
    const lensFs = [1, 1.5, 2, 2.5, 3, 4, -2].filter(x => x !== f)
    const decoys = shuffle(lensFs, rng).slice(0, d === 3 ? 1 : 3).map(x => ({ kind: 'lens' as const, f: x }))
    const pz = finish({
      ...base, S, endX: end, blocked: [], tol: 0.08, y0, mode: 'recombine', marks: [],
      goal: 'Recombination: spread the colours with one prism, gather them with a lens, and cancel the spread with the other prism so all three meet as white on the mark. Both prisms must be used.',
    }, [
      { piece: { kind: 'prism', s: s1 }, place: { slot: p1, row: 0, o } },
      { piece: { kind: 'lens', f }, place: { slot: p1 + u, row: 0, o: 1 } },
      { piece: { kind: 'prism', s: s2 }, place: { slot: p1 + u + v, row: 0, o } },
    ], decoys, rng)
    const rays = traceAll(pz, pz.planted)
    const yEnd = rays[1].y
    if (Math.abs(yEnd) > 3.4 || rays.some(r => r.pts.some(([, y]) => Math.abs(y) > 3.8))) continue
    pz.marks = [{ key: 'white', y: yEnd, colour: '#f8fafc', label: 'white' }]
    return pz
  }
  throw new Error('newton generator failed')
}

const LENS_PAIRS: [number, number, number][] = [[3, 6, 2], [6, 3, 2], [5, 5, 2.5], [4, 6, 2.4], [6, 4, 2.4], [6, 6, 3], [4, 4, 2], [3, 7, 2.1], [7, 3, 2.1]]

function genAlhazen(d: Difficulty, rng: Rng): Puzzle {
  for (let guard = 0; guard < 600; guard++) {
    let S: number, x0: number, p: number, f: number | undefined
    if (d <= 2) {
      S = d === 1 ? 8 : 9; x0 = 0; p = randInt(rng, 2, S - 1)
    } else {
      const [u, v, ff] = pick(LENS_PAIRS, rng)
      x0 = pick([0, -1, -2], rng)
      p = x0 + u; S = p + v - 1; f = ff
      if (p < 1 || S < 7 || S > 12) continue
    }
    const L = S + 1
    const base = pick([-2, -1.5, -1, -0.5], rng)
    const h = pick([1.5, 2, 2.5], rng)
    const points: Point[] = [{ x: x0, y: base + h, flame: true }, { x: x0, y: base, flame: false }]
    if (d === 2) points.push({ x: -2, y: pick([0.5, 1, 1.5, -0.5], rng), flame: true })
    const ratio = (pt: Point) => (L - p) / (p - pt.x)
    if (points.some(pt => ratio(pt) < 0.5 || ratio(pt) > 2.2)) continue
    const rowsN = d === 4 ? 2 : 1
    const rows = shuffle(Array.from({ length: HOLE_ROWS }, (_, i) => i), rng).slice(0, rowsN)
    if (rowsN === 2 && Math.abs(holeY(rows[0]) - holeY(rows[1])) < 2) continue
    const marks: Mark[] = []
    rows.forEach((row, hi) => {
      const a = holeY(row)
      points.forEach((pt, i) => marks.push({ key: `${i}:${hi}`, y: a + (a - pt.y) * ratio(pt), colour: pt.flame ? '#fbbf24' : '#b07a45', label: pt.flame ? 'flame' : 'base', point: i }))
    })
    if (marks.some(m => Math.abs(m.y) > 3.6)) continue
    let sep = Infinity
    for (let i = 0; i < marks.length; i++) for (let j = i + 1; j < marks.length; j++) sep = Math.min(sep, Math.abs(marks[i].y - marks[j].y))
    if (sep < 0.5) continue
    const planted: { piece: Omit<Piece, 'id'>; place: Place }[] = rows.map(row => ({
      piece: d <= 2 ? { kind: 'hole', r: 0.05 } : { kind: 'hole', r: 0.6, f },
      place: { slot: p, row, o: 1 },
    }))
    let decoys: Omit<Piece, 'id'>[] = []
    if (d === 2) decoys = [{ kind: 'hole', r: 0.6 }]
    if (d >= 3) {
      const fs = shuffle([1.5, 2, 2.4, 2.5, 3, 3.6, 4].filter(x => Math.abs(1 / x - 1 / f!) >= 0.1), rng).slice(0, 2)
      decoys = fs.map(x => ({ kind: 'hole', r: 0.6, f: x }))
    }
    const goal = [
      'Cut one pinhole in the wall: the candle’s flame and base must land on their marks. The image comes out upside down.',
      'Three points of light — one candle further back. A wide hole is brighter but blurs; one pinhole must put every point on its mark.',
      'A wide hole blurs, so it needs a lens: pick the lens-hole that focuses the candle sharply on the marks (1/f = 1/near + 1/far).',
      'Two lens-holes in the same wall make two sharp images: every mark must be lit and nothing blurred.',
    ][d - 1]
    const pz = finish({
      kind: 'alhazen', difficulty: d, S, endX: L, xmin: Math.min(...points.map(pt => pt.x)) - 0.8, blocked: [], marks, tol: 0.2,
      checks: CHECKS[d - 1], focalHints: false, preview: false, points, goal,
    }, planted, decoys, rng)
    if (!evaluate(pz, pz.planted).ok) continue
    // The decoy hole must not also work in place of the planted one.
    if (d === 2) {
      const wide = pz.tray.find(t => t.r === 0.6)!, pin = pz.tray.find(t => t.r === 0.05)!
      if (evaluate(pz, { [wide.id]: pz.planted[pin.id] }).ok) continue
    }
    return pz
  }
  throw new Error('alhazen generator failed')
}

function genFresnel(d: Difficulty, rng: Rng): Puzzle {
  const Z = scale(d, [1, 2, 2, 3])
  const p = randInt(rng, 3, d === 4 ? 5 : 6)
  const lampFixed = d <= 2
  const F = lampFixed ? p : p + randInt(rng, 1, 3)
  const S = F + 2
  const heights = [0.5, ...Array.from({ length: Z }, (_, k) => k + 1.5)]
  const bend = (h: number, dist: number) => Math.round((h / dist) * 1e6) / 1e6
  const planted: { piece: Omit<Piece, 'id'>; place: Place }[] = [
    { piece: { kind: 'lens', f: p }, place: { slot: F, row: 0, o: 1 } },
    ...heights.slice(1).map((h, k) => ({ piece: { kind: 'ring' as const, b: bend(h, p) }, place: { slot: F, row: k + 1, o: 1 as const } })),
  ]
  if (!lampFixed) planted.push({ piece: { kind: 'lamp' }, place: { slot: F - p, row: 0, o: 1 } })
  const others = shuffle([2, 3, 4, 5, 6, 7].filter(x => x !== p && (lampFixed || x < F)), rng)
  const decoys: Omit<Piece, 'id'>[] = []
  const p1 = others[0], p2 = others[1]
  decoys.push({ kind: 'lens', f: p1 })
  if (d >= 2) decoys.push({ kind: 'ring', b: bend(Z >= 2 ? 2.5 : 1.5, p1) })
  if (d >= 3) decoys.push({ kind: 'ring', b: bend(1.5, p2) })
  return finish({
    kind: 'fresnel', difficulty: d, S, endX: F + 3, xmin: -0.6, blocked: [], marks: [], tol: 0.01,
    checks: CHECKS[d - 1], focalHints: d <= 2, preview: d <= 2,
    frame: F, zones: Z, lampX: lampFixed ? 0 : null, rayHeights: heights,
    goal: lampFixed
      ? `Every ray must leave the lantern parallel. The lens works only if the lamp sits at its focus; a ring at height h must bend by h ÷ (lamp distance).`
      : `Place the lamp as well: its distance to the lantern must be the lens’s focal length, and each ring at height h must bend by h ÷ that distance.`,
  }, planted, decoys, rng)
}

export function generate(kind: Kind, difficulty: Difficulty, seed: number): Puzzle {
  const rng = mulberry32(seed ^ hashString('optics:' + kind))
  switch (kind) {
    case 'galileo': return genGalileo(difficulty, rng)
    case 'newton': return genNewton(difficulty, rng)
    case 'alhazen': return genAlhazen(difficulty, rng)
    case 'fresnel': return genFresnel(difficulty, rng)
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

const W = 360, H = 232
const fmt = (n: number) => (Math.round(n * 100) / 100).toString()

export function pieceLabel(p: Piece): string {
  switch (p.kind) {
    case 'lens': return p.f! > 0 ? `Convex f=${fmt(p.f!)}` : `Concave f=${fmt(p.f!)}`
    case 'prism': return `Prism ×${p.s}`
    case 'hole': return p.f ? `Lens-hole f=${fmt(p.f)}` : p.r! < 0.2 ? 'Pinhole' : 'Wide hole'
    case 'ring': return `Ring bend ${fmt(p.b!)}`
    case 'lamp': return 'Lamp'
  }
}

const ICON: Record<PieceKind, string> = { lens: '◯', prism: '△', hole: '◌', ring: '◢', lamp: '✺' }

export default function OpticsGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'galileo-telescope')
  const pz = useMemo(() => generate(config.kind, difficulty, seed), [config.kind, difficulty, seed])
  const [pl, setPl] = useState<Placement>({})
  const [sel, setSel] = useState<string | null>(null)
  const [left, setLeft] = useState(pz.checks)
  const [last, setLast] = useState<Verdict | null>(null)
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const sx = (x: number) => 14 + ((x - pz.xmin) / (pz.endX + 0.4 - pz.xmin)) * (W - 28)
  const sy = (y: number) => H / 2 - 4 - y * 25
  const colW = sx(1) - sx(0)

  const selPiece = sel ? pieceById(pz, sel) : null

  const place = useCallback((slot: number, row: number) => {
    if (settled || !sel) return
    setPl(cur => placePiece(pz, cur, sel, slot, row))
  }, [settled, sel, pz])

  const flip = useCallback(() => {
    if (!sel || !pl[sel] || settled) return
    setPl(cur => ({ ...cur, [sel]: { ...cur[sel], o: (cur[sel].o * -1) as 1 | -1 } }))
  }, [sel, pl, settled])

  const remove = useCallback(() => {
    if (!sel || settled) return
    setPl(cur => { const n = { ...cur }; delete n[sel]; return n })
  }, [sel, settled])

  const light = useCallback(() => {
    if (settled || left <= 0) return
    const v = evaluate(pz, pl)
    setLast(v)
    const l = left - 1
    setLeft(l)
    if (v.ok) win()
    else if (l === 0) lose(v.why || 'The light never found its mark')
  }, [settled, left, pz, pl, win, lose])

  // Faint preview of the incoming light (low tiers, fresnel lamp fan only).
  const previewRays = pz.preview && pz.kind === 'fresnel' && !last ? traceAll(pz, {}) : []
  const rays = last?.rays ?? []

  const renderPiece = (p: Piece) => {
    const pos = pl[p.id]
    if (!pos) return null
    const x = sx(pos.slot)
    const active = sel === p.id
    const stroke = active ? '#38bdf8' : '#e2e8f0'
    let body: ReactElement
    if (p.kind === 'lens' && pz.kind !== 'fresnel') {
      body = p.f! > 0
        ? <ellipse cx={x} cy={sy(0)} rx={5} ry={sy(-3.4) - sy(0)} fill="rgba(125,211,252,.25)" stroke={stroke} strokeWidth={1.5} />
        : <path d={`M${x - 6},${sy(3.4)} Q${x},${sy(0)} ${x - 6},${sy(-3.4)} L${x + 6},${sy(-3.4)} Q${x},${sy(0)} ${x + 6},${sy(3.4)} Z`} fill="rgba(125,211,252,.25)" stroke={stroke} strokeWidth={1.5} />
    } else if (p.kind === 'lens') {
      body = <ellipse cx={x} cy={sy(0)} rx={4} ry={25} fill="rgba(125,211,252,.35)" stroke={stroke} strokeWidth={1.5} />
    } else if (p.kind === 'prism') {
      const up = pos.o === 1
      const top = sy(up ? 1.6 : -1.6), bot = sy(up ? -1.6 : 1.6)
      const cy0 = sy(pz.y0 ?? 0)
      body = <path d={`M${x},${top + cy0 - sy(0)} L${x + 10},${bot + cy0 - sy(0)} L${x - 10},${bot + cy0 - sy(0)} Z`} fill="rgba(226,232,240,.18)" stroke={stroke} strokeWidth={1.5} />
    } else if (p.kind === 'hole') {
      const a = holeY(pos.row)
      body = <g>
        <rect x={x - 3} y={sy(a + Math.max(p.r!, 0.12))} width={6} height={sy(a - Math.max(p.r!, 0.12)) - sy(a + Math.max(p.r!, 0.12))} fill={p.f ? 'rgba(125,211,252,.6)' : '#0b1020'} stroke={stroke} strokeWidth={1} />
      </g>
    } else if (p.kind === 'ring') {
      const lo = pos.row, hi = pos.row + 1
      body = <g>
        {[1, -1].map(sg => <path key={sg} d={`M${x - 4},${sy(sg * lo)} L${x + 4},${sy(sg * (lo + 0.3))} L${x + 4},${sy(sg * hi)} L${x - 4},${sy(sg * hi)} Z`} fill="rgba(125,211,252,.35)" stroke={stroke} strokeWidth={1} />)}
      </g>
    } else {
      body = <circle cx={x} cy={sy(0)} r={7} fill="#fde047" stroke={stroke} strokeWidth={1.5} />
    }
    return (
      <g key={p.id} data-piece={p.id} onClick={() => !settled && setSel(p.id)} style={{ cursor: 'pointer' }}>
        {body}
        {pz.focalHints && p.kind === 'lens' && pz.kind !== 'fresnel' && [1, -1].map(sg => {
          const fx = pos.slot + sg * p.f!
          if (fx < pz.xmin || fx > pz.endX + 0.4) return null
          return <text key={sg} x={sx(fx)} y={sy(0) + 12} textAnchor="middle" fontSize={8} fill="#7dd3fc">F</text>
        })}
      </g>
    )
  }

  const cells: ReactElement[] = []
  if (selPiece && !settled) {
    const rows = rowsFor(pz, selPiece)
    for (const s of allowedSlots(pz, selPiece)) {
      const x = sx(s)
      for (const row of rows) {
        const bands: [number, number][] = selPiece.kind === 'hole'
          ? [[holeY(row) + 0.25, holeY(row) - 0.25]]
          : selPiece.kind === 'ring' ? [[row + 1, row], [-row, -row - 1]]
          : selPiece.kind === 'lens' && pz.kind === 'fresnel' ? [[1, -1]]
          : [[4, -4]]
        bands.forEach(([a, b], k) => cells.push(
          <rect key={`${s}:${row}:${k}`} data-cell={`${s}:${row}`} x={x - colW / 2 + 1} width={colW - 2} y={sy(a)} height={sy(b) - sy(a)}
            fill="rgba(56,189,248,.08)" stroke="rgba(56,189,248,.25)" strokeWidth={0.5} onClick={() => place(s, row)} style={{ cursor: 'pointer' }} />,
        ))
      }
    }
  }

  const wallSlot = pz.kind === 'alhazen' ? Object.values(pl)[0]?.slot : undefined

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
          <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          <p className="font-bold text-ink-2">D{difficulty}</p>
          <p data-testid="opt-left" className={`font-bold tabular-nums ${left <= 1 ? 'text-red-600' : 'text-accent'}`}>✺ {left} left</p>
        </div>
      </div>
      <p className="text-ink-2 text-xs leading-relaxed" data-testid="opt-goal">{pz.goal}</p>

      <div className="w-full max-w-[430px] mx-auto rounded-xl border border-line overflow-hidden" style={{ background: 'radial-gradient(circle at 30% 40%, #1e2540 0%, #0b0e18 80%)' }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block select-none" role="img" aria-label="optical bench">
          {/* bench */}
          <line x1={sx(pz.xmin)} x2={sx(pz.endX)} y1={sy(0)} y2={sy(0)} stroke="#334155" strokeDasharray="3 4" />
          {Array.from({ length: pz.S + (pz.kind === 'fresnel' ? 1 : 0) }, (_, i) => (pz.kind === 'fresnel' ? i : i + 1)).map(s => (
            <g key={s}>
              <line x1={sx(s)} x2={sx(s)} y1={sy(-4.1)} y2={sy(-3.85)} stroke="#64748b" />
              <text x={sx(s)} y={sy(-4.45)} textAnchor="middle" fontSize={8} fill="#94a3b8">{s}</text>
              {pz.blocked.includes(s) && !(pz.slit && pz.slit.x === s) && (
                <rect x={sx(s) - colW / 2 + 2} width={colW - 4} y={sy(3.8)} height={sy(-3.8) - sy(3.8)} fill="rgba(148,163,184,.12)" stroke="#475569" strokeDasharray="2 2" />
              )}
            </g>
          ))}

          {/* sources */}
          {pz.kind === 'galileo' && <>
            {pz.beam!.map(h => <text key={h} x={sx(-0.3)} y={sy(h) + 3} fontSize={9} fill={WHITE} textAnchor="middle">★</text>)}
            <rect x={sx(pz.endX) - 2} y={sy(pz.pupil!)} width={6} height={sy(-pz.pupil!) - sy(pz.pupil!)} fill="rgba(74,222,128,.25)" stroke="#4ade80" />
            <text x={sx(pz.endX) + 1} y={sy(3.7)} fontSize={11} textAnchor="middle">👁</text>
          </>}
          {pz.kind === 'newton' && <>
            <rect x={sx(-0.4) - 3} y={sy(pz.y0!) - 4} width={6} height={8} fill={WHITE} />
            <line x1={sx(pz.endX) + 2} x2={sx(pz.endX) + 2} y1={sy(3.9)} y2={sy(-3.9)} stroke="#e2e8f0" strokeWidth={3} />
            {pz.slit && <>
              <line x1={sx(pz.slit.x)} x2={sx(pz.slit.x)} y1={sy(3.9)} y2={sy(pz.slit.y + pz.slit.w + 0.05)} stroke="#94a3b8" strokeWidth={3} />
              <line x1={sx(pz.slit.x)} x2={sx(pz.slit.x)} y1={sy(pz.slit.y - pz.slit.w - 0.05)} y2={sy(-3.9)} stroke="#94a3b8" strokeWidth={3} />
            </>}
          </>}
          {pz.kind === 'alhazen' && <>
            {pz.points!.map((pt, i) => pt.flame
              ? <g key={i}><circle cx={sx(pt.x)} cy={sy(pt.y)} r={3.5} fill="#fbbf24" /><line x1={sx(pt.x)} x2={sx(pt.x)} y1={sy(pt.y) + 3} y2={sy(pz.points!.find(q => q.x === pt.x && !q.flame)?.y ?? pt.y - 1)} stroke="#f5f5f4" strokeWidth={4} /></g>
              : <circle key={i} cx={sx(pt.x)} cy={sy(pt.y)} r={2.5} fill="#b07a45" />)}
            <line x1={sx(pz.endX) + 2} x2={sx(pz.endX) + 2} y1={sy(3.9)} y2={sy(-3.9)} stroke="#e7e5e4" strokeWidth={3} />
            {wallSlot !== undefined && <line x1={sx(wallSlot)} x2={sx(wallSlot)} y1={sy(3.9)} y2={sy(-3.9)} stroke="#57534e" strokeWidth={4} />}
          </>}
          {pz.kind === 'fresnel' && <>
            {Array.from({ length: (pz.zones ?? 0) + 1 }, (_, k) => k).map(k => [1, -1].map(sg => (
              <rect key={`${k}${sg}`} x={sx(pz.frame!) - 6} width={12} y={sg > 0 ? sy(k + 1) : sy(-k)} height={sy(0) - sy(1)}
                fill="none" stroke="#475569" strokeDasharray="2 2" />
            )))}
            {Array.from({ length: pz.zones ?? 0 }, (_, k) => <text key={k} x={sx(pz.frame!) + 9} y={sy(k + 1.5) + 3} fontSize={7} fill="#94a3b8">h={k + 1.5}</text>)}
            <text x={sx(pz.frame!) + 9} y={sy(0.5) + 3} fontSize={7} fill="#94a3b8">lens</text>
            {pz.lampX !== null && pz.lampX !== undefined && <circle cx={sx(pz.lampX)} cy={sy(0)} r={7} fill="#fde047" />}
            <text x={sx(pz.endX)} y={sy(-3.6)} fontSize={11} textAnchor="middle">⛵</text>
          </>}

          {/* marks */}
          {pz.marks.map(m => (
            <rect key={m.key} data-mark={m.key} x={sx(pz.endX) - 1} y={sy(m.y + pz.tol)} width={6} height={sy(m.y - pz.tol) - sy(m.y + pz.tol)} fill={m.colour} opacity={0.85} />
          ))}

          {/* rays */}
          {previewRays.map(r => <polyline key={`pv${r.key}`} points={r.pts.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')} fill="none" stroke={r.colour} strokeOpacity={0.3} strokeDasharray="2 3" strokeWidth={1} />)}
          {rays.map(r => (
            <g key={r.key}>
              <polyline points={r.pts.map(([x, y]) => `${sx(x)},${sy(Math.max(-5, Math.min(5, y)))}`).join(' ')} fill="none" stroke={r.colour} strokeOpacity={0.9} strokeWidth={1.3} />
              {!r.alive && <circle cx={sx(r.pts[r.pts.length - 1][0])} cy={sy(r.pts[r.pts.length - 1][1])} r={1.8} fill="#ef4444" />}
            </g>
          ))}

          {pz.tray.map(renderPiece)}
          {cells}
        </svg>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {pz.tray.map(p => {
          const on = !!pl[p.id]
          return (
            <button key={p.id} type="button" data-tray={p.id} disabled={settled} onClick={() => setSel(s => (s === p.id ? null : p.id))}
              className={`h-9 px-2 rounded-lg border text-[11px] font-bold text-left truncate transition-colors
                ${sel === p.id ? 'bg-accent text-accent-fg border-accent' : on ? 'bg-panel border-line text-muted' : 'bg-paper border-line text-ink-2 hover:border-accent/50'}`}>
              {ICON[p.kind]} {pieceLabel(p)}{on ? ` · slot ${pl[p.id].slot}` : ''}
            </button>
          )
        })}
      </div>

      {!settled && (
        <div className="flex gap-1.5">
          {selPiece?.kind === 'prism' && pl[selPiece.id] && (
            <button type="button" data-action="flip" onClick={flip} className="h-9 px-3 rounded-lg border border-line bg-panel text-xs font-bold text-ink-2">↕ Flip</button>
          )}
          {sel && pl[sel] && (
            <button type="button" data-action="remove" onClick={remove} className="h-9 px-3 rounded-lg border border-line bg-panel text-xs font-bold text-ink-2">✕ Remove</button>
          )}
          <button type="button" data-action="light" onClick={light}
            className="flex-1 h-9 rounded-lg bg-accent text-accent-fg text-xs font-bold">✺ Light the lamp ({left})</button>
        </div>
      )}
      {!settled && <p className="text-muted text-[10px] -mt-1">{sel ? 'Tap a highlighted spot on the bench to place it.' : 'Tap a piece, then a spot on the bench.'}</p>}
      {last && !last.ok && !settled && <p className="text-red-600 text-[11px] font-bold">{last.why}</p>}

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The light is true!" loseTitle={reason ?? 'The light went astray'} />
    </div>
  )
}
