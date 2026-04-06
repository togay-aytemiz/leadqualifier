'use client'

import { useTranslations } from 'next-intl'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import type { AiBotMode, HumanEscalationAction } from '@/types/database'

export type AiSettingsTabId = 'general' | 'behaviorAndLogic' | 'escalation'

interface AiSettingsFormProps {
    botName: string
    botMode: AiBotMode
    isBotModeLocked: boolean
    botModeLockHelperText: string | null
    botDisclaimerEnabled: boolean
    botDisclaimerMessage: string
    allowLeadExtractionDuringOperator: boolean
    hotLeadScoreThreshold: number
    hotLeadAction: HumanEscalationAction
    hotLeadHandoverMessage: string
    matchThreshold: number
    assistantRole: string
    assistantIntakeRule: string
    assistantNeverDo: string
    assistantOtherInstructions: string
    activeTab: AiSettingsTabId
    onActiveTabChange: (value: AiSettingsTabId) => void
    onBotNameChange: (value: string) => void
    onBotModeChange: (value: AiBotMode) => void
    onBotDisclaimerEnabledChange: (value: boolean) => void
    onBotDisclaimerMessageChange: (value: string) => void
    onAllowLeadExtractionDuringOperatorChange: (value: boolean) => void
    onHotLeadScoreThresholdChange: (value: number) => void
    onHotLeadActionChange: (value: HumanEscalationAction) => void
    onHotLeadHandoverMessageChange: (value: string) => void
    onMatchThresholdChange: (value: number) => void
    onAssistantRoleChange: (value: string) => void
    onAssistantIntakeRuleChange: (value: string) => void
    onAssistantNeverDoChange: (value: string) => void
    onAssistantOtherInstructionsChange: (value: string) => void
    onOpenHowItWorks: () => void
}

interface SelectionCardProps {
    label: string
    description: string
    selected: boolean
    disabled?: boolean
    onSelect: () => void
}

