import { describe, expect, it } from 'vitest'

import {
    buildMetaSignature,
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

    it('extracts only text message events from payload', () => {
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
                            type: 'image'
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
