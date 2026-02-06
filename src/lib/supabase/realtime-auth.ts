type RealtimeSession = {
    access_token?: string | null
} | null

type RealtimeAuthSubscription = {
    unsubscribe: () => void
}

type RealtimeAuthClient = {
    realtime: {
        setAuth: (token: string) => void
    }
    auth: {
        getSession: () => Promise<{ data: { session: RealtimeSession } }>
        refreshSession: () => Promise<{ data: { session: RealtimeSession } }>
        onAuthStateChange: (
            callback: (_event: string, session: RealtimeSession) => void
        ) => { data: { subscription: RealtimeAuthSubscription } }
    }
}

interface SetupRealtimeAuthOptions {
    onMissingToken?: () => void
    onError?: (_error: unknown) => void
}

function resolveAccessToken(session: RealtimeSession) {
    if (!session?.access_token) return null
    return session.access_token
}

export async function setupRealtimeAuth(
    supabase: RealtimeAuthClient,
    options: SetupRealtimeAuthOptions = {}
) {
    let initialToken: string | null = null

    try {
        const sessionResult = await supabase.auth.getSession()
        initialToken = resolveAccessToken(sessionResult.data.session)

        if (!initialToken) {
            const refreshResult = await supabase.auth.refreshSession()
            initialToken = resolveAccessToken(refreshResult.data.session)
        }
    } catch (error) {
        options.onError?.(error)
    }

    if (initialToken) {
        supabase.realtime.setAuth(initialToken)
    } else {
        options.onMissingToken?.()
    }

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        const accessToken = resolveAccessToken(session)
        if (accessToken) {
            supabase.realtime.setAuth(accessToken)
        }
    })

    return () => {
        data.subscription.unsubscribe()
    }
}
