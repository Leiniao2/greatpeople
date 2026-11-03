// Logic gate campaign: every stage of every config and difficulty is
// solvable with its open slots, never starts solved, and the named builds
// compute what their names promise.
import { describe, it, expect } from 'vitest'
import {
  CONFIGS, BUILDS, PLANS, GATES, makeStages, solutions, solves, truthTable, answerOf, evaluate, inputRows, classicBuild,
  randomBuild, OPEN_SLOTS, MAX_CHECKS, TAPE_RULES, tapeFor, type Stage,
} from '@/components/minigames/LogicGateGame'
import { mulberry32 } from '@/components/minigames/_shared/rng'
import type { Difficulty } from '@/games/types'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
type CircuitStage = Extract<Stage, { kind: 'circuit' }>
const num = (bits: number[]) => bits.reduce((n, b) => n * 2 + b, 0)

describe('named builds compute what they claim', () => {
  const rows = (k: string) => inputRows(BUILDS[k].inputs.length).map(bits => ({ bits, out: truthTable(BUILDS[k], answerOf(BUILDS[k]))[num(bits)] }))
  it('half adder', () => { for (const { bits: [a, b], out } of rows('halfAdder')) expect(num(out)).toBe(a + b) })
  it('full adder', () => { for (const { bits: [a, b, c], out } of rows('fullAdder')) expect(num(out)).toBe(a + b + c) })
  it('multiplexer', () => { for (const { bits: [a, b, s], out } of rows('mux')) expect(out).toEqual([s ? b : a]) })
  it('2-bit equality', () => { for (const { bits: [a1, a0, b1, b0], out } of rows('equal2')) expect(out).toEqual([num([a1, a0]) === num([b1, b0]) ? 1 : 0]) })
  it('2-bit comparator', () => {
    for (const { bits: [a1, a0, b1, b0], out } of rows('comparator')) {
      const A = num([a1, a0]), B = num([b1, b0])
      expect(out).toEqual([A === B ? 1 : 0, A > B ? 1 : 0])
    }
  })
  it('2-bit adder', () => { for (const { bits: [a1, a0, b1, b0], out } of rows('adder2')) expect(num(out)).toBe(num([a1, a0]) + num([b1, b0])) })
  it('classic builds reproduce each config target', () => {
    for (const cfg of Object.values(CONFIGS)) {
      const b = classicBuild(cfg)
      inputRows(3).forEach(([a, bb, c], i) => expect(truthTable(b, answerOf(b))[i]).toEqual([cfg.target(a, bb, c)]))
    }
  })
  it('slots only read inputs or earlier layers', () => {
    for (const b of [...Object.values(BUILDS), classicBuild(CONFIGS['boole-laws']), randomBuild(mulberry32(5))]) {
      const seen = new Map<string, number>(b.inputs.map(i => [i, 0]))
      for (const s of b.slots) {
        for (const src of [s.a, s.b]) { expect(seen.has(src), `${b.key}.${s.id} reads ${src}`).toBe(true); expect(seen.get(src)!).toBeLessThan(s.layer) }
        seen.set(s.id, s.layer)
      }
      for (const o of b.outputs) expect(seen.has(o.src)).toBe(true)
      expect(Math.max(...b.slots.map(s => s.layer))).toBeLessThanOrEqual(4)
    }
  })
  it('random builds are never constant and depend on every input', () => {
    for (let s = 0; s < 200; s++) {
      const b = randomBuild(mulberry32(s))
      const col = truthTable(b, answerOf(b)).map(r => r[0])
      expect(new Set(col).size).toBe(2)
      for (let k = 0; k < 3; k++) expect(col.some((v, i) => v !== col[i ^ (1 << (2 - k))])).toBe(true)
      void evaluate
    }
  })
})

