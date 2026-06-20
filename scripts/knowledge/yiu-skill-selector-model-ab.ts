import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { buildSkillEmbeddingTexts } from '@/lib/skills/embeddings'
import { buildYiuActiveIntentUnion } from '../skills/push-yiu-intent-skill-pack'

const FIXTURE_PATH = 'scripts/knowledge/fixtures/yiu-skill-selector-focused-cases.json'
const FROZEN_PAYLOAD_PATH = 'docs/evaluations/yiu-skill-selector-frozen-payloads-2026-06-20.json'
const DEMO_SLUG = 'yiu-tanitim-gunleri-2026'
const EMBEDDING_MODEL = 'text-embedding-3-small'
const MATCH_THRESHOLD = 0.35
const CANDIDATE_LIMIT = 20
const MAX_TEXT_CHARS = 600
const TRANSPORT_DIR = '/tmp/yiu-skill-selector-model-ab'

export type FocusedCaseDefinition = {
    caseId: string
    latestUserMessage: string
    standaloneQuery: string
    subject: string | null
    facet: string | null
    candidateQueries: string[]
    expectedSkillId: string | null
    expectedSkillTitle: string | null
}

type CandidateRow = {
    skill_id: string
    title: string
    response_text: string
    routing_description?: string | null
    coverage_facets?: string[] | null
    trigger_text: string
    similarity: number
}

type EmbeddedCandidateRow = CandidateRow & {
    embedding: number[]
}

type FrozenCandidate = {
    skill_id: string
    title: string
    trigger: string
    routing_description: string
    coverage_facets: string[]
    response_summary: string
    similarity: number
}

export type FrozenSelectorCase = FocusedCaseDefinition & {
    selectorInput: {
        latest_user_message: string
        standalone_query: string
        subject: string | null
        facet: string | null
        candidates: FrozenCandidate[]
    }
}

type FrozenPayloadArtifact = {
    schemaVersion: 1
    capturedAt: string
    demoSlug: string
    embeddingModel: string
    matchThreshold: number
    candidateLimit: number
    captureMode?: 'linked_rpc' | 'local_corpus_replay'
    cases: FrozenSelectorCase[]
}

type ModelConfig = {
    id: string
    model: string
    reasoningEffort: 'none' | 'low' | null
}

export const MODEL_CONFIGS: readonly ModelConfig[] = [
    { id: 'gpt-4.1-mini', model: 'gpt-4.1-mini', reasoningEffort: null },
    { id: 'gpt-5.5-none', model: 'gpt-5.5', reasoningEffort: 'none' },
    { id: 'gpt-5.5-low', model: 'gpt-5.5', reasoningEffort: 'low' },
]

const SELECTOR_INSTRUCTIONS = [
    'Select one supplied Skill only when its response_summary directly answers the latest user message.',
    'The selected Skill must match the exact requested entity, scope, and facet and must contain the actual answer or a clear equivalent.',
    'The standalone query may resolve references, but it must not broaden, soften, or replace the requested outcome.',
    'routing_description and coverage_facets are scope context, not answer evidence.',
    'Related topics, nearby entities, broader background, partial answers, and answers requiring retrieval must return skill_id null.',
    'Broad all-program, all-campus, all-price, all-quota, or university-wide requests require a response_summary covering that broad set.',
    'Do not choose the nearest candidate merely because candidates were supplied. Returning skill_id null is the normal File Search route.',
    'Do not answer the user question.',
].join('\n')

