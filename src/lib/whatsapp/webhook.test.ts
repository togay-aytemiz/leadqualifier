import { describe, expect, it } from 'vitest'

import {
    buildMetaSignature,
    extractWhatsAppInboundMessages,
    extractWhatsAppTextMessages,
    isValidMetaSignature
} from '@/lib/whatsapp/webhook'

describe('whatsapp webhook utilities', () => {
    it('validates a correct meta signature', () => {
        const rawBody = '{"entry":[{"id":"123"}]}'
        const secret = 'super-secret'
        const signature = buildMetaSignature(rawBody, secret)

        expect(isValidMetaSignature(signature, rawBody, secret)).toBe(true)
    })

    it('rejects malformed or incorrect signatures', () => {
        const rawBody = '{"entry":[{"id":"123"}]}'
        const secret = 'super-secret'

        expect(isValidMetaSignature('', rawBody, secret)).toBe(false)
        expect(isValidMetaSignature('sha256=deadbeef', rawBody, secret)).toBe(false)
    })

    it('extracts text and media events from payload', () => {
        const payload = {
            entry: [{
                changes: [{
                    value: {
                        metadata: {
                            phone_number_id: 'phone-1'
                        },
                        contacts: [{
                            wa_id: '905551112233',
                            profile: { name: 'Ayse' }
                        }],
                        messages: [{
                            from: '905551112233',
                            id: 'wamid-1',
                            timestamp: '1738000000',
                            type: 'text',
                            text: {
                                body: 'Merhaba'
                            }
                        }, {
                            from: '905551112233',
                            id: 'wamid-2',
                            timestamp: '1738000001',
                            type: 'image',
                            image: {
                                id: 'media-image-1',
                                mime_type: 'image/jpeg',
                                sha256: 'abc123',
                                caption: 'Fiyat listesi'
                            }
                        }, {
                            from: '905551112233',
                            id: 'wamid-3',
                            timestamp: '1738000002',
                            type: 'document',
                            document: {
                                id: 'media-doc-1',
                                mime_type: 'application/pdf',
                                sha256: 'def456',
                                filename: 'katalog.pdf'
                            }
                        }]
                    }
                }]
            }]
        }

        const events = extractWhatsAppInboundMessages(payload)

        expect(events).toEqual([
            {
                kind: 'text',
                phoneNumberId: 'phone-1',
                contactPhone: '905551112233',
                contactName: 'Ayse',
                messageId: 'wamid-1',
                text: 'Merhaba',
                timestamp: '1738000000'
            },
            {
                kind: 'media',
                phoneNumberId: 'phone-1',
                contactPhone: '905551112233',
                contactName: 'Ayse',
                messageId: 'wamid-2',
                mediaType: 'image',
                mediaId: 'media-image-1',
                mimeType: 'image/jpeg',
                sha256: 'abc123',
                caption: 'Fiyat listesi',
                filename: null,
                timestamp: '1738000001'
            },
            {
                kind: 'media',
                phoneNumberId: 'phone-1',
                contactPhone: '905551112233',
                contactName: 'Ayse',
                messageId: 'wamid-3',
                mediaType: 'document',
                mediaId: 'media-doc-1',
                mimeType: 'application/pdf',
                sha256: 'def456',
                caption: null,
                filename: 'katalog.pdf',
                timestamp: '1738000002'
            }
        ])
    })

    it('extracts only text events in text helper', () => {
        const payload = {
            entry: [{
                changes: [{
                    value: {
                        metadata: {
                            phone_number_id: 'phone-1'
                        },
                        contacts: [{
                            wa_id: '905551112233',
                            profile: { name: 'Ayse' }
                        }],
                        messages: [{
                            from: '905551112233',
                            id: 'wamid-1',
                            timestamp: '1738000000',
                            type: 'text',
                            text: {
                                body: 'Merhaba'
                            }
                        }, {
                            from: '905551112233',
                            id: 'wamid-2',
                            timestamp: '1738000001',
                            type: 'image',
                            image: {
                                id: 'media-image-1'
                            }
                        }]
                    }
                }]
            }]
        }

        const events = extractWhatsAppTextMessages(payload)

        expect(events).toEqual([{
            phoneNumberId: 'phone-1',
            contactPhone: '905551112233',
            contactName: 'Ayse',
            messageId: 'wamid-1',
            text: 'Merhaba',
            timestamp: '1738000000'
        }])
    })
})
