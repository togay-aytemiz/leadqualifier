'use client'

import { useEffect, useState } from 'react'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { useTranslations } from 'next-intl'

interface OfferingProfileSectionProps {
    summary: string
    aiSuggestionsEnabled: boolean
    suggestions: Array<{ id: string; content: string; created_at: string }>
    onSummaryChange: (value: string) => void
    onAiSuggestionsEnabledChange: (value: boolean) => void
}

export function OfferingProfileSection({
    summary: initialSummary,
    aiSuggestionsEnabled: initialAiSuggestionsEnabled,
    suggestions,
    onSummaryChange,
    onAiSuggestionsEnabledChange
}: OfferingProfileSectionProps) {
    const t = useTranslations('organizationSettings')
    const [summary, setSummary] = useState(initialSummary)
    const [aiSuggestionsEnabled, setAiSuggestionsEnabled] = useState(initialAiSuggestionsEnabled)

    useEffect(() => {
        setSummary(initialSummary)
    }, [initialSummary])

    useEffect(() => {
        setAiSuggestionsEnabled(initialAiSuggestionsEnabled)
    }, [initialAiSuggestionsEnabled])

    return (
        <SettingsSection title={t('offeringProfileTitle')} description={t('offeringProfileDescription')}>
            <div className="space-y-4">
                <textarea
                    rows={6}
                    value={summary}
                    onChange={(e) => {
                        const next = e.target.value
                        setSummary(next)
                        onSummaryChange(next)
                    }}
                    aria-label={t('offeringProfileTitle')}
                    placeholder={t('offeringProfilePlaceholder')}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                />

                <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        checked={aiSuggestionsEnabled}
                        onChange={(e) => {
                            const next = e.target.checked
                            setAiSuggestionsEnabled(next)
                            onAiSuggestionsEnabledChange(next)
                        }}
                    />
                    {t('offeringProfileAiToggleLabel')}
                </label>
                <p className="text-xs text-gray-500">{t('offeringProfileAiToggleHelp')}</p>

                <div className="border-t pt-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">{t('offeringProfileSuggestionsTitle')}</p>
                        {aiSuggestionsEnabled && (
                            <span className="text-xs text-gray-500">{t('offeringProfileSuggestionsNote')}</span>
                        )}
                    </div>
                    {suggestions.length === 0 ? (
                        <p className="mt-2 text-xs text-gray-500">{t('offeringProfileSuggestionsEmpty')}</p>
                    ) : (
                        <div className="mt-3 space-y-3">
                            {suggestions.map((item) => (
                                <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{item.content}</p>
                                    <p className="mt-2 text-xs text-gray-500">
                                        {new Date(item.created_at).toLocaleString()}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </SettingsSection>
    )
}
