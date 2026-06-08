import { describe, expect, it } from 'vitest'

import {
  applyRetestArtifacts,
  buildEffectiveEvaluationRows,
  parseCustomerEvaluationRows,
  summarizeScoreDistribution,
} from './customer-question-score-report'

describe('customer question score report', () => {
  it('parses only the main evaluation table rows', () => {
    const rows = parseCustomerEvaluationRows([
      '## Evaluation Table',
      '',
      '| # | Batch | Soru | Cevap özeti | Doğrudan demo çıktısı | Kredi | OpenAI TL üst tahmin | Puan /10 | Değerlendirme / Beklenen |',
      '|---:|---|---|---|---|---:|---:|---:|---|',
      '| 1 | İlk 10 | Üniversiteniz Ankara’da mı? | özet | çıktı | 1.0 | 0.1 | 5 | not |',
      '| 2 | İlk 10 | Tıp Fakülteniz var mı? | özet | çıktı | 1.0 | 0.1 | 8 | not |',
      '',
      '## Batch Summaries',
      '',
      '| Score /10 | Question count | Share |',
      '|---:|---:|---:|',
      '| 1 | 18 | 3.5% |',
    ].join('\n'))

    expect(rows).toEqual([
      { no: 1, question: 'Üniversiteniz Ankara’da mı?', originalScore: 5, score: 5 },
      { no: 2, question: 'Tıp Fakülteniz var mı?', originalScore: 8, score: 8 },
    ])
  })

  it('applies retest artifact scores in chronological filename order', () => {
    const rows = [
      { no: 1, question: 'A', originalScore: 2, score: 2 },
      { no: 2, question: 'B', originalScore: 7, score: 7 },
    ]

    const merged = applyRetestArtifacts(rows, [
      {
        filename: 'yiu-score-2026-06-07T10-00-00-000Z.json',
        content: JSON.stringify({
          entries: [
            { row: { no: 1 }, suggestedScore: 7 },
            { row: { no: 2 }, suggestedScore: 8 },
          ],
        }),
      },
      {
        filename: 'yiu-score-2026-06-07T11-00-00-000Z.json',
        content: JSON.stringify({
          entries: [{ row: { no: 1 }, suggestedScore: 9 }],
        }),
      },
    ])

    expect(merged.map((row) => [row.no, row.score])).toEqual([
      [1, 9],
      [2, 8],
    ])
  })

  it('summarizes exact score distributions with zero buckets', () => {
    const distribution = summarizeScoreDistribution([
      { no: 1, question: 'A', originalScore: 2, score: 9 },
      { no: 2, question: 'B', originalScore: 7, score: 8 },
    ])

    expect(distribution).toEqual({
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
      7: 0,
      8: 1,
      9: 1,
      10: 0,
    })
  })

  it('keeps the latest retest metadata for effective rows', () => {
    const rows = [
      { no: 1, question: 'Taksit imkanı var mı?', originalScore: 7, score: 7 },
      { no: 2, question: 'Tıp Fakültesi kaç yıllık?', originalScore: 8, score: 8 },
    ]

    const effectiveRows = buildEffectiveEvaluationRows(rows, [
      {
        filename: 'yiu-score-2026-06-08T10-00-00-000Z.json',
        content: JSON.stringify({
          entries: [
            {
              row: { no: 1 },
              result: {
                answer: 'Taksit koşulu hakkında onaylı kaynaklarda net bilgi bulunmamaktadır.',
                refusal: true,
                citations: [{ title: 'Ödeme koşulları kapsamı' }],
                diagnostics: {
                  strictVerdict: 'catalog_payment_policy_scope_guard',
                  strictQuality: {
                    suggestedScore: 8,
                    tier: 'safe_actionable_boundary',
                    reason: 'safe boundary',
                  },
                },
              },
              suggestedScore: 8,
              classification: 'finance:safe_no_info:no_llm_action',
            },
          ],
        }),
      },
      {
        filename: 'yiu-score-2026-06-08T11-00-00-000Z.json',
        content: JSON.stringify({
          entries: [
            {
              row: { no: 1 },
              result: {
                answer: 'Taksit için güncel ödeme duyurusu doğrulanmalıdır.',
                refusal: true,
                citations: [{ title: 'Güncel ödeme duyurusu kapsamı' }],
                diagnostics: {
                  strictVerdict: 'catalog_payment_policy_scope_guard',
                  strictQuality: {
                    suggestedScore: 8,
                    tier: 'safe_actionable_boundary',
                    reason: 'latest safe boundary',
                  },
                },
              },
              suggestedScore: 8,
              classification: 'finance:safe_no_info:no_llm_action',
            },
            {
              row: { no: 2 },
              result: {
                answer: 'Tıp Fakültesi 6 yıllıktır.',
                refusal: false,
                citations: [{ title: 'Program süreleri' }],
                diagnostics: {
                  strictVerdict: 'catalog_program_duration_fact',
                  strictQuality: {
                    suggestedScore: 9,
                    tier: 'grounded_direct_fact',
                    reason: 'grounded fact',
                  },
                },
              },
              suggestedScore: 9,
              classification: 'catalog_or_policy:grounded:no_llm_action',
            },
          ],
        }),
      },
    ])

    expect(effectiveRows.map((row) => [row.no, row.score])).toEqual([
      [1, 8],
      [2, 9],
    ])
    expect(effectiveRows[0]?.latestRetest).toEqual({
      artifactFilename: 'yiu-score-2026-06-08T11-00-00-000Z.json',
      answer: 'Taksit için güncel ödeme duyurusu doğrulanmalıdır.',
      classification: 'finance:safe_no_info:no_llm_action',
      refusal: true,
      suggestedScore: 8,
      strictQuality: {
        reason: 'latest safe boundary',
        suggestedScore: 8,
        tier: 'safe_actionable_boundary',
      },
      strictVerdict: 'catalog_payment_policy_scope_guard',
      citationCount: 1,
    })
    expect(effectiveRows[1]?.latestRetest?.strictQuality?.tier).toBe('grounded_direct_fact')
  })

  it('uses strict quality suggested score when older batch heuristics under-score the same answer', () => {
    const effectiveRows = buildEffectiveEvaluationRows(
      [{ no: 1, question: 'Hazırlığı geçemezsem ne olur?', originalScore: 3, score: 3 }],
      [
        {
          filename: 'yiu-score-2026-06-08T12-00-00-000Z.json',
          content: JSON.stringify({
            entries: [
              {
                row: { no: 1 },
                result: {
                  answer:
                    'Hazırlık başarı/tekrar koşulu hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Karar için program ve resmi akademik yönerge doğrulanmalıdır.',
                  refusal: true,
                  citations: [{ title: 'Akademik süreç kapsamı' }],
                  diagnostics: {
                    strictVerdict: 'catalog_academic_process_scope_guard',
                    strictQuality: {
                      suggestedScore: 8,
                      tier: 'safe_actionable_boundary',
                      reason: 'safe boundary',
                    },
                  },
                },
                suggestedScore: 6,
                classification: 'general:safe_no_info:no_llm_action',
              },
            ],
          }),
        },
      ]
    )

    expect(effectiveRows[0]?.score).toBe(8)
    expect(effectiveRows[0]?.latestRetest?.suggestedScore).toBe(8)
  })
})
