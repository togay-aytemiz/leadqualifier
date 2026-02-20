import OpenAI from 'openai'

import { createClient } from '@/lib/supabase/server'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import type { ConversationTurn } from '@/lib/knowledge-base/router'
import {
    computeQaLabRunResult,
    isBudgetExhausted,
    toWeightedQaLabScore,
    type QaLabFindingSeverity
} from '@/lib/qa-lab/evaluator'
import { buildQaLabPipelineChecks } from '@/lib/qa-lab/pipeline-checks'
import { calculateUsageCreditCost } from '@/lib/billing/credit-cost'
import { resolveMvpResponseLanguage, resolveMvpResponseLanguageName } from '@/lib/ai/language'
import type { Json, QaLabRun, QaLabRunResult, QaLabRunStatus } from '@/types/database'

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

const GENERATOR_MAX_OUTPUT_TOKENS = 6400
const GENERATOR_MAX_ATTEMPTS = 3
const GENERATOR_DIAGNOSTIC_SNIPPET_CHARS = 260
const JUDGE_MAX_OUTPUT_TOKENS = 1800
const JUDGE_MIN_OUTPUT_TOKENS = 320
const QA_LAB_RESPONDER_MAX_OUTPUT_TOKENS = 320
const QA_LAB_RESPONDER_MAX_HISTORY_TURNS = 10
const QA_LAB_RESPONDER_MAX_KB_LINES = 24
const MODEL_TEMPERATURE = 0.3
const MAX_FINDINGS = 60
const MAX_TOP_ACTIONS = 5
const REPORT_VERSION = 'v1'

const FALLBACK_SCENARIO_MESSAGES = [
    'Merhaba, fiyat bilgisi alabilir miyim?',
    'Bu hafta için uygun randevu var mı?',
    'İlk görüşme için hangi bilgileri paylaşmalıyım?'
]
const QA_LAB_MIN_SCENARIO_TURNS = 3
const QA_LAB_MAX_SCENARIO_TURNS = 6

const QA_LAB_SYNTHETIC_BUSINESS_SECTORS = [
    'Klinik psikolog / psikolojik danışmanlık',
    'Kreş ve okul öncesi eğitim',
    'Freelance yazılım geliştirme hizmetleri',
    'Diş kliniği',
    'Güzellik ve cilt bakım merkezi',
    'Diyetisyen ve beslenme danışmanlığı',
    'Veteriner kliniği',
    'Özel ders ve eğitim koçluğu',
    'Fotoğraf stüdyosu',
    'Ev tadilat ve tamir hizmetleri',
    'Muhasebe ve mali müşavirlik ofisi',
    'Halı yıkama ve ev temizliği hizmetleri'
] as const

const QA_LAB_BUSINESS_NAME_PREFIXES = [
    'Mavi',
    'Nova',
    'Atlas',
    'Eksen',
    'Yakamoz',
    'Pera',
    'Delta',
    'Lina'
] as const

const QA_LAB_BUSINESS_NAME_SUFFIXES = [
    'Atolye',
    'Merkez',
    'Danismanlik',
    'Studio',
    'Akademi',
    'Klinik',
    'Hizmet',
    'Ofis'
] as const

const GENERATOR_GENERIC_SUPPORT_PATTERNS = [
    /müşteri hizmet/i,
    /musteri hizmet/i,
    /customer support/i,
    /help desk/i,
    /destek hatt/i
]

const GENERATOR_SUPPORT_HEAVY_PATTERNS = [
    /ekibimize/i,
    /insan deste/i,
    /müşteri temsilci/i,
    /uzmana aktar/i,
    /human agent/i,
    /transfer to (our )?team/i,
    /customer support team/i,
    /privacy request/i,
    /data deletion/i,
    /şikayet/i
]

const GENERATOR_LEAD_QUALIFICATION_PATTERNS = [
    /fiyat/i,
    /ücret/i,
    /bütçe/i,
    /randevu/i,
    /tarih/i,
    /paket/i,
    /hizmet/i,
    /kapsam/i,
    /price/i,
    /budget/i,
    /appointment/i,
    /date/i,
    /package/i,
    /service/i,
    /timeline/i
]

const GENERATOR_PLACEHOLDER_PATTERNS = [
    /\[varyant/i,
    /tekrar notu/i,
    /\?\?/,
    /^not\s*\d+\s*:/i
]

type QaLabScenarioTemperature = 'hot' | 'warm' | 'cold'
type QaLabScenarioInformationSharing = 'cooperative' | 'partial' | 'resistant'

interface QaLabGeneratorScenarioTurn {
    customer: string
}

interface QaLabGeneratorScenario {
    id: string
    title: string
    goal: string
    customer_profile: string
    lead_temperature: QaLabScenarioTemperature
    information_sharing: QaLabScenarioInformationSharing
    turns: QaLabGeneratorScenarioTurn[]
}

interface QaLabGeneratorOutput {
    kb_fixture: {
        title: string
        lines: string[]
    }
    ground_truth: {
        canonical_services: string[]
        required_intake_fields: string[]
        critical_policy_facts: string[]
        disallowed_fabricated_claims: string[]
    }
    derived_setup: {
        offering_profile_summary: string
        service_catalog: string[]
        required_intake_fields: string[]
    }
    scenarios: QaLabGeneratorScenario[]
}

interface QaLabExecutedTurn {
    turn_index: number
    customer_message: string
    assistant_response: string
    token_usage: {
        input_tokens: number
        output_tokens: number
        total_tokens: number
    }
}

interface QaLabExecutedCase {
    case_id: string
    title: string
    goal: string
    customer_profile: string
    lead_temperature: QaLabScenarioTemperature
    information_sharing: QaLabScenarioInformationSharing
    executed_turns: QaLabExecutedTurn[]
}

interface QaLabJudgeFinding {
    severity: QaLabFindingSeverity
    violated_rule: string
    evidence: string
    rationale: string
    suggested_fix: string
    target_layer: 'kb' | 'skill' | 'prompt' | 'pipeline'
    effort: 'low' | 'medium' | 'high'
    confidence: number
}

interface QaLabJudgeTopAction {
    priority: number
    action: string
    target_layer: 'kb' | 'skill' | 'prompt' | 'pipeline'
    expected_impact: string
    effort: 'low' | 'medium' | 'high'
}

interface QaLabJudgeResult {
    summary: string
    score_breakdown: {
        groundedness: number
        extraction_accuracy: number
        conversation_quality: number
        weighted_total: number
    }
    findings: QaLabJudgeFinding[]
    top_actions: QaLabJudgeTopAction[]
}

interface QaLabOrganizationContext {
    offering_profile: {
        summary: string
        manual_profile_note: string
        required_intake_fields: string[]
        required_intake_fields_ai: string[]
    }
    service_catalog: Array<{
        name: string
        aliases: string[]
    }>
    skills: Array<{
        title: string
        trigger_examples: string[]
        response_text: string
    }>
    knowledge_documents: Array<{
        title: string
        excerpt: string
    }>
}

interface QaLabTokenTracker {
    budget: number
    consumed: number
    consumedInput: number
    consumedOutput: number
}

interface ExecuteQaLabRunOptions {
    supabase?: SupabaseClientLike
}

interface QaLabGeneratorAttemptDiagnostics {
    attempt: number
    finishReason: string | null
    outputChars: number
    promptTokens: number | null
    completionTokens: number | null
    totalTokens: number | null
    validationError: string | null
    outputPreview: string
    outputTail: string
}

export class QaLabExecutionError extends Error {
    readonly details: Record<string, unknown> | null

    constructor(message: string, details?: Record<string, unknown>) {
        super(message)
        this.name = 'QaLabExecutionError'
        this.details = details ?? null
    }
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numeric)) return fallback
    return Math.min(max, Math.max(min, Math.round(numeric)))
}

