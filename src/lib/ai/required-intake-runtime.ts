import { messageMentionsField } from '@/lib/ai/intake-field-match'
import { normalizeIntakeFields } from '@/lib/leads/offering-profile-utils'

type RuntimeRequiredIntakeCategory =
    | 'boolean'
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

interface RuntimeRequiredIntakeFieldMatcher {
    field: string
    categories: Set<RuntimeRequiredIntakeCategory>
    keywords: string[]
}

export interface RuntimeRequiredIntakeFieldState {
    field: string
    asked: boolean
    fulfilled: boolean
    deferred: boolean
    blocked: boolean
    inferredValue: string | null
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
    'field',
    'alan',
    'bilgi',
    'detay'
])

const CATEGORY_RULES: Array<{
    category: RuntimeRequiredIntakeCategory
    triggers: string[]
    keywords: string[]
}> = [
    {
        category: 'boolean',
        triggers: ['durum', 'status', 'aktif', 'mevcut'],
        keywords: ['durum', 'status', 'aktif', 'mevcut', 'evet', 'hayir', 'hayır', 'yes', 'no', 'var', 'yok']
    },
    {
        category: 'budget',
        triggers: ['butce', 'bütçe', 'fiyat', 'ucret', 'ücret', 'price', 'budget', 'cost'],
        keywords: ['butce', 'bütçe', 'fiyat', 'ucret', 'ücret', 'price', 'budget', 'cost', 'tl', 'usd', '$', '₺', 'eur']
    },
    {
        category: 'timeline',
        triggers: ['tarih', 'zaman', 'date', 'timeline', 'schedule', 'uygunluk', 'dogum', 'doğum'],
        keywords: ['tarih', 'zaman', 'date', 'timeline', 'schedule', 'uygun', 'hafta', 'ay', 'yarin', 'yarın', 'dogum', 'doğum']
    },
    {
        category: 'urgency',
        triggers: ['aciliyet', 'acil', 'urgent', 'urgency', 'oncelik', 'öncelik', 'priority'],
        keywords: ['aciliyet', 'acil', 'urgent', 'urgency', 'oncelik', 'öncelik', 'priority', 'hizli', 'hızlı', 'asap']
    },
    {
        category: 'contact',
        triggers: ['telefon', 'phone', 'numara', 'number', 'iletisim', 'iletişim', 'contact', 'email', 'mail'],
        keywords: ['telefon', 'phone', 'numara', 'number', 'iletisim', 'iletişim', 'contact', 'email', 'mail', 'whatsapp', 'gsm']
    },
    {
        category: 'service',
        triggers: ['hizmet', 'service', 'paket', 'package', 'talep', 'ihtiyac', 'ihtiyaç', 'problem', 'konu'],
        keywords: ['hizmet', 'service', 'paket', 'package', 'talep', 'ihtiyac', 'ihtiyaç', 'problem', 'konu', 'kapsam']
    },
    {
        category: 'business_size',
        triggers: ['ekip', 'takim', 'takım', 'isletme', 'işletme', 'team', 'employee', 'calisan', 'çalışan', 'personel'],
        keywords: ['ekip', 'takim', 'takım', 'team', 'employee', 'calisan', 'çalışan', 'personel', 'kisi', 'kişi', 'kisilik', 'kişilik']
    },
    {
        category: 'callback_time',
        triggers: ['geri donus', 'geri dönüş', 'callback', 'uygun saat', 'time window'],
        keywords: ['geri donus', 'geri dönüş', 'callback', 'uygun saat', 'time window', 'mesai']
    },
    {
        category: 'frequency',
        triggers: ['siklik', 'sıklık', 'frekans', 'frequency', 'haftada', 'ayda', 'seans'],
        keywords: ['siklik', 'sıklık', 'frekans', 'frequency', 'haftada', 'ayda', 'seans', 'ders']
    },
    {
        category: 'level',
        triggers: ['seviye', 'level', 'deneyim', 'experience', 'sinif', 'sınıf'],
        keywords: ['seviye', 'level', 'deneyim', 'experience', 'sinif', 'sınıf', 'baslangic', 'başlangıç', 'orta', 'ileri']
    },
    {
        category: 'goal',
        triggers: ['hedef', 'amac', 'amaç', 'goal', 'outcome', 'sonuc', 'sonuç'],
        keywords: ['hedef', 'amac', 'amaç', 'goal', 'outcome', 'sonuc', 'sonuç', 'sinav', 'sınav']
    }
]

const SOFT_DEFLECTION_PATTERNS = [
    /paylaşmak istemiyorum/i,
    /paylasmak istemiyorum/i,
    /detay vermek istemiyorum/i,
    /soylemek istemiyorum/i,
    /söylemek istemiyorum/i,
    /emin degilim/i,
    /emin değilim/i,
    /bilmiyorum/i
]

