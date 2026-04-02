import { describe, expect, it } from 'vitest'

import type { Channel, Json, OfferingProfile, Skill } from '@/types/database'
import type { OrganizationBillingSnapshot } from '@/lib/billing/snapshot'
import { getDefaultSystemSkillTemplates } from '@/lib/skills/default-system-skills'

import {
  countCustomSkillsForOnboarding,
  isChannelConnectionPrerequisitesComplete,
  resolveOnboardingState,
  type OrganizationOnboardingStateRow,
} from '@/lib/onboarding/state'

function createBillingSnapshot(
  overrides?: Partial<OrganizationBillingSnapshot>
): OrganizationBillingSnapshot {
  return {
    organizationId: 'org-1',
    membershipState: 'trial_active',
    lockReason: 'none',
    isUsageAllowed: true,
    isTopupAllowed: true,
    activeCreditPool: 'trial_pool',
    trial: {
      startedAt: '2026-04-01T00:00:00.000Z',
      endsAt: '2026-04-08T00:00:00.000Z',
      timeProgress: 0,
      remainingDays: 7,
      totalDays: 7,
      credits: {
        limit: 100,
        used: 0,
        remaining: 100,
        progress: 100,
      },
    },
    package: {
      periodStart: null,
      periodEnd: null,
      credits: {
        limit: 0,
        used: 0,
        remaining: 0,
        progress: 0,
      },
    },
    topupBalance: 0,
    totalRemainingCredits: 100,
    ...overrides,
  }
}

