import { describe, expect, it } from 'vitest'

import { repairLinkOnlyRagAnswer } from '@/lib/knowledge-base/rag-answer-repair'

describe('repairLinkOnlyRagAnswer', () => {
    it('removes generic assistant closing text from otherwise grounded RAG answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Tıp Fakültesinde eğitim süresi altı yıldır. Daha fazla bilgi istersen yardımcı olabilirim!',
            userMessage: 'Tıp fakültesinde eğitim süresi ne kadar?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Tıp Fakültesinde eğitim süresi altı yıldır.'
                }
            ]
        })

        expect(repaired).toBe('Tıp Fakültesinde eğitim süresi altı yıldır.')
    })

    it('prefers contact evidence over document codes when the user asks for a phone number', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu konuda elimde net bilgi yok.',
            userMessage: 'Yuksek Ihtisas Universitesi genel telefon numarasi nedir?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Öğretim Elemanı ve Personel Bilgilendirme Kılavuzu',
                    content: 'Doküman No: EÖB.KLV.0001'
                },
                {
                    document_title: 'İletişim',
                    content: 'Page Title: İletişim\nTelefon: +90 312 329 10 10'
                }
            ]
        })

        expect(repaired).toBe('Kurum iletişim bilgisi: Telefon: +90 312 329 10 10.')
        expect(repaired).not.toContain('EÖB.KLV.0001')
    })

    it('keeps general institution contact answers generic and prefers labeled phone values over fax values', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bilgi İşlem Daire Başkanlığı iletişim bilgisi: Telefon: +90 312 329 10 10 - E-posta: yiu@yiu.edu.tr.',
            userMessage: 'Yuksek Ihtisas Universitesi genel telefon numarasi nedir?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'İletişim',
                    content: [
                        'Page Title: İletişim',
                        'Rektörlük ve Tıp Fakültesi Telefon +90 312 329 10 10',
                        'Rektörlük Özel Kalem Dahili (201) Dekanlık Sekreteri Dahili (262)',
                        'Tıp Fakültesi Öğrenci İşleri Dahili(265) Tıp Fakültesi Öğrenci İşleri Daire Başkanı Dahili(238)',
                        'Fax +90 312 329 10 15 E-Posta yiu@yiu.edu.tr'
                    ].join(' ')
                },
                {
                    document_title: 'BİDB Bilgisayar, Ağ ve Bilişim Kaynakları Kullanım Yönergesi',
                    content: 'Bilgi İşlem Daire Başkanlığı Bilgi İşlem Daire Başkanı Kalite Koordinatörlüğü Adres : Yüksek İhtisas Üniversitesi Rektörlüğü 06530 Telefon : 0312 329 10 10'
                }
            ]
        })

        expect(repaired).toBe('Kurum iletişim bilgisi: Telefon: +90 312 329 10 10 - E-posta: yiu@yiu.edu.tr.')
        expect(repaired).not.toContain('Bilgi İşlem Daire Başkanlığı')
        expect(repaired).not.toContain('+90 312 329 10 15')
    })

    it('prefers generic institution contact evidence over unit footer evidence for general contact questions', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bilgi İşlem Daire Başkanlığı iletişim bilgisi: Telefon: +90 312 329 10 10 - E-posta: yiu@yiu.edu.tr.',
            userMessage: 'Yuksek Ihtisas Universitesi genel telefon numarasi nedir?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'BİDB Bilgisayar, Ağ ve Bilişim Kaynakları Kullanım Yönergesi',
                    content: 'Hazırlayan Bilgi İşlem Daire Başkanlığı Adres : Yüksek İhtisas Üniversitesi Rektörlüğü 06530 Telefon : 0312 329 10 10'
                },
                {
                    document_title: 'İletişim',
                    content: 'Page Title: İletişim\nRektörlük ve Tıp Fakültesi Telefon +90 312 329 10 10 Fax +90 312 329 10 15 E-Posta yiu@yiu.edu.tr'
                }
            ]
        })

        expect(repaired).toBe('Kurum iletişim bilgisi: Telefon: +90 312 329 10 10 - E-posta: yiu@yiu.edu.tr.')
        expect(repaired).not.toContain('Bilgi İşlem Daire Başkanlığı')
    })

    it('still repairs document numbers when the question is explicitly about a document code', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu konuda elimde net bilgi yok.',
            userMessage: 'Bu kılavuzun doküman numarası nedir?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Öğretim Elemanı ve Personel Bilgilendirme Kılavuzu',
                    content: 'Doküman No: EÖB.KLV.0001'
                },
                {
                    document_title: 'İletişim',
                    content: 'Page Title: İletişim\nTelefon: +90 312 329 10 10'
                }
            ]
        })

        expect(repaired).toBe('"Öğretim Elemanı ve Personel Bilgilendirme Kılavuzu" doküman numarası EÖB.KLV.0001\'dir.')
    })

    it('removes English retrieval boilerplate from Turkish grounded answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'According to the retrieved policy: TLT 216 Yaz Stajı 20 iş günüdür.',
            userMessage: 'Tibbi Laboratuvar Teknikleri programinda yaz staji kac is gunu?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıbbi Laboratuvar Teknikleri Ders İçerikleri',
                    content: 'TLT 216 Yaz Stajı 20 iş günüdür.'
                }
            ]
        })

        expect(repaired).toBe('TLT 216 Yaz Stajı 20 iş günüdür.')
    })

    it('rewrites raw final and makeup-exam article snippets into a direct answer', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: '(2) Final sınavına girmesi gerektiği halde girmeyen öğrenciler bu sınava girer.',
            userMessage: 'Tip fakultesinde finale girmeden butunlemeye girebilir miyim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Bütünleme sınavı olarak adlandırılan sınav yapılır. Final sınavına girmesi gerektiği halde girmeyen öğrenciler bu sınava girer. Bütünleme notu final notu yerine geçer.'
                }
            ]
        })

        expect(repaired).toBe('Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.')
    })

    it('removes generic engagement questions from grounded RAG answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Sağlık Bilimleri Fakültesi adresi: Oğuzlar Mahallesi, 1375. Sk. No: 8, Çankaya / Ankara. Başka bir konuda yardımcı olabilir miyim?',
            userMessage: 'SBF kampüsü nerede?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Yerleşke Konumları',
                    content: 'Sağlık Bilimleri Fakültesi adresi: Oğuzlar Mahallesi, 1375. Sk. No: 8, Çankaya / Ankara.'
                }
            ]
        })

        expect(repaired).toBe('Sağlık Bilimleri Fakültesi adresi: Oğuzlar Mahallesi, 1375. Sk. No: 8, Çankaya / Ankara.')
    })

    it('removes broader generic closing variants from grounded RAG answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Sağlık Bilimleri Fakültesi adresi: Bağlıca Mahallesi Höyük Caddesi No:1 Bağlıca. Daha fazla bilgiye ihtiyacın olursa sormaktan çekinme!',
            userMessage: 'Sağlık Bilimleri Fakültesi adresini açık yazar mısın?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Yerleşke Konumları',
                    content: 'Sağlık Bilimleri Fakültesi adresi: Bağlıca Mahallesi Höyük Caddesi No:1 Bağlıca.'
                }
            ]
        })

        expect(repaired).toBe('Sağlık Bilimleri Fakültesi adresi: Bağlıca Mahallesi Höyük Caddesi No:1 Bağlıca.')
    })

    it('removes generic adjacent-topic help closings after a grounded answer', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Dönem sonu başarı notu, dönem içi kurul notunun %60’ı ile final veya bütünleme notunun %40’ı toplanarak elde edilir. Daha fazla bilgiye ihtiyacın olursa, başka bir konu hakkında yardımcı olabilirim!',
            userMessage: 'Tıpta dönem içi kurul notu başarı notuna nasıl yansıyor?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Dönem sonu başarı notu, dönem içi kurul notunun %60’ı ile final veya bütünleme notunun %40’ı toplanarak elde edilir.'
                }
            ]
        })

        expect(repaired).toBe('Dönem sonu başarı notu, dönem içi kurul notunun %60’ı ile final veya bütünleme notunun %40’ı toplanarak elde edilir.')
    })

    it('removes generic more-detail-or-other-topic questions after a grounded answer', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Her stajın sonunda başarılı olmak için staj notunun 100 üzerinden en az 60 olması zorunludur. Daha fazla detay veya başka bir konu hakkında bilgi ister misin?',
            userMessage: 'Tıp fakültesinde sınıf geçmek için not hesaplama nasıl yapılıyor?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Her stajın sonunda başarılı olmak için staj notunun 100 üzerinden en az 60 olması zorunludur.'
                }
            ]
        })

        expect(repaired).toBe('Her stajın sonunda başarılı olmak için staj notunun 100 üzerinden en az 60 olması zorunludur.')
    })

    it('keeps role-neutral topic-related engagement questions that ask about adjacent grounded details', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Tıp Fakültesi müfredatında yer alan seçmeli derslerden Dönem VI sonuna kadar başarılı olunmalıdır. Bu konuyla ilgili final ve bütünleme şartlarını da öğrenmek ister misin?',
            userMessage: 'Tıp Fakültesinde seçmeli dersleri ne zamana kadar geçmem gerekiyor?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Seçmeli derslerden Dönem VI sonuna kadar başarılı olmalıdır. Final ve bütünleme şartları aynı yönergede düzenlenir.'
                }
            ]
        })

        expect(repaired).toBe('Tıp Fakültesi müfredatında yer alan seçmeli derslerden Dönem VI sonuna kadar başarılı olunmalıdır. Bu konuyla ilgili final ve bütünleme şartlarını da öğrenmek ister misin?')
    })

    it('removes generic prefaces from otherwise topic-related engagement questions', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'SHMYO ders materyallerine MEDU Uzaktan Eğitim Yönetim Sistemi üzerinden erişebilirsin. MEDU platformuna giriş yaptıktan sonra ilgili dersin sayfasında materyalleri bulabilirsin. Daha fazla bilgiye ihtiyaç duyarsan, MEDU sistemine erişimle ilgili detayları öğrenmek ister misin?',
            userMessage: 'SHMYO ders materyallerini MEDU’da nereden göreceğim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'SHMYO MEDU Kullanım Kılavuzu',
                    content: 'SHMYO ders materyallerine MEDU Uzaktan Eğitim Yönetim Sistemi üzerinden erişilir. MEDU sistemine erişim detayları aynı kılavuzda yer alır.'
                }
            ]
        })

        expect(repaired).toBe('SHMYO ders materyallerine MEDU Uzaktan Eğitim Yönetim Sistemi üzerinden erişebilirsin. MEDU platformuna giriş yaptıktan sonra ilgili dersin sayfasında materyalleri bulabilirsin. MEDU sistemine erişimle ilgili detayları öğrenmek ister misin?')
    })

    it('removes generic unspecified-topic help tails after grounded abbreviation answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: '"Tlt" kısaltması, genellikle "Tıbbi Laboratuvar Teknikleri" programını ifade edebilir. Daha fazla bilgiye ihtiyaç duyarsan, belirli bir konu hakkında yardımcı olabilirim!',
            userMessage: 'Tlt hangi programın kısaltması olabilir',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıbbi Laboratuvar Teknikleri Programı',
                    content: 'Tıbbi Laboratuvar Teknikleri programı TLT kısaltmasıyla anılır.'
                }
            ]
        })

        expect(repaired).toBe('"Tlt" kısaltması, genellikle "Tıbbi Laboratuvar Teknikleri" programını ifade edebilir.')
    })

    it('removes generic another-topic questions after grounded policy lists', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Yıllık izin hakkı hizmet süresine göre 14, 20 veya 26 iş günüdür. Daha fazla bilgiye ihtiyaç duyarsan, izin kullanımıyla ilgili başka bir konu var mı?',
            userMessage: 'Personelin yıllık izin hakkı ne kadar?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'İzin Kullanımı Yönergesi',
                    content: 'Yıllık izin hakkı hizmet süresine göre 14, 20 veya 26 iş günüdür.'
                }
            ]
        })

        expect(repaired).toBe('Yıllık izin hakkı hizmet süresine göre 14, 20 veya 26 iş günüdür.')
    })

    it('removes generic which-period clarification tails after grounded medicine answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Dönem içi kurul notu 80 ve üzerinde olan öğrenciler final sınavına girmeksizin dönemi başarıyla tamamlamış kabul edilir. hangi dönemle ilgilendiğini belirtmek ister misin?',
            userMessage: 'Finale girmeden sınıf geçebilir miyim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim Öğretim ve Sınav Yönergesi',
                    content: 'Dönem içi kurul notu 80 ve üzerinde olan öğrenciler final sınavına girmeksizin dönemi başarıyla tamamlamış kabul edilir.'
                }
            ]
        })

        expect(repaired).toBe('Dönem içi kurul notu 80 ve üzerinde olan öğrenciler final sınavına girmeksizin dönemi başarıyla tamamlamış kabul edilir.')
    })

    it('removes truncated generic detail-clarification tails after grounded medicine answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Dönem sonu başarı notu, dönem içi kurul notunun %60’ı ile final veya bütünleme notunun %40’ı toplanarak elde edilir. Daha fazla detay istersen, hangi dönemle ilgili bilgi almak istediğini söyleyebilirs',
            userMessage: 'Tıp fakültesinde sınıf geçmek için not hesaplama nasıl yapılıyor?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim Öğretim ve Sınav Yönergesi',
                    content: 'Dönem sonu başarı notu, dönem içi kurul notunun %60’ı ile final veya bütünleme notunun %40’ı toplanarak elde edilir.'
                }
            ]
        })

        expect(repaired).toBe('Dönem sonu başarı notu, dönem içi kurul notunun %60’ı ile final veya bütünleme notunun %40’ı toplanarak elde edilir.')
    })

    it('removes generic specific-topic detail offers after grounded medicine answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Dönem sonu başarı notu, dönem içi kurul notunun %60’ı ile final veya bütünleme notunun %40’ı toplanarak elde edilir. Daha fazla detay istersen, belirli bir dönem veya konu hakkında bilgi verebilirim!',
            userMessage: 'Tıp fakültesinde sınıf geçmek için not hesaplama nasıl yapılıyor?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim Öğretim ve Sınav Yönergesi',
                    content: 'Dönem sonu başarı notu, dönem içi kurul notunun %60’ı ile final veya bütünleme notunun %40’ı toplanarak elde edilir.'
                }
            ]
        })

        expect(repaired).toBe('Dönem sonu başarı notu, dönem içi kurul notunun %60’ı ile final veya bütünleme notunun %40’ı toplanarak elde edilir.')
    })

    it('removes generic clarification tails from grounded policy answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Dönem sonu başarı notu, dönem içi kurul notunun %60’ı ile final veya bütünleme notunun %40’ı toplanarak elde edilir. Daha fazla bilgiye ihtiyacın olursa, hangi dönemle ilgili olduğunu belirtirsen yardımcı olabilirim!',
            userMessage: 'Tıp fakültesinde sınıf geçmek için not hesaplama nasıl yapılıyor',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim Öğretim ve Sınav Yönergesi',
                    content: 'Dönem sonu başarı notu, dönem içi kurul notunun %60’ı ile final veya bütünleme notunun %40’ı toplanarak elde edilir.'
                }
            ]
        })

        expect(repaired).toBe('Dönem sonu başarı notu, dönem içi kurul notunun %60’ı ile final veya bütünleme notunun %40’ı toplanarak elde edilir.')
    })

    it('removes role-assumptive program clarification tails from grounded elective answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Seçmeli derslerin sayısı Yüksekokul Kurulu kararına göre belirlenir. Daha spesifik bilgi almak isterseniz, hangi bölümde okuduğunuzu belirtir misiniz?',
            userMessage: 'Mezun olana kadar kaç seçmeli ders almalıyım',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Seçmeli Dersler Yönergesi',
                    content: 'Seçmeli derslerin sayısı Yüksekokul Kurulu kararına göre belirlenir.'
                }
            ]
        })

        expect(repaired).toBe('Seçmeli derslerin sayısı Yüksekokul Kurulu kararına göre belirlenir.')
    })

    it('removes generic support-and-link tails from grounded MEDU answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'MEDU Uzaktan Eğitim Yönetim Sistemi’nde ders materyallerine erişmek için ilgili ders sayfasına girilir. Eğer daha fazla yardıma ihtiyacın olursa, teknik destek için YİUZEM ile iletişime geçebilirsin. MEDU hakkında https://example.edu.tr/medu.pdf',
            userMessage: 'SHMYO ders materyallerini MEDU’da nereden göreceğim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'MEDU Kullanım Kılavuzu',
                    content: 'MEDU Uzaktan Eğitim Yönetim Sistemi’nde ders materyallerine erişmek için ilgili ders sayfasına girilir.'
                }
            ]
        })

        expect(repaired).toBe('MEDU Uzaktan Eğitim Yönetim Sistemi’nde ders materyallerine erişmek için ilgili ders sayfasına girilir.')
    })

    it('removes generic visit-the-page tails from grounded MEDU answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'SHMYO ders materyallerine MEDU Uzaktan Eğitim Yönetim Sistemi üzerinden erişebilirsin. Daha fazla bilgiye ihtiyacın olursa, MEDU sisteminin genel sayfasını ziyaret edebilirsin: https://example.edu.tr/medu.pdf',
            userMessage: 'SHMYO ders materyallerini MEDU’da nereden göreceğim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'MEDU Kullanım Kılavuzu',
                    content: 'SHMYO ders materyallerine MEDU Uzaktan Eğitim Yönetim Sistemi üzerinden erişilir.'
                }
            ]
        })

        expect(repaired).toBe('SHMYO ders materyallerine MEDU Uzaktan Eğitim Yönetim Sistemi üzerinden erişebilirsin.')
    })

    it('repairs no-information abbreviation answers from retrieved title initialisms', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: '"Tlt" kısaltmasıyla ilgili elimde net bir bilgi yok. Ancak, Yüksek İhtisas Üniversitesi’nde https://example.edu.tr/tlt.pdf',
            userMessage: 'Tlt hangi programın kısaltması olabilir',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'TIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI - 2025 ÖZ DEĞERLENDİRME RAPORU',
                    content: 'Page Title: TIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI - 2025 ÖZ DEĞERLENDİRME RAPORU\nSource URL: https://example.edu.tr/tlt.pdf\n\nTLT 216 Yaz Stajı.'
                }
            ]
        })

        expect(repaired).toBe('"TLT", Tıbbi Laboratuvar Teknikleri programının kısaltması olabilir.')
    })

    it('keeps role-neutral engagement offers about related topic details', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Mazeret sınavı için sağlık raporu üç iş günü içinde ilgili birime sunulmalıdır. Bu konuyla ilgili gerekli belgeler ve kurul onayı süreci hakkında da bilgi verebilirim.',
            userMessage: 'Sağlık raporu vermeden mazeret sınavına giremez miyim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Mazeret Sınavı Yönergesi',
                    content: 'Mazeret sınavı için sağlık raporu üç iş günü içinde ilgili birime sunulmalıdır. Gerekli belgeler ve kurul onayı süreci aynı yönergede yer alır.'
                }
            ]
        })

        expect(repaired).toBe('Mazeret sınavı için sağlık raporu üç iş günü içinde ilgili birime sunulmalıdır. Bu konuyla ilgili gerekli belgeler ve kurul onayı süreci hakkında da bilgi verebilirim.')
    })

    it('removes generic personal-help closing variants from grounded RAG answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: '"TLT", Tıbbi Laboratuvar Teknikleri programının kısaltmasıdır. Daha fazla bilgi istersen, sana yardımcı olabilirim!',
            userMessage: 'TLT hangi programın kısaltması olabilir?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıbbi Laboratuvar Teknikleri',
                    content: 'TLT, Tıbbi Laboratuvar Teknikleri programının kısaltmasıdır.'
                }
            ]
        })

        expect(repaired).toBe('"TLT", Tıbbi Laboratuvar Teknikleri programının kısaltmasıdır.')
    })

    it('removes generic polite-help closing variants from grounded RAG answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Tıp Fakültesi seçmeli derslerinden Dönem VI sonuna kadar başarılı olmalısın. Başka bir sorunuz varsa yardımcı olmaktan memnuniyet duyarım!',
            userMessage: 'Tıp Fakültesinde seçmeli dersleri ne zamana kadar geçmem gerekiyor?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Tıp Fakültesi seçmeli derslerinden Dönem VI sonuna kadar başarılı olmalısın.'
                }
            ]
        })

        expect(repaired).toBe('Tıp Fakültesi seçmeli derslerinden Dönem VI sonuna kadar başarılı olmalısın.')
    })

    it('removes generic please-specify closings while preserving the grounded answer', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Ders notlarına MEDU platformu üzerinden ulaşabilirsin. Eğer daha fazla bilgiye ihtiyacın varsa, lütfen belirt!',
            userMessage: 'Ders notlarına nereden ulaşabilirim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'MEDU Kullanımı',
                    content: 'Ders notlarına MEDU platformu üzerinden ulaşabilirsin.'
                }
            ]
        })

        expect(repaired).toBe('Ders notlarına MEDU platformu üzerinden ulaşabilirsin.')
    })

    it('removes generic need-more-information question closings', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Sağlık Bilimleri Fakültesi adresi: Bağlıca Mahallesi Höyük Caddesi No:1 Bağlıca. Daha fazla bilgiye ihtiyacın var mı?',
            userMessage: 'Sağlık Bilimleri Fakültesi adresini açık yazar mısın?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Yerleşke Konumları',
                    content: 'Sağlık Bilimleri Fakültesi adresi: Bağlıca Mahallesi Höyük Caddesi No:1 Bağlıca.'
                }
            ]
        })

        expect(repaired).toBe('Sağlık Bilimleri Fakültesi adresi: Bağlıca Mahallesi Höyük Caddesi No:1 Bağlıca.')
    })

    it('removes generic need-anything-else closings', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Tıbbi Laboratuvar Teknikleri programı Balgat Yerleşkesi’nde eğitim vermektedir. Başka bir bilgiye ihtiyacın var mı?',
            userMessage: 'Tıbbi Laboratuvar Teknikleri hangi yerleşkede?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Program Yerleşkeleri',
                    content: 'Tıbbi Laboratuvar Teknikleri programı Balgat Yerleşkesi’nde eğitim vermektedir.'
                }
            ]
        })

        expect(repaired).toBe('Tıbbi Laboratuvar Teknikleri programı Balgat Yerleşkesi’nde eğitim vermektedir.')
    })

    it('removes generic more-detail question closings', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Dönem sonu başarı notu, dönem içi kurul notunun %60’ı ve final/bütünleme notunun %40’ı ile hesaplanır. Daha fazla detay ister misin?',
            userMessage: 'Tıp fakültesinde sınıf geçme notu nasıl hesaplanıyor?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Dönem sonu başarı notu, dönem içi kurul notunun %60’ı ve final/bütünleme notunun %40’ı ile hesaplanır.'
                }
            ]
        })

        expect(repaired).toBe('Dönem sonu başarı notu, dönem içi kurul notunun %60’ı ve final/bütünleme notunun %40’ı ile hesaplanır.')
    })

    it('removes generic contact-the-unit deferrals from grounded answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Seçmeli derslerin sayısı, Yüksekokul Kurulu tarafından belirlenir. Bu konuda kesin bilgiye ulaşmak için ilgili bölüm veya fakülte ile iletişime geçmeni öneririm.',
            userMessage: 'Mezun olana kadar kaç seçmeli ders almalıyım',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'MYO Eğitim Öğretim Yönergesi',
                    content: 'Seçmeli derslerin sayısı, Yüksekokul Kurulu tarafından belirlenir.'
                }
            ]
        })

        expect(repaired).toBe('Seçmeli derslerin sayısı, Yüksekokul Kurulu tarafından belirlenir.')
    })

    it('removes generic more-information question closings without stripping topic-specific offers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Tıbbi Laboratuvar Teknikleri programı Balgat Yerleşkesi’nde eğitim vermektedir. Başka bir bilgi ister misin?',
            userMessage: 'Tıbbi Laboratuvar Teknikleri hangi yerleşkede?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Program Yerleşkeleri',
                    content: 'Tıbbi Laboratuvar Teknikleri programı Balgat Yerleşkesi’nde eğitim vermektedir.'
                }
            ]
        })

        expect(repaired).toBe('Tıbbi Laboratuvar Teknikleri programı Balgat Yerleşkesi’nde eğitim vermektedir.')
    })

    it('removes role-assumptive education-status clarification tails from grounded answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Ders notlarına MEDU platformu üzerinden ulaşabilirsin. Daha fazla bilgiye ihtiyacın olursa, hangi bölümde eğitim aldığını belirtirsen yardımcı olabilirim!',
            userMessage: 'Ders notlarına nereden ulaşabilirim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'MEDU Kullanımı',
                    content: 'Ders notlarına MEDU platformu üzerinden ulaşılabilir.'
                }
            ]
        })

        expect(repaired).toBe('Ders notlarına MEDU platformu üzerinden ulaşabilirsin.')
    })

    it('removes role-assumptive department-status clarification tails from grounded answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Mazeret sınavı için sağlık raporu üç iş günü içinde ilgili birime sunulmalıdır. Daha fazla bilgi isterseniz, hangi bölümde olduğunuzu öğrenebilir miyim?',
            userMessage: 'Tıp fakültesinde kurul sınavına hasta olduğum için giremedim. Başka sınav hakkım var mı?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Mazeret Sınavı Yönergesi',
                    content: 'Mazeret sınavı için sağlık raporu üç iş günü içinde ilgili birime sunulmalıdır.'
                }
            ]
        })

        expect(repaired).toBe('Mazeret sınavı için sağlık raporu üç iş günü içinde ilgili birime sunulmalıdır.')
    })

    it('removes role-assumptive education-intent prompts from grounded answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Seçmeli derslerin sayısı Yüksekokul Kurulu tarafından belirlenir. Detaylı bilgi almak istersen, hangi bölümde eğitim almak istediğini söyleyebilirsin.',
            userMessage: 'SHMYO seçmeli ders sayısı nasıl belirleniyor?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Seçmeli Ders Yönergesi',
                    content: 'Seçmeli derslerin sayısı Yüksekokul Kurulu tarafından belirlenir.'
                }
            ]
        })

        expect(repaired).toBe('Seçmeli derslerin sayısı Yüksekokul Kurulu tarafından belirlenir.')
    })

    it('removes role-assumptive education-status question tails from grounded answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Ders notlarına MEDU platformu üzerinden ulaşabilirsin. Daha fazla bilgiye ihtiyaç duyarsan, hangi bölümde eğitim aldığını belirtebilir misin?',
            userMessage: 'Ders notlarına nereden ulaşabilirim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'MEDU Kullanımı',
                    content: 'Ders notlarına MEDU platformu üzerinden ulaşılabilir.'
                }
            ]
        })

        expect(repaired).toBe('Ders notlarına MEDU platformu üzerinden ulaşabilirsin.')
    })

    it('removes generic helper closings that ask about another topic', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'TLT 216 Yaz Stajı 20 iş günü sürmektedir. Daha fazla bilgi istersen, başka bir konu hakkında yardımcı olabilir miyim?',
            userMessage: 'TLT yaz stajı kaç iş günü?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıbbi Laboratuvar Teknikleri Staj',
                    content: 'TLT 216 Yaz Stajı 20 iş günü sürmektedir.'
                }
            ]
        })

        expect(repaired).toBe('TLT 216 Yaz Stajı 20 iş günü sürmektedir.')
    })

    it('removes generic helper closings about unspecified program details', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: '"TLT", Tıbbi Laboratuvar Teknikleri programının kısaltmasıdır. Daha fazla bilgi istersen, programın detayları hakkında yardımcı olabilirim!',
            userMessage: 'TLT hangi programın kısaltması?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıbbi Laboratuvar Teknikleri',
                    content: 'TLT, Tıbbi Laboratuvar Teknikleri programının kısaltmasıdır.'
                }
            ]
        })

        expect(repaired).toBe('"TLT", Tıbbi Laboratuvar Teknikleri programının kısaltmasıdır.')
    })

    it('removes generic share-more closings about unspecified program details', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: '"TLT", Tıbbi Laboratuvar Teknikleri Programı’nın kısaltmasıdır. Daha fazla bilgi istersen, programın detaylarını paylaşabilirim!',
            userMessage: 'TLT hangi programın kısaltması?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıbbi Laboratuvar Teknikleri',
                    content: 'TLT, Tıbbi Laboratuvar Teknikleri programının kısaltmasıdır.'
                }
            ]
        })

        expect(repaired).toBe('"TLT", Tıbbi Laboratuvar Teknikleri Programı’nın kısaltmasıdır.')
    })

    it('removes generic help-needed contact deferrals from grounded answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Ders materyallerine MEDU platformunda ilgili ders sayfasından erişilebilir. Eğer daha fazla yardıma ihtiyacınız olursa, öğrenci işleriyle iletişime geçebilirsiniz. İletişim bilgileri için buraya bakabilirsiniz: https://example.edu.tr/ogrenci-isleri',
            userMessage: 'MEDU ders materyallerine nereden ulaşırım?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'MEDU Kullanımı',
                    content: 'Ders materyallerine MEDU platformunda ilgili ders sayfasından erişilebilir.'
                }
            ]
        })

        expect(repaired).toBe('Ders materyallerine MEDU platformunda ilgili ders sayfasından erişilebilir.')
    })

    it('removes generic role-assumptive contact deferrals after grounded elective answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Seçmeli ders sayısı, Yüksekokul Kurulu tarafından belirlenir. Bu nedenle, hangi programda olduğuna bağlı olarak alman gereken seçmeli ders sayısını öğrenmek için ilgili bölümle iletişime geçmeni öneririm. Hangi bölümle ilgilendiğini belirtirsen, daha fazla yardımcı olabilirim!',
            userMessage: 'SHMYO seçmeli ders sayısı nasıl belirleniyor?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Seçmeli Ders Yönergesi',
                    content: 'Seçmeli ders sayısı, Yüksekokul Kurulu tarafından belirlenir.'
                }
            ]
        })

        expect(repaired).toBe('Seçmeli ders sayısı, Yüksekokul Kurulu tarafından belirlenir.')
    })

    it('removes role-assumptive program-dependent deferrals after grounded elective answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Seçmeli ders sayısı, Yüksekokul Kurulu tarafından belirlenir ve eğitim-öğretim planında belirtilir. Bu nedenle, hangi programda olduğuna bağlı olarak değişebilir. Hangi bölümle ilgilendiğini belirtirsen, daha fazla bilgi verebilirim.',
            userMessage: 'Mezun olana kadar kaç seçmeli ders almalıyım',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Seçmeli Ders Yönergesi',
                    content: 'Seçmeli ders sayısı, Yüksekokul Kurulu tarafından belirlenir ve eğitim-öğretim planında belirtilir.'
                }
            ]
        })

        expect(repaired).toBe('Seçmeli ders sayısı, Yüksekokul Kurulu tarafından belirlenir ve eğitim-öğretim planında belirtilir.')
    })

    it('removes role-assumptive which-department followups after grounded elective answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Seçmeli ders sayısı, programınıza göre değişiklik gösterebilir. Genel olarak, hangi derslerin alınacağına ve yarıyıllara dağılımına Fakülte Kurulu karar verir. Bu nedenle, hangi bölümde okuduğunuzu belirtirseniz, daha spesifik bilgi verebilirim. Hangi bölümle ilgileniyorsunuz?',
            userMessage: 'Mezun olana kadar kaç seçmeli ders almalıyım',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Seçmeli Ders Yönergesi',
                    content: 'Seçmeli derslerin hangi derslerden oluşacağına ve yarıyıllara dağılımına Fakülte Kurulu karar verir.'
                }
            ]
        })

        expect(repaired).toBe('Seçmeli ders sayısı, programınıza göre değişiklik gösterebilir. Genel olarak, hangi derslerin alınacağına ve yarıyıllara dağılımına Fakülte Kurulu karar verir.')
    })

    it('removes role-assumptive which-department detail requests after grounded elective answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Seçmeli ders sayısı, programınıza ve fakültenize bağlı olarak değişir. Genel olarak alınması gereken sayıya Fakülte Kurulu karar verir. Bu konuda daha net bilgi almak için hangi bölümde okuduğunuzu belirtir misiniz?',
            userMessage: 'Mezun olana kadar kaç seçmeli ders almalıyım',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Seçmeli Ders Yönergesi',
                    content: 'Seçmeli derslerin alınması gereken sayısına Fakülte Kurulu karar verir.'
                }
            ]
        })

        expect(repaired).toBe('Seçmeli ders sayısı, programınıza ve fakültenize bağlı olarak değişir. Genel olarak alınması gereken sayıya Fakülte Kurulu karar verir.')
    })

    it('removes role-assumptive which-department question variants after grounded elective answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Seçmeli derslerin sayısına Fakülte Kurulu karar verir. Hangi bölümde okuduğunuzu öğrenebilir miyim? Böylece daha spesifik bilgi verebilirim.',
            userMessage: 'Mezun olana kadar kaç seçmeli ders almalıyım',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Seçmeli Ders Yönergesi',
                    content: 'Seçmeli derslerin alınması gereken sayısına Fakülte Kurulu karar verir.'
                }
            ]
        })

        expect(repaired).toBe('Seçmeli derslerin sayısına Fakülte Kurulu karar verir.')
    })

    it('removes generic more-information navigation tails that assume the user owns the course', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Ders notlarına MEDU platformu üzerinden ulaşılabilir. Daha fazla bilgi istersen, platforma giriş yaparak derslerinle ilgili içeriklere ulaşabilirsin.',
            userMessage: 'Ders notlarına nereden ulaşabilirim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'MEDU Kullanımı',
                    content: 'Ders notlarına MEDU platformu üzerinden ulaşılabilir.'
                }
            ]
        })

        expect(repaired).toBe('Ders notlarına MEDU platformu üzerinden ulaşılabilir.')
    })

    it('removes generic platform-navigation tails plus assistant helper prompts from grounded MEDU answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Ders notlarına MEDU platformu üzerinden ulaşabilirsin. Daha fazla bilgi istersen, platforma giriş yaparak derslerinle ilgili içeriklere ulaşabilirsin. Eğer başka bir konuda yardımcı olmamı istersen, lütfen belirt!',
            userMessage: 'Ders notlarına nereden ulaşabilirim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'MEDU Kullanımı',
                    content: 'Ders notlarına MEDU platformu üzerinden ulaşılabilir.'
                }
            ]
        })

        expect(repaired).toBe('Ders notlarına MEDU platformu üzerinden ulaşabilirsin.')
    })

    it('removes generic academic-advisor deferral tails from grounded answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Seçmeli ders sayısı Yüksekokul Kurulu tarafından belirlenir. Bu konuda kesin bilgi almak için ilgili bölümünüzün akademik danışmanıyla görüşmenizi öneririm.',
            userMessage: 'Mezun olana kadar kaç seçmeli ders almalıyım',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Seçmeli Ders Yönergesi',
                    content: 'Seçmeli ders sayısı Yüksekokul Kurulu tarafından belirlenir.'
                }
            ]
        })

        expect(repaired).toBe('Seçmeli ders sayısı Yüksekokul Kurulu tarafından belirlenir.')
    })

    it('removes a generic contact deferral once a trailing assistant closing is stripped', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Sağlık raporu Fakülte Yönetim Kurulu tarafından kabul edilirse mazeret sınavı açılır. Daha fazla bilgi isterseniz, ilgili birimle iletişime geçebilirsiniz. Yardımcı olmamı istediğiniz başka bir konu var mı?',
            userMessage: 'Sağlık raporu vermeden mazeret sınavına giremez miyim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Sağlık raporu Fakülte Yönetim Kurulu tarafından kabul edilirse mazeret sınavı açılır.'
                }
            ]
        })

        expect(repaired).toBe('Sağlık raporu Fakülte Yönetim Kurulu tarafından kabul edilirse mazeret sınavı açılır.')
    })

    it('removes generic link-preface tails from grounded factual answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'TLT 216 Yaz Stajı 20 iş günü sürmektedir. Daha fazla bilgi için buraya göz atabilirsin: https://example.edu.tr/tlt-staj.pdf',
            userMessage: 'TLT yaz stajı kaç iş günü?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıbbi Laboratuvar Teknikleri Staj',
                    content: 'TLT 216 Yaz Stajı 20 iş günü sürmektedir.'
                }
            ]
        })

        expect(repaired).toBe('TLT 216 Yaz Stajı 20 iş günü sürmektedir.')
    })

    it('removes generic need-more-information link-preface tails from grounded factual answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Sağlık Bilimleri Fakültesi adresi: Bağlıca Mahallesi Höyük Caddesi No:1 Bağlıca. Daha fazla bilgiye ihtiyacın olursa buradan ulaşabilirsin: https://example.edu.tr/yerleske',
            userMessage: 'Sağlık Bilimleri Fakültesi adresini açık yazar mısın?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Yerleşke Konumları',
                    content: 'Sağlık Bilimleri Fakültesi adresi: Bağlıca Mahallesi Höyük Caddesi No:1 Bağlıca.'
                }
            ]
        })

        expect(repaired).toBe('Sağlık Bilimleri Fakültesi adresi: Bağlıca Mahallesi Höyük Caddesi No:1 Bağlıca.')
    })

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

    it('repairs link-only eligibility answers from retrieved denial evidence', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Erasmus programı ile ilgili detaylar için uluslararası öğrenci koordinatörlüğü ile iletişime geçmeni öneririm. Daha fazla bilgi için: https://example.edu.tr/uluslararasi-ogrenci-koordinatorlugu',
            userMessage: 'Hazırlık öğrencisi erasmustan yararlanır mı',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Erasmus + Yönergesi',
                    content: 'Page Title: Erasmus + Yönergesi\nSource URL: https://example.edu.tr/erasmus-yonergesi.pdf\n\nErasmus+ Programı kapsamında hazırlık sınıfı öğrencileri programdan yararlanamaz.'
                }
            ]
        })

        expect(repaired).toBe('Erasmus+ Programı kapsamında hazırlık sınıfı öğrencileri programdan yararlanamaz.')
        expect(repaired).not.toContain('iletişime geç')
        expect(repaired).not.toContain('https://')
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

    it('repairs acronym-based internship duration questions from expanded program evidence', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu konuda elimde net bilgi yok.',
            userMessage: 'TLT programında yaz stajı var mı, kaç gün?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıbbi Laboratuvar Teknikleri Programı Öz Değerlendirme',
                    content: 'Page Title: Tıbbi Laboratuvar Teknikleri Programı Öz Değerlendirme\nSource URL: https://example.edu.tr/laboratuvar-teknikleri.pdf\n\nTıbbi Laboratuvar Teknikleri Programı öğrencileri Yaz Stajı dersini 20 iş günü süresince tamamlar.'
                }
            ]
        })

        expect(repaired).toBe('Tıbbi Laboratuvar Teknikleri Programı öğrencileri Yaz Stajı dersini 20 iş günü süresince tamamlar.')
    })

    it('compacts long course-table internship rows when repairing duration answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu konuda elimde net bilgi yok.',
            userMessage: 'TLT programında yaz stajı var mı, kaç gün?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıbbi Laboratuvar Teknikleri Programı Öz Değerlendirme',
                    content: 'Page Title: Tıbbi Laboratuvar Teknikleri Programı Öz Değerlendirme\nSource URL: https://example.edu.tr/laboratuvar-teknikleri.pdf\n\nTürk Dili II 75 %100 İNG 104 İngilizce II 67 %100 TLT 215 Biyokimya 87 %100 TLT 217 Biyokimya Laboratuvarı 81 %100 TLT 216 Yaz Stajı (20 iş günü) 74 %100 TLT ASEC 111 Anatomi 74 %25 Genel Mikrobiyoloji 47 %100'
                }
            ]
        })

        expect(repaired).toBe('TLT 216 Yaz Stajı 20 iş günüdür.')
    })

    it('repairs policy duration answers from matching list items when the model selected nearby unrelated policy text', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu şekilde görevlendirilen personel, kurumlarından aylıklı izinli sayılır ve görevlendirmede geçen süreler fiilen kendi mesleklerinde geçirilmiş olarak kabul edilir.',
            userMessage: '15 yıl çalışan personelin yıllık izin hakkı kaç gün?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'İzin Kullanımı Yönergesi',
                    content: [
                        'Page Title: İzin Kullanımı Yönergesi',
                        'Source URL: https://example.edu.tr/izin.pdf',
                        'Madde 6- Akademik ve İdari personelin, yıllık hizmetlerine göre kullanabilecekleri izin süreleri aşağıda belirtilmiştir.',
                        'Hizmet süresi;',
                        '• 1 yıldan 5 yıla kadar (5 yıl dahil) olanlara 14 iş günü.',
                        '• 5 yıldan fazla 15 yıldan az olanlara 20 iş günü.',
                        '• 15 yıl (dahil) ve daha fazla olanlara 26 iş günü.'
                    ].join('\n')
                }
            ]
        })

        expect(repaired).toBe('15 yıl (dahil) ve daha fazla olanlara 26 iş günüdür.')
    })

    it('keeps all duration brackets when the user asks a broad policy-duration question', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: '1 yıldan 5 yıla kadar (5 yıl dahil) olanlara 14 iş günüdür.',
            userMessage: 'Personelin yıllık izin hakkı ne kadar?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'İzin Kullanımı Yönergesi',
                    content: [
                        'Page Title: İzin Kullanımı Yönergesi',
                        'Source URL: https://example.edu.tr/izin.pdf',
                        'Madde 6- Akademik ve İdari personelin, yıllık hizmetlerine göre kullanabilecekleri izin süreleri aşağıda belirtilmiştir.',
                        'Hizmet süresi;',
                        '• 1 yıldan 5 yıla kadar (5 yıl dahil) olanlara 14 iş günü.',
                        '• 5 yıldan fazla 15 yıldan az olanlara 20 iş günü.',
                        '• 15 yıl (dahil) ve daha fazla olanlara 26 iş günü.'
                    ].join('\n')
                }
            ]
        })

        expect(repaired).toBe('1 yıldan 5 yıla kadar (5 yıl dahil) olanlara 14 iş günü; 5 yıldan fazla 15 yıldan az olanlara 20 iş günü; 15 yıl (dahil) ve daha fazla olanlara 26 iş günüdür.')
    })

    it('keeps policy duration groups when retrieved evidence separates general and exception brackets', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: '1 yıldan 5 yıla kadar (5 yıl dahil) olanlara 14 iş günü; 5 yıldan fazla 15 yıldan az olanlara 20 iş günü; 15 yıl (dahil) ve daha fazla olanlara 26 iş günü; 1 yıldan 14 yıla kadar (14 yıl dahil) olanlara 20 iş günü; 15 yıl (dahil) ve daha fazla olanlara 26 iş günüdür.',
            userMessage: 'Personelin yıllık izin hakkı ne kadar?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'İzin Kullanımı Yönergesi',
                    content: [
                        'Madde 6- Akademik ve İdari personelin, yıllık hizmetlerine göre kullanabilecekleri izin süreleri aşağıda belirtilmiştir.',
                        'Hizmet süresi;',
                        '• 1 yıldan 5 yıla kadar (5 yıl dahil) olanlara 14 iş günü.',
                        '• 5 yıldan fazla 15 yıldan az olanlara 20 iş günü.',
                        '• 15 yıl (dahil) ve daha fazla olanlara 26 iş günü.',
                        '18 ve daha küçük yaştaki çalışanlar ile 50 ve daha yukarıdaki yaştaki çalışanlar için ise;',
                        '• 1 yıldan 14 yıla kadar (14 yıl dahil) olanlara 20 iş günü.',
                        '• 15 yıl (dahil) ve daha fazla olanlara 26 iş günü.'
                    ].join('\n')
                }
            ]
        })

        expect(repaired).toBe([
            'Kaynakta yıllık izin süreleri iki grup halinde verilmiş:',
            '- Genel akademik ve idari personel: 1 yıldan 5 yıla kadar (5 yıl dahil) olanlara 14 iş günü; 5 yıldan fazla 15 yıldan az olanlara 20 iş günü; 15 yıl (dahil) ve daha fazla olanlara 26 iş günü.',
            '- 18 ve daha küçük yaştaki çalışanlar ile 50 ve daha yukarıdaki yaştaki çalışanlar: 1 yıldan 14 yıla kadar (14 yıl dahil) olanlara 20 iş günü; 15 yıl (dahil) ve daha fazla olanlara 26 iş günü.'
        ].join('\n'))
    })

    it('prefers annual-leave duration brackets over nearby leave-request deadline sentences', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Yıllık izin talepleri en az 15 gün önceden izin talep formu doldurularak talep edilir.',
            userMessage: 'Personelin yıllık izin hakkı ne kadar?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'İzin Kullanımı Yönergesi',
                    content: 'Yıllık izin talepleri en az 15 (on beş) gün önceden izin talep formu doldurularak talep edilir.'
                },
                {
                    document_title: 'İzin Kullanımı Yönergesi',
                    content: [
                        'Madde 6- Akademik ve İdari personelin, yıllık hizmetlerine göre kullanabilecekleri izin süreleri aşağıda belirtilmiştir.',
                        'Hizmet süresi;',
                        '• 1 yıldan 5 yıla kadar (5 yıl dahil) olanlara 14 iş günü.',
                        '• 5 yıldan fazla 15 yıldan az olanlara 20 iş günü.',
                        '• 15 yıl (dahil) ve daha fazla olanlara 26 iş günü.'
                    ].join('\n')
                }
            ]
        })

        expect(repaired).toBe('1 yıldan 5 yıla kadar (5 yıl dahil) olanlara 14 iş günü; 5 yıldan fazla 15 yıldan az olanlara 20 iş günü; 15 yıl (dahil) ve daha fazla olanlara 26 iş günüdür.')
    })

    it('repairs threshold duration answers when the response repeats the threshold but misses the answer duration', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: '15 yıl ve daha fazla çalışan personel yıllık ücretli izin kapsamında değerlendirilir.',
            userMessage: '15 yıl çalışan personelin yıllık izin hakkı kaç gün?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'İzin Kullanımı Yönergesi',
                    content: 'Yıllık Ücretli İzin Süreleri\n- 15 yıl (dahil) ve daha fazla olanlara 26 iş günü.'
                }
            ]
        })

        expect(repaired).toBe('15 yıl (dahil) ve daha fazla olanlara 26 iş günüdür.')
    })

    it('does not replace an already correct duration answer with a later unrelated duration sentence', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: '15 yıl (dahil) ve daha fazla çalışan personelin yıllık izin hakkı 26 iş günüdür. Başka bir konuda yardımcı olabilir miyim?',
            userMessage: '15 yıl çalışan personelin yıllık izin hakkı kaç gün?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'İzin Kullanımı Yönergesi',
                    content: 'Yıllık Ücretli İzin Süreleri\n- 15 yıl (dahil) ve daha fazla olanlara 26 iş günü.'
                },
                {
                    document_title: 'Yükseköğretim Kanunu',
                    content: 'Üyelerin görev süresi üç yıldır.'
                }
            ]
        })

        expect(repaired).toBe('15 yıl (dahil) ve daha fazla çalışan personelin yıllık izin hakkı 26 iş günüdür.')
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

    it('keeps pass-without-final intent on the final exemption rule instead of makeup eligibility', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.',
            userMessage: 'Tıpta hangi şartlarda finale girmeden geçebilirim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Ders kurulu sınav notlarının her biri en az 60 olmak şartı ile dönem içi kurul notunun 80 ve üzerinde olan öğrenciler isterlerse dönem sonu final sınavına\ngirmeksizin dönemi başarıyla tamamlamış kabul edilir.'
                },
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer. Bütünleme notu final notu yerine geçer.'
                }
            ]
        })

        expect(repaired).toBe('Ders kurulu sınav notlarının her biri en az 60 ve dönem içi kurul notu 80 veya üzerindeyse öğrenci isterse dönem sonu final sınavına girmeden dönemi başarıyla tamamlamış kabul edilir.')
    })

    it('does not overwrite grounded pass-without-final answers with makeup eligibility evidence', () => {
        const response = 'Tıp Fakültesinde finale girmeden geçebilmek için ders kurulu sınav notlarının her biri en az 60 ve dönem içi kurul notu 80 veya üzeri olmalıdır.'
        const repaired = repairLinkOnlyRagAnswer({
            response,
            userMessage: 'Tıpta hangi şartlarda finale girmeden geçebilirim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Ders kurulu sınav notlarının her biri en az 60 olmak şartı ile dönem içi kurul notu 80 ve üzerinde olan öğrenciler isterlerse dönem sonu final sınavına girmeksizin dönemi başarıyla tamamlamış kabul edilir.'
                },
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer. Bütünleme notu final notu yerine geçer.'
                }
            ]
        })

        expect(repaired).toBe(response)
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

        expect(repaired).toBe('Sağlık Bilimleri Fakültesi adresi: Bağlıca Mahallesi Höyük Caddesi No:1 Bağlıca.')
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

    it('keeps multiple campus addresses when one academic unit has several campus entries', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Sağlık Hizmetleri Meslek Yüksekokulu adresi: Karakaya Mahallesi Bağlum Bulvarı No:1 06291 Keçiören.',
            userMessage: 'SHMYO kampüsü nerede?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Yerleşke Konumları',
                    content: [
                        'SAĞLIK HİZMETLERİ MESLEK YÜKSEKOKULU',
                        'Elektronörofizyoloji Biyomedikal Cihaz Teknolojisi Fizyoterapi Tıbbi Laboratuvar Teknikleri',
                        'BALGAT YERLEŞKESİ: Oğuzlar Mahallesi 1375 Sokak No:8 06520 Balgat',
                        'SAĞLIK HİZMETLERİ MESLEK YÜKSEKOKULU',
                        'Anestezi Ameliyathane Hizmetleri İlk ve Acil Yardım Optisyenlik',
                        'BAĞLUM YERLEŞKESİ: Karakaya Mahallesi Bağlum Bulvarı No:1 06291 Keçiören'
                    ].join('\n')
                }
            ]
        })

        expect(repaired).toBe(
            'Sağlık Hizmetleri Meslek Yüksekokulu yerleşkeleri: Balgat Yerleşkesi: Oğuzlar Mahallesi 1375 Sokak No:8 06520 Balgat; Bağlum Yerleşkesi: Karakaya Mahallesi Bağlum Bulvarı No:1 06291 Keçiören.'
        )
    })

    it('repairs multi-subject campus answers when one requested subject is omitted', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Sağlık Bilimleri Fakültesi yerleşkesi: Bağlıca Yerleşkesi.',
            userMessage: 'SBF ve SHMYO kampüsleri nerede?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'SBF Taşınma Duyurusu',
                    content: 'Sağlık Bilimleri Fakültemiz Bağlıca Yerleşkesine taşındı ve eğitimini burada sürdürecek.'
                },
                {
                    document_title: 'Yerleşke Konumları',
                    content: 'SAĞLIK HİZMETLERİ MESLEK YÜKSEKOKULU\nBAĞLUM YERLEŞKESİ: Karakaya Mahallesi Bağlum Bulvarı No:1 06291 Keçiören'
                }
            ]
        })

        expect(repaired).toBe('Sağlık Bilimleri Fakültesi yerleşkesi: Bağlıca Yerleşkesi. Sağlık Hizmetleri Meslek Yüksekokulu adresi: Karakaya Mahallesi Bağlum Bulvarı No:1 06291 Keçiören.')
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

    it('skips unrelated contact rows before using the retrieved subject-matched program contact chunk', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Kurum iletişim bilgisi: Telefon: +90 312 329 10 10 - E-posta: kutuphane@yuksekihtisas.edu.tr.',
            userMessage: 'Tibbi Laboratuvar Teknikleri program sorumlusu iletisim bilgisi nedir?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'İletişim',
                    content: [
                        'Page Title: İletişim',
                        'Kütüphane ve Dokümantasyon Daire Başkanlığı',
                        'Telefon: (+90 312) 329 1010 E-posta: kutuphane@yuksekihtisas.edu.tr'
                    ].join('\n')
                },
                {
                    document_title: 'Program Bilgi Notu',
                    content: [
                        'TIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI',
                        'Telefon: +90 312 329 1010',
                        'E-Mail: tlt@yiu.edu.tr'
                    ].join('\n')
                }
            ]
        })

        expect(repaired).toContain('Tıbbi Laboratuvar Teknikleri Programı')
        expect(repaired).toContain('E-posta: tlt@yiu.edu.tr')
        expect(repaired).toContain('Telefon: +90 312 329 10 10')
        expect(repaired).not.toContain('kutuphane@yuksekihtisas.edu.tr')
    })

    it('does not present a generic institution phone as a program-specific phone when only the program email is matched', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Tıbbi Laboratuvar Teknikleri Programı iletişim bilgileri: Telefon: +90 312 329 10 10 - E-posta: tlt@yiu.edu.tr.',
            userMessage: 'Tıbbi Laboratuvar Teknikleri program sorumlusu iletişim bilgisi nedir?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Program Bilgi Notu',
                    content: 'TIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI\nE-Mail: tlt@yiu.edu.tr'
                },
                {
                    document_title: 'İletişim',
                    content: 'Page Title: İletişim\nTelefon: +90 312 329 10 10\nE-posta: yiu@yiu.edu.tr'
                }
            ]
        })

        expect(repaired).toBe('Tıbbi Laboratuvar Teknikleri Programı iletişim bilgisi: E-posta: tlt@yiu.edu.tr.')
    })

    it('does not borrow a footer phone into a focused program email contact answer', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Tıbbi Laboratuvar Teknikleri Programı iletişim bilgileri: Telefon: +90 312 329 10 10 - E-posta: tlt@yiu.edu.tr.',
            userMessage: 'Tıbbi Laboratuvar Teknikleri program sorumlusu iletişim bilgisi nedir?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıbbi Laboratuvar Teknikleri Programı',
                    content: [
                        'TIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI',
                        'Program e-posta adresi: tlt@yiu.edu.tr',
                        'Sayfa alt bilgi alanı',
                        'Telefon: +90 312 329 10 10'
                    ].join('\n')
                }
            ]
        })

        expect(repaired).toBe('Tıbbi Laboratuvar Teknikleri Programı iletişim bilgisi: E-posta: tlt@yiu.edu.tr.')
    })

    it('uses the requested administrative unit contact instead of the generic university contact', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Kurum iletişim bilgisi: Telefon: +90 312 329 10 15 - E-posta: yiu@yiu.edu.tr.',
            userMessage: 'Yuksek Ihtisas Universitesi Bilgi Islem birimi iletisim bilgileri nedir?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'İletişim',
                    content: [
                        'Page Title: İletişim',
                        'Rektörlük Telefon +90 312 329 10 10 Fax +90 312 329 10 15 E-Posta yiu@yiu.edu.tr',
                        'Bilgi İşlem Daire Başkanlığı Telefon: (+90 312) 329 1010 E-posta: bilgiislem@yuksekihtisas.edu.tr'
                    ].join('\n')
                },
                {
                    document_title: 'Yeni Kablosuz Ağ Yapılanması hakkında.',
                    content: 'E-posta: bilgiislem@yuksekihtisas.edu.tr'
                }
            ]
        })

        expect(repaired).toContain('Bilgi İşlem')
        expect(repaired).toContain('E-posta: bilgiislem@yuksekihtisas.edu.tr')
        expect(repaired).toContain('Telefon: +90 312 329 10 10')
        expect(repaired).not.toContain('yiu@yiu.edu.tr')
    })

    it('chooses the requested unit email instead of an unrelated staff email', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'İlgili program iletişim bilgisi: E-posta: busraaydos@yiu.edu.tr. https://example.edu.tr/kutuphane',
            userMessage: 'Kütüphane maili neydi',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'İletişim',
                    content: [
                        'Sürekli Eğitim Merkezi Telefon: (+90 312) 329 1010 E-posta: sem@yiu.edu.tr',
                        'Kütüphane ve Dokümantasyon Daire Başkanlığı',
                        '(+90 312) 329 1010 (+90 312) 286 3608',
                        '115',
                        'kutuphane@yuksekihtisas.edu.tr'
                    ].join('\n')
                }
            ]
        })

        expect(repaired).toContain('Kütüphane ve Dokümantasyon Daire Başkanlığı')
        expect(repaired).toContain('E-posta: kutuphane@yuksekihtisas.edu.tr')
        expect(repaired).not.toContain('busraaydos@yiu.edu.tr')
        expect(repaired).not.toContain('sem@yiu.edu.tr')
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

    it('combines grounded repairs for multi-intent questions only when each part has evidence', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu konuda elimde net bilgi yok.',
            userMessage: 'SBF kampüsü nerede ve Tıbbi Laboratuvar Teknikleri programında çift anadal yapabilir miyim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'SBF Sağlık Bilimleri Fakültesi',
                    content: 'Sağlık Bilimleri Fakültesi\nAdres: Bağlıca Mahallesi Höyük Caddesi No:1 Bağlıca Telefon: 0312 329 10 10'
                },
                {
                    document_title: 'TIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI - 2025 ÖZ DEĞERLENDİRME RAPORU',
                    content: '*Tıbbi Laboratuvar Teknikleri Programı öğrencileri, Eczane Hizmetleri Programında ve Eczane Hizmetleri Programı öğrencileri ise Tıbbi Laboratuvar Teknikleri Programında çift anadal programına kayıt yaptırabilirler. Her iki programa kaydedilecek öğrenci kontenjanları, her yıl Eğitim-Öğretim yılı başlamadan önce yüksekokul tarafından belirlenir. Kontenjanları belirlenen ve yayınlanan çift anadal programına öğrenciler, üçüncü yarıyılın başında başvurabilir. Koşullarda genel ağırlıklı not ortalaması en az 2,72/4,0 ve/veya başarı sıralaması ya da taban puan şartı belirtilmiştir.'
                }
            ]
        })

        expect(repaired).toContain('Sağlık Bilimleri Fakültesi adresi')
        expect(repaired).toContain('Bağlıca Mahallesi Höyük Caddesi No:1 Bağlıca')
        expect(repaired).toContain('Tıbbi Laboratuvar Teknikleri Programı')
        expect(repaired).toContain('Eczane Hizmetleri Programında')
        expect(repaired).toContain('2,72/4,0')
    })

    it('does not partially repair multi-intent questions from only one supported clause', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu konuda elimde net bilgi yok.',
            userMessage: 'SBF kampüsü nerede ve Tıbbi Laboratuvar Teknikleri programında çift anadal yapabilir miyim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Sağlık Bilimleri Fakültesi',
                    content: 'Sağlık Bilimleri Fakültesi adresi: Bağlıca Mahallesi Höyük Caddesi No:1 Bağlıca.'
                }
            ]
        })

        expect(repaired).toBe('Bu konuda elimde net bilgi yok.')
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

        expect(repaired).toContain('Dönem IV-V’te klinik stajlar')
        expect(repaired).toContain('Dönem VI’da intörnlük')
        expect(repaired).toContain('ayrı bir "yaz stajı" ifadesi geçmiyor')
        expect(repaired).toContain('Tıp Fakültesi')
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

        expect(repaired).toContain('Dönem IV-V’te klinik stajlar')
        expect(repaired).toContain('Dönem VI’da intörnlük')
        expect(repaired).toContain('ayrı bir "yaz stajı" ifadesi geçmiyor')
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

        expect(repaired).toContain('eğitim-öğretim süresi altı yıldır')
        expect(repaired).toContain('Dönem IV-V’te klinik stajlar')
        expect(repaired).toContain('Dönem VI’da intörnlük')
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

        expect(repaired).toContain('eğitim-öğretim süresi altı yıldır')
        expect(repaired).toContain('Dönem IV-V’te klinik stajlar')
        expect(repaired).toContain('Dönem VI’da intörnlük')
    })

    it('compacts medicine training duration answers while preserving the six-year and period structure facts', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu konuda elimde net bilgi yok.',
            userMessage: 'Tıp Fakültesinde eğitim süresi ne kadar?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'MADDE 5 – (1) Tıp Fakültesinde eğitim- öğretim süresi altı yıldır. Tıp eğitim- öğretimi; Dönem I, II ve III’te temel olarak ders kurullarından oluşan Harmanlanmış/Hibrit Preklinik Tıp Bilimleri eğitim-öğretimi, Dönem IV ve V’te stajlardan oluşan Klinik Tıp Bilimleri eğitimöğretimi ve Dönem VI’da İntörnlük Stajlarından oluşan İntörnlük eğitim- öğretimi esasına göre yapılır.'
                }
            ]
        })

        expect(repaired).toBe('Tıp Fakültesinde eğitim-öğretim süresi altı yıldır. Eğitim Dönem I-III’te preklinik ders kurulları, Dönem IV-V’te klinik stajlar ve Dönem VI’da intörnlük şeklinde yürütülür.')
    })

    it('compacts medicine summer-internship answers without implying a separate summer internship exists', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu konuda elimde net bilgi yok.',
            userMessage: 'Tıp fakültesinde yaz stajı var mı?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'MADDE 5 – (1) Tıp eğitim- öğretimi; Dönem I, II ve III’te temel olarak ders kurullarından oluşan Harmanlanmış/Hibrit Preklinik Tıp Bilimleri eğitim-öğretimi, Dönem IV ve V’te stajlardan oluşan Klinik Tıp Bilimleri eğitimöğretimi ve Dönem VI’da İntörnlük Stajlarından oluşan İntörnlük eğitim- öğretimi esasına göre yapılır.'
                }
            ]
        })

        expect(repaired).toBe('Kaynakta Tıp Fakültesi için ayrı bir "yaz stajı" ifadesi geçmiyor. Eğitim Dönem IV-V’te klinik stajlar ve Dönem VI’da intörnlük şeklinde yürütülür.')
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

    it('repairs medicine board-grade answers that omit the in-year board-grade formula', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: "Dönem içi kurul notu dönem sonu başarı notuna %60 oranında yansır. Final veya bütünleme notu ise %40 oranında etkilidir.",
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
        expect(repaired).toContain('Hekimliğe Uyum')
        expect(repaired).toContain('Kanıta Dayalı Tıp')
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

    it('repairs no-information medicine final-makeup answers when the evidence uses "bu sınava girer" after naming the makeup exam', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu konuda elimde net bilgi yok.',
            userMessage: 'Tıp fakültesinde finale girmeden bütünlemeye girebilir miyim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'MADDE 23- (1) Fakültede Dönem I, Dönem II ve Dönem III’te Dönem sonunda, final sınavından en erken 14 gün sonra bütün ders kurullarının içeriğini kapsayan ve bütünleme sınavı olarak adlandırılan sınav yapılır. (2) Final sınavına girmesi gerektiği halde girmeyen, final sınav puanı 50’nin altında olan veya final sınavına göre hesaplanan dönem sonu başarı notu 60’ın altında olan öğrenciler bu sınava girer. (4) Teorik, pratik/ uygulama sınavlarını içeren bütünleme sınavından alınan puanın %100’ü bütünleme notunu oluşturur. (5) Bütünleme sınavından alınan not final notu yerine geçer.'
                }
            ]
        })

        expect(repaired).toBe('Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.')
    })

    it('repairs final-makeup answers that drift into final exemption conditions', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Evet, Tıp Fakültesi’nde final sınavına girmeden bütünleme sınavına girebilirsin. Ancak dönem içi kurul notun en az 80 olmalı.',
            userMessage: 'Tıp fakültesinde finale girmeden bütünlemeye girebilir miyim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Final sınavına girmesi gerektiği halde girmeyen, final sınav puanı 50’nin altında olan veya final sınavına göre hesaplanan dönem sonu başarı notu 60’ın altında olan öğrenciler bütünleme sınavına girer. Bütünleme notunu oluşturur. Bütünleme sınavında alınan not final notu yerine geçer.'
                }
            ]
        })

        expect(repaired).toBe('Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.')
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

    it('repairs self-contradictory final makeup answers that express eligibility as an obligation', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Final sınavına girmeden bütünleme sınavına giremezsin. Bütünleme sınavına girebilmek için final sınavına girmesi gerektiği halde girmeyen, final sınav puanı 50’nin altında olan veya final sınavına göre hesaplanan dönem sonu başarı notu 60’ın altında olan öğrencilerin bu sınava girmesi gerekmektedir.',
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

    it('removes unsupported lecture-note platform names from otherwise grounded answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Ders notlarına UZEM/MEDU sistemleri üzerinden ulaşabilirsin.',
            userMessage: 'Ders notlarına nereden ulaşabilirim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Öğretim Elemanı ve Personel Bilgilendirme Kılavuzu',
                    content: 'Ders notlarının sadeleştirilmiş, açık ve anlaşılır biçimde hazırlanması gerekir. UZEM üzerinden paylaşılan içeriklerin ekran okuyucularla uyumlu olması sağlanır.'
                }
            ]
        })

        expect(repaired).toBe('Ders notlarına UZEM sistemi üzerinden ulaşabilirsin.')
    })

    it('uses broader course-content wording when evidence supports course content but not lecture notes', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Ders notlarına UZEM/MEDU sistemleri üzerinden ulaşabilirsin.',
            userMessage: 'Ders notlarına nereden ulaşabilirim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Uzaktan Eğitim Politikası',
                    content: 'Öğrenme Yönetim Sistemi MEDU platformu kullanılır. YİUZEM, Öğrenme Yönetim Sistemi ile ders içeriği paylaşımı hizmetini sunar.'
                }
            ]
        })

        expect(repaired).toBe('Ders içeriklerine UZEM/MEDU sistemleri üzerinden ulaşabilirsin.')
    })

    it('repairs no-information lecture-note answers with broader course-content wording when that is the only supported object', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Bu konuda elimde net bilgi yok.',
            userMessage: 'Ders notlarına nereden ulaşabilirim?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Uzaktan Eğitim Politikası',
                    content: 'Öğrenme Yönetim Sistemi MEDU platformu kullanılır. YİUZEM, Öğrenme Yönetim Sistemi ile ders içeriği paylaşımı hizmetini sunar.'
                }
            ]
        })

        expect(repaired).toBe('Ders içeriklerinin paylaşımı UZEM/MEDU sistemleri üzerinden sağlanmıştır.')
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

    it('removes generic deferral tails when a factual policy answer is already present', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Seçmeli derslerin hangi derslerden oluşacağı, yarıyıllara dağılımı ve öğrenci tarafından alınması gereken seçmeli ders sayısı Yüksekokul Kurulu tarafından belirlenir. Daha fazla bilgi almak istersen, ilgili birimle iletişime geçmeni öneririm. https://example.edu.tr/secmeli-ders.pdf',
            userMessage: 'mezun olana kadar kaç seçmeli ders almalıyım',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Seçmeli derslerin hangi derslerden oluşacağı, yarıyıllara dağılımı ve öğrenci tarafından alınması gereken seçmeli ders sayısı Yüksekokul Kurulu tarafından belirlenir.'
                }
            ]
        })

        expect(repaired).toBe('Seçmeli derslerin hangi derslerden oluşacağı, yarıyıllara dağılımı ve öğrenci tarafından alınması gereken seçmeli ders sayısı Yüksekokul Kurulu tarafından belirlenir.')
        expect(repaired).not.toContain('iletişime geç')
        expect(repaired).not.toContain('https://')
    })

    it('removes unsolicited inline email sentences from non-contact answers', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Evet, Tıbbi Laboratuvar Teknikleri Programı öğrencileri Eczane Hizmetleri Programında çift anadal yapabilir. İlgili e-posta adresi: esmasariuzek@yiu.edu.tr. Başka bir sorunuz var mı?',
            userMessage: 'Tıbbi Laboratuvar Teknikleri programında çift anadal yapabilir miyim',
            responseLanguage: 'tr',
            chunks: []
        })

        expect(repaired).toBe('Evet, Tıbbi Laboratuvar Teknikleri Programı öğrencileri Eczane Hizmetleri Programında çift anadal yapabilir.')
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

    it('repairs truncated elective-count answers from retrieved board-determination evidence', () => {
        const repaired = repairLinkOnlyRagAnswer({
            response: 'Detaylı bilgi için şu sayfayı inceleyebilirsin: çmeli derslerin sayısı, Yüksekokul Kurulu tarafından belirlenir ve eğitim-öğretim planında belirtilir.',
            userMessage: 'Mezun olana kadar kaç seçmeli ders almalıyım?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Seçmeli derslerin sayısı, Yüksekokul Kurulu tarafından belirlenir ve eğitim-öğretim planında belirtilir.'
                }
            ]
        })

        expect(repaired).toBe('Seçmeli derslerin sayısı, Yüksekokul Kurulu tarafından belirlenir ve eğitim-öğretim planında belirtilir')
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
