import { isLikelyTurkishMessage, type MvpResponseLanguage } from '@/lib/ai/language'

const ENGLISH_SIGNAL_PATTERN = /\b(i|we|you|your|can|could|would|should|please|continue|clarify|available|options|share|details|information|service|appointment|cancel|contact|support|team|next|step|understood|meanwhile)\b/i
const COMBINING_MARKS = /[\u0300-\u036f]/g
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

const EXTERNAL_CONTACT_REDIRECT_PATTERNS = [
    /\bweb\s*site\b/i,
    /\bwebsite\b/i,
    /\bphone\b/i,
    /\bcall\b/i,
    /\breach us\b/i,
    /\bcontact details\b/i,
    /\btelefon\b/i,
    /\bara(?:yin|yın)?\b/i,
    /\bnumara(?:m[iı]z)?\b/i,
    /\bileti[sş]im bilgileri(?:nizi)?\b/i
]

const REFUSAL_PATTERNS = [
    /payla[sş](mak)? istemiyorum/i,
    /detay vermek istemiyorum/i,
    /sormay[iı]n/i,
    /istemiyorum/i,
    /i (?:do not|don't) want to share/i,
    /rather not share/i
]

const STOP_CONTACT_PATTERNS = [
    /bir daha (?:yazmay[iı]n|aramay[iı]n)/i,
    /ileti[sş]im kurmay[iı]n/i,
    /stop (?:messaging|contacting|calling)/i,
    /do not contact/i,
    /don't contact/i
]

const ENGAGEMENT_QUESTION_PATTERNS = [
    /ba[sş]ka bir konuda yard[iı]mc[iı] olabilir miyim/i,
    /ba[sş]ka bir (?:konu|hizmet)/i,
    /(?:ister misiniz|isterseniz)/i,
    /would you like/i,
    /anything else/i
]

const INTAKE_QUESTION_PATTERNS = [
    /payla[sş][a-zçğıöşü]*\s+m[iı]s[iı]n[iı]z/i,
    /belirt[a-zçğıöşü]*\s+m[iı]s[iı]n[iı]z/i,
    /could you share/i,
    /can you share/i,
    /could you provide/i,
    /can you provide/i,
    /b[uü]t[cç]e/i,
    /fiyat/i,
    /ucret/i,
    /ücret/i,
    /zamanlama/i,
    /tarih/i,
    /date/i,
    /aciliyet/i,
    /telefon/i,
    /phone/i,
    /email/i,
    /e-posta/i,
    /eposta/i,
    /adres/i,
    /location/i,
    /timeline/i,
    /urgency/i
]

const TR_TO_EN_KNOWN_SNIPPETS: Array<{ pattern: RegExp, replacement: string }> = [
    {
        pattern: /\bBuradan devam ederek uygun seçenekleri netleştirebiliriz\.?/gi,
        replacement: 'We can continue here and clarify the best available options.'
    },
    {
        pattern: /\bBuradan devam edebiliriz\.?/gi,
        replacement: 'We can continue here.'
    },
    {
        pattern: /\bİsterseniz bir sonraki adımı netleştirebiliriz\.?/gi,
        replacement: 'If you want, we can clarify the next step.'
    },
    {
        pattern: /\bBu konuda kesin bir detay paylaşamıyorum\.?/gi,
        replacement: 'I cannot share a precise detail yet.'
    },
    {
        pattern: /\bMevcut bilgilerle devam edebiliriz\.?/gi,
        replacement: 'We can continue with the current context.'
    }
]

const EN_TO_TR_KNOWN_SNIPPETS: Array<{ pattern: RegExp, replacement: string }> = [
    {
        pattern: /\bWe can continue here and clarify the best available options\.?/gi,
        replacement: 'Buradan devam ederek uygun seçenekleri netleştirebiliriz.'
    },
    {
        pattern: /\bWe can continue here\.?/gi,
        replacement: 'Buradan devam edebiliriz.'
    },
    {
        pattern: /\bIf you want,\s*we can clarify the next step\.?/gi,
        replacement: 'İsterseniz bir sonraki adımı netleştirebiliriz.'
    },
    {
        pattern: /\bI cannot share a precise detail yet\.?/gi,
        replacement: 'Bu konuda kesin bir detay paylaşamıyorum.'
    },
    {
        pattern: /\bWe can continue with the current context\.?/gi,
        replacement: 'Mevcut bilgilerle devam edebiliriz.'
    }
]

function splitIntoSentenceLikeChunks(message: string) {
    const chunks = message.match(/[^.!?]+[.!?]?/g)
    if (!chunks) return [message.trim()].filter(Boolean)
    return chunks.map((chunk) => chunk.trim()).filter(Boolean)
}

function hasQuestionIntent(value: string) {
    if (value.includes('?')) return true
    return /\b(ne|nas[iı]l|neden|hangi|kim|nereye|ne zaman|how|why|what|which|when|can|could|would|should)\b/i.test(value)
}

function normalizeForFieldMatch(value: string) {
    return value
        .trim()
        .replace(/\s+/g, ' ')
        .normalize('NFKD')
        .replace(COMBINING_MARKS, '')
        .toLowerCase()
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function tokenizeFieldLabel(field: string) {
    return normalizeForFieldMatch(field)
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !FIELD_TOKEN_STOPWORDS.has(token))
}

function messageMentionsField(field: string, message: string) {
    const normalizedMessage = normalizeForFieldMatch(message)
    if (!normalizedMessage) return false

    const tokens = tokenizeFieldLabel(field)
    if (tokens.length === 0) return false

    let tokenHits = 0
    let hasStrongTokenHit = false
    for (const token of tokens) {
        const matched = new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i').test(normalizedMessage)
            || normalizedMessage.includes(token)
        if (!matched) continue
        tokenHits += 1
        if (token.length >= 5) hasStrongTokenHit = true
    }
    if (tokens.length === 1) return tokenHits >= 1
    if (tokenHits >= Math.min(2, tokens.length)) return true
    return hasStrongTokenHit && tokenHits >= 1
}

function hasRefusalSignal(value: string) {
    return REFUSAL_PATTERNS.some((pattern) => pattern.test(value))
}

function hasStopContactSignal(value: string) {
    return STOP_CONTACT_PATTERNS.some((pattern) => pattern.test(value))
}

function isLikelyEngagementQuestionChunk(chunk: string) {
    if (!hasQuestionIntent(chunk)) return false
    return ENGAGEMENT_QUESTION_PATTERNS.some((pattern) => pattern.test(chunk))
}

function isLikelyIntakeQuestionChunk(chunk: string) {
    if (!hasQuestionIntent(chunk)) return false
    return INTAKE_QUESTION_PATTERNS.some((pattern) => pattern.test(chunk))
}

function detectChunkLanguageSignal(chunk: string): MvpResponseLanguage | 'unknown' {
    const text = chunk.trim()
    if (!text) return 'unknown'
    const hasTurkishSignal = isLikelyTurkishMessage(text)
    const hasEnglishSignal = ENGLISH_SIGNAL_PATTERN.test(text)
    if (hasTurkishSignal && !hasEnglishSignal) return 'tr'
    if (hasEnglishSignal && !hasTurkishSignal) return 'en'
    return 'unknown'
}

function normalizeKnownCrossLanguageSnippets(input: {
    response: string
    responseLanguage: MvpResponseLanguage
}) {
    const replacements = input.responseLanguage === 'tr'
        ? EN_TO_TR_KNOWN_SNIPPETS
        : TR_TO_EN_KNOWN_SNIPPETS
    let normalized = input.response
    for (const item of replacements) {
        normalized = normalized.replace(item.pattern, item.replacement)
    }
    return normalized
}

export function enforceResponseLanguageConsistency(input: {
    response: string
    responseLanguage: MvpResponseLanguage
}) {
    const response = input.response.trim()
    if (!response) return response

    const normalized = normalizeKnownCrossLanguageSnippets({
        response,
        responseLanguage: input.responseLanguage
    })
    const chunks = splitIntoSentenceLikeChunks(normalized)
    if (chunks.length <= 1) return normalized.replace(/\s+/g, ' ').trim()

    const labeled = chunks.map((chunk) => ({
        chunk,
        language: detectChunkLanguageSignal(chunk)
    }))
    const targetChunks = labeled
        .filter((item) => item.language === input.responseLanguage)
        .map((item) => item.chunk)
    const oppositeChunkCount = labeled.filter((item) => (
        item.language !== 'unknown' && item.language !== input.responseLanguage
    )).length
    if (targetChunks.length === 0 || oppositeChunkCount === 0) {
        return normalized.replace(/\s+/g, ' ').trim()
    }

    const unknownChunks = labeled
        .filter((item) => item.language === 'unknown')
        .map((item) => item.chunk)
    return [...targetChunks, ...unknownChunks].join(' ').replace(/\s+/g, ' ').trim()
}

export function sanitizeAssistantResponseSurfaceArtifacts(response: string) {
    const normalized = response.trim()
    if (!normalized) return normalized

    return normalized
        .replace(/(\d)\.\s+(?=\d{3}\b)/g, '$1.')
        .replace(/\s+([,.;!?])/g, '$1')
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')')
        .replace(/\s+/g, ' ')
        .trim()
}

