export type StatKey = 'politics' | 'strength' | 'culture' | 'wealth' | 'intelligence' | 'technique' | 'belief' | 'reputation'

export const STATS: StatKey[] = ['politics', 'strength', 'culture', 'wealth', 'intelligence', 'technique', 'belief', 'reputation']
export const STAT_LABEL: Record<StatKey, string> = {
  politics: 'Politics', strength: 'Strength', culture: 'Culture', wealth: 'Wealth',
  intelligence: 'Intelligence', technique: 'Technique', belief: 'Belief', reputation: 'Reputation',
}
export const ERAS = ['Ancient', 'Classical', 'Medieval', 'Renaissance', 'Steam', 'Electricity', 'Information']

export interface Card {
  id: string
  figureName: string
  era: string
  gender: string
  identities: string[]
  countries?: string[]
  lore: string
  portraitKey: string
  years: string
  /** Birth year (negative = BC). */
  born: number
  /** Death year, or null while living. */
  died: number | null
  /** Career start age; 18 when omitted. */
  careerAge?: number
  trait: string
  /** How the legacy is earned, in words (kept under this name for the mobile apps). */
  achievement: string
  legacy: Legacy
  politics: number
  strength: number
  culture: number
  wealth: number
  intelligence: number
  technique: number
  belief: number
  reputation: number
}

export type LegacyContext = 'attack' | 'defend' | 'survival' | 'competition' | 'any'
export const LEGACY_CONTEXTS: LegacyContext[] = ['attack', 'defend', 'survival', 'competition', 'any']

/** Mirrors web/src/types LegacyEffect: the engine applies each kind generically from the data. */
export type LegacyEffect =
  | { kind: 'contest'; stat: StatKey | 'any'; amount: number; context: LegacyContext }
  | { kind: 'follower'; stat: StatKey | 'any'; amount: number }
  | { kind: 'hazard_shield' }
  | { kind: 'longevity'; years: number }
  | { kind: 'prodigy'; years: number }
  | { kind: 'successors'; count: number }
  | { kind: 'slots'; count: number }
  | { kind: 'income'; card: 'event' | 'follower'; every: number }
export type LegacyKind = LegacyEffect['kind']
export const LEGACY_KINDS: LegacyKind[] = ['contest', 'follower', 'hazard_shield', 'longevity', 'prodigy', 'successors', 'slots', 'income']

export interface Legacy {
  name: string
  unlock: { stat: StatKey; wins: number }
  effect: LegacyEffect
  flavour?: string
}

export interface FollowerTemplate {
  name: string
  stat: StatKey
  bonus: number
  imageKey: string
}

export interface LocationCard {
  id: string
  name: string
  era: string
  imageKey: string
  countries: string[]
  buildings: string[]
  capacity: number
  bonuses: Partial<Record<StatKey, number>>
  trait: string
}

export interface LocationsFile {
  eras: string[]
  locations: { name: string; era: string; imageKey?: string; countries?: string[]; buildings?: string[] }[]
}

export type RuleStatus = 'implemented' | 'partial' | 'conflict' | 'missing' | 'unspecified'
export const RULE_STATUSES: RuleStatus[] = ['implemented', 'partial', 'conflict', 'missing', 'unspecified']

export interface Rule {
  id: string
  category: string
  title: string
  docText: string
  docSource: string
  codeBehaviour: string
  codeSource: string
  status: RuleStatus
  notes: string
}

export type FileKey = 'cards' | 'followers' | 'locationCards' | 'locations' | 'rules' | 'fightMd' | 'traitIdeaMd' | 'cardMd'

export interface FileContents {
  cards: Card[]
  followers: FollowerTemplate[]
  locationCards: LocationCard[]
  locations: LocationsFile
  rules: Rule[]
  fightMd: string
  traitIdeaMd: string
  cardMd: string
}

export interface FileMeta { key: FileKey; path: string; kind: 'json' | 'md' }

// ─── Engine jobs (headless Claude Code runs started by a save) ───────────────

export interface JobLogEntry { t: number; kind: 'text' | 'tool' | 'result' | 'error' | 'info'; text: string }
export interface JobTouched { path: string; status: string; dirtyBefore: boolean; existedBefore: boolean }
export interface EngineJob {
  id: string
  startedAt: number
  finishedAt?: number
  mode: EngineMode
  /** running → review (preview only) → applied; or failed / discarded / reverted. */
  status: 'running' | 'review' | 'applied' | 'failed' | 'discarded' | 'reverted'
  autoCommit: boolean
  commit?: CommitResult
  note?: string
  report: string
  instruction: string
  log: JobLogEntry[]
  result?: string
  costUsd?: number
  touched: JobTouched[]
  diff: string
  typecheck?: { web?: string; studio?: string }
}

/** apply: the agent edits the repo directly. preview: it edits an isolated snapshot and waits for approval. */
export type EngineMode = 'apply' | 'preview'
export interface CommitResult { ok: boolean; sha?: string; branch?: string; nothing?: boolean; error?: string; paths: string[] }
