import { describe, expect, it } from 'vitest'

import {
    waitForEmbeddedSignupEventOrFallback
} from '@/components/channels/metaEmbeddedSignupClient'
import type { MetaEmbeddedSignupEvent } from '@/lib/channels/meta-embedded-signup'

describe('metaEmbeddedSignupClient', () => {
    it('returns null after a short grace window when the finish event never arrives', async () => {
        const pendingEvent = new Promise<MetaEmbeddedSignupEvent>(() => undefined)

        const result = await waitForEmbeddedSignupEventOrFallback(pendingEvent, {
            graceMs: 0,
            waitFn: async () => null
        })

        expect(result).toBeNull()
    })

    it('returns the embedded-signup event when it arrives before the grace window ends', async () => {
        const finishEvent: MetaEmbeddedSignupEvent = {
            type: 'finish',
            businessAccountId: 'waba-1',
            phoneNumberId: 'phone-1'
        }

        const result = await waitForEmbeddedSignupEventOrFallback(Promise.resolve(finishEvent), {
            graceMs: 100,
            waitFn: async () => new Promise<null>(() => undefined)
        })

        expect(result).toEqual(finishEvent)
    })

    it('rethrows non-timeout errors from the embedded-signup event promise', async () => {
        await expect(
            waitForEmbeddedSignupEventOrFallback(
                Promise.reject(new Error('unexpected embedded-signup failure')),
                {
                    graceMs: 100,
                    waitFn: async () => new Promise<null>(() => undefined)
                }
            )
        ).rejects.toThrow('unexpected embedded-signup failure')
    })
})
