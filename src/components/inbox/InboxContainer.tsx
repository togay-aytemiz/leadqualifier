'use client'

import { useState, useEffect } from 'react'
import { Avatar, EmptyState, IconButton } from '@/design'
import {
    Inbox, Filter, ChevronDown, ExternalLink, X,
    Paperclip, Image, Smile, Zap, Bot, Trash2, MessageSquare
} from 'lucide-react'
import { Conversation, Message } from '@/types/database'
import { getMessages, sendMessage, getConversations, deleteConversation } from '@/lib/inbox/actions'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow, format } from 'date-fns'

interface InboxContainerProps {
    initialConversations: Conversation[]
    organizationId: string
}

export function InboxContainer({ initialConversations, organizationId }: InboxContainerProps) {
    const [conversations, setConversations] = useState<any[]>(initialConversations)
    const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id || null)
    const [messages, setMessages] = useState<Message[]>([])

    const [input, setInput] = useState('')
    const [isSending, setIsSending] = useState(false)

    // Pagination state
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(initialConversations.length >= 20)
    const [loadingMore, setLoadingMore] = useState(false)

    const handleScroll = async (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
        if (scrollHeight - scrollTop <= clientHeight + 50 && hasMore && !loadingMore) {
            setLoadingMore(true)
            try {
                const nextConversations = await getConversations(organizationId, page)
                if (nextConversations.length > 0) {
                    setConversations(prev => {
                        const existingIds = new Set(prev.map(c => c.id))
                        const uniqueNew = nextConversations.filter(c => !existingIds.has(c.id))
                        return [...prev, ...uniqueNew]
                    })
                    setPage(prev => prev + 1)
                } else {
                    setHasMore(false)
                }
            } catch (error) {
                console.error('Failed to load more conversations', error)
            } finally {
                setLoadingMore(false)
            }
        }
    }

    // Load messages when selected conversation changes
    useEffect(() => {
        if (!selectedId) return

        async function loadMessages() {
            try {
                const msgs = await getMessages(selectedId!)
                setMessages(msgs)

                setConversations(prev => prev.map(c =>
                    c.id === selectedId ? { ...c, unread_count: 0 } : c
                ))
            } catch (error) {
                console.error('Failed to load messages', error)
            } finally {
                // Done
            }
        }

        loadMessages()
    }, [selectedId])

    // Subscribe to realtime changes
    useEffect(() => {
        const supabase = createClient()

        const channel = supabase
            .channel('inbox_realtime')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages' },
                (payload) => {
                    const newMsg = payload.new as Message

                    if (newMsg.conversation_id === selectedId) {
                        setMessages(prev => [...prev, newMsg])
                    }

                    setConversations(prev => prev.map(c => {
                        if (c.id === newMsg.conversation_id) {
                            return {
                                ...c,
                                last_message_at: newMsg.created_at,
                                unread_count: newMsg.conversation_id !== selectedId ? c.unread_count + 1 : 0
                            }
                        }
                        return c
                    }).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()))
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [selectedId])

    const handleSendMessage = async () => {
        if (!selectedId || !input.trim() || isSending) return

        const tempMsg: Message = {
            id: 'temp-' + Date.now(),
            conversation_id: selectedId,
            sender_type: 'user',
            content: input,
            metadata: {},
            created_at: new Date().toISOString()
        }
        setMessages(prev => [...prev, tempMsg])
        setInput('')
        setIsSending(true)

        try {
            await sendMessage(selectedId, input)
        } catch (error) {
            console.error('Failed to send message', error)
        } finally {
            setIsSending(false)
        }
    }



    const handleDeleteConversation = async () => {
        if (!selectedId) return

        if (window.confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
            try {
                await deleteConversation(selectedId)
                setConversations(prev => prev.filter(c => c.id !== selectedId))
                setSelectedId(null)
            } catch (error) {
                console.error('Failed to delete conversation', error)
                alert('Failed to delete conversation')
            }
        }
    }

    const selectedConversation = conversations.find(c => c.id === selectedId)

    return (
        <>
            {/* Conversation List */}
            <div className="w-[320px] border-r border-gray-200 flex flex-col h-full bg-gray-50/30">
                <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 shrink-0 bg-white">
                    <div className="flex items-center gap-1 cursor-pointer group">
                        <span className="text-lg font-bold text-gray-900">Inbox</span>
                        <ChevronDown className="text-gray-500 group-hover:text-gray-900" size={20} />
                    </div>
                    <div className="flex items-center gap-1">
                        <IconButton icon={Filter} size="sm" />
                    </div>
                </div>
                <div
                    className="flex-1 overflow-y-auto"
                    onScroll={handleScroll}
                >
                    {conversations.length === 0 ? (
                        <div className="flex flex-col items-center justify-start h-full p-6 pt-20 text-center">
                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                                <Inbox className="text-gray-400" size={24} />
                            </div>
                            <h3 className="text-sm font-medium text-gray-900">No messages</h3>
                            <p className="text-xs text-gray-500 mt-1">New conversations will appear here when you receive messages.</p>
                        </div>
                    ) : (
                        conversations.map(c => (
                            <div
                                key={c.id}
                                onClick={() => setSelectedId(c.id)}
                                className={`px-4 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors relative group bg-white ${selectedId === c.id ? "bg-blue-50/30" : ""
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-1.5">
                                    <div className="flex items-center gap-2.5">
                                        <Avatar name={c.contact_name} size="sm" />
                                        <span className={`text-sm font-semibold ${c.unread_count > 0 ? "text-gray-900" : "text-gray-700"}`}>{c.contact_name}</span>
                                    </div>
                                    <span className="text-xs text-gray-400">
                                        {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: false }).replace('about ', '')}
                                    </span>
                                </div>
                                <div className="pl-[34px] pr-2">
                                    <p className="text-sm text-gray-500 truncate leading-relaxed">
                                        {c.messages?.[0]?.content || 'No messages yet'}
                                    </p>
                                </div>
                                {selectedId === c.id && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500"></div>}
                            </div>
                        ))
                    )}
                    {loadingMore && (
                        <div className="p-4 flex justify-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                        </div>
                    )}
                </div>
            </div >

            {/* Main Chat */}
            {
                selectedConversation ? (
                    <>
                        <div className="flex-1 flex flex-col bg-white min-w-0">
                            <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 shrink-0 bg-white">
                                <div className="flex items-center gap-3">
                                    <h2 className="font-bold text-gray-900 text-lg">{selectedConversation.contact_name}</h2>
                                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded border border-gray-200 flex items-center gap-1">
                                        <Bot size={12} />
                                        AI Copilot
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <IconButton icon={ExternalLink} size="sm" />
                                    <IconButton icon={X} size="sm" />
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-gray-50/30">
                                <div className="flex justify-center">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200">Today</span>
                                </div>
                                {messages.map(m => {
                                    const isMe = m.sender_type === 'user'
                                    const isBot = m.sender_type === 'bot'
                                    const isSystem = m.sender_type === 'system'

                                    if (isSystem) {
                                        return (
                                            <div key={m.id} className="flex items-center justify-center w-full py-2">
                                                <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                                                    {m.content}
                                                </span>
                                            </div>
                                        )
                                    }

                                    // Customer message (external)
                                    if (!isMe && !isBot) {
                                        return (
                                            <div key={m.id} className="flex items-end gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">
                                                    {selectedConversation.contact_name.charAt(0)}
                                                </div>
                                                <div className="flex flex-col gap-1 max-w-[80%]">
                                                    <div className="bg-gray-100 text-gray-900 rounded-2xl rounded-bl-none px-4 py-3 text-sm leading-relaxed">
                                                        {m.content}
                                                    </div>
                                                    <span className="text-xs text-gray-400 ml-1">{format(new Date(m.created_at), 'HH:mm')}</span>
                                                </div>
                                            </div>
                                        )
                                    }

                                    // Agent/Bot message
                                    return (
                                        <div key={m.id} className="flex items-end gap-3 justify-end">
                                            <div className="flex flex-col gap-1 items-end max-w-[80%]">
                                                <div className={`rounded-2xl rounded-br-none px-4 py-3 text-sm leading-relaxed text-right ${isBot ? 'bg-purple-50 text-purple-900' : 'bg-blue-100 text-blue-900'
                                                    }`}>
                                                    {m.content}
                                                </div>
                                                <div className="flex items-center gap-1.5 mr-1">
                                                    <span className="text-xs text-gray-400">
                                                        {isBot ? 'Fin AI' : 'You'} · {format(new Date(m.created_at), 'HH:mm')}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            <div className="p-6 border-t border-gray-200 bg-white">
                                <div className="border border-gray-300 rounded-xl shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all bg-white overflow-hidden">
                                    <div className="flex items-center gap-1 p-2 border-b border-gray-100 bg-gray-50/50">
                                        <IconButton icon={Paperclip} size="md" />
                                        <IconButton icon={Image} size="md" />
                                        <IconButton icon={Smile} size="md" />
                                    </div>
                                    <textarea
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault()
                                                handleSendMessage()
                                            }
                                        }}
                                        className="w-full p-4 text-sm focus:outline-none min-h-[100px] resize-none"
                                        placeholder="Write a reply..."
                                    />
                                    <div className="px-4 py-3 bg-white flex justify-between items-center">
                                        <span className="text-xs text-gray-400 font-medium">⌘ Enter to send</span>
                                        <div className="flex gap-3">
                                            <button className="p-2 text-yellow-500 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors">
                                                <Zap size={20} />
                                            </button>
                                            <button
                                                onClick={handleSendMessage}
                                                disabled={!input.trim() || isSending}
                                                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
                                            >
                                                Send Reply
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Details Panel */}
                        <div className="w-[300px] border-l border-gray-200 bg-white flex flex-col shrink-0 h-full hidden xl:flex">
                            <div className="h-14 border-b border-gray-200 px-6 flex items-center justify-between shrink-0">
                                <h3 className="font-semibold text-gray-900">Details</h3>
                                <div className="flex gap-2">
                                    <IconButton icon={X} size="sm" />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                                {/* Contact Profile */}
                                <div className="flex flex-col items-center text-center">
                                    <div className="h-20 w-20 rounded-full bg-blue-100 flex items-center justify-center text-xl text-blue-600 font-bold mb-3">
                                        {selectedConversation.contact_name.charAt(0)}
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900">{selectedConversation.contact_name}</h3>
                                    <p className="text-sm text-gray-500 mt-1">{selectedConversation.contact_phone || 'No phone number'}</p>
                                </div>

                                <hr className="border-gray-100" />

                                {/* Key Information */}
                                <div>
                                    <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4">Key Information</h4>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                            <span className="text-sm text-gray-500">Platform</span>
                                            <div className="flex items-center gap-2">
                                                <MessageSquare size={16} className="text-gray-400" />
                                                <span className="text-sm text-gray-900 capitalize">{selectedConversation.platform}</span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                            <span className="text-sm text-gray-500">Status</span>
                                            <span className="text-sm text-gray-900 capitalize">{selectedConversation.status}</span>
                                        </div>
                                        <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                            <span className="text-sm text-gray-500">Received</span>
                                            <span className="text-sm text-gray-900">{format(new Date(selectedConversation.created_at), 'PP p')}</span>
                                        </div>
                                    </div>
                                </div>

                                <hr className="border-gray-100" />

                                {/* Danger Zone */}
                                <div>
                                    <h4 className="text-xs font-bold text-red-600 uppercase tracking-wide mb-4">Danger Zone</h4>
                                    <button
                                        onClick={handleDeleteConversation}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
                                    >
                                        <Trash2 size={18} />
                                        Delete Conversation
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <EmptyState
                            icon={Inbox}
                            title="No conversation selected"
                            description="Select a conversation from the list to view details"
                        />
                    </div>
                )
            }
        </>
    )
}
