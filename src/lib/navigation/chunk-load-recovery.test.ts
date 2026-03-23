import { describe, expect, it } from 'vitest'

import {
    buildChunkRecoveryUrl,
    shouldAttemptChunkRecovery,
    shouldRecoverFromChunkError
} from '@/lib/navigation/chunk-load-recovery'

describe('shouldRecoverFromChunkError', () => {
    it('detects next chunk load failures from the error message', () => {
        expect(shouldRecoverFromChunkError({
            message: 'ChunkLoadError: Failed to load chunk /_next/static/chunks/3293de856b7ddc0b.js'
        })).toBe(true)
    })

    it('detects direct next static script failures from the script src', () => {
        expect(shouldRecoverFromChunkError({
            scriptSrc: 'https://app.askqualy.com/_next/static/chunks/3293de856b7ddc0b.js'
        })).toBe(true)
    })

    it('ignores unrelated runtime errors', () => {
        expect(shouldRecoverFromChunkError({
            message: 'TypeError: Cannot read properties of undefined'
        })).toBe(false)
    })
})

describe('shouldAttemptChunkRecovery', () => {
    it('allows a first retry for the current path and blocks repeated loops', () => {
        expect(shouldAttemptChunkRecovery(null, '/inbox')).toBe(true)
        expect(shouldAttemptChunkRecovery('/leads', '/inbox')).toBe(true)
        expect(shouldAttemptChunkRecovery('/inbox', '/inbox')).toBe(false)
    })
})

describe('buildChunkRecoveryUrl', () => {
    it('preserves the existing URL shape while forcing a fresh request marker', () => {
        expect(buildChunkRecoveryUrl('https://app.askqualy.com/inbox?conversation=123#details', 42)).toBe(
            'https://app.askqualy.com/inbox?conversation=123&__chunk_retry=42#details'
        )
    })
})
