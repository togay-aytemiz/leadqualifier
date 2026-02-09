import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
    ACTIVE_ORG_COOKIE,
    assertSystemAdmin,
    getAccessibleOrganizationsForUser
} from '@/lib/organizations/active-context'
import { createClient } from '@/lib/supabase/server'

function buildCookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 365 // 1 year
    }
}

export async function POST(request: Request) {
    const supabase = await createClient()

    try {
        await assertSystemAdmin(supabase)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unauthorized'
        const status = message === 'Forbidden' ? 403 : 401
        return NextResponse.json({ error: message }, { status })
    }

    let organizationId: string | null = null
    try {
        const body = await request.json() as { organizationId?: string }
        organizationId = body.organizationId?.trim() || null
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    if (!organizationId) {
        return NextResponse.json({ error: 'organizationId is required' }, { status: 400 })
    }

    const access = await getAccessibleOrganizationsForUser(supabase)
    if (!access) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasAccess = access.organizations.some((organization) => organization.id === organizationId)
    if (!hasAccess) {
        return NextResponse.json({ error: 'Organization not accessible' }, { status: 403 })
    }

    const cookieStore = await cookies()
    cookieStore.set(ACTIVE_ORG_COOKIE, organizationId, buildCookieOptions())
    return NextResponse.json({ ok: true, organizationId })
}

export async function GET() {
    const supabase = await createClient()

    try {
        await assertSystemAdmin(supabase)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unauthorized'
        const status = message === 'Forbidden' ? 403 : 401
        return NextResponse.json({ error: message }, { status })
    }

    const access = await getAccessibleOrganizationsForUser(supabase)
    if (!access) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({
        organizations: access.organizations
    })
}

export async function DELETE() {
    const supabase = await createClient()

    try {
        await assertSystemAdmin(supabase)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unauthorized'
        const status = message === 'Forbidden' ? 403 : 401
        return NextResponse.json({ error: message }, { status })
    }

    const cookieStore = await cookies()
    cookieStore.delete(ACTIVE_ORG_COOKIE)
    return NextResponse.json({ ok: true })
}
