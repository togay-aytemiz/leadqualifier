function readTrimmedString(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeSourceUrl(value: unknown) {
    const raw = readTrimmedString(value)
    if (!raw) return null
    const compacted = raw
        .replace(/\s+/g, '')
        .replace(/[)\].,;:!?]+$/g, '')
    try {
        const parsed = new URL(compacted)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
        return parsed.toString()
    } catch {
        return null
    }
}

function extractSourceUrlFromText(value: unknown) {
    const content = readTrimmedString(value)
    if (!content) return null

    const rawUrl = content.match(/^Source URL:\s*(.+)$/im)?.[1]?.trim()
    return normalizeSourceUrl(rawUrl)
}

export function collectRagSourceUrls(chunks: unknown[], limit = 2) {
    const urls: string[] = []
    const seen = new Set<string>()

    for (const chunk of chunks) {
        if (!isRecord(chunk)) continue
        const sourceUrl = normalizeSourceUrl(chunk.source_url ?? chunk.sourceUrl)
            ?? extractSourceUrlFromText(chunk.content)
        if (!sourceUrl || seen.has(sourceUrl)) continue

        seen.add(sourceUrl)
        urls.push(sourceUrl)
        if (urls.length >= limit) break
    }

    return urls
}

function normalizeEvidenceText(value: string) {
    return value
        .toLocaleLowerCase('tr-TR')
        .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => TURKISH_SOURCE_LINK_CHAR_MAP[char] ?? char)
        .replace(/\s+/g, ' ')
        .trim()
}

function extractEmailEvidence(value: string) {
    return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []
}

function extractPhoneEvidence(value: string) {
    return value.match(/(?:\+?\s*90\s*)?(?:0\s*)?312[\s)./-]*329[\s)./-]*10[\s)./-]*10|(?:\+?\s*90\s*)?(?:0\s*)?312[\s)./-]*[0-9][0-9\s)./-]{5,}/gi) ?? []
}

function normalizeConcreteEvidenceValue(value: string) {
    return normalizeEvidenceText(value)
        .replace(/\s+/g, ' ')
        .trim()
}

function extractConcreteValueEvidence(value: string) {
    const normalized = normalizeEvidenceText(value)
    const turkishNumberWordDurations = normalized.match(
        /\b(?:bir|iki|uc|dort|bes|alti|yedi|sekiz|dokuz|on|on\s+bir|on\s+iki|on\s+uc|on\s+dort|on\s+bes|on\s+alti|on\s+yedi|on\s+sekiz|on\s+dokuz|yirmi|otuz|kirk|elli|altmis|yetmis|seksen|doksan|yuz)\s+(?:is\s*gunu|gun(?:dur|luk)?|ay(?:dir|lik)?|yil(?:dir|lik)?|saat|dakika)\b/giu
    ) ?? []

    return Array.from(new Set([
        ...(value.match(/\d+(?:[.,]\d+)?\s*(?:iş\s*günü|is\s*gunu|gün|gun|ay|yıl|yil|saat|dakika|akts|kredi|puan)/giu) ?? []),
        ...(value.match(/%\s*\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s*%/gu) ?? []),
        ...turkishNumberWordDurations
    ].map(normalizeConcreteEvidenceValue).filter(Boolean)))
}

function chunkContainsConcreteEvidence(response: string, chunk: unknown) {
    if (!isRecord(chunk)) return false
    const concreteValues = extractConcreteValueEvidence(response)
    if (concreteValues.length === 0) return true

    const searchable = normalizeEvidenceText([
        readTrimmedString(chunk.document_title ?? chunk.documentTitle) ?? '',
        readTrimmedString(chunk.source_url ?? chunk.sourceUrl) ?? '',
        readTrimmedString(chunk.content) ?? ''
    ].join('\n'))

    return concreteValues.some((value) => searchable.includes(value))
}

