import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient()
    const locale = await getLocale()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect(`/${locale}/login`)
    }

    return (
        <div className="min-h-screen bg-zinc-900">
            <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
                    <div className="flex items-center gap-4">
                        <span className="text-lg font-semibold text-white">Lead Qualifier</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-zinc-400">{user.email}</span>
                        <form action="/api/auth/signout" method="POST">
                            <button
                                type="submit"
                                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
                            >
                                Çıkış
                            </button>
                        </form>
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
        </div>
    )
}
