'use client'

import Link from 'next/link'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Avatar, EmptyState, IconButton, ConfirmDialog, Modal, Skeleton } from '@/design'
import {
    Inbox, ChevronDown,
    Paperclip, Image, Zap, Bot, Trash2, MoreHorizontal, LogOut, Send, RotateCw, ArrowLeft, ArrowDown, CircleHelp, X
} from 'lucide-react'
import { FaArrowTurnDown, FaArrowTurnUp } from 'react-icons/fa6'
import { HiMiniSparkles, HiOutlineDocumentText } from 'react-icons/hi2'
import { Conversation, Lead, Message, Profile } from '@/types/database'
import {
    getMessages,
    sendMessage,
    getConversations,
    deleteConversation,
    sendSystemMessage,
    setConversationAgent,
    markConversationRead,
    getConversationSummary,
    getConversationLead,
    getLeadScoreReasoning,
    refreshConversationLead,
    setConversationAiProcessingPaused,
    type ConversationListItem
} from '@/lib/inbox/actions'
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
    getMobileListPaneClasses
} from '@/components/inbox/mobilePaneState'
import { resolveSummaryToggle } from '@/components/inbox/summaryPanelState'
import { shouldShowConversationSkeleton } from '@/components/inbox/conversationSwitchState'
import { cn } from '@/lib/utils'
import { DEFAULT_SCROLL_TO_LATEST_THRESHOLD, getDistanceFromBottom, shouldShowScrollToLatestButton } from '@/components/inbox/scrollToLatest'
import { applyLeadStatusToConversationList } from '@/components/inbox/conversationLeadStatus'
import { getChannelPlatformIconSrc } from '@/lib/channels/platform-icons'
import { getLatestContactMessageAt, resolveWhatsAppReplyWindowState } from '@/lib/whatsapp/reply-window'
import { WhatsAppTemplateSendModal } from '@/components/inbox/WhatsAppTemplateSendModal'
import { TemplatePickerModal } from '@/components/inbox/TemplatePickerModal'
import { formatRelativeTimeFromBase } from '@/components/inbox/relativeTime'
import { buildMessageDateSeparators } from '@/components/inbox/messageDateSeparators'
import { extractSkillTitleFromMetadata, splitBotMessageDisclaimer } from '@/components/inbox/botMessageContent'
import {
    filterConversationsByQueue,
    summarizeConversationQueueCounts,
    type InboxQueueTab
} from '@/components/inbox/conversationQueueFilters'
import { updateOrgAiSettings } from '@/lib/ai/settings'
import { resolveMainSidebarBotModeTone } from '@/design/main-sidebar-bot-mode'

import { useTranslations, useLocale } from 'next-intl'
import type { AiBotMode } from '@/types/database'

interface InboxContainerProps {
    initialConversations: ConversationListItem[]
    renderedAtIso: string
    organizationId: string
    botName?: string
    botMode?: AiBotMode
    allowLeadExtractionDuringOperator?: boolean
    requiredIntakeFields?: string[]
    isReadOnly?: boolean
}

type ProfileLite = Pick<Profile, 'id' | 'full_name' | 'email'>
type Assignee = Pick<Profile, 'full_name' | 'email'>
const SUMMARY_PANEL_ID = 'conversation-summary-panel'

