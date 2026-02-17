'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { CreditUsageSummary } from '@/lib/billing/usage'

interface UsageBreakdownDetailsProps {
    usage: CreditUsageSummary
}

export interface UsageBreakdownTableRow {
    label: string
    monthly: number
    total: number
    isPrimary?: boolean
}

interface UsageBreakdownTableProps {
    rows: UsageBreakdownTableRow[]
    monthHeading: string
    totalHeading: string
    operationHeading: string
    creditsUnit: string
    formatCredits: (value: number) => string
}

function toSafeCredit(value: number | undefined) {
    if (!Number.isFinite(value ?? Number.NaN)) return 0
    return Math.max(0, Number(value ?? 0))
}

export function UsageBreakdownTable({
    rows,
    monthHeading,
    totalHeading,
    operationHeading,
    creditsUnit,
    formatCredits
}: UsageBreakdownTableProps) {
    return (
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-[640px] w-full table-fixed text-sm text-gray-700">
                <colgroup>
                    <col className="w-auto" />
                    <col className="w-40" />
                    <col className="w-40" />
                </colgroup>
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                            {operationHeading}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-400">
                            {monthHeading}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                            {totalHeading}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const valueClassName = row.isPrimary
                            ? 'whitespace-nowrap tabular-nums font-semibold text-gray-900'
                            : 'whitespace-nowrap tabular-nums font-medium text-gray-700'
                        const labelClassName = row.isPrimary
                            ? 'px-4 py-3 text-left text-sm font-semibold text-gray-900 align-top'
                            : 'px-4 py-3 text-left text-sm font-medium text-gray-700 align-top'

                        return (
                            <tr key={row.label} className="border-t border-gray-100">
                                <th scope="row" className={labelClassName}>
                                    {row.label}
                                </th>
                                <td className="px-4 py-3 align-top">
                                    <span className={valueClassName}>
                                        {formatCredits(row.monthly)} {creditsUnit}
                                    </span>
                                </td>
                                <td className="px-4 py-3 align-top">
                                    <span className={valueClassName}>
                                        {formatCredits(row.total)} {creditsUnit}
                                    </span>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

export function UsageBreakdownDetails({ usage }: UsageBreakdownDetailsProps) {
    const t = useTranslations('billingUsage')
    const locale = useLocale()
    const [isClient, setIsClient] = useState(false)
    const [isOpen, setIsOpen] = useState(false)
    const monthLabel = useMemo(() => {
        const [year, month] = usage.month.split('-').map(Number)
        const safeYear = Number.isFinite(year ?? Number.NaN) ? (year as number) : new Date().getFullYear()
        const safeMonth = Number.isFinite(month ?? Number.NaN) ? (month as number) : new Date().getMonth() + 1
        const monthDate = new Date(Date.UTC(safeYear, safeMonth - 1, 1))

        return new Intl.DateTimeFormat(locale, {
            month: 'long',
            year: 'numeric',
            timeZone: usage.timezone
        }).format(monthDate)
    }, [locale, usage.month, usage.timezone])
    const formatCredits = useMemo(
        () => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        [locale]
    )

    const monthlyAiReplies = toSafeCredit(usage.monthly.breakdown.aiReplies)
    const monthlySummary = toSafeCredit(usage.monthly.breakdown.conversationSummary)
    const monthlyLeadExtraction = toSafeCredit(usage.monthly.breakdown.leadExtraction)
    const monthlyDocumentProcessing = toSafeCredit(usage.monthly.breakdown.documentProcessing)
    const totalAiReplies = toSafeCredit(usage.total.breakdown.aiReplies)
    const totalSummary = toSafeCredit(usage.total.breakdown.conversationSummary)
    const totalLeadExtraction = toSafeCredit(usage.total.breakdown.leadExtraction)
    const totalDocumentProcessing = toSafeCredit(usage.total.breakdown.documentProcessing)
    const rows: UsageBreakdownTableRow[] = [
        {
            label: t('creditsLabel'),
            monthly: toSafeCredit(usage.monthly.credits),
            total: toSafeCredit(usage.total.credits),
            isPrimary: true
        },
        {
            label: t('aiRepliesLabel'),
            monthly: monthlyAiReplies,
            total: totalAiReplies
        },
        {
            label: t('conversationSummaryLabel'),
            monthly: monthlySummary,
            total: totalSummary
        },
        {
            label: t('leadExtractionLabel'),
            monthly: monthlyLeadExtraction,
            total: totalLeadExtraction
        },
        {
            label: t('documentProcessingLabel'),
            monthly: monthlyDocumentProcessing,
            total: totalDocumentProcessing
        }
    ]

    useEffect(() => {
        setIsClient(true)
    }, [])

    useEffect(() => {
        if (!isOpen) return

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsOpen(false)
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [isOpen])

    useEffect(() => {
        if (!isClient || !isOpen) return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        return () => {
            document.body.style.overflow = previousOverflow
        }
    }, [isClient, isOpen])

    const modal = (
        <div
            className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setIsOpen(false)}
        >
            <div
                className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">{t('detailsTitle')}</h3>
                        <p className="mt-1 text-sm text-gray-500">{t('detailsDescription')}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                        aria-label={t('detailsClose')}
                    >
                        <X size={16} />
                    </button>
                </div>

                <UsageBreakdownTable
                    rows={rows}
                    monthHeading={`${t('monthLabel')} • ${monthLabel}`}
                    totalHeading={t('totalLabel')}
                    operationHeading={t('detailsOperationColumnLabel')}
                    creditsUnit={t('creditsUnit')}
                    formatCredits={(value) => formatCredits.format(value)}
                />
            </div>
        </div>
    )

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="text-sm font-medium text-[#242A40] underline decoration-1 underline-offset-2 hover:text-[#1f2437]"
            >
                {t('detailsCta')}
            </button>
            {isClient && isOpen && createPortal(modal, document.body)}
        </>
    )
}
