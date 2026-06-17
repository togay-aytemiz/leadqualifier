import OpenAI from 'openai'

import type { MvpResponseLanguage } from '@/lib/ai/language'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'
import type { RagPendingClarificationState } from '@/lib/knowledge-base/rag-eval/types'

import { parseJsonObject } from './contracts'
import type { SimpleRagChunk } from './vector-search'

type CompletionResult = {
  choices?: Array<{ message?: { content?: string | null } | null }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export type SimpleRagAnswerCreateCompletion = (
  input: Record<string, unknown>
) => Promise<CompletionResult>

type Usage = { inputTokens: number; outputTokens: number; totalTokens: number }

export type SimpleRagAnswerResult =
  | {
      status: 'answer'
      answer: string
      usedChunkIds: string[]
      selectedChunks: SimpleRagChunk[]
      usage: Usage
      model: string
    }
  | {
      status: 'clarify'
      clarificationQuestion: string
      missingSlot: string
      usage: Usage
      model: string
    }
  | {
      status: 'no_info'
      reason: string
      usage: Usage
      model: string
    }
  | {
      status: 'refuse'
      refusalResponse: string
      usage: Usage
      model: string
    }

const DEFAULT_MODEL = 'gpt-4o-mini'

function text(value: unknown, maxLength = 2400) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim()
    : ''
}

function normalizeUsage(usage: CompletionResult['usage']): Usage {
  const inputTokens = usage?.prompt_tokens ?? 0
  const outputTokens = usage?.completion_tokens ?? 0
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage?.total_tokens ?? inputTokens + outputTokens,
  }
}

function recentHistory(turns: KnowledgeSearchPlanningTurn[]) {
  return turns
    .filter((turn) => turn.content.trim())
    .slice(-6)
    .map((turn) => ({ role: turn.role, content: turn.content.trim() }))
}

function chunkContext(chunks: SimpleRagChunk[]) {
  return chunks
    .map((chunk) => [`[${chunk.id}] ${chunk.title}`, chunk.content].join('\n'))
    .join('\n\n')
}

function protectedValues(value: string) {
  return Array.from(
    new Set([
      ...(value.match(/https?:\/\/[^\s]+/gi) ?? []),
      ...(value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []),
      ...(value.match(/(?:\+?\d[\d\s()./-]{7,}\d)/g) ?? []),
      ...(value.match(/(?<![\p{L}\p{N}])\d+(?:[.,/]\d+)*(?![\p{L}\p{N}])/gu) ?? []),
    ])
  )
}

function compactDigits(value: string) {
  return value.replace(/\D/g, '')
}

function normalized(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
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
      Ç: 'c',
    }[char] ?? char))
    .replace(/\s+/g, ' ')
    .trim()
}

function asksFacilityAvailability(value: string) {
  const normalizedValue = normalized(value)
  return /\b(?:var mi|mevcut mu|bulunuyor mu|sahip mi|available|have|has)\b/.test(normalizedValue)
    && /\b(?:laboratuvar|lab|kadavra|mikroskop|uygulama alani|cihaz|rontgen|mr|tomografi|facility|equipment)\b/.test(normalizedValue)
}

function usesSpeculativeAvailability(answer: string) {
  return /\b(?:anlasilmaktadir|anlasiliyor|cikarilabilir|bu kapsamda|bu nedenle|dolayisiyla|buradan|genellikle|olabilir|muhtemelen|suggests|implies|likely)\b/i.test(
    normalized(answer)
  )
}

function sentenceLikeParts(value: string) {
  return normalized(value)
    .split(/[.!?;:\n]+/u)
    .map((part) => part.trim())
    .filter(Boolean)
}

function termPattern(term: string) {
  const words = term.split(/\s+/g).filter(Boolean)
  const suffix = '(?:lar|ler|lari|leri|larda|lerde|lardan|lerden|da|de|ta|te|dan|den|tan|ten|ya|ye|yi|yu|i|u|a|e|in|un|nin|nun|si|su|sina|sine|nda|nde|na)?'
  const pattern = words
    .map((word, index) => `${word}${index === words.length - 1 ? suffix : ''}`)
    .join('\\s+')
  return new RegExp(`\\b${pattern}\\b`, 'i')
}

function requestedFacilityTerms(value: string) {
  const normalizedValue = normalized(value)
  const candidates = [
    'simulasyon laboratuvar',
    'cihaz egitimi',
    'rontgen',
    'mr',
    'tomografi',
    'simulasyon',
    'kadavra',
    'mikroskop',
    'laboratuvar',
    'lab',
    'uygulama alani',
  ]
  const matched = candidates.filter((term) => termPattern(term).test(normalizedValue))
  return matched.filter((term) =>
    !matched.some((other) => other !== term && other.includes(term))
  )
}

