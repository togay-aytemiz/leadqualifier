'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Moon, Send, Sun } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { MessageRichText } from '@/components/inbox/messageRichText'

type DemoChatMessage = {
    id: string
    role: 'user' | 'assistant'
    content: string
    imageUrl?: string | null
}

type DemoTheme = 'light' | 'dark'

const POLITE_LIVE_REGION = 'polite'
const THEME_STORAGE_KEY = 'qualy-demo-chat-theme'

interface DemoChatClientProps {
    slug: string
    displayName: string
    logoUrl?: string | null
}

function createSessionId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function DemoChatClient({ slug, displayName, logoUrl }: DemoChatClientProps) {
    const t = useTranslations('demoChat')
    const [sessionId, setSessionId] = useState('')
    const [messages, setMessages] = useState<DemoChatMessage[]>(() => [])
    const [input, setInput] = useState('')
    const [isSending, setIsSending] = useState(false)
    const [thinkingIndex, setThinkingIndex] = useState(0)
    const [theme, setTheme] = useState<DemoTheme>('light')
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement | null>(null)

    const storageKey = useMemo(() => `qualy-demo-chat-session:${slug}`, [slug])
    const thinkingMessages = useMemo(() => {
        const rawMessages = t.raw('thinkingMessages')
        if (!Array.isArray(rawMessages)) return [t('thinking')]

        const messages = rawMessages.filter(
            (message): message is string => typeof message === 'string' && message.trim().length > 0
        )

        return messages.length > 0 ? messages : [t('thinking')]
    }, [t])
    const currentThinkingMessage = thinkingMessages[thinkingIndex % thinkingMessages.length] ?? t('thinking')
    const isDark = theme === 'dark'

    useEffect(() => {
        const existingSessionId = localStorage.getItem(storageKey)
        const nextSessionId = existingSessionId || createSessionId()
        localStorage.setItem(storageKey, nextSessionId)
        setSessionId(nextSessionId)
    }, [storageKey])

    useEffect(() => {
        const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
        if (storedTheme === 'light' || storedTheme === 'dark') {
            setTheme(storedTheme)
        }
    }, [])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, [messages, isSending])

    useEffect(() => {
        if (!isSending) {
            setThinkingIndex(0)
            return
        }

        const interval = window.setInterval(() => {
            setThinkingIndex((current) => (current + 1) % thinkingMessages.length)
        }, 1800)

        return () => window.clearInterval(interval)
    }, [isSending, thinkingMessages.length])

    const toggleTheme = () => {
        setTheme((currentTheme) => {
            const nextTheme = currentTheme === 'dark' ? 'light' : 'dark'
            localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
            return nextTheme
        })
    }

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const message = input.trim()
        if (!message || !sessionId || isSending) return

        const userMessage: DemoChatMessage = {
            id: createSessionId(),
            role: 'user',
            content: message,
        }

        setMessages((current) => [...current, userMessage])
        setInput('')
        setErrorMessage(null)
        setIsSending(true)

        try {
            const response = await fetch(`/api/demo/${slug}/chat`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId,
                    message,
                }),
            })

            if (!response.ok) {
                throw new Error(`Demo chat request failed: ${response.status}`)
            }

            const data = await response.json()
            const reply = typeof data.response === 'string' ? data.response.trim() : ''
            const imageUrl = data.skillImage && typeof data.skillImage.imageUrl === 'string'
                ? data.skillImage.imageUrl
                : null

            setMessages((current) => [
                ...current,
                {
                    id: createSessionId(),
                    role: 'assistant',
                    content: reply || t('emptyReply'),
                    imageUrl,
                },
            ])
        } catch {
            setErrorMessage(t('sendFailed'))
        } finally {
            setIsSending(false)
        }
    }

    return (
        <main
            className={`flex min-h-dvh flex-col transition-colors duration-300 ${
                isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-950'
            }`}
        >
            <header
                className={`border-b transition-colors duration-300 ${
                    isDark ? 'border-white/10 bg-slate-950/95' : 'border-slate-200 bg-white'
                }`}
            >
                <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-3 py-3 sm:px-4">
                    <span
                        className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border text-base font-semibold shadow-sm transition-colors duration-300 sm:h-14 sm:w-14 ${
                            isDark
                                ? 'border-white/15 bg-white text-slate-950'
                                : 'border-slate-200 bg-white text-slate-900'
                        }`}
                    >
                        {logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" />
                        ) : (
                            displayName.slice(0, 1).toUpperCase()
                        )}
                    </span>
                    <div className="min-w-0 flex-1">
                        <h1 className={`truncate text-base font-semibold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                            {displayName}
                        </h1>
                        <p className={`truncate text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {t('subtitle')}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={toggleTheme}
                        aria-label={isDark ? t('themeToggleLight') : t('themeToggleDark')}
                        title={isDark ? t('themeToggleLight') : t('themeToggleDark')}
                        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-all duration-200 hover:-translate-y-0.5 ${
                            isDark
                                ? 'border-white/15 bg-white/10 text-slate-100 hover:bg-white/15'
                                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                        }`}
                    >
                        {isDark ? <Sun size={17} /> : <Moon size={17} />}
                    </button>
                </div>
            </header>

            <section className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-3 py-3 sm:px-4 sm:py-4">
                <div
                    className={`min-h-0 flex-1 space-y-3 overflow-y-auto rounded-t-xl p-3 shadow-sm transition-colors duration-300 sm:p-4 ${
                        isDark ? 'bg-slate-900' : 'bg-white'
                    }`}
                >
                    <div
                        className={`demo-chat-message-enter rounded-xl border px-4 py-3 text-sm shadow-sm transition-colors duration-300 ${
                            isDark
                                ? 'border-white/10 bg-slate-800/80 text-slate-200'
                                : 'border-sky-200 bg-sky-50 text-slate-700'
                        }`}
                    >
                        <p className={`font-semibold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                            {t('demoNoticeTitle')}
                        </p>
                        <div className="mt-1 leading-6">
                            <MessageRichText content={t('demoNoticeBody', { name: displayName })} />
                        </div>
                    </div>

                    {messages.map((message) => {
                        const isUser = message.role === 'user'
                        const messageContainerClassName = isUser
                            ? 'demo-chat-message-enter flex justify-end'
                            : 'demo-chat-assistant-reveal flex justify-start'
                        const messageBodyClassName = isUser
                            ? `max-w-[92%] rounded-2xl px-4 py-2 text-sm leading-6 shadow-sm transition-colors duration-300 sm:max-w-[84%] ${
                                  isDark
                                      ? 'rounded-br-md bg-cyan-300 text-slate-950'
                                      : 'rounded-br-md bg-slate-900 text-white'
                              }`
                            : `w-full max-w-none px-1 py-4 text-sm leading-7 shadow-none transition-colors duration-300 sm:max-w-[92%] sm:px-0 sm:py-5 ${
                                  // assistant text remains unframed to match modern chat answer surfaces
                                  isDark ? 'text-slate-100' : 'text-slate-900'
                              }`

                        return (
                            <div key={message.id} className={messageContainerClassName}>
                                <div className={messageBodyClassName}>
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
                        <div className="demo-chat-message-enter flex justify-start">
                            <div
                                className={`inline-flex items-center px-1 py-3 text-sm transition-colors duration-300 ${
                                    isDark
                                        ? 'text-slate-400'
                                        : 'text-slate-500'
                                }`}
                                aria-live={POLITE_LIVE_REGION}
                            >
                                <span
                                    className={`mr-2 h-2 w-2 rounded-full motion-safe:animate-pulse ${
                                        isDark ? 'bg-cyan-300' : 'bg-slate-400'
                                    }`}
                                />
                                {currentThinkingMessage}
                            </div>
                        </div>
                    ) : null}
                    <div ref={messagesEndRef} />
                </div>

                <form
                    onSubmit={handleSubmit}
                    className={`rounded-b-xl border-t p-3 shadow-sm transition-colors duration-300 ${
                        isDark ? 'border-white/10 bg-slate-900' : 'border-slate-200 bg-white'
                    }`}
                >
                    {errorMessage ? (
                        <p className="mb-2 text-xs font-medium text-red-600">{errorMessage}</p>
                    ) : null}
                    <div className="flex items-end gap-2">
                        <textarea
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            placeholder={t('placeholder')}
                            disabled={!sessionId || isSending}
                            rows={1}
                            className={`min-h-11 flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none transition-colors placeholder:text-slate-400 ${
                                isDark
                                    ? 'border-white/10 bg-slate-950 text-slate-100 focus:border-cyan-300/60 focus:bg-slate-950'
                                    : 'border-slate-200 bg-slate-50 text-slate-950 focus:border-slate-400 focus:bg-white'
                            }`}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault()
                                    event.currentTarget.form?.requestSubmit()
                                }
                            }}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || !sessionId || isSending}
                            aria-label={t('send')}
                            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${
                                isDark
                                    ? 'bg-cyan-300 text-slate-950 hover:bg-cyan-200'
                                    : 'bg-slate-900 text-white hover:bg-slate-800'
                            }`}
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </form>
            </section>
        </main>
    )
}
