import { describe, expect, it } from 'vitest'

import { filterDemoChatBotReplyDuplicates } from './demoChatDuplicates'

describe('filterDemoChatBotReplyDuplicates', () => {
  it('keeps one bot text reply per demo chat inbound message', () => {
    const filtered = filterDemoChatBotReplyDuplicates([
      {
        id: 'contact-message',
        sender_type: 'contact',
        content: 'sağlık raporu vermeden mazeret sınavına giremez miyim?',
        metadata: {
          demo_chat_message_id: 'demo-message-1',
        },
      },
      {
        id: 'bot-reply-1',
        sender_type: 'bot',
        content: 'Evet, sağlık raporu olmadan mazeret sınavına giremezsin.',
        metadata: {
          demo_chat_reply_to_message_id: 'demo-message-1',
          demo_chat_reply_kind: 'text',
        },
      },
      {
        id: 'bot-reply-2',
        sender_type: 'bot',
        content: 'Evet, sağlık raporu olmadan mazeret sınavına giremezsin.',
        metadata: {
          demo_chat_reply_to_message_id: 'demo-message-1',
          demo_chat_reply_kind: 'text',
        },
      },
      {
        id: 'next-bot-reply',
        sender_type: 'bot',
        content: 'İkinci sorunun cevabı.',
        metadata: {
          demo_chat_reply_to_message_id: 'demo-message-2',
          demo_chat_reply_kind: 'text',
        },
      },
    ] as never)

    expect(filtered.map((message) => message.id)).toEqual([
      'contact-message',
      'bot-reply-1',
      'next-bot-reply',
    ])
  })

  it('does not collapse image and text replies for the same demo chat inbound message', () => {
    const filtered = filterDemoChatBotReplyDuplicates([
      {
        id: 'bot-text',
        sender_type: 'bot',
        content: 'Detayları aşağıdaki görselde görebilirsiniz.',
        metadata: {
          demo_chat_reply_to_message_id: 'demo-message-1',
          demo_chat_reply_kind: 'text',
        },
      },
      {
        id: 'bot-image',
        sender_type: 'bot',
        content: '[Yetenek görseli]',
        metadata: {
          demo_chat_reply_to_message_id: 'demo-message-1',
          demo_chat_message_type: 'image',
          demo_chat_media_type: 'image',
        },
      },
    ] as never)

    expect(filtered.map((message) => message.id)).toEqual(['bot-text', 'bot-image'])
  })
})
