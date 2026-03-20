import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  assertTenantWriteAllowedMock,
  createClientMock,
  getMessageTemplatesMock,
  instagramCtorMock,
  instagramSendImageMock,
  instagramSendTextMock,
  instagramGetUserProfileMock,
  sendTemplateMock,
  whatsAppSendTextMock,
  whatsAppCtorMock,
} = vi.hoisted(() => ({
  assertTenantWriteAllowedMock: vi.fn(),
  createClientMock: vi.fn(),
  getMessageTemplatesMock: vi.fn(),
  instagramCtorMock: vi.fn(),
  instagramSendImageMock: vi.fn(),
  instagramSendTextMock: vi.fn(),
  instagramGetUserProfileMock: vi.fn(),
  sendTemplateMock: vi.fn(),
  whatsAppSendTextMock: vi.fn(),
  whatsAppCtorMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/organizations/active-context', () => ({
  assertTenantWriteAllowed: assertTenantWriteAllowedMock,
}))

vi.mock('@/lib/billing/entitlements', () => ({
  resolveOrganizationUsageEntitlement: vi.fn(async () => ({
    isUsageAllowed: true,
  })),
}))

vi.mock('@/lib/whatsapp/client', () => ({
  WhatsAppClient: class {
    constructor(token: string) {
      whatsAppCtorMock(token)
    }

    getMessageTemplates = getMessageTemplatesMock
    sendTemplate = sendTemplateMock
    sendText = whatsAppSendTextMock
  },
}))

vi.mock('@/lib/instagram/client', () => ({
  InstagramClient: class {
    constructor(token: string, graphVersion?: string) {
      instagramCtorMock(token, graphVersion)
    }

    sendText = instagramSendTextMock
    sendImage = instagramSendImageMock
    getUserProfile = instagramGetUserProfileMock
  },
}))

import {
  clearConversationRequiredIntakeOverride,
  getConversations,
  createConversationPredefinedTemplate,
  deleteConversationPredefinedTemplate,
  listConversationWhatsAppTemplates,
  listConversationPredefinedTemplates,
  sendMessage,
  sendConversationInstagramImageBatch,
  sendConversationWhatsAppTemplateMessage,
  setConversationRequiredIntakeOverride,
  setConversationLeadServiceOverride,
  setConversationAgent,
  setConversationAiProcessingPaused,
  updateConversationPrivateNote,
  updateConversationPredefinedTemplate,
  updateConversationTags,
  type ConversationListItem,
} from '@/lib/inbox/actions'
import type { Conversation, Lead } from '@/types/database'

type QueryResult<T = unknown> = {
  data: T
  error: unknown
}

type QueryBuilderConfig = {
  rangeResult?: QueryResult
  orderResult?: QueryResult
  inResult?: QueryResult
}

function createQueryBuilder(config: QueryBuilderConfig = {}) {
  const builder: Record<string, unknown> = {}

  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.limit = vi.fn(() => builder)
  builder.order = vi.fn(() => {
    if (config.orderResult) {
      return Promise.resolve(config.orderResult)
    }
    return builder
  })
  builder.range = vi.fn(() => Promise.resolve(config.rangeResult ?? { data: [], error: null }))
  builder.in = vi.fn(() => {
    if (config.inResult) {
      return Promise.resolve(config.inResult)
    }
    return builder
  })

  return builder
}

function createSupabaseMock(plan: Record<string, ReturnType<typeof createQueryBuilder>[]>) {
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
    rpc: vi.fn(async () => ({ data: null, error: null })),
  }
}

function createConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    organization_id: 'org-1',
    contact_name: 'Test Contact',
    contact_avatar_url: null,
    contact_phone: '+905555555555',
    platform: 'whatsapp',
    status: 'open',
    assignee_id: 'profile-1',
    active_agent: 'bot',
    ai_processing_paused: false,
    last_message_at: '2026-02-08T10:00:00.000Z',
    unread_count: 0,
    tags: [],
    created_at: '2026-02-08T09:00:00.000Z',
    updated_at: '2026-02-08T10:00:00.000Z',
    ...overrides,
  }
}

function createDeferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolver) => {
    resolve = resolver
  })

  return { promise, resolve }
}

function createLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    organization_id: 'org-1',
    conversation_id: 'conv-1',
    service_type: 'Yenidoğan çekimi',
    service_fit: 0,
    intent_score: 0,
    total_score: 7,
    status: 'warm',
    summary: 'Özet',
    extracted_fields: {
      required_intake_collected: {
        Telefon: '0555 000 00 00',
      },
    },
    non_business: false,
    last_message_at: '2026-03-15T10:00:00.000Z',
    created_at: '2026-03-15T09:00:00.000Z',
    updated_at: '2026-03-15T10:00:00.000Z',
    ...overrides,
  }
}

function createChainMaybeSingleBuilder<T>(data: T, error: unknown = null) {
  const builder: Record<string, unknown> = {}
  const maybeSingleMock = vi.fn(async () => ({ data, error }))

  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.order = vi.fn(() => builder)
  builder.limit = vi.fn(() => builder)
  builder.maybeSingle = maybeSingleMock

  return {
    builder,
    maybeSingleMock,
  }
}

function createUpdateSelectSingleBuilder<T>(data: T, error: unknown = null) {
  const singleMock = vi.fn(async () => ({ data, error }))
  const builder: Record<string, unknown> = {}

  builder.update = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.select = vi.fn(() => ({ single: singleMock }))

  return {
    builder,
    updateMock: builder.update as ReturnType<typeof vi.fn>,
    eqMock: builder.eq as ReturnType<typeof vi.fn>,
    selectMock: builder.select as ReturnType<typeof vi.fn>,
    singleMock,
  }
}

function createSendMessageSupabaseMock(options: {
  conversation?: Partial<Conversation> & Pick<Conversation, 'platform' | 'organization_id' | 'contact_phone'>
  latestInboundAt?: string | null
  queuedMessageId?: string
}) {
  const conversationSingleMock = vi.fn(async () => ({
    data: {
      ...createConversation(),
      tags: [],
      ...options.conversation,
    },
    error: null,
  }))
  const conversationEqMock = vi.fn(() => ({ single: conversationSingleMock }))
  const conversationSelectMock = vi.fn(() => ({ eq: conversationEqMock }))

  const latestInboundBuilder = createChainMaybeSingleBuilder(
    options.latestInboundAt ? { created_at: options.latestInboundAt } : null
  )
  const messageUpdateBuilder = createUpdateSelectSingleBuilder({
    id: options.queuedMessageId ?? 'queued-msg-1',
    conversation_id: 'conv-1',
    sender_type: 'user',
    content: 'Merhaba',
    metadata: {},
    created_at: '2026-03-17T10:10:01.000Z',
  })

  const channelSingleMock = vi.fn(async () => ({
    data: {
      config: {
        permanent_access_token: 'wa-token-1',
        phone_number_id: 'phone-1',
      },
    },
    error: null,
  }))
  const channelEqStatusMock = vi.fn(() => ({ single: channelSingleMock }))
  const channelEqTypeMock = vi.fn(() => ({ eq: channelEqStatusMock }))
  const channelEqOrgMock = vi.fn(() => ({ eq: channelEqTypeMock }))
  const channelSelectMock = vi.fn(() => ({ eq: channelEqOrgMock }))

  const rpcMock = vi.fn(async () => ({
    data: {
      message: {
        id: options.queuedMessageId ?? 'queued-msg-1',
        conversation_id: 'conv-1',
        sender_type: 'user',
        content: 'Merhaba',
        metadata: {
          outbound_delivery_status: 'pending',
          outbound_channel: 'whatsapp',
        },
        created_at: '2026-03-17T10:10:00.000Z',
      },
      conversation: {
        ...createConversation({
          id: 'conv-1',
          platform: 'whatsapp',
          organization_id: 'org-1',
          contact_phone: '+905555555555',
          active_agent: 'operator',
          assignee_id: 'profile-1',
        }),
      },
    },
    error: null,
  }))

  const messageBuilders = [latestInboundBuilder.builder, messageUpdateBuilder.builder]

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'conversations') return { select: conversationSelectMock }
        if (table === 'messages') {
          const next = messageBuilders.shift()
          if (!next) {
            throw new Error('Unexpected extra messages query')
          }
          return next
        }
        if (table === 'channels') return { select: channelSelectMock }
        throw new Error(`Unexpected query for table: ${table}`)
      }),
      rpc: rpcMock,
    },
    rpcMock,
    messageUpdateBuilder,
  }
}

