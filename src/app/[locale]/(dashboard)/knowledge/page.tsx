'use client'

import { useState, useEffect, useTransition } from 'react'
import { Plus, FolderPlus, Search, ChevronRight, Home, Trash2, MoreHorizontal } from 'lucide-react'
import { Button, PageHeader, EmptyState, ConfirmDialog } from '@/design'
import { KnowledgeTable } from './components/KnowledgeTable'
import { FolderCard } from './components/FolderCard'

import { FolderModal } from './components/FolderModal'
import { NewContentButton } from './components/NewContentButton'
import { FolderActions } from './components/FolderActions'
import {
    getKnowledgeBaseEntries,
    createKnowledgeBaseEntry,
    deleteKnowledgeBaseEntry,
    KnowledgeBaseEntry,
    getCollections,
    createCollection,
    deleteCollection,
    KnowledgeCollection
} from '@/lib/knowledge-base/actions'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

export default function KnowledgeBasePage() {
    const t = useTranslations('knowledge')
    const tSidebar = useTranslations('sidebar')
    const tCommon = useTranslations('deleteFolder')
    const searchParams = useSearchParams()
    const router = useRouter()

    // URL Params
    const collectionId = searchParams.get('collectionId')

    // State
    const [entries, setEntries] = useState<KnowledgeBaseEntry[]>([])
    const [collections, setCollections] = useState<KnowledgeCollection[]>([])
    const [currentCollection, setCurrentCollection] = useState<KnowledgeCollection | null>(null)
    const [loading, setLoading] = useState(true)

    // Modal State
    const [showFolderModal, setShowFolderModal] = useState(false)

    useEffect(() => {
        loadData()
    }, [collectionId])

    async function loadData() {
        setLoading(true)
        try {
            // 1. Load Files (filtered by collectionId)
            const entriesData = await getKnowledgeBaseEntries(collectionId)
            setEntries(entriesData)

            // 2. Load Collections (Only if at Root)
            const allCollections = await getCollections()

            if (collectionId) {
                const found = allCollections.find(c => c.id === collectionId)
                setCurrentCollection(found || null)
                setCollections([])
            } else {
                setCurrentCollection(null)
                setCollections(allCollections)
            }

        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    // Confirm Dialog State (Only for File Entries now)
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

    function handleDelete(id: string) {
        setDeleteDialog({
            isOpen: true,
            id,
            message: t('deleteConfirm'),
            isLoading: false
        })
    }

    async function handleConfirmAction() {
        if (!deleteDialog.id) return

        setDeleteDialog(prev => ({ ...prev, isLoading: true }))

        try {
            await deleteKnowledgeBaseEntry(deleteDialog.id)
            setEntries(entries.filter(e => e.id !== deleteDialog.id))
            setDeleteDialog(prev => ({ ...prev, isOpen: false }))
        } catch (error) {
            console.error(error)
            alert(t('failedToDelete'))
        } finally {
            setDeleteDialog(prev => ({ ...prev, isLoading: false }))
        }
    }

    async function handleSubmitFolder(name: string) {
        await createCollection(name)
        loadData()
        router.refresh()
    }

    const isEmpty = entries.length === 0 && collections.length === 0 && !loading

    return (
        <div className="flex flex-col h-full bg-white">
            <PageHeader
                title={currentCollection ? currentCollection.name : tSidebar('allContent')}
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
                        {!collectionId && (
                            <Button variant="secondary" onClick={() => setShowFolderModal(true)}>
                                <FolderPlus size={16} className="mr-2" />
                                {t('newFolder')}
                            </Button>
                        )}
                        {/* Folder Actions (Delete/Rename) */}
                        {collectionId && currentCollection && (
                            <FolderActions
                                collection={{ ...currentCollection, count: entries.length }}
                                redirectOnDelete
                                trigger={
                                    <Button variant="secondary">
                                        <MoreHorizontal size={16} />
                                    </Button>
                                }
                            />
                        )}
                        <NewContentButton collectionId={collectionId} />
                    </div>
                }
            />

            <div className="p-6 space-y-6 flex-1 overflow-auto">
                {/* Filters Bar */}
                <div className="flex justify-end items-center bg-white p-1">
                    <div className="text-sm text-gray-500 font-medium">
                        {entries.length + collections.length} items
                    </div>
                </div>

                {loading ? (
                    <div className="py-20 flex flex-col items-center justify-center text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4" />
                        <p className="text-gray-400">{t('loading')}</p>
                    </div>
                ) : isEmpty ? (
                    <div className="flex flex-col items-center justify-center h-[60vh] text-center max-w-md mx-auto">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            {collectionId ? t('emptyFolder') : t('noContentYet')}
                        </h3>
                        <p className="text-gray-500 mb-4 max-w-sm">
                            {collectionId ? t('emptyFolderDesc') : t('noContentYetDesc')}
                        </p>

                        <div className="flex gap-2 mt-2 justify-center">
                            {!collectionId && (
                                <Button variant="secondary" onClick={() => setShowFolderModal(true)} className="bg-white border border-gray-200 shadow-sm hover:bg-gray-50">
                                    <FolderPlus size={16} className="mr-2 text-gray-500" />
                                    {t('newFolder')}
                                </Button>
                            )}
                            <NewContentButton collectionId={collectionId} />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-8">
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
                                            count={0}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Files Section */}
                        {entries.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-gray-500 mb-3 px-1">{t('files')}</h3>
                                <KnowledgeTable entries={entries} onDelete={handleDelete} />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modals */}
            <FolderModal
                isOpen={showFolderModal}
                onClose={() => setShowFolderModal(false)}
                onSubmit={handleSubmitFolder}
            />

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