function clampConfidence(value: unknown) {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numeric)) return 0.5
    return Math.min(1, Math.max(0, Number(numeric.toFixed(2))))
}

function clampScore(value: unknown) {
    return clampInt(value, 0, 100, 0)
}

function getScenarioTurnLimit(run: QaLabRun) {
    return clampInt(
        run.max_turns_per_scenario,
        QA_LAB_MIN_SCENARIO_TURNS,
        QA_LAB_MAX_SCENARIO_TURNS,
        QA_LAB_MAX_SCENARIO_TURNS
    )
}

function trimText(value: unknown, fallback = '') {
    if (typeof value !== 'string') return fallback
    const trimmed = value.trim()
    return trimmed || fallback
}

function normalizeStringArray(value: unknown, maxItems: number, fallback: string[] = []) {
    if (!Array.isArray(value)) return fallback
    const normalized = value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(0, maxItems)
    return normalized.length > 0 ? normalized : fallback
}

function stripJsonFence(value: string) {
    const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    return fenced?.[1]?.trim() ?? value.trim()
}

function extractFirstBalancedJson(value: string) {
    const text = value.trim()
    if (!text) return null
    if (text.startsWith('{') && text.endsWith('}')) return text

    let startIndex = -1
    let depth = 0

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index]
        if (char === '{') {
            if (depth === 0) startIndex = index
            depth += 1
            continue
        }
        if (char === '}' && depth > 0) {
            depth -= 1
            if (depth === 0 && startIndex >= 0) {
                return text.slice(startIndex, index + 1)
            }
        }
    }

    return null
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
    const candidates = [
        raw.trim(),
        stripJsonFence(raw),
        extractFirstBalancedJson(stripJsonFence(raw)) ?? ''
    ].filter(Boolean)

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate)
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>
            }
        } catch {
            continue
        }
    }

    return null
}

function buildGeneratorOutputSnippet(value: string, maxChars = GENERATOR_DIAGNOSTIC_SNIPPET_CHARS) {
    return value.replace(/\s+/g, ' ').trim().slice(0, maxChars)
}

function buildGeneratorAttemptDiagnostics(input: {
    attempt: number
    finishReason: string | null
    output: string
    usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
    }
    validationError: string | null
}): QaLabGeneratorAttemptDiagnostics {
    const output = input.output.trim()
    return {
        attempt: input.attempt,
        finishReason: input.finishReason,
        outputChars: input.output.length,
        promptTokens: input.usage?.prompt_tokens ?? null,
        completionTokens: input.usage?.completion_tokens ?? null,
        totalTokens: input.usage?.total_tokens ?? null,
        validationError: input.validationError,
        outputPreview: buildGeneratorOutputSnippet(output),
        outputTail: buildGeneratorOutputSnippet(output.slice(-GENERATOR_DIAGNOSTIC_SNIPPET_CHARS))
    }
}

function pickDeterministicIndex(seedText: string, mod: number) {
    if (mod <= 0) return 0
    let hash = 0
    for (let index = 0; index < seedText.length; index += 1) {
        hash = (hash * 31 + seedText.charCodeAt(index)) >>> 0
    }
    return hash % mod
}

function buildSyntheticBusinessProfile(runId: string) {
    const sector = QA_LAB_SYNTHETIC_BUSINESS_SECTORS[
        pickDeterministicIndex(runId, QA_LAB_SYNTHETIC_BUSINESS_SECTORS.length)
    ] ?? QA_LAB_SYNTHETIC_BUSINESS_SECTORS[0]

    const prefix = QA_LAB_BUSINESS_NAME_PREFIXES[
        pickDeterministicIndex(`${runId}:prefix`, QA_LAB_BUSINESS_NAME_PREFIXES.length)
    ] ?? QA_LAB_BUSINESS_NAME_PREFIXES[0]

    const suffix = QA_LAB_BUSINESS_NAME_SUFFIXES[
        pickDeterministicIndex(`${runId}:suffix`, QA_LAB_BUSINESS_NAME_SUFFIXES.length)
    ] ?? QA_LAB_BUSINESS_NAME_SUFFIXES[0]

    return {
        sector,
        businessName: `${prefix} ${suffix}`
    }
}

function buildSyntheticOrganizationContext(run: QaLabRun) {
    const profile = buildSyntheticBusinessProfile(run.id)
    return {
        offering_profile: {
            summary: `${profile.businessName}, ${profile.sector} alaninda hizmet veren sentetik bir KOBI profili.`,
            manual_profile_note: 'Bu organization context QA Lab tarafinda sentetik uretilir; skill ve gercek KB kullanilmaz.',
            required_intake_fields: [],
            required_intake_fields_ai: []
        },
        service_catalog: [],
        skills: [],
        knowledge_documents: []
    } satisfies QaLabOrganizationContext
}

function matchesAnyPattern(value: string, patterns: RegExp[]) {
    return patterns.some((pattern) => pattern.test(value))
}

