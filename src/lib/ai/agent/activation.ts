import { calculateUsageCreditCost } from '@/lib/billing/credit-cost'
import {
  runInternalAgentController,
  type AgentVerifierResult,
  type ControllerResult,
} from './controller'
import type { AgentEvidenceGraphSnapshot } from './evidence-graph'
import type { AgentPlan, AgentRequest, AgentToolResult } from './contracts'
import { planInternalAgentTurn, type AgentPlannerCreateCompletion } from './planner'
import {
  buildInternalAgentTurnShadowRequest,
  INTERNAL_AGENT_TOOL_DESCRIPTORS,
  type InternalAgentTurnShadowInput,
} from './runtime-shadow'
import { createInternalAgentToolRegistry, type InternalAgentTool } from './tool-registry'

export type InternalAgentActivationStatus = 'completed' | 'error' | 'skipped'

export type InternalAgentActivationDiagnostics = {
  status: InternalAgentActivationStatus
  decision?: ControllerResult['decision']
  reason?: string
  activated: boolean
  fallbackToCurrent: boolean
  plannedTools: string[]
  claimCount: number
  controller?: {
    trace: ControllerResult['trace']
    verifiedPartialClaimIds: string[]
  }
  clarification?: {
    question: string
    missingSlots: string[]
  }
  usage?: {
    inputTokens: number
    outputTokens: number
    estimatedCredits: number
  }
}

export type InternalAgentActivatedCurrentResult = {
  answer: string
  refusal?: boolean
  citations?: unknown[]
  diagnostics?: Record<string, unknown>
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    estimatedCredits?: number
  }
}

export type InternalAgentActivatedResult<T extends InternalAgentActivatedCurrentResult> = {
  result: T
  diagnostics: InternalAgentActivationDiagnostics
}

type CurrentResultFactory<T extends InternalAgentActivatedCurrentResult> = () => Promise<T>

type ActivationInput<T extends InternalAgentActivatedCurrentResult> = {
  request: AgentRequest
  executeCurrent: CurrentResultFactory<T>
  currentResult?: T | null
  createPlannerCompletion?: AgentPlannerCreateCompletion
  createPresenterCompletion?: AgentPlannerCreateCompletion
  plannerModel?: string
  presenterModel?: string
  enabled?: boolean
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim()).map((value) => value.trim())))
}

function plannedTools(plan?: AgentPlan): string[] {
  return unique((plan?.steps ?? []).map((step) => step.tool))
}

