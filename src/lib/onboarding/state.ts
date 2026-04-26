import { cache } from 'react'
import { cookies } from 'next/headers'

import { getOrganizationBillingSnapshot } from '@/lib/billing/server'
import type { OrganizationBillingSnapshot } from '@/lib/billing/snapshot'
import { shouldCountChannelAsConnected } from '@/lib/channels/connection-readiness'
import { getAiSettingsReviewCookieName } from '@/lib/onboarding/cookies'
import { getDefaultSystemSkillTemplates } from '@/lib/skills/default-system-skills'
import { createClient } from '@/lib/supabase/server'
import type {
  Channel,
  OfferingProfile,
  OrganizationOnboardingState,
  Skill,
} from '@/types/database'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export type OrganizationOnboardingStepId =
  | 'intro'
  | 'agent_setup'
  | 'business_review'
  | 'ai_settings_review'
  | 'connect_whatsapp'

export interface OrganizationOnboardingStepState {
  id: OrganizationOnboardingStepId
  isComplete: boolean
  isExpandedByDefault: boolean
}

export interface OrganizationOnboardingShellState {
  organizationId: string
  isComplete: boolean
  completedSteps: number
  totalSteps: number
  showBanner: boolean
  showChecklistCta: boolean
  showNavigationEntry: boolean
  shouldAutoOpen: boolean
  steps: OrganizationOnboardingStepState[]
}

export interface OrganizationOnboardingShellData {
  onboardingState: OrganizationOnboardingShellState
  billingSnapshot: OrganizationBillingSnapshot | null
}

export type OrganizationOnboardingStateRow = OrganizationOnboardingState

interface ResolveOnboardingStateInput {
  organizationId: string
  onboardingRow: OrganizationOnboardingStateRow | null
  billingSnapshot: OrganizationBillingSnapshot | null
  knowledgeDocumentCount: number
  customSkillCount: number
  aiSettingsReviewCookieSeen: boolean
  offeringProfile: OfferingProfile | null
  serviceCatalogCount: number
  connectedChannels: Channel[]
  nowIso?: string
}

interface OnboardingCountQueryResult {
  count: number | null
  error: unknown
}

type OnboardingSkillCandidate = Pick<Skill, 'title' | 'trigger_examples' | 'response_text'>

const CHANNEL_CONNECTION_PREREQUISITE_STEP_IDS: OrganizationOnboardingStepId[] = [
  'intro',
  'agent_setup',
  'business_review',
  'ai_settings_review',
]

function isMissingRelationError(error: unknown, relationName: string) {
  if (!error || typeof error !== 'object') return false

  const candidate = error as { code?: string | null; message?: string | null }
  if (candidate.code === '42P01') return true

  return (
    typeof candidate.message === 'string' &&
    candidate.message.toLowerCase().includes(relationName.toLowerCase())
  )
}

function normalizeCount(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0
}

function hasNonEmptyText(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0
}

function hasBusinessContext(
  offeringProfile: OfferingProfile | null,
  serviceCatalogCount: number
) {
  if (!offeringProfile) {
    return serviceCatalogCount > 0
  }

  return (
    hasNonEmptyText(offeringProfile.summary) ||
    hasNonEmptyText(offeringProfile.manual_profile_note) ||
    (offeringProfile.required_intake_fields?.length ?? 0) > 0 ||
    (offeringProfile.required_intake_fields_ai?.length ?? 0) > 0 ||
    serviceCatalogCount > 0
  )
}

function shouldShowTrialBanner(billingSnapshot: OrganizationBillingSnapshot | null) {
  return billingSnapshot?.membershipState === 'trial_active'
}

function hasAnyConnectedChannel(channels: Channel[]) {
  return channels.some((channel) => shouldCountChannelAsConnected(channel))
}

function hasLearnedChannelConnection(onboardingRow: OrganizationOnboardingStateRow | null) {
  return Boolean(onboardingRow?.channel_connection_completed_at)
}

function buildSkillSignature(skill: OnboardingSkillCandidate) {
  const normalizedTitle = skill.title.trim().toLocaleLowerCase('tr-TR')
  const normalizedResponse = skill.response_text.trim().toLocaleLowerCase('tr-TR')
  const normalizedTriggers = skill.trigger_examples
    .map((trigger) => trigger.trim().toLocaleLowerCase('tr-TR'))
    .sort()
    .join('\u001f')

  return `${normalizedTitle}\u0000${normalizedResponse}\u0000${normalizedTriggers}`
}

