"use client"

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { usePathname, useRouter as useLocaleRouter } from '@/i18n/navigation'
import { Button, PageHeader } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { transformPendingHrefForLocale } from '@/components/settings/localeHref'
import { updateOrganizationBillingRegion, updateOrganizationName } from '@/lib/organizations/actions'
import type { OfferingProfile, OfferingProfileSuggestion } from '@/types/database'
import { OfferingProfileSection } from '@/components/settings/OfferingProfileSection'
import { RequiredIntakeFieldsSection } from '@/components/settings/RequiredIntakeFieldsSection'
import {
    archiveOfferingProfileSuggestion,
    generateOfferingProfileSuggestions,
    getOfferingProfileSuggestions,
    syncOfferingProfileSummary,
    updateOfferingProfileLocaleForUser,
    updateOfferingProfileSuggestionStatus,
    updateOfferingProfileSummary
} from '@/lib/leads/settings'
import { mergeOfferingProfileItems, serializeOfferingProfileItems } from '@/lib/leads/offering-profile-content'
import { normalizeIntakeFields } from '@/lib/leads/offering-profile-utils'
import { UnsavedChangesDialog } from '@/components/settings/UnsavedChangesDialog'
import { useUnsavedChangesGuard } from '@/components/settings/useUnsavedChangesGuard'

interface OrganizationSettingsClientProps {
    initialName: string
    initialBillingRegion: 'TR' | 'INTL'
    organizationId: string
    offeringProfile: OfferingProfile | null
    offeringProfileSuggestions: OfferingProfileSuggestion[]
}

