import { describe, expect, it } from 'vitest'
import { planBrochureQuery } from './brochure-query-plan'

describe('planBrochureQuery', () => {
  it('routes a Tıp preparation fee question to the exact brochure table group', () => {
    expect(planBrochureQuery('Tıp Fakültesi hazırlık ücreti ne kadar?')).toMatchObject({
      intent: 'brochure_table_fact',
      program: 'Tıp Fakültesi',
      variant: 'Hazırlık',
      requestedFields: ['price'],
      sourceGroups: ['brochure-program-fee-tip'],
    })
  })

  it('recognizes natural price phrasing and marks subjectless price questions for clarification', () => {
    expect(planBrochureQuery('Tıp kaç para?')).toMatchObject({
      intent: 'brochure_table_fact',
      program: 'Tıp Fakültesi',
      requestedFields: ['price'],
      sourceGroups: ['brochure-program-fee-tip'],
      clarification: undefined,
    })

    expect(planBrochureQuery('Okumak kaç para?')).toMatchObject({
      intent: 'general_approved_corpus',
      requestedFields: ['price'],
      clarification: {
        reason: 'missing_price_subject',
        question:
          'Hangi bölüm, program veya hizmet için ücret bilgisini öğrenmek istiyorsunuz?',
      },
    })
  })

  it('routes discounted program existence wording to the brochure table', () => {
    expect(planBrochureQuery('Tıp Fakültesi %50 indirimli program var mı?')).toMatchObject({
      intent: 'brochure_table_fact',
      programs: ['Tıp Fakültesi'],
      variants: ['%50 İnd.'],
      requestedFields: ['price'],
      sourceGroups: ['brochure-program-fee-tip'],
    })
  })

  it('keeps success rank separate from quota for burslu Optisyenlik', () => {
    expect(
      planBrochureQuery('Optisyenlik burslu programının başarı sırası ve kontenjanı nedir?')
    ).toMatchObject({
      intent: 'brochure_table_fact',
      program: 'Optisyenlik',
      variant: 'Burslu',
      requestedFields: ['success_rank', 'quota'],
      sourceGroups: ['brochure-program-fee-shmyo'],
    })
  })

  it('routes broad base-score and success-rank questions to all brochure table groups', () => {
    expect(planBrochureQuery('Taban puanlar nedir?')).toMatchObject({
      intent: 'brochure_table_fact',
      requestedFields: ['base_score'],
      sourceGroups: expect.arrayContaining([
        'brochure-program-fee-tip',
        'brochure-program-fee-saglik-bilimleri',
        'brochure-program-fee-shmyo',
        'brochure-program-fee-myo',
      ]),
    })

    expect(planBrochureQuery('Başarı sıralamaları nedir?')).toMatchObject({
      intent: 'brochure_table_fact',
      requestedFields: ['success_rank'],
      sourceGroups: expect.arrayContaining([
        'brochure-program-fee-tip',
        'brochure-program-fee-saglik-bilimleri',
        'brochure-program-fee-shmyo',
        'brochure-program-fee-myo',
      ]),
    })
  })

  it('routes scholarship, campus, contact, and document questions independently', () => {
    expect(planBrochureQuery('Tercih bursu oranları nedir?')).toMatchObject({
      intent: 'brochure_scholarship',
      sourceGroups: ['brochure-scholarship-double-major'],
    })
    expect(planBrochureQuery('Anestezi hangi yerleşkede?')).toMatchObject({
      intent: 'brochure_campus_contact',
      sourceGroups: ['brochure-campus-program-map'],
    })
    expect(planBrochureQuery('Üniversitenin genel telefonu nedir?')).toMatchObject({
      intent: 'brochure_campus_contact',
      sourceGroups: ['brochure-overview-contact'],
    })
    expect(planBrochureQuery('BİDB çalışma yönergesinin adı nedir?')).toMatchObject({
      intent: 'document_router',
      sourceGroups: [],
    })
  })

  it('builds a narrowed retry query with program, variant, and requested field', () => {
    const plan = planBrochureQuery('İngilizce Tıp %50 indirimli programın fiyatı nedir?')

    expect(plan).toMatchObject({
      intent: 'brochure_table_fact',
      program: 'Tıp Fakültesi',
      variant: 'İngilizce %50 İnd.',
      requestedFields: ['price'],
      sourceGroups: ['brochure-program-fee-tip'],
    })
    expect(plan.retryQuery).toContain('Tıp Fakültesi')
    expect(plan.retryQuery).toContain('İngilizce %50 İnd.')
    expect(plan.retryQuery).toContain('2025 Fiyat')
  })

  it('leaves general approved-corpus questions unfiltered', () => {
    expect(planBrochureQuery('Üniversite ne zaman kurulmuştur?')).toMatchObject({
      intent: 'general_approved_corpus',
      requestedFields: [],
      sourceGroups: [],
    })
  })

  it('does not route yurtdışı diploma questions to dormitory contact sources', () => {
    expect(planBrochureQuery('Diplomamız yurtdışında geçiyor mu?')).toMatchObject({
      intent: 'general_approved_corpus',
      requestedFields: [],
      sourceGroups: [],
    })
  })

  it('preserves multiple programs and variants for brochure comparisons', () => {
    expect(
      planBrochureQuery(
        'Elektrik ve Grafik Tasarım programlarında ücretli ve %50 indirimli fiyatlar aynı mı?'
      )
    ).toMatchObject({
      intent: 'brochure_table_fact',
      programs: ['Elektrik', 'Grafik Tasarım'],
      variants: ['Ücretli', '%50 İnd.'],
      requestedFields: ['price'],
      sourceGroups: ['brochure-program-fee-myo'],
    })
  })

  it('recognizes natural brochure table field phrasing and full-row explanations', () => {
    expect(
      planBrochureQuery(
        'Sağlık Yönetimi sayısal mı eşit ağırlık mı? Ücretli ve %50 indirimli fiyatları ne?'
      )
    ).toMatchObject({
      intent: 'brochure_table_fact',
      requestedFields: ['point_type', 'price'],
    })
    expect(
      planBrochureQuery('Ameliyathane Hizmetleri %50 indirimli programa kaç kişi alınıyor?')
    ).toMatchObject({
      intent: 'brochure_table_fact',
      requestedFields: ['quota'],
    })
    expect(
      planBrochureQuery(
        'Tıbbi Tanıtım ve Pazarlama burslu satırında ücret var gibi görünüyor mu? Bu satırı temkinli açıklar mısın?'
      )
    ).toMatchObject({
      intent: 'brochure_table_fact',
      requestedFields: ['point_type', 'quota', 'success_rank', 'base_score', 'price'],
    })
  })

  it('recognizes short Tıp preparation phrasing', () => {
    expect(
      planBrochureQuery('Tıp hazırlık okuyacak olursam broşüre göre hazırlık ücreti ayrıca ne kadar?')
    ).toMatchObject({
      intent: 'brochure_table_fact',
      program: 'Tıp Fakültesi',
      variant: 'Hazırlık',
      requestedFields: ['price'],
      sourceGroups: ['brochure-program-fee-tip'],
    })
  })

  it('routes unsupported guarantees and future fees before brochure table lookup', () => {
    expect(
      planBrochureQuery('Bugün bilgimi bırakırsam Tıp Fakültesi için bana kesin kontenjan ayırır mısınız?')
    ).toMatchObject({
      intent: 'unsupported_guardrail',
      guardrailReason: 'guarantee',
    })
    expect(
      planBrochureQuery('2026-2027 akademik yılı Tıp Fakültesi ücretleri ne kadar olacak?')
    ).toMatchObject({
      intent: 'unsupported_guardrail',
      guardrailReason: 'future_information',
    })
  })

  it('asks clarification for personalized admissions chance questions without score or program', () => {
    expect(planBrochureQuery('Puanım şu, kazanır mıyım?')).toMatchObject({
      intent: 'general_approved_corpus',
      clarification: {
        reason: 'missing_admissions_profile',
        question:
          'Hangi program için değerlendirme yapmak istiyorsunuz? Puanınızı veya başarı sıralamanızı da yazarsanız broşürdeki taban puan ve başarı sırası bilgileriyle karşılaştırabilirim.',
      },
    })
  })

  it('does not confuse yerleşkesinde with the Turkish word kesin', () => {
    expect(
      planBrochureQuery('SHMYO Bağlum Yerleşkesinde hangi programlar var ve adresi nedir?')
    ).toMatchObject({
      intent: 'brochure_campus_contact',
      guardrailReason: undefined,
    })
  })

  it('matches program names followed by Turkish apostrophe suffixes', () => {
    expect(
      planBrochureQuery(
        "Tıbbi Veri İşleme Teknikerliği'nde ücretli, burslu ve %50 indirimli kontenjan/fiyat tablosu nasıl?"
      )
    ).toMatchObject({
      intent: 'brochure_table_fact',
      program: 'Tıbbi Veri İşleme Teknikerliği',
      requestedFields: expect.arrayContaining(['quota', 'price']),
      sourceGroups: ['brochure-program-fee-shmyo'],
    })
  })

  it('prioritizes document routing and scopes website/contact retrieval', () => {
    expect(
      planBrochureQuery(
        'Yatay geçiş, çift anadal veya yandal şartlarını öğrenmek için hangi mevzuat dokümanına bakmalıyım?'
      )
    ).toMatchObject({
      intent: 'document_router',
      sourceGroups: [],
    })
    expect(
      planBrochureQuery('Yaz okulunda ders alma koşullarını ve işlemleri nereden öğrenebilirim?')
    ).toMatchObject({
      intent: 'document_router',
      sourceGroups: [],
    })
    expect(
      planBrochureQuery(
        'Aday öğrenci sayfasına göre üniversitede hangi fakülte ve yüksekokul grupları öne çıkıyor?'
      )
    ).toMatchObject({
      intent: 'website_admissions',
      sourceGroups: ['admissions'],
      retryQuery: expect.stringContaining('Spor Bilimleri Fakültesi'),
    })
    expect(
      planBrochureQuery(
        'Öğrenci işleriyle konuşmam gerekirse web sitesinde hangi e-posta ve telefonlar görünüyor?'
      )
    ).toMatchObject({
      intent: 'website_contact',
      sourceGroups: ['contact-admin'],
    })
    expect(
      planBrochureQuery(
        'Rektörlük ve Tıp Fakültesi için web sitesindeki adres, telefon ve genel e-posta nedir?'
      )
    ).toMatchObject({
      intent: 'website_contact',
      sourceGroups: ['contact-admin'],
    })
    expect(
      planBrochureQuery(
        'Web sitesindeki bilgi paketine göre Sağlık Hizmetleri Meslek Yüksekokulu altında hangi programlardan bazıları listeleniyor?'
      )
    ).toMatchObject({
      intent: 'general_approved_corpus',
      sourceGroups: ['general'],
    })
  })

  it('retrieves both campus mapping and brochure contact details for campus contact questions', () => {
    expect(
      planBrochureQuery('Tıp Fakültesi hangi yerleşkede, adres ve genel telefon nedir?')
    ).toMatchObject({
      intent: 'brochure_campus_contact',
      sourceGroups: ['brochure-campus-program-map', 'brochure-overview-contact'],
    })
    expect(
      planBrochureQuery(
        'Yurtların aylık ücretleri broşürde yazıyor mu, yazmıyorsa hangi bağlantıdan bakılması önerilmiş?'
      )
    ).toMatchObject({
      intent: 'brochure_campus_contact',
      sourceGroups: ['brochure-overview-contact'],
    })
  })

  it('scopes brochure history and founder questions to the approved overview package', () => {
    expect(
      planBrochureQuery(
        'Üniversitenin kurucu vakfı ve sağlık alanındaki geçmişiyle ilgili kısa bir tanıtım yapar mısın?'
      )
    ).toMatchObject({
      intent: 'brochure_overview',
      sourceGroups: ['brochure-overview-contact'],
    })
  })
})