function sanitizeExternalContactRedirectResponse(input: {
    response: string
    responseLanguage: MvpResponseLanguage
}) {
    const response = input.response.trim()
    if (!response) return response

    if (!EXTERNAL_CONTACT_REDIRECT_PATTERNS.some((pattern) => pattern.test(response))) {
        return response
    }

    const chunks = splitIntoSentenceLikeChunks(response)
    const filtered = chunks.filter((chunk) => !EXTERNAL_CONTACT_REDIRECT_PATTERNS.some((pattern) => pattern.test(chunk)))
    const replacement = input.responseLanguage === 'tr'
        ? 'Buradan devam ederek uygun seçenekleri netleştirebiliriz.'
        : 'We can continue here and clarify the best available options.'

    if (filtered.length === 0) return replacement
    const merged = filtered.join(' ').replace(/\s+/g, ' ').trim()
    if (merged.toLowerCase().includes(replacement.toLowerCase())) return merged

    const separator = /[.!?]$/.test(merged) ? ' ' : '. '
    return `${merged}${separator}${replacement}`.replace(/\s+/g, ' ').trim()
}

function stripRepeatedEngagementQuestions(input: {
    response: string
    recentAssistantMessages: string[]
}) {
    const response = input.response.trim()
    if (!response) return response

    const lastAssistantMessage = input.recentAssistantMessages
        .map((message) => message.trim())
        .filter(Boolean)
        .slice(-1)[0]
    if (!lastAssistantMessage) return response

    const previousHasEngagementQuestion = splitIntoSentenceLikeChunks(lastAssistantMessage)
        .some((chunk) => isLikelyEngagementQuestionChunk(chunk))
    if (!previousHasEngagementQuestion) return response

    const chunks = splitIntoSentenceLikeChunks(response)
    const filtered = chunks.filter((chunk) => !isLikelyEngagementQuestionChunk(chunk))
    if (filtered.length === 0 || filtered.length === chunks.length) return response
    return filtered.join(' ').replace(/\s+/g, ' ').trim()
}

