export const MOBILE_SUMMARY_MAX_CHARS = 88
export const MOBILE_REQUIRED_FIELDS_MAX = 2

interface LeadFieldsLike {
    extracted_fields: unknown
}

interface MobileRequiredFieldHint {
    field: string
    value: string
}

function normalizeFieldValue(value: unknown): string | null {
    if (typeof value === 'string') {
        const normalized = value.trim()
        return normalized ? normalized : null
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value)
    }

    return null
}

export function truncateForMobileSummary(summary: string | null | undefined, maxChars = MOBILE_SUMMARY_MAX_CHARS): string {
    const normalized = summary?.trim() ?? ''
    if (!normalized) return '-'
    if (normalized.length <= maxChars) return normalized
    return `${normalized.slice(0, maxChars - 1).trimEnd()}…`
}

export function getMobileRequiredFieldHints(
    lead: LeadFieldsLike,
    requiredFields: string[],
    maxFields = MOBILE_REQUIRED_FIELDS_MAX
): MobileRequiredFieldHint[] {
    if (!lead.extracted_fields || typeof lead.extracted_fields !== 'object') return []

    const extracted = lead.extracted_fields as Record<string, unknown>
    const hints: MobileRequiredFieldHint[] = []

    for (const field of requiredFields) {
        const value = normalizeFieldValue(extracted[field])
        if (!value) continue
        hints.push({ field, value })
        if (hints.length >= maxFields) break
    }

    return hints
}
