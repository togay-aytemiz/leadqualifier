import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import type { Json } from '@/types/database'
import { WhatsAppClient } from '@/lib/whatsapp/client'
import { extractWhatsAppTextMessages, isValidMetaSignature, type WhatsAppTextMessageEvent } from '@/lib/whatsapp/webhook'
import { matchSkills } from '@/lib/skills/actions'
import { buildRagContext } from '@/lib/knowledge-base/rag'
import { decideKnowledgeBaseRoute, type ConversationTurn } from '@/lib/knowledge-base/router'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { DEFAULT_FLEXIBLE_PROMPT, withBotNamePrompt } from '@/lib/ai/prompts'
import { buildFallbackResponse } from '@/lib/ai/fallback'
import { resolveBotModeAction, resolveLeadExtractionAllowance } from '@/lib/ai/bot-mode'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { recordAiUsage } from '@/lib/ai/usage'
import { buildRequiredIntakeFollowupGuidance, getRequiredIntakeFields } from '@/lib/ai/followup'
import {
    buildConversationContinuityGuidance,
    stripRepeatedGreeting,
    toOpenAiConversationMessages
} from '@/lib/ai/conversation'
import { decideHumanEscalation } from '@/lib/ai/escalation'
import { runLeadExtraction } from '@/lib/leads/extraction'
import { isOperatorActive } from '@/lib/inbox/operator-state'
import { matchSkillsSafely } from '@/lib/skills/match-safe'

export const runtime = 'nodejs'

interface WhatsAppChannelRecord {
    id: string
    organization_id: string
    config: Json
}

function asConfigRecord(value: Json): Record<string, Json | undefined> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
    return value as Record<string, Json | undefined>
}

