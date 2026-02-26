import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
    createClientMock,
    decideHumanEscalationMock,
    getOrgAiSettingsMock,
    getRequiredIntakeFieldsMock,
    isOperatorActiveMock,
    matchSkillsSafelyMock,
    resolveBotModeActionMock,
    resolveLeadExtractionAllowanceMock,
    resolveOrganizationUsageEntitlementMock,
    runLeadExtractionMock,
    telegramCtorMock,
    telegramSendMessageMock
} = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    decideHumanEscalationMock: vi.fn(),
    getOrgAiSettingsMock: vi.fn(),
    getRequiredIntakeFieldsMock: vi.fn(),
    isOperatorActiveMock: vi.fn(),
    matchSkillsSafelyMock: vi.fn(),
    resolveBotModeActionMock: vi.fn(),
    resolveLeadExtractionAllowanceMock: vi.fn(),
    resolveOrganizationUsageEntitlementMock: vi.fn(),
    runLeadExtractionMock: vi.fn(),
    telegramCtorMock: vi.fn(),
    telegramSendMessageMock: vi.fn()
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: createClientMock
}))

vi.mock('@/lib/ai/settings', () => ({
    getOrgAiSettings: getOrgAiSettingsMock
}))

vi.mock('@/lib/ai/followup', () => ({
    getRequiredIntakeFields: getRequiredIntakeFieldsMock,
    buildRequiredIntakeFollowupGuidance: vi.fn(() => ''),
    analyzeRequiredIntakeState: vi.fn(() => ({
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
    }))
}))

vi.mock('@/lib/leads/extraction', () => ({
    runLeadExtraction: runLeadExtractionMock
}))

vi.mock('@/lib/ai/bot-mode', () => ({
    resolveBotModeAction: resolveBotModeActionMock,
    resolveLeadExtractionAllowance: resolveLeadExtractionAllowanceMock
}))

vi.mock('@/lib/skills/match-safe', () => ({
    matchSkillsSafely: matchSkillsSafelyMock
}))

vi.mock('@/lib/ai/escalation', () => ({
    decideHumanEscalation: decideHumanEscalationMock
}))

vi.mock('@/lib/billing/entitlements', () => ({
    resolveOrganizationUsageEntitlement: resolveOrganizationUsageEntitlementMock
}))

vi.mock('@/lib/inbox/operator-state', () => ({
    isOperatorActive: isOperatorActiveMock
}))

vi.mock('@/lib/telegram/client', () => ({
    TelegramClient: class {
        constructor() {
            telegramCtorMock()
        }

        sendMessage = telegramSendMessageMock
    }
}))

import { POST } from '@/app/api/webhooks/telegram/route'

type QueryBuilder = Record<string, unknown>

function createSupabaseMock(plan: Record<string, QueryBuilder[]>) {
    return {
        from: vi.fn((table: string) => {
            const queue = plan[table]
            if (!queue || queue.length === 0) {
                throw new Error(`Unexpected query for table: ${table}`)
            }

            const next = queue.shift()
            if (!next) {
                throw new Error(`No query builder configured for table: ${table}`)
            }

            return next
        })
    }
}

function createChannelLookupBuilder() {
    const singleMock = vi.fn(async () => ({
        data: {
            id: 'channel-1',
            organization_id: 'org-1',
            config: {
                webhook_secret: 'secret-1',
                bot_token: 'token-1'
            }
        }
    }))
    const eqMock = vi.fn(() => ({ single: singleMock }))
    const selectMock = vi.fn(() => ({ eq: eqMock }))

    return {
        builder: {
            select: selectMock
        }
    }
}

function createConversationLookupBuilder(overrides: Record<string, unknown> = {}) {
    const maybeSingleMock = vi.fn(async () => ({
        data: {
            id: 'conv-1',
            organization_id: 'org-1',
            platform: 'telegram',
            contact_name: 'Ayse',
            contact_phone: '123',
            status: 'open',
            assignee_id: null,
            active_agent: 'bot',
            ai_processing_paused: true,
            last_message_at: '2026-02-25T09:00:00.000Z',
            unread_count: 0,
            tags: [],
            created_at: '2026-02-25T09:00:00.000Z',
            updated_at: '2026-02-25T09:00:00.000Z',
            ...overrides
        }
    }))
    const limitMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
    const eqContactMock = vi.fn(() => ({ limit: limitMock }))
    const eqPlatformMock = vi.fn(() => ({ eq: eqContactMock }))
    const eqOrgMock = vi.fn(() => ({ eq: eqPlatformMock }))
    const selectMock = vi.fn(() => ({ eq: eqOrgMock }))

    return {
        builder: {
            select: selectMock
        }
    }
}

function createInboundDedupeBuilder() {
    const maybeSingleMock = vi.fn(async () => ({
        data: null
    }))
    const eqMessageIdMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
    const eqOrgMock = vi.fn(() => ({ eq: eqMessageIdMock }))
    const selectMock = vi.fn(() => ({ eq: eqOrgMock }))

    return {
        builder: {
            select: selectMock
        }
    }
}