function stripEngagementQuestionsAfterStopContact(input: {
    response: string
    userMessage: string
    responseLanguage: MvpResponseLanguage
}) {
    const response = input.response.trim()
    if (!response) return response
    if (!hasStopContactSignal(input.userMessage)) return response

    const chunks = splitIntoSentenceLikeChunks(response)
    const filtered = chunks.filter((chunk) => !isLikelyEngagementQuestionChunk(chunk))
    if (filtered.length === chunks.length) return response
    if (filtered.length === 0) {
        return input.responseLanguage === 'tr'
            ? 'Talebinizi aldım, iletişimi burada durduruyorum.'
            : 'Understood. I will stop contacting you here.'
    }
    return filtered.join(' ').replace(/\s+/g, ' ').trim()
}

function stripIntakeQuestionsAfterRefusal(input: {
    response: string
    userMessage: string
    responseLanguage: MvpResponseLanguage
}) {
    const response = input.response.trim()
    if (!response) return response
    if (!hasRefusalSignal(input.userMessage)) return response

    const chunks = splitIntoSentenceLikeChunks(response)
    const filtered = chunks.filter((chunk) => !isLikelyIntakeQuestionChunk(chunk))
    if (filtered.length === chunks.length) return response
    if (filtered.length === 0) {
        return input.responseLanguage === 'tr'
            ? 'Anladım. Mevcut bilgilerle devam edebiliriz.'
            : 'Understood. We can continue with the available context.'
    }
    return filtered.join(' ').replace(/\s+/g, ' ').trim()
}