function readConfigString(config: Json, key: string): string | null {
    const value = asConfigRecord(config)[key]
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function isLikelyTurkishMessage(value: string) {
    const text = (value ?? '').trim()
    if (!text) return true
    if (/[ığüşöçİĞÜŞÖÇ]/.test(text)) return true
    return /\b(merhaba|selam|fiyat|randevu|teşekkür|lütfen|yarın|bugün|müsait|kampanya|hizmet)\b/i.test(text)
}

async function handleTextMessage(
    channel: WhatsAppChannelRecord,
    event: WhatsAppTextMessageEvent
) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const orgId = channel.organization_id
    const aiSettings = await getOrgAiSettings(orgId, { supabase })
    const matchThreshold = aiSettings.match_threshold
    const kbThreshold = matchThreshold
    const requiredIntakeFields = await getRequiredIntakeFields({ organizationId: orgId, supabase })

    const { data: existingInboundData } = await supabase
        .from('messages')
        .select('id')
        .eq('organization_id', orgId)
        .eq('metadata->>whatsapp_message_id', event.messageId)
        .maybeSingle()
    const existingInbound = existingInboundData as { id?: string } | null

    if (existingInbound?.id) {
        return
    }

    let { data: conversation } = await supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', orgId)
        .eq('platform', 'whatsapp')
        .eq('contact_phone', event.contactPhone)
        .limit(1)
        .maybeSingle()

    if (!conversation) {
        const { data: newConversation, error: createConversationError } = await supabase
            .from('conversations')
            .insert({
                id: uuidv4(),
                organization_id: orgId,
                platform: 'whatsapp',
                contact_name: event.contactName || event.contactPhone,
                contact_phone: event.contactPhone,
                status: 'open',
                unread_count: 0
            })
            .select()
            .single()

        if (createConversationError) {
            if (createConversationError.code === '23505') {
                const { data: retryConversation } = await supabase
                    .from('conversations')
                    .select('*')
                    .eq('organization_id', orgId)
                    .eq('platform', 'whatsapp')
                    .eq('contact_phone', event.contactPhone)
                    .single()

                if (!retryConversation) return
                conversation = retryConversation
            } else {
                console.error('WhatsApp Webhook: Failed to create conversation', createConversationError)
                return
            }
        } else {
            conversation = newConversation
        }
    }

    if (!conversation) return

    const { error: inboundInsertError } = await supabase
        .from('messages')
        .insert({
            id: uuidv4(),
            conversation_id: conversation.id,
            organization_id: orgId,
            sender_type: 'contact',
            content: event.text,
            metadata: {
                whatsapp_message_id: event.messageId,
                whatsapp_timestamp: event.timestamp,
                phone_number_id: event.phoneNumberId
            }
        })

    if (inboundInsertError) {
        if (inboundInsertError.code === '23505') return
        console.error('WhatsApp Webhook: Failed to save incoming message', inboundInsertError)
        return
    }

    await supabase
        .from('conversations')
        .update({
            contact_name: event.contactName || conversation.contact_name,
            last_message_at: new Date().toISOString(),
            unread_count: (conversation.unread_count ?? 0) + 1,
            updated_at: new Date().toISOString()
        })
        .eq('id', conversation.id)

    const operatorActive = isOperatorActive(conversation)
    const botMode = aiSettings.bot_mode ?? 'active'
    const { allowReplies } = resolveBotModeAction(botMode)
    const allowDuringOperator = aiSettings.allow_lead_extraction_during_operator ?? false
    const shouldRunLeadExtraction = resolveLeadExtractionAllowance({
        botMode,
        operatorActive,
        allowDuringOperator
    })

    let leadScoreForEscalation: number | null = null
    if (shouldRunLeadExtraction) {
        await runLeadExtraction({
            organizationId: orgId,
            conversationId: conversation.id,
            latestMessage: event.text,
            preferredLocale: isLikelyTurkishMessage(event.text) ? 'tr' : 'en',
            supabase,
            source: 'whatsapp'
        })

        const { data: leadForEscalation, error: leadForEscalationError } = await supabase
            .from('leads')
            .select('total_score')
            .eq('conversation_id', conversation.id)
            .maybeSingle()

        if (leadForEscalationError) {
            console.warn('WhatsApp Webhook: Failed to load lead score for escalation', leadForEscalationError)
        } else if (typeof leadForEscalation?.total_score === 'number') {
            leadScoreForEscalation = leadForEscalation.total_score
        }
    }

    if (operatorActive || !allowReplies) return

    const accessToken = readConfigString(channel.config, 'permanent_access_token')
    if (!accessToken) {
        console.warn('WhatsApp Webhook: Missing permanent access token')
        return
    }

    const client = new WhatsAppClient(accessToken)

    const sendOutbound = async (content: string) => {
        await client.sendText({
            phoneNumberId: event.phoneNumberId,
            to: event.contactPhone,
            text: content
        })
    }

    const persistBotMessage = async (content: string, metadata: Record<string, unknown>) => {
        await supabase
            .from('messages')
            .insert({
                id: uuidv4(),
                conversation_id: conversation.id,
                organization_id: orgId,
                sender_type: 'bot',
                content,
                metadata
            })

        await supabase
            .from('conversations')
            .update({
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', conversation.id)
    }

    const applyEscalationAfterReply = async (options: { skillRequiresHumanHandover: boolean }) => {
        const handoverMessage = isLikelyTurkishMessage(event.text)
            ? aiSettings.hot_lead_handover_message_tr
            : aiSettings.hot_lead_handover_message_en
        const escalation = decideHumanEscalation({
            skillRequiresHumanHandover: options.skillRequiresHumanHandover,
            leadScore: leadScoreForEscalation,
            hotLeadThreshold: aiSettings.hot_lead_score_threshold,
            hotLeadAction: aiSettings.hot_lead_action,
            handoverMessage
        })

        if (!escalation.shouldEscalate) return

        if (
            escalation.noticeMode === 'assistant_promise'
            && escalation.noticeMessage
            && conversation.active_agent !== 'operator'
        ) {
            await sendOutbound(escalation.noticeMessage)
            await persistBotMessage(escalation.noticeMessage, {
                is_handover_notice: true,
                escalation_reason: escalation.reason,
                escalation_action: escalation.action
            })
        }

        if (escalation.action === 'switch_to_operator' && conversation.active_agent !== 'operator') {
            const { error: switchError } = await supabase
                .from('conversations')
                .update({
                    active_agent: 'operator',
                    updated_at: new Date().toISOString()
                })
                .eq('id', conversation.id)

            if (switchError) {
                console.error('WhatsApp Webhook: Failed to switch conversation to operator', switchError)
            } else {
                conversation = {
                    ...conversation,
                    active_agent: 'operator'
                }
            }
        }
    }

    let customerHistoryForFollowup = [event.text.trim()].filter(Boolean)
    let assistantHistoryForFollowup: string[] = []
    let conversationHistoryForReply: ConversationTurn[] = []
    let leadSnapshotForReply: {
        service_type?: string | null
        extracted_fields?: Record<string, unknown> | null
    } | null = null

    const matchedSkills = await matchSkillsSafely({
        matcher: () => matchSkills(event.text, orgId, matchThreshold, 5, supabase),
        context: {
            organization_id: orgId,
            conversation_id: conversation.id,
            source: 'whatsapp'
        }
    })
    const bestMatch = matchedSkills?.[0]

    if (bestMatch) {
        await sendOutbound(bestMatch.response_text)
        await persistBotMessage(bestMatch.response_text, { skill_id: bestMatch.skill_id })

        const { data: matchedSkillDetails, error: matchedSkillError } = await supabase
            .from('skills')
            .select('requires_human_handover')
            .eq('id', bestMatch.skill_id)
            .maybeSingle()

        if (matchedSkillError) {
            console.warn('WhatsApp Webhook: Failed to load matched skill handover flag', matchedSkillError)
        }

        await applyEscalationAfterReply({
            skillRequiresHumanHandover: Boolean(matchedSkillDetails?.requires_human_handover)
        })

        return
    }

    try {
        const { searchKnowledgeBase } = await import('@/lib/knowledge-base/actions')
        const [{ data: recentMessages, error: historyError }, { data: leadSnapshot, error: leadError }] = await Promise.all([
            supabase
                .from('messages')
                .select('sender_type, content, created_at')
                .eq('conversation_id', conversation.id)
                .order('created_at', { ascending: false })
                .limit(12),
            supabase
                .from('leads')
                .select('service_type, extracted_fields')
                .eq('conversation_id', conversation.id)
                .maybeSingle()
        ])

        if (historyError) {
            console.warn('WhatsApp Webhook: Failed to load history for KB routing', historyError)
        }
        if (leadError) {
            console.warn('WhatsApp Webhook: Failed to load lead snapshot for continuity', leadError)
        }
        leadSnapshotForReply = (leadSnapshot ?? null) as typeof leadSnapshotForReply

        const trimmedHistory = (recentMessages ?? []).filter((message, index) => {
            if (index !== 0) return true
            return !(message.sender_type === 'contact' && message.content === event.text)
        })
        assistantHistoryForFollowup = trimmedHistory
            .filter((message) => message.sender_type === 'bot')
            .map((message) => (message.content ?? '').toString().trim())
            .filter(Boolean)
            .slice(0, 3)
            .reverse()

        const history: ConversationTurn[] = trimmedHistory
            .slice(0, 10)
            .reverse()
            .filter((message) => typeof message.content === 'string' && message.content.trim().length > 0)
            .map((message) => ({
                role: message.sender_type === 'contact' ? 'user' : 'assistant',
                content: message.content as string,
                timestamp: message.created_at
            }))
        conversationHistoryForReply = history
        customerHistoryForFollowup = history
            .filter((turn) => turn.role === 'user')
            .map((turn) => turn.content.trim())
            .filter(Boolean)
            .slice(-8)
        const latestMessage = event.text.trim()
        if (latestMessage && !customerHistoryForFollowup.some((value) => value === latestMessage)) {
            customerHistoryForFollowup.push(latestMessage)
        }
        const requiredIntakeGuidance = buildRequiredIntakeFollowupGuidance(
            requiredIntakeFields,
            customerHistoryForFollowup,
            assistantHistoryForFollowup
        )

        const decision = await decideKnowledgeBaseRoute(event.text, history)
        if (decision.usage) {
            await recordAiUsage({
                organizationId: orgId,
                category: 'router',
                model: 'gpt-4o-mini',
                inputTokens: decision.usage.inputTokens,
                outputTokens: decision.usage.outputTokens,
                totalTokens: decision.usage.totalTokens,
                metadata: {
                    conversation_id: conversation.id,
                    reason: decision.reason
                },
                supabase
            })
        }

        if (decision.route_to_kb) {
            const query = decision.rewritten_query || event.text
            let kbResults = await searchKnowledgeBase(query, orgId, kbThreshold, 6, { supabase })
            if (!kbResults || kbResults.length === 0) {
                const fallbackThreshold = Math.max(0.1, kbThreshold - 0.15)
                kbResults = await searchKnowledgeBase(query, orgId, fallbackThreshold, 6, { supabase })
            }

            if (kbResults && kbResults.length > 0) {
                const { context, chunks } = buildRagContext(kbResults)
                if (!context) {
                    throw new Error('RAG context is empty')
                }

                const noAnswerToken = 'NO_ANSWER'
                const { default: OpenAI } = await import('openai')
                const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

                const basePrompt = withBotNamePrompt(aiSettings.prompt || DEFAULT_FLEXIBLE_PROMPT, aiSettings.bot_name)
                const continuityGuidance = buildConversationContinuityGuidance({
                    recentAssistantMessages: assistantHistoryForFollowup,
                    leadSnapshot: leadSnapshotForReply
                })
                const systemPrompt = `${basePrompt}

Answer the user's question based strictly on the provided context below.
If the answer is not in the context, respond with "${noAnswerToken}" and do not make up facts.
Keep the answer concise and friendly (in Turkish or English depending on user).
Continue naturally from recent conversation turns without restarting.

Context:
${context}${requiredIntakeGuidance ? `\n\n${requiredIntakeGuidance}` : ''}${continuityGuidance ? `\n\n${continuityGuidance}` : ''}`
                const historyMessages = toOpenAiConversationMessages(history, event.text, 10)

                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...historyMessages,
                        { role: 'user', content: event.text }
                    ],
                    temperature: 0.3
                })

                const ragResponse = completion.choices[0]?.message?.content?.trim()
                const polishedRagResponse = stripRepeatedGreeting(ragResponse ?? '', assistantHistoryForFollowup)
                const historyTokenCount = historyMessages.reduce((total, item) => total + estimateTokenCount(item.content), 0)
                const ragUsage = completion.usage
                    ? {
                        inputTokens: completion.usage.prompt_tokens ?? 0,
                        outputTokens: completion.usage.completion_tokens ?? 0,
                        totalTokens: completion.usage.total_tokens ?? (completion.usage.prompt_tokens ?? 0) + (completion.usage.completion_tokens ?? 0)
                    }
                    : {
                        inputTokens: estimateTokenCount(systemPrompt) + historyTokenCount + estimateTokenCount(event.text),
                        outputTokens: estimateTokenCount(polishedRagResponse ?? ''),
                        totalTokens: estimateTokenCount(systemPrompt) + historyTokenCount + estimateTokenCount(event.text) + estimateTokenCount(polishedRagResponse ?? '')
                    }

                await recordAiUsage({
                    organizationId: orgId,
                    category: 'rag',
                    model: 'gpt-4o-mini',
                    inputTokens: ragUsage.inputTokens,
                    outputTokens: ragUsage.outputTokens,
                    totalTokens: ragUsage.totalTokens,
                    metadata: {
                        conversation_id: conversation.id,
                        document_count: kbResults.length
                    },
                    supabase
                })

                if (polishedRagResponse && !polishedRagResponse.includes(noAnswerToken)) {
                    await sendOutbound(polishedRagResponse)
                    await persistBotMessage(polishedRagResponse, {
                        is_rag: true,
                        sources: chunks.map((chunk) => chunk.document_id).filter(Boolean)
                    })
                    await applyEscalationAfterReply({ skillRequiresHumanHandover: false })
                    return
                }
            }
        }
    } catch (error) {
        console.error('WhatsApp Webhook: RAG error', error)
    }

    const fallbackText = await buildFallbackResponse({
        organizationId: orgId,
        message: event.text,
        requiredIntakeFields,
        recentCustomerMessages: customerHistoryForFollowup,
        recentAssistantMessages: assistantHistoryForFollowup,
        conversationHistory: conversationHistoryForReply,
        leadSnapshot: leadSnapshotForReply,
        aiSettings,
        supabase,
        usageMetadata: {
            conversation_id: conversation.id,
            source: 'whatsapp'
        }
    })

    await sendOutbound(fallbackText)
    await persistBotMessage(fallbackText, { is_fallback: true })
    await applyEscalationAfterReply({ skillRequiresHumanHandover: false })
}