describe('getConversations', () => {
  beforeEach(() => {
    createClientMock.mockReset()
    instagramCtorMock.mockReset()
    instagramGetUserProfileMock.mockReset()
    assertTenantWriteAllowedMock.mockResolvedValue(undefined)
    getMessageTemplatesMock.mockResolvedValue({
      data: [
        {
          id: 'tpl-1',
          name: 'hello_world',
          status: 'APPROVED',
          language: 'en_US',
          category: 'UTILITY',
        },
      ],
    })
    sendTemplateMock.mockResolvedValue({
      messages: [{ id: 'wamid.template.1' }],
    })
  })

  it('returns primary nested query data when available', async () => {
    const nestedConversation: ConversationListItem = {
      ...createConversation(),
      assignee: {
        full_name: 'Test User',
        email: 'test@example.com',
      },
      leads: [{ status: 'hot' }],
      messages: [
        {
          content: 'Merhaba',
          created_at: '2026-02-08T10:00:00.000Z',
          sender_type: 'contact',
        },
      ],
    }

    const supabaseMock = createSupabaseMock({
      conversations: [
        createQueryBuilder({
          rangeResult: {
            data: [nestedConversation],
            error: null,
          },
        }),
      ],
    })

    createClientMock.mockResolvedValue(supabaseMock)

    const result = await getConversations('org-1')

    expect(result).toEqual([nestedConversation])
  })

  it('normalizes one-to-one lead payloads from nested query into an array', async () => {
    const rawConversation = {
      ...createConversation(),
      assignee: {
        full_name: 'Test User',
        email: 'test@example.com',
      },
      leads: {
        status: 'cold',
      },
      messages: [
        {
          content: 'Selam',
          created_at: '2026-02-08T10:00:00.000Z',
          sender_type: 'contact',
        },
      ],
    }

    const supabaseMock = createSupabaseMock({
      conversations: [
        createQueryBuilder({
          rangeResult: {
            data: [rawConversation],
            error: null,
          },
        }),
      ],
    })

    createClientMock.mockResolvedValue(supabaseMock)

    const result = await getConversations('org-1')

    expect(Array.isArray(result[0]?.leads)).toBe(true)
    expect(result[0]?.leads?.[0]?.status).toBe('cold')
  })

  it('derives missing social avatar urls from preview message metadata', async () => {
    const rawConversation = {
      ...createConversation({
        platform: 'telegram',
        contact_avatar_url: null,
      }),
      assignee: {
        full_name: 'Test User',
        email: 'test@example.com',
      },
      leads: [],
      messages: [
        {
          content: 'Merhaba',
          created_at: '2026-02-08T10:00:00.000Z',
          sender_type: 'contact',
          metadata: {
            telegram_contact_avatar_url:
              'https://api.telegram.org/file/bottoken-1/photos/avatar.jpg',
          },
        },
      ],
    }

    const supabaseMock = createSupabaseMock({
      conversations: [
        createQueryBuilder({
          rangeResult: {
            data: [rawConversation],
            error: null,
          },
        }),
      ],
    })

    createClientMock.mockResolvedValue(supabaseMock)

    const result = await getConversations('org-1')

    expect(result[0]?.contact_avatar_url).toBe(
      'https://api.telegram.org/file/bottoken-1/photos/avatar.jpg'
    )
  })

  it('does not append instagram_request tag for normal instagram messaging conversations', async () => {
    const rawConversation = {
      ...createConversation({
        platform: 'instagram',
        contact_name: 'togayaytemiz',
        contact_phone: 'togayaytemiz',
        contact_avatar_url: 'https://cdn.example.com/ig-avatar.jpg',
        tags: [],
      }),
      assignee: {
        full_name: 'Test User',
        email: 'test@example.com',
      },
      leads: [],
      messages: [
        {
          content: 'Merhaba',
          created_at: '2026-02-08T10:00:00.000Z',
          sender_type: 'contact',
          metadata: {
            instagram_event_source: 'messaging',
          },
        },
      ],
    }

    const supabaseMock = createSupabaseMock({
      conversations: [
        createQueryBuilder({
          rangeResult: {
            data: [rawConversation],
            error: null,
          },
        }),
      ],
      messages: [
        createQueryBuilder({
          inResult: {
            data: [],
            error: null,
          },
        }),
      ],
    })

    createClientMock.mockResolvedValue(supabaseMock)

    const result = await getConversations('org-1')

    expect(result[0]?.tags).toEqual([])
  })

  it('falls back to flat queries when primary nested query fails', async () => {
    const baseConversation = createConversation()

    const supabaseMock = createSupabaseMock({
      conversations: [
        createQueryBuilder({
          rangeResult: {
            data: null,
            error: { message: 'PGRST100 nested query failed' },
          },
        }),
        createQueryBuilder({
          rangeResult: {
            data: [baseConversation],
            error: null,
          },
        }),
      ],
      messages: [
        createQueryBuilder({
          orderResult: {
            data: [
              {
                conversation_id: baseConversation.id,
                content: 'En son mesaj',
                created_at: '2026-02-08T10:00:00.000Z',
                sender_type: 'contact',
              },
            ],
            error: null,
          },
        }),
      ],
      leads: [
        createQueryBuilder({
          inResult: {
            data: [
              {
                conversation_id: baseConversation.id,
                status: 'warm',
              },
            ],
            error: null,
          },
        }),
      ],
      profiles: [
        createQueryBuilder({
          inResult: {
            data: [
              {
                id: 'profile-1',
                full_name: 'Operator One',
                email: 'operator@example.com',
              },
            ],
            error: null,
          },
        }),
      ],
    })

    createClientMock.mockResolvedValue(supabaseMock)

    const result = await getConversations('org-1')

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe(baseConversation.id)
    expect(result[0]?.messages?.[0]?.content).toBe('En son mesaj')
    expect(result[0]?.leads?.[0]?.status).toBe('warm')
    expect(result[0]?.assignee?.email).toBe('operator@example.com')
  })

  it('keeps multiple fallback preview messages so list UI can skip instagram seen events', async () => {
    const baseConversation = createConversation({
      platform: 'instagram',
      contact_phone: '1400879865404973',
      contact_name: 'togayaytemiz',
      contact_avatar_url: 'https://cdn.example.com/existing-avatar.jpg',
      assignee_id: null,
    })

    const supabaseMock = createSupabaseMock({
      conversations: [
        createQueryBuilder({
          rangeResult: {
            data: null,
            error: { message: 'PGRST100 nested query failed' },
          },
        }),
        createQueryBuilder({
          rangeResult: {
            data: [baseConversation],
            error: null,
          },
        }),
      ],
      messages: [
        createQueryBuilder({
          orderResult: {
            data: [
              {
                conversation_id: baseConversation.id,
                content: '[Instagram seen]',
                created_at: '2026-02-08T10:05:00.000Z',
                sender_type: 'contact',
                metadata: { instagram_event_type: 'seen' },
              },
              {
                conversation_id: baseConversation.id,
                content: 'Merhaba',
                created_at: '2026-02-08T10:04:00.000Z',
                sender_type: 'contact',
                metadata: { instagram_event_type: 'message' },
              },
            ],
            error: null,
          },
        }),
        createQueryBuilder({
          inResult: {
            data: [],
            error: null,
          },
        }),
      ],
      leads: [
        createQueryBuilder({
          inResult: {
            data: [],
            error: null,
          },
        }),
      ],
      profiles: [],
    })

    createClientMock.mockResolvedValue(supabaseMock)

    const result = await getConversations('org-1')

    expect(result).toHaveLength(1)
    expect(result[0]?.messages).toHaveLength(2)
    expect(result[0]?.messages?.[0]?.content).toBe('[Instagram seen]')
    expect(result[0]?.messages?.[1]?.content).toBe('Merhaba')
  })

  it('hydrates missing instagram avatar urls alongside contact names', async () => {
    const baseConversation = createConversation({
      platform: 'instagram',
      contact_phone: '1400879865404973',
      contact_name: '1400879865404973',
      contact_avatar_url: null,
      assignee_id: null,
    })
    const conversationUpdate = createConversationUpdateBuilder()
    const channelLookup = createInstagramChannelLookupBuilder('ig-token-1')

    const supabaseMock = createSupabaseMock({
      conversations: [
        createQueryBuilder({
          rangeResult: {
            data: [baseConversation],
            error: null,
          },
        }),
        conversationUpdate.builder,
      ],
      messages: [
        createQueryBuilder({
          inResult: {
            data: [],
            error: null,
          },
        }),
      ],
      channels: [channelLookup.builder],
    })

    instagramGetUserProfileMock.mockResolvedValueOnce({
      id: '1400879865404973',
      username: 'itsalinayalin',
      name: 'Alina Yalin',
      profile_picture_url: 'https://cdn.example.com/ig-avatar.jpg',
    })
    createClientMock.mockResolvedValue(supabaseMock)

    const result = await getConversations('org-1')

    expect(instagramCtorMock).toHaveBeenCalledWith('ig-token-1', 'v25.0')
    expect(instagramGetUserProfileMock).toHaveBeenCalledWith('1400879865404973')
    expect(conversationUpdate.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_name: 'itsalinayalin',
        contact_avatar_url: 'https://cdn.example.com/ig-avatar.jpg',
      })
    )
    expect(result[0]?.contact_name).toBe('itsalinayalin')
    expect(result[0]?.contact_avatar_url).toBe('https://cdn.example.com/ig-avatar.jpg')
  })

  it('starts instagram profile hydration requests in parallel so a slow profile does not block others', async () => {
    const firstConversation = createConversation({
      id: 'conv-ig-1',
      platform: 'instagram',
      contact_phone: '1400879865404973',
      contact_name: '1400879865404973',
      contact_avatar_url: null,
      assignee_id: null,
    })
    const secondConversation = createConversation({
      id: 'conv-ig-2',
      platform: 'instagram',
      contact_phone: '1400879865404974',
      contact_name: '1400879865404974',
      contact_avatar_url: null,
      assignee_id: null,
    })
    const firstConversationUpdate = createConversationUpdateBuilder()
    const secondConversationUpdate = createConversationUpdateBuilder()
    const channelLookup = createInstagramChannelLookupBuilder('ig-token-1')
    const slowProfile = createDeferredPromise<{
      id: string
      username: string
      name: string
      profile_picture_url: string
    }>()

    const supabaseMock = createSupabaseMock({
      conversations: [
        createQueryBuilder({
          rangeResult: {
            data: [firstConversation, secondConversation],
            error: null,
          },
        }),
        firstConversationUpdate.builder,
        secondConversationUpdate.builder,
      ],
      messages: [
        createQueryBuilder({
          inResult: {
            data: [],
            error: null,
          },
        }),
      ],
      channels: [channelLookup.builder],
    })

    instagramGetUserProfileMock
      .mockImplementationOnce(() => slowProfile.promise)
      .mockResolvedValueOnce({
        id: '1400879865404974',
        username: 'hizli-profil',
        name: 'Hizli Profil',
        profile_picture_url: 'https://cdn.example.com/ig-avatar-2.jpg',
      })

    createClientMock.mockResolvedValue(supabaseMock)

    const pendingConversations = getConversations('org-1')
    let waitError: unknown = null

    try {
      await vi.waitFor(() => {
        expect(instagramGetUserProfileMock).toHaveBeenCalledTimes(2)
      }, { timeout: 120 })
    } catch (error) {
      waitError = error
    } finally {
      slowProfile.resolve({
        id: '1400879865404973',
        username: 'yavas-profil',
        name: 'Yavas Profil',
        profile_picture_url: 'https://cdn.example.com/ig-avatar-1.jpg',
      })
      await pendingConversations
    }

    if (waitError) {
      throw waitError
    }
  })
})

