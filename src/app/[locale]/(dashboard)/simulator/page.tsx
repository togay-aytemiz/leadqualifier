import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import ChatSimulator from '@/components/chat/ChatSimulator'

export default async function SimulatorPage() {
    const supabase = await createClient()
    const t = await getTranslations('common') // Fallback to common for now

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Get current organization (for now, just pick the first one user owns/is member of)
    // Ideally this would be selected from context or URL params
    const { data: memberships } = await supabase
        .from('organization_members')
        .select('organization_id, organizations(name)')
        .eq('user_id', user.id)
        .limit(1)
        .single()

    if (!memberships || !memberships.organizations) {
        return (
            <div className="p-8 text-center">
                <h2 className="text-xl font-bold text-white">No Organization Found</h2>
                <p className="text-zinc-400 mt-2">Please create an organization to use the simulator.</p>
            </div>
        )
    }

    const org = memberships.organizations as unknown as { name: string }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-white">WhatsApp Simulator</h1>
                <p className="mt-2 text-zinc-400">Test your conversational agent in a realistic environment.</p>
            </div>

            <ChatSimulator
                organizationId={memberships.organization_id}
                organizationName={org.name}
            />
        </div>
    )
}
