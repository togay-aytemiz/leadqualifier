'use client'

import { useState, useEffect } from 'react'
import { InboxLayout } from './InboxLayout'
import { ConversationList } from './ConversationList'
import { ChatWindow } from './ChatWindow'
import { DetailsPanel } from './DetailsPanel'
import { Conversation, Message } from '@/types/database'
import { getConversations, getMessages, sendMessage, createMockConversation } from '@/lib/inbox/actions'
import { createClient } from '@/lib/supabase/client'

interface InboxContainerProps {
    initialConversations: Conversation[]
    organizationId: string
}

export function InboxContainer({ initialConversations, organizationId }: InboxContainerProps) {
    const [conversations, setConversations] = useState<Conversation[]>(initialConversations)
    const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id || null)
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoadingMessages, setIsLoadingMessages] = useState(false)

    // Load messages when selected conversation changes
    useEffect(() => {
        if (!selectedId) return

        async function loadMessages() {
            setIsLoadingMessages(true)
            try {
                const msgs = await getMessages(selectedId!)
                setMessages(msgs)

                // Mark as read locally (optimistic)
                setConversations(prev => prev.map(c =>
                    c.id === selectedId ? { ...c, unread_count: 0 } : c
                ))
            } catch (error) {
                console.error('Failed to load messages', error)
            } finally {
                setIsLoadingMessages(false)
            }
        }

        loadMessages()
    }, [selectedId])

    // Subscribe to realtime changes
    useEffect(() => {
        const supabase = createClient()

        // Subscribe to new messages
        const channel = supabase
            .channel('inbox_realtime')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages' },
                (payload) => {
                    const newMsg = payload.new as Message

                    // If matches current conversation, add to list
                    if (newMsg.conversation_id === selectedId) {
                        setMessages(prev => [...prev, newMsg])
                    }

                    // Update conversation last message time and unread count
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

    const handleSendMessage = async (content: string) => {
        if (!selectedId) return

        // Optimistic update
        const tempMsg: Message = {
            id: 'temp-' + Date.now(),
            conversation_id: selectedId,
            sender_type: 'user',
            content,
            metadata: {},
            created_at: new Date().toISOString()
        }
        setMessages(prev => [...prev, tempMsg])

        // Server action
        try {
            await sendMessage(selectedId, content)
        } catch (error) {
            console.error('Failed to send message', error)
            // Rollback optimistic update if needed
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
        <InboxLayout>
            <ConversationList
                conversations={conversations}
                selectedId={selectedId}
                onSelect={setSelectedId}
            />
            {selectedConversation ? (
                <>
                    <ChatWindow
                        conversation={selectedConversation}
                        messages={messages}
                        onSendMessage={handleSendMessage}
                    />
                    <DetailsPanel conversation={selectedConversation} />
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 text-gray-500">
                    <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p className="text-lg font-medium">No conversation selected</p>
                    {conversations.length === 0 && (
                        <button
                            onClick={handleCreateMock}
                            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                        >
                            Create Demo Conversation
                        </button>
                    )}
                </div>
            )}
        </InboxLayout>
    )
}
