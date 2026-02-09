'use server'

import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import { withBotNamePrompt } from '@/lib/ai/prompts'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { recordAiUsage } from '@/lib/ai/usage'
import { matchesCatalog } from '@/lib/leads/catalog'
import { runLeadExtraction } from '@/lib/leads/extraction'
import { assertTenantWriteAllowed } from '@/lib/organizations/active-context'
import { Conversation, Lead, Message, Json } from '@/types/database'

export type ConversationSummaryResult =
    | { ok: true; summary: string }
    | { ok: false; reason: 'insufficient_data' | 'missing_api_key' | 'request_failed' }

export type LeadScoreReasonResult =
    | { ok: true; reasoning: string }
    | { ok: false; reason: 'missing_api_key' | 'missing_lead' | 'request_failed' }

export type LeadRefreshResult =
    | { ok: true }
    | { ok: false; reason: 'missing_api_key' | 'missing_conversation' | 'request_failed' }

type ConversationPreviewMessage = Pick<Message, 'content' | 'created_at' | 'sender_type'>
type ConversationLeadPreview = { status?: string | null }
type ConversationAssigneePreview = { full_name?: string | null; email?: string | null }
type ConversationPreviewMessageRow = Pick<Message, 'conversation_id' | 'content' | 'created_at' | 'sender_type'>
type ConversationLeadPreviewRow = { conversation_id: string; status?: string | null }
type ConversationAssigneePreviewRow = { id: string; full_name?: string | null; email?: string | null }
const SUMMARY_MAX_OUTPUT_TOKENS = 180
const LEAD_REASONING_MAX_OUTPUT_TOKENS = 220

export interface ConversationListItem extends Conversation {
    assignee?: ConversationAssigneePreview | null
    leads?: ConversationLeadPreview[]
    messages?: ConversationPreviewMessage[]
}

function buildConversationListItemsFromFallback(
    conversations: Conversation[],
    messageRows: ConversationPreviewMessageRow[],
    leadRows: ConversationLeadPreviewRow[],
    assigneeRows: ConversationAssigneePreviewRow[]
): ConversationListItem[] {
    const messageByConversationId = new Map<string, ConversationPreviewMessage>()
    for (const message of messageRows) {
        if (messageByConversationId.has(message.conversation_id)) continue
        messageByConversationId.set(message.conversation_id, {
            content: message.content,
            created_at: message.created_at,
            sender_type: message.sender_type
        })
    }

    const leadByConversationId = new Map<string, ConversationLeadPreview>()
    for (const lead of leadRows) {
        if (leadByConversationId.has(lead.conversation_id)) continue
        leadByConversationId.set(lead.conversation_id, { status: lead.status })
    }

    const assigneeById = new Map<string, ConversationAssigneePreview>()
    for (const assignee of assigneeRows) {
        assigneeById.set(assignee.id, {
            full_name: assignee.full_name,
            email: assignee.email
        })
    }

    return conversations.map((conversation) => {
        const latestMessage = messageByConversationId.get(conversation.id)
        const lead = leadByConversationId.get(conversation.id)
        const assignee = conversation.assignee_id
            ? (assigneeById.get(conversation.assignee_id) ?? null)
            : null

        return {
            ...conversation,
            messages: latestMessage ? [latestMessage] : [],
            leads: lead ? [lead] : [],
            assignee
        }
    })
}

