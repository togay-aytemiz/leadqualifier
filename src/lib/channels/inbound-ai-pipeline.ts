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
import {
    analyzeRequiredIntakeState,
    buildRequiredIntakeFollowupGuidance,
    getRequiredIntakeFields
} from '@/lib/ai/followup'
import { applyLiveAssistantResponseGuards } from '@/lib/ai/response-guards'
import {
    buildConversationContinuityGuidance,
    stripRepeatedGreeting,
    toOpenAiConversationMessages
} from '@/lib/ai/conversation'
import { decideHumanEscalation } from '@/lib/ai/escalation'
import { runLeadExtraction } from '@/lib/leads/extraction'
import { isOperatorActive } from '@/lib/inbox/operator-state'
import { matchSkillsSafely } from '@/lib/skills/match-safe'
import { shouldUseSkillMatchForMessage } from '@/lib/skills/handover-intent'
import { resolveOrganizationUsageEntitlement } from '@/lib/billing/entitlements'
import { resolveMvpResponseLanguage, resolveMvpResponseLanguageName } from '@/lib/ai/language'
import { applyBotMessageDisclaimer } from '@/lib/ai/bot-disclaimer'

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

export async function processInboundAiPipeline(options: InboundAiPipelineInput) {
    const orgId = options.organizationId
    const responseLanguage = resolveMvpResponseLanguage(options.text)
    const responseLanguageName = resolveMvpResponseLanguageName(options.text)
    const aiSettings = await getOrgAiSettings(orgId, { supabase: options.supabase })
    const formatOutboundBotMessage = (content: string) => applyBotMessageDisclaimer({
        message: content,
        responseLanguage,
        settings: aiSettings
    })
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

    if (conversation.ai_processing_paused) {
        console.info(`${options.logPrefix}: Conversation AI processing paused`, {
            organization_id: orgId,
            conversation_id: conversation.id
        })
        return
    }

    const operatorActive = isOperatorActive(conversation)
    const botMode = aiSettings.bot_mode ?? 'active'
    const { allowReplies } = resolveBotModeAction(botMode)
    const allowDuringOperator = aiSettings.allow_lead_extraction_during_operator ?? false
    const ensureUsageAllowed = async (stage: string) => {
        const entitlement = await resolveOrganizationUsageEntitlement(orgId, {
            supabase: options.supabase
        })

        if (entitlement.isUsageAllowed) return true

        console.info(`${options.logPrefix}: Billing usage locked`, {
            organization_id: orgId,
            conversation_id: conversation.id,
            membership_state: entitlement.membershipState,
            lock_reason: entitlement.lockReason,
            stage
        })
        return false
    }

    if (!await ensureUsageAllowed('initial')) return

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

    if (!await ensureUsageAllowed('before_skill_matching')) return

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
        const handoverMessage = responseLanguage === 'tr'
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
            const formattedEscalationNotice = formatOutboundBotMessage(escalation.noticeMessage)
            await options.sendOutbound(formattedEscalationNotice)
            await persistBotMessage(formattedEscalationNotice, {
                is_handover_notice: true,
                escalation_reason: escalation.reason,
                escalation_action: escalation.action
            })
        }

        const nowIso = new Date().toISOString()
        const attentionRequestedAt = conversation.human_attention_requested_at ?? nowIso
        const escalationConversationUpdate: Record<string, unknown> = {
            human_attention_required: true,
            human_attention_reason: escalation.reason,
            human_attention_requested_at: attentionRequestedAt,
            human_attention_resolved_at: null,
            updated_at: nowIso
        }

        if (escalation.action === 'switch_to_operator' && conversation.active_agent !== 'operator') {
            escalationConversationUpdate.active_agent = 'operator'
        }

        const { error: escalationUpdateError } = await options.supabase
            .from('conversations')
            .update(escalationConversationUpdate)
            .eq('id', conversation.id)

        if (escalationUpdateError) {
            console.error(`${options.logPrefix}: Failed to persist conversation escalation state`, escalationUpdateError)
            return
        }

        conversation = {
            ...conversation,
            ...escalationConversationUpdate
        }
    }

    let customerHistoryForFollowup = [options.text.trim()].filter(Boolean)
    let assistantHistoryForFollowup: string[] = []
    let conversationHistoryForReply: ConversationTurn[] = []
    let leadSnapshotForReply: {
        service_type?: string | null
        extracted_fields?: Record<string, unknown> | null
    } | null = null
    let fallbackKnowledgeContext: string | null = null
    let requiredIntakeAnalysis = analyzeRequiredIntakeState({
        requiredFields: requiredIntakeFields,
        recentCustomerMessages: customerHistoryForFollowup,
        recentAssistantMessages: assistantHistoryForFollowup,
        leadSnapshot: leadSnapshotForReply
    })

    const matchedSkills = await matchSkillsSafely({
        matcher: () => matchSkills(options.text, orgId, matchThreshold, 5, options.supabase),
        context: {
            organization_id: orgId,
            conversation_id: conversation.id,
            source: options.source
        }
    })
    const skillCandidates = matchedSkills ?? []
    for (const candidateMatch of skillCandidates) {
        const { data: matchedSkillDetails, error: matchedSkillError } = await options.supabase
            .from('skills')
            .select('requires_human_handover')
            .eq('id', candidateMatch.skill_id)
            .maybeSingle()

        if (matchedSkillError) {
            console.warn(`${options.logPrefix}: Failed to load matched skill handover flag`, {
                skill_id: candidateMatch.skill_id,
                error: matchedSkillError
            })
            continue
        }

        const skillRequiresHumanHandover = Boolean(matchedSkillDetails?.requires_human_handover)
        const shouldUseMatch = shouldUseSkillMatchForMessage({
            userMessage: options.text,
            requiresHumanHandover: skillRequiresHumanHandover,
            match: candidateMatch
        })

        if (!shouldUseMatch) {
            console.info(`${options.logPrefix}: Ignored likely false-positive handover skill match`, {
                organization_id: orgId,
                conversation_id: conversation.id,
                skill_id: candidateMatch.skill_id,
                similarity: candidateMatch.similarity
            })
            continue
        }

        const formattedSkillReply = formatOutboundBotMessage(candidateMatch.response_text)
        await options.sendOutbound(formattedSkillReply)
        await persistBotMessage(formattedSkillReply, {
            skill_id: candidateMatch.skill_id,
            skill_title: candidateMatch.title
        })

        await applyEscalationAfterReply({
            skillRequiresHumanHandover
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
        requiredIntakeAnalysis = analyzeRequiredIntakeState({
            requiredFields: requiredIntakeFields,
            recentCustomerMessages: customerHistoryForFollowup,
            recentAssistantMessages: assistantHistoryForFollowup,
            leadSnapshot: leadSnapshotForReply
        })
        const requiredIntakeGuidance = buildRequiredIntakeFollowupGuidance(
            requiredIntakeFields,
            customerHistoryForFollowup,
            assistantHistoryForFollowup,
            {
                analysis: requiredIntakeAnalysis,
                leadSnapshot: leadSnapshotForReply
            }
        )

        if (!await ensureUsageAllowed('before_router')) return
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
                if (!fallbackKnowledgeContext) {
                    fallbackKnowledgeContext = context.replace(/\s+/g, ' ').trim().slice(0, 1500)
                }

                const noAnswerToken = 'NO_ANSWER'
                if (!await ensureUsageAllowed('before_rag_completion')) return
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
Reply language policy (MVP): use ${responseLanguageName} only. If the user message is not Turkish, use English.
Keep the answer concise and friendly.
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
                const guardedRagResponse = polishedRagResponse
                    ? applyLiveAssistantResponseGuards({
                        response: polishedRagResponse,
                        userMessage: options.text,
                        responseLanguage,
                        recentAssistantMessages: assistantHistoryForFollowup,
                        blockedReaskFields: requiredIntakeAnalysis.blockedReaskFields,
                        suppressIntakeQuestions: requiredIntakeAnalysis.suppressIntakeQuestions,
                        noProgressLoopBreak: requiredIntakeAnalysis.noProgressStreak
                    })
                    : ''
                const historyTokenCount = historyMessages.reduce((total, item) => total + estimateTokenCount(item.content), 0)
                const ragUsage = completion.usage
                    ? {
                        inputTokens: completion.usage.prompt_tokens ?? 0,
                        outputTokens: completion.usage.completion_tokens ?? 0,
                        totalTokens: completion.usage.total_tokens ?? (completion.usage.prompt_tokens ?? 0) + (completion.usage.completion_tokens ?? 0)
                    }
                    : {
                        inputTokens: estimateTokenCount(systemPrompt) + historyTokenCount + estimateTokenCount(options.text),
                        outputTokens: estimateTokenCount(guardedRagResponse ?? ''),
                        totalTokens: estimateTokenCount(systemPrompt) + historyTokenCount + estimateTokenCount(options.text) + estimateTokenCount(guardedRagResponse ?? '')
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

                if (guardedRagResponse && !guardedRagResponse.includes(noAnswerToken)) {
                    const formattedRagReply = formatOutboundBotMessage(guardedRagResponse)
                    await options.sendOutbound(formattedRagReply)
                    await persistBotMessage(formattedRagReply, {
                        is_rag: true,
                        sources: chunks.map((chunk) => chunk.document_id).filter(Boolean)
                    })
                    await applyEscalationAfterReply({ skillRequiresHumanHandover: false })
                    return
                }
            }
        }
    } catch (error) {
        if (error instanceof Error && error.message.includes('Failed to record AI usage')) {
            console.error(`${options.logPrefix}: AI usage recording failed, skipping further AI calls`, error)
            return
        }
        console.error(`${options.logPrefix}: RAG error`, error)
    }

    if (!await ensureUsageAllowed('before_fallback')) return
    const fallbackText = await buildFallbackResponse({
        organizationId: orgId,
        message: options.text,
        preferredLanguage: responseLanguage,
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
        },
        requiredIntakeAnalysis,
        knowledgeContext: fallbackKnowledgeContext
    })

    const formattedFallbackReply = formatOutboundBotMessage(fallbackText)
    await options.sendOutbound(formattedFallbackReply)
    await persistBotMessage(formattedFallbackReply, { is_fallback: true })
    await applyEscalationAfterReply({ skillRequiresHumanHandover: false })
}
