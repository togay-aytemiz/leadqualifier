import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SubscriptionCheckoutEmbed } from './SubscriptionCheckoutEmbed'

interface SubscriptionCheckoutPageProps {
    params: Promise<{
        locale: string
        recordId: string
    }>
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

export default async function SubscriptionCheckoutPage({ params }: SubscriptionCheckoutPageProps) {
    const { locale, recordId } = await params
    if (!recordId) {
        notFound()
    }

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
    const checkoutFormContent = typeof metadata.checkout_form_content === 'string'
        ? metadata.checkout_form_content
        : null

    if (!checkoutFormContent || !checkoutFormContent.trim()) {
        redirect(`/${locale}/settings/plans?checkout_action=subscribe&checkout_status=error&checkout_error=request_failed`)
    }

    return (
        <div className="flex min-h-[75vh] items-center justify-center p-4">
            <SubscriptionCheckoutEmbed checkoutFormContent={checkoutFormContent} />
        </div>
    )
}
