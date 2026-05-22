import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function resolveRequestOrigin(req: NextRequest) {
    return req.nextUrl.origin
}

export async function POST(req: NextRequest) {
    const supabase = await createClient()

    await supabase.auth.signOut()

    return NextResponse.redirect(new URL('/register', resolveRequestOrigin(req)))
}
