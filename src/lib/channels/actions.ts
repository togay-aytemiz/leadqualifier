'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getChannels(organizationId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching channels:', error)
        return []
    }

    return data
}

export async function connectTelegramChannel(organizationId: string, botToken: string) {
    // 1. Validate Token with Telegram API
    try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
        const data = await response.json()

        if (!data.ok) {
            return { error: 'Invalid Bot Token. Please check and try again.' }
        }

        const botName = data.result.first_name + (data.result.username ? ` (@${data.result.username})` : '')

        // 2. Save to DB
        const supabase = await createClient()
        const { error } = await supabase.from('channels').insert({
            organization_id: organizationId,
            type: 'telegram',
            name: botName,
            config: { bot_token: botToken, username: data.result.username },
            status: 'active'
        })

        if (error) throw error

        revalidatePath('/settings/channels')
        return { success: true }
    } catch (error: any) {
        console.error('Telegram connection error:', error)
        return { error: error.message || 'Failed to connect Telegram bot' }
    }
}

export async function disconnectChannel(channelId: string) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('channels')
        .delete()
        .eq('id', channelId)

    if (error) {
        console.error('Error disconnecting channel:', error)
        throw error
    }

    revalidatePath('/settings/channels')
}
