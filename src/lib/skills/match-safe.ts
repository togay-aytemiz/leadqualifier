import type { SkillMatch } from '@/types/database'

const STRONG_SEMANTIC_SIMILARITY = 0.84
const DISTINCT_SEMANTIC_SIMILARITY = 0.78
const MIN_DISTINCT_MARGIN = 0.08
const MIN_FUZZY_TOKEN_LENGTH = 5
const MIN_PREFIX_TOKEN_LENGTH = 7

const GENERIC_ANCHOR_ROOTS = [
    'a',
    'about',
    'al',
    'alabilir',
    'almak',
    'an',
    'and',
    'bana',
    'ben',
    'beni',
    'bilgi',
    'bir',
    'biz',
    'bizim',
    'bu',
    'can',
    'could',
    'for',
    'hakkinda',
    'hizmet',
    'i',
    'icin',
    'ilgili',
    'in',
    'info',
    'information',
    'isterim',
    'istiyorum',
    'it',
    'konu',
    'lutfen',
    'me',
    'mi',
    'miyim',
    'misiniz',
    'mu',
    'my',
    'nasil',
    'ne',
    'nedir',
    'need',
    'of',
    'on',
    'our',
    'please',
    'sana',
    'service',
    'servis',
    'size',
    'siz',
    'sizi',
    'sizin',
    'su',
    'the',
    'this',
    'to',
    'var',
    've',
    'veya',
    'want',
    'with',
    'would',
    'yok',
    'you',
    'your'
] as const

export interface SkillMatchIntentGateOptions {
    message: string
    threshold: number
    strongSimilarity?: number
    distinctSimilarity?: number
    minDistinctMargin?: number
}

