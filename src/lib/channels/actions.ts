'use server'

import { createHmac } from 'node:crypto'

import { createClient } from '@/lib/supabase/server'
import { assertTenantWriteAllowed } from '@/lib/organizations/active-context'
import { revalidatePath } from 'next/cache'
import { TelegramClient } from '@/lib/telegram/client'
import { WhatsAppClient } from '@/lib/whatsapp/client'
import { InstagramClient } from '@/lib/instagram/client'
import {
    exchangeMetaCodeForToken,
    exchangeMetaForLongLivedToken,
    resolveMetaInstagramConnectionCandidate,
    resolveMetaWhatsAppConnectionCandidate
} from '@/lib/channels/meta-oauth'
import type { MetaEmbeddedSignupMode } from '@/lib/channels/meta-embedded-signup'
import {
    getChannelConnectionState,
    getMetaWebhookStatus,
    getWhatsAppWebhookStatus
} from '@/lib/channels/connection-readiness'
import {
    resolveConfiguredAppUrl,
    resolveWhatsAppWebhookSubscriptionOverrides
} from '@/lib/channels/whatsapp-webhook-config'
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

export interface WhatsAppTemplateSummary {
    id: string | null
    name: string
    status: string | null
    language: string | null
    category: string | null
}

export type WhatsAppTemplateListResult =
    | { success: true; templates: WhatsAppTemplateSummary[] }
    | { success: false; error: string }

export interface SendWhatsAppTemplateMessageInput {
    channelId: string
    to: string
    templateName: string
    languageCode: string
    bodyParameters?: string[]
}

export type SendWhatsAppTemplateMessageResult =
    | { success: true; messageId: string | null }
    | { success: false; error: string }

export type InstagramDebugResult =
    | { success: true; info: unknown }
    | { success: false; error: string }

export type DisconnectChannelResult =
    | { success: true }
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

export interface CompleteWhatsAppEmbeddedSignupInput {
    authCode: string
    mode: MetaEmbeddedSignupMode
    phoneNumberId?: string | null
    businessAccountId?: string | null
}

const WHATSAPP_COEXISTENCE_DISCONNECT_REQUIRED_ERROR = 'WHATSAPP_COEXISTENCE_DISCONNECT_REQUIRED'
const WHATSAPP_PROVIDER_DISCONNECT_FAILED_ERROR = 'WHATSAPP_PROVIDER_DISCONNECT_FAILED'
const WHATSAPP_EMBEDDED_SIGNUP_ASSETS_MISSING_ERROR = 'WHATSAPP_EMBEDDED_SIGNUP_ASSETS_MISSING'

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message
    return fallback
}

function normalizeOptionalString(value: string | null | undefined) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
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

function readConfigStringArray(config: Json, key: string): string[] | null {
    const value = asConfigRecord(config)[key]
    if (!Array.isArray(value)) return null

    const normalized = value
        .map((item) => typeof item === 'string' ? item.trim() : '')
        .filter((item) => item.length > 0)

    return normalized.length > 0 ? normalized : null
}

function isWhatsAppCoexistenceDisconnectError(error: unknown) {
    const message = getErrorMessage(error, '').toLowerCase()
    return message.includes('/deregister')
        && message.includes('already in use with both cloud api and the whatsapp business app')
}

async function disconnectWhatsAppCloudApi(channel: { config: Json }) {
    const accessToken = readConfigString(channel.config, 'permanent_access_token')
    const phoneNumberId = readConfigString(channel.config, 'phone_number_id')

    if (!accessToken || !phoneNumberId) {
        throw new Error(WHATSAPP_PROVIDER_DISCONNECT_FAILED_ERROR)
    }

    try {
        const client = new WhatsAppClient(accessToken)
        await client.deregisterPhoneNumber(phoneNumberId)
    } catch (error) {
        console.error('Failed to deregister WhatsApp phone number from Cloud API', error)

        if (isWhatsAppCoexistenceDisconnectError(error)) {
            throw new Error(WHATSAPP_COEXISTENCE_DISCONNECT_REQUIRED_ERROR)
        }

        throw new Error(WHATSAPP_PROVIDER_DISCONNECT_FAILED_ERROR)
    }
}

