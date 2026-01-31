import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { DashboardHeader } from '@/components/DashboardHeader'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient()
    const locale = await getLocale()
    const t = await getTranslations('nav')

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect(`/${locale}/login`)
    }

    // Get user's profile with admin status
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    const isSystemAdmin = profile?.is_system_admin ?? false

    // Get organizations based on admin status
    let organizations: { id: string; name: string; slug: string }[] = []

    if (isSystemAdmin) {
        // System admins see ALL organizations
        const { data } = await supabase.from('organizations').select('id, name, slug').order('name')
        organizations = data ?? []
    } else {
        // Regular users see only their organizations
        const { data: memberships } = await supabase
            .from('organization_members')
            .select('organizations(id, name, slug)')
            .eq('user_id', user.id)

        organizations =
            memberships
                ?.map((m) => m.organizations as unknown as { id: string; name: string; slug: string })
                .filter(Boolean) ?? []
    }

    return (
        <div className="min-h-screen bg-zinc-900">
            <DashboardHeader
                user={user}
                profile={profile}
                organizations={organizations}
                isSystemAdmin={isSystemAdmin}
            />
            <div className="flex">
                {/* Sidebar */}
                <aside className="w-64 border-r border-zinc-800 min-h-[calc(100vh-4rem)]">
                    <nav className="p-4 space-y-1">
                        <Link
                            href="/dashboard"
                            className="flex items-center gap-3 px-4 py-2.5 text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                                />
                            </svg>
                            {t('dashboard')}
                        </Link>
                        <Link
                            href="/inbox"
                            className="flex items-center gap-3 px-4 py-2.5 text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                            </svg>
                            Inbox
                        </Link>
                        <Link
                            href="/skills"
                            className="flex items-center gap-3 px-4 py-2.5 text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                                />
                            </svg>
                            {t('skills')}
                        </Link>
                        <Link
                            href="/simulator"
                            className="flex items-center gap-3 px-4 py-2.5 text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors"
                        >
                            <svg viewBox="0 0 24 24" height="20" width="20" preserveAspectRatio="xMidYMid meet" className="" fill="currentColor" enableBackground="new 0 0 24 24"><title>chat</title><path d="M19.005 3.175H4.674C3.642 3.175 3 3.789 3 4.821V21.02l3.544-3.514h12.461c1.033 0 2.064-1.06 2.064-2.093V4.821c-.001-1.032-1.032-1.646-2.064-1.646zm-4.989 9.869H6.666a.664.664 0 0 1 0-1.328h7.35a.664.664 0 0 1 0 1.328zm3.33 0h-1.328a.664.664 0 0 1 0-1.328h1.328a.664.664 0 0 1 0 1.328zm0-3.996H6.666a.664.664 0 0 1 0-1.328h10.68a.664.664 0 0 1 0 1.328z"></path></svg>
                            Simulator
                        </Link>

                        {isSystemAdmin && (
                            <>
                                <div className="pt-4 pb-2">
                                    <span className="px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                        Admin
                                    </span>
                                </div>
                                <Link
                                    href="/admin"
                                    className="flex items-center gap-3 px-4 py-2.5 text-purple-400 rounded-lg hover:bg-zinc-800 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                        />
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                        />
                                    </svg>
                                    {t('settings')}
                                </Link>
                                <Link
                                    href="/admin/organizations"
                                    className="flex items-center gap-3 px-4 py-2.5 text-purple-400 rounded-lg hover:bg-zinc-800 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                                        />
                                    </svg>
                                    Organizations
                                </Link>
                                <Link
                                    href="/admin/users"
                                    className="flex items-center gap-3 px-4 py-2.5 text-purple-400 rounded-lg hover:bg-zinc-800 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                                        />
                                    </svg>
                                    Users
                                </Link>
                            </>
                        )}
                    </nav>
                </aside>

                {/* Main content */}
                <main className="flex-1 p-8">{children}</main>
            </div>
        </div>
    )
}
