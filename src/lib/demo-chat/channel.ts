import type { SupabaseClient } from '@supabase/supabase-js'

export interface DemoChatChannel {
    id: string
    organizationId: string
    slug: string
    displayName: string
    logoUrl: string | null
    sharedSecretHash: string | null
}

function normalizeSlug(slug: string) {
    return slug.trim().toLowerCase()
}

function normalizeSessionId(sessionId: string) {
    return sessionId.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96)
}

export function buildDemoChatContactId(channelId: string, sessionId: string) {
    return `demo:${channelId}:${normalizeSessionId(sessionId)}`
}

export async function resolveDemoChatChannel(args: {
    supabase: SupabaseClient
    slug: string
}): Promise<DemoChatChannel | null> {
    const slug = normalizeSlug(args.slug)
    if (!slug) return null

    const { data, error } = await args.supabase
        .from('demo_chat_channels')
        .select('id, organization_id, slug, display_name, logo_url, enabled, shared_secret_hash')
        .eq('slug', slug)
        .eq('enabled', true)
        .maybeSingle()

    if (error || !data) return null

    return {
        id: String(data.id),
        organizationId: String(data.organization_id),
        slug: String(data.slug),
        displayName: String(data.display_name),
        logoUrl: typeof data.logo_url === 'string' ? data.logo_url : null,
        sharedSecretHash: typeof data.shared_secret_hash === 'string' && data.shared_secret_hash.trim()
            ? data.shared_secret_hash.trim()
            : null,
    }
}
