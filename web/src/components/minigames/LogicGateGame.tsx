import { useMemo, useState } from 'react'
import type { MinigameProps } from '@/games/types'
import { mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar } from './_shared'

// Logic gate: build a circuit that matches a truth table.  The player picks
// a gate for each slot of a small fixed network (two inputs → gate → gate →
// output); the live truth table shows which rows already agree.
// At the top tier the puzzle becomes a one-tape machine: choose the rule
// that turns the input tape into the target tape.
//
// Difficulty: more rows must match, fewer wrong checks allowed, and a clock.

type Gate = 'AND' | 'OR' | 'XOR' | 'NAND' | 'NOR' | 'NOT'
const GATES: Gate[] = ['AND', 'OR', 'XOR', 'NAND', 'NOR', 'NOT']

const apply = (g: Gate, a: number, b: number) => {
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
const TAPE_RULES: TapeRule[] = [
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
  /** Target expression over inputs A, B, C as a function; the player must build an equivalent circuit. */
  target: (a: number, b: number, c: number) => number
  description: string
  fact: string
}

const CONFIGS: Record<string, LogicConfig> = {
  'boole-laws': {
    title: 'The Laws of Thought',
    intro: 'George Boole reduced reasoning to algebra on 0 and 1. Choose gates so the circuit agrees with the table on every row.',
    target: (a, b, c) => (a & b) | c,
    description: 'Output is 1 when both A and B are on, or whenever C is on.',
    fact: "Boole's The Laws of Thought (1854) treated logic as algebra where x·x = x. Eighty years later Claude Shannon's master's thesis showed that relay circuits obey the same algebra — the founding insight of digital design.",
  },
  'shannon-relays': {
    title: 'Relays and Switches',
    intro: "Shannon showed a switching circuit is a Boolean expression. Build the circuit that matches the table.",
    target: (a, b, c) => (a ^ b) & c,
    description: 'Output is 1 only when exactly one of A and B is on, and C is on.',
    fact: 'Claude Shannon\'s 1937 thesis, "A Symbolic Analysis of Relay and Switching Circuits", has been called the most important master\'s thesis of the century. He later founded information theory and built a juggling machine.',
  },
  'turing-tape': {
    title: 'The Universal Machine',
    intro: 'A Turing machine reads a tape and rewrites it by rule. Find the rule that turns the input into the target.',
    target: (a, b, c) => 1 - (a | b) | c,
    description: 'Output is 1 when neither A nor B is on, or when C is on.',
    fact: "Alan Turing's 1936 paper defined a machine reading symbols from an endless tape and proved that one universal machine could imitate any other — the theoretical blueprint of every computer since.",
  },
  'lovelace-engine': {
    title: 'Notes on the Analytical Engine',
    intro: 'Ada Lovelace saw that Babbage\'s engine could weave patterns of logic as the Jacquard loom wove flowers. Wire the gates to match.',
    target: (a, b, c) => (a | b) & (1 - c),
    description: 'Output is 1 when A or B is on, but only while C is off.',
    fact: 'Ada Lovelace\'s 1843 notes include a method for computing Bernoulli numbers on the Analytical Engine, often called the first computer program, and the observation that the machine might one day compose music.',
  },
}

const ROWS: [number, number, number][] = [[0,0,0],[0,0,1],[0,1,0],[0,1,1],[1,0,0],[1,0,1],[1,1,0],[1,1,1]]

export default function LogicGateGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'boole-laws')
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })
  const timeLimit = scale(difficulty, [0, 0, 150, 120])
  const timer = useGameTimer({ seconds: timeLimit, running: !settled, onExpire: () => lose('out of time') })
  const maxChecks = scale(difficulty, [4, 3, 2, 2])
  const [checks, setChecks] = useState(0)

  const fail = () => {
    const n = checks + 1
    setChecks(n)
    if (n >= maxChecks) lose('the circuit never matched')
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <p className={`shrink-0 text-[10px] ${checks ? 'text-red-600 font-bold' : 'text-muted'}`}>✗ {checks} / {maxChecks}</p>
      </div>
      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}

      {difficulty >= 4
        ? <TapeMachine seed={seed} disabled={settled} onDone={win} onFail={fail} />
        : <Circuit target={cfg.target} description={cfg.description} difficulty={difficulty} disabled={settled} onDone={win} onFail={fail} />}

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="The circuit agrees on every row!" loseTitle="The logic does not hold" />
    </div>
  )
}

