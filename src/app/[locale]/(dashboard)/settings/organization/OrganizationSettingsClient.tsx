"use client"

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { usePathname, useRouter as useLocaleRouter } from '@/i18n/navigation'
import { Button, Modal, PageHeader } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { transformPendingHrefForLocale } from '@/components/settings/localeHref'
import { deleteOrganizationDataSelfServe, type DeleteOrganizationDataResult, updateOrganizationName } from '@/lib/organizations/actions'
import type { OfferingProfile, OfferingProfileSuggestion, ServiceCandidate, ServiceCatalogItem } from '@/types/database'
import { OfferingProfileSection } from '@/components/settings/OfferingProfileSection'
import { RequiredIntakeFieldsSection } from '@/components/settings/RequiredIntakeFieldsSection'
import { ServiceCatalogSection } from '@/components/settings/ServiceCatalogSection'
import {
    archiveOfferingProfileSuggestion,
    generateOfferingProfileSuggestions,
    getOfferingProfileSuggestions,
    syncServiceCatalogItems,
    syncOfferingProfileSummary,
    updateOfferingProfileLocaleForUser,
    updateOfferingProfileSuggestionStatus,
    updateOfferingProfileSummary
} from '@/lib/leads/settings'
import { mergeOfferingProfileItems, serializeOfferingProfileItems } from '@/lib/leads/offering-profile-content'
import { normalizeIntakeFields, normalizeServiceCatalogNames } from '@/lib/leads/offering-profile-utils'
import { UnsavedChangesDialog } from '@/components/settings/UnsavedChangesDialog'
import { useUnsavedChangesGuard } from '@/components/settings/useUnsavedChangesGuard'

interface OrganizationSettingsClientProps {
    initialName: string
    organizationId: string
    offeringProfile: OfferingProfile | null
    offeringProfileSuggestions: OfferingProfileSuggestion[]
    serviceCatalogItems: ServiceCatalogItem[]
    serviceCandidates: ServiceCandidate[]
    isReadOnly?: boolean
}

type OrganizationSettingsTabId = 'general' | 'organizationDetails' | 'securityAndData'

function resolveOrganizationTabFromFocus(focusTarget: string | null): OrganizationSettingsTabId {
    if (focusTarget === 'offering-suggestions') return 'organizationDetails'
    if (focusTarget === 'data-deletion') return 'securityAndData'
    return 'general'
}

