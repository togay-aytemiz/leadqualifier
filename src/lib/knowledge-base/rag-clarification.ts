import type { MvpResponseLanguage } from '@/lib/ai/language'

const TURKISH_CHAR_MAP: Record<string, string> = {
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

const GENERIC_PRICE_SUBJECT_PREFIXES = [
    'bolum',
    'egitim',
    'hizmet',
    'islem',
    'okul',
    'oku',
    'paket',
    'program',
    'secenek',
    'universite'
]

const CONTACT_STOPWORDS = new Set([
    'acaba',
    'adres',
    'bilgi',
    'bilgisi',
    'bilgileri',
    'contact',
    'details',
    'email',
    'e-posta',
    'eposta',
    'gecebilir',
    'gecebiliriz',
    'geçebilir',
    'iletisim',
    'iletisime',
    'kurabilir',
    'kurabiliriz',
    'mail',
    'mi',
    'mumkun',
    'mümkün',
    'nedir',
    'ne',
    'numara',
    'numarasi',
    'phone',
    'telefon',
    'ulasabilirim',
    'ulasirim',
    'ulaşabilirim',
    'ulaşırım',
    'var'
])

const LOCATION_STOPWORDS = new Set([
    'acaba',
    'adres',
    'adresi',
    'hangi',
    'konum',
    'konumu',
    'mi',
    'nedir',
    'nerede',
    'neresi',
    'var',
    'where'
])

const GENERIC_HELP_STOPWORDS = new Set([
    'acaba',
    'aciklar',
    'alabilir',
    'alabilir miyim',
    'anlatabilir',
    'anlatir',
    'bilgi',
    'biraz',
    'bu',
    'bunu',
    'daha',
    'demek',
    'detay',
    'edinmek',
    'fazla',
    'geliyor',
    'hakkinda',
    'hakkında',
    'help',
    'information',
    'istiyorum',
    'lutfen',
    'lütfen',
    'mi',
    'miyim',
    'misiniz',
    'mumkun',
    'mümkün',
    'ne',
    'nedir',
    'nasıl',
    'nasil',
    'anlama',
    'olur',
    'oluyor',
    'onu',
    'sunu',
    'şunu',
    'var',
    'verebilir',
    'verebilir misiniz',
    'yardim',
    'yardım'
])

const PRICE_STOPWORDS = new Set([
    'acaba',
    'almak',
    'bana',
    'bilgi',
    'bu',
    'cost',
    'fee',
    'fiyat',
    'fiyati',
    'fiyatlar',
    'fiyatlari',
    'how',
    'icin',
    'istiyorum',
    'kac',
    'kaca',
    'kadar',
    'maliyet',
    'maliyeti',
    'ne',
    'nedir',
    'para',
    'paylas',
    'price',
    'pricing',
    'tl',
    'tutar',
    'tutari',
    'ucret',
    'ucreti',
    'ucretler',
    'ucretleri',
    'which',
    'would'
])

export type ClarificationContext = 'general' | 'education'
export type ClarificationKind = 'price' | 'contact' | 'location' | 'generic'
export type ClarificationReason =
    | 'missing_price_subject'
    | 'missing_contact_subject'
    | 'missing_location_subject'
    | 'missing_topic'

export type ClarificationGateResult = {
    kind: ClarificationKind
    reason: ClarificationReason
    question: string
}

function normalize(value: string) {
    return value
        .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
}

function hasPriceIntent(value: string) {
    const normalized = normalize(value)
    return /\bkac\s+para\b/.test(normalized)
        || /\bkaca\b/.test(normalized)
        || /\bkac\s*tl\b/.test(normalized)
        || /^ne\s+kadar[?!.]?$/.test(normalized)
        || /\bne\s+kadar\s+tutar\b/.test(normalized)
        || /\b(?:ucret|ucreti|ucretler|ucretleri|fiyat|fiyati|fiyatlar|fiyatlari|maliyet|maliyeti|tutar|tutari)\b/.test(normalized)
        || /\b(?:price|pricing|cost|fee|fees)\b/.test(normalized)
        || /\bhow\s+much\b/.test(normalized)
}

function hasContactIntent(value: string) {
    const normalized = normalize(value)
    return /\b(?:iletisim|telefon|numara|e-?posta|eposta|email|mail|contact|phone)\b/.test(normalized)
}

function hasLocationIntent(value: string) {
    const normalized = normalize(value)
    return /\b(?:nerede|neresi|adres|adresi|konum|konumu|where)\b/.test(normalized)
}

function hasGenericHelpIntent(value: string) {
    const normalized = normalize(value)
    return (
        /\b(?:bilgi|detay|yardim|yardım|information|help)\b/.test(normalized)
        && /\b(?:alabilir|almak|verebilir|istiyorum|miyim|misiniz|please|need|var\s+mi)\b/.test(normalized)
    ) || /\b(?:nasil|nedir|ne\s+demek|ne\s+anlama\s+geliyor|anlatabilir|anlatir|aciklar)\b/.test(normalized)
}

function hasRefusalSignal(value: string) {
    return /paylasmak istemiyorum|paylaşmak istemiyorum|istemiyorum|sormayin|sormayın|don't want|do not want|rather not/i.test(value)
}

function resolveClarificationLanguage(message: string, language?: MvpResponseLanguage): MvpResponseLanguage {
    if (language === 'tr') return 'tr'
    const normalized = normalize(message)
    if (/\b(?:bilgi|detay|eposta|fiyat|hangi|iletisim|kac|miyim|misiniz|nerede|neresi|numara|telefon|ucret|yardim)\b/.test(normalized)) {
        return 'tr'
    }
    return language ?? 'tr'
}

function tokenize(value: string) {
    return normalize(value).match(/[a-z0-9%]+/g) ?? []
}

function isGenericPriceSubjectToken(token: string) {
    if (PRICE_STOPWORDS.has(token)) return true
    return GENERIC_PRICE_SUBJECT_PREFIXES.some((prefix) => token.startsWith(prefix))
}

function hasConcreteSubject(value: string) {
    return tokenize(value)
        .filter((token) => token.length >= 3)
        .some((token) => !isGenericPriceSubjectToken(token))
}

function tokenHasConcreteSubject(value: string, stopwords: Set<string>) {
    return tokenize(value)
        .filter((token) => token.length >= 3)
        .some((token) => !stopwords.has(token))
}

export function shouldAskPriceClarification(message: string) {
    if (!hasPriceIntent(message)) return false
    return !hasConcreteSubject(message)
}

export function buildPriceClarificationQuestion(
    language: MvpResponseLanguage = 'tr',
    context: ClarificationContext = 'general'
) {
    if (language === 'en') {
        return 'Which program, service, or option would you like pricing for?'
    }
    if (context === 'education') {
        return 'Hangi bölüm, program veya hizmet için ücret bilgisini öğrenmek istiyorsunuz?'
    }
    return 'Hangi hizmet, program veya seçenek için ücret bilgisini öğrenmek istiyorsunuz?'
}

function buildContactClarificationQuestion(language: MvpResponseLanguage) {
    if (language === 'en') {
        return 'Which person, department, or service would you like contact details for?'
    }
    return 'Hangi kişi, birim veya hizmet için iletişim bilgisini öğrenmek istiyorsunuz?'
}

function buildLocationClarificationQuestion(
    language: MvpResponseLanguage,
    context: ClarificationContext
) {
    if (language === 'en') {
        return 'Which place, campus, or service location would you like to know about?'
    }
    if (context === 'education') {
        return 'Hangi bölüm, kampüs veya birimin konumunu öğrenmek istiyorsunuz?'
    }
    return 'Hangi yer, şube veya hizmet konumu hakkında bilgi istiyorsunuz?'
}

function buildGenericClarificationQuestion(language: MvpResponseLanguage) {
    if (language === 'en') {
        return 'Which topic would you like information about?'
    }
    return 'Hangi konu hakkında bilgi almak istiyorsunuz?'
}

export function buildClarificationGateResult(input: {
    message: string
    language?: MvpResponseLanguage
    context?: ClarificationContext
}): ClarificationGateResult | null {
    const message = input.message.trim()
    if (!message || hasRefusalSignal(message)) return null

    const language = resolveClarificationLanguage(message, input.language)
    const context = input.context ?? 'general'

    if (shouldAskPriceClarification(message)) {
        return {
            kind: 'price',
            reason: 'missing_price_subject',
            question: buildPriceClarificationQuestion(language, context)
        }
    }
    if (hasContactIntent(message) && !tokenHasConcreteSubject(message, CONTACT_STOPWORDS)) {
        return {
            kind: 'contact',
            reason: 'missing_contact_subject',
            question: buildContactClarificationQuestion(language)
        }
    }
    if (hasLocationIntent(message) && !tokenHasConcreteSubject(message, LOCATION_STOPWORDS)) {
        return {
            kind: 'location',
            reason: 'missing_location_subject',
            question: buildLocationClarificationQuestion(language, context)
        }
    }
    if (hasGenericHelpIntent(message) && !tokenHasConcreteSubject(message, GENERIC_HELP_STOPWORDS)) {
        return {
            kind: 'generic',
            reason: 'missing_topic',
            question: buildGenericClarificationQuestion(language)
        }
    }

    return null
}
