'use server'

import { createClient } from '@/lib/supabase/server'
import { withBotNamePrompt } from '@/lib/ai/prompts'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { recordAiUsage } from '@/lib/ai/usage'
import { Conversation, Message } from '@/types/database'

export type ConversationSummaryResult =
    | { ok: true; summary: string }
    | { ok: false; reason: 'insufficient_data' | 'missing_api_key' | 'request_failed' }

export async function getConversations(organizationId: string, page: number = 0, pageSize: number = 20) {
    const supabase = await createClient()

    const from = page * pageSize
    const to = from + pageSize - 1

    const { data, error } = await supabase
        .from('conversations')
        .select(`
            *,
            *,
            active_agent,
            assignee:assignee_id(
                full_name,
                email
            ),
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

const SUMMARY_USER_LIMIT = 5
const SUMMARY_MAX_CHARS = 600

type SummaryMessage = Pick<Message, 'content' | 'created_at' | 'sender_type'>

function truncateSummaryText(text: string, maxChars: number) {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (normalized.length <= maxChars) return normalized
    return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`
}

function formatSummaryMessages(messages: SummaryMessage[], botName: string) {
    return messages.map((message, index) => {
        const roleLabel = message.sender_type === 'bot' ? botName : 'User'
        const timestamp = new Date(message.created_at).toISOString()
        const content = truncateSummaryText(message.content ?? '', SUMMARY_MAX_CHARS)
        return `${index + 1}. [${timestamp}] ${roleLabel}: ${content}`
    }).join('\n')
}

export async function getConversationSummary(
    conversationId: string,
    organizationId: string
): Promise<ConversationSummaryResult> {
    if (!process.env.OPENAI_API_KEY) {
        return { ok: false, reason: 'missing_api_key' }
    }

    const supabase = await createClient()
    const aiSettings = await getOrgAiSettings(organizationId, { supabase })

    const [contactResult, botResult] = await Promise.all([
        supabase
            .from('messages')
            .select('content, created_at, sender_type')
            .eq('conversation_id', conversationId)
            .eq('organization_id', organizationId)
            .eq('sender_type', 'contact')
            .order('created_at', { ascending: false })
            .limit(SUMMARY_USER_LIMIT),
        supabase
            .from('messages')
            .select('content, created_at, sender_type')
            .eq('conversation_id', conversationId)
            .eq('organization_id', organizationId)
            .eq('sender_type', 'bot')
            .order('created_at', { ascending: false })
            .limit(1)
    ])

    if (contactResult.error || botResult.error) {
        console.error('Error fetching summary messages:', contactResult.error || botResult.error)
        return { ok: false, reason: 'request_failed' }
    }

    const contactMessages = (contactResult.data ?? []) as SummaryMessage[]
    const botMessage = (botResult.data ?? [])[0] as SummaryMessage | undefined

    if (contactMessages.length < SUMMARY_USER_LIMIT || !botMessage) {
        return { ok: false, reason: 'insufficient_data' }
    }

    const combined = [...contactMessages, botMessage]
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    const formattedMessages = formatSummaryMessages(combined, aiSettings.bot_name)

    try {
        const { default: OpenAI } = await import('openai')
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
        const basePrompt = [
            'You summarize only from the provided messages.',
            'Do not add facts or assumptions.',
            'Respond with a single paragraph in Turkish, 2-3 sentences.'
        ].join(' ')
        const systemPrompt = withBotNamePrompt(basePrompt, aiSettings.bot_name)
        const userPrompt = `Summarize the conversation using only the messages below:\n${formattedMessages}`

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.2,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]
        })

        const usage = completion.usage
            ? {
                inputTokens: completion.usage.prompt_tokens ?? 0,
                outputTokens: completion.usage.completion_tokens ?? 0,
                totalTokens: completion.usage.total_tokens ?? (completion.usage.prompt_tokens ?? 0) + (completion.usage.completion_tokens ?? 0)
            }
            : {
                inputTokens: estimateTokenCount(systemPrompt) + estimateTokenCount(userPrompt),
                outputTokens: estimateTokenCount(completion.choices[0]?.message?.content ?? ''),
                totalTokens: estimateTokenCount(systemPrompt) + estimateTokenCount(userPrompt) + estimateTokenCount(completion.choices[0]?.message?.content ?? '')
            }

        await recordAiUsage({
            organizationId,
            category: 'summary',
            model: 'gpt-4o-mini',
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            metadata: {
                conversation_id: conversationId
            },
            supabase
        })

        const summary = completion.choices[0]?.message?.content?.trim()
        if (!summary) {
            return { ok: false, reason: 'request_failed' }
        }

        return { ok: true, summary }
    } catch (error) {
        console.error('Summary request failed:', error)
        return { ok: false, reason: 'request_failed' }
    }
}