function createConversationUpdateBuilder() {
  const eqMock = vi.fn(async () => ({ error: null }))
  const updateMock = vi.fn(() => ({ eq: eqMock }))

  return {
    builder: {
      update: updateMock,
    },
    updateMock,
  }
}

function createInstagramChannelLookupBuilder(accessToken: string) {
  const maybeSingleMock = vi.fn(async () => ({
    data: {
      config: {
        page_access_token: accessToken,
      },
      updated_at: '2026-03-11T10:00:00.000Z',
    },
    error: null,
  }))
  const limitMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
  const orderMock = vi.fn(() => ({ limit: limitMock }))
  const eqStatusMock = vi.fn(() => ({ order: orderMock }))
  const eqTypeMock = vi.fn(() => ({ eq: eqStatusMock }))
  const eqOrgMock = vi.fn(() => ({ eq: eqTypeMock }))
  const selectMock = vi.fn(() => ({ eq: eqOrgMock }))

  return {
    builder: {
      select: selectMock,
    },
  }
}

function createConversationTemplateSupabaseMock(options: {
  conversation: {
    platform: string
    contact_phone: string | null
    organization_id: string
  } | null
  channelConfig?: Record<string, unknown> | null
  rpcData?: unknown
}) {
  const conversationSingleMock = vi.fn(async () => ({
    data: options.conversation,
    error: null,
  }))
  const conversationEqMock = vi.fn(() => ({ single: conversationSingleMock }))
  const conversationSelectMock = vi.fn(() => ({ eq: conversationEqMock }))

  const channelSingleMock = vi.fn(async () => ({
    data: options.channelConfig ? { config: options.channelConfig } : null,
    error: null,
  }))
  const channelEqStatusMock = vi.fn(() => ({ single: channelSingleMock }))
  const channelEqTypeMock = vi.fn(() => ({ eq: channelEqStatusMock }))
  const channelEqOrgMock = vi.fn(() => ({ eq: channelEqTypeMock }))
  const channelSelectMock = vi.fn(() => ({ eq: channelEqOrgMock }))

  const rpcMock = vi.fn(async () => ({
    data: options.rpcData ?? {
      message: {
        id: 'msg-1',
      },
      conversation: {
        id: 'conv-1',
      },
    },
    error: null,
  }))

  const messageUpdateBuilder = createUpdateSelectSingleBuilder({
    id: 'msg-1',
    conversation_id: 'conv-1',
    sender_type: 'user',
    content: 'Template: appointment_reminder',
    metadata: {
      outbound_delivery_status: 'sent',
    },
    created_at: '2026-03-17T10:10:01.000Z',
  })

  const fromMock = vi.fn((table: string) => {
    if (table === 'conversations') {
      return {
        select: conversationSelectMock,
      }
    }

    if (table === 'channels') {
      return {
        select: channelSelectMock,
      }
    }

    if (table === 'messages') {
      return messageUpdateBuilder.builder
    }

    throw new Error(`Unexpected query for table: ${table}`)
  })

  return {
    supabase: {
      from: fromMock,
      rpc: rpcMock,
    },
    rpcMock,
    messageUpdateBuilder,
    conversationEqMock,
    channelEqOrgMock,
    channelEqTypeMock,
    channelEqStatusMock,
  }
}

