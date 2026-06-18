import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { auditYiuIntentSkillPack } from './audit-yiu-intent-skill-pack'
import { chunkItems, parseIntentPack } from './push-yiu-intent-skill-pack'

const packPath = path.join(
  process.cwd(),
  'docs/evaluations/yiu-intent-skill-pack-v2-2026-06-13.md'
)

describe('YIU intent Skill pack audit', () => {
  it('chunks large embedding writes into bounded inserts', () => {
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(() => chunkItems([1], 0)).toThrow('positive integer')
  })

  it('keeps brochure-derived answers aligned with verified 2025 facts', async () => {
    const intents = parseIntentPack(await readFile(packPath, 'utf8'))
    const bySlug = new Map(intents.map((intent) => [intent.slug, intent]))
    const skill = (slug: string) => bySlug.get(slug)?.responseText ?? ''

    expect(skill('hemsirelik_ucret_kontenjan')).toContain(
      'Hemşirelik (Ücretli): kontenjan 2, ücret 490.000 TL'
    )
    expect(skill('anestezi_ucret_kontenjan')).toContain(
      'Anestezi (Ücretli): kontenjan 10'
    )
    expect(skill('ameliyathane_hizmetleri_ucret_kontenjan')).toContain(
      'Ameliyathane Hizmetleri (Burslu): kontenjan 10'
    )
    expect(skill('ergoterapi_ebelik_ucret_kontenjan')).not.toMatch(/2024 taban puanı/)
    expect(skill('shmyo_diger_programlar_ucret_kontenjan')).toContain(
      'Biyomedikal Cihaz Teknolojisi: ücretli kontenjan 5'
    )
    expect(skill('tibbi_tanitim_pazarlama_tutarsizlik')).not.toContain(
      'Tıbbi Tanıtım ve Pazarlama (Ücretli)'
    )
  })

  it('has no duplicate triggers or source-clerk language in customer answers', async () => {
    const audit = auditYiuIntentSkillPack(await readFile(packPath, 'utf8'))
    expect(audit.intentCount).toBeGreaterThanOrEqual(50)
    expect(audit.duplicateTriggers).toEqual([])
    expect(audit.sourceClerkResponses).toEqual([])
    expect(audit.knownFactMismatches).toEqual([])
  })
})
