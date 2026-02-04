'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { AiUsageSummary, AiUsageTotals } from '@/lib/ai/usage'

interface UsageBreakdownDetailsProps {
    usage: AiUsageSummary
}

function sumTotals(items: AiUsageTotals[]) {
    return items.reduce(
        (acc, item) => ({
            inputTokens: acc.inputTokens + item.inputTokens,
            outputTokens: acc.outputTokens + item.outputTokens,
            totalTokens: acc.totalTokens + item.totalTokens
        }),
        { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    )
}

export function UsageBreakdownDetails({ usage }: UsageBreakdownDetailsProps) {
    const t = useTranslations('billingUsage')
    const [isOpen, setIsOpen] = useState(false)

    const formatNumber = useMemo(() => new Intl.NumberFormat(), [])
    const monthlyMessageTotals = sumTotals([
        usage.monthlyByCategory.router ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        usage.monthlyByCategory.rag ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        usage.monthlyByCategory.fallback ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    ])
    const totalMessageTotals = sumTotals([
        usage.totalByCategory.router ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        usage.totalByCategory.rag ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        usage.totalByCategory.fallback ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    ])
    const monthlySummaryTotals = usage.monthlyByCategory.summary ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    const totalSummaryTotals = usage.totalByCategory.summary ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    const monthlyLeadTotals = usage.monthlyByCategory.lead_extraction ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    const totalLeadTotals = usage.totalByCategory.lead_extraction ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

    const monthlyRouter = usage.monthlyByCategory.router ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    const totalRouter = usage.totalByCategory.router ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    const monthlyRag = usage.monthlyByCategory.rag ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    const totalRag = usage.totalByCategory.rag ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    const monthlyFallback = usage.monthlyByCategory.fallback ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    const totalFallback = usage.totalByCategory.fallback ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
                {t('detailsCta')}
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">{t('detailsTitle')}</h3>
                                <p className="mt-1 text-sm text-gray-500">{t('detailsDescription')}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="text-gray-400 hover:text-gray-600"
                                aria-label={t('detailsClose')}
                            >
                                ✕
                            </button>
                        </div>

                        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                            <div className="rounded-xl border border-gray-200 p-4">
                                <p className="text-xs uppercase tracking-wider text-gray-400">{t('monthLabel')}</p>
                                <div className="mt-3 space-y-3 text-sm text-gray-700">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">{t('messagesLabel')}</span>
                                        <span>{formatNumber.format(monthlyMessageTotals.totalTokens)} {t('tokensLabel')}</span>
                                    </div>
                                    <div className="ml-3 text-xs text-gray-500 space-y-1">
                                        <div>{t('routerLabel')}: {formatNumber.format(monthlyRouter.totalTokens)}</div>
                                        <div>{t('ragLabel')}: {formatNumber.format(monthlyRag.totalTokens)}</div>
                                        <div>{t('fallbackLabel')}: {formatNumber.format(monthlyFallback.totalTokens)}</div>
                                        <div>{t('skillLabel')}: 0</div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">{t('summaryLabel')}</span>
                                        <span>{formatNumber.format(monthlySummaryTotals.totalTokens)} {t('tokensLabel')}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">{t('leadExtractionLabel')}</span>
                                        <span>{formatNumber.format(monthlyLeadTotals.totalTokens)} {t('tokensLabel')}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-200 p-4">
                                <p className="text-xs uppercase tracking-wider text-gray-400">{t('totalLabel')}</p>
                                <div className="mt-3 space-y-3 text-sm text-gray-700">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">{t('messagesLabel')}</span>
                                        <span>{formatNumber.format(totalMessageTotals.totalTokens)} {t('tokensLabel')}</span>
                                    </div>
                                    <div className="ml-3 text-xs text-gray-500 space-y-1">
                                        <div>{t('routerLabel')}: {formatNumber.format(totalRouter.totalTokens)}</div>
                                        <div>{t('ragLabel')}: {formatNumber.format(totalRag.totalTokens)}</div>
                                        <div>{t('fallbackLabel')}: {formatNumber.format(totalFallback.totalTokens)}</div>
                                        <div>{t('skillLabel')}: 0</div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">{t('summaryLabel')}</span>
                                        <span>{formatNumber.format(totalSummaryTotals.totalTokens)} {t('tokensLabel')}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">{t('leadExtractionLabel')}</span>
                                        <span>{formatNumber.format(totalLeadTotals.totalTokens)} {t('tokensLabel')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
