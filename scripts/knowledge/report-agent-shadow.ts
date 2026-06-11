import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

import type { InternalAgentShadowDiagnostics } from '@/lib/ai/agent/shadow'

export type AgentShadowReportInputRecord = {
  metadata?: Record<string, unknown> | null
  diagnostics?: Record<string, unknown> | null
  agentShadow?: unknown
  internalAgentShadow?: unknown
}

export type AgentShadowReportSummary = {
  total: number
  statusCounts: Record<string, number>
  plannedToolCounts: Record<string, number>
  observedToolCounts: Record<string, number>
  missingPlannedToolCounts: Record<string, number>
  extraObservedToolCounts: Record<string, number>
  reasonCounts: Record<string, number>
  averageDurationMs: number
  estimatedCreditsTotal: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1
}

function incrementMany(map: Record<string, number>, values: unknown): void {
  if (!isStringArray(values)) return
  for (const value of values) increment(map, value)
}

function normalizeShadow(value: unknown): InternalAgentShadowDiagnostics | null {
  if (!isRecord(value)) return null
  if (typeof value.status !== 'string') return null
  return value as InternalAgentShadowDiagnostics
}

export function extractAgentShadowDiagnostics(
  record: AgentShadowReportInputRecord
): InternalAgentShadowDiagnostics | null {
  return normalizeShadow(record.agentShadow)
    ?? normalizeShadow(record.internalAgentShadow)
    ?? normalizeShadow(record.metadata?.internal_agent_shadow)
    ?? normalizeShadow(record.metadata?.internalAgentShadow)
    ?? normalizeShadow(record.diagnostics?.internalAgentShadow)
    ?? normalizeShadow(record.diagnostics?.internal_agent_shadow)
}

export function summarizeAgentShadowTraces(
  records: AgentShadowReportInputRecord[]
): AgentShadowReportSummary {
  const summary: AgentShadowReportSummary = {
    total: 0,
    statusCounts: {},
    plannedToolCounts: {},
    observedToolCounts: {},
    missingPlannedToolCounts: {},
    extraObservedToolCounts: {},
    reasonCounts: {},
    averageDurationMs: 0,
    estimatedCreditsTotal: 0,
  }
  let durationTotal = 0

  for (const record of records) {
    const shadow = extractAgentShadowDiagnostics(record)
    if (!shadow) continue

    summary.total += 1
    increment(summary.statusCounts, shadow.status)
    if (shadow.reason) increment(summary.reasonCounts, shadow.reason)
    incrementMany(summary.plannedToolCounts, shadow.plannedTools)
    incrementMany(summary.observedToolCounts, shadow.observedTools)
    incrementMany(summary.missingPlannedToolCounts, shadow.missingPlannedTools)
    incrementMany(summary.extraObservedToolCounts, shadow.extraObservedTools)

    if (typeof shadow.durationMs === 'number' && Number.isFinite(shadow.durationMs)) {
      durationTotal += shadow.durationMs
    }
    if (typeof shadow.estimatedCredits === 'number' && Number.isFinite(shadow.estimatedCredits)) {
      summary.estimatedCreditsTotal += shadow.estimatedCredits
    }
  }

  summary.averageDurationMs = summary.total > 0 ? Math.round(durationTotal / summary.total) : 0
  return summary
}

function sortedEntries(map: Record<string, number>) {
  return Object.entries(map).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
}

function table(title: string, map: Record<string, number>) {
  const rows = sortedEntries(map)
  if (rows.length === 0) return '\n### ' + title + '\n\n_No entries._\n'

  return [
    '',
    '### ' + title,
    '',
    '| Value | Count |',
    '|---|---:|',
    ...rows.map(([value, count]) => '| ' + value + ' | ' + count + ' |'),
    '',
  ].join('\n')
}

export function formatAgentShadowReport(summary: AgentShadowReportSummary) {
  return [
    '# Internal Agent Shadow Report',
    '',
    'Total traces: ' + summary.total,
    'Average duration: ' + summary.averageDurationMs + ' ms',
    'Estimated credits: ' + Number(summary.estimatedCreditsTotal.toFixed(2)),
    table('Status', summary.statusCounts),
    table('Planned Tools', summary.plannedToolCounts),
    table('Observed Tools', summary.observedToolCounts),
    table('Missing Planned Tools', summary.missingPlannedToolCounts),
    table('Extra Observed Tools', summary.extraObservedToolCounts),
    table('Reasons', summary.reasonCounts),
  ].join('\n')
}

function readInputRecords(path: string): AgentShadowReportInputRecord[] {
  const raw = readFileSync(path, 'utf8').trim()
  if (!raw) return []

  if (path.endsWith('.jsonl')) {
    return raw
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as AgentShadowReportInputRecord)
  }

  const parsed = JSON.parse(raw) as unknown
  if (Array.isArray(parsed)) return parsed as AgentShadowReportInputRecord[]
  if (isRecord(parsed) && Array.isArray(parsed.records)) {
    return parsed.records as AgentShadowReportInputRecord[]
  }
  return [parsed as AgentShadowReportInputRecord]
}

function main() {
  const inputIndex = process.argv.findIndex((arg) => arg === '--input' || arg === '-i')
  const inputPath = inputIndex >= 0 ? process.argv[inputIndex + 1] : undefined
  if (!inputPath) {
    console.error('Usage: npx tsx scripts/knowledge/' + basename(__filename) + ' --input traces.jsonl')
    process.exit(1)
  }

  const records = readInputRecords(inputPath)
  console.log(formatAgentShadowReport(summarizeAgentShadowTraces(records)))
}

if (require.main === module) {
  main()
}
