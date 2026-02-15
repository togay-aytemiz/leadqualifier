import { describe, expect, it } from 'vitest'
import {
    ADMIN_METRIC_PERIOD_ALL,
    buildRecentAdminMetricMonthKeys,
    resolveAdminMetricPeriodKey
} from '@/lib/admin/dashboard-metric-period'

describe('dashboard metric period helpers', () => {
    it('defaults to all-time when no period is provided', () => {
        const result = resolveAdminMetricPeriodKey(undefined, new Date(Date.UTC(2026, 1, 14)))
        expect(result).toBe(ADMIN_METRIC_PERIOD_ALL)
    })

    it('accepts a valid month period', () => {
        const result = resolveAdminMetricPeriodKey('2026-01', new Date(Date.UTC(2026, 1, 14)))
        expect(result).toBe('2026-01')
    })

    it('falls back to all-time for invalid values', () => {
        const result = resolveAdminMetricPeriodKey('2026-13', new Date(Date.UTC(2026, 1, 14)))
        expect(result).toBe(ADMIN_METRIC_PERIOD_ALL)
    })

    it('falls back to all-time for future month values', () => {
        const result = resolveAdminMetricPeriodKey('2026-03', new Date(Date.UTC(2026, 1, 14)))
        expect(result).toBe(ADMIN_METRIC_PERIOD_ALL)
    })

    it('builds recent month keys from current month backwards', () => {
        const result = buildRecentAdminMetricMonthKeys({
            now: new Date(Date.UTC(2026, 1, 14)),
            months: 4
        })

        expect(result).toEqual([
            '2026-02',
            '2026-01',
            '2025-12',
            '2025-11'
        ])
    })
})
