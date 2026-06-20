import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
    MODEL_CONFIGS,
    buildFrozenCase,
    buildSelectorRequest,
    parseResponsesApiOutput,
    parseSelectorOutput,
    rankUniqueSkillCandidates,
    scoreSelectorRuns,
    validateFocusedCases,
    type FocusedCaseDefinition,
    type SelectorRunResult,
} from './yiu-skill-selector-model-ab'

const fixture = JSON.parse(readFileSync(
    'scripts/knowledge/fixtures/yiu-skill-selector-focused-cases.json',
    'utf8'
)) as FocusedCaseDefinition[]

const candidate = {
    skill_id: 'skill-positive',
    title: 'Program fee',
    response_text: 'The program fee is 100 TL.',
    routing_description: 'Only covers the named program fee.',
    coverage_facets: ['fee'],
    trigger_text: 'Program kaç para?',
    similarity: 0.91,
}

describe('focused selector fixture', () => {
    it('contains eight File Search cases and two exact positive controls', () => {
        expect(() => validateFocusedCases(fixture)).not.toThrow()
        expect(fixture).toHaveLength(10)
        expect(fixture.filter((item) => item.expectedSkillId === null)).toHaveLength(8)
        expect(fixture.filter((item) => item.expectedSkillId !== null).map((item) => item.expectedSkillId)).toEqual([
            '720c2468-54a2-4d83-9491-570fd1ba6c5c',
            'e9a21cf5-4dea-4943-a3af-8deca5bbd120',
        ])
    })
})

describe('buildFrozenCase', () => {
    it('rejects duplicate Skill ids instead of silently freezing embedding-row duplicates', () => {
        const definition: FocusedCaseDefinition = {
            caseId: 'duplicate-case',
            latestUserMessage: 'Program kaç para?',
            standaloneQuery: 'Program ücreti nedir?',
            subject: 'Program',
            facet: 'ücret',
            candidateQueries: ['Program ücreti nedir?'],
            expectedSkillId: null,
            expectedSkillTitle: null,
        }

        expect(() => buildFrozenCase(definition, [candidate, { ...candidate }]))
            .toThrow(/duplicate skill/i)
    })

    it('requires the labeled Skill to be present in positive-control candidates', () => {
        const definition: FocusedCaseDefinition = {
            caseId: 'missing-positive',
            latestUserMessage: 'Program kaç para?',
            standaloneQuery: 'Program ücreti nedir?',
            subject: 'Program',
            facet: 'ücret',
            candidateQueries: ['Program ücreti nedir?'],
            expectedSkillId: 'expected-skill',
            expectedSkillTitle: 'Expected Skill',
        }

        expect(() => buildFrozenCase(definition, [candidate])).toThrow(/expected skill/i)
    })

    it('freezes the exact normalized selector payload', () => {
        const definition: FocusedCaseDefinition = {
            caseId: 'positive-case',
            latestUserMessage: '  Program   kaç para?  ',
            standaloneQuery: 'Program ücreti nedir?',
            subject: 'Program',
            facet: 'ücret',
            candidateQueries: ['Program ücreti nedir?'],
            expectedSkillId: 'skill-positive',
            expectedSkillTitle: 'Program fee',
        }

        const frozen = buildFrozenCase(definition, [candidate])

        expect(frozen.selectorInput).toMatchObject({
            latest_user_message: 'Program kaç para?',
            standalone_query: 'Program ücreti nedir?',
            candidates: [{
                skill_id: 'skill-positive',
                response_summary: 'The program fee is 100 TL.',
            }],
        })
    })
})

describe('rankUniqueSkillCandidates', () => {
    it('uses each Skill best embedding before applying the candidate limit', () => {
        const rows = [
            { ...candidate, skill_id: 'skill-a', trigger_text: 'best a', embedding: [1, 0] },
            { ...candidate, skill_id: 'skill-a', trigger_text: 'second a', embedding: [0.99, 0.01] },
            { ...candidate, skill_id: 'skill-b', trigger_text: 'best b', embedding: [0.9, 0.1] },
            { ...candidate, skill_id: 'skill-c', trigger_text: 'best c', embedding: [0, 1] },
        ]

        const ranked = rankUniqueSkillCandidates([1, 0], rows, 0.5, 2)

        expect(ranked.map((item) => item.skill_id)).toEqual(['skill-a', 'skill-b'])
        expect(ranked.map((item) => item.trigger_text)).toEqual(['best a', 'best b'])
    })
})

