'use client'

import { Sidebar, SidebarGroup, SidebarItem, PageHeader } from '@/design'
import { Zap, CreditCard, Receipt, Settings, Globe } from 'lucide-react'
import { useRouter, usePathname } from '@/i18n/navigation'
import { useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'

export default function GeneralSettingsPage() {
    const pathname = usePathname()
    const router = useRouter()
    const currentLocale = useLocale()
    const [isPending, startTransition] = useTransition()
    const tGeneral = useTranslations('General')
    const tSidebar = useTranslations('Sidebar')

    const handleLanguageChange = (newLang: string) => {
        const nextLocale = newLang as 'en' | 'tr'
        startTransition(() => {
            router.replace(pathname, { locale: nextLocale })
        })
    }

    return (
        <>
            {/* Inner Sidebar (Replicated) */}
            <Sidebar title={tSidebar('settings')}>
                <SidebarGroup title={tSidebar('preferences')}>
                    <SidebarItem icon={<Settings size={18} />} label={tSidebar('general')} active />
                </SidebarGroup>

                <SidebarGroup title={tSidebar('integrations')}>
                    <SidebarItem
                        icon={<Zap size={18} />}
                        label={tSidebar('channels')}
                        href={currentLocale === 'tr' ? '/settings/channels' : `/${currentLocale}/settings/channels`}
                    />
                </SidebarGroup>

                <SidebarGroup title={tSidebar('billing')}>
                    <SidebarItem
                        icon={<CreditCard size={18} />}
                        label={tSidebar('plans')}
                        href="#" // Placeholder
                    />
                    <SidebarItem
                        icon={<Receipt size={18} />}
                        label={tSidebar('receipts')}
                        href="#" // Placeholder
                    />
                </SidebarGroup>
            </Sidebar>

            {/* Main Content */}
            <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
                <PageHeader title={tGeneral('title')} />

                <div className="flex-1 overflow-auto p-8">
                    <div className="w-full space-y-8">
                        {/* Language Section */}
                        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500">
                                    <Globe size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold text-gray-900">{tGeneral('language')}</h3>
                                    <p className="text-sm text-gray-500">{tGeneral('languageDescription')}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div
                                    onClick={() => handleLanguageChange('en')}
                                    className={`cursor-pointer rounded-lg border p-4 flex items-center gap-3 transition-colors ${currentLocale === 'en'
                                        ? 'border-blue-500 bg-blue-50/50'
                                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                        }`}
                                >
                                    <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${currentLocale === 'en' ? 'border-blue-500' : 'border-gray-300'
                                        }`}>
                                        {currentLocale === 'en' && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                                    </div>
                                    <span className="text-sm font-medium text-gray-900">English</span>
                                </div>

                                <div
                                    onClick={() => handleLanguageChange('tr')}
                                    className={`cursor-pointer rounded-lg border p-4 flex items-center gap-3 transition-colors ${currentLocale === 'tr'
                                        ? 'border-blue-500 bg-blue-50/50'
                                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                        }`}
                                >
                                    <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${currentLocale === 'tr' ? 'border-blue-500' : 'border-gray-300'
                                        }`}>
                                        {currentLocale === 'tr' && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                                    </div>
                                    <span className="text-sm font-medium text-gray-900">Turkish (Türkçe)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
