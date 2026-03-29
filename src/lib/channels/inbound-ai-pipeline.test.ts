import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    analyzeRequiredIntakeStateMock,
    afterCallbacks,
    afterMock,
    buildRagContextMock,
    buildFallbackResponseMock,
    decideHumanEscalationMock,
    decideKnowledgeBaseRouteMock,
    getOrgAiSettingsMock,
    getRequiredIntakeFieldsMock,
    isOperatorActiveMock,
    maybeHandleSchedulingRequestMock,
    matchSkillsSafelyMock,
    openAiCreateMock,
    recordAiUsageMock,
    resolveOrganizationUsageEntitlementMock,
    resolveBotModeActionMock,
    resolveLeadExtractionAllowanceMock,
    runLeadExtractionMock,
    searchKnowledgeBaseMock
} = vi.hoisted(() => ({
    analyzeRequiredIntakeStateMock: vi.fn(),
    afterCallbacks: [] as Array<() => void | Promise<void>>,
    afterMock: vi.fn((callback: () => void | Promise<void>) => {
        afterCallbacks.push(callback)
    }),
    buildRagContextMock: vi.fn(),
    buildFallbackResponseMock: vi.fn(),
    decideHumanEscalationMock: vi.fn(),
    decideKnowledgeBaseRouteMock: vi.fn(),
    getOrgAiSettingsMock: vi.fn(),
    getRequiredIntakeFieldsMock: vi.fn(),
    isOperatorActiveMock: vi.fn(),
    maybeHandleSchedulingRequestMock: vi.fn(),
    matchSkillsSafelyMock: vi.fn(),
    openAiCreateMock: vi.fn(),
    recordAiUsageMock: vi.fn(),
    resolveOrganizationUsageEntitlementMock: vi.fn(),
    resolveBotModeActionMock: vi.fn(),
    resolveLeadExtractionAllowanceMock: vi.fn(),
    runLeadExtractionMock: vi.fn(),
    searchKnowledgeBaseMock: vi.fn()
}))

vi.mock('next/server', () => ({
    after: afterMock
}))

vi.mock('@/lib/ai/settings', () => ({
    getOrgAiSettings: getOrgAiSettingsMock
}))

vi.mock('openai', () => ({
    default: class OpenAIMock {
        chat = {
            completions: {
                create: openAiCreateMock
            }
        }
    }
}))

vi.mock('@/lib/ai/followup', () => ({
    getRequiredIntakeFields: getRequiredIntakeFieldsMock,
    buildRequiredIntakeFollowupGuidance: vi.fn(() => ''),
    analyzeRequiredIntakeState: analyzeRequiredIntakeStateMock
}))

vi.mock('@/lib/knowledge-base/router', () => ({
    decideKnowledgeBaseRoute: decideKnowledgeBaseRouteMock
}))

vi.mock('@/lib/knowledge-base/rag', () => ({
    buildRagContext: buildRagContextMock
}))

vi.mock('@/lib/knowledge-base/actions', () => ({
    searchKnowledgeBase: searchKnowledgeBaseMock
}))

vi.mock('@/lib/ai/usage', () => ({
    recordAiUsage: recordAiUsageMock
}))

vi.mock('@/lib/ai/bot-mode', () => ({
    resolveBotModeAction: resolveBotModeActionMock,
    resolveLeadExtractionAllowance: resolveLeadExtractionAllowanceMock
}))

vi.mock('@/lib/billing/entitlements', () => ({
    resolveOrganizationUsageEntitlement: resolveOrganizationUsageEntitlementMock
}))

vi.mock('@/lib/leads/extraction', () => ({
    runLeadExtraction: runLeadExtractionMock
}))

vi.mock('@/lib/inbox/operator-state', () => ({
    isOperatorActive: isOperatorActiveMock
}))

vi.mock('@/lib/skills/match-safe', () => ({
    matchSkillsSafely: matchSkillsSafelyMock
}))

vi.mock('@/lib/ai/escalation', () => ({
    decideHumanEscalation: decideHumanEscalationMock
}))

vi.mock('@/lib/ai/fallback', () => ({
    buildFallbackResponse: buildFallbackResponseMock
}))

vi.mock('@/lib/ai/booking', () => ({
    maybeHandleSchedulingRequest: maybeHandleSchedulingRequestMock
}))

import { processInboundAiPipeline } from '@/lib/channels/inbound-ai-pipeline'

async function flushAfterCallbacks() {
    while (afterCallbacks.length > 0) {
        const callback = afterCallbacks.shift()
        if (!callback) continue
        await callback()
    }
}

type SupabaseBuilder = Record<string, unknown>

function createSupabaseMock(plan: Record<string, SupabaseBuilder[]>) {
    return {
        from: vi.fn((table: string) => {
            const queue = plan[table]
            if (!queue || queue.length === 0) {
                throw new Error(`Unexpected query for table: ${table}`)
            }

            const next = queue.shift()
            if (!next) {
                throw new Error(`Missing query builder for table: ${table}`)
            }

            return next
        })
    }
}

function createDedupeBuilder(existingMessageId: string | null) {
    const builder: Record<string, unknown> = {}

    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.maybeSingle = vi.fn(async () => ({
        data: existingMessageId ? { id: existingMessageId } : null
    }))

    return {
        builder,
        maybeSingleMock: builder.maybeSingle as ReturnType<typeof vi.fn>
    }
}

function createConversationLookupBuilder(conversation: Record<string, unknown> | null) {
    const builder: Record<string, unknown> = {}

    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.limit = vi.fn(() => builder)
    builder.maybeSingle = vi.fn(async () => ({ data: conversation }))

    return {
        builder,
        maybeSingleMock: builder.maybeSingle as ReturnType<typeof vi.fn>
    }
}

function createInsertBuilder() {
    const insertMock = vi.fn(async () => ({ error: null }))

    return {
        builder: {
            insert: insertMock
        },
        insertMock
    }
}

function createUpdateBuilder() {
    const eqMock = vi.fn(async () => ({ error: null }))
    const updateMock = vi.fn(() => ({ eq: eqMock }))

    return {
        builder: {
            update: updateMock
        },
        updateMock,
        eqMock
    }
}

function createDeleteBuilder() {
    const eqMock = vi.fn(async () => ({ error: null }))
    const deleteMock = vi.fn(() => ({ eq: eqMock }))

    return {
        builder: {
            delete: deleteMock
        },
        deleteMock,
        eqMock
    }
}

function createSkillDetailsBuilder(skill: Record<string, unknown> | null) {
    const maybeSingleMock = vi.fn(async () => ({ data: skill, error: null }))
    const builder: Record<string, unknown> = {}
    const eqMock = vi.fn(() => builder)
    const selectMock = vi.fn(() => builder)

    builder.select = selectMock
    builder.eq = eqMock
    builder.maybeSingle = maybeSingleMock

    return {
        builder,
        selectMock,
        eqMock,
        maybeSingleMock
    }
}

function createMessageHistoryBuilder(messages: Array<Record<string, unknown>>) {
    const limitMock = vi.fn(async () => ({ data: messages, error: null }))
    const orderMock = vi.fn(() => ({ limit: limitMock }))
    const eqMock = vi.fn(() => ({ order: orderMock }))
    const selectMock = vi.fn(() => ({ eq: eqMock }))

    return {
        builder: {
            select: selectMock
        },
        selectMock,
        eqMock,
        orderMock,
        limitMock
    }
}