function normalizeTemplateSummary(value: unknown): WhatsAppTemplateSummary | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null

    const record = value as Record<string, unknown>
    const nameValue = typeof record.name === 'string' ? record.name.trim() : ''
    if (!nameValue) return null

    const idValue = typeof record.id === 'string' ? record.id.trim() : ''
    const statusValue = typeof record.status === 'string' ? record.status.trim() : ''
    const languageValue = typeof record.language === 'string' ? record.language.trim() : ''
    const categoryValue = typeof record.category === 'string' ? record.category.trim() : ''

    return {
        id: idValue || null,
        name: nameValue,
        status: statusValue || null,
        language: languageValue || null,
        category: categoryValue || null
    }
}

function createWhatsAppTwoStepVerificationPin(params: {
    organizationId: string
    businessAccountId: string
    phoneNumberId: string
    appSecret: string
}) {
    const digest = createHmac('sha256', params.appSecret)
        .update(`${params.organizationId}:${params.businessAccountId}:${params.phoneNumberId}`)
        .digest('hex')

    const numericValue = parseInt(digest.slice(0, 12), 16)
    return String((numericValue % 900000) + 100000)
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
        const appUrl = resolveConfiguredAppUrl()

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
        const webhookOverrides = resolveWhatsAppWebhookSubscriptionOverrides(verifyToken)
        await client.subscribeAppToBusinessAccount(businessAccountId, webhookOverrides)
        const phoneDetails = await client.getPhoneNumber(phoneNumberId)
        const webhookSubscriptionRequestedAt = new Date().toISOString()

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
                    connected_via: 'manual',
                    display_phone_number: displayPhoneNumber,
                    webhook_status: 'pending',
                    webhook_callback_uri: webhookOverrides?.overrideCallbackUri ?? null,
                    webhook_subscription_requested_at: webhookSubscriptionRequestedAt,
                    webhook_subscription_error: null,
                    webhook_verified_at: null
                }
            }, {
                onConflict: 'organization_id,type'
            })

        if (error) throw error

        const rpcMethod = (supabase as unknown as {
            rpc?: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
        }).rpc

        if (typeof rpcMethod === 'function') {
            const { error: policyError } = await rpcMethod('enforce_org_trial_business_policy', {
                target_organization_id: organizationId,
                input_whatsapp_business_account_id: businessAccountId,
                input_phone: displayPhoneNumber || null,
                input_source: 'whatsapp_connect'
            })

            if (policyError) {
                console.error('Failed to enforce trial business policy on WhatsApp connect:', policyError)
            }
        }

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
                    webhook_status: 'pending',
                    webhook_subscription_error: null,
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

