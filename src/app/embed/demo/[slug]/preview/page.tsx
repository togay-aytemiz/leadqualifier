import Script from 'next/script'
import { getScopedMessages } from '@/i18n/messages'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type DemoChatWidgetPreviewPageProps = {
    params: Promise<{
        slug: string
    }>
    searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function readSearchParamValue(
    searchParams: Record<string, string | string[] | undefined>,
    key: string
) {
    const value = searchParams[key]
    if (Array.isArray(value)) return value[0] ?? null
    return value ?? null
}

function escapeAttribute(value: string) {
    return value.replace(/"/g, '&quot;')
}

type DemoChatWidgetPreviewMessages = {
    widgetPreviewKicker: string
    widgetPreviewTitle: string
    widgetPreviewBody: string
    widgetPreviewSlugLabel: string
}

export default async function DemoChatWidgetPreviewPage({
    params,
    searchParams,
}: DemoChatWidgetPreviewPageProps) {
    const { slug } = await params
    const resolvedSearchParams = searchParams ? await searchParams : {}
    const locale = readSearchParamValue(resolvedSearchParams, 'locale') ?? 'tr'
    const messages = await getScopedMessages(locale, ['demoChat'])
    const previewMessages = messages.demoChat as DemoChatWidgetPreviewMessages
    const scriptSrc = `/embed/demo/${encodeURIComponent(slug)}/widget.js`

    return (
        <main className="min-h-dvh bg-[#f5f7fb] px-6 py-8 text-slate-950">
            <section className="mx-auto max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
                    {previewMessages.widgetPreviewKicker}
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-normal text-slate-950">
                    {previewMessages.widgetPreviewTitle}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                    {previewMessages.widgetPreviewBody}
                </p>
                <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-sm font-medium text-slate-900">{previewMessages.widgetPreviewSlugLabel}</p>
                    <code className="mt-2 block rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
                        {slug}
                    </code>
                </div>
            </section>
            <Script
                id={`qualy-demo-widget-${slug}`}
                strategy="afterInteractive"
                async
                src={scriptSrc}
                data-qualy-locale={escapeAttribute(locale)}
                data-qualy-title="YİÜ Aday Asistanı"
                data-qualy-open-label="YİÜ’ye sor"
                data-qualy-subtitle="Tanıtım günleri asistanı"
            />
        </main>
    )
}