const SELECTOR_OUTPUT_FORMAT = {
    type: 'json_schema' as const,
    name: 'skill_selector_decision',
    strict: true,
    schema: {
        type: 'object',
        properties: {
            skill_id: { type: ['string', 'null'] },
            coverage: { type: 'string', enum: ['direct', 'partial', 'none'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reason: { type: 'string' },
        },
        required: ['skill_id', 'coverage', 'confidence', 'reason'],
        additionalProperties: false,
    },
}

type SelectorResponseRequest = {
    model: string
    instructions: string
    input: string
    max_output_tokens: number
    store: boolean
    text: { format: typeof SELECTOR_OUTPUT_FORMAT }
    reasoning?: { effort: 'none' | 'low' }
}

export type ParsedSelectorOutput = {
    skillId: string | null
    coverage: 'direct' | 'partial' | 'none'
    confidence: number
    reason: string
}

export type SelectorRunResult = {
    configId: string
    caseId: string
    repeat: number
    selectedSkillId: string | null
    coverage: 'direct' | 'partial' | 'none'
    confidence: number
    reason: string
    latencyMs: number
    inputTokens: number
    outputTokens: number
    totalTokens: number
    error: string | null
}

type ConfigScore = {
    configId: string
    totalRuns: number
    successfulRuns: number
    exactSelections: number
    exactSelectionAccuracy: number
    falseSkillSelections: number
    falseSkillRate: number
    positiveSkillRecall: number
    p50LatencyMs: number
    p90LatencyMs: number
    averageInputTokens: number
    averageOutputTokens: number
    averageTotalTokens: number
    releaseGatePassed: boolean
}

function normalizeText(value: unknown, maxLength: number) {
    return typeof value === 'string'
        ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim()
        : ''
}

function normalizeConfidence(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(parsed)) return 0
    return Math.max(0, Math.min(1, parsed))
}

export function validateFocusedCases(cases: FocusedCaseDefinition[]) {
    if (cases.length !== 10) throw new Error(`Expected 10 focused cases, received ${cases.length}`)

    const caseIds = cases.map((item) => item.caseId)
    if (new Set(caseIds).size !== caseIds.length) throw new Error('Focused case ids must be unique')

    const negativeCount = cases.filter((item) => item.expectedSkillId === null).length
    const positiveIds = cases
        .map((item) => item.expectedSkillId)
        .filter((value): value is string => Boolean(value))

    if (negativeCount !== 8 || positiveIds.length !== 2) {
        throw new Error('Focused fixture must contain eight File Search cases and two Skill controls')
    }

    const expectedPositiveIds = [
        '720c2468-54a2-4d83-9491-570fd1ba6c5c',
        'e9a21cf5-4dea-4943-a3af-8deca5bbd120',
    ]
    if (JSON.stringify(positiveIds) !== JSON.stringify(expectedPositiveIds)) {
        throw new Error('Focused fixture positive controls changed unexpectedly')
    }

    for (const item of cases) {
        if (!item.caseId.trim() || !item.latestUserMessage.trim() || !item.standaloneQuery.trim()) {
            throw new Error(`Focused case ${item.caseId || '<missing>'} is incomplete`)
        }
        if (item.candidateQueries.length === 0 || item.candidateQueries.some((query) => !query.trim())) {
            throw new Error(`Focused case ${item.caseId} has no candidate queries`)
        }
    }
}

export function buildFrozenCase(
    definition: FocusedCaseDefinition,
    candidates: CandidateRow[]
): FrozenSelectorCase {
    if (candidates.length > CANDIDATE_LIMIT) {
        throw new Error(`Case ${definition.caseId} exceeds the ${CANDIDATE_LIMIT}-candidate selector limit`)
    }

    const candidateIds = candidates.map((candidate) => candidate.skill_id)
    if (new Set(candidateIds).size !== candidateIds.length) {
        throw new Error(`Case ${definition.caseId} contains duplicate Skill candidates`)
    }
    if (definition.expectedSkillId && !candidateIds.includes(definition.expectedSkillId)) {
        throw new Error(`Expected Skill ${definition.expectedSkillId} is absent from case ${definition.caseId}`)
    }

    return {
        ...definition,
        selectorInput: {
            latest_user_message: normalizeText(definition.latestUserMessage, MAX_TEXT_CHARS),
            standalone_query: normalizeText(definition.standaloneQuery, MAX_TEXT_CHARS),
            subject: normalizeText(definition.subject, 180) || null,
            facet: normalizeText(definition.facet, 180) || null,
            candidates: candidates.map((candidate) => ({
                skill_id: candidate.skill_id,
                title: normalizeText(candidate.title, 220),
                trigger: normalizeText(candidate.trigger_text, 260),
                routing_description: normalizeText(candidate.routing_description, MAX_TEXT_CHARS),
                coverage_facets: (candidate.coverage_facets ?? [])
                    .map((facet) => normalizeText(facet, 80))
                    .filter(Boolean)
                    .slice(0, 14),
                response_summary: normalizeText(candidate.response_text, MAX_TEXT_CHARS),
                similarity: candidate.similarity,
            })),
        },
    }
}

function cosineSimilarity(left: number[], right: number[]) {
    if (left.length === 0 || left.length !== right.length) return -1
    let dotProduct = 0
    let leftMagnitude = 0
    let rightMagnitude = 0
    for (let index = 0; index < left.length; index += 1) {
        const leftValue = left[index] ?? 0
        const rightValue = right[index] ?? 0
        dotProduct += leftValue * rightValue
        leftMagnitude += leftValue * leftValue
        rightMagnitude += rightValue * rightValue
    }
    if (leftMagnitude === 0 || rightMagnitude === 0) return -1
    return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude))
}

export function rankUniqueSkillCandidates(
    queryEmbedding: number[],
    rows: EmbeddedCandidateRow[],
    threshold: number,
    limit: number
) {
    const bestBySkillId = new Map<string, CandidateRow>()
    for (const row of rows) {
        const similarity = cosineSimilarity(queryEmbedding, row.embedding)
        if (similarity < threshold) continue
        const { embedding: _embedding, ...candidate } = row
        const scoredCandidate = { ...candidate, similarity }
        const existing = bestBySkillId.get(row.skill_id)
        if (!existing || scoredCandidate.similarity > existing.similarity) {
            bestBySkillId.set(row.skill_id, scoredCandidate)
        }
    }
    return Array.from(bestBySkillId.values())
        .sort((left, right) => right.similarity - left.similarity)
        .slice(0, limit)
}

export function buildSelectorRequest(
    frozenCase: FrozenSelectorCase,
    config: ModelConfig
): SelectorResponseRequest {
    return {
        model: config.model,
        instructions: SELECTOR_INSTRUCTIONS,
        input: JSON.stringify(frozenCase.selectorInput),
        max_output_tokens: 400,
        store: false,
        text: { format: SELECTOR_OUTPUT_FORMAT },
        ...(config.reasoningEffort
            ? { reasoning: { effort: config.reasoningEffort } }
            : {}),
    }
}

export function parseSelectorOutput(value: string): ParsedSelectorOutput {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const rawSkillId = parsed.skill_id
    const skillId = rawSkillId === null
        ? null
        : (typeof rawSkillId === 'string' && rawSkillId.trim() ? rawSkillId.trim() : null)
    const coverage = parsed.coverage
    if (coverage !== 'direct' && coverage !== 'partial' && coverage !== 'none') {
        throw new Error('Selector output has invalid coverage')
    }
    const reason = normalizeText(parsed.reason, 500)
    if (!reason) throw new Error('Selector output has no reason')

    return {
        skillId,
        coverage,
        confidence: normalizeConfidence(parsed.confidence),
        reason,
    }
}