function stripIntakeQuestionsWhenSuppressed(input: {
    response: string
    responseLanguage: MvpResponseLanguage
    suppressIntakeQuestions?: boolean
}) {
    const response = input.response.trim()
    if (!response) return response
    if (!input.suppressIntakeQuestions) return response

    const chunks = splitIntoSentenceLikeChunks(response)
    const filtered = chunks.filter((chunk) => !isLikelyIntakeQuestionChunk(chunk))
    if (filtered.length === chunks.length) return response
    if (filtered.length === 0) {
        return input.responseLanguage === 'tr'
            ? 'Anladım. Mevcut bilgilerle devam edebiliriz.'
            : 'Understood. We can continue with the available context.'
    }
    return filtered.join(' ').replace(/\s+/g, ' ').trim()
}

function stripBlockedFieldReaskQuestions(input: {
    response: string
    blockedReaskFields?: string[]
    responseLanguage: MvpResponseLanguage
}) {
    const response = input.response.trim()
    if (!response) return response

    const blockedFields = (input.blockedReaskFields ?? [])
        .map((field) => field.trim())
        .filter(Boolean)
    if (blockedFields.length === 0) return response

    const chunks = splitIntoSentenceLikeChunks(response)
    const filtered = chunks.filter((chunk) => {
        if (!hasQuestionIntent(chunk)) return true
        return !blockedFields.some((field) => messageMentionsField(field, chunk))
    })
    if (filtered.length === chunks.length) return response
    if (filtered.length === 0) {
        return input.responseLanguage === 'tr'
            ? 'Anladım. Bu bilgiler olmadan mevcut seçeneklerle devam edebiliriz.'
            : 'Understood. We can continue with the available options without those details.'
    }
    return filtered.join(' ').replace(/\s+/g, ' ').trim()
}

function moveAnswerChunkFirstForDirectQuestion(input: {
    response: string
    userMessage: string
}) {
    const response = input.response.trim()
    if (!response) return response
    if (!hasQuestionIntent(input.userMessage)) return response

    const chunks = splitIntoSentenceLikeChunks(response)
    if (chunks.length < 2) return response
    if (!hasQuestionIntent(chunks[0] ?? '')) return response

    const answerChunkIndex = chunks.findIndex((chunk, index) => (
        index > 0 && !hasQuestionIntent(chunk)
    ))
    if (answerChunkIndex < 0) return response

    const answerChunk = chunks[answerChunkIndex]
    if (!answerChunk) return response

    const reordered = [
        answerChunk,
        ...chunks.filter((_, index) => index !== answerChunkIndex)
    ]
    return reordered.join(' ').replace(/\s+/g, ' ').trim()
}

