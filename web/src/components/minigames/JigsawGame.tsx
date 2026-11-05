import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { artworkUrl } from '@/data/images'
import { OutcomeBanner, TimerBar, useGameOutcome, useGameTimer } from './_shared'
import {
  BOARD_H, BOARD_W, GAP, TABLE_H, TABLE_SCALE, TIERS, fits, homeOf, makePuzzle, onTable, piecePath, tabReach,
  type PieceState,
} from './jigsaw/model'

// Jigsaw: a real painting cut into interlocking pieces.  Drag each piece from
// the table onto the board; it snaps in only at its own place and the right
// way up (at the top tier pieces lie turned: tap one to turn it).

interface JigsawConfig {
  title: string
  artist: string
  era: string
  /** The picture, from web/public/paintings (data/images/paintings). */
  image: string
  fact: string
}

export const CONFIGS: Record<string, JigsawConfig> = {
  'venetian-master': {
    title: 'Assumption of the Virgin', artist: 'Titian', era: 'Venice, 1518',
    image: 'titian_assumption_of_the_virgin',
    fact: 'Titian\'s Assumption (1518) in the Frari Basilica, Venice, was revolutionary — ten metres of soaring colour and movement that broke every convention of Renaissance altarpiece painting.',
  },
  'mani-picture-book': {
    title: 'The Picture Book', artist: 'Mani', era: 'Persia, 3rd century CE',
    image: 'mani_light_and_darkness',
    fact: 'Mani set out his teaching in pictures as well as words: his Picture Book, the Ardahang, showed the war of Light and Darkness for those who could not read, and Persian tradition remembered him as "Mani the Painter". Fragments of Manichaean book painting survive from Kocho near Turfan.',
  },
  'starry-night': {
    title: 'The Starry Night', artist: 'Vincent van Gogh', era: 'Saint-Rémy, 1889',
    image: 'van_gogh_the_starry_night',
    fact: 'Van Gogh painted The Starry Night in June 1889 while at the Saint-Paul-de-Mausole asylum. The swirling sky reflects turbulent emotion; the calm village below, perhaps peace.',
  },
  'mona-lisa': {
    title: 'Mona Lisa', artist: 'Leonardo da Vinci', era: 'Florence, 1503–1519',
    image: 'leonardo_mona_lisa',
    fact: 'The Mona Lisa\'s blurred background uses "sfumato" — a hazy layering technique da Vinci perfected, dissolving edges into smoke. X-ray scans reveal three different earlier compositions beneath the final paint.',
  },
  'girl-pearl': {
    title: 'Girl with a Pearl Earring', artist: 'Johannes Vermeer', era: 'Delft, c. 1665',
    image: 'vermeer_girl_with_a_pearl_earring',
    fact: '"Girl with a Pearl Earring" (c. 1665) is called the "Mona Lisa of the North." The sitter\'s identity is unknown; the earring may be glass, not pearl — and its latch is missing in the painting.',
  },
  'last-supper': {
    title: 'The Last Supper', artist: 'Leonardo da Vinci', era: 'Milan, 1495–1498',
    image: 'leonardo_the_last_supper',
    fact: 'Da Vinci painted The Last Supper on a dining-room wall in Milan (1495–98), depicting the moment Christ announces a betrayal. He used tempera on plaster instead of true fresco — causing it to deteriorate within decades.',
  },
  'tiffany-window': {
    title: "Breakfast at Tiffany's", artist: 'Blake Edwards, with Audrey Hepburn', era: 'Fifth Avenue, New York, 1961',
    image: 'tiffany_fifth_avenue_dawn',
    fact: "Breakfast at Tiffany's (1961) opens at dawn on an empty Fifth Avenue: Holly Golightly steps out of a cab in a black Givenchy gown and pearls and eats a pastry from a paper bag while gazing into Tiffany's windows, as 'Moon River' plays.",
  },
  'jedburgh-unconformity': {
    title: 'The Unconformity at Jedburgh', artist: 'John Clerk of Eldin, for James Hutton', era: 'Jed Water, Scotland, 1787',
    image: 'hutton_jedburgh_unconformity',
    fact: 'In 1787 Hutton found an unconformity on the Jed Water near Jedburgh: flat red sandstone lying across upright layers of older greywacke. His friend John Clerk of Eldin drew it, and the engraving appeared in the first volume of Hutton’s Theory of the Earth (1795).',
  },
  'great-wave': {
    title: 'The Great Wave off Kanagawa', artist: 'Katsushika Hokusai', era: 'Edo, c. 1831',
    image: 'hokusai_the_great_wave_off_kanagawa',
    fact: 'The Great Wave is a woodblock print, so thousands of copies were pulled from Hokusai\'s blocks. Its deep sea blue is Prussian blue, a pigment imported from Europe that was new and fashionable in Japan at the time.',
  },
  'creation-of-adam': {
    title: 'The Creation of Adam', artist: 'Michelangelo', era: 'Sistine Chapel, Rome, 1508–1512',
    image: 'michelangelo_the_creation_of_adam',
    fact: 'Michelangelo painted the Sistine Chapel ceiling between 1508 and 1512, standing on a scaffold of his own design rather than lying on his back, and complained in a poem of the paint dripping onto his face.',
  },
  'school-of-athens': {
    title: 'The School of Athens', artist: 'Raphael', era: 'Vatican, 1509–1511',
    image: 'raphael_the_school_of_athens',
    fact: 'Raphael is thought to have given Plato the face of Leonardo da Vinci, and he painted himself among the crowd at the right edge, one of the few figures looking straight out of the picture.',
  },
  'birth-of-venus': {
    title: 'The Birth of Venus', artist: 'Sandro Botticelli', era: 'Florence, c. 1485',
    image: 'botticelli_the_birth_of_venus',
    fact: 'Botticelli painted The Birth of Venus on canvas, still unusual in 1480s Florence, where large pictures were painted on wooden panels. It has hung in the Uffizi since 1815.',
  },
  'qingming-scroll': {
    title: 'Along the River During the Qingming Festival', artist: 'Zhang Zeduan', era: 'Kaifeng, early 12th century',
    image: 'zhang_zeduan_along_the_river_qingming',
    fact: 'The Qingming scroll is more than five metres long and shows over 800 people, boats, shops and a crowded arched bridge. A handscroll is unrolled a little at a time, so it is read like a journey along the river.',
  },
  'wisteria-window': {
    title: 'Wisteria Window', artist: 'In the style of Louis Comfort Tiffany', era: 'New York, c. 1905',
    image: 'tiffany_wisteria_window',
    fact: 'Louis Comfort Tiffany patented "favrile" glass in 1894: colour was swirled through the molten glass itself rather than painted on, so his windows needed almost no paint, only lead lines between the pieces.',
  },
  'palace-garden': {
    title: 'Palace Garden in Perspective', artist: 'Nian Xiyao', era: 'Beijing, Qing dynasty',
    image: 'nian_xiyao_palace_garden_perspective',
    fact: 'Nian Xiyao learned Western linear perspective from the Jesuit painter Giuseppe Castiglione and published Shixue (1729, revised 1735), the first book in Chinese on the vanishing point.',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

export const tierFor = (difficulty: Difficulty) => TIERS[difficulty]

const VIEW_H = BOARD_H + GAP + TABLE_H

export default function JigsawGame({ configId, difficulty, seed, onWin, onLose }: MinigameProps) {
  const config = CONFIGS[configId] ?? CONFIGS['venetian-master']
  const src = artworkUrl('paintings', config.image)
  const puzzle = useMemo(() => makePuzzle(difficulty, seed), [difficulty, seed])
  const tier = puzzle.tier
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [pieces, setPieces] = useState<PieceState[]>(puzzle.pieces)
  // Drawing order: the last piece touched lies on top.
  const [order, setOrder] = useState<number[]>(() => puzzle.pieces.map(p => p.id))
  const [ready, setReady] = useState(false)
  const [peeking, setPeeking] = useState(false)
  const [peeksLeft, setPeeksLeft] = useState(tier.peeks)
  const { outcome, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 1600 })
  const timer = useGameTimer({ seconds: tier.seconds, running: ready && !outcome, onExpire: () => lose('out of time') })

  useEffect(() => {
    const img = new Image()
    img.onload = () => setReady(true)
    img.onerror = () => setReady(true)
    img.src = src
  }, [src])

  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ id: number; dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)

  // Pointer position in board units (the SVG keeps its aspect, so a plain scale).
  const toSvg = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    const k = r.width ? BOARD_W / r.width : 1
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k }
  }

  const onDown = (e: React.PointerEvent, piece: PieceState) => {
    if (outcome || piece.placed) return
    e.preventDefault()
    try { (e.target as Element).setPointerCapture?.(e.pointerId) } catch { /* the pointer is already gone */ }
    const p = toSvg(e)
    const k = onTable(puzzle, piece) ? TABLE_SCALE : 1
    const cx = piece.x + puzzle.cellW / 2, cy = piece.y + puzzle.cellH / 2
    drag.current = { id: piece.id, dx: (p.x - cx) / k + puzzle.cellW / 2, dy: (p.y - cy) / k + puzzle.cellH / 2, startX: p.x, startY: p.y, moved: false }
    setOrder(o => [...o.filter(i => i !== piece.id), piece.id])
  }

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = toSvg(e)
    if (Math.hypot(p.x - d.startX, p.y - d.startY) > 12) d.moved = true
    if (!d.moved) return
    setDragging(d.id)
    const x = Math.max(-puzzle.cellW / 2, Math.min(BOARD_W - puzzle.cellW / 2, p.x - d.dx))
    const y = Math.max(-puzzle.cellH / 2, Math.min(VIEW_H - puzzle.cellH / 2, p.y - d.dy))
    setPieces(ps => ps.map(q => (q.id === d.id ? { ...q, x, y } : q)))
  }

  const onUp = useCallback(() => {
    const d = drag.current
    drag.current = null
    setDragging(null)
    if (!d) return
    setPieces(ps => {
      const next = ps.map(q => {
        if (q.id !== d.id) return q
        // A tap turns a piece at the top tier.
        if (!d.moved) return tier.rotate ? { ...q, rot: (q.rot + 1) % 4 } : q
        if (fits(puzzle, q, q.x, q.y)) return { ...q, ...homeOf(puzzle, q), placed: true }
        return q
      })
      return next
    })
  }, [puzzle, tier.rotate])

  useEffect(() => { if (pieces.every(q => q.placed)) win() }, [pieces, win])

  const placed = pieces.filter(p => p.placed).length
  const reach = tabReach(puzzle)
  const { cellW: w, cellH: h } = puzzle
  const byId = useMemo(() => Object.fromEntries(pieces.map(p => [p.id, p])), [pieces])
  const drawOrder = [...order].sort((a, b) => Number(byId[b].placed) - Number(byId[a].placed))

  const peek = () => {
    if (peeking || peeksLeft <= 0) return
    setPeeking(true)
    setPeeksLeft(n => n - 1)
    setTimeout(() => setPeeking(false), 2500)
  }

  return (
    <div className="flex flex-col gap-2">
      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}
      <div className="flex items-end justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="text-accent font-bold text-sm truncate">{config.title}</p>
          <p className="text-muted text-[11px] truncate">{config.artist} · {config.era}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted" data-testid="jigsaw-count">{placed}/{pieces.length} placed</span>
          {tier.peeks > 0 && (
            <button onClick={peek} disabled={peeking || peeksLeft <= 0 || !!outcome}
              className="text-[11px] px-2.5 py-1 rounded-lg border border-line bg-panel text-ink-2 disabled:opacity-40">
              Peek{Number.isFinite(peeksLeft) ? ` (${peeksLeft})` : ''}
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-line overflow-hidden bg-[#3b2f22]">
        {!ready ? (
          <div className="aspect-[16/17] flex items-center justify-center text-paper/70 text-xs">Unpacking the puzzle…</div>
        ) : (
          <svg ref={svgRef} viewBox={`0 0 ${BOARD_W} ${placed === pieces.length ? BOARD_H : VIEW_H}`} className="w-full h-auto block select-none"
            style={{ touchAction: 'none' }} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <defs>
              {pieces.map(p => (
                <clipPath key={p.id} id={`${uid}-c${p.id}`}><path d={piecePath(puzzle, p.row, p.col)} /></clipPath>
              ))}
              <pattern id={`${uid}-wood`} width="80" height="80" patternUnits="userSpaceOnUse">
                <rect width="80" height="80" fill="#4a3a29" />
                <path d="M0 20 Q40 10 80 22 M0 55 Q40 48 80 60" stroke="#3f3122" strokeWidth="6" fill="none" />
              </pattern>
            </defs>

            {/* The table and the board */}
            <rect x={0} y={0} width={BOARD_W} height={VIEW_H} fill={`url(#${uid}-wood)`} />
            <rect x={0} y={0} width={BOARD_W} height={BOARD_H} fill="#efe6d2" />
            {tier.ghost > 0 && <image href={src} x={0} y={0} width={BOARD_W} height={BOARD_H} preserveAspectRatio="xMidYMid slice" opacity={tier.ghost} style={{ filter: 'grayscale(0.6)' }} />}
            {tier.grid && Array.from({ length: puzzle.cols - 1 }, (_, i) => (
              <line key={`v${i}`} x1={(i + 1) * w} y1={0} x2={(i + 1) * w} y2={BOARD_H} stroke="#00000022" strokeWidth={2} />
            ))}
            {tier.grid && Array.from({ length: puzzle.rows - 1 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={(i + 1) * h} x2={BOARD_W} y2={(i + 1) * h} stroke="#00000022" strokeWidth={2} />
            ))}
            <rect x={1} y={1} width={BOARD_W - 2} height={BOARD_H - 2} fill="none" stroke="#2a2117" strokeWidth={3} />

            {drawOrder.map(id => {
              const p = byId[id]
              const d = piecePath(puzzle, p.row, p.col)
              return (
                <g key={id} transform={`translate(${p.x + w / 2} ${p.y + h / 2}) scale(${onTable(puzzle, p) && dragging !== id ? TABLE_SCALE : 1}) rotate(${p.rot * 90}) translate(${-w / 2} ${-h / 2})`}
                  onPointerDown={e => onDown(e, p)} style={{ cursor: p.placed ? 'default' : 'grab' }}
                  data-testid={`piece-${id}`}>
                  {!p.placed && <path d={d} transform="translate(6 8)" fill="#00000055" />}
                  <image href={src} x={-p.col * w} y={-p.row * h} width={BOARD_W} height={BOARD_H}
                    preserveAspectRatio="xMidYMid slice" clipPath={`url(#${uid}-c${id})`} />
                  <path d={d} fill="none" stroke={p.placed ? '#00000026' : '#1d150c'} strokeWidth={p.placed ? 1.5 : 3} />
                  {!p.placed && <path d={d} fill="none" stroke="#ffffff40" strokeWidth={1.5} transform="translate(-1.5 -1.5)" />}
                  {/* A generous invisible hit area, as fingers are wider than tabs. */}
                  {!p.placed && <rect x={-reach / 2} y={-reach / 2} width={w + reach} height={h + reach} fill="transparent" />}
                </g>
              )
            })}

            {peeking && <image href={src} x={0} y={0} width={BOARD_W} height={BOARD_H} preserveAspectRatio="xMidYMid slice" opacity={0.92} pointerEvents="none" />}
          </svg>
        )}
      </div>

      <p className="text-[11px] text-muted text-center">
        Drag each piece onto the board; it locks in at its own place{tier.rotate ? ' once it is the right way up. Tap a piece to turn it.' : '.'}
      </p>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle={`${config.title} is whole again!`} />
    </div>
  )
}
