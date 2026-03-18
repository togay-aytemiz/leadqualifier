import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { assertTenantWriteAllowed, resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import {
    decodeMetaOAuthState,
    exchangeMetaCodeForToken,
    exchangeMetaForLongLivedToken,
    fetchMetaWhatsAppBusinessAccounts,
    fetchMetaWhatsAppBusinessAccountsFromDebugToken,
    hydrateMetaWhatsAppBusinessAccountsWithPhoneNumbers,
    resolveMetaAppCredentials,
    resolveMetaChannelsReturnPath,
    resolveMetaInstagramConnectionCandidate,
    resolveMetaOAuthStateSecret,
    pickWhatsAppConnectionCandidate
} from '@/lib/channels/meta-oauth'
import { resolveMetaOrigin } from '@/lib/channels/meta-origin'
import { WhatsAppClient } from '@/lib/whatsapp/client'
import { resolveWhatsAppWebhookSubscriptionOverrides } from '@/lib/channels/whatsapp-webhook-config'

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

function redirectToChannels(
    req: NextRequest,
    locale: string,
    status: string,
    channel: string,
    returnToPath?: string | null,
    popup = false,
    errorCode?: string | null
) {
    const baseUrl = getAppUrl(req)
    const url = new URL(resolveMetaChannelsReturnPath(locale, returnToPath), baseUrl)
    url.searchParams.set('meta_oauth', status)
    url.searchParams.set('channel', channel)
    if (popup) {
        url.searchParams.set('meta_oauth_popup', '1')
    }
    if (errorCode) {
        url.searchParams.set('meta_oauth_error', errorCode)
    }
    return NextResponse.redirect(url)
}

function resolveMetaOAuthErrorCode(error: unknown) {
    if (!(error instanceof Error) || !error.message) return 'unknown'

    const message = error.message.toLowerCase()

    if (message.includes('permission') || message.includes('not authorized') || message.includes('insufficient')) {
        return 'missing_permissions'
    }

    if (message.includes('redirect_uri') || message.includes('redirect uri')) {
        return 'invalid_redirect_uri'
    }

    if (message.includes('invalid oauth access token') || message.includes('oauth')) {
        return 'invalid_oauth_token'
    }

    if (message.includes('unsupported get request') || message.includes('does not exist')) {
        return 'asset_access_denied'
    }

    return 'graph_api_error'
}

export async function GET(req: NextRequest) {
    const stateValue = req.nextUrl.searchParams.get('state')
    const code = req.nextUrl.searchParams.get('code')

    const stateSecret = resolveMetaOAuthStateSecret()
    const globalVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || null
    const popup = req.nextUrl.searchParams.get('popup') === '1'

    if (!stateSecret) {
        return redirectToChannels(req, 'tr', 'missing_meta_env', 'unknown', null, popup)
    }

    if (!stateValue) {
        return redirectToChannels(req, 'tr', 'missing_state', 'unknown', null, popup)
    }

    const state = decodeMetaOAuthState(stateValue, stateSecret)
    if (!state) {
        return redirectToChannels(req, 'tr', 'invalid_state', 'unknown', null, popup)
    }

    const credentials = resolveMetaAppCredentials(state.channel)
    if (!credentials.appId || !credentials.appSecret) {
        return redirectToChannels(req, 'tr', 'missing_meta_env', state.channel, state.returnToPath, popup)
    }

    const locale = normalizeLocale(state.locale)
    const returnToPath = resolveMetaChannelsReturnPath(locale, state.returnToPath ?? null)

    const metaError = req.nextUrl.searchParams.get('error')
    if (metaError) {
        return redirectToChannels(req, locale, 'oauth_cancelled', state.channel, returnToPath, popup)
    }

    if (!code) {
        return redirectToChannels(req, locale, 'missing_code', state.channel, returnToPath, popup)
    }

    const supabase = await createClient()

    try {
        await assertTenantWriteAllowed(supabase)
    } catch {
        return redirectToChannels(req, locale, 'forbidden', state.channel, returnToPath, popup)
    }

    const context = await resolveActiveOrganizationContext(supabase)
    const activeOrganizationId = context?.activeOrganizationId ?? null
    if (!activeOrganizationId || activeOrganizationId !== state.organizationId) {
        return redirectToChannels(req, locale, 'org_mismatch', state.channel, returnToPath, popup)
    }

    const callbackUrl = new URL('/api/channels/meta/callback', getAppUrl(req))
    if (popup) {
        callbackUrl.searchParams.set('popup', '1')
    }

    try {
        const shortLivedToken = await exchangeMetaCodeForToken({
            appId: credentials.appId,
            appSecret: credentials.appSecret,
            redirectUri: callbackUrl.toString(),
            code,
            channel: state.channel
        })

        let userAccessToken = shortLivedToken
        try {
            userAccessToken = await exchangeMetaForLongLivedToken({
                appId: credentials.appId,
                appSecret: credentials.appSecret,
                shortLivedToken,
                channel: state.channel
            })
        } catch (error) {
            console.warn('Meta OAuth: long-lived token exchange failed, falling back to short-lived token', error)
        }

        if (state.channel === 'instagram') {
            const candidate = await resolveMetaInstagramConnectionCandidate(userAccessToken)
            if (!candidate) {
                return redirectToChannels(req, locale, 'missing_instagram_assets', state.channel, returnToPath, popup)
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
                        instagram_user_id: candidate.instagramBusinessAccountId,
                        instagram_app_scoped_id: candidate.instagramAppScopedId,
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

            return redirectToChannels(req, locale, 'success', state.channel, returnToPath, popup)
        }

        let candidate = null
        let directWabaFetchError: unknown = null
        let wabaPayload: unknown = null

        try {
            wabaPayload = await fetchMetaWhatsAppBusinessAccounts(userAccessToken)
        } catch (error) {
            directWabaFetchError = error
            console.warn('Meta OAuth: direct WhatsApp account discovery failed; attempting debug-token fallback', error)
        }

        if (wabaPayload) {
            candidate = pickWhatsAppConnectionCandidate(wabaPayload)
            if (!candidate) {
                const hydratedWabaPayload = await hydrateMetaWhatsAppBusinessAccountsWithPhoneNumbers({
                    userAccessToken,
                    payload: wabaPayload
                })
                candidate = pickWhatsAppConnectionCandidate(hydratedWabaPayload)
            }
        }

        if (!candidate) {
            try {
                const debugTokenPayload = await fetchMetaWhatsAppBusinessAccountsFromDebugToken({
                    userAccessToken,
                    appId: credentials.appId,
                    appSecret: credentials.appSecret
                })
                candidate = pickWhatsAppConnectionCandidate(debugTokenPayload)
            } catch (debugFallbackError) {
                if (directWabaFetchError) {
                    throw directWabaFetchError
                }
                throw debugFallbackError
            }
        }

        if (!candidate) {
            if (directWabaFetchError) {
                throw directWabaFetchError
            }
            return redirectToChannels(req, locale, 'missing_whatsapp_assets', state.channel, returnToPath, popup)
        }

        const channelName = candidate.displayPhoneNumber
            ? `WhatsApp (${candidate.displayPhoneNumber})`
            : `WhatsApp (${candidate.phoneNumberId})`
        const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || randomUUID()
        const webhookOverrides = resolveWhatsAppWebhookSubscriptionOverrides(verifyToken)
        const whatsAppClient = new WhatsAppClient(userAccessToken)
        await whatsAppClient.subscribeAppToBusinessAccount(candidate.businessAccountId, webhookOverrides)
        const webhookSubscriptionRequestedAt = new Date().toISOString()

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
                    verify_token: verifyToken,
                    connected_via: 'oauth',
                    oauth_connected_at: new Date().toISOString(),
                    webhook_status: 'pending',
                    webhook_callback_uri: webhookOverrides?.overrideCallbackUri ?? null,
                    webhook_subscription_requested_at: webhookSubscriptionRequestedAt,
                    webhook_subscription_error: null,
                    webhook_verified_at: null,
                    display_phone_number: candidate.displayPhoneNumber
                }
            }, {
                onConflict: 'organization_id,type'
            })

        if (error) throw error

        return redirectToChannels(req, locale, 'success', state.channel, returnToPath, popup)
    } catch (error) {
        console.error('Meta OAuth callback failed:', error)
        const errorCode = resolveMetaOAuthErrorCode(error)
        return redirectToChannels(req, locale, 'connect_failed', state.channel, returnToPath, popup, errorCode)
    }
}