export function parseResponsesApiOutput(payload: unknown) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Invalid Responses API payload')
    }
    const record = payload as Record<string, unknown>
    if (record.error) {
        const errorRecord = record.error as Record<string, unknown>
        throw new Error(normalizeText(errorRecord.message, 500) || 'Responses API error')
    }
    const output = Array.isArray(record.output) ? record.output : []
    let outputText = ''
    for (const item of output) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue
        const content = Array.isArray((item as Record<string, unknown>).content)
            ? (item as Record<string, unknown>).content as unknown[]
            : []
        for (const part of content) {
            if (!part || typeof part !== 'object' || Array.isArray(part)) continue
            const partRecord = part as Record<string, unknown>
            if (partRecord.type === 'output_text' && typeof partRecord.text === 'string') {
                outputText += partRecord.text
            }
        }
    }
    if (!outputText) throw new Error('Responses API payload has no output text')
    const usage = record.usage && typeof record.usage === 'object' && !Array.isArray(record.usage)
        ? record.usage as Record<string, unknown>
        : {}
    return {
        outputText,
        inputTokens: Number(usage.input_tokens) || 0,
        outputTokens: Number(usage.output_tokens) || 0,
        totalTokens: Number(usage.total_tokens) || 0,
    }
}

function percentile(values: number[], percentileValue: number) {
    if (values.length === 0) return 0
    const sorted = [...values].sort((left, right) => left - right)
    const position = (sorted.length - 1) * percentileValue
    const lowerIndex = Math.floor(position)
    const upperIndex = Math.ceil(position)
    const lower = sorted[lowerIndex] ?? 0
    const upper = sorted[upperIndex] ?? lower
    return Math.round(lower + (upper - lower) * (position - lowerIndex))
}

function average(values: number[]) {
    if (values.length === 0) return 0
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

export function scoreSelectorRuns(
    cases: FocusedCaseDefinition[],
    runs: SelectorRunResult[],
    configId: string
): ConfigScore {
    const expectedByCaseId = new Map(cases.map((item) => [item.caseId, item.expectedSkillId]))
    const configRuns = runs.filter((run) => run.configId === configId)
    const successfulRuns = configRuns.filter((run) => run.error === null)
    const exactSelections = successfulRuns.filter((run) => (
        run.selectedSkillId === expectedByCaseId.get(run.caseId)
    )).length
    const negativeRuns = successfulRuns.filter((run) => expectedByCaseId.get(run.caseId) === null)
    const falseSkillSelections = negativeRuns.filter((run) => run.selectedSkillId !== null).length
    const positiveRuns = successfulRuns.filter((run) => expectedByCaseId.get(run.caseId) !== null)
    const correctPositiveRuns = positiveRuns.filter((run) => (
        run.selectedSkillId === expectedByCaseId.get(run.caseId)
    )).length
    const exactSelectionAccuracy = successfulRuns.length > 0
        ? exactSelections / successfulRuns.length
        : 0
    const falseSkillRate = negativeRuns.length > 0
        ? falseSkillSelections / negativeRuns.length
        : 0
    const positiveSkillRecall = positiveRuns.length > 0
        ? correctPositiveRuns / positiveRuns.length
        : 0

    return {
        configId,
        totalRuns: configRuns.length,
        successfulRuns: successfulRuns.length,
        exactSelections,
        exactSelectionAccuracy,
        falseSkillSelections,
        falseSkillRate,
        positiveSkillRecall,
        p50LatencyMs: percentile(successfulRuns.map((run) => run.latencyMs), 0.5),
        p90LatencyMs: percentile(successfulRuns.map((run) => run.latencyMs), 0.9),
        averageInputTokens: average(successfulRuns.map((run) => run.inputTokens)),
        averageOutputTokens: average(successfulRuns.map((run) => run.outputTokens)),
        averageTotalTokens: average(successfulRuns.map((run) => run.totalTokens)),
        releaseGatePassed: configRuns.length > 0
            && successfulRuns.length === configRuns.length
            && falseSkillSelections === 0
            && positiveSkillRecall === 1,
    }
}

function parseEnvValue(value: string) {
    const trimmed = value.trim()
    if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
        || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1)
    }
    return trimmed
}

async function loadEnvFile(filePath: string, protectedKeys: Set<string>) {
    try {
        const content = await readFile(filePath, 'utf8')
        for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) continue
            const equalsIndex = trimmed.indexOf('=')
            if (equalsIndex === -1) continue
            const key = trimmed.slice(0, equalsIndex).trim().replace(/^export\s+/u, '')
            if (!key || protectedKeys.has(key)) continue
            process.env[key] = parseEnvValue(trimmed.slice(equalsIndex + 1))
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
}

async function loadLocalEnv() {
    const protectedKeys = new Set(Object.keys(process.env))
    await loadEnvFile(path.resolve('.env.local'), protectedKeys)
    await loadEnvFile(path.resolve('.env'), protectedKeys)
}

function requireEnv(name: string) {
    const value = process.env[name]?.trim()
    if (!value) throw new Error(`Missing ${name}`)
    return value
}

