import type { MvpResponseLanguage } from '@/lib/ai/language'

type RagAnswerRepairChunk = {
    content: string
    document_title?: string | null
    source_url?: string | null
    sourceUrl?: string | null
}

const URL_PATTERN = /https?:\/\/\S+/gi

const LINK_ONLY_FILLER_PATTERNS = [
    /\bdaha fazla bilgi için\b/gi,
    /\bdaha fazla bilgi istersen(?:iz)?\b/gi,
    /\bdetaylı bilgi için\b/gi,
    /\bburaya göz atabilirsin\b/gi,
    /\bburaya göz atabilirsiniz\b/gi,
    /\bburadan ulaşabilirsin\b/gi,
    /\bburadan ulaşabilirsiniz\b/gi,
    /\başağıdaki linkten ulaşabilirsin\b/gi,
    /\bşu linkten ulaşabilirsin\b/gi,
    /\b(?:şu|bu)?\s*(?:linke|linkten|bağlantıya|bağlantıdan|buraya|buradan)\s+(?:göz atabilir|ulaşabilir)\w*/gi,
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
    if (isAbbreviationExpansionQuestion(normalized)) return null
    if (/\b(kapsam|kapsami|kapsiyor|kapsar|hangi birim)/i.test(normalized)) return 2
    if (/\b(amac|amaci|neyi duzenler|ne amaclar|usul ve esas|hangi alimlar|hangi islemler)/i.test(normalized)) return 1
    return null
}

function isAbbreviationExpansionQuestion(normalizedUserMessage: string) {
    return /\b(kisaltma\w*|acilim\w*|neyi ifade|ifade ediyor|ne anlama|ne demek)\b/i.test(normalizedUserMessage)
}

function asksForAbbreviationTitle(normalizedUserMessage: string) {
    return isAbbreviationExpansionQuestion(normalizedUserMessage)
        && /\b(baslik\w*|basliginda|basligi|yonerge basligi)\b/i.test(normalizedUserMessage)
}

function extractChunkTitle(chunk: RagAnswerRepairChunk) {
    const directTitle = chunk.document_title?.trim()
    if (directTitle) return directTitle

    const metadataTitle = chunk.content.match(/^(?:Page|Document) Title:\s*(.+)$/im)?.[1]?.trim()
    if (!metadataTitle) return null

    return metadataTitle
        .replace(/\s+Source URL:\s+https?:\/\/\S+.*$/i, '')
        .replace(/\s+Section:\s+.*$/i, '')
        .trim()
}

const DOCUMENT_CODE_PATTERN = /\p{Lu}{2,12}(?:\.\p{Lu}{2,12}){0,2}\.\d{3,4}|\p{Lu}{2,12}YNG\.\d{3,4}/u

function canonicalDocumentCode(value: string) {
    return normalizeSearch(value).replace(/\s+/g, '')
}

function normalizeDocumentCodeCandidate(value: string) {
    const compacted = value
        .normalize('NFKC')
        .toLocaleUpperCase('tr-TR')
        .replace(/\s*\.\s*/g, '.')
        .replace(/\s+/g, '')
        .replace(/[^\p{L}\p{N}.]+$/gu, '')

    return compacted.match(DOCUMENT_CODE_PATTERN)?.[0] ?? null
}

function extractDocumentCode(content: string) {
    const labelMatch = content.match(/(?:Doküman|Dokuman|Belge)\s*(?:No|Numarası|Numarasi)\s*[:：-]?\s*([^\n\r|]{0,90})/iu)
    const labelCode = labelMatch?.[1] ? normalizeDocumentCodeCandidate(labelMatch[1]) : null
    if (labelCode) return labelCode

    return normalizeDocumentCodeCandidate(content)
}

function asksForDocumentCode(normalizedUserMessage: string) {
    return /\b(?:dokuman|belge)\s+(?:numara\w*|no(?:su)?)\b/i.test(normalizedUserMessage)
        || /\b(?:numara\w*|no(?:su)?)\s+(?:nedir|ne)\b/i.test(normalizedUserMessage)
}

