'use client'

import { type ReactNode, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Alert, Badge, Button, PageHeader } from '@/design'
import { Link } from '@/i18n/navigation'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import {
    replaceAvailabilityRulesAction,
    updateBookingSettingsAction,
    updateServiceCatalogDurationsAction
} from '@/lib/calendar/actions'
import { timeStringToMinutes } from '@/lib/calendar/presentation'
import {
    areCalendarAvailabilityDraftsEqual,
    areCalendarServiceDurationDraftsEqual,
    buildCalendarAvailabilityDraft,
    buildCalendarServiceDurationDraft,
    buildCalendarSettingsDraft,
    countCustomDurationServices,
    countEnabledAvailabilityDays,
    DAY_KEY_BY_INDEX,
    getCalendarSettingsSectionIds,
    isCalendarGeneralSettingsDirty,
    resolveGoogleConnectionSummary,
    type CalendarAvailabilityDraftRow,
    type CalendarSettingsDraft
} from '@/lib/calendar/settings-surface'
import { cn } from '@/lib/utils'
import type {
    BookingAvailabilityRule,
    BookingSettings,
    CalendarConnection,
    ServiceCatalogItem
} from '@/types/database'

type CalendarSettingsTabId = 'general' | 'availability' | 'serviceDurations'

interface CalendarSettingsClientProps {
    initialSettings: BookingSettings | null
    initialAvailabilityRules: BookingAvailabilityRule[]
    initialServices: ServiceCatalogItem[]
    initialConnection: CalendarConnection | null
    isReadOnly?: boolean
}

interface FieldInputProps {
    label: ReactNode
    value: string
    disabled?: boolean
    suffix?: string
    type?: 'text' | 'time'
    onChange: (value: string) => void
}

interface ToggleCardProps {
    title: string
    description: string
    checked: boolean
    disabled?: boolean
    onChange: (nextValue: boolean) => void
}

interface InfoTooltipProps {
    label: string
}

interface InlineSwitchProps {
    checked: boolean
    checkedLabel: string
    uncheckedLabel: string
    disabled?: boolean
    onChange: (nextValue: boolean) => void
}

interface CompactTimeFieldProps {
    label: string
    value: string
    disabled?: boolean
    onChange: (value: string) => void
}

function FieldInput({
    label,
    value,
    disabled = false,
    suffix,
    type = 'text',
    onChange
}: FieldInputProps) {
    return (
        <label className="block">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">{label}</span>
            <div className="relative mt-2">
                <input
                    type={type}
                    value={value}
                    disabled={disabled}
                    onChange={(event) => onChange(event.target.value)}
                    className={cn(
                        'h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-gray-400',
                        suffix ? 'pr-12' : '',
                        disabled ? 'cursor-not-allowed bg-gray-100 text-gray-500' : ''
                    )}
                />
                {suffix && (
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-gray-400">
                        {suffix}
                    </span>
                )}
            </div>
        </label>
    )
}

function InfoTooltip({ label }: InfoTooltipProps) {
    return (
        <span className="relative inline-flex group/calendar-tooltip">
            <button
                type="button"
                tabIndex={0}
                aria-label={label}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700"
            >
                {String.fromCharCode(105)}
            </button>
            <span
                role="tooltip"
                className={cn(
                    'pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-xl border border-gray-200 bg-gray-950 px-3 py-2 text-xs font-medium leading-5 text-white opacity-0 shadow-lg transition-all duration-150',
                    'translate-y-1 group-hover/calendar-tooltip:translate-y-0 group-hover/calendar-tooltip:opacity-100',
                    'group-focus-within/calendar-tooltip:translate-y-0 group-focus-within/calendar-tooltip:opacity-100'
                )}
            >
                {label}
            </span>
        </span>
    )
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
                    ? 'border-emerald-300 bg-emerald-50'
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
                    checked ? 'bg-emerald-500' : 'bg-gray-300'
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

function InlineSwitch({
    checked,
    checkedLabel,
    uncheckedLabel,
    disabled = false,
    onChange
}: InlineSwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                'inline-flex h-11 items-center justify-center gap-3 rounded-2xl border px-4 text-sm font-medium transition-colors',
                checked
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:bg-white',
                disabled ? 'cursor-not-allowed opacity-60' : ''
            )}
        >
            <span>{checked ? checkedLabel : uncheckedLabel}</span>
            <span
                className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors',
                    checked ? 'bg-emerald-500' : 'bg-gray-300'
                )}
            >
                <span
                    className={cn(
                        'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                        checked ? 'translate-x-5' : 'translate-x-0.5'
                    )}
                />
            </span>
        </button>
    )
}

