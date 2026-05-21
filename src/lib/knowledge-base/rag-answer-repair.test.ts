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

    it('repairs link-only procedure-scope answers from the retrieved regulation purpose article', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Daha fazla bilgi için şu bağlantıya göz atabilirsin: https://example.edu.tr/satinalma.pdf',
            userMessage: 'Satın Alma ve İhale Yönetmeliği hangi alımlar için usul ve esas belirliyor?',
            responseLanguage: 'tr',
            chunks: [
                {
                    content: 'SATIN ALMA VE İHALE YÖNETMELİĞİ Amaç ve kapsam MADDE 1 - Bu Yönetmeliğin amacı; Yüksek İhtisas Üniversitesi tarafından yapılacak mal ve hizmet alım-satımları, yapım, taşınmaz alım-satım, kiralama, kiraya verme ve trampa işlemlerinde uygulanacak usul ve esasları belirlemektir. MADDE 2 - Bu Yönetmelik diğer hükümleri kapsar.'
                }
            ]
        })

        expect(repaired).toContain('mal ve hizmet')
        expect(repaired).toContain('usul ve esasları')
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

    it('does not treat abbreviation expansion questions as scope requests', () => {
        const response = 'BİDB, Bilgi İşlem Daire Başkanlığı anlamına gelir.'
        const repaired = repairLinkOnlyRagAnswer({
            response,
            userMessage: 'BİDB kısaltması hangi birimi ifade ediyor olabilir?',
            responseLanguage: 'tr',
            chunks: [
                {
                    content: 'BİDB Çalışma Usul ve Esasları Hakkındaki Yönerge Amaç MADDE 1 – Amaç. Kapsam MADDE 2 – Bu yönerge üniversite bilişim kaynaklarını kapsar.'
                }
            ]
        })

        expect(repaired).toBe(response)
    })

    it('repairs link-only abbreviation-title answers from the retrieved document title', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Daha fazla bilgi istersen, buradan ulaşabilirsin: https://example.edu.tr/bap.pdf',
            userMessage: 'BAP kısaltması hangi yönerge başlığında geçiyor?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Bilimsel Araştırma Projeleri Uygulama Yönergesi',
                    content: 'Page Title: Bilimsel Araştırma Projeleri Uygulama Yönergesi\nSource URL: https://example.edu.tr/bap.pdf\n\nDoküman No BAP.YNG.0001'
                }
            ]
        })

        expect(repaired).toContain('Bilimsel Araştırma Projeleri Uygulama Yönergesi')
    })

    it('repairs partial document-number answers from the retrieved document metadata', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'YNG. 0001dir. Başka bir konuda yardımcı olabilir miyim?',
            userMessage: 'Bilimsel Araştırma Projeleri Uygulama Yönergesinin doküman numarası nedir?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Bilimsel Araştırma Projeleri Uygulama Yönergesi',
                    content: 'Page Title: Bilimsel Araştırma Projeleri Uygulama Yönergesi\nDoküman No BAP. YNG. 0001\nYürürlük Tarihi 2025'
                }
            ]
        })

        expect(repaired).toContain('BAP.YNG.0001')
        expect(repaired).toContain('Bilimsel Araştırma Projeleri Uygulama Yönergesi')
    })

    it('adds the explicit Senato meeting number when the answer only includes the date', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Tıp Fakültesi Çevrimiçi Sınav Yönergesi, 06.06.2023 tarihinde yapılan Senato toplantısında kabul edilmiştir.',
            userMessage: 'Tıp Fakültesi Çevrimiçi Sınav Yönergesi hangi Senato toplantısında kabul edilmiş?',
            responseLanguage: 'tr',
            chunks: [
                {
                    content: 'Tıp Fakültesi Çevrimiçi Sınav Yönergesi 06.06.2023 tarihinde yapılan 13 sayılı Senato toplantısında kabul edilmiştir.'
                }
            ]
        })

        expect(repaired).toContain('13 sayılı Senato toplantısında')
    })

    it('adds the explicit Senato meeting number from decision table metadata', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Tıp Fakültesi Çevrimiçi Sınav Yönergesi, 06.06.2023 tarihinde yapılan Senato toplantısında kabul edilmiştir.',
            userMessage: 'Tıp Fakültesi Çevrimiçi Sınav Yönergesi hangi Senato toplantısında kabul edilmiş?',
            responseLanguage: 'tr',
            chunks: [
                {
                    content: 'KARAR TARİHİ: 06.06.2023 TOPLANTI SAYISI: 13 KARARLAR 2023/80 Tıp Fakültesi Çevrimiçi Sınav Yönergesi.'
                }
            ]
        })

        expect(repaired).toContain('13 sayılı Senato toplantısında')
    })

    it('repairs no-information answers when staff unpaid leave duration is explicit in the retrieved policy', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu konuda elimde net bilgi yok. Ücretsiz izin süresi hakkında detaylı bilgi almak için ilgili birimle iletişime geçmeni öneririm.',
            userMessage: 'personelin ücretsiz izin süresi ne kadar',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'İzin Kullanımı Yönergesi',
                    content: 'Page Title: İzin Kullanımı Yönergesi\nSource URL: https://example.edu.tr/izin.pdf\n\nMadde 11- Ücretsiz izinler aşağıdaki esaslara göre kullanılır. a) Ücretsiz izin süresi en fazla 1 (bir) yıldır. b) Akademik Personel için ücretsiz izin onay süreci belirtilir. c) İdari personelin talep ettiği ücretsiz izinler ilgili onaylarla verilir.'
                }
            ]
        })

        expect(repaired).toBe('Personelin ücretsiz izin süresi en fazla 1 (bir) yıldır.')
    })

    it('repairs no-information answers from explicit policy duration evidence beyond staff leave', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu konuda elimde net bilgi yok. İlgili birimle iletişime geçmeni öneririm.',
            userMessage: 'Mazeret sınavı başvuru süresi ne kadar?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Mazeret Sınavı Yönergesi',
                    content: 'Page Title: Mazeret Sınavı Yönergesi\nSource URL: https://example.edu.tr/mazeret.pdf\n\nMadde 8- Mazeret sınavı başvurusu, sınav tarihinden itibaren en geç 5 (beş) iş günü içinde yapılır. Başvurular ilgili birime iletilir.'
                }
            ]
        })

        expect(repaired).toBe('Mazeret sınavı başvurusu, sınav tarihinden itibaren en geç 5 (beş) iş günü içinde yapılır.')
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
