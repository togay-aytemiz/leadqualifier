'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Badge, Button } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { Archive, CheckCircle2, ChevronDown, ChevronUp, Clock, XCircle } from 'lucide-react'

interface OfferingProfileSectionProps {
    summary: string
    manualProfileNote: string
    onManualProfileNoteChange: (value: string) => void
    aiSuggestionsEnabled: boolean
    onAiSuggestionsEnabledChange: (value: boolean) => void
    suggestions: Array<{
        id: string
        content: string
        created_at: string
        source_type?: 'skill' | 'knowledge' | 'batch'
        status?: 'pending' | 'approved' | 'rejected'
        update_of?: string | null
        archived_at?: string | null
    }>
    onSummaryChange: (value: string) => void
    onReviewSuggestion: (suggestionId: string, status: 'approved' | 'rejected') => Promise<void> | void
    onArchiveSuggestion?: (suggestionId: string) => Promise<void> | void
    onGenerateSuggestions?: () => Promise<boolean> | boolean
    isGeneratingSuggestions?: boolean
    autoOpenSuggestions?: boolean
}

export function OfferingProfileSection({
    summary,
    manualProfileNote,
    onManualProfileNoteChange,
    aiSuggestionsEnabled,
    onAiSuggestionsEnabledChange,
    suggestions,
    onSummaryChange,
    onReviewSuggestion,
    onArchiveSuggestion,
    onGenerateSuggestions,
    isGeneratingSuggestions = false,
    autoOpenSuggestions = false
}: OfferingProfileSectionProps) {
    const t = useTranslations('organizationSettings')
    const locale = useLocale()
    const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'archived'>('pending')
    const [hasSetInitialTab, setHasSetInitialTab] = useState(false)
    const [visibleCounts, setVisibleCounts] = useState({ pending: 3, approved: 3, rejected: 3, archived: 3 })
    const [reviewingId, setReviewingId] = useState<string | null>(null)
    const [generationFeedback, setGenerationFeedback] = useState<string | null>(null)
    const [suggestionsOpen, setSuggestionsOpen] = useState(false)
    const [hasAutoOpenedSuggestions, setHasAutoOpenedSuggestions] = useState(false)
    const [manualOpen, setManualOpen] = useState(Boolean(manualProfileNote.trim()))
    const [manualText, setManualText] = useState(manualProfileNote)

    const normalizedSuggestions = useMemo(() => {
        return suggestions.map((item) => ({
            ...item,
            status: item.status ?? 'pending'
        }))
    }, [suggestions])

    const grouped = useMemo(() => {
        const archived = normalizedSuggestions.filter((item) => item.archived_at)
        const active = normalizedSuggestions.filter((item) => !item.archived_at)
        return {
            pending: active.filter((item) => item.status === 'pending'),
            approved: active.filter((item) => item.status === 'approved' && !item.update_of),
            rejected: active.filter((item) => item.status === 'rejected' && !item.update_of),
            archived
        }
    }, [normalizedSuggestions])

    useEffect(() => {
        if (hasSetInitialTab) return
        if (grouped.pending.length > 0) {
            setActiveTab('pending')
        } else if (grouped.approved.length > 0) {
            setActiveTab('approved')
        } else if (grouped.rejected.length > 0) {
            setActiveTab('rejected')
        } else if (grouped.archived.length > 0) {
            setActiveTab('archived')
        }
        setHasSetInitialTab(true)
    }, [grouped, hasSetInitialTab])

    useEffect(() => {
        if (grouped.pending.length > 0) {
            setSuggestionsOpen(true)
        }
    }, [grouped.pending.length])

    useEffect(() => {
        if (!autoOpenSuggestions || hasAutoOpenedSuggestions) return
        setSuggestionsOpen(true)
        if (grouped.pending.length > 0) {
            setActiveTab('pending')
        }
        setHasAutoOpenedSuggestions(true)
    }, [autoOpenSuggestions, grouped.pending.length, hasAutoOpenedSuggestions])

    useEffect(() => {
        setManualText(manualProfileNote)
        if (manualProfileNote.trim()) {
            setManualOpen(true)
        }
    }, [manualProfileNote])

    const dateFormatter = useMemo(() => {
        return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
    }, [locale])

    const tabs = [
        { key: 'pending' as const, label: t('offeringProfileSuggestionsTabPending'), count: grouped.pending.length },
        { key: 'approved' as const, label: t('offeringProfileSuggestionsTabApproved'), count: grouped.approved.length },
        { key: 'rejected' as const, label: t('offeringProfileSuggestionsTabRejected'), count: grouped.rejected.length },
        { key: 'archived' as const, label: t('offeringProfileSuggestionsTabArchived'), count: grouped.archived.length, icon: Archive }
    ]

    const activeItems = grouped[activeTab]
    const visibleCount = visibleCounts[activeTab]
    const visibleItems = activeItems.slice(0, visibleCount)
    const hasMore = activeItems.length > visibleCount
    const canGenerate = grouped.pending.length === 0 && Boolean(onGenerateSuggestions)

    const handleShowMore = () => {
        setVisibleCounts((prev) => ({
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

    const handleArchive = async (id: string) => {
        if (!onArchiveSuggestion) return
        setReviewingId(id)
        try {
            await onArchiveSuggestion(id)
        } finally {
            setReviewingId(null)
        }
    }

    const handleGenerate = async () => {
        if (!onGenerateSuggestions) return
        setGenerationFeedback(null)
        try {
            const result = await onGenerateSuggestions()
            if (!result) {
                setGenerationFeedback(t('offeringProfileSuggestionsGenerateEmpty'))
            }
        } catch {
            setGenerationFeedback(t('offeringProfileSuggestionsGenerateEmpty'))
        }
    }

    const handleManualSave = () => {
        onManualProfileNoteChange(manualText.trim())
        setManualOpen(true)
    }

    const handleManualClear = () => {
        setManualText('')
        onManualProfileNoteChange('')
        setManualOpen(false)
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
        },
        archived: {
            icon: <Archive size={24} />,
            title: t('offeringProfileSuggestionsEmptyArchivedTitle'),
            description: t('offeringProfileSuggestionsEmptyArchivedDesc')
        }
    }[activeTab]

    if (!aiSuggestionsEnabled) {
        return (
            <SettingsSection title={t('offeringProfileTitle')} description={t('offeringProfileDescription')}>
                <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={aiSuggestionsEnabled}
                            onChange={(event) => onAiSuggestionsEnabledChange(event.target.checked)}
                        />
                        {t('offeringProfileAiToggleLabel')}
                    </label>
                    <p className="text-xs text-gray-500">{t('offeringProfileAiToggleHelp')}</p>
                    <p className="text-sm font-medium text-gray-900">{t('offeringProfileManualTitle')}</p>
                    <textarea
                        rows={6}
                        value={summary}
                        onChange={(event) => onSummaryChange(event.target.value)}
                        aria-label={t('offeringProfileTitle')}
                        placeholder={t('offeringProfilePlaceholder')}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                    />
                </div>
            </SettingsSection>
        )
    }

    return (
        <SettingsSection title={t('offeringProfileTitle')} description={t('offeringProfileDescription')}>
            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={aiSuggestionsEnabled}
                            onChange={(event) => onAiSuggestionsEnabledChange(event.target.checked)}
                        />
                        {t('offeringProfileAiToggleLabel')}
                    </label>
                    <p className="text-xs text-gray-500">{t('offeringProfileAiToggleHelp')}</p>
                </div>
                <div className="border-t border-gray-200/40 pt-2">
                    <button
                        type="button"
                        onClick={() => setSuggestionsOpen((prev) => !prev)}
                        className="flex w-full items-center justify-between gap-4 text-left"
                    >
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">{t('offeringProfileSuggestionsTitle')}</p>
                            {grouped.pending.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                                    {t('offeringProfileSuggestionsPendingNotice', { count: grouped.pending.length })}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            {suggestionsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                    </button>

                    {suggestionsOpen && (
                        <>
                            <div className="mt-3 flex items-center justify-between gap-3">
                                <span className="text-xs text-gray-500">{t('offeringProfileSuggestionsNote')}</span>
                                {canGenerate && (
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={handleGenerate}
                                        disabled={isGeneratingSuggestions}
                                    >
                                        {isGeneratingSuggestions
                                            ? t('offeringProfileSuggestionsGenerating')
                                            : t('offeringProfileSuggestionsGenerate')}
                                    </Button>
                                )}
                            </div>

                            <div className="mt-3 flex border-b border-gray-100">
                                {tabs.map((tab) => (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveTab(tab.key)}
                                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors text-center flex items-center justify-center gap-2 ${activeTab === tab.key
                                            ? 'border-blue-600 text-blue-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'}`}
                                        aria-label={tab.label}
                                    >
                                        {tab.icon ? (
                                            <>
                                                <tab.icon size={16} />
                                                <span className="sr-only">{tab.label}</span>
                                            </>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5">
                                                <span>{tab.label}</span>
                                                {tab.key === 'pending' && tab.count > 0 && (
                                                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                                )}
                                            </span>
                                        )}
                                        <Badge variant={activeTab === tab.key ? 'info' : 'neutral'}>
                                            {tab.count}
                                        </Badge>
                                    </button>
                                ))}
                            </div>

                            {grouped.pending.length > 0 && (
                                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                                    {t('offeringProfileSuggestionsPendingNotice', { count: grouped.pending.length })}
                                </div>
                            )}

                            {activeTab === 'approved' && (
                                <div className="mt-4 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                                    {!manualOpen && !manualProfileNote.trim() ? (
                                        <Button size="sm" variant="secondary" onClick={() => setManualOpen(true)}>
                                            {t('offeringProfileManualAdd')}
                                        </Button>
                                    ) : (
                                        <div className="space-y-2">
                                            <p className="text-xs text-gray-500">{t('offeringProfileManualAddHelp')}</p>
                                            <textarea
                                                rows={4}
                                                value={manualText}
                                                onChange={(event) => setManualText(event.target.value)}
                                                placeholder={t('offeringProfileManualAddPlaceholder')}
                                                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                                            />
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={handleManualSave}
                                                    disabled={manualText.trim() === manualProfileNote.trim()}
                                                >
                                                    {t('offeringProfileManualAddSave')}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="danger"
                                                    onClick={handleManualClear}
                                                >
                                                    {t('offeringProfileManualAddClear')}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeItems.length === 0 ? (
                                <div className="flex flex-col items-center justify-center p-6 text-center mt-4">
                                    <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center mb-3">
                                        {emptyState.icon}
                                    </div>
                                    <h3 className="text-sm font-bold text-gray-900 mb-1">{emptyState.title}</h3>
                                    <p className="text-gray-500 text-xs max-w-[260px]">{emptyState.description}</p>
                                    {generationFeedback && (
                                        <p className="mt-3 text-xs text-gray-500">{generationFeedback}</p>
                                    )}
                                </div>
                            ) : (
                                <div className="mt-4 space-y-3">
                                    {visibleItems.map((item) => {
                                        const isAi = item.source_type !== 'batch'
                                        return (
                                            <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            {item.update_of && (
                                                                <Badge variant="info">
                                                                    <span className="text-xs">{t('offeringProfileSuggestionUpdateBadge')}</span>
                                                                </Badge>
                                                            )}
                                                            {activeTab === 'approved' && isAi && (
                                                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                                                                    {t('offeringProfileItemsAiTag')}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{item.content}</p>
                                                    </div>
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
                                                    {item.status === 'approved' && (
                                                        <div className="flex gap-2 shrink-0">
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
                                                    {item.status === 'rejected' && !item.archived_at && onArchiveSuggestion && (
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
                                                                variant="ghost"
                                                                onClick={() => handleArchive(item.id)}
                                                                disabled={reviewingId === item.id}
                                                            >
                                                                {t('offeringProfileSuggestionArchive')}
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="mt-2 text-xs text-gray-500">
                                                    {dateFormatter.format(new Date(item.created_at))}
                                                </p>
                                            </div>
                                        )
                                    })}
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
                        </>
                    )}
                </div>
            </div>
        </SettingsSection>
    )
}