export async function getConversations(
    organizationId: string,
    page: number = 0,
    pageSize: number = 20
): Promise<ConversationListItem[]> {
    const supabase = await createClient()

    const from = page * pageSize
    const to = from + pageSize - 1

    const { data, error } = await supabase
        .from('conversations')
        .select(`
            *,
            active_agent,
            assignee:assignee_id(
                full_name,
                email
            ),
            leads (
                status
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
        .limit(1, { foreignTable: 'leads' })
        .range(from, to)

    if (!error) {
        return (data ?? []) as ConversationListItem[]
    }

    console.warn('Error fetching conversations with nested query, using fallback:', error)

    const { data: conversationRows, error: conversationError } = await supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', organizationId)
        .order('last_message_at', { ascending: false })
        .range(from, to)

    if (conversationError) {
        console.error('Error fetching conversations fallback:', conversationError)
        return []
    }

    const conversations = (conversationRows ?? []) as Conversation[]
    if (conversations.length === 0) {
        return []
    }

    const conversationIds = conversations.map((conversation) => conversation.id)
    const assigneeIds = Array.from(new Set(
        conversations
            .map((conversation) => conversation.assignee_id)
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
    ))

    const [messagesResult, leadsResult, assigneesResult] = await Promise.all([
        supabase
            .from('messages')
            .select('conversation_id, content, created_at, sender_type')
            .eq('organization_id', organizationId)
            .in('conversation_id', conversationIds)
            .order('created_at', { ascending: false }),
        supabase
            .from('leads')
            .select('conversation_id, status')
            .eq('organization_id', organizationId)
            .in('conversation_id', conversationIds),
        assigneeIds.length > 0
            ? supabase
                .from('profiles')
                .select('id, full_name, email')
                .in('id', assigneeIds)
            : Promise.resolve({
                data: [] as ConversationAssigneePreviewRow[],
                error: null
            })
    ])

    if (messagesResult.error) {
        console.warn('Failed to load conversation preview messages in fallback:', messagesResult.error)
    }
    if (leadsResult.error) {
        console.warn('Failed to load conversation lead previews in fallback:', leadsResult.error)
    }
    if (assigneesResult.error) {
        console.warn('Failed to load conversation assignees in fallback:', assigneesResult.error)
    }

    const messageRows = (messagesResult.data ?? []) as ConversationPreviewMessageRow[]
    const leadRows = (leadsResult.data ?? []) as ConversationLeadPreviewRow[]
    const assigneeRows = (assigneesResult.data ?? []) as ConversationAssigneePreviewRow[]

    return buildConversationListItemsFromFallback(
        conversations,
        messageRows,
        leadRows,
        assigneeRows
    )
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

export async function getConversationLead(conversationId: string): Promise<Lead | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('conversation_id', conversationId)
        .maybeSingle()

    if (error) {
        console.error('Error fetching lead:', error)
        return null
    }

    return (data as Lead) ?? null
}

const SUMMARY_USER_LIMIT = 5
const SUMMARY_MAX_CHARS = 600

type SummaryMessage = Pick<Message, 'content' | 'created_at' | 'sender_type'>

function truncateSummaryText(text: string, maxChars: number) {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (normalized.length <= maxChars) return normalized
    return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`
}

function formatSummaryMessages(messages: SummaryMessage[], botName: string, locale: string) {
    const customerLabel = locale === 'tr' ? 'Müşteri' : 'Customer'
    return messages.map((message, index) => {
        const roleLabel = message.sender_type === 'bot' ? botName : customerLabel
        const timestamp = new Date(message.created_at).toISOString()
        const content = truncateSummaryText(message.content ?? '', SUMMARY_MAX_CHARS)
        return `${index + 1}. [${timestamp}] ${roleLabel}: ${content}`
    }).join('\n')
}

export async function getConversationSummary(
    conversationId: string,
    organizationId: string,
    locale: string = 'tr'
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

    const formattedMessages = formatSummaryMessages(combined, aiSettings.bot_name, locale)
    const responseLanguage = locale === 'tr' ? 'Turkish' : 'English'

    try {
        const { default: OpenAI } = await import('openai')
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
        const basePrompt = [
            'You summarize only from the provided messages.',
            'Do not add facts or assumptions.',
            `Respond with a single paragraph in ${responseLanguage}, 2-3 sentences.`
        ].join(' ')
        const systemPrompt = withBotNamePrompt(basePrompt, aiSettings.bot_name)
        const userPrompt = `Summarize the conversation using only the messages below:\n${formattedMessages}`

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.2,
            max_tokens: SUMMARY_MAX_OUTPUT_TOKENS,
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

export async function getLeadScoreReasoning(
    conversationId: string,
    organizationId: string,
    locale: string = 'tr',
    statusLabel?: string
): Promise<LeadScoreReasonResult> {
    if (!process.env.OPENAI_API_KEY) {
        return { ok: false, reason: 'missing_api_key' }
    }

    const supabase = await createClient()

    const [{ data: lead }, { data: profile }, { data: catalog }, { data: suggestions }] = await Promise.all([
        supabase
            .from('leads')
            .select('*')
            .eq('conversation_id', conversationId)
            .eq('organization_id', organizationId)
            .maybeSingle(),
        supabase
            .from('offering_profiles')
            .select('summary, manual_profile_note, catalog_enabled')
            .eq('organization_id', organizationId)
            .maybeSingle(),
        supabase
            .from('service_catalog')
            .select('name, aliases, active')
            .eq('organization_id', organizationId)
            .eq('active', true),
        supabase
            .from('offering_profile_suggestions')
            .select('content')
            .eq('organization_id', organizationId)
            .eq('status', 'approved')
            .is('archived_at', null)
            .is('update_of', null)
            .order('created_at', { ascending: false })
            .limit(5)
    ])

    if (!lead) {
        return { ok: false, reason: 'missing_lead' }
    }

    const suggestionText = (suggestions ?? [])
        .map((item: { content?: string | null }) => `- ${item.content}`)
        .reverse()
        .join('\n')

    const catalogEnabled = profile?.catalog_enabled ?? true
    const hasCatalogMatch = catalogEnabled && matchesCatalog(lead.service_type, catalog ?? [])
    const hasProfileContent = Boolean((profile?.summary ?? '').trim() || (profile?.manual_profile_note ?? '').trim() || suggestionText)

    const extractedFields = (lead.extracted_fields ?? {}) as {
        desired_date?: string | null
        location?: string | null
        budget_signals?: string[]
        intent_signals?: string[]
        risk_signals?: string[]
    }

    const intentSignals = Array.isArray(extractedFields.intent_signals) ? extractedFields.intent_signals : []
    const budgetSignals = Array.isArray(extractedFields.budget_signals) ? extractedFields.budget_signals : []

    const responseLanguage = locale === 'tr' ? 'Turkish' : 'English'

    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
        const systemPrompt = [
            'You explain why the lead score has its current value.',
            'The score and status are produced by lead extraction (LLM output).',
            'Use only the provided extracted data and profile/catalog context.',
            'Do not infer facts that are not present.',
            `Respond in ${responseLanguage} with 2-4 short bullet points.`,
            statusLabel ? 'Use the provided status label verbatim; do not translate or use English status keys.' : 'Avoid English status keys.',
            'If data is missing, mention that explicitly.'
        ].join(' ')
        const userPrompt = `Score payload:\n${JSON.stringify({
            score: {
                total: lead.total_score,
                status_label: statusLabel ?? null,
                status: lead.status
            },
            service_type: lead.service_type,
            extracted_fields: {
                desired_date: extractedFields.desired_date ?? null,
                location: extractedFields.location ?? null,
                budget_signals: budgetSignals,
                intent_signals: intentSignals,
                risk_signals: extractedFields.risk_signals ?? []
            },
            profile: {
                has_catalog_match: hasCatalogMatch,
                has_profile_content: hasProfileContent
            }
        }, null, 2)}`

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.2,
            max_tokens: LEAD_REASONING_MAX_OUTPUT_TOKENS,
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
            category: 'lead_reasoning',
            model: 'gpt-4o-mini',
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            metadata: {
                conversation_id: conversationId
            },
            supabase
        })

        const reasoning = completion.choices[0]?.message?.content?.trim()
        if (!reasoning) {
            return { ok: false, reason: 'request_failed' }
        }

        return { ok: true, reasoning }
    } catch (error) {
        console.error('Lead score reasoning failed:', error)
        return { ok: false, reason: 'request_failed' }
    }
}