async function readFocusedFixture() {
    const cases = JSON.parse(await readFile(FIXTURE_PATH, 'utf8')) as FocusedCaseDefinition[]
    validateFocusedCases(cases)
    return cases
}

function mergeCandidateGroups(groups: CandidateRow[][]) {
    const bySkillId = new Map<string, CandidateRow>()
    for (const group of groups) {
        for (const candidate of group) {
            const existing = bySkillId.get(candidate.skill_id)
            if (!existing || candidate.similarity > existing.similarity) {
                bySkillId.set(candidate.skill_id, candidate)
            }
        }
    }
    return Array.from(bySkillId.values())
        .sort((left, right) => right.similarity - left.similarity)
        .slice(0, CANDIDATE_LIMIT)
}

async function captureFrozenPayloads() {
    await loadLocalEnv()
    const cases = await readFocusedFixture()
    const openai = new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY'), timeout: 45_000, maxRetries: 1 })
    const supabase = createClient(
        requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
        requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
        { auth: { persistSession: false } }
    )

    const { data: channel, error: channelError } = await supabase
        .from('demo_chat_channels')
        .select('organization_id')
        .eq('slug', DEMO_SLUG)
        .single()
    if (channelError) throw channelError

    const uniqueQueries = Array.from(new Set(cases.flatMap((item) => item.candidateQueries)))
    const embeddingResponse = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: uniqueQueries,
        dimensions: 1536,
    })
    const embeddingByQuery = new Map(uniqueQueries.map((query, index) => [
        query,
        embeddingResponse.data[index]?.embedding,
    ]))

    const frozenCases: FrozenSelectorCase[] = []
    for (const definition of cases) {
        const groups = await Promise.all(definition.candidateQueries.map(async (query) => {
            const embedding = embeddingByQuery.get(query)
            if (!embedding) throw new Error(`Missing embedding for ${query}`)
            const { data, error } = await supabase.rpc('match_skills', {
                query_embedding: `[${embedding.join(',')}]`,
                org_id: channel.organization_id,
                match_threshold: MATCH_THRESHOLD,
                match_count: CANDIDATE_LIMIT,
            })
            if (error) throw error
            const rows = (data ?? []) as CandidateRow[]
            const ids = rows.map((row) => row.skill_id)
            if (new Set(ids).size !== ids.length) {
                throw new Error(`RPC returned duplicate Skill ids for query: ${query}`)
            }
            return rows
        }))
        frozenCases.push(buildFrozenCase(definition, mergeCandidateGroups(groups)))
    }

    const artifact: FrozenPayloadArtifact = {
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        demoSlug: DEMO_SLUG,
        embeddingModel: EMBEDDING_MODEL,
        matchThreshold: MATCH_THRESHOLD,
        candidateLimit: CANDIDATE_LIMIT,
        captureMode: 'linked_rpc',
        cases: frozenCases,
    }
    await writeFile(FROZEN_PAYLOAD_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify({
        mode: 'capture',
        output: FROZEN_PAYLOAD_PATH,
        cases: frozenCases.length,
        candidateCounts: frozenCases.map((item) => ({
            caseId: item.caseId,
            count: item.selectorInput.candidates.length,
            unique: new Set(item.selectorInput.candidates.map((candidate) => candidate.skill_id)).size,
        })),
    }, null, 2))
}

async function createEmbeddings(openai: OpenAI, texts: string[]) {
    const embeddings: number[][] = []
    const batchSize = 128
    for (let index = 0; index < texts.length; index += batchSize) {
        const batch = texts.slice(index, index + batchSize)
        const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: batch,
            dimensions: 1536,
        })
        embeddings.push(...response.data.map((item) => item.embedding))
    }
    if (embeddings.length !== texts.length) {
        throw new Error(`Expected ${texts.length} embeddings, received ${embeddings.length}`)
    }
    return embeddings
}

async function buildLocalCorpusRowInputs(cases: FocusedCaseDefinition[]) {
    const [baseMarkdown, brochureMarkdown] = await Promise.all([
        readFile('docs/evaluations/yiu-intent-skill-pack-v2-2026-06-13.md', 'utf8'),
        readFile('src/lib/knowledge-base/provider-data/yiu-2025-brochure-verified.md', 'utf8'),
    ])
    const intents = buildYiuActiveIntentUnion(baseMarkdown, brochureMarkdown)
    const expectedIdByTitle = new Map(cases
        .filter((item) => item.expectedSkillId && item.expectedSkillTitle)
        .map((item) => [item.expectedSkillTitle as string, item.expectedSkillId as string]))
    const rowInputs = intents.flatMap((intent) => (
        buildSkillEmbeddingTexts(
            intent.title,
            intent.triggerExamples,
            intent.responseText,
            intent.routingDescription,
            intent.coverageFacets
        ).map((embeddingText) => ({
            skill_id: expectedIdByTitle.get(intent.title) ?? `local:${intent.slug}`,
            title: intent.title,
            response_text: intent.responseText,
            routing_description: intent.routingDescription,
            coverage_facets: intent.coverageFacets,
            trigger_text: embeddingText,
            similarity: 0,
        }))
    ))
    return { intents, rowInputs }
}

