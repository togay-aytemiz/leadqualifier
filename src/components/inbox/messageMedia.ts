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

    const mediaNode = isRecord(parsedMetadata.whatsapp_media) ? parsedMetadata.whatsapp_media : null
    if (!mediaNode) return null

    return {
        type: normalizeMediaType(mediaNode.type),
        url: toNullableString(mediaNode.storage_url),
        fileName: toNullableString(mediaNode.filename),
        mimeType: toNullableString(mediaNode.mime_type),
        caption: toNullableString(mediaNode.caption),
        isPlaceholder: parsedMetadata.whatsapp_is_media_placeholder === true,
        downloadStatus: toNullableString(mediaNode.download_status)
    }
}

export function resolveMessagePreviewContent(args: {
    content: string | null | undefined
    metadata: unknown
    fallbackNoMessage: string
    labels: MediaPreviewLabelMap
}) {
    const media = extractMediaFromMessageMetadata(args.metadata)
    if (media) {
        return resolvePreviewLabel(media.type, args.labels)
    }

    const normalized = typeof args.content === 'string' ? args.content.trim() : ''
    if (normalized.length > 0) return args.content as string
    return args.fallbackNoMessage
}
