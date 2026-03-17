import { createHmac, timingSafeEqual } from 'node:crypto'

const GOOGLE_OAUTH_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'

export interface GoogleCalendarOAuthState {
    organizationId: string
    locale: string
    returnToPath?: string
    nonce: string
    issuedAt: number
}

export interface GoogleCalendarCredentials {
    clientId: string | null
    clientSecret: string | null
    redirectUri: string | null
}

function readEnvString(key: string) {
    const value = process.env[key]
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

function safeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left, 'utf8')
    const rightBuffer = Buffer.from(right, 'utf8')
    if (leftBuffer.length !== rightBuffer.length) return false
    return timingSafeEqual(leftBuffer, rightBuffer)
}

export function resolveGoogleCalendarCredentials(): GoogleCalendarCredentials {
    return {
        clientId: readEnvString('GOOGLE_CLIENT_ID'),
        clientSecret: readEnvString('GOOGLE_CLIENT_SECRET'),
        redirectUri: readEnvString('GOOGLE_CALENDAR_REDIRECT_URI')
    }
}

export function resolveGoogleCalendarStateSecret() {
    return readEnvString('GOOGLE_CALENDAR_STATE_SECRET')
        || readEnvString('GOOGLE_CLIENT_SECRET')
}

function resolveLocaleCalendarPath(locale: string) {
    return locale === 'en' ? '/en/calendar' : '/calendar'
}

export function resolveCalendarReturnPath(locale: string, returnToPath: string | null | undefined) {
    const fallbackPath = resolveLocaleCalendarPath(locale)

    if (!returnToPath) return fallbackPath

    const candidate = returnToPath.trim()
    if (!candidate.startsWith('/') || candidate.startsWith('//')) return fallbackPath

    const isCalendarRoute = candidate.includes('/calendar')
    const isAppsRoute = candidate.includes('/settings/apps')

    if (!isCalendarRoute && !isAppsRoute) return fallbackPath

    return candidate
}

export function encodeGoogleCalendarOAuthState(
    state: GoogleCalendarOAuthState,
    secret: string
) {
    const payload = toBase64Url(JSON.stringify(state))
    const signature = signState(payload, secret)
    return `${payload}.${signature}`
}

export function decodeGoogleCalendarOAuthState(value: string, secret: string) {
    const [payload, signature] = value.split('.')
    if (!payload || !signature) return null

    const expectedSignature = signState(payload, secret)
    if (!safeEqual(signature, expectedSignature)) return null

    try {
        const parsed = JSON.parse(fromBase64Url(payload)) as Partial<GoogleCalendarOAuthState>
        if (!parsed || typeof parsed !== 'object') return null

        if (
            typeof parsed.organizationId !== 'string'
            || typeof parsed.locale !== 'string'
            || typeof parsed.nonce !== 'string'
            || typeof parsed.issuedAt !== 'number'
            || (typeof parsed.returnToPath !== 'undefined' && typeof parsed.returnToPath !== 'string')
        ) {
            return null
        }

        return {
            organizationId: parsed.organizationId,
            locale: parsed.locale,
            returnToPath: parsed.returnToPath,
            nonce: parsed.nonce,
            issuedAt: parsed.issuedAt
        } satisfies GoogleCalendarOAuthState
    } catch {
        return null
    }
}

export function buildGoogleCalendarAuthorizeUrl(input: {
    clientId: string
    redirectUri: string
    state: string
}) {
    const url = new URL(GOOGLE_OAUTH_AUTHORIZE_URL)
    url.searchParams.set('client_id', input.clientId)
    url.searchParams.set('redirect_uri', input.redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', GOOGLE_CALENDAR_SCOPE)
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('include_granted_scopes', 'true')
    url.searchParams.set('prompt', 'consent')
    url.searchParams.set('state', input.state)
    return url.toString()
}
