'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { DataTable, TableBody, TableRow, TableCell, Badge } from '@/design'
import { LeadWithConversation } from '@/lib/leads/list-actions'
import { FaTelegram } from 'react-icons/fa6'
import { IoLogoWhatsapp } from 'react-icons/io5'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { tr, enUS } from 'date-fns/locale'
import { useLocale } from 'next-intl'
import * as Popover from '@radix-ui/react-popover'
import { useState } from 'react'
import { Button } from '@/design' // Ensure Button is imported if used, previously it was imported

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

const statusVariants: Record<string, 'error' | 'warning' | 'neutral' | 'info'> = {
    hot: 'error',
    warm: 'warning',
    cold: 'neutral',
    ignored: 'info'
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
        cold: t('statusCold'),
        ignored: t('statusIgnored')
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

    const getPlatformIcon = (platform: string) => {
        if (platform === 'telegram') {
            return <FaTelegram className="text-[#229ED9]" size={18} />
        }
        if (platform === 'whatsapp') {
            return <IoLogoWhatsapp className="text-[#25D366]" size={18} />
        }
        return <span className="text-xs text-gray-400">{t('platformSimulatorShort')}</span>
    }

    const getExtractedFieldValue = (lead: LeadWithConversation, fieldName: string): string => {
        if (!lead.extracted_fields) return '-'
        const fields = lead.extracted_fields as Record<string, string>
        return fields[fieldName] || '-'
    }

    const from = (page - 1) * pageSize + 1
    const to = Math.min(page * pageSize, total)

    return (
        <div className="space-y-4">
            <DataTable>
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
                    {leads.map(lead => (
                        <TableRow
                            key={lead.id}
                            onClick={() => handleRowClick(lead.conversation_id)}
                        >
                            {/* Name & Platform merged */}
                            <TableCell>
                                <div className="flex items-center gap-3">
                                    <div className="shrink-0">
                                        {getPlatformIcon(lead.conversation.platform)}
                                    </div>
                                    <span className="font-medium text-gray-900">
                                        {lead.conversation.contact_name}
                                    </span>
                                </div>
                            </TableCell>

                            {/* Status */}
                            <TableCell className="w-24">
                                <Badge variant={statusVariants[lead.status] || 'neutral'}>
                                    {statusLabels[lead.status] || lead.status}
                                </Badge>
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
                                    {lead.service_type || '-'}
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
                    ))}
                </TableBody>
            </DataTable>

            {/* Pagination */}
            <div className="flex items-center justify-between px-2">
                <span className="text-sm text-gray-500">
                    {t('pagination.showing', { from, to, total })}
                </span>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(page - 1)}
                        disabled={page <= 1}
                    >
                        {t('pagination.prev')}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(page + 1)}
                        disabled={page >= totalPages}
                    >
                        {t('pagination.next')}
                    </Button>
                </div>
            </div>
        </div>
    )
}