const REFUSAL_PATTERNS = [
    /payla[sş](mak)? istemiyorum/i,
    /detay vermek istemiyorum/i,
    /sormay[iı]n/i,
    /i (?:do not|don't) want to share/i,
    /rather not share/i
]

const NO_PROGRESS_PATTERNS = [
    /bilmiyorum/i,
    /emin de[gğ]ilim/i,
    /[sş]imdilik/i,
    /later/i,
    /not sure/i
]

const MONTH_NAME_PATTERN = /\b(ocak|şubat|subat|mart|nisan|may[ıi]s|haziran|temmuz|a[gğ]ustos|eyl[uü]l|ekim|kas[ıi]m|aral[ıi]k|january|february|march|april|may|june|july|august|september|october|november|december)\b/i

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

function textContainsAny(text: string, keywords: string[]) {
    if (!text || keywords.length === 0) return false
    return keywords.some((keyword) => keyword.length > 0 && text.includes(keyword))
}

function buildFieldMatcher(field: string): RuntimeRequiredIntakeFieldMatcher {
    const baseTokens = tokenize(field)
    const categories = new Set<RuntimeRequiredIntakeCategory>()
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

export function hasRequiredIntakeQuestionIntent(text: string) {
    if (!text) return false
    if (text.includes('?')) return true

    const normalized = normalizeText(text)
    return (
        normalized.includes('misiniz')
        || normalized.includes('mısınız')
        || normalized.includes('miyim')
        || normalized.includes('miyiz')
        || normalized.includes('olur mu')
        || normalized.includes('paylas')
        || normalized.includes('paylaş')
        || normalized.includes('belirt')
        || normalized.includes('hangi')
        || normalized.includes('nedir')
        || normalized.includes('ne zaman')
        || normalized.includes('kac')
        || normalized.includes('kaç')
        || normalized.includes('ogrenebilir miyim')
        || normalized.includes('öğrenebilir miyim')
        || normalized.includes('what')
        || normalized.includes('which')
        || normalized.includes('when')
        || normalized.includes('how many')
        || normalized.includes('could you')
        || normalized.includes('can you')
    )
}

function hasRefusalSignal(text: string) {
    return REFUSAL_PATTERNS.some((pattern) => pattern.test(text))
}

function hasNoProgressSignal(text: string) {
    return NO_PROGRESS_PATTERNS.some((pattern) => pattern.test(text))
}

function hasSoftDeflectionSignal(text: string) {
    return SOFT_DEFLECTION_PATTERNS.some((pattern) => pattern.test(text))
}

function hasBudgetSignal(text: string) {
    return (
        /(\d[\d.,]*)\s*(tl|₺|usd|\$|eur|bin)/i.test(text)
        || /\b(ne kadar|kaç para)\b/i.test(text)
        || text.includes('butce')
        || text.includes('bütçe')
    )
}

function hasTimelineSignal(text: string) {
    return (
        /\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/.test(text)
        || MONTH_NAME_PATTERN.test(text)
        || /\b(yarin|yarın|bugun|bugün|hafta|ay|saat|sonu|basi|başı)\b/i.test(text)
    )
}

function hasUrgencyValueSignal(text: string) {
    return (
        /(acil|aciliyet|urgent|urgency|oncelik|öncelik|hizli|hızlı|asap|hemen)/i.test(text)
        && !hasRequiredIntakeQuestionIntent(text)
    )
}

function hasContactSignal(text: string) {
    return (
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)
        || /(?:\+?90|0)?\s*\d{3}\s*\d{3}\s*\d{2}\s*\d{2}/.test(text)
        || /(telefon|phone|numara|email|mail|whatsapp|gsm)/i.test(text)
    )
}

function hasBusinessSizeSignal(text: string) {
    return (
        /\b\d+\s*(kisi|kişi|kisilik|kişilik|calisan|çalışan|personel|employee)\b/i.test(text)
        || /(ekibiz|ekibimiz|team|personel|calisan|çalışan|işletme|isletme)/i.test(text)
    )
}

function hasCallbackTimeSignal(text: string) {
    return (
        /(geri donus|geri dönüş|callback|uygun saat|mesai)/i.test(text)
        || /\b\d{1,2}[:.]\d{2}\b/.test(text)
    )
}

function hasFrequencySignal(text: string) {
    return (
        /(haftada|ayda|gunde|günde|frequency|frekans)/i.test(text)
        || /\b\d+\s*(seans|ders|gun|gün|session)\b/i.test(text)
    )
}

function hasLevelSignal(text: string) {
    return /(seviye|baslangic|başlangıç|orta|ileri|level|experience|deneyim|sinif|sınıf)/i.test(text)
}

function hasGoalSignal(text: string) {
    return /(hedef|amac|amaç|goal|outcome|sinav|sınav|sonuc|sonuç)/i.test(text)
}

function hasServiceSignal(text: string) {
    return /(hizmet|service|paket|package|kapsam|talep|ihtiyac|ihtiyaç|problem|konu)/i.test(text)
}

function hasCategoryValueSignal(text: string, categories: Set<RuntimeRequiredIntakeCategory>) {
    if (categories.has('boolean') && /^(evet|yes|hayir|hayır|no|var|yok|olur|olmaz|aktif|pasif)$/i.test(text.trim())) return true
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

function hasCategoryAskSignal(text: string, categories: Set<RuntimeRequiredIntakeCategory>) {
    if (!hasRequiredIntakeQuestionIntent(text)) return false

    if (categories.has('boolean') && /(misiniz|mısınız|misin|mısın|var mi|var mı|status|durum|aktif|mevcut|yes|no)/i.test(text)) return true
    if (categories.has('budget') && /(butce|bütçe|fiyat|ucret|ücret|price|budget|ne kadar)/i.test(text)) return true
    if (categories.has('timeline') && /(tarih|date|ne zaman|when|hangi gun|hangi gün|uygunluk|takvim|dogum|doğum)/i.test(text)) return true
    if (categories.has('urgency') && /(aciliyet|urgent|urgency|oncelik|öncelik)/i.test(text)) return true
    if (categories.has('contact') && /(telefon|phone|numara|number|iletisim|iletişim|contact|email|mail)/i.test(text)) return true
    if (categories.has('business_size') && /(ekibiniz|ekip|takim|takım|how many|kac kisi|kaç kişi|calisan|çalışan|personel|team)/i.test(text)) return true
    if (categories.has('callback_time') && /(geri donus|geri dönüş|callback|uygun saat|hangi saat|mesai)/i.test(text)) return true
    if (categories.has('frequency') && /(haftada|ayda|siklik|sıklık|frequency|frekans|kac seans|kaç seans)/i.test(text)) return true
    if (categories.has('level') && /(seviye|level|deneyim|experience|sinif|sınıf)/i.test(text)) return true
    if (categories.has('goal') && /(hedef|amac|amaç|goal|outcome)/i.test(text)) return true
    if (categories.has('service') && /(hizmet|service|paket|package|talep|ihtiyac|ihtiyaç|problem|konu)/i.test(text)) return true

    return false
}

function isLikelyInformativeSemanticReply(text: string) {
    if (!text) return false
    if (hasSoftDeflectionSignal(text)) return false

    if (
        hasBudgetSignal(text)
        || hasTimelineSignal(text)
        || hasUrgencyValueSignal(text)
        || hasServiceSignal(text)
        || hasContactSignal(text)
        || hasBusinessSizeSignal(text)
        || hasFrequencySignal(text)
        || hasLevelSignal(text)
        || hasGoalSignal(text)
    ) {
        return true
    }

    const tokens = tokenize(text)
    if (tokens.length < 4) return false
    if (hasRequiredIntakeQuestionIntent(text) && tokens.length <= 6) return false
    if (/^(merhaba|selam|tamam|olur|tesekkur|teşekkür|evet|hayir|hayır)\b/i.test(text)) return false

    return true
}

function isFieldSpecificRefusal(
    normalizedCustomerMessage: string,
    matcher: RuntimeRequiredIntakeFieldMatcher
) {
    if (!hasRefusalSignal(normalizedCustomerMessage) && !hasSoftDeflectionSignal(normalizedCustomerMessage)) {
        return false
    }

    return (
        messageMentionsField(matcher.field, normalizedCustomerMessage)
        || textContainsAny(normalizedCustomerMessage, matcher.keywords)
    )
}

function normalizedFieldMap(input?: Record<string, string>) {
    const map = new Map<string, string>()
    if (!input) return map

    for (const [field, value] of Object.entries(input)) {
        const trimmedField = field.trim()
        const trimmedValue = value.trim()
        if (!trimmedField || !trimmedValue) continue
        map.set(normalizeText(trimmedField), trimmedValue)
    }

    return map
}

function findUniqueQuestionCandidate(
    question: string,
    states: Array<{
        matcher: RuntimeRequiredIntakeFieldMatcher
        asked: boolean
        fulfilled: boolean
        deferred: boolean
        blocked: boolean
        inferredValue: string | null
    }>
) {
    const candidates = states.filter((state) => (
        !state.fulfilled
        && !state.blocked
        && (
            messageMentionsField(state.matcher.field, question)
            || hasCategoryAskSignal(question, state.matcher.categories)
        )
    ))

    if (candidates.length !== 1) return null
    return candidates[0] ?? null
}

export function analyzeRuntimeRequiredIntake(input: {
    requiredFields: string[]
    recentAssistantMessages?: string[]
    recentCustomerMessages?: string[]
    persistedCollectedFields?: Record<string, string>
}) {
    const requiredFields = normalizeIntakeFields(input.requiredFields ?? [])
    const persistedCollectedFields = normalizedFieldMap(input.persistedCollectedFields)
    const assistantMessages = (input.recentAssistantMessages ?? [])
        .map((message) => message.trim())
        .filter(Boolean)
        .slice(-3)
    const customerMessages = (input.recentCustomerMessages ?? [])
        .map((message) => message.trim())
        .filter(Boolean)
        .slice(-8)

    const states = requiredFields.map((field) => {
        const matcher = buildFieldMatcher(field)
        const persistedValue = persistedCollectedFields.get(normalizeText(field)) ?? null

        return {
            matcher,
            asked: false,
            fulfilled: Boolean(persistedValue),
            deferred: false,
            blocked: Boolean(persistedValue),
            inferredValue: persistedValue
        }
    })

    for (const assistantMessage of assistantMessages) {
        if (!hasRequiredIntakeQuestionIntent(assistantMessage)) continue

        for (const state of states) {
            if (
                messageMentionsField(state.matcher.field, assistantMessage)
                || hasCategoryAskSignal(assistantMessage, state.matcher.categories)
            ) {
                state.asked = true
            }
        }
    }

    for (const customerMessage of customerMessages) {
        const normalizedCustomerMessage = normalizeText(customerMessage)
        if (!normalizedCustomerMessage) continue

        for (const state of states) {
            if (state.fulfilled) continue

            if (isFieldSpecificRefusal(normalizedCustomerMessage, state.matcher)) {
                state.deferred = true
                state.blocked = true
                continue
            }

            if (hasRequiredIntakeQuestionIntent(customerMessage)) continue

            const explicitFieldMatch = messageMentionsField(state.matcher.field, customerMessage)
            const categoryValueMatch = hasCategoryValueSignal(normalizedCustomerMessage, state.matcher.categories)
            if (!explicitFieldMatch && !categoryValueMatch) continue

            const sharedCategoryCount = states.filter((candidate) => (
                candidate.matcher.categories.size > 0
                && Array.from(candidate.matcher.categories).some((category) => state.matcher.categories.has(category))
            )).length
            const canUseCategoryMatch = explicitFieldMatch || sharedCategoryCount === 1

            if (!canUseCategoryMatch) continue

            state.fulfilled = true
            state.blocked = true
            state.inferredValue = customerMessage
        }
    }

    const latestAssistantQuestion = [...assistantMessages]
        .reverse()
        .find((message) => hasRequiredIntakeQuestionIntent(message))
    const latestCustomerMessage = customerMessages[customerMessages.length - 1] ?? ''
    if (latestAssistantQuestion && latestCustomerMessage && isLikelyInformativeSemanticReply(latestCustomerMessage)) {
        const uniqueCandidate = findUniqueQuestionCandidate(latestAssistantQuestion, states)
        if (
            uniqueCandidate
            && !uniqueCandidate.fulfilled
            && hasCategoryValueSignal(normalizeText(latestCustomerMessage), uniqueCandidate.matcher.categories)
        ) {
            uniqueCandidate.fulfilled = true
            uniqueCandidate.blocked = true
            uniqueCandidate.inferredValue = latestCustomerMessage
        }
    }

    const lastTwoCustomerMessages = customerMessages.slice(-2)
    const noProgressStreak = lastTwoCustomerMessages.length >= 2
        && lastTwoCustomerMessages.every((message) => (
            hasRefusalSignal(message) || hasNoProgressSignal(message)
        ))

    if (noProgressStreak) {
        for (const state of states) {
            if (state.fulfilled || !state.asked) continue
            state.deferred = true
            state.blocked = true
        }
    }

    return states.map((state): RuntimeRequiredIntakeFieldState => ({
        field: state.matcher.field,
        asked: state.asked,
        fulfilled: state.fulfilled,
        deferred: state.deferred,
        blocked: state.blocked,
        inferredValue: state.inferredValue
    }))
}

export function doesAssistantMessageTargetRequiredField(field: string, message: string) {
    const [state] = analyzeRuntimeRequiredIntake({
        requiredFields: [field],
        recentAssistantMessages: [message],
        recentCustomerMessages: []
    })

    return state?.asked ?? false
}
