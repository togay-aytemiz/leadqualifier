'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Button, PageHeader } from '@/design'
import AiSettingsForm, { type AiSettingsTabId } from './AiSettingsForm'
import { AiInstructionsHelpModal } from './AiInstructionsHelpModal'
import type { OrganizationAiSettings } from '@/types/database'
import { updateOrgAiSettings } from '@/lib/ai/settings'
import { UnsavedChangesDialog } from '@/components/settings/UnsavedChangesDialog'
import { useUnsavedChangesGuard } from '@/components/settings/useUnsavedChangesGuard'
import type { OrganizationOnboardingShellState } from '@/lib/onboarding/state'

interface AiSettingsClientProps {
    initialSettings: Omit<OrganizationAiSettings, 'organization_id' | 'created_at' | 'updated_at'>
    onboardingState: Pick<OrganizationOnboardingShellState, 'completedSteps' | 'totalSteps' | 'isComplete'> | null
}

export default function AiSettingsClient({ initialSettings, onboardingState }: AiSettingsClientProps) {
    const locale = useLocale()
    const t = useTranslations('aiSettings')
    const tSidebar = useTranslations('Sidebar')
    const tUnsaved = useTranslations('unsavedChanges')
    const searchParams = useSearchParams()
    const [baseline, setBaseline] = useState(initialSettings)
    const [botName, setBotName] = useState(initialSettings.bot_name)
    const [botMode, setBotMode] = useState(initialSettings.bot_mode)
    const [botDisclaimerEnabled, setBotDisclaimerEnabled] = useState(initialSettings.bot_disclaimer_enabled)
    const [botDisclaimerMessageTr, setBotDisclaimerMessageTr] = useState(initialSettings.bot_disclaimer_message_tr)
    const [botDisclaimerMessageEn, setBotDisclaimerMessageEn] = useState(initialSettings.bot_disclaimer_message_en)
    const [allowLeadExtractionDuringOperator, setAllowLeadExtractionDuringOperator] = useState(
        initialSettings.allow_lead_extraction_during_operator
    )
    const [hotLeadScoreThreshold, setHotLeadScoreThreshold] = useState(initialSettings.hot_lead_score_threshold)
    const [hotLeadAction, setHotLeadAction] = useState(initialSettings.hot_lead_action)
    const [hotLeadHandoverMessageTr, setHotLeadHandoverMessageTr] = useState(initialSettings.hot_lead_handover_message_tr)
    const [hotLeadHandoverMessageEn, setHotLeadHandoverMessageEn] = useState(initialSettings.hot_lead_handover_message_en)
    const [matchThreshold, setMatchThreshold] = useState(initialSettings.match_threshold)
    const [assistantRole, setAssistantRole] = useState(initialSettings.assistant_role)
    const [assistantIntakeRule, setAssistantIntakeRule] = useState(initialSettings.assistant_intake_rule)
    const [assistantNeverDo, setAssistantNeverDo] = useState(initialSettings.assistant_never_do)
    const [assistantOtherInstructions, setAssistantOtherInstructions] = useState(initialSettings.assistant_other_instructions)
    const [activeTab, setActiveTab] = useState<AiSettingsTabId>('general')
    const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)
    const isBotModeLocked = baseline.bot_mode_unlock_required || onboardingState?.isComplete === false
    const botModeLockHelperText = isBotModeLocked
        ? onboardingState?.isComplete === false
            ? t('botModeLockedByOnboardingProgress', {
                completed: String(onboardingState.completedSteps),
                total: String(onboardingState.totalSteps)
            })
            : t('botModeLockedByOnboarding')
        : null

    const isDirty = useMemo(() => {
        return (
            botName !== baseline.bot_name ||
            botMode !== baseline.bot_mode ||
            botDisclaimerEnabled !== baseline.bot_disclaimer_enabled ||
            botDisclaimerMessageTr !== baseline.bot_disclaimer_message_tr ||
            botDisclaimerMessageEn !== baseline.bot_disclaimer_message_en ||
            allowLeadExtractionDuringOperator !== baseline.allow_lead_extraction_during_operator ||
            hotLeadScoreThreshold !== baseline.hot_lead_score_threshold ||
            hotLeadAction !== baseline.hot_lead_action ||
            hotLeadHandoverMessageTr !== baseline.hot_lead_handover_message_tr ||
            hotLeadHandoverMessageEn !== baseline.hot_lead_handover_message_en ||
            matchThreshold !== baseline.match_threshold ||
            assistantRole !== baseline.assistant_role ||
            assistantIntakeRule !== baseline.assistant_intake_rule ||
            assistantNeverDo !== baseline.assistant_never_do ||
            assistantOtherInstructions !== baseline.assistant_other_instructions
        )
    }, [
        botName,
        botMode,
        botDisclaimerEnabled,
        botDisclaimerMessageTr,
        botDisclaimerMessageEn,
        allowLeadExtractionDuringOperator,
        hotLeadScoreThreshold,
        hotLeadAction,
        hotLeadHandoverMessageTr,
        hotLeadHandoverMessageEn,
        matchThreshold,
        assistantRole,
        assistantIntakeRule,
        assistantNeverDo,
        assistantOtherInstructions,
        baseline
    ])

    const localizedHandoverMessage = locale === 'tr' ? hotLeadHandoverMessageTr : hotLeadHandoverMessageEn
    const localizedDisclaimerMessage = locale === 'tr' ? botDisclaimerMessageTr : botDisclaimerMessageEn

    const handleLocalizedHandoverMessageChange = (value: string) => {
        if (locale === 'tr') {
            setHotLeadHandoverMessageTr(value)
            return
        }
        setHotLeadHandoverMessageEn(value)
    }

    const handleLocalizedDisclaimerMessageChange = (value: string) => {
        if (locale === 'tr') {
            setBotDisclaimerMessageTr(value)
            return
        }
        setBotDisclaimerMessageEn(value)
    }

    useEffect(() => {
        const focusTarget = searchParams.get('focus')
        if (focusTarget !== 'human-escalation') return

        setActiveTab('escalation')

        const field = searchParams.get('field')
        window.setTimeout(() => {
            const section = document.getElementById('human-escalation')
            if (section) {
                section.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }

            if (field === 'handover-message') {
                const target = document.getElementById('hot-lead-handover-message') as HTMLTextAreaElement | null
                target?.focus({ preventScroll: true })
            }
        }, 260)
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
                bot_disclaimer_enabled: botDisclaimerEnabled,
                bot_disclaimer_message_tr: botDisclaimerMessageTr,
                bot_disclaimer_message_en: botDisclaimerMessageEn,
                allow_lead_extraction_during_operator: allowLeadExtractionDuringOperator,
                hot_lead_score_threshold: hotLeadScoreThreshold,
                hot_lead_action: hotLeadAction,
                hot_lead_handover_message_tr: hotLeadHandoverMessageTr,
                hot_lead_handover_message_en: hotLeadHandoverMessageEn,
                match_threshold: matchThreshold,
                assistant_role: assistantRole,
                assistant_intake_rule: assistantIntakeRule,
                assistant_never_do: assistantNeverDo,
                assistant_other_instructions: assistantOtherInstructions
            })
            setBaseline(savedSettings)
            setBotName(savedSettings.bot_name)
            setBotMode(savedSettings.bot_mode)
            setBotDisclaimerEnabled(savedSettings.bot_disclaimer_enabled)
            setBotDisclaimerMessageTr(savedSettings.bot_disclaimer_message_tr)
            setBotDisclaimerMessageEn(savedSettings.bot_disclaimer_message_en)
            setAllowLeadExtractionDuringOperator(savedSettings.allow_lead_extraction_during_operator)
            setHotLeadScoreThreshold(savedSettings.hot_lead_score_threshold)
            setHotLeadAction(savedSettings.hot_lead_action)
            setHotLeadHandoverMessageTr(savedSettings.hot_lead_handover_message_tr)
            setHotLeadHandoverMessageEn(savedSettings.hot_lead_handover_message_en)
            setMatchThreshold(savedSettings.match_threshold)
            setAssistantRole(savedSettings.assistant_role)
            setAssistantIntakeRule(savedSettings.assistant_intake_rule)
            setAssistantNeverDo(savedSettings.assistant_never_do)
            setAssistantOtherInstructions(savedSettings.assistant_other_instructions)
            setSaved(true)
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('ai-settings-updated'))
            }
            return true
        } catch (error) {
            console.error(error)
            const message = error instanceof Error ? error.message : ''
            setSaveError(
                message === 'BOT_MODE_LOCKED_BY_ONBOARDING'
                    ? t('botModeLockedByOnboarding')
                    : t('saveError')
            )
            return false
        } finally {
            setIsSaving(false)
        }
    }

    const handleDiscard = () => {
        setBotName(baseline.bot_name)
        setBotMode(baseline.bot_mode)
        setBotDisclaimerEnabled(baseline.bot_disclaimer_enabled)
        setBotDisclaimerMessageTr(baseline.bot_disclaimer_message_tr)
        setBotDisclaimerMessageEn(baseline.bot_disclaimer_message_en)
        setAllowLeadExtractionDuringOperator(baseline.allow_lead_extraction_during_operator)
        setHotLeadScoreThreshold(baseline.hot_lead_score_threshold)
        setHotLeadAction(baseline.hot_lead_action)
        setHotLeadHandoverMessageTr(baseline.hot_lead_handover_message_tr)
        setHotLeadHandoverMessageEn(baseline.hot_lead_handover_message_en)
        setMatchThreshold(baseline.match_threshold)
        setAssistantRole(baseline.assistant_role)
        setAssistantIntakeRule(baseline.assistant_intake_rule)
        setAssistantNeverDo(baseline.assistant_never_do)
        setAssistantOtherInstructions(baseline.assistant_other_instructions)
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
                <div className="max-w-5xl">
                    {saveError && <p className="mb-4 text-sm text-red-600">{saveError}</p>}
                    <AiSettingsForm
                        botName={botName}
                        botMode={botMode}
                        isBotModeLocked={isBotModeLocked}
                        botModeLockHelperText={botModeLockHelperText}
                        botDisclaimerEnabled={botDisclaimerEnabled}
                        botDisclaimerMessage={localizedDisclaimerMessage}
                        allowLeadExtractionDuringOperator={allowLeadExtractionDuringOperator}
                        hotLeadScoreThreshold={hotLeadScoreThreshold}
                        hotLeadAction={hotLeadAction}
                        hotLeadHandoverMessage={localizedHandoverMessage}
                        matchThreshold={matchThreshold}
                        assistantRole={assistantRole}
                        assistantIntakeRule={assistantIntakeRule}
                        assistantNeverDo={assistantNeverDo}
                        assistantOtherInstructions={assistantOtherInstructions}
                        activeTab={activeTab}
                        onActiveTabChange={setActiveTab}
                        onBotNameChange={setBotName}
                        onBotModeChange={setBotMode}
                        onBotDisclaimerEnabledChange={setBotDisclaimerEnabled}
                        onBotDisclaimerMessageChange={handleLocalizedDisclaimerMessageChange}
                        onAllowLeadExtractionDuringOperatorChange={setAllowLeadExtractionDuringOperator}
                        onHotLeadScoreThresholdChange={setHotLeadScoreThreshold}
                        onHotLeadActionChange={setHotLeadAction}
                        onHotLeadHandoverMessageChange={handleLocalizedHandoverMessageChange}
                        onMatchThresholdChange={setMatchThreshold}
                        onAssistantRoleChange={setAssistantRole}
                        onAssistantIntakeRuleChange={setAssistantIntakeRule}
                        onAssistantNeverDoChange={setAssistantNeverDo}
                        onAssistantOtherInstructionsChange={setAssistantOtherInstructions}
                        onOpenHowItWorks={() => setIsHowItWorksOpen(true)}
                    />
                </div>
            </div>

            <AiInstructionsHelpModal
                isOpen={isHowItWorksOpen}
                onClose={() => setIsHowItWorksOpen(false)}
            />

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
