import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TelegramClient } from '@/lib/telegram/client'
import { matchSkills } from '@/lib/skills/actions'
import { v4 as uuidv4 } from 'uuid'

export async function POST(req: NextRequest) {
    const secretToken = req.headers.get('x-telegram-bot-api-secret-token')
    const update = await req.json()

    // 1. Basic Validation
    if (!update.message || !update.message.text) {
        return NextResponse.json({ ok: true }) // Ignore non-text updates
    }

    const { chat, text, from } = update.message
    const chatId = chat.id.toString()

    const supabase = await createClient()

    // 2. Find Channel by Bot Token (We need to verify which bot this is)
    // Telegram doesn't send the bot token in the webhook body, it sends it in the URL if we configured it so.
    // However, we used a common URL. 
    // Secure way: We send `webhook_secret` when setting webhook, and Telegram sends it back in header.
    // We need to find the channel with this secret.

    // If we didn't save secret (old code), we might have an issue. New code saves it.

    let channel;

    if (secretToken) {
        const { data } = await supabase
            .from('channels')
            .select('*')
            .eq('config->>webhook_secret', secretToken)
            .single()
        channel = data
    }

    // Fallback or if secret logic fails/isn't set up yet? 
    // If strictly enforcing security, we abort.
    if (!channel) {
        console.warn('Telegram Webhook: No matching channel found for secret')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = channel.organization_id

    // 3. Find or Create Conversation
    // Helper to normalize phone/id. Telegram ID is numeric string.

    let { data: conversation } = await supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', orgId)
        .eq('platform', 'telegram')
        .eq('contact_phone', chatId) // Storing telegram chat_id in contact_phone for now
        .single()

    if (!conversation) {
        const { data: newConv, error } = await supabase
            .from('conversations')
            .insert({
                id: uuidv4(),
                organization_id: orgId,
                platform: 'telegram',
                contact_name: `${from.first_name} ${from.last_name || ''}`.trim(),
                contact_phone: chatId,
                status: 'open',
                unread_count: 0
            })
            .select()
            .single()

        if (error) {
            console.error('Failed to create conversation', error)
            return NextResponse.json({ error: 'DB Error' }, { status: 500 })
        }
        conversation = newConv
    }

    // 4. Save Incoming Message
    await supabase.from('messages').insert({
        id: uuidv4(),
        conversation_id: conversation.id,
        sender_type: 'contact',
        content: text,
        metadata: { telegram_message_id: update.message.message_id }
    })

    // 5. Process AI Response (Skills)
    // We can run this async or await it. Awaiting is safer for now.

    const matchedSkills = await matchSkills(text, orgId)
    const bestMatch = matchedSkills?.[0]

    if (bestMatch) {
        // Send Response via Telegram
        const client = new TelegramClient(channel.config.bot_token)
        await client.sendMessage(chatId, bestMatch.response_text)

        // Save Bot Message
        await supabase.from('messages').insert({
            id: uuidv4(),
            conversation_id: conversation.id,
            sender_type: 'bot',
            content: bestMatch.response_text,
            metadata: { skill_id: bestMatch.skill_id }
        })
    } else {
        // Optional: Default fallback or silent? 
        // For now silent.
    }

    return NextResponse.json({ ok: true })
}