function createConversationMessagesBuilder(messages: Array<Record<string, unknown>>) {
    const orderMock = vi.fn(async () => ({ data: messages, error: null }))
    const eqMock = vi.fn(() => ({ order: orderMock }))
    const selectMock = vi.fn(() => ({ eq: eqMock }))

    return {
        builder: {
            select: selectMock
        },
        selectMock,
        eqMock,
        orderMock
    }
}

function createLeadSnapshotBuilder(lead: Record<string, unknown> | null) {
    const maybeSingleMock = vi.fn(async () => ({ data: lead, error: null }))
    const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
    const selectMock = vi.fn(() => ({ eq: eqMock }))

    return {
        builder: {
            select: selectMock
        },
        selectMock,
        eqMock,
        maybeSingleMock
    }
}

function createConversation(overrides: Record<string, unknown> = {}) {
    return {
        id: 'conv-1',
        organization_id: 'org-1',
        contact_name: 'Test Contact',
        contact_avatar_url: null,
        contact_phone: '905551112233',
        platform: 'whatsapp',
        status: 'open',
        assignee_id: null,
        active_agent: 'bot',
        ai_processing_paused: false,
        last_message_at: '2026-02-10T12:00:00.000Z',
        unread_count: 0,
        tags: [],
        created_at: '2026-02-10T11:00:00.000Z',
        updated_at: '2026-02-10T12:00:00.000Z',
        ...overrides
    }
}

function buildInput(
    supabase: unknown,
    sendOutbound: ReturnType<typeof vi.fn>,
    overrides: Partial<ReturnType<typeof buildInputBase>> = {}
) {
    return {
        ...buildInputBase(supabase, sendOutbound),
        ...overrides
    }
}

function buildInputBase(supabase: unknown, sendOutbound: ReturnType<typeof vi.fn>) {
    return {
        supabase: supabase as never,
        organizationId: 'org-1',
        platform: 'whatsapp' as const,
        source: 'whatsapp' as const,
        contactId: '905551112233',
        contactName: 'Ayse',
        contactAvatarUrl: null,
        text: 'Merhaba',
        inboundMessageId: 'wamid-1',
        inboundMessageIdMetadataKey: 'whatsapp_message_id',
        inboundMessageMetadata: {
            whatsapp_message_id: 'wamid-1',
            phone_number_id: 'phone-1'
        },
        sendOutbound,
        logPrefix: 'WhatsApp Webhook'
    }
}