describe('selector model request contract', () => {
    const frozen = buildFrozenCase({
        caseId: 'request-case',
        latestUserMessage: 'Program kaç para?',
        standaloneQuery: 'Program ücreti nedir?',
        subject: 'Program',
        facet: 'ücret',
        candidateQueries: ['Program ücreti nedir?'],
        expectedSkillId: 'skill-positive',
        expectedSkillTitle: 'Program fee',
    }, [candidate])

    it('keeps prompt, payload, and schema identical across model configurations', () => {
        const requests = MODEL_CONFIGS.map((config) => buildSelectorRequest(frozen, config))
        const invariantParts = requests.map(({ model: _model, reasoning: _reasoning, ...rest }) => rest)

        expect(invariantParts[1]).toEqual(invariantParts[0])
        expect(invariantParts[2]).toEqual(invariantParts[0])
        expect(requests.map((request) => request.model)).toEqual([
            'gpt-4.1-mini',
            'gpt-5.5',
            'gpt-5.5',
        ])
        expect(requests.map((request) => request.reasoning?.effort ?? null)).toEqual([
            null,
            'none',
            'low',
        ])
    })

    it('parses the strict selector output fields', () => {
        expect(parseSelectorOutput(JSON.stringify({
            skill_id: null,
            coverage: 'none',
            confidence: 0.97,
            reason: 'No candidate directly answers the requested scope.',
        }))).toEqual({
            skillId: null,
            coverage: 'none',
            confidence: 0.97,
            reason: 'No candidate directly answers the requested scope.',
        })
    })

    it('extracts Structured Output text and usage from a raw Responses API payload', () => {
        expect(parseResponsesApiOutput({
            output: [{
                type: 'message',
                content: [{
                    type: 'output_text',
                    text: '{"skill_id":null,"coverage":"none","confidence":1,"reason":"No match."}',
                }],
            }],
            usage: {
                input_tokens: 120,
                output_tokens: 20,
                total_tokens: 140,
            },
        })).toEqual({
            outputText: '{"skill_id":null,"coverage":"none","confidence":1,"reason":"No match."}',
            inputTokens: 120,
            outputTokens: 20,
            totalTokens: 140,
        })
    })
})

describe('scoreSelectorRuns', () => {
    it('fails the precision gate after one false Skill even when every positive is correct', () => {
        const cases = [
            { ...fixture[0]!, caseId: 'negative', expectedSkillId: null },
            { ...fixture[6]!, caseId: 'positive', expectedSkillId: 'expected-positive' },
        ]
        const runs: SelectorRunResult[] = [
            {
                configId: 'gpt-4.1-mini',
                caseId: 'negative',
                repeat: 1,
                selectedSkillId: 'false-skill',
                coverage: 'direct',
                confidence: 0.9,
                reason: 'Wrong nearby match.',
                latencyMs: 100,
                inputTokens: 1000,
                outputTokens: 20,
                totalTokens: 1020,
                error: null,
            },
            {
                configId: 'gpt-4.1-mini',
                caseId: 'positive',
                repeat: 1,
                selectedSkillId: 'expected-positive',
                coverage: 'direct',
                confidence: 0.99,
                reason: 'Direct answer.',
                latencyMs: 200,
                inputTokens: 1000,
                outputTokens: 20,
                totalTokens: 1020,
                error: null,
            },
        ]

        expect(scoreSelectorRuns(cases, runs, 'gpt-4.1-mini')).toMatchObject({
            exactSelectionAccuracy: 0.5,
            falseSkillSelections: 1,
            positiveSkillRecall: 1,
            releaseGatePassed: false,
            p50LatencyMs: 150,
            p90LatencyMs: 190,
        })
    })
})
