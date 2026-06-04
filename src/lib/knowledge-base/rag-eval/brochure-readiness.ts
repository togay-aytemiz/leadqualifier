import path from 'node:path'

type VectorStoreFileCounts = {
  total?: number
  completed?: number
  failed?: number
  cancelled?: number
  in_progress?: number
}

export type BrochureVectorStoreSnapshot = {
  id?: string
  name?: string
  status?: string
  usage_bytes?: number
  expires_at?: number | null
  expires_after?: {
    anchor?: string
    days?: number
  } | null
  file_counts?: VectorStoreFileCounts | null
}

export type BrochureSourceContentType =
  | 'brochure_pdf'
  | 'brochure_verified_markdown'
  | 'website_page'
  | 'website_package'
  | 'approved_pdf'
  | 'approved_contact_sheet'
  | 'approved_question_sheet'

export type BrochureSourceManifestRow = {
  corpusScope: string
  openaiFileId: string
  filename: string
  approvedSourceTitle: string
  approvedSourceUrl?: string
  displayLabel: string
  pageLabel?: string
  contentType: BrochureSourceContentType
  customerApproved: boolean
}

export type BrochureSourceManifest = {
  corpusScope: string
  sources: BrochureSourceManifestRow[]
}

export type BrochureSourceManifestJson = {
  corpus_scope: string
  sources: Array<{
    openai_file_id: string
    filename: string
    approved_source_title: string
    approved_source_url?: string
    display_label: string
    page_label?: string
    content_type: BrochureSourceContentType
    customer_approved: boolean
  }>
}

export type BrochureVectorStoreReadinessResult = {
  ready: boolean
  failures: string[]
  warnings: string[]
  vectorStoreId?: string
  usageBytes: number
}

function parseJsonObject(json: string): unknown {
  try {
    return JSON.parse(json) as unknown
  } catch (error) {
    throw new Error(`Invalid brochure source manifest JSON: ${(error as Error).message}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(record: Record<string, unknown>, key: string, context: string) {
  const value = record[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${context} requires a non-empty ${key}`)
  }
  return value.trim()
}

function optionalString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function requireBoolean(record: Record<string, unknown>, key: string, context: string) {
  const value = record[key]
  if (typeof value !== 'boolean') throw new Error(`${context} requires boolean ${key}`)
  return value
}

function parseContentType(value: string, context: string): BrochureSourceContentType {
  if (
    value === 'brochure_pdf' ||
    value === 'brochure_verified_markdown' ||
    value === 'website_page' ||
    value === 'website_package' ||
    value === 'approved_pdf' ||
    value === 'approved_contact_sheet' ||
    value === 'approved_question_sheet'
  ) {
    return value
  }
  throw new Error(`${context} has unsupported content_type: ${value}`)
}

export function parseBrochureSourceManifest(json: string): BrochureSourceManifest {
  const parsed = parseJsonObject(json)
  if (!isRecord(parsed)) throw new Error('Brochure source manifest must be an object')

  const corpusScope = requireString(parsed, 'corpus_scope', 'Brochure source manifest')
  const sources = parsed.sources
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error('Brochure source manifest requires at least one source')
  }

  return {
    corpusScope,
    sources: sources.map((source, index) => {
      if (!isRecord(source)) throw new Error(`Brochure source #${index + 1} must be an object`)
      const context = `Brochure source #${index + 1}`
      const rowCorpusScope = optionalString(source, 'corpus_scope') ?? corpusScope
      return {
        corpusScope: rowCorpusScope,
        openaiFileId: requireString(source, 'openai_file_id', context),
        filename: requireString(source, 'filename', context),
        approvedSourceTitle: requireString(source, 'approved_source_title', context),
        approvedSourceUrl: optionalString(source, 'approved_source_url'),
        displayLabel: requireString(source, 'display_label', context),
        pageLabel: optionalString(source, 'page_label'),
        contentType: parseContentType(requireString(source, 'content_type', context), context),
        customerApproved: requireBoolean(source, 'customer_approved', context),
      }
    }),
  }
}

export function buildCitationSourcesByFilename(manifest: BrochureSourceManifest) {
  return Object.fromEntries(
    manifest.sources
      .filter((source) => source.customerApproved)
      .map((source) => [
        source.filename,
        {
          title: source.pageLabel
            ? `${source.displayLabel} - ${source.pageLabel}`
            : source.displayLabel,
          url: source.approvedSourceUrl,
        },
      ])
  )
}

