import { describe, expect, it, vi } from 'vitest'
import { setupRealtimeAuth } from '@/lib/supabase/realtime-auth'

interface SessionShape {
    access_token: string
}

type AuthStateCallback = (_event: string, session: SessionShape | null) => void

function createSupabaseMock(options?: {
    sessionToken?: string | null
    refreshedToken?: string | null
}) {
    const setAuth = vi.fn()
    const getSession = vi.fn(async () => ({
        data: { session: options?.sessionToken ? { access_token: options.sessionToken } : null }
    }))
    const refreshSession = vi.fn(async () => ({
        data: { session: options?.refreshedToken ? { access_token: options.refreshedToken } : null }
    }))
    const unsubscribe = vi.fn()

    let callback: AuthStateCallback | null = null
    const onAuthStateChange = vi.fn((cb: AuthStateCallback) => {
        callback = cb
        return {
            data: {
                subscription: {
                    unsubscribe
                }
            }
        }
    })

    return {
        client: {
            realtime: {
                setAuth
            },
            auth: {
                getSession,
                refreshSession,
                onAuthStateChange
            }
        },
        setAuth,
        getSession,
        refreshSession,
        onAuthStateChange,
        unsubscribe,
        emitAuthState(event: string, sessionToken: string | null) {
            callback?.(event, sessionToken ? { access_token: sessionToken } : null)
        }
    }
}

describe('setupRealtimeAuth', () => {
    it('sets realtime auth from the current session token', async () => {
        const mock = createSupabaseMock({ sessionToken: 'session-token' })

        const cleanup = await setupRealtimeAuth(mock.client)

        expect(mock.getSession).toHaveBeenCalledTimes(1)
        expect(mock.refreshSession).not.toHaveBeenCalled()
        expect(mock.setAuth).toHaveBeenCalledWith('session-token')

        cleanup()
    })

    it('falls back to refreshing session when token is missing', async () => {
        const mock = createSupabaseMock({ sessionToken: null, refreshedToken: 'refreshed-token' })

        const cleanup = await setupRealtimeAuth(mock.client)

        expect(mock.refreshSession).toHaveBeenCalledTimes(1)
        expect(mock.setAuth).toHaveBeenCalledWith('refreshed-token')

        cleanup()
    })

    it('updates realtime auth when auth state changes emit a fresh token', async () => {
        const mock = createSupabaseMock({ sessionToken: 'initial-token' })

        const cleanup = await setupRealtimeAuth(mock.client)
        mock.emitAuthState('TOKEN_REFRESHED', 'next-token')

        expect(mock.setAuth).toHaveBeenLastCalledWith('next-token')

        cleanup()
        expect(mock.unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('does not call setAuth when no session token can be resolved', async () => {
        const mock = createSupabaseMock({ sessionToken: null, refreshedToken: null })

        const cleanup = await setupRealtimeAuth(mock.client)

        expect(mock.setAuth).not.toHaveBeenCalled()
        cleanup()
    })
})
