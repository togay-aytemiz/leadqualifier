'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { getRegisterConsentLinkClasses } from '@/components/auth/registerConsentStyles'
import {
    CHECKOUT_LEGAL_ACCEPTED_VALUE,
    CHECKOUT_LEGAL_FORM_FIELD_NAMES,
    getCheckoutLegalDocuments,
    type CheckoutLegalFlowType
} from '@/lib/billing/checkout-legal'
import { createExternalLegalLink } from '@/lib/legal/external-links'

type CheckoutLegalConsentVariant = 'full_legal' | 'plan_change'

interface CheckoutLegalConsentModalProps {
    flowType: CheckoutLegalFlowType
    consentVariant?: CheckoutLegalConsentVariant
    title?: string
    summary: string
    summaryDetails?: Array<{
        label: string
        value: string
        emphasis?: 'strong'
    }>
    description?: string
    providerNotice?: string
    continueLabel?: string
    immediateStartLabel?: string
    secondaryAction?: {
        label: string
        action: (formData: FormData) => void | Promise<void>
        hiddenFields?: Array<{
            name: string
            value: string
        }>
    }
    action: (formData: FormData) => void | Promise<void>
    hiddenFields: Array<{
        name: string
        value: string
    }>
    onClose: () => void
}

export function CheckoutLegalConsentModal({
    flowType,
    consentVariant = 'full_legal',
    title,
    summary,
    summaryDetails = [],
    description,
    providerNotice,
    continueLabel,
    immediateStartLabel,
    secondaryAction,
    action,
    hiddenFields,
    onClose
}: CheckoutLegalConsentModalProps) {
    const locale = useLocale()
    const tPlans = useTranslations('billingPlans')
    const legalDocuments = useMemo(() => getCheckoutLegalDocuments(flowType), [flowType])
    const isPlanChangeConsent = consentVariant === 'plan_change'
    const [acceptedRequiredDocs, setAcceptedRequiredDocs] = useState(false)
    const [acceptedImmediateStart, setAcceptedImmediateStart] = useState(false)

    const infoDocuments = legalDocuments.filter((document) => !document.required)
    const footerDocuments = isPlanChangeConsent ? legalDocuments : infoDocuments
    const preInformationLink = createExternalLegalLink('pre-information', locale)
    const distanceSalesAgreementLink = createExternalLegalLink('distance-sales-agreement', locale)
    const termsLink = createExternalLegalLink('terms', locale)
    const resolvedTitle = title ?? (
        isPlanChangeConsent
            ? tPlans('checkoutLegal.titleDirectAction')
            : tPlans('checkoutLegal.title')
    )
    const resolvedDescription = description ?? (
        isPlanChangeConsent
            ? tPlans('checkoutLegal.descriptionDirectAction')
            : tPlans('checkoutLegal.description')
    )
    const resolvedProviderNotice = isPlanChangeConsent
        ? providerNotice
        : (providerNotice ?? tPlans('checkoutLegal.providerNotice'))
    const resolvedImmediateStartLabel = immediateStartLabel ?? (
        isPlanChangeConsent
            ? tPlans('checkoutLegal.acceptPlanChange')
            : tPlans('checkoutLegal.acceptImmediateStart')
    )
    const canSubmit = isPlanChangeConsent
        ? acceptedImmediateStart
        : acceptedRequiredDocs && acceptedImmediateStart

    return (
        <div
            className="fixed inset-0 z-[230] flex items-center justify-center bg-black/50 p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-xl font-semibold text-gray-900">
                            {resolvedTitle}
                        </h3>
                        <p className="mt-1 text-sm text-gray-600">
                            {resolvedDescription}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                        aria-label={tPlans('checkoutLegal.close')}
                    >
                        <X size={18} />
                    </button>
                </div>

                <form action={action} className="mt-5">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                            {tPlans('checkoutLegal.summaryLabel')}
                        </p>
                        <p className="mt-2 text-sm font-medium text-gray-900">{summary}</p>
                        {summaryDetails.length > 0 && (
                            <dl className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                                {summaryDetails.map((detail) => (
                                    <div
                                        key={`${detail.label}:${detail.value}`}
                                        className={`flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4 ${
                                            detail.emphasis
                                                ? 'mt-1 border-t border-gray-200 pt-3 sm:items-center'
                                                : 'sm:items-start'
                                        }`}
                                    >
                                        <dt className={`text-xs uppercase tracking-[0.14em] ${
                                            detail.emphasis
                                                ? 'font-semibold text-gray-700'
                                                : 'font-medium text-gray-500'
                                        }`}>
                                            {detail.label}
                                        </dt>
                                        <dd className={`sm:max-w-[65%] sm:text-right ${
                                            detail.emphasis
                                                ? 'text-base font-semibold text-gray-900'
                                                : 'text-sm text-gray-700'
                                        }`}>
                                            {detail.value}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        )}
                        {resolvedProviderNotice && (
                            <p className="mt-3 text-xs text-gray-600">
                                {resolvedProviderNotice}
                            </p>
                        )}
                    </div>

                    <div className="mt-5 space-y-3">
                        {!isPlanChangeConsent && (
                            <label className="flex items-start gap-3 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    name={CHECKOUT_LEGAL_FORM_FIELD_NAMES.requiredDocs}
                                    value={CHECKOUT_LEGAL_ACCEPTED_VALUE}
                                    checked={acceptedRequiredDocs}
                                    onChange={(event) => setAcceptedRequiredDocs(event.target.checked)}
                                    required
                                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#242A40] focus:ring-[#242A40]"
                                />
                                <span>
                                    {tPlans.rich('checkoutLegal.acceptRequiredDocs', {
                                        preInformation: (chunks) => (
                                            <a
                                                href={preInformationLink.href}
                                                target={preInformationLink.target}
                                                rel={preInformationLink.rel}
                                                className={getRegisterConsentLinkClasses()}
                                            >
                                                {chunks}
                                            </a>
                                        ),
                                        distanceSalesAgreement: (chunks) => (
                                            <a
                                                href={distanceSalesAgreementLink.href}
                                                target={distanceSalesAgreementLink.target}
                                                rel={distanceSalesAgreementLink.rel}
                                                className={getRegisterConsentLinkClasses()}
                                            >
                                                {chunks}
                                            </a>
                                        ),
                                        terms: (chunks) => (
                                            <a
                                                href={termsLink.href}
                                                target={termsLink.target}
                                                rel={termsLink.rel}
                                                className={getRegisterConsentLinkClasses()}
                                            >
                                                {chunks}
                                            </a>
                                        ),
                                    })}
                                </span>
                            </label>
                        )}

                        <label className="flex items-start gap-3 text-sm text-gray-700">
                            <input
                                type="checkbox"
                                name={CHECKOUT_LEGAL_FORM_FIELD_NAMES.immediateStart}
                                value={CHECKOUT_LEGAL_ACCEPTED_VALUE}
                                checked={acceptedImmediateStart}
                                onChange={(event) => setAcceptedImmediateStart(event.target.checked)}
                                required
                                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#242A40] focus:ring-[#242A40]"
                            />
                            <span>{resolvedImmediateStartLabel}</span>
                        </label>

                        {footerDocuments.length > 0 && (
                            <div className="border-t border-gray-100 pt-3 text-xs leading-relaxed text-gray-500">
                                <div className="flex flex-wrap gap-x-3 gap-y-1">
                                    {footerDocuments.map((document) => {
                                        const link = createExternalLegalLink(document.id, locale)
                                        return (
                                            <a
                                                key={document.id}
                                                href={link.href}
                                                target={link.target}
                                                rel={link.rel}
                                                className="font-medium text-gray-500 underline decoration-gray-300 underline-offset-2 transition hover:text-gray-700"
                                            >
                                                {tPlans(`checkoutLegal.docs.${document.labelKey}`)}
                                            </a>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {secondaryAction && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                                <p className="font-medium">
                                    {tPlans('checkoutLegal.savedPaymentMethodBannerNotice')}
                                </p>
                                <p className="mt-1">
                                    {tPlans('checkoutLegal.savedPaymentMethodBannerHint')}{' '}
                                    <button
                                        type="submit"
                                        formAction={secondaryAction.action}
                                        formNoValidate
                                        aria-label={tPlans('checkoutLegal.updatePaymentMethodBeforeChange')}
                                        className="font-medium underline decoration-amber-500 underline-offset-2 transition hover:text-amber-900"
                                    >
                                        {secondaryAction.label}
                                    </button>
                                </p>
                                {(secondaryAction.hiddenFields ?? []).map((field) => (
                                    <input
                                        key={`secondary:${field.name}`}
                                        type="hidden"
                                        name={field.name}
                                        value={field.value}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                        {hiddenFields.map((field) => (
                            <input
                                key={field.name}
                                type="hidden"
                                name={field.name}
                                value={field.value}
                            />
                        ))}
                        {isPlanChangeConsent && (
                            <input
                                type="hidden"
                                name={CHECKOUT_LEGAL_FORM_FIELD_NAMES.requiredDocs}
                                value={CHECKOUT_LEGAL_ACCEPTED_VALUE}
                            />
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-100"
                        >
                            {tPlans('checkoutLegal.back')}
                        </button>
                        <button
                            type="submit"
                            className="inline-flex h-10 items-center rounded-lg bg-[#242A40] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#3b4768] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#242A40]/30 active:bg-[#1a2031] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-white/80"
                            disabled={!canSubmit}
                        >
                            {continueLabel ?? (
                                isPlanChangeConsent
                                    ? tPlans('checkoutLegal.continueDirectAction')
                                    : tPlans('checkoutLegal.continue')
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
