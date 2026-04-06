'use client'

import { useEffect, useId } from 'react'
import { useTranslations } from 'next-intl'
import { CircleHelp, MessageSquareQuote, ShieldAlert, X } from 'lucide-react'
import { createPortal } from 'react-dom'

interface AiInstructionsHelpModalProps {
    isOpen: boolean
    onClose: () => void
}

interface HelpSectionProps {
    icon: React.ReactNode
    title: string
    description: string
    items: string[]
}

function HelpSection({ icon, title, description, items }: HelpSectionProps) {
    return (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                    {icon}
                </div>
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                    <p className="mt-1 text-sm text-gray-600">{description}</p>
                </div>
            </div>
            <ul className="mt-3 space-y-1.5 pl-5 text-sm text-slate-700 marker:text-slate-400">
                {items.map((item) => (
                    <li
                        key={item}
                        className="leading-6"
                    >
                        {item}
                    </li>
                ))}
            </ul>
        </section>
    )
}

export function AiInstructionsHelpModal({ isOpen, onClose }: AiInstructionsHelpModalProps) {
    const t = useTranslations('aiSettings')
    const titleId = useId()
    const descriptionId = useId()

    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
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
    }, [isOpen, onClose])

    if (!isOpen) return null

    const modal = (
        <div
            className="fixed inset-0 z-[220] flex items-end justify-center bg-black/50 p-2 sm:items-center sm:p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal={true}
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                className="flex max-h-[calc(100dvh-0.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-[#F8FAFC] shadow-2xl sm:max-h-[min(90vh,48rem)] sm:rounded-[28px] sm:border sm:border-gray-200"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
                    <div>
                        <p className="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/90">
                            {t('howItWorksPill')}
                        </p>
                        <h2 id={titleId} className="mt-3 text-xl font-semibold text-gray-900 sm:text-2xl">
                            {t('howItWorksTitle')}
                        </h2>
                        <p id={descriptionId} className="mt-2 max-w-xl text-sm leading-6 text-gray-600">
                            {t('howItWorksDescription')}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('howItWorksClose')}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-white hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
                    <div className="space-y-3 pr-1">
                    <HelpSection
                        icon={<CircleHelp size={18} />}
                        title={t('howItWorksWhatItDoesTitle')}
                        description={t('howItWorksWhatItDoesDescription')}
                        items={[
                            t('howItWorksWhatItDoesItemRole'),
                            t('howItWorksWhatItDoesItemIntake'),
                            t('howItWorksWhatItDoesItemTone')
                        ]}
                    />
                    <HelpSection
                        icon={<MessageSquareQuote size={18} />}
                        title={t('howItWorksExampleTitle')}
                        description={t('howItWorksExampleDescription')}
                        items={[
                            t('howItWorksExampleItemPrice'),
                            t('howItWorksExampleItemFollowup'),
                            t('howItWorksExampleItemStyle')
                        ]}
                    />
                    <HelpSection
                        icon={<ShieldAlert size={18} />}
                        title={t('howItWorksLimitsTitle')}
                        description={t('howItWorksLimitsDescription')}
                        items={[
                            t('howItWorksLimitsItemKnowledgeBase'),
                            t('howItWorksLimitsItemPipeline'),
                            t('howItWorksLimitsItemGuardrails')
                        ]}
                    />
                    </div>
                </div>

                <div className="flex justify-end border-t border-gray-200 px-5 py-4 sm:px-6">
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                    >
                        {t('howItWorksClose')}
                    </button>
                </div>
            </div>
        </div>
    )

    if (typeof document === 'undefined') {
        return modal
    }

    return createPortal(modal, document.body)
}
