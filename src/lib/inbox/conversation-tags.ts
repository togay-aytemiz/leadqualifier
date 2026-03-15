export const MAX_CONVERSATION_TAGS = 12
export const MAX_CONVERSATION_TAG_LENGTH = 32
const COMBINING_MARKS = /[\u0300-\u036f]/g

export function normalizeConversationTags(tags: string[]) {
    const normalized: string[] = []
    const seen = new Set<string>()

    for (const rawTag of tags) {
        const trimmed = rawTag.trim()
        if (!trimmed) continue
        if (trimmed.length > MAX_CONVERSATION_TAG_LENGTH) {
            throw new Error('tag_too_long')
        }

        const dedupeKey = trimmed
            .normalize('NFKD')
            .replace(COMBINING_MARKS, '')
            .toLowerCase()
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        normalized.push(trimmed)
    }

    if (normalized.length > MAX_CONVERSATION_TAGS) {
        throw new Error('too_many_tags')
    }

    return normalized
}