export async function refreshConversationLead(
    conversationId: string,
    organizationId: string
): Promise<LeadRefreshResult> {
    if (!process.env.OPENAI_API_KEY) {
        return { ok: false, reason: 'missing_api_key' }
    }

    const supabase = await createClient()
    try {
        await assertTenantWriteAllowed(supabase)
    } catch {
        return { ok: false, reason: 'request_failed' }
    }

    const { data: conversation, error } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('organization_id', organizationId)
        .maybeSingle()

    if (error || !conversation) {
        return { ok: false, reason: 'missing_conversation' }
    }

    try {
        await runLeadExtraction({
            organizationId,
            conversationId,
            supabase
        })
        return { ok: true }
    } catch (error) {
        console.error('Manual lead refresh failed:', error)
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
    await assertTenantWriteAllowed(supabase)

    // 1. Get conversation details to know platform and recipient
    const { data: conversation } = await supabase
        .from('conversations')
        .select('platform, contact_phone, organization_id')
        .eq('id', conversationId)
        .single()

    if (!conversation) throw new Error('Conversation not found')
    if (!conversation.contact_phone) throw new Error('Conversation contact is missing')

    const asConfigRecord = (value: Json): Record<string, Json | undefined> => {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
        return value as Record<string, Json | undefined>
    }

    const readConfigString = (config: Json, key: string): string | null => {
        const value = asConfigRecord(config)[key]
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : null
    }

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

        const botToken = channel ? readConfigString(channel.config as Json, 'bot_token') : null
        if (botToken) {
            try {
                const { TelegramClient } = await import('@/lib/telegram/client')
                const client = new TelegramClient(botToken)
                await client.sendMessage(conversation.contact_phone, content)
            } catch (error) {
                console.error('Failed to send Telegram message:', error)
                throw new Error('Failed to send message to Telegram API')
            }
        } else {
            console.warn('No active Telegram channel found for this organization')
        }
    }

    if (conversation.platform === 'whatsapp') {
        const { data: channel } = await supabase
            .from('channels')
            .select('config')
            .eq('organization_id', conversation.organization_id)
            .eq('type', 'whatsapp')
            .eq('status', 'active')
            .single()

        const accessToken = channel ? readConfigString(channel.config as Json, 'permanent_access_token') : null
        const phoneNumberId = channel ? readConfigString(channel.config as Json, 'phone_number_id') : null

        if (accessToken && phoneNumberId) {
            try {
                const { WhatsAppClient } = await import('@/lib/whatsapp/client')
                const client = new WhatsAppClient(accessToken)
                await client.sendText({
                    phoneNumberId,
                    to: conversation.contact_phone,
                    text: content
                })
            } catch (error) {
                console.error('Failed to send WhatsApp message:', error)
                throw new Error('Failed to send message to WhatsApp API')
            }
        } else {
            console.warn('No active WhatsApp channel found for this organization')
        }
    }

    if (conversation.platform === 'instagram') {
        const { count: inboundCount, error: inboundCountError } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', conversationId)
            .eq('sender_type', 'contact')

        if (inboundCountError) {
            console.error('Failed to validate Instagram inbound-first rule:', inboundCountError)
            throw new Error('Failed to validate Instagram conversation state')
        }
        if ((inboundCount ?? 0) < 1) {
            throw new Error('Instagram messages can only be sent after the customer starts the conversation')
        }

        const { data: channel } = await supabase
            .from('channels')
            .select('config')
            .eq('organization_id', conversation.organization_id)
            .eq('type', 'instagram')
            .eq('status', 'active')
            .single()

        const pageAccessToken = channel ? readConfigString(channel.config as Json, 'page_access_token') : null
        const instagramBusinessAccountId = channel ? readConfigString(channel.config as Json, 'instagram_business_account_id') : null

        if (pageAccessToken && instagramBusinessAccountId) {
            try {
                const { InstagramClient } = await import('@/lib/instagram/client')
                const client = new InstagramClient(pageAccessToken)
                await client.sendText({
                    instagramBusinessAccountId,
                    to: conversation.contact_phone,
                    text: content
                })
            } catch (error) {
                console.error('Failed to send Instagram message:', error)
                throw new Error('Failed to send message to Instagram API')
            }
        } else {
            console.warn('No active Instagram channel found for this organization')
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
    await assertTenantWriteAllowed(supabase)

    // If switching to bot, we MUST clear the assignee_id to release the lock in webhook
    const updates: Partial<Pick<Conversation, 'active_agent' | 'assignee_id'>> = { active_agent: agent }
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
    await assertTenantWriteAllowed(supabase)

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
    await assertTenantWriteAllowed(supabase)

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
    await assertTenantWriteAllowed(supabase)

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