function enforceNoProgressLoopBreak(input: {
    response: string
    userMessage: string
    responseLanguage: MvpResponseLanguage
    noProgressLoopBreak?: boolean
}) {
    const response = input.response.trim()
    if (!response) return response
    if (!input.noProgressLoopBreak) return response
    if (hasQuestionIntent(input.userMessage)) return response

    const chunks = splitIntoSentenceLikeChunks(response)
    const nonQuestionChunks = chunks.filter((chunk) => !hasQuestionIntent(chunk))
    const candidateChunks = nonQuestionChunks.length > 0
        ? nonQuestionChunks
        : chunks.filter((chunk) => (
            !isLikelyEngagementQuestionChunk(chunk) && !isLikelyIntakeQuestionChunk(chunk)
        ))

    const fallbackSummary = input.responseLanguage === 'tr'
        ? 'Anladım. Mevcut bilgilerle ilerleyebiliriz.'
        : 'Understood. We can continue with the available context.'
    let summary = (candidateChunks[0] ?? '').trim() || fallbackSummary
    if (!/[.!?]$/.test(summary)) summary = `${summary}.`

    const hasSoftNextStep = /haz[iı]r oldu[gğ]unuzda|uygun oldu[gğ]unuzda|when (you are|you're) ready|whenever you are ready/i.test(response)
    if (hasSoftNextStep) {
        return summary.replace(/\s+/g, ' ').trim()
    }

    const softNextStep = input.responseLanguage === 'tr'
        ? 'Hazır olduğunuzda tek bir detay paylaşarak devam edebiliriz.'
        : 'When you are ready, we can continue with one detail at a time.'
    return `${summary} ${softNextStep}`.replace(/\s+/g, ' ').trim()
}

export function applyLiveAssistantResponseGuards(input: {
    response: string
    userMessage: string
    responseLanguage: MvpResponseLanguage
    recentAssistantMessages?: string[]
    blockedReaskFields?: string[]
    suppressIntakeQuestions?: boolean
    noProgressLoopBreak?: boolean
}) {
    const response = input.response.trim()
    if (!response) return response

    const recentAssistantMessages = input.recentAssistantMessages ?? []
    const surfaceNormalized = sanitizeAssistantResponseSurfaceArtifacts(response)
    const repeatedEngagementStripped = stripRepeatedEngagementQuestions({
        response: surfaceNormalized,
        recentAssistantMessages
    })
    const stopContactStripped = stripEngagementQuestionsAfterStopContact({
        response: repeatedEngagementStripped,
        userMessage: input.userMessage,
        responseLanguage: input.responseLanguage
    })
    const redirectSanitized = sanitizeExternalContactRedirectResponse({
        response: stopContactStripped,
        responseLanguage: input.responseLanguage
    })
    const blockedFieldReaskSanitized = stripBlockedFieldReaskQuestions({
        response: redirectSanitized,
        blockedReaskFields: input.blockedReaskFields,
        responseLanguage: input.responseLanguage
    })
    const refusalSanitized = stripIntakeQuestionsAfterRefusal({
        response: blockedFieldReaskSanitized,
        userMessage: input.userMessage,
        responseLanguage: input.responseLanguage
    })
    const intakeSuppressionSanitized = stripIntakeQuestionsWhenSuppressed({
        response: refusalSanitized,
        responseLanguage: input.responseLanguage,
        suppressIntakeQuestions: input.suppressIntakeQuestions
    })
    const answerFirst = moveAnswerChunkFirstForDirectQuestion({
        response: intakeSuppressionSanitized,
        userMessage: input.userMessage
    })
    const noProgressLoopBreakEnforced = enforceNoProgressLoopBreak({
        response: answerFirst,
        userMessage: input.userMessage,
        responseLanguage: input.responseLanguage,
        noProgressLoopBreak: input.noProgressLoopBreak
    })
    const languageConsistent = enforceResponseLanguageConsistency({
        response: noProgressLoopBreakEnforced,
        responseLanguage: input.responseLanguage
    })
    return languageConsistent.replace(/\s+/g, ' ').trim()
}
