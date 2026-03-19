'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import { withBotNamePrompt } from '@/lib/ai/prompts'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { recordAiUsage } from '@/lib/ai/usage'
import { matchesCatalog, normalizeServiceName } from '@/lib/leads/catalog'
import { runLeadExtraction } from '@/lib/leads/extraction'
import { assertTenantWriteAllowed } from '@/lib/organizations/active-context'
import { resolveOrganizationUsageEntitlement } from '@/lib/billing/entitlements'
import { resolveWhatsAppReplyWindowState } from '@/lib/whatsapp/reply-window'
import { sortMessagesChronologically } from '@/lib/inbox/message-order'
import {
  MAX_INSTAGRAM_OUTBOUND_ATTACHMENTS,
  MAX_INSTAGRAM_OUTBOUND_IMAGE_BYTES,
  MAX_WHATSAPP_OUTBOUND_ATTACHMENTS,
  MAX_WHATSAPP_OUTBOUND_DOCUMENT_BYTES,
  MAX_WHATSAPP_OUTBOUND_IMAGE_BYTES,
  resolveOutboundMediaCaption,
  validateInstagramOutboundImageAttachments,
  validateWhatsAppOutboundAttachments,
  type WhatsAppOutboundAttachment,
} from '@/lib/inbox/outbound-media'
import { resolveWhatsAppMediaPlaceholder } from '@/lib/whatsapp/media-placeholders'
import { InstagramClient } from '@/lib/instagram/client'
import { resolveConversationContactAvatarUrl } from '@/lib/inbox/contact-avatar'
import { normalizeConversationTags } from '@/lib/inbox/conversation-tags'
import { buildOutboundDeliveryMetadata } from '@/lib/inbox/outbound-delivery'
import {
  normalizeRequiredIntakeFieldKey,
  normalizeRequiredIntakeFieldValue,
  type RequiredIntakeOverrideMetaEntry,
} from '@/lib/leads/required-intake'
import { Conversation, Lead, Message, Json } from '@/types/database'

export type ConversationSummaryResult =
  | { ok: true; summary: string }
  | {
      ok: false
      reason: 'insufficient_data' | 'missing_api_key' | 'billing_locked' | 'request_failed'
    }

export type LeadScoreReasonResult =
  | { ok: true; reasoning: string }
  | { ok: false; reason: 'missing_api_key' | 'missing_lead' | 'billing_locked' | 'request_failed' }

export type LeadRefreshResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'missing_api_key'
        | 'missing_conversation'
        | 'billing_locked'
        | 'paused'
        | 'request_failed'
    }

type ImportantInfoMutationFailureReason =
  | 'missing_lead'
  | 'stale_conflict'
  | 'validation'
  | 'request_failed'

export type UpdateConversationRequiredIntakeResult =
  | { ok: true; lead: Lead }
  | { ok: false; reason: ImportantInfoMutationFailureReason }

export type UpdateConversationLeadServiceResult =
  | { ok: true; lead: Lead }
  | { ok: false; reason: ImportantInfoMutationFailureReason }

type ConversationDetailMutationFailureReason = 'stale_conflict' | 'validation' | 'request_failed'

export type UpdateConversationTagsResult =
  | { ok: true; conversation: Pick<Conversation, 'id' | 'tags' | 'updated_at'> }
  | { ok: false; reason: 'validation' | 'request_failed' }

export type UpdateConversationPrivateNoteResult =
  | {
      ok: true
      conversation: Pick<
        Conversation,
        'id' | 'private_note' | 'private_note_updated_at' | 'private_note_updated_by' | 'updated_at'
      >
    }
  | { ok: false; reason: ConversationDetailMutationFailureReason }

export interface InboxWhatsAppTemplateSummary {
  id: string | null
  name: string
  status: string | null
  language: string | null
  category: string | null
}

export interface InboxPredefinedTemplateSummary {
  id: string
  title: string
  content: string
}

type InboxPredefinedTemplateFailureReason =
  | 'validation'
  | 'missing_conversation'
  | 'missing_template'
  | 'billing_locked'
  | 'request_failed'

type InboxWhatsAppTemplateFailureReason =
  | 'validation'
  | 'missing_conversation'
  | 'not_whatsapp'
  | 'missing_contact'
  | 'missing_channel'
  | 'billing_locked'
  | 'request_failed'

export type ConversationWhatsAppTemplateListResult =
  | { ok: true; templates: InboxWhatsAppTemplateSummary[] }
  | { ok: false; reason: InboxWhatsAppTemplateFailureReason }

export interface SendConversationWhatsAppTemplateMessageInput {
  conversationId: string
  templateName: string
  languageCode: string
  bodyParameters?: string[]
}

export type SendConversationWhatsAppTemplateMessageResult =
  | { ok: true; messageId: string | null; message: Message; conversation: Conversation }
  | { ok: false; reason: InboxWhatsAppTemplateFailureReason }

export type ConversationPredefinedTemplateListResult =
  | { ok: true; templates: InboxPredefinedTemplateSummary[] }
  | { ok: false; reason: InboxPredefinedTemplateFailureReason }

export interface CreateConversationPredefinedTemplateInput {
  conversationId: string
  title: string
  content: string
}

export interface UpdateConversationPredefinedTemplateInput extends CreateConversationPredefinedTemplateInput {
  templateId: string
}

export interface DeleteConversationPredefinedTemplateInput {
  conversationId: string
  templateId: string
}

export type CreateConversationPredefinedTemplateResult =
  | { ok: true; template: InboxPredefinedTemplateSummary }
  | { ok: false; reason: InboxPredefinedTemplateFailureReason }

export type UpdateConversationPredefinedTemplateResult =
  | { ok: true; template: InboxPredefinedTemplateSummary }
  | { ok: false; reason: InboxPredefinedTemplateFailureReason }

export type DeleteConversationPredefinedTemplateResult =
  | { ok: true }
  | { ok: false; reason: InboxPredefinedTemplateFailureReason }

const INBOX_MEDIA_BUCKET =
  process.env.INBOX_MEDIA_BUCKET?.trim() ||
  process.env.WHATSAPP_MEDIA_BUCKET?.trim() ||
  'whatsapp-media'

type InboxWhatsAppMediaFailureReason =
  | InboxWhatsAppTemplateFailureReason
  | 'validation'
  | 'invalid_attachment'
  | 'too_many_attachments'
  | 'reply_blocked'
  | 'request_failed'

export interface ConversationWhatsAppOutboundAttachmentDraft {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
}

export interface ConversationWhatsAppOutboundAttachmentUploadTarget extends ConversationWhatsAppOutboundAttachmentDraft {
  mediaType: WhatsAppOutboundAttachment['mediaType']
  storagePath: string
  uploadToken: string
  publicUrl: string
}

export interface PrepareConversationWhatsAppMediaUploadsInput {
  conversationId: string
  attachments: ConversationWhatsAppOutboundAttachmentDraft[]
}

export type PrepareConversationWhatsAppMediaUploadsResult =
  | {
      ok: true
      maxAttachmentCount: number
      maxImageBytes: number
      maxDocumentBytes: number
      uploads: ConversationWhatsAppOutboundAttachmentUploadTarget[]
    }
  | {
      ok: false
      reason: InboxWhatsAppMediaFailureReason
      attachmentId?: string
      maxAllowed?: number
    }

export interface SendConversationWhatsAppMediaBatchInput {
  conversationId: string
  text: string
  attachments: ConversationWhatsAppOutboundAttachmentUploadTarget[]
}

export type SendConversationWhatsAppMediaBatchResult =
  | { ok: true; messages: Message[]; conversation: Conversation | null }
  | { ok: false; reason: InboxWhatsAppMediaFailureReason; attachmentId?: string }

type InboxInstagramMediaFailureReason =
  | 'validation'
  | 'missing_conversation'
  | 'not_instagram'
  | 'missing_contact'
  | 'missing_channel'
  | 'billing_locked'
  | 'invalid_attachment'
  | 'too_many_attachments'
  | 'missing_inbound'
  | 'request_failed'

export interface ConversationInstagramOutboundImageUploadTarget extends ConversationWhatsAppOutboundAttachmentDraft {
  mediaType: 'image'
  storagePath: string
  uploadToken: string
  publicUrl: string
}

export interface PrepareConversationInstagramImageUploadsInput {
  conversationId: string
  attachments: ConversationWhatsAppOutboundAttachmentDraft[]
}

export type PrepareConversationInstagramImageUploadsResult =
  | {
      ok: true
      maxAttachmentCount: number
      maxImageBytes: number
      uploads: ConversationInstagramOutboundImageUploadTarget[]
    }
  | {
      ok: false
      reason: InboxInstagramMediaFailureReason
      attachmentId?: string
      maxAllowed?: number
    }

export interface SendConversationInstagramImageBatchInput {
  conversationId: string
  text: string
  attachments: ConversationInstagramOutboundImageUploadTarget[]
}

export type SendConversationInstagramImageBatchResult =
  | { ok: true; messages: Message[]; conversation: Conversation | null }
  | { ok: false; reason: InboxInstagramMediaFailureReason; attachmentId?: string }

type ConversationPreviewMessage = Pick<
  Message,
  'content' | 'created_at' | 'sender_type' | 'metadata'
>
type ConversationLeadPreview = { status?: string | null }
type ConversationAssigneePreview = { full_name?: string | null; email?: string | null }
type ConversationPreviewMessageRow = Pick<
  Message,
  'conversation_id' | 'content' | 'created_at' | 'sender_type' | 'metadata'
>
type ConversationLeadPreviewRow = { conversation_id: string; status?: string | null }
type ConversationAssigneePreviewRow = {
  id: string
  full_name?: string | null
  email?: string | null
}
const CONVERSATION_PREVIEW_MESSAGE_LIMIT = 5
const SUMMARY_MAX_OUTPUT_TOKENS = 180
const LEAD_REASONING_MAX_OUTPUT_TOKENS = 220

export interface ConversationListItem extends Conversation {
  assignee?: ConversationAssigneePreview | null
  leads?: ConversationLeadPreview[]
  messages?: ConversationPreviewMessage[]
}

type MaybeArray<T> = T | T[] | null | undefined

function toArray<T>(value: MaybeArray<T>): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function toSingle<T>(value: MaybeArray<T>): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function asConfigRecord(value: Json): Record<string, Json | undefined> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value as Record<string, Json | undefined>
}

function asObjectRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeRequiredIntakeOverrides(value: unknown) {
  const normalized: Record<string, string> = {}

  for (const [key, rawValue] of Object.entries(asObjectRecord(value))) {
    const normalizedKey = normalizeRequiredIntakeFieldKey(key)
    const normalizedValue = normalizeRequiredIntakeFieldValue(rawValue)
    if (!normalizedKey || !normalizedValue) continue
    normalized[normalizedKey] = normalizedValue
  }

  return normalized
}

function normalizeRequiredIntakeOverrideMeta(value: unknown) {
  const normalized: Record<string, RequiredIntakeOverrideMetaEntry> = {}

  for (const [key, rawValue] of Object.entries(asObjectRecord(value))) {
    const normalizedKey = normalizeRequiredIntakeFieldKey(key)
    if (!normalizedKey) continue

    const record = asObjectRecord(rawValue)
    normalized[normalizedKey] = {
      updated_at: typeof record.updated_at === 'string' ? record.updated_at : null,
      updated_by: typeof record.updated_by === 'string' ? record.updated_by : null,
      source: 'manual',
    }
  }

  return normalized
}

function normalizeServiceOverrideMeta(value: unknown): RequiredIntakeOverrideMetaEntry | null {
  const record = asObjectRecord(value)
  if (Object.keys(record).length === 0) return null

  return {
    updated_at: typeof record.updated_at === 'string' ? record.updated_at : null,
    updated_by: typeof record.updated_by === 'string' ? record.updated_by : null,
    source: 'manual',
  }
}