function createInsertMessageBuilder() {
    const insertMock = vi.fn(async () => ({ error: null }))
    return {
        builder: {
            insert: insertMock
        }
    }
}

function createConversationUpdateBuilder() {
    const eqMock = vi.fn(async () => ({ error: null }))
    const updateMock = vi.fn(() => ({ eq: eqMock }))
    return {
        builder: {
            update: updateMock
        },
        updateMock
    }
}

function createSkillDetailsBuilder() {
    const maybeSingleMock = vi.fn(async () => ({
        data: { requires_human_handover: true },
        error: null
    }))
    const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
    const selectMock = vi.fn(() => ({ eq: eqMock }))

    return {
        builder: {
            select: selectMock
        },
        selectMock
    }
}

describe('Telegram webhook route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

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
        decideHumanEscalationMock.mockReturnValue({ shouldEscalate: false })
        resolveOrganizationUsageEntitlementMock.mockResolvedValue({
            isUsageAllowed: true,
            lockReason: null,
            membershipState: null,
            snapshot: null
        })
    })

    it('stores inbound message and skips AI flow when conversation processing is paused', async () => {
        const channelLookup = createChannelLookupBuilder()
        const conversationLookup = createConversationLookupBuilder()
        const dedupeLookup = createInboundDedupeBuilder()
        const inboundInsert = createInsertMessageBuilder()
        const conversationUpdate = createConversationUpdateBuilder()

        const supabase = createSupabaseMock({
            channels: [channelLookup.builder],
            conversations: [conversationLookup.builder, conversationUpdate.builder],
            messages: [dedupeLookup.builder, inboundInsert.builder]
        })

        createClientMock.mockReturnValue(supabase)

        const req = new NextRequest('http://localhost/api/webhooks/telegram?secret=secret-1', {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                update_id: 1001,
                message: {
                    message_id: 12,
                    text: 'Merhaba',
                    chat: { id: 123 },
                    from: { id: 456, first_name: 'Ayse' }
                }
            })
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true })
        expect(runLeadExtractionMock).not.toHaveBeenCalled()
        expect(resolveOrganizationUsageEntitlementMock).not.toHaveBeenCalled()
        expect(isOperatorActiveMock).not.toHaveBeenCalled()
        expect(matchSkillsSafelyMock).not.toHaveBeenCalled()
        expect(telegramCtorMock).not.toHaveBeenCalled()
    })

    it('writes human attention flags when escalation is required', async () => {
        const channelLookup = createChannelLookupBuilder()
        const conversationLookup = createConversationLookupBuilder({
            ai_processing_paused: false
        })
        const dedupeLookup = createInboundDedupeBuilder()
        const inboundInsert = createInsertMessageBuilder()
        const botInsert = createInsertMessageBuilder()
        const conversationUpdateAfterInbound = createConversationUpdateBuilder()
        const conversationUpdateAfterBotReply = createConversationUpdateBuilder()
        const escalationUpdate = createConversationUpdateBuilder()
        const skillDetails = createSkillDetailsBuilder()

        const supabase = createSupabaseMock({
            channels: [channelLookup.builder],
            conversations: [
                conversationLookup.builder,
                conversationUpdateAfterInbound.builder,
                conversationUpdateAfterBotReply.builder,
                escalationUpdate.builder
            ],
            messages: [dedupeLookup.builder, inboundInsert.builder, botInsert.builder],
            skills: [skillDetails.builder]
        })

        createClientMock.mockReturnValue(supabase)
        isOperatorActiveMock.mockReturnValue(false)
        matchSkillsSafelyMock.mockResolvedValueOnce([
            {
                skill_id: 'skill-1',
                title: 'Handover',
                response_text: 'Ekibimize iletiyorum.',
                trigger_text: 'Yardım istiyorum',
                similarity: 0.95
            }
        ])
        decideHumanEscalationMock.mockReturnValueOnce({
            shouldEscalate: true,
            reason: 'skill_handover',
            action: 'switch_to_operator',
            noticeMode: 'none',
            noticeMessage: null
        })

        const req = new NextRequest('http://localhost/api/webhooks/telegram?secret=secret-1', {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                update_id: 1002,
                message: {
                    message_id: 13,
                    text: 'yardım istiyorum',
                    chat: { id: 123 },
                    from: { id: 456, first_name: 'Ayse' }
                }
            })
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        expect(telegramCtorMock).toHaveBeenCalledTimes(1)
        expect(telegramSendMessageMock).toHaveBeenCalledTimes(1)
        expect(skillDetails.selectMock).toHaveBeenCalledWith('requires_human_handover, title')
        expect(escalationUpdate.updateMock).toHaveBeenCalledWith(expect.objectContaining({
            active_agent: 'operator',
            human_attention_required: true,
            human_attention_reason: 'skill_handover',
            human_attention_requested_at: expect.any(String),
            human_attention_resolved_at: null
        }))
    })
})
