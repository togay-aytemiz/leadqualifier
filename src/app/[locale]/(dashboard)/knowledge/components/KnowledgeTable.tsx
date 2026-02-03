import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { tr } from 'date-fns/locale'
import { FileText, File, Scissors, Lock, Check, X, Folder, ChevronRight, Eye } from 'lucide-react'
import {
    DataTable, TableHead, TableBody, TableRow, TableCell, Badge
} from '@/design'
import { KnowledgeBaseEntry } from '@/lib/knowledge-base/actions'
import { cn } from '@/lib/utils'
import { useTranslations, useLocale } from 'next-intl'

interface KnowledgeTableProps {
    entries: KnowledgeBaseEntry[]
    onDelete: (id: string) => void
}

export function KnowledgeTable({ entries, onDelete }: KnowledgeTableProps) {
    const t = useTranslations('knowledge.table')
    const locale = useLocale()
    const columns = [t('title'), t('type'), t('collection'), t('date'), '']

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
        // Translation for types could be added here if needed, for now just capitalizing
        const typeLabel = type.charAt(0).toUpperCase() + type.slice(1)

        switch (type) {
            case 'article': return <Badge variant="info">{typeLabel}</Badge>
            case 'snippet': return <Badge variant="neutral">{typeLabel}</Badge>
            case 'pdf': return <Badge variant="error">{typeLabel}</Badge>
            case 'internal': return <Badge variant="warning">{typeLabel}</Badge>
            default: return <Badge variant="neutral">{typeLabel}</Badge>
        }
    }

    const router = useRouter()

    return (
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
    )
}
