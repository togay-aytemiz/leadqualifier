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

const GENERIC_ASSISTANT_CLOSING_TAIL_PATTERNS = [
    /\s*(?:Başka bir konuda yardımcı olabilir miyim|Başka bir sorunuz var mı|Başka bir bilgi ister misin(?:iz)?|Başka bir bilgiye ihtiyac(?:ın|ınız) var mı|Yardımcı olabileceğim başka bir konu var mı|Yardımcı olmamı istediğiniz başka bir konu var mı|İstersen(?:iz)? başka bir konuda yardımcı olayım mı|Başka bir sorunuz(?: olursa| varsa)?\s+(?:yardımcı olabilir miyim|yardımcı olmaktan memnuniyet duyarım))\??[.!?]?\s*$/iu,
    /\s*(?:Eğer\s+)?(?:Daha fazla|Detaylı)\s+(?:bilgi|detay|yardım)(?: almak)?\s+istersen(?:iz)?[\s,]+[\s\S]{0,180}?\b(?:yardımcı olabilir(?:im|iz| miyim)|paylaşabilir(?:im|iz))\??[.!?]?\s*$/iu,
    /\s*(?:Daha fazla|Detaylı)\s+(?:detay|bilgi)(?: almak)?\s+istersen(?:iz)?,?\s*(?:belirli\s+bir\s+)?[\p{L}\p{N}\s]{0,80}?(?:dönem|konu|program|birim)[\s\S]{0,120}?hakkında\s+bilgi\s+verebilir(?:im|iz)[.!?]?\s*$/iu,
    /\s*(?:Daha fazla|Detaylı)\s+(?:detay|bilgi)(?: almak)?\s+istersen(?:iz)?,?\s*hangi\s+[\s\S]{0,160}?(?:bilgi almak istediğini(?:z)?|hakkında merak ettiğini(?:z)?|ilgili olduğunu)[\s\S]{0,100}?(?:söyleyebilir|belirtebilir|söyle|belirt)[\p{L}]*[.!?]?\s*$/iu,
    /\s*(?:Bu nedenle|Bu yüzden|Bunun için),?\s*$/iu,
    /\s*(?:Eğer\s+)?Daha fazla bilgiye ihtiya[çc](?:ın|ınız)?\s+(?:olursa|duyarsan(?:ız)?|varsa),?\s*$/iu,
    /\s*(?:Eğer\s+)?Daha fazla bilgiye ihtiya[çc](?:ın|ınız)?\s+(?:duyarsan(?:ız)?|olursa|varsa),?\s*hangi\s+[\s\S]{0,120}?\s+hakkında\s+merak\s+ettiğini(?:z)?\s+belirtebilir(?:sin|siniz)[.!?]?\s*$/iu,
    /\s*(?:Eğer\s+)?(?:Daha fazla bilgi(?: almak)? istersen(?:iz)?|Daha fazla bilgiye ihtiya[çc](?:ın|ınız)?\s+(?:olursa|duyarsan(?:ız)?|varsa)|Detaylı bilgi(?: almak)? istersen(?:iz)?),?\s+(?:(?:başka|farklı|ilgili)\s+[\s\S]{0,120}?\s+)?(?:hakkında\s+)?(?:yardımcı olabilir(?:im|iz)|yardımcı olurum|bilgi verebilir(?:im|iz))\??[.!?]?\s*$/iu,
    /\s*(?:Eğer\s+)?Daha fazla bilgiye ihtiya[çc](?:ın|ınız)?\s+(?:duyarsan(?:ız)?|olursa|varsa),?\s*(?:belirli\s+bir\s+konu|[\p{L}\p{N}\s]{0,100}?(?:başka|farklı)\s+bir\s+konu)[\s\S]{0,160}?(?:hakkında\s+)?(?:yardımcı olabilir(?:im|iz)|bilgi verebilir(?:im|iz)|var mı)\??[.!?]?\s*$/iu,
    /\s*(?:Eğer\s+)?(?:Daha fazla bilgi(?: almak)? istersen(?:iz)?|Daha fazla bilgiye ihtiya[çc](?:ın|ınız) (?:olursa|varsa)|Detaylı bilgi(?: almak)? istersen(?:iz)?),?\s*(?:(?:sana|size)\s+)?(?:yardımcı olabilir(?:im|iz)|yardımcı olurum|belirtebilir(?:sin|siniz)|lütfen belirt(?:in)?|sormaktan çekinme(?:yin)?|buradayım|memnuniyetle yardımcı olurum)[.!?]?\s*$/iu,
    /\s*(?:Daha fazla|Detaylı)\s+(?:bilgi|detay)(?:\s+(?:veya|ya da)\s+(?:başka|farklı|ilgili)\s+[\s\S]{0,120}?\s+bilgi)?\s+ister misin(?:iz)?\??[.!?]?\s*$/iu,
    /\s*(?:Daha fazla bilgiye ihtiya[çc](?:ın|ınız) var mı|Daha fazla bilgi(?: almak)? ister misin(?:iz)?|Daha fazla detay ister misin(?:iz)?|Detaylı bilgi(?: almak)? ister misin(?:iz)?)\??[.!?]?\s*$/iu,
    /\s*Hangi\s+(?:bölüm|program)[\s\S]{0,140}?(?:belirtirsen|belirtirseniz|söylersen|söylerseniz)[\s\S]{0,120}?(?:yardımcı olabilir(?:im|iz)|bilgi verebilir(?:im|iz))[.!?]?\s*$/iu,
    /\s*(?:Bu konuda\s+)?(?:daha (?:net|fazla) bilgi(?:ye ihtiya[çc](?:ın|ınız) olursa| almak istersen(?:iz)?)?,?\s*)?hangi\s+[\s\S]{0,120}?\beğitim\s+(?:aldığını|aldığınızı|almak istediğini|almak istediğinizi|gördüğünü|gördüğünüzü)\s+(?:belirtirsen|belirtirseniz|söylersen|söylerseniz)\s+[\s\S]{0,120}?(?:yardımcı olabilir(?:im|iz)|yardımcı olurum|bakabilir(?:im|iz))[.!?]?\s*$/iu,
    /\s*(?:Eğer\s+)?(?:Daha fazla\s+)?(?:bilgiye|yardıma)\s+ihtiya[çc](?:ın|ınız)?\s+(?:olursa|duyarsan(?:ız)?|varsa),?\s*hangi\s+[\s\S]{0,140}?\beğitim\s+(?:aldığını|aldığınızı|almak istediğini|almak istediğinizi|gördüğünü|gördüğünüzü)\s+(?:belirtebilir|belirtebilir misin|belirtebilir misiniz|söyleyebilir|söyleyebilirsin|söyleyebilirsiniz)[.!?]?\s*$/iu,
    /\s*(?:Daha fazla|Detaylı)\s+bilgi(?: almak)?\s+istersen(?:iz)?[\s,]+hangi\s+bölümde\s+eğitim\s+(?:aldığını|aldığınızı|almak istediğini|almak istediğinizi)\s+(?:belirtebilir|belirtebilir misin|belirtebilir misiniz|söyleyebilir|söyleyebilirsin|söyleyebilirsiniz)[.!?]?\s*$/iu,
    /\s*hangi\s+(?:bölüm|program)[\s\S]{0,140}?\beğitim\s+(?:aldığını|aldığınızı|almak istediğini|almak istediğinizi|gördüğünü|gördüğünüzü)\s+(?:belirtebilir|belirtebilir misin|belirtebilir misiniz|söyleyebilir|söyleyebilirsin|söyleyebilirsiniz)[.!?]?\s*$/iu,
    /\s*Hangi\s+(?:bölüm|program)[\s\S]{0,140}?\beğitim\s+al(?:ıyorsun|ıyorsunuz|dığını|dığınızı|mak istediğini|mak istediğinizi)[\s\S]{0,140}?(?:bilgi verebilir(?:im|iz)|yardımcı olabilir(?:im|iz)|daha spesifik bilgi verebilir(?:im|iz))[.!?]?\s*$/iu,
    /\s*(?:Bu konuda\s+)?(?:daha\s+(?:net|spesifik)|detaylı|daha fazla)\s+bilgi(?: almak)?\s+için\s+hangi\s+(?:bölümde|programda)[\s\S]{0,140}?(?:belirtir|belirtir misin|belirtir misiniz|söyleyebilir|söyleyebilir misin|söyleyebilir misiniz)[\p{L}\s]*\??[.!?]?\s*$/iu,
    /\s*(?:Daha fazla bilgi(?: almak)? istersen(?:iz)?,?\s*)?hangi\s+bölümde\s+(?:olduğunu|olduğunuzu|okuduğunu|okuduğunuzu)\s+(?:öğrenebilir miyim|belirtirsen(?:iz)?\s+yardımcı olabilir(?:im|iz)?|söylersen(?:iz)?\s+yardımcı olabilir(?:im|iz)?)[.!?]?\s*$/iu,
    /\s*hangi\s+(?:bölümde|programda)\s+(?:okuduğunu(?:z)?|olduğunu(?:z)?)[\s\S]{0,80}?öğrenebilir miyim\??(?:\s*(?:Böylece|Bu sayede)[\s\S]{0,140}?(?:daha\s+)?(?:spesifik|net)[\s\S]{0,100}?(?:bilgi verebilir(?:im|iz)|yardımcı olabilir(?:im|iz))[.!?]?)?\s*$/iu,
    /\s*hangi\s+[\s\S]{0,120}?\s+ilgilen(?:diğini|diğinizi)\s+belirtmek\s+ister misin(?:iz)?\??[.!?]?\s*$/iu,
    /\s*(?:Daha fazla bilgiye ihtiya[çc](?:ın|ınız)?\s+(?:olursa|duyarsan(?:ız)?|varsa),?\s*)?hangi\s+[\s\S]{0,140}?\s+ilgili\s+olduğunu\s+belirtirsen(?:iz)?\s+yardımcı olabilir(?:im|iz)?[.!?]?\s*$/iu,
    /\s*(?:Daha spesifik|Daha fazla|Detaylı)\s+bilgi(?: almak)?\s+(?:için|istersen(?:iz)?),?\s+hangi\s+(?:bölümde\s+okuduğunu(?:z)?|programla\s+ilgilendiğini(?:z)?)[\s\S]{0,180}?(?:belirtir|belirtir misin(?:iz)?|söyler|söyler misin(?:iz)?)[.!?]?\s*$/iu,
    /\s*(?:Bu nedenle|Bu yüzden|Bu sebeple),?\s*hangi\s+(?:bölümde|programda|bölümle|programla)[\s\S]{0,180}?(?:daha spesifik bilgi verebilir(?:im|iz)|yardımcı olabilir(?:im|iz)|bilgi verebilir(?:im|iz))[.!?]?(?:\s*Hangi\s+(?:bölüm|program)(?:le| ile)?\s+ilgileniyorsun(?:uz)?\??[.!?]?)?\s*$/iu,
    /\s*Hangi\s+(?:bölüm|program)(?:le| ile)?\s+ilgileniyorsun(?:uz)?\??[.!?]?\s*$/iu,
    /\s*[\p{L}\p{N}\s]{0,120}?(?:ilgili|hakkında)\s+(?:başka|farklı)\s+bir\s+konu\s+var mı\??[.!?]?\s*$/iu,
    /\s*(?:Eğer\s+)?başka\s+bir\s+konuda\s+yardımcı\s+olmamı\s+istersen(?:iz)?,?\s+lütfen\s+belirt(?:in|iniz)?[.!?]?\s*$/iu,
    /\s*(?:başka|farklı)\s+bir\s+konu\s+hakkında\s+yardımcı olabilir miyim\??[.!?]?\s*$/iu,
    /\s*(?:For more information|If you need more information),?\s*(?:I can help|feel free to ask|I am here to help)[.!?]?\s*$/iu,
    /\s*(?:Do you need more information|Would you like more information)\??[.!?]?\s*$/iu,
    /\s*(?:Can I help with anything else|Is there anything else I can help with)\??[.!?]?\s*$/iu
]

