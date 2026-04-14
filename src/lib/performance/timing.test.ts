import { describe, expect, it, vi } from 'vitest'
import { withDevTiming } from '@/lib/performance/timing'

function createFakeClock(values: number[]) {
    let index = 0
    return () => values[index++] ?? values[values.length - 1] ?? 0
}

describe('withDevTiming', () => {
    it('measures async work and returns the callback result when enabled', async () => {
        const log = vi.fn()

        const result = await withDevTiming('calendar.page', async () => 'ok', {
            enabled: true,
            log,
            now: createFakeClock([10, 45])
        })

        expect(result).toBe('ok')
        expect(log).toHaveBeenCalledWith('[perf] calendar.page', {
            durationMs: 35
        })
    })

    it('does not log when disabled', async () => {
        const log = vi.fn()

        const result = await withDevTiming('calendar.page', async () => 'ok', {
            enabled: false,
            log,
            now: createFakeClock([10, 45])
        })

        expect(result).toBe('ok')
        expect(log).not.toHaveBeenCalled()
    })
})
