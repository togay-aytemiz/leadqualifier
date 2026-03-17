import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { assertTenantWriteAllowed, resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import {
    buildGoogleCalendarAuthorizeUrl,
    encodeGoogleCalendarOAuthState,
    resolveCalendarReturnPath,
    resolveGoogleCalendarCredentials,
    resolveGoogleCalendarStateSecret
} from '@/lib/calendar/google-oauth'
import { resolveMetaOrigin } from '@/lib/channels/meta-origin'

function normalizeLocale(value: string | null) {
    return value === 'en' ? 'en' : 'tr'
}

function getAppUrl(req: NextRequest) {
    return resolveMetaOrigin({
        appUrl: process.env.NEXT_PUBLIC_APP_URL,
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
        forwardedHost: req.headers.get('x-forwarded-host'),
        forwardedProto: req.headers.get('x-forwarded-proto'),
        requestOrigin: req.nextUrl.origin
    })
}

function redirectToCalendar(
    req: NextRequest,
    locale: string,
    status: string,
    returnToPath?: string | null
) {
    const baseUrl = getAppUrl(req)
    const url = new URL(resolveCalendarReturnPath(locale, returnToPath), baseUrl)
    url.searchParams.set('google_calendar', status)
    return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
    const locale = normalizeLocale(req.nextUrl.searchParams.get('locale'))
    const returnToPath = resolveCalendarReturnPath(locale, req.nextUrl.searchParams.get('returnTo'))
    const credentials = resolveGoogleCalendarCredentials()
    const stateSecret = resolveGoogleCalendarStateSecret()

    if (!credentials.clientId || !credentials.redirectUri || !stateSecret) {
        return redirectToCalendar(req, locale, 'missing_google_env', returnToPath)
    }

    const supabase = await createClient()

    try {
        await assertTenantWriteAllowed(supabase)
    } catch {
        return redirectToCalendar(req, locale, 'forbidden', returnToPath)
    }

    const context = await resolveActiveOrganizationContext(supabase)
    const activeOrganizationId = context?.activeOrganizationId ?? null
    const requestedOrganizationId = req.nextUrl.searchParams.get('organizationId')

    if (!activeOrganizationId) {
        return redirectToCalendar(req, locale, 'missing_org', returnToPath)
    }

    if (requestedOrganizationId && requestedOrganizationId !== activeOrganizationId) {
        return redirectToCalendar(req, locale, 'org_mismatch', returnToPath)
    }

    const state = encodeGoogleCalendarOAuthState({
        organizationId: activeOrganizationId,
        locale,
        returnToPath,
        nonce: randomUUID(),
        issuedAt: Date.now()
    }, stateSecret)

    const authorizeUrl = buildGoogleCalendarAuthorizeUrl({
        clientId: credentials.clientId,
        redirectUri: credentials.redirectUri,
        state
    })

    return NextResponse.redirect(authorizeUrl)
}
