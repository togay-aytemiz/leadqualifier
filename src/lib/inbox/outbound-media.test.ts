import { describe, expect, it } from 'vitest'

import {
    MAX_WHATSAPP_OUTBOUND_ATTACHMENTS,
    MAX_WHATSAPP_OUTBOUND_DOCUMENT_BYTES,
    MAX_WHATSAPP_OUTBOUND_IMAGE_BYTES,
    resolveOutboundMediaCaption,
    resolveWhatsAppOutboundMediaType,
    validateWhatsAppOutboundAttachments
} from '@/lib/inbox/outbound-media'

describe('resolveWhatsAppOutboundMediaType', () => {
    it('classifies image mime types as image attachments', () => {
        expect(resolveWhatsAppOutboundMediaType('image/jpeg')).toBe('image')
        expect(resolveWhatsAppOutboundMediaType('image/png')).toBe('image')
    })

    it('classifies supported document mime types as document attachments', () => {
        expect(resolveWhatsAppOutboundMediaType('application/pdf')).toBe('document')
        expect(resolveWhatsAppOutboundMediaType('application/msword')).toBe('document')
    })

    it('returns null for unsupported mime types', () => {
        expect(resolveWhatsAppOutboundMediaType('video/mp4')).toBeNull()
    })
})

describe('validateWhatsAppOutboundAttachments', () => {
    it('returns normalized attachments for valid files', () => {
        const result = validateWhatsAppOutboundAttachments([
            {
                id: 'a-1',
                name: 'photo.jpg',
                mimeType: 'image/jpeg',
                sizeBytes: 1024
            },
            {
                id: 'a-2',
                name: 'price.pdf',
                mimeType: 'application/pdf',
                sizeBytes: 2048
            }
        ])

        expect(result).toEqual({
            ok: true,
            attachments: [
                {
                    id: 'a-1',
                    name: 'photo.jpg',
                    mimeType: 'image/jpeg',
                    mediaType: 'image',
                    sizeBytes: 1024
                },
                {
                    id: 'a-2',
                    name: 'price.pdf',
                    mimeType: 'application/pdf',
                    mediaType: 'document',
                    sizeBytes: 2048
                }
            ]
        })
    })

    it('rejects more than max attachment count', () => {
        const files = Array.from({ length: MAX_WHATSAPP_OUTBOUND_ATTACHMENTS + 1 }, (_, index) => ({
            id: `a-${index + 1}`,
            name: `f-${index + 1}.jpg`,
            mimeType: 'image/jpeg',
            sizeBytes: 1024
        }))

        const result = validateWhatsAppOutboundAttachments(files)

        expect(result).toEqual({
            ok: false,
            reason: 'too_many_attachments',
            maxCount: MAX_WHATSAPP_OUTBOUND_ATTACHMENTS
        })
    })

    it('rejects files with unsupported mime types', () => {
        const result = validateWhatsAppOutboundAttachments([
            {
                id: 'a-1',
                name: 'clip.mp4',
                mimeType: 'video/mp4',
                sizeBytes: 1024
            }
        ])

        expect(result).toEqual({
            ok: false,
            reason: 'invalid_mime_type',
            attachmentId: 'a-1'
        })
    })

    it('rejects images above WhatsApp image size limit', () => {
        const result = validateWhatsAppOutboundAttachments([
            {
                id: 'a-1',
                name: 'photo.jpg',
                mimeType: 'image/jpeg',
                sizeBytes: MAX_WHATSAPP_OUTBOUND_IMAGE_BYTES + 1
            }
        ])

        expect(result).toEqual({
            ok: false,
            reason: 'file_too_large',
            attachmentId: 'a-1',
            maxSizeBytes: MAX_WHATSAPP_OUTBOUND_IMAGE_BYTES
        })
    })

    it('rejects documents above configured document size limit', () => {
        const result = validateWhatsAppOutboundAttachments([
            {
                id: 'a-1',
                name: 'price.pdf',
                mimeType: 'application/pdf',
                sizeBytes: MAX_WHATSAPP_OUTBOUND_DOCUMENT_BYTES + 1
            }
        ])

        expect(result).toEqual({
            ok: false,
            reason: 'file_too_large',
            attachmentId: 'a-1',
            maxSizeBytes: MAX_WHATSAPP_OUTBOUND_DOCUMENT_BYTES
        })
    })
})

describe('resolveOutboundMediaCaption', () => {
    it('uses text as caption for first attachment only', () => {
        expect(resolveOutboundMediaCaption(' deneme ', 0)).toBe('deneme')
        expect(resolveOutboundMediaCaption('deneme', 1)).toBeNull()
    })

    it('returns null for blank text', () => {
        expect(resolveOutboundMediaCaption('   ', 0)).toBeNull()
    })
})
