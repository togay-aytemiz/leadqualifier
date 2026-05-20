'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Folder, FileText, LayoutGrid, ChevronRight, ChevronDown, FolderPlus } from 'lucide-react'
import { Sidebar, SidebarGroup, SidebarItem, Button, Skeleton } from '@/design'
import {
    getSidebarData,
    getSidebarFilesPage,
    type SidebarData,
    createCollection
} from '@/lib/knowledge-base/actions'
import { DEFAULT_SIDEBAR_FILES_PAGE_SIZE } from '@/lib/knowledge-base/pagination'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { FolderModal } from './FolderModal'
import { NewContentButton } from './NewContentButton'
import { FolderActions } from './FolderActions'

interface KnowledgeSidebarProps {
    organizationId: string | null
    isReadOnly?: boolean
}

export function KnowledgeSidebar({ organizationId, isReadOnly = false }: KnowledgeSidebarProps) {
    const t = useTranslations('sidebar')
    const tFolderModal = useTranslations('folderModal')
    const [data, setData] = useState<SidebarData | null>(null)
    const router = useRouter()
    const searchParams = useSearchParams()
    const currentCollectionId = searchParams.get('collectionId')
    const pathname = usePathname()

    // New state for folder modal
    const [showFolderModal, setShowFolderModal] = useState(false)
    const [expanded, setExpanded] = useState<Record<string, boolean>>({})
    const [loadingCollectionIds, setLoadingCollectionIds] = useState<Record<string, boolean>>({})
    const [loadingUncategorized, setLoadingUncategorized] = useState(false)

    const collections = data?.collections ?? []
    const uncategorized = data?.uncategorized ?? []
    const totalCount = data?.totalCount ?? 0
    const uncategorizedCount = data?.uncategorizedCount ?? uncategorized.length
    const uncategorizedHasMore = data?.uncategorizedHasMore ?? false

    const currentFileId = useMemo(() => {
        const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}\//, '/')
        if (!pathWithoutLocale.startsWith('/knowledge/')) return null
        if (pathWithoutLocale.startsWith('/knowledge/create')) return null
        const parts = pathWithoutLocale.split('/').filter(Boolean)
        return parts.length >= 2 ? parts[1] : null
    }, [pathname])

    const supabase = useMemo(() => createClient(), [])

    const loadSidebar = useCallback(async () => {
        try {
            const sidebarData = await getSidebarData(organizationId)
            setData(sidebarData)
            setExpanded(prev => {
                const nextExpanded: Record<string, boolean> = {}
                sidebarData.collections.forEach(collection => {
                    if (prev[collection.id]) {
                        nextExpanded[collection.id] = true
                    }
                })
                if (currentCollectionId) {
                    nextExpanded[currentCollectionId] = true
                }
                return nextExpanded
            })
        } catch (error) {
            console.error(error)
        }
    }, [currentCollectionId, organizationId])

    const loadCollectionFiles = useCallback(async (collectionId: string, offset = 0) => {
        setLoadingCollectionIds(prev => ({ ...prev, [collectionId]: true }))
        try {
            const page = await getSidebarFilesPage({
                collectionId,
                organizationId,
                offset,
                limit: DEFAULT_SIDEBAR_FILES_PAGE_SIZE
            })

            setData(prev => {
                if (!prev) return prev
                return {
                    ...prev,
                    collections: prev.collections.map(collection => {
                        if (collection.id !== collectionId) return collection

                        const existingFiles = offset === 0 ? [] : collection.files
                        const seen = new Set(existingFiles.map(file => file.id))
                        const files = [
                            ...existingFiles,
                            ...page.files.filter(file => !seen.has(file.id))
                        ]

                        return {
                            ...collection,
                            files,
                            count: page.totalCount,
                            loadedFileCount: files.length,
                            hasMoreFiles: page.hasMore
                        }
                    })
                }
            })
        } catch (error) {
            console.error('Failed to load sidebar files', error)
        } finally {
            setLoadingCollectionIds(prev => ({ ...prev, [collectionId]: false }))
        }
    }, [organizationId])

    const loadMoreUncategorized = useCallback(async () => {
        if (!data || loadingUncategorized) return

        setLoadingUncategorized(true)
        try {
            const page = await getSidebarFilesPage({
                collectionId: null,
                organizationId,
                offset: data.uncategorized.length,
                limit: DEFAULT_SIDEBAR_FILES_PAGE_SIZE
            })

            setData(prev => {
                if (!prev) return prev
                const seen = new Set(prev.uncategorized.map(file => file.id))
                const uncategorizedFiles = [
                    ...prev.uncategorized,
                    ...page.files.filter(file => !seen.has(file.id))
                ]

                return {
                    ...prev,
                    uncategorized: uncategorizedFiles,
                    uncategorizedCount: page.totalCount,
                    uncategorizedHasMore: page.hasMore
                }
            })
        } catch (error) {
            console.error('Failed to load uncategorized sidebar files', error)
        } finally {
            setLoadingUncategorized(false)
        }
    }, [data, loadingUncategorized, organizationId])

    useEffect(() => {
        const handleUpdate = () => {
            void loadSidebar()
        }
        const frame = window.requestAnimationFrame(handleUpdate)
        window.addEventListener('knowledge-updated', handleUpdate)
        return () => {
            window.cancelAnimationFrame(frame)
            window.removeEventListener('knowledge-updated', handleUpdate)
        }
    }, [loadSidebar])

    useEffect(() => {
        if (!data || !currentCollectionId || !expanded[currentCollectionId]) return

        const activeCollection = data.collections.find(collection => collection.id === currentCollectionId)
        if (!activeCollection || activeCollection.count === 0 || activeCollection.loadedFileCount > 0) return
        if (loadingCollectionIds[currentCollectionId]) return

        void loadCollectionFiles(currentCollectionId)
    }, [currentCollectionId, data, expanded, loadCollectionFiles, loadingCollectionIds])

    useEffect(() => {
        if (!organizationId) return
        let channel: ReturnType<typeof supabase.channel> | null = null
        let isMounted = true

        const setupRealtime = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!isMounted) return

            if (session?.access_token) {
                supabase.realtime.setAuth(session.access_token)
            }

            channel = supabase.channel(`knowledge_sidebar_${organizationId}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'knowledge_documents',
                    filter: `organization_id=eq.${organizationId}`
                }, () => {
                    loadSidebar()
                })
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'knowledge_collections',
                    filter: `organization_id=eq.${organizationId}`
                }, () => {
                    loadSidebar()
                })
                .subscribe()
        }

        setupRealtime()

        return () => {
            isMounted = false
            if (channel) {
                supabase.removeChannel(channel)
            }
        }
    }, [loadSidebar, organizationId, supabase])

    function toggleExpand(id: string, e: React.MouseEvent) {
        e.stopPropagation()
        const willExpand = !expanded[id]
        setExpanded(prev => ({ ...prev, [id]: willExpand }))
        if (!willExpand) return

        const collection = collections.find(item => item.id === id)
        if (!collection || collection.count === 0 || collection.loadedFileCount > 0) return
        void loadCollectionFiles(id)
    }

    async function handleCreateFolder(name: string) {
        await createCollection(name)
        loadSidebar()
    }

    const footer = isReadOnly ? null : (
        <div className="p-3 space-y-2 border-t border-gray-200 bg-white">
            <Button
                variant="secondary"
                className="w-full justify-start bg-white border border-gray-200 shadow-sm hover:bg-gray-50 text-gray-700"
                onClick={() => setShowFolderModal(true)}
            >
                <FolderPlus size={16} className="mr-2 text-gray-500" />
                {tFolderModal('create')}
            </Button>
            <NewContentButton
                collectionId={currentCollectionId}
                className="w-full justify-start"
                align="start"
                side="top"
            />
        </div>
    )

    if (!data) {
        return (
            <Sidebar title={t('title')} footer={footer}>
                <SidebarGroup title={t('content')}>
                    <div className="space-y-2 px-3 py-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-8 w-full rounded-md" />
                        <Skeleton className="h-8 w-5/6 rounded-md" />
                    </div>
                </SidebarGroup>
                <SidebarGroup title={t('collections')}>
                    <div className="space-y-2 px-3 py-2">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-8 w-full rounded-md" />
                        <Skeleton className="h-8 w-4/5 rounded-md" />
                        <Skeleton className="h-8 w-11/12 rounded-md" />
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

    return (
        <Sidebar title={t('title')} footer={footer}>
            <SidebarGroup title={t('content')}>
                <SidebarItem
                    icon={<LayoutGrid size={18} />}
                    label={t('allContent')}
                    count={totalCount}
                    active={!currentCollectionId}
                    onClick={() => router.push('/knowledge')}
                />
                {uncategorized.length > 0 && (
                    <div className="mt-5">
                        <div className="px-3 text-xs font-semibold text-gray-500 mb-2 flex items-center justify-between">
                            <span>{t('uncategorized')}</span>
                            <span className="text-xs text-gray-400">{uncategorizedCount}</span>
                        </div>
                        <div className="space-y-0.5">
                            {uncategorized.map(file => (
                                <div
                                    key={file.id}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md cursor-pointer truncate",
                                        file.id === currentFileId
                                            ? "bg-[#242A40]/10 text-[#242A40]"
                                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100/80"
                                    )}
                                    onClick={() => router.push(`/knowledge/${file.id}`)}
                                >
                                    <FileText size={14} className="text-gray-400 shrink-0" />
                                    <span className="truncate">{file.title}</span>
                                </div>
                            ))}
                        </div>
                        {uncategorizedHasMore && (
                            <button
                                type="button"
                                onClick={() => void loadMoreUncategorized()}
                                disabled={loadingUncategorized}
                                className="mt-1 ml-3 text-xs text-[#242A40] hover:text-[#1B2033]"
                            >
                                {loadingUncategorized ? t('loadingMore') : t('loadMore')}
                            </button>
                        )}
                    </div>
                )}
            </SidebarGroup>

            <SidebarGroup title={t('collections')}>
                <div className="space-y-1">
                    {collections.map(col => (
                        <div key={col.id}>
                            {/* Collection Header */}
                            <div
                                className={cn(
                                    "group flex items-center justify-between px-3 py-2 rounded-md text-sm cursor-pointer transition-colors",
                                    currentCollectionId === col.id
                                        ? "bg-[#242A40]/10 text-[#242A40] font-medium"
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
                                    <Folder size={16} className={cn("shrink-0", currentCollectionId === col.id ? "text-[#242A40]" : "text-yellow-500")} />
                                    <span className="truncate">{col.name}</span>
                                    <span className="text-xs text-gray-400 ml-1">({col.count})</span>
                                </div>
                                {!isReadOnly && (
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <FolderActions
                                            collection={col}
                                            redirectOnDelete={currentCollectionId === col.id}
                                            onDeleteSuccess={loadSidebar} // Reload sidebar after delete
                                            onUpdate={loadSidebar} // Reload sidebar after rename
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Files List (Nested) */}
                            {expanded[col.id] && (
                                <div className="ml-9 mt-1 space-y-0.5 border-l border-gray-200 pl-2">
                                    {col.files.map(file => (
                                        <div
                                            key={file.id}
                                            className={cn(
                                                "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer truncate",
                                                file.id === currentFileId
                                                    ? "bg-[#242A40]/10 text-[#242A40]"
                                                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                                            )}
                                            onClick={() => router.push(`/knowledge/${file.id}`)}
                                        >
                                            <FileText size={14} className="text-gray-400 shrink-0" />
                                            <span className="truncate">{file.title}</span>
                                        </div>
                                    ))}
                                    {loadingCollectionIds[col.id] && col.files.length === 0 && (
                                        <div className="space-y-1 px-2 py-1">
                                            <Skeleton className="h-6 w-full rounded-md" />
                                            <Skeleton className="h-6 w-5/6 rounded-md" />
                                        </div>
                                    )}
                                    {col.files.length === 0 && !loadingCollectionIds[col.id] && (
                                        <div className="px-2 py-1.5 text-xs text-gray-400 italic">
                                            {t('empty')}
                                        </div>
                                    )}
                                    {col.hasMoreFiles && (
                                        <button
                                            type="button"
                                            onClick={() => void loadCollectionFiles(col.id, col.loadedFileCount)}
                                            disabled={loadingCollectionIds[col.id]}
                                            className="mt-1 px-2 text-xs text-[#242A40] hover:text-[#1B2033]"
                                        >
                                            {loadingCollectionIds[col.id] ? t('loadingMore') : t('loadMore')}
                                        </button>
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