function SelectionCard({ label, description, selected, disabled = false, onSelect }: SelectionCardProps) {
    const stateClassName = disabled
        ? selected
            ? 'border-blue-500 bg-blue-50/50 cursor-not-allowed'
            : 'border-gray-200 bg-white cursor-not-allowed'
        : selected
            ? 'border-blue-500 bg-blue-50/50'
            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'

    return (
        <button
            type="button"
            onClick={onSelect}
            disabled={disabled}
            className={`w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors disabled:opacity-100 ${stateClassName}`}
        >
            <div className="flex items-start gap-2.5">
                <div
                    className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 grid place-items-center ${selected ? 'border-blue-500' : 'border-gray-300'}`}
                >
                    <div className={`h-2 w-2 rounded-full ${selected ? 'bg-blue-500' : 'bg-transparent'}`} />
                </div>
                <div>
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{label}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{description}</p>
                </div>
            </div>
        </button>
    )
}

interface InstructionTextareaProps {
    id: string
    label: string
    description: string
    value: string
    onChange: (value: string) => void
}

function InstructionTextarea({ id, label, description, value, onChange }: InstructionTextareaProps) {
    return (
        <div className="space-y-2">
            <label htmlFor={id} className="block text-sm font-medium text-gray-800">
                {label}
            </label>
            <p className="text-xs leading-5 text-gray-500">{description}</p>
            <textarea
                id={id}
                rows={4}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                aria-label={label}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-2 focus-visible:border-blue-500"
            />
        </div>
    )
}

export default function AiSettingsForm({
    botName,
    botMode,
    isBotModeLocked,
    botModeLockHelperText,
    botDisclaimerEnabled,
    botDisclaimerMessage,
    allowLeadExtractionDuringOperator,
    hotLeadScoreThreshold,
    hotLeadAction,
    hotLeadHandoverMessage,
    matchThreshold,
    assistantRole,
    assistantIntakeRule,
    assistantNeverDo,
    assistantOtherInstructions,
    activeTab,
    onActiveTabChange,
    onBotNameChange,
    onBotModeChange,
    onBotDisclaimerEnabledChange,
    onBotDisclaimerMessageChange,
    onAllowLeadExtractionDuringOperatorChange,
    onHotLeadScoreThresholdChange,
    onHotLeadActionChange,
    onHotLeadHandoverMessageChange,
    onMatchThresholdChange,
    onAssistantRoleChange,
    onAssistantIntakeRuleChange,
    onAssistantNeverDoChange,
    onAssistantOtherInstructionsChange,
    onOpenHowItWorks
}: AiSettingsFormProps) {
    const t = useTranslations('aiSettings')
    const options: Array<{ value: AiBotMode; label: string; description: string }> = [
        { value: 'active', label: t('botModeActive'), description: t('botModeActiveDescription') },
        { value: 'shadow', label: t('botModeShadow'), description: t('botModeShadowDescription') },
        { value: 'off', label: t('botModeOff'), description: t('botModeOffDescription') }
    ]
    const hotLeadActionOptions: Array<{ value: HumanEscalationAction; label: string; description: string }> = [
        {
            value: 'notify_only',
            label: t('humanEscalationActionNotifyOnly'),
            description: t('humanEscalationActionNotifyOnlyHelp')
        },
        {
            value: 'switch_to_operator',
            label: t('humanEscalationActionSwitchOperator'),
            description: t('humanEscalationActionSwitchOperatorHelp')
        }
    ]
    const normalizedHotLeadThreshold = Math.max(0, Math.min(10, Math.round(hotLeadScoreThreshold)))
    const hotLeadRightFillPercent = (normalizedHotLeadThreshold / 10) * 100
    const normalizedMatchThreshold = Math.max(0, Math.min(1, matchThreshold))
    const matchRightFillPercent = normalizedMatchThreshold * 100
    const tabs = [
        { id: 'general', label: t('tabs.general') },
        { id: 'behaviorAndLogic', label: t('tabs.behaviorAndLogic') },
        { id: 'escalation', label: t('tabs.escalation') }
    ] as const

    return (
        <div className="max-w-5xl">
            <SettingsTabs
                tabs={tabs.map(tab => ({ id: tab.id, label: tab.label }))}
                activeTabId={activeTab}
                onTabChange={(value) => onActiveTabChange(value as AiSettingsTabId)}
            >
                {(tabId) => (
                    <>
                        {tabId === 'general' && (
                            <>
                                <SettingsSection
                                    title={t('botModeTitle')}
                                    description={t('botModeDescription')}
                                >
                                    {isBotModeLocked && botModeLockHelperText ? (
                                        <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
                                            <p className="text-sm font-semibold leading-6 text-violet-950">
                                                {botModeLockHelperText}
                                            </p>
                                        </div>
                                    ) : null}
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                        {options.map(option => {
                                            const isSelected = botMode === option.value
                                            return (
                                                <SelectionCard
                                                    key={option.value}
                                                    label={option.label}
                                                    description={option.description}
                                                    selected={isSelected}
                                                    disabled={isBotModeLocked}
                                                    onSelect={() => onBotModeChange(option.value)}
                                                />
                                            )
                                        })}
                                    </div>
                                </SettingsSection>

                                <SettingsSection
                                    title={t('botNameTitle')}
                                    description={t('botNameDescription')}
                                    showTopDivider
                                >
                                    <input
                                        type="text"
                                        value={botName}
                                        onChange={(e) => onBotNameChange(e.target.value)}
                                        placeholder={t('botNamePlaceholder')}
                                        aria-label={t('botNameLabel')}
                                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                                    />
                                </SettingsSection>

                                <SettingsSection
                                    title={t('botDisclaimerTitle')}
                                    description={t('botDisclaimerDescription')}
                                >
                                    <div className="space-y-3">
                                        <label className="flex items-center gap-2 text-sm text-gray-700">
                                            <input
                                                type="checkbox"
                                                checked={botDisclaimerEnabled}
                                                onChange={(event) => onBotDisclaimerEnabledChange(event.target.checked)}
                                            />
                                            {t('botDisclaimerEnabledLabel')}
                                        </label>
                                        <p className="text-xs text-gray-500">{t('botDisclaimerHelp')}</p>
                                        <textarea
                                            rows={3}
                                            value={botDisclaimerMessage}
                                            onChange={(event) => onBotDisclaimerMessageChange(event.target.value)}
                                            disabled={!botDisclaimerEnabled}
                                            aria-label={t('botDisclaimerMessageLabel')}
                                            placeholder={t('botDisclaimerPlaceholder')}
                                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
                                        />
                                    </div>
                                </SettingsSection>
                            </>
                        )}

                        {tabId === 'behaviorAndLogic' && (
                            <>
                                <SettingsSection
                                    title={t('thresholdTitle')}
                                    description={t('thresholdDescription')}
                                >
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.05"
                                            value={normalizedMatchThreshold}
                                            onChange={(event) => {
                                                const nextValue = Number.parseFloat(event.target.value)
                                                onMatchThresholdChange(Number.isFinite(nextValue) ? nextValue : 0)
                                            }}
                                            aria-label={t('threshold')}
                                            style={{
                                                background: `linear-gradient(to right, #e5e7eb 0%, #e5e7eb ${matchRightFillPercent}%, #bfdbfe ${matchRightFillPercent}%, #bfdbfe 100%)`
                                            }}
                                            className="flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                        />
                                        <span className="text-xs font-mono text-gray-700 bg-white border border-gray-200 px-1.5 py-0.5 rounded shadow-sm">
                                            {`≥ ${normalizedMatchThreshold.toFixed(2)}`}
                                        </span>
                                    </div>
                                </SettingsSection>

                                <SettingsSection
                                    title={t('assistantInstructionsTitle')}
                                    description={t('assistantInstructionsDescription')}
                                    descriptionAddon={(
                                        <button
                                            type="button"
                                            onClick={onOpenHowItWorks}
                                            className="inline-flex items-center text-sm font-medium text-[#242A40] underline decoration-1 underline-offset-2 transition hover:text-[#1f2437] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#242A40]/15 focus-visible:ring-offset-2"
                                        >
                                            {t('howItWorksAction')}
                                        </button>
                                    )}
                                >
                                    <div className="grid gap-5">
                                        <InstructionTextarea
                                            id="assistant-role"
                                            label={t('assistantRoleLabel')}
                                            description={t('assistantRoleDescription')}
                                            value={assistantRole}
                                            onChange={onAssistantRoleChange}
                                        />
                                        <InstructionTextarea
                                            id="assistant-intake-rule"
                                            label={t('assistantIntakeRuleLabel')}
                                            description={t('assistantIntakeRuleDescription')}
                                            value={assistantIntakeRule}
                                            onChange={onAssistantIntakeRuleChange}
                                        />
                                        <InstructionTextarea
                                            id="assistant-never-do"
                                            label={t('assistantNeverDoLabel')}
                                            description={t('assistantNeverDoDescription')}
                                            value={assistantNeverDo}
                                            onChange={onAssistantNeverDoChange}
                                        />
                                        <InstructionTextarea
                                            id="assistant-other-instructions"
                                            label={t('assistantOtherInstructionsLabel')}
                                            description={t('assistantOtherInstructionsDescription')}
                                            value={assistantOtherInstructions}
                                            onChange={onAssistantOtherInstructionsChange}
                                        />
                                    </div>
                                </SettingsSection>
                            </>
                        )}

                        {tabId === 'escalation' && (
                            <div id="human-escalation">
                                <SettingsSection
                                    title={t('operatorLeadExtractionTitle')}
                                    description={t('operatorLeadExtractionDescription')}
                                >
                                    <label className="flex items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={allowLeadExtractionDuringOperator}
                                            onChange={(event) => onAllowLeadExtractionDuringOperatorChange(event.target.checked)}
                                        />
                                        {t('operatorLeadExtractionLabel')}
                                    </label>
                                    <p className="text-xs text-gray-500">{t('operatorLeadExtractionHelp')}</p>
                                </SettingsSection>

                                <SettingsSection
                                    title={t('automaticEscalationTitle')}
                                >
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="block text-sm font-medium text-gray-700">{t('hotLeadScoreLabel')}</label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="10"
                                                    step="1"
                                                    value={normalizedHotLeadThreshold}
                                                    onChange={(event) => {
                                                        const nextValue = Number.parseInt(event.target.value, 10)
                                                        onHotLeadScoreThresholdChange(Number.isFinite(nextValue) ? nextValue : 0)
                                                    }}
                                                    aria-label={t('hotLeadScoreLabel')}
                                                    style={{
                                                        background: `linear-gradient(to right, #e5e7eb 0%, #e5e7eb ${hotLeadRightFillPercent}%, #bfdbfe ${hotLeadRightFillPercent}%, #bfdbfe 100%)`
                                                    }}
                                                    className="flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                />
                                                <span className="text-xs font-mono text-gray-700 bg-white border border-gray-200 px-1.5 py-0.5 rounded shadow-sm">
                                                    {`≥ ${normalizedHotLeadThreshold}`}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-[11px] text-gray-400">
                                                <span>0</span>
                                                <span>10</span>
                                            </div>
                                            <p className="text-xs text-gray-500">{t('hotLeadScoreHelp')}</p>
                                        </div>

                                        <div className="space-y-2">
                                            <p className="text-sm font-medium text-gray-700">{t('humanEscalationActionLabel')}</p>
                                            <div className="grid gap-3 md:grid-cols-2">
                                                {hotLeadActionOptions.map(option => {
                                                    const isSelected = hotLeadAction === option.value
                                                    return (
                                                        <SelectionCard
                                                            key={option.value}
                                                            label={option.label}
                                                            description={option.description}
                                                            selected={isSelected}
                                                            onSelect={() => onHotLeadActionChange(option.value)}
                                                        />
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </SettingsSection>

                                <SettingsSection
                                    title={t('skillBasedHandoverTitle')}
                                    showBottomDivider={false}
                                >
                                    <div className="space-y-3">
                                        <label htmlFor="hot-lead-handover-message" className="block text-sm font-medium text-gray-700">
                                            {t('humanEscalationMessageLabel')}
                                        </label>
                                        <textarea
                                            id="hot-lead-handover-message"
                                            rows={3}
                                            value={hotLeadHandoverMessage}
                                            onChange={(event) => onHotLeadHandoverMessageChange(event.target.value)}
                                            aria-label={t('humanEscalationMessageLabel')}
                                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                                        />
                                    </div>
                                </SettingsSection>
                            </div>
                        )}
                    </>
                )}
            </SettingsTabs>
        </div >
    )
}
