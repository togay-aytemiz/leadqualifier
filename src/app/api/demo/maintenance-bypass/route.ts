import { NextRequest, NextResponse } from 'next/server'
import {
    DEMO_MAINTENANCE_BYPASS_CLEAR_VALUE,
    DEMO_MAINTENANCE_BYPASS_COOKIE,
    DEMO_MAINTENANCE_BYPASS_COOKIE_MAX_AGE_SECONDS,
    DEMO_MAINTENANCE_BYPASS_PARAM,
    createDemoMaintenanceBypassCookieValue,
    isDemoMaintenanceBypassTokenValid,
} from '@/lib/demo-chat/maintenance'
import { buildLocalizedPath, normalizeAppLocale } from '@/lib/i18n/locale-path'

export const runtime = 'nodejs'

const DEFAULT_DEMO_REDIRECT_PATH = '/demo/yiu-qualy-ai-demo'
const DEMO_REDIRECT_PATH_PATTERN = /^\/(?:(en|tr)\/)?demo\/([^/?#]+)$/

function normalizeDemoRedirectPath(pathname: string) {
    const match = pathname.match(DEMO_REDIRECT_PATH_PATTERN)
    if (!match) return null

    const locale = normalizeAppLocale(match[1])
    const slug = match[2]
    return buildLocalizedPath(`/demo/${slug}`, locale)
}

function buildCleanDemoRedirectUrl(req: NextRequest) {
    const rawNextPath = req.nextUrl.searchParams.get('next')?.trim() || DEFAULT_DEMO_REDIRECT_PATH

    let redirectUrl: URL
    try {
        redirectUrl = new URL(rawNextPath, req.nextUrl.origin)
    } catch {
        redirectUrl = new URL(DEFAULT_DEMO_REDIRECT_PATH, req.nextUrl.origin)
    }

    const canonicalPath = normalizeDemoRedirectPath(redirectUrl.pathname)
    if (redirectUrl.origin !== req.nextUrl.origin || !canonicalPath) {
        redirectUrl = new URL(DEFAULT_DEMO_REDIRECT_PATH, req.nextUrl.origin)
    } else {
        redirectUrl.pathname = canonicalPath
    }

    redirectUrl.search = ''
    return redirectUrl
}

function isSecureRequest(req: NextRequest) {
    return req.nextUrl.protocol === 'https:'
}

function escapeHtmlAttribute(value: string) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
}

function createCleanRedirectResponse(redirectUrl: URL) {
    const redirectTarget = redirectUrl.toString()
    const body = `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${escapeHtmlAttribute(redirectTarget)}"></head><body><script>window.location.replace(${JSON.stringify(redirectTarget)})</script></body></html>`

    return new NextResponse(body, {
        status: 200,
        headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'text/html; charset=utf-8',
        },
    })
}

export async function GET(req: NextRequest) {
    const bypassValue = req.nextUrl.searchParams.get(DEMO_MAINTENANCE_BYPASS_PARAM)
    const redirectUrl = buildCleanDemoRedirectUrl(req)
    const response = createCleanRedirectResponse(redirectUrl)

    if (bypassValue === DEMO_MAINTENANCE_BYPASS_CLEAR_VALUE) {
        response.cookies.set({
            name: DEMO_MAINTENANCE_BYPASS_COOKIE,
            value: '',
            path: '/',
            maxAge: 0,
            httpOnly: true,
            sameSite: 'lax',
            secure: isSecureRequest(req),
        })
        return response
    }

    if (!isDemoMaintenanceBypassTokenValid(bypassValue)) {
        return response
    }

    response.cookies.set({
        name: DEMO_MAINTENANCE_BYPASS_COOKIE,
        value: createDemoMaintenanceBypassCookieValue(),
        path: '/',
        maxAge: DEMO_MAINTENANCE_BYPASS_COOKIE_MAX_AGE_SECONDS,
        httpOnly: true,
        sameSite: 'lax',
        secure: isSecureRequest(req),
    })

    return response
}
