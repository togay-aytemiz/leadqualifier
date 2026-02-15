'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'

interface TopupCheckoutCardProps {
    organizationId: string
    topupCredits: number
    topupAmountTry: number
    topupAllowed: boolean
    blockedReason: string | null
    topupAction: (formData: FormData) => void | Promise<void>
}

export function TopupCheckoutCard({
    organizationId,
    topupCredits,
    topupAmountTry,
    topupAllowed,
    blockedReason,
    topupAction
}: TopupCheckoutCardProps) {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isClient, setIsClient] = useState(false)
    const locale = useLocale()
    const tPlans = useTranslations('billingPlans')

    const formatNumber = useMemo(
        () => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
        [locale]
    )
    const formatCurrency = useMemo(
        () => new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: 'TRY',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }),
        [locale]
    )

    useEffect(() => {
        setIsClient(true)
    }, [])

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
                    <h3 className="text-2xl font-semibold text-gray-900">{tPlans('actions.topup.modal.title')}</h3>
                    <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                        aria-label={tPlans('actions.topup.modal.close')}
                    >
                        <X size={18} />
                    </button>
                </div>

                <p className="mt-3 text-base text-gray-700">
                    {tPlans('actions.topup.modal.description')}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                    {tPlans('actions.topup.oneTimeNotice')}
                </p>

                <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-2xl font-semibold text-gray-900">
                                {formatNumber.format(topupCredits)} {tPlans('creditsUnit')}
                            </p>
                            <p className="mt-1 text-sm text-gray-500">{tPlans('actions.topup.modal.packageMeta')}</p>
                        </div>
                        <p className="pt-1 text-3xl font-semibold text-gray-900">
                            {formatCurrency.format(topupAmountTry)}
                        </p>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="inline-flex h-10 items-center rounded-full border border-gray-300 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
                    >
                        {tPlans('actions.topup.modal.cancel')}
                    </button>

                    <form action={topupAction}>
                        <input type="hidden" name="organizationId" value={organizationId} />
                        <input type="hidden" name="credits" value={String(topupCredits)} />
                        <input type="hidden" name="amountTry" value={String(topupAmountTry)} />
                        <input type="hidden" name="simulatedOutcome" value="success" />
                        <button
                            type="submit"
                            className="inline-flex h-10 items-center rounded-full bg-[#242A40] px-5 text-sm font-semibold text-white transition hover:bg-[#1f2437]"
                        >
                            {tPlans('actions.topup.modal.next')}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )

    return (
        <>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">{tPlans('actions.topup.title')}</h3>
                <p className="text-xs text-gray-500">{tPlans('actions.topup.oneTimeNotice')}</p>
                {!topupAllowed && blockedReason && (
                    <p className="text-xs text-amber-700">{blockedReason}</p>
                )}
                <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="inline-flex h-10 items-center rounded-lg bg-[#242A40] px-4 text-sm font-semibold text-white hover:bg-[#1f2437] disabled:cursor-not-allowed disabled:bg-gray-300"
                    disabled={!topupAllowed}
                >
                    {tPlans('actions.topup.submit')}
                </button>
            </div>

            {isClient && isModalOpen && createPortal(modal, document.body)}
        </>
    )
}
