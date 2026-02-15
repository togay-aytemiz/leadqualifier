'use client'

import { useMemo, useState } from 'react'

export interface BillingLedgerTableRow {
    id: string
    dateLabel: string
    typeLabel: string
    poolLabel: string
    deltaLabel: string
    balanceLabel: string
    reasonLabel: string
    isDebit: boolean
}

interface BillingLedgerTableProps {
    rows: BillingLedgerTableRow[]
    columns: {
        date: string
        type: string
        pool: string
        delta: string
        balance: string
        reason: string
    }
    emptyText: string
    showMoreLabel: string
    showLessLabel: string
}

export function BillingLedgerTable({
    rows,
    columns,
    emptyText,
    showMoreLabel,
    showLessLabel
}: BillingLedgerTableProps) {
    const [showAll, setShowAll] = useState(false)
    const hasMoreRows = rows.length > 3
    const visibleRows = useMemo(
        () => (showAll ? rows : rows.slice(0, 3)),
        [rows, showAll]
    )

    if (rows.length === 0) {
        return <p className="text-sm text-gray-500">{emptyText}</p>
    }

    return (
        <div className="space-y-3">
            <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 bg-white text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">{columns.date}</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">{columns.type}</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">{columns.pool}</th>
                            <th className="px-4 py-3 text-right font-medium text-gray-500">{columns.delta}</th>
                            <th className="px-4 py-3 text-right font-medium text-gray-500">{columns.balance}</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">{columns.reason}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {visibleRows.map((entry) => (
                            <tr key={entry.id}>
                                <td className="whitespace-nowrap px-4 py-3 text-gray-600">{entry.dateLabel}</td>
                                <td className="px-4 py-3 text-gray-700">{entry.typeLabel}</td>
                                <td className="px-4 py-3 text-gray-700">{entry.poolLabel}</td>
                                <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${entry.isDebit ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {entry.deltaLabel}
                                </td>
                                <td className="whitespace-nowrap px-4 py-3 text-right text-gray-700">{entry.balanceLabel}</td>
                                <td className="px-4 py-3 text-gray-500">{entry.reasonLabel}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {hasMoreRows && (
                <button
                    type="button"
                    onClick={() => setShowAll((prev) => !prev)}
                    className="text-sm font-medium text-[#242A40] underline decoration-1 underline-offset-2 hover:text-[#1f2437]"
                >
                    {showAll ? showLessLabel : showMoreLabel}
                </button>
            )}
        </div>
    )
}
