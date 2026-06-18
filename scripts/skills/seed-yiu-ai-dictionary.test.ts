import { describe, expect, it } from 'vitest'

import { sanitizeAiDictionaryEntries } from '@/lib/ai/dictionary-core'
import { YIU_AI_DICTIONARY_ENTRIES } from './seed-yiu-ai-dictionary'

describe('YIU AI dictionary seed', () => {
  it('keeps dictionary terms unique and preserves contextual multiple meanings', () => {
    const entries = sanitizeAiDictionaryEntries(YIU_AI_DICTIONARY_ENTRIES)
    const terms = entries.map((entry) => entry.normalized_term)

    expect(new Set(terms).size).toBe(terms.length)
    expect(terms).toContain('ftr')
    expect(terms).toContain('sbf')
    expect(entries.find((entry) => entry.normalized_term === 'ftr')?.meanings).toEqual([
      'Fizyoterapi ve Rehabilitasyon',
      'Fizyoterapi ön lisans programı',
    ])
    expect(entries.find((entry) => entry.normalized_term === 'sbf')?.meanings).toEqual([
      'Sağlık Bilimleri Fakültesi',
      'Spor Bilimleri Fakültesi',
    ])
  })
})
