import type { WhatsAppMediaType } from '@/lib/whatsapp/webhook'

const MEDIA_PLACEHOLDER_BY_TYPE: Record<WhatsAppMediaType, string> = {
    image: '[WhatsApp image]',
    document: '[WhatsApp document]',
    audio: '[WhatsApp audio]',
    video: '[WhatsApp video]',
    sticker: '[WhatsApp sticker]',
    unknown: '[WhatsApp media]'
}

export function resolveWhatsAppMediaPlaceholder(mediaType: WhatsAppMediaType) {
    return MEDIA_PLACEHOLDER_BY_TYPE[mediaType] ?? MEDIA_PLACEHOLDER_BY_TYPE.unknown
}
