export type WorkspaceIntroSurface = 'calendar' | 'simulator'

export const WORKSPACE_INTRO_STORAGE_VERSION = 'v1'

export function buildWorkspaceIntroStorageKey({
  userId,
  organizationId,
  surface,
}: {
  userId: string
  organizationId: string
  surface: WorkspaceIntroSurface
}) {
  return `qualy:workspace-intro:${WORKSPACE_INTRO_STORAGE_VERSION}:${userId}:${organizationId}:${surface}`
}