export default function OrganizationSettingsClient({
    initialName,
    organizationId,
    offeringProfile,
    offeringProfileSuggestions: initialSuggestions,
    serviceCatalogItems: initialServiceCatalogItemsData,
    serviceCandidates: initialServiceCandidatesData,
    isReadOnly = false
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
    const initialServiceCatalogItems = normalizeServiceCatalogNames(
        (initialServiceCatalogItemsData ?? []).map((item) => item.name)
    )

    const [baseline, setBaseline] = useState({
        name: initialName,
        locale,
        profileSummary: offeringProfile?.summary ?? '',
        manualProfileNote: offeringProfile?.manual_profile_note ?? '',
        offeringProfileAiEnabled: offeringProfile?.ai_suggestions_enabled ?? false,
        serviceCatalogAiEnabled: offeringProfile?.service_catalog_ai_enabled ?? true,
        requiredIntakeFieldsAiEnabled: offeringProfile?.required_intake_fields_ai_enabled ?? true,
        requiredIntakeFields: initialRequiredFields,
        requiredIntakeFieldsAi: initialRequiredFieldsAi,
        serviceCatalogItems: initialServiceCatalogItems
    })

    const [name, setName] = useState(initialName)
    const [selectedLocale, setSelectedLocale] = useState<'en' | 'tr'>(locale)
    const [profileSummary, setProfileSummary] = useState(offeringProfile?.summary ?? '')
    const [manualProfileNote, setManualProfileNote] = useState(offeringProfile?.manual_profile_note ?? '')
    const [offeringProfileAiEnabled, setOfferingProfileAiEnabled] = useState(offeringProfile?.ai_suggestions_enabled ?? false)
    const [serviceCatalogAiEnabled, setServiceCatalogAiEnabled] = useState(offeringProfile?.service_catalog_ai_enabled ?? true)
    const [requiredIntakeFieldsAiEnabled, setRequiredIntakeFieldsAiEnabled] = useState(offeringProfile?.required_intake_fields_ai_enabled ?? true)
    const [requiredIntakeFields, setRequiredIntakeFields] = useState(initialRequiredFields)
    const [requiredIntakeFieldsAi, setRequiredIntakeFieldsAi] = useState(initialRequiredFieldsAi)
    const [serviceCatalogItems, setServiceCatalogItems] = useState(initialServiceCatalogItems)
    const [serviceCandidates, setServiceCandidates] = useState(
        initialServiceCandidatesData.map((item) => ({ ...item, status: item.status ?? 'pending' }))
    )
    const [suggestions, setSuggestions] = useState(() => initialSuggestions.map((item) => ({
        ...item,
        status: item.status ?? 'pending'
    })))

    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)
    const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false)
    const [localeSynced, setLocaleSynced] = useState(false)
    const [deletionPassword, setDeletionPassword] = useState('')
    const [deletionModalError, setDeletionModalError] = useState<string | null>(null)
    const [deletionFeedback, setDeletionFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
    const [deletionResult, setDeletionResult] = useState<DeleteOrganizationDataResult | null>(null)
    const [deletionModalOpen, setDeletionModalOpen] = useState(false)
    const [isDeletingContactData, setIsDeletingContactData] = useState(false)
    const [activeTab, setActiveTab] = useState<OrganizationSettingsTabId>(() => resolveOrganizationTabFromFocus(searchParams.get('focus')))

    const normalizedRequiredIntakeFields = useMemo(() => {
        return normalizeIntakeFields(requiredIntakeFields)
    }, [requiredIntakeFields])

    const normalizedRequiredIntakeFieldsAi = useMemo(() => {
        const fieldSet = new Set(normalizedRequiredIntakeFields.map((field) => field.trim().toLowerCase()))
        return normalizeIntakeFields(
            requiredIntakeFieldsAi.filter((field) => fieldSet.has(field.trim().toLowerCase()))
        )
    }, [normalizedRequiredIntakeFields, requiredIntakeFieldsAi])

    const normalizedServiceCatalogItems = useMemo(() => {
        return normalizeServiceCatalogNames(serviceCatalogItems)
    }, [serviceCatalogItems])

    const approvedAiServiceNames = useMemo(() => {
        return normalizeServiceCatalogNames(
            serviceCandidates
                .filter((candidate) => candidate.status !== 'rejected')
                .map((candidate) => candidate.proposed_name)
        )
    }, [serviceCandidates])

    const isDirty = useMemo(() => {
        return (
            name !== baseline.name ||
            selectedLocale !== baseline.locale ||
            profileSummary !== baseline.profileSummary ||
            manualProfileNote !== baseline.manualProfileNote ||
            offeringProfileAiEnabled !== baseline.offeringProfileAiEnabled ||
            serviceCatalogAiEnabled !== baseline.serviceCatalogAiEnabled ||
            requiredIntakeFieldsAiEnabled !== baseline.requiredIntakeFieldsAiEnabled ||
            normalizedRequiredIntakeFields.join('|') !== baseline.requiredIntakeFields.join('|') ||
            normalizedRequiredIntakeFieldsAi.join('|') !== baseline.requiredIntakeFieldsAi.join('|') ||
            normalizedServiceCatalogItems.join('|') !== baseline.serviceCatalogItems.join('|')
        )
    }, [
        name,
        selectedLocale,
        profileSummary,
        manualProfileNote,
        offeringProfileAiEnabled,
        serviceCatalogAiEnabled,
        requiredIntakeFieldsAiEnabled,
        normalizedRequiredIntakeFields,
        normalizedRequiredIntakeFieldsAi,
        normalizedServiceCatalogItems,
        baseline
    ])

    useEffect(() => {
        const nextSummary = offeringProfile?.summary ?? ''
        const nextManualProfileNote = offeringProfile?.manual_profile_note ?? ''
        const nextOfferingProfileAiEnabled = offeringProfile?.ai_suggestions_enabled ?? false
        const nextServiceCatalogAiEnabled = offeringProfile?.service_catalog_ai_enabled ?? true
        const nextRequiredIntakeFieldsAiEnabled = offeringProfile?.required_intake_fields_ai_enabled ?? true
        const nextRequiredFields = normalizeIntakeFields(offeringProfile?.required_intake_fields ?? [])
        const nextRequiredFieldsAi = normalizeIntakeFields(offeringProfile?.required_intake_fields_ai ?? [])

        setProfileSummary(nextSummary)
        setManualProfileNote(nextManualProfileNote)
        setOfferingProfileAiEnabled(nextOfferingProfileAiEnabled)
        setServiceCatalogAiEnabled(nextServiceCatalogAiEnabled)
        setRequiredIntakeFieldsAiEnabled(nextRequiredIntakeFieldsAiEnabled)
        setRequiredIntakeFields(nextRequiredFields)
        setRequiredIntakeFieldsAi(nextRequiredFieldsAi)
        setBaseline((prev) => ({
            ...prev,
            profileSummary: nextSummary,
            manualProfileNote: nextManualProfileNote,
            offeringProfileAiEnabled: nextOfferingProfileAiEnabled,
            serviceCatalogAiEnabled: nextServiceCatalogAiEnabled,
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
        const nextServices = normalizeServiceCatalogNames(
            (initialServiceCatalogItemsData ?? []).map((item) => item.name)
        )
        setServiceCatalogItems(nextServices)
        setBaseline((prev) => ({
            ...prev,
            serviceCatalogItems: nextServices
        }))
    }, [initialServiceCatalogItemsData])

    useEffect(() => {
        setServiceCandidates(
            initialServiceCandidatesData.map((item) => ({
                ...item,
                status: item.status ?? 'pending'
            }))
        )
    }, [initialServiceCandidatesData])

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
        const focusTarget = searchParams.get('focus')
        if (focusTarget !== 'offering-suggestions' && focusTarget !== 'data-deletion') return
        setActiveTab(resolveOrganizationTabFromFocus(focusTarget))
    }, [searchParams])

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

            const effectiveSummary = offeringProfileAiEnabled
                ? deriveSummaryFromApprovedSuggestions(suggestions, manualProfileNote)
                : profileSummary
            const serviceCatalogChanged = normalizedServiceCatalogItems.join('|') !== baseline.serviceCatalogItems.join('|')
            const serviceCatalogAiSettingChanged = serviceCatalogAiEnabled !== baseline.serviceCatalogAiEnabled

            if (
                effectiveSummary !== baseline.profileSummary ||
                manualProfileNote !== baseline.manualProfileNote ||
                offeringProfileAiEnabled !== baseline.offeringProfileAiEnabled ||
                serviceCatalogAiSettingChanged ||
                requiredIntakeFieldsAiEnabled !== baseline.requiredIntakeFieldsAiEnabled ||
                normalizedRequiredIntakeFields.join('|') !== baseline.requiredIntakeFields.join('|') ||
                normalizedRequiredIntakeFieldsAi.join('|') !== baseline.requiredIntakeFieldsAi.join('|')
            ) {
                await updateOfferingProfileSummary(
                    organizationId,
                    effectiveSummary,
                    manualProfileNote,
                    offeringProfileAiEnabled,
                    serviceCatalogAiEnabled,
                    requiredIntakeFieldsAiEnabled,
                    nextLocale,
                    normalizedRequiredIntakeFields,
                    normalizedRequiredIntakeFieldsAi,
                    { generateInitialSuggestion: offeringProfileAiEnabled && !baseline.offeringProfileAiEnabled }
                )
                await refreshSuggestions(nextLocale)
            }

            if (serviceCatalogChanged) {
                await syncServiceCatalogItems(organizationId, normalizedServiceCatalogItems)
            }

            setProfileSummary(effectiveSummary)

            setBaseline({
                name,
                locale: nextLocale,
                profileSummary: effectiveSummary,
                manualProfileNote,
                offeringProfileAiEnabled,
                serviceCatalogAiEnabled,
                requiredIntakeFieldsAiEnabled,
                requiredIntakeFields: normalizedRequiredIntakeFields,
                requiredIntakeFieldsAi: normalizedRequiredIntakeFieldsAi,
                serviceCatalogItems: normalizedServiceCatalogItems
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
                message.includes('service_catalog_ai_enabled') ||
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
        setSelectedLocale(baseline.locale)
        setProfileSummary(baseline.profileSummary)
        setManualProfileNote(baseline.manualProfileNote)
        setOfferingProfileAiEnabled(baseline.offeringProfileAiEnabled)
        setServiceCatalogAiEnabled(baseline.serviceCatalogAiEnabled)
        setRequiredIntakeFieldsAiEnabled(baseline.requiredIntakeFieldsAiEnabled)
        setRequiredIntakeFields(baseline.requiredIntakeFields)
        setRequiredIntakeFieldsAi(baseline.requiredIntakeFieldsAi)
        setServiceCatalogItems(baseline.serviceCatalogItems)
        setSaveError(null)
        setSaved(false)
    }

    const clearDeletionFeedback = () => {
        setDeletionFeedback(null)
        setDeletionResult(null)
    }

    const handleDeleteOrganizationDataRequest = () => {
        if (isReadOnly) return
        clearDeletionFeedback()
        setDeletionPassword('')
        setDeletionModalError(null)
        setDeletionModalOpen(true)
    }

    const handleConfirmDeleteOrganizationData = async () => {
        if (isReadOnly || isDeletingContactData) return
        if (!deletionPassword.trim()) {
            setDeletionModalError(t('dataDeletionMissingPassword'))
            return
        }

        setIsDeletingContactData(true)
        setDeletionModalError(null)
        setDeletionFeedback(null)
        setDeletionResult(null)

        try {
            const result = await deleteOrganizationDataSelfServe({
                organizationId,
                password: deletionPassword
            })

            setDeletionResult(result)

            if (result.deletedConversations === 0) {
                setDeletionFeedback({
                    type: 'info',
                    message: t('dataDeletionNoData')
                })
            } else {
                setDeletionFeedback({
                    type: 'success',
                    message: t('dataDeletionSuccess', { count: result.deletedConversations })
                })
            }

            setDeletionModalOpen(false)
            setDeletionPassword('')
        } catch (error) {
            console.error('Failed to delete organization data', error)
            const message = error instanceof Error ? error.message.trim() : ''
            if (message === 'Invalid password') {
                setDeletionModalError(t('dataDeletionInvalidPassword'))
                return
            }
            setDeletionFeedback({
                type: 'error',
                message: message.length > 0 ? message : t('dataDeletionErrorGeneric')
            })
        } finally {
            setIsDeletingContactData(false)
        }
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
                <div className="max-w-5xl">
                    {saveError && <p className="mb-4 text-sm text-red-600">{saveError}</p>}
                    <SettingsTabs
                        tabs={[
                            { id: 'general', label: t('tabs.general') },
                            { id: 'organizationDetails', label: t('tabs.organizationDetails') },
                            { id: 'securityAndData', label: t('tabs.securityAndData') }
                        ]}
                        activeTabId={activeTab}
                        onTabChange={(tabId) => setActiveTab(tabId as OrganizationSettingsTabId)}
                    >
                        {(tabId) => (
                            <>
                                {tabId === 'general' && (
                                    <>
                                        <SettingsSection title={t('nameTitle')} description={t('nameDescription')}>
                                            <input
                                                type="text"
                                                value={name}
                                                onChange={(event) => setName(event.target.value)}
                                                aria-label={t('nameLabel')}
                                                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                                            />
                                        </SettingsSection>

                                        <SettingsSection title={t('languageTitle')} description={t('languageDescription')}>
                                            <div className="flex flex-wrap gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedLocale('en')}
                                                    className={`inline-flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${selectedLocale === 'en'
                                                        ? 'border-blue-500 bg-blue-50/50'
                                                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    <div className={`flex h-4 w-4 items-center justify-center rounded-full border ${selectedLocale === 'en' ? 'border-blue-500' : 'border-gray-300'
                                                        }`}>
                                                        {selectedLocale === 'en' && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                                                    </div>
                                                    <span className="text-sm font-medium text-gray-900">{t('languageEnglish')}</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedLocale('tr')}
                                                    className={`inline-flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${selectedLocale === 'tr'
                                                        ? 'border-blue-500 bg-blue-50/50'
                                                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    <div className={`flex h-4 w-4 items-center justify-center rounded-full border ${selectedLocale === 'tr' ? 'border-blue-500' : 'border-gray-300'
                                                        }`}>
                                                        {selectedLocale === 'tr' && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                                                    </div>
                                                    <span className="text-sm font-medium text-gray-900">{t('languageTurkish')}</span>
                                                </button>
                                            </div>
                                        </SettingsSection>
                                    </>
                                )}

                                {tabId === 'organizationDetails' && (
                                    <>
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

                                        <ServiceCatalogSection
                                            services={normalizedServiceCatalogItems}
                                            aiServices={approvedAiServiceNames}
                                            aiSuggestionsEnabled={serviceCatalogAiEnabled}
                                            onAiSuggestionsEnabledChange={setServiceCatalogAiEnabled}
                                            onServicesChange={(services) => setServiceCatalogItems(normalizeServiceCatalogNames(services))}
                                        />

                                        <RequiredIntakeFieldsSection
                                            fields={requiredIntakeFields}
                                            aiFields={normalizedRequiredIntakeFieldsAi}
                                            aiSuggestionsEnabled={requiredIntakeFieldsAiEnabled}
                                            onAiSuggestionsEnabledChange={setRequiredIntakeFieldsAiEnabled}
                                            onFieldsChange={(fields) => setRequiredIntakeFields(normalizeIntakeFields(fields))}
                                            onAiFieldsChange={setRequiredIntakeFieldsAi}
                                        />
                                    </>
                                )}

                                {tabId === 'securityAndData' && (
                                    <SettingsSection
                                        title={t('dataDeletionTitle')}
                                        description={t('dataDeletionDescription')}
                                        showBottomDivider={false}
                                    >
                                        <div className="space-y-4">
                                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                                {t('dataDeletionWarning')}
                                            </div>

                                            {isReadOnly && (
                                                <p className="text-sm text-amber-700">{t('dataDeletionReadOnly')}</p>
                                            )}

                                            {deletionFeedback && (
                                                <p
                                                    className={
                                                        deletionFeedback.type === 'error'
                                                            ? 'text-sm text-red-600'
                                                            : deletionFeedback.type === 'success'
                                                                ? 'text-sm text-green-700'
                                                                : 'text-sm text-amber-700'
                                                    }
                                                >
                                                    {deletionFeedback.message}
                                                </p>
                                            )}

                                            {deletionResult && (
                                                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">
                                                    <p>{t('dataDeletionResultConversations', { count: deletionResult.deletedConversations })}</p>
                                                    <p>{t('dataDeletionResultAiUsage', { count: deletionResult.deletedAiUsageRows })}</p>
                                                </div>
                                            )}

                                            <div className="pt-1">
                                                <Button
                                                    type="button"
                                                    variant="danger"
                                                    onClick={handleDeleteOrganizationDataRequest}
                                                    disabled={isReadOnly || isDeletingContactData}
                                                >
                                                    {isDeletingContactData ? t('dataDeletionDeleting') : t('dataDeletionSubmit')}
                                                </Button>
                                            </div>
                                        </div>
                                    </SettingsSection>
                                )}
                            </>
                        )}
                    </SettingsTabs>
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

            <Modal
                isOpen={deletionModalOpen}
                onClose={() => {
                    if (isDeletingContactData) return
                    setDeletionModalOpen(false)
                }}
                title={t('dataDeletionModalTitle')}
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">{t('dataDeletionModalDescription')}</p>

                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                        <p className="text-sm font-semibold text-amber-900">{t('dataDeletionWhatWillBeDeletedTitle')}</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                            <li>{t('dataDeletionWhatWillBeDeletedConversations')}</li>
                            <li>{t('dataDeletionWhatWillBeDeletedMessages')}</li>
                            <li>{t('dataDeletionWhatWillBeDeletedLeads')}</li>
                            <li>{t('dataDeletionWhatWillBeDeletedAiUsage')}</li>
                        </ul>
                    </div>

                    <div className="space-y-1">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                            {t('dataDeletionPasswordLabel')}
                        </label>
                        <input
                            type="password"
                            value={deletionPassword}
                            onChange={(event) => {
                                setDeletionPassword(event.target.value)
                                if (deletionModalError) setDeletionModalError(null)
                            }}
                            disabled={isDeletingContactData}
                            autoFocus
                            placeholder={t('dataDeletionPasswordPlaceholder')}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>

                    {deletionModalError && (
                        <p className="text-sm text-red-600">{deletionModalError}</p>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-1">
                        <button
                            type="button"
                            onClick={() => setDeletionModalOpen(false)}
                            disabled={isDeletingContactData}
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
                        >
                            {t('dataDeletionCancel')}
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmDeleteOrganizationData}
                            disabled={isDeletingContactData}
                            className="px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700"
                        >
                            {isDeletingContactData ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    {t('dataDeletionDeleting')}
                                </>
                            ) : (
                                t('dataDeletionConfirmAction')
                            )}
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    )
}
