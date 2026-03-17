import type { GoogleTokenPayload } from '@/lib/calendar/types'

const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'

interface GoogleCalendarApiErrorShape {
    error?: {
        code?: number
        message?: string
    }
    error_description?: string
}

interface GoogleCalendarResponse<T> {
    data: T
}

interface GoogleFreeBusyResponse {
    calendars?: Record<string, { busy?: Array<{ start?: string, end?: string }> }>
}

interface GoogleCalendarDetailsResponse {
    id?: string
    summary?: string
    timeZone?: string
}

export interface GoogleCalendarBusyRange {
    startIso: string
    endIso: string
}

export interface GoogleCalendarEventInput {
    calendarId: string
    accessToken: string
    summary: string
    description?: string | null
    startIso: string
    endIso: string
    timezone: string
}

function buildGoogleCalendarErrorMessage(status: number, payload: unknown) {
    const typedPayload = payload as GoogleCalendarApiErrorShape | null
    const message = typedPayload?.error?.message
        || typedPayload?.error_description
        || `Google Calendar request failed with status ${status}`
    return `Google Calendar request failed: ${message}`
}

async function parseJsonResponse<T>(response: Response): Promise<GoogleCalendarResponse<T>> {
    const text = await response.text()
    const payload = text ? JSON.parse(text) as T | GoogleCalendarApiErrorShape : null

    if (!response.ok) {
        throw new Error(buildGoogleCalendarErrorMessage(response.status, payload))
    }

    return {
        data: (payload ?? {}) as T
    }
}

function buildFormBody(values: Record<string, string>) {
    const body = new URLSearchParams()
    for (const [key, value] of Object.entries(values)) {
        body.set(key, value)
    }
    return body
}

export async function exchangeGoogleCodeForToken(input: {
    clientId: string
    clientSecret: string
    redirectUri: string
    code: string
}): Promise<GoogleTokenPayload> {
    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: buildFormBody({
            client_id: input.clientId,
            client_secret: input.clientSecret,
            code: input.code,
            grant_type: 'authorization_code',
            redirect_uri: input.redirectUri
        })
    })

    const { data } = await parseJsonResponse<{
        access_token?: string
        refresh_token?: string
        token_type?: string
        expires_in?: number
        scope?: string
    }>(response)

    if (!data.access_token) {
        throw new Error('Google OAuth response did not include an access token')
    }

    const expiresAt = typeof data.expires_in === 'number'
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        tokenType: data.token_type ?? null,
        expiresAt,
        scopes: typeof data.scope === 'string'
            ? data.scope.split(/\s+/).map((scope) => scope.trim()).filter(Boolean)
            : []
    }
}

export async function refreshGoogleAccessToken(input: {
    clientId: string
    clientSecret: string
    refreshToken: string
}): Promise<GoogleTokenPayload> {
    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: buildFormBody({
            client_id: input.clientId,
            client_secret: input.clientSecret,
            grant_type: 'refresh_token',
            refresh_token: input.refreshToken
        })
    })

    const { data } = await parseJsonResponse<{
        access_token?: string
        token_type?: string
        expires_in?: number
        scope?: string
    }>(response)

    if (!data.access_token) {
        throw new Error('Google refresh response did not include an access token')
    }

    const expiresAt = typeof data.expires_in === 'number'
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null

    return {
        accessToken: data.access_token,
        refreshToken: input.refreshToken,
        tokenType: data.token_type ?? null,
        expiresAt,
        scopes: typeof data.scope === 'string'
            ? data.scope.split(/\s+/).map((scope) => scope.trim()).filter(Boolean)
            : []
    }
}

function buildGoogleCalendarHeaders(accessToken: string) {
    return {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
    }
}

export async function fetchGooglePrimaryCalendar(input: {
    accessToken: string
}) {
    const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}/calendars/primary`, {
        headers: buildGoogleCalendarHeaders(input.accessToken)
    })

    const { data } = await parseJsonResponse<GoogleCalendarDetailsResponse>(response)
    return {
        id: data.id ?? 'primary',
        summary: data.summary ?? null,
        timeZone: data.timeZone ?? null
    }
}

export async function queryGoogleFreeBusy(input: {
    accessToken: string
    calendarId: string
    timeMin: string
    timeMax: string
    timeZone: string
}) {
    const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}/freeBusy`, {
        method: 'POST',
        headers: buildGoogleCalendarHeaders(input.accessToken),
        body: JSON.stringify({
            timeMin: input.timeMin,
            timeMax: input.timeMax,
            timeZone: input.timeZone,
            items: [{ id: input.calendarId }]
        })
    })

    const { data } = await parseJsonResponse<GoogleFreeBusyResponse>(response)
    const busyEntries = data.calendars?.[input.calendarId]?.busy ?? []

    return busyEntries
        .map((entry) => ({
            startIso: entry.start ?? '',
            endIso: entry.end ?? ''
        }))
        .filter((entry) => entry.startIso && entry.endIso)
}

export async function createGoogleCalendarEvent(input: GoogleCalendarEventInput) {
    const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(input.calendarId)}/events`, {
        method: 'POST',
        headers: buildGoogleCalendarHeaders(input.accessToken),
        body: JSON.stringify({
            summary: input.summary,
            description: input.description ?? undefined,
            start: {
                dateTime: input.startIso,
                timeZone: input.timezone
            },
            end: {
                dateTime: input.endIso,
                timeZone: input.timezone
            }
        })
    })

    const { data } = await parseJsonResponse<{ id?: string }>(response)
    if (!data.id) {
        throw new Error('Google Calendar create event response did not include an event id')
    }

    return data.id
}

export async function updateGoogleCalendarEvent(input: GoogleCalendarEventInput & {
    eventId: string
}) {
    const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`, {
        method: 'PATCH',
        headers: buildGoogleCalendarHeaders(input.accessToken),
        body: JSON.stringify({
            summary: input.summary,
            description: input.description ?? undefined,
            start: {
                dateTime: input.startIso,
                timeZone: input.timezone
            },
            end: {
                dateTime: input.endIso,
                timeZone: input.timezone
            }
        })
    })

    await parseJsonResponse<{ id?: string }>(response)
}

export async function deleteGoogleCalendarEvent(input: {
    accessToken: string
    calendarId: string
    eventId: string
}) {
    const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${input.accessToken}`
        }
    })

    if (!response.ok && response.status !== 404) {
        const text = await response.text()
        const payload = text ? JSON.parse(text) as GoogleCalendarApiErrorShape : null
        throw new Error(buildGoogleCalendarErrorMessage(response.status, payload))
    }
}
