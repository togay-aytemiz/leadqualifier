'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
    buildWebWidgetLogoStoragePath,
    WEB_WIDGET_ASSETS_BUCKET,
    WEB_WIDGET_LOGO_ALLOWED_TYPES,
} from '@/lib/channels/web-widget-assets'

function requireSupabaseStorageEnv() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase storage configuration')
    }

    return { supabaseUrl, serviceRoleKey }
}

async function canManageOrganization(organizationId: string) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return false

    const { data, error } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', organizationId)
        .maybeSingle()

    if (error) {
        console.warn('Failed to verify web widget organization access:', error)
        return false
    }

    return data?.id === organizationId
}

export async function prepareWebWidgetLogoUpload(args: {
    organizationId: string
    mimeType: string
}) {
    const organizationId = args.organizationId.trim()
    const mimeType = args.mimeType.trim()

    if (!organizationId || !WEB_WIDGET_LOGO_ALLOWED_TYPES.has(mimeType)) {
        return { ok: false as const, reason: 'invalid_request' as const }
    }

    if (!await canManageOrganization(organizationId)) {
        return { ok: false as const, reason: 'unauthorized' as const }
    }

    try {
        const { supabaseUrl, serviceRoleKey } = requireSupabaseStorageEnv()
        const version = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
        const storagePath = buildWebWidgetLogoStoragePath({ organizationId, mimeType, version })
        const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey)
        const storage = serviceClient.storage.from(WEB_WIDGET_ASSETS_BUCKET)
        const { data: signedUploadData, error: signedUploadError } = await storage.createSignedUploadUrl(storagePath)

        if (signedUploadError || !signedUploadData?.token) {
            throw signedUploadError ?? new Error('Missing signed upload token')
        }

        const { data: publicUrlData } = storage.getPublicUrl(storagePath)
        const publicUrl = publicUrlData?.publicUrl?.trim() ?? ''
        if (!publicUrl) {
            throw new Error('Could not resolve public URL for widget logo upload')
        }

        return {
            ok: true as const,
            bucket: WEB_WIDGET_ASSETS_BUCKET,
            storagePath,
            uploadToken: signedUploadData.token,
            publicUrl,
        }
    } catch (error) {
        console.error('Failed to prepare web widget logo upload:', error)
        return { ok: false as const, reason: 'request_failed' as const }
    }
}
