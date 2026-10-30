/**
 * Builds the human-readable change report that is handed to the engine agent
 * when the designer saves. Only behaviour-bearing changes are included:
 * rule rows, rulebook/doc text, and card trait/achievement text. Pure stat
 * and bonus edits flow into the game through the data files and are listed
 * as informational.
 */
import type { Card, FileContents, Rule } from '../types'
import { STATS } from '../types'

const RULE_FIELDS: (keyof Rule)[] = ['title', 'category', 'docText', 'docSource', 'codeBehaviour', 'codeSource', 'status', 'notes']

function q(s: string): string {
  return JSON.stringify(s)
}

/** Line diff via LCS; good enough for prose edits. */
export function lineDiff(before: string, after: string, context = 2): string {
  const a = before.split('\n'), b = after.split('\n')
  const n = a.length, m = b.length
  if (n * m > 4_000_000) return `(diff too large: ${n} → ${m} lines)`
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  }
  const ops: { op: ' ' | '-' | '+'; line: string }[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ op: ' ', line: a[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ op: '-', line: a[i] }); i++ }
    else { ops.push({ op: '+', line: b[j] }); j++ }
  }
  while (i < n) ops.push({ op: '-', line: a[i++] })
  while (j < m) ops.push({ op: '+', line: b[j++] })
  // Keep only changed lines plus `context` lines around them.
  const keep = new Array<boolean>(ops.length).fill(false)
  ops.forEach((o, k) => { if (o.op !== ' ') for (let d = -context; d <= context; d++) if (ops[k + d]) keep[k + d] = true })
  const out: string[] = []
  let gap = false
  ops.forEach((o, k) => {
    if (!keep[k]) { gap = true; return }
    if (gap && out.length) out.push('…')
    gap = false
    out.push(`${o.op} ${o.line}`)
  })
  return out.join('\n')
}

export function buildChangeReport(before: FileContents, after: FileContents): { report: string; behavioural: boolean } {
  const sections: string[] = []
  let behavioural = false

  // Rules registry
  const beforeRules = new Map(before.rules.map(r => [r.id, r]))
  const afterRules = new Map(after.rules.map(r => [r.id, r]))
  const ruleLines: string[] = []
  for (const r of after.rules) {
    const b = beforeRules.get(r.id)
    if (!b) { ruleLines.push(`- NEW rule [${r.id}] ${r.title} (${r.category}): design says ${q(r.docText)}; status ${r.status}; notes ${q(r.notes)}`); behavioural = true; continue }
    const changes = RULE_FIELDS.filter(f => b[f] !== r[f])
    if (!changes.length) continue
    const body = changes.map(f => `    ${f}: ${q(String(b[f]))} → ${q(String(r[f]))}`).join('\n')
    ruleLines.push(`- [${r.id}] ${r.title} (${r.category})\n${body}`)
    if (changes.some(f => f === 'docText' || f === 'codeBehaviour' || f === 'status')) behavioural = true
  }
  for (const b of before.rules) if (!afterRules.has(b.id)) { ruleLines.push(`- REMOVED rule [${b.id}] ${b.title}`) }
  if (ruleLines.length) sections.push(`## Rules registry (docs/fight_rules.json)\n\n${ruleLines.join('\n')}`)

  // Docs
  const docs: { key: 'fightMd' | 'traitIdeaMd' | 'cardMd'; path: string }[] = [
    { key: 'fightMd', path: 'docs/fight.md' }, { key: 'traitIdeaMd', path: 'docs/great-people-trait-idea.md' }, { key: 'cardMd', path: 'docs/great-people-card.md' },
  ]
  for (const d of docs) {
    if (before[d.key] === after[d.key]) continue
    sections.push(`## ${d.path} (line diff)\n\n\`\`\`diff\n${lineDiff(before[d.key], after[d.key])}\n\`\`\``)
    behavioural = true
  }

  // Cards: trait / achievement text is behaviour; stats are data.
  const beforeCards = new Map(before.cards.map(c => [c.id, c]))
  const textLines: string[] = []
  const dataLines: string[] = []
  for (const c of after.cards) {
    const b = beforeCards.get(c.id)
    if (!b) { textLines.push(`- NEW card ${c.figureName}: trait ${q(c.trait)}; achievement ${q(c.achievement)}`); behavioural = true; continue }
    if (b.trait !== c.trait) { textLines.push(`- ${c.figureName} trait: ${q(b.trait)} → ${q(c.trait)}`); behavioural = true }
    if (b.achievement !== c.achievement) { textLines.push(`- ${c.figureName} achievement: ${q(b.achievement)} → ${q(c.achievement)}`); behavioural = true }
    if (b.figureName !== c.figureName) { textLines.push(`- card ${c.id} renamed ${q(b.figureName)} → ${q(c.figureName)} (the engine keys traits and achievements by figureName)`); behavioural = true }
    const ids = b.identities.join(',') !== c.identities.join(',')
    const statDelta = STATS.filter(s => b[s] !== c[s]).map(s => `${s} ${b[s]}→${c[s]}`)
    if (statDelta.length || ids || b.era !== c.era || b.gender !== c.gender) {
      dataLines.push(`- ${c.figureName}: ${[...statDelta, ids ? `identities ${b.identities.join('/')}→${c.identities.join('/')}` : '', b.era !== c.era ? `era ${b.era}→${c.era}` : '', b.gender !== c.gender ? `gender ${b.gender}→${c.gender}` : ''].filter(Boolean).join(', ')}`)
    }
  }
  for (const b of before.cards) if (!after.cards.some(c => c.id === b.id)) { textLines.push(`- REMOVED card ${b.figureName}`); behavioural = true }
  if (textLines.length) sections.push(`## Card trait / achievement text (data/cards.json)\n\n${textLines.join('\n')}`)

  // Followers and locations: data only.
  const fLines: string[] = []
  for (const f of after.followers) {
    const b = before.followers.find(x => x.name === f.name)
    if (b && (b.bonus !== f.bonus || b.stat !== f.stat)) fLines.push(`- ${f.name}: ${b.stat} +${b.bonus} → ${f.stat} +${f.bonus}`)
  }
  let locChanged = 0
  for (const l of after.locationCards) {
    const b = before.locationCards.find(x => x.id === l.id)
    if (b && JSON.stringify(b) !== JSON.stringify(l)) locChanged++
  }
  const info = [...dataLines, ...fLines, locChanged ? `- ${locChanged} location card(s) changed (bonuses/capacity/trait text)` : ''].filter(Boolean)
  if (info.length) sections.push(`## Data-only changes (already live through data/*.json; no engine change expected)\n\n${info.join('\n')}`)

  return { report: sections.join('\n\n'), behavioural }
}

export function cardTextChanged(before: Card, after: Card): boolean {
  return before.trait !== after.trait || before.achievement !== after.achievement
}
