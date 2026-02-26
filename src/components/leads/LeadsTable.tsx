'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { DataTable, TableBody, TableRow, TableCell, Badge, Button } from '@/design'
import { LeadWithConversation } from '@/lib/leads/list-actions'
import type { ConversationPlatform } from '@/types/database'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { tr, enUS } from 'date-fns/locale'
import { useLocale } from 'next-intl'
import * as Popover from '@radix-ui/react-popover'
import { useState } from 'react'
import { getConversationPlatformIconSrc } from '@/lib/channels/platform-icons'
import {
    getLeadRequiredFieldValue,
    getMobileRequiredFieldHints,
    truncateForMobileSummary
} from '@/components/leads/mobile-table'

interface LeadsTableProps {
    leads: LeadWithConversation[]
    total: number
    page: number
    pageSize: number
    totalPages: number
    sortBy: string
    sortOrder: 'asc' | 'desc'
    requiredFields: string[]
}

const statusVariants: Record<string, 'error' | 'warning' | 'neutral'> = {
    hot: 'error',
    warm: 'warning',
    cold: 'neutral'
}

function normalizeServiceName(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const normalized = value.trim()
    return normalized || null
}

function getLeadServiceNames(lead: LeadWithConversation): string[] {
    const extractedFields = lead.extracted_fields
    const extractedServices = (
        extractedFields
        && typeof extractedFields === 'object'
        && !Array.isArray(extractedFields)
        && Array.isArray((extractedFields as Record<string, unknown>).services)
            ? (extractedFields as Record<string, unknown>).services as unknown[]
            : []
    )
        .map((service) => normalizeServiceName(service))
        .filter((service): service is string => Boolean(service))

    const fallbackService = normalizeServiceName(lead.service_type)
    const combinedServices = fallbackService
        ? [...extractedServices, fallbackService]
        : extractedServices

    const dedupedServices: string[] = []
    const seen = new Set<string>()
    for (const service of combinedServices) {
        const normalizedKey = service.toLocaleLowerCase()
        if (seen.has(normalizedKey)) continue
        seen.add(normalizedKey)
        dedupedServices.push(service)
    }

    return dedupedServices
}

