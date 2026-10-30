/** Minimal Markdown → HTML for the design docs (headings, lists, tables, code, bold/italic). */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
}
export function renderMarkdown(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let i = 0
  let list: 'ul' | 'ol' | null = null
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null } }
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      closeList()
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++])
      i++
      out.push(`<pre>${esc(buf.join('\n'))}</pre>`)
      continue
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) { closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      closeList()
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()))
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]))
      out.push(`<table><thead><tr>${head.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
      continue
    }
    const ul = /^\s*[-*]\s+(.*)$/.exec(line)
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line)
    if (ul || ol) {
      const kind = ul ? 'ul' : 'ol'
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`)
      i++; continue
    }
    if (line.trim() === '') { closeList(); i++; continue }
    closeList()
    out.push(`<p>${inline(line)}</p>`)
    i++
  }
  closeList()
  return out.join('\n')
}

export interface TraitIdea { name: string; trait: string; achievement: string }

/** Parse docs/great-people-trait-idea.md ("# Name: Trait – text" + "Achievement: …"). */
export function parseTraitIdeas(md: string): TraitIdea[] {
  const ideas: TraitIdea[] = []
  let cur: TraitIdea | null = null
  for (const line of md.split('\n')) {
    const h = /^#\s+([^:]+):\s*(.*)$/.exec(line)
    if (h) { cur = { name: h[1].trim(), trait: h[2].trim(), achievement: '' }; ideas.push(cur); continue }
    const a = /^Achievement:\s*(.*)$/.exec(line)
    if (a && cur) cur.achievement = a[1].trim()
  }
  return ideas
}

const ALIASES: Record<string, string> = { gutenburg: 'gutenberg', ana: 'anna', mao: 'mao zedong', turing: 'alan turing', schumann: 'robert schumann', clara: 'clara schumann', mulan: 'hua mulan', lorentz: 'hendrik lorentz', gandhi: 'mohandas gandhi', mendel: 'gregor mendel', chanel: 'coco chanel', musashi: 'miyamoto musashi' }

export function matchIdeaToFigure(ideaName: string, figureNames: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
  let n = norm(ideaName)
  n = n.split(' ').map(w => ALIASES[w] ?? w).join(' ')
  const exact = figureNames.find(f => norm(f) === n)
  if (exact) return exact
  const tokens = n.split(' ').filter(w => w.length >= 4)
  const hit = figureNames.filter(f => tokens.some(tk => norm(f).includes(tk)))
  return hit.length === 1 ? hit[0] : hit.find(f => norm(f).includes(n)) ?? null
}
