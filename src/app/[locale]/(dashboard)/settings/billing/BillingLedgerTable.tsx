'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { BillingLedgerMovementFilter, BillingLedgerPeriodFilter } from '@/lib/billing/server'

export type BillingLedgerViewMode = 'entries' | 'day' | 'week' | 'month'
type BillingLedgerAggregateViewMode = Exclude<BillingLedgerViewMode, 'entries'>

export interface BillingLedgerTableRow {
    id: string
    createdAt: string
    dateLabel: string
    typeLabel: string
    poolLabel: string
    deltaLabel: string
    balanceLabel: string
    reasonLabel: string
    reasonDetailLabel: string
    creditsDelta: number
    balanceAfter: number
    isDebit: boolean
}

export interface BillingLedgerAggregateTableRow {
    id: string
    createdAt: string
    periodLabel: string
    usageLabel: string
    addedLabel: string
    netLabel: string
    balanceLabel: string
    movementsLabel: string
    usageDelta: number
    addedDelta: number
    netDelta: number
    balanceAfter: number
    movementCount: number
    isNetDebit: boolean
}

interface BillingLedgerOption<TValue extends string> {
    value: TValue
    label: string
}

interface BillingLedgerAggregateLabels {
    movementsCount: (input: { count: number }) => string
}

interface BillingLedgerRowsPage {
    rows: BillingLedgerTableRow[]
    hasMore: boolean
    nextOffset: number | null
}

interface BillingLedgerTableProps {
    rows: BillingLedgerTableRow[]
    columns: {
        date: string
        movement: string
        delta: string
        balance: string
        detail: string
        period: string
        usage: string
        added: string
        net: string
        movements: string
    }
    emptyText: string
    showMoreLabel: string
    showLessLabel: string
    loadMoreLabel: string
    loadingLabel: string
    filterLabel: string
    viewLabel: string
    movementLabel: string
    selectedPeriod: BillingLedgerPeriodFilter
    selectedView: BillingLedgerViewMode
    selectedMovement: BillingLedgerMovementFilter
    periodOptions: BillingLedgerOption<BillingLedgerPeriodFilter>[]
    viewOptions: BillingLedgerOption<BillingLedgerViewMode>[]
    movementOptions: BillingLedgerOption<BillingLedgerMovementFilter>[]
    hasMoreRows: boolean
    nextOffset?: number | null
    locale?: string
    loadRows?: (input: {
        period: BillingLedgerPeriodFilter
        movement: BillingLedgerMovementFilter
        offset: number
    }) => Promise<BillingLedgerRowsPage>
    loadAggregateRows?: (input: {
        period: BillingLedgerPeriodFilter
        movement: BillingLedgerMovementFilter
        view: BillingLedgerAggregateViewMode
        offset: number
    }) => Promise<BillingLedgerRowsPage>
}

function toFiniteNumber(value: number) {
    return Number.isFinite(value) ? value : 0
}

