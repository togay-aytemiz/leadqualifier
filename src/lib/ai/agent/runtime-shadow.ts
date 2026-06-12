import { compileBehaviorPolicyFromSettings } from '@/lib/ai/behavior-policy'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'
import type { RagTypedConversationState } from '@/lib/knowledge-base/rag-eval/typed-conversation-state'
import {
  DEFAULT_AGENT_BUDGET,
  type AgentChannel,
  type AgentRequest,
} from './contracts'
import {
  runInternalAgentShadow,
  type InternalAgentShadowDiagnostics,
} from './shadow'
import { planInternalAgentTurn, type AgentPlannerCreateCompletion } from './planner'
import type { InternalAgentToolDescriptor } from './tool-registry'

type BehaviorSettings = {
  bot_name?: string | null
  prompt?: string | null
} | null | undefined

type ObservedAgentResult = {
  answer?: string
  refusal?: boolean
  citations?: unknown[]
  diagnostics?: Record<string, unknown>
}

export type InternalAgentTurnShadowInput = {
  organizationId?: string | null
  conversationId?: string
  channel?: AgentChannel
  locale?: string
  latestUserMessage: string
  recentMessages?: KnowledgeSearchPlanningTurn[]
  conversationState?: RagTypedConversationState | null
  settings?: BehaviorSettings
  sourcePriorityGroups?: string[]
  observedResult: ObservedAgentResult
  plannerModel?: string
  createCompletion?: AgentPlannerCreateCompletion
  enabled?: boolean
}

export const INTERNAL_AGENT_SOURCE_GROUPS = [
  'brochure',
  'website_html',
  'approved_pdf',
  'structured_catalog',
  'official_channel',
  'knowledge_base',
  'conversation_state',
  'behavior_policy',
  'skills',
] as const

export const INTERNAL_AGENT_TOOL_DESCRIPTORS: InternalAgentToolDescriptor[] = [
  {
    name: 'internal.catalog',
    description: 'Read approved structured facts and catalog entries.',
    capability: 'structured_fact_lookup',
    sourceGroups: ['structured_catalog', 'knowledge_base'],
    costClass: 'free',
    canRunInParallel: true,
  },
  {
    name: 'internal.table',
    description: 'Read approved table facts such as fees, quotas, discounts, and locations.',
    capability: 'table_fact_lookup',
    sourceGroups: ['brochure', 'structured_catalog', 'knowledge_base'],
    costClass: 'free',
    canRunInParallel: true,
  },
  {
    name: 'internal.file_search',
    description: 'Search approved uploaded PDFs, brochure text, and crawled website corpus.',
    capability: 'approved_corpus_retrieval',
    sourceGroups: ['brochure', 'website_html', 'approved_pdf', 'knowledge_base'],
    costClass: 'medium',
    canRunInParallel: true,
  },
  {
    name: 'internal.hybrid_retrieval',
    description: 'Use the existing hybrid retrieval path over the approved knowledge base.',
    capability: 'hybrid_retrieval',
    sourceGroups: ['knowledge_base', 'website_html', 'approved_pdf'],
    costClass: 'low',
    canRunInParallel: true,
  },
  {
    name: 'internal.claim_verifier',
    description: 'Verify answer claims against gathered evidence before customer presentation.',
    capability: 'claim_verification',
    sourceGroups: ['brochure', 'website_html', 'approved_pdf', 'structured_catalog', 'knowledge_base'],
    costClass: 'low',
    canRunInParallel: false,
  },
  {
    name: 'internal.typed_state',
    description: 'Resolve follow-up turns and pending clarifications using conversation state.',
    capability: 'conversation_state_resolution',
    sourceGroups: ['conversation_state'],
    costClass: 'free',
    canRunInParallel: false,
  },
  {
    name: 'internal.presenter',
    description: 'Apply organization behavior policy and customer-facing answer style.',
    capability: 'answer_presentation',
    sourceGroups: ['behavior_policy'],
    costClass: 'low',
    canRunInParallel: false,
  },
  {
    name: 'internal.skill',
    description: 'Use approved skill answers when a configured skill exactly matches the turn.',
    capability: 'skill_response',
    sourceGroups: ['skills'],
    costClass: 'free',
    canRunInParallel: true,
  },
]

function uniqueNonEmptyStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]))
}

export function buildInternalAgentTurnShadowRequest(
  input: InternalAgentTurnShadowInput
): AgentRequest {
  const behaviorPolicy = compileBehaviorPolicyFromSettings(input.settings)
  const priority = uniqueNonEmptyStrings([
    ...(input.sourcePriorityGroups ?? []),
    ...behaviorPolicy.sourcePriority,
    'brochure',
    'website_html',
    'approved_pdf',
    'structured_catalog',
    'knowledge_base',
  ])
  const allowedSourceGroups = uniqueNonEmptyStrings([
    ...INTERNAL_AGENT_SOURCE_GROUPS,
    ...priority,
  ])

  return {
    organizationId: input.organizationId ?? 'unknown',
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    channel: input.channel ?? 'demo_chat',
    locale: input.locale ?? 'tr',
    latestUserMessage: input.latestUserMessage,
    recentMessages: input.recentMessages?.slice(-10) ?? [],
    conversationState: input.conversationState ?? null,
    behaviorPolicy,
    sourcePolicy: {
      allowedSourceGroups,
      priority,
    },
    budget: DEFAULT_AGENT_BUDGET,
  }
}

export async function runInternalAgentTurnShadow(
  input: InternalAgentTurnShadowInput
): Promise<InternalAgentShadowDiagnostics> {
  return runInternalAgentShadow({
    organizationId: input.organizationId,
    observedResult: input.observedResult,
    enabled: input.enabled,
    run: async () => {
      const planned = await planInternalAgentTurn({
        request: buildInternalAgentTurnShadowRequest(input),
        toolDescriptors: INTERNAL_AGENT_TOOL_DESCRIPTORS,
        model: input.plannerModel,
        createCompletion: input.createCompletion,
      })

      return {
        plan: planned.plan,
        reason: planned.reason,
        usage: {
          inputTokens: planned.usage.inputTokens,
          outputTokens: planned.usage.outputTokens,
          estimatedCredits: planned.usage.estimatedCredits,
        },
      }
    },
  })
}
