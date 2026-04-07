import { describe, expect, it } from 'vitest'

import { filterInstagramEchoDuplicates } from './instagramEchoDuplicates'

describe('filterInstagramEchoDuplicates', () => {
  it('removes instagram echo duplicates when a bot message already has the same provider id', () => {
    const filtered = filterInstagramEchoDuplicates([
      {
        id: 'msg-bot',
        sender_type: 'bot',
        metadata: {
          instagram_message_id: 'ig-outbound-1',
        },
      },
      {
        id: 'msg-echo',
        sender_type: 'user',
        metadata: {
          instagram_is_echo: true,
          instagram_message_id: 'ig-outbound-1',
        },
      },
    ] as never)

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.id).toBe('msg-bot')
  })

  it('keeps standalone external instagram echoes without a matching bot message id', () => {
    const filtered = filterInstagramEchoDuplicates([
      {
        id: 'msg-echo',
        sender_type: 'user',
        metadata: {
          instagram_is_echo: true,
          instagram_message_id: 'ig-outbound-2',
        },
      },
    ] as never)

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.id).toBe('msg-echo')
  })

  it('removes legacy instagram echo duplicates when the bot row has matching AI content but no provider id', () => {
    const filtered = filterInstagramEchoDuplicates([
      {
        id: 'msg-bot',
        sender_type: 'bot',
        content:
          'Aşağıda fiyatla ilgili detayların olduğu görseli görebilirsiniz\n\n------\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.',
        created_at: '2026-04-07T13:52:11.154109+00:00',
        metadata: {},
      },
      {
        id: 'msg-echo',
        sender_type: 'user',
        content:
          'Aşağıda fiyatla ilgili detayların olduğu görseli görebilirsiniz\n\n------\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.',
        created_at: '2026-04-07T13:52:19.048188+00:00',
        metadata: {
          instagram_is_echo: true,
          instagram_message_id: 'ig-outbound-legacy-1',
        },
      },
    ] as never)

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.id).toBe('msg-bot')
  })

  it('removes instagram image echo duplicates near a bot skill image placeholder when provider ids are missing', () => {
    const filtered = filterInstagramEchoDuplicates([
      {
        id: 'msg-bot-image',
        sender_type: 'bot',
        content: '[Yetenek görseli]',
        created_at: '2026-04-07T14:20:38.065147+00:00',
        metadata: {
          skill_has_image: true,
          instagram_media_type: 'image',
          instagram_is_media_placeholder: true,
          instagram_media: {
            type: 'image',
            storage_url: 'https://project.supabase.co/storage/v1/object/public/skill-images/org-1/skill-image.jpg',
          },
        },
      },
      {
        id: 'msg-echo-image',
        sender_type: 'user',
        content: '[Instagram image]',
        created_at: '2026-04-07T14:20:44.567501+00:00',
        metadata: {
          instagram_is_echo: true,
          instagram_event_type: 'attachment',
          instagram_media_type: 'image',
          instagram_media: {
            type: 'image',
            storage_url: 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1311638860855616',
          },
        },
      },
    ] as never)

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.id).toBe('msg-bot-image')
  })
})
