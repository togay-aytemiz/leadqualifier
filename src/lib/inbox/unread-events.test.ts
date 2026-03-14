import { describe, expect, it, vi } from 'vitest'
import {
    dispatchInboxUnreadUpdated,
    listenForInboxUnreadUpdates,
    shouldRefreshInboxUnreadIndicator
} from './unread-events'

describe('inbox unread events', () => {
    it('dispatches unread updates to listeners with normalized organization detail', () => {
        const target = new EventTarget()
        const listener = vi.fn()

        const unsubscribe = listenForInboxUnreadUpdates(listener, target)

        dispatchInboxUnreadUpdated({ organizationId: ' org-1 ' }, target)

        expect(listener).toHaveBeenCalledWith({ organizationId: 'org-1' })

        unsubscribe()
        dispatchInboxUnreadUpdated({ organizationId: 'org-2' }, target)

        expect(listener).toHaveBeenCalledTimes(1)
    })

    it('refreshes unread indicators only for the current or unspecified organization', () => {
        expect(shouldRefreshInboxUnreadIndicator('org-1', { organizationId: 'org-1' })).toBe(true)
        expect(shouldRefreshInboxUnreadIndicator('org-1', { organizationId: ' org-1 ' })).toBe(true)
        expect(shouldRefreshInboxUnreadIndicator('org-1', { organizationId: null })).toBe(true)
        expect(shouldRefreshInboxUnreadIndicator('org-1', null)).toBe(true)
        expect(shouldRefreshInboxUnreadIndicator('org-1', { organizationId: 'org-2' })).toBe(false)
        expect(shouldRefreshInboxUnreadIndicator(null, { organizationId: 'org-1' })).toBe(false)
    })
})
