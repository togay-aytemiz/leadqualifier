'use client'

import { useActionState, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button, Input, Modal } from '@/design'
import {
    saveOrganizationBillingProfile,
    type SaveOrganizationBillingProfileState
} from '@/lib/billing/profile.actions'
import type { BillingHistoryRow } from '@/lib/billing/history'

interface PlansBillingInformationFormValues {
    companyName: string
    billingEmail: string
    billingPhone: string
    taxIdentityNumber: string
    addressLine1: string
    city: string
    postalCode: string
    country: string
}

interface PlansBillingInformationCardProps {
    locale: string
    organizationId: string
    nextBillingDateLabel: string
    formValues: PlansBillingInformationFormValues
    historyRows: BillingHistoryRow[]
}

const INITIAL_SAVE_STATE: SaveOrganizationBillingProfileState = {
    status: 'idle',
    errorCode: null
}

export function PlansBillingInformationCard({
    locale,
    organizationId,
    nextBillingDateLabel,
    formValues,
    historyRows
}: PlansBillingInformationCardProps) {
    const tBillingInfo = useTranslations('billingPlans.billingInfo')
    const [isHistoryOpen, setIsHistoryOpen] = useState(false)
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [saveState, formAction, pending] = useActionState(
        saveOrganizationBillingProfile,
        INITIAL_SAVE_STATE
    )

    useEffect(() => {
        if (saveState.status === 'success') {
            queueMicrotask(() => setIsFormOpen(false))
        }
    }, [saveState.status])

    const errorMessage = saveState.status === 'error'
        ? (
            saveState.errorCode === 'invalid_input'
                ? tBillingInfo('messages.invalidInput')
                : saveState.errorCode === 'unauthorized'
                    ? tBillingInfo('messages.unauthorized')
                    : tBillingInfo('messages.saveError')
        )
        : null

    return (
        <>
            <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                        {tBillingInfo('nextBillingDateLabel')}
                    </p>
                    <p className="mt-1 text-sm font-medium text-gray-900">{nextBillingDateLabel}</p>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                    <button
                        type="button"
                        onClick={() => setIsHistoryOpen(true)}
                        className="inline-flex items-center font-medium text-[#242A40] underline decoration-[#242A40]/30 underline-offset-4 transition hover:text-[#1f2437] hover:decoration-[#1f2437]/40"
                    >
                        {tBillingInfo('historyCta')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsFormOpen(true)}
                        className="inline-flex items-center font-medium text-gray-600 underline decoration-gray-300 underline-offset-4 transition hover:text-gray-900 hover:decoration-gray-500"
                    >
                        {tBillingInfo('updateCta')}
                    </button>
                </div>

                {saveState.status === 'success' && (
                    <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
                        {tBillingInfo('messages.saveSuccess')}
                    </p>
                )}
            </div>

            <Modal
                isOpen={isHistoryOpen}
                onClose={() => setIsHistoryOpen(false)}
                title={tBillingInfo('historyModalTitle')}
                panelClassName="max-w-4xl"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-500">{tBillingInfo('historyModalDescription')}</p>
                    {historyRows.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                            {tBillingInfo('historyEmpty')}
                        </p>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                            <table className="min-w-full divide-y divide-gray-200 bg-white text-sm">
                                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3">{tBillingInfo('historyColumns.date')}</th>
                                        <th className="px-4 py-3">{tBillingInfo('historyColumns.amount')}</th>
                                        <th className="px-4 py-3">{tBillingInfo('historyColumns.status')}</th>
                                        <th className="px-4 py-3">{tBillingInfo('historyColumns.details')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {historyRows.map((row) => (
                                        <tr key={row.id}>
                                            <td className="whitespace-nowrap px-4 py-3 text-gray-600">{row.dateLabel}</td>
                                            <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{row.amountLabel}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-emerald-700">{row.statusLabel}</td>
                                            <td className="px-4 py-3 text-gray-600">{row.detailLabel}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div className="flex justify-end">
                        <Button type="button" variant="secondary" onClick={() => setIsHistoryOpen(false)}>
                            {tBillingInfo('close')}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                title={tBillingInfo('formModalTitle')}
                panelClassName="max-w-2xl"
            >
                <form action={formAction} className="space-y-4">
                    <p className="text-sm text-gray-500">{tBillingInfo('formModalDescription')}</p>

                    {errorMessage && (
                        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
                            {errorMessage}
                        </p>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                        <Input
                            name="companyName"
                            label={tBillingInfo('fields.companyName')}
                            defaultValue={formValues.companyName}
                            required
                        />
                        <Input
                            name="billingEmail"
                            label={tBillingInfo('fields.billingEmail')}
                            defaultValue={formValues.billingEmail}
                            type="email"
                            required
                        />
                        <Input
                            name="billingPhone"
                            label={tBillingInfo('fields.billingPhone')}
                            defaultValue={formValues.billingPhone}
                            type="tel"
                            required
                        />
                        <Input
                            name="taxIdentityNumber"
                            label={tBillingInfo('fields.taxIdentityNumber')}
                            defaultValue={formValues.taxIdentityNumber}
                            required
                        />
                        <div className="md:col-span-2">
                            <Input
                                name="addressLine1"
                                label={tBillingInfo('fields.addressLine1')}
                                defaultValue={formValues.addressLine1}
                                required
                            />
                        </div>
                        <Input
                            name="city"
                            label={tBillingInfo('fields.city')}
                            defaultValue={formValues.city}
                            required
                        />
                        <Input
                            name="postalCode"
                            label={tBillingInfo('fields.postalCode')}
                            defaultValue={formValues.postalCode}
                            required
                        />
                        <Input
                            name="country"
                            label={tBillingInfo('fields.country')}
                            defaultValue={formValues.country}
                            required
                        />
                    </div>

                    <input type="hidden" name="organizationId" value={organizationId} />
                    <input type="hidden" name="locale" value={locale} />

                    <div className="flex justify-end gap-3">
                        <Button type="button" variant="secondary" onClick={() => setIsFormOpen(false)}>
                            {tBillingInfo('cancel')}
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending ? tBillingInfo('saving') : tBillingInfo('save')}
                        </Button>
                    </div>
                </form>
            </Modal>
        </>
    )
}
