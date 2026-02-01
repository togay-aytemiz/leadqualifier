'use server'

import { createClient } from '@/lib/supabase/server'
import { Conversation, Message } from '@/types/database'

export async function getConversations(organizationId: string, page: number = 0, pageSize: number = 20) {
    const supabase = await createClient()

    const from = page * pageSize
    const to = from + pageSize - 1

    const { data, error } = await supabase
        .from('conversations')
        .select(`
            *,
            messages (
                content,
                created_at,
                sender_type
            )
        `)
        .eq('organization_id', organizationId)
        .order('last_message_at', { ascending: false })
        .order('created_at', { foreignTable: 'messages', ascending: false })
        .limit(1, { foreignTable: 'messages' })
        .range(from, to)

    if (error) {
        console.error('Error fetching conversations:', error)
        return []
    }

    return data as any[]
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

export async function deleteConversation(conversationId: string) {
    const supabase = await createClient()

    // 1. Delete messages first (if not cascading, but good practice to be explicit or if we want soft delete later)
    const { error: msgError } = await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', conversationId)

    if (msgError) {
        console.error('Error deleting messages:', msgError)
        throw msgError
    }

    // 2. Delete conversation
    const { error: convError } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId)

    if (convError) {
        console.error('Error deleting conversation:', convError)
        throw convError
    }

    return true
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
