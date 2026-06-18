import OpenAI from 'openai'

import type { MvpResponseLanguage } from '@/lib/ai/language'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'
import type { RagPendingClarificationState } from '@/lib/knowledge-base/rag-eval/types'

import {
  parseJsonObject,
  parseSimpleRagRewritePlan,
  type SimpleRagRewritePlan,
} from './contracts'

type CompletionResult = {
  choices?: Array<{ message?: { content?: string | null } | null }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export type SimpleRagCreateCompletion = (
  input: Record<string, unknown>
) => Promise<CompletionResult>

const DEFAULT_MODEL = 'gpt-4.1-mini'

function normalizeForIntent(value: string) {
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
    }[char] ?? char))
    .replace(/\s+/g, ' ')
    .trim()
}

function isConversationalDirectMessage(value: string) {
  const normalized = normalizeForIntent(value)
  if (!normalized) return true
  if (/^(?:merhaba|selam|slm|hello|hi|hey|tesekkur(?:ler)?|sag ol|saol|thanks|thank you)\b/.test(normalized)) {
    return true
  }
  if (/\b(?:sen|siz|bot|asistan|assistant|ai|yapay zeka|chatgpt|qualy)\b.*\b(?:kimsin|nesin|misin|misiniz|who are you|what are you)\b/.test(normalized)) {
    return true
  }
  return /\b(?:sana|size|asistana)?\s*(?:ne|neler)\s+sorabilirim\b/.test(normalized)
    || /\b(?:what can i ask|how can you help)\b/.test(normalized)
}

function isSensitiveActionBoundary(value: string) {
  const normalized = normalizeForIntent(value)
  return /\b(?:iban(?:i)?|kredi kart\w*|kart\w*\s+bilg|kartimi|tc kimlik|sifre|password|credit card|payment detail|odeme bilg|odeme al)\b/.test(normalized)
}

function sensitiveActionRefusal(responseLanguage: MvpResponseLanguage) {
  return responseLanguage === 'tr'
    ? 'Güvenliğiniz için kredi kartı, IBAN, TC kimlik, şifre veya ödeme bilgilerinizi burada paylaşmayın. Ödeme ve kayıt işlemleri için üniversitenin resmi kanallarını kullanın.'
    : 'For your safety, do not share credit card, IBAN, national ID, password, or payment details here. Please use the university’s official channels for payment and registration.'
}

function isOffTopicTutoringRequest(value: string) {
  const normalized = normalizeForIntent(value)
  return /\b(?:ders|matematik|geometri|turkce|fizik|kimya|biyoloji|tyt|ayt|exam|lesson)\b/.test(normalized)
    && /\b(?:calistir\w*|coz\w*|ogret\w*|anlat\w*|tutor\w*|teach\w*|solve\w*)\b/.test(normalized)
}

function looksLikeKnowledgeQuestion(value: string) {
  const normalized = normalizeForIntent(value)
  if (!normalized) return false
  if (isConversationalDirectMessage(value) || isSensitiveActionBoundary(value)) return false
  if (/[?？]/u.test(value)) return true
  return /\b(?:varmi|var mi|var mı|nerde|nerede|nereye|hangi|nedir|ne demek|nasil|nasıl|kac|kaç|ne kadar|mi|mı|mu|mü|misin|mısın|musun|müsün|miyim|mıyım|olur mu|veriyor musunuz|yapiliyor mu|yapılıyor mu|kullaniliyor mu|kullanılıyor mu|geciyor mu|geçiyor mu)\b/.test(normalized)
}

function primaryOrganizationName(organizationContext?: string | null) {
  return organizationContext?.split('/')[0]?.trim() || ''
}

function fallbackStandaloneQuery(input: {
  latestUserMessage: string
  organizationContext?: string | null
}) {
  const message = input.latestUserMessage.trim()
  const organization = primaryOrganizationName(input.organizationContext)
  if (!organization) return message
  const normalizedMessage = normalizeForIntent(message)
  const normalizedOrganization = normalizeForIntent(organization)
  return normalizedMessage.includes(normalizedOrganization)
    ? message
    : `${organization} ${message}`.trim()
}