function legacyCitationSourcesByFilename(parsed: Record<string, unknown>) {
  const files = parsed.files
  if (!Array.isArray(files)) {
    throw new Error('Source manifest must contain either sources or files')
  }

  return Object.fromEntries(
    files
      .filter((file): file is Record<string, unknown> => isRecord(file))
      .filter((file) => typeof file.localPath === 'string')
      .map((file) => {
        const localPath = String(file.localPath)
        const title = typeof file.label === 'string' ? file.label : undefined
        const url = typeof file.sourceUrl === 'string' ? file.sourceUrl : undefined
        return [
          path.basename(localPath),
          {
            title,
            url,
          },
        ]
      })
  )
}

export function buildCitationSourcesByFilenameFromManifestJson(json: string) {
  const parsed = parseJsonObject(json)
  if (!isRecord(parsed)) throw new Error('Source manifest must be an object')
  if (Array.isArray(parsed.sources)) {
    return buildCitationSourcesByFilename(parseBrochureSourceManifest(json))
  }
  return legacyCitationSourcesByFilename(parsed)
}

export function buildBrochureSourceManifestFromIndexedFiles(input: {
  corpusScope: string
  files: Array<{
    label: string
    localPath?: string
    basename?: string
    openaiFileId: string
    sourceUrl?: string
    contentType?: BrochureSourceContentType
    customerApproved?: boolean
  }>
}): BrochureSourceManifestJson {
  return {
    corpus_scope: input.corpusScope,
    sources: input.files.map((file) => {
      const filename = file.basename ?? (file.localPath ? path.basename(file.localPath) : '')
      if (!filename) {
        throw new Error(`Indexed file ${file.openaiFileId} requires a filename or localPath`)
      }
      return {
        openai_file_id: file.openaiFileId,
        filename,
        approved_source_title: file.label,
        ...(file.sourceUrl ? { approved_source_url: file.sourceUrl } : {}),
        display_label: file.label,
        content_type: file.contentType ?? 'brochure_pdf',
        customer_approved: file.customerApproved ?? true,
      }
    }),
  }
}

function fileCount(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0
}

export function evaluateBrochureVectorStoreReadiness(input: {
  vectorStore: BrochureVectorStoreSnapshot
  expectedFileCount: number
  sourceManifest: BrochureSourceManifest
}): BrochureVectorStoreReadinessResult {
  const failures: string[] = []
  const warnings: string[] = []
  const counts = input.vectorStore.file_counts ?? {}
  const total = fileCount(counts.total)
  const completed = fileCount(counts.completed)
  const failed = fileCount(counts.failed)
  const cancelled = fileCount(counts.cancelled)
  const inProgress = fileCount(counts.in_progress)
  const usageBytes = fileCount(input.vectorStore.usage_bytes)

  if (input.vectorStore.status !== 'completed') {
    failures.push('Vector store status must be completed')
  }
  if (total !== input.expectedFileCount) {
    failures.push('Vector store file count must match the approved manifest')
  }
  if (completed !== input.expectedFileCount) {
    failures.push('Vector store completed file count must match the approved manifest')
  }
  if (failed > 0) failures.push('Vector store has failed files')
  if (cancelled > 0) failures.push('Vector store has cancelled files')
  if (inProgress > 0) failures.push('Vector store still has in-progress files')
  if (input.sourceManifest.sources.length !== input.expectedFileCount) {
    failures.push('Source manifest row count must match the approved manifest')
  }
  if (input.sourceManifest.sources.some((source) => !source.customerApproved)) {
    failures.push('Source manifest has unapproved visitor-visible rows')
  }
  if (input.sourceManifest.sources.some((source) => !source.openaiFileId || !source.filename)) {
    failures.push('Source manifest rows must include OpenAI file ids and filenames')
  }
  if (
    input.sourceManifest.sources.some(
      (source) => !source.displayLabel || !source.approvedSourceTitle
    )
  ) {
    failures.push('Source manifest rows must include approved visitor-safe labels')
  }
  if (!input.vectorStore.expires_after && !input.vectorStore.expires_at) {
    warnings.push('Vector store lifecycle is not explicit')
  }
  if (usageBytes === 0) warnings.push('Vector store usage size is zero or missing')

  return {
    ready: failures.length === 0,
    failures,
    warnings,
    vectorStoreId: input.vectorStore.id,
    usageBytes,
  }
}
