import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const CREATE_PAGE_PATH = path.resolve(
  process.cwd(),
  'src/app/[locale]/(dashboard)/knowledge/create/page.tsx'
)

describe('knowledge create page source', () => {
  it('awaits document creation before deciding between redirect and first-document guidance modal', () => {
    const source = fs.readFileSync(CREATE_PAGE_PATH, 'utf8')

    expect(source).toContain('const created = await createKnowledgeBaseEntry({')
    expect(source).not.toContain('const createPromise = createKnowledgeBaseEntry({')
    expect(source).toContain('created.showFirstDocumentGuidance')
    expect(source).toContain('setFirstDocumentGuidance(')
  })

  it('shows a first-document guidance modal with onboarding and business review routes', () => {
    const source = fs.readFileSync(CREATE_PAGE_PATH, 'utf8')

    expect(source).toContain('<Modal')
    expect(source).toContain("t('firstDocumentGuidance.title')")
    expect(source).toContain("t('firstDocumentGuidance.description')")
    expect(source).toContain("t('firstDocumentGuidance.items.businessProfile')")
    expect(source).toContain("t('firstDocumentGuidance.items.requiredFields')")
    expect(source).toContain("t('firstDocumentGuidance.items.serviceCatalog')")
    expect(source).toContain("t('firstDocumentGuidance.actions.goToOnboarding')")
    expect(source).toContain("t('firstDocumentGuidance.actions.reviewBusiness')")
    expect(source).toContain("handleNavigateAfterFirstDocument('/onboarding')")
    expect(source).toContain("handleNavigateAfterFirstDocument('/settings/organization?focus=organization-details')")
  })

  it('persists the first-document guidance locally so it only appears once per workspace in the browser', () => {
    const source = fs.readFileSync(CREATE_PAGE_PATH, 'utf8')

    expect(source).toContain('knowledge:first-document-guidance')
    expect(source).toContain('window.localStorage.getItem(')
    expect(source).toContain('window.localStorage.setItem(')
  })
})