// Summary Cell Component with Hover Popover
const SummaryCell = ({ text }: { text: string }) => {
    const [open, setOpen] = useState(false)
    if (!text) return <span className="text-gray-400">-</span>

    return (
        <Popover.Root open={open}>
            <Popover.Trigger asChild>
                <div
                    onMouseEnter={() => setOpen(true)}
                    onMouseLeave={() => setOpen(false)}
                    className="truncate max-w-[200px] cursor-default"
                >
                    {text}
                </div>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className="bg-gray-800 text-white text-xs p-3 rounded-lg shadow-xl max-w-xs z-[1000] leading-relaxed"
                    sideOffset={5}
                >
                    {text}
                    <Popover.Arrow className="fill-gray-800" />
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}

export function LeadsTable({
    leads,
    total,
    page,
    pageSize,
    totalPages,
    sortBy,
    sortOrder,
    requiredFields
}: LeadsTableProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const t = useTranslations('leads')
    const locale = useLocale()
    const dateLocale = locale === 'tr' ? tr : enUS

    const statusLabels: Record<string, string> = {
        hot: t('statusHot'),
        warm: t('statusWarm'),
        cold: t('statusCold')
    }

    // Column type with optional width
    interface ColumnDef {
        key: string
        label: string
        sortable: boolean
        width?: string
    }

    // Sortable columns config - Removed Platform, merged into Name
    const sortableColumns: ColumnDef[] = [
        { key: 'contact_name', label: t('columns.name'), sortable: true },
        { key: 'status', label: t('columns.status'), sortable: true, width: 'w-24' },
        { key: 'total_score', label: t('columns.score'), sortable: true, width: 'w-20' },
        { key: 'service_type', label: t('columns.service'), sortable: true },
        { key: 'updated_at', label: t('columns.lastActivity'), sortable: true, width: 'w-32' },
    ]

    // Add dynamic required fields columns
    const dynamicColumns: ColumnDef[] = requiredFields.map(field => ({
        key: `field_${field}`,
        label: field,
        sortable: false
    }))

    // Summary column at the end
    const allColumns: ColumnDef[] = [
        ...sortableColumns,
        ...dynamicColumns,
        { key: 'summary', label: t('columns.summary'), sortable: false }
    ]

    const handleSort = (columnKey: string) => {
        const params = new URLSearchParams(searchParams.toString())
        if (sortBy === columnKey) {
            params.set('sortOrder', sortOrder === 'asc' ? 'desc' : 'asc')
        } else {
            params.set('sortBy', columnKey)
            params.set('sortOrder', 'desc')
        }
        params.set('page', '1')
        router.push(`?${params.toString()}`)
    }

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('page', newPage.toString())
        router.push(`?${params.toString()}`)
    }

    const handleRowClick = (conversationId: string) => {
        router.push(`/inbox?conversation=${conversationId}`)
    }

    const getSortIcon = (columnKey: string, isSortable: boolean) => {
        if (!isSortable) return null
        if (sortBy === columnKey) {
            return sortOrder === 'asc' ? (
                <ChevronUp size={14} className="text-blue-500" />
            ) : (
                <ChevronDown size={14} className="text-blue-500" />
            )
        }
        return <ChevronsUpDown size={14} className="text-gray-300" />
    }

    const getPlatformIcon = (platform: ConversationPlatform) => {
        const src = getConversationPlatformIconSrc(platform)
        if (src) {
            return <img alt="" aria-hidden className="h-[18px] w-[18px]" src={src} />
        }
        return <span className="text-xs text-gray-400">{t('platformSimulatorShort')}</span>
    }

    const getExtractedFieldValue = (lead: LeadWithConversation, fieldName: string): string => {
        return getLeadRequiredFieldValue(lead, fieldName) ?? '-'
    }

    const from = (page - 1) * pageSize + 1
    const to = Math.min(page * pageSize, total)

    return (
        <div className="space-y-3 md:space-y-4">
            <div className="space-y-2 md:hidden">
                {leads.map(lead => {
                    const mobileHints = getMobileRequiredFieldHints(lead, requiredFields)
                    const serviceNames = getLeadServiceNames(lead)

                    return (
                        <button
                            key={lead.id}
                            type="button"
                            onClick={() => handleRowClick(lead.conversation_id)}
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-left shadow-sm transition-colors hover:border-gray-300 active:scale-[0.99]"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="shrink-0">
                                            {getPlatformIcon(lead.conversation.platform)}
                                        </span>
                                        <span className="truncate text-sm font-semibold text-gray-900">
                                            {lead.conversation.contact_name}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-[11px] text-gray-500">
                                        {formatDistanceToNow(new Date(lead.updated_at), {
                                            addSuffix: true,
                                            locale: dateLocale
                                        })}
                                    </p>
                                </div>
                                <div className="shrink-0 rounded-lg bg-gray-100 px-2 py-1 text-right">
                                    <p className="text-[10px] uppercase tracking-wide text-gray-500">
                                        {t('columns.score')}
                                    </p>
                                    <p className="text-sm font-semibold text-gray-900">{lead.total_score}</p>
                                </div>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="inline-block whitespace-nowrap">
                                    <Badge variant={statusVariants[lead.status] || 'neutral'}>
                                        {statusLabels[lead.status] || lead.status}
                                    </Badge>
                                </span>
                                {serviceNames.length > 0 ? (
                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                                        {serviceNames.join(', ')}
                                    </span>
                                ) : null}
                            </div>

                            {mobileHints.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {mobileHints.map((hint) => (
                                        <span
                                            key={hint.field}
                                            className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600"
                                        >
                                            {hint.field}: {hint.value}
                                        </span>
                                    ))}
                                </div>
                            ) : null}

                            <p className="mt-2 truncate text-xs text-gray-500">
                                {truncateForMobileSummary(lead.summary)}
                            </p>
                        </button>
                    )
                })}
            </div>

            <DataTable className="hidden md:block">
                {/* Custom header with sorting */}
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-semibold border-b border-gray-200">
                    <tr>
                        {allColumns.map(col => (
                            <th
                                key={col.key}
                                className={`px-6 py-3 ${col.width || ''} ${col.sortable !== false ? 'cursor-pointer hover:bg-gray-100 select-none' : ''}`}
                                onClick={() => col.sortable !== false && handleSort(col.key)}
                            >
                                <div className="flex items-center gap-1.5">
                                    <span>{col.label}</span>
                                    {getSortIcon(col.key, col.sortable !== false)}
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <TableBody>
                    {leads.map(lead => {
                        const serviceNames = getLeadServiceNames(lead)

                        return (
                            <TableRow
                                key={lead.id}
                                onClick={() => handleRowClick(lead.conversation_id)}
                            >
                                {/* Name & Platform merged */}
                                <TableCell>
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="shrink-0">
                                            {getPlatformIcon(lead.conversation.platform)}
                                        </div>
                                        <span className="max-w-[240px] truncate whitespace-nowrap font-medium text-gray-900">
                                            {lead.conversation.contact_name}
                                        </span>
                                    </div>
                                </TableCell>

                                {/* Status */}
                                <TableCell className="w-28">
                                    <span className="inline-block whitespace-nowrap">
                                        <Badge variant={statusVariants[lead.status] || 'neutral'}>
                                            {statusLabels[lead.status] || lead.status}
                                        </Badge>
                                    </span>
                                </TableCell>

                                {/* Score */}
                                <TableCell className="w-20">
                                    <span className="font-semibold text-gray-900">
                                        {lead.total_score}
                                    </span>
                                </TableCell>

                                {/* Service */}
                                <TableCell>
                                    <span className="text-gray-600">
                                        {serviceNames.length > 0 ? serviceNames.join(', ') : '-'}
                                    </span>
                                </TableCell>

                                {/* Last Activity */}
                                <TableCell className="w-32">
                                    <span className="text-gray-500 text-sm">
                                        {formatDistanceToNow(new Date(lead.updated_at), {
                                            addSuffix: true,
                                            locale: dateLocale
                                        })}
                                    </span>
                                </TableCell>

                                {/* Dynamic Required Fields */}
                                {requiredFields.map(field => (
                                    <TableCell key={field}>
                                        <span className="text-gray-600 text-sm">
                                            {getExtractedFieldValue(lead, field)}
                                        </span>
                                    </TableCell>
                                ))}

                                {/* Summary with Tooltip */}
                                <TableCell>
                                    <div className="text-gray-500 text-sm">
                                        <SummaryCell text={lead.summary || ''} />
                                    </div>
                                </TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </DataTable>

            {/* Pagination */}
            <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between md:px-2">
                <span className="text-xs text-gray-500 sm:text-sm">
                    {t('pagination.showing', { from, to, total })}
                </span>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(page - 1)}
                        disabled={page <= 1}
                        className="flex-1 sm:flex-none"
                    >
                        {t('pagination.prev')}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(page + 1)}
                        disabled={page >= totalPages}
                        className="flex-1 sm:flex-none"
                    >
                        {t('pagination.next')}
                    </Button>
                </div>
            </div>
        </div>
    )
}
