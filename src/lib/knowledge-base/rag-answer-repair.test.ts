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

    it('does not repair duration answers from a nearby but different leave type', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu konuda elimde net bilgi yok. Ücretsiz izin süresi hakkında detaylı bilgi almak için ilgili birimle iletişime geçmeni öneririm.',
            userMessage: 'personelin ücretsiz izin süresi ne kadar',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'İzin Kullanımı Yönergesi',
                    content: 'Page Title: İzin Kullanımı Yönergesi\nSource URL: https://example.edu.tr/izin.pdf\n\nMadde 9- d) Personelin eşinin anne, baba veya kardeşinin ölümünde 3 (üç) iş günü, mazeret izini verilir.'
                },
                {
                    document_title: 'İzin Kullanımı Yönergesi',
                    content: 'Page Title: İzin Kullanımı Yönergesi\nSource URL: https://example.edu.tr/izin.pdf\n\nMadde 11- Ücretsiz izinler aşağıdaki esaslara göre kullanılır. a) Ücretsiz izin süresi en fazla 1 (bir) yıldır.'
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

    it('repairs medicine elective-course answers from the Dönem VI completion rule', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Seçmeli derslerle ilgili detaylar için Tıp Fakültesi öğrenci işleriyle iletişime geçmeni öneririm.',
            userMessage: 'Tıp Fakültesinde seçmeli dersleri ne zamana kadar geçmem gerekiyor?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Fakülte eğitim programında Dönem IV ve Dönem V’te; 5) Öğrenciler, Fakülte müfredatında yer alan Seçmeli derslerden Dönem VI sonuna kadar başarılı olmalıdırlar.'
                }
            ]
        })

        expect(repaired).toBe('Tıp Fakültesinde öğrenciler, fakülte müfredatında yer alan seçmeli derslerden Dönem VI sonuna kadar başarılı olmalıdır.')
    })

    it('repairs generic elective-count clarification answers from retrieved policy evidence', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bunu net söyleyebilmem için hangi program/yıl ve başvuru türü olduğunu belirtmen gerekiyor.',
            userMessage: 'Mezun olana kadar kaç seçmeli ders almalıyım',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Seçmeli derslerin hangi derslerden oluşacağına, yarıyıllara dağılımına, öğrenci tarafından alınması gereken seçmeli ders sayısına ve AKTS kredisine Fakülte Kurulu karar verir.'
                }
            ]
        })

        expect(repaired).toContain('seçmeli ders sayısına')
        expect(repaired).toContain('Fakülte Kurulu karar verir')
    })

    it('repairs medicine in-year board-grade answers from explicit grade formula evidence', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Tıp Fakültesi ile ilgili detaylı bilgi almak için öğrenci işleriyle iletişime geçmeni öneririm.',
            userMessage: 'Tıpta dönem içi kurul notu başarı notuna nasıl yansıyor?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Dönem sonu başarı notu; Dönem içi kurul notunun %60’ı, final notu veya bütünleme notunun %40’ı toplanarak elde edilir. Dönem içi kurul notu; ders kurulu sınavlarının not ortalamasının %96’sı ile dönemde varsa Hekimliğe Uyum Kurulu ve Kanıta Dayalı Tıp Kurulu notlarının her birinin %2’si, yoksa birinin %4’ü toplanarak hesaplanır.'
                }
            ]
        })

        expect(repaired).toContain('Dönem içi kurul notunun %60')
        expect(repaired).toContain('final/bütünleme notunun %40')
        expect(repaired).toContain('ders kurulu sınavlarının not ortalamasının %96')
        expect(repaired).toContain('Hekimliğe Uyum')
        expect(repaired).toContain('Kanıta Dayalı Tıp')
    })

    it('repairs incorrect medicine pass-without-final answers from the final exemption rule', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Final sınavına girmeden sınıf geçmek mümkün değil.',
            userMessage: 'Finale girmeden sınıf geçebilir miyim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'İlgili dönemde ders kurulu sınav notlarının her biri en az 60 olmak şartı ile hesaplanan dönem içi kurul notu 80 ve üzerinde olan öğrenciler isterlerse dönem sonu final sınavına girmeksizin dönemi başarıyla tamamlamış kabul edilir.'
                }
            ]
        })

        expect(repaired).toBe('Ders kurulu sınav notlarının her biri en az 60 ve dönem içi kurul notu 80 veya üzerindeyse öğrenci isterse dönem sonu final sınavına girmeden dönemi başarıyla tamamlamış kabul edilir.')
    })

    it('repairs vague campus answers from campus-location evidence instead of PDF footer addresses', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Sağlık Bilimleri Fakültesi kampüsü Ankara’da yer almaktadır. Başka bir konuda yardımcı olabilir miyim?',
            userMessage: 'Sbf kampüsü nerede',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'SBF Koordinatörler Kurulu Yönergesi',
                    content: 'Page Title: SBF Koordinatörler Kurulu Yönergesi\nSource URL: https://example.edu.tr/sbf.pdf\n\nSBF DEKANI\nSağlık Bilimleri Fakültesi Kalite Koordinatörlüğü\nAdres : Yüksek İhtisas Üniversitesi Rektörlüğü 06530 Telefon : 0312 329 10 10\nÇankaya / Ankara'
                },
                {
                    document_title: 'Sıkça Sorulan Sorular',
                    content: 'Page Title: Sıkça Sorulan Sorular\nSource URL: https://example.edu.tr/sikca-sorulan-sorular\n\nÜniversite Ankara’nın neresindedir?\nBalgat yerleşkesi (Sağlık Bilimleri Fakültesi)\nOğuzlar Mahallesi, 1375. Sk. No: 8, Çankaya / Ankara.'
                }
            ]
        })

        expect(repaired).toBe('Sağlık Bilimleri Fakültesi adresi: Oğuzlar Mahallesi, 1375. Sk. No: 8, Çankaya / Ankara.')
    })

    it('repairs footer-derived campus answers when a newer campus-location chunk has a street address', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Sağlık Bilimleri Fakültesi kampüsü, Yüksek İhtisas Üniversitesi Rektörlüğü 06530 adresindedir.',
            userMessage: 'Sbf kampüsü nerede',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'SBF Koordinatörler Kurulu Yönergesi',
                    content: 'Page Title: SBF Koordinatörler Kurulu Yönergesi\nSource URL: https://example.edu.tr/sbf.pdf\n\nSBF DEKANI\nSağlık Bilimleri Fakültesi Kalite Koordinatörlüğü\nAdres : Yüksek İhtisas Üniversitesi Rektörlüğü 06530 Telefon : 0312 329 10 10\nÇankaya / Ankara'
                },
                {
                    document_title: 'Yerleşke Konumları Güncellendi',
                    content: 'Page Title: Üniversitemizde Yeni Düzenleme Kapsamında Yapılan Yerleşke Konumları Güncellendi\nSource URL: https://example.edu.tr/duyuru/yerleske-konumlari-guncellendi\n\nSAĞLIK BİLİMLERİ FAKÜLTESİ\nBAĞLICA YERLEŞKESİ: Bağlıca Mahallesi Höyük Caddesi No :1 Bağlıca'
                }
            ]
        })

        expect(repaired).toBe('Sağlık Bilimleri Fakültesi adresi: Bağlıca Mahallesi Höyük Caddesi No :1 Bağlıca.')
    })

    it('repairs SHMYO abbreviation campus answers from current campus listing evidence', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu kampüs adına bilgi tabanımda net kayıt yok. Bağlıca, Balgat veya Bağlum yerleşkelerinden biri mi?',
            userMessage: 'Shmyo kampüsü nerede',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Yerleşke Konumları Güncellendi',
                    content: 'SAĞLIK HİZMETLERİ MESLEK YÜKSEKOKULU\nBAĞLUM YERLEŞKESİ: Karakaya Mahallesi Bağlum Bulvarı No:1 06291 Keçiören\nSPOR BİLİMLERİ FAKÜLTESİ'
                }
            ]
        })

        expect(repaired).toBe('Sağlık Hizmetleri Meslek Yüksekokulu adresi: Karakaya Mahallesi Bağlum Bulvarı No:1 06291 Keçiören.')
    })

    it('repairs TLT campus answers from explicit program yerleşke evidence', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Tıbbi Laboratuvar Teknikleri programı Sağlık Hizmetleri Meslek Yüksekokulu bünyesindedir.',
            userMessage: 'Tıbbi Laboratuvar Teknikleri hangi yerleşkede?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıbbi Laboratuvar Teknikleri',
                    content: 'Page Title: Tıbbi Laboratuvar Teknikleri\nE-Mail: tlt@yiu.edu.tr\nYerleşke: Balgat Yerleşkesi\nTıbbi Laboratuvar Teknikleri Programı’nın vizyonu.'
                }
            ]
        })

        expect(repaired).toBe('Tıbbi Laboratuvar Teknikleri Programı yerleşkesi: Balgat Yerleşkesi.')
    })

    it('does not treat email address questions as physical address requests', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Program adresi: Oğuzlar Mahallesi 1375 Sokak No:8 06520 Balgat/Ankara.',
            userMessage: 'Tıbbi Laboratuvar Teknikleri programının mail adresi nedir?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıbbi Laboratuvar Teknikleri',
                    content: 'Page Title: Tıbbi Laboratuvar Teknikleri\nE-Mail: tlt@yiu.edu.tr\nYerleşke: Balgat Yerleşkesi'
                }
            ]
        })

        expect(repaired).toBe('Tıbbi Laboratuvar Teknikleri Programı iletişim bilgisi: E-posta: tlt@yiu.edu.tr.')
    })

    it('repairs TLT double-major responsible contact answers with the named program owner', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Tıbbi Laboratuvar Teknikleri Programı iletişim bilgisi: E-posta: tlt@yiu.edu.tr.',
            userMessage: 'TLT çift anadal program sorumlusu kim ve maili ne?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Çift Anadal Programları',
                    content: 'Program Sorumluları\nPROGRAM ADI\nÖĞRETİM ELEMANI\nE-MAİL İLETİŞİM\nTıbbi Laboratuvar Teknikleri\nDoç. Dr. Esma Sari Üzek\nesmasariuzek@yiu.edu.tr\nÇift Anadal Yapılabilecek Programlar\nTıbbi Laboratuvar Teknikleri\nEczane Hizmetleri'
                }
            ]
        })

        expect(repaired).toBe('Tıbbi Laboratuvar Teknikleri Çift Anadal Programı sorumlusu iletişim bilgisi: Sorumlu: Doç. Dr. Esma Sari Üzek - E-posta: esmasariuzek@yiu.edu.tr.')
    })

    it('keeps TLT double-major responsible contact questions on the named owner when evidence is whitespace-collapsed', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Evet, Tıbbi Laboratuvar Teknikleri Programı öğrencileri Eczane Hizmetleri Programında çift anadal programına kayıt yaptırabilir.',
            userMessage: 'TLT çift anadal program sorumlusu kim ve maili ne?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Çift Anadal Programları',
                    content: 'Program Sorumluları PROGRAM ADI ÖĞRETİM ELEMANI E-MAİL İLETİŞİM Tıbbi Laboratuvar Teknikleri Doç. Dr. Esma Sari Üzek esmasariuzek@yiu.edu.tr Çift Anadal Yapılabilecek Programlar Tıbbi Laboratuvar Teknikleri Eczane Hizmetleri'
                }
            ]
        })

        expect(repaired).toBe('Tıbbi Laboratuvar Teknikleri Çift Anadal Programı sorumlusu iletişim bilgisi: Sorumlu: Doç. Dr. Esma Sari Üzek - E-posta: esmasariuzek@yiu.edu.tr.')
    })

    it('repairs address answers that include the postal code but omit the exact address unit', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: "Yüksek İhtisas Üniversitesi'nin kampüsü, Ankara'nın 06530 posta kodlu bölgesindedir.",
            userMessage: 'Sbf kampüsü nerede',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'SBF Koordinatörler Kurulu Yönergesi',
                    content: 'Page Title: SBF Koordinatörler Kurulu Yönergesi\nSource URL: https://example.edu.tr/sbf.pdf\n\nSBF DEKANI\nSağlık Bilimleri Fakültesi Kalite Koordinatörlüğü\nAdres : Yüksek İhtisas Üniversitesi Rektörlüğü 06530 Telefon : 0312 329 10 10\nÇankaya / Ankara'
                }
            ]
        })

        expect(repaired).toBe('Sağlık Bilimleri Fakültesi adresi: Yüksek İhtisas Üniversitesi Rektörlüğü 06530.')
    })

    it('repairs wrong contact answers when the retrieved chunk contains program email and phone', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Tıbbi Laboratuvar Teknikleri Programı sorumlusu Doç. Dr. Esma SARI ÜZEK’tir. Doğrudan e-posta bulunmuyor.',
            userMessage: 'Tıbbi Laboratuvar Teknikleri programının sorumlusu kim iletişim bilgisi var mı',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Program Bilgi Notu',
                    content: 'TIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI\nAdres: Yüksek İhtisas Üniversitesi Sağlık Hizmetleri Meslek Yüksekokulu Oğuzlar Mahallesi 1375 Sokak No:8 06520 Balgat/Ankara\nTelefon: +90 312 329 1010\nE-Mail: tlt@yiu.edu.tr'
                }
            ]
        })

        expect(repaired).toContain('Tıbbi Laboratuvar Teknikleri Programı')
        expect(repaired).toContain('Telefon: +90 312 329 10 10')
        expect(repaired).toContain('E-posta: tlt@yiu.edu.tr')
        expect(repaired).not.toContain('Doç. Dr. Esma')
    })

    it('chooses the program-matched contact email instead of the first unrelated email in a contact table', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Doğrudan e-posta bulunmuyor.',
            userMessage: 'Tıbbi Laboratuvar Teknikleri programının sorumlusu kim iletişim bilgisi var mı',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'İletişim',
                    content: [
                        'Kütüphane Telefon: (+90 312) 329 1010 E-posta: kutuphane@yuksekihtisas.edu.tr',
                        'Tıbbi Laboratuvar Teknikleri Program Başkanı Telefon: (+90 312) 329 1010 E-posta: tlt@yiu.edu.tr'
                    ].join('\n')
                }
            ]
        })

        expect(repaired).toContain('E-posta: tlt@yiu.edu.tr')
        expect(repaired).toContain('Telefon: +90 312 329 10 10')
        expect(repaired).not.toContain('kutuphane@yuksekihtisas.edu.tr')
    })

    it('repairs TLT double-major answers that omit the paired Eczane Hizmetleri program', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Evet, Tıbbi Laboratuvar Teknikleri programında çift anadal yapabilirsiniz. Bunun için en az 2,72/4,0 not ortalaması gerekir.',
            userMessage: 'Tıbbi Laboratuvar Teknikleri programında çift anadal yapabilir miyim',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'TIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI - 2025 ÖZ DEĞERLENDİRME RAPORU',
                    content: '*Tıbbi Laboratuvar Teknikleri Programı öğrencileri, Eczane Hizmetleri Programında ve Eczane Hizmetleri Programı öğrencileri ise Tıbbi Laboratuvar Teknikleri Programında çift anadal programına kayıt yaptırabilirler. Her iki programa kaydedilecek öğrenci kontenjanları, her yıl Eğitim-Öğretim yılı başlamadan önce yüksekokul tarafından belirlenir. Kontenjanları belirlenen ve yayınlanan çift anadal programına öğrenciler, üçüncü yarıyılın başında başvurabilir.'
                }
            ]
        })

        expect(repaired).toContain('Eczane Hizmetleri Programında')
        expect(repaired).toContain('üçüncü yarıyılın başında')
        expect(repaired).toContain('2,72/4,0')
    })

    it('repairs TLT ÇAP acronym answers from double-major evidence after completion timeout', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'ÇAP için belirli akademik başarı kriterlerini sağlamanız gerekir. Detaylı bilgi için bölümle iletişime geçin.',
            userMessage: 'TLT öğrencisi ÇAP şartları nelerdir?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'TIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI - 2025 ÖZ DEĞERLENDİRME RAPORU',
                    content: '*Tıbbi Laboratuvar Teknikleri Programı öğrencileri, Eczane Hizmetleri Programında ve Eczane Hizmetleri Programı öğrencileri ise Tıbbi Laboratuvar Teknikleri Programında çift anadal programına kayıt yaptırabilirler. Her iki programa kaydedilecek öğrenci kontenjanları, her yıl Eğitim-Öğretim yılı başlamadan önce yüksekokul tarafından belirlenir. Kontenjanları belirlenen ve yayınlanan çift anadal programına öğrenciler, üçüncü yarıyılın başında başvurabilir. Koşullarda genel ağırlıklı not ortalaması en az 2,72/4,0 ve/veya başarı sıralaması ya da taban puan şartı belirtilmiştir.'
                }
            ]
        })

        expect(repaired).toContain('Eczane Hizmetleri Programında')
        expect(repaired).toContain('üçüncü yarıyılın başında')
        expect(repaired).toContain('2,72/4,0')
    })

    it('repairs blank RAG completions from retrieved double-major evidence', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: '',
            userMessage: 'Tıbbi Laboratuvar Teknikleri programında çift anadal yapabilir miyim',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'TIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI - 2025 ÖZ DEĞERLENDİRME RAPORU',
                    content: '*Tıbbi Laboratuvar Teknikleri Programı öğrencileri, Eczane Hizmetleri Programında ve Eczane Hizmetleri Programı öğrencileri ise Tıbbi Laboratuvar Teknikleri Programında çift anadal programına kayıt yaptırabilirler. Her iki programa kaydedilecek öğrenci kontenjanları, her yıl Eğitim-Öğretim yılı başlamadan önce yüksekokul tarafından belirlenir. Kontenjanları belirlenen ve yayınlanan çift anadal programına öğrenciler, üçüncü yarıyılın başında başvurabilir. Koşullarda genel ağırlıklı not ortalaması en az 2,72/4,0 ve/veya başarı sıralaması ya da taban puan şartı belirtilmiştir.'
                }
            ]
        })

        expect(repaired).toContain('Tıbbi Laboratuvar Teknikleri Programı')
        expect(repaired).toContain('Eczane Hizmetleri Programında')
        expect(repaired).toContain('2,72/4,0')
    })

    it('keeps TLT double-major answers deterministic instead of adding unrequested contacts', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Evet, Tıbbi Laboratuvar Teknikleri Programı öğrencileri, Eczane Hizmetleri Programında çift anadal yapabilirler. İlgili kişi: Doç. Dr. Esma SARI ÜZEK.',
            userMessage: 'Tıbbi Laboratuvar Teknikleri programında çift anadal yapabilir miyim',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'TIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI - 2025 ÖZ DEĞERLENDİRME RAPORU',
                    content: '*Tıbbi Laboratuvar Teknikleri Programı öğrencileri, Eczane Hizmetleri Programında ve Eczane Hizmetleri Programı öğrencileri ise Tıbbi Laboratuvar Teknikleri Programında çift anadal programına kayıt yaptırabilirler.'
                }
            ]
        })

        expect(repaired).toContain('Eczane Hizmetleri Programında')
        expect(repaired).not.toContain('Doç. Dr.')
    })

    it('repairs no-information answers when medicine training staj evidence is explicit', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu konuda elimde net bilgi yok. Tıp Fakültesi öğrenci işleriyle iletişime geçmeni öneririm.',
            userMessage: 'Tıp fakültesinde yaz stajı var mı?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'MADDE 5 – (1) Tıp Fakültesinde eğitim- öğretim süresi altı yıldır. Tıp eğitim- öğretimi; Dönem I, II ve III’te temel olarak ders kurullarından oluşan Harmanlanmış/Hibrit Preklinik Tıp Bilimleri eğitim-öğretimi, Dönem IV ve V’te stajlardan oluşan Klinik Tıp Bilimleri eğitimöğretimi ve Dönem VI’da İntörnlük Stajlarından oluşan İntörnlük eğitim- öğretimi esasına göre yapılır.'
                }
            ]
        })

        expect(repaired).toContain('Dönem IV ve V’te stajlardan')
        expect(repaired).toContain('Dönem VI’da İntörnlük Stajlarından')
        expect(repaired).toContain('ayrı bir "yaz stajı" ifadesi geçmiyor')
        expect(repaired).toContain('Tıp Fakültesinde')
    })

    it('repairs reordered no-information medicine staj answers when training evidence is explicit', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Tıp Fakültesi’nde yaz stajı ile ilgili net bilgi elimde yok. Ancak Dönem IV ve V’te stajlardan oluşan klinik eğitim yapılmaktadır.',
            userMessage: 'Tıp fakültesinde yaz stajı var mı?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'MADDE 5 – (1) Tıp eğitim- öğretimi; Dönem I, II ve III’te temel olarak ders kurullarından oluşan Harmanlanmış/Hibrit Preklinik Tıp Bilimleri eğitim-öğretimi, Dönem IV ve V’te stajlardan oluşan Klinik Tıp Bilimleri eğitimöğretimi ve Dönem VI’da İntörnlük Stajlarından oluşan İntörnlük eğitim- öğretimi esasına göre yapılır.'
                }
            ]
        })

        expect(repaired).toContain('Dönem IV ve V’te stajlardan')
        expect(repaired).toContain('Dönem VI’da İntörnlük Stajlarından')
        expect(repaired).toContain('Kaynakta ayrı bir "yaz stajı" ifadesi geçmiyor')
    })

    it('repairs too-broad medicine duration answers when period and staj evidence is explicit', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Tıp Fakültesinde eğitim süresi altı yıldır. Eğitim, farklı dönemlerde çeşitli ders ve stajlardan oluşmaktadır.',
            userMessage: 'Tıp fakültesinde eğitim süresi ne kadar?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'MADDE 5 – (1) Tıp Fakültesinde eğitim- öğretim süresi altı yıldır. Tıp eğitim- öğretimi; Dönem I, II ve III’te temel olarak ders kurullarından oluşan Harmanlanmış/Hibrit Preklinik Tıp Bilimleri eğitim-öğretimi, Dönem IV ve V’te stajlardan oluşan Klinik Tıp Bilimleri eğitimöğretimi ve Dönem VI’da İntörnlük Stajlarından oluşan İntörnlük eğitim- öğretimi esasına göre yapılır.'
                }
            ]
        })

        expect(repaired).toContain('Dönem IV ve V’te stajlardan')
        expect(repaired).toContain('Dönem VI’da İntörnlük Stajlarından')
    })

    it('keeps the six-year duration when repairing detailed medicine training answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Tıp Fakültesinde Tıp eğitim- öğretimi; Dönem I, II ve III’te temel olarak ders kurullarından oluşur, Dönem IV ve V’te stajlar ve Dönem VI’da intörnlük yapılır.',
            userMessage: 'Tıp fakültesinde eğitim süresi ne kadar?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'MADDE 5 – (1) Tıp Fakültesinde eğitim- öğretim süresi altı yıldır. Tıp eğitim- öğretimi; Dönem I, II ve III’te temel olarak ders kurullarından oluşan Harmanlanmış/Hibrit Preklinik Tıp Bilimleri eğitim-öğretimi, Dönem IV ve V’te stajlardan oluşan Klinik Tıp Bilimleri eğitimöğretimi ve Dönem VI’da İntörnlük Stajlarından oluşan İntörnlük eğitim- öğretimi esasına göre yapılır.'
                }
            ]
        })

        expect(repaired).toContain('eğitim- öğretim süresi altı yıldır')
        expect(repaired).toContain('Dönem VI’da İntörnlük Stajlarından')
    })

    it('keeps makeup exam wording in grade-calculation answers when the evidence uses final/makeup together', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: "Dönem sonu başarı notu, dönem içi kurul notunun %60'ı ve final notunun %40'ı toplanarak elde edilir. Başarılı olmak için dönem sonu başarı notu en az 60 olmalıdır.",
            userMessage: 'Tıp fakültesinde sınıf geçmek için not hesaplama nasıl yapılıyor?',
            responseLanguage: 'tr',
            chunks: [{
                document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                content: 'Dönem I, II ve III’te dönem sonu başarı notu dönem içi kurul notunun %60’ı ve final sınavı veya bütünleme sınavı notunun %40’ı toplanarak hesaplanır. Final veya bütünleme sınavı puanının en az 50 olması gerekir.'
            }]
        })

        expect(repaired).toContain('final/bütünleme notunun %40')
        expect(repaired).toContain('en az 60')
    })

    it('repairs medicine board-grade answers that omit the final or makeup forty percent share', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: "Dönem içi kurul notu, dönem sonu başarı notunun %60'ını oluşturur. Dönem içi kurul notu ders kurulu sınavlarının not ortalamasının %96'sı ile hesaplanır. Dönem sonu başarı notu için en az 60 alınması gerekir.",
            userMessage: 'Tıpta dönem içi kurul notu başarı notuna nasıl yansıyor?',
            responseLanguage: 'tr',
            chunks: [{
                document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                content: 'Dönem I, II ve III’te dönem sonu başarı notu dönem içi kurul notunun %60’ı ve final sınavı veya bütünleme sınavı notunun %40’ı toplanarak hesaplanır. Dönem içi kurul notu ders kurulu sınavlarının not ortalamasının %96’sı ile dönemde varsa Hekimliğe Uyum Kurulu ve Kanıta Dayalı Tıp Kurulu notlarının her birinin %2’si, yoksa birinin %4’ü toplanarak hesaplanır.'
            }]
        })

        expect(repaired).toContain('Dönem içi kurul notunun %60')
        expect(repaired).toContain('final/bütünleme notunun %40')
        expect(repaired).toContain('ders kurulu sınavlarının not ortalamasının %96')
    })

    it('repairs blank RAG completions from retrieved grade-calculation evidence', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: '',
            userMessage: 'Tıp fakültesinde sınıf geçmek için not hesaplama nasıl yapılıyor',
            responseLanguage: 'tr',
            chunks: [{
                document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                content: 'Dönem I, II ve III’te dönem sonu başarı notu dönem içi kurul notunun %60’ı ve final sınavı veya bütünleme sınavı notunun %40’ı toplanarak hesaplanır. Dönem içi kurul notu ders kurulu sınavlarının not ortalamasının %96’sı ile dönemde varsa Hekimliğe Uyum Kurulu ve Kanıta Dayalı Tıp Kurulu notlarının her birinin %2’si, yoksa birinin %4’ü toplanarak hesaplanır.'
            }]
        })

        expect(repaired).toContain('Dönem içi kurul notunun %60')
        expect(repaired).toContain('final/bütünleme notunun %40')
        expect(repaired).toContain('ders kurulu sınavlarının not ortalamasının %96')
    })

    it('repairs no-information final answers when makeup exam eligibility is explicit', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu konuda elimde net bilgi yok. Öğrenci işleriyle iletişime geçmeni öneririm.',
            userMessage: 'Finale girmeden sınıf geçebilir miyim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği',
                    content: 'MADDE 21– (1) Bütünleme sınavları, yarıyıl sonu sınavında başarısız olan veya yarıyıl sonu sınavına girmeyen öğrencilere uygulanır. Bütünleme sınavına girmeyen öğrencinin yarıyıl sonu sınavından aldığı puan geçerli olur.'
                }
            ]
        })

        expect(repaired).toContain('Final/yarıyıl sonu sınavına girmeyen öğrenciler için bütünleme sınavı uygulanır')
        expect(repaired).toContain('finale girmeden doğrudan sınıf geçme')
    })

    it('repairs contradictory medicine final-to-makeup answers with the retrieved policy wording', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Final sınavına girmeden bütünleme sınavına giremezsin.',
            userMessage: 'Tıp fakültesinde finale girmeden bütünlemeye girebilir miyim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Final sınavına girmesi gerektiği halde girmeyen, final sınavı puanı 50’nin altında olan veya final sınavına göre hesaplanan dönem sonu başarı notu 60’ın altında olan öğrenciler bütünleme sınavına girer. Bütünleme notunu oluşturur. Bütünleme sınavında alınan not final notu yerine geçer.'
                }
            ]
        })

        expect(repaired).toContain('Final sınavına girmesi gerektiği halde girmeyen')
        expect(repaired).toContain('bütünleme sınavına girer')
    })

    it('repairs contradictory medicine final makeup answers when the retrieved policy says missing final grants makeup eligibility', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: "Final sınavına girmeden bütünleme sınavına giremezsin. Bütünleme sınavına girebilmek için final sınavına girmesi gereken öğrencilerin bu sınava girmesi gerekiyor.",
            userMessage: 'Tıp fakültesinde finale girmeden bütünlemeye girebilir miyim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Final sınavına girmesi gerektiği halde girmeyen, final sınav puanı 50’nin altında olan veya final sınavına göre hesaplanan dönem sonu başarı notu 60’ın altında olan öğrenciler bütünleme sınavına girebilir. Bütünleme sınavında alınan not bütünleme notunu oluşturur. Bütünleme notu final notu yerine geçer.'
                }
            ]
        })

        expect(repaired).toBe('Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.')
    })

    it('repairs contradictory eligibility denials from affirmative retrieved policy evidence', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Süresinde teslim edilmeyen proje için ek süre alınamaz. Ancak mazereti kabul edilen öğrenciler ek süre talep edebilir.',
            userMessage: 'Mazeretim varsa proje teslimi için ek süre alabilir miyim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Proje Teslim Yönergesi',
                    content: 'Madde 7- Mazereti ilgili kurul tarafından kabul edilen öğrenciler proje teslimi için ek süre talep edebilir. Ek süre kararı ilgili kurul tarafından yazılı olarak bildirilir.'
                }
            ]
        })

        expect(repaired).toContain('Mazereti ilgili kurul tarafından kabul edilen öğrenciler')
        expect(repaired).toContain('ek süre talep edebilir')
        expect(repaired).not.toContain('alınamaz')
    })

    it('does not flip correct without-document denials into conditional affirmative answers', () => {
        const response = 'Sağlık raporu olmadan mazeret sınavına giremezsin. Sağlık mazereti sağlık raporu ile belgelendirilmelidir.'
        const repaired = repairLinkOnlyRagAnswer({
            response,
            userMessage: 'Sağlık raporu vermeden mazeret sınavına giremez miyim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Mazeret Sınavı Yönergesi',
                    content: 'Sağlık mazereti nedeniyle sınavlara katılmayan öğrencilerin sağlık raporu ile belgelendirmesi gerekir. Rapor ilgili birim yönetim kurulu tarafından kabul edilirse mazeret sınavı açılır.'
                }
            ]
        })

        expect(repaired).toBe(response)
    })

    it('adds the official evidence term when the answer uses a user synonym for makeup exams', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Evet, sağlık raporunuz varsa ve bu rapor Fakülte Yönetim Kurulu tarafından kabul edilirse, telafi sınavı açılabilir.',
            userMessage: 'Hasta raporum varsa tıp kurul sınavı için telafi sınavı açılır mı?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Sağlık mazereti nedeniyle sınavlara katılmayan öğrenciler sağlık raporu ile başvurur. Fakülte Yönetim Kurulu tarafından kabul edilen mazeretler için mazeret sınavı açılır.'
                }
            ]
        })

        expect(repaired).toContain('mazeret sınavı (telafi sınavı)')
        expect(repaired).toContain('Fakülte Yönetim Kurulu')
    })

    it('adds the official evidence term when the answer says another exam right is granted', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Mazeretiniz Fakülte Yönetim Kurulu tarafından kabul edilirse, başka bir sınav hakkı tanınabilir.',
            userMessage: 'Tıp fakültesinde kurul sınavına hasta olduğum için giremedim. Başka sınav hakkım var mı?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Sağlık mazereti nedeniyle sınavlara katılmayan öğrenciler sağlık raporu ile başvurur. Fakülte Yönetim Kurulu tarafından kabul edilen mazeretler için mazeret sınavı açılır.'
                }
            ]
        })

        expect(repaired).toContain('mazeret sınavı')
        expect(repaired).toContain('Fakülte Yönetim Kurulu')
    })

    it('repairs vague health-excuse exam answers when the retrieved policy states makeup exam eligibility', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: "Mazeretinizin geçerli sayılması için Fakülte Yönetim Kurulu tarafından kabul edilmesi gerekir. Başka bir sınav hakkı olup olmadığı konusunda öğrenci işleriyle iletişime geçmenizi öneririm.",
            userMessage: 'Tıp fakültesinde kurul sınavına hasta olduğum için giremedim. Başka sınav hakkım var mı?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Sağlık mazereti nedeniyle sınavlara katılmayan öğrenciler sağlık raporu ile başvurur. Fakülte Yönetim Kurulu tarafından kabul edilen mazeretler için mazeret sınavı açılır.'
                }
            ]
        })

        expect(repaired).toContain('Sağlık mazereti')
        expect(repaired).toContain('mazeret sınavı açılır')
    })

    it('repairs contradictory medicine final makeup answers with katılmadan wording', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: "Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girebilir. Yani, final sınavına katılmadan bütünlemeye giremezsiniz.",
            userMessage: 'Tıp fakültesinde finale girmeden bütünlemeye girebilir miyim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Final sınavına girmesi gerektiği halde girmeyen, final sınav puanı 50’nin altında olan veya final sınavına göre hesaplanan dönem sonu başarı notu 60’ın altında olan öğrenciler bütünleme sınavına girebilir. Bütünleme sınavında alınan not bütünleme notunu oluşturur. Bütünleme notu final notu yerine geçer.'
                }
            ]
        })

        expect(repaired).toBe('Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.')
    })

    it('repairs self-contradictory final makeup answers when the answer itself includes the eligibility rule', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Final sınavına girmeden bütünleme sınavına giremezsin. Ancak, final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girebilir.',
            userMessage: 'Tıp fakültesinde finale girmeden bütünlemeye girebilir miyim?',
            responseLanguage: 'tr',
            chunks: []
        })

        expect(repaired).toBe('Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.')
    })

    it('repairs self-contradictory final makeup answers with shortened eligibility wording', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Final sınavına girmeden bütünleme sınavına giremezsin. Ancak final sınavına girmesi gereken, final puanı 50’nin altında olan veya dönem sonu başarı notu 60’ın altında olan öğrenciler bütünleme sınavına girebilir.',
            userMessage: 'Tıp fakültesinde finale girmeden bütünlemeye girebilir miyim?',
            responseLanguage: 'tr',
            chunks: []
        })

        expect(repaired).toBe('Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.')
    })

    it('repairs live medicine final makeup answers that start with an incorrect denial', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Final sınavına girmeden bütünleme sınavına giremezsin. Bütünleme sınavına girebilmek için final sınavına girmesi gereken, final sınav puanı 50’nin altında olan veya final sınavına göre hesaplanan dönem sonu başarı notu 60’ın altında olan öğrenciler bu sınava girebilir.',
            userMessage: 'Tıp fakültesinde finale girmeden bütünlemeye girebilir miyim?',
            responseLanguage: 'tr',
            chunks: []
        })

        expect(repaired).toBe('Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.')
    })

    it('repairs direct-no-right final makeup denials against retrieved medicine policy', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Hayır, finale girmeden doğrudan bütünlemeye girme hakkı yok. Bütünleme sınavına girenler final sınavına girmesi gereken öğrencilerdir.',
            userMessage: 'Tıp fakültesinde finale girmeden bütünlemeye girebilir miyim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Final sınavına girmesi gerektiği halde girmeyen, final sınav puanı 50’nin altında olan veya final sınavına göre hesaplanan dönem sonu başarı notu 60’ın altında olan öğrenciler bütünleme sınavına girebilir. Bütünleme sınavında alınan not bütünleme notunu oluşturur. Bütünleme notu final notu yerine geçer.'
                }
            ]
        })

        expect(repaired).toBe('Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.')
    })

    it('repairs final makeup answers that start with no but then state eligibility', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Hayır. Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girerler.',
            userMessage: 'Tıp fakültesinde finale girmeden bütünlemeye girebilir miyim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Final sınavına girmesi gerektiği halde girmeyen, final sınav puanı 50’nin altında olan veya final sınavına göre hesaplanan dönem sonu başarı notu 60’ın altında olan öğrenciler bütünleme sınavına girebilir. Bütünleme sınavında alınan not bütünleme notunu oluşturur. Bütünleme notu final notu yerine geçer.'
                }
            ]
        })

        expect(repaired).toBe('Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.')
    })

    it('repairs prefixed final makeup answers that start with a no despite eligibility', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'YİÜ AI — Kısa cevap: Hayır, final sınavına girmeden doğrudan bütünlemeye girme hakkı yok. Final sınavına girmesi gerektiği halde girmeyenler bütünleme sınavına girer.',
            userMessage: 'Tıp fakültesinde finale girmeden bütünlemeye girebilir miyim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Final sınavına girmesi gerektiği halde girmeyen, final sınav puanı 50’nin altında olan veya final sınavına göre hesaplanan dönem sonu başarı notu 60’ın altında olan öğrenciler bütünleme sınavına girebilir. Bütünleme sınavında alınan not bütünleme notunu oluşturur. Bütünleme notu final notu yerine geçer.'
                }
            ]
        })

        expect(repaired).toBe('Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.')
    })

    it('repairs final makeup denials that describe eligible students as the students who will take makeup', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Kısa cevap: Hayır, final sınavına girmeden doğrudan bütünlemeye girme hakkı yok. Bütünleme sınavına girecek öğrenciler; final sınavına girmesi gerektiği halde girmeyenler, final notu 50’nin altında olanlar veya dönem sonu başarı notu 60’ın altında olan öğrencilerdir.',
            userMessage: 'Tıp fakültesinde finale girmeden bütünlemeye girebilir miyim?',
            responseLanguage: 'tr',
            chunks: []
        })

        expect(repaired).toBe('Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.')
    })

    it('repairs self-contradictory final makeup answers with missed-final right wording', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: "Final sınavına girmeden bütünleme sınavına giremezsin. Ancak, final sınavına girmediysen veya final puanın 50'nin altında ise bütünleme sınavına katılma hakkın var.",
            userMessage: 'Tıp fakültesinde finale girmeden bütünlemeye girebilir miyim?',
            responseLanguage: 'tr',
            chunks: []
        })

        expect(repaired).toBe('Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.')
    })

    it('does not treat sınav hakkım questions as who/contact requests', () => {
        const response = 'Sağlık mazereti nedeniyle kurul sınavına giremeyen öğrenciler için mazeret sınavı hakkı bulunur.'
        const repaired = repairLinkOnlyRagAnswer({
            response,
            userMessage: 'Tıp fakültesinde kurul sınavına hasta olduğum için giremedim. Başka sınav hakkım var mı?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Adres : Yüksek İhtisas Üniversitesi Rektörlüğü 06530 Telefon : 0312 329 10 10 E-posta : yiu@yiu.edu.tr'
                }
            ]
        })

        expect(repaired).toBe(response)
    })

    it('repairs no-information lecture-note answers when the learning platform evidence is explicit', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu konuda elimde net bilgi yok. Öğrenci işleriyle iletişime geçmeni öneririm.',
            userMessage: 'Ders notlarına nereden ulaşabilirim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Kalite Raporu',
                    content: 'UZEM/MEDU sistemleri ile uzaktan eğitim başarı ile yürütülmüştür. Bu sistem sayesinde çevrim içi dersler gerçekleştirilmiş olup, aynı zamanda ders notlarının paylaşımı da kolaylıkla sağlanmıştır.'
                }
            ]
        })

        expect(repaired).toBe('Ders notlarının paylaşımı UZEM/MEDU sistemleri üzerinden sağlanmıştır.')
    })

    it('repairs blank RAG completions from retrieved lecture-note platform evidence', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: '',
            userMessage: 'Ders notlarına nereden ulaşabilirim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Kalite Raporu',
                    content: 'UZEM/MEDU sistemleri ile uzaktan eğitim başarı ile yürütülmüştür. Bu sistem sayesinde çevrim içi dersler gerçekleştirilmiş olup, aynı zamanda ders notlarının paylaşımı da kolaylıkla sağlanmıştır.'
                }
            ]
        })

        expect(repaired).toBe('Ders notlarının paylaşımı UZEM/MEDU sistemleri üzerinden sağlanmıştır.')
    })

    it('does not turn lecture-note "nereden" questions into address answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Uzaktan Eğitim Politikası adresi: Yüksek İhtisas Üniversitesi Rektörlüğü 06530.',
            userMessage: 'Ders notlarına nereden ulaşabilirim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Uzaktan Eğitim Politikası',
                    content: 'Adres : Yüksek İhtisas Üniversitesi Rektörlüğü 06530 Telefon : 0312 329 10 10. UZEM/MEDU sistemleri üzerinden ders notlarının paylaşımı sağlanmıştır.'
                }
            ]
        })

        expect(repaired).toBe('Ders notlarının paylaşımı UZEM/MEDU sistemleri üzerinden sağlanmıştır.')
    })

    it('repairs lecture-note answers that contain dangling link labels', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: [
                'Ders notlarına ulaşmak için üniversitenin öğrenci bilgi sistemi üzerinden erişim sağlayabilirsiniz.',
                'Daha fazla bilgi için şu linkleri inceleyebilirsiniz:',
                '- Temel Bilgi Teknolojileri Ders içeriği:',
                '- Staj rehberleri ve diğer kaynaklar için:'
            ].join('\n'),
            userMessage: 'Ders notlarına nereden ulaşabilirim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Kalite Raporu',
                    content: 'UZEM/MEDU sistemleri ile uzaktan eğitim başarı ile yürütülmüştür. Bu sistem sayesinde çevrim içi dersler gerçekleştirilmiş olup, aynı zamanda ders notlarının paylaşımı da kolaylıkla sağlanmıştır.'
                }
            ]
        })

        expect(repaired).toBe('Ders notlarının paylaşımı UZEM/MEDU sistemleri üzerinden sağlanmıştır.')
    })

    it('repairs inline dangling lecture-note link labels before assistant continuations', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: "Ders notlarına ulaşmak için Öğrenci Bilgi Sistemi'ni kullanabilirsiniz. Detaylı bilgi için şu bağlantılara göz atabilirsiniz: - Temel Bilgi Teknolojileri Ders içeriği: Başka bir konuda yardımcı olabilir miyim?",
            userMessage: 'Ders notlarına nereden ulaşabilirim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Kalite Raporu',
                    content: 'UZEM/MEDU sistemleri ile uzaktan eğitim başarı ile yürütülmüştür. Bu sistem sayesinde çevrim içi dersler gerçekleştirilmiş olup, aynı zamanda ders notlarının paylaşımı da kolaylıkla sağlanmıştır.'
                }
            ]
        })

        expect(repaired).toBe('Ders notlarının paylaşımı UZEM/MEDU sistemleri üzerinden sağlanmıştır.')
    })

    it('repairs multiple inline dangling lecture-note link labels', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: "Ders notlarına öğrenci bilgi sistemi üzerinden erişebilirsiniz. Daha fazla bilgi için şu linkleri kontrol edebilirsiniz: - Temel Bilgi Teknolojileri Ders içeriği: - Staj rehberleri ve diğer kaynaklar: Başka bir konuda yardımcı olabilir miyim?",
            userMessage: 'Ders notlarına nereden ulaşabilirim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Kalite Raporu',
                    content: 'UZEM/MEDU sistemleri ile uzaktan eğitim başarı ile yürütülmüştür. Bu sistem sayesinde çevrim içi dersler gerçekleştirilmiş olup, aynı zamanda ders notlarının paylaşımı da kolaylıkla sağlanmıştır.'
                }
            ]
        })

        expect(repaired).toBe('Ders notlarının paylaşımı UZEM/MEDU sistemleri üzerinden sağlanmıştır.')
    })

    it('repairs dangling lecture-note labels before other assistant continuations', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: "Ders notlarına OBS üzerinden erişebilirsin. Daha fazla bilgi için şu bağlantılara göz atabilirsiniz: - Temel Bilgi Teknolojileri Ders içeriği: Eğer spesifik bir dersin notlarını arıyorsanız, hangi ders olduğunu belirtin.",
            userMessage: 'Ders notlarına nereden ulaşabilirim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Kalite Raporu',
                    content: 'UZEM/MEDU sistemleri ile uzaktan eğitim başarı ile yürütülmüştür. Bu sistem sayesinde çevrim içi dersler gerçekleştirilmiş olup, aynı zamanda ders notlarının paylaşımı da kolaylıkla sağlanmıştır.'
                }
            ]
        })

        expect(repaired).toBe('Ders notlarının paylaşımı UZEM/MEDU sistemleri üzerinden sağlanmıştır.')
    })

    it('removes contradictory no-information openings when the answer continues with evidence', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Ancak bu konuda elimde net bilgi yok. Seçmeli derslerin sayısı, Seçmeli Ders Kurulu ve yüksekokul kurulu kararı ile belirlenir.',
            userMessage: 'SHMYO öğrencileri mezun olana kadar kaç seçmeli ders almalıyım',
            responseLanguage: 'tr',
            chunks: []
        })

        expect(repaired).toBe('Seçmeli derslerin sayısı, Seçmeli Ders Kurulu ve yüksekokul kurulu kararı ile belirlenir.')
    })

    it('removes no-information wording variants when explicit evidence follows', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu konuda net bilgiye sahip değilim. Seçmeli derslerin sayısı, Seçmeli Ders Kurulu ve yüksekokul kurulu kararı ile belirlenir.',
            userMessage: 'SHMYO öğrencileri mezun olana kadar kaç seçmeli ders almalıyım',
            responseLanguage: 'tr',
            chunks: []
        })

        expect(repaired).toBe('Seçmeli derslerin sayısı, Seçmeli Ders Kurulu ve yüksekokul kurulu kararı ile belirlenir.')
    })

    it('removes unsolicited contact fragments from policy answers when contact was not requested', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Evet, sağlık mazereti nedeniyle kurul sınavına giremeyen öğrenciler için mazeret sınavı düzenlenir. Ancak sağlık raporunuzun Fakülte Yönetim Kurulu tarafından kabul edilmesi gerekmektedir. Mazeret sınavı ile ilgili daha fazla bilgi almak isterseniz, Fakülte Sekreteri ile iletişime geçebilirsiniz. E-posta: yiu@yiu.edu.',
            userMessage: 'Tıp fakültesinde kurul sınavına hasta olduğum için giremedim. Başka sınav hakkım var mı?',
            responseLanguage: 'tr',
            chunks: []
        })

        expect(repaired).toBe('Evet, sağlık mazereti nedeniyle kurul sınavına giremeyen öğrenciler için mazeret sınavı düzenlenir. Ancak sağlık raporunuzun Fakülte Yönetim Kurulu tarafından kabul edilmesi gerekmektedir.')
    })

    it('removes unsolicited inline email sentences from non-contact answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Evet, Tıbbi Laboratuvar Teknikleri Programı öğrencileri Eczane Hizmetleri Programında çift anadal yapabilir. İlgili e-posta adresi: esmasariuzek@yiu.edu.tr. Başka bir sorunuz var mı?',
            userMessage: 'Tıbbi Laboratuvar Teknikleri programında çift anadal yapabilir miyim',
            responseLanguage: 'tr',
            chunks: []
        })

        expect(repaired).toBe('Evet, Tıbbi Laboratuvar Teknikleri Programı öğrencileri Eczane Hizmetleri Programında çift anadal yapabilir. Başka bir sorunuz var mı?')
    })

    it('cleans leading punctuation left after stripping contradictory openings', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Ancak bu konuda elimde net bilgi yok, ancak seçmeli derslerin sayısı yüksekokul kurulu kararı ile belirlenir.',
            userMessage: 'SHMYO öğrencileri mezun olana kadar kaç seçmeli ders almalıyım',
            responseLanguage: 'tr',
            chunks: []
        })

        expect(repaired).toBe('seçmeli derslerin sayısı yüksekokul kurulu kararı ile belirlenir.')
    })

    it('keeps blank RAG completions blank when no extractive evidence matches', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: '',
            userMessage: 'Burs başvuru sonucu ne zaman açıklanır?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'İletişim',
                    content: 'Telefon: +90 312 329 10 10'
                }
            ]
        })

        expect(repaired).toBe('')
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
