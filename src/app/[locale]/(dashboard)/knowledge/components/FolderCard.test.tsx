import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('./FolderActions', () => ({
  FolderActions: ({ trigger }: { trigger?: React.ReactNode }) => <>{trigger ?? null}</>,
}))

import { FolderCard } from '@/app/[locale]/(dashboard)/knowledge/components/FolderCard'

describe('FolderCard', () => {
  it('renders the folder destination as a standalone link', () => {
    const markup = renderToStaticMarkup(
      <FolderCard id="folder-1" name="Science" count={3} />
    )

    expect(markup).toContain('href="/knowledge?collectionId=folder-1"')
    expect(markup).not.toContain('<a href="/knowledge?collectionId=folder-1"><button')
  })
})
