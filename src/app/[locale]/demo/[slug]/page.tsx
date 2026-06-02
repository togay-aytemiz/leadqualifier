import { NextIntlClientProvider } from 'next-intl'
import { cookies } from 'next/headers'
import { setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { DemoChatClient } from '@/components/demo-chat/DemoChatClient'
import { DemoMaintenanceScreen } from '@/components/demo-chat/DemoMaintenanceScreen'
import { createDemoChatAccessToken } from '@/lib/demo-chat/access'
import { resolveDemoChatChannel } from '@/lib/demo-chat/channel'
import {
    DEMO_MAINTENANCE_BYPASS_COOKIE,
    DEMO_MAINTENANCE_BYPASS_PARAM,
    shouldServeDemoMaintenance,
} from '@/lib/demo-chat/maintenance'
import { getScopedMessages } from '@/i18n/messages'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const UNIVERSITY_DEMO_LOGO_URL = '/yuksek-ihtisas-universitesi.png'

type DemoChatPageProps = {
    params: Promise<{
        locale: string
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

function buildMaintenanceBypassRedirect(locale: string, slug: string, bypassValue: string) {
    const params = new URLSearchParams()
    params.set(DEMO_MAINTENANCE_BYPASS_PARAM, bypassValue)
    params.set('next', `/${locale}/demo/${slug}`)
    return `/api/demo/maintenance-bypass?${params.toString()}`
}

function renderMaintenanceScreen(messages: DemoMaintenanceMessages) {
    return (
        <DemoMaintenanceScreen
            kicker={messages.maintenanceKicker}
            title={messages.maintenanceTitle}
            description={messages.maintenanceDescription}
            logoAlt={messages.maintenanceLogoAlt}
            imageAlt={messages.maintenanceImageAlt}
        />
    )
}

export default async function DemoChatPage({ params, searchParams }: DemoChatPageProps) {
    const { locale, slug } = await params
    setRequestLocale(locale)

    const resolvedSearchParams = searchParams ? await searchParams : {}
    const bypassValue = readSearchParamValue(resolvedSearchParams, DEMO_MAINTENANCE_BYPASS_PARAM)
    if (bypassValue !== null) {
        redirect(buildMaintenanceBypassRedirect(locale, slug, bypassValue))
    }

    const messages = await getScopedMessages(locale, ['demoChat'])
    const cookieStore = await cookies()
    const bypassCookieValue = cookieStore.get(DEMO_MAINTENANCE_BYPASS_COOKIE)?.value ?? null
    if (shouldServeDemoMaintenance({
        bypassCookieValue,
    })) {
        return renderMaintenanceScreen(messages.demoChat as DemoMaintenanceMessages)
    }

    const supabase = createServiceClient()
    const channel = await resolveDemoChatChannel({ supabase, slug })
    if (!channel) {
        notFound()
    }

    if (shouldServeDemoMaintenance({
        channelMaintenanceEnabled: channel.maintenanceEnabled,
        bypassCookieValue,
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
            />
        </NextIntlClientProvider>
    )
}
