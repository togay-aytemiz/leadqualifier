import { describe, expect, it } from 'vitest'
import {
    collectOptimisticPreviewUrls,
    extractMediaFromMessageMetadata,
    resolveVisibleMessageContent,
    resolveMessagePreviewContent,
    shouldAttemptInlineImagePreview
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

    it('keeps instagram shared preview metadata when webhook persisted a preview url', () => {
        const media = extractMediaFromMessageMetadata({
            instagram_media: {
                type: 'unknown',
                original_type: 'share',
                preview_kind: 'image',
                storage_url: 'https://cdn.example.com/shared-post.jpg',
                mime_type: null,
                caption: 'Bu ilan için bilgi alabilir miyim?',
                download_status: 'remote'
            }
        })

        expect(media).toEqual({
            type: 'unknown',
            url: 'https://cdn.example.com/shared-post.jpg',
            fileName: null,
            mimeType: null,
            caption: 'Bu ilan için bilgi alabilir miyim?',
            isPlaceholder: false,
            downloadStatus: 'remote',
            originalType: 'share',
            previewKind: 'image'
        })
    })

    it('returns null when no whatsapp media metadata exists', () => {
        expect(extractMediaFromMessageMetadata({})).toBeNull()
        expect(extractMediaFromMessageMetadata(null)).toBeNull()
    })
})

describe('shouldAttemptInlineImagePreview', () => {
    it('allows inline preview for document media when mime type is still an image', () => {
        expect(shouldAttemptInlineImagePreview({
            type: 'document',
            url: 'https://cdn.example.com/whatsapp-forwarded-image.jpg',
            fileName: 'whatsapp-forwarded-image.jpg',
            mimeType: 'image/jpeg',
            caption: null,
            isPlaceholder: true,
            downloadStatus: 'stored'
        })).toBe(true)
    })

    it('allows inline preview for document media when the stored asset url ends with an image extension', () => {
        expect(shouldAttemptInlineImagePreview({
            type: 'document',
            url: 'https://cdn.example.com/whatsapp-forwarded-image.jpg?download=1',
            fileName: null,
            mimeType: null,
            caption: null,
            isPlaceholder: true,
            downloadStatus: 'stored'
        })).toBe(true)
    })

    it('allows inline preview for document media when only the stored filename looks like an image', () => {
        expect(shouldAttemptInlineImagePreview({
            type: 'document',
            url: 'https://storage.example.com/object/sign/whatsapp-media/signed-object',
            fileName: 'newborn-package.png',
            mimeType: null,
            caption: null,
            isPlaceholder: true,
            downloadStatus: 'stored'
        })).toBe(true)
    })

    it('allows inline preview for unknown media when mime type is still an image', () => {
        expect(shouldAttemptInlineImagePreview({
            type: 'unknown',
            url: 'https://cdn.example.com/whatsapp-image-without-type.jpg',
            fileName: null,
            mimeType: 'image/jpeg',
            caption: null,
            isPlaceholder: true,
            downloadStatus: 'stored'
        })).toBe(true)
    })

    it('allows inline preview for instagram shared media flagged as image preview', () => {
        expect(shouldAttemptInlineImagePreview({
            type: 'unknown',
            url: 'https://cdn.example.com/shared-post.jpg',
            fileName: null,
            mimeType: null,
            caption: null,
            isPlaceholder: false,
            downloadStatus: 'remote',
            previewKind: 'image',
            originalType: 'share'
        })).toBe(true)
    })

    it('allows inline preview for instagram lookaside messaging cdn urls', () => {
        expect(shouldAttemptInlineImagePreview({
            type: 'unknown',
            url: 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=18106583254871156&signature=abc123',
            fileName: null,
            mimeType: null,
            caption: null,
            isPlaceholder: false,
            downloadStatus: 'remote'
        })).toBe(true)
    })

    it('does not allow inline preview for link-only external instagram media', () => {
        expect(shouldAttemptInlineImagePreview({
            type: 'unknown',
            url: 'https://www.instagram.com/p/example/',
            fileName: null,
            mimeType: null,
            caption: null,
            isPlaceholder: false,
            downloadStatus: 'remote',
            previewKind: 'link',
            originalType: 'share'
        })).toBe(false)
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

    it('uses sent media preview labels for outbound media messages', () => {
        const mediaLabels = {
            image: 'Image received',
            document: 'Document received',
            audio: 'Audio received',
            video: 'Video received',
            sticker: 'Sticker received',
            media: 'Media received',
            imageSent: 'Image sent',
            documentSent: 'Document sent',
            audioSent: 'Audio sent',
            videoSent: 'Video sent',
            stickerSent: 'Sticker sent',
            mediaSent: 'Media sent'
        }
        const previewArgs = {
            content: '[WhatsApp image]',
            senderType: 'user',
            metadata: {
                whatsapp_media: {
                    type: 'image'
                },
                whatsapp_is_media_placeholder: true
            },
            fallbackNoMessage: 'No messages yet',
            labels: mediaLabels
        }

        expect(resolveMessagePreviewContent(previewArgs)).toBe('Image sent')
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

    it('uses localized deleted-message preview text for instagram deleted events', () => {
        const preview = resolveMessagePreviewContent({
            content: '[Instagram message deleted]',
            metadata: {
                instagram_event_type: 'message_deleted'
            },
            fallbackNoMessage: 'No messages yet',
            unsupportedInstagramAttachment: 'Open Instagram to view this content',
            instagramDeletedMessage: 'Message deleted',
            labels: {
                image: 'Image received',
                document: 'Document received',
                audio: 'Audio received',
                video: 'Video received',
                sticker: 'Sticker received',
                media: 'Media received'
            }
        })

        expect(preview).toBe('Message deleted')
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
