import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const LEADS_TABLE_PATH = path.resolve(process.cwd(), 'src/components/leads/LeadsTable.tsx')
const LEAD_SEARCH_PATH = path.resolve(process.cwd(), 'src/components/leads/LeadSearch.tsx')

describe('leads accessibility source guards', () => {
  it('gives lead search an accessible name and hides the decorative icon', () => {
    const source = fs.readFileSync(LEAD_SEARCH_PATH, 'utf8')

    expect(source).toContain("aria-label={t('searchAction')}")
    expect(source).toContain('aria-hidden={true}')
  })

  it('uses accessible sort buttons and scoped table headers', () => {
    const source = fs.readFileSync(LEADS_TABLE_PATH, 'utf8')

    expect(source).toContain('scope="col"')
    expect(source).toContain('aria-sort=')
    expect(source).toContain("aria-label={resolveSortLabel(col)}")
    expect(source).toContain('type="button"')
  })

  it('names clickable mobile and desktop lead rows for screen readers', () => {
    const source = fs.readFileSync(LEADS_TABLE_PATH, 'utf8')

    expect(source).toContain('resolveLeadRowLabel(lead)')
    expect(source).toContain('aria-label={resolveLeadRowLabel(lead)}')
  })
})
