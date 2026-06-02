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

describe('demo maintenance bypass route', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('sets a hashed bypass cookie and redirects to the clean demo URL when the token matches', async () => {
        vi.stubEnv('DEMO_MAINTENANCE_BYPASS_TOKEN', 'qualy-admin-maintenance-bypass-token-123')

        const res = await GET(createBypassRequest({
            [DEMO_MAINTENANCE_BYPASS_PARAM]: 'qualy-admin-maintenance-bypass-token-123',
            next: '/tr/demo/yiu-qualy-ai-demo?maintenance_bypass=qualy-admin-maintenance-bypass-token-123',
        }))

        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toBe('https://app.askqualy.com/tr/demo/yiu-qualy-ai-demo')
        const setCookie = res.headers.get('set-cookie') ?? ''
        expect(setCookie).toContain(`${DEMO_MAINTENANCE_BYPASS_COOKIE}=`)
        expect(setCookie).toContain('HttpOnly')
        expect(setCookie.toLowerCase()).toContain('samesite=lax')
        expect(setCookie).not.toContain('qualy-admin-maintenance-bypass-token-123')
    })

    it('does not set a bypass cookie when the token is wrong', async () => {
        vi.stubEnv('DEMO_MAINTENANCE_BYPASS_TOKEN', 'qualy-admin-maintenance-bypass-token-123')

        const res = await GET(createBypassRequest({
            [DEMO_MAINTENANCE_BYPASS_PARAM]: 'wrong-token',
            next: '/tr/demo/yiu-qualy-ai-demo',
        }))

        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toBe('https://app.askqualy.com/tr/demo/yiu-qualy-ai-demo')
        expect(res.headers.get('set-cookie')).toBeNull()
    })

    it('clears the bypass cookie when the off command is used', async () => {
        vi.stubEnv('DEMO_MAINTENANCE_BYPASS_TOKEN', 'qualy-admin-maintenance-bypass-token-123')

        const res = await GET(createBypassRequest({
            [DEMO_MAINTENANCE_BYPASS_PARAM]: 'off',
            next: '/tr/demo/yiu-qualy-ai-demo?maintenance_bypass=off',
        }))

        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toBe('https://app.askqualy.com/tr/demo/yiu-qualy-ai-demo')
        const setCookie = res.headers.get('set-cookie') ?? ''
        expect(setCookie).toContain(`${DEMO_MAINTENANCE_BYPASS_COOKIE}=`)
        expect(setCookie).toContain('Max-Age=0')
    })
})