describe('processInboundAiPipeline guardrails', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        afterCallbacks.length = 0
        afterMock.mockImplementation((callback: () => void | Promise<void>) => {
            afterCallbacks.push(callback)
        })

        getOrgAiSettingsMock.mockResolvedValue({
            match_threshold: 0.7,
            bot_mode: 'active',
            allow_lead_extraction_during_operator: false,
            hot_lead_score_threshold: 8,
            hot_lead_action: 'notify_only',
            hot_lead_handover_message_tr: 'Talebin destek ekibine iletildi.',
            hot_lead_handover_message_en: 'Your request was forwarded to support.',
            bot_disclaimer_enabled: true,
            bot_disclaimer_message_tr: 'Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.',
            bot_disclaimer_message_en: 'This message was generated by an AI bot and may contain mistakes.',
            prompt: null,
            bot_name: null
        })
        getRequiredIntakeFieldsMock.mockResolvedValue([])
        analyzeRequiredIntakeStateMock.mockReturnValue({
            requestMode: 'lead_qualification',
            requiredFields: [],
            effectiveRequiredFields: [],
            collectedFields: [],
            blockedReaskFields: [],
            missingFields: [],
            dynamicMinimumCount: 0,
            isShortConversation: false,
            latestRefusal: false,
            noProgressStreak: false,
            suppressIntakeQuestions: false
        })
        resolveBotModeActionMock.mockReturnValue({ allowReplies: true })
        resolveOrganizationUsageEntitlementMock.mockResolvedValue({
            isUsageAllowed: true,
            lockReason: null,
            membershipState: null,
            snapshot: null
        })
        resolveLeadExtractionAllowanceMock.mockReturnValue(false)
        isOperatorActiveMock.mockReturnValue(false)
        maybeHandleSchedulingRequestMock.mockResolvedValue(false)
        matchSkillsSafelyMock.mockResolvedValue([])
        decideKnowledgeBaseRouteMock.mockResolvedValue({
            route_to_kb: false,
            rewritten_query: '',
            reason: 'not_needed'
        })
        searchKnowledgeBaseMock.mockResolvedValue([])
        buildRagContextMock.mockReturnValue({
            context: '',
            chunks: [],
            tokenCount: 0
        })
        openAiCreateMock.mockResolvedValue({
            choices: [{ message: { content: 'RAG response' } }],
            usage: {
                prompt_tokens: 120,
                completion_tokens: 30,
                total_tokens: 150
            }
        })
        recordAiUsageMock.mockResolvedValue(undefined)
        decideHumanEscalationMock.mockReturnValue({ shouldEscalate: false })
        buildFallbackResponseMock.mockResolvedValue('Fallback response')
    })

    it('skips processing when inbound message id already exists', async () => {
        const sendOutbound = vi.fn()
        const dedupe = createDedupeBuilder('existing-msg-1')
        const supabase = createSupabaseMock({
            messages: [dedupe.builder]
        })

        await processInboundAiPipeline(buildInput(supabase, sendOutbound))

        expect(sendOutbound).not.toHaveBeenCalled()
        expect(matchSkillsSafelyMock).not.toHaveBeenCalled()
        expect(supabase.from).toHaveBeenCalledTimes(1)
        expect(dedupe.maybeSingleMock).toHaveBeenCalledTimes(1)
    })

    it('does not auto-reply when operator is active', async () => {
        const sendOutbound = vi.fn()
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation({ active_agent: 'operator' }))
        const inboundInsert = createInsertBuilder()
        const conversationUpdate = createUpdateBuilder()

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder],
            conversations: [lookup.builder, conversationUpdate.builder]
        })

        isOperatorActiveMock.mockReturnValueOnce(true)

        await processInboundAiPipeline(buildInput(supabase, sendOutbound))

        expect(inboundInsert.insertMock).toHaveBeenCalledTimes(1)
        expect(conversationUpdate.updateMock).toHaveBeenCalledTimes(1)
        expect(sendOutbound).not.toHaveBeenCalled()
        expect(matchSkillsSafelyMock).not.toHaveBeenCalled()
        expect(runLeadExtractionMock).not.toHaveBeenCalled()
    })

    it('keeps lead extraction active but suppresses replies in shadow mode', async () => {
        const sendOutbound = vi.fn()
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation({ active_agent: 'bot' }))
        const inboundInsert = createInsertBuilder()
        const conversationUpdate = createUpdateBuilder()
        const leadScore = createLeadSnapshotBuilder({ total_score: 6 })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder],
            conversations: [lookup.builder, conversationUpdate.builder],
            leads: [leadScore.builder]
        })

        getOrgAiSettingsMock.mockResolvedValueOnce({
            match_threshold: 0.7,
            bot_mode: 'shadow',
            allow_lead_extraction_during_operator: false,
            hot_lead_score_threshold: 8,
            hot_lead_action: 'notify_only',
            hot_lead_handover_message_tr: 'Talebin destek ekibine iletildi.',
            hot_lead_handover_message_en: 'Your request was forwarded to support.',
            bot_disclaimer_enabled: true,
            bot_disclaimer_message_tr: 'Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.',
            bot_disclaimer_message_en: 'This message was generated by an AI bot and may contain mistakes.',
            prompt: null,
            bot_name: null
        })
        resolveBotModeActionMock.mockReturnValueOnce({ allowReplies: false })
        resolveLeadExtractionAllowanceMock.mockReturnValueOnce(true)
        isOperatorActiveMock.mockReturnValueOnce(false)

        await processInboundAiPipeline(buildInput(supabase, sendOutbound))
        await flushAfterCallbacks()

        expect(resolveLeadExtractionAllowanceMock).toHaveBeenCalledWith({
            botMode: 'shadow',
            operatorActive: false,
            allowDuringOperator: false
        })
        expect(runLeadExtractionMock).toHaveBeenCalledWith(expect.objectContaining({
            organizationId: 'org-1',
            conversationId: 'conv-1',
            latestMessage: 'Merhaba',
            source: 'whatsapp'
        }))
        expect(sendOutbound).not.toHaveBeenCalled()
        expect(matchSkillsSafelyMock).not.toHaveBeenCalled()
        expect(buildFallbackResponseMock).not.toHaveBeenCalled()
    })

    it('defers lead extraction until after the reply path completes', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const botInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const leadSnapshot = createLeadSnapshotBuilder({ total_score: 4 })
        const skillDetails = createSkillDetailsBuilder({ requires_human_handover: false })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, botInsert.builder],
            conversations: [lookup.builder, conversationUpdateAfterInbound.builder, conversationUpdateAfterBotReply.builder],
            leads: [leadSnapshot.builder],
            skills: [skillDetails.builder]
        })

        resolveLeadExtractionAllowanceMock.mockReturnValueOnce(true)
        matchSkillsSafelyMock.mockResolvedValueOnce([
            {
                skill_id: 'skill-1',
                title: 'Bilgi',
                response_text: 'Skill response'
            }
        ])

        await processInboundAiPipeline(buildInput(supabase, sendOutbound))

        expect(sendOutbound).toHaveBeenCalledWith('Skill response\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')
        expect(runLeadExtractionMock).not.toHaveBeenCalled()

        await flushAfterCallbacks()

        expect(runLeadExtractionMock).toHaveBeenCalledWith(expect.objectContaining({
            organizationId: 'org-1',
            conversationId: 'conv-1',
            latestMessage: 'Merhaba',
            source: 'whatsapp'
        }))
    })

    it('isolates deferred lead extraction failures from the reply path', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const botInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const skillDetails = createSkillDetailsBuilder({ requires_human_handover: false })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, botInsert.builder],
            conversations: [lookup.builder, conversationUpdateAfterInbound.builder, conversationUpdateAfterBotReply.builder],
            skills: [skillDetails.builder]
        })

        resolveLeadExtractionAllowanceMock.mockReturnValueOnce(true)
        runLeadExtractionMock.mockRejectedValueOnce(new Error('lead extraction failed'))
        matchSkillsSafelyMock.mockResolvedValueOnce([
            {
                skill_id: 'skill-1',
                title: 'Bilgi',
                response_text: 'Skill response'
            }
        ])

        await expect(processInboundAiPipeline(buildInput(supabase, sendOutbound))).resolves.toBeUndefined()
        expect(sendOutbound).toHaveBeenCalledWith('Skill response\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')

        await flushAfterCallbacks()

        expect(consoleErrorSpy).toHaveBeenCalled()
        consoleErrorSpy.mockRestore()
    })

    it('applies hot-lead escalation from deferred extraction after the reply completes', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const botInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const escalationConversationUpdate = createUpdateBuilder()
        const leadSnapshot = createLeadSnapshotBuilder({ total_score: 9 })
        const skillDetails = createSkillDetailsBuilder({ requires_human_handover: false })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, botInsert.builder],
            conversations: [
                lookup.builder,
                conversationUpdateAfterInbound.builder,
                conversationUpdateAfterBotReply.builder,
                escalationConversationUpdate.builder
            ],
            leads: [leadSnapshot.builder],
            skills: [skillDetails.builder]
        })

        resolveLeadExtractionAllowanceMock.mockReturnValueOnce(true)
        matchSkillsSafelyMock.mockResolvedValueOnce([
            {
                skill_id: 'skill-1',
                title: 'Bilgi',
                response_text: 'Skill response'
            }
        ])
        decideHumanEscalationMock.mockImplementation(({ leadScore }) => {
            if (leadScore === 9) {
                return {
                    shouldEscalate: true,
                    reason: 'hot_lead',
                    action: 'notify_only',
                    noticeMode: 'none',
                    noticeMessage: null
                }
            }

            return {
                shouldEscalate: false
            }
        })

        await processInboundAiPipeline(buildInput(supabase, sendOutbound))

        expect(escalationConversationUpdate.updateMock).not.toHaveBeenCalled()

        await flushAfterCallbacks()

        expect(escalationConversationUpdate.updateMock).toHaveBeenCalledWith(expect.objectContaining({
            human_attention_required: true,
            human_attention_reason: 'hot_lead',
            human_attention_resolved_at: null,
            human_attention_requested_at: expect.any(String)
        }))
    })

    it('skips lead extraction and replies when conversation AI processing is paused', async () => {
        const sendOutbound = vi.fn()
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation({ ai_processing_paused: true }))
        const inboundInsert = createInsertBuilder()
        const conversationUpdate = createUpdateBuilder()

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder],
            conversations: [lookup.builder, conversationUpdate.builder]
        })

        await processInboundAiPipeline(buildInput(supabase, sendOutbound))

        expect(inboundInsert.insertMock).toHaveBeenCalledTimes(1)
        expect(conversationUpdate.updateMock).toHaveBeenCalledTimes(1)
        expect(sendOutbound).not.toHaveBeenCalled()
        expect(runLeadExtractionMock).not.toHaveBeenCalled()
        expect(matchSkillsSafelyMock).not.toHaveBeenCalled()
        expect(resolveOrganizationUsageEntitlementMock).not.toHaveBeenCalled()
    })

    it('stores inbound message and exits before AI flow when skipAutomation is enabled', async () => {
        const sendOutbound = vi.fn()
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const conversationUpdate = createUpdateBuilder()

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder],
            conversations: [lookup.builder, conversationUpdate.builder]
        })

        await processInboundAiPipeline(buildInput(supabase, sendOutbound, {
            text: '[WhatsApp image]',
            skipAutomation: true
        }))

        expect(inboundInsert.insertMock).toHaveBeenCalledTimes(1)
        expect(conversationUpdate.updateMock).toHaveBeenCalledTimes(1)
        expect(sendOutbound).not.toHaveBeenCalled()
        expect(runLeadExtractionMock).not.toHaveBeenCalled()
        expect(matchSkillsSafelyMock).not.toHaveBeenCalled()
        expect(resolveOrganizationUsageEntitlementMock).not.toHaveBeenCalled()
    })

    it('does not bump unread count or last message timestamp for instagram seen events', async () => {
        const sendOutbound = vi.fn()
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation({
            platform: 'instagram',
            unread_count: 2,
            last_message_at: '2026-02-10T12:00:00.000Z'
        }))
        const inboundInsert = createInsertBuilder()
        const conversationUpdate = createUpdateBuilder()

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder],
            conversations: [lookup.builder, conversationUpdate.builder]
        })

        await processInboundAiPipeline(buildInput(supabase, sendOutbound, {
            platform: 'instagram',
            source: 'instagram',
            contactId: 'ig-user-1',
            contactName: null,
            inboundMessageId: 'igmid-seen-1',
            inboundMessageIdMetadataKey: 'instagram_message_id',
            inboundMessageMetadata: {
                instagram_message_id: 'igmid-seen-1',
                instagram_event_type: 'seen'
            },
            skipAutomation: true,
            logPrefix: 'Instagram Webhook'
        }))

        expect(inboundInsert.insertMock).toHaveBeenCalledTimes(1)
        expect(conversationUpdate.updateMock).toHaveBeenCalledTimes(1)

        const updatePayload = conversationUpdate.updateMock.mock.calls[0]?.[0] as
            | Record<string, unknown>
            | undefined
        expect(updatePayload).toBeDefined()
        expect(updatePayload).not.toHaveProperty('unread_count')
        expect(updatePayload).not.toHaveProperty('last_message_at')
    })

    it('ignores instagram deleted events when the conversation does not exist yet', async () => {
        const sendOutbound = vi.fn()
        const lookup = createConversationLookupBuilder(null)

        const supabase = createSupabaseMock({
            conversations: [lookup.builder]
        })

        await processInboundAiPipeline(buildInput(supabase, sendOutbound, {
            platform: 'instagram',
            source: 'instagram',
            contactId: 'ig-user-1',
            contactName: null,
            text: '[Instagram message deleted]',
            inboundMessageId: 'igmid-deleted-only-1',
            inboundMessageIdMetadataKey: 'instagram_message_id',
            inboundMessageMetadata: {
                instagram_message_id: 'igmid-deleted-only-1',
                instagram_event_type: 'message_deleted'
            },
            skipAutomation: true,
            logPrefix: 'Instagram Webhook'
        }))

        expect(lookup.maybeSingleMock).toHaveBeenCalledTimes(1)
        expect(sendOutbound).not.toHaveBeenCalled()
        expect(runLeadExtractionMock).not.toHaveBeenCalled()
        expect(matchSkillsSafelyMock).not.toHaveBeenCalled()
    })

    it('removes instagram conversations when the only stored message is later deleted', async () => {
        const sendOutbound = vi.fn()
        const lookup = createConversationLookupBuilder(createConversation({
            platform: 'instagram',
            contact_phone: 'ig-user-1'
        }))
        const conversationMessages = createConversationMessagesBuilder([{
            id: 'msg-1',
            sender_type: 'contact',
            content: 'Merhaba',
            metadata: {
                instagram_message_id: 'igmid-deleted-only-2',
                instagram_event_type: 'message'
            }
        }])
        const messagesDelete = createDeleteBuilder()
        const conversationsDelete = createDeleteBuilder()

        const supabase = createSupabaseMock({
            conversations: [lookup.builder, conversationsDelete.builder],
            messages: [conversationMessages.builder, messagesDelete.builder]
        })

        await processInboundAiPipeline(buildInput(supabase, sendOutbound, {
            platform: 'instagram',
            source: 'instagram',
            contactId: 'ig-user-1',
            contactName: null,
            text: '[Instagram message deleted]',
            inboundMessageId: 'igmid-deleted-only-2',
            inboundMessageIdMetadataKey: 'instagram_message_id',
            inboundMessageMetadata: {
                instagram_message_id: 'igmid-deleted-only-2',
                instagram_event_type: 'message_deleted'
            },
            skipAutomation: true,
            logPrefix: 'Instagram Webhook'
        }))

        expect(messagesDelete.deleteMock).toHaveBeenCalledTimes(1)
        expect(messagesDelete.eqMock).toHaveBeenCalledWith('conversation_id', 'conv-1')
        expect(conversationsDelete.deleteMock).toHaveBeenCalledTimes(1)
        expect(conversationsDelete.eqMock).toHaveBeenCalledWith('id', 'conv-1')
        expect(sendOutbound).not.toHaveBeenCalled()
        expect(runLeadExtractionMock).not.toHaveBeenCalled()
    })

    it('updates the matching instagram message to deleted state when the thread already has history', async () => {
        const sendOutbound = vi.fn()
        const lookup = createConversationLookupBuilder(createConversation({
            platform: 'instagram',
            contact_phone: 'ig-user-1',
            unread_count: 3,
            tags: ['vip']
        }))
        const conversationMessages = createConversationMessagesBuilder([
            {
                id: 'msg-older',
                sender_type: 'user',
                content: 'Merhaba, size yardim edebilirim.',
                metadata: {
                    instagram_message_id: 'igmid-older',
                    instagram_event_type: 'message'
                }
            },
            {
                id: 'msg-target',
                sender_type: 'contact',
                content: 'Fiyat nedir?',
                metadata: {
                    instagram_message_id: 'igmid-deleted-history-1',
                    instagram_event_type: 'message'
                }
            }
        ])
        const messageUpdate = createUpdateBuilder()
        const conversationUpdate = createUpdateBuilder()

        const supabase = createSupabaseMock({
            conversations: [lookup.builder, conversationUpdate.builder],
            messages: [conversationMessages.builder, messageUpdate.builder]
        })

        await processInboundAiPipeline(buildInput(supabase, sendOutbound, {
            platform: 'instagram',
            source: 'instagram',
            contactId: 'ig-user-1',
            contactName: 'keskinngamzee',
            text: '[Instagram message deleted]',
            inboundMessageId: 'igmid-deleted-history-1',
            inboundMessageIdMetadataKey: 'instagram_message_id',
            inboundMessageMetadata: {
                instagram_message_id: 'igmid-deleted-history-1',
                instagram_event_type: 'message_deleted'
            },
            skipAutomation: true,
            logPrefix: 'Instagram Webhook'
        }))

        expect(messageUpdate.updateMock).toHaveBeenCalledWith(expect.objectContaining({
            content: '[Instagram message deleted]',
            metadata: expect.objectContaining({
                instagram_message_id: 'igmid-deleted-history-1',
                instagram_event_type: 'message_deleted'
            })
        }))
        expect(messageUpdate.eqMock).toHaveBeenCalledWith('id', 'msg-target')
        expect(conversationUpdate.updateMock).toHaveBeenCalledWith(expect.objectContaining({
            contact_name: 'keskinngamzee',
            tags: ['vip']
        }))

        const updatePayload = conversationUpdate.updateMock.mock.calls[0]?.[0] as
            | Record<string, unknown>
            | undefined
        expect(updatePayload).toBeDefined()
        expect(updatePayload).not.toHaveProperty('unread_count')
        expect(updatePayload).not.toHaveProperty('last_message_at')
        expect(sendOutbound).not.toHaveBeenCalled()
        expect(runLeadExtractionMock).not.toHaveBeenCalled()
    })

    it('marks instagram standby inbound conversations with instagram_request tag', async () => {
        const sendOutbound = vi.fn()
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation({
            platform: 'instagram',
            tags: []
        }))
        const inboundInsert = createInsertBuilder()
        const conversationUpdate = createUpdateBuilder()

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder],
            conversations: [lookup.builder, conversationUpdate.builder]
        })

        await processInboundAiPipeline(buildInput(supabase, sendOutbound, {
            platform: 'instagram',
            source: 'instagram',
            contactId: 'ig-user-1',
            contactName: null,
            inboundMessageId: 'igmid-1',
            inboundMessageIdMetadataKey: 'instagram_message_id',
            inboundMessageMetadata: {
                instagram_message_id: 'igmid-1',
                instagram_event_source: 'standby'
            },
            skipAutomation: true,
            logPrefix: 'Instagram Webhook'
        }))

        expect(conversationUpdate.updateMock).toHaveBeenCalledWith(expect.objectContaining({
            tags: ['instagram_request']
        }))
    })

    it('preserves existing conversation tags while appending instagram_request tag', async () => {
        const sendOutbound = vi.fn()
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation({
            platform: 'instagram',
            tags: ['vip']
        }))
        const inboundInsert = createInsertBuilder()
        const conversationUpdate = createUpdateBuilder()

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder],
            conversations: [lookup.builder, conversationUpdate.builder]
        })

        await processInboundAiPipeline(buildInput(supabase, sendOutbound, {
            platform: 'instagram',
            source: 'instagram',
            contactId: 'ig-user-1',
            contactName: null,
            inboundMessageId: 'igmid-2',
            inboundMessageIdMetadataKey: 'instagram_message_id',
            inboundMessageMetadata: {
                instagram_message_id: 'igmid-2',
                instagram_event_source: 'standby'
            },
            skipAutomation: true,
            logPrefix: 'Instagram Webhook'
        }))

        expect(conversationUpdate.updateMock).toHaveBeenCalledWith(expect.objectContaining({
            tags: ['vip', 'instagram_request']
        }))
    })

    it('persists contact avatar url when inbound profile data provides one', async () => {
        const sendOutbound = vi.fn()
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation({
            platform: 'instagram',
            contact_avatar_url: null
        }))
        const inboundInsert = createInsertBuilder()
        const conversationUpdate = createUpdateBuilder()

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder],
            conversations: [lookup.builder, conversationUpdate.builder]
        })

        await processInboundAiPipeline(buildInput(supabase, sendOutbound, {
            platform: 'instagram',
            source: 'instagram',
            contactId: 'ig-user-1',
            contactName: 'itsalinayalin',
            contactAvatarUrl: 'https://cdn.example.com/instagram-avatar.jpg',
            inboundMessageId: 'igmid-avatar-1',
            inboundMessageIdMetadataKey: 'instagram_message_id',
            inboundMessageMetadata: {
                instagram_message_id: 'igmid-avatar-1'
            },
            skipAutomation: true,
            logPrefix: 'Instagram Webhook'
        }))

        expect(conversationUpdate.updateMock).toHaveBeenCalledWith(expect.objectContaining({
            contact_name: 'itsalinayalin',
            contact_avatar_url: 'https://cdn.example.com/instagram-avatar.jpg'
        }))
    })

    it('halts token-consuming flow when billing usage is locked', async () => {
        const sendOutbound = vi.fn()
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation({ active_agent: 'bot' }))
        const inboundInsert = createInsertBuilder()
        const conversationUpdate = createUpdateBuilder()

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder],
            conversations: [lookup.builder, conversationUpdate.builder]
        })

        resolveOrganizationUsageEntitlementMock.mockResolvedValueOnce({
            isUsageAllowed: false,
            lockReason: 'subscription_required',
            membershipState: 'trial_exhausted',
            snapshot: null
        })

        await processInboundAiPipeline(buildInput(supabase, sendOutbound))

        expect(sendOutbound).not.toHaveBeenCalled()
        expect(runLeadExtractionMock).not.toHaveBeenCalled()
        expect(matchSkillsSafelyMock).not.toHaveBeenCalled()
        expect(buildFallbackResponseMock).not.toHaveBeenCalled()
    })

    it('sends matched skill reply and persists bot message metadata', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const botInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const skillDetails = createSkillDetailsBuilder({ requires_human_handover: false })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, botInsert.builder],
            conversations: [lookup.builder, conversationUpdateAfterInbound.builder, conversationUpdateAfterBotReply.builder],
            skills: [skillDetails.builder]
        })

        matchSkillsSafelyMock.mockResolvedValueOnce([
            {
                skill_id: 'skill-1',
                title: 'Bilgi',
                response_text: 'Skill response'
            }
        ])

        await processInboundAiPipeline(buildInput(supabase, sendOutbound))

        expect(sendOutbound).toHaveBeenCalledWith('Skill response\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')
        expect(botInsert.insertMock).toHaveBeenCalledWith(
            expect.objectContaining({
                sender_type: 'bot',
                content: 'Skill response\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.',
                metadata: expect.objectContaining({
                    skill_id: 'skill-1',
                    skill_title: 'Bilgi',
                    matched_skill_title: 'Bilgi',
                    skill_requires_human_handover: false
                })
            })
        )
        expect(skillDetails.selectMock).toHaveBeenCalledWith('requires_human_handover, title, skill_actions')
        expect(decideHumanEscalationMock).toHaveBeenCalled()
        expect(buildFallbackResponseMock).not.toHaveBeenCalled()
    })

    it('uses instagram disclaimer formatting for instagram bot replies', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation({ platform: 'instagram' }))
        const inboundInsert = createInsertBuilder()
        const botInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const skillDetails = createSkillDetailsBuilder({ requires_human_handover: false })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, botInsert.builder],
            conversations: [lookup.builder, conversationUpdateAfterInbound.builder, conversationUpdateAfterBotReply.builder],
            skills: [skillDetails.builder]
        })

        matchSkillsSafelyMock.mockResolvedValueOnce([
            {
                skill_id: 'skill-1',
                title: 'Bilgi',
                response_text: 'Skill response'
            }
        ])

        await processInboundAiPipeline(buildInput(supabase, sendOutbound, {
            platform: 'instagram',
            source: 'instagram',
            inboundMessageIdMetadataKey: 'instagram_message_id',
            inboundMessageMetadata: {
                instagram_message_id: 'igmid-1'
            }
        }))

        expect(sendOutbound).toHaveBeenCalledWith('Skill response\n\n------\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')
        expect(botInsert.insertMock).toHaveBeenCalledWith(
            expect.objectContaining({
                sender_type: 'bot',
                content: 'Skill response\n\n------\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.'
            })
        )
    })

    it('sends matched skill reply with interactive buttons when skill actions exist', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const botInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const skillDetails = createSkillDetailsBuilder({
            requires_human_handover: false,
            title: 'Bilgi',
            skill_actions: [
                {
                    id: 'action-trigger-1',
                    type: 'trigger_skill',
                    label: 'Randevu Al',
                    target_skill_id: 'skill-randevu'
                },
                {
                    id: 'action-url-1',
                    type: 'open_url',
                    label: 'Instagram',
                    url: 'https://instagram.com/acme'
                }
            ]
        })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, botInsert.builder],
            conversations: [lookup.builder, conversationUpdateAfterInbound.builder, conversationUpdateAfterBotReply.builder],
            skills: [skillDetails.builder]
        })

        matchSkillsSafelyMock.mockResolvedValueOnce([
            {
                skill_id: 'skill-1',
                title: 'Bilgi',
                response_text: 'Skill response'
            }
        ])

        await processInboundAiPipeline(buildInput(supabase, sendOutbound))

        expect(sendOutbound).toHaveBeenCalledWith({
            content: 'Skill response\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.',
            replyButtons: [
                { id: 'skill_action:skill-1:action-trigger-1', title: 'Randevu Al' },
                { id: 'skill_action:skill-1:action-url-1', title: 'Instagram' }
            ]
        })
        expect(skillDetails.selectMock).toHaveBeenCalledWith('requires_human_handover, title, skill_actions')
    })

    it('handles open_url skill action deterministically when inbound button maps to a skill action', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const botInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const sourceSkillDetails = createSkillDetailsBuilder({
            id: 'skill-source-1',
            organization_id: 'org-1',
            title: 'Bilgi',
            skill_actions: [
                {
                    id: 'action-url-1',
                    type: 'open_url',
                    label: 'Instagram',
                    url: 'https://instagram.com/acme'
                }
            ]
        })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, botInsert.builder],
            conversations: [lookup.builder, conversationUpdateAfterInbound.builder, conversationUpdateAfterBotReply.builder],
            skills: [sourceSkillDetails.builder]
        })

        await processInboundAiPipeline(buildInput(supabase, sendOutbound, {
            inboundActionSelection: {
                kind: 'skill_action',
                sourceSkillId: 'skill-source-1',
                actionId: 'action-url-1',
                buttonTitle: 'Instagram'
            }
        }))

        expect(sendOutbound).toHaveBeenCalledWith('https://instagram.com/acme\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')
        expect(matchSkillsSafelyMock).not.toHaveBeenCalled()
        expect(buildFallbackResponseMock).not.toHaveBeenCalled()
    })

    it('handles trigger_skill action deterministically when inbound button maps to a skill action', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const botInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const sourceSkillDetails = createSkillDetailsBuilder({
            id: 'skill-source-1',
            organization_id: 'org-1',
            title: 'Bilgi',
            skill_actions: [
                {
                    id: 'action-trigger-1',
                    type: 'trigger_skill',
                    label: 'Randevu Al',
                    target_skill_id: 'skill-target-1'
                }
            ]
        })
        const targetSkillDetails = createSkillDetailsBuilder({
            id: 'skill-target-1',
            organization_id: 'org-1',
            title: 'Randevu',
            response_text: 'Randevu almak için uygun gününüzü paylaşabilir misiniz?',
            enabled: true,
            requires_human_handover: false,
            skill_actions: []
        })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, botInsert.builder],
            conversations: [lookup.builder, conversationUpdateAfterInbound.builder, conversationUpdateAfterBotReply.builder],
            skills: [sourceSkillDetails.builder, targetSkillDetails.builder]
        })

        await processInboundAiPipeline(buildInput(supabase, sendOutbound, {
            inboundActionSelection: {
                kind: 'skill_action',
                sourceSkillId: 'skill-source-1',
                actionId: 'action-trigger-1',
                buttonTitle: 'Randevu Al'
            }
        }))

        expect(sendOutbound).toHaveBeenCalledWith('Randevu almak için uygun gününüzü paylaşabilir misiniz?\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')
        expect(matchSkillsSafelyMock).not.toHaveBeenCalled()
        expect(buildFallbackResponseMock).not.toHaveBeenCalled()
    })

    it('returns a deterministic unavailable notice when trigger_skill action target is disabled', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const botInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const sourceSkillDetails = createSkillDetailsBuilder({
            id: 'skill-source-1',
            organization_id: 'org-1',
            title: 'Bilgi',
            skill_actions: [
                {
                    id: 'action-trigger-1',
                    type: 'trigger_skill',
                    label: 'Randevu Al',
                    target_skill_id: 'skill-target-1'
                }
            ]
        })
        const targetSkillDetails = createSkillDetailsBuilder({
            id: 'skill-target-1',
            organization_id: 'org-1',
            title: 'Randevu',
            response_text: 'Randevu almak için uygun gününüzü paylaşabilir misiniz?',
            enabled: false,
            requires_human_handover: false,
            skill_actions: []
        })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, botInsert.builder],
            conversations: [lookup.builder, conversationUpdateAfterInbound.builder, conversationUpdateAfterBotReply.builder],
            skills: [sourceSkillDetails.builder, targetSkillDetails.builder]
        })

        await processInboundAiPipeline(buildInput(supabase, sendOutbound, {
            inboundActionSelection: {
                kind: 'skill_action',
                sourceSkillId: 'skill-source-1',
                actionId: 'action-trigger-1',
                buttonTitle: 'Randevu Al'
            }
        }))

        expect(sendOutbound).toHaveBeenCalledWith('Bu seçenek şu anda kullanılamıyor. Lütfen farklı bir seçim yapın.\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')
        expect(matchSkillsSafelyMock).not.toHaveBeenCalled()
        expect(buildFallbackResponseMock).not.toHaveBeenCalled()
    })

    it('persists skill title from skill row when matcher result title is empty', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const botInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const skillDetails = createSkillDetailsBuilder({
            requires_human_handover: false,
            title: 'Şikayet ve Memnuniyetsizlik'
        })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, botInsert.builder],
            conversations: [lookup.builder, conversationUpdateAfterInbound.builder, conversationUpdateAfterBotReply.builder],
            skills: [skillDetails.builder]
        })

        matchSkillsSafelyMock.mockResolvedValueOnce([
            {
                skill_id: 'skill-complaint',
                title: '',
                response_text: 'Yaşadığınız olumsuz deneyim için üzgünüz. Konuyu hemen ekibimize iletiyorum.'
            }
        ])

        await processInboundAiPipeline(buildInput(supabase, sendOutbound))

        expect(botInsert.insertMock).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    skill_id: 'skill-complaint',
                    skill_title: 'Şikayet ve Memnuniyetsizlik',
                    matched_skill_title: 'Şikayet ve Memnuniyetsizlik'
                })
            })
        )
    })

    it('marks conversation for human attention when escalation is triggered', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const botInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const escalationConversationUpdate = createUpdateBuilder()
        const skillDetails = createSkillDetailsBuilder({ requires_human_handover: false })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, botInsert.builder],
            conversations: [
                lookup.builder,
                conversationUpdateAfterInbound.builder,
                conversationUpdateAfterBotReply.builder,
                escalationConversationUpdate.builder
            ],
            skills: [skillDetails.builder]
        })

        matchSkillsSafelyMock.mockResolvedValueOnce([
            {
                skill_id: 'skill-1',
                title: 'Bilgi',
                response_text: 'Skill response'
            }
        ])
        decideHumanEscalationMock.mockReturnValueOnce({
            shouldEscalate: true,
            reason: 'hot_lead',
            action: 'notify_only',
            noticeMode: 'none',
            noticeMessage: null
        })

        await processInboundAiPipeline(buildInput(supabase, sendOutbound))

        expect(escalationConversationUpdate.updateMock).toHaveBeenCalledWith(expect.objectContaining({
            human_attention_required: true,
            human_attention_reason: 'hot_lead',
            human_attention_resolved_at: null,
            human_attention_requested_at: expect.any(String)
        }))
    })

    it('applies default disclaimer text when localized disclaimer settings are missing', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const botInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const skillDetails = createSkillDetailsBuilder({ requires_human_handover: false })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, botInsert.builder],
            conversations: [lookup.builder, conversationUpdateAfterInbound.builder, conversationUpdateAfterBotReply.builder],
            skills: [skillDetails.builder]
        })

        getOrgAiSettingsMock.mockResolvedValueOnce({
            match_threshold: 0.7,
            bot_mode: 'active',
            allow_lead_extraction_during_operator: false,
            hot_lead_score_threshold: 8,
            hot_lead_action: 'notify_only',
            hot_lead_handover_message_tr: 'Talebin destek ekibine iletildi.',
            hot_lead_handover_message_en: 'Your request was forwarded to support.',
            bot_disclaimer_enabled: true,
            bot_disclaimer_message_tr: undefined,
            bot_disclaimer_message_en: undefined,
            prompt: null,
            bot_name: null
        })

        matchSkillsSafelyMock.mockResolvedValueOnce([
            {
                skill_id: 'skill-1',
                title: 'Bilgi',
                response_text: 'Skill response',
                trigger_text: 'Bilgi almak istiyorum',
                similarity: 0.8
            }
        ])

        await processInboundAiPipeline(buildInput(supabase, sendOutbound))

        expect(sendOutbound).toHaveBeenCalledWith('Skill response\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')
        expect(buildFallbackResponseMock).not.toHaveBeenCalled()
    })

    it('uses the top matched skill directly without handover-intent guard filtering', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const botInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const skillDetails = createSkillDetailsBuilder({ requires_human_handover: true })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, botInsert.builder],
            conversations: [lookup.builder, conversationUpdateAfterInbound.builder, conversationUpdateAfterBotReply.builder],
            skills: [skillDetails.builder]
        })

        matchSkillsSafelyMock.mockResolvedValueOnce([
            {
                skill_id: 'skill-complaint',
                title: 'Şikayet ve Memnuniyetsizlik',
                response_text: 'Yaşadığınız olumsuz deneyim için üzgünüz. Konuyu hemen ekibimize iletiyorum.',
                trigger_text: 'Bu konuda destek istiyorum',
                similarity: 0.72
            }
        ])

        await processInboundAiPipeline(
            buildInput(supabase, sendOutbound, { text: 'hizmetleriniz hakkında bilgi almak istiyorum' })
        )

        expect(sendOutbound).toHaveBeenCalledWith('Yaşadığınız olumsuz deneyim için üzgünüz. Konuyu hemen ekibimize iletiyorum.\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')
        expect(skillDetails.selectMock).toHaveBeenCalledWith('requires_human_handover, title, skill_actions')
        expect(buildFallbackResponseMock).not.toHaveBeenCalled()
    })

    it('keeps typo complaint intents on handover skill path and switches active agent', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const botInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const escalationConversationUpdate = createUpdateBuilder()
        const skillDetails = createSkillDetailsBuilder({ requires_human_handover: true })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, botInsert.builder],
            conversations: [
                lookup.builder,
                conversationUpdateAfterInbound.builder,
                conversationUpdateAfterBotReply.builder,
                escalationConversationUpdate.builder
            ],
            skills: [skillDetails.builder]
        })

        matchSkillsSafelyMock.mockResolvedValueOnce([
            {
                skill_id: 'skill-complaint',
                title: 'Şikayet ve Memnuniyetsizlik',
                response_text: 'Yaşadığınız olumsuz deneyim için üzgünüz. Konuyu hemen ekibimize iletiyorum.',
                trigger_text: 'Şikayetim var',
                similarity: 0.64
            }
        ])
        decideHumanEscalationMock.mockReturnValueOnce({
            shouldEscalate: true,
            reason: 'skill_handover',
            action: 'switch_to_operator',
            noticeMode: null,
            noticeMessage: null
        })

        await processInboundAiPipeline(
            buildInput(supabase, sendOutbound, { text: 'şikayerim var' })
        )

        expect(sendOutbound).toHaveBeenCalledWith(expect.stringContaining('Yaşadığınız olumsuz deneyim için üzgünüz'))
        expect(escalationConversationUpdate.updateMock).toHaveBeenCalledWith(expect.objectContaining({
            active_agent: 'operator',
            human_attention_required: true,
            human_attention_reason: 'skill_handover',
            human_attention_requested_at: expect.any(String)
        }))
        expect(buildFallbackResponseMock).not.toHaveBeenCalled()
    })

    it('resolves ambiguous language from recent customer history for handover notice selection', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const languageHistory = createMessageHistoryBuilder([
            {
                sender_type: 'contact',
                content: 'Merhaba, fiyat bilgisi alabilir miyim?',
                created_at: '2026-02-10T11:58:00.000Z'
            },
            {
                sender_type: 'bot',
                content: 'Tabii, yardımcı olayım.',
                created_at: '2026-02-10T11:59:00.000Z'
            }
        ])
        const inboundInsert = createInsertBuilder()
        const botInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const escalationConversationUpdate = createUpdateBuilder()
        const skillDetails = createSkillDetailsBuilder({ requires_human_handover: true })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, languageHistory.builder, botInsert.builder],
            conversations: [
                lookup.builder,
                conversationUpdateAfterInbound.builder,
                conversationUpdateAfterBotReply.builder,
                escalationConversationUpdate.builder
            ],
            skills: [skillDetails.builder]
        })

        matchSkillsSafelyMock.mockResolvedValueOnce([
            {
                skill_id: 'skill-complaint',
                title: 'Şikayet ve Memnuniyetsizlik',
                response_text: 'Yaşadığınız olumsuz deneyim için üzgünüz. Konuyu hemen ekibimize iletiyorum.',
                trigger_text: 'şikayet',
                similarity: 0.8
            }
        ])
        decideHumanEscalationMock.mockReturnValueOnce({
            shouldEscalate: true,
            reason: 'skill_handover',
            action: 'switch_to_operator',
            noticeMode: 'none',
            noticeMessage: null
        })

        await processInboundAiPipeline(buildInput(supabase, sendOutbound, { text: 'ok' }))

        expect(decideHumanEscalationMock).toHaveBeenCalledWith(expect.objectContaining({
            handoverMessage: 'Talebin destek ekibine iletildi.'
        }))
    })

    it('returns on the first successful match from top candidates', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const botInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const firstSkillDetails = createSkillDetailsBuilder({ requires_human_handover: true })
        const secondSkillDetails = createSkillDetailsBuilder({ requires_human_handover: false })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, botInsert.builder],
            conversations: [lookup.builder, conversationUpdateAfterInbound.builder, conversationUpdateAfterBotReply.builder],
            skills: [firstSkillDetails.builder, secondSkillDetails.builder]
        })

        matchSkillsSafelyMock.mockResolvedValueOnce([
            {
                skill_id: 'skill-complaint',
                title: 'Şikayet ve Memnuniyetsizlik',
                response_text: 'Yaşadığınız olumsuz deneyim için üzgünüz. Konuyu hemen ekibimize iletiyorum.',
                trigger_text: 'Bu konuda destek istiyorum',
                similarity: 0.72
            },
            {
                skill_id: 'skill-service-info',
                title: 'Hizmet Bilgisi',
                response_text: 'Elbette, hizmetlerimiz hakkında bilgi paylaşabilirim.',
                trigger_text: 'hizmetleriniz hakkında bilgi almak istiyorum',
                similarity: 0.7
            }
        ])

        await processInboundAiPipeline(
            buildInput(supabase, sendOutbound, { text: 'hizmetleriniz hakkında bilgi almak istiyorum' })
        )

        expect(sendOutbound).toHaveBeenCalledWith('Yaşadığınız olumsuz deneyim için üzgünüz. Konuyu hemen ekibimize iletiyorum.\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')
        expect(firstSkillDetails.selectMock).toHaveBeenCalledWith('requires_human_handover, title, skill_actions')
        expect(secondSkillDetails.selectMock).not.toHaveBeenCalled()
        expect(buildFallbackResponseMock).not.toHaveBeenCalled()
    })

    it('falls through to RAG when no skills are matched', async () => {
        process.env.OPENAI_API_KEY = 'test-openai-key'

        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const historySelect = createMessageHistoryBuilder([
            {
                sender_type: 'contact',
                content: 'hizmetleriniz hakkında bilgi almak istiyorum',
                created_at: '2026-02-10T12:00:00.000Z'
            }
        ])
        const botInsert = createInsertBuilder()
        const latencyInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const leadSnapshot = createLeadSnapshotBuilder({
            service_type: null,
            extracted_fields: {}
        })

        decideKnowledgeBaseRouteMock.mockResolvedValue({
            route_to_kb: true,
            rewritten_query: 'hizmet bilgisi',
            reason: 'knowledge_question',
            usage: {
                inputTokens: 10,
                outputTokens: 4,
                totalTokens: 14
            }
        })
        searchKnowledgeBaseMock.mockResolvedValue([
            {
                document_id: 'doc-1',
                content: 'Güzellik merkezimizde cilt bakımı, lazer epilasyon ve bakım paketleri sunuyoruz.'
            }
        ])
        buildRagContextMock.mockReturnValue({
            context: 'Güzellik merkezimizde cilt bakımı, lazer epilasyon ve bakım paketleri sunuyoruz.',
            chunks: [{ document_id: 'doc-1', content: 'Güzellik merkezimizde cilt bakımı, lazer epilasyon ve bakım paketleri sunuyoruz.' }],
            tokenCount: 10
        })
        openAiCreateMock.mockResolvedValue({
            choices: [{ message: { content: 'Elbette, cilt bakımı ve lazer epilasyon hizmetlerimiz mevcut.' } }],
            usage: {
                prompt_tokens: 100,
                completion_tokens: 20,
                total_tokens: 120
            }
        })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, historySelect.builder, botInsert.builder],
            conversations: [lookup.builder, conversationUpdateAfterInbound.builder, conversationUpdateAfterBotReply.builder],
            leads: [leadSnapshot.builder],
            organization_ai_latency_events: [latencyInsert.builder]
        })

        matchSkillsSafelyMock.mockResolvedValueOnce([])

        await processInboundAiPipeline(
            buildInput(supabase, sendOutbound, { text: 'hizmetleriniz hakkında bilgi almak istiyorum' })
        )

        expect(sendOutbound).toHaveBeenCalledWith('Elbette, cilt bakımı ve lazer epilasyon hizmetlerimiz mevcut.\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')
        expect(buildFallbackResponseMock).not.toHaveBeenCalled()
    })

    it('sets a max_tokens cap for inbound RAG completion', async () => {
        process.env.OPENAI_API_KEY = 'test-openai-key'

        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const historySelect = createMessageHistoryBuilder([
            {
                sender_type: 'contact',
                content: 'Paket fiyatı nedir?',
                created_at: '2026-02-10T12:00:00.000Z'
            }
        ])
        const botInsert = createInsertBuilder()
        const latencyInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const leadSnapshot = createLeadSnapshotBuilder({
            service_type: null,
            extracted_fields: {}
        })

        decideKnowledgeBaseRouteMock.mockResolvedValue({
            route_to_kb: true,
            rewritten_query: 'Paket fiyatı',
            reason: 'knowledge_question',
            usage: {
                inputTokens: 12,
                outputTokens: 5,
                totalTokens: 17
            }
        })
        searchKnowledgeBaseMock.mockResolvedValue([
            {
                document_id: 'doc-1',
                content: 'Newborn paket başlangıç fiyatı 1000 TL'
            }
        ])
        buildRagContextMock.mockReturnValue({
            context: 'Newborn paket başlangıç fiyatı 1000 TL',
            chunks: [{ document_id: 'doc-1', content: 'Newborn paket başlangıç fiyatı 1000 TL' }],
            tokenCount: 7
        })
        openAiCreateMock.mockResolvedValue({
            choices: [{ message: { content: 'Newborn paket başlangıç fiyatı 1000 TL.' } }],
            usage: {
                prompt_tokens: 150,
                completion_tokens: 25,
                total_tokens: 175
            }
        })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, historySelect.builder, botInsert.builder],
            conversations: [lookup.builder, conversationUpdateAfterInbound.builder, conversationUpdateAfterBotReply.builder],
            leads: [leadSnapshot.builder],
            organization_ai_latency_events: [latencyInsert.builder]
        })

        await processInboundAiPipeline(
            buildInput(
                supabase,
                sendOutbound
            )
        )

        expect(openAiCreateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'gpt-4o-mini',
                max_tokens: 320
            })
        )
        const ragRequest = openAiCreateMock.mock.calls[0]?.[0] as { messages?: Array<{ role: string; content: string }> } | undefined
        const systemPrompt = ragRequest?.messages?.find((item) => item.role === 'system')?.content ?? ''
        expect(systemPrompt).toContain('Reply language policy (MVP): use Turkish only.')
        expect(sendOutbound).toHaveBeenCalledWith('Newborn paket başlangıç fiyatı 1000 TL.\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')
        expect(buildFallbackResponseMock).not.toHaveBeenCalled()
    })

    it('passes English preference to fallback when inbound message is not Turkish', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const historySelect = createMessageHistoryBuilder([])
        const botInsert = createInsertBuilder()
        const latencyInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const leadSnapshot = createLeadSnapshotBuilder({
            service_type: null,
            extracted_fields: {}
        })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, historySelect.builder, botInsert.builder],
            conversations: [lookup.builder, conversationUpdateAfterInbound.builder, conversationUpdateAfterBotReply.builder],
            leads: [leadSnapshot.builder],
            organization_ai_latency_events: [latencyInsert.builder]
        })

        await processInboundAiPipeline(
            buildInput(supabase, sendOutbound, { text: 'How can I book an appointment?' })
        )

        expect(buildFallbackResponseMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'How can I book an appointment?',
                preferredLanguage: 'en'
            })
        )
        expect(sendOutbound).toHaveBeenCalledWith('Fallback response\n\n> This message was generated by an AI bot and may contain mistakes.')
    })

    it('reuses the existing escalation path when scheduling requires human handoff', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const escalationConversationUpdate = createUpdateBuilder()
        const latencyInsert = createInsertBuilder()

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder],
            conversations: [lookup.builder, conversationUpdateAfterInbound.builder, escalationConversationUpdate.builder],
            organization_ai_latency_events: [latencyInsert.builder]
        })

        maybeHandleSchedulingRequestMock.mockResolvedValueOnce({
            handled: true,
            requiresHumanHandover: true
        })
        decideHumanEscalationMock.mockReturnValueOnce({
            shouldEscalate: true,
            reason: 'skill_handover',
            action: 'switch_to_operator',
            noticeMode: null,
            noticeMessage: null
        })

        await processInboundAiPipeline(
            buildInput(supabase, sendOutbound, { text: 'Randevumu değiştirmek istiyorum.' })
        )

        expect(escalationConversationUpdate.updateMock).toHaveBeenCalledWith(expect.objectContaining({
            active_agent: 'operator',
            human_attention_required: true,
            human_attention_reason: 'skill_handover'
        }))
        expect(buildFallbackResponseMock).not.toHaveBeenCalled()
    })

    it('returns a deterministic scheduling handoff when the scheduling branch throws', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const botInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const escalationConversationUpdate = createUpdateBuilder()
        const latencyInsert = createInsertBuilder()

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, botInsert.builder],
            conversations: [
                lookup.builder,
                conversationUpdateAfterInbound.builder,
                conversationUpdateAfterBotReply.builder,
                escalationConversationUpdate.builder
            ],
            organization_ai_latency_events: [latencyInsert.builder]
        })

        maybeHandleSchedulingRequestMock.mockRejectedValueOnce(new Error('calendar lookup failed'))
        decideHumanEscalationMock.mockReturnValueOnce({
            shouldEscalate: true,
            reason: 'skill_handover',
            action: 'switch_to_operator',
            noticeMode: null,
            noticeMessage: null
        })

        await processInboundAiPipeline(
            buildInput(supabase, sendOutbound, { text: 'Cilt bakımı için yarın 15:00 uygun mu?' })
        )

        expect(sendOutbound).toHaveBeenCalledWith(
            expect.stringContaining('Takvim')
        )
        expect(botInsert.insertMock).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('Takvim'),
            metadata: expect.objectContaining({
                booking_action: 'handoff',
                is_booking_response: true
            })
        }))
        expect(matchSkillsSafelyMock).not.toHaveBeenCalled()
        expect(buildFallbackResponseMock).not.toHaveBeenCalled()
        expect(escalationConversationUpdate.updateMock).toHaveBeenCalledWith(expect.objectContaining({
            active_agent: 'operator',
            human_attention_required: true,
            human_attention_reason: 'skill_handover'
        }))
    })
})
