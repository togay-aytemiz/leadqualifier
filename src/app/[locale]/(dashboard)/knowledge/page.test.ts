import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const KNOWLEDGE_PAGE_PATH = path.resolve(
  process.cwd(),
  'src/app/[locale]/(dashboard)/knowledge/page.tsx'
)

describe('knowledge page source', () => {
  it('loads organization-wide processing state for the suggestions banner helper', () => {
    const source = fs.readFileSync(KNOWLEDGE_PAGE_PATH, 'utf8')

    expect(source).toContain(".from('knowledge_documents')")
    expect(source).toContain(".eq('status', 'processing')")
    expect(source).toContain('initialKnowledgeExtractionInProgress=')
  })
})