async function captureFrozenPayloadsFromLocalCorpus() {
    await loadLocalEnv()
    const cases = await readFocusedFixture()
    const openai = new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY'), timeout: 45_000, maxRetries: 1 })
    const { intents, rowInputs } = await buildLocalCorpusRowInputs(cases)
    const rowEmbeddings = await createEmbeddings(openai, rowInputs.map((row) => row.trigger_text))
    const embeddedRows = rowInputs.map((row, index) => ({
        ...row,
        embedding: rowEmbeddings[index] ?? [],
    }))

    const uniqueQueries = Array.from(new Set(cases.flatMap((item) => item.candidateQueries)))
    const queryEmbeddings = await createEmbeddings(openai, uniqueQueries)
    const queryEmbeddingByText = new Map(uniqueQueries.map((query, index) => [
        query,
        queryEmbeddings[index] ?? [],
    ]))

    const frozenCases = cases.map((definition) => {
        const groups = definition.candidateQueries.map((query) => rankUniqueSkillCandidates(
            queryEmbeddingByText.get(query) ?? [],
            embeddedRows,
            MATCH_THRESHOLD,
            CANDIDATE_LIMIT
        ))
        return buildFrozenCase(definition, mergeCandidateGroups(groups))
    })
    const artifact: FrozenPayloadArtifact = {
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        demoSlug: DEMO_SLUG,
        embeddingModel: EMBEDDING_MODEL,
        matchThreshold: MATCH_THRESHOLD,
        candidateLimit: CANDIDATE_LIMIT,
        captureMode: 'local_corpus_replay',
        cases: frozenCases,
    }
    await writeFile(FROZEN_PAYLOAD_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify({
        mode: 'capture-local',
        output: FROZEN_PAYLOAD_PATH,
        skills: intents.length,
        embeddingRows: embeddedRows.length,
        cases: frozenCases.length,
        candidateCounts: frozenCases.map((item) => ({
            caseId: item.caseId,
            count: item.selectorInput.candidates.length,
            unique: new Set(item.selectorInput.candidates.map((candidate) => candidate.skill_id)).size,
        })),
    }, null, 2))
}

type EmbeddingTransportBatch = {
    id: string
    target: 'rows' | 'queries'
    startIndex: number
    count: number
    requestPath: string
    responsePath: string
}

type LocalCaptureTransportManifest = {
    cases: FocusedCaseDefinition[]
    rowInputs: CandidateRow[]
    uniqueQueries: string[]
    batches: EmbeddingTransportBatch[]
}

function curlConfigValue(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function curlTransferBlock(input: {
    endpoint: string
    requestPath: string
    responsePath: string
    timingPath?: string
}) {
    return [
        'request = "POST"',
        `url = "https://api.openai.com${input.endpoint}"`,
        'resolve = "api.openai.com:443:162.159.140.245"',
        'connect-timeout = 10',
        'max-time = 90',
        'silent',
        'show-error',
        'expand-header = "Authorization: Bearer {{OPENAI_API_KEY}}"',
        'header = "Content-Type: application/json"',
        `data-binary = "@${curlConfigValue(input.requestPath)}"`,
        `output = "${curlConfigValue(input.responsePath)}"`,
        ...(input.timingPath
            ? [`write-out = "%output{${curlConfigValue(input.timingPath)}}%{time_total}"`]
            : []),
        'next',
    ].join('\n')
}

async function prepareLocalCaptureTransport() {
    const cases = await readFocusedFixture()
    const { intents, rowInputs } = await buildLocalCorpusRowInputs(cases)
    const uniqueQueries = Array.from(new Set(cases.flatMap((item) => item.candidateQueries)))
    await mkdir(TRANSPORT_DIR, { recursive: true, mode: 0o700 })

    const batches: EmbeddingTransportBatch[] = []
    const batchSize = 128
    const targets = [
        { target: 'rows' as const, texts: rowInputs.map((row) => row.trigger_text) },
        { target: 'queries' as const, texts: uniqueQueries },
    ]
    for (const target of targets) {
        for (let startIndex = 0; startIndex < target.texts.length; startIndex += batchSize) {
            const id = `${target.target}-${String(batches.length + 1).padStart(3, '0')}`
            const requestPath = path.join(TRANSPORT_DIR, `${id}-request.json`)
            const responsePath = path.join(TRANSPORT_DIR, `${id}-response.json`)
            const input = target.texts.slice(startIndex, startIndex + batchSize)
            await writeFile(requestPath, JSON.stringify({
                model: EMBEDDING_MODEL,
                input,
                dimensions: 1536,
            }), { encoding: 'utf8', mode: 0o600 })
            batches.push({
                id,
                target: target.target,
                startIndex,
                count: input.length,
                requestPath,
                responsePath,
            })
        }
    }

    const manifest: LocalCaptureTransportManifest = {
        cases,
        rowInputs,
        uniqueQueries,
        batches,
    }
    const manifestPath = path.join(TRANSPORT_DIR, 'capture-manifest.json')
    const curlConfigPath = path.join(TRANSPORT_DIR, 'capture-curl.conf')
    const transferBlocks = batches.map((batch) => curlTransferBlock({
        endpoint: '/v1/embeddings',
        requestPath: batch.requestPath,
        responsePath: batch.responsePath,
    })).join('\n').replace(/\nnext$/u, '')
    await writeFile(manifestPath, JSON.stringify(manifest), { encoding: 'utf8', mode: 0o600 })
    await writeFile(curlConfigPath, [
        'parallel',
        'parallel-max = 3',
        transferBlocks,
    ].join('\n'), { encoding: 'utf8', mode: 0o600 })
    console.log(JSON.stringify({
        mode: 'prepare-local-capture',
        skills: intents.length,
        embeddingRows: rowInputs.length,
        queries: uniqueQueries.length,
        batches: batches.length,
        curlConfigPath,
    }, null, 2))
}

function readEmbeddingResponse(payload: unknown, expectedCount: number) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Invalid embedding response')
    }
    const record = payload as Record<string, unknown>
    if (record.error) {
        const errorRecord = record.error as Record<string, unknown>
        throw new Error(normalizeText(errorRecord.message, 500) || 'Embedding API error')
    }
    const data = Array.isArray(record.data) ? record.data : []
    const embeddings = data
        .map((item) => item as Record<string, unknown>)
        .sort((left, right) => Number(left.index) - Number(right.index))
        .map((item) => Array.isArray(item.embedding) ? item.embedding.map(Number) : [])
    if (embeddings.length !== expectedCount || embeddings.some((embedding) => embedding.length === 0)) {
        throw new Error(`Expected ${expectedCount} embeddings, received ${embeddings.length}`)
    }
    return embeddings
}

