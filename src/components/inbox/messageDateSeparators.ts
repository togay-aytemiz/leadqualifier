import { format, isSameDay, startOfDay, subDays, type Locale } from 'date-fns'

type MessageWithCreatedAt = {
    id: string
    created_at: string
}

export type MessageDateSeparator = {
    messageId: string
    label: string
}

function toValidDate(value: string): Date | null {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

function resolveDateLabel(options: {
    messageDate: Date
    now: Date
    todayLabel: string
    yesterdayLabel: string
    dateLocale?: Locale
}) {
    const today = startOfDay(options.now)
    if (isSameDay(options.messageDate, today)) {
        return options.todayLabel
    }

    const yesterday = subDays(today, 1)
    if (isSameDay(options.messageDate, yesterday)) {
        return options.yesterdayLabel
    }

    return format(options.messageDate, 'PPP', { locale: options.dateLocale })
}

export function buildMessageDateSeparators(options: {
    messages: MessageWithCreatedAt[]
    now?: Date
    todayLabel: string
    yesterdayLabel: string
    dateLocale?: Locale
}): MessageDateSeparator[] {
    const now = options.now ?? new Date()
    const separators: MessageDateSeparator[] = []
    let lastSeparatorDate: Date | null = null

    for (const message of options.messages) {
        const messageDate = toValidDate(message.created_at)
        if (!messageDate) continue

        if (lastSeparatorDate && isSameDay(lastSeparatorDate, messageDate)) {
            continue
        }

        separators.push({
            messageId: message.id,
            label: resolveDateLabel({
                messageDate,
                now,
                todayLabel: options.todayLabel,
                yesterdayLabel: options.yesterdayLabel,
                dateLocale: options.dateLocale
            })
        })
        lastSeparatorDate = messageDate
    }

    return separators
}
