import { NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { DemoChatClient } from '@/components/demo-chat/DemoChatClient'
import { resolveDemoChatChannel } from '@/lib/demo-chat/channel'
import { getScopedMessages } from '@/i18n/messages'

const UNIVERSITY_DEMO_LOGO_URL = '/yuksek-ihtisas-universitesi.png'

type DemoChatPageProps = {
    params: Promise<{
        locale: string
        slug: string
    }>
}

function createServiceClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase service-role configuration')
    }

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    })
}

export default async function DemoChatPage({ params }: DemoChatPageProps) {
    const { locale, slug } = await params
    setRequestLocale(locale)

    const supabase = createServiceClient()
    const channel = await resolveDemoChatChannel({ supabase, slug })
    if (!channel) {
        notFound()
    }

    const messages = await getScopedMessages(locale, ['demoChat'])
    const defaultLogoUrl = channel.slug === 'yiu-qualy-ai-demo' ? UNIVERSITY_DEMO_LOGO_URL : null

    return (
        <NextIntlClientProvider locale={locale} messages={messages}>
            <DemoChatClient
                slug={channel.slug}
                displayName={channel.displayName}
                logoUrl={channel.logoUrl || defaultLogoUrl}
            />
        </NextIntlClientProvider>
    )
}
