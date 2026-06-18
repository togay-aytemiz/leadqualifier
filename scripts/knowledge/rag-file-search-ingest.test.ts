import { describe, expect, it } from 'vitest'

import { buildVectorStoreCreateParams } from './rag-file-search-ingest'

describe('RAG File Search ingest configuration', () => {
  it('creates production candidate stores without expiration in persistent mode', () => {
    const params = buildVectorStoreCreateParams({
      persistent: true,
      story: 'clean-corpus',
      runId: 'run-1',
    })

    expect(params).not.toHaveProperty('expires_after')
    expect(params.metadata).toMatchObject({
      qualy_purpose: 'production_candidate',
      story: 'clean-corpus',
    })
  })

  it('keeps seven-day expiration for evaluation stores', () => {
    const params = buildVectorStoreCreateParams({
      persistent: false,
      story: 'eval-corpus',
      runId: 'run-2',
    })

    expect(params).toHaveProperty('expires_after', { anchor: 'last_active_at', days: 7 })
    expect(params.metadata).toMatchObject({ qualy_purpose: 'rag_eval' })
  })
})
