// Detective: every config × difficulty × seed is a fair case (the killer has
// the means, the body and every trick trace are in the scene, each lie is
// contradicted by evidence the player can reach, honest suspects never lie,
// decoys never point at the truth); the Arcade ladder varies; the component
// can be played to a win and to each kind of loss.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import DetectiveGame, { CONFIG_IDS } from '@/components/minigames/DetectiveGame'
import { generate, contradicts, isCorrect, TIERS, HOURS, type Case } from '@/components/minigames/detective/model'
import { CASES } from '@/components/minigames/detective/cases'
import { levelFor, LEVELS_PER_TRACK } from '@/games/arcade'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006, 99991]

describe('detective case data', () => {
  for (const [id, def] of Object.entries(CASES)) {
    it(`${id} is well formed`, () => {
      expect(def.hours).toHaveLength(HOURS)
      expect(def.scene.some(o => o.id === 'body')).toBe(true)
      expect(new Set(def.scene.map(o => o.id)).size).toBe(def.scene.length)
      expect(def.suspects.length).toBeGreaterThanOrEqual(6)
      for (const sp of def.suspects) expect(sp.answers, sp.name).toHaveLength(def.questions.length)
      for (const t of def.tricks) {
        expect(t.traces.body, `${id}/${t.id} body trace`).toBeTruthy()
        for (const obj of Object.keys(t.traces)) expect(def.scene.some(o => o.id === obj), `${id}/${t.id} trace ${obj}`).toBe(true)
        expect(t.traces[t.lie.clashes], `${id}/${t.id} lie clashes with a trace`).toBeTruthy()
        expect(t.lie.q).toBeLessThan(def.questions.length)
        expect(def.suspects.some(s => s.means.includes(t.method)), `${id}/${t.id} someone has the means`).toBe(true)
        expect(def.methods[t.method]).toBeTruthy()
      }
      // Every trick has a different method, so the body always tells them apart.
      expect(new Set(def.tricks.map(t => t.method)).size).toBe(def.tricks.length)
    })
  }
})

describe('detective cases are fair', () => {
  for (const id of CONFIG_IDS) for (const d of DIFFS) {
    it(`${id} D${d}`, () => {
      const tier = TIERS[d]
      for (const seed of SEEDS) {
        const c = generate(id, d, seed)
        const tag = `${id} D${d} s${seed}`
        expect(c.suspects.length, tag).toBe(tier.suspects)
        expect(c.suspects[c.truth.s].means, tag).toContain(c.truth.m)
        const trick = CASES[id].tricks[c.truth.trick]
        expect(c.methods[c.truth.m].id, tag).toBe(trick.method)
        // The scene shows every trace of the trick as a clue, plus exactly the decoys.
        for (const [obj, text] of Object.entries(trick.traces)) {
          const o = c.scene.find(x => x.id === obj)!
          expect(o.clue, `${tag} ${obj}`).toBe(true)
          expect(o.look, `${tag} ${obj}`).toBe(text)
        }
        expect(c.clueIds.length, tag).toBe(Object.keys(trick.traces).length + tier.decoys)
        // Decoys never touch the body, and the body names the true method only.
        expect(c.scene.find(o => o.id === 'body')!.look, tag).toBe(trick.traces.body)
        // Only the killer lies; the killer lies about the trick, and from D2 about the alibi.
        c.statements.forEach((row, s) => row.forEach((st, q) => {
          if (s !== c.truth.s) expect(st.lie, `${tag} ${s}:${q}`).toBeUndefined()
        }))
        const lies = c.statements[c.truth.s].map((st, q) => ({ st, q })).filter(x => x.st.lie)
        expect(lies.length, tag).toBe(tier.falseAlibi ? 2 : 1)
        for (const { st, q } of lies) {
          const clash = st.lie!.clash
          if (clash.kind === 'object') {
            expect(c.clueIds, `${tag} q${q}`).toContain(clash.id)
            expect(contradicts(c, c.truth.s, q, clash), tag).toBe(true)
          } else {
            expect(clash.s, tag).not.toBe(c.truth.s)
            expect(clash.q, tag).toBe(0)
            // The borrowed companion was alone somewhere else.
            expect(c.statements[clash.s][0].text, tag).toMatch(/on my own/)
            expect(c.statements[clash.s][0].text, tag).not.toContain(c.statements[c.truth.s][0].text.split(',')[0])
            expect(c.statements[c.truth.s][0].text, tag).toContain(c.suspects[clash.s].name)
          }
        }
        // Honest alibis are consistent: anyone named as company names you back, at the same place.
        c.statements.forEach((row, s) => {
          if (s === c.truth.s) return
          const m = row[0].text.match(/^At the (.+), with (.+)\.$/)
          if (!m) return
          const other = c.suspects.findIndex(sp => sp.name === m[2])
          expect(other, tag).toBeGreaterThanOrEqual(0)
          expect(c.statements[other][0].text, tag).toBe(`At the ${m[1]}, with ${c.suspects[s].name}.`)
        })
        // Wrong evidence never counts.
        expect(contradicts(c, c.truth.s, trick.lie.q + 1, { kind: 'object', id: 'body' }) && trick.lie.clashes !== 'body', tag).toBe(false)
        expect(isCorrect(c, { s: c.truth.s, m: c.truth.m, trick: c.truth.trick }), tag).toBe(true)
        expect(isCorrect(c, { s: (c.truth.s + 1) % c.suspects.length, m: c.truth.m, trick: c.truth.trick }), tag).toBe(false)
        if (tier.nameTrick) expect(isCorrect(c, { s: c.truth.s, m: c.truth.m, trick: (c.truth.trick + 1) % c.tricks.length }), tag).toBe(false)
      }
    })
  }

  it('the Arcade ladder varies killer and trick', () => {
    const seen = new Set<string>()
    const tricks = new Set<string>()
    for (let i = 0; i < LEVELS_PER_TRACK; i++) {
      const lv = levelFor('detective', CONFIG_IDS, i)
      const c = generate(lv.configId, lv.difficulty, lv.seed)
      seen.add(`${lv.configId}:${c.suspects[c.truth.s].name}:${c.truth.trick}`)
      tricks.add(`${lv.configId}:${c.truth.trick}`)
    }
    expect(seen.size).toBeGreaterThanOrEqual(18)
    expect(tricks.size).toBeGreaterThanOrEqual(12)
  })
})

