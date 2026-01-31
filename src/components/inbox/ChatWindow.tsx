import { Conversation, Message } from '@/types/database'
import { format } from 'date-fns'
import { useState, useRef, useEffect } from 'react'

interface ChatWindowProps {
    conversation: Conversation
    messages: Message[]
    onSendMessage: (content: string) => Promise<void>
}

export function ChatWindow({ conversation, messages, onSendMessage }: ChatWindowProps) {
    const [input, setInput] = useState('')
    const [isSending, setIsSending] = useState(false)
    const endRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || isSending) return

        setIsSending(true)
        try {
            await onSendMessage(input)
            setInput('')
        } finally {
            setIsSending(false)
        }
    }

    return (
        <main className="flex-1 flex flex-col bg-gray-50 min-w-0">
            {/* Header */}
            <header className="h-16 flex-shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-10">
                <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${conversation.platform === 'whatsapp' ? 'bg-green-500' :
                            conversation.platform === 'telegram' ? 'bg-blue-400' : 'bg-purple-500'
                        }`}>
                        {conversation.contact_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h1 className="font-bold text-gray-900">{conversation.contact_name}</h1>
                        <p className="text-xs text-gray-500 capitalize">{conversation.platform} • {conversation.status}</p>
                    </div>
                </div>

                <div className="flex items-center space-x-2">
                    <button className="p-2 rounded hover:bg-gray-100 text-gray-500">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    </button>
                    <button className="p-2 rounded hover:bg-gray-100 text-gray-500">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                    </button>
                </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {messages.map((msg) => {
                    const isMe = msg.sender_type === 'user' || msg.sender_type === 'system'
                    const isBot = msg.sender_type === 'bot'

                    if (msg.sender_type === 'system') {
                        return (
                            <div key={msg.id} className="flex justify-center my-4">
                                <span className="bg-gray-200 text-gray-600 text-xs px-3 py-1 rounded-full">
                                    {msg.content}
                                </span>
                            </div>
                        )
                    }

                    return (
                        <div key={msg.id} className={`flex items-start space-x-3 ${isMe || isBot ? 'flex-row-reverse space-x-reverse' : ''}`}>
                            <div className={`h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs text-white ${isBot ? 'bg-purple-600' : isMe ? 'bg-blue-600' : 'bg-gray-400'
                                }`}>
                                {isBot ? 'AI' : isMe ? 'You' : conversation.contact_name.charAt(0)}
                            </div>

                            <div className={`flex flex-col space-y-1 max-w-xl ${isMe || isBot ? 'items-end' : ''}`}>
                                <div className={`px-4 py-2 rounded-2xl shadow-sm text-sm ${isBot
                                        ? 'bg-purple-100 text-purple-900 rounded-tr-none'
                                        : isMe
                                            ? 'bg-blue-100 text-blue-900 rounded-tr-none'
                                            : 'bg-white text-gray-800 rounded-tl-none'
                                    }`}>
                                    <p>{msg.content}</p>
                                </div>
                                <span className="text-[10px] text-gray-400">
                                    {format(new Date(msg.created_at), 'HH:mm')}
                                </span>
                            </div>
                        </div>
                    )
                })}
                <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="p-4 bg-gray-50 border-t border-gray-200">
                <form onSubmit={handleSend} className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col p-2">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="w-full bg-transparent border-none resize-none focus:ring-0 text-sm text-gray-800 px-2 h-16 placeholder-gray-400 focus:outline-none"
                        placeholder="Type a message..."
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleSend(e)
                            }
                        }}
                    />
                    <div className="flex items-center justify-between px-1 pt-2">
                        <div className="flex items-center space-x-1">
                            {/* Attachments icons placeholder */}
                        </div>
                        <button
                            type="submit"
                            disabled={!input.trim() || isSending}
                            className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-700 text-white transition-colors text-sm font-medium px-4 py-1.5 rounded-lg disabled:opacity-50"
                        >
                            <span>Send</span>
                        </button>
                    </div>
                </form>
            </div>
        </main>
    )
}
