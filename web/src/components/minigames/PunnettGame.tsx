import { useState } from 'react'

interface PunnettCross {
  parent1: [string, string]   // top margin alleles, e.g. ['T','t']
  parent2: [string, string]   // left margin alleles
  traitLabel: string          // e.g. "Height: T = Tall, t = short"
  dominant: string            // phenotype name
  recessive: string
}

interface PunnettConfig {
  title: string
  crosses: PunnettCross[]
  fact: string
}

// ── Configs ───────────────────────────────────────────────────────────────────

const CONFIGS: Record<string, PunnettConfig> = {
  'mendel-peas': {
    title: "Mendel's Pea Crosses",
    crosses: [
      {
        parent1: ['T', 't'], parent2: ['T', 't'],
        traitLabel: 'Height: T = Tall  ·  t = short',
        dominant: 'Tall', recessive: 'short',
      },
      {
        parent1: ['Y', 'y'], parent2: ['Y', 'y'],
        traitLabel: 'Seed colour: Y = Yellow  ·  y = green',
        dominant: 'Yellow', recessive: 'green',
      },
      {
        parent1: ['R', 'R'], parent2: ['r', 'r'],
        traitLabel: 'Seed shape: R = Round  ·  r = wrinkled',
        dominant: 'Round', recessive: 'wrinkled',
      },
    ],
    fact: "Mendel's three crosses demonstrated dominance (Tt × tt → 1:1), heterozygous ratio (Tt × Tt → 3:1), and pure-breed dominance (RR × rr → all Rr). Every genetic counselling session today still uses the Punnett square.",
  },
  'blood-types': {
    title: 'Blood Type Genetics',
    crosses: [
      {
        parent1: ['I_A', 'i'], parent2: ['I_B', 'i'],
        traitLabel: 'Blood type: I_A = A allele  ·  I_B = B allele  ·  i = O',
        dominant: 'A or B', recessive: 'O',
      },
      {
        parent1: ['I_A', 'I_A'], parent2: ['i', 'i'],
        traitLabel: 'Blood type: I_A = A allele  ·  i = O allele',
        dominant: 'Type A', recessive: 'Type O',
      },
    ],
    fact: "ABO blood types follow codominance — both A and B alleles are expressed equally. Karl Landsteiner discovered blood groups in 1901, making blood transfusions safe and earning him the 1930 Nobel Prize.",
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(a: string, b: string): string {
  const aUpper = a === a.toUpperCase()
  const bUpper = b === b.toUpperCase()
  if (aUpper && !bUpper) return a + b
  if (bUpper && !aUpper) return b + a
  return a + b
}

function cellAnswer(cross: PunnettCross, row: number, col: number): string {
  return normalize(cross.parent2[row], cross.parent1[col])
}

function getOptions(cross: PunnettCross): string[] {
  const set = new Set<string>()
  for (const a of cross.parent1) {
    for (const b of cross.parent2) {
      set.add(normalize(a, b))
    }
  }
  return Array.from(set)
}

function phenotypeRatio(cross: PunnettCross): { dominant: number; recessive: number } {
  let dom = 0, rec = 0
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const cell = cellAnswer(cross, r, c)
      const hasUpper = [...cell].some(ch => ch === ch.toUpperCase() && ch !== ch.toLowerCase())
      if (hasUpper) dom++; else rec++
    }
  }
  return { dominant: dom, recessive: rec }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PunnettGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const cfg = CONFIGS[configId] ?? CONFIGS['mendel-peas']
  const [crossIdx, setCrossIdx] = useState(0)
  const [cells, setCells] = useState<(string | null)[]>([null, null, null, null])
  const [errors, setErrors] = useState<boolean[]>([false, false, false, false])
  const [picking, setPicking] = useState<number | null>(null)
  const [crossDone, setCrossDone] = useState(false)
  const [allDone, setAllDone] = useState(false)

  const cross = cfg.crosses[crossIdx]
  const options = getOptions(cross)
  const ratio = phenotypeRatio(cross)

  const handlePick = (option: string) => {
    if (picking === null) return
    const correct = cellAnswer(cross, Math.floor(picking / 2), picking % 2)
    const newCells = [...cells]
    const newErrors = [...errors]
    if (option === correct) {
      newCells[picking] = option
      newErrors[picking] = false
    } else {
      newErrors[picking] = true
      setPicking(null)
      setErrors(newErrors)
      return
    }
    setCells(newCells)
    setPicking(null)
    setErrors(newErrors)
    if (newCells.every(c => c !== null)) {
      setCrossDone(true)
    }
  }

  const nextCross = () => {
    const next = crossIdx + 1
    if (next >= cfg.crosses.length) {
      setAllDone(true)
      setTimeout(onWin, 600)
    } else {
      setCrossIdx(next)
      setCells([null, null, null, null])
      setErrors([false, false, false, false])
      setPicking(null)
      setCrossDone(false)
    }
  }

  const CELL = 60

  return (
    <div className="flex flex-col gap-4 p-4 bg-slate-950 rounded-xl select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-emerald-400 font-bold text-sm tracking-wide">{cfg.title}</span>
        <span className="text-slate-500 text-xs">Cross {crossIdx + 1}/{cfg.crosses.length}</span>
      </div>

      <p className="text-slate-400 text-xs">{cross.traitLabel}</p>

      {/* Punnett square */}
      <div className="flex justify-center">
        <div className="relative" style={{ width: CELL * 2 + 48, height: CELL * 2 + 48 }}>
          {/* Parent 1 alleles — top */}
          {cross.parent1.map((a, c) => (
            <div key={c}
              className="absolute flex items-center justify-center font-bold text-sm text-amber-400"
              style={{ left: 48 + c * CELL, top: 0, width: CELL, height: 40 }}>
              {a}
            </div>
          ))}
          {/* Parent 2 alleles — left */}
          {cross.parent2.map((a, r) => (
            <div key={r}
              className="absolute flex items-center justify-center font-bold text-sm text-indigo-400"
              style={{ left: 0, top: 40 + r * CELL, width: 48, height: CELL }}>
              {a}
            </div>
          ))}
          {/* Grid cells */}
          {[0, 1, 2, 3].map(i => {
            const r = Math.floor(i / 2), c = i % 2
            const val = cells[i]
            const correct = val === cellAnswer(cross, r, c)
            const isPicking = picking === i
            const hasError = errors[i]

            return (
              <button key={i}
                onClick={() => { if (!val && !crossDone) { setPicking(i); setErrors(e => { const n=[...e]; n[i]=false; return n }) } }}
                className="absolute flex items-center justify-center font-bold text-sm transition-all"
                style={{
                  left: 48 + c * CELL, top: 40 + r * CELL,
                  width: CELL, height: CELL,
                  background: val
                    ? (correct ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.1)')
                    : isPicking
                    ? 'rgba(245,158,11,0.15)'
                    : hasError
                    ? 'rgba(239,68,68,0.12)'
                    : 'rgba(255,255,255,0.04)',
                  border: `1.5px solid ${val
                    ? (correct ? 'rgba(52,211,153,0.5)' : 'rgba(239,68,68,0.4)')
                    : isPicking
                    ? 'rgba(245,158,11,0.5)'
                    : hasError
                    ? 'rgba(239,68,68,0.4)'
                    : 'rgba(255,255,255,0.1)'}`,
                  color: val ? (correct ? '#6ee7b7' : '#fca5a5') : '#94a3b8',
                  borderRadius: 8,
                }}
              >
                {val ?? (hasError ? '✕' : isPicking ? '?' : '?')}
              </button>
            )
          })}
        </div>
      </div>

      {/* Option picker */}
      {picking !== null && !crossDone && (
        <div className="flex flex-col gap-2">
          <p className="text-slate-500 text-xs text-center">
            Choose the allele pair for this cell:
          </p>
          <div className="flex gap-2 justify-center flex-wrap">
            {options.map(opt => (
              <button key={opt} onClick={() => handlePick(opt)}
                className="px-5 py-2.5 rounded-xl font-bold text-sm border transition-all
                           bg-white/[0.06] border-white/10 text-slate-200
                           hover:bg-amber-500/15 hover:border-amber-500/40 hover:text-amber-300">
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {picking === null && !crossDone && (
        <p className="text-slate-600 text-xs text-center">Tap a cell to fill it in</p>
      )}

      {/* Phenotype ratio after cross complete */}
      {crossDone && (
        <div className="flex flex-col gap-3">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
            <p className="text-emerald-300 text-sm font-bold text-center mb-2">
              {ratio.recessive === 0
                ? `All offspring: ${cross.dominant}`
                : `${ratio.dominant}:${ratio.recessive} — ${cross.dominant} : ${cross.recessive}`}
            </p>
            <div className="flex gap-1 h-4 rounded-full overflow-hidden">
              {Array.from({ length: ratio.dominant }).map((_, i) => (
                <div key={'d'+i} className="flex-1 bg-emerald-500/70 rounded-full" />
              ))}
              {Array.from({ length: ratio.recessive }).map((_, i) => (
                <div key={'r'+i} className="flex-1 bg-slate-600 rounded-full" />
              ))}
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-emerald-400">{cross.dominant} ({ratio.dominant})</span>
              {ratio.recessive > 0 && <span className="text-slate-500">{cross.recessive} ({ratio.recessive})</span>}
            </div>
          </div>

          {crossIdx + 1 < cfg.crosses.length ? (
            <button onClick={nextCross}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-all">
              Next Cross →
            </button>
          ) : (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-slate-400 leading-relaxed">
              {cfg.fact}
            </div>
          )}
        </div>
      )}

      {allDone && (
        <p className="text-emerald-400 text-xs text-center font-semibold">All crosses complete!</p>
      )}
    </div>
  )
}
