import { useMemo, useState } from 'react'
import type { MinigameProps } from '@/games/types'
import { resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Expedition: plan a journey across a map of waypoints.  Every leg costs
// supplies and days; some legs carry a hazard that costs extra.  Required
// waypoints must be visited in order before the goal.  Run out of supplies
// or days and the expedition fails.
//
// Difficulty scales the supply and day budgets (generous → tight) and, from
// tier 3, hides hazard costs until the leg is taken.

interface MapNode { id: string; label: string; x: number; y: number }
interface MapEdge { a: string; b: string; cost: number; days: number; hazard?: { label: string; cost: number } }

interface ExpeditionConfig {
  title: string
  subtitle: string
  nodes: MapNode[]
  edges: MapEdge[]
  start: string
  goal: string
  /** Must be reached in this order before the goal counts. */
  mustVisit: string[]
  /** Budgets at difficulty 1; later tiers tighten them. */
  supplies: number
  days: number
  fact: string
}

const CONFIGS: Record<string, ExpeditionConfig> = {
  'zheng-he': {
    title: 'The Treasure Fleet',
    subtitle: "Sail Zheng He's armada from Nanjing to the Swahili coast, calling at every tributary port",
    nodes: [
      { id: 'nanjing',  label: 'Nanjing',   x: 92, y: 18 },
      { id: 'champa',   label: 'Champa',    x: 78, y: 38 },
      { id: 'malacca',  label: 'Malacca',   x: 66, y: 52 },
      { id: 'java',     label: 'Java',      x: 72, y: 70 },
      { id: 'ceylon',   label: 'Ceylon',    x: 48, y: 50 },
      { id: 'calicut',  label: 'Calicut',   x: 40, y: 40 },
      { id: 'hormuz',   label: 'Hormuz',    x: 26, y: 24 },
      { id: 'aden',     label: 'Aden',      x: 16, y: 44 },
      { id: 'malindi',  label: 'Malindi',   x: 8,  y: 70 },
    ],
    edges: [
      { a: 'nanjing', b: 'champa',  cost: 3, days: 10 },
      { a: 'champa',  b: 'malacca', cost: 2, days: 8 },
      { a: 'champa',  b: 'java',    cost: 4, days: 14, hazard: { label: 'Monsoon squalls', cost: 3 } },
      { a: 'java',    b: 'malacca', cost: 2, days: 6 },
      { a: 'malacca', b: 'ceylon',  cost: 4, days: 12 },
      { a: 'java',    b: 'ceylon',  cost: 6, days: 16, hazard: { label: 'Open-ocean crossing', cost: 4 } },
      { a: 'ceylon',  b: 'calicut', cost: 2, days: 5 },
      { a: 'calicut', b: 'hormuz',  cost: 5, days: 14 },
      { a: 'calicut', b: 'aden',    cost: 5, days: 15, hazard: { label: 'Pirates off Socotra', cost: 3 } },
      { a: 'hormuz',  b: 'aden',    cost: 4, days: 12 },
      { a: 'aden',    b: 'malindi', cost: 4, days: 12 },
      { a: 'ceylon',  b: 'malindi', cost: 9, days: 26, hazard: { label: 'The long reach', cost: 5 } },
    ],
    start: 'nanjing', goal: 'malindi',
    mustVisit: ['malacca', 'calicut'],
    supplies: 34, days: 110,
    fact: "Between 1405 and 1433 Zheng He led seven voyages with fleets of up to 300 ships and 28,000 men, reaching Arabia and East Africa. His largest 'treasure ships' may have been four times the length of Columbus's Santa María.",
  },
  'ibn-battuta': {
    title: 'The Longest Journey',
    subtitle: 'Guide Ibn Battuta from Tangier to Mecca, Delhi and beyond, as far as supplies allow',
    nodes: [
      { id: 'tangier',  label: 'Tangier',  x: 8,  y: 30 },
      { id: 'cairo',    label: 'Cairo',    x: 30, y: 36 },
      { id: 'damascus', label: 'Damascus', x: 38, y: 24 },
      { id: 'mecca',    label: 'Mecca',    x: 40, y: 52 },
      { id: 'baghdad',  label: 'Baghdad',  x: 50, y: 28 },
      { id: 'hormuz',   label: 'Hormuz',   x: 60, y: 40 },
      { id: 'delhi',    label: 'Delhi',    x: 78, y: 32 },
      { id: 'maldives', label: 'Maldives', x: 80, y: 66 },
      { id: 'quanzhou', label: 'Quanzhou', x: 94, y: 40 },
    ],
    edges: [
      { a: 'tangier',  b: 'cairo',    cost: 5, days: 30 },
      { a: 'cairo',    b: 'damascus', cost: 2, days: 10 },
      { a: 'cairo',    b: 'mecca',    cost: 4, days: 20, hazard: { label: 'Red Sea storms', cost: 3 } },
      { a: 'damascus', b: 'mecca',    cost: 3, days: 18 },
      { a: 'damascus', b: 'baghdad',  cost: 3, days: 14 },
      { a: 'mecca',    b: 'baghdad',  cost: 4, days: 20 },
      { a: 'baghdad',  b: 'hormuz',   cost: 3, days: 12 },
      { a: 'hormuz',   b: 'delhi',    cost: 6, days: 24, hazard: { label: 'Mountain passes', cost: 4 } },
      { a: 'mecca',    b: 'hormuz',   cost: 5, days: 22 },
      { a: 'delhi',    b: 'maldives', cost: 5, days: 20 },
      { a: 'maldives', b: 'quanzhou', cost: 7, days: 30, hazard: { label: 'Shipwreck off Calicut', cost: 5 } },
      { a: 'delhi',    b: 'quanzhou', cost: 10, days: 40 },
    ],
    start: 'tangier', goal: 'quanzhou',
    mustVisit: ['mecca', 'delhi'],
    supplies: 40, days: 200,
    fact: 'Ibn Battuta left Tangier in 1325 for the hajj and did not return for 24 years, covering some 120,000 km across North Africa, Arabia, India, the Maldives and China — three times the distance Marco Polo travelled.',
  },
  'hannibal-alps': {
    title: 'Over the Alps',
    subtitle: "March Hannibal's army and elephants from New Carthage into Italy before winter closes the passes",
    nodes: [
      { id: 'carthago', label: 'New Carthage', x: 10, y: 70 },
      { id: 'ebro',     label: 'Ebro',         x: 24, y: 52 },
      { id: 'pyrenees', label: 'Pyrenees',     x: 36, y: 40 },
      { id: 'rhone',    label: 'Rhône',        x: 52, y: 34 },
      { id: 'coast',    label: 'Coast road',   x: 58, y: 56 },
      { id: 'pass',     label: 'High pass',    x: 70, y: 22 },
      { id: 'turin',    label: 'Turin',        x: 86, y: 36 },
    ],
    edges: [
      { a: 'carthago', b: 'ebro',     cost: 3, days: 12 },
      { a: 'ebro',     b: 'pyrenees', cost: 4, days: 10, hazard: { label: 'Hostile tribes', cost: 3 } },
      { a: 'pyrenees', b: 'rhone',    cost: 4, days: 12 },
      { a: 'pyrenees', b: 'coast',    cost: 5, days: 14, hazard: { label: 'Roman patrols', cost: 4 } },
      { a: 'rhone',    b: 'pass',     cost: 6, days: 9,  hazard: { label: 'Ambush in the gorge', cost: 4 } },
      { a: 'coast',    b: 'turin',    cost: 8, days: 18, hazard: { label: 'Roman legions', cost: 6 } },
      { a: 'pass',     b: 'turin',    cost: 5, days: 6,  hazard: { label: 'Snow and ice', cost: 4 } },
      { a: 'rhone',    b: 'coast',    cost: 2, days: 4 },
    ],
    start: 'carthago', goal: 'turin',
    mustVisit: ['rhone'],
    supplies: 32, days: 70,
    fact: 'In 218 BCE Hannibal crossed the Alps in about fifteen days with some 40,000 men and 37 elephants, losing perhaps a third of his army to cold, falls and attacks — and still won at the Trebia, Trasimene and Cannae.',
  },
}

function key(a: string, b: string) { return a < b ? `${a}|${b}` : `${b}|${a}` }

export default function ExpeditionGame({ configId, difficulty, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'zheng-he')
  // Budgets shrink with difficulty; hazards hide their cost from tier 3.
  const budgetScale = scale(difficulty, [1, 0.85, 0.72, 0.62])
  const supplyBudget = Math.round(cfg.supplies * budgetScale)
  const dayBudget = Math.round(cfg.days * budgetScale)
  const hiddenHazards = difficulty >= 3

  const edgeMap = useMemo(() => {
    const m = new Map<string, MapEdge>()
    for (const e of cfg.edges) m.set(key(e.a, e.b), e)
    return m
  }, [cfg])
  const nodeById = useMemo(() => Object.fromEntries(cfg.nodes.map(n => [n.id, n])), [cfg])

  const [path, setPath] = useState<string[]>([cfg.start])
  const [supplies, setSupplies] = useState(supplyBudget)
  const [days, setDays] = useState(0)
  const [lastEvent, setLastEvent] = useState<string | null>(null)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 1000 })

  const here = path[path.length - 1]
  const visitedRequired = cfg.mustVisit.filter(id => path.includes(id)).length
  const nextRequired = cfg.mustVisit[visitedRequired]
  const reachable = (id: string) => edgeMap.has(key(here, id))

  const travel = (to: string) => {
    if (settled) return
    const edge = edgeMap.get(key(here, to))
    if (!edge) return
    const hazardCost = edge.hazard?.cost ?? 0
    const nextSupplies = supplies - edge.cost - hazardCost
    const nextDays = days + edge.days
    setPath(p => [...p, to])
    setSupplies(nextSupplies)
    setDays(nextDays)
    setLastEvent(edge.hazard ? `${edge.hazard.label}: −${edge.hazard.cost} supplies` : null)

    if (nextSupplies < 0) { lose('supplies exhausted'); return }
    if (nextDays > dayBudget) { lose('out of time'); return }
    if (to === cfg.goal) {
      // The goal only counts once every required waypoint has been visited in order.
      const visited = [...path, to]
      let idx = 0
      for (const id of visited) if (id === cfg.mustVisit[idx]) idx++
      if (idx >= cfg.mustVisit.length) win()
      else lose('skipped a required port')
    }
  }

  const suppliesPct = Math.max(0, supplies) / supplyBudget
  const daysPct = Math.min(1, days / dayBudget)

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
      <div>
        <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
        <p className="text-muted text-xs leading-relaxed">{cfg.subtitle}</p>
      </div>

      {/* Budgets */}
      <div className="grid grid-cols-2 gap-3 text-[10px]">
        <div>
          <div className="flex justify-between text-muted"><span>Supplies</span><span className={supplies < supplyBudget * 0.25 ? 'text-red-600 font-bold' : ''}>{Math.max(0, supplies)} / {supplyBudget}</span></div>
          <div className="h-1.5 bg-panel rounded-full overflow-hidden"><div className="h-full bg-emerald-600 rounded-full transition-all" style={{ width: `${suppliesPct * 100}%` }} /></div>
        </div>
        <div>
          <div className="flex justify-between text-muted"><span>Days</span><span className={days > dayBudget * 0.75 ? 'text-red-600 font-bold' : ''}>{days} / {dayBudget}</span></div>
          <div className="h-1.5 bg-panel rounded-full overflow-hidden"><div className="h-full bg-accent rounded-full transition-all" style={{ width: `${daysPct * 100}%` }} /></div>
        </div>
      </div>

      {/* Map */}
      <div className="relative w-full rounded-xl border border-line bg-panel overflow-hidden" style={{ paddingTop: '62%' }}>
        <svg viewBox="0 0 100 80" className="absolute inset-0 w-full h-full">
          {cfg.edges.map(e => {
            const a = nodeById[e.a], b = nodeById[e.b]
            const onPath = path.some((id, i) => i > 0 && key(path[i - 1], id) === key(e.a, e.b))
            const available = !settled && (e.a === here || e.b === here)
            return (
              <line key={key(e.a, e.b)} x1={a.x} y1={a.y * 0.8} x2={b.x} y2={b.y * 0.8}
                stroke={onPath ? '#9b2c23' : available ? '#b89f6e' : '#cdbd9a'}
                strokeWidth={onPath ? 1.4 : available ? 1 : 0.5}
                strokeDasharray={e.hazard && !onPath ? '2 1.5' : undefined} />
            )
          })}
          {cfg.nodes.map(n => {
            const isHere = n.id === here
            const visited = path.includes(n.id)
            const required = cfg.mustVisit.includes(n.id)
            const isGoal = n.id === cfg.goal
            return (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y * 0.8} r={isHere ? 3.2 : 2.4}
                  fill={isHere ? '#9b2c23' : visited ? '#b89f6e' : isGoal ? '#2a2117' : '#fbf6ea'}
                  stroke={required && !visited ? '#9b2c23' : '#5a4b36'} strokeWidth={required && !visited ? 1 : 0.5} />
                <text x={n.x} y={n.y * 0.8 - 4} fontSize="3.4" textAnchor="middle" fill="#2a2117" fontWeight={isGoal || required ? 700 : 400}>
                  {n.label}{isGoal ? ' ★' : required && !visited ? ' !' : ''}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Legs from here */}
      {!settled && (
        <div className="flex flex-col gap-1.5">
          <p className="text-muted text-[10px]">
            At <span className="font-bold text-ink">{nodeById[here].label}</span>
            {nextRequired && <> · next required: <span className="font-bold text-accent">{nodeById[nextRequired].label}</span></>}
          </p>
          {cfg.nodes.filter(n => reachable(n.id) && n.id !== path[path.length - 2]).map(n => {
            const e = edgeMap.get(key(here, n.id))!
            return (
              <button key={n.id} onClick={() => travel(n.id)}
                className="flex items-center justify-between px-3 py-2 rounded-xl border bg-panel border-line text-ink-2 hover:border-accent/40 hover:text-accent text-xs transition-all">
                <span className="font-semibold">→ {n.label}</span>
                <span className="text-[10px] text-muted">
                  {e.cost} supplies · {e.days} days
                  {e.hazard && <span className="ml-2 text-amber-700">⚠ {hiddenHazards ? 'hazard' : `${e.hazard.label} (−${e.hazard.cost})`}</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {lastEvent && !settled && <p className="text-amber-800 text-[11px]">⚠ {lastEvent}</p>}

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Expedition complete!"
        loseTitle={supplies < 0 ? 'Supplies ran out' : days > dayBudget ? 'The season closed' : 'A required port was missed'} />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
