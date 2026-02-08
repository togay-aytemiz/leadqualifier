'use client'

import { PageHeader } from '@/design'
import { useRouter, usePathname } from '@/i18n/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { Button } from '@/design'
import { UnsavedChangesDialog } from '@/components/settings/UnsavedChangesDialog'
import { useUnsavedChangesGuard } from '@/components/settings/useUnsavedChangesGuard'
import { updateOfferingProfileLocaleForUser } from '@/lib/leads/settings'

export default function GeneralSettingsClient() {
    const pathname = usePathname()
    const router = useRouter()
    const currentLocale = useLocale()
    const [isPending, startTransition] = useTransition()
    const tGeneral = useTranslations('General')
    const tSidebar = useTranslations('Sidebar')
    const tUnsaved = useTranslations('unsavedChanges')
    const [selectedLocale, setSelectedLocale] = useState(currentLocale)
    const [baselineLocale, setBaselineLocale] = useState(currentLocale)
    const [isSaving, setIsSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [saveRequested, setSaveRequested] = useState(false)

    const isDirty = useMemo(() => selectedLocale !== baselineLocale, [selectedLocale, baselineLocale])

    const handleLanguageChange = (newLang: string) => {
        const nextLocale = newLang as 'en' | 'tr'
        setSelectedLocale(nextLocale)
    }

    const handleSave = async () => {
        if (!isDirty) return true
        setIsSaving(true)
        setSaveRequested(true)
        const nextLocale = selectedLocale as 'en' | 'tr'
        setBaselineLocale(nextLocale)
        setSaved(false)

        try {
            await updateOfferingProfileLocaleForUser(nextLocale)
        } catch (error) {
            console.error('Failed to sync offering profile locale', error)
        }

        startTransition(() => {
            router.replace(pathname, { locale: nextLocale })
        })
        return true
    }

    useEffect(() => {
        if (!isPending) {
            if (saveRequested) {
                setSaved(true)
                setSaveRequested(false)
            }
            setIsSaving(false)
        }
    }, [isPending])

    useEffect(() => {
        if (isDirty) {
            setSaved(false)
        }
    }, [isDirty])

    useEffect(() => {
        if (!saved) return
        const timeout = window.setTimeout(() => {
            setSaved(false)
        }, 2500)
        return () => window.clearTimeout(timeout)
    }, [saved])

    useEffect(() => {
        setSelectedLocale(currentLocale)
        setBaselineLocale(currentLocale)
        setSaveRequested(false)
        setSaved(false)
    }, [currentLocale])

    const handleDiscard = () => {
        setSelectedLocale(currentLocale)
    }

    const transformPendingHref = (href: string) => {
        if (selectedLocale === currentLocale) return href

        const hasLocalePrefix = (locale: string, path: string) =>
            path === `/${locale}` || path.startsWith(`/${locale}/`)

        let nextHref = href

        if (currentLocale !== 'tr' && hasLocalePrefix(currentLocale, nextHref)) {
            nextHref = nextHref.replace(new RegExp(`^/${currentLocale}(?=/|$)`), '')
            if (!nextHref.startsWith('/')) {
                nextHref = `/${nextHref}`
            }
        }

        if (selectedLocale !== 'tr' && !hasLocalePrefix(selectedLocale, nextHref)) {
            nextHref = `/${selectedLocale}${nextHref}`
        }

        return nextHref || '/'
    }

    const guard = useUnsavedChangesGuard({
        isDirty,
        onSave: handleSave,
        onDiscard: handleDiscard,
        transformPendingHref
    })

    return (
        <>
            <PageHeader
                title={tSidebar('general')}
                actions={
                    <Button
                        onClick={handleSave}
                        disabled={!isDirty || isSaving}
                        className={saved ? 'bg-green-500 hover:bg-green-500 text-white' : undefined}
                    >
                        {saved ? tGeneral('saved') : isSaving ? tGeneral('saving') : tGeneral('save')}
                    </Button>
                }
            />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-5xl">
                    <SettingsSection
                        title={tGeneral('language')}
                        description={tGeneral('languageDescription')}
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div
                                onClick={() => handleLanguageChange('en')}
                                className={`cursor-pointer rounded-lg border p-4 flex items-center gap-3 transition-colors ${selectedLocale === 'en'
                                    ? 'border-blue-500 bg-blue-50/50'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                            >
                                <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${selectedLocale === 'en' ? 'border-blue-500' : 'border-gray-300'
                                    }`}>
                                    {selectedLocale === 'en' && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                                </div>
                                <span className="text-sm font-medium text-gray-900">{tGeneral('languageEnglish')}</span>
                            </div>

                            <div
                                onClick={() => handleLanguageChange('tr')}
                                className={`cursor-pointer rounded-lg border p-4 flex items-center gap-3 transition-colors ${selectedLocale === 'tr'
                                    ? 'border-blue-500 bg-blue-50/50'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                            >
                                <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${selectedLocale === 'tr' ? 'border-blue-500' : 'border-gray-300'
                                    }`}>
                                    {selectedLocale === 'tr' && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                                </div>
                                <span className="text-sm font-medium text-gray-900">{tGeneral('languageTurkish')}</span>
                            </div>
                        </div>
                    </SettingsSection>
                </div>
            </div>

            <UnsavedChangesDialog
                isOpen={guard.isDialogOpen}
                title={tUnsaved('title')}
                description={tUnsaved('description')}
                stayText={tUnsaved('stay')}
                discardText={tUnsaved('discard')}
                saveText={tUnsaved('save')}
                isSaving={guard.isSaving}
                onStay={guard.closeDialog}
                onDiscard={guard.handleDiscard}
                onSave={guard.handleSave}
            />
        </>
    )
}
