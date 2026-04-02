import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { buildLocalizedPath } from '@/lib/i18n/locale-path'

export const runtime = 'nodejs'

function createServiceRoleClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceRoleKey) return null

    return createServiceClient(url, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
}

function resolveLocale(value: string | null): 'tr' | 'en' {
    return value?.toLowerCase().startsWith('en') ? 'en' : 'tr'
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

function buildPlansRedirectUrl(input: {
    req: NextRequest
    locale: 'tr' | 'en'
    status: 'success' | 'error'
    error?: string | null
}) {
    const query = new URLSearchParams()
    query.set('payment_recovery_action', 'card_update')
    query.set('payment_recovery_status', input.status)
    if (input.error) query.set('payment_recovery_error', input.error)
    return new URL(`${buildLocalizedPath('/settings/plans', input.locale)}?${query.toString()}`, input.req.nextUrl.origin)
}

async function readCallbackPayload(req: NextRequest) {
    const contentType = req.headers.get('content-type')?.toLowerCase() ?? ''
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
        const formData = await req.formData()
        return Object.fromEntries(formData.entries())
    }

    if (contentType.includes('application/json')) {
        const payload = await req.json().catch(() => null)
        return asRecord(payload)
    }

    return {}
}

async function handle(req: NextRequest) {
    const locale = resolveLocale(req.nextUrl.searchParams.get('locale'))
    const callbackPayload = await readCallbackPayload(req)
    const recordId = req.nextUrl.searchParams.get('recordId')?.trim()
        || (typeof callbackPayload.conversationId === 'string' ? callbackPayload.conversationId.trim() : '')

    const status = typeof callbackPayload.status === 'string'
        ? callbackPayload.status.toLowerCase()
        : ''
    const redirectStatus = status === 'success' ? 'success' : 'error'

    const serviceSupabase = createServiceRoleClient()
    if (!serviceSupabase || !recordId) {
        return NextResponse.redirect(buildPlansRedirectUrl({
            req,
            locale,
            status: 'error',
            error: 'request_failed'
        }))
    }

    const { data: subscriptionRecord, error: subscriptionError } = await serviceSupabase
        .from('organization_subscription_records')
        .select('id, metadata')
        .eq('id', recordId)
        .eq('provider', 'iyzico')
        .maybeSingle()

    if (subscriptionError || !subscriptionRecord) {
        return NextResponse.redirect(buildPlansRedirectUrl({
            req,
            locale,
            status: 'error',
            error: 'request_failed'
        }))
    }

    const metadata = asRecord(subscriptionRecord.metadata)
    const { error: updateError } = await serviceSupabase
        .from('organization_subscription_records')
        .update({
            metadata: {
                ...metadata,
                last_card_update_callback_at: new Date().toISOString(),
                last_card_update_callback_payload: callbackPayload
            }
        })
        .eq('id', recordId)

    if (updateError) {
        return NextResponse.redirect(buildPlansRedirectUrl({
            req,
            locale,
            status: 'error',
            error: 'request_failed'
        }))
    }

    return NextResponse.redirect(buildPlansRedirectUrl({
        req,
        locale,
        status: redirectStatus,
        error: redirectStatus === 'error' ? 'request_failed' : null
    }))
}

export async function GET(req: NextRequest) {
    return handle(req)
}

export async function POST(req: NextRequest) {
    return handle(req)
}
