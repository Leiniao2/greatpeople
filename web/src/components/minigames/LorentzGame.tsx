import { useState, useEffect, useRef, useCallback } from 'react'

interface Vec2 { x: number; y: number }

interface LorentzConfig {
  title: string
  obstacles: { x: number; y: number; r: number }[]   // circles, 0–1 coords
  target: { x: number; y: number; r: number }
  startPos: Vec2
  startVel: Vec2   // pixels/frame, unit space (0–1)
  fact: string
}

const W = 280  // canvas display size
const H = 280

// Convert 0-1 coords to canvas pixels
const px = (v: number) => v * W
const py = (v: number) => v * H

const CONFIGS: Record<string, LorentzConfig> = {
  'lorentz-basic': {
    title: 'Lorentz Force: Deflect the Beam',
    obstacles: [
      { x: 0.35, y: 0.5, r: 0.07 },
      { x: 0.6,  y: 0.3, r: 0.06 },
    ],
    target: { x: 0.82, y: 0.75, r: 0.06 },
    startPos: { x: 0.08, y: 0.5 },
    startVel: { x: 0.004, y: 0.0 },
    fact: 'The Lorentz force (F = qv × B) causes charged particles moving through a magnetic field to curve. This is the principle behind particle accelerators and cathode ray tubes.',
  },
  'lorentz-spiral': {
    title: 'Lorentz Force: Spiral Path',
    obstacles: [
      { x: 0.5,  y: 0.25, r: 0.07 },
      { x: 0.25, y: 0.65, r: 0.06 },
      { x: 0.7,  y: 0.65, r: 0.06 },
    ],
    target: { x: 0.5, y: 0.85, r: 0.06 },
    startPos: { x: 0.5, y: 0.08 },
    startVel: { x: 0.003, y: 0.001 },
    fact: 'Cyclotrons accelerate particles in a spiral path using alternating electric fields and a constant magnetic field — the particle gains energy each half-revolution.',
  },
  'lorentz-aurora': {
    title: 'Lorentz Force: Aurora Path',
    obstacles: [
      { x: 0.2, y: 0.4, r: 0.07 },
      { x: 0.5, y: 0.2, r: 0.06 },
      { x: 0.75, y: 0.45, r: 0.07 },
      { x: 0.4, y: 0.7, r: 0.06 },
    ],
    target: { x: 0.8, y: 0.82, r: 0.06 },
    startPos: { x: 0.08, y: 0.08 },
    startVel: { x: 0.003, y: 0.002 },
    fact: 'The aurora borealis occurs when solar wind particles are guided by Earth\'s magnetic field into the polar atmosphere, causing atmospheric gases to glow.',
  },
}

// ── Physics ───────────────────────────────────────────────────────────────────

// B-field strength per "notch"; positive = into screen (curves right), negative = out (curves left)
const B_STEP = 0.18
const MAX_B = 3
const SPEED_CAP = 0.012

function applyLorentz(vel: Vec2, bStrength: number): Vec2 {
  // F = q(v × B): in 2D, B along z: Fx = q*vy*Bz, Fy = -q*vx*Bz
  // We treat q=1, so ax = vy*B, ay = -vx*B
  const ax = vel.y * bStrength
  const ay = -vel.x * bStrength
  let vx = vel.x + ax
  let vy = vel.y + ay
  // Clamp speed
  const speed = Math.sqrt(vx * vx + vy * vy)
  if (speed > SPEED_CAP) { vx = vx / speed * SPEED_CAP; vy = vy / speed * SPEED_CAP }
  return { x: vx, y: vy }
}

