'use client'

import { useEffect, useMemo, useState } from 'react'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { useLocale, useTranslations } from 'next-intl'
import { Badge, Button } from '@/design'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'

interface OfferingProfileSectionProps {
    summary: string
    aiSuggestionsEnabled: boolean
    suggestions: Array<{ id: string; content: string; created_at: string; status: 'pending' | 'approved' | 'rejected' }>
    onSummaryChange: (value: string) => void
    onAiSuggestionsEnabledChange: (value: boolean) => void
    onReviewSuggestion: (suggestionId: string, status: 'approved' | 'rejected') => Promise<void> | void
}

export function OfferingProfileSection({
    summary: initialSummary,
    aiSuggestionsEnabled: initialAiSuggestionsEnabled,
    suggestions,
    onSummaryChange,
    onAiSuggestionsEnabledChange,
    onReviewSuggestion
}: OfferingProfileSectionProps) {
    const t = useTranslations('organizationSettings')
    const locale = useLocale()
    const [summary, setSummary] = useState(initialSummary)
    const [aiSuggestionsEnabled, setAiSuggestionsEnabled] = useState(initialAiSuggestionsEnabled)
    const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending')
    const [hasSetInitialTab, setHasSetInitialTab] = useState(false)
    const [visibleCounts, setVisibleCounts] = useState({
        pending: 3,
        approved: 3,
        rejected: 3
    })
    const [reviewingId, setReviewingId] = useState<string | null>(null)

    useEffect(() => {
        setSummary(initialSummary)
    }, [initialSummary])

    useEffect(() => {
        setAiSuggestionsEnabled(initialAiSuggestionsEnabled)
    }, [initialAiSuggestionsEnabled])

    const grouped = useMemo(() => {
        return {
            pending: suggestions.filter(item => item.status === 'pending'),
            approved: suggestions.filter(item => item.status === 'approved'),
            rejected: suggestions.filter(item => item.status === 'rejected')
        }
    }, [suggestions])

    useEffect(() => {
        if (!hasSetInitialTab) {
            if (grouped.pending.length > 0) {
                setActiveTab('pending')
            } else if (grouped.approved.length > 0) {
                setActiveTab('approved')
            } else if (grouped.rejected.length > 0) {
                setActiveTab('rejected')
            }
            setHasSetInitialTab(true)
            return
        }

        if (grouped[activeTab].length > 0) return

        if (grouped.pending.length > 0) {
            setActiveTab('pending')
        } else if (grouped.approved.length > 0) {
            setActiveTab('approved')
        } else if (grouped.rejected.length > 0) {
            setActiveTab('rejected')
        }
    }, [activeTab, grouped, hasSetInitialTab])

    const dateFormatter = useMemo(() => {
        return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
    }, [locale])

    const tabs = [
        { key: 'pending' as const, label: t('offeringProfileSuggestionsTabPending'), count: grouped.pending.length },
        { key: 'approved' as const, label: t('offeringProfileSuggestionsTabApproved'), count: grouped.approved.length },
        { key: 'rejected' as const, label: t('offeringProfileSuggestionsTabRejected'), count: grouped.rejected.length }
    ]

    const activeItems = grouped[activeTab]
    const visibleCount = visibleCounts[activeTab]
    const visibleItems = activeItems.slice(0, visibleCount)
    const hasMore = activeItems.length > visibleCount

    const handleShowMore = () => {
        setVisibleCounts(prev => ({
            ...prev,
            [activeTab]: prev[activeTab] + 3
        }))
    }

    const handleReview = async (id: string, status: 'approved' | 'rejected') => {
        setReviewingId(id)
        try {
            await onReviewSuggestion(id, status)
        } finally {
            setReviewingId(null)
        }
    }

    const emptyState = {
        pending: {
            icon: <Clock size={24} />,
            title: t('offeringProfileSuggestionsEmptyPendingTitle'),
            description: t('offeringProfileSuggestionsEmptyPendingDesc')
        },
        approved: {
            icon: <CheckCircle2 size={24} />,
            title: t('offeringProfileSuggestionsEmptyApprovedTitle'),
            description: t('offeringProfileSuggestionsEmptyApprovedDesc')
        },
        rejected: {
            icon: <XCircle size={24} />,
            title: t('offeringProfileSuggestionsEmptyRejectedTitle'),
            description: t('offeringProfileSuggestionsEmptyRejectedDesc')
        }
    }[activeTab]

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
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">{t('offeringProfileSuggestionsTitle')}</p>
                            {grouped.pending.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                                    {t('offeringProfileSuggestionsPendingNotice', { count: grouped.pending.length })}
                                </span>
                            )}
                        </div>
                        {aiSuggestionsEnabled && <span className="text-xs text-gray-500">{t('offeringProfileSuggestionsNote')}</span>}
                    </div>

                    <div className="mt-3 flex border-b border-gray-100">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors text-center flex items-center justify-center gap-2 ${activeTab === tab.key
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
                                    }`}
                            >
                                <span>{tab.label}</span>
                                <Badge variant={activeTab === tab.key ? 'info' : 'neutral'}>
                                    {tab.count}
                                </Badge>
                            </button>
                        ))}
                    </div>

                    {activeItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-6 text-center mt-4">
                            <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center mb-3">
                                {emptyState.icon}
                            </div>
                            <h3 className="text-sm font-bold text-gray-900 mb-1">{emptyState.title}</h3>
                            <p className="text-gray-500 text-xs max-w-[260px]">{emptyState.description}</p>
                        </div>
                    ) : (
                        <div className="mt-4 space-y-3">
                            {visibleItems.map((item) => (
                                <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{item.content}</p>
                                        {item.status === 'pending' && (
                                            <div className="flex gap-2 shrink-0">
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => handleReview(item.id, 'approved')}
                                                    disabled={reviewingId === item.id}
                                                >
                                                    {t('offeringProfileSuggestionApprove')}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="danger"
                                                    onClick={() => handleReview(item.id, 'rejected')}
                                                    disabled={reviewingId === item.id}
                                                >
                                                    {t('offeringProfileSuggestionReject')}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                    <p className="mt-2 text-xs text-gray-500">
                                        {dateFormatter.format(new Date(item.created_at))}
                                    </p>
                                </div>
                            ))}
                            {hasMore && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="w-full"
                                    onClick={handleShowMore}
                                >
                                    {t('offeringProfileSuggestionsShowMore')}
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </SettingsSection>
    )
}
