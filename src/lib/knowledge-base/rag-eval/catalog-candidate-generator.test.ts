import { describe, expect, it } from 'vitest'

import type { CustomerEffectiveEvaluationRow } from './customer-question-score-report'
import { analyzeCatalogCandidateGaps } from './catalog-candidate-generator'

function row(
  overrides: Partial<CustomerEffectiveEvaluationRow> &
    Pick<CustomerEffectiveEvaluationRow, 'no' | 'question' | 'score'>
): CustomerEffectiveEvaluationRow {
  return {
    originalScore: overrides.score,
    ...overrides,
  }
}

describe('catalog candidate generator', () => {
  it('groups current score-8 safe boundaries into catalog candidates', () => {
    const analysis = analyzeCatalogCandidateGaps([
      row({
        no: 1,
        question: 'Taksit imkanı var mı?',
        score: 8,
        latestRetest: {
          artifactFilename: 'a.json',
          answer: 'taksit koşulu hakkında onaylı kaynaklarda net bilgi bulunmamaktadır.',
          citationCount: 1,
          refusal: true,
          suggestedScore: 8,
          strictVerdict: 'catalog_payment_policy_scope_guard',
          strictQuality: { suggestedScore: 8, tier: 'safe_actionable_boundary' },
        },
      }),
      row({
        no: 2,
        question: 'Servis güzergahları nereden geçiyor?',
        score: 8,
        latestRetest: {
          artifactFilename: 'a.json',
          answer: 'servis güzergahları hakkında onaylı kaynaklarda net bilgi bulunmamaktadır.',
          citationCount: 1,
          refusal: true,
          suggestedScore: 8,
          strictVerdict: 'catalog_campus_transport_scope_guard',
          strictQuality: { suggestedScore: 8, tier: 'safe_actionable_boundary' },
        },
      }),
    ])

    expect(analysis.targetRows).toHaveLength(2)
    expect(analysis.categoryBreakdown).toEqual([
      { category: 'campus_housing_transport', count: 1 },
      { category: 'finance_payment_policy', count: 1 },
    ])
    expect(analysis.candidates).toEqual([
      expect.objectContaining({
        action: 'add_approved_fact',
        category: 'campus_housing_transport',
        catalogSlot: 'campus_transport.service_details',
        missingFact: 'Güncel servis, ulaşım modu, güzergah, saat veya ücret ayrıntısı',
        questionCount: 1,
        exampleQuestions: ['#2 Servis güzergahları nereden geçiyor?'],
      }),
      expect.objectContaining({
        action: 'add_approved_fact',
        category: 'finance_payment_policy',
        catalogSlot: 'finance.payment_policy',
        missingFact: 'KDV, taksit, peşin/online ödeme, IBAN, kayıt anı ödeme veya yıllık artış koşulu',
        questionCount: 1,
        exampleQuestions: ['#1 Taksit imkanı var mı?'],
      }),
    ])
  })

  it('marks grounded direct facts as rerun regrade candidates instead of catalog gaps', () => {
    const analysis = analyzeCatalogCandidateGaps([
      row({
        no: 3,
        question: 'Tıp Fakültesi kaç yıllık?',
        score: 8,
        latestRetest: {
          artifactFilename: 'b.json',
          answer: 'Tıp Fakültesi 6 yıllıktır.',
          citationCount: 1,
          refusal: false,
          suggestedScore: 8,
          strictVerdict: 'catalog_program_duration_fact',
          strictQuality: { suggestedScore: 9, tier: 'grounded_direct_fact' },
        },
      }),
    ])

    expect(analysis.candidates).toEqual([
      expect.objectContaining({
        action: 'rerun_regrade',
        category: 'grounded_direct_fact',
        catalogSlot: 'strict_quality.regrade',
        missingFact: 'Catalog fact already exists; rerun should use strictQuality suggested score',
        questionCount: 1,
        expectedLift: '8 -> 9',
      }),
    ])
  })

  it('keeps safe-boundary quality from being promoted by a broad fact verdict', () => {
    const analysis = analyzeCatalogCandidateGaps([
      row({
        no: 11,
        question: 'Afiliye hastanede yoğun bakım var mı?',
        score: 8,
        latestRetest: {
          artifactFilename: 'safe.json',
          answer:
            'Afiliye hastanenin yoğun bakım ayrıntısı hakkında onaylı kaynaklarda net bilgi bulunmamaktadır.',
          citationCount: 1,
          refusal: true,
          suggestedScore: 8,
          strictVerdict: 'catalog_affiliated_hospital_training_fact',
          strictQuality: { suggestedScore: 8, tier: 'safe_actionable_boundary' },
        },
      }),
    ])

    expect(analysis.candidates).toEqual([
      expect.objectContaining({
        action: 'add_approved_fact',
        category: 'clinical_staj_lab',
        catalogSlot: 'clinical_training.program_practice_details',
      }),
    ])
  })

  it('does not produce catalog candidates for score-9 direct facts or off-topic boundaries', () => {
    const analysis = analyzeCatalogCandidateGaps([
      row({
        no: 4,
        question: 'Kredi kartımı yazsam ödeme alır mısın?',
        score: 9,
        latestRetest: {
          artifactFilename: 'c.json',
          answer: 'Kart bilgisi alamam.',
          citationCount: 0,
          refusal: true,
          suggestedScore: 9,
          strictVerdict: 'unsafe_sensitive_data',
          strictQuality: { suggestedScore: 9, tier: 'grounded_direct_fact' },
        },
      }),
      row({
        no: 5,
        question: 'Bana kahve tarifi verir misin?',
        score: 8,
        latestRetest: {
          artifactFilename: 'c.json',
          answer: 'Bu konu üniversite dokümanları kapsamında değildir.',
          citationCount: 1,
          refusal: true,
          suggestedScore: 8,
          strictVerdict: 'catalog_off_topic_scope_guard',
          strictQuality: { suggestedScore: 8, tier: 'safe_actionable_boundary' },
        },
      }),
    ])

    expect(analysis.targetRows).toHaveLength(1)
    expect(analysis.candidates).toEqual([
      expect.objectContaining({
        action: 'keep_boundary',
        category: 'off_topic_or_safety',
        questionCount: 1,
        expectedLift: 'none',
      }),
    ])
  })

  it('uses question text as a fallback when old score-8 rows do not have retest metadata', () => {
    const analysis = analyzeCatalogCandidateGaps([
      row({
        no: 6,
        question: 'Üniversiteniz devlet mi vakıf üniversitesi mi?',
        score: 8,
      }),
      row({
        no: 7,
        question: 'Yemek fiyatları ne kadar?',
        score: 8,
      }),
      row({
        no: 8,
        question: 'Hemşirelik kontenjanı nedir?',
        score: 8,
      }),
      row({
        no: 9,
        question: 'Ameliyathane Hizmetleri var mı?',
        score: 8,
      }),
      row({
        no: 10,
        question: 'Tıbbi Görüntüleme Teknikleri ücreti nedir?',
        score: 8,
        latestRetest: {
          artifactFilename: 'old.json',
          answer: 'Ücret hakkında onaylı kaynaklarda net bilgi bulunmamaktadır.',
          citationCount: 0,
          suggestedScore: 8,
          strictVerdict: 'actionable_no_info',
        },
      }),
    ])

    expect(analysis.categoryBreakdown).toEqual([
      { category: 'admissions_decision', count: 1 },
      { category: 'campus_housing_transport', count: 1 },
      { category: 'finance_payment_policy', count: 1 },
      { category: 'grounded_direct_fact', count: 2 },
    ])
    expect(analysis.candidates.map((candidate) => candidate.action)).toEqual([
      'add_approved_fact',
      'add_approved_fact',
      'add_approved_fact',
      'rerun_regrade',
    ])
  })

  it('does not treat preference and subjective questions as direct catalog facts', () => {
    const analysis = analyzeCatalogCandidateGaps([
      row({
        no: 11,
        question: 'Hastanede çalışmak istiyorum, hangi programı seçmeliyim?',
        score: 7,
      }),
      row({
        no: 12,
        question: 'En az ders çalışarak hangi bölüm okunur?',
        score: 7,
      }),
      row({
        no: 13,
        question: 'Hocalar zor mu?',
        score: 7,
      }),
      row({
        no: 14,
        question: 'Rakip üniversiteyle kıyaslar mısın?',
        score: 7,
      }),
      row({
        no: 15,
        question: 'Ankara’da kiralar ne kadar?',
        score: 7,
      }),
    ], { targetScore: 7 })

    expect(analysis.categoryBreakdown).toEqual([
      { category: 'admissions_decision', count: 1 },
      { category: 'campus_housing_transport', count: 1 },
      { category: 'professional_outcome', count: 3 },
    ])
    expect(analysis.candidates).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'grounded_direct_fact' }),
      ])
    )
  })

  it('groups academic-process scope guards with admissions decision candidates', () => {
    const analysis = analyzeCatalogCandidateGaps([
      row({
        no: 16,
        question: 'Hazırlığı geçemezsem ne olur?',
        score: 8,
        latestRetest: {
          artifactFilename: 'academic.json',
          answer:
            'Hazırlık başarı/tekrar koşulu hakkında onaylı kaynaklarda net bilgi bulunmamaktadır.',
          citationCount: 1,
          refusal: true,
          suggestedScore: 8,
          strictVerdict: 'catalog_academic_process_scope_guard',
          strictQuality: { suggestedScore: 8, tier: 'safe_actionable_boundary' },
        },
      }),
    ])

    expect(analysis.categoryBreakdown).toEqual([
      { category: 'admissions_decision', count: 1 },
    ])
    expect(analysis.candidates).toEqual([
      expect.objectContaining({
        category: 'admissions_decision',
        catalogSlot: 'admissions.metrics_and_decision_policy',
      }),
    ])
  })
})
