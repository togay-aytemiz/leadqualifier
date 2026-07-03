import { describe, expect, it } from 'vitest'
import {
    buildWebWidgetLogoStoragePath,
    validateWebWidgetLogoFile,
    WEB_WIDGET_LOGO_MAX_BYTES,
} from '@/lib/channels/web-widget-assets'

describe('buildWebWidgetLogoStoragePath', () => {
    it('stores launcher logos under the organization folder with a mime-derived extension', () => {
        expect(buildWebWidgetLogoStoragePath({
            organizationId: 'org-1',
            mimeType: 'image/png',
            version: '20260703120000',
        })).toBe('org-1/launcher-logo-20260703120000.png')

        expect(buildWebWidgetLogoStoragePath({
            organizationId: 'org-1',
            mimeType: 'image/jpeg',
            version: '20260703120000',
        })).toBe('org-1/launcher-logo-20260703120000.jpg')
    })
})

describe('validateWebWidgetLogoFile', () => {
    it('accepts compact png/jpeg/webp images only', () => {
        expect(validateWebWidgetLogoFile(new File(['x'], 'logo.png', { type: 'image/png' }))).toBeNull()
        expect(validateWebWidgetLogoFile(new File(['x'], 'logo.svg', { type: 'image/svg+xml' }))).toBe('invalid_type')
        expect(validateWebWidgetLogoFile(new File([new Uint8Array(WEB_WIDGET_LOGO_MAX_BYTES + 1)], 'logo.png', { type: 'image/png' }))).toBe('file_too_large')
    })
})
