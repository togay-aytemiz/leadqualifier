import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sanitizeAiDictionaryEntries } from '@/lib/ai/dictionary-core'
import { seedYiuAiDictionary, YIU_AI_DICTIONARY_ENTRIES } from './seed-yiu-ai-dictionary'

const upsertMock = vi.hoisted(() => vi.fn(async () => ({ error: null })))
const dictionaryTableMock = vi.hoisted(() => ({ upsert: upsertMock }))
const channelSingleMock = vi.hoisted(() => vi.fn(async () => ({
  data: {
    organization_id: '50102447-4bb2-4bd5-a332-fb721a3c7949',
    display_name: 'YİÜ Tanıtım Günleri 2026',
    slug: 'yiu-tanitim-gunleri-2026',
  },
  error: null,
})))
const channelTableMock = vi.hoisted(() => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({ single: channelSingleMock })),
  })),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => (
      table === 'demo_chat_channels' ? channelTableMock : dictionaryTableMock
    )),
  })),
}))

describe('YIU AI dictionary seed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test')
  })

  it('keeps dictionary terms unique and maps brochure program abbreviations precisely', () => {
    const entries = sanitizeAiDictionaryEntries(YIU_AI_DICTIONARY_ENTRIES)
    const terms = entries.map((entry) => entry.normalized_term)

    expect(new Set(terms).size).toBe(terms.length)
    expect(terms).toContain('ftr')
    expect(terms).toContain('fzt')
    expect(terms).toContain('tlt')
    expect(terms).toContain('tds')
    expect(terms).toContain('ttp')
    expect(terms).toContain('tvit')
    expect(terms).toContain('tst')
    expect(terms).toContain('bct')
    expect(terms).toContain('iay')
    expect(terms).toContain('paramedik')
    expect(terms).toContain('sbf')
    expect(entries.find((entry) => entry.normalized_term === 'ftr')?.meanings).toEqual([
      'Fizyoterapi ve Rehabilitasyon',
    ])
    expect(entries.find((entry) => entry.normalized_term === 'fzt')?.meanings).toEqual([
      'Fizyoterapi ön lisans programı',
    ])
    expect(entries.find((entry) => entry.normalized_term === 'tlt')?.meanings).toEqual([
      'Tıbbi Laboratuvar Teknikleri',
    ])
    expect(entries.find((entry) => entry.normalized_term === 'sbf')?.meanings).toEqual([
      'Sağlık Bilimleri Fakültesi',
      'Spor Bilimleri Fakültesi',
    ])
  })

  it('upserts managed seed terms without deleting tenant-added dictionary entries', async () => {
    const result = await seedYiuAiDictionary()

    expect(result.entryCount).toBe(sanitizeAiDictionaryEntries(YIU_AI_DICTIONARY_ENTRIES).length)
    expect(upsertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          organization_id: '50102447-4bb2-4bd5-a332-fb721a3c7949',
          normalized_term: 'ftr',
          meanings: ['Fizyoterapi ve Rehabilitasyon'],
        }),
      ]),
      { onConflict: 'organization_id,normalized_term' }
    )
    expect(dictionaryTableMock).not.toHaveProperty('delete')
  })
})
