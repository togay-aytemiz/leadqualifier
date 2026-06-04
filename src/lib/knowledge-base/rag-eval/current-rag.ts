import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateUsageCreditCost } from '@/lib/billing/credit-cost'
import { processInboundAiPipeline } from '@/lib/channels/inbound-ai-pipeline'
import type { OutboundMessageInput } from '@/lib/channels/outbound-message'
import type { RagProviderCitation, RagProviderResult } from './types'

type CurrentRagDocumentRow = {
  id: string
  title: string | null
  source: string | null
}

type CurrentRagUsageRow = {
  category: string
  model: string
  input_tokens: number | null
  output_tokens: number | null
  total_tokens: number | null
}

type CurrentRagBotMessageRow = {
  id: string
  content: string | null
  metadata: {
    sources?: unknown
  } | null
  created_at: string
}

type CurrentRagConversationRow = {
  id: string
  tags: unknown
}

export type CurrentRagQuestionInput = {
  supabase: SupabaseClient
  organizationId: string
  question: string
  runId: string
  caseId: string
}

function asOutboundText(input: OutboundMessageInput) {
  if (typeof input === 'string') return input
  if ('content' in input) return input.content
  return '[non-text outbound message]'
}

function safeCaseId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) || 'case'
}

function readSourceIds(message: CurrentRagBotMessageRow | null) {
  const sources = message?.metadata?.sources
  if (!Array.isArray(sources)) return []
  return sources.filter(
    (source): source is string => typeof source === 'string' && source.length > 0
  )
}

async function loadConversation(input: CurrentRagQuestionInput, contactId: string) {
  const { data, error } = await input.supabase
    .from('conversations')
    .select('id, tags')
    .eq('organization_id', input.organizationId)
    .eq('platform', 'whatsapp')
    .eq('contact_phone', contactId)
    .maybeSingle()

  if (error) throw error
  return data as CurrentRagConversationRow | null
}

async function tagConversation(
  input: CurrentRagQuestionInput,
  conversation: CurrentRagConversationRow | null
) {
  if (!conversation?.id) return
  const tags = Array.isArray(conversation.tags) ? conversation.tags : []
  await input.supabase
    .from('conversations')
    .update({
      tags: Array.from(
        new Set([...tags, 'codex_live_qa', 'codex_yiu_demo_qa', 'codex_rag_compare_qa'])
      ),
      contact_name: `Codex RAG Compare ${input.caseId}`,
    })
    .eq('id', conversation.id)
}

async function loadLatestBotMessage(input: CurrentRagQuestionInput, conversationId: string | null) {
  if (!conversationId) return null
  const { data, error } = await input.supabase
    .from('messages')
    .select('id, content, metadata, created_at')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'bot')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw error
  return ((data ?? []) as CurrentRagBotMessageRow[])[0] ?? null
}

async function loadCitations(input: CurrentRagQuestionInput, sourceIds: string[]) {
  if (sourceIds.length === 0) return []
  const { data, error } = await input.supabase
    .from('knowledge_documents')
    .select('id, title, source')
    .in('id', sourceIds)

  if (error) throw error
  const rows = (data ?? []) as CurrentRagDocumentRow[]
  const byId = new Map(rows.map((row) => [row.id, row]))

  return sourceIds.map<RagProviderCitation>((sourceId) => {
    const row = byId.get(sourceId)
    return {
      providerSourceId: sourceId,
      title: row?.title ?? undefined,
      url: row?.source ?? undefined,
    }
  })
}

async function loadUsage(input: CurrentRagQuestionInput, conversationId: string | null) {
  if (!conversationId) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCredits: 0,
    }
  }

  const { data, error } = await input.supabase
    .from('organization_ai_usage')
    .select('category, model, input_tokens, output_tokens, total_tokens')
    .eq('organization_id', input.organizationId)
    .filter('metadata->>conversation_id', 'eq', conversationId)

  if (error) throw error
  const rows = (data ?? []) as CurrentRagUsageRow[]
  return rows.reduce(
    (usage, row) => {
      const inputTokens = Number(row.input_tokens ?? 0)
      const outputTokens = Number(row.output_tokens ?? 0)
      usage.inputTokens += inputTokens
      usage.outputTokens += outputTokens
      usage.totalTokens += Number(row.total_tokens ?? inputTokens + outputTokens)
      usage.estimatedCredits += calculateUsageCreditCost({ inputTokens, outputTokens })
      return usage
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCredits: 0,
    }
  )
}

function isRefusal(answer: string) {
  return /(?:net bilgi yok|net bir bilgi yok|net(?: bir)? bilgi bulunmamaktadır|net(?: bir)? bilgi bulunamamaktadır|bilgi bulunamadı|bilgi bulunmamaktadır|dosyalarda.*bilgi bulunmamaktadır|dosyalarda.*yer almamaktadır|dosyalarda.*belirtilmemiştir|belgelerde.*bilgi bulunmamaktadır|belgelerde.*yer almamaktadır|belgelerde.*belirtilmemiştir|dokümanlarda.*bilgi bulunmamaktadır|dokümanlarda.*yer almamaktadır|dokümanlarda.*belirtilmemiştir|açık(?: bir)? bilgi bulunmamaktadır|doğrudan(?: net)?(?: bir)? bilgi bulunmamaktadır|doğrudan.*belirtilmemiştir|knowledge base|bilgi bankasında|no clear information|not in the knowledge base)/i.test(
    answer
  )
}

export async function runCurrentRagQuestion(
  input: CurrentRagQuestionInput
): Promise<RagProviderResult> {
  const startedAt = Date.now()
  const caseId = safeCaseId(input.caseId)
  const contactId = `codex-rag-compare-${input.runId}-${caseId}`
  const outbound: string[] = []

  await processInboundAiPipeline({
    supabase: input.supabase,
    organizationId: input.organizationId,
    platform: 'whatsapp',
    source: 'whatsapp',
    contactId,
    contactName: `Codex RAG Compare ${input.caseId}`,
    text: input.question,
    inboundMessageId: `codex-rag-compare-${input.runId}-${caseId}`,
    inboundMessageIdMetadataKey: 'codex_rag_compare_message_id',
    inboundMessageMetadata: {
      codex_rag_compare_qa: true,
      codex_rag_compare_run_id: input.runId,
      codex_rag_compare_case_id: input.caseId,
    },
    sendOutbound: async (content) => {
      outbound.push(asOutboundText(content))
      return { providerMessageId: `codex-rag-compare-out-${input.runId}-${caseId}` }
    },
    logPrefix: 'Codex RAG Compare',
  })

  const conversation = await loadConversation(input, contactId)
  await tagConversation(input, conversation)
  const botMessage = await loadLatestBotMessage(input, conversation?.id ?? null)
  const answer = outbound.at(-1) ?? botMessage?.content ?? ''
  const citations = await loadCitations(input, readSourceIds(botMessage))
  const usage = await loadUsage(input, conversation?.id ?? null)

  return {
    provider: 'current_rag',
    answer,
    citations,
    refusal: isRefusal(answer),
    timingsMs: {
      total: Date.now() - startedAt,
    },
    usage,
  }
}
