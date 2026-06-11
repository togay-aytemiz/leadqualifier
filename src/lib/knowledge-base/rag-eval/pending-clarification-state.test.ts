import { describe, expect, it } from 'vitest'
import { resolveRagPendingClarificationFollowup } from './pending-clarification-state'
import type { RagPendingClarificationState } from './types'

const programListPending: RagPendingClarificationState = {
  originalQuestion: 'hangi bölümlere kayıt olabilirim',
  clarificationQuestion:
    'Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz?',
  missingSlots: ['scope'],
  requestedMetric: 'program_list',
  retrievalIntent: 'program_list',
  sourcePreference: ['primary_campaign_material', 'website_html'],
  riskLevel: 'low',
}

const tableMetricPending: RagPendingClarificationState = {
  originalQuestion: 'taban puanlar nedir',
  clarificationQuestion: 'Hangi program ve burs/ücret türü için taban puanı öğrenmek istiyorsunuz?',
  missingSlots: ['program', 'row_variant'],
  requestedMetric: 'base_score',
  retrievalIntent: 'base_score',
  sourcePreference: ['primary_campaign_material'],
  riskLevel: 'medium',
}

const internshipPending: RagPendingClarificationState = {
  originalQuestion: 'staj kaç gün',
  clarificationQuestion: 'Hangi bölüm veya program için staj süresini öğrenmek istiyorsunuz?',
  missingSlots: ['program'],
  requestedMetric: 'internship_duration',
  retrievalIntent: 'internship_duration',
  riskLevel: 'medium',
}

const scenarios: Array<{
  name: string
  pending: RagPendingClarificationState
  latest: string
  decision: 'use' | 'ignore' | 'split' | 'clarify'
  expectedAction?: 'rewrite' | 'clarify'
  expectedMetric?: string
}> = [
  {
    name: 'short all-scope answer',
    pending: programListPending,
    latest: 'tümü',
    decision: 'use',
    expectedMetric: 'program_list',
  },
  {
    name: 'student says hepsi',
    pending: programListPending,
    latest: 'hepsi',
    decision: 'use',
    expectedMetric: 'program_list',
  },
  {
    name: 'long all-program answer',
    pending: programListPending,
    latest: 'genel olarak tüm bölümler hakkında bilgi almak istiyorum',
    decision: 'use',
    expectedMetric: 'program_list',
  },
  {
    name: 'natural all-scope sentence with typo',
    pending: programListPending,
    latest: 'tum bolumleri gormek istiyom',
    decision: 'use',
    expectedMetric: 'program_list',
  },
  {
    name: 'burslu selection',
    pending: programListPending,
    latest: 'burslu olanlar',
    decision: 'use',
    expectedMetric: 'program_list',
  },
  {
    name: 'burslu shorthand',
    pending: programListPending,
    latest: 'bursluları göster',
    decision: 'use',
    expectedMetric: 'program_list',
  },
  {
    name: 'lisans scope',
    pending: programListPending,
    latest: 'lisansları söyle',
    decision: 'use',
    expectedMetric: 'program_list',
  },
  {
    name: 'associate degree scope typo',
    pending: programListPending,
    latest: 'on lisanslar',
    decision: 'use',
    expectedMetric: 'program_list',
  },
  {
    name: 'indifferent all-scope answer',
    pending: programListPending,
    latest: 'fark etmez hepsi olur',
    decision: 'use',
    expectedMetric: 'program_list',
  },
  {
    name: 'paid variants still scope not price',
    pending: programListPending,
    latest: 'ücretli de olur hepsini yaz',
    decision: 'use',
    expectedMetric: 'program_list',
  },
  {
    name: 'question-like but LLM says it fills pending scope',
    pending: programListPending,
    latest: 'tüm bölümler var mı acaba',
    decision: 'use',
    expectedMetric: 'program_list',
  },
  {
    name: 'health area scope answer',
    pending: programListPending,
    latest: 'sağlık alanındaki tüm seçenekleri görmek istiyorum',
    decision: 'use',
    expectedMetric: 'program_list',
  },
  {
    name: 'base score program variant',
    pending: tableMetricPending,
    latest: 'tıp ing ücretli',
    decision: 'use',
    expectedMetric: 'base_score',
  },
  {
    name: 'base score Turkish medicine variant',
    pending: tableMetricPending,
    latest: 'tıp türkçe burslu',
    decision: 'use',
    expectedMetric: 'base_score',
  },
  {
    name: 'base score one-word program',
    pending: tableMetricPending,
    latest: 'hemşirelik',
    decision: 'use',
    expectedMetric: 'base_score',
  },
  {
    name: 'base score abbreviation answer',
    pending: tableMetricPending,
    latest: 'dkt',
    decision: 'use',
    expectedMetric: 'base_score',
  },
  {
    name: 'base score typo abbreviation answer',
    pending: tableMetricPending,
    latest: 'ftr var ya o',
    decision: 'use',
    expectedMetric: 'base_score',
  },
  {
    name: 'internship program answer',
    pending: internshipPending,
    latest: 'anestezi',
    decision: 'use',
    expectedMetric: 'internship_duration',
  },
  {
    name: 'internship colloquial answer',
    pending: internshipPending,
    latest: 'ilk yardım için',
    decision: 'use',
    expectedMetric: 'internship_duration',
  },
  {
    name: 'split all programs plus fees',
    pending: programListPending,
    latest: 'tümü, ücretleri de yaz',
    decision: 'split',
    expectedMetric: 'program_list',
  },
  {
    name: 'split scholarship programs plus quota',
    pending: programListPending,
    latest: 'burslu olanlar, kontenjan da lazım',
    decision: 'split',
    expectedMetric: 'program_list',
  },
  {
    name: 'split table row plus another metric',
    pending: tableMetricPending,
    latest: 'tıp ing ücretli, başarı sırası da kaç',
    decision: 'split',
    expectedMetric: 'base_score',
  },
  {
    name: 'split program plus campus',
    pending: internshipPending,
    latest: 'hemşirelik, ayrıca kampüs nerde',
    decision: 'split',
    expectedMetric: 'internship_duration',
  },
  {
    name: 'split associate programs plus fees typo',
    pending: programListPending,
    latest: 'on lisanslar ve ucretleri',
    decision: 'split',
    expectedMetric: 'program_list',
  },
  {
    name: 'ignore fresh working-hours question',
    pending: programListPending,
    latest: 'çalışma saatleri nedir?',
    decision: 'ignore',
  },
  {
    name: 'ignore off-topic weather question',
    pending: programListPending,
    latest: 'bugün hava nasıl',
    decision: 'ignore',
  },
  {
    name: 'ignore new transport question',
    pending: tableMetricPending,
    latest: 'kampüse nasıl gidilir',
    decision: 'ignore',
  },
  {
    name: 'ignore new sensitive payment question',
    pending: programListPending,
    latest: 'kredi kartımı yazsam ödeme alır mısın',
    decision: 'ignore',
  },
  {
    name: 'ignore new contact question',
    pending: programListPending,
    latest: 'telefon numarası var mı',
    decision: 'ignore',
  },
  {
    name: 'clarify ambiguous comparison answer',
    pending: tableMetricPending,
    latest: 'hangisi daha iyi',
    decision: 'clarify',
    expectedAction: 'clarify',
  },
  {
    name: 'clarify vague correction',
    pending: internshipPending,
    latest: 'o değil ya',
    decision: 'clarify',
    expectedAction: 'clarify',
  },
  {
    name: 'clarify no usable answer',
    pending: programListPending,
    latest: 'bilmiyorum',
    decision: 'clarify',
    expectedAction: 'clarify',
  },
]

