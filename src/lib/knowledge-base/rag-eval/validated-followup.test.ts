import { describe, expect, it } from 'vitest'
import { planBrochureQuery } from './brochure-query-plan'
import { buildValidatedFollowup } from './validated-followup'

describe('buildValidatedFollowup', () => {
  it('offers an evidence-supported fee variant comparison after a table answer', () => {
    const followup = buildValidatedFollowup({
      question: 'Tıp Fakültesi ücretli programının fiyatı nedir?',
      answer: 'Tıp Fakültesi (Ücretli) için 2025 fiyatı 720.000 TL olarak broşürde gösterilmiştir.',
      plan: planBrochureQuery('Tıp Fakültesi ücretli programının fiyatı nedir?'),
      refusal: false,
      citations: [
        {
          providerSourceId: 'file_tip',
          quote: [
            '| Tıp Fakültesi (Ücretli) | SAY | 75 | 36.073 | 453,467 | 720.000 |',
            '| Tıp Fakültesi (Burslu) | SAY | 13 | 11.519 | 497,406 | - |',
            '| Tıp Fakültesi (%50 İnd.) | SAY | 10 | 18.145 | 483,077 | 360.000 |',
          ].join('\n'),
        },
      ],
    })

    expect(followup).toBe(
      'İsterseniz Tıp Fakültesi için burslu ve %50 indirimli seçenekleri de karşılaştırabilirim.'
    )
  })

  it('offers an adjacent scholarship topic only when it exists in evidence', () => {
    const followup = buildValidatedFollowup({
      question: 'Tercih bursu oranları nedir?',
      answer: 'Tercih sırasına göre indirim uygulanır.',
      plan: planBrochureQuery('Tercih bursu oranları nedir?'),
      refusal: false,
      citations: [
        {
          providerSourceId: 'file_burs',
          quote: '### Tercih Bursu\n%10, %7 ve %5 indirim uygulanır.\n### Akademik Başarı Bursu\nKoşullar broşürde açıklanır.',
        },
      ],
    })

    expect(followup).toBe(
      'Akademik başarı bursunun koşullarını da incelememi ister misiniz?'
    )
  })

  it('offers an address after a supported campus answer', () => {
    const followup = buildValidatedFollowup({
      question: 'Anestezi hangi yerleşkede?',
      answer: 'Anestezi Bağlum Yerleşkesindedir.',
      plan: planBrochureQuery('Anestezi hangi yerleşkede?'),
      refusal: false,
      citations: [
        {
          providerSourceId: 'file_campus',
          quote:
            'Anestezi\nYerleşke: Bağlum Yerleşkesi\nKarakaya Mahallesi, Bağlum Bulvarı No:1 Keçiören / Ankara',
        },
      ],
    })

    expect(followup).toBe('Bağlum Yerleşkesinin açık adresini de paylaşmamı ister misiniz?')
  })

  it('suppresses follow-ups for refusals, source-only requests, and stop signals', () => {
    const base = {
      answer: 'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.',
      plan: planBrochureQuery('Kaynağı paylaşır mısın?'),
      citations: [],
    }

    expect(
      buildValidatedFollowup({
        ...base,
        question: 'Kaynağı paylaşır mısın?',
        refusal: true,
      })
    ).toBe('')
    expect(
      buildValidatedFollowup({
        ...base,
        question: 'Sadece kaynağın linkini paylaşır mısın?',
        refusal: false,
      })
    ).toBe('')
    expect(
      buildValidatedFollowup({
        ...base,
        question: 'Teşekkürler, başka bir şey istemiyorum.',
        refusal: false,
      })
    ).toBe('')
  })

  it('uses a generic engagement fallback after a supported answer when no specific follow-up is available', () => {
    const followup = buildValidatedFollowup({
      question: 'BİDB kısaltması hangi birimi ifade ediyor?',
      answer: 'BİDB, Bilgi İşlem Daire Başkanlığı anlamına gelir.',
      plan: planBrochureQuery('BİDB kısaltması hangi birimi ifade ediyor?'),
      refusal: false,
      citations: [
        {
          providerSourceId: 'file_bidb',
          quote: 'BİDB, Bilgi İşlem Daire Başkanlığı ifadesinin kısaltmasıdır.',
        },
      ],
    })

    expect(followup).toBe(
      'İsterseniz bu yönergedeki ilgili şartları da kaynaklardan özetleyebilirim.'
    )
  })

  it('uses different safe generic fallbacks instead of repeating the same line', () => {
    const first = buildValidatedFollowup({
      question: 'Yurtların aylık ücretleri broşürde yazıyor mu?',
      answer: 'Broşürde yurtların aylık ücretleri belirtilmiyor.',
      plan: planBrochureQuery('Yurtların aylık ücretleri broşürde yazıyor mu?'),
      refusal: false,
      citations: [
        {
          providerSourceId: 'file_overview',
          quote: 'Konaklama bilgileri: https://example.edu.tr/yurtlar',
        },
      ],
    })
    const second = buildValidatedFollowup({
      question: 'Üniversitenin kurucu vakfı nedir?',
      answer: 'Kurucu vakıf TİVAK olarak belirtilmiştir.',
      plan: planBrochureQuery('Üniversitenin kurucu vakfı nedir?'),
      refusal: false,
      citations: [
        {
          providerSourceId: 'file_overview',
          quote: 'Yüksek İhtisas Hastanesi Vakfı (TİVAK) tarafından kurulmuştur.',
        },
      ],
    })

    expect(first).not.toBe(second)
    expect([first, second].every((followup) => /başka|yardımcı/i.test(followup))).toBe(true)
  })

  it('uses website-specific follow-ups when the source intent is known', () => {
    const admissions = buildValidatedFollowup({
      question:
        'Aday öğrenci sayfasına göre üniversitede hangi fakülte ve yüksekokul grupları öne çıkıyor?',
      answer: 'Tıp Fakültesi ve Sağlık Bilimleri Fakültesi öne çıkar.',
      plan: planBrochureQuery(
        'Aday öğrenci sayfasına göre üniversitede hangi fakülte ve yüksekokul grupları öne çıkıyor?'
      ),
      refusal: false,
      citations: [
        {
          providerSourceId: 'admissions',
          quote: 'Fakülte ve Bölümler\nTıp Fakültesi\nSağlık Bilimleri Fakültesi',
        },
      ],
    })
    const contact = buildValidatedFollowup({
      question:
        'Rektörlük ve Tıp Fakültesi için web sitesindeki adres, telefon ve genel e-posta nedir?',
      answer: 'Adres ve telefon web sitesinde belirtilmiştir.',
      plan: planBrochureQuery(
        'Rektörlük ve Tıp Fakültesi için web sitesindeki adres, telefon ve genel e-posta nedir?'
      ),
      refusal: false,
      citations: [
        {
          providerSourceId: 'contact',
          quote: 'Rektörlük ve Tıp Fakültesi\nİşçi Blokları Yerleşkesi',
        },
      ],
    })

    expect(admissions).toContain('program')
    expect(contact).toContain('yerleşke')
    expect(admissions).not.toBe(contact)
  })

  it('does not let generic engagement replace an evidence-supported specific follow-up', () => {
    const followup = buildValidatedFollowup({
      question: 'Tercih bursu oranları nedir?',
      answer: 'Tercih sırasına göre indirim uygulanır.',
      plan: planBrochureQuery('Tercih bursu oranları nedir?'),
      refusal: false,
      citations: [
        {
          providerSourceId: 'file_burs',
          quote: '### Tercih Bursu\n%10, %7 ve %5 indirim uygulanır.\n### Akademik Başarı Bursu\nKoşullar broşürde açıklanır.',
        },
      ],
    })

    expect(followup).toBe(
      'Akademik başarı bursunun koşullarını da incelememi ister misiniz?'
    )
  })
})