const DEFAULT_SYSTEM_SKILL_SIGNATURES = new Set(
  ['tr', 'en'].flatMap((locale) =>
    getDefaultSystemSkillTemplates(locale).map((template) => buildSkillSignature(template))
  )
)

export function countCustomSkillsForOnboarding(skills: OnboardingSkillCandidate[]) {
  return skills.reduce((count, skill) => {
    return count + (DEFAULT_SYSTEM_SKILL_SIGNATURES.has(buildSkillSignature(skill)) ? 0 : 1)
  }, 0)
}

export function resolveCustomSkillCountFromLoadedSkills(
  totalSkillCount: number,
  loadedSkills: OnboardingSkillCandidate[]
) {
  if (totalSkillCount > DEFAULT_SYSTEM_SKILL_SIGNATURES.size) {
    return 1
  }

  return countCustomSkillsForOnboarding(loadedSkills)
}

export function isChannelConnectionPrerequisitesComplete(
  steps: Pick<OrganizationOnboardingStepState, 'id' | 'isComplete'>[]
) {
  return CHANNEL_CONNECTION_PREREQUISITE_STEP_IDS.every((stepId) =>
    steps.some((step) => step.id === stepId && step.isComplete)
  )
}

export function resolveOnboardingState({
  organizationId,
  onboardingRow,
  billingSnapshot,
  knowledgeDocumentCount,
  customSkillCount,
  aiSettingsReviewCookieSeen,
  offeringProfile,
  serviceCatalogCount,
  connectedChannels,
}: ResolveOnboardingStateInput): OrganizationOnboardingShellState {
  const showBanner = shouldShowTrialBanner(billingSnapshot)
  const prerequisiteSteps: OrganizationOnboardingStepState[] = [
    {
      id: 'intro',
      isComplete: Boolean(onboardingRow?.intro_acknowledged_at),
      isExpandedByDefault: true,
    },
    {
      id: 'agent_setup',
      isComplete: knowledgeDocumentCount > 0 || customSkillCount > 0,
      isExpandedByDefault: false,
    },
    {
      id: 'business_review',
      isComplete: hasBusinessContext(offeringProfile, serviceCatalogCount),
      isExpandedByDefault: false,
    },
    {
      id: 'ai_settings_review',
      isComplete: Boolean(onboardingRow?.ai_settings_reviewed_at) || aiSettingsReviewCookieSeen,
      isExpandedByDefault: false,
    },
  ]
  const channelConnectionComplete =
    hasLearnedChannelConnection(onboardingRow) ||
    (isChannelConnectionPrerequisitesComplete(prerequisiteSteps) &&
      hasAnyConnectedChannel(connectedChannels))

  const steps: OrganizationOnboardingStepState[] = [
    ...prerequisiteSteps,
    {
      id: 'connect_whatsapp',
      isComplete: channelConnectionComplete,
      isExpandedByDefault: false,
    },
  ]

  const completedSteps = steps.filter((step) => step.isComplete).length
  const totalSteps = steps.length
  const isComplete = completedSteps === totalSteps
  const shouldAutoOpen = showBanner && !isComplete && !onboardingRow?.first_seen_at

  return {
    organizationId,
    isComplete,
    completedSteps,
    totalSteps,
    showBanner,
    showChecklistCta: showBanner && !isComplete,
    showNavigationEntry: !isComplete,
    shouldAutoOpen,
    steps,
  }
}

export async function getOrganizationOnboardingState(
  organizationId: string,
  options?: { supabase?: SupabaseClient }
): Promise<OrganizationOnboardingShellState> {
  const shellData = await getOrganizationOnboardingShellData(organizationId, options)
  return shellData.onboardingState
}

export async function getOrganizationOnboardingShellData(
  organizationId: string,
  options?: { supabase?: SupabaseClient }
): Promise<OrganizationOnboardingShellData> {
  if (!options?.supabase) {
    return getOrganizationOnboardingShellDataCached(organizationId)
  }

  return getOrganizationOnboardingShellDataWithSupabase(options.supabase, organizationId)
}

const getOrganizationOnboardingShellDataCached = cache(async (organizationId: string) => {
  const supabase = await createClient()
  return getOrganizationOnboardingShellDataWithSupabase(supabase, organizationId)
})

