import { NextIntlClientProvider } from 'next-intl'
import { WebWidgetChatClient } from '@/components/web-widget/WebWidgetChatClient'
import { getScopedMessages } from '@/i18n/messages'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const SUPPORTED_LOCALES = new Set(['tr', 'en'])

type WebWidgetEmbedPageProps = {
    params: Promise<{
        organizationId: string
    }>
    searchParams?: Promise<Record<string, string | string[] | undefined>>
}

type WebWidgetMessages = {
    defaultSubtitle: string
    composerDisclaimer: string
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

function readBooleanSearchParam(
    searchParams: Record<string, string | string[] | undefined>,
    key: string,
    fallback: boolean
) {
    const value = readSearchParamValue(searchParams, key)
    if (value === '1') return true
    if (value === '0') return false
    return fallback
}

function normalizeThemeColor(value: string | null) {
    return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#0f766e'
}

export default async function WebWidgetEmbedPage({ params, searchParams }: WebWidgetEmbedPageProps) {
    const { organizationId } = await params
    const resolvedSearchParams = searchParams ? await searchParams : {}
    const locale = resolveLocale(resolvedSearchParams)
    const messages = await getScopedMessages(locale, ['webWidget'])
    const webWidgetMessages = messages.webWidget as WebWidgetMessages
    const title = readSearchParamValue(resolvedSearchParams, 'title') ?? 'Qualy'
    const subtitle = readSearchParamValue(resolvedSearchParams, 'subtitle') ?? webWidgetMessages.defaultSubtitle
    const logoUrl = readSearchParamValue(resolvedSearchParams, 'logoUrl')
    const themeColor = normalizeThemeColor(readSearchParamValue(resolvedSearchParams, 'themeColor'))
    const showLogo = readBooleanSearchParam(resolvedSearchParams, 'showLogo', true)
    const showHeaderSubtitle = readBooleanSearchParam(resolvedSearchParams, 'showHeaderSubtitle', true)
    const showFooter = readBooleanSearchParam(resolvedSearchParams, 'showFooter', true)
    const footerText = readSearchParamValue(resolvedSearchParams, 'footerText') ?? webWidgetMessages.composerDisclaimer

    return (
        <NextIntlClientProvider locale={locale} messages={messages}>
            <WebWidgetChatClient
                organizationId={organizationId}
                title={title}
                subtitle={subtitle}
                logoUrl={logoUrl}
                themeColor={themeColor}
                showLogo={showLogo}
                showHeaderSubtitle={showHeaderSubtitle}
                showFooter={showFooter}
                footerText={footerText}
            />
        </NextIntlClientProvider>
    )
}
