import { describe, expect, it } from 'vitest'

import { composeLlmFirstTableFactAnswer } from './table-facts'

describe('composeLlmFirstTableFactAnswer', () => {
  it('extracts facts from admission table row snippets even when File Search omits the header', () => {
    const result = composeLlmFirstTableFactAnswer({
      resolvedQuestion: 'Ergoterapi ücreti nedir?',
      answerGoal: 'Ergoterapi programının ücret bilgisini söyle.',
      responseLanguage: 'tr',
      chunks: [
        {
          content: [
            '| 207910112 | Hemşirelik (Ücretli) | SAY | 2 | 313.101 | 286,806 | 490.000 |',
            '| 207910103 | Hemşirelik (Burslu) | SAY | 7 | 131.581 | 360,410 | - |',
            '| - | Ergoterapi (Ücretli) | SAY | 6 | - | - | 460.000 |',
            '| - | Ergoterapi (Burslu) | SAY | 4 | - | - | - |',
            '| - | Ergoterapi (%50 İnd.) | SAY | 19 | - | - | 230.000 |',
          ].join('\n'),
          document_id: 'file_brochure',
          document_title: 'Kontenjan ve Ücretler',
          chunk_id: 'file_brochure',
          source_url: null,
          similarity: 0.8,
        },
      ],
    })

    expect(result?.answer).toContain('Ergoterapi')
    expect(result?.answer).toContain('Ücretli 460.000 TL')
    expect(result?.answer).toContain('%50 İndirimli 230.000 TL')
    expect(result?.answer).not.toContain('Hemşirelik')
  })

  it('extracts education duration from line-based program snippets', () => {
    const result = composeLlmFirstTableFactAnswer({
      resolvedQuestion: 'Tıp Fakültesi kaç yıllık?',
      answerGoal: 'Tıp Fakültesi eğitim süresini söyle.',
      responseLanguage: 'tr',
      chunks: [
        {
          content: [
            'EĞİTİM PROGRAMI',
            'PROGRAM ADI',
            'EĞİTİM SÜRESİ / EDUCATION TIME',
            '',
            'Tıp Fakültesi (Türkçe)',
            '6 yıl (years)',
            '',
            'Tıp Fakültesi (İngilizce)',
            '6 yıl (years)',
          ].join('\n'),
          document_id: 'file_duration',
          document_title: 'Program Süreleri',
          chunk_id: 'file_duration',
          source_url: null,
          similarity: 0.82,
        },
      ],
    })

    expect(result?.answer).toContain('Tıp Fakültesi')
    expect(result?.answer).toContain('6 yıl')
    expect(result?.answer).not.toContain('years')
  })

  it('does not treat long dated narrative paragraphs as education duration rows', () => {
    const result = composeLlmFirstTableFactAnswer({
      resolvedQuestion: 'Tıp Fakültesi kaç yıllık?',
      answerGoal: 'Tıp Fakültesi eğitim süresini söyle.',
      responseLanguage: 'tr',
      chunks: [
        {
          content:
            'Yüksek İhtisas Üniversitesi Lisansüstü Eğitim Enstitüsü, Tıp Fakültesi ile Sağlık Bilimleri Fakültesi kapsamında yüksek lisans ve doktora eğitimini düzenlemek amacıyla kurulmuştur. 2017 yılında yeni programlar açılmıştır.',
          document_id: 'file_narrative',
          document_title: 'Akademik Genel Bilgi',
          chunk_id: 'file_narrative',
          source_url: null,
          similarity: 0.7,
        },
      ],
    })

    expect(result).toBeNull()
  })
})
