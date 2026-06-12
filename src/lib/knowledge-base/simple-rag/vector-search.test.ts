import { describe, expect, it, vi } from 'vitest'

import { searchSimpleRagVectorStore } from './vector-search'

describe('searchSimpleRagVectorStore', () => {
  it('sends only the standalone query to direct vector store search', async () => {
    const search = vi.fn(async () => ({
      data: [
        {
          file_id: 'file_1',
          filename: 'medicine.md',
          score: 0.91,
          attributes: null,
          content: [{ type: 'text' as const, text: 'İngilizce Tıp programı ücreti 720.000 TL.' }],
        },
      ],
    }))

    const result = await searchSimpleRagVectorStore({
      client: { vectorStores: { search } },
      vectorStoreId: 'vs_yiu',
      standaloneQuery: 'İngilizce Tıp programının ücreti nedir?',
      citationSourcesByFilename: {
        'medicine.md': {
          title: 'Tıp Ücretleri',
          url: 'https://example.edu.tr/medicine.pdf',
        },
      },
    })

    expect(search).toHaveBeenCalledOnce()
    expect(search).toHaveBeenCalledWith('vs_yiu', {
      query: 'İngilizce Tıp programının ücreti nedir?',
      rewrite_query: false,
      max_num_results: 12,
      ranking_options: { ranker: 'auto', score_threshold: 0.1 },
    })
    expect(result.chunks).toEqual([
      {
        id: 'C1',
        fileId: 'file_1',
        filename: 'medicine.md',
        title: 'Tıp Ücretleri',
        url: 'https://example.edu.tr/medicine.pdf',
        score: 0.91,
        content: 'İngilizce Tıp programı ücreti 720.000 TL.',
      },
    ])
  })

  it('deduplicates identical file chunks while preserving ranking order', async () => {
    const search = vi.fn(async () => ({
      data: [
        {
          file_id: 'file_1',
          filename: 'campus.md',
          score: 0.93,
          attributes: null,
          content: [{ type: 'text' as const, text: '  Kampüs Ankara adresindedir.  ' }],
        },
        {
          file_id: 'file_1',
          filename: 'campus.md',
          score: 0.82,
          attributes: null,
          content: [{ type: 'text' as const, text: 'Kampüs Ankara adresindedir.' }],
        },
        {
          file_id: 'file_2',
          filename: 'contact.md',
          score: 0.76,
          attributes: null,
          content: [{ type: 'text' as const, text: 'Telefon numarası kaynakta yer alır.' }],
        },
      ],
    }))

    const result = await searchSimpleRagVectorStore({
      client: { vectorStores: { search } },
      vectorStoreId: 'vs_yiu',
      standaloneQuery: 'Kampüs nerede?',
    })

    expect(result.chunks.map((chunk) => chunk.id)).toEqual(['C1', 'C2'])
    expect(result.chunks.map((chunk) => chunk.score)).toEqual([0.93, 0.76])
  })
})