export function isInternalAgentActivationEnabled(
  organizationId?: string | null,
  explicit?: boolean
): boolean {
  if (explicit !== undefined) return explicit
  if (process.env.INTERNAL_AGENT_ACTIVATION === '0') return false
  if (!process.env.OPENAI_API_KEY?.trim()) return false

  const allowlist = (process.env.INTERNAL_AGENT_ACTIVATION_ORG_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  return allowlist.length === 0 || Boolean(organizationId && allowlist.includes(organizationId))
}

function isActivationEnabled(request: AgentRequest, explicit?: boolean): boolean {
  return isInternalAgentActivationEnabled(request.organizationId, explicit)
}

function sourceGroupFromArgs(args: Record<string, unknown>) {
  const value = args.source_groups ?? args.sourceGroups
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined
}

function usageFromCurrent(current: InternalAgentActivatedCurrentResult) {
  const inputTokens = current.usage?.inputTokens ?? 0
  const outputTokens = current.usage?.outputTokens ?? 0
  return {
    inputTokens,
    outputTokens,
    estimatedCredits:
      current.usage?.estimatedCredits ?? calculateUsageCreditCost({ inputTokens, outputTokens }),
  }
}

function currentLooksSupported(current: InternalAgentActivatedCurrentResult) {
  if (!hasText(current.answer)) return false
  if (current.refusal !== true) return true

  const strictVerdict = String(current.diagnostics?.strictVerdict ?? '')
  return (
    strictVerdict === 'catalog_unsupported_existence' ||
    /^catalog_.+(?:scope|guard|boundary|fact|existence)$/i.test(strictVerdict)
  )
}

function createCurrentEvidenceTool<T extends InternalAgentActivatedCurrentResult>(input: {
  name: InternalAgentTool['name']
  sourceGroups: string[]
  getCurrent: CurrentResultFactory<T>
}): InternalAgentTool {
  return {
    name: input.name,
    description: `Activated bridge for ${input.name}`,
    capability: 'activated_current_provider_bridge',
    sourceGroups: input.sourceGroups,
    costClass: 'medium',
    canRunInParallel: false,
    execute: async ({ args, claimIds }) => {
      const current = await input.getCurrent()
      const currentRecord = current as unknown as Record<string, unknown>
      const supported = currentLooksSupported(current) ? claimIds : []
      return {
        tool: input.name,
        status: 'success',
        evidence: hasText(current.answer)
          ? [
              {
                id: `${input.name}-current-answer`,
                sourceId: String(
                  currentRecord.provider ??
                    current.diagnostics?.source ??
                    current.diagnostics?.response_kind ??
                    'current_provider'
                ),
                ...(sourceGroupFromArgs(args) ? { sourceGroup: sourceGroupFromArgs(args) } : {}),
                quote: current.answer,
                structuredValue: {
                  refusal: Boolean(current.refusal),
                  citations: current.citations ?? [],
                  diagnostics: current.diagnostics ?? {},
                },
              },
            ]
          : [],
        supportedClaimIds: supported,
        usage: usageFromCurrent(current),
        diagnostics: {
          activation_bridge: true,
          current_refusal: Boolean(current.refusal),
        },
      } satisfies AgentToolResult
    },
  }
}

function createActivationRegistry<T extends InternalAgentActivatedCurrentResult>(
  getCurrent: CurrentResultFactory<T>
) {
  const tools = INTERNAL_AGENT_TOOL_DESCRIPTORS.map((descriptor): InternalAgentTool => {
    if (descriptor.name === 'internal.typed_state') {
      return {
        ...descriptor,
        execute: async ({ request }) => ({
          tool: descriptor.name,
          status: 'success',
          evidence: [
            {
              id: 'typed-state-current',
              sourceId: 'conversation_state',
              sourceGroup: 'conversation_state',
              structuredValue: request.conversationState ?? null,
            },
          ],
          supportedClaimIds: [],
          diagnostics: { activation_bridge: true },
        }),
      }
    }

    if (descriptor.name === 'internal.presenter' || descriptor.name === 'internal.claim_verifier') {
      return {
        ...descriptor,
        execute: async ({ claimIds }) => ({
          tool: descriptor.name,
          status: 'success',
          evidence: [
            {
              id: `${descriptor.name}-boundary`,
              sourceId: descriptor.name,
              sourceGroup: descriptor.sourceGroups[0],
              structuredValue: { bridge: true },
            },
          ],
          supportedClaimIds: claimIds,
          diagnostics: { activation_bridge: true },
        }),
      }
    }

    return createCurrentEvidenceTool({
      name: descriptor.name,
      sourceGroups: descriptor.sourceGroups,
      getCurrent,
    })
  })

  return createInternalAgentToolRegistry(tools)
}

function verifyActivationGraph(
  graph: AgentEvidenceGraphSnapshot,
  plan: AgentPlan
): AgentVerifierResult {
  void plan
  const claimIds = graph.claims.map((claim) => claim.id)
  const supported = new Set(
    graph.claims.filter((claim) => claim.status === 'supported').map((claim) => claim.id)
  )
  const conflicted = graph.claims
    .filter((claim) => claim.status === 'conflicted')
    .map((claim) => claim.id)

  if (conflicted.length > 0) {
    return {
      decision: 'no_info',
      reason: 'conflicting_evidence',
      unsupportedClaimIds: conflicted,
    }
  }
  if (claimIds.length > 0 && claimIds.every((claimId) => supported.has(claimId))) {
    return { decision: 'answer', reason: 'all_claims_supported' }
  }
  if (graph.attempts.length === 0) return { decision: 'retry', reason: 'no_attempts' }
  return {
    decision: 'retry',
    reason: 'claims_unresolved',
    unsupportedClaimIds: claimIds.filter((claimId) => !supported.has(claimId)),
  }
}

function noInfoAnswer(request: AgentRequest) {
  return request.locale.toLowerCase().startsWith('tr')
    ? 'Bu konuda onaylı bilgiler içinde net bir bilgi bulamadım. İsterseniz kapsam içindeki program, ücret, kayıt, kampüs veya iletişim başlıklarından biriyle daha net sorabilirsiniz.'
    : 'I could not find clear approved information about this. You can ask more specifically about an in-scope program, price, registration, campus, or contact topic.'
}

function refuseAnswer(request: AgentRequest) {
  return request.locale.toLowerCase().startsWith('tr')
    ? 'Bu konuda yardımcı olamam. Kapsam içindeki konularla ilgili güvenli ve belgeye dayalı bilgi paylaşabilirim.'
    : 'I cannot help with that. I can share safe, evidence-based information about in-scope topics.'
}

function resultWithActivationDiagnostics<T extends InternalAgentActivatedCurrentResult>(
  result: T,
  diagnostics: InternalAgentActivationDiagnostics
): T {
  return {
    ...result,
    diagnostics: {
      ...(result.diagnostics ?? {}),
      internalAgentActivation: diagnostics,
    },
  }
}

function boundaryResult<T extends InternalAgentActivatedCurrentResult>(
  template: T | null,
  answer: string,
  refusal: boolean,
  diagnostics: InternalAgentActivationDiagnostics
): T {
  const result = {
    ...(template ?? {}),
    answer,
    refusal,
    citations: [],
    diagnostics: {
      ...(template?.diagnostics ?? {}),
      internalAgentActivation: diagnostics,
    },
  }
  return result as unknown as T
}

function fallbackDiagnostics(reason: string): InternalAgentActivationDiagnostics {
  return {
    status: 'error',
    reason,
    activated: false,
    fallbackToCurrent: true,
    plannedTools: [],
    claimCount: 0,
  }
}

function activationPresenterParams(model: string) {
  if (/^gpt-5(?:[.-]|$)/i.test(model) || /^o\d/i.test(model)) {
    return {
      reasoning_effort: 'none',
      max_completion_tokens: 220,
    }
  }

  return {
    temperature: 0.2,
    max_tokens: 220,
  }
}

async function createDefaultPresenterCompletion(args: Record<string, unknown>) {
  if (!process.env.OPENAI_API_KEY?.trim()) return null

  const { default: OpenAI } = await import('openai')
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openai.chat.completions.create(args as never) as Promise<
    Awaited<ReturnType<AgentPlannerCreateCompletion>>
  >
}

function stripPresenterText(value: string) {
  return value
    .replace(/^```(?:json|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim()
}

async function presentActivationBoundary(input: {
  request: AgentRequest
  decision: ControllerResult['decision']
  draft: string
  createCompletion?: AgentPlannerCreateCompletion
  model?: string
}) {
  const createCompletion = input.createCompletion ?? createDefaultPresenterCompletion
  const model = input.model?.trim() || process.env.OPENAI_RAG_POLISH_MODEL?.trim() || 'gpt-4o-mini'

  try {
    const completion = await createCompletion({
      model,
      messages: [
        {
          role: 'system',
          content: [
            'You are Qualy final answer presenter.',
            'Rewrite the draft into one concise customer-facing reply.',
            'Follow the tenant behavior policy and tone.',
            'Do not add facts, prices, dates, contacts, availability, guarantees, or source mechanics.',
            'For clarification, ask only one short question.',
            'For refusal or no_info, be helpful but bounded.',
            'Return plain text only.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            locale: input.request.locale,
            latest_message: input.request.latestUserMessage,
            decision: input.decision,
            draft: input.draft,
            behavior_policy: input.request.behaviorPolicy,
          }),
        },
      ],
      ...activationPresenterParams(model),
    })
    const text = stripPresenterText(completion?.choices?.[0]?.message?.content ?? '')
    return text || input.draft
  } catch {
    return input.draft
  }
}

export function buildInternalAgentActivationRequest(
  input: Omit<InternalAgentTurnShadowInput, 'observedResult'> & {
    observedResult?: InternalAgentTurnShadowInput['observedResult']
  }
): AgentRequest {
  return buildInternalAgentTurnShadowRequest({
    ...input,
    observedResult: input.observedResult ?? { answer: '', refusal: false, diagnostics: {} },
  })
}

export async function runInternalAgentActivatedTurn<T extends InternalAgentActivatedCurrentResult>(
  input: ActivationInput<T>
): Promise<InternalAgentActivatedResult<T>> {
  let currentResult: T | null = input.currentResult ?? null
  const getCurrent = async () => {
    if (currentResult) return currentResult
    currentResult = await input.executeCurrent()
    return currentResult
  }

  if (!isActivationEnabled(input.request, input.enabled)) {
    const current = await getCurrent()
    const diagnostics: InternalAgentActivationDiagnostics = {
      status: 'skipped',
      reason: 'disabled',
      activated: false,
      fallbackToCurrent: true,
      plannedTools: [],
      claimCount: 0,
    }
    return { result: resultWithActivationDiagnostics(current, diagnostics), diagnostics }
  }

  const registry = createActivationRegistry(getCurrent)
  const controller = await runInternalAgentController({
    request: input.request,
    registry,
    plan: async ({ request, descriptors }) =>
      planInternalAgentTurn({
        request,
        toolDescriptors: descriptors,
        createCompletion: input.createPlannerCompletion,
        model: input.plannerModel,
      }),
    verify: verifyActivationGraph,
  })

  if (!controller.plan && controller.trace.stopReason === 'planner_error') {
    const current = await getCurrent()
    const diagnostics = fallbackDiagnostics('planner_error')
    return { result: resultWithActivationDiagnostics(current, diagnostics), diagnostics }
  }

  const diagnostics: InternalAgentActivationDiagnostics = {
    status: 'completed',
    decision: controller.decision,
    reason: controller.trace.stopReason,
    activated: true,
    fallbackToCurrent: controller.decision === 'answer',
    plannedTools: plannedTools(controller.plan),
    claimCount: controller.plan?.claims.length ?? 0,
    controller: {
      trace: controller.trace,
      verifiedPartialClaimIds: controller.verifiedPartialClaimIds,
    },
    ...(controller.plan?.clarification
      ? {
          clarification: {
            question: controller.plan.clarification.question,
            missingSlots: controller.plan.clarification.missingSlots,
          },
        }
      : {}),
    usage: controller.usage,
  }

  if (controller.decision === 'no_info' && controller.trace.stopReason === 'plan_claim_mismatch') {
    const current = await getCurrent()
    const fallbackDiagnostics: InternalAgentActivationDiagnostics = {
      ...diagnostics,
      status: 'error',
      activated: false,
      fallbackToCurrent: true,
    }
    return {
      result: resultWithActivationDiagnostics(current, fallbackDiagnostics),
      diagnostics: fallbackDiagnostics,
    }
  }

  if (controller.decision === 'clarify') {
    const draft =
      controller.plan?.clarification?.question?.trim() ||
      (input.request.locale.toLowerCase().startsWith('tr')
        ? 'Bunu yanıtlayabilmem için hangi konu hakkında sorduğunuzu netleştirir misiniz?'
        : 'Could you clarify which topic you mean?')
    const answer = await presentActivationBoundary({
      request: input.request,
      decision: controller.decision,
      draft,
      createCompletion: input.createPresenterCompletion,
      model: input.presenterModel,
    })
    return {
      result: boundaryResult(currentResult, answer, false, diagnostics),
      diagnostics,
    }
  }

  if (controller.decision === 'refuse') {
    const answer = await presentActivationBoundary({
      request: input.request,
      decision: controller.decision,
      draft: refuseAnswer(input.request),
      createCompletion: input.createPresenterCompletion,
      model: input.presenterModel,
    })
    return {
      result: boundaryResult(currentResult, answer, true, diagnostics),
      diagnostics,
    }
  }

  if (controller.decision === 'no_info') {
    const answer = await presentActivationBoundary({
      request: input.request,
      decision: controller.decision,
      draft: noInfoAnswer(input.request),
      createCompletion: input.createPresenterCompletion,
      model: input.presenterModel,
    })
    return {
      result: boundaryResult(currentResult, answer, true, diagnostics),
      diagnostics,
    }
  }

  const current = await getCurrent()
  return {
    result: resultWithActivationDiagnostics(current, diagnostics),
    diagnostics,
  }
}