function chunkContainsConcreteValue(chunk: unknown, value: string) {
    if (!isRecord(chunk)) return false

    const searchable = normalizeEvidenceText([
        readTrimmedString(chunk.document_title ?? chunk.documentTitle) ?? '',
        readTrimmedString(chunk.source_url ?? chunk.sourceUrl) ?? '',
        readTrimmedString(chunk.content) ?? ''
    ].join('\n'))

    return searchable.includes(value)
}

function chunkSearchableText(chunk: unknown) {
    if (!isRecord(chunk)) return ''

    return [
        readTrimmedString(chunk.document_title ?? chunk.documentTitle) ?? '',
        readTrimmedString(chunk.source_url ?? chunk.sourceUrl) ?? '',
        readTrimmedString(chunk.content) ?? ''
    ].join('\n')
}

function chunkContainsContactEvidence(response: string, chunk: unknown) {
    if (!isRecord(chunk)) return false

    const emails = extractEmailEvidence(response).map(normalizeEvidenceText)
    const phoneDigits = extractPhoneEvidence(response)
        .map((phone) => phone.replace(/\D/g, ''))
        .filter((phone) => phone.length >= 8)
    if (emails.length === 0 && phoneDigits.length === 0) return true

    const searchableRaw = chunkSearchableText(chunk)
    const searchable = normalizeEvidenceText(searchableRaw)
    const searchableDigits = searchableRaw.replace(/\D/g, '')

    return emails.some((email) => searchable.includes(email))
        || phoneDigits.some((phone) => searchableDigits.includes(phone))
}

function answerEvidenceTerms(response: string) {
    const normalized = normalizeEvidenceText(response)
    return Array.from(new Set(normalized
        .split(/[^a-z0-9@.]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 5)
        .filter((token) => ![
            'adres',
            'adresi',
            'bilgi',
            'bilgisi',
            'detayli',
            'burada',
            'sayfa',
            'yardimci',
            'olabilirim',
            'universitesi',
            'yuksek',
            'ihtisas'
        ].includes(token))))
}

function sourceEvidenceScore(response: string, chunk: unknown) {
    if (!isRecord(chunk)) return 0

    const chunkContent = readTrimmedString(chunk.content) ?? ''
    const searchable = normalizeEvidenceText([
        readTrimmedString(chunk.document_title ?? chunk.documentTitle) ?? '',
        readTrimmedString(chunk.source_url ?? chunk.sourceUrl) ?? '',
        chunkContent
    ].join('\n'))
    const normalizedResponse = normalizeEvidenceText(response)
    let score = 0

    for (const email of extractEmailEvidence(response)) {
        if (searchable.includes(normalizeEvidenceText(email))) score += 8
    }
    for (const phone of extractPhoneEvidence(response)) {
        const compactPhone = phone.replace(/\D/g, '')
        if (compactPhone && searchable.replace(/\D/g, '').includes(compactPhone)) score += 5
    }
    for (const concreteValue of extractConcreteValueEvidence(response)) {
        if (searchable.includes(concreteValue)) score += 4
    }
    for (const platform of ['uzem', 'medu', 'obs']) {
        if (normalizedResponse.includes(platform) && searchable.includes(platform)) score += 2.2
    }

    const terms = answerEvidenceTerms(response)
    for (const term of terms) {
        if (searchable.includes(term)) score += 0.35
    }

    if (normalizedResponse.includes('e-posta') || normalizedResponse.includes('email') || normalizedResponse.includes('mail')) {
        if (searchable.includes('e-posta') || searchable.includes('email') || searchable.includes('mail')) score += 1.2
    }
    if (normalizedResponse.includes('telefon') && searchable.includes('telefon')) score += 1.2

    return score
}

function isListingOrIndexSource(chunk: unknown) {
    if (!isRecord(chunk)) return false

    const sourceUrl = readTrimmedString(chunk.source_url ?? chunk.sourceUrl) ?? ''
    const title = normalizeEvidenceText(readTrimmedString(chunk.document_title ?? chunk.documentTitle) ?? '')
    let pathname = sourceUrl
    try {
        pathname = new URL(sourceUrl).pathname
    } catch {
        // Keep the raw value for schemeless or malformed test inputs.
    }
    const normalizedPath = normalizeEvidenceText(pathname)

    return (
        /\/(?:haberler|duyurular|announcements|news)\/index(?:\/|$)/i.test(pathname)
        || normalizedPath.includes('/haberler/index')
        || normalizedPath.includes('/duyurular/index')
        || title === 'tum haberler'
        || title === 'tum duyurular'
        || title === 'all news'
        || title === 'all announcements'
    )
}

