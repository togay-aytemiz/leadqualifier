import { describe, expect, it } from 'vitest'

import { classifyStrictDirectAnswerQuality } from './strict-quality-rubric'

describe('strict direct answer quality rubric', () => {
  it('marks grounded direct facts as 9-ready', () => {
    const quality = classifyStrictDirectAnswerQuality({
      reason: 'catalog_program_duration_fact',
      answer: 'Anestezi 2 yıllık bir ön lisans programı olarak listelenir.',
      citations: [
        {
          providerSourceId: 'strict-catalog:program-durations',
          title: 'Program Süreleri',
          quote: 'Anestezi ön lisans programı 2 yıllık program olarak listelenir.',
        },
      ],
      refusal: false,
    })

    expect(quality).toMatchObject({
      suggestedScore: 9,
      tier: 'grounded_direct_fact',
    })
  })

  it('keeps safe no-info and scope boundaries at 8 instead of over-promoting them', () => {
    const quality = classifyStrictDirectAnswerQuality({
      reason: 'catalog_campus_life_scope_guard',
      answer:
        'Wi-Fi hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Güncel resmi duyurular kontrol edilmelidir.',
      citations: [
        {
          providerSourceId: 'strict-catalog:campus-life-scope',
          title: 'Kampüs Yaşamı Kapsamı',
          quote: 'Wi-Fi gibi güncel imkan bilgileri doğrulanmadan var cevabı verilmemelidir.',
        },
      ],
      refusal: true,
    })

    expect(quality).toMatchObject({
      suggestedScore: 8,
      tier: 'safe_actionable_boundary',
    })
  })

  it('keeps unresolved clarification answers at 7', () => {
    const quality = classifyStrictDirectAnswerQuality({
      reason: 'catalog_clinical_program_clarification',
      answer: 'Hangi bölüm veya program için staj bilgisini öğrenmek istiyorsunuz?',
      citations: [],
      refusal: false,
    })

    expect(quality).toMatchObject({
      suggestedScore: 7,
      tier: 'needs_user_clarification',
    })
  })
})
