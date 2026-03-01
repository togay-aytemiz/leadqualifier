import type { Message } from '@/types/database'
import { sortMessagesChronologically } from '@/lib/inbox/message-order'

interface ShouldLoadOlderMessagesArgs {
    scrollTop: number
    hasMore: boolean
    isLoading: boolean
    threshold?: number
}

interface PrependOlderMessagesArgs {
    currentMessages: Message[]
    olderBatch: Message[]
}

interface ResolveRestoredScrollTopArgs {
    previousScrollHeight: number
    previousScrollTop: number
    nextScrollHeight: number
}

export function shouldLoadOlderMessages(args: ShouldLoadOlderMessagesArgs) {
    const threshold = args.threshold ?? 80
    if (!args.hasMore || args.isLoading) return false
    return args.scrollTop <= threshold
}

export function prependOlderMessages(args: PrependOlderMessagesArgs) {
    if (args.olderBatch.length === 0) {
        return {
            mergedMessages: args.currentMessages,
            addedCount: 0
        }
    }

    const currentIds = new Set(args.currentMessages.map((message) => message.id))
    const uniqueOlder = args.olderBatch.filter((message) => !currentIds.has(message.id))

    if (uniqueOlder.length === 0) {
        return {
            mergedMessages: args.currentMessages,
            addedCount: 0
        }
    }

    return {
        mergedMessages: sortMessagesChronologically([...uniqueOlder, ...args.currentMessages]),
        addedCount: uniqueOlder.length
    }
}

export function resolveRestoredScrollTop(args: ResolveRestoredScrollTopArgs) {
    return Math.max(0, args.previousScrollTop + (args.nextScrollHeight - args.previousScrollHeight))
}
