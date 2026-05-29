import type { MvpResponseLanguage } from '@/lib/ai/language'
import type { RagChunk } from '@/lib/knowledge-base/rag'

type MicroPolishInput = {
    answer: string
    userMessage: string
    responseLanguage: MvpResponseLanguage
    chunks: Pick<RagChunk, 'content' | 'document_title' | 'source_url'>[]
}

type MicroPolishResult = {
    answer: string
    usedMicroPolish: boolean
}

const TITLE_STOPWORDS = new Set([
    'program',
    'programi',
    'programı',
    'raporu',
    'degerlendirme',
    'değerlendirme',
    'oz',
    'öz',
    '2025',
])

function normalizeForInitialism(value: string) {
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
            ç: 'c'
        }[char] ?? char))
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
}

function toTurkishTitleCase(value: string) {
    return value
        .toLocaleLowerCase('tr-TR')
        .replace(/^\p{L}/u, (char) => char.toLocaleUpperCase('tr-TR'))
}

function extractPageTitle(content: string) {
    return content.match(/^Page Title:\s*(.+)$/im)?.[1]?.trim() ?? null
}

function titleCandidates(chunks: MicroPolishInput['chunks']) {
    const candidates: string[] = []
    for (const chunk of chunks) {
        if (chunk.document_title?.trim()) candidates.push(chunk.document_title.trim())
        const pageTitle = extractPageTitle(chunk.content)
        if (pageTitle) candidates.push(pageTitle)
    }
    return candidates
}

function programNameFromInitialism(acronym: string, chunks: MicroPolishInput['chunks']) {
    const normalizedAcronym = normalizeForInitialism(acronym).replace(/[^a-z0-9]/g, '')
    if (normalizedAcronym.length < 2 || normalizedAcronym.length > 6) return null

    for (const title of titleCandidates(chunks)) {
        const words = title.match(/[\p{L}\p{N}]+/gu) ?? []
        const normalizedWords = words
            .map((word) => ({
                raw: word,
                normalized: normalizeForInitialism(word).replace(/[^a-z0-9]/g, '')
            }))
            .filter((word) => word.normalized.length >= 2)
            .filter((word) => !TITLE_STOPWORDS.has(word.normalized))

        for (let start = 0; start <= normalizedWords.length - normalizedAcronym.length; start += 1) {
            const window = normalizedWords.slice(start, start + normalizedAcronym.length)
            const initials = window.map((word) => word.normalized[0] ?? '').join('')
            if (initials !== normalizedAcronym) continue

            return window.map((word) => toTurkishTitleCase(word.raw)).join(' ')
        }
    }

    return null
}

function expandTerseCourseCodeAnswer(answer: string, chunks: MicroPolishInput['chunks']) {
    const match = answer.match(/^["“]?([A-ZÇĞİÖŞÜ]{2,6})\s+\d{2,4}\b/u)
    const acronym = match?.[1]
    if (!acronym) return answer

    const programName = programNameFromInitialism(acronym, chunks)
    if (!programName) return answer

    const normalizedAnswer = normalizeForInitialism(answer)
    const normalizedProgramName = normalizeForInitialism(programName)
    if (normalizedAnswer.includes(normalizedProgramName)) return answer

    return `${programName} programında ${answer}`
}

function addWarmPrefix(answer: string, responseLanguage: MvpResponseLanguage) {
    if (responseLanguage === 'tr') {
        if (/^(?:tabii|elbette|evet|kaynakta)\b/iu.test(answer)) return answer
        return `Tabii, ${answer}`
    }

    if (/^(?:sure|yes|according to the source)\b/iu.test(answer)) return answer
    return `Sure, ${answer}`
}

export function microPolishDeterministicRagAnswer(input: MicroPolishInput): MicroPolishResult {
    const originalAnswer = input.answer.trim()
    if (!originalAnswer) return { answer: originalAnswer, usedMicroPolish: false }
    if (/^Kaynakta\b/iu.test(originalAnswer)) {
        return { answer: originalAnswer, usedMicroPolish: false }
    }

    const expandedAnswer = expandTerseCourseCodeAnswer(originalAnswer, input.chunks)
    if (expandedAnswer === originalAnswer) {
        return { answer: originalAnswer, usedMicroPolish: false }
    }

    const answer = addWarmPrefix(expandedAnswer, input.responseLanguage)
    return {
        answer,
        usedMicroPolish: answer !== originalAnswer
    }
}
