'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'



// Internal nav items
const navItems = [
    { id: 'inbox', href: '/inbox', label: 'Inbox', icon: 'inbox' },
    { id: 'simulator', href: '/simulator', label: 'Simulator', icon: 'chat_bubble' },
    { id: 'skills', href: '/skills', label: 'Skills', icon: 'auto_awesome' },
]

export function GlobalRail() {
    const pathname = usePathname()
    const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}\//, '/')

    return (
        <div className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4 gap-6 shrink-0 h-screen">
            {/* Logo */}
            <div className="h-8 w-8 bg-gray-900 rounded-lg flex items-center justify-center text-white mb-2">
                <span className="material-symbols-outlined text-[20px]">dataset</span>
            </div>

            {/* Nav Items */}
            <div className="flex flex-col gap-2 w-full px-2">
                {navItems.map(item => {
                    const isActive = pathWithoutLocale.startsWith(item.href)
                    return (
                        <Link
                            key={item.id}
                            href={item.href}
                            className={cn(
                                "h-10 w-full rounded-lg flex items-center justify-center cursor-pointer transition-colors",
                                isActive
                                    ? "bg-blue-50 text-blue-600"
                                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                            )}
                        >
                            <span className="material-symbols-outlined">{item.icon}</span>
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
                >
                    <span className="material-symbols-outlined">settings</span>
                </Link>
                <div className="h-8 w-8 rounded-full bg-gray-200 mx-auto" />
            </div>
        </div>
    )
}
