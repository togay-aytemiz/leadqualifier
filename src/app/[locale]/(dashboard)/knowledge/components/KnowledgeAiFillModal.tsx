'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle, X } from 'lucide-react'
import { Alert, Button, TextArea } from '@/design'
import { useTranslations } from 'next-intl'

interface KnowledgeAiFillBrief {
    businessBasics: string
    processDetails: string
    botGuidelines: string
    extraNotes: string
}

interface KnowledgeAiFillModalProps {
    isOpen: boolean
    onClose: () => void
    onGenerate: (brief: KnowledgeAiFillBrief) => Promise<void>
}

export function KnowledgeAiFillModal({
    isOpen,
    onClose,
    onGenerate
}: KnowledgeAiFillModalProps) {
    const t = useTranslations('knowledge')
    const titleId = useId()
    const descriptionId = useId()
    const [businessBasics, setBusinessBasics] = useState('')
    const [processDetails, setProcessDetails] = useState('')
    const [botGuidelines, setBotGuidelines] = useState('')
    const [extraNotes, setExtraNotes] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const canSubmit = useMemo(() => {
        return [businessBasics, processDetails, botGuidelines, extraNotes].some((value) => value.trim().length > 0)
    }, [businessBasics, processDetails, botGuidelines, extraNotes])

    const modalOnClose = loading ? () => {} : onClose

    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !loading) {
                onClose()
            }
        }

        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        window.addEventListener('keydown', handleKeyDown)

        return () => {
            document.body.style.overflow = previousOverflow
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [isOpen, loading, onClose])

    async function handleGenerate() {
        if (loading || !canSubmit) return

        setLoading(true)
        setError(null)

        try {
            await onGenerate({
                businessBasics,
                processDetails,
                botGuidelines,
                extraNotes
            })
            onClose()
        } catch (generationError) {
            console.error(generationError)
            setError(t('aiFill.error'))
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) return null

    const modal = (
        <div
            className="fixed inset-0 z-[220] flex items-end justify-center bg-slate-950/50 p-1.5 sm:items-center sm:p-4"
            onClick={modalOnClose}
        >
            <div
                role="dialog"
                aria-modal={true}
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                className="flex max-h-[calc(100dvh-0.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-slate-200/80 bg-[#FCFDFF] shadow-2xl sm:max-h-[min(90vh,48rem)] sm:rounded-[28px]"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="border-b border-slate-200 px-4 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <h2 id={titleId} className="text-lg font-semibold text-slate-950 sm:text-2xl">
                                {t('aiFill.modalTitle')}
                            </h2>
                            <p id={descriptionId} className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                                {t('aiFill.modalDescription')}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={modalOnClose}
                            aria-label={t('form.cancel')}
                            disabled={loading}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
                    <div className="space-y-4 pr-1">
                        {loading ? (
                            <div
                                aria-busy={true}
                                className="flex min-h-[320px] flex-col items-center justify-center rounded-[28px] border border-violet-200 bg-[linear-gradient(135deg,#F6F1FF_0%,#FAFCFF_100%)] px-6 py-10 text-center"
                            >
                                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#242A40] shadow-sm">
                                    <LoaderCircle size={24} className="animate-spin" />
                                </div>
                                <h3 className="mt-5 text-base font-semibold text-slate-950">
                                    {t('aiFill.loadingTitle')}
                                </h3>
                                <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                                    {t('aiFill.loadingDescription')}
                                </p>
                            </div>
                        ) : (
                            <>
                                <TextArea
                                    label={t('aiFill.businessBasicsLabel')}
                                    value={businessBasics}
                                    onChange={setBusinessBasics}
                                    rows={4}
                                    placeholder={t('aiFill.businessBasicsPlaceholder')}
                                    disabled={loading}
                                    className="min-h-[112px] rounded-2xl border-slate-200 bg-white/90"
                                />

                                <TextArea
                                    label={t('aiFill.processDetailsLabel')}
                                    value={processDetails}
                                    onChange={setProcessDetails}
                                    rows={4}
                                    placeholder={t('aiFill.processDetailsPlaceholder')}
                                    disabled={loading}
                                    className="min-h-[112px] rounded-2xl border-slate-200 bg-white/90"
                                />

                                <TextArea
                                    label={t('aiFill.botGuidelinesLabel')}
                                    value={botGuidelines}
                                    onChange={setBotGuidelines}
                                    rows={4}
                                    placeholder={t('aiFill.botGuidelinesPlaceholder')}
                                    disabled={loading}
                                    className="min-h-[112px] rounded-2xl border-slate-200 bg-white/90"
                                />

                                <TextArea
                                    label={t('aiFill.extraNotesLabel')}
                                    value={extraNotes}
                                    onChange={setExtraNotes}
                                    rows={4}
                                    placeholder={t('aiFill.extraNotesPlaceholder')}
                                    disabled={loading}
                                    className="min-h-[112px] rounded-2xl border-slate-200 bg-white/90"
                                />

                                <div className="rounded-2xl border border-violet-200 bg-[linear-gradient(135deg,#F6F1FF_0%,#FAFCFF_100%)] px-4 py-3">
                                    <p className="text-sm leading-6 text-violet-950">{t('aiFill.reviewBeforeSave')}</p>
                                </div>

                                {error ? <Alert variant="error">{error}</Alert> : null}
                            </>
                        )}
                    </div>
                </div>

                <div className="border-t border-slate-200 bg-white/90 px-4 py-4 sm:px-6">
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button variant="ghost" onClick={modalOnClose} disabled={loading} className="w-full sm:w-auto">
                            {t('form.cancel')}
                        </Button>
                        <Button
                            onClick={handleGenerate}
                            disabled={loading || !canSubmit}
                            className="w-full border-transparent bg-[#242A40] text-white hover:bg-[#1B2033] sm:w-auto"
                        >
                            {loading ? t('aiFill.generating') : t('aiFill.generate')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )

    if (typeof document === 'undefined') {
        return modal
    }

    return createPortal(modal, document.body)
}