export default function OrganizationSettingsClient({
    initialName,
    initialBillingRegion,
    organizationId,
    offeringProfile,
    offeringProfileSuggestions: initialSuggestions
}: OrganizationSettingsClientProps) {
    const t = useTranslations('organizationSettings')
    const tUnsaved = useTranslations('unsavedChanges')
    const locale = useLocale() as 'en' | 'tr'
    const router = useRouter()
    const localeRouter = useLocaleRouter()
    const pathname = usePathname()
    const [, startTransition] = useTransition()
    const searchParams = useSearchParams()
    const autoOpenOfferingSuggestions = searchParams.get('focus') === 'offering-suggestions'
    const initialRequiredFields = normalizeIntakeFields(offeringProfile?.required_intake_fields ?? [])
    const initialRequiredFieldsAi = normalizeIntakeFields(offeringProfile?.required_intake_fields_ai ?? [])

    const [baseline, setBaseline] = useState({
        name: initialName,
        billingRegion: initialBillingRegion,
        locale,
        profileSummary: offeringProfile?.summary ?? '',
        manualProfileNote: offeringProfile?.manual_profile_note ?? '',
        offeringProfileAiEnabled: offeringProfile?.ai_suggestions_enabled ?? false,
        requiredIntakeFieldsAiEnabled: offeringProfile?.required_intake_fields_ai_enabled ?? true,
        requiredIntakeFields: initialRequiredFields,
        requiredIntakeFieldsAi: initialRequiredFieldsAi
    })

    const [name, setName] = useState(initialName)
    const [selectedBillingRegion, setSelectedBillingRegion] = useState<'TR' | 'INTL'>(initialBillingRegion)
    const [selectedLocale, setSelectedLocale] = useState<'en' | 'tr'>(locale)
    const [profileSummary, setProfileSummary] = useState(offeringProfile?.summary ?? '')
    const [manualProfileNote, setManualProfileNote] = useState(offeringProfile?.manual_profile_note ?? '')
    const [offeringProfileAiEnabled, setOfferingProfileAiEnabled] = useState(offeringProfile?.ai_suggestions_enabled ?? false)
    const [requiredIntakeFieldsAiEnabled, setRequiredIntakeFieldsAiEnabled] = useState(offeringProfile?.required_intake_fields_ai_enabled ?? true)
    const [requiredIntakeFields, setRequiredIntakeFields] = useState(initialRequiredFields)
    const [requiredIntakeFieldsAi, setRequiredIntakeFieldsAi] = useState(initialRequiredFieldsAi)
    const [suggestions, setSuggestions] = useState(() => initialSuggestions.map((item) => ({
        ...item,
        status: item.status ?? 'pending'
    })))

    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)
    const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false)
    const [localeSynced, setLocaleSynced] = useState(false)

    const normalizedRequiredIntakeFields = useMemo(() => {
        return normalizeIntakeFields(requiredIntakeFields)
    }, [requiredIntakeFields])

    const normalizedRequiredIntakeFieldsAi = useMemo(() => {
        const fieldSet = new Set(normalizedRequiredIntakeFields.map((field) => field.trim().toLowerCase()))
        return normalizeIntakeFields(
            requiredIntakeFieldsAi.filter((field) => fieldSet.has(field.trim().toLowerCase()))
        )
    }, [normalizedRequiredIntakeFields, requiredIntakeFieldsAi])

    const isDirty = useMemo(() => {
        return (
            name !== baseline.name ||
            selectedBillingRegion !== baseline.billingRegion ||
            selectedLocale !== baseline.locale ||
            profileSummary !== baseline.profileSummary ||
            manualProfileNote !== baseline.manualProfileNote ||
            offeringProfileAiEnabled !== baseline.offeringProfileAiEnabled ||
            requiredIntakeFieldsAiEnabled !== baseline.requiredIntakeFieldsAiEnabled ||
            normalizedRequiredIntakeFields.join('|') !== baseline.requiredIntakeFields.join('|') ||
            normalizedRequiredIntakeFieldsAi.join('|') !== baseline.requiredIntakeFieldsAi.join('|')
        )
    }, [
        name,
        selectedBillingRegion,
        selectedLocale,
        profileSummary,
        manualProfileNote,
        offeringProfileAiEnabled,
        requiredIntakeFieldsAiEnabled,
        normalizedRequiredIntakeFields,
        normalizedRequiredIntakeFieldsAi,
        baseline
    ])

    useEffect(() => {
        const nextSummary = offeringProfile?.summary ?? ''
        const nextManualProfileNote = offeringProfile?.manual_profile_note ?? ''
        const nextOfferingProfileAiEnabled = offeringProfile?.ai_suggestions_enabled ?? false
        const nextRequiredIntakeFieldsAiEnabled = offeringProfile?.required_intake_fields_ai_enabled ?? true
        const nextRequiredFields = normalizeIntakeFields(offeringProfile?.required_intake_fields ?? [])
        const nextRequiredFieldsAi = normalizeIntakeFields(offeringProfile?.required_intake_fields_ai ?? [])

        setProfileSummary(nextSummary)
        setManualProfileNote(nextManualProfileNote)
        setOfferingProfileAiEnabled(nextOfferingProfileAiEnabled)
        setRequiredIntakeFieldsAiEnabled(nextRequiredIntakeFieldsAiEnabled)
        setRequiredIntakeFields(nextRequiredFields)
        setRequiredIntakeFieldsAi(nextRequiredFieldsAi)
        setBaseline((prev) => ({
            ...prev,
            profileSummary: nextSummary,
            manualProfileNote: nextManualProfileNote,
            offeringProfileAiEnabled: nextOfferingProfileAiEnabled,
            requiredIntakeFieldsAiEnabled: nextRequiredIntakeFieldsAiEnabled,
            requiredIntakeFields: nextRequiredFields,
            requiredIntakeFieldsAi: nextRequiredFieldsAi
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
        setSelectedLocale(locale)
        setBaseline((prev) => ({ ...prev, locale }))
    }, [locale])

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

    const deriveSummaryFromApprovedSuggestions = (allSuggestions: OfferingProfileSuggestion[], customNote: string) => {
        const approvedItems = allSuggestions
            .filter((item) => item.status === 'approved' && !item.update_of && !item.archived_at)
            .map((item) => item.content)
        const approvedSummary = serializeOfferingProfileItems(mergeOfferingProfileItems([], approvedItems))
        const trimmedCustomNote = customNote.trim()
        if (!trimmedCustomNote) return approvedSummary
        if (!approvedSummary) return trimmedCustomNote
        return `${approvedSummary}\n\n${trimmedCustomNote}`
    }

    const refreshSuggestions = async (suggestionLocale: 'en' | 'tr' = locale) => {
        const refreshed = await getOfferingProfileSuggestions(organizationId, suggestionLocale, { includeArchived: true })
        const normalized = refreshed.map((item) => ({ ...item, status: item.status ?? 'pending' }))
        setSuggestions(normalized)
        return normalized
    }

    const syncSummaryWithApprovedSuggestions = async (allSuggestions: OfferingProfileSuggestion[]) => {
        if (!offeringProfileAiEnabled) return
        const nextSummary = deriveSummaryFromApprovedSuggestions(allSuggestions, baseline.manualProfileNote)
        setProfileSummary(nextSummary)
        setBaseline((prev) => ({ ...prev, profileSummary: nextSummary }))
        await syncOfferingProfileSummary(organizationId, nextSummary)
    }

    const handleSave = async () => {
        if (!isDirty) return true

        setIsSaving(true)
        setSaveError(null)
        setSaved(false)

        try {
            const nextLocale = selectedLocale
            const localeChanged = nextLocale !== baseline.locale

            if (localeChanged) {
                await updateOfferingProfileLocaleForUser(nextLocale)
            }

            if (name !== baseline.name) {
                await updateOrganizationName(name)
            }
            if (selectedBillingRegion !== baseline.billingRegion) {
                await updateOrganizationBillingRegion(selectedBillingRegion)
            }

            const effectiveSummary = offeringProfileAiEnabled
                ? deriveSummaryFromApprovedSuggestions(suggestions, manualProfileNote)
                : profileSummary

            if (
                effectiveSummary !== baseline.profileSummary ||
                manualProfileNote !== baseline.manualProfileNote ||
                offeringProfileAiEnabled !== baseline.offeringProfileAiEnabled ||
                requiredIntakeFieldsAiEnabled !== baseline.requiredIntakeFieldsAiEnabled ||
                normalizedRequiredIntakeFields.join('|') !== baseline.requiredIntakeFields.join('|') ||
                normalizedRequiredIntakeFieldsAi.join('|') !== baseline.requiredIntakeFieldsAi.join('|')
            ) {
                await updateOfferingProfileSummary(
                    organizationId,
                    effectiveSummary,
                    manualProfileNote,
                    offeringProfileAiEnabled,
                    requiredIntakeFieldsAiEnabled,
                    nextLocale,
                    normalizedRequiredIntakeFields,
                    normalizedRequiredIntakeFieldsAi,
                    { generateInitialSuggestion: offeringProfileAiEnabled && !baseline.offeringProfileAiEnabled }
                )
                await refreshSuggestions(nextLocale)
            }

            setProfileSummary(effectiveSummary)

            setBaseline({
                name,
                billingRegion: selectedBillingRegion,
                locale: nextLocale,
                profileSummary: effectiveSummary,
                manualProfileNote,
                offeringProfileAiEnabled,
                requiredIntakeFieldsAiEnabled,
                requiredIntakeFields: normalizedRequiredIntakeFields,
                requiredIntakeFieldsAi: normalizedRequiredIntakeFieldsAi
            })
            setSaved(true)

            if (localeChanged) {
                startTransition(() => {
                    localeRouter.replace(pathname, { locale: nextLocale })
                })
            }

            return true
        } catch (error) {
            console.error(error)
            const message = error instanceof Error ? error.message : ''
            if (
                message.includes('required_intake_fields') ||
                message.includes('ai_suggestions_enabled') ||
                message.includes('offering_profiles')
            ) {
                setSaveError(t('saveErrorMigration'))
            } else {
                setSaveError(t('saveError'))
            }
            return false
        } finally {
            setIsSaving(false)
        }
    }

    const handleReviewSuggestion = async (suggestionId: string, status: 'approved' | 'rejected') => {
        try {
            await updateOfferingProfileSuggestionStatus(organizationId, suggestionId, status)
            const refreshedSuggestions = await refreshSuggestions()
            await syncSummaryWithApprovedSuggestions(refreshedSuggestions)
            window.dispatchEvent(new Event('pending-suggestions-updated'))
            router.refresh()
        } catch (error) {
            console.error(error)
        }
    }

    const handleArchiveSuggestion = async (suggestionId: string) => {
        try {
            await archiveOfferingProfileSuggestion(organizationId, suggestionId)
            const refreshedSuggestions = await refreshSuggestions()
            await syncSummaryWithApprovedSuggestions(refreshedSuggestions)
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
            await refreshSuggestions()
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

    const handleManualProfileNoteChange = (value: string) => {
        setManualProfileNote(value)
        if (!offeringProfileAiEnabled) return
        const nextSummary = deriveSummaryFromApprovedSuggestions(suggestions, value)
        setProfileSummary(nextSummary)
    }

    const handleDiscard = () => {
        setName(baseline.name)
        setSelectedBillingRegion(baseline.billingRegion)
        setSelectedLocale(baseline.locale)
        setProfileSummary(baseline.profileSummary)
        setManualProfileNote(baseline.manualProfileNote)
        setOfferingProfileAiEnabled(baseline.offeringProfileAiEnabled)
        setRequiredIntakeFieldsAiEnabled(baseline.requiredIntakeFieldsAiEnabled)
        setRequiredIntakeFields(baseline.requiredIntakeFields)
        setRequiredIntakeFieldsAi(baseline.requiredIntakeFieldsAi)
        setSaveError(null)
        setSaved(false)
    }

    const transformPendingHref = (href: string) =>
        transformPendingHrefForLocale({
            href,
            currentLocale: locale,
            nextLocale: selectedLocale
        })

    const guard = useUnsavedChangesGuard({
        isDirty,
        onSave: handleSave,
        onDiscard: handleDiscard,
        transformPendingHref
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
                    <SettingsSection title={t('languageTitle')} description={t('languageDescription')}>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => setSelectedLocale('en')}
                                className={`rounded-lg border p-4 text-left transition-colors ${selectedLocale === 'en'
                                    ? 'border-blue-500 bg-blue-50/50'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`flex h-4 w-4 items-center justify-center rounded-full border ${selectedLocale === 'en' ? 'border-blue-500' : 'border-gray-300'
                                        }`}>
                                        {selectedLocale === 'en' && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                                    </div>
                                    <span className="text-sm font-medium text-gray-900">{t('languageEnglish')}</span>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setSelectedLocale('tr')}
                                className={`rounded-lg border p-4 text-left transition-colors ${selectedLocale === 'tr'
                                    ? 'border-blue-500 bg-blue-50/50'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`flex h-4 w-4 items-center justify-center rounded-full border ${selectedLocale === 'tr' ? 'border-blue-500' : 'border-gray-300'
                                        }`}>
                                        {selectedLocale === 'tr' && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                                    </div>
                                    <span className="text-sm font-medium text-gray-900">{t('languageTurkish')}</span>
                                </div>
                            </button>
                        </div>
                    </SettingsSection>

                    <SettingsSection title={t('billingRegionTitle')} description={t('billingRegionDescription')}>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => setSelectedBillingRegion('TR')}
                                className={`rounded-lg border p-4 text-left transition-colors ${selectedBillingRegion === 'TR'
                                    ? 'border-blue-500 bg-blue-50/50'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`flex h-4 w-4 items-center justify-center rounded-full border ${selectedBillingRegion === 'TR' ? 'border-blue-500' : 'border-gray-300'
                                        }`}>
                                        {selectedBillingRegion === 'TR' && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                                    </div>
                                    <span className="text-sm font-medium text-gray-900">{t('billingRegionTurkey')}</span>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setSelectedBillingRegion('INTL')}
                                className={`rounded-lg border p-4 text-left transition-colors ${selectedBillingRegion === 'INTL'
                                    ? 'border-blue-500 bg-blue-50/50'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`flex h-4 w-4 items-center justify-center rounded-full border ${selectedBillingRegion === 'INTL' ? 'border-blue-500' : 'border-gray-300'
                                        }`}>
                                        {selectedBillingRegion === 'INTL' && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                                    </div>
                                    <span className="text-sm font-medium text-gray-900">{t('billingRegionInternational')}</span>
                                </div>
                            </button>
                        </div>
                    </SettingsSection>

                    <SettingsSection title={t('nameTitle')} description={t('nameDescription')}>
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
                        aiSuggestionsEnabled={offeringProfileAiEnabled}
                        suggestions={suggestions}
                        autoOpenSuggestions={autoOpenOfferingSuggestions}
                        onSummaryChange={setProfileSummary}
                        manualProfileNote={manualProfileNote}
                        onManualProfileNoteChange={handleManualProfileNoteChange}
                        onAiSuggestionsEnabledChange={setOfferingProfileAiEnabled}
                        onReviewSuggestion={handleReviewSuggestion}
                        onArchiveSuggestion={handleArchiveSuggestion}
                        onGenerateSuggestions={handleGenerateSuggestions}
                        isGeneratingSuggestions={isGeneratingSuggestions}
                    />

                    <RequiredIntakeFieldsSection
                        fields={requiredIntakeFields}
                        aiFields={normalizedRequiredIntakeFieldsAi}
                        aiSuggestionsEnabled={requiredIntakeFieldsAiEnabled}
                        onAiSuggestionsEnabledChange={setRequiredIntakeFieldsAiEnabled}
                        onFieldsChange={(fields) => setRequiredIntakeFields(normalizeIntakeFields(fields))}
                        onAiFieldsChange={setRequiredIntakeFieldsAi}
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
