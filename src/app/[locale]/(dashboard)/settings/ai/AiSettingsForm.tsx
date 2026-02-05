'use client'

import { useTranslations } from 'next-intl'
import { SettingsSection } from '@/components/settings/SettingsSection'
import type { AiBotMode } from '@/types/database'

interface AiSettingsFormProps {
    botName: string
    botMode: AiBotMode
    allowLeadExtractionDuringOperator: boolean
    matchThreshold: number
    prompt: string
    onBotNameChange: (value: string) => void
    onBotModeChange: (value: AiBotMode) => void
    onAllowLeadExtractionDuringOperatorChange: (value: boolean) => void
    onMatchThresholdChange: (value: number) => void
    onPromptChange: (value: string) => void
}

export default function AiSettingsForm({
    botName,
    botMode,
    allowLeadExtractionDuringOperator,
    matchThreshold,
    prompt,
    onBotNameChange,
    onBotModeChange,
    onAllowLeadExtractionDuringOperatorChange,
    onMatchThresholdChange,
    onPromptChange
}: AiSettingsFormProps) {
    const t = useTranslations('aiSettings')
    const options: Array<{ value: AiBotMode; label: string; description: string }> = [
        { value: 'active', label: t('botModeActive'), description: t('botModeActiveDescription') },
        { value: 'shadow', label: t('botModeShadow'), description: t('botModeShadowDescription') },
        { value: 'off', label: t('botModeOff'), description: t('botModeOffDescription') }
    ]

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
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => onBotModeChange(option.value)}
                                className={`w-full rounded-lg border p-4 text-left transition-colors ${isSelected
                                    ? 'border-blue-500 bg-blue-50/50'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div
                                        className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 grid place-items-center ${isSelected ? 'border-blue-500' : 'border-gray-300'}`}
                                    >
                                        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">{option.label}</p>
                                        <p className="mt-1 text-xs text-gray-500">{option.description}</p>
                                    </div>
                                </div>
                            </button>
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

            <SettingsSection
                title={t('botNameTitle')}
                description={t('botNameDescription')}
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
                        value={matchThreshold}
                        onChange={(e) => onMatchThresholdChange(parseFloat(e.target.value))}
                        aria-label={t('threshold')}
                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <span className="text-xs font-mono text-gray-500">{matchThreshold.toFixed(2)}</span>
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
        </div>
    )
}