describe('sendMessage durability', () => {
  beforeEach(() => {
    createClientMock.mockReset()
    assertTenantWriteAllowedMock.mockResolvedValue(undefined)
    whatsAppSendTextMock.mockReset()
    whatsAppSendTextMock.mockResolvedValue({
      messages: [{ id: 'wamid.text.1' }],
    })
  })

  it('queues a pending WhatsApp operator message before provider send and finalizes it as sent', async () => {
    const { supabase, rpcMock, messageUpdateBuilder } = createSendMessageSupabaseMock({
      latestInboundAt: '2026-03-17T10:00:00.000Z',
    })
    createClientMock.mockResolvedValueOnce(supabase)

    await sendMessage('conv-1', 'Merhaba')

    expect(rpcMock).toHaveBeenCalledWith(
      'queue_operator_message',
      expect.objectContaining({
        p_conversation_id: 'conv-1',
        p_content: 'Merhaba',
        p_metadata: expect.objectContaining({
          outbound_channel: 'whatsapp',
        }),
      })
    )
    expect(rpcMock.mock.invocationCallOrder[0]).toBeLessThan(
      whatsAppSendTextMock.mock.invocationCallOrder[0]
    )
    expect(messageUpdateBuilder.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          outbound_delivery_status: 'sent',
          outbound_channel: 'whatsapp',
          outbound_provider_message_id: 'wamid.text.1',
        }),
      })
    )
  })

  it('marks the queued WhatsApp operator message as failed when provider send fails', async () => {
    const { supabase, rpcMock, messageUpdateBuilder } = createSendMessageSupabaseMock({
      latestInboundAt: '2026-03-17T10:00:00.000Z',
    })
    createClientMock.mockResolvedValueOnce(supabase)
    whatsAppSendTextMock.mockRejectedValueOnce(new Error('provider unavailable'))

    await expect(sendMessage('conv-1', 'Merhaba')).rejects.toThrow(
      'Failed to send message to WhatsApp API'
    )

    expect(rpcMock).toHaveBeenCalledWith(
      'queue_operator_message',
      expect.objectContaining({
        p_conversation_id: 'conv-1',
        p_content: 'Merhaba',
      })
    )
    expect(messageUpdateBuilder.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          outbound_delivery_status: 'failed',
          outbound_channel: 'whatsapp',
          outbound_error_code: expect.any(String),
        }),
      })
    )
  })
})

describe('inbox WhatsApp template actions', () => {
  beforeEach(() => {
    createClientMock.mockReset()
    assertTenantWriteAllowedMock.mockResolvedValue(undefined)
    instagramSendTextMock.mockReset()
    instagramSendImageMock.mockReset()
    whatsAppSendTextMock.mockReset()
    whatsAppSendTextMock.mockResolvedValue({
      messages: [{ id: 'wamid.text.1' }],
    })
    getMessageTemplatesMock.mockResolvedValue({
      data: [
        {
          id: 'tpl-1',
          name: 'hello_world',
          status: 'APPROVED',
          language: 'en_US',
          category: 'UTILITY',
        },
      ],
    })
    sendTemplateMock.mockResolvedValue({
      messages: [{ id: 'wamid.template.1' }],
    })
  })

  it('lists WhatsApp templates for a conversation', async () => {
    const { supabase } = createConversationTemplateSupabaseMock({
      conversation: {
        platform: 'whatsapp',
        contact_phone: '905551112233',
        organization_id: 'org-1',
      },
      channelConfig: {
        permanent_access_token: 'token-1',
        business_account_id: 'waba-1',
        phone_number_id: 'phone-1',
      },
    })
    createClientMock.mockResolvedValueOnce(supabase)

    const result = await listConversationWhatsAppTemplates('conv-1')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.templates[0]?.name).toBe('hello_world')
    }
    expect(whatsAppCtorMock).toHaveBeenCalledWith('token-1')
    expect(getMessageTemplatesMock).toHaveBeenCalledWith('waba-1')
  })

  it('sends a WhatsApp template message to conversation contact', async () => {
    const { supabase, rpcMock, messageUpdateBuilder } = createConversationTemplateSupabaseMock({
      conversation: {
        platform: 'whatsapp',
        contact_phone: '905551112233',
        organization_id: 'org-1',
      },
      channelConfig: {
        permanent_access_token: 'token-1',
        business_account_id: 'waba-1',
        phone_number_id: 'phone-1',
      },
    })
    createClientMock.mockResolvedValueOnce(supabase)

    const result = await sendConversationWhatsAppTemplateMessage({
      conversationId: 'conv-1',
      templateName: 'appointment_reminder',
      languageCode: 'tr',
      bodyParameters: ['Ali'],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.messageId).toBe('wamid.template.1')
    }
    expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
    expect(sendTemplateMock).toHaveBeenCalledWith({
      phoneNumberId: 'phone-1',
      to: '905551112233',
      templateName: 'appointment_reminder',
      languageCode: 'tr',
      bodyParameters: ['Ali'],
    })
    expect(rpcMock).toHaveBeenCalledWith(
      'queue_operator_message',
      expect.objectContaining({
        p_conversation_id: 'conv-1',
        p_content: 'Template: appointment_reminder',
        p_metadata: expect.objectContaining({
          outbound_channel: 'whatsapp',
        }),
      })
    )
    expect(messageUpdateBuilder.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          outbound_delivery_status: 'sent',
          outbound_channel: 'whatsapp',
          outbound_provider_message_id: 'wamid.template.1',
        }),
      })
    )
  })

  it('marks the queued template message as failed when the provider request fails', async () => {
    const { supabase, rpcMock, messageUpdateBuilder } = createConversationTemplateSupabaseMock({
      conversation: {
        platform: 'whatsapp',
        contact_phone: '905551112233',
        organization_id: 'org-1',
      },
      channelConfig: {
        permanent_access_token: 'token-1',
        business_account_id: 'waba-1',
        phone_number_id: 'phone-1',
      },
    })
    createClientMock.mockResolvedValueOnce(supabase)
    sendTemplateMock.mockRejectedValueOnce(new Error('provider unavailable'))

    const result = await sendConversationWhatsAppTemplateMessage({
      conversationId: 'conv-1',
      templateName: 'appointment_reminder',
      languageCode: 'tr',
      bodyParameters: ['Ali'],
    })

    expect(result).toEqual({ ok: false, reason: 'request_failed' })
    expect(rpcMock).toHaveBeenCalledWith(
      'queue_operator_message',
      expect.objectContaining({
        p_conversation_id: 'conv-1',
        p_content: 'Template: appointment_reminder',
      })
    )
    expect(messageUpdateBuilder.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          outbound_delivery_status: 'failed',
          outbound_channel: 'whatsapp',
          outbound_error_code: expect.any(String),
        }),
      })
    )
  })
})

