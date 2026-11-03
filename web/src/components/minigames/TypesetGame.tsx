import { useEffect, useMemo, useRef, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { artCover, artTexture, type GameArtKey } from '@/games/art'
import { mulberry32, shuffle, randInt, resolveConfig, scale, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar } from './_shared'

// Typeset: compose a whole forme of movable type, then print it.
//
//   1. Set each line from the type case.  Sorts are mirrored and the
//      composing stick fills right to left, as it did for Gutenberg's men.
//   2. (Trial and up) justify: pad every line out to the measure with em and
//      en quads.  A quad that will not fit spoils ink.
//   3. Ink the forme with the brayer (drag or tap over it) until the coverage
//      meter is full, then pull the bar and lift the printed sheet.
//
// Wrong sorts and overflowing quads cost ink; run dry and the forme is
// spoiled.  Difficulty adds lines, quad thrift, a pied (shuffled) case,
// lowercase decoys, stricter inking and, at the top two tiers, a clock.

interface TypesetConfig {
  title: string
  intro: string
  /** Built-in configs: separate phrases.  Story params: often one phrase in growing prefixes. */
  lines: string[]
  fact: string
  art: GameArtKey
}

export const CONFIGS: Record<string, TypesetConfig> = {
  'gutenberg-bible': {
    title: 'The 42-Line Bible',
    intro: "Compose a forme of Gutenberg's Bible. The sorts are mirrored and the stick fills from the right — then ink it and pull the press.",
    lines: ['IN PRINCIPIO', 'IN PRINCIPIO ERAT', 'IN PRINCIPIO ERAT VERBUM', 'ET VERBUM ERAT APUD DEUM'],
    fact: 'Johannes Gutenberg printed about 180 copies of his Bible around 1455, each needing some 290 distinct sorts of type. A compositor set roughly two pages a day; the whole book took a team two years.',
    art: 'typeset_gutenberg',
  },
  'bi-sheng-clay': {
    title: 'Clay Type',
    intro: 'Bi Sheng fired characters in clay and set them in a wax-filled iron frame. Compose the forme and print it before the wax cools.',
    lines: ['MOVABLE TYPE', 'FIRED CLAY TYPE', 'TYPE SET IN WAX', 'A THOUSAND COPIES A DAY'],
    fact: "Shen Kuo's Dream Pool Essays (1088) describe Bi Sheng's invention of movable type in the 1040s — four centuries before Gutenberg. Clay sorts were set in a frame of resin and wax, printed, then melted free for reuse.",
    art: 'typeset_bisheng',
  },
  'franklin-gazette': {
    title: 'The Pennsylvania Gazette',
    intro: "Young Benjamin Franklin sets tomorrow's front page. Mirrored type, right to left, justified to the measure — and the press waits.",
    lines: ['JOIN OR DIE', 'TIME IS MONEY', 'EARLY TO BED EARLY TO RISE', 'POOR RICHARDS ALMANACK'],
    fact: "Franklin was apprenticed to his brother's print shop at twelve and later owned the Pennsylvania Gazette. His 'Join, or Die' woodcut of 1754 was the first political cartoon printed in an American newspaper.",
    art: 'typeset_franklin',
  },
}

// ── Pure rules (exported for tests) ─────────────────────────────────────────

/** Characters per line of the forme (a letter is an em; a word space an en). */
export const MEASURE = 14

export function typesetRules(d: Difficulty) {
  return {
    lines: scale(d, [1, 2, 3, 4]),
    letterCap: scale(d, [14, 26, 36, 48]),
    justify: d >= 2,
    ink: scale(d, [6, 5, 4, 3]),
    seconds: scale(d, [0, 0, 180, 200]),
    coverage: scale(d, [0.7, 0.8, 0.9, 0.95]),
    showLabels: d <= 2,
    pied: d === 4,
    lowercaseDecoys: d >= 3,
    /** Spare en quads beyond the thriftiest fill. */
    enSlack: scale(d, [9, 6, 4, 2]),
  }
}

/** Keep only sorts the case holds (A–Z and spaces); anything else cannot be set. */
export function settableLine(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Distinct phrases in a config's lines; a line that is a prefix of another is dropped. */
export function formePhrases(lines: readonly unknown[] | undefined): string[] {
  const set = (Array.isArray(lines) ? lines : []).map(l => settableLine(typeof l === 'string' ? l : '')).filter(Boolean)
  const uniq = [...new Set(set)]
  return uniq.filter(p => !uniq.some(q => q !== p && q.startsWith(p)))
}

function wrap(phrase: string, measure: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const w of phrase.split(' ')) {
    if (!cur) cur = w
    else if (cur.length + 1 + w.length <= measure) cur += ' ' + w
    else { out.push(cur); cur = w }
  }
  if (cur) out.push(cur)
  return out
}

/** Split words into exactly n lines (in order), minimising the longest line. */
function balancedSplit(words: string[], n: number): string[] {
  let best: string[] = [words.join(' ')]
  let bestMax = Infinity
  const rec = (start: number, left: number, acc: string[]) => {
    if (left === 1) {
      const lines = [...acc, words.slice(start).join(' ')]
      const max = Math.max(...lines.map(l => l.length))
      if (max < bestMax) { bestMax = max; best = lines }
      return
    }
    for (let end = start + 1; end <= words.length - (left - 1); end++) rec(end, left - 1, [...acc, words.slice(start, end).join(' ')])
  }
  rec(0, Math.max(1, Math.min(n, words.length)), [])
  return best
}

export const lettersIn = (line: string) => line.replace(/ /g, '').length

/**
 * The lines of the forme for a tier.  Phrases are wrapped to the measure;
 * a single short phrase is split across lines when the tier wants more of
 * them; trailing lines are dropped to stay inside the letter budget.
 */
export function buildForme(cfg: Pick<TypesetConfig, 'lines'>, difficulty: Difficulty, fallback: Pick<TypesetConfig, 'lines'> = CONFIGS['gutenberg-bible']): { lines: string[]; measure: number } {
  const rules = typesetRules(difficulty)
  let phrases = formePhrases(cfg.lines)
  if (!phrases.length) phrases = formePhrases(fallback.lines)
  if (!phrases.length) phrases = ['MOVABLE TYPE']
  const words = phrases.join(' ').split(' ')
  const measure = Math.max(MEASURE, ...words.map(w => w.length))
  let lines = phrases.flatMap(p => wrap(p, measure))
  if (lines.length < rules.lines) lines = balancedSplit(lines.join(' ').split(' '), rules.lines)
  lines = lines.slice(0, rules.lines)
  while (lines.length > 1 && lines.reduce((n, l) => n + lettersIn(l), 0) > rules.letterCap) lines.pop()
  return { lines, measure }
}

/** Width of a set line in en units: a letter is an em (2), a word space an en (1). */
export const lineUnits = (line: string) => [...line].reduce((n, c) => n + (c === ' ' ? 1 : 2), 0)
/** En units of quads needed to pad a line out to the measure. */
export const quadUnits = (line: string, measure: number) => Math.max(0, 2 * measure - lineUnits(line))
/** The thriftiest fill: as many em quads as fit, then an en. */
export const thriftyQuads = (units: number) => ({ em: Math.floor(units / 2), en: units % 2 })

/** Quad supply in the lower case for a whole forme. */
export function quadSupply(lines: string[], measure: number, difficulty: Difficulty) {
  const rules = typesetRules(difficulty)
  if (!rules.justify) return { em: 0, en: 0 }
  const fills = lines.map(l => thriftyQuads(quadUnits(l, measure)))
  return { em: fills.reduce((n, f) => n + f.em, 0) + 1, en: fills.reduce((n, f) => n + f.en, 0) + rules.enSlack }
}

/** The upper case as a compositor knew it: J and U came late and sit after Z. */
export const UPPER_CASE_LAYOUT = 'ABCDEFGHIKLMNOPQRSTVWXYZJU'.split('')
const LOWER_DECOYS = ['a', 'b', 'd', 'e', 'n', 'o', 'p', 'q', 's', 'u', 'x', 'z']

export interface CaseCompartment { ch: string; count: number }

/** The type case for a forme: every capital with enough sorts, a few spares, lowercase decoys at D3+. */
export function buildCase(lines: string[], difficulty: Difficulty, seed: number) {
  const rules = typesetRules(difficulty)
  const rng = mulberry32(seed)
  const need: Record<string, number> = {}
  for (const l of lines) for (const c of l) if (c !== ' ') need[c] = (need[c] ?? 0) + 1
  const upper: CaseCompartment[] = UPPER_CASE_LAYOUT.map(ch => ({
    ch,
    count: (need[ch] ?? 0) + (need[ch] ? randInt(rng, 0, scale(difficulty, [3, 2, 1, 1])) : randInt(rng, 1, 4)),
  }))
  const lower = rules.lowercaseDecoys ? shuffle(LOWER_DECOYS, rng).slice(0, scale(difficulty, [0, 0, 5, 7])) : []
  return { upper: rules.pied ? shuffle(upper, rng) : upper, lower, need }
}

// ── Component ──────────────────────────────────────────────────────────────

type Phase = 'set' | 'justify' | 'ink' | 'pressing' | 'printed'
type Quad = 'em' | 'en'

const pct = (units: number, measure: number) => `${(units / (2 * measure)) * 100}%`

export default function TypesetGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'gutenberg-bible')
  const base = CONFIGS[configId] ?? CONFIGS['gutenberg-bible']
  const rules = typesetRules(difficulty)
  const linesKey = JSON.stringify(cfg.lines ?? [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { lines, measure } = useMemo(() => buildForme(cfg, difficulty, base), [linesKey, difficulty, configId])
  const tcase = useMemo(() => buildCase(lines, difficulty, seed), [lines, difficulty, seed])
  const supply = useMemo(() => quadSupply(lines, measure, difficulty), [lines, measure, difficulty])

  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })
  const [phase, setPhase] = useState<Phase>('set')
  const [lineIdx, setLineIdx] = useState(0)
  const [setCount, setSetCount] = useState(0)
  const [quads, setQuads] = useState<Quad[][]>(() => lines.map(() => []))
  const [inkLeft, setInkLeft] = useState(rules.ink)
  const [flash, setFlash] = useState<string | null>(null)
  const [note, setNote] = useState<string>('')
  const [inked, setInked] = useState<Set<string>>(() => new Set())
  const [revealed, setRevealed] = useState(false)
  const drawing = useRef(false)

  const timer = useGameTimer({
    seconds: rules.seconds,
    running: !settled && (phase === 'set' || phase === 'justify' || phase === 'ink'),
    onExpire: () => lose('the press could not wait'),
  })

  const line = lines[lineIdx] ?? ''
  const letters = [...line].filter(c => c !== ' ')
  const need = quadUnits(line, measure)
  const quadSum = (q: Quad[]) => q.reduce((n, x) => n + (x === 'em' ? 2 : 1), 0)
  const curQuads = quads[lineIdx] ?? []

  // Sorts out of the case: every letter of locked lines plus the stick so far.
  const usedLetters = useMemo(() => {
    const used: Record<string, number> = {}
    lines.forEach((l, i) => {
      const ls = [...l].filter(c => c !== ' ')
      const n = i < lineIdx ? ls.length : i === lineIdx ? setCount : 0
      for (const c of ls.slice(0, n)) used[c] = (used[c] ?? 0) + 1
    })
    return used
  }, [lines, lineIdx, setCount])
  const usedQuads = quads.flat().reduce((m, q) => ({ ...m, [q]: m[q] + 1 }), { em: 0, en: 0 } as Record<Quad, number>)

  const spoil = (key: string, why: string) => {
    setFlash(key); setNote(why)
    setTimeout(() => setFlash(f => (f === key ? null : f)), 450)
    const left = inkLeft - 1
    setInkLeft(left)
    if (left <= 0) lose('the forme is spoiled')
  }

  const lockLine = () => {
    if (lineIdx + 1 >= lines.length) { setPhase('ink'); setNote('') }
    else { setLineIdx(i => i + 1); setSetCount(0); setPhase('set'); setNote('') }
  }

  const pickSort = (ch: string) => {
    if (settled || phase !== 'set') return
    const comp = tcase.upper.find(c => c.ch === ch)
    if (!comp || comp.count - (usedLetters[ch] ?? 0) <= 0) return
    if (ch !== letters[setCount]) { spoil(ch, `That is ${'AEIOU'.includes(ch) ? 'an' : 'a'} ${ch} — the copy wants ${letters[setCount]}.`); return }
    const next = setCount + 1
    setSetCount(next); setNote('')
    if (next === letters.length) {
      if (rules.justify && need > 0) { setPhase('justify'); setNote(`Line set. Quad it out: ${need} en of space to the measure.`) }
      else lockLine()
    }
  }
  const pickLower = (ch: string) => {
    if (settled || phase !== 'set') return
    spoil(`lc-${ch}`, 'A lowercase sort! This forme is set in capitals.')
  }
  const pickQuad = (q: Quad) => {
    if (settled || phase !== 'justify') return
    if (usedQuads[q] >= supply[q]) return
    const w = q === 'em' ? 2 : 1
    const have = quadSum(curQuads)
    if (have + w > need) { spoil(`q-${q}`, `An ${q} quad will not fit — only ${need - have} en left.`); return }
    const nextQ = [...curQuads, q]
    setQuads(all => all.map((x, i) => (i === lineIdx ? nextQ : x)))
    if (have + w === need) lockLine()
  }
  const undo = () => {
    if (settled) return
    if (phase === 'justify' && curQuads.length) setQuads(all => all.map((x, i) => (i === lineIdx ? x.slice(0, -1) : x)))
    else if ((phase === 'set' || phase === 'justify') && setCount > 0) { setSetCount(c => c - 1); setPhase('set') }
    setNote('')
  }

  // Inking: the brayer covers a cell and its neighbours on the same line.
  const letterCells = useMemo(() => lines.flatMap((l, i) => [...l].map((c, k) => (c === ' ' ? null : `${i}:${k}`)).filter(Boolean) as string[]), [lines])
  const coverage = letterCells.length ? letterCells.filter(k => inked.has(k)).length / letterCells.length : 1
  const inkAt = (i: number, k: number) => {
    if (phase !== 'ink' || settled) return
    setInked(prev => {
      const next = new Set(prev)
      for (const kk of [k - 1, k, k + 1]) if (lines[i]?.[kk] && lines[i][kk] !== ' ') next.add(`${i}:${kk}`)
      return next.size === prev.size ? prev : next
    })
  }
  const inkFromPoint = (x: number, y: number) => {
    if (typeof document.elementFromPoint !== 'function') return
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    const cell = el?.closest?.('[data-ink]') as HTMLElement | null
    if (cell?.dataset.ink) { const [i, k] = cell.dataset.ink.split(':').map(Number); inkAt(i, k) }
  }

  const pull = () => {
    if (phase !== 'ink' || settled || coverage < rules.coverage) return
    setPhase('pressing')
  }
  useEffect(() => {
    if (phase === 'pressing') {
      const t = setTimeout(() => setPhase('printed'), 700)
      return () => clearTimeout(t)
    }
    if (phase === 'printed') {
      const t1 = setTimeout(() => setRevealed(true), 30)
      const t2 = setTimeout(() => win(), 1100)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
  }, [phase, win])

  const inkMode = phase === 'ink'
  const allLetters = lines.reduce((n, l) => n + lettersIn(l), 0)
  let revealOrder = 0

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4 select-none">
      {/* Header over the print-shop painting */}
      <div className="relative overflow-hidden rounded-xl border border-line">
        <div className="absolute inset-0" style={artCover(cfg.art ?? base.art)} aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-b from-paper/80 via-paper/85 to-paper/95" aria-hidden />
        <div className="relative p-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
            <p className="text-ink-2 text-xs leading-relaxed">{cfg.intro}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-[10px] ${inkLeft <= 1 ? 'text-red-600 font-bold' : 'text-ink-2'}`} aria-label="ink left">
              Ink {'●'.repeat(Math.max(0, inkLeft))}{'○'.repeat(rules.ink - Math.max(0, inkLeft))}
            </p>
            <p className="text-[10px] text-ink-2 mt-0.5">Line <b className="text-ink">{Math.min(lineIdx + 1, lines.length)}</b> / {lines.length}</p>
          </div>
        </div>
        {/* Step track */}
        <div className="relative flex text-[9px] font-bold uppercase tracking-wider border-t border-line/70">
          {(['Set', ...(rules.justify ? ['Justify'] : []), 'Ink', 'Pull'] as const).map(step => {
            const active = (step === 'Set' && phase === 'set') || (step === 'Justify' && phase === 'justify') || (step === 'Ink' && phase === 'ink') || (step === 'Pull' && (phase === 'pressing' || phase === 'printed'))
            return <span key={step} className={`flex-1 text-center py-1 ${active ? 'bg-accent text-accent-fg' : 'bg-paper/70 text-muted'}`}>{step}</span>
          })}
        </div>
      </div>
      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}

      {/* The copy */}
      <div className="bg-paper rounded-lg border border-line px-3 py-2">
        <p className="text-[9px] uppercase tracking-widest text-muted mb-1">Copy</p>
        {lines.map((l, i) => (
          <p key={i} className={`font-mono text-sm tracking-widest leading-snug ${i === lineIdx && (phase === 'set' || phase === 'justify') ? 'text-ink font-bold' : i < lineIdx || !(phase === 'set' || phase === 'justify') ? 'text-muted line-through decoration-muted/40' : 'text-ink-2'}`}>
            {i === lineIdx && phase === 'set' && rules.showLabels
              ? (() => { let li = -1; return [...l].map((c, k) => { if (c !== ' ') li++; return <span key={k} className={c !== ' ' && li === setCount ? 'text-accent underline underline-offset-4' : ''}>{c === ' ' ? ' ' : c}</span> }) })()
              : l}
          </p>
        ))}
      </div>

      {/* The forme in its chase: mirrored lines reading right to left */}
      {phase !== 'printed' && (
        <div className={`relative rounded-xl border-4 border-ink-2 bg-ink p-1.5 flex flex-col gap-1 ${phase === 'pressing' ? 'transition-transform duration-500 scale-[0.98]' : ''}`}
          style={{ touchAction: inkMode ? 'none' : undefined }}
          onPointerDown={e => { if (inkMode) { drawing.current = true; inkFromPoint(e.clientX, e.clientY) } }}
          onPointerMove={e => { if (inkMode && drawing.current) inkFromPoint(e.clientX, e.clientY) }}
          onPointerUp={() => { drawing.current = false }}
          onPointerLeave={() => { drawing.current = false }}>
          {phase === 'pressing' && <div className="absolute inset-x-0 top-0 h-full bg-ink-2/80 z-10 animate-pulse rounded-lg" aria-hidden />}
          {lines.map((l, i) => {
            const done = i < lineIdx || inkMode || phase === 'pressing'
            const current = i === lineIdx && (phase === 'set' || phase === 'justify')
            const shown = done ? Infinity : current ? setCount : 0
            const q = quads[i] ?? []
            const filler = Math.max(0, 2 * measure - lineUnits(l) - quadSum(q))
            let li = -1
            return (
              <div key={i} className={`flex flex-row-reverse items-stretch h-9 rounded ${current ? 'ring-2 ring-accent bg-paper/15' : 'bg-paper/5'}`} aria-label={`forme line ${i + 1}`}>
                {[...l].map((c, k) => {
                  if (c === ' ') return <div key={k} style={{ width: pct(1, measure) }} />
                  li++
                  const filled = li < shown
                  const isNext = current && phase === 'set' && li === setCount
                  const ink = inked.has(`${i}:${k}`)
                  return (
                    <div key={k} data-ink={`${i}:${k}`} data-testid={inkMode ? 'ink-cell' : undefined}
                      onPointerDown={e => { if (inkMode) { e.stopPropagation(); drawing.current = true; inkAt(i, k) } }}
                      onPointerEnter={() => { if (inkMode && drawing.current) inkAt(i, k) }}
                      style={{ width: pct(2, measure) }}
                      className={`px-[1px] py-0.5`}>
                      <div className={`h-full rounded-[3px] flex items-center justify-center font-mono font-bold text-[13px] sm:text-base transition-colors
                        ${filled ? (ink ? 'bg-ink-2 text-paper shadow-inner' : 'bg-paper-2 text-ink') : isNext ? 'border border-dashed border-accent bg-accent/20' : 'bg-paper/10'}`}>
                        {filled && <span className="inline-block -scale-x-100">{c}</span>}
                      </div>
                    </div>
                  )
                })}
                {q.map((x, k) => (
                  <div key={`q${k}`} style={{ width: pct(x === 'em' ? 2 : 1, measure) }} className="px-[1px] py-1.5">
                    <div className="h-full rounded-[2px] bg-paper-2/50" title={`${x} quad`} />
                  </div>
                ))}
                {filler > 0 && (rules.justify || !done) && (
                  <div style={{ width: pct(filler, measure) }} className={`py-1 px-[1px] ${current && phase === 'justify' ? 'animate-pulse' : ''}`}>
                    <div className={`h-full rounded-[2px] ${rules.justify && (current || i <= lineIdx) ? 'border border-dashed border-paper/40' : ''}`} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {note && phase !== 'printed' && <p className={`text-[11px] ${flash ? 'text-red-700 font-bold' : 'text-ink-2'}`}>{note}</p>}

      {/* Type case: upper case drawer (capitals) and lower case drawer (quads, lowercase) */}
      {(phase === 'set' || phase === 'justify') && (
        <div className="relative overflow-hidden rounded-xl border-2 border-ink-2">
          <div className="absolute inset-0" style={artTexture('typeset_case', 220)} aria-hidden />
          <div className="absolute inset-0 bg-panel/70" aria-hidden />
          <div className="relative p-2 flex flex-col gap-2">
            <p className="text-[9px] uppercase tracking-widest text-ink-2 font-bold">Upper case{rules.pied ? ' · pied by the apprentice!' : ''}</p>
            <div className={`grid grid-cols-7 gap-1 ${phase !== 'set' ? 'opacity-50' : ''}`}>
              {tcase.upper.map(c => {
                const left = c.count - (usedLetters[c.ch] ?? 0)
                const bad = flash === c.ch
                return (
                  <button key={c.ch} aria-label={`sort ${c.ch}`} disabled={settled || phase !== 'set' || left <= 0} onClick={() => pickSort(c.ch)}
                    className={`relative h-11 rounded-md border font-mono text-lg font-bold transition-all active:scale-95
                      ${left <= 0 ? 'opacity-25 bg-paper-2/60 border-line' : bad ? 'bg-red-500/30 border-red-600 text-red-800' : 'bg-paper-2/90 border-ink-2/40 text-ink hover:bg-accent/15 hover:border-accent'}`}>
                    <span className="inline-block -scale-x-100">{c.ch}</span>
                    {rules.showLabels && <span className="absolute top-0 left-1 text-[8px] font-sans text-muted">{c.ch}</span>}
                    <span className="absolute bottom-0 right-1 text-[8px] font-sans text-muted tabular-nums">{Math.max(0, left)}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-[9px] uppercase tracking-widest text-ink-2 font-bold">Lower case</p>
            <div className="grid grid-cols-7 gap-1">
              {rules.justify && (['em', 'en'] as const).map(q => {
                const left = supply[q] - usedQuads[q]
                return (
                  <button key={q} aria-label={`${q} quad`} disabled={settled || phase !== 'justify' || left <= 0} onClick={() => pickQuad(q)}
                    className={`relative h-11 rounded-md border text-[10px] font-bold col-span-2 transition-all active:scale-95
                      ${phase === 'justify' ? 'bg-accent/20 border-accent text-ink' : 'bg-paper-2/60 border-line text-muted'}
                      ${flash === `q-${q}` ? '!bg-red-500/30 !border-red-600' : ''} disabled:opacity-40`}>
                    <span className="flex items-center justify-center gap-1">
                      <span className={`inline-block h-3 bg-ink-2/60 rounded-[1px] ${q === 'em' ? 'w-4' : 'w-2'}`} />{q} quad
                    </span>
                    <span className="absolute bottom-0 right-1 text-[8px] text-muted tabular-nums">{left}</span>
                  </button>
                )
              })}
              {tcase.lower.map(ch => (
                <button key={ch} aria-label={`lowercase sort ${ch}`} disabled={settled || phase !== 'set'} onClick={() => pickLower(ch)}
                  className={`h-11 rounded-md border font-mono text-lg transition-all active:scale-95 disabled:opacity-40
                    ${flash === `lc-${ch}` ? 'bg-red-500/30 border-red-600' : 'bg-paper-2/90 border-ink-2/40 text-ink hover:bg-accent/15'}`}>
                  <span className="inline-block -scale-x-100">{ch}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-between items-center">
              <p className="text-[10px] text-ink-2">
                {phase === 'set' ? 'Sorts are mirrored; the stick fills from the right.' : `Quad out ${need - quadSum(curQuads)} en more · em = 2, en = 1`}
              </p>
              <button onClick={undo} disabled={settled || (setCount === 0 && curQuads.length === 0)} className="text-[10px] text-ink-2 underline disabled:opacity-40">
                {phase === 'justify' && curQuads.length ? 'Lift last quad' : 'Pull last sort'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ink and pull */}
      {(phase === 'ink' || phase === 'pressing') && (
        <div className="flex flex-col gap-2 bg-panel border border-line rounded-xl p-3">
          <p className="text-xs text-ink-2">Forme locked up. <b className="text-ink">Roll the brayer</b> — drag or tap across every line until the ink is even.</p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 h-3 bg-paper rounded-full overflow-hidden border border-line">
              <div className="h-full bg-ink-2 transition-all" style={{ width: `${coverage * 100}%` }} />
              <div className="absolute top-0 bottom-0 w-0.5 bg-accent" style={{ left: `${rules.coverage * 100}%` }} />
            </div>
            <span className="text-[10px] font-bold tabular-nums text-ink w-10 text-right" aria-label="coverage">{Math.round(coverage * 100)}%</span>
          </div>
          <button onClick={pull} disabled={settled || phase !== 'ink' || coverage < rules.coverage}
            className="h-14 rounded-xl font-bold text-sm bg-accent text-accent-fg disabled:opacity-40 active:translate-y-1 transition-transform shadow-md flex items-center justify-center gap-2">
            <span className={`inline-block text-xl transition-transform duration-500 ${phase === 'pressing' ? 'rotate-90' : '-rotate-45'}`}>⟋</span>
            {phase === 'pressing' ? 'The platen comes down…' : coverage < rules.coverage ? `Ink to ${Math.round(rules.coverage * 100)}% to pull` : 'Pull the bar'}
          </button>
        </div>
      )}

      {/* The printed sheet */}
      {phase === 'printed' && (
        <div className="relative overflow-hidden rounded-xl border border-line">
          <div className="absolute inset-0 opacity-30" style={artCover(cfg.art ?? base.art)} aria-hidden />
          <div className={`relative m-3 bg-paper shadow-xl rounded-sm px-4 py-5 transition-all duration-700 ${revealed ? 'opacity-100 translate-y-0 rotate-0' : 'opacity-0 -translate-y-6 -rotate-2'}`} aria-label="printed sheet">
            <p className="text-[9px] uppercase tracking-[0.3em] text-muted text-center mb-3">{cfg.title}</p>
            {lines.map((l, i) => (
              <p key={i} className="font-serif font-bold text-ink text-lg sm:text-xl tracking-wider leading-tight">
                {[...l].map((c, k) => {
                  const order = c === ' ' ? 0 : revealOrder++
                  return <span key={k} className="transition-opacity duration-300" style={{ opacity: revealed ? 1 : 0, transitionDelay: `${(order / Math.max(1, allLetters)) * 600}ms` }}>{c === ' ' ? ' ' : c}</span>
                })}
              </p>
            ))}
            <p className="mt-3 text-[10px] text-muted text-center italic">Pulled fresh from the press — no longer mirrored.</p>
          </div>
        </div>
      )}

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Printed!" loseTitle="The forme is spoiled" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
