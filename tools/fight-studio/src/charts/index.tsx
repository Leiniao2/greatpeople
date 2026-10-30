/**
 * Small inline-SVG charts following the dataviz skill: thin marks, 4px rounded
 * data ends, recessive grid, one axis, hover tooltip on every mark, legend for
 * 2+ series, sequential single-hue for magnitude, fixed categorical order.
 */
import { useState, type ReactNode } from 'react'

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
const SEQ = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b']

export function seqColor(t: number): string {
  const i = Math.max(0, Math.min(SEQ.length - 1, Math.round(t * (SEQ.length - 1))))
  return SEQ[i]
}

export function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const show = (e: React.MouseEvent, text: string) => setTip({ x: e.clientX + 12, y: e.clientY + 12, text })
  const hide = () => setTip(null)
  const node = tip ? <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div> : null
  return { show, hide, node }
}

export function Viz({ title, sub, children, legend }: { title: string; sub?: string; children: ReactNode; legend?: { label: string; color: string }[] }) {
  return (
    <div className="viz">
      <h4>{title}</h4>
      {sub && <div className="sub">{sub}</div>}
      {children}
      {legend && legend.length > 1 && (
        <div className="legend">{legend.map(l => <span key={l.label}><i style={{ background: l.color }} />{l.label}</span>)}</div>
      )}
    </div>
  )
}

/** Horizontal ranked bars, one hue. */
export function HBars({ rows, width = 420, max, format = v => String(v), color = SERIES[0], highlight }: {
  rows: { label: string; value: number; tip?: string }[]
  width?: number; max?: number; format?: (v: number) => string; color?: string
  highlight?: (label: string) => boolean
}) {
  const t = useTooltip()
  const labelW = 150, barH = 14, gap = 5
  const m = max ?? Math.max(1, ...rows.map(r => r.value))
  const innerW = width - labelW - 50
  const h = rows.length * (barH + gap)
  return (
    <>
      <svg width={width} height={h}>
        {rows.map((r, i) => {
          const y = i * (barH + gap)
          const w = Math.max(0, (r.value / m) * innerW)
          const hl = highlight ? highlight(r.label) : true
          return (
            <g key={r.label} onMouseMove={e => t.show(e, r.tip ?? `${r.label}: ${format(r.value)}`)} onMouseLeave={t.hide}>
              <text x={labelW - 6} y={y + barH - 3} textAnchor="end">{r.label.length > 22 ? r.label.slice(0, 21) + '…' : r.label}</text>
              <rect x={labelW} y={y} width={w} height={barH} rx={4} fill={hl ? color : '#c9c6bd'} />
              <rect x={labelW} y={y} width={Math.min(4, w)} height={barH} fill={hl ? color : '#c9c6bd'} />
              <text x={labelW + w + 5} y={y + barH - 3}>{format(r.value)}</text>
              <rect x={0} y={y} width={width} height={barH + gap} fill="transparent" />
            </g>
          )
        })}
      </svg>
      {t.node}
    </>
  )
}

/** Column histogram, one hue. */
export function Columns({ values, labels, width = 300, height = 110, color = SERIES[0] }: {
  values: number[]; labels: string[]; width?: number; height?: number; color?: string
}) {
  const t = useTooltip()
  const m = Math.max(1, ...values)
  const n = values.length
  const gap = 2
  const cw = (width - gap * (n - 1)) / n
  const plotH = height - 16
  return (
    <>
      <svg width={width} height={height}>
        <g className="axis"><line x1={0} x2={width} y1={plotH + 0.5} y2={plotH + 0.5} /></g>
        {values.map((v, i) => {
          const bh = (v / m) * plotH
          const x = i * (cw + gap)
          return (
            <g key={i} onMouseMove={e => t.show(e, `${labels[i]}: ${v}`)} onMouseLeave={t.hide}>
              <rect x={x} y={plotH - bh} width={cw} height={bh} rx={Math.min(4, cw / 2)} fill={color} />
              {bh > 4 && <rect x={x} y={plotH - 4} width={cw} height={4} fill={color} />}
              <rect x={x} y={0} width={cw + gap} height={height} fill="transparent" />
              {(n <= 14 || i % 2 === 0) && <text x={x + cw / 2} y={height - 3} textAnchor="middle">{labels[i]}</text>}
            </g>
          )
        })}
      </svg>
      {t.node}
    </>
  )
}

