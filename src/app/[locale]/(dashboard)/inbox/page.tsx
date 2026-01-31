import { createClient } from '@/lib/supabase/server'
import { getConversations } from '@/lib/inbox/actions'
import { InboxContainer } from '@/components/inbox/InboxContainer'
import { redirect } from 'next/navigation'

export default async function InboxPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return null // Middleware handles redirect usually
    }

    // Get user's first organization for now
    // In a real app we'd get this from the URL params or a cookie selector
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    const isSystemAdmin = profile?.is_system_admin ?? false
    let organizationId: string | null = null

    if (isSystemAdmin) {
        const { data: org } = await supabase.from('organizations').select('id').limit(1).single()
        organizationId = org?.id || null
    } else {
        const { data: membership } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .limit(1)
            .single()
        organizationId = membership?.organization_id || null
    }

    if (!organizationId) {
        return (
            <div className="p-8 text-center text-gray-500">
                You don't belong to any organization. Please contact admin.
            </div>
        )
    }

    const conversations = await getConversations(organizationId)

    return (
        <InboxContainer
            initialConversations={conversations}
            organizationId={organizationId}
        />
    )
}
