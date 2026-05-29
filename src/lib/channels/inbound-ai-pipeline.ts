import { v4 as uuidv4 } from 'uuid'
import type { SupabaseClient } from '@supabase/supabase-js'
import { after } from 'next/server'
import { matchSkills } from '@/lib/skills/actions'
import { buildRagContext, type RagChunk } from '@/lib/knowledge-base/rag'
import { decideKnowledgeBaseRoute, type ConversationTurn } from '@/lib/knowledge-base/router'
import type { KnowledgeSearchQueryPlan } from '@/lib/knowledge-base/query-planner'
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
import { matchSkillsWithStatus } from '@/lib/skills/match-safe'
import { resolveOrganizationUsageEntitlement } from '@/lib/billing/entitlements'
import type { OutboundMessageInput, OutboundReplyButton, OutboundSendResult } from '@/lib/channels/outbound-message'
import {
    isMvpResponseLanguageAmbiguous,
    resolveMvpResponseLanguage,
    resolveMvpResponseLanguageName,
    type MvpResponseLanguage
} from '@/lib/ai/language'
import { applyBotMessageDisclaimer } from '@/lib/ai/bot-disclaimer'
import { buildReplyButtonsForSkill, sanitizeSkillActions } from '@/lib/skills/skill-actions'
import { recordAiLatencyEvent } from '@/lib/ai/latency'
import { maybeHandleSchedulingRequest } from '@/lib/ai/booking'
import { withAiTimeout } from '@/lib/ai/deadline'
import { formatOutboundTextForChannel } from '@/lib/channels/outbound-text-format'
import {
    appendCanonicalRagSourceLinks,
    isLikelySourceLinkRequest
} from '@/lib/knowledge-base/rag-source-links'
import { repairLinkOnlyRagAnswer } from '@/lib/knowledge-base/rag-answer-repair'
import { polishGroundedRagAnswer } from '@/lib/knowledge-base/rag-answer-polish'
import { generateGroundedRagAnswer } from '@/lib/knowledge-base/rag-answer-generate'

const RAG_MAX_OUTPUT_TOKENS = 320
const RAG_REASONING_MAX_COMPLETION_TOKENS = 1024
const DEFAULT_RAG_COMPLETION_MODEL = 'gpt-4o-mini'
const KNOWLEDGE_SEARCH_QUERY_SHORT_CIRCUIT_MIN_RESULTS = 3
const KNOWLEDGE_SEARCH_QUERY_SHORT_CIRCUIT_MIN_SIMILARITY = 1.2

function resolveRagSourceLinkLimit(platform: InboundAiPipelineInput['platform']) {
    return platform === 'demo_chat' ? 2 : 1
}

function resolveRagCompletionModel() {
    return process.env.OPENAI_RAG_MODEL?.trim() || DEFAULT_RAG_COMPLETION_MODEL
}

function usesReasoningChatCompletionParameters(model: string) {
    const normalized = model.trim().toLowerCase()
    return /^gpt-5(?:[.-]|$)/.test(normalized) || /^o\d/.test(normalized)
}

function buildRagCompletionParameters(model: string) {
    const normalized = model.trim().toLowerCase()
    if (/^gpt-5\.[4-9](?:[.-]|$)/.test(normalized)) {
        return {
            reasoning_effort: 'none' as const,
            max_completion_tokens: RAG_MAX_OUTPUT_TOKENS
        }
    }

    if (/^gpt-5(?:[.-]|$)/.test(normalized)) {
        return {
            reasoning_effort: 'minimal' as const,
            max_completion_tokens: RAG_MAX_OUTPUT_TOKENS
        }
    }

    if (usesReasoningChatCompletionParameters(model)) {
        return { max_completion_tokens: RAG_REASONING_MAX_COMPLETION_TOKENS }
    }

    return {
        temperature: 0.3,
        max_tokens: RAG_MAX_OUTPUT_TOKENS
    }
}

async function recordInboundAiUsage(
    input: Parameters<typeof recordAiUsage>[0],
    logPrefix: string
) {
    try {
        await recordAiUsage(input)
    } catch (error) {
        console.error(`${logPrefix}: AI usage recording failed; continuing reply flow`, error)
    }
}

function payloadContainsNoAnswer(value: unknown): boolean {
    if (typeof value === 'string') {
        return /\bno_answer\b/i.test(value.trim())
    }
    if (Array.isArray(value)) return value.some(payloadContainsNoAnswer)
    if (value && typeof value === 'object') {
        return Object.values(value).some(payloadContainsNoAnswer)
    }
    return false
}

function isRagNoAnswerResponse(response: string | null | undefined) {
    const trimmed = response?.trim()
    if (!trimmed) return false
    if (payloadContainsNoAnswer(trimmed)) return true

    try {
        return payloadContainsNoAnswer(JSON.parse(trimmed))
    } catch {
        return false
    }
}

function buildNoInformationSeed(responseLanguage: MvpResponseLanguage) {
    return responseLanguage === 'tr'
        ? 'Bu konuda elimde net bilgi yok.'
        : 'I do not have clear information about this in the knowledge base.'
}

function normalizeKnowledgeSearchQuery(value: string) {
    return value.replace(/\s+/g, ' ').trim()
}

function knowledgeSearchQueryKey(value: string) {
    return normalizeKnowledgeSearchQuery(value).toLocaleLowerCase('tr-TR')
}

function looksLikeStandaloneKnowledgeSearch(message: string) {
    const normalized = knowledgeSearchQueryKey(message)
    if (!normalized) return false
    if (normalized.includes('?')) return true

    return /\b(?:nedir|ne demek|ne anlama|neyi ifade|açılım|acilim|kısaltma|kisaltma|ne kadar|kac|kaç|hangi|nasil|nasıl|nerede|kim|sure|süre|gun|gün|yil|yıl|izin|ders|staj|sinav|sınav|kampus|kampüs|yerleske|yerleşke|adres|mail|e-?posta|telefon|cift anadal|çift anadal)\b/iu.test(normalized)
}

function hasStandaloneSubjectCue(message: string) {
    const normalized = knowledgeSearchQueryKey(message)
    const hasAbbreviationSignal = /\b(?:kısaltma|kisaltma|açılım|acilim|ne demek|ne anlama|neyi ifade|ifade ediyor)\b/iu.test(normalized)
    const hasRawAcronym = /\b[\p{Lu}ÇĞİÖŞÜ]{2,6}\b/u.test(message)
    const hasTitleCaseAbbreviationQuestion = hasAbbreviationSignal
        && /^\s*[\p{Lu}ÇĞİÖŞÜ][\p{Ll}çğıöşü]{1,5}\b/u.test(message)
    const hasNamedUnitPhrase = /\b(?:programı|programi|fakültesi|fakultesi|yüksekokulu|yuksekokulu|dairesi|başkanlığı|baskanligi|yerleşkesi|yerleskesi|kampüsü|kampusu)\b/iu.test(normalized)
    const hasNumberedPolicySubject = /\d/.test(normalized)
        && /\b(?:personel|çalışan|calisan|öğrenci|ogrenci|izin|ders|staj|sınav|sinav|gün|gun|yıl|yil)\b/iu.test(normalized)

    return hasAbbreviationSignal
        || hasRawAcronym
        || hasTitleCaseAbbreviationQuestion
        || hasNamedUnitPhrase
        || hasNumberedPolicySubject
}

function hasCompoundKnowledgeQuestionSignal(part: string) {
    const normalized = knowledgeSearchQueryKey(part)
    const tokenCount = (normalized.match(/[\p{L}\p{N}]{2,}/gu) ?? []).length
    if (tokenCount < 3) return false

    return /\b(?:adres|anadal|başvuru|basvuru|çap|cap|çift|cift|ders|e-?posta|eğitim|egitim|final|hak|hangi|iletişim|iletisim|izin|kaç|kac|kampüs|kampus|kim|mail|mazeret|nerede|not|program|rapor|sınav|sinav|sorumlu|staj|telefon|var mı|var mi|yapabilir)\b/iu.test(normalized)
}

