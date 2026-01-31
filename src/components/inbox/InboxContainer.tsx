'use client'

import { useState, useEffect } from 'react'
import { Avatar, EmptyState, IconButton } from '@/design'
import { Conversation, Message } from '@/types/database'
import { getMessages, sendMessage, createMockConversation } from '@/lib/inbox/actions'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow, format } from 'date-fns'

interface InboxContainerProps {
    initialConversations: Conversation[]
    organizationId: string
}

export function InboxContainer({ initialConversations, organizationId }: InboxContainerProps) {
    const [conversations, setConversations] = useState<Conversation[]>(initialConversations)
    const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id || null)
    const [messages, setMessages] = useState<Message[]>([])

    const [input, setInput] = useState('')
    const [isSending, setIsSending] = useState(false)

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

    const handleCreateMock = async () => {
        try {
            const newConv = await createMockConversation(organizationId)
            setConversations(prev => [newConv, ...prev])
            setSelectedId(newConv.id)
        } catch (error) {
            console.error('Failed to create mock', error)
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
                        <span className="material-symbols-outlined text-[20px] text-gray-500 group-hover:text-gray-900">keyboard_arrow_down</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <IconButton icon="filter_list" size="sm" />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {conversations.map(c => (
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
                            <div className="pl-[34px]">
                                <p className="text-sm font-medium text-gray-900 mb-1 capitalize">{c.platform}</p>
                                <p className="text-xs text-gray-500 truncate leading-relaxed">{c.status}</p>
                            </div>
                            {selectedId === c.id && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500"></div>}
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Chat */}
            {selectedConversation ? (
                <>
                    <div className="flex-1 flex flex-col bg-white min-w-0">
                        <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 shrink-0 bg-white">
                            <div className="flex items-center gap-3">
                                <h2 className="font-bold text-gray-900 text-lg">{selectedConversation.contact_name}</h2>
                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded border border-gray-200 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[12px]">smart_toy</span>
                                    AI Copilot
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <IconButton icon="open_in_new" size="sm" />
                                <IconButton icon="close" size="sm" />
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
                                    <IconButton icon="attach_file" size="md" />
                                    <IconButton icon="image" size="md" />
                                    <IconButton icon="sentiment_satisfied" size="md" />
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
                                            <span className="material-symbols-outlined">bolt</span>
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
                            <div className="flex items-center gap-4">
                                <h3 className="font-semibold text-gray-900">Details</h3>
                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded border border-gray-200 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[12px]">smart_toy</span>
                                    AI Copilot
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <IconButton icon="open_in_new" size="sm" />
                                <IconButton icon="close" size="sm" />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {/* Assignee */}
                            <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                <span className="text-sm text-gray-500">Assignee</span>
                                <div className="flex items-center gap-2">
                                    <div className="h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center text-xs text-orange-600 font-medium">
                                        {selectedConversation.contact_name.charAt(0)}
                                    </div>
                                    <span className="text-sm text-gray-900 font-medium">{selectedConversation.contact_name}</span>
                                </div>
                                <span className="text-sm text-gray-500">Team</span>
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[16px] text-gray-400">inventory_2</span>
                                    <span className="text-sm text-gray-900">Support</span>
                                </div>
                            </div>

                            <hr className="border-gray-100" />

                            {/* Ticket Attributes */}
                            <div>
                                <div className="flex items-center justify-between mb-4 group cursor-pointer">
                                    <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Ticket Attributes</h4>
                                    <span className="material-symbols-outlined text-gray-400 text-[18px] group-hover:text-gray-600 transition-colors">expand_less</span>
                                </div>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                        <span className="text-sm text-gray-500">Platform</span>
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[16px] text-gray-400">chat</span>
                                            <span className="text-sm text-gray-900 capitalize">{selectedConversation.platform}</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-[100px_1fr] gap-4 items-start">
                                        <span className="text-sm text-gray-500 mt-0.5">Status</span>
                                        <span className="text-sm text-gray-900 capitalize">{selectedConversation.status}</span>
                                    </div>
                                    <div className="grid grid-cols-[100px_1fr] gap-4 items-start">
                                        <span className="text-sm text-gray-500 mt-0.5">Phone</span>
                                        <span className="text-sm text-gray-900">{selectedConversation.contact_phone || 'N/A'}</span>
                                    </div>
                                </div>
                            </div>

                            <hr className="border-gray-100" />

                            {/* Conversation Attributes */}
                            <div>
                                <div className="flex items-center justify-between mb-4 group cursor-pointer">
                                    <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Conversation Attributes</h4>
                                    <span className="material-symbols-outlined text-gray-400 text-[18px] group-hover:text-gray-600 transition-colors">expand_less</span>
                                </div>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                        <span className="text-sm text-gray-500">Subject</span>
                                        <span className="text-sm text-gray-400 hover:text-blue-500 cursor-pointer transition-colors">+ Add</span>
                                    </div>
                                    <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                        <span className="text-sm text-gray-500">ID</span>
                                        <span className="text-sm text-gray-900">#{selectedConversation.id.slice(0, 6)}</span>
                                    </div>
                                    <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                        <span className="text-sm text-gray-500">Priority</span>
                                        <span className="text-sm text-gray-900">Medium</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex-1 flex items-center justify-center">
                    <EmptyState
                        icon="inbox"
                        title="No conversation selected"
                        description="Select a conversation or create a new one"
                        action={
                            <button
                                onClick={handleCreateMock}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 shadow-sm transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">add</span>
                                Create Demo Conversation
                            </button>
                        }
                    />
                </div>
            )}
        </>
    )
}
