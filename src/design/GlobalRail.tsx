'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Inbox, MessageSquare, Sparkles, Settings, Bot } from 'lucide-react'

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
                <div
                    className="h-8 w-8 rounded-full bg-gray-200 mx-auto flex items-center justify-center text-xs font-medium text-gray-600"
                    title={userName}
                >
                    {(userName?.[0] || 'U').toUpperCase()}
                </div>
            </div>
        </div>
    )
}
