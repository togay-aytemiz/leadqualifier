import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { assertSystemAdmin } from '@/lib/organizations/active-context'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

interface RequireSystemAdminResult {
    supabase: SupabaseClient
    userId: string
}

export async function requireSystemAdmin(locale: string): Promise<RequireSystemAdminResult> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect(`/${locale}/login`)
    }

    try {
        await assertSystemAdmin(supabase)
    } catch {
        redirect(`/${locale}/inbox`)
    }

    return {
        supabase,
        userId: user.id
    }
}