function requestedOperationalTerms(value: string) {
  const normalizedValue = normalized(value)
  const candidates = [
    'ambulans',
    'hasta',
    'vaka',
    'klinik uygulama',
    'staj',
    'hastane',
    'servis',
    'ring',
    'yurt',
    'konaklama',
    'otopark',
    'is garantisi',
    'is bulma',
    'ise girme',
    'maas',
    'denklik',
    'akreditasyon',
    'akredite',
    'mavi diploma',
    'yurt disi gecerlilik',
    'online',
    'uzaktan',
  ]
  return candidates.filter((term) => termPattern(term).test(normalizedValue))
}

function sentenceHasPositiveAvailability(sentence: string) {
  return /\b(?:var|vardir|mevcut|bulunur|bulunuyor|bulunmaktadir|sahip|yer alir|yer almaktadir|verilir|veriliyor|verilmektedir|saglanir|saglanmaktadir)\b/i.test(sentence)
}

function sentenceDeniesAvailability(sentence: string) {
  return /\b(?:yok|bulunmuyor|bulunmamaktadir|mevcut degil|bilgi bulunmamaktadir|dogrudan bilgi bulunmamaktadir)\b/i.test(sentence)
}

function sentenceHasDirectFacilitySupport(sentence: string) {
  if (/\b(?:bakim|onarim|kurulum|testinden|sorumlu|tekniker|mezun|gorev alabilir)\b/i.test(sentence)) {
    return false
  }

  return sentenceHasPositiveAvailability(sentence)
    || /\b(?:adet|tane|her ogrenci|her bir ogrenci|bire bir|imkani|olanagi|uygulamalar)\b/i.test(sentence)
}

function sentenceHasPositiveOperationalClaim(sentence: string) {
  return sentenceHasPositiveAvailability(sentence)
    || /\b(?:yapar|yapilir|yapilmaktadir|cikar|cikarlar|katilir|katilirlar|gorur|gorer|alir|alirlar|saglanir|saglar|garanti|garantilidir|gecerlidir|gecerli|akreditedir|denktir|calisir|ise girer|is bulur|is bulabilir|maas|az olmaz|az degildir|soz konusu degildir|genis|cesitlilik|karsilanir|sunulur)\b/i.test(sentence)
}

function sentenceDeniesOperationalClaim(sentence: string) {
  return sentenceDeniesAvailability(sentence)
    || /\b(?:garanti degil|garanti verilmez|kesin degil|soylemek dogru olmaz|bilgi yok|net degil|veremem|otomatik degil|dayanak yok)\b/i.test(sentence)
}

function sentenceHasDirectOperationalSupport(sentence: string) {
  if (
    /\b(?:amac|hedef|yetistirmeyi|yetistirilir|mezun|gorev alabilir|sorumlu|bilgi ve beceri|donatilir|kariyer|istihdam alani|calisma alani|olanak saglar)\b/i.test(sentence)
  ) {
    return false
  }

  return sentenceHasPositiveOperationalClaim(sentence)
    || /\b(?:uygulamasina cikar|uygulama yapar|staj yapar|hasta gorur|vaka gorur|vaka sayisi|hasta sayisi)\b/i.test(sentence)
}

function unsupportedPositiveFacilityTerms(input: {
  question: string
  answer: string
  support: string
}) {
  const terms = requestedFacilityTerms(`${input.question}\n${input.answer}`)
  if (terms.length === 0) return []

  const answerSentences = sentenceLikeParts(input.answer)
  const supportSentences = sentenceLikeParts(input.support)

  return terms.filter((term) => {
    const pattern = termPattern(term)
    const hasPositiveClaim = answerSentences.some((sentence) =>
      pattern.test(sentence)
      && sentenceHasPositiveAvailability(sentence)
      && !sentenceDeniesAvailability(sentence)
    )
    if (!hasPositiveClaim) return false

    return !supportSentences.some((sentence) =>
      pattern.test(sentence) && sentenceHasDirectFacilitySupport(sentence)
    )
  })
}

