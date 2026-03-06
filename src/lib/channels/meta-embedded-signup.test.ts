import { afterEach, describe, expect, it } from 'vitest'

import {
    getMetaEmbeddedSignupConfig,
    parseMetaEmbeddedSignupMessage
} from '@/lib/channels/meta-embedded-signup'

describe('meta embedded signup helpers', () => {
    afterEach(() => {
        delete process.env.NEXT_PUBLIC_META_APP_ID
        delete process.env.NEXT_PUBLIC_META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID
    })

    it('parses finish events from trusted Meta origins', () => {
        const event = parseMetaEmbeddedSignupMessage('https://www.facebook.com', JSON.stringify({
            type: 'WA_EMBEDDED_SIGNUP',
            event: 'FINISH',
            data: {
                phone_number_id: 'phone-1',
                waba_id: 'waba-1'
            }
        }))

        expect(event).toEqual({
            type: 'finish',
            phoneNumberId: 'phone-1',
            businessAccountId: 'waba-1'
        })
    })

    it('ignores messages from untrusted origins', () => {
        const event = parseMetaEmbeddedSignupMessage('https://evil.example', JSON.stringify({
            type: 'WA_EMBEDDED_SIGNUP',
            event: 'FINISH',
            data: {
                phone_number_id: 'phone-1',
                waba_id: 'waba-1'
            }
        }))

        expect(event).toBeNull()
    })

    it('parses cancel events with current step context', () => {
        const event = parseMetaEmbeddedSignupMessage('https://web.facebook.com', {
            type: 'WA_EMBEDDED_SIGNUP',
            event: 'CANCEL',
            data: {
                current_step: 'phone_number'
            }
        })

        expect(event).toEqual({
            type: 'cancel',
            currentStep: 'phone_number'
        })
    })

    it('returns embedded signup config only when required public env vars exist', () => {
        expect(getMetaEmbeddedSignupConfig()).toBeNull()

        process.env.NEXT_PUBLIC_META_APP_ID = 'app-1'
        expect(getMetaEmbeddedSignupConfig()).toBeNull()

        process.env.NEXT_PUBLIC_META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID = 'config-1'

        expect(getMetaEmbeddedSignupConfig()).toEqual({
            appId: 'app-1',
            configId: 'config-1'
        })
    })
})
