'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { ChatMessage, simulateChat, type SimulationResponse } from '@/lib/chat/actions'
import type { ConversationTurn } from '@/lib/knowledge-base/router'
import { ChatBubble } from './ChatBubble'
import { Send, Bug, MessageSquare } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
    getSimulatorHeaderClasses,
    getSimulatorInputBarClasses,
    getSimulatorInputClasses,
    getSimulatorMessagesPaneClasses,
    getSimulatorSendButtonClasses,
    getSimulatorShellClasses
} from '@/components/chat/simulatorStyles'

interface ChatSimulatorProps {
    organizationId: string
    organizationName: string
    defaultMatchThreshold?: number
}

export default function ChatSimulator({ organizationId, organizationName, defaultMatchThreshold }: ChatSimulatorProps) {
    const t = useTranslations('simulator')
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const [threshold, setThreshold] = useState(defaultMatchThreshold ?? 0.6)
    const [debugInfo, setDebugInfo] = useState<SimulationResponse['matchedSkill'] | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const conversationTotals = useMemo(() => {
        const totals = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
        for (const msg of messages) {
            if (!msg.tokenUsage) continue
            totals.inputTokens += msg.tokenUsage.inputTokens
            totals.outputTokens += msg.tokenUsage.outputTokens
        }
        totals.totalTokens = totals.inputTokens + totals.outputTokens
        return totals
    }, [messages])

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages, isTyping])

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim()) return

        const history: ConversationTurn[] = messages
            .slice(-8)
            .map((msg) => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content,
                timestamp: msg.timestamp.toISOString()
            }))

        const userMsg: ChatMessage = {
            id: uuidv4(),
            role: 'user',
            content: input,
            timestamp: new Date(),
            status: 'sent',
        }

        setMessages((prev) => [...prev, userMsg])
        setInput('')
        setIsTyping(true)
        setDebugInfo(null)

        try {
            // Simulate network delay + typing
            const startTime = Date.now()
            const response = await simulateChat(userMsg.content, organizationId, threshold, history)
            const endTime = Date.now()
            const tokenUsage = response.tokenUsage

            // Ensure at least 1.5s typing animation
            const remainingTime = Math.max(0, 1500 - (endTime - startTime))

            setTimeout(() => {
                setIsTyping(false)
                if (tokenUsage) {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === userMsg.id
                                ? {
                                    ...m,
                                    tokenUsage: {
                                        inputTokens: tokenUsage.inputTokens,
                                        outputTokens: 0,
                                        totalTokens: tokenUsage.inputTokens
                                    }
                                }
                                : m
                        )
                    )
                }
                const systemMsg: ChatMessage = {
                    id: uuidv4(),
                    role: 'system',
                    content: response.response,
                    timestamp: new Date(),
                    status: 'read',
                    tokenUsage: tokenUsage
                        ? {
                            inputTokens: 0,
                            outputTokens: tokenUsage.outputTokens,
                            totalTokens: tokenUsage.outputTokens
                        }
                        : undefined
                }
                setMessages((prev) => [...prev, systemMsg])

                if (response.matchedSkill) {
                    setDebugInfo(response.matchedSkill)
                }
            }, remainingTime)

        } catch (error) {
            console.error('Simulation error:', error)
            setIsTyping(false)
        }
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full min-h-0">
            {/* Chat Window */}
            <div className={getSimulatorShellClasses()}>
                {/* Header */}
                <div className={getSimulatorHeaderClasses()}>
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-semibold">
                        {organizationName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 className="text-white font-medium text-base">{organizationName}</h3>
                        <p className="text-white/70 text-xs">{t('assistantLabel')}</p>
                    </div>
                </div>

                {/* Messages */}
                <div className={getSimulatorMessagesPaneClasses()}>
                    {messages.length === 0 && (
                        <div className="flex justify-center mt-10">
                            <span className="max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs text-slate-600 shadow-sm">
                                {t('emptyChatNotice')}
                            </span>
                        </div>
                    )}

                    {messages.map((msg) => (
                        <ChatBubble key={msg.id} message={msg} />
                    ))}

                    {isTyping && (
                        <div className="flex w-full justify-start animate-fade-in">
                            <div className="rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-3 shadow-sm">
                                <div className="flex gap-1">
                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className={getSimulatorInputBarClasses()}>
                    <form onSubmit={handleSend} className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={t('typeMessage')}
                            className={getSimulatorInputClasses()}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isTyping}
                            className={getSimulatorSendButtonClasses()}
                        >
                            <Send size={24} />
                        </button>
                    </form>
                </div>
            </div>

            {/* Debug Panel */}
            <div className="hidden lg:block rounded-xl bg-white border border-gray-200 p-6 h-fit shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Bug className="text-purple-600" size={24} />
                    {t('debug')}
                </h3>

                <div className="mb-6 p-4 rounded-lg bg-gray-50 border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('sensitivity')}</label>
                        <span className="text-xs font-mono text-gray-700 bg-white border border-gray-200 px-1.5 py-0.5 rounded shadow-sm">{threshold}</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={threshold}
                        onChange={(e) => setThreshold(parseFloat(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <p className="text-[10px] text-gray-500 mt-2 whitespace-pre-line">
                        {t('sensitivityHint')}
                    </p>
                </div>

                {conversationTotals.totalTokens > 0 && (
                    <div className="mb-4 p-4 rounded-lg bg-indigo-50 border border-indigo-100">
                        <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">{t('conversationTotals')}</span>
                        <div className="mt-2 text-sm text-indigo-900 space-y-1">
                            <div className="flex items-center justify-between">
                                <span>{t('inputTokens')}</span>
                                <span className="font-mono">{conversationTotals.inputTokens}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>{t('outputTokens')}</span>
                                <span className="font-mono">{conversationTotals.outputTokens}</span>
                            </div>
                            <div className="flex items-center justify-between font-semibold">
                                <span>{t('totalTokens')}</span>
                                <span className="font-mono">{conversationTotals.totalTokens}</span>
                            </div>
                        </div>
                    </div>
                )}

                {debugInfo ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                        <div className="p-4 rounded-lg bg-green-50 border border-green-100">
                            <span className="text-xs font-semibold text-green-600 uppercase tracking-wider">{t('matchedSkill')}</span>
                            <p className="text-gray-900 font-semibold mt-1">{debugInfo.title}</p>
                        </div>

                        <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
                            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">{t('confidenceScore')}</span>
                            <div className="flex items-center gap-2 mt-2">
                                <div className="flex-1 h-2 bg-blue-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 transition-all duration-500 rounded-full"
                                        style={{ width: `${Math.round(debugInfo.similarity * 100)}%` }}
                                    />
                                </div>
                                <span className="text-gray-700 font-mono text-sm font-medium">{(debugInfo.similarity * 100).toFixed(1)}%</span>
                            </div>
                        </div>

                        <div className="p-4 rounded-lg bg-gray-50 border border-gray-100">
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('skillId')}</span>
                            <p className="text-gray-500 text-xs font-mono mt-1 break-all bg-white p-1 rounded border border-gray-100">{debugInfo.id}</p>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                        <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center mx-auto mb-3 shadow-sm">
                            <MessageSquare className="text-gray-400" size={24} />
                        </div>
                        <p className="text-gray-500 text-sm">{t('emptyDebug')}</p>
                    </div>
                )}
            </div>
        </div>
    )
}