describe('inbox instagram image actions', () => {
  beforeEach(() => {
    createClientMock.mockReset()
    assertTenantWriteAllowedMock.mockResolvedValue(undefined)
    instagramSendTextMock.mockReset()
    instagramSendImageMock.mockReset()
    instagramSendImageMock.mockResolvedValue({
      message_id: 'igmid.outbound.image.1',
    })
  })

  it('sends instagram image attachments and persists instagram media metadata', async () => {
    const conversationSingleMock = vi.fn(async () => ({
      data: {
        platform: 'instagram',
        contact_phone: '17841400000000000',
        organization_id: 'org-1',
      },
      error: null,
    }))
    const conversationEqMock = vi.fn(() => ({ single: conversationSingleMock }))
    const conversationSelectMock = vi.fn(() => ({ eq: conversationEqMock }))

    const inboundCountEqSenderMock = vi.fn(async () => ({
      count: 1,
      error: null,
    }))
    const inboundCountEqConversationMock = vi.fn(() => ({ eq: inboundCountEqSenderMock }))
    const inboundCountSelectMock = vi.fn(() => ({ eq: inboundCountEqConversationMock }))

    const updatedMessageRow = {
      id: 'msg-1',
      conversation_id: 'conv-1',
      sender_type: 'user',
      content: '[Instagram image]',
      metadata: {
        instagram_outbound_status: 'sent',
      },
      created_at: '2026-03-11T10:10:01.000Z',
    }
    const messageSingleMock = vi.fn(async () => ({
      data: updatedMessageRow,
      error: null,
    }))
    const messageSelectAfterUpdateMock = vi.fn(() => ({ single: messageSingleMock }))
    const messageEqConversationIdMock = vi.fn(() => ({ select: messageSelectAfterUpdateMock }))
    const messageEqIdMock = vi.fn(() => ({ eq: messageEqConversationIdMock }))
    const messageUpdateMock = vi.fn(() => ({ eq: messageEqIdMock }))

    const channelSingleMock = vi.fn(async () => ({
      data: {
        config: {
          page_access_token: 'ig-token-1',
          instagram_business_account_id: 'ig-business-1',
        },
      },
      error: null,
    }))
    const channelEqStatusMock = vi.fn(() => ({ single: channelSingleMock }))
    const channelEqTypeMock = vi.fn(() => ({ eq: channelEqStatusMock }))
    const channelEqOrgMock = vi.fn(() => ({ eq: channelEqTypeMock }))
    const channelSelectMock = vi.fn(() => ({ eq: channelEqOrgMock }))

    const rpcMock = vi.fn(async () => ({
      data: {
        message: {
          id: 'msg-1',
        },
        conversation: {
          id: 'conv-1',
          assignee_id: 'profile-1',
        },
      },
      error: null,
    }))

    const messagesBuilders = [{ select: inboundCountSelectMock }, { update: messageUpdateMock }]

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'conversations') return { select: conversationSelectMock }
        if (table === 'messages') {
          const next = messagesBuilders.shift()
          if (!next) {
            throw new Error('Unexpected extra messages query')
          }
          return next
        }
        if (table === 'channels') return { select: channelSelectMock }
        throw new Error(`Unexpected query for table: ${table}`)
      }),
      rpc: rpcMock,
    }
    createClientMock.mockResolvedValueOnce(supabase)

    const result = await sendConversationInstagramImageBatch({
      conversationId: 'conv-1',
      text: '',
      attachments: [
        {
          id: 'ig-attachment-1',
          name: 'price-shot.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 2048,
          mediaType: 'image',
          storagePath: 'org-1/ig-business-1/outbound/price-shot.jpg',
          uploadToken: 'ignored-in-send-test',
          publicUrl: 'https://cdn.example.com/outbound/price-shot.jpg',
        },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(instagramCtorMock).toHaveBeenCalledWith('ig-token-1', undefined)
    expect(instagramSendImageMock).toHaveBeenCalledWith({
      instagramBusinessAccountId: 'ig-business-1',
      to: '17841400000000000',
      imageUrl: 'https://cdn.example.com/outbound/price-shot.jpg',
    })
    expect(rpcMock).toHaveBeenCalledWith(
      'queue_operator_message',
      expect.objectContaining({
        p_conversation_id: 'conv-1',
        p_content: '[Instagram image]',
        p_metadata: expect.objectContaining({
          outbound_channel: 'instagram',
        }),
      })
    )
    expect(messageUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          outbound_delivery_status: 'sent',
          outbound_channel: 'instagram',
          outbound_provider_message_id: 'igmid.outbound.image.1',
          instagram_message_id: 'igmid.outbound.image.1',
          instagram_media_type: 'image',
          instagram_outbound_attachment_id: 'ig-attachment-1',
          instagram_is_media_placeholder: true,
          instagram_media: expect.objectContaining({
            type: 'image',
            storage_url: 'https://cdn.example.com/outbound/price-shot.jpg',
          }),
        }),
      })
    )
  })

  it('marks the queued instagram image message as failed when provider send fails', async () => {
    instagramSendImageMock.mockRejectedValueOnce(new Error('provider unavailable'))

    const conversationSingleMock = vi.fn(async () => ({
      data: {
        platform: 'instagram',
        contact_phone: '17841400000000000',
        organization_id: 'org-1',
      },
      error: null,
    }))
    const conversationEqMock = vi.fn(() => ({ single: conversationSingleMock }))
    const conversationSelectMock = vi.fn(() => ({ eq: conversationEqMock }))

    const inboundCountEqSenderMock = vi.fn(async () => ({
      count: 1,
      error: null,
    }))
    const inboundCountEqConversationMock = vi.fn(() => ({ eq: inboundCountEqSenderMock }))
    const inboundCountSelectMock = vi.fn(() => ({ eq: inboundCountEqConversationMock }))

    const messageSingleMock = vi.fn(async () => ({
      data: {
        id: 'msg-1',
        conversation_id: 'conv-1',
        sender_type: 'user',
        content: '[Instagram image]',
        metadata: {
          outbound_delivery_status: 'failed',
        },
        created_at: '2026-03-11T10:10:01.000Z',
      },
      error: null,
    }))
    const messageSelectAfterUpdateMock = vi.fn(() => ({ single: messageSingleMock }))
    const messageEqConversationIdMock = vi.fn(() => ({ select: messageSelectAfterUpdateMock }))
    const messageEqIdMock = vi.fn(() => ({ eq: messageEqConversationIdMock }))
    const messageUpdateMock = vi.fn(() => ({ eq: messageEqIdMock }))

    const channelSingleMock = vi.fn(async () => ({
      data: {
        config: {
          page_access_token: 'ig-token-1',
          instagram_business_account_id: 'ig-business-1',
        },
      },
      error: null,
    }))
    const channelEqStatusMock = vi.fn(() => ({ single: channelSingleMock }))
    const channelEqTypeMock = vi.fn(() => ({ eq: channelEqStatusMock }))
    const channelEqOrgMock = vi.fn(() => ({ eq: channelEqTypeMock }))
    const channelSelectMock = vi.fn(() => ({ eq: channelEqOrgMock }))

    const rpcMock = vi.fn(async () => ({
      data: {
        message: {
          id: 'msg-1',
          metadata: {
            outbound_delivery_status: 'pending',
            outbound_channel: 'instagram',
          },
        },
        conversation: {
          id: 'conv-1',
          assignee_id: 'profile-1',
        },
      },
      error: null,
    }))

    const messagesBuilders = [{ select: inboundCountSelectMock }, { update: messageUpdateMock }]

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'conversations') return { select: conversationSelectMock }
        if (table === 'messages') {
          const next = messagesBuilders.shift()
          if (!next) {
            throw new Error('Unexpected extra messages query')
          }
          return next
        }
        if (table === 'channels') return { select: channelSelectMock }
        throw new Error(`Unexpected query for table: ${table}`)
      }),
      rpc: rpcMock,
    }
    createClientMock.mockResolvedValueOnce(supabase)

    const result = await sendConversationInstagramImageBatch({
      conversationId: 'conv-1',
      text: '',
      attachments: [
        {
          id: 'ig-attachment-1',
          name: 'price-shot.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 2048,
          mediaType: 'image',
          storagePath: 'org-1/ig-business-1/outbound/price-shot.jpg',
          uploadToken: 'ignored-in-send-test',
          publicUrl: 'https://cdn.example.com/outbound/price-shot.jpg',
        },
      ],
    })

    expect(result).toEqual({
      ok: false,
      reason: 'request_failed',
      attachmentId: 'ig-attachment-1',
    })
    expect(rpcMock).toHaveBeenCalledWith(
      'queue_operator_message',
      expect.objectContaining({
        p_conversation_id: 'conv-1',
        p_content: '[Instagram image]',
        p_metadata: expect.objectContaining({
          outbound_channel: 'instagram',
        }),
      })
    )
    expect(messageUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          outbound_delivery_status: 'failed',
          outbound_channel: 'instagram',
          outbound_error_code: expect.any(String),
          instagram_outbound_status: 'failed',
          instagram_outbound_attachment_id: 'ig-attachment-1',
        }),
      })
    )
  })
})

