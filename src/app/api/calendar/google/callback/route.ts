import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { assertTenantWriteAllowed, resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { exchangeGoogleCodeForToken } from '@/lib/calendar/google'
import {
    decodeGoogleCalendarOAuthState,
    resolveCalendarReturnPath,
    resolveGoogleCalendarCredentials,
    resolveGoogleCalendarStateSecret
} from '@/lib/calendar/google-oauth'
import {
    resolveGoogleCalendarConnectionDetails,
    upsertCalendarConnectionSecrets
} from '@/lib/calendar/bookings'
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
    returnToPath?: string | null,
    errorCode?: string | null
) {
    const baseUrl = getAppUrl(req)
    const url = new URL(resolveCalendarReturnPath(locale, returnToPath), baseUrl)
    url.searchParams.set('google_calendar', status)
    if (errorCode) {
        url.searchParams.set('google_calendar_error', errorCode)
    }
    return NextResponse.redirect(url)
}

function resolveGoogleOAuthErrorCode(error: unknown) {
    if (!(error instanceof Error) || !error.message) return 'unknown'

    const message = error.message.toLowerCase()
    if (message.includes('redirect_uri') || message.includes('redirect uri')) {
        return 'invalid_redirect_uri'
    }
    if (message.includes('invalid_grant') || message.includes('authorization')) {
        return 'invalid_grant'
    }
    if (message.includes('permission') || message.includes('forbidden')) {
        return 'missing_permissions'
    }
    return 'google_api_error'
}

export async function GET(req: NextRequest) {
    const stateValue = req.nextUrl.searchParams.get('state')
    const code = req.nextUrl.searchParams.get('code')
    const stateSecret = resolveGoogleCalendarStateSecret()

    if (!stateSecret) {
        return redirectToCalendar(req, 'tr', 'missing_google_env', null)
    }

    if (!stateValue) {
        return redirectToCalendar(req, 'tr', 'missing_state', null)
    }

    const state = decodeGoogleCalendarOAuthState(stateValue, stateSecret)
    if (!state) {
        return redirectToCalendar(req, 'tr', 'invalid_state', null)
    }

    const locale = normalizeLocale(state.locale)
    const returnToPath = resolveCalendarReturnPath(locale, state.returnToPath ?? null)
    const oauthError = req.nextUrl.searchParams.get('error')
    if (oauthError) {
        return redirectToCalendar(req, locale, 'oauth_cancelled', returnToPath)
    }

    if (!code) {
        return redirectToCalendar(req, locale, 'missing_code', returnToPath)
    }

    const credentials = resolveGoogleCalendarCredentials()
    if (!credentials.clientId || !credentials.clientSecret || !credentials.redirectUri) {
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
    if (!activeOrganizationId || activeOrganizationId !== state.organizationId) {
        return redirectToCalendar(req, locale, 'org_mismatch', returnToPath)
    }

    try {
        const tokenPayload = await exchangeGoogleCodeForToken({
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            redirectUri: credentials.redirectUri,
            code
        })

        const connectionDetails = await resolveGoogleCalendarConnectionDetails(tokenPayload.accessToken)
        const nowIso = new Date().toISOString()

        const { data: connection, error: connectionError } = await supabase
            .from('calendar_connections')
            .upsert({
                organization_id: activeOrganizationId,
                provider: 'google',
                status: 'active',
                sync_mode: 'busy_overlay',
                external_account_id: connectionDetails.externalAccountEmail,
                external_account_email: connectionDetails.externalAccountEmail,
                primary_calendar_id: connectionDetails.primaryCalendarId,
                scopes: tokenPayload.scopes,
                last_sync_at: nowIso,
                last_sync_status: 'ok',
                last_sync_error: null,
                connected_at: nowIso,
                disconnected_at: null
            }, {
                onConflict: 'organization_id,provider'
            })
            .select('*')
            .single()

        if (connectionError || !connection?.id) {
            return redirectToCalendar(
                req,
                locale,
                'connect_failed',
                returnToPath,
                resolveGoogleOAuthErrorCode(connectionError)
            )
        }

        await upsertCalendarConnectionSecrets(connection.id, tokenPayload)
        return redirectToCalendar(req, locale, 'success', returnToPath)
    } catch (error) {
        console.error('Google Calendar OAuth callback failed', error)
        return redirectToCalendar(
            req,
            locale,
            'connect_failed',
            returnToPath,
            resolveGoogleOAuthErrorCode(error)
        )
    }
}