function splitCompoundKnowledgeSearchQueries(message: string) {
    const normalized = normalizeKnowledgeSearchQuery(message)
    if (!/\s+(?:ve|ayrıca|ayrica|and)\s+/iu.test(normalized)) return []

    const hasQuestionMark = /[?？]\s*$/.test(normalized)
    const parts = normalized
        .replace(/[?？]\s*$/u, '')
        .split(/\s+(?:ve|ayrıca|ayrica|and)\s+/iu)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => hasQuestionMark && !/[?？]\s*$/.test(part) ? `${part}?` : part)
        .filter(hasCompoundKnowledgeQuestionSignal)

    return parts.length >= 2 ? parts : []
}

function shouldPreferOriginalKnowledgeSearch(message: string, history: ConversationTurn[]) {
    if (!looksLikeStandaloneKnowledgeSearch(message)) return false
    if (history.length === 0) return true

    return hasStandaloneSubjectCue(message)
}

function buildKnowledgeSearchQueries(primaryQuery: string, originalMessage: string, history: ConversationTurn[]) {
    const primary = normalizeKnowledgeSearchQuery(primaryQuery)
    const original = normalizeKnowledgeSearchQuery(originalMessage)
    const shouldPreferOriginal = shouldPreferOriginalKnowledgeSearch(original, history)
    const compoundParts = splitCompoundKnowledgeSearchQueries(original)
    const ordered = shouldPreferOriginal
        ? [original, ...compoundParts, primary]
        : history.length > 0
            ? [primary, original, ...compoundParts]
            : [primary, ...compoundParts]
    const seen = new Set<string>()
    const queries: string[] = []

    for (const query of ordered) {
        if (!query) continue
        const key = knowledgeSearchQueryKey(query)
        if (seen.has(key)) continue
        seen.add(key)
        queries.push(query)
    }

    return queries
}

function knowledgeResultKey(result: RagChunk) {
    return result.chunk_id
        ?? `${result.document_id ?? 'unknown'}:${result.content.replace(/\s+/g, ' ').trim().slice(0, 180)}`
}

function mergeKnowledgeSearchResultGroups<T extends RagChunk>(groups: T[][], limit: number) {
    const seen = new Set<string>()
    const merged: T[] = []

    for (const group of groups) {
        for (const result of group) {
            const key = knowledgeResultKey(result)
            if (seen.has(key)) continue
            seen.add(key)
            merged.push(result)
            if (merged.length >= limit) return merged
        }
    }

    return merged
}

function shouldSkipAdditionalKnowledgeSearchQueries(results: RagChunk[], limit: number) {
    if (results.length === 0) return false

    const requiredResultCount = Math.min(
        Math.max(1, limit),
        KNOWLEDGE_SEARCH_QUERY_SHORT_CIRCUIT_MIN_RESULTS
    )
    if (results.length < requiredResultCount) return false

    const topSimilarity = results.reduce((best, result) => {
        const similarity = typeof result.similarity === 'number' && Number.isFinite(result.similarity)
            ? result.similarity
            : 0
        return Math.max(best, similarity)
    }, 0)

    return topSimilarity >= KNOWLEDGE_SEARCH_QUERY_SHORT_CIRCUIT_MIN_SIMILARITY
}

function shouldUseExtractiveRagBeforeCompletion(userMessage: string, extractiveResponse: string) {
    const normalizedQuestion = knowledgeSearchQueryKey(userMessage)
    const normalizedResponse = knowledgeSearchQueryKey(extractiveResponse)
    const asksForLocationOrAddress = /\b(?:adres|kampus|kampusu|yerleske|konum|ulasim|nerede|nerde)\b/u.test(normalizedQuestion)
    const responseHasAddressShape = /\b(?:adresi|yerleskesi|mahallesi|caddesi|bulvari|sokak|no:)\b/u.test(normalizedResponse)

    return asksForLocationOrAddress && responseHasAddressShape
}

const INSTAGRAM_REQUEST_TAG = 'instagram_request'

export interface InboundAiPipelineInput {
    supabase: SupabaseClient
    organizationId: string
    platform: 'whatsapp' | 'telegram' | 'instagram' | 'demo_chat'
    source: 'whatsapp' | 'telegram' | 'instagram' | 'demo_chat'
    contactId: string
    contactName: string | null
    contactAvatarUrl?: string | null
    text: string
    inboundMessageId: string
    inboundMessageIdMetadataKey: string
    inboundMessageMetadata: Record<string, unknown>
    reprocessExistingInbound?: boolean
    inboundActionSelection?: {
        kind: 'skill_action'
        sourceSkillId: string
        actionId: string
        buttonTitle: string | null
    }
    skipAutomation?: boolean
    sendOutbound: (content: OutboundMessageInput) => Promise<OutboundSendResult | void>
    logPrefix: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
}

