import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
    buildPostAuthRedirectPathMock,
    createClientMock,
} = vi.hoisted(() => ({
    buildPostAuthRedirectPathMock: vi.fn(),
    createClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock,
}))

vi.mock('@/lib/auth/post-auth', () => ({
    buildPostAuthRedirectPath: buildPostAuthRedirectPathMock,
}))

import { GET } from '@/app/api/auth/callback/route'

describe('auth callback route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('exchanges Supabase email confirmation codes and redirects to the localized post-auth route', async () => {
        const exchangeCodeForSession = vi.fn(async () => ({
            data: {
                user: { id: 'user-1' },
                session: { user: { id: 'user-1' } },
            },
            error: null,
        }))
        const supabase = {
            auth: {
                exchangeCodeForSession,
            },
        }

        createClientMock.mockResolvedValue(supabase)
        buildPostAuthRedirectPathMock.mockResolvedValue('/onboarding')

        const response = await GET(
            new NextRequest('https://app.askqualy.com/api/auth/callback?code=signup-code&locale=en')
        )

        expect(exchangeCodeForSession).toHaveBeenCalledWith('signup-code')
        expect(buildPostAuthRedirectPathMock).toHaveBeenCalledWith(
            'en',
            supabase,
            'user-1'
        )
        expect(response.status).toBe(307)
        expect(response.headers.get('location')).toBe('https://app.askqualy.com/en/onboarding')
    })

    it('redirects back to login without the stale code when exchange fails', async () => {
        createClientMock.mockResolvedValue({
            auth: {
                exchangeCodeForSession: vi.fn(async () => ({
                    data: { user: null, session: null },
                    error: { message: 'invalid flow state' },
                })),
            },
        })

        const response = await GET(
            new NextRequest('https://app.askqualy.com/api/auth/callback?code=expired-code&locale=tr')
        )

        expect(response.status).toBe(307)
        expect(response.headers.get('location')).toBe(
            'https://app.askqualy.com/login?auth_error=confirmation_failed'
        )
    })
})