describe('detective component', () => {
  const play = (d: Difficulty, seed = 3) => {
    const onWin = vi.fn(), onLose = vi.fn()
    const c: Case = generate(CONFIG_IDS[0], d, seed)
    render(createElement(DetectiveGame, { configId: CONFIG_IDS[0], difficulty: d, seed, onWin, onLose }))
    return { c, onWin, onLose }
  }
  const click = (label: string | RegExp) => fireEvent.click(screen.getByLabelText(label))
  const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name: new RegExp(name) }))

  it('finds clues, exposes both lies and closes the case', () => {
    vi.useFakeTimers()
    const { c, onWin, onLose } = play(2)
    for (const id of c.clueIds) click(`Examine ${c.scene.find(o => o.id === id)!.name}`)
    expect(screen.getByRole('tab', { name: /Scene/ }).textContent).toContain(`${c.clueIds.length}/${c.clueIds.length}`)
    tab('Questions')
    const killer = c.suspects[c.truth.s]
    // The false alibi, pressed with the companion's own answer.
    const alibi = c.statements[c.truth.s][0].lie!.clash as { s: number }
    click(`${killer.name}'s answer`)
    click(`Press with ${c.suspects[alibi.s].name}'s answer`)
    expect(screen.getAllByText('LIE').length).toBe(1)
    // The cover story, pressed with the clue it clashes with.
    const trick = CASES[CONFIG_IDS[0]].tricks[c.truth.trick]
    fireEvent.click(screen.getByRole('tab', { name: c.questions[trick.lie.q + 1] }))
    click(`${killer.name}'s answer`)
    click(`Press with ${c.scene.find(o => o.id === trick.lie.clashes)!.name}`)
    expect(screen.getAllByText('LIE').length).toBe(1)
    tab('Accuse')
    click(`Culprit: ${killer.name}`)
    click(`Method: ${c.methods[c.truth.m].label}`)
    click('Make the accusation')
    expect(screen.getByText(/Case closed/)).toBeTruthy()
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onWin).toHaveBeenCalledTimes(1)
    expect(onLose).not.toHaveBeenCalled()
  })

  it('a wrong accusation loses and tells the truth', () => {
    vi.useFakeTimers()
    const { c, onWin, onLose } = play(1)
    tab('Accuse')
    click(`Culprit: ${c.suspects[(c.truth.s + 1) % c.suspects.length].name}`)
    click(`Method: ${c.methods[c.truth.m].label}`)
    click('Make the accusation')
    expect(screen.getByText(/Wrong: not so/)).toBeTruthy()
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('pressing an honest answer costs patience, and the suspects stop talking when it is gone', () => {
    vi.useFakeTimers()
    const { c, onLose } = play(1)
    tab('Questions')
    const honest = c.suspects.findIndex((_, s) => s !== c.truth.s)
    const other = c.suspects.findIndex((_, s) => s !== honest)
    click(`${c.suspects[honest].name}'s answer`)
    for (let i = 0; i < c.tier.patience; i++) {
      click(`Press with ${c.suspects[other].name}'s answer`)
      act(() => { vi.advanceTimersByTime(500) })
    }
    expect(screen.getByText(/stopped talking/)).toBeTruthy()
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
  })

  it('from D3 the accusation needs the trick as well', () => {
    const { c } = play(3)
    tab('Accuse')
    click(`Culprit: ${c.suspects[c.truth.s].name}`)
    click(`Method: ${c.methods[c.truth.m].label}`)
    expect((screen.getByLabelText('Make the accusation') as HTMLButtonElement).disabled).toBe(true)
    click(`Trick: ${c.tricks[c.truth.trick].label}`)
    expect((screen.getByLabelText('Make the accusation') as HTMLButtonElement).disabled).toBe(false)
  })
})
