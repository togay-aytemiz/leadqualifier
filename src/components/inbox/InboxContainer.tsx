'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Avatar, EmptyState, IconButton, ConfirmDialog, Modal } from '@/design'
import {
    Inbox, ChevronDown,
    Paperclip, Image, Zap, Bot, Trash2, MoreHorizontal, LogOut, Send, RotateCw
} from 'lucide-react'
import { FaTelegram } from 'react-icons/fa'
import { IoLogoWhatsapp } from 'react-icons/io5'
import { Conversation, Lead, Message, Profile } from '@/types/database'
import { getMessages, sendMessage, getConversations, deleteConversation, sendSystemMessage, setConversationAgent, markConversationRead, getConversationSummary, getConversationLead, getLeadScoreReasoning, refreshConversationLead } from '@/lib/inbox/actions'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow, format } from 'date-fns'
import { tr } from 'date-fns/locale'

import { useTranslations, useLocale } from 'next-intl'
import type { AiBotMode } from '@/types/database'

interface InboxContainerProps {
    initialConversations: Conversation[]
    organizationId: string
    botName?: string
    botMode?: AiBotMode
}

type ProfileLite = Pick<Profile, 'id' | 'full_name' | 'email'>
type Assignee = Pick<Profile, 'full_name' | 'email'>

