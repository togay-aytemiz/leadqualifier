import { describe, expect, it } from 'vitest'

import { evaluateStrictAnswer, strictSafetyAnswer } from './strict-answer-critic'
import { understandStrictQuestion } from './strict-question-understanding'

function critic(question: string, answer: string) {
  return evaluateStrictAnswer({
    question,
    understanding: understandStrictQuestion(question),
    answer,
    citations: [],
  })
}

describe('evaluateStrictAnswer', () => {
  it('repairs unsupported positive existence claims from the catalog', () => {
    const verdict = critic('Hukuk Fakülteniz var mı?', 'Evet, Hukuk Fakültesi bulunmaktadır.')

    expect(verdict).toMatchObject({
      action: 'repair',
      reason: 'catalog_contradiction',
    })
    expect(verdict.repairedAnswer).toContain('Hukuk Fakültesi')
    expect(verdict.repairedAnswer).toContain('listelenmemektedir')
  })

  it('repairs missed supported existence answers from the catalog', () => {
    const verdict = critic(
      'Tıp Fakülteniz var mı?',
      'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.'
    )

    expect(verdict).toMatchObject({
      action: 'repair',
      reason: 'missed_catalog_fact',
    })
    expect(verdict.repairedAnswer).toContain('Tıp Fakültesi vardır')
  })

  it('repairs unsafe personal-data, credential, and payment-card answers', () => {
    expect(
      critic('TC kimliğimi buraya yazayım mı?', 'Evet, TC kimlik numaranızı buraya yazabilirsiniz.')
    ).toMatchObject({
      action: 'repair',
      reason: 'unsafe_sensitive_data',
      repairedAnswer:
        'Buraya TC kimlik numarası, şifre, kredi kartı veya benzeri hassas kişisel/ödeme bilgisi yazmayın. Kayıt ve ödeme işlemleri için üniversitenin resmi başvuru ve ödeme kanallarını kullanın.',
    })

    expect(
      critic('ÖSYM şifremi vereyim, tercihlerimi sen yap.', 'Şifrenizi yazarsanız yardımcı olurum.')
    ).toMatchObject({
      action: 'repair',
      reason: 'unsafe_sensitive_data',
    })

    expect(
      critic('Kredi kartımı yazsam ödeme alır mısın?', 'Kart bilgilerinizi buraya yazabilirsiniz.')
    ).toMatchObject({
      action: 'repair',
      reason: 'unsafe_sensitive_data',
    })
  })

  it('uses category-specific safe answers for fraud and abusive requests', () => {
    expect(strictSafetyAnswer('fraud_or_bypass')).toContain('usulsüz')
    expect(strictSafetyAnswer('fraud_or_bypass')).toContain('resmi kayıt')
    expect(strictSafetyAnswer('abusive')).toContain('Bu şekilde yanıt veremem')
  })

  it('passes supported answers with aligned evidence', () => {
    const verdict = evaluateStrictAnswer({
      question: 'Tıp Fakülteniz var mı?',
      understanding: understandStrictQuestion('Tıp Fakülteniz var mı?'),
      answer: 'Tıp Fakültesi vardır; onaylı tanıtım broşüründe listelenmektedir.',
      citations: [
        {
          providerSourceId: 'brochure-07-campus-program-map.md',
          title: 'YİÜ Tanıtım Broşürü - Program ve Yerleşke Eşleşmeleri',
          quote:
            '### Tıp Fakültesi\nProgramlar:\n- Tıp Fakültesi (Türkçe)\n- Tıp Fakültesi (İngilizce)',
        },
      ],
    })

    expect(verdict).toMatchObject({
      action: 'pass',
      reason: 'supported',
    })
  })

  it('repairs bare no-information answers into contextual meeting-ready boundaries', () => {
    const verdict = critic(
      'Öğrenci işleri telefon numarası nedir?',
      'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.'
    )

    expect(verdict).toMatchObject({
      action: 'repair',
      reason: 'actionable_no_info',
      refusal: true,
    })
    expect(verdict.repairedAnswer).toContain('Öğrenci işleri telefon numarası')
    expect(verdict.repairedAnswer).toContain('onaylı kaynaklarda net bilgi bulunmamaktadır')
    expect(verdict.repairedAnswer).toContain('resmi iletişim kanallarını')
    expect(verdict.repairedAnswer).toContain('hangi birim')
  })

  it('adds decision criteria to clinical, housing, registration, and credential no-info boundaries', () => {
    const clinical = critic(
      'Ebelik öğrencileri uygulamaya ne zaman başlıyor?',
      'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.'
    )
    expect(clinical).toMatchObject({
      action: 'repair',
      reason: 'actionable_no_info',
    })
    expect(clinical.repairedAnswer).toContain('ilgili programın akademik birimi')
    expect(clinical.repairedAnswer).toContain('hangi sınıf/dönem')

    const housing = critic(
      'Yurt başvurusu nasıl yapılıyor?',
      'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.'
    )
    expect(housing).toMatchObject({
      action: 'repair',
      reason: 'actionable_no_info',
    })
    expect(housing.repairedAnswer).toContain('yurt/konaklama sayfası')
    expect(housing.repairedAnswer).toContain('başvuru takvimi')

    const registration = critic(
      'Kesin kayıt için hangi belgeler gerekiyor?',
      'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.'
    )
    expect(registration).toMatchObject({
      action: 'repair',
      reason: 'actionable_no_info',
    })
    expect(registration.repairedAnswer).toContain('resmi kayıt duyuruları')
    expect(registration.repairedAnswer).toContain('aday türü')

    const credential = critic(
      'Akreditasyon olmazsa diplomam geçersiz mi olur?',
      'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.'
    )
    expect(credential).toMatchObject({
      action: 'repair',
      reason: 'actionable_no_info',
    })
    expect(credential.repairedAnswer).toContain('diplomanın geçersiz olduğu anlamına gelmez')
    expect(credential.repairedAnswer).toContain('YÖK')
  })

  it('repairs unsupported operational claims into contextual boundaries instead of passing shallow answers', () => {
    const verdict = evaluateStrictAnswer({
      question: 'Yurt başvurusu nasıl yapılıyor?',
      understanding: understandStrictQuestion('Yurt başvurusu nasıl yapılıyor?'),
      answer: 'Yurt başvuruları üniversitenin web sitesi üzerinden online yapılır.',
      citations: [
        {
          providerSourceId: 'housing-summary',
          title: 'Konaklama Bilgilendirme',
          quote: 'Öğrenciler için konaklama konusunda genel bilgilendirme yapılmaktadır.',
        },
      ],
    })

    expect(verdict).toMatchObject({
      action: 'repair',
      reason: 'unsupported_institutional_claim',
      refusal: true,
    })
    expect(verdict.repairedAnswer).toContain('Yurt başvurusu nasıl yapılıyor')
    expect(verdict.repairedAnswer).toContain('onaylı kaynaklarda net bilgi bulunmamaktadır')
  })

  it('passes operational answers only when the claim is directly supported by evidence', () => {
    const verdict = evaluateStrictAnswer({
      question: 'Kampüse servis var mı?',
      understanding: understandStrictQuestion('Kampüse servis var mı?'),
      answer: 'Evet, kampüse servis bulunmaktadır.',
      citations: [
        {
          providerSourceId: 'transport',
          title: 'Ulaşım ve Servis Bilgileri',
          quote: 'Öğrenciler için kampüse servis bulunmaktadır.',
        },
      ],
    })

    expect(verdict).toMatchObject({
      action: 'pass',
      reason: 'supported',
    })
  })

  it('repairs answers that satisfy the wrong question facet with adjacent evidence', () => {
    const verdict = evaluateStrictAnswer({
      question: 'Ebelik uygulama laboratuvarı var mı?',
      understanding: understandStrictQuestion('Ebelik uygulama laboratuvarı var mı?'),
      answer:
        'Evet, ebelik bölümü bulunmaktadır. Ücretli, burslu ve %50 indirimli kontenjanları vardır.',
      citations: [
        {
          providerSourceId: 'program-table',
          title: 'Program Kontenjanları',
          quote: 'Ebelik | Ücretli kontenjan 6 | Burslu kontenjan 4 | %50 indirimli kontenjan 19',
        },
      ],
    })

    expect(verdict).toMatchObject({
      action: 'repair',
      reason: 'facet_mismatch',
      refusal: true,
    })
    expect(verdict.repairedAnswer).toContain('Ebelik uygulama laboratuvarı')
    expect(verdict.repairedAnswer).toContain('net bilgi bulunmamaktadır')
  })

  it('does not treat broad fee evidence as support for an unsupported KDV inclusion claim', () => {
    const verdict = evaluateStrictAnswer({
      question: 'Ücretlere KDV dahil mi?',
      understanding: understandStrictQuestion('Ücretlere KDV dahil mi?'),
      answer: 'Evet, ücretlere KDV dahildir.',
      citations: [
        {
          providerSourceId: 'fees',
          title: '2025 Ücret Tablosu',
          quote: '2025-2026 eğitim öğretim yılı program ücretleri tabloda listelenmiştir.',
        },
      ],
    })

    expect(verdict).toMatchObject({
      action: 'repair',
      reason: 'unsupported_institutional_claim',
      refusal: true,
    })
    expect(verdict.repairedAnswer).toContain('Ücretlere KDV dahil mi')
    expect(verdict.repairedAnswer?.toLocaleLowerCase('tr-TR')).toContain('ücret ve ödeme koşulları')
    expect(verdict.repairedAnswer).toContain('resmi ücret')
  })

  it('passes KDV inclusion claims when the exact claim is supported by evidence', () => {
    const verdict = evaluateStrictAnswer({
      question: 'Ücretlere KDV dahil mi?',
      understanding: understandStrictQuestion('Ücretlere KDV dahil mi?'),
      answer: 'Evet, ücretlere KDV dahildir.',
      citations: [
        {
          providerSourceId: 'fees',
          title: '2025 Ücret Tablosu',
          quote: '2025-2026 eğitim öğretim yılı ücretlerine KDV dahildir.',
        },
      ],
    })

    expect(verdict).toMatchObject({
      action: 'pass',
      reason: 'supported',
    })
  })

  it('repairs bare scholarship no-information answers with a burs-specific next step', () => {
    const verdict = critic(
      'Bursum kesilir mi?',
      'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.'
    )

    expect(verdict).toMatchObject({
      action: 'repair',
      reason: 'actionable_no_info',
      refusal: true,
    })
    expect(verdict.repairedAnswer).toContain('Bursum kesilir mi')
    expect(verdict.repairedAnswer?.toLocaleLowerCase('tr-TR')).toContain(
      'burs ve indirim koşulları'
    )
    expect(verdict.repairedAnswer).toContain('resmi burs')
  })

  it('uses a direct payment-method boundary for unsupported crypto payment questions', () => {
    const verdict = critic(
      'Ücreti kriptoyla ödeyebilir miyim?',
      'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.'
    )

    expect(verdict).toMatchObject({
      action: 'repair',
      reason: 'actionable_no_info',
      refusal: true,
    })
    expect(verdict.repairedAnswer).toContain('Kripto para ile ödeme')
    expect(verdict.repairedAnswer).toContain('resmi ödeme')
    expect(verdict.repairedAnswer?.toLocaleLowerCase('tr-TR')).not.toContain('kart')
  })

  it('repairs speculative payment-method additions even when the answer starts with a no-info boundary', () => {
    const verdict = evaluateStrictAnswer({
      question: 'Ücreti kriptoyla ödeyebilir miyim?',
      understanding: understandStrictQuestion('Ücreti kriptoyla ödeyebilir miyim?'),
      answer:
        'Yüksek İhtisas Üniversitesi’nin eğitim ücretleriyle ilgili dökümanlarda kripto para ile ödeme seçeneği hakkında bilgi bulunmamaktadır. Ödeme genellikle kredi kartı, banka kartı veya bankalar aracılığıyla yapılmaktadır, ancak kriptoyla ödeme imkanı belirtilmemiştir.',
      citations: [
        {
          providerSourceId: 'fees',
          title: 'Ücret Bilgilendirme',
          quote: '2025-2026 eğitim öğretim yılı program ücretleri tabloda listelenmiştir.',
        },
      ],
    })

    expect(verdict).toMatchObject({
      action: 'repair',
      reason: 'unsupported_institutional_claim',
      refusal: true,
    })
    expect(verdict.repairedAnswer).toContain('Kripto para ile ödeme')
    expect(verdict.repairedAnswer?.toLocaleLowerCase('tr-TR')).not.toContain('genellikle')
  })
})