function normalizeForDiversity(value: string) {
    return value
        .toLocaleLowerCase('tr-TR')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function getScenarioText(scenario: QaLabGeneratorScenario) {
    const turns = scenario.turns.map((turn) => turn.customer).join(' ')
    return `${scenario.title} ${scenario.goal} ${scenario.customer_profile} ${turns}`.trim()
}

export function validateGeneratorOutputQuality(
    generated: QaLabGeneratorOutput,
    run: QaLabRun
) {
    const title = generated.kb_fixture.title
    if (matchesAnyPattern(title, GENERATOR_GENERIC_SUPPORT_PATTERNS)) {
        return 'Generator fixture title is generic support-domain; choose a concrete SMB sector.'
    }

    const fixtureLines = generated.kb_fixture.lines
    if (fixtureLines.length < run.fixture_min_lines) {
        return `Generator output has ${fixtureLines.length} fixture lines, below required minimum ${run.fixture_min_lines}`
    }

    const placeholderCount = fixtureLines.filter((line) => (
        matchesAnyPattern(line, GENERATOR_PLACEHOLDER_PATTERNS)
    )).length
    if (placeholderCount > 0) {
        return 'Generator fixture contains placeholder artifacts ([varyant], tekrar notu, ??).'
    }

    const normalizedUniqueLineCount = new Set(
        fixtureLines.map(normalizeForDiversity).filter(Boolean)
    ).size
    const diversityRatio = fixtureLines.length > 0
        ? normalizedUniqueLineCount / fixtureLines.length
        : 0

    if (diversityRatio < 0.6) {
        return `Generator fixture line diversity is too low (${normalizedUniqueLineCount}/${fixtureLines.length}).`
    }

    const supportLineCount = fixtureLines.filter((line) => (
        matchesAnyPattern(line, GENERATOR_SUPPORT_HEAVY_PATTERNS)
    )).length
    const supportLineRatio = fixtureLines.length > 0
        ? supportLineCount / fixtureLines.length
        : 1
    if (supportLineRatio > 0.35) {
        return 'Generator fixture is support-heavy; majority must describe services, qualification, and business operations.'
    }

    const nonSupportServices = generated.ground_truth.canonical_services.filter((service) => (
        !matchesAnyPattern(service, GENERATOR_SUPPORT_HEAVY_PATTERNS)
    ))
    if (nonSupportServices.length < 2) {
        return 'Generator canonical services are too support-centric; include concrete service offerings.'
    }

    const scenarios = generated.scenarios
    const maxSupportScenarios = Math.max(1, Math.floor(run.scenario_count * 0.35))
    const supportScenarioCount = scenarios.filter((scenario) => (
        matchesAnyPattern(getScenarioText(scenario), GENERATOR_SUPPORT_HEAVY_PATTERNS)
    )).length
    if (supportScenarioCount > maxSupportScenarios) {
        return `Generator scenarios are support-heavy (${supportScenarioCount}/${scenarios.length}); include more lead qualification flows.`
    }

    const minLeadQualificationScenarios = Math.max(2, Math.ceil(run.scenario_count * 0.6))
    const leadQualificationScenarioCount = scenarios.filter((scenario) => (
        matchesAnyPattern(getScenarioText(scenario), GENERATOR_LEAD_QUALIFICATION_PATTERNS)
    )).length
    if (leadQualificationScenarioCount < minLeadQualificationScenarios) {
        return `Generator scenarios lack lead qualification coverage (${leadQualificationScenarioCount}/${scenarios.length}).`
    }

    return null
}

export function createGeneratorRetryUserPrompt(
    baseUserPrompt: string,
    attempt: number,
    previousError: string | null
) {
    if (attempt <= 1 || !previousError) {
        return baseUserPrompt
    }

    const retryHints = [
        baseUserPrompt,
        '',
        'RETRY CONSTRAINT:',
        `Previous attempt failed with: ${previousError}`,
        'Return valid JSON only and satisfy all constraints exactly.'
    ]

    if (previousError.toLowerCase().includes('below required minimum')) {
        retryHints.push(
            '- You must return at least fixture_min_lines items in kb_fixture.lines.',
            '- Keep each fixture line concise (max 12 words) to stay within token limits.'
        )
    }

    if (
        previousError.toLowerCase().includes('support-heavy')
        || previousError.toLowerCase().includes('support-domain')
    ) {
        retryHints.push(
            '- Use one concrete SMB sector (not generic customer support).',
            '- Keep complaint/privacy/handoff content as minority (max 35%).',
            '- Focus on service details, qualification questions, and realistic sales flow.'
        )
    }

    if (previousError.toLowerCase().includes('placeholder artifacts')) {
        retryHints.push(
            '- Do not use filler markers like [varyant], tekrar notu, ??, or not 1:'
        )
    }

    return retryHints.join('\n')
}

export function expandFixtureLinesToMinimum(lines: string[], minimumLines: number) {
    const target = Math.max(0, Math.floor(minimumLines))
    const normalizedBase = lines
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)

    const seeds = normalizedBase.length > 0
        ? normalizedBase
        : [
            'Fixture fallback line: Hizmet talebi için müşteri ihtiyacı netleştirilir.',
            'Fixture fallback line: Uygunluk için tarih ve saat tercihi sorulur.',
            'Fixture fallback line: Fiyat aralığı hizmet kapsamına göre paylaşılır.',
            'Fixture fallback line: İlk görüşmede gerekli temel bilgiler toplanır.'
        ]

    const expansionSuffixes = [
        'Devamında kapsam ve beklenti netleştirilir.',
        'Süreç adımları müşteri onayına göre ilerler.',
        'Fiyatlama hizmet detayına göre güncellenir.',
        'Uygunluk için tarih bilgisi teyit edilir.',
        'Müşteri hedefi ve önceliği ayrıca sorulur.',
        'Net teklif için eksik bilgiler tamamlanır.'
    ]

    const expanded = [...normalizedBase]
    let cursor = 0

    while (expanded.length < target && cursor < target * 20) {
        const seed = seeds[cursor % seeds.length] ?? `Fixture fallback line ${cursor + 1}`
        const suffix = expansionSuffixes[Math.floor(cursor / seeds.length) % expansionSuffixes.length]
            ?? 'Bilgi doğrulaması sonrası süreç ilerletilir.'

        const seedTrimmed = seed.replace(/\s+/g, ' ').trim()
        const seedWithoutTrailingPunctuation = seedTrimmed.replace(/[.!?]+$/g, '')
        const nextLine = `${seedWithoutTrailingPunctuation}. ${suffix}`
            .replace(/\s+/g, ' ')
            .trim()

        if (!expanded.includes(nextLine)) {
            expanded.push(nextLine)
        }
        cursor += 1
    }

    while (expanded.length < target) {
        expanded.push(`Fixture fallback line ${expanded.length + 1}: Detay için ek bilgi alınır.`)
    }

    return expanded.slice(0, target)
}

function ensureOpenAiApiKey() {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required for QA Lab execution')
    }
}

function estimateCompletionUsage(systemPrompt: string, userPrompt: string, output: string) {
    const promptTokens = estimateTokenCount(systemPrompt) + estimateTokenCount(userPrompt)
    const completionTokens = estimateTokenCount(output)
    return {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
    }
}

function consumeTokens(tracker: QaLabTokenTracker, usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
}) {
    if (!usage) return
    const promptTokens = clampInt(usage.prompt_tokens ?? 0, 0, 1_000_000_000, 0)
    const completionTokens = clampInt(usage.completion_tokens ?? 0, 0, 1_000_000_000, 0)
    const total = clampInt(
        usage.total_tokens ?? (promptTokens + completionTokens),
        0,
        1_000_000_000,
        0
    )
    const trackedTokens = promptTokens + completionTokens
    if (trackedTokens > 0) {
        tracker.consumedInput += promptTokens
        tracker.consumedOutput += completionTokens
        if (total > trackedTokens) {
            tracker.consumedInput += total - trackedTokens
        }
    } else if (total > 0) {
        tracker.consumedInput += total
    }
    tracker.consumed += total
}

function getRemainingTokens(tracker: QaLabTokenTracker) {
    return Math.max(0, tracker.budget - tracker.consumed)
}

function normalizeScenarioTemperature(value: unknown): QaLabScenarioTemperature {
    if (value === 'hot' || value === 'warm' || value === 'cold') return value
    return 'warm'
}

function normalizeScenarioInformationSharing(value: unknown): QaLabScenarioInformationSharing {
    if (value === 'cooperative' || value === 'partial' || value === 'resistant') return value
    return 'partial'
}

function buildFallbackScenarioTurns(
    leadTemperature: QaLabScenarioTemperature,
    infoSharing: QaLabScenarioInformationSharing
) {
    if (leadTemperature === 'hot') {
        const turns = [
            'Merhaba, implant için bu hafta randevu arıyorum. Müsaitliğiniz var mı?',
            infoSharing === 'cooperative'
                ? 'Çarşamba 17:30 bana olur. Bütçem 12-15 bin TL aralığında.'
                : 'Fiyatı öğreneyim, detayları sonra paylaşırım.',
            infoSharing === 'resistant'
                ? 'Telefonumu şimdi vermek istemiyorum, önce fiyat aralığını netleştirelim.'
                : 'Adımı ve telefonumu paylaşabilirim, hangi bilgileri istiyorsunuz?'
        ]
        return turns
    }

    if (leadTemperature === 'cold') {
        const turns = [
            'Selam, sadece fikir almak için yazdım.',
            infoSharing === 'resistant'
                ? 'Şu an tarih veya bütçe paylaşmak istemiyorum.'
                : 'Belki ileride düşünürüm, net bir tarihim yok.',
            'Teşekkürler, şimdilik bu kadar.'
        ]
        return turns
    }

    const warmTurns = [
        'Merhaba, diş beyazlatma için bilgi alabilir miyim?',
        infoSharing === 'cooperative'
            ? 'Önümüzdeki ay içinde yaptırmak istiyorum. Ortalama fiyatı öğrenebilir miyim?'
            : 'Henüz tarih net değil ama süreç nasıl ilerliyor merak ediyorum.',
        infoSharing === 'resistant'
            ? 'Kişisel bilgi vermeden önce genel bilgi almak istiyorum.'
            : 'Uygunsa bir sonraki adımı konuşabiliriz.'
    ]
    return warmTurns
}

