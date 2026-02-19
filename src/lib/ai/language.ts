const TURKISH_CHAR_PATTERN = /[ığüşöçİĞÜŞÖÇ]/
const TURKISH_WORD_PATTERN = /\b(merhaba|selam|fiyat|randevu|teşekkür|tesekkur|lütfen|lutfen|yarın|yarin|bugün|bugun|müsait|musait|kampanya|hizmet)\b/i

export type MvpResponseLanguage = 'tr' | 'en'
export type MvpResponseLanguageName = 'Turkish' | 'English'

export function isLikelyTurkishMessage(value: string): boolean {
    const text = (value ?? '').trim()
    if (!text) return false
    if (TURKISH_CHAR_PATTERN.test(text)) return true
    return TURKISH_WORD_PATTERN.test(text)
}

export function resolveMvpResponseLanguage(value: string): MvpResponseLanguage {
    return isLikelyTurkishMessage(value) ? 'tr' : 'en'
}

export function resolveMvpResponseLanguageName(value: string): MvpResponseLanguageName {
    return resolveMvpResponseLanguage(value) === 'tr' ? 'Turkish' : 'English'
}

