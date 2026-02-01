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

import { TelegramClient } from '@/lib/telegram/client'
import { v4 as uuidv4 } from 'uuid'

export async function connectTelegramChannel(organizationId: string, botToken: string) {
    // 1. Validate Token with Telegram API
    try {
        const client = new TelegramClient(botToken)
        const botInfo = await client.getMe()

        const botName = botInfo.first_name + (botInfo.username ? ` (@${botInfo.username})` : '')
        const webhookSecret = uuidv4()

        // 2. Set Webhook if APP_URL is defined
        let appUrl = process.env.NEXT_PUBLIC_APP_URL
        if (!appUrl && process.env.VERCEL_URL) {
            appUrl = `https://${process.env.VERCEL_URL}`
        }

        if (appUrl) {
            await client.setWebhook(`${appUrl}/api/webhooks/telegram`, webhookSecret)
        } else {
            console.warn('APP_URL not defined, skipping Telegram webhook registration')
        }

        // 3. Save to DB
        const supabase = await createClient()
        const { error } = await supabase.from('channels').insert({
            organization_id: organizationId,
            type: 'telegram',
            name: botName,
            config: {
                bot_token: botToken,
                username: botInfo.username,
                webhook_secret: webhookSecret
            },
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

    // Fetch channel first to get token
    const { data: channel } = await supabase
        .from('channels')
        .select('*')
        .eq('id', channelId)
        .single()

    if (channel && channel.type === 'telegram' && channel.config.bot_token) {
        try {
            const client = new TelegramClient(channel.config.bot_token)
            await client.deleteWebhook()
        } catch (e) {
            console.error('Failed to delete Telegram webhook', e)
            // Continue with DB deletion even if webhook fails
        }
    }

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
