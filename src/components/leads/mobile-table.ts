import { resolveCollectedRequiredIntake } from '@/lib/leads/required-intake'

export const MOBILE_SUMMARY_MAX_CHARS = 88
export const MOBILE_REQUIRED_FIELDS_MAX = 2

interface LeadFieldsLike {
    extracted_fields: unknown
    service_type?: string | null
}

interface MobileRequiredFieldHint {
    field: string
    value: string
}

function asExtractedFields(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
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

export function getLeadRequiredFieldHints(
    lead: LeadFieldsLike,
    requiredFields: string[]
): MobileRequiredFieldHint[] {
    const extracted = asExtractedFields(lead.extracted_fields)
    if (!extracted) return []

    const resolved = resolveCollectedRequiredIntake({
        requiredFields,
        extractedFields: extracted,
        serviceType: lead.service_type ?? null
    })
    const resolvedMap = new Map(resolved.map((item) => [item.field, item.value]))

    return requiredFields
        .map((field) => {
            const directValue = normalizeFieldValue(extracted[field])
            const resolvedValue = resolvedMap.get(field) ?? null
            const value = directValue ?? resolvedValue
            if (!value) return null
            return { field, value }
        })
        .filter((item): item is MobileRequiredFieldHint => Boolean(item))
}

export function getLeadRequiredFieldValue(
    lead: LeadFieldsLike,
    fieldName: string
): string | null {
    const hints = getLeadRequiredFieldHints(lead, [fieldName])
    return hints[0]?.value ?? null
}

export function getMobileRequiredFieldHints(
    lead: LeadFieldsLike,
    requiredFields: string[],
    maxFields = MOBILE_REQUIRED_FIELDS_MAX
): MobileRequiredFieldHint[] {
    return getLeadRequiredFieldHints(lead, requiredFields).slice(0, maxFields)
}
