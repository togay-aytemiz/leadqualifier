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

interface NavItem {
    id: Exclude<MobileNavItemId, 'other'>
    href: string
    label: string
    icon: ComponentType<{ size?: number }>
    activeIcon: ComponentType<{ size?: number }>
}

export function MobileBottomNav() {
    const pathname = usePathname()
    const router = useRouter()
    const tNav = useTranslations('nav')
    const [isOtherOpen, setIsOtherOpen] = useState(false)

    const activeItem = resolveMobileNavActiveItem(pathname)

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
        const hotRoutes = ['/inbox', '/leads', '/skills', '/knowledge', '/simulator', '/settings']
        hotRoutes.forEach((href) => router.prefetch(href))
    }, [router])

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