describe('inbox predefined template actions', () => {
  beforeEach(() => {
    createClientMock.mockReset()
    assertTenantWriteAllowedMock.mockResolvedValue({
      userId: 'user-1',
    })
  })

  it('lists predefined templates for a conversation organization', async () => {
    const templateRows = [
      {
        id: 'tpl-1',
        title: 'Karsilama',
        content: 'Merhaba, nasil yardimci olabilirim?',
        updated_at: '2026-02-26T09:00:00.000Z',
      },
    ]

    const conversationSingleMock = vi.fn(async () => ({
      data: {
        organization_id: 'org-1',
        platform: 'whatsapp',
        contact_phone: '905551112233',
      },
      error: null,
    }))
    const conversationEqMock = vi.fn(() => ({ single: conversationSingleMock }))
    const conversationSelectMock = vi.fn(() => ({ eq: conversationEqMock }))

    const templateOrderMock = vi.fn(async () => ({
      data: templateRows,
      error: null,
    }))
    const templateEqMock = vi.fn(() => ({ order: templateOrderMock }))
    const templateSelectMock = vi.fn(() => ({ eq: templateEqMock }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'conversations') {
          return { select: conversationSelectMock }
        }
        if (table === 'inbox_predefined_templates') {
          return { select: templateSelectMock }
        }
        throw new Error(`Unexpected query for table: ${table}`)
      }),
    }
    createClientMock.mockResolvedValueOnce(supabase)

    const result = await listConversationPredefinedTemplates('conv-1')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.templates).toEqual([
        {
          id: 'tpl-1',
          title: 'Karsilama',
          content: 'Merhaba, nasil yardimci olabilirim?',
        },
      ])
    }
  })

  it('creates a predefined template for the conversation organization', async () => {
    const insertedRow = {
      id: 'tpl-1',
      organization_id: 'org-1',
      title: 'Karsilama',
      content: 'Merhaba, nasil yardimci olabilirim?',
      created_by: 'user-1',
      updated_by: 'user-1',
      created_at: '2026-02-26T09:00:00.000Z',
      updated_at: '2026-02-26T09:00:00.000Z',
    }

    const conversationSingleMock = vi.fn(async () => ({
      data: {
        organization_id: 'org-1',
        platform: 'whatsapp',
        contact_phone: '905551112233',
      },
      error: null,
    }))
    const conversationEqMock = vi.fn(() => ({ single: conversationSingleMock }))
    const conversationSelectMock = vi.fn(() => ({ eq: conversationEqMock }))

    const templateSingleMock = vi.fn(async () => ({ data: insertedRow, error: null }))
    const templateSelectMock = vi.fn(() => ({ single: templateSingleMock }))
    const templateInsertMock = vi.fn(() => ({ select: templateSelectMock }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'conversations') {
          return { select: conversationSelectMock }
        }
        if (table === 'inbox_predefined_templates') {
          return { insert: templateInsertMock }
        }
        throw new Error(`Unexpected query for table: ${table}`)
      }),
    }
    createClientMock.mockResolvedValueOnce(supabase)

    const result = await createConversationPredefinedTemplate({
      conversationId: 'conv-1',
      title: 'Karsilama',
      content: 'Merhaba, nasil yardimci olabilirim?',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.template.title).toBe('Karsilama')
      expect(result.template.content).toContain('Merhaba')
    }
    expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
  })

  it('returns validation error for invalid predefined template payload', async () => {
    createClientMock.mockResolvedValueOnce({})

    const result = await createConversationPredefinedTemplate({
      conversationId: 'conv-1',
      title: '   ',
      content: '   ',
    })

    expect(result).toEqual({ ok: false, reason: 'validation' })
  })

  it('updates a predefined template for the conversation organization', async () => {
    const updatedRow = {
      id: 'tpl-1',
      organization_id: 'org-1',
      title: 'Guncel Karsilama',
      content: 'Yeni metin',
      created_by: 'user-1',
      updated_by: 'user-1',
      created_at: '2026-02-26T09:00:00.000Z',
      updated_at: '2026-02-26T10:00:00.000Z',
    }

    const conversationSingleMock = vi.fn(async () => ({
      data: {
        organization_id: 'org-1',
        platform: 'whatsapp',
        contact_phone: '905551112233',
      },
      error: null,
    }))
    const conversationEqMock = vi.fn(() => ({ single: conversationSingleMock }))
    const conversationSelectMock = vi.fn(() => ({ eq: conversationEqMock }))

    const templateMaybeSingleMock = vi.fn(async () => ({ data: updatedRow, error: null }))
    const templateSelectMock = vi.fn(() => ({ maybeSingle: templateMaybeSingleMock }))
    const templateEqTemplateIdMock = vi.fn(() => ({ select: templateSelectMock }))
    const templateEqOrgMock = vi.fn(() => ({ eq: templateEqTemplateIdMock }))
    const templateUpdateMock = vi.fn(() => ({ eq: templateEqOrgMock }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'conversations') {
          return { select: conversationSelectMock }
        }
        if (table === 'inbox_predefined_templates') {
          return { update: templateUpdateMock }
        }
        throw new Error(`Unexpected query for table: ${table}`)
      }),
    }
    createClientMock.mockResolvedValueOnce(supabase)

    const result = await updateConversationPredefinedTemplate({
      conversationId: 'conv-1',
      templateId: 'tpl-1',
      title: 'Guncel Karsilama',
      content: 'Yeni metin',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.template.title).toBe('Guncel Karsilama')
    }
    expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
  })

  it('deletes a predefined template for the conversation organization', async () => {
    const conversationSingleMock = vi.fn(async () => ({
      data: {
        organization_id: 'org-1',
        platform: 'whatsapp',
        contact_phone: '905551112233',
      },
      error: null,
    }))
    const conversationEqMock = vi.fn(() => ({ single: conversationSingleMock }))
    const conversationSelectMock = vi.fn(() => ({ eq: conversationEqMock }))

    const templateEqTemplateIdMock = vi.fn(async () => ({ error: null }))
    const templateEqOrgMock = vi.fn(() => ({ eq: templateEqTemplateIdMock }))
    const templateDeleteMock = vi.fn(() => ({ eq: templateEqOrgMock }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'conversations') {
          return { select: conversationSelectMock }
        }
        if (table === 'inbox_predefined_templates') {
          return { delete: templateDeleteMock }
        }
        throw new Error(`Unexpected query for table: ${table}`)
      }),
    }
    createClientMock.mockResolvedValueOnce(supabase)

    const result = await deleteConversationPredefinedTemplate({
      conversationId: 'conv-1',
      templateId: 'tpl-1',
    })

    expect(result).toEqual({ ok: true })
    expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
  })
})