function createOnboardingRow(
  overrides?: Partial<OrganizationOnboardingStateRow>
): OrganizationOnboardingStateRow {
  return {
    organization_id: 'org-1',
    first_seen_at: null,
    intro_acknowledged_at: null,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

function createOfferingProfile(
  overrides?: Partial<OfferingProfile>
): OfferingProfile {
  return {
    organization_id: 'org-1',
    summary: '',
    manual_profile_note: '',
    catalog_enabled: true,
    ai_suggestions_enabled: false,
    service_catalog_ai_enabled: true,
    required_intake_fields_ai_enabled: true,
    ai_suggestions_locale: 'tr',
    required_intake_fields: [],
    required_intake_fields_ai: [],
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

function createChannel(overrides?: Partial<Channel>): Channel {
  return {
    id: 'channel-1',
    organization_id: 'org-1',
    type: 'whatsapp',
    name: 'WhatsApp',
    status: 'active',
    config: {} satisfies Json,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

function createSkill(overrides?: Partial<Skill>): Skill {
  return {
    id: 'skill-1',
    organization_id: 'org-1',
    title: 'Özel beceri',
    trigger_examples: ['Fiyat nedir?', 'Paketleriniz neler?', 'Bilgi alabilir miyim?'],
    response_text: 'Elbette, hizmet detaylarını paylaşayım.',
    enabled: true,
    requires_human_handover: false,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('resolveOnboardingState', () => {
  it('treats only the first four steps as the channel-connection prerequisite set', () => {
    expect(
      isChannelConnectionPrerequisitesComplete([
        { id: 'intro', isComplete: true, isExpandedByDefault: false },
        { id: 'agent_setup', isComplete: true, isExpandedByDefault: false },
        { id: 'business_review', isComplete: true, isExpandedByDefault: false },
        { id: 'ai_settings_review', isComplete: false, isExpandedByDefault: false },
        { id: 'connect_whatsapp', isComplete: true, isExpandedByDefault: false },
      ])
    ).toBe(false)

    expect(
      isChannelConnectionPrerequisitesComplete([
        { id: 'intro', isComplete: true, isExpandedByDefault: false },
        { id: 'agent_setup', isComplete: true, isExpandedByDefault: false },
        { id: 'business_review', isComplete: true, isExpandedByDefault: false },
        { id: 'ai_settings_review', isComplete: true, isExpandedByDefault: false },
        { id: 'connect_whatsapp', isComplete: false, isExpandedByDefault: false },
      ])
    ).toBe(true)
  })

  it('does not count untouched default skills as custom onboarding skills', () => {
    const defaultTemplates = getDefaultSystemSkillTemplates('tr')
    const skills = defaultTemplates.map((template, index) =>
      createSkill({
        id: `skill-${index + 1}`,
        title: template.title,
        trigger_examples: template.trigger_examples,
        response_text: template.response_text,
        requires_human_handover: true,
      })
    )

    expect(countCustomSkillsForOnboarding(skills)).toBe(0)
  })

  it('counts newly added skills beyond the default set', () => {
    const defaultTemplates = getDefaultSystemSkillTemplates('tr')
    const skills = [
      ...defaultTemplates.map((template, index) =>
        createSkill({
          id: `skill-${index + 1}`,
          title: template.title,
          trigger_examples: template.trigger_examples,
          response_text: template.response_text,
          requires_human_handover: true,
        })
      ),
      createSkill({
        id: 'skill-custom',
        title: 'Randevu teyit asistanı',
      }),
    ]

    expect(countCustomSkillsForOnboarding(skills)).toBe(1)
  })

  it('auto-opens onboarding once for trial orgs that have never seen it', () => {
    const state = resolveOnboardingState({
      organizationId: 'org-1',
      onboardingRow: createOnboardingRow(),
      billingSnapshot: createBillingSnapshot(),
      knowledgeDocumentCount: 0,
      customSkillCount: 0,
      aiSettingsReviewCookieSeen: false,
      offeringProfile: createOfferingProfile(),
      serviceCatalogCount: 0,
      connectedChannels: [],
      nowIso: '2026-04-01T10:00:00.000Z',
    })

    expect(state.shouldAutoOpen).toBe(true)
    expect(state.showBanner).toBe(true)
    expect(state.showChecklistCta).toBe(true)
    expect(state.showNavigationEntry).toBe(true)
    expect(state.completedSteps).toBe(0)
    expect(state.totalSteps).toBe(5)
    expect(state.steps[0]?.isExpandedByDefault).toBe(true)
    expect(state.steps[0]?.isComplete).toBe(false)
  })

  it('keeps the banner but hides checklist CTA when onboarding is complete during trial', () => {
    const state = resolveOnboardingState({
      organizationId: 'org-1',
      onboardingRow: createOnboardingRow({
        first_seen_at: '2026-04-01T10:00:00.000Z',
        intro_acknowledged_at: '2026-04-01T10:01:00.000Z',
        ai_settings_reviewed_at: '2026-04-01T10:01:30.000Z',
      }),
      billingSnapshot: createBillingSnapshot(),
      knowledgeDocumentCount: 3,
      customSkillCount: 0,
      aiSettingsReviewCookieSeen: false,
      offeringProfile: createOfferingProfile({
        summary: 'Sunulanlar: Cilt bakimi.',
        required_intake_fields: ['Ad soyad'],
      }),
      serviceCatalogCount: 2,
      connectedChannels: [
        createChannel({
          config: {
            webhook_verified_at: '2026-04-01T10:02:00.000Z',
          },
        }),
      ],
      nowIso: '2026-04-01T10:03:00.000Z',
    })

    expect(state.isComplete).toBe(true)
    expect(state.showBanner).toBe(true)
    expect(state.showChecklistCta).toBe(false)
    expect(state.showNavigationEntry).toBe(false)
    expect(state.shouldAutoOpen).toBe(false)
    expect(state.completedSteps).toBe(5)
  })

  it('hides the banner after upgrade but keeps navigation entry when onboarding is incomplete', () => {
    const state = resolveOnboardingState({
      organizationId: 'org-1',
      onboardingRow: createOnboardingRow({
        first_seen_at: '2026-04-01T10:00:00.000Z',
      }),
      billingSnapshot: createBillingSnapshot({
        membershipState: 'premium_active',
        activeCreditPool: 'package_pool',
        package: {
          periodStart: '2026-04-01T00:00:00.000Z',
          periodEnd: '2026-05-01T00:00:00.000Z',
          credits: {
            limit: 2000,
            used: 20,
            remaining: 1980,
            progress: 99,
          },
        },
        totalRemainingCredits: 1980,
      }),
      knowledgeDocumentCount: 0,
      customSkillCount: 0,
      aiSettingsReviewCookieSeen: false,
      offeringProfile: createOfferingProfile(),
      serviceCatalogCount: 0,
      connectedChannels: [],
      nowIso: '2026-04-02T00:00:00.000Z',
    })

    expect(state.showBanner).toBe(false)
    expect(state.showChecklistCta).toBe(false)
    expect(state.showNavigationEntry).toBe(true)
    expect(state.isComplete).toBe(false)
  })

  it('counts any ready live channel as complete for the final connection step once prerequisites are complete', () => {
    const state = resolveOnboardingState({
      organizationId: 'org-1',
      onboardingRow: createOnboardingRow({
        first_seen_at: '2026-04-01T10:00:00.000Z',
        intro_acknowledged_at: '2026-04-01T10:01:00.000Z',
        ai_settings_reviewed_at: '2026-04-01T10:01:30.000Z',
      }),
      billingSnapshot: createBillingSnapshot(),
      knowledgeDocumentCount: 1,
      customSkillCount: 0,
      aiSettingsReviewCookieSeen: false,
      offeringProfile: createOfferingProfile({
        summary: 'Sunulanlar: Cilt bakimi.',
      }),
      serviceCatalogCount: 1,
      connectedChannels: [
        createChannel({
          type: 'instagram',
          name: 'Instagram',
          config: {
            webhook_verified_at: '2026-04-01T10:02:00.000Z',
          },
        }),
      ],
      nowIso: '2026-04-01T10:03:00.000Z',
    })

    expect(state.steps.find((step) => step.id === 'connect_whatsapp')?.isComplete).toBe(true)
  })

  it('keeps the final connection step incomplete until the first four steps are complete', () => {
    const state = resolveOnboardingState({
      organizationId: 'org-1',
      onboardingRow: createOnboardingRow({
        first_seen_at: '2026-04-01T10:00:00.000Z',
        intro_acknowledged_at: '2026-04-01T10:01:00.000Z',
      }),
      billingSnapshot: createBillingSnapshot(),
      knowledgeDocumentCount: 1,
      customSkillCount: 0,
      aiSettingsReviewCookieSeen: false,
      offeringProfile: createOfferingProfile({
        summary: 'Sunulanlar: Cilt bakimi.',
      }),
      serviceCatalogCount: 1,
      connectedChannels: [
        createChannel({
          type: 'instagram',
          name: 'Instagram',
          config: {
            webhook_verified_at: '2026-04-01T10:02:00.000Z',
          },
        }),
      ],
      nowIso: '2026-04-01T10:03:00.000Z',
    })

    expect(state.steps.find((step) => step.id === 'business_review')?.isComplete).toBe(true)
    expect(state.steps.find((step) => step.id === 'connect_whatsapp')?.isComplete).toBe(false)
    expect(state.isComplete).toBe(false)
    expect(state.completedSteps).toBe(3)
  })

  it('counts the final connection step once the first four onboarding steps are complete', () => {
    const state = resolveOnboardingState({
      organizationId: 'org-1',
      onboardingRow: createOnboardingRow({
        first_seen_at: '2026-04-01T10:00:00.000Z',
        intro_acknowledged_at: '2026-04-01T10:01:00.000Z',
        ai_settings_reviewed_at: '2026-04-01T10:01:30.000Z',
      }),
      billingSnapshot: createBillingSnapshot(),
      knowledgeDocumentCount: 1,
      customSkillCount: 0,
      aiSettingsReviewCookieSeen: false,
      offeringProfile: createOfferingProfile({
        summary: 'Sunulanlar: Cilt bakimi.',
      }),
      serviceCatalogCount: 1,
      connectedChannels: [
        createChannel({
          type: 'instagram',
          name: 'Instagram',
          config: {
            webhook_verified_at: '2026-04-01T10:02:00.000Z',
          },
        }),
      ],
      nowIso: '2026-04-01T10:03:00.000Z',
    })

    expect(state.steps.find((step) => step.id === 'connect_whatsapp')?.isComplete).toBe(true)
    expect(state.isComplete).toBe(true)
    expect(state.completedSteps).toBe(5)
  })

  it('marks agent setup complete when a custom skill exists without knowledge documents', () => {
    const state = resolveOnboardingState({
      organizationId: 'org-1',
      onboardingRow: createOnboardingRow({
        first_seen_at: '2026-04-01T10:00:00.000Z',
      }),
      billingSnapshot: createBillingSnapshot(),
      knowledgeDocumentCount: 0,
      customSkillCount: 1,
      aiSettingsReviewCookieSeen: false,
      offeringProfile: createOfferingProfile(),
      serviceCatalogCount: 0,
      connectedChannels: [],
      nowIso: '2026-04-01T10:03:00.000Z',
    })

    expect(state.steps.find((step) => step.id === 'agent_setup')?.isComplete).toBe(true)
  })

  it('keeps ai settings review incomplete until it is explicitly acknowledged', () => {
    const state = resolveOnboardingState({
      organizationId: 'org-1',
      onboardingRow: createOnboardingRow({
        first_seen_at: '2026-04-01T10:00:00.000Z',
      }),
      billingSnapshot: createBillingSnapshot(),
      knowledgeDocumentCount: 1,
      customSkillCount: 0,
      aiSettingsReviewCookieSeen: false,
      offeringProfile: createOfferingProfile({
        summary: 'Sunulanlar: Cilt bakimi.',
      }),
      serviceCatalogCount: 1,
      connectedChannels: [
        createChannel({
          config: {
            webhook_verified_at: '2026-04-01T10:02:00.000Z',
          },
        }),
      ],
      nowIso: '2026-04-01T10:03:00.000Z',
    })

    expect(state.steps.find((step) => step.id === 'ai_settings_review')?.isComplete).toBe(false)
  })

  it('treats ai settings review as complete when the browser fallback cookie exists', () => {
    const state = resolveOnboardingState({
      organizationId: 'org-1',
      onboardingRow: createOnboardingRow({
        first_seen_at: '2026-04-01T10:00:00.000Z',
      }),
      billingSnapshot: createBillingSnapshot(),
      knowledgeDocumentCount: 1,
      customSkillCount: 0,
      aiSettingsReviewCookieSeen: true,
      offeringProfile: createOfferingProfile({
        summary: 'Sunulanlar: Cilt bakimi.',
      }),
      serviceCatalogCount: 1,
      connectedChannels: [],
      nowIso: '2026-04-01T10:03:00.000Z',
    })

    expect(state.steps.find((step) => step.id === 'ai_settings_review')?.isComplete).toBe(true)
  })
})
