import { describe, expect, it } from 'vitest'

import {
  WORKSPACE_INTRO_STORAGE_VERSION,
  buildWorkspaceIntroStorageKey,
} from '@/lib/workspace-intro'

describe('buildWorkspaceIntroStorageKey', () => {
  it('builds a versioned storage key scoped by user, organization, and workspace surface', () => {
    expect(WORKSPACE_INTRO_STORAGE_VERSION).toBe('v1')
    expect(
      buildWorkspaceIntroStorageKey({
        userId: 'user-123',
        organizationId: 'org-456',
        surface: 'calendar',
      })
    ).toBe('qualy:workspace-intro:v1:user-123:org-456:calendar')
    expect(
      buildWorkspaceIntroStorageKey({
        userId: 'user-123',
        organizationId: 'org-456',
        surface: 'simulator',
      })
    ).toBe('qualy:workspace-intro:v1:user-123:org-456:simulator')
  })
})
