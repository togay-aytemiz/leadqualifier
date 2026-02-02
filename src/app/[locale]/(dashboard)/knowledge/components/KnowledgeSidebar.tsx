'use client'

import { useState, useEffect } from 'react'
import { Folder, FileText, LayoutGrid, ChevronRight, ChevronDown, FolderPlus } from 'lucide-react'
import { Sidebar, SidebarGroup, SidebarItem, Button } from '@/design'
import { getSidebarData, SidebarCollection, createCollection } from '@/lib/knowledge-base/actions'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { FolderModal } from './FolderModal'
import { NewContentButton } from './NewContentButton'
import { FolderActions } from './FolderActions'

export function KnowledgeSidebar() {
    const t = useTranslations('sidebar')
    const [data, setData] = useState<SidebarCollection[]>([])
    const router = useRouter()
    const searchParams = useSearchParams()
    const currentCollectionId = searchParams.get('collectionId')

    // New state for folder modal
    const [showFolderModal, setShowFolderModal] = useState(false)
    const [expanded, setExpanded] = useState<Record<string, boolean>>({})

    useEffect(() => {
        loadSidebar()
    }, [])

    async function loadSidebar() {
        try {
            const sidebarData = await getSidebarData()
            setData(sidebarData)
            const initialExpanded: Record<string, boolean> = {}
            sidebarData.forEach(c => initialExpanded[c.id] = true)
            setExpanded(initialExpanded)
        } catch (error) {
            console.error(error)
        }
    }

    function toggleExpand(id: string, e: React.MouseEvent) {
        e.stopPropagation()
        setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
    }

    async function handleCreateFolder(name: string) {
        await createCollection(name)
        loadSidebar()
    }

    return (
        <Sidebar
            title={t('title')}
            footer={
                <div className="p-3 space-y-2 border-t border-gray-200 bg-white">
                    <Button
                        variant="secondary"
                        className="w-full justify-start bg-white border border-gray-200 shadow-sm hover:bg-gray-50 text-gray-700"
                        onClick={() => setShowFolderModal(true)}
                    >
                        <FolderPlus size={16} className="mr-2 text-gray-500" />
                        {useTranslations('folderModal')('create')}
                    </Button>
                    <NewContentButton
                        collectionId={currentCollectionId}
                        className="w-full justify-start"
                        align="start"
                        side="top"
                    />
                </div>
            }
        >
            <SidebarGroup title={t('content')}>
                <SidebarItem
                    icon={<LayoutGrid size={18} />}
                    label={t('allContent')}
                    count={data.reduce((acc, col) => acc + col.count, 0)}
                    active={!currentCollectionId}
                    onClick={() => router.push('/knowledge')}
                />
            </SidebarGroup>

            <SidebarGroup title={t('collections')}>
                <div className="space-y-1">
                    {data.map(col => (
                        <div key={col.id}>
                            {/* Collection Header */}
                            <div
                                className={cn(
                                    "group flex items-center justify-between px-3 py-2 rounded-md text-sm cursor-pointer transition-colors",
                                    currentCollectionId === col.id
                                        ? "bg-blue-50/50 text-blue-700 font-medium"
                                        : "text-gray-700 hover:bg-gray-100"
                                )}
                                onClick={() => router.push(`/knowledge?collectionId=${col.id}`)}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <div
                                        className="text-gray-400 hover:text-gray-600 p-0.5 rounded cursor-pointer"
                                        onClick={(e) => toggleExpand(col.id, e)}
                                    >
                                        {expanded[col.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </div>
                                    <Folder size={16} className={cn("shrink-0", currentCollectionId === col.id ? "text-blue-500" : "text-yellow-500")} />
                                    <span className="truncate">{col.name}</span>
                                    <span className="text-xs text-gray-400 ml-1">({col.count})</span>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <FolderActions
                                        collection={col}
                                        redirectOnDelete={currentCollectionId === col.id}
                                        onDeleteSuccess={loadSidebar} // Reload sidebar after delete
                                    />
                                </div>
                            </div>

                            {/* Files List (Nested) */}
                            {expanded[col.id] && (
                                <div className="ml-9 mt-1 space-y-0.5 border-l border-gray-200 pl-2">
                                    {col.files.map(file => (
                                        <div
                                            key={file.id}
                                            className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md cursor-pointer truncate"
                                        // Future: onClick={() => router.push(`/knowledge/file/${file.id}`)}
                                        >
                                            <FileText size={14} className="text-gray-400 shrink-0" />
                                            <span className="truncate">{file.title}</span>
                                        </div>
                                    ))}
                                    {col.files.length === 0 && (
                                        <div className="px-2 py-1.5 text-xs text-gray-400 italic">
                                            Empty
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </SidebarGroup>

            <FolderModal
                isOpen={showFolderModal}
                onClose={() => setShowFolderModal(false)}
                onSubmit={handleCreateFolder}
            />
        </Sidebar>
    )
}
