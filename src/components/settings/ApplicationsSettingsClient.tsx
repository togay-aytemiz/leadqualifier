'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Alert, Badge, Button, PageHeader } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { updateBookingSettingsAction } from '@/lib/calendar/actions'
import {
    buildCalendarSettingsDraft,
    isCalendarAppsSettingsDirty,
    type CalendarSettingsDraft
} from '@/lib/calendar/settings-surface'
import { cn } from '@/lib/utils'
import type { BookingSettings } from '@/types/database'

interface ApplicationsSettingsClientProps {
    initialSettings: BookingSettings | null
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
    isReadOnly = false
}: ApplicationsSettingsClientProps) {
    const t = useTranslations('calendar')
    const tSidebar = useTranslations('Sidebar')
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const baselineSettingsDraft = useMemo(() => buildCalendarSettingsDraft(initialSettings), [initialSettings])
    const [settingsDraft, setSettingsDraft] = useState<CalendarSettingsDraft>(() => baselineSettingsDraft)
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
    const googleApplicationsSurfaceAvailable = false

    useEffect(() => {
        setSettingsDraft(baselineSettingsDraft)
    }, [baselineSettingsDraft])

    const isDirty = useMemo(
        () => isCalendarAppsSettingsDirty(baselineSettingsDraft, settingsDraft),
        [baselineSettingsDraft, settingsDraft]
    )

    const saveGoogleSettings = () => {
        if (!isDirty) return

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

    return (
        <>
            <PageHeader
                title={tSidebar('apps')}
                actions={(
                    <Button onClick={saveGoogleSettings} disabled={isPending || isReadOnly || !isDirty}>
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
                                            <StatusDot connected={false} />
                                            <p className="text-sm font-semibold text-gray-900">
                                                {t('apps.googleStatusTitle')}
                                            </p>
                                        </div>
                                        <p className="mt-2 text-sm leading-6 text-gray-500">
                                            {t('apps.googleComingSoonDescription')}
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <Badge variant="warning">{t('apps.googleComingSoon')}</Badge>
                                    </div>
                                </div>
                            </div>

                            <ToggleCard
                                title={t('settings.googleBusyOverlay')}
                                description={t('settings.googleBusyOverlayHelp')}
                                checked={settingsDraft.googleBusyOverlayEnabled}
                                disabled={isPending || isReadOnly || !googleApplicationsSurfaceAvailable}
                                onChange={(nextValue) => setSettingsDraft((current) => ({ ...current, googleBusyOverlayEnabled: nextValue }))}
                            />

                            <ToggleCard
                                title={t('settings.googleWriteThrough')}
                                description={t('settings.googleWriteThroughHelp')}
                                checked={settingsDraft.googleWriteThroughEnabled}
                                disabled={isPending || isReadOnly || !googleApplicationsSurfaceAvailable}
                                onChange={(nextValue) => setSettingsDraft((current) => ({ ...current, googleWriteThroughEnabled: nextValue }))}
                            />
                        </div>
                    </SettingsSection>
                </div>
            </div>
        </>
    )
}
