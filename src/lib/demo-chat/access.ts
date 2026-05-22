import { createHmac, timingSafeEqual } from 'node:crypto'
import type { DemoChatChannel } from '@/lib/demo-chat/channel'

const DEMO_CHAT_ACCESS_TOKEN_VERSION = 'v1'
const DEFAULT_DEMO_CHAT_ACCESS_TOKEN_TTL_MS = 30 * 60 * 1000

type DemoChatTokenPayload = {
    channelId: string
    slug: string
    exp: number
}

function readSigningKey(channel: DemoChatChannel) {
    const secretHash = channel.sharedSecretHash?.trim()
    return secretHash || null
}

function signPayload(payload: string, signingKey: string) {
    return createHmac('sha256', signingKey).update(payload).digest('base64url')
}

function safeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left)
    const rightBuffer = Buffer.from(right)
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function parsePayload(payload: string): DemoChatTokenPayload | null {
    try {
        const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<DemoChatTokenPayload>
        if (
            typeof parsed.channelId !== 'string'
            || typeof parsed.slug !== 'string'
            || typeof parsed.exp !== 'number'
        ) {
            return null
        }

        return {
            channelId: parsed.channelId,
            slug: parsed.slug,
            exp: parsed.exp,
        }
    } catch {
        return null
    }
}

export function createDemoChatAccessToken(input: {
    channel: DemoChatChannel
    nowMs?: number
    ttlMs?: number
}) {
    const signingKey = readSigningKey(input.channel)
    if (!signingKey) return null

    const nowMs = input.nowMs ?? Date.now()
    const ttlMs = input.ttlMs ?? DEFAULT_DEMO_CHAT_ACCESS_TOKEN_TTL_MS
    const payload = Buffer.from(JSON.stringify({
        channelId: input.channel.id,
        slug: input.channel.slug,
        exp: nowMs + ttlMs,
    } satisfies DemoChatTokenPayload), 'utf8').toString('base64url')
    const signature = signPayload(payload, signingKey)

    return `${DEMO_CHAT_ACCESS_TOKEN_VERSION}.${payload}.${signature}`
}

export function verifyDemoChatAccessToken(input: {
    channel: DemoChatChannel
    token: string | null | undefined
    nowMs?: number
}) {
    const signingKey = readSigningKey(input.channel)
    if (!signingKey || !input.token) return false

    const [version, payloadSegment, signature, ...extra] = input.token.split('.')
    if (
        extra.length > 0
        || version !== DEMO_CHAT_ACCESS_TOKEN_VERSION
        || !payloadSegment
        || !signature
    ) {
        return false
    }

    const payload = parsePayload(payloadSegment)
    if (!payload) return false
    if (payload.channelId !== input.channel.id || payload.slug !== input.channel.slug) return false
    if (payload.exp <= (input.nowMs ?? Date.now())) return false

    return safeEqual(signature, signPayload(payloadSegment, signingKey))
}