async function finalizeLocalCaptureTransport() {
    const manifest = JSON.parse(await readFile(
        path.join(TRANSPORT_DIR, 'capture-manifest.json'),
        'utf8'
    )) as LocalCaptureTransportManifest
    const rowEmbeddings = new Array<number[]>(manifest.rowInputs.length)
    const queryEmbeddings = new Array<number[]>(manifest.uniqueQueries.length)
    for (const batch of manifest.batches) {
        const payload = JSON.parse(await readFile(batch.responsePath, 'utf8'))
        const embeddings = readEmbeddingResponse(payload, batch.count)
        const target = batch.target === 'rows' ? rowEmbeddings : queryEmbeddings
        embeddings.forEach((embedding, index) => {
            target[batch.startIndex + index] = embedding
        })
    }

    const embeddedRows = manifest.rowInputs.map((row, index) => ({
        ...row,
        embedding: rowEmbeddings[index] ?? [],
    }))
    const queryEmbeddingByText = new Map(manifest.uniqueQueries.map((query, index) => [
        query,
        queryEmbeddings[index] ?? [],
    ]))
    const frozenCases = manifest.cases.map((definition) => buildFrozenCase(
        definition,
        mergeCandidateGroups(definition.candidateQueries.map((query) => rankUniqueSkillCandidates(
            queryEmbeddingByText.get(query) ?? [],
            embeddedRows,
            MATCH_THRESHOLD,
            CANDIDATE_LIMIT
        )))
    ))
    const artifact: FrozenPayloadArtifact = {
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        demoSlug: DEMO_SLUG,
        embeddingModel: EMBEDDING_MODEL,
        matchThreshold: MATCH_THRESHOLD,
        candidateLimit: CANDIDATE_LIMIT,
        captureMode: 'local_corpus_replay',
        cases: frozenCases,
    }
    await writeFile(FROZEN_PAYLOAD_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify({
        mode: 'finalize-local-capture',
        output: FROZEN_PAYLOAD_PATH,
        cases: frozenCases.length,
        candidateCounts: frozenCases.map((item) => ({
            caseId: item.caseId,
            count: item.selectorInput.candidates.length,
            unique: new Set(item.selectorInput.candidates.map((candidate) => candidate.skill_id)).size,
        })),
    }, null, 2))
}

function requestInvariantHash(request: SelectorResponseRequest) {
    const { model: _model, reasoning: _reasoning, ...invariant } = request
    return createHash('sha256').update(JSON.stringify(invariant)).digest('hex')
}

async function runWithConcurrency<T>(jobs: Array<() => Promise<T>>, concurrency: number) {
    const results = new Array<T>(jobs.length)
    let nextIndex = 0
    async function worker() {
        while (nextIndex < jobs.length) {
            const index = nextIndex
            nextIndex += 1
            results[index] = await jobs[index]!()
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()))
    return results
}

