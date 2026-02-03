'use client'

import { User } from '@supabase/supabase-js'
import type { Profile, Organization } from '@/types/database'
import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

interface DashboardHeaderProps {
    user: User
    profile: Profile | null
    organizations: Organization[]
    isSystemAdmin: boolean
}

export function DashboardHeader({ user, profile, organizations, isSystemAdmin }: DashboardHeaderProps) {
    const tCommon = useTranslations('common')
    const tNav = useTranslations('nav')
    const router = useRouter()
    const pathname = usePathname()

    // Get current org from URL or localStorage
    const [currentOrgId, setCurrentOrgId] = useState<string | null>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('currentOrgId') || organizations[0]?.id || null
        }
        return organizations[0]?.id || null
    })

    const handleOrgSwitch = (orgId: string) => {
        setCurrentOrgId(orgId)
        if (typeof window !== 'undefined') {
            localStorage.setItem('currentOrgId', orgId)
        }
        router.refresh()
    }

    const currentOrg = organizations.find((o) => o.id === currentOrgId) || organizations[0]

    return (
        <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-50">
            <div className="flex h-16 items-center justify-between px-6">
                <div className="flex items-center gap-6">
                    <span className="text-lg font-semibold text-white">{tCommon('appName')}</span>

                    {/* Org Switcher */}
                    {organizations.length > 0 && (
                        <div className="flex items-center gap-2">
                            <select
                                value={currentOrgId || ''}
                                onChange={(e) => handleOrgSwitch(e.target.value)}
                                className="appearance-none bg-zinc-800 text-white text-sm rounded-lg px-4 py-2 pr-8 border border-zinc-700 focus:border-blue-500 focus:outline-none cursor-pointer"
                            >
                                {organizations.map((org) => (
                                    <option key={org.id} value={org.id}>
                                        {org.name}
                                    </option>
                                ))}
                            </select>
                            {isSystemAdmin && (
                                <span className="px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded-full font-medium">
                                    {tCommon('adminBadge')}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-sm font-medium text-white">
                            {profile?.full_name || user.email?.split('@')[0]}
                        </p>
                        <p className="text-xs text-zinc-500">{user.email}</p>
                    </div>
                    <form action="/api/auth/signout" method="POST">
                        <button
                            type="submit"
                            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
                        >
                            {tNav('signout')}
                        </button>
                    </form>
                </div>
            </div>
        </header>
    )
}