async function getOrganizationOnboardingShellDataWithSupabase(
  supabase: SupabaseClient,
  organizationId: string
) {
  const [
    onboardingRow,
    billingSnapshot,
    knowledgeDocumentCount,
    customSkillCount,
    aiSettingsReviewCookieSeen,
    offeringProfile,
    serviceCatalogCount,
    connectedChannels,
  ] = await Promise.all([
    readOrganizationOnboardingStateRow(supabase, organizationId),
    getOrganizationBillingSnapshot(organizationId, { supabase }),
    readKnowledgeDocumentCount(supabase, organizationId),
    readCustomSkillCount(supabase, organizationId),
    readAiSettingsReviewCookie(organizationId),
    readOfferingProfile(supabase, organizationId),
    readServiceCatalogCount(supabase, organizationId),
    readConnectedChannels(supabase, organizationId),
  ])

  const onboardingState = resolveOnboardingState({
    organizationId,
    onboardingRow,
    billingSnapshot,
    knowledgeDocumentCount,
    customSkillCount,
    aiSettingsReviewCookieSeen,
    offeringProfile,
    serviceCatalogCount,
    connectedChannels,
  })

  return {
    onboardingState,
    billingSnapshot,
  }
}

async function readAiSettingsReviewCookie(organizationId: string) {
  const cookieStore = await cookies()
  return Boolean(cookieStore.get(getAiSettingsReviewCookieName(organizationId))?.value)
}

async function readOrganizationOnboardingStateRow(
  supabase: SupabaseClient,
  organizationId: string
): Promise<OrganizationOnboardingStateRow | null> {
  const { data, error } = await supabase
    .from('organization_onboarding_states')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    if (!isMissingRelationError(error, 'organization_onboarding_states')) {
      console.error('Failed to load organization onboarding state:', error)
    }
    return null
  }

  return (data as OrganizationOnboardingStateRow | null) ?? null
}

async function readKnowledgeDocumentCount(supabase: SupabaseClient, organizationId: string) {
  const { count, error } = (await supabase
    .from('knowledge_documents')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)) as OnboardingCountQueryResult

  if (error) {
    if (!isMissingRelationError(error, 'knowledge_documents')) {
      console.error('Failed to count knowledge documents for onboarding:', error)
    }
    return 0
  }

  return normalizeCount(count)
}

async function readCustomSkillCount(supabase: SupabaseClient, organizationId: string) {
  const { count, error: countError } = (await supabase
    .from('skills')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)) as OnboardingCountQueryResult

  if (countError) {
    if (!isMissingRelationError(countError, 'skills')) {
      console.error('Failed to count skills for onboarding:', countError)
    }
    return 0
  }

  const totalSkillCount = normalizeCount(count)
  if (totalSkillCount === 0) {
    return 0
  }

  if (totalSkillCount > DEFAULT_SYSTEM_SKILL_SIGNATURES.size) {
    return 1
  }

  const { data, error } = await supabase
    .from('skills')
    .select('title, trigger_examples, response_text')
    .eq('organization_id', organizationId)
    .limit(DEFAULT_SYSTEM_SKILL_SIGNATURES.size)

  if (error) {
    if (!isMissingRelationError(error, 'skills')) {
      console.error('Failed to load skills for onboarding:', error)
    }
    return 0
  }

  return resolveCustomSkillCountFromLoadedSkills(
    totalSkillCount,
    (data as OnboardingSkillCandidate[] | null) ?? []
  )
}

async function readOfferingProfile(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from('offering_profiles')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    if (!isMissingRelationError(error, 'offering_profiles')) {
      console.error('Failed to load offering profile for onboarding:', error)
    }
    return null
  }

  return (data as OfferingProfile | null) ?? null
}

async function readServiceCatalogCount(supabase: SupabaseClient, organizationId: string) {
  const { count, error } = (await supabase
    .from('service_catalog')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('active', true)) as OnboardingCountQueryResult

  if (error) {
    if (!isMissingRelationError(error, 'service_catalog')) {
      console.error('Failed to count service catalog items for onboarding:', error)
    }
    return 0
  }

  return normalizeCount(count)
}

async function readConnectedChannels(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('organization_id', organizationId)
    .in('status', ['active', 'error'])

  if (error) {
    if (!isMissingRelationError(error, 'channels')) {
      console.error('Failed to load channels for onboarding:', error)
    }
    return []
  }

  return (data as Channel[] | null) ?? []
}
