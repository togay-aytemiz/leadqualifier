import { createClient } from '@/lib/supabase/server'
import ProfileSettingsClient from './ProfileSettingsClient'

export default async function ProfileSettingsPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single()

    const initialName = profile?.full_name ?? ''
    const email = profile?.email ?? user.email ?? ''
    return <ProfileSettingsClient initialName={initialName} email={email} />
}
