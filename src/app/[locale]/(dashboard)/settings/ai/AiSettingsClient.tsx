'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button, PageHeader } from '@/design'
import AiSettingsForm from './AiSettingsForm'
import type { OrganizationAiSettings } from '@/types/database'
import { updateOrgAiSettings } from '@/lib/ai/settings'
import { UnsavedChangesDialog } from '@/components/settings/UnsavedChangesDialog'
import { useUnsavedChangesGuard } from '@/components/settings/useUnsavedChangesGuard'

interface AiSettingsClientProps {
    initialSettings: Omit<OrganizationAiSettings, 'organization_id' | 'created_at' | 'updated_at'>
}

export default function AiSettingsClient({ initialSettings }: AiSettingsClientProps) {
    const t = useTranslations('aiSettings')
    const tUnsaved = useTranslations('unsavedChanges')
    const [baseline, setBaseline] = useState(initialSettings)
    const [botName, setBotName] = useState(initialSettings.bot_name)
    const [botMode, setBotMode] = useState(initialSettings.bot_mode)
    const [allowLeadExtractionDuringOperator, setAllowLeadExtractionDuringOperator] = useState(
        initialSettings.allow_lead_extraction_during_operator
    )
    const [matchThreshold, setMatchThreshold] = useState(initialSettings.match_threshold)
    const [prompt, setPrompt] = useState(initialSettings.prompt)
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)

    const isDirty = useMemo(() => {
        return (
            botName !== baseline.bot_name ||
            botMode !== baseline.bot_mode ||
            allowLeadExtractionDuringOperator !== baseline.allow_lead_extraction_during_operator ||
            matchThreshold !== baseline.match_threshold ||
            prompt !== baseline.prompt
        )
    }, [botName, botMode, allowLeadExtractionDuringOperator, matchThreshold, prompt, baseline])

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
        setIsSaving(true)
        setSaveError(null)
        setSaved(false)
        try {
            const savedSettings = await updateOrgAiSettings({
                mode: 'flexible',
                bot_name: botName,
                bot_mode: botMode,
                allow_lead_extraction_during_operator: allowLeadExtractionDuringOperator,
                match_threshold: matchThreshold,
                prompt
            })
            setBaseline(savedSettings)
            setBotName(savedSettings.bot_name)
            setBotMode(savedSettings.bot_mode)
            setAllowLeadExtractionDuringOperator(savedSettings.allow_lead_extraction_during_operator)
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
        setAllowLeadExtractionDuringOperator(baseline.allow_lead_extraction_during_operator)
        setMatchThreshold(baseline.match_threshold)
        setPrompt(baseline.prompt)
        setSaved(false)
        setSaveError(null)
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
                    allowLeadExtractionDuringOperator={allowLeadExtractionDuringOperator}
                    matchThreshold={matchThreshold}
                    prompt={prompt}
                    onBotNameChange={setBotName}
                    onBotModeChange={setBotMode}
                    onAllowLeadExtractionDuringOperatorChange={setAllowLeadExtractionDuringOperator}
                    onMatchThresholdChange={setMatchThreshold}
                    onPromptChange={setPrompt}
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
