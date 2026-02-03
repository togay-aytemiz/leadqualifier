'use client'

import { useTranslations } from 'next-intl'
import { SettingsSection } from '@/components/settings/SettingsSection'

interface AiSettingsFormProps {
    matchThreshold: number
    prompt: string
    onMatchThresholdChange: (value: number) => void
    onPromptChange: (value: string) => void
}

export default function AiSettingsForm({
    matchThreshold,
    prompt,
    onMatchThresholdChange,
    onPromptChange
}: AiSettingsFormProps) {
    const t = useTranslations('aiSettings')

    return (
        <div className="max-w-5xl">
            <SettingsSection
                title={t('thresholdTitle')}
                description={t('thresholdDescription')}
                summary={t('thresholdSummary', { value: matchThreshold.toFixed(2) })}
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
                summary={t('promptSummary', { count: prompt.trim().length })}
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
