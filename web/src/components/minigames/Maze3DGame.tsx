import { useState, useEffect, useRef, useCallback } from 'react'

interface Maze3DConfig {
  title: string
  subtitle: string
  grid: string[]  // '#' = wall, '.' = floor, 'S' = start, 'E' = exit
}

const CONFIGS: Record<string, Maze3DConfig> = {
  'pacific-voyage': {
    title: 'Pacific Passage',
    subtitle: 'Navigate the fog-shrouded straits that Magellan first crossed',
    grid: [
      '#########',
      '#S......#',
      '#.###.#.#',
      '#.#...#.#',
      '#.#.###.#',
      '#...#...#',
      '#.###.###',
      '#.....#E#',
      '#########',
    ],
  },
  'himalayan-climb': {
    title: 'Summit Push',
    subtitle: 'Find the route Hillary and Tenzing took through the icefall',
    grid: [
      '###########',
      '#S.#.....##',
      '#.##.###.##',
      '#....#...##',
      '###.##.#.##',
      '#...#..####',
      '#.####.#..#',
      '#......##E#',
      '###########',
    ],
  },
  'flight-path': {
    title: 'Atlantic Crossing',
    subtitle: 'Chart Amelia Earhart\'s course through the storm corridors',
    grid: [
      '#########',
      '#S.....##',
      '#.#.###.#',
      '#.#.#...#',
      '#...#.#.#',
      '#####.#.#',
      '#.....###',
      '#.##.#E.#',
      '#########',
    ],
  },
}

const CELL = 1.0
const HALF = CELL / 2
const FOV = Math.PI / 2.5
const COLS = 280
const ROWS = 160
const MAX_DEPTH = 12

function castRay(grid: string[], px: number, py: number, angle: number): number {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  for (let d = 0; d < MAX_DEPTH; d += 0.02) {
    const tx = Math.floor(px + dx * d)
    const ty = Math.floor(py + dy * d)
    if (ty < 0 || ty >= grid.length || tx < 0 || tx >= (grid[0]?.length ?? 0)) return d
    if (grid[ty][tx] === '#') return d
  }
  return MAX_DEPTH
}

function renderFrame(
  ctx: CanvasRenderingContext2D,
  grid: string[],
  px: number, py: number, angle: number,
  exitX: number, exitY: number
) {
  const W = COLS, H = ROWS

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H / 2)
  sky.addColorStop(0, '#0f172a')
  sky.addColorStop(1, '#1e3a5f')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H / 2)

  // Floor
  ctx.fillStyle = '#1c1917'
  ctx.fillRect(0, H / 2, W, H / 2)

  // Cast rays
  for (let col = 0; col < W; col++) {
    const rayAngle = angle - FOV / 2 + (col / W) * FOV
    const dist = castRay(grid, px, py, rayAngle) * Math.cos(rayAngle - angle)
    const wallH = Math.min(H, (CELL / dist) * (H * 0.7))
    const top = (H - wallH) / 2

    // Shade walls by distance
    const shade = Math.max(0, 1 - dist / MAX_DEPTH)
    const r = Math.floor(shade * 100 + 20)
    const g = Math.floor(shade * 80 + 15)
    const b = Math.floor(shade * 60 + 10)
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(col, top, 1, wallH)
  }

  // Exit beacon: project exit position to screen
  const dx = exitX + HALF - px
  const dy = exitY + HALF - py
  const exitDist = Math.sqrt(dx * dx + dy * dy)
  if (exitDist < MAX_DEPTH) {
    let exitAngle = Math.atan2(dy, dx)
    let relAngle = exitAngle - angle
    while (relAngle > Math.PI) relAngle -= 2 * Math.PI
    while (relAngle < -Math.PI) relAngle += 2 * Math.PI
    if (Math.abs(relAngle) < FOV / 2) {
      const screenX = ((relAngle + FOV / 2) / FOV) * W
      const beaconH = Math.min(H * 0.3, (CELL / exitDist) * (H * 0.5))
      const beaconTop = H / 2 - beaconH / 2
      const grad = ctx.createRadialGradient(screenX, beaconTop + beaconH / 2, 0, screenX, beaconTop + beaconH / 2, beaconH / 2)
      grad.addColorStop(0, 'rgba(251,191,36,0.9)')
      grad.addColorStop(1, 'rgba(251,191,36,0)')
      ctx.fillStyle = grad
      ctx.fillRect(screenX - beaconH / 2, beaconTop, beaconH, beaconH)
    }
  }

  // Minimap (top-right)
  const MAP_SCALE = 6
  const mw = (grid[0]?.length ?? 0) * MAP_SCALE
  const mh = grid.length * MAP_SCALE
  const mx = W - mw - 4, my = 4
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(mx, my, mw, mh)
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < (grid[0]?.length ?? 0); col++) {
      const ch = grid[row][col]
      if (ch === '#') ctx.fillStyle = '#475569'
      else if (ch === 'E') ctx.fillStyle = '#f59e0b'
      else ctx.fillStyle = '#1e293b'
      ctx.fillRect(mx + col * MAP_SCALE, my + row * MAP_SCALE, MAP_SCALE, MAP_SCALE)
    }
  }
  // Player dot on minimap
  ctx.fillStyle = '#38bdf8'
  ctx.beginPath()
  ctx.arc(mx + px * MAP_SCALE, my + py * MAP_SCALE, 2, 0, Math.PI * 2)
  ctx.fill()
  // Direction line
  ctx.strokeStyle = '#38bdf8'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(mx + px * MAP_SCALE, my + py * MAP_SCALE)
  ctx.lineTo(mx + (px + Math.cos(angle) * 1.5) * MAP_SCALE, my + (py + Math.sin(angle) * 1.5) * MAP_SCALE)
  ctx.stroke()
}

