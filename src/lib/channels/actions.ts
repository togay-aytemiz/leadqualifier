'use server'

import { createClient } from '@/lib/supabase/server'
import { assertTenantWriteAllowed } from '@/lib/organizations/active-context'
import { revalidatePath } from 'next/cache'
import { TelegramClient } from '@/lib/telegram/client'
import { WhatsAppClient } from '@/lib/whatsapp/client'
import { InstagramClient } from '@/lib/instagram/client'
import { v4 as uuidv4 } from 'uuid'
import type { Json } from '@/types/database'

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

export type TelegramDebugResult =
    | { success: true; info: unknown }
    | { success: false; error: string }

export type WhatsAppDebugResult =
    | { success: true; info: unknown }
    | { success: false; error: string }

export type InstagramDebugResult =
    | { success: true; info: unknown }
    | { success: false; error: string }

export interface ConnectWhatsAppChannelInput {
    phoneNumberId: string
    businessAccountId: string
    permanentAccessToken: string
    appSecret: string
    verifyToken: string
}

export interface ConnectInstagramChannelInput {
    pageId: string
    instagramBusinessAccountId: string
    pageAccessToken: string
    appSecret: string
    verifyToken: string
}

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message
    return fallback
}

function asConfigRecord(value: Json): Record<string, Json | undefined> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
    return value as Record<string, Json | undefined>
}

function readConfigString(config: Json, key: string): string | null {
    const value = asConfigRecord(config)[key]
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

export async function connectTelegramChannel(organizationId: string, botToken: string) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)

    // 1. Validate Token with Telegram API
    try {
        const client = new TelegramClient(botToken)
        const botInfo = await client.getMe()

        const botName = botInfo.first_name + (botInfo.username ? ` (@${botInfo.username})` : '')
        const webhookSecret = uuidv4()

        // 2. Set Webhook if APP_URL is defined
        let appUrl = process.env.NEXT_PUBLIC_APP_URL
        if (!appUrl) {
            if (process.env.VERCEL_URL) appUrl = `https://${process.env.VERCEL_URL}`
            else if (process.env.URL) appUrl = process.env.URL // Netlify
        }

        if (appUrl) {
            console.log('Setting Telegram Webhook to:', `${appUrl}/api/webhooks/telegram`)
            // Pass secret in URL as query param to avoid header stripping issues
            await client.setWebhook(`${appUrl}/api/webhooks/telegram?secret=${webhookSecret}`, webhookSecret)
        } else {
            console.error('APP_URL not defined. Env vars checks:', {
                NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
                VERCEL_URL: process.env.VERCEL_URL,
                URL: process.env.URL
            })
            throw new Error('System Configuration Error: Public App URL is not defined. Cannot register webhook.')
        }

        // 3. Save to DB
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
    } catch (error: unknown) {
        console.error('Telegram connection error:', error)
        return { error: getErrorMessage(error, 'Failed to connect Telegram bot') }
    }
}

export async function connectWhatsAppChannel(organizationId: string, input: ConnectWhatsAppChannelInput) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)

    const phoneNumberId = input.phoneNumberId.trim()
    const businessAccountId = input.businessAccountId.trim()
    const permanentAccessToken = input.permanentAccessToken.trim()
    const appSecret = input.appSecret.trim()
    const verifyToken = input.verifyToken.trim()

    if (!phoneNumberId || !businessAccountId || !permanentAccessToken || !appSecret || !verifyToken) {
        return { error: 'Missing required WhatsApp channel fields.' }
    }

    try {
        const client = new WhatsAppClient(permanentAccessToken)
        const phoneDetails = await client.getPhoneNumber(phoneNumberId)

        const displayPhoneNumber = (phoneDetails.display_phone_number ?? '').trim()
        const channelName = displayPhoneNumber
            ? `WhatsApp (${displayPhoneNumber})`
            : `WhatsApp (${phoneNumberId})`

        const { error } = await supabase
            .from('channels')
            .upsert({
                organization_id: organizationId,
                type: 'whatsapp',
                name: channelName,
                status: 'active',
                config: {
                    phone_number_id: phoneNumberId,
                    business_account_id: businessAccountId,
                    permanent_access_token: permanentAccessToken,
                    app_secret: appSecret,
                    verify_token: verifyToken,
                    display_phone_number: displayPhoneNumber,
                    webhook_verified_at: null
                }
            }, {
                onConflict: 'organization_id,type'
            })

        if (error) throw error

        revalidatePath('/settings/channels')
        return { success: true }
    } catch (error: unknown) {
        console.error('WhatsApp connection error:', error)
        return { error: getErrorMessage(error, 'Failed to connect WhatsApp channel') }
    }
}

