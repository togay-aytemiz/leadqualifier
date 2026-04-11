import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const HOSTED_CHECKOUT_EMBED_PATH = path.join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/settings/plans/HostedCheckoutEmbed.tsx'
)

describe('hosted checkout embed source guard', () => {
    it('shows a timed fallback action when the iyzico embed does not mount', () => {
        expect(fs.existsSync(HOSTED_CHECKOUT_EMBED_PATH)).toBe(true)

        const source = fs.existsSync(HOSTED_CHECKOUT_EMBED_PATH)
            ? fs.readFileSync(HOSTED_CHECKOUT_EMBED_PATH, 'utf8')
            : ''

        expect(source).toContain('checkoutPageUrl?: string | null')
        expect(source).toContain('MutationObserver')
        expect(source).toContain('window.setTimeout')
        expect(source).toContain('setIsFallbackVisible(true)')
        expect(source).toContain('href={checkoutPageUrl}')
    })
})
