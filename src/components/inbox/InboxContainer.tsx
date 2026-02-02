'use client'

import { useState, useEffect, useRef } from 'react'
import { Avatar, EmptyState, IconButton } from '@/design'
import {
    Inbox, ChevronDown, ExternalLink, X,
    Paperclip, Image, Smile, Zap, Bot, Trash2, MessageSquare, MoreHorizontal, LogOut, User
} from 'lucide-react'
import { Conversation, Message } from '@/types/database'
import { getMessages, sendMessage, getConversations, deleteConversation, sendSystemMessage, setConversationAgent } from '@/lib/inbox/actions'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow, format } from 'date-fns'
import { tr } from 'date-fns/locale'

import { useTranslations, useLocale } from 'next-intl'

interface InboxContainerProps {
    initialConversations: Conversation[]
    organizationId: string
}

export function InboxContainer({ initialConversations, organizationId }: InboxContainerProps) {
    const t = useTranslations('inbox')
    const locale = useLocale()
    const dateLocale = locale === 'tr' ? tr : undefined
    const [conversations, setConversations] = useState<any[]>(initialConversations)
    const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id || null)
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [isSending, setIsSending] = useState(false)
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(initialConversations.length >= 20)
    const [loadingMore, setLoadingMore] = useState(false)
    const [isDetailsMenuOpen, setIsDetailsMenuOpen] = useState(false)
    const [isLeaving, setIsLeaving] = useState(false)

    const messagesEndRef = useRef<HTMLDivElement>(null)


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
            }
        }
        loadMessages()
    }, [selectedId])

    // Scroll Management
    const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
        if (!messagesEndRef.current) return

        // Use setTimeout to ensure DOM is fully rendered/layout updated
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' })
        }, 100)
    }

    // Effect for conversation switch (Instant scroll)
    useEffect(() => {
        scrollToBottom('auto')
    }, [selectedId])

    // Effect for new messages (Smooth scroll)
    // We strictly track 'messages' length or content change?
    // Just messages dependency is fine, but we need to avoid fighting with selectedId.
    // Actually, separating them is safer.
    const prevMessagesLength = useRef(0)
    useEffect(() => {
        if (messages.length > prevMessagesLength.current) {
            scrollToBottom('smooth')
        }
        prevMessagesLength.current = messages.length
    }, [messages])

    // Also force scroll on mount/updates just in case
    // useEffect(() => { scrollToBottom() }, [])
    // No, better to be specific.

    // Check if we need to scroll when isLeaving changes (optimistic update changes messages, so handled above)

    // ... re-insert realtime subscriptions ...

    // Keep a ref to selectedId to use in realtime callbacks without re-subscribing
    const selectedIdRef = useRef(selectedId)
    useEffect(() => {
        selectedIdRef.current = selectedId
    }, [selectedId])

    useEffect(() => {
        const supabase = createClient()

        console.log('Setting up Realtime subscription...')

        const channel = supabase.channel('inbox_global')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                const newMsg = payload.new as Message
                console.log('Realtime Message received:', newMsg)

                // 1. Update active chat if it matches selectedId
                if (newMsg.conversation_id === selectedIdRef.current) {
                    setMessages(prev => {
                        // Check if we already have this message (dedupe real IDs)
                        if (prev.some(m => m.id === newMsg.id)) return prev;

                        // Dedupe optimistic messages:
                        // If we find a temp message with same content & sender, remove it and add real one
                        const isUserSender = newMsg.sender_type === 'user';

                        // Filter out matching temp messages if it's a user message
                        const filtered = isUserSender
                            ? prev.filter(m => !(m.id.startsWith('temp-') && m.content === newMsg.content && m.sender_type === 'user'))
                            : prev;

                        return [...filtered, newMsg];
                    })
                }

                // 2. Update conversation list (unread, last_message, sort)
                setConversations(prev => prev.map(c => {
                    if (c.id === newMsg.conversation_id) {
                        return {
                            ...c,
                            last_message_at: newMsg.created_at,
                            // Only increment unread if it's NOT the currently open chat
                            unread_count: newMsg.conversation_id !== selectedIdRef.current ? c.unread_count + 1 : 0,
                            // If we have messages snippet in list, update it too
                            messages: [{ content: newMsg.content, created_at: newMsg.created_at, sender_type: newMsg.sender_type } as any]
                        }
                    }
                    return c
                }).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()))
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (payload) => {
                const newOrUpdatedConv = payload.new as Conversation
                console.log('Realtime Conversation event:', payload.eventType, newOrUpdatedConv)

                setConversations(prev => {
                    // Check if exists
                    const exists = prev.some(c => c.id === newOrUpdatedConv.id)

                    if (exists) {
                        // UPDATE logic
                        return prev.map(c => {
                            if (c.id === newOrUpdatedConv.id) {
                                return {
                                    ...c,
                                    ...newOrUpdatedConv,
                                    assignee: c.assignee // Preserve joined relations if possible, or we might need to fetch
                                }
                            }
                            return c
                        }).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
                    } else {
                        // INSERT logic (New conversation)
                        // Note: We won't have the 'assignee' object populated (it's null or just ID) until a fetch, 
                        // but for a new open conversation that's fine.
                        return [newOrUpdatedConv, ...prev]
                            .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
                    }
                })
            })
            .subscribe((status) => {
                console.log('Realtime Subscription Status:', status)
            })

        return () => {
            console.log('Cleaning up Realtime subscription...')
            supabase.removeChannel(channel)
        }
    }, []) // Empty dependency array = Stable Subscription

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

        // Optimistically set active agent to operator
        setConversations(prev => prev.map(c =>
            c.id === selectedId ? {
                ...c,
                active_agent: 'operator',
                last_message_at: new Date().toISOString()
            } : c
        ))

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
        if (window.confirm(t('deleteConfirm'))) {
            try {
                await deleteConversation(selectedId)
                setConversations(prev => prev.filter(c => c.id !== selectedId))
                setSelectedId(null)
            } catch (error) {
                console.error('Failed to delete conversation', error)
            }
        }
    }

    const handleLeaveConversation = async () => {
        if (!selectedId || isLeaving) return

        setIsLeaving(true)
        const content = `${t('operator')} ${t('leftSession')}`

        // Optimistic update
        const tempMsg: Message = {
            id: 'temp-sys-' + Date.now(),
            conversation_id: selectedId,
            sender_type: 'system',
            content: content,
            metadata: {},
            created_at: new Date().toISOString()
        }
        setMessages(prev => [...prev, tempMsg])

        try {
            // Send a system message to mark the end of operator session
            await sendSystemMessage(selectedId, content)
            // Explicitly set agent back to bot
            await setConversationAgent(selectedId, 'bot')

            // Update local state
            setConversations(prev => prev.map(c =>
                c.id === selectedId ? { ...c, active_agent: 'bot' } : c
            ))
        } catch (e) {
            console.error(e)
            // Ideally remove optimistic message here on fail
        } finally {
            setIsLeaving(false)
        }
    }

    const selectedConversation = conversations.find(c => c.id === selectedId)

    // Calculate active agent based on last outgoing message
    const lastOutgoingMessage = messages
        .slice()
        .reverse()
        .find(m => m.sender_type === 'user' || m.sender_type === 'bot' || m.sender_type === 'system')

    // Default to AI if no history, otherwise check who sent last
    // If system sent last (e.g. "Operator left"), it defaults to AI (operator only if 'user')
    // const activeAgent = lastOutgoingMessage?.sender_type === 'user' ? 'operator' : 'ai'

    // NEW: Use explicit state from conversation
    // Fallback to 'ai' (bot) if undefined (e.g. old data or optimistic new conv)
    const activeAgent = selectedConversation?.active_agent === 'operator' ? 'operator' : 'ai'

    return (
        <>
            {/* Conversation List */}
            <div className="w-[320px] border-r border-gray-200 flex flex-col h-full bg-gray-50/30">
                <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 shrink-0 bg-white">
                    <div className="flex items-center gap-1 cursor-pointer group">
                        <span className="text-lg font-bold text-gray-900">{t('title')}</span>
                        <ChevronDown className="text-gray-500 group-hover:text-gray-900" size={20} />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
                    {conversations.length === 0 ? (
                        <div className="flex flex-col items-center justify-start h-full p-6 pt-20 text-center">
                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                                <Inbox className="text-gray-400" size={24} />
                            </div>
                            <h3 className="text-sm font-medium text-gray-900">{t('noMessages')}</h3>
                            <p className="text-xs text-gray-500 mt-1">{t('noMessagesDesc')}</p>
                        </div>
                    ) : (
                        conversations.map(c => (
                            <div
                                key={c.id}
                                onClick={() => setSelectedId(c.id)}
                                className={`px-4 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors relative group bg-white ${selectedId === c.id ? "bg-blue-50/30" : ""}`}
                            >
                                <div className="flex justify-between items-start mb-1.5">
                                    <div className="flex items-center gap-2.5">
                                        <Avatar name={c.contact_name} size="sm" />
                                        <span className={`text-sm font-semibold ${c.unread_count > 0 ? "text-gray-900" : "text-gray-700"}`}>{c.contact_name}</span>
                                    </div>
                                    <span className="text-xs text-gray-400">
                                        {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: false, locale: dateLocale }).replace('about ', '')}
                                    </span>
                                </div>
                                <div className="pl-[34px] pr-2">
                                    <p className="text-sm text-gray-500 truncate leading-relaxed">
                                        {c.messages?.[0]?.content || t('noMessagesYet')}
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
            {selectedConversation ? (
                <>
                    <div className="flex-1 flex flex-col bg-white min-w-0">
                        <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 shrink-0 bg-white">
                            <div className="flex items-center gap-3">
                                <h2 className="font-bold text-gray-900 text-lg">{selectedConversation.contact_name}</h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-xs px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition-colors ${activeAgent === 'ai'
                                    ? 'bg-purple-50 text-purple-700 border-purple-100'
                                    : 'bg-blue-50 text-blue-700 border-blue-100'
                                    }`}>
                                    {activeAgent === 'ai' ? <Bot size={14} /> : <Zap size={14} />}
                                    <span className="font-medium">
                                        {activeAgent === 'ai' ? t('copilot') : t('operator')}
                                    </span>
                                </span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-gray-50/30">
                            <div className="flex justify-center">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200">{t('today')}</span>
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
                                                <span className="text-xs text-gray-400 ml-1">{format(new Date(m.created_at), 'HH:mm', { locale: dateLocale })}</span>
                                            </div>
                                        </div>
                                    )
                                }

                                return (
                                    <div key={m.id} className="flex items-end gap-3 justify-end">
                                        <div className="flex flex-col gap-1 items-end max-w-[80%]">
                                            <div className={`rounded-2xl rounded-br-none px-4 py-3 text-sm leading-relaxed text-right ${isBot ? 'bg-purple-50 text-purple-900' : 'bg-blue-100 text-blue-900'}`}>
                                                {m.content}
                                            </div>
                                            <div className="flex items-center gap-1.5 mr-1">
                                                <span className="text-xs text-gray-400">
                                                    {isBot ? t('botName') : t('you')} · {format(new Date(m.created_at), 'HH:mm', { locale: dateLocale })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                            <div ref={messagesEndRef} />
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
                                    placeholder={t('replyPlaceholder')}
                                />
                                <div className="px-4 py-3 bg-white flex justify-between items-center">
                                    <span className="text-xs text-gray-400 font-medium">{t('sendShortcut')}</span>
                                    <div className="flex gap-3">
                                        <button className="p-2 text-yellow-500 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors">
                                            <Zap size={20} />
                                        </button>
                                        <button
                                            onClick={handleSendMessage}
                                            disabled={!input.trim() || isSending}
                                            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
                                        >
                                            {t('sendButton')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Details Panel */}
                    <div className="w-[360px] border-l border-gray-200 bg-white flex flex-col shrink-0 h-full hidden xl:flex">
                        <div className="h-14 border-b border-gray-200 px-6 flex items-center justify-between shrink-0">
                            <h3 className="font-semibold text-gray-900">{t('details')}</h3>
                            <div className="relative">
                                <button
                                    onClick={() => setIsDetailsMenuOpen(!isDetailsMenuOpen)}
                                    className="p-1 hover:bg-gray-100 rounded text-gray-500"
                                >
                                    <MoreHorizontal size={20} />
                                </button>

                                {isDetailsMenuOpen && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-10"
                                            onClick={() => setIsDetailsMenuOpen(false)}
                                        />
                                        <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 shadow-lg rounded-lg z-20 py-1">
                                            <button
                                                onClick={() => {
                                                    handleDeleteConversation()
                                                    setIsDetailsMenuOpen(false)
                                                }}
                                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                            >
                                                <Trash2 size={16} />
                                                {t('deleteConversation')}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 flex flex-col">
                            <div className="flex flex-col items-center text-center">
                                <div className="h-20 w-20 rounded-full bg-blue-100 flex items-center justify-center text-xl text-blue-600 font-bold mb-3">
                                    {selectedConversation.contact_name.charAt(0)}
                                </div>
                                <h3 className="text-lg font-bold text-gray-900">{selectedConversation.contact_name}</h3>
                                <p className="text-sm text-gray-500 mt-1">{selectedConversation.contact_phone || 'No phone number'}</p>
                            </div>

                            <hr className="border-gray-100 my-6" />

                            <div className="flex-1">
                                <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4">{t('keyInfo')}</h4>
                                <div className="space-y-4">
                                    {/* Active Agent Status */}
                                    <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                        <span className="text-sm text-gray-500">{t('activeAgent')}</span>
                                        <div className="flex items-start flex-col gap-1">
                                            {activeAgent === 'ai' ? (
                                                <span className="text-xs text-purple-700 font-medium bg-purple-50 px-2 py-0.5 rounded flex items-center gap-1 w-fit">
                                                    <Bot size={12} />
                                                    {t('copilot')}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded flex items-center gap-1 w-fit">
                                                    <Zap size={12} />
                                                    {t('operator')}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Assigned Operator */}
                                    {activeAgent === 'operator' && (
                                        <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                            <span className="text-sm text-gray-500">{t('operator')}</span>
                                            <div className="text-sm text-gray-900">
                                                {selectedConversation.assignee ? (
                                                    <span>{selectedConversation.assignee.full_name}</span>
                                                ) : (
                                                    <span className="text-orange-500 text-xs font-medium">Unassigned</span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                        <span className="text-sm text-gray-500">{t('platform')}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-gray-900 capitalize">{selectedConversation.platform}</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                        <span className="text-sm text-gray-500">{t('received')}</span>
                                        <span className="text-sm text-gray-900">{format(new Date(selectedConversation.created_at), 'PP p', { locale: dateLocale })}</span>
                                    </div>
                                </div>
                            </div>

                            <hr className="border-gray-100 my-6" />

                            <div className="mt-auto">
                                {activeAgent === 'operator' && (
                                    <button
                                        onClick={handleLeaveConversation}
                                        disabled={isLeaving}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <LogOut size={18} />
                                        {isLeaving ? 'Leaving...' : t('leaveConversation')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div >
                </>
            ) : (
                <div className="flex-1 flex items-center justify-center">
                    <EmptyState
                        icon={Inbox}
                        title={t('noSelection')}
                        description={t('noSelectionDesc')}
                    />
                </div>
            )}
        </>
    )
}
