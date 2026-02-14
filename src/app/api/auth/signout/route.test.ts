import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock, signOutMock } = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    signOutMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

import { POST } from '@/app/api/auth/signout/route'

describe('auth signout route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        createClientMock.mockResolvedValue({
            auth: {
                signOut: signOutMock
            }
        })
    })

    afterEach(() => {
        delete process.env.NEXT_PUBLIC_APP_URL
    })

    it('redirects to current request origin instead of static env domain', async () => {
        process.env.NEXT_PUBLIC_APP_URL = 'https://leadqualifier.netlify.app'

        const req = new NextRequest('https://app.askqualy.com/api/auth/signout', {
            method: 'POST'
        })

        const res = await POST(req)

        expect(signOutMock).toHaveBeenCalledTimes(1)
        expect(res.headers.get('location')).toBe('https://app.askqualy.com/register')
    })
})
