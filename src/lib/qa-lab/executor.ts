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
import {
    analyzeQaLabIntakeCoverage,
    type QaLabIntakeCoverageCaseResult,
    type QaLabIntakeCoverageTurnInput
} from '@/lib/qa-lab/intake-coverage'
import { buildQaLabPipelineChecks } from '@/lib/qa-lab/pipeline-checks'
import { calculateQaLabRunUsdCost } from '@/lib/qa-lab/cost'
import { calculateUsageCreditCost } from '@/lib/billing/credit-cost'
import { resolveMvpResponseLanguage, resolveMvpResponseLanguageName } from '@/lib/ai/language'
import type { Json, QaLabRun, QaLabRunResult, QaLabRunStatus } from '@/types/database'

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

const GENERATOR_MAX_OUTPUT_TOKENS = 6400
const GENERATOR_MAX_ATTEMPTS = 3
const GENERATOR_DIAGNOSTIC_SNIPPET_CHARS = 260
const JUDGE_MAX_OUTPUT_TOKENS = 5200
const JUDGE_MIN_OUTPUT_TOKENS = 320
const JUDGE_BASE_OUTPUT_TOKENS = 900
const JUDGE_OUTPUT_TOKENS_PER_SCENARIO = 85
const JUDGE_SCORE_ANOMALY_THRESHOLD = 5
const JUDGE_SCORE_ANOMALY_MIN_CASE_COUNT = 8
const JUDGE_SCORE_ANOMALY_MIN_READY_RATIO = 0.5
const JUDGE_SCORE_ANOMALY_MIN_FULFILLMENT = 0.55
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
const QA_LAB_CONTACT_PREFERENCE_REPLACEMENT_FIELD = 'Uygun geri dönüş zaman aralığı'
const QA_LAB_URGENCY_REPLACEMENT_FIELD = 'Proje aciliyet seviyesi'
const QA_LAB_MIN_DEEP_SCENARIO_TURNS = 4
const QA_LAB_FIXTURE_EXPANSION_SUFFIXES = [
    'Devamında kapsam ve beklenti netleştirilir.',
    'Süreç adımları müşteri onayına göre ilerler.',
    'Fiyatlama hizmet detayına göre güncellenir.',
    'Uygunluk için tarih bilgisi teyit edilir.',
    'Müşteri hedefi ve önceliği ayrıca sorulur.',
    'Net teklif için eksik bilgiler tamamlanır.'
] as const

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
const GENERATOR_FALLBACK_LINE_PATTERN = /^fixture fallback line\s+\d+\s*:/i
const QA_LAB_REFUSAL_PATTERNS = [
    /paylaşmak istemiyorum/i,
    /paylasmak istemiyorum/i,
    /söylemek istemiyorum/i,
    /soylemek istemiyorum/i,
    /vermek istemiyorum/i,
    /detay vermek istemiyorum/i,
    /gizli kalsın/i,
    /zorunda değilim/i,
    /zorunda degilim/i
] as const

const QA_LAB_DIVERSITY_PROCESS_STEPS = [
    'ön ihtiyaç analizi yapılır',
    'kapsam ve teslim beklentisi netleştirilir',
    'bütçe ile değer dengesi karşılaştırılır',
    'uygunluk ve zamanlama teyit edilir',
    'risk ve bağımlılık notları çıkarılır',
    'sonraki adım için net aksiyon belirlenir'
] as const

const QA_LAB_DIVERSITY_DECISION_SIGNALS = [
    'satın alma niyeti',
    'aciliyet seviyesi',
    'bütçe uygunluğu',
    'zaman uyumu',
    'kapsam netliği',
    'karar verici erişimi'
] as const

const QA_LAB_DIVERSITY_ACTION_PHRASES = [
    'teklif kapsamı netleştirilir',
    'minimum uygulanabilir paket çıkarılır',
    'yüksek öncelikli ihtiyaçlar sıralanır',
    'fiyat etkileyen parametreler ayrıştırılır',
    'devam kararı için açık kriterler tanımlanır',
    'human handoff özeti hazırlanır'
] as const

const QA_LAB_CONTACT_PREFERENCE_FIELD_PATTERNS = [
    /iletişim tercih/i,
    /iletisim tercih/i,
    /contact preference/i,
    /preferred contact/i,
    /iletişim kanalı/i,
    /iletisim kanali/i
]

const QA_LAB_TIMELINE_FIELD_PATTERNS = [
    /zaman/i,
    /saat/i,
    /tarih/i,
    /uygunluk/i,
    /randevu/i,
    /timeline/i,
    /availability/i
]

const QA_LAB_URGENCY_FIELD_PATTERNS = [
    /acil durum/i,
    /aciliyet/i,
    /urgent/i,
    /urgency/i,
    /oncelik/i,
    /öncelik/i,
    /priority/i
]

const QA_LAB_GENERIC_CLARIFICATION_QUESTION_PATTERNS = [
    /\bbu bilgi/i,
    /\bbu detayi/i,
    /\bbu detayı/i,
    /\bbu konuda\b/i,
    /\bpaylasabilir misiniz\b/i,
    /\bpaylaşabilir misiniz\b/i,
    /\bbelirtebilir misiniz\b/i
]