export async function connectInstagramChannel(organizationId: string, input: ConnectInstagramChannelInput) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)

    const pageId = input.pageId.trim()
    const instagramBusinessAccountId = input.instagramBusinessAccountId.trim()
    const pageAccessToken = input.pageAccessToken.trim()
    const appSecret = input.appSecret.trim()
    const verifyToken = input.verifyToken.trim()

    if (!pageId || !instagramBusinessAccountId || !pageAccessToken || !appSecret || !verifyToken) {
        return { error: 'Missing required Instagram channel fields.' }
    }

    try {
        const client = new InstagramClient(pageAccessToken)
        const accountDetails = await client.getBusinessAccount(instagramBusinessAccountId)

        const username = (accountDetails.username ?? '').trim()
        const channelName = username
            ? `Instagram (@${username})`
            : `Instagram (${instagramBusinessAccountId})`

        const { error } = await supabase
            .from('channels')
            .upsert({
                organization_id: organizationId,
                type: 'instagram',
                name: channelName,
                status: 'active',
                config: {
                    page_id: pageId,
                    instagram_business_account_id: instagramBusinessAccountId,
                    page_access_token: pageAccessToken,
                    app_secret: appSecret,
                    verify_token: verifyToken,
                    username,
                    webhook_verified_at: null
                }
            }, {
                onConflict: 'organization_id,type'
            })

        if (error) throw error

        revalidatePath('/settings/channels')
        return { success: true }
    } catch (error: unknown) {
        console.error('Instagram connection error:', error)
        return { error: getErrorMessage(error, 'Failed to connect Instagram channel') }
    }
}

export async function disconnectChannel(channelId: string) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)

    // Fetch channel first to get token
    const { data: channel } = await supabase
        .from('channels')
        .select('*')
        .eq('id', channelId)
        .single()

    const telegramToken = channel && channel.type === 'telegram'
        ? readConfigString(channel.config, 'bot_token')
        : null

    if (channel && channel.type === 'telegram' && telegramToken) {
        try {
            const client = new TelegramClient(telegramToken)
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

export async function debugTelegramChannel(channelId: string): Promise<TelegramDebugResult> {
    const supabase = await createClient()

    const { data: channel } = await supabase
        .from('channels')
        .select('*')
        .eq('id', channelId)
        .single()

    const telegramToken = channel && channel.type === 'telegram'
        ? readConfigString(channel.config, 'bot_token')
        : null

    if (channel && channel.type === 'telegram' && telegramToken) {
        try {
            const client = new TelegramClient(telegramToken)
            const info = await client.getWebhookInfo()
            return { success: true, info }
        } catch (e: unknown) {
            return { success: false, error: getErrorMessage(e, 'Failed to read Telegram webhook info') }
        }
    }
    return { success: false, error: 'Channel not found or not telegram' }
}

export async function debugWhatsAppChannel(channelId: string): Promise<WhatsAppDebugResult> {
    const supabase = await createClient()

    const { data: channel } = await supabase
        .from('channels')
        .select('*')
        .eq('id', channelId)
        .single()

    const accessToken = channel && channel.type === 'whatsapp'
        ? readConfigString(channel.config, 'permanent_access_token')
        : null
    const phoneNumberId = channel && channel.type === 'whatsapp'
        ? readConfigString(channel.config, 'phone_number_id')
        : null
    const verifyToken = channel && channel.type === 'whatsapp'
        ? readConfigString(channel.config, 'verify_token')
        : null

    if (!channel || channel.type !== 'whatsapp' || !accessToken || !phoneNumberId) {
        return { success: false, error: 'Channel not found or not whatsapp' }
    }

    try {
        const client = new WhatsAppClient(accessToken)
        const phoneDetails = await client.getPhoneNumber(phoneNumberId)
        return {
            success: true,
            info: {
                phone_number_id: phoneNumberId,
                verify_token_set: Boolean(verifyToken),
                display_phone_number: phoneDetails.display_phone_number ?? null,
                verified_name: phoneDetails.verified_name ?? null,
                quality_rating: phoneDetails.quality_rating ?? null
            }
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Failed to read WhatsApp channel info') }
    }
}

export async function debugInstagramChannel(channelId: string): Promise<InstagramDebugResult> {
    const supabase = await createClient()

    const { data: channel } = await supabase
        .from('channels')
        .select('*')
        .eq('id', channelId)
        .single()

    const pageAccessToken = channel && channel.type === 'instagram'
        ? readConfigString(channel.config, 'page_access_token')
        : null
    const instagramBusinessAccountId = channel && channel.type === 'instagram'
        ? readConfigString(channel.config, 'instagram_business_account_id')
        : null
    const verifyToken = channel && channel.type === 'instagram'
        ? readConfigString(channel.config, 'verify_token')
        : null
    const pageId = channel && channel.type === 'instagram'
        ? readConfigString(channel.config, 'page_id')
        : null

    if (!channel || channel.type !== 'instagram' || !pageAccessToken || !instagramBusinessAccountId) {
        return { success: false, error: 'Channel not found or not instagram' }
    }

    try {
        const client = new InstagramClient(pageAccessToken)
        const accountDetails = await client.getBusinessAccount(instagramBusinessAccountId)
        return {
            success: true,
            info: {
                instagram_business_account_id: instagramBusinessAccountId,
                page_id: pageId,
                verify_token_set: Boolean(verifyToken),
                username: accountDetails.username ?? null,
                name: accountDetails.name ?? null,
                profile_picture_url: accountDetails.profile_picture_url ?? null
            }
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Failed to read Instagram channel info') }
    }
}
