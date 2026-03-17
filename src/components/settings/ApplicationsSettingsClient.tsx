'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Alert, Button, PageHeader } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import {
    disconnectGoogleCalendarAction,
    updateBookingSettingsAction
} from '@/lib/calendar/actions'
import {
    buildCalendarSettingsDraft,
    resolveGoogleConnectionSummary,
    type CalendarSettingsDraft
} from '@/lib/calendar/settings-surface'
import { cn } from '@/lib/utils'
import type { BookingSettings, CalendarConnection } from '@/types/database'

interface ApplicationsSettingsClientProps {
    initialSettings: BookingSettings | null
    initialConnection: CalendarConnection | null
    isReadOnly?: boolean
}

interface ToggleCardProps {
    title: string
    description: string
    checked: boolean
    disabled?: boolean
    onChange: (nextValue: boolean) => void
}

function ToggleCard({ title, description, checked, disabled = false, onChange }: ToggleCardProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                'flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-4 text-left transition-colors',
                checked
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
                disabled ? 'cursor-not-allowed opacity-60' : ''
            )}
        >
            <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{title}</p>
                <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>
            </div>
            <span
                className={cn(
                    'relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors',
                    checked ? 'bg-blue-500' : 'bg-gray-300'
                )}
            >
                <span
                    className={cn(
                        'absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                        checked ? 'translate-x-6' : 'translate-x-1'
                    )}
                />
            </span>
        </button>
    )
}

function StatusDot({ connected }: { connected: boolean }) {
    return (
        <span
            className={cn(
                'inline-flex h-2.5 w-2.5 rounded-full',
                connected ? 'bg-emerald-500' : 'bg-amber-500'
            )}
        />
    )
}

export function ApplicationsSettingsClient({
    initialSettings,
    initialConnection,
    isReadOnly = false
}: ApplicationsSettingsClientProps) {
    const locale = useLocale()
    const t = useTranslations('calendar')
    const tSidebar = useTranslations('Sidebar')
    const searchParams = useSearchParams()
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [settingsDraft, setSettingsDraft] = useState<CalendarSettingsDraft>(() => buildCalendarSettingsDraft(initialSettings))
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)

    useEffect(() => {
        setSettingsDraft(buildCalendarSettingsDraft(initialSettings))
    }, [initialSettings])

    useEffect(() => {
        const googleStatus = searchParams.get('google_calendar')
        if (!googleStatus) return

        const googleErrorCode = searchParams.get('google_calendar_error')
        setFeedback({
            type: googleStatus === 'success' ? 'success' : 'error',
            message: `${t(`googleStatus.${googleStatus}`)}${googleErrorCode ? ` (${googleErrorCode})` : ''}`
        })
    }, [searchParams, t])

    const googleSummary = useMemo(() => resolveGoogleConnectionSummary(initialConnection, settingsDraft), [initialConnection, settingsDraft])
    const returnToPath = locale === 'en' ? '/en/settings/apps' : '/settings/apps'
    const googleConnectHref = `/api/calendar/google/start?locale=${locale}&returnTo=${encodeURIComponent(returnToPath)}`

    const saveGoogleSettings = () => {
        if (isReadOnly) {
            setFeedback({ type: 'error', message: t('readOnlyBanner') })
            return
        }

        startTransition(() => {
            void (async () => {
                try {
                    await updateBookingSettingsAction({
                        google_busy_overlay_enabled: settingsDraft.googleBusyOverlayEnabled,
                        google_write_through_enabled: settingsDraft.googleWriteThroughEnabled
                    })

                    setFeedback({ type: 'success', message: t('messages.settingsSaved') })
                    router.refresh()
                } catch (error) {
                    setFeedback({
                        type: 'error',
                        message: error instanceof Error ? error.message : t('messages.saveFailed')
                    })
                }
            })()
        })
    }

    const disconnectGoogleCalendar = () => {
        if (isReadOnly) {
            setFeedback({ type: 'error', message: t('readOnlyBanner') })
            return
        }

        startTransition(() => {
            void (async () => {
                try {
                    await disconnectGoogleCalendarAction()
                    setFeedback({ type: 'success', message: t('messages.googleDisconnected') })
                    router.refresh()
                } catch (error) {
                    setFeedback({
                        type: 'error',
                        message: error instanceof Error ? error.message : t('messages.saveFailed')
                    })
                }
            })()
        })
    }

    return (
        <>
            <PageHeader
                title={tSidebar('apps')}
                actions={(
                    <Button onClick={saveGoogleSettings} disabled={isPending || isReadOnly}>
                        {isPending ? t('actions.saving') : t('actions.saveSettings')}
                    </Button>
                )}
            />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-5xl">
                    {feedback && (
                        <Alert variant={feedback.type === 'success' ? 'success' : feedback.type === 'info' ? 'info' : 'error'}>
                            {feedback.message}
                        </Alert>
                    )}

                    {isReadOnly && (
                        <div className="mb-4">
                            <Alert variant="warning">{t('readOnlyBanner')}</Alert>
                        </div>
                    )}

                    <SettingsSection
                        title={t('apps.googleTitle')}
                        description={t('apps.googleDescription')}
                        showBottomDivider={false}
                        layout="wide"
                    >
                        <div className="space-y-4">
                            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <StatusDot connected={googleSummary.connected} />
                                            <p className="text-sm font-semibold text-gray-900">
                                                {googleSummary.connected ? t('summary.connected') : t('summary.notConnected')}
                                            </p>
                                        </div>
                                        <p className="mt-2 text-sm leading-6 text-gray-500">
                                            {googleSummary.connected
                                                ? t(`google.${googleSummary.mode === 'writeThrough' ? 'modeWriteThrough' : 'modeBusyOverlay'}`)
                                                : t('apps.googleDisconnected')}
                                        </p>
                                        {googleSummary.email && (
                                            <p className="mt-2 text-xs font-medium text-gray-500">{googleSummary.email}</p>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {googleSummary.connected ? (
                                            <Button
                                                size="sm"
                                                variant="danger"
                                                className="shrink-0 whitespace-nowrap"
                                                onClick={disconnectGoogleCalendar}
                                                disabled={isPending || isReadOnly}
                                            >
                                                {t('actions.disconnect')}
                                            </Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                className="shrink-0 whitespace-nowrap"
                                                onClick={() => window.location.assign(googleConnectHref)}
                                                disabled={isPending || isReadOnly}
                                            >
                                                {t('actions.connect')}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <ToggleCard
                                title={t('settings.googleBusyOverlay')}
                                description={t('settings.googleBusyOverlayHelp')}
                                checked={settingsDraft.googleBusyOverlayEnabled}
                                disabled={isPending || isReadOnly || !googleSummary.connected}
                                onChange={(nextValue) => setSettingsDraft((current) => ({ ...current, googleBusyOverlayEnabled: nextValue }))}
                            />

                            <ToggleCard
                                title={t('settings.googleWriteThrough')}
                                description={t('settings.googleWriteThroughHelp')}
                                checked={settingsDraft.googleWriteThroughEnabled}
                                disabled={isPending || isReadOnly || !googleSummary.connected}
                                onChange={(nextValue) => setSettingsDraft((current) => ({ ...current, googleWriteThroughEnabled: nextValue }))}
                            />
                        </div>
                    </SettingsSection>
                </div>
            </div>
        </>
    )
}
