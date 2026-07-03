import { NextIntlClientProvider } from 'next-intl'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { DemoChatClient } from '@/components/demo-chat/DemoChatClient'
import { DemoMaintenanceScreen } from '@/components/demo-chat/DemoMaintenanceScreen'
import { createDemoChatAccessToken } from '@/lib/demo-chat/access'
import { resolveDemoChatChannel } from '@/lib/demo-chat/channel'
import { shouldServeDemoMaintenance } from '@/lib/demo-chat/maintenance'
import { getScopedMessages } from '@/i18n/messages'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const UNIVERSITY_DEMO_LOGO_URL = '/yuksek-ihtisas-universitesi.png'
const SUPPORTED_LOCALES = new Set(['tr', 'en'])

type DemoChatEmbedPageProps = {
    params: Promise<{
        slug: string
    }>
    searchParams?: Promise<Record<string, string | string[] | undefined>>
}

type DemoMaintenanceMessages = {
    maintenanceKicker: string
    maintenanceTitle: string
    maintenanceDescription: string
    maintenanceLogoAlt: string
    maintenanceImageAlt: string
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

function readSearchParamValue(
    searchParams: Record<string, string | string[] | undefined>,
    key: string
) {
    const value = searchParams[key]
    if (Array.isArray(value)) return value[0] ?? null
    return value ?? null
}

function resolveLocale(searchParams: Record<string, string | string[] | undefined>) {
    const locale = readSearchParamValue(searchParams, 'locale')?.toLowerCase() ?? 'tr'
    return SUPPORTED_LOCALES.has(locale) ? locale : 'tr'
}

function renderMaintenanceScreen(messages: DemoMaintenanceMessages) {
    return (
        <div className="h-dvh overflow-hidden bg-[#f7f8f4]">
            <DemoMaintenanceScreen
                kicker={messages.maintenanceKicker}
                title={messages.maintenanceTitle}
                description={messages.maintenanceDescription}
                logoAlt={messages.maintenanceLogoAlt}
                imageAlt={messages.maintenanceImageAlt}
            />
        </div>
    )
}

export default async function DemoChatEmbedPage({ params, searchParams }: DemoChatEmbedPageProps) {
    const { slug } = await params
    const resolvedSearchParams = searchParams ? await searchParams : {}
    const locale = resolveLocale(resolvedSearchParams)
    const messages = await getScopedMessages(locale, ['demoChat'])

    if (shouldServeDemoMaintenance({})) {
        return renderMaintenanceScreen(messages.demoChat as DemoMaintenanceMessages)
    }

    const supabase = createServiceClient()
    const channel = await resolveDemoChatChannel({ supabase, slug })
    if (!channel) {
        notFound()
    }

    if (shouldServeDemoMaintenance({
        channelMaintenanceEnabled: channel.maintenanceEnabled,
    })) {
        return renderMaintenanceScreen(messages.demoChat as DemoMaintenanceMessages)
    }

    const defaultLogoUrl = channel.slug === 'yiu-qualy-ai-demo' ? UNIVERSITY_DEMO_LOGO_URL : null
    const accessToken = createDemoChatAccessToken({ channel })
    if (!accessToken) {
        notFound()
    }

    return (
        <NextIntlClientProvider locale={locale} messages={messages}>
            <DemoChatClient
                slug={channel.slug}
                displayName={channel.displayName}
                logoUrl={channel.logoUrl || defaultLogoUrl}
                accessToken={accessToken}
                mode="embed"
            />
        </NextIntlClientProvider>
    )
}