function readConfigString(config: Json, key: string): string | null {
  const value = asConfigRecord(config)[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseMessageMetadataRecord(metadata: unknown): Record<string, unknown> | null {
  if (typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>
  }

  if (typeof metadata !== 'string') return null
  const trimmed = metadata.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return null
  }

  return null
}

function resolveInstagramPreviewEventSource(metadata: unknown): 'messaging' | 'standby' | null {
  const parsed = parseMessageMetadataRecord(metadata)
  if (!parsed) return null

  const sourceValue = readTrimmedString(parsed.instagram_event_source)
  if (sourceValue === 'messaging' || sourceValue === 'standby') return sourceValue

  const eventType = readTrimmedString(parsed.instagram_event_type)
  if (eventType === 'standby') return 'standby'

  return null
}

function isInstagramScopedId(value: string) {
  return /^\d{10,}$/.test(value)
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function extensionFromFilename(filename: string) {
  const trimmed = filename.trim()
  if (!trimmed) return null
  const lastDot = trimmed.lastIndexOf('.')
  if (lastDot < 0 || lastDot === trimmed.length - 1) return null
  const extension = trimmed.slice(lastDot + 1).toLowerCase()
  return extension.replace(/[^a-z0-9]/g, '') || null
}

function extensionFromMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('jpeg')) return 'jpg'
  if (normalized.includes('png')) return 'png'
  if (normalized.includes('webp')) return 'webp'
  if (normalized.includes('gif')) return 'gif'
  if (normalized.includes('pdf')) return 'pdf'
  if (normalized.includes('msword')) return 'doc'
  if (normalized.includes('officedocument.wordprocessingml.document')) return 'docx'
  if (normalized.includes('text/plain')) return 'txt'
  return null
}

function buildOutboundMediaStoragePath(args: {
  organizationId: string
  channelResourceId: string
  attachmentId: string
  extension: string
}) {
  const orgSegment = sanitizePathSegment(args.organizationId)
  const phoneSegment = sanitizePathSegment(args.channelResourceId)
  const fileSegment = sanitizePathSegment(
    `${Date.now()}-${args.attachmentId}-${crypto.randomUUID().slice(0, 8)}`
  )
  return `${orgSegment}/${phoneSegment}/outbound/${fileSegment}.${args.extension}`
}

function resolveInstagramImagePlaceholder() {
  return '[Instagram image]'
}

function normalizeInboxWhatsAppTemplateSummary(
  value: unknown
): InboxWhatsAppTemplateSummary | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>

  const nameValue = typeof record.name === 'string' ? record.name.trim() : ''
  if (!nameValue) return null

  const idValue = typeof record.id === 'string' ? record.id.trim() : ''
  const statusValue = typeof record.status === 'string' ? record.status.trim() : ''
  const languageValue = typeof record.language === 'string' ? record.language.trim() : ''
  const categoryValue = typeof record.category === 'string' ? record.category.trim() : ''

  return {
    id: idValue || null,
    name: nameValue,
    status: statusValue || null,
    language: languageValue || null,
    category: categoryValue || null,
  }
}

function normalizeInboxPredefinedTemplateSummary(
  value: unknown
): InboxPredefinedTemplateSummary | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>

  const idValue = typeof record.id === 'string' ? record.id.trim() : ''
  const titleValue = typeof record.title === 'string' ? record.title.trim() : ''
  const contentValue = typeof record.content === 'string' ? record.content.trim() : ''
  if (!idValue || !titleValue || !contentValue) return null

  return {
    id: idValue,
    title: titleValue,
    content: contentValue,
  }
}

async function resolveActiveInstagramChannelToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('channels')
    .select('config, updated_at')
    .eq('organization_id', organizationId)
    .eq('type', 'instagram')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return readConfigString(data.config, 'page_access_token')
}

async function hydrateInstagramConversationContactNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  conversations: ConversationListItem[]
): Promise<ConversationListItem[]> {
  const unresolved = conversations.filter((conversation) => {
    if (conversation.platform !== 'instagram') return false
    const contactId = readTrimmedString(conversation.contact_phone)
    const contactName = readTrimmedString(conversation.contact_name)
    const avatarUrl = readTrimmedString(conversation.contact_avatar_url)
    if (!contactId) return false
    const needsNameHydration = contactName
      ? isInstagramScopedId(contactId) && isInstagramScopedId(contactName)
      : false
    const needsAvatarHydration = !avatarUrl
    return needsNameHydration || needsAvatarHydration
  })

  if (unresolved.length === 0) return conversations

  const accessToken = await resolveActiveInstagramChannelToken(supabase, organizationId)
  if (!accessToken) return conversations

  const graphVersion =
    process.env.INSTAGRAM_GRAPH_API_VERSION || process.env.WHATSAPP_GRAPH_API_VERSION || 'v25.0'
  const client = new InstagramClient(accessToken, graphVersion)
  const updatedConversationProfiles = new Map<
    string,
    {
      contactName?: string
      contactAvatarUrl?: string
    }
  >()

  for (const conversation of unresolved.slice(0, 6)) {
    const contactId = readTrimmedString(conversation.contact_phone)
    if (!contactId) continue

    try {
      const profile = await client.getUserProfile(contactId)
      const resolvedName = readTrimmedString(profile.username) || readTrimmedString(profile.name)
      const avatarUrl = readTrimmedString(profile.profile_picture_url)
      const profileUpdate: {
        contactName?: string
        contactAvatarUrl?: string
      } = {}

      if (resolvedName && !isInstagramScopedId(resolvedName)) {
        profileUpdate.contactName = resolvedName
      }
      if (avatarUrl) {
        profileUpdate.contactAvatarUrl = avatarUrl
      }

      if (!profileUpdate.contactName && !profileUpdate.contactAvatarUrl) continue
      updatedConversationProfiles.set(conversation.id, profileUpdate)
    } catch {
      continue
    }
  }

  if (updatedConversationProfiles.size === 0) return conversations

  await Promise.all(
    Array.from(updatedConversationProfiles.entries()).map(([conversationId, profile]) => {
      const updatePayload: Record<string, string> = {
        updated_at: new Date().toISOString(),
      }
      if (profile.contactName) {
        updatePayload.contact_name = profile.contactName
      }
      if (profile.contactAvatarUrl) {
        updatePayload.contact_avatar_url = profile.contactAvatarUrl
      }

      return supabase.from('conversations').update(updatePayload).eq('id', conversationId)
    })
  )

  return conversations.map((conversation) => {
    const hydratedProfile = updatedConversationProfiles.get(conversation.id)
    if (!hydratedProfile) return conversation
    return {
      ...conversation,
      contact_name: hydratedProfile.contactName ?? conversation.contact_name,
      contact_avatar_url:
        hydratedProfile.contactAvatarUrl ?? conversation.contact_avatar_url ?? null,
    }
  })
}

async function annotateInstagramRequestFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  conversations: ConversationListItem[]
): Promise<ConversationListItem[]> {
  const instagramConversationIds = conversations
    .filter((conversation) => conversation.platform === 'instagram')
    .map((conversation) => conversation.id)
  if (instagramConversationIds.length === 0) return conversations

  const { data, error } = await supabase
    .from('messages')
    .select('conversation_id')
    .eq('organization_id', organizationId)
    .eq('sender_type', 'user')
    .in('conversation_id', instagramConversationIds)

  if (error) return conversations

  const outboundReplyConversationIds = new Set(
    (data ?? [])
      .map((row) => readTrimmedString((row as { conversation_id?: string }).conversation_id))
      .filter((value): value is string => Boolean(value))
  )

  return conversations.map((conversation) => {
    if (conversation.platform !== 'instagram') return conversation
    if (outboundReplyConversationIds.has(conversation.id)) return conversation

    const latestMessage = Array.isArray(conversation.messages) ? conversation.messages[0] : null
    if (!latestMessage || latestMessage.sender_type !== 'contact') return conversation
    if (resolveInstagramPreviewEventSource(latestMessage.metadata) !== 'standby') return conversation

    const tags = Array.isArray(conversation.tags)
      ? conversation.tags.filter((tag): tag is string => typeof tag === 'string')
      : []
    const hasRequestTag = tags.some((tag) => tag.toLowerCase() === 'instagram_request')
    if (hasRequestTag) return conversation

    return {
      ...conversation,
      tags: [...tags, 'instagram_request'],
    }
  })
}

async function resolveConversationOrganizationContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string
): Promise<
  { ok: true; organizationId: string } | { ok: false; reason: InboxPredefinedTemplateFailureReason }
> {
  const { data: conversation } = await supabase
    .from('conversations')
    .select('organization_id')
    .eq('id', conversationId)
    .single()

  if (!conversation) return { ok: false, reason: 'missing_conversation' }
  if (await isOrganizationWorkspaceLocked(conversation.organization_id, supabase)) {
    return { ok: false, reason: 'billing_locked' }
  }

  return {
    ok: true,
    organizationId: conversation.organization_id,
  }
}

async function resolveConversationWhatsAppContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string
): Promise<
  | {
      ok: true
      organizationId: string
      contactPhone: string
      accessToken: string
      businessAccountId: string
      phoneNumberId: string
    }
  | {
      ok: false
      reason: InboxWhatsAppTemplateFailureReason
    }
> {
  const { data: conversation } = await supabase
    .from('conversations')
    .select('platform, contact_phone, organization_id, tags')
    .eq('id', conversationId)
    .single()

  if (!conversation) return { ok: false, reason: 'missing_conversation' }
  if (conversation.platform !== 'whatsapp') return { ok: false, reason: 'not_whatsapp' }
  if (!conversation.contact_phone) return { ok: false, reason: 'missing_contact' }

  if (await isOrganizationWorkspaceLocked(conversation.organization_id, supabase)) {
    return { ok: false, reason: 'billing_locked' }
  }

  const { data: channel } = await supabase
    .from('channels')
    .select('config')
    .eq('organization_id', conversation.organization_id)
    .eq('type', 'whatsapp')
    .eq('status', 'active')
    .single()

  const accessToken = channel
    ? readConfigString(channel.config as Json, 'permanent_access_token')
    : null
  const businessAccountId = channel
    ? readConfigString(channel.config as Json, 'business_account_id')
    : null
  const phoneNumberId = channel ? readConfigString(channel.config as Json, 'phone_number_id') : null

  if (!accessToken || !businessAccountId || !phoneNumberId) {
    return { ok: false, reason: 'missing_channel' }
  }

  return {
    ok: true,
    organizationId: conversation.organization_id,
    contactPhone: conversation.contact_phone,
    accessToken,
    businessAccountId,
    phoneNumberId,
  }
}

async function resolveConversationInstagramContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string
): Promise<
  | {
      ok: true
      organizationId: string
      contactPhone: string
      accessToken: string
      instagramBusinessAccountId: string
    }
  | {
      ok: false
      reason: Exclude<
        InboxInstagramMediaFailureReason,
        'invalid_attachment' | 'too_many_attachments' | 'missing_inbound'
      >
    }
