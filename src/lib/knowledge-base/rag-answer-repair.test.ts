import { describe, expect, it } from 'vitest'

import { repairLinkOnlyRagAnswer } from '@/lib/knowledge-base/rag-answer-repair'

describe('repairLinkOnlyRagAnswer', () => {
    it('repairs link-only purpose answers from the retrieved regulation article', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Daha fazla bilgi için buraya göz atabilirsin: https://example.edu.tr/etik.pdf',
            userMessage: 'Bilimsel Araştırma ve Yayın Etiği Yönergesinin amacı nedir?',
            responseLanguage: 'tr',
            chunks: [
                {
                    content: 'Page Title: Yükseköğretim Kurumları Bilimsel Araştırma ve Yayın Etiği Yönergesi Source URL: https://example.edu.tr/etik.pdf BİRİNCİ BÖLÜM Amaç, Kapsam, Dayanak Amaç Madde 1 - (1) Bu Yönerge, bilimsel araştırma, çalışma, yayın ve etkinliklerde uyulması gereken etik kurallarını ve bilimsel araştırma ve yayın etiği kurullarının görev, yetki ve sorumluluklarını düzenler. Kapsam Madde 2 - (1) Bu Yönerge diğer hükümleri kapsar.'
                }
            ]
        })

        expect(repaired).toContain('Bu yönergenin amacı')
        expect(repaired).toContain('bilimsel araştırma')
        expect(repaired).toContain('etik kurallarını')
        expect(repaired).toContain('yetki ve sorumluluklarını')
        expect(repaired).not.toMatch(/\bKapsam\s*$/i)
    })

    it('repairs line-break separated link-only purpose answers from the retrieved regulation article', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: [
                'Daha fazla bilgi için buraya göz atabilirsin:',
                'https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/8ca60ba8af71f57623c2db617f078bee.pdf'
            ].join('\n'),
            userMessage: 'Bilimsel Araştırma ve Yayın Etiği Yönergesinin amacı nedir?',
            responseLanguage: 'tr',
            chunks: [
                {
                    content: 'Page Title: Yükseköğretim Kurumları Bilimsel Araştırma ve Yayın Etiği Yönergesi Source URL: https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/8ca60ba8af71f57623c2db617f078bee.pdf Section: Main content YÜKSEKÖĞRETİM KURUMLARI BİLİMSEL ARAŞTIRMA VE YAYIN ETİĞİ YÖNERGESİ BİRİNCİ BÖLÜM Amaç, Kapsam, Dayanak Amaç Madde 1 - (1) Bu Yönerge, bilimsel araştırma, çalışma, yayın ve etkinliklerde uyulması gereken etik kurallarını ve yükseköğretim kurumlarının kendi bünyelerinde oluşturacakları bilimsel araştırma ve yayın etiği kurullarının görev, yetki ve sorumluluklarını düzenler. Kapsam Madde 2 - (1) Bu Yönerge diğer hükümleri kapsar.'
                }
            ]
        })

        expect(repaired).toContain('Bu yönergenin amacı')
        expect(repaired).toContain('bilimsel araştırma')
        expect(repaired).toContain('etik kurallarını')
        expect(repaired).toContain('yetki ve sorumluluklarını')
    })

    it('repairs link-only scope answers from the retrieved regulation article', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Detaylı bilgi için buraya göz atabilirsiniz: https://example.edu.tr/isg.pdf',
            userMessage: 'İş Sağlığı ve Güvenliği İç Yönergesi hangi birimleri kapsıyor?',
            responseLanguage: 'tr',
            chunks: [
                {
                    content: 'İŞ SAĞLIĞI VE GÜVENLİĞİ İÇ YÖNERGESİ Amaç MADDE 1 – (1) Amaç metni. Kapsam MADDE 2 – (1) Bu Yönerge, Yüksek İhtisas Üniversitesi’nin tüm birimleri ve bunlara bağlı bina ve eklentileri ile işveren, işveren vekili, çalışanlar, stajyerler, öğrenci statüsünde çalışanlar, alt işverenler ile çalışanları ve geçici iş ilişkisi kurulanları kapsar. Dayanak MADDE 3 – Dayanak metni.'
                }
            ]
        })

        expect(repaired).toContain('Bu yönergenin kapsamı')
        expect(repaired).toContain('tüm birimleri')
        expect(repaired).toContain('bina ve eklentileri')
    })

    it('repairs too-short scope answers when the retrieved article has more specific coverage', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'İş Sağlığı ve Güvenliği İç Yönergesi, Yüksek İhtisas Üniversitesi’nin tüm birimlerini kapsar. Başka bir konuda yardımcı olabilir miyim?',
            userMessage: 'İş Sağlığı ve Güvenliği İç Yönergesi hangi birimleri kapsıyor?',
            responseLanguage: 'tr',
            chunks: [
                {
                    content: 'İŞ SAĞLIĞI VE GÜVENLİĞİ İÇ YÖNERGESİ Amaç MADDE 1 – (1) Amaç metni. Kapsam MADDE 2 – (1) Bu Yönerge, Yüksek İhtisas Üniversitesi’nin tüm birimleri ve bunlara bağlı bina ve eklentileri ile işveren, işveren vekili, çalışanlar, stajyerler, öğrenci statüsünde çalışanlar, alt işverenler ile çalışanları ve geçici iş ilişkisi kurulanları kapsar. Dayanak MADDE 3 – Dayanak metni.'
                }
            ]
        })

        expect(repaired).toContain('Bu yönergenin kapsamı')
        expect(repaired).toContain('tüm birimleri')
        expect(repaired).toContain('bina ve eklentileri')
        expect(repaired).toContain('stajyerler')
        expect(repaired).not.toMatch(/\bDayanak\s*$/i)
    })

    it('leaves factual answers unchanged', () => {
        const response = 'Bu yönergenin amacı, etik kuralları ve kurul sorumluluklarını düzenlemektir.'
        const repaired = repairLinkOnlyRagAnswer({
            response,
            userMessage: 'Bilimsel Araştırma ve Yayın Etiği Yönergesinin amacı nedir?',
            responseLanguage: 'tr',
            chunks: []
        })

        expect(repaired).toBe(response)
    })
})
