import { describe, expect, it } from 'vitest'

import { buildStrictClaimLedger } from './strict-claim-ledger'
import { understandStrictQuestion } from './strict-question-understanding'

function ledger(question: string, answer: string, quote: string) {
  return buildStrictClaimLedger({
    question,
    understanding: understandStrictQuestion(question),
    answer,
    citations: [
      {
        providerSourceId: 'source-1',
        title: 'Test Source',
        quote,
      },
    ],
  })
}

describe('buildStrictClaimLedger', () => {
  it('marks exact policy/payment claims unsupported when broad evidence omits the claim marker', () => {
    const result = ledger(
      'Ücretlere KDV dahil mi?',
      'Evet, ücretlere KDV dahildir.',
      '2025-2026 eğitim öğretim yılı program ücretleri tabloda listelenmiştir.'
    )

    expect(result.requiresDirectEvidence).toBe(true)
    expect(result.unsupportedClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'policy_marker',
          text: 'KDV dahil',
          support: 'unsupported',
        }),
      ])
    )
  })

  it('marks claim terms and critical values supported when the evidence contains them', () => {
    const result = ledger(
      'Tıp Fakültesi ücreti ne kadar?',
      'Tıp Fakültesi (Ücretli) için 2025 fiyatı 720.000 TL olarak listelenmektedir.',
      'Tıp Fakültesi (Ücretli) | 2025 Fiyat | 720.000 TL'
    )

    expect(result.unsupportedClaims).toHaveLength(0)
    expect(result.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'critical_value',
          text: '720.000',
          support: 'supported',
        }),
      ])
    )
  })

  it('does not create unsupported factual claims for contextual no-information answers', () => {
    const result = buildStrictClaimLedger({
      question: 'Kampüste Wi-Fi var mı?',
      understanding: understandStrictQuestion('Kampüste Wi-Fi var mı?'),
      answer:
        'Wi-Fi hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Güncel resmi duyurular kontrol edilmelidir.',
      citations: [],
    })

    expect(result.claims).toHaveLength(0)
    expect(result.unsupportedClaims).toHaveLength(0)
  })
})
