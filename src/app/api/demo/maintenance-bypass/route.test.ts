import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
    DEMO_MAINTENANCE_BYPASS_COOKIE,
    DEMO_MAINTENANCE_BYPASS_PARAM,
} from '@/lib/demo-chat/maintenance'
import { GET } from '@/app/api/demo/maintenance-bypass/route'

function createBypassRequest(searchParams: Record<string, string>) {
    const url = new URL('https://app.askqualy.com/api/demo/maintenance-bypass')
    for (const [key, value] of Object.entries(searchParams)) {
        url.searchParams.set(key, value)
    }

    return new NextRequest(url)
}

async function expectClientRedirect(res: Response, expectedUrl: string) {
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('content-type')).toContain('text/html')

    const body = await res.text()
    expect(body).toContain(`window.location.replace(${JSON.stringify(expectedUrl)})`)
    expect(body).not.toContain('maintenance_bypass=')
}

describe('demo maintenance bypass route', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('sets a hashed bypass cookie and redirects to the canonical default-locale demo URL when the token matches', async () => {
        vi.stubEnv('DEMO_MAINTENANCE_BYPASS_TOKEN', 'qualy-admin-maintenance-bypass-token-123')

        const res = await GET(createBypassRequest({
            [DEMO_MAINTENANCE_BYPASS_PARAM]: 'qualy-admin-maintenance-bypass-token-123',
            next: '/tr/demo/yiu-qualy-ai-demo?maintenance_bypass=qualy-admin-maintenance-bypass-token-123',
        }))

        await expectClientRedirect(res, 'https://app.askqualy.com/demo/yiu-qualy-ai-demo')
        const setCookie = res.headers.get('set-cookie') ?? ''
        expect(setCookie).toContain(`${DEMO_MAINTENANCE_BYPASS_COOKIE}=`)
        expect(setCookie).toContain('HttpOnly')
        expect(setCookie.toLowerCase()).toContain('samesite=lax')
        expect(setCookie).not.toContain('qualy-admin-maintenance-bypass-token-123')
    })

    it('keeps the non-default locale prefix when cleaning bypass redirects', async () => {
        vi.stubEnv('DEMO_MAINTENANCE_BYPASS_TOKEN', 'qualy-admin-maintenance-bypass-token-123')

        const res = await GET(createBypassRequest({
            [DEMO_MAINTENANCE_BYPASS_PARAM]: 'qualy-admin-maintenance-bypass-token-123',
            next: '/en/demo/yiu-qualy-ai-demo?maintenance_bypass=qualy-admin-maintenance-bypass-token-123',
        }))

        await expectClientRedirect(res, 'https://app.askqualy.com/en/demo/yiu-qualy-ai-demo')
    })

    it('drops all query parameters from the clean redirect target', async () => {
        vi.stubEnv('DEMO_MAINTENANCE_BYPASS_TOKEN', 'qualy-admin-maintenance-bypass-token-123')

        const res = await GET(createBypassRequest({
            [DEMO_MAINTENANCE_BYPASS_PARAM]: 'qualy-admin-maintenance-bypass-token-123',
            next: '/demo/yiu-qualy-ai-demo?maintenance_bypass=qualy-admin-maintenance-bypass-token-123&next=%2Fdemo%2Fyiu-qualy-ai-demo&utm_source=qa',
        }))

        await expectClientRedirect(res, 'https://app.askqualy.com/demo/yiu-qualy-ai-demo')
    })

    it('uses the configured app origin when Netlify exposes a deploy permalink request origin', async () => {
        vi.stubEnv('DEMO_MAINTENANCE_BYPASS_TOKEN', 'qualy-admin-maintenance-bypass-token-123')
        vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.askqualy.com')

        const url = new URL('https://6a1ede7ae585d70008177059--leadqualifier.netlify.app/api/demo/maintenance-bypass')
        url.searchParams.set(DEMO_MAINTENANCE_BYPASS_PARAM, 'qualy-admin-maintenance-bypass-token-123')
        url.searchParams.set('next', '/demo/yiu-qualy-ai-demo')

        const res = await GET(new NextRequest(url, {
            headers: {
                'x-forwarded-host': 'app.askqualy.com',
                'x-forwarded-proto': 'https',
            },
        }))

        await expectClientRedirect(res, 'https://app.askqualy.com/demo/yiu-qualy-ai-demo')
    })

    it('does not set a bypass cookie when the token is wrong', async () => {
        vi.stubEnv('DEMO_MAINTENANCE_BYPASS_TOKEN', 'qualy-admin-maintenance-bypass-token-123')

        const res = await GET(createBypassRequest({
            [DEMO_MAINTENANCE_BYPASS_PARAM]: 'wrong-token',
            next: '/tr/demo/yiu-qualy-ai-demo',
        }))

        await expectClientRedirect(res, 'https://app.askqualy.com/demo/yiu-qualy-ai-demo')
        expect(res.headers.get('set-cookie')).toBeNull()
    })

    it('clears the bypass cookie when the off command is used', async () => {
        vi.stubEnv('DEMO_MAINTENANCE_BYPASS_TOKEN', 'qualy-admin-maintenance-bypass-token-123')

        const res = await GET(createBypassRequest({
            [DEMO_MAINTENANCE_BYPASS_PARAM]: 'off',
            next: '/tr/demo/yiu-qualy-ai-demo?maintenance_bypass=off',
        }))

        await expectClientRedirect(res, 'https://app.askqualy.com/demo/yiu-qualy-ai-demo')
        const setCookie = res.headers.get('set-cookie') ?? ''
        expect(setCookie).toContain(`${DEMO_MAINTENANCE_BYPASS_COOKIE}=`)
        expect(setCookie).toContain('Max-Age=0')
    })
})