> {
  const { data: conversation } = await supabase
    .from('conversations')
    .select('platform, contact_phone, organization_id')
    .eq('id', conversationId)
    .single()

  if (!conversation) return { ok: false, reason: 'missing_conversation' }
  if (conversation.platform !== 'instagram') return { ok: false, reason: 'not_instagram' }
  if (!conversation.contact_phone) return { ok: false, reason: 'missing_contact' }

  if (await isOrganizationWorkspaceLocked(conversation.organization_id, supabase)) {
    return { ok: false, reason: 'billing_locked' }
  }

  const { data: channel } = await supabase
    .from('channels')
    .select('config')
    .eq('organization_id', conversation.organization_id)
    .eq('type', 'instagram')
    .eq('status', 'active')
    .single()

  const accessToken = channel ? readConfigString(channel.config as Json, 'page_access_token') : null
  const instagramBusinessAccountId = channel
    ? readConfigString(channel.config as Json, 'instagram_business_account_id')
    : null

  if (!accessToken || !instagramBusinessAccountId) {
    return { ok: false, reason: 'missing_channel' }
  }

  return {
    ok: true,
    organizationId: conversation.organization_id,
    contactPhone: conversation.contact_phone,
    accessToken,
    instagramBusinessAccountId,
  }
}

function normalizeConversationListItems(items: unknown[]): ConversationListItem[] {
  return items.map((item) => {
    const normalized = item as ConversationListItem & {
      assignee?: MaybeArray<ConversationAssigneePreview>
      leads?: MaybeArray<ConversationLeadPreview>
      messages?: MaybeArray<ConversationPreviewMessage>
    }

    const messages = toArray(normalized.messages)

    return {
      ...normalized,
      assignee: toSingle(normalized.assignee),
      leads: toArray(normalized.leads),
      messages,
      contact_avatar_url: resolveConversationContactAvatarUrl(
        normalized.contact_avatar_url,
        messages
      ),
    }
  })
}

function buildConversationListItemsFromFallback(
  conversations: Conversation[],
  messageRows: ConversationPreviewMessageRow[],
  leadRows: ConversationLeadPreviewRow[],
  assigneeRows: ConversationAssigneePreviewRow[]
): ConversationListItem[] {
  const messageByConversationId = new Map<string, ConversationPreviewMessage[]>()
  for (const message of messageRows) {
    const existingMessages = messageByConversationId.get(message.conversation_id) ?? []
    if (existingMessages.length >= CONVERSATION_PREVIEW_MESSAGE_LIMIT) continue

    existingMessages.push({
      content: message.content,
      created_at: message.created_at,
      sender_type: message.sender_type,
      metadata: message.metadata,
    })
    messageByConversationId.set(message.conversation_id, existingMessages)
  }

  const leadByConversationId = new Map<string, ConversationLeadPreview>()
  for (const lead of leadRows) {
    if (leadByConversationId.has(lead.conversation_id)) continue
    leadByConversationId.set(lead.conversation_id, { status: lead.status })
  }

  const assigneeById = new Map<string, ConversationAssigneePreview>()
  for (const assignee of assigneeRows) {
    assigneeById.set(assignee.id, {
      full_name: assignee.full_name,
      email: assignee.email,
    })
  }

  return conversations.map((conversation) => {
    const previewMessages = messageByConversationId.get(conversation.id) ?? []
    const lead = leadByConversationId.get(conversation.id)
    const assignee = conversation.assignee_id
      ? (assigneeById.get(conversation.assignee_id) ?? null)
      : null

    return {
      ...conversation,
      messages: previewMessages,
      leads: lead ? [lead] : [],
      assignee,
    }
  })
}

export async function getConversations(
  organizationId: string,
  page: number = 0,
  pageSize: number = 20
): Promise<ConversationListItem[]> {
  const supabase = await createClient()
  if (await isOrganizationWorkspaceLocked(organizationId, supabase)) {
    return []
  }

  const from = page * pageSize
  const to = from + pageSize - 1

  const { data, error } = await supabase
    .from('conversations')
    .select(
      `
            *,
            active_agent,
            assignee:assignee_id(
                full_name,
                email
            ),
            leads (
                status
            ),
            messages (
                content,
                created_at,
                sender_type,
                metadata
            )
        `
    )
    .eq('organization_id', organizationId)
    .order('last_message_at', { ascending: false })
    .order('created_at', { foreignTable: 'messages', ascending: false })
    .limit(CONVERSATION_PREVIEW_MESSAGE_LIMIT, { foreignTable: 'messages' })
    .limit(1, { foreignTable: 'leads' })
    .range(from, to)

  if (!error) {
    const normalized = normalizeConversationListItems((data ?? []) as unknown[])
    const withRequestFallback = await annotateInstagramRequestFallback(
      supabase,
      organizationId,
      normalized
    )
    return hydrateInstagramConversationContactNames(supabase, organizationId, withRequestFallback)
  }

  console.warn('Error fetching conversations with nested query, using fallback:', error)

  const { data: conversationRows, error: conversationError } = await supabase
    .from('conversations')
    .select('*')
    .eq('organization_id', organizationId)
    .order('last_message_at', { ascending: false })
    .range(from, to)

  if (conversationError) {
    console.error('Error fetching conversations fallback:', conversationError)
    return []
  }

  const conversations = (conversationRows ?? []) as Conversation[]
  if (conversations.length === 0) {
    return []
  }

  const conversationIds = conversations.map((conversation) => conversation.id)
  const assigneeIds = Array.from(
    new Set(
      conversations
        .map((conversation) => conversation.assignee_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    )
  )

  const [messagesResult, leadsResult, assigneesResult] = await Promise.all([
    supabase
      .from('messages')
      .select('conversation_id, content, created_at, sender_type, metadata')
      .eq('organization_id', organizationId)
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('leads')
      .select('conversation_id, status')
      .eq('organization_id', organizationId)
      .in('conversation_id', conversationIds),
    assigneeIds.length > 0
      ? supabase.from('profiles').select('id, full_name, email').in('id', assigneeIds)
      : Promise.resolve({
          data: [] as ConversationAssigneePreviewRow[],
          error: null,
        }),
  ])

  if (messagesResult.error) {
    console.warn('Failed to load conversation preview messages in fallback:', messagesResult.error)
  }
  if (leadsResult.error) {
    console.warn('Failed to load conversation lead previews in fallback:', leadsResult.error)
  }
  if (assigneesResult.error) {
    console.warn('Failed to load conversation assignees in fallback:', assigneesResult.error)
  }

  const messageRows = (messagesResult.data ?? []) as ConversationPreviewMessageRow[]
  const leadRows = (leadsResult.data ?? []) as ConversationLeadPreviewRow[]
  const assigneeRows = (assigneesResult.data ?? []) as ConversationAssigneePreviewRow[]

  const normalizedFallback = normalizeConversationListItems(
    buildConversationListItemsFromFallback(conversations, messageRows, leadRows, assigneeRows)
  )
  const withRequestFallback = await annotateInstagramRequestFallback(
    supabase,
    organizationId,
    normalizedFallback
  )
  return hydrateInstagramConversationContactNames(supabase, organizationId, withRequestFallback)
}

export async function getMessages(conversationId: string) {
  const supabase = await createClient()
  const { data: conversation } = await supabase
    .from('conversations')
    .select('organization_id')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conversation) return []
  if (await isOrganizationWorkspaceLocked(conversation.organization_id, supabase)) {
    return []
  }

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching messages:', error)
    return []
  }

  return sortMessagesChronologically((data ?? []) as Message[])
}

const DEFAULT_MESSAGES_PAGE_SIZE = 50
const MAX_MESSAGES_PAGE_SIZE = 100

export interface ConversationMessagesPageResult {
  messages: Message[]
  hasMore: boolean
  fetchedCount: number
}

export async function getMessagesPage(
  conversationId: string,
  offset: number = 0,
  pageSize: number = DEFAULT_MESSAGES_PAGE_SIZE
): Promise<ConversationMessagesPageResult> {
  const supabase = await createClient()
  const { data: conversation } = await supabase
    .from('conversations')
    .select('organization_id')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conversation) {
    return {
      messages: [],
      hasMore: false,
      fetchedCount: 0,
    }
  }
  if (await isOrganizationWorkspaceLocked(conversation.organization_id, supabase)) {
    return {
      messages: [],
      hasMore: false,
      fetchedCount: 0,
    }
  }

  const normalizedOffset = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0
  const normalizedPageSize = Number.isFinite(pageSize)
    ? Math.min(MAX_MESSAGES_PAGE_SIZE, Math.max(1, Math.trunc(pageSize)))
    : DEFAULT_MESSAGES_PAGE_SIZE
  const fetchLimit = normalizedPageSize + 1
  const rangeFrom = normalizedOffset
  const rangeTo = normalizedOffset + fetchLimit - 1

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .range(rangeFrom, rangeTo)

  if (error) {
    console.error('Error fetching paginated messages:', error)
    return {
      messages: [],
      hasMore: false,
      fetchedCount: 0,
    }
  }

  const fetchedMessages = (data ?? []) as Message[]
  const hasMore = fetchedMessages.length > normalizedPageSize
  const pageMessages = hasMore ? fetchedMessages.slice(0, normalizedPageSize) : fetchedMessages

  return {
    messages: sortMessagesChronologically(pageMessages),
    hasMore,
    fetchedCount: pageMessages.length,
  }
}

export async function getConversationLead(conversationId: string): Promise<Lead | null> {
  const supabase = await createClient()
  const { data: conversation } = await supabase
    .from('conversations')
    .select('organization_id')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conversation) return null
  if (await isOrganizationWorkspaceLocked(conversation.organization_id, supabase)) {
    return null
  }

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle()

  if (error) {
    console.error('Error fetching lead:', error)
    return null
  }

  return (data as Lead) ?? null
}

const SUMMARY_USER_LIMIT = 3
const SUMMARY_MAX_CHARS = 600

type SummaryMessage = Pick<Message, 'content' | 'created_at' | 'sender_type'>