function createLeadReadBuilder(lead: Lead | null) {
  const maybeSingleMock = vi.fn(async () => ({
    data: lead,
    error: null,
  }))
  const eqOrgMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
  const eqConversationMock = vi.fn(() => ({ eq: eqOrgMock }))
  const selectMock = vi.fn(() => ({ eq: eqConversationMock }))

  return {
    builder: {
      select: selectMock,
    },
  }
}

function createLeadUpdateBuilder(updatedLead: Lead | null) {
  const maybeSingleMock = vi.fn(async () => ({
    data: updatedLead,
    error: null,
  }))
  const selectMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
  const eqConversationMock = vi.fn(() => ({ select: selectMock }))
  const eqOrgMock = vi.fn(() => ({ eq: eqConversationMock }))
  const updateMock = vi.fn(() => ({ eq: eqOrgMock }))

  return {
    builder: {
      update: updateMock,
    },
    updateMock,
  }
}

function createServiceCatalogReadBuilder(items: Array<{ name: string }> = []) {
  const eqActiveMock = vi.fn(async () => ({
    data: items,
    error: null,
  }))
  const eqOrgMock = vi.fn(() => ({ eq: eqActiveMock }))
  const selectMock = vi.fn(() => ({ eq: eqOrgMock }))

  return {
    builder: {
      select: selectMock,
    },
  }
}

function createConversationReadBuilder(conversation: Record<string, unknown> | null) {
  const maybeSingleMock = vi.fn(async () => ({
    data: conversation,
    error: null,
  }))
  const eqOrgMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
  const eqConversationMock = vi.fn(() => ({ eq: eqOrgMock }))
  const selectMock = vi.fn(() => ({ eq: eqConversationMock }))

  return {
    builder: {
      select: selectMock,
    },
  }
}

function createConversationUpdateBuilderWithSelect(
  updatedConversation: Record<string, unknown> | null
) {
  const maybeSingleMock = vi.fn(async () => ({
    data: updatedConversation,
    error: null,
  }))
  const selectMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
  const eqConversationMock = vi.fn(() => ({ select: selectMock }))
  const eqOrgMock = vi.fn(() => ({ eq: eqConversationMock }))
  const updateMock = vi.fn(() => ({ eq: eqOrgMock }))

  return {
    builder: {
      update: updateMock,
    },
    updateMock,
  }
}

