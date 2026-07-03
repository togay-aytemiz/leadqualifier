'use client'

import { CSSProperties, FormEvent, useMemo, useRef, useState } from 'react'
import { RefreshCcw, Send, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { MessageRichText } from '@/components/inbox/messageRichText'

type WebWidgetMessage = {
    id: string
    role: 'user' | 'assistant'
    content: string
    imageUrl?: string | null
}

type WebWidgetChatClientProps = {
    organizationId: string
    title: string
    subtitle: string
    logoUrl?: string | null
    themeColor: string
    showLogo: boolean
    showHeaderSubtitle: boolean
    showFooter: boolean
    footerText: string
}

const POLITE_LIVE_REGION = 'polite'

function createMessageId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function WebWidgetChatClient({
    organizationId,
    title,
    subtitle,
    logoUrl,
    themeColor,
    showLogo,
    showHeaderSubtitle,
    showFooter,
    footerText,
}: WebWidgetChatClientProps) {
    const t = useTranslations('webWidget')
    const [messages, setMessages] = useState<WebWidgetMessage[]>([])
    const [input, setInput] = useState('')
    const [isSending, setIsSending] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement | null>(null)

    const conversationHistory = useMemo(() => messages.slice(-8).map((message) => ({
        role: message.role,
        content: message.content,
    })), [messages])
    const accentStyle = {
        '--web-widget-accent': themeColor,
    } as CSSProperties

    const handleCloseEmbedWidget = () => {
        if (window.parent === window) return

        window.parent.postMessage({ type: 'qualy-web-widget-close' }, window.location.origin)
    }

    const handleResetConversation = () => {
        if (isSending) return

        setMessages([])
        setInput('')
        setErrorMessage(null)
    }

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const message = input.trim()
        if (!message || isSending) return

        const userMessage: WebWidgetMessage = {
            id: createMessageId(),
            role: 'user',
            content: message,
        }
        const historyForRequest = conversationHistory

        setMessages((current) => [...current, userMessage])
        setInput('')
        setErrorMessage(null)
        setIsSending(true)

        try {
            const response = await fetch(`/api/web-widget/${organizationId}/chat`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    message,
                    conversationHistory: historyForRequest,
                }),
            })

            if (!response.ok) {
                throw new Error(`Web widget chat failed: ${response.status}`)
            }

            const payload = await response.json() as {
                response?: unknown
                skillImage?: {
                    imageUrl?: unknown
                }
            }
            const assistantMessage: WebWidgetMessage = {
                id: createMessageId(),
                role: 'assistant',
                content: typeof payload.response === 'string' && payload.response.trim()
                    ? payload.response.trim()
                    : t('emptyReply'),
                imageUrl: typeof payload.skillImage?.imageUrl === 'string' ? payload.skillImage.imageUrl : null,
            }

            setMessages((current) => [...current, assistantMessage])
        } catch {
            setErrorMessage(t('sendFailed'))
        } finally {
            setIsSending(false)
            window.setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
            }, 0)
        }
    }

    return (
        <main className="flex h-dvh flex-col overflow-hidden bg-white text-slate-950" style={accentStyle}>
            <header className="shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur">
                <div className="flex w-full items-center gap-3 px-4 py-3">
                    {showLogo ? (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white text-base font-semibold text-[var(--web-widget-accent)] shadow-sm">
                            {logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                                <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" />
                            ) : (
                                title.slice(0, 1).toUpperCase()
                            )}
                        </span>
                    ) : null}
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-base font-semibold text-slate-950">{title}</h1>
                        {showHeaderSubtitle ? (
                            <p className="truncate text-xs text-slate-500">{subtitle}</p>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        onClick={handleResetConversation}
                        disabled={isSending}
                        aria-label={t('resetConversation')}
                        title={t('resetConversation')}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                        <RefreshCcw size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={handleCloseEmbedWidget}
                        aria-label={t('closeWidget')}
                        title={t('closeWidget')}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white"
                    >
                        <X size={17} />
                    </button>
                </div>
            </header>

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-slate-50 to-white p-4 shadow-sm">
                    {messages.length === 0 ? (
                        <div className="flex justify-center pt-10">
                            <span className="max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs text-slate-600 shadow-sm">
                                {t('emptyChatNotice')}
                            </span>
                        </div>
                    ) : null}

                    {messages.map((message) => {
                        const isUser = message.role === 'user'

                        return (
                            <div key={message.id} className={isUser ? 'flex justify-end' : 'flex justify-start'}>
                                <div className={isUser
                                    ? 'max-w-[84%] rounded-2xl rounded-br-md bg-[var(--web-widget-accent)] px-4 py-2 text-sm leading-6 text-white shadow-sm'
                                    : 'w-full max-w-[92%] px-1 py-4 text-sm leading-7 text-slate-900'}
                                >
                                    <div className="whitespace-pre-wrap">
                                        <MessageRichText content={message.content} />
                                    </div>
                                    {message.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={message.imageUrl}
                                            alt={t('imageAlt')}
                                            className="mt-2 max-h-72 rounded-lg bg-white object-contain"
                                        />
                                    ) : null}
                                </div>
                            </div>
                        )
                    })}
                    {isSending ? (
                        <div className="flex justify-start">
                            <div className="inline-flex items-center px-1 py-3 text-sm text-slate-500" aria-live={POLITE_LIVE_REGION}>
                                <span className="mr-2 h-2.5 w-2.5 rounded-full bg-[var(--web-widget-accent)]" />
                                {t('thinking')}
                            </div>
                        </div>
                    ) : null}
                    <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSubmit} className="shrink-0 border-t border-slate-200 bg-white p-3 shadow-sm">
                    {errorMessage ? (
                        <p className="mb-2 text-xs font-medium text-red-600">{errorMessage}</p>
                    ) : null}
                    <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 transition-colors focus-within:border-[var(--web-widget-accent)] focus-within:bg-white">
                        <textarea
                            rows={1}
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            placeholder={t('placeholder')}
                            disabled={isSending}
                            className="max-h-[156px] min-h-10 flex-1 resize-none bg-transparent py-2 text-[16px] leading-6 text-slate-950 outline-none placeholder:text-slate-400"
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault()
                                    event.currentTarget.form?.requestSubmit()
                                }
                            }}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isSending}
                            aria-label={t('send')}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-full bg-[var(--web-widget-accent)] text-white transition-all duration-200 hover:-translate-y-0.5 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                    {showFooter && footerText.trim() ? (
                        <p className="mt-2 text-[11px] leading-4 text-slate-500">
                            {footerText}
                        </p>
                    ) : null}
                </form>
            </section>
        </main>
    )
}