function readTrimmedString(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function normalizeContactAvatarUrl(value: unknown): string | null {
    const trimmed = readTrimmedString(value)
    if (!trimmed) return null
    if (!/^https?:\/\//i.test(trimmed)) return null
    return trimmed
}

function shouldMarkInstagramRequest(input: InboundAiPipelineInput) {
    if (input.platform !== 'instagram') return false
    const eventSource = input.inboundMessageMetadata.instagram_event_source
    return eventSource === 'standby'
}

function isInstagramSeenEvent(input: InboundAiPipelineInput) {
    if (input.platform !== 'instagram') return false
    const eventType = readTrimmedString(input.inboundMessageMetadata.instagram_event_type)
    return eventType?.toLowerCase() === 'seen'
}

function isInstagramDeletedEvent(input: InboundAiPipelineInput) {
    if (input.platform !== 'instagram') return false
    const eventType = readTrimmedString(input.inboundMessageMetadata.instagram_event_type)
    return eventType?.toLowerCase() === 'message_deleted'
}

function readMessageMetadataString(metadata: unknown, key: string) {
    if (!isRecord(metadata)) return null
    return readTrimmedString(metadata[key])
}

function buildSkillImagePlaceholder(responseLanguage: 'tr' | 'en') {
    return responseLanguage === 'tr' ? '[Yetenek görseli]' : '[Skill image]'
}

function buildSkillImageFailureNotice(responseLanguage: 'tr' | 'en') {
    return responseLanguage === 'tr'
        ? '[Yetenek görseli gönderilemedi]'
        : '[Skill image could not be delivered]'
}

function buildSkillImageMetadata(
    platform: InboundAiPipelineInput['platform'],
    image: {
        imageUrl: string
        mimeType?: string | null
        fileName?: string | null
    },
    status: 'sent' | 'failed'
) {
    const baseMedia = {
        type: 'image',
        mime_type: image.mimeType ?? 'image/webp',
        filename: image.fileName ?? null,
        caption: null,
        storage_url: image.imageUrl,
        delivery_status: status
    }

    if (platform === 'instagram') {
        return {
            instagram_message_type: 'image',
            instagram_media_type: 'image',
            instagram_media_mime_type: image.mimeType ?? 'image/webp',
            instagram_media_filename: image.fileName ?? null,
            instagram_outbound_status: status,
            instagram_is_media_placeholder: true,
            instagram_media: baseMedia
        }
    }

    if (platform === 'telegram') {
        return {
            telegram_message_type: 'image',
            telegram_media_type: 'image',
            telegram_media_mime_type: image.mimeType ?? 'image/webp',
            telegram_media_filename: image.fileName ?? null,
            telegram_outbound_status: status,
            telegram_is_media_placeholder: true,
            telegram_media: baseMedia
        }
    }

    if (platform === 'demo_chat') {
        return {
            demo_chat_message_type: 'image',
            demo_chat_media_type: 'image',
            demo_chat_media_mime_type: image.mimeType ?? 'image/webp',
            demo_chat_media_filename: image.fileName ?? null,
            demo_chat_outbound_status: status,
            demo_chat_is_media_placeholder: true,
            demo_chat_media: baseMedia
        }
    }

    return {
        whatsapp_message_type: 'image',
        whatsapp_media_type: 'image',
        whatsapp_media_mime_type: image.mimeType ?? 'image/webp',
        whatsapp_media_filename: image.fileName ?? null,
        whatsapp_outbound_status: status,
        whatsapp_is_media_placeholder: true,
        whatsapp_media: baseMedia
    }
}

function buildOutboundProviderMetadata(
    platform: InboundAiPipelineInput['platform'],
    outboundResult: OutboundSendResult | void
) {
    const metadata = isRecord(outboundResult?.providerMetadata)
        ? { ...outboundResult.providerMetadata }
        : {}
    const providerMessageId = readTrimmedString(outboundResult?.providerMessageId)

    if (!providerMessageId) {
        return metadata
    }

    if (platform === 'instagram') {
        return {
            ...metadata,
            instagram_message_id: providerMessageId
        }
    }

    if (platform === 'telegram') {
        return {
            ...metadata,
            telegram_message_id: providerMessageId
        }
    }

    if (platform === 'demo_chat') {
        return metadata
    }

    return {
        ...metadata,
        whatsapp_message_id: providerMessageId
    }
}

function mergeConversationTags(existingTags: unknown, ensureTag: string | null): string[] {
    const normalized = readStringArray(existingTags)
    if (!ensureTag) return normalized

    const hasTag = normalized.some((tag) => tag.toLowerCase() === ensureTag.toLowerCase())
    if (hasTag) return normalized

    return [...normalized, ensureTag]
}

function schedulePostResponseTask(logPrefix: string, label: string, task: () => Promise<void>) {
    const runTask = async () => {
        try {
            await task()
        } catch (error) {
            console.error(`${logPrefix}: Deferred ${label} failed`, error)
        }
    }

    try {
        after(runTask)
    } catch {
        void runTask()
    }
}

async function handleInstagramDeletedEvent(params: {
    conversation: Record<string, unknown>
    contactAvatarUrl: string | null
    markInstagramRequest: boolean
    options: InboundAiPipelineInput
}) {
    const { conversation, contactAvatarUrl, markInstagramRequest, options } = params
    const { data: conversationMessages, error: conversationMessagesError } = await options.supabase
        .from('messages')
        .select('id, sender_type, content, metadata')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true })

    if (conversationMessagesError) {
        console.error(`${options.logPrefix}: Failed to inspect instagram deleted-message history`, conversationMessagesError)
        return
    }

    const normalizedConversationMessages = Array.isArray(conversationMessages)
        ? conversationMessages as Array<Record<string, unknown>>
        : []
    const matchingMessage = normalizedConversationMessages.find((message) => (
        readMessageMetadataString(message.metadata, options.inboundMessageIdMetadataKey) === options.inboundMessageId
        && readMessageMetadataString(message.metadata, 'instagram_event_type')?.toLowerCase() !== 'message_deleted'
    ))
    const existingDeletedMessage = normalizedConversationMessages.find((message) => (
        readMessageMetadataString(message.metadata, options.inboundMessageIdMetadataKey) === options.inboundMessageId
        && readMessageMetadataString(message.metadata, 'instagram_event_type')?.toLowerCase() === 'message_deleted'
    ))

    if (existingDeletedMessage) return

    const hasOtherMeaningfulHistory = normalizedConversationMessages.some((message) => {
        if (message.id === matchingMessage?.id) return false
        const eventType = readMessageMetadataString(message.metadata, 'instagram_event_type')?.toLowerCase()
        if (eventType === 'seen' || eventType === 'message_deleted') return false
        return true
    })

    if (matchingMessage && !hasOtherMeaningfulHistory) {
        const { error: deleteMessagesError } = await options.supabase
            .from('messages')
            .delete()
            .eq('conversation_id', conversation.id)

        if (deleteMessagesError) {
            console.error(`${options.logPrefix}: Failed to remove deleted-only instagram conversation messages`, deleteMessagesError)
            return
        }

        const { error: deleteConversationError } = await options.supabase
            .from('conversations')
            .delete()
            .eq('id', conversation.id)

        if (deleteConversationError) {
            console.error(`${options.logPrefix}: Failed to remove deleted-only instagram conversation`, deleteConversationError)
        }
        return
    }

    if (matchingMessage?.id) {
        const currentMetadata = isRecord(matchingMessage.metadata) ? matchingMessage.metadata : {}
        const { error: updateMessageError } = await options.supabase
            .from('messages')
            .update({
                content: options.text,
                metadata: {
                    ...currentMetadata,
                    ...options.inboundMessageMetadata,
                    instagram_event_type: 'message_deleted'
                }
            })
            .eq('id', matchingMessage.id)

        if (updateMessageError) {
            console.error(`${options.logPrefix}: Failed to update instagram deleted message state`, updateMessageError)
            return
        }
    } else if (hasOtherMeaningfulHistory) {
        const { error: insertDeletedMessageError } = await options.supabase
            .from('messages')
            .insert({
                id: uuidv4(),
                conversation_id: conversation.id,
                organization_id: options.organizationId,
                sender_type: 'contact',
                content: options.text,
                metadata: options.inboundMessageMetadata
            })

        if (insertDeletedMessageError) {
            if (insertDeletedMessageError.code === '23505') return
            console.error(`${options.logPrefix}: Failed to persist instagram deleted message placeholder`, insertDeletedMessageError)
            return
        }
    } else {
        return
    }

    const updatedConversationTags = mergeConversationTags(
        conversation.tags,
        markInstagramRequest ? INSTAGRAM_REQUEST_TAG : null
    )

    await options.supabase
        .from('conversations')
        .update({
            contact_name: options.contactName || conversation.contact_name,
            contact_avatar_url: contactAvatarUrl || conversation.contact_avatar_url || null,
            tags: updatedConversationTags,
            updated_at: new Date().toISOString()
        })
        .eq('id', conversation.id)
}