function resolveAggregateKey(date: Date, view: BillingLedgerAggregateViewMode) {
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth()
    const day = date.getUTCDate()

    if (view === 'month') {
        return {
            key: `${year}-${String(month + 1).padStart(2, '0')}`,
            date: new Date(Date.UTC(year, month, 1))
        }
    }

    if (view === 'week') {
        const utcDay = date.getUTCDay()
        const daysSinceMonday = utcDay === 0 ? 6 : utcDay - 1
        const start = new Date(Date.UTC(year, month, day))
        start.setUTCDate(start.getUTCDate() - daysSinceMonday)

        return {
            key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`,
            date: start
        }
    }

    return {
        key: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        date: new Date(Date.UTC(year, month, day))
    }
}

function formatAggregateDateLabel(date: Date, view: BillingLedgerAggregateViewMode, locale: string) {
    if (view === 'month') {
        return new Intl.DateTimeFormat(locale, {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC'
        }).format(date)
    }

    if (view === 'week') {
        const end = new Date(date)
        end.setUTCDate(end.getUTCDate() + 6)
        const startLabel = new Intl.DateTimeFormat(locale, {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC'
        }).format(date)
        const endLabel = new Intl.DateTimeFormat(locale, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC'
        }).format(end)

        return `${startLabel} - ${endLabel}`
    }

    return new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(date)
}

export function buildBillingLedgerAggregateRows(input: {
    rows: BillingLedgerTableRow[]
    view: BillingLedgerViewMode
    locale: string
    labels: BillingLedgerAggregateLabels
    formatCredit: (value: number) => string
    formatBalance: (value: number) => string
}): BillingLedgerAggregateTableRow[] {
    if (input.view === 'entries') return []
    const aggregateView = input.view
    const groups = new Map<string, {
        key: string
        date: Date
        latestRow: BillingLedgerTableRow
        usageDelta: number
        addedDelta: number
        netDelta: number
        count: number
    }>()

    for (const row of input.rows) {
        const createdAt = new Date(row.createdAt)
        if (Number.isNaN(createdAt.getTime())) continue
        const aggregateKey = resolveAggregateKey(createdAt, aggregateView)
        const existing = groups.get(aggregateKey.key)
        const delta = toFiniteNumber(row.creditsDelta)
        const usageDelta = delta < 0 ? delta : 0
        const addedDelta = delta > 0 ? delta : 0

        if (!existing) {
            groups.set(aggregateKey.key, {
                key: aggregateKey.key,
                date: aggregateKey.date,
                latestRow: row,
                usageDelta,
                addedDelta,
                netDelta: delta,
                count: 1
            })
            continue
        }

        existing.usageDelta += usageDelta
        existing.addedDelta += addedDelta
        existing.netDelta += delta
        existing.count += 1

        if (new Date(row.createdAt).getTime() > new Date(existing.latestRow.createdAt).getTime()) {
            existing.latestRow = row
        }
    }

    return Array.from(groups.values())
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .map((group) => {
            const balanceAfter = toFiniteNumber(group.latestRow.balanceAfter)

            return {
                id: `aggregate-${aggregateView}-${group.key}`,
                createdAt: group.latestRow.createdAt,
                periodLabel: formatAggregateDateLabel(group.date, aggregateView, input.locale),
                usageLabel: input.formatCredit(group.usageDelta),
                addedLabel: input.formatCredit(group.addedDelta),
                netLabel: input.formatCredit(group.netDelta),
                balanceLabel: input.formatBalance(balanceAfter),
                movementsLabel: input.labels.movementsCount({ count: group.count }),
                usageDelta: group.usageDelta,
                addedDelta: group.addedDelta,
                netDelta: group.netDelta,
                balanceAfter,
                movementCount: group.count,
                isNetDebit: group.netDelta < 0
            }
        })
}

export function BillingLedgerTable({
    rows,
    columns,
    emptyText,
    showMoreLabel,
    showLessLabel,
    loadMoreLabel,
    loadingLabel,
    filterLabel,
    viewLabel,
    movementLabel,
    selectedPeriod,
    selectedView,
    selectedMovement,
    periodOptions,
    viewOptions,
    movementOptions,
    hasMoreRows,
    nextOffset,
    locale = 'en',
    loadRows,
    loadAggregateRows
}: BillingLedgerTableProps) {
    void showMoreLabel
    void showLessLabel

    const t = useTranslations('billingUsage')
    const [period, setPeriod] = useState<BillingLedgerPeriodFilter>(selectedPeriod)
    const [view, setView] = useState<BillingLedgerViewMode>(selectedView)
    const [movement, setMovement] = useState<BillingLedgerMovementFilter>(selectedMovement)
    const [ledgerRows, setLedgerRows] = useState(rows)
    const [hasMore, setHasMore] = useState(hasMoreRows)
    const [loadOffset, setLoadOffset] = useState(nextOffset ?? rows.length)
    const [isPending, startTransition] = useTransition()
    const formatCredits = useMemo(
        () => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        [locale]
    )
    const aggregateLabels = useMemo(
        () => ({
            movementsCount: ({ count }: { count: number }) => t('ledger.aggregate.movementsCount', { count })
        }),
        [t]
    )
    const formatSignedCredit = useCallback(
        (value: number) => `${value < 0 ? '-' : '+'}${formatCredits.format(Math.abs(value))}`,
        [formatCredits]
    )

    useEffect(() => {
        queueMicrotask(() => {
            setPeriod(selectedPeriod)
            setView(selectedView)
            setMovement(selectedMovement)
            setLedgerRows(rows)
            setHasMore(hasMoreRows)
            setLoadOffset(nextOffset ?? rows.length)
        })
    }, [hasMoreRows, nextOffset, rows, selectedMovement, selectedPeriod, selectedView])

    const aggregateRows = useMemo(
        () => buildBillingLedgerAggregateRows({
            rows: ledgerRows,
            view,
            locale,
            labels: aggregateLabels,
            formatCredit: formatSignedCredit,
            formatBalance: (value) => formatCredits.format(value)
        }),
        [aggregateLabels, formatCredits, formatSignedCredit, ledgerRows, locale, view]
    )

    const loadEntryPage = (
        nextPeriod: BillingLedgerPeriodFilter,
        nextMovement: BillingLedgerMovementFilter,
        offset: number,
        mode: 'replace' | 'append'
    ) => {
        if (!loadRows) return
        startTransition(async () => {
            const page = await loadRows({
                period: nextPeriod,
                movement: nextMovement,
                offset
            })
            setLedgerRows((currentRows) => (mode === 'append' ? [...currentRows, ...page.rows] : page.rows))
            setHasMore(page.hasMore)
            setLoadOffset(page.nextOffset ?? offset + page.rows.length)
        })
    }

    const loadAggregatePage = (
        nextPeriod: BillingLedgerPeriodFilter,
        nextMovement: BillingLedgerMovementFilter,
        nextView: BillingLedgerAggregateViewMode,
        offset: number,
        mode: 'replace' | 'append'
    ) => {
        if (!loadAggregateRows) return
        startTransition(async () => {
            const page = await loadAggregateRows({
                period: nextPeriod,
                movement: nextMovement,
                view: nextView,
                offset
            })
            setLedgerRows((currentRows) => (mode === 'append' ? [...currentRows, ...page.rows] : page.rows))
            setHasMore(page.hasMore)
            setLoadOffset(page.nextOffset ?? offset + page.rows.length)
        })
    }

    const loadForSelection = (
        nextPeriod: BillingLedgerPeriodFilter,
        nextMovement: BillingLedgerMovementFilter,
        nextView: BillingLedgerViewMode
    ) => {
        if (nextView === 'entries') {
            loadEntryPage(nextPeriod, nextMovement, 0, 'replace')
            return
        }

        loadAggregatePage(nextPeriod, nextMovement, nextView, 0, 'replace')
    }

    const handleLoadMore = () => {
        if (view === 'entries') {
            loadEntryPage(period, movement, loadOffset, 'append')
            return
        }

        loadAggregatePage(period, movement, view, loadOffset, 'append')
    }

    const hasVisibleRows = view === 'entries' ? ledgerRows.length > 0 : aggregateRows.length > 0

    return (
        <div className="space-y-4">
            <div data-ledger-filter-layout="labeled-inline" className="grid gap-3 lg:grid-cols-[auto_180px_180px] lg:items-end">
                <div className="space-y-2">
                    <span className="block text-xs font-medium uppercase tracking-wider text-gray-400">{filterLabel}</span>
                    <div className="flex flex-wrap items-center gap-2">
                        {periodOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                    setPeriod(option.value)
                                    loadForSelection(option.value, movement, view)
                                }}
                                className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                                    period === option.value
                                        ? 'border-[#242A40] bg-[#242A40] text-white'
                                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                <label className="space-y-2 text-sm text-gray-500">
                    <span className="block text-xs font-medium uppercase tracking-wider text-gray-400">{movementLabel}</span>
                    <select
                        value={movement}
                        onChange={(event) => {
                            const nextMovement = event.target.value as BillingLedgerMovementFilter
                            setMovement(nextMovement)
                            loadForSelection(period, nextMovement, view)
                        }}
                        className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none transition focus:border-[#242A40] focus:ring-2 focus:ring-[#242A40]/10"
                    >
                        {movementOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="space-y-2 text-sm text-gray-500">
                    <span className="block text-xs font-medium uppercase tracking-wider text-gray-400">{viewLabel}</span>
                    <select
                        value={view}
                        onChange={(event) => {
                            const nextView = event.target.value as BillingLedgerViewMode
                            setView(nextView)
                            loadForSelection(period, movement, nextView)
                        }}
                        className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none transition focus:border-[#242A40] focus:ring-2 focus:ring-[#242A40]/10"
                    >
                        {viewOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {!hasVisibleRows ? (
                <p className="text-sm text-gray-500">{emptyText}</p>
            ) : (
                <div className="overflow-hidden rounded-xl border border-gray-200">
                    {view === 'entries' ? (
                        <table className="w-full table-fixed divide-y divide-gray-200 bg-white text-sm">
                            <colgroup>
                                <col className="w-[22%]" />
                                <col className="w-[17%]" />
                                <col className="w-[13%]" />
                                <col className="w-[14%]" />
                                <col className="w-[34%]" />
                            </colgroup>
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium text-gray-500">{columns.date}</th>
                                    <th className="px-4 py-3 text-left font-medium text-gray-500">{columns.movement}</th>
                                    <th className="px-4 py-3 text-right font-medium text-gray-500">{columns.delta}</th>
                                    <th className="px-4 py-3 text-right font-medium text-gray-500">{columns.balance}</th>
                                    <th className="px-4 py-3 text-left font-medium text-gray-500">{columns.detail}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {ledgerRows.map((entry) => (
                                    <tr key={entry.id}>
                                        <td className="px-4 py-3 align-top text-gray-600" title={entry.dateLabel}>{entry.dateLabel}</td>
                                        <td className="px-4 py-3 align-top text-gray-700" title={entry.typeLabel}>{entry.typeLabel}</td>
                                        <td className={`px-4 py-3 align-top text-right font-medium ${entry.isDebit ? 'text-rose-600' : 'text-emerald-600'}`}>
                                            {entry.deltaLabel}
                                        </td>
                                        <td className="px-4 py-3 align-top text-right text-gray-700">{entry.balanceLabel}</td>
                                        <td className="break-words px-4 py-3 align-top text-gray-500" title={entry.reasonDetailLabel}>{entry.reasonDetailLabel}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <table className="w-full table-fixed divide-y divide-gray-200 bg-white text-sm">
                            <colgroup>
                                <col className="w-[28%]" />
                                <col className="w-[14%]" />
                                <col className="w-[14%]" />
                                <col className="w-[14%]" />
                                <col className="w-[14%]" />
                                <col className="w-[16%]" />
                            </colgroup>
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium text-gray-500">{columns.period}</th>
                                    <th className="px-4 py-3 text-right font-medium text-gray-500">{columns.usage}</th>
                                    <th className="px-4 py-3 text-right font-medium text-gray-500">{columns.added}</th>
                                    <th className="px-4 py-3 text-right font-medium text-gray-500">{columns.net}</th>
                                    <th className="px-4 py-3 text-right font-medium text-gray-500">{columns.balance}</th>
                                    <th className="px-4 py-3 text-left font-medium text-gray-500">{columns.movements}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {aggregateRows.map((entry) => (
                                    <tr key={entry.id}>
                                        <td className="px-4 py-3 align-top text-gray-600" title={entry.periodLabel}>{entry.periodLabel}</td>
                                        <td className="px-4 py-3 align-top text-right font-medium text-rose-600">{entry.usageLabel}</td>
                                        <td className="px-4 py-3 align-top text-right font-medium text-emerald-600">{entry.addedLabel}</td>
                                        <td className={`px-4 py-3 align-top text-right font-medium ${entry.isNetDebit ? 'text-rose-600' : 'text-emerald-600'}`}>
                                            {entry.netLabel}
                                        </td>
                                        <td className="px-4 py-3 align-top text-right text-gray-700">{entry.balanceLabel}</td>
                                        <td className="px-4 py-3 align-top text-gray-500" title={entry.movementsLabel}>{entry.movementsLabel}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {hasMore && (
                <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={isPending || (view === 'entries' ? !loadRows : !loadAggregateRows)}
                    className="text-sm font-medium text-[#242A40] underline decoration-1 underline-offset-2 hover:text-[#1f2437] disabled:cursor-wait disabled:text-gray-400"
                >
                    {isPending ? loadingLabel : loadMoreLabel}
                </button>
            )}
        </div>
    )
}
