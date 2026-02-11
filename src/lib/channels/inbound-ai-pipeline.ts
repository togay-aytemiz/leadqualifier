import { v4 as uuidv4 } from 'uuid'
import type { SupabaseClient } from '@supabase/supabase-js'
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

const RAG_MAX_OUTPUT_TOKENS = 320

export interface InboundAiPipelineInput {
    supabase: SupabaseClient
    organizationId: string
    platform: 'whatsapp' | 'telegram' | 'instagram'
    source: 'whatsapp' | 'telegram' | 'instagram'
    contactId: string
    contactName: string | null
    text: string
    inboundMessageId: string
    inboundMessageIdMetadataKey: string
    inboundMessageMetadata: Record<string, unknown>
    sendOutbound: (content: string) => Promise<void>
    logPrefix: string
}

function isLikelyTurkishMessage(value: string) {
    const text = (value ?? '').trim()
    if (!text) return true
    if (/[ığüşöçİĞÜŞÖÇ]/.test(text)) return true
    return /\b(merhaba|selam|fiyat|randevu|teşekkür|lütfen|yarın|bugün|müsait|kampanya|hizmet)\b/i.test(text)
}

export async function processInboundAiPipeline(options: InboundAiPipelineInput) {
    const orgId = options.organizationId
    const aiSettings = await getOrgAiSettings(orgId, { supabase: options.supabase })
    const matchThreshold = aiSettings.match_threshold
    const kbThreshold = matchThreshold
    const requiredIntakeFields = await getRequiredIntakeFields({
        organizationId: orgId,
        supabase: options.supabase
    })

    const dedupeFilter = `metadata->>${options.inboundMessageIdMetadataKey}`
    const { data: existingInboundData } = await options.supabase
        .from('messages')
        .select('id')
        .eq('organization_id', orgId)
        .eq(dedupeFilter, options.inboundMessageId)
        .maybeSingle()
    const existingInbound = existingInboundData as { id?: string } | null

    if (existingInbound?.id) return

    let { data: conversation } = await options.supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', orgId)
        .eq('platform', options.platform)
        .eq('contact_phone', options.contactId)
        .limit(1)
        .maybeSingle()

    if (!conversation) {
        const { data: newConversation, error: createConversationError } = await options.supabase
            .from('conversations')
            .insert({
                id: uuidv4(),
                organization_id: orgId,
                platform: options.platform,
                contact_name: options.contactName || options.contactId,
                contact_phone: options.contactId,
                status: 'open',
                unread_count: 0
            })
            .select()
            .single()

        if (createConversationError) {
            if (createConversationError.code === '23505') {
                const { data: retryConversation } = await options.supabase
                    .from('conversations')
                    .select('*')
                    .eq('organization_id', orgId)
                    .eq('platform', options.platform)
                    .eq('contact_phone', options.contactId)
                    .single()

                if (!retryConversation) return
                conversation = retryConversation
            } else {
                console.error(`${options.logPrefix}: Failed to create conversation`, createConversationError)
                return
            }
        } else {
            conversation = newConversation
        }
    }

    if (!conversation) return

    const { error: inboundInsertError } = await options.supabase
        .from('messages')
        .insert({
            id: uuidv4(),
            conversation_id: conversation.id,
            organization_id: orgId,
            sender_type: 'contact',
            content: options.text,
            metadata: options.inboundMessageMetadata
        })

    if (inboundInsertError) {
        if (inboundInsertError.code === '23505') return
        console.error(`${options.logPrefix}: Failed to save incoming message`, inboundInsertError)
        return
    }

    await options.supabase
        .from('conversations')
        .update({
            contact_name: options.contactName || conversation.contact_name,
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
            latestMessage: options.text,
            supabase: options.supabase,
            source: options.source
        })

        const { data: leadForEscalation, error: leadForEscalationError } = await options.supabase
            .from('leads')
            .select('total_score')
            .eq('conversation_id', conversation.id)
            .maybeSingle()

        if (leadForEscalationError) {
            console.warn(`${options.logPrefix}: Failed to load lead score for escalation`, leadForEscalationError)
        } else if (typeof leadForEscalation?.total_score === 'number') {
            leadScoreForEscalation = leadForEscalation.total_score
        }
    }

    if (operatorActive || !allowReplies) return

    const persistBotMessage = async (content: string, metadata: Record<string, unknown>) => {
        await options.supabase
            .from('messages')
            .insert({
                id: uuidv4(),
                conversation_id: conversation.id,
                organization_id: orgId,
                sender_type: 'bot',
                content,
                metadata
            })

        await options.supabase
            .from('conversations')
            .update({
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', conversation.id)
    }

    const applyEscalationAfterReply = async (args: { skillRequiresHumanHandover: boolean }) => {
        const handoverMessage = isLikelyTurkishMessage(options.text)
            ? aiSettings.hot_lead_handover_message_tr
            : aiSettings.hot_lead_handover_message_en
        const escalation = decideHumanEscalation({
            skillRequiresHumanHandover: args.skillRequiresHumanHandover,
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
            await options.sendOutbound(escalation.noticeMessage)
            await persistBotMessage(escalation.noticeMessage, {
                is_handover_notice: true,
                escalation_reason: escalation.reason,
                escalation_action: escalation.action
            })
        }

        if (escalation.action === 'switch_to_operator' && conversation.active_agent !== 'operator') {
            const { error: switchError } = await options.supabase
                .from('conversations')
                .update({
                    active_agent: 'operator',
                    updated_at: new Date().toISOString()
                })
                .eq('id', conversation.id)

            if (switchError) {
                console.error(`${options.logPrefix}: Failed to switch conversation to operator`, switchError)
            } else {
                conversation = {
                    ...conversation,
                    active_agent: 'operator'
                }
            }
        }
    }

    let customerHistoryForFollowup = [options.text.trim()].filter(Boolean)
    let assistantHistoryForFollowup: string[] = []
    let conversationHistoryForReply: ConversationTurn[] = []
    let leadSnapshotForReply: {
        service_type?: string | null
        extracted_fields?: Record<string, unknown> | null
    } | null = null

    const matchedSkills = await matchSkillsSafely({
        matcher: () => matchSkills(options.text, orgId, matchThreshold, 5, options.supabase),
        context: {
            organization_id: orgId,
            conversation_id: conversation.id,
            source: options.source
        }
    })
    const bestMatch = matchedSkills?.[0]

    if (bestMatch) {
        await options.sendOutbound(bestMatch.response_text)
        await persistBotMessage(bestMatch.response_text, { skill_id: bestMatch.skill_id })

        const { data: matchedSkillDetails, error: matchedSkillError } = await options.supabase
            .from('skills')
            .select('requires_human_handover')
            .eq('id', bestMatch.skill_id)
            .maybeSingle()

        if (matchedSkillError) {
            console.warn(`${options.logPrefix}: Failed to load matched skill handover flag`, matchedSkillError)
        }

        await applyEscalationAfterReply({
            skillRequiresHumanHandover: Boolean(matchedSkillDetails?.requires_human_handover)
        })

        return
    }

    try {
        const { searchKnowledgeBase } = await import('@/lib/knowledge-base/actions')
        const [{ data: recentMessages, error: historyError }, { data: leadSnapshot, error: leadError }] = await Promise.all([
            options.supabase
                .from('messages')
                .select('sender_type, content, created_at')
                .eq('conversation_id', conversation.id)
                .order('created_at', { ascending: false })
                .limit(12),
            options.supabase
                .from('leads')
                .select('service_type, extracted_fields')
                .eq('conversation_id', conversation.id)
                .maybeSingle()
        ])

        if (historyError) {
            console.warn(`${options.logPrefix}: Failed to load history for KB routing`, historyError)
        }
        if (leadError) {
            console.warn(`${options.logPrefix}: Failed to load lead snapshot for continuity`, leadError)
        }
        leadSnapshotForReply = (leadSnapshot ?? null) as typeof leadSnapshotForReply

        const trimmedHistory = (recentMessages ?? []).filter((message, index) => {
            if (index !== 0) return true
            return !(message.sender_type === 'contact' && message.content === options.text)
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
        const latestMessage = options.text.trim()
        if (latestMessage && !customerHistoryForFollowup.some((value) => value === latestMessage)) {
            customerHistoryForFollowup.push(latestMessage)
        }
        const requiredIntakeGuidance = buildRequiredIntakeFollowupGuidance(
            requiredIntakeFields,
            customerHistoryForFollowup,
            assistantHistoryForFollowup
        )

        const decision = await decideKnowledgeBaseRoute(options.text, history)
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
                supabase: options.supabase
            })
        }

        if (decision.route_to_kb) {
            const query = decision.rewritten_query || options.text
            let kbResults = await searchKnowledgeBase(query, orgId, kbThreshold, 6, { supabase: options.supabase })
            if (!kbResults || kbResults.length === 0) {
                const fallbackThreshold = Math.max(0.1, kbThreshold - 0.15)
                kbResults = await searchKnowledgeBase(query, orgId, fallbackThreshold, 6, { supabase: options.supabase })
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
                const historyMessages = toOpenAiConversationMessages(history, options.text, 10)

                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...historyMessages,
                        { role: 'user', content: options.text }
                    ],
                    temperature: 0.3,
                    max_tokens: RAG_MAX_OUTPUT_TOKENS
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
                        inputTokens: estimateTokenCount(systemPrompt) + historyTokenCount + estimateTokenCount(options.text),
                        outputTokens: estimateTokenCount(polishedRagResponse ?? ''),
                        totalTokens: estimateTokenCount(systemPrompt) + historyTokenCount + estimateTokenCount(options.text) + estimateTokenCount(polishedRagResponse ?? '')
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
                    supabase: options.supabase
                })

                if (polishedRagResponse && !polishedRagResponse.includes(noAnswerToken)) {
                    await options.sendOutbound(polishedRagResponse)
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
        console.error(`${options.logPrefix}: RAG error`, error)
    }

    const fallbackText = await buildFallbackResponse({
        organizationId: orgId,
        message: options.text,
        requiredIntakeFields,
        recentCustomerMessages: customerHistoryForFollowup,
        recentAssistantMessages: assistantHistoryForFollowup,
        conversationHistory: conversationHistoryForReply,
        leadSnapshot: leadSnapshotForReply,
        aiSettings,
        supabase: options.supabase,
        usageMetadata: {
            conversation_id: conversation.id,
            source: options.source
        }
    })

    await options.sendOutbound(fallbackText)
    await persistBotMessage(fallbackText, { is_fallback: true })
    await applyEscalationAfterReply({ skillRequiresHumanHandover: false })
}