function CompactTimeField({
    label,
    value,
    disabled = false,
    onChange
}: CompactTimeFieldProps) {
    return (
        <label
            className={cn(
                'flex h-11 items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 transition-colors',
                disabled ? 'cursor-not-allowed bg-gray-50 text-gray-400' : 'hover:border-gray-300'
            )}
        >
            <span className={cn('text-xs font-semibold', disabled ? 'text-gray-400' : 'text-gray-500')}>{label}</span>
            <input
                type="time"
                value={value}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
                className={cn(
                    'w-20 border-0 bg-transparent p-0 text-right text-sm font-semibold text-gray-900 outline-none',
                    disabled ? 'cursor-not-allowed text-gray-400' : ''
                )}
            />
        </label>
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

export function CalendarSettingsClient({
    initialSettings,
    initialAvailabilityRules,
    initialServices,
    initialConnection,
    isReadOnly = false
}: CalendarSettingsClientProps) {
    const t = useTranslations('calendar')
    const tSidebar = useTranslations('Sidebar')
    const router = useRouter()
    const [activeTab, setActiveTab] = useState<CalendarSettingsTabId>('general')
    const [isPending, startTransition] = useTransition()
    const baselineSettingsDraft = useMemo(() => buildCalendarSettingsDraft(initialSettings), [initialSettings])
    const baselineAvailabilityDraft = useMemo(() => buildCalendarAvailabilityDraft(initialAvailabilityRules), [initialAvailabilityRules])
    const baselineServiceDurationDraft = useMemo(() => buildCalendarServiceDurationDraft(initialServices), [initialServices])
    const [settingsDraft, setSettingsDraft] = useState<CalendarSettingsDraft>(() => baselineSettingsDraft)
    const [availabilityDraft, setAvailabilityDraft] = useState<CalendarAvailabilityDraftRow[]>(() => baselineAvailabilityDraft)
    const [serviceDurationDraft, setServiceDurationDraft] = useState<Record<string, string>>(() => baselineServiceDurationDraft)
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)

    useEffect(() => {
        setSettingsDraft(baselineSettingsDraft)
    }, [baselineSettingsDraft])

    useEffect(() => {
        setAvailabilityDraft(baselineAvailabilityDraft)
    }, [baselineAvailabilityDraft])

    useEffect(() => {
        setServiceDurationDraft(baselineServiceDurationDraft)
    }, [baselineServiceDurationDraft])

    const enabledDayCount = useMemo(() => countEnabledAvailabilityDays(availabilityDraft), [availabilityDraft])
    const customDurationCount = useMemo(() => countCustomDurationServices(initialServices, serviceDurationDraft), [initialServices, serviceDurationDraft])
    const googleSummary = useMemo(() => resolveGoogleConnectionSummary(initialConnection, settingsDraft), [initialConnection, settingsDraft])
    const isGeneralDirty = useMemo(
        () => isCalendarGeneralSettingsDirty(baselineSettingsDraft, settingsDraft),
        [baselineSettingsDraft, settingsDraft]
    )
    const isAvailabilityDirty = useMemo(
        () => !areCalendarAvailabilityDraftsEqual(baselineAvailabilityDraft, availabilityDraft),
        [baselineAvailabilityDraft, availabilityDraft]
    )
    const isServiceDurationsDirty = useMemo(
        () => !areCalendarServiceDurationDraftsEqual(baselineServiceDurationDraft, serviceDurationDraft),
        [baselineServiceDurationDraft, serviceDurationDraft]
    )

    const tabs = useMemo(() => {
        return getCalendarSettingsSectionIds('settings').map((id) => ({
            id,
            label: t(`settings.tabs.${id}`)
        }))
    }, [t])

    const slotIntervalLabel = (
        <>
            <span>{t('settings.slotInterval')}</span>
            <InfoTooltip label={t('settings.fieldHints.slotInterval')} />
        </>
    )

    const minimumNoticeLabel = (
        <>
            <span>{t('settings.minimumNotice')}</span>
            <InfoTooltip label={t('settings.fieldHints.minimumNotice')} />
        </>
    )

    const bufferBeforeLabel = (
        <>
            <span>{t('settings.bufferBefore')}</span>
            <InfoTooltip label={t('settings.fieldHints.bufferBefore')} />
        </>
    )

    const bufferAfterLabel = (
        <>
            <span>{t('settings.bufferAfter')}</span>
            <InfoTooltip label={t('settings.fieldHints.bufferAfter')} />
        </>
    )

    const saveGeneralSettings = () => {
        if (!isGeneralDirty) return

        if (isReadOnly) {
            setFeedback({ type: 'error', message: t('readOnlyBanner') })
            return
        }

        try {
            new Intl.DateTimeFormat('en-US', { timeZone: settingsDraft.timezone }).format(new Date())
        } catch {
            setFeedback({ type: 'error', message: t('messages.invalidTimezone') })
            return
        }

        const defaultDuration = Number.parseInt(settingsDraft.defaultDuration, 10)
        const slotInterval = Number.parseInt(settingsDraft.slotInterval, 10)
        const minimumNotice = Number.parseInt(settingsDraft.minimumNotice, 10)
        const bufferBefore = Number.parseInt(settingsDraft.bufferBefore, 10)
        const bufferAfter = Number.parseInt(settingsDraft.bufferAfter, 10)

        if (
            !Number.isFinite(defaultDuration) || defaultDuration <= 0 ||
            !Number.isFinite(slotInterval) || slotInterval <= 0 ||
            !Number.isFinite(minimumNotice) || minimumNotice < 0 ||
            !Number.isFinite(bufferBefore) || bufferBefore < 0 ||
            !Number.isFinite(bufferAfter) || bufferAfter < 0
        ) {
            setFeedback({ type: 'error', message: t('messages.invalidNumericSettings') })
            return
        }

        startTransition(() => {
            void (async () => {
                try {
                    await updateBookingSettingsAction({
                        booking_enabled: settingsDraft.bookingEnabled,
                        timezone: settingsDraft.timezone.trim(),
                        default_booking_duration_minutes: defaultDuration,
                        slot_interval_minutes: slotInterval,
                        minimum_notice_minutes: minimumNotice,
                        buffer_before_minutes: bufferBefore,
                        buffer_after_minutes: bufferAfter
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

    const saveAvailability = () => {
        if (!isAvailabilityDirty) return

        if (isReadOnly) {
            setFeedback({ type: 'error', message: t('readOnlyBanner') })
            return
        }

        const activeRules = availabilityDraft
            .filter((rule) => rule.enabled)
            .map((rule) => ({
                day_of_week: rule.dayOfWeek,
                start_minute: timeStringToMinutes(rule.startTime),
                end_minute: timeStringToMinutes(rule.endTime),
                label: t(`days.${DAY_KEY_BY_INDEX[rule.dayOfWeek]}`),
                active: true
            }))

        if (activeRules.some((rule) => rule.end_minute <= rule.start_minute)) {
            setFeedback({ type: 'error', message: t('messages.invalidAvailabilityWindow') })
            return
        }

        startTransition(() => {
            void (async () => {
                try {
                    await replaceAvailabilityRulesAction(activeRules)
                    setFeedback({ type: 'success', message: t('messages.availabilitySaved') })
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

    const saveServiceDurations = () => {
        if (!isServiceDurationsDirty) return

        if (isReadOnly) {
            setFeedback({ type: 'error', message: t('readOnlyBanner') })
            return
        }

        const hasInvalidDuration = initialServices.some((service) => {
            const rawValue = serviceDurationDraft[service.id]?.trim()
            if (!rawValue) return false
            const parsed = Number.parseInt(rawValue, 10)
            return !Number.isFinite(parsed) || parsed <= 0
        })

        if (hasInvalidDuration) {
            setFeedback({ type: 'error', message: t('messages.invalidServiceDuration') })
            return
        }

        startTransition(() => {
            void (async () => {
                try {
                    await updateServiceCatalogDurationsAction(initialServices.map((service) => ({
                        serviceCatalogId: service.id,
                        durationMinutes: (() => {
                            const entry = serviceDurationDraft[service.id]?.trim()
                            return entry ? Number.parseInt(entry, 10) : null
                        })()
                    })))

                    setFeedback({ type: 'success', message: t('messages.serviceDurationsSaved') })
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

    const handleSave = () => {
        if (activeTab === 'availability') {
            saveAvailability()
            return
        }

        if (activeTab === 'serviceDurations') {
            saveServiceDurations()
            return
        }

        saveGeneralSettings()
    }

    const saveLabel = activeTab === 'availability'
        ? t('actions.saveAvailability')
        : activeTab === 'serviceDurations'
            ? t('actions.saveServiceDurations')
            : t('actions.saveSettings')
    const isActiveTabDirty = activeTab === 'availability'
        ? isAvailabilityDirty
        : activeTab === 'serviceDurations'
            ? isServiceDurationsDirty
            : isGeneralDirty

    return (
        <>
            <PageHeader
                title={tSidebar('calendar')}
                actions={(
                    <Button onClick={handleSave} disabled={isPending || isReadOnly || !isActiveTabDirty}>
                        {isPending ? t('actions.saving') : saveLabel}
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

                    <SettingsTabs
                        tabs={tabs}
                        activeTabId={activeTab}
                        onTabChange={(tabId) => setActiveTab(tabId as CalendarSettingsTabId)}
                    >
                        {(tabId) => (
                            <>
                                {tabId === 'general' && (
                                    <>
                                        <SettingsSection
                                            title={t('settings.bookingSectionTitle')}
                                            description={t('settings.bookingSectionDescription')}
                                            summary={t('summary.settingsHint', { days: enabledDayCount, services: customDurationCount })}
                                        >
                                            <div className="space-y-4">
                                                <ToggleCard
                                                    title={t('settings.bookingEnabled')}
                                                    description={t('settings.bookingEnabledHelp')}
                                                    checked={settingsDraft.bookingEnabled}
                                                    disabled={isPending || isReadOnly}
                                                    onChange={(nextValue) => setSettingsDraft((current) => ({ ...current, bookingEnabled: nextValue }))}
                                                />

                                                <div className="grid gap-3 md:grid-cols-2">
                                                    <FieldInput
                                                        label={t('settings.timezone')}
                                                        value={settingsDraft.timezone}
                                                        disabled={isPending || isReadOnly}
                                                        onChange={(value) => setSettingsDraft((current) => ({ ...current, timezone: value }))}
                                                    />
                                                    <FieldInput
                                                        label={t('settings.defaultDuration')}
                                                        value={settingsDraft.defaultDuration}
                                                        suffix={t('minutesShort')}
                                                        disabled={isPending || isReadOnly}
                                                        onChange={(value) => setSettingsDraft((current) => ({ ...current, defaultDuration: value }))}
                                                    />
                                                    <FieldInput
                                                        label={slotIntervalLabel}
                                                        value={settingsDraft.slotInterval}
                                                        suffix={t('minutesShort')}
                                                        disabled={isPending || isReadOnly}
                                                        onChange={(value) => setSettingsDraft((current) => ({ ...current, slotInterval: value }))}
                                                    />
                                                    <FieldInput
                                                        label={minimumNoticeLabel}
                                                        value={settingsDraft.minimumNotice}
                                                        suffix={t('minutesShort')}
                                                        disabled={isPending || isReadOnly}
                                                        onChange={(value) => setSettingsDraft((current) => ({ ...current, minimumNotice: value }))}
                                                    />
                                                    <FieldInput
                                                        label={bufferBeforeLabel}
                                                        value={settingsDraft.bufferBefore}
                                                        suffix={t('minutesShort')}
                                                        disabled={isPending || isReadOnly}
                                                        onChange={(value) => setSettingsDraft((current) => ({ ...current, bufferBefore: value }))}
                                                    />
                                                    <FieldInput
                                                        label={bufferAfterLabel}
                                                        value={settingsDraft.bufferAfter}
                                                        suffix={t('minutesShort')}
                                                        disabled={isPending || isReadOnly}
                                                        onChange={(value) => setSettingsDraft((current) => ({ ...current, bufferAfter: value }))}
                                                    />
                                                </div>
                                            </div>
                                        </SettingsSection>

                                        <SettingsSection
                                            title={t('settings.connectionTitle')}
                                            description={t('settings.connectionDescription')}
                                            showBottomDivider={false}
                                        >
                                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
                                                                : t('settings.connectionDisconnected')}
                                                        </p>
                                                        {googleSummary.email && (
                                                            <p className="mt-2 text-xs font-medium text-gray-500">{googleSummary.email}</p>
                                                        )}
                                                    </div>

                                                    <Link
                                                        href="/settings/apps"
                                                        className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                                                    >
                                                        {t('settings.openApplications')}
                                                    </Link>
                                                </div>
                                            </div>
                                        </SettingsSection>
                                    </>
                                )}

                                {tabId === 'availability' && (
                                    <SettingsSection
                                        title={t('availability.title')}
                                        description={t('availability.description')}
                                        showBottomDivider={false}
                                    >
                                        <div className="space-y-3">
                                            {availabilityDraft.map((rule) => (
                                                <div key={rule.dayOfWeek} className="rounded-2xl border border-gray-200 bg-white p-3.5">
                                                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,11rem)_minmax(0,11rem)_auto] lg:items-center">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-gray-900">
                                                                {t(`days.${DAY_KEY_BY_INDEX[rule.dayOfWeek]}`)}
                                                            </p>
                                                            <p className="mt-1 text-sm text-gray-500">
                                                                {rule.enabled ? t('availability.dayOpen') : t('availability.dayClosed')}
                                                            </p>
                                                        </div>

                                                        <div className="w-full lg:max-w-[11rem]">
                                                            <CompactTimeField
                                                                label={t('availability.startTime')}
                                                                value={rule.startTime}
                                                                disabled={!rule.enabled || isPending || isReadOnly}
                                                                onChange={(value) => setAvailabilityDraft((current) => current.map((entry) => (
                                                                    entry.dayOfWeek === rule.dayOfWeek
                                                                        ? { ...entry, startTime: value }
                                                                        : entry
                                                                )))}
                                                            />
                                                        </div>

                                                        <div className="w-full lg:max-w-[11rem]">
                                                            <CompactTimeField
                                                                label={t('availability.endTime')}
                                                                value={rule.endTime}
                                                                disabled={!rule.enabled || isPending || isReadOnly}
                                                                onChange={(value) => setAvailabilityDraft((current) => current.map((entry) => (
                                                                    entry.dayOfWeek === rule.dayOfWeek
                                                                        ? { ...entry, endTime: value }
                                                                        : entry
                                                                )))}
                                                            />
                                                        </div>

                                                        <div className="lg:justify-self-end">
                                                            <InlineSwitch
                                                                checked={rule.enabled}
                                                                checkedLabel={t('availability.dayEnabled')}
                                                                uncheckedLabel={t('availability.dayDisabled')}
                                                                disabled={isPending || isReadOnly}
                                                                onChange={(nextValue) => setAvailabilityDraft((current) => current.map((entry) => (
                                                                    entry.dayOfWeek === rule.dayOfWeek
                                                                        ? { ...entry, enabled: nextValue }
                                                                        : entry
                                                                )))}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </SettingsSection>
                                )}

                                {tabId === 'serviceDurations' && (
                                    <SettingsSection
                                        title={t('services.title')}
                                        description={t('services.description')}
                                        showBottomDivider={false}
                                    >
                                        {initialServices.length === 0 ? (
                                            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-6">
                                                <p className="text-sm text-gray-600">{t('services.empty')}</p>
                                                <Link
                                                    href="/settings/organization"
                                                    className="mt-4 inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                                                >
                                                    {t('services.openOrganizationSettings')}
                                                </Link>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {initialServices.map((service) => {
                                                    const durationValue = serviceDurationDraft[service.id] ?? ''
                                                    const isCustom = durationValue.trim().length > 0

                                                    return (
                                                        <div key={service.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                                                            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                                                <div className="min-w-0">
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <p className="text-sm font-semibold text-gray-900">{service.name}</p>
                                                                        <Badge variant={isCustom ? 'success' : 'neutral'}>
                                                                            {isCustom ? t('services.customDurationBadge') : t('services.defaultDurationBadge')}
                                                                        </Badge>
                                                                    </div>
                                                                    <p className="mt-2 text-sm text-gray-500">
                                                                        {isCustom
                                                                            ? t('services.customDurationActive')
                                                                            : t('services.usingFallback', {
                                                                                minutes: initialSettings?.default_booking_duration_minutes ?? 60
                                                                            })}
                                                                    </p>
                                                                </div>

                                                                <div className="w-full md:max-w-[220px]">
                                                                    <FieldInput
                                                                        label={t('services.durationInputLabel')}
                                                                        value={durationValue}
                                                                        suffix={t('minutesShort')}
                                                                        disabled={isPending || isReadOnly}
                                                                        onChange={(value) => setServiceDurationDraft((current) => ({
                                                                            ...current,
                                                                            [service.id]: value
                                                                        }))}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </SettingsSection>
                                )}
                            </>
                        )}
                    </SettingsTabs>
                </div>
            </div>
        </>
    )
}