export function InboxContainer({
    initialConversations,
    renderedAtIso,
    organizationId,
    botName,
    botMode,
    allowLeadExtractionDuringOperator,
    requiredIntakeFields = [],
    isReadOnly = false
}: InboxContainerProps) {
    const t = useTranslations('inbox')
    const tSidebar = useTranslations('mainSidebar')
    const tAiSettings = useTranslations('aiSettings')
    const locale = useLocale()
    const dateLocale = locale === 'tr' ? tr : undefined
    const [conversations, setConversations] = useState<ConversationListItem[]>(initialConversations)
    const [relativeTimeBaseDate, setRelativeTimeBaseDate] = useState<Date>(() => {
        const parsed = new Date(renderedAtIso)
        return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed
    })
    const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id || null)
    const [messages, setMessages] = useState<Message[]>([])
    const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null)
    const [lead, setLead] = useState<Lead | null>(null)
    const [input, setInput] = useState('')
    const [isSending, setIsSending] = useState(false)
    const [summaryStatus, setSummaryStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [summaryText, setSummaryText] = useState('')
    const [isSummaryOpen, setIsSummaryOpen] = useState(false)
    const [scoreReasonStatus, setScoreReasonStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [scoreReasonText, setScoreReasonText] = useState('')
    const [scoreReasonError, setScoreReasonError] = useState<'missing_api_key' | 'missing_lead' | 'billing_locked' | 'request_failed' | null>(null)
    const [isScoreReasonOpen, setIsScoreReasonOpen] = useState(false)
    const [leadRefreshStatus, setLeadRefreshStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [leadRefreshError, setLeadRefreshError] = useState<'missing_api_key' | 'missing_conversation' | 'billing_locked' | 'paused' | 'request_failed' | null>(null)
    const [leadAutoRefreshStatus, setLeadAutoRefreshStatus] = useState<'idle' | 'loading'>('idle')
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(initialConversations.length >= 20)
    const [loadingMore, setLoadingMore] = useState(false)
    const [isDetailsMenuOpen, setIsDetailsMenuOpen] = useState(false)
    const [isLeaving, setIsLeaving] = useState(false)
    const [currentUserProfile, setCurrentUserProfile] = useState<ProfileLite | null>(null)
    const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, isLoading: false })
    const [isMobileConversationOpen, setIsMobileConversationOpen] = useState(false)
    const [isMobileDetailsOpen, setIsMobileDetailsOpen] = useState(false)
    const [showScrollToLatest, setShowScrollToLatest] = useState(false)
    const [isTemplatePickerModalOpen, setIsTemplatePickerModalOpen] = useState(false)
    const [isWhatsAppTemplateModalOpen, setIsWhatsAppTemplateModalOpen] = useState(false)
    const [isAiPauseUpdating, setIsAiPauseUpdating] = useState(false)
    const [aiPauseError, setAiPauseError] = useState(false)
    const [activeQueueTab, setActiveQueueTab] = useState<InboxQueueTab>('all')
    const [inboxBotMode, setInboxBotMode] = useState<AiBotMode>(botMode ?? 'active')
    const [isMobileBotModeSheetOpen, setIsMobileBotModeSheetOpen] = useState(false)
    const [isMobileBotModeSheetMounted, setIsMobileBotModeSheetMounted] = useState(false)
    const [isMobileBotModeSheetVisible, setIsMobileBotModeSheetVisible] = useState(false)
    const [isMobileBotModeUpdating, setIsMobileBotModeUpdating] = useState(false)
    const [mobileBotModeUpdateError, setMobileBotModeUpdateError] = useState<string | null>(null)

    const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
    if (!supabaseRef.current) {
        supabaseRef.current = createClient()
    }
    const supabase = supabaseRef.current

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)
    const messagesRef = useRef<Message[]>([])
    const leadRef = useRef<Lead | null>(null)
    const refreshInFlightRef = useRef(false)
    const refreshRequestRef = useRef<string | null>(null)
    const assigneeCacheRef = useRef<Record<string, Assignee>>({})
    const selectedIdRef = useRef(selectedId)
    const leadRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const leadAutoRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const leadStatusLabels: Record<string, string> = {
        hot: t('leadStatusHot'),
        warm: t('leadStatusWarm'),
        cold: t('leadStatusCold')
    }
    const leadExtractedFields = lead?.extracted_fields && typeof lead.extracted_fields === 'object' && !Array.isArray(lead.extracted_fields)
        ? lead.extracted_fields as Record<string, unknown>
        : {}
    const collectedRequiredIntake = resolveCollectedRequiredIntake({
        requiredFields: requiredIntakeFields,
        extractedFields: leadExtractedFields,
        serviceType: lead?.service_type
    })

    useEffect(() => {
        selectedIdRef.current = selectedId
    }, [selectedId])

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
        if (leadRefreshTimeoutRef.current) {
            clearTimeout(leadRefreshTimeoutRef.current)
            leadRefreshTimeoutRef.current = null
        }
        if (leadAutoRefreshTimeoutRef.current) {
            clearTimeout(leadAutoRefreshTimeoutRef.current)
            leadAutoRefreshTimeoutRef.current = null
        }
    }, [selectedId])

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

    const handleScroll = async (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
        if (scrollHeight - scrollTop <= clientHeight + 50 && hasMore && !loadingMore) {
            setLoadingMore(true)
            try {
                const nextConversations = await getConversations(organizationId, page)
                if (nextConversations.length > 0) {
                    setConversations(prev => {
                        const existingIds = new Set(prev.map(c => c.id))
                        const uniqueNew = nextConversations.filter(c => !existingIds.has(c.id))
                        return [...prev, ...uniqueNew]
                    })
                    setPage(prev => prev + 1)
                } else {
                    setHasMore(false)
                }
            } catch (error) {
                console.error('Failed to load more conversations', error)
            } finally {
                setLoadingMore(false)
            }
        }
    }

    const refreshLead = useCallback(async (conversationId: string) => {
        try {
            const result = await getConversationLead(conversationId)
            setConversations(prev => applyLeadStatusToConversationList(prev, conversationId, result?.status ?? null))
            if (selectedIdRef.current !== conversationId) return
            setLead(result)
            return result
        } catch (error) {
            console.error('Failed to refresh lead', error)
        }
        return null
    }, [])

    const scheduleLeadAutoRefresh = useCallback((conversationId: string) => {
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
    }, [refreshLead])

    const refreshMessages = useCallback(async (conversationId: string) => {
        refreshRequestRef.current = conversationId
        if (refreshInFlightRef.current) return
        refreshInFlightRef.current = true
        try {
            while (refreshRequestRef.current) {
                const nextId = refreshRequestRef.current
                refreshRequestRef.current = null
                const msgs = await getMessages(nextId)
                if (selectedIdRef.current !== nextId) continue
                setMessages(msgs)
                setLoadedConversationId(nextId)
                setConversations(prev => prev.map(c =>
                    c.id === nextId ? { ...c, unread_count: 0 } : c
                ))
                await markConversationRead(nextId)
                await refreshLead(nextId)
            }
        } catch (error) {
            console.error('Failed to refresh messages', error)
        } finally {
            refreshInFlightRef.current = false
        }
    }, [refreshLead])

    const resolveAssignee = useCallback(async (assigneeId: string | null) => {
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
            email: data.email
        }
        assigneeCacheRef.current[assigneeId] = assignee
        return assignee
    }, [supabase])

    useEffect(() => {
        messagesRef.current = messages
    }, [messages])

    useEffect(() => {
        leadRef.current = lead
    }, [lead])

    useEffect(() => {
        let isMounted = true

        const loadProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .eq('id', user.id)
                .single()

            if (!isMounted || error || !data) return

            const profile: ProfileLite = {
                id: data.id,
                full_name: data.full_name,
                email: data.email
            }

            assigneeCacheRef.current[data.id] = {
                full_name: data.full_name,
                email: data.email
            }
            setCurrentUserProfile(profile)
        }

        loadProfile()

        return () => {
            isMounted = false
        }
    }, [supabase])

    useEffect(() => {
        if (!selectedId) {
            setMessages([])
            setLoadedConversationId(null)
            setLead(null)
            return
        }
        setMessages([])
        setLead(null)
        refreshMessages(selectedId)
        refreshLead(selectedId)
    }, [refreshMessages, refreshLead, selectedId])

    // Scroll Management
    const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
        if (!messagesEndRef.current) return

        // Use setTimeout to ensure DOM is fully rendered/layout updated
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' })
            setTimeout(() => setShowScrollToLatest(false), behavior === 'smooth' ? 250 : 0)
        }, 100)
    }

    const syncScrollToLatestVisibility = useCallback(() => {
        const container = messagesContainerRef.current
        if (!container) {
            setShowScrollToLatest(false)
            return
        }
        const distanceFromBottom = getDistanceFromBottom(container)
        setShowScrollToLatest(
            shouldShowScrollToLatestButton(distanceFromBottom, DEFAULT_SCROLL_TO_LATEST_THRESHOLD)
        )
    }, [])

    const handleMessagesScroll = useCallback(() => {
        syncScrollToLatestVisibility()
    }, [syncScrollToLatestVisibility])

    // Effect for conversation switch (Instant scroll)
    useEffect(() => {
        scrollToBottom('auto')
    }, [selectedId])

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
    }, [messages])

    useEffect(() => {
        const timer = setTimeout(() => {
            syncScrollToLatestVisibility()
        }, 120)
        return () => clearTimeout(timer)
    }, [messages, selectedId, syncScrollToLatestVisibility])

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
                }
            })
            if (!isMounted) {
                cleanupRealtimeAuth()
                cleanupRealtimeAuth = null
                return
            }

            console.log('Setting up Realtime subscription...')

            // Separate channels for messages and conversations
            messagesChannel = supabase.channel('inbox_messages')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `organization_id=eq.${organizationId}`
                }, (payload) => {
                    const newMsg = payload.new as Message
                    console.log('Realtime Message received:', newMsg)

                    // 1. Update active chat if it matches selectedId
                    if (newMsg.conversation_id === selectedIdRef.current) {
                        setMessages(prev => {
                            // Check if we already have this message (dedupe real IDs)
                            if (prev.some(m => m.id === newMsg.id)) return prev

                            // Dedupe optimistic messages:
                            // If we find a temp message with same content & sender, remove it and add real one
                            const isUserSender = newMsg.sender_type === 'user'

                            // Filter out matching temp messages if it's a user message
                            const filtered = isUserSender
                                ? prev.filter(m => !(m.id.startsWith('temp-') && m.content === newMsg.content && m.sender_type === 'user'))
                                : prev

                            return [...filtered, newMsg]
                        })
                    }

                    if (newMsg.sender_type === 'contact' && newMsg.conversation_id === selectedIdRef.current) {
                        scheduleLeadAutoRefresh(newMsg.conversation_id)
                    }

                    // 2. Update conversation list (unread, last_message, sort)
                    setConversations(prev => prev.map(c => {
                        if (c.id === newMsg.conversation_id) {
                            const shouldIncrementUnread = newMsg.sender_type === 'contact'
                            const previewMessage: Pick<Message, 'content' | 'created_at' | 'sender_type'> = {
                                content: newMsg.content,
                                created_at: newMsg.created_at,
                                sender_type: newMsg.sender_type
                            }
                            return {
                                ...c,
                                last_message_at: newMsg.created_at,
                                // Only increment unread if it's NOT the currently open chat
                                unread_count: newMsg.conversation_id !== selectedIdRef.current
                                    ? (shouldIncrementUnread ? c.unread_count + 1 : c.unread_count)
                                    : 0,
                                // If we have messages snippet in list, update it too
                                messages: [previewMessage]
                            }
                        }
                        return c
                    }).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()))
                })
                .subscribe((status, err) => {
                    console.log('Messages Channel Status:', status, err ? { error: err } : '')
                })

            conversationsChannel = supabase.channel('inbox_conversations')
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'conversations',
                    filter: `organization_id=eq.${organizationId}`
                }, (payload) => {
                    const newOrUpdatedConv = payload.new as Conversation
                    console.log('Realtime Conversation event:', payload.eventType, newOrUpdatedConv)

                    setConversations(prev => {
                        // Check if exists
                        const exists = prev.some(c => c.id === newOrUpdatedConv.id)

                        if (exists) {
                            // UPDATE logic
                            return prev.map(c => {
                                if (c.id === newOrUpdatedConv.id) {
                                    const nextAssignee = newOrUpdatedConv.assignee_id
                                        ? (assigneeCacheRef.current[newOrUpdatedConv.assignee_id] ?? (c.assignee_id === newOrUpdatedConv.assignee_id ? c.assignee : null))
                                        : null

                                    return {
                                        ...c,
                                        ...newOrUpdatedConv,
                                        leads: c.leads, // preserve relational data
                                        messages: c.messages, // preserve relational data
                                        assignee: nextAssignee
                                    }
                                }
                                return c
                            }).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
                        } else {
                            // INSERT logic (new conversation)
                            return [newOrUpdatedConv, ...prev]
                        }
                    })

                    // Resolve assignee if needed
                    if (newOrUpdatedConv.assignee_id && !assigneeCacheRef.current[newOrUpdatedConv.assignee_id]) {
                        resolveAssignee(newOrUpdatedConv.assignee_id).then((assignee) => {
                            if (!assignee) return
                            setConversations(prev => prev.map(c =>
                                c.id === newOrUpdatedConv.id ? { ...c, assignee } : c
                            ))
                        })
                    }

                    if (newOrUpdatedConv.id === selectedIdRef.current) {
                        const lastMessageAt = messagesRef.current[messagesRef.current.length - 1]?.created_at
                        if (!lastMessageAt || new Date(newOrUpdatedConv.last_message_at).getTime() > new Date(lastMessageAt).getTime()) {
                            refreshMessages(newOrUpdatedConv.id)
                        }
                    }
                })
                .subscribe((status, err) => {
                    console.log('Conversations Channel Status:', status, err ? { error: err } : '')
                })

            // Separate channel for leads
            leadsChannel = supabase.channel('inbox_leads')
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'leads',
                    filter: `organization_id=eq.${organizationId}`
                }, (payload) => {
                    const leadRow = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Lead | null
                    console.log('Realtime Lead event:', payload.eventType, leadRow)
                    if (!leadRow?.conversation_id) return

                    setConversations(prev => applyLeadStatusToConversationList(
                        prev,
                        leadRow.conversation_id,
                        payload.eventType === 'DELETE' ? null : leadRow.status
                    ))

                    if (leadRow.conversation_id === selectedIdRef.current) {
                        if (payload.eventType === 'DELETE') {
                            setLead(null)
                        } else {
                            setLead(leadRow)
                        }
                    }
                })
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
    }, [organizationId, refreshMessages, resolveAssignee, scheduleLeadAutoRefresh, supabase])

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
        const selectedConversation = conversations.find((conversation) => conversation.id === selectedId)
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

        const previousPaused = Boolean(conversations.find((conversation) => conversation.id === selectedId)?.ai_processing_paused)

        setConversations(prev => prev.map(conversation => (
            conversation.id === selectedId
                ? { ...conversation, ai_processing_paused: paused }
                : conversation
        )))

        try {
            const result = await setConversationAiProcessingPaused(selectedId, paused)
            setConversations(prev => prev.map(conversation => (
                conversation.id === selectedId
                    ? { ...conversation, ai_processing_paused: result.ai_processing_paused }
                    : conversation
            )))
        } catch (error) {
            console.error('Failed to update conversation AI processing pause', error)
            setConversations(prev => prev.map(conversation => (
                conversation.id === selectedId
                    ? { ...conversation, ai_processing_paused: previousPaused }
                    : conversation
            )))
            setAiPauseError(true)
        } finally {
            setIsAiPauseUpdating(false)
        }
    }

    const handleSendMessage = async () => {
        if (isReadOnly) return
        if (!selectedId || !input.trim() || isSending || isWhatsAppReplyBlocked) return
        const tempMsg: Message = {
            id: 'temp-' + Date.now(),
            conversation_id: selectedId,
            sender_type: 'user',
            content: input,
            metadata: {},
            created_at: new Date().toISOString()
        }
        setMessages(prev => [...prev, tempMsg])

        // Optimistically set active agent to operator
        const optimisticAssignee: Assignee | null = currentUserProfile
            ? { full_name: currentUserProfile.full_name, email: currentUserProfile.email }
            : null
        const optimisticPreviewMessage: Pick<Message, 'content' | 'created_at' | 'sender_type'> = {
            content: input,
            created_at: new Date().toISOString(),
            sender_type: 'user'
        }

        setConversations(prev => prev.map(c =>
            c.id === selectedId ? {
                ...c,
                active_agent: 'operator' as const,
                assignee_id: currentUserProfile?.id ?? c.assignee_id,
                assignee: optimisticAssignee ?? c.assignee,
                last_message_at: new Date().toISOString(),
                messages: [optimisticPreviewMessage]
            } : c
        ).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()))

        setInput('')
        setIsSending(true)
        try {
            const result = await sendMessage(selectedId, input)
            if (result?.conversation) {
                const assignee = await resolveAssignee(result.conversation.assignee_id ?? null)
                setConversations(prev => prev.map(c =>
                    c.id === selectedId
                        ? {
                            ...c,
                            ...result.conversation,
                            assignee: assignee ?? c.assignee
                        }
                        : c
                ))
            }
            await refreshMessages(selectedId)
        } catch (error) {
            console.error('Failed to send message', error)
        } finally {
            setIsSending(false)
        }
    }

    const handleOpenInWhatsAppPhone = () => {
        const activeConversation = conversations.find(conversation => conversation.id === selectedId)
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

        setDeleteDialog(prev => ({ ...prev, isLoading: true }))
        try {
            await deleteConversation(selectedId)
            setConversations(prev => prev.filter(c => c.id !== selectedId))
            setSelectedId(null)
            setDeleteDialog({ isOpen: false, isLoading: false })
        } catch (error) {
            console.error('Failed to delete conversation', error)
            setDeleteDialog(prev => ({ ...prev, isLoading: false }))
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
            created_at: new Date().toISOString()
        }
        setMessages(prev => [...prev, tempMsg])

        try {
            // Send a system message to mark the end of operator session
            await sendSystemMessage(selectedId, content)
            // Explicitly set agent back to bot
            await setConversationAgent(selectedId, 'bot')

            // Update local state
            setConversations(prev => prev.map(c =>
                c.id === selectedId ? { ...c, active_agent: 'bot' } : c
            ))
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
        setSelectedId(conversationId)
        setIsMobileConversationOpen(true)
    }

    const handleBackToConversationList = () => {
        setIsMobileConversationOpen(false)
        setIsMobileDetailsOpen(false)
    }

    const currentUserId = currentUserProfile?.id ?? null
    const effectiveQueueTab: InboxQueueTab = activeQueueTab === 'me' && !currentUserId
        ? 'all'
        : activeQueueTab
    const queueCounts = summarizeConversationQueueCounts({
        conversations,
        currentUserId
    })
    const filteredConversations = filterConversationsByQueue({
        conversations,
        queue: effectiveQueueTab,
        currentUserId
    })
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
            {filteredConversations.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-start p-6 pt-20 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                        <Inbox className="text-gray-400" size={24} />
                    </div>
                    <h3 className="text-sm font-medium text-gray-900">{t('noMessages')}</h3>
                    <p className="mt-1 text-xs text-gray-500">{t('noMessagesDesc')}</p>
                </div>
            ) : (
                filteredConversations.map(c => {
                    const leadStatus = c.leads?.[0]?.status
                    const leadStatusLabel = leadStatus
                        ? (leadStatusLabels[leadStatus] ?? leadStatus)
                        : null
                    const leadChipClassName = leadStatus === 'hot'
                        ? 'border-red-100 bg-red-50 text-red-700'
                        : leadStatus === 'warm'
                            ? 'border-amber-100 bg-amber-50 text-amber-700'
                            : leadStatus === 'cold'
                                ? 'border-slate-200 bg-slate-100 text-slate-600'
                                : 'border-gray-200 bg-gray-100 text-gray-600'
                    const attentionReasonLabel = c.human_attention_reason === 'skill_handover'
                        ? t('queueAttentionReasonSkill')
                        : c.human_attention_reason === 'hot_lead'
                            ? t('queueAttentionReasonHotLead')
                            : null

                    return (
                        <div
                            key={c.id}
                            onClick={() => handleSelectConversation(c.id)}
                            className={`relative cursor-pointer border-b border-gray-100 bg-white px-4 py-4 transition-colors hover:bg-gray-50 group ${selectedId === c.id ? "bg-blue-50/30" : ""}`}
                        >
                            <div className="flex items-start gap-3">
                                <div className="relative shrink-0">
                                    <Avatar name={c.contact_name} size="sm" />
                                    <div className="absolute left-1/2 top-full -mt-2 -translate-x-1/2">
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full border-[0.5px] border-white/50 bg-white shadow-sm">
                                            {c.platform !== 'simulator' ? (
                                                <img alt="" aria-hidden className="h-[18px] w-[18px]" src={getChannelPlatformIconSrc(c.platform)} />
                                            ) : (
                                                <span className="text-[9px] font-semibold uppercase text-gray-400">{t('platformSimulatorShort')}</span>
                                            )}
                                        </span>
                                    </div>
                                </div>
                                <div className="min-w-0 flex-1 pr-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`truncate text-sm font-semibold ${c.unread_count > 0 ? "text-gray-900" : "text-gray-700"}`}>
                                            {c.contact_name}
                                        </span>
                                        <div className="ml-auto flex items-center gap-1.5">
                                            {leadStatusLabel && (
                                                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${leadChipClassName}`}>
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
                                    <p className={`mt-0.5 flex items-center gap-1.5 truncate text-sm leading-relaxed ${c.unread_count > 0 ? 'text-gray-700' : 'text-gray-500'}`}>
                                        {c.messages?.[0] && (
                                            c.messages[0].sender_type === 'contact'
                                                ? <FaArrowTurnDown className="shrink-0 text-gray-400" size={10} />
                                                : <FaArrowTurnUp className="shrink-0 text-gray-400" size={10} />
                                        )}
                                        <span className="truncate">{c.messages?.[0]?.content || t('noMessagesYet')}</span>
                                    </p>
                                    <div className="mt-0.5 flex items-center justify-between">
                                        <span className="text-xs text-gray-400">
                                            {formatRelativeTimeFromBase({
                                                targetIso: c.last_message_at,
                                                baseDate: relativeTimeBaseDate,
                                                locale: dateLocale
                                            }) || ''}
                                        </span>
                                        {c.unread_count > 0 && (
                                            <span className="h-2 w-2 rounded-full bg-blue-500" />
                                        )}
                                    </div>
                                </div>
                            </div>
                            {selectedId === c.id && <div className="absolute bottom-0 left-0 top-0 w-0.5 bg-blue-500"></div>}
                        </div>
                    )
                })
            )}
            {loadingMore && (
                <div className="flex justify-center p-4">
                    <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-blue-500"></div>
                </div>
            )}
        </>
    )

    const selectedConversation = conversations.find(c => c.id === selectedId)
    const showConversationSkeleton = shouldShowConversationSkeleton(selectedConversation?.id ?? null, loadedConversationId)
    const visibleMessages = showConversationSkeleton ? [] : messages
    const messageDateSeparatorById = new Map(
        buildMessageDateSeparators({
            messages: visibleMessages,
            now: relativeTimeBaseDate,
            todayLabel: t('today'),
            yesterdayLabel: t('yesterday'),
            dateLocale
        }).map(separator => [separator.messageId, separator.label])
    )
    const isWhatsAppConversation = selectedConversation?.platform === 'whatsapp'
    const latestWhatsAppInboundAt = isWhatsAppConversation && !showConversationSkeleton
        ? getLatestContactMessageAt(visibleMessages)
        : null
    const whatsappReplyWindowState = isWhatsAppConversation && !showConversationSkeleton
        ? resolveWhatsAppReplyWindowState({
            latestInboundAt: latestWhatsAppInboundAt
        })
        : null
    const isWhatsAppReplyBlocked = Boolean(whatsappReplyWindowState && !whatsappReplyWindowState.canReply)
    const isWhatsAppWindowExpired = whatsappReplyWindowState?.reason === 'window_expired'
    const isWhatsAppMissingInbound = whatsappReplyWindowState?.reason === 'missing_inbound'
    const whatsappReplyBlockedTooltip = whatsappReplyWindowState?.reason === 'window_expired'
        ? t('whatsappReplyWindow.tooltipExpired')
        : t('whatsappReplyWindow.tooltipNoInbound')
    const whatsappComposerOverlayMessage = whatsappReplyWindowState?.reason === 'window_expired'
        ? t('whatsappReplyWindow.composerLockedExpired')
        : t('whatsappReplyWindow.composerLockedNoInbound')
    const canOpenWhatsAppPhone = Boolean((selectedConversation?.contact_phone ?? '').replace(/\D/g, ''))

    const resolvedBotMode = inboxBotMode
    const botModeToneClassMap = {
        emerald: {
            surface: 'border-emerald-200 bg-emerald-100/85 text-emerald-950 hover:bg-emerald-100',
            badge: 'bg-emerald-200/70 text-emerald-900',
            dot: 'bg-emerald-500',
            selected: 'border-emerald-300 bg-emerald-50',
            selectedIcon: 'bg-emerald-100 text-emerald-700',
            hover: 'hover:border-emerald-200 hover:bg-emerald-50/60'
        },
        amber: {
            surface: 'border-amber-200 bg-amber-100/85 text-amber-950 hover:bg-amber-100',
            badge: 'bg-amber-200/70 text-amber-900',
            dot: 'bg-amber-500',
            selected: 'border-amber-300 bg-amber-50',
            selectedIcon: 'bg-amber-100 text-amber-700',
            hover: 'hover:border-amber-200 hover:bg-amber-50/60'
        },
        rose: {
            surface: 'border-rose-200 bg-rose-100/85 text-rose-950 hover:bg-rose-100',
            badge: 'bg-rose-200/70 text-rose-900',
            dot: 'bg-rose-500',
            selected: 'border-rose-300 bg-rose-50',
            selectedIcon: 'bg-rose-100 text-rose-700',
            hover: 'hover:border-rose-200 hover:bg-rose-50/60'
        }
    } as const
    const botModeOptions = useMemo<Array<{ value: AiBotMode; label: string; description: string }>>(() => {
        return [
            {
                value: 'active',
                label: tAiSettings('botModeActive'),
                description: tAiSettings('botModeActiveDescription')
            },
            {
                value: 'shadow',
                label: tAiSettings('botModeShadow'),
                description: tAiSettings('botModeShadowDescription')
            },
            {
                value: 'off',
                label: tAiSettings('botModeOff'),
                description: tAiSettings('botModeOffDescription')
            }
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
    const handleMobileBotModeChange = useCallback(async (nextBotMode: AiBotMode) => {
        if (!canQuickSwitchBotMode || isMobileBotModeUpdating) return
        if (nextBotMode === inboxBotMode) return

        const previousBotMode = inboxBotMode
        setInboxBotMode(nextBotMode)
        setIsMobileBotModeUpdating(true)
        setMobileBotModeUpdateError(null)

        try {
            const savedSettings = await updateOrgAiSettings({
                bot_mode: nextBotMode
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
    }, [
        canQuickSwitchBotMode,
        inboxBotMode,
        isMobileBotModeUpdating,
        tSidebar
    ])
    // NEW: Use explicit state from conversation
    // Fallback to 'ai' (bot) if undefined (e.g. old data or optimistic new conv)
    const activeAgent = selectedConversation?.active_agent === 'operator' ? 'operator' : 'ai'
    const assistantBanner = resolveAssistantBanner({
        activeAgent,
        botMode: resolvedBotMode
    })
    const inputPlaceholder = activeAgent === 'ai' ? t('takeOverPlaceholder') : t('replyPlaceholder')
    const isComposerDisabled = isReadOnly || showConversationSkeleton || isWhatsAppReplyBlocked
    const isTemplatePickerDisabled = isReadOnly || showConversationSkeleton || (isWhatsAppConversation && isWhatsAppReplyBlocked)
    const canSend = !!input.trim() && !isSending && !isComposerDisabled
    const contactMessageCount = visibleMessages.filter(m => m.sender_type === 'contact').length
    const canSummarize = contactMessageCount >= 3
    const summaryHeaderDisabled = !canSummarize
    const summaryRefreshDisabled = !canSummarize || summaryStatus === 'loading'
    const showSummaryRefresh = isSummaryOpen && (summaryStatus === 'success' || summaryStatus === 'error')
    const scoreReasonMessage = scoreReasonError === 'missing_api_key'
        ? t('scoreReasonMissing')
        : scoreReasonError === 'missing_lead'
            ? t('scoreReasonNoLead')
            : scoreReasonError === 'billing_locked'
                ? t('scoreReasonBillingLocked')
            : t('scoreReasonError')
    const operatorActive = isOperatorActive(selectedConversation)
    const allowDuringOperator = Boolean(allowLeadExtractionDuringOperator)
    const conversationAiPaused = Boolean(selectedConversation?.ai_processing_paused)
    const leadExtractionPaused = Boolean(selectedConversation) && (
        conversationAiPaused
        || resolvedBotMode === 'off'
        || (operatorActive && !allowDuringOperator)
    )
    const pauseReasons: string[] = []
    if (conversationAiPaused) pauseReasons.push(t('leadPausedReasonConversation'))
    if (operatorActive && !allowDuringOperator) pauseReasons.push(t('leadPausedReasonOperator'))
    if (resolvedBotMode === 'off') pauseReasons.push(t('leadPausedReasonAiOff'))
    const pauseReasonText = pauseReasons.join(t('leadPausedReasonSeparator'))
    const leadRefreshMessage = leadRefreshError === 'missing_api_key'
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
        maximumFractionDigits: 1
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
                                {t('copilot')}
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
                                <img alt="" aria-hidden className="h-4 w-4" src={getChannelPlatformIconSrc(selectedConversation.platform)} />
                            ) : (
                                <span className="text-[10px] font-semibold uppercase text-gray-400">{t('platformSimulatorShort')}</span>
                            )}
                        </span>
                        <span className={cn(valueTextClassName, 'capitalize')}>{selectedConversation.platform}</span>
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
                        <p className={cn('mt-1 text-xs text-gray-500', isMobileVariant && 'leading-5')}>{t('aiProcessingPauseHelp')}</p>
                        {aiPauseError && (
                            <p className="mt-1 text-xs text-red-600">{t('aiProcessingPauseError')}</p>
                        )}
                    </div>
                </div>
            </div>
        )

        if (isMobileVariant) {
            return (
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-3">
                    <h4 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-900">
                        {t('keyInfo')}
                    </h4>
                    {rows}
                </div>
            )
        }

        return (
            <>
                <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4">{t('keyInfo')}</h4>
                {rows}
                <hr className="border-gray-100/60 my-6" />
            </>
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
                        <button
                            type="button"
                            onClick={() => setIsMobileBotModeSheetOpen(true)}
                            aria-label={`${tSidebar('botStatusLabel')}: ${botModeLabel}`}
                            className={cn(
                                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors lg:hidden',
                                currentBotModeToneClasses.surface
                            )}
                        >
                            <span className={cn(
                                'h-2.5 w-2.5 rounded-full',
                                currentBotModeToneClasses.dot,
                                resolvedBotMode === 'active' && 'animate-pulse'
                            )} />
                            <span>{botModeLabel}</span>
                            <ChevronDown
                                className={cn(
                                    'h-3.5 w-3.5 opacity-70 transition-transform duration-200 ease-out',
                                    isMobileBotModeSheetOpen && 'rotate-180'
                                )}
                            />
                        </button>
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
            </div >

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
                                    <img
                                        alt=""
                                        aria-hidden
                                        title={`${t('platform')}: ${selectedConversation.platform}`}
                                        className="h-5 w-5 shrink-0 lg:hidden"
                                        src={getChannelPlatformIconSrc(selectedConversation.platform)}
                                    />
                                ) : (
                                    <span
                                        title={`${t('platform')}: ${selectedConversation.platform}`}
                                        className="shrink-0 text-[10px] font-semibold uppercase text-gray-400 lg:hidden"
                                    >
                                        {t('platformSimulatorShort')}
                                    </span>
                                )}
                                <h2 className="min-w-0 truncate font-bold text-gray-900 text-lg">{selectedConversation.contact_name}</h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <span
                                    className={cn(
                                        'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold md:hidden',
                                        activeAgent === 'ai'
                                            ? 'border-purple-100 bg-purple-50 text-purple-700'
                                            : 'border-blue-100 bg-blue-50 text-blue-700'
                                    )}
                                    aria-label={`${t('activeAgent')}: ${activeAgent === 'ai' ? t('copilot') : t('operator')}`}
                                >
                                    {activeAgent === 'ai' ? <Bot size={12} /> : <Zap size={12} />}
                                    <span className="max-w-[70px] truncate">
                                        {activeAgent === 'ai' ? (botName ?? t('botName')) : t('operator')}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setIsMobileDetailsOpen(prev => !prev)}
                                    className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 lg:hidden"
                                >
                                    {isMobileDetailsOpen ? t('hideDetails') : t('details')}
                                </button>
                                {conversationAiPaused && (
                                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                                        {t('aiProcessingPausedBadge')}
                                    </span>
                                )}
                                <span className={`hidden md:flex text-xs px-3 py-1.5 rounded-full border items-center gap-1.5 transition-colors ${activeAgent === 'ai'
                                    ? 'bg-purple-50 text-purple-700 border-purple-100'
                                    : 'bg-blue-50 text-blue-700 border-blue-100'
                                    }`}>
                                    {activeAgent === 'ai' ? <Bot size={14} /> : <Zap size={14} />}
                                    <span className="font-medium">
                                        {activeAgent === 'ai' ? t('copilot') : t('operator')}
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
                            <div className="max-h-[54vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white px-3 py-3 shadow-lg">
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
                                            <Avatar name={selectedConversation.contact_name} size="sm" />
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">{selectedConversation.contact_name}</p>
                                                <p className="text-xs text-gray-500">{selectedConversation.contact_phone || t('noPhoneNumber')}</p>
                                            </div>
                                        </div>
                                        <div className="my-3 h-px bg-gray-100" />

                                        {renderConversationKeyInfoSection('mobile')}

                                        {!conversationAiPaused && (
                                            <div className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-3">
                                                <div className="mb-3 flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-900">
                                                            {t('leadTitle')}
                                                        </h4>
                                                        <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                                                            {t('leadAiExtraction')}
                                                        </span>
                                                    </div>
                                                    {isLeadUpdating && (
                                                        <span className="text-xs font-semibold text-emerald-600">{t('leadUpdating')}</span>
                                                    )}
                                                </div>

                                                {leadExtractionPaused && (
                                                    <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                                                        <div className="space-y-1">
                                                            <p className="text-xs font-semibold text-amber-900">{t('leadPausedTitle')}</p>
                                                            <p className="text-xs text-amber-800">{pauseReasonText}</p>
                                                            {leadRefreshStatus === 'error' && (
                                                                <p className="text-xs text-red-600">{leadRefreshMessage}</p>
                                                            )}
                                                            {leadRefreshStatus === 'success' && (
                                                                <p className="text-xs text-green-700">{t('leadRefreshSuccess')}</p>
                                                            )}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={handleRefreshLead}
                                                            disabled={leadRefreshStatus === 'loading' || conversationAiPaused}
                                                            className={cn(
                                                                'shrink-0 rounded-md border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100',
                                                                (leadRefreshStatus === 'loading' || conversationAiPaused) && 'cursor-not-allowed opacity-60'
                                                            )}
                                                        >
                                                            {leadRefreshStatus === 'loading' ? t('leadRefreshLoading') : t('leadRefresh')}
                                                        </button>
                                                    </div>
                                                )}

                                                {lead ? (
                                                    <div className="space-y-3">
                                                        <div className="grid grid-cols-[92px_1fr] items-start gap-3">
                                                            <span className="pt-0.5 text-xs text-gray-500">{t('leadStatus')}</span>
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
                                                            <span className="pt-0.5 text-xs text-gray-500">{t('leadScore')}</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm text-gray-900">{lead.total_score}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={handleOpenScoreReason}
                                                                    disabled={scoreReasonStatus === 'loading'}
                                                                    className={cn(
                                                                        'text-xs font-medium text-blue-600 hover:text-blue-700',
                                                                        scoreReasonStatus === 'loading' && 'cursor-not-allowed opacity-60'
                                                                    )}
                                                                >
                                                                    {t('scoreReason')}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-[92px_1fr] items-start gap-3">
                                                            <span className="pt-0.5 text-xs text-gray-500">{t('leadService')}</span>
                                                            <span className="text-sm text-gray-900">{lead.service_type || t('leadUnknown')}</span>
                                                        </div>

                                                        {lead.summary && (
                                                            <div className="grid grid-cols-[92px_1fr] items-start gap-3">
                                                                <span className="pt-0.5 text-xs text-gray-500">{t('leadSummary')}</span>
                                                                <span className="whitespace-pre-wrap text-sm text-gray-900">{lead.summary}</span>
                                                            </div>
                                                        )}

                                                        {requiredIntakeFields.length > 0 && (
                                                            <div className="rounded-lg border border-gray-200 bg-gray-50/40 px-3 py-3">
                                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                                                    {t('leadRequiredInfo')}
                                                                </p>
                                                                {collectedRequiredIntake.length > 0 ? (
                                                                    <div className="mt-2 space-y-2">
                                                                        {collectedRequiredIntake.map((item) => (
                                                                            <div key={item.field} className="grid grid-cols-[110px_1fr] items-start gap-2">
                                                                                <span className="text-xs text-gray-500">{item.field}</span>
                                                                                <span className="break-words text-sm text-gray-900">{item.value}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <p className="mt-2 text-sm text-gray-500">{t('leadRequiredInfoEmpty')}</p>
                                                                )}
                                                            </div>
                                                        )}

                                                        {lead.updated_at && (
                                                            <div className="grid grid-cols-[92px_1fr] items-start gap-3">
                                                                <span className="pt-0.5 text-xs text-gray-500">{t('leadUpdated')}</span>
                                                                <span className="text-sm text-gray-900">
                                                                    {format(new Date(lead.updated_at), 'PP p', { locale: dateLocale })}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-gray-500">{t('leadEmpty')}</p>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        {!showConversationSkeleton && activeAgent === 'operator' && (
                            <div className="border-b border-gray-200 bg-white px-4 py-3 lg:hidden">
                                <button
                                    onClick={handleLeaveConversation}
                                    disabled={isLeaving || isReadOnly}
                                    className="w-full rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
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
                                visibleMessages.map(m => {
                                    const isMe = m.sender_type === 'user'
                                    const isBot = m.sender_type === 'bot'
                                    const isSystem = m.sender_type === 'system'
                                    const parsedBotContent = isBot
                                        ? splitBotMessageDisclaimer(m.content)
                                        : { body: m.content, disclaimer: null as string | null }
                                    const visibleMessageContent = parsedBotContent.body
                                    const matchedSkillTitle = isBot
                                        ? extractSkillTitleFromMetadata(m.metadata)
                                        : null
                                    const messageDateSeparator = messageDateSeparatorById.get(m.id)
                                    const dateSeparator = messageDateSeparator ? (
                                        <div className="flex justify-center">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200">
                                                {messageDateSeparator}
                                            </span>
                                        </div>
                                    ) : null

                                    if (isSystem) {
                                        return (
                                            <div key={m.id} className={messageDateSeparator ? 'space-y-3' : undefined}>
                                                {dateSeparator}
                                                <div className="flex items-center justify-center w-full py-2">
                                                    <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                                                        {m.content}
                                                    </span>
                                                </div>
                                            </div>
                                        )
                                    }

                                    if (!isMe && !isBot) {
                                        return (
                                            <div key={m.id} className={messageDateSeparator ? 'space-y-3' : undefined}>
                                                {dateSeparator}
                                                <div className="flex items-end gap-3">
                                                    <Avatar name={selectedConversation.contact_name} size="md" />
                                                    <div className="flex flex-col gap-1 max-w-[80%]">
                                                        <div className="bg-gray-100 text-gray-900 rounded-2xl rounded-bl-none px-4 py-3 text-sm leading-relaxed">
                                                            {visibleMessageContent}
                                                        </div>
                                                        <span className="text-xs text-gray-400 ml-1">{format(new Date(m.created_at), 'HH:mm', { locale: dateLocale })}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    }

                                    return (
                                        <div key={m.id} className={messageDateSeparator ? 'space-y-3' : undefined}>
                                            {dateSeparator}
                                            <div className="flex items-end gap-3 justify-end">
                                                <div className="flex flex-col gap-1 items-end max-w-[80%]">
                                                    <div className={`rounded-2xl rounded-br-none px-4 py-3 text-sm leading-relaxed text-right ${isBot ? 'bg-purple-700 text-white' : 'bg-gray-900 text-white'}`}>
                                                        {visibleMessageContent}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mr-1">
                                                        <span className="text-xs text-gray-400">
                                                            {isBot ? (botName ?? t('botName')) : t('you')} · {format(new Date(m.created_at), 'HH:mm', { locale: dateLocale })}
                                                        </span>
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
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="relative border-t border-gray-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:p-6">
                            <div
                                className="pointer-events-none absolute right-4 top-0 z-20 -translate-y-1/2 lg:right-6"
                                aria-hidden={!showScrollToLatest}
                            >
                                <div
                                    className={`transition-all duration-300 ease-out ${
                                        showScrollToLatest
                                            ? 'translate-y-0 opacity-100'
                                            : 'translate-y-2 opacity-0'
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
                                            <div className={`inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 transition-all duration-300 ${summaryHeaderDisabled ? 'opacity-60' : ''}`}>
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
                                    {isWhatsAppConversation && whatsappReplyWindowState && !whatsappReplyWindowState.canReply && (
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
                                    <div className={`w-full transition-all duration-300 ease-out ${summaryStatus === 'success' ? 'max-w-full' : 'max-w-[520px]'}`}>
                                        <div className={`rounded-2xl border px-4 py-3 shadow-sm transition-all duration-300 ${summaryStatus === 'loading'
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
                                                <p className="text-sm text-red-600">
                                                    {t('summary.error')}
                                                </p>
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
                                        <p className="text-base font-semibold leading-5 whitespace-nowrap">{t(assistantBanner.titleKey)}</p>
                                        <p className={`text-xs leading-4 ${
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
                                    <p className="text-sm font-semibold text-blue-900">{t('whatsappReplyWindow.expiredActionsTitle')}</p>
                                    <p className="mt-1 text-sm text-blue-800">{t('whatsappReplyWindow.expiredActionsDescription')}</p>
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

                            <div className="flex items-center gap-2 lg:gap-3">
                                <div className="relative flex-1">
                                    {isWhatsAppMissingInbound && (
                                        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border border-amber-200 bg-white/90 px-3 text-center text-xs font-medium text-amber-900">
                                            {whatsappComposerOverlayMessage}
                                        </div>
                                    )}
                                    <div className={`flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50/60 px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all ${isWhatsAppMissingInbound ? 'opacity-60' : ''}`}>
                                        <IconButton
                                            icon={Paperclip}
                                            size="sm"
                                            disabled={isComposerDisabled}
                                            className="disabled:cursor-not-allowed disabled:opacity-50"
                                        />
                                        <IconButton
                                            icon={Image}
                                            size="sm"
                                            disabled={isComposerDisabled}
                                            className="disabled:cursor-not-allowed disabled:opacity-50"
                                        />
                                        <div className="h-6 w-px bg-gray-200 mx-1" />
                                        <textarea
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            disabled={isComposerDisabled}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault()
                                                    handleSendMessage()
                                                }
                                            }}
                                            rows={1}
                                            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none resize-none leading-6 h-6 min-h-[24px]"
                                            placeholder={inputPlaceholder}
                                        />
                                        <div className="h-6 w-px bg-gray-200" />
                                        <button
                                            type="button"
                                            onClick={() => setIsTemplatePickerModalOpen(true)}
                                            disabled={isTemplatePickerDisabled}
                                            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            <HiOutlineDocumentText size={15} />
                                            <span>{t('templatePickerAction')}</span>
                                        </button>
                                    </div>
                                </div>
                                <button
                                    onClick={handleSendMessage}
                                    disabled={!canSend}
                                    title={isWhatsAppReplyBlocked ? whatsappReplyBlockedTooltip : undefined}
                                    className={`h-11 flex items-center gap-2 px-4 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${canSend
                                        ? 'bg-blue-500 text-white hover:bg-blue-600'
                                        : 'bg-gray-200 text-gray-500 hover:bg-gray-300 hover:text-gray-700'
                                        }`}
                                >
                                    <Send size={18} />
                                    <span className="hidden sm:inline">{t('sendButton')}</span>
                                </button>
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
                        <div className="flex-1 overflow-y-auto p-6 flex flex-col">
                            {showConversationSkeleton ? (
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
                            ) : (
                                <>
                                    <div className="flex flex-col items-center text-center">
                                        <Avatar name={selectedConversation.contact_name} size="lg" className="mb-3 text-base" />
                                        <h3 className="text-lg font-bold text-gray-900">{selectedConversation.contact_name}</h3>
                                        <p className="text-sm text-gray-500 mt-1">{selectedConversation.contact_phone || t('noPhoneNumber')}</p>
                                    </div>

                                    <hr className="border-gray-100 my-6" />

                                    <div className="flex-1">
                                {renderConversationKeyInfoSection('desktop')}

                                {!conversationAiPaused && (
                                    <div className="mt-6">
                                    <div className="mb-4 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">{t('leadTitle')}</h4>
                                            <span className="text-[10px] uppercase tracking-wide text-gray-500 border border-gray-200 bg-gray-50 px-2 py-0.5 rounded-full">
                                                {t('leadAiExtraction')}
                                            </span>
                                        </div>
                                        {isLeadUpdating && (
                                            <span className="text-xs font-semibold text-emerald-600">{t('leadUpdating')}</span>
                                        )}
                                    </div>
                                    {leadExtractionPaused && (
                                        <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 flex items-start justify-between gap-3">
                                            <div className="space-y-1">
                                                <p className="text-xs font-semibold text-amber-900">{t('leadPausedTitle')}</p>
                                                <p className="text-xs text-amber-800">{pauseReasonText}</p>
                                                {leadRefreshStatus === 'error' && (
                                                    <p className="text-xs text-red-600">{leadRefreshMessage}</p>
                                                )}
                                                {leadRefreshStatus === 'success' && (
                                                    <p className="text-xs text-green-700">{t('leadRefreshSuccess')}</p>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleRefreshLead}
                                                disabled={leadRefreshStatus === 'loading' || conversationAiPaused}
                                                className={`shrink-0 rounded-md border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 transition-colors ${(leadRefreshStatus === 'loading' || conversationAiPaused) ? 'opacity-60 cursor-not-allowed' : ''}`}
                                            >
                                                {leadRefreshStatus === 'loading' ? t('leadRefreshLoading') : t('leadRefresh')}
                                            </button>
                                        </div>
                                    )}
                                    {lead ? (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                                <span className="text-sm text-gray-500">{t('leadStatus')}</span>
                                                <div className="flex items-center gap-2 text-sm text-gray-900">
                                                    <span
                                                        className={`h-2 w-2 rounded-full ${lead.status === 'hot'
                                                            ? 'bg-red-500'
                                                            : lead.status === 'warm'
                                                                ? 'bg-amber-500'
                                                                : 'bg-gray-400'
                                                            }`}
                                                    />
                                                    <span>{leadStatusLabels[lead.status] ?? lead.status}</span>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                                <span className="text-sm text-gray-500">{t('leadScore')}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-gray-900">{lead.total_score}</span>
                                                    <button
                                                        type="button"
                                                        onClick={handleOpenScoreReason}
                                                        disabled={scoreReasonStatus === 'loading'}
                                                        className={`text-xs font-medium text-blue-600 hover:text-blue-700 ${scoreReasonStatus === 'loading' ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                    >
                                                        {t('scoreReason')}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                                <span className="text-sm text-gray-500">{t('leadService')}</span>
                                                <span className="text-sm text-gray-900">{lead.service_type || t('leadUnknown')}</span>
                                            </div>
                                            {lead.summary && (
                                                <div className="grid grid-cols-[100px_1fr] gap-4 items-start">
                                                    <span className="text-sm text-gray-500">{t('leadSummary')}</span>
                                                    <span className="text-sm text-gray-900 whitespace-pre-wrap">{lead.summary}</span>
                                                </div>
                                            )}
                                            {requiredIntakeFields.length > 0 && (
                                                <div className="rounded-lg border border-gray-200 bg-white px-3 py-3">
                                                    <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">
                                                        {t('leadRequiredInfo')}
                                                    </p>
                                                    {collectedRequiredIntake.length > 0 ? (
                                                        <div className="mt-2 space-y-2">
                                                            {collectedRequiredIntake.map((item) => (
                                                                <div key={item.field} className="grid grid-cols-[130px_1fr] gap-3 items-start">
                                                                    <span className="text-sm text-gray-500">{item.field}:</span>
                                                                    <span className="text-sm text-gray-900 break-words">{item.value}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="mt-2 text-sm text-gray-500">{t('leadRequiredInfoEmpty')}</p>
                                                    )}
                                                </div>
                                            )}
                                            {lead.updated_at && (
                                                <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                                    <span className="text-sm text-gray-500">{t('leadUpdated')}</span>
                                                    <span className="text-sm text-gray-900">{format(new Date(lead.updated_at), 'PP p', { locale: dateLocale })}</span>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-500">{t('leadEmpty')}</p>
                                    )}
                                    </div>
                                )}
                            </div>

                            <hr className="border-gray-100 my-6" />

                            <div className="mt-auto">
                                {!showConversationSkeleton && activeAgent === 'operator' && (
                                    <button
                                        onClick={handleLeaveConversation}
                                        disabled={isLeaving || isReadOnly}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <LogOut size={18} />
                                        {isLeaving ? t('leaving') : t('leaveConversation')}
                                    </button>
                                )}
                            </div>
                                </>
                            )}
                        </div>
                    </div >
                </>
            ) : (
                <div className="hidden flex-1 items-center justify-center lg:flex">
                    <EmptyState
                        icon={Inbox}
                        title={t('noSelection')}
                        description={t('noSelectionDesc')}
                    />
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
                            isMobileBotModeSheetVisible
                                ? 'translate-y-0 opacity-100'
                                : '-translate-y-3 opacity-0'
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
                                            <span className={cn('h-1.5 w-1.5 rounded-full', currentBotModeToneClasses.dot)} />
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
                                    <p className="text-xs leading-5 text-slate-600">
                                        {botModeQuickSwitchHelperText}
                                    </p>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                {botModeOptions.map((option) => {
                                    const isSelected = resolvedBotMode === option.value
                                    const optionToneClasses = botModeToneClassMap[resolveMainSidebarBotModeTone(option.value)]
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
                onCancel={() => setDeleteDialog(prev => ({ ...prev, isOpen: false }))}
                onConfirm={handleConfirmDelete}
                title={t('deleteConversation')}
                description={t('deleteConfirm')}
                confirmText={t('deleteConversation')}
                cancelText={t('cancel')}
                isDestructive
                isLoading={deleteDialog.isLoading}
            />

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
        </>
    )
}
