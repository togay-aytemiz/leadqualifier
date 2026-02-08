'use client'

import { ChatMessage } from '@/lib/chat/actions'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import {
    getSimulatorBubbleClasses,
    getSimulatorTimestampClasses,
    getSimulatorTokenUsageClasses
} from '@/components/chat/simulatorStyles'

interface ChatBubbleProps {
    message: ChatMessage
}

export function ChatBubble({ message }: ChatBubbleProps) {
    const t = useTranslations('simulator')
    const isUser = message.role === 'user'

    return (
        <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
            <div
                className={cn(
                    'relative max-w-[80%] px-3 py-2 shadow-sm text-sm',
                    getSimulatorBubbleClasses(message.role)
                )}
            >
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                <div className="mt-1 space-y-1">
                    <div className="flex items-center justify-end">
                        <span className={cn('text-[10px]', getSimulatorTimestampClasses(message.role))}>
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                    {message.tokenUsage && (
                        <div className={cn('text-[10px] text-right', getSimulatorTokenUsageClasses(message.role))}>
                            {t('tokenUsageInline', {
                                input: message.tokenUsage.inputTokens,
                                output: message.tokenUsage.outputTokens
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
