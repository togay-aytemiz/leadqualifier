'use server'

import { resolveOrganizationUsageEntitlement } from '@/lib/billing/entitlements'
import { sortMessagesChronologically } from '@/lib/inbox/message-order'
import { createClient } from '@/lib/supabase/server'
import type { Lead, Message } from '@/types/database'

const DEFAULT_MESSAGES_PAGE_SIZE = 50
const MAX_MESSAGES_PAGE_SIZE = 100

export interface ConversationThreadPayload {
  conversationId: string
  fetchedCount: number
  hasMore: boolean
  lead: Lead | null
  messages: Message[]
}

function buildEmptyConversationThreadPayload(conversationId: string): ConversationThreadPayload {
  return {
    conversationId,
    fetchedCount: 0,
    hasMore: false,
    lead: null,
    messages: [],
  }
}

async function resolveConversationOrganizationId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  organizationIdOverride?: string | null
) {
  const normalizedOrganizationId =
    typeof organizationIdOverride === 'string' ? organizationIdOverride.trim() : ''

  if (normalizedOrganizationId) {
    return normalizedOrganizationId
  }

  const { data: conversation } = await supabase
    .from('conversations')
    .select('organization_id')
    .eq('id', conversationId)
    .maybeSingle()

  return typeof conversation?.organization_id === 'string' ? conversation.organization_id : null
}

export async function getConversationThreadPayload(
  conversationId: string,
  options?: {
    organizationId?: string | null
    offset?: number
    pageSize?: number
  }
): Promise<ConversationThreadPayload> {
  const supabase = await createClient()
  const organizationId = await resolveConversationOrganizationId(
    supabase,
    conversationId,
    options?.organizationId
  )

  if (!organizationId) {
    return buildEmptyConversationThreadPayload(conversationId)
  }

  const entitlement = await resolveOrganizationUsageEntitlement(organizationId, { supabase })
  if (!entitlement.isUsageAllowed) {
    return buildEmptyConversationThreadPayload(conversationId)
  }

  const normalizedOffset = Number.isFinite(options?.offset)
    ? Math.max(0, Math.trunc(options?.offset as number))
    : 0
  const normalizedPageSize = Number.isFinite(options?.pageSize)
    ? Math.min(MAX_MESSAGES_PAGE_SIZE, Math.max(1, Math.trunc(options?.pageSize as number)))
    : DEFAULT_MESSAGES_PAGE_SIZE
  const fetchLimit = normalizedPageSize + 1
  const rangeFrom = normalizedOffset
  const rangeTo = normalizedOffset + fetchLimit - 1

  const [{ data: messagesData, error: messagesError }, { data: leadData, error: leadError }] =
    await Promise.all([
      supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .range(rangeFrom, rangeTo),
      supabase.from('leads').select('*').eq('conversation_id', conversationId).maybeSingle(),
    ])

  if (messagesError) {
    console.error('Error fetching combined thread messages:', messagesError)
  }
  if (leadError) {
    console.error('Error fetching combined thread lead:', leadError)
  }

  const fetchedMessages = (messagesData ?? []) as Message[]
  const hasMore = fetchedMessages.length > normalizedPageSize
  const pageMessages = hasMore ? fetchedMessages.slice(0, normalizedPageSize) : fetchedMessages

  return {
    conversationId,
    fetchedCount: pageMessages.length,
    hasMore,
    lead: (leadData as Lead) ?? null,
    messages: sortMessagesChronologically(pageMessages),
  }
}