async function writeModelComparisonArtifacts(input: {
    artifact: FrozenPayloadArtifact
    repeats: number
    runs: SelectorRunResult[]
    mode: string
}) {
    const scores = MODEL_CONFIGS.map((config) => scoreSelectorRuns(
        input.artifact.cases,
        input.runs,
        config.id
    ))
    const eligible = scores
        .filter((score) => score.releaseGatePassed)
        .sort((left, right) => (
            left.p90LatencyMs - right.p90LatencyMs
            || left.averageTotalTokens - right.averageTotalTokens
        ))
    const winner = eligible[0] ?? null
    const productionDecision = winner && winner.configId !== 'gpt-4.1-mini'
        ? `switch_to_${winner.configId}`
        : 'keep_gpt-4.1-mini'
    const requestHashes = Object.fromEntries(input.artifact.cases.map((frozenCase) => [
        frozenCase.caseId,
        Array.from(new Set(MODEL_CONFIGS.map((config) => (
            requestInvariantHash(buildSelectorRequest(frozenCase, config))
        )))),
    ]))

    const runId = new Date().toISOString().replace(/[:.]/g, '-')
    const jsonPath = `docs/evaluations/yiu-skill-selector-model-ab-${runId}.json`
    const markdownPath = `docs/evaluations/yiu-skill-selector-model-ab-${runId}.md`
    const result = {
        runId,
        frozenPayloadPath: FROZEN_PAYLOAD_PATH,
        transport: input.mode,
        repeats: input.repeats,
        requestInvariantHashes: requestHashes,
        scores,
        productionDecision,
        runs: input.runs,
    }
    await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')

    const scoreRows = scores.map((score) => (
        `| ${score.configId} | ${(score.exactSelectionAccuracy * 100).toFixed(1)}% | ${score.falseSkillSelections} | ${(score.positiveSkillRecall * 100).toFixed(1)}% | ${score.p50LatencyMs} | ${score.p90LatencyMs} | ${score.averageTotalTokens} | ${score.releaseGatePassed ? 'PASS' : 'FAIL'} |`
    ))
    const failureRows = input.runs
        .filter((run) => run.error || run.selectedSkillId !== input.artifact.cases.find(
            (item) => item.caseId === run.caseId
        )?.expectedSkillId)
        .map((run) => (
            `| ${run.configId} | ${run.caseId} | ${run.repeat} | ${run.selectedSkillId ?? 'File Search'} | ${run.error ?? run.reason.replace(/\|/g, '\\|')} |`
        ))
    const markdown = [
        '# YİÜ Skill Selector Controlled Model A/B',
        '',
        `- Frozen payload: \`${FROZEN_PAYLOAD_PATH}\``,
        `- Transport: \`${input.mode}\``,
        `- Repeats per case/config: \`${input.repeats}\``,
        `- Decision: \`${productionDecision}\``,
        '',
        '| Config | Exact accuracy | False Skills | Positive recall | p50 ms | p90 ms | Avg tokens | Gate |',
        '|---|---:|---:|---:|---:|---:|---:|---|',
        ...scoreRows,
        '',
        '## Non-exact runs',
        '',
        '| Config | Case | Repeat | Selected | Reason/Error |',
        '|---|---|---:|---|---|',
        ...(failureRows.length > 0 ? failureRows : ['| — | — | — | — | None |']),
        '',
    ].join('\n')
    await writeFile(markdownPath, markdown, 'utf8')

    console.log(JSON.stringify({
        mode: input.mode,
        jsonPath,
        markdownPath,
        scores,
        productionDecision,
    }, null, 2))
}

async function runModelComparison(repeats: number) {
    await loadLocalEnv()
    const artifact = JSON.parse(await readFile(FROZEN_PAYLOAD_PATH, 'utf8')) as FrozenPayloadArtifact
    validateFocusedCases(artifact.cases)
    const openai = new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY'), timeout: 60_000, maxRetries: 1 })

    const jobs: Array<() => Promise<SelectorRunResult>> = []
    for (const config of MODEL_CONFIGS) {
        for (const frozenCase of artifact.cases) {
            for (let repeat = 1; repeat <= repeats; repeat += 1) {
                jobs.push(async () => {
                    const request = buildSelectorRequest(frozenCase, config)
                    const startedAt = performance.now()
                    try {
                        const response = await openai.responses.create(request as never)
                        const latencyMs = Math.round(performance.now() - startedAt)
                        const parsed = parseSelectorOutput(response.output_text)
                        if (parsed.skillId && !frozenCase.selectorInput.candidates.some(
                            (candidate) => candidate.skill_id === parsed.skillId
                        )) {
                            throw new Error(`Model selected an unsupplied Skill id: ${parsed.skillId}`)
                        }
                        const selectedSkillId = parsed.coverage === 'direct' ? parsed.skillId : null
                        return {
                            configId: config.id,
                            caseId: frozenCase.caseId,
                            repeat,
                            selectedSkillId,
                            coverage: parsed.coverage,
                            confidence: parsed.confidence,
                            reason: parsed.reason,
                            latencyMs,
                            inputTokens: response.usage?.input_tokens ?? 0,
                            outputTokens: response.usage?.output_tokens ?? 0,
                            totalTokens: response.usage?.total_tokens ?? 0,
                            error: null,
                        }
                    } catch (error) {
                        return {
                            configId: config.id,
                            caseId: frozenCase.caseId,
                            repeat,
                            selectedSkillId: null,
                            coverage: 'none',
                            confidence: 0,
                            reason: '',
                            latencyMs: Math.round(performance.now() - startedAt),
                            inputTokens: 0,
                            outputTokens: 0,
                            totalTokens: 0,
                            error: error instanceof Error ? error.message : String(error),
                        }
                    }
                })
            }
        }
    }

    const runs = await runWithConcurrency(jobs, 3)
    await writeModelComparisonArtifacts({ artifact, repeats, runs, mode: 'run' })
}

type AbTransportTask = {
    configId: string
    caseId: string
    repeat: number
    requestPath: string
    responsePath: string
    timingPath: string
}

type AbTransportManifest = {
    artifact: FrozenPayloadArtifact
    repeats: number
    tasks: AbTransportTask[]
}