export function InboxContainer({ initialConversations, organizationId, botName, botMode }: InboxContainerProps) {
    const t = useTranslations('inbox')
    const locale = useLocale()
    const dateLocale = locale === 'tr' ? tr : undefined
    const [conversations, setConversations] = useState<any[]>(initialConversations)
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

    const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
    if (!supabaseRef.current) {
        supabaseRef.current = createClient()
    }
    const supabase = supabaseRef.current

    const messagesEndRef = useRef<HTMLDivElement>(null)
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
        if (leadRefreshTimeoutRef.current) {
            clearTimeout(leadRefreshTimeoutRef.current)
            leadRefreshTimeoutRef.current = null
        }
        if (leadAutoRefreshTimeoutRef.current) {
            clearTimeout(leadAutoRefreshTimeoutRef.current)
            leadAutoRefreshTimeoutRef.current = null
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
        }, 100)
    }

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

    // Also force scroll on mount/updates just in case
    // useEffect(() => { scrollToBottom() }, [])
    // No, better to be specific.

    // Check if we need to scroll when isLeaving changes (optimistic update changes messages, so handled above)

    // ... re-insert realtime subscriptions ...

    useEffect(() => {
        let channel: ReturnType<typeof supabase.channel> | null = null
        let isMounted = true

        const setupRealtime = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!isMounted) return

            if (session?.access_token) {
                supabase.realtime.setAuth(session.access_token)
            } else {
                console.warn('Realtime: missing session, subscribing as anon')
            }

            console.log('Setting up Realtime subscription...')

            channel = supabase.channel('inbox_global')
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
                            return {
                                ...c,
                                last_message_at: newMsg.created_at,
                                // Only increment unread if it's NOT the currently open chat
                                unread_count: newMsg.conversation_id !== selectedIdRef.current
                                    ? (shouldIncrementUnread ? c.unread_count + 1 : c.unread_count)
                                    : 0,
                                // If we have messages snippet in list, update it too
                                messages: [{ content: newMsg.content, created_at: newMsg.created_at, sender_type: newMsg.sender_type } as any]
                            }
                        }
                        return c
                    }).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()))
                })
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
                                        assignee: nextAssignee
                                    }
                                }
                                return c
                            }).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
                        } else {
                            // INSERT logic (New conversation)
                            // Note: We won't have the 'assignee' object populated (it's null or just ID) until a fetch,
                            // but for a new open conversation that's fine.
                            const nextAssignee = newOrUpdatedConv.assignee_id
                                ? assigneeCacheRef.current[newOrUpdatedConv.assignee_id] ?? null
                                : null

                            return [{ ...newOrUpdatedConv, assignee: nextAssignee }, ...prev]
                                .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
                        }
                    })

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
                .subscribe((status) => {
                    console.log('Realtime Subscription Status:', status)
                })
        }

        setupRealtime()

        return () => {
            isMounted = false
            if (channel) {
                console.log('Cleaning up Realtime subscription...')
                supabase.removeChannel(channel)
            }
        }
    }, [organizationId, refreshMessages, resolveAssignee, scheduleLeadAutoRefresh, supabase])

    const handleFetchSummary = async () => {
        if (!selectedId || summaryStatus === 'loading') return
        setSummaryStatus('loading')
        setSummaryText('')
        try {
            const result = await getConversationSummary(selectedId, organizationId)
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
        const nextOpen = !isSummaryOpen
        setIsSummaryOpen(nextOpen)
        if (nextOpen && summaryStatus === 'idle' && !summaryText) {
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

        setConversations(prev => prev.map(c =>
            c.id === selectedId ? {
                ...c,
                active_agent: 'operator',
                assignee_id: currentUserProfile?.id ?? c.assignee_id,
                assignee: optimisticAssignee ?? c.assignee,
                last_message_at: new Date().toISOString()
            } : c
        ))

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
        if (!selectedId) return
        setDeleteDialog({ isOpen: true, isLoading: false })
    }

    const handleConfirmDelete = async () => {
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

    const selectedConversation = conversations.find(c => c.id === selectedId)

    // Calculate active agent based on last outgoing message
    const lastOutgoingMessage = messages
        .slice()
        .reverse()
        .find(m => m.sender_type === 'user' || m.sender_type === 'bot' || m.sender_type === 'system')

    // Default to AI if no history, otherwise check who sent last
    // If system sent last (e.g. "Operator left"), it defaults to AI (operator only if 'user')
    // const activeAgent = lastOutgoingMessage?.sender_type === 'user' ? 'operator' : 'ai'

    // NEW: Use explicit state from conversation
    // Fallback to 'ai' (bot) if undefined (e.g. old data or optimistic new conv)
    const activeAgent = selectedConversation?.active_agent === 'operator' ? 'operator' : 'ai'
    const inputPlaceholder = activeAgent === 'ai' ? t('takeOverPlaceholder') : t('replyPlaceholder')
    const canSend = !!input.trim() && !isSending
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
    const resolvedBotMode = (botMode ?? 'active')
    const operatorActive = selectedConversation?.active_agent === 'operator' || Boolean(selectedConversation?.assignee_id)
    const leadExtractionPaused = Boolean(selectedConversation) && (operatorActive || resolvedBotMode === 'off')
    const pauseReasons: string[] = []
    if (operatorActive) pauseReasons.push(t('leadPausedReasonOperator'))
    if (resolvedBotMode === 'off') pauseReasons.push(t('leadPausedReasonAiOff'))
    const pauseReasonText = pauseReasons.join(t('leadPausedReasonSeparator'))
    const leadRefreshMessage = leadRefreshError === 'missing_api_key'
        ? t('leadRefreshMissing')
        : leadRefreshError === 'missing_conversation'
            ? t('leadRefreshMissingConversation')
            : t('leadRefreshError')
    const isLeadUpdating = leadRefreshStatus === 'loading' || leadAutoRefreshStatus === 'loading'

    return (
        <>
            {/* Conversation List */}
            <div className="w-[320px] border-r border-gray-200 flex flex-col h-full bg-gray-50/30">
                <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 shrink-0 bg-white">
                    <div className="flex items-center gap-1 cursor-pointer group">
                        <span className="text-lg font-bold text-gray-900">{t('title')}</span>
                        <ChevronDown className="text-gray-500 group-hover:text-gray-900" size={20} />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
                    {conversations.length === 0 ? (
                        <div className="flex flex-col items-center justify-start h-full p-6 pt-20 text-center">
                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                                <Inbox className="text-gray-400" size={24} />
                            </div>
                            <h3 className="text-sm font-medium text-gray-900">{t('noMessages')}</h3>
                            <p className="text-xs text-gray-500 mt-1">{t('noMessagesDesc')}</p>
                        </div>
                    ) : (
                        conversations.map(c => (
                            <div
                                key={c.id}
                                onClick={() => setSelectedId(c.id)}
                                className={`px-4 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors relative group bg-white ${selectedId === c.id ? "bg-blue-50/30" : ""}`}
                            >
                                <div className="flex justify-between items-start mb-1.5">
                                    <div className="flex items-center gap-2.5">
                                        <div className="relative">
                                            <Avatar name={c.contact_name} size="sm" />
                                            <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 h-6 w-6 rounded-full border-[0.5px] border-white/50 bg-white shadow-sm flex items-center justify-center">
                                                {c.platform === 'telegram' ? (
                                                    <FaTelegram className="text-[#229ED9]" size={18} />
                                                ) : c.platform === 'whatsapp' ? (
                                                    <IoLogoWhatsapp className="text-[#25D366]" size={18} />
                                                ) : (
                                                    <span className="text-[9px] font-semibold text-gray-400 uppercase">S</span>
                                                )}
                                            </span>
                                        </div>
                                        <span className={`text-sm font-semibold ${c.unread_count > 0 ? "text-gray-900" : "text-gray-700"}`}>{c.contact_name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-400">
                                            {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: false, locale: dateLocale }).replace('about ', '')}
                                        </span>
                                        {c.unread_count > 0 && (
                                            <span className="h-2 w-2 rounded-full bg-blue-500" />
                                        )}
                                    </div>
                                </div>
                                <div className="pl-[42px] pr-2">
                                    <p className="text-sm text-gray-500 truncate leading-relaxed">
                                        {c.messages?.[0]?.content || t('noMessagesYet')}
                                    </p>
                                </div>
                                {selectedId === c.id && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500"></div>}
                            </div>
                        ))
                    )}
                    {loadingMore && (
                        <div className="p-4 flex justify-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                        </div>
                    )}
                </div>
            </div >

            {/* Main Chat */}
            {selectedConversation ? (
                <>
                    <div className="flex-1 flex flex-col bg-white min-w-0">
                        <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 shrink-0 bg-white">
                            <div className="flex items-center gap-3">
                                <h2 className="font-bold text-gray-900 text-lg">{selectedConversation.contact_name}</h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-xs px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition-colors ${activeAgent === 'ai'
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

                        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-gray-50/30">
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
                                            <div className={`rounded-2xl rounded-br-none px-4 py-3 text-sm leading-relaxed text-right ${isBot ? 'bg-purple-50 text-purple-900' : 'bg-blue-100 text-blue-900'}`}>
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

                        <div className="p-6 border-t border-gray-200 bg-white">
                            <div className="mb-2">
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
                                            aria-controls="conversation-summary-panel"
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
                                    id="conversation-summary-panel"
                                    aria-hidden={!isSummaryOpen}
                                    className={`mt-3 overflow-hidden transition-all duration-300 ease-out ${isSummaryOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}
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

                            {activeAgent === 'ai' && (
                                <div className="mb-4 rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-full bg-yellow-100 border border-yellow-200 flex items-center justify-center text-yellow-700 shrink-0">
                                        <Bot size={18} />
                                    </div>
                                    <div className="text-sm text-yellow-900 leading-relaxed">
                                        <span className="font-semibold">{t('botActiveTitle')}</span>
                                        <span className="ml-1 text-yellow-800">{t('botActiveBody')}</span>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 flex-1 rounded-2xl border border-gray-200 bg-gray-50/60 px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
                                    <IconButton icon={Paperclip} size="sm" />
                                    <IconButton icon={Image} size="sm" />
                                    <div className="h-6 w-px bg-gray-200 mx-1" />
                                    <textarea
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
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
                                    {t('sendButton')}
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
                                    onClick={() => setIsDetailsMenuOpen(!isDetailsMenuOpen)}
                                    className="p-1 hover:bg-gray-100 rounded text-gray-500"
                                >
                                    <MoreHorizontal size={20} />
                                </button>

                                {isDetailsMenuOpen && (
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
                                                    <span className="text-[10px] font-semibold text-gray-400 uppercase">S</span>
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
                                        disabled={isLeaving}
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
                <div className="flex-1 flex items-center justify-center">
                    <EmptyState
                        icon={Inbox}
                        title={t('noSelection')}
                        description={t('noSelectionDesc')}
                    />
                </div>
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
        </>
    )
}
