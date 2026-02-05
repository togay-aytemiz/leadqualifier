"use client"

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button, PageHeader } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { updateOrganizationName } from '@/lib/organizations/actions'
import type { OfferingProfile, OfferingProfileSuggestion } from '@/types/database'
import { OfferingProfileSection } from '@/components/settings/OfferingProfileSection'
import {
    generateOfferingProfileSuggestions,
    getOfferingProfileSuggestions,
    archiveOfferingProfileSuggestion,
    updateOfferingProfileSummary,
    updateOfferingProfileLocaleForUser,
    updateOfferingProfileSuggestionStatus
} from '@/lib/leads/settings'
import { UnsavedChangesDialog } from '@/components/settings/UnsavedChangesDialog'
import { useUnsavedChangesGuard } from '@/components/settings/useUnsavedChangesGuard'

interface OrganizationSettingsClientProps {
    initialName: string
    organizationId: string
    offeringProfile: OfferingProfile | null
    offeringProfileSuggestions: OfferingProfileSuggestion[]
}

export default function OrganizationSettingsClient({
    initialName,
    organizationId,
    offeringProfile,
    offeringProfileSuggestions: initialSuggestions
}: OrganizationSettingsClientProps) {
    const t = useTranslations('organizationSettings')
    const tUnsaved = useTranslations('unsavedChanges')
    const locale = useLocale()
    const router = useRouter()
    const [baseline, setBaseline] = useState({
        name: initialName,
        profileSummary: offeringProfile?.summary ?? '',
        aiSuggestionsEnabled: offeringProfile?.ai_suggestions_enabled ?? false
    })
    const [name, setName] = useState(initialName)
    const [profileSummary, setProfileSummary] = useState(offeringProfile?.summary ?? '')
    const [aiSuggestionsEnabled, setAiSuggestionsEnabled] = useState(offeringProfile?.ai_suggestions_enabled ?? false)
    const [suggestions, setSuggestions] = useState(() => initialSuggestions.map((item) => ({
        ...item,
        status: item.status ?? 'pending'
    })))
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)
    const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false)
    const [localeSynced, setLocaleSynced] = useState(false)

    const isDirty = useMemo(() => {
        return (
            name !== baseline.name ||
            profileSummary !== baseline.profileSummary ||
            aiSuggestionsEnabled !== baseline.aiSuggestionsEnabled
        )
    }, [name, profileSummary, aiSuggestionsEnabled, baseline])

    useEffect(() => {
        setProfileSummary(offeringProfile?.summary ?? '')
        setAiSuggestionsEnabled(offeringProfile?.ai_suggestions_enabled ?? false)
        setBaseline(prev => ({
            ...prev,
            profileSummary: offeringProfile?.summary ?? '',
            aiSuggestionsEnabled: offeringProfile?.ai_suggestions_enabled ?? false
        }))
        setLocaleSynced(false)
    }, [offeringProfile])

    useEffect(() => {
        setSuggestions(initialSuggestions.map((item) => ({
            ...item,
            status: item.status ?? 'pending'
        })))
    }, [initialSuggestions])

    useEffect(() => {
        if (!offeringProfile || localeSynced) return
        if (offeringProfile.ai_suggestions_locale === locale) {
            setLocaleSynced(true)
            return
        }
        updateOfferingProfileLocaleForUser(locale)
            .then(async () => {
                const refreshedSuggestions = await getOfferingProfileSuggestions(organizationId, locale, { includeArchived: true })
                setSuggestions(refreshedSuggestions.map((item) => ({
                    ...item,
                    status: item.status ?? 'pending'
                })))
            })
            .catch((error) => {
                console.error('Failed to sync offering profile locale', error)
            })
            .finally(() => {
                setLocaleSynced(true)
            })
    }, [locale, localeSynced, offeringProfile, organizationId])

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

    const handleSave = async () => {
        if (!isDirty) return true
        setIsSaving(true)
        setSaveError(null)
        setSaved(false)
        try {
            if (name !== baseline.name) {
                await updateOrganizationName(name)
            }
            if (
                profileSummary !== baseline.profileSummary ||
                aiSuggestionsEnabled !== baseline.aiSuggestionsEnabled
            ) {
                await updateOfferingProfileSummary(organizationId, profileSummary, aiSuggestionsEnabled, locale)
                const refreshedSuggestions = await getOfferingProfileSuggestions(organizationId, locale, { includeArchived: true })
                setSuggestions(refreshedSuggestions.map((item) => ({
                    ...item,
                    status: item.status ?? 'pending'
                })))
            }
            setBaseline({ name, profileSummary, aiSuggestionsEnabled })
            setSaved(true)
            return true
        } catch (error) {
            console.error(error)
            setSaveError(t('saveError'))
            return false
        } finally {
            setIsSaving(false)
        }
    }

    const handleReviewSuggestion = async (suggestionId: string, status: 'approved' | 'rejected') => {
        try {
            await updateOfferingProfileSuggestionStatus(organizationId, suggestionId, status)
            const refreshedSuggestions = await getOfferingProfileSuggestions(organizationId, locale, { includeArchived: true })
            setSuggestions(refreshedSuggestions.map((item) => ({
                ...item,
                status: item.status ?? 'pending'
            })))
            window.dispatchEvent(new Event('pending-suggestions-updated'))
            router.refresh()
        } catch (error) {
            console.error(error)
        }
    }

    const handleArchiveSuggestion = async (suggestionId: string) => {
        try {
            await archiveOfferingProfileSuggestion(organizationId, suggestionId)
            const refreshedSuggestions = await getOfferingProfileSuggestions(organizationId, locale, { includeArchived: true })
            setSuggestions(refreshedSuggestions.map((item) => ({
                ...item,
                status: item.status ?? 'pending'
            })))
            window.dispatchEvent(new Event('pending-suggestions-updated'))
            router.refresh()
        } catch (error) {
            console.error(error)
        }
    }

    const handleGenerateSuggestions = async () => {
        if (isGeneratingSuggestions) return false
        setIsGeneratingSuggestions(true)
        try {
            const generated = await generateOfferingProfileSuggestions(organizationId)
            const refreshedSuggestions = await getOfferingProfileSuggestions(organizationId, locale, { includeArchived: true })
            setSuggestions(refreshedSuggestions.map((item) => ({
                ...item,
                status: item.status ?? 'pending'
            })))
            window.dispatchEvent(new Event('pending-suggestions-updated'))
            router.refresh()
            return generated
        } catch (error) {
            console.error(error)
            return false
        } finally {
            setIsGeneratingSuggestions(false)
        }
    }

    const handleDiscard = () => {
        setName(baseline.name)
        setProfileSummary(baseline.profileSummary)
        setAiSuggestionsEnabled(baseline.aiSuggestionsEnabled)
        setSaveError(null)
        setSaved(false)
    }

    const guard = useUnsavedChangesGuard({
        isDirty,
        onSave: handleSave,
        onDiscard: handleDiscard
    })

    return (
        <>
            <PageHeader
                title={t('pageTitle')}
                actions={
                    <Button
                        onClick={handleSave}
                        disabled={!isDirty || isSaving}
                        className={saved ? 'bg-green-500 hover:bg-green-500 text-white' : undefined}
                    >
                        {saved ? t('saved') : isSaving ? t('saving') : t('save')}
                    </Button>
                }
            />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-5xl mb-6">
                    <p className="text-sm text-gray-500">{t('description')}</p>
                    {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
                </div>

                <div className="max-w-5xl">
                    <SettingsSection
                        title={t('nameTitle')}
                        description={t('nameDescription')}
                    >
                        <input
                            type="text"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            aria-label={t('nameLabel')}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                        />
                    </SettingsSection>

                    <OfferingProfileSection
                        summary={profileSummary}
                        aiSuggestionsEnabled={aiSuggestionsEnabled}
                        suggestions={suggestions}
                        onSummaryChange={setProfileSummary}
                        onAiSuggestionsEnabledChange={setAiSuggestionsEnabled}
                        onReviewSuggestion={handleReviewSuggestion}
                        onArchiveSuggestion={handleArchiveSuggestion}
                        onGenerateSuggestions={handleGenerateSuggestions}
                        isGeneratingSuggestions={isGeneratingSuggestions}
                    />
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