async function prepareAbTransport(repeats: number) {
    const artifact = JSON.parse(await readFile(FROZEN_PAYLOAD_PATH, 'utf8')) as FrozenPayloadArtifact
    validateFocusedCases(artifact.cases)
    await mkdir(TRANSPORT_DIR, { recursive: true, mode: 0o700 })

    const tasks: AbTransportTask[] = []
    for (const config of MODEL_CONFIGS) {
        for (const frozenCase of artifact.cases) {
            for (let repeat = 1; repeat <= repeats; repeat += 1) {
                const id = `${config.id}-${frozenCase.caseId}-r${repeat}`
                const requestPath = path.join(TRANSPORT_DIR, `${id}-request.json`)
                const responsePath = path.join(TRANSPORT_DIR, `${id}-response.json`)
                const timingPath = path.join(TRANSPORT_DIR, `${id}-timing.txt`)
                await writeFile(
                    requestPath,
                    JSON.stringify(buildSelectorRequest(frozenCase, config)),
                    { encoding: 'utf8', mode: 0o600 }
                )
                tasks.push({
                    configId: config.id,
                    caseId: frozenCase.caseId,
                    repeat,
                    requestPath,
                    responsePath,
                    timingPath,
                })
            }
        }
    }

    const manifest: AbTransportManifest = { artifact, repeats, tasks }
    const manifestPath = path.join(TRANSPORT_DIR, 'ab-manifest.json')
    const curlConfigPath = path.join(TRANSPORT_DIR, 'ab-curl.conf')
    const transferBlocks = tasks.map((task) => curlTransferBlock({
        endpoint: '/v1/responses',
        requestPath: task.requestPath,
        responsePath: task.responsePath,
        timingPath: task.timingPath,
    })).join('\n').replace(/\nnext$/u, '')
    await writeFile(manifestPath, JSON.stringify(manifest), { encoding: 'utf8', mode: 0o600 })
    await writeFile(curlConfigPath, [
        'parallel',
        'parallel-max = 3',
        transferBlocks,
    ].join('\n'), { encoding: 'utf8', mode: 0o600 })
    console.log(JSON.stringify({
        mode: 'prepare-ab',
        repeats,
        tasks: tasks.length,
        curlConfigPath,
    }, null, 2))
}

async function finalizeAbTransport() {
    const manifest = JSON.parse(await readFile(
        path.join(TRANSPORT_DIR, 'ab-manifest.json'),
        'utf8'
    )) as AbTransportManifest
    const caseById = new Map(manifest.artifact.cases.map((item) => [item.caseId, item]))
    const runs: SelectorRunResult[] = []
    for (const task of manifest.tasks) {
        let latencyMs = 0
        try {
            latencyMs = Math.round(Number(await readFile(task.timingPath, 'utf8')) * 1000)
            const rawPayload = JSON.parse(await readFile(task.responsePath, 'utf8'))
            const apiOutput = parseResponsesApiOutput(rawPayload)
            const parsed = parseSelectorOutput(apiOutput.outputText)
            const frozenCase = caseById.get(task.caseId)
            if (!frozenCase) throw new Error(`Unknown case ${task.caseId}`)
            if (parsed.skillId && !frozenCase.selectorInput.candidates.some(
                (candidate) => candidate.skill_id === parsed.skillId
            )) {
                throw new Error(`Model selected an unsupplied Skill id: ${parsed.skillId}`)
            }
            runs.push({
                configId: task.configId,
                caseId: task.caseId,
                repeat: task.repeat,
                selectedSkillId: parsed.coverage === 'direct' ? parsed.skillId : null,
                coverage: parsed.coverage,
                confidence: parsed.confidence,
                reason: parsed.reason,
                latencyMs,
                inputTokens: apiOutput.inputTokens,
                outputTokens: apiOutput.outputTokens,
                totalTokens: apiOutput.totalTokens,
                error: null,
            })
        } catch (error) {
            runs.push({
                configId: task.configId,
                caseId: task.caseId,
                repeat: task.repeat,
                selectedSkillId: null,
                coverage: 'none',
                confidence: 0,
                reason: '',
                latencyMs,
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                error: error instanceof Error ? error.message : String(error),
            })
        }
    }
    await writeModelComparisonArtifacts({
        artifact: manifest.artifact,
        repeats: manifest.repeats,
        runs,
        mode: 'curl-transport',
    })
}

function parseCliArgs(argv: string[]) {
    let mode:
        | 'capture'
        | 'capture-local'
        | 'prepare-local-capture'
        | 'finalize-local-capture'
        | 'prepare-ab'
        | 'finalize-ab'
        | 'run'
        | null = null
    let repeats = 3
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index]
        if (token === '--capture') mode = 'capture'
        else if (token === '--capture-local') mode = 'capture-local'
        else if (token === '--prepare-local-capture') mode = 'prepare-local-capture'
        else if (token === '--finalize-local-capture') mode = 'finalize-local-capture'
        else if (token === '--prepare-ab') mode = 'prepare-ab'
        else if (token === '--finalize-ab') mode = 'finalize-ab'
        else if (token === '--run') mode = 'run'
        else if (token === '--repeats') {
            repeats = Number(argv[index + 1])
            index += 1
        } else {
            throw new Error(`Unknown argument: ${token}`)
        }
    }
    if (!mode) {
        throw new Error(
            'Use --capture, --capture-local, --prepare-local-capture, --finalize-local-capture, --prepare-ab, --finalize-ab, or --run'
        )
    }
    if (!Number.isInteger(repeats) || repeats < 1 || repeats > 5) {
        throw new Error('--repeats must be an integer from 1 to 5')
    }
    return { mode, repeats }
}

async function main() {
    const args = parseCliArgs(process.argv.slice(2))
    if (args.mode === 'capture') await captureFrozenPayloads()
    else if (args.mode === 'capture-local') await captureFrozenPayloadsFromLocalCorpus()
    else if (args.mode === 'prepare-local-capture') await prepareLocalCaptureTransport()
    else if (args.mode === 'finalize-local-capture') await finalizeLocalCaptureTransport()
    else if (args.mode === 'prepare-ab') await prepareAbTransport(args.repeats)
    else if (args.mode === 'finalize-ab') await finalizeAbTransport()
    else await runModelComparison(args.repeats)
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    })
}