function sourceUrlFromChunk(chunk: unknown) {
    if (!isRecord(chunk)) return null

    return normalizeSourceUrl(chunk.source_url ?? chunk.sourceUrl)
        ?? extractSourceUrlFromText(chunk.content)
}

function mergeSourceUrls(limit: number, ...urlGroups: string[][]) {
    const urls: string[] = []
    const seen = new Set<string>()

    for (const group of urlGroups) {
        for (const url of group) {
            if (!url || seen.has(url)) continue

            seen.add(url)
            urls.push(url)
            if (urls.length >= limit) return urls
        }
    }

    return urls
}

function collectConcreteCoverageSourceUrls(response: string, chunks: unknown[], limit: number) {
    const normalizedResponse = normalizeEvidenceText(response)
    const concreteValues = extractConcreteValueEvidence(response)
        .sort((left, right) => {
            const leftIndex = normalizedResponse.indexOf(left)
            const rightIndex = normalizedResponse.indexOf(right)
            return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex)
                - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
        })
    const urls: string[] = []
    const seen = new Set<string>()

    for (const value of concreteValues) {
        const valueChunks = chunks.filter((chunk) => chunkContainsConcreteValue(chunk, value))
        if (valueChunks.length === 0) continue

        const directValueChunks = valueChunks.filter((chunk) => !isListingOrIndexSource(chunk))
        const rankedValueChunks = (directValueChunks.length > 0 ? directValueChunks : valueChunks)
            .map((chunk, index) => ({ chunk, index, score: sourceEvidenceScore(response, chunk) }))
            .sort((left, right) => right.score - left.score || left.index - right.index)

        for (const item of rankedValueChunks) {
            const sourceUrl = sourceUrlFromChunk(item.chunk)
            if (!sourceUrl || seen.has(sourceUrl)) continue

            seen.add(sourceUrl)
            urls.push(sourceUrl)
            break
        }

        if (urls.length >= limit) break
    }

    return urls
}

function collectRagSourceUrlsByResponseEvidence(response: string, chunks: unknown[], limit: number) {
    const indexedChunks = chunks.map((chunk, index) => ({ chunk, index, score: sourceEvidenceScore(response, chunk) }))
    const hasPositiveScore = indexedChunks.some((item) => item.score > 0)
    const rankedChunks = hasPositiveScore
        ? indexedChunks.sort((left, right) => right.score - left.score || left.index - right.index).map((item) => item.chunk)
        : chunks
    const contactEvidenceChunks = rankedChunks.filter((chunk) => chunkContainsContactEvidence(response, chunk))
    const contactRankedChunks = contactEvidenceChunks.length > 0 ? contactEvidenceChunks : rankedChunks
    const concreteEvidenceChunks = contactRankedChunks.filter((chunk) => chunkContainsConcreteEvidence(response, chunk))
    const evidenceRankedChunks = concreteEvidenceChunks.length > 0 ? concreteEvidenceChunks : contactRankedChunks
    const directChunks = evidenceRankedChunks.filter((chunk) => !isListingOrIndexSource(chunk))
    const directUrls = collectRagSourceUrls(directChunks, limit)
    const coverageUrls = collectConcreteCoverageSourceUrls(response, evidenceRankedChunks, limit)
    const directCoverageUrls = mergeSourceUrls(limit, coverageUrls, directUrls)
    if (directCoverageUrls.length > 0) return directCoverageUrls

    return mergeSourceUrls(
        limit,
        coverageUrls,
        collectRagSourceUrls(evidenceRankedChunks, limit)
    )
}

