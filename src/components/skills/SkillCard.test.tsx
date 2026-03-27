import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { Skill } from '@/types/database'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
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

vi.mock('@/lib/skills/actions', () => ({
  toggleSkill: vi.fn(),
  deleteSkill: vi.fn(),
}))

import { SkillCard } from '@/components/skills/SkillCard'

function buildSkill(): Skill {
  return {
    id: 'skill-1',
    organization_id: 'org-1',
    title: 'Demo skill',
    trigger_examples: ['hello', 'book me'],
    response_text: 'Thanks for reaching out',
    enabled: true,
    requires_human_handover: false,
    created_at: '2026-03-27T00:00:00.000Z',
    updated_at: '2026-03-27T00:00:00.000Z',
  }
}

describe('SkillCard', () => {
  it('renders the edit action as a standalone link', () => {
    const markup = renderToStaticMarkup(<SkillCard skill={buildSkill()} />)

    expect(markup).toContain('href="/skills/skill-1/edit"')
    expect(markup).not.toContain('<a href="/skills/skill-1/edit"><button')
  })
})
