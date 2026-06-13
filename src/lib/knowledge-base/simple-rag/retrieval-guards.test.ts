import { describe, expect, it } from 'vitest'

import {
  answerViolatesOrganizationScope,
  buildSimpleRagRetryQuery,
  filterSimpleRagChunks,
} from './retrieval-guards'
import type { SimpleRagChunk } from './vector-search'

function chunk(id: string, content: string): SimpleRagChunk {
  return {
    id,
    fileId: `file_${id}`,
    filename: `${id}.md`,
    title: `${id} title`,
    score: 0.9,
    content,
  }
}

describe('simple RAG retrieval guards', () => {
  it('drops chunks that are scoped to a different university', () => {
    const result = filterSimpleRagChunks({
      chunks: [
        chunk('C1', 'Yüksek İhtisas Üniversitesi Tıp Fakültesi programları bulunmaktadır.'),
        chunk('C2', 'Ankara Yıldırım Beyazıt Üniversitesi Tıp Fakültesi törenine katılım oldu.'),
      ],
      organizationContext: 'Yüksek İhtisas Üniversitesi',
      latestUserMessage: 'Sağlık alanında hangi bölümler var?',
      standaloneQuery: 'Yüksek İhtisas Üniversitesi sağlık alanı program listesi',
    })

    expect(result.chunks.map((item) => item.id)).toEqual(['C1'])
    expect(result.dropped).toEqual([
      expect.objectContaining({
        id: 'C2',
        reason: 'other_organization',
        matchedText: 'Ankara Yıldırım Beyazıt Üniversitesi',
      }),
    ])
  })

  it('drops international fee evidence for generic domestic fee questions', () => {
    const result = filterSimpleRagChunks({
      chunks: [
        chunk('C1', 'Tıp Fakültesi (İngilizce) (Ücretli) 2025 Fiyat 720.000 TL.'),
        chunk('C2', 'International student fee for Medicine is 18.000 USD.'),
      ],
      organizationContext: 'Yüksek İhtisas Üniversitesi',
      latestUserMessage: 'İngilizce Tıp ücreti ne kadar?',
      standaloneQuery: 'Yüksek İhtisas Üniversitesi İngilizce Tıp öğrenim ücreti ücret tablosu',
    })

    expect(result.chunks.map((item) => item.id)).toEqual(['C1'])
    expect(result.dropped).toEqual([
      expect.objectContaining({ id: 'C2', reason: 'audience_mismatch' }),
    ])
  })

  it('allows international fee evidence when the user asks for that audience', () => {
    const result = filterSimpleRagChunks({
      chunks: [chunk('C1', 'International student fee for Medicine is 18.000 USD.')],
      organizationContext: 'Yüksek İhtisas Üniversitesi',
      latestUserMessage: 'YÖS İngilizce Tıp ücreti ne kadar?',
      standaloneQuery: 'Yüksek İhtisas Üniversitesi YÖS international Medicine tuition fee',
    })

    expect(result.chunks.map((item) => item.id)).toEqual(['C1'])
    expect(result.dropped).toEqual([])
  })

  it('flags final answers that name another university', () => {
    expect(
      answerViolatesOrganizationScope({
        answer: 'At Yıldız Technical University, admissions are based on merit.',
        organizationContext: 'Yüksek İhtisas Üniversitesi',
      })
    ).toMatchObject({
      violates: true,
      matchedText: expect.stringContaining('Yıldız Technical University'),
    })
  })

  it('builds a broader retry query for table facts without losing organization scope', () => {
    const query = buildSimpleRagRetryQuery({
      organizationContext: 'Yüksek İhtisas Üniversitesi',
      latestUserMessage: 'tıp ücret',
      standaloneQuery: 'Yüksek İhtisas Üniversitesi Tıp resmi öğrenim ücreti',
      responseLanguage: 'tr',
    })

    expect(query).toContain('Yüksek İhtisas Üniversitesi')
    expect(query).toContain('ücret tablosu')
    expect(query).toContain('tanıtım broşürü')
  })
})
