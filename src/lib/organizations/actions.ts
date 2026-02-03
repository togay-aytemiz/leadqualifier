'use server'

import { createClient } from '@/lib/supabase/server'

export async function updateOrganizationName(name: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { data: member, error: memberError } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', user.id)
        .limit(1)
        .single()

    if (memberError || !member) {
        throw new Error('No organization found')
    }

    if (member.role !== 'owner' && member.role !== 'admin') {
        throw new Error('Forbidden')
    }

    const { error } = await supabase
        .from('organizations')
        .update({
            name,
            updated_at: new Date().toISOString()
        })
        .eq('id', member.organization_id)

    if (error) {
        console.error('Failed to update organization:', error)
        throw new Error(error.message)
    }
}
