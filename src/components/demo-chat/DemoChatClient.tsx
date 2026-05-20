'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { useTranslations } from 'next-intl'

type DemoChatMessage = {
    id: string
    role: 'user' | 'assistant'
    content: string
    imageUrl?: string | null
}

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
    const [messages, setMessages] = useState<DemoChatMessage[]>(() => [
        {
            id: 'intro',
            role: 'assistant',
            content: t('introMessage', { name: displayName }),
        },
    ])
    const [input, setInput] = useState('')
    const [isSending, setIsSending] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement | null>(null)

    const storageKey = useMemo(() => `qualy-demo-chat-session:${slug}`, [slug])

    useEffect(() => {
        const existingSessionId = localStorage.getItem(storageKey)
        const nextSessionId = existingSessionId || createSessionId()
        localStorage.setItem(storageKey, nextSessionId)
        setSessionId(nextSessionId)
    }, [storageKey])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, [messages, isSending])

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
        <main className="flex min-h-dvh flex-col bg-slate-100">
            <header className="border-b border-slate-200 bg-white">
                <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-900 text-sm font-semibold text-white">
                        {logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                            displayName.slice(0, 1).toUpperCase()
                        )}
                    </span>
                    <div className="min-w-0">
                        <h1 className="truncate text-base font-semibold text-slate-950">{displayName}</h1>
                        <p className="truncate text-xs text-slate-500">{t('subtitle')}</p>
                    </div>
                </div>
            </header>

            <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-4">
                <div className="flex-1 space-y-3 overflow-y-auto rounded-t-xl bg-white p-4 shadow-sm">
                    {messages.map((message) => {
                        const isUser = message.role === 'user'
                        return (
                            <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`max-w-[84%] rounded-2xl px-4 py-2 text-sm leading-6 shadow-sm ${
                                        isUser
                                            ? 'rounded-br-md bg-slate-900 text-white'
                                            : 'rounded-bl-md border border-slate-200 bg-slate-50 text-slate-900'
                                    }`}
                                >
                                    <p className="whitespace-pre-wrap">{message.content}</p>
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
                            <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-500 shadow-sm">
                                {t('thinking')}
                            </div>
                        </div>
                    ) : null}
                    <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSubmit} className="rounded-b-xl border-t border-slate-200 bg-white p-3 shadow-sm">
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
                            className="min-h-11 flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
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
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </form>
            </section>
        </main>
    )
}
