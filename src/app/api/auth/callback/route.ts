import { NextRequest, NextResponse } from 'next/server'

import { buildPostAuthRedirectPath } from '@/lib/auth/post-auth'
import { buildLocalizedPath, normalizeAppLocale } from '@/lib/i18n/locale-path'
import { createClient } from '@/lib/supabase/server'

function buildLoginRedirect(req: NextRequest, locale: string) {
    return new URL(
        `${buildLocalizedPath('/login', locale)}?auth_error=confirmation_failed`,
        req.nextUrl.origin
    )
}

function buildLocalizedRedirect(req: NextRequest, pathname: string, locale: string) {
    return new URL(buildLocalizedPath(pathname, locale), req.nextUrl.origin)
}

export async function GET(req: NextRequest) {
    const code = req.nextUrl.searchParams.get('code')?.trim()
    const locale = normalizeAppLocale(req.nextUrl.searchParams.get('locale'))

    if (!code) {
        return NextResponse.redirect(buildLoginRedirect(req, locale))
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
        console.warn('Supabase auth callback exchange failed:', error)
        return NextResponse.redirect(buildLoginRedirect(req, locale))
    }

    const userId = data.user?.id ?? data.session?.user?.id ?? null
    let redirectPath = '/inbox'

    try {
        redirectPath = await buildPostAuthRedirectPath(locale, supabase, userId)
    } catch (postAuthError) {
        console.error('Failed to resolve post-auth redirect after auth callback:', postAuthError)
    }

    return NextResponse.redirect(buildLocalizedRedirect(req, redirectPath, locale))
}
