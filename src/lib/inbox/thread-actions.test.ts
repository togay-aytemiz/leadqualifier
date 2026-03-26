import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, resolveOrganizationUsageEntitlementMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  resolveOrganizationUsageEntitlementMock: vi.fn(async () => ({
    isUsageAllowed: true,
    lockReason: null,
    membershipState: null,
    snapshot: null,
  })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/billing/entitlements', () => ({
  resolveOrganizationUsageEntitlement: resolveOrganizationUsageEntitlementMock,
}))

import { getConversationThreadPayload } from '@/lib/inbox/thread-actions'

function createMessagesBuilder(rows: unknown[]) {
  const rangeMock = vi.fn(async () => ({ data: rows, error: null }))
  const orderMock = vi.fn(() => ({ range: rangeMock }))
  const eqMock = vi.fn(() => ({ order: orderMock }))
  const selectMock = vi.fn(() => ({ eq: eqMock }))

  return {
    builder: {
      select: selectMock,
    },
    eqMock,
    orderMock,
    rangeMock,
  }
}

function createLeadBuilder(row: unknown) {
  const maybeSingleMock = vi.fn(async () => ({ data: row, error: null }))
  const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
  const selectMock = vi.fn(() => ({ eq: eqMock }))

  return {
    builder: {
      select: selectMock,
    },
    eqMock,
    maybeSingleMock,
  }
}

function createSupabaseMock(plan: Record<string, unknown[]>) {
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
    }),
  }
}

describe('getConversationThreadPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the first thread page and lead details with one workspace lock check when organizationId is provided', async () => {
    const messagesBuilder = createMessagesBuilder([
      {
        id: 'msg-2',
        conversation_id: 'conv-1',
        sender_type: 'contact',
        content: 'Ikinci mesaj',
        metadata: {},
        created_at: '2026-03-20T10:01:00.000Z',
      },
      {
        id: 'msg-1',
        conversation_id: 'conv-1',
        sender_type: 'contact',
        content: 'Ilk mesaj',
        metadata: {},
        created_at: '2026-03-20T10:00:00.000Z',
      },
    ])
    const leadBuilder = createLeadBuilder({
      id: 'lead-1',
      organization_id: 'org-1',
      conversation_id: 'conv-1',
      status: 'warm',
      total_score: 7,
      created_at: '2026-03-20T09:00:00.000Z',
      updated_at: '2026-03-20T10:00:00.000Z',
    })

    const supabaseMock = createSupabaseMock({
      messages: [messagesBuilder.builder],
      leads: [leadBuilder.builder],
    })
    createClientMock.mockResolvedValue(supabaseMock)

    const result = await getConversationThreadPayload('conv-1', {
      organizationId: 'org-1',
      pageSize: 50,
    })

    expect(result.fetchedCount).toBe(2)
    expect(result.hasMore).toBe(false)
    expect(result.messages.map((message) => message.id)).toEqual(['msg-1', 'msg-2'])
    expect(result.lead?.id).toBe('lead-1')
    expect(resolveOrganizationUsageEntitlementMock).toHaveBeenCalledTimes(1)
    expect(supabaseMock.from).not.toHaveBeenCalledWith('conversations')
  })
})
