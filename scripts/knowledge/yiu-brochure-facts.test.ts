import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseYiuBrochureFacts } from './yiu-brochure-facts'

describe('YIU verified brochure facts', () => {
  it('parses representative rows from every price table and preserves the known conflict', async () => {
    const markdown = await readFile(
      path.join(
        process.cwd(),
        'src/lib/knowledge-base/provider-data/yiu-2025-brochure-verified.md'
      ),
      'utf8'
    )
    const facts = parseYiuBrochureFacts(markdown)

    expect(facts['Tıp Fakültesi|Ücretli']).toMatchObject({ quota: 75, priceTl: 720000 })
    expect(facts['Hemşirelik|Ücretli']).toMatchObject({ quota: 2, priceTl: 490000 })
    expect(facts['Antrenörlük Eğitimi|Burslu']).toMatchObject({ quota: 6, priceTl: null })
    expect(facts['Anestezi|Burslu']).toMatchObject({ quota: 10, priceTl: null })
    expect(facts['Grafik Tasarım|%50 İndirimli']).toMatchObject({
      quota: 27,
      priceTl: 150000,
    })
    expect(facts['Tıbbi Tanıtım ve Pazarlama|Burslu']).toMatchObject({
      quota: 4,
      priceTl: 330000,
      sourceConflict: true,
    })
  })

  it('keeps 2025 facts separate from 2024 placement results', async () => {
    const markdown = await readFile(
      path.join(
        process.cwd(),
        'src/lib/knowledge-base/provider-data/yiu-2025-brochure-verified.md'
      ),
      'utf8'
    )
    const facts = parseYiuBrochureFacts(markdown)

    expect(facts['Hemşirelik|Ücretli']).toMatchObject({
      quotaYear: 2025,
      priceYear: 2025,
      placementYear: 2024,
      priorRank: 313101,
      priorScore: 286.806,
    })
    expect(facts['Ergoterapi|Ücretli']).toMatchObject({
      priorRank: null,
      priorScore: null,
    })
  })
})
