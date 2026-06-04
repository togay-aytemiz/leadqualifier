import { describe, expect, it } from 'vitest'
import { planBrochureQuery } from './brochure-query-plan'
import { resolveApprovedSourceFact } from './approved-source-facts'
import type { RagProviderCitation } from './types'

describe('resolveApprovedSourceFact', () => {
  it('extracts student affairs contact details from the approved website contact package', () => {
    const citation: RagProviderCitation = {
      providerSourceId: 'contact-admin',
      title: 'YİÜ Website - Contact Admin - 001',
      quote: [
        'Öğrenci İşleri Daire Başkanı',
        '(+90 312) 329 1010',
        'ogrenciisleri@yuksekihtisas.edu.tr',
        'Öğrenci İşleri Daire Başkanlığı(Tıp Fakültesi)',
        '(+90 312) 329 10 10 (+90 552) 994 05 41',
        'Öğrenci İşleri Daire Başkanlığı (Sağlık Bilimler Fakültesi)',
        '(+90 505) 181 60 01',
      ].join('\n'),
    }

    const result = resolveApprovedSourceFact({
      question:
        'Öğrenci işleriyle konuşmam gerekirse web sitesinde hangi e-posta ve telefonlar görünüyor?',
      plan: planBrochureQuery(
        'Öğrenci işleriyle konuşmam gerekirse web sitesinde hangi e-posta ve telefonlar görünüyor?'
      ),
      citations: [citation],
    })

    expect(result?.answer).toContain('ogrenciisleri@yuksekihtisas.edu.tr')
    expect(result?.answer).toContain('329 10 10')
    expect(result?.answer).toContain('552) 994 05 41')
    expect(result?.citations).toEqual([citation])
  })

  it('prioritizes phone numbers adjacent to student affairs contacts', () => {
    const question =
      'Öğrenci işleriyle konuşmam gerekirse web sitesinde hangi e-posta ve telefonlar görünüyor?'
    const result = resolveApprovedSourceFact({
      question,
      plan: planBrochureQuery(question),
      citations: [
        {
          providerSourceId: 'contact-admin',
          title: 'YİÜ Website - Contact Admin - 001',
          quote: [
            'Rektörlük Özel Kalem (+90 552) 994 05 60',
            'Tıp Fakültesi Dekan Sekreteri (+90 312) 287 44 98',
            'Öğrenci İşleri Daire Başkanlığı(Tıp Fakültesi)',
            '(+90 312) 329 10 10 (+90 552) 994 05 41',
            'ogrenciisleri@yuksekihtisas.edu.tr',
            'Öğrenci İşleri Daire Başkanlığı (Sağlık Bilimler Fakültesi)',
            '(+90 505) 181 60 01',
            'ogrenciisleri@yuksekihtisas.edu.tr',
          ].join('\n'),
        },
      ],
    })

    expect(result?.answer).toContain('552) 994 05 41')
    expect(result?.answer).toContain('505) 181 60 01')
    expect(result?.answer).not.toContain('552) 994 05 60')
  })

  it('canonicalizes student affairs phone lines with extension suffixes', () => {
    const question =
      'Öğrenci işleriyle konuşmam gerekirse web sitesinde hangi e-posta ve telefonlar görünüyor?'
    const result = resolveApprovedSourceFact({
      question,
      plan: planBrochureQuery(question),
      citations: [
        {
          providerSourceId: 'contact-admin',
          title: 'YİÜ Website - Contact Admin - 001',
          quote: [
            'Sağlık Bilimleri Fakültesi Öğrenci İşleri',
            'Telefon: (+90 312) 329 1010 - 111',
            'Mail: ogrenciisleri@yuksekihtisas.edu.tr',
          ].join('\n'),
        },
      ],
    })

    expect(result?.answer).toContain('0 (312) 329 10 10 - 111')
    expect(result?.answer).not.toContain('329 1010 - 111')
  })

  it('answers rectorate and medicine faculty contact details from the website contact package', () => {
    const question =
      'Rektörlük ve Tıp Fakültesi için web sitesindeki adres, telefon ve genel e-posta nedir?'
    const citation: RagProviderCitation = {
      providerSourceId: 'contact-admin',
      title: 'YİÜ Website - Contact Admin - 001',
      quote: [
        'Rektörlük ve Tıp Fakültesi',
        'İŞÇİ BLOKLARI YERLEŞKESİ',
        'Adres',
        'İşçi Blokları Mahallesi 1505. Cd. No: 18/A, 06530 Çankaya/Ankara',
        'Telefon',
        '+90 312 329 10 10',
        'E-Posta',
        'yiu@yiu.edu.tr',
      ].join('\n'),
    }

    const result = resolveApprovedSourceFact({
      question,
      plan: planBrochureQuery(question),
      citations: [citation],
    })

    expect(result?.answer).toContain('İşçi Blokları')
    expect(result?.answer).toContain('1505. Cd. No: 18/A')
    expect(result?.answer).toContain('329 10 10')
    expect(result?.answer).toContain('yiu@yiu.edu.tr')
    expect(result?.citations).toEqual([citation])
  })

  it('does not answer rectorate contact questions from student affairs-only evidence', () => {
    const question =
      'Rektörlük ve Tıp Fakültesi için web sitesindeki adres, telefon ve genel e-posta nedir?'
    const result = resolveApprovedSourceFact({
      question,
      plan: planBrochureQuery(question),
      citations: [
        {
          providerSourceId: 'contact-admin',
          title: 'YİÜ Website - Contact Admin - 001',
          quote: [
            'Öğrenci İşleri Daire Başkanlığı(Tıp Fakültesi)',
            '(+90 312) 329 10 10 (+90 552) 994 05 41',
            'ogrenciisleri@yuksekihtisas.edu.tr',
          ].join('\n'),
        },
      ],
    })

    expect(result).toBeNull()
  })

  it('answers accommodation-link questions directly from the approved brochure overview', () => {
    const citation: RagProviderCitation = {
      providerSourceId: 'brochure-overview',
      title: 'YİÜ Tanıtım Broşürü - Genel Tanıtım ve İletişim',
      quote:
        'QR kod bağlantıları:\n- Konaklama bilgileri: `https://yuksekihtisasuniversitesi.edu.tr/sayfa/yurtlar/yurtlar/yurtlar`',
    }

    const result = resolveApprovedSourceFact({
      question:
        'Yurtların aylık ücretleri broşürde yazıyor mu, yazmıyorsa hangi bağlantıdan bakılması önerilmiş?',
      plan: planBrochureQuery(
        'Yurtların aylık ücretleri broşürde yazıyor mu, yazmıyorsa hangi bağlantıdan bakılması önerilmiş?'
      ),
      citations: [citation],
    })

    expect(result?.answer).toContain('aylık ücretleri belirtilmiyor')
    expect(result?.answer).toContain('Konaklama bilgileri')
    expect(result?.answer).toContain(
      'https://yuksekihtisasuniversitesi.edu.tr/sayfa/yurtlar/yurtlar/yurtlar'
    )
    expect(result?.citations).toEqual([citation])
  })

  it('answers the university founder and health-history overview from verified brochure facts', () => {
    const citation: RagProviderCitation = {
      providerSourceId: 'brochure-overview',
      title: 'YİÜ Tanıtım Broşürü - Genel Tanıtım ve İletişim',
      quote: [
        "Yüksek İhtisas Üniversitesi, 1964 yılında Ankara'da kurulan ve tıp alanında çalışmalar yapan Yüksek İhtisas Hastanesi Vakfı (TİVAK) tarafından kurulmuştur.",
        "Kurucu hastanede 1968 yılında Türkiye'nin ilk kalp nakli, 1999 yılında ise ilk karaciğer nakli gerçekleştirilmiştir.",
        'Üniversite 2013 yılından bu yana eğitim, araştırma ve topluma hizmet alanlarında çalışmalar yürütmektedir.',
      ].join('\n'),
    }

    const question =
      'Üniversitenin kurucu vakfı ve sağlık alanındaki geçmişiyle ilgili kısa bir tanıtım yapar mısın?'
    const result = resolveApprovedSourceFact({
      question,
      plan: planBrochureQuery(question),
      citations: [citation],
    })

    expect(result?.answer).toContain('TİVAK')
    expect(result?.answer).toContain('1964')
    expect(result?.answer).toContain('2013')
    expect(result?.answer).toContain('kalp nakli')
    expect(result?.answer).toContain('karaciğer nakli')
  })

  it('answers social support scholarship types without dropping evidence terms', () => {
    const question = 'Sosyal destek bursu sadece para mı, başka destek türleri de var mı?'
    const result = resolveApprovedSourceFact({
      question,
      plan: planBrochureQuery(question),
      citations: [
        {
          providerSourceId: 'scholarship',
          title: 'YİÜ Tanıtım Broşürü - Burslar ve Çift Anadal',
          quote:
            '### Sosyal Destek Bursu\nBurs türleri nakit, kitap, kırtasiye, beslenme ve barınma yardımı vb. olabilir.',
        },
      ],
    })

    expect(result?.answer).toContain('nakit')
    expect(result?.answer).toContain('kitap')
    expect(result?.answer).toContain('kırtasiye')
    expect(result?.answer).toContain('beslenme')
    expect(result?.answer).toContain('barınma')
  })

  it('answers the approved admissions faculty and school list from the website package', () => {
    const question =
      'Aday öğrenci sayfasına göre üniversitede hangi fakülte ve yüksekokul grupları öne çıkıyor?'
    const result = resolveApprovedSourceFact({
      question,
      plan: planBrochureQuery(question),
      citations: [
        {
          providerSourceId: 'admissions',
          title: 'YİÜ Website - Admissions - 001',
          quote: [
            'Fakülte ve Bölümler',
            'Tıp Fakültesi',
            'Sağlık Bilimleri Fakültesi',
            'Sağlık Hizmetleri Meslek Yüksekokulu',
            'Meslek Yüksekokulu',
            'Spor Bilimleri Fakültesi',
          ].join('\n'),
        },
      ],
    })

    expect(result?.answer).toContain('Tıp Fakültesi')
    expect(result?.answer).toContain('Sağlık Bilimleri Fakültesi')
    expect(result?.answer).toContain('Sağlık Hizmetleri Meslek Yüksekokulu')
    expect(result?.answer).toContain('Meslek Yüksekokulu')
    expect(result?.answer).toContain('Spor Bilimleri Fakültesi')
  })

  it('answers health services vocational school programs from the website bilgi paketi package', () => {
    const question =
      'Web sitesindeki bilgi paketine göre Sağlık Hizmetleri Meslek Yüksekokulu altında hangi programlardan bazıları listeleniyor?'
    const citation: RagProviderCitation = {
      providerSourceId: 'general-002',
      title: 'YİÜ Website - General - 002',
      quote: [
        'Vocational School of Health Services',
        'Anestezi Programı',
        'İlk ve Acil Yardım',
        'Optisyenlik Programı',
        'Tele-Sağlık Teknikerliği',
        'Medical Laboratory Techniques Program',
      ].join('\n'),
    }

    const result = resolveApprovedSourceFact({
      question,
      plan: planBrochureQuery(question),
      citations: [citation],
    })

    expect(result?.answer).toContain('Anestezi')
    expect(result?.answer).toContain('İlk ve Acil Yardım')
    expect(result?.answer).toContain('Optisyenlik')
    expect(result?.answer).toContain('Tele-Sağlık Teknikerliği')
    expect(result?.citations).toEqual([citation])
  })
})
