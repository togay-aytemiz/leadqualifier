'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
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
    const locale = useLocale()
    const t = useTranslations('aiSettings')
    const tSidebar = useTranslations('Sidebar')
    const tUnsaved = useTranslations('unsavedChanges')
    const searchParams = useSearchParams()
    const [baseline, setBaseline] = useState(initialSettings)
    const [botName, setBotName] = useState(initialSettings.bot_name)
    const [botMode, setBotMode] = useState(initialSettings.bot_mode)
    const [allowLeadExtractionDuringOperator, setAllowLeadExtractionDuringOperator] = useState(
        initialSettings.allow_lead_extraction_during_operator
    )
    const [hotLeadScoreThreshold, setHotLeadScoreThreshold] = useState(initialSettings.hot_lead_score_threshold)
    const [hotLeadAction, setHotLeadAction] = useState(initialSettings.hot_lead_action)
    const [hotLeadHandoverMessageTr, setHotLeadHandoverMessageTr] = useState(initialSettings.hot_lead_handover_message_tr)
    const [hotLeadHandoverMessageEn, setHotLeadHandoverMessageEn] = useState(initialSettings.hot_lead_handover_message_en)
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
            hotLeadScoreThreshold !== baseline.hot_lead_score_threshold ||
            hotLeadAction !== baseline.hot_lead_action ||
            hotLeadHandoverMessageTr !== baseline.hot_lead_handover_message_tr ||
            hotLeadHandoverMessageEn !== baseline.hot_lead_handover_message_en ||
            matchThreshold !== baseline.match_threshold ||
            prompt !== baseline.prompt
        )
    }, [
        botName,
        botMode,
        allowLeadExtractionDuringOperator,
        hotLeadScoreThreshold,
        hotLeadAction,
        hotLeadHandoverMessageTr,
        hotLeadHandoverMessageEn,
        matchThreshold,
        prompt,
        baseline
    ])

    const localizedHandoverMessage = locale === 'tr' ? hotLeadHandoverMessageTr : hotLeadHandoverMessageEn

    const handleLocalizedHandoverMessageChange = (value: string) => {
        if (locale === 'tr') {
            setHotLeadHandoverMessageTr(value)
            return
        }
        setHotLeadHandoverMessageEn(value)
    }

    useEffect(() => {
        const focusTarget = searchParams.get('focus')
        if (focusTarget !== 'human-escalation') return

        const field = searchParams.get('field')
        const section = document.getElementById('human-escalation')
        if (section) {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }

        if (field === 'handover-message') {
            window.setTimeout(() => {
                const target = document.getElementById('hot-lead-handover-message') as HTMLTextAreaElement | null
                target?.focus({ preventScroll: true })
            }, 220)
        }
    }, [searchParams])

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
                hot_lead_score_threshold: hotLeadScoreThreshold,
                hot_lead_action: hotLeadAction,
                hot_lead_handover_message_tr: hotLeadHandoverMessageTr,
                hot_lead_handover_message_en: hotLeadHandoverMessageEn,
                match_threshold: matchThreshold,
                prompt
            })
            setBaseline(savedSettings)
            setBotName(savedSettings.bot_name)
            setBotMode(savedSettings.bot_mode)
            setAllowLeadExtractionDuringOperator(savedSettings.allow_lead_extraction_during_operator)
            setHotLeadScoreThreshold(savedSettings.hot_lead_score_threshold)
            setHotLeadAction(savedSettings.hot_lead_action)
            setHotLeadHandoverMessageTr(savedSettings.hot_lead_handover_message_tr)
            setHotLeadHandoverMessageEn(savedSettings.hot_lead_handover_message_en)
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
        setHotLeadScoreThreshold(baseline.hot_lead_score_threshold)
        setHotLeadAction(baseline.hot_lead_action)
        setHotLeadHandoverMessageTr(baseline.hot_lead_handover_message_tr)
        setHotLeadHandoverMessageEn(baseline.hot_lead_handover_message_en)
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
                title={tSidebar('ai')}
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
                    hotLeadScoreThreshold={hotLeadScoreThreshold}
                    hotLeadAction={hotLeadAction}
                    hotLeadHandoverMessage={localizedHandoverMessage}
                    matchThreshold={matchThreshold}
                    prompt={prompt}
                    onBotNameChange={setBotName}
                    onBotModeChange={setBotMode}
                    onAllowLeadExtractionDuringOperatorChange={setAllowLeadExtractionDuringOperator}
                    onHotLeadScoreThresholdChange={setHotLeadScoreThreshold}
                    onHotLeadActionChange={setHotLeadAction}
                    onHotLeadHandoverMessageChange={handleLocalizedHandoverMessageChange}
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