function truncateSummaryText(text: string, maxChars: number) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`
}

function formatSummaryMessages(messages: SummaryMessage[], botName: string, locale: string) {
  const customerLabel = locale === 'tr' ? 'Müşteri' : 'Customer'
  return messages
    .map((message, index) => {
      const roleLabel = message.sender_type === 'bot' ? botName : customerLabel
      const timestamp = new Date(message.created_at).toISOString()
      const content = truncateSummaryText(message.content ?? '', SUMMARY_MAX_CHARS)
      return `${index + 1}. [${timestamp}] ${roleLabel}: ${content}`
    })
    .join('\n')
}

async function isOrganizationWorkspaceLocked(
  organizationId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const entitlement = await resolveOrganizationUsageEntitlement(organizationId, { supabase })
  return !entitlement.isUsageAllowed
}

type OperatorOutboundChannel = 'whatsapp' | 'instagram' | 'telegram'

type QueuedOperatorMessage = {
  message: Message
  conversation: Conversation
}

async function queueOperatorMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    conversationId: string
    content: string
    channel: OperatorOutboundChannel
    metadata?: Json
  }
): Promise<QueuedOperatorMessage> {
  const metadata = buildOutboundDeliveryMetadata(input.metadata, {
    outbound_channel: input.channel,
    outbound_delivery_status: 'pending',
  })
  const { data, error } = await supabase.rpc('queue_operator_message', {
    p_conversation_id: input.conversationId,
    p_content: input.content,
    p_metadata: metadata,
  })

  if (error) throw error
  if (!data) throw new Error('Failed to queue operator message')

  return data as QueuedOperatorMessage
}

async function updateQueuedOperatorMessageMetadata(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    messageId: string
    conversationId: string
    metadata: Json
  }
) {
  const { data, error } = await supabase
    .from('messages')
    .update({
      metadata: input.metadata,
    })
    .eq('id', input.messageId)
    .eq('conversation_id', input.conversationId)
    .select()
    .single()

  if (error || !data) {
    throw error ?? new Error('Failed to update queued operator message metadata')
  }

  return data as Message
}

async function finalizeQueuedOperatorMessageAsSent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    queued: QueuedOperatorMessage
    channel: OperatorOutboundChannel
    providerMessageId?: string | null
    metadata?: Json
  }
) {
  return updateQueuedOperatorMessageMetadata(supabase, {
    messageId: input.queued.message.id,
    conversationId: input.queued.message.conversation_id,
    metadata: buildOutboundDeliveryMetadata(input.metadata ?? input.queued.message.metadata, {
      outbound_channel: input.channel,
      outbound_delivery_status: 'sent',
      outbound_provider_message_id: input.providerMessageId ?? null,
      outbound_error_code: null,
    }),
  })
}

async function finalizeQueuedOperatorMessageAsFailed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    queued: QueuedOperatorMessage
    channel: OperatorOutboundChannel
    errorCode: string
    metadata?: Json
  }
) {
  return updateQueuedOperatorMessageMetadata(supabase, {
    messageId: input.queued.message.id,
    conversationId: input.queued.message.conversation_id,
    metadata: buildOutboundDeliveryMetadata(input.metadata ?? input.queued.message.metadata, {
      outbound_channel: input.channel,
      outbound_delivery_status: 'failed',
      outbound_error_code: input.errorCode,
    }),
  })
}

export async function getConversationSummary(
  conversationId: string,
  organizationId: string,
  locale: string = 'tr'
): Promise<ConversationSummaryResult> {
  const supabase = await createClient()
  const entitlement = await resolveOrganizationUsageEntitlement(organizationId, { supabase })
  if (!entitlement.isUsageAllowed) {
    return { ok: false, reason: 'billing_locked' }
  }

  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, reason: 'missing_api_key' }
  }

  const aiSettings = await getOrgAiSettings(organizationId, { supabase })

  const [contactResult, botResult] = await Promise.all([
    supabase
      .from('messages')
      .select('content, created_at, sender_type')
      .eq('conversation_id', conversationId)
      .eq('organization_id', organizationId)
      .eq('sender_type', 'contact')
      .order('created_at', { ascending: false })
      .limit(SUMMARY_USER_LIMIT),
    supabase
      .from('messages')
      .select('content, created_at, sender_type')
      .eq('conversation_id', conversationId)
      .eq('organization_id', organizationId)
      .eq('sender_type', 'bot')
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  if (contactResult.error || botResult.error) {
    console.error('Error fetching summary messages:', contactResult.error || botResult.error)
    return { ok: false, reason: 'request_failed' }
  }

  const contactMessages = (contactResult.data ?? []) as SummaryMessage[]
  const botMessage = (botResult.data ?? [])[0] as SummaryMessage | undefined

  if (contactMessages.length < SUMMARY_USER_LIMIT) {
    return { ok: false, reason: 'insufficient_data' }
  }

  const combined = botMessage
    ? [...contactMessages, botMessage]
    : [...contactMessages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )

  const formattedMessages = formatSummaryMessages(combined, aiSettings.bot_name, locale)
  const responseLanguage = locale === 'tr' ? 'Turkish' : 'English'

  try {
    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const basePrompt = [
      'You summarize only from the provided messages.',
      'Do not add facts or assumptions.',
      `Respond with a single paragraph in ${responseLanguage}, 2-3 sentences.`,
    ].join(' ')
    const systemPrompt = withBotNamePrompt(basePrompt, aiSettings.bot_name)
    const userPrompt = `Summarize the conversation using only the messages below:\n${formattedMessages}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: SUMMARY_MAX_OUTPUT_TOKENS,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })

    const usage = completion.usage
      ? {
          inputTokens: completion.usage.prompt_tokens ?? 0,
          outputTokens: completion.usage.completion_tokens ?? 0,
          totalTokens:
            completion.usage.total_tokens ??
            (completion.usage.prompt_tokens ?? 0) + (completion.usage.completion_tokens ?? 0),
        }
      : {
          inputTokens: estimateTokenCount(systemPrompt) + estimateTokenCount(userPrompt),
          outputTokens: estimateTokenCount(completion.choices[0]?.message?.content ?? ''),
          totalTokens:
            estimateTokenCount(systemPrompt) +
            estimateTokenCount(userPrompt) +
            estimateTokenCount(completion.choices[0]?.message?.content ?? ''),
        }

    await recordAiUsage({
      organizationId,
      category: 'summary',
      model: 'gpt-4o-mini',
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      metadata: {
        conversation_id: conversationId,
      },
      supabase,
    })

    const summary = completion.choices[0]?.message?.content?.trim()
    if (!summary) {
      return { ok: false, reason: 'request_failed' }
    }

    return { ok: true, summary }
  } catch (error) {
    console.error('Summary request failed:', error)
    return { ok: false, reason: 'request_failed' }
  }
}

export async function getLeadScoreReasoning(
  conversationId: string,
  organizationId: string,
  locale: string = 'tr',
  statusLabel?: string
): Promise<LeadScoreReasonResult> {
  const supabase = await createClient()
  const entitlement = await resolveOrganizationUsageEntitlement(organizationId, { supabase })
  if (!entitlement.isUsageAllowed) {
    return { ok: false, reason: 'billing_locked' }
  }

  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, reason: 'missing_api_key' }
  }

  const [{ data: lead }, { data: profile }, { data: catalog }, { data: suggestions }] =
    await Promise.all([
      supabase
        .from('leads')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('organization_id', organizationId)
        .maybeSingle(),
      supabase
        .from('offering_profiles')
        .select('summary, manual_profile_note, catalog_enabled')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      supabase
        .from('service_catalog')
        .select('name, aliases, active')
        .eq('organization_id', organizationId)
        .eq('active', true),
      supabase
        .from('offering_profile_suggestions')
        .select('content')
        .eq('organization_id', organizationId)
        .eq('status', 'approved')
        .is('archived_at', null)
        .is('update_of', null)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

  if (!lead) {
    return { ok: false, reason: 'missing_lead' }
  }

  const suggestionText = (suggestions ?? [])
    .map((item: { content?: string | null }) => `- ${item.content}`)
    .reverse()
    .join('\n')

  const catalogEnabled = profile?.catalog_enabled ?? true
  const hasCatalogMatch = catalogEnabled && matchesCatalog(lead.service_type, catalog ?? [])
  const hasProfileContent = Boolean(
    (profile?.summary ?? '').trim() || (profile?.manual_profile_note ?? '').trim() || suggestionText
  )

  const extractedFields = (lead.extracted_fields ?? {}) as {
    desired_date?: string | null
    location?: string | null
    budget_signals?: string[]
    intent_signals?: string[]
    risk_signals?: string[]
  }

  const intentSignals = Array.isArray(extractedFields.intent_signals)
    ? extractedFields.intent_signals
    : []
  const budgetSignals = Array.isArray(extractedFields.budget_signals)
    ? extractedFields.budget_signals
    : []

  const responseLanguage = locale === 'tr' ? 'Turkish' : 'English'

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const systemPrompt = [
      'You explain why the lead score has its current value.',
      'The score and status are produced by lead extraction (LLM output).',
      'Use only the provided extracted data and profile/catalog context.',
      'Do not infer facts that are not present.',
      `Respond in ${responseLanguage} with 2-4 short bullet points.`,
      statusLabel
        ? 'Use the provided status label verbatim; do not translate or use English status keys.'
        : 'Avoid English status keys.',
      'If data is missing, mention that explicitly.',
    ].join(' ')
    const userPrompt = `Score payload:\n${JSON.stringify(
      {
        score: {
          total: lead.total_score,
          status_label: statusLabel ?? null,
          status: lead.status,
        },
        service_type: lead.service_type,
        extracted_fields: {
          desired_date: extractedFields.desired_date ?? null,
          location: extractedFields.location ?? null,
          budget_signals: budgetSignals,
          intent_signals: intentSignals,
          risk_signals: extractedFields.risk_signals ?? [],
        },
        profile: {
          has_catalog_match: hasCatalogMatch,
          has_profile_content: hasProfileContent,
        },
      },
      null,
      2
    )}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: LEAD_REASONING_MAX_OUTPUT_TOKENS,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })

    const usage = completion.usage
      ? {
          inputTokens: completion.usage.prompt_tokens ?? 0,
          outputTokens: completion.usage.completion_tokens ?? 0,
          totalTokens:
            completion.usage.total_tokens ??
            (completion.usage.prompt_tokens ?? 0) + (completion.usage.completion_tokens ?? 0),
        }
      : {
          inputTokens: estimateTokenCount(systemPrompt) + estimateTokenCount(userPrompt),
          outputTokens: estimateTokenCount(completion.choices[0]?.message?.content ?? ''),
          totalTokens:
            estimateTokenCount(systemPrompt) +
            estimateTokenCount(userPrompt) +
            estimateTokenCount(completion.choices[0]?.message?.content ?? ''),
        }

    await recordAiUsage({
      organizationId,
      category: 'lead_reasoning',
      model: 'gpt-4o-mini',
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      metadata: {
        conversation_id: conversationId,
      },
      supabase,
    })

    const reasoning = completion.choices[0]?.message?.content?.trim()
    if (!reasoning) {
      return { ok: false, reason: 'request_failed' }
    }

    return { ok: true, reasoning }
  } catch (error) {
    console.error('Lead score reasoning failed:', error)
    return { ok: false, reason: 'request_failed' }
  }
}

export async function refreshConversationLead(
  conversationId: string,
  organizationId: string,
  preferredLocale?: string | null
): Promise<LeadRefreshResult> {
  const supabase = await createClient()
  const entitlement = await resolveOrganizationUsageEntitlement(organizationId, { supabase })
  if (!entitlement.isUsageAllowed) {
    return { ok: false, reason: 'billing_locked' }
  }

  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, reason: 'missing_api_key' }
  }

  try {
    await assertTenantWriteAllowed(supabase)
  } catch {
    return { ok: false, reason: 'request_failed' }
  }

  const { data: conversation, error } = await supabase
    .from('conversations')
    .select('id, ai_processing_paused')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error || !conversation) {
    return { ok: false, reason: 'missing_conversation' }
  }
  if (conversation.ai_processing_paused) {
    return { ok: false, reason: 'paused' }
  }

  try {
    await runLeadExtraction({
      organizationId,
      conversationId,
      preferredLocale: preferredLocale ?? null,
      supabase,
    })
    return { ok: true }
  } catch (error) {
    console.error('Manual lead refresh failed:', error)
    return { ok: false, reason: 'request_failed' }
  }
}

export async function markConversationRead(conversationId: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('conversations')
    .update({
      unread_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .gt('unread_count', 0)

  if (error) {
    console.error('Error marking conversation as read:', error)
  }
}

export async function sendMessage(
  conversationId: string,
  content: string
): Promise<{ message: Message; conversation: Conversation }> {
  const supabase = await createClient()
  await assertTenantWriteAllowed(supabase)

  // 1. Get conversation details to know platform and recipient
  const { data: conversation } = await supabase
    .from('conversations')
    .select('platform, contact_phone, organization_id, tags')
    .eq('id', conversationId)
    .single()

  if (!conversation) throw new Error('Conversation not found')
  if (!conversation.contact_phone) throw new Error('Conversation contact is missing')
  if (await isOrganizationWorkspaceLocked(conversation.organization_id, supabase)) {
    throw new Error('Billing workspace is locked')
  }

  if (conversation.platform === 'whatsapp') {
    const { data: latestInbound, error: latestInboundError } = await supabase
      .from('messages')
      .select('created_at')
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'contact')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestInboundError) {
      console.error('Failed to validate WhatsApp reply window:', latestInboundError)
      throw new Error('Failed to validate WhatsApp conversation state')
    }

    const replyWindowState = resolveWhatsAppReplyWindowState({
      latestInboundAt: latestInbound?.created_at ?? null,
    })
    if (!replyWindowState.canReply) {
      if (replyWindowState.reason === 'missing_inbound') {
        throw new Error(
          'WhatsApp messages can only be sent after the customer starts the conversation'
        )
      }
      throw new Error('WhatsApp free-form reply window has expired')
    }
  }

  // 2. If Telegram, send via API
  if (conversation.platform === 'telegram') {
    const { data: channel } = await supabase
      .from('channels')
      .select('config')
      .eq('organization_id', conversation.organization_id)
      .eq('type', 'telegram')
      .eq('status', 'active')
      .single()

    const botToken = channel ? readConfigString(channel.config as Json, 'bot_token') : null
    if (!botToken) throw new Error('No active Telegram channel found for this organization')

    const queued = await queueOperatorMessage(supabase, {
      conversationId,
      content,
      channel: 'telegram',
    })

    try {
      const { TelegramClient } = await import('@/lib/telegram/client')
      const client = new TelegramClient(botToken)
      await client.sendMessage(conversation.contact_phone, content)
      const message = await finalizeQueuedOperatorMessageAsSent(supabase, {
        queued,
        channel: 'telegram',
      })
      return { message, conversation: queued.conversation }
    } catch (error) {
      console.error('Failed to send Telegram message:', error)
      await finalizeQueuedOperatorMessageAsFailed(supabase, {
        queued,
        channel: 'telegram',
        errorCode: 'provider_send_failed',
      })
      throw new Error('Failed to send message to Telegram API')
    }
  }

  if (conversation.platform === 'whatsapp') {
    const { data: channel } = await supabase
      .from('channels')
      .select('config')
      .eq('organization_id', conversation.organization_id)
      .eq('type', 'whatsapp')
      .eq('status', 'active')
      .single()

    const accessToken = channel
      ? readConfigString(channel.config as Json, 'permanent_access_token')
      : null
    const phoneNumberId = channel
      ? readConfigString(channel.config as Json, 'phone_number_id')
      : null

    if (!accessToken || !phoneNumberId) {
      throw new Error('No active WhatsApp channel found for this organization')
    }

    const queued = await queueOperatorMessage(supabase, {
      conversationId,
      content,
      channel: 'whatsapp',
    })

    try {
      const { WhatsAppClient } = await import('@/lib/whatsapp/client')
      const client = new WhatsAppClient(accessToken)
      const providerResponse = await client.sendText({
        phoneNumberId,
        to: conversation.contact_phone,
        text: content,
      })
      const message = await finalizeQueuedOperatorMessageAsSent(supabase, {
        queued,
        channel: 'whatsapp',
        providerMessageId: providerResponse.messages?.[0]?.id?.trim() || null,
      })
      return { message, conversation: queued.conversation }
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error)
      await finalizeQueuedOperatorMessageAsFailed(supabase, {
        queued,
        channel: 'whatsapp',
        errorCode: 'provider_send_failed',
      })
      throw new Error('Failed to send message to WhatsApp API')
    }
  }

  if (conversation.platform === 'instagram') {
    const { count: inboundCount, error: inboundCountError } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'contact')

    if (inboundCountError) {
      console.error('Failed to validate Instagram inbound-first rule:', inboundCountError)
      throw new Error('Failed to validate Instagram conversation state')
    }
    if ((inboundCount ?? 0) < 1) {
      throw new Error(
        'Instagram messages can only be sent after the customer starts the conversation'
      )
    }

    const { data: channel } = await supabase
      .from('channels')
      .select('config')
      .eq('organization_id', conversation.organization_id)
      .eq('type', 'instagram')
      .eq('status', 'active')
      .single()

    const pageAccessToken = channel
      ? readConfigString(channel.config as Json, 'page_access_token')
      : null
    const instagramBusinessAccountId = channel
      ? readConfigString(channel.config as Json, 'instagram_business_account_id')
      : null

    if (!pageAccessToken || !instagramBusinessAccountId) {
      throw new Error('No active Instagram channel found for this organization')
    }

    const queued = await queueOperatorMessage(supabase, {
      conversationId,
      content,
      channel: 'instagram',
    })

    let response: { message: Message; conversation: Conversation } = {
      message: queued.message,
      conversation: queued.conversation,
    }

    try {
      const { InstagramClient } = await import('@/lib/instagram/client')
      const client = new InstagramClient(pageAccessToken)
      const providerResponse = await client.sendText({
        instagramBusinessAccountId,
        to: conversation.contact_phone,
        text: content,
      })
      const message = await finalizeQueuedOperatorMessageAsSent(supabase, {
        queued,
        channel: 'instagram',
        providerMessageId: providerResponse.message_id?.trim() || null,
      })
      response = {
        message,
        conversation: queued.conversation,
      }
    } catch (error) {
      console.error('Failed to send Instagram message:', error)
      await finalizeQueuedOperatorMessageAsFailed(supabase, {
        queued,
        channel: 'instagram',
        errorCode: 'provider_send_failed',
      })
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to send message to Instagram API: ${reason}`)
    }

    if (Array.isArray(conversation.tags)) {
      const normalizedTags = conversation.tags
      .filter((tag): tag is string => typeof tag === 'string')
      .map((tag) => tag.trim())
      .filter(Boolean)
      const hasRequestTag = normalizedTags.some((tag) => tag.toLowerCase() === 'instagram_request')

      if (hasRequestTag) {
        const nextTags = normalizedTags.filter((tag) => tag.toLowerCase() !== 'instagram_request')
        const { data: updatedConversation, error: updateConversationError } = await supabase
          .from('conversations')
          .update({
            tags: nextTags,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversationId)
          .select('*')
          .single()

        if (updateConversationError) {
          console.error(
            'Failed to clear instagram_request tag after outbound reply:',
            updateConversationError
          )
        } else if (updatedConversation) {
          response = {
            ...response,
            conversation: updatedConversation as Conversation,
          }
        }
      }
    }

    return response
  }

  throw new Error('Unsupported conversation platform')
}