function createDefaultScenarioByIndex(index: number, run: QaLabRun): QaLabGeneratorScenario {
    const pattern = index % 3
    const leadTemperature: QaLabScenarioTemperature = pattern === 0 ? 'hot' : (pattern === 1 ? 'warm' : 'cold')
    const infoSharing: QaLabScenarioInformationSharing = pattern === 0
        ? 'cooperative'
        : (pattern === 1 ? 'partial' : 'resistant')
    const maxTurns = getScenarioTurnLimit(run)
    const fallbackTurns = buildFallbackScenarioTurns(leadTemperature, infoSharing)
        .slice(0, maxTurns)
        .map((customer) => ({ customer }))

    return {
        id: `S${index + 1}`,
        title: `Fallback Scenario ${index + 1}`,
        goal: 'Fallback scenario because generator output was empty',
        customer_profile: leadTemperature === 'hot'
            ? 'Karar vermeye yakın, hızlı aksiyon isteyen müşteri'
            : (leadTemperature === 'cold'
                ? 'Sadece araştırma yapan, bilgi paylaşmaktan kaçınan müşteri'
                : 'İlgili ama tam karar vermemiş müşteri'),
        lead_temperature: leadTemperature,
        information_sharing: infoSharing,
        turns: fallbackTurns
    }
}

function normalizeGeneratorScenarios(raw: unknown, run: QaLabRun): QaLabGeneratorScenario[] {
    const rawScenarios = Array.isArray(raw) ? raw : []
    const maxTurns = getScenarioTurnLimit(run)
    const normalized: QaLabGeneratorScenario[] = []

    for (let index = 0; index < rawScenarios.length; index += 1) {
        const candidate = rawScenarios[index]
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
        const source = candidate as Record<string, unknown>

        const turnsRaw = Array.isArray(source.turns) ? source.turns : []
        const turns = turnsRaw
            .map((turn) => {
                if (!turn || typeof turn !== 'object' || Array.isArray(turn)) return null
                const turnRecord = turn as Record<string, unknown>
                const customerMessage = trimText(turnRecord.customer, '')
                if (!customerMessage) return null
                return {
                    customer: customerMessage
                }
            })
            .filter((turn): turn is QaLabGeneratorScenarioTurn => Boolean(turn))
            .slice(0, maxTurns)

        const normalizedTurns = turns.length > 0
            ? turns
            : FALLBACK_SCENARIO_MESSAGES.slice(0, maxTurns).map((customer) => ({ customer }))

        while (normalizedTurns.length < QA_LAB_MIN_SCENARIO_TURNS && normalizedTurns.length < maxTurns) {
            normalizedTurns.push({
                customer: `Detay sorusu ${normalizedTurns.length + 1}: Bu konuda biraz daha bilgi verebilir misiniz?`
            })
        }

        normalized.push({
            id: trimText(source.id, `S${index + 1}`),
            title: trimText(source.title, `Scenario ${index + 1}`),
            goal: trimText(source.goal, 'Validate response quality and data collection flow'),
            customer_profile: trimText(source.customer_profile, 'General customer'),
            lead_temperature: normalizeScenarioTemperature(source.lead_temperature ?? source.scenario_type),
            information_sharing: normalizeScenarioInformationSharing(source.information_sharing ?? source.info_sharing),
            turns: normalizedTurns
        })
    }

    if (normalized.length === 0) {
        return Array.from({ length: run.scenario_count }).map((_, index) => createDefaultScenarioByIndex(index, run))
    }

    return normalized.slice(0, run.scenario_count)
}

function normalizeDerivedSetup(
    raw: unknown,
    groundTruth: QaLabGeneratorOutput['ground_truth']
) {
    const record = (
        raw && typeof raw === 'object' && !Array.isArray(raw)
            ? raw as Record<string, unknown>
            : {}
    )

    const fallbackSummary = groundTruth.canonical_services.length > 0
        ? `Öncelikli hizmetler: ${groundTruth.canonical_services.slice(0, 5).join(', ')}`
        : 'Hizmet kapsamı müşteri ihtiyacına göre görüşmede netleştirilir.'

    return {
        offering_profile_summary: trimText(record.offering_profile_summary ?? record.service_profile_summary, fallbackSummary),
        service_catalog: normalizeStringArray(
            record.service_catalog ?? record.services,
            120,
            groundTruth.canonical_services
        ),
        required_intake_fields: normalizeStringArray(
            record.required_intake_fields ?? record.required_fields,
            120,
            groundTruth.required_intake_fields
        )
    }
}

function normalizeGeneratorOutput(raw: Record<string, unknown>, run: QaLabRun): QaLabGeneratorOutput {
    const kbFixtureRaw = raw.kb_fixture
    const kbFixtureRecord = (
        kbFixtureRaw && typeof kbFixtureRaw === 'object' && !Array.isArray(kbFixtureRaw)
            ? kbFixtureRaw as Record<string, unknown>
            : {}
    )
    const rawFixtureLines = normalizeStringArray(kbFixtureRecord.lines, 5000)
    const fixtureLines = rawFixtureLines.length >= run.fixture_min_lines
        ? rawFixtureLines
        : expandFixtureLinesToMinimum(rawFixtureLines, run.fixture_min_lines)

    const groundTruthRaw = raw.ground_truth
    const groundTruthRecord = (
        groundTruthRaw && typeof groundTruthRaw === 'object' && !Array.isArray(groundTruthRaw)
            ? groundTruthRaw as Record<string, unknown>
            : {}
    )

    const groundTruth = {
        canonical_services: normalizeStringArray(groundTruthRecord.canonical_services, 120),
        required_intake_fields: normalizeStringArray(groundTruthRecord.required_intake_fields, 120),
        critical_policy_facts: normalizeStringArray(groundTruthRecord.critical_policy_facts, 200),
        disallowed_fabricated_claims: normalizeStringArray(groundTruthRecord.disallowed_fabricated_claims, 200)
    }

    return {
        kb_fixture: {
            title: trimText(kbFixtureRecord.title, 'Generated QA Fixture'),
            lines: fixtureLines
        },
        ground_truth: groundTruth,
        derived_setup: normalizeDerivedSetup(raw.derived_setup ?? raw.derived_context, groundTruth),
        scenarios: normalizeGeneratorScenarios(raw.scenarios, run)
    }
}

function normalizeFindingSeverity(value: unknown): QaLabFindingSeverity {
    if (value === 'critical' || value === 'major' || value === 'minor') {
        return value
    }
    return 'minor'
}

function normalizeTargetLayer(value: unknown): 'kb' | 'skill' | 'prompt' | 'pipeline' {
    if (value === 'kb' || value === 'prompt' || value === 'pipeline') {
        return value
    }
    if (value === 'skill') {
        return 'pipeline'
    }
    return 'pipeline'
}