function findChar(grid: string[], ch: string): [number, number] {
  for (let r = 0; r < grid.length; r++) {
    const c = grid[r].indexOf(ch)
    if (c !== -1) return [c + HALF, r + HALF]
  }
  return [1.5, 1.5]
}

function isWall(grid: string[], x: number, y: number): boolean {
  const tx = Math.floor(x), ty = Math.floor(y)
  if (ty < 0 || ty >= grid.length || tx < 0 || tx >= (grid[0]?.length ?? 0)) return true
  return grid[ty][tx] === '#'
}

const MOVE_SPEED = 0.07
const TURN_SPEED = 0.06

export default function Maze3DGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId] ?? CONFIGS['pacific-voyage']
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const [startX, startY] = findChar(config.grid, 'S')
  const [exitX, exitY] = findChar(config.grid, 'E')

  const stateRef = useRef({ px: startX, py: startY, angle: Math.PI / 4 })
  const keysRef = useRef<Set<string>>(new Set())
  const [won, setWon] = useState(false)
  const wonRef = useRef(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { px, py, angle } = stateRef.current
    renderFrame(ctx, config.grid, px, py, angle, Math.floor(exitX), Math.floor(exitY))
  }, [config.grid, exitX, exitY])

  useEffect(() => {
    wonRef.current = false
    stateRef.current = { px: startX, py: startY, angle: Math.PI / 4 }
    draw()
  }, [configId, startX, startY, draw])

  useEffect(() => {
    const loop = () => {
      if (wonRef.current) return
      const keys = keysRef.current
      const s = stateRef.current

      if (keys.has('left'))  s.angle -= TURN_SPEED
      if (keys.has('right')) s.angle += TURN_SPEED

      if (keys.has('up') || keys.has('forward')) {
        const nx = s.px + Math.cos(s.angle) * MOVE_SPEED
        const ny = s.py + Math.sin(s.angle) * MOVE_SPEED
        if (!isWall(config.grid, nx, s.py)) s.px = nx
        if (!isWall(config.grid, s.px, ny)) s.py = ny
      }
      if (keys.has('back')) {
        const nx = s.px - Math.cos(s.angle) * MOVE_SPEED
        const ny = s.py - Math.sin(s.angle) * MOVE_SPEED
        if (!isWall(config.grid, nx, s.py)) s.px = nx
        if (!isWall(config.grid, s.px, ny)) s.py = ny
      }

      // Check exit
      const dex = s.px - exitX, dey = s.py - exitY
      if (Math.sqrt(dex * dex + dey * dey) < 0.6) {
        wonRef.current = true
        setWon(true)
        setTimeout(onWin, 800)
      }

      draw()
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [config.grid, exitX, exitY, draw, onWin])

  const pressKey = (k: string) => keysRef.current.add(k)
  const releaseKey = (k: string) => keysRef.current.delete(k)

  const btnClass = "w-14 h-14 rounded-xl bg-slate-800 border border-white/10 text-white text-xl flex items-center justify-center select-none active:bg-slate-700 touch-none"

  return (
    <div className="flex flex-col gap-3 bg-slate-950 rounded-xl p-3">
      <p className="text-amber-400/80 text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
      <p className="text-slate-400 text-xs">{config.subtitle}</p>

      <canvas
        ref={canvasRef}
        width={COLS}
        height={ROWS}
        className="w-full rounded-xl border border-white/[0.08]"
        style={{ imageRendering: 'pixelated' }}
      />

      {won && (
        <div className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 text-xs font-bold text-center">
          ✓ You found the passage! Explorer's instinct perfected.
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col items-center gap-2">
        <button
          className={btnClass}
          onPointerDown={() => pressKey('forward')}
          onPointerUp={() => releaseKey('forward')}
          onPointerLeave={() => releaseKey('forward')}
        >▲</button>
        <div className="flex gap-3">
          <button
            className={btnClass}
            onPointerDown={() => pressKey('left')}
            onPointerUp={() => releaseKey('left')}
            onPointerLeave={() => releaseKey('left')}
          >◀</button>
          <button
            className={btnClass}
            onPointerDown={() => pressKey('back')}
            onPointerUp={() => releaseKey('back')}
            onPointerLeave={() => releaseKey('back')}
          >▼</button>
          <button
            className={btnClass}
            onPointerDown={() => pressKey('right')}
            onPointerUp={() => releaseKey('right')}
            onPointerLeave={() => releaseKey('right')}
          >▶</button>
        </div>
      </div>
      <p className="text-slate-600 text-[10px] text-center">Follow the golden light to the exit</p>
    </div>
  )
}
