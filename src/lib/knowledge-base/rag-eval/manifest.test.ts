import { describe, expect, it } from 'vitest'
import { parseBenchmarkCases, parseStoryFileManifest } from './manifest'

describe('rag eval manifests', () => {
  it('parses benchmark cases and rejects empty case lists', () => {
    expect(() => parseBenchmarkCases('[]')).toThrow('at least one benchmark case')

    expect(
      parseBenchmarkCases(
        JSON.stringify([
          {
            id: 'case-1',
            question: 'Soru?',
            language: 'tr',
            category: 'policy_pdf',
            expectedAnswerTerms: ['cevap'],
            expectedAnyAnswerTermGroups: [['alternatif cevap', 'cevap']],
            expectedAnySourceTermGroups: [['kaynak a', 'kaynak b']],
            preferredSourceTerms: ['tercih edilen kaynak'],
            expectedAnyPreferredSourceTermGroups: [['tercih a', 'tercih b']],
            followupRequired: true,
            expectedFollowupTerms: ['burslu'],
            expectedAnyFollowupTermGroups: [['%50', 'indirimli']],
          },
        ])
      )
    ).toMatchObject([
      {
        id: 'case-1',
        expectedAnyAnswerTermGroups: [['alternatif cevap', 'cevap']],
        expectedAnySourceTermGroups: [['kaynak a', 'kaynak b']],
        preferredSourceTerms: ['tercih edilen kaynak'],
        expectedAnyPreferredSourceTermGroups: [['tercih a', 'tercih b']],
        followupRequired: true,
        expectedFollowupTerms: ['burslu'],
        expectedAnyFollowupTermGroups: [['%50', 'indirimli']],
      },
    ])
  })

  it('rejects benchmark cases without core fields', () => {
    expect(() =>
      parseBenchmarkCases(
        JSON.stringify([
          {
            id: 'case-1',
            question: '',
            language: 'tr',
            category: 'policy_pdf',
          },
        ])
      )
    ).toThrow('question')
  })

  it('rejects story manifests that try to include a whole TMP folder', () => {
    expect(() =>
      parseStoryFileManifest(
        JSON.stringify({
          story: 'bulk',
          files: [{ label: 'all', localPath: 'tmp/' }],
        }),
        '/repo'
      )
    ).toThrow('exact file path')
  })

  it('parses only explicit approved file paths', () => {
    const parsed = parseStoryFileManifest(
      JSON.stringify({
        story: 'health-report',
        files: [
          {
            label: 'Mazeret sınavı yönergesi',
            localPath: 'tmp/approved/mazeret.pdf',
            sourceUrl: 'https://example.edu.tr/mazeret.pdf',
            sourcePage: 'https://example.edu.tr/mevzuat',
            sourceGroup: 'policy',
            contentType: 'approved_pdf',
          },
        ],
      }),
      '/repo'
    )

    expect(parsed.files[0]).toMatchObject({
      label: 'Mazeret sınavı yönergesi',
      localPath: '/repo/tmp/approved/mazeret.pdf',
      sourceUrl: 'https://example.edu.tr/mazeret.pdf',
      sourcePage: 'https://example.edu.tr/mevzuat',
      sourceGroup: 'policy',
      contentType: 'approved_pdf',
    })
  })
})
