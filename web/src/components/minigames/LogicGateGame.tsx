import { useEffect, useMemo, useRef, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { artCover, type GameArtKey } from '@/games/art'
import { hashString, mulberry32, resolveConfig, scale, shuffle, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar, type Rng } from './_shared'

// Logic gates: build circuits that match a truth table.  A challenge is a
// short run of stages that build on each other — the config's own warm-up
// circuit, then half adders, full adders, multiplexers, comparators and a
// two-bit adder on a small canvas of inputs, gate slots in layers, and one
// or more outputs.  Tap a slot to pick its gate (AND/OR/XOR/NAND/NOR/NOT);
// toggle the inputs and the wires light up live.  "Check" tests the whole
// truth table.  At the top tier the Turing challenge ends at a tape machine.
//
// Every stage's table comes from a reference wiring of the same slots, so it
// is always solvable; any wiring that matches the table is accepted.
// Difficulty: bigger circuits, more open slots, more outputs, fewer wrong
// checks and (from tier 3) a clock.

export type Gate = 'AND' | 'OR' | 'XOR' | 'NAND' | 'NOR' | 'NOT'
export const GATES: Gate[] = ['AND', 'OR', 'XOR', 'NAND', 'NOR', 'NOT']

export const apply = (g: Gate, a: number, b: number) => {
  switch (g) {
    case 'AND': return a & b
    case 'OR': return a | b
    case 'XOR': return a ^ b
    case 'NAND': return 1 - (a & b)
    case 'NOR': return 1 - (a | b)
    case 'NOT': return 1 - a
  }
}

interface TapeRule { name: string; run: (tape: number[]) => number[] }
export const TAPE_RULES: TapeRule[] = [
  { name: 'Flip every cell',          run: t => t.map(v => 1 - v) },
  { name: 'Shift right, pad with 0',  run: t => [0, ...t.slice(0, -1)] },
  { name: 'Keep only the first 1',    run: t => { let seen = false; return t.map(v => { if (v && !seen) { seen = true; return 1 } return 0 }) } },
  { name: 'Flip cells after a 1',     run: t => { let flip = false; return t.map(v => { const out = flip ? 1 - v : v; if (v === 1) flip = !flip; return out }) } },
  { name: 'Count 1s in binary',       run: t => { const n = t.filter(Boolean).length; return t.map((_, i) => (n >> (t.length - 1 - i)) & 1) } },
  { name: 'Reverse the tape',         run: t => [...t].reverse() },
]

interface LogicConfig {
  title: string
  intro: string
  /** Warm-up target over inputs A, B, C for the g1(A,B) → g2(·,C) circuit. */
  target: (a: number, b: number, c: number) => number
  description: string
  fact: string
  art?: GameArtKey
}

export const CONFIGS: Record<string, LogicConfig> = {
  'boole-laws': {
    title: 'The Laws of Thought',
    intro: 'George Boole reduced reasoning to algebra on 0 and 1. Choose gates so the circuit agrees with the table on every row.',
    target: (a, b, c) => (a & b) | c,
    description: 'Output is 1 when both A and B are on, or whenever C is on.',
    fact: "Boole's The Laws of Thought (1854) treated logic as algebra where x·x = x. Eighty years later Claude Shannon's master's thesis showed that relay circuits obey the same algebra — the founding insight of digital design.",
    art: 'logic_boole',
  },
  'shannon-relays': {
    title: 'Relays and Switches',
    intro: "Shannon showed a switching circuit is a Boolean expression. Build the circuit that matches the table.",
    target: (a, b, c) => (a ^ b) & c,
    description: 'Output is 1 only when exactly one of A and B is on, and C is on.',
    fact: 'Claude Shannon\'s 1937 thesis, "A Symbolic Analysis of Relay and Switching Circuits", has been called the most important master\'s thesis of the century. He later founded information theory and built a juggling machine.',
    art: 'logic_shannon',
  },
  'turing-tape': {
    title: 'The Universal Machine',
    intro: 'A Turing machine reads a tape and rewrites it by rule. Wire the circuits, then find the rule that turns the input into the target.',
    target: (a, b, c) => 1 - (a | b) | c,
    description: 'Output is 1 when neither A nor B is on, or when C is on.',
    fact: "Alan Turing's 1936 paper defined a machine reading symbols from an endless tape and proved that one universal machine could imitate any other — the theoretical blueprint of every computer since.",
    art: 'logic_turing',
  },
  'lovelace-engine': {
    title: 'Notes on the Analytical Engine',
    intro: 'Ada Lovelace saw that Babbage\'s engine could weave patterns of logic as the Jacquard loom wove flowers. Wire the gates to match.',
    target: (a, b, c) => (a | b) ^ c,
    description: 'Output is 1 when A or B is on while C is off — or when C is on while both A and B are off.',
    fact: 'Ada Lovelace\'s 1843 notes include a method for computing Bernoulli numbers on the Analytical Engine, often called the first computer program, and the observation that the machine might one day compose music.',
    art: 'logic_lovelace',
  },
  'imac-logic': {
    title: 'Inside the iMac',
    intro: 'Beige box or translucent teardrop, every computer comes down to logic gates. Choose gates so the circuit agrees with the table on every row.',
    target: (a, b, c) => (a | b) & c,
    description: 'Output is 1 when A or B is on, and C is on.',
    fact: 'The first iMac of 1998 ran on a 233 MHz PowerPC G3 processor — some six million transistors, each one a switch wired into logic gates like these.',
    art: 'logic_shannon',
  },
  'louis-locksmith': {
    title: "The King's Lock",
    intro: 'Louis XVI’s happiest hours were spent at his locksmith’s bench. A lever lock’s bolt moves only when its levers are set just so: choose gates so the mechanism agrees with the table on every row.',
    target: (a, b, c) => a & b & c,
    description: 'The bolt draws (1) only when levers A, B and C are all lifted.',
    fact: 'In 1778 Robert Barron patented the double-acting lever tumbler lock in London: the bolt moves only when every lever is lifted to exactly the right height, no more and no less.',
  },
}

// ── The classic two-gate warm-up ─────────────────────────────────────────────

export const ROWS: [number, number, number][] = [[0,0,0],[0,0,1],[0,1,0],[0,1,1],[1,0,0],[1,0,1],[1,1,0],[1,1,1]]

/** Circuit output for a gate pair: g1(A, B) → g2(g1, C). */
export const circuitOut = (g1: Gate, g2: Gate, a: number, b: number, c: number) => apply(g2, apply(g1, a, b), c)

/** Rows of the truth table a gate pair gets right against the target. */
export function matchingRows(target: LogicConfig['target'], g1: Gate, g2: Gate): number {
  return ROWS.filter(([a, b, c]) => circuitOut(g1, g2, a, b, c) === target(a, b, c)).length
}

// ── Circuits ─────────────────────────────────────────────────────────────────

/** A gate slot: fixed wiring from two sources (inputs or earlier slots); NOT reads only `a`. */
export interface SlotDef { id: string; layer: number; a: string; b: string; answer: Gate }
export interface BuildDef {
  key: string
  name: string
  blurb: string
  inputs: string[]
  /** In evaluation order (by layer). */
  slots: SlotDef[]
  outputs: { label: string; src: string }[]
}

const slot = (id: string, layer: number, a: string, b: string, answer: Gate): SlotDef => ({ id, layer, a, b, answer })

export function classicBuild(cfg: LogicConfig): BuildDef {
  let pair: [Gate, Gate] = ['AND', 'OR']
  outer: for (const g1 of GATES) for (const g2 of GATES) if (matchingRows(cfg.target, g1, g2) === ROWS.length) { pair = [g1, g2]; break outer }
  return {
    key: 'classic', name: 'Warm-up circuit', blurb: cfg.description, inputs: ['A', 'B', 'C'],
    slots: [slot('g1', 1, 'A', 'B', pair[0]), slot('g2', 2, 'g1', 'C', pair[1])],
    outputs: [{ label: 'OUT', src: 'g2' }],
  }
}

/** Three slots over three inputs with a seeded hidden wiring that uses every input. */
export function randomBuild(rng: Rng): BuildDef {
  const second = rng() < 0.5 ? ['B', 'C'] : ['A', 'C']
  for (let tries = 0; ; tries++) {
    const gs = [0, 1, 2].map(() => GATES[Math.floor(rng() * GATES.length)])
    const b: BuildDef = {
      key: 'random', name: 'Mystery circuit', blurb: 'An unknown wiring — read the table and reconstruct it.', inputs: ['A', 'B', 'C'],
      slots: [slot('p', 1, 'A', 'B', gs[0]), slot('q', 1, second[0], second[1], gs[1]), slot('r', 2, 'p', 'q', gs[2])],
      outputs: [{ label: 'OUT', src: 'r' }],
    }
    const table = truthTable(b, answerOf(b))
    const col = table.map(r => r[0])
    // Not constant, and flipping each input changes the output somewhere.
    const uses = b.inputs.every((_, k) => table.some((_, i) => col[i] !== col[i ^ (1 << (b.inputs.length - 1 - k))]))
    if ((new Set(col).size === 2 && uses) || tries > 200) return b
  }
}

export const BUILDS: Record<string, BuildDef> = {
  halfAdder: {
    key: 'halfAdder', name: 'Half adder', blurb: 'Add two bits: SUM is 1 when exactly one is on, CARRY when both are.',
    inputs: ['A', 'B'],
    slots: [slot('s', 1, 'A', 'B', 'XOR'), slot('c', 1, 'A', 'B', 'AND')],
    outputs: [{ label: 'CARRY', src: 'c' }, { label: 'SUM', src: 's' }],
  },
  fullAdder: {
    key: 'fullAdder', name: 'Full adder', blurb: 'Add A + B + carry-in: two half adders, with their carries joined.',
    inputs: ['A', 'B', 'Cin'],
    slots: [
      slot('x1', 1, 'A', 'B', 'XOR'), slot('a1', 1, 'A', 'B', 'AND'),
      slot('s', 2, 'x1', 'Cin', 'XOR'), slot('a2', 2, 'x1', 'Cin', 'AND'),
      slot('co', 3, 'a1', 'a2', 'OR'),
    ],
    outputs: [{ label: 'COUT', src: 'co' }, { label: 'SUM', src: 's' }],
  },
  mux: {
    key: 'mux', name: 'Multiplexer', blurb: 'A selector: OUT copies A when S is 0 and B when S is 1.',
    inputs: ['A', 'B', 'S'],
    slots: [
      slot('n', 1, 'S', 'S', 'NOT'), slot('k', 1, 'B', 'S', 'AND'),
      slot('j', 2, 'A', 'n', 'AND'),
      slot('o', 3, 'j', 'k', 'OR'),
    ],
    outputs: [{ label: 'OUT', src: 'o' }],
  },
  equal2: {
    key: 'equal2', name: '2-bit equality', blurb: 'EQ lights when the two-bit numbers A1A0 and B1B0 are the same.',
    inputs: ['A1', 'A0', 'B1', 'B0'],
    slots: [slot('x1', 1, 'A1', 'B1', 'XOR'), slot('x0', 1, 'A0', 'B0', 'XOR'), slot('eq', 2, 'x1', 'x0', 'NOR')],
    outputs: [{ label: 'EQ', src: 'eq' }],
  },
  comparator: {
    key: 'comparator', name: '2-bit comparator', blurb: 'EQ when A1A0 = B1B0, GT when A1A0 is the larger number.',
    inputs: ['A1', 'A0', 'B1', 'B0'],
    slots: [
      slot('x1', 1, 'A1', 'B1', 'XOR'), slot('x0', 1, 'A0', 'B0', 'XOR'),
      slot('h1', 2, 'A1', 'x1', 'AND'), slot('h0', 2, 'A0', 'x0', 'NAND'), slot('eq', 2, 'x1', 'x0', 'NOR'),
      slot('m', 3, 'x1', 'h0', 'NOR'),
      slot('gt', 4, 'h1', 'm', 'OR'),
    ],
    outputs: [{ label: 'EQ', src: 'eq' }, { label: 'GT', src: 'gt' }],
  },
  adder2: {
    key: 'adder2', name: '2-bit adder', blurb: 'Add A1A0 + B1B0 into a three-bit answer C S1 S0 — the engine of every calculator.',
    inputs: ['A1', 'A0', 'B1', 'B0'],
    slots: [
      slot('s0', 1, 'A0', 'B0', 'XOR'), slot('c0', 1, 'A0', 'B0', 'AND'), slot('x1', 1, 'A1', 'B1', 'XOR'), slot('g1', 1, 'A1', 'B1', 'AND'),
      slot('s1', 2, 'x1', 'c0', 'XOR'), slot('p', 2, 'x1', 'c0', 'AND'),
      slot('c', 3, 'g1', 'p', 'OR'),
    ],
    outputs: [{ label: 'C', src: 'c' }, { label: 'S1', src: 's1' }, { label: 'S0', src: 's0' }],
  },
}

export type Assignment = Record<string, Gate>
export const answerOf = (b: BuildDef): Assignment => Object.fromEntries(b.slots.map(s => [s.id, s.answer]))

/** Every slot's value for one input row (bits in `inputs` order). */
export function evaluate(b: BuildDef, gates: Assignment, bits: number[]): Record<string, number> {
  const v: Record<string, number> = {}
  b.inputs.forEach((name, i) => { v[name] = bits[i] })
  for (const s of b.slots) v[s.id] = apply(gates[s.id], v[s.a], v[s.b])
  return v
}

export const inputRows = (n: number) => Array.from({ length: 1 << n }, (_, r) => Array.from({ length: n }, (_, k) => (r >> (n - 1 - k)) & 1))

/** Outputs per row of the truth table. */
export function truthTable(b: BuildDef, gates: Assignment): number[][] {
  return inputRows(b.inputs.length).map(bits => { const v = evaluate(b, gates, bits); return b.outputs.map(o => v[o.src]) })
}

export const rowsMatching = (target: number[][], got: number[][]) => target.filter((row, i) => row.join() === got[i].join()).length

// ── Stages ───────────────────────────────────────────────────────────────────

export type Stage =
  | { kind: 'circuit'; build: BuildDef; locked: string[]; start: Assignment; target: number[][] }
  | { kind: 'tape' }

/** Which builds each config plays, per difficulty. */
export const PLANS: Record<string, [string[], string[], string[], string[]]> = {
  'boole-laws':      [['classic', 'random'], ['classic', 'random', 'mux'], ['classic', 'mux', 'fullAdder'], ['mux', 'fullAdder', 'comparator']],
  'shannon-relays':  [['classic', 'random'], ['classic', 'halfAdder', 'fullAdder'], ['halfAdder', 'fullAdder', 'adder2'], ['fullAdder', 'adder2', 'comparator']],
  'turing-tape':     [['classic', 'random'], ['classic', 'random', 'equal2'], ['classic', 'equal2', 'comparator'], ['comparator', 'adder2', 'tape']],
  'lovelace-engine': [['classic', 'random'], ['classic', 'halfAdder', 'random'], ['halfAdder', 'fullAdder', 'mux'], ['fullAdder', 'mux', 'adder2']],
  'louis-locksmith': [['classic', 'random'], ['classic', 'random', 'mux'], ['classic', 'mux', 'equal2'], ['mux', 'equal2', 'comparator']],
  'imac-logic':      [['classic', 'random'], ['classic', 'halfAdder', 'random'], ['halfAdder', 'fullAdder', 'adder2'], ['fullAdder', 'adder2', 'comparator']],
}

/** Most slots the player has to choose per stage; the rest are locked to the reference gate. */
export const OPEN_SLOTS = (d: Difficulty) => scale(d, [3, 3, 4, 4])
/** Wrong checks allowed over the whole challenge. */
export const MAX_CHECKS = (d: Difficulty) => scale(d, [5, 4, 4, 3])
export const TIME_LIMIT = (d: Difficulty) => scale(d, [0, 0, 300, 240])

export const solves = (st: Extract<Stage, { kind: 'circuit' }>, gates: Assignment) =>
  rowsMatching(st.target, truthTable(st.build, gates)) === st.target.length

export function makeStages(configId: string, cfg: LogicConfig, difficulty: Difficulty, seed: number): Stage[] {
  const rng = mulberry32((seed ^ hashString(configId)) >>> 0)
  const plan = (PLANS[configId] ?? PLANS['boole-laws'])[difficulty - 1]
  return plan.map((key): Stage => {
    if (key === 'tape') return { kind: 'tape' }
    const build = key === 'classic' ? classicBuild(cfg) : key === 'random' ? randomBuild(rng) : BUILDS[key]
    const answer = answerOf(build)
    const target = truthTable(build, answer)
    const lockCount = Math.max(0, build.slots.length - OPEN_SLOTS(difficulty))
    const locked = shuffle(build.slots.map(s => s.id), rng).slice(0, lockCount)
    const open = build.slots.map(s => s.id).filter(id => !locked.includes(id))
    const st = { kind: 'circuit' as const, build, locked, start: { ...answer }, target }
    // A seeded, unsolved starting wiring for the open slots.
    for (let tries = 0; tries < 60; tries++) {
      const start = { ...answer }
      for (const id of open) start[id] = GATES[Math.floor(rng() * GATES.length)]
      if (!solves(st, start)) { st.start = start; return st }
    }
    // Fallback: the first unsolved single-slot change.
    for (const id of open) for (const g of GATES) {
      const start = { ...answer, [id]: g }
      if (!solves(st, start)) { st.start = start; return st }
    }
    return st
  })
}

/** Brute force: every wiring of the open slots that matches the table (for the audit). */
export function solutions(st: Extract<Stage, { kind: 'circuit' }>, limit = Infinity): Assignment[] {
  const open = st.build.slots.map(s => s.id).filter(id => !st.locked.includes(id))
  const out: Assignment[] = []
  const gates = { ...answerOf(st.build) }
  const rec = (k: number) => {
    if (out.length >= limit) return
    if (k === open.length) { if (solves(st, gates)) out.push({ ...gates }); return }
    for (const g of GATES) { gates[open[k]] = g; rec(k + 1) }
  }
  rec(0)
  return out
}

// ── Game ─────────────────────────────────────────────────────────────────────

export default function LogicGateGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'boole-laws')
  const stages = useMemo(() => makeStages(configId, cfg, difficulty, seed), [configId, cfg, difficulty, seed])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })
  const timer = useGameTimer({ seconds: TIME_LIMIT(difficulty), running: !settled, onExpire: () => lose('out of time') })
  const maxChecks = MAX_CHECKS(difficulty)
  const [checks, setChecks] = useState(0)
  const [index, setIndex] = useState(0)
  const [flash, setFlash] = useState<string | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const fail = () => {
    const n = checks + 1
    setChecks(n)
    if (n >= maxChecks) lose('the circuit never matched')
  }
  const pass = () => {
    if (index + 1 >= stages.length) { win(); return }
    setFlash(`Stage ${index + 1} complete!`)
    timers.current.push(setTimeout(() => { setFlash(null); setIndex(i => i + 1) }, 900))
  }

  const stage = stages[index]
  const art = cfg.art ?? 'logic_boole'

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      <div className="relative overflow-hidden rounded-xl border border-line bg-panel" style={artCover(art)}>
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/30" />
        <div className="relative px-3 py-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-200/90">{cfg.title}</p>
            <p className="text-white/85 text-[11px] leading-snug">{cfg.intro}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex gap-1" aria-label={`stage ${index + 1} of ${stages.length}`}>
              {stages.map((_, i) => (
                <span key={i} className={`w-2.5 h-2.5 rounded-full border border-white/70 ${i < index || (i === index && outcome === 'won') ? 'bg-emerald-400' : i === index ? 'bg-amber-300' : 'bg-white/10'}`} />
              ))}
            </div>
            <p className={`text-[10px] ${checks ? 'text-red-300 font-bold' : 'text-white/70'}`}>✗ {checks} / {maxChecks}</p>
          </div>
        </div>
      </div>
      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}

      {flash && <p className="text-center text-sm font-bold text-emerald-700 bg-emerald-500/10 border border-emerald-500/30 rounded-xl py-2">{flash}</p>}

      {stage.kind === 'tape'
        ? <TapeMachine key={index} seed={seed} disabled={settled || !!flash} onDone={pass} onFail={fail} />
        : <Circuit key={index} stage={stage} number={index + 1} showBlurb={difficulty <= 2} disabled={settled || !!flash} onDone={pass} onFail={fail} />}

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Every circuit agrees on every row!" loseTitle="The logic does not hold" />
    </div>
  )
}

