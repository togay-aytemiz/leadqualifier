import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TelegramClient } from '@/lib/telegram/client'
import { matchSkills } from '@/lib/skills/actions'
import { buildRagContext } from '@/lib/knowledge-base/rag'
import { decideKnowledgeBaseRoute } from '@/lib/knowledge-base/router'
import { v4 as uuidv4 } from 'uuid'

export async function POST(req: NextRequest) {
    const headerSecret = req.headers.get('x-telegram-bot-api-secret-token')
    const querySecret = req.nextUrl.searchParams.get('secret')
    const secretToken = headerSecret || querySecret

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

    // Use Service Role Key (Admin) to bypass RLS
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

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
    // 3. Find or Create Conversation
    let { data: conversation } = await supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', orgId)
        .eq('platform', 'telegram')
        .eq('contact_phone', chatId.toString()) // Storing telegram chat_id in contact_phone for now
        .limit(1)
        .maybeSingle()

    if (!conversation) {
        console.log('Telegram Webhook: Creating new conversation (not found)')
        const { data: newConv, error } = await supabase
            .from('conversations')
            .insert({
                id: uuidv4(),
                organization_id: orgId,
                platform: 'telegram',
                contact_name: `${from.first_name} ${from.last_name || ''}`.trim(),
                contact_phone: chatId.toString(),
                status: 'open',
                unread_count: 0
            })
            .select()
            .single()

        if (error) {
            // Check for Unique Violation (Postgres code 23505)
            // This happens if a conversation was created by another request in the split second between our select and insert
            // or if the unique index prevents our insert.
            if (error.code === '23505') {
                console.log('Telegram Webhook: Unique violation (race condition), refetching existing conversation')
                const { data: existingRetry } = await supabase
                    .from('conversations')
                    .select('*')
                    .eq('organization_id', orgId)
                    .eq('platform', 'telegram')
                    .eq('contact_phone', chatId.toString())
                    .single()

                if (existingRetry) {
                    conversation = existingRetry
                } else {
                    console.error('Telegram Webhook: Failed to refetch after unique violation')
                    return NextResponse.json({ error: 'DB Error' }, { status: 500 })
                }
            } else {
                console.error('Telegram Webhook: Failed to create conversation', error)
                return NextResponse.json({ error: 'DB Error' }, { status: 500 })
            }
        } else {
            conversation = newConv
        }
    } else {
        console.log('Telegram Webhook: Found existing conversation', conversation.id)
    }

    // 4. Save Incoming Message
    const { error: msgError } = await supabase.from('messages').insert({
        id: uuidv4(),
        conversation_id: conversation.id,
        organization_id: orgId,
        sender_type: 'contact',
        content: text,
        metadata: { telegram_message_id: update.message.message_id }
    })

    if (msgError) {
        console.error('Telegram Webhook: Failed to save message', msgError)
    } else {
        console.log('Telegram Webhook: Message saved successfully')

        // Update conversation: Bump timestamp + increment unread count for user messages
        await supabase.from('conversations')
            .update({
                last_message_at: new Date().toISOString(),
                unread_count: conversation.unread_count + 1,
                updated_at: new Date().toISOString()
            })
            .eq('id', conversation.id)
    }

    // 5. Check Active Agent Status (Zero-Cost Check)
    // We now use an explicit column on the conversation table.
    // If active_agent is 'operator', we skip all AI processing immediately.

    // Note: We need to ensure 'active_agent' is selected in step 3.
    // Since we selected '*', it should be there.

    console.log('Telegram Webhook: Checking Active Agent', {
        conversationId: conversation.id,
        activeAgent: conversation.active_agent,
        assigneeId: conversation.assignee_id
    })

    // Skip AI if Operator is explicitly active OR if an operator is assigned
    if (conversation.active_agent === 'operator' || conversation.assignee_id) {
        console.log('Telegram Webhook: Operator active or Assigned. SKIPPING AI REPLY.')
        return NextResponse.json({ ok: true })
    }

    // 6. Process AI Response (Skills)
    const matchedSkills = await matchSkills(text, orgId, 0.5, 5, supabase)
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
            organization_id: orgId,
            sender_type: 'bot',
            content: bestMatch.response_text,
            metadata: { skill_id: bestMatch.skill_id }
        })
        console.log('Telegram Webhook: Sent matched response')

        // Update conversation timestamp (No unread increment for bot replies)
        await supabase.from('conversations')
            .update({
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', conversation.id)

        return NextResponse.json({ ok: true })
    } else {
        // 7. Fallback: Check Knowledge Base (RAG)
        console.log('Telegram Webhook: No skill matched, searching Knowledge Base...')

        try {
            const { searchKnowledgeBase } = await import('@/lib/knowledge-base/actions') // Dynamically import to avoid circular dep if any
            const { data: recentMessages, error: historyError } = await supabase
                .from('messages')
                .select('sender_type, content, created_at')
                .eq('conversation_id', conversation.id)
                .order('created_at', { ascending: false })
                .limit(4)

            if (historyError) {
                console.warn('Telegram Webhook: Failed to load history for KB routing', historyError)
            }

            const trimmedHistory = (recentMessages ?? []).filter((msg, index) => {
                if (index !== 0) return true
                return !(msg.sender_type === 'contact' && msg.content === text)
            })

            const history = trimmedHistory
                .slice(0, 3)
                .reverse()
                .filter((msg) => typeof msg.content === 'string' && msg.content.trim().length > 0)
                .map((msg) => ({
                    role: msg.sender_type === 'contact' ? 'user' : 'assistant',
                    content: msg.content
                }))

            const decision = await decideKnowledgeBaseRoute(text, history)

            if (decision.route_to_kb) {
                const query = decision.rewritten_query || text
                const kbResults = await searchKnowledgeBase(query, orgId, 0.5, 6, { supabase })

                if (kbResults && kbResults.length > 0) {
                    console.log('Telegram Webhook: Knowledge Base match found', { count: kbResults.length })

                    const { context, chunks } = buildRagContext(kbResults)
                    if (!context) {
                        throw new Error('RAG context is empty')
                    }

                    const noAnswerToken = 'NO_ANSWER'
                    const { default: OpenAI } = await import('openai')
                    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

                    const systemPrompt = `You are a helpful assistant for a business. 
Answer the user's question based strictly on the provided context below. 
If the answer is not in the context, respond with "${noAnswerToken}" and do not make up facts.
Keep the answer concise and friendly (in Turkish or English depending on user).

Context:
${context}`

                    const completion = await openai.chat.completions.create({
                        model: 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: text }
                        ],
                        temperature: 0.3
                    })

                    const ragResponse = completion.choices[0]?.message?.content?.trim()

                    if (ragResponse && !ragResponse.includes(noAnswerToken)) {
                        const client = new TelegramClient(channel.config.bot_token)
                        await client.sendMessage(chatId, ragResponse)

                        // Save Bot Message (RAG)
                        await supabase.from('messages').insert({
                            id: uuidv4(),
                            conversation_id: conversation.id,
                            organization_id: orgId,
                            sender_type: 'bot',
                            content: ragResponse,
                            metadata: { is_rag: true, sources: chunks.map(r => r.document_id).filter(Boolean) }
                        })

                        // Update conversation
                        await supabase.from('conversations')
                            .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                            .eq('id', conversation.id)

                        return NextResponse.json({ ok: true })
                    }
                }
            } else {
                console.log('Telegram Webhook: KB routing declined', { reason: decision.reason })
            }
        } catch (error) {
            console.error('Telegram Webhook: RAG error', error)
        }

        // 8. Final Fallback (No Skill, No Knowledge)
        console.log('Telegram Webhook: No knowledge match, sending fallback')
        const client = new TelegramClient(channel.config.bot_token)
        const fallbackText = "Mesajınızı aldım. Şu an buna yanıt veremiyorum ancak sizi bir yetkiliye bağlıyorum. (I received your message but I don't have an answer instantly. Connecting you to a human.)"

        await client.sendMessage(chatId, fallbackText)

        // Save final fallback
        await supabase.from('messages').insert({
            id: uuidv4(),
            conversation_id: conversation.id,
            organization_id: orgId,
            sender_type: 'bot',
            content: fallbackText,
            metadata: { is_fallback: true }
        })

        await supabase.from('conversations')
            .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', conversation.id)

        return NextResponse.json({ ok: true })
    }
}
