import { createClient } from '@/lib/supabase/server'
import {
    createCalendarBookingRecord,
    getBookableServiceCatalogItemsByOrganizationId,
    getBookingSettingsByOrganizationId,
    lookupBookingAvailability
} from '@/lib/calendar/bookings'
import { normalizeServiceName } from '@/lib/leads/catalog'
import { resolveLeadServiceNames } from '@/lib/leads/service'

export interface BookingIntentSignal {
    hasBookingIntent: boolean
    requestedTimeMentioned: boolean
}

export type BookingAssistantAction =
    | 'clarify_service'
    | 'clarify_time'
    | 'suggest_alternatives'
    | 'create_booking'
    | 'none'

export interface ResolveBookingAssistantActionInput {
    hasBookingIntent: boolean
    serviceResolved: boolean
    exactSlotAvailable: boolean
    alternativeSlotCount: number
    userConfirmedSlot: boolean
}

export interface ProactiveBookingPromptInput {
    hasBookingIntent: boolean
    hasResolvedService: boolean
    messageCount: number
    bookingAlreadyCreated: boolean
}

export type SchedulingHandleResult =
    | true
    | false
    | {
        handled: true
        requiresHumanHandover?: boolean
    }

interface LeadSnapshotLike {
    service_type?: string | null
    extracted_fields?: unknown
}

interface RecentMessageRowLike {
    sender_type: 'contact' | 'bot' | 'user' | 'system'
    content: string | null
    metadata?: unknown
    created_at?: string
}

interface BookingContextMetadata {
    suggestionSlots: string[]
    serviceCatalogId: string | null
    serviceName: string | null
    requestedSlot: string | null
}

interface MaybeHandleSchedulingRequestInput {
    supabase: Awaited<ReturnType<typeof createClient>>
    organizationId: string
    conversationId: string
    message: string
    platform: 'whatsapp' | 'telegram' | 'instagram'
    customerName: string | null
    customerPhone: string | null
    responseLanguage: 'tr' | 'en'
    formatOutboundBotMessage: (content: string) => string
    sendOutbound: (content: string) => Promise<void>
    persistBotMessage: (content: string, metadata: Record<string, unknown>) => Promise<void>
}

const DIRECT_BOOKING_INTENT_PATTERNS = [
    /\brandevu\b/i,
    /\bbook(?:ing)?\b/i,
    /\bschedule\b/i,
    /\bavailability\b/i,
    /\bbos yer\b/i,
    /\bbo[sş]luk\b/i
]

const TIME_ANCHORED_AVAILABILITY_PATTERNS = [
    /\buygun\b/i,
    /\bm[uü]sait\b/i,
    /\bavailable\b/i,
    /\bfree\b/i
]

const TIME_REFERENCE_PATTERNS = [
    /\byar[ıi]n\b/i,
    /\btomorrow\b/i,
    /\bbug[uü]n\b/i,
    /\btoday\b/i,
    /\b[this ]?week\b/i,
    /\bhafta\b/i,
    /\bsaat\b/i,
    /\b\d{1,2}:\d{2}\b/
]

const INFORMATION_ONLY_PATTERNS = [
    /genel bilgi/i,
    /hakk[ıi]nda bilgi/i,
    /what is/i,
    /how does/i
]

const CONFIRMATION_PATTERNS = [
    /\bevet\b/i,
    /\bolur\b/i,
    /\btamam\b/i,
    /\buygun\b/i,
    /\bok\b/i,
    /\byes\b/i,
    /\bconfirm\b/i,
    /\bworks\b/i
]

const BOOKING_MANAGEMENT_PATTERNS = [
    /\brandevu(?:mu|m[uü])?\s+(?:de[gğ][iı][sş]tirmek|ertelemek|ta[sş][iı]mak|ba[sş]ka g[uü]ne almak)\b/i,
    /\brandevu(?:mu|m[uü])?\s+iptal etmek\b/i,
    /\bappointment\b.*\b(?:reschedule|change|move|cancel)\b/i,
    /\b(?:reschedule|change|move|cancel)\b.*\bappointment\b/i
]

