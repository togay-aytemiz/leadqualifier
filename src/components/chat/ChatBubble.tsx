'use client'

import { ChatMessage } from '@/lib/chat/actions'
import { cn } from '@/lib/utils'

interface ChatBubbleProps {
    message: ChatMessage
}

export function ChatBubble({ message }: ChatBubbleProps) {
    const isUser = message.role === 'user'

    return (
        <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
            <div
                className={cn(
                    'relative max-w-[80%] rounded-lg px-3 py-1.5 shadow-sm text-sm',
                    isUser ? 'bg-[#d9fdd3] text-zinc-900 rounded-tr-none' : 'bg-white text-zinc-900 rounded-tl-none'
                )}
            >
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] text-zinc-500">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isUser && (
                        <span className="text-blue-500">
                            {message.status === 'read' ? (
                                // Double tick (read)
                                <svg viewBox="0 0 16 11" height="11" width="16" preserveAspectRatio="xMidYMid meet" className="" fill="currentColor" enableBackground="new 0 0 16 11"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88l-3.27-2.954a.366.366 0 0 0-.54.041l-.42.49a.408.408 0 0 0 .046.568l4.19 3.784a.447.447 0 0 0 .6-.046l9.902-7.914a.375.375 0 0 0 .063-.537z"></path><path d="M10.956 2.05L11.545 1.57a.365.365 0 0 0 .063-.51L11.129 0.58a.408.408 0 0 0-.568-.046l-4.19 3.784a.447.447 0 0 0-.6.046l-9.902 7.914a.375.375 0 0 0-.063.537l0.478 0.372a.365.365 0 0 0 .51-.063L6.345 5.21l3.27 2.954a.366.366 0 0 0 .54-.041l0.42-.49a.408.408 0 0 0-.046-.568l-4.19-3.784a.447.447 0 0 0-.6.046zM15.01 3.316"></path></svg>
                            ) : (
                                // Single tick
                                <svg viewBox="0 0 16 15" height="11" width="16" preserveAspectRatio="xMidYMid meet" className="" fill="currentColor" enableBackground="new 0 0 16 15"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879 1.296 6.925a.366.366 0 0 0-.54.041l-.42.49a.408.408 0 0 0 .046.568l4.19 3.784a.447.447 0 0 0 .6-.046l9.902-7.914a.375.375 0 0 0 .063-.537z"></path></svg>
                            )}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}
