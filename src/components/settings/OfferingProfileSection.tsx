'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { useTranslations } from 'next-intl'

interface OfferingProfileSectionProps {
    summary: string
    catalogEnabled: boolean
    pendingUpdates: Array<{ id: string; proposed_summary: string }>
    pendingCandidates: Array<{ id: string; proposed_name: string }>
    onSummaryChange: (value: string) => void
    onCatalogEnabledChange: (value: boolean) => void
    onApproveUpdate: (id: string) => Promise<void>
    onRejectUpdate: (id: string) => Promise<void>
    onApproveCandidate: (id: string) => Promise<void>
    onRejectCandidate: (id: string) => Promise<void>
}

export function OfferingProfileSection({
    summary: initialSummary,
    catalogEnabled: initialCatalogEnabled,
    pendingUpdates,
    pendingCandidates,
    onSummaryChange,
    onCatalogEnabledChange,
    onApproveUpdate,
    onRejectUpdate,
    onApproveCandidate,
    onRejectCandidate
}: OfferingProfileSectionProps) {
    const t = useTranslations('organizationSettings')
    const [summary, setSummary] = useState(initialSummary)
    const [catalogEnabled, setCatalogEnabled] = useState(initialCatalogEnabled)

    useEffect(() => {
        setSummary(initialSummary)
    }, [initialSummary])

    useEffect(() => {
        setCatalogEnabled(initialCatalogEnabled)
    }, [initialCatalogEnabled])

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
                    placeholder={t('offeringProfilePlaceholder')}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                />

                <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        checked={catalogEnabled}
                        onChange={(e) => {
                            const next = e.target.checked
                            setCatalogEnabled(next)
                            onCatalogEnabledChange(next)
                        }}
                    />
                    {t('catalogEnabledLabel')}
                </label>
                <p className="text-xs text-gray-500">{t('catalogEnabledHelp')}</p>

                {pendingUpdates.length > 0 && (
                    <div className="border-t pt-4">
                        <p className="text-sm font-medium text-gray-900">{t('pendingProfileUpdates')}</p>
                        {pendingUpdates.map((item) => (
                            <div key={item.id} className="mt-2 rounded-lg border p-3">
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.proposed_summary}</p>
                                <div className="mt-2 flex gap-2">
                                    <Button onClick={() => onApproveUpdate(item.id)}>{t('approve')}</Button>
                                    <Button variant="secondary" onClick={() => onRejectUpdate(item.id)}>{t('reject')}</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {catalogEnabled && pendingCandidates.length > 0 && (
                    <div className="border-t pt-4">
                        <p className="text-sm font-medium text-gray-900">{t('pendingServiceCandidates')}</p>
                        {pendingCandidates.map((item) => (
                            <div key={item.id} className="mt-2 rounded-lg border p-3 flex items-center justify-between">
                                <span className="text-sm text-gray-700">{item.proposed_name}</span>
                                <div className="flex gap-2">
                                    <Button onClick={() => onApproveCandidate(item.id)}>{t('approve')}</Button>
                                    <Button variant="secondary" onClick={() => onRejectCandidate(item.id)}>{t('reject')}</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {pendingUpdates.length === 0 && (!catalogEnabled || pendingCandidates.length === 0) && (
                    <p className="text-xs text-gray-500">{t('offeringProfileEmpty')}</p>
                )}
            </div>
        </SettingsSection>
    )
}
