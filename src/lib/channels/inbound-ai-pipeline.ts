import { v4 as uuidv4 } from 'uuid'
import type { SupabaseClient } from '@supabase/supabase-js'
import { after } from 'next/server'
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
import { matchSkillsWithStatus } from '@/lib/skills/match-safe'
import { resolveOrganizationUsageEntitlement } from '@/lib/billing/entitlements'
import type { OutboundMessageInput, OutboundReplyButton, OutboundSendResult } from '@/lib/channels/outbound-message'
import {
    isMvpResponseLanguageAmbiguous,
    resolveMvpResponseLanguage,
    resolveMvpResponseLanguageName
} from '@/lib/ai/language'
import { applyBotMessageDisclaimer } from '@/lib/ai/bot-disclaimer'
import { buildReplyButtonsForSkill, sanitizeSkillActions } from '@/lib/skills/skill-actions'
import { recordAiLatencyEvent } from '@/lib/ai/latency'
import { maybeHandleSchedulingRequest } from '@/lib/ai/booking'
import { withAiTimeout } from '@/lib/ai/deadline'

const RAG_MAX_OUTPUT_TOKENS = 320

function payloadContainsNoAnswer(value: unknown): boolean {
    if (typeof value === 'string') {
        return /^no_answer[.!?]*$/i.test(value.trim())
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
const INSTAGRAM_REQUEST_TAG = 'instagram_request'

export interface InboundAiPipelineInput {
    supabase: SupabaseClient
    organizationId: string
    platform: 'whatsapp' | 'telegram' | 'instagram'
    source: 'whatsapp' | 'telegram' | 'instagram'
    contactId: string
    contactName: string | null
    contactAvatarUrl?: string | null
    text: string
    inboundMessageId: string
    inboundMessageIdMetadataKey: string
    inboundMessageMetadata: Record<string, unknown>
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

    if (!isInstagramDeleted) {
        const dedupeFilter = `metadata->>${options.inboundMessageIdMetadataKey}`
        const { data: existingInboundData } = await options.supabase
            .from('messages')
            .select('id')
            .eq('organization_id', orgId)
            .eq(dedupeFilter, options.inboundMessageId)
            .maybeSingle()
        const existingInbound = existingInboundData as { id?: string } | null

        if (existingInbound?.id) return
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
        failClosedBotMode: true
    })
    const formatOutboundBotMessage = (content: string) => applyBotMessageDisclaimer({
        message: content,
        platform: options.platform,
        responseLanguage,
        settings: aiSettings
    })
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
                source: options.source
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

                const completion = await withAiTimeout(openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...historyMessages,
                        { role: 'user', content: options.text }
                    ],
                    temperature: 0.3,
                    max_tokens: RAG_MAX_OUTPUT_TOKENS
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

                if (
                    guardedRagResponse
                    && !isRagNoAnswerResponse(ragResponse)
                    && !isRagNoAnswerResponse(guardedRagResponse)
                ) {
                    const formattedRagReply = formatOutboundBotMessage(guardedRagResponse)
                    const outboundMetadata = await sendOutboundAndCollectMetadata(formattedRagReply)
                    await persistBotMessage(formattedRagReply, {
                        ...outboundMetadata,
                        is_rag: true,
                        sources: chunks.map((chunk) => chunk.document_id).filter(Boolean)
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
