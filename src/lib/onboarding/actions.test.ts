import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  assertTenantWriteAllowedMock,
  createClientMock,
  cookiesMock,
  cookieSetMock,
  getOrganizationOnboardingStateMock,
} = vi.hoisted(() => ({
  assertTenantWriteAllowedMock: vi.fn(),
  createClientMock: vi.fn(),
  cookieSetMock: vi.fn(),
  getOrganizationOnboardingStateMock: vi.fn(),
  cookiesMock: vi.fn(async () => ({
    set: cookieSetMock,
  })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/organizations/active-context', () => ({
  assertTenantWriteAllowed: assertTenantWriteAllowedMock,
}))

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}))

vi.mock('@/lib/onboarding/state', () => ({
  getOrganizationOnboardingState: getOrganizationOnboardingStateMock,
}))

import {
  acknowledgeOrganizationOnboardingAiSettings,
  acknowledgeOrganizationOnboardingIntro,
  completeOrganizationOnboardingBotModeUnlock,
  markOrganizationOnboardingSeen,
} from '@/lib/onboarding/actions'

type QueryResult<T = unknown> = {
  data: T
  error: unknown
}

function createOnboardingSupabaseMock({
  readResult = { data: null, error: null },
  upsertResult = { error: null },
  upsertResults,
  aiSettingsUpsertResult = { error: null },
}: {
  readResult?: QueryResult<{
    first_seen_at?: string | null
    intro_acknowledged_at?: string | null
    ai_settings_reviewed_at?: string | null
  } | null>
  upsertResult?: { error: unknown }
  upsertResults?: Array<{ error: unknown }>
  aiSettingsUpsertResult?: { error: unknown }
} = {}) {
  const maybeSingleMock = vi.fn(async () => readResult)
  const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
  const selectMock = vi.fn(() => ({ eq: eqMock }))
  const upsertMock = vi.fn(async () => {
    if (upsertResults && upsertResults.length > 0) {
      return upsertResults.shift() ?? { error: null }
    }
    return upsertResult
  })
  const fromMock = vi.fn((table: string) => {
    if (table === 'organization_onboarding_states') {
      return {
        select: selectMock,
        upsert: upsertMock,
      }
    }

    if (table === 'organization_ai_settings') {
      return {
        upsert: vi.fn(async () => aiSettingsUpsertResult),
      }
    }

    throw new Error(`Unexpected table ${table}`)
  })

  return {
    supabase: {
      from: fromMock,
    },
    fromMock,
    selectMock,
    eqMock,
    maybeSingleMock,
    upsertMock,
  }
}

describe('onboarding actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertTenantWriteAllowedMock.mockResolvedValue(undefined)
    getOrganizationOnboardingStateMock.mockResolvedValue({
      isComplete: true,
    })
    cookiesMock.mockResolvedValue({
      set: cookieSetMock,
    })
  })

  it('does not throw when the onboarding table is missing while marking seen', async () => {
    const missingRelationError = {
      code: '42P01',
      message: "Could not find the table 'public.organization_onboarding_states' in the schema cache",
    }
    const { supabase, upsertMock } = createOnboardingSupabaseMock({
      readResult: { data: null, error: missingRelationError },
      upsertResult: { error: missingRelationError },
    })

    createClientMock.mockResolvedValue(supabase)

    await expect(markOrganizationOnboardingSeen('org-1')).resolves.toBeUndefined()
    expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
    expect(upsertMock).toHaveBeenCalledTimes(1)
  })

  it('does not throw when the onboarding table is missing while acknowledging intro', async () => {
    const missingRelationError = {
      code: '42P01',
      message: "Could not find the table 'public.organization_onboarding_states' in the schema cache",
    }
    const { supabase, upsertMock } = createOnboardingSupabaseMock({
      readResult: { data: null, error: missingRelationError },
      upsertResult: { error: missingRelationError },
    })

    createClientMock.mockResolvedValue(supabase)

    await expect(acknowledgeOrganizationOnboardingIntro('org-1')).resolves.toBeUndefined()
    expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
    expect(upsertMock).toHaveBeenCalledTimes(1)
  })

  it('still throws unexpected write errors', async () => {
    const unexpectedError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    }
    const { supabase } = createOnboardingSupabaseMock({
      upsertResult: { error: unexpectedError },
    })

    createClientMock.mockResolvedValue(supabase)

    await expect(markOrganizationOnboardingSeen('org-1')).rejects.toThrow(
      unexpectedError.message
    )
  })

  it('does not throw when the onboarding table is missing while acknowledging ai settings review', async () => {
    const missingRelationError = {
      code: '42P01',
      message: "Could not find the table 'public.organization_onboarding_states' in the schema cache",
    }
    const { supabase, upsertMock } = createOnboardingSupabaseMock({
      readResult: { data: null, error: missingRelationError },
      upsertResult: { error: missingRelationError },
    })

    createClientMock.mockResolvedValue(supabase)

    await expect(acknowledgeOrganizationOnboardingAiSettings('org-1')).resolves.toBeUndefined()
    expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
    expect(upsertMock).toHaveBeenCalledTimes(1)
    expect(cookieSetMock).toHaveBeenCalled()
  })

  it('writes an ai settings review cookie fallback when the schema is not ready yet', async () => {
    const missingColumnError = {
      code: 'PGRST204',
      message: "Could not find the 'ai_settings_reviewed_at' column of 'organization_onboarding_states' in the schema cache",
    }
    const { supabase } = createOnboardingSupabaseMock({
      upsertResult: { error: missingColumnError },
    })

    createClientMock.mockResolvedValue(supabase)

    await expect(acknowledgeOrganizationOnboardingAiSettings('org-1')).resolves.toBeUndefined()
    expect(cookieSetMock).toHaveBeenCalledWith(
      expect.stringContaining('qualy_onboarding_ai_review'),
      expect.any(String),
      expect.objectContaining({
        path: '/',
      })
    )
  })

  it('falls back to the legacy onboarding schema when ai review column is not available yet', async () => {
    const missingColumnError = {
      code: 'PGRST204',
      message: "Could not find the 'ai_settings_reviewed_at' column of 'organization_onboarding_states' in the schema cache",
    }
    const { supabase, upsertMock } = createOnboardingSupabaseMock({
      upsertResults: [{ error: missingColumnError }, { error: null }],
    })

    createClientMock.mockResolvedValue(supabase)

    await expect(markOrganizationOnboardingSeen('org-1')).resolves.toBeUndefined()
    expect(upsertMock).toHaveBeenCalledTimes(2)
    expect(upsertMock.mock.calls[0]?.[0]).toHaveProperty('ai_settings_reviewed_at')
    expect(upsertMock.mock.calls[1]?.[0]).not.toHaveProperty('ai_settings_reviewed_at')
  })

  it('unlocks bot mode and persists the selected mode after onboarding is complete', async () => {
    const { supabase, fromMock } = createOnboardingSupabaseMock()

    createClientMock.mockResolvedValue({
      ...supabase,
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'user-1' } },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === 'organization_members') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { organization_id: 'org-1', role: 'owner' },
                    error: null,
                  })),
                })),
              })),
            })),
          }
        }

        return fromMock(table)
      }),
    })

    await expect(
      completeOrganizationOnboardingBotModeUnlock({
        organizationId: 'org-1',
        selectedMode: 'shadow',
      })
    ).resolves.toMatchObject({
      bot_mode: 'shadow',
      bot_mode_unlock_required: false,
    })
  })
})