export async function processInboundAiPipeline(options: InboundAiPipelineInput) {
    const orgId = options.organizationId
    const markInstagramRequest = shouldMarkInstagramRequest(options)
    const contactAvatarUrl = normalizeContactAvatarUrl(options.contactAvatarUrl)
    const isInstagramDeleted = isInstagramDeletedEvent(options)
    let reuseExistingInbound = false

    if (!isInstagramDeleted) {
        const dedupeFilter = `metadata->>${options.inboundMessageIdMetadataKey}`
        const { data: existingInboundData } = await options.supabase
            .from('messages')
            .select('id')
            .eq('organization_id', orgId)
            .eq(dedupeFilter, options.inboundMessageId)
            .maybeSingle()
        const existingInbound = existingInboundData as { id?: string } | null

        if (existingInbound?.id) {
            if (!options.reprocessExistingInbound) return
            reuseExistingInbound = true
        }
    }

    let { data: conversation } = await options.supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', orgId)
        .eq('platform', options.platform)
        .eq('contact_phone', options.contactId)
        .limit(1)
        .maybeSingle()

    if (isInstagramDeleted) {
        if (!conversation) return
        await handleInstagramDeletedEvent({
            conversation,
            contactAvatarUrl,
            markInstagramRequest,
            options
        })
        return
    }

    if (!conversation) {
        if (reuseExistingInbound) return

        const conversationTags = mergeConversationTags([], markInstagramRequest ? INSTAGRAM_REQUEST_TAG : null)
        const { data: newConversation, error: createConversationError } = await options.supabase
            .from('conversations')
            .insert({
                id: uuidv4(),
                organization_id: orgId,
                platform: options.platform,
                contact_name: options.contactName || options.contactId,
                contact_avatar_url: contactAvatarUrl,
                contact_phone: options.contactId,
                status: 'open',
                unread_count: 0,
                tags: conversationTags
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

    const updatedConversationTags = mergeConversationTags(
        conversation.tags,
        markInstagramRequest ? INSTAGRAM_REQUEST_TAG : null
    )
    const isInstagramSeen = isInstagramSeenEvent(options)

    if (!reuseExistingInbound) {
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
                contact_avatar_url: contactAvatarUrl || conversation.contact_avatar_url || null,
                tags: updatedConversationTags,
                ...(!isInstagramSeen
                    ? {
                        last_message_at: new Date().toISOString(),
                        unread_count: (conversation.unread_count ?? 0) + 1
                    }
                    : {}),
                updated_at: new Date().toISOString()
            })
            .eq('id', conversation.id)
    }

    if (options.skipAutomation) {
        console.info(`${options.logPrefix}: Automation skipped for inbound message`, {
            organization_id: orgId,
            conversation_id: conversation.id,
            inbound_message_id: options.inboundMessageId
        })
        return
    }

    if (conversation.ai_processing_paused) {
        console.info(`${options.logPrefix}: Conversation AI processing paused`, {
            organization_id: orgId,
            conversation_id: conversation.id
        })
        return
    }

    let languageHistoryMessages: string[] = []
    if (isMvpResponseLanguageAmbiguous(options.text)) {
        const { data: languageHistoryRows, error: languageHistoryError } = await options.supabase
            .from('messages')
            .select('sender_type, content')
            .eq('conversation_id', conversation.id)
            .order('created_at', { ascending: false })
            .limit(8)

        if (languageHistoryError) {
            console.warn(`${options.logPrefix}: Failed to load language history`, languageHistoryError)
        } else {
            languageHistoryMessages = (languageHistoryRows ?? [])
                .filter((row) => row.sender_type === 'contact')
                .map((row) => (row.content ?? '').toString().trim())
                .filter(Boolean)
                .slice(0, 6)
        }
    }

    const responseLanguage = resolveMvpResponseLanguage(options.text, {
        historyMessages: languageHistoryMessages
    })
    const responseLanguageName = resolveMvpResponseLanguageName(options.text, {
        historyMessages: languageHistoryMessages
    })
    const aiSettings = await getOrgAiSettings(orgId, {
        supabase: options.supabase,
        failClosedBotMode: true,
        locale: responseLanguage
    })
    const formatOutboundBotMessage = (content: string) => {
        const disclaimerSettings = options.platform === 'demo_chat'
            ? { ...aiSettings, bot_disclaimer_enabled: false }
            : aiSettings
        const withDisclaimer = applyBotMessageDisclaimer({
            message: content,
            platform: options.platform,
            responseLanguage,
            settings: disclaimerSettings
        })
        return formatOutboundTextForChannel(withDisclaimer, { platform: options.platform })
    }
    const matchThreshold = aiSettings.match_threshold
    const kbThreshold = matchThreshold
    const requiredIntakeFields = await getRequiredIntakeFields({
        organizationId: orgId,
        supabase: options.supabase
    })

    const operatorActive = isOperatorActive(conversation)
    const botMode = aiSettings.bot_mode ?? 'active'
    const { allowReplies } = resolveBotModeAction(botMode)
    const allowDuringOperator = aiSettings.allow_lead_extraction_during_operator ?? false
    let manualRenewalChecked = false
    const ensureUsageAllowed = async (stage: string) => {
        const skipManualRenewal = manualRenewalChecked
        const entitlement = await resolveOrganizationUsageEntitlement(orgId, {
            supabase: options.supabase,
            ...(skipManualRenewal ? { skipManualRenewal: true } : {})
        })
        manualRenewalChecked = true

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

    const persistBotMessage = async (content: string, metadata: Record<string, unknown>) => {
        const demoChatReplyToMessageId = readTrimmedString(metadata.demo_chat_reply_to_message_id)
        const demoChatReplyKind = readTrimmedString(metadata.demo_chat_reply_kind)

        if (demoChatReplyToMessageId && demoChatReplyKind) {
            const { data: existingDemoReply, error: existingDemoReplyError } = await options.supabase
                .from('messages')
                .select('id')
                .eq('conversation_id', conversation.id)
                .eq('sender_type', 'bot')
                .eq('metadata->>demo_chat_reply_to_message_id', demoChatReplyToMessageId)
                .eq('metadata->>demo_chat_reply_kind', demoChatReplyKind)
                .maybeSingle()

            if (existingDemoReplyError) {
                console.error(`${options.logPrefix}: Failed to check existing demo bot reply`, {
                    organization_id: orgId,
                    conversation_id: conversation.id,
                    inbound_message_id: demoChatReplyToMessageId,
                    reply_kind: demoChatReplyKind,
                    error: existingDemoReplyError
                })
            } else if (isRecord(existingDemoReply) && readTrimmedString(existingDemoReply.id)) {
                console.info(`${options.logPrefix}: Skipped duplicate demo bot reply`, {
                    organization_id: orgId,
                    conversation_id: conversation.id,
                    inbound_message_id: demoChatReplyToMessageId,
                    reply_kind: demoChatReplyKind
                })
                return
            }
        }

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

    const sendOutboundAndCollectMetadata = async (content: OutboundMessageInput) => {
        const outboundResult = await options.sendOutbound(content)
        return buildOutboundProviderMetadata(options.platform, outboundResult)
    }

    const applyDeferredLeadEscalation = async () => {
        const { data: leadForEscalation, error: leadForEscalationError } = await options.supabase
            .from('leads')
            .select('total_score')
            .eq('conversation_id', conversation.id)
            .maybeSingle()

        if (leadForEscalationError) {
            console.warn(`${options.logPrefix}: Failed to load lead score for escalation`, leadForEscalationError)
            return
        }

        const leadScoreForEscalation = typeof leadForEscalation?.total_score === 'number'
            ? leadForEscalation.total_score
            : null
        const handoverMessage = responseLanguage === 'tr'
            ? aiSettings.hot_lead_handover_message_tr
            : aiSettings.hot_lead_handover_message_en
        const escalation = decideHumanEscalation({
            skillRequiresHumanHandover: false,
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
            const outboundMetadata = await sendOutboundAndCollectMetadata(formattedEscalationNotice)
            await persistBotMessage(formattedEscalationNotice, {
                ...outboundMetadata,
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
            console.error(`${options.logPrefix}: Failed to persist deferred conversation escalation state`, escalationUpdateError)
            return
        }

        conversation = {
            ...conversation,
            ...escalationConversationUpdate
        }
    }

    if (shouldRunLeadExtraction) {
        schedulePostResponseTask(options.logPrefix, 'lead extraction', async () => {
            if (!await ensureUsageAllowed('deferred_lead_extraction')) return

            await runLeadExtraction({
                organizationId: orgId,
                conversationId: conversation.id,
                latestMessage: options.text,
                supabase: options.supabase,
                source: options.source,
                skipManualRenewal: true
            })

            if (operatorActive || !allowReplies) return
            await applyDeferredLeadEscalation()
        })
    }

    if (!await ensureUsageAllowed('before_skill_matching')) return

    if (operatorActive || !allowReplies) return

    const applyEscalationAfterReply = async (args: { skillRequiresHumanHandover: boolean }) => {
        const handoverMessage = responseLanguage === 'tr'
            ? aiSettings.hot_lead_handover_message_tr
            : aiSettings.hot_lead_handover_message_en
        const escalation = decideHumanEscalation({
            skillRequiresHumanHandover: args.skillRequiresHumanHandover,
            leadScore: null,
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
            const outboundMetadata = await sendOutboundAndCollectMetadata(formattedEscalationNotice)
            await persistBotMessage(formattedEscalationNotice, {
                ...outboundMetadata,
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

    const buildSkillReplyButtons = (skillId: string, rawActions: unknown): OutboundReplyButton[] => {
        const actions = sanitizeSkillActions(rawActions)
        return buildReplyButtonsForSkill(skillId, actions)
    }

    const buildSkillActionUnavailableMessage = () => (
        responseLanguage === 'tr'
            ? 'Bu seçenek şu anda kullanılamıyor. Lütfen farklı bir seçim yapın.'
            : 'This option is currently unavailable. Please choose a different option.'
    )

    const sendSkillActionUnavailableReply = async (metadata: Record<string, unknown>) => {
        const unavailableReply = formatOutboundBotMessage(buildSkillActionUnavailableMessage())
        const outboundMetadata = await sendOutboundAndCollectMetadata(unavailableReply)
        await persistBotMessage(unavailableReply, {
            ...outboundMetadata,
            is_skill_action: true,
            skill_action_unavailable: true,
            ...metadata
        })
    }

    const sendSkillReply = async (args: {
        skillId: string
        skillTitle: string | null
        responseText: string
        skillRequiresHumanHandover: boolean
        rawSkillActions: unknown
        imagePublicUrl?: string | null
        imageMimeType?: string | null
        imageOriginalFilename?: string | null
        metadata: Record<string, unknown>
    }) => {
        const formattedSkillReply = formatOutboundBotMessage(args.responseText)
        const replyButtons = buildSkillReplyButtons(args.skillId, args.rawSkillActions)
        const outboundMetadata = replyButtons.length > 0
            ? await sendOutboundAndCollectMetadata({
                content: formattedSkillReply,
                replyButtons
            })
            : await sendOutboundAndCollectMetadata(formattedSkillReply)

        await persistBotMessage(formattedSkillReply, {
            ...outboundMetadata,
            skill_id: args.skillId,
            skill_title: args.skillTitle,
            matched_skill_title: args.skillTitle,
            skill_requires_human_handover: args.skillRequiresHumanHandover,
            ...args.metadata
        })

        const imageUrl = readTrimmedString(args.imagePublicUrl)
        if (imageUrl) {
            try {
                const imageOutboundMetadata = await sendOutboundAndCollectMetadata({
                    type: 'image',
                    imageUrl,
                    mimeType: args.imageMimeType ?? 'image/webp',
                    fileName: args.imageOriginalFilename ?? null
                })
                await persistBotMessage(buildSkillImagePlaceholder(responseLanguage), {
                    skill_id: args.skillId,
                    skill_title: args.skillTitle,
                    matched_skill_title: args.skillTitle,
                    skill_requires_human_handover: args.skillRequiresHumanHandover,
                    skill_has_image: true,
                    ...buildSkillImageMetadata(options.platform, {
                        imageUrl,
                        mimeType: args.imageMimeType ?? 'image/webp',
                        fileName: args.imageOriginalFilename ?? null
                    }, 'sent'),
                    ...imageOutboundMetadata,
                    ...args.metadata
                })
            } catch (error) {
                console.warn(`${options.logPrefix}: Failed to deliver skill image`, {
                    skill_id: args.skillId,
                    organization_id: orgId,
                    conversation_id: conversation.id,
                    error: error instanceof Error ? error.message : String(error)
                })
                await persistBotMessage(buildSkillImageFailureNotice(responseLanguage), {
                    skill_id: args.skillId,
                    skill_title: args.skillTitle,
                    matched_skill_title: args.skillTitle,
                    skill_requires_human_handover: args.skillRequiresHumanHandover,
                    skill_has_image: true,
                    skill_image_delivery_failed: true,
                    ...buildSkillImageMetadata(options.platform, {
                        imageUrl,
                        mimeType: args.imageMimeType ?? 'image/webp',
                        fileName: args.imageOriginalFilename ?? null
                    }, 'failed'),
                    ...args.metadata
                })
            }
        }

        await applyEscalationAfterReply({
            skillRequiresHumanHandover: args.skillRequiresHumanHandover
        })
    }

    let customerHistoryForFollowup = [options.text.trim()].filter(Boolean)
    let assistantHistoryForFollowup: string[] = []
    let conversationHistoryForReply: ConversationTurn[] = []
    let leadSnapshotForReply: {
        service_type?: string | null
        extracted_fields?: Record<string, unknown> | null
    } | null = null
    let fallbackKnowledgeContext: string | null = null
    let fallbackKnowledgeChunks: RagChunk[] | null = null
    let requiredIntakeAnalysis = analyzeRequiredIntakeState({
        requiredFields: requiredIntakeFields,
        recentCustomerMessages: customerHistoryForFollowup,
        recentAssistantMessages: assistantHistoryForFollowup,
        leadSnapshot: leadSnapshotForReply
    })

    if (options.inboundActionSelection?.kind === 'skill_action') {
        const { data: sourceSkill, error: sourceSkillError } = await options.supabase
            .from('skills')
            .select('id, organization_id, title, skill_actions')
            .eq('id', options.inboundActionSelection.sourceSkillId)
            .maybeSingle()

        if (sourceSkillError) {
            console.warn(`${options.logPrefix}: Failed to resolve source skill action`, {
                source_skill_id: options.inboundActionSelection.sourceSkillId,
                error: sourceSkillError
            })
            await sendSkillActionUnavailableReply({
                source_skill_id: options.inboundActionSelection.sourceSkillId,
                skill_action_id: options.inboundActionSelection.actionId
            })
            return
        }

        if (!sourceSkill || sourceSkill.organization_id !== orgId) {
            await sendSkillActionUnavailableReply({
                source_skill_id: options.inboundActionSelection.sourceSkillId,
                skill_action_id: options.inboundActionSelection.actionId
            })
            return
        }

        if (sourceSkill && sourceSkill.organization_id === orgId) {
            const sourceSkillActions = sanitizeSkillActions(sourceSkill.skill_actions)
            const matchedAction = sourceSkillActions.find((action) => action.id === options.inboundActionSelection?.actionId)

            if (!matchedAction) {
                await sendSkillActionUnavailableReply({
                    source_skill_id: sourceSkill.id,
                    source_skill_title: sourceSkill.title,
                    skill_action_id: options.inboundActionSelection.actionId
                })
                return
            }

            if (matchedAction?.type === 'open_url') {
                const formattedUrlReply = formatOutboundBotMessage(matchedAction.url)
                const outboundMetadata = await sendOutboundAndCollectMetadata(formattedUrlReply)
                await persistBotMessage(formattedUrlReply, {
                    ...outboundMetadata,
                    is_skill_action: true,
                    skill_action_type: matchedAction.type,
                    skill_action_id: matchedAction.id,
                    skill_action_label: matchedAction.label,
                    source_skill_id: sourceSkill.id,
                    source_skill_title: sourceSkill.title
                })
                await applyEscalationAfterReply({ skillRequiresHumanHandover: false })
                return
            }

            if (matchedAction?.type === 'trigger_skill') {
                const { data: targetSkill, error: targetSkillError } = await options.supabase
                    .from('skills')
                    .select('id, organization_id, title, response_text, enabled, requires_human_handover, skill_actions, image_public_url, image_mime_type, image_original_filename')
                    .eq('id', matchedAction.target_skill_id)
                    .maybeSingle()

                if (targetSkillError) {
                    console.warn(`${options.logPrefix}: Failed to load trigger-skill action target`, {
                        source_skill_id: sourceSkill.id,
                        target_skill_id: matchedAction.target_skill_id,
                        error: targetSkillError
                    })
                    await sendSkillActionUnavailableReply({
                        source_skill_id: sourceSkill.id,
                        source_skill_title: sourceSkill.title,
                        skill_action_type: matchedAction.type,
                        skill_action_id: matchedAction.id,
                        skill_action_label: matchedAction.label
                    })
                    return
                } else if (targetSkill && targetSkill.organization_id === orgId && targetSkill.enabled) {
                    const targetSkillTitle = (targetSkill.title ?? '').toString().trim() || null
                    await sendSkillReply({
                        skillId: targetSkill.id,
                        skillTitle: targetSkillTitle,
                        responseText: targetSkill.response_text,
                        skillRequiresHumanHandover: Boolean(targetSkill.requires_human_handover),
                        rawSkillActions: targetSkill.skill_actions,
                        imagePublicUrl: targetSkill.image_public_url,
                        imageMimeType: targetSkill.image_mime_type,
                        imageOriginalFilename: targetSkill.image_original_filename,
                        metadata: {
                            is_skill_action: true,
                            skill_action_type: matchedAction.type,
                            skill_action_id: matchedAction.id,
                            skill_action_label: matchedAction.label,
                            source_skill_id: sourceSkill.id,
                            source_skill_title: sourceSkill.title
                        }
                    })
                    return
                }

                await sendSkillActionUnavailableReply({
                    source_skill_id: sourceSkill.id,
                    source_skill_title: sourceSkill.title,
                    skill_action_type: matchedAction.type,
                    skill_action_id: matchedAction.id,
                    skill_action_label: matchedAction.label,
                    target_skill_id: matchedAction.target_skill_id
                })
                return
            }
        }
    }

    const llmResponseStartedAt = Date.now()

    if (options.platform !== 'demo_chat') {
        try {
            const schedulingResult = await maybeHandleSchedulingRequest({
                supabase: options.supabase,
                organizationId: orgId,
                conversationId: conversation.id,
                message: options.text,
                platform: options.platform,
                customerName: conversation.contact_name ?? null,
                customerPhone: conversation.contact_phone ?? null,
                responseLanguage,
                formatOutboundBotMessage,
                sendOutbound: async (content) => {
                    await options.sendOutbound(content)
                },
                persistBotMessage
            })
            const schedulingHandled = typeof schedulingResult === 'object'
                ? schedulingResult.handled
                : schedulingResult
            const schedulingRequiresHumanHandover = typeof schedulingResult === 'object'
                ? Boolean(schedulingResult.requiresHumanHandover)
                : false

            if (schedulingHandled) {
                if (schedulingRequiresHumanHandover) {
                    await applyEscalationAfterReply({ skillRequiresHumanHandover: true })
                }
                await recordAiLatencyEvent({
                    organizationId: orgId,
                    conversationId: conversation.id,
                    metricKey: 'llm_response',
                    durationMs: Date.now() - llmResponseStartedAt,
                    source: options.source,
                    metadata: {
                        response_kind: 'calendar',
                        platform: options.platform
                    }
                }, {
                    supabase: options.supabase
                })
                return
            }
        } catch (error) {
            console.error(`${options.logPrefix}: Scheduling branch failed`, error)

            const schedulingFailureReply = responseLanguage === 'tr'
                ? 'Takvim işlemini şu anda tamamlayamadım. Ekibimiz buradan devam edecek.'
                : 'I could not complete the calendar action right now. Our team will continue from here.'
            const formattedSchedulingFailureReply = formatOutboundBotMessage(schedulingFailureReply)
            const outboundMetadata = await sendOutboundAndCollectMetadata(formattedSchedulingFailureReply)
            await persistBotMessage(formattedSchedulingFailureReply, {
                ...outboundMetadata,
                is_booking_response: true,
                booking_action: 'handoff',
                booking_error: 'scheduling_branch_failure'
            })
            await applyEscalationAfterReply({ skillRequiresHumanHandover: true })

            await recordAiLatencyEvent({
                organizationId: orgId,
                conversationId: conversation.id,
                metricKey: 'llm_response',
                durationMs: Date.now() - llmResponseStartedAt,
                source: options.source,
                metadata: {
                    response_kind: 'calendar',
                    platform: options.platform
                }
            }, {
                supabase: options.supabase
            })
            return
        }
    }

    const skillMatchResult = await matchSkillsWithStatus({
        matcher: () => matchSkills(options.text, orgId, matchThreshold, 5, options.supabase),
        context: {
            organization_id: orgId,
            conversation_id: conversation.id,
            source: options.source
        },
        intentGate: {
            message: options.text,
            threshold: matchThreshold
        }
    })
    if (skillMatchResult.status === 'error') {
        console.warn(`${options.logPrefix}: Skill matching failed; routing to human attention without fallback`, {
            organization_id: orgId,
            conversation_id: conversation.id,
            error: skillMatchResult.error
        })

        await options.supabase
            .from('conversations')
            .update({
                human_attention_required: true,
                human_attention_reason: 'skill_match_error',
                human_attention_resolved_at: null,
                human_attention_requested_at: conversation.human_attention_requested_at ?? new Date().toISOString()
            })
            .eq('id', conversation.id)
        return
    }
    const skillCandidates = skillMatchResult.matches ?? []
    for (const candidateMatch of skillCandidates) {
        const { data: matchedSkillDetails, error: matchedSkillError } = await options.supabase
            .from('skills')
            .select('requires_human_handover, title, skill_actions, image_public_url, image_mime_type, image_original_filename')
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
        const matchedSkillTitle = (candidateMatch.title ?? '').toString().trim()
            || (matchedSkillDetails?.title ?? '').toString().trim()
            || null

        await sendSkillReply({
            skillId: candidateMatch.skill_id,
            skillTitle: matchedSkillTitle,
            responseText: candidateMatch.response_text,
            skillRequiresHumanHandover,
            rawSkillActions: matchedSkillDetails?.skill_actions,
            imagePublicUrl: matchedSkillDetails?.image_public_url,
            imageMimeType: matchedSkillDetails?.image_mime_type,
            imageOriginalFilename: matchedSkillDetails?.image_original_filename,
            metadata: {
                skill_match_source: 'semantic_top_match'
            }
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
            await recordInboundAiUsage({
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
            }, options.logPrefix)
        }

        if (decision.route_to_kb) {
            const query = decision.rewritten_query || options.text
            const searchQueries = buildKnowledgeSearchQueries(query, options.text, history)
            let queryPlannerUsageRecorded = false
            const recordQueryPlannerUsage = async (plan: KnowledgeSearchQueryPlan) => {
                if (queryPlannerUsageRecorded || !plan.usage) return
                queryPlannerUsageRecorded = true

                await recordInboundAiUsage({
                    organizationId: orgId,
                    category: 'router',
                    model: plan.model,
                    inputTokens: plan.usage.inputTokens,
                    outputTokens: plan.usage.outputTokens,
                    totalTokens: plan.usage.totalTokens,
                    metadata: {
                        conversation_id: conversation.id,
                        stage: 'rag_query_planner',
                        reason: plan.reason,
                        search_query_count: Array.isArray(plan.searchQueries) ? plan.searchQueries.length : 0,
                        must_have_term_count: Array.isArray(plan.mustHaveTerms) ? plan.mustHaveTerms.length : 0
                    },
                    supabase: options.supabase
                }, options.logPrefix)
            }
            const knowledgeSearchOptions = {
                supabase: options.supabase,
                plannerHistory: history,
                queryPlannerUsage: recordQueryPlannerUsage
            }

            const runKnowledgeSearch = async (threshold: number) => {
                const resultGroups = []
                for (let index = 0; index < searchQueries.length; index += 1) {
                    const searchQuery = searchQueries[index]!
                    const results = await searchKnowledgeBase(searchQuery, orgId, threshold, 6, knowledgeSearchOptions)
                    resultGroups.push(results)

                    if (
                        index === 0
                        && searchQueries.length > 1
                        && splitCompoundKnowledgeSearchQueries(searchQueries[0] ?? '').length === 0
                        && shouldSkipAdditionalKnowledgeSearchQueries(results, 6)
                    ) {
                        break
                    }
                }
                return mergeKnowledgeSearchResultGroups(resultGroups, 6)
            }

            let kbResults = await runKnowledgeSearch(kbThreshold)
            if (!kbResults || kbResults.length === 0) {
                const fallbackThreshold = Math.max(0.1, kbThreshold - 0.15)
                kbResults = await runKnowledgeSearch(fallbackThreshold)
            }

            if (kbResults && kbResults.length > 0) {
                const { context, chunks } = buildRagContext(kbResults)
                if (!context) {
                    throw new Error('RAG context is empty')
                }
                const repairChunks = kbResults.length > chunks.length ? kbResults : chunks
                if (!fallbackKnowledgeContext) {
                    fallbackKnowledgeContext = context.replace(/\s+/g, ' ').trim().slice(0, 1500)
                    fallbackKnowledgeChunks = repairChunks
                }

                const groundedGeneratedRagResponse = await generateGroundedRagAnswer({
                    userMessage: options.text,
                    responseLanguage,
                    chunks: repairChunks,
                    settings: aiSettings,
                    conversationHistory: history
                })
                if (groundedGeneratedRagResponse.usage) {
                    await recordInboundAiUsage({
                        organizationId: orgId,
                        category: 'rag',
                        model: groundedGeneratedRagResponse.model,
                        inputTokens: groundedGeneratedRagResponse.usage.inputTokens,
                        outputTokens: groundedGeneratedRagResponse.usage.outputTokens,
                        totalTokens: groundedGeneratedRagResponse.usage.totalTokens,
                        metadata: {
                            conversation_id: conversation.id,
                            source: 'rag_grounded_generate',
                            response_kind: 'rag_grounded_generate',
                            platform: options.platform,
                            document_count: repairChunks.length
                        },
                        supabase: options.supabase
                    }, options.logPrefix)
                }
                if (
                    groundedGeneratedRagResponse.usedGeneration
                    && groundedGeneratedRagResponse.answer.trim()
                    && !isRagNoAnswerResponse(groundedGeneratedRagResponse.answer)
                ) {
                    const repairedGeneratedRagAnswer = repairLinkOnlyRagAnswer({
                        response: groundedGeneratedRagResponse.answer,
                        userMessage: options.text,
                        responseLanguage,
                        chunks: repairChunks
                    })
                    const generatedAnswerWasRepaired = Boolean(
                        repairedGeneratedRagAnswer
                        && !isRagNoAnswerResponse(repairedGeneratedRagAnswer)
                        && repairedGeneratedRagAnswer.trim() !== groundedGeneratedRagResponse.answer.trim()
                    )
                    let generatedAnswerForReply = repairedGeneratedRagAnswer && !isRagNoAnswerResponse(repairedGeneratedRagAnswer)
                        ? repairedGeneratedRagAnswer
                        : groundedGeneratedRagResponse.answer
                    let generatedRagPolishMetadata: {
                        usedPolish: boolean
                        addedEngagement: boolean
                        model: string
                    } | null = null

                    if (!groundedGeneratedRagResponse.addedEngagement || generatedAnswerWasRepaired) {
                        const polishedGeneratedRagResponse = await polishGroundedRagAnswer({
                            answer: generatedAnswerForReply,
                            userMessage: options.text,
                            responseLanguage,
                            chunks: repairChunks,
                            settings: aiSettings
                        })
                        if (polishedGeneratedRagResponse.usage) {
                            await recordInboundAiUsage({
                                organizationId: orgId,
                                category: 'rag',
                                model: polishedGeneratedRagResponse.model,
                                inputTokens: polishedGeneratedRagResponse.usage.inputTokens,
                                outputTokens: polishedGeneratedRagResponse.usage.outputTokens,
                                totalTokens: polishedGeneratedRagResponse.usage.totalTokens,
                                metadata: {
                                    conversation_id: conversation.id,
                                    source: 'rag_grounded_generate_polish',
                                    response_kind: 'rag_grounded_generate_polish',
                                    platform: options.platform,
                                    document_count: repairChunks.length
                                },
                                supabase: options.supabase
                            }, options.logPrefix)
                        }
                        generatedRagPolishMetadata = {
                            usedPolish: polishedGeneratedRagResponse.usedPolish,
                            addedEngagement: polishedGeneratedRagResponse.addedEngagement,
                            model: polishedGeneratedRagResponse.model
                        }
                        if (
                            polishedGeneratedRagResponse.usedPolish
                            && polishedGeneratedRagResponse.answer.trim()
                            && !isRagNoAnswerResponse(polishedGeneratedRagResponse.answer)
                        ) {
                            const repairedPolishedGeneratedRagAnswer = repairLinkOnlyRagAnswer({
                                response: polishedGeneratedRagResponse.answer,
                                userMessage: options.text,
                                responseLanguage,
                                chunks: repairChunks
                            })
                            generatedAnswerForReply = repairedPolishedGeneratedRagAnswer && !isRagNoAnswerResponse(repairedPolishedGeneratedRagAnswer)
                                ? repairedPolishedGeneratedRagAnswer
                                : polishedGeneratedRagResponse.answer
                        }
                    }

                    const generatedRagWithSources = appendCanonicalRagSourceLinks(generatedAnswerForReply, repairChunks, {
                        force: true,
                        limit: resolveRagSourceLinkLimit(options.platform)
                    })
                    const formattedGeneratedRagReply = formatOutboundBotMessage(generatedRagWithSources)
                    const outboundMetadata = await sendOutboundAndCollectMetadata(formattedGeneratedRagReply)
                    await persistBotMessage(formattedGeneratedRagReply, {
                        ...outboundMetadata,
                        is_rag: true,
                        rag_generate: {
                            usedGeneration: groundedGeneratedRagResponse.usedGeneration,
                            addedEngagement: groundedGeneratedRagResponse.addedEngagement,
                            model: groundedGeneratedRagResponse.model
                        },
                        rag_polish: generatedRagPolishMetadata,
                        sources: repairChunks.map((chunk) => chunk.document_id).filter(Boolean)
                    })
                    await recordAiLatencyEvent({
                        organizationId: orgId,
                        conversationId: conversation.id,
                        metricKey: 'llm_response',
                        durationMs: Date.now() - llmResponseStartedAt,
                        source: options.source,
                        metadata: {
                            response_kind: 'rag_grounded_generate',
                            platform: options.platform,
                            document_count: kbResults.length
                        }
                    }, {
                        supabase: options.supabase
                    })
                    await applyEscalationAfterReply({ skillRequiresHumanHandover: false })
                    return
                }

                const extractiveSeed = buildNoInformationSeed(responseLanguage)
                const extractiveRagResponse = repairLinkOnlyRagAnswer({
                    response: extractiveSeed,
                    userMessage: options.text,
                    responseLanguage,
                    chunks: repairChunks
                })
                if (
                    extractiveRagResponse
                    && extractiveRagResponse !== extractiveSeed
                    && !isRagNoAnswerResponse(extractiveRagResponse)
                    && shouldUseExtractiveRagBeforeCompletion(options.text, extractiveRagResponse)
                ) {
                    const polishedExtractiveRagResponse = await polishGroundedRagAnswer({
                        answer: extractiveRagResponse,
                        userMessage: options.text,
                        responseLanguage,
                        chunks: repairChunks,
                        settings: aiSettings
                    })
                    if (polishedExtractiveRagResponse.usage) {
                        await recordInboundAiUsage({
                            organizationId: orgId,
                            category: 'rag',
                            model: polishedExtractiveRagResponse.model,
                            inputTokens: polishedExtractiveRagResponse.usage.inputTokens,
                            outputTokens: polishedExtractiveRagResponse.usage.outputTokens,
                            totalTokens: polishedExtractiveRagResponse.usage.totalTokens,
                            metadata: {
                                conversation_id: conversation.id,
                                source: 'rag_extractive_polish',
                                response_kind: 'rag_extractive_polish',
                                platform: options.platform,
                                document_count: repairChunks.length
                            },
                            supabase: options.supabase
                        }, options.logPrefix)
                    }

                    const extractiveRagWithSources = appendCanonicalRagSourceLinks(polishedExtractiveRagResponse.answer, repairChunks, {
                        force: true,
                        limit: resolveRagSourceLinkLimit(options.platform)
                    })
                    const formattedExtractiveRagReply = formatOutboundBotMessage(extractiveRagWithSources)
                    const outboundMetadata = await sendOutboundAndCollectMetadata(formattedExtractiveRagReply)
                    await persistBotMessage(formattedExtractiveRagReply, {
                        ...outboundMetadata,
                        is_rag: true,
                        rag_extractive: true,
                        rag_polish: {
                            usedPolish: polishedExtractiveRagResponse.usedPolish,
                            addedEngagement: polishedExtractiveRagResponse.addedEngagement,
                            model: polishedExtractiveRagResponse.model
                        },
                        sources: repairChunks.map((chunk) => chunk.document_id).filter(Boolean)
                    })
                    await recordAiLatencyEvent({
                        organizationId: orgId,
                        conversationId: conversation.id,
                        metricKey: 'llm_response',
                        durationMs: Date.now() - llmResponseStartedAt,
                        source: options.source,
                        metadata: {
                            response_kind: 'rag_extractive',
                            platform: options.platform,
                            document_count: kbResults.length
                        }
                    }, {
                        supabase: options.supabase
                    })
                    await applyEscalationAfterReply({ skillRequiresHumanHandover: false })
                    return
                }

                const noAnswerToken = 'NO_ANSWER'
                if (!await ensureUsageAllowed('before_rag_completion')) return
                const { default: OpenAI } = await import('openai')
                const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
                const ragCompletionModel = resolveRagCompletionModel()

                const basePrompt = withBotNamePrompt(aiSettings.prompt || DEFAULT_FLEXIBLE_PROMPT, aiSettings.bot_name)
                const continuityGuidance = buildConversationContinuityGuidance({
                    recentAssistantMessages: assistantHistoryForFollowup,
                    leadSnapshot: leadSnapshotForReply
                })
                const systemPrompt = `${basePrompt}

Answer the user's question based strictly on the provided context below.
Treat document titles, section labels, and source URLs in the context as valid evidence.
If a relevant context chunk partially answers the question, answer the known part and say only the missing detail is not in the knowledge base.
For find, view, where, or link requests, a matching source URL is enough to answer.
For regulation or policy questions asking purpose, scope, coverage, or what a rule regulates, answer the factual Madde/Amaç/Kapsam content first. Do not answer with only a source link when the context contains the factual text.
Do not use Markdown links like [label](url). When sharing a link, put the full raw URL on its own final line.
Copy source URLs exactly and never insert spaces inside a URL. Do not add punctuation or words after the URL.
When several chunks are similar, prefer the one that matches the user wording most closely, such as student vs staff or a specific department name.
For exact fields such as person names, fees, dates, document numbers, quotas, phone numbers, or email addresses, copy only the value explicitly shown in the context. If multiple conflicting values appear, prefer the chunk whose title/source best matches the question and mention the source link when useful.
For campus, address, or where questions, copy the exact address/postal code if present; do not answer only with the city or province.
If the user asks who/kim and the context only explains a role without naming a person, say the person name is not in the knowledge base.
For can/cannot, eligibility, permission, exam, application, deadline, or policy-right questions, answer from the specific rule sentence. Do not start with a blanket denial when the context includes a conditional right, exception, or eligibility path; state the condition and right together.
Before finalizing, check your answer for internal contradictions against the context. If one sentence says "cannot / no right / not possible" but another context sentence says the user can under stated conditions, remove the unsupported denial and answer with the grounded condition.
You may add at most one short, topic-related engagement question after the factual answer if it helps the user learn a relevant adjacent detail from the same context. Keep it role-neutral: do not assume the user is a student, applicant, personnel member, or admin unless the user said so. Do not ask what the user studies or which role/status they have; if clarification is useful, ask for the topic, program, unit, or document to look up without implying the user's identity. Instead, you can offer to explain related requirements, deadlines, exceptions, required documents, eligibility, or next steps for the same topic/source. Do not add generic closers like "anything else", "başka bir sorunuz var mı", "daha fazla bilgiye ihtiyacın var mı", or "daha fazla bilgi istersen yardımcı olurum".
If you add an engagement question, ask the concrete adjacent detail directly. Do not start it with generic prefaces such as "Daha fazla bilgiye ihtiyaç duyarsan", "Daha fazla bilgi istersen", or "Detaylı bilgi almak istersen".
When answering with three or more items, use one plain dash bullet per line.
If the answer is not in the context, respond with "${noAnswerToken}" and do not make up facts.
Reply language policy (MVP): use ${responseLanguageName} only. If the user message is not Turkish, use English.
Keep the answer concise and friendly.
Continue naturally from recent conversation turns without restarting.

Context:
${context}${requiredIntakeGuidance ? `\n\n${requiredIntakeGuidance}` : ''}${continuityGuidance ? `\n\n${continuityGuidance}` : ''}`
                const historyMessages = toOpenAiConversationMessages(history, options.text, 10)

                const completion = await withAiTimeout(openai.chat.completions.create({
                    model: ragCompletionModel,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...historyMessages,
                        { role: 'user', content: options.text }
                    ],
                    ...buildRagCompletionParameters(ragCompletionModel)
                }), { stage: 'rag_completion' })

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
                const repairedRagResponse = repairLinkOnlyRagAnswer({
                    response: guardedRagResponse,
                    userMessage: options.text,
                    responseLanguage,
                    chunks: repairChunks
                })
                const sourceLinkRequested = isLikelySourceLinkRequest(options.text)
                const hasRepairedRagResponse = Boolean(repairedRagResponse?.trim())
                const finalRagResponse = appendCanonicalRagSourceLinks(repairedRagResponse, repairChunks, {
                    force: sourceLinkRequested || (hasRepairedRagResponse && !isRagNoAnswerResponse(repairedRagResponse)),
                    limit: resolveRagSourceLinkLimit(options.platform)
                })
                const historyTokenCount = historyMessages.reduce((total, item) => total + estimateTokenCount(item.content), 0)
                const ragUsage = completion.usage
                    ? {
                        inputTokens: completion.usage.prompt_tokens ?? 0,
                        outputTokens: completion.usage.completion_tokens ?? 0,
                        totalTokens: completion.usage.total_tokens ?? (completion.usage.prompt_tokens ?? 0) + (completion.usage.completion_tokens ?? 0)
                    }
                    : {
                        inputTokens: estimateTokenCount(systemPrompt) + historyTokenCount + estimateTokenCount(options.text),
                        outputTokens: estimateTokenCount(finalRagResponse ?? ''),
                        totalTokens: estimateTokenCount(systemPrompt) + historyTokenCount + estimateTokenCount(options.text) + estimateTokenCount(finalRagResponse ?? '')
                    }

                await recordInboundAiUsage({
                    organizationId: orgId,
                    category: 'rag',
                    model: ragCompletionModel,
                    inputTokens: ragUsage.inputTokens,
                    outputTokens: ragUsage.outputTokens,
                    totalTokens: ragUsage.totalTokens,
                    metadata: {
                        conversation_id: conversation.id,
                        document_count: kbResults.length
                    },
                    supabase: options.supabase
                }, options.logPrefix)

                if (
                    finalRagResponse
                    && !isRagNoAnswerResponse(ragResponse)
                    && !isRagNoAnswerResponse(finalRagResponse)
                ) {
                    const formattedRagReply = formatOutboundBotMessage(finalRagResponse)
                    const outboundMetadata = await sendOutboundAndCollectMetadata(formattedRagReply)
                    await persistBotMessage(formattedRagReply, {
                        ...outboundMetadata,
                        is_rag: true,
                        sources: repairChunks.map((chunk) => chunk.document_id).filter(Boolean)
                    })
                    await recordAiLatencyEvent({
                        organizationId: orgId,
                        conversationId: conversation.id,
                        metricKey: 'llm_response',
                        durationMs: Date.now() - llmResponseStartedAt,
                        source: options.source,
                        metadata: {
                            response_kind: 'rag',
                            platform: options.platform,
                            document_count: kbResults.length
                        }
                    }, {
                        supabase: options.supabase
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

        if (fallbackKnowledgeChunks?.length) {
            const noInformationSeed = buildNoInformationSeed(responseLanguage)
            const extractiveRagFallback = repairLinkOnlyRagAnswer({
                response: noInformationSeed,
                userMessage: options.text,
                responseLanguage,
                chunks: fallbackKnowledgeChunks
            })
            if (extractiveRagFallback && extractiveRagFallback !== noInformationSeed && !isRagNoAnswerResponse(extractiveRagFallback)) {
                const extractiveRagWithSources = appendCanonicalRagSourceLinks(extractiveRagFallback, fallbackKnowledgeChunks, {
                    force: true,
                    limit: resolveRagSourceLinkLimit(options.platform)
                })
                const formattedExtractiveRagReply = formatOutboundBotMessage(extractiveRagWithSources)
                const outboundMetadata = await sendOutboundAndCollectMetadata(formattedExtractiveRagReply)
                await persistBotMessage(formattedExtractiveRagReply, {
                    ...outboundMetadata,
                    is_rag: true,
                    sources: fallbackKnowledgeChunks.map((chunk) => chunk.document_id).filter(Boolean)
                })
                await recordAiLatencyEvent({
                    organizationId: orgId,
                    conversationId: conversation.id,
                    metricKey: 'llm_response',
                    durationMs: Date.now() - llmResponseStartedAt,
                    source: options.source,
                    metadata: {
                        response_kind: 'rag_extractive_timeout_recovery',
                        platform: options.platform,
                        document_count: fallbackKnowledgeChunks.length
                    }
                }, {
                    supabase: options.supabase
                })
                await applyEscalationAfterReply({ skillRequiresHumanHandover: false })
                return
            }
        }
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
        skipManualRenewal: true,
        usageMetadata: {
            conversation_id: conversation.id,
            source: options.source
        },
        requiredIntakeAnalysis,
        knowledgeContext: fallbackKnowledgeContext
    })

    const fallbackWithSourceLinks = fallbackKnowledgeChunks?.length
        ? appendCanonicalRagSourceLinks(fallbackText, fallbackKnowledgeChunks, {
            force: !isRagNoAnswerResponse(fallbackText),
            limit: resolveRagSourceLinkLimit(options.platform)
        })
        : fallbackText
    const formattedFallbackReply = formatOutboundBotMessage(fallbackWithSourceLinks)
    const outboundMetadata = await sendOutboundAndCollectMetadata(formattedFallbackReply)
    await persistBotMessage(formattedFallbackReply, {
        ...outboundMetadata,
        is_fallback: true
    })
    await recordAiLatencyEvent({
        organizationId: orgId,
        conversationId: conversation.id,
        metricKey: 'llm_response',
        durationMs: Date.now() - llmResponseStartedAt,
        source: options.source,
        metadata: {
            response_kind: 'fallback',
            platform: options.platform
        }
    }, {
        supabase: options.supabase
    })
    await applyEscalationAfterReply({ skillRequiresHumanHandover: false })
}