function normalizeEffort(value: unknown): 'low' | 'medium' | 'high' {
    if (value === 'low' || value === 'medium' || value === 'high') {
        return value
    }
    return 'medium'
}

function normalizeJudgeFindings(raw: unknown): QaLabJudgeFinding[] {
    if (!Array.isArray(raw)) return []

    const findings: QaLabJudgeFinding[] = []

    for (const candidate of raw) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
        const finding = candidate as Record<string, unknown>

        const violatedRule = trimText(finding.violated_rule ?? finding.rule, '')
        const evidence = trimText(finding.evidence, '')
        const rationale = trimText(finding.rationale, '')
        const suggestedFix = trimText(finding.suggested_fix ?? finding.suggestion, '')

        if (!violatedRule && !evidence && !rationale && !suggestedFix) continue

        findings.push({
            severity: normalizeFindingSeverity(finding.severity),
            violated_rule: violatedRule || 'unspecified_rule',
            evidence: evidence || 'No evidence provided.',
            rationale: rationale || 'No rationale provided.',
            suggested_fix: suggestedFix || 'No suggested fix provided.',
            target_layer: normalizeTargetLayer(finding.target_layer),
            effort: normalizeEffort(finding.effort),
            confidence: clampConfidence(finding.confidence)
        })

        if (findings.length >= MAX_FINDINGS) break
    }

    return findings
}

function normalizeTopActions(raw: unknown): QaLabJudgeTopAction[] {
    if (!Array.isArray(raw)) return []

    const actions: QaLabJudgeTopAction[] = []

    for (let index = 0; index < raw.length; index += 1) {
        const candidate = raw[index]
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
        const action = candidate as Record<string, unknown>
        const actionText = trimText(action.action, '')
        if (!actionText) continue

        actions.push({
            priority: clampInt(action.priority, 1, MAX_TOP_ACTIONS, index + 1),
            action: actionText,
            target_layer: normalizeTargetLayer(action.target_layer),
            expected_impact: trimText(action.expected_impact, 'Quality stability improvement'),
            effort: normalizeEffort(action.effort)
        })

        if (actions.length >= MAX_TOP_ACTIONS) break
    }

    actions.sort((left, right) => left.priority - right.priority)
    return actions
}

function normalizeJudgeResult(raw: Record<string, unknown>): QaLabJudgeResult {
    const scoreRaw = (
        raw.score_breakdown && typeof raw.score_breakdown === 'object' && !Array.isArray(raw.score_breakdown)
            ? raw.score_breakdown as Record<string, unknown>
            : {}
    )

    const groundedness = clampScore(scoreRaw.groundedness)
    const extractionAccuracy = clampScore(scoreRaw.extraction_accuracy ?? scoreRaw.extractionAccuracy)
    const conversationQuality = clampScore(scoreRaw.conversation_quality ?? scoreRaw.conversationQuality)

    const weightedTotal = toWeightedQaLabScore({
        groundedness,
        extractionAccuracy,
        conversationQuality
    })

    return {
        summary: trimText(raw.summary, ''),
        score_breakdown: {
            groundedness,
            extraction_accuracy: extractionAccuracy,
            conversation_quality: conversationQuality,
            weighted_total: weightedTotal
        },
        findings: normalizeJudgeFindings(raw.findings),
        top_actions: normalizeTopActions(raw.top_actions)
    }
}

function formatGeneratorUserPrompt(options: {
    run: QaLabRun
}) {
    const syntheticBusiness = buildSyntheticBusinessProfile(options.run.id)
    const syntheticContext = buildSyntheticOrganizationContext(options.run)
    const scenarioTurnLimit = getScenarioTurnLimit(options.run)
    const styleMix = (
        options.run.fixture_style_mix
        && typeof options.run.fixture_style_mix === 'object'
        && !Array.isArray(options.run.fixture_style_mix)
            ? options.run.fixture_style_mix as Record<string, unknown>
            : {}
    )

    const payload = {
        run_constraints: {
            preset: options.run.preset,
            scenario_count: options.run.scenario_count,
            max_turns_per_scenario: scenarioTurnLimit,
            fixture_min_lines: options.run.fixture_min_lines,
            fixture_style_mix: {
                clean: styleMix.clean ?? 0,
                semiNoisy: styleMix.semiNoisy ?? 0,
                messy: styleMix.messy ?? 0
            }
        },
        generation_profile: {
            mode: 'synthetic_random_smb',
            forced_sector: syntheticBusiness.sector,
            business_name_hint: syntheticBusiness.businessName,
            mandatory_focus: [
                'lead_scoring_signals',
                'missing_info_collection',
                'grounded_ai_answers'
            ],
            scenario_distribution_rules: {
                max_support_or_handoff_ratio: 0.35,
                min_lead_qualification_ratio: 0.6
            },
            hard_turn_bounds: {
                min_turns_per_scenario: QA_LAB_MIN_SCENARIO_TURNS,
                max_turns_per_scenario: QA_LAB_MAX_SCENARIO_TURNS
            }
        },
        organization_context: syntheticContext
    }

    return JSON.stringify(payload, null, 2)
}

function buildGeneratorPrompts(run: QaLabRun) {
    const systemPrompt = `You are the Generator role in an AI QA Lab.
Create realistic, noisy QA fixtures and multi-turn customer scenario blueprints.
Follow this pipeline order:
1) Build KB fixture.
2) Derive service profile, service catalog, and required intake fields from that fixture.
3) Generate casual customer conversation scenarios.
Business constraints:
- You MUST model one concrete SMB business from generation_profile.forced_sector.
- Use generation_profile.business_name_hint in kb_fixture.title (or a close variant).
- Do NOT default to generic customer support/help desk domain.
- organization_context is synthetic metadata generated by QA Lab itself (not real tenant data).
- Do not assume any tenant-specific skill catalog or legacy knowledge base.
Return ONLY valid JSON with this schema:
{
  "kb_fixture": { "title": string, "lines": string[] },
  "ground_truth": {
    "canonical_services": string[],
    "required_intake_fields": string[],
    "critical_policy_facts": string[],
    "disallowed_fabricated_claims": string[]
  },
  "derived_setup": {
    "offering_profile_summary": string,
    "service_catalog": string[],
    "required_intake_fields": string[]
  },
  "scenarios": [
    {
      "id": string,
      "title": string,
      "goal": string,
      "customer_profile": string,
      "lead_temperature": "hot" | "warm" | "cold",
      "information_sharing": "cooperative" | "partial" | "resistant",
      "turns": [ { "customer": string } ]
    }
  ]
}
Rules:
- Produce exactly scenario_count scenarios.
- Each scenario must have 3 to max_turns_per_scenario customer turns (and max_turns_per_scenario is never above 6).
- kb_fixture.lines must have at least fixture_min_lines lines.
- derived_setup must be consistent with KB fixture content.
- Keep noise realistic: typos, mixed clarity, partial structure, and repetitive fragments.
- Do not make all lines polished.
- Keep conversation style casual and human (not form-like).
- Focus on realistic service-sales flow: service fit, pricing, availability, scope, and next steps.
- Include missing-information collection needs (budget, timeline, contact preference, service details).
- Include lead scoring signals in scenario turns (intent clarity, urgency, budget fit, timeline fit).
- Keep turns stateful: each later turn should logically follow previous customer/assistant context, not reset the conversation.
- Scenario mix must include hot, warm, and cold temperatures.
- Include at least one resistant scenario where customer avoids giving full lead info.
- Complaint/privacy/handoff-only scenarios must stay minority (max 35%).
- Lead qualification scenarios must be majority (min 60%).
- Do not generate filler artifacts like [varyant], tekrar notu, ??, or "not 1:" style placeholders.
- Do not output markdown fences.`

    const userPrompt = formatGeneratorUserPrompt({ run })
    return {
        systemPrompt,
        userPrompt
    }
}

