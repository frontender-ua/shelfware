// Domain types of spec §4 plus the API payload shapes of spec §9.
// Auto-imported in both the app and the server context; pure modules import
// them explicitly with `import type { … } from '#shared/types/catalog'`.

export type RootKind = 'user' | 'builtin' | 'plugin' | 'quarantine'

export interface Root {
  scopeId: string
  scopeLabel: string
  root: string
  kind: RootKind
  recursive: boolean
  deep?: boolean
  fromScope?: string
}

export type Severity = 'none' | 'low' | 'medium' | 'high' | 'critical'
export type Physicality = 'physical' | 'reference' | 'broken'
export type Invocation = 'hook' | 'user' | 'model' | 'off'

export interface Origin {
  kind: 'github' | 'url'
  label: string
  url: string
  via: 'frontmatter' | 'path' | 'plugin' | 'git'
  certainty: 'attested' | 'inferred'
}

export interface AuditRule {
  rule: string
  severity: Exclude<Severity, 'none'>
  pattern: RegExp
  message: string
}

export interface AuditFinding {
  severity: Severity
  rule: string
  message: string
  file: string
  line: number
}

export interface CopyRef {
  id: string
  scopeLabel: string
  path: string
}

export interface SkillCard {
  id: string
  name: string
  slug: string
  description: string
  scopeId: string
  scopeLabel: string
  kind: RootKind
  path: string
  skillRel: string
  file: boolean
  link: boolean
  linkTarget: string
  origin: Origin | null
  invocation: Invocation
  invocationEvidence: string
  risk: Severity
  physicality: Physicality
  refTarget: string
  refSkillId: string
  copyCount: number
  copies: CopyRef[]
  mtime: number
  quarantined: boolean
  fromScope: string
  skillSize: number
  tokenEstimate: number
}

export interface SkillFileEntry {
  path: string
  size: number
  mtime: number
}

export interface SkillDetail extends SkillCard {
  frontmatter: Record<string, unknown>
  frontmatterRaw: string
  body: string
  source: string
  files: SkillFileEntry[]
  bytes: number
  findings: AuditFinding[]
  contentHash: string | null
  quarantinedFrom?: string
  quarantinedAt?: number
}

export interface Census {
  total: number
  physical: number
  unique: number
  duplicateCopies: number
  duplicateBytes: number
  references: number
  broken: number
  duplicates: number
  tokenEstimate: number
}

export interface QuarantineEntry {
  quarantinePath: string
  originPath: string
  name: string
  slug: string
  scopeId: string
  scopeLabel: string
  kind: RootKind
  file: boolean
  link: boolean
  quarantinedAt: number
}

export interface QuarantineManifest {
  version: 1
  entries: QuarantineEntry[]
}

export interface ScopeSummary {
  id: string
  label: string
  kind: RootKind
  count: number
}

export interface CatalogResponse {
  home: string
  scannedAt: number
  quarantineRoot: string
  total: number
  census: Census
  scopes: ScopeSummary[]
  skills: SkillCard[]
}

export interface FilePreview {
  path: string
  size: number
  binary: boolean
  content: string | null
}

export interface BatchError {
  id: string
  error: string
  path?: string
}

export interface MoveRecord {
  id: string
  name: string
  from: string
  to: string
}

export interface QuarantineResult {
  quarantined: MoveRecord[]
  errors: BatchError[]
}

export interface RestoreResult {
  restored: MoveRecord[]
  errors: BatchError[]
}

export interface DeleteResult {
  deleted: { id: string, path: string, name: string }[]
  errors: BatchError[]
}

export interface DeleteEffect {
  action: 'unlink' | 'delete-file' | 'delete-folder'
  label: 'Unlink' | 'Delete file' | 'Delete folder'
  path: string
  note: string
}

export interface SaveRequest {
  source: string
  baseHash: string
}
