import { describe, expect, it } from 'vitest'
import { formatOutboundTextForChannel } from './outbound-text-format'

describe('formatOutboundTextForChannel', () => {
    it('converts double-star emphasis to WhatsApp single-star emphasis and keeps full URLs', () => {
        const formatted = formatOutboundTextForChannel(
            '**Tıp Fakültesi:** Detaylar için [sayfayı aç](https://example.com/tip).',
            { platform: 'whatsapp' }
        )

        expect(formatted).toBe('*Tıp Fakültesi:* Detaylar için sayfayı aç: https://example.com/tip.')
    })

    it('removes markdown markers for Instagram while keeping full URLs', () => {
        const formatted = formatOutboundTextForChannel(
            '**Tıp Fakültesi:**\n> Detaylar için [sayfayı aç](https://example.com/tip).',
            { platform: 'instagram' }
        )

        expect(formatted).toBe('Tıp Fakültesi:\nDetaylar için sayfayı aç: https://example.com/tip.')
    })

    it('turns inline dash-separated list items into readable message bullets', () => {
        const formatted = formatOutboundTextForChannel(
            'Eğitim süreci şu şekildedir: - **Dersler:** Temel tıp bilimleri verilir. - **Klinik Beceri Eğitimi:** Birinci sınıftan itibaren başlar.',
            { platform: 'instagram' }
        )

        expect(formatted).toBe(
            'Eğitim süreci şu şekildedir:\n- Dersler: Temel tıp bilimleri verilir.\n- Klinik Beceri Eğitimi: Birinci sınıftan itibaren başlar.'
        )
    })

    it('sends Telegram as plain text when parse mode is not configured', () => {
        const formatted = formatOutboundTextForChannel(
            '**Tıp Fakültesi:**\n- [Detay](https://example.com/tip)',
            { platform: 'telegram' }
        )

        expect(formatted).toBe('Tıp Fakültesi:\n- Detay: https://example.com/tip')
    })

    it('keeps Telegram markdown when a parse mode is configured', () => {
        const formatted = formatOutboundTextForChannel(
            '**Tıp Fakültesi:**\n- [Detay](https://example.com/tip)',
            { platform: 'telegram', telegramParseMode: 'Markdown' }
        )

        expect(formatted).toBe('**Tıp Fakültesi:**\n- [Detay](https://example.com/tip)')
    })

    it.each([
        {
            name: 'program list',
            platform: 'whatsapp' as const,
            raw: '**Akademik Birimler:** - **Tıp Fakültesi** - **Sağlık Bilimleri Fakültesi** - **Sağlık Hizmetleri MYO**',
            expected: '*Akademik Birimler:*\n- *Tıp Fakültesi*\n- *Sağlık Bilimleri Fakültesi*\n- *Sağlık Hizmetleri MYO*'
        },
        {
            name: 'medicine education summary',
            platform: 'whatsapp' as const,
            raw: 'Eğitim süreci şu şekildedir: - **Dersler:** Temel tıp bilimleri verilir. - **Klinik Beceri Eğitimi:** Birinci sınıftan itibaren başlar. - **Staj ve Klinik Uygulamalar:** Sağlık kuruluşlarında yapılır.',
            expected: 'Eğitim süreci şu şekildedir:\n- *Dersler:* Temel tıp bilimleri verilir.\n- *Klinik Beceri Eğitimi:* Birinci sınıftan itibaren başlar.\n- *Staj ve Klinik Uygulamalar:* Sağlık kuruluşlarında yapılır.'
        },
        {
            name: 'horizontal transfer link',
            platform: 'instagram' as const,
            raw: '**Yatay geçiş** başvuruları için [resmi sayfayı](https://example.edu.tr/yatay-gecis) inceleyebilirsiniz.',
            expected: 'Yatay geçiş başvuruları için resmi sayfayı: https://example.edu.tr/yatay-gecis inceleyebilirsiniz.'
        },
        {
            name: 'erasmus requirements',
            platform: 'telegram' as const,
            raw: '**Erasmus şartları:** - **Lisans:** En az 2.20/4.00 GANO. - **Yüksek lisans/doktora:** En az 2.50/4.00 GANO.',
            expected: 'Erasmus şartları:\n- Lisans: En az 2.20/4.00 GANO.\n- Yüksek lisans/doktora: En az 2.50/4.00 GANO.'
        },
        {
            name: 'fees link',
            platform: 'instagram' as const,
            raw: '> Güncel ücretler için [ücretler sayfasına](https://example.edu.tr/ucretler) bakabilirsiniz.',
            expected: 'Güncel ücretler için ücretler sayfasına: https://example.edu.tr/ucretler bakabilirsiniz.'
        }
    ])('formats RAG-like outgoing answer: $name', ({ platform, raw, expected }) => {
        expect(formatOutboundTextForChannel(raw, { platform })).toBe(expected)
    })
})
