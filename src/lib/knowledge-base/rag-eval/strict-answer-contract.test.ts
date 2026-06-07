import { describe, expect, it } from 'vitest'

import { buildStrictAnswerContract, classifyStrictQuestionFacets } from './strict-answer-contract'
import { understandStrictQuestion } from './strict-question-understanding'

describe('strict answer contract', () => {
  it('classifies lab/facility questions separately from program existence', () => {
    expect(
      classifyStrictQuestionFacets(
        understandStrictQuestion('Tıbbi Laboratuvar programı için laboratuvar var mı?')
      )
    ).toContain('facility_resource')

    expect(
      classifyStrictQuestionFacets(understandStrictQuestion('Tıbbi Laboratuvar Teknikleri var mı?'))
    ).toContain('program_existence')
  })

  it('does not treat unrelated words containing lab as facility-resource questions', () => {
    expect(
      classifyStrictQuestionFacets(
        understandStrictQuestion('Üniversitenizde sevgili bulabilir miyim?')
      )
    ).not.toContain('facility_resource')
  })

  it('marks adjacent program evidence as a facet mismatch for facility availability', () => {
    const contract = buildStrictAnswerContract({
      question: 'Ebelik uygulama laboratuvarı var mı?',
      understanding: understandStrictQuestion('Ebelik uygulama laboratuvarı var mı?'),
      answer:
        'Evet, ebelik bölümü bulunmaktadır. Ücretli, burslu ve %50 indirimli kontenjanları vardır.',
      citations: [
        {
          providerSourceId: 'program-table',
          title: 'Program Kontenjanları',
          quote: 'Ebelik | Ücretli kontenjan 6 | Burslu kontenjan 4 | %50 indirimli kontenjan 19',
        },
      ],
    })

    expect(contract.requiredFacets).toContain('facility_resource')
    expect(contract.mismatchedFacets).toContain('facility_resource')
    expect(contract.satisfiedFacets).not.toContain('facility_resource')
  })
})
