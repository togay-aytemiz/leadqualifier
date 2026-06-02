import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = path.resolve(process.cwd(), 'src/app/[locale]/demo/[slug]/page.tsx')

describe('public demo chat page source', () => {
    it('resolves the public slug server-side and renders the demo client without exposing organization ids', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain('resolveDemoChatChannel')
        expect(source).toContain('createDemoChatAccessToken')
        expect(source).toContain('accessToken=')
        expect(source).toContain('<DemoChatClient')
        expect(source).toContain('NextIntlClientProvider')
        expect(source).not.toContain('organizationId=')
    })

    it('uses the university logo asset as the demo fallback logo', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain("'/yuksek-ihtisas-universitesi.png'")
        expect(source).toContain("'yiu-qualy-ai-demo'")
        expect(source).toContain('channel.logoUrl || defaultLogoUrl')
    })

    it('forces a fresh server render so the signed demo API token cannot be served stale from cache', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain("export const dynamic = 'force-dynamic'")
        expect(source).toContain('export const revalidate = 0')
    })

    it('renders the maintenance screen before creating a Supabase service client when the flag is enabled', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')
        const maintenanceCheckIndex = source.indexOf('isDemoMaintenanceModeEnabled()')
        const supabaseClientCallIndex = source.indexOf('const supabase = createServiceClient()')

        expect(source).toContain('DemoMaintenanceScreen')
        expect(maintenanceCheckIndex).toBeGreaterThanOrEqual(0)
        expect(supabaseClientCallIndex).toBeGreaterThanOrEqual(0)
        expect(maintenanceCheckIndex).toBeLessThan(supabaseClientCallIndex)
    })
})
