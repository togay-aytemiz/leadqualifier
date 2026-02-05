"use client"

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button, PageHeader } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { updateOrganizationName } from '@/lib/organizations/actions'
import type { OfferingProfile, OfferingProfileSuggestion } from '@/types/database'
import { OfferingProfileSection } from '@/components/settings/OfferingProfileSection'
import { RequiredIntakeFieldsSection } from '@/components/settings/RequiredIntakeFieldsSection'
import {
    archiveOfferingProfileSuggestion,
    createManualApprovedOfferingProfileSuggestion,
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
        offeringProfileAiEnabled: offeringProfile?.ai_suggestions_enabled ?? false,
        requiredIntakeFieldsAiEnabled: offeringProfile?.required_intake_fields_ai_enabled ?? true,
        requiredIntakeFields: offeringProfile?.required_intake_fields ?? [],
        requiredIntakeFieldsAi: offeringProfile?.required_intake_fields_ai ?? []
    })

    const [name, setName] = useState(initialName)
    const [profileSummary, setProfileSummary] = useState(offeringProfile?.summary ?? '')
    const [offeringProfileAiEnabled, setOfferingProfileAiEnabled] = useState(offeringProfile?.ai_suggestions_enabled ?? false)
    const [requiredIntakeFieldsAiEnabled, setRequiredIntakeFieldsAiEnabled] = useState(offeringProfile?.required_intake_fields_ai_enabled ?? true)
    const [requiredIntakeFields, setRequiredIntakeFields] = useState(offeringProfile?.required_intake_fields ?? [])
    const [requiredIntakeFieldsAi, setRequiredIntakeFieldsAi] = useState(offeringProfile?.required_intake_fields_ai ?? [])
    const [suggestions, setSuggestions] = useState(() => initialSuggestions.map((item) => ({
        ...item,
        status: item.status ?? 'pending'
    })))

    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)
    const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false)
    const [localeSynced, setLocaleSynced] = useState(false)

    const normalizedRequiredIntakeFieldsAi = useMemo(() => {
        const fieldSet = new Set(requiredIntakeFields.map((field) => field.trim().toLowerCase()))
        return normalizeIntakeFields(
            requiredIntakeFieldsAi.filter((field) => fieldSet.has(field.trim().toLowerCase()))
        )
    }, [requiredIntakeFields, requiredIntakeFieldsAi])

    const isDirty = useMemo(() => {
        return (
            name !== baseline.name ||
            profileSummary !== baseline.profileSummary ||
            offeringProfileAiEnabled !== baseline.offeringProfileAiEnabled ||
            requiredIntakeFieldsAiEnabled !== baseline.requiredIntakeFieldsAiEnabled ||
            requiredIntakeFields.join('|') !== baseline.requiredIntakeFields.join('|') ||
            normalizedRequiredIntakeFieldsAi.join('|') !== baseline.requiredIntakeFieldsAi.join('|')
        )
    }, [
        name,
        profileSummary,
        offeringProfileAiEnabled,
        requiredIntakeFieldsAiEnabled,
        requiredIntakeFields,
        normalizedRequiredIntakeFieldsAi,
        baseline
    ])

    useEffect(() => {
        const nextSummary = offeringProfile?.summary ?? ''
        const nextOfferingProfileAiEnabled = offeringProfile?.ai_suggestions_enabled ?? false
        const nextRequiredIntakeFieldsAiEnabled = offeringProfile?.required_intake_fields_ai_enabled ?? true
        const nextRequiredFields = offeringProfile?.required_intake_fields ?? []
        const nextRequiredFieldsAi = offeringProfile?.required_intake_fields_ai ?? []

        setProfileSummary(nextSummary)
        setOfferingProfileAiEnabled(nextOfferingProfileAiEnabled)
        setRequiredIntakeFieldsAiEnabled(nextRequiredIntakeFieldsAiEnabled)
        setRequiredIntakeFields(nextRequiredFields)
        setRequiredIntakeFieldsAi(nextRequiredFieldsAi)
        setBaseline((prev) => ({
            ...prev,
            profileSummary: nextSummary,
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

    const deriveSummaryFromApprovedSuggestions = (allSuggestions: OfferingProfileSuggestion[]) => {
        const approvedItems = allSuggestions
            .filter((item) => item.status === 'approved' && !item.update_of && !item.archived_at)
            .map((item) => item.content)
        return serializeOfferingProfileItems(mergeOfferingProfileItems([], approvedItems))
    }

    const refreshSuggestions = async () => {
        const refreshed = await getOfferingProfileSuggestions(organizationId, locale, { includeArchived: true })
        const normalized = refreshed.map((item) => ({ ...item, status: item.status ?? 'pending' }))
        setSuggestions(normalized)
        return normalized
    }

    const syncSummaryWithApprovedSuggestions = async (allSuggestions: OfferingProfileSuggestion[]) => {
        if (!offeringProfileAiEnabled) return
        const nextSummary = deriveSummaryFromApprovedSuggestions(allSuggestions)
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
            if (name !== baseline.name) {
                await updateOrganizationName(name)
            }

            if (
                profileSummary !== baseline.profileSummary ||
                offeringProfileAiEnabled !== baseline.offeringProfileAiEnabled ||
                requiredIntakeFieldsAiEnabled !== baseline.requiredIntakeFieldsAiEnabled ||
                requiredIntakeFields.join('|') !== baseline.requiredIntakeFields.join('|') ||
                normalizedRequiredIntakeFieldsAi.join('|') !== baseline.requiredIntakeFieldsAi.join('|')
            ) {
                await updateOfferingProfileSummary(
                    organizationId,
                    profileSummary,
                    offeringProfileAiEnabled,
                    requiredIntakeFieldsAiEnabled,
                    locale,
                    requiredIntakeFields,
                    normalizedRequiredIntakeFieldsAi,
                    { generateInitialSuggestion: offeringProfileAiEnabled && !baseline.offeringProfileAiEnabled }
                )
                await refreshSuggestions()
            }

            setBaseline({
                name,
                profileSummary,
                offeringProfileAiEnabled,
                requiredIntakeFieldsAiEnabled,
                requiredIntakeFields,
                requiredIntakeFieldsAi: normalizedRequiredIntakeFieldsAi
            })
            setSaved(true)
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

    const handleAddCustomApprovedSuggestion = async (content: string) => {
        try {
            const created = await createManualApprovedOfferingProfileSuggestion(organizationId, content, locale)
            if (!created) return false

            const refreshedSuggestions = await refreshSuggestions()
            await syncSummaryWithApprovedSuggestions(refreshedSuggestions)
            window.dispatchEvent(new Event('pending-suggestions-updated'))
            router.refresh()
            return true
        } catch (error) {
            console.error(error)
            return false
        }
    }

    const handleDiscard = () => {
        setName(baseline.name)
        setProfileSummary(baseline.profileSummary)
        setOfferingProfileAiEnabled(baseline.offeringProfileAiEnabled)
        setRequiredIntakeFieldsAiEnabled(baseline.requiredIntakeFieldsAiEnabled)
        setRequiredIntakeFields(baseline.requiredIntakeFields)
        setRequiredIntakeFieldsAi(baseline.requiredIntakeFieldsAi)
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
                        onSummaryChange={setProfileSummary}
                        onAiSuggestionsEnabledChange={setOfferingProfileAiEnabled}
                        onReviewSuggestion={handleReviewSuggestion}
                        onArchiveSuggestion={handleArchiveSuggestion}
                        onGenerateSuggestions={handleGenerateSuggestions}
                        onAddCustomApproved={handleAddCustomApprovedSuggestion}
                        isGeneratingSuggestions={isGeneratingSuggestions}
                    />

                    <RequiredIntakeFieldsSection
                        fields={requiredIntakeFields}
                        aiFields={normalizedRequiredIntakeFieldsAi}
                        aiSuggestionsEnabled={requiredIntakeFieldsAiEnabled}
                        onAiSuggestionsEnabledChange={setRequiredIntakeFieldsAiEnabled}
                        onFieldsChange={setRequiredIntakeFields}
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