function toQaLabHistoryMessages(history: ConversationTurn[]) {
    return history
        .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
        .slice(-QA_LAB_RESPONDER_MAX_HISTORY_TURNS)
        .map((turn) => ({
            role: turn.role,
            content: turn.content
        }))
}

function tokenizeForKbMatch(value: string) {
    return value
        .toLocaleLowerCase('tr-TR')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 3)
}

function buildQaLabKbContext(
    generated: QaLabGeneratorOutput,
    message: string
) {
    const queryTokens = new Set(tokenizeForKbMatch(message))
    const scoredLines = generated.kb_fixture.lines
        .map((line, index) => {
            const lineTokens = tokenizeForKbMatch(line)
            const overlap = lineTokens.reduce((count, token) => (
                queryTokens.has(token) ? count + 1 : count
            ), 0)
            const score = overlap > 0 ? (overlap * 10) - index : 0
            return { line, score }
        })

    const relevantLines = scoredLines
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, QA_LAB_RESPONDER_MAX_KB_LINES)
        .map((item) => item.line)

    if (relevantLines.length > 0) {
        return {
            lines: relevantLines,
            hasRelevantContext: true
        }
    }

    return {
        lines: generated.kb_fixture.lines.slice(0, Math.min(12, QA_LAB_RESPONDER_MAX_KB_LINES)),
        hasRelevantContext: false
    }
}

function buildQaLabFallbackTopics(generated: QaLabGeneratorOutput) {
    const topics = [
        ...generated.derived_setup.service_catalog,
        ...generated.ground_truth.canonical_services
    ]
        .map((item) => item.trim())
        .filter(Boolean)

    const uniqueTopics = Array.from(new Set(topics)).slice(0, 6)
    if (uniqueTopics.length > 0) {
        return uniqueTopics
    }

    return [
        'hizmet kapsamı',
        'fiyat aralığı',
        'uygunluk ve zamanlama'
    ]
}

async function generateQaLabAssistantResponse(input: {
    openai: OpenAI
    run: QaLabRun
    generated: QaLabGeneratorOutput
    message: string
    history: ConversationTurn[]
}) {
    const responseLanguage = resolveMvpResponseLanguage(input.message)
    const responseLanguageName = resolveMvpResponseLanguageName(input.message)
    const kbContext = buildQaLabKbContext(input.generated, input.message)
    const fallbackTopics = buildQaLabFallbackTopics(input.generated)
    const historyMessages = toQaLabHistoryMessages(input.history)
    const systemPrompt = `You are the AI QA Lab simulated assistant.
This simulation is synthetic and must NOT use any organization-specific skill catalog.
Use only the KB_CONTEXT below for factual claims.
If KB_CONTEXT is insufficient for the user's request:
- say that exact detail is not available yet,
- ask one clarifying question,
- offer up to 3 topics from FALLBACK_TOPICS to continue.
Do not redirect to human support or transfer-to-team style replies unless user explicitly asks for a human.
Keep continuity with conversation history and avoid resetting context.
Reply language policy (MVP): use ${responseLanguageName} only.
Engagement-question policy:
- A single engagement question is allowed when the current user need is answered and the next intent is unclear.
- Do NOT append menu-like suggestions on every turn (e.g., repeating multiple service options each reply).
- If user asks a clear next-step request (price, booking, schedule, onboarding steps), answer that request directly and do not add generic "other topics" prompts.
- Avoid repeating the same engagement pattern in consecutive assistant turns.

KB_CONTEXT:
${kbContext.lines.map((line, index) => `${index + 1}. ${line}`).join('\n')}

FALLBACK_TOPICS:
${fallbackTopics.map((topic, index) => `${index + 1}. ${topic}`).join('\n')}

HAS_RELEVANT_CONTEXT: ${kbContext.hasRelevantContext ? 'yes' : 'no'}`

    const completion = await input.openai.chat.completions.create({
        model: input.run.generator_model,
        temperature: 0.2,
        max_tokens: QA_LAB_RESPONDER_MAX_OUTPUT_TOKENS,
        messages: [
            { role: 'system', content: systemPrompt },
            ...historyMessages,
            { role: 'user', content: input.message }
        ]
    })

    const responseRaw = completion.choices[0]?.message?.content ?? ''
    const response = trimText(
        responseRaw,
        responseLanguage === 'tr'
            ? 'Bu konuda net bilgi bulamadım. Biraz daha detay paylaşır mısınız?'
            : 'I could not find a clear detail yet. Could you share a bit more context?'
    )

    const usage = completion.usage ?? estimateCompletionUsage(
        systemPrompt,
        JSON.stringify(historyMessages, null, 2),
        response
    )

    return {
        response,
        usage
    }
}

function buildJudgePrompts(options: {
    run: QaLabRun
    generated: QaLabGeneratorOutput
    executedCases: QaLabExecutedCase[]
}) {
    const scenarioTurnLimit = getScenarioTurnLimit(options.run)
    const systemPrompt = `You are the Judge role in an AI QA Lab.
Evaluate transcripts with strict evidence standards.
Return ONLY valid JSON with this schema:
{
  "summary": string,
  "score_breakdown": {
    "groundedness": number,
    "extraction_accuracy": number,
    "conversation_quality": number
  },
  "findings": [
    {
      "severity": "critical" | "major" | "minor",
      "violated_rule": string,
      "evidence": string,
      "rationale": string,
      "suggested_fix": string,
      "target_layer": "kb" | "prompt" | "pipeline",
      "effort": "low" | "medium" | "high",
      "confidence": number
    }
  ],
  "top_actions": [
    {
      "priority": number,
      "action": string,
      "target_layer": "kb" | "prompt" | "pipeline",
      "expected_impact": string,
      "effort": "low" | "medium" | "high"
    }
  ]
}
Scoring weights:
- groundedness: 40%
- extraction_accuracy: 35%
- conversation_quality: 25%
Critical means KB-external/contradictory claims, materially wrong guidance, or safety-policy risk.
Evaluate from a real customer lens first:
- Does the assistant feel coherent, trustworthy, and logically consistent turn by turn?
- Are questions meaningful and timed naturally (not form-dumping)?
- Are responses relevant to customer intent in that exact moment?
Then evaluate extraction and pipeline quality as QA reviewer.
Treat broken sequence as quality debt:
- If replies skip necessary context and jump to wrong stage, penalize conversation_quality.
- If extraction intent progression is illogical across turns, penalize extraction_accuracy.
Use scenario attributes:
- In hot/cooperative scenarios, missing key intake questions should reduce extraction_accuracy.
- In cold/resistant scenarios, overly aggressive repeated questioning should reduce conversation_quality.
Judge should reward balanced, natural lead progression instead of rigid form-like interrogation.
Engagement-question judging rule:
- Do NOT penalize a single contextual engagement question after a complete answer.
- Penalize only excessive, repetitive, or context-breaking follow-up prompts (especially repeated menu-like prompts across consecutive turns).
This QA Lab mode is skill-free:
- Do not use skill layer in findings or actions.
- Route recommendations only to kb, prompt, or pipeline layers.
Pricing-groundedness rule:
- If KB/ground_truth does not include a concrete numeric price, do NOT penalize the assistant for refusing to give an exact price.
- In that case, reward safe behavior: transparent uncertainty + clarifying question + next-step guidance.
- Penalize only when the assistant fabricates a concrete price/range not grounded in KB.
Only report findings with concrete evidence from provided transcripts.`

    const userPayload = {
        run_constraints: {
            preset: options.run.preset,
            scenario_count_target: options.run.scenario_count,
            max_turns_per_scenario: scenarioTurnLimit
        },
        derived_setup: options.generated.derived_setup,
        ground_truth: options.generated.ground_truth,
        executed_cases: options.executedCases
    }

    return {
        systemPrompt,
        userPrompt: JSON.stringify(userPayload, null, 2)
    }
}