const BOOKING_CHANGE_FOLLOW_UP_PATTERNS = [
    /\balabilir miyiz\b/i,
    /\bta[sş][iı]yabilir miyiz\b/i,
    /\bba[sş]ka g[uü]ne\b/i,
    /\bdaha erken\b/i,
    /\bdaha ge[cç]\b/i,
    /\berteleyebilir miyiz\b/i,
    /\bkayd[ıi]rabilir miyiz\b/i,
    /\bmove it\b/i,
    /\bchange it\b/i,
    /\breschedule\b/i
]

const SAME_DAY_REFERENCE_PATTERNS = [
    /\bo gun\b/i,
    /\bayni gun\b/i,
    /\bthat day\b/i,
    /\bsame day\b/i
]

const AVAILABILITY_CONTINUATION_PATTERNS = [
    /\buygun mu\b/i,
    /\bmusait mi\b/i,
    /\bavailable\b/i,
    /\bfree\b/i
]

const TIME_TOKEN_PATTERN = /\b([01]?\d|2[0-3]):([0-5]\d)\b/
const TURKISH_DAY_PATTERN_LOOKUP: Array<{ pattern: RegExp, dayOfWeek: number }> = [
    { pattern: /\bpazar\w*\b/i, dayOfWeek: 0 },
    { pattern: /\bpazartesi\w*\b/i, dayOfWeek: 1 },
    { pattern: /\bsal[ıi]\w*\b/i, dayOfWeek: 2 },
    { pattern: /\b[çc]ar[sş]amba\w*\b/i, dayOfWeek: 3 },
    { pattern: /\bper[sş]embe\w*\b/i, dayOfWeek: 4 },
    { pattern: /\bcuma\w*\b/i, dayOfWeek: 5 },
    { pattern: /\bcumartesi\w*\b/i, dayOfWeek: 6 }
]
const ENGLISH_DAY_PATTERN_LOOKUP: Array<{ pattern: RegExp, dayOfWeek: number }> = [
    { pattern: /\bsunday\w*\b/i, dayOfWeek: 0 },
    { pattern: /\bmonday\w*\b/i, dayOfWeek: 1 },
    { pattern: /\btuesday\w*\b/i, dayOfWeek: 2 },
    { pattern: /\bwednesday\w*\b/i, dayOfWeek: 3 },
    { pattern: /\bthursday\w*\b/i, dayOfWeek: 4 },
    { pattern: /\bfriday\w*\b/i, dayOfWeek: 5 },
    { pattern: /\bsaturday\w*\b/i, dayOfWeek: 6 }
]

function normalizeLooseText(value: string) {
    return value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}\s:]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function createDatePartsFormatter(timezone: string) {
    return new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        hour: '2-digit',
        hour12: false,
        minute: '2-digit',
        month: '2-digit',
        timeZone: timezone,
        weekday: 'short',
        year: 'numeric'
    })
}

function getZonedDateParts(date: Date, timezone: string) {
    const formatter = createDatePartsFormatter(timezone)
    const lookup = Object.fromEntries(
        formatter.formatToParts(date).map((part) => [part.type, part.value])
    ) as Record<string, string>

    const weekdayLookup = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6
    } as const

    return {
        year: Number(lookup.year ?? '0'),
        month: Number(lookup.month ?? '1'),
        day: Number(lookup.day ?? '1'),
        hour: Number(lookup.hour ?? '0'),
        minute: Number(lookup.minute ?? '0'),
        dayOfWeek: weekdayLookup[(lookup.weekday as keyof typeof weekdayLookup) ?? 'Sun'] ?? 0
    }
}

