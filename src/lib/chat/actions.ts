'use server'

import { matchSkills } from '@/lib/skills/actions'
import { buildRagContext } from '@/lib/knowledge-base/rag'
import { decideKnowledgeBaseRoute, type ConversationTurn } from '@/lib/knowledge-base/router'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { buildFallbackResponse } from '@/lib/ai/fallback'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { DEFAULT_FLEXIBLE_PROMPT, withBotNamePrompt } from '@/lib/ai/prompts'
import { buildRequiredIntakeFollowupGuidance, getRequiredIntakeFields } from '@/lib/ai/followup'
import {
    buildConversationContinuityGuidance,
    stripRepeatedGreeting,
    toOpenAiConversationMessages
} from '@/lib/ai/conversation'
import { matchSkillsSafely } from '@/lib/skills/match-safe'
import { resolveOrganizationUsageEntitlement } from '@/lib/billing/entitlements'

const RAG_MAX_OUTPUT_TOKENS = 320

function isLikelyTurkishMessage(value: string) {
    const text = (value ?? '').trim()
    if (!text) return true
    if (/[ığüşöçİĞÜŞÖÇ]/.test(text)) return true
    return /\b(merhaba|selam|fiyat|randevu|teşekkür|lütfen|yarın|bugün|müsait|kampanya|hizmet)\b/i.test(text)
}

function buildLockedSimulatorMessage(lockReason: string | null, inputMessage: string) {
    const tr = isLikelyTurkishMessage(inputMessage)

    if (lockReason === 'trial_time_expired' || lockReason === 'trial_credits_exhausted' || lockReason === 'subscription_required') {
        return tr
            ? 'Trial limitine ulaştın. Devam etmek için aylık premium pakete geçmen gerekiyor.'
            : 'You reached your trial limit. Subscribe to the monthly premium package to continue.'
    }

    if (lockReason === 'package_credits_exhausted') {
        return tr
            ? 'Aylık paket kredilerin bitti. Premium hesabında ek kredi (top-up) alarak devam edebilirsin.'
            : 'Your monthly package credits are exhausted. You can continue by purchasing top-up credits on premium.'
    }

    if (lockReason === 'past_due') {
        return tr
            ? 'Ödeme gecikmesi nedeniyle AI kullanımı durduruldu. Ödeme yöntemini güncellemen gerekiyor.'
            : 'AI usage is paused due to a past-due payment. Update your payment method to continue.'
    }

    if (lockReason === 'admin_locked') {
        return tr
            ? 'Hesabın yönetici tarafından kilitlendi. Destekle iletişime geçebilirsin.'
            : 'Your account is locked by an admin. Please contact support.'
    }

    return tr
        ? 'AI kullanımı şu anda kilitli.'
        : 'AI usage is currently locked.'
}

export interface ChatMessage {
    id: string
    role: 'user' | 'system'
    content: string
    timestamp: Date
    status: 'sent' | 'delivered' | 'read'
    tokenUsage?: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
    }
}

export interface SimulationResponse {
    response: string
    matchedSkill?: {
        id: string
        title: string
        similarity: number
    }
    tokenUsage?: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
        router?: {
            inputTokens: number
            outputTokens: number
            totalTokens: number
        }
        rag?: {
            inputTokens: number
            outputTokens: number
            totalTokens: number
        }
    }
}