export async function GET(req: NextRequest) {
    const mode = req.nextUrl.searchParams.get('hub.mode')
    const token = req.nextUrl.searchParams.get('hub.verify_token')
    const challenge = req.nextUrl.searchParams.get('hub.challenge')

    if (mode !== 'subscribe' || !token || !challenge) {
        return NextResponse.json({ error: 'Invalid verification request' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: channel } = await supabase
        .from('channels')
        .select('id, config')
        .eq('type', 'whatsapp')
        .eq('status', 'active')
        .eq('config->>verify_token', token)
        .maybeSingle()

    if (!channel) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const nextConfig = {
        ...asConfigRecord(channel.config),
        webhook_verified_at: new Date().toISOString()
    }

    await supabase
        .from('channels')
        .update({
            config: nextConfig
        })
        .eq('id', channel.id)

    return new NextResponse(challenge, { status: 200 })
}

export async function POST(req: NextRequest) {
    const signatureHeader = req.headers.get('x-hub-signature-256')
    const rawBody = await req.text()

    let payload: unknown
    try {
        payload = JSON.parse(rawBody)
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const events = extractWhatsAppTextMessages(payload)
    if (events.length === 0) {
        return NextResponse.json({ ok: true })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const channelCache = new Map<string, WhatsAppChannelRecord>()

    for (const event of events) {
        let channel = channelCache.get(event.phoneNumberId)

        if (!channel) {
            const { data } = await supabase
                .from('channels')
                .select('id, organization_id, config')
                .eq('type', 'whatsapp')
                .eq('status', 'active')
                .eq('config->>phone_number_id', event.phoneNumberId)
                .maybeSingle()

            if (!data) {
                console.warn('WhatsApp Webhook: Channel not found for phone number id', event.phoneNumberId)
                continue
            }

            channel = data as WhatsAppChannelRecord
            const appSecret = readConfigString(channel.config, 'app_secret')
            const isValid = isValidMetaSignature(signatureHeader, rawBody, appSecret)
            if (!isValid) {
                console.warn('WhatsApp Webhook: Invalid signature')
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
            }

            channelCache.set(event.phoneNumberId, channel)
        }

        await handleTextMessage(channel, event)
    }

    return NextResponse.json({ ok: true })
}
