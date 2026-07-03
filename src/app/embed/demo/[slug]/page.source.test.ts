import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = path.resolve(process.cwd(), 'src/app/embed/demo/[slug]/page.tsx')

describe('demo chat embed page source', () => {
    it('resolves demo channels server-side and renders the shared demo client in embed mode', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain('resolveDemoChatChannel')
        expect(source).toContain('createDemoChatAccessToken')
        expect(source).toContain('<DemoChatClient')
        expect(source).toContain('mode="embed"')
        expect(source).toContain('NextIntlClientProvider')
        expect(source).not.toContain('organizationId=')
    })

    it('keeps embed responses dynamic so signed access tokens cannot be cached stale', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain("export const dynamic = 'force-dynamic'")
        expect(source).toContain('export const revalidate = 0')
    })
})
