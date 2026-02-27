const TURKISH_CHAR_PATTERN = /[ığüşöçİĞÜŞÖÇ]/
const TURKISH_WORD_PATTERN = /\b(merhaba|selam|fiyat|randevu|teşekkür|tesekkur|lütfen|lutfen|yarın|yarin|bugün|bugun|müsait|musait|kampanya|hizmet|iptal|detay|sadece|yeter|şikayet|sikayet|sorun|memnuniyetsiz)\b/i
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
    'sikayet',
    'şikayet',
    'sikayetim',
    'şikayetim',
    'sorun',
    'sorunum',
    'memnuniyetsiz',
    'memnuniyetsizlik',
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

export interface MvpResponseLanguageResolutionOptions {
    /**
     * Recent user-side conversation turns used only when current message language is ambiguous.
     * Pass newest-first when available.
     */
    historyMessages?: string[]
}

interface LanguageSignal {
    language: MvpResponseLanguage
    ambiguous: boolean
}

function detectLanguageSignal(value: string): LanguageSignal {
    const text = (value ?? '').trim()
    if (!text) return { language: 'en', ambiguous: true }
    if (TURKISH_CHAR_PATTERN.test(text)) return { language: 'tr', ambiguous: false }
    if (TURKISH_WORD_PATTERN.test(text)) return { language: 'tr', ambiguous: false }

    const tokens = tokenizeLanguageCandidates(text)
    if (tokens.length === 0) return { language: 'en', ambiguous: true }

    const turkishKeywordHits = countKeywordHits(tokens, TURKISH_KEYWORDS)
    const englishKeywordHits = countKeywordHits(tokens, ENGLISH_KEYWORDS)
    const turkishSuffixHits = tokens.filter((token) => TURKISH_SUFFIX_PATTERN.test(token)).length

    const turkishScore = turkishKeywordHits * 2 + turkishSuffixHits
    const englishScore = englishKeywordHits * 2

    if (turkishScore === 0 && englishScore === 0) {
        return { language: 'en', ambiguous: true }
    }

    if (turkishScore === englishScore) {
        return {
            language: turkishKeywordHits >= englishKeywordHits ? 'tr' : 'en',
            ambiguous: true
        }
    }

    const language = turkishScore > englishScore ? 'tr' : 'en'
    const scoreGap = Math.abs(turkishScore - englishScore)
    return { language, ambiguous: scoreGap <= 1 }
}

function resolveFromHistory(
    currentSignal: LanguageSignal,
    historyMessages: string[] | undefined
): MvpResponseLanguage {
    if (!currentSignal.ambiguous) return currentSignal.language
    if (!historyMessages || historyMessages.length === 0) return currentSignal.language

    let turkishVotes = 0
    let englishVotes = 0
    let mostRecentDecisive: MvpResponseLanguage | null = null

    for (const historyMessage of historyMessages) {
        const historySignal = detectLanguageSignal(historyMessage)
        if (historySignal.ambiguous) continue

        if (!mostRecentDecisive) {
            mostRecentDecisive = historySignal.language
        }

        if (historySignal.language === 'tr') {
            turkishVotes += 1
        } else {
            englishVotes += 1
        }
    }

    if (turkishVotes === 0 && englishVotes === 0) return currentSignal.language
    if (turkishVotes === englishVotes) return mostRecentDecisive ?? currentSignal.language
    return turkishVotes > englishVotes ? 'tr' : 'en'
}

export function isLikelyTurkishMessage(value: string): boolean {
    return detectLanguageSignal(value).language === 'tr'
}

export function isMvpResponseLanguageAmbiguous(value: string): boolean {
    return detectLanguageSignal(value).ambiguous
}

export function resolveMvpResponseLanguage(
    value: string,
    options?: MvpResponseLanguageResolutionOptions
): MvpResponseLanguage {
    const currentSignal = detectLanguageSignal(value)
    return resolveFromHistory(currentSignal, options?.historyMessages)
}

export function resolveMvpResponseLanguageName(
    value: string,
    options?: MvpResponseLanguageResolutionOptions
): MvpResponseLanguageName {
    return resolveMvpResponseLanguage(value, options) === 'tr' ? 'Turkish' : 'English'
}