/** Heatmap, sequential one-hue; values normalised over the whole grid unless `max` given. */
export function Heatmap({ rows, cols, values, format = v => v.toFixed(1), cellW = 64, cellH = 22, min, max, labelW = 110 }: {
  rows: string[]; cols: string[]; values: number[][]; format?: (v: number) => string
  cellW?: number; cellH?: number; min?: number; max?: number; labelW?: number
}) {
  const t = useTooltip()
  const flat = values.flat()
  const lo = min ?? Math.min(...flat)
  const hi = max ?? Math.max(...flat)
  const span = hi - lo || 1
  const w = labelW + cols.length * cellW
  const h = 18 + rows.length * cellH
  return (
    <>
      <svg width={w} height={h}>
        {cols.map((c, j) => <text key={c} x={labelW + j * cellW + cellW / 2} y={12} textAnchor="middle">{c}</text>)}
        {rows.map((r, i) => (
          <g key={r}>
            <text x={labelW - 6} y={18 + i * cellH + cellH - 7} textAnchor="end">{r.length > 18 ? r.slice(0, 17) + '…' : r}</text>
            {cols.map((c, j) => {
              const v = values[i][j]
              const tt = (v - lo) / span
              return (
                <g key={c} onMouseMove={e => t.show(e, `${r} × ${c}: ${format(v)}`)} onMouseLeave={t.hide}>
                  <rect x={labelW + j * cellW + 1} y={18 + i * cellH + 1} width={cellW - 2} height={cellH - 2} rx={3} fill={seqColor(tt)} />
                  <text x={labelW + j * cellW + cellW / 2} y={18 + i * cellH + cellH - 7} textAnchor="middle" style={{ fill: tt > 0.55 ? '#fff' : '#0b0b0b' }}>{format(v)}</text>
                </g>
              )
            })}
          </g>
        ))}
      </svg>
      {t.node}
    </>
  )
}

/** Dot strip: one row per category, a dot per item, with tooltip; emphasis via `highlight`. */
export function Strip({ rows, width = 520, domain = [0, 12], highlight }: {
  rows: { label: string; items: { name: string; value: number }[] }[]
  width?: number; domain?: [number, number]; highlight?: string | null
}) {
  const t = useTooltip()
  const labelW = 100, rowH = 22
  const innerW = width - labelW - 20
  const x = (v: number) => labelW + ((v - domain[0]) / (domain[1] - domain[0])) * innerW
  const h = rows.length * rowH + 16
  const ticks = Array.from({ length: domain[1] - domain[0] + 1 }, (_, i) => domain[0] + i)
  return (
    <>
      <svg width={width} height={h}>
        <g className="grid">{ticks.map(v => <line key={v} x1={x(v)} x2={x(v)} y1={0} y2={rows.length * rowH} />)}</g>
        {ticks.map(v => <text key={v} x={x(v)} y={h - 2} textAnchor="middle">{v}</text>)}
        {rows.map((r, i) => {
          const counts = new Map<number, number>()
          return (
            <g key={r.label}>
              <text x={labelW - 8} y={i * rowH + 15} textAnchor="end">{r.label}</text>
              {r.items.map(it => {
                const k = counts.get(it.value) ?? 0
                counts.set(it.value, k + 1)
                const hl = highlight ? it.name === highlight : false
                const dy = ((k % 5) - 2) * 3
                return (
                  <circle key={it.name} cx={x(it.value) + (Math.floor(k / 5) % 2 ? 3 : -3) * (k >= 5 ? 1 : 0)} cy={i * rowH + 11 + dy} r={hl ? 6 : 4}
                    fill={hl ? SERIES[1] : SERIES[0]} fillOpacity={hl ? 1 : 0.55} stroke="#fcfcfb" strokeWidth={1.5}
                    onMouseMove={e => t.show(e, `${it.name}\n${r.label}: ${it.value}`)} onMouseLeave={t.hide} />
                )
              })}
            </g>
          )
        })}
      </svg>
      {t.node}
    </>
  )
}
