import type { MvpResponseLanguage } from '@/lib/ai/language'

type RagAnswerRepairChunk = {
    content: string
    source_url?: string | null
    sourceUrl?: string | null
}

const URL_PATTERN = /https?:\/\/\S+/gi

const LINK_ONLY_FILLER_PATTERNS = [
    /\bdaha fazla bilgi için\b/gi,
    /\bdetaylı bilgi için\b/gi,
    /\bburaya göz atabilirsin\b/gi,
    /\bburaya göz atabilirsiniz\b/gi,
    /\başağıdaki linkten ulaşabilirsin\b/gi,
    /\bşu linkten ulaşabilirsin\b/gi,
    /\bfor more information\b/gi,
    /\byou can check\b/gi
]

function normalizeSearch(value: string) {
    return value
        .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => ({
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
            Ç: 'c'
        }[char] ?? char))
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
}

function isLikelyLinkOnlyResponse(response: string) {
    let withoutUrls = response.replace(URL_PATTERN, ' ')
    for (const pattern of LINK_ONLY_FILLER_PATTERNS) {
        withoutUrls = withoutUrls.replace(pattern, ' ')
    }
    const remainder = withoutUrls
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    return remainder.length < 24
}

function stripGenericAssistantContinuation(value: string) {
    return value
        .replace(/\bBaşka bir konuda yardımcı olabilir miyim\??/gi, ' ')
        .replace(/\bDaha fazla bilgi istersen(?:iz)?,?\s+[^.!?]*[.!?]?/gi, ' ')
        .replace(/\bHerhangi başka bir sorunuz olursa buradayım[.!?]?/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function requestedArticleNumber(userMessage: string) {
    const normalized = normalizeSearch(userMessage)
    if (/\b(kapsam|kapsami|kapsiyor|kapsar|hangi birim)/i.test(normalized)) return 2
    if (/\b(amac|amaci|neyi duzenler|ne amaclar)/i.test(normalized)) return 1
    return null
}

function cleanArticleText(value: string) {
    return value
        .replace(/^[-–—:\s]+/, '')
        .replace(/^\(\d+\)\s*/, '')
        .replace(/\s+\b(?:Amaç|Kapsam|Dayanak|Tanımlar|Tanımlar ve Kısaltmalar)\s*$/i, '')
        .replace(/\s+([,.;!?])/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
}

function trimToAnswerSizedText(value: string) {
    const cleaned = cleanArticleText(value)
    if (cleaned.length <= 520) return cleaned

    const sentenceMatch = cleaned.slice(0, 520).match(/^[\s\S]*?[.!?](?=\s|$)/)
    if (sentenceMatch?.[0] && sentenceMatch[0].length >= 80) {
        return sentenceMatch[0].trim()
    }

    return `${cleaned.slice(0, 500).trim()}...`
}

function extractArticleText(content: string, articleNumber: number) {
    const normalized = content.replace(/\s+/g, ' ').trim()
    const articlePattern = new RegExp(
        `(?:Amaç|Kapsam)?\\s*(?:Madde|MADDE)\\s*${articleNumber}\\s*[-–—]?\\s*(?:\\(\\d+\\)\\s*)?`,
        'i'
    )
    const match = articlePattern.exec(normalized)
    if (!match || typeof match.index !== 'number') return null

    const start = match.index + match[0].length
    const nextArticlePattern = new RegExp(`\\s+(?:Madde|MADDE)\\s*${articleNumber + 1}\\b`, 'i')
    const remaining = normalized.slice(start)
    const nextArticleMatch = nextArticlePattern.exec(remaining)
    const raw = nextArticleMatch ? remaining.slice(0, nextArticleMatch.index) : remaining
    const trimmed = trimToAnswerSizedText(raw)

    return trimmed.length >= 40 ? trimmed : null
}

function includesAny(normalized: string, terms: string[]) {
    return terms.some((term) => normalized.includes(term))
}

function isArticleAnswerMissingImportantTerms(response: string, articleText: string, articleNumber: number) {
    const normalizedResponse = normalizeSearch(stripGenericAssistantContinuation(response))
    const normalizedArticle = normalizeSearch(articleText)

    if (articleNumber === 2) {
        const scopeSpecificTerms = ['bina', 'eklenti', 'isveren', 'stajyer', 'ogrenci statusunde calisan']
        return scopeSpecificTerms.some((term) => normalizedArticle.includes(term) && !normalizedResponse.includes(term))
    }

    if (articleNumber === 1) {
        const purposeSpecificTerms = ['bilimsel arastirma', 'etik', 'yetki', 'sorumluluk']
        return purposeSpecificTerms.some((term) => normalizedArticle.includes(term) && !normalizedResponse.includes(term))
    }

    return false
}

function isWeakArticleAnswer(response: string, articleText: string, articleNumber: number) {
    if (isLikelyLinkOnlyResponse(response)) return true
    if (isArticleAnswerMissingImportantTerms(response, articleText, articleNumber)) return true

    const normalizedResponse = normalizeSearch(stripGenericAssistantContinuation(response))
    const normalizedArticle = normalizeSearch(articleText)
    const articleSignals = articleNumber === 1
        ? ['amac', 'duzenler', 'etik', 'gorev', 'yetki']
        : ['kapsam', 'kapsar', 'birim', 'bina', 'calisan']

    return normalizedResponse.length < Math.min(180, normalizedArticle.length * 0.55)
        && includesAny(normalizedArticle, articleSignals)
}

export function repairLinkOnlyRagAnswer(input: {
    response: string
    userMessage: string
    responseLanguage: MvpResponseLanguage
    chunks: RagAnswerRepairChunk[]
}) {
    const response = input.response.trim()
    if (!response) return response

    const articleNumber = requestedArticleNumber(input.userMessage)
    if (!articleNumber) return response

    for (const chunk of input.chunks) {
        const articleText = extractArticleText(chunk.content, articleNumber)
        if (!articleText) continue
        if (!isWeakArticleAnswer(response, articleText, articleNumber)) return response

        if (input.responseLanguage === 'en') {
            return articleNumber === 1
                ? `The purpose of this regulation is: ${articleText}`
                : `The scope of this regulation is: ${articleText}`
        }

        return articleNumber === 1
            ? `Bu yönergenin amacı: ${articleText}`
            : `Bu yönergenin kapsamı: ${articleText}`
    }

    return response
}