function enforcePlanBoundary(input: {
  plan: SimpleRagRewritePlan
  latestUserMessage: string
  organizationContext?: string | null
  responseLanguage: MvpResponseLanguage
}): SimpleRagRewritePlan {
  if (isSensitiveActionBoundary(input.latestUserMessage)) {
    return {
      status: 'refuse',
      refusalResponse: sensitiveActionRefusal(input.responseLanguage),
      responseLanguage: input.responseLanguage,
    }
  }

  if (input.plan.status !== 'respond') return input.plan
  if (isConversationalDirectMessage(input.latestUserMessage)) {
    return input.plan
  }
  if (isOffTopicTutoringRequest(input.latestUserMessage)) {
    const organization = primaryOrganizationName(input.organizationContext)
    return {
      status: 'refuse',
      refusalResponse: input.responseLanguage === 'tr'
        ? `Bu konuda ders çalıştırma yapamam; ${organization ? `${organization} programları` : 'kurumun programları'}, ücretleri, bursları, kontenjanları, kampüsleri veya kayıt süreciyle ilgili yardımcı olabilirim.`
        : `I cannot provide tutoring here, but I can help with ${organization ? `${organization}'s programs` : 'the institution’s programs'}, fees, scholarships, quotas, campuses, or admission steps.`,
      responseLanguage: input.responseLanguage,
    }
  }
  if (!looksLikeKnowledgeQuestion(input.latestUserMessage)) return input.plan
  return {
    status: 'search',
    standaloneQuery: fallbackStandaloneQuery({
      latestUserMessage: input.latestUserMessage,
      organizationContext: input.organizationContext,
    }),
    responseLanguage: input.plan.responseLanguage,
  }
}

