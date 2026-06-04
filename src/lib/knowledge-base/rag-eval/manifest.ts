import path from 'node:path'
import type { RagEvalCase, RagEvalLanguage } from './types'

export type RagStoryFileManifest = {
  story: string
  notes?: string
  files: Array<{
    label: string
    localPath: string
    sourceUrl?: string
    sourcePage?: string
    sourceGroup?: string
    contentType?: string
    expectedTopics?: string[]
  }>
}

function parseJsonObject(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch (error) {
    throw new Error(`Invalid ${label} JSON: ${(error as Error).message}`)
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

function optionalStringArray(record: Record<string, unknown>, key: string, context: string) {
  const value = record[key]
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${context} ${key} must be an array of strings`)
  }
  return value.map((item) => item.trim()).filter(Boolean)
}

function optionalString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function optionalStringArrayGroups(record: Record<string, unknown>, key: string, context: string) {
  const value = record[key]
  if (value === undefined) return undefined
  if (
    !Array.isArray(value) ||
    value.some(
      (group) =>
        !Array.isArray(group) ||
        group.some((item) => typeof item !== 'string' || item.trim().length === 0)
    )
  ) {
    throw new Error(`${context} ${key} must be an array of string arrays`)
  }
  return (value as string[][]).map((group) => group.map((item) => item.trim()))
}

function parseLanguage(value: string): RagEvalLanguage {
  if (value === 'tr' || value === 'en' || value === 'unknown') return value
  throw new Error(`Unsupported benchmark case language: ${value}`)
}

export function parseBenchmarkCases(json: string): RagEvalCase[] {
  const parsed = parseJsonObject(json, 'benchmark cases')
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Benchmark file must contain at least one benchmark case')
  }

  return parsed.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Benchmark case #${index + 1} must be an object`)
    const context = `Benchmark case #${index + 1}`

    return {
      id: requireString(item, 'id', context),
      question: requireString(item, 'question', context),
      language: parseLanguage(requireString(item, 'language', context)),
      category: requireString(item, 'category', context),
      expectedAnswerTerms: optionalStringArray(item, 'expectedAnswerTerms', context),
      expectedAnyAnswerTermGroups: optionalStringArrayGroups(
        item,
        'expectedAnyAnswerTermGroups',
        context
      ),
      expectedSourceTerms: optionalStringArray(item, 'expectedSourceTerms', context),
      expectedAnySourceTermGroups: optionalStringArrayGroups(
        item,
        'expectedAnySourceTermGroups',
        context
      ),
      preferredSourceTerms: optionalStringArray(item, 'preferredSourceTerms', context),
      expectedAnyPreferredSourceTermGroups: optionalStringArrayGroups(
        item,
        'expectedAnyPreferredSourceTermGroups',
        context
      ),
      followupRequired:
        typeof item.followupRequired === 'boolean' ? item.followupRequired : undefined,
      followupForbidden:
        typeof item.followupForbidden === 'boolean' ? item.followupForbidden : undefined,
      expectedFollowupTerms: optionalStringArray(item, 'expectedFollowupTerms', context),
      expectedAnyFollowupTermGroups: optionalStringArrayGroups(
        item,
        'expectedAnyFollowupTermGroups',
        context
      ),
      mustNotContain: optionalStringArray(item, 'mustNotContain', context),
      unsupported: typeof item.unsupported === 'boolean' ? item.unsupported : undefined,
      notes: typeof item.notes === 'string' ? item.notes.trim() : undefined,
    }
  })
}

function assertExplicitFilePath(localPath: string) {
  const normalized = localPath.replace(/\\/g, '/').trim()
  const withoutTrailingSlash = normalized.replace(/\/+$/g, '')
  const lower = withoutTrailingSlash.toLocaleLowerCase('tr-TR')

  if (
    normalized.endsWith('/') ||
    lower === '.' ||
    lower === 'tmp' ||
    lower === './tmp' ||
    lower.endsWith('/tmp') ||
    normalized.includes('*')
  ) {
    throw new Error(
      `Story manifest files must use an exact file path, not a directory or glob: ${localPath}`
    )
  }

  const basename = path.basename(withoutTrailingSlash)
  if (!basename.includes('.')) {
    throw new Error(
      `Story manifest files must use an exact file path with an extension: ${localPath}`
    )
  }
}

export function parseStoryFileManifest(json: string, workspaceRoot: string): RagStoryFileManifest {
  const parsed = parseJsonObject(json, 'story file manifest')
  if (!isRecord(parsed)) throw new Error('Story file manifest must be an object')

  const story = requireString(parsed, 'story', 'Story file manifest')
  const files = parsed.files
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Story file manifest requires at least one file')
  }

  return {
    story,
    notes: typeof parsed.notes === 'string' ? parsed.notes.trim() : undefined,
    files: files.map((item, index) => {
      if (!isRecord(item)) throw new Error(`Story file #${index + 1} must be an object`)
      const context = `Story file #${index + 1}`
      const label = requireString(item, 'label', context)
      const localPath = requireString(item, 'localPath', context)
      assertExplicitFilePath(localPath)

      return {
        label,
        localPath: path.resolve(workspaceRoot, localPath),
        sourceUrl: optionalString(item, 'sourceUrl'),
        sourcePage: optionalString(item, 'sourcePage'),
        sourceGroup: optionalString(item, 'sourceGroup'),
        contentType: optionalString(item, 'contentType'),
        expectedTopics: optionalStringArray(item, 'expectedTopics', context),
      }
    }),
  }
}
