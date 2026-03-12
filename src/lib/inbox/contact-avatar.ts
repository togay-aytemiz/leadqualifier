function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readTrimmedString(value: unknown) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function normalizeAbsoluteUrl(value: unknown) {
    const trimmed = readTrimmedString(value)
    if (!trimmed) return null
    if (!/^https?:\/\//i.test(trimmed)) return null
    return trimmed
}

function parseMessageMetadataRecord(metadata: unknown) {
    if (isRecord(metadata)) return metadata
    if (typeof metadata !== 'string') return null

    const trimmed = metadata.trim()
    if (!trimmed) return null

    try {
        const parsed = JSON.parse(trimmed)
        return isRecord(parsed) ? parsed : null
    } catch {
        return null
    }
}

export function extractSocialContactAvatarUrl(metadata: unknown) {
    const record = parseMessageMetadataRecord(metadata)
    if (!record) return null

    return normalizeAbsoluteUrl(record.instagram_contact_avatar_url)
        || normalizeAbsoluteUrl(record.telegram_contact_avatar_url)
        || normalizeAbsoluteUrl(record.contact_avatar_url)
}

export function resolveConversationContactAvatarUrl(
    currentAvatarUrl: unknown,
    messages: Array<{ metadata?: unknown }> | null | undefined
) {
    const existingAvatarUrl = normalizeAbsoluteUrl(currentAvatarUrl)
    if (existingAvatarUrl) return existingAvatarUrl

    for (const message of messages ?? []) {
        const metadataAvatarUrl = extractSocialContactAvatarUrl(message?.metadata)
        if (metadataAvatarUrl) return metadataAvatarUrl
    }

    return null
}