function addDaysToLocalDate(parts: { year: number, month: number, day: number }, offsetDays: number) {
    const nextDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
    nextDate.setUTCDate(nextDate.getUTCDate() + offsetDays)
    return {
        year: nextDate.getUTCFullYear(),
        month: nextDate.getUTCMonth() + 1,
        day: nextDate.getUTCDate()
    }
}

function buildZonedDateTimeIso(input: {
    timezone: string
    year: number
    month: number
    day: number
    hour: number
    minute: number
}) {
    let guess = new Date(Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute))

    for (let index = 0; index < 3; index += 1) {
        const parts = getZonedDateParts(guess, input.timezone)
        const desiredUtcDate = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute)
        const observedUtcDate = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
        const diffMs = desiredUtcDate - observedUtcDate
        if (diffMs === 0) break
        guess = new Date(guess.getTime() + diffMs)
    }

    return guess.toISOString()
}

function detectConfirmation(message: string) {
    return CONFIRMATION_PATTERNS.some((pattern) => pattern.test(message))
}

function detectBookingManagementIntent(message: string) {
    const normalized = normalizeLooseText(message)
    return BOOKING_MANAGEMENT_PATTERNS.some((pattern) => pattern.test(normalized))
}

function resolveRequestedDayOffset(message: string) {
    if (/\byarin\b/i.test(normalizeLooseText(message)) || /\btomorrow\b/i.test(message)) return 1
    if (/\bbugun\b/i.test(normalizeLooseText(message)) || /\btoday\b/i.test(message)) return 0
    return null
}

function resolveRequestedWeekday(message: string) {
    for (const candidate of [...TURKISH_DAY_PATTERN_LOOKUP, ...ENGLISH_DAY_PATTERN_LOOKUP]) {
        if (candidate.pattern.test(message)) {
            return candidate.dayOfWeek
        }
    }
    return null
}

function resolveRequestedTime(message: string) {
    const match = message.match(TIME_TOKEN_PATTERN)
    if (!match) return null

    return {
        hour: Number(match[1]),
        minute: Number(match[2])
    }
}

function resolveNextLocalDateForWeekday(input: {
    baseDayOfWeek: number
    desiredDayOfWeek: number
    today: { year: number, month: number, day: number }
}) {
    const rawOffset = input.desiredDayOfWeek - input.baseDayOfWeek
    const offsetDays = rawOffset >= 0 ? rawOffset : rawOffset + 7
    return addDaysToLocalDate(input.today, offsetDays)
}

function buildDayLookupWindow(input: {
    timezone: string
    year: number
    month: number
    day: number
    requestedTime: { hour: number, minute: number } | null
}) {
    const localDate = {
        year: input.year,
        month: input.month,
        day: input.day
    }
    const nextLocalDate = addDaysToLocalDate(localDate, 1)

    return {
        rangeStartIso: buildZonedDateTimeIso({
            timezone: input.timezone,
            year: localDate.year,
            month: localDate.month,
            day: localDate.day,
            hour: 0,
            minute: 0
        }),
        rangeEndIso: buildZonedDateTimeIso({
            timezone: input.timezone,
            year: nextLocalDate.year,
            month: nextLocalDate.month,
            day: nextLocalDate.day,
            hour: 0,
            minute: 0
        }),
        requestedStartIso: input.requestedTime
            ? buildZonedDateTimeIso({
                timezone: input.timezone,
                year: localDate.year,
                month: localDate.month,
                day: localDate.day,
                hour: input.requestedTime.hour,
                minute: input.requestedTime.minute
            })
            : null
    }
}

