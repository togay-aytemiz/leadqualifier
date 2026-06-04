export type KnowledgeProviderProfile =
  | 'supabase_rag'
  | 'openai_file_search_validated'
  | 'brochure_file_search_validated'

export type KnowledgeProviderScope = 'demo_chat_channel' | 'organization' | 'global'

export type KnowledgeProviderConfig = {
  vectorStoreId?: string
  corpusScope?: string
  sourceDisplayMode?: 'answer_then_sources'
  maxRetryCount?: number
  sourceManifestPath?: string
}

export type KnowledgeProviderSelection = {
  scope: KnowledgeProviderScope
  providerProfile: KnowledgeProviderProfile
  enabled: boolean
  config: KnowledgeProviderConfig
}

function isEnabled(selection: KnowledgeProviderSelection | undefined) {
  return selection?.enabled === true
}

export function resolveKnowledgeProviderConfig(input: {
  demoOverride?: KnowledgeProviderSelection
  organizationSetting?: KnowledgeProviderSelection
  globalFallback?: KnowledgeProviderSelection
}): KnowledgeProviderSelection {
  if (isEnabled(input.demoOverride)) return input.demoOverride!
  if (isEnabled(input.organizationSetting)) return input.organizationSetting!
  return (
    input.globalFallback ?? {
      scope: 'global',
      providerProfile: 'supabase_rag',
      enabled: true,
      config: {},
    }
  )
}
