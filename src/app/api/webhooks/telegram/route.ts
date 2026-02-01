import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TelegramClient } from '@/lib/telegram/client'
import { matchSkills } from '@/lib/skills/actions'
import { v4 as uuidv4 } from 'uuid'

export async function POST(req: NextRequest) {
    const secretToken = req.headers.get('x-telegram-bot-api-secret-token')
    const update = await req.json()

    console.log('Telegram Webhook: Received update', {
        updateId: update.update_id,
        hasMessage: !!update.message,
        hasSecret: !!secretToken
    })

    // 1. Basic Validation
    if (!update.message || !update.message.text) {
        console.log('Telegram Webhook: Skipping non-text update')
        return NextResponse.json({ ok: true }) // Ignore non-text updates
    }

    const { chat, text, from } = update.message
    const chatId = chat.id.toString()

    console.log('Telegram Webhook: Processing message', {
        chatId,
        text,
        fromId: from.id
    })

    const supabase = await createClient()

    // 2. Find Channel by Bot Token (We need to verify which bot this is)
    let channel;

    if (secretToken) {
        const { data } = await supabase
            .from('channels')
            .select('*')
            .eq('config->>webhook_secret', secretToken)
            .single()
        channel = data
        console.log('Telegram Webhook: Channel lookup by secret', { found: !!data, channelId: data?.id })
    } else {
        console.warn('Telegram Webhook: Missing secret token')
    }

    if (!channel) {
        console.warn('Telegram Webhook: No matching channel found for secret')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = channel.organization_id

    // 3. Find or Create Conversation
    let { data: conversation } = await supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', orgId)
        .eq('platform', 'telegram')
        .eq('contact_phone', chatId) // Storing telegram chat_id in contact_phone for now
        .single()

    if (!conversation) {
        console.log('Telegram Webhook: Creating new conversation')
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
            console.error('Telegram Webhook: Failed to create conversation', error)
            return NextResponse.json({ error: 'DB Error' }, { status: 500 })
        }
        conversation = newConv
    } else {
        console.log('Telegram Webhook: Found existing conversation', conversation.id)
    }

    // 4. Save Incoming Message
    const { error: msgError } = await supabase.from('messages').insert({
        id: uuidv4(),
        conversation_id: conversation.id,
        sender_type: 'contact',
        content: text,
        metadata: { telegram_message_id: update.message.message_id }
    })

    if (msgError) {
        console.error('Telegram Webhook: Failed to save message', msgError)
    } else {
        console.log('Telegram Webhook: Message saved successfully')
    }

    // 5. Process AI Response (Skills)
    const matchedSkills = await matchSkills(text, orgId)
    const bestMatch = matchedSkills?.[0]

    console.log('Telegram Webhook: Skill match result', {
        found: !!bestMatch,
        skillId: bestMatch?.skill_id,
        similarity: bestMatch?.similarity
    })

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
        console.log('Telegram Webhook: Sent matched response')
    } else {
        // Fallback response for debugging/confirmation
        console.log('Telegram Webhook: No skill matched, sending fallback')
        const client = new TelegramClient(channel.config.bot_token)
        // Check language logic later, for now hardcoded English/Turkish or just generic
        // "Mesajınız alındı" (Message received)
        const fallbackText = "Mesajınızı aldım, ancak buna uygun bir yanıtım yok. (I received your message but I don't have a specific response for it.)"

        await client.sendMessage(chatId, fallbackText)

        // Also save this fallback interaction? Maybe not to clutter, strictly for debugging now.
        // Actually, saving it helps seeing it in Inbox
        await supabase.from('messages').insert({
            id: uuidv4(),
            conversation_id: conversation.id,
            sender_type: 'bot',
            content: fallbackText,
            metadata: { is_fallback: true }
        })
    }

    return NextResponse.json({ ok: true })
}