function resolveLookupWindow(message: string, timezone: string, contextRequestedSlot?: string | null) {
    const now = new Date()
    const today = getZonedDateParts(now, timezone)
    const requestedTime = resolveRequestedTime(message)
    const requestedDayOffset = resolveRequestedDayOffset(message)
    const requestedWeekday = resolveRequestedWeekday(message)
    const normalizedMessage = normalizeLooseText(message)

    if (contextRequestedSlot && SAME_DAY_REFERENCE_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
        const contextDate = getZonedDateParts(new Date(contextRequestedSlot), timezone)
        return buildDayLookupWindow({
            timezone,
            year: contextDate.year,
            month: contextDate.month,
            day: contextDate.day,
            requestedTime
        })
    }

    if (requestedDayOffset !== null) {
        const localDate = addDaysToLocalDate(today, requestedDayOffset)
        return buildDayLookupWindow({
            timezone,
            year: localDate.year,
            month: localDate.month,
            day: localDate.day,
            requestedTime
        })
    }

    if (requestedWeekday !== null) {
        const localDate = resolveNextLocalDateForWeekday({
            baseDayOfWeek: today.dayOfWeek,
            desiredDayOfWeek: requestedWeekday,
            today
        })
        return buildDayLookupWindow({
            timezone,
            year: localDate.year,
            month: localDate.month,
            day: localDate.day,
            requestedTime
        })
    }

    const startIso = now.toISOString()
    const endIso = new Date(now.getTime() + 7 * 24 * 60 * 60_000).toISOString()

    return {
        rangeStartIso: startIso,
        rangeEndIso: endIso,
        requestedStartIso: requestedTime ? null : null
    }
}

function formatBookingSlot(iso: string, timezone: string, responseLanguage: 'tr' | 'en') {
    return new Intl.DateTimeFormat(responseLanguage === 'tr' ? 'tr-TR' : 'en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone
    }).format(new Date(iso))
}

function resolveServiceMatch(message: string, catalog: Array<{
    id: string
    name: string
    aliases: string[]
}>, leadSnapshot: LeadSnapshotLike | null) {
    const normalizedMessage = normalizeLooseText(message)

    const directCatalogMatch = catalog.find((item) => {
        const normalizedName = normalizeLooseText(item.name)
        if (normalizedName && normalizedMessage.includes(normalizedName)) return true

        return item.aliases.some((alias) => {
            const normalizedAlias = normalizeLooseText(alias)
            return normalizedAlias.length > 0 && normalizedMessage.includes(normalizedAlias)
        })
    })

    if (directCatalogMatch) return directCatalogMatch

    const leadServiceNames = leadSnapshot ? resolveLeadServiceNames(leadSnapshot) : []
    for (const leadServiceName of leadServiceNames) {
        const normalizedLeadService = normalizeServiceName(leadServiceName)
        const matchedCatalogItem = catalog.find((item) => {
            if (normalizeServiceName(item.name) === normalizedLeadService) return true
            return item.aliases.some((alias) => normalizeServiceName(alias) === normalizedLeadService)
        })

        if (matchedCatalogItem) return matchedCatalogItem
    }

    if (catalog.length === 1) {
        return catalog[0]
    }

    return null
}

function readBookingContextMetadata(messages: RecentMessageRowLike[]): BookingContextMetadata | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (!message) continue
        if (message.sender_type !== 'bot') continue

        const metadata = message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
            ? message.metadata as Record<string, unknown>
            : null

        if (!metadata?.is_booking_response) continue

        const suggestionSlots = Array.isArray(metadata.booking_suggestion_slots)
            ? metadata.booking_suggestion_slots.filter((slot): slot is string => typeof slot === 'string')
            : []
        const serviceCatalogId = typeof metadata.booking_service_catalog_id === 'string'
            ? metadata.booking_service_catalog_id
            : null
        const serviceName = typeof metadata.booking_service_name === 'string'
            ? metadata.booking_service_name
            : null
        const requestedSlot = typeof metadata.booking_requested_slot === 'string'
            ? metadata.booking_requested_slot
            : null

        if (suggestionSlots.length === 0 && !requestedSlot && !serviceCatalogId && !serviceName) continue

        return {
            suggestionSlots,
            serviceCatalogId,
            serviceName,
            requestedSlot
        }
    }

    return null
}

