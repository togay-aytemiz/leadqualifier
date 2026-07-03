'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, ImagePlus, LoaderCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { ChannelOnboardingShell } from '@/components/channels/ChannelOnboardingShell'
import { Button } from '@/design'
import { createClient } from '@/lib/supabase/client'
import { prepareWebWidgetLogoUpload } from '@/lib/channels/web-widget-actions'
import {
    validateWebWidgetLogoFile,
    WEB_WIDGET_LOGO_ACCEPT,
} from '@/lib/channels/web-widget-assets'

interface WebOnboardingPageProps {
    organizationId: string
    organizationName: string
    botName: string
    isReadOnly?: boolean
}

function getLocalizedHref(locale: string, href: string) {
    if (locale === 'tr') return href
    return `/${locale}${href}`
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function buildScriptTag(options: {
    origin: string
    organizationId: string
    locale: string
    title: string
    subtitle: string
    openLabel: string
    logoUrl: string
    themeColor: string
    showLogo: boolean
    showLauncherText: boolean
    showLauncherSubtitle: boolean
    showHeaderSubtitle: boolean
    showFooter: boolean
    footerText: string
}) {
    const attrs = [
        'async',
        `src="${options.origin}/embed/web/${encodeURIComponent(options.organizationId)}/widget.js"`,
        `data-qualy-locale="${escapeHtml(options.locale)}"`,
        `data-qualy-title="${escapeHtml(options.title)}"`,
        `data-qualy-subtitle="${escapeHtml(options.subtitle)}"`,
        `data-qualy-open-label="${escapeHtml(options.openLabel)}"`,
        `data-qualy-theme-color="${escapeHtml(options.themeColor)}"`,
        `data-qualy-show-logo="${options.showLogo ? '1' : '0'}"`,
        `data-qualy-show-launcher-text="${options.showLauncherText ? '1' : '0'}"`,
        `data-qualy-show-launcher-subtitle="${options.showLauncherSubtitle ? '1' : '0'}"`,
        `data-qualy-show-header-subtitle="${options.showHeaderSubtitle ? '1' : '0'}"`,
        `data-qualy-show-footer="${options.showFooter ? '1' : '0'}"`,
        `data-qualy-footer-text="${escapeHtml(options.footerText)}"`,
    ]
    const logoUrl = options.logoUrl.trim()
    if (logoUrl) {
        attrs.push(`data-qualy-logo-url="${escapeHtml(logoUrl)}"`)
    }

    return `<script ${attrs.join(' ')}></script>`
}

function buildPreviewSrcDoc(scriptTag: string, title: string, body: string) {
    return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body{margin:0;min-height:100vh;background:#f5f7fb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a}
    main{padding:28px}
    h1{margin:0;font-size:22px;line-height:1.2}
    p{max-width:440px;margin:10px 0 0;color:#64748b;font-size:14px;line-height:1.6}
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(body)}</p>
  </main>
  ${scriptTag}
</body>
</html>`
}

function buildDefaultTitle(botName: string, organizationName: string) {
    const name = botName.trim() || organizationName.trim()
    return name ? `${name} Asistanı` : 'Qualy Asistanı'
}

function buildDefaultOpenLabel(organizationName: string) {
    const name = organizationName.trim()
    return name ? `${name}'ye sor` : 'Bize sor'
}

const DEFAULT_THEME_COLOR = '#0f766e'
const PUBLIC_WIDGET_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.askqualy.com').replace(/\/$/, '')
const themeSwatches = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#111827']

export function WebOnboardingPage({
    organizationId,
    organizationName,
    botName,
    isReadOnly = false,
}: WebOnboardingPageProps) {
    const t = useTranslations('Channels')
    const locale = useLocale()
    const supabase = useMemo(() => createClient(), [])
    const webDefaults = t.raw('onboarding.web.defaults') as {
        subtitle?: string
        footerText?: string
    }
    const [origin, setOrigin] = useState('')
    const [title, setTitle] = useState(() => buildDefaultTitle(botName, organizationName))
    const [subtitle, setSubtitle] = useState(() => webDefaults.subtitle || t('onboarding.web.defaults.subtitle'))
    const [openLabel, setOpenLabel] = useState(() => buildDefaultOpenLabel(organizationName))
    const [themeColor, setThemeColor] = useState(DEFAULT_THEME_COLOR)
    const [showLogo, setShowLogo] = useState(true)
    const [showLauncherText, setShowLauncherText] = useState(true)
    const [showLauncherSubtitle, setShowLauncherSubtitle] = useState(true)
    const [showHeaderSubtitle, setShowHeaderSubtitle] = useState(true)
    const [showFooter, setShowFooter] = useState(true)
    const [footerText, setFooterText] = useState(() => webDefaults.footerText || t('onboarding.web.defaults.footerText'))
    const [logoUrl, setLogoUrl] = useState('')
    const [logoError, setLogoError] = useState<string | null>(null)
    const [logoStatus, setLogoStatus] = useState<string | null>(null)
    const [isLogoUploading, setIsLogoUploading] = useState(false)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        setOrigin(window.location.origin)
    }, [])

    const scriptTag = useMemo(() => buildScriptTag({
        origin: PUBLIC_WIDGET_ORIGIN,
        organizationId,
        locale,
        title,
        subtitle,
        openLabel,
        logoUrl,
        themeColor,
        showLogo,
        showLauncherText,
        showLauncherSubtitle,
        showHeaderSubtitle,
        showFooter,
        footerText,
    }), [
        footerText,
        locale,
        logoUrl,
        openLabel,
        organizationId,
        showFooter,
        showHeaderSubtitle,
        showLauncherSubtitle,
        showLauncherText,
        showLogo,
        subtitle,
        themeColor,
        title,
    ])

    const previewScriptTag = useMemo(() => buildScriptTag({
        origin: origin || PUBLIC_WIDGET_ORIGIN,
        organizationId,
        locale,
        title,
        subtitle,
        openLabel,
        logoUrl,
        themeColor,
        showLogo,
        showLauncherText,
        showLauncherSubtitle,
        showHeaderSubtitle,
        showFooter,
        footerText,
    }), [
        footerText,
        locale,
        logoUrl,
        openLabel,
        organizationId,
        origin,
        showFooter,
        showHeaderSubtitle,
        showLauncherSubtitle,
        showLauncherText,
        showLogo,
        subtitle,
        themeColor,
        title,
    ])

    const previewSrcDoc = useMemo(() => buildPreviewSrcDoc(
        previewScriptTag,
        t('onboarding.web.previewHostTitle'),
        t('onboarding.web.previewHostBody')
    ), [previewScriptTag, t])

    const handleCopy = async () => {
        await navigator.clipboard.writeText(scriptTag)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
    }

    const handleLogoSelect = async (file: File | null) => {
        if (!file || isLogoUploading || isReadOnly) return

        const validationError = validateWebWidgetLogoFile(file)
        if (validationError) {
            setLogoStatus(null)
            setLogoError(
                validationError === 'file_too_large'
                    ? t('onboarding.web.logoFileTooLarge')
                    : t('onboarding.web.logoInvalidType')
            )
            return
        }

        setIsLogoUploading(true)
        setLogoError(null)
        setLogoStatus(null)

        try {
            const prepareResult = await prepareWebWidgetLogoUpload({
                organizationId,
                mimeType: file.type,
            })
            if (!prepareResult.ok) {
                throw new Error(prepareResult.reason)
            }

            const { error: uploadError } = await supabase.storage
                .from(prepareResult.bucket)
                .uploadToSignedUrl(prepareResult.storagePath, prepareResult.uploadToken, file)

            if (uploadError) throw uploadError

            setLogoUrl(prepareResult.publicUrl)
            setLogoStatus(t('onboarding.web.logoUploaded'))
        } catch (error) {
            console.error(error)
            setLogoError(t('onboarding.web.logoUploadFailed'))
        } finally {
            setIsLogoUploading(false)
        }
    }

    const inputClass = 'mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20'
    const labelClass = 'text-sm font-medium text-slate-800'
    const helpClass = 'mt-1 text-xs leading-5 text-slate-500'
    const toggleClass = 'flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2'

    return (
        <ChannelOnboardingShell
            channelType="web"
            pageTitle={t('onboarding.pageTitle', { channel: t('types.web') })}
            backHref={getLocalizedHref(locale, '/settings/channels')}
            backLabel={t('onboarding.back')}
            contentClassName="max-w-7xl"
        >
            <div className="grid gap-5 xl:grid-cols-[minmax(420px,0.78fr)_minmax(680px,1.22fr)]">
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div>
                        <h2 className="text-lg font-semibold leading-tight text-slate-950">
                            {t('onboarding.web.heading')}
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                            {t('onboarding.web.subheading')}
                        </p>
                    </div>

                    <div className="mt-5 space-y-4">
                        <label className="block">
                            <span className={labelClass}>{t('onboarding.web.fields.title')}</span>
                            <input className={inputClass} value={title} disabled={isReadOnly} onChange={(event) => setTitle(event.target.value)} />
                        </label>

                        <label className="block">
                            <span className={labelClass}>{t('onboarding.web.fields.subtitle')}</span>
                            <input className={inputClass} value={subtitle} disabled={isReadOnly} onChange={(event) => setSubtitle(event.target.value)} />
                        </label>

                        <label className="block">
                            <span className={labelClass}>{t('onboarding.web.fields.openLabel')}</span>
                            <input className={inputClass} value={openLabel} disabled={isReadOnly} onChange={(event) => setOpenLabel(event.target.value)} />
                            <span className={helpClass}>{t('onboarding.web.fields.openLabelHelp', { name: organizationName })}</span>
                        </label>

                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                            <div className="flex items-center justify-between gap-3">
                                <span className={labelClass}>{t('onboarding.web.fields.themeColor')}</span>
                                <input
                                    type="color"
                                    value={themeColor}
                                    disabled={isReadOnly}
                                    aria-label={t('onboarding.web.fields.themeColor')}
                                    onChange={(event) => setThemeColor(event.target.value)}
                                    className="h-9 w-12 cursor-pointer rounded border border-slate-200 bg-white p-1 disabled:cursor-not-allowed"
                                />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {themeSwatches.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        disabled={isReadOnly}
                                        aria-label={t('onboarding.web.fields.themeColorSwatch', { color })}
                                        onClick={() => setThemeColor(color)}
                                        className={`h-7 w-7 rounded-full border transition-transform hover:scale-105 disabled:cursor-not-allowed ${themeColor === color ? 'border-slate-950 ring-2 ring-slate-300' : 'border-white'}`}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                        </div>

                        <div>
                            <span className={labelClass}>{t('onboarding.web.fields.logoUpload')}</span>
                            <div className="mt-2 flex flex-wrap items-center gap-3">
                                <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full border border-slate-200 bg-slate-50">
                                    {logoUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        <span className="text-sm font-semibold text-slate-500">{t('onboarding.web.logoFallbackMark')}</span>
                                    )}
                                </div>
                                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                                    <input
                                        type="file"
                                        accept={WEB_WIDGET_LOGO_ACCEPT}
                                        aria-label={t('onboarding.web.fields.logoUpload')}
                                        className="sr-only"
                                        disabled={isReadOnly || isLogoUploading}
                                        onChange={(event) => {
                                            const nextFile = event.currentTarget.files?.[0] ?? null
                                            event.currentTarget.value = ''
                                            void handleLogoSelect(nextFile)
                                        }}
                                    />
                                    {isLogoUploading ? <LoaderCircle size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                                    {isLogoUploading ? t('onboarding.web.logoUploading') : t('onboarding.web.logoUpload')}
                                </label>
                            </div>
                            <p className={helpClass}>{t('onboarding.web.fields.logoUploadHelp')}</p>
                            {logoError && <p className="mt-2 text-sm text-red-600">{logoError}</p>}
                            {logoStatus && !logoError && <p className="mt-2 text-sm text-green-600">{logoStatus}</p>}
                        </div>

                        <div className="space-y-2">
                            <span className={labelClass}>{t('onboarding.web.appearanceTitle')}</span>
                            {[
                                ['showLogo', showLogo, setShowLogo],
                                ['showLauncherText', showLauncherText, setShowLauncherText],
                                ['showLauncherSubtitle', showLauncherSubtitle, setShowLauncherSubtitle],
                                ['showHeaderSubtitle', showHeaderSubtitle, setShowHeaderSubtitle],
                                ['showFooter', showFooter, setShowFooter],
                            ].map(([key, checked, setter]) => (
                                <label key={key as string} className={toggleClass}>
                                    <span className="text-sm text-slate-700">
                                        {t(`onboarding.web.toggles.${key}`)}
                                    </span>
                                    <input
                                        type="checkbox"
                                        checked={checked as boolean}
                                        disabled={isReadOnly}
                                        onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)}
                                        className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                    />
                                </label>
                            ))}
                        </div>

                        <label className="block">
                            <span className={labelClass}>{t('onboarding.web.fields.footerText')}</span>
                            <textarea
                                className="mt-1.5 min-h-[76px] w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-5 text-slate-900 outline-none transition-colors focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                                value={footerText}
                                disabled={isReadOnly}
                                onChange={(event) => setFooterText(event.target.value)}
                            />
                            <span className={helpClass}>{t('onboarding.web.fields.footerTextHelp')}</span>
                        </label>
                    </div>
                </section>

                <section className="space-y-5">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold leading-tight text-slate-950">
                                    {t('onboarding.web.snippetTitle')}
                                </h2>
                                <p className="mt-1 text-sm leading-6 text-slate-600">
                                    {t('onboarding.web.snippetDescription')}
                                </p>
                            </div>
                            <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
                                {copied ? <Check size={16} /> : <Copy size={16} />}
                                {copied ? t('onboarding.web.copied') : t('onboarding.web.copy')}
                            </Button>
                        </div>
                        <textarea
                            readOnly
                            value={scriptTag}
                            className="mt-4 min-h-[168px] w-full resize-none rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100 outline-none"
                        />
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h2 className="text-lg font-semibold leading-tight text-slate-950">
                            {t('onboarding.web.previewTitle')}
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                            {t('onboarding.web.previewDescription')}
                        </p>
                        <iframe
                            key={previewScriptTag}
                            title={t('onboarding.web.previewTitle')}
                            srcDoc={previewSrcDoc}
                            className="mt-4 h-[620px] w-full rounded-xl border border-slate-200 bg-slate-50"
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                        />
                    </div>
                </section>
            </div>
        </ChannelOnboardingShell>
    )
}
