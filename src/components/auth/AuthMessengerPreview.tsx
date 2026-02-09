'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
    getAuthPreviewBubbleEnterClasses,
    getAuthPreviewMessageStackClasses,
    getAuthPreviewThreadFrameClasses,
    getAuthPreviewThreadTopFadeClasses,
    getAuthPreviewThreadViewportClasses,
} from '@/components/auth/authMessengerPreviewStyles'

type Phase = 'typingComposer' | 'sending' | 'sent' | 'typingAgent' | 'scenarioHold' | 'switchScenario'
type Role = 'user' | 'agent'
type LeadTone = 'hot' | 'warm' | 'cold'

type ChatMessage = {
    id: number
    role: Role
    text: string
    typingTargetText?: string
}

type ChatTurn = {
    user: string
    agent: string
}

type ScenarioLeadModel = {
    scoreByStep: number[]
    signalByStep: string[]
}

type ChatScenario = {
    turns: ChatTurn[]
    lead: ScenarioLeadModel
}

const EMPTY_SCENARIO: ChatScenario = {
    turns: [],
    lead: {
        scoreByStep: [0],
        signalByStep: [''],
    },
}

const USER_TYPE_MS = 34
const AGENT_TYPE_MS = 21
const SEND_MS = 560
const SENT_MS = 210
const TURN_GAP_MS = 260
const SCENARIO_HOLD_MS = 1400
const SCENARIO_SWITCH_MS = 280

function getLeadTone(score: number): LeadTone {
    if (score >= 70) return 'hot'
    if (score >= 45) return 'warm'
    return 'cold'
}

