export type QaLabIntakeReadiness = 'pass' | 'warn' | 'fail'
export type QaLabIntakeChannelContext = 'whatsapp' | 'unknown'
type QaLabScenarioTemperature = 'hot' | 'warm' | 'cold'
type QaLabScenarioInformationSharing = 'cooperative' | 'partial' | 'resistant'

export interface QaLabIntakeCoverageTurnInput {
    turn_index?: number
    customer_message?: string
    assistant_response?: string
}

export interface QaLabIntakeCoverageCaseInput {
    case_id: string
    title?: string
    goal?: string
    lead_temperature?: QaLabScenarioTemperature
    information_sharing?: QaLabScenarioInformationSharing
    required_intake_fields?: string[]
    executed_turns?: QaLabIntakeCoverageTurnInput[]
}

export interface QaLabIntakeCoverageCaseResult {
    caseId: string
    title: string
    leadTemperature: QaLabScenarioTemperature
    informationSharing: QaLabScenarioInformationSharing
    requiredFieldsTotal: number
    askedFieldsCount: number
    fulfilledFieldsCount: number
    askedCoverage: number
    fulfillmentCoverage: number
    missingFields: string[]
    handoffReadiness: QaLabIntakeReadiness
}

export interface QaLabIntakeCoverageResult {
    requiredFields: string[]
    totals: {
        caseCount: number
        readyCaseCount: number
        warnCaseCount: number
        failCaseCount: number
        averageAskedCoverage: number
        averageFulfillmentCoverage: number
        hotCooperativeCaseCount: number
        hotCooperativeReadyCount: number
    }
    byCase: QaLabIntakeCoverageCaseResult[]
    topMissingFields: Array<{
        field: string
        count: number
    }>
}

type QaLabIntakeCategory =
    | 'budget'
    | 'timeline'
    | 'urgency'
    | 'contact'
    | 'service'
    | 'business_size'
    | 'callback_time'
    | 'frequency'
    | 'level'
    | 'goal'

interface QaLabFieldMatcher {
    field: string
    keywords: string[]
    categories: Set<QaLabIntakeCategory>
}

const STOPWORDS = new Set([
    've',
    'ile',
    'icin',
    'için',
    'the',
    'and',
    'for',
    'bir',
    'olan',
    'hakkinda',
    'hakkında',
    'gibi',
    'gore',
    'göre',
    'tercihi',
    'tercih'
])

const TYPE_LIKE_FIELD_PATTERNS = [
    /\btur\b/i,
    /\bturu\b/i,
    /\bcins\b/i,
    /\bcinsi\b/i,
    /\btip\b/i,
    /\btipi\b/i,
    /\bspecies\b/i,
    /\bbreed\b/i,
    /\bkategori\b/i,
    /\bcategory\b/i,
    /\bsegment\b/i
] as const

const GENERIC_TYPE_SIGNAL_STEMS = new Set([
    'butce',
    'fiyat',
    'ucret',
    'zaman',
    'tarih',
    'saat',
    'oncelik',
    'aciliyet',
    'hizmet',
    'konu',
    'talep',
    'proje',
    'randevu',
    'bilgi',
    'detay',
    'genel',
    'yaklasim',
    'cozum'
])

const SOFT_DEFLECTION_PATTERNS = [
    /paylaşmak istemiyorum/i,
    /paylasmak istemiyorum/i,
    /söylemek istemiyorum/i,
    /soylemek istemiyorum/i,
    /detay veremem/i,
    /detay vermek istemiyorum/i,
    /şu an paylaşamam/i,
    /su an paylasamam/i,
    /emin değilim/i,
    /emin degilim/i,
    /bilmiyorum/i
] as const

