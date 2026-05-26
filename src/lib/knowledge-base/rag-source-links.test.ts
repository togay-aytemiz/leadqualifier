import { describe, expect, it } from 'vitest'

import { appendCanonicalRagSourceLinks } from '@/lib/knowledge-base/rag-source-links'

describe('appendCanonicalRagSourceLinks', () => {
    it('removes malformed spaced source URL fragments before appending canonical source links', () => {
        const response = 'https://yuksekihtisasuniversitesi. edu. tr/iletisim Başka bir konuda yardımcı olabilir miyim?'

        const formatted = appendCanonicalRagSourceLinks(response, [{
            source_url: 'https://yuksekihtisasuniversitesi.edu.tr/iletisim'
        }])

        expect(formatted).toBe('Başka bir konuda yardımcı olabilir miyim?\nhttps://yuksekihtisasuniversitesi.edu.tr/iletisim')
        expect(formatted).not.toContain('edu. tr')
    })

    it('can limit forced source-link answers to the single best source', () => {
        const formatted = appendCanonicalRagSourceLinks('Sayfa burada:', [
            { source_url: 'https://yuksekihtisasuniversitesi.edu.tr/akademik-takvim' },
            { source_url: 'https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/spor-bilimleri-fakultesi/akademik-takvim' }
        ], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Sayfa burada:\nhttps://yuksekihtisasuniversitesi.edu.tr/akademik-takvim')
    })

    it('removes scheme-less spaced source fragments before appending canonical source links', () => {
        const response = [
            'Sağlık raporu olmadığı halde sınava giren öğrencinin sınavı geçersiz sayılır.',
            'edu. tr/Uploads/icerik_yonetimi_view/d9c23f27ab20bbdca2e4ffeb8b8fb9bb. pdf'
        ].join(' ')

        const formatted = appendCanonicalRagSourceLinks(response, [{
            source_url: 'https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/d9c23f27ab20bbdca2e4ffeb8b8fb9bb.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Sağlık raporu olmadığı halde sınava giren öğrencinin sınavı geçersiz sayılır.\nhttps://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/d9c23f27ab20bbdca2e4ffeb8b8fb9bb.pdf')
        expect(formatted).not.toContain('edu. tr')
    })

    it('normalizes model-written multiple raw URLs to one URL when chunk metadata is unavailable', () => {
        const response = [
            'Akademik takvim linki:',
            'https://yuksekihtisasuniversitesi.edu.tr/akademik-takvim',
            'https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/spor-bilimleri-fakultesi/akademik-takvim'
        ].join(' ')

        const formatted = appendCanonicalRagSourceLinks(response, [], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Akademik takvim linki:\nhttps://yuksekihtisasuniversitesi.edu.tr/akademik-takvim')
    })

    it('removes orphan path fragments before appending the canonical source link', () => {
        const response = [
            'Detaylı bilgi için buraya göz atabilirsin:',
            'üksekokulu/cift-anadal-programlari',
            'https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/yuksekokullar/saglik-hizmetleri-meslek-yuksekokulu/cift-anadal-programlari'
        ].join(' ')

        const formatted = appendCanonicalRagSourceLinks(response, [{
            source_url: 'https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/yuksekokullar/saglik-hizmetleri-meslek-yuksekokulu/cift-anadal-programlari'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Detaylı bilgi için buraya göz atabilirsin:\nhttps://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/yuksekokullar/saglik-hizmetleri-meslek-yuksekokulu/cift-anadal-programlari')
        expect(formatted).not.toContain('üksekokulu/cift-anadal-programlari')
    })

    it('removes domain-only fragments left by malformed source links', () => {
        const formatted = appendCanonicalRagSourceLinks('Mazeret sınavına girebilirsiniz. edu. tr', [{
            source_url: 'https://yuksekihtisasuniversitesi.edu.tr/Uploads/akademik_view/icerik_yonetimi_view/1efd58697c84b44e7a58977222c363ce.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Mazeret sınavına girebilirsiniz.\nhttps://yuksekihtisasuniversitesi.edu.tr/Uploads/akademik_view/icerik_yonetimi_view/1efd58697c84b44e7a58977222c363ce.pdf')
        expect(formatted).not.toContain('edu. tr')
    })

    it('does not strip edu.tr inside email addresses while appending source links', () => {
        const formatted = appendCanonicalRagSourceLinks('E-posta: tlt@yiu.edu.tr', [{
            source_url: 'https://yuksekihtisasuniversitesi.edu.tr/iletisim'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('E-posta: tlt@yiu.edu.tr\nhttps://yuksekihtisasuniversitesi.edu.tr/iletisim')
    })

    it('prefers source URLs from chunks that contain concrete answer evidence', () => {
        const formatted = appendCanonicalRagSourceLinks('Tıbbi Laboratuvar Teknikleri e-posta adresi: tlt@yiu.edu.tr.', [
            {
                content: [
                    'Page Title: Yerleşke Konumları',
                    'Source URL: https://yuksekihtisasuniversitesi.edu.tr/duyuru/universitemizde-yeni-duzenleme-kapsaminda-yapilan-yerleske-konumlari-guncellendi',
                    '',
                    'Tıbbi Laboratuvar Teknikleri Balgat Yerleşkesi adresinde eğitim verir.'
                ].join('\n')
            },
            {
                content: [
                    'Page Title: İletişim',
                    'Source URL: https://yuksekihtisasuniversitesi.edu.tr/iletisim',
                    '',
                    'Tıbbi Laboratuvar Teknikleri Programı iletişim bilgisi: Telefon +90 312 329 10 10, e-posta tlt@yiu.edu.tr.'
                ].join('\n')
            }
        ], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Tıbbi Laboratuvar Teknikleri e-posta adresi: tlt@yiu.edu.tr.\nhttps://yuksekihtisasuniversitesi.edu.tr/iletisim')
    })
})
