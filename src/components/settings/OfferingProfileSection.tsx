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
    onSave: (summary: string, catalogEnabled: boolean) => Promise<void>
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
    onSave,
    onApproveUpdate,
    onRejectUpdate,
    onApproveCandidate,
    onRejectCandidate
}: OfferingProfileSectionProps) {
    const t = useTranslations('aiSettings')
    const [summary, setSummary] = useState(initialSummary)
    const [catalogEnabled, setCatalogEnabled] = useState(initialCatalogEnabled)
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        setSummary(initialSummary)
    }, [initialSummary])

    useEffect(() => {
        setCatalogEnabled(initialCatalogEnabled)
    }, [initialCatalogEnabled])

    const handleSave = async () => {
        setIsSaving(true)
        try {
            await onSave(summary, catalogEnabled)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <SettingsSection title={t('offeringProfileTitle')} description={t('offeringProfileDescription')}>
            <div className="space-y-4">
                <label className="text-sm font-medium text-gray-700">{t('offeringProfileLabel')}</label>
                <textarea
                    rows={6}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                />

                <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        checked={catalogEnabled}
                        onChange={(e) => setCatalogEnabled(e.target.checked)}
                    />
                    {t('catalogEnabledLabel')}
                </label>

                <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? t('saving') : t('offeringProfileSave')}
                </Button>

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
            </div>
        </SettingsSection>
    )
}
