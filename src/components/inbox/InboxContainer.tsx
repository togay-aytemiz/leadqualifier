'use client'

import NextImage from 'next/image'
import Link from 'next/link'
import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react'
import { Avatar, EmptyState, IconButton, ConfirmDialog, Modal, Skeleton } from '@/design'
import {
  Inbox,
  ChevronDown,
  Paperclip,
  Image,
  Zap,
  Bot,
  Trash2,
  MoreHorizontal,
  LogOut,
  Mail,
  MailOpen,
  RotateCw,
  ArrowLeft,
  ArrowDown,
  CircleHelp,
  X,
  Loader2,
  FileText,
  Eye,
} from 'lucide-react'
import { FaArrowTurnDown, FaArrowTurnUp } from 'react-icons/fa6'
import { HiMiniSparkles } from 'react-icons/hi2'
import { Conversation, Lead, Message, Profile } from '@/types/database'
import {
  clearConversationRequiredIntakeOverride,
  clearConversationLeadServiceOverride,
  getMessagesPage,
  prepareConversationInstagramImageUploads,
  sendMessage,
  sendConversationInstagramImageBatch,
  prepareConversationWhatsAppMediaUploads,
  sendConversationWhatsAppMediaBatch,
  getConversations,
  deleteConversation,
  sendSystemMessage,
  setConversationAgent,
  markConversationRead,
  markConversationUnread,
  getConversationSummary,
  getConversationLead,
  getLeadScoreReasoning,
  refreshConversationLead,
  setConversationLeadServiceOverride,
  setConversationRequiredIntakeOverride,
  setConversationAiProcessingPaused,
  updateConversationPrivateNote,
  updateConversationTags,
  type ConversationListItem,
  type ConversationInstagramOutboundImageUploadTarget,
  type ConversationWhatsAppOutboundAttachmentUploadTarget,
} from '@/lib/inbox/actions'
import {
  getConversationThreadPayload,
  type ConversationThreadPayload,
} from '@/lib/inbox/thread-actions'
import { createClient } from '@/lib/supabase/client'
import { setupRealtimeAuth } from '@/lib/supabase/realtime-auth'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { resolveCollectedRequiredIntake } from '@/lib/leads/required-intake'
import { isOperatorActive } from '@/lib/inbox/operator-state'
import { resolveAssistantBanner } from '@/lib/inbox/assistant-banner'
import {
  getMobileConversationPaneClasses,
  getMobileDetailsOverlayClasses,
  getMobileDetailsPanelClasses,
  getMobileListPaneClasses,
} from '@/components/inbox/mobilePaneState'
import {
  resolveSelectedConversationUnreadCountOnIncoming,
  shouldAutoMarkConversationRead,
  shouldClearManualUnreadOnSelect,
} from '@/components/inbox/manualUnreadState'
import { resolveSummaryToggle } from '@/components/inbox/summaryPanelState'
import { shouldShowConversationSkeleton } from '@/components/inbox/conversationSwitchState'
import { cn } from '@/lib/utils'
import {
  DEFAULT_SCROLL_TO_LATEST_THRESHOLD,
  getDistanceFromBottom,
  scrollContainerToBottom,
  shouldShowScrollToLatestButton,
} from '@/components/inbox/scrollToLatest'
import { applyLeadStatusToConversationList } from '@/components/inbox/conversationLeadStatus'
import { getChannelPlatformIconSrc } from '@/lib/channels/platform-icons'
import {
  getLatestContactMessageAt,
  resolveWhatsAppReplyWindowState,
} from '@/lib/whatsapp/reply-window'
import { sortMessagesChronologically } from '@/lib/inbox/message-order'
import { parseOutboundDeliveryStatus } from '@/lib/inbox/outbound-delivery'
import { dispatchInboxUnreadUpdated } from '@/lib/inbox/unread-events'
import { WhatsAppTemplateSendModal } from '@/components/inbox/WhatsAppTemplateSendModal'
import { TemplatePickerModal } from '@/components/inbox/TemplatePickerModal'
import { formatRelativeTimeFromBase } from '@/components/inbox/relativeTime'
import { buildMessageDateSeparators } from '@/components/inbox/messageDateSeparators'
import {
  extractSkillTitleFromMetadata,
  splitBotMessageDisclaimer,
} from '@/components/inbox/botMessageContent'
import {
  collectOptimisticPreviewUrls,
  extractMediaFromMessageMetadata,
  resolveMediaPreviewLabel as resolveDirectionalMediaPreviewLabel,
  resolveMessagePreviewContent,
  resolveVisibleMessageContent,
  shouldAttemptInlineImagePreview,
} from '@/components/inbox/messageMedia'
import { buildInboxImageGalleryLookup } from '@/components/inbox/message-image-groups'
import { resolveConversationSecondaryIdentifier } from '@/components/inbox/conversationIdentity'
import {
  prependOlderMessages,
  resolveRestoredScrollTop,
  shouldLoadOlderMessages,
} from '@/components/inbox/messagePagination'
import {
  MAX_INSTAGRAM_OUTBOUND_ATTACHMENTS,
  MAX_INSTAGRAM_OUTBOUND_IMAGE_BYTES,
  MAX_WHATSAPP_OUTBOUND_ATTACHMENTS,
  MAX_WHATSAPP_OUTBOUND_DOCUMENT_BYTES,
  MAX_WHATSAPP_OUTBOUND_IMAGE_BYTES,
  resolveOutboundMediaCaption,
  validateInstagramOutboundImageAttachments,
  validateWhatsAppOutboundAttachments,
  type WhatsAppOutboundMediaType,
} from '@/lib/inbox/outbound-media'
import { resolveTranslationValue } from '@/components/inbox/translationFallback'
import {
  filterConversationsByQueue,
  summarizeConversationQueueCounts,
  type InboxQueueTab,
} from '@/components/inbox/conversationQueueFilters'
import {
  isInstagramRequestConversation,
  isInstagramRequestMessage,
  resolveInboxContactDisplayName,
} from '@/components/inbox/instagramRequestState'
import {
  filterTimelineMessagesForDateSeparators,
  isInstagramReactionEventMessage,
  isInstagramSeenEventMessage,
  resolveInstagramProviderMessageId,
  resolveInstagramReactionEvent,
  resolveInstagramReactionSummary,
  resolveLatestNonSeenPreviewMessage,
} from '@/components/inbox/instagramMessageEvents'
import {
  buildConversationPreviewMessages,
  CONVERSATION_LIST_PREVIEW_MESSAGE_LIMIT,
  mergeRealtimeConversationUpdate,
} from '@/components/inbox/conversationListState'
import { updateOrgAiSettings } from '@/lib/ai/settings'
import { resolveMainSidebarBotModeTone } from '@/design/main-sidebar-bot-mode'
import { extractSocialContactAvatarUrl } from '@/lib/inbox/contact-avatar'
import { mergeConversationTags, splitConversationTags } from '@/lib/inbox/conversation-tags'
import { resolveLeadService } from '@/lib/leads/service'
import { KualiaAvatar } from '@/components/inbox/KualiaAvatar'
import {
  resolveMessageSenderIdentity,
  type InboxSenderProfile,
} from '@/components/inbox/message-sender'
import { ImportantInfoEditor } from '@/components/inbox/ImportantInfoEditor'
import { ConversationTagsEditor } from '@/components/inbox/ConversationTagsEditor'
import {
  shouldDiscardSelectedThreadCache,
  shouldHydrateSelectedThreadFromCache,
} from '@/components/inbox/thread-payload-selection'
import { ConversationPrivateNoteEditor } from '@/components/inbox/ConversationPrivateNoteEditor'
import { LeadServiceEditor } from '@/components/inbox/LeadServiceEditor'
import { InboxDetailsSection } from '@/components/inbox/InboxDetailsSection'
import { InboxComposerActionBar } from '@/components/inbox/InboxComposerActionBar'
import { LeadRequiredInfoBlock } from '@/components/inbox/LeadRequiredInfoBlock'
import { InboxListFilterMenu } from '@/components/inbox/InboxListFilterMenu'
import {
  applyInboxListFilters,
  hasActiveInboxListFilters,
  type InboxLeadTemperatureFilter,
  type InboxUnreadFilter,
} from '@/components/inbox/conversationListFilters'
import { resolveFilteredConversationBackfillState } from '@/components/inbox/filteredConversationBackfill'
import { resolveInboxBotDisplayName } from '@/lib/ai/bot-name'

import { useTranslations, useLocale } from 'next-intl'
import type { AiBotMode } from '@/types/database'

interface InboxContainerProps {
  initialConversations: ConversationListItem[]
  initialThreadPayload?: ConversationThreadPayload | null
  initialSelectedConversationId?: string | null
  renderedAtIso: string
  organizationId: string
  botName?: string
  botMode?: AiBotMode
  allowLeadExtractionDuringOperator?: boolean
  requiredIntakeFields?: string[]
  serviceCatalogNames?: string[]
  isReadOnly?: boolean
}

type ProfileLite = Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'>
type Assignee = Pick<Profile, 'full_name' | 'email'>
type SenderProfile = InboxSenderProfile
const SUMMARY_PANEL_ID = 'conversation-summary-panel'
const INBOX_MEDIA_BUCKET = 'whatsapp-media'
const CONVERSATIONS_PAGE_SIZE = 20
const MESSAGES_PAGE_SIZE = 50
const MESSAGE_HISTORY_TOP_THRESHOLD = 96
const MOBILE_DETAILS_SECTION_SPACING_CLASSNAME = 'mt-4 border-t border-gray-100 pt-4'
const DESKTOP_DETAILS_SECTION_SPACING_CLASSNAME = 'mt-6 border-t border-gray-100 pt-6'
const WHATSAPP_UPLOAD_ACCEPT = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
].join(',')
const INSTAGRAM_UPLOAD_ACCEPT = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
].join(',')
const EMPTY_VISIBLE_MESSAGES: Message[] = []

type PendingAttachment = {
  id: string
  file: File
  name: string
  mimeType: string
  sizeBytes: number
  mediaType: WhatsAppOutboundMediaType
  previewUrl: string | null
}

type DetailsSectionKey = 'conversationInfo' | 'lead' | 'tags' | 'privateNote'

const DEFAULT_DETAILS_SECTION_STATE: Record<DetailsSectionKey, boolean> = {
  conversationInfo: true,
  lead: true,
  tags: true,
  privateNote: true,
}

function buildConversationListFilterKey(input: {
  organizationId: string
  unreadFilter: InboxUnreadFilter
  leadTemperatureFilter: InboxLeadTemperatureFilter
}) {
  return JSON.stringify(input)
}

interface InboxMessageImageProps {
  src: string
  alt: string
  frameClassName?: string
  imageClassName?: string
  overlayClassName?: string
  spinnerClassName?: string
  onLoad?: () => void
  children?: React.ReactNode
}