const SPACED_RAW_URL_PATTERN = /https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+(?:(?:\s+(?=[/?#])|(?<=[-_/=&#?%.])\s+)[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+)*/gi
const SIMPLE_RAW_URL_PATTERN = /https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/gi
const SCHEMELESS_SPACED_SOURCE_FRAGMENT_PATTERN = /\b(?:[A-Za-z0-9-]{2,}\s*\.\s*)?(?:edu|com|net|org|gov)\s*\.\s*(?:tr|com|net|org|edu|gov|io|ai)\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+(?:(?:\s+(?=[/?#])|(?<=[-_/=&#?%.])\s+)[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+)*/gi
const SCHEMELESS_SPACED_DOMAIN_FRAGMENT_PATTERN = /(?<![@.\p{L}\p{N}-])(?:edu|com|net|org|gov)\s*\.\s*(?:tr|com|net|org|edu|gov|io|ai)\b/giu
const ORPHAN_SOURCE_PATH_FRAGMENT_PATTERN = /[\p{L}\p{N}-]{3,}\/(?=[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*-)[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/giu

function hasRagUrlArtifact(response: string) {
    SCHEMELESS_SPACED_SOURCE_FRAGMENT_PATTERN.lastIndex = 0
    SCHEMELESS_SPACED_DOMAIN_FRAGMENT_PATTERN.lastIndex = 0
    return /https?:\/\//i.test(response)
        || SCHEMELESS_SPACED_SOURCE_FRAGMENT_PATTERN.test(response)
        || SCHEMELESS_SPACED_DOMAIN_FRAGMENT_PATTERN.test(response)
}

function collectResponseSourceUrls(response: string, limit: number) {
    const urls: string[] = []
    const seen = new Set<string>()
    const matches = response.match(SPACED_RAW_URL_PATTERN) ?? response.match(SIMPLE_RAW_URL_PATTERN) ?? []

    for (const match of matches) {
        const normalized = normalizeSourceUrl(match)
        if (!normalized || seen.has(normalized)) continue

        seen.add(normalized)
        urls.push(normalized)
        if (urls.length >= limit) break
    }

    return urls
}

function stripRagUrlArtifacts(response: string) {
    let stripped = response
        .replace(/\[([^\]\n]+)]\(\s*https?:\/\/[\s\S]*?\)/gi, '$1')
        .replace(SPACED_RAW_URL_PATTERN, '')
        .replace(SCHEMELESS_SPACED_SOURCE_FRAGMENT_PATTERN, '')
        .replace(SCHEMELESS_SPACED_DOMAIN_FRAGMENT_PATTERN, '')
        .replace(ORPHAN_SOURCE_PATH_FRAGMENT_PATTERN, '')

    if (/https?:\/\/\s/i.test(stripped)) {
        stripped = stripped.replace(/https?:\/\/[\s\S]*$/i, '')
    } else {
        stripped = stripped.replace(SIMPLE_RAW_URL_PATTERN, '')
    }

    return stripped
        .replace(/\s+([,.;!?])/g, '$1')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
}

function stripGenericSourceLinkPrefaceTail(response: string) {
    let stripped = response.trim()

    const patterns = [
        /\s*(?:Başka bir (?:konuda|sorunuz(?: varsa| var mı)?|bilgi(?:ye)?)[\s\S]{0,160}?(?:yardımcı olabilir(?:im|iz| miyim)|ihtiyac(?:ın|ınız) var mı|ister misin(?:iz)?)\??[.!?]?|Başka bir sorunuz var mı\??[.!?]?)\s*$/iu,
        /\s*(?:Daha fazla|Detaylı)\s+(?:bilgi|detay)(?: almak)?\s+ister misin(?:iz)?\??[.!?]?\s*$/iu,
        /\s*(?:Daha fazla|Detaylı)\s+(?:bilgi|detay)(?: almak)?\s+istersen(?:iz)?[\s,]*$/iu,
        /\s*(?:Daha fazla|Detaylı)\s+(?:detay|bilgi)(?: almak)?\s+istersen(?:iz)?,?\s*(?:belirli\s+bir\s+)?[\p{L}\p{N}\s]{0,80}?(?:dönem|konu|program|birim)[\s\S]{0,120}?hakkında\s+bilgi\s+verebilir(?:im|iz)[.!?]?\s*$/iu,
        /\s*(?:Daha fazla|Detaylı)\s+(?:detay|bilgi)(?: almak)?\s+istersen(?:iz)?,?\s*hangi\s+[\s\S]{0,160}?(?:bilgi almak istediğini(?:z)?|hakkında merak ettiğini(?:z)?|ilgili olduğunu)[\s\S]{0,100}?(?:söyleyebilir|belirtebilir|söyle|belirt)[\p{L}]*[.!?]?\s*$/iu,
        /\s*(?:Daha fazla|Detaylı)\s+(?:bilgi|detay)(?: almak)?\s+istersen(?:iz)?[\s\S]{0,220}?(?:yardımcı olabilir(?:im|iz)|söyleyebilir(?:sin|siniz)|belirtebilir(?:sin|siniz)|paylaşabilir(?:im|iz)|iletişime geçebilir(?:sin|siniz)|iletişime geç(?:in|iniz))\??[.!?]?\s*$/iu,
        /\s*(?:Eğer\s+)?Daha fazla bilgiye ihtiya[çc](?:ın|ınız)?\s+(?:duyarsan(?:ız)?|olursa|varsa),?\s*hangi\s+[\s\S]{0,120}?\s+hakkında\s+merak\s+ettiğini(?:z)?\s+belirtebilir(?:sin|siniz)[.!?]?\s*$/iu,
        /\s*(?:Eğer\s+)?Daha fazla bilgiye ihtiya[çc](?:ın|ınız)?\s+(?:duyarsan(?:ız)?|olursa|varsa),?\s*[\s\S]{0,180}?(?:sayfasını\s+)?ziyaret edebilir(?:sin|siniz)\.?:?\s*$/iu,
        /\s*(?:Eğer\s+)?Daha fazla bilgiye ihtiya[çc](?:ın|ınız)?\s+(?:duyarsan(?:ız)?|olursa|varsa),?\s*(?:belirli\s+bir\s+konu|[\p{L}\p{N}\s]{0,100}?(?:başka|farklı)\s+bir\s+konu)[\s\S]{0,160}?(?:hakkında\s+)?(?:yardımcı olabilir(?:im|iz)|bilgi verebilir(?:im|iz)|var mı)\??[.!?]?\s*$/iu,
        /\s*(?:Daha fazla bilgi(?: almak)? istersen(?:iz)?,?\s*)?(?:platforma|sisteme|MEDU'ya|MEDU’ya)[\s\S]{0,180}?(?:derslerinle|ilgili\s+ders)[\s\S]{0,140}?(?:ulaşabilir|erişebilir)[\p{L}]*[.!?]?(?:\s*(?:Eğer\s+)?başka\s+bir\s+konuda[\s\S]{0,120}?lütfen\s+belirt(?:in|iniz)?[.!?]?)?\s*$/iu,
        /\s*(?:Detaylı|Daha fazla)\s+bilgi(?:\s+veya\s+başvuru)?\s+için\s+ilgili\s+(?:birim|bölüm|fakülte)[\s\S]{0,180}?(?:yardımcı olabilir(?:im|iz)|iletişime geç(?:meni|menizi|mek istersen(?:iz)?))\??[.!?]?\s*$/iu,
        /\s*Daha fazla bilgiye ihtiya[çc](?:ın|ınız)?\s+duyarsan(?:ız)?[\s,]+hangi\s+konuda\s+yardımcı olabilir(?:im|iz)\??[.!?]?\s*$/iu,
        /\s*(?:Eğer\s+)?(?:Daha fazla bilgiye ihtiya[çc](?:ın|ınız)?\s+(?:olursa|duyarsan(?:ız)?|varsa))[\s\S]{0,260}?(?:yardımcı olabilir(?:im|iz)|söyleyebilir(?:sin|siniz)|paylaşabilir(?:im|iz)|iletişime geç(?:meni|menizi|ebilir(?:sin|siniz)?))\s*(?:öneririm)?\.?(?:\s*(?:Daha fazla|Detaylı)\s+(?:bilgi|detay)[\s\S]{0,120}?(?:buraya|linke|bağlantıya)\s+göz atabilir(?:sin|siniz)?:?)?\s*$/iu,
        /\s*Hangi\s+(?:bölüm|program)[\s\S]{0,140}?\beğitim\s+al(?:ıyorsun|ıyorsunuz|dığını|dığınızı|mak istediğini|mak istediğinizi)[\s\S]{0,140}?(?:bilgi verebilir(?:im|iz)|yardımcı olabilir(?:im|iz)|daha spesifik bilgi verebilir(?:im|iz))\.?\s*$/iu,
        /\s*(?:Bu konuda\s+)?(?:daha\s+(?:net|spesifik)|detaylı|daha fazla)\s+bilgi(?: almak)?\s+için\s+hangi\s+(?:bölümde|programda)[\s\S]{0,140}?(?:belirtir|belirtir misin|belirtir misiniz|söyleyebilir|söyleyebilir misin|söyleyebilir misiniz)[\p{L}\s]*\??[.!?]?\s*$/iu,
        /\s*hangi\s+(?:bölümde|programda)\s+(?:okuduğunu(?:z)?|olduğunu(?:z)?)[\s\S]{0,80}?öğrenebilir miyim\??(?:\s*(?:Böylece|Bu sayede)[\s\S]{0,140}?(?:daha\s+)?(?:spesifik|net)[\s\S]{0,100}?(?:bilgi verebilir(?:im|iz)|yardımcı olabilir(?:im|iz))[.!?]?)?\s*$/iu,
        /\s*(?:Daha fazla bilgiye ihtiya[çc](?:ın|ınız)?\s+(?:olursa|duyarsan(?:ız)?|varsa),?\s*)?hangi\s+(?:bölüm|program)[\s\S]{0,160}?\bilgilendi(?:ğinizi|ğini)[\s\S]{0,120}?(?:söyleyebilir|belirtebilir)(?:\s+misin(?:iz)?)?\??[.!?]?\s*$/iu,
        /\s*hangi\s+[\s\S]{0,120}?\s+ilgilen(?:diğini|diğinizi)\s+belirtmek\s+ister misin(?:iz)?\??[.!?]?\s*$/iu,
        /\s*(?:Bu nedenle|Bu yüzden|Bu sebeple),?\s*hangi\s+(?:bölümde|programda|bölümle|programla)[\s\S]{0,180}?(?:daha spesifik bilgi verebilir(?:im|iz)|yardımcı olabilir(?:im|iz)|bilgi verebilir(?:im|iz))[.!?]?(?:\s*Hangi\s+(?:bölüm|program)(?:le| ile)?\s+ilgileniyorsun(?:uz)?\??[.!?]?)?\s*$/iu,
        /\s*Hangi\s+(?:bölüm|program)(?:le| ile)?\s+ilgileniyorsun(?:uz)?\??[.!?]?\s*$/iu,
        /\s*Hangi\s+(?:bölüm|program)\w*\s+(?:eğitim\s+al|okuyor|okuduğ|olduğ|ilgilen|düşün)[\s\S]{0,160}\??[.!?]?\s*$/iu,
        /\s*[\p{L}\p{N}\s]{0,120}?(?:ilgili|hakkında)\s+(?:başka|farklı)\s+bir\s+konu\s+var mı\??[.!?]?\s*$/iu,
        /\s*(?:Eğer\s+)?başka\s+bir\s+konuda\s+yardımcı\s+olmamı\s+istersen(?:iz)?,?\s+lütfen\s+belirt(?:in|iniz)?[.!?]?\s*$/iu,
        /\s*İlgilendiğin(?:iz)?\s+(?:bölüm|program|ders|konu)[\s\S]{0,140}?\s*$/iu
    ]

    for (const pattern of patterns) {
        stripped = stripped.replace(pattern, '').trim()
    }
    stripped = stripGenericTailSentencesBeforeSource(stripped)

    return stripped
        .replace(/\s+([,.;!?])/g, '$1')
        .replace(/\s+$/u, '')
        .trim()
}

function normalizeTailSentence(value: string) {
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

function tailIncludesAny(value: string, terms: string[]) {
    return terms.some((term) => value.includes(term))
}

function isGenericTailSentenceBeforeSource(sentence: string) {
    const normalized = normalizeTailSentence(sentence)
    const asksRoleOrTopic = normalized.includes('hangi')
        && tailIncludesAny(normalized, ['bolum', 'program', 'donem', 'konu', 'birim'])
        && tailIncludesAny(normalized, ['okudug', 'ilgilend', 'belirt', 'ogrenebilir', 'soyle'])
    const offersGenericHelp = tailIncludesAny(normalized, ['yardimci', 'bilgi verebilir', 'spesifik bilgi', 'net bilgi'])

    if (asksRoleOrTopic && offersGenericHelp) return true
    if (/^(?:daha fazla|detayli)\s+(?:bilgi|detay)/i.test(normalized)
        && tailIncludesAny(normalized, ['istersen', 'ihtiyacin', 'ihtiyaciniz', 'duyarsan', 'olursa'])
        && tailIncludesAny(normalized, ['yardimci', 'bilgi verebilir', 'belirt', 'soyle', 'ulasabilir', 'erisebilir', 'ziyaret edebilir', 'goz atabilir'])) {
        return true
    }
    if (normalized.includes('baska bir konu')
        && tailIncludesAny(normalized, ['yardimci', 'belirt', 'var mi'])) {
        return true
    }
    if (/^(?:boylece|bu sayede)\b/i.test(normalized)
        && tailIncludesAny(normalized, ['spesifik bilgi', 'net bilgi', 'yardimci'])) {
        return true
    }

    return false
}

function stripGenericTailSentencesBeforeSource(response: string) {
    let stripped = response.trim()

    for (let index = 0; index < 4; index += 1) {
        const match = stripped.match(/(?:^|[.!?]\s+)([^.!?\n]{8,260}[.!?]?)\s*$/u)
        const sentence = match?.[1]?.trim()
        if (!sentence || !isGenericTailSentenceBeforeSource(sentence)) break

        const start = stripped.lastIndexOf(sentence)
        if (start < 0) break
        stripped = stripped.slice(0, start).trim()
    }

    return stripped
}

const TURKISH_SOURCE_LINK_CHAR_MAP: Record<string, string> = {
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
}

export function isLikelySourceLinkRequest(message: string | null | undefined) {
    const normalized = (message ?? '')
        .toLocaleLowerCase('tr-TR')
        .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => TURKISH_SOURCE_LINK_CHAR_MAP[char] ?? char)

    return /\b(link|url|baglanti|sayfa|nerede|nereden|ulas|erisebilir|paylas|gonder|pdf|dokuman|belge)\b/i.test(normalized)
}

export function appendCanonicalRagSourceLinks(
    response: string,
    chunks: unknown[],
    options: { force?: boolean; limit?: number } = {}
) {
    const hasUrlArtifact = hasRagUrlArtifact(response)
    if (!options.force && !hasUrlArtifact) return response

    const limit = Math.max(1, options.limit ?? 2)
    const sourceUrls = collectRagSourceUrlsByResponseEvidence(response, chunks, limit)
    const urls = sourceUrls.length > 0
        ? sourceUrls
        : collectResponseSourceUrls(response, limit)
    if (urls.length === 0) return response

    const responseWithoutUrlArtifacts = hasUrlArtifact
        ? stripRagUrlArtifacts(response)
        : response.trim()
    const cleanedResponse = stripGenericSourceLinkPrefaceTail(responseWithoutUrlArtifacts)

    return [
        cleanedResponse,
        ...urls
    ]
        .filter(Boolean)
        .join('\n')
        .trim()
}