export async function completeWhatsAppEmbeddedSignupChannel(
    organizationId: string,
    input: CompleteWhatsAppEmbeddedSignupInput
) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)

    const appId = process.env.META_WHATSAPP_APP_ID?.trim() || process.env.META_APP_ID?.trim()
    const appSecret = process.env.META_WHATSAPP_APP_SECRET?.trim() || process.env.META_APP_SECRET?.trim()
    const authCode = input.authCode.trim()
    let phoneNumberId = normalizeOptionalString(input.phoneNumberId)
    let businessAccountId = normalizeOptionalString(input.businessAccountId)

    if (!authCode) {
        return { error: 'Missing required WhatsApp embedded signup fields.' }
    }

    const mode = input.mode === 'existing' || input.mode === 'new' ? input.mode : null
    if (!mode) {
        return { error: 'Invalid WhatsApp embedded signup mode.' }
    }

    if (!appId || !appSecret) {
        return { error: 'Meta app configuration is missing.' }
    }

    try {
        const shortLivedToken = await exchangeMetaCodeForToken({
            appId,
            appSecret,
            redirectUri: '',
            code: authCode
        })

        const permanentAccessToken = await exchangeMetaForLongLivedToken({
            appId,
            appSecret,
            shortLivedToken
        })

        if (!phoneNumberId || !businessAccountId) {
            const candidate = await resolveMetaWhatsAppConnectionCandidate({
                userAccessToken: permanentAccessToken,
                appId,
                appSecret
            })

            if (!candidate) {
                return { error: WHATSAPP_EMBEDDED_SIGNUP_ASSETS_MISSING_ERROR }
            }

            phoneNumberId = phoneNumberId ?? candidate.phoneNumberId
            businessAccountId = businessAccountId ?? candidate.businessAccountId
        }

        if (!phoneNumberId || !businessAccountId) {
            return { error: WHATSAPP_EMBEDDED_SIGNUP_ASSETS_MISSING_ERROR }
        }

        const client = new WhatsAppClient(permanentAccessToken)
        const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || uuidv4()
        const webhookOverrides = resolveWhatsAppWebhookSubscriptionOverrides(verifyToken)
        const twoStepVerificationPin = mode === 'new'
            ? createWhatsAppTwoStepVerificationPin({
                organizationId,
                businessAccountId,
                phoneNumberId,
                appSecret
            })
            : null

        if (twoStepVerificationPin) {
            await client.registerPhoneNumber(phoneNumberId, twoStepVerificationPin)
        }
        await client.subscribeAppToBusinessAccount(
            businessAccountId,
            webhookOverrides
        )
        const webhookSubscriptionRequestedAt = new Date().toISOString()

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
                    verify_token: verifyToken,
                    connected_via: 'embedded_signup',
                    embedded_signup_mode: mode,
                    oauth_connected_at: new Date().toISOString(),
                    display_phone_number: displayPhoneNumber,
                    webhook_status: 'pending',
                    webhook_callback_uri: webhookOverrides?.overrideCallbackUri ?? null,
                    webhook_subscription_requested_at: webhookSubscriptionRequestedAt,
                    webhook_subscription_error: null,
                    webhook_verified_at: null,
                    ...(twoStepVerificationPin
                        ? { two_step_verification_pin: twoStepVerificationPin }
                        : {})
                }
            }, {
                onConflict: 'organization_id,type'
            })

        if (error) throw error

        const rpcMethod = (supabase as unknown as {
            rpc?: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
        }).rpc

        if (typeof rpcMethod === 'function') {
            const { error: policyError } = await rpcMethod('enforce_org_trial_business_policy', {
                target_organization_id: organizationId,
                input_whatsapp_business_account_id: businessAccountId,
                input_phone: displayPhoneNumber || null,
                input_source: 'whatsapp_connect'
            })

            if (policyError) {
                console.error('Failed to enforce trial business policy on WhatsApp connect:', policyError)
            }
        }

        revalidatePath('/settings/channels')
        return { success: true }
    } catch (error: unknown) {
        console.error('WhatsApp embedded signup completion error:', error)
        return { error: getErrorMessage(error, 'Failed to complete WhatsApp embedded signup') }
    }
}

export async function disconnectChannel(channelId: string): Promise<DisconnectChannelResult> {
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

    if (channel && channel.type === 'whatsapp') {
        try {
            await disconnectWhatsAppCloudApi(channel)
        } catch (error) {
            const message = getErrorMessage(error, WHATSAPP_PROVIDER_DISCONNECT_FAILED_ERROR)

            if (
                message === WHATSAPP_COEXISTENCE_DISCONNECT_REQUIRED_ERROR
                || message === WHATSAPP_PROVIDER_DISCONNECT_FAILED_ERROR
            ) {
                return {
                    success: false,
                    error: message
                }
            }

            return {
                success: false,
                error: getErrorMessage(error, 'Failed to disconnect channel')
            }
        }
    }

    const { error } = await supabase
        .from('channels')
        .delete()
        .eq('id', channelId)

    if (error) {
        console.error('Error disconnecting channel:', error)
        return {
            success: false,
            error: getErrorMessage(error, 'Failed to disconnect channel')
        }
    }

    revalidatePath('/settings/channels')
    return { success: true }
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
        const connectionState = getChannelConnectionState(channel)
        const webhookStatus = getWhatsAppWebhookStatus(channel.config)
        return {
            success: true,
            info: {
                phone_number_id: phoneNumberId,
                verify_token_set: Boolean(verifyToken),
                connection_state: connectionState,
                webhook_status: webhookStatus,
                webhook_callback_uri: readConfigString(channel.config, 'webhook_callback_uri'),
                webhook_subscription_requested_at: readConfigString(channel.config, 'webhook_subscription_requested_at'),
                webhook_subscription_error: readConfigString(channel.config, 'webhook_subscription_error'),
                webhook_verified_at: readConfigString(channel.config, 'webhook_verified_at'),
                display_phone_number: phoneDetails.display_phone_number ?? null,
                verified_name: phoneDetails.verified_name ?? null,
                quality_rating: phoneDetails.quality_rating ?? null
            }
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Failed to read WhatsApp channel info') }
    }
}

