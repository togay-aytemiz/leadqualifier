'use server'

import { cookies } from 'next/headers'

import { createClient } from '@/lib/supabase/server'
import { assertTenantWriteAllowed } from '@/lib/organizations/active-context'
import { getAiSettingsReviewCookieName } from '@/lib/onboarding/cookies'
import { getOrganizationOnboardingState } from '@/lib/onboarding/state'
import type { AiBotMode } from '@/types/database'

const ONBOARDING_RELATION_NAME = 'organization_onboarding_states'
const AI_SETTINGS_RELATION_NAME = 'organization_ai_settings'

function isMissingRelationError(error: unknown, relationName: string) {
  if (!error || typeof error !== 'object') return false

  const candidate = error as { code?: string | null; message?: string | null }
  if (candidate.code === '42P01') return true

  return (
    typeof candidate.message === 'string' &&
    candidate.message.toLowerCase().includes(relationName.toLowerCase())
  )
}

function isMissingColumnError(error: unknown, columnName: string) {
  if (!error || typeof error !== 'object') return false

  const candidate = error as { code?: string | null; message?: string | null }
  if (candidate.code === '42703' || candidate.code === 'PGRST204') return true

  return (
    typeof candidate.message === 'string' &&
    candidate.message.toLowerCase().includes(columnName.toLowerCase())
  )
}

function rethrowIfUnexpectedRelationWriteError(error: unknown, logMessage: string) {
  if (!error) return

  if (isMissingRelationError(error, ONBOARDING_RELATION_NAME)) {
    console.warn(`${logMessage} skipped because onboarding state table is unavailable:`, error)
    return
  }

  console.error(logMessage, error)

  const message =
    error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'Unknown onboarding persistence error'

  throw new Error(message)
}

async function loadOnboardingTimestamps(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string
) {
  const { data, error } = await supabase
    .from(ONBOARDING_RELATION_NAME)
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    if (!isMissingRelationError(error, ONBOARDING_RELATION_NAME)) {
      console.error('Failed to read organization onboarding timestamps:', error)
    }
    return null
  }

  return data
}

async function upsertOnboardingStateWithLegacyFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: {
    organization_id: string
    first_seen_at: string | null
    intro_acknowledged_at: string | null
    ai_settings_reviewed_at?: string | null
  }
) {
  const executeUpsert = async (
    value: Omit<typeof payload, 'ai_settings_reviewed_at'> | typeof payload
  ) => {
    const { error } = await supabase.from(ONBOARDING_RELATION_NAME).upsert(value, {
      onConflict: 'organization_id',
    })

    return error
  }

  const initialError = await executeUpsert(payload)
  if (!isMissingColumnError(initialError, 'ai_settings_reviewed_at')) {
    return initialError
  }

  console.warn(
    'Retrying onboarding state write without ai_settings_reviewed_at because the column is unavailable:',
    initialError
  )

  const { ai_settings_reviewed_at, ...legacyPayload } = payload
  return executeUpsert(legacyPayload)
}

export async function markOrganizationOnboardingSeen(organizationId: string) {
  const supabase = await createClient()
  await assertTenantWriteAllowed(supabase)

  const current = await loadOnboardingTimestamps(supabase, organizationId)
  if (current?.first_seen_at) {
    return
  }

  const nowIso = new Date().toISOString()
  const error = await upsertOnboardingStateWithLegacyFallback(supabase,
    {
      organization_id: organizationId,
      first_seen_at: nowIso,
      intro_acknowledged_at: current?.intro_acknowledged_at ?? null,
      ai_settings_reviewed_at: current?.ai_settings_reviewed_at ?? null,
    }
  )

  rethrowIfUnexpectedRelationWriteError(error, 'Failed to mark organization onboarding as seen:')
}

export async function acknowledgeOrganizationOnboardingIntro(organizationId: string) {
  const supabase = await createClient()
  await assertTenantWriteAllowed(supabase)

  const current = await loadOnboardingTimestamps(supabase, organizationId)
  const nowIso = new Date().toISOString()

  const error = await upsertOnboardingStateWithLegacyFallback(supabase,
    {
      organization_id: organizationId,
      first_seen_at: current?.first_seen_at ?? nowIso,
      intro_acknowledged_at: nowIso,
      ai_settings_reviewed_at: current?.ai_settings_reviewed_at ?? null,
    }
  )

  rethrowIfUnexpectedRelationWriteError(error, 'Failed to acknowledge onboarding intro:')
}

export async function acknowledgeOrganizationOnboardingAiSettings(organizationId: string) {
  const supabase = await createClient()
  await assertTenantWriteAllowed(supabase)
  const cookieStore = await cookies()

  const current = await loadOnboardingTimestamps(supabase, organizationId)
  const nowIso = new Date().toISOString()

  const { error } = await supabase.from(ONBOARDING_RELATION_NAME).upsert(
    {
      organization_id: organizationId,
      first_seen_at: current?.first_seen_at ?? nowIso,
      intro_acknowledged_at: current?.intro_acknowledged_at ?? null,
      ai_settings_reviewed_at: nowIso,
    },
    { onConflict: 'organization_id' }
  )

  if (isMissingColumnError(error, 'ai_settings_reviewed_at')) {
    console.warn(
      'Skipping onboarding ai settings review persistence because the column is unavailable:',
      error
    )
    cookieStore.set(getAiSettingsReviewCookieName(organizationId), nowIso, {
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
    })
    return
  }

  rethrowIfUnexpectedRelationWriteError(error, 'Failed to acknowledge onboarding ai settings review:')

  cookieStore.set(getAiSettingsReviewCookieName(organizationId), nowIso, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
  })
}

async function getOrganizationMemberForWrite(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: member, error } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (error || !member) throw new Error('No organization found')
  return member
}

export async function completeOrganizationOnboardingBotModeUnlock({
  organizationId,
  selectedMode,
}: {
  organizationId: string
  selectedMode: AiBotMode
}) {
  const supabase = await createClient()
  await assertTenantWriteAllowed(supabase)

  const member = await getOrganizationMemberForWrite(supabase)
  if (member.organization_id !== organizationId) {
    throw new Error('Forbidden')
  }

  const onboardingState = await getOrganizationOnboardingState(organizationId, { supabase })
  if (!onboardingState.isComplete) {
    throw new Error('ONBOARDING_NOT_COMPLETE')
  }

  const nowIso = new Date().toISOString()
  const { error } = await supabase.from(AI_SETTINGS_RELATION_NAME).upsert(
    {
      organization_id: organizationId,
      bot_mode: selectedMode,
      bot_mode_unlock_required: false,
      bot_mode_unlocked_at: nowIso,
    },
    { onConflict: 'organization_id' }
  )

  if (error) {
    console.error('Failed to unlock onboarding bot mode:', error)
    throw new Error(
      error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : 'Unknown bot-mode unlock error'
    )
  }

  return {
    bot_mode: selectedMode,
    bot_mode_unlock_required: false,
    bot_mode_unlocked_at: nowIso,
  }
}
