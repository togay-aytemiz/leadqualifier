'use client'

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Sidebar, SidebarGroup, SidebarItem } from '@/design'
import {
    HiOutlineBanknotes,
    HiOutlineBriefcase,
    HiOutlineChatBubbleLeftRight,
    HiOutlineCreditCard,
    HiOutlineSparkles,
    HiOutlineUserCircle
} from 'react-icons/hi2'
import {
    getSettingsNavItemFromPath,
    getSettingsMobileDetailPaneClasses,
    getSettingsMobileListPaneClasses,
    SETTINGS_MOBILE_BACK_EVENT,
    type SettingsNavItemId
} from '@/components/settings/mobilePaneState'

interface SettingsResponsiveShellProps {
    pendingCount: number
    children?: ReactNode
}

type SettingsGroup = 'preferences' | 'integrations' | 'billing'

interface SettingsNavItem {
    id: SettingsNavItemId
    group: SettingsGroup
    label: string
    href?: string
    active?: boolean
    indicator?: boolean
    icon: ReactNode
}

function getLocalizedHref(locale: string, href: string): string {
    if (locale === 'tr') return href
    return `/${locale}${href}`
}

export function SettingsResponsiveShell({ pendingCount, children }: SettingsResponsiveShellProps) {
    const locale = useLocale()
    const pathname = usePathname()
    const router = useRouter()
    const activeItem = getSettingsNavItemFromPath(pathname)
    const tSidebar = useTranslations('Sidebar')
    const hasDetail = Boolean(activeItem && children)
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isClosingRef = useRef(false)
    const settingsRootHref = getLocalizedHref(locale, '/settings')
    const navItems = useMemo<SettingsNavItem[]>(() => [
        {
            id: 'profile',
            group: 'preferences',
            label: tSidebar('profile'),
            href: getLocalizedHref(locale, '/settings/profile'),
            icon: <HiOutlineUserCircle size={18} />,
            active: activeItem === 'profile'
        },
        {
            id: 'organization',
            group: 'preferences',
            label: tSidebar('organization'),
            href: getLocalizedHref(locale, '/settings/organization'),
            icon: <HiOutlineBriefcase size={18} />,
            active: activeItem === 'organization',
            indicator: pendingCount > 0
        },
        {
            id: 'ai',
            group: 'preferences',
            label: tSidebar('ai'),
            href: getLocalizedHref(locale, '/settings/ai'),
            icon: <HiOutlineSparkles size={18} />,
            active: activeItem === 'ai'
        },
        {
            id: 'channels',
            group: 'integrations',
            label: tSidebar('channels'),
            href: getLocalizedHref(locale, '/settings/channels'),
            icon: <HiOutlineChatBubbleLeftRight size={18} />,
            active: activeItem === 'channels'
        },
        {
            id: 'plans',
            group: 'billing',
            label: tSidebar('plans'),
            href: getLocalizedHref(locale, '/settings/plans'),
            icon: <HiOutlineCreditCard size={18} />,
            active: activeItem === 'plans'
        },
        {
            id: 'billing',
            group: 'billing',
            label: tSidebar('receipts'),
            href: getLocalizedHref(locale, '/settings/billing'),
            icon: <HiOutlineBanknotes size={18} />,
            active: activeItem === 'billing'
        }
    ], [activeItem, locale, pendingCount, tSidebar])
    const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false)

    useEffect(() => {
        if (!hasDetail) {
            const frame = window.requestAnimationFrame(() => {
                setIsMobileDetailOpen(false)
            })
            return () => window.cancelAnimationFrame(frame)
        }

        const frame = window.requestAnimationFrame(() => {
            setIsMobileDetailOpen(true)
        })

        return () => window.cancelAnimationFrame(frame)
    }, [hasDetail, pathname])

    useEffect(() => {
        return () => {
            if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current)
            }
        }
    }, [])

    const navigateBackToSettings = useCallback(() => {
        if (!hasDetail || isClosingRef.current) return

        isClosingRef.current = true
        setIsMobileDetailOpen(false)

        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current)
        }

        closeTimeoutRef.current = setTimeout(() => {
            router.replace(settingsRootHref)
            closeTimeoutRef.current = null
            isClosingRef.current = false
        }, 220)
    }, [hasDetail, router, settingsRootHref])

    useEffect(() => {
        const handleBack = () => {
            navigateBackToSettings()
        }

        window.addEventListener(SETTINGS_MOBILE_BACK_EVENT, handleBack)
        return () => window.removeEventListener(SETTINGS_MOBILE_BACK_EVENT, handleBack)
    }, [navigateBackToSettings])

    useEffect(() => {
        const routes = navItems
            .map((item) => item.href)
            .filter((href): href is string => Boolean(href))

        const prefetchRoutes = () => {
            routes.forEach((href) => {
                router.prefetch(href)
            })
        }

        const timeoutId = setTimeout(prefetchRoutes, 250)
        return () => clearTimeout(timeoutId)
    }, [navItems, router])

    const mobileListPaneClasses = getSettingsMobileListPaneClasses(isMobileDetailOpen)
    const mobileDetailPaneClasses = getSettingsMobileDetailPaneClasses(isMobileDetailOpen)

    const renderNavGroups = () => {
        const preferences = navItems.filter((item) => item.group === 'preferences')
        const integrations = navItems.filter((item) => item.group === 'integrations')
        const billing = navItems.filter((item) => item.group === 'billing')

        return (
            <>
                <SidebarGroup title={tSidebar('preferences')}>
                    {preferences.map((item) => (
                        <SidebarItem
                            key={item.id}
                            icon={item.icon}
                            label={item.label}
                            href={item.href}
                            active={item.active}
                            indicator={item.indicator}
                        />
                    ))}
                </SidebarGroup>

                <SidebarGroup title={tSidebar('integrations')}>
                    {integrations.map((item) => (
                        <SidebarItem
                            key={item.id}
                            icon={item.icon}
                            label={item.label}
                            href={item.href}
                            active={item.active}
                        />
                    ))}
                </SidebarGroup>

                <SidebarGroup title={tSidebar('billing')}>
                    {billing.map((item) => (
                        <SidebarItem
                            key={item.id}
                            icon={item.icon}
                            label={item.label}
                            href={item.href}
                            active={item.active}
                        />
                    ))}
                </SidebarGroup>
            </>
        )
    }

    return (
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
            <div className="hidden h-full lg:flex">
                <Sidebar title={tSidebar('settings')}>
                    {renderNavGroups()}
                </Sidebar>
            </div>

            <div
                className={cn(
                    'absolute inset-0 z-20 flex h-full w-full flex-col border-r border-gray-200 bg-gray-50/50 transition-transform duration-300 ease-out lg:hidden',
                    mobileListPaneClasses
                )}
            >
                <div className="h-14 flex items-center justify-between border-b border-gray-200 bg-gray-50/50 px-6 shrink-0">
                    <h2 className="text-xl font-bold text-gray-900">{tSidebar('settings')}</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-6">
                    {renderNavGroups()}
                </div>
            </div>

            <div
                className={cn(
                    'absolute inset-0 z-30 min-w-0 transition-transform duration-300 ease-out lg:static lg:z-auto lg:flex lg:min-w-0 lg:flex-1 lg:translate-x-0 lg:pointer-events-auto lg:transition-none',
                    mobileDetailPaneClasses
                )}
            >
                <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white">
                    {children}
                </div>
            </div>
        </div>
    )
}
