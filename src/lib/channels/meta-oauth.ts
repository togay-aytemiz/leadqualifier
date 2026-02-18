import { createHmac, timingSafeEqual } from 'node:crypto'

const META_OAUTH_BASE = 'https://www.facebook.com/v21.0/dialog/oauth'

export type MetaChannelType = 'whatsapp' | 'instagram'

export interface MetaOAuthState {
    channel: MetaChannelType
    organizationId: string
    locale: string
    returnToPath?: string
    nonce: string
    issuedAt: number
}

export interface MetaAuthorizeUrlOptions {
    appId: string
    redirectUri: string
    state: string
    channel: MetaChannelType
}

export interface InstagramConnectionCandidate {
    pageId: string
    pageName: string
    pageAccessToken: string
    instagramBusinessAccountId: string
    instagramUsername: string | null
}

export interface WhatsAppConnectionCandidate {
    businessAccountId: string
    businessAccountName: string
    phoneNumberId: string
    displayPhoneNumber: string | null
}

function includeBusinessManagementForWhatsApp() {
    const raw = process.env.META_WHATSAPP_INCLUDE_BUSINESS_MANAGEMENT
    if (!raw) return false
    const normalized = raw.trim().toLowerCase()
    return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function resolveLocaleChannelsPath(locale: string) {
    return locale === 'en' ? '/en/settings/channels' : '/settings/channels'
}

export function resolveMetaChannelsReturnPath(locale: string, returnToPath: string | null | undefined) {
    const fallbackPath = resolveLocaleChannelsPath(locale)

    if (!returnToPath) return fallbackPath

    const candidate = returnToPath.trim()
    if (!candidate.startsWith('/') || candidate.startsWith('//')) return fallbackPath
    if (!candidate.includes('/settings/channels')) return fallbackPath

    return candidate
}

interface MetaGraphErrorResponse {
    error?: {
        message?: string
    }
}

interface MetaGraphListResponse {
    data?: unknown[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function toBase64Url(value: string) {
    return Buffer.from(value, 'utf8').toString('base64url')
}

function fromBase64Url(value: string) {
    return Buffer.from(value, 'base64url').toString('utf8')
}

function signState(encodedPayload: string, secret: string) {
    return createHmac('sha256', secret).update(encodedPayload, 'utf8').digest('base64url')
}

function safeEqual(a: string, b: string) {
    const aBuffer = Buffer.from(a, 'utf8')
    const bBuffer = Buffer.from(b, 'utf8')
    if (aBuffer.length !== bBuffer.length) return false
    return timingSafeEqual(aBuffer, bBuffer)
}

export function getMetaOAuthScopes(channel: MetaChannelType) {
    if (channel === 'whatsapp') {
        const scopes = [
            'whatsapp_business_management',
            'whatsapp_business_messaging'
        ]
        if (includeBusinessManagementForWhatsApp()) {
            scopes.unshift('business_management')
        }
        return scopes
    }

    return [
        'instagram_basic',
        'instagram_manage_messages',
        'pages_manage_metadata',
        'pages_messaging',
        'pages_show_list',
        'business_management'
    ]
}

export function encodeMetaOAuthState(state: MetaOAuthState, secret: string) {
    const payload = toBase64Url(JSON.stringify(state))
    const signature = signState(payload, secret)
    return `${payload}.${signature}`
}

export function decodeMetaOAuthState(value: string, secret: string): MetaOAuthState | null {
    const [payload, signature] = value.split('.')
    if (!payload || !signature) return null

    const expectedSignature = signState(payload, secret)
    if (!safeEqual(signature, expectedSignature)) return null

    try {
        const parsed = JSON.parse(fromBase64Url(payload)) as Partial<MetaOAuthState>
        if (!parsed || typeof parsed !== 'object') return null

        if ((parsed.channel !== 'whatsapp' && parsed.channel !== 'instagram')
            || typeof parsed.organizationId !== 'string'
            || typeof parsed.locale !== 'string'
            || (typeof parsed.returnToPath !== 'undefined' && typeof parsed.returnToPath !== 'string')
            || typeof parsed.nonce !== 'string'
            || typeof parsed.issuedAt !== 'number') {
            return null
        }

        return {
            channel: parsed.channel,
            organizationId: parsed.organizationId,
            locale: parsed.locale,
            returnToPath: parsed.returnToPath,
            nonce: parsed.nonce,
            issuedAt: parsed.issuedAt
        }
    } catch {
        return null
    }
}

export function buildMetaAuthorizeUrl(options: MetaAuthorizeUrlOptions) {
    const url = new URL(META_OAUTH_BASE)
    url.searchParams.set('client_id', options.appId)
    url.searchParams.set('redirect_uri', options.redirectUri)
    url.searchParams.set('state', options.state)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('auth_type', 'rerequest')
    url.searchParams.set('scope', getMetaOAuthScopes(options.channel).join(','))
    return url.toString()
}

export function pickInstagramConnectionCandidate(payload: unknown): InstagramConnectionCandidate | null {
    if (!isRecord(payload) || !Array.isArray(payload.data)) return null

    for (const item of payload.data) {
        if (!isRecord(item)) continue

        const pageId = asString(item.id)
        const pageName = asString(item.name)
        const pageAccessToken = asString(item.access_token)
        const instagram = isRecord(item.instagram_business_account) ? item.instagram_business_account : null
        const instagramBusinessAccountId = instagram ? asString(instagram.id) : null
        const instagramUsername = instagram ? asString(instagram.username) : null

        if (!pageId || !pageName || !pageAccessToken || !instagramBusinessAccountId) continue

        return {
            pageId,
            pageName,
            pageAccessToken,
            instagramBusinessAccountId,
            instagramUsername
        }
    }

    return null
}

export function pickWhatsAppConnectionCandidate(payload: unknown): WhatsAppConnectionCandidate | null {
    if (!isRecord(payload) || !Array.isArray(payload.data)) return null

    for (const item of payload.data) {
        if (!isRecord(item)) continue

        const businessAccountId = asString(item.id)
        const businessAccountName = asString(item.name)
        const phoneNumbersNode = isRecord(item.phone_numbers) ? item.phone_numbers : null
        const phoneNumbers = phoneNumbersNode && Array.isArray(phoneNumbersNode.data)
            ? phoneNumbersNode.data
            : []

        if (!businessAccountId) continue

        for (const phone of phoneNumbers) {
            if (!isRecord(phone)) continue
            const phoneNumberId = asString(phone.id)
            const displayPhoneNumber = asString(phone.display_phone_number)
            if (!phoneNumberId) continue

            return {
                businessAccountId,
                businessAccountName: businessAccountName || businessAccountId,
                phoneNumberId,
                displayPhoneNumber
            }
        }
    }

    return null
}

function isMissingWhatsAppBusinessAccountsFieldError(error: unknown) {
    if (!(error instanceof Error) || !error.message) return false
    return error.message.toLowerCase().includes('nonexisting field (whatsapp_business_accounts)')
}

function isMissingPermissionError(error: unknown) {
    if (!(error instanceof Error) || !error.message) return false
    return error.message.toLowerCase().includes('missing permission')
}

function extractGraphDataItems(payload: unknown) {
    if (!isRecord(payload) || !Array.isArray(payload.data)) return []
    return payload.data
}

function dedupeWhatsAppBusinessAccountItems(items: unknown[]) {
    const seenIds = new Set<string>()
    const deduped: unknown[] = []

    for (const item of items) {
        if (!isRecord(item)) continue
        const id = asString(item.id)
        if (!id || seenIds.has(id)) continue
        seenIds.add(id)
        deduped.push(item)
    }

    return deduped
}

async function requestMetaGraph<T>(url: URL): Promise<T> {
    const response = await fetch(url.toString(), {
        method: 'GET'
    })
    const payload = await response.json() as T & MetaGraphErrorResponse
    if (!response.ok) {
        const detail = payload?.error?.message || `Meta Graph API request failed with status ${response.status}`
        throw new Error(`${detail} [${url.pathname}]`)
    }
    return payload
}

export async function exchangeMetaCodeForToken(params: {
    appId: string
    appSecret: string
    redirectUri: string
    code: string
}) {
    const url = new URL('https://graph.facebook.com/v21.0/oauth/access_token')
    url.searchParams.set('client_id', params.appId)
    url.searchParams.set('client_secret', params.appSecret)
    url.searchParams.set('redirect_uri', params.redirectUri)
    url.searchParams.set('code', params.code)

    const payload = await requestMetaGraph<{ access_token?: string }>(url)
    const accessToken = asString(payload.access_token)
    if (!accessToken) {
        throw new Error('Meta OAuth token response is missing access token')
    }
    return accessToken
}

export async function exchangeMetaForLongLivedToken(params: {
    appId: string
    appSecret: string
    shortLivedToken: string
}) {
    const url = new URL('https://graph.facebook.com/v21.0/oauth/access_token')
    url.searchParams.set('grant_type', 'fb_exchange_token')
    url.searchParams.set('client_id', params.appId)
    url.searchParams.set('client_secret', params.appSecret)
    url.searchParams.set('fb_exchange_token', params.shortLivedToken)

    const payload = await requestMetaGraph<{ access_token?: string }>(url)
    const accessToken = asString(payload.access_token)
    if (!accessToken) {
        throw new Error('Meta long-lived token response is missing access token')
    }
    return accessToken
}

export async function fetchMetaInstagramPages(userAccessToken: string) {
    const url = new URL('https://graph.facebook.com/v21.0/me/accounts')
    url.searchParams.set('access_token', userAccessToken)
    url.searchParams.set('fields', 'id,name,access_token,instagram_business_account{id,username}')
    return requestMetaGraph<unknown>(url)
}

export async function fetchMetaWhatsAppBusinessAccounts(userAccessToken: string) {
    const directUrl = new URL('https://graph.facebook.com/v21.0/me/whatsapp_business_accounts')
    directUrl.searchParams.set('access_token', userAccessToken)
    directUrl.searchParams.set('fields', 'id,name,phone_numbers{id,display_phone_number,verified_name}')

    try {
        return await requestMetaGraph<unknown>(directUrl)
    } catch (directError) {
        const shouldFallbackForMissingField = isMissingWhatsAppBusinessAccountsFieldError(directError)
        const shouldFallbackForMissingPermission = isMissingPermissionError(directError) && includeBusinessManagementForWhatsApp()

        if (!shouldFallbackForMissingField && !shouldFallbackForMissingPermission) {
            throw directError
        }

        // Some Meta app/user-token combinations do not expose /me/whatsapp_business_accounts.
        // Fallback through business graph edges to discover accessible WABA assets.
        const businessesUrl = new URL('https://graph.facebook.com/v21.0/me/businesses')
        businessesUrl.searchParams.set('access_token', userAccessToken)
        businessesUrl.searchParams.set('fields', 'id,name')

        const businessesPayload = await requestMetaGraph<MetaGraphListResponse>(businessesUrl)
        const businesses = Array.isArray(businessesPayload.data) ? businessesPayload.data : []
        const combinedAccounts: unknown[] = []

        for (const business of businesses) {
            if (!isRecord(business)) continue
            const businessId = asString(business.id)
            if (!businessId) continue

            for (const edge of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts'] as const) {
                const edgeUrl = new URL(`https://graph.facebook.com/v21.0/${businessId}/${edge}`)
                edgeUrl.searchParams.set('access_token', userAccessToken)
                edgeUrl.searchParams.set('fields', 'id,name,phone_numbers{id,display_phone_number,verified_name}')

                try {
                    const edgePayload = await requestMetaGraph<MetaGraphListResponse>(edgeUrl)
                    combinedAccounts.push(...extractGraphDataItems(edgePayload))
                } catch {
                    // Continue collecting from other business edges.
                }
            }
        }

        return {
            data: dedupeWhatsAppBusinessAccountItems(combinedAccounts)
        }
    }
}

export async function hydrateMetaWhatsAppBusinessAccountsWithPhoneNumbers(params: {
    userAccessToken: string
    payload: unknown
}) {
    if (!isRecord(params.payload) || !Array.isArray(params.payload.data)) {
        return params.payload
    }

    const nextItems: unknown[] = []

    for (const item of params.payload.data) {
        if (!isRecord(item)) {
            nextItems.push(item)
            continue
        }

        const businessAccountId = asString(item.id)
        const phoneNumbersNode = isRecord(item.phone_numbers) ? item.phone_numbers : null
        const hasPhoneNumbers = Boolean(phoneNumbersNode && Array.isArray(phoneNumbersNode.data) && phoneNumbersNode.data.length > 0)

        if (!businessAccountId || hasPhoneNumbers) {
            nextItems.push(item)
            continue
        }

        const phoneNumbersUrl = new URL(`https://graph.facebook.com/v21.0/${businessAccountId}/phone_numbers`)
        phoneNumbersUrl.searchParams.set('access_token', params.userAccessToken)
        phoneNumbersUrl.searchParams.set('fields', 'id,display_phone_number,verified_name')

        try {
            const phoneNumbersPayload = await requestMetaGraph<MetaGraphListResponse>(phoneNumbersUrl)
            nextItems.push({
                ...item,
                phone_numbers: {
                    data: extractGraphDataItems(phoneNumbersPayload)
                }
            })
        } catch {
            nextItems.push(item)
        }
    }

    return {
        ...params.payload,
        data: nextItems
    }
}
