import { createClient } from '@/lib/supabase/server'
import GeneralSettingsClient from './GeneralSettingsClient'

export default async function GeneralSettingsPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    return <GeneralSettingsClient />
}
