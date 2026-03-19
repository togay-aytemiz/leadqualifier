type MediaPreviewLabelMap = {
    image: string
    document: string
    audio: string
    video: string
    sticker: string
    media: string
}

export type InboxMessageMediaType = 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'unknown'

export interface InboxMessageMedia {
    type: InboxMessageMediaType
    url: string | null
    fileName: string | null
    mimeType: string | null
    caption: string | null
    isPlaceholder: boolean
    downloadStatus: string | null
}

function isUnsupportedInstagramAttachmentContent(content: string | null | undefined) {
    if (typeof content !== 'string') return false
    const normalized = content.trim().toLowerCase()
    return normalized.startsWith('[instagram attachment')
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toNullableString(value: unknown) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function parseMetadata(metadata: unknown) {
    if (typeof metadata === 'string') {
        const trimmed = metadata.trim()
        if (!trimmed) return null
        try {
            const parsed = JSON.parse(trimmed)
            return isRecord(parsed) ? parsed : null
        } catch {
            return null
        }
    }

    if (!isRecord(metadata)) return null
    return metadata
}

function resolveInstagramEventType(metadata: unknown) {
    const parsed = parseMetadata(metadata)
    if (!parsed) return null
    return toNullableString(parsed.instagram_event_type)?.toLowerCase() ?? null
}

function shouldUseUnsupportedInstagramAttachmentFallback(
    content: string | null | undefined,
    metadata: unknown
) {
    if (extractMediaFromMessageMetadata(metadata)) return false
    if (!isUnsupportedInstagramAttachmentContent(content)) return false
    return resolveInstagramEventType(metadata) === 'attachment'
}

function normalizeMediaType(value: unknown): InboxMessageMediaType {
    if (value === 'image') return 'image'
    if (value === 'document') return 'document'
    if (value === 'audio') return 'audio'
    if (value === 'video') return 'video'
    if (value === 'sticker') return 'sticker'
    return 'unknown'
}

function resolvePreviewLabel(mediaType: InboxMessageMediaType, labels: MediaPreviewLabelMap) {
    if (mediaType === 'image') return labels.image
    if (mediaType === 'document') return labels.document
    if (mediaType === 'audio') return labels.audio
    if (mediaType === 'video') return labels.video
    if (mediaType === 'sticker') return labels.sticker
    return labels.media
}

export function extractMediaFromMessageMetadata(metadata: unknown): InboxMessageMedia | null {
    const parsedMetadata = parseMetadata(metadata)
    if (!parsedMetadata) return null

    const whatsappMediaNode = isRecord(parsedMetadata.whatsapp_media) ? parsedMetadata.whatsapp_media : null
    const instagramMediaNode = isRecord(parsedMetadata.instagram_media) ? parsedMetadata.instagram_media : null
    const mediaNode = whatsappMediaNode || instagramMediaNode
    if (!mediaNode) return null

    const isPlaceholder = parsedMetadata.whatsapp_is_media_placeholder === true
        || parsedMetadata.instagram_is_media_placeholder === true

    return {
        type: normalizeMediaType(mediaNode.type),
        url: toNullableString(mediaNode.storage_url),
        fileName: toNullableString(mediaNode.filename),
        mimeType: toNullableString(mediaNode.mime_type),
        caption: toNullableString(mediaNode.caption),
        isPlaceholder,
        downloadStatus: toNullableString(mediaNode.download_status)
    }
}

export function resolveMessagePreviewContent(args: {
    content: string | null | undefined
    metadata: unknown
    fallbackNoMessage: string
    unsupportedInstagramAttachment?: string
    labels: MediaPreviewLabelMap
}) {
    const media = extractMediaFromMessageMetadata(args.metadata)
    if (media) {
        return resolvePreviewLabel(media.type, args.labels)
    }

    if (
        args.unsupportedInstagramAttachment &&
        shouldUseUnsupportedInstagramAttachmentFallback(args.content, args.metadata)
    ) {
        return args.unsupportedInstagramAttachment
    }

    const normalized = typeof args.content === 'string' ? args.content.trim() : ''
    if (normalized.length > 0) return args.content as string
    return args.fallbackNoMessage
}

export function resolveVisibleMessageContent(args: {
    content: string | null | undefined
    metadata: unknown
    fallbackUnsupportedInstagramAttachment?: string
}) {
    if (
        args.fallbackUnsupportedInstagramAttachment &&
        shouldUseUnsupportedInstagramAttachmentFallback(args.content, args.metadata)
    ) {
        return args.fallbackUnsupportedInstagramAttachment
    }

    return typeof args.content === 'string' ? args.content : ''
}

export function collectOptimisticPreviewUrls(messages: Array<{ metadata?: unknown }>) {
    const urls = new Set<string>()

    for (const message of messages) {
        const media = extractMediaFromMessageMetadata(message.metadata)
        if (!media?.url) continue
        if (!media.url.startsWith('blob:')) continue
        urls.add(media.url)
    }

    return Array.from(urls)
}
