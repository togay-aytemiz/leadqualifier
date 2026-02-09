import { describe, expect, it } from 'vitest'

import {
    buildMetaSignature,
    extractInstagramTextMessages,
    isValidMetaSignature
} from '@/lib/instagram/webhook'

describe('instagram webhook utilities', () => {
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

    it('extracts only inbound text instagram message events', () => {
        const payload = {
            object: 'instagram',
            entry: [{
                id: 'ig-business-1',
                messaging: [{
                    sender: { id: 'ig-user-1' },
                    recipient: { id: 'ig-business-1' },
                    timestamp: 1738000000,
                    message: {
                        mid: 'igmid-1',
                        text: 'Merhaba Instagram!'
                    }
                }, {
                    sender: { id: 'ig-business-1' },
                    recipient: { id: 'ig-user-1' },
                    timestamp: 1738000001,
                    message: {
                        mid: 'igmid-echo',
                        text: 'echo',
                        is_echo: true
                    }
                }, {
                    sender: { id: 'ig-user-1' },
                    recipient: { id: 'ig-business-1' },
                    timestamp: 1738000002,
                    message: {
                        mid: 'igmid-image'
                    }
                }]
            }]
        }

        const events = extractInstagramTextMessages(payload)

        expect(events).toEqual([{
            instagramBusinessAccountId: 'ig-business-1',
            contactId: 'ig-user-1',
            contactName: null,
            messageId: 'igmid-1',
            text: 'Merhaba Instagram!',
            timestamp: '1738000000'
        }])
    })
})
