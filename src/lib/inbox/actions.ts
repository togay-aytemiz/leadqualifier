'use server'

import { createClient } from '@/lib/supabase/server'
import { Conversation, Message } from '@/types/database'

export async function getConversations(organizationId: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', organizationId)
        .order('last_message_at', { ascending: false })

    if (error) {
        console.error('Error fetching conversations:', error)
        return []
    }

    return data as Conversation[]
}

export async function getMessages(conversationId: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

    if (error) {
        console.error('Error fetching messages:', error)
        return []
    }

    return data as Message[]
}

export async function sendMessage(conversationId: string, content: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('messages')
        .insert({
            conversation_id: conversationId,
            sender_type: 'user', // 'user' means the agent/admin sending the message
            content
        })
        .select()
        .single()

    if (error) throw error

    // Update conversation last_message_at
    await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId)

    return data as Message
}

export async function createMockConversation(organizationId: string) {
    const supabase = await createClient()

    // Create conversation
    const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({
            organization_id: organizationId,
            contact_name: 'Alexandra Anholt',
            contact_phone: '+44 7700 900077',
            platform: 'whatsapp',
            status: 'open',
            last_message_at: new Date().toISOString(),
            unread_count: 1
        })
        .select()
        .single()

    if (convError) throw convError

    // Add some messages
    await supabase.from('messages').insert([
        {
            conversation_id: conv.id,
            sender_type: 'contact',
            content: 'Hey there, can you help me find my order? I think it should have been delivered by now but I haven\'t received it.',
            created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString() // 1 hour ago
        },
        {
            conversation_id: conv.id,
            sender_type: 'system',
            content: 'Bot started serving this conversation.',
            created_at: new Date(Date.now() - 1000 * 60 * 59).toISOString()
        },
        {
            conversation_id: conv.id,
            sender_type: 'bot',
            content: 'Hi Alexandra! No problem let me look into this for you. What is your order number?',
            created_at: new Date(Date.now() - 1000 * 60 * 59).toISOString()
        },
        {
            conversation_id: conv.id,
            sender_type: 'contact',
            content: 'Here you go: #004325.',
            created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString()
        }
    ])

    return conv
}
