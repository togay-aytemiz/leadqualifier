import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function readHeaderValue(value: string | null) {
    if (!value) return null
    const firstValue = value.split(',')[0]?.trim() || null
    return firstValue || null
}

function resolveRequestOrigin(req: NextRequest) {
    const forwardedHost = readHeaderValue(req.headers.get('x-forwarded-host'))
    if (forwardedHost) {
        const forwardedProto = readHeaderValue(req.headers.get('x-forwarded-proto')) || 'https'
        try {
            return new URL(`${forwardedProto}://${forwardedHost}`).origin
        } catch {
            // fall back to request origin
        }
    }

    return req.nextUrl.origin
}

export async function POST(req: NextRequest) {
    const supabase = await createClient()

    await supabase.auth.signOut()

    return NextResponse.redirect(new URL('/register', resolveRequestOrigin(req)))
}
