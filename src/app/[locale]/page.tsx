import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { resolveDefaultHomeRoute } from '@/lib/navigation/default-home-route'
import { hasSupabaseAuthCookie } from '@/lib/auth/supabase-auth-cookie'

export default async function Home() {
    const cookieStore = await cookies()
    if (!hasSupabaseAuthCookie(cookieStore.getAll())) {
        redirect('/login')
    }

    const orgContext = await resolveActiveOrganizationContext()
    redirect(resolveDefaultHomeRoute(orgContext))
}
