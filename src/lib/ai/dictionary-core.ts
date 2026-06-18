export interface OrganizationAiDictionaryEntry {
    id: string
    organization_id: string
    term: string
    normalized_term: string
    meanings: string[]
    enabled: boolean
    created_at: string
    updated_at: string
}

export interface AiDictionaryDraftEntry {
    id?: string
    term: string
    meanings: string[]
    enabled: boolean
}

const MAX_DICTIONARY_ENTRIES = 120
const MAX_TERM_LENGTH = 80
const MAX_MEANING_LENGTH = 180
const MAX_CONTEXT_CHARS = 4000

export function normalizeAiDictionaryTerm(value: string) {
    const term = value
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_TERM_LENGTH)
    return /^[\x00-\x7F]+$/.test(term)
        ? term.toLowerCase()
        : term.toLocaleLowerCase('tr-TR')
}

export function normalizeAiDictionaryMeanings(values: string[]) {
    const seen = new Set<string>()
    const meanings: string[] = []

    for (const value of values) {
        const meaning = value
            .normalize('NFKC')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, MAX_MEANING_LENGTH)
        const key = meaning.toLocaleLowerCase('tr-TR')
        if (!meaning || seen.has(key)) continue
        seen.add(key)
        meanings.push(meaning)
    }

    return meanings
}

export function sanitizeAiDictionaryEntries(entries: AiDictionaryDraftEntry[]) {
    const byTerm = new Map<string, {
        term: string
        normalized_term: string
        meanings: string[]
        enabled: boolean
    }>()

    for (const entry of entries.slice(0, MAX_DICTIONARY_ENTRIES)) {
        const normalizedTerm = normalizeAiDictionaryTerm(entry.term)
        const meanings = normalizeAiDictionaryMeanings(entry.meanings)
        if (!normalizedTerm || meanings.length === 0) continue
        byTerm.set(normalizedTerm, {
            term: entry.term.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, MAX_TERM_LENGTH),
            normalized_term: normalizedTerm,
            meanings,
            enabled: entry.enabled !== false,
        })
    }

    return Array.from(byTerm.values())
}

export function formatAiDictionaryContext(entries: OrganizationAiDictionaryEntry[]) {
    const lines = entries
        .filter((entry) => entry.enabled)
        .map((entry) => {
            const term = normalizeAiDictionaryTerm(entry.term)
            const meanings = normalizeAiDictionaryMeanings(entry.meanings)
            if (!term || meanings.length === 0) return ''
            return `${term} => ${meanings.join(' | ')}`
        })
        .filter(Boolean)

    return lines.join('\n').slice(0, MAX_CONTEXT_CHARS).trim()
}
