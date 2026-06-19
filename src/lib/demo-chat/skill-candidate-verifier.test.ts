import { describe, expect, it, vi } from 'vitest'

import { verifyDemoSkillCandidates } from './skill-candidate-verifier'

const candidates = [
    {
        skill_id: 'skill-anatomy',
        title: 'Tıp anatomi laboratuvarı ve kadavra',
        response_text: 'Anatomi laboratuvarında kadavra diseksiyonu yapılır.',
        routing_description: 'Tıp Fakültesi anatomi laboratuvarı ve kadavra uygulaması sorularını kapsar.',
        coverage_facets: ['education_model', 'laboratory'],
        trigger_text: 'Kadavra var mı?',
        similarity: 0.88,
    },
    {
        skill_id: 'skill-anesthesia',
        title: 'Anestezi programı uygulama olanakları',
        response_text: 'Anestezi programının uygulama olanakları açıklanır.',
        routing_description: 'Anestezi programına özel laboratuvar ve uygulama olanakları sorularını kapsar; genel MYO sorularını kapsamaz.',
        coverage_facets: ['program_overview', 'laboratory'],
        trigger_text: 'Anestezi laboratuvarı var mı?',
        similarity: 0.84,
    },
]

describe('verifyDemoSkillCandidates', () => {
    it('returns the candidate selected for the same subject and facet', async () => {
        const createCompletion = vi.fn().mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({
                        skill_id: 'skill-anesthesia',
                        confidence: 0.96,
                        reason: 'The subject and laboratory availability facet match.',
                    }),
                },
            }],
        })

        const result = await verifyDemoSkillCandidates({
            latestUserMessage: 'Anestezi laboratuvarı var mı?',
            standaloneQuery: 'Anestezi programında laboratuvar var mı?',
            subject: 'Anestezi programı',
            facet: 'laboratuvar varlığı',
            candidates,
            createCompletion,
        })

        expect(result?.match?.skill_id).toBe('skill-anesthesia')
        expect(result?.decision).toBe('skill')
    })

    it('supports NO_SKILL instead of forcing an unrelated candidate', async () => {
        const createCompletion = vi.fn().mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({
                        skill_id: null,
                        confidence: 0.91,
                        reason: 'Neither candidate answers the requested subject and facet.',
                    }),
                },
            }],
        })

        const result = await verifyDemoSkillCandidates({
            latestUserMessage: 'Üniversitenin eksileri ne?',
            standaloneQuery: 'Yüksek İhtisas Üniversitesinin dezavantajları nelerdir?',
            subject: 'Yüksek İhtisas Üniversitesi',
            facet: 'dezavantajlar',
            candidates,
            createCompletion,
        })

        expect(result).toMatchObject({
            decision: 'no_skill',
            match: null,
        })
    })

    it('treats partial coverage as no skill even when a candidate id is returned', async () => {
        const createCompletion = vi.fn().mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({
                        skill_id: 'skill-anesthesia',
                        coverage: 'partial',
                        confidence: 0.88,
                        reason: 'The candidate is related to the program but does not answer the specific requested detail.',
                    }),
                },
            }],
        })

        const result = await verifyDemoSkillCandidates({
            latestUserMessage: 'Anestezi staj yerini üniversite mi ayarlıyor?',
            standaloneQuery: 'Anestezi programında staj yerini üniversite mi ayarlıyor?',
            subject: 'Anestezi programı',
            facet: 'staj yerini kimin ayarladığı',
            candidates,
            createCompletion,
        })

        expect(result).toMatchObject({
            decision: 'no_skill',
            match: null,
            coverage: 'partial',
        })
    })

    it('rejects ids that were not supplied as candidates', async () => {
        const createCompletion = vi.fn().mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({
                        skill_id: 'skill-invented',
                        confidence: 0.99,
                        reason: 'Invented id.',
                    }),
                },
            }],
        })

        const result = await verifyDemoSkillCandidates({
            latestUserMessage: 'Anestezi laboratuvarı var mı?',
            standaloneQuery: 'Anestezi programında laboratuvar var mı?',
            subject: 'Anestezi programı',
            facet: 'laboratuvar varlığı',
            candidates,
            createCompletion,
        })

        expect(result).toBeNull()
    })

    it('sends routing scope metadata to the verifier model without answering', async () => {
        const createCompletion = vi.fn().mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({
                        skill_id: 'skill-anesthesia',
                        coverage: 'direct',
                        confidence: 0.94,
                        reason: 'Scope metadata and response summary cover the requested facet.',
                    }),
                },
            }],
        })

        await verifyDemoSkillCandidates({
            latestUserMessage: 'Anestezi laboratuvarı var mı?',
            standaloneQuery: 'Anestezi programında laboratuvar var mı?',
            subject: 'Anestezi programı',
            facet: 'laboratuvar varlığı',
            candidates,
            createCompletion,
        })

        const request = createCompletion.mock.calls[0]?.[0] as {
            messages?: Array<{ role: string; content: string }>
        }
        const systemMessage = request.messages?.find((message) => message.role === 'system')?.content
        const userPayload = JSON.parse(
            request.messages?.find((message) => message.role === 'user')?.content ?? '{}'
        )

        expect(systemMessage).toContain('routing_description')
        expect(userPayload.candidates[1]).toMatchObject({
            routing_description: 'Anestezi programına özel laboratuvar ve uygulama olanakları sorularını kapsar; genel MYO sorularını kapsamaz.',
            coverage_facets: ['program_overview', 'laboratory'],
        })
    })
})