function mapMediaContextReason(
  reason: InboxWhatsAppTemplateFailureReason
): InboxWhatsAppMediaFailureReason {
  if (reason === 'validation') return 'validation'
  if (reason === 'missing_conversation') return 'missing_conversation'
  if (reason === 'not_whatsapp') return 'not_whatsapp'
  if (reason === 'missing_contact') return 'missing_contact'
  if (reason === 'missing_channel') return 'missing_channel'
  if (reason === 'billing_locked') return 'billing_locked'
  return 'request_failed'
}

function mapInstagramMediaContextReason(
  reason: Exclude<
    InboxInstagramMediaFailureReason,
    'invalid_attachment' | 'too_many_attachments' | 'missing_inbound'
  >
): InboxInstagramMediaFailureReason {
  return reason
}

export async function prepareConversationWhatsAppMediaUploads(
  input: PrepareConversationWhatsAppMediaUploadsInput
): Promise<PrepareConversationWhatsAppMediaUploadsResult> {
  const supabase = await createClient()
  await assertTenantWriteAllowed(supabase)

  const conversationId = input.conversationId.trim()
  if (!conversationId) {
    return { ok: false, reason: 'validation' }
  }

  const draftAttachments = (input.attachments ?? []).map((attachment) => ({
    id: attachment.id.trim(),
    name: attachment.name.trim(),
    mimeType: attachment.mimeType.trim().toLowerCase(),
    sizeBytes: Number(attachment.sizeBytes),
  }))

  const validationResult = validateWhatsAppOutboundAttachments(draftAttachments)
  if (!validationResult.ok) {
    if (validationResult.reason === 'too_many_attachments') {
      return {
        ok: false,
        reason: 'too_many_attachments',
        maxAllowed: validationResult.maxCount,
      }
    }
    if (validationResult.reason === 'invalid_mime_type') {
      return {
        ok: false,
        reason: 'invalid_attachment',
        attachmentId: validationResult.attachmentId,
      }
    }
    return {
      ok: false,
      reason: 'invalid_attachment',
      attachmentId: validationResult.attachmentId,
      maxAllowed: validationResult.maxSizeBytes,
    }
  }

  if (validationResult.attachments.length === 0) {
    return { ok: false, reason: 'validation' }
  }

  const context = await resolveConversationWhatsAppContext(supabase, conversationId)
  if (!context.ok) {
    return { ok: false, reason: mapMediaContextReason(context.reason) }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing Supabase env for media upload target generation')
    return { ok: false, reason: 'request_failed' }
  }

  try {
    const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey)
    const storage = serviceClient.storage.from(INBOX_MEDIA_BUCKET)
    const uploads: ConversationWhatsAppOutboundAttachmentUploadTarget[] = []

    for (const attachment of validationResult.attachments) {
      const extension =
        extensionFromFilename(attachment.name) ||
        extensionFromMimeType(attachment.mimeType) ||
        'bin'
      const storagePath = buildOutboundMediaStoragePath({
        organizationId: context.organizationId,
        channelResourceId: context.phoneNumberId,
        attachmentId: attachment.id,
        extension,
      })

      const { data: signedUploadData, error: signedUploadError } =
        await storage.createSignedUploadUrl(storagePath)
      if (signedUploadError || !signedUploadData?.token) {
        throw signedUploadError ?? new Error('Missing signed upload token')
      }

      const { data: publicUrlData } = storage.getPublicUrl(storagePath)
      const publicUrl = publicUrlData?.publicUrl?.trim() ?? ''
      if (!publicUrl) {
        throw new Error('Could not resolve public URL for media upload')
      }

      uploads.push({
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        mediaType: attachment.mediaType,
        storagePath,
        uploadToken: signedUploadData.token,
        publicUrl,
      })
    }

    return {
      ok: true,
      maxAttachmentCount: MAX_WHATSAPP_OUTBOUND_ATTACHMENTS,
      maxImageBytes: MAX_WHATSAPP_OUTBOUND_IMAGE_BYTES,
      maxDocumentBytes: MAX_WHATSAPP_OUTBOUND_DOCUMENT_BYTES,
      uploads,
    }
  } catch (error) {
    console.error('Failed to prepare WhatsApp outbound media uploads', error)
    return { ok: false, reason: 'request_failed' }
  }
}

export async function prepareConversationInstagramImageUploads(
  input: PrepareConversationInstagramImageUploadsInput
): Promise<PrepareConversationInstagramImageUploadsResult> {
  const supabase = await createClient()
  await assertTenantWriteAllowed(supabase)

  const conversationId = input.conversationId.trim()
  if (!conversationId) {
    return { ok: false, reason: 'validation' }
  }

  const draftAttachments = (input.attachments ?? []).map((attachment) => ({
    id: attachment.id.trim(),
    name: attachment.name.trim(),
    mimeType: attachment.mimeType.trim().toLowerCase(),
    sizeBytes: Number(attachment.sizeBytes),
  }))

  const validationResult = validateInstagramOutboundImageAttachments(draftAttachments)
  if (!validationResult.ok) {
    if (validationResult.reason === 'too_many_attachments') {
      return {
        ok: false,
        reason: 'too_many_attachments',
        maxAllowed: validationResult.maxCount,
      }
    }

    return {
      ok: false,
      reason: 'invalid_attachment',
      attachmentId: validationResult.attachmentId,
      maxAllowed:
        validationResult.reason === 'file_too_large' ? validationResult.maxSizeBytes : undefined,
    }
  }

  if (validationResult.attachments.length === 0) {
    return { ok: false, reason: 'validation' }
  }

  const context = await resolveConversationInstagramContext(supabase, conversationId)
  if (!context.ok) {
    return { ok: false, reason: mapInstagramMediaContextReason(context.reason) }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing Supabase env for Instagram media upload target generation')
    return { ok: false, reason: 'request_failed' }
  }

  try {
    const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey)
    const storage = serviceClient.storage.from(INBOX_MEDIA_BUCKET)
    const uploads: ConversationInstagramOutboundImageUploadTarget[] = []

    for (const attachment of validationResult.attachments) {
      const extension =
        extensionFromFilename(attachment.name) ||
        extensionFromMimeType(attachment.mimeType) ||
        'bin'
      const storagePath = buildOutboundMediaStoragePath({
        organizationId: context.organizationId,
        channelResourceId: context.instagramBusinessAccountId,
        attachmentId: attachment.id,
        extension,
      })

      const { data: signedUploadData, error: signedUploadError } =
        await storage.createSignedUploadUrl(storagePath)
      if (signedUploadError || !signedUploadData?.token) {
        throw signedUploadError ?? new Error('Missing signed upload token')
      }

      const { data: publicUrlData } = storage.getPublicUrl(storagePath)
      const publicUrl = publicUrlData?.publicUrl?.trim() ?? ''
      if (!publicUrl) {
        throw new Error('Could not resolve public URL for Instagram media upload')
      }

      uploads.push({
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        mediaType: 'image',
        storagePath,
        uploadToken: signedUploadData.token,
        publicUrl,
      })
    }

    return {
      ok: true,
      maxAttachmentCount: MAX_INSTAGRAM_OUTBOUND_ATTACHMENTS,
      maxImageBytes: MAX_INSTAGRAM_OUTBOUND_IMAGE_BYTES,
      uploads,
    }
  } catch (error) {
    console.error('Failed to prepare Instagram outbound media uploads', error)
    return { ok: false, reason: 'request_failed' }
  }
}

