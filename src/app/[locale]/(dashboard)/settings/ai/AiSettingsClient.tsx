'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button, PageHeader } from '@/design'
import AiSettingsForm from './AiSettingsForm'
import type { OrganizationAiSettings, OfferingProfile, OfferingProfileUpdate, ServiceCandidate } from '@/types/database'
import { updateOrgAiSettings } from '@/lib/ai/settings'
import { UnsavedChangesDialog } from '@/components/settings/UnsavedChangesDialog'
import { useUnsavedChangesGuard } from '@/components/settings/useUnsavedChangesGuard'
import { OfferingProfileSection } from '@/components/settings/OfferingProfileSection'
import {
    approveProfileUpdate,
    approveServiceCandidate,
    rejectProfileUpdate,
    rejectServiceCandidate,
    updateOfferingProfileSummary
} from '@/lib/leads/settings'

interface AiSettingsClientProps {
    initialSettings: Omit<OrganizationAiSettings, 'organization_id' | 'created_at' | 'updated_at'>
    organizationId: string
    offeringProfile: OfferingProfile | null
    pendingProfileUpdates: OfferingProfileUpdate[]
    pendingCandidates: ServiceCandidate[]
}

export default function AiSettingsClient({
    initialSettings,
    organizationId,
    offeringProfile,
    pendingProfileUpdates: initialPendingUpdates,
    pendingCandidates: initialPendingCandidates
}: AiSettingsClientProps) {
    const t = useTranslations('aiSettings')
    const tUnsaved = useTranslations('unsavedChanges')
    const [baseline, setBaseline] = useState(initialSettings)
    const [botName, setBotName] = useState(initialSettings.bot_name)
    const [botMode, setBotMode] = useState(initialSettings.bot_mode)
    const [matchThreshold, setMatchThreshold] = useState(initialSettings.match_threshold)
    const [prompt, setPrompt] = useState(initialSettings.prompt)
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)
    const [profileSummary, setProfileSummary] = useState(offeringProfile?.summary ?? '')
    const [catalogEnabled, setCatalogEnabled] = useState(offeringProfile?.catalog_enabled ?? true)
    const [pendingProfileUpdates, setPendingProfileUpdates] = useState(initialPendingUpdates)
    const [pendingCandidates, setPendingCandidates] = useState(initialPendingCandidates)

    const isDirty = useMemo(() => {
        return (
            botName !== baseline.bot_name ||
            botMode !== baseline.bot_mode ||
            matchThreshold !== baseline.match_threshold ||
            prompt !== baseline.prompt
        )
    }, [botName, botMode, matchThreshold, prompt, baseline])

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
        setProfileSummary(offeringProfile?.summary ?? '')
        setCatalogEnabled(offeringProfile?.catalog_enabled ?? true)
    }, [offeringProfile])

    useEffect(() => {
        setPendingProfileUpdates(initialPendingUpdates)
    }, [initialPendingUpdates])

    useEffect(() => {
        setPendingCandidates(initialPendingCandidates)
    }, [initialPendingCandidates])

    const handleSave = async () => {
        setIsSaving(true)
        setSaveError(null)
        setSaved(false)
        try {
            const savedSettings = await updateOrgAiSettings({
                mode: 'flexible',
                bot_name: botName,
                bot_mode: botMode,
                match_threshold: matchThreshold,
                prompt
            })
            setBaseline(savedSettings)
            setBotName(savedSettings.bot_name)
            setBotMode(savedSettings.bot_mode)
            setMatchThreshold(savedSettings.match_threshold)
            setPrompt(savedSettings.prompt)
            setSaved(true)
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('ai-settings-updated'))
            }
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
        setBotName(baseline.bot_name)
        setBotMode(baseline.bot_mode)
        setMatchThreshold(baseline.match_threshold)
        setPrompt(baseline.prompt)
        setSaved(false)
        setSaveError(null)
    }

    const handleSaveOfferingProfile = async (summary: string, enabled: boolean) => {
        await updateOfferingProfileSummary(organizationId, summary, enabled)
        setProfileSummary(summary)
        setCatalogEnabled(enabled)
    }

    const handleApproveUpdate = async (id: string) => {
        const match = pendingProfileUpdates.find((item) => item.id === id)
        await approveProfileUpdate(id)
        setPendingProfileUpdates((items) => items.filter((item) => item.id !== id))
        if (match?.proposed_summary) {
            setProfileSummary(match.proposed_summary)
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
                <AiSettingsForm
                    botName={botName}
                    botMode={botMode}
                    matchThreshold={matchThreshold}
                    prompt={prompt}
                    onBotNameChange={setBotName}
                    onBotModeChange={setBotMode}
                    onMatchThresholdChange={setMatchThreshold}
                    onPromptChange={setPrompt}
                />
                <OfferingProfileSection
                    summary={profileSummary}
                    catalogEnabled={catalogEnabled}
                    pendingUpdates={pendingProfileUpdates}
                    pendingCandidates={pendingCandidates}
                    onSave={handleSaveOfferingProfile}
                    onApproveUpdate={handleApproveUpdate}
                    onRejectUpdate={handleRejectUpdate}
                    onApproveCandidate={handleApproveCandidate}
                    onRejectCandidate={handleRejectCandidate}
                />
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
