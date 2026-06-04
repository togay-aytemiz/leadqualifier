import type {
  RagEvalCase,
  RagEvaluationResult,
  RagProviderResult,
  RagProviderSummary,
} from './types'

export function normalizeForEval(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKC')
    .replace(
      /[ıİğĞüÜşŞöÖçÇ]/g,
      (char) =>
        ({
          ı: 'i',
          İ: 'i',
          ğ: 'g',
          Ğ: 'g',
          ü: 'u',
          Ü: 'u',
          ş: 's',
          Ş: 's',
          ö: 'o',
          Ö: 'o',
          ç: 'c',
          Ç: 'c',
        })[char] ?? char
    )
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeToken(value: string) {
  return normalizeForEval(value).replace(/[^a-z0-9]+/g, '')
}

function phraseTokens(value: string) {
  return normalizeForEval(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2)
}

function containsDescriptivePhraseTerms(haystack: string, needle: string) {
  const needleTokens = phraseTokens(needle)
  if (needleTokens.length < 3) return false
  const haystackTokens = phraseTokens(haystack)
  return needleTokens.every((needleToken) =>
    haystackTokens.some(
      (haystackToken) =>
        haystackToken === needleToken ||
        (Math.min(haystackToken.length, needleToken.length) >= 3 &&
          (haystackToken.startsWith(needleToken) || needleToken.startsWith(haystackToken)))
    )
  )
}

function containsTerm(haystack: string, needle: string) {
  const normalizedHaystack = normalizeForEval(haystack)
  const normalizedNeedle = normalizeForEval(needle)
  if (normalizedHaystack.includes(normalizedNeedle)) return true
  const normalizedNeedleToken = normalizeToken(needle)
  if (!normalizedNeedleToken) return false
  return (
    normalizeToken(haystack).includes(normalizedNeedleToken) ||
    containsDescriptivePhraseTerms(haystack, needle)
  )
}

function citationText(result: RagProviderResult) {
  return result.citations
    .map((citation) =>
      [citation.providerSourceId, citation.title, citation.url, citation.quote]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n')
}

const REFUSAL_PATTERNS = [
  /net(?: bir)? bilgi yok/,
  /net(?: bir)? bilgi bulunmamaktadir/,
  /net(?: bir)? bilgi bulunamadi/,
  /bilgi bulunamadi/,
  /bilgi bulunmamaktadir/,
  /dosyalarda.*bilgi bulunmamaktadir/,
  /dosyalarda.*yer almamaktadir/,
  /dosyalarda.*belirtilmemistir/,
  /belgelerde.*bilgi bulunmamaktadir/,
  /belgelerde.*yer almamaktadir/,
  /belgelerde.*belirtilmemistir/,
  /dokumanlarda.*bilgi bulunmamaktadir/,
  /dokumanlarda.*yer almamaktadir/,
  /dokumanlarda.*belirtilmemistir/,
  /acik(?: bir)? bilgi bulunmamaktadir/,
  /dogrudan(?: net)?(?: bir)? bilgi bulunmamaktadir/,
  /dogrudan.*belirtilmemistir/,
  /(?:kesin|garanti).{0,80}(?:ayrilamaz|ayiramayiz|verilemez|saglanamaz|taahhut edilemez)/,
  /(?:kontenjan|kabul|kayit).{0,80}(?:garanti edilemez|garantisi verilemez|taahhut edilemez)/,
  /no clear information/,
  /not enough information/,
  /not in the knowledge base/,
]

function answerLooksLikeRefusal(answer: string) {
  const normalizedAnswer = normalizeForEval(answer)
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(normalizedAnswer))
}

export function evaluateProviderResult(
  testCase: RagEvalCase,
  result: RagProviderResult
): RagEvaluationResult {
  const expectedAnswerTerms = testCase.expectedAnswerTerms ?? []
  const expectedAnyAnswerTermGroups = testCase.expectedAnyAnswerTermGroups ?? []
  const expectedSourceTerms = testCase.expectedSourceTerms ?? []
  const expectedAnySourceTermGroups = testCase.expectedAnySourceTermGroups ?? []
  const preferredSourceTerms = testCase.preferredSourceTerms ?? []
  const expectedAnyPreferredSourceTermGroups =
    testCase.expectedAnyPreferredSourceTermGroups ?? []
  const expectedFollowupTerms = testCase.expectedFollowupTerms ?? []
  const expectedAnyFollowupTermGroups = testCase.expectedAnyFollowupTermGroups ?? []
  const forbiddenTerms = testCase.mustNotContain ?? []
  const citations = citationText(result)
  const followup = result.diagnostics?.followup?.trim() ?? ''

  const missingAnswerTerms = expectedAnswerTerms.filter(
    (term) => !containsTerm(result.answer, term)
  )
  const missingAnyAnswerTermGroups = expectedAnyAnswerTermGroups.filter(
    (group) => !group.some((term) => containsTerm(result.answer, term))
  )
  const missingSourceTerms = expectedSourceTerms.filter((term) => !containsTerm(citations, term))
  const missingAnySourceTermGroups = expectedAnySourceTermGroups.filter(
    (group) => !group.some((term) => containsTerm(citations, term))
  )
  const missingPreferredSourceTerms = preferredSourceTerms.filter(
    (term) => !containsTerm(citations, term)
  )
  const missingAnyPreferredSourceTermGroups = expectedAnyPreferredSourceTermGroups.filter(
    (group) => !group.some((term) => containsTerm(citations, term))
  )
  const missingFollowupTerms = expectedFollowupTerms.filter(
    (term) => !containsTerm(followup, term)
  )
  const missingAnyFollowupTermGroups = expectedAnyFollowupTermGroups.filter(
    (group) => !group.some((term) => containsTerm(followup, term))
  )
  const forbiddenTermsFound = forbiddenTerms.filter((term) => containsTerm(result.answer, term))
  const refused = result.refusal || answerLooksLikeRefusal(result.answer)

  const answerCorrect = testCase.unsupported
    ? refused
    : missingAnswerTerms.length === 0 && missingAnyAnswerTermGroups.length === 0
  const sourceCorrect =
    (expectedSourceTerms.length === 0 || missingSourceTerms.length === 0) &&
    missingAnySourceTermGroups.length === 0
  const preferredSourceCorrect =
    (preferredSourceTerms.length === 0 || missingPreferredSourceTerms.length === 0) &&
    missingAnyPreferredSourceTermGroups.length === 0
  const noHallucination = forbiddenTermsFound.length === 0
  const refusalCorrect = testCase.unsupported ? refused : true
  const followupPresent = Boolean(followup)
  const hasFollowupExpectations =
    expectedFollowupTerms.length > 0 || expectedAnyFollowupTermGroups.length > 0
  const followupTermsCorrect =
    missingFollowupTerms.length === 0 && missingAnyFollowupTermGroups.length === 0
  const followupCorrect = testCase.followupForbidden
    ? !followupPresent
    : testCase.followupRequired
      ? followupPresent && followupTermsCorrect
      : hasFollowupExpectations
        ? followupTermsCorrect
        : true

  return {
    caseId: testCase.id,
    provider: result.provider,
    passed: answerCorrect && sourceCorrect && noHallucination && refusalCorrect && followupCorrect,
    answerCorrect,
    sourceCorrect,
    preferredSourceCorrect,
    noHallucination,
    refusalCorrect,
    followupPresent,
    followupCorrect,
    missingAnswerTerms,
    missingAnyAnswerTermGroups,
    missingSourceTerms,
    missingAnySourceTermGroups,
    missingPreferredSourceTerms,
    missingAnyPreferredSourceTermGroups,
    missingFollowupTerms,
    missingAnyFollowupTermGroups,
    forbiddenTermsFound,
  }
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (sortedValues.length === 0) return 0
  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))] ?? 0
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function summarizeProviderResults(results: RagProviderResult[]): RagProviderSummary {
  const latencies = results
    .map((result) => result.timingsMs.total)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)
  const credits = results
    .map((result) => result.usage.estimatedCredits ?? 0)
    .filter((value) => Number.isFinite(value))
  const totalCredits = credits.reduce((sum, value) => sum + value, 0)

  return {
    count: results.length,
    latencyMs: {
      average: average(latencies),
      p50: percentile(latencies, 50),
      p75: percentile(latencies, 75),
      p95: percentile(latencies, 95),
      max: latencies.at(-1) ?? 0,
    },
    estimatedCredits: {
      total: totalCredits,
      average: results.length > 0 ? totalCredits / results.length : 0,
    },
  }
}