async function getQaRun(supabase: SupabaseClientLike, runId: string) {
    const { data, error } = await supabase
        .from('qa_runs')
        .select('*')
        .eq('id', runId)
        .maybeSingle()

    if (error) {
        throw new Error(`Failed to load QA run: ${error.message}`)
    }

    if (!data) {
        throw new Error('QA run not found')
    }

    return data as QaLabRun
}

async function updateRunState(
    supabase: SupabaseClientLike,
    runId: string,
    patch: Partial<QaLabRun>
) {
    const { error } = await supabase
        .from('qa_runs')
        .update({
            ...patch,
            updated_at: new Date().toISOString()
        })
        .eq('id', runId)

    if (error) {
        throw new Error(`Failed to update QA run: ${error.message}`)
    }
}

async function finalizeRun(
    supabase: SupabaseClientLike,
    runId: string,
    status: QaLabRunStatus,
    result: QaLabRunResult,
    report: Json
) {
    await updateRunState(supabase, runId, {
        status,
        result,
        report,
        finished_at: new Date().toISOString()
    })
}

function ensureExecutableRunStatus(status: QaLabRunStatus) {
    if (status === 'queued' || status === 'running') {
        return
    }
    throw new Error(`Run cannot be executed from status: ${status}`)
}

export function buildExecutionErrorReport(error: unknown): Json {
    const errorMessage = error instanceof Error ? error.message : 'Unknown execution error'
    const details = error instanceof QaLabExecutionError ? error.details : null
    return {
        version: REPORT_VERSION,
        error: {
            message: errorMessage,
            ...(details ? { details } : {})
        },
        generated_at: new Date().toISOString()
    } as unknown as Json
}

function buildScenarioMixSummary(scenarios: QaLabGeneratorScenario[]) {
    return scenarios.reduce((summary, scenario) => {
        summary.lead_temperature[scenario.lead_temperature] += 1
        summary.information_sharing[scenario.information_sharing] += 1
        return summary
    }, {
        lead_temperature: {
            hot: 0,
            warm: 0,
            cold: 0
        },
        information_sharing: {
            cooperative: 0,
            partial: 0,
            resistant: 0
        }
    })
}

