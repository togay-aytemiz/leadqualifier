const COMBINING_MARKS = /[\u0300-\u036f]/g
const TOKEN_SPLIT_PATTERN = /[^a-z0-9]+/i
const MIN_STRONG_PREFIX_LENGTH = 4

const FIELD_TOKEN_STOPWORDS = new Set([
    've',
    'ile',
    'icin',
    'için',
    'bilgi',
    'detay',
    'alan',
    'field',
    'required',
    'zorunlu',
    'lütfen',
    'lutfen',
    'please',
    'the',
    'for',
    'of',
    'to',
    'your',
    'hangi',
    'nedir',
    'what',
    'which'
])

const FIELD_CONCEPT_GROUPS = [
    ['telefon', 'phone', 'numara', 'number', 'iletisim', 'contact', 'mobile', 'gsm']
]

function normalizeForFieldMatch(value: string) {
    return value
        .trim()
        .replace(/\s+/g, ' ')
        .normalize('NFKD')
        .replace(COMBINING_MARKS, '')
        .replace(/ı/g, 'i')
        .toLowerCase()
}

function tokenizeNormalizedValue(value: string) {
    return normalizeForFieldMatch(value)
        .split(TOKEN_SPLIT_PATTERN)
        .map((token) => token.trim())
        .filter(Boolean)
}

function tokenizeFieldLabel(field: string) {
    return tokenizeNormalizedValue(field)
        .filter((token) => token.length >= 3 && !FIELD_TOKEN_STOPWORDS.has(token))
}

function sharedPrefixLength(left: string, right: string) {
    const length = Math.min(left.length, right.length)
    let index = 0
    while (index < length && left[index] === right[index]) {
        index += 1
    }
    return index
}

function tokensLooselyMatch(left: string, right: string) {
    if (!left || !right) return false
    if (left === right) return true
    if (left.length >= MIN_STRONG_PREFIX_LENGTH && right.startsWith(left)) return true
    if (right.length >= MIN_STRONG_PREFIX_LENGTH && left.startsWith(right)) return true
    return sharedPrefixLength(left, right) >= MIN_STRONG_PREFIX_LENGTH
}

function resolveConceptMatches(tokens: string[]) {
    return FIELD_CONCEPT_GROUPS.filter((group) => (
        group.some((alias) => tokens.some((token) => tokensLooselyMatch(token, alias)))
    ))
}

export function messageMentionsField(field: string, message: string) {
    const fieldTokens = tokenizeFieldLabel(field)
    if (fieldTokens.length === 0) return false

    const messageWords = tokenizeNormalizedValue(message)
    if (messageWords.length === 0) return false

    let tokenHits = 0
    let hasStrongTokenHit = false
    for (const token of fieldTokens) {
        const matched = messageWords.some((word) => tokensLooselyMatch(token, word))
        if (!matched) continue
        tokenHits += 1
        if (token.length >= MIN_STRONG_PREFIX_LENGTH) hasStrongTokenHit = true
    }

    if (fieldTokens.length === 1) {
        if (tokenHits >= 1) return true
    } else {
        if (tokenHits >= Math.min(2, fieldTokens.length)) return true
        if (hasStrongTokenHit && tokenHits >= 1) return true
    }

    const conceptMatches = resolveConceptMatches(fieldTokens)
    if (conceptMatches.length === 0) return false

    return conceptMatches.some((group) => (
        group.some((alias) => messageWords.some((word) => tokensLooselyMatch(alias, word)))
    ))
}
