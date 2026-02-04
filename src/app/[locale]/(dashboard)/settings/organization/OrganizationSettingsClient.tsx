"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button, PageHeader } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { updateOrganizationName } from '@/lib/organizations/actions'
import type { OfferingProfile, OfferingProfileUpdate, ServiceCandidate } from '@/types/database'
import { OfferingProfileSection } from '@/components/settings/OfferingProfileSection'
import {
    approveProfileUpdate,
    approveServiceCandidate,
    rejectProfileUpdate,
    rejectServiceCandidate,
    updateOfferingProfileSummary
} from '@/lib/leads/settings'
import { UnsavedChangesDialog } from '@/components/settings/UnsavedChangesDialog'
import { useUnsavedChangesGuard } from '@/components/settings/useUnsavedChangesGuard'

interface OrganizationSettingsClientProps {
    initialName: string
    organizationId: string
    offeringProfile: OfferingProfile | null
    pendingProfileUpdates: OfferingProfileUpdate[]
    pendingCandidates: ServiceCandidate[]
}

export default function OrganizationSettingsClient({
    initialName,
    organizationId,
    offeringProfile,
    pendingProfileUpdates: initialPendingUpdates,
    pendingCandidates: initialPendingCandidates
}: OrganizationSettingsClientProps) {
    const t = useTranslations('organizationSettings')
    const tUnsaved = useTranslations('unsavedChanges')
    const [baseline, setBaseline] = useState({
        name: initialName,
        profileSummary: offeringProfile?.summary ?? '',
        catalogEnabled: offeringProfile?.catalog_enabled ?? true
    })
    const [name, setName] = useState(initialName)
    const [profileSummary, setProfileSummary] = useState(offeringProfile?.summary ?? '')
    const [catalogEnabled, setCatalogEnabled] = useState(offeringProfile?.catalog_enabled ?? true)
    const [pendingProfileUpdates, setPendingProfileUpdates] = useState(initialPendingUpdates)
    const [pendingCandidates, setPendingCandidates] = useState(initialPendingCandidates)
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)

    const isDirty = useMemo(() => {
        return (
            name !== baseline.name ||
            profileSummary !== baseline.profileSummary ||
            catalogEnabled !== baseline.catalogEnabled
        )
    }, [name, profileSummary, catalogEnabled, baseline])

    useEffect(() => {
        setProfileSummary(offeringProfile?.summary ?? '')
        setCatalogEnabled(offeringProfile?.catalog_enabled ?? true)
        setBaseline(prev => ({
            ...prev,
            profileSummary: offeringProfile?.summary ?? '',
            catalogEnabled: offeringProfile?.catalog_enabled ?? true
        }))
    }, [offeringProfile])

    useEffect(() => {
        setPendingProfileUpdates(initialPendingUpdates)
    }, [initialPendingUpdates])

    useEffect(() => {
        setPendingCandidates(initialPendingCandidates)
    }, [initialPendingCandidates])

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
                catalogEnabled !== baseline.catalogEnabled
            ) {
                await updateOfferingProfileSummary(organizationId, profileSummary, catalogEnabled)
            }
            setBaseline({ name, profileSummary, catalogEnabled })
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

    const handleDiscard = () => {
        setName(baseline.name)
        setProfileSummary(baseline.profileSummary)
        setCatalogEnabled(baseline.catalogEnabled)
        setSaveError(null)
        setSaved(false)
    }

    const handleApproveUpdate = async (id: string) => {
        const match = pendingProfileUpdates.find((item) => item.id === id)
        await approveProfileUpdate(id)
        setPendingProfileUpdates((items) => items.filter((item) => item.id !== id))
        if (match?.proposed_summary) {
            setProfileSummary(match.proposed_summary)
            setBaseline(prev => ({ ...prev, profileSummary: match.proposed_summary }))
        }
    }

    const handleRejectUpdate = async (id: string) => {
        await rejectProfileUpdate(id)
        setPendingProfileUpdates((items) => items.filter((item) => item.id !== id))
    }

    const handleApproveCandidate = async (id: string) => {
        await approveServiceCandidate(id)
        setPendingCandidates((items) => items.filter((item) => item.id !== id))
    }

    const handleRejectCandidate = async (id: string) => {
        await rejectServiceCandidate(id)
        setPendingCandidates((items) => items.filter((item) => item.id !== id))
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
                        <label className="text-sm font-medium text-gray-700">{t('nameLabel')}</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                        />
                    </SettingsSection>

                    <OfferingProfileSection
                        summary={profileSummary}
                        catalogEnabled={catalogEnabled}
                        pendingUpdates={pendingProfileUpdates}
                        pendingCandidates={pendingCandidates}
                        onSummaryChange={setProfileSummary}
                        onCatalogEnabledChange={setCatalogEnabled}
                        onApproveUpdate={handleApproveUpdate}
                        onRejectUpdate={handleRejectUpdate}
                        onApproveCandidate={handleApproveCandidate}
                        onRejectCandidate={handleRejectCandidate}
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
