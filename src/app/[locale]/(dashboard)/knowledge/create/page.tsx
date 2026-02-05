'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Save } from 'lucide-react'
import { Button, PageHeader, Input, TextArea } from '@/design'
import { createKnowledgeBaseEntry, getCollections, KnowledgeCollection } from '@/lib/knowledge-base/actions'
import { useTranslations } from 'next-intl'

export default function CreateContentPage() {
    const t = useTranslations('knowledge')
    const router = useRouter()
    const searchParams = useSearchParams()
    const initialCollectionId = searchParams.get('collectionId')

    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [collectionId, setCollectionId] = useState<string>(initialCollectionId || '')
    const [collections, setCollections] = useState<KnowledgeCollection[]>([])

    // Status
    const [isPending, startTransition] = useTransition()
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        getCollections().then(setCollections)
    }, [])

    async function handleSubmit() {
        if (!title.trim() || !content.trim()) return

        setLoading(true)
        try {
            const created = await createKnowledgeBaseEntry({
                title,
                content,
                type: 'article', // Default for now
                collection_id: collectionId || null
            })

            window.dispatchEvent(new Event('knowledge-updated'))
            window.dispatchEvent(new Event('pending-suggestions-updated'))

            if (created?.id) {
                void fetch('/api/knowledge/process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: created.id }),
                    keepalive: true
                })
            }

            // Redirect back to the collection or root
            const target = collectionId ? `/knowledge?collectionId=${collectionId}` : '/knowledge'
            router.push(target)
            router.refresh()
        } catch (error) {
            console.error(error)
            alert(t('failedToSave'))
            setLoading(false)
        }
    }

    return (
        <div className="flex flex-col h-full bg-white">
            <PageHeader
                title={t('createTitle')}
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
                        <Button variant="ghost" onClick={() => router.back()}>
                            {t('form.cancel')}
                        </Button>
                        <Button onClick={handleSubmit} disabled={loading || !title.trim() || !content.trim()}>
                            {loading ? (
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
                    <Input
                        label={t('form.title')}
                        value={title}
                        onChange={setTitle}
                        placeholder={t('form.titlePlaceholder')}
                        autoFocus
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
        </div>
    )
}