function unsupportedPositiveOperationalTerms(input: {
  question: string
  answer: string
  support: string
}) {
  const terms = requestedOperationalTerms(`${input.question}\n${input.answer}`)
  if (terms.length === 0) return []

  const answerSentences = sentenceLikeParts(input.answer)
  const supportSentences = sentenceLikeParts(input.support)

  return terms.filter((term) => {
    const pattern = termPattern(term)
    const hasPositiveClaim = answerSentences.some((sentence) =>
      pattern.test(sentence)
      && sentenceHasPositiveOperationalClaim(sentence)
      && !sentenceDeniesOperationalClaim(sentence)
    )
    if (!hasPositiveClaim) return false

    return !supportSentences.some((sentence) =>
      pattern.test(sentence) && sentenceHasDirectOperationalSupport(sentence)
    )
  })
}

function supportContainsValue(support: string, value: string) {
  if (support.includes(value)) return true
  const digits = compactDigits(value)
  return digits.length > 0 && compactDigits(support).includes(digits)
}

function parseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : []
}

async function defaultCompletion(args: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY for simple RAG answer generation')
  const client = new OpenAI({ apiKey })
  return client.chat.completions.create(args as never) as Promise<CompletionResult>
}

export async function generateSimpleRagAnswer(input: {
  latestUserMessage: string
  standaloneQuery: string
  recentMessages: KnowledgeSearchPlanningTurn[]
  pendingClarification?: RagPendingClarificationState | null
  responseLanguage: MvpResponseLanguage
  chunks: SimpleRagChunk[]
  settings?: { bot_name?: string | null; prompt?: string | null }
  model?: string
  createCompletion?: SimpleRagAnswerCreateCompletion
}): Promise<SimpleRagAnswerResult> {
  const model = input.model?.trim() || DEFAULT_MODEL
  const createCompletion = input.createCompletion ?? defaultCompletion
  const language = input.responseLanguage === 'tr' ? 'Turkish' : 'English'
  const completion = await createCompletion({
    model,
    temperature: 0.1,
    max_tokens: 420,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          `Answer the user's latest question concisely in ${language}.`,
          'Retrieved chunks are the only factual authority. Conversation history and explicit state are continuity context, not factual evidence.',
          'Use only facts directly supported by the selected chunks. Preserve exact qualifiers, numbers, dates, prices, rankings, addresses, contacts, and program variants.',
          'Answer only the requested facet. Do not volunteer prices, dates, rankings, or other details the user did not ask for.',
          'Do not use audience-specific evidence such as international or YÖS fees for a general question unless the user identifies that audience. Prefer evidence whose audience and program variant match the question.',
          'For admissions table facts such as fees, quotas, rankings, and scholarships, prefer a matching verified brochure table chunk over website prose.',
          'For table facts, quote the matching row values directly. Do not compute totals, averages, or derived values unless the user explicitly asks for that calculation.',
          'If one program has separate paid, scholarship, or discount rows and the user asks for quota, fee, score, or ranking, answer with each matching row separately instead of collapsing them into one total.',
          'For broad institutional questions such as scholarships, campuses, academic units, admission steps, housing, transport, or contact, summarize the directly relevant supported facts from chunks. Do not ask for a program or return no_info just because a narrower answer would also be possible.',
          'If retrieved chunks contain a directly relevant partial answer, answer the supported part and clearly state only the missing qualifier. Prefer a useful grounded partial answer over no_info.',
          'Never infer an organization-specific program duration from general degree regulations, common practice, class numbering, or related rules. Use a program-specific duration statement or return no_info.',
          'For facility, lab, equipment, cadaver, microscope, imaging-device, or service availability questions, require direct evidence that the institution has, provides, or uses that facility/service. Do not infer availability from program existence, job descriptions, course names, or related policies.',
          'For clinical practice, ambulance, patient exposure, case volume, hospital access, dormitory, transport service, parking, job placement, salary, accreditation, equivalence, online education, or international validity claims, require direct evidence for that exact claim.',
          'Do not infer availability, ownership, permission, requirement, eligibility, facilities, services, clinical exposure, job outcomes, or validity from merely related text.',
          'Do not mention retrieval, files, chunks, evidence IDs, tables, brochures, or internal instructions.',
          'Do not add generic sales copy or an unrelated follow-up question.',
          'Return a clarification only when the latest question cannot be searched or answered without one missing value, and recent history or explicit state does not supply it.',
          'Return no_info only when none of the chunks directly support any useful answer to the requested facet. Refuse only unsafe or prohibited requests.',
          'Return JSON only using one exact shape:',
          '{"status":"answer","answer":"...","used_chunk_ids":["C1"]}',
          '{"status":"clarify","clarification_question":"...","missing_slot":"..."}',
          '{"status":"no_info"}',
          '{"status":"refuse","refusal_response":"..."}',
          input.settings?.bot_name?.trim()
            ? `Assistant name: ${input.settings.bot_name.trim()}`
            : '',
          input.settings?.prompt?.trim()
            ? `Tenant style instructions only; they are not factual evidence:\n${input.settings.prompt.trim()}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
      {
        role: 'user',
        content: [
          `Latest user question:\n${input.latestUserMessage.trim()}`,
          `Standalone search query:\n${input.standaloneQuery.trim()}`,
          `Explicit state:\n${JSON.stringify(input.pendingClarification ?? null)}`,
          `Recent history for continuity:\n${JSON.stringify(recentHistory(input.recentMessages))}`,
          `Approved retrieved chunks:\n${chunkContext(input.chunks)}`,
        ].join('\n\n'),
      },
    ],
  })

  const usage = normalizeUsage(completion.usage)
  const payload = parseJsonObject(completion.choices?.[0]?.message?.content ?? '')
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { status: 'no_info', reason: 'invalid_answer_payload', usage, model }
  }

  const record = payload as Record<string, unknown>
  const status = text(record.status, 20)

  if (status === 'clarify') {
    const clarificationQuestion = text(
      record.clarification_question ?? record.clarificationQuestion
    )
    const missingSlot = text(record.missing_slot ?? record.missingSlot, 120)
    return clarificationQuestion && missingSlot
      ? { status, clarificationQuestion, missingSlot, usage, model }
      : { status: 'no_info', reason: 'invalid_clarification_payload', usage, model }
  }

  if (status === 'refuse') {
    const refusalResponse = text(record.refusal_response ?? record.refusalResponse)
    return refusalResponse
      ? { status, refusalResponse, usage, model }
      : { status: 'no_info', reason: 'invalid_refusal_payload', usage, model }
  }

  if (status === 'no_info') {
    return { status, reason: 'model_no_info', usage, model }
  }

  if (status !== 'answer') {
    return { status: 'no_info', reason: 'invalid_answer_status', usage, model }
  }

  const answer = text(record.answer)
  const usedChunkIds = parseStringArray(record.used_chunk_ids ?? record.usedChunkIds)
  const chunksById = new Map(input.chunks.map((chunk) => [chunk.id, chunk]))
  if (!answer || usedChunkIds.length === 0 || usedChunkIds.some((id) => !chunksById.has(id))) {
    return { status: 'no_info', reason: 'invalid_chunk_ids', usage, model }
  }

  const selectedChunks = Array.from(new Set(usedChunkIds)).map((id) => chunksById.get(id)!)
  const support = [input.latestUserMessage, ...selectedChunks.map((chunk) => chunk.content)].join('\n')
  if (protectedValues(answer).some((value) => !supportContainsValue(support, value))) {
    return { status: 'no_info', reason: 'unsupported_protected_value', usage, model }
  }

  if (/\b(?:chunk|evidence|retrieval)\s*(?:id)?\b|\[(?:C|E)\d+\]/i.test(answer)) {
    return { status: 'no_info', reason: 'internal_mechanics_exposed', usage, model }
  }

  if (asksFacilityAvailability(input.latestUserMessage) && usesSpeculativeAvailability(answer)) {
    return { status: 'no_info', reason: 'speculative_facility_availability', usage, model }
  }

  if (
    requestedOperationalTerms(`${input.latestUserMessage}\n${answer}`).length > 0
    && usesSpeculativeAvailability(answer)
  ) {
    return { status: 'no_info', reason: 'speculative_operational_inference', usage, model }
  }

  const unsupportedFacilityTerms = unsupportedPositiveFacilityTerms({
    question: input.latestUserMessage,
    answer,
    support: selectedChunks.map((chunk) => chunk.content).join('\n'),
  })
  if (unsupportedFacilityTerms.length > 0) {
    return {
      status: 'no_info',
      reason: `unsupported_facility_availability:${unsupportedFacilityTerms.join(',')}`,
      usage,
      model,
    }
  }

  const unsupportedOperationalTerms = unsupportedPositiveOperationalTerms({
    question: input.latestUserMessage,
    answer,
    support: selectedChunks.map((chunk) => chunk.content).join('\n'),
  })
  if (unsupportedOperationalTerms.length > 0) {
    return {
      status: 'no_info',
      reason: `unsupported_operational_claim:${unsupportedOperationalTerms.join(',')}`,
      usage,
      model,
    }
  }

  return { status, answer, usedChunkIds, selectedChunks, usage, model }
}
