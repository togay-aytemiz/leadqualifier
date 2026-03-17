import { createClient as createServiceClient } from '@supabase/supabase-js'

export function createServiceRoleClient() {
    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

    if (!serviceUrl || !serviceRoleKey) {
        return null
    }

    return createServiceClient(serviceUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
}