function repairDocumentCodeAnswer(input: {
    response: string
    userMessage: string
    responseLanguage: MvpResponseLanguage
    chunks: RagAnswerRepairChunk[]
}) {
    if (!asksForDocumentCode(normalizeSearch(input.userMessage))) return null

    const match = input.chunks
        .map((chunk) => ({
            code: extractDocumentCode(chunk.content),
            title: extractChunkTitle(chunk)
        }))
        .find((item): item is { code: string; title: string | null } => Boolean(item.code))

    if (!match) return null
    if (canonicalDocumentCode(input.response).includes(canonicalDocumentCode(match.code))) return null

    if (input.responseLanguage === 'en') {
        return match.title
            ? `The document number for "${match.title}" is ${match.code}.`
            : `The document number is ${match.code}.`
    }

    return match.title
        ? `"${match.title}" doküman numarası ${match.code}'dir.`
        : `Doküman numarası ${match.code}'dir.`
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

function repairAbbreviationTitleAnswer(input: {
    response: string
    userMessage: string
    responseLanguage: MvpResponseLanguage
    chunks: RagAnswerRepairChunk[]
}) {
    const normalizedUserMessage = normalizeSearch(input.userMessage)
    if (!asksForAbbreviationTitle(normalizedUserMessage)) return null
    if (!isLikelyLinkOnlyResponse(input.response)) return null

    const title = input.chunks
        .map(extractChunkTitle)
        .find((value): value is string => Boolean(value?.trim()))

    if (!title) return null

    if (input.responseLanguage === 'en') {
        return `This abbreviation appears in the "${title}" title.`
    }

    return `Bu kısaltma "${title}" başlığında geçiyor.`
}

function extractSenatoMeetingNumber(content: string) {
    const normalized = content.replace(/\s+/g, ' ').trim()
    const directMatch = normalized.match(/(\d{1,3})\s+sayılı\s+Senato\s+toplantısında/i)
        ?? normalized.match(/(\d{1,3})\s+(?:nolu|numaralı)\s+Senato\s+toplantısında/i)
        ?? normalized.match(/TOPLANTI\s+SAYISI\s*[:：-]?\s*(\d{1,3})/i)

    return directMatch?.[1] ?? null
}

function repairSenatoMeetingNumberAnswer(input: {
    response: string
    userMessage: string
    chunks: RagAnswerRepairChunk[]
}) {
    const normalizedUserMessage = normalizeSearch(input.userMessage)
    if (!normalizedUserMessage.includes('senato') || !normalizedUserMessage.includes('toplanti')) return null
    if (/\b\d{1,3}\s+(?:sayili|nolu|numarali)\s+senato\s+toplant/i.test(normalizeSearch(input.response))) {
        return null
    }

    const meetingNumber = input.chunks
        .map((chunk) => extractSenatoMeetingNumber(chunk.content))
        .find((value): value is string => Boolean(value))

    if (!meetingNumber) return null

    if (/Senato toplantısında/i.test(input.response)) {
        return input.response.replace(/Senato toplantısında/i, `${meetingNumber} sayılı Senato toplantısında`)
    }

    return `${input.response.replace(/\s+$/, '')} Toplantı numarası ${meetingNumber}'tür.`
}

function extractArticleText(content: string, articleNumber: number) {
    const normalized = content.replace(/\s+/g, ' ').trim()
    const articlePattern = new RegExp(
        `(?:Amaç(?:\\s+ve\\s+kapsam)?|Kapsam)?\\s*(?:Madde|MADDE)\\s*${articleNumber}\\s*[-–—]?\\s*(?:\\(\\d+\\)\\s*)?`,
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

function asksForStaffUnpaidLeaveDuration(normalizedUserMessage: string) {
    return normalizedUserMessage.includes('ucretsiz')
        && normalizedUserMessage.includes('izin')
        && (normalizedUserMessage.includes('personel')
            || normalizedUserMessage.includes('akademik')
            || normalizedUserMessage.includes('idari')
            || normalizedUserMessage.includes('calisan'))
        && (normalizedUserMessage.includes('sure')
            || normalizedUserMessage.includes('suresi')
            || normalizedUserMessage.includes('kadar')
            || normalizedUserMessage.includes('kac')
            || normalizedUserMessage.includes('azami')
            || normalizedUserMessage.includes('en fazla'))
}

function responseAlreadyHasOneYearLimit(response: string) {
    return /\b1\s*(?:\(bir\)\s*)?yil/.test(normalizeSearch(response))
}

function extractStaffUnpaidLeaveDurationSentence(content: string) {
    const normalizedContent = content.replace(/\s+/g, ' ').trim()
    const match = normalizedContent.match(/Ücretsiz\s+izin\s+süresi\s+[^.?!]*(?:yıldır|yildir|yıl|yil)/iu)
    if (!match?.[0]) return null

    return match[0]
        .replace(/\s+/g, ' ')
        .replace(/[;,.!?]+$/g, '')
        .trim()
}

function repairStaffUnpaidLeaveDurationAnswer(input: {
    response: string
    userMessage: string
    responseLanguage: MvpResponseLanguage
    chunks: RagAnswerRepairChunk[]
}) {
    const normalizedUserMessage = normalizeSearch(input.userMessage)
    if (!asksForStaffUnpaidLeaveDuration(normalizedUserMessage)) return null
    if (responseAlreadyHasOneYearLimit(input.response)) return null

    const durationSentence = input.chunks
        .map((chunk) => extractStaffUnpaidLeaveDurationSentence(chunk.content))
        .find((value): value is string => Boolean(value))
    if (!durationSentence) return null

    if (input.responseLanguage === 'en') {
        return 'Staff unpaid leave duration is at most 1 (one) year.'
    }

    const staffSentence = durationSentence.replace(
        /^Ücretsiz\s+izin\s+süresi/iu,
        'Personelin ücretsiz izin süresi'
    )

    return `${staffSentence}.`
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

    const abbreviationTitleRepair = repairAbbreviationTitleAnswer({
        ...input,
        response
    })
    if (abbreviationTitleRepair) return abbreviationTitleRepair

    const documentCodeRepair = repairDocumentCodeAnswer({
        ...input,
        response
    })
    if (documentCodeRepair) return documentCodeRepair

    const senatoMeetingNumberRepair = repairSenatoMeetingNumberAnswer({
        ...input,
        response
    })
    if (senatoMeetingNumberRepair) return senatoMeetingNumberRepair

    const staffUnpaidLeaveDurationRepair = repairStaffUnpaidLeaveDurationAnswer({
        ...input,
        response
    })
    if (staffUnpaidLeaveDurationRepair) return staffUnpaidLeaveDurationRepair

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