export async function sendConversationWhatsAppMediaBatch(
  input: SendConversationWhatsAppMediaBatchInput
): Promise<SendConversationWhatsAppMediaBatchResult> {
  const supabase = await createClient()
  await assertTenantWriteAllowed(supabase)

  const conversationId = input.conversationId.trim()
  if (!conversationId) {
    return { ok: false, reason: 'validation' }
  }

  const normalizedText = input.text.trim()
  const normalizedAttachments = (input.attachments ?? []).map((attachment) => ({
    ...attachment,
    id: attachment.id.trim(),
    name: attachment.name.trim(),
    mimeType: attachment.mimeType.trim().toLowerCase(),
    storagePath: attachment.storagePath.trim(),
    publicUrl: attachment.publicUrl.trim(),
    sizeBytes: Number(attachment.sizeBytes),
  }))

  if (normalizedAttachments.length === 0) {
    return { ok: false, reason: 'validation' }
  }

  const validationResult = validateWhatsAppOutboundAttachments(
    normalizedAttachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    }))
  )
  if (!validationResult.ok) {
    if (validationResult.reason === 'too_many_attachments') {
      return {
        ok: false,
        reason: 'too_many_attachments',
      }
    }
    return {
      ok: false,
      reason: 'invalid_attachment',
      attachmentId: validationResult.attachmentId,
    }
  }

  const attachmentById = new Map(
    normalizedAttachments.map((attachment) => [attachment.id, attachment])
  )
  for (const attachment of normalizedAttachments) {
    if (!attachment.publicUrl || !attachment.storagePath) {
      return {
        ok: false,
        reason: 'invalid_attachment',
        attachmentId: attachment.id,
      }
    }
  }

  const context = await resolveConversationWhatsAppContext(supabase, conversationId)
  if (!context.ok) {
    return { ok: false, reason: mapMediaContextReason(context.reason) }
  }

  const { data: latestInbound, error: latestInboundError } = await supabase
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'contact')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestInboundError) {
    console.error('Failed to validate WhatsApp reply window for media send:', latestInboundError)
    return { ok: false, reason: 'request_failed' }
  }

  const replyWindowState = resolveWhatsAppReplyWindowState({
    latestInboundAt: latestInbound?.created_at ?? null,
  })
  if (!replyWindowState.canReply) {
    return { ok: false, reason: 'reply_blocked' }
  }

  const persistedMessages: Message[] = []
  let conversationSnapshot: Conversation | null = null
  let activeAttachmentId: string | undefined

  try {
    const { WhatsAppClient } = await import('@/lib/whatsapp/client')
    const client = new WhatsAppClient(context.accessToken)

    for (const [index, validatedAttachment] of validationResult.attachments.entries()) {
      activeAttachmentId = validatedAttachment.id
      const attachment = attachmentById.get(validatedAttachment.id)
      if (!attachment) {
        return {
          ok: false,
          reason: 'invalid_attachment',
          attachmentId: validatedAttachment.id,
        }
      }

      const caption = resolveOutboundMediaCaption(normalizedText, index)
      const messageContent =
        caption ?? resolveWhatsAppMediaPlaceholder(validatedAttachment.mediaType)
      const baseMetadata: Json = {
        whatsapp_message_type: validatedAttachment.mediaType,
        whatsapp_media_type: validatedAttachment.mediaType,
        whatsapp_media_mime_type: attachment.mimeType,
        whatsapp_media_caption: caption,
        whatsapp_media_filename: attachment.name,
        whatsapp_is_media_placeholder: !caption,
        whatsapp_outbound_status: 'sending',
        whatsapp_outbound_attachment_id: validatedAttachment.id,
        whatsapp_media: {
          type: validatedAttachment.mediaType,
          mime_type: attachment.mimeType,
          caption,
          filename: attachment.name,
          storage_path: attachment.storagePath,
          storage_url: attachment.publicUrl,
          download_status: 'stored',
        },
      }
      const queued = await queueOperatorMessage(supabase, {
        conversationId,
        content: messageContent,
        channel: 'whatsapp',
        metadata: baseMetadata,
      })
      conversationSnapshot = queued.conversation

      try {
        let whatsappMessageId: string | null = null
        if (validatedAttachment.mediaType === 'image') {
          const response = await client.sendImage({
            phoneNumberId: context.phoneNumberId,
            to: context.contactPhone,
            imageUrl: attachment.publicUrl,
            caption: caption ?? undefined,
          })
          whatsappMessageId = response.messages?.[0]?.id?.trim() || null
        } else {
          const response = await client.sendDocument({
            phoneNumberId: context.phoneNumberId,
            to: context.contactPhone,
            documentUrl: attachment.publicUrl,
            caption: caption ?? undefined,
            filename: attachment.name || undefined,
          })
          whatsappMessageId = response.messages?.[0]?.id?.trim() || null
        }

        const updatedMessage = await finalizeQueuedOperatorMessageAsSent(supabase, {
          queued,
          channel: 'whatsapp',
          providerMessageId: whatsappMessageId,
          metadata: {
            ...baseMetadata,
            whatsapp_message_id: whatsappMessageId,
            whatsapp_outbound_status: 'sent',
          },
        })

        persistedMessages.push(updatedMessage)
      } catch (error) {
        await finalizeQueuedOperatorMessageAsFailed(supabase, {
          queued,
          channel: 'whatsapp',
          errorCode: 'provider_send_failed',
          metadata: {
            ...baseMetadata,
            whatsapp_message_id: null,
            whatsapp_outbound_status: 'failed',
          },
        })
        throw error
      }
    }

    return {
      ok: true,
      messages: persistedMessages,
      conversation: conversationSnapshot,
    }
  } catch (error) {
    console.error('Failed to send WhatsApp media batch:', error)
    return {
      ok: false,
      reason: 'request_failed',
      attachmentId: activeAttachmentId,
    }
  }
}

export async function sendConversationInstagramImageBatch(
  input: SendConversationInstagramImageBatchInput
): Promise<SendConversationInstagramImageBatchResult> {
  const supabase = await createClient()
  await assertTenantWriteAllowed(supabase)

  const conversationId = input.conversationId.trim()
  if (!conversationId) {
    return { ok: false, reason: 'validation' }
  }

  const normalizedText = input.text.trim()
  const normalizedAttachments = (input.attachments ?? []).map((attachment) => ({
    ...attachment,
    id: attachment.id.trim(),
    name: attachment.name.trim(),
    mimeType: attachment.mimeType.trim().toLowerCase(),
    storagePath: attachment.storagePath.trim(),
    publicUrl: attachment.publicUrl.trim(),
    sizeBytes: Number(attachment.sizeBytes),
  }))

  if (normalizedAttachments.length === 0) {
    return { ok: false, reason: 'validation' }
  }

  const validationResult = validateInstagramOutboundImageAttachments(
    normalizedAttachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    }))
  )
  if (!validationResult.ok) {
    if (validationResult.reason === 'too_many_attachments') {
      return { ok: false, reason: 'too_many_attachments' }
    }

    return {
      ok: false,
      reason: 'invalid_attachment',
      attachmentId: validationResult.attachmentId,
    }
  }

  const attachmentById = new Map(
    normalizedAttachments.map((attachment) => [attachment.id, attachment])
  )
  for (const attachment of normalizedAttachments) {
    if (!attachment.publicUrl || !attachment.storagePath) {
      return {
        ok: false,
        reason: 'invalid_attachment',
        attachmentId: attachment.id,
      }
    }
  }

  const context = await resolveConversationInstagramContext(supabase, conversationId)
  if (!context.ok) {
    return { ok: false, reason: mapInstagramMediaContextReason(context.reason) }
  }

  const { count: inboundCount, error: inboundCountError } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'contact')

  if (inboundCountError) {
    console.error(
      'Failed to validate Instagram inbound-first rule for media send:',
      inboundCountError
    )
    return { ok: false, reason: 'request_failed' }
  }

  if ((inboundCount ?? 0) < 1) {
    return { ok: false, reason: 'missing_inbound' }
  }

  const persistedMessages: Message[] = []
  let conversationSnapshot: Conversation | null = null
  let activeAttachmentId: string | undefined

  try {
    const client = new InstagramClient(context.accessToken)

    for (const validatedAttachment of validationResult.attachments) {
      activeAttachmentId = validatedAttachment.id
      const attachment = attachmentById.get(validatedAttachment.id)
      if (!attachment) {
        return {
          ok: false,
          reason: 'invalid_attachment',
          attachmentId: validatedAttachment.id,
        }
      }

      const baseMetadata: Json = {
        instagram_message_type: 'image',
        instagram_media_type: 'image',
        instagram_media_mime_type: attachment.mimeType,
        instagram_media_filename: attachment.name,
        instagram_is_media_placeholder: true,
        instagram_outbound_status: 'sending',
        instagram_outbound_attachment_id: validatedAttachment.id,
        instagram_media: {
          type: 'image',
          mime_type: attachment.mimeType,
          caption: null,
          filename: attachment.name,
          storage_path: attachment.storagePath,
          storage_url: attachment.publicUrl,
          download_status: 'stored',
        },
      }
      const queued = await queueOperatorMessage(supabase, {
        conversationId,
        content: resolveInstagramImagePlaceholder(),
        channel: 'instagram',
        metadata: baseMetadata,
      })
      conversationSnapshot = queued.conversation

      try {
        const response = await client.sendImage({
          instagramBusinessAccountId: context.instagramBusinessAccountId,
          to: context.contactPhone,
          imageUrl: attachment.publicUrl,
        })
        const instagramMessageId = response.message_id?.trim() || null
        const updatedMessage = await finalizeQueuedOperatorMessageAsSent(supabase, {
          queued,
          channel: 'instagram',
          providerMessageId: instagramMessageId,
          metadata: {
            ...baseMetadata,
            instagram_message_id: instagramMessageId,
            instagram_outbound_status: 'sent',
          },
        })

        persistedMessages.push(updatedMessage)
      } catch (error) {
        await finalizeQueuedOperatorMessageAsFailed(supabase, {
          queued,
          channel: 'instagram',
          errorCode: 'provider_send_failed',
          metadata: {
            ...baseMetadata,
            instagram_message_id: null,
            instagram_outbound_status: 'failed',
          },
        })
        throw error
      }
    }

    if (normalizedText) {
      const queued = await queueOperatorMessage(supabase, {
        conversationId,
        content: normalizedText,
        channel: 'instagram',
      })
      conversationSnapshot = queued.conversation

      try {
        const textResponse = await client.sendText({
          instagramBusinessAccountId: context.instagramBusinessAccountId,
          to: context.contactPhone,
          text: normalizedText,
        })
        const instagramMessageId = textResponse.message_id?.trim() || null
        const updatedMessage = await finalizeQueuedOperatorMessageAsSent(supabase, {
          queued,
          channel: 'instagram',
          providerMessageId: instagramMessageId,
          metadata: instagramMessageId ? { instagram_message_id: instagramMessageId } : undefined,
        })

        persistedMessages.push(updatedMessage)
      } catch (error) {
        await finalizeQueuedOperatorMessageAsFailed(supabase, {
          queued,
          channel: 'instagram',
          errorCode: 'provider_send_failed',
        })
        throw error
      }
    }

    return {
      ok: true,
      messages: persistedMessages,
      conversation: conversationSnapshot,
    }
  } catch (error) {
    console.error('Failed to send Instagram image batch:', error)
    return {
      ok: false,
      reason: 'request_failed',
      attachmentId: activeAttachmentId,
    }
  }
}

