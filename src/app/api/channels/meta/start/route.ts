import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { assertTenantWriteAllowed, resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { buildMetaAuthorizeUrl, encodeMetaOAuthState, resolveMetaChannelsReturnPath, type MetaChannelType } from '@/lib/channels/meta-oauth'
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

function redirectToChannels(req: NextRequest, locale: string, status: string, channel: string, returnToPath?: string | null, popup = false) {
    const baseUrl = getAppUrl(req)
    const url = new URL(resolveMetaChannelsReturnPath(locale, returnToPath), baseUrl)
    url.searchParams.set('meta_oauth', status)
    url.searchParams.set('channel', channel)
    if (popup) {
        url.searchParams.set('meta_oauth_popup', '1')
    }
    return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
    const channelParam = req.nextUrl.searchParams.get('channel')
    const channel = (channelParam === 'whatsapp' || channelParam === 'instagram')
        ? channelParam
        : null
    const popup = req.nextUrl.searchParams.get('popup') === '1'
    const locale = normalizeLocale(req.nextUrl.searchParams.get('locale'))
    const returnToPath = resolveMetaChannelsReturnPath(locale, req.nextUrl.searchParams.get('returnTo'))

    if (!channel) {
        return redirectToChannels(req, locale, 'invalid_channel', channelParam ?? 'unknown', returnToPath, popup)
    }

    const appId = process.env.META_APP_ID
    const appSecret = process.env.META_APP_SECRET
    const stateSecret = process.env.META_OAUTH_STATE_SECRET || appSecret

    if (!appId || !stateSecret) {
        return redirectToChannels(req, locale, 'missing_meta_env', channel, returnToPath, popup)
    }

    const supabase = await createClient()

    try {
        await assertTenantWriteAllowed(supabase)
    } catch {
        return redirectToChannels(req, locale, 'forbidden', channel, returnToPath, popup)
    }

    const context = await resolveActiveOrganizationContext(supabase)
    const activeOrganizationId = context?.activeOrganizationId ?? null
    const requestedOrganizationId = req.nextUrl.searchParams.get('organizationId')

    if (!activeOrganizationId) {
        return redirectToChannels(req, locale, 'missing_org', channel, returnToPath, popup)
    }

    if (requestedOrganizationId && requestedOrganizationId !== activeOrganizationId) {
        return redirectToChannels(req, locale, 'org_mismatch', channel, returnToPath, popup)
    }

    const callbackUrl = new URL('/api/channels/meta/callback', getAppUrl(req))
    if (popup) {
        callbackUrl.searchParams.set('popup', '1')
    }

    const state = encodeMetaOAuthState({
        channel: channel as MetaChannelType,
        organizationId: activeOrganizationId,
        locale,
        returnToPath,
        nonce: randomUUID(),
        issuedAt: Date.now()
    }, stateSecret)

    const authorizeUrl = buildMetaAuthorizeUrl({
        appId,
        redirectUri: callbackUrl.toString(),
        state,
        channel: channel as MetaChannelType
    })

    return NextResponse.redirect(authorizeUrl)
}
