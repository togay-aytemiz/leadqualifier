import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { KnowledgeBaseEntry } from '@/lib/knowledge-base/actions'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({}),
}))

vi.mock('@/design', () => ({
  Button: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
  PageHeader: ({
    title,
    actions,
  }: {
    title: React.ReactNode
    actions?: React.ReactNode
  }) => (
    <div>
      <h1>{title}</h1>
      <div>{actions}</div>
    </div>
  ),
  ConfirmDialog: () => null,
}))

vi.mock('./KnowledgeTable', () => ({
  KnowledgeTable: () => <div data-testid="knowledge-table" />,
}))

vi.mock('./FolderCard', () => ({
  FolderCard: () => <div data-testid="folder-card" />,
}))

vi.mock('./FolderModal', () => ({
  FolderModal: () => null,
}))

vi.mock('./NewContentButton', () => ({
  NewContentButton: () => <button data-testid="new-content" />,
}))

vi.mock('./FolderActions', () => ({
  FolderActions: () => <div data-testid="folder-actions" />,
}))

vi.mock('@/lib/knowledge-base/actions', () => ({
  deleteKnowledgeBaseEntry: vi.fn(),
  createCollection: vi.fn(),
}))

import { KnowledgeContainer } from '@/app/[locale]/(dashboard)/knowledge/components/KnowledgeContainer'

const KNOWLEDGE_CONTAINER_PATH = path.resolve(
  process.cwd(),
  'src/app/[locale]/(dashboard)/knowledge/components/KnowledgeContainer.tsx'
)

function buildEntry(status: 'ready' | 'processing' | 'error' = 'ready'): KnowledgeBaseEntry {
  return {
    id: 'doc-1',
    organization_id: 'org-1',
    collection_id: null,
    title: 'Cekim detaylari',
    type: 'article',
    content: 'Detayli bilgi',
    status,
    created_at: '2026-04-07T10:00:00.000Z',
    updated_at: '2026-04-07T10:00:00.000Z',
  }
}

describe('KnowledgeContainer', () => {
  it('shows a processing helper banner while organization-level suggestion prep is still running', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeContainer
        initialEntries={[buildEntry('ready')]}
        initialCollections={[]}
        currentCollection={null}
        organizationId="org-1"
        aiSuggestionsEnabled
        initialPendingSuggestions={0}
        initialKnowledgeExtractionInProgress
      />
    )

    expect(markup).toContain('aiSuggestionsProcessingBannerTitle')
    expect(markup).toContain('aiSuggestionsProcessingBannerDescription')
    expect(markup).not.toContain('aiSuggestionsBannerCta')
  })

  it('shows the ready banner with review action after suggestions are pending', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeContainer
        initialEntries={[buildEntry('ready')]}
        initialCollections={[]}
        currentCollection={null}
        organizationId="org-1"
        aiSuggestionsEnabled
        initialPendingSuggestions={2}
      />
    )

    expect(markup).toContain('aiSuggestionsBannerTitle')
    expect(markup).toContain('aiSuggestionsBannerDescription')
    expect(markup).toContain('aiSuggestionsBannerCta')
  })

  it('does not refetch pending suggestions on mount when the server provided the initial count', () => {
    const source = fs.readFileSync(KNOWLEDGE_CONTAINER_PATH, 'utf8')

    expect(source).toContain('initialPendingSuggestions')
    expect(source).toContain(".on('postgres_changes'")
    expect(source).toContain("window.addEventListener('pending-suggestions-updated'")
    expect(source).not.toMatch(
      /useEffect\(\(\) => \{\s*if \(!organizationId \|\| !aiSuggestionsEnabled\) return\s*refreshPendingSuggestions\(\)\s*\}, \[aiSuggestionsEnabled, organizationId, refreshPendingSuggestions\]\)/
    )
  })
})