describe('resolveRagPendingClarificationFollowup', () => {
  it.each(scenarios)('handles student follow-up case: $name', (scenario) => {
    const result = resolveRagPendingClarificationFollowup({
      latestUserMessage: scenario.latest,
      pending: scenario.pending,
      llmStateDecision: scenario.decision,
      llmStateConfidence: 0.91,
      llmStateReason: `scenario:${scenario.name}`,
      llmClarificationQuestion: 'Biraz daha netleştirir misiniz?',
    })

    if (scenario.decision === 'ignore') {
      expect(result).toBeNull()
      return
    }

    expect(result).toBeTruthy()
    expect(result).toMatchObject({
      action: scenario.expectedAction ?? 'rewrite',
      pendingClarificationUsed: scenario.decision !== 'clarify',
      stateDecision: scenario.decision,
      stateReason: `scenario:${scenario.name}`,
    })

    if (scenario.expectedAction === 'clarify') {
      expect(result?.clarificationQuestion).toBe('Biraz daha netleştirir misiniz?')
      return
    }

    expect(result?.question).toContain(scenario.pending.originalQuestion)
    expect(result?.question).toContain(scenario.latest)
    expect(result?.requestedMetric).toBe(scenario.expectedMetric)
    expect(result?.retrievalIntent).toBe(scenario.expectedMetric)
  })

  it('uses pending state for question-like replies that still fill the requested scope', () => {
    const result = resolveRagPendingClarificationFollowup({
      latestUserMessage: 'tüm bölümler var mı acaba',
      pending: programListPending,
    })

    expect(result).toMatchObject({
      action: 'rewrite',
      stateDecision: 'use',
      pendingClarificationUsed: true,
      consumedPendingState: true,
      requestedMetric: 'program_list',
    })
    expect(result?.question).toContain('hangi bölümlere kayıt olabilirim')
    expect(result?.question).toContain('tüm bölümler var mı acaba')
  })

  it('promotes LLM use decisions to split when the reply also asks a new facet', () => {
    const result = resolveRagPendingClarificationFollowup({
      latestUserMessage: 'tümü, ücretleri de yaz',
      pending: programListPending,
      llmStateDecision: 'use',
      llmStateConfidence: 0.91,
      llmStateReason: 'scope answer',
    })

    expect(result).toMatchObject({
      action: 'rewrite',
      stateDecision: 'split',
      reason: 'pending_clarification_state_split',
      turnType: 'multi_question',
      pendingClarificationUsed: true,
      consumedPendingState: true,
    })
    expect(result?.question).toContain('Kullanıcının netleştirmesi ve ek sorusu')
  })

  it('asks one more clarification for no-progress replies even when LLM says use', () => {
    const result = resolveRagPendingClarificationFollowup({
      latestUserMessage: 'bilmiyorum',
      pending: programListPending,
      llmStateDecision: 'use',
      llmStateConfidence: 0.88,
      llmStateReason: 'mistakenly treated as scope answer',
      llmClarificationQuestion: 'Hangi kapsamı görmek istersiniz?',
    })

    expect(result).toMatchObject({
      action: 'clarify',
      stateDecision: 'clarify',
      pendingClarificationUsed: false,
      consumedPendingState: false,
      clarificationQuestion: 'Hangi kapsamı görmek istersiniz?',
    })
  })
})
