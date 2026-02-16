'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'

interface TopupConversationRange {
    min: number
    max: number
}

export interface TopupPackOption {
    id: string
    credits: number
    amountTry: number
    localizedAmount: number
    currency: 'TRY' | 'USD'
    conversationRange: TopupConversationRange
}

interface TopupCheckoutCardProps {
    organizationId: string
    packs: TopupPackOption[]
    topupAllowed: boolean
    blockedReason: string | null
    topupAction: (formData: FormData) => void | Promise<void>
}

export function TopupCheckoutCard({
    organizationId,
    packs,
    topupAllowed,
    blockedReason,
    topupAction
}: TopupCheckoutCardProps) {
    const [isClient, setIsClient] = useState(false)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const locale = useLocale()
    const tPlans = useTranslations('billingPlans')

    const formatNumber = useMemo(
        () => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
        [locale]
    )
    const currency = packs[0]?.currency ?? 'TRY'
    const formatCurrency = useMemo(
        () => new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }),
        [currency, locale]
    )

    const defaultPackId = useMemo(() => {
        if (!packs.length) return ''
        return [...packs]
            .sort((left, right) => (left.localizedAmount / left.credits) - (right.localizedAmount / right.credits))[0]
            ?.id ?? ''
    }, [packs])
    const [selectedPackId, setSelectedPackId] = useState(defaultPackId)

    const selectedPack = packs.find((pack) => pack.id === selectedPackId) ?? packs[0] ?? null

    useEffect(() => {
        setIsClient(true)
    }, [])

    useEffect(() => {
        setSelectedPackId(defaultPackId)
    }, [defaultPackId])

    useEffect(() => {
        if (!isModalOpen) return

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsModalOpen(false)
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [isModalOpen])

    useEffect(() => {
        if (!isModalOpen) return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = previousOverflow
        }
    }, [isModalOpen])

    const modal = (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setIsModalOpen(false)}
        >
            <div
                className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3">
                    <h3 className="text-xl font-semibold text-gray-900">{tPlans('topups.modal.title')}</h3>
                    <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                        aria-label={tPlans('topups.modal.close')}
                    >
                        <X size={18} />
                    </button>
                </div>

                <p className="mt-2 text-sm text-gray-600">{tPlans('topups.modal.description')}</p>

                <div className="mt-4 space-y-2">
                    {packs.map((pack) => {
                        const isSelected = pack.id === selectedPackId
                        return (
                            <label
                                key={pack.id}
                                className={`block cursor-pointer rounded-xl border px-4 py-3 transition ${
                                    isSelected
                                        ? 'border-[#242A40] bg-gray-50'
                                        : 'border-gray-200 bg-white hover:border-gray-300'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="topupPackId"
                                    value={pack.id}
                                    checked={isSelected}
                                    onChange={() => setSelectedPackId(pack.id)}
                                    className="sr-only"
                                />
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900">
                                            {formatNumber.format(pack.credits)} {tPlans('creditsUnit')}
                                        </p>
                                        <p className="mt-1 text-xs text-gray-600">
                                            {tPlans('topups.approxConversations', {
                                                min: formatNumber.format(pack.conversationRange.min),
                                                max: formatNumber.format(pack.conversationRange.max)
                                            })}
                                        </p>
                                    </div>
                                    <p className="text-sm font-semibold text-gray-900">
                                        {formatCurrency.format(pack.localizedAmount)}
                                    </p>
                                </div>
                            </label>
                        )
                    })}
                </div>

                <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    {selectedPack ? (
                        <p className="text-sm text-gray-700">
                            {tPlans('topups.modal.selectedSummary', {
                                credits: formatNumber.format(selectedPack.credits),
                                amount: formatCurrency.format(selectedPack.localizedAmount)
                            })}
                        </p>
                    ) : (
                        <p className="text-sm text-gray-500">{tPlans('topups.unavailable')}</p>
                    )}
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
                    >
                        {tPlans('topups.modal.cancel')}
                    </button>

                    <form action={topupAction}>
                        <input type="hidden" name="organizationId" value={organizationId} />
                        <input type="hidden" name="credits" value={String(selectedPack?.credits ?? 0)} />
                        <input type="hidden" name="amountTry" value={String(selectedPack?.amountTry ?? 0)} />
                        <input type="hidden" name="simulatedOutcome" value="success" />
                        <button
                            type="submit"
                            className="inline-flex h-10 items-center rounded-lg bg-[#242A40] px-4 text-sm font-semibold text-white transition hover:bg-[#1f2437] disabled:cursor-not-allowed disabled:bg-gray-300"
                            disabled={!selectedPack || !topupAllowed}
                        >
                            {tPlans('topups.modal.submit')}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )

    return (
        <>
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 className="text-base font-semibold text-gray-900">{tPlans('topups.title')}</h3>
                        <p className="mt-1 text-sm text-gray-600">{tPlans('topups.oneTimeNotice')}</p>
                        {!topupAllowed && blockedReason && (
                            <p className="mt-1 text-sm text-amber-700">{blockedReason}</p>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsModalOpen(true)}
                        className="inline-flex h-10 items-center justify-center self-start whitespace-nowrap rounded-lg bg-[#242A40] px-4 text-sm font-semibold text-white transition hover:bg-[#1f2437] disabled:cursor-not-allowed disabled:bg-gray-300 sm:self-auto"
                        disabled={!topupAllowed || packs.length === 0}
                    >
                        {tPlans('topups.openModal')}
                    </button>
                </div>
            </div>

            {isClient && isModalOpen && createPortal(modal, document.body)}
        </>
    )
}
