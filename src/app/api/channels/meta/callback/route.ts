import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { assertTenantWriteAllowed, resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import {
    decodeMetaOAuthState,
    exchangeMetaCodeForToken,
    exchangeMetaForLongLivedToken,
    fetchMetaInstagramPages,
    fetchMetaWhatsAppBusinessAccounts,
    resolveMetaChannelsReturnPath,
    pickInstagramConnectionCandidate,
    pickWhatsAppConnectionCandidate
} from '@/lib/channels/meta-oauth'

function normalizeLocale(value: string | null) {
    return value === 'en' ? 'en' : 'tr'
}

function getAppUrl(req: NextRequest) {
    return process.env.NEXT_PUBLIC_APP_URL
        || process.env.NEXT_PUBLIC_SITE_URL
        || req.nextUrl.origin
}

function redirectToChannels(req: NextRequest, locale: string, status: string, channel: string, returnToPath?: string | null) {
    const baseUrl = getAppUrl(req)
    const url = new URL(resolveMetaChannelsReturnPath(locale, returnToPath), baseUrl)
    url.searchParams.set('meta_oauth', status)
    url.searchParams.set('channel', channel)
    return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
    const stateValue = req.nextUrl.searchParams.get('state')
    const code = req.nextUrl.searchParams.get('code')

    const appId = process.env.META_APP_ID
    const appSecret = process.env.META_APP_SECRET
    const stateSecret = process.env.META_OAUTH_STATE_SECRET || appSecret
    const globalVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || null

    if (!appId || !appSecret || !stateSecret) {
        return redirectToChannels(req, 'tr', 'missing_meta_env', 'unknown')
    }

    if (!stateValue) {
        return redirectToChannels(req, 'tr', 'missing_state', 'unknown')
    }

    const state = decodeMetaOAuthState(stateValue, stateSecret)
    if (!state) {
        return redirectToChannels(req, 'tr', 'invalid_state', 'unknown')
    }

    const locale = normalizeLocale(state.locale)
    const returnToPath = resolveMetaChannelsReturnPath(locale, state.returnToPath ?? null)

    const metaError = req.nextUrl.searchParams.get('error')
    if (metaError) {
        return redirectToChannels(req, locale, 'oauth_cancelled', state.channel, returnToPath)
    }

    if (!code) {
        return redirectToChannels(req, locale, 'missing_code', state.channel, returnToPath)
    }

    const supabase = await createClient()

    try {
        await assertTenantWriteAllowed(supabase)
    } catch {
        return redirectToChannels(req, locale, 'forbidden', state.channel, returnToPath)
    }

    const context = await resolveActiveOrganizationContext(supabase)
    const activeOrganizationId = context?.activeOrganizationId ?? null
    if (!activeOrganizationId || activeOrganizationId !== state.organizationId) {
        return redirectToChannels(req, locale, 'org_mismatch', state.channel, returnToPath)
    }

    const callbackUrl = new URL('/api/channels/meta/callback', getAppUrl(req)).toString()

    try {
        const shortLivedToken = await exchangeMetaCodeForToken({
            appId,
            appSecret,
            redirectUri: callbackUrl,
            code
        })

        let userAccessToken = shortLivedToken
        try {
            userAccessToken = await exchangeMetaForLongLivedToken({
                appId,
                appSecret,
                shortLivedToken
            })
        } catch (error) {
            console.warn('Meta OAuth: long-lived token exchange failed, falling back to short-lived token', error)
        }

        if (state.channel === 'instagram') {
            const pagesPayload = await fetchMetaInstagramPages(userAccessToken)
            const candidate = pickInstagramConnectionCandidate(pagesPayload)
            if (!candidate) {
                return redirectToChannels(req, locale, 'missing_instagram_assets', state.channel, returnToPath)
            }

            const channelName = candidate.instagramUsername
                ? `Instagram (@${candidate.instagramUsername})`
                : `Instagram (${candidate.pageName})`

            const { error } = await supabase
                .from('channels')
                .upsert({
                    organization_id: activeOrganizationId,
                    type: 'instagram',
                    name: channelName,
                    status: 'active',
                    config: {
                        page_id: candidate.pageId,
                        instagram_business_account_id: candidate.instagramBusinessAccountId,
                        page_access_token: candidate.pageAccessToken,
                        verify_token: globalVerifyToken || randomUUID(),
                        connected_via: 'oauth',
                        oauth_connected_at: new Date().toISOString(),
                        webhook_verified_at: null,
                        username: candidate.instagramUsername
                    }
                }, {
                    onConflict: 'organization_id,type'
                })

            if (error) throw error

            return redirectToChannels(req, locale, 'success', state.channel, returnToPath)
        }

        const wabaPayload = await fetchMetaWhatsAppBusinessAccounts(userAccessToken)
        const candidate = pickWhatsAppConnectionCandidate(wabaPayload)
        if (!candidate) {
            return redirectToChannels(req, locale, 'missing_whatsapp_assets', state.channel, returnToPath)
        }

        const channelName = candidate.displayPhoneNumber
            ? `WhatsApp (${candidate.displayPhoneNumber})`
            : `WhatsApp (${candidate.phoneNumberId})`

        const { error } = await supabase
            .from('channels')
            .upsert({
                organization_id: activeOrganizationId,
                type: 'whatsapp',
                name: channelName,
                status: 'active',
                config: {
                    phone_number_id: candidate.phoneNumberId,
                    business_account_id: candidate.businessAccountId,
                    permanent_access_token: userAccessToken,
                    verify_token: globalVerifyToken || randomUUID(),
                    connected_via: 'oauth',
                    oauth_connected_at: new Date().toISOString(),
                    webhook_verified_at: null,
                    display_phone_number: candidate.displayPhoneNumber
                }
            }, {
                onConflict: 'organization_id,type'
            })

        if (error) throw error

        return redirectToChannels(req, locale, 'success', state.channel, returnToPath)
    } catch (error) {
        console.error('Meta OAuth callback failed:', error)
        return redirectToChannels(req, locale, 'connect_failed', state.channel, returnToPath)
    }
}
