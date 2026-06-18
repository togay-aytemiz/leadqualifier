import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buildYiuProgramFactIntents,
  PROGRAM_REPLACED_BASE_SLUGS,
  renderYiuProgramFactSkillPack,
} from './yiu-program-fact-skills'

const brochurePath = path.join(
  process.cwd(),
  'src/lib/knowledge-base/provider-data/yiu-2025-brochure-verified.md'
)

describe('YIU program fact Skills', () => {
  it('builds one complete Skill for each canonical brochure program', async () => {
    const intents = buildYiuProgramFactIntents(await readFile(brochurePath, 'utf8'))

    expect(intents).toHaveLength(26)
    expect(new Set(intents.map((intent) => intent.slug)).size).toBe(26)
    expect(intents.every((intent) => intent.triggerExamples.length >= 8)).toBe(true)
    expect(intents.every((intent) => intent.responseText.length > 200)).toBe(true)
  })

  it('keeps exact brochure facts and the confirmed TTP label correction', async () => {
    const intents = buildYiuProgramFactIntents(await readFile(brochurePath, 'utf8'))
    const bySlug = new Map(intents.map((intent) => [intent.slug, intent.responseText]))

    expect(bySlug.get('tip_turkce_program_bilgileri')).toContain(
      'Ücretli: 75 kontenjan, 720.000 TL; 2024 taban puanı 453,467, başarı sırası 36.073.'
    )
    expect(bySlug.get('dil_konusma_terapisi_ucret_kontenjan')).toContain(
      '%50 İndirimli: 40 kontenjan, 245.000 TL; 2024 taban puanı 296,474, başarı sırası 277.071.'
    )
    expect(bySlug.get('grafik_tasarim_program_bilgileri')).toContain(
      'Ücretli: 7 kontenjan, 300.000 TL.'
    )
    expect(bySlug.get('tibbi_tanitim_pazarlama_ucret_kontenjan')).toContain(
      'Ücretli: 4 kontenjan, 330.000 TL; 2024 taban puanı 309,532, başarı sırası 767.115.'
    )
    expect(bySlug.get('tibbi_tanitim_pazarlama_ucret_kontenjan')).not.toContain(
      'Burslu: 4 kontenjan'
    )
  })

  it('uses existing one-program Skill identities and replaces overlapping group Skills', async () => {
    const intents = buildYiuProgramFactIntents(await readFile(brochurePath, 'utf8'))
    const titleBySlug = new Map(intents.map((intent) => [intent.slug, intent.title]))

    expect(titleBySlug.get('hemsirelik_ucret_kontenjan')).toBe(
      'YİÜ Intent - 29 hemsirelik_ucret_kontenjan'
    )
    expect(titleBySlug.get('anestezi_ucret_kontenjan')).toBe(
      'YİÜ Intent - 37 anestezi_ucret_kontenjan'
    )
    expect(PROGRAM_REPLACED_BASE_SLUGS).toContain('myo_ucretler')
    expect(PROGRAM_REPLACED_BASE_SLUGS).toContain('ergoterapi_ebelik_ucret_kontenjan')
  })

  it('renders a parseable customer-facing pack without source-clerk language', async () => {
    const intents = buildYiuProgramFactIntents(await readFile(brochurePath, 'utf8'))
    const markdown = renderYiuProgramFactSkillPack(intents)

    expect(markdown).toContain('## 20. tip_turkce_program_bilgileri')
    expect(markdown).toContain('## 82. grafik_tasarim_program_bilgileri')
    expect(intents.map((intent) => intent.responseText).join('\n')).not.toMatch(
      /\b(kaynakta|broşürde|tabloda|dokümanda|satırda)\b/iu
    )
  })
})