export async function listWhatsAppMessageTemplates(channelId: string): Promise<WhatsAppTemplateListResult> {
    const supabase = await createClient()

    const { data: channel } = await supabase
        .from('channels')
        .select('*')
        .eq('id', channelId)
        .single()

    const accessToken = channel && channel.type === 'whatsapp'
        ? readConfigString(channel.config, 'permanent_access_token')
        : null
    const businessAccountId = channel && channel.type === 'whatsapp'
        ? readConfigString(channel.config, 'business_account_id')
        : null

    if (!channel || channel.type !== 'whatsapp' || !accessToken || !businessAccountId) {
        return { success: false, error: 'Channel not found or not whatsapp' }
    }

    try {
        const client = new WhatsAppClient(accessToken)
        const response = await client.getMessageTemplates(businessAccountId)
        const templates = (response.data ?? [])
            .map(normalizeTemplateSummary)
            .filter((item): item is WhatsAppTemplateSummary => item !== null)

        return { success: true, templates }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Failed to list WhatsApp templates') }
    }
}

export async function sendWhatsAppTemplateMessage(input: SendWhatsAppTemplateMessageInput): Promise<SendWhatsAppTemplateMessageResult> {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)

    const channelId = input.channelId.trim()
    const to = input.to.trim()
    const templateName = input.templateName.trim()
    const languageCode = input.languageCode.trim()
    const bodyParameters = (input.bodyParameters ?? [])
        .map(value => value.trim())
        .filter(Boolean)

    if (!channelId || !to || !templateName || !languageCode) {
        return { success: false, error: 'Missing required template message fields.' }
    }

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

    if (!channel || channel.type !== 'whatsapp' || !accessToken || !phoneNumberId) {
        return { success: false, error: 'Channel not found or not whatsapp' }
    }

    try {
        const client = new WhatsAppClient(accessToken)
        const response = await client.sendTemplate({
            phoneNumberId,
            to,
            templateName,
            languageCode,
            bodyParameters
        })

        return {
            success: true,
            messageId: response.messages?.[0]?.id ?? null
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Failed to send WhatsApp template message') }
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
        const candidate = await resolveMetaInstagramConnectionCandidate(pageAccessToken)
        if (!candidate) {
            return { success: false, error: 'Unable to resolve Instagram account from current access token' }
        }

        return {
            success: true,
            info: {
                connection_state: getChannelConnectionState(channel),
                instagram_business_account_id: instagramBusinessAccountId,
                page_id: pageId,
                verify_token_set: Boolean(verifyToken),
                webhook_status: getMetaWebhookStatus(channel.config),
                webhook_subscription_requested_at: readConfigString(channel.config, 'webhook_subscription_requested_at'),
                webhook_subscribed_fields: readConfigStringArray(channel.config, 'webhook_subscribed_fields'),
                webhook_verified_at: readConfigString(channel.config, 'webhook_verified_at'),
                webhook_subscription_error: readConfigString(channel.config, 'webhook_subscription_error'),
                username: candidate.instagramUsername ?? null,
                page_name: candidate.pageName,
                resolved_instagram_business_account_id: candidate.instagramBusinessAccountId,
                resolved_page_id: candidate.pageId,
                token_subject_matches_channel: candidate.instagramBusinessAccountId === instagramBusinessAccountId
            }
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Failed to read Instagram channel info') }
    }
}