export async function listConversationWhatsAppTemplates(
  conversationId: string
): Promise<ConversationWhatsAppTemplateListResult> {
  const supabase = await createClient()

  const normalizedConversationId = conversationId.trim()
  if (!normalizedConversationId) {
    return { ok: false, reason: 'validation' }
  }

  const context = await resolveConversationWhatsAppContext(supabase, normalizedConversationId)
  if (!context.ok) {
    return { ok: false, reason: context.reason }
  }

  try {
    const { WhatsAppClient } = await import('@/lib/whatsapp/client')
    const client = new WhatsAppClient(context.accessToken)
    const response = await client.getMessageTemplates(context.businessAccountId)
    const templates = (response.data ?? [])
      .map(normalizeInboxWhatsAppTemplateSummary)
      .filter((item): item is InboxWhatsAppTemplateSummary => item !== null)

    return { ok: true, templates }
  } catch (error) {
    console.error('Failed to list WhatsApp templates for conversation:', error)
    return { ok: false, reason: 'request_failed' }
  }
}

export async function listConversationPredefinedTemplates(
  conversationId: string
): Promise<ConversationPredefinedTemplateListResult> {
  const supabase = await createClient()

  const normalizedConversationId = conversationId.trim()
  if (!normalizedConversationId) {
    return { ok: false, reason: 'validation' }
  }

  const context = await resolveConversationOrganizationContext(supabase, normalizedConversationId)
  if (!context.ok) {
    return { ok: false, reason: context.reason }
  }

  const { data, error } = await supabase
    .from('inbox_predefined_templates')
    .select('id, title, content')
    .eq('organization_id', context.organizationId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Failed to list predefined templates for conversation:', error)
    return { ok: false, reason: 'request_failed' }
  }

  const templates = (data ?? [])
    .map(normalizeInboxPredefinedTemplateSummary)
    .filter((item): item is InboxPredefinedTemplateSummary => item !== null)

  return { ok: true, templates }
}

export async function createConversationPredefinedTemplate(
  input: CreateConversationPredefinedTemplateInput
): Promise<CreateConversationPredefinedTemplateResult> {
  const supabase = await createClient()
  const userContext = await assertTenantWriteAllowed(supabase)

  const conversationId = input.conversationId.trim()
  const title = input.title.trim()
  const content = input.content.trim()

  if (!conversationId || !title || !content || title.length > 80 || content.length > 2000) {
    return { ok: false, reason: 'validation' }
  }

  const context = await resolveConversationOrganizationContext(supabase, conversationId)
  if (!context.ok) {
    return { ok: false, reason: context.reason }
  }

  const { data, error } = await supabase
    .from('inbox_predefined_templates')
    .insert({
      organization_id: context.organizationId,
      title,
      content,
      created_by: userContext.userId,
      updated_by: userContext.userId,
    })
    .select('id, title, content')
    .single()

  if (error) {
    console.error('Failed to create predefined template for conversation:', error)
    return { ok: false, reason: 'request_failed' }
  }

  const template = normalizeInboxPredefinedTemplateSummary(data)
  if (!template) {
    return { ok: false, reason: 'request_failed' }
  }

  return { ok: true, template }
}

export async function updateConversationPredefinedTemplate(
  input: UpdateConversationPredefinedTemplateInput
): Promise<UpdateConversationPredefinedTemplateResult> {
  const supabase = await createClient()
  const userContext = await assertTenantWriteAllowed(supabase)

  const conversationId = input.conversationId.trim()
  const templateId = input.templateId.trim()
  const title = input.title.trim()
  const content = input.content.trim()

  if (
    !conversationId ||
    !templateId ||
    !title ||
    !content ||
    title.length > 80 ||
    content.length > 2000
  ) {
    return { ok: false, reason: 'validation' }
  }

  const context = await resolveConversationOrganizationContext(supabase, conversationId)
  if (!context.ok) {
    return { ok: false, reason: context.reason }
  }

  const { data, error } = await supabase
    .from('inbox_predefined_templates')
    .update({
      title,
      content,
      updated_by: userContext.userId,
    })
    .eq('organization_id', context.organizationId)
    .eq('id', templateId)
    .select('id, title, content')
    .maybeSingle()

  if (error) {
    console.error('Failed to update predefined template for conversation:', error)
    return { ok: false, reason: 'request_failed' }
  }
  if (!data) {
    return { ok: false, reason: 'missing_template' }
  }

  const template = normalizeInboxPredefinedTemplateSummary(data)
  if (!template) {
    return { ok: false, reason: 'request_failed' }
  }

  return { ok: true, template }
}

export async function deleteConversationPredefinedTemplate(
  input: DeleteConversationPredefinedTemplateInput
): Promise<DeleteConversationPredefinedTemplateResult> {
  const supabase = await createClient()
  await assertTenantWriteAllowed(supabase)

  const conversationId = input.conversationId.trim()
  const templateId = input.templateId.trim()

  if (!conversationId || !templateId) {
    return { ok: false, reason: 'validation' }
  }

  const context = await resolveConversationOrganizationContext(supabase, conversationId)
  if (!context.ok) {
    return { ok: false, reason: context.reason }
  }

  const { error } = await supabase
    .from('inbox_predefined_templates')
    .delete()
    .eq('organization_id', context.organizationId)
    .eq('id', templateId)

  if (error) {
    console.error('Failed to delete predefined template for conversation:', error)
    return { ok: false, reason: 'request_failed' }
  }

  return { ok: true }
}

export async function sendConversationWhatsAppTemplateMessage(
  input: SendConversationWhatsAppTemplateMessageInput
): Promise<SendConversationWhatsAppTemplateMessageResult> {
  const supabase = await createClient()
  await assertTenantWriteAllowed(supabase)

  const conversationId = input.conversationId.trim()
  const templateName = input.templateName.trim()
  const languageCode = input.languageCode.trim()
  const bodyParameters = (input.bodyParameters ?? []).map((value) => value.trim()).filter(Boolean)

  if (!conversationId || !templateName || !languageCode) {
    return { ok: false, reason: 'validation' }
  }

  const context = await resolveConversationWhatsAppContext(supabase, conversationId)
  if (!context.ok) {
    return { ok: false, reason: context.reason }
  }

  let queued: QueuedOperatorMessage | null = null
  try {
    queued = await queueOperatorMessage(supabase, {
      conversationId,
      content: `Template: ${templateName}`,
      channel: 'whatsapp',
    })

    const { WhatsAppClient } = await import('@/lib/whatsapp/client')
    const client = new WhatsAppClient(context.accessToken)
    const response = await client.sendTemplate({
      phoneNumberId: context.phoneNumberId,
      to: context.contactPhone,
      templateName,
      languageCode,
      bodyParameters,
    })

    const message = await finalizeQueuedOperatorMessageAsSent(supabase, {
      queued,
      channel: 'whatsapp',
      providerMessageId: response.messages?.[0]?.id ?? null,
    })

    return {
      ok: true,
      messageId: response.messages?.[0]?.id ?? null,
      message,
      conversation: queued.conversation,
    }
  } catch (error) {
    console.error('Failed to send WhatsApp template for conversation:', error)
    if (queued) {
      await finalizeQueuedOperatorMessageAsFailed(supabase, {
        queued,
        channel: 'whatsapp',
        errorCode: 'provider_send_failed',
      })
    }
    return { ok: false, reason: 'request_failed' }
  }
}

export async function setConversationAgent(conversationId: string, agent: 'bot' | 'operator') {
  const supabase = await createClient()
  await assertTenantWriteAllowed(supabase)

  // If switching to bot, we MUST clear the assignee_id to release the lock in webhook
  const updates: Partial<Conversation> = { active_agent: agent }
  if (agent === 'bot') {
    updates.assignee_id = null
    updates.human_attention_required = false
    updates.human_attention_reason = null
    updates.human_attention_requested_at = null
    updates.human_attention_resolved_at = new Date().toISOString()
  }

  const { error } = await supabase.from('conversations').update(updates).eq('id', conversationId)

  if (error) throw error
  return true
}

