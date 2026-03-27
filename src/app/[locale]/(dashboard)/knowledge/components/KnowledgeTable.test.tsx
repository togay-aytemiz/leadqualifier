import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { KnowledgeBaseEntry } from '@/lib/knowledge-base/actions'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

import { KnowledgeTable } from '@/app/[locale]/(dashboard)/knowledge/components/KnowledgeTable'

function buildEntry(): KnowledgeBaseEntry {
  return {
    id: 'article-1',
    organization_id: 'org-1',
    collection_id: null,
    title: 'Pricing guide',
    type: 'article',
    content: 'Full pricing overview',
    status: 'ready',
    created_at: '2026-03-27T00:00:00.000Z',
    updated_at: '2026-03-27T00:00:00.000Z',
  }
}

describe('KnowledgeTable', () => {
  it('renders entry links in both layouts', () => {
    const markup = renderToStaticMarkup(<KnowledgeTable entries={[buildEntry()]} />)

    expect(markup).toContain('href="/knowledge/article-1"')
  })

  it('no longer keeps the table row itself clickable', () => {
    const source = readFileSync(new URL('./KnowledgeTable.tsx', import.meta.url), 'utf8')

    expect(source).not.toContain('onClick={() => router.push(`/knowledge/${entry.id}`)}')
    expect(source).not.toContain('className="group cursor-pointer hover:bg-gray-50 transition-colors"')
  })
})
