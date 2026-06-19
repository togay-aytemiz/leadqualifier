import type { DemoSkillCandidateVerificationResult } from '@/lib/demo-chat/skill-candidate-verifier'
import type { DemoSkillQueryRewriteResult } from '@/lib/demo-chat/skill-query-rewriter'
import type { SkillMatch } from '@/types/database'

const MAX_TEXT_CHARS = 240
const MAX_MATCHES = 8

export type DemoChatSkillRoutingOutcome =
    | 'exact_skill'
    | 'verified_skill'
    | 'no_exact_match'
    | 'rewrite_unavailable'
    | 'rewrite_timeout'
    | 'rewrite_error'
    | 'no_candidate_queries'
    | 'no_semantic_candidates'
    | 'verification_no_skill'
    | 'verification_timeout'
    | 'verification_error'
    | 'rag_fallback'

export type DemoChatSkillRoutingDiagnostics = {
    outcome: DemoChatSkillRoutingOutcome
    exact?: {
        status: string
        matches: ReturnType<typeof summarizeSkillMatches>
    }
    rewrite?: {
        query: string
        subject: string | null
        facet: string | null
        needsClarification: boolean
        usedHistory: boolean
        decision: string
        reason: string
        model: string
        usage?: DemoSkillQueryRewriteResult['usage']
    }
    candidateQueries?: string[]
    semanticCandidateGroups?: Array<{
        query: string
        matches: ReturnType<typeof summarizeSkillMatches>
    }>
    mergedCandidates?: ReturnType<typeof summarizeSkillMatches>
    verification?: {
        decision: string
        skillId: string | null
        title: string | null
        confidence: number
        coverage: string
        reason: string
        model: string
        usage?: DemoSkillCandidateVerificationResult['usage']
    }
    error?: string
}

function normalizeText(value: string | null | undefined, maxChars = MAX_TEXT_CHARS) {
    return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxChars).trim()
}

function summarizeSkillMatch(match: SkillMatch) {
    return {
        skillId: match.skill_id,
        title: normalizeText(match.title),
        trigger: normalizeText(match.trigger_text),
        routingDescription: normalizeText(match.routing_description),
        coverageFacets: (match.coverage_facets ?? [])
            .map((facet) => normalizeText(facet, 64))
            .filter(Boolean)
            .slice(0, 8),
        similarity: match.similarity,
    }
}

export function summarizeSkillMatches(matches: SkillMatch[]) {
    return matches.slice(0, MAX_MATCHES).map(summarizeSkillMatch)
}

export function summarizeSkillRewrite(
    rewrite: DemoSkillQueryRewriteResult | null | undefined
): DemoChatSkillRoutingDiagnostics['rewrite'] | undefined {
    if (!rewrite) return undefined

    return {
        query: normalizeText(rewrite.query, 360),
        subject: normalizeText(rewrite.subject) || null,
        facet: normalizeText(rewrite.facet) || null,
        needsClarification: rewrite.needsClarification,
        usedHistory: rewrite.usedHistory,
        decision: rewrite.decision,
        reason: normalizeText(rewrite.reason),
        model: rewrite.model,
        usage: rewrite.usage,
    }
}

export function summarizeSkillVerification(
    verification: DemoSkillCandidateVerificationResult | null | undefined
): DemoChatSkillRoutingDiagnostics['verification'] | undefined {
    if (!verification) return undefined

    return {
        decision: verification.decision,
        skillId: verification.match?.skill_id ?? null,
        title: normalizeText(verification.match?.title) || null,
        confidence: verification.confidence,
        coverage: verification.coverage,
        reason: normalizeText(verification.reason),
        model: verification.model,
        usage: verification.usage,
    }
}

export function appendSkillRoutingOutcome(
    diagnostics: DemoChatSkillRoutingDiagnostics | null | undefined,
    outcome: DemoChatSkillRoutingOutcome
) {
    return diagnostics ? { ...diagnostics, outcome } : { outcome }
}
