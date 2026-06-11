import { describe, expect, it } from 'vitest'

import { compileBehaviorPolicyFromSettings } from '@/lib/ai/behavior-policy'
import { buildUniversalClaimLedger } from './universal-claim-ledger'

const policy = compileBehaviorPolicyFromSettings({
  prompt:
    'Belgeye dayanması gereken bilgiler: ücretler, kontenjanlar, kayıt tarihleri, ödeme/IBAN/taksit/KDV ve resmi iletişim kanalları. Kesin sonuç, garanti ve ödeme bilgisi uydurma.',
})

describe('buildUniversalClaimLedger', () => {
  it('requires direct evidence for policy-configured categories and flags unsupported values', () => {
    const ledger = buildUniversalClaimLedger({
      question: 'Muayene ücreti ne kadar?',
      answer: 'Muayene ücreti 2.500 TL ve KDV dahildir.',
      citations: [
        {
          providerSourceId: 'source-1',
          quote: 'Muayene ücretleri kayıt sırasında ilan edilir.',
        },
      ],
      behaviorPolicy: policy,
    })

    expect(ledger.requiresDirectEvidence).toBe(true)
    expect(ledger.evidenceRequiredFor).toEqual(expect.arrayContaining(['pricing', 'payments']))
    expect(ledger.unsupportedClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '2.500', kind: 'critical_value' }),
        expect.objectContaining({ text: 'KDV dahil', kind: 'policy_marker' }),
      ])
    )
  })

  it('marks official identifiers supported only when evidence contains them', () => {
    const ledger = buildUniversalClaimLedger({
      question: 'IBAN gönderir misin?',
      answer: 'IBAN: TR66 0013 4000 0171 7670 5000 01',
      citations: [
        {
          providerSourceId: 'source-1',
          quote: 'Ödeme için banka bilgileri kayıt duyurusunda paylaşılır.',
        },
      ],
      behaviorPolicy: policy,
    })

    expect(ledger.unsupportedClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'official_identifier',
          text: 'TR66 0013 4000 0171 7670 5000 01',
        }),
      ])
    )
  })
})
