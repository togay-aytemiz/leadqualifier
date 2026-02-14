'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useTranslations } from 'next-intl'
import {
    HiMiniChatBubbleBottomCenterText,
    HiMiniSparkles,
    HiMiniSquare3Stack3D,
    HiMiniUser,
    HiOutlineChatBubbleBottomCenterText,
    HiOutlineSparkles,
    HiOutlineSquare3Stack3D,
    HiOutlineUser
} from 'react-icons/hi2'
import { LogOut, MoreHorizontal, Puzzle, Settings } from 'lucide-react'

import { cn } from '@/lib/utils'
import { resolveMobileNavActiveItem, type MobileNavItemId } from '@/design/mobile-navigation'
import { createClient } from '@/lib/supabase/client'
import type { OrganizationBillingAccount } from '@/types/database'
import { buildOrganizationBillingSnapshot, type OrganizationBillingSnapshot } from '@/lib/billing/snapshot'

interface NavItem {
    id: Exclude<MobileNavItemId, 'other'>
    href: string
    label: string
    icon: ComponentType<{ size?: number }>
    activeIcon: ComponentType<{ size?: number }>
}

function formatCredits(value: number) {
    const safe = Math.max(0, Number.isFinite(value) ? value : 0)
    return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    }).format(safe)
}

interface MobileBottomNavProps {
    activeOrganizationId?: string | null
}

