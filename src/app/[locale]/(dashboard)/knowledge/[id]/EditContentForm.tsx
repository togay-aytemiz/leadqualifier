'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import { Button, PageHeader, Input, TextArea, ConfirmDialog, Badge } from '@/design'
import { updateKnowledgeBaseEntry, deleteKnowledgeBaseEntry, KnowledgeCollection } from '@/lib/knowledge-base/actions'
import { useTranslations } from 'next-intl'

interface EditContentFormProps {
    id: string
    initialTitle: string
    initialContent: string
    initialCollectionId: string | null
    initialStatus: 'ready' | 'processing' | 'error'
    collections: KnowledgeCollection[]
}

export function EditContentForm({
    id,
    initialTitle,
    initialContent,
    initialCollectionId,
    initialStatus,
    collections
}: EditContentFormProps) {
    const t = useTranslations('knowledge')
    const router = useRouter()

    // Form State
    const [title, setTitle] = useState(initialTitle)
    const [content, setContent] = useState(initialContent)
    const [collectionId, setCollectionId] = useState<string>(initialCollectionId || '')

    // Interaction State
    const [saving, setSaving] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    // Dirty Check
    const isDirty = (
        title !== initialTitle ||
        content !== initialContent ||
        collectionId !== (initialCollectionId || '')
    )

    function getStatusBadge(status: EditContentFormProps['initialStatus']) {
        const label = t(`statuses.${status}`)
        switch (status) {
            case 'ready':
                return <Badge variant="success">{label}</Badge>
            case 'processing':
                return <Badge variant="warning">{label}</Badge>
            case 'error':
                return <Badge variant="error">{label}</Badge>
            default:
                return <Badge variant="neutral">{label}</Badge>
        }
    }

    async function handleSubmit() {
        if (!title.trim() || !content.trim()) return

        setSaving(true)
        try {
            await updateKnowledgeBaseEntry(id, {
                title,
                content,
                collection_id: collectionId || null
            })

            setSaving(false)
            router.refresh()
            // We don't get new props immediately, so we can't easily reset isDirty without reloading
            // But router.refresh() should re-render this component with new props if the page re-fetches
            // For better UX, we could force a reload or just accept that it stays "dirty" until refresh logic propagates
            // Actually router.refresh() will re-run the server component, which passes new "initial" props
        } catch (error) {
            console.error(error)
            alert('Failed to save content')
            setSaving(false)
        }
    }

    async function handleDelete() {
        setSaving(true)
        try {
            await deleteKnowledgeBaseEntry(id)
            router.push('/knowledge')
            router.refresh()
        } catch (error) {
            console.error(error)
            alert('Failed to delete content')
            setSaving(false)
        }
    }

    return (
        <div className="flex flex-col h-full bg-white">
            <PageHeader
                title={t('editTitle')}
                breadcrumb={
                    <button
                        onClick={() => router.back()}
                        className="flex items-center text-sm text-gray-500 hover:text-gray-900 mr-4"
                    >
                        <ArrowLeft size={16} className="mr-1" />
                        {t('form.back')}
                    </button>
                }
                actions={
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                            onClick={() => setShowDeleteConfirm(true)}
                        >
                            <Trash2 size={16} className="mr-2" />
                            {t('delete')}
                        </Button>
                        <Button onClick={handleSubmit} disabled={saving || !isDirty || !title.trim() || !content.trim()}>
                            {saving ? (
                                t('form.saving')
                            ) : (
                                <>
                                    <Save size={16} className="mr-2" />
                                    {t('form.save')}
                                </>
                            )}
                        </Button>
                    </div>
                }
            />

            <div className="flex-1 overflow-auto bg-white p-8">
                <div className="max-w-4xl space-y-8">
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                        <span className="text-xs font-semibold uppercase text-gray-500">{t('statusLabel')}</span>
                        {getStatusBadge(initialStatus)}
                    </div>

                    <Input
                        label={t('form.title')}
                        value={title}
                        onChange={setTitle}
                        placeholder={t('form.titlePlaceholder')}
                    />

                    {/* Custom Select for Folder */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase">{t('form.folderOptional')}</label>
                        <div className="relative">
                            <select
                                className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm bg-white text-gray-900 appearance-none"
                                value={collectionId}
                                onChange={(e) => setCollectionId(e.target.value)}
                            >
                                <option value="">{t('form.rootFolder')}</option>
                                {collections.map(col => (
                                    <option key={col.id} value={col.id}>{col.name}</option>
                                ))}
                            </select>
                            {/* Custom arrow to make it look decent */}
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    <TextArea
                        label={t('form.content')}
                        value={content}
                        onChange={setContent}
                        placeholder={t('form.contentPlaceholder')}
                        className="min-h-[500px] font-mono text-sm leading-relaxed"
                    />
                </div>
            </div>

            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onCancel={() => setShowDeleteConfirm(false)}
                onConfirm={handleDelete}
                title={t('deleteConfirm')}
                description={t('deleteConfirm')}
                confirmText={t('delete')}
                cancelText={t('form.cancel')}
                isDestructive
                isLoading={saving}
            />
        </div>
    )
}
