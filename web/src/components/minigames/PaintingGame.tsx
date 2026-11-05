import { useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { gameArtUrl, type GameArtKey } from '@/games/art'
import { mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Painting: restore a real masterpiece.  A photograph of the work is shown
// with one or more items washed out to grey (the Virgin's mantle, the
// turban, the eagle on the cactus).  Pick the pigment for each: the item is
// repainted live in that colour, keeping the painting's own light and shade,
// and committing the right one brings back the original paint.
//
// An item is found in the photo by a rough outline plus a colour rule (hue
// range, saturation and brightness bounds), so the mask follows the folds
// of the cloth rather than a drawn shape.
//
//   D1  2 items, 3 pigments to choose from (far apart), 3 misses allowed
//   D2  2 items, 4 pigments, 2 misses
//   D3  3 items, 5 pigments, closer colours, 2 misses
//   D4  3 items, 6 pigments, the closest colours, 1 miss
//
// (Paintings with fewer items use all they have.)

export interface Pigment { name: string; hex: string }

/** Historical pigments; every item's wrong options are drawn from here. */
export const PIGMENTS: Pigment[] = [
  { name: 'Ultramarine', hex: '#2b4aa0' },
  { name: 'Azurite', hex: '#3d6e9e' },
  { name: 'Indigo', hex: '#2e3a5c' },
  { name: 'Smalt', hex: '#6a6fc0' },
  { name: 'Maya blue', hex: '#5f9b9b' },
  { name: 'Verdigris', hex: '#3d8c7a' },
  { name: 'Malachite', hex: '#3f8a4f' },
  { name: 'Green earth', hex: '#7a8456' },
  { name: 'Vermilion', hex: '#d0402a' },
  { name: 'Red lake', hex: '#9a2e3a' },
  { name: 'Red ochre', hex: '#9c4f30' },
  { name: 'Cochineal', hex: '#a3214a' },
  { name: 'Tyrian purple', hex: '#6b2a5a' },
  { name: 'Lead-tin yellow', hex: '#e0c25a' },
  { name: 'Yellow ochre', hex: '#b8893c' },
  { name: 'Orpiment', hex: '#e3a82c' },
  { name: 'Gold leaf', hex: '#c9a35f' },
  { name: 'Raw umber', hex: '#6b5434' },
]

export interface PaintItem {
  id: string
  label: string
  /** The right pigment; its swatch colour approximates the paint in the photo. */
  pigment: Pigment
  /** Rough outline, as fractions of the image width and height. */
  poly: [number, number][]
  /** Hue range in degrees (wraps when lo > hi) and HSV bounds that pick the item's pixels. */
  hue: [number, number]
  minSat?: number
  minVal?: number
  maxVal?: number
  fact: string
}

interface PaintingConfig {
  title: string
  credit: string
  art: GameArtKey
  intro: string
  items: PaintItem[]
  fact: string
}

export const CONFIGS: Record<string, PaintingConfig> = {
  'titian-canvas': {
    title: 'Assumption of the Virgin',
    credit: 'Titian, 1516–18 · Frari, Venice',
    art: 'painting_titian_assumption',
    intro: 'The Virgin rises above the apostles. Restore the colours of her clothes.',
    items: [
      { id: 'mantle', label: 'The Virgin’s mantle', pigment: { name: 'Ultramarine', hex: '#2b4aa0' },
        poly: [[0.28, 0.31], [0.62, 0.31], [0.62, 0.36], [0.5, 0.42], [0.42, 0.48], [0.3, 0.48], [0.28, 0.44]], hue: [205, 265], minSat: 0.2,
        fact: 'Ultramarine was ground from lapis lazuli mined in Badakhshan, in today’s Afghanistan, and could cost more than gold. Patrons’ contracts often reserved it for the Virgin’s mantle.' },
      { id: 'dress', label: 'The Virgin’s dress', pigment: { name: 'Vermilion', hex: '#c23a28' },
        poly: [[0.3, 0.28], [0.66, 0.3], [0.62, 0.42], [0.62, 0.53], [0.38, 0.53], [0.36, 0.46], [0.3, 0.36]], hue: [340, 22], minSat: 0.5,
        fact: 'Titian built his reds from vermilion, a mercury sulphide, deepened with glazes of red lake — a dye made from insects such as kermes.' },
      { id: 'apostle', label: 'The apostle’s cloak', pigment: { name: 'Vermilion', hex: '#c23a28' },
        poly: [[0.52, 0.63], [0.82, 0.66], [0.82, 0.93], [0.55, 0.93]], hue: [355, 28], minSat: 0.5,
        fact: 'The red of the apostle below answers the Virgin’s dress above, tying the earthly and heavenly halves of the altarpiece together.' },
    ],
    fact: 'The Assumption, nearly seven metres tall, was Titian’s first great public commission. The friars of the Frari are said to have doubted its bold colour and movement until an imperial envoy offered to buy it.',
  },
  'pearl-earring': {
    title: 'Girl with a Pearl Earring',
    credit: 'Johannes Vermeer, c. 1665 · Mauritshuis, The Hague',
    art: 'painting_vermeer_pearl',
    intro: 'The girl turns towards us out of the dark. Restore her turban and jacket.',
    items: [
      { id: 'turban', label: 'The turban', pigment: { name: 'Ultramarine', hex: '#5a7aa8' },
        poly: [[0.32, 0.2], [0.6, 0.16], [0.76, 0.3], [0.78, 0.5], [0.62, 0.5], [0.5, 0.42], [0.33, 0.32]], hue: [190, 250], minSat: 0.1,
        fact: 'Vermeer used natural ultramarine lavishly, even in places other painters would use cheaper blues, although he was often in debt.' },
      { id: 'tail', label: 'The fall of the turban', pigment: { name: 'Lead-tin yellow', hex: '#d1b06a' },
        poly: [[0.5, 0.11], [0.78, 0.12], [0.98, 0.75], [0.85, 0.8], [0.75, 0.6], [0.7, 0.35], [0.6, 0.18]], hue: [25, 60], minSat: 0.2, minVal: 0.35,
        fact: 'Lead-tin yellow was a favourite of Dutch painters. It fell out of use in the 1700s and was forgotten until researchers identified it again in the 20th century.' },
      { id: 'jacket', label: 'The jacket', pigment: { name: 'Yellow ochre', hex: '#9c8549' },
        poly: [[0.3, 0.6], [0.75, 0.58], [0.85, 0.8], [0.9, 1], [0.28, 1]], hue: [20, 70], minSat: 0.25,
        fact: 'The jacket is painted in earth pigments — ochres and umbers dug from the ground — the cheapest colours on a 17th-century palette.' },
    ],
    fact: 'Girl with a Pearl Earring is a tronie, a study of a face or a character, not a portrait of a known sitter. Nobody knows who modelled for it.',
  },
  'sistine-madonna': {
    title: 'Sistine Madonna',
    credit: 'Raphael, 1512 · Gemäldegalerie Alte Meister, Dresden',
    art: 'painting_raphael_sistine',
    intro: 'The curtains open on the Madonna and Child. Restore her dress and the curtains.',
    items: [
      { id: 'dress', label: 'The Madonna’s dress', pigment: { name: 'Red lake', hex: '#a03a3e' },
        poly: [[0.44, 0.18], [0.64, 0.2], [0.64, 0.34], [0.5, 0.33], [0.45, 0.3], [0.36, 0.52], [0.58, 0.72], [0.38, 0.72]], hue: [330, 20], minSat: 0.3,
        fact: 'Red lakes were made by fixing a dye — from kermes insects, madder root or, after 1520, American cochineal — onto a chalky powder so it could be used as paint.' },
      { id: 'curtain', label: 'The curtains', pigment: { name: 'Verdigris', hex: '#4f6a2a' },
        poly: [[0, 0], [1, 0], [1, 0.62], [0.9, 0.62], [0.9, 0.25], [0.62, 0.08], [0.38, 0.08], [0.1, 0.25], [0.04, 0.4], [0, 0.4]], hue: [50, 150], minSat: 0.15, minVal: 0.03,
        fact: 'Renaissance greens were often glazes of copper green (verdigris), made by hanging copper plates over vinegar. Copper greens darken and brown with age, which is why so many old curtains and landscapes look olive today.' },
    ],
    fact: 'The two bored cherubs at the bottom of the Sistine Madonna have become far more famous than the painting itself, printed on everything from stamps to umbrellas.',
  },
  'birth-of-venus': {
    title: 'The Birth of Venus',
    credit: 'Sandro Botticelli, c. 1485 · Uffizi, Florence',
    art: 'painting_botticelli_venus',
    intro: 'Venus comes ashore on her shell. Restore the cloak held out to her, and her hair.',
    items: [
      { id: 'cloak', label: 'The flowered cloak', pigment: { name: 'Rose (red lake and white)', hex: '#c27a6a' },
        poly: [[0.6, 0.12], [0.8, 0.12], [0.98, 0.5], [0.98, 0.72], [0.74, 0.8], [0.66, 0.5], [0.62, 0.3]], hue: [330, 25], minSat: 0.22,
        fact: 'Botticelli painted the Birth of Venus in tempera, pigment bound with egg, on canvas, which was still unusual in Florence in the 1480s.' },
      { id: 'hair', label: 'Venus’s hair', pigment: { name: 'Gold and ochre', hex: '#b8742a' },
        poly: [[0.48, 0.06], [0.62, 0.06], [0.62, 0.62], [0.5, 0.62], [0.48, 0.3]], hue: [12, 38], minSat: 0.62,
        fact: 'Venus’s hair is touched with real gold, which still catches the light in the Uffizi.' },
    ],
    fact: 'The Birth of Venus shows Zephyr, the west wind, blowing Venus ashore while a Hora of spring waits with a cloak. A life-size pagan goddess was a bold subject for Florence in the 1480s.',
  },
  'mexica-codex': {
    title: 'The Founding of Tenochtitlan',
    credit: 'Codex Mendoza, folio 2r, c. 1541 · Bodleian Library, Oxford',
    art: 'painting_codex_mendoza_2r',
    intro: 'Mexica painters drew the founding of their city: the eagle on the cactus in the lake. Restore the page.',
    items: [
      { id: 'water', label: 'The lake and its canals', pigment: { name: 'Maya blue', hex: '#5f9b9b' },
        poly: [[0.13, 0.09], [0.85, 0.09], [0.85, 0.68], [0.13, 0.68]], hue: [150, 210], minSat: 0.15,
        fact: 'The blue-green of Mesoamerican painting was often Maya blue, indigo dye locked into a clay. It is so stable that it has survived centuries of tropical damp.' },
      { id: 'eagle', label: 'The eagle', pigment: { name: 'Raw umber', hex: '#6b4a35' },
        poly: [[0.35, 0.23], [0.58, 0.23], [0.58, 0.37], [0.35, 0.37]], hue: [0, 45], minSat: 0.25, maxVal: 0.8,
        fact: 'By Mexica tradition, the god Huitzilopochtli told his people to settle where they saw an eagle perched on a cactus. The emblem is on Mexico’s flag today.' },
      { id: 'cactus', label: 'The cactus', pigment: { name: 'Green earth', hex: '#5c7350' },
        poly: [[0.4, 0.33], [0.56, 0.33], [0.56, 0.45], [0.4, 0.45]], hue: [60, 180], minSat: 0.1, minVal: 0.05,
        fact: 'The city’s name comes from tenochtli, the prickly-pear cactus growing from a rock: Tenochtitlan, “place of the cactus on the rock”.' },
    ],
    fact: 'The Codex Mendoza was painted by Mexica scribes around 1541 for the Spanish viceroy, to be sent to Charles V. French pirates captured the ship, and the book ended up in Oxford.',
  },
  'wind-thunder': {
    title: 'Wind God and Thunder God',
    credit: 'Tawaraya Sōtatsu, 17th century · Kennin-ji, Kyoto',
    art: 'painting_sotatsu_wind_thunder',
    intro: 'Raijin beats his drums on the left screen; Fūjin opens his bag of winds on the right. Restore the wind god and the gold.',
    items: [
      { id: 'fujin', label: 'Fūjin, the wind god', pigment: { name: 'Malachite', hex: '#6b6233' },
        poly: [[0.77, 0.2], [0.95, 0.2], [0.97, 0.45], [0.9, 0.62], [0.78, 0.62], [0.75, 0.45]], hue: [15, 55], minSat: 0.35, maxVal: 0.5, minVal: 0.22,
        fact: 'Sōtatsu painted Fūjin green and Raijin white. The green is a copper pigment, which has darkened towards olive over four centuries.' },
      { id: 'gold', label: 'The gold ground', pigment: { name: 'Gold leaf', hex: '#c9a35f' },
        poly: [[0.02, 0.05], [0.49, 0.05], [0.49, 0.95], [0.02, 0.95]], hue: [30, 60], minSat: 0.3, minVal: 0.45,
        fact: 'The ground is gold leaf, squares of beaten gold laid edge to edge. Their seams make the faint grid you can see across the screens.' },
    ],
    fact: 'Sōtatsu worked in Kyoto in the same decades that Musashi wandered Japan. His gods leave almost the whole of each screen empty gold, a boldness later painters copied for generations.',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Rules ──────────────────────────────────────────────────────────────────────

export interface Tier { items: number; options: number; misses: number }

export function tierFor(d: Difficulty): Tier {
  return { items: scale(d, [2, 2, 3, 3]), options: scale(d, [3, 4, 5, 6]), misses: scale(d, [3, 2, 2, 1]) }
}

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const colourDistance = (a: string, b: string) => {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b)
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2)
}

/** Wrong pigments too close to the right one would be unfair to tell apart. */
export const MIN_DISTANCE = 45

/**
 * The pigments offered for an item: the right one plus wrong ones, far from
 * it at D1 and closest at D4, shuffled by the seed.
 */
export function optionsFor(item: PaintItem, d: Difficulty, seed: number): Pigment[] {
  const n = tierFor(d).options - 1
  const pool = PIGMENTS
    .filter(p => p.name !== item.pigment.name && colourDistance(p.hex, item.pigment.hex) >= MIN_DISTANCE)
    .sort((a, b) => colourDistance(a.hex, item.pigment.hex) - colourDistance(b.hex, item.pigment.hex))
  // D3–D4 take the nearest; D1–D2 skip past the nearest third of the pool.
  const start = d >= 3 ? 0 : Math.floor(pool.length / 3)
  const wrong = pool.slice(start, start + n)
  const out = [item.pigment, ...wrong]
  const rng = mulberry32(seed)
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}

export const itemsFor = (cfg: PaintingConfig, d: Difficulty) => cfg.items.slice(0, Math.min(cfg.items.length, tierFor(d).items))

// ── Masks and recolouring (canvas) ─────────────────────────────────────────────

function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  let h = 0
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx / 255]
}

