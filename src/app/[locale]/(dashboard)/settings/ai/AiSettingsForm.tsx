'use client'

import { useTranslations } from 'next-intl'
import { SettingsSection } from '@/components/settings/SettingsSection'
import type { AiBotMode, HumanEscalationAction } from '@/types/database'

interface AiSettingsFormProps {
    botName: string
    botMode: AiBotMode
    allowLeadExtractionDuringOperator: boolean
    hotLeadScoreThreshold: number
    hotLeadAction: HumanEscalationAction
    hotLeadHandoverMessage: string
    matchThreshold: number
    prompt: string
    onBotNameChange: (value: string) => void
    onBotModeChange: (value: AiBotMode) => void
    onAllowLeadExtractionDuringOperatorChange: (value: boolean) => void
    onHotLeadScoreThresholdChange: (value: number) => void
    onHotLeadActionChange: (value: HumanEscalationAction) => void
    onHotLeadHandoverMessageChange: (value: string) => void
    onMatchThresholdChange: (value: number) => void
    onPromptChange: (value: string) => void
}

interface SelectionCardProps {
    label: string
    description: string
    selected: boolean
    onSelect: () => void
}

function SelectionCard({ label, description, selected, onSelect }: SelectionCardProps) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={`w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors ${selected
                ? 'border-blue-500 bg-blue-50/50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
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

export default function AiSettingsForm({
    botName,
    botMode,
    allowLeadExtractionDuringOperator,
    hotLeadScoreThreshold,
    hotLeadAction,
    hotLeadHandoverMessage,
    matchThreshold,
    prompt,
    onBotNameChange,
    onBotModeChange,
    onAllowLeadExtractionDuringOperatorChange,
    onHotLeadScoreThresholdChange,
    onHotLeadActionChange,
    onHotLeadHandoverMessageChange,
    onMatchThresholdChange,
    onPromptChange
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

    return (
        <div className="max-w-5xl">
            <SettingsSection
                title={t('botModeTitle')}
                description={t('botModeDescription')}
            >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {options.map(option => {
                        const isSelected = botMode === option.value
                        return (
                            <SelectionCard
                                key={option.value}
                                label={option.label}
                                description={option.description}
                                selected={isSelected}
                                onSelect={() => onBotModeChange(option.value)}
                            />
                        )
                    })}
                </div>
            </SettingsSection>

            <SettingsSection
                title={t('operatorLeadExtractionTitle')}
                description={t('operatorLeadExtractionDescription')}
            >
                <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        checked={allowLeadExtractionDuringOperator}
                        onChange={(e) => onAllowLeadExtractionDuringOperatorChange(e.target.checked)}
                    />
                    {t('operatorLeadExtractionLabel')}
                </label>
                <p className="text-xs text-gray-500">{t('operatorLeadExtractionHelp')}</p>
            </SettingsSection>

            <div id="human-escalation">
                <SettingsSection
                    title={t('humanEscalationTitle')}
                    description={t('humanEscalationDescription')}
                    showBottomDivider={false}
                >
                    <div className="space-y-8">
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs font-semibold text-gray-500 tracking-wider">{t('humanEscalationStepAutomaticTitle')}</p>
                                <p className="mt-1 text-sm text-gray-500">{t('humanEscalationStepAutomaticDescription')}</p>
                            </div>

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

                        <div className="space-y-3 border-t border-gray-200 pt-6">
                            <div>
                                <p className="text-xs font-semibold text-gray-500 tracking-wider">{t('humanEscalationStepSkillTitle')}</p>
                                <p className="mt-1 text-sm text-gray-500">{t('humanEscalationStepSkillDescription')}</p>
                            </div>
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
                    </div>
                </SettingsSection>
            </div>

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
                title={t('promptTitle')}
                description={t('promptDescription')}
            >
                <textarea
                    rows={6}
                    value={prompt}
                    onChange={(e) => onPromptChange(e.target.value)}
                    aria-label={t('promptLabel')}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                />
            </SettingsSection>
        </div >
    )
}
