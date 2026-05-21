import { describe, expect, it } from 'vitest'
import {
  isLiveQaConversation,
  normalizeCleanupArgs,
  QA_CONTACT_NAME_PREFIX,
  QA_CONTACT_PHONE_PREFIX,
  QA_TAGS,
} from './cleanup-live-qa-conversations.mjs'

describe('cleanup-live-qa-conversations helpers', () => {
  it('matches only tagged or prefixed live QA conversations', () => {
    expect(
      isLiveQaConversation({
        contact_name: 'Codex YIU Demo QA 24',
        contact_phone: 'codex-live-yiu-demo-qa-2026-05-20-24',
        tags: [],
      })
    ).toBe(true)

    expect(
      isLiveQaConversation({
        contact_name: 'Real Student',
        contact_phone: '+905551112233',
        tags: ['codex_yiu_demo_qa'],
      })
    ).toBe(true)

    expect(
      isLiveQaConversation({
        contact_name: 'Codex Live QA 10',
        contact_phone: 'codex-live-rag-qa-2026-05-20T10-43-33-182Z-10',
        tags: [],
      })
    ).toBe(true)

    expect(
      isLiveQaConversation({
        contact_name: 'Togay Aytemiz',
        contact_phone: '6418397365',
        tags: ['vip'],
      })
    ).toBe(false)
  })

  it('keeps destructive cleanup in dry-run mode unless --execute is passed', () => {
    expect(normalizeCleanupArgs([])).toMatchObject({ execute: false })
    expect(normalizeCleanupArgs(['--execute'])).toMatchObject({ execute: true })
  })

  it('exports the exact cleanup guard markers', () => {
    expect(QA_TAGS).toEqual(['codex_live_qa', 'codex_yiu_demo_qa'])
    expect(QA_CONTACT_NAME_PREFIX).toBe('Codex YIU Demo QA')
    expect(QA_CONTACT_PHONE_PREFIX).toBe('codex-live-yiu-demo-qa-')
  })
})
