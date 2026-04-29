import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiTimeoutError, resolveAiTimeoutMs, withAiTimeout } from './deadline'

describe('AI deadline helpers', () => {
    afterEach(() => {
        vi.useRealTimers()
        delete process.env.AI_REQUEST_TIMEOUT_MS
    })

    it('uses a bounded default timeout for AI stages', () => {
        expect(resolveAiTimeoutMs('rag_completion')).toBe(12000)
        expect(resolveAiTimeoutMs('lead_extraction')).toBe(15000)
        expect(resolveAiTimeoutMs('fallback', 250)).toBe(250)
    })

    it('rejects unresolved AI work after the timeout budget', async () => {
        vi.useFakeTimers()
        const result = withAiTimeout(new Promise<string>(() => undefined), {
            stage: 'rag_completion',
            timeoutMs: 25
        })
        const assertion = expect(result).rejects.toBeInstanceOf(AiTimeoutError)

        await vi.advanceTimersByTimeAsync(25)
        await assertion
    })
})