function normalizeForIntentGate(value: string) {
    return value
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i')
        .replace(/İ/g, 'i')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function tokenizeForIntentGate(value: string) {
    const normalized = normalizeForIntentGate(value)
    if (!normalized) return []

    return normalized
        .split(' ')
        .map((token) => token.trim())
        .filter(Boolean)
}

function isGenericAnchorToken(token: string) {
    if (token.length < 3) return true

    return GENERIC_ANCHOR_ROOTS.some((root) => (
        token === root
        || (root.length >= 4 && token.startsWith(root))
    ))
}

function meaningfulTokens(value: string) {
    return tokenizeForIntentGate(value).filter((token) => !isGenericAnchorToken(token))
}

function readSimilarity(match: SkillMatch): number | null {
    return typeof match.similarity === 'number' && Number.isFinite(match.similarity)
        ? match.similarity
        : null
}

function editDistance(left: string, right: string) {
    const leftChars = [...left]
    const rightChars = [...right]
    const previous = Array.from({ length: rightChars.length + 1 }, (_, index) => index)

    for (let leftIndex = 0; leftIndex < leftChars.length; leftIndex += 1) {
        let current = leftIndex + 1

        for (let rightIndex = 0; rightIndex < rightChars.length; rightIndex += 1) {
            const insert = (previous[rightIndex + 1] ?? Number.POSITIVE_INFINITY) + 1
            const remove = current + 1
            const replace = (previous[rightIndex] ?? Number.POSITIVE_INFINITY)
                + (leftChars[leftIndex] === rightChars[rightIndex] ? 0 : 1)
            previous[rightIndex] = current
            current = Math.min(insert, remove, replace)
        }

        previous[rightChars.length] = current
    }

    return previous[rightChars.length] ?? 0
}

function tokensLooselyMatch(left: string, right: string) {
    if (left === right) return true

    const shortest = left.length <= right.length ? left : right
    const longest = left.length > right.length ? left : right

    if (
        shortest.length >= MIN_PREFIX_TOKEN_LENGTH
        && longest.startsWith(shortest.slice(0, MIN_PREFIX_TOKEN_LENGTH - 1))
        && shortest.length / longest.length >= 0.72
    ) {
        return true
    }

    if (shortest.length < MIN_FUZZY_TOKEN_LENGTH) return false

    const maxDistance = shortest.length >= 8 ? 2 : 1
    return editDistance(left, right) <= maxDistance
}

function hasMeaningfulAnchor(message: string, match: SkillMatch) {
    const normalizedMessage = normalizeForIntentGate(message)
    if (!normalizedMessage) return false

    const anchorTexts = [
        match.trigger_text,
        match.title
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

    for (const anchorText of anchorTexts) {
        const normalizedAnchor = normalizeForIntentGate(anchorText)
        if (!normalizedAnchor) continue

        if (
            normalizedAnchor.length >= 12
            && (
                normalizedMessage.includes(normalizedAnchor)
                || (normalizedMessage.length >= 12 && normalizedAnchor.includes(normalizedMessage))
            )
        ) {
            return true
        }

        const messageTokens = meaningfulTokens(normalizedMessage)
        const anchorTokens = meaningfulTokens(normalizedAnchor)
        if (messageTokens.length === 0 || anchorTokens.length === 0) continue

        if (anchorTokens.some((anchorToken) => (
            messageTokens.some((messageToken) => tokensLooselyMatch(messageToken, anchorToken))
        ))) {
            return true
        }
    }

    return false
}

function hasDistinctSemanticLead(match: SkillMatch, matches: SkillMatch[], options: Required<Pick<
    SkillMatchIntentGateOptions,
    'distinctSimilarity' | 'minDistinctMargin'
>>) {
    const similarity = readSimilarity(match)
    if (similarity === null || similarity < options.distinctSimilarity) return false

    const otherSimilarities = matches
        .filter((candidate) => candidate !== match)
        .map(readSimilarity)
        .filter((value): value is number => value !== null)

    if (otherSimilarities.length === 0) return false

    const nextBestSimilarity = Math.max(...otherSimilarities)
    return similarity - nextBestSimilarity >= options.minDistinctMargin
}

export function filterSkillMatchesByIntentGate(options: SkillMatchIntentGateOptions & {
    matches: SkillMatch[]
}) {
    const strongSimilarity = options.strongSimilarity ?? STRONG_SEMANTIC_SIMILARITY
    const distinctSimilarity = options.distinctSimilarity ?? DISTINCT_SEMANTIC_SIMILARITY
    const minDistinctMargin = options.minDistinctMargin ?? MIN_DISTINCT_MARGIN
    const eligibleMatches = options.matches.filter((match) => {
        const similarity = readSimilarity(match)
        return similarity === null || similarity >= options.threshold
    })

    return eligibleMatches.filter((match) => {
        const similarity = readSimilarity(match)
        if (similarity === null) return true
        if (similarity >= strongSimilarity) return true
        if (hasMeaningfulAnchor(options.message, match)) return true
        return hasDistinctSemanticLead(match, eligibleMatches, {
            distinctSimilarity,
            minDistinctMargin
        })
    })
}

export type SafeSkillMatchResult =
    | { status: 'matched', matches: SkillMatch[] }
    | { status: 'no_match', matches: SkillMatch[] }
    | { status: 'error', matches: SkillMatch[], error: unknown }

export async function matchSkillsWithStatus(options: {
    matcher: () => Promise<SkillMatch[]>
    context?: Record<string, unknown>
    intentGate?: SkillMatchIntentGateOptions
}): Promise<SafeSkillMatchResult> {
    try {
        const matches = await options.matcher()
        const safeMatches = Array.isArray(matches) ? matches : []
        const gatedMatches = options.intentGate
            ? filterSkillMatchesByIntentGate({
                ...options.intentGate,
                matches: safeMatches
            })
            : safeMatches

        return gatedMatches.length > 0
            ? { status: 'matched', matches: gatedMatches }
            : { status: 'no_match', matches: [] }
    } catch (error) {
        console.warn('Skill matching failed; continuing with KB/fallback path.', {
            ...options.context,
            error
        })
        return { status: 'error', matches: [], error }
    }
}

export async function matchSkillsSafely(options: {
    matcher: () => Promise<SkillMatch[]>
    context?: Record<string, unknown>
    intentGate?: SkillMatchIntentGateOptions
}) {
    const result = await matchSkillsWithStatus(options)
    return result.matches
}
