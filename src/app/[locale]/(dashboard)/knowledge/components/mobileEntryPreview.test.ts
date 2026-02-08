import { describe, expect, it } from 'vitest'

import {
    MOBILE_ENTRY_PREVIEW_MAX,
    formatMobileEntryPreview
} from './mobileEntryPreview'

describe('mobile knowledge entry preview', () => {
    it('normalizes whitespace and keeps short content unchanged', () => {
        expect(formatMobileEntryPreview('  Merhaba\n\nDunya   ')).toBe('Merhaba Dunya')
    })

    it('truncates long content with an ellipsis', () => {
        const longText = 'A'.repeat(MOBILE_ENTRY_PREVIEW_MAX + 15)

        const preview = formatMobileEntryPreview(longText)

        expect(preview).toHaveLength(MOBILE_ENTRY_PREVIEW_MAX)
        expect(preview.endsWith('…')).toBe(true)
    })

    it('returns dash placeholder for empty content', () => {
        expect(formatMobileEntryPreview('   ')).toBe('–')
    })
})