const REASK_FINDING_PATTERNS = [
    /\bre-?ask/i,
    /\brepeat/i,
    /\brepetitive/i,
    /\balready provided/i,
    /\btekrar\b/i,
    /\byeniden\b/i,
    /\bayn[iı]\s+bilgi\b/i,
    /\bm[ıi]ssing budget inquiry\b/i
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

interface QaLabJudgeScenarioAssessment {
    case_id: string
    assistant_success: 'pass' | 'warn' | 'fail'
    answer_quality_score: number
    logic_score: number
    groundedness_score: number
    summary: string
    strengths: string[]
    issues: string[]
    confidence: number
    source: 'judge' | 'fallback'
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
    scenario_assessments: QaLabJudgeScenarioAssessment[]
}

interface QaLabJudgeFindingCitation {
    scenarioId: string
    turnIndex: number
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
    consumedInputCached: number
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

type QaLabIntakeFieldCategory =
    | 'age'
    | 'budget'
    | 'timeline'
    | 'urgency'
    | 'service'
    | 'business_size'
    | 'callback_time'
    | 'generic'

function normalizeForFieldMatching(value: string) {
    return value
        .toLowerCase()
        .replace(/ı/g, 'i')
        .replace(/ç/g, 'c')
        .replace(/ğ/g, 'g')
        .replace(/ö/g, 'o')
        .replace(/ş/g, 's')
        .replace(/ü/g, 'u')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function tokenizeForFieldMatching(value: string) {
    const normalized = normalizeForFieldMatching(value)
    if (!normalized) return []
    return normalized
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
}

function detectIntakeFieldCategory(field: string): QaLabIntakeFieldCategory {
    const normalized = normalizeForFieldMatching(field)
    if (/(yas|yaş|age|sinif|sınıf)/i.test(normalized)) return 'age'
    if (/(butce|bütçe|fiyat|ucret|ücret|price|cost)/i.test(normalized)) return 'budget'
    if (/(acil|aciliyet|urgent|urgency|oncelik|priority|hizli|hızlı)/i.test(normalized)) return 'urgency'
    if (/(zaman|tarih|saat|uygunluk|timeline|availability|program)/i.test(normalized)) return 'timeline'
    if (/(ders turu|ders türü|ders|konu|hizmet|service|kapsam)/i.test(normalized)) return 'service'
    if (/(isletme buyuklugu|işletme büyüklüğü|calisan|çalışan|team size|employee)/i.test(normalized)) return 'business_size'
    if (/(geri donus|geri dönüş|callback|time window|zaman araligi|zaman aralığı)/i.test(normalized)) return 'callback_time'
    return 'generic'
}

function getIntakeFieldKeywords(field: string) {
    const tokens = tokenizeForFieldMatching(field)
    const category = detectIntakeFieldCategory(field)
    const keywordSet = new Set(tokens)

    if (category === 'age') {
        for (const keyword of ['yas', 'yaş', 'age', 'yasinda', 'yaşında', 'sinif', 'sınıf', 'ogrenci', 'öğrenci']) {
            keywordSet.add(keyword)
        }
    }
    if (category === 'budget') {
        for (const keyword of ['butce', 'bütçe', 'fiyat', 'ucret', 'ücret', 'tl', 'usd', 'price', 'cost']) {
            keywordSet.add(keyword)
        }
    }
    if (category === 'urgency') {
        for (const keyword of ['acil', 'aciliyet', 'urgent', 'urgency', 'oncelik', 'öncelik', 'hizli', 'hızlı', 'asap']) {
            keywordSet.add(keyword)
        }
    }
    if (category === 'timeline' || category === 'callback_time') {
        for (const keyword of ['zaman', 'saat', 'tarih', 'hafta', 'ay', 'uygun', 'program', 'randevu']) {
            keywordSet.add(keyword)
        }
    }
    if (category === 'service') {
        for (const keyword of ['ders', 'konu', 'hizmet', 'service', 'matematik', 'fen']) {
            keywordSet.add(keyword)
        }
    }
    if (category === 'business_size') {
        for (const keyword of ['isletme', 'işletme', 'calisan', 'çalışan', 'kobi', 'buyukluk', 'büyüklük']) {
            keywordSet.add(keyword)
        }
    }

    return {
        category,
        keywords: Array.from(keywordSet).filter((value) => value.length >= 3)
    }
}

function hasRefusalSignal(value: string) {
    const normalized = normalizeForFieldMatching(value)
    if (!normalized) return false
    return QA_LAB_REFUSAL_PATTERNS.some((pattern) => pattern.test(normalized))
}

function isCustomerAnsweringCategory(value: string, category: QaLabIntakeFieldCategory) {
    const normalized = normalizeForFieldMatching(value)
    if (!normalized) return false

    if (category === 'age') {
        const hasAgeWord = /(yas|yaş|sinif|sınıf|ogrenci|öğrenci)/i.test(normalized)
        const hasAgeLikeNumber = /\b([4-9]|1[0-9]|2[0-5])\b/.test(normalized)
        return hasAgeWord || hasAgeLikeNumber
    }
    if (category === 'budget') {
        return (
            /(\d[\d.,]*)\s*(tl|₺|usd|\$|eur|bin)/i.test(value)
            || /\b(\d{3,5})\b/.test(normalized)
            || /(butce|bütçe|fiyat|ucret|ücret|price|cost)/i.test(normalized)
        )
    }
    if (category === 'timeline') {
        return (
            /\b\d{1,2}[:.]\d{2}\b/.test(normalized)
            || /(hafta|ay|yarin|yarın|bugun|bugün|saat|tarih|pazartesi|salı|sali|carsamba|çarşamba|uygunluk|randevu)/i.test(normalized)
        )
    }
    if (category === 'urgency') {
        return /(acil|aciliyet|hizli|hızlı|hemen|oncelik|öncelik|kritik|asap|en kisa|en kısa)/i.test(normalized)
    }
    if (category === 'service') {
        return /(hizmet|service|paket|konu|kapsam|modul|modül|cozum|çözüm|gelistirme|geliştirme|uygulama|proje)/i.test(normalized)
    }
    if (category === 'business_size') {
        return (
            /(kucuk|küçük|orta|buyuk|büyük|calisan|çalışan|kisiyiz|kişiyiz|ekip|personel|isletme|işletme|şube)/i.test(normalized)
            || /\b\d+\s*(calisan|çalışan|kisi|kişi|personel)\b/i.test(normalized)
        )
    }
    if (category === 'callback_time') {
        return (
            /(geri donus|geri dönüş|callback|gunduz|gündüz|aksam|akşam|mesai|uygun saat)/i.test(normalized)
            || /\b\d{1,2}[:.]\d{2}\b/.test(normalized)
        )
    }

    return false
}

function hasQuestionIntent(value: string) {
    const normalized = normalizeForFieldMatching(value)
    if (!normalized) return false
    return (
        value.includes('?')
        || normalized.includes('misiniz')
        || normalized.includes('mısınız')
        || normalized.includes('paylasir')
        || normalized.includes('paylaşır')
        || normalized.includes('belirt')
        || normalized.includes('hangi')
        || normalized.includes('nedir')
        || normalized.includes('could you')
    )
}

function messageContainsKeywords(value: string, keywords: string[]) {
    const normalized = normalizeForFieldMatching(value)
    if (!normalized) return false
    return keywords.some((keyword) => normalized.includes(keyword))
}

function isAssistantAskingField(value: string, field: string) {
    const { keywords } = getIntakeFieldKeywords(field)
    return hasQuestionIntent(value) && messageContainsKeywords(value, keywords)
}

function isCustomerAnsweringField(value: string, field: string) {
    const normalized = normalizeForFieldMatching(value)
    if (!normalized) return false

    const { category, keywords } = getIntakeFieldKeywords(field)
    const keywordMatch = keywords.some((keyword) => normalized.includes(keyword))

    if (category === 'age') {
        const hasAgeWord = /(yas|yaş|sinif|sınıf|ogrenci|öğrenci)/i.test(normalized)
        const hasAgeLikeNumber = /\b([4-9]|1[0-9]|2[0-5])\b/.test(normalized)
        return keywordMatch && (hasAgeWord || hasAgeLikeNumber)
    }
    if (category === 'budget') {
        const hasBudgetNumber = /(\d[\d.,]*)\s*(tl|₺|usd|\$|bin)/i.test(value) || /\b(\d{3,5})\b/.test(normalized)
        return keywordMatch || hasBudgetNumber
    }
    if (category === 'timeline' || category === 'callback_time') {
        return (
            keywordMatch
            || /(hafta|ay|yarin|yarın|bugun|bugün|saat|tarih|pazartesi|salı|sali|carsamba|çarşamba)/i.test(normalized)
        )
    }
    if (category === 'urgency') {
        return (
            keywordMatch
            || /(acil|aciliyet|hizli|hızlı|hemen|oncelik|öncelik|kritik|asap|en kisa|en kısa)/i.test(normalized)
        )
    }
    if (category === 'service') {
        return keywordMatch || /(hizmet|service|paket|konu|kapsam|modul|modül|proje|uygulama|gelistirme|geliştirme)/i.test(normalized)
    }
    if (category === 'business_size') {
        return keywordMatch || /(kucuk|küçük|orta|buyuk|büyük|calisan|çalışan|kisiyiz|kişiyiz)/i.test(normalized)
    }

    return keywordMatch
}

function isCustomerRefusingField(value: string, field: string) {
    const normalized = normalizeForFieldMatching(value)
    if (!normalized) return false
    const refusal = hasRefusalSignal(normalized)
    if (!refusal) return false
    return isCustomerAnsweringField(value, field) || isAssistantAskingField(value, field) || messageContainsKeywords(value, getIntakeFieldKeywords(field).keywords)
}

function hasLikelyInformativeSemanticReply(value: string) {
    const normalized = normalizeForFieldMatching(value)
    if (!normalized) return false
    if (hasRefusalSignal(normalized)) return false

    if (
        isCustomerAnsweringCategory(value, 'age')
        || isCustomerAnsweringCategory(value, 'budget')
        || isCustomerAnsweringCategory(value, 'timeline')
        || isCustomerAnsweringCategory(value, 'urgency')
        || isCustomerAnsweringCategory(value, 'service')
        || isCustomerAnsweringCategory(value, 'business_size')
        || isCustomerAnsweringCategory(value, 'callback_time')
    ) {
        return true
    }

    const tokens = tokenizeForFieldMatching(value)
    if (tokens.length < 4) return false
    if (hasQuestionIntent(value) && tokens.length <= 6) return false
    if (/^(merhaba|selam|tamam|olur|tesekkur|teşekkür|evet|hayir)\b/i.test(normalized)) return false

    return true
}

function didCustomerAnswerField(input: {
    customerMessage: string
    field: string
    wasAskedInPreviousTurn: boolean
}) {
    if (isCustomerAnsweringField(input.customerMessage, input.field)) return true
    if (!input.wasAskedInPreviousTurn) return false
    return hasLikelyInformativeSemanticReply(input.customerMessage)
}

function detectAssistantQuestionCategory(message: string): QaLabIntakeFieldCategory {
    if (!hasQuestionIntent(message)) return 'generic'
    const normalized = normalizeForFieldMatching(message)
    if (!normalized) return 'generic'

    if (/(geri donus|geri dönüş|callback|hangi saatte donelim|hangi saatte dönelim|hangi saat arayal|ne zaman arayal)/i.test(normalized)) return 'callback_time'
    if (/(acil|aciliyet|urgent|urgency|oncelik|priority|ne kadar acil|ne kadar hızlı|ne kadar hizli)/i.test(normalized)) return 'urgency'
    if (/(butce|bütçe|fiyat|ucret|ücret|price|cost)/i.test(normalized)) return 'budget'
    if (/(tarih|saat|uygunluk|randevu|timeline|availability|hangi gun|hangi gün|ne zaman)/i.test(normalized)) return 'timeline'
    if (/(hizmet|service|ders|konu|kapsam|hangi hizmet|hangi ders|hangi konu)/i.test(normalized)) return 'service'
    if (/(isletme|işletme|calisan|çalışan|ekip|personel|team size|kac kisi|kaç kişi)/i.test(normalized)) return 'business_size'
    if (/(yas|yaş|sinif|sınıf|ogrenci|öğrenci|kac yas|kaç yaş)/i.test(normalized)) return 'age'

    return 'generic'
}

function normalizeFixtureLineForSemanticDiversity(value: string) {
    let normalized = value.trim()
    for (const suffix of QA_LAB_FIXTURE_EXPANSION_SUFFIXES) {
        const suffixPattern = new RegExp(`\\s*${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
        normalized = normalized.replace(suffixPattern, '').trim()
    }
    normalized = normalized.replace(GENERATOR_FALLBACK_LINE_PATTERN, '').trim()
    return normalizeForDiversity(normalized)
}

interface QaLabFixtureQualityStats {
    lineCount: number
    placeholderCount: number
    fallbackLineCount: number
    fallbackLineRatio: number
    normalizedUniqueLineCount: number
    diversityRatio: number
    semanticUniqueLineCount: number
    semanticDiversityRatio: number
    supportLineCount: number
    supportLineRatio: number
}

function buildFixtureQualityStats(fixtureLines: string[]): QaLabFixtureQualityStats {
    const lineCount = fixtureLines.length
    const placeholderCount = fixtureLines.filter((line) => (
        matchesAnyPattern(line, GENERATOR_PLACEHOLDER_PATTERNS)
    )).length
    const fallbackLineCount = fixtureLines.filter((line) => (
        GENERATOR_FALLBACK_LINE_PATTERN.test(line.trim())
    )).length
    const fallbackLineRatio = lineCount > 0 ? fallbackLineCount / lineCount : 0

    const normalizedUniqueLineCount = new Set(
        fixtureLines.map(normalizeForDiversity).filter(Boolean)
    ).size
    const diversityRatio = lineCount > 0
        ? normalizedUniqueLineCount / lineCount
        : 0

    const semanticUniqueLineCount = new Set(
        fixtureLines.map(normalizeFixtureLineForSemanticDiversity).filter(Boolean)
    ).size
    const semanticDiversityRatio = lineCount > 0
        ? semanticUniqueLineCount / lineCount
        : 0

    const supportLineCount = fixtureLines.filter((line) => (
        matchesAnyPattern(line, GENERATOR_SUPPORT_HEAVY_PATTERNS)
    )).length
    const supportLineRatio = lineCount > 0 ? supportLineCount / lineCount : 1

    return {
        lineCount,
        placeholderCount,
        fallbackLineCount,
        fallbackLineRatio,
        normalizedUniqueLineCount,
        diversityRatio,
        semanticUniqueLineCount,
        semanticDiversityRatio,
        supportLineCount,
        supportLineRatio
    }
}

function sanitizeGeneratedFixtureLines(lines: string[]) {
    const unique: string[] = []
    const seen = new Set<string>()

    for (const rawLine of lines) {
        const normalizedWhitespace = rawLine.replace(/\s+/g, ' ').trim()
        if (!normalizedWhitespace) continue
        if (GENERATOR_FALLBACK_LINE_PATTERN.test(normalizedWhitespace)) continue
        if (matchesAnyPattern(normalizedWhitespace, GENERATOR_PLACEHOLDER_PATTERNS)) continue

        const key = normalizeForDiversity(normalizedWhitespace)
        if (!key || seen.has(key)) continue
        seen.add(key)
        unique.push(normalizedWhitespace)
    }

    return unique
}

function takeUniqueNonEmpty(values: string[], limit: number) {
    const unique: string[] = []
    for (const value of values) {
        const normalized = value.trim()
        if (!normalized) continue
        if (unique.includes(normalized)) continue
        unique.push(normalized)
        if (unique.length >= limit) break
    }
    return unique
}

function extractBusinessNameFromFixtureTitle(title: string) {
    const head = title.split(/[-–|]/)[0]?.trim() ?? ''
    return head || title.trim() || 'Sentetik İşletme'
}

function buildDiverseFixtureLines(input: {
    generated: QaLabGeneratorOutput
    minimumLines: number
}) {
    const target = Math.max(
        Math.floor(input.minimumLines),
        input.generated.kb_fixture.lines.length
    )
    const businessName = extractBusinessNameFromFixtureTitle(input.generated.kb_fixture.title)
    const services = takeUniqueNonEmpty(
        [
            ...input.generated.derived_setup.service_catalog,
            ...input.generated.ground_truth.canonical_services
        ],
        10
    )
    const requiredFields = takeUniqueNonEmpty(
        input.generated.derived_setup.required_intake_fields,
        10
    )
    const criticalFacts = takeUniqueNonEmpty(
        input.generated.ground_truth.critical_policy_facts,
        10
    )
    const disallowedClaims = takeUniqueNonEmpty(
        input.generated.ground_truth.disallowed_fabricated_claims,
        10
    )

    const safeServices = services.length > 0 ? services : ['Temel hizmet']
    const safeFields = requiredFields.length > 0 ? requiredFields : ['Hizmet kapsamı']

    const lines: string[] = []
    const semanticKeys = new Set<string>()
    const pushLine = (value: string) => {
        const trimmed = value.replace(/\s+/g, ' ').trim()
        if (!trimmed) return
        if (GENERATOR_FALLBACK_LINE_PATTERN.test(trimmed)) return
        if (matchesAnyPattern(trimmed, GENERATOR_PLACEHOLDER_PATTERNS)) return
        const key = normalizeFixtureLineForSemanticDiversity(trimmed)
        if (!key || semanticKeys.has(key)) return
        semanticKeys.add(key)
        lines.push(trimmed)
    }

    for (const line of input.generated.kb_fixture.lines) {
        pushLine(line)
    }

    pushLine(`${businessName}, sentetik QA senaryoları için sektör odaklı hizmet akışı sunar.`)
    pushLine(`${businessName} talepleri, net ihtiyaç ve kapsam bilgisi olmadan kesin teklife çevrilmez.`)
    pushLine(`${businessName} yanıtlarında KB dışı vaat verilmez, belirsizlik varsa açıkça belirtilir.`)
    pushLine(`${businessName} için tekrar eden sorular yerine önce toplanan bilgiler özetlenir.`)

    for (const service of safeServices) {
        pushLine(`${service} talebinde önce müşteri hedefi, sonra kapsam sınırı netleştirilir.`)
        pushLine(`${service} için fiyatı etkileyen ana değişkenler iş yükü, süre ve risk seviyesidir.`)
        pushLine(`${service} akışında düşük bütçe durumunda minimum uygulanabilir kapsam önerilir.`)
        pushLine(`${service} görüşmesinde sonraki adım açık aksiyon ve zaman penceresi ile kapanır.`)
    }

    for (const field of safeFields) {
        pushLine(`Zorunlu bilgi alanı: ${field}.`)
        pushLine(`${field} bilgisi yoksa asistan tek netleştirme sorusu ile eksiği kapatır.`)
        pushLine(`${field} alındıktan sonra aynı alan art arda tekrar sorulmaz.`)
    }

    for (const fact of criticalFacts) {
        pushLine(`Politika notu: ${fact}`)
        pushLine(`Operasyon kuralı: ${fact}`)
    }

    for (const claim of disallowedClaims) {
        pushLine(`Yasak uydurma iddia: ${claim}`)
    }

    for (let index = 0; lines.length < target * 2 && index < target * 12; index += 1) {
        const service = safeServices[index % safeServices.length] ?? safeServices[0]
        const field = safeFields[index % safeFields.length] ?? safeFields[0]
        const processStep = QA_LAB_DIVERSITY_PROCESS_STEPS[
            index % QA_LAB_DIVERSITY_PROCESS_STEPS.length
        ] ?? QA_LAB_DIVERSITY_PROCESS_STEPS[0]
        const decisionSignal = QA_LAB_DIVERSITY_DECISION_SIGNALS[
            Math.floor(index / QA_LAB_DIVERSITY_PROCESS_STEPS.length) % QA_LAB_DIVERSITY_DECISION_SIGNALS.length
        ] ?? QA_LAB_DIVERSITY_DECISION_SIGNALS[0]
        const actionPhrase = QA_LAB_DIVERSITY_ACTION_PHRASES[
            Math.floor(index / (
                QA_LAB_DIVERSITY_PROCESS_STEPS.length * QA_LAB_DIVERSITY_DECISION_SIGNALS.length
            )) % QA_LAB_DIVERSITY_ACTION_PHRASES.length
        ] ?? QA_LAB_DIVERSITY_ACTION_PHRASES[0]

        pushLine(`${service} sürecinde ${processStep}; ${field} doğrulanınca ${actionPhrase}.`)
        pushLine(`${service} görüşmesinde ${decisionSignal} sinyali, ${field} bilgisiyle birlikte değerlendirilir.`)
    }

    while (lines.length < target) {
        const index = lines.length + 1
        const service = safeServices[index % safeServices.length] ?? safeServices[0]
        const field = safeFields[index % safeFields.length] ?? safeFields[0]
        pushLine(`${businessName} kalite notu ${index}: ${service} için ${field} ve bütçe-zaman dengesi birlikte ele alınır.`)
        if (lines.length >= target) break
        pushLine(`${businessName} süreç notu ${index}: eksik bilgi tamamlanmadan kapsam dışı vaat verilmez.`)
    }

    return lines.slice(0, target)
}

export function stabilizeGeneratorOutputForQuality(
    generated: QaLabGeneratorOutput,
    run: QaLabRun
) {
    const sanitizedFixtureLines = sanitizeGeneratedFixtureLines(generated.kb_fixture.lines)
    const baseFixtureLines = sanitizedFixtureLines.length >= run.fixture_min_lines
        ? sanitizedFixtureLines
        : expandFixtureLinesToMinimum(sanitizedFixtureLines, run.fixture_min_lines)

    const sanitizedGenerated: QaLabGeneratorOutput = {
        ...generated,
        kb_fixture: {
            ...generated.kb_fixture,
            lines: baseFixtureLines
        }
    }

    const stats = buildFixtureQualityStats(sanitizedGenerated.kb_fixture.lines)
    const needsStabilization = (
        stats.fallbackLineRatio > 0.08
        || stats.semanticDiversityRatio < 0.3
    )

    if (!needsStabilization) {
        return sanitizedGenerated
    }

    const stabilizedLines = buildDiverseFixtureLines({
        generated: sanitizedGenerated,
        minimumLines: run.fixture_min_lines
    })

    return {
        ...sanitizedGenerated,
        kb_fixture: {
            ...sanitizedGenerated.kb_fixture,
            lines: stabilizedLines
        }
    } satisfies QaLabGeneratorOutput
}

function isContactPreferenceField(value: string) {
    const normalized = value.trim()
    if (!normalized) return false
    return QA_LAB_CONTACT_PREFERENCE_FIELD_PATTERNS.some((pattern) => pattern.test(normalized))
}

function isTimelineLikeField(value: string) {
    const normalized = value.trim()
    if (!normalized) return false
    return QA_LAB_TIMELINE_FIELD_PATTERNS.some((pattern) => pattern.test(normalized))
}

function isUrgencyLikeField(value: string) {
    const normalized = value.trim()
    if (!normalized) return false
    return QA_LAB_URGENCY_FIELD_PATTERNS.some((pattern) => pattern.test(normalized))
}

function isCallbackTimeLikeField(value: string) {
    const normalized = value.trim()
    if (!normalized) return false
    return /(geri donus|geri dönüş|callback|geri arama|geri aranma|geri donus zamani|geri dönüş zamanı)/i.test(normalized)
}

export function normalizeRequiredIntakeFieldsForQaLab(fields: string[]) {
    const cleaned = fields
        .map((field) => field.trim())
        .filter(Boolean)

    const normalized: string[] = []
    let hadContactPreference = false
    let hasTimelineField = false
    let callbackFieldSeen = false

    for (const field of cleaned) {
        if (isContactPreferenceField(field)) {
            hadContactPreference = true
            continue
        }
        const normalizedField = isUrgencyLikeField(field)
            ? QA_LAB_URGENCY_REPLACEMENT_FIELD
            : field
        if (isTimelineLikeField(normalizedField)) {
            hasTimelineField = true
        }
        if (isCallbackTimeLikeField(normalizedField)) {
            callbackFieldSeen = true
            continue
        }
        if (!normalized.includes(normalizedField)) {
            normalized.push(normalizedField)
        }
    }

    if ((hadContactPreference || callbackFieldSeen) && !hasTimelineField) {
        normalized.push(QA_LAB_CONTACT_PREFERENCE_REPLACEMENT_FIELD)
    }

    return normalized
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

    const fixtureStats = buildFixtureQualityStats(fixtureLines)

    if (fixtureStats.placeholderCount > 0) {
        return 'Generator fixture contains placeholder artifacts ([varyant], tekrar notu, ??).'
    }

    if (fixtureStats.fallbackLineRatio > 0.08) {
        return `Generator fixture relies on fallback lines too heavily (${fixtureStats.fallbackLineCount}/${fixtureLines.length}).`
    }

    if (fixtureStats.diversityRatio < 0.6) {
        return `Generator fixture line diversity is too low (${fixtureStats.normalizedUniqueLineCount}/${fixtureLines.length}).`
    }

    if (fixtureStats.semanticDiversityRatio < 0.3) {
        return `Generator fixture semantic diversity is too low (${fixtureStats.semanticUniqueLineCount}/${fixtureLines.length}).`
    }

    if (fixtureStats.supportLineRatio > 0.35) {
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

    if (
        previousError.toLowerCase().includes('fallback lines')
        || previousError.toLowerCase().includes('semantic diversity')
    ) {
        retryHints.push(
            '- Avoid fixture fallback lines; generate concrete business facts instead.',
            '- Do not repeat the same base sentence with minor suffix changes.',
            '- Add genuinely different service, pricing, policy, and qualification details.'
        )
    }

    return retryHints.join('\n')
}

export function expandFixtureLinesToMinimum(lines: string[], minimumLines: number) {
    const target = Math.max(0, Math.floor(minimumLines))
    const normalizedBase = sanitizeGeneratedFixtureLines(lines)

    const seeds = normalizedBase.length > 0
        ? normalizedBase
        : [
            'Hizmet talebinde müşteri ihtiyacı netleştirilir.',
            'Uygunluk için tarih ve saat tercihi sorulur.',
            'Fiyat aralığı hizmet kapsamına göre paylaşılır.',
            'İlk görüşmede gerekli temel bilgiler toplanır.'
        ]

    const expanded = [...normalizedBase]
    let cursor = 0

    while (expanded.length < target && cursor < target * 20) {
        const seed = seeds[cursor % seeds.length] ?? `Fixture fallback line ${cursor + 1}`
        const suffix = QA_LAB_FIXTURE_EXPANSION_SUFFIXES[
            Math.floor(cursor / seeds.length) % QA_LAB_FIXTURE_EXPANSION_SUFFIXES.length
        ]
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
        const sequence = expanded.length + 1
        const seed = seeds[(sequence - 1) % seeds.length] ?? 'Hizmet kapsamı görüşmede netleştirilir.'
        const suffix = QA_LAB_FIXTURE_EXPANSION_SUFFIXES[
            (sequence - 1) % QA_LAB_FIXTURE_EXPANSION_SUFFIXES.length
        ] ?? 'Bilgi doğrulaması sonrası süreç ilerletilir.'
        expanded.push(`${seed.replace(/[.!?]+$/g, '')}. ${suffix}`.replace(/\s+/g, ' ').trim())
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
    cached_prompt_tokens?: number
    prompt_tokens_details?: {
        cached_tokens?: number
    } | null
}) {
    if (!usage) return
    const promptTokens = clampInt(usage.prompt_tokens ?? 0, 0, 1_000_000_000, 0)
    const completionTokens = clampInt(usage.completion_tokens ?? 0, 0, 1_000_000_000, 0)
    const cachedPromptTokensRaw = (
        usage.cached_prompt_tokens
        ?? usage.prompt_tokens_details?.cached_tokens
        ?? 0
    )
    const cachedPromptTokens = Math.min(
        promptTokens,
        clampInt(cachedPromptTokensRaw, 0, 1_000_000_000, 0)
    )
    const total = clampInt(
        usage.total_tokens ?? (promptTokens + completionTokens),
        0,
        1_000_000_000,
        0
    )
    const trackedTokens = promptTokens + completionTokens
    if (trackedTokens > 0) {
        tracker.consumedInput += promptTokens
        tracker.consumedInputCached += cachedPromptTokens
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

export function calculateJudgeTargetOutputTokens(executedCaseCount: number) {
    const normalizedCaseCount = clampInt(executedCaseCount, 0, 500, 0)
    const target = JUDGE_BASE_OUTPUT_TOKENS + (normalizedCaseCount * JUDGE_OUTPUT_TOKENS_PER_SCENARIO)
    return clampInt(target, JUDGE_MIN_OUTPUT_TOKENS, JUDGE_MAX_OUTPUT_TOKENS, JUDGE_MIN_OUTPUT_TOKENS)
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

function buildScenarioContinuationCustomerMessage(
    scenario: QaLabGeneratorScenario,
    continuationIndex: number
) {
    const cooperativeContinuations = [
        'Buna göre ilk adım olarak hangi bilgiyi netleştirelim?',
        'Bu kapsam için en uygun başlangıç paketi ne olur?',
        'Başlamak için hangi bilgileri tamamlamamız gerekiyor?',
        'Bu bilgilerle net teklif süreci nasıl ilerler?'
    ]
    const partialContinuations = [
        'Önceliği belirlemek için sizce hangi bilgi daha kritik?',
        'Net teklife yaklaşmak için benden hangi bilgiyi almalısınız?',
        'Bu durumda ortalama süreç nasıl ilerliyor?',
        'Karar vermeden önce hangi adımı görmem faydalı olur?'
    ]
    const resistantContinuations = [
        'Detay vermeden önce genel yaklaşımınızı özetleyebilir misiniz?',
        'Peki minimum başlangıç adımı ne olur?',
        'Şimdilik sadece genel bir yol haritası duymak istiyorum.',
        'Kişisel detay paylaşmadan hangi aşamaya kadar ilerleyebiliriz?'
    ]

    const pool = scenario.information_sharing === 'cooperative'
        ? cooperativeContinuations
        : (
            scenario.information_sharing === 'resistant'
                ? resistantContinuations
                : partialContinuations
        )
    return pool[continuationIndex % pool.length] ?? pool[0] ?? 'Bu konuda sonraki adım ne olur?'
}

function ensureScenarioTurnDepthDistribution(
    scenarios: QaLabGeneratorScenario[],
    run: QaLabRun
) {
    const maxTurns = getScenarioTurnLimit(run)
    if (maxTurns <= QA_LAB_MIN_SCENARIO_TURNS || scenarios.length === 0) {
        return scenarios
    }

    const targetTurnCount = Math.min(QA_LAB_MIN_DEEP_SCENARIO_TURNS, maxTurns)
    const targetDeepScenarioCount = Math.max(1, Math.ceil(scenarios.length * 0.45))

    return scenarios.map((scenario, index) => {
        if (index >= targetDeepScenarioCount || scenario.turns.length >= targetTurnCount) {
            return scenario
        }

        const turns = [...scenario.turns]
        let continuationIndex = 0
        while (turns.length < targetTurnCount && turns.length < maxTurns) {
            turns.push({
                customer: buildScenarioContinuationCustomerMessage(scenario, continuationIndex)
            })
            continuationIndex += 1
        }

        return {
            ...scenario,
            turns
        }
    })
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
        const fallbackScenarios = Array.from({ length: run.scenario_count })
            .map((_, index) => createDefaultScenarioByIndex(index, run))
        return ensureScenarioTurnDepthDistribution(fallbackScenarios, run)
    }

    return ensureScenarioTurnDepthDistribution(normalized.slice(0, run.scenario_count), run)
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
    const sanitizedFixtureLines = sanitizeGeneratedFixtureLines(rawFixtureLines)
    const fixtureLines = sanitizedFixtureLines.length >= run.fixture_min_lines
        ? sanitizedFixtureLines
        : expandFixtureLinesToMinimum(sanitizedFixtureLines, run.fixture_min_lines)

    const groundTruthRaw = raw.ground_truth
    const groundTruthRecord = (
        groundTruthRaw && typeof groundTruthRaw === 'object' && !Array.isArray(groundTruthRaw)
            ? groundTruthRaw as Record<string, unknown>
            : {}
    )

    const groundTruth = {
        canonical_services: normalizeStringArray(groundTruthRecord.canonical_services, 120),
        required_intake_fields: normalizeRequiredIntakeFieldsForQaLab(
            normalizeStringArray(groundTruthRecord.required_intake_fields, 120)
        ),
        critical_policy_facts: normalizeStringArray(groundTruthRecord.critical_policy_facts, 200),
        disallowed_fabricated_claims: normalizeStringArray(groundTruthRecord.disallowed_fabricated_claims, 200)
    }

    const derivedSetup = normalizeDerivedSetup(raw.derived_setup ?? raw.derived_context, groundTruth)
    const normalizedDerivedRequiredFields = normalizeRequiredIntakeFieldsForQaLab(
        derivedSetup.required_intake_fields
    )
    derivedSetup.required_intake_fields = normalizedDerivedRequiredFields.length > 0
        ? normalizedDerivedRequiredFields
        : groundTruth.required_intake_fields

    return {
        kb_fixture: {
            title: trimText(kbFixtureRecord.title, 'Generated QA Fixture'),
            lines: fixtureLines
        },
        ground_truth: groundTruth,
        derived_setup: derivedSetup,
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

function normalizeJudgeScenarioSuccess(
    value: unknown,
    fallback: 'pass' | 'warn' | 'fail' = 'warn'
): 'pass' | 'warn' | 'fail' {
    if (value === 'pass' || value === 'warn' || value === 'fail') return value
    return fallback
}

function calibrateJudgeScenarioSuccessByCaseContext(input: {
    status: 'pass' | 'warn' | 'fail'
    caseItem: QaLabExecutedCase
    coverage?: Pick<QaLabIntakeCoverageCaseResult, 'handoffReadiness' | 'askedCoverage' | 'fulfillmentCoverage'>
    issues: string[]
}) {
    if (input.status !== 'fail') return input.status

    const caseIsColdResistant = (
        input.caseItem.lead_temperature === 'cold'
        && input.caseItem.information_sharing === 'resistant'
    )
    if (!caseIsColdResistant) return input.status

    const hasHighRiskIssue = input.issues.some((issue) => {
        const text = normalizeForFieldMatching(issue)
        return /(hallucin|uydur|fabricat|contradict|yanlis|yanlış|unsafe|risk|policy|kb disi|kb dışı)/i.test(text)
    })
    if (hasHighRiskIssue) return input.status

    const handoffReadiness = input.coverage?.handoffReadiness ?? 'warn'
    const askedCoverage = typeof input.coverage?.askedCoverage === 'number'
        ? input.coverage.askedCoverage
        : 0
    const fulfillmentCoverage = typeof input.coverage?.fulfillmentCoverage === 'number'
        ? input.coverage.fulfillmentCoverage
        : 0

    if (handoffReadiness === 'fail') return input.status
    if (askedCoverage < 0.5) return input.status
    if (fulfillmentCoverage < 0.7) return input.status

    return 'warn'
}

function getScenarioScoreBaseline(status: 'pass' | 'warn' | 'fail') {
    if (status === 'pass') return 82
    if (status === 'fail') return 42
    return 62
}

function buildFallbackJudgeScenarioAssessment(input: {
    caseItem: QaLabExecutedCase
    coverage?: Pick<QaLabIntakeCoverageCaseResult, 'handoffReadiness' | 'askedCoverage' | 'fulfillmentCoverage'>
}): QaLabJudgeScenarioAssessment {
    const status = normalizeJudgeScenarioSuccess(input.coverage?.handoffReadiness, 'warn')
    const baseline = getScenarioScoreBaseline(status)
    const askedCoverageScore = clampScore(
        typeof input.coverage?.askedCoverage === 'number'
            ? Math.round(input.coverage.askedCoverage * 100)
            : baseline
    )
    const fulfillmentCoverageScore = clampScore(
        typeof input.coverage?.fulfillmentCoverage === 'number'
            ? Math.round(input.coverage.fulfillmentCoverage * 100)
            : baseline
    )
    const groundednessBaseline = input.caseItem.executed_turns.length > 0 ? 70 : 40

    return {
        case_id: input.caseItem.case_id,
        assistant_success: status,
        answer_quality_score: clampScore(Math.round((baseline + fulfillmentCoverageScore) / 2)),
        logic_score: clampScore(Math.round((baseline + askedCoverageScore) / 2)),
        groundedness_score: clampScore(groundednessBaseline),
        summary: 'Fallback scenario assessment generated because judge output omitted this case.',
        strengths: status === 'pass' ? ['Required intake progression is mostly complete.'] : [],
        issues: [
            'Judge response did not include explicit scenario-level evaluation for this case.'
        ],
        confidence: 0.35,
        source: 'fallback'
    }
}

export function normalizeJudgeScenarioAssessmentsForExecutedCases(input: {
    raw: unknown
    executedCases: QaLabExecutedCase[]
    intakeCoverageByCase: Array<Pick<QaLabIntakeCoverageCaseResult, 'caseId' | 'handoffReadiness' | 'askedCoverage' | 'fulfillmentCoverage'>>
}): QaLabJudgeScenarioAssessment[] {
    if (input.executedCases.length === 0) return []

    const coverageByCaseId = new Map(
        input.intakeCoverageByCase.map((item) => [item.caseId, item] as const)
    )
    const caseById = new Map(input.executedCases.map((item) => [item.case_id, item] as const))
    const rawEntries = Array.isArray(input.raw) ? input.raw : []
    const normalizedByCaseId = new Map<string, QaLabJudgeScenarioAssessment>()

    for (const rawEntry of rawEntries) {
        if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) continue
        const entry = rawEntry as Record<string, unknown>
        const caseId = trimText(entry.case_id ?? entry.scenario_id, '')
        if (!caseId || !caseById.has(caseId) || normalizedByCaseId.has(caseId)) continue

        const coverage = coverageByCaseId.get(caseId)
        const fallbackStatus = normalizeJudgeScenarioSuccess(coverage?.handoffReadiness, 'warn')
        const caseItem = caseById.get(caseId)
        if (!caseItem) continue
        const strengths = normalizeStringArray(entry.strengths, 8)
        const issues = normalizeStringArray(entry.issues, 8)
        const rawStatus = normalizeJudgeScenarioSuccess(entry.assistant_success, fallbackStatus)
        const status = calibrateJudgeScenarioSuccessByCaseContext({
            status: rawStatus,
            caseItem,
            coverage: coverage
                ? {
                    handoffReadiness: coverage.handoffReadiness,
                    askedCoverage: coverage.askedCoverage,
                    fulfillmentCoverage: coverage.fulfillmentCoverage
                }
                : undefined,
            issues
        })
        const baseline = getScenarioScoreBaseline(status)
        const summary = trimText(
            entry.summary,
            'Judge provided scenario-level evaluation without explicit summary.'
        )

        normalizedByCaseId.set(caseId, {
            case_id: caseId,
            assistant_success: status,
            answer_quality_score: clampScore(entry.answer_quality_score ?? entry.response_quality_score ?? baseline),
            logic_score: clampScore(entry.logic_score ?? entry.reasoning_score ?? baseline),
            groundedness_score: clampScore(entry.groundedness_score ?? entry.grounding_score ?? baseline),
            summary,
            strengths,
            issues,
            confidence: clampConfidence(entry.confidence),
            source: 'judge'
        })
    }

    return input.executedCases.map((caseItem) => {
        const existing = normalizedByCaseId.get(caseItem.case_id)
        if (existing) return existing

        const coverage = coverageByCaseId.get(caseItem.case_id)
        return buildFallbackJudgeScenarioAssessment({
            caseItem,
            coverage: coverage
                ? {
                    handoffReadiness: coverage.handoffReadiness,
                    askedCoverage: coverage.askedCoverage,
                    fulfillmentCoverage: coverage.fulfillmentCoverage
                }
                : undefined
        })
    })
}

function normalizeJudgeResult(raw: Record<string, unknown>, options: {
    executedCases: QaLabExecutedCase[]
    intakeCoverageByCase: Array<Pick<QaLabIntakeCoverageCaseResult, 'caseId' | 'handoffReadiness' | 'askedCoverage' | 'fulfillmentCoverage'>>
}): QaLabJudgeResult {
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
        top_actions: normalizeTopActions(raw.top_actions),
        scenario_assessments: normalizeJudgeScenarioAssessmentsForExecutedCases({
            raw: raw.scenario_assessments,
            executedCases: options.executedCases,
            intakeCoverageByCase: options.intakeCoverageByCase
        })
    }
}

function parseJudgeFindingCitations(evidence: string): QaLabJudgeFindingCitation[] {
    if (!evidence.trim()) return []

    const pattern = /\[scenario_id=([^,\]]+)\s*,\s*turn=(\d+)\]/gi
    const citations: QaLabJudgeFindingCitation[] = []

    for (const match of evidence.matchAll(pattern)) {
        const scenarioId = match[1]?.trim() ?? ''
        const turnRaw = Number(match[2] ?? '')
        if (!scenarioId || !Number.isFinite(turnRaw)) continue
        citations.push({
            scenarioId,
            turnIndex: Math.max(1, Math.round(turnRaw))
        })
    }

    return citations
}

function findingMentionsPattern(input: {
    text: string
    patterns: RegExp[]
}) {
    return input.patterns.some((pattern) => pattern.test(input.text))
}

export function filterJudgeFindingsByCitationConsistency(input: {
    findings: QaLabJudgeFinding[]
    executedCases: QaLabExecutedCase[]
}) {
    if (input.findings.length === 0) return input.findings

    const caseById = new Map(input.executedCases.map((caseItem) => [caseItem.case_id, caseItem]))
    const filtered: QaLabJudgeFinding[] = []

    const supportsRepeatedQuestionClaim = (params: {
        finding: QaLabJudgeFinding
        caseItem: QaLabExecutedCase
        citation: QaLabJudgeFindingCitation
    }) => {
        const citedTurn = params.caseItem.executed_turns[params.citation.turnIndex - 1]
        if (!citedTurn) return false

        const assistantMessage = citedTurn.assistant_response ?? ''
        if (!hasQuestionIntent(assistantMessage)) return false

        const findingText = `${params.finding.violated_rule} ${params.finding.rationale}`
        const findingCategory = detectIntakeFieldCategory(findingText)
        const assistantCategory = detectAssistantQuestionCategory(assistantMessage)
        const targetCategory = assistantCategory !== 'generic'
            ? assistantCategory
            : (findingCategory !== 'generic' ? findingCategory : null)

        if (!targetCategory) return true

        const turnsUpToCitation = params.caseItem.executed_turns.slice(0, params.citation.turnIndex)
        return turnsUpToCitation.some((turn) => (
            isCustomerAnsweringCategory(turn.customer_message, targetCategory)
        ))
    }

    for (const finding of input.findings) {
        const citations = parseJudgeFindingCitations(finding.evidence)
        if (citations.length === 0) continue

        const resolved = citations
            .map((citation) => ({
                citation,
                caseItem: caseById.get(citation.scenarioId)
            }))
            .filter((item): item is { citation: QaLabJudgeFindingCitation, caseItem: QaLabExecutedCase } => {
                if (!item.caseItem) return false
                return item.citation.turnIndex <= item.caseItem.executed_turns.length
            })

        if (resolved.length === 0) continue

        const contextText = normalizeForFieldMatching(`${finding.violated_rule} ${finding.rationale}`)

        const hasHotMismatch = findingMentionsPattern({
            text: contextText,
            patterns: [/\bhot\b/i, /\bsicak\b/i, /\bsıcak\b/i]
        }) && !resolved.some((item) => item.caseItem.lead_temperature === 'hot')

        const hasWarmMismatch = findingMentionsPattern({
            text: contextText,
            patterns: [/\bwarm\b/i, /\bilik\b/i, /\bılı[kğ]\b/i]
        }) && !resolved.some((item) => item.caseItem.lead_temperature === 'warm')

        const hasColdMismatch = findingMentionsPattern({
            text: contextText,
            patterns: [/\bcold\b/i, /\bsoguk\b/i, /\bsoğuk\b/i]
        }) && !resolved.some((item) => item.caseItem.lead_temperature === 'cold')

        const hasResistantMismatch = findingMentionsPattern({
            text: contextText,
            patterns: [/\bresistant\b/i, /\bdiren[çc]/i]
        }) && !resolved.some((item) => item.caseItem.information_sharing === 'resistant')

        const hasCooperativeMismatch = findingMentionsPattern({
            text: contextText,
            patterns: [/\bcooperative\b/i, /\bis birlik/i, /\biş birli[kğ]/i]
        }) && !resolved.some((item) => item.caseItem.information_sharing === 'cooperative')

        const hasPartialMismatch = findingMentionsPattern({
            text: contextText,
            patterns: [/\bpartial\b/i, /\bkismi\b/i, /\bkısmi\b/i]
        }) && !resolved.some((item) => item.caseItem.information_sharing === 'partial')

        if (
            hasHotMismatch
            || hasWarmMismatch
            || hasColdMismatch
            || hasResistantMismatch
            || hasCooperativeMismatch
            || hasPartialMismatch
        ) {
            continue
        }

        const contextTextWithEvidence = normalizeForFieldMatching(
            `${finding.violated_rule} ${finding.rationale} ${finding.evidence}`
        )
        const looksLikeReaskFinding = REASK_FINDING_PATTERNS.some((pattern) => (
            pattern.test(contextTextWithEvidence)
        ))
        if (looksLikeReaskFinding) {
            const hasValidReaskCitation = resolved.some((item) => (
                supportsRepeatedQuestionClaim({
                    finding,
                    caseItem: item.caseItem,
                    citation: item.citation
                })
            ))
            if (!hasValidReaskCitation) {
                continue
            }
        }

        filtered.push(finding)
        if (filtered.length >= MAX_FINDINGS) break
    }

    return filtered
}

export function shouldRetryJudgeForScoreAnomaly(input: {
    judgeResult: QaLabJudgeResult
    intakeCoverageTotals: {
        caseCount: number
        readyCaseCount: number
        averageFulfillmentCoverage: number
    }
}) {
    const hasCriticalFinding = input.judgeResult.findings.some((finding) => finding.severity === 'critical')
    if (hasCriticalFinding) return false

    const weightedScore = clampScore(input.judgeResult.score_breakdown.weighted_total)
    if (weightedScore > JUDGE_SCORE_ANOMALY_THRESHOLD) return false

    const caseCount = Math.max(0, clampInt(input.intakeCoverageTotals.caseCount, 0, 10_000, 0))
    if (caseCount < JUDGE_SCORE_ANOMALY_MIN_CASE_COUNT) return false

    const readyCaseCount = Math.max(0, clampInt(input.intakeCoverageTotals.readyCaseCount, 0, caseCount, 0))
    const readyRatio = caseCount > 0 ? readyCaseCount / caseCount : 0
    if (readyRatio < JUDGE_SCORE_ANOMALY_MIN_READY_RATIO) return false

    const averageFulfillmentCoverage = Number.isFinite(input.intakeCoverageTotals.averageFulfillmentCoverage)
        ? input.intakeCoverageTotals.averageFulfillmentCoverage
        : 0
    if (averageFulfillmentCoverage < JUDGE_SCORE_ANOMALY_MIN_FULFILLMENT) return false

    return true
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
            intake_field_policy: {
                avoid_contact_preference_field: true,
                preferred_coordination_field: 'geri_donus_zaman_araligi'
            },
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
- Include missing-information collection needs (budget, timeline, service details, urgency/business profile).
- Do NOT use communication/contact preference as a mandatory required intake field.
- If coordination is needed, prefer collecting suitable callback time window instead.
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

function getLatestAssistantMessage(history: ConversationTurn[]) {
    for (let index = history.length - 1; index >= 0; index -= 1) {
        const turn = history[index]
        if (turn?.role !== 'assistant') continue
        const content = turn.content?.trim()
        if (content) return content
    }
    return ''
}

function buildQaLabFieldStateByConversation(input: {
    requiredFields: string[]
    turns: QaLabIntakeCoverageTurnInput[]
}) {
    const states = input.requiredFields.map((field) => ({
        field,
        askedCount: 0,
        respondedCount: 0,
        ignoredCount: 0,
        refused: false,
        awaitingResponseFromAssistantAsk: false
    }))

    for (const turn of input.turns) {
        const customerMessage = turn.customer_message ?? ''
        const assistantMessage = turn.assistant_response ?? ''

        for (const state of states) {
            const answered = didCustomerAnswerField({
                customerMessage,
                field: state.field,
                wasAskedInPreviousTurn: state.awaitingResponseFromAssistantAsk
            })
            if (answered) {
                state.respondedCount += 1
            }

            if (isCustomerRefusingField(customerMessage, state.field)) {
                state.refused = true
            }

            if (state.awaitingResponseFromAssistantAsk) {
                if (!answered && customerMessage.trim()) {
                    state.ignoredCount += 1
                }
                state.awaitingResponseFromAssistantAsk = false
            }
        }

        for (const state of states) {
            if (isAssistantAskingField(assistantMessage, state.field)) {
                state.askedCount += 1
                state.awaitingResponseFromAssistantAsk = true
            }
        }
    }

    return states
}

function buildQaLabIntakeProgress(input: {
    generated: QaLabGeneratorOutput
    history: ConversationTurn[]
    currentUserMessage: string
}) {
    const requiredFields = (
        input.generated.derived_setup.required_intake_fields.length > 0
            ? input.generated.derived_setup.required_intake_fields
            : input.generated.ground_truth.required_intake_fields
    )

    const turns: QaLabIntakeCoverageTurnInput[] = []
    let pendingCustomerMessage: string | null = null

    for (const turn of input.history) {
        if (turn.role === 'user') {
            pendingCustomerMessage = turn.content
            continue
        }

        if (turn.role === 'assistant') {
            turns.push({
                customer_message: pendingCustomerMessage ?? '',
                assistant_response: turn.content
            })
            pendingCustomerMessage = null
        }
    }

    turns.push({
        customer_message: input.currentUserMessage,
        assistant_response: ''
    })

    const coverage = analyzeQaLabIntakeCoverage({
        requiredIntakeFields: requiredFields,
        cases: [
            {
                case_id: 'live_turn_state',
                title: 'Live state',
                lead_temperature: 'warm',
                information_sharing: 'partial',
                executed_turns: turns
            }
        ]
    })

    const caseCoverage = coverage.byCase[0]
    const fieldStates = buildQaLabFieldStateByConversation({
        requiredFields,
        turns
    })
    const lastAssistantMessage = getLatestAssistantMessage(input.history)

    const deferredFields = fieldStates
        .filter((state) => {
            const missing = state.respondedCount === 0
            if (!missing) return false
            if (state.refused) return true
            if (state.ignoredCount >= 1) return true

            const askedLastTurn = (
                Boolean(lastAssistantMessage)
                && isAssistantAskingField(lastAssistantMessage, state.field)
                && !didCustomerAnswerField({
                    customerMessage: input.currentUserMessage,
                    field: state.field,
                    wasAskedInPreviousTurn: true
                })
            )

            return askedLastTurn
        })
        .map((state) => state.field)

    const activeMissingFields = (caseCoverage?.missingFields ?? requiredFields)
        .filter((field) => !deferredFields.includes(field))

    return {
        requiredFields,
        missingFields: caseCoverage?.missingFields ?? requiredFields,
        activeMissingFields,
        deferredFields,
        fulfilledCount: caseCoverage?.fulfilledFieldsCount ?? 0,
        requiredTotal: caseCoverage?.requiredFieldsTotal ?? requiredFields.length
    }
}

function normalizeServiceCatalogForSimulation(serviceCatalog?: string[]) {
    if (!Array.isArray(serviceCatalog)) return []
    return Array.from(new Set(
        serviceCatalog
            .map((value) => value.trim())
            .filter(Boolean)
    )).slice(0, 8)
}

function extractFirstBudgetAmount(value: string) {
    const directMatch = value.match(/(\d[\d.,]*)\s*(tl|₺|usd|\$|eur|bin)/i)
    if (directMatch) {
        const rawAmount = directMatch[1] ?? ''
        const unit = (directMatch[2] ?? '').toLowerCase()
        const normalizedAmount = rawAmount
            .replace(/\./g, '')
            .replace(/,/g, '.')
        const parsed = Number(normalizedAmount)
        if (Number.isFinite(parsed) && parsed > 0) {
            return Math.round(unit === 'bin' ? parsed * 1000 : parsed)
        }
    }

    const normalized = normalizeForFieldMatching(value)
    const numericMatch = normalized.match(/\b(\d{3,6})\b/)
    if (!numericMatch) return null
    const parsed = Number(numericMatch[1])
    if (!Number.isFinite(parsed) || parsed <= 0) return null
    return Math.round(parsed)
}

function extractLatestKnownBudgetAmount(history: ConversationTurn[]) {
    for (let index = history.length - 1; index >= 0; index -= 1) {
        const turn = history[index]
        if (turn?.role !== 'user') continue
        const amount = extractFirstBudgetAmount(turn.content ?? '')
        if (amount) return amount
    }
    return null
}

function removeBudgetClausesFromMessage(message: string) {
    const stripped = message
        .replace(/[^.!?]*(?:butce|bütçe|fiyat|ucret|ücret|tl|₺|usd|\$|eur)[^.!?]*[.!?]?\s*/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    return stripped
}

function harmonizeCustomerMessageWithKnownFacts(input: {
    message: string
    history: ConversationTurn[]
    askedCategory: QaLabIntakeFieldCategory
}) {
    const original = input.message.trim()
    if (!original) return original
    const knownBudget = extractLatestKnownBudgetAmount(input.history)
    const currentBudget = extractFirstBudgetAmount(original)
    if (!knownBudget || !currentBudget) return original
    if (input.askedCategory === 'budget') return original

    const difference = Math.abs(currentBudget - knownBudget)
    const tolerance = Math.max(1500, Math.round(knownBudget * 0.35))
    if (difference <= tolerance) return original

    const stripped = removeBudgetClausesFromMessage(original)
    if (stripped) return stripped
    return `Bütçe bilgisini daha önce paylaştığımız aralıkta tutalım.`
}

function buildServiceSupplementFromCatalog(
    serviceCatalog: string[],
    informationSharing: QaLabScenarioInformationSharing
) {
    if (serviceCatalog.length === 0) {
        return informationSharing === 'cooperative'
            ? 'Hizmet kapsamını netleştirip uygun çözümü belirlemek istiyoruz.'
            : 'Hizmet kapsamını temel seviyede tutup detayları sonra netleştirebiliriz.'
    }

    const serviceText = serviceCatalog.slice(0, 2).join(' ve ')
    return informationSharing === 'cooperative'
        ? `${serviceText} odaklı bir çözüm arıyoruz.`
        : `Önceliğimiz ${serviceText}; kapsam detaylarını adım adım netleştirebiliriz.`
}

export function adaptQaLabCustomerTurnToAssistantContext(input: {
    message: string
    previousAssistantMessage: string
    requiredFields: string[]
    informationSharing: QaLabScenarioInformationSharing
    serviceCatalog?: string[]
    history?: ConversationTurn[]
}) {
    const originalMessage = input.message.trim()
    const previousAssistant = input.previousAssistantMessage.trim()
    if (!originalMessage || !previousAssistant) return originalMessage

    const askedCategoryFromAssistant = detectAssistantQuestionCategory(previousAssistant)
    const historyAwareMessage = harmonizeCustomerMessageWithKnownFacts({
        message: originalMessage,
        history: input.history ?? [],
        askedCategory: askedCategoryFromAssistant
    })
    if (!historyAwareMessage) return originalMessage

    const askedFields = input.requiredFields.filter((field) => (
        isAssistantAskingField(previousAssistant, field)
    ))

    const unresolvedFields = askedFields.filter((field) => (
        !didCustomerAnswerField({
            customerMessage: historyAwareMessage,
            field,
            wasAskedInPreviousTurn: true
        })
    ))
    const targetField = unresolvedFields[0]
    const targetCategoryFromField = targetField
        ? detectIntakeFieldCategory(targetField)
        : 'generic'

    let targetCategory = targetCategoryFromField
    if (targetCategory === 'generic') {
        const questionCategory = askedCategoryFromAssistant
        if (
            questionCategory !== 'generic'
            && !isCustomerAnsweringCategory(historyAwareMessage, questionCategory)
        ) {
            targetCategory = questionCategory
        }
    }

    if (targetCategory === 'generic') return historyAwareMessage
    if (hasRefusalSignal(historyAwareMessage)) return historyAwareMessage

    if (input.informationSharing === 'resistant') {
        return `Bu detayı şu an paylaşmak istemiyorum. ${historyAwareMessage}`.trim()
    }

    const serviceCatalog = normalizeServiceCatalogForSimulation(input.serviceCatalog)
    const knownBudgetAmount = extractLatestKnownBudgetAmount(input.history ?? [])
    const defaultBudget = knownBudgetAmount ?? 12000

    const cooperativeReply = (() => {
        switch (targetCategory) {
        case 'age':
            return 'Öğrenci 12 yaşında.'
        case 'budget':
            return `Bütçemiz yaklaşık ${defaultBudget.toLocaleString('tr-TR')} TL civarında.`
        case 'urgency':
            return 'Öncelik seviyemiz yüksek, mümkünse kısa sürede başlamak istiyoruz.'
        case 'timeline':
            return 'Zamanlama tarafında esnekiz, uygun ilk pencerede başlayabiliriz.'
        case 'service':
            return buildServiceSupplementFromCatalog(serviceCatalog, 'cooperative')
        case 'business_size':
            return 'Küçük bir işletmeyiz, yaklaşık 8 çalışanımız var.'
        case 'callback_time':
            return 'Hafta içi 14:00-17:00 arası geri dönüş uygundur.'
        default:
            return 'Bu konuda temel bilgiyi paylaşabilirim.'
        }
    })()
    const partialReply = (() => {
        switch (targetCategory) {
        case 'age':
            return 'Yaş bilgisini şu an net paylaşmak istemiyorum.'
        case 'budget':
            return `Bütçemiz yaklaşık ${defaultBudget.toLocaleString('tr-TR')} TL bandında, uygun seçenek arıyoruz.`
        case 'urgency':
            return 'Aciliyet orta seviyede, önceliği netleştiriyoruz.'
        case 'timeline':
            return 'Zamanlamamız esnek, net tarihi kısa süre içinde netleştirebiliriz.'
        case 'service':
            return buildServiceSupplementFromCatalog(serviceCatalog, 'partial')
        case 'business_size':
            return 'İşletme ölçeğimiz küçük-orta arası.'
        case 'callback_time':
            return 'Geri dönüş için gündüz saatleri daha uygun.'
        default:
            return 'Bu bilgiye dair net detay henüz yok.'
        }
    })()

    const supplement = input.informationSharing === 'cooperative'
        ? cooperativeReply
        : partialReply

    const normalizedOriginal = normalizeForFieldMatching(historyAwareMessage)
    const normalizedSupplement = normalizeForFieldMatching(supplement)
    if (normalizedOriginal.includes(normalizedSupplement)) {
        return historyAwareMessage
    }

    return `${supplement} ${historyAwareMessage}`.trim()
}

function splitIntoSentenceLikeChunks(message: string) {
    const chunks = message.match(/[^.!?]+[.!?]?/g)
    if (!chunks) return [message.trim()].filter(Boolean)
    return chunks
        .map((chunk) => chunk.trim())
        .filter(Boolean)
}

function responseMentionsAnyField(response: string, fields: string[]) {
    return fields.some((field) => messageContainsKeywords(
        response,
        getIntakeFieldKeywords(field).keywords
    ))
}

function isGenericClarificationChunk(chunk: string) {
    if (!hasQuestionIntent(chunk)) return false
    return QA_LAB_GENERIC_CLARIFICATION_QUESTION_PATTERNS.some((pattern) => pattern.test(chunk))
}

export function enforceFieldNamedClarificationQuestion(input: {
    response: string
    activeMissingFields: string[]
}) {
    const response = input.response.trim()
    if (!response) return response

    const activeMissingFields = Array.from(new Set(
        input.activeMissingFields
            .map((field) => field.trim())
            .filter(Boolean)
    ))
    if (activeMissingFields.length === 0) return response
    if (!hasQuestionIntent(response)) return response
    if (responseMentionsAnyField(response, activeMissingFields)) return response

    const targetField = activeMissingFields[0] ?? ''
    if (!targetField) return response

    const explicitQuestion = `${targetField} bilgisini paylaşabilir misiniz?`
    const chunks = splitIntoSentenceLikeChunks(response)
    let replaced = false

    const refined = chunks.map((chunk) => {
        if (!isGenericClarificationChunk(chunk)) return chunk
        replaced = true
        return explicitQuestion
    })

    if (!replaced) return response
    return refined.join(' ').replace(/\s+/g, ' ').trim()
}

export function ensureActiveMissingFieldQuestion(input: {
    response: string
    activeMissingFields: string[]
    userMessage: string
}) {
    const response = input.response.trim()
    if (!response) return response

    const activeMissingFields = Array.from(new Set(
        input.activeMissingFields
            .map((field) => field.trim())
            .filter(Boolean)
    ))
    if (activeMissingFields.length === 0) return response
    if (hasRefusalSignal(input.userMessage)) return response
    if (hasQuestionIntent(response)) return response

    const targetField = activeMissingFields[0] ?? ''
    if (!targetField) return response
    const explicitQuestion = `${targetField} bilgisini paylaşabilir misiniz?`
    if (response.includes(explicitQuestion)) return response

    const separator = /[.!?]$/.test(response) ? ' ' : '. '
    return `${response}${separator}${explicitQuestion}`
        .replace(/\s+/g, ' ')
        .trim()
}

export function sanitizeAssistantResponseForTruncation(response: string) {
    const normalizedResponse = response.trim()
    if (!normalizedResponse) return normalizedResponse

    const hasLikelyList = /\b1\.\s*/.test(normalizedResponse) && /\b2\.\s*/.test(normalizedResponse)
    if (!hasLikelyList) return normalizedResponse

    const hasTruncatedTail = /\b\d+\.\s*$/.test(normalizedResponse) || /[:;]\s*$/.test(normalizedResponse)
    if (!hasTruncatedTail) return normalizedResponse

    let sanitized = normalizedResponse
        .replace(/\b\d+\.\s*$/, '')
        .replace(/[:;]\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim()

    if (!sanitized) {
        return 'Detayları ihtiyacınıza göre netleştirebiliriz.'
    }

    if (!/[.!?]$/.test(sanitized)) {
        sanitized = `${sanitized}.`
    }
    if (!/detayları ihtiyacınıza göre netleştirebiliriz\.$/i.test(sanitized)) {
        sanitized = `${sanitized} Detayları ihtiyacınıza göre netleştirebiliriz.`
    }
    return sanitized.replace(/\s+/g, ' ').trim()
}

export function stripBlockedFieldQuestionsFromAssistantResponse(input: {
    response: string
    blockedFields: string[]
}) {
    const response = input.response.trim()
    if (!response) return response

    const blockedFields = Array.from(new Set(
        input.blockedFields
            .map((field) => field.trim())
            .filter(Boolean)
    ))
    if (blockedFields.length === 0) return response

    const chunks = splitIntoSentenceLikeChunks(response)
    const filtered = chunks.filter((chunk) => {
        if (!hasQuestionIntent(chunk)) return true
        return !blockedFields.some((field) => isAssistantAskingField(chunk, field))
    })

    if (filtered.length === chunks.length) return response
    return filtered.join(' ').replace(/\s+/g, ' ').trim()
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
    const intakeProgress = buildQaLabIntakeProgress({
        generated: input.generated,
        history: input.history,
        currentUserMessage: input.message
    })
    const systemPrompt = `You are the AI QA Lab simulated assistant.
This simulation is synthetic and must NOT use any organization-specific skill catalog.
Use only the KB_CONTEXT below for factual claims.
Use conversation history as source of already collected customer data.
If KB_CONTEXT is insufficient for the user's request:
- say that exact detail is not available yet,
- ask one clarifying question,
- offer up to 3 topics from FALLBACK_TOPICS to continue.
Do not redirect to human support or transfer-to-team style replies unless user explicitly asks for a human.
Keep continuity with conversation history and avoid resetting context.
Reply language policy (MVP): use ${responseLanguageName} only.
Style policy:
- Keep replies concise (max 3 short sentences, ideally <= 90 words).
- Avoid long numbered lists; if list is necessary, keep it to at most 3 items.
Intake fulfillment policy:
- Prioritize required intake collection needed for actionable next step and human handoff readiness.
- Do not re-ask already provided details from conversation history.
- If user asks a direct question, answer it first (grounded), then ask at most one missing required field if still needed.
- Communication preference is not a mandatory intake field in QA Lab.
- Prefer high-impact missing fields first: budget, timeline/availability, scope/topic, urgency/business profile.
- Never insist on the same field after user ignores or refuses it once.
- If a field is deferred by user behavior, continue with available information and avoid pressure.
- Ask at most one clarification per turn and only from ACTIVE_MISSING_INTAKE_FIELDS.
- NEVER ask any field listed in DEFERRED_INTAKE_FIELDS.
- Treat semantically inferable customer answers as collected; exact keyword repetition is not required.
- If only deferred fields remain, move forward with available context instead of pushing intake loops.
- If you ask a missing field, name that field explicitly (e.g., "Bütçe aralığınızı paylaşır mısınız?"), avoid vague "Bu bilgiyi paylaşır mısınız?" prompts.
Engagement-question policy:
- A single engagement question is allowed when the current user need is answered and the next intent is unclear.
- Do NOT append menu-like suggestions on every turn (e.g., repeating multiple service options each reply).
- If user asks a clear next-step request (price, booking, schedule, onboarding steps), answer that request directly and do not add generic "other topics" prompts.
- Avoid repeating the same engagement pattern in consecutive assistant turns.

KB_CONTEXT:
${kbContext.lines.map((line, index) => `${index + 1}. ${line}`).join('\n')}

FALLBACK_TOPICS:
${fallbackTopics.map((topic, index) => `${index + 1}. ${topic}`).join('\n')}

REQUIRED_INTAKE_FIELDS:
${intakeProgress.requiredFields.map((field, index) => `${index + 1}. ${field}`).join('\n') || '-'}

MISSING_INTAKE_FIELDS:
${intakeProgress.missingFields.map((field, index) => `${index + 1}. ${field}`).join('\n') || '-'}

ACTIVE_MISSING_INTAKE_FIELDS:
${intakeProgress.activeMissingFields.map((field, index) => `${index + 1}. ${field}`).join('\n') || '-'}

DEFERRED_INTAKE_FIELDS:
${intakeProgress.deferredFields.map((field, index) => `${index + 1}. ${field}`).join('\n') || '-'}

INTAKE_PROGRESS: fulfilled ${intakeProgress.fulfilledCount}/${intakeProgress.requiredTotal}
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
    const fulfilledFields = intakeProgress.requiredFields.filter((field) => (
        !intakeProgress.missingFields.includes(field)
    ))
    const blockedReaskFields = Array.from(new Set([
        ...intakeProgress.deferredFields,
        ...fulfilledFields
    ]))
    const guardedResponseRaw = stripBlockedFieldQuestionsFromAssistantResponse({
        response: responseRaw,
        blockedFields: blockedReaskFields
    })
    const fieldNamedResponseRaw = enforceFieldNamedClarificationQuestion({
        response: guardedResponseRaw,
        activeMissingFields: intakeProgress.activeMissingFields
    })
    const withMissingFieldQuestionRaw = ensureActiveMissingFieldQuestion({
        response: fieldNamedResponseRaw,
        activeMissingFields: intakeProgress.activeMissingFields,
        userMessage: input.message
    })
    const sanitizedResponseRaw = sanitizeAssistantResponseForTruncation(withMissingFieldQuestionRaw)
    const response = trimText(
        sanitizedResponseRaw,
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
    intakeCoverage: ReturnType<typeof analyzeQaLabIntakeCoverage>
    strictScoreScale?: boolean
    retryReason?: string
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
  ],
  "scenario_assessments": [
    {
      "case_id": string,
      "assistant_success": "pass" | "warn" | "fail",
      "answer_quality_score": number,
      "logic_score": number,
      "groundedness_score": number,
      "summary": string,
      "strengths": string[],
      "issues": string[],
      "confidence": number
    }
  ]
}
Evidence format rule:
- Each finding.evidence must include explicit citations in this format: [scenario_id=..., turn=...].
- If an issue does not have at least one concrete citation, do NOT output that finding.
- Set confidence to 1.0 only when evidence includes multiple concrete citations; otherwise keep confidence <= 0.8.
- If finding text says hot/warm/cold or cooperative/partial/resistant, cited scenarios must actually match that attribute.
Scoring weights:
- groundedness: 40%
- extraction_accuracy: 35%
- conversation_quality: 25%
Score scale rule:
- All score_breakdown values MUST be integers in [0, 100], where 100 is best.
- All scenario_assessment scores MUST be integers in [0, 100], where 100 is best.
- Never use 0-1, 1-5, or 1-10 scales.
Scenario-assessment coverage rule:
- You MUST return one scenario_assessments item for every executed case.
- case_id must match the executed case IDs exactly.
- Evaluate each scenario in isolation first (did assistant answer logically, stay grounded, and progress meaningfully?).
- Keep scenario_assessments concise for JSON stability:
  - summary: max 18 words
  - strengths: max 2 short items
  - issues: max 2 short items
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
Intake-fulfillment rule:
- Prioritize required intake fields needed for actionable next-step and human handoff readiness.
- In hot/cooperative scenarios, if required intake fields remain largely uncollected without reasonable attempt, reduce extraction_accuracy.
- In resistant scenarios, do not force form-like interrogation; still expect at least essential attempts (scope/budget/timeline/business profile) when context allows.
- Reward assistants that use previously collected intake data in later answers (continuity).
- Penalize repeated re-asking of already provided intake details.
- If assistant asks a field and customer gives a plausible value in the next turn (even without exact keyword match), treat that field as provided unless ambiguity is clear.
- Penalize re-asking inferable/already-provided fields as a progression failure.
- Do NOT treat communication preference as a mandatory requirement; penalize only if the assistant keeps asking it repetitively without need.
- If customer explicitly refuses or repeatedly ignores a field, do NOT penalize assistant for not forcing collection after one meaningful attempt.
- Penalize insistence loops where the assistant keeps pushing the same field instead of progressing with available context.
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
${options.strictScoreScale ? `Retry guard:
- Previous judge output looked scale/consistency-anomalous; recompute strictly on 0-100 scale and citation-attribute consistency.
- Retry reason: ${options.retryReason ?? 'judge_score_consistency_check'}` : ''}
Only report findings with concrete evidence from provided transcripts and intake_coverage metrics.`

    const userPayload = {
        run_constraints: {
            preset: options.run.preset,
            scenario_count_target: options.run.scenario_count,
            max_turns_per_scenario: scenarioTurnLimit
        },
        derived_setup: options.generated.derived_setup,
        ground_truth: options.generated.ground_truth,
        intake_coverage: options.intakeCoverage,
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
        consumedInputCached: 0,
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
                    const stabilizedOutput = stabilizeGeneratorOutputForQuality(normalizedOutput, run)
                    const qualityError = validateGeneratorOutputQuality(stabilizedOutput, run)

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

                    generated = stabilizedOutput
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
        const qaRequiredIntakeFields = (
            generated.derived_setup.required_intake_fields.length > 0
                ? generated.derived_setup.required_intake_fields
                : generated.ground_truth.required_intake_fields
        )
        const qaServiceCatalog = (
            generated.derived_setup.service_catalog.length > 0
                ? generated.derived_setup.service_catalog
                : generated.ground_truth.canonical_services
        )

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

                const scenarioCustomerMessage = scenario.turns[turnIndex]?.customer ?? ''
                const customerMessage = adaptQaLabCustomerTurnToAssistantContext({
                    message: scenarioCustomerMessage,
                    previousAssistantMessage: getLatestAssistantMessage(history),
                    requiredFields: qaRequiredIntakeFields,
                    informationSharing: scenario.information_sharing,
                    serviceCatalog: qaServiceCatalog,
                    history
                })
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

        const intakeCoverage = analyzeQaLabIntakeCoverage({
            requiredIntakeFields: (
                generated.derived_setup.required_intake_fields.length > 0
                    ? generated.derived_setup.required_intake_fields
                    : generated.ground_truth.required_intake_fields
            ),
            cases: executedCases
        })

        let judgeResult: QaLabJudgeResult = {
            summary: '',
            score_breakdown: {
                groundedness: 0,
                extraction_accuracy: 0,
                conversation_quality: 0,
                weighted_total: 0
            },
            findings: [],
            top_actions: [],
            scenario_assessments: []
        }
        let judgeSkippedReason: string | null = null
        const judgeConsistencyGuard = {
            score_retry_triggered: false,
            score_retry_applied: false,
            dropped_inconsistent_findings: 0,
            notes: [] as string[]
        }

        const runJudgePass = async (input?: {
            strictScoreScale?: boolean
            retryReason?: string
        }) => {
            const judgePrompts = buildJudgePrompts({
                run,
                generated,
                executedCases,
                intakeCoverage,
                strictScoreScale: input?.strictScoreScale,
                retryReason: input?.retryReason
            })
            const judgePromptEstimatedInputTokens = estimateTokenCount(judgePrompts.systemPrompt)
                + estimateTokenCount(judgePrompts.userPrompt)
            const remainingForJudge = getRemainingTokens(tracker) - judgePromptEstimatedInputTokens

            if (remainingForJudge < JUDGE_MIN_OUTPUT_TOKENS) {
                return {
                    judgeResult: null,
                    skippedReason: 'insufficient_budget_for_judge' as const
                }
            }

            const judgeMaxOutputTokens = Math.max(
                JUDGE_MIN_OUTPUT_TOKENS,
                Math.min(
                    calculateJudgeTargetOutputTokens(executedCases.length),
                    remainingForJudge
                )
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
                return {
                    judgeResult: null,
                    skippedReason: 'empty_judge_response' as const
                }
            }

            const judgeJson = parseJsonObject(judgeRawOutput)
            if (!judgeJson) {
                return {
                    judgeResult: null,
                    skippedReason: 'invalid_judge_json' as const
                }
            }

            return {
                judgeResult: normalizeJudgeResult(judgeJson, {
                    executedCases,
                    intakeCoverageByCase: intakeCoverage.byCase
                }),
                skippedReason: null
            }
        }

        if (executedCases.length === 0) {
            judgeSkippedReason = 'no_cases_executed'
        } else if (!budgetStopped) {
            const initialJudgePass = await runJudgePass()
            let resolvedJudgePass = initialJudgePass

            if (initialJudgePass.skippedReason === 'invalid_judge_json') {
                judgeConsistencyGuard.notes.push('Initial judge output returned invalid JSON; triggering strict JSON-recovery retry.')
                const jsonRecoveryJudgePass = await runJudgePass({
                    strictScoreScale: true,
                    retryReason: 'invalid_judge_json_recovery'
                })
                if (jsonRecoveryJudgePass.judgeResult) {
                    resolvedJudgePass = {
                        judgeResult: jsonRecoveryJudgePass.judgeResult,
                        skippedReason: null
                    }
                    judgeConsistencyGuard.notes.push('JSON-recovery retry produced valid judge output.')
                } else {
                    resolvedJudgePass = jsonRecoveryJudgePass
                    judgeConsistencyGuard.notes.push(`JSON-recovery retry failed (${jsonRecoveryJudgePass.skippedReason ?? 'unknown_reason'}).`)
                }
            }

            if (resolvedJudgePass.skippedReason) {
                judgeSkippedReason = resolvedJudgePass.skippedReason
                if (resolvedJudgePass.skippedReason === 'insufficient_budget_for_judge') {
                    budgetStopped = true
                }
            } else if (resolvedJudgePass.judgeResult) {
                judgeResult = resolvedJudgePass.judgeResult

                const filteredFindings = filterJudgeFindingsByCitationConsistency({
                    findings: judgeResult.findings,
                    executedCases
                })
                const droppedFindingCount = judgeResult.findings.length - filteredFindings.length
                if (droppedFindingCount > 0) {
                    judgeConsistencyGuard.dropped_inconsistent_findings += droppedFindingCount
                    judgeConsistencyGuard.notes.push(`Dropped ${droppedFindingCount} finding(s) due to citation/context mismatch.`)
                    judgeResult = {
                        ...judgeResult,
                        findings: filteredFindings
                    }
                }

                const shouldRetryForScore = shouldRetryJudgeForScoreAnomaly({
                    judgeResult,
                    intakeCoverageTotals: {
                        caseCount: intakeCoverage.totals.caseCount,
                        readyCaseCount: intakeCoverage.totals.readyCaseCount,
                        averageFulfillmentCoverage: intakeCoverage.totals.averageFulfillmentCoverage
                    }
                })

                if (shouldRetryForScore) {
                    judgeConsistencyGuard.score_retry_triggered = true
                    judgeConsistencyGuard.notes.push('Triggered strict-score retry due to suspiciously low score vs healthy execution metrics.')

                    const retryJudgePass = await runJudgePass({
                        strictScoreScale: true,
                        retryReason: 'low_weighted_score_vs_intake_quality'
                    })

                    if (retryJudgePass.judgeResult) {
                        const retryFilteredFindings = filterJudgeFindingsByCitationConsistency({
                            findings: retryJudgePass.judgeResult.findings,
                            executedCases
                        })
                        const retryDroppedCount = retryJudgePass.judgeResult.findings.length - retryFilteredFindings.length
                        if (retryDroppedCount > 0) {
                            judgeConsistencyGuard.dropped_inconsistent_findings += retryDroppedCount
                            judgeConsistencyGuard.notes.push(`Dropped ${retryDroppedCount} finding(s) after strict-score retry due to citation/context mismatch.`)
                        }

                        judgeResult = {
                            ...retryJudgePass.judgeResult,
                            findings: retryFilteredFindings
                        }
                        judgeConsistencyGuard.score_retry_applied = true
                        judgeConsistencyGuard.notes.push('Strict-score retry result applied.')
                    } else {
                        judgeConsistencyGuard.notes.push(`Strict-score retry skipped (${retryJudgePass.skippedReason ?? 'unknown_reason'}).`)
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
            intakeCoverage: intakeCoverage.totals,
            judgeSkippedReason
        })

        const report = {
            version: REPORT_VERSION,
            generated_at: new Date().toISOString(),
            budget: {
                limit_tokens: tracker.budget,
                consumed_tokens: tracker.consumed,
                consumed_input_tokens: tracker.consumedInput,
                consumed_input_cached_tokens: tracker.consumedInputCached,
                consumed_output_tokens: tracker.consumedOutput,
                consumed_credits: calculateUsageCreditCost({
                    inputTokens: tracker.consumedInput,
                    outputTokens: tracker.consumedOutput
                }),
                estimated_cost_usd: calculateQaLabRunUsdCost({
                    inputTokens: tracker.consumedInput,
                    outputTokens: tracker.consumedOutput,
                    cachedInputTokens: tracker.consumedInputCached
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
                intake_coverage: {
                    required_fields: intakeCoverage.requiredFields,
                    totals: {
                        case_count: intakeCoverage.totals.caseCount,
                        ready_case_count: intakeCoverage.totals.readyCaseCount,
                        warn_case_count: intakeCoverage.totals.warnCaseCount,
                        fail_case_count: intakeCoverage.totals.failCaseCount,
                        average_asked_coverage: intakeCoverage.totals.averageAskedCoverage,
                        average_fulfillment_coverage: intakeCoverage.totals.averageFulfillmentCoverage,
                        hot_cooperative_case_count: intakeCoverage.totals.hotCooperativeCaseCount,
                        hot_cooperative_ready_count: intakeCoverage.totals.hotCooperativeReadyCount
                    },
                    top_missing_fields: intakeCoverage.topMissingFields.map((item) => ({
                        field: item.field,
                        count: item.count
                    })),
                    by_case: intakeCoverage.byCase.map((caseCoverage) => ({
                        case_id: caseCoverage.caseId,
                        title: caseCoverage.title,
                        lead_temperature: caseCoverage.leadTemperature,
                        information_sharing: caseCoverage.informationSharing,
                        required_fields_total: caseCoverage.requiredFieldsTotal,
                        asked_fields_count: caseCoverage.askedFieldsCount,
                        fulfilled_fields_count: caseCoverage.fulfilledFieldsCount,
                        asked_coverage: caseCoverage.askedCoverage,
                        fulfillment_coverage: caseCoverage.fulfillmentCoverage,
                        missing_fields: caseCoverage.missingFields,
                        handoff_readiness: caseCoverage.handoffReadiness
                    }))
                },
                cases: executedCases
            },
            pipeline_checks: pipelineChecks,
            judge: {
                summary: judgeResult.summary,
                score_breakdown: judgeResult.score_breakdown,
                findings: findings,
                top_actions: judgeResult.top_actions,
                scenario_assessments: judgeResult.scenario_assessments,
                skipped_reason: judgeSkippedReason,
                consistency_guard: judgeConsistencyGuard
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
