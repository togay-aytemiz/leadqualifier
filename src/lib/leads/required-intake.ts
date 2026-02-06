import { normalizeIntakeFields } from '@/lib/leads/offering-profile-utils'

const COMBINING_MARKS = /[\u0300-\u036f]/g

function normalizeFieldKey(value: string) {
    return value
        .trim()
        .replace(/\s+/g, ' ')
        .normalize('NFKD')
        .replace(COMBINING_MARKS, '')
        .toLowerCase()
}

function normalizeCollectedValue(value: unknown): string | null {
    if (typeof value === 'string') {
        const normalized = value.trim()
        return normalized || null
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value)
    }
    if (Array.isArray(value)) {
        const normalized = value
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean)
        return normalized.length > 0 ? normalized.join(', ') : null
    }
    return null
}

function normalizeCollectedMap(raw: unknown) {
    const map = new Map<string, string>()
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return map

    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const normalizedKey = normalizeFieldKey(key)
        if (!normalizedKey) continue
        const normalizedValue = normalizeCollectedValue(value)
        if (!normalizedValue) continue
        map.set(normalizedKey, normalizedValue)
    }

    return map
}

function inferFallbackValue(options: {
    field: string
    serviceType?: string | null
    extractedFields?: Record<string, unknown> | null
}) {
    const normalizedField = normalizeFieldKey(options.field)
    const extracted = options.extractedFields ?? {}
    const desiredDate = normalizeCollectedValue(extracted.desired_date)
    const location = normalizeCollectedValue(extracted.location)
    const budgetSignals = normalizeCollectedValue(extracted.budget_signals)
    const serviceType = normalizeCollectedValue(options.serviceType ?? extracted.service_type)

    const dateHints = ['tarih', 'date', 'gun', 'gün', 'zaman', 'time']
    const locationHints = ['konum', 'lokasyon', 'adres', 'yer', 'location', 'sehir', 'şehir', 'ilce', 'ilçe', 'il']
    const budgetHints = ['butce', 'bütçe', 'ucret', 'ücret', 'fiyat', 'price', 'odeme', 'ödeme']
    const serviceHints = ['hizmet', 'service', 'cekim', 'çekim', 'paket']

    if (dateHints.some((hint) => normalizedField.includes(normalizeFieldKey(hint)))) {
        return desiredDate
    }
    if (locationHints.some((hint) => normalizedField.includes(normalizeFieldKey(hint)))) {
        return location
    }
    if (budgetHints.some((hint) => normalizedField.includes(normalizeFieldKey(hint)))) {
        return budgetSignals
    }
    if (serviceHints.some((hint) => normalizedField.includes(normalizeFieldKey(hint)))) {
        return serviceType
    }

    return null
}

export function resolveCollectedRequiredIntake(options: {
    requiredFields: string[]
    extractedFields?: Record<string, unknown> | null
    serviceType?: string | null
}) {
    const requiredFields = normalizeIntakeFields(options.requiredFields ?? [])
    if (requiredFields.length === 0) return [] as Array<{ field: string; value: string }>

    const collectedMap = normalizeCollectedMap(options.extractedFields?.required_intake_collected)
    const overrideMap = normalizeCollectedMap(
        options.extractedFields?.required_intake_overrides ?? options.extractedFields?.manual_required_intake
    )

    return requiredFields
        .map((field) => {
            const normalizedField = normalizeFieldKey(field)
            const overriddenValue = overrideMap.get(normalizedField)
            const explicitValue = collectedMap.get(normalizedField)
            const fallbackValue = inferFallbackValue({
                field,
                serviceType: options.serviceType,
                extractedFields: options.extractedFields
            })
            const value = overriddenValue ?? explicitValue ?? fallbackValue
            if (!value) return null
            return { field, value }
        })
        .filter((item): item is { field: string; value: string } => Boolean(item))
}
