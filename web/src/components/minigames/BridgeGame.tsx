import { useState } from 'react'

// Islands are nodes with a required bridge count.
// Bridges connect islands horizontally or vertically (1 or 2 bridges per pair).
// Tap two islands to cycle bridges: 0 → 1 → 2 → 0
// Win when every island's total bridges equals its number and all are connected.

interface Island { id: number; r: number; c: number; n: number }
interface Config {
  title: string
  question: string
  rows: number
  cols: number
  islands: Island[]
  fact: string
}

const CONFIGS: Record<string, Config> = {
  'roman-bridges': {
    title: 'Roman Aqueducts',
    question: 'Connect the Roman settlements — each number shows how many bridges it needs.',
    rows: 5, cols: 5,
    islands: [
      { id: 0, r: 0, c: 0, n: 2 }, { id: 1, r: 0, c: 2, n: 3 }, { id: 2, r: 0, c: 4, n: 1 },
      { id: 3, r: 2, c: 0, n: 3 }, { id: 4, r: 2, c: 2, n: 4 }, { id: 5, r: 2, c: 4, n: 3 },
      { id: 6, r: 4, c: 0, n: 1 }, { id: 7, r: 4, c: 2, n: 3 }, { id: 8, r: 4, c: 4, n: 2 },
    ],
    fact: "Rome's road and aqueduct networks connected over 400 cities — each node in the empire was reachable from any other, the original 'all roads lead to Rome.'",
  },
  'silk-road': {
    title: 'Silk Road Crossings',
    question: 'Build bridges to connect the Silk Road trading posts.',
    rows: 5, cols: 7,
    islands: [
      { id: 0, r: 0, c: 0, n: 1 }, { id: 1, r: 0, c: 3, n: 2 }, { id: 2, r: 0, c: 6, n: 1 },
      { id: 3, r: 2, c: 1, n: 3 }, { id: 4, r: 2, c: 4, n: 4 }, { id: 5, r: 2, c: 6, n: 2 },
      { id: 6, r: 4, c: 0, n: 2 }, { id: 7, r: 4, c: 3, n: 3 }, { id: 8, r: 4, c: 5, n: 2 },
    ],
    fact: "Ibn Battuta's travels spanned over 75,000 miles, passing through the key nodes of the medieval Silk Road — connecting Tangier to Timbuktu to Beijing.",
  },
  'nile-crossing': {
    title: 'Nile Delta',
    question: 'Bridge the islands of the Nile Delta to complete the trade network.',
    rows: 5, cols: 5,
    islands: [
      { id: 0, r: 0, c: 1, n: 2 }, { id: 1, r: 0, c: 4, n: 1 },
      { id: 2, r: 2, c: 0, n: 2 }, { id: 3, r: 2, c: 2, n: 5 }, { id: 4, r: 2, c: 4, n: 2 },
      { id: 5, r: 4, c: 1, n: 2 }, { id: 6, r: 4, c: 3, n: 2 },
    ],
    fact: "The Nile Delta was the ancient world's most fertile and connected region — a network of waterways that made Egypt the breadbasket of the Mediterranean.",
  },
  'greek-islands': {
    title: 'Aegean Routes',
    question: 'Connect the Greek island colonies with sea routes.',
    rows: 5, cols: 7,
    islands: [
      { id: 0, r: 0, c: 0, n: 2 }, { id: 1, r: 0, c: 3, n: 3 }, { id: 2, r: 0, c: 6, n: 1 },
      { id: 3, r: 2, c: 1, n: 2 }, { id: 4, r: 2, c: 4, n: 4 },
      { id: 5, r: 4, c: 0, n: 1 }, { id: 6, r: 4, c: 2, n: 3 }, { id: 7, r: 4, c: 5, n: 2 },
    ],
    fact: "Athens maintained its empire through sea routes — the Delian League was built on naval dominance that connected over 150 city-states across the Aegean.",
  },
  'venice-canals': {
    title: 'Venice Canals',
    question: "Bridge Venice's islands — each district needs exactly as many connections as shown.",
    rows: 5, cols: 6,
    islands: [
      { id: 0, r: 0, c: 0, n: 1 }, { id: 1, r: 0, c: 2, n: 3 }, { id: 2, r: 0, c: 5, n: 2 },
      { id: 3, r: 2, c: 1, n: 3 }, { id: 4, r: 2, c: 4, n: 3 },
      { id: 5, r: 4, c: 0, n: 2 }, { id: 6, r: 4, c: 3, n: 3 }, { id: 7, r: 4, c: 5, n: 1 },
    ],
    fact: "Venice was built on 118 small islands connected by 400 bridges over 150 canals. Titian painted his masterworks within this unique island city.",
  },
  'maya-roads': {
    title: 'Maya Sacbés',
    question: 'Connect the Maya cities with sacbés (white stone roads).',
    rows: 5, cols: 5,
    islands: [
      { id: 0, r: 0, c: 0, n: 2 }, { id: 1, r: 0, c: 4, n: 2 },
      { id: 2, r: 2, c: 2, n: 4 },
      { id: 3, r: 4, c: 0, n: 2 }, { id: 4, r: 4, c: 4, n: 2 },
    ],
    fact: "The Maya built a network of raised stone roads called sacbés connecting cities across the Yucatán Peninsula — Pakal's Palenque sat at one end of this ancient highway system.",
  },
  'mongol-routes': {
    title: 'Mongol Post Roads',
    question: 'Connect the Mongol yam (postal relay) stations to complete the network.',
    rows: 5, cols: 7,
    islands: [
      { id: 0, r: 0, c: 0, n: 1 }, { id: 1, r: 0, c: 4, n: 2 },
      { id: 2, r: 2, c: 1, n: 3 }, { id: 3, r: 2, c: 3, n: 4 }, { id: 4, r: 2, c: 6, n: 2 },
      { id: 5, r: 4, c: 0, n: 2 }, { id: 6, r: 4, c: 2, n: 3 }, { id: 7, r: 4, c: 5, n: 1 },
    ],
    fact: "Batu Khan's Golden Horde maintained the yam — a relay postal system with stations every 25 miles. A message could travel from Karakorum to Europe in two weeks.",
  },
  'aztec-causeways': {
    title: 'Tenochtitlan Causeways',
    question: 'Build the causeways connecting Tenochtitlan to the mainland.',
    rows: 5, cols: 5,
    islands: [
      { id: 0, r: 0, c: 2, n: 2 },
      { id: 1, r: 2, c: 0, n: 2 }, { id: 2, r: 2, c: 2, n: 6 }, { id: 3, r: 2, c: 4, n: 2 },
      { id: 4, r: 4, c: 1, n: 2 }, { id: 5, r: 4, c: 3, n: 2 },
    ],
    fact: "Tenochtitlan was connected to the mainland by three great causeways, each wide enough for ten horsemen to ride abreast — Cortés described them as the most magnificent roads he had ever seen.",
  },
}