export async function setConversationAiProcessingPaused(conversationId: string, paused: boolean) {
  const supabase = await createClient()
  await assertTenantWriteAllowed(supabase)

  const { data, error } = await supabase
    .from('conversations')
    .update({
      ai_processing_paused: paused,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .select('id, ai_processing_paused')
    .single()

  if (error) throw error

  return {
    id: data.id as string,
    ai_processing_paused: Boolean(data.ai_processing_paused),
  }
}

export async function setConversationRequiredIntakeOverride(input: {
  conversationId: string
  organizationId: string
  field: string
  value: string
  knownLeadUpdatedAt: string | null
}): Promise<UpdateConversationRequiredIntakeResult> {
  const supabase = await createClient()

  let userId: string | null = null
  try {
    const context = await assertTenantWriteAllowed(supabase)
    userId = context.userId
  } catch {
    return { ok: false, reason: 'request_failed' }
  }

  const normalizedField = normalizeRequiredIntakeFieldKey(input.field)
  const normalizedValue = normalizeRequiredIntakeFieldValue(input.value)
  if (!normalizedField || !normalizedValue) {
    return { ok: false, reason: 'validation' }
  }

  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('conversation_id', input.conversationId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (error || !lead) {
    return { ok: false, reason: 'missing_lead' }
  }

  if (input.knownLeadUpdatedAt && lead.updated_at !== input.knownLeadUpdatedAt) {
    return { ok: false, reason: 'stale_conflict' }
  }

  const extractedFields = asObjectRecord(lead.extracted_fields)
  const overrides = normalizeRequiredIntakeOverrides(
    extractedFields.required_intake_overrides ?? extractedFields.manual_required_intake
  )
  const overrideMeta = normalizeRequiredIntakeOverrideMeta(
    extractedFields.required_intake_override_meta
  )
  const now = new Date().toISOString()

  overrides[normalizedField] = normalizedValue
  overrideMeta[normalizedField] = {
    updated_at: now,
    updated_by: userId,
    source: 'manual',
  }

  const { data: updatedLead, error: updateError } = await supabase
    .from('leads')
    .update({
      extracted_fields: {
        ...extractedFields,
        required_intake_overrides: overrides,
        required_intake_override_meta: overrideMeta,
      },
      updated_at: now,
    })
    .eq('organization_id', input.organizationId)
    .eq('conversation_id', input.conversationId)
    .select('*')
    .maybeSingle()

  if (updateError || !updatedLead) {
    return { ok: false, reason: 'request_failed' }
  }

  return { ok: true, lead: updatedLead as Lead }
}

export async function clearConversationRequiredIntakeOverride(input: {
  conversationId: string
  organizationId: string
  field: string
  knownLeadUpdatedAt: string | null
}): Promise<UpdateConversationRequiredIntakeResult> {
  const supabase = await createClient()

  try {
    await assertTenantWriteAllowed(supabase)
  } catch {
    return { ok: false, reason: 'request_failed' }
  }

  const normalizedField = normalizeRequiredIntakeFieldKey(input.field)
  if (!normalizedField) {
    return { ok: false, reason: 'validation' }
  }

  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('conversation_id', input.conversationId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (error || !lead) {
    return { ok: false, reason: 'missing_lead' }
  }

  if (input.knownLeadUpdatedAt && lead.updated_at !== input.knownLeadUpdatedAt) {
    return { ok: false, reason: 'stale_conflict' }
  }

  const extractedFields = asObjectRecord(lead.extracted_fields)
  const overrides = normalizeRequiredIntakeOverrides(
    extractedFields.required_intake_overrides ?? extractedFields.manual_required_intake
  )
  const overrideMeta = normalizeRequiredIntakeOverrideMeta(
    extractedFields.required_intake_override_meta
  )
  const now = new Date().toISOString()

  delete overrides[normalizedField]
  delete overrideMeta[normalizedField]

  const { data: updatedLead, error: updateError } = await supabase
    .from('leads')
    .update({
      extracted_fields: {
        ...extractedFields,
        required_intake_overrides: overrides,
        required_intake_override_meta: overrideMeta,
      },
      updated_at: now,
    })
    .eq('organization_id', input.organizationId)
    .eq('conversation_id', input.conversationId)
    .select('*')
    .maybeSingle()

  if (updateError || !updatedLead) {
    return { ok: false, reason: 'request_failed' }
  }

  return { ok: true, lead: updatedLead as Lead }
}

export async function setConversationLeadServiceOverride(input: {
  conversationId: string
  organizationId: string
  service: string
  knownLeadUpdatedAt: string | null
}): Promise<UpdateConversationLeadServiceResult> {
  const supabase = await createClient()

  let userId: string | null = null
  try {
    const context = await assertTenantWriteAllowed(supabase)
    userId = context.userId
  } catch {
    return { ok: false, reason: 'request_failed' }
  }

  const requestedService = readTrimmedString(input.service)
  if (!requestedService) {
    return { ok: false, reason: 'validation' }
  }

  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('conversation_id', input.conversationId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (error || !lead) {
    return { ok: false, reason: 'missing_lead' }
  }

  if (input.knownLeadUpdatedAt && lead.updated_at !== input.knownLeadUpdatedAt) {
    return { ok: false, reason: 'stale_conflict' }
  }

  const { data: catalogItems, error: catalogError } = await supabase
    .from('service_catalog')
    .select('name')
    .eq('organization_id', input.organizationId)
    .eq('active', true)

  if (catalogError) {
    return { ok: false, reason: 'request_failed' }
  }

  const matchedService =
    (catalogItems ?? []).find((item) => {
      const catalogName = readTrimmedString(item.name)
      return catalogName && normalizeServiceName(catalogName) === normalizeServiceName(requestedService)
    }) ?? null

  const resolvedService = readTrimmedString(matchedService?.name)
  if (!resolvedService) {
    return { ok: false, reason: 'validation' }
  }

  const extractedFields = asObjectRecord(lead.extracted_fields)
  const existingOverrideMeta = normalizeServiceOverrideMeta(extractedFields.service_override_meta)
  const now = new Date().toISOString()
  const nextOverrideMeta: RequiredIntakeOverrideMetaEntry = {
    updated_at: now,
    updated_by: userId ?? existingOverrideMeta?.updated_by ?? null,
    source: 'manual',
  }

  const { data: updatedLead, error: updateError } = await supabase
    .from('leads')
    .update({
      service_type: resolvedService,
      extracted_fields: {
        ...extractedFields,
        service_override: resolvedService,
        service_override_meta: nextOverrideMeta,
      },
      updated_at: now,
    })
    .eq('organization_id', input.organizationId)
    .eq('conversation_id', input.conversationId)
    .select('*')
    .maybeSingle()

  if (updateError || !updatedLead) {
    return { ok: false, reason: 'request_failed' }
  }

  return { ok: true, lead: updatedLead as Lead }
}

export async function clearConversationLeadServiceOverride(input: {
  conversationId: string
  organizationId: string
  knownLeadUpdatedAt: string | null
}): Promise<UpdateConversationLeadServiceResult> {
  const supabase = await createClient()

  try {
    await assertTenantWriteAllowed(supabase)
  } catch {
    return { ok: false, reason: 'request_failed' }
  }

  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('conversation_id', input.conversationId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (error || !lead) {
    return { ok: false, reason: 'missing_lead' }
  }

  if (input.knownLeadUpdatedAt && lead.updated_at !== input.knownLeadUpdatedAt) {
    return { ok: false, reason: 'stale_conflict' }
  }

  const extractedFields = asObjectRecord(lead.extracted_fields)
  const extractedServices = Array.isArray(extractedFields.services)
    ? extractedFields.services.map((service) => readTrimmedString(service)).filter(Boolean)
    : []
  const nextServiceType = extractedServices[0] ?? null
  const now = new Date().toISOString()
  const { service_override: _removedServiceOverride, service_override_meta: _removedServiceMeta, ...nextExtractedFields } =
    extractedFields

  const { data: updatedLead, error: updateError } = await supabase
    .from('leads')
    .update({
      service_type: nextServiceType,
      extracted_fields: nextExtractedFields,
      updated_at: now,
    })
    .eq('organization_id', input.organizationId)
    .eq('conversation_id', input.conversationId)
    .select('*')
    .maybeSingle()

  if (updateError || !updatedLead) {
    return { ok: false, reason: 'request_failed' }
  }

  return { ok: true, lead: updatedLead as Lead }
}

export async function updateConversationTags(input: {
  conversationId: string
  organizationId: string
  tags: string[]
}): Promise<UpdateConversationTagsResult> {
  const supabase = await createClient()

  try {
    await assertTenantWriteAllowed(supabase)
  } catch {
    return { ok: false, reason: 'request_failed' }
  }

  let normalizedTags: string[]
  try {
    normalizedTags = normalizeConversationTags(input.tags)
  } catch {
    return { ok: false, reason: 'validation' }
  }

  const { data, error } = await supabase
    .from('conversations')
    .update({
      tags: normalizedTags,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', input.organizationId)
    .eq('id', input.conversationId)
    .select('id, tags, updated_at')
    .maybeSingle()

  if (error || !data) {
    return { ok: false, reason: 'request_failed' }
  }

  return {
    ok: true,
    conversation: {
      id: data.id as string,
      tags: Array.isArray(data.tags)
        ? data.tags.filter((tag): tag is string => typeof tag === 'string')
        : [],
      updated_at: data.updated_at as string,
    },
  }
}

export async function updateConversationPrivateNote(input: {
  conversationId: string
  organizationId: string
  note: string
  knownPrivateNoteUpdatedAt: string | null
}): Promise<UpdateConversationPrivateNoteResult> {
  const supabase = await createClient()

  let userId: string | null = null
  try {
    const context = await assertTenantWriteAllowed(supabase)
    userId = context.userId
  } catch {
    return { ok: false, reason: 'request_failed' }
  }

  const normalizedNote = input.note.trim()
  if (normalizedNote.length > 2000) {
    return { ok: false, reason: 'validation' }
  }

  const { data: conversation, error } = await supabase
    .from('conversations')
    .select('id, private_note_updated_at')
    .eq('id', input.conversationId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (error || !conversation) {
    return { ok: false, reason: 'request_failed' }
  }

  const currentPrivateNoteUpdatedAt =
    typeof conversation.private_note_updated_at === 'string'
      ? conversation.private_note_updated_at
      : null

  if ((input.knownPrivateNoteUpdatedAt ?? null) !== currentPrivateNoteUpdatedAt) {
    return { ok: false, reason: 'stale_conflict' }
  }

  const now = new Date().toISOString()
  const { data, error: updateError } = await supabase
    .from('conversations')
    .update({
      private_note: normalizedNote || null,
      private_note_updated_at: now,
      private_note_updated_by: userId,
      updated_at: now,
    })
    .eq('organization_id', input.organizationId)
    .eq('id', input.conversationId)
    .select('id, private_note, private_note_updated_at, private_note_updated_by, updated_at')
    .maybeSingle()

  if (updateError || !data) {
    return { ok: false, reason: 'request_failed' }
  }

  return {
    ok: true,
    conversation: {
      id: data.id as string,
      private_note: typeof data.private_note === 'string' ? data.private_note : null,
      private_note_updated_at:
        typeof data.private_note_updated_at === 'string' ? data.private_note_updated_at : null,
      private_note_updated_by:
        typeof data.private_note_updated_by === 'string' ? data.private_note_updated_by : null,
      updated_at: data.updated_at as string,
    },
  }
}

export async function sendSystemMessage(conversationId: string, content: string) {
  const supabase = await createClient()
  await assertTenantWriteAllowed(supabase)

  // 1. Get conversation details (need org ID)
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('organization_id')
    .eq('id', conversationId)
    .single()

  if (convError || !conversation) throw new Error('Conversation not found')

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      organization_id: conversation.organization_id,
      sender_type: 'system',
      content,
    })
    .select()
    .single()

  if (error) throw error

  // Update conversation last_message_at
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  return data as Message
}

export async function deleteConversation(conversationId: string) {
  const supabase = await createClient()
  await assertTenantWriteAllowed(supabase)

  // 1. Delete messages first (if not cascading, but good practice to be explicit or if we want soft delete later)
  const { error: msgError } = await supabase
    .from('messages')
    .delete()
    .eq('conversation_id', conversationId)

  if (msgError) {
    console.error('Error deleting messages:', msgError)
    throw msgError
  }

  // 2. Delete conversation
  const { error: convError } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId)

  if (convError) {
    console.error('Error deleting conversation:', convError)
    throw convError
  }

  return true
}

export async function createMockConversation(organizationId: string) {
  const supabase = await createClient()
  await assertTenantWriteAllowed(supabase)

  // Create conversation
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .insert({
      organization_id: organizationId,
      contact_name: 'Alexandra Anholt',
      contact_phone: '+44 7700 900077',
      platform: 'whatsapp',
      status: 'open',
      last_message_at: new Date().toISOString(),
      unread_count: 1,
    })
    .select()
    .single()

  if (convError) throw convError

  // Add some messages
  await supabase.from('messages').insert([
    {
      conversation_id: conv.id,
      organization_id: organizationId,
      sender_type: 'contact',
      content:
        "Hey there, can you help me find my order? I think it should have been delivered by now but I haven't received it.",
      created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
    },
    {
      conversation_id: conv.id,
      organization_id: organizationId,
      sender_type: 'system',
      content: 'Bot started serving this conversation.',
      created_at: new Date(Date.now() - 1000 * 60 * 59).toISOString(),
    },
    {
      conversation_id: conv.id,
      organization_id: organizationId,
      sender_type: 'bot',
      content: 'Hi Alexandra! No problem let me look into this for you. What is your order number?',
      created_at: new Date(Date.now() - 1000 * 60 * 59).toISOString(),
    },
    {
      conversation_id: conv.id,
      organization_id: organizationId,
      sender_type: 'contact',
      content: 'Here you go: #004325.',
      created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    },
  ])

  return conv
}