export function MobileBottomNav({ activeOrganizationId = null }: MobileBottomNavProps) {
    const pathname = usePathname()
    const router = useRouter()
    const tNav = useTranslations('nav')
    const tSidebar = useTranslations('mainSidebar')
    const [isOtherOpen, setIsOtherOpen] = useState(false)
    const [billingSnapshot, setBillingSnapshot] = useState<OrganizationBillingSnapshot | null>(null)

    const activeItem = resolveMobileNavActiveItem(pathname)
    const supabase = useMemo(() => createClient(), [])

    const navItems = useMemo<NavItem[]>(
        () => [
            {
                id: 'inbox',
                href: '/inbox',
                label: tNav('inbox'),
                icon: HiOutlineChatBubbleBottomCenterText,
                activeIcon: HiMiniChatBubbleBottomCenterText
            },
            {
                id: 'contacts',
                href: '/leads',
                label: tNav('leads'),
                icon: HiOutlineUser,
                activeIcon: HiMiniUser
            },
            {
                id: 'skills',
                href: '/skills',
                label: tNav('skills'),
                icon: HiOutlineSparkles,
                activeIcon: HiMiniSparkles
            },
            {
                id: 'knowledge',
                href: '/knowledge',
                label: tNav('knowledgeBase'),
                icon: HiOutlineSquare3Stack3D,
                activeIcon: HiMiniSquare3Stack3D
            }
        ],
        [tNav]
    )

    useEffect(() => {
        const hotRoutes = ['/inbox', '/leads', '/skills', '/knowledge', '/simulator', '/settings', '/settings/plans', '/settings/billing']

        const prefetchRoutes = () => {
            hotRoutes.forEach((href) => router.prefetch(href))
        }

        const timeoutId = setTimeout(prefetchRoutes, 250)
        return () => clearTimeout(timeoutId)
    }, [router])

    useEffect(() => {
        let isActive = true

        const loadBillingSnapshot = async () => {
            if (!activeOrganizationId) {
                if (isActive) setBillingSnapshot(null)
                return
            }

            const { data, error } = await supabase
                .from('organization_billing_accounts')
                .select('*')
                .eq('organization_id', activeOrganizationId)
                .maybeSingle()

            if (!isActive) return

            if (error || !data) {
                if (error) {
                    console.error('Failed to load mobile billing status', error)
                }
                setBillingSnapshot(null)
                return
            }

            setBillingSnapshot(buildOrganizationBillingSnapshot(data as OrganizationBillingAccount))
        }

        loadBillingSnapshot()

        return () => {
            isActive = false
        }
    }, [activeOrganizationId, supabase])

    const billingMembershipLabel = useMemo(() => {
        if (!billingSnapshot) return tSidebar('billingUnavailable')

        switch (billingSnapshot.membershipState) {
        case 'trial_active':
            return tSidebar('billingTrialActive')
        case 'trial_exhausted':
            return tSidebar('billingTrialExhausted')
        case 'premium_active':
            return tSidebar('billingPremiumActive')
        case 'past_due':
            return tSidebar('billingPastDue')
        case 'canceled':
            return tSidebar('billingCanceled')
        case 'admin_locked':
            return tSidebar('billingAdminLocked')
        default:
            return billingSnapshot.membershipState
        }
    }, [billingSnapshot, tSidebar])
    const billingProgress = useMemo(() => {
        if (!billingSnapshot) return 0

        if (billingSnapshot.membershipState === 'trial_active' || billingSnapshot.membershipState === 'trial_exhausted') {
            return Math.max(
                billingSnapshot.trial.credits.progress,
                billingSnapshot.trial.timeProgress
            )
        }

        if (billingSnapshot.membershipState === 'premium_active') {
            if (billingSnapshot.package.credits.remaining <= 0 && billingSnapshot.topupBalance > 0) {
                return 100
            }
            return billingSnapshot.package.credits.progress
        }

        return 0
    }, [billingSnapshot])
    const billingSubline = useMemo(() => {
        if (!billingSnapshot) return tSidebar('billingUnavailableDescription')

        if (billingSnapshot.membershipState === 'trial_active' || billingSnapshot.membershipState === 'trial_exhausted') {
            return tSidebar('billingTrialSublineDetailed', {
                days: String(billingSnapshot.trial.remainingDays),
                credits: formatCredits(billingSnapshot.trial.credits.remaining)
            })
        }

        if (billingSnapshot.membershipState === 'premium_active'
            && billingSnapshot.package.credits.remaining <= 0
            && billingSnapshot.topupBalance > 0
        ) {
            return tSidebar('billingTopupSubline', {
                credits: formatCredits(billingSnapshot.topupBalance)
            })
        }

        return tSidebar('billingPackageSubline')
    }, [billingSnapshot, tSidebar])

    return (
        <>
            {isOtherOpen && (
                <>
                    <button
                        type="button"
                        aria-label={tNav('closeOtherMenu')}
                        onClick={() => setIsOtherOpen(false)}
                        className="fixed inset-0 z-40 bg-black/25 lg:hidden"
                    />
                    <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl lg:hidden">
                        {billingSnapshot && (
                            <Link
                                href="/settings/plans"
                                onClick={() => setIsOtherOpen(false)}
                                className="mb-1 block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700"
                            >
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    {tSidebar('billingStatusLabel')}
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                    {formatCredits(billingSnapshot.totalRemainingCredits)}
                                    <span className="ml-1 text-xs font-medium text-slate-500">{tSidebar('billingCreditsUnit')}</span>
                                </p>
                                <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                                    <div
                                        className="h-1.5 rounded-full bg-[#242A40]"
                                        style={{ width: `${Math.min(100, billingProgress)}%` }}
                                    />
                                </div>
                                <p className="mt-1 text-xs text-slate-500">{billingMembershipLabel}</p>
                                <p className="mt-0.5 text-xs text-slate-500">{billingSubline}</p>
                            </Link>
                        )}
                        <Link
                            href="/simulator"
                            onClick={() => setIsOtherOpen(false)}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                        >
                            <Puzzle size={16} />
                            {tNav('simulator')}
                        </Link>
                        <Link
                            href="/settings"
                            onClick={() => setIsOtherOpen(false)}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                        >
                            <Settings size={16} />
                            {tNav('settings')}
                        </Link>
                        <Link
                            href="/settings/plans"
                            onClick={() => setIsOtherOpen(false)}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                        >
                            <Settings size={16} />
                            {tNav('billing')}
                        </Link>
                        <Link
                            href="/settings/billing"
                            onClick={() => setIsOtherOpen(false)}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                        >
                            <Settings size={16} />
                            {tSidebar('billingUsageMenuLabel')}
                        </Link>
                        <form action="/api/auth/signout" method="POST">
                            <button
                                type="submit"
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                            >
                                <LogOut size={16} />
                                {tNav('signout')}
                            </button>
                        </form>
                    </div>
                </>
            )}

            <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
                <div className="grid grid-cols-5 gap-1 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
                    {navItems.map((item) => {
                        const isActive = activeItem === item.id
                        const Icon = isActive ? item.activeIcon : item.icon
                        return (
                            <Link
                                key={item.id}
                                href={item.href}
                                className={cn(
                                    'flex flex-col items-center justify-center rounded-xl py-1.5 text-[11px] font-medium transition-colors',
                                    isActive ? 'text-[#242A40]' : 'text-slate-500 hover:text-slate-900'
                                )}
                            >
                                <span className={cn(
                                    'mb-0.5 flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                                    isActive ? 'bg-[#242A40]/10' : 'bg-transparent'
                                )}>
                                    <Icon size={18} />
                                </span>
                                {item.label}
                            </Link>
                        )
                    })}

                    <button
                        type="button"
                        aria-expanded={isOtherOpen}
                        onClick={() => setIsOtherOpen(prev => !prev)}
                        className={cn(
                            'flex flex-col items-center justify-center rounded-xl py-1.5 text-[11px] font-medium transition-colors',
                            activeItem === 'other' || isOtherOpen
                                ? 'text-[#242A40]'
                                : 'text-slate-500 hover:text-slate-900'
                        )}
                    >
                        <span className={cn(
                            'mb-0.5 flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                            activeItem === 'other' || isOtherOpen ? 'bg-[#242A40]/10' : 'bg-transparent'
                        )}>
                            <MoreHorizontal size={18} />
                        </span>
                        {tNav('other')}
                    </button>
                </div>
            </nav>
        </>
    )
}
