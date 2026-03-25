import { describe, expect, it } from 'vitest'

import { resolveOptimisticDashboardPath } from '@/design/dashboard-route-state'

describe('resolveOptimisticDashboardPath', () => {
    it('prefers a pending dashboard target until the committed pathname catches up', () => {
        expect(resolveOptimisticDashboardPath('/tr/inbox?conversation=123', '/en/leads?page=2')).toBe('/leads')
    })

    it('ignores pending paths outside the dashboard route families', () => {
        expect(resolveOptimisticDashboardPath('/settings/ai', '/login')).toBe('/settings/ai')
    })

    it('falls back to the committed pathname after the navigation commits', () => {
        expect(resolveOptimisticDashboardPath('/settings/channels', '/settings/channels')).toBe('/settings/channels')
    })
})
