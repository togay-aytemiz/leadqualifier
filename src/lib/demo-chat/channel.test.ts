import { describe, expect, it, vi } from 'vitest'
import { buildDemoChatContactId, resolveDemoChatChannel } from '@/lib/demo-chat/channel'

function createSupabaseMock(row: Record<string, unknown> | null) {
    const maybeSingle = vi.fn(async () => ({ data: row, error: null }))
    const eqEnabled = vi.fn(() => ({ maybeSingle }))
    const eqSlug = vi.fn(() => ({ eq: eqEnabled }))
    const select = vi.fn(() => ({ eq: eqSlug }))

    return {
        from: vi.fn((table: string) => {
            expect(table).toBe('demo_chat_channels')
            return { select }
        }),
    }
}

describe('resolveDemoChatChannel', () => {
    it('resolves enabled public slugs without exposing organization ids to the browser', async () => {
        const supabase = createSupabaseMock({
            id: 'channel-1',
            organization_id: 'org-1',
            slug: 'yiu-aday-asistani',
            display_name: 'YIU Aday Asistanı',
            logo_url: null,
            enabled: true,
            maintenance_enabled: true,
            shared_secret_hash: 'sha256:demo-secret-hash',
        })

        await expect(resolveDemoChatChannel({
            supabase: supabase as never,
            slug: 'yiu-aday-asistani',
        })).resolves.toEqual({
            id: 'channel-1',
            organizationId: 'org-1',
            slug: 'yiu-aday-asistani',
            displayName: 'YIU Aday Asistanı',
            logoUrl: null,
            maintenanceEnabled: true,
            sharedSecretHash: 'sha256:demo-secret-hash',
        })
    })

    it('defaults missing maintenance flags to false for older rows or test fixtures', async () => {
        const supabase = createSupabaseMock({
            id: 'channel-1',
            organization_id: 'org-1',
            slug: 'yiu-aday-asistani',
            display_name: 'YIU Aday Asistanı',
            logo_url: null,
            enabled: true,
            shared_secret_hash: 'sha256:demo-secret-hash',
        })

        await expect(resolveDemoChatChannel({
            supabase: supabase as never,
            slug: 'yiu-aday-asistani',
        })).resolves.toMatchObject({
            maintenanceEnabled: false,
        })
    })

    it('returns null for missing slugs', async () => {
        const supabase = createSupabaseMock(null)

        await expect(resolveDemoChatChannel({
            supabase: supabase as never,
            slug: 'missing-demo',
        })).resolves.toBeNull()
    })
})

describe('buildDemoChatContactId', () => {
    it('keeps each tester session isolated under the same demo slug', () => {
        expect(buildDemoChatContactId('channel-1', 'session-a')).toBe('demo:channel-1:session-a')
        expect(buildDemoChatContactId('channel-1', 'session-b')).toBe('demo:channel-1:session-b')
    })

    it('normalizes unsafe session characters before storing contact identity', () => {
        expect(buildDemoChatContactId('channel-1', 'session ../../ one')).toBe('demo:channel-1:sessionone')
    })
})
