import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { tr } from 'date-fns/locale'
import { FileText, File, Scissors, Lock, Folder, ChevronRight } from 'lucide-react'
import {
    DataTable, TableHead, TableBody, TableRow, TableCell, Badge
} from '@/design'
import { KnowledgeBaseEntry } from '@/lib/knowledge-base/actions'
import { useTranslations, useLocale } from 'next-intl'
import { formatMobileEntryPreview } from './mobileEntryPreview'

interface KnowledgeTableProps {
    entries: KnowledgeBaseEntry[]
}

export function KnowledgeTable({ entries }: KnowledgeTableProps) {
    const t = useTranslations('knowledge.table')
    const tCommon = useTranslations('knowledge')
    const locale = useLocale()
    const columns = [t('title'), t('type'), t('status'), t('collection'), t('date'), '']

    function getTypeIcon(type: string) {
        switch (type) {
            case 'article': return <FileText className="text-blue-500" size={18} />
            case 'snippet': return <Scissors className="text-gray-500" size={18} />
            case 'pdf': return <File className="text-red-500" size={18} />
            case 'internal': return <Lock className="text-yellow-600" size={18} />
            default: return <FileText className="text-gray-400" size={18} />
        }
    }

    function getTypeBadge(type: string) {
        // Map database types to translation keys
        const label = tCommon(`types.${type}`)

        switch (type) {
            case 'article': return <Badge variant="info">{label}</Badge>
            case 'snippet': return <Badge variant="neutral">{label}</Badge>
            case 'pdf': return <Badge variant="error">{label}</Badge>
            case 'internal': return <Badge variant="warning">{label}</Badge>
            default: return <Badge variant="neutral">{label}</Badge>
        }
    }

    function getStatusBadge(status?: KnowledgeBaseEntry['status']) {
        const safeStatus = status ?? 'ready'
        const label = tCommon(`statuses.${safeStatus}`)

        switch (safeStatus) {
            case 'ready': return <Badge variant="success">{label}</Badge>
            case 'processing': return <Badge variant="warning">{label}</Badge>
            case 'error': return <Badge variant="error">{label}</Badge>
            default: return <Badge variant="neutral">{label}</Badge>
        }
    }

    const router = useRouter()

    return (
        <>
            <div className="space-y-3 lg:hidden">
                {entries.map(entry => (
                    <button
                        key={entry.id}
                        type="button"
                        onClick={() => router.push(`/knowledge/${entry.id}`)}
                        className="group w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                                <div className="shrink-0">{getTypeIcon(entry.type)}</div>
                                <div>
                                    <p className="truncate font-medium text-gray-900">{entry.title}</p>
                                    <p className="mt-1 text-xs text-gray-500">
                                        {formatMobileEntryPreview(entry.content)}
                                    </p>
                                </div>
                            </div>
                            <div className="text-gray-400 transition-colors group-hover:text-blue-600">
                                <ChevronRight size={20} />
                            </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            {getTypeBadge(entry.type)}
                            {getStatusBadge(entry.status)}
                            {entry.collection && (
                                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
                                    <Folder size={12} className="mr-1 text-blue-300" />
                                    {entry.collection.name}
                                </span>
                            )}
                        </div>

                        <p className="mt-2 text-xs text-gray-500">
                            {format(new Date(entry.created_at), 'd MMM yyyy', { locale: locale === 'tr' ? tr : undefined })}
                        </p>
                    </button>
                ))}
            </div>

            <div className="hidden lg:block">
                <DataTable>
                    <TableHead columns={columns} />
                    <TableBody>
                        {entries.map(entry => (
                            <TableRow
                                key={entry.id}
                                className="group cursor-pointer hover:bg-gray-50 transition-colors"
                                onClick={() => router.push(`/knowledge/${entry.id}`)}
                            >
                                {/* Title */}
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        {getTypeIcon(entry.type)}
                                        <div>
                                            <p className="font-medium text-gray-900">{entry.title}</p>
                                            <p className="text-xs text-gray-500 truncate max-w-[200px]">{entry.content.substring(0, 50)}...</p>
                                        </div>
                                    </div>
                                </TableCell>

                                {/* Type */}
                                <TableCell>
                                    {getTypeBadge(entry.type)}
                                </TableCell>

                                {/* Status */}
                                <TableCell>
                                    {getStatusBadge(entry.status)}
                                </TableCell>

                                {/* Collection */}
                                <TableCell>
                                    {entry.collection ? (
                                        <div className="flex items-center text-sm text-gray-600">
                                            <Folder size={14} className="mr-1.5 text-blue-300" />
                                            {entry.collection.name}
                                        </div>
                                    ) : (
                                        <span className="text-gray-400 text-sm">–</span>
                                    )}
                                </TableCell>

                                {/* Date */}
                                <TableCell>
                                    <span className="text-sm text-gray-500">
                                        {format(new Date(entry.created_at), 'd MMM yyyy', { locale: locale === 'tr' ? tr : undefined })}
                                    </span>
                                </TableCell>

                                {/* Action Arrow */}
                                <TableCell align="right">
                                    <div className="text-gray-400 group-hover:text-blue-600 transition-colors flex justify-end">
                                        <ChevronRight size={20} />
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </div>
        </>
    )
}
