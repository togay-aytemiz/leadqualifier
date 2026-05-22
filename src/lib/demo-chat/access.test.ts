import { describe, expect, it } from 'vitest'
import {
    createDemoChatAccessToken,
    verifyDemoChatAccessToken,
} from '@/lib/demo-chat/access'
import type { DemoChatChannel } from '@/lib/demo-chat/channel'

const channel: DemoChatChannel = {
    id: 'channel-1',
    organizationId: 'org-1',
    slug: 'yiu-aday-asistani',
    displayName: 'YIU Aday Asistanı',
    logoUrl: null,
    sharedSecretHash: 'sha256:demo-secret-hash',
}

describe('demo chat access tokens', () => {
    it('creates and verifies a signed token scoped to a demo channel', () => {
        const token = createDemoChatAccessToken({ channel, nowMs: 1_000 })

        expect(token).toMatch(/^v1\./)
        expect(verifyDemoChatAccessToken({
            channel,
            token,
            nowMs: 1_000,
        })).toBe(true)
    })

    it('rejects missing channel secrets and tampered tokens', () => {
        const unprotectedChannel = { ...channel, sharedSecretHash: null }
        const token = createDemoChatAccessToken({ channel, nowMs: 1_000 })

        expect(createDemoChatAccessToken({ channel: unprotectedChannel, nowMs: 1_000 })).toBeNull()
        expect(verifyDemoChatAccessToken({
            channel,
            token: `${token}tampered`,
            nowMs: 1_000,
        })).toBe(false)
        expect(verifyDemoChatAccessToken({
            channel: { ...channel, slug: 'other-demo' },
            token,
            nowMs: 1_000,
        })).toBe(false)
    })

    it('rejects expired access tokens', () => {
        const token = createDemoChatAccessToken({
            channel,
            nowMs: 1_000,
            ttlMs: 10_000,
        })

        expect(verifyDemoChatAccessToken({
            channel,
            token,
            nowMs: 11_001,
        })).toBe(false)
    })
})
