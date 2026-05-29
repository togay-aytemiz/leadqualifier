import { describe, expect, it } from 'vitest'

import { appendCanonicalRagSourceLinks } from '@/lib/knowledge-base/rag-source-links'

describe('appendCanonicalRagSourceLinks', () => {
    it('prefers direct evidence pages over listing/index source pages', () => {
        const formatted = appendCanonicalRagSourceLinks('Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesi’nde yer alıyor.', [
            {
                document_title: 'Tüm Haberler',
                source_url: 'https://example.edu.tr/haberler/index/21',
                content: 'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesi duyurusu.'
            },
            {
                document_title: 'Sağlık Bilimleri Fakültemiz Bağlıca Yerleşkesine Taşındı',
                source_url: 'https://example.edu.tr/haber/saglik-bilimleri-fakultemiz-baglica-yerleskesine-tasindi',
                content: 'Sağlık Bilimleri Fakültemiz Bağlıca Yerleşkesine taşındı.'
            }
        ], {
            force: true,
            limit: 2
        })

        expect(formatted).toBe(
            'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesi’nde yer alıyor.\nhttps://example.edu.tr/haber/saglik-bilimleri-fakultemiz-baglica-yerleskesine-tasindi'
        )
        expect(formatted).not.toContain('/haberler/index/21')
    })

    it('removes malformed spaced source URL fragments before appending canonical source links', () => {
        const response = 'https://yuksekihtisasuniversitesi. edu. tr/iletisim Başka bir konuda yardımcı olabilir miyim?'

        const formatted = appendCanonicalRagSourceLinks(response, [{
            source_url: 'https://yuksekihtisasuniversitesi.edu.tr/iletisim'
        }])

        expect(formatted).toBe('https://yuksekihtisasuniversitesi.edu.tr/iletisim')
        expect(formatted).not.toContain('edu. tr')
    })

    it('removes generic helper closings before appending the canonical source link', () => {
        const formatted = appendCanonicalRagSourceLinks('TLT yaz stajı 20 iş günü sürüyor. Başka bir konuda yardımcı olabilir miyim?', [{
            source_url: 'https://yuksekihtisasuniversitesi.edu.tr/Uploads/akademik_view/yuksekokul_view/icerik_yonetimi_view/ae23c350141ceaa4573f25d8fb58d1ba.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('TLT yaz stajı 20 iş günü sürüyor.\nhttps://yuksekihtisasuniversitesi.edu.tr/Uploads/akademik_view/yuksekokul_view/icerik_yonetimi_view/ae23c350141ceaa4573f25d8fb58d1ba.pdf')
        expect(formatted).not.toContain('Başka bir konuda')
    })

    it('removes bare generic question closings before appending the canonical source link', () => {
        const formatted = appendCanonicalRagSourceLinks('TLT yaz stajı 20 iş günü sürmektedir. Başka bir sorunuz var mı?', [{
            source_url: 'https://example.edu.tr/tlt.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('TLT yaz stajı 20 iş günü sürmektedir.\nhttps://example.edu.tr/tlt.pdf')
    })

    it('removes generic more-information engagement questions before appending the canonical source link', () => {
        const formatted = appendCanonicalRagSourceLinks('Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer. Daha fazla bilgi almak ister misin?', [{
            source_url: 'https://example.edu.tr/tip.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer.\nhttps://example.edu.tr/tip.pdf')
    })

    it('removes personal-profile engagement questions before appending source links', () => {
        const formatted = appendCanonicalRagSourceLinks('Ders içerikleri MEDU Öğrenme Yönetim Sistemi üzerinden paylaşılır. Hangi bölümde eğitim almayı düşünüyorsun?', [{
            source_url: 'https://example.edu.tr/ders-icerikleri.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Ders içerikleri MEDU Öğrenme Yönetim Sistemi üzerinden paylaşılır.\nhttps://example.edu.tr/ders-icerikleri.pdf')
    })

    it('does not append contact sources that do not support the concrete email or phone in the answer', () => {
        const formatted = appendCanonicalRagSourceLinks('Tıbbi Laboratuvar Teknikleri Programı iletişim bilgisi: E-posta: tlt@yiu.edu.tr.', [
            {
                source_url: 'https://example.edu.tr/tlt-program.pdf',
                content: 'Tıbbi Laboratuvar Teknikleri Programı E-Mail: tlt@yiu.edu.tr'
            },
            {
                source_url: 'https://example.edu.tr/iletisim',
                content: 'Rektörlük Telefon: +90 312 329 10 10 E-posta: yiu@yiu.edu.tr'
            }
        ], {
            force: true,
            limit: 2
        })

        expect(formatted).toBe('Tıbbi Laboratuvar Teknikleri Programı iletişim bilgisi: E-posta: tlt@yiu.edu.tr.\nhttps://example.edu.tr/tlt-program.pdf')
    })

    it('removes unspecified-topic help closings before appending the canonical source link', () => {
        const formatted = appendCanonicalRagSourceLinks('"Tlt" kısaltması, "Tıbbi Laboratuvar Teknikleri" programını ifade edebilir. Daha fazla bilgiye ihtiyaç duyarsan, belirli bir konu hakkında yardımcı olabilirim!', [{
            source_url: 'https://example.edu.tr/tlt.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('"Tlt" kısaltması, "Tıbbi Laboratuvar Teknikleri" programını ifade edebilir.\nhttps://example.edu.tr/tlt.pdf')
    })

    it('removes another-topic help questions before appending the canonical source link', () => {
        const formatted = appendCanonicalRagSourceLinks('Yıllık izin hakkı hizmet süresine göre 14, 20 veya 26 iş günüdür. Daha fazla bilgiye ihtiyaç duyarsan, izin kullanımıyla ilgili başka bir konu var mı?', [{
            source_url: 'https://example.edu.tr/izin.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Yıllık izin hakkı hizmet süresine göre 14, 20 veya 26 iş günüdür.\nhttps://example.edu.tr/izin.pdf')
    })

    it('removes generic which-period clarification questions before appending the canonical source link', () => {
        const formatted = appendCanonicalRagSourceLinks('Dönem içi kurul notu 80 ve üzerinde olanlar finale girmeden geçebilir. hangi dönemle ilgilendiğini belirtmek ister misin?', [{
            source_url: 'https://example.edu.tr/tip.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Dönem içi kurul notu 80 ve üzerinde olanlar finale girmeden geçebilir.\nhttps://example.edu.tr/tip.pdf')
    })

    it('removes truncated generic detail-clarification tails before appending the canonical source link', () => {
        const formatted = appendCanonicalRagSourceLinks('Dönem sonu başarı notu dönem içi kurul notunun %60ı ile final veya bütünleme notunun %40ıdır. Daha fazla detay istersen, hangi dönemle ilgili bilgi almak istediğini söyleyebilirs', [{
            source_url: 'https://example.edu.tr/tip.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Dönem sonu başarı notu dönem içi kurul notunun %60ı ile final veya bütünleme notunun %40ıdır.\nhttps://example.edu.tr/tip.pdf')
    })

    it('removes generic specific-topic detail offers before appending the canonical source link', () => {
        const formatted = appendCanonicalRagSourceLinks('Dönem sonu başarı notu dönem içi kurul notunun %60ı ile final veya bütünleme notunun %40ıdır. Daha fazla detay istersen, belirli bir dönem veya konu hakkında bilgi verebilirim!', [{
            source_url: 'https://example.edu.tr/tip.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Dönem sonu başarı notu dönem içi kurul notunun %60ı ile final veya bütünleme notunun %40ıdır.\nhttps://example.edu.tr/tip.pdf')
    })

    it('removes generic visit-page tails before appending the canonical source link', () => {
        const formatted = appendCanonicalRagSourceLinks('MEDU platformuna giriş yaptıktan sonra ilgili dersin sayfasından materyallere ulaşabilirsin. Daha fazla bilgiye ihtiyacın olursa, MEDU sisteminin genel sayfasını ziyaret edebilirsin:', [{
            source_url: 'https://example.edu.tr/medu.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('MEDU platformuna giriş yaptıktan sonra ilgili dersin sayfasından materyallere ulaşabilirsin.\nhttps://example.edu.tr/medu.pdf')
    })

    it('removes role-assumptive department followups before appending the canonical source link', () => {
        const formatted = appendCanonicalRagSourceLinks('Seçmeli ders sayısı, programınıza göre değişiklik gösterebilir. Genel olarak, hangi derslerin alınacağına ve yarıyıllara dağılımına Fakülte Kurulu karar verir. Bu nedenle, hangi bölümde okuduğunuzu belirtirseniz, daha spesifik bilgi verebilirim. Hangi bölümle ilgileniyorsunuz?', [{
            source_url: 'https://example.edu.tr/secmeli.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Seçmeli ders sayısı, programınıza göre değişiklik gösterebilir. Genel olarak, hangi derslerin alınacağına ve yarıyıllara dağılımına Fakülte Kurulu karar verir.\nhttps://example.edu.tr/secmeli.pdf')
    })

    it('removes role-assumptive detail requests before appending the canonical source link', () => {
        const formatted = appendCanonicalRagSourceLinks('Seçmeli ders sayısı, programınıza ve fakültenize bağlı olarak değişir. Genel olarak alınması gereken sayıya Fakülte Kurulu karar verir. Bu konuda daha net bilgi almak için hangi bölümde okuduğunuzu belirtir misiniz?', [{
            source_url: 'https://example.edu.tr/secmeli.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Seçmeli ders sayısı, programınıza ve fakültenize bağlı olarak değişir. Genel olarak alınması gereken sayıya Fakülte Kurulu karar verir.\nhttps://example.edu.tr/secmeli.pdf')
    })

    it('removes role-assumptive which-department question variants before appending the canonical source link', () => {
        const formatted = appendCanonicalRagSourceLinks('Seçmeli derslerin sayısına Fakülte Kurulu karar verir. Hangi bölümde okuduğunuzu öğrenebilir miyim? Böylece daha spesifik bilgi verebilirim.', [{
            source_url: 'https://example.edu.tr/secmeli.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Seçmeli derslerin sayısına Fakülte Kurulu karar verir.\nhttps://example.edu.tr/secmeli.pdf')
    })

    it('removes generic platform-navigation tails before appending the canonical source link', () => {
        const formatted = appendCanonicalRagSourceLinks('Ders notlarına MEDU üzerinden ulaşabilirsin. Daha fazla bilgi istersen, platforma giriş yaparak derslerinle ilgili içeriklere ulaşabilirsin. Eğer başka bir konuda yardımcı olmamı istersen, lütfen belirt!', [{
            source_url: 'https://example.edu.tr/medu.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Ders notlarına MEDU üzerinden ulaşabilirsin.\nhttps://example.edu.tr/medu.pdf')
    })

    it('uses short platform names such as UZEM and MEDU as source evidence signals', () => {
        const formatted = appendCanonicalRagSourceLinks('Ders notlarına UZEM/MEDU sistemleri üzerinden ulaşabilirsin.', [
            {
                source_url: 'https://example.edu.tr/uzem-accessibility.pdf',
                content: 'Ders notlarına UZEM sistemi üzerinden ulaşabilirsin. UZEM üzerinden paylaşılan içerikler erişilebilir olmalıdır.'
            },
            {
                source_url: 'https://example.edu.tr/uzem-medu-learning.pdf',
                content: 'UZEM/MEDU sistemleri üzerinden ders notlarının paylaşımı sağlanmıştır.'
            }
        ], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe(
            'Ders notlarına UZEM/MEDU sistemleri üzerinden ulaşabilirsin.\nhttps://example.edu.tr/uzem-medu-learning.pdf'
        )
    })

    it('removes dangling more-info prefaces before source links', () => {
        const formatted = appendCanonicalRagSourceLinks('Evet, TLT programında yaz stajı vardır ve 20 iş günüdür. Daha fazla bilgi istersen,', [{
            source_url: 'https://example.edu.tr/tlt.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Evet, TLT programında yaz stajı vardır ve 20 iş günüdür.\nhttps://example.edu.tr/tlt.pdf')
    })

    it('removes role-assumptive program-status prompts before source links', () => {
        const formatted = appendCanonicalRagSourceLinks('Seçmeli ders sayısı Yüksekokul Kurulu tarafından belirlenir. Hangi programda eğitim alıyorsun? Bu sayede daha spesifik bilgi verebilirim.', [{
            source_url: 'https://example.edu.tr/myo.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Seçmeli ders sayısı Yüksekokul Kurulu tarafından belirlenir.\nhttps://example.edu.tr/myo.pdf')
    })

    it('removes generic student-affairs deferrals before source links', () => {
        const formatted = appendCanonicalRagSourceLinks('Ders notlarına MEDU üzerinden ulaşabilirsin. Eğer daha fazla bilgiye ihtiyacın varsa, üniversitenin öğrenci işleri ile iletişime geçmeni öneririm. Daha fazla detay için buraya göz atabilirsin:', [{
            source_url: 'https://example.edu.tr/medu.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Ders notlarına MEDU üzerinden ulaşabilirsin.\nhttps://example.edu.tr/medu.pdf')
    })

    it('removes generic application/contact helper closings before source links', () => {
        const formatted = appendCanonicalRagSourceLinks('Mazeretiniz kabul edilirse mazeret sınavına girebilirsiniz. Detaylı bilgi veya başvuru için ilgili birimle iletişime geçmek isterseniz, yardımcı olabilirim.', [{
            source_url: 'https://example.edu.tr/mazeret.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Mazeretiniz kabul edilirse mazeret sınavına girebilirsiniz.\nhttps://example.edu.tr/mazeret.pdf')
    })

    it('removes generic which-topic helper questions before source links', () => {
        const formatted = appendCanonicalRagSourceLinks('Yıllık izin hakkı hizmet süresine göre 14, 20 veya 26 iş günüdür. Daha fazla bilgiye ihtiyaç duyarsan, hangi konuda yardımcı olabilirim?', [{
            source_url: 'https://example.edu.tr/izin.pdf'
        }], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Yıllık izin hakkı hizmet süresine göre 14, 20 veya 26 iş günüdür.\nhttps://example.edu.tr/izin.pdf')
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

    it('does not append weak extra sources when concrete answer values only exist in the primary evidence', () => {
        const formatted = appendCanonicalRagSourceLinks('Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günü süresince uygulanmaktadır.', [
            {
                source_url: 'https://example.edu.tr/tlt-oz-degerlendirme.pdf',
                document_title: 'Tıbbi Laboratuvar Teknikleri Programı',
                content: 'Tıbbi Laboratuvar Teknikleri programında zorunlu yaz stajı 20 iş günü olarak uygulanır.'
            },
            {
                source_url: 'https://example.edu.tr/landing',
                document_title: 'Aday Öğrenci',
                content: 'Tıbbi Laboratuvar Teknikleri programı hakkında genel aday öğrenci bilgilendirmesi.'
            }
        ], {
            force: true,
            limit: 2
        })

        expect(formatted).toBe('Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günü süresince uygulanmaktadır.\nhttps://example.edu.tr/tlt-oz-degerlendirme.pdf')
        expect(formatted).not.toContain('/landing')
    })

    it('keeps multiple source links when separate compound-answer facts have distinct evidence values', () => {
        const formatted = appendCanonicalRagSourceLinks(
            'Tıp Fakültesinde eğitim-öğretim süresi altı yıldır. TLT 216 Yaz Stajı 20 iş günüdür.',
            [
                {
                    source_url: 'https://example.edu.tr/tip-yonerge.pdf',
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Tıp Fakültesinde eğitim-öğretim süresi altı yıldır.'
                },
                {
                    source_url: 'https://example.edu.tr/tlt-oz-degerlendirme.pdf',
                    document_title: 'Tıbbi Laboratuvar Teknikleri Programı',
                    content: 'TLT 216 Yaz Stajı 20 iş günüdür.'
                }
            ],
            {
                force: true,
                limit: 2
            }
        )

        expect(formatted).toBe(
            'Tıp Fakültesinde eğitim-öğretim süresi altı yıldır. TLT 216 Yaz Stajı 20 iş günüdür.\nhttps://example.edu.tr/tip-yonerge.pdf\nhttps://example.edu.tr/tlt-oz-degerlendirme.pdf'
        )
    })
})