// ── Gate circuit ───────────────────────────────────────────────────────────────

function Circuit({ target, description, difficulty, disabled, onDone, onFail }: {
  target: LogicConfig['target']; description: string; difficulty: number; disabled: boolean; onDone: () => void; onFail: () => void
}) {
  // Network: g1(A, B) → g2(g1, C) → output.  Tier 1 shows the description; tier 2+ only the table.
  const [g1, setG1] = useState<Gate>('AND')
  const [g2, setG2] = useState<Gate>('OR')
  const showDescription = difficulty <= 1
  const out = (a: number, b: number, c: number) => apply(g2, apply(g1, a, b), c)
  const matches = ROWS.filter(([a, b, c]) => out(a, b, c) === target(a, b, c)).length

  const check = () => {
    if (disabled) return
    if (matches === ROWS.length) onDone(); else onFail()
  }

  const GateSelect = ({ value, onChange, label }: { value: Gate; onChange: (g: Gate) => void; label: string }) => (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[9px] text-muted uppercase tracking-widest">{label}</span>
      <div className="flex flex-wrap justify-center gap-1 max-w-[150px]">
        {GATES.map(g => (
          <button key={g} disabled={disabled} onClick={() => onChange(g)}
            className={`px-2 py-1 rounded-md border text-[10px] font-bold transition-all ${value === g ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink-2 hover:border-accent/40'}`}>
            {g}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {showDescription && <p className="text-ink text-xs bg-panel border border-line rounded-xl px-3 py-2">{description}</p>}
      <div className="flex items-center justify-center gap-3 text-xs font-mono text-ink">
        <span className="text-muted">A, B →</span>
        <GateSelect label="gate 1" value={g1} onChange={setG1} />
        <span className="text-muted">→ (·, C) →</span>
        <GateSelect label="gate 2" value={g2} onChange={setG2} />
        <span className="text-muted">→ out</span>
      </div>

      <div className="grid grid-cols-8 gap-1 text-center text-[11px] font-mono">
        {ROWS.map(([a, b, c], i) => {
          const want = target(a, b, c), got = out(a, b, c)
          const ok = want === got
          return (
            <div key={i} className={`rounded-lg border py-1 ${ok ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-red-500/10 border-red-500/30'}`}>
              <div className="text-muted">{a}{b}{c}</div>
              <div className="font-bold text-ink">{want}</div>
              <div className={ok ? 'text-emerald-700' : 'text-red-700'}>{got}</div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted">rows: inputs ABC · target · yours — {matches} / 8 agree</p>
        <button disabled={disabled} onClick={check} className="px-4 py-2 rounded-xl bg-accent text-accent-fg text-xs font-bold hover:bg-accent-hover">Check circuit</button>
      </div>
    </div>
  )
}

// ── Tape machine (tier 4) ─────────────────────────────────────────────────────

function TapeMachine({ seed, disabled, onDone, onFail }: { seed: number; disabled: boolean; onDone: () => void; onFail: () => void }) {
  const { tape, rule, options } = useMemo(() => {
    const rng = mulberry32(seed)
    const tape = Array.from({ length: 7 }, () => (rng() < 0.5 ? 0 : 1))
    const rule = TAPE_RULES[Math.floor(rng() * TAPE_RULES.length)]
    return { tape, rule, options: TAPE_RULES }
  }, [seed])
  const targetTape = rule.run(tape)
  const [picked, setPicked] = useState<number | null>(null)
  const preview = picked !== null ? options[picked].run(tape) : null

  const check = () => {
    if (disabled || picked === null) return
    if (options[picked].name === rule.name) onDone(); else onFail()
  }
  const Tape = ({ cells, label, tone }: { cells: number[]; label: string; tone: string }) => (
    <div className="flex items-center gap-2">
      <span className="w-14 text-[10px] text-muted uppercase tracking-widest">{label}</span>
      <div className="flex gap-1">{cells.map((v, i) => <span key={i} className={`w-7 h-7 flex items-center justify-center rounded border font-mono text-sm ${tone} ${v ? 'font-bold' : 'opacity-60'}`}>{v}</span>)}</div>
    </div>
  )
  return (
    <div className="flex flex-col gap-3">
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
