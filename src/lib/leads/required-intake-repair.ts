import { messageMentionsField } from '@/lib/ai/intake-field-match'
import {
    normalizeRequiredIntakeFieldKey,
    normalizeRequiredIntakeFieldValue
} from '@/lib/leads/required-intake'

type RequiredIntakeRepairInput = {
    requiredFields: string[]
    existingCollected?: Record<string, string> | null
    recentAssistantMessages?: string[]
    recentCustomerMessages?: string[]
}

type FieldCategory =
    | 'date'
    | 'boolean'
    | 'budget'
    | 'contact'
    | 'business_size'
    | 'frequency'
    | 'level'
    | 'goal'
    | 'service'
    | 'generic'

const COMBINING_MARKS = /[\u0300-\u036f]/g
const QUESTION_HINTS = [
    /\?/,
    /\b(ne zaman|hangi tarih|tarih|date|when|what day|kaç|kac|kaç kişi|kac kisi|kim|hangi|nasıl|nasil|would you|could you|can you)\b/i,
]
const DATE_VALUE_HINTS = [
    /\b\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?\b/,
    /\b(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)(?:['’]?[a-zçğıöşü]+)?\b/i,
    /\b(hemen|bugün|bugun|yarın|yarin|bugün|bu hafta|gelecek hafta|hafta sonu|ayın sonu|ay sonu|başı|basi|sonu)\b/i,
    /\b(?:\d+|bir|iki|üç|uc|dört|dort|beş|bes|altı|alti|yedi|sekiz|dokuz|on)\s*(gün|gun|hafta|ay|yıl|yil)\s*(içinde|icinde|sonra|kaldı|kaldi)?\b/i,
]
const BOOLEAN_VALUE_HINTS = [
    /^(evet|hayır|hayir|no|yes|var|yok|tabii|tabii ki|olabilir|olmaz)$/i,
    /\b(evet|hayır|hayir|var|yok)\b/i,
]
const BUDGET_VALUE_HINTS = [
    /\b\d[\d.,]*\s*(tl|₺|usd|\$|eur|€|bin|milyon)\b/i,
]
const CONTACT_VALUE_HINTS = [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /(?:\+?90|0)?\s*\d{3}\s*\d{3}\s*\d{2}\s*\d{2}/,
]
const BUSINESS_SIZE_VALUE_HINTS = [
    /\b\d+\s*(kişi|kisi|personel|çalışan|calisan|member|members|person)\b/i,
    /\b\d{1,3}\b/,
]
const FREQUENCY_VALUE_HINTS = [
    /\b(haftada|ayda|günde|gunde|gün|gun|seans|oturum|session|per week|per month)\b/i,
]
const LEVEL_VALUE_HINTS = [
    /\b(baslangic|başlangıç|orta|ileri|beginner|intermediate|advanced|seviye)\b/i,
]
const GOAL_VALUE_HINTS = [
    /\b(hedef|amac|amaç|goal|sonuc|sonuç)\b/i,
]
const FIELD_CONCEPT_GROUPS = [
    ['hamilelik', 'hamile', 'gebelik', 'pregnan', 'dogum', 'doğum', 'bebek', 'delivery', 'due']
]

function normalizeText(value: string) {
    return value
        .trim()
        .replace(/\s+/g, ' ')
        .normalize('NFKD')
        .replace(COMBINING_MARKS, '')
        .toLowerCase()
}

function tokenize(value: string) {
    return normalizeText(value)
        .split(/[^a-z0-9\u00C0-\u024F]+/i)
        .map((token) => token.trim())
        .filter(Boolean)
}

function hasQuestionIntent(value: string) {
    const normalized = normalizeText(value)
    if (!normalized) return false
    return QUESTION_HINTS.some((pattern) => pattern.test(normalized))
}

function isStrongAffirmation(value: string) {
    const normalized = normalizeText(value)
    return /^(evet|yes|tabii|tabii ki|olur|olabilir|tamam|ok|var)$/i.test(normalized)
}

function isStrongNegation(value: string) {
    const normalized = normalizeText(value)
    return /^(hayır|hayir|no|yok|olmaz|istemiyorum)$/i.test(normalized)
}

function isLikelyNonAnswer(value: string) {
    const normalized = normalizeText(value)
    if (!normalized) return true

    return /^(bilmiyorum|emin degilim|emin değilim|kararsizim|kararsızım|fark etmez|farketmez|not sure|dont know|don't know|maybe|belki|gorecegiz|göreceğiz)$/i.test(normalized)
}

function inferFieldCategory(field: string): FieldCategory {
    const normalized = normalizeText(field)
    const tokens = tokenize(normalized)
    const hasAny = (...patterns: RegExp[]) => patterns.some((pattern) => pattern.test(normalized))
    const hasToken = (...needles: string[]) => needles.some((needle) => tokens.some((token) => token.includes(needle)))

    if (hasAny(/\b(tarih|date|zaman|time|ne zaman|doğum|dogum|delivery|due)\b/i) || hasToken('tarih', 'date', 'time', 'zaman', 'dogum')) {
        return 'date'
    }
    if (hasAny(/\b(durum|status|hamilelik|pregnan|evet|hayir|hayır|yes|no)\b/i) || hasToken('durum', 'status', 'hamilelik', 'pregnan')) {
        return 'boolean'
    }
    if (hasAny(/\b(butce|bütçe|budget|price|fiyat|ucret|ücret|cost|fee)\b/i)) {
        return 'budget'
    }
    if (hasAny(/\b(telefon|email|e-posta|eposta|mail|contact|iletişim|iletisim|numara)\b/i)) {
        return 'contact'
    }
    if (hasAny(/\b(büyüklük|buyukluk|size|ekip|team|personel|çalışan|calisan|kişi|kisi)\b/i)) {
        return 'business_size'
    }
    if (hasAny(/\b(sıklık|siklik|frequency|hafta|seans|saat|per week|per month)\b/i)) {
        return 'frequency'
    }
    if (hasAny(/\b(seviye|level|beginner|intermediate|advanced|başlangıç|baslangic|ileri|orta)\b/i)) {
        return 'level'
    }
    if (hasAny(/\b(hedef|goal|amac|amaç|sonuç|sonuc)\b/i)) {
        return 'goal'
    }
    if (hasAny(/\b(hizmet|service|paket|package|talep|ihtiyaç|ihtiyac|konu|subject)\b/i)) {
        return 'service'
    }
    return 'generic'
}

function fieldMatchesAssistantQuestion(field: string, assistantMessage: string, category: FieldCategory) {
    if (!assistantMessage) return false
    if (messageMentionsField(field, assistantMessage)) return true

    const normalizedMessage = normalizeText(assistantMessage)
    if (!normalizedMessage) return false

    switch (category) {
        case 'date':
            return /\b(ne zaman|hangi tarih|tarih|date|when|zaman)\b/i.test(normalizedMessage)
        case 'boolean':
            return /\b(misiniz|mısınız|misin|mısın|hamile|pregnant|var mı|varmi|var mi|evet mi|yes)\b/i.test(normalizedMessage)
        case 'budget':
            return /\b(bütçe|butce|fiyat|ücret|ucret|budget|price|cost|fee)\b/i.test(normalizedMessage)
        case 'contact':
            return /\b(telefon|mail|email|e-posta|eposta|contact|numara)\b/i.test(normalizedMessage)
        case 'business_size':
            return /\b(kaç kişi|kac kişi|kaç kişilik|kac kisilik|ekip|team|personel|çalışan|calisan)\b/i.test(normalizedMessage)
        case 'frequency':
            return /\b(haftada|ayda|kaç seans|kac seans|frequency|sıklık|siklik)\b/i.test(normalizedMessage)
        case 'level':
            return /\b(seviye|level|başlangıç|baslangic|ileri|orta|beginner|advanced)\b/i.test(normalizedMessage)
        case 'goal':
            return /\b(hedef|amac|amaç|goal|sonuç|sonuc)\b/i.test(normalizedMessage)
        case 'service':
            return /\b(hangi hizmet|hangi paket|talep|ihtiyaç|ihtiyac|konu|service|package)\b/i.test(normalizedMessage)
        default:
            return /\b(ne|hangi|nasıl|nasil|what|which|could you|can you)\b/i.test(normalizedMessage)
    }
}

function valueMatchesCategory(category: FieldCategory, value: string) {
    if (!value) return false
    switch (category) {
        case 'date':
            return DATE_VALUE_HINTS.some((pattern) => pattern.test(value))
        case 'boolean':
            return BOOLEAN_VALUE_HINTS.some((pattern) => pattern.test(value))
        case 'budget':
            return BUDGET_VALUE_HINTS.some((pattern) => pattern.test(value))
        case 'contact':
            return CONTACT_VALUE_HINTS.some((pattern) => pattern.test(value))
        case 'business_size':
            return BUSINESS_SIZE_VALUE_HINTS.some((pattern) => pattern.test(value))
        case 'frequency':
            return FREQUENCY_VALUE_HINTS.some((pattern) => pattern.test(value))
        case 'level':
            return LEVEL_VALUE_HINTS.some((pattern) => pattern.test(value))
        case 'goal':
            return GOAL_VALUE_HINTS.some((pattern) => pattern.test(value))
        case 'service':
            return !isLikelyNonAnswer(value) && !hasQuestionIntent(value)
        default:
            return Boolean(normalizeRequiredIntakeFieldValue(value))
    }
}

function selectCandidateAssistantMessage(messages: string[], field: string, category: FieldCategory) {
    const reversed = [...messages].reverse()
    return reversed.find((message) => fieldMatchesAssistantQuestion(field, message, category)) ?? null
}

function normalizeCollectedMap(raw?: Record<string, string> | null) {
    const map = new Map<string, string>()
    for (const [key, value] of Object.entries(raw ?? {})) {
        const normalizedKey = normalizeRequiredIntakeFieldKey(key)
        const normalizedValue = normalizeRequiredIntakeFieldValue(value)
        if (!normalizedKey || !normalizedValue) continue
        map.set(normalizedKey, normalizedValue)
    }
    return map
}

function isCompatibleExistingValue(field: string, category: FieldCategory, value: string) {
    if (!value) return false
    if (category === 'generic') return true
    if (category === 'boolean') {
        return isStrongAffirmation(value)
            || isStrongNegation(value)
            || messageMentionsField(field, value)
            || /\b(aktif|mevcut|pasif)\b/i.test(value)
    }

    return valueMatchesCategory(category, value)
}

function resolveFieldConceptGroupIds(field: string) {
    const normalizedField = normalizeText(field)
    if (!normalizedField) return [] as number[]

    return FIELD_CONCEPT_GROUPS.flatMap((group, index) => (
        group.some((alias) => normalizedField.includes(normalizeText(alias))) ? [index] : []
    ))
}

function fieldsShareConcept(field: string, candidateField: string) {
    const fieldGroups = resolveFieldConceptGroupIds(field)
    if (fieldGroups.length === 0) return false

    const candidateGroups = new Set(resolveFieldConceptGroupIds(candidateField))
    return fieldGroups.some((groupId) => candidateGroups.has(groupId))
}

export function repairRequiredIntakeFromConversation(input: RequiredIntakeRepairInput) {
    const requiredFields = (input.requiredFields ?? []).map((field) => field.trim()).filter(Boolean)
    const existingCollected = input.existingCollected ?? {}
    const assistantMessages = (input.recentAssistantMessages ?? []).map((message) => message.trim()).filter(Boolean)
    const customerMessages = (input.recentCustomerMessages ?? []).map((message) => message.trim()).filter(Boolean)
    const requiredFieldByNormalizedKey = new Map(
        requiredFields.map((field) => [normalizeRequiredIntakeFieldKey(field), field] as const)
    )
    const repaired: Record<string, string> = {}

    for (const [key, value] of Object.entries(existingCollected)) {
        const normalizedValue = normalizeRequiredIntakeFieldValue(value)
        if (!normalizedValue) continue

        const normalizedKey = normalizeRequiredIntakeFieldKey(key)
        const requiredField = requiredFieldByNormalizedKey.get(normalizedKey)

        if (!requiredField) {
            repaired[key] = normalizedValue
            continue
        }

        const category = inferFieldCategory(requiredField)
        if (!isCompatibleExistingValue(requiredField, category, normalizedValue)) {
            continue
        }

        repaired[requiredField] = normalizedValue
    }

    const repairedCollectedMap = normalizeCollectedMap(repaired)

    if (customerMessages.length === 0 || assistantMessages.length === 0) {
        return repaired
    }

    for (const field of requiredFields) {
        const normalizedField = normalizeRequiredIntakeFieldKey(field)
        if (!normalizedField || repairedCollectedMap.has(normalizedField)) continue

        const category = inferFieldCategory(field)
        const assistantMessage = selectCandidateAssistantMessage(assistantMessages, field, category)
        if (!assistantMessage) continue

        const answer = [...customerMessages]
            .reverse()
            .map((message) => normalizeRequiredIntakeFieldValue(message))
            .find((candidate): candidate is string => {
                if (!candidate) return false

                if (category === 'boolean') {
                    return isStrongAffirmation(candidate) || isStrongNegation(candidate)
                }

                if (valueMatchesCategory(category, candidate)) {
                    return true
                }

                return category === 'generic' && hasQuestionIntent(assistantMessage)
            })
        if (!answer) continue

        repaired[field] = answer
        repairedCollectedMap.set(normalizedField, answer)
    }

    for (const field of requiredFields) {
        const normalizedField = normalizeRequiredIntakeFieldKey(field)
        if (!normalizedField || repairedCollectedMap.has(normalizedField)) continue

        const category = inferFieldCategory(field)
        if (category !== 'boolean') continue

        const hasSupportingSiblingEvidence = requiredFields.some((candidateField) => {
            if (candidateField === field) return false
            if (!fieldsShareConcept(field, candidateField)) return false

            const candidateValue = repaired[candidateField]
            if (!candidateValue) return false

            return inferFieldCategory(candidateField) !== 'boolean'
        })

        if (!hasSupportingSiblingEvidence) continue

        repaired[field] = 'Evet'
        repairedCollectedMap.set(normalizedField, 'Evet')
    }

    return repaired
}
