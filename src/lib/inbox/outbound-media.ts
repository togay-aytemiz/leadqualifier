export const MAX_WHATSAPP_OUTBOUND_ATTACHMENTS = 10
export const MAX_WHATSAPP_OUTBOUND_IMAGE_BYTES = 5 * 1024 * 1024
// NOTE: Kept in sync with whatsapp-media bucket file_size_limit.
export const MAX_WHATSAPP_OUTBOUND_DOCUMENT_BYTES = 15 * 1024 * 1024

const WHATSAPP_IMAGE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
])

const WHATSAPP_DOCUMENT_MIME_TYPES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
])

export type WhatsAppOutboundMediaType = 'image' | 'document'

export interface WhatsAppOutboundAttachmentDraft {
    id: string
    name: string
    mimeType: string
    sizeBytes: number
}

export interface WhatsAppOutboundAttachment extends WhatsAppOutboundAttachmentDraft {
    mediaType: WhatsAppOutboundMediaType
}

type OutboundAttachmentValidationFailure =
    | {
        ok: false
        reason: 'too_many_attachments'
        maxCount: number
    }
    | {
        ok: false
        reason: 'invalid_mime_type'
        attachmentId: string
    }
    | {
        ok: false
        reason: 'file_too_large'
        attachmentId: string
        maxSizeBytes: number
    }

type OutboundAttachmentValidationSuccess = {
    ok: true
    attachments: WhatsAppOutboundAttachment[]
}

export type OutboundAttachmentValidationResult =
    | OutboundAttachmentValidationSuccess
    | OutboundAttachmentValidationFailure

function normalizeMimeType(value: string) {
    return value.trim().toLowerCase()
}

export function resolveWhatsAppOutboundMediaType(mimeType: string): WhatsAppOutboundMediaType | null {
    const normalizedMimeType = normalizeMimeType(mimeType)
    if (WHATSAPP_IMAGE_MIME_TYPES.has(normalizedMimeType)) return 'image'
    if (WHATSAPP_DOCUMENT_MIME_TYPES.has(normalizedMimeType)) return 'document'
    return null
}

function resolveMaxSizeBytes(mediaType: WhatsAppOutboundMediaType) {
    return mediaType === 'image'
        ? MAX_WHATSAPP_OUTBOUND_IMAGE_BYTES
        : MAX_WHATSAPP_OUTBOUND_DOCUMENT_BYTES
}

export function validateWhatsAppOutboundAttachments(
    attachments: WhatsAppOutboundAttachmentDraft[]
): OutboundAttachmentValidationResult {
    if (attachments.length > MAX_WHATSAPP_OUTBOUND_ATTACHMENTS) {
        return {
            ok: false,
            reason: 'too_many_attachments',
            maxCount: MAX_WHATSAPP_OUTBOUND_ATTACHMENTS
        }
    }

    const normalized: WhatsAppOutboundAttachment[] = []

    for (const attachment of attachments) {
        const mediaType = resolveWhatsAppOutboundMediaType(attachment.mimeType)
        if (!mediaType) {
            return {
                ok: false,
                reason: 'invalid_mime_type',
                attachmentId: attachment.id
            }
        }

        const maxSizeBytes = resolveMaxSizeBytes(mediaType)
        if (attachment.sizeBytes > maxSizeBytes) {
            return {
                ok: false,
                reason: 'file_too_large',
                attachmentId: attachment.id,
                maxSizeBytes
            }
        }

        normalized.push({
            ...attachment,
            mediaType
        })
    }

    return {
        ok: true,
        attachments: normalized
    }
}

export function resolveOutboundMediaCaption(messageText: string, attachmentIndex: number) {
    if (attachmentIndex !== 0) return null
    const normalized = messageText.trim()
    return normalized.length > 0 ? normalized : null
}
