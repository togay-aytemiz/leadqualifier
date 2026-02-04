'use client'

import { useTranslations } from 'next-intl'
import { SettingsSection } from '@/components/settings/SettingsSection'

interface AiSettingsFormProps {
    botName: string
    matchThreshold: number
    prompt: string
    onBotNameChange: (value: string) => void
    onMatchThresholdChange: (value: number) => void
    onPromptChange: (value: string) => void
}

export default function AiSettingsForm({
    botName,
    matchThreshold,
    prompt,
    onBotNameChange,
    onMatchThresholdChange,
    onPromptChange
}: AiSettingsFormProps) {
    const t = useTranslations('aiSettings')

    return (
        <div className="max-w-5xl">
            <SettingsSection
                title={t('botNameTitle')}
                description={t('botNameDescription')}
            >
                <label className="text-sm font-medium text-gray-700">{t('botNameLabel')}</label>
                <input
                    type="text"
                    value={botName}
                    onChange={(e) => onBotNameChange(e.target.value)}
                    placeholder={t('botNamePlaceholder')}
                    className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                />
            </SettingsSection>

            <SettingsSection
                title={t('thresholdTitle')}
                description={t('thresholdDescription')}
            >
                <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">{t('threshold')}</label>
                    <span className="text-xs font-mono text-gray-500">{matchThreshold.toFixed(2)}</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={matchThreshold}
                    onChange={(e) => onMatchThresholdChange(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
            </SettingsSection>

            <SettingsSection
                title={t('promptTitle')}
                description={t('promptDescription')}
            >
                <label className="text-sm font-medium text-gray-700">{t('promptLabel')}</label>
                <textarea
                    rows={6}
                    value={prompt}
                    onChange={(e) => onPromptChange(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                />
            </SettingsSection>
        </div>
    )
}