export async function simulateChat(
    message: string,
    organizationId: string,
    threshold?: number,
    history: ConversationTurn[] = []
): Promise<SimulationResponse> {
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let routerInputTokens = 0
    let routerOutputTokens = 0
    let ragInputTokens = 0
    let ragOutputTokens = 0

    const entitlement = await resolveOrganizationUsageEntitlement(organizationId)
    if (!entitlement.isUsageAllowed) {
        return {
            response: buildLockedSimulatorMessage(entitlement.lockReason, message),
            tokenUsage: {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                router: {
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0
                },
                rag: {
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0
                }
            }
        }
    }

    const aiSettings = await getOrgAiSettings(organizationId)
    const matchThreshold = typeof threshold === 'number' ? threshold : aiSettings.match_threshold
    const kbThreshold = matchThreshold
    const requiredIntakeFields = await getRequiredIntakeFields({ organizationId })
    const customerHistory = history
        .filter((turn) => turn.role === 'user')
        .map((turn) => turn.content.trim())
        .filter(Boolean)
        .slice(-8)
    const assistantHistory = history
        .filter((turn) => turn.role === 'assistant')
        .map((turn) => turn.content.trim())
        .filter(Boolean)
        .slice(-3)
    const latestMessage = message.trim()
    if (latestMessage && !customerHistory.some((item) => item === latestMessage)) {
        customerHistory.push(latestMessage)
    }
    const requiredIntakeGuidance = buildRequiredIntakeFollowupGuidance(
        requiredIntakeFields,
        customerHistory,
        assistantHistory
    )

    // 1. Match skills with ZERO threshold to get ANY match for debugging
    console.log(`Simulating chat for: "${message}" in org: ${organizationId} with threshold: ${threshold}`)
    const matches = await matchSkillsSafely({
        matcher: () => matchSkills(message, organizationId, 0.0),
        context: {
            organization_id: organizationId,
            source: 'simulator'
        }
    })
    console.log('Matches found:', JSON.stringify(matches, null, 2))
    // Only count tokens actually sent to LLM endpoints. Skill-only paths should be zero.

    const activeThreshold = matchThreshold
    const bestMatch = matches?.[0];

    // 2. Determine response
    if (bestMatch && bestMatch.similarity >= activeThreshold) {
        return {
            response: bestMatch.response_text,
            matchedSkill: {
                id: bestMatch.skill_id,
                title: bestMatch.title,
                similarity: bestMatch.similarity,
            },
            tokenUsage: {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                router: {
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0
                },
                rag: {
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0
                }
            }
        }
    }

    // 3. Fallback: Decide if Knowledge Base should be used
    try {
        const decision = await decideKnowledgeBaseRoute(message, history)
        if (decision.usage) {
            routerInputTokens += decision.usage.inputTokens
            routerOutputTokens += decision.usage.outputTokens
        }

        if (!decision.route_to_kb) {
            const fallbackResponse = await buildFallbackResponse({
                organizationId,
                message,
                requiredIntakeFields,
                recentCustomerMessages: customerHistory,
                recentAssistantMessages: assistantHistory,
                conversationHistory: history,
                aiSettings,
                trackUsage: false
            })
            totalInputTokens += routerInputTokens
            totalOutputTokens += routerOutputTokens
            return {
                response: fallbackResponse,
                matchedSkill: bestMatch ? {
                    id: bestMatch.skill_id,
                    title: bestMatch.title,
                    similarity: bestMatch.similarity,
                } : undefined,
                tokenUsage: {
                    inputTokens: totalInputTokens,
                    outputTokens: totalOutputTokens,
                    totalTokens: totalInputTokens + totalOutputTokens,
                    router: {
                        inputTokens: routerInputTokens,
                        outputTokens: routerOutputTokens,
                        totalTokens: routerInputTokens + routerOutputTokens
                    },
                    rag: {
                        inputTokens: 0,
                        outputTokens: 0,
                        totalTokens: 0
                    }
                }
            }
        }

        const query = decision.rewritten_query || message
        const { searchKnowledgeBase } = await import('@/lib/knowledge-base/actions')
        let kbResults = await searchKnowledgeBase(query, organizationId, kbThreshold, 6)
        if (!kbResults || kbResults.length === 0) {
            const fallbackThreshold = Math.max(0.1, kbThreshold - 0.15)
            kbResults = await searchKnowledgeBase(query, organizationId, fallbackThreshold, 6)
        }

        if (kbResults && kbResults.length > 0) {
            const { default: OpenAI } = await import('openai')
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

            const { context } = buildRagContext(kbResults)
            if (!context) {
                throw new Error('RAG context is empty')
            }

            const noAnswerToken = 'NO_ANSWER'
            const basePrompt = withBotNamePrompt(aiSettings.prompt || DEFAULT_FLEXIBLE_PROMPT, aiSettings.bot_name)
            const continuityGuidance = buildConversationContinuityGuidance({
                recentAssistantMessages: assistantHistory
            })
            const systemPrompt = `${basePrompt}

Answer the user's question based strictly on the provided context below.
If the answer is not in the context, respond with "${noAnswerToken}" and do not make up facts.
Keep the answer concise and friendly.
Continue naturally from recent conversation turns without restarting.

Context:
${context}${requiredIntakeGuidance ? `\n\n${requiredIntakeGuidance}` : ''}${continuityGuidance ? `\n\n${continuityGuidance}` : ''}`
            const historyMessages = toOpenAiConversationMessages(history, message, 10)

            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                max_tokens: RAG_MAX_OUTPUT_TOKENS,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...historyMessages,
                    { role: 'user', content: message }
                ],
                temperature: 0.3
            })

            const ragResponse = completion.choices[0]?.message?.content
            const normalizedResponse = ragResponse?.trim() ?? ''
            const polishedResponse = stripRepeatedGreeting(normalizedResponse, assistantHistory)
            const historyTokenCount = historyMessages.reduce((total, item) => total + estimateTokenCount(item.content), 0)

            if (completion.usage) {
                ragInputTokens += completion.usage.prompt_tokens ?? 0
                ragOutputTokens += completion.usage.completion_tokens ?? 0
            } else {
                ragInputTokens += estimateTokenCount(systemPrompt) + historyTokenCount + estimateTokenCount(message)
                ragOutputTokens += estimateTokenCount(polishedResponse)
            }
            if (polishedResponse && !polishedResponse.includes(noAnswerToken)) {
                const topResult = kbResults[0]
                totalInputTokens += routerInputTokens + ragInputTokens
                totalOutputTokens += routerOutputTokens + ragOutputTokens
                return {
                    response: polishedResponse,
                    matchedSkill: {
                        id: 'rag-knowledge-base',
                        title: '📚 Knowledge Base',
                        similarity: topResult?.similarity ?? 0
                    },
                    tokenUsage: {
                        inputTokens: totalInputTokens,
                        outputTokens: totalOutputTokens,
                        totalTokens: totalInputTokens + totalOutputTokens,
                        router: {
                            inputTokens: routerInputTokens,
                            outputTokens: routerOutputTokens,
                            totalTokens: routerInputTokens + routerOutputTokens
                        },
                        rag: {
                            inputTokens: ragInputTokens,
                            outputTokens: ragOutputTokens,
                            totalTokens: ragInputTokens + ragOutputTokens
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('RAG Simulation Error:', error)
    }

    // 4. Final Fallback
    const fallbackResponse = await buildFallbackResponse({
        organizationId,
        message,
        requiredIntakeFields,
        recentCustomerMessages: customerHistory,
        recentAssistantMessages: assistantHistory,
        conversationHistory: history,
        aiSettings,
        trackUsage: false
    })
    totalInputTokens += routerInputTokens + ragInputTokens
    totalOutputTokens += routerOutputTokens + ragOutputTokens
    return {
        response: fallbackResponse,
        matchedSkill: bestMatch ? {
            id: bestMatch.skill_id,
            title: bestMatch.title,
            similarity: bestMatch.similarity,
        } : undefined,
        tokenUsage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens,
            router: {
                inputTokens: routerInputTokens,
                outputTokens: routerOutputTokens,
                totalTokens: routerInputTokens + routerOutputTokens
            },
            rag: {
                inputTokens: ragInputTokens,
                outputTokens: ragOutputTokens,
                totalTokens: ragInputTokens + ragOutputTokens
            }
        }
    }
}
