import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    buildFallbackResponseMock,
    decideHumanEscalationMock,
    getOrgAiSettingsMock,
    getRequiredIntakeFieldsMock,
    isOperatorActiveMock,
    matchSkillsSafelyMock,
    resolveBotModeActionMock,
    resolveLeadExtractionAllowanceMock,
    runLeadExtractionMock
} = vi.hoisted(() => ({
    buildFallbackResponseMock: vi.fn(),
    decideHumanEscalationMock: vi.fn(),
    getOrgAiSettingsMock: vi.fn(),
    getRequiredIntakeFieldsMock: vi.fn(),
    isOperatorActiveMock: vi.fn(),
    matchSkillsSafelyMock: vi.fn(),
    resolveBotModeActionMock: vi.fn(),
    resolveLeadExtractionAllowanceMock: vi.fn(),
    runLeadExtractionMock: vi.fn()
}))

vi.mock('@/lib/ai/settings', () => ({
    getOrgAiSettings: getOrgAiSettingsMock
}))

vi.mock('@/lib/ai/followup', () => ({
    getRequiredIntakeFields: getRequiredIntakeFieldsMock,
    buildRequiredIntakeFollowupGuidance: vi.fn(() => '')
}))

vi.mock('@/lib/ai/bot-mode', () => ({
    resolveBotModeAction: resolveBotModeActionMock,
    resolveLeadExtractionAllowance: resolveLeadExtractionAllowanceMock
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
        last_message_at: '2026-02-10T12:00:00.000Z',
        unread_count: 0,
        tags: [],
        created_at: '2026-02-10T11:00:00.000Z',
        updated_at: '2026-02-10T12:00:00.000Z',
        ...overrides
    }
}

function buildInput(supabase: unknown, sendOutbound: ReturnType<typeof vi.fn>) {
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
        resolveBotModeActionMock.mockReturnValue({ allowReplies: true })
        resolveLeadExtractionAllowanceMock.mockReturnValue(false)
        isOperatorActiveMock.mockReturnValue(false)
        matchSkillsSafelyMock.mockResolvedValue([])
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
})