// ── Circuit canvas ───────────────────────────────────────────────────────────

const W = 360
const SLOT_W = 50, SLOT_H = 34

function Circuit({ stage, number, showBlurb, disabled, onDone, onFail }: {
  stage: Extract<Stage, { kind: 'circuit' }>; number: number; showBlurb: boolean; disabled: boolean; onDone: () => void; onFail: () => void
}) {
  const { build, locked, target } = stage
  const [gates, setGates] = useState<Assignment>(stage.start)
  const [bits, setBits] = useState<number[]>(() => build.inputs.map(() => 0))
  const [selected, setSelected] = useState<string | null>(null)
  const values = evaluate(build, gates, bits)
  const table = truthTable(build, gates)
  const agree = rowsMatching(target, table)
  const rowIndex = bits.reduce((n, b) => n * 2 + b, 0)

  // Layout: inputs, one column per layer, outputs.
  const maxLayer = Math.max(...build.slots.map(s => s.layer))
  const cols = maxLayer + 2
  const colX = (k: number) => 26 + (k * (W - 52)) / (cols - 1)
  const layerSlots = (l: number) => build.slots.filter(s => s.layer === l)
  const counts = [build.inputs.length, ...Array.from({ length: maxLayer }, (_, l) => layerSlots(l + 1).length), build.outputs.length]
  const H = Math.max(...counts) * 58 + 24
  const yAt = (i: number, n: number) => 8 + ((H - 16) * (i + 0.5)) / n
  const pos: Record<string, { x: number; y: number; kind: 'in' | 'slot' }> = {}
  build.inputs.forEach((name, i) => { pos[name] = { x: colX(0), y: yAt(i, build.inputs.length), kind: 'in' } })
  for (let l = 1; l <= maxLayer; l++) layerSlots(l).forEach((s, i, arr) => { pos[s.id] = { x: colX(l), y: yAt(i, arr.length), kind: 'slot' } })
  const outPos = build.outputs.map((o, i) => ({ ...o, x: colX(cols - 1), y: yAt(i, build.outputs.length) }))
  const portOut = (src: string) => { const p = pos[src]; return { x: p.x + (p.kind === 'in' ? 13 : SLOT_W / 2), y: p.y } }
  const wire = (x1: number, y1: number, x2: number, y2: number) => { const dx = Math.max(18, (x2 - x1) / 2); return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` }

  const cycle = (id: string) => {
    if (disabled || locked.includes(id)) return
    if (selected !== id) { setSelected(id); return }
    setGates(g => ({ ...g, [id]: GATES[(GATES.indexOf(g[id]) + 1) % GATES.length] }))
  }
  const setGate = (g: Gate) => { if (!disabled && selected && !locked.includes(selected)) setGates(cur => ({ ...cur, [selected]: g })) }
  const check = () => {
    if (disabled) return
    if (agree === target.length) onDone(); else onFail()
  }

  const wires: { d: string; on: boolean; dim: boolean; key: string }[] = []
  for (const s of build.slots) {
    const p = pos[s.id]
    const isNot = gates[s.id] === 'NOT'
    const ins = s.a === s.b ? [s.a] : [s.a, s.b]
    ins.forEach((src, k) => {
      const from = portOut(src)
      const toY = ins.length === 1 ? p.y : p.y + (k === 0 ? -9 : 9)
      wires.push({ key: `${s.id}${k}`, d: wire(from.x, from.y, p.x - SLOT_W / 2, toY), on: values[src] === 1 && !(isNot && k === 1), dim: isNot && k === 1 })
    })
  }
  for (const o of outPos) { const from = portOut(o.src); wires.push({ key: `o${o.label}`, d: wire(from.x, from.y, o.x - 12, o.y), on: values[o.src] === 1, dim: false }) }
  const wantNow = target[rowIndex]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-ink text-sm font-bold">Stage {number}: {build.name}</p>
        <p className="text-[10px] text-muted shrink-0">{build.inputs.length} in · {build.slots.length} gates · {build.outputs.length} out</p>
      </div>
      {showBlurb && <p className="text-ink-2 text-xs bg-panel border border-line rounded-xl px-3 py-2">{build.blurb}</p>}

      {/* Capped so the circuit keeps a phone-sized scale on wide screens. */}
      <div className="rounded-xl border border-line bg-panel overflow-hidden w-full max-w-[520px] mx-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={`${build.name} circuit`}>
          {wires.map(w => (
            <path key={w.key} d={w.d} fill="none" stroke="currentColor"
              className={w.on ? 'text-accent' : 'text-muted'} strokeWidth={w.on ? 3 : 2} strokeOpacity={w.dim ? 0.15 : w.on ? 1 : 0.45}
              strokeDasharray={w.dim ? '3 4' : undefined} />
          ))}
          {build.inputs.map((name, i) => {
            const p = pos[name]
            const on = bits[i] === 1
            return (
              <g key={name} onClick={() => !disabled && setBits(b => b.map((v, k) => (k === i ? 1 - v : v)))} className="cursor-pointer" role="button" aria-label={`input ${name} is ${bits[i]}`}>
                <circle cx={p.x} cy={p.y} r={13} stroke="currentColor" strokeWidth={2} className={on ? 'text-accent fill-current' : 'text-line fill-transparent'} />
                <circle cx={p.x} cy={p.y} r={13} fill="none" stroke="currentColor" strokeWidth={2} className="text-accent" />
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="currentColor" className={on ? 'text-accent-fg' : 'text-ink'}>{bits[i]}</text>
                <text x={p.x} y={p.y - 17} textAnchor="middle" fontSize={10} fontWeight={700} fill="currentColor" className="text-muted">{name}</text>
              </g>
            )
          })}
          {build.slots.map(s => {
            const p = pos[s.id]
            const isLocked = locked.includes(s.id)
            const isSel = selected === s.id
            const on = values[s.id] === 1
            return (
              <g key={s.id} onClick={() => cycle(s.id)} className={isLocked ? '' : 'cursor-pointer'} role="button" aria-label={`gate ${s.id}: ${gates[s.id]}${isLocked ? ' (locked)' : ''}`}>
                <rect x={p.x - SLOT_W / 2} y={p.y - SLOT_H / 2} width={SLOT_W} height={SLOT_H} rx={7}
                  fill="currentColor" className={isLocked ? 'text-paper-2' : 'text-paper'} />
                <rect x={p.x - SLOT_W / 2} y={p.y - SLOT_H / 2} width={SLOT_W} height={SLOT_H} rx={7} fill="none"
                  stroke="currentColor" strokeWidth={isSel ? 3 : 1.5} strokeDasharray={isLocked ? '4 3' : undefined}
                  className={isSel ? 'text-accent' : 'text-ink-2'} />
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="currentColor" className="text-ink">{gates[s.id]}</text>
                {isLocked && <text x={p.x + SLOT_W / 2 - 3} y={p.y - SLOT_H / 2 + 9} textAnchor="end" fontSize={8} fill="currentColor" className="text-muted">lock</text>}
                <circle cx={p.x + SLOT_W / 2} cy={p.y} r={3.5} fill="currentColor" className={on ? 'text-accent' : 'text-line'} />
              </g>
            )
          })}
          {outPos.map((o, i) => {
            const v = values[o.src]
            const want = wantNow[i]
            return (
              <g key={o.label}>
                <circle cx={o.x} cy={o.y} r={12} fill="currentColor" className={v ? 'text-amber-400' : 'text-paper-2'} />
                <circle cx={o.x} cy={o.y} r={12} fill="none" strokeWidth={2.5} stroke="currentColor" className={v === want ? 'text-emerald-600' : 'text-red-600'} />
                <text x={o.x} y={o.y + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="currentColor" className="text-ink">{v}</text>
                <text x={o.x} y={o.y - 16} textAnchor="middle" fontSize={9} fontWeight={700} fill="currentColor" className="text-muted">{o.label}</text>
                <text x={o.x} y={o.y + 24} textAnchor="middle" fontSize={8} fill="currentColor" className="text-muted">want {want}</text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] text-muted mr-1">{selected ? (locked.includes(selected) ? 'locked' : `gate ${selected}:`) : 'tap a gate'}</span>
        {GATES.map(g => (
          <button key={g} disabled={disabled || !selected} onClick={() => setGate(g)}
            className={`px-2 py-1 rounded-md border text-[10px] font-bold transition-all disabled:opacity-40 ${selected && gates[selected] === g ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink-2 hover:border-accent/40'}`}>
            {g}
          </button>
        ))}
      </div>

      <TruthTable build={build} target={target} got={table} current={rowIndex} onPick={r => !disabled && setBits(inputRows(build.inputs.length)[r])} />

      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted">Tap a row to try it · {agree} / {target.length} rows agree</p>
        <button disabled={disabled} onClick={check} className="px-4 py-2 rounded-xl bg-accent text-accent-fg text-xs font-bold hover:bg-accent-hover disabled:opacity-50">Check circuit</button>
      </div>
    </div>
  )
}

