import { describe, expect, it } from 'vitest'
import {
    collectOptimisticPreviewUrls,
    extractMediaFromMessageMetadata,
    resolveVisibleMessageContent,
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

    it('extracts instagram media details from metadata object', () => {
        const media = extractMediaFromMessageMetadata({
            instagram_media: {
                type: 'image',
                storage_url: 'https://cdn.example.com/instagram-image.jpg',
                mime_type: 'image/jpeg',
                caption: null,
                download_status: 'remote'
            },
            instagram_is_media_placeholder: true
        })

        expect(media).toEqual({
            type: 'image',
            url: 'https://cdn.example.com/instagram-image.jpg',
            fileName: null,
            mimeType: 'image/jpeg',
            caption: null,
            isPlaceholder: true,
            downloadStatus: 'remote'
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
            unsupportedInstagramAttachment: 'Open Instagram to view this content',
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

    it('uses unsupported instagram fallback text for non-previewable instagram attachments', () => {
        const preview = resolveMessagePreviewContent({
            content: '[Instagram attachment: share]',
            metadata: {
                instagram_event_type: 'attachment'
            },
            fallbackNoMessage: 'No messages yet',
            unsupportedInstagramAttachment: 'Open Instagram to view this content',
            labels: {
                image: 'Image received',
                document: 'Document received',
                audio: 'Audio received',
                video: 'Video received',
                sticker: 'Sticker received',
                media: 'Media received'
            }
        })

        expect(preview).toBe('Open Instagram to view this content')
    })
})

describe('resolveVisibleMessageContent', () => {
    it('uses friendly fallback text for unsupported instagram attachments', () => {
        const content = resolveVisibleMessageContent({
            content: '[Instagram attachment: share]',
            metadata: {
                instagram_event_type: 'attachment'
            },
            fallbackUnsupportedInstagramAttachment:
                'This Instagram content cannot be previewed in Qualy yet. Open Instagram to view it.'
        })

        expect(content).toBe(
            'This Instagram content cannot be previewed in Qualy yet. Open Instagram to view it.'
        )
    })
})

describe('collectOptimisticPreviewUrls', () => {
    it('collects blob preview urls only for sending media messages', () => {
        const previewUrls = collectOptimisticPreviewUrls([
            {
                metadata: {
                    instagram_media: {
                        type: 'image',
                        storage_url: 'blob:instagram-preview-1',
                        download_status: 'sending'
                    },
                    instagram_outbound_status: 'sending'
                }
            },
            {
                metadata: {
                    whatsapp_media: {
                        type: 'image',
                        storage_url: 'https://cdn.example.com/stored.jpg',
                        download_status: 'stored'
                    }
                }
            },
            {
                metadata: {
                    whatsapp_media: {
                        type: 'image',
                        storage_url: 'blob:whatsapp-preview-2',
                        download_status: 'sending'
                    },
                    whatsapp_outbound_status: 'sending'
                }
            }
        ])

        expect(previewUrls).toEqual([
            'blob:instagram-preview-1',
            'blob:whatsapp-preview-2'
        ])
    })
})
