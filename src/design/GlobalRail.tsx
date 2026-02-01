'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Inbox, MessageSquare, Sparkles, Settings, Bot, LogOut } from 'lucide-react'

import { useTranslations } from 'next-intl'

interface GlobalRailProps {
    userName?: string
}

export function GlobalRail({ userName }: GlobalRailProps) {
    const pathname = usePathname()
    const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}\//, '/')
    const t = useTranslations('nav')

    const navItems = [
        { id: 'inbox', href: '/inbox', label: t('inbox'), icon: Inbox },
        { id: 'simulator', href: '/simulator', label: t('simulator'), icon: MessageSquare },
        { id: 'skills', href: '/skills', label: t('skills'), icon: Sparkles },
    ]

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
                    const Icon = item.icon
                    return (
                        <Link
                            key={item.id}
                            href={item.href}
                            prefetch={false}
                            className={cn(
                                "h-10 w-full rounded-lg flex items-center justify-center cursor-pointer transition-colors",
                                isActive
                                    ? "bg-blue-50 text-blue-600"
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
                        pathWithoutLocale.startsWith('/settings')
                            ? "bg-blue-50 text-blue-600"
                            : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                    )}
                    title={t('settings')}
                >
                    <Settings size={20} />
                </Link>

                <div className="relative group">
                    <button
                        className="h-8 w-8 rounded-full bg-gray-200 mx-auto flex items-center justify-center text-xs font-medium text-gray-600 hover:ring-2 hover:ring-blue-100 transition-all outline-none"
                        title={userName}
                    >
                        {(userName?.[0] || 'U').toUpperCase()}
                    </button>

                    {/* Popover Menu - Visible on Hover/Focus-within */}
                    <div className="absolute left-full bottom-0 ml-2 mb-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-all duration-200 z-50">
                        <div className="px-3 py-2 border-b border-gray-50">
                            <p className="text-xs text-gray-500 truncate">Logged in as</p>
                            <p className="text-sm font-medium text-gray-900 truncate" title={userName}>{userName || 'User'}</p>
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