function InboxMessageImage({
  src,
  alt,
  frameClassName,
  imageClassName,
  overlayClassName,
  spinnerClassName,
  onLoad,
  children,
}: InboxMessageImageProps) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const isLoaded = loadedSrc === src
  const hasError = failedSrc === src

  return (
    <div className={cn('relative overflow-hidden', frameClassName)}>
      {!isLoaded && !hasError && (
        <div className={cn('absolute inset-0 flex items-center justify-center', overlayClassName)}>
          <span
            className={cn(
              'h-6 w-6 animate-spin rounded-full border-2 border-gray-300/80 border-t-gray-600',
              spinnerClassName
            )}
          />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={cn(
          'h-full w-full transition-opacity duration-200',
          !isLoaded && !hasError ? 'opacity-0' : 'opacity-100',
          imageClassName
        )}
        loading="lazy"
        onLoad={() => {
          setLoadedSrc(src)
          onLoad?.()
        }}
        onError={() => {
          setFailedSrc(src)
        }}
      />
      {children}
    </div>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseMessageMetadataRecord(metadata: unknown) {
  if (isRecord(metadata)) return metadata
  if (typeof metadata !== 'string') return null
  const trimmed = metadata.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function extractOutboundAttachmentId(metadata: unknown) {
  const parsed = parseMessageMetadataRecord(metadata)
  if (!parsed) return null
  const value = parsed.whatsapp_outbound_attachment_id ?? parsed.instagram_outbound_attachment_id
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveOutboundDeliveryState(metadata: unknown): 'sending' | 'failed' | null {
  const parsed = parseMessageMetadataRecord(metadata)
  if (!parsed) return null
  const value = parseOutboundDeliveryStatus(parsed)
  if (value === 'pending') return 'sending'
  if (value === 'failed') return 'failed'
  return null
}

function makePendingAttachmentId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function extractImageFilesFromClipboard(event: React.ClipboardEvent<HTMLTextAreaElement>) {
  const items = Array.from(event.clipboardData?.items ?? [])
  return items
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
}

export function InboxContainer({
  initialConversations,
  initialThreadPayload = null,
  initialSelectedConversationId = null,
  renderedAtIso,
  organizationId,
  botName,
  botMode,
  allowLeadExtractionDuringOperator,
  requiredIntakeFields = [],
  serviceCatalogNames = [],
  isReadOnly = false,
}: InboxContainerProps) {
  const t = useTranslations('inbox')
  const tSidebar = useTranslations('mainSidebar')
  const tAiSettings = useTranslations('aiSettings')
  const locale = useLocale()
  const displayedBotName = resolveInboxBotDisplayName(botName, t('copilot'))
  const dateLocale = locale === 'tr' ? tr : undefined
  const initialSelectedConversationIdValue =
    initialSelectedConversationId ??
    initialThreadPayload?.conversationId ?? initialConversations[0]?.id ?? null
  const [conversations, setConversations] = useState<ConversationListItem[]>(initialConversations)
  const [relativeTimeBaseDate, setRelativeTimeBaseDate] = useState<Date>(() => {
    const parsed = new Date(renderedAtIso)
    return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed
  })
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedConversationIdValue)
  const [messages, setMessages] = useState<Message[]>(() => initialThreadPayload?.messages ?? [])
  const [messageOffset, setMessageOffset] = useState(() => initialThreadPayload?.fetchedCount ?? 0)
  const [hasMoreMessageHistory, setHasMoreMessageHistory] = useState(
    () => initialThreadPayload?.hasMore ?? false
  )
  const [isLoadingMessageHistory, setIsLoadingMessageHistory] = useState(false)
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(
    () => initialThreadPayload?.conversationId ?? null
  )
  const [lead, setLead] = useState<Lead | null>(() => initialThreadPayload?.lead ?? null)
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [composerErrorMessage, setComposerErrorMessage] = useState<string | null>(null)
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null)
  const [summaryStatus, setSummaryStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle'
  )
  const [summaryText, setSummaryText] = useState('')
  const [isSummaryOpen, setIsSummaryOpen] = useState(false)
  const [scoreReasonStatus, setScoreReasonStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [scoreReasonText, setScoreReasonText] = useState('')
  const [scoreReasonError, setScoreReasonError] = useState<
    'missing_api_key' | 'missing_lead' | 'billing_locked' | 'request_failed' | null
  >(null)
  const [isScoreReasonOpen, setIsScoreReasonOpen] = useState(false)
  const [leadRefreshStatus, setLeadRefreshStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [leadRefreshError, setLeadRefreshError] = useState<
    | 'missing_api_key'
    | 'missing_conversation'
    | 'billing_locked'
    | 'paused'
    | 'request_failed'
    | null
  >(null)
  const [leadAutoRefreshStatus, setLeadAutoRefreshStatus] = useState<'idle' | 'loading'>('idle')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(initialConversations.length >= CONVERSATIONS_PAGE_SIZE)
  const [loadingMore, setLoadingMore] = useState(false)
  const [isDetailsMenuOpen, setIsDetailsMenuOpen] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)
  const [detailsSectionState, setDetailsSectionState] = useState(DEFAULT_DETAILS_SECTION_STATE)
  const [currentUserProfile, setCurrentUserProfile] = useState<ProfileLite | null>(null)
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, isLoading: false })
  const [isMobileConversationOpen, setIsMobileConversationOpen] = useState(false)
  const [isMobileDetailsOpen, setIsMobileDetailsOpen] = useState(false)
  const [showScrollToLatest, setShowScrollToLatest] = useState(false)
  const [isTemplatePickerModalOpen, setIsTemplatePickerModalOpen] = useState(false)
  const [isWhatsAppTemplateModalOpen, setIsWhatsAppTemplateModalOpen] = useState(false)
  const [isImportantInfoModalOpen, setIsImportantInfoModalOpen] = useState(false)
  const [isAiPauseUpdating, setIsAiPauseUpdating] = useState(false)
  const [aiPauseError, setAiPauseError] = useState(false)
  const [isUnreadTogglePending, setIsUnreadTogglePending] = useState(false)
  const [activeQueueTab, setActiveQueueTab] = useState<InboxQueueTab>('all')
  const [unreadFilter, setUnreadFilter] = useState<InboxUnreadFilter>('all')
  const [leadTemperatureFilter, setLeadTemperatureFilter] =
    useState<InboxLeadTemperatureFilter>('all')
  const [inboxBotMode, setInboxBotMode] = useState<AiBotMode>(botMode ?? 'active')
  const [isMobileBotModeSheetOpen, setIsMobileBotModeSheetOpen] = useState(false)
  const [isMobileBotModeSheetMounted, setIsMobileBotModeSheetMounted] = useState(false)
  const [isMobileBotModeSheetVisible, setIsMobileBotModeSheetVisible] = useState(false)
  const [isMobileBotModeUpdating, setIsMobileBotModeUpdating] = useState(false)
  const [mobileBotModeUpdateError, setMobileBotModeUpdateError] = useState<string | null>(null)
  const [senderProfilesById, setSenderProfilesById] = useState<Record<string, SenderProfile>>({})

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  if (!supabaseRef.current) {
    supabaseRef.current = createClient()
  }
  const supabase = supabaseRef.current

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const composerContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const isLoadingMessageHistoryRef = useRef(false)
  const pendingPrependScrollRestoreRef = useRef<{
    previousScrollHeight: number
    previousScrollTop: number
  } | null>(null)
  const messagesRef = useRef<Message[]>([])
  const leadRef = useRef<Lead | null>(null)
  const refreshInFlightRef = useRef(false)
  const refreshRequestRef = useRef<string | null>(null)
  const threadPayloadCacheRef = useRef<Map<string, ConversationThreadPayload>>(
    initialThreadPayload
      ? new Map([[initialThreadPayload.conversationId, initialThreadPayload]])
      : new Map()
  )
  const threadPayloadPromiseCacheRef = useRef<Map<string, Promise<ConversationThreadPayload>>>(
    new Map()
  )
  const warmedConversationIdsRef = useRef<Set<string>>(new Set())
  const assigneeCacheRef = useRef<Record<string, Assignee>>({})
  const senderProfilesRef = useRef<Record<string, SenderProfile>>({})
  const conversationListRequestIdRef = useRef(0)
  const isResettingConversationListRef = useRef(false)
  const selectedIdRef = useRef(selectedId)
  const leadRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leadAutoRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([])
  const optimisticPreviewUrlsRef = useRef<Set<string>>(new Set())
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const toggleDetailsSection = useCallback((section: DetailsSectionKey) => {
    setDetailsSectionState((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }, [])
  const leadStatusLabels: Record<string, string> = {
    hot: t('leadStatusHot'),
    warm: t('leadStatusWarm'),
    cold: t('leadStatusCold'),
  }
  const instagramReactionLabels = useMemo(
    () => {
      const localeFallbacks =
        locale === 'tr'
          ? {
              reacted: '{emoji} ile tepki verdi',
              reactedToYourMessage: 'Mesajınıza {emoji} bıraktı',
              removed: 'Reaksiyonunu kaldırdı',
              removedFromYourMessage: 'Mesajınızdaki reaksiyonu kaldırdı',
              fallback: 'Mesaj reaksiyonu',
            }
          : {
              reacted: 'Reacted with {emoji}',
              reactedToYourMessage: 'Reacted {emoji} to your message',
              removed: 'Removed a reaction',
              removedFromYourMessage: 'Removed the reaction from your message',
              fallback: 'Message reaction',
            }

      return {
        reacted: resolveTranslationValue(
          t('instagramReaction.reacted'),
          localeFallbacks.reacted,
          'inbox.'
        ),
        reactedToYourMessage: resolveTranslationValue(
          t('instagramReaction.reactedToYourMessage'),
          localeFallbacks.reactedToYourMessage,
          'inbox.'
        ),
        removed: resolveTranslationValue(
          t('instagramReaction.removed'),
          localeFallbacks.removed,
          'inbox.'
        ),
        removedFromYourMessage: resolveTranslationValue(
          t('instagramReaction.removedFromYourMessage'),
          localeFallbacks.removedFromYourMessage,
          'inbox.'
        ),
        fallback: resolveTranslationValue(
          t('instagramReaction.fallback'),
          localeFallbacks.fallback,
          'inbox.'
        ),
      }
    },
    [locale, t]
  )
  const leadExtractedFields =
    lead?.extracted_fields &&
    typeof lead.extracted_fields === 'object' &&
    !Array.isArray(lead.extracted_fields)
      ? (lead.extracted_fields as Record<string, unknown>)
      : {}
  const resolvedLeadService = resolveLeadService({
    service_type: lead?.service_type,
    extracted_fields: lead?.extracted_fields,
  })
  const collectedRequiredIntake = resolveCollectedRequiredIntake({
    requiredFields: requiredIntakeFields,
    extractedFields: leadExtractedFields,
    serviceType: resolvedLeadService.value,
    includeEmpty: true,
  })

  const revokeAttachmentPreviewUrl = useCallback((previewUrl: string | null) => {
    if (!previewUrl) return
    URL.revokeObjectURL(previewUrl)
  }, [])

  const clearPendingAttachments = useCallback(
    (options?: { preservePreviewUrls?: string[] }) => {
      const preservedPreviewUrls = new Set(
        (options?.preservePreviewUrls ?? []).filter((previewUrl): previewUrl is string =>
          Boolean(previewUrl)
        )
      )
      setPendingAttachments((previous) => {
        previous.forEach((attachment) => {
          if (attachment.previewUrl && preservedPreviewUrls.has(attachment.previewUrl)) return
          revokeAttachmentPreviewUrl(attachment.previewUrl)
        })
        return []
      })
    },
    [revokeAttachmentPreviewUrl]
  )

  const mergeSenderProfiles = useCallback((profiles: SenderProfile[]) => {
    if (profiles.length === 0) return

    setSenderProfilesById((previous) => {
      let hasChanges = false
      const next = { ...previous }

      for (const profile of profiles) {
        const id = profile.id?.trim()
        if (!id) continue

        const previousProfile = next[id]
        if (
          previousProfile?.full_name === profile.full_name &&
          previousProfile?.email === profile.email &&
          previousProfile?.avatar_url === profile.avatar_url
        ) {
          continue
        }

        next[id] = profile
        hasChanges = true
      }

      if (!hasChanges) return previous
      senderProfilesRef.current = next
      return next
    })
  }, [])

  const hydrateSenderProfiles = useCallback(
    async (messageList: Message[]) => {
      const missingIds = Array.from(
        new Set(
          messageList
            .filter((message) => message.sender_type === 'user')
            .map((message) =>
              typeof message.created_by === 'string' ? message.created_by.trim() : ''
            )
            .filter((id) => id.length > 0)
            .filter((id) => !senderProfilesRef.current[id])
        )
      )

      if (missingIds.length === 0) return

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', missingIds)

      if (error || !data) {
        console.error('Failed to hydrate sender profiles', error)
        return
      }

      mergeSenderProfiles((data ?? []) as SenderProfile[])
    },
    [mergeSenderProfiles, supabase]
  )

  const applyThreadPayload = useCallback(
    (conversationId: string, payload: ConversationThreadPayload) => {
      threadPayloadCacheRef.current.set(conversationId, payload)
      pendingPrependScrollRestoreRef.current = null
      isLoadingMessageHistoryRef.current = false

      const nextPreviewMessages = buildConversationPreviewMessages(payload.messages)
      setMessages(payload.messages)
      setLead(payload.lead)
      setMessageOffset(payload.fetchedCount)
      setHasMoreMessageHistory(payload.hasMore)
      setIsLoadingMessageHistory(false)
      setLoadedConversationId(conversationId)
      setConversations((prev) =>
        applyLeadStatusToConversationList(
          prev.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  messages:
                    nextPreviewMessages.length > 0 ? nextPreviewMessages : conversation.messages,
                }
              : conversation
          ),
          conversationId,
          payload.lead?.status ?? null
        )
      )
      void hydrateSenderProfiles(payload.messages)
    },
    [hydrateSenderProfiles]
  )

  const loadThreadPayload = useCallback(
    async (
      conversationId: string,
      options?: {
        force?: boolean
      }
    ) => {
      const cachedThreadPayload =
        options?.force !== true ? threadPayloadCacheRef.current.get(conversationId) : undefined
      if (cachedThreadPayload) {
        return cachedThreadPayload
      }

      const existingPromise = threadPayloadPromiseCacheRef.current.get(conversationId)
      if (existingPromise) {
        return existingPromise
      }

      const promise = getConversationThreadPayload(conversationId, {
        organizationId,
        pageSize: MESSAGES_PAGE_SIZE,
      })
        .then((payload) => {
          threadPayloadCacheRef.current.set(conversationId, payload)
          return payload
        })
        .finally(() => {
          threadPayloadPromiseCacheRef.current.delete(conversationId)
        })

      threadPayloadPromiseCacheRef.current.set(conversationId, promise)
      return promise
    },
    [organizationId]
  )

  const markOptimisticMessagesAsFailed = useCallback((tempMessageIds: string[]) => {
    if (tempMessageIds.length === 0) return

    setMessages((previous) =>
      previous.map((message) => {
        if (!tempMessageIds.includes(message.id)) return message
        const metadataRecord = parseMessageMetadataRecord(message.metadata) ?? {}
        const statusKey =
          metadataRecord.instagram_outbound_attachment_id ||
          metadataRecord.outbound_channel === 'instagram'
            ? 'instagram_outbound_status'
            : metadataRecord.whatsapp_outbound_attachment_id ||
                metadataRecord.outbound_channel === 'whatsapp'
              ? 'whatsapp_outbound_status'
              : null
        return {
          ...message,
          metadata: {
            ...metadataRecord,
            outbound_delivery_status: 'failed',
            ...(statusKey ? { [statusKey]: 'failed' } : {}),
          } as Message['metadata'],
        }
      })
    )
  }, [])

  const resolveAttachmentValidationErrorMessage = useCallback(
    (args: {
      validationResult: ReturnType<typeof validateWhatsAppOutboundAttachments>
      drafts: Array<{ id: string; mimeType: string }>
      platform: 'whatsapp' | 'instagram'
    }) => {
      if (args.validationResult.ok) return null
      const { validationResult } = args
      if (validationResult.reason === 'too_many_attachments') {
        return t('composerAttachments.errors.maxCount', { count: validationResult.maxCount })
      }
      if (validationResult.reason === 'invalid_mime_type') {
        return args.platform === 'instagram'
          ? t('composerAttachments.errors.invalidTypeInstagram')
          : t('composerAttachments.errors.invalidType')
      }
      if (validationResult.reason !== 'file_too_large') {
        return args.platform === 'instagram'
          ? t('composerAttachments.errors.invalidTypeInstagram')
          : t('composerAttachments.errors.invalidType')
      }

      const draft = args.drafts.find((item) => item.id === validationResult.attachmentId)
      if (draft?.mimeType.startsWith('image/')) {
        const maxSizeBytes =
          args.platform === 'instagram'
            ? MAX_INSTAGRAM_OUTBOUND_IMAGE_BYTES
            : MAX_WHATSAPP_OUTBOUND_IMAGE_BYTES
        return t('composerAttachments.errors.maxImageSize', {
          sizeMb: Math.floor(maxSizeBytes / (1024 * 1024)),
        })
      }
      return t('composerAttachments.errors.maxDocumentSize', {
        sizeMb: Math.floor(MAX_WHATSAPP_OUTBOUND_DOCUMENT_BYTES / (1024 * 1024)),
      })
    },
    [t]
  )

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments
  }, [pendingAttachments])

  useEffect(() => {
    const activePreviewUrls = new Set(collectOptimisticPreviewUrls(messages))

    optimisticPreviewUrlsRef.current.forEach((previewUrl) => {
      if (activePreviewUrls.has(previewUrl)) return
      revokeAttachmentPreviewUrl(previewUrl)
    })

    optimisticPreviewUrlsRef.current = activePreviewUrls
  }, [messages, revokeAttachmentPreviewUrl])

  useEffect(() => {
    return () => {
      pendingAttachmentsRef.current.forEach((attachment) =>
        revokeAttachmentPreviewUrl(attachment.previewUrl)
      )
      optimisticPreviewUrlsRef.current.forEach((previewUrl) =>
        revokeAttachmentPreviewUrl(previewUrl)
      )
    }
  }, [revokeAttachmentPreviewUrl])

  useEffect(() => {
    setInboxBotMode(botMode ?? 'active')
  }, [botMode])

  useEffect(() => {
    let closeTimer: ReturnType<typeof setTimeout> | null = null
    let openFrame: number | null = null

    if (isMobileBotModeSheetOpen) {
      setIsMobileBotModeSheetMounted(true)
      openFrame = window.requestAnimationFrame(() => {
        setIsMobileBotModeSheetVisible(true)
      })
    } else {
      setIsMobileBotModeSheetVisible(false)
      closeTimer = setTimeout(() => {
        setIsMobileBotModeSheetMounted(false)
      }, 220)
    }

    return () => {
      if (closeTimer) clearTimeout(closeTimer)
      if (openFrame !== null) window.cancelAnimationFrame(openFrame)
    }
  }, [isMobileBotModeSheetOpen])

  useEffect(() => {
    setSummaryStatus('idle')
    setSummaryText('')
    setIsSummaryOpen(false)
    setScoreReasonStatus('idle')
    setScoreReasonText('')
    setScoreReasonError(null)
    setIsScoreReasonOpen(false)
    setLeadRefreshStatus('idle')
    setLeadRefreshError(null)
    setLeadAutoRefreshStatus('idle')
    setAiPauseError(false)
    setIsMobileDetailsOpen(false)
    setIsMobileBotModeSheetOpen(false)
    setIsTemplatePickerModalOpen(false)
    setComposerErrorMessage(null)
    setPreviewAttachmentId(null)
    setMessageOffset(0)
    setHasMoreMessageHistory(false)
    setIsLoadingMessageHistory(false)
    isLoadingMessageHistoryRef.current = false
    pendingPrependScrollRestoreRef.current = null
    clearPendingAttachments()
    if (leadRefreshTimeoutRef.current) {
      clearTimeout(leadRefreshTimeoutRef.current)
      leadRefreshTimeoutRef.current = null
    }
    if (leadAutoRefreshTimeoutRef.current) {
      clearTimeout(leadAutoRefreshTimeoutRef.current)
      leadAutoRefreshTimeoutRef.current = null
    }
  }, [clearPendingAttachments, selectedId])

  useEffect(() => {
    if (!selectedId) {
      setIsMobileConversationOpen(false)
    }
  }, [selectedId])

  useEffect(() => {
    const parsed = new Date(renderedAtIso)
    if (!Number.isNaN(parsed.getTime())) {
      setRelativeTimeBaseDate(parsed)
    }
  }, [renderedAtIso])

  useEffect(() => {
    const tick = () => setRelativeTimeBaseDate(new Date())
    tick()
    const intervalId = setInterval(tick, 60_000)

    return () => {
      clearInterval(intervalId)
    }
  }, [])

  const activeConversationListFilters = useMemo(
    () => ({
      unreadFilter,
      leadTemperatureFilter,
    }),
    [leadTemperatureFilter, unreadFilter]
  )
  const conversationListFilterKey = useMemo(
    () =>
      buildConversationListFilterKey({
        organizationId,
        unreadFilter,
        leadTemperatureFilter,
      }),
    [leadTemperatureFilter, organizationId, unreadFilter]
  )
  const previousConversationListFilterKeyRef = useRef(conversationListFilterKey)

  const loadConversationsPage = useCallback(
    async (pageIndex: number, replace: boolean) => {
      const requestId = ++conversationListRequestIdRef.current

      try {
        const nextConversations = await getConversations(
          organizationId,
          pageIndex,
          CONVERSATIONS_PAGE_SIZE,
          activeConversationListFilters
        )

        if (conversationListRequestIdRef.current !== requestId) return

        setHasMore(nextConversations.length >= CONVERSATIONS_PAGE_SIZE)
        setPage(pageIndex + 1)

        if (replace) {
          setConversations(nextConversations)
          return
        }

        if (nextConversations.length > 0) {
          setConversations((prev) => {
            const existingIds = new Set(prev.map((conversation) => conversation.id))
            const uniqueNew = nextConversations.filter(
              (conversation) => !existingIds.has(conversation.id)
            )
            return [...prev, ...uniqueNew]
          })
        }
      } catch (error) {
        if (conversationListRequestIdRef.current !== requestId) return
        console.error('Failed to load more conversations', error)
        setHasMore(false)
      } finally {
        if (conversationListRequestIdRef.current !== requestId) return
        setLoadingMore(false)
      }
    },
    [activeConversationListFilters, organizationId]
  )

  const loadMoreConversations = useCallback(async () => {
    if (!hasMore || loadingMore) return

    setLoadingMore(true)
    await loadConversationsPage(page, false)
  }, [hasMore, loadConversationsPage, loadingMore, page])

  useEffect(() => {
    if (previousConversationListFilterKeyRef.current === conversationListFilterKey) {
      return
    }
    previousConversationListFilterKeyRef.current = conversationListFilterKey

    isResettingConversationListRef.current = true

    void (async () => {
      try {
        setLoadingMore(true)
        setHasMore(true)
        setPage(0)
        setConversations([])
        await loadConversationsPage(0, true)
      } finally {
        isResettingConversationListRef.current = false
      }
    })()
  }, [conversationListFilterKey, loadConversationsPage])

  const handleScroll = async (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    if (scrollHeight - scrollTop <= clientHeight + 50) {
      await loadMoreConversations()
    }
  }

  const refreshLead = useCallback(async (conversationId: string) => {
    try {
      const result = await getConversationLead(conversationId)
      setConversations((prev) =>
        applyLeadStatusToConversationList(prev, conversationId, result?.status ?? null)
      )
      if (selectedIdRef.current !== conversationId) return
      setLead(result)
      return result
    } catch (error) {
      console.error('Failed to refresh lead', error)
    }
    return null
  }, [])

  const updateConversationDetailsLocally = useCallback(
    (conversationId: string, updates: Partial<ConversationListItem>) => {
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, ...updates } : conversation
        )
      )
    },
    []
  )

  const commitConversationRead = useCallback(
    (conversationId: string | null) => {
      if (!conversationId) return

      const currentConversation = conversations.find(
        (conversation) => conversation.id === conversationId
      )
      if (!shouldAutoMarkConversationRead(currentConversation)) return

      updateConversationDetailsLocally(conversationId, {
        unread_count: 0,
        manual_unread: false,
      })
      void markConversationRead(conversationId)
        .then(() => {
          dispatchInboxUnreadUpdated({ organizationId })
        })
        .catch((error) => {
          console.error('Failed to mark conversation as read', error)
        })
    },
    [conversations, organizationId, updateConversationDetailsLocally]
  )

  const scheduleLeadAutoRefresh = useCallback(
    (conversationId: string) => {
      if (!conversationId) return
      if (leadAutoRefreshTimeoutRef.current) {
        clearTimeout(leadAutoRefreshTimeoutRef.current)
        leadAutoRefreshTimeoutRef.current = null
      }
      const baselineUpdatedAt = leadRef.current?.updated_at ?? null
      let attempts = 0
      setLeadAutoRefreshStatus('loading')

      const run = async () => {
        attempts += 1
        const nextLead = await refreshLead(conversationId)
        const nextUpdatedAt = nextLead?.updated_at ?? null
        if (nextUpdatedAt && nextUpdatedAt !== baselineUpdatedAt) {
          setLeadAutoRefreshStatus('idle')
          return
        }
        if (attempts >= 4) {
          setLeadAutoRefreshStatus('idle')
          return
        }
        leadAutoRefreshTimeoutRef.current = setTimeout(run, 2000)
      }

      leadAutoRefreshTimeoutRef.current = setTimeout(run, 1500)
    },
    [refreshLead]
  )

  const refreshMessages = useCallback(
    async (conversationId: string) => {
      refreshRequestRef.current = conversationId
      if (refreshInFlightRef.current) return
      refreshInFlightRef.current = true
      try {
        while (refreshRequestRef.current) {
          const nextId = refreshRequestRef.current
          refreshRequestRef.current = null
          const payload = await loadThreadPayload(nextId, { force: true })
          if (selectedIdRef.current !== nextId) continue
          applyThreadPayload(nextId, payload)
        }
      } catch (error) {
        console.error('Failed to refresh messages', error)
        if (selectedIdRef.current === conversationId) {
          isLoadingMessageHistoryRef.current = false
          setIsLoadingMessageHistory(false)
        }
      } finally {
        refreshInFlightRef.current = false
      }
    },
    [applyThreadPayload, loadThreadPayload]
  )

  const refreshConversationPreview = useCallback(async (conversationId: string) => {
    try {
      const pageResult = await getMessagesPage(
        conversationId,
        0,
        CONVERSATION_LIST_PREVIEW_MESSAGE_LIMIT
      )
      const nextPreviewMessages = buildConversationPreviewMessages(pageResult.messages)
      if (nextPreviewMessages.length === 0) return

      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, messages: nextPreviewMessages }
            : conversation
        )
      )
    } catch (error) {
      console.error('Failed to refresh conversation preview', error)
    }
  }, [])

  const loadOlderMessages = useCallback(async () => {
    const conversationId = selectedIdRef.current
    if (!conversationId || !hasMoreMessageHistory || isLoadingMessageHistoryRef.current) return

    const container = messagesContainerRef.current
    const restoreSnapshot = container
      ? {
          previousScrollHeight: container.scrollHeight,
          previousScrollTop: container.scrollTop,
        }
      : null

    isLoadingMessageHistoryRef.current = true
    setIsLoadingMessageHistory(true)

    try {
      const pageResult = await getMessagesPage(conversationId, messageOffset, MESSAGES_PAGE_SIZE)
      if (selectedIdRef.current !== conversationId) return

      if (restoreSnapshot) {
        pendingPrependScrollRestoreRef.current = restoreSnapshot
      }

      await hydrateSenderProfiles(pageResult.messages)
      let mergedMessagesForCache = messagesRef.current
      setMessages((previousMessages) => {
        const merged = prependOlderMessages({
          currentMessages: previousMessages,
          olderBatch: pageResult.messages,
        })
        if (merged.addedCount === 0) {
          pendingPrependScrollRestoreRef.current = null
        }
        mergedMessagesForCache = merged.mergedMessages
        return merged.mergedMessages
      })

      const nextFetchedCount = messageOffset + pageResult.fetchedCount
      setMessageOffset(nextFetchedCount)
      setHasMoreMessageHistory(pageResult.hasMore)
      threadPayloadCacheRef.current.set(conversationId, {
        conversationId,
        fetchedCount: nextFetchedCount,
        hasMore: pageResult.hasMore,
        lead: leadRef.current,
        messages: mergedMessagesForCache,
      })
    } catch (error) {
      console.error('Failed to load older messages', error)
    } finally {
      if (selectedIdRef.current === conversationId) {
        setIsLoadingMessageHistory(false)
      }
      isLoadingMessageHistoryRef.current = false
    }
  }, [hasMoreMessageHistory, hydrateSenderProfiles, messageOffset])

  const resolveAssignee = useCallback(
    async (assigneeId: string | null) => {
      if (!assigneeId) return null
      const cached = assigneeCacheRef.current[assigneeId]
      if (cached) return cached

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', assigneeId)
        .single()

      if (error || !data) {
        console.error('Failed to load assignee profile', error)
        return null
      }

      const assignee: Assignee = {
        full_name: data.full_name,
        email: data.email,
      }
      assigneeCacheRef.current[assigneeId] = assignee
      return assignee
    },
    [supabase]
  )

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useLayoutEffect(() => {
    const pendingRestore = pendingPrependScrollRestoreRef.current
    if (!pendingRestore) return
    const container = messagesContainerRef.current
    if (!container) return

    container.scrollTop = resolveRestoredScrollTop({
      previousScrollHeight: pendingRestore.previousScrollHeight,
      previousScrollTop: pendingRestore.previousScrollTop,
      nextScrollHeight: container.scrollHeight,
    })
    pendingPrependScrollRestoreRef.current = null
  }, [messages])

  useEffect(() => {
    leadRef.current = lead
  }, [lead])

  useEffect(() => {
    senderProfilesRef.current = senderProfilesById
  }, [senderProfilesById])

  useEffect(() => {
    let isMounted = true

    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .eq('id', user.id)
        .single()

      if (!isMounted || error || !data) return

      const profile: ProfileLite = {
        id: data.id,
        full_name: data.full_name,
        email: data.email,
        avatar_url: data.avatar_url,
      }

      assigneeCacheRef.current[data.id] = {
        full_name: data.full_name,
        email: data.email,
      }
      mergeSenderProfiles([profile])
      setCurrentUserProfile(profile)
    }

    loadProfile()

    return () => {
      isMounted = false
    }
  }, [mergeSenderProfiles, supabase])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      setMessageOffset(0)
      setHasMoreMessageHistory(false)
      setIsLoadingMessageHistory(false)
      isLoadingMessageHistoryRef.current = false
      pendingPrependScrollRestoreRef.current = null
      setLoadedConversationId(null)
      setLead(null)
      return
    }

    const loadedConversationMatchesSelection = loadedConversationId === selectedId
    if (loadedConversationMatchesSelection) {
      return
    }

    const selectedConversation = conversations.find(
      (conversation) => conversation.id === selectedId
    )
    const selectedConversationPreviewMessage = resolveLatestNonSeenPreviewMessage(
      selectedConversation?.platform ?? 'simulator',
      selectedConversation?.messages
    )
    const cachedThreadPayload = threadPayloadCacheRef.current.get(selectedId)
    const cachedThreadPreviewMessage = cachedThreadPayload
      ? resolveLatestNonSeenPreviewMessage(
          selectedConversation?.platform ?? 'simulator',
          cachedThreadPayload.messages
        )
      : null

    if (cachedThreadPayload) {
      if (
        shouldHydrateSelectedThreadFromCache({
          hasCachedThreadPayload: true,
          hasCachedPreviewMessage: Boolean(cachedThreadPreviewMessage),
          hasListPreviewMessage: Boolean(selectedConversationPreviewMessage),
          loadedConversationMatchesSelection,
        })
      ) {
        applyThreadPayload(selectedId, cachedThreadPayload)
        return
      }

      if (
        shouldDiscardSelectedThreadCache({
          hasCachedThreadPayload: true,
          hasCachedPreviewMessage: Boolean(cachedThreadPreviewMessage),
          hasListPreviewMessage: Boolean(selectedConversationPreviewMessage),
          loadedConversationMatchesSelection,
        })
      ) {
        threadPayloadCacheRef.current.delete(selectedId)
      }
    }

    setMessages([])
    setLead(null)
    refreshMessages(selectedId)
  }, [applyThreadPayload, conversations, loadedConversationId, refreshMessages, selectedId])

  useEffect(() => {
    if (!initialThreadPayload) {
      return
    }

    threadPayloadCacheRef.current.set(initialThreadPayload.conversationId, initialThreadPayload)
    void hydrateSenderProfiles(initialThreadPayload.messages)
  }, [hydrateSenderProfiles, initialThreadPayload])

  useEffect(() => {
    if (!loadedConversationId) {
      return
    }
    if (loadedConversationId !== selectedId) {
      return
    }

    threadPayloadCacheRef.current.set(loadedConversationId, {
      conversationId: loadedConversationId,
      fetchedCount: messageOffset,
      hasMore: hasMoreMessageHistory,
      lead,
      messages,
    })
  }, [hasMoreMessageHistory, lead, loadedConversationId, messageOffset, messages, selectedId])

  useEffect(() => {
    const conversationIdsToWarm = conversations
      .slice(0, 3)
      .map((conversation) => conversation.id)
      .filter(
        (conversationId) =>
          conversationId !== selectedId &&
          !threadPayloadCacheRef.current.has(conversationId) &&
          !warmedConversationIdsRef.current.has(conversationId)
      )

    if (conversationIdsToWarm.length === 0) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      conversationIdsToWarm.forEach((conversationId) => {
        warmedConversationIdsRef.current.add(conversationId)
        void loadThreadPayload(conversationId).catch((error) => {
          warmedConversationIdsRef.current.delete(conversationId)
          console.error('Failed to warm conversation thread payload', error)
        })
      })
    }, 150)

    return () => clearTimeout(timeoutId)
  }, [conversations, loadThreadPayload, selectedId])

  // Scroll Management
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current
      if (!container) return

      scrollContainerToBottom(container, behavior)

      window.setTimeout(
        () => {
          const latestContainer = messagesContainerRef.current
          if (!latestContainer) return
          scrollContainerToBottom(latestContainer, 'auto')
          isNearBottomRef.current = true
          setShowScrollToLatest(false)
        },
        behavior === 'smooth' ? 280 : 0
      )
    })
  }, [])

  const syncScrollToLatestVisibility = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) {
      isNearBottomRef.current = true
      setShowScrollToLatest(false)
      return
    }
    const distanceFromBottom = getDistanceFromBottom(container)
    const shouldShow = shouldShowScrollToLatestButton(
      distanceFromBottom,
      DEFAULT_SCROLL_TO_LATEST_THRESHOLD
    )
    isNearBottomRef.current = !shouldShow
    setShowScrollToLatest(shouldShow)
  }, [])

  const handleMessagesScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      syncScrollToLatestVisibility()
      if (
        shouldLoadOlderMessages({
          scrollTop: event.currentTarget.scrollTop,
          hasMore: hasMoreMessageHistory,
          isLoading: isLoadingMessageHistory,
          threshold: MESSAGE_HISTORY_TOP_THRESHOLD,
        })
      ) {
        void loadOlderMessages()
      }
    },
    [
      hasMoreMessageHistory,
      isLoadingMessageHistory,
      loadOlderMessages,
      syncScrollToLatestVisibility,
    ]
  )

  const handleMessageMediaLoad = useCallback(() => {
    if (isNearBottomRef.current) {
      scrollToBottom('auto')
      return
    }
    syncScrollToLatestVisibility()
  }, [scrollToBottom, syncScrollToLatestVisibility])

  // Effect for conversation switch (Instant scroll)
  useEffect(() => {
    scrollToBottom('auto')
  }, [selectedId, scrollToBottom])

  // Effect for new messages (Smooth scroll)
  // We strictly track 'messages' length or content change?
  // Just messages dependency is fine, but we need to avoid fighting with selectedId.
  // Actually, separating them is safer.
  const prevMessagesLength = useRef(0)
  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      scrollToBottom('smooth')
    }
    prevMessagesLength.current = messages.length
  }, [messages, scrollToBottom])

  useEffect(() => {
    const timer = setTimeout(() => {
      syncScrollToLatestVisibility()
    }, 120)
    return () => clearTimeout(timer)
  }, [messages, selectedId, syncScrollToLatestVisibility])

  useEffect(() => {
    const composer = composerContainerRef.current
    if (!composer || typeof ResizeObserver === 'undefined') return

    let frameId: number | null = null
    const observer = new ResizeObserver(() => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      frameId = requestAnimationFrame(() => {
        if (isNearBottomRef.current) {
          scrollToBottom('auto')
          return
        }
        syncScrollToLatestVisibility()
      })
    })

    observer.observe(composer)
    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      observer.disconnect()
    }
  }, [selectedId, scrollToBottom, syncScrollToLatestVisibility])

  // Also force scroll on mount/updates just in case
  // useEffect(() => { scrollToBottom() }, [])
  // No, better to be specific.

  // Check if we need to scroll when isLeaving changes (optimistic update changes messages, so handled above)

  // ... re-insert realtime subscriptions ...

  useEffect(() => {
    let messagesChannel: ReturnType<typeof supabase.channel> | null = null
    let conversationsChannel: ReturnType<typeof supabase.channel> | null = null
    let leadsChannel: ReturnType<typeof supabase.channel> | null = null
    let cleanupRealtimeAuth: (() => void) | null = null
    let isMounted = true

    const setupRealtime = async () => {
      cleanupRealtimeAuth = await setupRealtimeAuth(supabase, {
        onMissingToken: () => {
          console.warn('Realtime: missing session token, subscribing without auth token')
        },
        onError: (error) => {
          console.error('Realtime auth bootstrap failed', error)
        },
      })
      if (!isMounted) {
        cleanupRealtimeAuth()
        cleanupRealtimeAuth = null
        return
      }

      console.log('Setting up Realtime subscription...')

      // Separate channels for messages and conversations
      messagesChannel = supabase
        .channel('inbox_messages')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `organization_id=eq.${organizationId}`,
          },
          (payload) => {
            const newMsg = payload.new as Message
            console.log('Realtime Message received:', newMsg)
            const isInstagramSeenRealtimeEvent = isInstagramSeenEventMessage({
              platform: 'instagram',
              senderType: newMsg.sender_type,
              metadata: newMsg.metadata,
              content: newMsg.content,
            })
            const inboundContactAvatarUrl =
              newMsg.sender_type === 'contact'
                ? extractSocialContactAvatarUrl(newMsg.metadata)
                : null
            if (newMsg.sender_type === 'user') {
              void hydrateSenderProfiles([newMsg])
            }

            // 1. Update active chat if it matches selectedId
            if (newMsg.conversation_id === selectedIdRef.current) {
              setMessages((prev) => {
                // Check if we already have this message (dedupe real IDs)
                if (prev.some((m) => m.id === newMsg.id)) return prev

                // Dedupe optimistic messages:
                // If we find a temp message with same content & sender, remove it and add real one
                const isUserSender = newMsg.sender_type === 'user'
                const inboundAttachmentId = extractOutboundAttachmentId(newMsg.metadata)

                // Filter out matching temp messages if it's a user message
                const filtered = isUserSender
                  ? prev.filter((message) => {
                      if (!message.id.startsWith('temp-') || message.sender_type !== 'user')
                        return true

                      const tempAttachmentId = extractOutboundAttachmentId(message.metadata)
                      if (inboundAttachmentId && tempAttachmentId) {
                        return inboundAttachmentId !== tempAttachmentId
                      }

                      return message.content !== newMsg.content
                    })
                  : prev

                return sortMessagesChronologically([...filtered, newMsg])
              })
            }

            if (
              newMsg.sender_type === 'contact' &&
              newMsg.conversation_id === selectedIdRef.current &&
              !isInstagramSeenRealtimeEvent
            ) {
              scheduleLeadAutoRefresh(newMsg.conversation_id)
            }

            // 2. Update conversation list (unread, last_message, sort)
            setConversations((prev) =>
              prev
                .map((c) => {
                  if (c.id === newMsg.conversation_id) {
                    const isInstagramSeenEventForConversation =
                      c.platform === 'instagram' && isInstagramSeenRealtimeEvent
                    if (isInstagramSeenEventForConversation) {
                      return {
                        ...c,
                        contact_avatar_url: c.contact_avatar_url ?? inboundContactAvatarUrl,
                      }
                    }

                    const shouldIncrementUnread = newMsg.sender_type === 'contact'
                    const previewMessage: Pick<
                      Message,
                      'content' | 'created_at' | 'sender_type' | 'metadata'
                    > = {
                      content: newMsg.content,
                      created_at: newMsg.created_at,
                      sender_type: newMsg.sender_type,
                      metadata: newMsg.metadata,
                    }
                    return {
                      ...c,
                      last_message_at: newMsg.created_at,
                      contact_avatar_url: c.contact_avatar_url ?? inboundContactAvatarUrl,
                      unread_count: resolveSelectedConversationUnreadCountOnIncoming({
                        isSelectedConversation: newMsg.conversation_id === selectedIdRef.current,
                        shouldIncrementUnread,
                        unreadCount: c.unread_count,
                        manualUnread: Boolean(c.manual_unread),
                      }),
                      messages: buildConversationPreviewMessages([
                        previewMessage,
                        ...(c.messages ?? []),
                      ]),
                    }
                  }
                  return c
                })
                .sort(
                  (a, b) =>
                    new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
                )
            )
          }
        )
        .subscribe((status, err) => {
          console.log('Messages Channel Status:', status, err ? { error: err } : '')
        })

      conversationsChannel = supabase
        .channel('inbox_conversations')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversations',
            filter: `organization_id=eq.${organizationId}`,
          },
          (payload) => {
            const newOrUpdatedConv = payload.new as Conversation
            console.log('Realtime Conversation event:', payload.eventType, newOrUpdatedConv)
            let shouldHydrateConversationPreview = false

            setConversations((prev) => {
              // Check if exists
              const exists = prev.some((c) => c.id === newOrUpdatedConv.id)

              if (exists) {
                // UPDATE logic
                return prev
                  .map((c) => {
                    if (c.id === newOrUpdatedConv.id) {
                      const nextAssignee = newOrUpdatedConv.assignee_id
                        ? (assigneeCacheRef.current[newOrUpdatedConv.assignee_id] ??
                          (c.assignee_id === newOrUpdatedConv.assignee_id ? c.assignee : null))
                        : null

                      const mergedConversationResult = mergeRealtimeConversationUpdate({
                        currentConversation: c,
                        incomingConversation: newOrUpdatedConv,
                        nextAssignee,
                      })

                      if (mergedConversationResult.shouldHydratePreview) {
                        shouldHydrateConversationPreview = true
                      }

                      return mergedConversationResult.conversation
                    }
                    return c
                  })
                  .sort(
                    (a, b) =>
                      new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
                  )
              } else {
                // INSERT logic (new conversation)
                shouldHydrateConversationPreview = true
                return [newOrUpdatedConv, ...prev]
              }
            })

            if (shouldHydrateConversationPreview) {
              void refreshConversationPreview(newOrUpdatedConv.id)
            }

            // Resolve assignee if needed
            if (
              newOrUpdatedConv.assignee_id &&
              !assigneeCacheRef.current[newOrUpdatedConv.assignee_id]
            ) {
              resolveAssignee(newOrUpdatedConv.assignee_id).then((assignee) => {
                if (!assignee) return
                setConversations((prev) =>
                  prev.map((c) => (c.id === newOrUpdatedConv.id ? { ...c, assignee } : c))
                )
              })
            }

            if (newOrUpdatedConv.id === selectedIdRef.current) {
              const lastMessageAt = messagesRef.current[messagesRef.current.length - 1]?.created_at
              if (
                !lastMessageAt ||
                new Date(newOrUpdatedConv.last_message_at).getTime() >
                  new Date(lastMessageAt).getTime()
              ) {
                refreshMessages(newOrUpdatedConv.id)
              }
            }
          }
        )
        .subscribe((status, err) => {
          console.log('Conversations Channel Status:', status, err ? { error: err } : '')
        })

      // Separate channel for leads
      leadsChannel = supabase
        .channel('inbox_leads')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'leads',
            filter: `organization_id=eq.${organizationId}`,
          },
          (payload) => {
            const leadRow = (
              payload.eventType === 'DELETE' ? payload.old : payload.new
            ) as Lead | null
            console.log('Realtime Lead event:', payload.eventType, leadRow)
            if (!leadRow?.conversation_id) return

            setConversations((prev) =>
              applyLeadStatusToConversationList(
                prev,
                leadRow.conversation_id,
                payload.eventType === 'DELETE' ? null : leadRow.status
              )
            )

            if (leadRow.conversation_id === selectedIdRef.current) {
              if (payload.eventType === 'DELETE') {
                setLead(null)
              } else {
                setLead(leadRow)
              }
            }
          }
        )
        .subscribe((status, err) => {
          console.log('Leads Channel Status:', status, err ? { error: err } : '')
        })
    }

    setupRealtime()

    return () => {
      isMounted = false
      if (cleanupRealtimeAuth) {
        cleanupRealtimeAuth()
      }
      if (messagesChannel) {
        console.log('Cleaning up Messages channel...')
        supabase.removeChannel(messagesChannel)
      }
      if (conversationsChannel) {
        console.log('Cleaning up Conversations channel...')
        supabase.removeChannel(conversationsChannel)
      }
      if (leadsChannel) {
        console.log('Cleaning up Leads channel...')
        supabase.removeChannel(leadsChannel)
      }
    }
  }, [
    hydrateSenderProfiles,
    organizationId,
    refreshMessages,
    refreshConversationPreview,
    resolveAssignee,
    scheduleLeadAutoRefresh,
    supabase,
  ])

  const handleFetchSummary = async () => {
    if (!selectedId || summaryStatus === 'loading') return
    setSummaryStatus('loading')
    setSummaryText('')
    try {
      const result = await getConversationSummary(selectedId, organizationId, locale)
      if (result.ok) {
        setSummaryText(result.summary)
        setSummaryStatus('success')
        return
      }
      setSummaryStatus('error')
    } catch (error) {
      console.error('Failed to generate summary', error)
      setSummaryStatus('error')
    }
  }

  const handleToggleSummary = async () => {
    if (summaryHeaderDisabled) return
    const next = resolveSummaryToggle(isSummaryOpen)
    const nextOpen = next.nextOpen
    setIsSummaryOpen(nextOpen)

    if (next.resetCachedSummary) {
      setSummaryStatus('idle')
      setSummaryText('')
      return
    }

    if (next.shouldFetch) {
      await handleFetchSummary()
    }
  }

  const handleRefreshSummary = async () => {
    if (summaryRefreshDisabled) return
    setIsSummaryOpen(true)
    await handleFetchSummary()
  }

  const handleFetchScoreReason = async () => {
    if (!selectedId || scoreReasonStatus === 'loading') return
    setScoreReasonStatus('loading')
    setScoreReasonText('')
    setScoreReasonError(null)
    try {
      const statusLabel = lead?.status ? (leadStatusLabels[lead.status] ?? lead.status) : undefined
      const result = await getLeadScoreReasoning(selectedId, organizationId, locale, statusLabel)
      if (result.ok) {
        setScoreReasonText(result.reasoning)
        setScoreReasonStatus('success')
        return
      }
      setScoreReasonError(result.reason)
      setScoreReasonStatus('error')
    } catch (error) {
      console.error('Failed to get score reasoning', error)
      setScoreReasonError('request_failed')
      setScoreReasonStatus('error')
    }
  }

  const handleOpenScoreReason = async () => {
    setIsScoreReasonOpen(true)
    if (scoreReasonStatus === 'idle' || scoreReasonStatus === 'error') {
      await handleFetchScoreReason()
    }
  }

  const handleRefreshLead = async () => {
    if (!selectedId || leadRefreshStatus === 'loading') return
    const selectedConversation = conversations.find(
      (conversation) => conversation.id === selectedId
    )
    if (selectedConversation?.ai_processing_paused) return
    setLeadRefreshStatus('loading')
    setLeadRefreshError(null)
    try {
      const result = await refreshConversationLead(selectedId, organizationId, locale)
      if (result.ok) {
        await refreshLead(selectedId)
        setLeadRefreshStatus('success')
        if (leadRefreshTimeoutRef.current) {
          clearTimeout(leadRefreshTimeoutRef.current)
        }
        leadRefreshTimeoutRef.current = setTimeout(() => {
          setLeadRefreshStatus('idle')
        }, 2500)
        return
      }
      setLeadRefreshError(result.reason)
      setLeadRefreshStatus('error')
    } catch (error) {
      console.error('Manual lead refresh failed', error)
      setLeadRefreshError('request_failed')
      setLeadRefreshStatus('error')
    }
  }

  const handleSetConversationAiPause = async (paused: boolean) => {
    if (!selectedId || isReadOnly || isAiPauseUpdating) return

    setAiPauseError(false)
    setIsAiPauseUpdating(true)

    const previousPaused = Boolean(
      conversations.find((conversation) => conversation.id === selectedId)?.ai_processing_paused
    )

    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === selectedId
          ? { ...conversation, ai_processing_paused: paused }
          : conversation
      )
    )

    try {
      const result = await setConversationAiProcessingPaused(selectedId, paused)
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === selectedId
            ? { ...conversation, ai_processing_paused: result.ai_processing_paused }
            : conversation
        )
      )
    } catch (error) {
      console.error('Failed to update conversation AI processing pause', error)
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === selectedId
            ? { ...conversation, ai_processing_paused: previousPaused }
            : conversation
        )
      )
      setAiPauseError(true)
    } finally {
      setIsAiPauseUpdating(false)
    }
  }

  const handleSaveRequiredInfo = useCallback(
    async (input: { field: string; value: string; knownLeadUpdatedAt: string | null }) => {
      if (!selectedId) return { ok: false as const, reason: 'request_failed' as const }

      try {
        const result = await setConversationRequiredIntakeOverride({
          conversationId: selectedId,
          organizationId,
          field: input.field,
          value: input.value,
          knownLeadUpdatedAt: input.knownLeadUpdatedAt,
        })

        if (!result.ok) {
          return result
        }

        setLead(result.lead)
        setConversations((previous) =>
          applyLeadStatusToConversationList(previous, selectedId, result.lead.status)
        )
        return { ok: true as const }
      } catch (error) {
        console.error('Failed to save important info override', error)
        return { ok: false as const, reason: 'request_failed' as const }
      }
    },
    [organizationId, selectedId]
  )

  const handleReturnRequiredInfoToAi = useCallback(
    async (input: { field: string; knownLeadUpdatedAt: string | null }) => {
      if (!selectedId) return { ok: false as const, reason: 'request_failed' as const }

      try {
        const result = await clearConversationRequiredIntakeOverride({
          conversationId: selectedId,
          organizationId,
          field: input.field,
          knownLeadUpdatedAt: input.knownLeadUpdatedAt,
        })

        if (!result.ok) {
          return result
        }

        setLead(result.lead)
        setConversations((previous) =>
          applyLeadStatusToConversationList(previous, selectedId, result.lead.status)
        )
        return { ok: true as const }
      } catch (error) {
        console.error('Failed to clear important info override', error)
        return { ok: false as const, reason: 'request_failed' as const }
      }
    },
    [organizationId, selectedId]
  )

  const handleSaveLeadService = useCallback(
    async (input: { service: string; knownLeadUpdatedAt: string | null }) => {
      if (!selectedId) return { ok: false as const, reason: 'request_failed' as const }

      try {
        const result = await setConversationLeadServiceOverride({
          conversationId: selectedId,
          organizationId,
          service: input.service,
          knownLeadUpdatedAt: input.knownLeadUpdatedAt,
        })

        if (!result.ok) {
          return result
        }

        setLead(result.lead)
        setConversations((previous) =>
          applyLeadStatusToConversationList(previous, selectedId, result.lead.status)
        )
        return { ok: true as const }
      } catch (error) {
        console.error('Failed to save lead service override', error)
        return { ok: false as const, reason: 'request_failed' as const }
      }
    },
    [organizationId, selectedId]
  )

  const handleReturnLeadServiceToAi = useCallback(
    async (input: { knownLeadUpdatedAt: string | null }) => {
      if (!selectedId) return { ok: false as const, reason: 'request_failed' as const }

      try {
        const result = await clearConversationLeadServiceOverride({
          conversationId: selectedId,
          organizationId,
          knownLeadUpdatedAt: input.knownLeadUpdatedAt,
        })

        if (!result.ok) {
          return result
        }

        setLead(result.lead)
        setConversations((previous) =>
          applyLeadStatusToConversationList(previous, selectedId, result.lead.status)
        )
        return { ok: true as const }
      } catch (error) {
        console.error('Failed to clear lead service override', error)
        return { ok: false as const, reason: 'request_failed' as const }
      }
    },
    [organizationId, selectedId]
  )

  const handleSaveConversationTags = useCallback(
    async (userTags: string[]) => {
      if (!selectedId) return { ok: false as const, reason: 'request_failed' as const }
      const currentConversation = conversations.find(
        (conversation) => conversation.id === selectedId
      )
      const preservedSystemTags = splitConversationTags(currentConversation?.tags ?? []).systemTags

      try {
        const result = await updateConversationTags({
          conversationId: selectedId,
          organizationId,
          tags: mergeConversationTags({
            systemTags: preservedSystemTags,
            userTags,
          }),
        })

        if (!result.ok) {
          return result
        }

        updateConversationDetailsLocally(selectedId, {
          tags: result.conversation.tags,
          updated_at: result.conversation.updated_at,
        })
        return { ok: true as const }
      } catch (error) {
        console.error('Failed to save conversation tags', error)
        return { ok: false as const, reason: 'request_failed' as const }
      }
    },
    [conversations, organizationId, selectedId, updateConversationDetailsLocally]
  )

  const handleSaveConversationPrivateNote = useCallback(
    async (input: { note: string; knownPrivateNoteUpdatedAt: string | null }) => {
      if (!selectedId) return { ok: false as const, reason: 'request_failed' as const }

      try {
        const result = await updateConversationPrivateNote({
          conversationId: selectedId,
          organizationId,
          note: input.note,
          knownPrivateNoteUpdatedAt: input.knownPrivateNoteUpdatedAt,
        })

        if (!result.ok) {
          return result
        }

        updateConversationDetailsLocally(selectedId, {
          private_note: result.conversation.private_note,
          private_note_updated_at: result.conversation.private_note_updated_at,
          private_note_updated_by: result.conversation.private_note_updated_by,
          updated_at: result.conversation.updated_at,
        })
        return { ok: true as const }
      } catch (error) {
        console.error('Failed to save private note', error)
        return { ok: false as const, reason: 'request_failed' as const }
      }
    },
    [organizationId, selectedId, updateConversationDetailsLocally]
  )

  const handleOpenAttachmentPicker = () => {
    if (isReadOnly) return
    if (!isWhatsAppConversation) {
      setComposerErrorMessage(t('composerAttachments.errors.notSupportedPlatform'))
      return
    }
    attachmentInputRef.current?.click()
  }

  const handleOpenImagePicker = () => {
    if (isReadOnly) return
    if (!supportsImageAttachments) {
      setComposerErrorMessage(t('composerAttachments.errors.notSupportedPlatform'))
      return
    }
    imageInputRef.current?.click()
  }

  const handleRemovePendingAttachment = (attachmentId: string) => {
    if (previewAttachmentId === attachmentId) {
      setPreviewAttachmentId(null)
    }
    setPendingAttachments((previous) => {
      const target = previous.find((attachment) => attachment.id === attachmentId)
      if (target) {
        revokeAttachmentPreviewUrl(target.previewUrl)
      }
      return previous.filter((attachment) => attachment.id !== attachmentId)
    })
  }

  const handleAttachmentSelection = (
    files: File[],
    options?: {
      truncateToAvailableSlots?: boolean
    }
  ) => {
    if (files.length === 0) return
    if (!supportsImageAttachments) {
      setComposerErrorMessage(t('composerAttachments.errors.notSupportedPlatform'))
      return
    }

    const availableSlots = Math.max(0, maxAttachmentCount - pendingAttachments.length)
    const selectedFiles = options?.truncateToAvailableSlots ? files.slice(0, availableSlots) : files

    if (selectedFiles.length === 0) {
      setComposerErrorMessage(
        t('composerAttachments.errors.maxCount', { count: maxAttachmentCount })
      )
      return
    }

    const existingDrafts = pendingAttachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    }))
    const incomingDrafts = selectedFiles.map((file) => ({
      id: makePendingAttachmentId(),
      name: file.name,
      mimeType: file.type.trim().toLowerCase(),
      sizeBytes: file.size,
    }))

    const validationResult = isInstagramConversation
      ? validateInstagramOutboundImageAttachments([...existingDrafts, ...incomingDrafts])
      : validateWhatsAppOutboundAttachments([...existingDrafts, ...incomingDrafts])
    if (!validationResult.ok) {
      const message = resolveAttachmentValidationErrorMessage({
        validationResult,
        drafts: [...existingDrafts, ...incomingDrafts],
        platform: isInstagramConversation ? 'instagram' : 'whatsapp',
      })
      setComposerErrorMessage(
        message ??
          (isInstagramConversation
            ? t('composerAttachments.errors.invalidTypeInstagram')
            : t('composerAttachments.errors.invalidType'))
      )
      return
    }

    const normalizedById = new Map(
      validationResult.attachments.map((attachment) => [attachment.id, attachment])
    )
    const nextAttachments: PendingAttachment[] = incomingDrafts.flatMap((draft, index) => {
      const normalized = normalizedById.get(draft.id)
      const sourceFile = selectedFiles[index]
      if (!normalized || !sourceFile) return []

      return [
        {
          id: draft.id,
          file: sourceFile,
          name: draft.name,
          mimeType: draft.mimeType,
          sizeBytes: draft.sizeBytes,
          mediaType: normalized.mediaType,
          previewUrl: normalized.mediaType === 'image' ? URL.createObjectURL(sourceFile) : null,
        },
      ]
    })

    setPendingAttachments((previous) => [...previous, ...nextAttachments])
    setComposerErrorMessage(null)
  }

  const handleAttachmentInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.currentTarget.value = ''
    if (files.length === 0) return
    handleAttachmentSelection(files)
  }

  const handleInputPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (isReadOnly || isComposerDisabled || !supportsImageAttachments) return

    const pastedImages = extractImageFilesFromClipboard(event)
    if (pastedImages.length === 0) return

    event.preventDefault()
    handleAttachmentSelection(pastedImages, {
      truncateToAvailableSlots: true,
    })
  }

  const resolveMediaSendErrorMessage = (reason: string, maxAllowed?: number) => {
    if (reason === 'missing_channel') {
      return isInstagramConversation
        ? t('composerAttachments.errors.missingInstagramChannel')
        : t('composerAttachments.errors.missingChannel')
    }
    if (reason === 'billing_locked') return t('composerAttachments.errors.billingLocked')
    if (reason === 'reply_blocked') return t('composerAttachments.errors.replyWindowBlocked')
    if (reason === 'missing_inbound')
      return t('composerAttachments.errors.instagramInboundRequired')
    if (reason === 'too_many_attachments') {
      return t('composerAttachments.errors.maxCount', {
        count: maxAllowed ?? maxAttachmentCount,
      })
    }
    if (reason === 'invalid_attachment') {
      return isInstagramConversation
        ? t('composerAttachments.errors.invalidTypeInstagram')
        : t('composerAttachments.errors.invalidType')
    }
    if (reason === 'validation') return t('composerAttachments.errors.validation')
    return t('composerAttachments.errors.sendFailed')
  }

  const resolveTextSendErrorMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error ?? '')
    const normalized = message.toLowerCase()

    if (
      normalized.includes('cannot parse access token') ||
      normalized.includes('invalid oauth access token')
    ) {
      return t('sendErrors.instagramTokenInvalid')
    }

    if (
      normalized.includes('permission') ||
      normalized.includes('not authorized') ||
      normalized.includes('thread control') ||
      normalized.includes('cannot send message') ||
      normalized.includes('not allowed') ||
      normalized.includes('request thread') ||
      normalized.includes('recipient')
    ) {
      return t('sendErrors.instagramPermission')
    }

    return t('sendErrors.generic')
  }

  const handleSendMessage = async () => {
    if (isReadOnly) return
    if (!selectedId || isSending || isWhatsAppReplyBlocked) return

    const normalizedInput = input.trim()
    const selectedAttachments = [...pendingAttachments]
    if (!normalizedInput && selectedAttachments.length === 0) return
    if (selectedAttachments.length > 0 && !supportsImageAttachments) {
      setComposerErrorMessage(t('composerAttachments.errors.notSupportedPlatform'))
      return
    }

    const nowIso = new Date().toISOString()
    const optimisticAssignee: Assignee | null = currentUserProfile
      ? { full_name: currentUserProfile.full_name, email: currentUserProfile.email }
      : null

    const conversationId = selectedId
    const optimisticMessages: Message[] =
      selectedAttachments.length > 0
        ? [
            ...selectedAttachments.map((attachment, index) => {
              if (isInstagramConversation) {
                return {
                  id: `temp-media-${Date.now()}-${index}`,
                  conversation_id: conversationId,
                  sender_type: 'user' as const,
                  created_by: currentUserProfile?.id ?? null,
                  content: t('composerAttachments.outboundPlaceholderImage'),
                  metadata: {
                    outbound_delivery_status: 'pending',
                    outbound_channel: 'instagram',
                    instagram_outbound_status: 'sending',
                    instagram_outbound_attachment_id: attachment.id,
                    instagram_is_media_placeholder: true,
                    instagram_media: {
                      type: 'image',
                      mime_type: attachment.mimeType,
                      caption: null,
                      filename: attachment.name,
                      storage_path: null,
                      storage_url: attachment.previewUrl,
                      download_status: 'sending',
                    },
                  } as Message['metadata'],
                  created_at: new Date(Date.now() + index).toISOString(),
                }
              }

              const caption = resolveOutboundMediaCaption(normalizedInput, index)
              const content =
                caption ??
                (attachment.mediaType === 'image'
                  ? t('composerAttachments.outboundPlaceholderImage')
                  : t('composerAttachments.outboundPlaceholderDocument'))

              return {
                id: `temp-media-${Date.now()}-${index}`,
                conversation_id: conversationId,
                sender_type: 'user' as const,
                created_by: currentUserProfile?.id ?? null,
                content,
                metadata: {
                  outbound_delivery_status: 'pending',
                  outbound_channel: 'whatsapp',
                  whatsapp_outbound_status: 'sending',
                  whatsapp_outbound_attachment_id: attachment.id,
                  whatsapp_is_media_placeholder: !caption,
                  whatsapp_media: {
                    type: attachment.mediaType,
                    mime_type: attachment.mimeType,
                    caption,
                    filename: attachment.name,
                    storage_path: null,
                    storage_url: attachment.previewUrl,
                    download_status: 'sending',
                  },
                } as Message['metadata'],
                created_at: new Date(Date.now() + index).toISOString(),
              }
            }),
            ...(isInstagramConversation && normalizedInput
              ? [
                  {
                    id: `temp-text-${Date.now()}`,
                    conversation_id: conversationId,
                    sender_type: 'user' as const,
                    created_by: currentUserProfile?.id ?? null,
                    content: normalizedInput,
                    metadata: {
                      outbound_delivery_status: 'pending',
                      outbound_channel: 'instagram',
                    } as Message['metadata'],
                    created_at: new Date(Date.now() + selectedAttachments.length).toISOString(),
                  },
                ]
              : []),
          ]
        : [
            {
              id: `temp-${Date.now()}`,
              conversation_id: conversationId,
              sender_type: 'user' as const,
              created_by: currentUserProfile?.id ?? null,
              content: normalizedInput,
              metadata: {
                outbound_delivery_status: 'pending',
                outbound_channel: isInstagramConversation ? 'instagram' : 'whatsapp',
              } as Message['metadata'],
              created_at: nowIso,
            },
          ]
    const optimisticPreviewMessage: Pick<
      Message,
      'content' | 'created_at' | 'sender_type' | 'metadata'
    > =
      selectedAttachments.length > 0
        ? {
            content: optimisticMessages[optimisticMessages.length - 1]?.content ?? normalizedInput,
            created_at: optimisticMessages[optimisticMessages.length - 1]?.created_at ?? nowIso,
            sender_type: 'user',
            metadata: optimisticMessages[optimisticMessages.length - 1]?.metadata ?? {},
          }
        : {
            content: normalizedInput,
            created_at: nowIso,
            sender_type: 'user',
            metadata: {},
          }

    setMessages((previous) => sortMessagesChronologically([...previous, ...optimisticMessages]))

    // Optimistically set active agent to operator
    setConversations((prev) =>
      prev
        .map((c) =>
          c.id === conversationId
            ? {
                ...c,
                active_agent: 'operator' as const,
                assignee_id: currentUserProfile?.id ?? c.assignee_id,
                assignee: optimisticAssignee ?? c.assignee,
                last_message_at: optimisticPreviewMessage.created_at,
                messages: [optimisticPreviewMessage],
              }
            : c
        )
        .sort(
          (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
        )
    )

    setInput('')
    clearPendingAttachments({
      preservePreviewUrls: selectedAttachments
        .map((attachment) => attachment.previewUrl)
        .filter((previewUrl): previewUrl is string => Boolean(previewUrl)),
    })
    setComposerErrorMessage(null)
    setIsSending(true)
    try {
      if (selectedAttachments.length > 0) {
        const prepareResult = isInstagramConversation
          ? await prepareConversationInstagramImageUploads({
              conversationId,
              attachments: selectedAttachments.map((attachment) => ({
                id: attachment.id,
                name: attachment.name,
                mimeType: attachment.mimeType,
                sizeBytes: attachment.sizeBytes,
              })),
            })
          : await prepareConversationWhatsAppMediaUploads({
              conversationId,
              attachments: selectedAttachments.map((attachment) => ({
                id: attachment.id,
                name: attachment.name,
                mimeType: attachment.mimeType,
                sizeBytes: attachment.sizeBytes,
              })),
            })

        if (!prepareResult.ok) {
          setComposerErrorMessage(
            resolveMediaSendErrorMessage(prepareResult.reason, prepareResult.maxAllowed)
          )
          markOptimisticMessagesAsFailed(optimisticMessages.map((message) => message.id))
          return
        }

        const uploadTargetsById = new Map(
          prepareResult.uploads.map((upload) => [upload.id, upload])
        )
        const uploadedAttachments: Array<
          | ConversationInstagramOutboundImageUploadTarget
          | ConversationWhatsAppOutboundAttachmentUploadTarget
        > = []

        for (const attachment of selectedAttachments) {
          const uploadTarget = uploadTargetsById.get(attachment.id)
          if (!uploadTarget) {
            throw new Error(`Missing upload target for attachment ${attachment.id}`)
          }

          const { error: uploadError } = await supabase.storage
            .from(INBOX_MEDIA_BUCKET)
            .uploadToSignedUrl(uploadTarget.storagePath, uploadTarget.uploadToken, attachment.file)
          if (uploadError) {
            throw uploadError
          }
          uploadedAttachments.push(uploadTarget)
        }

        const batchResult = isInstagramConversation
          ? await sendConversationInstagramImageBatch({
              conversationId,
              text: normalizedInput,
              attachments: uploadedAttachments as ConversationInstagramOutboundImageUploadTarget[],
            })
          : await sendConversationWhatsAppMediaBatch({
              conversationId,
              text: normalizedInput,
              attachments:
                uploadedAttachments as ConversationWhatsAppOutboundAttachmentUploadTarget[],
            })
        if (!batchResult.ok) {
          setComposerErrorMessage(resolveMediaSendErrorMessage(batchResult.reason))
          markOptimisticMessagesAsFailed(optimisticMessages.map((message) => message.id))
          return
        }

        if (batchResult.conversation) {
          const assignee = await resolveAssignee(batchResult.conversation.assignee_id ?? null)
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversationId
                ? {
                    ...c,
                    ...batchResult.conversation,
                    assignee: assignee ?? c.assignee,
                  }
                : c
            )
          )
        }
      } else {
        const result = await sendMessage(conversationId, normalizedInput)
        if (result?.conversation) {
          const assignee = await resolveAssignee(result.conversation.assignee_id ?? null)
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversationId
                ? {
                    ...c,
                    ...result.conversation,
                    assignee: assignee ?? c.assignee,
                  }
                : c
            )
          )
        }
      }
      await refreshMessages(conversationId)
    } catch (error) {
      console.error('Failed to send message', error)
      setComposerErrorMessage(
        selectedAttachments.length > 0
          ? t('composerAttachments.errors.sendFailed')
          : resolveTextSendErrorMessage(error)
      )
      markOptimisticMessagesAsFailed(optimisticMessages.map((message) => message.id))
    } finally {
      setIsSending(false)
    }
  }

  const handleOpenInWhatsAppPhone = () => {
    const activeConversation = conversations.find((conversation) => conversation.id === selectedId)
    const rawPhone = activeConversation?.contact_phone ?? ''
    const normalizedPhone = rawPhone.replace(/\D/g, '')
    if (!normalizedPhone) return
    window.open(`https://wa.me/${normalizedPhone}`, '_blank', 'noopener,noreferrer')
  }

  const handleDeleteConversation = () => {
    if (isReadOnly) return
    if (!selectedId) return
    setDeleteDialog({ isOpen: true, isLoading: false })
  }

  const handleConfirmDelete = async () => {
    if (isReadOnly) return
    if (!selectedId) return

    setDeleteDialog((prev) => ({ ...prev, isLoading: true }))
    try {
      await deleteConversation(selectedId)
      setConversations((prev) => prev.filter((c) => c.id !== selectedId))
      setSelectedId(null)
      setDeleteDialog({ isOpen: false, isLoading: false })
    } catch (error) {
      console.error('Failed to delete conversation', error)
      setDeleteDialog((prev) => ({ ...prev, isLoading: false }))
    }
  }

  const handleLeaveConversation = async () => {
    if (isReadOnly) return
    if (!selectedId || isLeaving) return

    setIsLeaving(true)
    const content = `${t('operator')} ${t('leftSession')}`

    // Optimistic update
    const tempMsg: Message = {
      id: 'temp-sys-' + Date.now(),
      conversation_id: selectedId,
      sender_type: 'system',
      content: content,
      metadata: {},
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempMsg])

    try {
      // Send a system message to mark the end of operator session
      await sendSystemMessage(selectedId, content)
      // Explicitly set agent back to bot
      await setConversationAgent(selectedId, 'bot')

      // Update local state
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, active_agent: 'bot' } : c))
      )
    } catch (e) {
      console.error(e)
      // Ideally remove optimistic message here on fail
    } finally {
      setIsLeaving(false)
    }
  }

  const handleSelectConversation = (conversationId: string) => {
    if (conversationId === selectedIdRef.current) {
      setIsMobileConversationOpen(true)
      return
    }
    const previousSelectedId = selectedIdRef.current
    const nextConversation =
      conversations.find((conversation) => conversation.id === conversationId) ?? null
    if (previousSelectedId) {
      void commitConversationRead(previousSelectedId)
    }
    if (
      shouldClearManualUnreadOnSelect({
        previousSelectedId,
        nextSelectedId: conversationId,
        nextConversation,
      })
    ) {
      updateConversationDetailsLocally(conversationId, {
        unread_count: 0,
        manual_unread: false,
      })
      void markConversationRead(conversationId)
        .then(() => {
          dispatchInboxUnreadUpdated({ organizationId })
        })
        .catch((error) => {
          console.error('Failed to clear manual unread on revisit', error)
        })
    }
    setSelectedId(conversationId)
    setIsMobileConversationOpen(true)
  }

  const handleToggleSelectedConversationUnread = useCallback(async () => {
    const conversationId = selectedIdRef.current
    if (!conversationId || isReadOnly || isUnreadTogglePending) return

    const currentConversation =
      conversations.find((conversation) => conversation.id === conversationId) ?? null
    if (!currentConversation) return

    const nextIsUnread = currentConversation.unread_count <= 0
    const optimisticUpdates = nextIsUnread
      ? { unread_count: 1, manual_unread: true }
      : { unread_count: 0, manual_unread: false }

    updateConversationDetailsLocally(conversationId, optimisticUpdates)
    setIsUnreadTogglePending(true)

    try {
      if (nextIsUnread) {
        await markConversationUnread(conversationId)
      } else {
        await markConversationRead(conversationId)
      }
      dispatchInboxUnreadUpdated({ organizationId })
    } catch (error) {
      console.error('Failed to toggle conversation unread state', error)
      updateConversationDetailsLocally(conversationId, {
        unread_count: currentConversation.unread_count,
        manual_unread: Boolean(currentConversation.manual_unread),
      })
    } finally {
      setIsUnreadTogglePending(false)
    }
  }, [
    conversations,
    isReadOnly,
    isUnreadTogglePending,
    organizationId,
    updateConversationDetailsLocally,
  ])

  const handleBackToConversationList = () => {
    setIsMobileConversationOpen(false)
    setIsMobileDetailsOpen(false)
  }

  const currentUserId = currentUserProfile?.id ?? null
  const effectiveQueueTab: InboxQueueTab =
    activeQueueTab === 'me' && !currentUserId ? 'all' : activeQueueTab
  const queueCounts = summarizeConversationQueueCounts({
    conversations,
    currentUserId,
  })
  const queueFilteredConversations = filterConversationsByQueue({
    conversations,
    queue: effectiveQueueTab,
    currentUserId,
  })
  const filteredConversations = applyInboxListFilters({
    conversations: queueFilteredConversations,
    unreadFilter,
    leadTemperatureFilter,
  })
  const hasActiveConversationFilters = hasActiveInboxListFilters({
    unreadFilter,
    leadTemperatureFilter,
  })
  const filterBackfillState = resolveFilteredConversationBackfillState({
    hasActiveFilters: hasActiveConversationFilters,
    filteredConversationCount: filteredConversations.length,
    hasMoreConversations: hasMore,
    isLoadingMoreConversations: loadingMore,
  })

  useEffect(() => {
    if (isResettingConversationListRef.current) return
    if (!filterBackfillState.shouldLoadMore) return
    void loadMoreConversations()
  }, [filterBackfillState.shouldLoadMore, loadMoreConversations])

  useEffect(() => {
    if (filteredConversations.length === 0) {
      if (selectedId !== null) {
        setSelectedId(null)
      }
      return
    }

    const selectedExistsInQueue = selectedId
      ? filteredConversations.some((conversation) => conversation.id === selectedId)
      : false

    if (!selectedId || !selectedExistsInQueue) {
      setSelectedId(filteredConversations[0]?.id ?? null)
    }
  }, [filteredConversations, selectedId])

  const renderConversationListContent = () => (
    <>
      {filterBackfillState.shouldShowEmptyState ? (
        <div className="flex h-full flex-col items-center justify-start p-6 pt-20 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <Inbox className="text-gray-400" size={24} />
          </div>
          <h3 className="text-sm font-medium text-gray-900">
            {hasActiveConversationFilters
              ? t('conversationFiltersNoMatchesTitle')
              : t('noMessages')}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            {hasActiveConversationFilters
              ? t('conversationFiltersNoMatchesDescription')
              : t('noMessagesDesc')}
          </p>
        </div>
      ) : filteredConversations.length === 0 ? (
        <div className="flex h-full items-center justify-center p-6">
          <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-blue-500" />
        </div>
      ) : (
        filteredConversations.map((c) => {
          const contactDisplayName = resolveInboxContactDisplayName(c)
          const previewMessage = resolveLatestNonSeenPreviewMessage(c.platform, c.messages)
          const leadStatus = c.leads?.[0]?.status
          const leadStatusLabel = leadStatus ? (leadStatusLabels[leadStatus] ?? leadStatus) : null
          const leadChipClassName =
            leadStatus === 'hot'
              ? 'border-red-100 bg-red-50 text-red-700'
              : leadStatus === 'warm'
                ? 'border-amber-100 bg-amber-50 text-amber-700'
                : leadStatus === 'cold'
                  ? 'border-slate-200 bg-slate-100 text-slate-600'
                  : 'border-gray-200 bg-gray-100 text-gray-600'
          const attentionReasonLabel =
            c.human_attention_reason === 'skill_handover'
              ? t('queueAttentionReasonSkill')
              : c.human_attention_reason === 'hot_lead'
                ? t('queueAttentionReasonHotLead')
                : null
          const reactionPreviewContent = previewMessage
            ? resolveInstagramReactionSummary({
                metadata: previewMessage.metadata,
                content: previewMessage.content,
                labels: instagramReactionLabels,
              })
            : null
          const previewContent =
            reactionPreviewContent ??
            resolveMessagePreviewContent({
              content: previewMessage?.content,
              metadata: previewMessage?.metadata,
              senderType: previewMessage?.sender_type,
              fallbackNoMessage: t('noMessagesYet'),
              unsupportedInstagramAttachment: t('mediaPreview.instagramUnsupported'),
              labels: {
                image: t('mediaPreview.image'),
                document: t('mediaPreview.document'),
                audio: t('mediaPreview.audio'),
                video: t('mediaPreview.video'),
                sticker: t('mediaPreview.sticker'),
                media: t('mediaPreview.media'),
                imageSent: t('mediaPreview.imageSent'),
                documentSent: t('mediaPreview.documentSent'),
                audioSent: t('mediaPreview.audioSent'),
                videoSent: t('mediaPreview.videoSent'),
                stickerSent: t('mediaPreview.stickerSent'),
                mediaSent: t('mediaPreview.mediaSent'),
              },
            })
          const isInstagramRequestPreview = isInstagramRequestConversation(c)

          return (
            <div
              key={c.id}
              onClick={() => handleSelectConversation(c.id)}
              className={`relative cursor-pointer border-b border-gray-100 px-4 py-4 transition-colors group ${selectedId === c.id ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'}`}
            >
              <div className="flex items-start gap-3">
                <div className="relative shrink-0">
                  <Avatar name={contactDisplayName} src={c.contact_avatar_url} size="sm" />
                  <div className="absolute left-1/2 top-full -mt-2 -translate-x-1/2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border-[0.5px] border-white/50 bg-white shadow-sm">
                      {c.platform !== 'simulator' ? (
                        <NextImage
                          alt=""
                          aria-hidden
                          className="h-[18px] w-[18px]"
                          src={getChannelPlatformIconSrc(c.platform)}
                          width={18}
                          height={18}
                        />
                      ) : (
                        <span className="text-[9px] font-semibold uppercase text-gray-400">
                          {t('platformSimulatorShort')}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                <div className="min-w-0 flex-1 pr-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`truncate text-sm font-semibold ${c.unread_count > 0 ? 'text-gray-900' : 'text-gray-700'}`}
                    >
                      {contactDisplayName}
                    </span>
                    <div className="ml-auto flex items-center gap-1.5">
                      {isInstagramRequestPreview && (
                        <span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          {t('instagramRequestBadge')}
                        </span>
                      )}
                      {leadStatusLabel && (
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${leadChipClassName}`}
                        >
                          {leadStatusLabel}
                        </span>
                      )}
                      {effectiveQueueTab === 'all' && c.human_attention_required && (
                        <span
                          title={
                            attentionReasonLabel
                              ? `${t('queueAttentionRequired')} · ${attentionReasonLabel}`
                              : t('queueAttentionRequired')
                          }
                          aria-label={
                            attentionReasonLabel
                              ? `${t('queueAttentionRequired')} · ${attentionReasonLabel}`
                              : t('queueAttentionRequired')
                          }
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[12px] font-bold text-white"
                        >
                          !
                        </span>
                      )}
                    </div>
                  </div>
                  <p
                    className={`mt-0.5 flex items-center gap-1.5 truncate text-sm leading-relaxed ${c.unread_count > 0 ? 'font-semibold text-gray-900' : 'text-gray-500'}`}
                  >
                    {previewMessage &&
                      (previewMessage.sender_type === 'contact' ? (
                        <FaArrowTurnDown className="shrink-0 text-gray-400" size={10} />
                      ) : (
                        <FaArrowTurnUp className="shrink-0 text-gray-400" size={10} />
                      ))}
                    {previewContent && <span className="truncate">{previewContent}</span>}
                  </p>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {formatRelativeTimeFromBase({
                        targetIso: c.last_message_at,
                        baseDate: relativeTimeBaseDate,
                        locale: dateLocale,
                      }) || ''}
                    </span>
                    {c.unread_count > 0 && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                  </div>
                </div>
              </div>
              {selectedId === c.id && (
                <div className="absolute bottom-0 left-0 top-0 w-0.5 bg-blue-500"></div>
              )}
            </div>
          )
        })
      )}
      {loadingMore && filteredConversations.length > 0 && (
        <div className="flex justify-center p-4">
          <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-blue-500"></div>
        </div>
      )}
    </>
  )

  const selectedConversation = conversations.find((c) => c.id === selectedId)
  const showConversationSkeleton = shouldShowConversationSkeleton(
    selectedConversation?.id ?? null,
    loadedConversationId
  )
  const visibleMessages = useMemo(
    () => (showConversationSkeleton ? EMPTY_VISIBLE_MESSAGES : messages),
    [messages, showConversationSkeleton]
  )
  const selectedConversationDisplayName = selectedConversation
    ? resolveInboxContactDisplayName(selectedConversation, visibleMessages)
    : ''
  const selectedConversationSecondaryIdentifier = selectedConversation
    ? resolveConversationSecondaryIdentifier(selectedConversation, t('noPhoneNumber'))
    : null
  const selectedConversationAvatarUrl = selectedConversation?.contact_avatar_url ?? null
  const isSelectedConversationUnread = (selectedConversation?.unread_count ?? 0) > 0
  const selectedConversationUnreadActionLabel = isSelectedConversationUnread
    ? t('markConversationRead')
    : t('markConversationUnread')
  const selectedConversationPrivateNote =
    typeof selectedConversation?.private_note === 'string' ? selectedConversation.private_note : ''
  const selectedConversationPrivateNoteUpdatedAt =
    typeof selectedConversation?.private_note_updated_at === 'string'
      ? selectedConversation.private_note_updated_at
      : null
  const importantInfoEditorLabels = {
    ai: t('leadRequiredInfoAi'),
    manual: t('leadRequiredInfoManual'),
    add: t('leadRequiredInfoAdd'),
    edit: t('leadRequiredInfoEdit'),
    save: t('leadRequiredInfoSave'),
    cancel: t('cancel'),
    returnToAi: t('leadRequiredInfoReturnToAi'),
    empty: t('leadRequiredInfoEmpty'),
    missing: t('leadRequiredInfoMissing'),
    validation: t('leadRequiredInfoValidation'),
    requestFailed: t('leadRequiredInfoSaveError'),
    staleConflict: t('leadRequiredInfoConflict'),
  }
  const importantInfoSummaryLabels = {
    empty: t('leadRequiredInfoEmpty'),
    missing: t('leadRequiredInfoMissing'),
  }
  const leadServiceEditorLabels = {
    empty: t('leadUnknown'),
    edit: t('leadServiceEdit'),
    save: t('leadServiceSave'),
    cancel: t('cancel'),
    selectPlaceholder: t('leadServiceSelectPlaceholder'),
    returnToAi: t('leadRequiredInfoReturnToAi'),
    noCatalog: t('leadServiceNoCatalog'),
    requestFailed: t('leadServiceSaveError'),
    staleConflict: t('leadServiceConflict'),
    validation: t('leadServiceValidation'),
  }
  const tagEditorLabels = {
    noTags: t('noTags'),
    add: t('addTag'),
    cancel: t('cancel'),
    placeholder: t('tagsPlaceholder'),
    validationTooLong: t('tagValidationTooLong'),
    validationTooMany: t('tagValidationTooMany'),
    requestFailed: t('tagSaveError'),
  }
  const privateNoteLabels = {
    add: t('privateNoteAdd'),
    cancel: t('cancel'),
    placeholder: t('privateNotePlaceholder'),
    save: t('privateNoteSave'),
    requestFailed: t('privateNoteSaveError'),
    staleConflict: t('privateNoteConflict'),
  }
  const editableConversationTags = splitConversationTags(selectedConversation?.tags ?? []).userTags
  const privateNoteUpdatedByLabel = (() => {
    const updatedById = selectedConversation?.private_note_updated_by?.trim()
    if (!updatedById) return null
    if (updatedById === currentUserProfile?.id) {
      return currentUserProfile.full_name ?? currentUserProfile.email ?? updatedById
    }
    const senderProfile = senderProfilesById[updatedById]
    if (senderProfile) {
      return senderProfile.full_name ?? senderProfile.email ?? updatedById
    }
    const cachedAssignee = assigneeCacheRef.current[updatedById]
    if (cachedAssignee) {
      return cachedAssignee.full_name ?? cachedAssignee.email ?? updatedById
    }
    return updatedById
  })()
  const privateNoteUpdatedAtText = (() => {
    const updatedAt = selectedConversation?.private_note_updated_at
    if (!updatedAt) return null
    const parsed = new Date(updatedAt)
    if (Number.isNaN(parsed.getTime())) return null
    return format(parsed, 'PP p', { locale: dateLocale })
  })()
  const isSelectedConversationInstagramRequest = selectedConversation
    ? isInstagramRequestConversation(selectedConversation, visibleMessages)
    : false
  const dateSeparatorSourceMessages = useMemo(
    () =>
      filterTimelineMessagesForDateSeparators(
        selectedConversation?.platform ?? null,
        visibleMessages
      ),
    [selectedConversation?.platform, visibleMessages]
  )
  const messageDateSeparatorById = new Map(
    buildMessageDateSeparators({
      messages: dateSeparatorSourceMessages,
      now: relativeTimeBaseDate,
      todayLabel: t('today'),
      yesterdayLabel: t('yesterday'),
      dateLocale,
    }).map((separator) => [separator.messageId, separator.label])
  )
  const imageGalleryLookup = useMemo(
    () => buildInboxImageGalleryLookup(visibleMessages),
    [visibleMessages]
  )
  const instagramMessagesByProviderId = useMemo(() => {
    const map = new Map<string, Message>()
    if (selectedConversation?.platform !== 'instagram') return map

    for (const message of visibleMessages) {
      const providerMessageId = resolveInstagramProviderMessageId(message.metadata)
      if (!providerMessageId) continue
      map.set(providerMessageId, message)
    }

    return map
  }, [selectedConversation?.platform, visibleMessages])
  const instagramSeenIndicatorByMessageId = useMemo(() => {
    const map = new Map<string, { seenAt: string }>()
    if (selectedConversation?.platform !== 'instagram') return map
    if (visibleMessages.length === 0) return map

    let latestOutboundUserMessageId: string | null = null
    for (const message of visibleMessages) {
      if (message.sender_type === 'user') {
        latestOutboundUserMessageId = message.id
        continue
      }

      if (
        !isInstagramSeenEventMessage({
          platform: 'instagram',
          senderType: message.sender_type,
          metadata: message.metadata,
          content: message.content,
        })
      ) {
        continue
      }

      if (latestOutboundUserMessageId) {
        map.set(latestOutboundUserMessageId, { seenAt: message.created_at })
      }
    }

    return map
  }, [selectedConversation?.platform, visibleMessages])
  const isWhatsAppConversation = selectedConversation?.platform === 'whatsapp'
  const isInstagramConversation = selectedConversation?.platform === 'instagram'
  const supportsImageAttachments = isWhatsAppConversation || isInstagramConversation
  const maxAttachmentCount = isInstagramConversation
    ? MAX_INSTAGRAM_OUTBOUND_ATTACHMENTS
    : MAX_WHATSAPP_OUTBOUND_ATTACHMENTS
  const latestWhatsAppInboundAt =
    isWhatsAppConversation && !showConversationSkeleton
      ? getLatestContactMessageAt(visibleMessages)
      : null
  const whatsappReplyWindowState =
    isWhatsAppConversation && !showConversationSkeleton
      ? resolveWhatsAppReplyWindowState({
          latestInboundAt: latestWhatsAppInboundAt,
        })
      : null
  const isWhatsAppReplyBlocked = Boolean(
    whatsappReplyWindowState && !whatsappReplyWindowState.canReply
  )
  const isWhatsAppWindowExpired = whatsappReplyWindowState?.reason === 'window_expired'
  const isWhatsAppMissingInbound = whatsappReplyWindowState?.reason === 'missing_inbound'
  const whatsappReplyBlockedTooltip =
    whatsappReplyWindowState?.reason === 'window_expired'
      ? t('whatsappReplyWindow.tooltipExpired')
      : t('whatsappReplyWindow.tooltipNoInbound')
  const whatsappComposerOverlayMessage =
    whatsappReplyWindowState?.reason === 'window_expired'
      ? t('whatsappReplyWindow.composerLockedExpired')
      : t('whatsappReplyWindow.composerLockedNoInbound')
  const canOpenWhatsAppPhone = Boolean(
    (selectedConversation?.contact_phone ?? '').replace(/\D/g, '')
  )
  const resolveMediaPreviewLabel = (
    mediaType: string | null | undefined,
    senderType: string | null | undefined
  ) => {
    return resolveDirectionalMediaPreviewLabel({
      mediaType,
      senderType,
      labels: {
        image: t('mediaPreview.image'),
        document: t('mediaPreview.document'),
        audio: t('mediaPreview.audio'),
        video: t('mediaPreview.video'),
        sticker: t('mediaPreview.sticker'),
        media: t('mediaPreview.media'),
        imageSent: t('mediaPreview.imageSent'),
        documentSent: t('mediaPreview.documentSent'),
        audioSent: t('mediaPreview.audioSent'),
        videoSent: t('mediaPreview.videoSent'),
        stickerSent: t('mediaPreview.stickerSent'),
        mediaSent: t('mediaPreview.mediaSent'),
      },
    })
  }

  const resolvedBotMode = inboxBotMode
  const botModeToneClassMap = {
    emerald: {
      surface: 'border-emerald-200 bg-emerald-100/85 text-emerald-950 hover:bg-emerald-100',
      badge: 'bg-emerald-200/70 text-emerald-900',
      dot: 'bg-emerald-500',
      selected: 'border-emerald-300 bg-emerald-50',
      selectedIcon: 'bg-emerald-100 text-emerald-700',
      hover: 'hover:border-emerald-200 hover:bg-emerald-50/60',
    },
    amber: {
      surface: 'border-amber-200 bg-amber-100/85 text-amber-950 hover:bg-amber-100',
      badge: 'bg-amber-200/70 text-amber-900',
      dot: 'bg-amber-500',
      selected: 'border-amber-300 bg-amber-50',
      selectedIcon: 'bg-amber-100 text-amber-700',
      hover: 'hover:border-amber-200 hover:bg-amber-50/60',
    },
    rose: {
      surface: 'border-rose-200 bg-rose-100/85 text-rose-950 hover:bg-rose-100',
      badge: 'bg-rose-200/70 text-rose-900',
      dot: 'bg-rose-500',
      selected: 'border-rose-300 bg-rose-50',
      selectedIcon: 'bg-rose-100 text-rose-700',
      hover: 'hover:border-rose-200 hover:bg-rose-50/60',
    },
  } as const
  const botModeOptions = useMemo<
    Array<{ value: AiBotMode; label: string; description: string }>
  >(() => {
    return [
      {
        value: 'active',
        label: tAiSettings('botModeActive'),
        description: tAiSettings('botModeActiveDescription'),
      },
      {
        value: 'shadow',
        label: tAiSettings('botModeShadow'),
        description: tAiSettings('botModeShadowDescription'),
      },
      {
        value: 'off',
        label: tAiSettings('botModeOff'),
        description: tAiSettings('botModeOffDescription'),
      },
    ]
  }, [tAiSettings])
  const botModeLabel = useMemo(() => {
    if (resolvedBotMode === 'shadow') return tSidebar('botStatusShadow')
    if (resolvedBotMode === 'off') return tSidebar('botStatusOff')
    return tSidebar('botStatusActive')
  }, [resolvedBotMode, tSidebar])
  const botModeTone = resolveMainSidebarBotModeTone(resolvedBotMode)
  const currentBotModeToneClasses = botModeToneClassMap[botModeTone]
  const canQuickSwitchBotMode = Boolean(organizationId) && !isReadOnly
  const botModeQuickSwitchHelperText = canQuickSwitchBotMode
    ? tSidebar('botStatusQuickSwitchHelp')
    : tSidebar('botStatusQuickSwitchReadOnly')
  const handleMobileBotModeChange = useCallback(
    async (nextBotMode: AiBotMode) => {
      if (!canQuickSwitchBotMode || isMobileBotModeUpdating) return
      if (nextBotMode === inboxBotMode) return

      const previousBotMode = inboxBotMode
      setInboxBotMode(nextBotMode)
      setIsMobileBotModeUpdating(true)
      setMobileBotModeUpdateError(null)

      try {
        const savedSettings = await updateOrgAiSettings({
          bot_mode: nextBotMode,
        })
        setInboxBotMode(savedSettings.bot_mode)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ai-settings-updated'))
        }
      } catch (error) {
        console.error('Failed to quick switch inbox bot mode', error)
        setInboxBotMode(previousBotMode)
        setMobileBotModeUpdateError(tSidebar('botStatusQuickSaveError'))
      } finally {
        setIsMobileBotModeUpdating(false)
      }
    },
    [canQuickSwitchBotMode, inboxBotMode, isMobileBotModeUpdating, tSidebar]
  )
  // NEW: Use explicit state from conversation
  // Fallback to 'ai' (bot) if undefined (e.g. old data or optimistic new conv)
  const activeAgent = selectedConversation?.active_agent === 'operator' ? 'operator' : 'ai'
  const assistantBanner = resolveAssistantBanner({
    activeAgent,
    botMode: resolvedBotMode,
  })
  const inputPlaceholder = activeAgent === 'ai' ? t('takeOverPlaceholder') : t('replyPlaceholder')
  const isComposerDisabled = isReadOnly || showConversationSkeleton || isWhatsAppReplyBlocked
  const isAttachmentPickerDisabled = isComposerDisabled || !supportsImageAttachments
  const isDocumentAttachmentPickerDisabled = isComposerDisabled || !isWhatsAppConversation
  const isTemplatePickerDisabled =
    isReadOnly || showConversationSkeleton || (isWhatsAppConversation && isWhatsAppReplyBlocked)
  const hasMessageInput = Boolean(input.trim())
  const hasPendingAttachments = pendingAttachments.length > 0
  const canSend = (hasMessageInput || hasPendingAttachments) && !isSending && !isComposerDisabled
  const contactMessageCount = visibleMessages.filter((m) => m.sender_type === 'contact').length
  const previewAttachment =
    pendingAttachments.find((attachment) => attachment.id === previewAttachmentId) ?? null
  const formatAttachmentSize = useCallback(
    (sizeBytes: number) => {
      const sizeInMb = sizeBytes / (1024 * 1024)
      if (sizeInMb >= 1) {
        return t('composerAttachments.sizeMb', {
          size: sizeInMb.toFixed(1),
        })
      }
      const sizeInKb = Math.max(1, Math.round(sizeBytes / 1024))
      return t('composerAttachments.sizeKb', { size: sizeInKb })
    },
    [t]
  )
  const canSummarize = contactMessageCount >= 3
  const summaryHeaderDisabled = !canSummarize
  const summaryRefreshDisabled = !canSummarize || summaryStatus === 'loading'
  const showSummaryRefresh =
    isSummaryOpen && (summaryStatus === 'success' || summaryStatus === 'error')
  const scoreReasonMessage =
    scoreReasonError === 'missing_api_key'
      ? t('scoreReasonMissing')
      : scoreReasonError === 'missing_lead'
        ? t('scoreReasonNoLead')
        : scoreReasonError === 'billing_locked'
          ? t('scoreReasonBillingLocked')
          : t('scoreReasonError')
  const operatorActive = isOperatorActive(selectedConversation)
  const allowDuringOperator = Boolean(allowLeadExtractionDuringOperator)
  const conversationAiPaused = Boolean(selectedConversation?.ai_processing_paused)
  const leadExtractionPaused =
    Boolean(selectedConversation) &&
    (conversationAiPaused || resolvedBotMode === 'off' || (operatorActive && !allowDuringOperator))
  const pauseReasons: string[] = []
  if (conversationAiPaused) pauseReasons.push(t('leadPausedReasonConversation'))
  if (operatorActive && !allowDuringOperator) pauseReasons.push(t('leadPausedReasonOperator'))
  if (resolvedBotMode === 'off') pauseReasons.push(t('leadPausedReasonAiOff'))
  const pauseReasonText = pauseReasons.join(t('leadPausedReasonSeparator'))
  const leadRefreshMessage =
    leadRefreshError === 'missing_api_key'
      ? t('leadRefreshMissing')
      : leadRefreshError === 'missing_conversation'
        ? t('leadRefreshMissingConversation')
        : leadRefreshError === 'billing_locked'
          ? t('leadRefreshBillingLocked')
          : leadRefreshError === 'paused'
            ? t('leadRefreshPaused')
            : t('leadRefreshError')
  const isLeadUpdating = leadRefreshStatus === 'loading' || leadAutoRefreshStatus === 'loading'
  const formattedConversationCredits = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(selectedConversation?.ai_usage_total_credits ?? 0)
  const conversationCreditValue = t('creditUsageValue', { credits: formattedConversationCredits })
  const mobileListPaneClasses = getMobileListPaneClasses(isMobileConversationOpen)
  const mobileConversationPaneClasses = getMobileConversationPaneClasses(isMobileConversationOpen)
  const mobileDetailsOverlayClasses = getMobileDetailsOverlayClasses(isMobileDetailsOpen)
  const mobileDetailsPanelClasses = getMobileDetailsPanelClasses(isMobileDetailsOpen)
  const renderConversationKeyInfoSection = (variant: 'mobile' | 'desktop') => {
    if (!selectedConversation) return null
    const isMobileVariant = variant === 'mobile'
    const rowClassName = isMobileVariant
      ? 'grid grid-cols-[92px_1fr] items-start gap-3'
      : 'grid grid-cols-[100px_1fr] gap-4'
    const labelClassName = isMobileVariant
      ? 'pt-0.5 text-xs text-gray-500'
      : 'text-sm text-gray-500'
    const valueTextClassName = isMobileVariant ? 'text-sm text-gray-900' : 'text-sm text-gray-900'

    const rows = (
      <div className={isMobileVariant ? 'space-y-3' : 'space-y-4'}>
        <div className={cn(rowClassName, !isMobileVariant && 'items-center')}>
          <span className={labelClassName}>{t('activeAgent')}</span>
          <div className="flex items-start flex-wrap gap-2">
            {activeAgent === 'ai' ? (
              <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                <Bot size={12} />
                {displayedBotName}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                <Zap size={12} />
                {t('operator')}
              </span>
            )}
            {conversationAiPaused && (
              <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                {t('aiProcessingPausedBadge')}
              </span>
            )}
          </div>
        </div>

        {activeAgent === 'operator' && (
          <div className={cn(rowClassName, !isMobileVariant && 'items-center')}>
            <span className={labelClassName}>{t('operator')}</span>
            <div className={valueTextClassName}>
              {selectedConversation.assignee ? (
                <span>{selectedConversation.assignee.full_name}</span>
              ) : (
                <span className="text-xs font-medium text-orange-500">{t('unassigned')}</span>
              )}
            </div>
          </div>
        )}

        <div className={cn(rowClassName, !isMobileVariant && 'items-center')}>
          <span className={labelClassName}>{t('platform')}</span>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-4 w-4 items-center justify-center">
              {selectedConversation.platform !== 'simulator' ? (
                <NextImage
                  alt=""
                  aria-hidden
                  className="h-4 w-4"
                  src={getChannelPlatformIconSrc(selectedConversation.platform)}
                  width={16}
                  height={16}
                />
              ) : (
                <span className="text-[10px] font-semibold uppercase text-gray-400">
                  {t('platformSimulatorShort')}
                </span>
              )}
            </span>
            <span className={cn(valueTextClassName, 'capitalize')}>
              {selectedConversation.platform}
            </span>
          </div>
        </div>

        <div className={cn(rowClassName, !isMobileVariant && 'items-center')}>
          <span className={labelClassName}>{t('received')}</span>
          <span className={valueTextClassName}>
            {format(new Date(selectedConversation.created_at), 'PP p', { locale: dateLocale })}
          </span>
        </div>

        <div className={cn(rowClassName, !isMobileVariant && 'items-center')}>
          <span className={labelClassName}>{t('creditUsage')}</span>
          <span className={valueTextClassName}>{conversationCreditValue}</span>
        </div>

        <div className={cn(rowClassName, 'items-start')}>
          <span className={labelClassName}>{t('aiProcessingControl')}</span>
          <div>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={conversationAiPaused}
                onChange={(event) => {
                  void handleSetConversationAiPause(event.target.checked)
                }}
                disabled={isAiPauseUpdating || isReadOnly}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <span className={valueTextClassName}>{t('aiProcessingPauseLabel')}</span>
            </label>
            <p className={cn('mt-1 text-xs text-gray-500', isMobileVariant && 'leading-5')}>
              {t('aiProcessingPauseHelp')}
            </p>
            {aiPauseError && (
              <p className="mt-1 text-xs text-red-600">{t('aiProcessingPauseError')}</p>
            )}
          </div>
        </div>
      </div>
    )

    return (
      <InboxDetailsSection
        title={t('keyInfo')}
        isExpanded={detailsSectionState.conversationInfo}
        onToggle={() => toggleDetailsSection('conversationInfo')}
        className={isMobileVariant ? 'rounded-lg border border-gray-200 bg-white px-3 py-3' : ''}
      >
        {rows}
      </InboxDetailsSection>
    )
  }

  return (
    <>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Conversation List */}
        <div
          className={cn(
            'absolute inset-0 z-20 flex h-full w-full flex-col border-r border-gray-200 bg-gray-50/30 transition-transform duration-300 ease-out lg:static lg:z-auto lg:w-[320px] lg:translate-x-0 lg:pointer-events-auto lg:transition-none',
            mobileListPaneClasses
          )}
        >
          <div className="shrink-0 border-b border-gray-200 bg-gray-50/30">
            <div className="flex h-14 items-center justify-between px-4">
              <div className="flex items-center">
                <span className="text-lg font-bold text-gray-900">{t('title')}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMobileBotModeSheetOpen(true)}
                  aria-label={`${tSidebar('botStatusLabel')}: ${botModeLabel}`}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors lg:hidden',
                    currentBotModeToneClasses.surface
                  )}
                >
                  <span
                    className={cn(
                      'h-2.5 w-2.5 rounded-full',
                      currentBotModeToneClasses.dot,
                      resolvedBotMode === 'active' && 'animate-pulse'
                    )}
                  />
                  <span>{botModeLabel}</span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 opacity-70 transition-transform duration-200 ease-out',
                      isMobileBotModeSheetOpen && 'rotate-180'
                    )}
                  />
                </button>
                <InboxListFilterMenu
                  unreadFilter={unreadFilter}
                  leadTemperatureFilter={leadTemperatureFilter}
                  onUnreadFilterChange={setUnreadFilter}
                  onLeadTemperatureFilterChange={setLeadTemperatureFilter}
                  onReset={() => {
                    setUnreadFilter('all')
                    setLeadTemperatureFilter('all')
                  }}
                />
              </div>
            </div>
            <div className="border-t border-gray-100 px-3 py-2">
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setActiveQueueTab('all')}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    activeQueueTab === 'all'
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span>{t('queueTabAll')}</span>
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/90 px-1.5 text-[10px] text-gray-700">
                    {queueCounts.all}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveQueueTab('unassigned')}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    activeQueueTab === 'unassigned'
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span>{t('queueTabUnassigned')}</span>
                  {queueCounts.unassignedAttention > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                      {queueCounts.unassignedAttention}
                    </span>
                  ) : (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/90 px-1.5 text-[10px] text-gray-700">
                      {queueCounts.unassigned}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveQueueTab('me')}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    activeQueueTab === 'me'
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span>{t('queueTabMe')}</span>
                  {queueCounts.meAttention > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                      {queueCounts.meAttention}
                    </span>
                  ) : (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/90 px-1.5 text-[10px] text-gray-700">
                      {queueCounts.me}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
            {renderConversationListContent()}
          </div>
        </div>

        {/* Main Chat */}
        {selectedConversation ? (
          <>
            <div
              className={cn(
                'relative absolute inset-0 z-30 flex min-w-0 flex-1 flex-col bg-white transition-transform duration-300 ease-out lg:static lg:z-auto lg:flex lg:translate-x-0 lg:pointer-events-auto lg:transition-none',
                mobileConversationPaneClasses
              )}
            >
              <div className="h-14 shrink-0 border-b border-gray-200 bg-white px-4 lg:px-6 flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-2 lg:gap-3">
                  <button
                    type="button"
                    onClick={handleBackToConversationList}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 lg:hidden"
                    aria-label={t('backToInbox')}
                  >
                    <ArrowLeft size={18} />
                  </button>
                  {selectedConversation.platform !== 'simulator' ? (
                    <NextImage
                      alt=""
                      aria-hidden
                      title={`${t('platform')}: ${selectedConversation.platform}`}
                      className="h-5 w-5 shrink-0 lg:hidden"
                      src={getChannelPlatformIconSrc(selectedConversation.platform)}
                      width={20}
                      height={20}
                    />
                  ) : (
                    <span
                      title={`${t('platform')}: ${selectedConversation.platform}`}
                      className="shrink-0 text-[10px] font-semibold uppercase text-gray-400 lg:hidden"
                    >
                      {t('platformSimulatorShort')}
                    </span>
                  )}
                  <h2 className="min-w-0 truncate font-bold text-gray-900 text-lg">
                    {selectedConversationDisplayName}
                  </h2>
                  {isSelectedConversationInstagramRequest && (
                    <span className="hidden shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 sm:inline-flex">
                      {t('instagramRequestBadge')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold md:hidden',
                      activeAgent === 'ai'
                        ? 'border-purple-100 bg-purple-50 text-purple-700'
                        : 'border-blue-100 bg-blue-50 text-blue-700'
                    )}
                    aria-label={`${t('activeAgent')}: ${activeAgent === 'ai' ? displayedBotName : t('operator')}`}
                  >
                    {activeAgent === 'ai' ? <Bot size={12} /> : <Zap size={12} />}
                    <span className="max-w-[70px] truncate">
                      {activeAgent === 'ai' ? displayedBotName : t('operator')}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleSelectedConversationUnread}
                    disabled={isReadOnly || isUnreadTogglePending}
                    aria-label={selectedConversationUnreadActionLabel}
                    title={selectedConversationUnreadActionLabel}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSelectedConversationUnread ? <MailOpen size={16} /> : <Mail size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMobileDetailsOpen((prev) => !prev)}
                    className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 lg:hidden"
                  >
                    {isMobileDetailsOpen ? t('hideDetails') : t('details')}
                  </button>
                  {conversationAiPaused && (
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                      {t('aiProcessingPausedBadge')}
                    </span>
                  )}
                  <span
                    className={`hidden md:flex text-xs px-3 py-1.5 rounded-full border items-center gap-1.5 transition-colors ${
                      activeAgent === 'ai'
                        ? 'bg-purple-50 text-purple-700 border-purple-100'
                        : 'bg-blue-50 text-blue-700 border-blue-100'
                    }`}
                  >
                    {activeAgent === 'ai' ? <Bot size={14} /> : <Zap size={14} />}
                    <span className="font-medium">
                      {activeAgent === 'ai' ? displayedBotName : t('operator')}
                    </span>
                  </span>
                </div>
              </div>

              <button
                type="button"
                aria-hidden={!isMobileDetailsOpen}
                onClick={() => setIsMobileDetailsOpen(false)}
                className={cn(
                  'absolute inset-0 top-14 z-20 bg-gray-950/30 transition-opacity duration-300 ease-out lg:hidden',
                  mobileDetailsOverlayClasses
                )}
              />
              <div
                aria-hidden={!isMobileDetailsOpen}
                className={cn(
                  'absolute inset-x-0 top-14 z-30 px-4 pt-3 transition-all duration-300 ease-out lg:hidden',
                  mobileDetailsPanelClasses
                )}
              >
                <div className="max-h-[60vh] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
                  <div className="flex max-h-[60vh] flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                      {showConversationSkeleton ? (
                        <div className="space-y-3">
                          <div className="mb-3 flex items-center gap-3">
                            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                            <div className="w-full space-y-2">
                              <Skeleton className="h-4 w-28" />
                              <Skeleton className="h-3 w-24" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <Skeleton className="h-16 w-full rounded-lg" />
                            <Skeleton className="h-16 w-full rounded-lg" />
                          </div>
                          <Skeleton className="h-20 w-full rounded-lg" />
                          <Skeleton className="h-24 w-full rounded-lg" />
                        </div>
                      ) : (
                        <>
                          <div className="mb-3 flex items-center gap-3">
                            <Avatar
                              name={selectedConversationDisplayName}
                              src={selectedConversationAvatarUrl}
                              size="sm"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-gray-900">
                                  {selectedConversationDisplayName}
                                </p>
                                {isSelectedConversationInstagramRequest && (
                                  <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-indigo-700">
                                    {t('instagramRequestBadge')}
                                  </span>
                                )}
                              </div>
                              {selectedConversationSecondaryIdentifier && (
                                <p className="text-xs text-gray-500">
                                  {selectedConversationSecondaryIdentifier}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="my-3 h-px bg-gray-100" />

                          {renderConversationKeyInfoSection('mobile')}

                          {!conversationAiPaused && (
                            <div className={MOBILE_DETAILS_SECTION_SPACING_CLASSNAME}>
                              <InboxDetailsSection
                                title={t('leadTitle')}
                                isExpanded={detailsSectionState.lead}
                                onToggle={() => toggleDetailsSection('lead')}
                                titleAdornment={
                                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                                    {t('leadAiExtraction')}
                                  </span>
                                }
                                headerAction={
                                  isLeadUpdating ? (
                                    <span className="text-xs font-semibold text-emerald-600">
                                      {t('leadUpdating')}
                                    </span>
                                  ) : null
                                }
                              >
                                {leadExtractionPaused && (
                                  <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                                    <div className="space-y-1">
                                      <p className="text-xs font-semibold text-amber-900">
                                        {t('leadPausedTitle')}
                                      </p>
                                      <p className="text-xs text-amber-800">{pauseReasonText}</p>
                                      {leadRefreshStatus === 'error' && (
                                        <p className="text-xs text-red-600">{leadRefreshMessage}</p>
                                      )}
                                      {leadRefreshStatus === 'success' && (
                                        <p className="text-xs text-green-700">
                                          {t('leadRefreshSuccess')}
                                        </p>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={handleRefreshLead}
                                      disabled={
                                        leadRefreshStatus === 'loading' || conversationAiPaused
                                      }
                                      className={cn(
                                        'shrink-0 rounded-md border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100',
                                        (leadRefreshStatus === 'loading' || conversationAiPaused) &&
                                          'cursor-not-allowed opacity-60'
                                      )}
                                    >
                                      {leadRefreshStatus === 'loading'
                                        ? t('leadRefreshLoading')
                                        : t('leadRefresh')}
                                    </button>
                                  </div>
                                )}

                                {lead ? (
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-[92px_1fr] items-start gap-3">
                                      <span className="pt-0.5 text-xs text-gray-500">
                                        {t('leadStatus')}
                                      </span>
                                      <div className="flex items-center gap-2 text-sm text-gray-900">
                                        <span
                                          className={cn(
                                            'h-2 w-2 rounded-full',
                                            lead.status === 'hot'
                                              ? 'bg-red-500'
                                              : lead.status === 'warm'
                                                ? 'bg-amber-500'
                                                : 'bg-gray-400'
                                          )}
                                        />
                                        <span>{leadStatusLabels[lead.status] ?? lead.status}</span>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-[92px_1fr] items-start gap-3">
                                      <span className="pt-0.5 text-xs text-gray-500">
                                        {t('leadScore')}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-900">
                                          {lead.total_score}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={handleOpenScoreReason}
                                          disabled={scoreReasonStatus === 'loading'}
                                          className={cn(
                                            'text-xs font-medium text-blue-600 hover:text-blue-700',
                                            scoreReasonStatus === 'loading' &&
                                              'cursor-not-allowed opacity-60'
                                          )}
                                        >
                                          {t('scoreReason')}
                                        </button>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-[92px_1fr] items-start gap-3">
                                      <span className="pt-0.5 text-xs text-gray-500">
                                        {t('leadService')}
                                      </span>
                                      <LeadServiceEditor
                                        currentService={resolvedLeadService.value}
                                        currentSource={resolvedLeadService.source}
                                        catalogServices={serviceCatalogNames}
                                        knownLeadUpdatedAt={lead.updated_at}
                                        isReadOnly={isReadOnly}
                                        labels={leadServiceEditorLabels}
                                        onSave={handleSaveLeadService}
                                        onReturnToAi={handleReturnLeadServiceToAi}
                                      />
                                    </div>

                                    {requiredIntakeFields.length > 0 && (
                                      <div className="grid grid-cols-[92px_1fr] items-start gap-3">
                                        <span className="pt-0.5 text-xs text-gray-500">
                                          {t('leadRequiredInfo')}
                                        </span>
                                        <LeadRequiredInfoBlock
                                          editLabel={
                                            !isReadOnly ? t('leadRequiredInfoEdit') : undefined
                                          }
                                          onEdit={
                                            !isReadOnly
                                              ? () => setIsImportantInfoModalOpen(true)
                                              : undefined
                                          }
                                          items={collectedRequiredIntake}
                                          labels={importantInfoSummaryLabels}
                                        />
                                      </div>
                                    )}

                                    {lead.summary && (
                                      <div className="grid grid-cols-[92px_1fr] items-start gap-3">
                                        <span className="pt-0.5 text-xs text-gray-500">
                                          {t('leadSummary')}
                                        </span>
                                        <span className="whitespace-pre-wrap text-sm text-gray-900">
                                          {lead.summary}
                                        </span>
                                      </div>
                                    )}

                                    {lead.updated_at && (
                                      <div className="grid grid-cols-[92px_1fr] items-start gap-3">
                                        <span className="pt-0.5 text-xs text-gray-500">
                                          {t('leadUpdated')}
                                        </span>
                                        <span className="text-sm text-gray-900">
                                          {format(new Date(lead.updated_at), 'PP p', {
                                            locale: dateLocale,
                                          })}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-500">{t('leadEmpty')}</p>
                                )}
                              </InboxDetailsSection>
                            </div>
                          )}

                          <div className={MOBILE_DETAILS_SECTION_SPACING_CLASSNAME}>
                            <InboxDetailsSection
                              title={t('tags')}
                              isExpanded={detailsSectionState.tags}
                              onToggle={() => toggleDetailsSection('tags')}
                            >
                              <ConversationTagsEditor
                                key={`mobile-tags-${selectedId ?? 'none'}`}
                                tags={editableConversationTags}
                                isReadOnly={isReadOnly}
                                labels={tagEditorLabels}
                                onSave={handleSaveConversationTags}
                              />
                            </InboxDetailsSection>
                          </div>

                          <div className={MOBILE_DETAILS_SECTION_SPACING_CLASSNAME}>
                            <InboxDetailsSection
                              title={t('privateNote')}
                              isExpanded={detailsSectionState.privateNote}
                              onToggle={() => toggleDetailsSection('privateNote')}
                            >
                              <ConversationPrivateNoteEditor
                                key={`mobile-note-${selectedId ?? 'none'}`}
                                note={selectedConversationPrivateNote}
                                knownPrivateNoteUpdatedAt={selectedConversationPrivateNoteUpdatedAt}
                                updatedByText={privateNoteUpdatedByLabel}
                                updatedAtText={privateNoteUpdatedAtText}
                                isReadOnly={isReadOnly}
                                labels={privateNoteLabels}
                                onSave={handleSaveConversationPrivateNote}
                              />
                            </InboxDetailsSection>
                          </div>
                        </>
                      )}
                    </div>

                    {!showConversationSkeleton && activeAgent === 'operator' && (
                      <div className="shrink-0 border-t border-gray-100 bg-white px-3 py-3 shadow-[0_-10px_24px_-18px_rgba(15,23,42,0.28)]">
                        <button
                          onClick={handleLeaveConversation}
                          disabled={isLeaving || isReadOnly}
                          className="w-full rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isLeaving ? t('leaving') : t('leaveConversation')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {!showConversationSkeleton && activeAgent === 'operator' && !isMobileDetailsOpen && (
                <div className="border-b border-gray-200 bg-white/95 px-4 py-3 shadow-[0_12px_24px_-22px_rgba(15,23,42,0.4)] backdrop-blur lg:hidden">
                  <button
                    onClick={handleLeaveConversation}
                    disabled={isLeaving || isReadOnly}
                    className="w-full rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLeaving ? t('leaving') : t('leaveConversation')}
                  </button>
                </div>
              )}

              <div
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
                className="flex-1 overflow-y-auto bg-gray-50/30 p-4 lg:p-8 space-y-6 lg:space-y-8"
              >
                {showConversationSkeleton ? (
                  <div className="space-y-4">
                    <div className="flex items-end gap-3">
                      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                      <Skeleton className="h-16 w-[min(70%,380px)] rounded-2xl rounded-bl-none" />
                    </div>
                    <div className="flex items-end justify-end gap-3">
                      <Skeleton className="h-12 w-[min(60%,300px)] rounded-2xl rounded-br-none" />
                      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                    </div>
                    <div className="flex items-end gap-3">
                      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                      <Skeleton className="h-20 w-[min(80%,420px)] rounded-2xl rounded-bl-none" />
                    </div>
                  </div>
                ) : (
                  <>
                    {isLoadingMessageHistory && (
                      <div className="flex justify-center">
                        <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/90 px-3 py-1 text-xs font-medium text-gray-500">
                          <Loader2 size={12} className="animate-spin" />
                          {t('loadingOlderMessages')}
                        </span>
                      </div>
                    )}
                    {visibleMessages.map((m) => {
                      const galleryGroup = imageGalleryLookup.groupsByStartId.get(m.id)
                      const isGroupedMessage = imageGalleryLookup.groupedMessageIds.has(m.id)
                      if (isGroupedMessage && !galleryGroup) {
                        return null
                      }

                      const isMe = m.sender_type === 'user'
                      const isBot = m.sender_type === 'bot'
                      const isSystem = m.sender_type === 'system'
                      const isInstagramSeenEvent = isInstagramSeenEventMessage({
                        platform: selectedConversation?.platform ?? 'simulator',
                        senderType: m.sender_type,
                        metadata: m.metadata,
                        content: m.content,
                      })
                      const isInstagramReactionEvent = isInstagramReactionEventMessage({
                        platform: selectedConversation?.platform ?? 'simulator',
                        senderType: m.sender_type,
                        metadata: m.metadata,
                        content: m.content,
                      })
                      const instagramReactionTargetMessageId = resolveInstagramReactionEvent(
                        m.metadata,
                        m.content
                      )?.targetMessageId
                      const instagramReactionTargetMessage = instagramReactionTargetMessageId
                        ? (instagramMessagesByProviderId.get(instagramReactionTargetMessageId) ?? null)
                        : null
                      const instagramReactionSummary = isInstagramReactionEvent
                        ? resolveInstagramReactionSummary({
                            metadata: m.metadata,
                            content: m.content,
                            targetSenderType: instagramReactionTargetMessage?.sender_type,
                            labels: instagramReactionLabels,
                          })
                        : null
                      const instagramSeenIndicator =
                        isMe && !isBot
                          ? (instagramSeenIndicatorByMessageId.get(m.id) ?? null)
                          : null
                      const outboundDeliveryState =
                        isMe && !isBot ? resolveOutboundDeliveryState(m.metadata) : null
                      const parsedBotContent = isBot
                        ? splitBotMessageDisclaimer(m.content)
                        : { body: m.content, disclaimer: null as string | null }
                      const visibleMessageContent = parsedBotContent.body
                      const visibleResolvedContent = resolveVisibleMessageContent({
                        content: visibleMessageContent,
                        metadata: m.metadata,
                        fallbackUnsupportedInstagramAttachment: t(
                          'mediaPreview.instagramUnsupportedDetail'
                        ),
                      })
                      const senderIdentity = resolveMessageSenderIdentity({
                        message: m,
                        currentUserId,
                        currentUserProfile,
                        senderProfilesById,
                        contactName: selectedConversationDisplayName,
                        contactAvatarUrl: selectedConversationAvatarUrl,
                        youLabel: t('you'),
                        botName: displayedBotName,
                      })
                      const matchedSkillTitle = isBot
                        ? extractSkillTitleFromMetadata(m.metadata)
                        : null
                      const media = extractMediaFromMessageMetadata(m.metadata)
                      const mediaPreviewLabel = media
                        ? resolveMediaPreviewLabel(media.type, m.sender_type)
                        : null
                      const isInstagramRequestInboundMessage = isInstagramRequestMessage(
                        selectedConversation?.platform ?? 'simulator',
                        m.sender_type,
                        m.metadata
                      )
                      const shouldHideMessageText = Boolean(
                        media && media.isPlaceholder && !media.caption
                      )
                      const renderMessageText = shouldHideMessageText ? '' : visibleResolvedContent
                      const messageDateSeparator = messageDateSeparatorById.get(m.id)
                      const dateSeparator = messageDateSeparator ? (
                        <div className="flex justify-center">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200">
                            {messageDateSeparator}
                          </span>
                        </div>
                      ) : null

                      const galleryDisplayItems = galleryGroup ? galleryGroup.items.slice(0, 4) : []
                      const hiddenGalleryItemCount = galleryGroup
                        ? Math.max(0, galleryGroup.items.length - galleryDisplayItems.length)
                        : 0
                      const galleryTimestamp = galleryGroup
                        ? (galleryGroup.items[galleryGroup.items.length - 1]?.message.created_at ??
                          m.created_at)
                        : m.created_at

                      const resolveGalleryTileClass = (totalItems: number, index: number) => {
                        if (totalItems === 1) return 'col-span-2 aspect-[4/3]'
                        if (totalItems === 3 && index === 0) return 'col-span-2 aspect-[16/9]'
                        return 'aspect-square'
                      }

                      const renderGalleryGrid = (isDark: boolean) => {
                        if (!galleryGroup || galleryDisplayItems.length === 0) return null

                        return (
                          <div className="w-[280px] max-w-full sm:w-[320px]">
                            <div className="grid grid-cols-2 gap-1.5">
                              {galleryDisplayItems.map((item, index) => {
                                const tileClassName = resolveGalleryTileClass(
                                  galleryDisplayItems.length,
                                  index
                                )
                                const shouldShowHiddenCount =
                                  hiddenGalleryItemCount > 0 &&
                                  index === galleryDisplayItems.length - 1

                                return (
                                  <a
                                    key={item.message.id}
                                    href={item.media.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block"
                                  >
                                    <InboxMessageImage
                                      key={item.media.url}
                                      src={item.media.url}
                                      alt={item.media.caption ?? t('mediaPreview.image')}
                                      frameClassName={cn(
                                        'rounded-lg',
                                        tileClassName,
                                        isDark
                                          ? 'border border-white/20'
                                          : 'border border-gray-200 bg-white'
                                      )}
                                      imageClassName="object-cover"
                                      overlayClassName={isDark ? 'bg-white/10' : 'bg-gray-100/90'}
                                      spinnerClassName={
                                        isDark
                                          ? 'border-white/20 border-t-white/90'
                                          : 'border-gray-300/80 border-t-gray-500'
                                      }
                                      onLoad={handleMessageMediaLoad}
                                    >
                                      {shouldShowHiddenCount && (
                                        <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white">
                                          +{hiddenGalleryItemCount}
                                        </span>
                                      )}
                                    </InboxMessageImage>
                                  </a>
                                )
                              })}
                            </div>
                          </div>
                        )
                      }

                      if (isSystem) {
                        return (
                          <div
                            key={m.id}
                            className={messageDateSeparator ? 'space-y-3' : undefined}
                          >
                            {dateSeparator}
                            <div className="flex items-center justify-center w-full py-2">
                              <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                                {m.content}
                              </span>
                            </div>
                          </div>
                        )
                      }

                      if (isInstagramSeenEvent) {
                        return null
                      }

                      if (isInstagramReactionEvent) {
                        return (
                          <div
                            key={m.id}
                            className={messageDateSeparator ? 'space-y-3' : undefined}
                          >
                            {dateSeparator}
                            <div className="flex flex-col items-center gap-1.5 py-1">
                              <span className="inline-flex max-w-[85%] items-center justify-center rounded-full border border-rose-100 bg-rose-50/80 px-3 py-1.5 text-center text-xs font-medium text-rose-700">
                                {instagramReactionSummary ?? t('instagramReaction.fallback')}
                              </span>
                              <span className="text-xs text-gray-400">
                                {format(new Date(m.created_at), 'HH:mm', { locale: dateLocale })}
                              </span>
                            </div>
                          </div>
                        )
                      }

                      if (!isMe && !isBot) {
                        if (galleryGroup) {
                          return (
                            <div
                              key={m.id}
                              className={messageDateSeparator ? 'space-y-3' : undefined}
                            >
                              {dateSeparator}
                              <div className="flex items-end gap-3">
                                <Avatar
                                  name={senderIdentity.displayName}
                                  src={senderIdentity.avatarUrl}
                                  size="md"
                                />
                                <div className="flex flex-col gap-1 max-w-[80%]">
                                  <div className="bg-gray-100 text-gray-900 rounded-2xl rounded-bl-none p-2.5">
                                    {renderGalleryGrid(false)}
                                  </div>
                                  <span className="text-xs text-gray-400 ml-1">
                                    {format(new Date(galleryTimestamp), 'HH:mm', {
                                      locale: dateLocale,
                                    })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        }

                        return (
                          <div
                            key={m.id}
                            className={messageDateSeparator ? 'space-y-3' : undefined}
                          >
                            {dateSeparator}
                            <div className="flex items-end gap-3">
                              <Avatar
                                name={senderIdentity.displayName}
                                src={senderIdentity.avatarUrl}
                                size="md"
                              />
                              <div className="flex flex-col gap-1 max-w-[80%]">
                                <div className="bg-gray-100 text-gray-900 rounded-2xl rounded-bl-none px-4 py-3 text-sm leading-relaxed">
                                  {media && (
                                    <div className="space-y-2">
                                      {shouldAttemptInlineImagePreview(media) ? (
                                        <a
                                          href={media.url!}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="block"
                                        >
                                          <InboxMessageImage
                                            key={media.url!}
                                            src={media.url!}
                                            alt={
                                              media.caption ??
                                              mediaPreviewLabel ??
                                              t('mediaPreview.media')
                                            }
                                            frameClassName="w-[240px] max-w-full rounded-lg border border-gray-200 bg-white aspect-[4/3]"
                                            imageClassName="object-contain bg-white"
                                            overlayClassName="bg-gray-100/90"
                                            spinnerClassName="border-gray-300/80 border-t-gray-500"
                                            onLoad={handleMessageMediaLoad}
                                          />
                                        </a>
                                      ) : (
                                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                                          <div className="text-xs font-semibold text-gray-700">
                                            {mediaPreviewLabel}
                                          </div>
                                          {media.fileName && (
                                            <div className="mt-1 text-xs text-gray-500">
                                              {media.fileName}
                                            </div>
                                          )}
                                          {media.url && (
                                            <a
                                              href={media.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="mt-2 inline-block text-xs font-medium text-blue-600 hover:text-blue-700"
                                            >
                                              {t('mediaPreview.open')}
                                            </a>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {renderMessageText && (
                                    <div className={media ? 'mt-2' : undefined}>
                                      {renderMessageText}
                                    </div>
                                  )}
                                </div>
                                <span className="ml-1 flex items-center gap-1.5 text-xs text-gray-400">
                                  {isInstagramRequestInboundMessage && (
                                    <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-indigo-700">
                                      {t('instagramRequestBadge')}
                                    </span>
                                  )}
                                  {format(new Date(m.created_at), 'HH:mm', { locale: dateLocale })}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      }

                      if (galleryGroup) {
                        return (
                          <div
                            key={m.id}
                            className={messageDateSeparator ? 'space-y-3' : undefined}
                          >
                            {dateSeparator}
                            <div className="flex items-end gap-3 justify-end">
                              <div className="flex flex-col gap-1 items-end max-w-[80%]">
                                <div
                                  className={`rounded-2xl rounded-br-none p-2.5 ${isBot ? 'bg-slate-900 text-white' : 'bg-gray-900 text-white'}`}
                                >
                                  {renderGalleryGrid(true)}
                                </div>
                                <div className="flex items-center gap-1.5 mr-1">
                                  <span className="text-xs text-gray-400">
                                    {senderIdentity.footerLabel} ·{' '}
                                    {format(new Date(galleryTimestamp), 'HH:mm', {
                                      locale: dateLocale,
                                    })}
                                  </span>
                                  {!isBot && instagramSeenIndicator && (
                                    <span
                                      className="inline-flex items-center text-gray-400"
                                      title={
                                        formatRelativeTimeFromBase({
                                          targetIso: instagramSeenIndicator.seenAt,
                                          baseDate: relativeTimeBaseDate,
                                          locale: dateLocale,
                                        }) ?? undefined
                                      }
                                      aria-label={t('instagramSeenIconAria')}
                                    >
                                      <Eye size={12} />
                                    </span>
                                  )}
                                  {!isBot && outboundDeliveryState === 'sending' && (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                                      <Loader2 size={12} className="animate-spin" />
                                      {t('composerAttachments.sending')}
                                    </span>
                                  )}
                                  {!isBot && outboundDeliveryState === 'failed' && (
                                    <span className="text-[11px] font-medium text-red-500">
                                      {t('composerAttachments.failed')}
                                    </span>
                                  )}
                                  {isBot && matchedSkillTitle && (
                                    <span
                                      title={matchedSkillTitle}
                                      className="inline-flex max-w-[210px] truncate rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600"
                                    >
                                      {matchedSkillTitle}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {isBot ? (
                                <KualiaAvatar size="sm" />
                              ) : (
                                <Avatar
                                  name={senderIdentity.displayName}
                                  src={senderIdentity.avatarUrl}
                                  size="md"
                                />
                              )}
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div key={m.id} className={messageDateSeparator ? 'space-y-3' : undefined}>
                          {dateSeparator}
                          <div className="flex items-end gap-3 justify-end">
                            <div className="flex flex-col gap-1 items-end max-w-[80%]">
                              <div
                                className={`rounded-2xl rounded-br-none px-4 py-3 text-sm leading-relaxed text-right ${isBot ? 'bg-slate-900 text-white' : 'bg-gray-900 text-white'}`}
                              >
                                {media && (
                                  <div className="space-y-2 text-left">
                                    {shouldAttemptInlineImagePreview(media) ? (
                                      <a
                                        href={media.url!}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block"
                                      >
                                        <InboxMessageImage
                                          key={media.url!}
                                          src={media.url!}
                                          alt={
                                            media.caption ??
                                            mediaPreviewLabel ??
                                            t('mediaPreview.media')
                                          }
                                          frameClassName="w-[240px] max-w-full rounded-lg border border-white/20 bg-white/5 aspect-[4/3]"
                                          imageClassName="object-contain bg-black/10"
                                          overlayClassName="bg-white/10"
                                          spinnerClassName="border-white/20 border-t-white/90"
                                          onLoad={handleMessageMediaLoad}
                                        />
                                      </a>
                                    ) : (
                                      <div className="rounded-lg border border-white/20 bg-black/15 px-3 py-2 text-left">
                                        <div className="text-xs font-semibold text-white">
                                          {mediaPreviewLabel}
                                        </div>
                                        {media.fileName && (
                                          <div className="mt-1 text-xs text-white/80">
                                            {media.fileName}
                                          </div>
                                        )}
                                        {media.url && (
                                          <a
                                            href={media.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-2 inline-block text-xs font-medium text-white underline underline-offset-2"
                                          >
                                            {t('mediaPreview.open')}
                                          </a>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {renderMessageText && (
                                  <div className={media ? 'mt-2 text-right' : undefined}>
                                    {renderMessageText}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mr-1">
                                <span className="text-xs text-gray-400">
                                  {senderIdentity.footerLabel} ·{' '}
                                  {format(new Date(m.created_at), 'HH:mm', { locale: dateLocale })}
                                </span>
                                {!isBot && instagramSeenIndicator && (
                                  <span
                                    className="inline-flex items-center text-gray-400"
                                    title={
                                      formatRelativeTimeFromBase({
                                        targetIso: instagramSeenIndicator.seenAt,
                                        baseDate: relativeTimeBaseDate,
                                        locale: dateLocale,
                                      }) ?? undefined
                                    }
                                    aria-label={t('instagramSeenIconAria')}
                                  >
                                    <Eye size={12} />
                                  </span>
                                )}
                                {!isBot && outboundDeliveryState === 'sending' && (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                                    <Loader2 size={12} className="animate-spin" />
                                    {t('composerAttachments.sending')}
                                  </span>
                                )}
                                {!isBot && outboundDeliveryState === 'failed' && (
                                  <span className="text-[11px] font-medium text-red-500">
                                    {t('composerAttachments.failed')}
                                  </span>
                                )}
                                {isBot && matchedSkillTitle && (
                                  <span
                                    title={matchedSkillTitle}
                                    className="inline-flex max-w-[210px] truncate rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600"
                                  >
                                    {matchedSkillTitle}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isBot ? (
                              <KualiaAvatar size="sm" />
                            ) : (
                              <Avatar
                                name={senderIdentity.displayName}
                                src={senderIdentity.avatarUrl}
                                size="md"
                              />
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>

              <div
                ref={composerContainerRef}
                className="relative border-t border-gray-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:p-6"
              >
                <div
                  className="pointer-events-none absolute right-4 top-0 z-20 -translate-y-1/2 lg:right-6"
                  aria-hidden={!showScrollToLatest}
                >
                  <div
                    className={`transition-all duration-300 ease-out ${
                      showScrollToLatest ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => scrollToBottom('smooth')}
                      title={t('scrollToLatest')}
                      aria-label={t('scrollToLatest')}
                      className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-200"
                    >
                      <ArrowDown size={18} />
                    </button>
                  </div>
                </div>
                <div className="mb-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div
                        className="relative inline-flex group"
                        title={!canSummarize ? t('summary.tooltip.insufficient') : undefined}
                      >
                        <div
                          className={`inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 transition-all duration-300 ${summaryHeaderDisabled ? 'opacity-60' : ''}`}
                        >
                          <button
                            type="button"
                            onClick={handleToggleSummary}
                            disabled={summaryHeaderDisabled}
                            aria-expanded={isSummaryOpen}
                            aria-controls={SUMMARY_PANEL_ID}
                            className="flex items-center gap-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed"
                          >
                            <span className="relative inline-flex h-5 w-5 items-center justify-center">
                              <span
                                aria-hidden
                                className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 opacity-80 blur-[3px]"
                              />
                              <span
                                aria-hidden
                                className={`relative inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 shadow-[0_0_8px_rgba(168,85,247,0.55)] transition-transform duration-300 ${
                                  isSummaryOpen ? 'scale-105' : ''
                                }`}
                              >
                                <HiMiniSparkles className="text-white" size={12} />
                              </span>
                            </span>
                            {t('summary.button')}
                            <ChevronDown
                              className={`text-gray-500 transition-transform duration-300 ${isSummaryOpen ? 'rotate-180' : ''}`}
                              size={14}
                            />
                          </button>
                          {showSummaryRefresh && (
                            <button
                              type="button"
                              onClick={handleRefreshSummary}
                              disabled={summaryRefreshDisabled}
                              className="ml-1 h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <RotateCw size={16} />
                              <span className="sr-only">{t('summary.refresh')}</span>
                            </button>
                          )}
                        </div>
                        {!canSummarize && (
                          <div className="pointer-events-none absolute left-0 top-full mt-2 z-10 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                            {t('summary.tooltip.insufficient')}
                          </div>
                        )}
                      </div>
                    </div>
                    {isWhatsAppConversation &&
                      whatsappReplyWindowState &&
                      !whatsappReplyWindowState.canReply && (
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="relative group shrink-0">
                            <span
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800"
                              title={whatsappReplyBlockedTooltip}
                              aria-label={t('whatsappReplyWindow.infoAriaLabel')}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                              {t('whatsappReplyWindow.blocked')}
                              <CircleHelp size={13} className="text-current opacity-80" />
                            </span>
                            <div className="pointer-events-none absolute right-0 top-full z-10 mt-2 max-w-[300px] rounded-md bg-gray-900 px-2.5 py-1.5 text-xs leading-4 text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                              {whatsappReplyBlockedTooltip}
                            </div>
                          </div>
                        </div>
                      )}
                  </div>

                  <div
                    id={SUMMARY_PANEL_ID}
                    aria-hidden={!isSummaryOpen}
                    className={`mt-2 overflow-hidden transition-all duration-300 ease-out ${isSummaryOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}
                  >
                    <div
                      className={`w-full transition-all duration-300 ease-out ${summaryStatus === 'success' ? 'max-w-full' : 'max-w-[520px]'}`}
                    >
                      <div
                        className={`rounded-2xl border px-4 py-3 shadow-sm transition-all duration-300 ${
                          summaryStatus === 'loading'
                            ? 'border-blue-100 bg-blue-50/60'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        {summaryStatus === 'loading' && (
                          <div className="space-y-2">
                            <div className="h-4 w-3/4 rounded-md bg-gradient-to-r from-blue-50 via-blue-100 to-blue-50 animate-pulse" />
                            <div className="h-4 w-11/12 rounded-md bg-gradient-to-r from-blue-50 via-blue-100 to-blue-50 animate-pulse" />
                            <div className="h-4 w-2/3 rounded-md bg-gradient-to-r from-blue-50 via-blue-100 to-blue-50 animate-pulse" />
                          </div>
                        )}
                        {summaryStatus === 'success' && (
                          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                            {summaryText}
                          </p>
                        )}
                        {summaryStatus === 'error' && (
                          <p className="text-sm text-red-600">{t('summary.error')}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {assistantBanner && (
                  <div
                    className={`mb-3 rounded-xl flex items-center gap-2 border px-3 py-2 ${
                      assistantBanner.tone === 'inactive'
                        ? 'border-slate-200 bg-slate-50'
                        : 'border-yellow-200 bg-yellow-50'
                    }`}
                  >
                    <div
                      className={`h-8 w-8 rounded-full border flex items-center justify-center shrink-0 ${
                        assistantBanner.tone === 'inactive'
                          ? 'bg-slate-100 border-slate-200 text-slate-600'
                          : 'bg-yellow-100 border-yellow-200 text-yellow-700'
                      }`}
                    >
                      <Bot size={16} />
                    </div>
                    <div
                      className={`min-w-0 ${
                        assistantBanner.tone === 'inactive' ? 'text-slate-800' : 'text-yellow-900'
                      }`}
                    >
                      <p className="text-base font-semibold leading-5 whitespace-nowrap">
                        {t(assistantBanner.titleKey)}
                      </p>
                      <p
                        className={`text-xs leading-4 ${
                          assistantBanner.tone === 'inactive' ? 'text-slate-700' : 'text-yellow-800'
                        }`}
                      >
                        {t(assistantBanner.bodyKey)}
                      </p>
                    </div>
                  </div>
                )}
                {isReadOnly && (
                  <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {t('readOnlyMode')}
                  </div>
                )}

                {isWhatsAppWindowExpired && (
                  <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
                    <p className="text-sm font-semibold text-blue-900">
                      {t('whatsappReplyWindow.expiredActionsTitle')}
                    </p>
                    <p className="mt-1 text-sm text-blue-800">
                      {t('whatsappReplyWindow.expiredActionsDescription')}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleOpenInWhatsAppPhone}
                        disabled={!canOpenWhatsAppPhone}
                        className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {t('whatsappReplyWindow.openInWhatsApp')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsWhatsAppTemplateModalOpen(true)}
                        disabled={isReadOnly}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {t('whatsappReplyWindow.sendTemplate')}
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex min-w-0 items-stretch gap-2 lg:gap-3">
                    <div className="relative min-w-0 flex-1">
                      <input
                        ref={attachmentInputRef}
                        type="file"
                        multiple
                        accept={WHATSAPP_UPLOAD_ACCEPT}
                        className="hidden"
                        onChange={handleAttachmentInputChange}
                      />
                      <input
                        ref={imageInputRef}
                        type="file"
                        multiple
                        accept={INSTAGRAM_UPLOAD_ACCEPT}
                        className="hidden"
                        onChange={handleAttachmentInputChange}
                      />
                      {pendingAttachments.length > 0 && (
                        <div className="mb-2 rounded-xl border border-gray-200 bg-white px-2 py-2 shadow-sm">
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {pendingAttachments.map((attachment) => (
                              <div
                                key={attachment.id}
                                className="group relative flex min-w-[120px] max-w-[160px] items-center gap-2 rounded-xl border border-gray-200 bg-white px-2 py-1.5"
                              >
                                <button
                                  type="button"
                                  onClick={() => setPreviewAttachmentId(attachment.id)}
                                  aria-label={t('composerAttachments.previewTitle')}
                                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                >
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-100">
                                    {attachment.mediaType === 'image' && attachment.previewUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={attachment.previewUrl}
                                        alt={attachment.name}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <FileText size={16} className="text-gray-500" />
                                    )}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-xs font-medium text-gray-800">
                                      {attachment.name}
                                    </span>
                                    <span className="block text-[11px] text-gray-500">
                                      {formatAttachmentSize(attachment.sizeBytes)}
                                    </span>
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemovePendingAttachment(attachment.id)}
                                  className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-gray-500 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                                  aria-label={t('composerAttachments.remove')}
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                          <p className="mt-1 text-[11px] text-gray-500">
                            {t('composerAttachments.limitHint', { count: maxAttachmentCount })}
                          </p>
                        </div>
                      )}
                      <div className="relative">
                        {isWhatsAppMissingInbound && (
                          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border border-amber-200 bg-white/90 px-3 text-center text-xs font-medium text-amber-900">
                            {whatsappComposerOverlayMessage}
                          </div>
                        )}
                        <div
                          className={`rounded-2xl border border-gray-200 bg-gray-50/60 px-3 shadow-sm transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 ${isWhatsAppMissingInbound ? 'opacity-60' : ''}`}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            {isWhatsAppConversation && (
                              <IconButton
                                icon={Paperclip}
                                size="sm"
                                onClick={handleOpenAttachmentPicker}
                                disabled={isDocumentAttachmentPickerDisabled}
                                className="disabled:cursor-not-allowed disabled:opacity-50"
                              />
                            )}
                            <IconButton
                              icon={Image}
                              size="sm"
                              onClick={handleOpenImagePicker}
                              disabled={isAttachmentPickerDisabled}
                              className="disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            <div className="mx-1 h-5 w-px shrink-0 bg-gray-200" />
                            <textarea
                              value={input}
                              onChange={(e) => setInput(e.target.value)}
                              onPaste={handleInputPaste}
                              disabled={isComposerDisabled}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault()
                                  handleSendMessage()
                                }
                              }}
                              rows={1}
                              className="h-11 min-h-[44px] max-h-[44px] min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-[11px] text-sm leading-5 text-gray-900 placeholder-gray-400 focus:outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                              placeholder={inputPlaceholder}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <InboxComposerActionBar
                      templateLabel={t('templatePickerAction')}
                      sendLabel={t('sendButton')}
                      isTemplateDisabled={isTemplatePickerDisabled}
                      isSendDisabled={!canSend}
                      isSending={isSending}
                      onTemplateClick={() => setIsTemplatePickerModalOpen(true)}
                      onSendClick={handleSendMessage}
                      sendAriaLabel={isSending ? t('composerAttachments.sending') : t('sendButton')}
                      sendTitle={isWhatsAppReplyBlocked ? whatsappReplyBlockedTooltip : undefined}
                    />
                  </div>
                  {composerErrorMessage && (
                    <p className="text-xs font-medium text-red-600">{composerErrorMessage}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Details Panel */}
            <div className="w-[360px] border-l border-gray-200 bg-white flex flex-col shrink-0 h-full hidden xl:flex">
              <div className="h-14 border-b border-gray-200 px-6 flex items-center justify-between shrink-0">
                <h3 className="font-semibold text-gray-900">{t('details')}</h3>
                <div className="relative">
                  <button
                    disabled={isReadOnly}
                    onClick={() => setIsDetailsMenuOpen(!isDetailsMenuOpen)}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500"
                  >
                    <MoreHorizontal size={20} />
                  </button>

                  {isDetailsMenuOpen && !isReadOnly && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsDetailsMenuOpen(false)}
                      />
                      <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 shadow-lg rounded-lg z-20 py-1">
                        <button
                          onClick={() => {
                            handleDeleteConversation()
                            setIsDetailsMenuOpen(false)
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <Trash2 size={16} />
                          {t('deleteConversation')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                {showConversationSkeleton ? (
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="space-y-6">
                      <div className="flex flex-col items-center text-center">
                        <Skeleton className="mb-3 h-16 w-16 rounded-full" />
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="mt-2 h-4 w-24" />
                      </div>
                      <hr className="border-gray-100 my-6" />
                      <div className="space-y-4">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-12 w-full rounded-lg" />
                        <Skeleton className="h-12 w-full rounded-lg" />
                        <Skeleton className="h-12 w-full rounded-lg" />
                      </div>
                      <hr className="border-gray-100 my-6" />
                      <div className="space-y-4">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-14 w-full rounded-lg" />
                        <Skeleton className="h-14 w-full rounded-lg" />
                        <Skeleton className="h-20 w-full rounded-lg" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="min-h-0 flex-1 overflow-y-auto p-6">
                      <div className="flex flex-col items-center text-center">
                        <Avatar
                          name={selectedConversationDisplayName}
                          src={selectedConversationAvatarUrl}
                          size="lg"
                          className="mb-3 text-base"
                        />
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-gray-900">
                            {selectedConversationDisplayName}
                          </h3>
                          {isSelectedConversationInstagramRequest && (
                            <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                              {t('instagramRequestBadge')}
                            </span>
                          )}
                        </div>
                        {selectedConversationSecondaryIdentifier && (
                          <p className="mt-1 text-sm text-gray-500">
                            {selectedConversationSecondaryIdentifier}
                          </p>
                        )}
                      </div>

                      <hr className="my-6 border-gray-100" />

                      {renderConversationKeyInfoSection('desktop')}

                      {!conversationAiPaused && (
                        <div className={DESKTOP_DETAILS_SECTION_SPACING_CLASSNAME}>
                          <InboxDetailsSection
                            title={t('leadTitle')}
                            isExpanded={detailsSectionState.lead}
                            onToggle={() => toggleDetailsSection('lead')}
                            titleAdornment={
                              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                                {t('leadAiExtraction')}
                              </span>
                            }
                            headerAction={
                              isLeadUpdating ? (
                                <span className="text-xs font-semibold text-emerald-600">
                                  {t('leadUpdating')}
                                </span>
                              ) : null
                            }
                          >
                            {leadExtractionPaused && (
                              <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold text-amber-900">
                                    {t('leadPausedTitle')}
                                  </p>
                                  <p className="text-xs text-amber-800">{pauseReasonText}</p>
                                  {leadRefreshStatus === 'error' && (
                                    <p className="text-xs text-red-600">{leadRefreshMessage}</p>
                                  )}
                                  {leadRefreshStatus === 'success' && (
                                    <p className="text-xs text-green-700">
                                      {t('leadRefreshSuccess')}
                                    </p>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={handleRefreshLead}
                                  disabled={leadRefreshStatus === 'loading' || conversationAiPaused}
                                  className={`shrink-0 rounded-md border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 ${leadRefreshStatus === 'loading' || conversationAiPaused ? 'cursor-not-allowed opacity-60' : ''}`}
                                >
                                  {leadRefreshStatus === 'loading'
                                    ? t('leadRefreshLoading')
                                    : t('leadRefresh')}
                                </button>
                              </div>
                            )}

                            {lead ? (
                              <div className="space-y-4">
                                <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                                  <span className="text-sm text-gray-500">{t('leadStatus')}</span>
                                  <div className="flex items-center gap-2 text-sm text-gray-900">
                                    <span
                                      className={`h-2 w-2 rounded-full ${
                                        lead.status === 'hot'
                                          ? 'bg-red-500'
                                          : lead.status === 'warm'
                                            ? 'bg-amber-500'
                                            : 'bg-gray-400'
                                      }`}
                                    />
                                    <span>{leadStatusLabels[lead.status] ?? lead.status}</span>
                                  </div>
                                </div>
                                <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                                  <span className="text-sm text-gray-500">{t('leadScore')}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-900">
                                      {lead.total_score}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={handleOpenScoreReason}
                                      disabled={scoreReasonStatus === 'loading'}
                                      className={`text-xs font-medium text-blue-600 hover:text-blue-700 ${scoreReasonStatus === 'loading' ? 'cursor-not-allowed opacity-60' : ''}`}
                                    >
                                      {t('scoreReason')}
                                    </button>
                                  </div>
                                </div>
                                <div className="grid grid-cols-[100px_1fr] items-start gap-4">
                                  <span className="text-sm text-gray-500">{t('leadService')}</span>
                                  <LeadServiceEditor
                                    currentService={resolvedLeadService.value}
                                    currentSource={resolvedLeadService.source}
                                    catalogServices={serviceCatalogNames}
                                    knownLeadUpdatedAt={lead.updated_at}
                                    isReadOnly={isReadOnly}
                                    labels={leadServiceEditorLabels}
                                    onSave={handleSaveLeadService}
                                    onReturnToAi={handleReturnLeadServiceToAi}
                                  />
                                </div>
                                {requiredIntakeFields.length > 0 && (
                                  <div className="grid grid-cols-[100px_1fr] items-start gap-4">
                                    <span className="text-sm text-gray-500">
                                      {t('leadRequiredInfo')}
                                    </span>
                                    <LeadRequiredInfoBlock
                                      editLabel={
                                        !isReadOnly ? t('leadRequiredInfoEdit') : undefined
                                      }
                                      onEdit={
                                        !isReadOnly
                                          ? () => setIsImportantInfoModalOpen(true)
                                          : undefined
                                      }
                                      items={collectedRequiredIntake}
                                      labels={importantInfoSummaryLabels}
                                    />
                                  </div>
                                )}
                                {lead.summary && (
                                  <div className="grid grid-cols-[100px_1fr] items-start gap-4">
                                    <span className="text-sm text-gray-500">
                                      {t('leadSummary')}
                                    </span>
                                    <span className="whitespace-pre-wrap text-sm text-gray-900">
                                      {lead.summary}
                                    </span>
                                  </div>
                                )}
                                {lead.updated_at && (
                                  <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                                    <span className="text-sm text-gray-500">
                                      {t('leadUpdated')}
                                    </span>
                                    <span className="text-sm text-gray-900">
                                      {format(new Date(lead.updated_at), 'PP p', {
                                        locale: dateLocale,
                                      })}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">{t('leadEmpty')}</p>
                            )}
                          </InboxDetailsSection>
                        </div>
                      )}

                      <div className={DESKTOP_DETAILS_SECTION_SPACING_CLASSNAME}>
                        <InboxDetailsSection
                          title={t('tags')}
                          isExpanded={detailsSectionState.tags}
                          onToggle={() => toggleDetailsSection('tags')}
                        >
                          <ConversationTagsEditor
                            key={`desktop-tags-${selectedId ?? 'none'}`}
                            tags={editableConversationTags}
                            isReadOnly={isReadOnly}
                            labels={tagEditorLabels}
                            onSave={handleSaveConversationTags}
                          />
                        </InboxDetailsSection>
                      </div>

                      <div className={DESKTOP_DETAILS_SECTION_SPACING_CLASSNAME}>
                        <InboxDetailsSection
                          title={t('privateNote')}
                          isExpanded={detailsSectionState.privateNote}
                          onToggle={() => toggleDetailsSection('privateNote')}
                        >
                          <ConversationPrivateNoteEditor
                            key={`desktop-note-${selectedId ?? 'none'}`}
                            note={selectedConversationPrivateNote}
                            knownPrivateNoteUpdatedAt={selectedConversationPrivateNoteUpdatedAt}
                            updatedByText={privateNoteUpdatedByLabel}
                            updatedAtText={privateNoteUpdatedAtText}
                            isReadOnly={isReadOnly}
                            labels={privateNoteLabels}
                            onSave={handleSaveConversationPrivateNote}
                          />
                        </InboxDetailsSection>
                      </div>
                    </div>

                    {!showConversationSkeleton && activeAgent === 'operator' && (
                      <div className="shrink-0 border-t border-gray-100 bg-white px-6 py-4 shadow-[0_-12px_24px_-20px_rgba(15,23,42,0.28)]">
                        <button
                          onClick={handleLeaveConversation}
                          disabled={isLeaving || isReadOnly}
                          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <LogOut size={18} />
                          {isLeaving ? t('leaving') : t('leaveConversation')}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="hidden flex-1 items-center justify-center lg:flex">
            <EmptyState icon={Inbox} title={t('noSelection')} description={t('noSelectionDesc')} />
          </div>
        )}
      </div>

      {isMobileBotModeSheetMounted && (
        <>
          <button
            type="button"
            aria-label={tSidebar('organizationSwitcherClose')}
            onClick={() => setIsMobileBotModeSheetOpen(false)}
            className={cn(
              'fixed inset-0 top-14 z-[1080] bg-gray-950/30 transition-opacity duration-200 ease-out lg:hidden',
              isMobileBotModeSheetVisible ? 'opacity-100' : 'opacity-0'
            )}
          />
          <div
            className={cn(
              'fixed inset-x-3 top-[calc(3.5rem+env(safe-area-inset-top))] z-[1090] max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl transition-all duration-200 ease-out lg:hidden',
              isMobileBotModeSheetVisible ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'
            )}
          >
            <div className="border-b border-slate-100 px-3.5 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {tSidebar('botStatusQuickSwitchTitle')}
                    </p>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        currentBotModeToneClasses.badge
                      )}
                    >
                      <span
                        className={cn('h-1.5 w-1.5 rounded-full', currentBotModeToneClasses.dot)}
                      />
                      {botModeLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {botModeQuickSwitchHelperText}
                  </p>
                  {isMobileBotModeUpdating && (
                    <p className="mt-2 text-xs font-medium text-slate-600">
                      {tSidebar('botStatusQuickSwitchSaving')}
                    </p>
                  )}
                  {mobileBotModeUpdateError && (
                    <p className="mt-2 text-xs font-medium text-rose-600">
                      {mobileBotModeUpdateError}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileBotModeSheetOpen(false)}
                  aria-label={tSidebar('organizationSwitcherClose')}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="p-2">
              {!canQuickSwitchBotMode && (
                <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-xs leading-5 text-slate-600">{botModeQuickSwitchHelperText}</p>
                </div>
              )}

              <div className="space-y-1.5">
                {botModeOptions.map((option) => {
                  const isSelected = resolvedBotMode === option.value
                  const optionToneClasses =
                    botModeToneClassMap[resolveMainSidebarBotModeTone(option.value)]
                  const optionClassName = cn(
                    'w-full rounded-xl border px-2.5 py-2 text-left',
                    isSelected
                      ? optionToneClasses.selected
                      : cn('border-slate-200 bg-white', optionToneClasses.hover),
                    !canQuickSwitchBotMode && 'cursor-default'
                  )

                  const optionContent = (
                    <div className="flex items-start gap-2.5">
                      <span
                        className={cn(
                          'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full',
                          isSelected
                            ? optionToneClasses.selectedIcon
                            : 'bg-slate-100 text-slate-500'
                        )}
                      >
                        <span className={cn('h-2 w-2 rounded-full', optionToneClasses.dot)} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-900">
                            {option.label}
                          </span>
                          {isSelected && (
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                              {tSidebar('botStatusCurrentLabel')}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                          {option.description}
                        </span>
                      </span>
                    </div>
                  )

                  if (!canQuickSwitchBotMode) {
                    return (
                      <div key={option.value} className={optionClassName}>
                        {optionContent}
                      </div>
                    )
                  }

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => void handleMobileBotModeChange(option.value)}
                      disabled={isMobileBotModeUpdating}
                      className={cn(optionClassName, isMobileBotModeUpdating && 'opacity-70')}
                    >
                      {optionContent}
                    </button>
                  )
                })}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsMobileBotModeSheetOpen(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {tSidebar('organizationSwitcherClose')}
                </button>
                <Link
                  href="/settings/ai"
                  onClick={() => setIsMobileBotModeSheetOpen(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                >
                  {tSidebar('botStatusQuickSwitchOpenSettings')}
                </Link>
              </div>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onCancel={() => setDeleteDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmDelete}
        title={t('deleteConversation')}
        description={t('deleteConfirm')}
        confirmText={t('deleteConversation')}
        cancelText={t('cancel')}
        isDestructive
        isLoading={deleteDialog.isLoading}
      />

      <Modal
        isOpen={isImportantInfoModalOpen}
        onClose={() => setIsImportantInfoModalOpen(false)}
        title={t('leadRequiredInfoModalTitle')}
      >
        {lead ? (
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <ImportantInfoEditor
              key={`modal-important-info-${selectedId ?? 'none'}`}
              items={collectedRequiredIntake}
              isReadOnly={isReadOnly}
              knownLeadUpdatedAt={lead?.updated_at ?? null}
              labels={importantInfoEditorLabels}
              onSave={handleSaveRequiredInfo}
              onReturnToAi={handleReturnRequiredInfoToAi}
            />
          </div>
        ) : (
          <p className="text-sm text-gray-500">{t('leadEmpty')}</p>
        )}
      </Modal>

      <Modal
        isOpen={isScoreReasonOpen}
        onClose={() => setIsScoreReasonOpen(false)}
        title={t('scoreReasonTitle')}
      >
        {scoreReasonStatus === 'loading' && (
          <div className="space-y-2">
            <div className="h-4 w-3/4 rounded-md bg-gradient-to-r from-blue-50 via-blue-100 to-blue-50 animate-pulse" />
            <div className="h-4 w-11/12 rounded-md bg-gradient-to-r from-blue-50 via-blue-100 to-blue-50 animate-pulse" />
            <div className="h-4 w-2/3 rounded-md bg-gradient-to-r from-blue-50 via-blue-100 to-blue-50 animate-pulse" />
          </div>
        )}
        {scoreReasonStatus === 'success' && (
          <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
            {scoreReasonText}
          </div>
        )}
        {scoreReasonStatus === 'error' && (
          <p className="text-sm text-red-600">{scoreReasonMessage}</p>
        )}
      </Modal>

      {selectedId && (
        <TemplatePickerModal
          conversationId={selectedId}
          platform={selectedConversation?.platform ?? 'simulator'}
          isOpen={isTemplatePickerModalOpen}
          isReadOnly={isReadOnly}
          onClose={() => setIsTemplatePickerModalOpen(false)}
          onInsert={(value) => {
            const trimmedValue = value.trim()
            if (!trimmedValue) return
            setInput((current) => {
              const normalizedCurrent = current.trim()
              return normalizedCurrent ? `${current}\n${trimmedValue}` : trimmedValue
            })
          }}
        />
      )}

      {selectedId && (
        <WhatsAppTemplateSendModal
          conversationId={selectedId}
          isOpen={isWhatsAppTemplateModalOpen}
          isReadOnly={isReadOnly}
          onClose={() => setIsWhatsAppTemplateModalOpen(false)}
          onSent={() => void refreshMessages(selectedId)}
        />
      )}

      <Modal
        isOpen={Boolean(previewAttachment)}
        onClose={() => setPreviewAttachmentId(null)}
        title={previewAttachment?.name ?? t('composerAttachments.previewTitle')}
      >
        {previewAttachment && (
          <div className="space-y-4">
            {previewAttachment.mediaType === 'image' && previewAttachment.previewUrl ? (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewAttachment.previewUrl}
                  alt={previewAttachment.name}
                  className="max-h-[420px] w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500">
                  <FileText size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">
                    {previewAttachment.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatAttachmentSize(previewAttachment.sizeBytes)}
                  </p>
                </div>
              </div>
            )}
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
              <p>
                {t('composerAttachments.mimeTypeLabel')}: {previewAttachment.mimeType}
              </p>
              <p>
                {t('composerAttachments.sizeLabel')}:{' '}
                {formatAttachmentSize(previewAttachment.sizeBytes)}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
