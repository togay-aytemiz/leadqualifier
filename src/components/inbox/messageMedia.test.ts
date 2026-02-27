import { describe, expect, it } from 'vitest'
import {
    extractMediaFromMessageMetadata,
    resolveMessagePreviewContent
} from './messageMedia'

describe('extractMediaFromMessageMetadata', () => {
    it('extracts media details from metadata object', () => {
        const media = extractMediaFromMessageMetadata({
            whatsapp_media: {
                type: 'image',
                storage_url: 'https://cdn.example.com/image.jpg',
                mime_type: 'image/jpeg',
                caption: 'Burası fotoğraf',
                download_status: 'stored'
            },
            whatsapp_is_media_placeholder: true
        })

        expect(media).toEqual({
            type: 'image',
            url: 'https://cdn.example.com/image.jpg',
            fileName: null,
            mimeType: 'image/jpeg',
            caption: 'Burası fotoğraf',
            isPlaceholder: true,
            downloadStatus: 'stored'
        })
    })

    it('parses metadata when realtime payload provides JSON as string', () => {
        const media = extractMediaFromMessageMetadata('{"whatsapp_media":{"type":"document","storage_url":"https://cdn.example.com/file.pdf","filename":"fiyat.pdf"}}')

        expect(media).toEqual({
            type: 'document',
            url: 'https://cdn.example.com/file.pdf',
            fileName: 'fiyat.pdf',
            mimeType: null,
            caption: null,
            isPlaceholder: false,
            downloadStatus: null
        })
    })

    it('returns null when no whatsapp media metadata exists', () => {
        expect(extractMediaFromMessageMetadata({})).toBeNull()
        expect(extractMediaFromMessageMetadata(null)).toBeNull()
    })
})

describe('resolveMessagePreviewContent', () => {
    it('uses localized media preview when media metadata exists', () => {
        const preview = resolveMessagePreviewContent({
            content: '[WhatsApp image]',
            metadata: {
                whatsapp_media: {
                    type: 'image'
                },
                whatsapp_is_media_placeholder: true
            },
            fallbackNoMessage: 'No messages yet',
            labels: {
                image: 'Image received',
                document: 'Document received',
                audio: 'Audio received',
                video: 'Video received',
                sticker: 'Sticker received',
                media: 'Media received'
            }
        })

        expect(preview).toBe('Image received')
    })

    it('falls back to text content when no media metadata exists', () => {
        const preview = resolveMessagePreviewContent({
            content: 'Merhaba',
            metadata: {},
            fallbackNoMessage: 'No messages yet',
            labels: {
                image: 'Image received',
                document: 'Document received',
                audio: 'Audio received',
                video: 'Video received',
                sticker: 'Sticker received',
                media: 'Media received'
            }
        })

        expect(preview).toBe('Merhaba')
    })
})