describe('operator workflow actions', () => {
  beforeEach(() => {
    createClientMock.mockReset()
    assertTenantWriteAllowedMock.mockResolvedValue({
      userId: 'profile-1',
    })
  })

  it('stores one required intake override and records manual metadata', async () => {
    const existingLead = createLead()
    const updatedLead = createLead({
      updated_at: '2026-03-15T10:05:00.000Z',
      extracted_fields: {
        required_intake_collected: {
          Telefon: '0555 000 00 00',
        },
        required_intake_overrides: {
          telefon: '0555 111 11 11',
        },
        required_intake_override_meta: {
          telefon: {
            updated_at: '2026-03-15T10:05:00.000Z',
            updated_by: 'profile-1',
            source: 'manual',
          },
        },
      },
    })
    const leadRead = createLeadReadBuilder(existingLead)
    const leadUpdate = createLeadUpdateBuilder(updatedLead)
    const leadBuilders = [leadRead.builder, leadUpdate.builder]

    createClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== 'leads') throw new Error(`Unexpected table: ${table}`)
        const next = leadBuilders.shift()
        if (!next) throw new Error('Unexpected extra leads query')
        return next
      }),
    })

    const result = await setConversationRequiredIntakeOverride({
      conversationId: 'conv-1',
      organizationId: 'org-1',
      field: 'Telefon',
      value: '0555 111 11 11',
      knownLeadUpdatedAt: '2026-03-15T10:00:00.000Z',
    })

    expect(result).toEqual({ ok: true, lead: updatedLead })
    expect(leadUpdate.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extracted_fields: expect.objectContaining({
          required_intake_overrides: {
            telefon: '0555 111 11 11',
          },
          required_intake_override_meta: {
            telefon: expect.objectContaining({
              updated_by: 'profile-1',
              source: 'manual',
            }),
          },
        }),
      })
    )
  })

  it('rejects important info save when the lead row changed since the panel opened', async () => {
    const leadRead = createLeadReadBuilder(
      createLead({
        updated_at: '2026-03-15T10:06:00.000Z',
      })
    )

    createClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== 'leads') throw new Error(`Unexpected table: ${table}`)
        return leadRead.builder
      }),
    })

    const result = await setConversationRequiredIntakeOverride({
      conversationId: 'conv-1',
      organizationId: 'org-1',
      field: 'Telefon',
      value: '0555 111 11 11',
      knownLeadUpdatedAt: '2026-03-15T10:00:00.000Z',
    })

    expect(result).toEqual({ ok: false, reason: 'stale_conflict' })
  })

  it('clears one override and keeps other manual fields intact', async () => {
    const existingLead = createLead({
      extracted_fields: {
        required_intake_collected: {
          Telefon: '0555 000 00 00',
          Bütçe: '15.000 TL',
        },
        required_intake_overrides: {
          telefon: '0555 111 11 11',
          butce: '20.000 TL',
        },
        required_intake_override_meta: {
          telefon: {
            updated_at: '2026-03-15T10:00:00.000Z',
            updated_by: 'profile-1',
            source: 'manual',
          },
          butce: {
            updated_at: '2026-03-15T10:01:00.000Z',
            updated_by: 'profile-2',
            source: 'manual',
          },
        },
      },
    })
    const updatedLead = createLead({
      updated_at: '2026-03-15T10:05:00.000Z',
      extracted_fields: {
        required_intake_collected: {
          Telefon: '0555 000 00 00',
          Bütçe: '15.000 TL',
        },
        required_intake_overrides: {
          butce: '20.000 TL',
        },
        required_intake_override_meta: {
          butce: {
            updated_at: '2026-03-15T10:01:00.000Z',
            updated_by: 'profile-2',
            source: 'manual',
          },
        },
      },
    })
    const leadRead = createLeadReadBuilder(existingLead)
    const leadUpdate = createLeadUpdateBuilder(updatedLead)
    const leadBuilders = [leadRead.builder, leadUpdate.builder]

    createClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== 'leads') throw new Error(`Unexpected table: ${table}`)
        const next = leadBuilders.shift()
        if (!next) throw new Error('Unexpected extra leads query')
        return next
      }),
    })

    const result = await clearConversationRequiredIntakeOverride({
      conversationId: 'conv-1',
      organizationId: 'org-1',
      field: 'Telefon',
      knownLeadUpdatedAt: '2026-03-15T10:00:00.000Z',
    })

    expect(result).toEqual({ ok: true, lead: updatedLead })
    expect(leadUpdate.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extracted_fields: expect.objectContaining({
          required_intake_overrides: {
            butce: '20.000 TL',
          },
          required_intake_override_meta: {
            butce: expect.any(Object),
          },
        }),
      })
    )
  })

  it('stores a manual service override selected from the active catalog', async () => {
    const existingLead = createLead({
      extracted_fields: {
        services: ['Yenidoğan çekimi'],
      },
    })
    const updatedLead = createLead({
      service_type: 'Hamile çekimi',
      updated_at: '2026-03-16T10:05:00.000Z',
      extracted_fields: {
        services: ['Yenidoğan çekimi'],
        service_override: 'Hamile çekimi',
        service_override_meta: {
          updated_at: '2026-03-16T10:05:00.000Z',
          updated_by: 'profile-1',
          source: 'manual',
        },
      },
    })
    const leadRead = createLeadReadBuilder(existingLead)
    const catalogRead = createServiceCatalogReadBuilder([
      { name: 'Yenidoğan çekimi' },
      { name: 'Hamile çekimi' },
    ])
    const leadUpdate = createLeadUpdateBuilder(updatedLead)
    const leadBuilders = [leadRead.builder, leadUpdate.builder]

    createClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'leads') {
          const next = leadBuilders.shift()
          if (!next) throw new Error('Unexpected extra leads query')
          return next
        }
        if (table === 'service_catalog') {
          return catalogRead.builder
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const result = await setConversationLeadServiceOverride({
      conversationId: 'conv-1',
      organizationId: 'org-1',
      service: 'Hamile çekimi',
      knownLeadUpdatedAt: '2026-03-15T10:00:00.000Z',
    })

    expect(result).toEqual({ ok: true, lead: updatedLead })
    expect(leadUpdate.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        service_type: 'Hamile çekimi',
        extracted_fields: expect.objectContaining({
          service_override: 'Hamile çekimi',
          service_override_meta: expect.objectContaining({
            updated_by: 'profile-1',
            source: 'manual',
          }),
        }),
      })
    )
  })

  it('updates conversation tags with normalized values', async () => {
    const updatedConversation = {
      id: 'conv-1',
      tags: ['VIP', 'Hot Lead'],
      updated_at: '2026-03-15T10:05:00.000Z',
    }
    const conversationUpdate = createConversationUpdateBuilderWithSelect(updatedConversation)

    createClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== 'conversations') throw new Error(`Unexpected table: ${table}`)
        return conversationUpdate.builder
      }),
    })

    const result = await updateConversationTags({
      conversationId: 'conv-1',
      organizationId: 'org-1',
      tags: [' VIP ', 'vip', 'Hot Lead'],
    })

    expect(result).toEqual({ ok: true, conversation: updatedConversation })
    expect(conversationUpdate.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ['VIP', 'Hot Lead'],
      })
    )
  })

  it('updates the shared private note and stamps editor metadata', async () => {
    const conversationRead = createConversationReadBuilder(
      createConversation({
        updated_at: '2026-03-15T10:00:00.000Z',
      })
    )
    const updatedConversation = {
      id: 'conv-1',
      private_note: 'Müşteri hafta içi 17:00 sonrası aranmalı.',
      private_note_updated_at: '2026-03-15T10:05:00.000Z',
      private_note_updated_by: 'profile-1',
      updated_at: '2026-03-15T10:05:00.000Z',
    }
    const conversationUpdate = createConversationUpdateBuilderWithSelect(updatedConversation)
    const builders = [conversationRead.builder, conversationUpdate.builder]

    createClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== 'conversations') throw new Error(`Unexpected table: ${table}`)
        const next = builders.shift()
        if (!next) throw new Error('Unexpected extra conversations query')
        return next
      }),
    })

    const result = await updateConversationPrivateNote({
      conversationId: 'conv-1',
      organizationId: 'org-1',
      note: 'Müşteri hafta içi 17:00 sonrası aranmalı.',
      knownPrivateNoteUpdatedAt: null,
    })

    expect(result).toEqual({ ok: true, conversation: updatedConversation })
    expect(conversationUpdate.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        private_note: 'Müşteri hafta içi 17:00 sonrası aranmalı.',
        private_note_updated_by: 'profile-1',
      })
    )
  })

  it('rejects private note save on stale conversation data', async () => {
    const conversationRead = createConversationReadBuilder(
      createConversation({
        private_note_updated_at: '2026-03-15T10:06:00.000Z',
      })
    )

    createClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== 'conversations') throw new Error(`Unexpected table: ${table}`)
        return conversationRead.builder
      }),
    })

    const result = await updateConversationPrivateNote({
      conversationId: 'conv-1',
      organizationId: 'org-1',
      note: 'Yeni not',
      knownPrivateNoteUpdatedAt: '2026-03-15T10:00:00.000Z',
    })

    expect(result).toEqual({ ok: false, reason: 'stale_conflict' })
  })
})

describe('setConversationAiProcessingPaused', () => {
  beforeEach(() => {
    createClientMock.mockReset()
    assertTenantWriteAllowedMock.mockResolvedValue(undefined)
  })

  it('updates pause flag and returns normalized payload', async () => {
    const singleMock = vi.fn(async () => ({
      data: {
        id: 'conv-1',
        ai_processing_paused: true,
      },
      error: null,
    }))
    const selectMock = vi.fn(() => ({ single: singleMock }))
    const eqMock = vi.fn(() => ({ select: selectMock }))
    const updateMock = vi.fn(() => ({ eq: eqMock }))
    const fromMock = vi.fn((table: string) => {
      if (table !== 'conversations') {
        throw new Error(`Unexpected query for table: ${table}`)
      }
      return {
        update: updateMock,
      }
    })

    const supabase = { from: fromMock }
    createClientMock.mockResolvedValueOnce(supabase)

    const result = await setConversationAiProcessingPaused('conv-1', true)

    expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ai_processing_paused: true,
      })
    )
    expect(eqMock).toHaveBeenCalledWith('id', 'conv-1')
    expect(selectMock).toHaveBeenCalledWith('id, ai_processing_paused')
    expect(result).toEqual({
      id: 'conv-1',
      ai_processing_paused: true,
    })
  })
})

describe('setConversationAgent', () => {
  beforeEach(() => {
    createClientMock.mockReset()
    assertTenantWriteAllowedMock.mockResolvedValue(undefined)
  })

  it('clears assignee and attention fields when switching back to bot', async () => {
    const eqMock = vi.fn(async () => ({ error: null }))
    const updateMock = vi.fn(() => ({ eq: eqMock }))
    const fromMock = vi.fn((table: string) => {
      if (table !== 'conversations') {
        throw new Error(`Unexpected query for table: ${table}`)
      }
      return { update: updateMock }
    })
    const supabase = { from: fromMock }
    createClientMock.mockResolvedValueOnce(supabase)

    const result = await setConversationAgent('conv-1', 'bot')

    expect(result).toBe(true)
    expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        active_agent: 'bot',
        assignee_id: null,
        human_attention_required: false,
        human_attention_reason: null,
        human_attention_requested_at: null,
        human_attention_resolved_at: expect.any(String),
      })
    )
  })
})
