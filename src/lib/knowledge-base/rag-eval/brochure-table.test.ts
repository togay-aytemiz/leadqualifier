import { describe, expect, it } from 'vitest'
import { planBrochureQuery } from './brochure-query-plan'
import {
  parseBrochureTableRows,
  resolveBrochureTableFact,
} from './brochure-table'
import type { RagProviderCitation } from './types'

const tableCitation: RagProviderCitation = {
  providerSourceId: 'file_brochure',
  title: 'YİÜ Tanıtım Broşürü - Sağlık Hizmetleri Meslek Yüksekokulu Kontenjan ve Ücretler',
  url: 'https://example.edu.tr/brochure.pdf',
  quote: [
    '| Puan Kodu | Program Adı | Puan Türü | 2025 Kontenjanı | 2024 Başarı Sırası | 2024 Taban Puanı | 2025 Fiyat |',
    '|---|---|---:|---:|---:|---:|---:|',
    '| 207950097 | Optisyenlik (Burslu) | TYT | 7 | 444.708 | 345,708 | - |',
    '| 207950160 | Optisyenlik (%50 İnd.) | TYT | 40 | 1.291.863 | 271,670 | 165.000 |',
    '| 207950087 | Tıbbi Tanıtım ve Pazarlama (Burslu) | TYT | 4 | 767.115 | 309,532 | 330.000 |',
  ].join('\n'),
  score: 0.91,
}

const tipCitation: RagProviderCitation = {
  providerSourceId: 'file_tip',
  title: 'YİÜ Tanıtım Broşürü - Tıp Fakültesi Kontenjan ve Ücretler',
  quote: [
    '| Puan Kodu | Bölüm Adı | Puan Türü | 2025 Kontenjanı | 2024 Başarı Sırası | 2024 Taban Puanı | 2025 Fiyat |',
    '|---|---|---:|---:|---:|---:|---:|',
    '| 207950202 | Tıp Fakültesi (%50 İnd.) | SAY | 10 | 18.145 | 483,077 | 360.000 |',
    '| 207950209 | Tıp Fakültesi (İngilizce) (%50 İnd.) | SAY | 6 | 20.117 | 479,259 | 360.000 |',
    '| - | Tıp Fakültesi (Hazırlık) | - | - | - | - | 410.000 |',
  ].join('\n'),
  score: 0.93,
}

const comparisonCitation: RagProviderCitation = {
  providerSourceId: 'file_myo',
  title: 'YİÜ Tanıtım Broşürü - Meslek Yüksekokulu Kontenjan ve Ücretler',
  quote: [
    '| Puan Kodu | Program Adı | Puan Türü | 2025 Kontenjanı | 2024 Başarı Sırası | 2024 Taban Puanı | 2025 Fiyat |',
    '|---|---|---:|---:|---:|---:|---:|',
    '| - | Elektrik (Ücretli) | TYT | 7 | - | - | 300.000 |',
    '| - | Elektrik (%50 İnd.) | TYT | 27 | - | - | 150.000 |',
    '| - | Grafik Tasarım (Ücretli) | TYT | 7 | - | - | 300.000 |',
    '| - | Grafik Tasarım (%50 İnd.) | TYT | 27 | - | - | 150.000 |',
  ].join('\n'),
}

describe('brochure table facts', () => {
  it('parses brochure rows into named columns', () => {
    expect(parseBrochureTableRows(tableCitation.quote ?? '')[0]).toMatchObject({
      programCode: '207950097',
      programName: 'Optisyenlik (Burslu)',
      pointType: 'TYT',
      quota: '7',
      successRank: '444.708',
      baseScore: '345,708',
      price: '-',
    })
  })

  it('answers success rank and quota from the same Optisyenlik row', () => {
    const result = resolveBrochureTableFact({
      plan: planBrochureQuery(
        'Optisyenlik burslu programının başarı sırası ve kontenjanı nedir?'
      ),
      citations: [tableCitation],
    })

    expect(result).toMatchObject({
      row: {
        programName: 'Optisyenlik (Burslu)',
        successRank: '444.708',
        quota: '7',
      },
      citation: tableCitation,
    })
    expect(result?.answer).toContain('2024 başarı sırası 444.708')
    expect(result?.answer).toContain('2025 kontenjanı 7')
    expect(result?.answer).not.toContain('başarı sırası 7')
  })

  it('selects the exact Tıp preparation and English discounted rows', () => {
    const preparation = resolveBrochureTableFact({
      plan: planBrochureQuery('Tıp Fakültesi hazırlık ücreti ne kadar?'),
      citations: [tipCitation],
    })
    const englishDiscount = resolveBrochureTableFact({
      plan: planBrochureQuery('İngilizce Tıp %50 indirimli programın kontenjanı nedir?'),
      citations: [tipCitation],
    })

    expect(preparation?.row.programName).toBe('Tıp Fakültesi (Hazırlık)')
    expect(preparation?.answer).toContain('2025 fiyatı 410.000 TL')
    expect(englishDiscount?.row.programName).toBe('Tıp Fakültesi (İngilizce) (%50 İnd.)')
    expect(englishDiscount?.answer).toContain('2025 kontenjanı 6')
  })

  it('describes a missing table value without inventing zero', () => {
    const result = resolveBrochureTableFact({
      plan: planBrochureQuery('Optisyenlik burslu programının fiyatı nedir?'),
      citations: [tableCitation],
    })

    expect(result?.answer).toContain('2025 fiyat alanı')
    expect(result?.answer).toContain('belirtilmemiştir')
    expect(result?.answer).not.toContain('0 TL')
  })

  it('adds a verification warning for the known inconsistent brochure row', () => {
    const result = resolveBrochureTableFact({
      plan: planBrochureQuery(
        'Tıbbi Tanıtım ve Pazarlama burslu satırında ücret var gibi görünüyor mu? Bu satırı temkinli açıklar mısın?'
      ),
      citations: [tableCitation],
    })

    expect(result?.answer).toContain('330.000 TL')
    expect(result?.answer).toContain('2025 kontenjanı 4')
    expect(result?.answer).toContain('2024 başarı sırası 767.115')
    expect(result?.answer).toContain('2024 taban puanı 309,532')
    expect(result?.answer).toContain('teyit edilmesi')
  })

  it('answers multi-program and multi-variant comparisons from all matching rows', () => {
    const result = resolveBrochureTableFact({
      plan: planBrochureQuery(
        'Elektrik ve Grafik Tasarım programlarında ücretli ve %50 indirimli fiyatlar aynı mı?'
      ),
      citations: [comparisonCitation],
    })

    expect(result?.rows.map((row) => row.programName)).toEqual([
      'Elektrik (Ücretli)',
      'Elektrik (%50 İnd.)',
      'Grafik Tasarım (Ücretli)',
      'Grafik Tasarım (%50 İnd.)',
    ])
    expect(result?.answer).toContain('Elektrik (Ücretli)')
    expect(result?.answer).toContain('Grafik Tasarım (%50 İnd.)')
    expect(result?.answer).toContain('300.000 TL')
    expect(result?.answer).toContain('150.000 TL')
  })
})
