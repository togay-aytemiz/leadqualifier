import { describe, expect, it } from 'vitest'

import { resolveMobileNavActiveItem } from '@/design/mobile-navigation'

describe('resolveMobileNavActiveItem', () => {
    it('marks inbox routes as inbox tab', () => {
        expect(resolveMobileNavActiveItem('/en/inbox')).toBe('inbox')
        expect(resolveMobileNavActiveItem('/tr/inbox/abc')).toBe('inbox')
    })

    it('marks leads route as contacts tab', () => {
        expect(resolveMobileNavActiveItem('/leads')).toBe('contacts')
    })

    it('marks skills and knowledge routes correctly', () => {
        expect(resolveMobileNavActiveItem('/skills')).toBe('skills')
        expect(resolveMobileNavActiveItem('/knowledge/123')).toBe('knowledge')
    })

    it('marks simulator and settings routes under other tab', () => {
        expect(resolveMobileNavActiveItem('/simulator')).toBe('other')
        expect(resolveMobileNavActiveItem('/settings/channels')).toBe('other')
    })

    it('falls back to inbox for unknown dashboard paths', () => {
        expect(resolveMobileNavActiveItem('/admin')).toBe('inbox')
    })
})
