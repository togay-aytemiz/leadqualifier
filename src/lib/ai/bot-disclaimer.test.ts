import { describe, expect, it } from 'vitest'
import {
    applyBotMessageDisclaimer,
    DEFAULT_BOT_DISCLAIMER_MESSAGE_EN,
    DEFAULT_BOT_DISCLAIMER_MESSAGE_TR
} from './bot-disclaimer'

describe('applyBotMessageDisclaimer', () => {
    it('returns original message when disclaimer is disabled', () => {
        const result = applyBotMessageDisclaimer({
            message: 'Merhaba',
            responseLanguage: 'tr',
            settings: {
                bot_disclaimer_enabled: false,
                bot_disclaimer_message_tr: DEFAULT_BOT_DISCLAIMER_MESSAGE_TR,
                bot_disclaimer_message_en: DEFAULT_BOT_DISCLAIMER_MESSAGE_EN
            }
        })

        expect(result).toBe('Merhaba')
    })

    it('appends Turkish blockquote disclaimer with one blank line when enabled', () => {
        const result = applyBotMessageDisclaimer({
            message: 'Merhaba',
            responseLanguage: 'tr',
            settings: {
                bot_disclaimer_enabled: true,
                bot_disclaimer_message_tr: 'Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.',
                bot_disclaimer_message_en: 'Unused'
            }
        })

        expect(result).toBe('Merhaba\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')
    })

    it('falls back to EN default message when english custom text is blank', () => {
        const result = applyBotMessageDisclaimer({
            message: 'Hello there',
            responseLanguage: 'en',
            settings: {
                bot_disclaimer_enabled: true,
                bot_disclaimer_message_tr: 'Kullanılmıyor',
                bot_disclaimer_message_en: '   '
            }
        })

        expect(result).toBe(`Hello there\n\n> ${DEFAULT_BOT_DISCLAIMER_MESSAGE_EN}`)
    })
})
