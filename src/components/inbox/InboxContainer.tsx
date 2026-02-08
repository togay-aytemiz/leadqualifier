'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Avatar, EmptyState, IconButton, ConfirmDialog, Modal } from '@/design'
import {
    Inbox, ChevronDown,
    Paperclip, Image, Zap, Bot, Trash2, MoreHorizontal, LogOut, Send, RotateCw, ArrowLeft, ArrowDown
} from 'lucide-react'
import { FaTelegram, FaArrowTurnDown, FaArrowTurnUp } from 'react-icons/fa6'
import { IoLogoWhatsapp } from 'react-icons/io5'
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
    type ConversationListItem
} from '@/lib/inbox/actions'
import { createClient } from '@/lib/supabase/client'
import { setupRealtimeAuth } from '@/lib/supabase/realtime-auth'
import { formatDistanceToNow, format } from 'date-fns'
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
import { cn } from '@/lib/utils'
import { DEFAULT_SCROLL_TO_LATEST_THRESHOLD, getDistanceFromBottom, shouldShowScrollToLatestButton } from '@/components/inbox/scrollToLatest'

import { useTranslations, useLocale } from 'next-intl'
import type { AiBotMode } from '@/types/database'

interface InboxContainerProps {
    initialConversations: ConversationListItem[]
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
    organizationId,
    botName,
    botMode,
    allowLeadExtractionDuringOperator,
    requiredIntakeFields = [],
    isReadOnly = false
}: InboxContainerProps) {
    const t = useTranslations('inbox')
    const locale = useLocale()
    const dateLocale = locale === 'tr' ? tr : undefined
    const [conversations, setConversations] = useState<ConversationListItem[]>(initialConversations)
    const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id || null)
    const [messages, setMessages] = useState<Message[]>([])
    const [lead, setLead] = useState<Lead | null>(null)
    const [input, setInput] = useState('')
    const [isSending, setIsSending] = useState(false)
    const [summaryStatus, setSummaryStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [summaryText, setSummaryText] = useState('')
    const [isSummaryOpen, setIsSummaryOpen] = useState(false)
    const [scoreReasonStatus, setScoreReasonStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [scoreReasonText, setScoreReasonText] = useState('')
    const [scoreReasonError, setScoreReasonError] = useState<'missing_api_key' | 'missing_lead' | 'request_failed' | null>(null)
    const [isScoreReasonOpen, setIsScoreReasonOpen] = useState(false)
    const [leadRefreshStatus, setLeadRefreshStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [leadRefreshError, setLeadRefreshError] = useState<'missing_api_key' | 'missing_conversation' | 'request_failed' | null>(null)
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
        cold: t('leadStatusCold'),
        ignored: t('leadStatusIgnored')
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
        setIsMobileDetailsOpen(false)
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
            setLead(null)
            return
        }
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

                    setConversations(prev => prev.map(c => {
                        if (c.id !== leadRow.conversation_id) return c
                        if (payload.eventType === 'DELETE') {
                            return { ...c, leads: [] }
                        }
                        return { ...c, leads: [{ status: leadRow.status }] }
                    }))

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
        setLeadRefreshStatus('loading')
        setLeadRefreshError(null)
        try {
            const result = await refreshConversationLead(selectedId, organizationId)
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

    const handleSendMessage = async () => {
        if (isReadOnly) return
        if (!selectedId || !input.trim() || isSending) return
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
        setSelectedId(conversationId)
        setIsMobileConversationOpen(true)
    }

    const handleBackToConversationList = () => {
        setIsMobileConversationOpen(false)
        setIsMobileDetailsOpen(false)
    }

    const renderConversationListContent = () => (
        <>
            {conversations.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-start p-6 pt-20 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                        <Inbox className="text-gray-400" size={24} />
                    </div>
                    <h3 className="text-sm font-medium text-gray-900">{t('noMessages')}</h3>
                    <p className="mt-1 text-xs text-gray-500">{t('noMessagesDesc')}</p>
                </div>
            ) : (
                conversations.map(c => {
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
                                : leadStatus === 'ignored'
                                    ? 'border-blue-100 bg-blue-50 text-blue-700'
                                    : 'border-gray-200 bg-gray-100 text-gray-600'

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
                                            {c.platform === 'telegram' ? (
                                                <FaTelegram className="text-[#229ED9]" size={18} />
                                            ) : c.platform === 'whatsapp' ? (
                                                <IoLogoWhatsapp className="text-[#25D366]" size={18} />
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
                                        {leadStatusLabel && (
                                            <span className={`ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${leadChipClassName}`}>
                                                {leadStatusLabel}
                                            </span>
                                        )}
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
                                            {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: false, locale: dateLocale }).replace('about ', '')}
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

    const resolvedBotMode = (botMode ?? 'active')
    // NEW: Use explicit state from conversation
    // Fallback to 'ai' (bot) if undefined (e.g. old data or optimistic new conv)
    const activeAgent = selectedConversation?.active_agent === 'operator' ? 'operator' : 'ai'
    const assistantBanner = resolveAssistantBanner({
        activeAgent,
        botMode: resolvedBotMode
    })
    const inputPlaceholder = activeAgent === 'ai' ? t('takeOverPlaceholder') : t('replyPlaceholder')
    const canSend = !!input.trim() && !isSending && !isReadOnly
    const contactMessageCount = messages.filter(m => m.sender_type === 'contact').length
    const hasBotMessage = messages.some(m => m.sender_type === 'bot')
    const canSummarize = contactMessageCount >= 5 && hasBotMessage
    const summaryHeaderDisabled = !canSummarize
    const summaryRefreshDisabled = !canSummarize || summaryStatus === 'loading'
    const showSummaryRefresh = isSummaryOpen && (summaryStatus === 'success' || summaryStatus === 'error')
    const scoreReasonMessage = scoreReasonError === 'missing_api_key'
        ? t('scoreReasonMissing')
        : scoreReasonError === 'missing_lead'
            ? t('scoreReasonNoLead')
            : t('scoreReasonError')
    const operatorActive = isOperatorActive(selectedConversation)
    const allowDuringOperator = Boolean(allowLeadExtractionDuringOperator)
    const leadExtractionPaused = Boolean(selectedConversation) && (resolvedBotMode === 'off' || (operatorActive && !allowDuringOperator))
    const pauseReasons: string[] = []
    if (operatorActive && !allowDuringOperator) pauseReasons.push(t('leadPausedReasonOperator'))
    if (resolvedBotMode === 'off') pauseReasons.push(t('leadPausedReasonAiOff'))
    const pauseReasonText = pauseReasons.join(t('leadPausedReasonSeparator'))
    const leadRefreshMessage = leadRefreshError === 'missing_api_key'
        ? t('leadRefreshMissing')
        : leadRefreshError === 'missing_conversation'
            ? t('leadRefreshMissingConversation')
            : t('leadRefreshError')
    const isLeadUpdating = leadRefreshStatus === 'loading' || leadAutoRefreshStatus === 'loading'
    const mobileListPaneClasses = getMobileListPaneClasses(isMobileConversationOpen)
    const mobileConversationPaneClasses = getMobileConversationPaneClasses(isMobileConversationOpen)
    const mobileDetailsOverlayClasses = getMobileDetailsOverlayClasses(isMobileDetailsOpen)
    const mobileDetailsPanelClasses = getMobileDetailsPanelClasses(isMobileDetailsOpen)

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
                <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 shrink-0 bg-white">
                    <div className="flex items-center">
                        <span className="text-lg font-bold text-gray-900">{t('title')}</span>
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
                            <div className="flex items-center gap-2 lg:gap-3">
                                <button
                                    type="button"
                                    onClick={handleBackToConversationList}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 lg:hidden"
                                    aria-label={t('backToInbox')}
                                >
                                    <ArrowLeft size={18} />
                                </button>
                                <h2 className="font-bold text-gray-900 text-lg">{selectedConversation.contact_name}</h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsMobileDetailsOpen(prev => !prev)}
                                    className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 lg:hidden"
                                >
                                    {isMobileDetailsOpen ? t('hideDetails') : t('details')}
                                </button>
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
                                <div className="mb-3 flex items-center gap-3">
                                    <Avatar name={selectedConversation.contact_name} size="sm" />
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900">{selectedConversation.contact_name}</p>
                                        <p className="text-xs text-gray-500">{selectedConversation.contact_phone || t('noPhoneNumber')}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                                        <p className="text-[11px] uppercase tracking-wide text-gray-500">{t('leadService')}</p>
                                        <p className="mt-1 text-sm font-medium text-gray-900">{lead?.service_type || t('leadUnknown')}</p>
                                    </div>
                                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                                        <p className="text-[11px] uppercase tracking-wide text-gray-500">{t('leadScore')}</p>
                                        <p className="mt-1 text-sm font-medium text-gray-900">{lead?.total_score ?? '-'}</p>
                                    </div>
                                </div>
                                <div className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t('leadSummary')}</p>
                                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-900">{lead?.summary || t('leadEmpty')}</p>
                                </div>
                                <div className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t('leadRequiredInfo')}</p>
                                    {collectedRequiredIntake.length > 0 ? (
                                        <div className="mt-2 space-y-2">
                                            {collectedRequiredIntake.map((item) => (
                                                <div key={item.field} className="grid grid-cols-[110px_1fr] gap-2 items-start">
                                                    <span className="text-xs text-gray-500">{item.field}</span>
                                                    <span className="break-words text-sm text-gray-900">{item.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="mt-2 text-sm text-gray-500">{t('leadRequiredInfoEmpty')}</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {activeAgent === 'operator' && (
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
                            <div className="flex justify-center">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200">{t('today')}</span>
                            </div>
                            {messages.map(m => {
                                const isMe = m.sender_type === 'user'
                                const isBot = m.sender_type === 'bot'
                                const isSystem = m.sender_type === 'system'

                                if (isSystem) {
                                    return (
                                        <div key={m.id} className="flex items-center justify-center w-full py-2">
                                            <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                                                {m.content}
                                            </span>
                                        </div>
                                    )
                                }

                                if (!isMe && !isBot) {
                                    return (
                                        <div key={m.id} className="flex items-end gap-3">
                                            <Avatar name={selectedConversation.contact_name} size="md" />
                                            <div className="flex flex-col gap-1 max-w-[80%]">
                                                <div className="bg-gray-100 text-gray-900 rounded-2xl rounded-bl-none px-4 py-3 text-sm leading-relaxed">
                                                    {m.content}
                                                </div>
                                                <span className="text-xs text-gray-400 ml-1">{format(new Date(m.created_at), 'HH:mm', { locale: dateLocale })}</span>
                                            </div>
                                        </div>
                                    )
                                }

                                return (
                                    <div key={m.id} className="flex items-end gap-3 justify-end">
                                        <div className="flex flex-col gap-1 items-end max-w-[80%]">
                                            <div className={`rounded-2xl rounded-br-none px-4 py-3 text-sm leading-relaxed text-right ${isBot ? 'bg-purple-700 text-white' : 'bg-gray-900 text-white'}`}>
                                                {m.content}
                                            </div>
                                            <div className="flex items-center gap-1.5 mr-1">
                                                <span className="text-xs text-gray-400">
                                                    {isBot ? (botName ?? t('botName')) : t('you')} · {format(new Date(m.created_at), 'HH:mm', { locale: dateLocale })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
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
                                            <ChevronDown className={`transition-transform duration-300 ${isSummaryOpen ? 'rotate-180' : ''}`} size={16} />
                                            {t('summary.button')}
                                        </button>
                                        {showSummaryRefresh && (
                                            <button
                                                type="button"
                                                onClick={handleRefreshSummary}
                                                disabled={summaryRefreshDisabled}
                                                className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
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
                                    className={`mb-3 rounded-xl flex items-center ${
                                        assistantBanner.tone === 'inactive'
                                            ? 'gap-2 border border-slate-200 bg-slate-50 px-3 py-2'
                                            : 'gap-3 border border-yellow-200 bg-yellow-50 px-4 py-3'
                                    }`}
                                >
                                    <div
                                        className={`${assistantBanner.tone === 'inactive' ? 'h-8 w-8' : 'h-9 w-9'} rounded-full border flex items-center justify-center shrink-0 ${
                                            assistantBanner.tone === 'inactive'
                                                ? 'bg-slate-100 border-slate-200 text-slate-600'
                                                : 'bg-yellow-100 border-yellow-200 text-yellow-700'
                                        }`}
                                    >
                                        <Bot size={assistantBanner.tone === 'inactive' ? 16 : 18} />
                                    </div>
                                    <div
                                        className={`min-w-0 ${
                                            assistantBanner.tone === 'inactive' ? 'text-slate-800' : 'text-yellow-900'
                                        }`}
                                    >
                                        {assistantBanner.tone === 'inactive' ? (
                                            <>
                                                <p className="text-base font-semibold leading-5 whitespace-nowrap">{t(assistantBanner.titleKey)}</p>
                                                <p className="text-xs leading-4 text-slate-700">{t(assistantBanner.bodyKey)}</p>
                                            </>
                                        ) : (
                                            <>
                                                <span className="font-semibold">{t(assistantBanner.titleKey)}</span>
                                                <span className="ml-1 text-yellow-800">{t(assistantBanner.bodyKey)}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                            {isReadOnly && (
                                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                    {t('readOnlyMode')}
                                </div>
                            )}

                            <div className="flex items-center gap-2 lg:gap-3">
                                <div className="flex items-center gap-2 flex-1 rounded-2xl border border-gray-200 bg-gray-50/60 px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
                                    <IconButton icon={Paperclip} size="sm" />
                                    <IconButton icon={Image} size="sm" />
                                    <div className="h-6 w-px bg-gray-200 mx-1" />
                                    <textarea
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        disabled={isReadOnly}
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
                                </div>
                                <button
                                    onClick={handleSendMessage}
                                    disabled={!canSend}
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
                            <div className="flex flex-col items-center text-center">
                                <Avatar name={selectedConversation.contact_name} size="lg" className="mb-3 text-base" />
                                <h3 className="text-lg font-bold text-gray-900">{selectedConversation.contact_name}</h3>
                                <p className="text-sm text-gray-500 mt-1">{selectedConversation.contact_phone || t('noPhoneNumber')}</p>
                            </div>

                            <hr className="border-gray-100 my-6" />

                            <div className="flex-1">
                                <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4">{t('keyInfo')}</h4>
                                <div className="space-y-4">
                                    {/* Active Agent Status */}
                                    <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                        <span className="text-sm text-gray-500">{t('activeAgent')}</span>
                                        <div className="flex items-start flex-col gap-1">
                                            {activeAgent === 'ai' ? (
                                                <span className="text-xs text-purple-700 font-medium bg-purple-50 px-2 py-0.5 rounded flex items-center gap-1 w-fit">
                                                    <Bot size={12} />
                                                    {t('copilot')}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded flex items-center gap-1 w-fit">
                                                    <Zap size={12} />
                                                    {t('operator')}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Assigned Operator */}
                                    {activeAgent === 'operator' && (
                                        <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                            <span className="text-sm text-gray-500">{t('operator')}</span>
                                            <div className="text-sm text-gray-900">
                                                {selectedConversation.assignee ? (
                                                    <span>{selectedConversation.assignee.full_name}</span>
                                                ) : (
                                                    <span className="text-orange-500 text-xs font-medium">{t('unassigned')}</span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                        <span className="text-sm text-gray-500">{t('platform')}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="h-4 w-4 inline-flex items-center justify-center">
                                                {selectedConversation.platform === 'telegram' ? (
                                                    <FaTelegram className="text-[#229ED9]" size={16} />
                                                ) : selectedConversation.platform === 'whatsapp' ? (
                                                    <IoLogoWhatsapp className="text-[#25D366]" size={16} />
                                                ) : (
                                                    <span className="text-[10px] font-semibold text-gray-400 uppercase">{t('platformSimulatorShort')}</span>
                                                )}
                                            </span>
                                            <span className="text-sm text-gray-900 capitalize">{selectedConversation.platform}</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                                        <span className="text-sm text-gray-500">{t('received')}</span>
                                        <span className="text-sm text-gray-900">{format(new Date(selectedConversation.created_at), 'PP p', { locale: dateLocale })}</span>
                                    </div>
                                </div>

                                <hr className="border-gray-100/60 my-6" />

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
                                                disabled={leadRefreshStatus === 'loading'}
                                                className={`shrink-0 rounded-md border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 transition-colors ${leadRefreshStatus === 'loading' ? 'opacity-60 cursor-not-allowed' : ''}`}
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
                                                                : lead.status === 'ignored'
                                                                    ? 'bg-blue-500'
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
                            </div>

                            <hr className="border-gray-100 my-6" />

                            <div className="mt-auto">
                                {activeAgent === 'operator' && (
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
        </>
    )
}