function hasConfirmedBookingContext(messages: RecentMessageRowLike[]) {
    return messages.some((message) => {
        if (message.sender_type !== 'bot') return false

        const metadata = message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
            ? message.metadata as Record<string, unknown>
            : null

        return Boolean(metadata?.is_booking_confirmation || typeof metadata?.booking_id === 'string')
    })
}

function resolveContextServiceMatch(input: {
    bookingContext: BookingContextMetadata | null
    catalog: Array<{
        id: string
        name: string
        aliases: string[]
    }>
}) {
    const { bookingContext, catalog } = input
    if (!bookingContext) return null

    if (bookingContext.serviceCatalogId) {
        const directMatch = catalog.find((item) => item.id === bookingContext.serviceCatalogId)
        if (directMatch) return directMatch
    }

    if (bookingContext.serviceName) {
        const normalizedServiceName = normalizeServiceName(bookingContext.serviceName)
        const namedMatch = catalog.find((item) => {
            if (normalizeServiceName(item.name) === normalizedServiceName) return true
            return item.aliases.some((alias) => normalizeServiceName(alias) === normalizedServiceName)
        })
        if (namedMatch) return namedMatch
    }

    return null
}

function isSchedulingContinuationMessage(input: {
    message: string
    bookingContext: BookingContextMetadata | null
}) {
    if (!input.bookingContext) return false

    const normalizedMessage = normalizeLooseText(input.message)
    if (SAME_DAY_REFERENCE_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) return true
    if (AVAILABILITY_CONTINUATION_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) return true
    if (resolveRequestedDayOffset(input.message) !== null) return true
    if (resolveRequestedWeekday(input.message) !== null) return true
    if (resolveRequestedTime(input.message) !== null) return true
    if (detectConfirmation(normalizedMessage) && input.bookingContext.suggestionSlots.length > 0) return true

    return false
}

function looksLikeBookingManagementFollowUp(message: string) {
    const normalizedMessage = normalizeLooseText(message)
    const hasChangeLanguage = BOOKING_CHANGE_FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(normalizedMessage))

    if (!hasChangeLanguage) return false

    return (
        resolveRequestedDayOffset(message) !== null
        || resolveRequestedWeekday(message) !== null
        || resolveRequestedTime(message) !== null
        || SAME_DAY_REFERENCE_PATTERNS.some((pattern) => pattern.test(normalizedMessage))
    )
}

function resolveConfirmedSuggestion(message: string, suggestionSlots: string[], timezone: string) {
    const normalizedMessage = normalizeLooseText(message)
    const requestedTime = resolveRequestedTime(message)
    const requestedWeekday = resolveRequestedWeekday(message)

    if (requestedTime) {
        const matchingSlots = suggestionSlots.filter((slot) => {
            const parts = getZonedDateParts(new Date(slot), timezone)
            if (parts.hour !== requestedTime.hour || parts.minute !== requestedTime.minute) {
                return false
            }

            if (requestedWeekday !== null && parts.dayOfWeek !== requestedWeekday) {
                return false
            }

            return true
        })

        if (matchingSlots.length === 1) {
            return matchingSlots[0]
        }
    }

    if (detectConfirmation(normalizedMessage)) {
        return suggestionSlots.length === 1 ? suggestionSlots[0] : null
    }

    return null
}

export function detectBookingIntent(message: string): BookingIntentSignal {
    const normalized = message.trim()
    if (!normalized) {
        return {
            hasBookingIntent: false,
            requestedTimeMentioned: false
        }
    }

    const requestedTimeMentioned = TIME_REFERENCE_PATTERNS.some((pattern) => pattern.test(normalized))
    const looksInformationalOnly = INFORMATION_ONLY_PATTERNS.some((pattern) => pattern.test(normalized))
    const hasDirectBookingIntent = DIRECT_BOOKING_INTENT_PATTERNS.some((pattern) => pattern.test(normalized))
    const hasTimeAnchoredAvailabilityIntent = requestedTimeMentioned
        && TIME_ANCHORED_AVAILABILITY_PATTERNS.some((pattern) => pattern.test(normalized))
    const hasBookingIntent = !looksInformationalOnly
        && (hasDirectBookingIntent || hasTimeAnchoredAvailabilityIntent)

    return {
        hasBookingIntent,
        requestedTimeMentioned
    }
}

