'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { FolderPlus, Home, ChevronRight, MoreHorizontal, ArrowLeft } from 'lucide-react'
import { Button, PageHeader, ConfirmDialog } from '@/design'
import { KnowledgeTable } from './KnowledgeTable'
import { FolderCard } from './FolderCard'
import { FolderModal } from './FolderModal'
import { NewContentButton } from './NewContentButton'
import { FolderActions } from './FolderActions'
import {
    deleteKnowledgeBaseEntry,
    createCollection,
    KnowledgeBaseEntry,
    KnowledgeCollection,
} from '@/lib/knowledge-base/actions'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

interface KnowledgeContainerProps {
    initialEntries: KnowledgeBaseEntry[]
    initialCollections: KnowledgeCollection[]
    currentCollection: KnowledgeCollection | null
    collectionId?: string | null
    organizationId?: string | null
    aiSuggestionsEnabled?: boolean
    initialPendingSuggestions?: number
    isReadOnly?: boolean
}

export function KnowledgeContainer({
    initialEntries,
    initialCollections,
    currentCollection,
    collectionId,
    organizationId,
    aiSuggestionsEnabled = false,
    initialPendingSuggestions = 0,
    isReadOnly = false
}: KnowledgeContainerProps) {
    const t = useTranslations('knowledge')
    const tSidebar = useTranslations('sidebar')
    const tCommon = useTranslations('deleteFolder')
    const router = useRouter()

    // State (initialized from props, updated by local actions or refreshes)
    const [entries, setEntries] = useState<KnowledgeBaseEntry[]>(initialEntries)
    const [collections, setCollections] = useState<KnowledgeCollection[]>(initialCollections)
    const [pendingSuggestions, setPendingSuggestions] = useState(initialPendingSuggestions)

    // Sync state if props change (re-validation)
    useEffect(() => {
        setEntries(initialEntries)
        setCollections(initialCollections)
    }, [initialEntries, initialCollections])

    useEffect(() => {
        setPendingSuggestions(initialPendingSuggestions)
    }, [initialPendingSuggestions])

    const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
    if (!supabaseRef.current) {
        supabaseRef.current = createClient()
    }
    const supabase = supabaseRef.current

    const refreshPendingSuggestions = useCallback(async () => {
        if (!organizationId) return

        const query = supabase
            .from('offering_profile_suggestions')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .is('archived_at', null)
            .or('status.eq.pending,status.is.null')

        const { count, error } = await query
        if (error) {
            console.error('Failed to load pending suggestions', error)
            return
        }
        setPendingSuggestions(count ?? 0)
    }, [organizationId, supabase])

    useEffect(() => {
        if (!organizationId || !aiSuggestionsEnabled) return
        refreshPendingSuggestions()
    }, [aiSuggestionsEnabled, organizationId, refreshPendingSuggestions])

    useEffect(() => {
        if (!organizationId || !aiSuggestionsEnabled) return
        let suggestionChannel: ReturnType<typeof supabase.channel> | null = null
        let isMounted = true

        const setupRealtime = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!isMounted) return
            if (session?.access_token) {
                supabase.realtime.setAuth(session.access_token)
            }

            suggestionChannel = supabase.channel(`knowledge_suggestions_${organizationId}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'offering_profile_suggestions',
                    filter: `organization_id=eq.${organizationId}`
                }, () => {
                    refreshPendingSuggestions()
                })
                .subscribe()
        }

        setupRealtime()

        return () => {
            isMounted = false
            if (suggestionChannel) {
                supabase.removeChannel(suggestionChannel)
            }
        }
    }, [aiSuggestionsEnabled, organizationId, refreshPendingSuggestions, supabase])

    useEffect(() => {
        if (!organizationId || !aiSuggestionsEnabled) return
        const handler = () => refreshPendingSuggestions()
        window.addEventListener('pending-suggestions-updated', handler)
        return () => window.removeEventListener('pending-suggestions-updated', handler)
    }, [aiSuggestionsEnabled, organizationId, refreshPendingSuggestions])

    // Modals
    const [showFolderModal, setShowFolderModal] = useState(false)
    const [deleteDialog, setDeleteDialog] = useState<{
        isOpen: boolean,
        id: string | null,
        message: string,
        isLoading: boolean
    }>({
        isOpen: false,
        id: null,
        message: '',
        isLoading: false
    })

    // Actions
    async function handleConfirmAction() {
        if (isReadOnly) return
        if (!deleteDialog.id) return

        setDeleteDialog(prev => ({ ...prev, isLoading: true }))
        try {
            await deleteKnowledgeBaseEntry(deleteDialog.id)
            setEntries(prev => prev.filter(e => e.id !== deleteDialog.id))
            window.dispatchEvent(new Event('knowledge-updated'))
            window.dispatchEvent(new Event('pending-suggestions-updated'))
            setDeleteDialog(prev => ({ ...prev, isOpen: false }))
            router.refresh()
        } catch (error) {
            console.error(error)
            alert(t('failedToDelete'))
        } finally {
            setDeleteDialog(prev => ({ ...prev, isLoading: false }))
        }
    }

    async function handleSubmitFolder(name: string) {
        if (isReadOnly) return
        await createCollection(name)
        window.dispatchEvent(new Event('knowledge-updated'))
        // Refresh server data
        router.refresh()
        // Optimistic update for immediate feedback (though refresh usually fast enough)
        setShowFolderModal(false)
    }

    // Manual refresh callback (passed to FolderActions/FolderCard if they need it)
    const handleRefresh = () => {
        router.refresh()
    }

    const isEmpty = entries.length === 0 && collections.length === 0

    useEffect(() => {
        const hasProcessing = entries.some(entry => entry.status === 'processing')
        if (!hasProcessing) return

        const intervalId = window.setInterval(() => {
            router.refresh()
            window.dispatchEvent(new Event('knowledge-updated'))
        }, 5000)

        return () => window.clearInterval(intervalId)
    }, [entries, router])

    const pageTitle = currentCollection ? currentCollection.name : tSidebar('allContent')
    const totalVisibleItems = entries.length + collections.length

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="sticky top-0 z-10 border-b border-gray-200 bg-white lg:hidden">
                <div className="flex h-14 items-center justify-between px-4">
                    <div className="flex min-w-0 items-center gap-2">
                        {currentCollection && (
                            <button
                                type="button"
                                onClick={() => router.push('/knowledge')}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
                                aria-label={t('home')}
                            >
                                <ArrowLeft size={18} />
                            </button>
                        )}
                        <h2 className="truncate text-base font-bold text-gray-900">{pageTitle}</h2>
                    </div>
                    {collectionId && currentCollection && !isReadOnly && (
                        <FolderActions
                            collection={{ ...currentCollection, count: entries.length }}
                            redirectOnDelete
                            trigger={
                                <Button variant="secondary" size="icon">
                                    <MoreHorizontal size={16} />
                                </Button>
                            }
                            onUpdate={handleRefresh}
                        />
                    )}
                </div>

                {!isReadOnly && (
                    <div className="flex gap-2 px-4 pb-3">
                        {!collectionId && (
                            <Button variant="secondary" onClick={() => setShowFolderModal(true)} className="flex-1 justify-center">
                                <FolderPlus size={16} className="mr-2" />
                                {t('newFolder')}
                            </Button>
                        )}
                        <NewContentButton collectionId={collectionId} className="flex-1 justify-center" />
                    </div>
                )}
            </div>

            <div className="hidden lg:block">
                <PageHeader
                    title={pageTitle}
                    breadcrumb={
                        currentCollection ? (
                            <div className="flex items-center text-sm text-gray-500 mr-2">
                                <span
                                    className="hover:text-gray-900 cursor-pointer flex items-center"
                                    onClick={() => router.push('/knowledge')}
                                >
                                    <Home size={14} className="mr-1" />
                                    {tSidebar('allContent')}
                                </span>
                                <ChevronRight size={14} className="mx-1" />
                            </div>
                        ) : undefined
                    }
                    actions={
                        <div className="flex gap-2">
                            {/* Only show "New Folder" at root */}
                            {!collectionId && !isReadOnly && (
                                <Button variant="secondary" onClick={() => setShowFolderModal(true)}>
                                    <FolderPlus size={16} className="mr-2" />
                                    {t('newFolder')}
                                </Button>
                            )}
                            {/* Folder Actions (Delete/Rename) */}
                            {collectionId && currentCollection && !isReadOnly && (
                                <FolderActions
                                    collection={{ ...currentCollection, count: entries.length }}
                                    redirectOnDelete
                                    trigger={
                                        <Button variant="secondary" size="icon">
                                            <MoreHorizontal size={16} />
                                        </Button>
                                    }
                                    onUpdate={handleRefresh}
                                />
                            )}
                            {!isReadOnly && <NewContentButton collectionId={collectionId} />}
                        </div>
                    }
                />
            </div>

            {aiSuggestionsEnabled && pendingSuggestions > 0 && (
                <div className="mt-3 px-4 lg:mt-4 lg:px-8">
                    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-100/80 px-4 py-3 text-sm text-amber-900 flex items-center justify-between gap-4">
                        <div>
                            <p className="font-semibold">{t('aiSuggestionsBannerTitle')}</p>
                            <p className="text-xs text-amber-800">{t('aiSuggestionsBannerDescription', { count: pendingSuggestions })}</p>
                        </div>
                        <Link
                            href="/settings/organization?focus=offering-suggestions"
                            className="text-xs font-semibold text-amber-800 hover:text-amber-900"
                        >
                            {t('aiSuggestionsBannerCta')}
                        </Link>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-auto p-4 space-y-4 lg:p-6 lg:space-y-6">
                {/* Filters Bar */}
                <div className="flex items-center justify-end bg-white p-1">
                    <div className="text-sm text-gray-500 font-medium">
                        {t('itemsCount', { count: totalVisibleItems })}
                    </div>
                </div>

                {isEmpty ? (
                    <div className="flex flex-col items-center justify-center h-[60vh] text-center max-w-md mx-auto">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            {collectionId ? t('emptyFolder') : t('noContentYet')}
                        </h3>
                        <p className="text-gray-500 mb-4 max-w-sm">
                            {collectionId ? t('emptyFolderDesc') : t('noContentYetDesc')}
                        </p>

                        <div className="flex gap-2 mt-2 justify-center">
                            {!collectionId && !isReadOnly && (
                                <Button variant="secondary" onClick={() => setShowFolderModal(true)} className="bg-white border border-gray-200 shadow-sm hover:bg-gray-50">
                                    <FolderPlus size={16} className="mr-2 text-gray-500" />
                                    {t('newFolder')}
                                </Button>
                            )}
                            {!isReadOnly && <NewContentButton collectionId={collectionId} />}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 lg:space-y-8">
                        {/* Folders Section (Only at Root) */}
                        {collections.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-gray-500 mb-3 px-1">{t('folders')}</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {collections.map(col => (
                                        <FolderCard
                                            key={col.id}
                                            id={col.id}
                                            name={col.name}
                                            count={col.count || 0}
                                            onRefresh={handleRefresh}
                                            isReadOnly={isReadOnly}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Files Section */}
                        {entries.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-gray-500 mb-3 px-1">{t('files')}</h3>
                                <KnowledgeTable entries={entries} />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modals */}
            {!isReadOnly && (
                <FolderModal
                    isOpen={showFolderModal}
                    onClose={() => setShowFolderModal(false)}
                    onSubmit={handleSubmitFolder}
                />
            )}

            <ConfirmDialog
                isOpen={deleteDialog.isOpen}
                onCancel={() => setDeleteDialog(prev => ({ ...prev, isOpen: false }))}
                onConfirm={handleConfirmAction}
                title={t('deleteConfirm')}
                description={deleteDialog.message}
                confirmText={tCommon('confirm')}
                cancelText={tCommon('cancel')}
                isDestructive
                isLoading={deleteDialog.isLoading}
            />
        </div>
    )
}
