'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Bot, LogOut } from 'lucide-react'
import {
    HiOutlineChatBubbleBottomCenterText,
    HiMiniChatBubbleBottomCenterText,
    HiOutlineUser,
    HiMiniUser,
    HiOutlinePuzzlePiece,
    HiPuzzlePiece,
    HiOutlineCog6Tooth,
    HiMiniCog6Tooth,
    HiOutlineSparkles,
    HiSparkles,
    HiOutlineSquare3Stack3D,
    HiSquare3Stack3D
} from 'react-icons/hi2'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { shouldEnableManualRoutePrefetch } from '@/design/manual-prefetch'

interface GlobalRailProps {
    userName?: string
}

export function GlobalRail({ userName }: GlobalRailProps) {
    const pathname = usePathname()
    const router = useRouter()
    const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}\//, '/')
    const t = useTranslations('nav')
    const tc = useTranslations('common')

    const navItems = [
        {
            id: 'inbox',
            href: '/inbox',
            label: t('inbox'),
            icon: HiOutlineChatBubbleBottomCenterText,
            activeIcon: HiMiniChatBubbleBottomCenterText
        },
        {
            id: 'leads',
            href: '/leads',
            label: t('leads'),
            icon: HiOutlineUser,
            activeIcon: HiMiniUser
        },
        {
            id: 'simulator',
            href: '/simulator',
            label: t('simulator'),
            icon: HiOutlinePuzzlePiece,
            activeIcon: HiPuzzlePiece
        },
        {
            id: 'skills',
            href: '/skills',
            label: t('skills'),
            icon: HiOutlineSparkles,
            activeIcon: HiSparkles
        },
        {
            id: 'knowledge',
            href: '/knowledge',
            label: t('knowledgeBase'),
            icon: HiOutlineSquare3Stack3D,
            activeIcon: HiSquare3Stack3D
        },
    ]

    const isSettingsActive = pathWithoutLocale.startsWith('/settings')
    const SettingsIcon = isSettingsActive ? HiMiniCog6Tooth : HiOutlineCog6Tooth

    useEffect(() => {
        if (!shouldEnableManualRoutePrefetch()) return

        const timeoutId = window.setTimeout(() => {
            router.prefetch('/inbox')
            router.prefetch('/leads')
            router.prefetch('/simulator')
            router.prefetch('/skills')
            router.prefetch('/knowledge')
            router.prefetch('/settings/channels')
        }, 120)

        return () => {
            window.clearTimeout(timeoutId)
        }
    }, [router])

    return (
        <div className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4 gap-6 shrink-0 h-screen">
            {/* Logo */}
            <div className="h-8 w-8 bg-gray-900 rounded-lg flex items-center justify-center text-white mb-2">
                <Bot size={20} />
            </div>

            {/* Nav Items */}
            <div className="flex flex-col gap-2 w-full px-2">
                {navItems.map(item => {
                    const isActive = pathWithoutLocale.startsWith(item.href)
                    const Icon = isActive ? item.activeIcon : item.icon
                    return (
                        <Link
                            key={item.id}
                            href={item.href}
                            className={cn(
                                "h-10 w-full rounded-lg flex items-center justify-center cursor-pointer transition-colors",
                                isActive
                                    ? "bg-[#242A40] text-white"
                                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                            )}
                            title={item.label}
                        >
                            <Icon size={20} />
                        </Link>
                    )
                })}
            </div>

            {/* Bottom Items */}
            <div className="mt-auto flex flex-col gap-2 w-full px-2">
                <Link
                    href="/settings/channels"
                    className={cn(
                        "h-10 w-full rounded-lg flex items-center justify-center cursor-pointer transition-colors",
                        isSettingsActive
                            ? "bg-[#242A40] text-white"
                            : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                    )}
                    title={t('settings')}
                >
                    <SettingsIcon size={20} />
                </Link>

                <div className="relative group">
                    <button
                        className="h-8 w-8 rounded-full bg-gray-200 mx-auto flex items-center justify-center text-xs font-medium text-gray-600 hover:ring-2 hover:ring-[#242A40]/15 transition-all outline-none"
                        title={userName}
                    >
                        {(userName?.[0] || tc('defaultUserInitial')).toUpperCase()}
                    </button>

                    {/* Popover Menu - Visible on Hover/Focus-within */}
                    <div className="absolute left-full bottom-0 ml-2 mb-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-all duration-200 z-50">
                        <div className="px-3 py-2 border-b border-gray-50">
                            <p className="text-xs text-gray-500 truncate">{tc('loggedInAs')}</p>
                            <p className="text-sm font-medium text-gray-900 truncate" title={userName}>{userName || tc('defaultUserName')}</p>
                        </div>
                        <div className="p-1">
                            <form action="/api/auth/signout" method="POST">
                                <button
                                    type="submit"
                                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors flex items-center gap-2"
                                >
                                    <LogOut size={16} />
                                    {t('signout')}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
