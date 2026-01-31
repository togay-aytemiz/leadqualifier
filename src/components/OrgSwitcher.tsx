'use client'

import { useTranslations } from 'next-intl'
import type { Organization } from '@/types/database'

interface OrgSwitcherProps {
    organizations: Organization[]
    currentOrgId: string | null
    onSwitch: (orgId: string) => void
    isSystemAdmin?: boolean
}

export function OrgSwitcher({ organizations, currentOrgId, onSwitch, isSystemAdmin }: OrgSwitcherProps) {
    const t = useTranslations('common')

    const currentOrg = organizations.find(o => o.id === currentOrgId)

    if (organizations.length <= 1 && !isSystemAdmin) {
        return null
    }

    return (
        <div className="relative">
            <select
                value={currentOrgId || ''}
                onChange={(e) => onSwitch(e.target.value)}
                className="appearance-none bg-zinc-700/50 text-white text-sm rounded-lg px-4 py-2 pr-8 border border-zinc-600 focus:border-blue-500 focus:outline-none cursor-pointer"
            >
                {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                        {org.name}
                    </option>
                ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>
            {isSystemAdmin && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded-full">
                    Admin
                </span>
            )}
        </div>
    )
}
