import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TelegramClient } from '@/lib/telegram/client'
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
import { resolveOrganizationUsageEntitlement } from '@/lib/billing/entitlements'
import { resolveMvpResponseLanguage, resolveMvpResponseLanguageName } from '@/lib/ai/language'
import { v4 as uuidv4 } from 'uuid'

const RAG_MAX_OUTPUT_TOKENS = 320

export async function POST(req: NextRequest) {
    const headerSecret = req.headers.get('x-telegram-bot-api-secret-token')
    const querySecret = req.nextUrl.searchParams.get('secret')
    const secretToken = headerSecret || querySecret

    const update = await req.json()

    console.log('Telegram Webhook: Received update', {
        updateId: update.update_id,
        hasMessage: !!update.message,
        hasSecret: !!secretToken
    })

    // 1. Basic Validation
    if (!update.message || !update.message.text) {
        console.log('Telegram Webhook: Skipping non-text update')
        return NextResponse.json({ ok: true }) // Ignore non-text updates
    }

    const { chat, text, from } = update.message
    const chatId = chat.id.toString()
    const responseLanguage = resolveMvpResponseLanguage(text)
    const responseLanguageName = resolveMvpResponseLanguageName(text)

    console.log('Telegram Webhook: Processing message', {
        chatId,
        text,
        fromId: from.id
    })

    // Use Service Role Key (Admin) to bypass RLS
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 2. Find Channel by Bot Token (We need to verify which bot this is)
    let channel;

    if (secretToken) {
        const { data } = await supabase
            .from('channels')
            .select('*')
            .eq('config->>webhook_secret', secretToken)
            .single()

        channel = data
        console.log('Telegram Webhook: Channel lookup by secret', { found: !!data, channelId: data?.id })
    } else {
        console.warn('Telegram Webhook: Missing secret token')
    }

    if (!channel) {
        console.warn('Telegram Webhook: No matching channel found for secret')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = channel.organization_id
    const aiSettings = await getOrgAiSettings(orgId, { supabase })
    const matchThreshold = aiSettings.match_threshold
    const kbThreshold = matchThreshold
    const requiredIntakeFields = await getRequiredIntakeFields({ organizationId: orgId, supabase })

    // 3. Find or Create Conversation
    // 3. Find or Create Conversation
    let { data: conversation } = await supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', orgId)
        .eq('platform', 'telegram')
        .eq('contact_phone', chatId.toString()) // Storing telegram chat_id in contact_phone for now
        .limit(1)
        .maybeSingle()

    if (!conversation) {
        console.log('Telegram Webhook: Creating new conversation (not found)')
        const { data: newConv, error } = await supabase
            .from('conversations')
            .insert({
                id: uuidv4(),
                organization_id: orgId,
                platform: 'telegram',
                contact_name: `${from.first_name} ${from.last_name || ''}`.trim(),
                contact_phone: chatId.toString(),
                status: 'open',
                unread_count: 0
            })
            .select()
            .single()

        if (error) {
            // Check for Unique Violation (Postgres code 23505)
            // This happens if a conversation was created by another request in the split second between our select and insert
            // or if the unique index prevents our insert.
            if (error.code === '23505') {
                console.log('Telegram Webhook: Unique violation (race condition), refetching existing conversation')
                const { data: existingRetry } = await supabase
                    .from('conversations')
                    .select('*')
                    .eq('organization_id', orgId)
                    .eq('platform', 'telegram')
                    .eq('contact_phone', chatId.toString())
                    .single()

                if (existingRetry) {
                    conversation = existingRetry
                } else {
                    console.error('Telegram Webhook: Failed to refetch after unique violation')
                    return NextResponse.json({ error: 'DB Error' }, { status: 500 })
                }
            } else {
                console.error('Telegram Webhook: Failed to create conversation', error)
                return NextResponse.json({ error: 'DB Error' }, { status: 500 })
            }
        } else {
            conversation = newConv
        }
    } else {
        console.log('Telegram Webhook: Found existing conversation', conversation.id)
    }

    // 4. Save Incoming Message
    const { error: msgError } = await supabase.from('messages').insert({
        id: uuidv4(),
        conversation_id: conversation.id,
        organization_id: orgId,
        sender_type: 'contact',
        content: text,
        metadata: { telegram_message_id: update.message.message_id }
    })

    if (msgError) {
        console.error('Telegram Webhook: Failed to save message', msgError)
    } else {
        console.log('Telegram Webhook: Message saved successfully')

        // Update conversation: Bump timestamp + increment unread count for user messages
        await supabase.from('conversations')
            .update({
                last_message_at: new Date().toISOString(),
                unread_count: conversation.unread_count + 1,
                updated_at: new Date().toISOString()
            })
            .eq('id', conversation.id)
    }

    // 5. Check Active Agent Status (Zero-Cost Check)
    // We now use an explicit column on the conversation table.
    // If active_agent is 'operator', we skip all AI processing immediately.

    // Note: We need to ensure 'active_agent' is selected in step 3.
    // Since we selected '*', it should be there.

    console.log('Telegram Webhook: Checking Active Agent', {
        conversationId: conversation.id,
        activeAgent: conversation.active_agent,
        assigneeId: conversation.assignee_id
    })

    const operatorActive = isOperatorActive(conversation)
    const botMode = aiSettings.bot_mode ?? 'active'
    const { allowReplies } = resolveBotModeAction(botMode)
    const allowDuringOperator = aiSettings.allow_lead_extraction_during_operator ?? false
    const entitlement = await resolveOrganizationUsageEntitlement(orgId, { supabase })
    if (!entitlement.isUsageAllowed) {
        console.info('Telegram Webhook: Billing usage locked, skipping AI processing', {
            organization_id: orgId,
            conversation_id: conversation.id,
            membership_state: entitlement.membershipState,
            lock_reason: entitlement.lockReason
        })
        return NextResponse.json({ ok: true })
    }

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
            latestMessage: text,
            preferredLocale: responseLanguage,
            supabase,
            source: 'telegram'
        })

        const { data: leadForEscalation, error: leadForEscalationError } = await supabase
            .from('leads')
            .select('total_score')
            .eq('conversation_id', conversation.id)
            .maybeSingle()

        if (leadForEscalationError) {
            console.warn('Telegram Webhook: Failed to load lead score for escalation', leadForEscalationError)
        } else if (typeof leadForEscalation?.total_score === 'number') {
            leadScoreForEscalation = leadForEscalation.total_score
        }
    }

    if (operatorActive || !allowReplies) {
        if (operatorActive) {
            console.log('Telegram Webhook: Operator active or Assigned. SKIPPING AI REPLY.')
        }
        return NextResponse.json({ ok: true })
    }
    const client = new TelegramClient(channel.config.bot_token)

    const persistBotMessage = async (content: string, metadata: Record<string, unknown>) => {
        await supabase.from('messages').insert({
            id: uuidv4(),
            conversation_id: conversation.id,
            organization_id: orgId,
            sender_type: 'bot',
            content,
            metadata
        })

        await supabase.from('conversations')
            .update({
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', conversation.id)
    }

    const applyEscalationAfterReply = async (options: { skillRequiresHumanHandover: boolean }) => {
        const handoverMessage = responseLanguage === 'tr'
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
            escalation.noticeMode === 'assistant_promise' &&
            escalation.noticeMessage &&
            conversation.active_agent !== 'operator'
        ) {
            await client.sendMessage(chatId, escalation.noticeMessage)
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
                console.error('Telegram Webhook: Failed to switch conversation to operator', switchError)
            } else {
                conversation = {
                    ...conversation,
                    active_agent: 'operator'
                }
            }
        }
    }

    let customerHistoryForFollowup = [text.trim()].filter(Boolean)
    let assistantHistoryForFollowup: string[] = []
    let conversationHistoryForReply: ConversationTurn[] = []
    let leadSnapshotForReply: {
        service_type?: string | null
        extracted_fields?: Record<string, unknown> | null
    } | null = null

    // 6. Process AI Response (Skills)
    const matchedSkills = await matchSkillsSafely({
        matcher: () => matchSkills(text, orgId, matchThreshold, 5, supabase),
        context: {
            organization_id: orgId,
            conversation_id: conversation.id,
            source: 'telegram'
        }
    })
    const bestMatch = matchedSkills?.[0]

    console.log('Telegram Webhook: Skill match result', {
        found: !!bestMatch,
        skillId: bestMatch?.skill_id,
        similarity: bestMatch?.similarity
    })

    if (bestMatch) {
        await client.sendMessage(chatId, bestMatch.response_text)

        await persistBotMessage(bestMatch.response_text, { skill_id: bestMatch.skill_id })
        console.log('Telegram Webhook: Sent matched response')

        const { data: matchedSkillDetails, error: matchedSkillError } = await supabase
            .from('skills')
            .select('requires_human_handover')
            .eq('id', bestMatch.skill_id)
            .maybeSingle()

        if (matchedSkillError) {
            console.warn('Telegram Webhook: Failed to load matched skill handover flag', matchedSkillError)
        }

        await applyEscalationAfterReply({
            skillRequiresHumanHandover: Boolean(matchedSkillDetails?.requires_human_handover)
        })

        return NextResponse.json({ ok: true })
    } else {
        // 7. Fallback: Check Knowledge Base (RAG)
        console.log('Telegram Webhook: No skill matched, searching Knowledge Base...')

        try {
            const { searchKnowledgeBase } = await import('@/lib/knowledge-base/actions') // Dynamically import to avoid circular dep if any
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
                console.warn('Telegram Webhook: Failed to load history for KB routing', historyError)
            }
            if (leadError) {
                console.warn('Telegram Webhook: Failed to load lead snapshot for continuity', leadError)
            }
            leadSnapshotForReply = (leadSnapshot ?? null) as typeof leadSnapshotForReply

            const trimmedHistory = (recentMessages ?? []).filter((msg, index) => {
                if (index !== 0) return true
                return !(msg.sender_type === 'contact' && msg.content === text)
            })
            assistantHistoryForFollowup = trimmedHistory
                .filter((msg) => msg.sender_type === 'bot')
                .map((msg) => (msg.content ?? '').toString().trim())
                .filter(Boolean)
                .slice(0, 3)
                .reverse()

            const history: ConversationTurn[] = trimmedHistory
                .slice(0, 10)
                .reverse()
                .filter((msg) => typeof msg.content === 'string' && msg.content.trim().length > 0)
                .map((msg) => ({
                    role: msg.sender_type === 'contact' ? 'user' : 'assistant',
                    content: msg.content as string,
                    timestamp: msg.created_at
                }))
            conversationHistoryForReply = history
            customerHistoryForFollowup = history
                .filter((turn) => turn.role === 'user')
                .map((turn) => turn.content.trim())
                .filter(Boolean)
                .slice(-8)
            const latestMessage = text.trim()
            if (latestMessage && !customerHistoryForFollowup.some((item) => item === latestMessage)) {
                customerHistoryForFollowup.push(latestMessage)
            }
            const requiredIntakeGuidance = buildRequiredIntakeFollowupGuidance(
                requiredIntakeFields,
                customerHistoryForFollowup,
                assistantHistoryForFollowup
            )

            const decision = await decideKnowledgeBaseRoute(text, history)
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
                const query = decision.rewritten_query || text
                let kbResults = await searchKnowledgeBase(query, orgId, kbThreshold, 6, { supabase })
                if (!kbResults || kbResults.length === 0) {
                    const fallbackThreshold = Math.max(0.1, kbThreshold - 0.15)
                    kbResults = await searchKnowledgeBase(query, orgId, fallbackThreshold, 6, { supabase })
                }

                if (kbResults && kbResults.length > 0) {
                    console.log('Telegram Webhook: Knowledge Base match found', { count: kbResults.length })

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
Reply language policy (MVP): use ${responseLanguageName} only. If the user message is not Turkish, use English.
Keep the answer concise and friendly.
Continue naturally from recent conversation turns without restarting.

Context:
${context}${requiredIntakeGuidance ? `\n\n${requiredIntakeGuidance}` : ''}${continuityGuidance ? `\n\n${continuityGuidance}` : ''}`
                    const historyMessages = toOpenAiConversationMessages(history, text, 10)

                    const completion = await openai.chat.completions.create({
                        model: 'gpt-4o-mini',
                        max_tokens: RAG_MAX_OUTPUT_TOKENS,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            ...historyMessages,
                            { role: 'user', content: text }
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
                            inputTokens: estimateTokenCount(systemPrompt) + historyTokenCount + estimateTokenCount(text),
                            outputTokens: estimateTokenCount(polishedRagResponse ?? ''),
                            totalTokens: estimateTokenCount(systemPrompt) + historyTokenCount + estimateTokenCount(text) + estimateTokenCount(polishedRagResponse ?? '')
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
                        await client.sendMessage(chatId, polishedRagResponse)

                        await persistBotMessage(polishedRagResponse, {
                            is_rag: true,
                            sources: chunks.map(r => r.document_id).filter(Boolean)
                        })

                        await applyEscalationAfterReply({ skillRequiresHumanHandover: false })

                        return NextResponse.json({ ok: true })
                    }
                }
            } else {
                console.log('Telegram Webhook: KB routing declined', { reason: decision.reason })
            }
        } catch (error) {
            console.error('Telegram Webhook: RAG error', error)
        }

        // 8. Final Fallback (No Skill, No Knowledge)
        console.log('Telegram Webhook: No knowledge match, sending fallback')
        const fallbackText = await buildFallbackResponse({
            organizationId: orgId,
            message: text,
            preferredLanguage: responseLanguage,
            requiredIntakeFields,
            recentCustomerMessages: customerHistoryForFollowup,
            recentAssistantMessages: assistantHistoryForFollowup,
            conversationHistory: conversationHistoryForReply,
            leadSnapshot: leadSnapshotForReply,
            aiSettings,
            supabase,
            usageMetadata: {
                conversation_id: conversation.id,
                source: 'telegram'
            }
        })

        await client.sendMessage(chatId, fallbackText)

        await persistBotMessage(fallbackText, { is_fallback: true })
        await applyEscalationAfterReply({ skillRequiresHumanHandover: false })

        return NextResponse.json({ ok: true })
    }
}