export function AuthMessengerPreview() {
    const t = useTranslations('auth')
    const scenarios = useMemo<ChatScenario[]>(
        () => [
            {
                turns: [
                    {
                        user: t('canvasScenario1Turn1User'),
                        agent: t('canvasScenario1Turn1Agent'),
                    },
                    {
                        user: t('canvasScenario1Turn2User'),
                        agent: t('canvasScenario1Turn2Agent'),
                    },
                ],
                lead: {
                    scoreByStep: [18, 42, 68, 82, 91],
                    signalByStep: [
                        t('canvasScenario1LeadSignal0'),
                        t('canvasScenario1LeadSignal1'),
                        t('canvasScenario1LeadSignal2'),
                        t('canvasScenario1LeadSignal3'),
                        t('canvasScenario1LeadSignal4'),
                    ],
                },
            },
            {
                turns: [
                    {
                        user: t('canvasScenario2Turn1User'),
                        agent: t('canvasScenario2Turn1Agent'),
                    },
                    {
                        user: t('canvasScenario2Turn2User'),
                        agent: t('canvasScenario2Turn2Agent'),
                    },
                ],
                lead: {
                    scoreByStep: [16, 13, 11, 8, 6],
                    signalByStep: [
                        t('canvasScenario2LeadSignal0'),
                        t('canvasScenario2LeadSignal1'),
                        t('canvasScenario2LeadSignal2'),
                        t('canvasScenario2LeadSignal3'),
                        t('canvasScenario2LeadSignal4'),
                    ],
                },
            },
            {
                turns: [
                    {
                        user: t('canvasScenario3Turn1User'),
                        agent: t('canvasScenario3Turn1Agent'),
                    },
                    {
                        user: t('canvasScenario3Turn2User'),
                        agent: t('canvasScenario3Turn2Agent'),
                    },
                ],
                lead: {
                    scoreByStep: [22, 50, 74, 86, 94],
                    signalByStep: [
                        t('canvasScenario3LeadSignal0'),
                        t('canvasScenario3LeadSignal1'),
                        t('canvasScenario3LeadSignal2'),
                        t('canvasScenario3LeadSignal3'),
                        t('canvasScenario3LeadSignal4'),
                    ],
                },
            },
        ],
        [t]
    )

    const [scenarioIndex, setScenarioIndex] = useState(0)
    const [turnIndex, setTurnIndex] = useState(0)
    const [phase, setPhase] = useState<Phase>('typingComposer')
    const [composerText, setComposerText] = useState('')
    const [agentText, setAgentText] = useState('')
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [nextMessageId, setNextMessageId] = useState(1)
    const messageViewportRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        setScenarioIndex(0)
        setTurnIndex(0)
        setPhase('typingComposer')
        setComposerText('')
        setAgentText('')
        setMessages([])
        setNextMessageId(1)
    }, [scenarios])

    useEffect(() => {
        const currentScenario = scenarios[scenarioIndex]
        const currentTurn = currentScenario?.turns[turnIndex]
        if (!currentScenario || !currentTurn) {
            return
        }

        let timer: ReturnType<typeof setTimeout> | undefined

        if (phase === 'typingComposer') {
            if (composerText.length < currentTurn.user.length) {
                timer = setTimeout(() => {
                    setComposerText(currentTurn.user.slice(0, composerText.length + 1))
                }, USER_TYPE_MS)
            } else {
                timer = setTimeout(() => setPhase('sending'), 220)
            }
        }

        if (phase === 'sending') {
            timer = setTimeout(() => {
                setComposerText('')
                setPhase('sent')
            }, SEND_MS)
        }

        if (phase === 'sent') {
            timer = setTimeout(() => {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: nextMessageId,
                        role: 'user',
                        text: currentTurn.user,
                    },
                ])
                setNextMessageId((id) => id + 1)
                setPhase('typingAgent')
            }, SENT_MS)
        }

        if (phase === 'typingAgent') {
            if (agentText.length < currentTurn.agent.length) {
                timer = setTimeout(() => {
                    setAgentText(currentTurn.agent.slice(0, agentText.length + 1))
                }, AGENT_TYPE_MS)
            } else {
                timer = setTimeout(() => {
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: nextMessageId,
                            role: 'agent',
                            text: currentTurn.agent,
                        },
                    ])
                    setNextMessageId((id) => id + 1)
                    setAgentText('')

                    const isLastTurn = turnIndex >= currentScenario.turns.length - 1
                    if (isLastTurn) {
                        setPhase('scenarioHold')
                    } else {
                        setTurnIndex((current) => current + 1)
                        setPhase('typingComposer')
                    }
                }, TURN_GAP_MS)
            }
        }

        if (phase === 'scenarioHold') {
            timer = setTimeout(() => setPhase('switchScenario'), SCENARIO_HOLD_MS)
        }

        if (phase === 'switchScenario') {
            timer = setTimeout(() => {
                setMessages([])
                setComposerText('')
                setAgentText('')
                setTurnIndex(0)
                setScenarioIndex((current) => (current + 1) % scenarios.length)
                setPhase('typingComposer')
            }, SCENARIO_SWITCH_MS)
        }

        return () => {
            if (timer) clearTimeout(timer)
        }
    }, [agentText, composerText, nextMessageId, phase, scenarioIndex, scenarios, turnIndex])

    const activeScenario = scenarios[scenarioIndex] ?? EMPTY_SCENARIO
    const hasComposerText = composerText.length > 0
    const userMessageCount = messages.filter((message) => message.role === 'user').length
    const showTypingAgentBubble = phase === 'typingAgent' && agentText.length > 0
    const isSending = phase === 'sending'
    const isSent = phase === 'sent'
    const isComposerBusy = isSending || isSent
    const isComposerExpanded = isSending
    const showPlaceholder =
        !hasComposerText &&
        (phase === 'sent' ||
            phase === 'typingAgent' ||
            phase === 'scenarioHold' ||
            phase === 'switchScenario')
    const showCaret = phase === 'typingComposer' && !hasComposerText
    const typingTargetText = activeScenario.turns[turnIndex]?.agent ?? ''
    const visibleMessages: ChatMessage[] = showTypingAgentBubble
        ? [
              ...messages,
              {
                  id: nextMessageId + 999,
                  role: 'agent',
                  text: agentText,
                  typingTargetText,
              },
          ]
        : messages

    useEffect(() => {
        const viewport = messageViewportRef.current
        if (!viewport) return

        viewport.scrollTop = viewport.scrollHeight
    }, [agentText, phase, visibleMessages.length])

    const leadStep = Math.min(messages.length, activeScenario.lead.scoreByStep.length - 1)
    const leadScore = activeScenario.lead.scoreByStep[leadStep] ?? 0
    const leadSignal = activeScenario.lead.signalByStep[leadStep] ?? ''
    const leadTone = getLeadTone(leadScore)
    const hasLeadScoringData = userMessageCount > 0
    const isLeadScoringPending = !hasLeadScoringData
    const leadToneLabel =
        isLeadScoringPending
            ? t('canvasLeadStatusPending')
            : leadTone === 'hot'
              ? t('canvasLeadStatusHot')
              : leadTone === 'warm'
                ? t('canvasLeadStatusWarm')
                : t('canvasLeadStatusCold')
    const leadScoreText = isLeadScoringPending ? t('canvasLeadScorePending') : `${leadScore}/100`
    const leadSignalText = isLeadScoringPending ? t('canvasLeadSignalPending') : leadSignal
    const leadBarWidth = isLeadScoringPending ? 14 : leadScore

    return (
        <div className="relative z-10 flex h-full min-h-0 flex-col">
            <div className="max-w-sm">
                <span className="inline-flex rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-sm">
                    {t('canvasPill')}
                </span>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-gray-900">
                    {t('canvasTitle')}
                </h2>
                <p className="mt-3 text-sm text-gray-600">{t('canvasSubtitle')}</p>

                <div className="mt-4 w-56 rounded-xl border border-gray-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm transition-all duration-300">
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            {t('canvasLeadScoringTitle')}
                        </p>
                        <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                isLeadScoringPending
                                    ? 'bg-gray-100 text-gray-500 ring-1 ring-gray-300/70'
                                    : leadTone === 'hot'
                                      ? 'bg-red-100 text-red-700 ring-1 ring-red-300/70'
                                      : leadTone === 'warm'
                                        ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300/70'
                                        : 'bg-slate-100 text-slate-600 ring-1 ring-slate-300/70'
                            }`}
                        >
                            {leadToneLabel}
                        </span>
                    </div>

                    <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-gray-700">{t('canvasLeadScoreLabel')}</span>
                        <span className="font-semibold text-gray-900">{leadScoreText}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${
                                isLeadScoringPending
                                    ? 'animate-pulse bg-gradient-to-r from-gray-300 to-gray-200'
                                    : leadTone === 'hot'
                                      ? 'bg-gradient-to-r from-rose-500 to-red-500'
                                      : leadTone === 'warm'
                                        ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                                        : 'bg-gradient-to-r from-slate-400 to-slate-500'
                            }`}
                            style={{ width: `${leadBarWidth}%` }}
                        />
                    </div>
                    <p className="mt-2 truncate text-[11px] text-gray-600">
                        <span className="font-medium text-gray-700">{t('canvasLeadSignalLabel')}: </span>
                        {leadSignalText}
                    </p>
                </div>
            </div>

            <div className="mt-2 flex min-h-0 flex-1 flex-col justify-end">
                <div className={getAuthPreviewThreadFrameClasses()}>
                    <div ref={messageViewportRef} className={getAuthPreviewThreadViewportClasses()}>
                        <div className={getAuthPreviewMessageStackClasses()}>
                            {visibleMessages.map((message) => (
                                <div
                                    key={message.id}
                                    className={`${getAuthPreviewBubbleEnterClasses()} transition-all duration-300 ${
                                        message.role === 'user' ? 'flex justify-end' : ''
                                    }`}
                                >
                                    {message.role === 'agent' && (
                                        <div className="w-full">
                                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                                {t('canvasAgentLabel')}
                                            </div>
                                            <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 shadow-sm">
                                                {message.typingTargetText ? (
                                                    <div className="relative">
                                                        <p
                                                            aria-hidden="true"
                                                            className="invisible whitespace-pre-wrap break-words"
                                                        >
                                                            {message.typingTargetText}
                                                        </p>
                                                        <p className="absolute inset-0 whitespace-pre-wrap break-words">
                                                            {message.text}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <p>{message.text}</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {message.role === 'user' && (
                                        <div className="flex flex-col items-end">
                                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                                                {t('canvasCustomerLabel')}
                                            </div>
                                            <div className="max-w-[84%] rounded-2xl rounded-br-md bg-[#111827] px-4 py-2.5 text-sm font-medium text-white shadow-sm">
                                                <p>{message.text}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className={getAuthPreviewThreadTopFadeClasses()} />
                </div>

                <div className="mt-4 w-full max-w-xl">
                    <div
                        className={`relative rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-300 ${
                            isComposerExpanded ? 'px-4 py-3.5' : 'px-4 py-2'
                        }`}
                        aria-disabled={isComposerBusy}
                    >
                        <div className="absolute inset-x-4 -top-1 h-1 rounded-full bg-gradient-to-r from-sky-300 via-transparent to-indigo-300 opacity-90" />
                        {isComposerBusy && (
                            <div className="mb-1 text-xs font-medium text-gray-500">
                                {isSending ? t('canvasSendingLabel') : t('canvasSentLabel')}
                            </div>
                        )}
                        <div className="flex items-center gap-3">
                            <div className="min-h-[26px] flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-base font-medium leading-[1.25] text-gray-900 transition-all duration-300">
                                {hasComposerText && <span>{composerText}</span>}
                                {showPlaceholder && <span className="text-gray-400">{t('canvasIdlePrompt')}</span>}
                                {showCaret && (
                                    <span className="ml-0.5 inline-block h-5 w-[2px] animate-pulse align-middle bg-gray-500" />
                                )}
                            </div>
                            <span
                                className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-base transition-colors ${
                                    isComposerBusy
                                        ? 'bg-[#111827] text-white shadow-sm shadow-[#111827]/20'
                                        : 'bg-gray-100 text-gray-400'
                                } ${isSending ? 'animate-pulse' : ''}`}
                            >
                                ↑
                            </span>
                        </div>
                        <div className="absolute inset-x-4 -bottom-1 h-1 rounded-full bg-gradient-to-r from-orange-400 via-pink-500 to-fuchsia-500" />
                    </div>
                </div>
            </div>
        </div>
    )
}
