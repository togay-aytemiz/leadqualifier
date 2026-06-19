import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { auditYiuIntentSkillPack } from './audit-yiu-intent-skill-pack'
import { buildYiuActiveIntentUnion, chunkItems } from './push-yiu-intent-skill-pack'

const packPath = path.join(
  process.cwd(),
  'docs/evaluations/yiu-intent-skill-pack-v2-2026-06-13.md'
)
const brochurePath = path.join(
  process.cwd(),
  'src/lib/knowledge-base/provider-data/yiu-2025-brochure-verified.md'
)

describe('YIU intent Skill pack audit', () => {
  it('chunks large embedding writes into bounded inserts', () => {
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(() => chunkItems([1], 0)).toThrow('positive integer')
  })

  it('keeps brochure-derived answers aligned with verified 2025 facts', async () => {
    const intents = buildYiuActiveIntentUnion(
      await readFile(packPath, 'utf8'),
      await readFile(brochurePath, 'utf8')
    )
    const bySlug = new Map(intents.map((intent) => [intent.slug, intent]))
    const skill = (slug: string) => bySlug.get(slug)?.responseText ?? ''

    expect(skill('hemsirelik_ucret_kontenjan')).toContain(
      'Ücretli: 2 kontenjan, 490.000 TL'
    )
    expect(skill('anestezi_ucret_kontenjan')).toContain(
      'Ücretli: 10 kontenjan, 330.000 TL'
    )
    expect(skill('ameliyathane_hizmetleri_ucret_kontenjan')).toContain(
      'Burslu: 10 kontenjan'
    )
    expect(skill('ergoterapi_program_bilgileri')).toContain(
      'Bu program için 2024 taban puanı ve başarı sırası belirtilmiyor.'
    )
    expect(skill('biyomedikal_cihaz_teknolojisi_program_bilgileri')).toContain(
      'Ücretli: 5 kontenjan, 330.000 TL'
    )
    expect(skill('tibbi_tanitim_pazarlama_ucret_kontenjan')).toContain(
      'Ücretli: 4 kontenjan, 330.000 TL'
    )
  })

  it('has no duplicate triggers or source-clerk language in customer answers', async () => {
    const audit = auditYiuIntentSkillPack(
      await readFile(packPath, 'utf8'),
      await readFile(brochurePath, 'utf8')
    )
    expect(audit.intentCount).toBe(70)
    expect(audit.duplicateTriggers).toEqual([])
    expect(audit.sourceClerkResponses).toEqual([])
    expect(audit.missingRoutingDescriptions).toEqual([])
    expect(audit.missingCoverageFacets).toEqual([])
    expect(audit.programScopeLeaks).toEqual([])
    expect(audit.knownFactMismatches).toEqual([])
  })
})