export async function executeQaLabRunById(
    runId: string,
    options?: ExecuteQaLabRunOptions
) {
    ensureOpenAiApiKey()

    const supabase = options?.supabase ?? await createClient()
    const initialRun = await getQaRun(supabase, runId)
    ensureExecutableRunStatus(initialRun.status)

    if (initialRun.status === 'queued') {
        await updateRunState(supabase, runId, {
            status: 'running',
            started_at: initialRun.started_at ?? new Date().toISOString()
        })
    }

    const run = await getQaRun(supabase, runId)
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const tracker: QaLabTokenTracker = {
        budget: run.token_budget,
        consumed: 0,
        consumedInput: 0,
        consumedOutput: 0
    }

    try {
        const generatorPrompts = buildGeneratorPrompts(run)

        const generatorAttemptDiagnostics: QaLabGeneratorAttemptDiagnostics[] = []
        let generated: QaLabGeneratorOutput | null = null
        let generatorLastError: string | null = null

        for (let attempt = 1; attempt <= GENERATOR_MAX_ATTEMPTS; attempt += 1) {
            if (isBudgetExhausted(tracker.consumed, tracker.budget)) {
                generatorLastError = 'Token budget exhausted during generator retries'
                break
            }

            const generatorUserPrompt = createGeneratorRetryUserPrompt(
                generatorPrompts.userPrompt,
                attempt,
                generatorLastError
            )

            try {
                const generatorCompletion = await openai.chat.completions.create({
                    model: run.generator_model,
                    temperature: MODEL_TEMPERATURE,
                    max_tokens: GENERATOR_MAX_OUTPUT_TOKENS,
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: generatorPrompts.systemPrompt },
                        { role: 'user', content: generatorUserPrompt }
                    ]
                })

                const generatorRawOutput = generatorCompletion.choices[0]?.message?.content ?? ''
                const finishReason = generatorCompletion.choices[0]?.finish_reason ?? null
                const usage = generatorCompletion.usage ?? estimateCompletionUsage(
                    generatorPrompts.systemPrompt,
                    generatorUserPrompt,
                    generatorRawOutput
                )
                consumeTokens(tracker, usage)

                if (!generatorRawOutput.trim()) {
                    generatorLastError = 'Generator returned an empty response'
                    generatorAttemptDiagnostics.push(buildGeneratorAttemptDiagnostics({
                        attempt,
                        finishReason,
                        output: generatorRawOutput,
                        usage,
                        validationError: generatorLastError
                    }))
                    continue
                }

                const generatorJson = parseJsonObject(generatorRawOutput)
                if (!generatorJson) {
                    generatorLastError = 'Generator response is not valid JSON'
                    generatorAttemptDiagnostics.push(buildGeneratorAttemptDiagnostics({
                        attempt,
                        finishReason,
                        output: generatorRawOutput,
                        usage,
                        validationError: generatorLastError
                    }))
                    continue
                }

                try {
                    const normalizedOutput = normalizeGeneratorOutput(generatorJson, run)
                    const qualityError = validateGeneratorOutputQuality(normalizedOutput, run)

                    if (qualityError) {
                        generatorLastError = qualityError
                        generatorAttemptDiagnostics.push(buildGeneratorAttemptDiagnostics({
                            attempt,
                            finishReason,
                            output: generatorRawOutput,
                            usage,
                            validationError: qualityError
                        }))
                        continue
                    }

                    generated = normalizedOutput
                    generatorLastError = null
                    generatorAttemptDiagnostics.push(buildGeneratorAttemptDiagnostics({
                        attempt,
                        finishReason,
                        output: generatorRawOutput,
                        usage,
                        validationError: null
                    }))
                    break
                } catch (error) {
                    generatorLastError = error instanceof Error
                        ? error.message
                        : 'Generator output validation failed'
                    generatorAttemptDiagnostics.push(buildGeneratorAttemptDiagnostics({
                        attempt,
                        finishReason,
                        output: generatorRawOutput,
                        usage,
                        validationError: generatorLastError
                    }))
                }
            } catch (error) {
                generatorLastError = error instanceof Error
                    ? error.message
                    : 'Generator request failed'
                generatorAttemptDiagnostics.push(buildGeneratorAttemptDiagnostics({
                    attempt,
                    finishReason: null,
                    output: '',
                    validationError: generatorLastError
                }))
            }
        }

        if (!generated) {
            throw new QaLabExecutionError(
                generatorLastError ?? 'Generator failed after retry attempts',
                {
                    stage: 'generator',
                    maxAttempts: GENERATOR_MAX_ATTEMPTS,
                    attempts: generatorAttemptDiagnostics
                }
            )
        }

        const executedCases: QaLabExecutedCase[] = []
        let budgetStopped = isBudgetExhausted(tracker.consumed, tracker.budget)
        let executedTurnCount = 0

        for (let caseIndex = 0; caseIndex < generated.scenarios.length; caseIndex += 1) {
            if (budgetStopped) break
            const scenario = generated.scenarios[caseIndex]
            if (!scenario) continue
            const history: ConversationTurn[] = []
            const executedTurns: QaLabExecutedTurn[] = []

            for (let turnIndex = 0; turnIndex < scenario.turns.length; turnIndex += 1) {
                if (isBudgetExhausted(tracker.consumed, tracker.budget)) {
                    budgetStopped = true
                    break
                }

                const customerMessage = scenario.turns[turnIndex]?.customer ?? ''
                if (!customerMessage.trim()) continue

                const response = await generateQaLabAssistantResponse({
                    openai,
                    run,
                    generated,
                    message: customerMessage,
                    history
                })

                const completionUsage = {
                    prompt_tokens: clampInt(response.usage.prompt_tokens, 0, 1_000_000_000, 0),
                    completion_tokens: clampInt(response.usage.completion_tokens, 0, 1_000_000_000, 0),
                    total_tokens: clampInt(response.usage.total_tokens, 0, 1_000_000_000, 0)
                }
                consumeTokens(tracker, completionUsage)

                const tokenUsage = {
                    input_tokens: completionUsage.prompt_tokens,
                    output_tokens: completionUsage.completion_tokens,
                    total_tokens: completionUsage.total_tokens
                }

                const assistantResponse = trimText(response.response, 'No response generated.')

                executedTurns.push({
                    turn_index: turnIndex + 1,
                    customer_message: customerMessage,
                    assistant_response: assistantResponse,
                    token_usage: tokenUsage
                })
                executedTurnCount += 1

                history.push({
                    role: 'user',
                    content: customerMessage
                })
                history.push({
                    role: 'assistant',
                    content: assistantResponse
                })
            }

            executedCases.push({
                case_id: scenario.id,
                title: scenario.title,
                goal: scenario.goal,
                customer_profile: scenario.customer_profile,
                lead_temperature: scenario.lead_temperature,
                information_sharing: scenario.information_sharing,
                executed_turns: executedTurns
            })
        }

        let judgeResult: QaLabJudgeResult = {
            summary: '',
            score_breakdown: {
                groundedness: 0,
                extraction_accuracy: 0,
                conversation_quality: 0,
                weighted_total: 0
            },
            findings: [],
            top_actions: []
        }
        let judgeSkippedReason: string | null = null

        if (executedCases.length === 0) {
            judgeSkippedReason = 'no_cases_executed'
        } else if (!budgetStopped) {
            const judgePrompts = buildJudgePrompts({
                run,
                generated,
                executedCases
            })
            const judgePromptEstimatedInputTokens = estimateTokenCount(judgePrompts.systemPrompt)
                + estimateTokenCount(judgePrompts.userPrompt)
            const remainingForJudge = getRemainingTokens(tracker) - judgePromptEstimatedInputTokens

            if (remainingForJudge < JUDGE_MIN_OUTPUT_TOKENS) {
                budgetStopped = true
                judgeSkippedReason = 'insufficient_budget_for_judge'
            } else {
                const judgeMaxOutputTokens = Math.max(
                    JUDGE_MIN_OUTPUT_TOKENS,
                    Math.min(JUDGE_MAX_OUTPUT_TOKENS, remainingForJudge)
                )

                const judgeCompletion = await openai.chat.completions.create({
                    model: run.judge_model,
                    temperature: 0.1,
                    max_tokens: judgeMaxOutputTokens,
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: judgePrompts.systemPrompt },
                        { role: 'user', content: judgePrompts.userPrompt }
                    ]
                })

                const judgeRawOutput = judgeCompletion.choices[0]?.message?.content ?? ''
                consumeTokens(
                    tracker,
                    judgeCompletion.usage ?? estimateCompletionUsage(
                        judgePrompts.systemPrompt,
                        judgePrompts.userPrompt,
                        judgeRawOutput
                    )
                )

                if (!judgeRawOutput.trim()) {
                    judgeSkippedReason = 'empty_judge_response'
                } else {
                    const judgeJson = parseJsonObject(judgeRawOutput)
                    if (!judgeJson) {
                        judgeSkippedReason = 'invalid_judge_json'
                    } else {
                        judgeResult = normalizeJudgeResult(judgeJson)
                    }
                }
            }
        } else {
            judgeSkippedReason = 'budget_exhausted_before_judge'
        }

        const findings = judgeResult.findings
        const runResult = findings.length > 0 || judgeResult.summary
            ? computeQaLabRunResult(findings)
            : 'pending'
        const finalStatus: QaLabRunStatus = budgetStopped ? 'budget_stopped' : 'completed'
        const pipelineChecks = buildQaLabPipelineChecks({
            fixtureLineCount: generated.kb_fixture.lines.length,
            fixtureMinLines: run.fixture_min_lines,
            derivedSetup: {
                offeringProfileSummary: generated.derived_setup.offering_profile_summary,
                serviceCatalogCount: generated.derived_setup.service_catalog.length,
                requiredIntakeFieldCount: generated.derived_setup.required_intake_fields.length
            },
            scenarioCountTarget: run.scenario_count,
            scenarioCountGenerated: generated.scenarios.length,
            executedCaseCount: executedCases.length,
            judgeSkippedReason
        })

        const report = {
            version: REPORT_VERSION,
            generated_at: new Date().toISOString(),
            budget: {
                limit_tokens: tracker.budget,
                consumed_tokens: tracker.consumed,
                consumed_input_tokens: tracker.consumedInput,
                consumed_output_tokens: tracker.consumedOutput,
                consumed_credits: calculateUsageCreditCost({
                    inputTokens: tracker.consumedInput,
                    outputTokens: tracker.consumedOutput
                }),
                remaining_tokens: getRemainingTokens(tracker),
                exhausted: budgetStopped
            },
            generator: {
                fixture_title: generated.kb_fixture.title,
                fixture_line_count: generated.kb_fixture.lines.length,
                fixture_lines: generated.kb_fixture.lines,
                derived_setup: generated.derived_setup,
                ground_truth: generated.ground_truth,
                scenario_count_generated: generated.scenarios.length,
                scenario_mix: buildScenarioMixSummary(generated.scenarios)
            },
            execution: {
                target_scenarios: run.scenario_count,
                executed_scenarios: executedCases.length,
                executed_turns: executedTurnCount,
                cases: executedCases
            },
            pipeline_checks: pipelineChecks,
            judge: {
                summary: judgeResult.summary,
                score_breakdown: judgeResult.score_breakdown,
                findings: findings,
                top_actions: judgeResult.top_actions,
                skipped_reason: judgeSkippedReason
            }
        } as unknown as Json

        await finalizeRun(
            supabase,
            runId,
            finalStatus,
            runResult,
            report
        )
    } catch (error) {
        const report = buildExecutionErrorReport(error)
        await finalizeRun(supabase, runId, 'failed', 'pending', report)
    }

    return getQaRun(supabase, runId)
}
