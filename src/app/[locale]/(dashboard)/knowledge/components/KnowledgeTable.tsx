'use client'

import { format } from 'date-fns'
import { FileText, File, Scissors, Lock, Check, X, Folder } from 'lucide-react'
import {
    DataTable, TableHead, TableBody, TableRow, TableCell, Badge
} from '@/design'
import { KnowledgeBaseEntry } from '@/lib/knowledge-base/actions'
import { cn } from '@/lib/utils'

interface KnowledgeTableProps {
    entries: KnowledgeBaseEntry[]
    onDelete: (id: string) => void
}

export function KnowledgeTable({ entries, onDelete }: KnowledgeTableProps) {
    const columns = ['Title', 'Type', 'Collection', 'AI Agent', 'Date']

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
        switch (type) {
            case 'article': return <Badge variant="info">Article</Badge>
            case 'snippet': return <Badge variant="neutral">Snippet</Badge>
            case 'pdf': return <Badge variant="error">PDF</Badge>
            case 'internal': return <Badge variant="warning">Internal</Badge>
            default: return <Badge variant="neutral">{type}</Badge>
        }
    }

    return (
        <DataTable>
            <TableHead columns={columns} />
            <TableBody>
                {entries.map(entry => (
                    <TableRow key={entry.id} className="group">
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

                        {/* AI Agent Status (Mock logic: if content > 10 chars, it's active) */}
                        <TableCell align="center">
                            {entry.content.length > 10 ? (
                                <Check size={18} className="text-green-500 mx-auto" />
                            ) : (
                                <X size={18} className="text-gray-300 mx-auto" />
                            )}
                        </TableCell>

                        {/* Date */}
                        <TableCell>
                            <span className="text-sm text-gray-500">
                                {format(new Date(entry.created_at), 'MMM d, yyy')}
                            </span>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </DataTable>
    )
}