const CATEGORY_RULES: Array<{
    category: QaLabIntakeCategory
    triggers: string[]
    keywords: string[]
}> = [
    {
        category: 'budget',
        triggers: ['butce', 'bütçe', 'fiyat', 'ucret', 'ücret', 'price', 'budget', 'cost', 'paket'],
        keywords: ['butce', 'bütçe', 'fiyat', 'ucret', 'ücret', 'price', 'budget', 'cost', 'tl', 'usd', '$', '₺', 'bin']
    },
    {
        category: 'timeline',
        triggers: ['tarih', 'zaman', 'takvim', 'date', 'timeline', 'timing', 'randevu', 'uygunluk', 'schedule'],
        keywords: ['tarih', 'zaman', 'takvim', 'date', 'timeline', 'timing', 'randevu', 'uygun', 'schedule', 'hafta', 'ay', 'yarin', 'yarın']
    },
    {
        category: 'urgency',
        triggers: ['acil', 'aciliyet', 'urgent', 'urgency', 'oncelik', 'öncelik', 'priority'],
        keywords: ['acil', 'aciliyet', 'urgent', 'urgency', 'oncelik', 'öncelik', 'priority', 'hizli', 'hızlı', 'asap']
    },
    {
        category: 'contact',
        triggers: ['iletisim', 'iletişim', 'telefon', 'mail', 'email', 'whatsapp', 'contact', 'numara'],
        keywords: ['iletisim', 'iletişim', 'telefon', 'mail', 'email', 'whatsapp', 'contact', 'numara', 'gsm']
    },
    {
        category: 'service',
        triggers: ['hizmet', 'ders', 'konu', 'talep', 'ihtiyac', 'ihtiyaç', 'service', 'subject', 'need'],
        keywords: ['hizmet', 'ders', 'konu', 'talep', 'ihtiyac', 'ihtiyaç', 'service', 'subject', 'need', 'kapsam']
    },
    {
        category: 'business_size',
        triggers: ['isletme', 'işletme', 'company', 'business size', 'team size', 'employee', 'calisan', 'çalışan', 'firma', 'organizasyon'],
        keywords: ['isletme', 'işletme', 'company', 'business', 'size', 'team', 'employee', 'calisan', 'çalışan', 'personel', 'firma', 'organizasyon', 'kobi']
    },
    {
        category: 'callback_time',
        triggers: ['geri donus', 'geri dönüş', 'callback', 'time window'],
        keywords: ['geri donus', 'geri dönüş', 'callback', 'time window', 'uygun saat', 'hangi saat', 'mesai']
    },
    {
        category: 'frequency',
        triggers: ['siklik', 'sıklık', 'sikligi', 'sıklığı', 'hafta', 'frekans', 'frequency', 'seans'],
        keywords: ['siklik', 'sıklık', 'hafta', 'frequency', 'frekans', 'seans', 'haftada', 'ayda', 'gun', 'gün', 'saat']
    },
    {
        category: 'level',
        triggers: ['seviye', 'sinif', 'sınıf', 'deneyim', 'level', 'experience'],
        keywords: ['seviye', 'sinif', 'sınıf', 'deneyim', 'level', 'experience', 'baslangic', 'başlangıç', 'ileri']
    },
    {
        category: 'goal',
        triggers: ['hedef', 'amac', 'amaç', 'goal', 'outcome', 'sonuc', 'sonuç'],
        keywords: ['hedef', 'amac', 'amaç', 'goal', 'outcome', 'sinav', 'sınav', 'sonuc', 'sonuç']
    }
]

function toSafeString(value: unknown) {
    if (typeof value !== 'string') return ''
    return value.trim()
}

