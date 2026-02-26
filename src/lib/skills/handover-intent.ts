import type { SkillMatch } from '@/types/database'

const MIN_OVERLAP_RATIO = 0.2
const HIGH_SIMILARITY_BYPASS = 0.9

const STOP_WORDS = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'beni',
    'bir',
    'bu',
    'can',
    'could',
    'da',
    'de',
    'for',
    'hakkinda',
    'hakkında',
    'i',
    'ile',
    'in',
    'is',
    'istiyorum',
    'it',
    'konuda',
    'lütfen',
    'mi',
    'mı',
    'mu',
    'mü',
    'my',
    'need',
    'of',
    'on',
    'or',
    'please',
    'sizin',
    'that',
    'the',
    'this',
    'to',
    've',
    'we',
    'with',
    'want',
    'you',
    'your'
])

const EXPLICIT_HANDOVER_INTENT_PATTERNS: RegExp[] = [
    /\b(insan|operator|operat[oö]r|temsilci|yetkili|agent|human)\b/i,
    /\bm[uü][sş]teri\s+temsilci/i,
    /\b(ba[gğ]la|akt(ar|ar[ıi]n)|escalat|escalate|handover)\b/i,
    /\b([sş]ikayet|complaint|complain)\b/i,
    /\b(memnun\s+de[ğg]il|not\s+happy|bad\s+experience|olumsuz|rezalet|berbat)\b/i,
    /\b(sorun|problem|issue|error|hata)\b/i,
    /\b(acil|urgent|asap|immediately)\b/i,
    /\b(iade|iptal|refund|cancel)\b/i,
    /\b(gizlilik|kvkk|privacy|consent|verilerimi\s+sil|delete\s+my\s+data)\b/i
]

function normalizeTokenSource(value: string) {
    return value
        .toLocaleLowerCase('tr')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function toTokenSet(value: string) {
    const normalized = normalizeTokenSource(value)
    if (!normalized) return new Set<string>()

    const tokens = normalized
        .split(' ')
        .filter((token) => token.length >= 3)
        .filter((token) => !STOP_WORDS.has(token))

    return new Set(tokens)
}

function computeJaccardOverlap(left: string, right: string) {
    const leftTokens = toTokenSet(left)
    const rightTokens = toTokenSet(right)

    if (leftTokens.size === 0 || rightTokens.size === 0) return 0

    let intersectionCount = 0
    for (const token of leftTokens) {
        if (rightTokens.has(token)) {
            intersectionCount += 1
        }
    }

    if (intersectionCount === 0) return 0

    const unionCount = new Set([...leftTokens, ...rightTokens]).size
    return unionCount > 0 ? intersectionCount / unionCount : 0
}

function hasExplicitHandoverIntent(message: string) {
    return EXPLICIT_HANDOVER_INTENT_PATTERNS.some((pattern) => pattern.test(message))
}

export function shouldUseSkillMatchForMessage(options: {
    userMessage: string
    requiresHumanHandover: boolean
    match: SkillMatch
}) {
    if (!options.requiresHumanHandover) return true

    if ((options.match.similarity ?? 0) >= HIGH_SIMILARITY_BYPASS) return true

    if (hasExplicitHandoverIntent(options.userMessage)) return true

    const overlapText = `${options.match.title ?? ''} ${options.match.trigger_text ?? ''}`.trim()
    const overlap = computeJaccardOverlap(options.userMessage, overlapText)
    return overlap >= MIN_OVERLAP_RATIO
}