export function resolveBookingAssistantAction(
    input: ResolveBookingAssistantActionInput
): BookingAssistantAction {
    if (!input.hasBookingIntent) return 'none'
    if (!input.serviceResolved) return 'clarify_service'
    if (input.exactSlotAvailable && input.userConfirmedSlot) return 'create_booking'
    if (!input.exactSlotAvailable && input.alternativeSlotCount > 0) return 'suggest_alternatives'
    return 'clarify_time'
}

export function shouldOfferProactiveBookingPrompt(
    input: ProactiveBookingPromptInput
) {
    if (input.bookingAlreadyCreated) return false
    if (!input.hasBookingIntent) return false
    if (!input.hasResolvedService) return false
    return input.messageCount >= 3
}

function buildLocalizedText(responseLanguage: 'tr' | 'en', content: { tr: string, en: string }) {
    return responseLanguage === 'tr' ? content.tr : content.en
}

async function sendSchedulingHandoffReply(
    input: Pick<
        MaybeHandleSchedulingRequestInput,
        'responseLanguage' | 'formatOutboundBotMessage' | 'sendOutbound' | 'persistBotMessage'
    >,
    content: { tr: string, en: string },
    bookingAction: 'handoff' | 'handoff_management'
): Promise<Extract<SchedulingHandleResult, { handled: true }>> {
    const reply = buildLocalizedText(input.responseLanguage, content)
    const formattedReply = input.formatOutboundBotMessage(reply)

    await input.sendOutbound(formattedReply)
    await input.persistBotMessage(formattedReply, {
        is_booking_response: true,
        booking_action: bookingAction
    })

    return {
        handled: true,
        requiresHumanHandover: true
    }
}