describe('stages', () => {
  it('2–3 stages per challenge, bigger and multi-output at higher tiers', () => {
    for (const id of Object.keys(CONFIGS)) {
      for (const d of DIFFS) {
        const st = makeStages(id, CONFIGS[id], d, 1)
        expect(st.length).toBe(PLANS[id][d - 1].length)
        expect(st.length).toBeGreaterThanOrEqual(2)
        expect(st.length).toBeLessThanOrEqual(3)
      }
      const top = makeStages(id, CONFIGS[id], 4, 1).filter((s): s is CircuitStage => s.kind === 'circuit')
      expect(top.some(s => s.build.outputs.length >= 2), `${id} d4 has a multi-output stage`).toBe(true)
      expect(Math.max(...top.map(s => s.build.inputs.length))).toBeGreaterThanOrEqual(3)
    }
    expect(MAX_CHECKS(4)).toBeLessThan(MAX_CHECKS(1))
  })
  it('the Turing challenge ends at the tape machine at the top tier', () => {
    expect(makeStages('turing-tape', CONFIGS['turing-tape'], 4, 9).slice(-1)[0].kind).toBe('tape')
  })
  it('is deterministic from the seed', () => {
    const a = JSON.stringify(makeStages('shannon-relays', CONFIGS['shannon-relays'], 3, 77))
    expect(JSON.stringify(makeStages('shannon-relays', CONFIGS['shannon-relays'], 3, 77))).toBe(a)
    const starts = new Set(Array.from({ length: 10 }, (_, s) => JSON.stringify(makeStages('shannon-relays', CONFIGS['shannon-relays'], 3, s))))
    expect(starts.size).toBeGreaterThan(3)
  })
  for (const id of Object.keys(CONFIGS)) {
    it(`${id}: every stage is solvable with its open slots and never starts solved`, () => {
      for (const d of DIFFS) for (let seed = 0; seed < 24; seed++) {
        for (const st of makeStages(id, CONFIGS[id], d, seed * 31 + 1)) {
          if (st.kind === 'tape') continue
          const open = st.build.slots.length - st.locked.length
          expect(open).toBeLessThanOrEqual(OPEN_SLOTS(d))
          expect(open).toBeGreaterThan(0)
          for (const l of st.locked) expect(st.start[l]).toBe(answerOf(st.build)[l])
          expect(solves(st, st.start), `${id} d${d} seed ${seed} ${st.build.key} starts solved`).toBe(false)
          expect(solves(st, answerOf(st.build))).toBe(true)
          expect(solutions(st, 1).length, `${id} d${d} ${st.build.key} unsolvable`).toBe(1)
          for (const g of Object.values(st.start)) expect(GATES).toContain(g)
        }
      }
    }, 60_000)
  }
  it('tape stage: some rule produces the target', () => {
    for (let seed = 0; seed < 50; seed++) {
      const { tape, rule } = tapeFor(seed)
      expect(TAPE_RULES.some(r => r.run(tape).join() === rule.run(tape).join())).toBe(true)
    }
  })
})

describe('LogicGateGame UI', () => {
  it('a wrong check counts, inputs toggle, gates cycle', async () => {
    const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
    const { createElement } = await import('react')
    const { default: LogicGateGame } = await import('@/components/minigames/LogicGateGame')
    render(createElement(LogicGateGame, { configId: 'shannon-relays', difficulty: 3, seed: 4, onWin: () => {}, onLose: () => {} }))
    expect(screen.getByText(/Stage 1: Half adder/)).toBeTruthy()
    fireEvent.click(screen.getByText('Check circuit'))
    expect(screen.getByText(/✗ 1 \/ 4/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('input A is 0'))
    expect(screen.getByLabelText('input A is 1')).toBeTruthy()
    const gate = screen.getAllByLabelText(/^gate s:/)[0]
    const before = gate.getAttribute('aria-label')
    fireEvent.click(gate); fireEvent.click(gate)
    expect(screen.getAllByLabelText(/^gate s:/)[0].getAttribute('aria-label')).not.toBe(before)
    cleanup()
  })
})
