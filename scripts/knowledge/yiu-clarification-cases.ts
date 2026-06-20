export type ClarificationCase = {
    id: string
    firstMessage: string
    shortReply: string
    expectedSubject: string
    expectedFacet: string
    rationale: string
}

export type ClarificationFlowStatus =
    | 'resolved'
    | 'first_not_clarification'
    | 'repeated_clarification'
    | 'second_unresolved'
    | 'error'

export type FileSearchTerminalRoute = 'rag_clarify' | 'rag_refuse' | 'rag_no_info'
export type FileSearchFailureRoute = 'rag_pipeline_error'

const GENERIC_ACCEPTANCE_PATTERN = /^(?:evet|olur|tamam|peki|devam(?:\s+et)?|anlad[ıi]m|tabii|lütfen)(?:[.!?\s]*)$/i

function requiredString(record: Record<string, unknown>, key: keyof ClarificationCase, index: number) {
    const value = record[key]
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`Clarification case ${index + 1} requires ${key}`)
    }
    return value.trim()
}

export function validateClarificationCases(value: unknown, expectedCount = 20): ClarificationCase[] {
    if (!Array.isArray(value) || value.length !== expectedCount) {
        throw new Error(`Clarification fixture must contain exactly ${expectedCount} cases`)
    }

    const cases = value.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error(`Clarification case ${index + 1} must be an object`)
        }
        const record = entry as Record<string, unknown>
        const parsed: ClarificationCase = {
            id: requiredString(record, 'id', index),
            firstMessage: requiredString(record, 'firstMessage', index),
            shortReply: requiredString(record, 'shortReply', index),
            expectedSubject: requiredString(record, 'expectedSubject', index),
            expectedFacet: requiredString(record, 'expectedFacet', index),
            rationale: requiredString(record, 'rationale', index)
        }
        if (GENERIC_ACCEPTANCE_PATTERN.test(parsed.shortReply)) {
            throw new Error(`Clarification case ${parsed.id} requires a slot-only short reply`)
        }
        if (parsed.shortReply.length > 80) {
            throw new Error(`Clarification case ${parsed.id} short reply must be 80 characters or fewer`)
        }
        return parsed
    })

    if (new Set(cases.map((entry) => entry.id)).size !== cases.length) {
        throw new Error('Clarification case ids must be unique')
    }

    return cases
}

export function classifyClarificationFlow(input: {
    firstRoute: string
    firstError: string | null
    secondRoute: string | null
    secondError: string | null
}): ClarificationFlowStatus {
    if (input.firstError || input.secondError || input.firstRoute === 'rag_pipeline_error') return 'error'
    if (input.firstRoute !== 'rag_clarify') return 'first_not_clarification'
    if (input.secondRoute === 'rag_clarify') return 'repeated_clarification'
    if (input.secondRoute === 'skill_answered'
        || input.secondRoute === 'rag_grounded_answer'
        || input.secondRoute === 'rag_direct_answer'
        || input.secondRoute === 'rag_no_info'
        || input.secondRoute === 'rag_refuse') {
        return 'resolved'
    }
    return 'second_unresolved'
}

export function routeFromFileSearchAnswerStatus(value: unknown): FileSearchTerminalRoute | null {
    if (value === 'clarify') return 'rag_clarify'
    if (value === 'refuse') return 'rag_refuse'
    if (value === 'no_info') return 'rag_no_info'
    return null
}

export function routeFromFileSearchFailureReason(value: unknown): FileSearchFailureRoute | null {
    return typeof value === 'string' && value.trim() ? 'rag_pipeline_error' : null
}