export async function maybeHandleSchedulingRequest(
    input: MaybeHandleSchedulingRequestInput
): Promise<SchedulingHandleResult> {
    if (detectBookingManagementIntent(input.message)) {
        return sendSchedulingHandoffReply(input, {
            tr: 'Randevu değişikliği taleplerini buradan otomatik işlemiyorum.',
            en: 'I do not change existing bookings automatically here.'
        }, 'handoff_management')
    }

    const [{ data: recentMessages, error: recentMessagesError }, { data: leadSnapshot, error: leadSnapshotError }] = await Promise.all([
        input.supabase
            .from('messages')
            .select('sender_type, content, metadata, created_at')
            .eq('conversation_id', input.conversationId)
            .order('created_at', { ascending: true })
            .limit(12),
        input.supabase
            .from('leads')
            .select('service_type, extracted_fields')
            .eq('conversation_id', input.conversationId)
            .maybeSingle()
    ])

    if (recentMessagesError) {
        console.warn('Failed to load recent messages for scheduling branch', recentMessagesError)
    }
    if (leadSnapshotError) {
        console.warn('Failed to load lead snapshot for scheduling branch', leadSnapshotError)
    }

    const recentHistory = (recentMessages ?? []) as RecentMessageRowLike[]
    const bookingContext = readBookingContextMetadata(recentHistory)
    const hasConfirmedBooking = hasConfirmedBookingContext(recentHistory)
    const settings = await getBookingSettingsByOrganizationId(input.supabase, input.organizationId)
    if (!settings.booking_enabled) return false

    const serviceCatalog = await getBookableServiceCatalogItemsByOrganizationId(input.supabase, input.organizationId)
    if (serviceCatalog.length === 0) return false

    if (hasConfirmedBooking && looksLikeBookingManagementFollowUp(input.message)) {
        return sendSchedulingHandoffReply(input, {
            tr: 'Mevcut randevu değişikliği taleplerini buradan otomatik işlemiyorum.',
            en: 'I do not automatically change an existing booking here.'
        }, 'handoff_management')
    }

    const selectedSuggestion = bookingContext
        ? resolveConfirmedSuggestion(input.message, bookingContext.suggestionSlots, settings.timezone)
        : null

    if (selectedSuggestion && bookingContext?.serviceCatalogId) {
        const createdBooking = await createCalendarBookingRecord(
            input.supabase,
            input.organizationId,
            {
                serviceCatalogId: bookingContext.serviceCatalogId,
                serviceNameSnapshot: bookingContext.serviceName,
                startsAt: selectedSuggestion,
                customerName: input.customerName,
                customerPhone: input.customerPhone,
                source: 'ai',
                channel: input.platform,
                conversationId: input.conversationId
            },
            null
        )

        const confirmationReply = buildLocalizedText(input.responseLanguage, {
            tr: `Randevunuzu oluşturdum: ${formatBookingSlot(createdBooking.starts_at, createdBooking.timezone, 'tr')}.`,
            en: `I created your booking for ${formatBookingSlot(createdBooking.starts_at, createdBooking.timezone, 'en')}.`
        })
        const formattedReply = input.formatOutboundBotMessage(confirmationReply)
        await input.sendOutbound(formattedReply)
        await input.persistBotMessage(formattedReply, {
            booking_id: createdBooking.id,
            booking_service_catalog_id: createdBooking.service_catalog_id,
            booking_status: createdBooking.status,
            is_booking_response: true,
            is_booking_confirmation: true
        })
        return true
    }

    const bookingIntent = detectBookingIntent(input.message)
    const schedulingContinuation = isSchedulingContinuationMessage({
        message: input.message,
        bookingContext
    })
    if (!bookingIntent.hasBookingIntent && !schedulingContinuation) {
        return false
    }

    const matchedService = resolveServiceMatch(
        input.message,
        serviceCatalog.map((service) => ({
            id: service.id,
            name: service.name,
            aliases: service.aliases ?? []
        })),
        (leadSnapshot ?? null) as LeadSnapshotLike | null
    ) ?? resolveContextServiceMatch({
        bookingContext,
        catalog: serviceCatalog.map((service) => ({
            id: service.id,
            name: service.name,
            aliases: service.aliases ?? []
        }))
    })

    if (!matchedService) {
        const clarificationReply = buildLocalizedText(input.responseLanguage, {
            tr: 'Size doğru süreyle bakabilmem için önce hangi hizmet için randevu istediğinizi netleştirelim.',
            en: 'To check the right duration safely, I first need to know which service you want to book.'
        })
        const formattedReply = input.formatOutboundBotMessage(clarificationReply)
        await input.sendOutbound(formattedReply)
        await input.persistBotMessage(formattedReply, {
            is_booking_response: true,
            booking_action: 'clarify_service'
        })
        return true
    }

    const lookupWindow = resolveLookupWindow(
        input.message,
        settings.timezone,
        bookingContext?.requestedSlot ?? bookingContext?.suggestionSlots[0] ?? null
    )
    const availability = await lookupBookingAvailability(input.supabase, input.organizationId, {
        rangeStartIso: lookupWindow.rangeStartIso,
        rangeEndIso: lookupWindow.rangeEndIso,
        requestedStartIso: lookupWindow.requestedStartIso,
        serviceCatalogId: matchedService.id,
        suggestionLimit: 3
    })

    const action = resolveBookingAssistantAction({
        alternativeSlotCount: availability.alternativeSlots.length,
        exactSlotAvailable: availability.exactMatchAvailable,
        hasBookingIntent: true,
        serviceResolved: true,
        userConfirmedSlot: false
    })

    if (action === 'clarify_time' && availability.availableSlots.length === 0) {
        return sendSchedulingHandoffReply(input, {
            tr: 'Şu anda uygun slot bulamadım. İsterseniz ekibimiz sizinle en yakın seçenekleri birlikte netleştirsin.',
            en: 'I could not find a suitable slot right now. If you want, our team can help you confirm the closest options.'
        }, 'handoff')
    }

    if (action === 'suggest_alternatives') {
        const suggestions = availability.alternativeSlots.length > 0
            ? availability.alternativeSlots
            : availability.availableSlots.slice(0, 3)
        const suggestionText = suggestions
            .map((slot) => formatBookingSlot(slot, settings.timezone, input.responseLanguage))
            .join(', ')

        const alternativesReply = buildLocalizedText(input.responseLanguage, {
            tr: lookupWindow.requestedStartIso
                ? `İstediğiniz saat dolu görünüyor. Şu seçenekler uygun: ${suggestionText}. Uygun olanı seçerseniz sizin için oluşturabilirim.`
                : `Şu an uygun görünen seçenekler: ${suggestionText}. Uygun olanı seçerseniz sizin için oluşturabilirim.`,
            en: lookupWindow.requestedStartIso
                ? `That time looks busy. These options are available: ${suggestionText}. If one works for you, I can create it for you.`
                : `These options are currently available: ${suggestionText}. If one works for you, I can create it for you.`
        })

        const formattedReply = input.formatOutboundBotMessage(alternativesReply)
        await input.sendOutbound(formattedReply)
        await input.persistBotMessage(formattedReply, {
            is_booking_response: true,
            booking_action: 'suggest_alternatives',
            booking_service_catalog_id: matchedService.id,
            booking_service_name: matchedService.name,
            booking_requested_slot: lookupWindow.requestedStartIso,
            booking_suggestion_slots: suggestions,
            booking_duration_minutes: availability.slotDurationMinutes,
            booking_duration_source: availability.durationSource
        })
        return true
    }

    if (availability.exactMatchAvailable && lookupWindow.requestedStartIso) {
        const exactReply = buildLocalizedText(input.responseLanguage, {
            tr: `${formatBookingSlot(lookupWindow.requestedStartIso, settings.timezone, 'tr')} uygun görünüyor. İsterseniz bu saat için randevunuzu oluşturabilirim.`,
            en: `${formatBookingSlot(lookupWindow.requestedStartIso, settings.timezone, 'en')} looks available. If you want, I can create the booking for that time.`
        })
        const formattedReply = input.formatOutboundBotMessage(exactReply)
        await input.sendOutbound(formattedReply)
        await input.persistBotMessage(formattedReply, {
            is_booking_response: true,
            booking_action: 'offer_exact_slot',
            booking_service_catalog_id: matchedService.id,
            booking_service_name: matchedService.name,
            booking_requested_slot: lookupWindow.requestedStartIso,
            booking_suggestion_slots: [lookupWindow.requestedStartIso],
            booking_duration_minutes: availability.slotDurationMinutes,
            booking_duration_source: availability.durationSource
        })
        return true
    }

    if (shouldOfferProactiveBookingPrompt({
        hasBookingIntent: true,
        hasResolvedService: true,
        messageCount: recentHistory.filter((message) => message.sender_type === 'contact').length + 1,
        bookingAlreadyCreated: recentHistory.some((message) => {
            const metadata = message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
                ? message.metadata as Record<string, unknown>
                : null
            return Boolean(metadata?.is_booking_confirmation)
        })
    })) {
        const promptReply = buildLocalizedText(input.responseLanguage, {
            tr: 'İsterseniz uygun saatlere birlikte bakalım ve size en yakın seçenekleri paylaşayım.',
            en: 'If you want, we can check the available times together and I can share the closest options.'
        })
        const formattedReply = input.formatOutboundBotMessage(promptReply)
        await input.sendOutbound(formattedReply)
        await input.persistBotMessage(formattedReply, {
            is_booking_response: true,
            booking_action: 'proactive_prompt',
            booking_service_catalog_id: matchedService.id,
            booking_service_name: matchedService.name
        })
        return true
    }

    return false
}