export async function markConversationRead(conversationId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('conversations')
        .update({
            unread_count: 0,
            updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
        .gt('unread_count', 0)

    if (error) {
        console.error('Error marking conversation as read:', error)
    }
}

export async function sendMessage(
    conversationId: string,
    content: string
): Promise<{ message: Message; conversation: Conversation }> {
    const supabase = await createClient()

    // 1. Get conversation details to know platform and recipient
    const { data: conversation } = await supabase
        .from('conversations')
        .select('platform, contact_phone, organization_id')
        .eq('id', conversationId)
        .single()

    if (!conversation) throw new Error('Conversation not found')

    // 2. If Telegram, send via API
    if (conversation.platform === 'telegram') {
        // Find the active telegram channel for this org
        const { data: channel } = await supabase
            .from('channels')
            .select('config')
            .eq('organization_id', conversation.organization_id)
            .eq('type', 'telegram')
            .eq('status', 'active')
            .single()

        if (channel && channel.config?.bot_token) {
            try {
                const { TelegramClient } = await import('@/lib/telegram/client')
                const client = new TelegramClient(channel.config.bot_token)
                await client.sendMessage(conversation.contact_phone, content)
            } catch (error) {
                console.error('Failed to send Telegram message:', error)
                throw new Error('Failed to send message to Telegram API')
            }
        } else {
            console.warn('No active Telegram channel found for this organization')
        }
    }

    // 3. Save to DB + assign operator atomically
    const { data, error } = await supabase.rpc('send_operator_message', {
        p_conversation_id: conversationId,
        p_content: content
    })

    if (error) throw error
    if (!data) throw new Error('Failed to send message')

    return data as { message: Message; conversation: Conversation }
}

export async function setConversationAgent(conversationId: string, agent: 'bot' | 'operator') {
    const supabase = await createClient()

    // If switching to bot, we MUST clear the assignee_id to release the lock in webhook
    const updates: any = { active_agent: agent }
    if (agent === 'bot') {
        updates.assignee_id = null
    }

    const { error } = await supabase
        .from('conversations')
        .update(updates)
        .eq('id', conversationId)

    if (error) throw error
    return true
}

export async function sendSystemMessage(conversationId: string, content: string) {
    const supabase = await createClient()

    // 1. Get conversation details (need org ID)
    const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('organization_id')
        .eq('id', conversationId)
        .single()

    if (convError || !conversation) throw new Error('Conversation not found')

    const { data, error } = await supabase
        .from('messages')
        .insert({
            conversation_id: conversationId,
            organization_id: conversation.organization_id,
            sender_type: 'system',
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
            organization_id: organizationId,
            sender_type: 'contact',
            content: 'Hey there, can you help me find my order? I think it should have been delivered by now but I haven\'t received it.',
            created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString() // 1 hour ago
        },
        {
            conversation_id: conv.id,
            organization_id: organizationId,
            sender_type: 'system',
            content: 'Bot started serving this conversation.',
            created_at: new Date(Date.now() - 1000 * 60 * 59).toISOString()
        },
        {
            conversation_id: conv.id,
            organization_id: organizationId,
            sender_type: 'bot',
            content: 'Hi Alexandra! No problem let me look into this for you. What is your order number?',
            created_at: new Date(Date.now() - 1000 * 60 * 59).toISOString()
        },
        {
            conversation_id: conv.id,
            organization_id: organizationId,
            sender_type: 'contact',
            content: 'Here you go: #004325.',
            created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString()
        }
    ])

    return conv
}
