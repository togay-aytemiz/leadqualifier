import { getTranslations } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buildLocalizedPath } from '@/lib/i18n/locale-path'
import { HostedCheckoutEmbed } from '../../HostedCheckoutEmbed'

interface UpgradeCheckoutPageProps {
    params: Promise<{
        locale: string
        recordId: string
    }>
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

export default async function UpgradeCheckoutPage({ params }: UpgradeCheckoutPageProps) {
    const { locale, recordId } = await params
    if (!recordId) {
        notFound()
    }
    const tPlans = await getTranslations({ locale, namespace: 'billingPlans' })

    const supabase = await createClient()
    const { data: orderRecord, error } = await supabase
        .from('credit_purchase_orders')
        .select('id, provider, status, metadata')
        .eq('id', recordId)
        .eq('provider', 'iyzico')
        .maybeSingle()

    if (error || !orderRecord) {
        notFound()
    }

    const metadata = asRecord(orderRecord.metadata)
    const checkoutFormContent = typeof metadata.checkout_form_content === 'string'
        ? metadata.checkout_form_content
        : null
    const checkoutPageUrl = typeof metadata.checkout_page_url === 'string'
        ? metadata.checkout_page_url.trim()
        : null

    if (!checkoutFormContent || !checkoutFormContent.trim()) {
        redirect(`${buildLocalizedPath('/settings/plans', locale)}?checkout_action=subscribe&checkout_status=error&checkout_error=request_failed`)
    }

    return (
        <div className="flex min-h-[75vh] items-center justify-center p-4">
            <HostedCheckoutEmbed
                checkoutFormContent={checkoutFormContent}
                checkoutPageUrl={checkoutPageUrl}
                loadingTitle={tPlans('hostedCheckout.loadingTitle')}
                loadingDescription={tPlans('hostedCheckout.loadingDescription')}
                fallbackTitle={tPlans('hostedCheckout.fallbackTitle')}
                fallbackDescription={tPlans('hostedCheckout.fallbackDescription')}
                fallbackActionLabel={tPlans('hostedCheckout.fallbackAction')}
            />
        </div>
    )
}