function inPoly(x: number, y: number, poly: [number, number][]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const hueIn = (h: number, [lo, hi]: [number, number]) => (lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi)

/** Pixel indices of the item in the image. */
export function itemMask(px: Uint8ClampedArray, w: number, h: number, item: PaintItem): Uint32Array {
  const out: number[] = []
  const xs = item.poly.map(p => p[0]), ys = item.poly.map(p => p[1])
  const x0 = Math.max(0, Math.floor(Math.min(...xs) * w)), x1 = Math.min(w, Math.ceil(Math.max(...xs) * w))
  const y0 = Math.max(0, Math.floor(Math.min(...ys) * h)), y1 = Math.min(h, Math.ceil(Math.max(...ys) * h))
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (!inPoly(x / w, y / h, item.poly)) continue
    const o = (y * w + x) * 4
    const [hu, s, v] = hsv(px[o], px[o + 1], px[o + 2])
    if (!hueIn(hu, item.hue) || s < (item.minSat ?? 0.25) || v < (item.minVal ?? 0.08) || v > (item.maxVal ?? 1)) continue
    out.push(y * w + x)
  }
  return Uint32Array.from(out)
}

function hslOf(hex: string): [number, number] {
  const [r, g, b] = rgb(hex).map(v => v / 255)
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
  if (!d) return [0, 0]
  const s = d / (1 - Math.abs(2 * l - 1))
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = (h * 60 + 360) % 360
  return [h, s]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

/** Paint `mask` of `src` into `dst`: grey when `hex` is null, else that hue and saturation at the pixel's own lightness. */
function paintMask(src: Uint8ClampedArray, dst: Uint8ClampedArray, mask: Uint32Array, hex: string | null) {
  const [h, s] = hex ? hslOf(hex) : [0, 0]
  for (let k = 0; k < mask.length; k++) {
    const o = mask[k] * 4
    const r = src[o], g = src[o + 1], b = src[o + 2]
    if (!hex) {
      const y = 0.3 * r + 0.59 * g + 0.11 * b
      dst[o] = dst[o + 1] = dst[o + 2] = y
      continue
    }
    const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 510
    const [nr, ng, nb] = hslToRgb(h, s, l)
    dst[o] = nr; dst[o + 1] = ng; dst[o + 2] = nb
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PaintingGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'titian-canvas')
  const tier = tierFor(difficulty)
  const items = useMemo(() => itemsFor(cfg, difficulty), [cfg, difficulty])
  const options = useMemo(() => items.map((it, i) => optionsFor(it, difficulty, seed + i * 101)), [items, difficulty, seed])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const [active, setActive] = useState(0)
  const [restored, setRestored] = useState<boolean[]>(() => items.map(() => false))
  const [preview, setPreview] = useState<Pigment | null>(null)
  const [missesLeft, setMissesLeft] = useState(tier.misses)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  // Pixels: the original photo and one mask per item, built once the image loads.
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glowRef = useRef<HTMLCanvasElement>(null)
  const pixels = useRef<{ w: number; h: number; src: Uint8ClampedArray; masks: Uint32Array[] } | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight
      const off = document.createElement('canvas')
      off.width = w; off.height = h
      const ctx = off.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(img, 0, 0)
      const src = ctx.getImageData(0, 0, w, h).data
      pixels.current = { w, h, src, masks: items.map(it => itemMask(src, w, h, it)) }
      setLoaded(true)
    }
    img.src = gameArtUrl(cfg.art)
    return () => { img.onload = null }
  }, [cfg.art, items])

  // Redraw: restored items in their original paint, the others grey, the active one in the previewed pigment.
  useEffect(() => {
    const p = pixels.current, canvas = canvasRef.current, glow = glowRef.current
    if (!loaded || !p || !canvas || !glow) return
    canvas.width = glow.width = p.w
    canvas.height = glow.height = p.h
    const ctx = canvas.getContext('2d'), gctx = glow.getContext('2d')
    if (!ctx || !gctx) return
    const out = new ImageData(new Uint8ClampedArray(p.src), p.w, p.h)
    items.forEach((_, i) => {
      if (restored[i]) return
      paintMask(p.src, out.data, p.masks[i], i === active && preview ? preview.hex : null)
    })
    ctx.putImageData(out, 0, 0)
    // A soft highlight over the item being restored.
    const g = gctx.createImageData(p.w, p.h)
    if (!settled && !restored[active]) for (const k of p.masks[active]) { g.data[k * 4] = g.data[k * 4 + 1] = 255; g.data[k * 4 + 2] = 220; g.data[k * 4 + 3] = 110 }
    gctx.putImageData(g, 0, 0)
  }, [loaded, items, restored, active, preview, settled])

  const item = items[active]
  const done = restored.every(Boolean)

  const commit = () => {
    if (settled || !preview || restored[active]) return
    if (preview.name === item.pigment.name) {
      const next = restored.map((r, i) => r || i === active)
      setRestored(next)
      setPreview(null)
      setNote({ ok: true, text: item.fact })
      if (next.every(Boolean)) { win(); return }
      setActive(next.findIndex(r => !r))
      return
    }
    setNote({ ok: false, text: `Not ${preview.name} — look at the light and shade around it again.` })
    setPreview(null)
    if (missesLeft <= 1) { setMissesLeft(0); lose('the restoration went wrong'); return }
    setMissesLeft(m => m - 1)
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted/80 text-[10px] italic">{cfg.credit}</p>
          <p className="text-muted text-xs leading-relaxed mt-1">{cfg.intro}</p>
        </div>
        <p className="shrink-0 text-[10px] text-muted text-right leading-relaxed">
          Item <b className="text-ink">{Math.min(active + 1, items.length)}</b>/{items.length}<br />
          Misses left <b className={missesLeft <= 1 ? 'text-red-700' : 'text-ink'}>{missesLeft}</b>
        </p>
      </div>

      <div className="relative self-center w-full max-w-md rounded-lg overflow-hidden border border-line bg-ink/80"
        style={{ minHeight: loaded ? undefined : 200 }}>
        <canvas ref={canvasRef} className={`block w-full h-auto max-h-[55vh] object-contain ${loaded ? '' : 'hidden'}`} aria-label={cfg.title} />
        <canvas ref={glowRef} className={`pointer-events-none absolute inset-0 w-full h-full object-contain animate-pulse ${loaded ? '' : 'hidden'}`} />
        {!loaded && <p className="absolute inset-0 flex items-center justify-center text-paper/70 text-xs">Unrolling the canvas…</p>}
      </div>

      {!done && !settled && (
        <>
          <p className="text-center text-sm text-ink">
            Restore <b>{item.label}</b>
            {preview && <span className="text-muted"> · trying {preview.name}</span>}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {options[active].map(p => (
              <button key={p.name} onClick={() => { setPreview(p); setNote(null) }} aria-label={p.name}
                className={`flex flex-col items-center gap-1 w-[4.5rem] p-1.5 rounded-lg border transition-all active:scale-95
                  ${preview?.name === p.name ? 'border-accent bg-panel shadow' : 'border-line bg-panel-2 hover:border-accent/50'}`}>
                <span className="w-8 h-8 rounded-full border border-ink/20 shadow-inner" style={{ background: p.hex }} />
                <span className="text-[9px] leading-tight text-ink-2 text-center">{p.name}</span>
              </button>
            ))}
          </div>
          <button onClick={commit} disabled={!preview}
            className="self-center px-5 py-2 rounded-xl text-sm font-bold bg-accent text-accent-fg disabled:opacity-40 transition-opacity">
            {preview ? `Restore with ${preview.name}` : 'Tap a pigment to try it'}
          </button>
        </>
      )}

      {note && !settled && (
        <p className={`text-[11px] text-center leading-relaxed ${note.ok ? 'text-emerald-800' : 'text-red-800'}`}>{note.text}</p>
      )}

      <OutcomeBanner outcome={outcome} detail={done ? `${item.fact} ${cfg.fact}` : cfg.fact} winTitle="Restored!" loseTitle="The restoration went wrong" />
    </div>
  )
}
