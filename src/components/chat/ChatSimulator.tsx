'use client'

import { useState, useRef, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { ChatMessage, simulateChat } from '@/lib/chat/actions'
import { ChatBubble } from './ChatBubble'
import { createClient } from '@/lib/supabase/client'

interface ChatSimulatorProps {
    organizationId: string
    organizationName: string
}

export default function ChatSimulator({ organizationId, organizationName }: ChatSimulatorProps) {
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-10rem)]">
            {/* Chat Window */}
            <div className="lg:col-span-2 flex flex-col rounded-xl overflow-hidden border border-zinc-700 bg-[#efeae2]">
                {/* Header */}
                <div className="bg-[#202c33] px-4 py-3 flex items-center gap-3 border-b border-zinc-700">
                    <div className="w-10 h-10 rounded-full bg-zinc-600 flex items-center justify-center text-white font-semibold">
                        {organizationName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 className="text-white font-medium">{organizationName}</h3>
                        <p className="text-xs text-zinc-400">Business Account</p>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d936cd035c.png")', backgroundRepeat: 'repeat' }}>
                    {messages.length === 0 && (
                        <div className="flex justify-center mt-10">
                            <span className="bg-[#1f2c34] text-[#ffd279] text-xs px-3 py-1.5 rounded-lg shadow-sm text-center">
                                Messages are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.
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
                                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"></span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="bg-[#202c33] px-4 py-3 border-t border-zinc-700">
                    <form onSubmit={handleSend} className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Type a message"
                            className="flex-1 bg-[#2a3942] text-white rounded-lg px-4 py-2 text-sm focus:outline-none placeholder:text-zinc-500"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isTyping}
                            className="bg-[#00a884] text-white p-2 rounded-lg hover:bg-[#008f6f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <svg viewBox="0 0 24 24" height="24" width="24" preserveAspectRatio="xMidYMid meet" className="" fill="currentColor" enableBackground="new 0 0 24 24"><title>send</title><path d="M1.101 21.757 23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z"></path></svg>
                        </button>
                    </form>
                </div>
            </div>

            {/* Debug Panel */}
            <div className="hidden lg:block rounded-xl bg-zinc-800/50 border border-zinc-700/50 p-6 h-fit">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    Simulator Debug
                </h3>

                <div className="mb-6 p-4 rounded-lg bg-zinc-700/30 border border-zinc-600/30">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Sensitivity</label>
                        <span className="text-xs font-mono text-white bg-zinc-700 px-1.5 py-0.5 rounded">{threshold}</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={threshold}
                        onChange={(e) => setThreshold(parseFloat(e.target.value))}
                        className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-[#00a884]"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1.5">
                        Lower = More creative/loose<br />
                        Higher = More strict/exact
                    </p>
                </div>

                {debugInfo ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                            <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">Matched Skill</span>
                            <p className="text-white font-medium mt-1">{debugInfo.title}</p>
                        </div>

                        <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Confidence Score</span>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-2 bg-blue-900 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 transition-all duration-500"
                                        style={{ width: `${Math.round(debugInfo.similarity * 100)}%` }}
                                    />
                                </div>
                                <span className="text-white font-mono text-sm">{(debugInfo.similarity * 100).toFixed(1)}%</span>
                            </div>
                        </div>

                        <div className="p-4 rounded-lg bg-zinc-700/30 border border-zinc-600/30">
                            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Skill ID</span>
                            <p className="text-zinc-500 text-xs font-mono mt-1 break-all">{debugInfo.id}</p>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-10">
                        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                            <svg className="w-6 h-6 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        </div>
                        <p className="text-zinc-500 text-sm">Send a message to see how the bot processes it.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
