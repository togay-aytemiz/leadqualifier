import { NextRequest, NextResponse } from 'next/server'
import { simulateChat } from '@/lib/chat/actions'
import type { ConversationTurn } from '@/lib/knowledge-base/router'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type WebWidgetChatRouteContext = {
    params: Promise<{
        organizationId: string
    }>
}

type WebWidgetHistoryTurn = {
    role?: unknown
    content?: unknown
}

function normalizeHistory(value: unknown): ConversationTurn[] {
    if (!Array.isArray(value)) return []

    const normalized: ConversationTurn[] = []
    for (const item of value) {
        if (!item || typeof item !== 'object') continue

        const turn = item as WebWidgetHistoryTurn
        const role = turn.role === 'assistant' ? 'assistant' : turn.role === 'user' ? 'user' : null
        const content = typeof turn.content === 'string' ? turn.content.trim() : ''
        if (!role || !content) continue

        normalized.push({
            role,
            content,
            timestamp: new Date().toISOString(),
        })
    }

    return normalized.slice(-8)
}

export async function POST(request: NextRequest | Request, context: WebWidgetChatRouteContext) {
    const { organizationId } = await context.params
    const body = await request.json().catch(() => null) as {
        message?: unknown
        threshold?: unknown
        conversationHistory?: unknown
    } | null
    const message = typeof body?.message === 'string' ? body.message.trim() : ''

    if (!message) {
        return NextResponse.json({ error: 'message_required' }, { status: 400 })
    }

    const threshold = typeof body?.threshold === 'number' ? body.threshold : undefined
    const conversationHistory = normalizeHistory(body?.conversationHistory)
    const result = await simulateChat(message, organizationId, threshold, conversationHistory)

    return NextResponse.json({
        response: result.response,
        ...(result.skillImage ? { skillImage: result.skillImage } : {}),
    })
}