function normalizeText(value: string) {
    return value
        .toLowerCase()
        .replace(/ı/g, 'i')
        .replace(/ç/g, 'c')
        .replace(/ğ/g, 'g')
        .replace(/ö/g, 'o')
        .replace(/ş/g, 's')
        .replace(/ü/g, 'u')
        .replace(/[^\p{L}\p{N}\s@$.₺:+-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function tokenize(value: string) {
    const normalized = normalizeText(value)
    if (!normalized) return []
    return normalized
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
}

function normalizeRatio(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(1, Number(value.toFixed(2))))
}

function normalizeLooseStem(token: string) {
    let stem = token.trim()
    if (!stem) return stem

    const suffixes = [
        'siniz', 'siniz', 'siniz', 'siniz',
        'yiz', 'yim',
        'imiz', 'umuz', 'umuz', 'umuz',
        'iniz', 'unuz', 'unuz', 'unuz',
        'leri', 'lari',
        'nin', 'nin', 'nun', 'nun',
        'den', 'dan',
        'ler', 'lar',
        'de', 'da',
        'im', 'um', 'am', 'em',
        'in', 'un', 'an', 'en',
        'i', 'u', 'a', 'e',
        'm'
    ]

    for (const suffix of suffixes) {
        if (stem.length <= suffix.length + 2) continue
        if (stem.endsWith(suffix)) {
            stem = stem.slice(0, -suffix.length)
            break
        }
    }

    return stem
}

function looseTokenMatch(left: string, right: string) {
    const a = normalizeLooseStem(left)
    const b = normalizeLooseStem(right)
    if (!a || !b) return false
    if (a === b) return true

    if (a.length >= 4 && b.length >= 4) {
        let prefix = 0
        const max = Math.min(a.length, b.length)
        while (prefix < max && a[prefix] === b[prefix]) prefix += 1
        if (prefix >= 4) return true

        const consonantSofteningMatch = (
            ((a.endsWith('g') && b.endsWith('k')) || (a.endsWith('k') && b.endsWith('g')))
            && a.slice(0, -1) === b.slice(0, -1)
        )
        if (consonantSofteningMatch) return true
    }

    return false
}

function hasTypeLikeFieldSignal(field: string) {
    const normalized = normalizeText(field)
    if (!normalized) return false
    return TYPE_LIKE_FIELD_PATTERNS.some((pattern) => pattern.test(normalized))
}

function extractTypeLikeCandidateStems(text: string) {
    const normalized = normalizeText(text)
    if (!normalized) return []

    const candidates = new Set<string>()

    for (const match of normalized.matchAll(/\b([a-z]{3,})(?:im|um|am|em|m)\s+icin\b/g)) {
        const stem = normalizeLooseStem(match[1] ?? '')
        if (stem) candidates.add(stem)
    }

    for (const match of normalized.matchAll(/\b([a-z]{4,})(?:yim|yiz)\b/g)) {
        const stem = normalizeLooseStem(match[1] ?? '')
        if (stem) candidates.add(stem)
    }

    for (const match of normalized.matchAll(/\bmy\s+([a-z]{3,})\b/g)) {
        const stem = normalizeLooseStem(match[1] ?? '')
        if (stem) candidates.add(stem)
    }

    return Array.from(candidates)
}

function buildCaseContextTokens(caseItem: QaLabIntakeCoverageCaseInput) {
    const combined = `${toSafeString(caseItem.title)} ${toSafeString(caseItem.goal)}`
    return tokenize(combined).filter((token) => (
        token.length >= 4
        && !GENERIC_TYPE_SIGNAL_STEMS.has(normalizeLooseStem(token))
    ))
}

function hasTypeLikeSemanticFulfillment(input: {
    field: string
    fieldKeywords: string[]
    customerMessage: string
    caseContextTokens: string[]
}) {
    if (!hasTypeLikeFieldSignal(input.field)) return false
    const normalizedMessage = normalizeText(input.customerMessage)
    if (!normalizedMessage) return false
    if (hasSoftDeflectionSignal(normalizedMessage)) return false
    if (hasQuestionIntent(input.customerMessage) && tokenize(input.customerMessage).length <= 8) return false

    const fieldTokenStems = new Set(
        input.fieldKeywords
            .map((token) => normalizeLooseStem(token))
            .filter((token) => token.length >= 3)
    )
    const candidates = extractTypeLikeCandidateStems(input.customerMessage)

    const hasDistinctCandidate = candidates.some((candidate) => {
        if (candidate.length < 3) return false
        if (GENERIC_TYPE_SIGNAL_STEMS.has(candidate)) return false
        for (const fieldStem of fieldTokenStems) {
            if (looseTokenMatch(candidate, fieldStem)) {
                return false
            }
        }
        return true
    })
    if (hasDistinctCandidate) return true

    const customerTokens = tokenize(input.customerMessage)
    if (customerTokens.length === 0 || input.caseContextTokens.length === 0) return false

    return customerTokens.some((customerToken) => (
        input.caseContextTokens.some((contextToken) => looseTokenMatch(customerToken, contextToken))
    ))
}

function normalizeCaseTemperature(value: unknown): QaLabScenarioTemperature {
    if (value === 'hot' || value === 'warm' || value === 'cold') return value
    return 'warm'
}

function normalizeCaseSharing(value: unknown): QaLabScenarioInformationSharing {
    if (value === 'cooperative' || value === 'partial' || value === 'resistant') return value
    return 'partial'
}

function buildFieldMatcher(field: string): QaLabFieldMatcher {
    const baseTokens = tokenize(field)
    const categories = new Set<QaLabIntakeCategory>()
    const keywordSet = new Set<string>(baseTokens)

    for (const rule of CATEGORY_RULES) {
        const triggerHit = rule.triggers.some((trigger) => (
            baseTokens.some((token) => token.includes(trigger) || trigger.includes(token))
        ))
        if (!triggerHit) continue
        categories.add(rule.category)
        for (const keyword of rule.keywords) {
            keywordSet.add(keyword)
        }
    }

    return {
        field,
        categories,
        keywords: Array.from(keywordSet)
    }
}

function textContainsAny(text: string, keywords: string[]) {
    if (!text || keywords.length === 0) return false
    return keywords.some((keyword) => keyword.length > 0 && text.includes(keyword))
}

function hasQuestionIntent(text: string) {
    if (!text) return false
    if (text.includes('?')) return true
    const normalized = normalizeText(text)
    return (
        normalized.includes('misiniz')
        || normalized.includes('mısınız')
        || normalized.includes('miyim')
        || normalized.includes('miyiz')
        || normalized.includes('olur mu')
        || normalized.includes('paylasir')
        || normalized.includes('paylaşır')
        || normalized.includes('belirt')
        || normalized.includes('hangi')
        || normalized.includes('nedir')
        || normalized.includes('ogrenebilir miyim')
        || normalized.includes('öğrenebilir miyim')
        || normalized.includes('what')
        || normalized.includes('which')
        || normalized.includes('could you')
    )
}

function hasBudgetSignal(text: string) {
    if (!text) return false
    return (
        /(\d[\d.,]*)\s*(tl|₺|usd|\$|eur|bin)/i.test(text)
        || text.includes('butce')
        || text.includes('bütçe')
    )
}

function hasTimelineSignal(text: string) {
    if (!text) return false
    return (
        /\b\d{1,2}[./-]\d{1,2}\b/.test(text)
        || text.includes('timing')
        || text.includes('yarin')
        || text.includes('yarın')
        || text.includes('hafta')
        || text.includes('ay')
        || text.includes('saat')
    )
}

function hasUrgencyMentionSignal(text: string) {
    if (!text) return false
    return (
        text.includes('acil')
        || text.includes('aciliyet')
        || text.includes('urgent')
        || text.includes('urgency')
        || text.includes('oncelik')
        || text.includes('öncelik')
        || text.includes('hizli')
        || text.includes('hızlı')
        || text.includes('hemen')
        || text.includes('asap')
        || text.includes('en kisa')
        || text.includes('en kısa')
    )
}

function hasUrgencyValueSignal(text: string) {
    if (!text) return false

    const hasBalancedUrgencyIntent = (
        /(acelesi yok|acelem yok|acil degil|acil değil|hemen olmasina gerek yok|hemen olmasına gerek yok|aciliyet dusuk|aciliyet düşük|oncelik dusuk|öncelik düşük)/i.test(text)
        && /(bir an once|bir an önce|yakinda|yakında|mümkün oldugunca erken|mümkün olduğunca erken|baslamak istiyorum|başlamak istiyorum|ilerlemek istiyorum)/i.test(text)
    )
    if (hasBalancedUrgencyIntent) return true

    const hasExplicitLevel = (
        /(oncelik|öncelik|aciliyet)\s*(seviyesi|duzeyi|düzeyi)?\s*(yuksek|yüksek|orta|dusuk|düşük)/i.test(text)
        || /(yuksek|yüksek|orta|dusuk|düşük)\s*(oncelik|öncelik|aciliyet)/i.test(text)
    )
    if (hasExplicitLevel) return true

    const hasStrongUrgencyIntent = (
        /(cok acil|çok acil|acilen|hemen|asap|en kisa surede|en kısa sürede|hizli.*basla|hızlı.*başla|onceligimiz yuksek|önceliğimiz yüksek|beklemek istemiyorum|mumkunse hemen|mümkünse hemen)/i.test(text)
    )
    if (hasStrongUrgencyIntent) return true

    const hasIntentVerb = /(istiyorum|gerekiyor|olmasi lazim|olmalı|tercih ediyoruz|onceligimiz|önceliğimiz)/i.test(text)
    if (hasIntentVerb && /(acil|aciliyet|oncelik|öncelik|hizli|hızlı)/i.test(text)) {
        return true
    }

    if (hasQuestionIntent(text) && !/(hizli.*basla|hızlı.*başla|en kisa sure|en kısa süre|acilen|hemen)/i.test(text)) {
        return false
    }

    return (
        /(aciliyetimiz|onceligimiz|önceliğimiz|oncelik seviyemiz|öncelik seviyemiz|aciliyet seviyesi)/i.test(text)
        || (hasUrgencyMentionSignal(text) && !hasQuestionIntent(text))
    )
}

function hasContactSignal(text: string) {
    if (!text) return false
    return (
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)
        || /(?:\+?90|0)?\s*\d{3}\s*\d{3}\s*\d{2}\s*\d{2}/.test(text)
        || text.includes('whatsapp')
        || text.includes('telefon')
        || text.includes('mail')
        || text.includes('email')
    )
}

function hasBusinessSizeSignal(text: string) {
    if (!text) return false
    return (
        text.includes('isletme')
        || text.includes('işletme')
        || text.includes('company')
        || text.includes('business size')
        || text.includes('team size')
        || text.includes('calisan')
        || text.includes('çalışan')
        || text.includes('personel')
        || /\b\d+\s*(calisan|çalışan|personel|kisi|kişi|employee)\b/.test(text)
    )
}

function hasCallbackTimeSignal(text: string) {
    if (!text) return false
    return (
        text.includes('geri donus')
        || text.includes('geri dönüş')
        || text.includes('callback')
        || text.includes('mesai')
        || text.includes('uygun saat')
        || /\b\d{1,2}[:.]\d{2}\b/.test(text)
    )
}

function hasFrequencySignal(text: string) {
    if (!text) return false
    return (
        text.includes('haftada')
        || text.includes('ayda')
        || text.includes('gunde')
        || text.includes('günde')
        || /\b\d+\s*(saat|seans)\b/.test(text)
    )
}

function hasLevelSignal(text: string) {
    if (!text) return false
    return (
        text.includes('seviye')
        || text.includes('baslangic')
        || text.includes('başlangıç')
        || text.includes('orta')
        || text.includes('ileri')
        || text.includes('sinif')
        || text.includes('sınıf')
    )
}

function hasGoalSignal(text: string) {
    if (!text) return false
    return (
        text.includes('hedef')
        || text.includes('amac')
        || text.includes('amaç')
        || text.includes('sinav')
        || text.includes('sınav')
    )
}

function hasServiceSignal(text: string) {
    if (!text) return false
    return (
        text.includes('hizmet')
        || text.includes('service')
        || text.includes('kapsam')
        || text.includes('paket')
        || text.includes('konu')
        || text.includes('cozum')
        || text.includes('çözüm')
        || text.includes('proje')
        || text.includes('uygulama')
        || text.includes('gelistirme')
        || text.includes('geliştirme')
        || text.includes('entegrasyon')
        || text.includes('danismanlik')
        || text.includes('danışmanlık')
        || text.includes('ders')
    )
}

function hasSoftDeflectionSignal(text: string) {
    if (!text) return false
    return SOFT_DEFLECTION_PATTERNS.some((pattern) => pattern.test(text))
}

function hasExplicitRefusalAroundKeyword(text: string, keywords: string[]) {
    if (!text || keywords.length === 0) return false
    if (!hasSoftDeflectionSignal(text)) return false
    return textContainsAny(text, keywords)
}

function hasLikelyInformativeSemanticReply(text: string) {
    if (!text) return false
    if (hasSoftDeflectionSignal(text)) return false

    if (
        hasBudgetSignal(text)
        || hasTimelineSignal(text)
        || hasUrgencyMentionSignal(text)
        || hasServiceSignal(text)
        || hasContactSignal(text)
        || hasFrequencySignal(text)
        || hasLevelSignal(text)
        || hasGoalSignal(text)
    ) {
        return true
    }

    const tokens = tokenize(text)
    if (tokens.length < 4) return false

    const isShortQuestion = hasQuestionIntent(text) && tokens.length <= 6
    if (isShortQuestion) return false

    if (/^(merhaba|selam|tamam|olur|teşekkür|tesekkur|evet|hayir)\b/i.test(text)) {
        return false
    }

    return true
}

function canUseBroadSemanticFallbackForMatcher(matcher: QaLabFieldMatcher) {
    if (matcher.categories.size > 0) return false
    if (hasTypeLikeFieldSignal(matcher.field)) return false
    return true
}

function hasCategorySignal(text: string, categories: Set<QaLabIntakeCategory>) {
    if (categories.has('budget') && hasBudgetSignal(text)) return true
    if (categories.has('timeline') && hasTimelineSignal(text)) return true
    if (categories.has('urgency') && hasUrgencyValueSignal(text)) return true
    if (categories.has('contact') && hasContactSignal(text)) return true
    if (categories.has('business_size') && hasBusinessSizeSignal(text)) return true
    if (categories.has('callback_time') && hasCallbackTimeSignal(text)) return true
    if (categories.has('frequency') && hasFrequencySignal(text)) return true
    if (categories.has('level') && hasLevelSignal(text)) return true
    if (categories.has('goal') && hasGoalSignal(text)) return true
    if (categories.has('service') && hasServiceSignal(text)) return true
    return false
}

function evaluateReadiness(input: {
    requiredFieldsTotal: number
    askedCoverage: number
    fulfillmentCoverage: number
    leadTemperature: QaLabScenarioTemperature
    informationSharing: QaLabScenarioInformationSharing
}): QaLabIntakeReadiness {
    if (input.requiredFieldsTotal === 0) return 'pass'

    let passAsk = 0.6
    let passFulfillment = 0.45
    let warnAsk = 0.35
    let warnFulfillment = 0.2

    if (input.leadTemperature === 'hot' && input.informationSharing === 'cooperative') {
        passAsk = 0.75
        passFulfillment = 0.6
        warnAsk = 0.5
        warnFulfillment = 0.35
    } else if (
        input.leadTemperature === 'cold'
        || input.informationSharing === 'resistant'
    ) {
        passAsk = 0.45
        passFulfillment = 0.25
        warnAsk = 0.25
        warnFulfillment = 0.1
    }

    if (input.askedCoverage >= passAsk && input.fulfillmentCoverage >= passFulfillment) {
        return 'pass'
    }

    if (input.askedCoverage >= warnAsk && input.fulfillmentCoverage >= warnFulfillment) {
        return 'warn'
    }

    return 'fail'
}

export function analyzeQaLabIntakeCoverage(input: {
    requiredIntakeFields: string[]
    cases: QaLabIntakeCoverageCaseInput[]
    channelContext?: QaLabIntakeChannelContext
}): QaLabIntakeCoverageResult {
    const requiredFields = input.requiredIntakeFields
        .map((field) => toSafeString(field))
        .filter(Boolean)

    const byCase: QaLabIntakeCoverageCaseResult[] = []
    const missingFieldCounter = new Map<string, number>()
    const channelContext = input.channelContext ?? 'unknown'

    for (const caseItem of input.cases) {
        const leadTemperature = normalizeCaseTemperature(caseItem.lead_temperature)
        const informationSharing = normalizeCaseSharing(caseItem.information_sharing)
        const caseRequiredFields = (
            Array.isArray(caseItem.required_intake_fields)
                ? caseItem.required_intake_fields
                    .map((field) => toSafeString(field))
                    .filter(Boolean)
                : requiredFields
        )
        const matchers = caseRequiredFields.map(buildFieldMatcher)
        const caseContextTokens = buildCaseContextTokens(caseItem)
        const states = matchers.map((matcher) => ({
            matcher,
            asked: false,
            fulfilled: false,
            awaitingResponseFromAssistantAsk: false
        }))

        // WhatsApp-first QA mode: communication channel preference is already implicit.
        if (channelContext === 'whatsapp') {
            for (const state of states) {
                if (
                    state.matcher.categories.has('contact')
                    && state.matcher.categories.size === 1
                ) {
                    state.asked = true
                    state.fulfilled = true
                }
            }
        }

        const turns = Array.isArray(caseItem.executed_turns) ? caseItem.executed_turns : []
        for (const turn of turns) {
            const assistantRaw = toSafeString(turn.assistant_response)
            const assistantText = normalizeText(assistantRaw)
            const customerText = normalizeText(toSafeString(turn.customer_message))

            for (const state of states) {
                if (!state.fulfilled) {
                    const explicitRefusal = hasExplicitRefusalAroundKeyword(
                        customerText,
                        state.matcher.keywords
                    )
                    if (explicitRefusal) {
                        continue
                    }
                    const directMatch = state.matcher.categories.has('urgency')
                        ? hasUrgencyValueSignal(customerText)
                        : textContainsAny(customerText, state.matcher.keywords)
                    const categoryMatch = hasCategorySignal(customerText, state.matcher.categories)
                    const typeLikeSemanticMatch = hasTypeLikeSemanticFulfillment({
                        field: state.matcher.field,
                        fieldKeywords: state.matcher.keywords,
                        customerMessage: customerText,
                        caseContextTokens
                    })
                    if (directMatch || categoryMatch || typeLikeSemanticMatch) {
                        state.fulfilled = true
                    }
                }
            }

            if (hasLikelyInformativeSemanticReply(customerText)) {
                const semanticCandidates = states.filter((state) => (
                    !state.fulfilled
                    && state.awaitingResponseFromAssistantAsk
                    && canUseBroadSemanticFallbackForMatcher(state.matcher)
                ))
                if (semanticCandidates.length === 1) {
                    semanticCandidates[0]!.fulfilled = true
                }
            }

            for (const state of states) {
                state.awaitingResponseFromAssistantAsk = false
            }

            for (const state of states) {
                const keywordMatch = textContainsAny(assistantText, state.matcher.keywords)
                const isFieldQuestion = keywordMatch && hasQuestionIntent(assistantRaw)

                if (!state.asked && isFieldQuestion) {
                    state.asked = true
                }

                if (isFieldQuestion) {
                    state.awaitingResponseFromAssistantAsk = true
                }
            }
        }

        const requiredFieldsTotal = matchers.length
        const askedFieldsCountRaw = states.filter((state) => state.asked).length
        const fulfilledFieldsCount = states.filter((state) => state.fulfilled).length
        const askedFieldsCount = (
            askedFieldsCountRaw === 0
                ? Math.min(requiredFieldsTotal, fulfilledFieldsCount)
                : askedFieldsCountRaw
        )
        const missingFields = states
            .filter((state) => !state.fulfilled)
            .map((state) => state.matcher.field)

        for (const missingField of missingFields) {
            missingFieldCounter.set(missingField, (missingFieldCounter.get(missingField) ?? 0) + 1)
        }

        const askedCoverage = normalizeRatio(
            requiredFieldsTotal > 0 ? askedFieldsCount / requiredFieldsTotal : 1
        )
        const fulfillmentCoverage = normalizeRatio(
            requiredFieldsTotal > 0 ? fulfilledFieldsCount / requiredFieldsTotal : 1
        )
        const handoffReadiness = evaluateReadiness({
            requiredFieldsTotal,
            askedCoverage,
            fulfillmentCoverage,
            leadTemperature,
            informationSharing
        })

        byCase.push({
            caseId: toSafeString(caseItem.case_id) || '-',
            title: toSafeString(caseItem.title) || '-',
            leadTemperature,
            informationSharing,
            requiredFieldsTotal,
            askedFieldsCount,
            fulfilledFieldsCount,
            askedCoverage,
            fulfillmentCoverage,
            missingFields,
            handoffReadiness
        })
    }

    const caseCount = byCase.length
    const readyCaseCount = byCase.filter((item) => item.handoffReadiness === 'pass').length
    const warnCaseCount = byCase.filter((item) => item.handoffReadiness === 'warn').length
    const failCaseCount = byCase.filter((item) => item.handoffReadiness === 'fail').length
    const averageAskedCoverage = normalizeRatio(
        caseCount > 0
            ? byCase.reduce((sum, item) => sum + item.askedCoverage, 0) / caseCount
            : 0
    )
    const averageFulfillmentCoverage = normalizeRatio(
        caseCount > 0
            ? byCase.reduce((sum, item) => sum + item.fulfillmentCoverage, 0) / caseCount
            : 0
    )
    const hotCooperativeCases = byCase.filter((item) => (
        item.leadTemperature === 'hot' && item.informationSharing === 'cooperative'
    ))
    const hotCooperativeCaseCount = hotCooperativeCases.length
    const hotCooperativeReadyCount = hotCooperativeCases.filter((item) => (
        item.handoffReadiness === 'pass'
    )).length

    const topMissingFields = Array.from(missingFieldCounter.entries())
        .map(([field, count]) => ({ field, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 12)

    return {
        requiredFields,
        totals: {
            caseCount,
            readyCaseCount,
            warnCaseCount,
            failCaseCount,
            averageAskedCoverage,
            averageFulfillmentCoverage,
            hotCooperativeCaseCount,
            hotCooperativeReadyCount
        },
        byCase,
        topMissingFields
    }
}