function stripGenericAssistantClosingTail(response: string) {
    let stripped = response.trim()

    for (const pattern of GENERIC_ASSISTANT_CLOSING_TAIL_PATTERNS) {
        stripped = stripped.replace(pattern, '').trim()
    }
    stripped = stripGenericTailSentences(stripped)

    if (!stripped || stripped === response.trim()) return response
    return stripped
        .replace(/\s+([,.;!?])/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
}

function isGenericTailSentence(sentence: string) {
    const normalized = normalizeSearch(sentence)
    const asksRoleOrTopic = normalized.includes('hangi')
        && includesAny(normalized, ['bolum', 'program', 'donem', 'konu', 'birim'])
        && includesAny(normalized, ['okudug', 'ilgilend', 'belirt', 'ogrenebilir', 'soyle'])
    const offersGenericHelp = includesAny(normalized, ['yardimci', 'bilgi verebilir', 'spesifik bilgi', 'net bilgi'])

    if (asksRoleOrTopic && offersGenericHelp) return true
    if (/^(?:daha fazla|detayli)\s+(?:bilgi|detay)/i.test(normalized)
        && includesAny(normalized, ['istersen', 'ihtiyacin', 'ihtiyaciniz', 'duyarsan', 'olursa'])
        && includesAny(normalized, ['yardimci', 'bilgi verebilir', 'belirt', 'soyle', 'ulasabilir', 'erisebilir', 'ziyaret edebilir', 'goz atabilir'])) {
        return true
    }
    if (normalized.includes('baska bir konu')
        && includesAny(normalized, ['yardimci', 'belirt', 'var mi'])) {
        return true
    }
    if (/^(?:boylece|bu sayede)\b/i.test(normalized)
        && includesAny(normalized, ['spesifik bilgi', 'net bilgi', 'yardimci'])) {
        return true
    }

    return false
}

function stripGenericTailSentences(response: string) {
    let stripped = response.trim()

    for (let index = 0; index < 4; index += 1) {
        const match = stripped.match(/(?:^|[.!?]\s+)([^.!?\n]{8,260}[.!?]?)\s*$/u)
        const sentence = match?.[1]?.trim()
        if (!sentence || !isGenericTailSentence(sentence)) break

        const start = stripped.lastIndexOf(sentence)
        if (start < 0) break
        stripped = stripped.slice(0, start).trim()
    }

    return stripped
}

function stripGenericEngagementLead(response: string) {
    return response
        .replace(/(^|[.!?]\s+)(?:Eğer\s+)?Daha fazla bilgiye ihtiya[çc](?:ın|ınız)?\s+(?:olursa|duyarsan(?:ız)?|varsa),?\s+([\p{L}\p{N}][^.!?\n]{12,220}\?)/giu, '$1$2')
        .replace(/(^|[.!?]\s+)(?:Eğer\s+)?Daha fazla bilgi(?: almak)?\s+istersen(?:iz)?,?\s+([\p{L}\p{N}][^.!?\n]{12,220}\?)/giu, '$1$2')
        .replace(/(^|[.!?]\s+)(?:Detaylı|Daha fazla)\s+(?:bilgi|detay)(?: almak)?\s+istersen(?:iz)?,?\s+([\p{L}\p{N}][^.!?\n]{12,220}\?)/giu, '$1$2')
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

function extractAbbreviationRequestCandidate(userMessage: string) {
    if (!isAbbreviationExpansionQuestion(normalizeSearch(userMessage))) return null

    const stopwords = new Set([
        'hangi',
        'program',
        'programin',
        'programın',
        'birim',
        'birimi',
        'kisaltma',
        'kısaltma',
        'kisaltmasi',
        'kısaltması',
        'olabilir',
        'nedir',
        'ne',
        'demek',
        'anlama',
        'ifade',
        'ediyor'
    ].map(normalizeSearch))
    const tokens = userMessage.match(/[\p{L}\p{N}]{2,8}/gu) ?? []

    for (const token of tokens) {
        const normalized = normalizeSearch(token)
        const compact = normalized.replace(/[^\p{L}\p{N}]+/gu, '')
        if (compact.length < 2 || compact.length > 6) continue
        if (stopwords.has(compact)) continue

        return {
            raw: token,
            compact
        }
    }

    return null
}

function titleInitialismExpansion(candidateCompact: string, title: string) {
    const words = title.match(/[\p{L}\p{N}]{2,}/gu) ?? []
    const normalizedWords = words
        .map((word) => ({
            raw: word,
            normalized: normalizeSearch(word).replace(/[^\p{L}\p{N}]+/gu, '')
        }))
        .filter((word) => word.normalized.length >= 2)

    for (let start = 0; start <= normalizedWords.length - candidateCompact.length; start += 1) {
        const window = normalizedWords.slice(start, start + candidateCompact.length)
        const initials = window.map((word) => word.normalized[0] ?? '').join('')
        if (initials === candidateCompact) {
            return window.map((word) => word.raw).join(' ')
        }
    }

    return null
}

function formatExpansionDisplay(value: string) {
    return value
        .split(/\s+/)
        .map((word) => {
            const lower = word.toLocaleLowerCase('tr-TR')
            return `${lower.slice(0, 1).toLocaleUpperCase('tr-TR')}${lower.slice(1)}`
        })
        .join(' ')
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

function repairAbbreviationExpansionAnswer(input: {
    response: string
    userMessage: string
    responseLanguage: MvpResponseLanguage
    chunks: RagAnswerRepairChunk[]
}) {
    const candidate = extractAbbreviationRequestCandidate(input.userMessage)
    if (!candidate) return null

    const titleMatch = input.chunks
        .map(extractChunkTitle)
        .filter((value): value is string => Boolean(value))
        .map((title) => ({
            title,
            expansion: titleInitialismExpansion(candidate.compact, title)
        }))
        .find((item): item is { title: string; expansion: string } => Boolean(item.expansion))

    if (!titleMatch) return null

    const expansion = formatExpansionDisplay(titleMatch.expansion)
    if (normalizeSearch(input.response).includes(normalizeSearch(expansion))) return null
    if (!isGenericNoInformationResponse(input.response) && normalizeSearch(input.response).length >= 120) return null

    if (input.responseLanguage === 'en') {
        return `"${candidate.raw.toLocaleUpperCase('tr-TR')}" may stand for "${expansion}" in this context.`
    }

    const programSuffix = normalizeSearch(titleMatch.title).includes('program')
        ? ' programının'
        : ''

    return `"${candidate.raw.toLocaleUpperCase('tr-TR')}", ${expansion}${programSuffix} kısaltması olabilir.`
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

function isGenericNoInformationResponse(response: string) {
    const normalized = normalizeSearch(response)

    return normalized.includes('elimde net bilgi yok')
        || normalized.includes('net bilgi elimde yok')
        || normalized.includes('net bilgiye sahip degilim')
        || normalized.includes('net bir bilgiye sahip degilim')
        || normalized.includes('net bir bilgi yok')
        || normalized.includes('bu konuda net bilgi yok')
        || normalized.includes('bilgi yok')
        || normalized.includes('not in the knowledge base')
        || normalized.includes('no_answer')
}

function stripContradictoryNoInformationLead(response: string) {
    const stripped = response
        .replace(/^\s*(?:Ancak[, ]*)?(?:Bu konuda|[^.!?\n]{0,90}?ile ilgili)?\s*(?:elimde net bilgi yok|net bilgi elimde yok|net bilgiye sahip değilim|net bir bilgiye sahip değilim|net bir bilgi yok|bu konuda net bilgi yok)\.?\s*/iu, '')
        .replace(/^\s*(?:Ancak|Ama),?\s*/iu, '')
        .trim()

    if (stripped === response.trim()) return response
    if (stripped.length < 60) return response

    return stripped
}

function stripUnrequestedContactDetails(response: string, userMessage: string) {
    const normalizedUserMessage = normalizeSearch(userMessage)
    if (asksForContactInfo(normalizedUserMessage)) return response
    if (!/(?:e-?posta|@|fakülte sekreteri|fakulte sekreteri|iletişim bilgilerini|iletisim bilgilerini)/iu.test(response)) {
        return response
    }

    const stripped = response
        .replace(/\s*(?:Mazeret sınavı ile ilgili daha fazla bilgi almak isterseniz|Daha fazla bilgi almak isterseniz|Detaylı bilgi ve başvuru için|İsterseniz?)[\s\S]{0,240}(?:E-?posta\s*:\s*\S+)?\.?\s*$/iu, '')
        .replace(/\s*(?:İlgili\s+)?E-?posta(?:\s+adresi)?\s*:\s*\S+\.?/giu, '')
        .trim()

    return stripped.length >= 40 ? stripped : response
}

function stripGenericDeferralTail(response: string, userMessage: string) {
    const normalizedUserMessage = normalizeSearch(userMessage)
    if (asksForContactInfo(normalizedUserMessage)) return response

    const stripped = response
        .replace(/\s*(?:Daha fazla bilgi(?: almak)? istersen(?:iz)?|Daha fazla bilgiye ihtiya[çc](?:ın|ınız) (?:olursa|varsa)|Detaylı bilgi(?: almak)? istersen(?:iz)?|Bu konuda detaylı bilgi(?: almak)? istersen(?:iz)?)[\s\S]{0,280}?(?:iletişime geç(?:meni|menizi|ebilir(?:sin|siniz)?|in|iniz)?(?:i|izi)? öneririm|iletişime geç(?:ebilir(?:sin|siniz)?|in|iniz)|başvur(?:abilir|abilirsiniz)|danış(?:abilir|abilirsiniz))\.?\s*(?:https?:\/\/\S+)?\s*$/iu, '')
        .replace(/\s*(?:Daha fazla bilgi(?: almak)? istersen(?:iz)?|Daha fazla bilgiye ihtiya[çc](?:ın|ınız) (?:olursa|varsa)|Detaylı bilgi(?: almak)? istersen(?:iz)?|Bu konuda detaylı bilgi(?: almak)? istersen(?:iz)?)[\s\S]{0,220}?(?:ulaşabilir(?:sin|siniz)|görebilir(?:sin|siniz)|inceleyebilir(?:sin|siniz))\.?\s*$/iu, '')
        .replace(/\s*(?:Bu nedenle|Bu yüzden|Bunun için),?\s*hangi\s+(?:program|bölüm)[\s\S]{0,180}?(?:olduğuna|olduğunuza|ilgili olduğuna|ilgili olduğunuza)[\s\S]{0,120}?(?:değişebilir|farklılık gösterebilir)\.?\s*(?:Hangi\s+(?:bölüm|program)[\s\S]{0,140}?(?:belirtirsen|belirtirseniz|söylersen|söylerseniz)[\s\S]{0,100}?(?:yardımcı olabilir(?:im|iz)|bilgi verebilir(?:im|iz))[.!?]?)?\s*$/iu, '')
        .replace(/\s*(?:Bu nedenle|Bu yüzden|Bunun için),?[\s\S]{0,260}?(?:ilgili\s+(?:bölüm|birim)|öğrenci işleri)[\s\S]{0,140}?(?:iletişime geç(?:meni|menizi)|danışmanı(?:zı)?|başvurmanı(?:zı)?)\s+öneririm\.?\s*(?:Hangi\s+(?:bölüm|program)[\s\S]{0,140}?(?:belirtirsen|belirtirseniz|söylersen|söylerseniz)[\s\S]{0,100}?yardımcı olabilir(?:im|iz)[.!?]?)?\s*$/iu, '')
        .replace(/\s*(?:Eğer\s+)?(?:daha fazla\s+)?(?:yardıma|bilgiye)\s+ihtiya[çc](?:ın|ınız)?\s+(?:olursa|duyarsan(?:ız)?|varsa)[\s\S]{0,280}?(?:iletişime geç(?:meni|menizi|ebilir(?:sin|siniz)?|in|iniz)?(?:i|izi)? öneririm|iletişime geç(?:ebilir(?:sin|siniz)?|in|iniz)|başvur(?:abilir|abilirsiniz)|danış(?:abilir|abilirsiniz)|bak(?:abilir(?:sin|siniz)?|ın|iniz))\.?\s*(?:İletişim bilgileri için[\s\S]{0,80}?:?\s*https?:\/\/\S+)?\s*$/iu, '')
        .replace(/\s*(?:Bu konuda\s+)?(?:kesin|net|detaylı|daha fazla)\s+bilgi(?:ye ulaşmak| almak)?\s+için\s+ilgili\s+(?:bölüm|fakülte|birim)(?:\s+veya\s+(?:bölüm|fakülte|birim))*[\s\S]{0,140}?(?:iletişime geç(?:meni|menizi)|görüşmeni(?:zi)?|başvurmanı(?:zı)?)\s+öneririm\.?\s*$/iu, '')
        .replace(/\s*(?:Bu konuda\s+)?(?:kesin|net|detaylı|daha fazla)\s+bilgi(?: almak)?\s+için\s+ilgili\s+bölüm(?:ünüz|ünüzün|ün|un)?\s+akademik danışman(?:ı|ıyla|inizle)?\s+(?:görüşmeni(?:zi)?|iletişime geçmeni(?:zi)?)\s+öneririm\.?\s*$/iu, '')
        .replace(/\s*(?:Daha fazla bilgi(?: almak)? istersen(?:iz)?,?\s*)?(?:platforma|sisteme|MEDU'ya|MEDU’ya)[\s\S]{0,180}?(?:derslerinle|ilgili\s+ders)[\s\S]{0,140}?(?:ulaşabilir|erişebilir)[\p{L}]*[.!?]?(?:\s*(?:Eğer\s+)?başka\s+bir\s+konuda[\s\S]{0,120}?lütfen\s+belirt(?:in|iniz)?[.!?]?)?\s*$/iu, '')
        .replace(/\s*(?:Daha fazla bilgi(?: almak)? (?:için|istersen(?:iz)?)|Detaylı bilgi(?: almak)? için)[\s\S]{0,180}?:?\s*https?:\/\/\S+\s*$/iu, '')
        .replace(/\s*(?:Daha fazla bilgiye ihtiya[çc](?:ın|ınız) olursa|Daha fazla bilgi(?: almak)? istersen(?:iz)?),?\s*(?:buradan|şu bağlantıdan|bu bağlantıdan|linkten)?\s*(?:ulaşabilir(?:sin|siniz)|göz atabilir(?:sin|siniz))?:?\s*https?:\/\/\S+\s*$/iu, '')
        .replace(/\s*(?:Eğer\s+)?(?:daha fazla\s+)?(?:yardıma|bilgiye)\s+ihtiya[çc](?:ın|ınız)?\s+(?:olursa|duyarsan(?:ız)?|varsa),?\s*[\s\S]{0,180}?(?:iletişime geç(?:ebilir(?:sin|siniz)?|in|iniz)|göz atabilir(?:sin|siniz)|inceleyebilir(?:sin|siniz)|ziyaret edebilir(?:sin|siniz))\.?:?\s*(?:[\p{L}\p{N}\s]+hakkında\s+)?https?:\/\/\S+\s*$/iu, '')
        .replace(/\s*(?:İletişim bilgileri için|Detaylı bilgi için)[\s\S]{0,120}?:?\s*https?:\/\/\S+\s*$/iu, '')
        .trim()

    return stripped.length >= 40 ? stripped : response
}

function sanitizeRagAnswerForReturn(response: string, userMessage: string) {
    const withoutContradiction = stripContradictoryNoInformationLead(response)
    const withoutUnrequestedContact = stripUnrequestedContactDetails(withoutContradiction, userMessage)
    const withoutGenericEngagementLead = stripGenericEngagementLead(withoutUnrequestedContact)
    const withoutClosing = stripGenericAssistantClosingTail(withoutGenericEngagementLead)
    const withoutDeferral = stripGenericDeferralTail(withoutClosing, userMessage)

    return stripGenericAssistantClosingTail(
        withoutDeferral
    )
        .replace(/^[\s,.;:!?]+/u, '')
        .replace(/^(?:Ancak|Ama),?\s+/iu, '')
        .trim()
}

const DURATION_VALUE_PATTERN = [
    '\\d+',
    'bir',
    'iki',
    'uc',
    'dort',
    'bes',
    'alti',
    'yedi',
    'sekiz',
    'dokuz',
    'on',
    'on\\s+bes',
    'yirmi',
    'otuz'
].join('|')
const DURATION_UNIT_PATTERN = '(?:is\\s+gunu|gunu|gun|hafta|ay|yil|saat|dakika)(?:dur|dir|tir)?'
const DURATION_VALUE_REGEX = new RegExp(`\\b(?:${DURATION_VALUE_PATTERN})\\s+(?:\\([^)]*\\)\\s*)?${DURATION_UNIT_PATTERN}\\b`, 'giu')
const DURATION_QUERY_SUBJECT_STOPWORDS = new Set([
    'sure',
    'sures',
    'suresi',
    'kadar',
    'kac',
    'kaç',
    'hak',
    'hakk',
    'hakki',
    'hakkı',
    'azami',
    'fazla',
    'cok',
    'çok',
    'gec',
    'geç',
    'ne',
    'nedir',
    'midir',
    'mi',
    'var',
    'program',
    'programi',
    'programı',
    'programinda',
    'programında',
    'bolum',
    'bölüm',
    'bolumu',
    'bölümü',
    'fakulte',
    'fakülte',
    'fakultesi',
    'fakültesi',
    'gun',
    'gün',
    'gunu',
    'günü',
    'hafta',
    'ay',
    'yil',
    'yıl',
    'saat',
    'dakika'
])
const DURATION_QUERY_ACTOR_TOKENS = new Set([
    'aday',
    'akademik',
    'calisan',
    'idari',
    'ogrenci',
    'personel'
])
const DURATION_QUERY_GENERIC_SUBJECT_TOKENS = new Set([
    'basvuru',
    'egitim',
    'izin',
    'muafiyet',
    'rapor',
    'sinav',
    'staj'
])

function stemDurationToken(token: string) {
    const normalized = normalizeSearch(token)
    const suffixes = [
        'lerinin',
        'larinin',
        'lerini',
        'larini',
        'sinin',
        'sini',
        'sina',
        'sine',
        'ini',
        'ina',
        'ine',
        'nin',
        'in',
        'un',
        'leri',
        'lari',
        'ler',
        'lar',
        'si'
    ]

    for (const suffix of suffixes) {
        if (normalized.endsWith(suffix) && normalized.length - suffix.length >= 4) {
            return normalized.slice(0, -suffix.length)
        }
    }

    return normalized
}

function durationSubjectTokens(value: string) {
    const normalized = normalizeSearch(value)
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .trim()
    if (!normalized) return []

    const tokens = normalized
        .split(/\s+/)
        .map(stemDurationToken)
        .filter((token) => token.length >= 3 && !DURATION_QUERY_SUBJECT_STOPWORDS.has(token))

    return Array.from(new Set(tokens)).slice(0, 6)
}

function asksForPolicyDuration(normalizedUserMessage: string) {
    const asksAmount = includesAny(normalizedUserMessage, [
        'ne kadar',
        'nedir',
        'kac',
        'kaç',
        'azami',
        'en fazla',
        'en cok'
    ])
    const mentionsDurationTopic = normalizedUserMessage.includes('sure')
        || normalizedUserMessage.includes('suresi')

    return (mentionsDurationTopic && asksAmount)
        || normalizedUserMessage.includes('azami')
        || normalizedUserMessage.includes('en fazla')
        || normalizedUserMessage.includes('en cok')
        || /\b(?:kac|ne kadar)\s+(?:is\s+gunu|gun|hafta|ay|yil|saat|dakika)\b/i.test(normalizedUserMessage)
        || normalizedUserMessage.includes('ne kadar')
            && includesAny(normalizedUserMessage, ['izin', 'rapor', 'sinav', 'basvuru', 'staj', 'egitim', 'muafiyet'])
}

function compactDurationEvidence(value: string) {
    return normalizeSearch(value).replace(/[^\p{L}\p{N}]+/gu, '')
}

function normalizeCompactDurationValue(value: string) {
    return value.replace(/(isgunu|gunu|gun|hafta|ay|yil|saat|dakika)(?:dur|dir|tir)$/iu, '$1')
}

function extractDurationValues(value: string) {
    DURATION_VALUE_REGEX.lastIndex = 0
    return Array.from(normalizeSearch(value).matchAll(DURATION_VALUE_REGEX))
        .map((match) => normalizeCompactDurationValue(compactDurationEvidence(match[0] ?? '')))
        .filter(Boolean)
}

function likelyAnswerDurationValues(evidenceSentence: string, userMessage: string) {
    const normalizedUserMessage = normalizeSearch(userMessage)
    const userDurations = new Set(extractDurationValues(userMessage))
    const evidenceDurations = extractDurationValues(evidenceSentence)
    const nonQuestionDurations = evidenceDurations.filter((duration) => !userDurations.has(duration))
    const asksForDayCountFromYearThreshold = (
        (normalizedUserMessage.includes('gun') || normalizedUserMessage.includes('is gunu'))
        && normalizedUserMessage.includes('yil')
    )
        || /\b(?:kac|ne kadar)\b[\s\S]{0,80}\b(?:gun|is gunu)\b/i.test(normalizedUserMessage)

    const answerDurations = asksForDayCountFromYearThreshold
        ? nonQuestionDurations.filter((duration) => duration.includes('gun'))
        : nonQuestionDurations

    return answerDurations.length > 0 ? answerDurations : evidenceDurations
}

function responseAnswerDurationValues(response: string, userMessage: string) {
    const normalizedUserMessage = normalizeSearch(userMessage)
    const userDurations = new Set(extractDurationValues(userMessage))
    const responseDurations = extractDurationValues(response)
        .filter((duration) => !userDurations.has(duration))
    const asksForDayCountFromYearThreshold = (
        (normalizedUserMessage.includes('gun') || normalizedUserMessage.includes('is gunu'))
        && normalizedUserMessage.includes('yil')
    )
        || /\b(?:kac|ne kadar)\b[\s\S]{0,80}\b(?:gun|is gunu)\b/i.test(normalizedUserMessage)

    return asksForDayCountFromYearThreshold
        ? responseDurations.filter((duration) => duration.includes('gun'))
        : responseDurations
}

function retrievedEvidenceSupportsAnswerDuration(response: string, userMessage: string, chunks: RagAnswerRepairChunk[]) {
    const answerDurations = responseAnswerDurationValues(response, userMessage)
    if (answerDurations.length === 0) return false

    return chunks.some((chunk) => {
        const compactContent = compactDurationEvidence(chunk.content)
        return answerDurations.some((duration) => compactContent.includes(duration))
    })
}

function responseHasAnswerDuration(response: string, evidenceSentence: string, userMessage: string) {
    const compactResponse = compactDurationEvidence(response)
    const answerDurations = Array.from(new Set(likelyAnswerDurationValues(evidenceSentence, userMessage)))
    if (answerDurations.length === 0) return false

    const userDurations = extractDurationValues(userMessage)
    if (userDurations.length === 0 && answerDurations.length > 1) {
        return answerDurations.every((duration) => compactResponse.includes(duration))
    }

    return answerDurations.some((duration) => compactResponse.includes(duration))
}

function durationEvidencePriority(userMessage: string, evidenceSentence: string) {
    const normalizedUserMessage = normalizeSearch(userMessage)
    const normalizedEvidence = normalizeSearch(evidenceSentence)
    let score = 0

    if (normalizedUserMessage.includes('yillik') && normalizedUserMessage.includes('izin')) {
        if (
            normalizedEvidence.includes('14 is gunu')
            && normalizedEvidence.includes('20 is gunu')
            && normalizedEvidence.includes('26 is gunu')
        ) {
            score += 8
        }
        if (normalizedEvidence.includes('hizmet') && normalizedEvidence.includes('yil')) {
            score += 1.5
        }
        if (normalizedEvidence.includes('talep formu') || normalizedEvidence.includes('onceden')) {
            score -= 4
        }
    }

    return score
}

function durationSubjectCoverage(tokens: string[], value: string) {
    if (tokens.length === 0) return 0
    const normalized = normalizeSearch(value)
    const normalizedTokens = new Set(
        normalized
            .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
            .split(/\s+/)
            .filter(Boolean)
            .flatMap((token) => [token, stemDurationToken(token)])
    )
    const hits = tokens.filter((token) => durationTokenMatches(token, normalized, normalizedTokens)).length
    return hits / tokens.length
}

function durationRequiredSubjectTokens(tokens: string[]) {
    return tokens.filter((token) => (
        !DURATION_QUERY_ACTOR_TOKENS.has(token)
        && !DURATION_QUERY_GENERIC_SUBJECT_TOKENS.has(token)
    ))
}

function durationHasRequiredSubjectTokens(tokens: string[], value: string) {
    if (tokens.length === 0) return true
    const normalized = normalizeSearch(value)
    const normalizedTokens = new Set(
        normalized
            .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
            .split(/\s+/)
            .filter(Boolean)
            .flatMap((token) => [token, stemDurationToken(token)])
    )

    return tokens.every((token) => durationTokenMatches(token, normalized, normalizedTokens))
}

function durationTokenMatches(token: string, normalizedValue: string, normalizedTokens: Set<string>) {
    if (normalizedTokens.has(token) || normalizedValue.includes(token)) return true
    if (!/^[a-z]{2,6}$/.test(token)) return false

    const valueTokens = normalizedValue
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .split(/\s+/)
        .filter((valueToken) => valueToken.length >= 2)

    for (let start = 0; start <= valueTokens.length - token.length; start += 1) {
        const initials = valueTokens
            .slice(start, start + token.length)
            .map((valueToken) => valueToken[0] ?? '')
            .join('')
        if (initials === token) return true
    }

    return false
}

function cleanDurationEvidenceSentence(value: string) {
    return value
        .replace(/^(?:Madde|MADDE)\s+\d+\s*[-–—]?\s*/u, '')
        .replace(/^[a-zçğıöşü]\)\s*/iu, '')
        .replace(/\s+/g, ' ')
        .replace(/[;,.!?]+$/g, '')
        .trim()
}

function splitDurationCandidateSentences(content: string) {
    return content
        .replace(/^(?:Page|Document) Title:\s*.*$/gim, ' ')
        .replace(/^Source URL:\s*.*$/gim, ' ')
        .replace(/^Section:\s*.*$/gim, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(/(?<=[.!?])\s+|(?=(?:^|\s)[a-zçğıöşü]\)\s+)/iu)
        .map(cleanDurationEvidenceSentence)
        .filter((sentence) => sentence.length >= 24)
}

function splitDurationListCandidates(content: string) {
    return content
        .replace(/^(?:Page|Document) Title:\s*.*$/gim, ' ')
        .replace(/^Source URL:\s*.*$/gim, ' ')
        .replace(/^Section:\s*.*$/gim, ' ')
        .split(/\r?\n|(?<=[.!?])\s+|(?=\s*(?:[•*]|[-–—])\s+)|(?=\s+[a-zçğıöşü]\)\s+)/iu)
        .map((line) => cleanDurationEvidenceSentence(line.replace(/^\s*(?:[•*]|[-–—])\s*/u, '')))
        .filter((line) => line.length >= 12)
}

function finishDurationEvidenceSentence(value: string) {
    let cleaned = cleanDurationEvidenceSentence(value)
    if (/\biş günü$/iu.test(cleaned)) {
        cleaned = `${cleaned}dür`
    } else if (/\bgün$/iu.test(cleaned)) {
        cleaned = `${cleaned}dür`
    } else if (/\byıl$/iu.test(cleaned)) {
        cleaned = `${cleaned}dır`
    }

    return /[.!?]$/u.test(cleaned) ? cleaned : `${cleaned}.`
}

function finishDurationEvidenceList(values: string[]) {
    const cleanedValues = values
        .map(cleanDurationEvidenceSentence)
        .map((value) => value.replace(/[.!?]+$/u, '').trim())
        .filter(Boolean)
    if (cleanedValues.length === 0) return null

    return finishDurationEvidenceSentence(cleanedValues.join('; '))
}

function compactInternshipDurationTableCandidate(value: string, userMessage: string) {
    const normalizedUserMessage = normalizeSearch(userMessage)
    const normalizedValue = normalizeSearch(value)
    if (!/\bstaj\w*\b/i.test(normalizedUserMessage)) return null
    if (!/\byaz\s+staj/i.test(normalizedValue)) return null

    const normalizedCandidate = cleanDurationEvidenceSentence(value)
    const courseDurationMatch = normalizedCandidate.match(
        /((?:[\p{Lu}ÇĞİÖŞÜ]{2,12}\s*)?\d{2,4}\s+Yaz\s+Stajı)\s*\(\s*(\d+\s+iş\s+günü)\s*\)/u
    )
    if (courseDurationMatch?.[1] && courseDurationMatch[2]) {
        return finishDurationEvidenceSentence(`${courseDurationMatch[1].trim()} ${courseDurationMatch[2].trim()}`)
    }

    const labelledDurationMatch = normalizedCandidate.match(
        /((?:[\p{L}\p{N}]+\s+){0,5}Yaz\s+Stajı)\s*[:：-]?\s*(?:dersi\s*)?(?:\(?\s*)?(\d+\s+iş\s+günü)\)?/iu
    )
    if (labelledDurationMatch?.[1] && labelledDurationMatch[2]) {
        return finishDurationEvidenceSentence(`${labelledDurationMatch[1].trim()} ${labelledDurationMatch[2].trim()}`)
    }

    return null
}

function extractPolicyDurationEvidenceSentence(content: string, subjectTokens: string[], requiredSubjectTokens: string[]) {
    for (const sentence of splitDurationCandidateSentences(content)) {
        const normalizedSentence = normalizeSearch(sentence)
        DURATION_VALUE_REGEX.lastIndex = 0
        if (!DURATION_VALUE_REGEX.test(normalizedSentence)) continue
        if (!durationHasRequiredSubjectTokens(requiredSubjectTokens, sentence)) continue
        if (subjectTokens.length > 0 && durationSubjectCoverage(subjectTokens, sentence) < 0.6) continue

        return `${sentence}.`
    }

    return null
}

function extractPolicyDurationListEvidenceSentence(
    content: string,
    userMessage: string,
    subjectTokens: string[],
    requiredSubjectTokens: string[]
) {
    if (!durationHasRequiredSubjectTokens(requiredSubjectTokens, content)) return null
    if (subjectTokens.length > 0 && durationSubjectCoverage(subjectTokens, content) < 0.45) return null

    const userDurations = new Set(extractDurationValues(userMessage))
    const matchingCandidates: string[] = []
    for (const candidate of splitDurationListCandidates(content)) {
        const normalizedCandidate = normalizeSearch(candidate)
        DURATION_VALUE_REGEX.lastIndex = 0
        if (!DURATION_VALUE_REGEX.test(normalizedCandidate)) continue

        const candidateDurations = extractDurationValues(candidate)
        if (userDurations.size > 0 && !candidateDurations.some((duration) => userDurations.has(duration))) continue
        if (likelyAnswerDurationValues(candidate, userMessage).length === 0) continue

        matchingCandidates.push(compactInternshipDurationTableCandidate(candidate, userMessage) ?? candidate)
    }

    if (matchingCandidates.length === 0) return null
    if (userDurations.size === 0 && matchingCandidates.length > 1) {
        return finishDurationEvidenceList(matchingCandidates)
    }

    return finishDurationEvidenceSentence(matchingCandidates[0] ?? '')
}

function personalizeDurationEvidenceSentence(sentence: string, normalizedUserMessage: string) {
    if (normalizedUserMessage.includes('personel') && /^Ücretsiz\s+izin\s+süresi/iu.test(sentence)) {
        return sentence.replace(/^Ücretsiz\s+izin\s+süresi/iu, 'Personelin ücretsiz izin süresi')
    }

    return sentence
}

function repairPolicyDurationAnswer(input: {
    response: string
    userMessage: string
    responseLanguage: MvpResponseLanguage
    chunks: RagAnswerRepairChunk[]
}) {
    const normalizedUserMessage = normalizeSearch(input.userMessage)
    if (!asksForPolicyDuration(normalizedUserMessage)) return null

    const subjectTokens = durationSubjectTokens(normalizedUserMessage)
    const requiredSubjectTokens = durationRequiredSubjectTokens(subjectTokens)
    const evidenceCandidates = [
        ...input.chunks
        .map((chunk) => extractPolicyDurationListEvidenceSentence(chunk.content, input.userMessage, subjectTokens, requiredSubjectTokens))
        .filter((value): value is string => Boolean(value)),
        ...input.chunks
        .map((chunk) => extractPolicyDurationEvidenceSentence(chunk.content, subjectTokens, requiredSubjectTokens))
        .filter((value): value is string => Boolean(value))
    ]
    const evidenceSentence = evidenceCandidates
        .sort((left, right) => durationEvidencePriority(input.userMessage, right) - durationEvidencePriority(input.userMessage, left))
        [0]
    if (!evidenceSentence && retrievedEvidenceSupportsAnswerDuration(input.response, input.userMessage, input.chunks)) return null
    if (!evidenceSentence) return null
    if (responseHasAnswerDuration(input.response, evidenceSentence, input.userMessage)) return null

    if (input.responseLanguage === 'en') {
        return `According to the retrieved policy: ${evidenceSentence}`
    }

    return personalizeDurationEvidenceSentence(evidenceSentence, normalizedUserMessage)
}

function asksForMedicineElectiveRule(normalizedUserMessage: string) {
    return (normalizedUserMessage.includes('tip fakultesi') || normalizedUserMessage.includes('tip fakultesinde') || normalizedUserMessage.includes('tipte'))
        && normalizedUserMessage.includes('secmeli')
}

function extractMedicineElectiveRule(content: string): string | null {
    const flattened = content.replace(/\s+/g, ' ').trim()
    const match = flattened.match(/Öğrenciler,\s*Fakülte müfredatında yer alan Seçmeli derslerden Dönem VI sonuna kadar başarılı olmalıdırlar/iu)
    if (!match?.[0]) return null

    return 'Tıp Fakültesinde öğrenciler, fakülte müfredatında yer alan seçmeli derslerden Dönem VI sonuna kadar başarılı olmalıdır.'
}

function repairMedicineElectiveAnswer(input: {
    response: string
    userMessage: string
    chunks: RagAnswerRepairChunk[]
}) {
    const normalizedUserMessage = normalizeSearch(input.userMessage)
    if (!asksForMedicineElectiveRule(normalizedUserMessage)) return null

    const evidence = input.chunks
        .map((chunk) => extractMedicineElectiveRule(chunk.content))
        .find((value): value is string => Boolean(value))
    if (!evidence) return null

    const normalizedResponse = normalizeSearch(input.response)
    if (normalizedResponse.includes('donem vi') && normalizedResponse.includes('secmeli')) return null

    return evidence
}

function asksForElectiveCourseRequirement(normalizedUserMessage: string) {
    return normalizedUserMessage.includes('secmeli')
        && includesAny(normalizedUserMessage, [
            'kac',
            'kadar',
            'mezun',
            'almaliy',
            'gecmem',
            'gecmeli',
            'basarili',
            'sayisi',
            'sayisina',
            'belirliyor',
            'belirlen',
            'nasil'
        ])
}

function extractElectiveCourseRequirementEvidence(content: string) {
    const flattened = content.replace(/\s+/g, ' ').trim()
    const match = flattened.match(/Seçmeli derslerin hangi derslerden oluşacağına,[\s\S]{0,340}?(?:Fakülte|Yüksekokul) Kurulu karar verir\./iu)
        ?? flattened.match(/Seçmeli derslerin hangi derslerden oluşacağına,[\s\S]{0,340}?(?:Kurulu kararı ile belirlenir|kurulu kararı ile belirlenir)\./iu)
        ?? flattened.match(/Seçmeli ders sayısına,[\s\S]{0,260}?(?:Fakülte|Yüksekokul) Kurulu karar verir\./iu)
        ?? flattened.match(/Seçmeli derslerin sayısı,[\s\S]{0,260}?(?:Fakülte|Yüksekokul|Bölüm|Program) Kurulu tarafından belirlenir[\s\S]{0,120}?\./iu)
        ?? flattened.match(/alınması gereken seçmeli ders sayısı[\s\S]{0,260}?(?:Fakülte|Yüksekokul|Bölüm|Program) Kurulu tarafından belirlenir[\s\S]{0,120}?\./iu)
    if (!match?.[0]) return null

    return cleanExtractedInlineValue(match[0])
}

function repairElectiveCourseRequirementAnswer(input: {
    response: string
    userMessage: string
    chunks: RagAnswerRepairChunk[]
}) {
    const normalizedUserMessage = normalizeSearch(input.userMessage)
    if (!asksForElectiveCourseRequirement(normalizedUserMessage)) return null

    const evidence = input.chunks
        .map((chunk) => extractElectiveCourseRequirementEvidence(chunk.content))
        .find((value): value is string => Boolean(value))
    if (!evidence) return null

    const normalizedResponse = normalizeSearch(input.response)
    const alreadyGrounded = normalizedResponse.includes('secmeli ders')
        && includesAny(normalizedResponse, ['fakulte kurulu', 'yuksekokul kurulu', 'secmeli ders kurulu', 'donem vi', 'ogretim plan'])
    if (alreadyGrounded) return null

    return evidence
}

function asksForPassWithoutFinal(normalizedUserMessage: string) {
    return normalizedUserMessage.includes('final')
        && includesAny(normalizedUserMessage, ['girmeden', 'girmeksizin'])
        && includesAny(normalizedUserMessage, ['gec', 'basari', 'tamamla'])
}

function hasMedicineFinalExemptionEvidence(content: string) {
    const normalized = normalizeSearch(content).replace(/\s+/g, ' ')
    const hasSixtyEachBoardExam = normalized.includes('ders kurulu sinav')
        && normalized.includes('en az 60')
    const hasEightyBoardScore = /donem ici kurul not\w*(?:\s+\w+){0,16}\s+80/i.test(normalized)
        || /80(?:\s+\w+){0,16}\s+donem ici kurul not/i.test(normalized)
    const hasFinalExemptionAction = includesAny(normalized, [
        'final sinavina girmeksizin',
        'final sinavina girmeden',
        'final sinavina girmeyebilir',
        'final sinavina girmek zorunda degil',
        'final sinavindan muaf'
    ])

    return hasSixtyEachBoardExam && hasEightyBoardScore && hasFinalExemptionAction
}

function repairMedicineFinalExemptionAnswer(input: {
    response: string
    userMessage: string
    chunks: RagAnswerRepairChunk[]
}) {
    const normalizedUserMessage = normalizeSearch(input.userMessage)
    if (!asksForPassWithoutFinal(normalizedUserMessage)) return null
    if (!input.chunks.some((chunk) => hasMedicineFinalExemptionEvidence(chunk.content))) return null

    const normalizedResponse = normalizeSearch(input.response)
    if (normalizedResponse.includes('80') && normalizedResponse.includes('60') && !normalizedResponse.includes('mumkun degil')) return null

    return 'Ders kurulu sınav notlarının her biri en az 60 ve dönem içi kurul notu 80 veya üzerindeyse öğrenci isterse dönem sonu final sınavına girmeden dönemi başarıyla tamamlamış kabul edilir.'
}

function asksForAddressOrCampus(normalizedUserMessage: string) {
    if (asksForLectureNotesAccess(normalizedUserMessage)) return false
    if (includesAny(normalizedUserMessage, ['e posta', 'eposta', 'mail', 'email', 'telefon', 'iletisim', 'sorumlu', 'program baskani', 'program sorumlusu'])) return false

    return includesAny(normalizedUserMessage, ['adres', 'kampus', 'kampusu', 'yerleske', 'konum', 'ulasim'])
        || /\bnerede\b/u.test(normalizedUserMessage)
        || /\bnerde\b/u.test(normalizedUserMessage)
}

function cleanExtractedInlineValue(value: string) {
    return value
        .replace(/\s+/g, ' ')
        .replace(/\bNo\s+:\s*/giu, 'No:')
        .replace(/\s+([,.;!?])/g, '$1')
        .replace(/[;,:.\s]+$/g, '')
        .trim()
}

function extractAddress(content: string) {
    const match = content.match(/Adres\s*[:：]\s*([\s\S]{8,220}?)(?=\s+(?:Telefon|Tel\.?|E-?Mail|E-?posta|İnternet|Internet|Sayfa|Doküman|Dokuman|Revizyon|$))/iu)
    if (!match?.[1]) return null

    const address = cleanExtractedInlineValue(match[1])
    return address.length >= 12 ? address : null
}

function hasStreetAddressShape(value: string) {
    const normalized = normalizeSearch(value)

    return (
        normalized.includes('mahalle')
        || normalized.includes('mahallesi')
        || normalized.includes('bulvar')
        || normalized.includes('cadde')
        || normalized.includes('caddesi')
        || normalized.includes('sokak')
        || normalized.includes('sk')
    ) && (
        normalized.includes('no:')
        || normalized.includes('no ')
        || /\b\d{5}\b/.test(normalized)
    )
}

function isGenericRectorateFooterAddress(value: string) {
    const normalized = normalizeSearch(value)

    return normalized.includes('yuksek ihtisas universitesi rektorlugu')
        && /\b06530\b/.test(normalized)
        && !hasStreetAddressShape(value)
}

function extractSbfCampusAddress(content: string) {
    const updateMatch = content.match(/SAĞLIK\s+BİLİMLERİ\s+FAKÜLTESİ[\s\S]{0,500}?BAĞLICA\s+YERLEŞKESİ\s*:?\s*([\s\S]{8,180}?)(?=\n\s*\n|SPOR\s+BİLİMLERİ|MESLEK\s+YÜKSEKOKULU|SAĞLIK\s+HİZMETLERİ|Son\s+Duyurular|$)/iu)
    if (updateMatch?.[1]) {
        const address = cleanExtractedInlineValue(updateMatch[1])
        if (address.length >= 12) return address
    }

    const faqMatch = content.match(/Balgat\s+yerleşkesi\s*\(\s*Sağlık\s+Bilimleri\s+Fakültesi\s*\)\s*([\s\S]{8,180}?)(?=\n\s*Tel|Tel\s*:|Bağlum\s+Yerleşkesi|$)/iu)
    if (faqMatch?.[1]) {
        const address = cleanExtractedInlineValue(faqMatch[1])
        if (address.length >= 12) return address
    }

    const moveMatch = content.match(/Sağlık\s+Bilimleri\s+Fakülte(?:si|miz)[\s\S]{0,180}?Bağlıca\s+Yerleşkes(?:i|ine)[\s\S]{0,120}?(?:Taşındı|sürdürecek)/iu)
    if (moveMatch) return 'Bağlıca Yerleşkesi'

    return null
}

function extractShmyoCampusAddress(content: string) {
    const updateMatch = content.match(/SAĞLIK\s+HİZMETLERİ\s+MESLEK\s+YÜKSEKOKULU[\s\S]{0,500}?BAĞLUM\s+YERLEŞKESİ\s*:?\s*([\s\S]{8,180}?)(?=\n\s*\n|SPOR\s+BİLİMLERİ|MESLEK\s+YÜKSEKOKULU|SAĞLIK\s+BİLİMLERİ|Son\s+Duyurular|$)/iu)
    if (updateMatch?.[1]) {
        const address = cleanExtractedInlineValue(updateMatch[1])
        if (address.length >= 12) return address
    }

    return null
}

function extractCampusAddress(content: string, normalizedUserMessage: string) {
    if (normalizedUserMessage.includes('sbf') || normalizedUserMessage.includes('saglik bilimleri')) {
        return extractSbfCampusAddress(content)
    }
    if (normalizedUserMessage.includes('shmyo') || normalizedUserMessage.includes('saglik hizmetleri')) {
        return extractShmyoCampusAddress(content)
    }
    if (
        normalizedUserMessage.includes('tlt')
        || (normalizedUserMessage.includes('tibbi') && normalizedUserMessage.includes('laboratuvar') && normalizedUserMessage.includes('teknik'))
    ) {
        const match = content.match(/Yerleşke\s*[:：]\s*(Balgat\s+Yerleşkesi|Bağlum\s+Yerleşkesi|Bağlıca\s+Yerleşkesi)/iu)
        if (match?.[1]) return cleanExtractedInlineValue(match[1])
    }

    return null
}

function addressSubject(userMessage: string, chunks: RagAnswerRepairChunk[]) {
    const normalizedUserMessage = normalizeSearch(userMessage)
    if (normalizedUserMessage.includes('sbf') || normalizedUserMessage.includes('saglik bilimleri')) {
        return 'Sağlık Bilimleri Fakültesi'
    }
    if (normalizedUserMessage.includes('shmyo') || normalizedUserMessage.includes('saglik hizmetleri')) {
        return 'Sağlık Hizmetleri Meslek Yüksekokulu'
    }
    if (
        normalizedUserMessage.includes('tlt')
        || (normalizedUserMessage.includes('tibbi') && normalizedUserMessage.includes('laboratuvar') && normalizedUserMessage.includes('teknik'))
    ) {
        return 'Tıbbi Laboratuvar Teknikleri Programı'
    }

    const title = chunks
        .map(extractChunkTitle)
        .find((value): value is string => Boolean(value))

    return title?.replace(/\s+(?:Yönergesi|Yönetmeliği|Bilgi Notu)$/i, '') || 'İlgili birim'
}

function responseContainsAddress(response: string, address: string) {
    const normalizedResponse = normalizeSearch(response)
    const addressTokens = normalizeSearch(address)
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 4 || /^\d{4,}$/.test(token))

    if (addressTokens.length === 0) return false

    const numericAddressTokens = addressTokens.filter((token) => /^\d{4,}$/.test(token))
    if (numericAddressTokens.some((token) => !normalizedResponse.includes(token))) {
        return false
    }

    const hits = addressTokens.filter((token) => normalizedResponse.includes(token)).length
    return hits / addressTokens.length >= 0.9
}

function repairAddressAnswer(input: {
    response: string
    userMessage: string
    chunks: RagAnswerRepairChunk[]
}) {
    const normalizedUserMessage = normalizeSearch(input.userMessage)
    if (!asksForAddressOrCampus(normalizedUserMessage)) return null

    const campusAddress = input.chunks
        .map((chunk) => extractCampusAddress(chunk.content, normalizedUserMessage))
        .find((value): value is string => Boolean(value))
    const address = campusAddress ?? input.chunks
        .map((chunk) => extractAddress(chunk.content))
        .find((value): value is string => typeof value === 'string' && !isGenericRectorateFooterAddress(value))
        ?? input.chunks
            .map((chunk) => extractAddress(chunk.content))
            .find((value): value is string => Boolean(value))
    if (!address) return null
    if (responseContainsAddress(input.response, address)) return null

    const label = campusAddress && !hasStreetAddressShape(campusAddress) ? 'yerleşkesi' : 'adresi'
    return `${addressSubject(input.userMessage, input.chunks)} ${label}: ${address}.`
}

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PHONE_REGEX = /(?:\+?\s*90\s*)?\(?\s*312\s*\)?[\s.-]*\d{3}[\s.-]*\d{2}\s*\d{2}|444\s*9\s*844/i

type ContactEvidence = {
    email: string | null
    phone: string | null
    subject: string
    personName: string | null
}

function asksForContactInfo(normalizedUserMessage: string) {
    return includesAny(normalizedUserMessage, [
        'iletisim',
        'telefon',
        'e posta',
        'eposta',
        'mail',
        'email',
        'sorumlu',
        'program baskani',
        'program sorumlusu'
    ])
        || /\bkim\b/u.test(normalizedUserMessage)
}

function contactSubjectFromContent(content: string, userMessage: string) {
    const normalizedContent = normalizeSearch(content)
    const normalizedUserMessage = normalizeSearch(userMessage)

    if (normalizedUserMessage.includes('kutuphane')) {
        return 'Kütüphane ve Dokümantasyon Daire Başkanlığı'
    }

    if (
        normalizedContent.includes('tibbi laboratuvar teknikleri programi')
        || normalizedUserMessage.includes('tibbi laboratuvar teknikleri')
        || normalizedUserMessage.includes('tlt')
    ) {
        return 'Tıbbi Laboratuvar Teknikleri Programı'
    }

    const titleMatch = content.match(/^\s*([^\n\r]{6,90}Program[^\n\r]*)$/imu)
    return cleanExtractedInlineValue(titleMatch?.[1] ?? 'İlgili program')
}

function targetProgramEmail(userMessage: string, content: string) {
    if (!contactSubjectFromContent(content, userMessage).includes('Tıbbi Laboratuvar Teknikleri')) return null

    return content.match(/tlt@yiu\.edu\.tr/i)?.[0] ?? null
}

function targetUnitEmail(userMessage: string, content: string) {
    const normalizedUserMessage = normalizeSearch(userMessage)
    if (normalizedUserMessage.includes('kutuphane')) {
        return content.match(/kutuphane@yuksekihtisas\.edu\.tr/i)?.[0] ?? null
    }

    return null
}

function extractTltDoubleMajorResponsibleContact(content: string, userMessage: string): ContactEvidence | null {
    const normalizedUserMessage = normalizeSearch(userMessage)
    if (!asksForTltDoubleMajor(normalizedUserMessage) || !normalizedUserMessage.includes('sorumlu')) return null

    const match = content.match(/Tıbbi\s+Laboratuvar\s+Teknikleri\s+(Doç\.\s*Dr\.\s*Esma\s*Sari\s*Üzek)\s+(esmasariuzek@yiu\.edu\.tr)/iu)
    if (!match?.[1] || !match[2]) return null

    return {
        email: cleanExtractedInlineValue(match[2]),
        phone: null,
        subject: 'Tıbbi Laboratuvar Teknikleri Çift Anadal Programı sorumlusu',
        personName: cleanExtractedInlineValue(match[1])
    }
}

function formatPhoneNumber(value: string) {
    const digits = value.replace(/\D+/g, '')
    if (digits === '903123291010') return '+90 312 329 10 10'
    if (digits === '03123291010') return '+90 312 329 10 10'
    if (digits === '3123291010') return '+90 312 329 10 10'

    return cleanExtractedInlineValue(value).replace(/^\(+/, '').replace(/\(\s*\+/g, '+')
}

function extractPhoneNearEmail(content: string, email: string | null) {
    if (email) {
        const emailIndex = content.toLocaleLowerCase('tr-TR').indexOf(email.toLocaleLowerCase('tr-TR'))
        if (emailIndex >= 0) {
            const nearby = content.slice(Math.max(0, emailIndex - 180), Math.min(content.length, emailIndex + 120))
            const nearbyPhone = nearby.match(PHONE_REGEX)?.[0]
            if (nearbyPhone) return formatPhoneNumber(nearbyPhone)
        }
    }

    const phone = content.match(PHONE_REGEX)?.[0]
    return phone ? formatPhoneNumber(phone) : null
}

function extractContactEvidence(chunk: RagAnswerRepairChunk, userMessage: string): ContactEvidence | null {
    const responsibleContact = extractTltDoubleMajorResponsibleContact(chunk.content, userMessage)
    if (responsibleContact) return responsibleContact

    const targetEmail = targetProgramEmail(userMessage, chunk.content) ?? targetUnitEmail(userMessage, chunk.content)
    const email = targetEmail ?? chunk.content.match(EMAIL_REGEX)?.[0] ?? null
    const phone = extractPhoneNearEmail(chunk.content, email)
    if (!email && !phone) return null

    return {
        email,
        phone,
        subject: contactSubjectFromContent(chunk.content, userMessage),
        personName: null
    }
}

function repairContactAnswer(input: {
    response: string
    userMessage: string
    chunks: RagAnswerRepairChunk[]
}) {
    const normalizedUserMessage = normalizeSearch(input.userMessage)
    if (!asksForContactInfo(normalizedUserMessage)) return null

    const evidence = input.chunks
        .map((chunk) => extractContactEvidence(chunk, input.userMessage))
        .find((value): value is ContactEvidence => Boolean(value))
    if (!evidence) return null

    const normalizedResponse = normalizeSearch(input.response)
    const emailMissing = evidence.email ? !normalizedResponse.includes(normalizeSearch(evidence.email)) : false
    const phoneMissing = evidence.phone ? !normalizeSearch(input.response).includes(normalizeSearch(evidence.phone).replace(/\s+/g, ' ')) : false
    const deniesDirectContact = normalizedResponse.includes('dogrudan') && (normalizedResponse.includes('bulunmuyor') || normalizedResponse.includes('yok'))

    if (!emailMissing && !phoneMissing && !deniesDirectContact) return null

    const parts = [
        evidence.personName ? `Sorumlu: ${evidence.personName}` : null,
        evidence.phone ? `Telefon: ${evidence.phone}` : null,
        evidence.email ? `E-posta: ${evidence.email}` : null
    ].filter((value): value is string => Boolean(value))

    if (parts.length === 0) return null

    return `${evidence.subject} iletişim bilgisi: ${parts.join(' - ')}.`
}

function asksForTltDoubleMajor(normalizedUserMessage: string) {
    const tokens = new Set(normalizedUserMessage.split(/\s+/).filter(Boolean))

    return (normalizedUserMessage.includes('tlt')
            || (normalizedUserMessage.includes('tibbi') && normalizedUserMessage.includes('laboratuvar') && normalizedUserMessage.includes('teknik')))
        && (normalizedUserMessage.includes('cift anadal') || tokens.has('cap'))
}

function hasTltDoubleMajorEvidence(content: string) {
    const normalizedContent = normalizeSearch(content)
    return normalizedContent.includes('tibbi laboratuvar teknikleri')
        && normalizedContent.includes('eczane hizmetleri')
        && normalizedContent.includes('cift anadal')
}

function repairTltDoubleMajorAnswer(input: {
    response: string
    userMessage: string
    chunks: RagAnswerRepairChunk[]
}) {
    const normalizedUserMessage = normalizeSearch(input.userMessage)
    if (!asksForTltDoubleMajor(normalizedUserMessage)) return null
    if (asksForContactInfo(normalizedUserMessage)) return null

    const evidence = input.chunks.find((chunk) => hasTltDoubleMajorEvidence(chunk.content))
    if (!evidence) return null

    return 'Evet. Tıbbi Laboratuvar Teknikleri Programı öğrencileri Eczane Hizmetleri Programında çift anadal programına kayıt yaptırabilir. Kontenjanlar her yıl eğitim-öğretim yılı başlamadan önce belirlenir; başvurular üçüncü yarıyılın başında alınır. Koşullarda genel ağırlıklı not ortalaması en az 2,72/4,0 ve/veya başarı sıralaması ya da taban puan şartı belirtilmiştir.'
}

function hasCompoundQuestionSignal(part: string) {
    const normalized = normalizeSearch(part)
    const tokenCount = (normalized.match(/[\p{L}\p{N}]{2,}/gu) ?? []).length
    if (tokenCount < 3) return false

    return includesAny(normalized, [
        'adres',
        'anadal',
        'basvuru',
        'cift',
        'cap',
        'ders',
        'egitim',
        'e-posta',
        'eposta',
        'final',
        'gecebilir',
        'girebilir',
        'hak',
        'hangi',
        'iletisim',
        'izin',
        'kac',
        'kampus',
        'kim',
        'mail',
        'mazeret',
        'nerede',
        'not',
        'program',
        'rapor',
        'sinav',
        'sorumlu',
        'staj',
        'telefon',
        'var mi',
        'yapabilir'
    ])
}

function splitCompoundKnowledgeQuestion(userMessage: string) {
    const trimmed = userMessage.trim()
    if (!/\s+(?:ve|ayrıca|ayrica|and)\s+/iu.test(trimmed)) return []

    const hasQuestionMark = /[?？]\s*$/.test(trimmed)
    const parts = trimmed
        .replace(/[?？]\s*$/u, '')
        .split(/\s+(?:ve|ayrıca|ayrica|and)\s+/iu)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => hasQuestionMark && !/[?？]\s*$/.test(part) ? `${part}?` : part)
        .filter(hasCompoundQuestionSignal)

    return parts.length >= 2 ? parts : []
}

function normalizeAnswerForDedupe(value: string) {
    return normalizeSearch(value)
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function dedupeCompoundAnswers(answers: string[]) {
    const unique: string[] = []
    const seen = new Set<string>()

    for (const answer of answers) {
        const normalized = normalizeAnswerForDedupe(answer)
        if (!normalized || seen.has(normalized)) continue
        if (unique.some((existing) => {
            const normalizedExisting = normalizeAnswerForDedupe(existing)
            return normalizedExisting.includes(normalized) || normalized.includes(normalizedExisting)
        })) continue

        seen.add(normalized)
        unique.push(answer.trim())
    }

    return unique
}

function repairCompoundKnowledgeAnswer(input: {
    response: string
    userMessage: string
    responseLanguage: MvpResponseLanguage
    chunks: RagAnswerRepairChunk[]
}) {
    const parts = splitCompoundKnowledgeQuestion(input.userMessage)
    if (parts.length < 2) return null

    const seed = input.responseLanguage === 'en'
        ? 'I do not have clear information about this in the knowledge base.'
        : 'Bu konuda elimde net bilgi yok.'
    const answers = parts
        .map((part) => repairLinkOnlyRagAnswer({
            ...input,
            response: seed,
            userMessage: part,
            allowCompoundRepair: false
        }))
        .filter((answer): answer is string => Boolean(
            answer?.trim()
            && answer.trim() !== seed
            && !isGenericNoInformationResponse(answer)
        ))
    const uniqueAnswers = dedupeCompoundAnswers(answers)

    if (uniqueAnswers.length < parts.length) return null

    return uniqueAnswers
        .map((answer) => answer.replace(/\s+$/u, '').replace(/([.!?])$/u, '$1'))
        .join(' ')
        .trim()
}

function asksForMedicineTraining(normalizedUserMessage: string) {
    return (normalizedUserMessage.includes('tip fakultesi') || normalizedUserMessage.includes('tip fakultesinde'))
        && includesAny(normalizedUserMessage, ['staj', 'intorn', 'klinik', 'egitim'])
}

function extractMedicineTrainingEvidence(content: string) {
    const flattened = content.replace(/\s+/g, ' ').trim()
    const match = flattened.match(/Tıp Fakültesinde eğitim[-\s]*öğretim süresi altı yıldır\.[\s\S]{0,900}?esasına göre yapılır\./iu)
        ?? flattened.match(/Tıp eğitim[-\s]*öğretimi;[\s\S]{0,900}?esasına göre yapılır\./iu)

    return match?.[0] ? cleanExtractedInlineValue(match[0]) : null
}

function repairMedicineTrainingAnswer(input: {
    response: string
    userMessage: string
    chunks: RagAnswerRepairChunk[]
}) {
    const normalizedUserMessage = normalizeSearch(input.userMessage)
    if (!asksForMedicineTraining(normalizedUserMessage)) return null

    const evidence = input.chunks
        .map((chunk) => extractMedicineTrainingEvidence(chunk.content))
        .find((value): value is string => Boolean(value))
    if (!evidence) return null

    const normalizedResponse = normalizeSearch(stripGenericAssistantContinuation(input.response))
    const asksDuration = normalizedUserMessage.includes('egitim suresi') || normalizedUserMessage.includes('egitim sure')
    const asksSummerInternship = normalizedUserMessage.includes('yaz staj')
    const hasDetailedTrainingStructure = includesAny(normalizedResponse, ['donem iv', 'donem v', 'donem vi', 'intorn', 'klinik', 'preklinik'])
    const responseHasDuration = includesAny(normalizedResponse, ['alti yil', '6 yil', '6 yildir'])
    if (!isGenericNoInformationResponse(input.response)
        && normalizedResponse.includes('staj')
        && normalizedResponse.includes('tip')
        && (!asksDuration || (hasDetailedTrainingStructure && responseHasDuration))
        && !asksSummerInternship) {
        return null
    }

    const yazStajiNote = normalizedUserMessage.includes('yaz staj')
        && !normalizeSearch(evidence).includes('yaz staj')
        ? ' Kaynakta ayrı bir "yaz stajı" ifadesi geçmiyor.'
        : ''

    const subjectEvidence = /^Tıp eğitim/iu.test(evidence)
        ? `Tıp Fakültesinde ${evidence}`
        : evidence

    return `${subjectEvidence}${yazStajiNote}`
}

function asksForGradeCalculation(normalizedUserMessage: string) {
    return includesAny(normalizedUserMessage, [
        'not hesap',
        'notu hesap',
        'basari not',
        'donem ici kurul notu',
        'kurul notu',
        'sinif gecmek icin not',
        'sinif gecme not',
        'gecme not'
    ])
}

function extractMedicineGradeFormula(content: string) {
    const flattened = content.replace(/\s+/g, ' ').trim()
    const match = flattened.match(/Dönem sonu başarı notu;\s*Dönem içi kurul notunun %60[’']?ı,\s*final notu veya bütünleme notunun %40[’']?ı toplanarak elde edilir\.[\s\S]{0,360}?toplanarak hesaplanır\./iu)
    if (!match?.[0]) return null

    return cleanExtractedInlineValue(match[0].replace('final notu veya bütünleme notunun %40’ı', 'final/bütünleme notunun %40’ı'))
        .replace('final notu veya bütünleme notunun %40\'ı', 'final/bütünleme notunun %40’ı')
        .replace('final notu veya bütünleme notunun %40ı', 'final/bütünleme notunun %40’ı')

}

function buildMedicineGradeFormulaFromEvidence(content: string) {
    const normalized = normalizeSearch(content)
    if (!normalized.includes('donem sonu basari notu')) return null
    if (!normalized.includes('donem ici kurul notunun %60')) return null
    if (!normalized.includes('%40')) return null
    if (!normalized.includes('final') || !normalized.includes('butunleme')) return null
    if (!normalized.includes('ders kurulu') || !normalized.includes('%96')) return null

    return 'Dönem sonu başarı notu; Dönem içi kurul notunun %60’ı ile final/bütünleme notunun %40’ı toplanarak elde edilir. Dönem içi kurul notu; ders kurulu sınavlarının not ortalamasının %96’sı ile varsa Hekimliğe Uyum Kurulu ve Kanıta Dayalı Tıp Kurulu notlarının her birinin %2’si, yoksa birinin %4’ü toplanarak hesaplanır.'
}

function repairGradeCalculationAnswer(input: {
    response: string
    userMessage: string
    chunks: RagAnswerRepairChunk[]
}) {
    const normalizedUserMessage = normalizeSearch(input.userMessage)
    if (!asksForGradeCalculation(normalizedUserMessage)) return null

    const normalizedResponse = normalizeSearch(input.response)
    const formulaEvidence = input.chunks
        .map((chunk) => extractMedicineGradeFormula(chunk.content) ?? buildMedicineGradeFormulaFromEvidence(chunk.content))
        .find((value): value is string => Boolean(value))
    const asksForInYearBoardGrade = includesAny(normalizedUserMessage, ['donem ici kurul', 'kurul notu'])
    if (formulaEvidence
        && asksForInYearBoardGrade
        && (!normalizedResponse.includes('96')
            || !normalizedResponse.includes('hekimlige uyum')
            || !normalizedResponse.includes('kanita dayali'))) {
        return formulaEvidence
    }
    if (formulaEvidence && (!normalizedResponse.includes('60') || !normalizedResponse.includes('40') || normalizedResponse.includes('ogrenci isleri'))) {
        return formulaEvidence
    }

    if (normalizedResponse.includes('butunleme')) return null
    if (!normalizedResponse.includes('final') || !normalizedResponse.includes('60') || !normalizedResponse.includes('40')) {
        return null
    }

    const evidence = input.chunks
        .map((chunk) => normalizeSearch(chunk.content))
        .find((content) => content.includes('final')
            && content.includes('butunleme')
            && content.includes('60')
            && content.includes('40'))
    if (!evidence) return null

    const finalPercentPattern = /(final(?:\s+sınavı|\s+sinavi)?\s+notunun\s+%?\s*40)/iu
    const repaired = input.response.replace(finalPercentPattern, 'final/bütünleme notunun %40')
    if (repaired !== input.response) return repaired

    return `${input.response.replace(/\s+$/u, '')} Kaynakta final notu yerine bütünleme notunun da kullanılabileceği belirtilir.`
}

function asksForLectureNotesAccess(normalizedUserMessage: string) {
    return includesAny(normalizedUserMessage, ['ders not', 'notlar', 'notlari', 'ders materyal', 'materyal', 'ders icerik'])
        && includesAny(normalizedUserMessage, ['nereden', 'nerede', 'nerde', 'ulas', 'erisim', 'paylas', 'yuklen'])
}

function hasDanglingLectureNoteLinkLabel(response: string) {
    const hasDanglingLine = response
        .split(/\r?\n/)
        .some((line) => /^-\s+[^:\n]{3,120}:\s*$/u.test(line.trim()))
    if (hasDanglingLine) return true

    return /ders içer(?:iği|igi)\s*:\s*(?:eğer|eger|umarım|umarim|başka|baska|$)/iu.test(response)
        || /-\s*[^.!?\n]{3,180}:\s*-\s*[^.!?\n]{3,180}:/iu.test(response)
        || /(?:link|bağlantı|baglanti)[^.!?\n]{0,180}:\s*-?\s*[^.!?\n]{3,120}:\s*(?:eğer|eger|umarım|umarim|başka|baska|$)/iu.test(response)
}

function responseMentionsLectureNotePlatform(response: string) {
    const normalizedResponse = normalizeSearch(response)
    return includesAny(normalizedResponse, [
        'uzem',
        'medu',
        'obs',
        'ogrenci bilgi sistemi',
        'ders icerigi',
        'ders materyal'
    ])
}

function repairLectureNotesAnswer(input: {
    response: string
    userMessage: string
    chunks: RagAnswerRepairChunk[]
}) {
    const normalizedUserMessage = normalizeSearch(input.userMessage)
    if (!asksForLectureNotesAccess(normalizedUserMessage)) return null

    const shouldRepair = isGenericNoInformationResponse(input.response)
        || hasDanglingLectureNoteLinkLabel(input.response)
        || !responseMentionsLectureNotePlatform(input.response)
    if (!shouldRepair) return null

    const evidence = input.chunks
        .map((chunk) => normalizeSearch(chunk.content))
        .find((content) => (content.includes('ders not')
                || content.includes('ders materyal')
                || content.includes('ders icerigi')
                || content.includes('ders bilgi paketi'))
            && ((content.includes('uzem') && content.includes('medu')) || content.includes('obs') || content.includes('erisime acilir')))
    if (!evidence) return null

    if (evidence.includes('uzem') && evidence.includes('medu')) {
        return 'Ders notlarının paylaşımı UZEM/MEDU sistemleri üzerinden sağlanmıştır.'
    }
    if (evidence.includes('obs') || evidence.includes('erisime acilir')) {
        if (evidence.includes('ders materyal') || evidence.includes('ders icerigi')) {
            return 'Ders içeriği ve materyalleri ÖBS üzerinden öğrencilerle paylaşılır.'
        }
        return 'Ders notları/ilgili ders bilgileri ÖBS üzerinden öğrencilerin erişimine açılır.'
    }

    return null
}

function asksForFinalExamPolicy(normalizedUserMessage: string) {
    const asksFinal = normalizedUserMessage.includes('final')
        || normalizedUserMessage.includes('yariyil sonu')
        || normalizedUserMessage.includes('yil sonu')

    return asksFinal
        && includesAny(normalizedUserMessage, ['girmeden', 'girmeyen', 'gecebilir', 'sinif gec', 'butunleme'])
}

function extractFinalMakeupEvidence(content: string) {
    const flattened = content.replace(/\s+/g, ' ').trim()
    const medicineFinal = flattened.match(/Final sınavına girmesi gerektiği halde girmeyen,[\s\S]{0,260}?bütünleme sınavına gir(?:er|ebilir)\.[\s\S]{0,180}?bütünleme notunu oluşturur\.[\s\S]{0,120}?final notu yerine geçer\./iu)
        ?? flattened.match(/Final sınavına girmesi gerektiği halde girmeyen,[\s\S]{0,260}?bütünleme sınavına gir(?:er|ebilir)\./iu)
        ?? flattened.match(/bütünleme sınavı olarak adlandırılan sınav yapılır\.[\s\S]{0,260}?Final sınavına girmesi gerektiği halde girmeyen,[\s\S]{0,260}?öğrenciler bu sınava gir(?:er|ebilir)\.[\s\S]{0,260}?bütünleme notunu oluşturur\.[\s\S]{0,160}?final notu yerine geçer\./iu)
    if (medicineFinal?.[0]) {
        return {
            kind: 'medicine-final' as const,
            text: cleanExtractedInlineValue(medicineFinal[0])
        }
    }

    const genericFinal = flattened.match(/Bütünleme sınavları,\s*yarıyıl sonu sınavında başarısız olan veya yarıyıl sonu sınavına girmeyen öğrencilere uygulanır\./iu)
        ?? flattened.match(/Bütünleme sınavı:\s*Dersin okutulduğu yarıyıl sonunda[\s\S]{0,240}?yarıyıl sonu sınavına giremeyen öğrenciler için yapılan sınavlardır\./iu)
    if (genericFinal?.[0]) {
        return {
            kind: 'generic-final' as const,
            text: cleanExtractedInlineValue(genericFinal[0])
        }
    }

    return null
}

function repairFinalExamAnswer(input: {
    response: string
    userMessage: string
    chunks: RagAnswerRepairChunk[]
}) {
    const normalizedUserMessage = normalizeSearch(input.userMessage)
    if (!asksForFinalExamPolicy(normalizedUserMessage)) return null
    const asksAboutMakeupExam = normalizedUserMessage.includes('butunleme')

    const normalizedResponse = normalizeSearch(stripGenericAssistantContinuation(input.response))
    const contradictsMakeupEligibility = normalizedUserMessage.includes('butunleme')
        && includesAny(normalizedResponse, [
            'final sinavina girmeden butunleme sinavina giremez',
            'final sinavina girmeden butunlemeye giremez',
            'girmeden butunleme sinavina giremez',
            'girmeden butunlemeye giremez',
            'katilmadan butunleme sinavina giremez',
            'katilmadan butunlemeye giremez',
            'butunleme sinavina giremezsin',
            'butunlemeye giremezsin',
            'dogrudan butunlemeye girme hakki yok',
            'butunlemeye girme hakki yok',
            'butunleme sinavina girme hakki yok'
        ])
    const finalMakeupEligibilityPhrases = [
        'girebilir',
        'girer',
        'girecek',
        'katilabilir',
        'katilir',
        'hakki var',
        'girmesi gerekir',
        'girmesi gerekmektedir',
        'girmeleri gerekir',
        'girmeleri gerekmektedir',
        'girmek zorundadir'
    ]
    const responseStatesMissingFinalEligibility = normalizedResponse.includes('final sinavina girmesi gerektigi halde girmeyen')
        && normalizedResponse.includes('butunleme')
        && includesAny(normalizedResponse, finalMakeupEligibilityPhrases)
    const responseStatesShortFinalEligibility = normalizedResponse.includes('final sinavina girmesi gereken')
        && normalizedResponse.includes('butunleme')
        && includesAny(normalizedResponse, [
            'butunleme sinavina girebilir',
            'butunleme sinavina girecek',
            'butunleme sinavina girmesi gerekir',
            'butunleme sinavina girmesi gerekmektedir',
            'bu sinava girebilir',
            'bu sinava girecek',
            'bu sinava girmesi gerekir',
            'bu sinava girmesi gerekmektedir'
        ])
    const responseStatesMissedFinalEligibility = normalizedResponse.includes('final sinavina girmediysen')
        && normalizedResponse.includes('butunleme')
        && includesAny(normalizedResponse, ['hakkin var', 'katilma hakkin', 'girebilirsin', 'girebilirsiniz'])
    const responseDriftsToFinalExemption = asksAboutMakeupExam
        && normalizedResponse.includes('butunleme')
        && normalizedResponse.includes('donem ici kurul not')
        && normalizedResponse.includes('80')
        && !normalizedResponse.includes('final sinavina girmesi gerektigi halde')
    const startsWithNoDespiteEligibility = /^\s*(?:yiu\s+ai\W*)?(?:kisa\s+cevap\W*)?hayir\b/iu.test(normalizedResponse)
        && normalizedUserMessage.includes('butunleme')
        && (responseStatesMissingFinalEligibility || responseStatesShortFinalEligibility || responseStatesMissedFinalEligibility)

    const evidence = input.chunks
        .map((chunk) => extractFinalMakeupEvidence(chunk.content))
        .find((value): value is { kind: 'medicine-final' | 'generic-final'; text: string } => Boolean(value))
    if (!evidence) {
        return (contradictsMakeupEligibility || startsWithNoDespiteEligibility)
            && (responseStatesMissingFinalEligibility || responseStatesShortFinalEligibility || responseStatesMissedFinalEligibility)
            ? 'Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.'
            : null
    }
    const contradictsRetrievedMedicinePolicy = (contradictsMakeupEligibility || startsWithNoDespiteEligibility) && evidence.kind === 'medicine-final'

    if (!asksAboutMakeupExam
        && !isGenericNoInformationResponse(input.response)
        && !contradictsMakeupEligibility
        && !startsWithNoDespiteEligibility) {
        return null
    }

    if (!contradictsRetrievedMedicinePolicy
        && !isGenericNoInformationResponse(input.response)
        && !responseDriftsToFinalExemption
        && normalizedResponse.includes('final')
        && normalizedResponse.includes('butunleme')) {
        return null
    }

    if (evidence.kind === 'medicine-final') {
        return 'Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.'
    }

    return 'Final/yarıyıl sonu sınavına girmeyen öğrenciler için bütünleme sınavı uygulanır; kaynakta finale girmeden doğrudan sınıf geçme değil, final yerine bütünleme hakkı düzenleniyor.'
}

function asksForExamExcusePolicy(normalizedUserMessage: string) {
    return includesAny(normalizedUserMessage, ['sinav', 'kurul', 'final', 'butunleme', 'telafi', 'mazeret'])
        && includesAny(normalizedUserMessage, ['hasta', 'hastalik', 'saglik raporu', 'rapor', 'mazeret', 'hak', 'giremedim', 'katilamadim'])
}

function extractExamExcuseEvidence(content: string) {
    const normalized = normalizeSearch(content)
    if (!normalized.includes('mazeret sinavi')) return null
    if (!normalized.includes('saglik raporu') && !normalized.includes('saglik mazereti')) return null
    if (!normalized.includes('fakulte yonetim kurulu') && !normalized.includes('ilgili birim yonetim kurulu')) return null

    const board = normalized.includes('fakulte yonetim kurulu')
        ? 'Fakülte Yönetim Kurulu'
        : 'ilgili birim yönetim kurulu'
    return `Sağlık mazereti sağlık raporu ile belgelendirilir; rapor/mazeret ${board} tarafından kabul edilirse mazeret sınavı açılır.`
}

function repairExamExcusePolicyAnswer(input: {
    response: string
    userMessage: string
    chunks: RagAnswerRepairChunk[]
}) {
    const normalizedUserMessage = normalizeSearch(input.userMessage)
    if (!asksForExamExcusePolicy(normalizedUserMessage)) return null

    const normalizedResponse = normalizeSearch(input.response)
    const asksWithoutHealthReport = includesAny(normalizedUserMessage, ['raporu vermeden', 'rapor vermeden', 'raporsuz', 'raporu olmadan', 'rapor olmadan'])
    const responseCorrectlyDeniesWithoutReport = normalizedResponse.includes('saglik raporu')
        && includesAny(normalizedResponse, ['giremez', 'girilemez', 'olmadan mazeret sinavina', 'vermeden mazeret sinavina'])
    if (asksWithoutHealthReport && responseCorrectlyDeniesWithoutReport) return null

    const evidence = input.chunks
        .map((chunk) => extractExamExcuseEvidence(chunk.content))
        .find((value): value is string => Boolean(value))
    if (!evidence) return null

    if (normalizedResponse.includes('telafi sinavi')) return null
    if (normalizedResponse.includes('baska bir sinav hakki taninabilir')) return null
    if (normalizedResponse.includes('mazeret sinavi')
        && (normalizedResponse.includes('fakulte yonetim kurulu') || normalizedResponse.includes('ilgili birim yonetim kurulu'))) {
        return null
    }

    return evidence
}

const GROUNDING_SUBJECT_STOPWORDS = new Set([
    'acaba',
    'alabilir',
    'alabiliyor',
    'alabiliriz',
    'alabilirim',
    'beni',
    'ben',
    'bir',
    'bu',
    'icin',
    'ile',
    'miyim',
    'miyiz',
    'mi',
    'ne',
    'nedir',
    'olur',
    'var',
    'varsa',
    'yapabilir',
    'yapabilirim',
    'girebilir',
    'girebilirim',
    'hak',
    'hakki',
    'hakim'
])

function stemGroundingToken(token: string) {
    let stemmed = stemDurationToken(token)
    const shortSuffixes = ['im', 'um', 'um', 'm', 'i', 'u', 'a', 'e']
    for (const suffix of shortSuffixes) {
        if (stemmed.endsWith(suffix) && stemmed.length - suffix.length >= 5) {
            stemmed = stemmed.slice(0, -suffix.length)
            break
        }
    }

    return stemmed
}

function groundingSubjectTokens(value: string) {
    const normalized = normalizeSearch(value)
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .trim()
    if (!normalized) return []

    return Array.from(new Set(
        normalized
            .split(/\s+/)
            .map(stemGroundingToken)
            .filter((token) => token.length >= 3 && !GROUNDING_SUBJECT_STOPWORDS.has(token))
    )).slice(0, 8)
}

function normalizedGroundingTokenSet(value: string) {
    return new Set(
        normalizeSearch(value)
            .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
            .split(/\s+/)
            .filter(Boolean)
            .flatMap((token) => {
                const stemmed = stemGroundingToken(token)
                return stemmed === token ? [token] : [token, stemmed]
            })
    )
}

function groundingSubjectCoverage(tokens: string[], value: string) {
    if (tokens.length === 0) return 0
    const valueTokens = normalizedGroundingTokenSet(value)
    const normalizedValue = normalizeSearch(value)
    const hits = tokens.filter((token) => valueTokens.has(token) || normalizedValue.includes(token)).length
    return hits / tokens.length
}

function hasEligibilityDenial(value: string) {
    const normalized = normalizeSearch(value)

    return /\b(?:giremez|giremezsin|giremezsiniz|yapamaz|yapamazsin|yapilamaz|alamaz|alamazsin|alinamaz|yararlanamaz|faydalanamaz|mumkun degil|hakki yok|hak yok|bulunmamaktadir|yoktur)\b/i.test(normalized)
}

function hasAffirmativeEligibility(value: string) {
    const normalized = normalizeSearch(value)

    return /\b(?:girebilir|girer|yapabilir|yapilir|alabilir|yararlanabilir|faydalanabilir|talep edebilir|mumkundur|hakki vardir|hakkin var|uygulanir|acilir|kabul edilir)\b/i.test(normalized)
}

function asksForEligibilityOrPermission(normalizedUserMessage: string) {
    return includesAny(normalizedUserMessage, [
        'miyim',
        'miyiz',
        'olur mu',
        'var mi',
        'girebilir',
        'girebilirim',
        'yapabilir',
        'yapabilirim',
        'alabilir',
        'alabilirim',
        'yararlan',
        'faydalan',
        'hak',
        'mumkun',
        'izin'
    ])
}

function shouldSkipContradictoryEligibilityRepair(normalizedUserMessage: string) {
    return includesAny(normalizedUserMessage, ['olmadan', 'vermeden'])
        && !includesAny(normalizedUserMessage, ['girmeden', 'katilmadan'])
}

function splitGroundingCandidateSentences(content: string) {
    return content
        .replace(/^(?:Page|Document) Title:\s*.*$/gim, ' ')
        .replace(/^Source URL:\s*.*$/gim, ' ')
        .replace(/^Section:\s*.*$/gim, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(/(?<=[.!?])\s+/u)
        .map((sentence) => sentence
            .replace(/^(?:Madde|MADDE)\s+\d+\s*[-–—]?\s*/u, '')
            .replace(/\s+/g, ' ')
            .trim())
        .filter((sentence) => sentence.length >= 32)
}

function extractAffirmativeEligibilityEvidence(content: string, userMessage: string) {
    const tokens = groundingSubjectTokens(userMessage)
    const sentences = splitGroundingCandidateSentences(content)

    const candidates = sentences
        .map((sentence, index) => {
            if (!hasAffirmativeEligibility(sentence) || hasEligibilityDenial(sentence)) return null
            const coverage = groundingSubjectCoverage(tokens, sentence)
            if (tokens.length > 0 && coverage < 0.35) return null

            const nextSentence = sentences[index + 1]
            const shouldAppendNext = nextSentence
                && !hasEligibilityDenial(nextSentence)
                && groundingSubjectCoverage(tokens, nextSentence) >= 0.25
            const text = shouldAppendNext ? `${sentence} ${nextSentence}` : sentence

            return { text: cleanExtractedInlineValue(text), coverage }
        })
        .filter((candidate): candidate is { text: string; coverage: number } => Boolean(candidate))
        .sort((left, right) => right.coverage - left.coverage)

    return candidates[0]?.text ?? null
}

function extractEligibilityDecisionEvidence(content: string, userMessage: string) {
    const normalizedUserMessage = normalizeSearch(userMessage)
    const tokens = groundingSubjectTokens(userMessage)
    const sentences = splitGroundingCandidateSentences(content)
    const requiresErasmus = normalizedUserMessage.includes('erasmus')
    const minimumCoverage = requiresErasmus ? 0.3 : 0.4

    const candidates = sentences
        .map((sentence, index) => {
            const hasDecision = hasEligibilityDenial(sentence) || hasAffirmativeEligibility(sentence)
            if (!hasDecision) return null

            const normalizedSentence = normalizeSearch(sentence)
            if (requiresErasmus && !normalizedSentence.includes('erasmus')) return null

            const coverage = groundingSubjectCoverage(tokens, sentence)
            if (tokens.length > 0 && coverage < minimumCoverage) return null

            const nextSentence = sentences[index + 1]
            const shouldAppendNext = nextSentence
                && !hasEligibilityDenial(nextSentence)
                && !hasAffirmativeEligibility(nextSentence)
                && groundingSubjectCoverage(tokens, nextSentence) >= 0.25
            const text = shouldAppendNext ? `${sentence} ${nextSentence}` : sentence

            return { text: cleanExtractedInlineValue(text), coverage }
        })
        .filter((candidate): candidate is { text: string; coverage: number } => Boolean(candidate))
        .sort((left, right) => right.coverage - left.coverage)

    return candidates[0]?.text ?? null
}

function repairEligibilityDecisionAnswer(input: {
    response: string
    userMessage: string
    chunks: RagAnswerRepairChunk[]
}) {
    const normalizedUserMessage = normalizeSearch(input.userMessage)
    if (asksForPolicyDuration(normalizedUserMessage)) return null
    if (!asksForEligibilityOrPermission(normalizedUserMessage)) return null
    if (shouldSkipContradictoryEligibilityRepair(normalizedUserMessage)) return null

    const normalizedResponse = normalizeSearch(stripGenericAssistantContinuation(input.response))
    const responseHasDecision = hasEligibilityDenial(input.response) || hasAffirmativeEligibility(input.response)
    const weakResponse = isLikelyLinkOnlyResponse(input.response)
        || isGenericNoInformationResponse(input.response)
        || !responseHasDecision
        || (normalizedResponse.includes('iletisim') && /https?:\/\/\S+/i.test(input.response))
    if (!weakResponse) return null

    const evidence = input.chunks
        .map((chunk) => extractEligibilityDecisionEvidence(chunk.content, input.userMessage))
        .find((value): value is string => Boolean(value))
    if (!evidence) return null

    const normalizedEvidence = normalizeSearch(evidence)
    if (normalizedResponse.includes(normalizedEvidence)) return null

    return evidence.endsWith('.') ? evidence : `${evidence}.`
}

function repairContradictoryEligibilityAnswer(input: {
    response: string
    userMessage: string
    chunks: RagAnswerRepairChunk[]
}) {
    const normalizedUserMessage = normalizeSearch(input.userMessage)
    if (asksForPolicyDuration(normalizedUserMessage)) return null
    if (!asksForEligibilityOrPermission(normalizedUserMessage)) return null
    if (shouldSkipContradictoryEligibilityRepair(normalizedUserMessage)) return null
    if (!hasEligibilityDenial(input.response)) return null

    const evidence = input.chunks
        .map((chunk) => extractAffirmativeEligibilityEvidence(chunk.content, input.userMessage))
        .find((value): value is string => Boolean(value))
    if (!evidence) return null

    return evidence.endsWith('.') ? evidence : `${evidence}.`
}

const EVIDENCE_PREFERRED_TERMS = [
    {
        official: 'mazeret sınavı',
        synonymPattern: /telafi\s+sınavı|başka\s+bir\s+sınav\s+hakkı|sinav\s+hakki\s+taninabilir|sınav\s+hakkı\s+tanınabilir/giu
    }
]

function repairEvidencePreferredTerminology(input: {
    response: string
    chunks: RagAnswerRepairChunk[]
}) {
    let repaired = input.response
    const normalizedEvidence = normalizeSearch(input.chunks.map((chunk) => chunk.content).join('\n'))

    for (const term of EVIDENCE_PREFERRED_TERMS) {
        const normalizedOfficial = normalizeSearch(term.official)
        if (!normalizedEvidence.includes(normalizedOfficial)) continue
        if (normalizeSearch(repaired).includes(normalizedOfficial)) continue
        term.synonymPattern.lastIndex = 0
        if (!term.synonymPattern.test(repaired)) continue

        term.synonymPattern.lastIndex = 0
        repaired = repaired.replace(term.synonymPattern, `${term.official} ($&)`)
    }

    return repaired === input.response ? null : repaired
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
    allowCompoundRepair?: boolean
}) {
    const originalResponse = input.response.trim()
    const response = originalResponse || (
        input.responseLanguage === 'en'
            ? 'I do not have clear information about this in the knowledge base.'
        : 'Bu konuda elimde net bilgi yok.'
    )

    if (input.allowCompoundRepair !== false) {
        const compoundRepair = repairCompoundKnowledgeAnswer({
            ...input,
            response
        })
        if (compoundRepair) return compoundRepair

        if (splitCompoundKnowledgeQuestion(input.userMessage).length >= 2 && isGenericNoInformationResponse(response)) {
            return originalResponse
        }
    }

    const abbreviationTitleRepair = repairAbbreviationTitleAnswer({
        ...input,
        response
    })
    if (abbreviationTitleRepair) return abbreviationTitleRepair

    const abbreviationExpansionRepair = repairAbbreviationExpansionAnswer({
        ...input,
        response
    })
    if (abbreviationExpansionRepair) return abbreviationExpansionRepair

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

    const medicineTrainingRepair = repairMedicineTrainingAnswer({
        ...input,
        response
    })
    if (medicineTrainingRepair) return medicineTrainingRepair

    const policyDurationRepair = repairPolicyDurationAnswer({
        ...input,
        response
    })
    if (policyDurationRepair) return policyDurationRepair

    const medicineElectiveRepair = repairMedicineElectiveAnswer({
        ...input,
        response
    })
    if (medicineElectiveRepair) return medicineElectiveRepair

    const electiveCourseRequirementRepair = repairElectiveCourseRequirementAnswer({
        ...input,
        response
    })
    if (electiveCourseRequirementRepair) return electiveCourseRequirementRepair

    const medicineFinalExemptionRepair = repairMedicineFinalExemptionAnswer({
        ...input,
        response
    })
    if (medicineFinalExemptionRepair) return medicineFinalExemptionRepair

    const tltDoubleMajorRepair = repairTltDoubleMajorAnswer({
        ...input,
        response
    })
    if (tltDoubleMajorRepair) return tltDoubleMajorRepair

    const eligibilityDecisionRepair = repairEligibilityDecisionAnswer({
        ...input,
        response
    })
    if (eligibilityDecisionRepair) return eligibilityDecisionRepair

    const addressRepair = repairAddressAnswer({
        ...input,
        response
    })
    if (addressRepair) return addressRepair

    const contactRepair = repairContactAnswer({
        ...input,
        response
    })
    if (contactRepair) return contactRepair

    const lectureNotesRepair = repairLectureNotesAnswer({
        ...input,
        response
    })
    if (lectureNotesRepair) return lectureNotesRepair

    const gradeCalculationRepair = repairGradeCalculationAnswer({
        ...input,
        response
    })
    if (gradeCalculationRepair) return gradeCalculationRepair

    const contradictoryEligibilityRepair = repairContradictoryEligibilityAnswer({
        ...input,
        response
    })
    if (contradictoryEligibilityRepair) return contradictoryEligibilityRepair

    const examExcusePolicyRepair = repairExamExcusePolicyAnswer({
        ...input,
        response
    })
    if (examExcusePolicyRepair) return examExcusePolicyRepair

    const evidenceTerminologyRepair = repairEvidencePreferredTerminology({
        ...input,
        response
    })
    if (evidenceTerminologyRepair) return evidenceTerminologyRepair

    const finalExamRepair = repairFinalExamAnswer({
        ...input,
        response
    })
    if (finalExamRepair) return finalExamRepair

    const articleNumber = requestedArticleNumber(input.userMessage)
    if (!articleNumber) {
        return originalResponse
            ? sanitizeRagAnswerForReturn(response, input.userMessage)
            : originalResponse
    }

    for (const chunk of input.chunks) {
        const articleText = extractArticleText(chunk.content, articleNumber)
        if (!articleText) continue
        if (!isWeakArticleAnswer(response, articleText, articleNumber)) {
            return originalResponse
                ? sanitizeRagAnswerForReturn(response, input.userMessage)
                : originalResponse
        }

        if (input.responseLanguage === 'en') {
            return articleNumber === 1
                ? `The purpose of this regulation is: ${articleText}`
                : `The scope of this regulation is: ${articleText}`
        }

        return articleNumber === 1
            ? `Bu yönergenin amacı: ${articleText}`
            : `Bu yönergenin kapsamı: ${articleText}`
    }

    return originalResponse
        ? sanitizeRagAnswerForReturn(response, input.userMessage)
        : originalResponse
}