function TruthTable({ build, target, got, current, onPick }: { build: BuildDef; target: number[][]; got: number[][]; current: number; onPick: (row: number) => void }) {
  const rows = inputRows(build.inputs.length)
  const perLine = rows.length >= 8 ? 8 : rows.length
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[9px] text-muted font-mono">{build.inputs.join(' ')} · want {build.outputs.map(o => o.label).join(' ')} · yours</p>
      <div className="grid gap-1 text-center font-mono" style={{ gridTemplateColumns: `repeat(${perLine}, minmax(0, 1fr))` }}>
        {rows.map((bits, i) => {
          const ok = target[i].join() === got[i].join()
          return (
            <button key={i} onClick={() => onPick(i)}
              className={`rounded-md border py-0.5 text-[10px] leading-tight ${ok ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-red-500/10 border-red-500/30'} ${i === current ? 'ring-2 ring-accent' : ''}`}>
              <div className="text-muted">{bits.join('')}</div>
              <div className="font-bold text-ink">{target[i].join('')}</div>
              <div className={ok ? 'text-emerald-700' : 'text-red-700'}>{got[i].join('')}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Tape machine (Turing finale) ─────────────────────────────────────────────

export function tapeFor(seed: number) {
  const rng = mulberry32(seed)
  const tape = Array.from({ length: 7 }, () => (rng() < 0.5 ? 0 : 1))
  const rule = TAPE_RULES[Math.floor(rng() * TAPE_RULES.length)]
  return { tape, rule }
}

function TapeMachine({ seed, disabled, onDone, onFail }: { seed: number; disabled: boolean; onDone: () => void; onFail: () => void }) {
  const { tape, rule } = useMemo(() => tapeFor(seed), [seed])
  const options = TAPE_RULES
  const targetTape = rule.run(tape)
  const [picked, setPicked] = useState<number | null>(null)
  const preview = picked !== null ? options[picked].run(tape) : null

  const check = () => {
    if (disabled || picked === null) return
    // Judge by what the rule does, not its name: several rules can agree on one tape.
    if (options[picked].run(tape).join() === targetTape.join()) onDone(); else onFail()
  }
  const Tape = ({ cells, label, tone }: { cells: number[]; label: string; tone: string }) => (
    <div className="flex items-center gap-2">
      <span className="w-14 text-[10px] text-muted uppercase tracking-widest">{label}</span>
      <div className="flex gap-1">{cells.map((v, i) => <span key={i} className={`w-7 h-7 flex items-center justify-center rounded border font-mono text-sm ${tone} ${v ? 'font-bold' : 'opacity-60'}`}>{v}</span>)}</div>
    </div>
  )
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink text-sm font-bold">Final stage: the tape machine</p>
      <Tape cells={tape} label="input" tone="bg-panel border-line text-ink" />
      <Tape cells={targetTape} label="target" tone="bg-accent/10 border-accent/40 text-accent" />
      {preview && <Tape cells={preview} label="yours" tone={preview.join() === targetTape.join() ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700' : 'bg-red-500/10 border-red-500/30 text-red-700'} />}
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((o, i) => (
          <button key={o.name} disabled={disabled} onClick={() => setPicked(i)}
            className={`text-left px-3 py-2 rounded-xl border text-xs transition-all ${picked === i ? 'bg-accent/15 border-accent text-accent' : 'bg-panel border-line text-ink-2 hover:border-accent/40'}`}>
            {o.name}
          </button>
        ))}
      </div>
      <button disabled={disabled || picked === null} onClick={check} className="py-2 rounded-xl bg-accent text-accent-fg text-xs font-bold hover:bg-accent-hover disabled:opacity-50">Run the machine</button>
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
