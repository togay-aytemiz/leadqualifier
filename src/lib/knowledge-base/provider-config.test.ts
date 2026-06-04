import { describe, expect, it } from 'vitest'
import { resolveKnowledgeProviderConfig } from './provider-config'

describe('resolveKnowledgeProviderConfig', () => {
  it('prefers enabled demo overrides over organization and global fallback', () => {
    expect(
      resolveKnowledgeProviderConfig({
        demoOverride: {
          scope: 'demo_chat_channel',
          providerProfile: 'brochure_file_search_validated',
          enabled: true,
          config: {
            vectorStoreId: 'vs_demo',
            corpusScope: 'yiu-tanitim-gunleri-2026',
          },
        },
        organizationSetting: {
          scope: 'organization',
          providerProfile: 'openai_file_search_validated',
          enabled: true,
          config: {
            vectorStoreId: 'vs_org',
          },
        },
      })
    ).toMatchObject({
      scope: 'demo_chat_channel',
      providerProfile: 'brochure_file_search_validated',
      config: {
        vectorStoreId: 'vs_demo',
      },
    })
  })

  it('falls back to organization setting when demo override is disabled', () => {
    expect(
      resolveKnowledgeProviderConfig({
        demoOverride: {
          scope: 'demo_chat_channel',
          providerProfile: 'brochure_file_search_validated',
          enabled: false,
          config: {
            vectorStoreId: 'vs_disabled',
          },
        },
        organizationSetting: {
          scope: 'organization',
          providerProfile: 'openai_file_search_validated',
          enabled: true,
          config: {
            vectorStoreId: 'vs_org',
          },
        },
      })
    ).toMatchObject({
      scope: 'organization',
      providerProfile: 'openai_file_search_validated',
      config: {
        vectorStoreId: 'vs_org',
      },
    })
  })

  it('defaults to current Supabase RAG when no explicit provider is enabled', () => {
    expect(resolveKnowledgeProviderConfig({})).toEqual({
      scope: 'global',
      providerProfile: 'supabase_rag',
      enabled: true,
      config: {},
    })
  })
})
