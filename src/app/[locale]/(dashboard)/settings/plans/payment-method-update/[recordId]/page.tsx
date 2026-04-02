import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buildLocalizedPath } from '@/lib/i18n/locale-path'
import { PaymentMethodUpdateEmbed } from './PaymentMethodUpdateEmbed'

interface PaymentMethodUpdatePageProps {
    params: Promise<{
        locale: string
        recordId: string
    }>
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

export default async function PaymentMethodUpdatePage({ params }: PaymentMethodUpdatePageProps) {
    const { locale, recordId } = await params
    if (!recordId) {
        notFound()
    }
    const tPlans = await getTranslations({ locale, namespace: 'billingPlans' })

    const supabase = await createClient()
    const { data: subscriptionRecord, error } = await supabase
        .from('organization_subscription_records')
        .select('id, provider, status, metadata')
        .eq('id', recordId)
        .eq('provider', 'iyzico')
        .maybeSingle()

    if (error || !subscriptionRecord) {
        notFound()
    }

    const metadata = asRecord(subscriptionRecord.metadata)
    const checkoutFormContent = typeof metadata.card_update_checkout_form_content === 'string'
        ? metadata.card_update_checkout_form_content
        : null

    if (!checkoutFormContent || !checkoutFormContent.trim()) {
        redirect(`${buildLocalizedPath('/settings/plans', locale)}?payment_recovery_action=card_update&payment_recovery_status=error&payment_recovery_error=request_failed`)
    }

    return (
        <div className="mx-auto flex min-h-[75vh] w-full max-w-4xl flex-col justify-center gap-6 p-4">
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                        <h1 className="text-xl font-semibold text-gray-900">
                            {tPlans('paymentMethodUpdatePage.title')}
                        </h1>
                        <p className="max-w-2xl text-sm text-gray-600">
                            {tPlans('paymentMethodUpdatePage.description')}
                        </p>
                    </div>

                    <Link
                        href={buildLocalizedPath('/settings/plans', locale)}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
                    >
                        {tPlans('paymentMethodUpdatePage.backToPlans')}
                    </Link>
                </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
                <PaymentMethodUpdateEmbed checkoutFormContent={checkoutFormContent} />
            </section>
        </div>
    )
}
