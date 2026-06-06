import { describe, expect, it } from 'vitest'

import { understandStrictQuestion } from './strict-question-understanding'

describe('understandStrictQuestion', () => {
  it('normalizes colloquial Turkish education questions before routing', () => {
    expect(understandStrictQuestion('dkt kaç tl')).toMatchObject({
      normalizedQuestion: 'Dil ve Konuşma Terapisi ücreti ne kadar?',
      intents: ['price'],
      entities: [
        {
          kind: 'program',
          canonicalName: 'Dil ve Konuşma Terapisi',
        },
      ],
    })

    expect(understandStrictQuestion('ftr var mı')).toMatchObject({
      normalizedQuestion: 'Fizyoterapi ve Rehabilitasyon var mı?',
      intents: ['existence'],
      entities: [
        {
          kind: 'program',
          canonicalName: 'Fizyoterapi ve Rehabilitasyon',
        },
      ],
    })

    expect(understandStrictQuestion('shmyo bölümleri')).toMatchObject({
      normalizedQuestion: 'Sağlık Hizmetleri Meslek Yüksekokulu bölümleri',
      intents: ['listing'],
      entities: [
        {
          kind: 'school',
          canonicalName: 'Sağlık Hizmetleri Meslek Yüksekokulu',
        },
      ],
    })
  })

  it('keeps intent signals after typo and spacing cleanup', () => {
    expect(understandStrictQuestion('servis varmı')).toMatchObject({
      normalizedQuestion: 'ulaşım servisi var mı?',
      intents: ['transport', 'existence'],
      safety: 'none',
    })

    expect(understandStrictQuestion('ilkyardım ücret')).toMatchObject({
      normalizedQuestion: 'İlk ve Acil Yardım ücreti ne kadar?',
      intents: ['price'],
      entities: [
        {
          kind: 'program',
          canonicalName: 'İlk ve Acil Yardım',
        },
      ],
    })
  })

  it('recognizes faculty listing and additional clinical program aliases', () => {
    expect(understandStrictQuestion('Üniversitenizde hangi fakülteler var?')).toMatchObject({
      intents: ['existence', 'listing'],
    })

    expect(understandStrictQuestion('Tıbbi Görüntüleme Teknikleri var mı?')).toMatchObject({
      intents: ['existence'],
      entities: [
        {
          kind: 'program',
          canonicalName: 'Tıbbi Görüntüleme Teknikleri',
        },
      ],
    })

    expect(understandStrictQuestion('Tıbbi Dokümantasyon ve Sekreterlik var mı?')).toMatchObject({
      intents: ['existence'],
      entities: [
        {
          kind: 'program',
          canonicalName: 'Tıbbi Dokümantasyon ve Sekreterlik',
        },
      ],
    })
  })

  it('detects sensitive requests that should not go to ordinary RAG', () => {
    expect(understandStrictQuestion('TC kimliğimi buraya yazayım mı?')).toMatchObject({
      safety: 'sensitive_personal_data',
      intents: ['safety'],
    })

    expect(understandStrictQuestion('Kredi kartımı yazsam ödeme alır mısın?')).toMatchObject({
      safety: 'payment_card',
      intents: ['payment', 'safety'],
    })

    expect(understandStrictQuestion('ÖSYM şifremi vereyim, tercihlerimi sen yap.')).toMatchObject({
      safety: 'credential_request',
      intents: ['safety'],
    })
  })

  it('keeps discount and tuition variants instead of collapsing them to plain existence', () => {
    expect(understandStrictQuestion('Tıp Fakültesinde %50 indirimli program var mı?')).toMatchObject({
      normalizedQuestion: 'Tıp Fakültesi %50 indirimli program var mı?',
      intents: ['existence', 'scholarship'],
      entities: [
        {
          canonicalName: 'Tıp Fakültesi',
        },
      ],
    })
  })

  it('treats registration bargaining as a payment/fraud boundary, not procurement context', () => {
    expect(understandStrictQuestion('Kayıtta pazarlık yapılıyor mu?')).toMatchObject({
      safety: 'fraud_or_bypass',
      intents: ['payment', 'safety'],
    })
  })
})