function normalizeUsage(usage: CompletionResult['usage']) {
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

async function defaultCompletion(args: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY for simple RAG query rewriting')
  const client = new OpenAI({ apiKey })
  return client.chat.completions.create(args as never) as Promise<CompletionResult>
}

function systemPrompt(responseLanguage: MvpResponseLanguage) {
  return [
    'Rewrite the latest user question into one clear standalone search query.',
    'Assistant behavior/scope instructions may be provided. Use them only to identify the active organization, assistant identity, in-domain scope, and boundaries.',
    'Do not copy long assistant instructions into the standalone query. Do not treat those instructions as retrieved factual evidence.',
    'Use organization context, explicit state, and recent conversation history only to resolve scope and references such as this, it, that plan, that program, or a short correction.',
    'Never ask which institution when organization context is provided. Treat that organization as the active scope.',
    'The latest user correction overrides earlier assistant assumptions.',
    'Do not answer the question when it requires factual organization knowledge; return search. Do not invent facts, values, entities, source labels, or query lists.',
    'Optimize search queries with concise terms implied by the requested facet, such as address or location for a where question, without adding factual claims.',
    'For campus or location questions, include the equivalents of campus, location, and address in the user language so retrieval can find address records.',
    'For fees, quotas, rankings, or scholarships, the standalone query MUST include local or domestic admissions, official table, and verified brochure terms in the user language. Do not let a generic question drift into international-student or foreign-student pricing.',
    'For generic registration or enrollment requirements with no explicit international, transfer, or graduate marker, include domestic central-placement or local-admissions terms, registration procedures, and required documents in the user language. For Turkish university contexts, include both ÖSYM and the historical ÖSYS acronym so official registration pages are retrievable. Do not let a generic registration question drift into international-student rules; if applicant type is essential and unresolved, return one clarification instead.',
    'For faculty, school, department, or program-list questions, the standalone query MUST include academic units, program catalog, and official brochure terms in the user language.',
    'For program length or study-duration questions, the standalone query MUST include education duration, education time, and years terms in the user language. Prefer program catalog wording over general degree regulations.',
    'Search rewrite example: organization "Example University" + latest question "where are the campuses?" becomes "Example University campus locations and addresses".',
    'Turkish search rewrite example: organization "Örnek Üniversitesi" + latest question "kampüsler nerede?" becomes "Örnek Üniversitesi kampüs yerleşke adresleri".',
    'Turkish catalog rewrite example: organization "Örnek Üniversitesi" + latest question "hangi fakülteler var?" becomes "Örnek Üniversitesi fakülte yüksekokul akademik birimler tanıtım broşürü program listesi".',
    'Turkish fee rewrite example: organization "Örnek Üniversitesi" + latest question "Hemşirelik ücreti ne kadar?" becomes "Örnek Üniversitesi Hemşirelik güncel resmi öğrenim ücreti ücret tablosu tanıtım broşürü".',
    'Turkish registration rewrite example: organization "Örnek Üniversitesi" + latest question "kesin kayıt için ne gerekli?" becomes "Örnek Üniversitesi yerel aday YKS ÖSYM ÖSYS kayıt işlemleri kayıt için gerekli belgeler".',
    'Turkish duration rewrite example: organization "Örnek Üniversitesi" + latest question "Tıp Fakültesi kaç yıllık?" becomes "Örnek Üniversitesi Tıp Fakültesi eğitim süresi education time years".',
    'Return respond only for conversational messages that do not need knowledge-base facts, such as greetings, thanks, assistant identity, or general preference guidance. Never put organization facts in a respond result. For identity questions, use the provided assistant identity. If asked whether you are ChatGPT or a human, clearly say no and identify yourself as the configured AI assistant.',
    'If the latest question is already standalone, preserve its meaning and requested facet.',
    'Clarify only when an unresolved missing value materially changes what must be searched. Ask exactly one specific question.',
    'Refuse unsafe or prohibited requests, including payment credential collection or requests for card, IBAN, national ID, or password handling. Never refuse an ordinary knowledge-base miss.',
    `Default response language: ${responseLanguage}.`,
    'Return JSON only using one exact shape:',
    '{"status":"search","standalone_query":"...","response_language":"tr|en"}',
    '{"status":"respond","response":"...","response_language":"tr|en"}',
    '{"status":"clarify","clarification_question":"...","missing_slot":"...","response_language":"tr|en"}',
    '{"status":"refuse","refusal_response":"...","response_language":"tr|en"}',
  ].join('\n')
}

export async function rewriteSimpleRagQuery(input: {
  latestUserMessage: string
  recentMessages: KnowledgeSearchPlanningTurn[]
  organizationContext?: string | null
  assistantInstructionContext?: string | null
  assistantName?: string | null
  pendingClarification?: RagPendingClarificationState | null
  responseLanguage: MvpResponseLanguage
  model?: string
  createCompletion?: SimpleRagCreateCompletion
}): Promise<{
  plan: SimpleRagRewritePlan
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
  model: string
}> {
  const model = input.model?.trim() || DEFAULT_MODEL
  const createCompletion = input.createCompletion ?? defaultCompletion
  const completion = await createCompletion({
    model,
    temperature: 0,
    max_tokens: 220,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt(input.responseLanguage) },
      {
        role: 'user',
        content: [
          `Latest user message:\n${input.latestUserMessage.trim()}`,
          `Organization context:\n${input.organizationContext?.trim() || 'Not provided'}`,
          `Assistant behavior/scope instructions:\n${input.assistantInstructionContext?.trim().slice(0, 1200) || 'Not provided'}`,
          `Assistant identity:\n${input.assistantName?.trim() || 'AI assistant'}`,
          `Explicit state:\n${JSON.stringify(input.pendingClarification ?? null)}`,
          `Recent history:\n${JSON.stringify(recentHistory(input.recentMessages))}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
  })

  const payload = parseJsonObject(completion.choices?.[0]?.message?.content ?? '')
  const parsedPlan = parseSimpleRagRewritePlan(payload)
  const plan = parsedPlan
    ? enforcePlanBoundary({
        plan: parsedPlan,
        latestUserMessage: input.latestUserMessage,
        organizationContext: input.organizationContext,
        responseLanguage: input.responseLanguage,
      })
    : null
  if (!plan) throw new Error('Simple RAG query rewriter returned invalid JSON')

  return { plan, usage: normalizeUsage(completion.usage), model }
}
