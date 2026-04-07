'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Save } from 'lucide-react'
import { HiMiniSparkles } from 'react-icons/hi2'
import { Button, PageHeader, Input, TextArea, Modal } from '@/design'
import {
    createKnowledgeBaseEntry,
    generateKnowledgeBaseDraft,
    getCollections,
    KnowledgeCollection
} from '@/lib/knowledge-base/actions'
import {
    KNOWLEDGE_UPDATED_EVENT,
    PENDING_SUGGESTIONS_UPDATED_EVENT,
    processKnowledgeDocumentInBackground
} from '@/lib/knowledge-base/process-client'
import { useLocale, useTranslations } from 'next-intl'
import { KnowledgeAiFillModal } from '../components/KnowledgeAiFillModal'

interface FirstDocumentGuidanceState {
    target: string
}

export default function CreateContentPage() {
    const t = useTranslations('knowledge')
    const locale = useLocale()
    const router = useRouter()
    const searchParams = useSearchParams()
    const initialCollectionId = searchParams.get('collectionId')

    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [collectionId, setCollectionId] = useState<string>(initialCollectionId || '')
    const [collections, setCollections] = useState<KnowledgeCollection[]>([])

    const [loading, setLoading] = useState(false)
    const [isAiFillModalOpen, setIsAiFillModalOpen] = useState(false)
    const [firstDocumentGuidance, setFirstDocumentGuidance] = useState<FirstDocumentGuidanceState | null>(null)

    useEffect(() => {
        getCollections().then(setCollections)
    }, [])

    function getFirstDocumentGuidanceKey(organizationId: string) {
        return `knowledge:first-document-guidance:${organizationId}`
    }

    function handleNavigateAfterFirstDocument(target: string) {
        setFirstDocumentGuidance(null)
        router.push(target)
    }

    async function handleAiFillGenerate(brief: {
        businessBasics: string
        processDetails: string
        botGuidelines: string
        extraNotes: string
    }) {
        const draft = await generateKnowledgeBaseDraft({
            locale,
            brief
        })

        setContent(draft.content)
        if (!title.trim()) {
            setTitle(draft.title)
        }
    }

    async function handleSubmit() {
        if (!title.trim() || !content.trim()) return

        setLoading(true)
        try {
            const target = collectionId ? `/knowledge?collectionId=${collectionId}` : '/knowledge'
            const created = await createKnowledgeBaseEntry({
                title,
                content,
                type: 'article', // Default for now
                collection_id: collectionId || null
            })

            router.refresh()

            window.dispatchEvent(new Event(KNOWLEDGE_UPDATED_EVENT))
            window.dispatchEvent(new Event(PENDING_SUGGESTIONS_UPDATED_EVENT))

            if (created.document?.id) {
                void processKnowledgeDocumentInBackground(created.document.id).catch((error) => {
                    console.error('Failed to process knowledge document', error)
                })
            }

            const firstDocumentGuidanceKey = getFirstDocumentGuidanceKey(created.document.organization_id)
            const hasSeenFirstDocumentGuidance = window.localStorage.getItem(firstDocumentGuidanceKey)

            if (created.showFirstDocumentGuidance && !hasSeenFirstDocumentGuidance) {
                window.localStorage.setItem(firstDocumentGuidanceKey, new Date().toISOString())
                setFirstDocumentGuidance({ target })
                setLoading(false)
                return
            }

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
                        <Button
                            onClick={handleSubmit}
                            disabled={loading || !title.trim() || !content.trim()}
                            className="bg-[#242A40] hover:bg-[#1B2033] border-transparent text-white"
                        >
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
                    <div className="relative overflow-hidden rounded-[28px] border border-[#DCD8FF] bg-[linear-gradient(135deg,#F7F3FF_0%,#F5FAFF_55%,#FFF8EF_100%)] px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-6">
                        <div className="pointer-events-none absolute -right-10 top-0 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.16),rgba(168,85,247,0))]" />
                        <div className="pointer-events-none absolute bottom-0 right-10 h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.12),rgba(56,189,248,0))]" />
                        <div className="relative flex items-start gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#242A40] text-white shadow-[0_12px_30px_rgba(36,42,64,0.18)]">
                                <HiMiniSparkles size={20} />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-base font-semibold text-slate-950 sm:text-lg">
                                    {t('aiFill.bannerTitle')}
                                </h2>
                                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                                    {t('aiFill.bannerDescription')}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setIsAiFillModalOpen(true)}
                                    className="mt-3 inline-flex w-fit items-center rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-[#242A40] shadow-[0_10px_24px_rgba(36,42,64,0.08)] ring-1 ring-[#242A40]/10 transition hover:bg-white hover:text-[#1B2033]"
                                >
                                    {t('aiFill.bannerAction')}
                                </button>
                            </div>
                        </div>
                    </div>

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

            <KnowledgeAiFillModal
                isOpen={isAiFillModalOpen}
                onClose={() => setIsAiFillModalOpen(false)}
                onGenerate={handleAiFillGenerate}
            />

            <Modal
                isOpen={Boolean(firstDocumentGuidance)}
                onClose={() => {
                    if (!firstDocumentGuidance) return
                    handleNavigateAfterFirstDocument(firstDocumentGuidance.target)
                }}
                title={t('firstDocumentGuidance.title')}
                panelClassName="max-w-xl"
            >
                <div className="space-y-5">
                    <p className="text-sm leading-6 text-slate-600">
                        {t('firstDocumentGuidance.description')}
                    </p>

                    <ul className="space-y-3 text-sm leading-6 text-slate-700">
                        <li className="flex items-start gap-3">
                            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-violet-500" />
                            <span>{t('firstDocumentGuidance.items.businessProfile')}</span>
                        </li>
                        <li className="flex items-start gap-3">
                            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-violet-500" />
                            <span>{t('firstDocumentGuidance.items.requiredFields')}</span>
                        </li>
                        <li className="flex items-start gap-3">
                            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-violet-500" />
                            <span>{t('firstDocumentGuidance.items.serviceCatalog')}</span>
                        </li>
                    </ul>

                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                        <Button
                            variant="ghost"
                            onClick={() => handleNavigateAfterFirstDocument('/onboarding')}
                        >
                            {t('firstDocumentGuidance.actions.goToOnboarding')}
                        </Button>
                        <Button
                            onClick={() =>
                                handleNavigateAfterFirstDocument('/settings/organization?focus=organization-details')
                            }
                            className="bg-violet-600 text-white hover:bg-violet-700"
                        >
                            {t('firstDocumentGuidance.actions.reviewBusiness')}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
