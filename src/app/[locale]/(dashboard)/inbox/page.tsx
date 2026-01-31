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
        redirect('/login')
    }

    // Get user's first organization
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
            <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-500">
                <div className="text-center">
                    <span className="material-symbols-outlined text-5xl mb-4 opacity-20 block">domain</span>
                    <p className="text-lg font-medium text-gray-900">No Organization Found</p>
                    <p className="text-sm text-gray-500">You need to be part of an organization to access the inbox.</p>
                </div>
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
