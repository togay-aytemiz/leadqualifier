'use client'

import { useState, useRef, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { ChatMessage, simulateChat } from '@/lib/chat/actions'
import { ChatBubble } from './ChatBubble'
import { Send, Bug, MessageSquare } from 'lucide-react'
import { useTranslations } from 'next-intl'


interface ChatSimulatorProps {
    organizationId: string
    organizationName: string
}

export default function ChatSimulator({ organizationId, organizationName }: ChatSimulatorProps) {
    const t = useTranslations('simulator')
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const [threshold, setThreshold] = useState(0.6)
    const [debugInfo, setDebugInfo] = useState<any>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages, isTyping])

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim()) return

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

        // Update status to read after short delay
        setTimeout(() => {
            setMessages((prev) =>
                prev.map((m) => (m.id === userMsg.id ? { ...m, status: 'read' } : m))
            )
        }, 1000)

        try {
            // Simulate network delay + typing
            const startTime = Date.now()
            const response = await simulateChat(userMsg.content, organizationId, threshold)
            const endTime = Date.now()

            // Ensure at least 1.5s typing animation
            const remainingTime = Math.max(0, 1500 - (endTime - startTime))

            setTimeout(() => {
                setIsTyping(false)
                const systemMsg: ChatMessage = {
                    id: uuidv4(),
                    role: 'system',
                    content: response.response,
                    timestamp: new Date(),
                    status: 'read',
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
            <div className="lg:col-span-2 flex flex-col rounded-xl overflow-hidden border border-gray-200 bg-[#efeae2] shadow-sm">
                {/* Header */}
                <div className="bg-[#00a884] px-4 py-3 flex items-center gap-3 shadow-sm z-10">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-semibold backdrop-blur-sm">
                        {organizationName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 className="text-white font-medium text-base">{organizationName}</h3>
                        <p className="text-white/80 text-xs">{t('businessAccount')}</p>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d936cd035c.png")', backgroundRepeat: 'repeat' }}>
                    {messages.length === 0 && (
                        <div className="flex justify-center mt-10">
                            <span className="bg-[#fff5c4] text-gray-800 text-xs px-3 py-1.5 rounded-lg shadow-sm text-center border border-[#ffeeba]">
                                {t('encryptionNotice')}
                            </span>
                        </div>
                    )}

                    {messages.map((msg) => (
                        <ChatBubble key={msg.id} message={msg} />
                    ))}

                    {isTyping && (
                        <div className="flex w-full justify-start animate-fade-in">
                            <div className="bg-white rounded-lg rounded-tl-none px-4 py-3 shadow-sm">
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
                <div className="bg-[#f0f2f5] px-4 py-3 border-t border-gray-200">
                    <form onSubmit={handleSend} className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={t('typeMessage')}
                            className="flex-1 bg-white text-gray-900 rounded-lg px-4 py-2 text-sm focus:outline-none placeholder:text-gray-500 border border-gray-200 focus:border-[#00a884] transition-colors"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isTyping}
                            className="bg-[#00a884] text-white p-2 rounded-lg hover:bg-[#008f6f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
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
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#00a884]"
                    />
                    <p className="text-[10px] text-gray-500 mt-2 whitespace-pre-line">
                        {t('sensitivityHint')}
                    </p>
                </div>

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