type BridgeMap = Map<string, number> // key: `${id1}-${id2}` (smaller id first), value: 0|1|2

function bridgeKey(a: number, b: number) {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

function isBlocked(islands: Island[], bridges: BridgeMap, a: Island, b: Island): boolean {
  // Check if a bridge between a and b would cross any existing bridge
  const isHoriz = a.r === b.r
  for (const [key, count] of bridges.entries()) {
    if (count === 0) continue
    const [ia, ib] = key.split('-').map(Number)
    const na = islands[ia], nb = islands[ib]
    const otherHoriz = na.r === nb.r
    if (isHoriz === otherHoriz) continue // parallel, no crossing
    // One horizontal, one vertical — check intersection
    const [hIsland, vIsland] = isHoriz ? [[a, b], [na, nb]] : [[na, nb], [a, b]]
    const [h1, h2] = hIsland as [Island, Island]
    const [v1, v2] = vIsland as [Island, Island]
    const minC = Math.min(h1.c, h2.c), maxC = Math.max(h1.c, h2.c)
    const minR = Math.min(v1.r, v2.r), maxR = Math.max(v1.r, v2.r)
    if (v1.c > minC && v1.c < maxC && h1.r > minR && h1.r < maxR) return true
  }
  return false
}

function canConnect(a: Island, b: Island): boolean {
  return (a.r === b.r || a.c === b.c) && a.id !== b.id
}

function checkWin(islands: Island[], bridges: BridgeMap): boolean {
  // Each island sum matches n
  for (const island of islands) {
    let total = 0
    for (const other of islands) {
      if (other.id === island.id) continue
      total += bridges.get(bridgeKey(island.id, other.id)) ?? 0
    }
    if (total !== island.n) return false
  }
  // All islands connected (BFS)
  const adj = new Map<number, number[]>()
  islands.forEach(i => adj.set(i.id, []))
  for (const [key, count] of bridges.entries()) {
    if (count === 0) continue
    const [a, b] = key.split('-').map(Number)
    adj.get(a)!.push(b); adj.get(b)!.push(a)
  }
  const visited = new Set<number>()
  const queue = [islands[0].id]
  visited.add(islands[0].id)
  while (queue.length) {
    const cur = queue.shift()!
    for (const nb of adj.get(cur) ?? []) {
      if (!visited.has(nb)) { visited.add(nb); queue.push(nb) }
    }
  }
  return visited.size === islands.length
}

export default function BridgeGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const cfg = CONFIGS[configId] ?? CONFIGS['roman-bridges']
  const { islands, rows, cols } = cfg

  const [bridges, setBridges] = useState<BridgeMap>(new Map())
  const [selected, setSelected] = useState<number | null>(null)
  const [won, setWon] = useState(false)

  const islandCount = (id: number) => {
    let total = 0
    for (const other of islands) {
      if (other.id === id) continue
      total += bridges.get(bridgeKey(id, other.id)) ?? 0
    }
    return total
  }

  const handleIslandTap = (id: number) => {
    if (won) return
    if (selected === null) { setSelected(id); return }
    if (selected === id) { setSelected(null); return }
    const a = islands[selected], b = islands.find(i => i.id === id)!
    if (!canConnect(a, b)) { setSelected(id); return }

    const key = bridgeKey(selected, id)
    const cur = bridges.get(key) ?? 0
    const next = (cur + 1) % 3

    // Don't add bridge if it would cross another
    if (next > 0 && isBlocked(islands, bridges, a, b)) { setSelected(null); return }

    const newBridges = new Map(bridges)
    newBridges.set(key, next)
    setBridges(newBridges)
    setSelected(null)

    if (next > 0 && checkWin(islands, newBridges)) {
      setWon(true)
      setTimeout(onWin, 800)
    }
  }

  const CELL = Math.min(52, Math.floor(320 / cols))
  const W = cols * CELL, H = rows * CELL

  // Render bridges as SVG lines
  const bridgeLines: JSX.Element[] = []
  for (const [key, count] of bridges.entries()) {
    if (count === 0) continue
    const [ia, ib] = key.split('-').map(Number)
    const a = islands[ia], b = islands[ib]
    const x1 = a.c * CELL + CELL / 2, y1 = a.r * CELL + CELL / 2
    const x2 = b.c * CELL + CELL / 2, y2 = b.r * CELL + CELL / 2
    const isH = a.r === b.r
    const offset = 4
    if (count >= 1) {
      const dx = isH ? 0 : offset, dy = isH ? offset : 0
      bridgeLines.push(
        <line key={`${key}-1`} x1={x1 - dx} y1={y1 - dy} x2={x2 - dx} y2={y2 - dy}
          stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      )
    }
    if (count === 2) {
      const dx = isH ? 0 : -offset, dy = isH ? -offset : 0
      bridgeLines.push(
        <line key={`${key}-2`} x1={x1 - dx} y1={y1 - dy} x2={x2 - dx} y2={y2 - dy}
          stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      )
    }
  }

  return (
    <div className="flex flex-col gap-3 bg-slate-950 rounded-xl p-3">
      <p className="text-amber-400/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
      <p className="text-white text-sm font-medium leading-snug">{cfg.question}</p>

      <div className="flex justify-center">
        <div className="relative" style={{ width: W, height: H }}>
          {/* Grid dots */}
          <svg className="absolute inset-0" width={W} height={H}>
            {Array.from({ length: rows }, (_, r) =>
              Array.from({ length: cols }, (_, c) => (
                <circle key={`${r},${c}`} cx={c * CELL + CELL / 2} cy={r * CELL + CELL / 2}
                  r="1.5" fill="rgba(255,255,255,0.06)" />
              ))
            )}
            {bridgeLines}
          </svg>

          {/* Islands */}
          {islands.map(island => {
            const count = islandCount(island.id)
            const done = count === island.n
            const over = count > island.n
            const isSel = selected === island.id
            return (
              <button
                key={island.id}
                onClick={() => handleIslandTap(island.id)}
                style={{
                  position: 'absolute',
                  left: island.c * CELL + CELL / 2 - 18,
                  top: island.r * CELL + CELL / 2 - 18,
                  width: 36, height: 36,
                }}
                className={`rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
                  ${isSel ? 'border-amber-400 bg-amber-500/30 scale-110' :
                    over ? 'border-red-400 bg-red-500/20 text-red-300' :
                    done ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300' :
                           'border-slate-400 bg-slate-800 text-white hover:border-amber-400/60'}`}
              >
                {island.n}
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-slate-500 text-[10px] text-center">
        {won
          ? <span className="text-emerald-400 font-bold">All islands connected!</span>
          : selected !== null
            ? <span className="text-amber-400">Tap another island to bridge — tap again to add 2nd bridge</span>
            : 'Tap an island to select, then tap another to connect'}
      </p>

      {won && (
        <div className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 text-xs leading-relaxed">
          <span className="font-bold mr-1">✓</span>{cfg.fact}
        </div>
      )}
    </div>
  )
}