function circlesOverlap(p: Vec2, r1: number, c: { x: number; y: number; r: number }): boolean {
  const dx = p.x - c.x, dy = p.y - c.y
  return Math.sqrt(dx * dx + dy * dy) < (r1 + c.r)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LorentzGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const cfg = CONFIGS[configId] ?? CONFIGS['lorentz-basic']
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [bField, setBField] = useState(0)       // -MAX_B to +MAX_B in integer steps
  const [running, setRunning] = useState(false)
  const [won, setWon] = useState(false)
  const [dead, setDead] = useState(false)

  const posRef = useRef<Vec2>({ ...cfg.startPos })
  const velRef = useRef<Vec2>({ ...cfg.startVel })
  const bRef = useRef(0)
  const trailRef = useRef<Vec2[]>([])
  const wonRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  const reset = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    posRef.current = { ...cfg.startPos }
    velRef.current = { ...cfg.startVel }
    trailRef.current = []
    wonRef.current = false
    setRunning(false)
    setWon(false)
    setDead(false)
    setBField(0)
    bRef.current = 0
  }, [cfg])

  useEffect(() => { reset() }, [configId, reset])

  // Sync bRef when bField slider changes
  useEffect(() => { bRef.current = bField * B_STEP }, [bField])

  // Draw loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const draw = () => {
      ctx.clearRect(0, 0, W, H)

      // Background
      ctx.fillStyle = '#0a0f1e'
      ctx.fillRect(0, 0, W, H)

      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 1
      for (let x = 0; x <= W; x += W / 7) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
      for (let y = 0; y <= H; y += H / 7) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

      // Target
      const t = cfg.target
      ctx.beginPath()
      ctx.arc(px(t.x), py(t.y), t.r * W, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(52,211,153,0.15)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(52,211,153,0.7)'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = '#34d399'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('✦', px(t.x), py(t.y))

      // Obstacles
      for (const obs of cfg.obstacles) {
        ctx.beginPath()
        ctx.arc(px(obs.x), py(obs.y), obs.r * W, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(239,68,68,0.2)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(239,68,68,0.6)'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.fillStyle = '#f87171'
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('✕', px(obs.x), py(obs.y))
      }

      // Trail
      const tr = trailRef.current
      if (tr.length > 1) {
        ctx.beginPath()
        ctx.moveTo(px(tr[0].x), py(tr[0].y))
        for (let i = 1; i < tr.length; i++) {
          ctx.lineTo(px(tr[i].x), py(tr[i].y))
        }
        ctx.strokeStyle = 'rgba(129,140,248,0.5)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // Particle
      const pos = posRef.current
      ctx.beginPath()
      ctx.arc(px(pos.x), py(pos.y), 6, 0, Math.PI * 2)
      ctx.fillStyle = '#818cf8'
      ctx.fill()
      ctx.strokeStyle = '#a5b4fc'
      ctx.lineWidth = 2
      ctx.stroke()

      // B-field indicator
      const bVal = bRef.current
      if (Math.abs(bVal) > 0.01) {
        ctx.fillStyle = bVal > 0 ? 'rgba(245,158,11,0.7)' : 'rgba(96,165,250,0.7)'
        ctx.font = 'bold 11px sans-serif'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(`B ${bVal > 0 ? '→ into' : '← out'} (${bVal.toFixed(2)})`, 6, 6)
      }
    }

    const tick = () => {
      if (!running || wonRef.current) { draw(); return }

      // Physics step
      velRef.current = applyLorentz(velRef.current, bRef.current)
      posRef.current = {
        x: posRef.current.x + velRef.current.x,
        y: posRef.current.y + velRef.current.y,
      }

      // Record trail (keep last 200 points)
      trailRef.current = [...trailRef.current.slice(-199), { ...posRef.current }]

      const pos = posRef.current

      // Out of bounds → dead
      if (pos.x < 0 || pos.x > 1 || pos.y < 0 || pos.y > 1) {
        setDead(true)
        setRunning(false)
        draw()
        return
      }

      // Obstacle collision
      for (const obs of cfg.obstacles) {
        if (circlesOverlap(pos, 0.02, obs)) {
          setDead(true)
          setRunning(false)
          draw()
          return
        }
      }

      // Target reached
      if (circlesOverlap(pos, 0.02, cfg.target)) {
        wonRef.current = true
        setWon(true)
        setRunning(false)
        setTimeout(onWin, 700)
        draw()
        return
      }

      draw()
      rafRef.current = requestAnimationFrame(tick)
    }

    if (running) {
      rafRef.current = requestAnimationFrame(tick)
    } else {
      draw()
    }

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [running, cfg, onWin])

  return (
    <div className="flex flex-col items-center gap-3 p-4 bg-slate-950 rounded-xl select-none">
      <div className="flex items-center justify-between w-full">
        <span className="text-indigo-400 font-bold text-sm tracking-wide">{cfg.title}</span>
        {won && <span className="text-emerald-400 text-xs font-bold">✓ Target reached!</span>}
        {dead && <span className="text-red-400 text-xs font-bold">✕ Out of bounds</span>}
      </div>

      <p className="text-slate-400 text-xs text-center">
        Guide the <span className="text-indigo-400">particle ●</span> to the <span className="text-emerald-400">target ✦</span> — avoid red obstacles
      </p>

      <canvas ref={canvasRef} width={W} height={H}
        className="rounded-xl"
        style={{ width: W, height: H, border: '1px solid rgba(255,255,255,0.07)' }}
      />

      {/* B-field control */}
      <div className="w-full flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-blue-400">← B out of screen</span>
          <span className="text-slate-500">B = {(bField * B_STEP).toFixed(2)}</span>
          <span className="text-amber-400">B into screen →</span>
        </div>
        <input
          type="range"
          min={-MAX_B} max={MAX_B} step={1}
          value={bField}
          onChange={e => setBField(Number(e.target.value))}
          className="w-full accent-indigo-500"
          disabled={won || dead}
        />
      </div>

      {/* Controls */}
      <div className="flex gap-2 w-full">
        {!running && !won && !dead && (
          <button onClick={() => setRunning(true)}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all">
            Launch ▶
          </button>
        )}
        {running && (
          <button onClick={() => setRunning(false)}
            className="flex-1 py-2.5 rounded-xl bg-white/[0.08] border border-white/10 text-slate-300 hover:bg-white/[0.12] font-bold text-sm transition-all">
            Pause ⏸
          </button>
        )}
        <button onClick={reset}
          className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-slate-400 hover:text-white text-sm transition-all">
          ↺
        </button>
      </div>

      {dead && (
        <p className="text-red-400 text-xs text-center">Particle lost — adjust the B-field and try again</p>
      )}

      {won && (
        <div className="w-full p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
          <p className="text-slate-400 text-xs leading-relaxed">{cfg.fact}</p>
        </div>
      )}
    </div>
  )
}
