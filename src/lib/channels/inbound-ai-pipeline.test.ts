import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    analyzeRequiredIntakeStateMock,
    buildRagContextMock,
    buildFallbackResponseMock,
    decideHumanEscalationMock,
    decideKnowledgeBaseRouteMock,
    getOrgAiSettingsMock,
    getRequiredIntakeFieldsMock,
    isOperatorActiveMock,
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
    buildRagContextMock: vi.fn(),
    buildFallbackResponseMock: vi.fn(),
    decideHumanEscalationMock: vi.fn(),
    decideKnowledgeBaseRouteMock: vi.fn(),
    getOrgAiSettingsMock: vi.fn(),
    getRequiredIntakeFieldsMock: vi.fn(),
    isOperatorActiveMock: vi.fn(),
    matchSkillsSafelyMock: vi.fn(),
    openAiCreateMock: vi.fn(),
    recordAiUsageMock: vi.fn(),
    resolveOrganizationUsageEntitlementMock: vi.fn(),
    resolveBotModeActionMock: vi.fn(),
    resolveLeadExtractionAllowanceMock: vi.fn(),
    runLeadExtractionMock: vi.fn(),
    searchKnowledgeBaseMock: vi.fn()
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

import { processInboundAiPipeline } from '@/lib/channels/inbound-ai-pipeline'

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

function createConversationLookupBuilder(conversation: Record<string, unknown>) {
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

function createSkillDetailsBuilder(skill: Record<string, unknown> | null) {
    const maybeSingleMock = vi.fn(async () => ({ data: skill, error: null }))
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

        getOrgAiSettingsMock.mockResolvedValue({
            match_threshold: 0.7,
            bot_mode: 'active',
            allow_lead_extraction_during_operator: false,
            hot_lead_score_threshold: 8,
            hot_lead_action: 'notify_only',
            hot_lead_handover_message_tr: 'Talebin destek ekibine iletildi.',
            hot_lead_handover_message_en: 'Your request was forwarded to support.',
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
                response_text: 'Skill response'
            }
        ])

        await processInboundAiPipeline(buildInput(supabase, sendOutbound))

        expect(sendOutbound).toHaveBeenCalledWith('Skill response')
        expect(botInsert.insertMock).toHaveBeenCalledWith(
            expect.objectContaining({
                sender_type: 'bot',
                content: 'Skill response',
                metadata: {
                    skill_id: 'skill-1'
                }
            })
        )
        expect(skillDetails.selectMock).toHaveBeenCalledWith('requires_human_handover')
        expect(decideHumanEscalationMock).toHaveBeenCalled()
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
            leads: [leadSnapshot.builder]
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
        expect(sendOutbound).toHaveBeenCalledWith('Newborn paket başlangıç fiyatı 1000 TL.')
        expect(buildFallbackResponseMock).not.toHaveBeenCalled()
    })

    it('passes English preference to fallback when inbound message is not Turkish', async () => {
        const sendOutbound = vi.fn(async () => undefined)
        const dedupe = createDedupeBuilder(null)
        const lookup = createConversationLookupBuilder(createConversation())
        const inboundInsert = createInsertBuilder()
        const historySelect = createMessageHistoryBuilder([])
        const botInsert = createInsertBuilder()
        const conversationUpdateAfterInbound = createUpdateBuilder()
        const conversationUpdateAfterBotReply = createUpdateBuilder()
        const leadSnapshot = createLeadSnapshotBuilder({
            service_type: null,
            extracted_fields: {}
        })

        const supabase = createSupabaseMock({
            messages: [dedupe.builder, inboundInsert.builder, historySelect.builder, botInsert.builder],
            conversations: [lookup.builder, conversationUpdateAfterInbound.builder, conversationUpdateAfterBotReply.builder],
            leads: [leadSnapshot.builder]
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
        expect(sendOutbound).toHaveBeenCalledWith('Fallback response')
    })
})
