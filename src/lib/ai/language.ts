const TURKISH_CHAR_PATTERN = /[ığüşöçİĞÜŞÖÇ]/
const TURKISH_WORD_PATTERN = /\b(merhaba|selam|fiyat|randevu|teşekkür|tesekkur|lütfen|lutfen|yarın|yarin|bugün|bugun|müsait|musait|kampanya|hizmet|iptal|detay|sadece|yeter)\b/i
const TURKISH_SUFFIX_PATTERN = /(miyim|miyiz|misin|misiniz|mısın|mısınız|musun|musunuz|müsün|müsünüz|yorum|yoruz|yim|yiz|siniz|sunuz|lar|ler|dır|dir|dur|dür|tir|tır|tur|tür|acak|ecek|abil|ebil|madan|meden|dan|den|nin|nın|nun|nün)$/

const TURKISH_KEYWORDS = new Set([
    'merhaba',
    'selam',
    'fiyat',
    'randevu',
    'tesekkur',
    'teşekkür',
    'lutfen',
    'lütfen',
    'yarin',
    'yarın',
    'bugun',
    'bugün',
    'musait',
    'müsait',
    'kampanya',
    'hizmet',
    'iptal',
    'sadece',
    'yeter',
    'detay',
    'bilgi',
    'neden',
    'uygun',
    'yardim',
    'yardım',
    'paylas',
    'paylaş',
    'istiyorum',
    'olur',
    'misiniz',
    'mısınız',
    'musunuz',
    'müsünüz',
    'edin',
    'bütçe',
    'butce'
])

const ENGLISH_KEYWORDS = new Set([
    'hello',
    'hi',
    'please',
    'thanks',
    'thank',
    'book',
    'booking',
    'appointment',
    'cancel',
    'price',
    'service',
    'details',
    'information',
    'available',
    'availability',
    'support',
    'team',
    'contact',
    'message',
    'call',
    'schedule',
    'today',
    'tomorrow',
    'can',
    'could',
    'would',
    'should',
    'want',
    'need',
    'help'
])

function tokenizeLanguageCandidates(value: string) {
    return value
        .toLowerCase()
        .replace(/[^\p{L}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
}

function countKeywordHits(tokens: string[], dictionary: Set<string>) {
    let hits = 0
    for (const token of tokens) {
        if (dictionary.has(token)) hits += 1
    }
    return hits
}

export type MvpResponseLanguage = 'tr' | 'en'
export type MvpResponseLanguageName = 'Turkish' | 'English'

export function isLikelyTurkishMessage(value: string): boolean {
    const text = (value ?? '').trim()
    if (!text) return false
    if (TURKISH_CHAR_PATTERN.test(text)) return true
    if (TURKISH_WORD_PATTERN.test(text)) return true

    const tokens = tokenizeLanguageCandidates(text)
    if (tokens.length === 0) return false

    const turkishKeywordHits = countKeywordHits(tokens, TURKISH_KEYWORDS)
    const englishKeywordHits = countKeywordHits(tokens, ENGLISH_KEYWORDS)
    const turkishSuffixHits = tokens.filter((token) => TURKISH_SUFFIX_PATTERN.test(token)).length

    const turkishScore = turkishKeywordHits * 2 + turkishSuffixHits
    const englishScore = englishKeywordHits * 2

    if (turkishScore === 0 && englishScore === 0) return false
    if (turkishScore === englishScore) {
        return turkishKeywordHits >= englishKeywordHits
    }
    return turkishScore > englishScore
}

export function resolveMvpResponseLanguage(value: string): MvpResponseLanguage {
    return isLikelyTurkishMessage(value) ? 'tr' : 'en'
}

export function resolveMvpResponseLanguageName(value: string): MvpResponseLanguageName {
    return resolveMvpResponseLanguage(value) === 'tr' ? 'Turkish' : 'English'
}
